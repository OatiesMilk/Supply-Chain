import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { prisma } from '../db';
import { loadPermissionSession } from './sessionPermissions';
import { recordScope, readableCategories } from './recordAccess';
import { dispatchMovementScope } from './rmaMovement';
import { manilaToday } from './deliveryLifecycle';
import { sendEmail, sendMailReal } from './mailer';
import { summaryAccountManagerNames } from './accountDirectory';

/** Each recipient gets only their current scope. Version-tagged stored summaries
 * disappear on revocation; historical unclassified global summaries stay hidden. */
export async function notifyScopedSummary(user: AuthUser, title: string, message: string, email = false) {
  // Driver record membership changes on dispatch reassignment, independently of
  // account policy revisions. They receive only record-linked notifications.
  if (user.role === 'DRIVER') return;
  // A permission change during preparation must not bless old aggregate text.
  const fresh = await loadPermissionSession(prisma, user.id);
  if (!fresh?.isActive || fresh.session.permissionVersion !== user.permissionVersion) return;
  await prisma.notification.create({ data: { userId: user.id, title, message, recordType: 'ScopedSummary', recordId: user.permissionVersion } });
  if (email) await sendEmail({ to: fresh.session.email, subject: title, text: message });
}

export async function runScopedSummaries(kind: '4PM' | '6PM' | 'WEEKLY', now = new Date()) {
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  const amNames = kind === '4PM' ? await summaryAccountManagerNames(users) : new Map<string, string>();
  for (const candidate of users) {
    const loaded = await loadPermissionSession(prisma, candidate.id);
    if (!loaded?.isActive || !loaded.session.snapshot.valid) continue;
    const user = loaded.session as AuthUser;
    if (user.role === 'DRIVER') continue;
    if (!readableCategories(user).length) continue;
    if (kind === '4PM') {
      if (user.role === 'LOGISTICS') {
        const count = await prisma.deliveryRecord.count({ where: { deletedAt: null, draft: false, status: 'SCHEDULED', driver: '', AND: [recordScope(user), dispatchMovementScope] } });
        if (count) await notifyScopedSummary(user, `${count} records still need a driver`, `4 PM: ${count} visible scheduled records have no driver assigned.`);
      }
      const amName = amNames.get(candidate.id);
      if (!amName) continue;
      const where: Prisma.DeliveryRecordWhereInput = { deletedAt: null, draft: false, status: { not: 'ACCOMPLISHED' },
        accountManager: { equals: amName, mode: 'insensitive' }, AND: [recordScope(user)] };
      const count = await prisma.deliveryRecord.count({ where });
      if (!count) continue;
      const preview = await prisma.deliveryRecord.findMany({ where, take: 3, orderBy: { id: 'asc' }, select: { reference: true, rmaReference: true, category: true } });
      await notifyScopedSummary(user, `4 PM: ${count} open records assigned to you`,
        `${count} visible open records: ${preview.map(record => `${record.rmaReference || record.reference} (${record.category})`).join('; ')}${count > 3 ? ' …' : ''}`, true);
    } else if (kind === '6PM') {
      if (!['LOGISTICS', 'SALES_COORDINATOR'].includes(user.role)) continue;
      const count = await prisma.deliveryRecord.count({ where: { deletedAt: null, draft: false, status: { in: ['SCHEDULED', 'IN_TRANSIT'] }, AND: [recordScope(user), dispatchMovementScope] } });
      if (count) await notifyScopedSummary(user, `${count} records still open`, `End of day: ${count} visible operational records remain Scheduled or In Transit.`);
    } else {
      if (!['LOGISTICS', 'ADMIN'].includes(user.role)) continue;
      const dateTo = manilaToday(now), dateFrom = manilaToday(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      const groups = await prisma.deliveryRecord.groupBy({ by: ['status'], where: { deletedAt: null, deliveryDate: { gte: dateFrom, lte: dateTo }, AND: [recordScope(user)] }, _count: { _all: true } });
      const total = groups.reduce((sum, group) => sum + group._count._all, 0);
      const completed = groups.find(group => group.status === 'ACCOMPLISHED')?._count._all ?? 0;
      const onHold = groups.find(group => group.status === 'ON_HOLD')?._count._all ?? 0;
      const title = `Weekly Report — ${dateFrom} to ${dateTo}`;
      const message = `${total} visible records, ${completed} delivered, ${onHold} on hold.`;
      await notifyScopedSummary(user, title, message);
      const fresh = await loadPermissionSession(prisma, user.id);
      if (fresh?.isActive && fresh.session.permissionVersion === user.permissionVersion) await sendMailReal({ to: fresh.session.email, subject: title, text: message });
    }
  }
}
