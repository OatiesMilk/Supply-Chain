import { test, mock, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import express from 'express';
import cookieParser from 'cookie-parser';
import sharp from 'sharp';
import { prisma } from '../src/db';
import { signToken } from '../src/middleware/auth';
import authRoutes from '../src/routes/auth';
import usersRoutes from '../src/routes/users';
import recordsRoutes from '../src/routes/records';
import { podStorageNamespace } from '../src/services/podStorage';
import { dispatchRolePermissions } from '../src/services/rmaDispatchPermissions';
import type { PolicyRole } from '../src/services/permissionCatalog';
import {
  generateSignatureStorageKey, inspectSignatureBuffer, isValidSignatureStorageKey, MAX_SIGNATURE_BYTES, SIGNATURE_TOO_LARGE_ERROR, UNSUPPORTED_SIGNATURE_TYPE,
} from '../src/services/signatureRules';
import { localSignaturePath, signatureStorage, signatureStorageNamespace, signatureUploadDir } from '../src/services/signatureStorage';

// Feature 5a: digital signature upload security, storage isolation, audit and
// record-scoped serving, across the LEGACY and V1 permission modes.

const png = (width = 240, height = 80) => sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
const jpeg = (width = 240, height = 80) => sharp({ create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } } }).jpeg().toBuffer();
const gif = () => sharp({ create: { width: 32, height: 32, channels: 3, background: '#fff' } }).gif().toBuffer();
const webp = () => sharp({ create: { width: 32, height: 32, channels: 3, background: '#fff' } }).webp().toBuffer();
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><script>alert(1)</script></svg>');
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\nstartxref\n9\n%%EOF');

type Mode = 'LEGACY' | 'V1';
const ROLES: PolicyRole[] = ['ADMIN', 'SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'DRIVER'];

function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, value]: [string, any]) => {
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(condition => matches(row, condition));
    if (key === 'OR') return value.some((condition: any) => matches(row, condition));
    if (key === 'NOT') return !(Array.isArray(value) ? value : [value]).some(condition => matches(row, condition));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(row[key]);
      if ('notIn' in value) return !value.notIn.includes(row[key]);
      if ('not' in value) return row[key] !== value.not;
      if ('equals' in value) return row[key] === value.equals;
      if ('lte' in value) return row[key] <= value.lte;
    }
    return row[key] === value;
  });
}

async function fixture(t: TestContext, mode: Mode) {
  const previousMode = process.env.PERMISSION_MODE;
  process.env.PERMISSION_MODE = mode;
  const account = (id: string, role: PolicyRole, driverProfile: string | null = null) => ({
    id, name: `${role} ${id}`, email: `${id}@example.test`, role, isActive: true, authorizationRevision: 1n, password: 'x',
    permissions: [], permissionOverrides: [], permissionConversion: { catalogVersion: 1 }, microsoftOid: null, microsoftApprovedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
    driverProfile: driverProfile ? { id: driverProfile, name: driverProfile, type: 'DRIVER', isActive: true } : null,
  });
  const users = new Map<string, any>([
    ['admin', account('admin', 'ADMIN')], ['tass', account('tass', 'TASS')], ['tass2', account('tass2', 'TASS')],
    ['sales', account('sales', 'SALES_COORDINATOR')], ['logistics', account('logistics', 'LOGISTICS')],
    ['driver', account('driver', 'DRIVER', 'driver-one')], ['driver2', account('driver2', 'DRIVER', 'driver-two')],
  ]);
  const policies = new Map(ROLES.map(role => [role, { role, revision: 1n, catalogVersion: 1,
    permissions: [...dispatchRolePermissions(role)].map(([permissionKey, effect]) => ({ role, permissionKey, effect })) }]));
  const records = [
    { id: 'rma-one', category: 'RMA', deletedAt: null, draft: false, driverId: 'driver-one', rmaMovement: 'LOGISTICS_TRANSPORT', createdById: 'tass' },
    { id: 'rma-two', category: 'RMA', deletedAt: null, draft: false, driverId: null, rmaMovement: 'INTERNAL_NO_DRIVER', createdById: 'tass2' },
    { id: 'delivery-one', category: 'DELIVERY', deletedAt: null, draft: false, driverId: 'driver-one', rmaMovement: null, createdById: 'tass' },
  ];
  const signatures = new Map<string, any>();
  const files = new Map<string, Buffer>();
  const audits: any[] = [];
  const jobs: any[] = [];
  const restorers: Array<() => void> = [];
  const stub = (target: any, key: string, fn: (...args: any[]) => any) => {
    const original = target[key]; target[key] = mock.fn(fn); restorers.push(() => { target[key] = original; }); return target[key];
  };
  const withSignature = (user: any) => user && { ...structuredClone(user), signature: signatures.get(user.id) ? { ...signatures.get(user.id) } : null };
  stub(prisma, '$transaction', async (work: any) => typeof work === 'function' ? work(prisma) : Promise.all(work));
  stub(prisma, '$executeRaw', async () => 1);
  stub(prisma, '$queryRaw', async () => []);
  stub(prisma.user, 'findUnique', async ({ where }: any) => withSignature(users.get(where.id)) ?? null);
  stub(prisma.user, 'findMany', async () => [...users.values()].map(withSignature));
  stub(prisma.user, 'delete', async ({ where }: any) => { const user = users.get(where.id); users.delete(where.id); signatures.delete(where.id); return user; });
  stub(prisma.rolePolicy, 'findUnique', async ({ where }: any) => structuredClone(policies.get(where.role) ?? null));
  stub(prisma.rolePolicy, 'findMany', async () => []);
  stub(prisma.deliveryRecord, 'findFirst', async ({ where }: any) => structuredClone(records.find(row => matches(row, where)) ?? null));
  for (const model of ['deliveryRecord', 'auditLog', 'product', 'customer', 'supplier', 'comment', 'remarkLog', 'masterDataAdditionRequest'] as const) stub((prisma as any)[model], 'count', async () => 0);
  stub(prisma.userPermission, 'deleteMany', async () => ({ count: 0 }));
  stub(prisma.notification, 'deleteMany', async () => ({ count: 0 }));
  stub(prisma.userSignature, 'findUnique', async ({ where }: any) => signatures.get(where.userId) ? { ...signatures.get(where.userId) } : null);
  stub(prisma.userSignature, 'upsert', async ({ where, create, update }: any) => {
    const prior = signatures.get(where.userId);
    const row = prior ? { ...prior, ...update, updatedAt: new Date(prior.updatedAt.getTime() + 1000) } : { ...create, createdAt: new Date(), updatedAt: new Date() };
    signatures.set(where.userId, row); return { ...row };
  });
  stub(prisma.userSignature, 'delete', async ({ where }: any) => { const row = signatures.get(where.userId); signatures.delete(where.userId); return row; });
  stub(prisma.auditLog, 'create', async ({ data }: any) => { audits.push(data); return data; });
  stub(prisma.podStorageDeletion, 'create', async ({ data }: any) => { const job = { id: `job-${jobs.length + 1}`, attempts: 0, nextAttemptAt: new Date(0), createdAt: new Date(), ...data }; jobs.push(job); return job; });
  stub(prisma.podStorageDeletion, 'findMany', async ({ where }: any) => jobs.filter(job => matches(job, where)));
  stub(prisma.podStorageDeletion, 'deleteMany', async ({ where }: any) => { const before = jobs.length; for (let i = jobs.length - 1; i >= 0; i--) if (jobs[i].id === where.id) jobs.splice(i, 1); return { count: before - jobs.length }; });
  stub(prisma.podStorageDeletion, 'updateMany', async () => ({ count: 0 }));
  stub(signatureStorage, 'save', async (key: string, file: any) => {
    assert.ok(isValidSignatureStorageKey(key), 'storage keys are server-generated and opaque');
    files.set(key, 'buffer' in file ? file.buffer : await (await import('node:fs')).promises.readFile(file.path));
  });
  stub(signatureStorage, 'open', async (key: string) => { const bytes = files.get(key); if (!bytes) throw new Error('missing'); return Readable.from([bytes]); });
  stub(signatureStorage, 'read', async (key: string) => { const bytes = files.get(key); if (!bytes) throw new Error('missing'); return bytes; });
  stub(signatureStorage, 'remove', async (key: string) => { files.delete(key); });

  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/auth', authRoutes); app.use('/api/v1/users', usersRoutes); app.use('/api/v1/records', recordsRoutes);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.status ?? 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    while (restorers.length) restorers.pop()!();
    if (previousMode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = previousMode;
  });
  const cookieFor = (id: string) => { const user = users.get(id); return `mg_session=${signToken({ id, name: user.name, email: user.email, role: user.role })}`; };
  async function request(as: string | null, urlPath: string, init: RequestInit = {}) {
    return fetch(origin + urlPath, { ...init, headers: { ...(as ? { Cookie: cookieFor(as) } : {}), ...(init.headers as Record<string, string> ?? {}) } });
  }
  async function upload(as: string | null, urlPath: string, bytes: Buffer, name: string, type: string) {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)], { type }), name);
    return request(as, urlPath, { method: 'PUT', body: form });
  }
  const settle = async () => { for (let i = 0; i < 20 && jobs.length; i++) await new Promise(resolve => setTimeout(resolve, 5)); };
  return { request, upload, users, signatures, files, audits, jobs, settle };
}

// ── Pure validation ─────────────────────────────────────────────────────────
test('signature bytes must prove to be a decodable PNG or JPEG within 16..4096 px and 2 MB', async () => {
  const ok = await inspectSignatureBuffer(await png(), 'image/png');
  assert.ok(!('error' in ok));
  assert.deepEqual({ mimeType: ok.mimeType, width: ok.width, height: ok.height }, { mimeType: 'image/png', width: 240, height: 80 });
  assert.ok(Buffer.isBuffer(ok.buffer));
  assert.equal(ok.size, ok.buffer.length, 'size describes the canonical re-encoded bytes');
  assert.ok(ok.size <= MAX_SIGNATURE_BYTES);
  const decoded = await sharp(ok.buffer).metadata();
  assert.deepEqual([decoded.format, decoded.width, decoded.height], ['png', 240, 80]);
  assert.equal('error' in await inspectSignatureBuffer(await jpeg(), 'image/jpeg'), false);
  const cases: Record<string, [Buffer, 'image/png' | 'image/jpeg']> = {
    'SVG renamed to .png': [svg, 'image/png'], 'PDF renamed to .png': [pdf, 'image/png'], 'text renamed to .jpg': [Buffer.from('hello world, not an image'), 'image/jpeg'],
    'HTML renamed to .png': [Buffer.from('<html><body>x</body></html>'), 'image/png'], 'GIF renamed to .png': [await gif(), 'image/png'],
    'WebP renamed to .jpg': [await webp(), 'image/jpeg'], 'JPEG declared as PNG': [await jpeg(), 'image/png'], 'PNG declared as JPEG': [await png(), 'image/jpeg'],
    'truncated PNG': [(await png()).subarray(0, 60), 'image/png'], 'corrupt JPEG body': [(() => { const b = Buffer.alloc(400, 0); b.writeUInt16BE(0xffd8, 0); b.writeUInt16BE(0xffd9, 398); return b; })(), 'image/jpeg'],
    'too small (8x8)': [await png(8, 8), 'image/png'], 'too large (4097 wide)': [await png(4097, 16), 'image/png'], 'empty': [Buffer.alloc(0), 'image/png'],
  };
  for (const [name, [bytes, type]] of Object.entries(cases)) assert.equal('error' in await inspectSignatureBuffer(bytes, type), true, name);
  const oversized = await inspectSignatureBuffer(Buffer.alloc(MAX_SIGNATURE_BYTES + 1), 'image/png');
  assert.deepEqual(oversized, { error: SIGNATURE_TOO_LARGE_ERROR, status: 413 });
});

// ── Canonical re-encoding (metadata stripping and post-encode size cap) ─────
const METADATA_SENTINELS = ['PNG_EXIF_SECRET_META', 'PNG_ANCILLARY_SECRET_META', 'JPEG_EXIF_SECRET_META', 'SecretAuthor'];

/** Insert a valid (CRC-checked) PNG tEXt chunk just before IEND. */
function withPngTextChunk(source: Buffer, keyword: string, text: string): Buffer {
  const data = Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(text, 'latin1')]);
  const type = Buffer.from('tEXt', 'latin1');
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  type.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(zlib.crc32(Buffer.concat([type, data])) >>> 0, 8 + data.length);
  const iend = source.length - 12;
  assert.equal(source.subarray(iend + 4, iend + 8).toString('latin1'), 'IEND');
  return Buffer.concat([source.subarray(0, iend), chunk, source.subarray(iend)]);
}
const pngWithMetadata = async () => withPngTextChunk(
  await sharp({ create: { width: 240, height: 80, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } } })
    .withExif({ IFD0: { ImageDescription: 'PNG_EXIF_SECRET_META' } }).png().toBuffer(),
  'Comment', 'PNG_ANCILLARY_SECRET_META');
const jpegWithMetadata = () => sharp({ create: { width: 240, height: 80, channels: 3, background: { r: 255, g: 255, b: 255 } } })
  .withExif({ IFD0: { ImageDescription: 'JPEG_EXIF_SECRET_META', Artist: 'SecretAuthor' } }).jpeg().toBuffer();
/**
 * A valid JPEG under 2 MiB that grows past 2 MiB when re-encoded at quality 90:
 * high-entropy pixels saved small with mozjpeg at low quality (about 1.3 MB in,
 * about 2.4 MB out).
 */
const expandingJpeg = () => sharp(crypto.randomBytes(2800 * 2800 * 3), { raw: { width: 2800, height: 2800, channels: 3 } })
  .jpeg({ quality: 30, mozjpeg: true }).toBuffer();

async function assertMetadataFree(bytes: Buffer, format: 'png' | 'jpeg') {
  for (const sentinel of METADATA_SENTINELS) assert.equal(bytes.includes(sentinel), false, `${format} still contains ${sentinel}`);
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.format, format);
  assert.deepEqual([metadata.width, metadata.height], [240, 80]);
  assert.equal(metadata.exif, undefined, 'EXIF stripped');
  assert.equal(metadata.icc, undefined, 'ICC stripped');
  assert.equal(metadata.xmp, undefined, 'XMP stripped');
  assert.equal(metadata.iptc, undefined, 'IPTC stripped');
  assert.equal((metadata.comments ?? []).length, 0, 'PNG text chunks / JPEG comments stripped');
}

test('accepted signatures are re-encoded canonically without EXIF or PNG text chunks', async () => {
  const pngInput = await pngWithMetadata();
  const jpegInput = await jpegWithMetadata();
  assert.ok(pngInput.includes('PNG_EXIF_SECRET_META') && pngInput.includes('PNG_ANCILLARY_SECRET_META'), 'fixture carries PNG metadata');
  assert.ok((await sharp(pngInput).metadata()).exif);
  assert.ok(jpegInput.includes('JPEG_EXIF_SECRET_META') && jpegInput.includes('SecretAuthor'), 'fixture carries JPEG metadata');
  assert.ok((await sharp(jpegInput).metadata()).exif);
  for (const [input, type, format] of [[pngInput, 'image/png', 'png'], [jpegInput, 'image/jpeg', 'jpeg']] as const) {
    const result = await inspectSignatureBuffer(input, type);
    assert.ok(!('error' in result), format);
    assert.equal(result.size, result.buffer.length);
    await assertMetadataFree(result.buffer, format);
  }
});

test('a valid upload whose canonical re-encoding exceeds 2 MiB is rejected with 413', async () => {
  const input = await expandingJpeg();
  assert.ok(input.length < MAX_SIGNATURE_BYTES, `fixture input is under the cap (${input.length})`);
  assert.deepEqual(await inspectSignatureBuffer(input, 'image/jpeg'), { error: SIGNATURE_TOO_LARGE_ERROR, status: 413 });
  // The same rule holds for any cap: an input exactly at the cap that grows on
  // re-encoding is refused, so the stored bytes never exceed the limit.
  const small = await sharp(crypto.randomBytes(256 * 256 * 3), { raw: { width: 256, height: 256, channels: 3 } }).jpeg({ quality: 10 }).toBuffer();
  const reencoded = await sharp(small).jpeg({ quality: 90 }).toBuffer();
  assert.ok(reencoded.length > small.length, 'fixture grows when re-encoded');
  assert.deepEqual(await inspectSignatureBuffer(small, 'image/jpeg', small.length), { error: SIGNATURE_TOO_LARGE_ERROR, status: 413 });
});

test('LEGACY: uploads store and serve metadata-free canonical bytes; post-encode growth past 2 MiB stores nothing', async t => {
  const f = await fixture(t, 'LEGACY');
  for (const [input, name, type, format] of [
    [await pngWithMetadata(), 'meta.png', 'image/png', 'png'], [await jpegWithMetadata(), 'meta.jpg', 'image/jpeg', 'jpeg'],
  ] as const) {
    const response = await f.upload('tass', '/api/v1/auth/me/signature', input, name, type);
    assert.equal(response.status, 200, name);
    const row = f.signatures.get('tass');
    const stored = f.files.get(row.storageKey)!;
    await assertMetadataFree(stored, format);
    assert.equal(row.size, stored.length, 'UserSignature.size is the canonical stored size');
    assert.notEqual(row.size, input.length, 'the original upload bytes are not what was stored');
    const image = await f.request('tass', '/api/v1/auth/me/signature/image');
    const served = Buffer.from(await image.arrayBuffer());
    assert.deepEqual(served, stored);
    await assertMetadataFree(served, format);
  }
  await f.request('tass', '/api/v1/auth/me/signature', { method: 'DELETE' });
  await f.settle();
  const audits = f.audits.length;

  const input = await expandingJpeg();
  assert.ok(input.length < MAX_SIGNATURE_BYTES);
  const rejected = await f.upload('tass', '/api/v1/auth/me/signature', input, 'big-but-valid.jpg', 'image/jpeg');
  assert.equal(rejected.status, 413);
  assert.deepEqual(await rejected.json(), { error: SIGNATURE_TOO_LARGE_ERROR });
  assert.equal(f.files.size, 0, 'nothing stored');
  assert.equal(f.signatures.size, 0, 'no UserSignature row');
  assert.equal(f.audits.length, audits, 'no audit entry');
});

test('storage keys are opaque, server-generated, and signature storage is isolated from POD uploads', () => {
  for (const type of ['image/png', 'image/jpeg'] as const) assert.ok(isValidSignatureStorageKey(generateSignatureStorageKey(type)));
  assert.match(generateSignatureStorageKey('image/png'), /\.png$/);
  assert.match(generateSignatureStorageKey('image/jpeg'), /\.jpg$/);
  for (const key of ['../../evil.png', 'evil.png', 'sig-../../x.png', `sig-${'a'.repeat(36)}.png`, '/etc/passwd']) {
    assert.equal(isValidSignatureStorageKey(key), false, key);
    assert.throws(() => localSignaturePath(key), key);
  }
  const podDir = path.resolve(process.env.POD_UPLOAD_DIR || path.join(process.cwd(), 'uploads', 'pod'));
  const sigDir = signatureUploadDir();
  assert.notEqual(sigDir, podDir);
  assert.equal(sigDir.startsWith(`${podDir}${path.sep}`), false, 'reconcile-pod-files lists only the POD directory');
  assert.notEqual(signatureStorageNamespace, podStorageNamespace, 'POD cleanup never drains signature jobs');
});

for (const mode of ['LEGACY', 'V1'] as const) {
  test(`${mode}: self-service upload, preview, replace and delete with safe audit and durable cleanup`, async t => {
    const f = await fixture(t, mode);
    assert.equal((await f.request(null, '/api/v1/auth/me/signature')).status, 401);
    assert.equal((await f.upload(null, '/api/v1/auth/me/signature', await png(), 'sig.png', 'image/png')).status, 401);
    assert.deepEqual(await (await f.request('tass', '/api/v1/auth/me/signature')).json(), { has_signature: false, mime_type: null, size: null, width: null, height: null, updated_at: null, image_url: null });
    assert.equal((await f.request('tass', '/api/v1/auth/me/signature/image')).status, 404);

    const first = await f.upload('tass', '/api/v1/auth/me/signature', await png(), '../../evil.png', 'image/png');
    assert.equal(first.status, 200);
    const meta = await first.json() as any;
    assert.equal(meta.has_signature, true);
    assert.equal(meta.mime_type, 'image/png');
    assert.deepEqual([meta.width, meta.height], [240, 80]);
    assert.match(meta.image_url, /^\/api\/v1\/auth\/me\/signature\/image\?v=\d+$/);
    assert.equal(JSON.stringify(meta).includes('sig-'), false, 'the storage key is never returned');
    const stored = f.signatures.get('tass');
    assert.ok(isValidSignatureStorageKey(stored.storageKey));
    assert.equal(stored.storageKey.includes('evil'), false, 'client filename never reaches storage');
    assert.equal(stored.uploadedById, 'tass');

    const image = await f.request('tass', '/api/v1/auth/me/signature/image');
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal(image.headers.get('cache-control'), 'private, no-store');
    assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
    const received = Buffer.from(await image.arrayBuffer());
    assert.deepEqual(received, f.files.get(stored.storageKey), 'serves the exact canonical bytes that were stored');
    assert.equal(image.headers.get('content-length'), String(received.length));
    assert.equal(stored.size, received.length);
    const servedMeta = await sharp(received).metadata();
    assert.deepEqual([servedMeta.format, servedMeta.width, servedMeta.height], ['png', 240, 80]);

    const priorKey = stored.storageKey;
    const replaced = await f.upload('tass', '/api/v1/auth/me/signature', await jpeg(), 'scan.JPG', 'image/jpeg');
    assert.equal(replaced.status, 200);
    assert.equal(f.signatures.get('tass').mimeType, 'image/jpeg');
    await f.settle();
    assert.equal(f.files.has(priorKey), false, 'the replaced file is removed after commit');
    assert.equal(f.jobs.length, 0);

    const removed = await f.request('tass', '/api/v1/auth/me/signature', { method: 'DELETE' });
    assert.equal(removed.status, 204);
    await f.settle();
    assert.equal(f.signatures.has('tass'), false);
    assert.equal(f.files.size, 0);
    assert.equal((await f.request('tass', '/api/v1/auth/me/signature', { method: 'DELETE' })).status, 404);

    assert.equal(f.audits.length, 3);
    for (const entry of f.audits) {
      assert.deepEqual([entry.recordType, entry.action, entry.recordId, entry.changedById], ['User', 'UPDATE', 'tass', 'tass']);
      assert.equal(JSON.stringify(entry).includes('sig-'), false, 'audit never logs the storage key');
      assert.equal(JSON.stringify(entry).toLowerCase().includes('storagekey'), false);
    }
    assert.equal(JSON.parse(f.audits[0].newValue).has_signature, true);
    assert.equal(JSON.parse(f.audits[2].newValue).has_signature, false);
  });

  test(`${mode}: uploads are rejected by type, content and size before anything is stored`, async t => {
    const f = await fixture(t, mode);
    const expect = async (bytes: Buffer, name: string, type: string, status: number, error?: string) => {
      const response = await f.upload('tass', '/api/v1/auth/me/signature', bytes, name, type);
      assert.equal(response.status, status, `${name} (${type})`);
      if (error) assert.equal((await response.json() as any).error, error);
    };
    await expect(svg, 'sig.svg', 'image/svg+xml', 400, UNSUPPORTED_SIGNATURE_TYPE);
    await expect(pdf, 'sig.pdf', 'application/pdf', 400, UNSUPPORTED_SIGNATURE_TYPE);
    await expect(await gif(), 'sig.gif', 'image/gif', 400, UNSUPPORTED_SIGNATURE_TYPE);
    await expect(await png(), 'sig.png', 'image/jpeg', 400, UNSUPPORTED_SIGNATURE_TYPE);
    await expect(svg, 'sig.png', 'image/png', 400);
    await expect(pdf, 'sig.jpg', 'image/jpeg', 400);
    await expect(Buffer.from('plain text'), 'sig.png', 'image/png', 400);
    await expect(await webp(), 'sig.png', 'image/png', 400);
    await expect((await png()).subarray(0, 80), 'sig.png', 'image/png', 400);
    await expect(Buffer.alloc(MAX_SIGNATURE_BYTES + 1, 1), 'big.png', 'image/png', 413, SIGNATURE_TOO_LARGE_ERROR);
    assert.equal((await f.request('tass', '/api/v1/auth/me/signature', { method: 'PUT' })).status, 400, 'a file is required');
    assert.equal(f.files.size, 0);
    assert.equal(f.signatures.size, 0);
    assert.equal(f.audits.length, 0);
  });

  test(`${mode}: only ADMIN manages another user's signature; hard delete queues the file`, async t => {
    const f = await fixture(t, mode);
    for (const role of ['tass', 'sales', 'logistics', 'driver']) {
      assert.equal((await f.request(role, '/api/v1/users/tass2/signature')).status, 403, role);
      assert.equal((await f.request(role, '/api/v1/users/tass2/signature/image')).status, 403, role);
      assert.equal((await f.upload(role, '/api/v1/users/tass2/signature', await png(), 'sig.png', 'image/png')).status, 403, role);
      assert.equal((await f.request(role, '/api/v1/users/tass2/signature', { method: 'DELETE' })).status, 403, role);
    }
    assert.equal((await f.request(null, '/api/v1/users/tass2/signature')).status, 401);
    assert.equal(f.files.size, 0);

    assert.equal((await f.upload('admin', '/api/v1/users/missing/signature', await png(), 'sig.png', 'image/png')).status, 404);
    assert.equal(f.files.size, 0, 'an unknown target is refused before any storage write');

    const saved = await f.upload('admin', '/api/v1/users/tass2/signature', await png(), 'sig.png', 'image/png');
    assert.equal(saved.status, 200);
    assert.match((await saved.json() as any).image_url, /^\/api\/v1\/users\/tass2\/signature\/image\?v=/);
    assert.equal(f.signatures.get('tass2').uploadedById, 'admin');
    const audit = f.audits.at(-1);
    assert.deepEqual([audit.recordType, audit.recordId, audit.changedById], ['User', 'tass2', 'admin']);
    assert.equal(JSON.stringify(audit).includes('sig-'), false);

    const list = await (await f.request('admin', '/api/v1/users')).json() as any[];
    const row = list.find(user => user.id === 'tass2');
    assert.equal(row.has_signature, true);
    assert.equal(row.signature_mime_type, 'image/png');
    assert.equal(JSON.stringify(list).includes('sig-'), false);
    assert.equal(JSON.stringify(list).includes('storageKey'), false);

    const preview = await f.request('admin', '/api/v1/users/tass2/signature/image');
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('cache-control'), 'private, no-store');
    assert.equal((await (await f.request('admin', '/api/v1/users/tass2/signature')).json() as any).has_signature, true);

    assert.equal((await f.request('admin', '/api/v1/users/tass2/signature', { method: 'DELETE' })).status, 204);
    await f.settle();
    assert.equal(f.files.size, 0);
    assert.equal((await f.request('admin', '/api/v1/users/tass2/signature', { method: 'DELETE' })).status, 404);

    if (mode === 'LEGACY') {
      await f.upload('admin', '/api/v1/users/tass2/signature', await png(), 'sig.png', 'image/png');
      const key = f.signatures.get('tass2').storageKey;
      const deleted = await f.request('admin', '/api/v1/users/tass2', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(deleted.status, 200);
      await f.settle();
      assert.equal(f.files.has(key), false, 'hard-deleting a user removes the backing signature file');
    }
  });

  test(`${mode}: issuer signatures are served only to callers who may read the RMA record`, async t => {
    const f = await fixture(t, mode);
    assert.equal((await f.upload('tass', '/api/v1/auth/me/signature', await png(), 'sig.png', 'image/png')).status, 200);
    for (const role of ['tass', 'tass2', 'logistics', 'admin', 'driver']) {
      const response = await f.request(role, '/api/v1/records/rma-one/issuer-signature');
      assert.equal(response.status, 200, role);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('x-signature-width'), '240');
      const received = Buffer.from(await response.arrayBuffer());
      assert.deepEqual(received, f.files.get(f.signatures.get('tass').storageKey), role);
      assert.equal(response.headers.get('content-length'), String(received.length), role);
      const served = await sharp(received).metadata();
      assert.deepEqual([served.format, served.width, served.height], ['png', 240, 80], role);
    }
    assert.equal((await f.request(null, '/api/v1/records/rma-one/issuer-signature')).status, 401);
    assert.equal((await f.request('sales', '/api/v1/records/rma-one/issuer-signature')).status, 403);
    assert.equal((await f.request('driver2', '/api/v1/records/rma-one/issuer-signature')).status, 403, 'unassigned driver');
    assert.equal((await f.request('driver', '/api/v1/records/rma-two/issuer-signature')).status, 403, 'internal movement is not a driver run');
    assert.equal((await f.request('tass', '/api/v1/records/missing/issuer-signature')).status, 403);
    assert.equal((await f.request('admin', '/api/v1/records/delivery-one/issuer-signature')).status, 404, 'non-RMA');

    const none = await f.request('tass', '/api/v1/records/rma-two/issuer-signature');
    assert.equal(none.status, 204, 'creator without a signature');
    assert.equal(none.headers.get('x-signature-status'), 'none');
    assert.equal(none.headers.get('cache-control'), 'private, no-store');

    f.files.clear();
    assert.equal((await f.request('tass', '/api/v1/records/rma-one/issuer-signature')).status, 204, 'missing backing file falls back cleanly');
  });
}
