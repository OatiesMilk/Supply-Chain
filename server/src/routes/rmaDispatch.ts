import { Router } from 'express';
import type { DeliveryRecord, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { asyncRoute } from '../middleware/asyncRoute';
import { requireAuth, requireResource, requireRole, type AuthUser } from '../middleware/auth';
import { serializeRecord } from '../mappings';
import { canPerformPolicyRecordAction, canReadRecord, canReadPolicyRecord, recordScope } from '../services/recordAccess';
import { readRmaPermissions } from '../services/rmaDispatchPermissions';
import { eligibleRmaTransport, rmaTransportContext, rmaTransportDateError, validRmaMovement } from '../services/rmaMovement';
import { assignmentError, resolveDriverAssignment, withDriverDirectoryLock } from '../services/driverDirectory';
import { findVerifiedDeliveryPhoto, lockPodRecord } from '../services/podPhotos';
import { transitionError } from '../services/deliveryLifecycle';
import type { EffectivePermissionSnapshot } from '../services/permissionEvaluator';
import { notifyRmaRecipients } from '../services/rmaNotifications';

const router = Router();
const include = { company: true, lineItems: true, createdBy: true, modifiedBy: true } satisfies Prisma.DeliveryRecordInclude;
type Row = Prisma.DeliveryRecordGetPayload<{ include: typeof include }>;
export class RmaActionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function rmaVersionError(record: { rmaVersion?: number }, expected: unknown): string | null {
  if (!Number.isSafeInteger(expected) || (expected as number) < 0) return 'A current expected_version is required. Reload this RMA and try again.';
  if (expected !== (record.rmaVersion ?? 0)) return 'This RMA changed in another session. Reload it before retrying your change.';
  return null;
}
const pathFor = (role: string) => role === 'DRIVER' ? 'driver_dashboard' as const : 'rma' as const;
export function rmaCapabilities(policy: EffectivePermissionSnapshot | null, row: DeliveryRecord) {
  const denied = { assign: false, transport: false, receive: false, complete: false, pod: false, status: false };
  if (!policy) return denied;
  const options = { path: pathFor(policy.role ?? ''), rmaTransport: rmaTransportContext(row) };
  if (!canReadPolicyRecord(policy, row, options)) return denied;
  const active = !row.draft && row.status !== 'ACCOMPLISHED';
  const transportDone = row.rmaMovement !== 'LOGISTICS_TRANSPORT' || row.rmaTransportStatus === 'COMPLETED';
  return {
    assign: active && eligibleRmaTransport(row) && !row.rmaReceivedAt && row.rmaTransportStatus !== 'COMPLETED'
      && ['LOGISTICS', 'ADMIN'].includes(policy.role ?? '') && canPerformPolicyRecordAction(policy, row, 'ASSIGN', options),
    transport: active && policy.role === 'DRIVER' && !!row.driverId && !row.rmaReceivedAt
      && ['PENDING', 'IN_TRANSIT'].includes(row.rmaTransportStatus ?? '') && canPerformPolicyRecordAction(policy, row, 'STATUS', options),
    receive: active && validRmaMovement(row.rmaMovement) && transportDone && !row.rmaReceivedAt
      && policy.role === 'TASS' && canPerformPolicyRecordAction(policy, row, 'RECEIVE', options),
    complete: active && transportDone && !!row.rmaReceivedAt && policy.role === 'TASS'
      && canPerformPolicyRecordAction(policy, row, 'COMPLETE', { ...options, targetStatus: 'Delivered' })
      && !transitionError(row, 'Delivered', 'TASS'),
    pod: active && policy.role === 'DRIVER' && !!row.driverId && !row.rmaReceivedAt
      && canPerformPolicyRecordAction(policy, row, 'POD', options),
    status: active && ['TASS', 'ADMIN'].includes(policy.role ?? '')
      && ['Pending', 'On-Hold', 'Rescheduled'].some(targetStatus => canPerformPolicyRecordAction(policy, row, 'STATUS', { ...options, targetStatus: targetStatus as 'Pending' | 'On-Hold' | 'Rescheduled' })),
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
function input(body: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new RmaActionError(400, 'This action contains unsupported fields.');
  if (typeof body.remarks !== 'string' || !body.remarks.trim()) throw new RmaActionError(400, 'Remarks are required for this RMA action.');
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

router.get('/:id/rma-capabilities', requireAuth, requireResource('records'), action(async (req, res) => {
  const row = await prisma.deliveryRecord.findFirst({ where: { id: req.params.id, deletedAt: null, AND: [recordScope(req.user!)] }, include });
  if (!row || row.category !== 'RMA') throw new RmaActionError(403, 'Record access denied');
  res.json(rmaCapabilities(req.user!.rmaPermissions ?? null, row));
}));

router.patch('/:id/rma-assignment', requireAuth, requireResource('records'), requireRole('LOGISTICS', 'ADMIN'), action(async (req, res) => {
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
    await notifyRmaRecipients(tx, updated, ['TASS', 'DRIVER'], 'RMA driver assignment updated', `${updated.rmaReference || updated.id} · ${updated.driver || 'Unassigned'}${updated.deliveryDate ? ` on ${updated.deliveryDate}` : ''}`, req.user!.id);
    return updated;
  });
  res.json(serializeRecord(saved, req.user));
}));

router.patch('/:id/rma-transport', requireAuth, requireResource('records'), requireRole('DRIVER'), action(async (req, res) => {
  const body = req.body ?? {};
  const remarks = input(body, ['transport_status', 'expected_version', 'remarks']);
  if (!['IN_TRANSIT', 'COMPLETED'].includes(body.transport_status)) throw new RmaActionError(400, 'Choose a valid transport status.');
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
      ...(target === 'IN_TRANSIT' ? { rmaTransportStartedAt: new Date() } : { rmaTransportCompletedAt: new Date() }),
    }, req.user!, remarks, 'RMA_TRANSPORT');
    await notifyRmaRecipients(tx, updated, ['TASS', 'LOGISTICS'], 'RMA transport updated', `${updated.rmaReference || updated.id} · ${target === 'COMPLETED' ? 'Transport complete; physical receipt is still unconfirmed.' : 'In transit.'}`, req.user!.id);
    return updated;
  }, { timeout: 30_000 });
  res.json(serializeRecord(saved, req.user));
}));

router.post('/:id/rma-receipt', requireAuth, requireResource('records'), requireRole('TASS'), action(async (req, res) => {
  const body = req.body ?? {};
  const remarks = input(body, ['recipient', 'expected_version', 'remarks']);
  if (typeof body.recipient !== 'string' || !body.recipient.trim()) throw new RmaActionError(400, 'Recipient is required to confirm physical receipt.');
  const saved = await prisma.$transaction(async tx => {
    const row = await locked(tx, req.params.id);
    const policy = await rmaActionPolicy(tx, req.user!, row);
    if (!rmaCapabilities(policy, row).receive) throw new RmaActionError(403, 'Physical receipt is not permitted before transport completion or after receipt.');
    version(row, body.expected_version);
    const updated = await savedAction(tx, row, { rmaReceivedAt: new Date(), rmaReceivedBy: req.user!.id, rmaRecipient: body.recipient.trim() }, req.user!, remarks, 'RMA_RECEIPT');
    await notifyRmaRecipients(tx, updated, ['TASS', 'LOGISTICS'], 'RMA physical receipt confirmed', `${updated.rmaReference || updated.id} · ${updated.rmaRecipient}. Final RMA completion is a separate TASS action.`, req.user!.id);
    return updated;
  });
  res.json(serializeRecord(saved, req.user));
}));

export default router;
