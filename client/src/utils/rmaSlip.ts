import type { DeliveryRecord } from '../types';
import { formatRmaContacts, isReturnToCustomerCategory } from './rma';
import { rmaItemBlocks, type RmaItemBlock } from './rmaItems';

export interface RmaClientSlipData {
  caseNumber: string;
  /** Present only on Return to Customer Slip (RTC) records. */
  serviceSlipNo: string | null;
  contacts: string;
  items: RmaItemBlock[];
  /** Client-facing slip remarks only. */
  slipRemarks: string;
}

/**
 * Client-safe slip content. It reads only client-facing fields: never the
 * internal Logistics notes, the workflow remarks, history or comments.
 */
export function buildRmaClientSlipData(record: Pick<DeliveryRecord,
  'rma_type' | 'case_number' | 'service_slip_no' | 'client_remarks' | 'rma_contacts' | 'customer_contact_name' | 'customer_contact_phone'
  | 'line_items' | 'item_description' | 'purchase_date'>): RmaClientSlipData {
  return {
    caseNumber: (record.case_number ?? '').trim(),
    serviceSlipNo: isReturnToCustomerCategory(record.rma_type) ? ((record.service_slip_no ?? '').trim() || null) : null,
    contacts: formatRmaContacts({ rma_contacts: record.rma_contacts, customer_contact_name: record.customer_contact_name, customer_contact_phone: record.customer_contact_phone }),
    items: rmaItemBlocks({ line_items: record.line_items, item_description: record.item_description, purchase_date: record.purchase_date }),
    slipRemarks: (record.client_remarks ?? '').trim(),
  };
}

/** The slip items as plain text, one block per line. */
export function rmaClientSlipItemsText(data: RmaClientSlipData): string {
  return data.items.map(block => [block.qty, block.lines.map(line => line.text).join('; ')].filter(Boolean).join(' ')).join('\n');
}
