import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { requireResource, requireAuth, requireRole } from '../middleware/auth';

import { DriverLinkError, linkDriverLogin, unlinkDriverLogin } from '../services/driverLogin';
import { permissionEditor, permissionInputError, PermissionSaveError, replacePermissions } from '../services/permissions';
import { isMicrosoftGuid } from '../services/ssoState';
import { accountMetadataVersion, assertAdminSurvives, administrativeTransaction, getUserPermissionEditor, mutateAdminAccount, permissionMode, PolicyManagementError, requireV1Mutation, saveUserPermissions } from '../services/permissionManagement';
import { policyRoute } from '../middleware/policyRoute';
import { planPermissionConversion } from '../services/permissionBackfill';

const router = Router();

function accountBodyError(value: unknown, fields: readonly string[]): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(k => ![...fields, 'contractVersion', 'expectedVersion'].includes(k))) return 'Unknown or malformed account fields';
  const body = value as Record<string, unknown>;
  if (body.contractVersion !== undefined && body.contractVersion !== 1) return 'Unsupported account contractVersion';
  if (body.expectedVersion !== undefined && (typeof body.expectedVersion !== 'string' || !/^v1:[a-f0-9]{64}$/.test(body.expectedVersion))) return 'Malformed account expectedVersion';
  return null;
}

// User management — ADMIN only.
router.get('/', requireAuth, requireResource('users'), requireRole('ADMIN'), async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({ orderBy: { name: 'asc' }, include: { driverProfile: { select: { id: true, name: true } } } });
  res.json(users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    is_active: u.isActive,
    microsoft_linked: !!u.microsoftOid,
    metadata_version: accountMetadataVersion(u),
    created_at: u.createdAt,
    driver_profile: u.driverProfile,
  })));
});

// Create user — ADMIN only. A DRIVER login is linked to a Driver profile in the
// same transaction: `driver_profile_id` links an existing unlinked profile,
// omitting it creates a new profile named after the login.
router.post('/', requireAuth, requireResource('users', 'CREATE'), requireRole('ADMIN'), policyRoute(async (req: Request, res: Response) => {
  const bodyError = accountBodyError(req.body, ['name', 'email', 'password', 'role', 'driver_profile_id', 'microsoft_oid']);
  if (bodyError) return res.status(400).json({ error: bodyError });
  if (req.body.contractVersion === 1) requireV1Mutation();
  const { name, email, password, role, driver_profile_id, microsoft_oid } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    || typeof password !== 'string' || !password.trim() || typeof role !== 'string') {
    return res.status(400).json({ error: 'A non-empty name and password, valid email, and built-in role are required' });
  }
  const validRoles = ['SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'ADMIN', 'DRIVER'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
  }
  if (driver_profile_id !== undefined && (role !== 'DRIVER' || typeof driver_profile_id !== 'string' || !driver_profile_id)) {
    return res.status(400).json({ error: 'driver_profile_id is only valid for a DRIVER login and must be a Driver profile id.' });
  }
  if (microsoft_oid !== undefined && !isMicrosoftGuid(microsoft_oid)) {
    return res.status(400).json({ error: 'microsoft_oid must be a Microsoft Entra object GUID' });
  }
  const microsoftOid = microsoft_oid?.toLowerCase();
  const hashed = await bcrypt.hash(password, 10);
  try {
    const { created, profile } = await administrativeTransaction(prisma, req.user!.id, null, async (tx, actor) => {
      const created = await tx.user.create({
        data: {
          name: name.trim(), email: email.trim().toLowerCase(), password: hashed, role, isActive: true,
          ...(microsoftOid ? { microsoftOid, microsoftApprovedAt: new Date() } : {}),
        }
      });
      if (microsoftOid) {
        await tx.auditLog.create({
          data: {
            recordId: created.id, recordType: 'User', action: 'CREATE',
            changedById: req.user!.id,
            previousValue: null,
            newValue: JSON.stringify({ microsoft_linked: true, microsoft_oid: created.microsoftOid, approved_at: created.microsoftApprovedAt }),
          },
        });
      }
      const profile = role === 'DRIVER' ? await linkDriverLogin(tx, created, driver_profile_id, actor) : null;
      if (permissionMode() === 'V1') {
        const conversion = planPermissionConversion({ id: created.id, role: created.role, permissions: [], driverProfile: profile });
        await tx.permissionConversion.create({ data: { userId: created.id, catalogVersion: 1, sourceHash: conversion.sourceHash, report: conversion.report } });
      }
      await tx.auditLog.create({ data: { recordId: created.id, recordType: 'UserAuthorization', action: 'CREATE', changedById: actor.id,
        newValue: JSON.stringify({ name: created.name, email: created.email, role: created.role, isActive: created.isActive, authorizationRevision: String(created.authorizationRevision) }) } });
      return { created, profile };
    }, 'CREATE');
    res.status(201).json({
      id: created.id,
      name: created.name,
      email: created.email,
      role: created.role,
      is_active: created.isActive,
      microsoft_linked: !!created.microsoftOid,
      metadata_version: accountMetadataVersion(created),
      created_at: created.createdAt,
      driver_profile: profile ? { id: profile.id, name: profile.name } : null,
    });
  } catch (error) {
    if (error instanceof DriverLinkError) return res.status(error.status).json({ error: error.message });
    if ((error as { code?: string })?.code === 'P2002') {
      // Prisma's PostgreSQL adapter reports the constraint under its cause;
      // other engines report a target field list or index name directly.
      const meta = (error as { meta?: { target?: unknown; driverAdapterError?: { cause?: { constraint?: { fields?: unknown; index?: unknown } } } } }).meta;
      const constraint = meta?.driverAdapterError?.cause?.constraint;
      const target = meta?.target ?? constraint?.fields ?? constraint?.index;
      const identityCollision = Array.isArray(target) ? target.includes('microsoftOid') : typeof target === 'string' && target.includes('microsoftOid');
      return res.status(409).json({ error: identityCollision ? 'Microsoft identity is already linked to another account' : 'An account with this email already exists.' });
    }
    throw error;
  }
}));

// Link, relink or unlink a DRIVER login's Driver profile — ADMIN only.
// Body: { driver_profile_id: string | null }.
router.put('/:id/driver-profile', requireAuth, requireResource('users', 'UPDATE'), requireRole('ADMIN'), policyRoute(async (req: Request, res: Response) => {
  const bodyError = accountBodyError(req.body, ['driver_profile_id']);
  if (bodyError) return res.status(400).json({ error: bodyError });
  const profileId = req.body?.driver_profile_id;
  if (profileId !== null && (typeof profileId !== 'string' || !profileId)) {
    return res.status(400).json({ error: 'driver_profile_id must be a Driver profile id or null.' });
  }
  try {
    const profile = await mutateAdminAccount(prisma, req.user!.id, req.params.id, req.body, async (tx, actor, user) => {
      return linkDriverLogin(tx, user, profileId, actor);
    });
    res.json({ user_id: req.params.id, driver_profile: profile ? { id: profile.id, name: profile.name } : null });
  } catch (error) {
    if (error instanceof DriverLinkError) return res.status(error.status).json({ error: error.message });
    throw error;
  }
}));

// An Admin explicitly pre-provisions the tenant-scoped Microsoft object ID;
// never let SSO email claims implicitly take over an existing account.
// A null OID deliberately unlinks the identity; relinking is audited.
router.put('/:id/microsoft-identity', requireAuth, requireResource('users', 'UPDATE'), requireRole('ADMIN'), policyRoute(async (req: Request, res: Response) => {
  const bodyError = accountBodyError(req.body, ['microsoft_oid']);
  if (bodyError) return res.status(400).json({ error: bodyError });
  const oid = req.body?.microsoft_oid;
  if (oid !== null && !isMicrosoftGuid(oid)) {
    return res.status(400).json({ error: 'microsoft_oid must be a Microsoft Entra object GUID or null' });
  }
  try {
    const updated = await mutateAdminAccount(prisma, req.user!.id, req.params.id, req.body, async (tx, _actor, user) => {
      const result = await tx.user.update({
        where: { id: user.id },
        data: { microsoftOid: oid?.toLowerCase() ?? null, microsoftApprovedAt: oid ? new Date() : null }
      });
      await tx.auditLog.create({
        data: {
          recordId: user.id, recordType: 'User', action: 'UPDATE',
          changedById: req.user!.id,
          previousValue: JSON.stringify({ microsoft_linked: !!user.microsoftOid, microsoft_oid: user.microsoftOid, approved_at: user.microsoftApprovedAt }),
          newValue: JSON.stringify({ microsoft_linked: !!result.microsoftOid, microsoft_oid: result.microsoftOid, approved_at: result.microsoftApprovedAt })
        }
      });
      return result;
    }, { identity: true });
    if (!updated) return res.status(404).json({ error: 'User not found' });
    res.json({ user_id: updated.id, microsoft_linked: !!updated.microsoftOid });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return res.status(409).json({ error: 'Microsoft identity is already linked to another account' });
    throw error;
  }
}));

// Update user details — ADMIN only.
router.patch('/:id', requireAuth, requireResource('users', 'UPDATE'), requireRole('ADMIN'), policyRoute(async (req: Request, res: Response) => {
  const bodyError = accountBodyError(req.body, ['name', 'email', 'role', 'removedOverrideKeys', 'expectedMetadataVersion']);
  if (bodyError) return res.status(400).json({ error: bodyError });
  const { id } = req.params;
  const { name, email, role } = req.body ?? {};

  if (email !== undefined && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) return res.status(400).json({ error: 'Name must be non-empty text.' });
  const validRoles = ['SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'ADMIN', 'DRIVER'];
  if (role !== undefined && !validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
  }
  if (role && role !== 'ADMIN' && req.user!.id === id) {
    return res.status(400).json({ error: 'You cannot change your own admin role. Another admin must perform this action to prevent self-lockout.' });
  }

  const data: Record<string, unknown> = {};
  if (name) data.name = name.trim();
  if (email) data.email = String(email).trim().toLowerCase();
  if (role) data.role = role;

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'At least one field (name, email, role) is required' });
  }

  // A login that stops being a DRIVER also stops owning runs.
  let updated: Awaited<ReturnType<typeof prisma.user.update>>;
  if (req.body.removedOverrideKeys !== undefined && (!Array.isArray(req.body.removedOverrideKeys) || req.body.removedOverrideKeys.some((key: unknown) => typeof key !== 'string'))) {
    return res.status(400).json({ error: 'removedOverrideKeys must be an array of keys from the role-change preview' });
  }
  try {
    updated = await mutateAdminAccount(prisma, req.user!.id, id, req.body, async (tx, actor, user) => {
      await assertAdminSurvives(tx, actor.id, user, role ?? user.role, user.isActive);
      if (user.role === 'DRIVER' && role && role !== 'DRIVER') await unlinkDriverLogin(tx, id, actor);
      return tx.user.update({ where: { id }, data });
    }, { role, metadata: true, removedOverrideKeys: req.body.removedOverrideKeys, finish: async tx => {
      // Legacy conversion can advance authorizationRevision after the initial
      // account update. The response token must describe the final locked state.
      const final = await tx.user.findUnique({ where: { id } });
      if (!final) throw new Error('Updated account could not be loaded');
      return final;
    } });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return res.status(409).json({ error: 'An account with this email already exists.' });
    throw error;
  }
  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    is_active: updated.isActive,
    microsoft_linked: !!updated.microsoftOid,
    metadata_version: accountMetadataVersion(updated),
    created_at: updated.createdAt,
  });
}));

// Soft-deactivate a user — ADMIN only. Deactivated users cannot log in.
router.patch('/:id/deactivate', requireAuth, requireResource('users', 'UPDATE'), requireRole('ADMIN'), policyRoute(async (req: Request, res: Response) => {
  const bodyError = accountBodyError(req.body ?? {}, []);
  if (bodyError) return res.status(400).json({ error: bodyError });
  const { id } = req.params;

  // Prevent an admin from deactivating themselves
  if (req.user!.id === id) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }

  const updated = await mutateAdminAccount(prisma, req.user!.id, id, req.body, async (tx, actor, user) => {
    await assertAdminSurvives(tx, actor.id, user, user.role, false);
    if (!user.isActive) throw new PolicyManagementError(400, 'User is already deactivated');
    return tx.user.update({ where: { id }, data: { isActive: false } });
  });

  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    is_active: updated.isActive,
    microsoft_linked: !!updated.microsoftOid,
    metadata_version: accountMetadataVersion(updated),
    created_at: updated.createdAt,
  });
}));

// Reactivate a user — ADMIN only.
router.patch('/:id/activate', requireAuth, requireResource('users', 'UPDATE'), requireRole('ADMIN'), policyRoute(async (req: Request, res: Response) => {
  const bodyError = accountBodyError(req.body ?? {}, []);
  if (bodyError) return res.status(400).json({ error: bodyError });
  const { id } = req.params;
  const updated = await mutateAdminAccount(prisma, req.user!.id, id, req.body, async (tx, _actor, user) => {
    if (user.isActive) throw new PolicyManagementError(400, 'User is already active');
    return tx.user.update({ where: { id }, data: { isActive: true } });
  });

  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    is_active: updated.isActive,
    microsoft_linked: !!updated.microsoftOid,
    metadata_version: accountMetadataVersion(updated),
    created_at: updated.createdAt,
  });
}));

// Hard-delete a user — ADMIN only. Only allowed if the user has no associated
// business records (deliveries, audit entries, products, customers, suppliers,
// comments, or remark logs). If the user has any of these, the admin should
// deactivate instead to preserve data integrity and audit trails.
router.delete('/:id', requireAuth, requireResource('users', 'DELETE'), requireRole('ADMIN'), policyRoute(async (req: Request, res: Response) => {
  const bodyError = accountBodyError(req.body ?? {}, []);
  if (bodyError) return res.status(400).json({ error: bodyError });
  const { id } = req.params;

  // Prevent an admin from deleting themselves
  if (req.user!.id === id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  await mutateAdminAccount(prisma, req.user!.id, id, req.body, async (tx, actor, user) => {
  await assertAdminSurvives(tx, actor.id, user, user.role, false);

  // Check for associated business records that would make deletion unsafe
  const [
    createdRecords,
    modifiedRecords,
    auditEntries,
    createdProducts,
    modifiedProducts,
    createdCustomers,
    modifiedCustomers,
    createdSuppliers,
    modifiedSuppliers,
    comments,
    remarkLogs,
  ] = await Promise.all([
    tx.deliveryRecord.count({ where: { createdById: id } }),
    tx.deliveryRecord.count({ where: { modifiedById: id } }),
    tx.auditLog.count({ where: { changedById: id } }),
    tx.product.count({ where: { createdById: id } }),
    tx.product.count({ where: { modifiedById: id } }),
    tx.customer.count({ where: { createdById: id } }),
    tx.customer.count({ where: { modifiedById: id } }),
    tx.supplier.count({ where: { createdById: id } }),
    tx.supplier.count({ where: { modifiedById: id } }),
    tx.comment.count({ where: { authorId: id } }),
    tx.remarkLog.count({ where: { authorId: id } }),
  ]);

  const totalLinked = createdRecords + modifiedRecords + auditEntries
    + createdProducts + modifiedProducts + createdCustomers + modifiedCustomers
    + createdSuppliers + modifiedSuppliers + comments + remarkLogs;

  if (totalLinked > 0) {
    throw new PolicyManagementError(409, 'Cannot delete a user with business records; deactivate the account to retain history', { linked_records: totalLinked });
  }

  // Safe to delete — clean up owned non-business data first, then remove the user
  await tx.userPermission.deleteMany({ where: { userId: id } });
  await tx.notification.deleteMany({ where: { userId: id } });
  await tx.user.delete({ where: { id } });
  }, { action: 'DELETE' });

  res.json({ ok: true, deleted_id: id });
}));

// The editor and login consume the same policy, including locked modules.
router.get('/:id/permissions', requireAuth, requireResource('users'), requireRole('ADMIN'), policyRoute(async (req, res) => {
  if (req.query.contractVersion !== undefined && req.query.contractVersion !== '1') return res.status(400).json({ error: 'Unsupported editor contractVersion' });
  if (req.query.role !== undefined && typeof req.query.role !== 'string') return res.status(400).json({ error: 'role must be a built-in role' });
  if (req.query.contractVersion === '1' || permissionMode() === 'V1') {
    return res.json(await getUserPermissionEditor(prisma, req.user!.id, req.params.id, req.query.role as string | undefined));
  }
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { permissions: true } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(permissionEditor(user));
}));

router.put('/:id/permissions', requireAuth, requireResource('users', 'UPDATE'), requireRole('ADMIN'), policyRoute(async (req, res) => {
  if (req.body?.contractVersion !== undefined || permissionMode() === 'V1') {
    return res.json(await saveUserPermissions(prisma, req.user!.id, req.params.id, req.body));
  }
  if (Object.keys(req.body ?? {}).some(k => !['permissions', 'expectedVersion'].includes(k))) return res.status(400).json({ error: 'Unknown permission save fields' });
  const { permissions, expectedVersion } = req.body ?? {};
  const error = permissionInputError(permissions);
  if (error) return res.status(400).json({ error });
  if (typeof expectedVersion !== 'string') return res.status(400).json({ error: 'expectedVersion is required' });
  try {
    res.json(await replacePermissions(prisma, req.params.id, req.user!.id, permissions, expectedVersion));
  } catch (error) {
    if (error instanceof PermissionSaveError) return res.status(error.status).json({ error: error.message });
    throw error;
  }
}));

router.post('/:id/permissions/reset', requireAuth, requireResource('users', 'UPDATE'), requireRole('ADMIN'), policyRoute(async (req, res) => {
  res.json(await saveUserPermissions(prisma, req.user!.id, req.params.id, req.body, true));
}));

export default router;
