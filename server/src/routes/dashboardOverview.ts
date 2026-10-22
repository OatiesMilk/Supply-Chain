import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { asyncRoute } from '../middleware/asyncRoute';
import { CATEGORY_SCREEN, readableCategories, recordScope } from '../services/recordAccess';
import { manilaTodayRange, manilaStartOfDay } from '../services/dateSemantics';
import { isValidDateOnly, runState } from '../services/deliveryLifecycle';
import { ageBucket, calendarAge, metricMatches, mondayRange, OPEN_STATUSES, overdue, ROLE_CARDS, selectionMatches, shiftDay, validateSelection, type RecordSelection } from '../services/dashboardMetrics';

const router = Router();
router.use(requireAuth, (req, res, next) => {
  const screen = req.user!.role === 'DRIVER' ? 'driver_dashboard' : 'dashboard';
  if (!req.user!.effectiveScreens.includes(screen)) return res.status(403).json({ error: 'Dashboard access denied' });
  next();
});
router.get('/users', asyncRoute(async (req, res) => {
  if (req.user!.role !== 'ADMIN') return res.status(403).json({ error: 'Admin required' });
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return res.status(400).json({ error: 'Invalid page' });
  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true, role: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * 25, take: 25 }),
  ]);
  return res.json({ total, users, pageSize: 25 });
}));
// Narrow projection: no attachments, private audit snapshots or line items.
// Aggregate all permitted rows on the server, never a paginated client subset.
const select = {
  id: true, category: true, status: true, draft: true, deliveryDate: true,
  driverId: true, driver: true, timeIn: true, timeOut: true, reference: true,
  collectionVerified: true, collectionVerifiedAt: true, createdAt: true,
  company: { select: { name: true } },
  assignedDriver: { select: { name: true, userId: true } },
} as const;

router.get(['/overview', '/records'], asyncRoute(async (req, res) => {
  let selection: RecordSelection;
  try { selection = validateSelection(req.query); }
  catch (error) { return res.status(400).json({ error: (error as Error).message }); }
  const page = req.query.page === undefined ? 1 : Number(req.query.page);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return res.status(400).json({ error: 'Invalid page' });
  const user = req.user!;
  const now = new Date();
  const { dateStr: today, start, end } = manilaTodayRange(now);
  const rows = await prisma.deliveryRecord.findMany({
    where: { deletedAt: null, draft: false, AND: [recordScope(user)] },
    select, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  const publicRow = (r: typeof rows[number]) => ({
    id: r.id, reference: r.reference || r.id, company: r.company.name,
    driver: r.driverId ? (r.assignedDriver?.name || r.driver || 'Assigned profile') : r.driver ? `${r.driver} (unresolved assignment)` : 'Unassigned',
    assignment: !r.driverId ? 'unresolved' : r.assignedDriver?.userId ? 'linked' : 'no-login',
    category: r.category, status: runState(r), scheduledDate: r.deliveryDate,
    screen: user.effectiveScreens.includes(CATEGORY_SCREEN[r.category]) ? CATEGORY_SCREEN[r.category] : null,
  });
  if (req.path === '/records') {
    const matching = rows.filter(r => selectionMatches(r, selection, today));
    return res.json({ total: matching.length, page, pageSize: 25, records: matching.slice((page - 1) * 25, page * 25).map(publicRow), updatedAt: now.toISOString() });
  }
  const cards = (ROLE_CARDS[user.role] || []).map(card => ({ ...card, count: rows.filter(r => metricMatches(r, card.metric, today)).length }));
  const chartScope = user.role === 'SALES_COORDINATOR' ? { module: 'DELIVERY' } : selection;
  const chartRows = rows.filter(r => selectionMatches(r, { ...chartScope, metric: 'open' }, today));
  const status = OPEN_STATUSES.map(status => {
    const matches = chartRows.filter(r => runState(r) === status);
    return { status, total: matches.length, overdue: matches.filter(r => overdue(r, today)).length };
  });
  // Report invalid dates independent of the chosen date range so exclusions are visible.
  const missingDates = rows.filter(r => selectionMatches(r, { metric: 'open', module: chartScope.module, missing: true }, today)).length;
  const week = mondayRange(today);
  const daily = Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(week.from, i);
    return { day, due: rows.filter(r => metricMatches(r, 'due', day)).length, completed: rows.filter(r => metricMatches(r, 'completed', day)).length };
  });
  const ages = ['0–1', '2–3', '4–7', '8+', 'Unknown'].map(age => ({ age, count: rows.filter(r => metricMatches(r, 'verification', today) && ageBucket(r, today) === age).length }));
  const attention = user.role === 'ADMIN' ? rows.flatMap(r => {
    const reasons = ['overdue', 'unassigned-today', 'verification'].filter(metric => metricMatches(r, metric, today));
    if (!reasons.length) return [];
    const age = reasons.includes('overdue') && isValidDateOnly(r.deliveryDate)
      ? Math.round((Date.parse(today) - Date.parse(r.deliveryDate)) / 86400000)
      : calendarAge(reasons.includes('verification') ? r.timeOut : r.createdAt, today);
    return [{ ...publicRow(r), reasons, waitingDays: age, ageBasis: reasons.includes('overdue') ? 'scheduled date' : reasons.includes('verification') ? 'completion' : 'creation' }];
  }) : [];
  let administration = null;
  if (user.role === 'ADMIN') {
    const [activeUsers, auditEventsToday, recentAudit] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      // Record audit summaries obey the same category scope. Non-record administrative events stay Admin-only.
      prisma.auditLog.count({ where: { timestamp: { gte: start, lt: end }, OR: [{ recordType: { not: 'DeliveryRecord' } }, { recordId: { in: rows.map(r => r.id) } }] } }),
      prisma.auditLog.findMany({ where: { recordType: 'DeliveryRecord', recordId: { in: rows.map(r => r.id) } }, orderBy: { timestamp: 'desc' }, take: 10, select: { id: true, recordId: true, action: true, timestamp: true, changedBy: { select: { name: true } } } }),
    ]);
    const byId = new Map(rows.map(r => [r.id, r]));
    administration = {
      activeUsers, auditEventsToday,
      recordsThisWeek: rows.filter(r => r.createdAt >= manilaStartOfDay(week.from) && r.createdAt < manilaStartOfDay(shiftDay(week.to, 1))).length,
      recentAudit: recentAudit.map(a => ({ id: a.id, action: a.action, reference: byId.get(a.recordId)?.reference || 'Record', actor: a.changedBy.name, timestamp: a.timestamp })),
    };
  }
  return res.json({ role: user.role, today, updatedAt: now.toISOString(), cards, status, missingDates, daily, ages, attention, administration, modules: readableCategories(user) });
}));
export default router;
