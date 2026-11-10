import type { Prisma } from '@prisma/client';
import { manilaToday } from './deliveryLifecycle';

/** Every RMA that is neither completed nor a draft. One definition for the
 * dashboard tile, its drill-down, the attention table and the sidebar badge. */
export const OPEN_RMA_STATUSES = ['SCHEDULED', 'PENDING', 'IN_TRANSIT', 'ON_HOLD', 'RESCHEDULED'];
/** RMA open longer than this many Manila days are "aging" (red on the dashboard). */
export const RMA_AGING_DAYS = 7;

/** Shared by paginated drill-downs and aggregate counters; authorization scope
 * is intersected separately by every caller. */
export function dashboardRecordFilter(id: string, today = manilaToday()): Prisma.DeliveryRecordWhereInput | null {
  const delivery = { category: 'DELIVERY', draft: false };
  const date = new Date(`${today}T00:00:00+08:00`);
  const tomorrow = new Date(date.getTime() + 86_400_000);
  const dueSoon = new Date(`${today}T00:00:00Z`); dueSoon.setUTCDate(dueSoon.getUTCDate() + 2);
  const unassigned = { driver: '', status: { not: 'ACCOMPLISHED' } };
  const held = { status: { in: ['ON_HOLD', 'RESCHEDULED'] } };
  const pending: Prisma.DeliveryRecordWhereInput = { OR: [{ status: 'PENDING' }, { status: 'SCHEDULED', timeIn: null }] };
  const due: Prisma.DeliveryRecordWhereInput = { ...unassigned, deliveryDate: { gt: '', lte: dueSoon.toISOString().slice(0, 10) } };
  switch (id) {
    case 'sc-scheduled-today': return { ...delivery, status: 'SCHEDULED', timeIn: null, deliveryDate: today };
    case 'sc-pending-assignment': case 'log-unassigned': return { ...delivery, ...unassigned };
    case 'sc-on-hold': case 'log-on-hold': return { ...delivery, status: 'ON_HOLD' };
    case 'sc-rescheduled': case 'log-rescheduled': return { ...delivery, status: 'RESCHEDULED' };
    case 'sc-completed-today': case 'log-completed-today': return { ...delivery, status: 'ACCOMPLISHED', timeOut: { gte: date.toISOString(), lt: tomorrow.toISOString() } };
    case 'log-assigned-today': return { ...delivery, NOT: { driver: '' }, deliveryDate: today, status: { not: 'ACCOMPLISHED' } };
    case 'sc-attention-no-driver': return { ...delivery, ...due };
    case 'sc-attention-on-hold-rescheduled': case 'log-on-hold-rescheduled': return { ...delivery, ...held };
    case 'sc-attention-pending-confirmation': return { ...delivery, ...pending };
    case 'sc-attention-all': return { ...delivery, OR: [due, held, pending] };
    case 'log-flags': return { ...delivery, OR: [unassigned, held] };
    case 'tass-open-rma': return { category: 'RMA', draft: false, status: { in: OPEN_RMA_STATUSES } };
    case 'tass-rma-aging': {
      // Older than 7 Manila days: submitted on or before (today - 8 days). Rows the
      // backfill missed fall back to their creation time.
      const cutoff = new Date(date.getTime() - RMA_AGING_DAYS * 86_400_000);
      return { category: 'RMA', draft: false, status: { in: OPEN_RMA_STATUSES },
        OR: [{ submittedAt: { lt: cutoff } }, { submittedAt: null, createdAt: { lt: cutoff } }] };
    }
    case 'tass-rma-on-hold': return { category: 'RMA', draft: false, status: 'ON_HOLD' };
    case 'tass-pending-pickups': return { category: 'PROCUREMENT_PICKUP', draft: false, status: { in: ['SCHEDULED', 'PENDING'] } };
    case 'tass-verified-today': return { category: 'ACCOUNTING_COLLECTION', draft: false, collectionVerified: true, collectionVerifiedAt: { gte: date, lt: tomorrow } };
    case 'tass-pending-verification': case 'admin-unverified-collections': return { category: 'ACCOUNTING_COLLECTION', draft: false, status: 'ACCOMPLISHED', collectionVerified: false };
    default: return null;
  }
}
