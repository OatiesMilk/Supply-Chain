import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { recordScope } from '../services/recordAccess';
import { prisma } from '../db';
import { requireResource, requireAuth } from '../middleware/auth';
import { manilaTodayRange, manilaWeekStart } from '../services/dateSemantics';

const router = Router();

router.get('/stats', requireAuth, requireResource('dashboard'), async (req, res) => {
  const { start, end, dateStr } = manilaTodayRange();
  const role = req.user!.role;
  const scoped = (where: Prisma.DeliveryRecordWhereInput): Prisma.DeliveryRecordWhereInput => ({ ...where, deletedAt: null, draft: false, AND: [recordScope(req.user!)] });
  const count = ({ where }: { where: Prisma.DeliveryRecordWhereInput }) => prisma.deliveryRecord.count({ where: scoped(where) });

  // ── SALES_COORDINATOR ────────────────────────────────────────────────────────
  if (role === 'SALES_COORDINATOR') {
    const [deliveriesToday, pendingDriverAssignment, onHold, rescheduled, accomplishedToday] = await Promise.all([
      count({ where: { deletedAt: null, category: 'DELIVERY', draft: false, deliveryDate: dateStr } }),
      count({ where: { deletedAt: null, category: 'DELIVERY', draft: false, driverId: null, status: { not: 'ACCOMPLISHED' } } }),
      count({ where: { deletedAt: null, category: 'DELIVERY', draft: false, status: 'ON_HOLD' } }),
      count({ where: { deletedAt: null, category: 'DELIVERY', draft: false, status: 'RESCHEDULED' } }),
      count({ where: { deletedAt: null, category: 'DELIVERY', draft: false, status: 'ACCOMPLISHED', timeOut: { gte: start.toISOString(), lt: end.toISOString() } } })
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
      count({
        where: { deletedAt: null, category: 'DELIVERY', draft: false, deliveryDate: dateStr, NOT: { driverId: null }, status: { not: 'ACCOMPLISHED' } }
      }),
      count({
        where: { deletedAt: null, category: 'DELIVERY', draft: false, driverId: null, status: { not: 'ACCOMPLISHED' } }
      }),
      count({
        where: { deletedAt: null, category: 'DELIVERY', draft: false, status: 'ACCOMPLISHED', timeOut: { gte: start.toISOString(), lt: end.toISOString() } }
      }),
      count({
        where: { deletedAt: null, category: 'DELIVERY', draft: false, status: { in: ['ON_HOLD', 'RESCHEDULED'] } }
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
      count({
        where: { deletedAt: null, category: 'RMA', status: { not: 'ACCOMPLISHED' } }
      }),
      count({
        where: { deletedAt: null, category: 'RMA', status: 'ON_HOLD' }
      }),
      count({
        where: { deletedAt: null, category: 'PROCUREMENT_PICKUP', status: { in: ['SCHEDULED', 'PENDING'] } }
      }),
      count({
        where: { deletedAt: null, category: 'ACCOUNTING_COLLECTION', status: 'ACCOMPLISHED', collectionVerified: false }
      }),
      count({
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
      count({ where: { deletedAt: null, createdAt: { gte: weekStart } } }),
      count({
        where: {
          deletedAt: null,
          category: 'ACCOUNTING_COLLECTION',
          status: 'ACCOMPLISHED',
          collectionVerified: false
        }
      }),
      prisma.auditLog.count({ where: { timestamp: { gte: start, lt: end }, recordType: { not: 'DeliveryRecord' } } }),
      prisma.deliveryRecord.groupBy({ by: ['status'], where: scoped({}), _count: { _all: true } }),
      prisma.auditLog.findMany({
        where: { recordType: { not: 'DeliveryRecord' } },
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
