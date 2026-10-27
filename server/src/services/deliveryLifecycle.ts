import type { Role } from '../middleware/auth';

export type RunState = 'Draft' | 'Scheduled' | 'In Transit' | 'Delivered' | 'Pending' | 'On-Hold' | 'Rescheduled';
export interface RunRecord {
  draft?: boolean; status: string; timeIn?: string | null; timeOut?: string | null;
  driver?: string; receivedBy?: string | null; category?: string; deliveryDate?: string | null;
}

export interface DeliveryScheduleState {
  valid: boolean;
  future: boolean;
  overdue: boolean;
  daysLate: number;
}

function dateOnlyEpochDay(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return Math.floor(date.getTime() / 86_400_000);
}

export function isValidDateOnly(value: unknown): value is string {
  return dateOnlyEpochDay(value) !== null;
}

export function deliveryScheduleState(deliveryDate: unknown, now = new Date()): DeliveryScheduleState {
  const dateDay = dateOnlyEpochDay(deliveryDate);
  const todayDay = dateOnlyEpochDay(manilaToday(now));
  if (dateDay === null || todayDay === null) return { valid: false, future: false, overdue: false, daysLate: 0 };
  const daysLate = Math.max(0, todayDay - dateDay);
  return { valid: true, future: dateDay > todayDay, overdue: daysLate > 0, daysLate };
}

export function driverDeliveryDateError(record: RunRecord, role: Role, now = new Date()): string | null {
  if (role !== 'DRIVER' || record.category !== 'DELIVERY' || record.draft || isoTimestamp(record.timeIn)) return null;
  const schedule = deliveryScheduleState(record.deliveryDate, now);
  if (!schedule.valid) return 'This delivery has no valid Delivery Date. Contact Logistics before taking action.';
  if (schedule.future) return 'This delivery is scheduled for a future date and is read-only until that date.';
  return null;
}

// In Transit is exclusively entered through the dedicated Time In action.
export const RUN_TRANSITIONS: Record<RunState, readonly RunState[]> = {
  Draft: ['Scheduled'],
  Scheduled: ['On-Hold', 'Rescheduled', 'Draft'],
  'In Transit': ['Delivered', 'Pending', 'On-Hold', 'Rescheduled'],
  Pending: ['Delivered', 'On-Hold', 'Rescheduled'],
  'On-Hold': ['Scheduled', 'Delivered', 'Pending', 'Rescheduled', 'Draft'],
  Rescheduled: ['Scheduled', 'On-Hold', 'Draft'],
  Delivered: [],
};

// RMA is managed by TASS/Admin, independently of an internal driver run.
export const RMA_TRANSITIONS: Record<RunState, readonly RunState[]> = {
  Draft: ['Scheduled'],
  Scheduled: ['Pending', 'On-Hold', 'Rescheduled', 'Delivered', 'Draft'],
  Pending: ['On-Hold', 'Rescheduled', 'Delivered'],
  'On-Hold': ['Scheduled', 'Pending', 'Rescheduled', 'Delivered', 'Draft'],
  Rescheduled: ['Scheduled', 'On-Hold', 'Draft'],
  // Existing started RMAs can finish without erasing their historical clocks.
  'In Transit': ['Pending', 'On-Hold', 'Rescheduled', 'Delivered'],
  Delivered: [],
};

const STATES: Record<string, RunState> = {
  SCHEDULED: 'Scheduled', IN_TRANSIT: 'In Transit', ACCOMPLISHED: 'Delivered',
  ON_HOLD: 'On-Hold', RESCHEDULED: 'Rescheduled', PENDING: 'Pending',
};
export function runState(record: RunRecord): RunState {
  if (record.draft) return 'Draft';
  // Legacy internal runs recorded Time In without advancing Scheduled. RMA
  // clocks are historical evidence and do not override its explicit status.
  if (record.category !== 'RMA' && record.status === 'SCHEDULED' && isoTimestamp(record.timeIn)) return 'In Transit';
  return STATES[record.status] ?? record.status as RunState;
}
export function allowedStatuses(record: RunRecord): RunState[] {
  if (record.category === 'RMA') {
    return (RMA_TRANSITIONS[runState(record)] ?? []).filter(status => status !== 'Draft' || !record.timeIn);
  }
  return (RUN_TRANSITIONS[runState(record)] ?? []).filter(status => {
    if (status === 'Draft' || status === 'Scheduled') return !record.timeIn;
    if (status === 'Delivered' || status === 'Pending') return Boolean(isoTimestamp(record.timeIn));
    return true;
  });
}
export function transitionError(record: RunRecord, target: RunState, role: Role): string | null {
  const tassRma = role === 'TASS' && record.category === 'RMA';
  if (record.draft && target === 'Scheduled' && !tassRma && !['SALES_COORDINATOR', 'ADMIN'].includes(role)) return 'Only Sales Coordinator, TASS for RMA, or Admin may submit or return drafts.';
  if (target === 'In Transit') return 'Use Record Time In to start this run.';
  if (target === 'Draft' && !tassRma && !['SALES_COORDINATOR', 'ADMIN'].includes(role)) return 'Only Sales Coordinator, TASS for RMA, or Admin may return a record to Draft.';
  if (target === 'Draft' && record.timeIn) return 'A started run cannot be returned to Draft.';
  if (!allowedStatuses(record).includes(target)) return `Cannot change ${runState(record)} to ${target}.`;
  return null;
}
export function timeInError(record: RunRecord): string | null {
  if (record.category === 'RMA') return 'RMA records use status updates instead of delivery Time In.';
  if (record.draft) return 'Submit the draft before recording Time In.';
  if (!record.driver?.trim()) return 'Assign a driver before recording Time In.';
  if (record.timeIn) return 'Time In has already been recorded for this attempt.';
  if (!['Scheduled', 'Rescheduled'].includes(runState(record))) return 'Only a Scheduled or Rescheduled run can start.';
  return null;
}
export function isoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
export function manilaToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
