import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';

const uploadDir = path.resolve(process.env.POD_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'pod'));
fs.mkdirSync(uploadDir, { recursive: true });

export const podStorage = {
  pathFor(storageKey: string) {
    const resolved = path.resolve(uploadDir, storageKey);
    if (!resolved.startsWith(`${uploadDir}${path.sep}`)) throw new Error('Invalid attachment path');
    return resolved;
  },
  async remove(storageKey: string) {
    await fs.promises.unlink(this.pathFor(storageKey)).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
  }
};

export const podUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDir),
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!file.mimetype || file.mimetype === 'application/octet-stream' || file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf' || file.mimetype.startsWith('text/') || file.mimetype.includes('word') || file.mimetype.includes('excel') || file.mimetype.includes('spreadsheet')) {
      return callback(null, true);
    }
    callback(new Error('Unsupported file type. Upload a PDF, document, spreadsheet, image, or text file.'));
  }
});
