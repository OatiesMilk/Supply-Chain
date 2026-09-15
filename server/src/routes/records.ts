import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../middleware/auth';
import { writeAuditLog } from '../services/audit';
import { notifyAccomplished } from '../services/notify';
import { notifyRole, notifyUser } from '../services/inAppNotify';
import { CATEGORY_TO_DB, STATUS_TO_DB, STATUS_FROM_DB, serializeRecord } from '../mappings';

const router = Router();

const recordInclude = {
  company: true,
  createdBy: true,
  modifiedBy: true,
  linkedCollection: {
    include: { company: true }
  }
};

async function createRemarkLog(recordId: string, body: string, context: string, authorId: string) {
  if (!body.trim()) return;
  await prisma.remarkLog.create({ data: { recordId, body: body.trim(), context, authorId } });
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRecordId(): string {
  return `REC-${randInt(10000, 49999)}`;
}

const TASS_CATEGORIES: string[] = ['ACCOUNTING_COLLECTION', 'RMA'];
function categoryFilterForRole(role: string, userName?: string) {
  if (role === 'TASS') return { category: { in: TASS_CATEGORIES } };
  if (role === 'DRIVER') return { driver: userName ?? '' };
  return {};
}

router.get('/', requireAuth, async (req, res) => {
  const records = await prisma.deliveryRecord.findMany({
    where: { deletedAt: null, ...categoryFilterForRole(req.user!.role, req.user!.name) },
    include: recordInclude,
    orderBy: { createdAt: 'desc' }
  });
  res.json(records.map(serializeRecord));
});

// Must be before /:id to avoid "status-history-counts" matching as an ID
router.get('/status-history-counts', requireAuth, async (req, res) => {
  const { category, dateFrom, dateTo, area, driver, status } = req.query as Record<string, string>;

  const where: any = {
    deletedAt: null,
    ...categoryFilterForRole(req.user!.role, req.user!.name)
  };

  if (category) where.category = CATEGORY_TO_DB[category] ?? category;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(`${dateFrom}T00:00:00`);
    if (dateTo)   where.createdAt.lte = new Date(`${dateTo}T23:59:59`);
  }
  if (area)   where.area   = area;
  if (driver) where.driver = driver;
  if (status) where.status = STATUS_TO_DB[status] ?? status;

  const records = await prisma.deliveryRecord.findMany({
    where,
    select: { id: true, status: true }
  });

  const STATUSES = ['Scheduled', 'Delivered', 'Pending', 'On-Hold', 'Rescheduled'];
  const current: Record<string, number>  = Object.fromEntries(STATUSES.map(s => [s, 0]));
  const ever_held: Record<string, number> = Object.fromEntries(STATUSES.map(s => [s, 0]));
  const recordStatusMap = new Map<string, Set<string>>();

  for (const r of records) {
    const s = STATUS_FROM_DB[r.status] ?? r.status;
    current[s] = (current[s] ?? 0) + 1;
    recordStatusMap.set(r.id, new Set([s]));
  }

  if (records.length > 0) {
    const auditEntries = await prisma.auditLog.findMany({
      where: { recordId: { in: records.map(r => r.id) }, recordType: 'DeliveryRecord' },
      select: { recordId: true, previousValue: true, newValue: true }
    });

    for (const entry of auditEntries) {
      const set = recordStatusMap.get(entry.recordId);
      if (!set) continue;
      try {
        const nv = entry.newValue  ? JSON.parse(entry.newValue)  : null;
        const pv = entry.previousValue ? JSON.parse(entry.previousValue) : null;
        if (nv?.status) set.add(STATUS_FROM_DB[nv.status] ?? nv.status);
        if (pv?.status) set.add(STATUS_FROM_DB[pv.status] ?? pv.status);
      } catch { /* ignore */ }
    }
  }

  for (const statuses of recordStatusMap.values()) {
    for (const s of statuses) {
      if (s in ever_held) ever_held[s]++;
    }
  }

  res.json({ ever_held, current, total_records: records.length });
});

router.get('/:id', requireAuth, async (req, res) => {
  const record = await prisma.deliveryRecord.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: recordInclude
  });
  if (!record) return res.status(404).json({ error: 'Record not found' });

  if (req.user!.role === 'TASS' && !TASS_CATEGORIES.includes(record.category as any)) {
    return res.status(403).json({ error: 'TASS may only view Accounting Collection and RMA records' });
  }

  res.json(serializeRecord(record));
});

router.get('/:id/audit', requireAuth, async (req, res) => {
  const entries = await prisma.auditLog.findMany({
    where: { recordId: req.params.id, recordType: 'DeliveryRecord' },
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

// Append-only remarks history
router.get('/:id/remarks', requireAuth, async (req, res) => {
  const remarks = await prisma.remarkLog.findMany({
    where: { recordId: req.params.id },
    include: { author: { select: { name: true, role: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json(
    remarks.map(r => ({
      id: r.id,
      body: r.body,
      context: r.context,
      author: r.author.name,
      author_role: r.author.role,
      created_at: r.createdAt
    }))
  );
});

// Create - Sales Coordinator only.
// SoD: Sales Coordinator cannot assign drivers; driver assignment is Logistics-only.
router.post('/', requireAuth, requireRole('SALES_COORDINATOR', 'LOGISTICS'), async (req, res) => {
  const b = req.body ?? {};
  const isDraft = b.is_draft === 'Yes';
  const required = isDraft
    ? ['company_id', 'category']
    : ['company_id', 'reference', 'category'];
  const missing = required.filter(k => !b[k]);
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const dbCategory = CATEGORY_TO_DB[b.category] ?? b.category;

  if (req.user!.role === 'LOGISTICS' && dbCategory === 'RMA') {
    return res.status(403).json({ error: 'Logistics has view-only access to RMA/TASS records' });
  }

  if (
    req.user!.role === 'SALES_COORDINATOR' &&
    ((b.driver && String(b.driver).trim()) || (Array.isArray(b.driver_assistants) && b.driver_assistants.some((a: string) => String(a).trim())))
  ) {
    return res.status(403).json({ error: 'Sales Coordinator cannot assign drivers — use the Logistics role' });
  }

  const dbStatus = STATUS_TO_DB[b.status] ?? 'SCHEDULED';

  const created = await prisma.deliveryRecord.create({
    data: {
      id: generateRecordId(),
      companyId: b.company_id,
      priority: b.priority ?? '2 - Moderate',
      reference: b.reference,
      remarks: b.remarks ?? '',
      status: dbStatus as any,
      vehicle: b.vehicle ?? '(None)',
      area: b.area ?? '',
      driver: '',
      driverAssistants: '[]',
      timeIn: null,
      timeOut: null,
      receivedBy: null,
      accountManager: b.account_manager ?? '',
      deliveryDate: b.delivery_date ?? '',
      category: dbCategory as any,
      itemType: b.item_type ?? 'Small Item',
      draft: b.is_draft === 'Yes',
      dateAndTime: b.date_time ?? new Date().toISOString(),
      itemDescription: b.item_description ?? '',
      address: b.address ?? '',
      documentAttachment: Array.isArray(b.attachments) && b.attachments.length > 0 ? b.attachments[0] : null,
      amount: b.amount != null ? parseFloat(String(b.amount)) : null,
      createdById: req.user!.id,
      modifiedById: req.user!.id
    },
    include: recordInclude
  });

  await writeAuditLog({
    recordId: created.id,
    recordType: 'DeliveryRecord',
    action: 'CREATE',
    changedById: req.user!.id,
    previousValue: null,
    newValue: serializeRecord(created)
  });

  await createRemarkLog(created.id, b.remarks ?? '', 'CREATION', req.user!.id);

  await notifyRole(
    'LOGISTICS',
    `New ${dbCategory.replace(/_/g, ' ')} record — driver needed`,
    `${created.company.name} · ${created.reference || '(no reference)'}${created.deliveryDate ? ` on ${created.deliveryDate}` : ''} requires driver assignment.`,
    created.id,
    'DeliveryRecord'
  );

  res.status(201).json(serializeRecord(created));
});

// Full update - ADMIN added alongside LOGISTICS for linked collection management.
// SoD: only LOGISTICS/ADMIN may set driver/vehicle/driverAssistant/linkedCollectionId.
router.put('/:id', requireAuth, requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER', 'TASS'), async (req, res) => {
  const existing = await prisma.deliveryRecord.findFirst({ where: { id: req.params.id, deletedAt: null }, include: recordInclude });
  if (!existing) return res.status(404).json({ error: 'Record not found' });

  // Only LOGISTICS (not ADMIN) is blocked from RMA records per SoD
  if (req.user!.role === 'LOGISTICS' && existing.category === 'RMA') {
    return res.status(403).json({ error: 'Logistics has view-only access to RMA/TASS records' });
  }
  // TASS may only write RMA records
  if (req.user!.role === 'TASS' && existing.category !== 'RMA') {
    return res.status(403).json({ error: 'TASS write access is limited to RMA records' });
  }

  const b = req.body ?? {};

  const LOGISTICS_SUBSTANTIVE_FIELDS = ['driver', 'vehicle', 'driver_assistants', 'time_in', 'time_out', 'received_by', 'linked_collection_id', 'area', 'address'];
  const SC_SUBSTANTIVE_FIELDS = ['company_id', 'priority', 'reference', 'area', 'address', 'account_manager', 'delivery_date', 'item_type', 'is_draft', 'date_time', 'item_description', 'attachments', 'amount'];
  const substantiveFields = (req.user!.role === 'LOGISTICS' || req.user!.role === 'ADMIN' || req.user!.role === 'TASS')
    ? LOGISTICS_SUBSTANTIVE_FIELDS
    : SC_SUBSTANTIVE_FIELDS;
  const hasSubstantiveChange = substantiveFields.some(f => f in b);

  if (req.user!.role !== 'DRIVER' && hasSubstantiveChange && (!b.remarks || !String(b.remarks).trim())) {
    return res.status(400).json({ error: 'Remarks are required when editing a record.' });
  }

  const data: any = { modifiedById: req.user!.id };

  if (req.user!.role === 'DRIVER') {
    if (existing.driver !== req.user!.name) {
      return res.status(403).json({ error: 'Drivers may only update their own assigned records' });
    }
    if (b.time_in !== undefined) data.timeIn = b.time_in ?? null;
    if (b.time_out !== undefined) data.timeOut = b.time_out ?? null;
    if (b.received_by !== undefined) data.receivedBy = b.received_by ?? null;
  } else if (req.user!.role === 'LOGISTICS' || req.user!.role === 'ADMIN' || req.user!.role === 'TASS') {
    if (b.driver !== undefined) data.driver = b.driver;
    if (b.vehicle !== undefined) data.vehicle = b.vehicle;
    if (b.driver_assistants !== undefined) data.driverAssistants = JSON.stringify(Array.isArray(b.driver_assistants) ? b.driver_assistants : []);
    if (b.time_in !== undefined) data.timeIn = b.time_in ?? null;
    if (b.time_out !== undefined) data.timeOut = b.time_out ?? null;
    if (b.received_by !== undefined) data.receivedBy = b.received_by ?? null;
    if (b.area !== undefined) data.area = b.area;
    if (b.address !== undefined) data.address = b.address;
    if (b.remarks !== undefined) data.remarks = b.remarks;

    // Link to an Accounting Collection record (or clear the link)
    if (b.linked_collection_id !== undefined) {
      if (b.linked_collection_id === null || b.linked_collection_id === '') {
        data.linkedCollectionId = null;
      } else {
        const target = await prisma.deliveryRecord.findFirst({
          where: { id: b.linked_collection_id, deletedAt: null, category: 'ACCOUNTING_COLLECTION' }
        });
        if (!target) {
          return res.status(400).json({ error: 'Linked record must be an existing Accounting Collection record' });
        }
        data.linkedCollectionId = b.linked_collection_id;
      }
    }
  } else {
    // Sales Coordinator: metadata fields only (driver/vehicle/linkedCollection excluded by SoD)
    if (b.company_id !== undefined) data.companyId = b.company_id;
    if (b.priority !== undefined) data.priority = b.priority;
    if (b.reference !== undefined) data.reference = b.reference;
    if (b.remarks !== undefined) data.remarks = b.remarks;
    if (b.area !== undefined) data.area = b.area;
    if (b.account_manager !== undefined) data.accountManager = b.account_manager;
    if (b.delivery_date !== undefined) data.deliveryDate = b.delivery_date;
    if (b.item_type !== undefined) data.itemType = b.item_type;
    if (b.is_draft !== undefined) data.draft = b.is_draft === 'Yes';
    if (b.date_time !== undefined) data.dateAndTime = b.date_time;
    if (b.item_description !== undefined) data.itemDescription = b.item_description;
    if (Array.isArray(b.attachments) && b.attachments.length > 0) data.documentAttachment = b.attachments[0];
    if (b.amount !== undefined) data.amount = b.amount != null ? parseFloat(String(b.amount)) : null;
    if (b.address !== undefined) data.address = b.address;
  }

  const updated = await prisma.deliveryRecord.update({
    where: { id: existing.id },
    data,
    include: recordInclude
  });

  await writeAuditLog({
    recordId: updated.id,
    recordType: 'DeliveryRecord',
    action: 'UPDATE',
    changedById: req.user!.id,
    previousValue: serializeRecord(existing),
    newValue: serializeRecord(updated)
  });

  // Write remark log for every non-DRIVER edit that has remarks
  if (req.user!.role !== 'DRIVER' && b.remarks && String(b.remarks).trim()) {
    const context = (req.user!.role === 'LOGISTICS' || req.user!.role === 'ADMIN' || req.user!.role === 'TASS') ? 'DRIVER_UPDATE' : 'GENERAL_EDIT';
    await createRemarkLog(updated.id, b.remarks, context, req.user!.id);
  }

  // Notify the record creator (Sales Coordinator) when Logistics assigns a driver
  if (
    req.user!.role === 'LOGISTICS' &&
    b.driver &&
    String(b.driver).trim() &&
    !existing.driver
  ) {
    await notifyUser(
      existing.createdById,
      'Driver assigned',
      `${b.driver} has been assigned to ${existing.company.name} · ${existing.reference}.`,
      existing.id,
      'DeliveryRecord'
    );
  }

  res.json(serializeRecord(updated));
});

// Status change — Logistics, Sales Coordinator, Admin, and Driver (own records).
// This is also the sole path that fires the ACCOMPLISHED automated trigger.
router.patch('/:id/status', requireAuth, requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER', 'TASS'), async (req, res) => {
  const { status, remarks, time_out, received_by } = req.body ?? {};
  if (!status || !STATUS_TO_DB[status]) {
    return res.status(400).json({ error: 'Valid status is required' });
  }
  if (!remarks || !String(remarks).trim()) {
    return res.status(400).json({ error: 'Remarks are required when changing status.' });
  }

  const existing = await prisma.deliveryRecord.findFirst({ where: { id: req.params.id, deletedAt: null }, include: recordInclude });
  if (!existing) return res.status(404).json({ error: 'Record not found' });

  if (req.user!.role === 'DRIVER' && existing.driver !== req.user!.name) {
    return res.status(403).json({ error: 'Drivers may only update their own assigned records' });
  }

  if (req.user!.role === 'LOGISTICS' && existing.category === 'RMA') {
    return res.status(403).json({ error: 'Logistics has view-only access to RMA/TASS records' });
  }
  if (req.user!.role === 'TASS' && existing.category !== 'RMA') {
    return res.status(403).json({ error: 'TASS status updates are limited to RMA records' });
  }

  const dbStatus = STATUS_TO_DB[status];

  const statusData: any = {
    status: dbStatus as any,
    remarks: String(remarks).trim(),
    modifiedById: req.user!.id
  };
  if (time_out !== undefined) statusData.timeOut = time_out ?? null;
  if (received_by !== undefined) statusData.receivedBy = received_by ?? null;

  const updated = await prisma.deliveryRecord.update({
    where: { id: existing.id },
    data: statusData,
    include: recordInclude
  });

  await writeAuditLog({
    recordId: updated.id,
    recordType: 'DeliveryRecord',
    action: 'UPDATE',
    changedById: req.user!.id,
    previousValue: serializeRecord(existing),
    newValue: serializeRecord(updated)
  });

  await createRemarkLog(updated.id, String(remarks).trim(), 'STATUS_CHANGE', req.user!.id);

  if (dbStatus === 'ACCOMPLISHED' && existing.status !== 'ACCOMPLISHED') {
    await notifyAccomplished({
      id: updated.id,
      companyName: updated.company.name,
      deliveryDate: updated.deliveryDate,
      reference: updated.reference,
      accountManager: updated.accountManager,
      accomplishedByName: req.user!.name,
      recipientOverride: existing.category === 'ACCOUNTING_COLLECTION' ? 'Billing Department' : undefined
    });

    if (existing.category === 'ACCOUNTING_COLLECTION') {
      await notifyRole(
        'TASS',
        'Collection ready for verification',
        `${updated.company.name} · ${updated.reference} is now accomplished and requires collection verification.`,
        updated.id,
        'DeliveryRecord'
      );
    }
  }

  res.json(serializeRecord(updated));
});

// Collection verification - TASS only, for ACCOUNTING_COLLECTION records that are ACCOMPLISHED.
router.patch('/:id/verify-collection', requireAuth, requireRole('TASS'), async (req, res) => {
  const existing = await prisma.deliveryRecord.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: recordInclude
  });
  if (!existing) return res.status(404).json({ error: 'Record not found' });

  if (existing.category !== 'ACCOUNTING_COLLECTION') {
    return res.status(403).json({ error: 'Collection verification only applies to Accounting Collection records' });
  }

  if (existing.status !== 'ACCOMPLISHED') {
    return res.status(400).json({ error: 'Collection can only be verified after delivery is marked Accomplished' });
  }

  if (existing.collectionVerified) {
    return res.status(400).json({ error: 'This collection has already been verified' });
  }

  const updated = await prisma.deliveryRecord.update({
    where: { id: existing.id },
    data: {
      collectionVerified: true,
      collectionVerifiedBy: req.user!.name,
      collectionVerifiedAt: new Date(),
      modifiedById: req.user!.id
    },
    include: recordInclude
  });

  await writeAuditLog({
    recordId: updated.id,
    recordType: 'DeliveryRecord',
    action: 'UPDATE',
    changedById: req.user!.id,
    previousValue: serializeRecord(existing),
    newValue: serializeRecord(updated)
  });

  await notifyUser(
    existing.createdById,
    'Collection verified',
    `${updated.company.name} · ${updated.reference} collection verified by ${req.user!.name}.`,
    updated.id,
    'DeliveryRecord'
  );

  res.json(serializeRecord(updated));
});

// Soft delete only - never hard-delete, per spec.
router.delete('/:id', requireAuth, requireRole('SALES_COORDINATOR'), async (req, res) => {
  const existing = await prisma.deliveryRecord.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) return res.status(404).json({ error: 'Record not found' });

  const updated = await prisma.deliveryRecord.update({
    where: { id: existing.id },
    data: { deletedAt: new Date(), modifiedById: req.user!.id },
    include: recordInclude
  });

  await writeAuditLog({
    recordId: updated.id,
    recordType: 'DeliveryRecord',
    action: 'DELETE',
    changedById: req.user!.id,
    previousValue: serializeRecord(existing),
    newValue: serializeRecord(updated)
  });

  res.json({ ok: true });
});

// ── Comments ──────────────────────────────────────────────────────────────────
router.get('/:id/comments', requireAuth, async (req, res) => {
  const comments = await prisma.comment.findMany({
    where: { recordId: req.params.id, recordType: 'DeliveryRecord' },
    include: { author: { select: { name: true } } },
    orderBy: { createdAt: 'asc' }
  });
  res.json(
    comments.map(c => ({
      id: c.id,
      body: c.body,
      author: c.author.name,
      created_at: c.createdAt,
      updated_at: c.updatedAt
    }))
  );
});

router.post('/:id/comments', requireAuth, async (req, res) => {
  const { body } = req.body ?? {};
  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'Comment body is required' });
  }

  const record = await prisma.deliveryRecord.findFirst({
    where: { id: req.params.id, deletedAt: null }
  });
  if (!record) return res.status(404).json({ error: 'Record not found' });

  const comment = await prisma.comment.create({
    data: {
      recordId: req.params.id,
      recordType: 'DeliveryRecord',
      body: String(body).trim(),
      authorId: req.user!.id
    },
    include: { author: { select: { name: true } } }
  });

  res.status(201).json({
    id: comment.id,
    body: comment.body,
    author: comment.author.name,
    created_at: comment.createdAt,
    updated_at: comment.updatedAt
  });
});

export default router;
