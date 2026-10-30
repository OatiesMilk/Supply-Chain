import type { DeliveryRecord } from '../types';
import { downloadPDF, fmtDate, fmtStatus, PDF_AC_COLUMNS, PDF_DELIVERY_COLUMNS, PDF_RMA_COLUMNS } from './export';
import { rmaWorkflowExportFields } from './rmaTransport';

/** Use a freshly loaded, authorized record when calling this after a transition. */
export async function exportRecordOutputPDF(record: DeliveryRecord): Promise<void> {
  const columns = record.category === 'RMA' ? PDF_RMA_COLUMNS : record.category === 'Accounting Collection' ? PDF_AC_COLUMNS : PDF_DELIVERY_COLUMNS;
  const row = {
    id: record.id, company_name: record.company_name, reference: record.reference,
    rma_reference: record.rma_reference ?? '', legacy_sap_reference: record.legacy_sap_reference ?? '',
    rma_type: record.rma_type ?? '', purchase_date_fmt: record.purchase_date ? fmtDate(record.purchase_date) : '',
    ...rmaWorkflowExportFields(record), priority: record.priority, area: record.area,
    delivery_date_fmt: fmtDate(record.delivery_date), driver: record.driver, account_manager: record.account_manager,
    status_fmt: fmtStatus(record.status), amount_fmt: record.amount?.toLocaleString('en-PH', { minimumFractionDigits: 2 }) ?? '',
    collection_verified_fmt: record.collection_verified ? 'Verified' : 'Pending',
  };
  await downloadPDF([row], columns, `${record.category} Record`, `record-${record.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`, {
    reportName: `${record.category} Record`, generatedByName: record.modified_by, generatedByRole: '',
  });
}
