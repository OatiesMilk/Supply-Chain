import { prisma } from '../db';
import { accountManagerMailUsers } from './accountDirectory';
import { saveDailyStatusSnapshot as writeDailyStatusSnapshot } from './dailyStatusSnapshot';
import { manilaToday } from './deliveryLifecycle';
import { notifyRole, notifyUser } from './inAppNotify';
import { sendEmail, type SendResult } from './mailer';
import { scopedSummaryVersion } from './notificationVisibility';
import { permissionMode } from './permissionManagement';
import { loadLegacySession } from './sessionPermissions';
import { canReadRecord } from './recordAccess';
import { dispatchMovementScope } from './rmaMovement';
import { runScopedSummaries } from './scopedSummaries';

const CATEGORY_LABEL: Record<string, string> = {
  DELIVERY: 'Delivery',
  RMA: 'RMA',
  ACCOUNTING_COLLECTION: 'Collection',
  PROCUREMENT_PICKUP: 'Procurement',
  SALES_ORDERS: 'Sales Order',
};

function mailLogStatus(result?: SendResult | null): 'SENT' | 'MOCKED' | 'FAILED' {
  if (!result?.ok) return 'FAILED';
  return result.method === 'mock' ? 'MOCKED' : 'SENT';
}

async function sendLoggedEmail(to: string, subject: string, text: string): Promise<'SENT' | 'MOCKED' | 'FAILED'> {
  try {
    return mailLogStatus(await sendEmail({ to, subject, text }));
  } catch {
    return 'FAILED';
  }
}

export function scheduleDaily(hour: number, minute: number, task: () => void) {
  const now = new Date();
  let next = new Date(`${manilaToday(now)}T00:00:00+08:00`);
  next = new Date(next.getTime() + (hour * 60 + minute) * 60 * 1000);
  if (next <= now) next = new Date(next.getTime() + 24 * 60 * 60 * 1000);
  setTimeout(() => {
    task();
    setInterval(task, 24 * 60 * 60 * 1000);
  }, next.getTime() - now.getTime());
}

export function scheduleWeekly(dayOfWeek: number, hour: number, minute: number, task: () => void) {
  const now = new Date();
  const todayStart = new Date(`${manilaToday(now)}T00:00:00+08:00`);
  const localDay = new Date(todayStart.getTime() + 8 * 60 * 60 * 1000).getUTCDay();
  const daysUntil = (dayOfWeek - localDay + 7) % 7;
  let next = new Date(todayStart.getTime() + (daysUntil * 24 * 60 + hour * 60 + minute) * 60 * 1000);
  if (next <= now) next = new Date(next.getTime() + 7 * 24 * 60 * 60 * 1000);
  setTimeout(() => {
    task();
    setInterval(task, 7 * 24 * 60 * 60 * 1000);
  }, next.getTime() - now.getTime());
}

export async function notify4PM(now = new Date()) {
  try {
    if (permissionMode() === 'V1') return await runScopedSummaries('4PM', now);
    // 4 PM logistics alert: unassigned scheduled records
    const unassigned = await prisma.deliveryRecord.findMany({
      where: { status: 'SCHEDULED', draft: false, driver: '', deletedAt: null, AND: [dispatchMovementScope] },
    });
    if (unassigned.length > 0) {
      await notifyRole(
        'LOGISTICS',
        `${unassigned.length} record${unassigned.length !== 1 ? 's' : ''} still need a driver`,
        `4 PM reminder: ${unassigned.length} scheduled delivery${unassigned.length !== 1 ? 'ies' : ''} have no driver assigned.`,
      );
    }

    // 4 PM account manager alert: their unfinished records
    const todayStart = new Date(`${manilaToday(now)}T00:00:00+08:00`);

    const openRecords = await prisma.deliveryRecord.findMany({
      where: { deletedAt: null, draft: false, status: { notIn: ['ACCOMPLISHED'] } },
      include: { company: true },
    });
    if (openRecords.length === 0) return;

    const byAM: Record<string, typeof openRecords> = {};
    for (const rec of openRecords) {
      if (!byAM[rec.accountManager]) byAM[rec.accountManager] = [];
      byAM[rec.accountManager].push(rec);
    }

    for (const [amName, recs] of Object.entries(byAM)) {
      const alreadySent = await prisma.notificationLog.findFirst({
        where: { triggerEvent: '4PM_AM_DAILY', recipientName: amName, sentAt: { gte: todayStart } },
      });
      if (alreadySent) continue;

      // Resolve AM recipients through the canonical directory rules so deactivated AMs,
      // inactive linked users, and ambiguous duplicate names are never selected.
      const resolvedUsers = await accountManagerMailUsers(amName);
      if (resolvedUsers.length === 0) continue;

      const loaded = await loadLegacySession(prisma, resolvedUsers[0].id);
      if (!loaded?.isActive) continue;
      const session = loaded.session;

      const scopedRecs = recs.filter(r => canReadRecord(session, r));
      if (scopedRecs.length === 0) continue;

      const preview = scopedRecs.slice(0, 3)
        .map(r => `${r.recordNo || r.reference} (${CATEGORY_LABEL[r.category] ?? r.category}) — ${r.company?.name ?? ''}`)
        .join('; ') + (scopedRecs.length > 3 ? ` +${scopedRecs.length - 3} more` : '');

      const title = `4 PM: ${scopedRecs.length} open record${scopedRecs.length !== 1 ? 's' : ''} assigned to you`;
      const message = `Still open as of 4 PM: ${preview}`;

      // Store summary notifications with ScopedSummary so notificationVisibility exposes them
      // without joining a user ID against DeliveryRecord.
      await notifyUser(session.id, title, message, scopedSummaryVersion(session), 'ScopedSummary');
      const mailStatus = await sendLoggedEmail(session.email, title, message);

      await prisma.notificationLog.create({
        data: {
          triggerEvent: '4PM_AM_DAILY',
          recipientRole: session.role,
          recipientName: amName,
          message: `${scopedRecs.length} open records`,
          status: mailStatus,
        },
      });
    }
  } catch (err) {
    console.error('[4PM notify]', err);
  }
}

export async function saveDailyStatusSnapshot() {
  try {
    await writeDailyStatusSnapshot();
    console.log(`[Daily Snapshot] Saved status counts for ${manilaToday()}`);
  } catch (err) {
    console.error('[Daily Snapshot]', err);
  }
}

export async function notify6PM() {
  try {
    if (permissionMode() === 'V1') { await runScopedSummaries('6PM'); await saveDailyStatusSnapshot(); return; }
    const stillOpen = await prisma.deliveryRecord.findMany({
      where: { status: { in: ['SCHEDULED', 'IN_TRANSIT'] }, draft: false, deletedAt: null },
    });
    if (stillOpen.length > 0) {
      await notifyRole(
        'LOGISTICS',
        `${stillOpen.length} delivery${stillOpen.length !== 1 ? 'ies' : ''} still open`,
        `End-of-day check: ${stillOpen.length} record${stillOpen.length !== 1 ? 's' : ''} remain Scheduled or In Transit and have not been delivered.`,
      );
      await notifyRole(
        'SALES_COORDINATOR',
        `${stillOpen.length} delivery${stillOpen.length !== 1 ? 'ies' : ''} not yet accomplished`,
        `6 PM: ${stillOpen.length} record${stillOpen.length !== 1 ? 's' : ''} are still Scheduled or In Transit.`,
      );
    }
  } catch (err) {
    console.error('[6PM notify]', err);
  }

  await saveDailyStatusSnapshot();
}

export async function notifyWeeklyReport(now = new Date()) {
  try {
    if (permissionMode() === 'V1') return await runScopedSummaries('WEEKLY', now);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dateTo = manilaToday(now);
    const dateFrom = manilaToday(weekAgo);

    const records = await prisma.deliveryRecord.findMany({
      where: { deletedAt: null, deliveryDate: { gte: dateFrom, lte: dateTo } },
      select: { status: true, category: true },
    });

    const total = records.length;
    const accomplished = records.filter(r => r.status === 'ACCOMPLISHED').length;
    const onHold = records.filter(r => r.status === 'ON_HOLD').length;
    const rate = total > 0 ? Math.round((accomplished / total) * 100) : 0;

    const weekLabel = `${dateFrom} to ${dateTo}`;
    const title = `Weekly Report — ${weekLabel}`;
    const message = `Week of ${weekLabel}: ${total} record${total !== 1 ? 's' : ''} total, ${accomplished} delivered (${rate}% completion rate), ${onHold} on hold.`;

    const targetUsers = await prisma.user.findMany({
      where: { role: { in: ['LOGISTICS', 'ADMIN'] }, isActive: true },
      select: { id: true, email: true, name: true, role: true },
    });

    if (targetUsers.length === 0) {
      await prisma.notificationLog.create({
        data: {
          triggerEvent: 'WEEKLY_REPORT',
          recipientRole: 'LOGISTICS|ADMIN',
          recipientName: '0 users',
          message: `${message}\nSkipped: no active Logistics or Admin recipients.`,
          status: 'SKIPPED',
        },
      });
      return;
    }

    for (const u of targetUsers) {
      await notifyUser(u.id, title, message);
      const status = await sendLoggedEmail(u.email, title, message);
      await prisma.notificationLog.create({
        data: {
          triggerEvent: 'WEEKLY_REPORT',
          recipientRole: u.role,
          recipientName: u.name,
          message,
          status,
        },
      });
    }

    console.log(`[Weekly Report] Processed ${weekLabel} for ${targetUsers.length} users`);
  } catch (err) {
    console.error('[Weekly Report]', err);
  }
}
