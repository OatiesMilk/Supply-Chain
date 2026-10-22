import { isValidDateOnly, isoTimestamp, manilaToday, runState } from './deliveryLifecycle';

export const OPEN_STATUSES = ['Scheduled', 'In Transit', 'Pending', 'On-Hold', 'Rescheduled'] as const;
export interface MetricRecord {
  id: string; category: string; status: string; draft: boolean; deletedAt?: Date | null;
  deliveryDate: string; driverId: string | null; driver: string; timeIn: string | null; timeOut: string | null;
  collectionVerified: boolean; collectionVerifiedAt: Date | null; createdAt: Date;
}
export interface ChartScope { module?: string; period?: string; from?: string; to?: string }
export interface RecordSelection extends ChartScope { id?: string; metric?: string; status?: string; overdue?: boolean; day?: string; age?: string; missing?: boolean }
export const MODULES = ['DELIVERY', 'RMA', 'ACCOUNTING_COLLECTION', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'];
export function shiftDay(day: string, offset: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
}
export function mondayRange(today: string) {
  const offset = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const from = shiftDay(today, -offset);
  return { from, to: shiftDay(from, 6) };
}
export function validateSelection(input: Record<string, unknown>): RecordSelection {
  const allowed = new Set(['id', 'module', 'period', 'from', 'to', 'metric', 'status', 'overdue', 'day', 'age', 'missing', 'page']);
  for (const key of Object.keys(input)) if (!allowed.has(key)) throw new Error(`Unknown dashboard filter: ${key}`);
  const s: RecordSelection = {};
  for (const key of ['id', 'module', 'period', 'from', 'to', 'metric', 'status', 'day', 'age'] as const) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== 'string') throw new Error(`${key} must be a string`);
      s[key] = input[key] as string;
    }
  }
  for (const key of ['overdue', 'missing'] as const) {
    if (input[key] !== undefined && !['true', 'false'].includes(input[key] as string)) throw new Error(`${key} is invalid`);
    s[key] = input[key] === 'true';
  }
  if (s.id && !/^[\w-]{1,64}$/.test(s.id)) throw new Error('Invalid record id');
  if (s.module && !MODULES.includes(s.module)) throw new Error('Invalid module');
  if (s.period && !['all', 'today', 'week', 'custom'].includes(s.period)) throw new Error('Invalid period');
  for (const key of ['from', 'to', 'day'] as const) if (s[key] && !isValidDateOnly(s[key])) throw new Error(`Invalid ${key} date`);
  if (s.period === 'custom' && (!s.from || !s.to)) throw new Error('Custom range requires both dates');
  if (s.from && s.to && s.from > s.to) throw new Error('Start must be before end');
  if (s.status && !OPEN_STATUSES.includes(s.status as typeof OPEN_STATUSES[number])) throw new Error('Invalid open status');
  if (s.age && !['0–1', '2–3', '4–7', '8+', 'Unknown'].includes(s.age)) throw new Error('Invalid age bucket');
  if (s.metric && !METRICS.includes(s.metric)) throw new Error('Invalid metric');
  return s;
}
export const METRICS = ['due', 'unassigned', 'unassigned-today', 'overdue', 'transit', 'held', 'completed', 'rma-open', 'rma-held', 'verification', 'verified', 'my-today', 'my-overdue', 'my-remaining', 'my-completed', 'open'] as const as readonly string[];
export const active = (r: MetricRecord) => !r.draft && !r.deletedAt;
export const open = (r: MetricRecord) => active(r) && r.status !== 'ACCOMPLISHED';
export const overdue = (r: MetricRecord, today: string) => open(r) && r.category === 'DELIVERY' && isValidDateOnly(r.deliveryDate) && r.deliveryDate < today;
export function timestampDay(value: string | Date | null): string | null {
  if (typeof value === 'string' && !isValidDateOnly(value.slice(0, 10))) return null;
  const iso = value instanceof Date ? (Number.isNaN(value.getTime()) ? null : value.toISOString()) : isoTimestamp(value);
  return iso ? manilaToday(new Date(iso)) : null;
}
export function calendarAge(value: string | Date | null, today: string): number | null {
  const day = timestampDay(value);
  return !day || day > today ? null : Math.round((Date.parse(today) - Date.parse(day)) / 86400000);
}
export function ageBucket(r: MetricRecord, today: string) {
  const age = calendarAge(r.timeOut, today);
  return age === null ? 'Unknown' : age <= 1 ? '0–1' : age <= 3 ? '2–3' : age <= 7 ? '4–7' : '8+';
}
export function metricMatches(r: MetricRecord, metric: string, today: string): boolean {
  if (!active(r)) return false;
  const delivery = r.category === 'DELIVERY';
  const complete = r.status === 'ACCOMPLISHED';
  switch (metric) {
    case 'due': return delivery && r.deliveryDate === today;
    case 'unassigned': return delivery && !complete && !r.driverId;
    case 'unassigned-today': return metricMatches(r, 'unassigned', today) && r.deliveryDate === today;
    case 'overdue': case 'my-overdue': return overdue(r, today);
    case 'transit': return delivery && runState(r) === 'In Transit';
    case 'held': return delivery && ['ON_HOLD', 'RESCHEDULED'].includes(r.status);
    case 'completed': return delivery && complete && timestampDay(r.timeOut) === today;
    case 'rma-open': return r.category === 'RMA' && !complete;
    case 'rma-held': return r.category === 'RMA' && r.status === 'ON_HOLD';
    case 'verification': return r.category === 'ACCOUNTING_COLLECTION' && complete && !r.collectionVerified;
    case 'verified': return r.category === 'ACCOUNTING_COLLECTION' && r.collectionVerified && timestampDay(r.collectionVerifiedAt) === today;
    case 'my-today': return r.deliveryDate === today;
    case 'my-completed': return complete && timestampDay(r.timeOut) === today;
    case 'my-remaining': return !complete && (delivery ? (isValidDateOnly(r.deliveryDate) && r.deliveryDate <= today) || !!isoTimestamp(r.timeIn) : r.deliveryDate === today);
    case 'open': return !complete;
    default: return false;
  }
}
export function selectionMatches(r: MetricRecord, s: RecordSelection, today: string): boolean {
  if (!active(r)) return false;
  if (s.id && r.id !== s.id) return false;
  if (s.metric && !metricMatches(r, s.metric, s.day || today)) return false;
  if (s.module && r.category !== s.module) return false;
  if (s.status && runState(r) !== s.status) return false;
  if (s.overdue && !overdue(r, today)) return false;
  if (s.age && ageBucket(r, today) !== s.age) return false;
  if (s.missing && isValidDateOnly(r.deliveryDate)) return false;
  const range = s.period === 'today' ? { from: today, to: today } : s.period === 'week' ? mondayRange(today) : s.period === 'custom' ? s : {};
  if (range.from || range.to) {
    if (!isValidDateOnly(r.deliveryDate)) return false;
    if (range.from && r.deliveryDate < range.from || range.to && r.deliveryDate > range.to) return false;
  }
  return true;
}
export const ROLE_CARDS: Record<string, { metric: string; label: string; scope: string }[]> = {
  ADMIN: [
    { metric: 'overdue', label: 'Overdue Deliveries', scope: 'Open deliveries before today' },
    { metric: 'unassigned-today', label: 'Unassigned Today', scope: 'Open deliveries scheduled today' },
    { metric: 'verification', label: 'Unverified Collections', scope: 'Completed, not verified • all dates' },
  ],
  SALES_COORDINATOR: [
    { metric: 'due', label: 'Deliveries Due Today', scope: 'Scheduled today, including completed' },
    { metric: 'unassigned', label: 'Awaiting Assignment', scope: 'Open deliveries • all dates' },
    { metric: 'held', label: 'On Hold / Rescheduled', scope: 'Open deliveries • all dates' },
    { metric: 'completed', label: 'Completed Today', scope: 'Delivery completion time • Manila' },
  ],
  LOGISTICS: [
    { metric: 'unassigned-today', label: 'Unassigned Today', scope: 'Open deliveries scheduled today' },
    { metric: 'transit', label: 'In Transit', scope: 'Deliveries • all scheduled dates' },
    { metric: 'overdue', label: 'Overdue Deliveries', scope: 'Open deliveries before today' },
    { metric: 'completed', label: 'Completed Today', scope: 'Delivery completion time • Manila' },
  ],
  TASS: [
    { metric: 'rma-open', label: 'Open RMA', scope: 'All open RMA, including On Hold' },
    { metric: 'rma-held', label: 'RMA On Hold', scope: 'Subset of Open RMA' },
    { metric: 'verification', label: 'Awaiting Verification', scope: 'Completed collections • all dates' },
    { metric: 'verified', label: 'Verified Today', scope: 'Verification time • Manila' },
  ],
  DRIVER: [
    { metric: 'my-today', label: 'My Runs Today', scope: 'Scheduled today, including completed' },
    { metric: 'my-overdue', label: 'My Overdue Runs', scope: 'Open deliveries before today' },
    { metric: 'my-remaining', label: 'My Remaining Runs', scope: 'Runs ready for execution' },
    { metric: 'my-completed', label: 'Completed Today', scope: 'Actual completion time • Manila' },
  ],
};
