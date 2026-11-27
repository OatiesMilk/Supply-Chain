import type { Response } from 'express';
import type { Prisma, UserSignature } from '@prisma/client';
import { pipeline } from 'node:stream/promises';
import { prisma } from '../db';
import { discardUpload } from './podStorage';
import { administrativeTransaction, PolicyManagementError } from './permissionManagement';
import { generateSignatureStorageKey, inspectSignatureUpload, type SignatureMimeType } from './signatureRules';
import { signatureStorage, signatureStorageNamespace } from './signatureStorage';
import { cleanSignatureStorageDeletions } from './signatureDeletionCleanup';

type Tx = Prisma.TransactionClient;
type SignatureMeta = Pick<UserSignature, 'mimeType' | 'size' | 'width' | 'height' | 'updatedAt'>;

/** Public metadata only: the storage key never leaves the server. */
export function serializeSignatureMeta(signature: SignatureMeta | null | undefined, imagePath: string) {
  if (!signature) return { has_signature: false, mime_type: null, size: null, width: null, height: null, updated_at: null, image_url: null };
  return {
    has_signature: true,
    mime_type: signature.mimeType,
    size: signature.size,
    width: signature.width ?? null,
    height: signature.height ?? null,
    updated_at: signature.updatedAt,
    image_url: `${imagePath}?v=${signature.updatedAt.getTime()}`,
  };
}

/** Audit snapshot for a signature. Deliberately excludes the storage key. */
function auditState(signature: SignatureMeta | null | undefined) {
  return {
    has_signature: !!signature,
    signature_mime_type: signature?.mimeType ?? null,
    signature_updated_at: signature?.updatedAt ?? null,
  };
}

export type SignatureMode = { kind: 'self'; userId: string } | { kind: 'admin'; actorId: string; targetId: string };

/**
 * Runs `work` with the target account row locked. Self-service requires the
 * caller to still be active; admin mode re-verifies current active ADMIN
 * authority (and V1 users:UPDATE) and the target's existence under lock.
 */
async function lockedSignatureTransaction<T>(mode: SignatureMode, work: (tx: Tx, actorId: string, targetId: string) => Promise<T>) {
  if (mode.kind === 'admin') {
    return administrativeTransaction(prisma, mode.actorId, mode.targetId, tx => work(tx, mode.actorId, mode.targetId), 'UPDATE');
  }
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${mode.userId} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: mode.userId }, select: { isActive: true } });
    if (!user?.isActive) throw new PolicyManagementError(401, 'Session no longer valid — please log in again');
    return work(tx, mode.userId, mode.userId);
  }, { timeout: 30_000 });
}

async function queueSignatureDeletion(tx: Tx, storageKey: string) {
  const job = await tx.podStorageDeletion.create({ data: { storageKey, storageNamespace: signatureStorageNamespace } });
  return job.id;
}

function drainAfterCommit(jobId: string | null) {
  if (jobId) void cleanSignatureStorageDeletions(jobId).catch(() => console.error('[Signature cleanup] Immediate cleanup failed; the retry worker will drain it'));
}

export type SignatureResult = { status: number; body: unknown };

/**
 * Upload or replace a signature. The quarantined upload is verified from its
 * bytes, saved under a server-generated key, then recorded transactionally.
 * The new file is compensated on failure; the temp file is always discarded.
 */
export async function saveUserSignature(mode: SignatureMode, upload: Express.Multer.File | undefined, imagePath: string): Promise<SignatureResult> {
  if (!upload) return { status: 400, body: { error: 'A signature image file is required.' } };
  let storageKey: string | undefined;
  try {
    const inspection = await inspectSignatureUpload(upload.path, upload.originalname);
    if ('error' in inspection) return { status: inspection.status ?? 400, body: { error: inspection.error } };
    if (mode.kind === 'admin') {
      // Refuse unknown targets before any external storage write.
      const target = await prisma.user.findUnique({ where: { id: mode.targetId }, select: { id: true } });
      if (!target) return { status: 404, body: { error: 'User not found' } };
    }
    const mimeType: SignatureMimeType = inspection.mimeType;
    storageKey = generateSignatureStorageKey(mimeType);
    // Store the canonical re-encoded bytes, never the raw upload (metadata stripped).
    await signatureStorage.save(storageKey, { buffer: inspection.buffer }, mimeType);
    const newKey = storageKey;
    const { saved, jobId } = await lockedSignatureTransaction(mode, async (tx, actorId, targetId) => {
      const prior = await tx.userSignature.findUnique({ where: { userId: targetId } });
      const data = { storageKey: newKey, mimeType, size: inspection.size, width: inspection.width, height: inspection.height, uploadedById: actorId };
      const saved = await tx.userSignature.upsert({ where: { userId: targetId }, create: { userId: targetId, ...data }, update: data });
      const jobId = prior ? await queueSignatureDeletion(tx, prior.storageKey) : null;
      await tx.auditLog.create({ data: {
        recordId: targetId, recordType: 'User', action: 'UPDATE', changedById: actorId,
        previousValue: JSON.stringify(auditState(prior)), newValue: JSON.stringify(auditState(saved)),
      } });
      return { saved, jobId };
    });
    storageKey = undefined;
    drainAfterCommit(jobId);
    return { status: 200, body: serializeSignatureMeta(saved, imagePath) };
  } catch (error) {
    if (storageKey) await signatureStorage.remove(storageKey).catch(cleanupError => {
      console.error('[Signature] Failed to clean up storage after metadata failure', cleanupError);
    });
    throw error;
  } finally {
    await discardUpload(upload.path);
  }
}

/** Remove a signature: row delete + durable file deletion job + audit, atomically. */
export async function deleteUserSignature(mode: SignatureMode): Promise<SignatureResult> {
  const jobId = await lockedSignatureTransaction(mode, async (tx, actorId, targetId) => {
    const prior = await tx.userSignature.findUnique({ where: { userId: targetId } });
    if (!prior) return null;
    const id = await queueSignatureDeletion(tx, prior.storageKey);
    await tx.userSignature.delete({ where: { userId: targetId } });
    await tx.auditLog.create({ data: {
      recordId: targetId, recordType: 'User', action: 'UPDATE', changedById: actorId,
      previousValue: JSON.stringify(auditState(prior)), newValue: JSON.stringify(auditState(null)),
    } });
    return id;
  });
  if (!jobId) return { status: 404, body: { error: 'No digital signature is on file.' } };
  drainAfterCommit(jobId);
  return { status: 204, body: null };
}

/** Queue a user's signature file for deletion inside an account-deletion transaction. */
export async function queueSignatureDeletionForUser(tx: Tx, userId: string): Promise<string | null> {
  const signature = await tx.userSignature.findUnique({ where: { userId }, select: { storageKey: true } });
  return signature ? queueSignatureDeletion(tx, signature.storageKey) : null;
}
export { drainAfterCommit as drainSignatureDeletion };

export const PRIVATE_IMAGE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

/**
 * Stream a stored signature with private, non-cacheable headers. Calls
 * `onMissing` (default 404) when the backing file cannot be opened.
 */
export async function streamSignatureImage(res: Response, signature: Pick<UserSignature, 'storageKey' | 'mimeType' | 'size' | 'width' | 'height'>,
  onMissing: () => void = () => { res.status(404).json({ error: 'Signature image not found' }); }) {
  let content;
  try {
    content = await signatureStorage.open(signature.storageKey);
  } catch {
    return onMissing();
  }
  for (const [name, value] of Object.entries(PRIVATE_IMAGE_HEADERS)) res.setHeader(name, value);
  res.setHeader('Content-Type', signature.mimeType);
  res.setHeader('Content-Length', String(signature.size));
  res.setHeader('Content-Disposition', `inline; filename="signature.${signature.mimeType === 'image/png' ? 'png' : 'jpg'}"`);
  if (signature.width) res.setHeader('X-Signature-Width', String(signature.width));
  if (signature.height) res.setHeader('X-Signature-Height', String(signature.height));
  try {
    await pipeline(content, res);
  } catch (error) {
    if (!res.headersSent) onMissing();
    else console.error('[Signature] Failed to stream signature image', error);
  }
}

export function sendNoSignature(res: Response) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Signature-Status', 'none');
  res.status(204).end();
}
