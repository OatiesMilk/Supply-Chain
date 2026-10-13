import zlib from 'node:zlib';

// Small but structurally genuine documents for the SEC-07 / SEC-08 tests.

export function pdf(padding = 0): Buffer {
  return Buffer.concat([
    Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n'),
    Buffer.alloc(padding, 0x20),
    Buffer.from('\nxref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \ntrailer<</Size 3/Root 1 0 R>>\nstartxref\n96\n%%EOF\n'),
  ]);
}

// A minimal OLE compound file: header plus one directory sector.
export function oleFile(streamName: string, version: 3 | 4 = 3): Buffer {
  const sectorSize = version === 3 ? 512 : 4096;
  const file = Buffer.alloc(sectorSize * 3);
  Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(file, 0);
  file.writeUInt16LE(version, 26);
  file.writeUInt16LE(0xfffe, 28);
  file.writeUInt16LE(version === 3 ? 9 : 12, 30);
  file.writeUInt16LE(6, 32);
  const entry = (index: number, name: string, type: number) => {
    const offset = sectorSize + index * 128;
    const encoded = Buffer.from(`${name}\0`, 'utf16le');
    encoded.copy(file, offset);
    file.writeUInt16LE(encoded.length, offset + 64);
    file[offset + 66] = type;
  };
  entry(0, 'Root Entry', 5);
  entry(1, streamName, 2);
  return file;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; content: string | Buffer; deflate?: boolean; encrypted?: boolean; method?: number; declaredSize?: number };

// A plain single-disk ZIP archive with no comment.
export function zipOf(entries: ZipEntry[], options: { comment?: string } = {}): Buffer {
  const locals: Buffer[] = [];
  const index: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const raw = Buffer.from(entry.content);
    const data = entry.deflate ? zlib.deflateRawSync(raw) : raw;
    const name = Buffer.from(entry.name);
    const method = entry.method ?? (entry.deflate ? 8 : 0);
    const flags = entry.encrypted ? 1 : 0;
    const unpacked = entry.declaredSize ?? raw.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(unpacked, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(raw), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(unpacked, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    index.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const indexBytes = Buffer.concat(index);
  const comment = Buffer.from(options.comment ?? '');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(indexBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(comment.length, 20);
  return Buffer.concat([...locals, indexBytes, end, comment]);
}

export const DOCX_CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';

export function docxEntries(): ZipEntry[] {
  return [
    { name: '[Content_Types].xml', content: DOCX_CONTENT_TYPES, deflate: true },
    { name: '_rels/.rels', content: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>' },
    { name: 'word/document.xml', content: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>', deflate: true },
  ];
}

export const docx = () => zipOf(docxEntries());
