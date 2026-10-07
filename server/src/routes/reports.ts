import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireScreen } from '../middleware/auth';
import { CATEGORY_TO_DB, CATEGORY_FROM_DB, STATUS_FROM_DB } from '../mappings';
import { runState } from '../services/deliveryLifecycle';

const router = Router();


// GET /reports/summary — on-demand statistical summary with optional filters.
// Reads live from DeliveryRecord (not the snapshot table).
router.get('/summary', requireAuth, requireScreen('statistical_reports'), async (req, res) => {
  const { dateFrom, dateTo, category, area, driver, status } = req.query as Record<string, string>;

  const where: any = { deletedAt: null };
  if (dateFrom || dateTo) {
    where.deliveryDate = {};
    if (dateFrom) where.deliveryDate.gte = dateFrom;
    if (dateTo)   where.deliveryDate.lte = dateTo;
  }
  if (category) where.category = CATEGORY_TO_DB[category] ?? category;
  if (area)     where.area     = area;
  if (driver)   where.driver   = driver;
  const foundRecords = await prisma.deliveryRecord.findMany({
    where,
    select: { category: true, status: true, draft: true, timeIn: true, area: true, driver: true, deliveryDate: true }
  });
  const records = foundRecords.filter(record => !status || runState(record) === status);

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
    on_hold:         byStatus['On-Hold']  ?? 0,
    pending:         byStatus['Pending']  ?? 0,
    completion_rate: total > 0 ? Math.round((accomplished / total) * 100) : 0,
    by_status:    Object.entries(byStatus).map(([s, count]) => ({ status: s, count })),
    by_category:  Object.entries(byCategory).map(([c, count]) => ({ category: c, count })),
    by_area:      Object.entries(byArea).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([a, count]) => ({ area: a, count })),
    by_driver:    Object.entries(byDriver).sort((a, b) => b[1] - a[1]).map(([d, count]) => ({ driver: d, count }))
  });
});

export default router;
