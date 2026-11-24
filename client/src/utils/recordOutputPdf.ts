import type { DeliveryRecord } from '../types';
import { downloadPDF, fmtDate, fmtStatus, PDF_AC_COLUMNS, PDF_DELIVERY_COLUMNS, type ExportColumn } from './export';
import { rmaWorkflowExportFields } from './rmaTransport';
import { recordLabel } from './recordLabel';
import { INTERNAL_TRANSFER_LABEL, rmaSlipTitle } from './rma';
import { buildRmaClientSlipData, rmaClientSlipItemsText } from './rmaSlip';

/** Client-facing RMA slip columns. Widths sum to 277mm (A4 landscape usable width). */
export const PDF_RMA_CLIENT_SLIP_COLUMNS: ExportColumn[] = [
  { header: 'Record No.', key: 'id', width: 14, pdfWidth: 18 },
  { header: 'Company', key: 'company_name', width: 28, pdfWidth: 34 },
  { header: 'RMA Document Reference', key: 'rma_reference', width: 28, pdfWidth: 30 },
  { header: 'RMA Category', key: 'rma_type', width: 22, pdfWidth: 26 },
  { header: 'Case Number', key: 'case_number', width: 22, pdfWidth: 30 },
  { header: 'Service Slip (SS#)', key: 'service_slip_no', width: 18, pdfWidth: 20 },
  { header: 'Items', key: 'items', width: 48, pdfWidth: 50 },
  { header: 'Contacts', key: 'contacts', width: 30, pdfWidth: 30 },
  { header: 'Slip Remarks', key: 'slip_remarks', width: 24, pdfWidth: 21 },
  { header: 'Status', key: 'status_fmt', width: 14, pdfWidth: 18, pdfPill: true, pdfAlign: 'center' },
];

/**
 * The client-facing RMA output row. Built only from client-safe slip data:
 * internal Logistics notes and workflow remarks are never read.
 */
export function buildRmaOutputPdfRow(record: DeliveryRecord): Record<string, string> {
  const slip = buildRmaClientSlipData(record);
  return {
    id: recordLabel(record), company_name: record.company_name, rma_reference: record.rma_reference ?? '',
    rma_type: record.rma_type ?? '', case_number: slip.caseNumber, service_slip_no: slip.serviceSlipNo ?? '',
    items: rmaClientSlipItemsText(slip), contacts: slip.contacts, slip_remarks: slip.slipRemarks,
    status_fmt: fmtStatus(record.status),
  };
}

/** Use a freshly loaded, authorized record when calling this after a transition. */
export async function exportRecordOutputPDF(record: DeliveryRecord): Promise<void> {
  const fileName = `record-${record.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  if (record.category === 'RMA') {
    // RMA records print under their slip title, e.g. TRANSFER OUT SLIP; every slip shares one layout.
    const title = rmaSlipTitle(record.rma_type);
    await downloadPDF([buildRmaOutputPdfRow(record)], PDF_RMA_CLIENT_SLIP_COLUMNS, title, fileName, {
      reportName: title, generatedByName: record.modified_by, generatedByRole: '',
    });
    return;
  }
  const columns = record.category === 'Accounting Collection' ? PDF_AC_COLUMNS : PDF_DELIVERY_COLUMNS;
  const row = {
    id: recordLabel(record), company_name: record.company_name, reference: record.reference,
    rma_reference: record.rma_reference ?? '', legacy_sap_reference: record.legacy_sap_reference ?? '',
    rma_type: record.rma_type ?? '', rma_classification: record.is_internal_transfer ? INTERNAL_TRANSFER_LABEL : 'RMA', purchase_date_fmt: record.purchase_date ? fmtDate(record.purchase_date) : '',
    ...rmaWorkflowExportFields(record), priority: record.priority, area: record.area,
    delivery_date_fmt: fmtDate(record.delivery_date), driver: record.driver, account_manager: record.account_manager,
    status_fmt: fmtStatus(record.status), amount_fmt: record.amount?.toLocaleString('en-PH', { minimumFractionDigits: 2 }) ?? '',
    collection_verified_fmt: record.collection_verified ? 'Verified' : 'Pending',
  };
  const title = `${record.category} Record`;
  await downloadPDF([row], columns, title, fileName, {
    reportName: title, generatedByName: record.modified_by, generatedByRole: '',
  });
}
