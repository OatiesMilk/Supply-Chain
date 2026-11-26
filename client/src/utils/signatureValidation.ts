/**
 * Client-side pre-upload checks for digital signature images. The server
 * re-verifies everything from the bytes; this only gives quick feedback.
 */
export const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;
export const SIGNATURE_ACCEPT = 'image/png,image/jpeg,.png,.jpg,.jpeg';

const EXTENSION_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

/** A user-facing reason the file cannot be uploaded, or null when it may be sent. */
export function getSignatureRejection(file: Pick<File, 'name' | 'size' | 'type'>): string | null {
  const extension = file.name.toLowerCase().split('.').pop() ?? '';
  const expected = EXTENSION_TYPES[extension];
  const declared = file.type.toLowerCase() === 'image/jpg' ? 'image/jpeg' : file.type.toLowerCase();
  if (!expected || (declared && declared !== expected)) return 'Upload a PNG or JPG image.';
  if (file.size <= 0) return 'The selected file is empty.';
  if (file.size > MAX_SIGNATURE_BYTES) return 'Signature image is too large. The maximum upload size is 2 MB.';
  return null;
}
