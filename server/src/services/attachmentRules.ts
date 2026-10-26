import path from 'node:path';
import zlib from 'node:zlib';

// SEC-07 / SEC-08: what a record attachment may be, checked on the server.

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
// Per-record quota. Records that already exceed it keep their files (view,
// download and delete still work) but accept no new upload until under it.
export const MAX_ATTACHMENTS_PER_RECORD = 10;
export const MAX_RECORD_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const ATTACHMENT_QUOTA_EXCEEDED = 'ATTACHMENT_QUOTA_EXCEEDED';

// The only accepted types. The stored content type comes from this table once
// the bytes are verified, never from the browser's Content-Type.
export const ATTACHMENT_MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
export const UNSUPPORTED_FILE_TYPE = 'Unsupported file type. Allowed formats: PDF, JPG, PNG, and DOCX.';

export function attachmentMimeType(originalName: string): string | undefined {
  return ATTACHMENT_MIME_TYPES[path.extname(originalName).toLowerCase()];
}

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

// Null when one more file of `incomingBytes` fits the record's quota.
export function attachmentQuotaError(storedCount: number, storedBytes: number, incomingBytes: number): string | null {
  if (storedCount >= MAX_ATTACHMENTS_PER_RECORD) {
    return `This record already has ${storedCount} attachments; the limit is ${MAX_ATTACHMENTS_PER_RECORD}. Remove one before uploading another.`;
  }
  if (storedBytes + incomingBytes > MAX_RECORD_ATTACHMENT_BYTES) {
    return `This file would take the record over its ${megabytes(MAX_RECORD_ATTACHMENT_BYTES)} attachment limit. Remove a file or upload a smaller one.`;
  }
  return null;
}

const isBlank = (byte: number) => byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09 || byte === 0x0c || byte === 0x00;

// A PDF must be one from its first byte to its last: the header at offset 0
// (so it cannot be a wrapper around another format) and the cross-reference
// pointer and end marker closing the file, with nothing appended after them.
export function isPdfDocument(buffer: Buffer): boolean {
  if (!/^%PDF-[12]\.\d[\r\n]/.test(buffer.toString('latin1', 0, 10))) return false;
  let end = buffer.length;
  while (end > 0 && isBlank(buffer[end - 1])) end--;
  const tail = buffer.toString('latin1', Math.max(0, end - 1024), end);
  return /startxref\s+\d+\s+%%EOF$/.test(tail);
}

const OLE_SIGNATURE = Buffer.from('d0cf11e0a1b11ae1', 'hex');
const WORD_STREAM_NAME = Buffer.from('WordDocument\0', 'utf16le');

// A legacy .doc is an OLE compound file that holds a WordDocument stream.
// Other OLE files (spreadsheets, installers) share the signature, so the
// signature alone is not accepted.
export function isWordDocument(buffer: Buffer): boolean {
  if (buffer.length < 1536 || !buffer.subarray(0, 8).equals(OLE_SIGNATURE)) return false;
  const majorVersion = buffer.readUInt16LE(26);
  const sectorShift = buffer.readUInt16LE(30);
  const validLayout = (majorVersion === 3 && sectorShift === 9) || (majorVersion === 4 && sectorShift === 12);
  if (!validLayout || buffer.readUInt16LE(28) !== 0xfffe || buffer.readUInt16LE(32) !== 6) return false;
  // Directory entries are 128 bytes, laid out from the start of a sector:
  // name (UTF-16LE), name length at +64, object type at +66 (2 = stream).
  const sectorSize = 1 << sectorShift;
  for (let entry = sectorSize; entry + 128 <= buffer.length; entry += 128) {
    if (buffer.readUInt16LE(entry + 64) === WORD_STREAM_NAME.length && buffer[entry + 66] === 2
      && buffer.subarray(entry, entry + WORD_STREAM_NAME.length).equals(WORD_STREAM_NAME)) return true;
  }
  return false;
}

const ZIP_LOCAL_HEADER = 0x04034b50;
const ZIP_CENTRAL_HEADER = 0x02014b50;
const ZIP_END_RECORD = 0x06054b50;
const DOCX_MAIN_PART = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const DOCX_MAX_ENTRIES = 1000;
const DOCX_MAX_UNPACKED_BYTES = 200 * 1024 * 1024;

// A .docx is a ZIP package, and so are spreadsheets, Java archives and plain
// archives, so the ZIP signature proves nothing. The whole file must be one
// well-formed archive (nothing before, between or after its parts), its index
// must list the Word parts, and its content-type manifest must declare an
// ordinary Word document. Macro-enabled packages and encrypted or oversized
// entries are refused. Only the small manifest is ever decompressed.
export function isDocxDocument(buffer: Buffer): boolean {
  try {
    const end = buffer.length - 22;
    if (end < 0 || buffer.readUInt32LE(0) !== ZIP_LOCAL_HEADER || buffer.readUInt32LE(end) !== ZIP_END_RECORD) return false;
    const entryCount = buffer.readUInt16LE(end + 10);
    const indexSize = buffer.readUInt32LE(end + 12);
    const indexStart = buffer.readUInt32LE(end + 16);
    // Single-disk archive, no trailing comment, index running exactly up to the end record.
    if (buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0 || buffer.readUInt16LE(end + 8) !== entryCount
      || buffer.readUInt16LE(end + 20) !== 0 || entryCount === 0 || entryCount > DOCX_MAX_ENTRIES || indexStart + indexSize !== end) return false;

    const entries = new Map<string, { method: number; packed: number; local: number }>();
    let unpackedTotal = 0;
    let offset = indexStart;
    for (let index = 0; index < entryCount; index++) {
      if (offset + 46 > end || buffer.readUInt32LE(offset) !== ZIP_CENTRAL_HEADER) return false;
      const encrypted = (buffer.readUInt16LE(offset + 8) & 1) !== 0;
      const method = buffer.readUInt16LE(offset + 10);
      const packed = buffer.readUInt32LE(offset + 20);
      const unpacked = buffer.readUInt32LE(offset + 24);
      const nameLength = buffer.readUInt16LE(offset + 28);
      const local = buffer.readUInt32LE(offset + 42);
      const next = offset + 46 + nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
      const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);
      unpackedTotal += unpacked;
      if (next > end || encrypted || (method !== 0 && method !== 8) || unpackedTotal > DOCX_MAX_UNPACKED_BYTES
        || local + 30 > indexStart || buffer.readUInt32LE(local) !== ZIP_LOCAL_HEADER
        || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..') || entries.has(name)) return false;
      entries.set(name, { method, packed, local });
      offset = next;
    }
    if (offset !== end) return false;

    if (!entries.has('word/document.xml') || !entries.has('_rels/.rels')) return false;
    if ([...entries.keys()].some(name => /(^|\/)vba(Project\.bin|Data\.xml)$/i.test(name))) return false;

    const manifest = entries.get('[Content_Types].xml');
    if (!manifest) return false;
    const dataStart = manifest.local + 30 + buffer.readUInt16LE(manifest.local + 26) + buffer.readUInt16LE(manifest.local + 28);
    if (dataStart + manifest.packed > indexStart) return false;
    const packedManifest = buffer.subarray(dataStart, dataStart + manifest.packed);
    const xml = (manifest.method === 0 ? packedManifest : zlib.inflateRawSync(packedManifest, { maxOutputLength: 1024 * 1024 })).toString('utf8');
    return xml.includes(DOCX_MAIN_PART) && !/macroEnabled/i.test(xml);
  } catch {
    // Out-of-range offsets and corrupt compressed data are simply not a document.
    return false;
  }
}
