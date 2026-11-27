import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { withFileInMemory } from './podStorage';
import { isPodPhoto } from './podPhotos';

// Feature 5a: what a user digital signature image may be, checked on the server.

export const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;
export const MIN_SIGNATURE_DIMENSION = 16;
export const MAX_SIGNATURE_DIMENSION = 4096;

export type SignatureMimeType = 'image/png' | 'image/jpeg';

export const SIGNATURE_MIME_TYPES: Record<string, SignatureMimeType> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

export const UNSUPPORTED_SIGNATURE_TYPE = 'Unsupported signature format. Upload a PNG or JPG image.';
export const SIGNATURE_TOO_LARGE_ERROR = 'Signature image is too large. The maximum upload size is 2 MB.';
export const INVALID_SIGNATURE_IMAGE = 'This file is not a valid PNG or JPG image. Choose a signature image and try again.';
export const SIGNATURE_DIMENSION_ERROR = `Signature image must be between ${MIN_SIGNATURE_DIMENSION} and ${MAX_SIGNATURE_DIMENSION} pixels wide and tall.`;

export const SIGNATURE_KEY_PATTERN = /^sig-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$/;

export function isValidSignatureStorageKey(key: unknown): key is string {
  return typeof key === 'string' && SIGNATURE_KEY_PATTERN.test(key);
}

/** Entirely server-generated: the client's file name never reaches storage. */
export function generateSignatureStorageKey(mimeType: SignatureMimeType): string {
  return `sig-${crypto.randomUUID()}.${mimeType === 'image/png' ? 'png' : 'jpg'}`;
}

export function signatureMimeType(originalName: string): SignatureMimeType | undefined {
  return SIGNATURE_MIME_TYPES[path.extname(originalName).toLowerCase()];
}

export type SignatureInspection =
  | { mimeType: SignatureMimeType; buffer: Buffer; size: number; width: number; height: number }
  | { error: string; status?: 400 | 413 };

const decodeOptions = { failOn: 'warning', limitInputPixels: MAX_SIGNATURE_DIMENSION * MAX_SIGNATURE_DIMENSION } as const;

function withinDimensions(width: number, height: number): boolean {
  return width >= MIN_SIGNATURE_DIMENSION && height >= MIN_SIGNATURE_DIMENSION
    && width <= MAX_SIGNATURE_DIMENSION && height <= MAX_SIGNATURE_DIMENSION;
}

/**
 * Decide what a quarantined signature upload really is from its bytes. The
 * file name only selects which format the content must prove to be. Accepted
 * images are decoded in full and re-encoded canonically, so the returned
 * buffer carries no EXIF, ICC, XMP, IPTC, JPEG comments or PNG text chunks.
 * That buffer, never the original upload, is what gets stored.
 */
export async function inspectSignatureBuffer(content: Buffer, mimeType: SignatureMimeType,
  maxBytes: number = MAX_SIGNATURE_BYTES): Promise<SignatureInspection> {
  if (content.length === 0) return { error: INVALID_SIGNATURE_IMAGE };
  if (content.length > maxBytes) return { error: SIGNATURE_TOO_LARGE_ERROR, status: 413 };
  if (!isPodPhoto(content, mimeType)) return { error: INVALID_SIGNATURE_IMAGE };
  try {
    const metadata = await sharp(content, decodeOptions).metadata();
    if (metadata.format !== (mimeType === 'image/png' ? 'png' : 'jpeg')) return { error: INVALID_SIGNATURE_IMAGE };
    if (!withinDimensions(metadata.width ?? 0, metadata.height ?? 0)) return { error: SIGNATURE_DIMENSION_ERROR };
    // Decodes the whole pixel stream, applies EXIF orientation so phone photos
    // stay upright once EXIF is gone, and re-encodes without any metadata.
    const pipeline = sharp(content, decodeOptions).rotate();
    const encoded = mimeType === 'image/png'
      ? await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer({ resolveWithObject: true })
      : await pipeline.jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
    const buffer = encoded.data;
    if (buffer.length === 0) return { error: INVALID_SIGNATURE_IMAGE };
    // The cap applies to the bytes that will actually be stored.
    if (buffer.length > maxBytes) return { error: SIGNATURE_TOO_LARGE_ERROR, status: 413 };
    const { width, height } = encoded.info;
    if (!withinDimensions(width, height)) return { error: SIGNATURE_DIMENSION_ERROR };
    if (!isPodPhoto(buffer, mimeType)) return { error: INVALID_SIGNATURE_IMAGE };
    return { mimeType, buffer, size: buffer.length, width, height };
  } catch {
    return { error: INVALID_SIGNATURE_IMAGE };
  }
}

export function inspectSignatureUpload(filePath: string, originalName: string): Promise<SignatureInspection> {
  return withFileInMemory(async () => {
    const mimeType = signatureMimeType(originalName);
    if (!mimeType) return { error: UNSUPPORTED_SIGNATURE_TYPE };
    const stats = await fs.promises.stat(filePath);
    if (stats.size > MAX_SIGNATURE_BYTES) return { error: SIGNATURE_TOO_LARGE_ERROR, status: 413 };
    return inspectSignatureBuffer(await fs.promises.readFile(filePath), mimeType);
  });
}
