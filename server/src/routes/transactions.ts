import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../middleware/auth';
import { CATEGORY_FROM_DB, STATUS_FROM_DB } from '../mappings';

const router = Router();

// ─── Role-based access helpers ───────────────────────────────────────────────

/** Returns the allowed DB category strings for a role, or null for "all". */
function allowedCategoriesForRole(role: string): string[] | null {
  switch (role) {
    case 'ADMIN':
      return null; // no restriction
    case 'SALES_COORDINATOR':
      return ['DELIVERY', 'PROCUREMENT_PICKUP', 'SALES_ORDERS'];
    case 'LOGISTICS':
      return ['DELIVERY', 'RMA', 'PROCUREMENT_PICKUP'];
    case 'TASS':
      return ['ACCOUNTING_COLLECTION'];
    default:
      return null;
  }
}

/** TASS cannot view inventory transactions. */
function canAccessInventory(role: string): boolean {
  return role !== 'TASS';
}

// ─── GET /api/transactions ────────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res) => {
  const role = req.user!.role;

  // Parse query params
  const page  = Math.max(1, parseInt(String(req.query.page  ?? '1'),  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '25'), 10) || 25));
  const sourceParam   = String(req.query.source   ?? 'all');
  const categoryParam = req.query.category ? String(req.query.category) : null;
  const fromParam     = req.query.from     ? String(req.query.from)     : null;
  const toParam       = req.query.to       ? String(req.query.to)       : null;
  const statusParam   = req.query.status   ? String(req.query.status)   : null;

  const allowedCategories = allowedCategoriesForRole(role);
  const merged: any[] = [];

  // ── Delivery records ───────────────────────────────────────────────────────
  const includeDelivery = sourceParam === 'all' || sourceParam === 'delivery';
  if (includeDelivery) {
    const where: any = { deletedAt: null };

    // Enforce role-based category restriction
    if (allowedCategories) {
      where.category = { in: allowedCategories };
    }

    // Apply optional category filter (only if it's within the role's allowed set)
    if (categoryParam) {
      const allowed = allowedCategories ? allowedCategories.includes(categoryParam) : true;
      if (allowed) {
        where.category = categoryParam;
      }
    }

    if (statusParam) {
      where.status = statusParam;
    }

    if (fromParam || toParam) {
      where.deliveryDate = {};
      if (fromParam) where.deliveryDate.gte = fromParam;
      if (toParam)   where.deliveryDate.lte = toParam;
    }

    const records = await prisma.deliveryRecord.findMany({
      where,
      include: { company: true, createdBy: true }
    });

    for (const r of records) {
      merged.push({
        id:          r.id,
        source:      'delivery' as const,
        type:        CATEGORY_FROM_DB[r.category] ?? r.category,
        date:        r.deliveryDate,
        reference:   r.reference,
        entity:      r.company.name,
        entity_id:   r.companyId,
        status:      r.status,
        description: r.itemDescription,
        created_by:  r.createdBy?.name ?? null,
        created_at:  r.createdAt,
        updated_at:  r.updatedAt
      });
    }
  }

  // ── Inventory transactions ─────────────────────────────────────────────────
  const includeInventory =
    canAccessInventory(role) && (sourceParam === 'all' || sourceParam === 'inventory');

  if (includeInventory) {
    const where: any = {};

    if (fromParam || toParam) {
      where.date = {};
      if (fromParam) where.date.gte = new Date(fromParam);
      if (toParam) {
        const toDate = new Date(toParam);
        toDate.setHours(23, 59, 59, 999);
        where.date.lte = toDate;
      }
    }

    const txns = await prisma.inventoryTransaction.findMany({
      where,
      include: { product: true }
    });

    for (const t of txns) {
      const qty = t.qtyChange;
      merged.push({
        id:                 t.id,
        source:             'inventory' as const,
        type:               t.type,
        date:               t.date.toISOString().split('T')[0],
        reference:          t.reference,
        entity:             t.product.name,
        entity_id:          t.productId,
        status:             null,
        description:        `${qty >= 0 ? '+' : ''}${qty} units → balance: ${t.resultingBalance}`,
        qty_change:         t.qtyChange,
        resulting_balance:  t.resultingBalance,
        created_by:         null,
        created_at:         t.createdAt,
        updated_at:         t.createdAt
      });
    }
  }

  // ── Merge, sort, paginate ──────────────────────────────────────────────────
  merged.sort((a, b) => {
    const da = new Date(a.date).getTime();
    const db = new Date(b.date).getTime();
    if (da !== db) return db - da; // descending date
    // tie-break by created_at descending
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const total = merged.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const transactions = merged.slice(start, start + limit);

  res.json({ page, limit, total, pages, transactions });
});

// ─── GET /api/transactions/:source/:id ───────────────────────────────────────

router.get('/:source/:id', requireAuth, async (req, res) => {
  const role   = req.user!.role;
  const source = req.params.source;
  const id     = req.params.id;

  if (source === 'delivery') {
    const record = await prisma.deliveryRecord.findFirst({
      where: { id, deletedAt: null },
      include: { company: true, createdBy: true, modifiedBy: true }
    });
    if (!record) return res.status(404).json({ error: 'Delivery record not found' });

    // Role gate
    const allowedCategories = allowedCategoriesForRole(role);
    if (allowedCategories && !allowedCategories.includes(record.category)) {
      return res.status(403).json({ error: 'Access denied for this record category' });
    }

    // Audit log for timeline (oldest → newest)
    const auditEntries = await prisma.auditLog.findMany({
      where: { recordId: id, recordType: 'DeliveryRecord' },
      include: { changedBy: true },
      orderBy: { timestamp: 'asc' }
    });

    const timeline = auditEntries.map(e => {
      const prev = e.previousValue ? JSON.parse(e.previousValue) : null;
      const next = e.newValue       ? JSON.parse(e.newValue)       : null;

      let event_type = 'field_update';
      let label      = 'Record updated';

      if (e.action === 'CREATE') {
        event_type = 'created';
        label      = 'Record Created';
      } else if (next?.status && prev?.status && next.status !== prev.status) {
        event_type = 'status_change';
        label      = `Status changed to ${STATUS_FROM_DB[next.status] ?? next.status}`;
      } else if (next?.driver && (!prev?.driver || !String(prev.driver).trim())) {
        event_type = 'field_update';
        label      = `Driver assigned: ${next.driver}`;
      }

      return {
        event_type,
        action:         e.action,
        changed_by:     e.changedBy.name,
        timestamp:      e.timestamp,
        previous_value: prev,
        new_value:      next,
        label
      };
    });

    return res.json({
      id:               record.id,
      source:           'delivery',
      type:             CATEGORY_FROM_DB[record.category] ?? record.category,
      reference:        record.reference,
      entity:           record.company.name,
      entity_id:        record.companyId,
      status:           record.status,
      description:      record.itemDescription,
      vehicle:          record.vehicle,
      area:             record.area,
      driver:           record.driver,
      driver_assistants: record.driverAssistants,
      account_manager:  record.accountManager,
      delivery_date:    record.deliveryDate,
      date_time:        record.dateAndTime,
      item_type:        record.itemType,
      remarks:          record.remarks,
      priority:         record.priority,
      created_by:       record.createdBy?.name ?? '',
      created_at:       record.createdAt,
      updated_at:       record.updatedAt,
      timeline
    });
  }

  if (source === 'inventory') {
    if (!canAccessInventory(role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const txn = await prisma.inventoryTransaction.findFirst({
      where: { id },
      include: { product: true }
    });
    if (!txn) return res.status(404).json({ error: 'Inventory transaction not found' });

    // Last 5 transactions for the same product (excluding this one)
    const related = await prisma.inventoryTransaction.findMany({
      where: { productId: txn.productId, id: { not: id } },
      orderBy: { date: 'desc' },
      take: 5
    });

    return res.json({
      id:                txn.id,
      source:            'inventory',
      type:              txn.type,
      reference:         txn.reference,
      entity:            txn.product.name,
      entity_id:         txn.productId,
      status:            null,
      qty_change:        txn.qtyChange,
      resulting_balance: txn.resultingBalance,
      created_by:        null,
      created_at:        txn.createdAt,
      updated_at:        txn.createdAt,
      product: {
        id:       txn.product.id,
        sku_code: txn.product.skuCode,
        name:     txn.product.name,
        category: txn.product.category
      },
      related_transactions: related.map(r => ({
        id:                r.id,
        date:              r.date.toISOString().split('T')[0],
        type:              r.type,
        qty_change:        r.qtyChange,
        resulting_balance: r.resultingBalance,
        reference:         r.reference
      }))
    });
  }

  return res.status(400).json({ error: 'Invalid source. Must be "delivery" or "inventory".' });
});

export default router;
