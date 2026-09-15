import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';

const ALL_SCREENS = [
  'main', 'dashboard', 'deliveries', 'rma', 'accounting_collection',
  'procurement_pickup', 'sales_orders', 'customers', 'suppliers',
  'driver', 'calendar', 'driver_board', 'am_directory',
  'transactions', 'inventory', 'data_sampler', 'admin', 'status_history'
];

const router = Router();

// User management — ADMIN only.
router.get('/', requireAuth, requireRole('ADMIN'), async (_req: Request, res: Response) => {
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
router.post('/', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
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
router.patch('/:id', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, email, role } = req.body ?? {};

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const validRoles = ['SALES_COORDINATOR', 'LOGISTICS', 'TASS', 'ADMIN', 'DRIVER'];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
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
router.patch('/:id/deactivate', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
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
router.patch('/:id/activate', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
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

// GET /users/:id/permissions — ADMIN only
router.get('/:id/permissions', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const perms = await prisma.userPermission.findMany({ where: { userId: id } });
  res.json({
    userId: id,
    permissions: perms.map(p => ({ screen: p.screen, granted: p.granted }))
  });
});

// PUT /users/:id/permissions — ADMIN only. Full replacement.
router.put('/:id/permissions', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { permissions } = req.body ?? {};

  if (!Array.isArray(permissions)) {
    return res.status(400).json({ error: 'permissions must be an array' });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  // Validate all screen values
  const unknownScreens = (permissions as any[]).filter(p => !ALL_SCREENS.includes(p.screen));
  if (unknownScreens.length > 0) {
    return res.status(400).json({ error: `Unknown screen(s): ${unknownScreens.map((p: any) => p.screen).join(', ')}` });
  }

  // Admin role: ignore any attempt to revoke the 'admin' screen
  const filtered = (permissions as { screen: string; granted: boolean }[]).filter(p => {
    if (user.role === 'ADMIN' && p.screen === 'admin' && !p.granted) return false;
    return true;
  });

  const submittedScreens = filtered.map(p => p.screen);

  // Delete all existing permissions not in the submitted list
  await prisma.userPermission.deleteMany({
    where: { userId: id, screen: { notIn: submittedScreens } }
  });

  // Upsert each submitted permission
  for (const p of filtered) {
    await prisma.userPermission.upsert({
      where: { userId_screen: { userId: id, screen: p.screen } },
      update: { granted: p.granted },
      create: { userId: id, screen: p.screen, granted: p.granted }
    });
  }

  const updated = await prisma.userPermission.findMany({ where: { userId: id } });
  res.json({
    userId: id,
    permissions: updated.map(p => ({ screen: p.screen, granted: p.granted }))
  });
});

export default router;
