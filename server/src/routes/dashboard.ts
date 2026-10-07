import { Router } from 'express';
import { prisma } from '../db';
import { requireResource, requireAuth } from '../middleware/auth';
import { manilaToday } from '../services/deliveryLifecycle';

const router = Router();

function todayRangeManila() {
  const dateStr = manilaToday();
  const start = new Date(`${dateStr}T00:00:00+08:00`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000), dateStr };
}

router.get('/stats', requireAuth, requireResource('dashboard'), async (req, res) => {
  const { start, end, dateStr } = todayRangeManila();
  const role = req.user!.role;

  // ── SALES_COORDINATOR ────────────────────────────────────────────────────────
  if (role === 'SALES_COORDINATOR') {
    const [deliveriesToday, pendingDriverAssignment, onHold, rescheduled, accomplishedToday] = await Promise.all([
      prisma.deliveryRecord.count({ where: { deletedAt: null, draft: false, deliveryDate: dateStr, status: 'SCHEDULED' } }),
      prisma.deliveryRecord.count({ where: { deletedAt: null, draft: false, driver: '', status: { not: 'ACCOMPLISHED' } } }),
      prisma.deliveryRecord.count({ where: { deletedAt: null, status: 'ON_HOLD' } }),
      prisma.deliveryRecord.count({ where: { deletedAt: null, status: 'RESCHEDULED' } }),
      prisma.deliveryRecord.count({ where: { deletedAt: null, status: 'ACCOMPLISHED', updatedAt: { gte: start, lt: end } } })
    ]);
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
      prisma.deliveryRecord.count({
        where: { deletedAt: null, draft: false, deliveryDate: dateStr, NOT: { driver: '' }, status: { not: 'ACCOMPLISHED' } }
      }),
      prisma.deliveryRecord.count({
        where: { deletedAt: null, draft: false, driver: '', status: { not: 'ACCOMPLISHED' } }
      }),
      prisma.deliveryRecord.count({
        where: { deletedAt: null, status: 'ACCOMPLISHED', updatedAt: { gte: start, lt: end } }
      }),
      prisma.deliveryRecord.count({
        where: { deletedAt: null, status: { in: ['ON_HOLD', 'RESCHEDULED'] } }
      })
    ]);
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
      prisma.deliveryRecord.count({
        where: { deletedAt: null, category: 'RMA', status: { in: ['SCHEDULED', 'PENDING'] } }
      }),
      prisma.deliveryRecord.count({
        where: { deletedAt: null, category: 'RMA', status: 'ON_HOLD' }
      }),
      prisma.deliveryRecord.count({
        where: { deletedAt: null, category: 'PROCUREMENT_PICKUP', status: { in: ['SCHEDULED', 'PENDING'] } }
      }),
      prisma.deliveryRecord.count({
        where: { deletedAt: null, category: 'ACCOUNTING_COLLECTION', status: 'ACCOMPLISHED', collectionVerified: false }
      }),
      prisma.deliveryRecord.count({
        where: {
          deletedAt: null,
          category: 'ACCOUNTING_COLLECTION',
          collectionVerified: true,
          collectionVerifiedAt: { gte: start, lt: end }
        }
      })
    ]);

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
    const localDay = new Date(start.getTime() + 8 * 60 * 60 * 1000).getUTCDay();
    const weekStart = new Date(start.getTime() - localDay * 24 * 60 * 60 * 1000);

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
      prisma.deliveryRecord.count({ where: { deletedAt: null, createdAt: { gte: weekStart } } }),
      prisma.deliveryRecord.count({
        where: {
          deletedAt: null,
          category: 'ACCOUNTING_COLLECTION',
          status: 'ACCOMPLISHED',
          collectionVerified: false
        }
      }),
      prisma.auditLog.count({ where: { timestamp: { gte: start, lt: end } } }),
      prisma.deliveryRecord.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
      prisma.auditLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 10,
        include: { changedBy: true }
      })
    ]);

    const userBreakdown: Record<string, number> = {};
    for (const g of usersByRole) {
      userBreakdown[g.role] = g._count._all;
    }

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
        record_type: e.recordType,
        timestamp: e.timestamp
      }))
    });
  }

  return res.json({ role });
});

export default router;
