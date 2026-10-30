import type { AuthUser } from '../middleware/auth';
import { prisma } from '../db';
import { canCreateCategory, canPerformRecordAction, canReadRecord, canWriteCategory } from './recordAccess';
import { loadPermissionSession } from './sessionPermissions';
import { permissionMode } from './permissionManagement';

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
  if (user.activeMode !== 'V1') return true;
  const operation = trigger === 'Record Created' ? 'CREATE' : trigger === 'Collection Verified' ? 'VERIFY_COLLECTION'
    : ['Accomplished', 'RMA Completed'].includes(trigger) ? 'COMPLETE' : 'STATUS';
  if (trigger === 'Accomplished' && (record.category === 'RMA' || record.status !== 'ACCOMPLISHED')) return false;
  if (trigger === 'RMA Completed' && (record.category !== 'RMA' || record.status !== 'ACCOMPLISHED')) return false;
  if (trigger === 'Collection Verified' && (record.category !== 'ACCOUNTING_COLLECTION' || !record.collectionVerified || user.role !== 'TASS')) return false;
  if (trigger === 'Rescheduled' && record.status !== 'RESCHEDULED' || trigger === 'On-Hold' && record.status !== 'ON_HOLD') return false;
  return operation === 'CREATE' ? canCreateCategory(user, record.category) : canPerformRecordAction(user, record, operation, undefined, true);
}

/** Exact identity resolution only; a surname match cannot authorize disclosure. */
export async function recordMailRecipients(recipients: readonly string[], record: any) {
  const candidates = new Map<string, { id: string; name: string; email: string }>();
  for (const recipient of recipients) {
    const users = await prisma.user.findMany({ where: recipient === 'AM'
      ? { name: { equals: record.accountManager ?? '', mode: 'insensitive' }, isActive: true }
      : { role: recipient, isActive: true }, select: { id: true, name: true, email: true } });
    if (recipient === 'AM' && users.length !== 1) continue;
    for (const user of users) candidates.set(user.id, user);
  }
  const allowed = [] as Array<{ id: string; name: string; email: string }>;
  const emails = new Set<string>();
  for (const user of candidates.values()) {
    if (permissionMode() === 'V1') {
      const session = await loadPermissionSession(prisma, user.id);
      if (!session?.isActive || !canReadRecord(session.session as AuthUser, record)) continue;
    }
    const email = user.email.trim().toLowerCase();
    if (!emails.has(email)) { allowed.push(user); emails.add(email); }
  }
  return allowed;
}
