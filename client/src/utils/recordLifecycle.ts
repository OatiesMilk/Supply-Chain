import type { DeliveryRecord, DeliveryStatus, UserRole } from '../types';

export function submissionErrors(data: { company_name: string; company_id: string; reference: string; delivery_date: string }, isDraft: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.company_name.trim()) errors.company_name = 'Company Name is required';
  else if (!data.company_id) errors.company_name = 'Select a company from the list';
  if (!isDraft && !data.reference.trim()) errors.reference = 'Reference (SAP number) is required';
  if (!isDraft && !data.delivery_date.trim()) errors.delivery_date = 'Delivery Date is required';
  return errors;
}

export function isDraftRecord(record: Pick<DeliveryRecord, 'status' | 'is_draft'>): boolean {
  return record.status === 'Draft' || record.is_draft === 'Yes';
}

export function selectableStatuses(record: DeliveryRecord, role: UserRole): DeliveryStatus[] {
  return (record.allowed_statuses ?? []).filter(status => status !== 'In Transit' &&
    (role !== 'Sales Coordinator' || status === 'Draft' || (isDraftRecord(record) && status === 'Scheduled')) &&
    (status !== 'Draft' || ((role === 'Sales Coordinator' || role === 'Admin') && !record.time_in)));
}

export function canRecordTimeIn(record: DeliveryRecord): boolean {
  return !isDraftRecord(record) && !!record.driver && !record.time_in &&
    (record.status === 'Scheduled' || record.status === 'Rescheduled');
}

export function manilaToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function manilaDateTimeInput(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '';
  return new Date(Date.parse(iso) + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function manilaInputToIso(value: string): string {
  return new Date(`${value}:00+08:00`).toISOString();
}
