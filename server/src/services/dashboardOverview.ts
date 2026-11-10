import type { Prisma, PrismaClient } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { serializeRecord } from '../mappings';
import { recordScope } from './recordAccess';
import { manilaToday } from './deliveryLifecycle';
import { dashboardRecordFilter } from './dashboardFilters';

const PREVIEW_LIMIT = 10;
const previewInclude = { company: true, createdBy: true, modifiedBy: true, lineItems: true } as const;

export async function dashboardOverview(db: PrismaClient, user: AuthUser) {
  const today = manilaToday();
  const scoped = (where: Prisma.DeliveryRecordWhereInput = {}): Prisma.DeliveryRecordWhereInput => ({ AND: [recordScope(user), { deletedAt: null }, where] });
  const count = (id: string) => db.deliveryRecord.count({ where: scoped(dashboardRecordFilter(id, today)!) });
  const preview = async (
    where: Prisma.DeliveryRecordWhereInput,
    orderBy: Prisma.DeliveryRecordOrderByWithRelationInput[] = [{ createdAt: 'asc' }, { id: 'asc' }],
    take = PREVIEW_LIMIT,
  ) => (await db.deliveryRecord.findMany({
    where: scoped(where), include: previewInclude, orderBy, take,
  })).map(row => serializeRecord(row, user));
  const result = {
    role: user.role, generated_at: new Date().toISOString(), record_total: await db.deliveryRecord.count({ where: scoped() }),
    status_totals: {} as Record<string, number>, counts: {} as Record<string, number>,
    record_previews: { rma_requests: [] as ReturnType<typeof serializeRecord>[], rma_attention: [] as ReturnType<typeof serializeRecord>[] },
    drivers_out: [] as Array<{ driver: string; total: number; records: ReturnType<typeof serializeRecord>[] }>, drivers_out_total: 0,
    unverified_collections_amount: 0,
  };
  if (user.role === 'SALES_COORDINATOR') {
    const ids = ['sc-attention-no-driver', 'sc-attention-on-hold-rescheduled', 'sc-attention-pending-confirmation', 'sc-attention-all'];
    const counts = await Promise.all(ids.map(count)); ids.forEach((id, i) => { result.counts[id] = counts[i]; });
    const states: Array<[string, Prisma.DeliveryRecordWhereInput]> = [
      ['Scheduled', { status: 'SCHEDULED', timeIn: null }],
      ['In Transit', { OR: [{ status: 'IN_TRANSIT' }, { status: 'SCHEDULED', NOT: { timeIn: null } }] }],
      ['Pending', { status: 'PENDING' }], ['On-Hold', { status: 'ON_HOLD' }],
      ['Rescheduled', { status: 'RESCHEDULED' }], ['Delivered', { status: 'ACCOMPLISHED' }],
    ];
    const totals = await Promise.all(states.map(([, where]) => db.deliveryRecord.count({ where: scoped({ category: 'DELIVERY', draft: false, ...where }) })));
    states.forEach(([status], i) => { result.status_totals[status] = totals[i]; });
  }
  if (user.role === 'LOGISTICS') {
    const ids = ['log-flags', 'log-unassigned', 'log-on-hold', 'log-rescheduled'];
    const counts = await Promise.all(ids.map(count)); ids.forEach((id, i) => { result.counts[id] = counts[i]; });
    const requests = { category: 'RMA', draft: false, rmaMovement: 'LOGISTICS_TRANSPORT', status: { not: 'ACCOMPLISHED' }, rmaTransportStatus: { not: 'COMPLETED' } };
    result.counts.rma_requests = await db.deliveryRecord.count({ where: scoped(requests) });
    result.record_previews.rma_requests = await preview(requests);
    const active = scoped({ draft: false, deliveryDate: today, driver: { not: '' }, status: { not: 'ACCOMPLISHED' }, OR: [
      { category: 'DELIVERY' }, { category: 'RMA', rmaMovement: 'LOGISTICS_TRANSPORT', rmaTransportStatus: { not: 'COMPLETED' } },
    ] });
    // Only grouped driver identities/counts are materialized; record history is
    // never transferred. Each displayed driver's links are bounded to three.
    const groups = await db.deliveryRecord.groupBy({ by: ['driverId', 'driver'], where: active, _count: { _all: true }, orderBy: { driver: 'asc' } });
    result.drivers_out_total = groups.length;
    result.drivers_out = await Promise.all(groups.slice(0, PREVIEW_LIMIT).map(async group => ({ driver: group.driver, total: group._count._all,
      records: (await db.deliveryRecord.findMany({ where: { AND: [active, { driverId: group.driverId, driver: group.driver }] },
        include: previewInclude, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 3 })).map(row => serializeRecord(row, user)),
    })));
  }
  if (user.role === 'TASS') {
    const open = dashboardRecordFilter('tass-open-rma', today)!;
    const ids = ['tass-open-rma', 'tass-rma-on-hold', 'tass-rma-aging'];
    const counts = await Promise.all(ids.map(count)); ids.forEach((id, i) => { result.counts[id] = counts[i]; });
    result.counts.rma_attention = result.counts['tass-open-rma'];
    // On-Hold first, then oldest submission first. Prisma cannot order by a custom
    // status rank, so read the two groups separately; each read is bounded.
    const oldest: Prisma.DeliveryRecordOrderByWithRelationInput[] = [{ submittedAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }];
    const onHold = await preview(dashboardRecordFilter('tass-rma-on-hold', today)!, oldest);
    const rest = onHold.length < PREVIEW_LIMIT
      ? await preview({ AND: [open, { status: { not: 'ON_HOLD' } }] }, oldest, PREVIEW_LIMIT - onHold.length)
      : [];
    result.record_previews.rma_attention = [...onHold, ...rest];
  }
  if (user.role === 'ADMIN') {
    const sum = await db.deliveryRecord.aggregate({ where: scoped(dashboardRecordFilter('admin-unverified-collections', today)!), _sum: { amount: true } });
    result.unverified_collections_amount = sum._sum.amount ?? 0;
  }
  return result;
}
