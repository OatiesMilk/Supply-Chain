import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { writeAuditLog } from '../services/audit';

const router = Router();

const productInclude = {
  createdBy: true,
  modifiedBy: true,
  inventory: true
};

function serializeProduct(p: any, includeTransactions = false): object {
  return {
    id: p.id,
    sku_code: p.skuCode,
    name: p.name,
    category: p.category,
    unit_cost: p.unitCost,
    unit_price: p.unitPrice,
    reorder_point: p.reorderPoint,
    description: p.description,
    created_by: p.createdBy?.name ?? '',
    modified_by: p.modifiedBy?.name ?? '',
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    inventory: p.inventory
      ? {
          warehouse_location: p.inventory.warehouseLocation,
          on_hand_qty: p.inventory.onHandQty,
          allocated_qty: p.inventory.allocatedQty,
          atp: p.inventory.onHandQty - p.inventory.allocatedQty
        }
      : null,
    recent_transactions: includeTransactions
      ? (p.transactions ?? []).slice(0, 20).map((t: any) => ({
          id: t.id,
          type: t.type,
          qty_change: t.qtyChange,
          resulting_balance: t.resultingBalance,
          reference: t.reference,
          date: t.date
        }))
      : []
  };
}

// GET /api/skus — All roles, returns all products with inventory
router.get('/', requireAuth, async (_req, res) => {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    include: productInclude,
    orderBy: { skuCode: 'asc' }
  });
  res.json(products.map(p => serializeProduct(p)));
});

// GET /api/skus/:id — All roles, returns single product + inventory + last 20 transactions
router.get('/:id', requireAuth, async (req, res) => {
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: {
      ...productInclude,
      transactions: {
        orderBy: { date: 'desc' },
        take: 20
      }
    }
  });
  if (!product) return res.status(404).json({ error: 'SKU not found' });
  res.json(serializeProduct(product, true));
});

// GET /api/skus/:id/audit — Admin only
router.get('/:id/audit', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const entries = await prisma.auditLog.findMany({
    where: { recordId: req.params.id, recordType: 'SKU' },
    include: { changedBy: true },
    orderBy: { timestamp: 'desc' }
  });
  res.json(
    entries.map(e => ({
      id: e.id,
      action: e.action,
      changed_by: e.changedBy.name,
      previous_value: e.previousValue ? JSON.parse(e.previousValue) : null,
      new_value: e.newValue ? JSON.parse(e.newValue) : null,
      timestamp: e.timestamp
    }))
  );
});

// PUT /api/skus/:id — Admin only, update product fields
router.put('/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const existing = await prisma.product.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: productInclude
  });
  if (!existing) return res.status(404).json({ error: 'SKU not found' });

  const b = req.body ?? {};
  const data: any = { modifiedById: req.user!.id };

  if (b.sku_code     !== undefined) data.skuCode      = b.sku_code;
  if (b.name         !== undefined) data.name         = b.name;
  if (b.category     !== undefined) data.category     = b.category;
  if (b.unit_cost    !== undefined) data.unitCost      = Number(b.unit_cost);
  if (b.unit_price   !== undefined) data.unitPrice     = Number(b.unit_price);
  if (b.reorder_point !== undefined) data.reorderPoint = Number(b.reorder_point);
  if (b.description  !== undefined) data.description  = b.description;

  const updated = await prisma.product.update({
    where: { id: existing.id },
    data,
    include: productInclude
  });

  await writeAuditLog({
    recordId: updated.id,
    recordType: 'SKU',
    action: 'UPDATE',
    changedById: req.user!.id,
    previousValue: serializeProduct(existing),
    newValue: serializeProduct(updated)
  });

  res.json(serializeProduct(updated));
});

// POST /api/skus — Admin only, create product + inventory row
router.post('/', requireAuth, requireRole('ADMIN'), async (req, res) => {
  const b = req.body ?? {};
  const required = ['sku_code', 'name', 'category', 'unit_cost', 'unit_price', 'reorder_point'];
  const missing = required.filter(k => b[k] === undefined || b[k] === null || b[k] === '');
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const created = await prisma.product.create({
    data: {
      skuCode:      String(b.sku_code),
      name:         String(b.name),
      category:     String(b.category),
      unitCost:     Number(b.unit_cost),
      unitPrice:    Number(b.unit_price),
      reorderPoint: Number(b.reorder_point),
      description:  b.description ? String(b.description) : '',
      createdById:  req.user!.id,
      modifiedById: req.user!.id
    },
    include: productInclude
  });

  // Create empty inventory row
  await prisma.inventoryItem.create({
    data: {
      productId:         created.id,
      warehouseLocation: b.warehouse_location ? String(b.warehouse_location) : 'TBD',
      onHandQty:         0,
      allocatedQty:      0
    }
  });

  // Re-fetch to include the new inventory row
  const withInv = await prisma.product.findUnique({
    where: { id: created.id },
    include: productInclude
  });

  await writeAuditLog({
    recordId: created.id,
    recordType: 'SKU',
    action: 'CREATE',
    changedById: req.user!.id,
    previousValue: null,
    newValue: serializeProduct(withInv)
  });

  res.status(201).json(serializeProduct(withInv));
});

// POST /api/skus/:id/adjust — Admin + Logistics, stock adjustment
router.post('/:id/adjust', requireAuth, requireRole('ADMIN', 'LOGISTICS'), async (req, res) => {
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: productInclude
  });
  if (!product) return res.status(404).json({ error: 'SKU not found' });

  const { type, qty_change, reference } = req.body ?? {};
  if (!type || qty_change === undefined || !reference) {
    return res.status(400).json({ error: 'type, qty_change, and reference are required' });
  }

  const change = Number(qty_change);
  if (isNaN(change) || change === 0) {
    return res.status(400).json({ error: 'qty_change must be a non-zero number' });
  }

  const currentQty = product.inventory?.onHandQty ?? 0;
  const newQty = Math.max(0, currentQty + change);
  const resultingBalance = newQty;

  // Update inventory quantity
  if (product.inventory) {
    await prisma.inventoryItem.update({
      where: { productId: product.id },
      data: { onHandQty: newQty }
    });
  }

  // Create transaction record
  await prisma.inventoryTransaction.create({
    data: {
      productId:        product.id,
      type:             String(type),
      qtyChange:        change,
      resultingBalance,
      reference:        String(reference)
    }
  });

  // Update modifiedById on the product
  await prisma.product.update({
    where: { id: product.id },
    data: { modifiedById: req.user!.id }
  });

  await writeAuditLog({
    recordId: product.id,
    recordType: 'SKU',
    action: 'UPDATE',
    changedById: req.user!.id,
    previousValue: { on_hand_qty: currentQty },
    newValue: { on_hand_qty: newQty, adjustment_type: type, qty_change: change, reference }
  });

  // Return the full updated product
  const updated = await prisma.product.findUnique({
    where: { id: product.id },
    include: {
      ...productInclude,
      transactions: { orderBy: { date: 'desc' }, take: 20 }
    }
  });

  res.json(serializeProduct(updated, true));
});

export default router;
