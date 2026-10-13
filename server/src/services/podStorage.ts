import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import multer from 'multer';
import { UnsupportedUploadTypeError } from '../middleware/uploadErrors';
import { ATTACHMENT_MIME_TYPES, MAX_ATTACHMENT_BYTES } from './attachmentRules';

// The bytes to store: a file already on disk (an upload), or a small buffer
// produced in-process (seed fixtures).
export type PodFile = { originalName: string; mimeType: string; size: number } & ({ path: string } | { buffer: Buffer });


export function podStorageKeys(): Promise<string[]> {
  return fs.promises.readdir(uploadDir).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
}

export interface PodStorage {
  save(file: PodFile): Promise<string>;
  read(storageKey: string): Promise<Buffer>;
  // Streams the stored bytes; rejects if the object does not exist.
  open(storageKey: string): Promise<Readable>;
  remove(storageKey: string): Promise<void>;
}

// SEC-07: whole files are only ever held in memory a few at a time. Uploads
// arrive on disk, and every step that must load one fully (content checks,
// photo verification) takes a slot here, so peak memory is a fixed multiple of
// the single-file cap however many requests are in flight. Callers must not
// wait on a database lock while holding a slot.
export const IN_MEMORY_FILE_SLOTS = 3;
let filesInMemory = 0;
const waitingForSlot: (() => void)[] = [];

export async function withFileInMemory<T>(work: () => Promise<T>): Promise<T> {
  if (filesInMemory >= IN_MEMORY_FILE_SLOTS) await new Promise<void>(resolve => waitingForSlot.push(resolve));
  else filesInMemory++;
  try {
    return await work();
  } finally {
    // Hand the slot straight to the next waiter, if any.
    const next = waitingForSlot.shift();
    if (next) next(); else filesInMemory--;
  }
}

const uploadDir = path.resolve(process.env.POD_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'pod'));

function localPathFor(storageKey: string) {
  const resolved = path.resolve(uploadDir, storageKey);
  if (!resolved.startsWith(`${uploadDir}${path.sep}`)) throw new Error('Invalid attachment path');
  return resolved;
}

const localPodStorage: PodStorage = {
  async save(file) {
    await fs.promises.mkdir(uploadDir, { recursive: true });
    const storageKey = `${crypto.randomUUID()}${path.extname(file.originalName).toLowerCase()}`;
    if ('path' in file) await fs.promises.copyFile(file.path, localPathFor(storageKey));
    else await fs.promises.writeFile(localPathFor(storageKey), file.buffer);
    return storageKey;
  },
  read(storageKey) {
    return fs.promises.readFile(localPathFor(storageKey));
  },
  async open(storageKey) {
    const stream = fs.createReadStream(localPathFor(storageKey));
    await once(stream, 'open');
    return stream;
  },
  async remove(storageKey) {
    await fs.promises.unlink(localPathFor(storageKey)).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
  }
};

function supabaseStorage(): PodStorage {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'pod';
  if (!url || !key) throw new Error('Supabase POD storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  const endpoint = `${url}/storage/v1/object/${encodeURIComponent(bucket)}`;
  const headers = { Authorization: `Bearer ${key}`, apikey: key };

  return {
    async save(file) {
      const storageKey = `${crypto.randomUUID()}${path.extname(file.originalName).toLowerCase()}`;
      const response = await fetch(`${endpoint}/${encodeURIComponent(storageKey)}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': file.mimeType || 'application/octet-stream', 'x-upsert': 'false' },
        // A file-backed Blob is sent from disk without loading it into memory.
        body: 'path' in file ? await fs.openAsBlob(file.path) : file.buffer
      });
      if (!response.ok) throw new Error(`Supabase storage upload failed (${response.status})`);
      return storageKey;
    },
    async read(storageKey) {
      const response = await fetch(`${endpoint}/${encodeURIComponent(storageKey)}`, { headers });
      if (!response.ok) throw new Error(`Supabase storage download failed (${response.status})`);
      return Buffer.from(await response.arrayBuffer());
    },
    async open(storageKey) {
      const response = await fetch(`${endpoint}/${encodeURIComponent(storageKey)}`, { headers });
      if (!response.ok || !response.body) throw new Error(`Supabase storage download failed (${response.status})`);
      return Readable.fromWeb(response.body as any);
    },
    async remove(storageKey) {
      const response = await fetch(`${endpoint}`, {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify([storageKey])
      });
      if (!response.ok && response.status !== 404) throw new Error(`Supabase storage delete failed (${response.status})`);
    }
  };
}

export const podStorage: PodStorage = process.env.POD_STORAGE_PROVIDER === 'supabase'
  ? supabaseStorage()
  : localPodStorage;

// SEC-07: uploads are written to a private quarantine folder, never buffered
// in memory. A file stays here only while its request is validated and copied
// to storage; the route deletes it whatever the outcome.
const quarantineDir = path.resolve(process.env.POD_TEMP_DIR || path.join(os.tmpdir(), 'mg-pod-uploads'));

export async function discardUpload(filePath: string | undefined): Promise<void> {
  if (!filePath) return;
  await fs.promises.unlink(filePath).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('[POD] Failed to remove a quarantined upload', error);
  });
}

// Files left behind by a crash or restart mid-upload. Run at startup.
export async function removeStaleUploads(olderThanMs = 60 * 60 * 1000): Promise<number> {
  const names = await fs.promises.readdir(quarantineDir).catch(() => [] as string[]);
  let removed = 0;
  for (const name of names) {
    const filePath = path.join(quarantineDir, name);
    const stats = await fs.promises.stat(filePath).catch(() => null);
    if (stats?.isFile() && Date.now() - stats.mtimeMs > olderThanMs) {
      await discardUpload(filePath);
      removed++;
    }
  }
  return removed;
}

export const podUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      fs.mkdir(quarantineDir, { recursive: true, mode: 0o700 }, error => callback(error, quarantineDir));
    },
    // Never derived from the client's file name.
    filename: (_req, _file, callback) => callback(null, crypto.randomUUID()),
  }),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
  // Cheap early rejection by declared name and type, before the body is read.
  // The bytes themselves are verified by the route once the file is on disk.
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (ATTACHMENT_MIME_TYPES[extension] === file.mimetype.toLowerCase()) {
      return callback(null, true);
    }
    callback(new UnsupportedUploadTypeError());
  }
});
