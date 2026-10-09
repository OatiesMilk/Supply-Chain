import express, { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { asyncRoute } from '../middleware/asyncRoute';
import { assignmentError, resolveDriverAssignment, withDriverDirectoryLock, type DriverChange } from '../services/driverDirectory';
import { requireAuth, requireRole, requireResource } from '../middleware/auth';
import { writeAuditLog } from '../services/audit';
import { notifyAccomplished } from '../services/notify';
import { notifyRole, notifyUser } from '../services/inAppNotify';
import { CATEGORY_TO_DB, STATUS_TO_DB, STATUS_FROM_DB, serializeRecord } from '../mappings';
import { podStorage, podUpload } from '../services/podStorage';
import { DELIVERY_PHOTO_REQUIRED, hasStoredDeliveryPhoto, isPhotoMimeType, isVerifiedPodPhoto, isStoredPodPhoto, lockPodRecord } from '../services/podPhotos';

import { canWriteCategory, isAssignedDriver, recordScope } from '../services/recordAccess';
import { deliveryScheduleState, driverDeliveryDateError, isValidDateOnly, isoTimestamp, manilaToday, runState, timeInError, transitionError, type RunState } from '../services/deliveryLifecycle';

const router = Router();
const PRIORITY_LOCKED_ERROR = "Priority can't be changed after a record is Delivered.";
const requireRecordAccess = asyncRoute(async (req, res, next) => {
  if (req.params.id) {
    const record = await prisma.deliveryRecord.findFirst({
      where: { id: req.params.id, deletedAt: null, AND: [recordScope(req.user!)] },
      select: { category: true },
    });
    if (!record) return res.status(403).json({ error: 'Record access denied' });
    if (req.method !== 'GET' && req.user!.role === 'LOGISTICS' && record.category === 'RMA') {
      return res.status(403).json({ error: 'Logistics has view-only access to RMA records' });
    }
    if (req.method !== 'GET' && !canWriteCategory(req.user!, record.category)) {
      return res.status(403).json({ error: req.user!.role === 'LOGISTICS' && record.category === 'RMA' ? 'Logistics has view-only access to RMA records' : 'Module access denied' });
    }
  } else if (req.method === 'POST' && req.body?.category) {
    const category = CATEGORY_TO_DB[req.body.category] ?? req.body.category;
    if (!canWriteCategory(req.user!, category)) return res.status(403).json({ error: 'Module access denied' });
  }
  next();
});

const recordInclude = {
  company: true,
  lineItems: true,
  createdBy: true,
  modifiedBy: true,
  linkedCollection: {
    include: { company: true }
  },
  podAttachments: { orderBy: { createdAt: 'desc' as const } }
};

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateRecordId(): string {
  return `REC-${randInt(10000, 49999)}`;
}

const TASS_CATEGORIES: string[] = ['ACCOUNTING_COLLECTION', 'RMA'];
const LIST_ID_PATTERN = /^[\w-]{1,64}$/;
const LIST_MAX_LIMIT = 100;

// Optional filters for GET /records. Without any query params the endpoint
// keeps returning every record the user can read, newest first.
function parseListQuery(query: express.Request['query']) {
  const { company_id, category, limit, cursor } = query;
  const where: Prisma.DeliveryRecordWhereInput = {};
  let take: number | undefined;

  if (company_id !== undefined) {
    if (typeof company_id !== 'string' || !LIST_ID_PATTERN.test(company_id)) return { error: 'company_id is invalid' };
    where.companyId = company_id;
  }
  if (category !== undefined) {
    const dbCategory = typeof category === 'string' ? CATEGORY_TO_DB[category] : undefined;
    if (!dbCategory) return { error: 'category is invalid' };
    where.category = dbCategory as Prisma.DeliveryRecordWhereInput['category'];
  }
  if (limit !== undefined) {
    take = typeof limit === 'string' && /^\d+$/.test(limit) ? Number(limit) : NaN;
    if (!(take >= 1 && take <= LIST_MAX_LIMIT)) return { error: `limit must be between 1 and ${LIST_MAX_LIMIT}` };
  }
  if (cursor !== undefined) {
    if (typeof cursor !== 'string' || !LIST_ID_PATTERN.test(cursor)) return { error: 'cursor is invalid' };
    if (take === undefined) return { error: 'cursor requires limit' };
  }
  return { where, take, cursor: cursor as string | undefined };
}

router.get('/', requireAuth, requireResource('records'), requireRecordAccess, async (req, res) => {
  const parsed = parseListQuery(req.query);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });

  // recordScope stays in the AND list so filters can only narrow what the
  // user is already allowed to read. An unknown or out-of-scope company
  // returns an empty list rather than revealing whether it exists.
  const records = await prisma.deliveryRecord.findMany({
    where: { deletedAt: null, ...parsed.where, AND: [recordScope(req.user!)] },
    include: recordInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(parsed.take !== undefined ? { take: parsed.take } : {}),
    ...(parsed.cursor ? { cursor: { id: parsed.cursor }, skip: 1 } : {}),
  });
  res.json(records.map(serializeRecord));
});

// Must be before /:id to avoid "status-history-counts" matching as an ID
router.get('/status-history-counts', requireAuth, requireResource('records'), requireRecordAccess, async (req, res) => {
  const { category, dateFrom, dateTo, area, driver, status } = req.query as Record<string, string>;

  const where: any = {
    deletedAt: null,
    AND: [recordScope(req.user!)]
  };

  if (category) where.category = CATEGORY_TO_DB[category] ?? category;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(`${dateFrom}T00:00:00`);
    if (dateTo)   where.createdAt.lte = new Date(`${dateTo}T23:59:59`);
  }
  if (area)   where.area   = area;
  if (driver) where.driver = driver;
  const candidates = await prisma.deliveryRecord.findMany({
    where,
    select: { id: true, status: true, draft: true, timeIn: true }
  });
  // Draft shares its stored enum with Scheduled; legacy started runs can also
  // still carry SCHEDULED. Filter the same effective state returned to clients.
  const filteredStatus = STATUS_FROM_DB[status] ?? status;
  const records = status ? candidates.filter(record => runState(record) === filteredStatus) : candidates;

  const STATUSES = ['Draft', 'Scheduled', 'In Transit', 'Delivered', 'Pending', 'On-Hold', 'Rescheduled'];
  const current: Record<string, number>  = Object.fromEntries(STATUSES.map(s => [s, 0]));
  const ever_held: Record<string, number> = Object.fromEntries(STATUSES.map(s => [s, 0]));
  const recordStatusMap = new Map<string, Set<string>>();

  for (const r of records) {
    const s = runState(r);
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
        for (const snapshot of [nv, pv]) if (snapshot?.status) set.add(runState({
          status: STATUS_TO_DB[snapshot.status] ?? snapshot.status,
          draft: snapshot.draft === true || snapshot.is_draft === 'Yes' || snapshot.status === 'Draft',
          timeIn: snapshot.timeIn ?? snapshot.time_in,
        }));
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

router.get('/:id', requireAuth, requireResource('records'), requireRecordAccess, async (req, res) => {
  const record = await prisma.deliveryRecord.findFirst({
    where: { id: req.params.id, deletedAt: null, AND: [recordScope(req.user!)] },
    include: recordInclude
  });
  if (!record) return res.status(404).json({ error: 'Record not found' });

  if (req.user!.role === 'TASS' && !TASS_CATEGORIES.includes(record.category as any)) {
    return res.status(403).json({ error: 'TASS may only view Accounting Collection and RMA records' });
  }

  res.json(serializeRecord(record));
});

router.get('/:id/audit', requireAuth, requireResource('records'), requireRecordAccess, async (req, res) => {
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

router.get('/:id/attachments', requireAuth, requireResource('records'), requireRecordAccess, asyncRoute(async (req, res) => {
  const attachments = await prisma.podAttachment.findMany({
    where: { recordId: req.params.id },
    orderBy: { createdAt: 'desc' }
  });
  res.json(await Promise.all(attachments.map(async attachment => ({
    id: attachment.id,
    name: attachment.originalName,
    mime_type: attachment.mimeType,
    is_photo: await isStoredPodPhoto(attachment),
    size: attachment.size,
    uploaded_at: attachment.createdAt,
    download_url: `/api/records/${req.params.id}/attachments/${attachment.id}/download`
  }))));
}));

router.post(
  '/:id/attachments',
  requireAuth,
  requireResource('records'),
  requireRecordAccess,
  requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER'),
  podUpload.single('file'),
  asyncRoute(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'A file is required.' });
    const isPhoto = await isVerifiedPodPhoto(req.file.buffer, req.file.mimetype);
    if (isPhotoMimeType(req.file.mimetype) && !isPhoto) {
      return res.status(400).json({ error: 'This file is not a valid JPG or PNG photo. Choose a photo and try again.' });
    }
    let storageKey: string | undefined;
    let result;
    try {
      result = await prisma.$transaction(async tx => {
        await lockPodRecord(tx, req.params.id);
        const record = await tx.deliveryRecord.findUnique({ where: { id: req.params.id } });
        if (!record || record.deletedAt) return { status: 404, error: 'Record not found', attachment: null };
        if (req.user!.role === 'DRIVER' && !isAssignedDriver(req.user!, record)) {
          return { status: 403, error: 'Drivers may only upload to their own assigned records', attachment: null };
        }
        if (!canWriteCategory(req.user!, record.category) || (req.user!.role === 'LOGISTICS' && record.category === 'RMA')) {
          return { status: 403, error: 'Record access denied', attachment: null };
        }
        const dateError = driverDeliveryDateError(record, req.user!.role);
        if (dateError) return { status: 400, error: dateError, attachment: null };
        storageKey = await podStorage.save({
          originalName: req.file!.originalname, mimeType: req.file!.mimetype,
          size: req.file!.size, buffer: req.file!.buffer,
        });
        const attachment = await tx.podAttachment.create({ data: {
          recordId: record.id, originalName: req.file!.originalname, storageKey,
          mimeType: req.file!.mimetype, size: req.file!.size, uploadedById: req.user!.id,
        } });
        if (record.category === 'DELIVERY') {
          const schedule = deliveryScheduleState(record.deliveryDate);
          await tx.auditLog.create({ data: {
            recordId: record.id, recordType: 'DeliveryRecord', action: 'UPDATE', changedById: req.user!.id,
            previousValue: JSON.stringify({ attachment_uploaded: null }),
            newValue: JSON.stringify({
              attachment_uploaded: { id: attachment.id, name: attachment.originalName },
              delivery_date: record.deliveryDate,
              overdue: schedule.overdue,
              days_late: schedule.daysLate,
            }),
          } });
        }
        return { status: 201, error: null, attachment };
      }, { timeout: 30_000 });
    } catch (error) {
      // Object storage is external to the database transaction: compensate on
      // metadata or commit failure, retaining the existing orphan-recovery log.
      if (storageKey) await podStorage.remove(storageKey).catch(cleanupError => {
        console.error('[POD] Failed to clean up storage after metadata failure', cleanupError);
      });
      throw error;
    }
    if (result.error) return res.status(result.status).json({ error: result.error });
    const attachment = result.attachment!;
    res.status(201).json({
      id: attachment.id,
      name: attachment.originalName,
      mime_type: attachment.mimeType,
      is_photo: isPhoto,
      size: attachment.size,
      uploaded_at: attachment.createdAt,
      download_url: `/api/records/${req.params.id}/attachments/${attachment.id}/download`
    });
  })
);

router.get('/:id/attachments/:attachmentId/download', requireAuth, requireResource('records'), requireRecordAccess, asyncRoute(async (req, res) => {
  const attachment = await prisma.podAttachment.findFirst({
    where: { id: req.params.attachmentId, recordId: req.params.id }
  });
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
  try {
    const content = await podStorage.read(attachment.storageKey);
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(attachment.originalName)}"`);
    res.send(content);
  } catch (error) {
    if (!res.headersSent) res.status(404).json({ error: 'Attachment file not found' });
    else console.error('[POD] Failed to read attachment', error);
  }
}));

router.delete('/:id/attachments/:attachmentId', requireAuth, requireResource('records'), requireRecordAccess, requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN'), asyncRoute(async (req, res) => {
  const remarks = typeof req.body?.remarks === 'string' ? req.body.remarks.trim() : '';

  const result = await prisma.$transaction(async tx => {
    await lockPodRecord(tx, req.params.id);
    const attachment = await tx.podAttachment.findFirst({ where: { id: req.params.attachmentId, recordId: req.params.id } });
    if (!attachment) return { status: 404, error: 'Attachment not found' };
    const record = await tx.deliveryRecord.findUnique({ where: { id: req.params.id } });
    if (record?.status === 'ACCOMPLISHED' &&
        await isStoredPodPhoto(attachment) && !await hasStoredDeliveryPhoto(tx, record.id, attachment.id)) {
      return { status: 409, error: 'Keep at least one delivery photo on an accomplished delivery. Upload a replacement before removing this photo.' };
    }
    try {
      await podStorage.remove(attachment.storageKey);
    } catch {
      return { status: 500, error: 'Attachment could not be removed from storage. The database record was preserved for retry.' };
    }
    await tx.podAttachment.delete({ where: { id: attachment.id } });
    await tx.auditLog.create({ data: { recordId: req.params.id, recordType: 'DeliveryRecord', action: 'UPDATE', changedById: req.user!.id, previousValue: JSON.stringify({ attachment: attachment.originalName, attachment_id: attachment.id }), newValue: JSON.stringify({ attachment_removed: attachment.id }) } });
    if (remarks) await tx.remarkLog.create({ data: { recordId: req.params.id, body: `Removed attachment ${attachment.originalName}: ${remarks}`, context: 'GENERAL_EDIT', authorId: req.user!.id } });
    return null;
  });
  if (result) return res.status(result.status).json({ error: result.error });
  res.status(204).send();
}));

// Append-only remarks history
router.get('/:id/remarks', requireAuth, requireResource('records'), requireRecordAccess, async (req, res) => {
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

// Create a Draft or Scheduled record. Assignment happens after submission.
router.post('/', requireAuth, requireResource('records'), requireRecordAccess, requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN'), asyncRoute(async (req, res) => {
  const b = req.body ?? {};
  const isDraft = b.is_draft === 'Yes' || b.status === 'Draft';
  const required = isDraft
    ? ['company_id', 'category']
    : ['company_id', 'reference', 'category'];
  const missing = required.filter(k => typeof b[k] !== 'string' || !b[k].trim());
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const dbCategory = CATEGORY_TO_DB[b.category] ?? b.category;

  if (req.user!.role === 'LOGISTICS' && dbCategory === 'RMA') {
    return res.status(403).json({ error: 'Logistics has view-only access to RMA records' });
  }

  const requestsDriver = (b.driver && String(b.driver).trim()) || (b.driver_id && String(b.driver_id).trim());
  if (
    req.user!.role === 'SALES_COORDINATOR' &&
    (requestsDriver || (Array.isArray(b.driver_assistants) && b.driver_assistants.some((a: string) => String(a).trim())))
  ) {
    return res.status(403).json({ error: 'Sales Coordinator cannot assign drivers — use the Logistics role' });
  }

  if (!isDraft && !b.reference?.trim()) return res.status(400).json({ error: 'Reference is required' });
  if (!isDraft && !b.delivery_date) return res.status(400).json({ error: 'Delivery Date is required' });
  if (b.status && !['Draft', 'Scheduled'].includes(b.status)) return res.status(400).json({ error: 'New records must be Draft or Scheduled.' });
  if (requestsDriver || (Array.isArray(b.driver_assistants) && b.driver_assistants.length)) return res.status(400).json({ error: 'Assign drivers after submitting the record.' });
  const created = await prisma.$transaction(async tx => {
    const created = await tx.deliveryRecord.create({
      data: {
        id: generateRecordId(),
        companyId: b.company_id,
        priority: b.priority ?? '2 - Moderate',
        reference: b.reference ?? '',
        remarks: b.remarks ?? '',
        status: 'SCHEDULED',
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
        draft: isDraft,
        
        itemDescription: b.item_description ?? '',
        lineItems: Array.isArray(b.line_items) ? {
          create: b.line_items.map((li: any) => ({
            sku: li.sku || li.description || '',
            quantity: typeof li.quantity === 'number' ? li.quantity : parseInt(li.quantity, 10) || 1
          }))
        } : undefined,
        address: b.address ?? '',
        documentAttachment: Array.isArray(b.attachments) && b.attachments.length > 0 ? b.attachments[0] : null,
        amount: b.amount != null ? parseFloat(String(b.amount)) : null,
        createdById: req.user!.id,
        modifiedById: req.user!.id
      },
      include: recordInclude
    });

    await tx.auditLog.create({ data: {
      recordId: created.id, recordType: 'DeliveryRecord', action: 'CREATE', changedById: req.user!.id,
      newValue: JSON.stringify(serializeRecord(created)),
    } });
    if (typeof b.remarks === 'string' && b.remarks.trim()) await tx.remarkLog.create({ data: { recordId: created.id, body: b.remarks.trim(), context: 'CREATION', authorId: req.user!.id } });
    return created;
  });

  if (!isDraft) await notifyRole(
    'LOGISTICS',
    `New ${dbCategory.replace(/_/g, ' ')} record — driver needed`,
    `${created.company.name} · ${created.reference || '(no reference)'}${created.deliveryDate ? ` on ${created.deliveryDate}` : ''} requires driver assignment.`,
    created.id,
    'DeliveryRecord'
  );

  res.status(201).json(serializeRecord(created));
}));

// Full update - ADMIN added alongside LOGISTICS for linked collection management.
// SoD: only LOGISTICS/ADMIN may set driver/vehicle/driverAssistant/linkedCollectionId.
router.put('/:id', requireAuth, requireResource('records'), requireRecordAccess, requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER', 'TASS'), asyncRoute(async (req, res) => {
  const existing = await prisma.deliveryRecord.findFirst({ where: { id: req.params.id, deletedAt: null, AND: [recordScope(req.user!)] }, include: recordInclude });
  if (!existing) return res.status(404).json({ error: 'Record not found' });

  // Only LOGISTICS (not ADMIN) is blocked from RMA records per SoD
  if (req.user!.role === 'LOGISTICS' && existing.category === 'RMA') {
    return res.status(403).json({ error: 'Logistics has view-only access to RMA records' });
  }
  // TASS may only write RMA records
  if (req.user!.role === 'TASS' && existing.category !== 'RMA') {
    return res.status(403).json({ error: 'TASS write access is limited to RMA records' });
  }

  const b = req.body ?? {};
  if (b.status !== undefined) return res.status(400).json({ error: 'Use the status action to change status.' });
  const hasTimestamp = b.time_in !== undefined || b.time_out !== undefined;
  if (hasTimestamp && !['LOGISTICS', 'ADMIN'].includes(req.user!.role)) return res.status(403).json({ error: 'Only Logistics or Admin may correct recorded timestamps.' });
  for (const [field, current] of [['time_in', existing.timeIn], ['time_out', existing.timeOut]] as const) {
    if (b[field] !== undefined && (!current || !isoTimestamp(b[field]))) return res.status(400).json({ error: 'Corrections require an existing timestamp and a full ISO timestamp with timezone. Use Record Time In to start the run.' });
  }
  if (b.is_draft !== undefined && !['Yes', 'No'].includes(b.is_draft)) return res.status(400).json({ error: 'is_draft must be Yes or No.' });
  if (b.is_draft !== undefined && (b.is_draft === 'Yes') !== existing.draft && !['SALES_COORDINATOR', 'ADMIN'].includes(req.user!.role)) return res.status(403).json({ error: 'Only Sales Coordinator or Admin may submit or return drafts.' });

  if (b.priority !== undefined) {
    if (!['SALES_COORDINATOR', 'LOGISTICS', 'ADMIN'].includes(req.user!.role)) {
      return res.status(403).json({ error: 'Your role cannot change record priority.' });
    }
    if (!['1 - Low', '2 - Moderate', '3 - High'].includes(b.priority)) {
      return res.status(400).json({ error: 'Invalid record priority.' });
    }
  }

  const LOGISTICS_SUBSTANTIVE_FIELDS = ['driver', 'driver_id', 'vehicle', 'driver_assistants', 'time_in', 'time_out', 'received_by', 'linked_collection_id', 'area', 'address', 'priority'];
  const SC_SUBSTANTIVE_FIELDS = ['company_id', 'priority', 'reference', 'area', 'address', 'account_manager', 'delivery_date', 'item_type', 'is_draft', 'date_time', 'item_description', 'line_items', 'attachments', 'amount'];
  const substantiveFields = req.user!.role === 'ADMIN' ? [...LOGISTICS_SUBSTANTIVE_FIELDS, ...SC_SUBSTANTIVE_FIELDS] : (req.user!.role === 'LOGISTICS' || req.user!.role === 'TASS')
    ? LOGISTICS_SUBSTANTIVE_FIELDS
    : SC_SUBSTANTIVE_FIELDS;
  const logisticsDeliveryDateChange = req.user!.role === 'LOGISTICS' && existing.category === 'DELIVERY' && b.delivery_date !== undefined;
  const hasSubstantiveChange = substantiveFields.some(f => f in b) || logisticsDeliveryDateChange;

  if ((hasSubstantiveChange || hasTimestamp || b.is_draft !== undefined || b.received_by !== undefined || b.remarks !== undefined) && (typeof b.remarks !== 'string' || !b.remarks.trim())) {
    return res.status(400).json({ error: 'Remarks are required when editing a record.' });
  }

  const data: any = { modifiedById: req.user!.id };
  let driverChange: DriverChange | undefined;

  if (req.user!.role === 'DRIVER') {
    if (!isAssignedDriver(req.user!, existing)) {
      return res.status(403).json({ error: 'Drivers may only update their own assigned records' });
    }

    if (b.received_by !== undefined) data.receivedBy = b.received_by ?? null;
  } else if (req.user!.role === 'LOGISTICS' || req.user!.role === 'ADMIN' || req.user!.role === 'TASS') {
    if (req.user!.role === 'LOGISTICS' && existing.category === 'DELIVERY' && b.delivery_date !== undefined) {
      if (!isValidDateOnly(b.delivery_date)) return res.status(400).json({ error: 'Delivery Date must be a valid YYYY-MM-DD date.' });
      data.deliveryDate = b.delivery_date;
    }
    if (b.priority !== undefined) data.priority = b.priority;
    // The stable profile id is resolved under the directory lock below.
    if (b.driver_id !== undefined) {
      if (b.driver_id !== null && typeof b.driver_id !== 'string') return res.status(400).json({ error: 'driver_id must be a Driver profile id or null.' });
      driverChange = { id: b.driver_id || null };
    } else if (b.driver !== undefined) {
      if (typeof b.driver !== 'string') return res.status(400).json({ error: 'Driver must be a name or an empty string.' });
      driverChange = { name: b.driver };
    }
    if (b.vehicle !== undefined) data.vehicle = b.vehicle;
    if (b.driver_assistants !== undefined) {
      if (!Array.isArray(b.driver_assistants)) return res.status(400).json({ error: 'Assistants must be an array of names.' });
      data.driverAssistants = JSON.stringify(b.driver_assistants);
    }
    if (b.time_in !== undefined) data.timeIn = isoTimestamp(b.time_in);
    if (b.time_out !== undefined) data.timeOut = isoTimestamp(b.time_out);
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
    
    if (b.item_description !== undefined) data.itemDescription = b.item_description;
    if (b.line_items !== undefined && Array.isArray(b.line_items)) {
      data.lineItems = {
        deleteMany: {},
        create: b.line_items.map((li: any) => ({
          sku: li.sku || li.description || '',
          quantity: typeof li.quantity === 'number' ? li.quantity : parseInt(li.quantity, 10) || 1
        }))
      };
    }
    if (Array.isArray(b.attachments) && b.attachments.length > 0) data.documentAttachment = b.attachments[0];
    if (b.amount !== undefined) data.amount = b.amount != null ? parseFloat(String(b.amount)) : null;
    if (b.address !== undefined) data.address = b.address;
  }

  if (existing.category === 'DELIVERY' && (req.user!.role === 'SALES_COORDINATOR' || req.user!.role === 'ADMIN') && b.delivery_date !== undefined && !isValidDateOnly(b.delivery_date)) {
    return res.status(400).json({ error: 'Delivery Date must be a valid YYYY-MM-DD date.' });
  }

  // Admin can correct the same full metadata exposed by the staff editor.
  if (req.user!.role === 'ADMIN') {
    const metadata: Record<string, string> = { company_id: 'companyId', reference: 'reference', account_manager: 'accountManager', delivery_date: 'deliveryDate', item_type: 'itemType', item_description: 'itemDescription' };
    for (const [input, field] of Object.entries(metadata)) if (b[input] !== undefined) data[field] = b[input];
    if (b.amount !== undefined) data.amount = b.amount != null ? parseFloat(String(b.amount)) : null;
    if (Array.isArray(b.attachments) && b.attachments.length > 0) data.documentAttachment = b.attachments[0];
    if (Array.isArray(b.line_items)) data.lineItems = { deleteMany: {}, create: b.line_items.map((li: any) => ({ sku: li.sku || li.description || '', quantity: typeof li.quantity === 'number' ? li.quantity : parseInt(li.quantity, 10) || 1 })) };
  }
  if (b.is_draft !== undefined) data.draft = b.is_draft === 'Yes';
  if (b.remarks !== undefined) data.remarks = String(b.remarks).trim();
  if (b.received_by !== undefined && typeof b.received_by !== 'string') return res.status(400).json({ error: 'Received By must be a name.' });
  const result = await withDriverDirectoryLock(prisma, async tx => {
    await lockPodRecord(tx, existing.id);
    const current = await tx.deliveryRecord.findUnique({ where: { id: existing.id } });
    if (!current || current.deletedAt) return { error: 'Record not found', updated: null };
    if (!canWriteCategory(req.user!, current.category) || (req.user!.role === 'DRIVER' && !isAssignedDriver(req.user!, current))) return { error: 'Record access denied', updated: null };
    const dateError = driverDeliveryDateError(current, req.user!.role);
    if (dateError) return { error: dateError, updated: null };
    if (data.priority !== undefined && data.priority !== current.priority && runState(current) === 'Delivered') return { error: PRIORITY_LOCKED_ERROR, updated: null };
    if (data.draft !== undefined && data.draft !== current.draft) {
      if (!['SALES_COORDINATOR', 'ADMIN'].includes(req.user!.role)) return { error: 'Only Sales Coordinator or Admin may submit or return drafts.', updated: null };
      const invalid = transitionError(current, data.draft ? 'Draft' : 'Scheduled', req.user!.role);
      if (invalid) return { error: invalid, updated: null };
      if (!data.draft && !String(data.reference ?? current.reference).trim()) return { error: 'Reference is required to submit the draft.', updated: null };
      data.status = 'SCHEDULED';
    }
    if (driverChange) {
      const assignment = await resolveDriverAssignment(tx, current, driverChange);
      if ('error' in assignment) return { error: assignment.error, updated: null };
      data.driverId = assignment.driverId;
      data.driver = assignment.driver;
    }
    if ((data.draft ?? current.draft) && (data.driverId !== undefined && data.driverId !== current.driverId || data.driverAssistants !== undefined && data.driverAssistants !== current.driverAssistants)) return { error: 'New assignments to drafts are not allowed.', updated: null };
    if (hasTimestamp) {
      if (current.draft || !current.timeIn || (b.time_out !== undefined && !current.timeOut)) return { error: 'The timestamps changed. Refresh and try again.', updated: null };
      const correctedIn = data.timeIn ?? current.timeIn;
      const correctedOut = data.timeOut ?? current.timeOut;
      if (correctedOut && new Date(correctedOut) < new Date(correctedIn)) return { error: 'Time Out must be after Time In.', updated: null };
    }
    if (current.status === 'ACCOMPLISHED' && b.received_by !== undefined && !b.received_by.trim()) return { error: 'Received By is required on completed runs.', updated: null };
    const invalidAssignment = await assignmentError(tx, current, data);
    if (invalidAssignment) return { error: invalidAssignment, updated: null };
    const updated = await tx.deliveryRecord.update({ where: { id: existing.id }, data, include: recordInclude });
    await tx.auditLog.create({ data: {
      recordId: updated.id, recordType: 'DeliveryRecord', action: 'UPDATE', changedById: req.user!.id,
      previousValue: JSON.stringify(serializeRecord({ ...existing, ...current })),
      newValue: JSON.stringify(serializeRecord(updated)),
    } });
    if (typeof b.remarks === 'string' && b.remarks.trim()) await tx.remarkLog.create({ data: {
      recordId: updated.id, body: b.remarks.trim(), context: hasTimestamp ? 'TIMESTAMP_CORRECTION' : 'GENERAL_EDIT', authorId: req.user!.id,
    } });
    return { error: null, updated };
  });
  if (result.error) return res.status(result.error === 'Record not found' ? 404 : result.error === 'Record access denied' || result.error === 'Only Sales Coordinator or Admin may submit or return drafts.' ? 403 : 400).json({ error: result.error });
  const updated = result.updated!;

  // Notify the record creator (Sales Coordinator) when Logistics assigns a driver
  if (
    req.user!.role === 'LOGISTICS' &&
    updated.driverId &&
    !existing.driver
  ) {
    await notifyUser(
      existing.createdById,
      'Driver assigned',
      `${updated.driver} has been assigned to ${existing.company.name} · ${existing.reference}.`,
      existing.id,
      'DeliveryRecord'
    );
  }

  res.json(serializeRecord(updated));
}));

// Time In is the sole action that starts an assigned run.
router.post('/:id/time-in', requireAuth, requireResource('records'), requireRecordAccess, requireRole('DRIVER', 'LOGISTICS', 'ADMIN'), asyncRoute(async (req, res) => {
  const remarks = req.body?.remarks;
  if (typeof remarks !== 'string' || !remarks.trim()) return res.status(400).json({ error: 'Remarks are required when recording Time In.' });
  const result = await prisma.$transaction(async tx => {
    await lockPodRecord(tx, req.params.id);
    const current = await tx.deliveryRecord.findFirst({ where: { id: req.params.id, deletedAt: null, AND: [recordScope(req.user!)] }, include: recordInclude });
    if (!current) return { error: 'Record access denied', saved: null };
    const dateError = driverDeliveryDateError(current, req.user!.role);
    if (dateError) return { error: dateError, saved: null };
    const error = timeInError(current);
    if (error) return { error, saved: null };
    const saved = await tx.deliveryRecord.update({ where: { id: current.id }, data: {
      timeIn: new Date().toISOString(), timeOut: null, status: 'IN_TRANSIT', remarks: remarks.trim(), modifiedById: req.user!.id,
    }, include: recordInclude });
    await tx.auditLog.create({ data: {
      recordId: saved.id, recordType: 'DeliveryRecord', action: 'UPDATE', changedById: req.user!.id,
      previousValue: JSON.stringify(serializeRecord(current)), newValue: JSON.stringify(serializeRecord(saved)),
    } });
    await tx.remarkLog.create({ data: { recordId: saved.id, body: remarks.trim(), context: 'TIME_IN', authorId: req.user!.id } });
    return { error: null, saved };
  });
  if (result.error) return res.status(400).json({ error: result.error });
  res.json(serializeRecord(result.saved));
}));

// Every completion path validates persisted proof and stamps server Time Out atomically.
router.patch('/:id/status', requireAuth, requireResource('records'), requireRecordAccess, requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER', 'TASS'), asyncRoute(async (req, res) => {
  const { status, remarks, received_by, priority } = req.body ?? {};
  if (!status || !STATUS_TO_DB[status]) return res.status(400).json({ error: 'Valid status is required' });
  if (typeof remarks !== 'string' || !remarks.trim()) return res.status(400).json({ error: 'Remarks are required when changing status.' });
  if (req.body.time_in !== undefined || req.body.time_out !== undefined) return res.status(400).json({ error: 'Use Record Time In or timestamp corrections; Time Out is recorded automatically on completion.' });
  if (received_by !== undefined && typeof received_by !== 'string') return res.status(400).json({ error: 'Received By must be a name.' });
  const hasPriority = priority !== undefined && priority !== '';
  if (hasPriority && !['LOGISTICS', 'ADMIN'].includes(req.user!.role)) return res.status(403).json({ error: 'Your role cannot change record priority.' });
  if (hasPriority && !['1 - Low', '2 - Moderate', '3 - High'].includes(priority)) return res.status(400).json({ error: 'Invalid record priority.' });
  const newDeliveryDate = req.body.delivery_date;
  const hasNewDeliveryDate = newDeliveryDate !== undefined && newDeliveryDate !== null && newDeliveryDate !== '';
  if (hasNewDeliveryDate && !isValidDateOnly(newDeliveryDate)) return res.status(400).json({ error: 'New delivery date must be a valid YYYY-MM-DD date.' });
  const result = await prisma.$transaction(async tx => {
    await lockPodRecord(tx, req.params.id);
    const current = await tx.deliveryRecord.findUnique({ where: { id: req.params.id }, include: recordInclude });
    if (!current || current.deletedAt || (req.user!.role === 'DRIVER' && !isAssignedDriver(req.user!, current)) || !canWriteCategory(req.user!, current.category)) return { error: 'Record access denied', saved: null, previous: null };
    const dateError = driverDeliveryDateError(current, req.user!.role);
    if (dateError) return { error: dateError, saved: null, previous: null };
    if (req.user!.role === 'TASS' && current.category !== 'RMA') return { error: 'TASS status updates are limited to RMA records', saved: null, previous: null };
    if (req.user!.role === 'SALES_COORDINATOR' && !(status === 'Draft' || current.draft && status === 'Scheduled')) return { error: 'Sales Coordinator may only submit or return drafts.', saved: null, previous: null };
    const statusChanged = runState(current) !== status;
    const priorityChanged = hasPriority && current.priority !== priority;
    if (priorityChanged && runState(current) === 'Delivered') return { error: PRIORITY_LOCKED_ERROR, saved: null, previous: null };
    if (!statusChanged && !priorityChanged) return { error: 'Choose a different status or priority before saving.', saved: null, previous: null };
    // Logistics/Admin rescheduling a Delivery must set the new date in the same action (TSK-123).
    const requiresNewDate = statusChanged && status === 'Rescheduled' && current.category === 'DELIVERY' && ['LOGISTICS', 'ADMIN'].includes(req.user!.role);
    if (hasNewDeliveryDate && !requiresNewDate) return { error: 'Change the Delivery Date in Overview, or choose Rescheduled.', saved: null, previous: null };
    if (requiresNewDate) {
      if (!hasNewDeliveryDate) return { error: 'A new delivery date is required to reschedule a delivery.', saved: null, previous: null };
      if (newDeliveryDate < manilaToday()) return { error: 'The new delivery date cannot be in the past.', saved: null, previous: null };
      if (newDeliveryDate === current.deliveryDate) return { error: 'The new delivery date must be different from the current delivery date.', saved: null, previous: null };
    }
    if (statusChanged) {
      if (status === 'Delivered' && current.category === 'DELIVERY' && !deliveryScheduleState(current.deliveryDate).valid) {
        return { error: 'A valid Delivery Date is required before completing this delivery.', saved: null, previous: null };
      }
      if ((status === 'Delivered' || status === 'Pending') && !isoTimestamp(current.timeIn)) return { error: 'Record a valid Time In before completing or marking this run Pending.', saved: null, previous: null };
      const error = transitionError(current, status as RunState, req.user!.role);
      if (error) return { error, saved: null, previous: null };
    }
    if (current.draft && status === 'Scheduled' && !current.reference.trim()) return { error: 'Reference is required to submit the draft.', saved: null, previous: null };
    const data: any = { ...(statusChanged ? { status: STATUS_TO_DB[status], draft: status === 'Draft' } : {}), remarks: remarks.trim(), modifiedById: req.user!.id };
    if (hasPriority) data.priority = priority;
    if (current.status === 'ACCOMPLISHED' && received_by !== undefined && !received_by.trim()) return { error: 'Received By is required on completed runs.', saved: null, previous: null };
    if (received_by !== undefined) data.receivedBy = received_by.trim();
    if (statusChanged && status === 'Delivered') {
      if (!isoTimestamp(current.timeIn)) return { error: 'Record a valid Time In before completing this run.', saved: null, previous: null };
      if (!String(received_by ?? current.receivedBy ?? '').trim()) return { error: 'Received By is required before completing this run.', saved: null, previous: null };
      if (!await hasStoredDeliveryPhoto(tx, current.id)) return { error: DELIVERY_PHOTO_REQUIRED, saved: null, previous: null };
      data.receivedBy = String(received_by ?? current.receivedBy).trim();
      const completedAt = new Date();
      data.timeOut = completedAt.toISOString();
      if (current.category === 'DELIVERY') {
        const schedule = deliveryScheduleState(current.deliveryDate, completedAt);
        data.completedLate = schedule.valid && schedule.overdue;
        data.daysLate = schedule.valid ? schedule.daysLate : 0;
      }
    }
    if (statusChanged && status === 'Rescheduled') { data.timeIn = null; data.timeOut = null; data.receivedBy = null; }
    if (requiresNewDate) data.deliveryDate = newDeliveryDate;
    const saved = await tx.deliveryRecord.update({ where: { id: current.id }, data, include: recordInclude });
    await tx.auditLog.create({ data: {
      recordId: saved.id, recordType: 'DeliveryRecord', action: 'UPDATE', changedById: req.user!.id,
      previousValue: JSON.stringify(serializeRecord(current)), newValue: JSON.stringify(serializeRecord(saved)),
    } });
    await tx.remarkLog.create({ data: { recordId: saved.id, body: remarks.trim(), context: 'STATUS_CHANGE', authorId: req.user!.id } });
    return { error: null, saved, previous: current };
  });
  if (result.error) return res.status(result.error === 'Record access denied' || result.error === 'TASS status updates are limited to RMA records' || result.error === 'Sales Coordinator may only submit or return drafts.' ? 403 : 400).json({ error: result.error });
  const updated = result.saved!;
  if (result.previous!.draft && !updated.draft && updated.category === 'DELIVERY' && !String(updated.driver ?? '').trim()) {
    await notifyRole(
      'LOGISTICS',
      'New DELIVERY record — driver needed',
      `${updated.company.name} · ${updated.reference || '(no reference)'}${updated.deliveryDate ? ` on ${updated.deliveryDate}` : ''} requires driver assignment.`,
      updated.id,
      'DeliveryRecord'
    );
  }
  if (status === 'Delivered' && result.previous!.status !== 'ACCOMPLISHED') {
    await notifyAccomplished({
      id: updated.id, companyName: updated.company.name, deliveryDate: updated.deliveryDate,
      reference: updated.reference, accountManager: updated.accountManager, accomplishedByName: req.user!.name,
      recipientOverride: updated.category === 'ACCOUNTING_COLLECTION' ? 'Billing Department' : undefined,
    });
    if (updated.category === 'ACCOUNTING_COLLECTION') await notifyRole('TASS', 'Collection ready for verification', `${updated.company.name} · ${updated.reference} is now accomplished and requires collection verification.`, updated.id, 'DeliveryRecord');
  }
  res.json(serializeRecord(updated));
}));

// Collection verification - TASS only, for ACCOUNTING_COLLECTION records that are ACCOMPLISHED.
router.patch('/:id/verify-collection', requireAuth, requireResource('records'), requireRecordAccess, requireRole('TASS'), async (req, res) => {
  const existing = await prisma.deliveryRecord.findFirst({
    where: { id: req.params.id, deletedAt: null, AND: [recordScope(req.user!)] },
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
router.delete('/:id', requireAuth, requireResource('records'), requireRecordAccess, requireRole('SALES_COORDINATOR'), async (req, res) => {
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
router.get('/:id/comments', requireAuth, requireResource('records'), requireRecordAccess, async (req, res) => {
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

router.post('/:id/comments', requireAuth, requireResource('records'), requireRecordAccess, requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER', 'TASS'), async (req, res) => {
  const { body } = req.body ?? {};
  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'Comment body is required' });
  }

  const record = await prisma.deliveryRecord.findFirst({
    where: { id: req.params.id, deletedAt: null, AND: [recordScope(req.user!)] }
  });
  if (!record) return res.status(404).json({ error: 'Record not found' });
  const dateError = driverDeliveryDateError(record, req.user!.role);
  if (dateError) return res.status(400).json({ error: dateError });

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
