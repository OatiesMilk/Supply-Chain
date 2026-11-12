import type { Prisma, PrismaClient } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { serializeRecord } from '../mappings';
import { recordScope } from './recordAccess';
import { manilaToday } from './deliveryLifecycle';
import { dashboardRecordFilter, driversInTransitFilter, driversOutFilter, driversWaitingFilter } from './dashboardFilters';

const PREVIEW_LIMIT = 10;
const DRIVER_LINK_LIMIT = 3;
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
    record_previews: {
      rma_requests: [] as ReturnType<typeof serializeRecord>[], rma_attention: [] as ReturnType<typeof serializeRecord>[],
      transport_requests: [] as ReturnType<typeof serializeRecord>[], in_transit: [] as ReturnType<typeof serializeRecord>[],
      rma_in_transit: [] as ReturnType<typeof serializeRecord>[],
    },
    transport_requests_by_type: {} as Record<string, number>,
    drivers_out: [] as Array<{ driver_id: string; driver: string; total: number; in_transit: number; records: ReturnType<typeof serializeRecord>[] }>,
    drivers_out_total: 0, drivers_out_jobs_total: 0,
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
    const inTransit = dashboardRecordFilter('sc-in-transit', today)!;
    [result.counts['sc-in-transit'], result.record_previews.in_transit] = await Promise.all([
      count('sc-in-transit'), preview(inTransit, [{ deliveryDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]),
    ]);
  }
  if (user.role === 'LOGISTICS') {
    const ids = ['log-flags', 'log-unassigned', 'log-on-hold', 'log-rescheduled'];
    const counts = await Promise.all(ids.map(count)); ids.forEach((id, i) => { result.counts[id] = counts[i]; });
    const requests = dashboardRecordFilter('log-rma-requests', today)!;
    result.counts.rma_requests = await db.deliveryRecord.count({ where: scoped(requests) });
    result.record_previews.rma_requests = await preview(requests);
    // Every driver job type with no Driver profile yet; one grouped count gives the per-type links.
    const transport = dashboardRecordFilter('log-transport-requests', today)!;
    const [transportTotal, transportPreview, byType] = await Promise.all([
      count('log-transport-requests'),
      preview(transport, [{ deliveryDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]),
      db.deliveryRecord.groupBy({ by: ['category'], where: scoped(transport), _count: { _all: true } }),
    ]);
    result.counts['log-transport-requests'] = transportTotal;
    result.record_previews.transport_requests = transportPreview;
    for (const group of byType) if (group.category) result.transport_requests_by_type[group.category] = group._count._all;
    // Distinct Driver profiles with at least one active job (see driversOutFilter).
    // Only grouped counts are materialized; each displayed driver's links are bounded to three.
    const [jobs, transit] = await Promise.all([
      db.deliveryRecord.groupBy({ by: ['driverId'], where: scoped(driversOutFilter(today)), _count: { _all: true } }),
      db.deliveryRecord.groupBy({ by: ['driverId'], where: scoped(driversInTransitFilter(today)), _count: { _all: true } }),
    ]);
    const inTransit = new Map(transit.map(group => [group.driverId, group._count._all]));
    const driverIds = jobs.map(group => group.driverId).filter((id): id is string => !!id);
    const names = new Map((driverIds.length ? await db.driver.findMany({ where: { id: { in: driverIds } }, select: { id: true, name: true } }) : [])
      .map(profile => [profile.id, profile.name]));
    const drivers = jobs.filter(group => group.driverId).map(group => ({
      driver_id: group.driverId as string, driver: names.get(group.driverId as string) ?? '',
      total: group._count._all, in_transit: inTransit.get(group.driverId) ?? 0,
    })).sort((a, b) => b.in_transit - a.in_transit || b.total - a.total || a.driver.localeCompare(b.driver) || a.driver_id.localeCompare(b.driver_id));
    result.drivers_out_total = drivers.length;
    result.drivers_out_jobs_total = drivers.reduce((sum, row) => sum + row.total, 0);
    const linkOrder: Prisma.DeliveryRecordOrderByWithRelationInput[] = [{ deliveryDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }];
    result.drivers_out = await Promise.all(drivers.slice(0, PREVIEW_LIMIT).map(async row => {
      // Jobs in transit first. Prisma cannot order by that condition, so read the two bounded groups separately.
      const started = row.in_transit ? await preview({ AND: [driversInTransitFilter(today), { driverId: row.driver_id }] }, linkOrder, DRIVER_LINK_LIMIT) : [];
      const rest = started.length < DRIVER_LINK_LIMIT
        ? await preview({ AND: [driversWaitingFilter(today), { driverId: row.driver_id }] }, linkOrder, DRIVER_LINK_LIMIT - started.length)
        : [];
      const records = [...started, ...rest];
      return { ...row, driver: row.driver || records[0]?.driver || 'Unnamed driver', records };
    }));
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
    const moving = dashboardRecordFilter('tass-rma-in-transit', today)!;
    [result.counts['tass-rma-in-transit'], result.record_previews.rma_in_transit] = await Promise.all([
      count('tass-rma-in-transit'), preview(moving, [{ rmaTransportStartedAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]),
    ]);
  }
  if (user.role === 'ADMIN') {
    const sum = await db.deliveryRecord.aggregate({ where: scoped(dashboardRecordFilter('admin-unverified-collections', today)!), _sum: { amount: true } });
    result.unverified_collections_amount = sum._sum.amount ?? 0;
  }
  return result;
}
