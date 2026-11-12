import type { AuthUser } from '../middleware/auth';
import { prisma } from '../db';
import { canCreateCategory, canPerformRecordAction, canReadRecord, canWriteCategory } from './recordAccess';
import { loadPermissionSession } from './sessionPermissions';
import { permissionMode } from './permissionManagement';
import { sessionUser } from './permissions';
import { accountManagerMailUsers } from './accountDirectory';

export const MAIL_TRIGGERS = ['Accomplished', 'Rescheduled', 'On-Hold', 'RMA Completed', 'Collection Verified', 'Record Created'] as const;
export function mailInputError(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Email request must be an object';
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key => !['recordId', 'trigger', 'recipients'].includes(key))
    || typeof body.recordId !== 'string' || !body.recordId.trim() || body.recordId.length > 256
    || typeof body.trigger !== 'string' || !(MAIL_TRIGGERS as readonly string[]).includes(body.trigger)
    || !Array.isArray(body.recipients) || !body.recipients.length || body.recipients.length > 3
    || body.recipients.some(value => typeof value !== 'string' || !['AM', 'LOGISTICS', 'TASS'].includes(value))
    || new Set(body.recipients).size !== body.recipients.length) return 'Use a known trigger, recordId and unique AM, LOGISTICS or TASS recipients';
  return null;
}
export function canDispatchRecordMail(user: AuthUser, record: any, trigger: string): boolean {
  if (!canReadRecord(user, record) || !canWriteCategory(user, record.category)) return false;
  const operation = trigger === 'Record Created' ? 'CREATE' : trigger === 'Collection Verified' ? 'VERIFY_COLLECTION'
    : ['Accomplished', 'RMA Completed'].includes(trigger) ? 'COMPLETE' : 'STATUS';
  if (trigger === 'Accomplished' && (record.category === 'RMA' || record.status !== 'ACCOMPLISHED')) return false;
  if (trigger === 'RMA Completed' && (record.category !== 'RMA' || record.status !== 'ACCOMPLISHED')) return false;
  if (trigger === 'Collection Verified' && (record.category !== 'ACCOUNTING_COLLECTION' || record.status !== 'ACCOMPLISHED' || record.draft || !record.collectionVerified || user.role !== 'TASS')) return false;
  if (trigger === 'Rescheduled' && record.status !== 'RESCHEDULED' || trigger === 'On-Hold' && record.status !== 'ON_HOLD') return false;
  if (user.activeMode !== 'V1') return true;
  return operation === 'CREATE' ? canCreateCategory(user, record.category) : canPerformRecordAction(user, record, operation, undefined, true);
}

/** Exact identity resolution only (linked login or exact unique name); a surname match cannot authorize disclosure. */
export async function recordMailRecipients(recipients: readonly string[], record: any) {
  const candidates = new Map<string, { id: string; name: string; email: string }>();
  for (const recipient of recipients) {
    const users = recipient === 'AM' ? await accountManagerMailUsers(record.accountManager)
      : await prisma.user.findMany({ where: { role: recipient, isActive: true }, select: { id: true, name: true, email: true } });
    for (const user of users) candidates.set(user.id, user);
  }
  const allowed = [] as Array<{ id: string; name: string; email: string }>;
  const emails = new Set<string>();
  for (const user of candidates.values()) {
    if (!await recipientCanReadRecord(user.id, record)) continue;
    const email = user.email.trim().toLowerCase();
    if (!emails.has(email)) { allowed.push(user); emails.add(email); }
  }
  return allowed;
}

/** Mail disclosures follow the recipient's current account permissions in either mode. */
async function recipientCanReadRecord(id: string, record: any): Promise<boolean> {
  if (permissionMode() === 'V1') {
    const loaded = await loadPermissionSession(prisma, id);
    return !!loaded?.isActive && canReadRecord(loaded.session as AuthUser, record);
  }
  const user = await prisma.user.findUnique({ where: { id }, include: { permissions: true, driverProfile: true } });
  if (!user?.isActive) return false;
  const session = { ...sessionUser(user), driverProfileId: user.driverProfile?.type === 'DRIVER' && user.driverProfile.isActive ? user.driverProfile.id : null } as AuthUser;
  return canReadRecord(session, record);
}

/** Deployment-owned mapping, never a request-supplied address or inferred display label.
 * The mapped mailbox must belong to one active portal account allowed to read the collection. */
export async function billingMailRecipients(record: any) {
  const email = process.env.BILLING_NOTIFICATION_USER_EMAIL?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return [];
  const users = await prisma.user.findMany({ where: { email: { equals: email, mode: 'insensitive' }, isActive: true },
    select: { id: true, name: true, email: true } });
  if (users.length !== 1 || !await recipientCanReadRecord(users[0].id, record)) return [];
  return users;
}
