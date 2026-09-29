import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { createDriverDirectory, DriverConflictError, driverInputError, parseCoverageAreas, readDriverDirectory, updateDriverDirectory } from '../services/driverDirectory';

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

function serialize(d: any) {
  return {
    id: d.id,
    name: d.name,
    type: d.type,
    coverage_areas: parseCoverageAreas(d.coverageAreas || '[]'),
    is_active: d.isActive,
    created_by: d.createdBy,
    created_at: d.createdAt,
    modified_by: d.modifiedBy,
    modified_at: d.modifiedAt,
  };
}

// Reads never seed or import the roster.
router.get('/', requireAuth, driverRoute(async (req, res) => {
  const drivers = await readDriverDirectory(prisma, req.query.all === '1');
  res.json(drivers.map(serialize));
}));

// Create a driver — Logistics + Admin only
router.post('/', requireAuth, requireRole('LOGISTICS', 'ADMIN'), driverRoute(async (req, res) => {
  const { name, type, coverage_areas } = req.body ?? {};
  const invalid = driverInputError(req.body ?? {}, true);
  if (invalid) return res.status(400).json({ error: invalid });
  const created = await createDriverDirectory(prisma, {
    name: name.trim(), type: type ?? 'DRIVER',
    coverageAreas: JSON.stringify(coverage_areas ?? []),
    createdBy: req.user!.name, modifiedBy: req.user!.name,
  }, req.user!);
  res.status(201).json(serialize(created));
}));

// Update a driver — Logistics + Admin only
router.put('/:id', requireAuth, requireRole('LOGISTICS', 'ADMIN'), driverRoute(async (req, res) => {
  const { name, type, coverage_areas, is_active } = req.body ?? {};
  const invalid = driverInputError(req.body ?? {});
  if (invalid) return res.status(400).json({ error: invalid });
  const updated = await updateDriverDirectory(prisma, req.params.id, {
      ...(name !== undefined && { name: name.trim() }),
      ...(type !== undefined && { type: type === 'ASSISTANT' ? 'ASSISTANT' : 'DRIVER' }),
      ...(coverage_areas !== undefined && { coverageAreas: JSON.stringify(coverage_areas) }),
      ...(is_active !== undefined && { isActive: is_active }),
    }, req.user!);
  if (!updated) return res.status(404).json({ error: 'Driver not found' });
  res.json(serialize(updated));
}));

// Deactivate a driver — Logistics + Admin only
router.delete('/:id', requireAuth, requireRole('LOGISTICS', 'ADMIN'), driverRoute(async (req, res) => {
  const updated = await updateDriverDirectory(prisma, req.params.id, { isActive: false }, req.user!, true);
  if (!updated) return res.status(404).json({ error: 'Driver not found' });
  res.status(204).end();
}));

export default router;
