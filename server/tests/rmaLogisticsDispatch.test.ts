import { before, test, mock, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import express from 'express';
import cookieParser from 'cookie-parser';
import nodemailer from 'nodemailer';
import { Client as GraphClient } from '@microsoft/microsoft-graph-client';
import type { PolicyRole } from '../src/services/permissionCatalog';

// Feature 5b: TASS -> Logistics daily handoff. Database doubles only (no
// PostgreSQL); SMTP and Microsoft Graph are stubbed at their client boundaries,
// so no network call or credential is ever used.

// Provider isolation happens BEFORE any application module loads. src/db.ts runs
// dotenv.config(), which never overrides a key that is already defined, so every
// provider key is blanked to '' (never deleted) and server/.env cannot rehydrate it.
const ISOLATED_PROVIDER_KEYS = [
  'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID', 'AZURE_REDIRECT_URI',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_SECURE',
  'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_STORAGE_BUCKET', 'SUPABASE_SIGNATURE_BUCKET',
  'NOTION_API_KEY', 'BILLING_NOTIFICATION_USER_EMAIL',
] as const;
function blankProviderEnv() {
  for (const key of Object.keys(process.env)) {
    if (/^(AZURE_|SMTP_|SUPABASE_|NOTION_|BILLING_NOTIFICATION_)/.test(key)) process.env[key] = '';
  }
  for (const key of ISOLATED_PROVIDER_KEYS) process.env[key] = '';
}
blankProviderEnv();
process.env.DISPATCH_TEMP_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), 'mg-dispatch-test-'));

async function importAppModules() {
  blankProviderEnv();
  const [db, auth, rmaDispatch, records, dispatchPermissions, mailer, businessAudit, dispatchUpload, rmaLogisticsDispatch] = await Promise.all([
    import('../src/db'),
    import('../src/middleware/auth'),
    import('../src/routes/rmaDispatch'),
    import('../src/routes/records'),
    import('../src/services/rmaDispatchPermissions'),
    import('../src/services/mailer'),
    import('../src/services/businessAudit'),
    import('../src/services/dispatchUpload'),
    import('../src/services/rmaLogisticsDispatch'),
  ]);
  return {
    prisma: db.prisma, signToken: auth.signToken, rmaDispatchRoutes: rmaDispatch.default, recordsRoutes: records.default,
    dispatchRolePermissions: dispatchPermissions.dispatchRolePermissions, sendEmail: mailer.sendEmail,
    safeBusinessAudit: businessAudit.safeBusinessAudit, dispatchUpload, rmaLogisticsDispatch,
  };
}
type AppModules = Awaited<ReturnType<typeof importAppModules>>;
let appModulesPromise: Promise<AppModules> | null = null;
const loadAppModules = () => (appModulesPromise ??= importAppModules());

// Module bindings, assigned once the isolated environment has loaded them.
let prisma: AppModules['prisma'];
let signToken: AppModules['signToken'];
let rmaDispatchRoutes: AppModules['rmaDispatchRoutes'];
let recordsRoutes: AppModules['recordsRoutes'];
let dispatchRolePermissions: AppModules['dispatchRolePermissions'];
let sendEmail: AppModules['sendEmail'];
let safeBusinessAudit: AppModules['safeBusinessAudit'];
let dispatchXlsxError: AppModules['dispatchUpload']['dispatchXlsxError'];
let isDispatchPdf: AppModules['dispatchUpload']['isDispatchPdf'];
let zipEntryNames: AppModules['dispatchUpload']['zipEntryNames'];
let MACRO_DISPATCH_XLSX: string, INVALID_DISPATCH_XLSX: string, MAX_DISPATCH_FILE_BYTES: number;
let classifySend: AppModules['rmaLogisticsDispatch']['classifySend'];
let deliverableEmail: AppModules['rmaLogisticsDispatch']['deliverableEmail'];
let dispatchFileNames: AppModules['rmaLogisticsDispatch']['dispatchFileNames'];
let escapeHtml: AppModules['rmaLogisticsDispatch']['escapeHtml'];
let orderDispatchRecords: AppModules['rmaLogisticsDispatch']['orderDispatchRecords'];
let parseDispatchInput: AppModules['rmaLogisticsDispatch']['parseDispatchInput'];
let DispatchError: AppModules['rmaLogisticsDispatch']['DispatchError'];
let UNCONFIRMED_PERSISTENCE_ERROR: string, IN_PROGRESS_RETRY_MESSAGE: string;
let safePhase3LogMetadata: AppModules['rmaLogisticsDispatch']['safePhase3LogMetadata'];
before(async () => {
  const m = await loadAppModules();
  ({ prisma, signToken, rmaDispatchRoutes, recordsRoutes, dispatchRolePermissions, sendEmail, safeBusinessAudit } = m);
  ({ dispatchXlsxError, isDispatchPdf, zipEntryNames, MACRO_DISPATCH_XLSX, INVALID_DISPATCH_XLSX, MAX_DISPATCH_FILE_BYTES } = m.dispatchUpload);
  ({ classifySend, deliverableEmail, dispatchFileNames, escapeHtml, orderDispatchRecords, parseDispatchInput, DispatchError, UNCONFIRMED_PERSISTENCE_ERROR,
    IN_PROGRESS_RETRY_MESSAGE, safePhase3LogMetadata } = m.rmaLogisticsDispatch);
});

type Mode = 'LEGACY' | 'V1';
const ROLES: PolicyRole[] = ['ADMIN', 'SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'DRIVER'];

// ── Minimal stored ZIP builder for OOXML fixtures ───────────────────────────
function zip(entries: Record<string, string>): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name, 'utf8'), data = Buffer.from(content, 'utf8'), crc = zlib.crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data); centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(Object.keys(entries).length, 8); eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}
const OOXML = { '[Content_Types].xml': '<Types/>', '_rels/.rels': '<Relationships/>', 'xl/workbook.xml': '<workbook/>', 'xl/worksheets/sheet1.xml': '<worksheet/>' };
const xlsx = zip(OOXML);
const xlsm = zip({ ...OOXML, 'xl/vbaProject.bin': 'macro' });
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\nstartxref\n9\n%%EOF\n');

function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, value]: [string, any]) => {
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(condition => matches(row, condition));
    if (key === 'OR') return value.some((condition: any) => matches(row, condition));
    if (key === 'NOT') return !(Array.isArray(value) ? value : [value]).some(condition => matches(row, condition));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(row[key]);
      if ('not' in value) return row[key] !== value.not;
      if ('contains' in value) return String(row[key] ?? '').toLowerCase().includes(String(value.contains).toLowerCase());
      return matches(row[key] ?? {}, value);
    }
    return row[key] === value;
  });
}

async function fixture(t: TestContext, mode: Mode) {
  const previous = { mode: process.env.PERMISSION_MODE, smtp: process.env.SMTP_HOST, azure: [process.env.AZURE_CLIENT_ID, process.env.AZURE_CLIENT_SECRET, process.env.AZURE_TENANT_ID] };
  process.env.PERMISSION_MODE = mode;
  process.env.SMTP_HOST = ''; process.env.AZURE_CLIENT_ID = ''; process.env.AZURE_CLIENT_SECRET = ''; process.env.AZURE_TENANT_ID = '';
  const account = (id: string, role: PolicyRole, extra: Record<string, any> = {}) => ({
    id, name: extra.name ?? `${role} ${id}`, email: extra.email ?? `${id}@example.test`, role, isActive: extra.isActive ?? true, authorizationRevision: 1n, password: 'x',
    permissions: [], permissionOverrides: (extra.deny ?? []).map((permissionKey: string) => ({ userId: id, permissionKey, effect: 'DENY' })),
    permissionConversion: { catalogVersion: 1 }, microsoftOid: null, microsoftApprovedAt: null, createdAt: new Date(), updatedAt: new Date(),
    driverProfile: extra.driverProfile ?? null,
  });
  const users = new Map<string, any>([
    ['tass', account('tass', 'TASS', { name: 'Roselyn Arguelles' })],
    ['tass2', account('tass2', 'TASS', { name: 'Abigail Celada' })],
    ['tass-revoked', account('tass-revoked', 'TASS', { deny: ['CATEGORY:RMA:READ'] })],
    ['admin', account('admin', 'ADMIN')], ['sales', account('sales', 'SALES_COORDINATOR')],
    ['driver', account('driver', 'DRIVER', { driverProfile: { id: 'driver-one', type: 'DRIVER', isActive: true } })],
    ['log-b', account('log-b', 'LOGISTICS', { name: 'Bravo Printer', email: 'bravo@example.test' })],
    ['log-a', account('log-a', 'LOGISTICS', { name: 'Alpha Printer', email: 'alpha@example.test' })],
    ['log-inactive', account('log-inactive', 'LOGISTICS', { isActive: false })],
    ['log-revoked', account('log-revoked', 'LOGISTICS', { deny: ['CATEGORY:RMA:READ'] })],
    ['log-noemail', account('log-noemail', 'LOGISTICS', { name: 'No Email Printer', email: 'printer@localhost' })],
  ]);
  const policies = new Map(ROLES.map(role => [role, { role, revision: 1n, catalogVersion: 1,
    permissions: [...dispatchRolePermissions(role)].map(([permissionKey, effect]) => ({ role, permissionKey, effect })) }]));
  const rma = (id: string, extra: Record<string, any>) => ({ id, category: 'RMA', deletedAt: null, draft: false, status: 'SCHEDULED', driverId: null,
    rmaMovement: 'INTERNAL_NO_DRIVER', deliveryDate: '2026-11-19', area: 'Caloocan', rmaType: 'Pull Out Slip', recordNo: `RMA-${id}`,
    company: { name: 'BDO Unibank Inc.' }, createdById: 'tass', accountManager: 'Leanne Pavoreal', ...extra });
  const records = [
    rma('rma-internal', { rmaReference: 'POS111926-01' }),
    rma('rma-route', { rmaReference: 'RTC111926-02', rmaType: 'Return to Customer Slip', rmaMovement: 'LOGISTICS_TRANSPORT', driverId: 'driver-one', company: { name: '<script>alert(1)</script> Corp' } }),
    rma('rma-supplier', { rmaReference: 'RTS111926-01', rmaType: 'Return to Supplier Slip', rmaMovement: 'SUPPLIER_COLLECTION', createdById: 'tass2' }),
    rma('rma-draft', { rmaReference: 'POS111926-02', draft: true }),
    { id: 'delivery-one', category: 'DELIVERY', deletedAt: null, draft: false, status: 'SCHEDULED', driverId: 'driver-one', rmaMovement: null, deliveryDate: '2026-11-19',
      area: 'Makati', company: { name: 'Delivery Co' }, createdById: 'sales', accountManager: 'AM', recordNo: 'DEL-1', rmaReference: null },
  ];
  const dispatches = new Map<string, any>();
  const notifications: any[] = [], logs: any[] = [], audits: any[] = [];
  const listCalls: any[] = [];
  const restorers: Array<() => void> = [];
  const stub = (target: any, key: string, fn: (...args: any[]) => any) => {
    const original = target[key]; target[key] = mock.fn(fn); restorers.push(() => { target[key] = original; }); return target[key];
  };
  const withDispatcher = (row: any) => row && { ...row, recordIds: [...row.recordIds], dispatchedBy: { name: users.get(row.dispatchedById)?.name ?? '' } };
  let transactions = 0;
  stub(prisma, '$transaction', async (work: any) => { transactions++; return typeof work === 'function' ? work(prisma) : Promise.all(work); });
  const locks = stub(prisma, '$queryRaw', async () => []);
  stub(prisma, '$executeRaw', async () => 1);
  stub(prisma.user, 'findUnique', async ({ where }: any) => structuredClone(users.get(where.id) ?? null));
  stub(prisma.user, 'findMany', async ({ where, orderBy }: any) => {
    const rows = [...users.values()].filter(user => matches(user, where)).map(user => structuredClone(user));
    return orderBy ? rows.sort((a, b) => a.name.localeCompare(b.name)) : rows;
  });
  stub(prisma.rolePolicy, 'findUnique', async ({ where }: any) => structuredClone(policies.get(where.role) ?? null));
  stub(prisma.rolePolicy, 'findMany', async () => []);
  stub(prisma.deliveryRecord, 'findMany', async (args: any) => { listCalls.push(args); return structuredClone(records.filter(row => matches(row, args.where))); });
  stub(prisma.deliveryRecord, 'groupBy', async ({ by, where }: any) => {
    const groups = new Map<string, any>();
    for (const row of records.filter(row => matches(row, where)) as any[]) groups.set(JSON.stringify(by.map((field: string) => row[field])), Object.fromEntries(by.map((field: string) => [field, row[field] ?? ''])));
    return [...groups.values()];
  });
  stub(prisma.notification, 'create', async ({ data }: any) => { const row = { id: `notif-${notifications.length + 1}`, ...data }; notifications.push(row); return row; });
  stub(prisma.notificationLog, 'create', async ({ data }: any) => { logs.push(data); return data; });
  stub(prisma.auditLog, 'create', async ({ data }: any) => { audits.push(data); return data; });
  stub(prisma.rmaLogisticsDispatch, 'findUnique', async ({ where }: any) => withDispatcher(dispatches.get(where.idempotencyKey)) ?? null);
  stub(prisma.rmaLogisticsDispatch, 'create', async ({ data }: any) => {
    const row = { id: `dispatch-${dispatches.size + 1}`, createdAt: new Date('2026-11-19T08:55:00Z'), emailMethod: null, ...data };
    dispatches.set(data.idempotencyKey, row); return { ...row };
  });
  stub(prisma.rmaLogisticsDispatch, 'update', async ({ where, data }: any) => {
    const row = [...dispatches.values()].find(value => value.id === where.id); Object.assign(row, data); return withDispatcher(row);
  });
  stub(prisma.rmaLogisticsDispatch, 'findMany', async ({ where, take }: any) => [...dispatches.values()].filter(row => matches(row, where)).slice(0, take).map(withDispatcher));

  const app = express();
  app.use(express.json(), cookieParser());
  app.use('/api/v1/records', rmaDispatchRoutes); app.use('/api/v1/records', recordsRoutes);
  app.use((error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(error.status ?? 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    while (restorers.length) restorers.pop()!();
    const restore = (key: string, value: string | undefined) => { process.env[key] = value ?? ''; };
    restore('PERMISSION_MODE', previous.mode); restore('SMTP_HOST', previous.smtp);
    restore('AZURE_CLIENT_ID', previous.azure[0]); restore('AZURE_CLIENT_SECRET', previous.azure[1]); restore('AZURE_TENANT_ID', previous.azure[2]);
  });
  const cookieFor = (id: string) => { const user = users.get(id); return `mg_session=${signToken({ id, name: user.name, email: user.email, role: user.role })}`; };
  const request = (as: string, urlPath: string, init: RequestInit = {}) => fetch(origin + urlPath, { ...init, headers: { Cookie: cookieFor(as), ...(init.headers as Record<string, string> ?? {}) } });
  function form(fields: Record<string, string>, files: { client_slips?: Buffer | null; route_slip?: Buffer | null; names?: [string, string] } = {}) {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.append(key, value);
    const [pdfName, xlsxName] = files.names ?? ['evil.exe', '../../etc/passwd.xlsx'];
    if (files.client_slips !== null) body.append('client_slips', new Blob([new Uint8Array(files.client_slips ?? pdf)], { type: 'application/pdf' }), pdfName);
    if (files.route_slip !== null) body.append('route_slip', new Blob([new Uint8Array(files.route_slip ?? xlsx)], { type: 'application/octet-stream' }), xlsxName);
    return body;
  }
  const valid = (extra: Record<string, string> = {}) => ({ recipient_user_id: 'log-a', dispatch_date: '2026-11-19',
    record_ids: JSON.stringify(['rma-internal', 'rma-route', 'rma-supplier']), note: 'Please print <b>today</b>.', idempotency_key: 'dispatch-key-0001', ...extra });
  const dispatch = (as: string, fields: Record<string, string>, files?: Parameters<typeof form>[1]) =>
    request(as, '/api/v1/records/rma-logistics-dispatch', { method: 'POST', body: form(fields, files) });
  return { request, dispatch, valid, users, records, dispatches, notifications, logs, audits, listCalls, locks, transactions: () => transactions };
}

function captureSmtp(t: TestContext, fail = false) {
  process.env.SMTP_HOST = 'smtp.test.invalid';
  const sent: any[] = [];
  const original = nodemailer.createTransport;
  (nodemailer as any).createTransport = () => ({ sendMail: async (options: any) => { if (fail) throw new Error('SMTP 554 relay denied'); sent.push(options); return { messageId: 'x' }; } });
  t.after(() => { (nodemailer as any).createTransport = original; process.env.SMTP_HOST = ''; });
  return sent;
}
function captureGraph(t: TestContext) {
  process.env.AZURE_CLIENT_ID = 'client'; process.env.AZURE_CLIENT_SECRET = 'secret'; process.env.AZURE_TENANT_ID = '00000000-0000-0000-0000-000000000000';
  const posted: any[] = [];
  const original = GraphClient.initWithMiddleware;
  (GraphClient as any).initWithMiddleware = () => ({ api: (url: string) => ({ post: async (body: any) => { posted.push({ url, body }); } }) });
  t.after(() => { (GraphClient as any).initWithMiddleware = original; process.env.AZURE_CLIENT_ID = ''; process.env.AZURE_CLIENT_SECRET = ''; process.env.AZURE_TENANT_ID = ''; });
  return posted;
}
const quiet = (t: TestContext) => { const log = mock.method(console, 'log', () => {}); const error = mock.method(console, 'error', () => {}); t.after(() => { log.mock.restore(); error.mock.restore(); }); };

// ── Pure validation ─────────────────────────────────────────────────────────
test('PDF and XLSX content checks reject spoofed, malformed and macro-enabled files', () => {
  assert.equal(isDispatchPdf(pdf), true);
  for (const bad of [Buffer.from('<html>%PDF-</html>'), Buffer.from('%PDF-1.4 no end marker padding.....'), xlsx, Buffer.alloc(0)]) assert.equal(isDispatchPdf(bad), false);
  assert.deepEqual(zipEntryNames(xlsx), Object.keys(OOXML));
  assert.equal(dispatchXlsxError(xlsx), null);
  assert.equal(dispatchXlsxError(xlsm), MACRO_DISPATCH_XLSX);
  assert.equal(dispatchXlsxError(zip({ 'word/document.xml': '<w/>', '[Content_Types].xml': '<Types/>' })), INVALID_DISPATCH_XLSX);
  assert.equal(dispatchXlsxError(Buffer.from('PK\u0003\u0004 not really a zip')), INVALID_DISPATCH_XLSX);
  assert.equal(dispatchXlsxError(pdf), INVALID_DISPATCH_XLSX);
});

test('dispatch input accepts only server-validated fields and never an email address', () => {
  const ok = parseDispatchInput({ recipient_user_id: 'log-a', dispatch_date: '2026-11-19', record_ids: '["a","b"]' });
  assert.equal(ok.note, null); assert.match(ok.idempotencyKey, /^[0-9a-f-]{36}$/);
  const bad: Array<Record<string, unknown>> = [
    { recipient_user_id: 'log-a', dispatch_date: '2026-11-19', record_ids: '["a"]', recipient_email: 'attacker@evil.test' },
    { recipient_user_id: 'log a', dispatch_date: '2026-11-19', record_ids: '["a"]' },
    { recipient_user_id: 'log-a', dispatch_date: '2026-02-30', record_ids: '["a"]' },
    { recipient_user_id: 'log-a', dispatch_date: '2026-11-19', record_ids: '[]' },
    { recipient_user_id: 'log-a', dispatch_date: '2026-11-19', record_ids: '["a","a"]' },
    { recipient_user_id: 'log-a', dispatch_date: '2026-11-19', record_ids: JSON.stringify(Array.from({ length: 101 }, (_, i) => `r${i}`)) },
    { recipient_user_id: 'log-a', dispatch_date: '2026-11-19', record_ids: 'not json' },
    { recipient_user_id: 'log-a', dispatch_date: '2026-11-19', record_ids: '["a"]', note: 'x'.repeat(1001) },
    { recipient_user_id: 'log-a', dispatch_date: '2026-11-19', record_ids: '["a"]', idempotency_key: 'short' },
  ];
  for (const body of bad) assert.throws(() => parseDispatchInput(body), (error: unknown) => error instanceof DispatchError && error.status === 400, JSON.stringify(body).slice(0, 80));
  assert.deepEqual(dispatchFileNames('2026-11-19'), { routeSlipFileName: 'DRR111926.xlsx', clientSlipsFileName: 'Tass_Route_111926.pdf' });
  assert.equal(deliverableEmail('alpha@example.test'), true);
  for (const email of ['printer@localhost', 'a b@example.test', '', 'x@y']) assert.equal(deliverableEmail(email), false);
  assert.equal(escapeHtml('<a href="x">\'&'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  const ordered = orderDispatchRecords([
    { id: 'c', rmaMovement: 'INTERNAL_NO_DRIVER', deliveryDate: '2026-11-19', rmaReference: 'POS111926-01' },
    { id: 'b', rmaMovement: 'SUPPLIER_COLLECTION', deliveryDate: '2026-11-19', rmaReference: 'RTS111926-01' },
    { id: 'a2', rmaMovement: 'LOGISTICS_TRANSPORT', deliveryDate: '2026-11-20', rmaReference: 'RTC112026-01' },
    { id: 'a1', rmaMovement: 'LOGISTICS_TRANSPORT', deliveryDate: '2026-11-19', rmaReference: 'RTC111926-10' },
    { id: 'a0', rmaMovement: 'LOGISTICS_TRANSPORT', deliveryDate: '2026-11-19', rmaReference: 'RTC111926-9' },
    { id: 'd', rmaMovement: null, deliveryDate: '2026-11-18', rmaReference: 'RR111826-01' },
  ]);
  assert.deepEqual(ordered.map(row => row.id), ['a0', 'a1', 'a2', 'b', 'd', 'c']);
});

test('email outcome classification is truthful: mock is MOCKED and failures are FAILED, never SENT', () => {
  assert.deepEqual(classifySend({ ok: true, method: 'smtp' }), { emailStatus: 'SENT', emailMethod: 'smtp', emailError: null });
  assert.deepEqual(classifySend({ ok: true, method: 'graph' }), { emailStatus: 'SENT', emailMethod: 'graph', emailError: null });
  assert.deepEqual(classifySend({ ok: true, method: 'mock' }), { emailStatus: 'MOCKED', emailMethod: 'mock', emailError: null });
  const failed = classifySend({ ok: false, method: 'graph', error: `payload too large ${'x'.repeat(500)}` });
  assert.equal(failed.emailStatus, 'FAILED'); assert.ok(failed.emailError!.length <= 300);
});

test('mailer attachments reach SMTP and Graph payloads and Mock logs names without contents', async t => {
  quiet(t);
  const attachments = [{ filename: 'Tass_Route_111926.pdf', content: pdf, contentType: 'application/pdf' }];
  const smtp = captureSmtp(t);
  assert.deepEqual(await sendEmail({ to: 'alpha@example.test', subject: 'S', text: 'T', attachments }), { ok: true, method: 'smtp' });
  assert.equal(smtp[0].attachments[0].filename, 'Tass_Route_111926.pdf'); assert.ok(smtp[0].attachments[0].content.equals(pdf));
  assert.deepEqual(await sendEmail({ to: 'alpha@example.test', subject: 'S', text: 'T' }), { ok: true, method: 'smtp' });
  assert.equal('attachments' in smtp[1], false, 'text-only callers are unchanged');
  process.env.SMTP_HOST = '';
  const graph = captureGraph(t);
  assert.deepEqual(await sendEmail({ to: 'alpha@example.test', subject: 'S', text: 'T', attachments }), { ok: true, method: 'graph' });
  assert.deepEqual(graph[0].body.message.attachments, [{ '@odata.type': '#microsoft.graph.fileAttachment', name: 'Tass_Route_111926.pdf', contentType: 'application/pdf', contentBytes: pdf.toString('base64') }]);
  process.env.AZURE_CLIENT_ID = '';
  const logged: string[] = [];
  (console.log as any).mock.mockImplementation((...args: unknown[]) => { logged.push(args.join(' ')); });
  assert.deepEqual(await sendEmail({ to: 'alpha@example.test', subject: 'S', text: 'T', attachments }), { ok: true, method: 'mock' });
  assert.ok(logged.some(line => line.includes('Tass_Route_111926.pdf') && line.includes(`${pdf.length} bytes`)));
  assert.ok(!logged.some(line => line.includes('%PDF-')), 'binary contents are never logged');
});

for (const mode of ['LEGACY', 'V1'] as const) {
  test(`${mode}: Logistics recipient lookup is TASS-only and lists only active Logistics with RMA access and an email`, async t => {
    const state = await fixture(t, mode);
    const response = await state.request('tass', '/api/v1/records/rma-logistics-recipients');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { recipients: [
      { id: 'log-a', name: 'Alpha Printer', email: 'alpha@example.test' },
      { id: 'log-b', name: 'Bravo Printer', email: 'bravo@example.test' },
    ] });
    for (const as of ['admin', 'log-a', 'sales', 'driver', 'tass-revoked']) {
      assert.equal((await state.request(as, '/api/v1/records/rma-logistics-recipients')).status, 403, as);
    }
  });

  test(`${mode}: dispatch rejects other roles, revoked TASS, bad files, drafts, out-of-scope records and bad recipients`, async t => {
    quiet(t);
    const state = await fixture(t, mode);
    for (const as of ['admin', 'log-a', 'sales', 'driver', 'tass-revoked']) assert.equal((await state.dispatch(as, state.valid())).status, 403, as);
    const cases: Array<[string, Record<string, string>, Parameters<typeof state.dispatch>[2], number, RegExp]> = [
      ['spoofed text PDF', state.valid(), { client_slips: Buffer.from('hello, not a pdf') }, 400, /valid PDF/],
      ['HTML renamed PDF', state.valid(), { client_slips: Buffer.from('<html><body>%PDF-</body></html>') }, 400, /valid PDF/],
      ['PDF as workbook', state.valid(), { route_slip: pdf }, 400, /valid \.xlsx/],
      ['macro xlsm', state.valid(), { route_slip: xlsm }, 400, /Macro-enabled/],
      ['oversized PDF', state.valid(), { client_slips: Buffer.concat([pdf, Buffer.alloc(MAX_DISPATCH_FILE_BYTES)]) }, 413, /5 MB/],
      ['missing workbook', state.valid(), { route_slip: null }, 400, /Attach both/],
      ['draft RMA', state.valid({ record_ids: '["rma-route","rma-draft"]' }), {}, 400, /Draft RMA records cannot be dispatched/],
      ['non-RMA record', state.valid({ record_ids: '["rma-route","delivery-one"]' }), {}, 403, /not RMA records you can access/],
      ['missing record', state.valid({ record_ids: '["rma-route","nope"]' }), {}, 403, /not RMA records you can access/],
      ['arbitrary email field', state.valid({ recipient_email: 'attacker@evil.test' }), {}, 400, /unsupported fields/],
      ['inactive recipient', state.valid({ recipient_user_id: 'log-inactive' }), {}, 400, /active Logistics/],
      ['non-Logistics recipient', state.valid({ recipient_user_id: 'tass2' }), {}, 400, /active Logistics/],
      ['RMA-revoked recipient', state.valid({ recipient_user_id: 'log-revoked' }), {}, 403, /does not have access/],
    ];
    for (const [name, fields, files, status, message] of cases) {
      const response = await state.dispatch('tass', fields, files);
      assert.equal(response.status, status, name);
      assert.match((await response.json()).error, message, name);
    }
    assert.equal(state.dispatches.size, 0); assert.equal(state.notifications.length, 0); assert.equal(state.logs.length, 0);
    assert.deepEqual(fs.readdirSync(process.env.DISPATCH_TEMP_DIR!), [], 'every quarantined upload is deleted');
  });

  test(`${mode}: a mocked dispatch notifies in-app, attaches server-named files, logs and audits, and reports MOCKED`, async t => {
    quiet(t);
    const state = await fixture(t, mode);
    const response = await state.dispatch('tass', state.valid());
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.deduplicated, false);
    assert.equal(body.dispatch.email_status, 'MOCKED'); assert.equal(body.dispatch.email_method, 'mock');
    assert.equal(body.dispatch.in_app_notified, true);
    assert.deepEqual({ ...body.dispatch, id: undefined, created_at: undefined }, {
      id: undefined, created_at: undefined, dispatch_date: '2026-11-19', dispatched_by: 'Roselyn Arguelles', recipient: { id: 'log-a', name: 'Alpha Printer' },
      record_count: 3, logistics_count: 1, supplier_count: 1, internal_count: 1,
      route_slip_file_name: 'DRR111926.xlsx', client_slips_file_name: 'Tass_Route_111926.pdf',
      email_status: 'MOCKED', email_method: 'mock', in_app_notified: true, note: 'Please print <b>today</b>.',
    });
    const [stored] = state.dispatches.values();
    assert.deepEqual(stored.recordIds, ['rma-route', 'rma-supplier', 'rma-internal'], 'Logistics Route -> Supplier Collection -> Internal Printing');
    assert.equal(stored.recipientEmail, 'alpha@example.test');
    assert.equal(state.notifications.length, 1);
    assert.deepEqual({ userId: state.notifications[0].userId, recordId: state.notifications[0].recordId, recordType: state.notifications[0].recordType, title: state.notifications[0].title },
      { userId: 'log-a', recordId: 'rma-route', recordType: 'DeliveryRecord', title: 'TASS Daily Slips & Route Slip (11/19/2026)' });
    assert.match(state.notifications[0].message, /Roselyn Arguelles sent 3 RMA slips/);
    assert.deepEqual(state.logs.map(log => [log.triggerEvent, log.recipientRole, log.recipientName, log.status]), [['TASS_LOGISTICS_DISPATCH', 'LOGISTICS', 'Alpha Printer', 'MOCKED']]);
    assert.equal(state.audits.length, 1);
    assert.deepEqual({ recordType: state.audits[0].recordType, action: state.audits[0].action, changedById: state.audits[0].changedById, previousValue: state.audits[0].previousValue },
      { recordType: 'RmaLogisticsDispatch', action: 'CREATE', changedById: 'tass', previousValue: null });
    const audit = safeBusinessAudit('RmaLogisticsDispatch', state.audits[0].newValue)!;
    assert.deepEqual(audit, { dispatch_date: '2026-11-19', recipient_name: 'Alpha Printer', record_count: 3, logistics_count: 1, supplier_count: 1, internal_count: 1,
      route_slip_file_name: 'DRR111926.xlsx', client_slips_file_name: 'Tass_Route_111926.pdf', email_status: 'MOCKED', email_method: 'mock', in_app_notified: true });
    assert.ok(!state.audits[0].newValue.includes('alpha@example.test'), 'audit never stores the recipient email');
    assert.ok(state.locks.mock.calls.length >= 1, 'actor and recipient rows are locked');
    const lockSql = state.locks.mock.calls[0].arguments[0].join('?');
    assert.match(lockSql, /ORDER BY "id" FOR UPDATE/);
    assert.deepEqual(state.locks.mock.calls[0].arguments.slice(1).flatMap((value: any) => value?.values ?? value), ['log-a', 'tass'], 'locks are taken in sorted ID order');
    assert.deepEqual(fs.readdirSync(process.env.DISPATCH_TEMP_DIR!), []);

    // Same key again: no second email, notification, log or audit.
    const repeat = await state.dispatch('tass', state.valid());
    assert.equal(repeat.status, 200);
    const repeated = await repeat.json();
    assert.equal(repeated.deduplicated, true); assert.equal(repeated.dispatch.id, body.dispatch.id);
    assert.equal(state.notifications.length, 1); assert.equal(state.logs.length, 1); assert.equal(state.audits.length, 1);
    // Another TASS account cannot reuse someone else's key.
    assert.equal((await state.dispatch('tass2', state.valid())).status, 409);

    const recent = await state.request('log-a', '/api/v1/records/rma-logistics-dispatches?date=2026-11-19');
    assert.equal(recent.status, 200);
    assert.deepEqual((await recent.json()).dispatches.map((row: any) => [row.id, row.email_status]), [[body.dispatch.id, 'MOCKED']]);
    assert.deepEqual((await (await state.request('log-b', '/api/v1/records/rma-logistics-dispatches')).json()).dispatches, [], 'Logistics only sees handoffs addressed to them');
    assert.equal((await (await state.request('admin', '/api/v1/records/rma-logistics-dispatches')).json()).dispatches.length, 1);
    for (const as of ['sales', 'driver']) assert.equal((await state.request(as, '/api/v1/records/rma-logistics-dispatches')).status, 403, as);
    assert.equal((await state.request('tass', '/api/v1/records/rma-logistics-dispatches?limit=0')).status, 400);
    assert.equal((await state.request('tass', '/api/v1/records/rma-logistics-dispatches?date=11/19/2026')).status, 400);
  });
}

test('SMTP dispatch is SENT with both server-named attachments and an escaped, server-built body', async t => {
  quiet(t);
  const state = await fixture(t, 'LEGACY');
  const sent = captureSmtp(t);
  const response = await state.dispatch('tass', state.valid(), { names: ['malicious.html', 'macro.xlsm'] });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual([body.dispatch.email_status, body.dispatch.email_method, body.email_error], ['SENT', 'smtp', null]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'alpha@example.test');
  assert.deepEqual(sent[0].attachments.map((a: any) => [a.filename, a.contentType]), [
    ['Tass_Route_111926.pdf', 'application/pdf'],
    ['DRR111926.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ]);
  assert.ok(sent[0].attachments[0].content.equals(pdf)); assert.ok(sent[0].attachments[1].content.equals(xlsx));
  assert.ok(!sent[0].html.includes('<script>'), 'company names are HTML-escaped');
  assert.ok(sent[0].html.includes('&lt;script&gt;alert(1)&lt;/script&gt; Corp'));
  assert.ok(sent[0].html.includes('Please print &lt;b&gt;today&lt;/b&gt;.'));
  assert.match(sent[0].text, /RTC111926-02 \| <script>alert\(1\)<\/script> Corp \| Return to Customer Slip \| Logistics Route \| Caloocan/);
  assert.equal(state.logs[0].status, 'SENT');
});

test('Graph dispatch is SENT with fileAttachment payloads', async t => {
  quiet(t);
  const state = await fixture(t, 'V1');
  const posted = captureGraph(t);
  const body = await (await state.dispatch('tass', state.valid())).json();
  assert.deepEqual([body.dispatch.email_status, body.dispatch.email_method], ['SENT', 'graph']);
  assert.deepEqual(posted[0].body.message.attachments.map((a: any) => [a['@odata.type'], a.name, Buffer.from(a.contentBytes, 'base64').length]), [
    ['#microsoft.graph.fileAttachment', 'Tass_Route_111926.pdf', pdf.length],
    ['#microsoft.graph.fileAttachment', 'DRR111926.xlsx', xlsx.length],
  ]);
});

test('transport failure is FAILED (never SENT) with a safe error, and the in-app notice still exists', async t => {
  quiet(t);
  const state = await fixture(t, 'LEGACY');
  captureSmtp(t, true);
  const body = await (await state.dispatch('tass', state.valid())).json();
  assert.deepEqual([body.dispatch.email_status, body.dispatch.email_method, body.email_error, body.dispatch.in_app_notified], ['FAILED', 'smtp', 'SMTP 554 relay denied', true]);
  assert.equal(state.logs[0].status, 'FAILED');
  assert.equal(JSON.parse(state.audits[0].newValue).email_status, 'FAILED');
});

test('an undeliverable recipient email is SKIPPED: no send attempt, in-app notice only', async t => {
  quiet(t);
  const state = await fixture(t, 'LEGACY');
  const sent = captureSmtp(t);
  const body = await (await state.dispatch('tass', state.valid({ recipient_user_id: 'log-noemail' }))).json();
  assert.deepEqual([body.dispatch.email_status, body.dispatch.email_method, body.email_error], ['SKIPPED', null, 'Recipient account has no deliverable email address.']);
  assert.equal(sent.length, 0);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.logs[0].status, 'SKIPPED');
});

test('Created By filter, creators[] filter option and Status Trail account_manager/created_by filters', async t => {
  const state = await fixture(t, 'LEGACY');
  const list = await state.request('tass', '/api/v1/records?category=RMA&created_by=%20abigail%20&account_manager=leanne');
  assert.equal(list.status, 200);
  const where = state.listCalls.at(-1).where;
  assert.ok(where.AND.some((condition: any) => JSON.stringify(condition) === JSON.stringify({ createdBy: { name: { contains: 'abigail', mode: 'insensitive' } } })));
  assert.ok(where.AND.some((condition: any) => JSON.stringify(condition) === JSON.stringify({ accountManager: { contains: 'leanne', mode: 'insensitive' } })));
  assert.equal((await state.request('tass', `/api/v1/records?category=RMA&created_by=${'x'.repeat(101)}`)).status, 400);

  const options = await state.request('tass', '/api/v1/records/filter-options?category=RMA');
  assert.equal(options.status, 200);
  const json = await options.json();
  assert.deepEqual(json.creators, ['Abigail Celada', 'Roselyn Arguelles']);
  assert.deepEqual(Object.keys(json).sort(), ['accountManagers', 'areas', 'creators', 'drivers']);

  const before = state.listCalls.length;
  const counts = await state.request('tass', '/api/v1/records/status-history-counts?category=RMA&account_manager=Leanne&created_by=Roselyn');
  assert.equal(counts.status, 200);
  const countWhere = state.listCalls[before].where;
  assert.ok(countWhere.AND.some((condition: any) => condition.accountManager?.contains === 'Leanne'));
  assert.ok(countWhere.AND.some((condition: any) => condition.createdBy?.name?.contains === 'Roselyn'));
  assert.equal((await state.request('tass', `/api/v1/records/status-history-counts?category=RMA&created_by=${'x'.repeat(101)}`)).status, 400);
});

test('provider isolation: app modules load with every provider key blanked, so sendEmail stays on the offline mock', async t => {
  quiet(t);
  const modules = await loadAppModules(); // src/db.ts has already run dotenv.config()
  for (const key of ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID', 'SMTP_HOST', 'SUPABASE_URL', 'NOTION_API_KEY']) {
    assert.equal(process.env[key], '', `${key} is blank, not rehydrated from server/.env`);
  }
  const smtp = mock.method(nodemailer, 'createTransport', () => { throw new Error('SMTP must not be used'); });
  const graph = mock.method(GraphClient, 'initWithMiddleware', () => { throw new Error('Graph must not be used'); });
  try {
    assert.deepEqual(await modules.sendEmail({ to: 'isolated@example.test', subject: 'Isolation check', text: 'Offline only' }), { ok: true, method: 'mock' });
    assert.equal(smtp.mock.callCount(), 0); assert.equal(graph.mock.callCount(), 0);
  } finally { smtp.mock.restore(); graph.mock.restore(); }
});

/** Phase 1 is the first $transaction of a dispatch and Phase 3 the second. */
const SENSITIVE_TEXT = ['leak-target@example.test', 'SuperSecretPass99', 'tok_live_secret_123', 'postgres://', 'alpha@example.test'];
/** A Phase 3 error whose message carries synthetic secrets, plus a valid Prisma error code. */
const sensitivePhase3Error = () => Object.assign(
  new Error('DB write failed for leak-target@example.test postgres://dbuser:SuperSecretPass99@10.0.0.5:5432/prod Bearer tok_live_secret_123'),
  { code: 'P2024' },
);
function failPhase3(state: { failNext: boolean }) {
  const base = prisma.$transaction;
  let calls = 0;
  (prisma as any).$transaction = async (work: any, options?: any) => {
    calls++;
    if (state.failNext && calls % 2 === 0) { state.failNext = false; throw sensitivePhase3Error(); }
    return (base as any)(work, options);
  };
}

for (const fallbackFails of [false, true]) {
  test(`a Phase 3 failure after an accepted email is a structured 500, never SENT, and a same-key retry does not resend${fallbackFails ? ' (fallback update also fails)' : ''}`, async t => {
    quiet(t);
    const state = await fixture(t, 'LEGACY');
    const sent = captureSmtp(t);
    const control = { failNext: true };
    failPhase3(control);
    if (fallbackFails) {
      const update = prisma.rmaLogisticsDispatch.update;
      let failed = false;
      (prisma.rmaLogisticsDispatch as any).update = async (args: any) => {
        // The Phase 3 transaction already failed; the very next update is the fallback.
        if (!failed && !args.include) { failed = true; throw new Error('Simulated DB outage'); }
        return (update as any)(args);
      };
    }
    const response = await state.dispatch('tass', state.valid());
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.deepEqual({ code: body.code, in_app_notified: body.in_app_notified, mail_outcome: body.mail_outcome, email_method: body.email_method, persisted: body.persisted },
      { code: 'DISPATCH_FINALIZATION_FAILED', in_app_notified: true, mail_outcome: 'SENT', email_method: 'smtp', persisted: false });
    assert.match(body.error, /verify with Alpha Printer/); assert.match(body.error, /retrying will not resend/);
    assert.equal(sent.length, 1, 'the provider accepted one email');
    const [stored] = state.dispatches.values();
    assert.equal(stored.emailStatus, 'FAILED', 'never recorded as SENT without its log and audit');
    assert.equal(stored.emailError, fallbackFails ? 'Dispatch in progress' : UNCONFIRMED_PERSISTENCE_ERROR);
    assert.equal(state.notifications.length, 1); assert.equal(state.logs.length, 0); assert.equal(state.audits.length, 0);
    const phase3Logs = (console.error as any).mock.calls.filter((call: any) => call.arguments[0] === '[rmaLogisticsDispatch] Phase 3 finalization failed');
    assert.equal(phase3Logs.length, 1);
    assert.deepEqual(phase3Logs[0].arguments[1], { dispatchId: stored.id, mailOutcome: 'SENT', errorCode: 'P2024', errorName: 'Error' });
    const logged = JSON.stringify((console.error as any).mock.calls.map((call: any) => call.arguments));
    for (const secret of SENSITIVE_TEXT) assert.equal(logged.includes(secret), false, `no "${secret}" in server logs`);

    // Recent history right after the failure: uncertain, never a plain confirmed FAILED.
    for (const as of ['tass', 'log-a']) {
      const recent = await (await state.request(as, '/api/v1/records/rma-logistics-dispatches?date=2026-11-19')).json();
      assert.deepEqual(recent.dispatches.map((row: any) => [row.id, row.email_status, row.outcome_unconfirmed]), [[stored.id, 'FAILED', true]], as);
    }

    const retry = await state.dispatch('tass', state.valid());
    assert.equal(retry.status, 200);
    const again = await retry.json();
    assert.deepEqual({ deduplicated: again.deduplicated, outcome_unconfirmed: again.outcome_unconfirmed, email_error: again.email_error,
      status: again.dispatch.email_status, rowUnconfirmed: again.dispatch.outcome_unconfirmed },
    { deduplicated: true, outcome_unconfirmed: true, email_error: fallbackFails ? IN_PROGRESS_RETRY_MESSAGE : UNCONFIRMED_PERSISTENCE_ERROR,
      status: 'FAILED', rowUnconfirmed: true });
    assert.equal(sent.length, 1, 'zero duplicate email'); assert.equal(state.notifications.length, 1, 'zero duplicate notification');
    assert.deepEqual(fs.readdirSync(process.env.DISPATCH_TEMP_DIR!), []);
  });
}

test('a finalized dispatch retried with the same key is not flagged unconfirmed', async t => {
  quiet(t);
  const state = await fixture(t, 'LEGACY');
  captureSmtp(t, true);
  assert.equal((await state.dispatch('tass', state.valid())).status, 201);
  const again = await (await state.dispatch('tass', state.valid())).json();
  assert.equal(again.deduplicated, true); assert.equal(again.outcome_unconfirmed, undefined);
  assert.equal(again.email_error, 'SMTP 554 relay denied');
});

test('safePhase3LogMetadata keeps only an allow-listed code and error name', () => {
  assert.deepEqual(safePhase3LogMetadata('d1', 'SENT', sensitivePhase3Error()), { dispatchId: 'd1', mailOutcome: 'SENT', errorCode: 'P2024', errorName: 'Error' });
  assert.deepEqual(safePhase3LogMetadata('d2', 'FAILED', 'raw text leak-target@example.test postgres://u:SuperSecretPass99@h/db'),
    { dispatchId: 'd2', mailOutcome: 'FAILED', errorCode: null, errorName: 'UnknownError' });
  assert.deepEqual(safePhase3LogMetadata('d3', 'MOCKED', { code: 'bad@email.test', message: 'leak-target@example.test' }),
    { dispatchId: 'd3', mailOutcome: 'MOCKED', errorCode: null, errorName: 'UnknownError' });
  const odd = Object.assign(new Error('x'), { name: 'Name with spaces tok_live_secret_123', code: 'P'.repeat(40) });
  assert.deepEqual(safePhase3LogMetadata('d4', 'SKIPPED', odd), { dispatchId: 'd4', mailOutcome: 'SKIPPED', errorCode: null, errorName: 'UnknownError' });
  for (const value of [null, undefined, 42, { code: 7 }]) assert.deepEqual(safePhase3LogMetadata('d5', 'SENT', value).errorCode, null);
});

test('a same-key retry while the first send is still in flight reports an unconfirmed in-progress outcome and never resends', async t => {
  quiet(t);
  const state = await fixture(t, 'LEGACY');
  process.env.SMTP_HOST = 'smtp.test.invalid';
  const sent: any[] = [];
  let signalStarted!: () => void, releaseMail!: () => void;
  const mailStarted = new Promise<void>(resolve => { signalStarted = resolve; });
  const released = new Promise<void>(resolve => { releaseMail = resolve; });
  const original = nodemailer.createTransport;
  (nodemailer as any).createTransport = () => ({ sendMail: async (options: any) => { sent.push(options); signalStarted(); await released; return { messageId: 'held' }; } });
  t.after(() => { (nodemailer as any).createTransport = original; process.env.SMTP_HOST = ''; });

  const firstPromise = state.dispatch('tass', state.valid());
  await mailStarted; // Phase 1 committed; Phase 2 is blocked inside sendMail.
  const retry = await state.dispatch('tass', state.valid());
  assert.equal(retry.status, 200);
  const retryBody = await retry.json();
  assert.equal(retryBody.deduplicated, true);
  assert.equal(retryBody.outcome_unconfirmed, true);
  assert.equal(retryBody.dispatch.outcome_unconfirmed, true);
  assert.equal(retryBody.email_error, IN_PROGRESS_RETRY_MESSAGE);
  assert.doesNotMatch(retryBody.email_error, /Mail attempt finished/i);
  const recent = await (await state.request('tass', '/api/v1/records/rma-logistics-dispatches?date=2026-11-19')).json();
  assert.deepEqual(recent.dispatches.map((row: any) => [row.email_status, row.outcome_unconfirmed]), [['FAILED', true]]);
  assert.equal(sent.length, 1); assert.equal(state.notifications.length, 1);

  releaseMail();
  const first = await firstPromise;
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  assert.equal(firstBody.dispatch.email_status, 'SENT');
  assert.equal(firstBody.dispatch.outcome_unconfirmed, undefined);
  assert.equal(sent.length, 1); assert.equal(state.notifications.length, 1);
  const after = await (await state.request('tass', '/api/v1/records/rma-logistics-dispatches?date=2026-11-19')).json();
  assert.deepEqual(after.dispatches.map((row: any) => [row.email_status, row.outcome_unconfirmed]), [['SENT', undefined]]);
});
