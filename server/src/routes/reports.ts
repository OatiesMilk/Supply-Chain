import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireScreen } from '../middleware/auth';
import { CATEGORY_TO_DB, CATEGORY_FROM_DB, STATUS_FROM_DB } from '../mappings';
import { runState } from '../services/deliveryLifecycle';

const router = Router();

// GET /reports/daily-status-history?from=YYYY-MM-DD&to=YYYY-MM-DD&status=&category=
// Reads from the DailyStatusSnapshot rollup table (written once daily by the
// 6 PM EOD job) instead of recomputing counts live from DeliveryRecord.
router.get('/daily-status-history', requireAuth, requireScreen('status_history'), async (req, res) => {
  const { from, to, status, category } = req.query as { from?: string; to?: string; status?: string; category?: string };

  if (!from || !to) {
    return res.status(400).json({ error: 'from and to date parameters are required' });
  }

  const where: any = { date: { gte: from, lte: to } };

  // Default to the combined 'ALL' total unless a specific category is requested —
  // never mix per-category and combined rows in the same result set.
  if (category) {
    where.category = CATEGORY_TO_DB[category] ?? category;
  } else {
    where.category = 'ALL';
  }

  const snapshots = await prisma.dailyStatusSnapshot.findMany({
    where,
    orderBy: [{ date: 'asc' }, { status: 'asc' }]
  });

  const snapshotDates = new Set(snapshots.map(s => s.date));

  // Query live records for any dates within range not covered by pre-computed snapshots
  const dbCategory = category ? (CATEGORY_TO_DB[category] ?? category) : undefined;

  const liveRecords = await prisma.deliveryRecord.findMany({
    where: {
      deletedAt: null,
      deliveryDate: { gte: from, lte: to },
      ...(dbCategory ? { category: dbCategory } : {}),
    },
    select: { category: true, status: true, draft: true, timeIn: true, deliveryDate: true }
  });

  // Group live records by date + category + status for dates not in snapshots
  const grouped: Record<string, number> = {};
  for (const r of liveRecords) {
    const date = r.deliveryDate ?? '';
    if (snapshotDates.has(date)) continue;
    const currentStatus = runState(r);
    if (status && currentStatus !== status) continue;
    const cat  = dbCategory ? r.category : 'ALL';
    const key  = `${date}::${cat}::${currentStatus}`;
    grouped[key] = (grouped[key] ?? 0) + 1;
  }

  const combinedRows = [
    ...snapshots.filter(s => !status || (STATUS_FROM_DB[s.status] ?? s.status) === status).map(s => ({
      date:     s.date,
      category: CATEGORY_FROM_DB[s.category] ?? s.category,
      status:   STATUS_FROM_DB[s.status] ?? s.status,
      count:    s.count,
    })),
    ...Object.entries(grouped).map(([key, count]) => {
      const [date, cat, st] = key.split('::');
      return {
        date,
        category: CATEGORY_FROM_DB[cat] ?? cat,
        status:   STATUS_FROM_DB[st]    ?? st,
        count,
      };
    }),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.status.localeCompare(b.status));

  res.json({
    source: snapshots.length > 0 ? (Object.keys(grouped).length > 0 ? 'hybrid' : 'snapshot') : 'live',
    rows: combinedRows,
  });
});

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
