import type { DeliveryRecord, DeliveryStatus, UserRole } from '../types';

export function submissionErrors(data: { company_name: string; company_id: string; reference: string; delivery_date: string }, isDraft: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.company_name.trim()) errors.company_name = 'Company Name is required';
  else if (!data.company_id) errors.company_name = 'Select a company from the list';
  if (!isDraft && !data.reference.trim()) errors.reference = 'Reference (SAP number) is required';
  if (!isDraft && !data.delivery_date) errors.delivery_date = 'Delivery Date is required';
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
  if (record.category !== 'Deliveries') return record.delivery_date === today;
  const schedule = deliveryScheduleState(record.delivery_date, today);
  const started = hasValidRunTimeIn(record.time_in);
  return started || (schedule.valid && !schedule.future);
}

export function dashboardRunDaysLate(record: DeliveryRecord, today = manilaToday()): number {
  if (record.category !== 'Deliveries') return 0;
  if (record.status === 'Delivered') return record.completed_late ? Math.max(0, record.days_late ?? 0) : 0;
  return deliveryScheduleState(record.delivery_date, today).daysLate;
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
