import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';

export interface PodFile {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}


export function podStorageKeys(): Promise<string[]> {
  return fs.promises.readdir(uploadDir).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  });
}

export interface PodStorage {
  save(file: PodFile): Promise<string>;
  read(storageKey: string): Promise<Buffer>;
  remove(storageKey: string): Promise<void>;
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
    await fs.promises.writeFile(localPathFor(storageKey), file.buffer);
    return storageKey;
  },
  read(storageKey) {
    return fs.promises.readFile(localPathFor(storageKey));
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
        body: file.buffer
      });
      if (!response.ok) throw new Error(`Supabase storage upload failed (${response.status})`);
      return storageKey;
    },
    async read(storageKey) {
      const response = await fetch(`${endpoint}/${encodeURIComponent(storageKey)}`, { headers });
      if (!response.ok) throw new Error(`Supabase storage download failed (${response.status})`);
      return Buffer.from(await response.arrayBuffer());
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

export const podUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype || file.mimetype === 'application/octet-stream' || file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf' || file.mimetype.startsWith('text/') || file.mimetype.includes('word') || file.mimetype.includes('excel') || file.mimetype.includes('spreadsheet')) {
      return callback(null, true);
    }
    callback(new Error('Unsupported file type. Upload a PDF, document, spreadsheet, image, or text file.'));
  }
});
