import type { Role } from '../middleware/auth';

export type RunState = 'Draft' | 'Scheduled' | 'In Transit' | 'Delivered' | 'Pending' | 'On-Hold' | 'Rescheduled';
export interface RunRecord {
  draft?: boolean; status: string; timeIn?: string | null; timeOut?: string | null;
  driver?: string; receivedBy?: string | null;
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

const STATES: Record<string, RunState> = {
  SCHEDULED: 'Scheduled', IN_TRANSIT: 'In Transit', ACCOMPLISHED: 'Delivered',
  ON_HOLD: 'On-Hold', RESCHEDULED: 'Rescheduled', PENDING: 'Pending',
};
export function runState(record: RunRecord): RunState {
  if (record.draft) return 'Draft';
  // Legacy saves recorded Time In without advancing Scheduled. Treat the valid
  // existing stamp as the started attempt; never invent or overwrite its clock.
  if (record.status === 'SCHEDULED' && isoTimestamp(record.timeIn)) return 'In Transit';
  return STATES[record.status] ?? record.status as RunState;
}
export function allowedStatuses(record: RunRecord): RunState[] {
  return (RUN_TRANSITIONS[runState(record)] ?? []).filter(status => {
    if (status === 'Draft' || status === 'Scheduled') return !record.timeIn;
    if (status === 'Delivered' || status === 'Pending') return Boolean(isoTimestamp(record.timeIn));
    return true;
  });
}
export function transitionError(record: RunRecord, target: RunState, role: Role): string | null {
  if (target === 'In Transit') return 'Use Record Time In to start this run.';
  if (target === 'Draft' && !['SALES_COORDINATOR', 'ADMIN'].includes(role)) return 'Only Sales Coordinator or Admin may return a record to Draft.';
  if (target === 'Draft' && record.timeIn) return 'A started run cannot be returned to Draft.';
  if (!allowedStatuses(record).includes(target)) return `Cannot change ${runState(record)} to ${target}.`;
  return null;
}
export function timeInError(record: RunRecord): string | null {
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
