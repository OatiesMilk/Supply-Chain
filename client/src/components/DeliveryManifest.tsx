/**
 * Print-friendly Delivery Manifest PDF.
 * Two modes:
 *   - Single record ("per record"): one page per delivery
 *   - Driver day manifest ("per driver"): all records for a driver on a date
 *
 * Clean layout — no sidebar or header chrome. Uses jsPDF.
 */
import { fmtDate } from '../utils/export';
import { DeliveryRecord } from '../types';
import { ApiCompany, ApiAuditEntry, ApiComment, ApiRemarkLog } from '../api';

export interface ManifestDocumentationData {
  auditEntries: ApiAuditEntry[];
  remarks: ApiRemarkLog[];
  comments: ApiComment[];
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
  docData?: ManifestDocumentationData
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logo = await loadLogo();
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const company = companies.find(c => c.name === record.company_name);

  drawManifestHeader(
    doc, logo,
    'Delivery Manifest',
    `Record ${record.id} · ${fmtDate(record.delivery_date)}`,
    pageW
  );

  let y = 34;
  const col1 = 10, col2 = 110, colW = 90;

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

  doc.line(10, sigY, 85, sigY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...SLATE);
  doc.text('Received by (Signature over Printed Name)', 10, sigY + 4);

  doc.line(110, sigY, 185, sigY);
  doc.text('Date & Time Received', 110, sigY + 4);

  // ── Footer ───────────────────────────────────────────────────────────────
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Microgenesis Business Systems — Confidential', pageW / 2, pageH - 8, { align: 'center' });
  doc.text(`Generated: ${fmtDate(new Date().toISOString())}`, 10, pageH - 8);

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

  doc.save(`manifest-${record.id}-${record.delivery_date}.pdf`);
}

/** Generate a driver-day manifest (all records for one driver on one date) */
export async function printDriverDayManifest(
  driver: string,
  date: string,
  records: DeliveryRecord[],
  companies: ApiCompany[]
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
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
    styles: { fontSize: 8, cellPadding: { top: 2, right: 2.5, bottom: 2, left: 2.5 } },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 22, fontStyle: 'bold' },
      2: { cellWidth: 38 },
      3: { cellWidth: 22 },
      4: { cellWidth: 40 },
      5: { cellWidth: 22 },
      6: { cellWidth: 20 },
      7: { cellWidth: 18 }
    },
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
