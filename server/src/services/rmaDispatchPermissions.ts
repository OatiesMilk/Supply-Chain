import type { PrismaClient, Prisma } from '@prisma/client';
import { defaultRolePermissions, type PolicyRole } from './permissionCatalog';
import { evaluatePermissions } from './permissionEvaluator';

export const RMA_DISPATCH_GRANTS: Partial<Record<PolicyRole, readonly string[]>> = {
  LOGISTICS: ['SCREEN:rma:WRITE', 'CATEGORY:RMA:WRITE', 'CATEGORY:RMA:ASSIGN'],
  DRIVER: ['CATEGORY:RMA:READ', 'CATEGORY:RMA:WRITE', 'CATEGORY:RMA:STATUS', 'CATEGORY:RMA:POD', 'CATEGORY:RMA:COMMENT'],
};
/** Separate explicit switch (RMA Logistics transport): Logistics may start and
 * complete transport for the assigned driver. Never part of the frozen baseline. */
export const RMA_LOGISTICS_TRANSPORT_GRANTS: readonly string[] = ['CATEGORY:RMA:STATUS', 'CATEGORY:RMA:POD'];
export const RMA_LOGISTICS_TRANSPORT_SOURCE = 'RMA_LOGISTICS_TRANSPORT';
export function dispatchRolePermissions(role: PolicyRole) {
  const permissions = defaultRolePermissions(role);
  for (const key of RMA_DISPATCH_GRANTS[role] ?? []) permissions.set(key, 'ALLOW');
  return permissions;
}
/** Explicit rollout, separate from the frozen no-expansion permission backfill.
 * Custom role policies and every individual override remain untouched. */
export async function provisionRmaDispatchPermissions(db: PrismaClient, actorId?: string) {
  if (!actorId) throw new Error('An identified active Admin must activate RMA dispatch permissions.');
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(243, 1)`;
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, isActive: true } });
    if (!actor?.isActive || actor.role !== 'ADMIN') throw new Error('Only an active Admin can activate RMA dispatch permissions.');
    const upgraded: string[] = [], skipped: string[] = [];
    for (const role of ['LOGISTICS', 'DRIVER'] as const) {
      const policy = await tx.rolePolicy.findUnique({ where: { role }, include: { permissions: true } });
      const baseline = defaultRolePermissions(role), desired = dispatchRolePermissions(role);
      const matches = (expected: Map<string, string>) => !!policy && policy.catalogVersion === 1
        && policy.permissions.length === expected.size && policy.permissions.every(row => expected.get(row.permissionKey) === row.effect);
      if (matches(desired)) continue;
      // A revision beyond the untouched baseline may intentionally repeat DENY.
      // The foundation's row triggers increment once per inserted catalog row.
      const baselineRevision = BigInt(baseline.size + 1);
      if (!matches(baseline) || policy!.revision !== baselineRevision) { skipped.push(role); continue; }
      for (const permissionKey of RMA_DISPATCH_GRANTS[role]!) await tx.rolePermission.update({
        where: { role_permissionKey: { role, permissionKey } }, data: { effect: 'ALLOW' },
      });
      const committedPolicy = await tx.rolePolicy.findUniqueOrThrow({ where: { role }, select: { revision: true } });
      await tx.auditLog.create({ data: {
        recordId: role, recordType: 'RolePolicy', action: 'UPDATE', changedById: actorId,
        previousValue: JSON.stringify({ source: 'RMA_DISPATCH_255', revision: policy!.revision.toString(), permissions: [...baseline] }),
        newValue: JSON.stringify({ source: 'RMA_DISPATCH_255', revision: committedPolicy.revision.toString(), permissions: [...desired] }),
      } });
      upgraded.push(role);
    }
    return { upgraded, skipped };
  });
}

/** Read inside the caller's write transaction so revocations are current. */
export async function readRmaPermissions(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: {
    id: true, role: true, isActive: true, authorizationRevision: true,
    permissionOverrides: { select: { userId: true, permissionKey: true, effect: true } },
    driverProfile: { select: { id: true, type: true, isActive: true } },
  } });
  if (!user) return null;
  const rolePolicy = await tx.rolePolicy.findUnique({ where: { role: user.role }, include: { permissions: true } });
  return evaluatePermissions({ userId, role: user.role, isActive: user.isActive,
    authorizationRevision: user.authorizationRevision, overrides: user.permissionOverrides,
    driverProfile: user.driverProfile, rolePolicy });
}

export type RmaLogisticsTransportMode = 'dry-run' | 'apply' | 'revoke';
export type RmaLogisticsTransportResult = {
  mode: RmaLogisticsTransportMode;
  status: 'changed' | 'unchanged' | 'skipped' | 'would-change';
  revision?: string;
  rows: Array<{ permissionKey: string; from: string | undefined; to: string }>;
  reason?: string;
};

const parseAudit = (value: string | null) => { try { return JSON.parse(value ?? '') as { source?: string; revision?: string }; } catch { return {}; } };

/** Dry run by default. `apply` turns Logistics STATUS and POD on RMA to ALLOW,
 * `revoke` puts them back to DENY. Only a Logistics policy that exactly matches
 * the state this script (or the #255 activation) last recorded is touched, so a
 * customized policy is skipped for an Admin to review. User overrides are never
 * read or changed. */
export async function provisionRmaLogisticsTransport(db: PrismaClient, actorId: string | undefined, mode: RmaLogisticsTransportMode = 'dry-run'): Promise<RmaLogisticsTransportResult> {
  if (!actorId) throw new Error('An identified active Admin must run the RMA Logistics transport switch.');
  const role = 'LOGISTICS' as const;
  const dispatch = dispatchRolePermissions(role);
  const transport = new Map(dispatch);
  for (const key of RMA_LOGISTICS_TRANSPORT_GRANTS) transport.set(key, 'ALLOW');
  const target = mode === 'revoke' ? dispatch : transport;
  const run = async (tx: Prisma.TransactionClient): Promise<RmaLogisticsTransportResult> => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(243, 1)`;
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true, isActive: true } });
    if (!actor?.isActive || actor.role !== 'ADMIN') throw new Error('Only an active Admin can run the RMA Logistics transport switch.');
    const policy = await tx.rolePolicy.findUnique({ where: { role }, include: { permissions: true } });
    const rows = RMA_LOGISTICS_TRANSPORT_GRANTS.map(permissionKey => ({
      permissionKey, from: policy?.permissions.find(r => r.permissionKey === permissionKey)?.effect as string | undefined,
      to: mode === 'revoke' ? 'DENY' : 'ALLOW',
    }));
    const matches = (expected: Map<string, string>) => !!policy && policy.catalogVersion === 1
      && policy.permissions.length === expected.size && policy.permissions.every(row => expected.get(row.permissionKey) === row.effect);
    const done = { mode, rows: [] as RmaLogisticsTransportResult['rows'], revision: policy?.revision.toString() };
    if (matches(target)) return { ...done, status: 'unchanged' };
    const from = mode === 'revoke' ? transport : dispatch;
    if (!matches(from)) return { ...done, rows, status: 'skipped', reason: 'Logistics policy differs from the expected set; an Admin must review it.' };
    // The policy must still be at the revision recorded by the audit entry that produced this state.
    const audits = await tx.auditLog.findMany({ where: { recordId: role, recordType: 'RolePolicy' }, orderBy: { timestamp: 'desc' }, select: { newValue: true } });
    const expectedSources = mode === 'revoke' ? [RMA_LOGISTICS_TRANSPORT_SOURCE] : ['RMA_DISPATCH_255', RMA_LOGISTICS_TRANSPORT_SOURCE];
    const last = audits.map(a => parseAudit(a.newValue)).find(a => a.source && expectedSources.includes(a.source));
    if (!last || last.revision !== policy!.revision.toString()) return { ...done, rows, status: 'skipped', reason: 'Logistics policy revision differs from the recorded activation; an Admin must review it.' };
    if (mode === 'dry-run') return { ...done, rows, status: 'would-change' };
    for (const permissionKey of RMA_LOGISTICS_TRANSPORT_GRANTS) await tx.rolePermission.update({
      where: { role_permissionKey: { role, permissionKey } }, data: { effect: mode === 'revoke' ? 'DENY' : 'ALLOW' },
    });
    const committed = await tx.rolePolicy.findUniqueOrThrow({ where: { role }, select: { revision: true } });
    await tx.auditLog.create({ data: {
      recordId: role, recordType: 'RolePolicy', action: 'UPDATE', changedById: actorId,
      previousValue: JSON.stringify({ source: RMA_LOGISTICS_TRANSPORT_SOURCE, revision: policy!.revision.toString(), permissions: [...from] }),
      newValue: JSON.stringify({ source: RMA_LOGISTICS_TRANSPORT_SOURCE, revision: committed.revision.toString(), permissions: [...target] }),
    } });
    return { ...done, rows, status: 'changed', revision: committed.revision.toString() };
  };
  return db.$transaction(run);
}
