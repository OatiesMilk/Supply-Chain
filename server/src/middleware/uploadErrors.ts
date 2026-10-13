import type { NextFunction, Request, Response } from 'express';
import { UNSUPPORTED_FILE_TYPE } from '../services/attachmentRules';

/** Error passed to Multer's fileFilter callback when a file type is rejected. */
export class UnsupportedUploadTypeError extends Error {
  readonly code = 'UNSUPPORTED_FILE_TYPE';

  constructor(message = UNSUPPORTED_FILE_TYPE) {
    super(message);
    this.name = 'UnsupportedUploadTypeError';
  }
}

type UploadError = Error & { code?: string };

/**
 * Return API errors for upload rejections before they reach the generic 500
 * handler. Multer is intentionally not imported here so the error handling
 * can be tested and used without coupling the server to a storage adapter.
 */
export function uploadErrorHandler(
  error: UploadError,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (error.name === 'MulterError' && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File is too large. The maximum upload size is 10 MB.' });
  }

  if (error instanceof UnsupportedUploadTypeError || error.code === 'UNSUPPORTED_FILE_TYPE') {
    return res.status(400).json({ error: error.message });
  }

  return next(error);
}
