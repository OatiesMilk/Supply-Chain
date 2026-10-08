import { Router } from 'express';
import { prisma } from '../db';
import { requireScreen, requireResource, requireAuth, requireRole } from '../middleware/auth';
import { canonicalCoverageList, createDriverDirectory, DriverConflictError, driverInputError, parseCoverageAreas, readDriverDirectory, updateDriverDirectory } from '../services/driverDirectory';

import { asyncRoute } from '../middleware/asyncRoute';
import type { Request, Response } from 'express';

const router = Router();
const driverRoute = (handler: (req: Request, res: Response) => Promise<unknown>) => asyncRoute(async (req, res) => {
  try { return await handler(req, res); }
  catch (error) {
    if (error instanceof DriverConflictError) return res.status(409).json({ error: error.message });
    throw error;
  }
});

// Everyone with roster access sees whether a profile has a login; only Admin
// sees which account it is.
function serialize(d: any, isAdmin = false) {
  return {
    id: d.id,
    name: d.name,
    type: d.type,
    coverage_areas: parseCoverageAreas(d.coverageAreas || '[]'),
    is_active: d.isActive,
    is_linked: !!d.userId,
    ...(isAdmin && { linked_user: d.user ? { id: d.user.id, name: d.user.name, email: d.user.email } : null }),
    created_by: d.createdBy,
    created_at: d.createdAt,
    modified_by: d.modifiedBy,
    modified_at: d.modifiedAt,
  };
}

// Login identities are linked only by Admin through /api/users, never through
// the roster, so Logistics cannot create or move a Driver login link.
function linkingFieldError(req: Request, res: Response) {
  if (!req.body || !['user_id', 'userId', 'linked_user_id'].some(key => key in req.body)) return false;
  res.status(req.user!.role === 'ADMIN' ? 400 : 403).json({ error: 'Driver logins are linked by Admin in Admin Panel → Users.' });
  return true;
}

// Reads never seed or import the roster.
router.get('/', requireAuth, requireResource('drivers'), driverRoute(async (req, res) => {
  const drivers = await readDriverDirectory(prisma, req.query.all === '1');
  res.json(drivers.map(d => serialize(d, req.user!.role === 'ADMIN')));
}));

// Create a driver — Logistics + Admin only
router.post('/', requireAuth, requireResource('drivers'), requireScreen('driver_manager'), requireRole('LOGISTICS', 'ADMIN'), driverRoute(async (req, res) => {
  if (linkingFieldError(req, res)) return;
  const { name, type, coverage_areas } = req.body ?? {};
  const invalid = driverInputError(req.body ?? {}, true);
  if (invalid) return res.status(400).json({ error: invalid });
  const created = await createDriverDirectory(prisma, {
    name: name.trim(), type: type ?? 'DRIVER',
    coverageAreas: JSON.stringify(canonicalCoverageList(coverage_areas ?? [])),
    createdBy: req.user!.name, modifiedBy: req.user!.name,
  }, req.user!);
  res.status(201).json(serialize(created, req.user!.role === 'ADMIN'));
}));

// Update a driver — Logistics + Admin only
router.put('/:id', requireAuth, requireResource('drivers'), requireScreen('driver_manager'), requireRole('LOGISTICS', 'ADMIN'), driverRoute(async (req, res) => {
  if (linkingFieldError(req, res)) return;
  const { name, type, coverage_areas, is_active } = req.body ?? {};
  const invalid = driverInputError(req.body ?? {});
  if (invalid) return res.status(400).json({ error: invalid });
  const updated = await updateDriverDirectory(prisma, req.params.id, {
      ...(name !== undefined && { name: name.trim() }),
      ...(type !== undefined && { type: type === 'ASSISTANT' ? 'ASSISTANT' : 'DRIVER' }),
      ...(coverage_areas !== undefined && { coverageAreas: JSON.stringify(canonicalCoverageList(coverage_areas)) }),
      ...(is_active !== undefined && { isActive: is_active }),
    }, req.user!);
  if (!updated) return res.status(404).json({ error: 'Driver not found' });
  res.json(serialize(updated, req.user!.role === 'ADMIN'));
}));

// Deactivate a driver — Logistics + Admin only
router.delete('/:id', requireAuth, requireResource('drivers'), requireScreen('driver_manager'), requireRole('LOGISTICS', 'ADMIN'), driverRoute(async (req, res) => {
  const updated = await updateDriverDirectory(prisma, req.params.id, { isActive: false }, req.user!, true);
  if (!updated) return res.status(404).json({ error: 'Driver not found' });
  res.status(204).end();
}));

export default router;
