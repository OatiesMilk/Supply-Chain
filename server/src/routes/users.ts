import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { requireResource, requireAuth, requireRole } from '../middleware/auth';

import { asyncRoute } from '../middleware/asyncRoute';
import { permissionEditor, permissionInputError, PermissionSaveError, replacePermissions } from '../services/permissions';

const router = Router();

// User management — ADMIN only.
router.get('/', requireAuth, requireResource('users'), requireRole('ADMIN'), async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({ orderBy: { name: 'asc' } });
  res.json(users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    is_active: u.isActive,
    microsoft_linked: !!u.microsoftOid,
    created_at: u.createdAt
  })));
});

// Create user — ADMIN only.
router.post('/', requireAuth, requireResource('users'), requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { name, email, password, role } = req.body ?? {};
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password, and role are required' });
  }
  const validRoles = ['SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'ADMIN', 'DRIVER'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
  }
  const hashed = await bcrypt.hash(password, 10);
  const created = await prisma.user.create({
    data: { name, email: String(email).toLowerCase(), password: hashed, role, isActive: true }
  });
  res.status(201).json({
    id: created.id,
    name: created.name,
    email: created.email,
    role: created.role,
    is_active: created.isActive,
    microsoft_linked: false,
    created_at: created.createdAt,
  });
});

// Update user details — ADMIN only.
router.patch('/:id', requireAuth, requireResource('users'), requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, email, role } = req.body ?? {};

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const validRoles = ['SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'ADMIN', 'DRIVER'];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
  }
  if (role && role !== 'ADMIN' && req.user!.id === id) {
    return res.status(400).json({ error: 'You cannot change your own admin role. Another admin must perform this action to prevent self-lockout.' });
  }

  const data: Record<string, unknown> = {};
  if (name) data.name = name;
  if (email) data.email = String(email).toLowerCase();
  if (role) data.role = role;

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'At least one field (name, email, role) is required' });
  }

  const updated = await prisma.user.update({ where: { id }, data });
  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    is_active: updated.isActive,
    microsoft_linked: !!updated.microsoftOid,
    created_at: updated.createdAt,
  });
});

// Soft-deactivate a user — ADMIN only. Deactivated users cannot log in.
router.patch('/:id/deactivate', requireAuth, requireResource('users'), requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { id } = req.params;

  // Prevent an admin from deactivating themselves
  if (req.user!.id === id) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!user.isActive) return res.status(400).json({ error: 'User is already deactivated' });

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive: false }
  });

  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    is_active: updated.isActive,
    microsoft_linked: !!updated.microsoftOid,
    created_at: updated.createdAt,
  });
});

// Reactivate a user — ADMIN only.
router.patch('/:id/activate', requireAuth, requireResource('users'), requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.isActive) return res.status(400).json({ error: 'User is already active' });

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive: true }
  });

  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    is_active: updated.isActive,
    microsoft_linked: !!updated.microsoftOid,
    created_at: updated.createdAt,
  });
});

// Hard-delete a user — ADMIN only. Only allowed if the user has no associated
// business records (deliveries, audit entries, products, customers, suppliers,
// comments, or remark logs). If the user has any of these, the admin should
// deactivate instead to preserve data integrity and audit trails.
router.delete('/:id', requireAuth, requireResource('users'), requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { id } = req.params;

  // Prevent an admin from deleting themselves
  if (req.user!.id === id) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: 'User not found' });

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
    prisma.deliveryRecord.count({ where: { createdById: id } }),
    prisma.deliveryRecord.count({ where: { modifiedById: id } }),
    prisma.auditLog.count({ where: { changedById: id } }),
    prisma.product.count({ where: { createdById: id } }),
    prisma.product.count({ where: { modifiedById: id } }),
    prisma.customer.count({ where: { createdById: id } }),
    prisma.customer.count({ where: { modifiedById: id } }),
    prisma.supplier.count({ where: { createdById: id } }),
    prisma.supplier.count({ where: { modifiedById: id } }),
    prisma.comment.count({ where: { authorId: id } }),
    prisma.remarkLog.count({ where: { authorId: id } }),
  ]);

  const totalLinked = createdRecords + modifiedRecords + auditEntries
    + createdProducts + modifiedProducts + createdCustomers + modifiedCustomers
    + createdSuppliers + modifiedSuppliers + comments + remarkLogs;

  if (totalLinked > 0) {
    return res.status(409).json({
      error: `Cannot delete this user because they have ${totalLinked} associated record(s) in the system (delivery records, audit logs, products, etc.). Deactivate the account instead to preserve data integrity.`,
      linked_records: totalLinked,
    });
  }

  // Safe to delete — clean up owned non-business data first, then remove the user
  await prisma.userPermission.deleteMany({ where: { userId: id } });
  await prisma.notification.deleteMany({ where: { userId: id } });
  await prisma.user.delete({ where: { id } });

  res.json({ ok: true, deleted_id: id });
});

// The editor and login consume the same policy, including locked modules.
router.get('/:id/permissions', requireAuth, requireResource('users'), requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { permissions: true } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(permissionEditor(user));
}));

router.put('/:id/permissions', requireAuth, requireResource('users'), requireRole('ADMIN'), asyncRoute(async (req, res) => {
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

export default router;
