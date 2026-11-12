import { Router } from 'express';
import { prisma } from '../db';
import { requireResource, requireAuth } from '../middleware/auth';
import { recordScope } from '../services/recordAccess';
import { manilaTodayRange, manilaWeekStart } from '../services/dateSemantics';
import { visibleAuditEntries, visibleAuditCount } from '../services/auditVisibility';

import { asyncRoute } from '../middleware/asyncRoute';
import { dashboardOverview } from '../services/dashboardOverview';
import { dashboardRecordFilter } from '../services/dashboardFilters';
import { recordNumbersForAudit } from '../services/recordIds';

const router = Router();

router.get('/overview', requireAuth, requireResource('dashboard'), asyncRoute(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await dashboardOverview(prisma, req.user!));
}));

router.get('/stats', requireAuth, requireResource('dashboard'), async (req, res) => {
  const { start, end, dateStr } = manilaTodayRange();
  const role = req.user!.role;
  const scope = recordScope(req.user!);

  // Every tile counts through the same filter its drill-down list uses.
  const count = (id: string) => prisma.deliveryRecord.count({ where: { AND: [scope], deletedAt: null, ...dashboardRecordFilter(id, dateStr)! } });

  // ── SALES_COORDINATOR ────────────────────────────────────────────────────────
  if (role === 'SALES_COORDINATOR') {
    const [deliveriesToday, pendingDriverAssignment, onHold, rescheduled, accomplishedToday] = await Promise.all([
      'sc-scheduled-today', 'sc-pending-assignment', 'sc-on-hold', 'sc-rescheduled', 'sc-completed-today',
    ].map(count));
    return res.json({
      role: 'SALES_COORDINATOR',
      deliveries_scheduled_today: deliveriesToday,
      pending_driver_assignment: pendingDriverAssignment,
      on_hold: onHold,
      rescheduled: rescheduled,
      accomplished_today: accomplishedToday
    });
  }

  // ── LOGISTICS ─────────────────────────────────────────────────────────────────
  if (role === 'LOGISTICS') {
    const [assignedToday, unassignedCount, completedToday, onHoldRescheduled] = await Promise.all([
      // No driver assigned counts every driver job type, the same set as the Transport requests panel.
      'log-assigned-today', 'log-transport-requests', 'log-completed-today', 'log-on-hold-rescheduled',
    ].map(count));
    return res.json({
      role: 'LOGISTICS',
      assigned_today: assignedToday,
      unassigned_count: unassignedCount,
      completed_today: completedToday,
      on_hold_rescheduled: onHoldRescheduled
    });
  }

  // ── TASS ─────────────────────────────────────────────────────────────────────
  if (role === 'TASS') {
    const [openRma, rmaOnHold, pendingProcurementPickup, pendingVerification, verifiedToday] = await Promise.all([
      'tass-open-rma', 'tass-rma-on-hold', 'tass-pending-pickups', 'tass-pending-verification', 'tass-verified-today',
    ].map(count));

    return res.json({
      role: 'TASS',
      open_rma: openRma,
      rma_on_hold: rmaOnHold,
      pending_procurement_pickup: pendingProcurementPickup,
      pending_verification: pendingVerification,
      verified_today: verifiedToday
    });
  }

  // ── ADMIN ─────────────────────────────────────────────────────────────────────
  if (role === 'ADMIN') {
    const weekStart = manilaWeekStart(dateStr);

    const [
      activeUsers,
      usersByRole,
      recordsThisWeek,
      unverifiedCollections,
      auditEventsToday,
      recordsByStatus,
      recentAudit
    ] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.groupBy({ by: ['role'], where: { isActive: true }, _count: { _all: true } }),
      prisma.deliveryRecord.count({ where: { AND: [scope], deletedAt: null, createdAt: { gte: weekStart } } }),
      count('admin-unverified-collections'),
      req.user!.activeMode === 'V1' ? visibleAuditCount(prisma, req.user!, { timestamp: { gte: start, lt: end } }) : prisma.auditLog.count({ where: { timestamp: { gte: start, lt: end } } }),
      prisma.deliveryRecord.groupBy({ by: ['status'], where: { AND: [scope], deletedAt: null }, _count: { _all: true } }),
      req.user!.activeMode === 'V1' ? visibleAuditEntries(prisma, req.user!, 10) : prisma.auditLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 10,
        include: { changedBy: true }
      })
    ]);

    const userBreakdown: Record<string, number> = {};
    for (const g of usersByRole) {
      userBreakdown[g.role] = g._count._all;
    }

    const recordNumbers = await recordNumbersForAudit(prisma, recentAudit);
    return res.json({
      role: 'ADMIN',
      total_active_users: activeUsers,
      user_breakdown: userBreakdown,
      records_this_week: recordsThisWeek,
      unverified_collections: unverifiedCollections,
      audit_events_today: auditEventsToday,
      records_by_status: recordsByStatus.map((r: any) => ({ status: r.status, count: r._count._all })),
      recent_audit: recentAudit.map((e: any) => ({
        id: e.id,
        action: e.action,
        changed_by: e.changedBy.name,
        record_id: e.recordId,
        record_no: recordNumbers.get(e.recordId) ?? null,
        record_type: e.recordType,
        timestamp: e.timestamp
      }))
    });
  }

  return res.json({ role });
});

export default router;
