/**
 * Target borderless Microgenesis client slip PDF (TASS Feature 5a, Section 4A).
 *
 * One layout for every TASS slip category (POS, RTC, RTS, ARD, RR, TXO); only
 * the title and the RTC-only Service Slip line change. Single slips and bulk
 * multi-page extraction share the same renderer.
 *
 * Zero data leak: the slip model is built only from client-safe fields via
 * buildRmaClientSlipData(). Internal Logistics remarks, workflow remarks,
 * remark logs, comments and audit history are never read here.
 */
import type { jsPDF } from 'jspdf';
import type { DeliveryRecord, RmaMovement } from '../types';
import { getPdfFormat, type DocumentSize } from './documentSize';
import { isReturnToCustomerCategory, rmaSlipTitle } from './rma';
import { formatSlipDate, type RmaItemBlock } from './rmaItems';
import { buildRmaClientSlipData } from './rmaSlip';

export const MAX_BULK_SLIP_RECORDS = 100;
export const DEFAULT_SLIP_DOCUMENT_SIZE: DocumentSize = 'a4';
const SIGNATURE_FETCH_CONCURRENCY = 4;

export interface IssuerSignature {
  dataUrl: string;
  mimeType: 'image/png' | 'image/jpeg';
  /** Pixel dimensions, used only for the aspect ratio. */
  width: number;
  height: number;
}

export interface SlipLogo { dataUrl: string; width: number; height: number }

export type SlipRecord = Pick<DeliveryRecord,
  'id' | 'rma_type' | 'rma_reference' | 'reference' | 'legacy_sap_reference' | 'company_name' | 'address' | 'delivery_date'
  | 'created_by' | 'created_by_id' | 'created_by_has_signature' | 'case_number' | 'service_slip_no' | 'client_remarks'
  | 'rma_contacts' | 'customer_contact_name' | 'customer_contact_phone' | 'line_items' | 'item_description' | 'purchase_date'
> & Partial<Pick<DeliveryRecord, 'rma_movement' | 'record_no'>>;

export interface RmaClientSlipModel {
  title: string;
  reference: string;
  companyName: string;
  address: string;
  contacts: string;
  caseNumber: string;
  remarks: string;
  date: string;
  ref: string;
  /** Rendered on Return to Customer Slip (RTC) only; null on every other category. */
  serviceSlip: string | null;
  items: RmaItemBlock[];
  issuedByName: string;
}

const text = (value: string | null | undefined) => (value ?? '').trim();

/** jsPDF's built-in Helvetica is WinAnsi: replace characters it cannot encode. */
export function pdfSafe(value: string): string {
  return value.replace(/₱/g, 'PHP ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-');
}

/** Client-safe slip model. Reads only header fields and buildRmaClientSlipData(). */
export function buildRmaClientSlipModel(record: SlipRecord, companies: ReadonlyArray<{ name: string; address?: string | null }> = []): RmaClientSlipModel {
  const slip = buildRmaClientSlipData(record);
  const companyAddress = companies.find(company => company.name === record.company_name)?.address;
  return {
    title: rmaSlipTitle(record.rma_type),
    reference: text(record.rma_reference) || text(record.reference),
    companyName: text(record.company_name),
    address: text(record.address) || text(companyAddress),
    contacts: slip.contacts,
    caseNumber: slip.caseNumber,
    remarks: slip.slipRemarks,
    date: formatSlipDate(record.delivery_date),
    ref: text(record.legacy_sap_reference),
    serviceSlip: isReturnToCustomerCategory(record.rma_type) ? (slip.serviceSlipNo ?? '') : null,
    items: slip.items,
    issuedByName: text(record.created_by),
  };
}

const MOVEMENT_ORDER: Record<RmaMovement, number> = { LOGISTICS_TRANSPORT: 0, SUPPLIER_COLLECTION: 1, INTERNAL_NO_DRIVER: 2 };
export const MOVEMENT_GROUP_LABELS = ['Logistics Route', 'Supplier Collection', 'Internal Printing'] as const;

/**
 * Bulk order: grouped Logistics Route → Supplier Collection → Internal Printing,
 * then delivery date, then reference — the same order as the Daily Route Slip.
 */
export function sortBulkSlipRecords<T extends SlipRecord>(records: readonly T[], groupByMovement: boolean): T[] {
  if (!groupByMovement) return [...records];
  const bucket = (record: T) => (record.rma_movement && MOVEMENT_ORDER[record.rma_movement] !== undefined ? MOVEMENT_ORDER[record.rma_movement] : 2);
  const date = (record: T) => text(record.delivery_date) || '9999-99-99';
  const key = (record: T) => text(record.rma_reference) || text(record.reference) || text(record.record_no) || record.id;
  return [...records].sort((a, b) => bucket(a) - bucket(b) || date(a).localeCompare(date(b)) || key(a).localeCompare(key(b), 'en', { numeric: true }));
}

export type IssuerSignatureFetcher = (recordId: string, signal?: AbortSignal) => Promise<IssuerSignature | null>;

/**
 * Fetch each distinct creator's signature at most once (bounded concurrency).
 * Creators known to have no signature cost no request. Failures resolve to
 * null so a missing signature never blocks slip generation.
 */
export async function prefetchIssuerSignatures(records: readonly SlipRecord[], fetcher: IssuerSignatureFetcher, signal?: AbortSignal) {
  const signatures = new Map<string, IssuerSignature | null>();
  const pending: { creatorId: string; recordId: string }[] = [];
  for (const record of records) {
    const creatorId = record.created_by_id || `record:${record.id}`;
    if (signatures.has(creatorId) || pending.some(entry => entry.creatorId === creatorId)) continue;
    if (record.created_by_has_signature === false) signatures.set(creatorId, null);
    else pending.push({ creatorId, recordId: record.id });
  }
  let requests = 0, missingSignatureCount = 0, next = 0;
  const worker = async () => {
    while (next < pending.length) {
      const { creatorId, recordId } = pending[next++];
      requests++;
      let signature: IssuerSignature | null = null;
      try { signature = await fetcher(recordId, signal); } catch { signature = null; }
      if (!signature) missingSignatureCount++;
      signatures.set(creatorId, signature);
    }
  };
  await Promise.all(Array.from({ length: Math.min(SIGNATURE_FETCH_CONCURRENCY, pending.length) }, worker));
  const lookup = (record: SlipRecord) => signatures.get(record.created_by_id || `record:${record.id}`) ?? null;
  return { signatures, lookup, requests, missingSignatureCount };
}

/** Largest box with the image's aspect ratio inside maxW × maxH. */
export function fitSignatureBox(width: number, height: number, maxW: number, maxH: number) {
  if (!(width > 0) || !(height > 0)) return { w: maxW, h: maxH };
  const scale = Math.min(maxW / width, maxH / height);
  return { w: width * scale, h: height * scale };
}

// ── Geometry (mm) ───────────────────────────────────────────────────────────
const M = 15;
const LINE_H = 5;
const FONT = 10;
const LOGO_W = 58;
const LOGO_RATIO = 498 / 1921;
const FOOTER_ZONE_H = 38;
const SIGN_LINE_W = 56;
const SIGNATURE_MAX_H = 9.5;
const INK: [number, number, number] = [0, 0, 0];

interface Geometry { pageW: number; pageH: number; width: number; rightColX: number; valueX: number; descX: number; qtyCenterX: number }
function geometry(doc: jsPDF): Geometry {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const width = pageW - 2 * M;
  return { pageW, pageH, width, rightColX: M + Math.round(width * 0.67), valueX: M + 35, descX: M + 35, qtyCenterX: M + 15 };
}

function setFont(doc: jsPDF, weight: 'normal' | 'bold', size = FONT) {
  doc.setFont('helvetica', weight);
  doc.setFontSize(size);
  doc.setTextColor(...INK);
}

/** Wrap text to width, preserving explicit line breaks. */
function wrap(doc: jsPDF, value: string, width: number): string[] {
  const safe = pdfSafe(value);
  if (!safe) return [''];
  return safe.split(/\r?\n/).flatMap(paragraph => (paragraph.trim() ? doc.splitTextToSize(paragraph, width) as string[] : ['']));
}

function drawHeader(doc: jsPDF, model: RmaClientSlipModel, logo: SlipLogo | null, g: Geometry, continued: boolean) {
  if (logo) {
    const h = LOGO_W * (logo.height > 0 && logo.width > 0 ? logo.height / logo.width : LOGO_RATIO);
    doc.addImage(logo.dataUrl, 'PNG', M, 11, LOGO_W, h, 'mg-slip-logo', 'FAST');
  }
  setFont(doc, 'bold', 13.5);
  const title = pdfSafe(model.title);
  doc.text(title, M, 33);
  const titleW = doc.getTextWidth(title);
  if (model.reference) doc.text(pdfSafe(model.reference), g.rightColX, 33);
  if (continued) {
    setFont(doc, 'normal', 8.5);
    doc.text('(Continued)', M + titleW + 2, 33);
  }
}

function drawItemHeaders(doc: jsPDF, g: Geometry, y: number) {
  setFont(doc, 'bold');
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.35);
  doc.text('QTY', g.qtyCenterX, y, { align: 'center' });
  const qtyW = doc.getTextWidth('QTY');
  doc.line(g.qtyCenterX - qtyW / 2, y + 1.1, g.qtyCenterX + qtyW / 2, y + 1.1);
  doc.text('ITEM DESCRIPTIONS', g.descX, y);
  doc.line(g.descX, y + 1.1, g.descX + doc.getTextWidth('ITEM DESCRIPTIONS'), y + 1.1);
  return y + LINE_H + 2;
}

/** Where the next line of one column goes: the page number and the baseline y. */
interface Cursor { page: number; y: number }

interface PageFlow {
  geometry: () => Geometry;
  contentMaxY: () => number;
  /** Move the cursor to the next page of this slip, creating it (with the continued header) if needed. */
  advance: (cursor: Cursor) => void;
}

/**
 * Label/value metadata row drawn line by line. Any line that would pass the
 * content boundary moves to the next page, so long addresses, contact lists
 * or remarks continue instead of running into the footer or off the page.
 */
function drawPagedRow(doc: jsPDF, flow: PageFlow, cursor: Cursor, column: 'left' | 'right', label: string, value: string, boldValue = false) {
  doc.setPage(cursor.page);
  // Never leave a label stranded at the bottom of a page.
  if (cursor.y > flow.contentMaxY()) flow.advance(cursor);
  const g = flow.geometry();
  setFont(doc, 'bold');
  const labelX = column === 'left' ? M : g.rightColX;
  const valueX = column === 'left' ? g.valueX : g.rightColX + doc.getTextWidth(label) + 1.5;
  const valueW = column === 'left' ? g.rightColX - g.valueX - 5 : g.pageW - M - valueX;
  doc.text(label, labelX, cursor.y);
  setFont(doc, boldValue ? 'bold' : 'normal');
  const lines = wrap(doc, value, valueW);
  lines.forEach((line, index) => {
    if (index > 0 && cursor.y > flow.contentMaxY()) {
      flow.advance(cursor);
      setFont(doc, boldValue ? 'bold' : 'normal');
    }
    if (line) doc.text(line, valueX, cursor.y);
    cursor.y += LINE_H;
  });
}

/** The cursor that is furthest down the slip. */
const later = (a: Cursor, b: Cursor): Cursor => (a.page !== b.page ? (a.page > b.page ? a : b) : (a.y >= b.y ? a : b));

function drawFooter(doc: jsPDF, model: RmaClientSlipModel, signature: IssuerSignature | null, g: Geometry, top: number) {
  // Left: Issued by + optional signature image over the printed name + underline.
  setFont(doc, 'bold');
  doc.text('Issued by:', M, top);
  if (signature) {
    // At most 9.5 mm tall (top + 1 .. top + 10.5) so an opaque white-background
    // JPEG ends above the printed name's ascenders (baseline top + 13.5).
    const box = fitSignatureBox(signature.width, signature.height, 44, SIGNATURE_MAX_H);
    try {
      doc.addImage(signature.dataUrl, signature.mimeType === 'image/png' ? 'PNG' : 'JPEG', M + (SIGN_LINE_W - box.w) / 2, top + 1, box.w, box.h,
        undefined, 'FAST');
    } catch {
      // A corrupt image must never break the slip: fall back to the printed name.
    }
  }
  setFont(doc, 'normal');
  const name = wrap(doc, model.issuedByName, SIGN_LINE_W)[0] ?? '';
  if (name) doc.text(name, M, top + 13.5);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.35);
  doc.line(M, top + 15.5, M + SIGN_LINE_W, top + 15.5);

  // Center: CONFIDENTIAL.
  setFont(doc, 'bold');
  doc.text('CONFIDENTIAL', g.pageW / 2, top + 21.5, { align: 'center' });

  // Right: Received by (corrected spelling) + blank line + caption.
  doc.text('Received by:', g.rightColX, top);
  doc.line(g.rightColX, top + 15.5, g.pageW - M, top + 15.5);
  setFont(doc, 'normal', 9.5);
  doc.text('Signature over printed name', g.rightColX + (g.pageW - M - g.rightColX) / 2, top + 20.5, { align: 'center' });
}

export interface RenderSlipOptions { documentSize: DocumentSize; logo: SlipLogo | null; signature: IssuerSignature | null }

const METADATA_TOP = 43;

/**
 * Render one slip starting on the current page. Long metadata (address,
 * contacts, remarks) and long item lists continue on extra pages with the
 * header redrawn; the footer is drawn once and never overlaps content.
 */
export function renderRmaClientSlipPage(doc: jsPDF, model: RmaClientSlipModel, options: RenderSlipOptions): void {
  const format = getPdfFormat(options.documentSize);
  const startPage = doc.getNumberOfPages();
  let g = geometry(doc);
  const contentMaxY = () => g.pageH - M - FOOTER_ZONE_H;
  const flow: PageFlow = {
    geometry: () => g,
    contentMaxY,
    advance: cursor => {
      // Reuse a continuation page the other metadata column already created.
      if (cursor.page < doc.getNumberOfPages()) doc.setPage(cursor.page + 1);
      else {
        doc.addPage(format, 'portrait');
        drawHeader(doc, model, options.logo, geometry(doc), true);
      }
      g = geometry(doc);
      cursor.page = doc.getCurrentPageInfo().pageNumber;
      cursor.y = METADATA_TOP;
    },
  };

  drawHeader(doc, model, options.logo, g, false);

  // Right column first, so Date / Ref / Service Slip always sit on the slip's first page.
  const right: Cursor = { page: startPage, y: METADATA_TOP };
  drawPagedRow(doc, flow, right, 'right', 'Date:', model.date);
  drawPagedRow(doc, flow, right, 'right', 'Ref:', model.ref);
  if (model.serviceSlip !== null) drawPagedRow(doc, flow, right, 'right', 'Service Slip:', model.serviceSlip, true);

  const left: Cursor = { page: startPage, y: METADATA_TOP };
  drawPagedRow(doc, flow, left, 'left', 'Company Name:', model.companyName);
  drawPagedRow(doc, flow, left, 'left', 'Address:', model.address);
  drawPagedRow(doc, flow, left, 'left', 'Contact Details:', model.contacts);
  drawPagedRow(doc, flow, left, 'left', 'Case Number:', model.caseNumber, true);
  drawPagedRow(doc, flow, left, 'left', 'Remarks:', model.remarks);

  // Items start below whichever column ended furthest down the slip.
  const end = { ...later(left, right) };
  doc.setPage(end.page);
  g = geometry(doc);
  end.y += 8;
  if (end.y + LINE_H * 3 > contentMaxY()) flow.advance(end);
  const newPage = () => { const cursor = { page: doc.getCurrentPageInfo().pageNumber, y: 0 }; flow.advance(cursor); return cursor.y; };
  let y = drawItemHeaders(doc, g, end.y);

  // Item blocks.
  const descW = () => g.pageW - M - g.descX;
  for (const block of model.items) {
    const lines = block.lines.flatMap(line => wrap(doc, line.text, descW()).map(part => ({ text: part, bold: !!line.bold })));
    const blockH = Math.max(1, lines.length) * LINE_H;
    if (y + blockH > contentMaxY() && blockH <= contentMaxY() - 50) y = drawItemHeaders(doc, g, newPage());
    let first = true;
    for (const line of lines.length ? lines : [{ text: '', bold: false }]) {
      if (y > contentMaxY()) { y = drawItemHeaders(doc, g, newPage()); first = true; }
      if (first && block.qty) { setFont(doc, 'normal'); doc.text(pdfSafe(block.qty), g.qtyCenterX, y, { align: 'center' }); }
      first = false;
      if (line.text) { setFont(doc, line.bold ? 'bold' : 'normal'); doc.text(line.text, g.descX, y); }
      y += LINE_H;
    }
    y += 3.5;
  }

  let footerTop = Math.max(y + 16, Math.min(g.pageH - M - 30, 178));
  if (footerTop + 22 > g.pageH - M) {
    newPage();
    footerTop = Math.min(g.pageH - M - 30, 178);
  }
  drawFooter(doc, model, options.signature, g, footerTop);
}

async function createDoc(documentSize: DocumentSize, compress: boolean) {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ orientation: 'portrait', unit: 'mm', format: getPdfFormat(documentSize), compress });
}

export interface SingleSlipOptions {
  documentSize?: DocumentSize;
  companies?: ReadonlyArray<{ name: string; address?: string | null }>;
  /** Omit to load the bundled Microgenesis logo; null renders without it. */
  logo?: SlipLogo | null;
  /** Omit to fetch the issuer signature; null renders the printed-name fallback. */
  signature?: IssuerSignature | null;
  fetchSignature?: IssuerSignatureFetcher;
  compress?: boolean;
}

async function resolveLogo(logo: SlipLogo | null | undefined) {
  if (logo !== undefined) return logo;
  const { loadMicrogenesisLogo } = await import('./slipLogo');
  return loadMicrogenesisLogo();
}

async function resolveFetcher(fetcher: IssuerSignatureFetcher | undefined): Promise<IssuerSignatureFetcher> {
  if (fetcher) return fetcher;
  const { fetchIssuerSignature } = await import('./issuerSignature');
  return fetchIssuerSignature;
}

/** One client slip (plus continuation pages if its items overflow). */
export async function generateRmaClientSlipPdf(record: SlipRecord, options: SingleSlipOptions = {}): Promise<jsPDF> {
  const documentSize = options.documentSize ?? DEFAULT_SLIP_DOCUMENT_SIZE;
  const doc = await createDoc(documentSize, options.compress ?? true);
  const logo = await resolveLogo(options.logo);
  let signature = options.signature;
  if (signature === undefined) {
    signature = record.created_by_has_signature === false ? null
      : (await prefetchIssuerSignatures([record], await resolveFetcher(options.fetchSignature))).lookup(record);
  }
  renderRmaClientSlipPage(doc, buildRmaClientSlipModel(record, options.companies), { documentSize, logo, signature });
  return doc;
}

export interface BulkSlipOptions extends Omit<SingleSlipOptions, 'signature'> {
  groupByMovement?: boolean;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

/** One slip per page (a slip's own overflow continues; the next slip always starts fresh). */
export async function generateBulkRmaClientSlipsPdf(records: readonly SlipRecord[], options: BulkSlipOptions = {}) {
  if (!records.length) throw new Error('Select at least one RMA record to extract slips.');
  if (records.length > MAX_BULK_SLIP_RECORDS) throw new Error(`Extract at most ${MAX_BULK_SLIP_RECORDS} slips at a time. Narrow the date range or selection.`);
  const documentSize = options.documentSize ?? DEFAULT_SLIP_DOCUMENT_SIZE;
  const ordered = sortBulkSlipRecords(records, options.groupByMovement ?? false);
  const doc = await createDoc(documentSize, options.compress ?? true);
  const logo = await resolveLogo(options.logo);
  const prefetch = await prefetchIssuerSignatures(ordered, await resolveFetcher(options.fetchSignature), options.signal);
  ordered.forEach((record, index) => {
    if (options.signal?.aborted) throw new DOMException('Slip extraction cancelled', 'AbortError');
    if (index > 0) doc.addPage(getPdfFormat(documentSize), 'portrait');
    renderRmaClientSlipPage(doc, buildRmaClientSlipModel(record, options.companies), { documentSize, logo, signature: prefetch.lookup(record) });
    options.onProgress?.(index + 1, ordered.length);
  });
  return { doc, records: ordered, pageCount: doc.getNumberOfPages(), signatureRequests: prefetch.requests, missingSignatureCount: prefetch.missingSignatureCount };
}

/** File name for a single slip: `<RMA reference>-<delivery date>.pdf`. */
export function rmaSlipFileName(record: Pick<DeliveryRecord, 'rma_reference' | 'reference' | 'delivery_date' | 'id'> & Partial<Pick<DeliveryRecord, 'record_no'>>, fallbackLabel?: string): string {
  const base = text(record.rma_reference) || text(fallbackLabel) || text(record.record_no) || record.id;
  return `${[base, text(record.delivery_date)].filter(Boolean).join('-').replace(/[^a-zA-Z0-9_.-]/g, '_')}.pdf`;
}
