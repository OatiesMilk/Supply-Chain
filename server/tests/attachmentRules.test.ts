import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import net from 'node:net';
import {
  ATTACHMENT_MIME_TYPES, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_RECORD, MAX_RECORD_ATTACHMENT_BYTES,
  attachmentMimeType, attachmentQuotaError, isDocxDocument, isPdfDocument, isWordDocument, isXlsxDocument,
} from '../src/services/attachmentRules';
import { DOCX_CONTENT_TYPES, XLSX_CONTENT_TYPES, docx, docxEntries, oleFile, pdf, zipOf, xlsx, xlsxEntries } from './attachmentFixtures';
import { uploadErrorHandler } from '../src/middleware/uploadErrors';

// SEC-07 / SEC-08: content signatures, the per-record quota, and the
// disk-backed upload path (quarantine, cleanup, bounded memory, streaming).

const wordDoc = (version: 3 | 4 = 3) => oleFile('WordDocument', version);

// ── Signatures ──────────────────────────────────────────────────────────────
test('genuine PDF and Word documents are recognised by their content', () => {
  assert.equal(isPdfDocument(pdf()), true);
  assert.equal(isPdfDocument(pdf(64 * 1024)), true);
  assert.equal(isPdfDocument(Buffer.concat([pdf(), Buffer.from('\r\n\n  ')])), true, 'trailing whitespace is tolerated');
  assert.equal(isWordDocument(wordDoc(3)), true);
  assert.equal(isWordDocument(wordDoc(4)), true);
  assert.equal(isDocxDocument(docx()), true);
  // Stored (uncompressed) parts and extra parts such as images are still a document.
  assert.equal(isDocxDocument(zipOf([...docxEntries().map(entry => ({ ...entry, deflate: false })), { name: 'word/media/image1.png', content: Buffer.alloc(64) }])), true);
});

test('spoofed, truncated and polyglot PDFs fail closed', () => {
  const genuine = pdf();
  const cases: Record<string, Buffer> = {
    'header only': Buffer.from('%PDF-1.4 UAT supporting document'),
    'empty': Buffer.alloc(0),
    'plain text': Buffer.from('this is not a pdf'),
    'header not at byte 0': Buffer.concat([Buffer.from('\n'), genuine]),
    'executable with a PDF inside': Buffer.concat([Buffer.from('MZ\x90\x00'), genuine]),
    'unknown version': Buffer.from(genuine.toString('latin1').replace('%PDF-1.4', '%PDF-9.9'), 'latin1'),
    'truncated before the trailer': genuine.subarray(0, genuine.length - 20),
    'missing startxref': Buffer.from(genuine.toString('latin1').replace('startxref\n96\n', ''), 'latin1'),
    'ZIP archive appended': Buffer.concat([genuine, Buffer.from('PK\x03\x04payloadPK\x05\x06' + '\0'.repeat(18))]),
    'script appended': Buffer.concat([genuine, Buffer.from('<script>alert(1)</script>')]),
    'HTML page': Buffer.from('<html><body>%PDF-1.4</body></html>'),
    'ZIP archive': Buffer.from('PK\x03\x04' + '\0'.repeat(60)),
  };
  for (const [name, bytes] of Object.entries(cases)) assert.equal(isPdfDocument(bytes), false, name);
});

test('only an OLE file holding a Word stream is accepted as .doc', () => {
  const genuine = wordDoc();
  const tampered = (change: (file: Buffer) => void) => { const copy = Buffer.from(genuine); change(copy); return copy; };
  const cases: Record<string, Buffer> = {
    'signature only': Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(2000)]),
    'spreadsheet (Workbook stream)': oleFile('Workbook'),
    'installer-style container': oleFile('SummaryInformation'),
    'DOCX / ZIP renamed to .doc': Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(2000)]),
    'executable renamed to .doc': Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2000)]),
    'RTF text': Buffer.from('{\\rtf1 hello}'.padEnd(2000, ' ')),
    'truncated': genuine.subarray(0, 600),
    'wrong byte order': tampered(file => file.writeUInt16LE(0xfeff, 28)),
    'sector size does not match version': tampered(file => file.writeUInt16LE(12, 30)),
    'Word name on a storage, not a stream': tampered(file => { file[512 + 128 + 66] = 1; }),
    'Word name off the entry boundary': tampered(file => { file.copy(file, 512 + 128 + 7, 512 + 128, 512 + 256 - 7); file.fill(0, 512 + 128, 512 + 128 + 7); }),
  };
  for (const [name, bytes] of Object.entries(cases)) assert.equal(isWordDocument(bytes), false, name);
});

test('a ZIP archive is a .docx only when it is a complete, ordinary Word package', () => {
  const genuine = docx();
  const without = (name: string) => zipOf(docxEntries().filter(entry => entry.name !== name));
  const withEntry = (entry: Parameters<typeof zipOf>[0][number]) => zipOf([...docxEntries(), entry]);
  const manifest = (xml: string) => zipOf(docxEntries().map(entry => entry.name === '[Content_Types].xml' ? { ...entry, content: xml } : entry));
  const cases: Record<string, Buffer> = {
    'ZIP signature only': Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(2000)]),
    'empty archive': zipOf([]),
    'ordinary archive': zipOf([{ name: 'notes.txt', content: 'hello' }, { name: 'setup.exe', content: 'MZ' }]),
    'spreadsheet package': zipOf([{ name: '[Content_Types].xml', content: DOCX_CONTENT_TYPES.replace(/wordprocessingml\.document/g, 'spreadsheetml.sheet') }, { name: '_rels/.rels', content: '<x/>' }, { name: 'xl/workbook.xml', content: '<x/>' }]),
    'Java archive with Word-looking names': zipOf([{ name: 'META-INF/MANIFEST.MF', content: 'Main-Class: A' }, { name: 'word/document.xml', content: '<x/>' }, { name: '_rels/.rels', content: '<x/>' }]),
    'no content-type manifest': without('[Content_Types].xml'),
    'no main document part': without('word/document.xml'),
    'no package relationships': without('_rels/.rels'),
    'manifest does not declare a Word document': manifest('<Types/>'),
    'macro-enabled manifest (.docm)': manifest(DOCX_CONTENT_TYPES.replace('wordprocessingml.document.main+xml', 'wordprocessingml.document.macroEnabled.main+xml')),
    'macro project inside': withEntry({ name: 'word/vbaProject.bin', content: 'macro' }),
    'encrypted entry': withEntry({ name: 'word/secret.xml', content: 'x', encrypted: true }),
    'unknown compression method': withEntry({ name: 'word/odd.bin', content: 'x', method: 14 }),
    'entry escaping the package': withEntry({ name: '../../evil.exe', content: 'MZ' }),
    'absolute entry path': withEntry({ name: '/etc/passwd', content: 'x' }),
    'duplicate entry name': withEntry({ name: 'word/document.xml', content: '<other/>' }),
    'declared size of a decompression bomb': withEntry({ name: 'word/big.xml', content: 'x', declaredSize: 0xfffffff0 }),
    'too many entries': zipOf([...docxEntries(), ...Array.from({ length: 1000 }, (_unused, index) => ({ name: `word/part${index}.xml`, content: '' }))]),
    'trailing archive comment': zipOf(docxEntries(), { comment: 'hidden' }),
    'payload appended': Buffer.concat([genuine, Buffer.from('MZ payload')]),
    'payload prepended': Buffer.concat([Buffer.from('MZ payload'), genuine]),
    'truncated': genuine.subarray(0, genuine.length - 10),
    'corrupt compressed manifest': (() => { const copy = Buffer.from(genuine); copy.fill(0xff, 49, 60); return copy; })(),
    'index offset pointing outside the file': (() => { const copy = Buffer.from(genuine); copy.writeUInt32LE(0x7fffffff, copy.length - 6); return copy; })(),
    'legacy .doc renamed to .docx': oleFile('WordDocument'),
    'PDF renamed to .docx': pdf(),
  };
  for (const [name, bytes] of Object.entries(cases)) assert.equal(isDocxDocument(bytes), false, name);
});

test('a ZIP archive is an .xlsx only when it is a complete, ordinary spreadsheet package', () => {
  const valid = xlsx();
  assert.equal(isXlsxDocument(valid), true);
  const ordinaryWithLibraryDefaults = zipOf(xlsxEntries().map(entry => entry.name === '[Content_Types].xml'
    ? { ...entry, content: XLSX_CONTENT_TYPES.replace('</Types>', '<Default Extension="bin" ContentType="application/vnd.ms-excel.sheet.binary.macroEnabled.main"/></Types>') }
    : entry));
  assert.equal(isXlsxDocument(ordinaryWithLibraryDefaults), true, 'unrelated default content types do not make the main workbook macro-enabled');
  const without = (name: string) => zipOf(xlsxEntries().filter(entry => entry.name !== name));
  const cases: Record<string, Buffer> = {
    'ordinary ZIP archive': zipOf([{ name: 'notes.txt', content: 'hello' }]),
    'Word package renamed to XLSX': docx(),
    'no workbook part': without('xl/workbook.xml'),
    'no package relationships': without('_rels/.rels'),
    'wrong content type': zipOf(xlsxEntries().map(entry => entry.name === '[Content_Types].xml'
      ? { ...entry, content: DOCX_CONTENT_TYPES }
      : entry)),
    'macro-enabled workbook': zipOf(xlsxEntries().map(entry => entry.name === '[Content_Types].xml'
      ? { ...entry, content: XLSX_CONTENT_TYPES.replace('spreadsheetml.sheet.main+xml', 'spreadsheetml.sheet.macroEnabled.main+xml') }
      : entry)),
    'VBA project inside': zipOf([...xlsxEntries(), { name: 'xl/vbaProject.bin', content: 'macro' }]),
    'payload appended': Buffer.concat([valid, Buffer.from('MZ payload')]),
  };
  for (const [name, bytes] of Object.entries(cases)) assert.equal(isXlsxDocument(bytes), false, name);
});

test('the stored content type comes from the allow-list, never from the client', () => {
  assert.deepEqual(Object.keys(ATTACHMENT_MIME_TYPES).sort(), ['.docx', '.jpeg', '.jpg', '.pdf', '.png', '.xlsx']);
  assert.equal(attachmentMimeType('Scan.PDF'), 'application/pdf');
  assert.equal(attachmentMimeType('photo.JPeG'), 'image/jpeg');
  assert.equal(attachmentMimeType('Letter.DOCX'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(attachmentMimeType('Monthly Report.XLSX'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  for (const name of ['macro.docm', 'sheet.xls', 'run.exe', 'page.html', 'archive.zip', 'photo.png.exe', 'noextension', '.pdf/../x']) {
    assert.equal(attachmentMimeType(name), undefined, name);
  }
});

// ── Quota ───────────────────────────────────────────────────────────────────
test('the per-record quota is exact at both boundaries', () => {
  assert.equal(attachmentQuotaError(0, 0, MAX_ATTACHMENT_BYTES), null);
  assert.equal(attachmentQuotaError(MAX_ATTACHMENTS_PER_RECORD - 1, 0, 1), null);
  assert.match(attachmentQuotaError(MAX_ATTACHMENTS_PER_RECORD, 0, 1)!, /already has 10 attachments; the limit is 10/);
  // Legacy records above the cap stay blocked until they are back under it.
  assert.match(attachmentQuotaError(MAX_ATTACHMENTS_PER_RECORD + 7, 0, 1)!, /already has 17 attachments/);
  assert.equal(attachmentQuotaError(1, MAX_RECORD_ATTACHMENT_BYTES - 100, 100), null);
  assert.match(attachmentQuotaError(1, MAX_RECORD_ATTACHMENT_BYTES - 100, 101)!, /over its 50 MB attachment limit/);
});

// ── Disk-backed uploads ─────────────────────────────────────────────────────
// The storage module reads its folders from the environment when first loaded,
// so point it at throwaway folders before requiring it.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-pod-rules-'));
const quarantine = path.join(root, 'quarantine');
process.env.POD_UPLOAD_DIR = path.join(root, 'stored');
process.env.POD_TEMP_DIR = quarantine;
delete process.env.POD_STORAGE_PROVIDER;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const storage = require('../src/services/podStorage') as typeof import('../src/services/podStorage');

let server: Server;
let url = '';
const quarantined = () => fs.existsSync(quarantine) ? fs.readdirSync(quarantine) : [];
const settle = () => new Promise(resolve => setTimeout(resolve, 150));

before(async () => {
  const app = express();
  app.post('/upload', storage.podUpload.single('file'), async (req, res) => {
    const file = req.file!;
    res.json({ inMemory: Boolean(file.buffer), onDisk: fs.existsSync(file.path), folder: path.dirname(file.path), name: path.basename(file.path), size: file.size });
    await storage.discardUpload(file.path);
  });
  app.use(uploadErrorHandler);
  // A dropped connection surfaces as an error; answer quietly instead of logging it.
  app.use((_error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => { res.status(500).end(); });
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
});

function form(bytes: Buffer, name = 'scan.pdf', type = 'application/pdf') {
  const data = new FormData();
  data.append('file', new Blob([bytes], { type }), name);
  return data;
}

test('an upload is written to the private quarantine folder under a server-chosen name', async () => {
  const response = await (await fetch(`${url}/upload`, { method: 'POST', body: form(pdf(), '../../evil name.pdf') })).json();
  assert.equal(response.inMemory, false);
  assert.equal(response.onDisk, true);
  assert.equal(response.folder, quarantine);
  assert.match(response.name, /^[0-9a-f-]{36}$/);
  await settle();
  assert.deepEqual(quarantined(), []);
});

test('oversized, wrongly typed and aborted uploads leave nothing in quarantine', async () => {
  const tooBig = await fetch(`${url}/upload`, { method: 'POST', body: form(pdf(MAX_ATTACHMENT_BYTES)) });
  assert.equal(tooBig.status, 413);
  const exactlyAtLimit = pdf(0);
  const atLimit = await fetch(`${url}/upload`, { method: 'POST', body: form(pdf(MAX_ATTACHMENT_BYTES - exactlyAtLimit.length)) });
  assert.equal(atLimit.status, 200);
  assert.equal((await atLimit.json()).size, MAX_ATTACHMENT_BYTES);

  for (const [name, type] of [['run.exe', 'application/x-msdownload'], ['scan.pdf', 'image/png'], ['macro.docm', 'application/vnd.ms-word.document.macroEnabled.12'], ['notes.docx', 'application/zip']]) {
    assert.equal((await fetch(`${url}/upload`, { method: 'POST', body: form(pdf(), name, type) })).status, 400, name);
  }

  // A client that disconnects part-way through the body.
  const boundary = 'aborted-upload-boundary';
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="scan.pdf"\r\nContent-Type: application/pdf\r\n\r\n`;
  await new Promise<void>((resolve, reject) => {
    const socket = net.connect(Number(new URL(url).port), '127.0.0.1', () => {
      socket.write(`POST /upload HTTP/1.1\r\nHost: test\r\nContent-Type: multipart/form-data; boundary=${boundary}\r\nContent-Length: 5000000\r\n\r\n${head}`);
      socket.write(Buffer.alloc(256 * 1024, 0x41), () => setTimeout(() => { socket.destroy(); resolve(); }, 100));
    });
    socket.on('error', reject);
  });
  await settle();
  assert.deepEqual(quarantined(), []);
});

test('files abandoned by a crash are removed at startup; fresh ones are left alone', async () => {
  fs.mkdirSync(quarantine, { recursive: true });
  const stale = path.join(quarantine, 'stale');
  const fresh = path.join(quarantine, 'fresh');
  fs.writeFileSync(stale, 'x');
  fs.writeFileSync(fresh, 'x');
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  fs.utimesSync(stale, twoHoursAgo, twoHoursAgo);
  assert.equal(await storage.removeStaleUploads(), 1);
  assert.deepEqual(quarantined(), ['fresh']);
  await storage.discardUpload(fresh);
  await storage.discardUpload(fresh); // already gone: not an error
  await storage.discardUpload(undefined);
});

test('storage copies an upload from disk, streams it back and stays inside its folder', async () => {
  const source = path.join(root, 'upload.tmp');
  const bytes = pdf(4096);
  fs.writeFileSync(source, bytes);
  const key = await storage.podStorage.save({ originalName: 'Scan.PDF', mimeType: 'application/pdf', size: bytes.length, path: source });
  assert.match(key, /^[0-9a-f-]{36}\.pdf$/);
  assert.ok(fs.existsSync(source), 'the caller owns removal of the quarantined copy');

  const chunks: Buffer[] = [];
  for await (const chunk of await storage.podStorage.open(key)) chunks.push(chunk as Buffer);
  assert.ok(Buffer.concat(chunks).equals(bytes));
  assert.ok((await storage.podStorage.read(key)).equals(bytes));

  await storage.podStorage.remove(key);
  await assert.rejects(storage.podStorage.open(key));
  await assert.rejects(storage.podStorage.open('../outside.pdf'), /Invalid attachment path/);
  await assert.rejects(storage.podStorage.save({ originalName: 'x.pdf', mimeType: 'application/pdf', size: 1, path: path.join(root, 'missing') }));
});

test('no more than the fixed number of whole files is ever held in memory', async () => {
  let active = 0;
  let peak = 0;
  const order: number[] = [];
  await Promise.all(Array.from({ length: 12 }, (_unused, index) => storage.withFileInMemory(async () => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 5));
    order.push(index);
    active--;
  })));
  assert.equal(peak, storage.IN_MEMORY_FILE_SLOTS);
  assert.equal(order.length, 12);
  // A failing holder releases its slot.
  await assert.rejects(storage.withFileInMemory(async () => { throw new Error('boom'); }), /boom/);
  await Promise.all(Array.from({ length: storage.IN_MEMORY_FILE_SLOTS }, () => storage.withFileInMemory(async () => {})));
});
