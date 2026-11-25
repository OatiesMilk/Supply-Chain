import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { Readable } from 'node:stream';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { discardUpload } from './podStorage';
import {
  isValidSignatureStorageKey, MAX_SIGNATURE_BYTES, SIGNATURE_MIME_TYPES, SIGNATURE_TOO_LARGE_ERROR, UNSUPPORTED_SIGNATURE_TYPE,
  type SignatureMimeType,
} from './signatureRules';

// Feature 5a: user digital signatures live apart from POD attachments, so the
// POD orphan reconciler (prisma/reconcile-pod-files.ts lists uploads/pod) can
// never treat a signature as an orphaned attachment.

export interface SignatureStorage {
  save(storageKey: string, file: { path: string } | { buffer: Buffer }, mimeType: SignatureMimeType): Promise<void>;
  open(storageKey: string): Promise<Readable>;
  read(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
}

export type SignatureStorageProvider = 'local' | 'supabase';

export function signatureStorageProvider(env: NodeJS.ProcessEnv = process.env): SignatureStorageProvider {
  const configured = (env.SIGNATURE_STORAGE_PROVIDER ?? env.POD_STORAGE_PROVIDER)?.trim().toLowerCase();
  if (!configured) return 'local';
  if (configured === 'local' || configured === 'supabase') return configured;
  throw new Error('SIGNATURE_STORAGE_PROVIDER must be "local" or "supabase"');
}

export function signatureUploadDir(env: NodeJS.ProcessEnv = process.env) {
  return path.resolve(env.SIGNATURE_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'signatures'));
}

const signatureDir = signatureUploadDir();

function assertKey(storageKey: string) {
  if (!isValidSignatureStorageKey(storageKey)) throw new Error('Invalid signature storage key');
}

export function localSignaturePath(storageKey: string, directory = signatureDir) {
  assertKey(storageKey);
  const resolved = path.resolve(directory, storageKey);
  if (!resolved.startsWith(`${directory}${path.sep}`)) throw new Error('Invalid signature path');
  return resolved;
}

const localSignatureStorage: SignatureStorage = {
  async save(storageKey, file) {
    await fs.promises.mkdir(signatureDir, { recursive: true, mode: 0o700 });
    const target = localSignaturePath(storageKey);
    // COPYFILE_EXCL / 'wx': keys are never reused, so never overwrite.
    if ('path' in file) await fs.promises.copyFile(file.path, target, fs.constants.COPYFILE_EXCL);
    else await fs.promises.writeFile(target, file.buffer, { flag: 'wx' });
  },
  async open(storageKey) {
    const stream = fs.createReadStream(localSignaturePath(storageKey));
    await once(stream, 'open');
    return stream;
  },
  async read(storageKey) {
    const filePath = localSignaturePath(storageKey);
    const stats = await fs.promises.stat(filePath);
    if (stats.size > MAX_SIGNATURE_BYTES) throw new Error('Stored signature exceeds its byte limit');
    return fs.promises.readFile(filePath);
  },
  async remove(storageKey) {
    await fs.promises.unlink(localSignaturePath(storageKey)).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
  },
};

function supabaseSignatureConfig(env: NodeJS.ProcessEnv = process.env) {
  const url = env.SUPABASE_URL?.replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = env.SUPABASE_SIGNATURE_BUCKET || env.SUPABASE_STORAGE_BUCKET || 'pod';
  if (!url || !key) throw new Error('Supabase signature storage requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  return { url, key, bucket };
}

function supabaseSignatureStorage(): SignatureStorage {
  const { url, key, bucket } = supabaseSignatureConfig();
  const endpoint = `${url}/storage/v1/object/${encodeURIComponent(bucket)}`;
  const headers = { Authorization: `Bearer ${key}`, apikey: key };
  const download = async (storageKey: string) => {
    assertKey(storageKey);
    const response = await fetch(`${endpoint}/${encodeURIComponent(storageKey)}`, { headers });
    if (!response.ok || !response.body) throw new Error(`Supabase signature download failed (${response.status})`);
    return response;
  };
  return {
    async save(storageKey, file, mimeType) {
      assertKey(storageKey);
      const response = await fetch(`${endpoint}/${encodeURIComponent(storageKey)}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': mimeType, 'x-upsert': 'false' },
        body: 'path' in file ? await fs.openAsBlob(file.path) : file.buffer,
      });
      if (!response.ok) throw new Error(`Supabase signature upload failed (${response.status})`);
    },
    async open(storageKey) {
      return Readable.fromWeb((await download(storageKey)).body as any);
    },
    async read(storageKey) {
      const response = await download(storageKey);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_SIGNATURE_BYTES) throw new Error('Stored signature exceeds its byte limit');
      return bytes;
    },
    async remove(storageKey) {
      assertKey(storageKey);
      const response = await fetch(endpoint, {
        method: 'DELETE', signal: AbortSignal.timeout(15_000),
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify([storageKey]),
      });
      if (!response.ok && response.status !== 404) throw new Error(`Supabase signature delete failed (${response.status})`);
    },
  };
}

export const signatureStorage: SignatureStorage = signatureStorageProvider() === 'supabase'
  ? supabaseSignatureStorage()
  : localSignatureStorage;

// Disjoint from podStorageNamespace, so the POD cleanup worker never drains a
// signature deletion job and vice versa.
export function signatureNamespace(env: NodeJS.ProcessEnv = process.env): string {
  const provider = signatureStorageProvider(env);
  let target = signatureUploadDir(env);
  if (provider === 'supabase') {
    const { url, bucket } = supabaseSignatureConfig(env);
    target = `${url}/${bucket}`;
  }
  return crypto.createHash('sha256').update(JSON.stringify(['signature', provider, target])).digest('hex');
}
export const signatureStorageNamespace = signatureNamespace();

// Quarantine: uploads land on private disk, never in memory, and the route
// removes them whatever the outcome.
const quarantineDir = path.resolve(process.env.SIGNATURE_TEMP_DIR || path.join(os.tmpdir(), 'mg-signature-uploads'));

export async function removeStaleSignatureUploads(olderThanMs = 60 * 60 * 1000): Promise<number> {
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

class UnsupportedSignatureTypeError extends Error {
  readonly code = 'UNSUPPORTED_SIGNATURE_TYPE';
  constructor() { super(UNSUPPORTED_SIGNATURE_TYPE); this.name = 'UnsupportedSignatureTypeError'; }
}

export const signatureUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      fs.mkdir(quarantineDir, { recursive: true, mode: 0o700 }, error => callback(error, quarantineDir));
    },
    filename: (_req, _file, callback) => callback(null, crypto.randomUUID()),
  }),
  limits: { fileSize: MAX_SIGNATURE_BYTES, files: 1, fields: 4 },
  // Cheap early rejection by declared name and type; the bytes are verified later.
  fileFilter: (_req, file, callback) => {
    const expected = SIGNATURE_MIME_TYPES[path.extname(file.originalname).toLowerCase()];
    const declared = file.mimetype.toLowerCase() === 'image/jpg' ? 'image/jpeg' : file.mimetype.toLowerCase();
    if (expected && expected === declared) return callback(null, true);
    callback(new UnsupportedSignatureTypeError());
  },
});

/** Signature-specific upload errors (2 MB, PNG/JPG) without touching the POD 10 MB handler. */
export function handleSignatureUpload(req: Request, res: Response, next: NextFunction) {
  signatureUpload.single('file')(req, res, (error: unknown) => {
    if (!error) return next();
    if (req.file?.path) void discardUpload(req.file.path);
    const err = error as Error & { code?: string };
    if (err.name === 'MulterError' && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: SIGNATURE_TOO_LARGE_ERROR });
    if (err instanceof UnsupportedSignatureTypeError) return res.status(400).json({ error: UNSUPPORTED_SIGNATURE_TYPE });
    if (err.name === 'MulterError') return res.status(400).json({ error: 'Upload a single signature image in the "file" field.' });
    next(error);
  });
}
