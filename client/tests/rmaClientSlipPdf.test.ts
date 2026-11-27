import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DeliveryRecord } from '../src/types';
import {
  buildRmaClientSlipModel, fitSignatureBox, generateBulkRmaClientSlipsPdf, generateRmaClientSlipPdf, MAX_BULK_SLIP_RECORDS,
  prefetchIssuerSignatures, rmaSlipFileName, sortBulkSlipRecords, type IssuerSignature, type SlipRecord,
} from '../src/utils/rmaClientSlipPdf';
import { RMA_CATEGORIES, rmaSlipTitle } from '../src/utils/rma';
import type { DocumentSize } from '../src/utils/documentSize';

// Feature 5a: real jsPDF output (compress: false) inspected byte-for-byte.

const INTERNAL = 'INTERNAL_SECRET_COD_PHP2000_DO_NOT_PRINT';
const WORKFLOW = 'WORKFLOW_EDIT_REASON_SECRET';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAKCAYAAACjd+4vAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAIUlEQVQ4jWNgYGD4P0CYYdTi/6NBzTCauBhGsxMDyekAAKTAKuRb13OAAAAAAElFTkSuQmCC';
const JPEG = 'data:image/jpeg;base64,/9j/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAKAB4DASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKAAAAD/2Q==';
const pngSignature: IssuerSignature = { dataUrl: PNG, mimeType: 'image/png', width: 30, height: 10 };
const jpegSignature: IssuerSignature = { dataUrl: JPEG, mimeType: 'image/jpeg', width: 30, height: 10 };
const PREFIX: Record<string, string> = { 'Pull Out Slip': 'POS', 'Return to Customer Slip': 'RTC', 'Return to Supplier Slip': 'RTS', 'Advance Replacement Slip': 'ARD', 'Receiving Slip': 'RR', 'Transfer Out Slip': 'TXO' };

function record(overrides: Partial<DeliveryRecord> = {}): DeliveryRecord {
  return {
    id: 'rma-1', record_no: 'RMA-26-00001', category: 'RMA', company_name: 'ADHI-PTPP JV', company_id: 'c1', rma_type: 'Return to Customer Slip',
    rma_reference: 'RTC112026-03', reference: 'RTC112026-03', legacy_sap_reference: 'REF-778', address: '6th flr. Vertex one, Felix Huertas Road Sta.Cruz\nManila',
    delivery_date: '2026-11-12', case_number: 'CAS-31417-Y4Y6Z3', service_slip_no: 'SS#60142', client_remarks: 'SAP#12019325',
    internal_logistics_remarks: INTERNAL, remarks: WORKFLOW, rma_contacts: [{ name: 'Allyssa Nicole Lapitan', phone: '09260651935' }],
    created_by: 'Roselyn Arguelles', created_by_id: 'u-roselyn', created_by_has_signature: true, rma_movement: 'LOGISTICS_TRANSPORT',
    line_items: [{ sku: 'Lenovo LOQ 15IRX9 Laptop', quantity: 1, unit_type: 'Unit', serial_number: 'MP2HXKEA', purchase_date: '2024-11-28', sales_order_no: '12009891',
      repair_note: 'Installed Keyboard', status_tag: 'For Return' }],
    ...overrides,
  } as DeliveryRecord;
}

/** Every string drawn with Tj in an uncompressed jsPDF document. */
function drawnText(output: string): string[] {
  // jsPDF writes one text operator per line; anchoring keeps binary image streams out of the match.
  return [...output.matchAll(/^\(((?:\\.|[^\\)\n])*)\) Tj$/gm)].map(match => match[1].replace(/\\([()\\])/g, '$1'));
}
const imageCount = (output: string) => (output.match(/\/Subtype \/Image/g) ?? []).length;

async function render(source: DeliveryRecord, signature: IssuerSignature | null = null, documentSize: DocumentSize = 'a4') {
  const doc = await generateRmaClientSlipPdf(source, { logo: null, signature, documentSize, compress: false });
  const output = doc.output();
  return { doc, output, text: drawnText(output) };
}

test('every slip category renders the target borderless layout on A4, Letter and Legal portrait', async () => {
  const sizes: Record<DocumentSize, [number, number]> = { a4: [210, 297], letter: [215.9, 279.4], legal: [215.9, 355.6] };
  for (const category of RMA_CATEGORIES) {
    const reference = `${PREFIX[category]}112026-03`;
    for (const size of Object.keys(sizes) as DocumentSize[]) {
      const { doc, output, text } = await render(record({ rma_type: category, rma_reference: reference, service_slip_no: category === 'Return to Customer Slip' ? 'SS#60142' : null }), null, size);
      const [w, h] = sizes[size];
      assert.ok(Math.abs(doc.internal.pageSize.getWidth() - w) < 0.5 && Math.abs(doc.internal.pageSize.getHeight() - h) < 0.5, `${category} ${size} portrait`);
      assert.equal(doc.getNumberOfPages(), 1);
      for (const expected of [rmaSlipTitle(category), reference, 'Company Name:', 'ADHI-PTPP JV', 'Address:', '6th flr. Vertex one, Felix Huertas Road Sta.Cruz', 'Manila',
        'Contact Details:', 'Allyssa Nicole Lapitan - 09260651935', 'Case Number:', 'CAS-31417-Y4Y6Z3', 'Remarks:', 'SAP#12019325', 'Date:', '11/12/2026', 'Ref:', 'REF-778',
        'QTY', 'ITEM DESCRIPTIONS', '1Unit', 'Lenovo LOQ 15IRX9 Laptop', 'Serial Number: MP2HXKEA', 'Date of Purchase: 11/28/2024 - SO: 12009891', 'Note: Installed Keyboard',
        '"For Return"', 'Issued by:', 'Roselyn Arguelles', 'CONFIDENTIAL', 'Received by:', 'Signature over printed name']) {
        assert.ok(text.includes(expected), `${category} ${size}: ${expected}`);
      }
      const isRtc = category === 'Return to Customer Slip';
      assert.equal(text.includes('Service Slip:'), isRtc, `${category}: Service Slip only on RTC`);
      assert.equal(text.includes('SS#60142'), isRtc);
      assert.equal(text.includes('Type:'), false, 'legacy "Type:" label is replaced');
      assert.doesNotMatch(output, /Recieved|printer name/, 'legacy spelling never appears');
      // Borderless: no filled rectangles, table grids or navy banners.
      assert.doesNotMatch(output, / re\s*\n?f\b/);
      assert.doesNotMatch(output, /0\.122 0\.220 0\.392/);
    }
  }
});

test('Service Slip stays hidden on non-RTC records even if stale SS# data is present', async () => {
  for (const rmaType of ['Pull Out Slip', 'Receiving Slip', 'Transfer Out Slip']) {
    const { text } = await render(record({ rma_type: rmaType, service_slip_no: 'SS#STALE' }));
    assert.equal(text.includes('Service Slip:'), false);
    assert.equal(text.includes('SS#STALE'), false);
  }
  assert.equal(buildRmaClientSlipModel(record({ rma_type: 'Pull Out Slip', service_slip_no: 'SS#STALE' })).serviceSlip, null);
});

test('zero data leak: internal Logistics and workflow remarks are never read or printed', async () => {
  // The model must not even read the internal fields.
  const guarded = new Proxy(record(), { get(target, key) {
    if (key === 'internal_logistics_remarks' || key === 'remarks') throw new Error(`client slip read ${String(key)}`);
    return Reflect.get(target, key);
  } });
  const model = buildRmaClientSlipModel(guarded);
  assert.equal(JSON.stringify(model).includes(INTERNAL), false);
  const { output } = await render(guarded, pngSignature);
  assert.equal(output.includes(INTERNAL), false);
  assert.equal(output.includes(WORKFLOW), false);
  const bulk = await generateBulkRmaClientSlipsPdf([guarded, record({ id: 'rma-2', created_by_id: 'u2' })], { logo: null, compress: false, fetchSignature: async () => null });
  const bulkOutput = bulk.doc.output();
  assert.equal(bulkOutput.includes(INTERNAL), false);
  assert.equal(bulkOutput.includes(WORKFLOW), false);
});

test('the issuer signature embeds as PNG or JPEG and falls back to the printed name when missing', async () => {
  const withPng = await render(record(), pngSignature);
  assert.equal(imageCount(withPng.output), 1);
  assert.ok(withPng.text.includes('Roselyn Arguelles'));
  const withJpeg = await render(record(), jpegSignature);
  assert.equal(imageCount(withJpeg.output), 1);
  assert.match(withJpeg.output, /\/DCTDecode/);
  const without = await render(record({ created_by_has_signature: false }));
  assert.equal(imageCount(without.output), 0);
  assert.ok(without.text.includes('Issued by:') && without.text.includes('Roselyn Arguelles'));
  const broken = await render(record(), { ...pngSignature, dataUrl: 'data:image/png;base64,AAAA' });
  assert.ok(broken.text.includes('CONFIDENTIAL'), 'a corrupt signature never breaks the slip');
  assert.deepEqual(fitSignatureBox(600, 200, 44, 12), { w: 36, h: 12 });
  assert.deepEqual(fitSignatureBox(100, 10, 44, 12), { w: 44, h: 4.4 });
});

test('long item lists continue on extra pages and the footer is drawn once, after the items', async () => {
  const items = Array.from({ length: 28 }, (_unused, index) => ({ sku: `Model ${index + 1}`, quantity: 1, unit_type: 'Item' as const, serial_number: `SN-${index + 1}`,
    problem_description: 'Intermittent fault '.repeat(6), status_tag: 'For Pull Out' }));
  for (const size of ['a4', 'letter', 'legal'] as DocumentSize[]) {
    const { doc, text } = await render(record({ line_items: items }), pngSignature, size);
    assert.ok(doc.getNumberOfPages() > 1, size);
    assert.ok(text.includes('(Continued)'));
    assert.equal(text.filter(value => value === 'CONFIDENTIAL').length, 1);
    assert.equal(text.filter(value => value === 'Received by:').length, 1);
    assert.ok(text.includes('Model 28') && text.includes('Serial Number: SN-28'));
    assert.ok(text.lastIndexOf('CONFIDENTIAL') > text.lastIndexOf('Model 28'), 'footer follows the last item');
  }
});

test('bulk extraction renders one slip per page, grouped by Movement Method, and caps at 100', async () => {
  const records = [
    record({ id: 'c', rma_reference: 'POS112026-02', rma_type: 'Pull Out Slip', rma_movement: 'INTERNAL_NO_DRIVER', created_by_id: 'u1' }),
    record({ id: 'b', rma_reference: 'RTS112026-01', rma_type: 'Return to Supplier Slip', rma_movement: 'SUPPLIER_COLLECTION', created_by_id: 'u1' }),
    record({ id: 'a2', rma_reference: 'RTC112026-09', rma_movement: 'LOGISTICS_TRANSPORT', created_by_id: 'u2' }),
    record({ id: 'a1', rma_reference: 'RTC112026-03', rma_movement: 'LOGISTICS_TRANSPORT', created_by_id: 'u2' }),
    record({ id: 'd', rma_reference: 'RR112026-01', rma_type: 'Receiving Slip', rma_movement: null, created_by_id: 'u3', created_by_has_signature: false }),
  ];
  assert.deepEqual(sortBulkSlipRecords(records, true).map(row => row.id), ['a1', 'a2', 'b', 'c', 'd']);
  assert.deepEqual(sortBulkSlipRecords(records, false).map(row => row.id), records.map(row => row.id));

  const calls: string[] = [];
  const result = await generateBulkRmaClientSlipsPdf(records, { logo: null, compress: false, groupByMovement: true, documentSize: 'letter',
    // u1's representative record is 'b' (first in the grouped order); u1 has no signature on file.
    fetchSignature: async recordId => { calls.push(recordId); return ['b', 'c'].includes(recordId) ? null : pngSignature; } });
  assert.equal(result.pageCount, records.length);
  assert.deepEqual(result.records.map(row => row.id), ['a1', 'a2', 'b', 'c', 'd']);
  const titles = drawnText(result.doc.output()).filter(value => /SLIP$/.test(value));
  assert.deepEqual(titles, ['RETURN TO CUSTOMER SLIP', 'RETURN TO CUSTOMER SLIP', 'RETURN TO SUPPLIER SLIP', 'PULL OUT SLIP', 'RECEIVING SLIP']);
  assert.equal(calls.length, 2, 'one request per distinct creator with a signature');
  assert.equal(result.signatureRequests, 2);
  assert.equal(result.missingSignatureCount, 1, 'u1 has none; u3 is skipped without a request');

  const overflow = [record({ id: 'long', line_items: Array.from({ length: 40 }, (_u, i) => ({ sku: `Item ${i}`, quantity: 1 })) }), record({ id: 'next', rma_reference: 'RTC112026-99' })];
  const paged = await generateBulkRmaClientSlipsPdf(overflow, { logo: null, compress: false, fetchSignature: async () => null });
  assert.ok(paged.pageCount >= 3, 'the overflowing slip continues and the next slip starts on a fresh page');

  await assert.rejects(generateBulkRmaClientSlipsPdf([], { logo: null }), /at least one/);
  const many = Array.from({ length: MAX_BULK_SLIP_RECORDS + 1 }, (_u, i) => record({ id: `r${i}` }));
  await assert.rejects(generateBulkRmaClientSlipsPdf(many, { logo: null, fetchSignature: async () => null }), /at most 100/);
});

test('signature prefetch makes at most one request per creator and none for creators without one', async () => {
  const rows: SlipRecord[] = [
    ...Array.from({ length: 6 }, (_u, i) => record({ id: `x${i}`, created_by_id: 'same-creator' })),
    record({ id: 'y', created_by_id: 'other' }),
    ...Array.from({ length: 4 }, (_u, i) => record({ id: `z${i}`, created_by_id: 'no-sig', created_by_has_signature: false })),
  ];
  let calls = 0;
  let inFlight = 0, peak = 0;
  const result = await prefetchIssuerSignatures(rows, async () => {
    calls++; inFlight++; peak = Math.max(peak, inFlight);
    await new Promise(resolve => setTimeout(resolve, 5));
    inFlight--; return pngSignature;
  });
  assert.equal(calls, 2);
  assert.equal(result.requests, 2);
  assert.equal(result.lookup(rows[3]), pngSignature);
  assert.equal(result.lookup(rows.at(-1)!), null);
  assert.ok(peak <= 4);

  const failing = await prefetchIssuerSignatures([record()], async () => { throw new Error('network down'); });
  assert.equal(failing.missingSignatureCount, 1);
  assert.equal(failing.lookup(record()), null);
  const none = await prefetchIssuerSignatures(rows.filter(row => row.created_by_has_signature === false), async () => { throw new Error('must not fetch'); });
  assert.equal(none.requests, 0);
});

test('single-slip generation skips the fetch for creators without a signature and names files by reference', async () => {
  let calls = 0;
  await generateRmaClientSlipPdf(record({ created_by_has_signature: false }), { logo: null, fetchSignature: async () => { calls++; return pngSignature; } });
  assert.equal(calls, 0);
  const doc = await generateRmaClientSlipPdf(record(), { logo: null, compress: false, fetchSignature: async () => { calls++; return pngSignature; } });
  assert.equal(calls, 1);
  assert.equal(imageCount(doc.output()), 1);
  assert.equal(rmaSlipFileName(record()), 'RTC112026-03-2026-11-12.pdf');
  assert.equal(rmaSlipFileName(record({ rma_reference: null }), 'RMA-26-00001'), 'RMA-26-00001-2026-11-12.pdf');
});

// ── P2-2 / AC-8: line-by-line metadata pagination with coordinate bounds ────
const PT_PER_MM = 72 / 25.4;
interface Positioned { page: number; text: string; xMm: number; yMm: number; pageHmm: number }

/** Drawn strings with their page and top-down position (mm), from uncompressed jsPDF output. */
function drawnTextPositions(output: string): Positioned[] {
  const segments = output.split(/\/Type \/Page\n/).slice(1);
  return segments.flatMap((segment, index) => {
    const box = segment.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    assert.ok(box, 'page media box');
    const pageHpt = Number(box[2]);
    return [...segment.matchAll(/^([-\d.]+) ([-\d.]+) Td\n\(((?:\\.|[^\\)\n])*)\) Tj$/gm)].map(match => ({
      page: index + 1, text: match[3].replace(/\\([()\\])/g, '$1'),
      xMm: Number(match[1]) / PT_PER_MM, yMm: (pageHpt - Number(match[2])) / PT_PER_MM, pageHmm: pageHpt / PT_PER_MM,
    }));
  });
}

const FOOTER_LABELS = ['Issued by:', 'CONFIDENTIAL', 'Received by:', 'Signature over printed name', 'Roselyn Arguelles'];
const lines = (prefix: string, count: number) => Array.from({ length: count }, (_u, i) => `${prefix} ${String(i + 1).padStart(2, '0')}`);

const OVERFLOW_SCENARIOS: Record<string, { overrides: Partial<DeliveryRecord>; first: string; last: string }> = {
  'long Address': { overrides: { address: lines('Address Line', 60).join('\n') }, first: 'Address Line 01', last: 'Address Line 60' },
  // 80 contacts: 35 still fit on one Legal page, so the scenario uses enough to overflow every size.
  'long Contact Details': {
    overrides: { rma_contacts: Array.from({ length: 80 }, (_u, i) => ({ name: `Contact Person ${String(i + 1).padStart(2, '0')}`, phone: `+6391700000${String(i + 1).padStart(2, '0')}` })) },
    first: 'Contact Person 01 - +639170000001', last: '+639170000080',
  },
  'long client Remarks': { overrides: { client_remarks: lines('SAP Remark Line', 60).join('\n') }, first: 'SAP Remark Line 01', last: 'SAP Remark Line 60' },
};

function assertPagedLayout(positions: Positioned[], label: string) {
  for (const item of positions) {
    assert.ok(item.yMm >= 14 && item.yMm <= item.pageHmm - 10, `${label}: "${item.text}" at y=${item.yMm.toFixed(1)}mm on page ${item.page} is outside the printable area`);
  }
  // Metadata and items stay above the reserved footer zone (page height - 15 mm margin - 38 mm).
  for (const item of positions.filter(entry => !FOOTER_LABELS.includes(entry.text))) {
    assert.ok(item.yMm <= item.pageHmm - 15 - 38 + 0.01, `${label}: "${item.text}" at y=${item.yMm.toFixed(1)}mm runs into the footer zone on page ${item.page}`);
  }
  for (const footer of ['Issued by:', 'CONFIDENTIAL', 'Received by:']) {
    assert.equal(positions.filter(entry => entry.text === footer).length, 1, `${label}: ${footer} drawn exactly once`);
  }
  const issued = positions.find(entry => entry.text === 'Issued by:')!;
  const content = positions.filter(entry => entry.page === issued.page && !FOOTER_LABELS.includes(entry.text) && entry.yMm > 40);
  for (const item of content) assert.ok(item.yMm < issued.yMm, `${label}: footer starts below "${item.text}"`);
}

test('long Address, Contact Details and Remarks paginate line by line on A4, Letter and Legal without clipping', async () => {
  for (const [scenario, { overrides, first, last }] of Object.entries(OVERFLOW_SCENARIOS)) {
    for (const size of ['a4', 'letter', 'legal'] as DocumentSize[]) {
      const label = `${scenario} (${size})`;
      const { doc, output, text } = await render(record(overrides), pngSignature, size);
      const positions = drawnTextPositions(output);
      assert.equal(new Set(positions.map(entry => entry.page)).size, doc.getNumberOfPages(), `${label}: positions cover every page`);
      assert.ok(doc.getNumberOfPages() >= 2, `${label}: continues onto another page`);
      assert.ok(text.includes('(Continued)'), `${label}: continuation header`);
      assert.ok(positions.filter(entry => entry.text === '(Continued)').every(entry => entry.page > 1));
      const pageOne = positions.filter(entry => entry.page === 1).map(entry => entry.text);
      for (const expected of ['Date:', '11/12/2026', 'Ref:', 'REF-778', 'Service Slip:', 'SS#60142', 'RETURN TO CUSTOMER SLIP', 'RTC112026-03']) {
        assert.ok(pageOne.includes(expected), `${label}: ${expected} stays on page 1`);
      }
      const joined = text.join(' ');
      assert.ok(joined.includes(first) && joined.includes(last), `${label}: first and last overflow lines are drawn`);
      const lastLine = positions.find(entry => entry.text.includes(last))!;
      const qty = positions.find(entry => entry.text === 'QTY')!;
      assert.ok(qty.page > lastLine.page || (qty.page === lastLine.page && qty.yMm > lastLine.yMm), `${label}: items start after the metadata`);
      for (const expected of ['ITEM DESCRIPTIONS', '1Unit', 'Lenovo LOQ 15IRX9 Laptop', '"For Return"']) assert.ok(text.includes(expected), `${label}: ${expected}`);
      const lastItem = positions.find(entry => entry.text === '"For Return"')!;
      const issued = positions.find(entry => entry.text === 'Issued by:')!;
      assert.ok(issued.page > lastItem.page || (issued.page === lastItem.page && issued.yMm > lastItem.yMm), `${label}: footer follows the items`);
      assertPagedLayout(positions, label);
      // Zero data leak still holds on paginated metadata.
      assert.equal(output.includes(INTERNAL), false, `${label}: internal remarks`);
      assert.equal(output.includes(WORKFLOW), false, `${label}: workflow remarks`);
    }
  }
});

test('normal slips keep every drawn line inside the margins on all paper sizes', async () => {
  for (const size of ['a4', 'letter', 'legal'] as DocumentSize[]) {
    const { doc, output } = await render(record(), jpegSignature, size);
    assert.equal(doc.getNumberOfPages(), 1);
    assertPagedLayout(drawnTextPositions(output), `normal ${size}`);
  }
});

test('bulk extraction starts the slip after an overflowing one on a fresh first page', async () => {
  const overflowing = record({ id: 'long', rma_reference: 'RTC112026-01', address: lines('Address Line', 60).join('\n'), client_remarks: lines('SAP Remark Line', 40).join('\n') });
  const normal = record({ id: 'next', rma_reference: 'POS112026-02', rma_type: 'Pull Out Slip', service_slip_no: null });
  for (const size of ['a4', 'letter', 'legal'] as DocumentSize[]) {
    const result = await generateBulkRmaClientSlipsPdf([overflowing, normal], { logo: null, compress: false, documentSize: size, fetchSignature: async () => null });
    const positions = drawnTextPositions(result.doc.output());
    const secondStart = positions.find(entry => entry.text === 'PULL OUT SLIP')!.page;
    assert.ok(secondStart >= 3, `${size}: first slip spans at least two pages`);
    assert.equal(secondStart, result.pageCount, `${size}: second slip is a single fresh page`);
    const second = positions.filter(entry => entry.page === secondStart).map(entry => entry.text);
    assert.equal(second.includes('(Continued)'), false, `${size}: second slip's first page is not a continuation`);
    for (const expected of ['POS112026-02', 'Date:', 'Company Name:', 'Issued by:', 'CONFIDENTIAL']) assert.ok(second.includes(expected), `${size}: ${expected}`);
    assert.equal(second.includes('Service Slip:'), false, `${size}: POS has no Service Slip`);
    assert.equal(positions.filter(entry => entry.page < secondStart).some(entry => entry.text === 'PULL OUT SLIP' || entry.text === 'POS112026-02'), false);
    assert.equal(positions.filter(entry => entry.text === 'CONFIDENTIAL').length, 2, `${size}: one footer per slip`);
    assert.equal(positions.filter(entry => entry.page < secondStart && entry.text === 'CONFIDENTIAL').length, 1);
    for (const slipPages of [positions.filter(entry => entry.page < secondStart), positions.filter(entry => entry.page === secondStart)]) {
      assertPagedLayout(slipPages, size);
    }
  }
});
