import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { skuInputError } from '../services/skuValidation';
import { asyncRoute } from '../middleware/asyncRoute';
import { prisma } from '../db';
import { requireResource, requireAuth, requireRole, requireScreen } from '../middleware/auth';

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
router.get('/', requireAuth, requireResource('skus'), async (_req, res) => {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    include: productInclude,
    orderBy: { skuCode: 'asc' }
  });
  res.json(products.map(p => serializeProduct(p)));
});

// GET /api/skus/:id — All roles, returns single product + inventory + last 20 transactions
router.get('/:id', requireAuth, requireResource('skus'), async (req, res) => {
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
router.get('/:id/audit', requireAuth, requireResource('skus'), requireRole('ADMIN'), async (req, res) => {
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
router.put('/:id', requireAuth, requireResource('skus'), requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const b = req.body ?? {};
  const error = skuInputError(b, true);
  if (error) return res.status(400).json({ error });
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, deletedAt: null }, include: productInclude });
  if (!existing) return res.status(404).json({ error: 'SKU not found' });
  const data: Prisma.ProductUncheckedUpdateInput = { modifiedById: req.user!.id };
  if (b.sku_code !== undefined) data.skuCode = b.sku_code.trim();
  if (b.name !== undefined) data.name = b.name.trim();
  if (b.category !== undefined) data.category = b.category;
  if (b.unit_cost !== undefined) data.unitCost = Number(b.unit_cost);
  if (b.unit_price !== undefined) data.unitPrice = Number(b.unit_price);
  if (b.reorder_point !== undefined) data.reorderPoint = Number(b.reorder_point);
  if (b.description !== undefined) data.description = b.description.trim();
  try {
    const updated = await prisma.$transaction(async tx => {
      const product = await tx.product.update({ where: { id: existing.id }, data, include: productInclude });
      await tx.auditLog.create({ data: {
        recordId: product.id, recordType: 'SKU', action: 'UPDATE', changedById: req.user!.id,
        previousValue: JSON.stringify(serializeProduct(existing)), newValue: JSON.stringify(serializeProduct(product)),
      } });
      return product;
    });
    return res.json(serializeProduct(updated));
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return res.status(409).json({ error: 'A SKU with this code already exists.' });
    throw error;
  }
}));

// POST /api/skus — Admin only, create product + inventory row
router.post('/', requireAuth, requireResource('skus'), requireRole('ADMIN'), asyncRoute(async (req, res) => {
  const b = req.body ?? {};
  const error = skuInputError(b);
  if (error) return res.status(400).json({ error });
  const unitCost = Number(b.unit_cost);
  const unitPrice = Number(b.unit_price);
  const reorderPoint = Number(b.reorder_point);

  try {
    const created = await prisma.$transaction(async tx => {
      const product = await tx.product.create({
        data: {
          skuCode: b.sku_code.trim(), name: b.name.trim(), category: b.category,
          unitCost, unitPrice, reorderPoint, description: b.description?.trim() ?? '',
          createdById: req.user!.id, modifiedById: req.user!.id,
          inventory: { create: {
            warehouseLocation: b.warehouse_location?.trim() || 'TBD', onHandQty: 0, allocatedQty: 0,
          } },
        },
        include: productInclude,
      });
      await tx.auditLog.create({ data: {
        recordId: product.id, recordType: 'SKU', action: 'CREATE', changedById: req.user!.id,
        previousValue: null, newValue: JSON.stringify(serializeProduct(product)),
      } });
      return product;
    });
    return res.status(201).json(serializeProduct(created));
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') {
      return res.status(409).json({ error: 'A SKU with this code already exists.' });
    }
    throw error;
  }
}));

// In-process mutex to serialize concurrent adjustments per SKU within the Node event loop
const productLocks = new Map<string, Promise<void>>();

async function withProductLock<T>(productId: string, fn: () => Promise<T>): Promise<T> {
  while (productLocks.has(productId)) {
    try {
      await productLocks.get(productId);
    } catch {
      // Ignore errors from previous holder
    }
  }
  let release!: () => void;
  const lock = new Promise<void>((resolve) => {
    release = resolve;
  });
  productLocks.set(productId, lock);
  try {
    return await fn();
  } finally {
    if (productLocks.get(productId) === lock) {
      productLocks.delete(productId);
    }
    release();
  }
}

// POST /api/skus/:id/adjust — Admin + Logistics, stock adjustment
// Stock adjustment is a SKU Master action: read-only SKU lookup is not enough (TSK-118).
router.post('/:id/adjust', requireAuth, requireResource('skus'), requireScreen('inventory'), requireRole('ADMIN', 'LOGISTICS'), asyncRoute(async (req, res) => {
  const { type, qty_change, reference } = req.body ?? {};
  if (!['Goods Receipt', 'Sale', 'Adjustment', 'Transfer'].includes(type)) return res.status(400).json({ error: 'Invalid stock adjustment type.' });
  if (typeof reference !== 'string' || !reference.trim()) return res.status(400).json({ error: 'Reference is required.' });
  const change = (typeof qty_change === 'number' || (typeof qty_change === 'string' && qty_change.trim())) ? Number(qty_change) : NaN;
  if (!Number.isFinite(change) || !Number.isInteger(change) || change === 0 || Math.abs(change) > 2147483647) {
    return res.status(400).json({ error: 'qty_change must be a non-zero finite whole number within the supported range.' });
  }
  const product = await prisma.product.findFirst({ where: { id: req.params.id, deletedAt: null }, include: productInclude });
  if (!product) return res.status(404).json({ error: 'SKU not found' });

  try {
    const updated = await withProductLock(product.id, async () => {
      return prisma.$transaction(async (tx) => {
        if (typeof tx.$queryRaw === 'function') {
          await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${product.id} FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE "productId" = ${product.id} FOR UPDATE`;
        }
        const inv = await tx.inventoryItem.findUnique({ where: { productId: product.id } });
        const currentQty = inv?.onHandQty ?? 0;
        if (currentQty + change < 0) {
          throw new Error(`Insufficient stock. Current on-hand quantity is ${currentQty}, cannot deduct ${Math.abs(change)}.`);
        }
        const resultingBalance = currentQty + change;
        if (resultingBalance > 2147483647) throw new Error('Stock balance exceeds the supported range.');

        if (inv) {
          await tx.inventoryItem.update({
            where: { productId: product.id },
            data: { onHandQty: resultingBalance }
          });
        }

        await tx.inventoryTransaction.create({
          data: {
            productId:        product.id,
            type:             String(type),
            qtyChange:        change,
            resultingBalance,
            reference:        reference.trim()
          }
        });

        await tx.product.update({
          where: { id: product.id },
          data: { modifiedById: req.user!.id }
        });

        await tx.auditLog.create({ data: {
          recordId: product.id, recordType: 'SKU', action: 'UPDATE', changedById: req.user!.id,
          previousValue: JSON.stringify({ on_hand_qty: currentQty }),
          newValue: JSON.stringify({ on_hand_qty: resultingBalance, adjustment_type: type, qty_change: change, reference: reference.trim() }),
        } });
        return tx.product.findUniqueOrThrow({
          where: { id: product.id },
          include: { ...productInclude, transactions: { orderBy: { date: 'desc' }, take: 20 } },
        });
      });
    });

    return res.json(serializeProduct(updated, true));
  } catch (err: any) {
    if (err.message?.includes('Insufficient stock') || err.message === 'Stock balance exceeds the supported range.') {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }

}));

export default router;
