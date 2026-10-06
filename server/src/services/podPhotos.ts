import type { Prisma } from '@prisma/client';
import { podStorage } from './podStorage';

export const DELIVERY_PHOTO_REQUIRED = 'Upload at least one JPG or PNG delivery photo before marking this delivery Accomplished.';

export function isPhotoMimeType(mimeType: string) {
  return ['image/jpeg', 'image/png'].includes(mimeType.toLowerCase());
}

// Check the stored file's image framing, not its client-controlled name or MIME alone.
export function isPodPhoto(buffer: Buffer, mimeType: string): boolean {
  if (mimeType.toLowerCase() === 'image/png') {
    if (buffer.length < 45 || !buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return false;
    let imageData = false;
    for (let offset = 8; offset + 12 <= buffer.length;) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      const end = offset + length + 12;
      if (end > buffer.length) return false;
      if (offset === 8 && (type !== 'IHDR' || length !== 13 || !buffer.readUInt32BE(offset + 8) || !buffer.readUInt32BE(offset + 12))) return false;
      if (type === 'IDAT' && length > 0) imageData = true;
      if (type === 'IEND') return imageData && length === 0 && end === buffer.length;
      offset = end;
    }
    return false;
  }
  if (mimeType.toLowerCase() !== 'image/jpeg' || buffer.length < 12 || buffer.readUInt16BE(0) !== 0xffd8) return false;
  let dimensions = false;
  for (let offset = 2; offset + 4 <= buffer.length;) {
    if (buffer[offset++] !== 0xff) return false;
    while (buffer[offset] === 0xff) offset++;
    const marker = buffer[offset++];
    if (offset + 2 > buffer.length) return false;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return false;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8) return false;
      dimensions = buffer.readUInt16BE(offset + 3) > 0 && buffer.readUInt16BE(offset + 5) > 0;
    }
    if (marker === 0xda) {
      return dimensions && buffer.length > offset + length + 2 && buffer.readUInt16BE(buffer.length - 2) === 0xffd9;
    }
    offset += length;
  }
  return false;
}

export async function isStoredPodPhoto(attachment: { mimeType: string; storageKey: string; size: number }) {
  if (!isPhotoMimeType(attachment.mimeType) || attachment.size <= 0) return false;
  try {
    const content = await podStorage.read(attachment.storageKey);
    return content.length === attachment.size && isPodPhoto(content, attachment.mimeType);
  } catch {
    // Missing/unreadable files must never satisfy delivery proof.
    return false;
  }
}

export async function hasStoredDeliveryPhoto(tx: Pick<Prisma.TransactionClient, 'podAttachment'>, recordId: string, excludeId?: string) {
  const attachments = await tx.podAttachment.findMany({ where: { recordId, ...(excludeId ? { id: { not: excludeId } } : {}) } });
  for (const attachment of attachments) if (await isStoredPodPhoto(attachment)) return true;
  return false;
}

// Completion and attachment deletion take the same row lock so proof cannot
// disappear between validation and the status write.
export async function lockPodRecord(tx: Prisma.TransactionClient, recordId: string) {
  await tx.$queryRaw`SELECT id FROM "DeliveryRecord" WHERE id = ${recordId} FOR UPDATE`;
}
