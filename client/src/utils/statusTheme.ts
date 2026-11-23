/**
 * Single source of truth for operational record status badges, chips, dots, and display labels.
 * Supports both UI display keys ('Delivered', 'On-Hold', 'Transport Complete') and uppercase
 * backend/transaction keys ('ACCOMPLISHED', 'ON_HOLD', 'TRANSPORT_COMPLETE').
 */

export interface StatusVisual {
  label: string;
  badge: string;
  chip: string;
  dot: string;
}

export type CanonicalStatusKey =
  | 'Draft'
  | 'Scheduled'
  | 'In Transit'
  | 'Transport Complete'
  | 'Complete'
  | 'Pending'
  | 'On-Hold'
  | 'Rescheduled';

export const STATUS_VISUALS: Record<CanonicalStatusKey, StatusVisual> = {
  Draft: {
    label: 'Draft',
    badge: 'bg-slate-100 text-slate-700 border-slate-300',
    chip: 'bg-slate-100 text-slate-700',
    dot: 'bg-slate-400',
  },
  Scheduled: {
    label: 'Scheduled',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    chip: 'bg-blue-50 text-blue-700',
    dot: 'bg-blue-500',
  },
  'In Transit': {
    label: 'In Transit',
    badge: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    chip: 'bg-cyan-50 text-cyan-700',
    dot: 'bg-cyan-500',
  },
  'Transport Complete': {
    label: 'Transport Complete',
    badge: 'bg-blue-50 text-blue-800 border-blue-200',
    chip: 'bg-sky-50 text-sky-800',
    dot: 'bg-sky-700',
  },
  Complete: {
    label: 'Complete',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    chip: 'bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  Pending: {
    label: 'Pending',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    chip: 'bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
  },
  'On-Hold': {
    label: 'On-Hold',
    badge: 'bg-red-50 text-red-700 border-red-200',
    chip: 'bg-red-50 text-red-700',
    dot: 'bg-red-500',
  },
  Rescheduled: {
    label: 'Rescheduled',
    badge: 'bg-purple-50 text-purple-700 border-purple-200',
    chip: 'bg-purple-50 text-purple-700',
    dot: 'bg-purple-500',
  },
};

const ALIAS_MAP: Record<string, CanonicalStatusKey> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  IN_TRANSIT: 'In Transit',
  TRANSPORT_COMPLETE: 'Transport Complete',
  DELIVERED: 'Complete',
  ACCOMPLISHED: 'Complete',
  COMPLETE: 'Complete',
  COMPLETED: 'Complete',
  RECEIVED: 'Complete',
  PENDING: 'Pending',
  ON_HOLD: 'On-Hold',
  RESCHEDULED: 'Rescheduled',
};

export const CALENDAR_LEGEND_STATUSES: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'Draft', label: 'Draft' },
  { key: 'In Transit', label: 'In Transit' },
  { key: 'Transport Complete', label: 'Transport Complete' },
  { key: 'Delivered', label: 'Complete' },
  { key: 'Scheduled', label: 'Scheduled' },
  { key: 'Pending', label: 'Pending' },
  { key: 'On-Hold', label: 'On-Hold' },
  { key: 'Rescheduled', label: 'Rescheduled' },
];

export function normalizeStatusKey(status: string | null | undefined): CanonicalStatusKey | null {
  if (!status) return null;
  if (status in STATUS_VISUALS) return status as CanonicalStatusKey;
  const normalized = status.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return ALIAS_MAP[normalized] ?? null;
}

export function getStatusVisual(status: string | null | undefined): StatusVisual {
  const key = normalizeStatusKey(status);
  return key ? STATUS_VISUALS[key] : STATUS_VISUALS.Draft;
}

export function statusBadgeClass(status: string | null | undefined): string {
  return getStatusVisual(status).badge;
}

export function statusChipClass(status: string | null | undefined): string {
  return getStatusVisual(status).chip;
}

export function statusDotClass(status: string | null | undefined): string {
  const key = normalizeStatusKey(status);
  return key ? STATUS_VISUALS[key].dot : 'bg-slate-300';
}

export function statusDisplayLabel(status: string | null | undefined): string {
  if (!status) return '';
  const key = normalizeStatusKey(status);
  return key ? STATUS_VISUALS[key].label : status;
}
