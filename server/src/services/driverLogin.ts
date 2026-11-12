import type { Prisma } from '@prisma/client';
import { lockDriverDirectory } from './driverDirectory';

// Admin-only linking between DRIVER logins and Driver profiles (TSK-100).
// Every link change runs under the directory lock and is audited on the profile.

type Actor = { id: string; name: string };
type Tx = Prisma.TransactionClient;

export class DriverLinkError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

async function auditLink(tx: Tx, profileId: string, actor: Actor, previousUserId: string | null, nextUserId: string | null) {
  await tx.auditLog.create({ data: {
    recordId: profileId, recordType: 'Driver', action: nextUserId ? 'LINK_LOGIN' : 'UNLINK_LOGIN', changedById: actor.id,
    previousValue: JSON.stringify({ userId: previousUserId }), newValue: JSON.stringify({ userId: nextUserId }),
  } });
}

async function unlinkUser(tx: Tx, userId: string, actor: Actor) {
  const current = await tx.driver.findUnique({ where: { userId } });
  if (!current) return;
  await tx.driver.update({ where: { id: current.id }, data: { userId: null, modifiedBy: actor.name } });
  await auditLink(tx, current.id, actor, userId, null);
}

// Links `profileId` to the DRIVER login, or creates a profile named after the
// login when profileId is omitted. Never links by matching names: an existing
// profile with the same name must be chosen explicitly.
export async function linkDriverLogin(tx: Tx, user: { id: string; name: string; role: string }, profileId: string | null | undefined, actor: Actor) {
  await lockDriverDirectory(tx);
  if (user.role !== 'DRIVER') throw new DriverLinkError('Only DRIVER logins can be linked to a Driver profile.');
  if (profileId === null) {
    await unlinkUser(tx, user.id, actor);
    return null;
  }
  if (profileId === undefined) {
    const sameName = await tx.driver.findFirst({ where: { name: { equals: user.name.trim(), mode: 'insensitive' }, type: 'DRIVER' } });
    if (sameName) throw new DriverLinkError(`A Driver profile named "${sameName.name}" already exists. Select it to link this login, or use a different name.`, 409);
    await unlinkUser(tx, user.id, actor);
    const created = await tx.driver.create({ data: {
      name: user.name.trim(), type: 'DRIVER', coverageAreas: '[]', isActive: true, userId: user.id,
      createdBy: actor.name, modifiedBy: actor.name,
    } });
    await tx.auditLog.create({ data: {
      recordId: created.id, recordType: 'Driver', action: 'CREATE', changedById: actor.id, newValue: JSON.stringify(created),
    } });
    await auditLink(tx, created.id, actor, null, user.id);
    return created;
  }
  const profile = await tx.driver.findUnique({ where: { id: profileId } });
  if (!profile || profile.type !== 'DRIVER') throw new DriverLinkError('Choose a Driver profile from the directory.');
  if (profile.userId === user.id) return profile;
  if (profile.userId) throw new DriverLinkError('This Driver profile is already linked to another login. Unlink it first.', 409);
  await unlinkUser(tx, user.id, actor);
  const linked = await tx.driver.update({ where: { id: profile.id }, data: { userId: user.id, modifiedBy: actor.name } });
  await auditLink(tx, profile.id, actor, null, user.id);
  return linked;
}

// Used when Admin changes a login away from DRIVER: it must stop owning runs.
export async function unlinkDriverLogin(tx: Tx, userId: string, actor: Actor) {
  await lockDriverDirectory(tx);
  await unlinkUser(tx, userId, actor);
}
