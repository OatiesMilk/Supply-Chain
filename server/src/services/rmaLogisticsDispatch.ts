import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient, type RmaLogisticsDispatch } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { sessionUser } from './permissions';
import { evaluatePermissions } from './permissionEvaluator';
import { permissionMode } from './permissionManagement';
import { permissionSession } from './sessionPermissions';
import { canReadRecord, canWriteCategory, readableCategories, recordScope } from './recordAccess';
import { isValidDateOnly } from './deliveryLifecycle';
import { canonicalRmaCategory } from './rmaRules';
import { sendEmail, type MailAttachment, type SendResult } from './mailer';

/**
 * TASS -> Logistics daily printing handoff (Feature 5b, Section 4C).
 *
 * Phase 1 (transaction): lock actor + recipient rows in sorted order, re-verify
 * every authorization fact, reserve the unique idempotency key and create the
 * in-app notification. Phase 2 (no transaction): send the email. Phase 3
 * (transaction): persist the truthful email outcome, NotificationLog and AuditLog.
 * No database lock is ever held across SMTP/Graph network I/O.
 */
export class DispatchError extends Error {
  /** `details` are safe, structured fields merged into the JSON error response. */
  constructor(public status: number, message: string, public details?: Record<string, unknown>) {
    super(message);
    this.name = 'DispatchError';
  }
}

type Db = PrismaClient | Prisma.TransactionClient;
export type EmailStatus = 'SENT' | 'MOCKED' | 'SKIPPED' | 'FAILED';

export const MAX_DISPATCH_RECORDS = 100;
export const MAX_DISPATCH_NOTE = 1000;
const ID_PATTERN = /^[\w-]{1,64}$/;
const IDEMPOTENCY_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const EMAIL_PATTERN = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[A-Za-z]{2,}$/;
export const IN_PROGRESS_ERROR = 'Dispatch in progress';
/** Same-key retry while the original request may still be sending (or crashed before saving). */
export const IN_PROGRESS_RETRY_MESSAGE =
  'This dispatch is still in progress or its final email outcome has not yet been confirmed. Check recent dispatches or verify with the recipient before starting a new dispatch; retrying will not resend.';
export const UNCONFIRMED_PERSISTENCE_ERROR =
  'Mail attempt finished, but the final dispatch status could not be saved to the database. Verify delivery with the recipient or download the backup files; retrying will not resend.';
export const NO_EMAIL_ERROR = 'Recipient account has no deliverable email address.';
const DISPATCH_FIELDS = ['recipient_user_id', 'dispatch_date', 'record_ids', 'note', 'idempotency_key'];

export const MOVEMENT_LABELS: Record<string, string> = {
  LOGISTICS_TRANSPORT: 'Logistics Route', SUPPLIER_COLLECTION: 'Supplier Collection', INTERNAL_NO_DRIVER: 'Internal Printing',
};
const movementRank = (movement: string | null | undefined) => movement === 'LOGISTICS_TRANSPORT' ? 0 : movement === 'SUPPLIER_COLLECTION' ? 1 : 2;
const movementLabel = (movement: string | null | undefined) => MOVEMENT_LABELS[movement ?? ''] ?? 'Internal Printing';

export function deliverableEmail(email: string | null | undefined): email is string {
  return typeof email === 'string' && email.length <= 254 && EMAIL_PATTERN.test(email.trim());
}

/** YYYY-MM-DD -> MMDDYY (e.g. 2026-11-19 -> 111926). */
export function dispatchDateStamp(date: string): string {
  const [year, month, day] = date.split('-');
  return `${month}${day}${year.slice(2)}`;
}
export const dispatchFileNames = (date: string) => ({
  routeSlipFileName: `DRR${dispatchDateStamp(date)}.xlsx`,
  clientSlipsFileName: `Tass_Route_${dispatchDateStamp(date)}.pdf`,
});
const slipDate = (date: string | null | undefined) => {
  if (!date || !isValidDateOnly(date)) return '';
  const [year, month, day] = date.split('-');
  return `${month}/${day}/${year}`;
};
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
const truncate = (value: string | undefined | null, max: number) => {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

// ─── Sessions for arbitrary accounts (actor re-verification, recipients) ────

const sessionInclude = {
  permissions: { select: { screen: true, granted: true } },
  permissionOverrides: { select: { userId: true, permissionKey: true, effect: true } },
  permissionConversion: { select: { catalogVersion: true } },
  driverProfile: { select: { id: true, type: true, isActive: true } },
} satisfies Prisma.UserInclude;
type SessionAccount = Prisma.UserGetPayload<{ include: typeof sessionInclude }>;
type RolePolicyRow = Prisma.RolePolicyGetPayload<{ include: { permissions: true } }>;

/** Same session the authentication middleware would build for this account in the active mode. */
export function accountSession(user: SessionAccount, rolePolicy: RolePolicyRow | null): AuthUser | null {
  if (permissionMode() === 'V1') {
    const snapshot = evaluatePermissions({ userId: user.id, role: user.role, isActive: user.isActive,
      authorizationRevision: user.authorizationRevision, driverProfile: user.driverProfile,
      rolePolicy: user.permissionConversion?.catalogVersion === 1 ? rolePolicy : null, overrides: user.permissionOverrides });
    if (!snapshot.valid) return null;
    const session = permissionSession(user, snapshot) as AuthUser;
    Object.defineProperty(session, 'rmaPermissions', { value: snapshot, writable: true, enumerable: false });
    return session;
  }
  const session = sessionUser(user) as AuthUser;
  if (user.role === 'DRIVER') session.driverProfileId = user.driverProfile?.type === 'DRIVER' && user.driverProfile.isActive !== false ? user.driverProfile.id : null;
  Object.defineProperty(session, 'rmaPermissions', { value: evaluatePermissions({ userId: user.id, role: user.role, isActive: user.isActive,
    authorizationRevision: user.authorizationRevision, overrides: user.permissionOverrides, driverProfile: user.driverProfile, rolePolicy,
  }), writable: true, enumerable: false });
  return session;
}

/** A generic submitted RMA: the read check every Logistics recipient must pass. */
const GENERIC_RMA = { category: 'RMA', draft: false, driverId: null, rmaMovement: 'LOGISTICS_TRANSPORT' } as const;
export const canReadRma = (session: AuthUser | null, record: Parameters<typeof canReadRecord>[1] = GENERIC_RMA) =>
  !!session && readableCategories(session).includes('RMA') && canReadRecord(session, record);
/** TASS with current RMA read and write: the only role that hands slips to Logistics. */
export const canDispatchToLogistics = (session: AuthUser | null | undefined) =>
  !!session && session.role === 'TASS' && canReadRma(session) && canWriteCategory(session, 'RMA');

async function loadAccount(db: Db, id: string) {
  const user = await db.user.findUnique({ where: { id }, include: sessionInclude });
  if (!user) return null;
  const rolePolicy = await db.rolePolicy.findUnique({ where: { role: user.role }, include: { permissions: true } });
  return { user, session: user.isActive ? accountSession(user, rolePolicy) : null };
}

// ─── Recipients & history ────────────────────────────────────────────────────

export interface LogisticsRecipient { id: string; name: string; email: string }

/** Active LOGISTICS accounts with a deliverable email and current RMA read access. */
export async function listActiveLogisticsRecipients(db: Db): Promise<LogisticsRecipient[]> {
  const users = await db.user.findMany({ where: { role: 'LOGISTICS', isActive: true }, include: sessionInclude, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  const rolePolicy = await db.rolePolicy.findUnique({ where: { role: 'LOGISTICS' }, include: { permissions: true } });
  return users
    .filter(user => deliverableEmail(user.email) && canReadRma(accountSession(user, rolePolicy)))
    .map(user => ({ id: user.id, name: user.name, email: user.email.trim() }));
}

type DispatchRow = RmaLogisticsDispatch & { dispatchedBy?: { name: string } | null; recipientUser?: { name: string } | null };

/** A reservation whose Phase 3 never committed: the provider may or may not have accepted the email. */
export const isUnconfirmedDispatch = (row: Pick<RmaLogisticsDispatch, 'emailStatus' | 'emailError'>) =>
  row.emailStatus === 'FAILED' && (row.emailError === IN_PROGRESS_ERROR || row.emailError === UNCONFIRMED_PERSISTENCE_ERROR);

export function serializeDispatch(row: DispatchRow) {
  const unconfirmed = isUnconfirmedDispatch(row);
  return {
    id: row.id,
    dispatch_date: row.dispatchDate,
    dispatched_by: row.dispatchedBy?.name ?? '',
    recipient: { id: row.recipientUserId, name: row.recipientName },
    record_count: row.recordCount,
    logistics_count: row.logisticsCount,
    supplier_count: row.supplierCount,
    internal_count: row.internalCount,
    route_slip_file_name: row.routeSlipFileName,
    client_slips_file_name: row.clientSlipsFileName,
    email_status: row.emailStatus as EmailStatus,
    email_method: row.emailMethod as SendResult['method'] | null,
    in_app_notified: !!row.inAppNotificationId,
    // Present only when the stored FAILED status is a reservation, not a confirmed failure.
    ...(unconfirmed ? { outcome_unconfirmed: true as const } : {}),
    note: row.note,
    created_at: row.createdAt.toISOString(),
  };
}
export type SerializedDispatch = ReturnType<typeof serializeDispatch>;

export function recentDispatchQuery(query: Record<string, unknown>): { date?: string; limit: number } | { error: string } {
  const { date, limit } = query;
  if (Object.keys(query).some(key => !['date', 'limit'].includes(key))) return { error: 'Unsupported query parameter.' };
  if (date !== undefined && (typeof date !== 'string' || !isValidDateOnly(date))) return { error: 'date must be YYYY-MM-DD.' };
  let take = 10;
  if (limit !== undefined) {
    take = typeof limit === 'string' && /^\d+$/.test(limit) ? Number(limit) : NaN;
    if (!(take >= 1 && take <= 50)) return { error: 'limit must be between 1 and 50.' };
  }
  return { ...(date ? { date: date as string } : {}), limit: take };
}

/** Logistics sees only handoffs addressed to them; TASS and Admin see recent handoffs. */
export async function listRecentRmaDispatches(db: Db, user: AuthUser, options: { date?: string; limit: number }) {
  const rows = await db.rmaLogisticsDispatch.findMany({
    where: { ...(options.date ? { dispatchDate: options.date } : {}), ...(user.role === 'LOGISTICS' ? { recipientUserId: user.id } : {}) },
    include: { dispatchedBy: { select: { name: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: options.limit,
  });
  return rows.map(serializeDispatch);
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

export interface DispatchInput {
  recipientUserId: string;
  dispatchDate: string;
  recordIds: string[];
  note: string | null;
  idempotencyKey: string;
}

/** Multipart text fields; every value is server-validated and no email address is accepted. */
export function parseDispatchInput(body: unknown): DispatchInput {
  const fields = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
  if (Object.keys(fields).some(key => !DISPATCH_FIELDS.includes(key))) throw new DispatchError(400, 'This dispatch contains unsupported fields.');
  const { recipient_user_id, dispatch_date, record_ids, note, idempotency_key } = fields;
  if (typeof recipient_user_id !== 'string' || !ID_PATTERN.test(recipient_user_id)) throw new DispatchError(400, 'Choose a Logistics printing coordinator.');
  if (typeof dispatch_date !== 'string' || !isValidDateOnly(dispatch_date)) throw new DispatchError(400, 'dispatch_date must be a valid YYYY-MM-DD date.');
  let ids: unknown;
  try { ids = typeof record_ids === 'string' ? JSON.parse(record_ids) : undefined; } catch { ids = undefined; }
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_DISPATCH_RECORDS
    || ids.some(id => typeof id !== 'string' || !ID_PATTERN.test(id)) || new Set(ids).size !== ids.length) {
    throw new DispatchError(400, `record_ids must be a JSON array of 1 to ${MAX_DISPATCH_RECORDS} unique RMA record IDs.`);
  }
  if (note !== undefined && typeof note !== 'string') throw new DispatchError(400, 'note must be text.');
  const trimmedNote = typeof note === 'string' ? note.trim() : '';
  if (trimmedNote.length > MAX_DISPATCH_NOTE) throw new DispatchError(400, `note must be ${MAX_DISPATCH_NOTE} characters or fewer.`);
  if (idempotency_key !== undefined && (typeof idempotency_key !== 'string' || !IDEMPOTENCY_PATTERN.test(idempotency_key))) {
    throw new DispatchError(400, 'idempotency_key is invalid.');
  }
  return {
    recipientUserId: recipient_user_id, dispatchDate: dispatch_date, recordIds: ids as string[],
    note: trimmedNote || null, idempotencyKey: (idempotency_key as string | undefined) ?? randomUUID(),
  };
}

const recordInclude = { company: { select: { name: true } } } satisfies Prisma.DeliveryRecordInclude;
type RecordRow = Prisma.DeliveryRecordGetPayload<{ include: typeof recordInclude }>;

export function orderDispatchRecords<T extends { id: string; rmaMovement: string | null; deliveryDate: string; rmaReference: string | null }>(rows: readonly T[]): T[] {
  const key = (row: T) => row.rmaReference || row.id;
  return [...rows].sort((a, b) => movementRank(a.rmaMovement) - movementRank(b.rmaMovement)
    || (a.deliveryDate || '9999-99-99').localeCompare(b.deliveryDate || '9999-99-99')
    || key(a).localeCompare(key(b), 'en', { numeric: true }));
}

export function movementCounts(rows: readonly { rmaMovement: string | null }[]) {
  const counts = { logisticsCount: 0, supplierCount: 0, internalCount: 0 };
  for (const row of rows) {
    const rank = movementRank(row.rmaMovement);
    if (rank === 0) counts.logisticsCount++; else if (rank === 1) counts.supplierCount++; else counts.internalCount++;
  }
  return counts;
}

const reference = (row: RecordRow) => row.rmaReference || row.recordNo || row.id;

function notificationMessage(actor: string, rows: RecordRow[], counts: ReturnType<typeof movementCounts>, files: ReturnType<typeof dispatchFileNames>, note: string | null) {
  const refs = rows.slice(0, 5).map(reference).join(', ');
  return [
    `${actor} sent ${rows.length} RMA slip${rows.length === 1 ? '' : 's'} for printing`,
    `(Logistics Route ${counts.logisticsCount} · Supplier Collection ${counts.supplierCount} · Internal Printing ${counts.internalCount}).`,
    `Slips: ${refs}${rows.length > 5 ? ` +${rows.length - 5} more` : ''}.`,
    `Files: ${files.clientSlipsFileName}, ${files.routeSlipFileName}.`,
    ...(note ? [`Note: ${truncate(note, 300)}`] : []),
  ].join(' ');
}

function emailBody(actor: string, recipient: string, date: string, rows: RecordRow[], counts: ReturnType<typeof movementCounts>, files: ReturnType<typeof dispatchFileNames>, note: string | null) {
  const subject = `TASS Daily Slips & Route Slip — ${slipDate(date)} (${rows.length} RMA${rows.length === 1 ? '' : 's'})`;
  const line = (row: RecordRow) => [reference(row), row.company?.name ?? '', canonicalRmaCategory(row.rmaType) || row.rmaType || '', movementLabel(row.rmaMovement), row.area].join(' | ');
  const text = [
    `Hi ${recipient},`, '',
    `${actor} dispatched the TASS daily slips for ${slipDate(date)} for printing.`,
    `Logistics Route: ${counts.logisticsCount} · Supplier Collection: ${counts.supplierCount} · Internal Printing: ${counts.internalCount}`, '',
    'Reference | Company | Category | Movement Method | Area',
    ...rows.map(line), '',
    `Attachments: ${files.clientSlipsFileName}, ${files.routeSlipFileName}`,
    ...(note ? ['', `Note from TASS: ${note}`] : []),
    '', 'FOR INTERNAL USE ONLY',
  ].join('\n');
  const cell = (value: unknown) => `<td style="border:1px solid #cbd5e1;padding:4px 8px;vertical-align:top">${escapeHtml(value)}</td>`;
  const html = [
    `<p>Hi ${escapeHtml(recipient)},</p>`,
    `<p>${escapeHtml(actor)} dispatched the TASS daily slips for <strong>${escapeHtml(slipDate(date))}</strong> for printing.</p>`,
    `<p>Logistics Route: ${counts.logisticsCount} &middot; Supplier Collection: ${counts.supplierCount} &middot; Internal Printing: ${counts.internalCount}</p>`,
    '<table style="border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:13px">',
    `<thead><tr>${['Reference', 'Company', 'Category', 'Movement Method', 'Area'].map(h => `<th style="border:1px solid #cbd5e1;padding:4px 8px;background:#1b5e7a;color:#fff;text-align:left">${h}</th>`).join('')}</tr></thead>`,
    `<tbody>${rows.map(row => `<tr>${cell(reference(row))}${cell(row.company?.name ?? '')}${cell(canonicalRmaCategory(row.rmaType) || row.rmaType || '')}${cell(movementLabel(row.rmaMovement))}${cell(row.area)}</tr>`).join('')}</tbody>`,
    '</table>',
    `<p>Attachments: ${escapeHtml(files.clientSlipsFileName)}, ${escapeHtml(files.routeSlipFileName)}</p>`,
    ...(note ? [`<p><strong>Note from TASS:</strong> ${escapeHtml(note).replace(/\n/g, '<br>')}</p>`] : []),
    '<p><strong>FOR INTERNAL USE ONLY</strong></p>',
  ].join('');
  return { subject, text, html };
}

/** Truthful outcome: mock is never SENT, and a failure is never SENT. */
export function classifySend(result: SendResult): { emailStatus: EmailStatus; emailMethod: SendResult['method']; emailError: string | null } {
  if (!result.ok) return { emailStatus: 'FAILED', emailMethod: result.method, emailError: truncate(result.error || 'Email delivery failed.', 300) };
  if (result.method === 'mock') return { emailStatus: 'MOCKED', emailMethod: 'mock', emailError: null };
  return { emailStatus: 'SENT', emailMethod: result.method, emailError: null };
}

export interface DispatchFilesInput { clientSlips: Buffer; routeSlip: Buffer }
export interface DispatchOutcome {
  deduplicated: boolean;
  dispatch: SerializedDispatch;
  email_error: string | null;
  /** The earlier attempt's final email status was never persisted; the mail outcome is unknown. */
  outcome_unconfirmed?: boolean;
}

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const SAFE_ERROR_CODE_PATTERN = /^[A-Z0-9_]{1,32}$/;
const SAFE_ERROR_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/**
 * Bounded, non-sensitive Phase 3 error metadata. Never reads an error's message,
 * stack, meta or string form, which can carry addresses, DSNs or tokens.
 */
export function safePhase3LogMetadata(dispatchId: string, emailStatus: EmailStatus, error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code.trim() : '';
  const name = error instanceof Error && typeof error.name === 'string' ? error.name.trim() : '';
  return {
    dispatchId,
    mailOutcome: emailStatus,
    errorCode: SAFE_ERROR_CODE_PATTERN.test(code) ? code : null,
    errorName: SAFE_ERROR_NAME_PATTERN.test(name) ? name : 'UnknownError',
  };
}

async function existingDispatch(db: Db, idempotencyKey: string, actorId: string): Promise<DispatchOutcome | null> {
  const existing = await db.rmaLogisticsDispatch.findUnique({ where: { idempotencyKey }, include: { dispatchedBy: { select: { name: true } } } });
  if (!existing) return null;
  if (existing.dispatchedById !== actorId) throw new DispatchError(409, 'This dispatch key belongs to another account. Start a new dispatch.');
  // "Dispatch in progress" may mean the original request is still sending: never claim the attempt finished.
  const inProgress = existing.emailStatus === 'FAILED' && existing.emailError === IN_PROGRESS_ERROR;
  const unconfirmed = isUnconfirmedDispatch(existing);
  return {
    deduplicated: true,
    dispatch: serializeDispatch(existing),
    email_error: inProgress ? IN_PROGRESS_RETRY_MESSAGE : unconfirmed ? UNCONFIRMED_PERSISTENCE_ERROR : existing.emailError,
    ...(unconfirmed ? { outcome_unconfirmed: true } : {}),
  };
}

export async function dispatchRmaToLogistics(db: PrismaClient, actor: AuthUser, input: DispatchInput, files: DispatchFilesInput): Promise<DispatchOutcome> {
  // ── Phase 1: lock, re-verify and reserve ──
  let phase1: Awaited<ReturnType<typeof reserve>> | DispatchOutcome;
  async function reserve(tx: Prisma.TransactionClient) {
    const ids = [...new Set([actor.id, input.recipientUserId])].sort();
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
    const current = await loadAccount(tx, actor.id);
    if (!current?.user.isActive || !canDispatchToLogistics(current.session)) throw new DispatchError(403, 'Dispatching RMA slips to Logistics is not permitted for this account.');
    const duplicate = await existingDispatch(tx, input.idempotencyKey, actor.id);
    if (duplicate) return duplicate;
    const recipient = await loadAccount(tx, input.recipientUserId);
    if (!recipient || !recipient.user.isActive || recipient.user.role !== 'LOGISTICS') throw new DispatchError(400, 'Choose an active Logistics printing coordinator.');
    if (!canReadRma(recipient.session)) throw new DispatchError(403, 'The selected Logistics coordinator does not have access to RMA records.');
    const rows = await tx.deliveryRecord.findMany({
      where: { id: { in: input.recordIds }, deletedAt: null, category: 'RMA', AND: [recordScope(current.session!)] },
      include: recordInclude,
    });
    if (rows.length !== input.recordIds.length) throw new DispatchError(403, 'One or more selected records are not RMA records you can access.');
    if (rows.some(row => row.draft)) throw new DispatchError(400, 'Draft RMA records cannot be dispatched to Logistics. Submit them first.');
    if (rows.some(row => !canReadRma(recipient.session, row))) throw new DispatchError(403, 'The selected Logistics coordinator cannot access every selected RMA record.');
    const ordered = orderDispatchRecords(rows);
    const counts = movementCounts(ordered);
    const names = dispatchFileNames(input.dispatchDate);
    const emailable = deliverableEmail(recipient.user.email);
    const notification = await tx.notification.create({ data: {
      userId: recipient.user.id,
      title: `TASS Daily Slips & Route Slip (${slipDate(input.dispatchDate)})`,
      message: notificationMessage(current.user.name, ordered, counts, names, input.note),
      recordId: ordered[0].id,
      recordType: 'DeliveryRecord',
    } });
    const dispatch = await tx.rmaLogisticsDispatch.create({ data: {
      idempotencyKey: input.idempotencyKey,
      dispatchDate: input.dispatchDate,
      dispatchedById: current.user.id,
      recipientUserId: recipient.user.id,
      recipientName: recipient.user.name,
      recipientEmail: recipient.user.email,
      recordIds: ordered.map(row => row.id),
      recordCount: ordered.length,
      ...counts,
      ...names,
      note: input.note,
      inAppNotificationId: notification.id,
      // Never optimistic: a crash before Phase 3 leaves FAILED, not SENT.
      emailStatus: emailable ? 'FAILED' : 'SKIPPED',
      emailMethod: null,
      emailError: emailable ? IN_PROGRESS_ERROR : NO_EMAIL_ERROR,
    } });
    return { dispatch, ordered, counts, names, emailable, actorName: current.user.name, recipient: recipient.user };
  }
  try {
    phase1 = await db.$transaction(reserve, { timeout: 20_000 });
  } catch (error) {
    // A concurrent request with the same key committed first.
    if (isUniqueViolation(error)) {
      const duplicate = await existingDispatch(db, input.idempotencyKey, actor.id);
      if (duplicate) return duplicate;
    }
    throw error;
  }
  if ('deduplicated' in phase1) return phase1;
  const { dispatch, ordered, counts, names, emailable, actorName, recipient } = phase1;

  // ── Phase 2: external mail transport, outside any transaction ──
  let outcome: { emailStatus: EmailStatus; emailMethod: SendResult['method'] | null; emailError: string | null } = { emailStatus: 'SKIPPED', emailMethod: null, emailError: NO_EMAIL_ERROR };
  if (emailable) {
    const body = emailBody(actorName, recipient.name, input.dispatchDate, ordered, counts, names, input.note);
    const attachments: MailAttachment[] = [
      { filename: names.clientSlipsFileName, content: files.clientSlips, contentType: 'application/pdf' },
      { filename: names.routeSlipFileName, content: files.routeSlip, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    ];
    let result: SendResult;
    try { result = await sendEmail({ to: recipient.email.trim(), ...body, attachments }); }
    catch (error) { result = { ok: false, method: 'mock', error: error instanceof Error ? error.message : 'Email delivery failed.' }; }
    outcome = classifySend(result);
  }
  const emailMethod = outcome.emailStatus === 'SKIPPED' ? null : outcome.emailMethod;

  // ── Phase 3: persist the truthful outcome ──
  const finalize = () => db.$transaction(async tx => {
    const saved = await tx.rmaLogisticsDispatch.update({
      where: { id: dispatch.id },
      data: { emailStatus: outcome.emailStatus, emailMethod, emailError: outcome.emailError },
      include: { dispatchedBy: { select: { name: true } } },
    });
    await tx.notificationLog.create({ data: {
      triggerEvent: 'TASS_LOGISTICS_DISPATCH', recipientRole: 'LOGISTICS', recipientName: recipient.name,
      message: `TASS Daily Slips & Route Slip ${slipDate(input.dispatchDate)}\nRecords: ${ordered.length}\nFiles: ${names.clientSlipsFileName}, ${names.routeSlipFileName}${outcome.emailError ? `\nDetail: ${outcome.emailError}` : ''}`,
      status: outcome.emailStatus,
    } });
    await tx.auditLog.create({ data: {
      recordId: saved.id, recordType: 'RmaLogisticsDispatch', action: 'CREATE', changedById: actor.id, previousValue: null,
      newValue: JSON.stringify({
        dispatch_date: saved.dispatchDate, recipient_name: saved.recipientName, record_count: saved.recordCount,
        logistics_count: saved.logisticsCount, supplier_count: saved.supplierCount, internal_count: saved.internalCount,
        route_slip_file_name: saved.routeSlipFileName, client_slips_file_name: saved.clientSlipsFileName,
        email_status: saved.emailStatus, email_method: saved.emailMethod, in_app_notified: !!saved.inAppNotificationId,
      }),
    } });
    return saved;
  });
  let finalized: Awaited<ReturnType<typeof finalize>>;
  try {
    finalized = await finalize();
  } catch (phase3Error) {
    // The mail attempt already happened; never record SENT without its log and audit.
    console.error('[rmaLogisticsDispatch] Phase 3 finalization failed', safePhase3LogMetadata(dispatch.id, outcome.emailStatus, phase3Error));
    // Best effort: replace "Dispatch in progress" with an explicit unconfirmed marker
    // (a SKIPPED reservation already holds its true outcome).
    if (emailable) await db.rmaLogisticsDispatch.update({ where: { id: dispatch.id }, data: { emailError: UNCONFIRMED_PERSISTENCE_ERROR } }).catch(() => null);
    throw new DispatchError(500,
      `In-app notification was sent to ${recipient.name} and the mail attempt returned ${outcome.emailStatus}, but saving the final dispatch log failed. Do not assume the email failed — verify with ${recipient.name} or download the backup files below; retrying will not resend.`,
      {
        code: 'DISPATCH_FINALIZATION_FAILED',
        dispatch_id: dispatch.id,
        in_app_notified: true,
        mail_outcome: outcome.emailStatus,
        email_method: emailMethod,
        email_error: outcome.emailError,
        persisted: false,
      });
  }
  return { deduplicated: false, dispatch: serializeDispatch(finalized), email_error: finalized.emailError };
}
