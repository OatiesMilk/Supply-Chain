import type { DeliveryRecord, DeliveryStatus, UserRole } from '../types';

export function submissionErrors(data: {
  company_name: string; company_id: string; reference: string; delivery_date: string; category?: string;
  rma_reference?: string; rma_type?: string; purchase_date?: string; rma_movement?: string | null;
  priority?: string; area?: string; account_manager?: string;
  customer_contact_name?: string; customer_contact_email?: string; customer_contact_phone?: string;
}, isDraft: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.company_name.trim()) errors.company_name = 'Company Name is required';
  else if (!data.company_id) errors.company_name = 'Select a company from the list';
  const isRma = data.category === 'RMA';
  if (!isRma && !isDraft && !data.reference.trim()) errors.reference = 'Reference (SAP number) is required';
  if (!isRma && !isDraft && !data.delivery_date) errors.delivery_date = 'Delivery Date is required';
  if (isRma) {
    if (!isDraft && !['LOGISTICS_TRANSPORT', 'SUPPLIER_COLLECTION', 'INTERNAL_NO_DRIVER'].includes(data.rma_movement ?? '')) errors.rma_movement = 'Select a movement method before submitting';
    if (!isDraft && data.rma_movement === 'LOGISTICS_TRANSPORT' && !deliveryScheduleState(data.delivery_date).valid) errors.delivery_date = 'A valid Delivery Date is required for Logistics transport';
    if (!data.priority?.trim()) errors.priority = 'Priority is required';
    else if (!['1 - Low', '2 - Moderate', '3 - High'].includes(data.priority)) errors.priority = 'Select a valid Priority';
    if (!data.area?.trim()) errors.area = 'Area is required';
    if (!data.account_manager?.trim()) errors.account_manager = 'Account Manager is required';
    const email = data.customer_contact_email?.trim() ?? '';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.customer_contact_email = 'Enter a valid email address';
  }
  return errors;
}

export function isDraftRecord(record: Pick<DeliveryRecord, 'status' | 'is_draft'>): boolean {
  return record.status === 'Draft' || record.is_draft === 'Yes';
}

export function selectableStatuses(record: DeliveryRecord, role: UserRole): DeliveryStatus[] {
  const isStartedRma = record.category === 'RMA' && Boolean(
    record.rma_transport_started_at ||
    record.rma_received_at ||
    record.rma_transport_status === 'IN_TRANSIT' ||
    record.rma_transport_status === 'COMPLETED'
  );
  return (record.allowed_statuses ?? []).filter(status => status !== 'In Transit' &&
    (record.category !== 'RMA' || status !== 'Delivered' || role === 'TASS') &&
    (role !== 'Sales Coordinator' || status === 'Draft' || (isDraftRecord(record) && status === 'Scheduled')) &&
    (status !== 'Draft' || ((role === 'Sales Coordinator' || role === 'Admin' || (role === 'TASS' && record.category === 'RMA')) && !record.time_in && !isStartedRma)));
}

/** Plain-language effects shown before a submitted record is returned to Draft. */
export function returnToDraftConsequences(record: Pick<DeliveryRecord, 'driver' | 'category'>): string[] {
  const driver = (record.driver ?? '').trim();
  const hasDispatch = record.category !== 'RMA';
  const lines: string[] = [];
  if (driver) lines.push(`${driver} will no longer see this run until you submit it again.`);
  if (hasDispatch) lines.push("Logistics can't change the driver or vehicle while it's a Draft.");
  lines.push(hasDispatch
    ? 'You can edit the order details, then press Submit to send it back to Logistics.'
    : 'You can edit the details, then press Submit to send it again.');
  return lines;
}

export function canRecordTimeIn(record: DeliveryRecord): boolean {
  return record.category !== 'RMA' && !isDraftRecord(record) && !!record.driver && !record.time_in &&
    (record.status === 'Scheduled' || record.status === 'Rescheduled');
}

export function deliveryScheduleState(deliveryDate: string, today = manilaToday()): { valid: boolean; future: boolean; overdue: boolean; daysLate: number } {
  const epochDay = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return Math.floor(date.getTime() / 86_400_000);
  };
  const dueDay = epochDay(deliveryDate);
  const todayDay = epochDay(today);
  if (dueDay === null || todayDay === null) return { valid: false, future: false, overdue: false, daysLate: 0 };
  const daysLate = Math.max(0, todayDay - dueDay);
  return { valid: true, future: dueDay > todayDay, overdue: daysLate > 0, daysLate };
}

export function hasValidRunTimeIn(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

export function isDashboardRunActionable(record: DeliveryRecord, today = manilaToday()): boolean {
  if (record.category === 'RMA' || isDraftRecord(record) || record.status === 'Delivered' || !record.driver) return false;
  const schedule = deliveryScheduleState(record.delivery_date, today);
  const started = hasValidRunTimeIn(record.time_in);
  return started || (schedule.valid && !schedule.future);
}

export function dashboardRunDaysLate(record: DeliveryRecord, today = manilaToday()): number {
  if (record.category !== 'Deliveries') return 0;
  if (record.status === 'Delivered') return record.completed_late ? Math.max(0, record.days_late ?? 0) : 0;
  return deliveryScheduleState(record.delivery_date, today).daysLate;
}

export const PRIORITY_LOCKED_NOTE = 'Priority is locked after delivery.';

/** Delivered is the only state with no further transitions, so its Priority is read-only for every role. */
export function isPriorityLocked(record: Pick<DeliveryRecord, 'status'>): boolean {
  return record.status === 'Delivered';
}

export function manilaToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Validation message for the "New delivery date" entered when rescheduling a Delivery, or null when valid. */
export function rescheduleDateError(newDate: string, currentDate: string, today = manilaToday()): string | null {
  if (!newDate) return 'Enter the new delivery date.';
  if (!deliveryScheduleState(newDate, today).valid) return 'Enter a valid date.';
  if (newDate < today) return 'The new delivery date cannot be in the past.';
  if (newDate === currentDate) return 'The new delivery date must be different from the current delivery date.';
  return null;
}

export function manilaDateTimeInput(iso: string | null | undefined): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '';
  return new Date(Date.parse(iso) + 8 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function manilaInputToIso(value: string): string {
  return new Date(`${value}:00+08:00`).toISOString();
}
