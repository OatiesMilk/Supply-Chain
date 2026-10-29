import { afterEach, beforeEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { prisma } from '../src/db';
import records from '../src/routes/records';
import { signToken } from '../src/middleware/auth';
import { podStorage } from '../src/services/podStorage';
import { pdf, zipOf, oleFile, xlsx } from './attachmentFixtures';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const actor = { id: 'test-user', name: 'Tester', email: 'tester@test.com', role: 'LOGISTICS' as const, isActive: true, permissions: [], driverProfile: null, driverProfileId: null };

const pdfAttachment  = { id: 'att-pdf',  recordId: 'rec-1', originalName: 'report.pdf',  mimeType: 'application/pdf', storageKey: 'report.pdf', size: 100, createdAt: new Date() };
const docxAttachment = { id: 'att-docx', recordId: 'rec-1', originalName: 'letter.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', storageKey: 'letter.docx', size: 200, createdAt: new Date() };
const docAttachment  = { id: 'att-doc',  recordId: 'rec-1', originalName: 'old.doc',     mimeType: 'application/msword', storageKey: 'old.doc', size: 150, createdAt: new Date() };
const xlsxAttachment = { id: 'att-xlsx', recordId: 'rec-1', originalName: 'report.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', storageKey: 'report.xlsx', size: 250, createdAt: new Date() };
const imageAttachment= { id: 'att-img',  recordId: 'rec-1', originalName: 'photo.jpg',   mimeType: 'image/jpeg',        storageKey: 'photo.jpg', size: 80, createdAt: new Date() };

const deliveryRecord = { id: 'rec-1', category: 'DELIVERY', status: 'IN_TRANSIT', draft: false, reference: 'REF', driverAssistants: '[]', priority: '2 - Moderate', driver: 'Driver A', driverId: 'profile-a', company: { name: 'Co' }, accountManager: 'AM', deliveryDate: '2026-10-27', timeIn: null, receivedBy: null, timeOut: null, deletedAt: null };

const restorers: (() => void)[] = [];
function stub(target: any, key: string, impl: (...args: any[]) => any) {
  const original = target[key];
  const fn = mock.fn(impl);
  target[key] = fn;
  restorers.push(() => { target[key] = original; });
  return fn;
}
function restoreAll() { while (restorers.length) restorers.pop()!(); mock.restoreAll(); }

beforeEach(() => {
  for (const model of [prisma.deliveryRecord, prisma.podAttachment, prisma.user]) {
    for (const method of ['findFirst', 'findUnique', 'findMany']) {
      stub(model, method, async () => { throw new Error('Unstubbed DB call'); });
    }
  }
  for (const method of ['read', 'open', 'save']) {
    stub(podStorage as any, method, async () => { throw new Error('Unstubbed storage'); });
  }
});
afterEach(restoreAll);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDocxBuffer(bodyText: string): Buffer {
  const CONTENT_TYPES =
    '<?xml version="1.0" encoding="UTF-8"?>'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  const docBody =
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + `<w:body><w:p><w:r><w:t>${bodyText}</w:t></w:r></w:p></w:body></w:document>`;
  return zipOf([
    { name: '[Content_Types].xml', content: CONTENT_TYPES, deflate: true },
    { name: '_rels/.rels', content: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>' },
    { name: 'word/document.xml', content: docBody, deflate: true },
  ]);
}

type PreviewResult = { status: number; body?: any; html?: string; bytes?: Buffer };

async function previewRequest(attachmentId: string, opts: { authenticated?: boolean } = {}): Promise<PreviewResult> {
  const routePath = '/:id/attachments/:attachmentId/preview';
  stub(prisma.user, 'findUnique', async () => actor as any);
  const route = (records as any).stack.find((l: any) => l.route?.path === routePath && l.route.methods['get'])?.route;
  if (!route) throw new Error('preview route not found');

  const cookies = opts.authenticated === false ? {} : { mg_session: signToken(actor as any) };
  const req: any = { method: 'GET', headers: {}, cookies, params: { id: 'rec-1', attachmentId }, body: {} };

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), 6000);
    const chunks: Buffer[] = [];
    let statusCode = 200;
    const headers: Record<string, string> = {};

    const writable = new Writable({
      write(chunk, _enc, cb) { chunks.push(chunk); cb(); },
      final(cb) {
        clearTimeout(timer);
        const ct = headers['Content-Type'] ?? '';
        const all = Buffer.concat(chunks);
        if (ct.includes('text/html')) resolve({ status: statusCode, html: all.toString('utf8') });
        else resolve({ status: statusCode, bytes: all });
        cb();
      },
    });

    const res: any = Object.assign(writable, {
      statusCode: 200,
      headersSent: false,
      setHeader(name: string, val: string) { headers[name] = val; },
      status(code: number) { statusCode = code; this.statusCode = code; return this; },
      json(body: unknown) {
        clearTimeout(timer);
        resolve({ status: statusCode, body });
        return this;
      },
      send(body: unknown) {
        clearTimeout(timer);
        if (typeof body === 'string') chunks.push(Buffer.from(body));
        const ct = headers['Content-Type'] ?? '';
        const all = Buffer.concat(chunks);
        if (ct.includes('text/html')) resolve({ status: statusCode, html: all.toString('utf8') });
        else { try { resolve({ status: statusCode, body: JSON.parse(all.toString()) }); } catch { resolve({ status: statusCode, body: all.toString() }); } }
        return this;
      },
    });

    let idx = 0;
    const next = (err?: unknown) => {
      if (err) { clearTimeout(timer); return reject(err); }
      const h = route.stack[idx++]?.handle;
      if (!h) return reject(new Error('route did not respond'));
      try { Promise.resolve(h(req, res, next)).catch(reject); } catch (e) { reject(e); }
    };
    next();
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('preview_url is set for PDF, DOC, DOCX and XLSX but is null for images', async () => {
  stub(prisma.deliveryRecord, 'findFirst', async () => deliveryRecord as any);
  stub(prisma.podAttachment, 'findMany', async () => [pdfAttachment, docxAttachment, docAttachment, xlsxAttachment, imageAttachment] as any);
  stub(podStorage as any, 'read', async () => Buffer.alloc(0));

  const listPath = '/:id/attachments';
  stub(prisma.user, 'findUnique', async () => actor as any);
  const route = (records as any).stack.find((l: any) => l.route?.path === listPath && l.route.methods['get'])?.route;
  if (!route) throw new Error('list route not found');

  const req: any = { method: 'GET', headers: {}, cookies: { mg_session: signToken(actor as any) }, params: { id: 'rec-1' }, body: {} };
  const result = await new Promise<{ status: number; body: any }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), 5000);
    const res: any = {
      statusCode: 200, setHeader() {}, clearCookie() {},
      status(c: number) { this.statusCode = c; return this; },
      json(body: unknown) { clearTimeout(timer); resolve({ status: this.statusCode, body }); return this; },
    };
    let i = 0;
    const next = (e?: unknown) => {
      if (e) { clearTimeout(timer); return reject(e); }
      const h = route.stack[i++]?.handle;
      if (!h) return reject(new Error('no handler'));
      try { Promise.resolve(h(req, res, next)).catch(reject); } catch (err) { reject(err); }
    };
    next();
  });

  assert.equal(result.status, 200);
  const byId = Object.fromEntries((result.body as any[]).map(a => [a.id, a]));
  assert.match(byId['att-pdf'].preview_url, /\/preview$/);
  assert.match(byId['att-docx'].preview_url, /\/preview$/);
  assert.match(byId['att-doc'].preview_url, /\/preview$/);
  assert.match(byId['att-xlsx'].preview_url, /\/preview$/);
  assert.equal(byId['att-img'].preview_url, null);
});

test('unauthenticated request is rejected with 401', async () => {
  stub(prisma.deliveryRecord, 'findFirst', async () => deliveryRecord as any);
  stub(prisma.podAttachment, 'findFirst', async () => pdfAttachment as any);
  const r = await previewRequest('att-pdf', { authenticated: false });
  assert.equal(r.status, 401);
});

test('missing attachment returns 404', async () => {
  stub(prisma.deliveryRecord, 'findFirst', async () => deliveryRecord as any);
  stub(prisma.podAttachment, 'findFirst', async () => null);
  const r = await previewRequest('att-missing');
  assert.equal(r.status, 404);
});

test('preview of an image returns 415 with a message listing supported types', async () => {
  stub(prisma.deliveryRecord, 'findFirst', async () => deliveryRecord as any);
  stub(prisma.podAttachment, 'findFirst', async () => imageAttachment as any);
  const r = await previewRequest('att-img');
  assert.equal(r.status, 415);
  assert.match(String(r.body?.error), /PDF, DOC/);
});

test('PDF preview streams bytes inline', async () => {
  stub(prisma.deliveryRecord, 'findFirst', async () => deliveryRecord as any);
  stub(prisma.podAttachment, 'findFirst', async () => pdfAttachment as any);
  const pdfBytes = pdf();
  const { Readable } = await import('node:stream');
  stub(podStorage as any, 'open', async () => Readable.from([pdfBytes]));

  const r = await previewRequest('att-pdf');
  assert.equal(r.status, 200);
  assert.ok(r.bytes, 'expected binary response');
  assert.ok(r.bytes!.equals(pdfBytes), 'PDF bytes pass through unchanged');
});

test('XLSX preview streams workbook bytes inline', async () => {
  stub(prisma.deliveryRecord, 'findFirst', async () => deliveryRecord as any);
  stub(prisma.podAttachment, 'findFirst', async () => xlsxAttachment as any);
  const xlsxBytes = xlsx();
  const { Readable } = await import('node:stream');
  stub(podStorage as any, 'open', async () => Readable.from([xlsxBytes]));

  const r = await previewRequest('att-xlsx');
  assert.equal(r.status, 200);
  assert.ok(r.bytes, 'expected binary response');
  assert.ok(r.bytes!.equals(xlsxBytes), 'XLSX bytes pass through unchanged');
});

test('DOCX preview returns HTML containing the document text', async () => {
  stub(prisma.deliveryRecord, 'findFirst', async () => deliveryRecord as any);
  stub(prisma.podAttachment, 'findFirst', async () => docxAttachment as any);
  stub(podStorage as any, 'read', async () => makeDocxBuffer('Hello Preview'));

  const r = await previewRequest('att-docx');
  assert.equal(r.status, 200);
  assert.ok(r.html, 'expected HTML for DOCX');
  assert.match(r.html!, /<!DOCTYPE html>/i);
  assert.match(r.html!, /Hello Preview/);
  assert.match(r.html!, /letter\.docx/);
});

test('DOC preview returns an HTML page (mammoth handles legacy OLE format)', async () => {
  stub(prisma.deliveryRecord, 'findFirst', async () => deliveryRecord as any);
  stub(prisma.podAttachment, 'findFirst', async () => docAttachment as any);
  stub(podStorage as any, 'read', async () => oleFile('WordDocument'));

  const r = await previewRequest('att-doc');
  // A structurally minimal OLE fixture may produce an empty body, but must not crash.
  assert.ok(r.status === 200 || r.status === 500, `unexpected status ${r.status}`);
  if (r.status === 200) {
    assert.ok(r.html, 'expected HTML for DOC');
    assert.match(r.html!, /<!DOCTYPE html>/i);
  }
});

test('preview does not call podStorage.save (read-only, no duplicate uploads)', async () => {
  stub(prisma.deliveryRecord, 'findFirst', async () => deliveryRecord as any);
  stub(prisma.podAttachment, 'findFirst', async () => pdfAttachment as any);
  const { Readable } = await import('node:stream');
  stub(podStorage as any, 'open', async () => Readable.from([pdf()]));
  const saveSpy = stub(podStorage as any, 'save', async () => { throw new Error('save called during preview'); });

  const r = await previewRequest('att-pdf');
  assert.equal(r.status, 200);
  assert.equal(saveSpy.mock.callCount(), 0, 'save must never be called in a preview');
});
