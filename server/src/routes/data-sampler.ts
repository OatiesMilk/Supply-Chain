import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { writeAuditLog } from '../services/audit';
import { serializeRecord } from '../mappings';

const router = Router();

const MODULES = [
  { key: 'deliveries',            dbCategory: 'DELIVERY',              label: 'Deliveries' },
  { key: 'rma',                   dbCategory: 'RMA',                   label: 'RMA' },
  { key: 'accounting_collection', dbCategory: 'ACCOUNTING_COLLECTION', label: 'Accounting Collection' },
  { key: 'procurement_pickup',    dbCategory: 'PROCUREMENT_PICKUP',    label: 'Procurement Pick-up' },
  { key: 'sales_orders',          dbCategory: 'SALES_ORDERS',          label: 'Sales Orders' },
];

router.get('/counts', requireAuth, requireRole('ADMIN'), async (_req, res) => {
  const counts = await Promise.all(
    MODULES.map(async m => {
      const count = await prisma.deliveryRecord.count({
        where: { category: m.dbCategory, deletedAt: null }
      });
      return { key: m.key, label: m.label, count };
    })
  );
  res.json(counts);
});

// ── Generation helpers ────────────────────────────────────────────────────────

function weightedPick<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1][0];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateDate(daysBack: number, daysForward: number): string {
  const offset = randInt(-daysBack, daysForward);
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

function generateRef(prefix: string): string {
  return `${prefix}-${randInt(10000, 99999)}`;
}

const AREAS = [
  'Makati CBD', 'BGC (Taguig)', 'Ortigas Center (Pasig)', 'Quezon City - Diliman',
  'Quezon City - Fairview', 'Manila - Binondo', 'Manila - Ermita', 'Mandaluyong',
  'Pasig - Kapitolyo', 'Marikina', 'Parañaque', 'Pasay', 'Las Piñas',
  'Muntinlupa - Alabang', 'Caloocan', 'Valenzuela', 'Antipolo (Rizal)',
  'Davao City', 'Cebu City', 'Cagayan de Oro City', 'Bacoor, Cavite',
  'Sta. Rosa, Laguna', 'Angeles City, Pampanga', 'Baguio City, Benguet',
];

const VEHICLES = ['(None)', 'Truck-A (6-Wheeler)', 'Truck-B (10-Wheeler)', 'Van-01 (L300)', 'Motorcycle-01 (Express)'];
const DRIVERS = ['Lando Navarro', 'Manny Santos', 'Ronald de la Cruz'];
const DRIVER_ASSISTANTS = ['Jayson Reyes', 'Bong Alvarez', 'Ricky Mendoza'];
const ACCOUNT_MANAGERS = ['P. Soriano', 'D. Macaraeg', 'F. Valenzuela', 'R. Pagkalinawan', 'M. Reyes', 'A. Santos', 'C. Lim'];
const ITEM_TYPES = ['Small Item', 'Medium Item', 'Large / Pallet'];

const STATUS_WEIGHTS: [string, number][] = [
  ['SCHEDULED', 50],
  ['ACCOMPLISHED', 20],
  ['PENDING', 15],
  ['RESCHEDULED', 10],
  ['ON_HOLD', 5],
];

const PRIORITY_WEIGHTS: [string, number][] = [
  ['2 - Moderate', 60],
  ['3 - High', 25],
  ['1 - Low', 15],
];

const ITEM_DESC_BY_CAT: Record<string, string[]> = {
  DELIVERY: [
    '5x Premium 10" POS Tablet (UTK-TAB10)',
    '10x Compact 8" POS Tablet (UTK-TAB08)',
    '3x 80mm Thermal Printer + Cash Drawer Set',
    '20x Thermal Paper Rolls (UTK-ACC-ROLL)',
    '5x Omni-directional 2D Scanner (UTK-SCN-2D)',
    '2x Premium Tablet + 2x Rotating Stand',
    '4x Contactless NFC Card Reader + 4x Bluetooth Keyboard',
  ],
  RMA: [
    '1x UTK-TAB10 defective unit pull-out',
    '2x UTK-PRN-TH80 returned for warranty repair',
    '1x UTK-DRW-MED cash drawer return',
    '3x UTK-SCN-HND replacement swap on-site',
    '1x UTK-TAB08 screen unresponsive — pull-out',
    '2x UTK-STD-ROT defective stand — exchange',
  ],
  ACCOUNTING_COLLECTION: [
    'Collection of billing statement + PDC',
    'Collection of official receipt acknowledgement',
    'Collection of overdue balance settlement',
    'Collection of signed billing statement for quarterly invoice',
    'PDC and eBilling acknowledgement collection',
    'Collection of post-dated checks for invoice cycle',
  ],
  PROCUREMENT_PICKUP: [
    'Pick-up 50x UTK-TAB10 from supplier warehouse',
    'Pick-up 100x UTK-STD-ROT metal stands',
    'Pick-up 20x UTK-DRW-HVY cash drawers',
    'Pick-up 50x boxes of 80mm thermal paper rolls',
    'Pick-up 30x UTK-PRN-TH80 from manufacturer',
    'Pick-up 15x UTK-LTE-RTR from freight depot',
  ],
  SALES_ORDERS: [
    'B2B order — 5x Compact Tablet + 5x Mobile Printer',
    'POS bundle: 3x Tablet, 3x Printer, 6x Paper Rolls',
    '10x UTK-RFID-TAG cashier key fobs',
    '2x LTE Backup Router deployment',
    '5x VFD Customer Display + 5x Rotating Stand',
    '8x Handheld Wireless Scanner (UTK-SCN-HND)',
  ],
};

const REF_PREFIX: Record<string, string> = {
  DELIVERY: 'SAP',
  RMA: 'SAP-RMA',
  ACCOUNTING_COLLECTION: 'SAP-COLL',
  PROCUREMENT_PICKUP: 'SAP-PU',
  SALES_ORDERS: 'SAP-SO',
};

router.post('/generate', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const { module, count = 1, fields } = req.body ?? {};

    const mod = MODULES.find(m => m.key === module);
    if (!mod) {
      return res.status(400).json({ error: `Unknown module: ${module}` });
    }

    const n = Math.min(Math.max(1, Number(count) || 1), 50);

    const companies = await prisma.company.findMany({ select: { id: true, name: true } });
    if (companies.length === 0) {
      return res.status(400).json({ error: 'No companies found. Please seed the database first.' });
    }

    const created = [];

    for (let i = 0; i < n; i++) {
      const company = companies[Math.floor(Math.random() * companies.length)];
      const status = weightedPick(STATUS_WEIGHTS);
      const priority = weightedPick(PRIORITY_WEIGHTS);
      const deliveryDate = generateDate(30, 14);
      const area = AREAS[Math.floor(Math.random() * AREAS.length)];
      const vehicle = VEHICLES[Math.floor(Math.random() * VEHICLES.length)];
      const assignDriver = status === 'ACCOMPLISHED' || Math.random() > 0.4;
      const driver = assignDriver ? DRIVERS[Math.floor(Math.random() * DRIVERS.length)] : '';
      const driverAssistants = driver && Math.random() > 0.5
        ? DRIVER_ASSISTANTS[Math.floor(Math.random() * DRIVER_ASSISTANTS.length)]
        : '';
      const accountManager = ACCOUNT_MANAGERS[Math.floor(Math.random() * ACCOUNT_MANAGERS.length)];
      const itemType = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
      const descs = ITEM_DESC_BY_CAT[mod.dbCategory] ?? ['Sample item'];
      const itemDescription = descs[Math.floor(Math.random() * descs.length)];
      const reference = generateRef(REF_PREFIX[mod.dbCategory] ?? 'SAP');
      // AC amounts: ₱5,000–₱150,000 in round-number increments
      const amount = mod.dbCategory === 'ACCOUNTING_COLLECTION'
        ? randInt(500, 15000) * 10
        : null;

      const overrides: Record<string, any> = fields ?? {};

      // Generate a human-readable record ID in the same REC-XXXXX format as seed data.
      // Use the 50000–99999 range to stay clear of seed records (4001–4999).
      const recordId = `REC-${randInt(50000, 99999)}`;

      const record = await prisma.deliveryRecord.create({
        data: {
          id:              recordId,
          companyId:       overrides.company_id    ?? company.id,
          priority:        overrides.priority       ?? priority,
          reference:       overrides.reference      ?? reference,
          remarks:         overrides.remarks        ?? 'Created via Data Sampler',
          status:          overrides.status         ?? status,
          vehicle:         overrides.vehicle        ?? vehicle,
          area:            overrides.area           ?? area,
          driver:          overrides.driver         ?? driver,
          driverAssistants: overrides.driver_assistants ?? driverAssistants,
          accountManager:  overrides.account_manager ?? accountManager,
          deliveryDate:    overrides.delivery_date  ?? deliveryDate,
          category:        mod.dbCategory as any,
          itemType:        overrides.item_type      ?? itemType,
          draft:           false,
          dateAndTime:     overrides.date_time      ?? new Date().toISOString(),
          itemDescription: overrides.item_description ?? itemDescription,
          amount: overrides.amount != null
            ? parseFloat(String(overrides.amount))
            : amount,
          createdById:  req.user!.id,
          modifiedById: req.user!.id,
        },
        include: { company: true, createdBy: true, modifiedBy: true }
      });

      await writeAuditLog({
        recordId:     record.id,
        recordType:   'DeliveryRecord',
        action:       'CREATE',
        changedById:  req.user!.id,
        previousValue: null,
        newValue:     { ...serializeRecord(record), _note: 'Created via Data Sampler' }
      });

      created.push(serializeRecord(record));
    }

    res.status(201).json({ created: created.length, records: created });
  } catch (err) {
    console.error('[data-sampler/generate]', err);
    res.status(500).json({ error: 'Failed to generate sample records. See server logs for details.' });
  }
});

router.post('/reset', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const { mode } = req.body ?? {};
  if (mode !== 'full' && mode !== 'seed') {
    return res.status(400).json({ error: 'mode must be "full" or "seed"' });
  }

  const deleted = await prisma.deliveryRecord.count();

  if (mode === 'seed') {
    // Full wipe + re-seed restores the complete demo state (users, companies, records).
    const { runSeed } = await import('../../prisma/seed.js');
    await runSeed(true);
  } else {
    // Delete only transactional records. AuditLog has a DB-level FK to DeliveryRecord
    // (ON DELETE RESTRICT from the init migration), so audit entries must be removed first.
    await prisma.auditLog.deleteMany({ where: { recordType: 'DeliveryRecord' } });
    await prisma.comment.deleteMany({ where: { recordType: 'DeliveryRecord' } });
    await prisma.notification.deleteMany();
    await prisma.notificationLog.deleteMany();
    await prisma.deliveryRecord.deleteMany();
  }

  // Cannot write to audit_log: the FK on recordId requires a valid DeliveryRecord.id
  // which no longer exists after the reset. System events would need a schema change.
  console.log(`[RESET] ${mode} reset performed by ${req.user!.name} — ${deleted} record(s) deleted`);

  res.json({ deleted, mode });
});

export default router;
