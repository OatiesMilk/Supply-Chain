/**
 * Print-friendly Delivery Manifest PDF.
 * Two modes:
 *   - Single record ("per record"): one page per delivery
 *   - Driver day manifest ("per driver"): all records for a driver on a date
 *
 * Clean layout — no sidebar or header chrome. Uses jsPDF.
 */
import { rmaWorkflowExportFields } from '@/utils/rmaTransport';
import { formatManilaTimestamp } from '@/utils/manilaTimestamp';
import { fmtDate } from '@/utils/export';
import { DeliveryRecord } from '@/types';
import { ApiCompany, ApiAuditEntry, ApiComment, ApiRemarkLog, ApiPodAttachment } from '@/api';
import { DocumentSize, getPdfFormat, fitColumnWidths, DEFAULT_DOCUMENT_SIZE } from '@/utils/documentSize';

export interface ManifestDocumentationData {
  auditEntries: ApiAuditEntry[];
  remarks: ApiRemarkLog[];
  comments: ApiComment[];
  attachments?: ApiPodAttachment[];
}

const NAVY: [number, number, number] = [31, 56, 100];
const SLATE: [number, number, number] = [71, 85, 105];
const LIGHT: [number, number, number] = [241, 245, 249];

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch('/microgenesis_logo.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

function drawManifestHeader(
  doc: any,
  logo: string | null,
  title: string,
  subtitle: string,
  pageW: number
) {
  // Logo
  if (logo) doc.addImage(logo, 'PNG', 10, 8, 40, 14);

  // Title block (right-side)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...NAVY);
  doc.text(title, pageW - 10, 12, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...SLATE);
  doc.text(subtitle, pageW - 10, 18, { align: 'right' });

  // Divider
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.6);
  doc.line(10, 26, pageW - 10, 26);
}

function drawField(doc: any, label: string, value: string, x: number, y: number, colW = 90) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...SLATE);
  doc.text(label, x, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(value || '—', x, y + 5, { maxWidth: colW - 6 });
}

const CONTEXT_LABEL: Record<string, string> = {
  CREATION:    'Record Created',
  GENERAL_EDIT: 'General Edit',
  DRIVER_UPDATE: 'Driver/Delivery Update',
  STATUS_CHANGE: 'Status Change',
};



/** Generate a single-record manifest PDF.
 *  When docData is supplied, a second page (Documentation Trail) is appended. */
export async function printSingleManifest(
  record: DeliveryRecord,
  companies: ApiCompany[],
  docData?: ManifestDocumentationData,
  documentSize: DocumentSize = DEFAULT_DOCUMENT_SIZE
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: getPdfFormat(documentSize) });
  const logo = await loadLogo();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const company = companies.find(c => c.name === record.company_name);

  drawManifestHeader(
    doc, logo,
    record.category === 'RMA' ? 'RMA Document Record' : 'Delivery Manifest',
    record.category === 'RMA' ? `RMA Document Reference ${record.rma_reference ?? record.reference} · Record ${record.id}` : `Record ${record.id} · ${fmtDate(record.delivery_date)}`,
    pageW
  );

  if (record.category === 'RMA') {
    const { default: autoTable } = await import('jspdf-autotable');
    const attachments = [
      ...(record.attachments ?? []),
      ...(docData?.attachments ?? []).map(file => file.name),
    ];
    const workflow = rmaWorkflowExportFields(record);
    const fields: [string, string][] = [
      ['Record ID', record.id],
      ['RMA Document Reference', record.rma_reference ?? record.reference],
      ['Legacy SAP Reference', record.legacy_sap_reference ?? '—'],
      ['RMA Category', record.rma_type ?? '—'],
      ['Movement method', workflow.rma_movement_fmt || 'Not selected'],
      ['Transport status', workflow.rma_transport_status_fmt || 'Not applicable'],
      ['Transport started', workflow.rma_transport_started_at_fmt || (record.rma_movement === 'LOGISTICS_TRANSPORT' ? '—' : record.rma_movement ? 'Not applicable' : 'Not selected')],
      ['Transport completed', workflow.rma_transport_completed_at_fmt || '—'],
      ['Physical receipt recipient', workflow.rma_recipient || '—'],
      ['Physical receipt confirmed', workflow.rma_received_at_fmt || 'Not confirmed'],
      ['RMA completed', workflow.rma_completed_at_fmt || '—'],
      ['Status', record.status],
      ['Priority', record.priority],
      ['Company', record.company_name],
      ['Company ID', record.company_id],
      ['Customer Contact Name', record.customer_contact_name ?? '—'],
      ['Customer Contact Email', record.customer_contact_email ?? '—'],
      ['Customer Contact Phone', record.customer_contact_phone ?? '—'],
      ['Purchase Date', record.purchase_date ? fmtDate(record.purchase_date) : '—'],
      ['Area', record.area || '—'],
      ['Address', record.address || '—'],
      ['Account Manager', record.account_manager || '—'],
      ['Delivery Date', record.delivery_date ? fmtDate(record.delivery_date) : '—'],
      ['Item Type', record.item_type || '—'],
      ['Item Description', record.item_description || '—'],
      ['Vehicle', record.vehicle || '—'],
      ['Driver', record.driver || 'Unassigned'],
      ['Driver ID', record.driver_id || '—'],
      ['Driver Assistants', record.driver_assistants?.join(', ') || '—'],
      ['Received By', record.received_by || '—'],
      ['Completed Late', record.completed_late ? 'Yes' : 'No'],
      ['Days Late', String(record.days_late ?? 0)],
      ['Draft', record.is_draft],
      ['Remarks', record.remarks || '—'],
      ['Legacy Document Attachment', record.document_attachment || '—'],
      ['Attachments', attachments.join(', ') || '—'],
      ['Created By', record.created_by || '—'],
      ['Created By ID', record.created_by_id ?? '—'],
      ['Created At', formatManilaTimestamp(record.created_at)],
      ['Modified By', record.modified_by || '—'],
      ['Modified By ID', record.modified_by_id ?? '—'],
      ['Modified At', formatManilaTimestamp(record.modified_at)],
      ['Deleted At', formatManilaTimestamp(record.deleted_at)],
      ['Amount', record.amount == null ? '—' : String(record.amount)],
      ['Collection Verified', record.collection_verified ? 'Yes' : 'No'],
      ['Collection Verified By', record.collection_verified_by ?? '—'],
      ['Collection Verified At', formatManilaTimestamp(record.collection_verified_at)],
      ['Linked Collection', record.linked_collection ? `${record.linked_collection.id} · ${record.linked_collection.reference}` : record.linked_collection_id ?? '—'],
    ];
    autoTable(doc, {
      head: [['RMA Record Field', 'Saved Value']],
      body: fields,
      startY: 31,
      margin: { left: 10, right: 10, top: 31, bottom: 11 },
      styles: { fontSize: 7.5, cellPadding: 1.5, overflow: 'linebreak', valign: 'top' },
      columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold' }, 1: { cellWidth: 'auto' } },
      headStyles: { fillColor: [...NAVY], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      didDrawPage: () => drawManifestHeader(doc, logo, 'RMA Document Record', `RMA Document Reference ${record.rma_reference ?? record.reference} · Record ${record.id}`, pageW),
    });
    if (record.line_items?.length) {
      const tableEnd = (doc as any).lastAutoTable?.finalY ?? 31;
      autoTable(doc, {
        head: [['Line Item', 'Quantity']],
        body: record.line_items.map(item => [item.sku, String(item.quantity)]),
        startY: tableEnd + 5,
        margin: { left: 10, right: 10, top: 31, bottom: 11 },
        styles: { fontSize: 7.5, cellPadding: 1.5 },
        headStyles: { fillColor: [...NAVY], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 249, 250] },
        didDrawPage: () => drawManifestHeader(doc, logo, 'RMA Document Record', `RMA Document Reference ${record.rma_reference ?? record.reference} · Record ${record.id}`, pageW),
      });
    }
    for (let page = 1; page <= doc.getNumberOfPages(); page++) {
      doc.setPage(page);
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text('Microgenesis Business Systems — Confidential', pageW / 2, pageH - 8, { align: 'center' });
      doc.text(`Generated: ${fmtDate(new Date().toISOString())}`, 10, pageH - 8);
    }
  } else {
  let y = 34;
  const col1 = 10;
  const colW = (pageW - 30) / 2;
  const col2 = col1 + colW + 10;

  // ── Section: Recipient ──────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.roundedRect(10, y, pageW - 20, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('RECIPIENT INFORMATION', 14, y + 4.8);
  y += 11;

  drawField(doc, 'Company / Merchant', record.company_name, col1, y, colW);
  drawField(doc, 'Contact Person', company?.contact_person || '', col2, y, colW);
  y += 14;

  drawField(doc, 'Delivery Area', record.area, col1, y, colW);
  drawField(doc, 'SAP Reference', record.reference, col2, y, colW);
  y += 14;

  drawField(doc, 'Account Manager', record.account_manager, col1, y, colW);
  drawField(doc, 'Delivery Date', fmtDate(record.delivery_date), col2, y, colW);
  y += 14;

  if (company?.address) {
    drawField(doc, 'Address', company.address, col1, y, pageW - 20);
    y += 14;
  }

  // ── Section: Items ──────────────────────────────────────────────────────
  y += 2;
  doc.setFillColor(...NAVY);
  doc.roundedRect(10, y, pageW - 20, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('ITEM DETAILS', 14, y + 4.8);
  y += 11;

  drawField(doc, 'Item Type', record.item_type, col1, y, colW);
  drawField(doc, 'Priority', record.priority, col2, y, colW);
  y += 14;

  if (record.item_description) {
    drawField(doc, 'Item Description', record.item_description, col1, y, pageW - 20);
    y += 18;
  }

  if (record.remarks) {
    drawField(doc, 'Remarks / Instructions', record.remarks, col1, y, pageW - 20);
    y += 18;
  }

  // ── Section: Driver ─────────────────────────────────────────────────────
  y += 2;
  doc.setFillColor(...NAVY);
  doc.roundedRect(10, y, pageW - 20, 7, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('DRIVER & VEHICLE', 14, y + 4.8);
  y += 11;

  drawField(doc, 'Driver', record.driver || 'Unassigned', col1, y, colW);
  drawField(doc, 'Driver Assistant', record.driver_assistants?.join(', ') || '—', col2, y, colW);
  y += 14;

  drawField(doc, 'Vehicle', record.vehicle, col1, y, colW);
  drawField(doc, 'Status', record.status, col2, y, colW);
  y += 18;

  // ── Signature line ───────────────────────────────────────────────────────
  doc.setDrawColor(...SLATE);
  doc.setLineWidth(0.3);
  const sigY = Math.max(y + 20, pageH - 60);

  doc.line(col1, sigY, col1 + colW - 15, sigY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...SLATE);
  doc.text('Received by (Signature over Printed Name)', col1, sigY + 4);

  doc.line(col2, sigY, col2 + colW - 15, sigY);
  doc.text('Date & Time Received', col2, sigY + 4);

  // ── Footer ───────────────────────────────────────────────────────────────
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Microgenesis Business Systems — Confidential', pageW / 2, pageH - 8, { align: 'center' });
  doc.text(`Generated: ${fmtDate(new Date().toISOString())}`, 10, pageH - 8);
  }

  // ── Page 2: Documentation Trail ─────────────────────────────────────────────
  if (docData) {
    const { default: autoTable } = await import('jspdf-autotable');
    doc.addPage();
    const pageW2 = doc.internal.pageSize.getWidth();
    const pageH2 = doc.internal.pageSize.getHeight();

    drawManifestHeader(
      doc, logo,
      'Documentation Trail',
      `Record ${record.id} · Generated ${fmtDate(new Date().toISOString())}`,
      pageW2
    );

    let y2 = 34;

    // ── Status Progression ────────────────────────────────────────────────
    doc.setFillColor(...NAVY);
    doc.roundedRect(10, y2, pageW2 - 20, 7, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('STATUS PROGRESSION', 14, y2 + 4.8);
    y2 += 11;

    const statusEvents = docData.auditEntries
      .filter(e => {
        const nv = e.new_value as Record<string, unknown> | null;
        const pv = e.previous_value as Record<string, unknown> | null;
        return nv && pv && nv['status'] !== pv['status'];
      })
      .map(e => {
        const nv = e.new_value as Record<string, unknown>;
        const pv = e.previous_value as Record<string, unknown>;
        return [
          fmtDate(e.timestamp),
          String(pv['status'] ?? '—'),
          String(nv['status'] ?? '—'),
          e.changed_by
        ];
      });

    autoTable(doc, {
      head: [['Date', 'From', 'To', 'Changed By']],
      body: statusEvents.length > 0 ? statusEvents : [['—', '—', record.status, 'System']],
      startY: y2,
      styles: { fontSize: 7.5, cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 } },
      headStyles: { fillColor: [31, 56, 100], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      margin: { left: 10, right: 10 },
      didDrawPage: (d) => { y2 = d.cursor?.y ?? y2; }
    });
    y2 = ((doc as any).lastAutoTable?.finalY ?? y2) + 8;

    // ── Remarks History ───────────────────────────────────────────────────
    if (y2 > pageH2 - 60) { doc.addPage(); y2 = 20; }
    doc.setFillColor(...NAVY);
    doc.roundedRect(10, y2, pageW2 - 20, 7, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('REMARKS HISTORY', 14, y2 + 4.8);
    y2 += 11;

    const remarkRows = docData.remarks.map(r => [
      CONTEXT_LABEL[r.context] ?? r.context,
      r.author,
      fmtDate(r.created_at),
      r.body
    ]);

    autoTable(doc, {
      head: [['Context', 'Author', 'Date', 'Remark']],
      body: remarkRows.length > 0 ? remarkRows : [['—', '—', '—', 'No remarks recorded']],
      startY: y2,
      styles: { fontSize: 7.5, cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 } },
      headStyles: { fillColor: [31, 56, 100], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      columnStyles: { 3: { cellWidth: 80 } },
      margin: { left: 10, right: 10 }
    });
    y2 = ((doc as any).lastAutoTable?.finalY ?? y2) + 8;

    // ── Comments ──────────────────────────────────────────────────────────
    if (y2 > pageH2 - 60) { doc.addPage(); y2 = 20; }
    doc.setFillColor(...NAVY);
    doc.roundedRect(10, y2, pageW2 - 20, 7, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('COMMENTS', 14, y2 + 4.8);
    y2 += 11;

    const commentRows = docData.comments.map(c => [
      c.author,
      fmtDate(c.created_at),
      c.body
    ]);

    autoTable(doc, {
      head: [['Author', 'Date', 'Comment']],
      body: commentRows.length > 0 ? commentRows : [['—', '—', 'No comments recorded']],
      startY: y2,
      styles: { fontSize: 7.5, cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 } },
      headStyles: { fillColor: [31, 56, 100], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      columnStyles: { 2: { cellWidth: 110 } },
      margin: { left: 10, right: 10 }
    });
    y2 = ((doc as any).lastAutoTable?.finalY ?? y2) + 8;

    // ── Audit Trail ───────────────────────────────────────────────────────
    if (y2 > pageH2 - 60) { doc.addPage(); y2 = 20; }
    doc.setFillColor(...NAVY);
    doc.roundedRect(10, y2, pageW2 - 20, 7, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('AUDIT TRAIL', 14, y2 + 4.8);
    y2 += 11;

    const auditRows = docData.auditEntries.map(e => [
      e.action,
      e.changed_by,
      fmtDate(e.timestamp)
    ]);

    autoTable(doc, {
      head: [['Action', 'Changed By', 'Date']],
      body: auditRows.length > 0 ? auditRows : [['—', '—', 'No audit events']],
      startY: y2,
      styles: { fontSize: 7.5, cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 } },
      headStyles: { fillColor: [31, 56, 100], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      margin: { left: 10, right: 10 },
      didDrawPage: () => {
        const pages = (doc as any).internal.getNumberOfPages();
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text('Microgenesis Business Systems — Confidential', pageW2 / 2, pageH2 - 8, { align: 'center' });
        doc.text(`Generated: ${fmtDate(new Date().toISOString())}`, 10, pageH2 - 8);
        doc.text(`Page ${pages}`, pageW2 - 10, pageH2 - 8, { align: 'right' });
      }
    });
  }

  return doc.output('blob');
}

/** Generate a driver-day manifest (all records for one driver on one date) */
export async function printDriverDayManifest(
  driver: string,
  date: string,
  records: DeliveryRecord[],
  companies: ApiCompany[],
  documentSize: DocumentSize = DEFAULT_DOCUMENT_SIZE
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: getPdfFormat(documentSize) });
  const logo = await loadLogo();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  drawManifestHeader(
    doc, logo,
    'Driver Day Manifest',
    `${driver} · ${fmtDate(date)} · ${records.length} deliveries`,
    pageW
  );

  // ── Summary strip ────────────────────────────────────────────────────────
  doc.setFillColor(...LIGHT);
  doc.roundedRect(10, 30, pageW - 20, 10, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text(`Driver: ${driver}`, 14, 36.5);
  doc.text(`Date: ${fmtDate(date)}`, pageW / 2, 36.5, { align: 'center' });
  doc.text(`Total Stops: ${records.length}`, pageW - 14, 36.5, { align: 'right' });

  // ── Deliveries table ─────────────────────────────────────────────────────
  const body = records.map((r, i) => {
    const company = companies.find(c => c.name === r.company_name);
    return [
      String(i + 1),
      r.id,
      r.company_name,
      r.area,
      company?.address || '—',
      r.reference,
      r.item_type,
      r.status
    ];
  });

  autoTable(doc, {
    head: [['#', 'Record ID', 'Company', 'Area', 'Address', 'SAP Ref', 'Item Type', 'Status']],
    body,
    startY: 44,
    margin: { left: 10, right: 10 },
    styles: { fontSize: 8, cellPadding: { top: 2, right: 2.5, bottom: 2, left: 2.5 } },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles: (() => {
      const weights = [8, 22, 38, 22, 40, 22, 20, 18];
      const scaled = fitColumnWidths(weights, pageW - 20);
      return {
        0: { cellWidth: scaled[0], halign: 'center' as const },
        1: { cellWidth: scaled[1], fontStyle: 'bold' as const },
        2: { cellWidth: scaled[2] },
        3: { cellWidth: scaled[3] },
        4: { cellWidth: scaled[4] },
        5: { cellWidth: scaled[5] },
        6: { cellWidth: scaled[6] },
        7: { cellWidth: scaled[7] }
      };
    })(),
    didDrawPage: (data) => {
      const pages = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text('Microgenesis Business Systems — Confidential', pageW / 2, pageH - 6, { align: 'center' });
      doc.text(`Page ${data.pageNumber} of ${pages}`, pageW - 10, pageH - 6, { align: 'right' });
      doc.text(fmtDate(new Date().toISOString()), 10, pageH - 6);
    }
  });

  // ── Signature block ───────────────────────────────────────────────────────
  const finalY = (doc as any).lastAutoTable?.finalY ?? 180;
  if (finalY < pageH - 40) {
    doc.setDrawColor(...SLATE);
    doc.setLineWidth(0.3);
    const sigY = finalY + 20;
    doc.line(10, sigY, 85, sigY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    doc.text("Driver's Signature", 10, sigY + 4);

    doc.line(100, sigY, 175, sigY);
    doc.text('Dispatcher / Supervisor', 100, sigY + 4);
  }

  doc.save(`manifest-${driver.replace(/\s+/g, '-')}-${date}.pdf`);
}
