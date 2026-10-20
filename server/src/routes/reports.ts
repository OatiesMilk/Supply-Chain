import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { asyncRoute } from '../middleware/asyncRoute';
import { prisma } from '../db';
import { requireAuth, requireScreen } from '../middleware/auth';
import { CATEGORY_TO_DB, CATEGORY_FROM_DB, STATUS_FROM_DB } from '../mappings';
import { runState } from '../services/deliveryLifecycle';
import { recordScope } from '../services/recordAccess';
import { manilaDateRange } from '../services/dateSemantics';

const router = Router();

// GET /reports/summary — delivery-date cohort with a distinct Time Out count.
// Legacy dateFrom/dateTo aliases remain supported for existing API clients.
router.get('/summary', requireAuth, requireScreen('statistical_reports'), asyncRoute(async (req, res) => {
  const queryValue = (key: string): string | undefined => {
    const value = req.query[key];
    return typeof value === 'string' ? value : undefined;
  };
  const deliveryDateFrom = queryValue('deliveryDateFrom') ?? queryValue('dateFrom');
  const deliveryDateTo = queryValue('deliveryDateTo') ?? queryValue('dateTo');
  const category = queryValue('category');
  const area = queryValue('area');
  const driver = queryValue('driver');
  const status = queryValue('status');

  if ([req.query.deliveryDateFrom, req.query.deliveryDateTo, req.query.dateFrom, req.query.dateTo,
    req.query.category, req.query.area, req.query.driver, req.query.status]
    .some(value => value !== undefined && typeof value !== 'string')) {
    return res.status(400).json({ error: 'Report filters must be single string values.' });
  }
  if ((req.query.deliveryDateFrom !== undefined || req.query.deliveryDateTo !== undefined)
    && (req.query.dateFrom !== undefined || req.query.dateTo !== undefined)) {
    return res.status(400).json({ error: 'Use deliveryDateFrom/deliveryDateTo or the legacy dateFrom/dateTo aliases, not both.' });
  }

  let completionRange: ReturnType<typeof manilaDateRange>;
  try {
    completionRange = manilaDateRange(deliveryDateFrom, deliveryDateTo);
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid delivery date range.' });
  }

  const filters: Prisma.DeliveryRecordWhereInput = {
    deletedAt: null,
    AND: [recordScope(req.user!)],
  };
  if (category) filters.category = CATEGORY_TO_DB[category] ?? category;
  if (area) filters.area = area;
  if (driver) filters.driver = driver;

  const cohortWhere: Prisma.DeliveryRecordWhereInput = { ...filters };
  if (deliveryDateFrom || deliveryDateTo) {
    cohortWhere.deliveryDate = {
      ...(deliveryDateFrom ? { gte: deliveryDateFrom } : {}),
      ...(deliveryDateTo ? { lte: deliveryDateTo } : {}),
    };
  }

  const completionWhere: Prisma.DeliveryRecordWhereInput = {
    ...filters,
    draft: false,
    status: 'ACCOMPLISHED',
    // Lifecycle writes store UTC ISO strings; use the same representation for
    // lexical range comparisons, including the exclusive next-Manila-day bound.
    timeOut: Object.keys(completionRange).length > 0 ? {
      ...(completionRange.gte ? { gte: completionRange.gte.toISOString() } : {}),
      ...(completionRange.lt ? { lt: completionRange.lt.toISOString() } : {}),
    } : { not: null },
  };

  const [foundRecords, completedInRange] = await Promise.all([
    prisma.deliveryRecord.findMany({
      where: cohortWhere,
      select: { category: true, status: true, draft: true, timeIn: true, area: true, driver: true, deliveryDate: true },
    }),
    prisma.deliveryRecord.count({ where: completionWhere }),
  ]);
  const normalizedStatus = status ? (STATUS_FROM_DB[status] ?? status) : undefined;
  const records = foundRecords.filter(record => !normalizedStatus || runState(record) === normalizedStatus);

  const total = records.length;
  const byStatus:   Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byArea:     Record<string, number> = {};
  const byDriver:   Record<string, number> = {};

  for (const r of records) {
    const statusKey   = runState(r);
    const categoryKey = CATEGORY_FROM_DB[r.category] ?? r.category;
    byStatus[statusKey]     = (byStatus[statusKey]     ?? 0) + 1;
    byCategory[categoryKey] = (byCategory[categoryKey] ?? 0) + 1;
    if (r.area)   byArea[r.area]     = (byArea[r.area]     ?? 0) + 1;
    if (r.driver) byDriver[r.driver] = (byDriver[r.driver] ?? 0) + 1;
  }

  const accomplished = byStatus['Delivered'] ?? 0;

  res.json({
    total,
    accomplished,
    completed_in_range: completedInRange,
    on_hold:         byStatus['On-Hold']  ?? 0,
    pending:         byStatus['Pending']  ?? 0,
    completion_rate: total > 0 ? Math.round((accomplished / total) * 100) : 0,
    date_basis: {
      cohort: 'deliveryDate',
      completion: 'timeOut',
      time_zone: 'Asia/Manila',
    },
    by_status:    Object.entries(byStatus).map(([s, count]) => ({ status: s, count })),
    by_category:  Object.entries(byCategory).map(([c, count]) => ({ category: c, count })),
    by_area:      Object.entries(byArea).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([a, count]) => ({ area: a, count })),
    by_driver:    Object.entries(byDriver).sort((a, b) => b[1] - a[1]).map(([d, count]) => ({ driver: d, count })),
  });
}));

export default router;
