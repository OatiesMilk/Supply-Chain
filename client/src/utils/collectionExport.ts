import type { DeliveryRecord } from '../types';
import { fmtCurrency, fmtDate, fmtDatetime, fmtStatus } from './export';
import { recordLabel } from './recordLabel';

/** Export row for a single Accounting Collection record (record page Export menu). */
export function collectionRecordExportRow(record: DeliveryRecord): Record<string, string> {
  return {
    id: recordLabel(record),
    company_name: record.company_name,
    reference: record.reference,
    category: record.category,
    priority: record.priority,
    area: record.area,
    delivery_date_fmt: fmtDate(record.delivery_date),
    driver: record.driver || '',
    driver_assistants: record.driver_assistants?.join(', ') || '',
    account_manager: record.account_manager,
    vehicle: record.vehicle,
    item_type: record.item_type,
    status_fmt: fmtStatus(record.status),
    remarks: record.remarks || '',
    created_by: record.created_by,
    created_at_fmt: fmtDatetime(record.created_at),
    amount_fmt: fmtCurrency(record.amount),
    collection_verified_fmt: record.collection_verified ? 'Verified' : 'Pending',
    collection_verified_by: record.collection_verified_by || '',
    collection_verified_at_fmt: record.collection_verified_at ? fmtDatetime(record.collection_verified_at) : '',
  };
}
