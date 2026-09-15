import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

const DEFAULT_SEED = [
  { name: 'Lando Navarro',     type: 'DRIVER',    areas: ['Makati', 'BGC', 'Taguig', 'Mandaluyong', 'San Juan', 'Pasig', 'Ortigas'] },
  { name: 'Manny Santos',      type: 'DRIVER',    areas: ['Quezon City', 'Marikina', 'Caloocan', 'Valenzuela', 'Malabon', 'Bulacan', 'Cainta', 'Antipolo'] },
  { name: 'Ronald de la Cruz', type: 'DRIVER',    areas: ['Manila', 'Parañaque', 'Pasay', 'Las Piñas', 'Muntinlupa', 'Cavite', 'Laguna', 'Batangas'] },
  { name: 'Jayson Reyes',      type: 'ASSISTANT', areas: [] },
  { name: 'Bong Alvarez',      type: 'ASSISTANT', areas: [] },
  { name: 'Ricky Mendoza',     type: 'ASSISTANT', areas: [] },
];

function serialize(d: any) {
  return {
    id: d.id,
    name: d.name,
    type: d.type,
    coverage_areas: JSON.parse(d.coverageAreas || '[]') as string[],
    is_active: d.isActive,
    created_by: d.createdBy,
    created_at: d.createdAt,
    modified_by: d.modifiedBy,
    modified_at: d.modifiedAt,
  };
}

// Scan delivery records for driver/assistant names not yet in the Driver table
// and auto-import them so the Driver Manager stays in sync with actual usage.
async function syncDriversFromRecords() {
  const managed = await prisma.driver.findMany({ select: { name: true } });
  const knownNames = new Set(managed.map(d => d.name));

  // Distinct driver names from delivery records
  const driverRows: { driver: string }[] = await prisma.deliveryRecord.findMany({
    where: { driver: { not: '' }, deletedAt: null },
    select: { driver: true },
    distinct: ['driver'],
  });

  // Distinct assistant names (stored as JSON array string per record)
  const assistantRows: { driverAssistants: string }[] = await prisma.deliveryRecord.findMany({
    where: { driverAssistants: { not: '[]' }, deletedAt: null },
    select: { driverAssistants: true },
    distinct: ['driverAssistants'],
  });
  const assistantNames = new Set<string>();
  for (const row of assistantRows) {
    try {
      const arr = JSON.parse(row.driverAssistants);
      if (Array.isArray(arr)) arr.forEach((n: string) => { if (n.trim()) assistantNames.add(n.trim()); });
    } catch { /* skip malformed */ }
  }

  const toCreate: { name: string; type: string; coverageAreas: string; createdBy: string; modifiedBy: string }[] = [];

  for (const row of driverRows) {
    if (row.driver.trim() && !knownNames.has(row.driver.trim())) {
      knownNames.add(row.driver.trim());
      toCreate.push({ name: row.driver.trim(), type: 'DRIVER', coverageAreas: '[]', createdBy: 'system', modifiedBy: 'system' });
    }
  }
  for (const name of assistantNames) {
    if (!knownNames.has(name)) {
      knownNames.add(name);
      toCreate.push({ name, type: 'ASSISTANT', coverageAreas: '[]', createdBy: 'system', modifiedBy: 'system' });
    }
  }

  if (toCreate.length > 0) {
    await prisma.driver.createMany({ data: toCreate });
  }
}

// List all drivers (active only by default, ?all=1 for all)
// On first call (empty table): seeds hardcoded defaults + drivers found in records.
router.get('/', requireAuth, async (req, res) => {
  const total = await prisma.driver.count();
  if (total === 0) {
    // Seed hardcoded defaults first
    await prisma.driver.createMany({
      data: DEFAULT_SEED.map(d => ({
        name: d.name,
        type: d.type,
        coverageAreas: JSON.stringify(d.areas),
        createdBy: 'system',
        modifiedBy: 'system',
      })),
    });
  }
  // Always sync: import any driver/assistant names from delivery records
  // that aren't in the Driver table yet.
  await syncDriversFromRecords();

  const where = req.query.all === '1' ? {} : { isActive: true };
  const drivers = await prisma.driver.findMany({ where, orderBy: { name: 'asc' } });
  res.json(drivers.map(serialize));
});

// Create a driver — Logistics + Admin only
router.post('/', requireAuth, requireRole('LOGISTICS', 'ADMIN'), async (req, res) => {
  const { name, type, coverage_areas } = req.body ?? {};
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const driverType = type === 'ASSISTANT' ? 'ASSISTANT' : 'DRIVER';

  const created = await prisma.driver.create({
    data: {
      name: name.trim(),
      type: driverType,
      coverageAreas: JSON.stringify(coverage_areas ?? []),
      createdBy: req.user!.name,
      modifiedBy: req.user!.name,
    },
  });
  res.status(201).json(serialize(created));
});

// Update a driver — Logistics + Admin only
router.put('/:id', requireAuth, requireRole('LOGISTICS', 'ADMIN'), async (req, res) => {
  const { name, type, coverage_areas, is_active } = req.body ?? {};
  const existing = await prisma.driver.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Driver not found' });

  const updated = await prisma.driver.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(type !== undefined && { type: type === 'ASSISTANT' ? 'ASSISTANT' : 'DRIVER' }),
      ...(coverage_areas !== undefined && { coverageAreas: JSON.stringify(coverage_areas) }),
      ...(is_active !== undefined && { isActive: is_active }),
      modifiedBy: req.user!.name,
    },
  });
  res.json(serialize(updated));
});

// Delete a driver — Logistics + Admin only
router.delete('/:id', requireAuth, requireRole('LOGISTICS', 'ADMIN'), async (req, res) => {
  const existing = await prisma.driver.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Driver not found' });
  await prisma.driver.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

export default router;
