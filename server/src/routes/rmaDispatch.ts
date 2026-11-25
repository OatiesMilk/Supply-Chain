import { Router, type RequestHandler } from 'express';
import type { DeliveryRecord, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { asyncRoute } from '../middleware/asyncRoute';
import { requireAuth, requireResource, requireRole, requireAction, type AuthUser } from '../middleware/auth';
import { serializeRecord } from '../mappings';
import { resolveStartRemarks } from '../services/startRemarks';
import { canPerformPolicyRecordAction, canReadRecord, canReadPolicyRecord, readableCategories, recordScope } from '../services/recordAccess';
import {
  canDispatchToLogistics, DispatchError, dispatchRmaToLogistics, listActiveLogisticsRecipients, listRecentRmaDispatches, parseDispatchInput, recentDispatchQuery,
} from '../services/rmaLogisticsDispatch';
import {
  discardDispatchFiles, DISPATCH_TOTAL_TOO_LARGE_ERROR, DispatchFileError, dispatchUploadPaths, handleDispatchUpload, inspectDispatchPdf, inspectDispatchXlsx,
  MAX_DISPATCH_TOTAL_BYTES, type DispatchFiles,
} from '../services/dispatchUpload';
import { readRmaPermissions } from '../services/rmaDispatchPermissions';
import { eligibleRmaTransport, rmaTransportContext, rmaTransportDateError, validRmaMovement } from '../services/rmaMovement';
import { assignmentError, resolveDriverAssignment, withDriverDirectoryLock } from '../services/driverDirectory';
import { findVerifiedDeliveryPhoto, lockPodRecord } from '../services/podPhotos';
import { isoTimestamp, manilaToday, transitionError } from '../services/deliveryLifecycle';
import { parseRmaEventDate } from '../services/rmaRules';
import type { EffectivePermissionSnapshot } from '../services/permissionEvaluator';
import { notifyRmaRecipients } from '../services/rmaNotifications';
import { receivedByError } from '../services/driverActions';

const router = Router();
const include = {
  company: true,
  lineItems: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
  rmaContacts: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
  createdBy: { include: { signature: { select: { updatedAt: true } } } },
  modifiedBy: true,
} satisfies Prisma.DeliveryRecordInclude;
type Row = Prisma.DeliveryRecordGetPayload<{ include: typeof include }>;
export class RmaActionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function rmaVersionError(record: { rmaVersion?: number }, expected: unknown): string | null {
  if (!Number.isSafeInteger(expected) || (expected as number) < 0) return 'A current expected_version is required. Reload this RMA and try again.';
  if (expected !== (record.rmaVersion ?? 0)) return 'This RMA changed in another session. Reload it before retrying your change.';
  return null;
}
/** Roles that record transport: the assigned Driver, or Logistics for the assigned Driver. */
const TRANSPORT_ROLES = ['DRIVER', 'LOGISTICS'];
const pathFor = (role: string) => role === 'DRIVER' ? 'driver_dashboard' as const : 'rma' as const;
export function rmaCapabilities(policy: EffectivePermissionSnapshot | null, row: DeliveryRecord) {
  const denied = { assign: false, transport: false, receive: false, complete: false, pod: false, status: false, correctTransport: false };
  if (!policy) return denied;
  const options = { path: pathFor(policy.role ?? ''), rmaTransport: rmaTransportContext(row) };
  if (!canReadPolicyRecord(policy, row, options)) return denied;
  const active = !row.draft && row.status !== 'ACCOMPLISHED';
  const transportInProgress = row.rmaMovement === 'LOGISTICS_TRANSPORT' && row.rmaTransportStatus === 'IN_TRANSIT';
  const transportDone = row.rmaMovement !== 'LOGISTICS_TRANSPORT' || row.rmaTransportStatus === 'COMPLETED';
  return {
    assign: active && eligibleRmaTransport(row) && !row.rmaReceivedAt && row.rmaTransportStatus !== 'COMPLETED'
      && ['LOGISTICS', 'ADMIN'].includes(policy.role ?? '') && canPerformPolicyRecordAction(policy, row, 'ASSIGN', options),
    transport: active && TRANSPORT_ROLES.includes(policy.role ?? '') && !!row.driverId && !row.rmaReceivedAt
      && ['PENDING', 'IN_TRANSIT'].includes(row.rmaTransportStatus ?? '') && canPerformPolicyRecordAction(policy, row, 'STATUS', options),
    receive: active && validRmaMovement(row.rmaMovement) && transportDone && !row.rmaReceivedAt
      && policy.role === 'TASS' && canPerformPolicyRecordAction(policy, row, 'RECEIVE', options),
    complete: active && transportDone && !!row.rmaReceivedAt && policy.role === 'TASS'
      && canPerformPolicyRecordAction(policy, row, 'COMPLETE', { ...options, targetStatus: 'Delivered' })
      && !transitionError(row, 'Delivered', 'TASS'),
    pod: active && transportInProgress && TRANSPORT_ROLES.includes(policy.role ?? '') && !!row.driverId && !row.rmaReceivedAt
      && canPerformPolicyRecordAction(policy, row, 'POD', options),
    status: active && ['TASS', 'ADMIN'].includes(policy.role ?? '')
      && ['Pending', 'On-Hold', 'Rescheduled'].some(targetStatus => canPerformPolicyRecordAction(policy, row, 'STATUS', { ...options, targetStatus: targetStatus as 'Pending' | 'On-Hold' | 'Rescheduled' })),
    correctTransport: !row.draft
      && row.status === 'ACCOMPLISHED'
      && eligibleRmaTransport(row)
      && row.rmaTransportStatus === 'COMPLETED'
      && policy.role === 'LOGISTICS'
      && canPerformPolicyRecordAction(policy, row, 'ASSIGN', options),
  };
}
export async function rmaActionPolicy(tx: Prisma.TransactionClient, user: AuthUser, row: DeliveryRecord) {
  if (row.category !== 'RMA' || !canReadRecord(user, row)) throw new RmaActionError(403, 'Record access denied');
  const policy = await readRmaPermissions(tx, user.id);
  if (!policy || policy.role !== user.role || !canReadPolicyRecord(policy, row, { path: pathFor(user.role), rmaTransport: rmaTransportContext(row) })) throw new RmaActionError(403, 'Record access denied');
  return policy;
}
export async function canUploadRmaPod(tx: Prisma.TransactionClient, user: AuthUser, row: DeliveryRecord): Promise<boolean> {
  try {
    const policy = await rmaActionPolicy(tx, user, row);
    return rmaCapabilities(policy, row).pod;
  } catch (error) {
    if (error instanceof RmaActionError) return false;
    throw error;
  }
}
const action = (fn: Parameters<typeof asyncRoute>[0]) => asyncRoute(async (req, res, next) => {
  try { await fn(req, res, next); }
  catch (error) {
    if (error instanceof RmaActionError) { res.status(error.status).json({ error: error.message }); return; }
    throw error;
  }
});
async function savedAction(tx: Prisma.TransactionClient, row: Row, data: Prisma.DeliveryRecordUncheckedUpdateInput, user: AuthUser, remarks: string, context: string) {
  const saved = await tx.deliveryRecord.update({ where: { id: row.id }, data: {
    ...data, rmaVersion: { increment: 1 }, modifiedById: user.id, remarks,
  }, include });
  await tx.auditLog.create({ data: {
    recordId: row.id, recordType: 'DeliveryRecord', action: 'UPDATE', changedById: user.id,
    previousValue: JSON.stringify(serializeRecord(row)), newValue: JSON.stringify(serializeRecord(saved)),
  } });
  await tx.remarkLog.create({ data: { recordId: row.id, body: remarks, context, authorId: user.id } });
  return saved;
}
const REMARKS_REQUIRED = 'Remarks are required for this RMA action.';
function input(body: Record<string, unknown>, allowed: string[], user?: AuthUser) {
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new RmaActionError(400, 'This action contains unsupported fields.');
  // Only a Driver starting transport may omit remarks; every other action keeps them required.
  if (user && body.transport_status === 'IN_TRANSIT') {
    const start = resolveStartRemarks(body.remarks, user.role, REMARKS_REQUIRED);
    if (!start.ok) throw new RmaActionError(400, start.error);
    return start.remarks;
  }
  if (typeof body.remarks !== 'string' || !body.remarks.trim()) throw new RmaActionError(400, REMARKS_REQUIRED);
  return body.remarks.trim();
}
function version(row: Row, expected: unknown) {
  const error = rmaVersionError(row, expected);
  if (error) throw new RmaActionError(Number.isSafeInteger(expected) ? 409 : 400, error);
}
async function locked(tx: Prisma.TransactionClient, id: string) {
  await lockPodRecord(tx, id);
  const row = await tx.deliveryRecord.findUnique({ where: { id }, include });
  if (!row || row.deletedAt || row.category !== 'RMA') throw new RmaActionError(403, 'Record access denied');
  return row;
}

// ─── Feature 5b: TASS -> Logistics daily handoff (static paths ahead of /:id/*) ──

const dispatchAction = (fn: Parameters<typeof asyncRoute>[0]) => asyncRoute(async (req, res, next) => {
  try { await fn(req, res, next); }
  catch (error) {
    if (error instanceof DispatchError) { res.status(error.status).json({ error: error.message, ...(error.details ?? {}) }); return; }
    if (error instanceof DispatchFileError) { res.status(error.status).json({ error: error.message }); return; }
    throw error;
  }
});
/** Current TASS RMA read + write, checked before any upload is accepted. */
const requireDispatchActor: RequestHandler = (req, res, next) => {
  if (!canDispatchToLogistics(req.user)) { res.status(403).json({ error: 'Dispatching RMA slips to Logistics is not permitted for this account.' }); return; }
  next();
};

router.get('/rma-logistics-recipients', requireAuth, requireResource('records'), requireRole('TASS'), requireDispatchActor, dispatchAction(async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ recipients: await listActiveLogisticsRecipients(prisma) });
}));

router.get('/rma-logistics-dispatches', requireAuth, requireResource('records'), requireRole('TASS', 'LOGISTICS', 'ADMIN'), dispatchAction(async (req, res) => {
  if (!readableCategories(req.user!).includes('RMA')) throw new DispatchError(403, 'RMA access denied');
  const query = recentDispatchQuery(req.query as Record<string, unknown>);
  if ('error' in query) throw new DispatchError(400, query.error);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ dispatches: await listRecentRmaDispatches(prisma, req.user!, query) });
}));

router.post('/rma-logistics-dispatch', requireAuth, requireResource('records'), requireRole('TASS'), requireDispatchActor, handleDispatchUpload, dispatchAction(async (req, res) => {
  const paths = dispatchUploadPaths(req);
  try {
    const input = parseDispatchInput(req.body);
    const files = (req.files ?? {}) as DispatchFiles;
    const pdf = files.client_slips?.[0];
    const xlsx = files.route_slip?.[0];
    if (!pdf || !xlsx) throw new DispatchError(400, 'Attach both the Client Slips PDF ("client_slips") and the Daily Route Slip workbook ("route_slip").');
    const clientSlips = await inspectDispatchPdf(pdf.path);
    const routeSlip = await inspectDispatchXlsx(xlsx.path);
    if (clientSlips.length + routeSlip.length > MAX_DISPATCH_TOTAL_BYTES) throw new DispatchFileError(413, DISPATCH_TOTAL_TOO_LARGE_ERROR);
    const result = await dispatchRmaToLogistics(prisma, req.user!, input, { clientSlips, routeSlip });
    res.status(result.deduplicated ? 200 : 201).json(result);
  } finally {
    await discardDispatchFiles(paths);
  }
}));

router.get('/:id/rma-capabilities', requireAuth, requireResource('records'), action(async (req, res) => {
  const row = await prisma.deliveryRecord.findFirst({ where: { id: req.params.id, deletedAt: null, AND: [recordScope(req.user!)] }, include });
  if (!row || row.category !== 'RMA') throw new RmaActionError(403, 'Record access denied');
  res.json(rmaCapabilities(req.user!.rmaPermissions ?? null, row));
}));

router.patch('/:id/rma-assignment', requireAuth, requireResource('records'), requireRole('LOGISTICS'), requireAction('CATEGORY', 'RMA', 'ASSIGN'), action(async (req, res) => {
  const body = req.body ?? {};
  const remarks = input(body, ['driver_id', 'vehicle', 'driver_assistants', 'expected_version', 'remarks']);
  if (body.driver_id !== null && (typeof body.driver_id !== 'string' || !body.driver_id.trim())) throw new RmaActionError(400, 'Choose a Driver profile ID or null.');
  if (body.vehicle !== undefined && typeof body.vehicle !== 'string') throw new RmaActionError(400, 'Vehicle must be text.');
  if (body.driver_assistants !== undefined && (!Array.isArray(body.driver_assistants) || body.driver_assistants.some((name: unknown) => typeof name !== 'string' || !name.trim()))) throw new RmaActionError(400, 'Assistants must be an array of names.');
  const saved = await withDriverDirectoryLock(prisma, async tx => {
    const row = await locked(tx, req.params.id);
    const policy = await rmaActionPolicy(tx, req.user!, row);
    if (!rmaCapabilities(policy, row).assign) throw new RmaActionError(403, 'RMA assignment is not permitted for this record.');
    version(row, body.expected_version);
    if (row.rmaTransportStatus === 'IN_TRANSIT' && body.driver_id === null) throw new RmaActionError(400, 'An active transport must retain a Driver. Reassign it to another active Driver.');
    const assignment = await resolveDriverAssignment(tx, row, { id: body.driver_id });
    if ('error' in assignment) throw new RmaActionError(400, assignment.error);
    const driverAssistants = body.driver_assistants === undefined ? row.driverAssistants : JSON.stringify(body.driver_assistants);
    const invalid = await assignmentError(tx, row, { driverAssistants });
    if (invalid) throw new RmaActionError(400, invalid);
    const updated = await savedAction(tx, row, { ...assignment, ...(body.vehicle !== undefined ? { vehicle: body.vehicle } : {}), driverAssistants }, req.user!, remarks, 'RMA_ASSIGNMENT');
    await notifyRmaRecipients(tx, updated, ['TASS', 'DRIVER'], 'RMA driver assignment updated', `${updated.rmaReference || updated.recordNo} · ${updated.driver || 'Unassigned'}${updated.deliveryDate ? ` on ${updated.deliveryDate}` : ''}`, req.user!.id);
    return updated;
  });
  res.json(serializeRecord(saved, req.user));
}));

router.patch('/:id/rma-transport', requireAuth, requireResource('records'), requireRole('DRIVER', 'LOGISTICS'), requireAction('CATEGORY', 'RMA', 'STATUS'), action(async (req, res) => {
  const body = req.body ?? {};
  const remarks = input(body, ['transport_status', 'expected_version', 'remarks', 'received_by'], req.user!);
  if (!['IN_TRANSIT', 'COMPLETED'].includes(body.transport_status)) throw new RmaActionError(400, 'Choose a valid transport status.');
  if (body.transport_status === 'IN_TRANSIT' && body.received_by !== undefined) throw new RmaActionError(400, 'Received By is recorded when completing transport.');
  const receivedBy = body.transport_status === 'COMPLETED' ? receivedByError(body.received_by) : null;
  if (receivedBy) throw new RmaActionError(400, receivedBy);
  const visible = await prisma.deliveryRecord.findFirst({ where: { id: req.params.id, deletedAt: null, AND: [recordScope(req.user!)] }, include });
  if (!visible || !rmaCapabilities(req.user!.rmaPermissions ?? null, visible).transport) throw new RmaActionError(403, 'RMA transport is not permitted for this record.');
  const proof = body.transport_status === 'COMPLETED' ? await findVerifiedDeliveryPhoto(prisma, req.params.id) : null;
  const saved = await prisma.$transaction(async tx => {
    const row = await locked(tx, req.params.id);
    const policy = await rmaActionPolicy(tx, req.user!, row);
    if (!rmaCapabilities(policy, row).transport) throw new RmaActionError(403, rmaTransportDateError(row) ?? 'RMA transport is not permitted for this record.');
    version(row, body.expected_version);
    const target = body.transport_status as string;
    if (target === 'IN_TRANSIT' && row.rmaTransportStatus !== 'PENDING' || target === 'COMPLETED' && row.rmaTransportStatus !== 'IN_TRANSIT') throw new RmaActionError(400, 'This transport transition is not allowed.');
    if (target === 'COMPLETED' && (!proof || !await tx.podAttachment.findFirst({ where: { id: proof.id, recordId: row.id, storageKey: proof.storageKey, mimeType: proof.mimeType, size: proof.size } }))) throw new RmaActionError(400, 'Upload a saved JPG or PNG transport proof photo before completing transport.');
    const updated = await savedAction(tx, row, { rmaTransportStatus: target,
      ...(target === 'IN_TRANSIT' ? { rmaTransportStartedAt: new Date() } : { rmaTransportCompletedAt: new Date(), rmaTransportReceivedBy: (body.received_by as string).trim() }),
    }, req.user!, remarks, 'RMA_TRANSPORT');
    await notifyRmaRecipients(tx, updated, ['TASS', 'LOGISTICS'], 'RMA transport updated', `${updated.rmaReference || updated.recordNo} · ${target === 'COMPLETED' ? 'Transport complete; physical receipt is still unconfirmed.' : 'In transit.'}`, req.user!.id);
    return updated;
  }, { timeout: 30_000 });
  res.json(serializeRecord(saved, req.user));
}));

router.post('/:id/rma-receipt', requireAuth, requireResource('records'), requireRole('TASS'), requireAction('CATEGORY', 'RMA', 'RECEIVE'), action(async (req, res) => {
  const body = req.body ?? {};
  const remarks = input(body, ['recipient', 'received_at', 'expected_version', 'remarks']);
  // TASS records receipt status, not the signer: Recipient is optional.
  if (body.recipient !== undefined && body.recipient !== null) {
    if (typeof body.recipient !== 'string') throw new RmaActionError(400, 'Recipient must be text.');
    if (body.recipient.trim().length > 120) throw new RmaActionError(400, 'Recipient must be 120 characters or fewer.');
  }
  const recipient = typeof body.recipient === 'string' && body.recipient.trim() ? body.recipient.trim() : null;
  // Format and future-date bounds before locking; chronology is rechecked under the lock.
  const preflight = parseRmaEventDate(body.received_at, { label: 'Receipt date' });
  if (!preflight.ok) throw new RmaActionError(400, preflight.error);
  const saved = await prisma.$transaction(async tx => {
    const row = await locked(tx, req.params.id);
    const policy = await rmaActionPolicy(tx, req.user!, row);
    if (!rmaCapabilities(policy, row).receive) throw new RmaActionError(403, 'Physical receipt is not permitted before transport completion or after receipt.');
    version(row, body.expected_version);
    const minDate = row.rmaMovement === 'LOGISTICS_TRANSPORT' && row.rmaTransportCompletedAt ? manilaToday(new Date(row.rmaTransportCompletedAt)) : null;
    const receivedAt = parseRmaEventDate(body.received_at, {
      label: 'Receipt date', minDate, minDateError: 'Receipt date cannot be earlier than the transport completion date.',
    });
    if (!receivedAt.ok) throw new RmaActionError(400, receivedAt.error);
    const updated = await savedAction(tx, row, { rmaReceivedAt: receivedAt.date, rmaReceivedBy: req.user!.id, rmaRecipient: recipient }, req.user!, remarks, 'RMA_RECEIPT');
    const receiptLabel = updated.rmaRecipient ? ` · ${updated.rmaRecipient}` : ' · Physical receipt confirmed';
    await notifyRmaRecipients(tx, updated, ['TASS', 'LOGISTICS'], 'RMA physical receipt confirmed', `${updated.rmaReference || updated.recordNo}${receiptLabel}. Final RMA completion is a separate TASS action.`, req.user!.id);
    return updated;
  });
  res.json(serializeRecord(saved, req.user));
}));

router.patch('/:id/rma-transport-correction', requireAuth, requireResource('records'), requireRole('LOGISTICS'), requireAction('CATEGORY', 'RMA', 'ASSIGN'), action(async (req, res) => {
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
  const remarks = input(body, ['transport_received_by', 'transport_started_at', 'transport_completed_at', 'expected_version', 'remarks']);
  const hasReceivedBy = body.transport_received_by !== undefined;
  const hasStartedAt = body.transport_started_at !== undefined;
  const hasCompletedAt = body.transport_completed_at !== undefined;
  if (!hasReceivedBy && !hasStartedAt && !hasCompletedAt) {
    throw new RmaActionError(400, 'Provide at least one transport detail to update.');
  }
  if (hasReceivedBy) {
    const error = receivedByError(body.transport_received_by);
    if (error) throw new RmaActionError(400, error);
  }
  const parsedStart = hasStartedAt ? isoTimestamp(body.transport_started_at) : null;
  if (hasStartedAt && !parsedStart) throw new RmaActionError(400, 'Transport Started must be a valid ISO timestamp with timezone.');
  const parsedCompleted = hasCompletedAt ? isoTimestamp(body.transport_completed_at) : null;
  if (hasCompletedAt && !parsedCompleted) throw new RmaActionError(400, 'Transport Completed must be a valid ISO timestamp with timezone.');

  const saved = await prisma.$transaction(async tx => {
    const row = await locked(tx, req.params.id);
    const policy = await rmaActionPolicy(tx, req.user!, row);
    if (!rmaCapabilities(policy, row).correctTransport) throw new RmaActionError(403, 'RMA transport correction is not permitted for this record.');
    version(row, body.expected_version);
    if (hasStartedAt && !row.rmaTransportStartedAt) throw new RmaActionError(400, 'Transport Started cannot be added because no start timestamp was recorded.');
    if (hasCompletedAt && !row.rmaTransportCompletedAt) throw new RmaActionError(400, 'Transport Completed cannot be added because no completion timestamp was recorded.');
    const nextStarted = parsedStart ? new Date(parsedStart) : (row.rmaTransportStartedAt ? new Date(row.rmaTransportStartedAt) : null);
    const nextCompleted = parsedCompleted ? new Date(parsedCompleted) : (row.rmaTransportCompletedAt ? new Date(row.rmaTransportCompletedAt) : null);
    if (nextStarted && nextCompleted && nextCompleted.getTime() < nextStarted.getTime()) {
      throw new RmaActionError(400, 'Transport Completed must be after Transport Started.');
    }
    const data: Prisma.DeliveryRecordUncheckedUpdateInput = {
      ...(hasReceivedBy ? { rmaTransportReceivedBy: (body.transport_received_by as string).trim() } : {}),
      ...(parsedStart ? { rmaTransportStartedAt: new Date(parsedStart) } : {}),
      ...(parsedCompleted ? { rmaTransportCompletedAt: new Date(parsedCompleted) } : {}),
    };
    return savedAction(tx, row, data, req.user!, remarks, 'TIMESTAMP_CORRECTION');
  });
  res.json(serializeRecord(saved, req.user));
}));

export default router;
