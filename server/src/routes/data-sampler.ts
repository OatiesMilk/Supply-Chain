import { Router } from 'express';
import { prisma } from '../db';
import { requireResource, requireAuth, requireRole } from '../middleware/auth';
import { runSeed } from '../../prisma/seed';
import { canResetLocalDemo } from '../services/localDemoReset';
import { serializeRecord } from '../mappings';
import type { Request, Response } from 'express';
import { RMA_CATEGORIES, RMA_ITEM_TYPES, normalizeRmaCategory, rmaInputError } from '../services/rmaRules';
import { generateRecordId } from '../services/recordIds';
import { dataSamplerEnabled } from '../services/dataSamplerEnvironment';

const router = Router();
router.use((_req, res, next) => {
  if (!dataSamplerEnabled()) return res.status(404).json({ error: 'Not found' });
  next();
});

const MODULES = [
  { key: 'deliveries',            dbCategory: 'DELIVERY',              label: 'Deliveries' },
  { key: 'rma',                   dbCategory: 'RMA',                   label: 'RMA' },
  { key: 'accounting_collection', dbCategory: 'ACCOUNTING_COLLECTION', label: 'Accounting Collection' },
  { key: 'procurement_pickup',    dbCategory: 'PROCUREMENT_PICKUP',    label: 'Procurement Pick-up' },
  { key: 'sales_orders',          dbCategory: 'SALES_ORDERS',          label: 'Sales Orders' },
];

router.get('/counts', requireAuth, requireResource('dataSampler'), requireRole('ADMIN'), async (_req, res) => {
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
  ACCOUNTING_COLLECTION: 'SAP-COLL',
  PROCUREMENT_PICKUP: 'SAP-PU',
  SALES_ORDERS: 'SAP-SO',
};

router.post('/generate', requireAuth, requireResource('dataSampler', 'WRITE'), requireRole('ADMIN'), async (req, res) => {
  try {
    const { module, count = 1, fields } = req.body ?? {};

    const mod = MODULES.find(m => m.key === module);
    if (!mod) {
      return res.status(400).json({ error: `Unknown module: ${module}` });
    }

    if (fields !== undefined && (!fields || typeof fields !== 'object' || Array.isArray(fields))) return res.status(400).json({ error: 'fields must be an object.' });
    if (fields?.status !== undefined && !['Scheduled', 'SCHEDULED'].includes(fields.status)) return res.status(400).json({ error: 'Sample records must start Scheduled. Record Time In and complete through the delivery workflow.' });
    const isRma = mod.dbCategory === 'RMA';
    const overrides: Record<string, any> = fields ?? {};
    if (isRma) {
      const error = rmaInputError({ ...overrides, rma_reference: overrides.rma_reference ?? overrides.reference });
      if (error) return res.status(400).json({ error });
      if (overrides.item_type !== undefined && !RMA_ITEM_TYPES.some(value => value === overrides.item_type)) {
        return res.status(400).json({ error: 'RMA Item Type must be Small Item or Unit.' });
      }
    }
    const n = Math.min(Math.max(1, Number(count) || 1), 50);

    const companies = await prisma.company.findMany({ select: { id: true, name: true } });
    if (companies.length === 0) {
      return res.status(400).json({ error: 'No companies found. Please seed the database first.' });
    }

    // Sample runs reference Driver profiles by id, like real assignments.
    const driverProfiles = await prisma.driver.findMany({ where: { type: 'DRIVER', isActive: true }, select: { id: true, name: true } });
    const sampleDrivers = driverProfiles.filter(d => DRIVERS.includes(d.name));
    const fieldDriver = typeof fields?.driver === 'string' && fields.driver.trim()
      ? driverProfiles.find(d => d.name.toLowerCase() === fields.driver.trim().toLowerCase())
      : undefined;
    if (typeof fields?.driver === 'string' && fields.driver.trim() && !fieldDriver) {
      return res.status(400).json({ error: `Driver "${fields.driver}" is inactive or not in the directory. Choose an active entry.` });
    }

    const created = [];

    for (let i = 0; i < n; i++) {
      const company = companies[Math.floor(Math.random() * companies.length)];
      const status = 'SCHEDULED';
      const priority = weightedPick(PRIORITY_WEIGHTS);
      const deliveryDate = generateDate(30, 14);
      const area = AREAS[Math.floor(Math.random() * AREAS.length)];
      const vehicle = VEHICLES[Math.floor(Math.random() * VEHICLES.length)];
      const assignDriver = sampleDrivers.length > 0 && Math.random() > 0.4;
      const sampleDriver = assignDriver ? sampleDrivers[Math.floor(Math.random() * sampleDrivers.length)] : null;
      const driver = sampleDriver?.name ?? '';
      const driverAssistants = driver && Math.random() > 0.5
        ? DRIVER_ASSISTANTS[Math.floor(Math.random() * DRIVER_ASSISTANTS.length)]
        : '';
      const accountManager = ACCOUNT_MANAGERS[Math.floor(Math.random() * ACCOUNT_MANAGERS.length)];
      const itemTypes = isRma ? RMA_ITEM_TYPES : ITEM_TYPES;
      const itemType = itemTypes[Math.floor(Math.random() * itemTypes.length)];
      const descs = ITEM_DESC_BY_CAT[mod.dbCategory] ?? ['Sample item'];
      const itemDescription = descs[Math.floor(Math.random() * descs.length)];
      const reference = isRma ? '' : generateRef(REF_PREFIX[mod.dbCategory] ?? 'SAP');
      // AC amounts: ₱5,000–₱150,000 in round-number increments
      const amount = mod.dbCategory === 'ACCOUNTING_COLLECTION'
        ? randInt(500, 15000) * 10
        : null;

      const recordId = generateRecordId();

      let formattedAssistants = '[]';
      if (overrides.driver_assistants) {
        if (Array.isArray(overrides.driver_assistants)) {
          formattedAssistants = JSON.stringify(overrides.driver_assistants);
        } else if (typeof overrides.driver_assistants === 'string') {
          formattedAssistants = overrides.driver_assistants.startsWith('[')
            ? overrides.driver_assistants
            : JSON.stringify([overrides.driver_assistants]);
        }
      } else if (driverAssistants) {
        formattedAssistants = JSON.stringify([driverAssistants]);
      }

      const record = await prisma.$transaction(async tx => {
        const record = await tx.deliveryRecord.create({
          data: {
            id:              recordId,
            companyId:       overrides.company_id    ?? company.id,
            priority:        overrides.priority       ?? priority,
            reference:       isRma ? '' : overrides.reference ?? reference,
            rmaReference:    isRma ? (overrides.rma_reference ?? overrides.reference ?? '').trim() || null : null,
            legacySapReference: null,
            rmaType:         isRma ? normalizeRmaCategory(overrides.rma_type !== undefined ? overrides.rma_type : RMA_CATEGORIES[randInt(0, RMA_CATEGORIES.length - 1)]) : null,
            purchaseDate:    isRma ? overrides.purchase_date || null : null,
            customerContactName: isRma ? overrides.customer_contact_name?.trim() || null : null,
            customerContactEmail: isRma ? overrides.customer_contact_email?.trim() || null : null,
            customerContactPhone: isRma ? overrides.customer_contact_phone?.trim() || null : null,
            remarks:         overrides.remarks        ?? 'Created via Data Sampler',
            status,
            vehicle:         overrides.vehicle        ?? vehicle,
            area:            overrides.area           ?? area,
            address:         overrides.address        ?? '',
            driver:          fieldDriver ? fieldDriver.name : (overrides.driver === '' ? '' : driver),
            driverId:        fieldDriver ? fieldDriver.id : (overrides.driver === '' ? null : sampleDriver?.id ?? null),
            driverAssistants: formattedAssistants,
            accountManager:  overrides.account_manager ?? accountManager,
            deliveryDate:    overrides.delivery_date  ?? deliveryDate,
            category:        mod.dbCategory as any,
            itemType:        overrides.item_type      ?? itemType,
            draft:           false,
            
            itemDescription: overrides.item_description ?? itemDescription,
            amount: overrides.amount != null
              ? parseFloat(String(overrides.amount))
              : amount,
            createdById:  req.user!.id,
            modifiedById: req.user!.id,
          },
          include: { company: true, createdBy: true, modifiedBy: true }
        });

        await tx.auditLog.create({ data: {
          recordId: record.id, recordType: 'DeliveryRecord', action: 'CREATE', changedById: req.user!.id,
          newValue: JSON.stringify({ ...serializeRecord(record), _note: 'Created via Data Sampler' }),
        } });
        return record;
      });

      created.push(serializeRecord(record));
    }

    res.status(201).json({ created: created.length, records: created });
  } catch (err) {
    console.error('[data-sampler/generate]', err);
    res.status(500).json({ error: 'Failed to generate sample records. See server logs for details.' });
  }
});

export interface DataSamplerResetOperations {
  countRecords: () => Promise<number>;
  resetToSeed: () => Promise<void>;
  fullReset: () => Promise<void>;
}

const dataSamplerResetOperations: DataSamplerResetOperations = {
  countRecords: () => prisma.deliveryRecord.count(),
  resetToSeed: () => runSeed(true),
  fullReset: async () => {
    // AuditLog has a DB-level FK to DeliveryRecord (ON DELETE RESTRICT), so audit
    // entries must be removed before the transactional records.
    await prisma.auditLog.deleteMany({ where: { recordType: 'DeliveryRecord' } });
    await prisma.comment.deleteMany({ where: { recordType: 'DeliveryRecord' } });
    await prisma.notification.deleteMany();
    await prisma.notificationLog.deleteMany();
    await prisma.deliveryRecord.deleteMany();
  },
};

export function createDataSamplerResetHandler(operations: DataSamplerResetOperations = dataSamplerResetOperations) {
  return async (req: Request, res: Response) => {
    if (!canResetLocalDemo(req)) return res.status(403).json({ error: 'Demo reset is available only on a verified local disposable database' });
    const { mode } = req.body ?? {};
    if (mode !== 'full' && mode !== 'seed') {
      return res.status(400).json({ error: 'mode must be "full" or "seed"' });
    }

    const deleted = await operations.countRecords();
    if (mode === 'seed') await operations.resetToSeed();
    else await operations.fullReset();

    // Cannot write to audit_log: the FK on recordId requires a valid DeliveryRecord.id
    // which no longer exists after the reset. System events would need a schema change.
    console.log(`[RESET] ${mode} reset performed by ${req.user!.name} — ${deleted} record(s) deleted`);
    res.json({ deleted, mode });
  };
}

router.post('/reset', requireAuth, requireResource('dataSampler', 'WRITE'), requireRole('ADMIN'), createDataSamplerResetHandler());


export default router;
