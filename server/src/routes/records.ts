import express, { Router } from 'express';
import mammoth from 'mammoth';
import sanitizeHtml from 'sanitize-html';
import type { PodAttachment, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { recordAccountManager } from '../services/accountDirectory';
import { asyncRoute } from '../middleware/asyncRoute';
import { assignmentError, resolveDriverAssignment, withDriverDirectoryLock, type DriverChange } from '../services/driverDirectory';
import { requireAuth, requireRole, requireResource } from '../middleware/auth';
import { visibleRecordAuditSnapshots } from '../services/recordAuditVisibility';
import { notifyAccomplished } from '../services/notify';
import { notifyRole, notifyUser } from '../services/inAppNotify';
import { CATEGORY_TO_DB, STATUS_TO_DB, STATUS_FROM_DB, serializeRecord } from '../mappings';
import { recordActiveCounts } from '../services/activeRecordCounts';
import { pipeline } from 'node:stream/promises';
import { discardUpload, PodStorageFileTooLargeError, podStorage, podStorageNamespace, podUpload, withFileInMemory } from '../services/podStorage';
import { cleanPodStorageDeletions } from '../services/podDeletionCleanup';
import { DELIVERY_PHOTO_REQUIRED, findVerifiedDeliveryPhoto, hasStoredDeliveryPhoto, inspectUpload, isStoredPodPhoto, lockPodRecord } from '../services/podPhotos';
import { ATTACHMENT_QUOTA_EXCEEDED, attachmentQuotaError, DOCX_PREVIEW_MAX_OUTPUT_BYTES, inspectDocxPreviewArchive } from '../services/attachmentRules';

import { canCreateCategory, canWriteCategory, canPerformRecordAction, isAssignedDriver, recordScope } from '../services/recordAccess';
import { deliveryScheduleState, driverDeliveryDateError, isValidDateOnly, isoTimestamp, manilaToday, runState, timeInError, transitionError, type RunState } from '../services/deliveryLifecycle';
import { manilaDateRange } from '../services/dateSemantics';
import { RMA_CONTACT_FIELDS, normalizeRmaCategory, rmaInputError } from '../services/rmaRules';
import { areasForLocation } from '../areaHierarchy';
import { RmaActionError, canUploadRmaPod, rmaActionPolicy, rmaCapabilities, rmaVersionError } from './rmaDispatch';
import { dispatchMovementScope, eligibleRmaTransport, isLogisticsRma, needsLogisticsHandoff, rmaMovementInputError, rmaTransportContext } from '../services/rmaMovement';
import { canPerformPolicyRecordAction } from '../services/recordAccess';
import { notifyRmaRecipients } from '../services/rmaNotifications';
import { RMA_COMPLETION_ROLE_ERROR } from '../services/deliveryLifecycle';
import { readRmaPermissions } from '../services/rmaDispatchPermissions';
import { recordOperationError, recordMutationInputError } from '../services/recordOperations';
import { recordSubmissionError } from '../services/recordSubmission';
import { recordEditError } from '../services/recordEditVersion';
import { generateRecordId } from '../services/recordIds';
import { RECORD_VIEWS, runViewWhere, type RecordView } from '../services/recordViewFilters';
import { dashboardRecordFilter } from '../services/dashboardFilters';
import { submittedAtChange, submittedAtOnCreate } from '../services/submission';

const router = Router();
class RecordSubmissionError extends Error {}
const PRIORITY_LOCKED_ERROR = "Priority can't be changed after a record is Delivered.";
async function notifyOrdinarySubmission(tx: Prisma.TransactionClient, record: { id: string; category: string; driver: string; company: { name: string }; reference: string; deliveryDate: string }) {
  const needsDriver = !record.driver?.trim();
  await notifyRole('LOGISTICS', needsDriver ? `New ${record.category.replace(/_/g, ' ')} record — driver needed` : `${record.category.replace(/_/g, ' ')} record submitted`,
    `${record.company.name} · ${record.reference || '(no reference)'}${record.deliveryDate ? ` on ${record.deliveryDate}` : ''} ${needsDriver ? 'requires driver assignment.' : 'is ready for Logistics review.'}`,
    record.id, 'DeliveryRecord', tx);
}

const recordAccess = (allowDriverRmaPod = false) => Object.assign(asyncRoute(async (req, res, next) => {
  if (req.user!.activeMode === 'V1') {
    const inputError = recordMutationInputError(req.body ?? {}, String(req.route?.path ?? ''), req.method);
    if (inputError) return res.status(400).json({ error: inputError });
  }
  if (req.params.id) {
    const record = await prisma.deliveryRecord.findFirst({
      where: { id: req.params.id, deletedAt: null, AND: [recordScope(req.user!)] },
    });
    if (!record) return res.status(403).json({ error: 'Record access denied' });
    const operationError = recordOperationError(req.user!, record, req.body ?? {}, String(req.route?.path ?? ''), req.method);
    if (operationError) return res.status(operationError === 'Category relocation is not supported' ? 400 : 403).json({ error: operationError });
    if (req.method !== 'GET' && req.user!.role === 'LOGISTICS' && record.category === 'RMA') {
      return res.status(403).json({ error: 'Logistics has view-only access to RMA records' });
    }
    if (req.method !== 'GET' && !canWriteCategory(req.user!, record.category) && !(allowDriverRmaPod && record.category === 'RMA' && req.user!.role === 'DRIVER')) {
      return res.status(403).json({ error: req.user!.role === 'LOGISTICS' && record.category === 'RMA' ? 'Logistics has view-only access to RMA records' : 'Module access denied' });
    }
  } else if (req.method === 'POST' && req.body?.category) {
    const category = CATEGORY_TO_DB[req.body.category] ?? req.body.category;
    if (!canCreateCategory(req.user!, category)) return res.status(403).json({ error: category === 'DELIVERY' && req.user!.role === 'LOGISTICS' ? 'Only Sales Coordinator or Admin may create Deliveries.' : 'Module access denied' });
  }
  next();
}), { recordOperations: true });
const requireRecordAccess = recordAccess();
const requireRecordPodAccess = recordAccess(true);

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

const TASS_CATEGORIES: string[] = ['ACCOUNTING_COLLECTION', 'RMA'];
const LIST_ID_PATTERN = /^[\w-]{1,64}$/;
const CURSOR_PATTERN = /^[\w=-]{1,128}$/;
const LIST_MAX_LIMIT = 100;
const ALLOWED_STATUSES = new Set([
  'Draft', 'Scheduled', 'In Transit', 'Delivered', 'On-Hold', 'Rescheduled', 'Pending',
  'SCHEDULED', 'IN_TRANSIT', 'ACCOMPLISHED', 'ON_HOLD', 'RESCHEDULED', 'PENDING'
]);
const ALLOWED_PRIORITIES = new Set(['1 - Low', '2 - Moderate', '3 - High']);

export function encodeCursor(record: { createdAt: Date | string; id: string }): string {
  const c = typeof record.createdAt === 'string' ? record.createdAt : record.createdAt.toISOString();
  return `c_${Buffer.from(JSON.stringify({ c, id: record.id })).toString('base64url')}`;
}

export async function decodeCursor(
  cursorStr: string,
  prismaClient: typeof prisma = prisma
): Promise<{ createdAt: Date; id: string } | null> {
  if (cursorStr.startsWith('c_')) {
    try {
      const json = JSON.parse(Buffer.from(cursorStr.slice(2), 'base64url').toString('utf8'));
      if (json && typeof json.c === 'string' && typeof json.id === 'string') {
        const date = new Date(json.c);
        if (!Number.isNaN(date.getTime())) {
          return { createdAt: date, id: json.id };
        }
      }
    } catch {
      return null;
    }
  }
  try {
    const record = await prismaClient.deliveryRecord.findUnique({
      where: { id: cursorStr },
      select: { createdAt: true, id: true },
    });
    if (record) {
      return { createdAt: record.createdAt, id: record.id };
    }
  } catch {
    return null;
  }
  return null;
}

function statusFilterToWhere(status: string): Prisma.DeliveryRecordWhereInput {
  const norm = STATUS_FROM_DB[status] ?? status;
  switch (norm) {
    case 'Draft':
      return { draft: true };
    case 'Scheduled':
      return { draft: false, status: 'SCHEDULED', OR: [{ category: 'RMA' }, { timeIn: null }] };
    case 'In Transit':
      return {
        draft: false,
        OR: [{ status: 'IN_TRANSIT' }, { status: 'SCHEDULED', category: { not: 'RMA' }, NOT: { timeIn: null } }],
      };
    case 'Delivered':
      return { status: 'ACCOMPLISHED' };
    case 'On-Hold':
      return { status: 'ON_HOLD' };
    case 'Rescheduled':
      return { status: 'RESCHEDULED' };
    case 'Pending':
      return { status: 'PENDING' };
    default:
      return {};
  }
}

function dashboardPresetWhere(filterId: string): Prisma.DeliveryRecordWhereInput | { error: string } {
  return dashboardRecordFilter(filterId) ?? { error: 'dashboard_filter is invalid' };
}

// Every list response is bounded. Full exports must explicitly traverse the paged contract.
function parseListQuery(query: express.Request['query']) {
  const {
    company_id, category, limit, cursor, page,
    status, dateFrom, dateTo, search, driver, area, region, subregion, account_manager, priority, dashboard_filter,
    paged, dateSort, view, queue, driver_exact, account_manager_exact, supplier_name
  } = query;
  const where: Prisma.DeliveryRecordWhereInput = {};
  const andConditions: Prisma.DeliveryRecordWhereInput[] = [];
  const isPaged = paged === 'true' || paged === '1';
  if (dateSort !== undefined && (typeof dateSort !== 'string' || !['default', 'nearest', 'oldest', 'furthest'].includes(dateSort))) return { error: 'dateSort is invalid' };
  if (dateSort && dateSort !== 'default' && !isPaged) return { error: 'dateSort requires paged=true' };
  if (dateSort && dateSort !== 'default' && cursor !== undefined) return { error: 'dateSort cannot be combined with cursor' };
  let take: number | undefined;
  if (view !== undefined && (typeof view !== 'string' || !(RECORD_VIEWS as readonly string[]).includes(view))) return { error: 'view is invalid' };
  if (queue !== undefined && (typeof queue !== 'string' || !['active', 'completed'].includes(queue) || view === undefined)) return { error: 'queue requires a known view and active or completed' };
  if (view) andConditions.push(runViewWhere(view as RecordView, queue as 'active' | 'completed' | undefined));
  for (const [key, value] of Object.entries({ driver_exact, account_manager_exact, supplier_name })) {
    if (value !== undefined && (typeof value !== 'string' || !value.trim() || value.length > 200)) return { error: `${key} is invalid` };
  }
  if (driver_exact) andConditions.push({ driver: driver_exact as string });
  if (account_manager_exact) andConditions.push(account_manager_exact === 'Unknown' ? { OR: [{ accountManager: '' }, { accountManager: 'Unknown' }] } : { accountManager: account_manager_exact as string });
  if (supplier_name) andConditions.push({ category: 'PROCUREMENT_PICKUP', OR: [{ itemDescription: { contains: supplier_name as string, mode: 'insensitive' } }, { company: { name: { contains: supplier_name as string, mode: 'insensitive' } } }] });
  let pageNum: number | undefined;

  if (company_id !== undefined) {
    if (typeof company_id !== 'string' || !LIST_ID_PATTERN.test(company_id)) return { error: 'company_id is invalid' };
    where.companyId = company_id;
  }
  if (category !== undefined) {
    if (category !== 'All' && category !== '') {
      const dbCategory = typeof category === 'string' ? CATEGORY_TO_DB[category] : undefined;
      if (!dbCategory) return { error: 'category is invalid' };
      where.category = dbCategory as Prisma.DeliveryRecordWhereInput['category'];
    }
  }
  if (status !== undefined) {
    if (typeof status !== 'string') return { error: 'status is invalid' };
    if (status !== 'All' && status !== '') {
      if (!ALLOWED_STATUSES.has(status)) return { error: 'status is invalid' };
      andConditions.push(statusFilterToWhere(status));
    }
  }
  if (dateFrom !== undefined) {
    if (typeof dateFrom !== 'string' || !isValidDateOnly(dateFrom)) return { error: 'dateFrom is invalid' };
  }
  if (dateTo !== undefined) {
    if (typeof dateTo !== 'string' || !isValidDateOnly(dateTo)) return { error: 'dateTo is invalid' };
  }
  if (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) {
    return { error: 'dateFrom cannot be after dateTo' };
  }
  if (dateFrom !== undefined || dateTo !== undefined) {
    andConditions.push({
      deliveryDate: {
        ...(dateFrom ? { gte: dateFrom as string } : {}),
        ...(dateTo ? { lte: dateTo as string } : {}),
      }
    });
  }
  if (search !== undefined) {
    if (typeof search !== 'string') return { error: 'search is invalid' };
    const s = search.trim();
    if (s.length > 100) return { error: 'search query is too long' };
    if (s.length > 0) {
      andConditions.push({
        OR: [
          { id: { contains: s, mode: 'insensitive' } },
          { reference: { contains: s, mode: 'insensitive' } },
          { rmaReference: { contains: s, mode: 'insensitive' } },
          { legacySapReference: { contains: s, mode: 'insensitive' } },
          { company: { name: { contains: s, mode: 'insensitive' } } },
          { driver: { contains: s, mode: 'insensitive' } },
          { area: { contains: s, mode: 'insensitive' } },
          { accountManager: { contains: s, mode: 'insensitive' } },
        ]
      });
    }
  }
  if (driver !== undefined) {
    if (typeof driver !== 'string' || driver.length > 100) return { error: 'driver is invalid' };
    if (driver.trim()) {
      andConditions.push({ driver: { contains: driver.trim(), mode: 'insensitive' } });
    }
  }
  if (area !== undefined) {
    if (typeof area !== 'string' || area.length > 100) return { error: 'area is invalid' };
    if (area !== 'All Areas' && area.trim()) {
      andConditions.push({ area: area.trim() });
    }
  }
  if (region !== undefined) {
    if (typeof region !== 'string' || region.length > 100) return { error: 'region is invalid' };
  }
  if (subregion !== undefined) {
    if (typeof subregion !== 'string' || subregion.length > 100) return { error: 'subregion is invalid' };
  }
  if (region !== undefined || subregion !== undefined) {
    const locationAreas = areasForLocation(
      typeof region === 'string' && region.trim() ? region.trim() : undefined,
      typeof subregion === 'string' && subregion.trim() ? subregion.trim() : undefined,
    );
    if (!locationAreas) return { error: 'region or subregion is invalid' };
    andConditions.push({ area: { in: locationAreas } });
  }
  if (account_manager !== undefined) {
    if (typeof account_manager !== 'string' || account_manager.length > 100) return { error: 'account_manager is invalid' };
    if (account_manager.trim()) {
      andConditions.push({ accountManager: { contains: account_manager.trim(), mode: 'insensitive' } });
    }
  }
  if (priority !== undefined) {
    if (typeof priority !== 'string' || !ALLOWED_PRIORITIES.has(priority)) return { error: 'priority is invalid' };
    andConditions.push({ priority });
  }
  if (dashboard_filter !== undefined) {
    if (typeof dashboard_filter !== 'string') return { error: 'dashboard_filter is invalid' };
    const preset = dashboardPresetWhere(dashboard_filter);
    if ('error' in preset) return { error: preset.error };
    andConditions.push(preset);
  }
  if (limit !== undefined) {
    take = typeof limit === 'string' && /^\d+$/.test(limit) ? Number(limit) : NaN;
    if (!(take >= 1 && take <= LIST_MAX_LIMIT)) return { error: `limit must be between 1 and ${LIST_MAX_LIMIT}` };
  } else {
    take = isPaged ? 25 : LIST_MAX_LIMIT;
  }
  if (page !== undefined) {
    pageNum = typeof page === 'string' && /^\d+$/.test(page) ? Number(page) : NaN;
    if (!(pageNum >= 1)) return { error: 'page must be greater than or equal to 1' };
  }
  if (cursor !== undefined) {
    if (typeof cursor !== 'string' || !CURSOR_PATTERN.test(cursor)) return { error: 'cursor is invalid' };
    if (!isPaged && limit === undefined) return { error: 'cursor requires limit' };
  }
  return {
    where,
    andConditions,
    take,
    cursor: cursor as string | undefined,
    page: pageNum,
    isPaged,
    dateSort: typeof dateSort === 'string' ? dateSort : 'default'
  };
}

router.get('/', requireAuth, requireResource('records'), requireRecordAccess, async (req, res) => {
  const parsed = parseListQuery(req.query);
  if ('error' in parsed) return res.status(400).json({ error: parsed.error });

  const baseWhere: Prisma.DeliveryRecordWhereInput = {
    deletedAt: null,
    ...parsed.where,
    AND: [recordScope(req.user!), ...parsed.andConditions],
  };

  if (!parsed.isPaged) {
    // Unpaginated / legacy client contract: returns DeliveryRecord[]
    const records = await prisma.deliveryRecord.findMany({
      where: baseWhere,
      include: recordInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: parsed.take ?? LIST_MAX_LIMIT,
      ...(parsed.cursor ? { cursor: { id: parsed.cursor }, skip: 1 } : {}),
    });
    return res.json(records.map(r => serializeRecord(r, req.user!)));
  }

  // Paged contract: { rows, nextCursor, hasMore, total, page, limit }
  const take = parsed.take ?? 25;
  let decodedCursor: { createdAt: Date; id: string } | null = null;
  if (parsed.cursor) {
    decodedCursor = await decodeCursor(parsed.cursor, prisma);
    if (!decodedCursor) {
      return res.status(400).json({ error: 'cursor is invalid or expired' });
    }
  }

  const queryWhere: Prisma.DeliveryRecordWhereInput = {
    deletedAt: null,
    ...parsed.where,
    AND: [
      recordScope(req.user!),
      ...parsed.andConditions,
      ...(decodedCursor ? [{
        OR: [
          { createdAt: { lt: decodedCursor.createdAt } },
          { createdAt: decodedCursor.createdAt, id: { lt: decodedCursor.id } },
        ],
      }] : []),
    ],
  };

  const skip = (!decodedCursor && parsed.page && parsed.page > 1) ? (parsed.page - 1) * take : undefined;

  const dateSort = parsed.dateSort;
  // A custom sort must be applied across the permission-scoped result set
  // *before* the database page is selected.
  const sortOrder: Prisma.DeliveryRecordOrderByWithRelationInput[] =
    dateSort === 'oldest' ? [{ deliveryDate: 'asc' }, { id: 'asc' }]
      : dateSort === 'furthest' ? [{ deliveryDate: 'desc' }, { id: 'asc' }]
      : [{ createdAt: 'desc' }, { id: 'desc' }];

  if (dateSort === 'nearest') {
    // Top-k merge of both sides of the present date: at most k records
    // from either side can enter the first k globally nearest records.
    const offset = (parsed.page && parsed.page > 1 ? parsed.page - 1 : 0) * take;
    const k = offset + take + 1;
    const today = manilaToday();
    const byDate = (condition: Prisma.StringFilter): Prisma.DeliveryRecordWhereInput =>
      ({ AND: [queryWhere, { deliveryDate: condition }] });
    const [past, future, blanks, total] = await Promise.all([
      prisma.deliveryRecord.findMany({
        where: byDate({ gte: '0001-01-01', lte: today }),
        include: recordInclude,
        orderBy: [{ deliveryDate: 'desc' }, { id: 'asc' }],
        take: k,
      }),
      prisma.deliveryRecord.findMany({
        where: byDate({ gt: today }),
        include: recordInclude,
        orderBy: [{ deliveryDate: 'asc' }, { id: 'asc' }],
        take: k,
      }),
      prisma.deliveryRecord.findMany({
        where: byDate({ equals: '' }),
        include: recordInclude,
        orderBy: [{ id: 'asc' }],
        take: k,
      }),
      prisma.deliveryRecord.count({ where: baseWhere }),
    ]);
    const now = Date.now();
    const distance = (date: string) => Math.abs(new Date(date + 'T12:00:00Z').getTime() - now);
    const candidates = [...past, ...future].sort((a, b) =>
      distance(a.deliveryDate) - distance(b.deliveryDate) || a.id.localeCompare(b.id));
    const rows = [...candidates, ...blanks].slice(offset, offset + take);
    return res.json({
      rows: rows.map(r => serializeRecord(r, req.user!)),
      nextCursor: null,
      hasMore: total > offset + take,
      total,
      page: parsed.page ?? 1,
      limit: take,
    });
  }

  if (dateSort === 'oldest' || dateSort === 'furthest') {
    // Empty delivery dates must remain LAST for both directions. A bare
    // ascending Prisma orderBy would put '' before every valid YYYY-MM-DD.
    // Partition within the same authorization filters before paginating.
    const datedWhere: Prisma.DeliveryRecordWhereInput = { AND: [queryWhere, { deliveryDate: { not: '' } }] };
    const undatedWhere: Prisma.DeliveryRecordWhereInput = { AND: [queryWhere, { deliveryDate: '' }] };
    const offset = (parsed.page && parsed.page > 1 ? parsed.page - 1 : 0) * take;
    const [datedCount, total] = await Promise.all([
      prisma.deliveryRecord.count({ where: datedWhere }),
      prisma.deliveryRecord.count({ where: baseWhere }),
    ]);
    const dated = offset < datedCount
      ? await prisma.deliveryRecord.findMany({
          where: datedWhere, include: recordInclude, orderBy: sortOrder,
          skip: offset, take: take,
        })
      : [];
    const undatedNeeded = take - dated.length;
    const undated = undatedNeeded > 0
      ? await prisma.deliveryRecord.findMany({
          where: undatedWhere, include: recordInclude, orderBy: [{ id: 'asc' }],
          skip: Math.max(0, offset - datedCount), take: undatedNeeded,
        })
      : [];
    const rows = [...dated, ...undated];
    return res.json({
      rows: rows.map(r => serializeRecord(r, req.user!)),
      nextCursor: null, hasMore: total > offset + take,
      total, page: parsed.page ?? 1, limit: take,
    });
  }

  const [records, total] = await Promise.all([
    prisma.deliveryRecord.findMany({
      where: queryWhere,
      include: recordInclude,
      orderBy: sortOrder,
      ...(skip !== undefined ? { skip } : {}),
      take: take + 1,
    }),
    prisma.deliveryRecord.count({ where: baseWhere }),
  ]);

  const hasMore = records.length > take;
  const rows = hasMore ? records.slice(0, take) : records;
  const nextCursor = hasMore && dateSort === 'default' ? encodeCursor(rows[rows.length - 1]) : null;

  res.json({
    rows: rows.map(r => serializeRecord(r, req.user!)),
    nextCursor,
    hasMore,
    total,
    page: parsed.page ?? 1,
    limit: take,
  });
});

// Bounded, permission-scoped aggregate for sidebar badges. Do not fetch
// the entire records collection merely to display the five counters.
router.get('/active-counts', requireAuth, requireResource('records'), requireRecordAccess, asyncRoute(async (req, res) => {
  const groups = await prisma.deliveryRecord.groupBy({
    by: ['category', 'status'],
    where: {
      deletedAt: null,
      draft: false,
      status: { in: ['SCHEDULED', 'IN_TRANSIT', 'PENDING', 'ON_HOLD', 'RESCHEDULED'] },
      AND: [recordScope(req.user!)],
    },
    _count: { _all: true },
  });
  res.setHeader('Cache-Control', 'no-store');
  res.json(recordActiveCounts(groups));
}));

// Dropdown metadata covers the full authorized category, independently of the
// active page or filters, without loading record bodies or line items.
router.get('/filter-options', requireAuth, requireResource('records'), requireRecordAccess, asyncRoute(async (req, res) => {
  const parsed = parseListQuery({ category: req.query.category });
  if ('error' in parsed || !parsed.where.category) return res.status(400).json({ error: 'category is invalid' });
  const where: Prisma.DeliveryRecordWhereInput = { deletedAt: null, category: parsed.where.category, AND: [recordScope(req.user!)] };
  const [accountManagers, drivers, areas] = await Promise.all([
    prisma.deliveryRecord.groupBy({ by: ['accountManager'], where }),
    prisma.deliveryRecord.groupBy({ by: ['driver'], where }),
    prisma.deliveryRecord.groupBy({ by: ['area'], where }),
  ]);
  const options = (values: string[]) => [...new Set(values.filter(value => value.trim()))].sort((a, b) => a.localeCompare(b));
  res.setHeader('Cache-Control', 'no-store');
  res.json({ accountManagers: options(accountManagers.map(row => row.accountManager)), drivers: options(drivers.map(row => row.driver)), areas: options(areas.map(row => row.area)) });
}));

// Counts/grouping are computed over the complete authorized scope; queue pages
// carry at most 100 complete records and never silently replace a full history.
router.get('/driver-overview', requireAuth, requireResource('records'), requireRecordAccess, asyncRoute(async (req, res) => {
  const scoped = (extra: Prisma.DeliveryRecordWhereInput): Prisma.DeliveryRecordWhereInput => ({ deletedAt: null, AND: [recordScope(req.user!), extra] });
  const today = manilaToday();
  const term = req.query.search;
  if (term !== undefined && (typeof term !== 'string' || term.length > 100)) return res.status(400).json({ error: 'search is invalid' });
  const runScope = runViewWhere('runs');
  const searchScope: Prisma.DeliveryRecordWhereInput = term ? { OR: [{ driver: { contains: term as string, mode: 'insensitive' } }, { reference: { contains: term as string, mode: 'insensitive' } }, { company: { name: { contains: term as string, mode: 'insensitive' } } }, { area: { contains: term as string, mode: 'insensitive' } }] } : {};
  const [groups, areas, todayCount, remaining, completed, rmaActive, rmaCompleted] = await Promise.all([
    prisma.deliveryRecord.groupBy({ by: ['driver', 'status', 'category', 'rmaTransportStatus'], where: scoped({ AND: [runScope, searchScope] }), _count: { _all: true } }),
    prisma.deliveryRecord.groupBy({ by: ['area'], where: scoped(runViewWhere('dispatch')), _count: { _all: true } }),
    prisma.deliveryRecord.count({ where: scoped({ AND: [runViewWhere('driver_dashboard'), { deliveryDate: today }] }) }),
    prisma.deliveryRecord.count({ where: scoped({ AND: [runViewWhere('driver_dashboard', 'active'), { category: { not: 'RMA' } }] }) }),
    prisma.deliveryRecord.count({ where: scoped({ AND: [runViewWhere('driver_dashboard', 'completed'), { OR: [{ category: { not: 'RMA' } }, { category: 'RMA', status: 'ACCOMPLISHED' }] }] }) }),
    prisma.deliveryRecord.count({ where: scoped({ AND: [runViewWhere('driver_dashboard', 'active'), { category: 'RMA' }] }) }),
    prisma.deliveryRecord.count({ where: scoped({ AND: [runViewWhere('driver_dashboard', 'completed'), { category: 'RMA', status: { not: 'ACCOMPLISHED' }, rmaTransportStatus: 'COMPLETED' }] }) }),
  ]);
  const drivers = new Map<string, { name: string; active: number; completed: number }>();
  let unassigned = 0;
  for (const group of groups) {
    const count = group._count._all;
    const done = group.category === 'RMA' ? group.rmaTransportStatus === 'COMPLETED' : group.status === 'ACCOMPLISHED';
    if (!group.driver) { if (!done) unassigned += count; continue; }
    const row = drivers.get(group.driver) ?? { name: group.driver, active: 0, completed: 0 };
    row[done ? 'completed' : 'active'] += count;
    drivers.set(group.driver, row);
  }
  res.setHeader('Cache-Control', 'no-store');
  res.json({ drivers: [...drivers.values()].sort((a, b) => b.active - a.active || a.name.localeCompare(b.name)), unassigned,
    areas: areas.map(row => row.area).filter(Boolean).sort(),
    dashboard: { today: todayCount, remaining, completed, rma_active: rmaActive, rma_completed: rmaCompleted } });
}));

router.get('/supplier-pickup-counts', requireAuth, requireResource('records'), requireResource('suppliers'), requireRecordAccess, asyncRoute(async (req, res) => {
  const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',') : [];
  if (!ids.length || ids.length > 100 || ids.some(id => !LIST_ID_PATTERN.test(id)) || new Set(ids).size !== ids.length) return res.status(400).json({ error: 'Use 1 to 100 unique supplier ids' });
  const suppliers = await prisma.supplier.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const result = await Promise.all(suppliers.map(async supplier => ({ id: supplier.id, count: await prisma.deliveryRecord.count({ where: {
    deletedAt: null, category: 'PROCUREMENT_PICKUP', AND: [recordScope(req.user!)],
    OR: [{ itemDescription: { contains: supplier.name, mode: 'insensitive' } }, { company: { name: { contains: supplier.name, mode: 'insensitive' } } }],
  } }) })));
  res.json(result);
}));

router.get('/calendar-counts', requireAuth, requireResource('records'), requireRecordAccess, asyncRoute(async (req, res) => {
  const { dateFrom, dateTo } = req.query;
  if (typeof dateFrom !== 'string' || typeof dateTo !== 'string' || !isValidDateOnly(dateFrom) || !isValidDateOnly(dateTo) || dateFrom > dateTo
    || (Date.parse(dateTo) - Date.parse(dateFrom)) / 86400000 > 62) return res.status(400).json({ error: 'Use a calendar date range of at most 63 days' });
  const where: Prisma.DeliveryRecordWhereInput = { deletedAt: null, AND: [recordScope(req.user!)], deliveryDate: { gte: dateFrom, lte: dateTo } };
  const [groups, started] = await Promise.all([
    prisma.deliveryRecord.groupBy({ by: ['deliveryDate', 'status', 'draft'], where, _count: { _all: true } }),
    prisma.deliveryRecord.groupBy({ by: ['deliveryDate'], where: { AND: [where, { category: { not: 'RMA' }, draft: false, status: 'SCHEDULED', timeIn: { not: null } }] }, _count: { _all: true } }),
  ]);
  const days = new Map<string, { date: string; total: number; statuses: Record<string, number> }>();
  for (const group of groups) {
    const day = days.get(group.deliveryDate) ?? { date: group.deliveryDate, total: 0, statuses: {} };
    const status = group.draft ? 'Draft' : STATUS_FROM_DB[group.status] ?? group.status;
    day.total += group._count._all; day.statuses[status] = (day.statuses[status] ?? 0) + group._count._all;
    days.set(group.deliveryDate, day);
  }
  for (const group of started) { const day = days.get(group.deliveryDate); if (day) { day.statuses.Scheduled = Math.max(0, (day.statuses.Scheduled ?? 0) - group._count._all); day.statuses['In Transit'] = (day.statuses['In Transit'] ?? 0) + group._count._all; } }
  res.json([...days.values()].sort((a, b) => a.date.localeCompare(b.date)));
}));

// Purpose-built summary for Account Manager Directory. Returns grouped metrics per AM
// within the caller's recordScope, without transmitting raw line items or full records.
router.get('/am-summary', requireAuth, requireResource('records'), requireRecordAccess, asyncRoute(async (req, res) => {
  const where: Prisma.DeliveryRecordWhereInput = { deletedAt: null, AND: [recordScope(req.user!)] };
  const [groups, companies, scheduled] = await Promise.all([
    prisma.deliveryRecord.groupBy({ by: ['accountManager', 'status', 'draft'], where, _count: { _all: true } }),
    prisma.deliveryRecord.groupBy({ by: ['accountManager', 'companyId'], where, _count: { _all: true } }),
    prisma.deliveryRecord.groupBy({ by: ['accountManager'], where: { AND: [where, { OR: [{ draft: true }, statusFilterToWhere('Scheduled')] }] }, _count: { _all: true } }),
  ]);
  const amMap = new Map<string, { name: string; total: number; delivered: number; pending: number; onHold: number; rescheduled: number; scheduled: number; companies: string[]; company_count: number }>();
  for (const row of groups) {
    const name = row.accountManager || 'Unknown';
    const am = amMap.get(name) ?? { name, total: 0, delivered: 0, pending: 0, onHold: 0, rescheduled: 0, scheduled: 0, companies: [], company_count: 0 };
    const count = row._count._all;
    const status = row.draft ? 'Draft' : STATUS_FROM_DB[row.status] ?? row.status;
    am.total += count;
    if (status === 'Delivered') am.delivered += count;
    else if (status === 'Pending') am.pending += count;
    else if (status === 'On-Hold') am.onHold += count;
    else if (status === 'Rescheduled') am.rescheduled += count;
    amMap.set(name, am);
  }
  for (const row of companies) { const am = amMap.get(row.accountManager || 'Unknown'); if (am) am.company_count++; }
  for (const row of scheduled) { const am = amMap.get(row.accountManager || 'Unknown'); if (am) am.scheduled += row._count._all; }
  const result = [...amMap.values()];

  res.json(result);
}));

// Purpose-built summary for Calendar view. Returns records bounded by the active
// calendar viewing window (dateFrom, dateTo) within caller's recordScope.
router.get('/calendar-summary', requireAuth, requireResource('records'), requireRecordAccess, asyncRoute(async (req, res) => {
  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const where: Prisma.DeliveryRecordWhereInput = {
    deletedAt: null,
    AND: [recordScope(req.user!)],
  };
  if (dateFrom && !isValidDateOnly(dateFrom)) return res.status(400).json({ error: 'dateFrom is invalid' });
  if (dateTo && !isValidDateOnly(dateTo)) return res.status(400).json({ error: 'dateTo is invalid' });
  if (dateFrom && dateTo && dateFrom > dateTo) return res.status(400).json({ error: 'dateFrom cannot be after dateTo' });

  if (dateFrom || dateTo) {
    where.deliveryDate = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  const records = await prisma.deliveryRecord.findMany({
    where,
    include: recordInclude,
    orderBy: [{ deliveryDate: 'asc' }, { id: 'asc' }],
    take: 500,
  });

  res.json(records.map(r => serializeRecord(r, req.user!)));
}));

// Must be before /:id to avoid "status-history-counts" matching as an ID
router.get('/status-history-counts', requireAuth, requireResource('records'), requireRecordAccess, async (req, res) => {
  const queryValue = (key: string): string | undefined => {
    const value = req.query[key];
    return typeof value === 'string' ? value : undefined;
  };
  const category = queryValue('category');
  const area = queryValue('area');
  const region = queryValue('region');
  const subregion = queryValue('subregion');
  const driver = queryValue('driver');
  const status = queryValue('status');
  const legacyFrom = queryValue('dateFrom');
  const legacyTo = queryValue('dateTo');
  const deliveryFrom = queryValue('deliveryDateFrom');
  const deliveryTo = queryValue('deliveryDateTo');
  const createdFrom = queryValue('createdAtFrom');
  const createdTo = queryValue('createdAtTo');
  const explicitBasis = queryValue('dateBasis');
  const hasLegacy = req.query.dateFrom !== undefined || req.query.dateTo !== undefined;
  const hasDelivery = req.query.deliveryDateFrom !== undefined || req.query.deliveryDateTo !== undefined;
  const hasCreated = req.query.createdAtFrom !== undefined || req.query.createdAtTo !== undefined;

  if ([req.query.dateFrom, req.query.dateTo, req.query.deliveryDateFrom, req.query.deliveryDateTo, req.query.createdAtFrom, req.query.createdAtTo, req.query.dateBasis]
    .some(value => value !== undefined && typeof value !== 'string')) {
    return res.status(400).json({ error: 'Date filters must be single string values.' });
  }
  if ([req.query.region, req.query.subregion].some(value => value !== undefined && typeof value !== 'string')) {
    return res.status(400).json({ error: 'Location filters must be single string values.' });
  }
  if (Number(hasLegacy) + Number(hasDelivery) + Number(hasCreated) > 1) {
    return res.status(400).json({ error: 'Use one date filter basis per request.' });
  }

  const dateBasis = hasDelivery ? 'deliveryDate'
    : hasCreated ? 'createdAt'
    : hasLegacy ? (explicitBasis ?? 'createdAt')
    : (explicitBasis ?? 'deliveryDate');
  if (dateBasis !== 'deliveryDate' && dateBasis !== 'createdAt') {
    return res.status(400).json({ error: 'dateBasis must be deliveryDate or createdAt.' });
  }
  if ((hasDelivery && explicitBasis && explicitBasis !== 'deliveryDate')
    || (hasCreated && explicitBasis && explicitBasis !== 'createdAt')) {
    return res.status(400).json({ error: 'dateBasis must match the named date filter fields.' });
  }
  const dateFrom = hasDelivery ? deliveryFrom : hasCreated ? createdFrom : legacyFrom;
  const dateTo = hasDelivery ? deliveryTo : hasCreated ? createdTo : legacyTo;

  const where: any = {
    deletedAt: null,
    AND: [recordScope(req.user!)]
  };

  if (category) where.category = CATEGORY_TO_DB[category] ?? category;
  if (dateFrom || dateTo) {
    try {
      const range = manilaDateRange(dateFrom, dateTo);
      if (dateBasis === 'deliveryDate') {
        where.deliveryDate = {
          ...(dateFrom ? { gte: dateFrom } : {}),
          ...(dateTo ? { lte: dateTo } : {}),
        };
      } else {
        where.createdAt = range;
      }
    } catch (error) {
      return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid date range.' });
    }
  }
  if (area) where.area = area;
  if (region || subregion) {
    const locationAreas = areasForLocation(region, subregion);
    if (!locationAreas) return res.status(400).json({ error: 'region or subregion is invalid' });
    where.AND.push({ area: { in: locationAreas } });
  }
  if (driver) where.driver = { contains: driver, mode: 'insensitive' };
  const candidates = await prisma.deliveryRecord.findMany({
    where,
    select: { id: true, category: true, status: true, draft: true, timeIn: true }
  });
  // Draft shares its stored enum with Scheduled; legacy started runs can also
  // still carry SCHEDULED. Filter the same effective state returned to clients.
  const filteredStatus = status ? (STATUS_FROM_DB[status] ?? status) : undefined;
  const records = status ? candidates.filter(record => runState(record) === filteredStatus) : candidates;

  const STATUSES = ['Draft', 'Scheduled', 'In Transit', 'Delivered', 'Pending', 'On-Hold', 'Rescheduled'];
  const current: Record<string, number>  = Object.fromEntries(STATUSES.map(s => [s, 0]));
  const ever_held: Record<string, number> = Object.fromEntries(STATUSES.map(s => [s, 0]));
  const recordStatusMap = new Map<string, Set<string>>();
  const recordCategories = new Map(records.map(record => [record.id, record.category]));

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
          category: CATEGORY_TO_DB[snapshot.category] ?? snapshot.category ?? recordCategories.get(entry.recordId),
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

  res.json({
    ever_held,
    current,
    total_records: records.length,
    date_basis: dateBasis,
    history_basis: 'lifetime',
    time_zone: 'Asia/Manila',
  });
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

  res.json(serializeRecord(record, req.user!));
});

router.get('/:id/audit', requireAuth, requireResource('records'), requireRecordAccess, asyncRoute(async (req, res) => {
  const entries = await prisma.auditLog.findMany({
    where: { recordId: req.params.id, recordType: 'DeliveryRecord' },
    include: { changedBy: true },
    orderBy: { timestamp: 'desc' }
  });

  const snapshots = await visibleRecordAuditSnapshots(entries, req.user!);
  res.json(
    entries.map((e, index) => ({
      id: e.id,
      action: e.action,
      changed_by: e.changedBy.name,
      previous_value: snapshots[index].previousValue,
      new_value: snapshots[index].newValue,
      timestamp: e.timestamp
    }))
  );
}));

// MIME types that the /preview endpoint can render in-app.
const PREVIEWABLE_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
]);

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
    download_url: `/api/v1/records/${req.params.id}/attachments/${attachment.id}/download`,
    preview_url: PREVIEWABLE_MIME_TYPES.has(attachment.mimeType)
      ? `/api/v1/records/${req.params.id}/attachments/${attachment.id}/preview`
      : null
  }))));
}));

router.post(
  '/:id/attachments',
  requireAuth,
  requireResource('records'),
  requireRecordPodAccess,
  requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER', 'TASS'),
  podUpload.single('file'),
  asyncRoute(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'A file is required.' });
    // The upload is a quarantined file on disk (SEC-07). It is removed below
    // however the request ends: rejected, failed or stored.
    const upload = req.file;
    let storageKey: string | undefined;
    let result: { status: number; error: string | null; code?: string; attachment: PodAttachment | null };
    let isPhoto = false;
    try {
      const inspection = await inspectUpload(upload.path, upload.originalname);
      if ('error' in inspection) {
        // Remove the rejected file before answering, not after.
        await discardUpload(upload.path);
        return res.status(400).json({ error: inspection.error });
      }
      isPhoto = inspection.isPhoto;
      result = await prisma.$transaction(async tx => {
        await lockPodRecord(tx, req.params.id);
        const record = await tx.deliveryRecord.findUnique({ where: { id: req.params.id } });
        if (!record || record.deletedAt) return { status: 404, error: 'Record not found', attachment: null };
        if (req.user!.role === 'DRIVER' && !isAssignedDriver(req.user!, record)) {
          return { status: 403, error: 'Drivers may only upload to their own assigned records', attachment: null };
        }
        if (record.category === 'RMA' && req.user!.role === 'DRIVER') {
          if (!await canUploadRmaPod(tx, req.user!, record)) return { status: 403, error: 'RMA transport proof upload is not permitted.', attachment: null };
        } else if (!canWriteCategory(req.user!, record.category) || (req.user!.role === 'LOGISTICS' && record.category === 'RMA')) {
          return { status: 403, error: 'Record access denied', attachment: null };
        }
        if (record.category === 'RMA' && req.user!.role !== 'DRIVER') {
          const policy = await readRmaPermissions(tx, req.user!.id);
          if (!policy || !canPerformPolicyRecordAction(policy, record, 'POD', { path: 'rma' })) return { status: 403, error: 'RMA document changes are not permitted.', attachment: null };
        }
        if (req.user!.role === 'TASS' && record.category !== 'RMA') return { status: 403, error: 'TASS may manage documents for RMA records only', attachment: null };
        const dateError = driverDeliveryDateError(record, req.user!.role);
        if (dateError) return { status: 400, error: dateError, attachment: null };
        // Counted under the record lock taken above, so parallel uploads to one
        // record cannot both slip past the quota. Nothing is stored on refusal.
        const usage = await tx.podAttachment.aggregate({ where: { recordId: record.id }, _count: { _all: true }, _sum: { size: true } });
        const quotaError = attachmentQuotaError(usage._count._all, usage._sum.size ?? 0, inspection.size);
        if (quotaError) return { status: 409, error: quotaError, code: ATTACHMENT_QUOTA_EXCEEDED, attachment: null };
        storageKey = await podStorage.save({
          originalName: upload.originalname, mimeType: inspection.mimeType,
          size: inspection.size, path: upload.path,
        });
        const attachment = await tx.podAttachment.create({ data: {
          recordId: record.id, originalName: upload.originalname, storageKey,
          mimeType: inspection.mimeType, size: inspection.size, uploadedById: req.user!.id,
        } });
        if (record.category === 'DELIVERY' || record.category === 'RMA') {
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
    } finally {
      await discardUpload(upload.path);
    }
    if (result.error) return res.status(result.status).json({ error: result.error, ...(result.code ? { code: result.code } : {}) });
    const attachment = result.attachment!;
    res.status(201).json({
      id: attachment.id,
      name: attachment.originalName,
      mime_type: attachment.mimeType,
      is_photo: isPhoto,
      size: attachment.size,
      uploaded_at: attachment.createdAt,
      download_url: `/api/v1/records/${req.params.id}/attachments/${attachment.id}/download`,
      preview_url: PREVIEWABLE_MIME_TYPES.has(attachment.mimeType)
        ? `/api/v1/records/${req.params.id}/attachments/${attachment.id}/preview`
        : null
    });
  })
);

async function streamAttachment(req: express.Request, res: express.Response, disposition: 'attachment' | 'inline') {
  const attachment = await prisma.podAttachment.findFirst({
    where: { id: req.params.attachmentId, recordId: req.params.id }
  });
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });
  try {
    // Streamed from storage, so a download never holds the whole file in memory.
    const content = await podStorage.open(attachment.storageKey);
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Length', String(attachment.size));
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(attachment.originalName)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    await pipeline(content, res);
  } catch (error) {
    if (!res.headersSent) res.status(404).json({ error: 'Attachment file not found' });
    else console.error('[POD] Failed to read attachment', error);
  }
}

router.get('/:id/attachments/:attachmentId/download', requireAuth, requireResource('records'), requireRecordAccess, asyncRoute(async (req, res) => {
  await streamAttachment(req, res, 'attachment');
}));

router.get('/:id/attachments/:attachmentId/preview', requireAuth, requireResource('records'), requireRecordAccess, asyncRoute(async (req, res) => {
  const attachment = await prisma.podAttachment.findFirst({
    where: { id: req.params.attachmentId, recordId: req.params.id },
    select: { mimeType: true, storageKey: true, originalName: true, size: true }
  });
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  // Preview responses contain private record content and must never be cached.
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (attachment.mimeType === 'image/jpeg' || attachment.mimeType === 'image/png') {
    const isPhoto = await isStoredPodPhoto(attachment);
    if (!isPhoto) return res.status(415).json({ error: 'This attachment is not a valid JPG or PNG image.' });
    return void await streamAttachment(req, res, 'inline');
  }

  if (
    attachment.mimeType === 'application/pdf' ||
    attachment.mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return void await streamAttachment(req, res, 'inline');
  }

  const isWord = attachment.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (!isWord) {
    return res.status(415).json({ error: 'In-app preview is available for PDF, DOCX, XLSX, JPG, and PNG attachments. Convert legacy DOC files to DOCX or PDF, or download them to open locally.' });
  }

  // Keep the full DOCX memory pipeline in the shared whole-file gate. Database
  // access and record locks have completed before taking this slot.
  try {
    const result = await withFileInMemory(async () => {
      const bytes = await podStorage.read(attachment.storageKey);
      const archive = inspectDocxPreviewArchive(bytes);
      if (archive === 'oversized') return { kind: 'oversized' as const };
      if (archive !== 'valid') throw new Error('Invalid DOCX preview archive');

      // The 32 MiB actual expansion cap bounds Mammoth's archive/XML/image
      // working set. Repeated references can inline one image many times, so
      // cap cumulative generated image data before Mammoth adds it to the HTML.
      let embeddedImageOutputBytes = 0;
      let embeddedImageOutputExceeded = false;
      const { value: convertedHtml } = await mammoth.convertToHtml({ buffer: bytes }, {
        convertImage: mammoth.images.imgElement(async image => {
          const imageBytes = await image.readAsBuffer();
          const base64Length = Math.ceil(imageBytes.length / 3) * 4;
          if (embeddedImageOutputBytes + base64Length > DOCX_PREVIEW_MAX_OUTPUT_BYTES) {
            embeddedImageOutputExceeded = true;
            return { src: '' };
          }
          embeddedImageOutputBytes += base64Length;
          return { src: `data:${image.contentType};base64,${imageBytes.toString('base64')}` };
        }),
      });
      if (embeddedImageOutputExceeded) return { kind: 'oversized' as const };
      if (Buffer.byteLength(convertedHtml, 'utf8') > DOCX_PREVIEW_MAX_OUTPUT_BYTES) return { kind: 'oversized' as const };
      const bodyHtml = sanitizeHtml(convertedHtml, {
        allowedTags: ['p', 'br', 'div', 'span', 'strong', 'em', 'b', 'i', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'img'],
        allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'title', 'width', 'height'] },
        allowedSchemes: ['http', 'https', 'mailto'],
        allowedSchemesByTag: { img: ['data'] },
        transformTags: {
          img: (_tagName, attribs) => ({
            tagName: 'img',
            attribs: { ...attribs, ...(/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(attribs.src ?? '') ? {} : { src: '' }) },
          }),
        },
      });
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none';" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${attachment.originalName.replace(/</g, '&lt;')}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; line-height: 1.6; margin: 0; padding: 20px 28px; color: #1e293b; background: #fff; word-break: break-word; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  td, th { border: 1px solid #cbd5e1; padding: 4px 8px; }
  th { background: #f1f5f9; }
  img { max-width: 100%; height: auto; }
  p { margin: 0 0 0.6em; }
  h1,h2,h3,h4,h5,h6 { margin: 0.8em 0 0.4em; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
      if (Buffer.byteLength(html, 'utf8') > DOCX_PREVIEW_MAX_OUTPUT_BYTES) return { kind: 'oversized' as const };
      return { kind: 'html' as const, html };
    });
    if (result.kind === 'oversized') {
      return res.status(413).json({ error: 'This document is too large to preview. Download the file to open it in a compatible viewer.' });
    }
    const html = result.html;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox");
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.originalName)}.html"`);
    res.setHeader('Content-Length', String(Buffer.byteLength(html, 'utf8')));
    res.send(html);
  } catch (error) {
    if (error instanceof PodStorageFileTooLargeError) {
      return res.status(413).json({ error: 'This document is too large to preview. Download the file to open it in a compatible viewer.' });
    }
    console.error('[POD preview] DOCX conversion failed');
    res.status(500).json({ error: 'Document preview could not be generated. Download the file to open it in a compatible viewer.' });
  }
}));

router.delete('/:id/attachments/:attachmentId', requireAuth, requireResource('records'), requireRecordAccess, requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'TASS'), asyncRoute(async (req, res) => {
  const remarks = typeof req.body?.remarks === 'string' ? req.body.remarks.trim() : '';

  const result = await prisma.$transaction(async tx => {
    await lockPodRecord(tx, req.params.id);
    const attachment = await tx.podAttachment.findFirst({ where: { id: req.params.attachmentId, recordId: req.params.id } });
    if (!attachment) return { status: 404, error: 'Attachment not found' };
    const record = await tx.deliveryRecord.findUnique({ where: { id: req.params.id } });
    if (req.user!.role === 'TASS' && record?.category !== 'RMA') return { status: 403, error: 'TASS may manage documents for RMA records only' };
    if (!record || !canWriteCategory(req.user!, record.category)) return { status: 403, error: 'Record access denied' };
    if (record.category === 'RMA') {
      const policy = await readRmaPermissions(tx, req.user!.id);
      if (!policy || !canPerformPolicyRecordAction(policy, record, 'POD', { path: 'rma' })) return { status: 403, error: 'RMA document changes are not permitted.' };
      if (record.rmaTransportStatus === 'COMPLETED' && await isStoredPodPhoto(attachment) && !await hasStoredDeliveryPhoto(tx, record.id, attachment.id)) return { status: 409, error: 'Keep at least one transport proof photo. Upload a replacement before removing this photo.' };
    }
    if (record.category !== 'RMA' && record.status === 'ACCOMPLISHED' &&
        await isStoredPodPhoto(attachment) && !await hasStoredDeliveryPhoto(tx, record.id, attachment.id)) {
      return { status: 409, error: 'Keep at least one delivery photo on an accomplished delivery. Upload a replacement before removing this photo.' };
    }
    const deletion = await tx.podStorageDeletion.create({ data: {
      storageKey: attachment.storageKey, storageNamespace: podStorageNamespace,
    } });
    await tx.podAttachment.delete({ where: { id: attachment.id } });
    await tx.auditLog.create({ data: { recordId: req.params.id, recordType: 'DeliveryRecord', action: 'UPDATE', changedById: req.user!.id, previousValue: JSON.stringify({ attachment: attachment.originalName, attachment_id: attachment.id }), newValue: JSON.stringify({ attachment_removed: attachment.id }) } });
    if (remarks) await tx.remarkLog.create({ data: { recordId: req.params.id, body: `Removed attachment ${attachment.originalName}: ${remarks}`, context: 'GENERAL_EDIT', authorId: req.user!.id } });
    return { deletionId: deletion.id };
  }, { timeout: 30_000, maxWait: 10_000 });
  if (result.status !== undefined) return res.status(result.status).json({ error: result.error });
  // A failure/ambiguous commit never reaches this point and cannot delete bytes.
  // Once committed, logical removal is complete; storage outages leave a durable
  // job for startup/periodic recovery rather than a phantom attachment or 500.
  await cleanPodStorageDeletions(result.deletionId).catch(() => {
    console.error('[POD cleanup] Committed attachment cleanup remains queued');
  });
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
router.post('/', requireAuth, requireResource('records'), requireRecordAccess, requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'TASS'), asyncRoute(async (req, res) => {
  const b = req.body ?? {};
  const dbCategory = CATEGORY_TO_DB[b.category] ?? b.category;
  const isDraft = b.is_draft === 'Yes' || b.status === 'Draft';
  if (req.user!.activeMode === 'V1') {
    if (!canCreateCategory(req.user!, dbCategory)) return res.status(403).json({ error: 'Record creation denied' });
    const candidate = { category: dbCategory, draft: isDraft, status: 'SCHEDULED', deliveryDate: b.delivery_date, driverId: null, rmaMovement: b.rma_movement };
    if (Array.isArray(b.attachments) && b.attachments.length && !canPerformRecordAction(req.user!, candidate, 'POD')) return res.status(403).json({ error: 'Document changes denied' });
    if (b.vehicle && b.vehicle !== '(None)' && !canPerformRecordAction(req.user!, candidate, 'ASSIGN')) return res.status(403).json({ error: 'Vehicle assignment denied' });
  }
  const referenceField = dbCategory === 'RMA' ? 'rma_reference' : 'reference';
  const required = isDraft || dbCategory === 'RMA'
    ? ['company_id', 'category']
    : ['company_id', referenceField, 'category'];
  const missing = required.filter(k => typeof b[k] !== 'string' || !b[k].trim());
  if (missing.length > 0) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  if (dbCategory === 'RMA') {
    const rmaError = rmaInputError(b, true);
    if (rmaError) return res.status(400).json({ error: rmaError });
    const movementError = rmaMovementInputError(b, !isDraft);
    if (movementError) return res.status(400).json({ error: movementError });
  }

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

  const submissionError = !isDraft && recordSubmissionError({ category: dbCategory, reference: b.reference, deliveryDate: b.delivery_date });
  if (submissionError) return res.status(400).json({ error: submissionError });
  if (b.delivery_date !== undefined && b.delivery_date !== '' && !isValidDateOnly(b.delivery_date)) return res.status(400).json({ error: 'Delivery Date must be a valid YYYY-MM-DD date.' });
  if (b.priority !== undefined && !['1 - Low', '2 - Moderate', '3 - High'].includes(b.priority)) return res.status(400).json({ error: 'Invalid record priority.' });
  if (b.status && !['Draft', 'Scheduled'].includes(b.status)) return res.status(400).json({ error: 'New records must be Draft or Scheduled.' });
  if (requestsDriver || (Array.isArray(b.driver_assistants) && b.driver_assistants.length)) return res.status(400).json({ error: 'Assign drivers after submitting the record.' });
  const company = await prisma.company.findUnique({ where: { id: b.company_id }, select: { id: true, isActive: true } });
  if (!company) return res.status(400).json({ error: 'Select an existing Company.' });
  if (!company.isActive) return res.status(400).json({ error: 'This company is inactive. Choose an active company.' });
  const accountManager = await recordAccountManager(prisma, b.account_manager ?? '');
  if ('error' in accountManager) return res.status(400).json({ error: accountManager.error });
  let created: Prisma.DeliveryRecordGetPayload<{ include: typeof recordInclude }>;
  try {
    created = await prisma.$transaction(async tx => {
      const data: Prisma.DeliveryRecordUncheckedCreateInput = {
        id: generateRecordId(),
        companyId: b.company_id,
        priority: b.priority ?? '2 - Moderate',
        reference: dbCategory === 'RMA' ? '' : (b.reference ?? ''),
        rmaReference: dbCategory === 'RMA' && typeof b.rma_reference === 'string' ? b.rma_reference.trim() || null : null,
        legacySapReference: null,
        remarks: b.remarks ?? '',
        status: 'SCHEDULED',
        vehicle: b.vehicle ?? '(None)',
        area: b.area ?? '',
        driver: '',
        driverAssistants: '[]',
        timeIn: null,
        timeOut: null,
        receivedBy: null,
        accountManager: accountManager.name,
        deliveryDate: b.delivery_date ?? '',
        category: dbCategory as any,
        itemType: b.item_type ?? 'Small Item',
        draft: isDraft,
        submittedAt: submittedAtOnCreate(isDraft),
        rmaType: dbCategory === 'RMA' ? normalizeRmaCategory(b.rma_type) : null,
        rmaMovement: dbCategory === 'RMA' ? b.rma_movement || null : null,
        rmaTransportStatus: dbCategory === 'RMA' && b.rma_movement === 'LOGISTICS_TRANSPORT' ? 'PENDING' : null,
        purchaseDate: dbCategory === 'RMA' ? (b.purchase_date || null) : null,
        customerContactName: dbCategory === 'RMA' && typeof b.customer_contact_name === 'string' ? b.customer_contact_name.trim() || null : null,
        customerContactEmail: dbCategory === 'RMA' && typeof b.customer_contact_email === 'string' ? b.customer_contact_email.trim() || null : null,
        customerContactPhone: dbCategory === 'RMA' && typeof b.customer_contact_phone === 'string' ? b.customer_contact_phone.trim() || null : null,

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
      };
      const submissionError = !data.draft && recordSubmissionError(data);
      if (submissionError) throw new RecordSubmissionError(submissionError);
      const created = await tx.deliveryRecord.create({ data, include: recordInclude });

      await tx.auditLog.create({ data: {
        recordId: created.id, recordType: 'DeliveryRecord', action: 'CREATE', changedById: req.user!.id,
        newValue: JSON.stringify(serializeRecord(created)),
      } });
      if (typeof b.remarks === 'string' && b.remarks.trim()) await tx.remarkLog.create({ data: { recordId: created.id, body: b.remarks.trim(), context: 'CREATION', authorId: req.user!.id } });
      if (dbCategory !== 'RMA' && !created.draft) await notifyOrdinarySubmission(tx, created);
      if (dbCategory === 'RMA' && needsLogisticsHandoff(created)) await notifyRmaRecipients(tx, created, ['LOGISTICS'], 'New RMA request — driver needed', `${created.rmaReference || created.id} · ${created.company.name}${created.deliveryDate ? ` on ${created.deliveryDate}` : ''} · ${created.address || created.area}`);
      return created;
    });
  } catch (error) {
    if (error instanceof RecordSubmissionError) return res.status(400).json({ error: error.message });
    if ((error as { code?: string })?.code === 'P2003') return res.status(400).json({ error: 'Select an existing Company.' });
    throw error;
  }



  res.status(201).json(serializeRecord(created, req.user!));
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
  if (existing.category === 'RMA' && ['driver', 'driver_id', 'vehicle', 'driver_assistants'].some(field => field in b)) {
    return res.status(403).json({ error: 'Use the dedicated RMA assignment action for Driver, vehicle and assistant changes.' });
  }
  if (existing.category === 'RMA' && (b.received_by !== undefined || b.time_in !== undefined || b.time_out !== undefined)) {
    return res.status(req.user!.role === 'TASS' ? 400 : 403).json({ error: req.user!.role === 'TASS' ? 'Use the physical receipt action; RMA transport has separate timestamps.' : RMA_COMPLETION_ROLE_ERROR });
  }
  const hasTimestamp = b.time_in !== undefined || b.time_out !== undefined;
  if (hasTimestamp && !['LOGISTICS', 'ADMIN'].includes(req.user!.role)) return res.status(403).json({ error: 'Only Logistics or Admin may correct recorded timestamps.' });
  for (const [field, current] of [['time_in', existing.timeIn], ['time_out', existing.timeOut]] as const) {
    if (b[field] !== undefined && (!current || !isoTimestamp(b[field]))) return res.status(400).json({ error: 'Corrections require an existing timestamp and a full ISO timestamp with timezone. Use Record Time In to start the run.' });
  }
  if (b.is_draft !== undefined && !['Yes', 'No'].includes(b.is_draft)) return res.status(400).json({ error: 'is_draft must be Yes or No.' });
  if (b.is_draft !== undefined && (b.is_draft === 'Yes') !== existing.draft && !['SALES_COORDINATOR', 'ADMIN'].includes(req.user!.role) && !(req.user!.role === 'TASS' && existing.category === 'RMA')) return res.status(403).json({ error: 'Only Sales Coordinator, TASS for RMA, or Admin may submit or return drafts.' });

  if (b.priority !== undefined) {
    if (!['SALES_COORDINATOR', 'LOGISTICS', 'ADMIN'].includes(req.user!.role) && !(req.user!.role === 'TASS' && existing.category === 'RMA')) {
      return res.status(403).json({ error: 'Your role cannot change record priority.' });
    }
    if (!['1 - Low', '2 - Moderate', '3 - High'].includes(b.priority)) {
      return res.status(400).json({ error: 'Invalid record priority.' });
    }
  }

  if (existing.category === 'RMA') {
    if (b.reference !== undefined) return res.status(400).json({ error: 'Use rma_reference for the RMA document reference.' });
    const rmaError = rmaInputError(b);
    if (rmaError) return res.status(400).json({ error: rmaError });
    const rmaFields = ['priority', 'area', 'account_manager', 'rma_reference', 'rma_type', 'purchase_date', ...RMA_CONTACT_FIELDS];
    const isSubmitting = existing.draft && b.is_draft === 'No';
    const editsSubmittedRmaDetails = !existing.draft && rmaFields.some(field => field in b);
    if (isSubmitting || editsSubmittedRmaDetails) {
      const candidate = {
        priority: b.priority ?? existing.priority,
        area: b.area ?? existing.area,
        account_manager: b.account_manager ?? existing.accountManager,
        rma_reference: b.rma_reference ?? existing.rmaReference,
        rma_type: b.rma_type ?? existing.rmaType,
        purchase_date: b.purchase_date ?? existing.purchaseDate,
        customer_contact_name: b.customer_contact_name ?? existing.customerContactName,
        customer_contact_email: b.customer_contact_email ?? existing.customerContactEmail,
        customer_contact_phone: b.customer_contact_phone ?? existing.customerContactPhone,
      };
      const completeError = rmaInputError(candidate, true);
      if (completeError) return res.status(400).json({ error: completeError });
    }
  }

  const LOGISTICS_SUBSTANTIVE_FIELDS = ['driver', 'driver_id', 'vehicle', 'driver_assistants', 'time_in', 'time_out', 'received_by', 'linked_collection_id', 'area', 'address', 'priority'];
  const SC_SUBSTANTIVE_FIELDS = ['company_id', 'priority', 'reference', 'area', 'address', 'account_manager', 'delivery_date', 'item_type', 'is_draft', 'date_time', 'item_description', 'line_items', 'attachments', 'amount'];
  const RMA_SUBSTANTIVE_FIELDS = [...SC_SUBSTANTIVE_FIELDS.filter(field => field !== 'reference'), 'rma_reference', 'rma_type', 'purchase_date', ...RMA_CONTACT_FIELDS];
  const ADMIN_SUBSTANTIVE_FIELDS = existing.category === 'RMA'
    ? [...LOGISTICS_SUBSTANTIVE_FIELDS, ...RMA_SUBSTANTIVE_FIELDS]
    : [...LOGISTICS_SUBSTANTIVE_FIELDS, ...SC_SUBSTANTIVE_FIELDS];
  const substantiveFields = req.user!.role === 'ADMIN' ? ADMIN_SUBSTANTIVE_FIELDS
    : req.user!.role === 'LOGISTICS' ? LOGISTICS_SUBSTANTIVE_FIELDS
    : req.user!.role === 'TASS' && existing.category === 'RMA' ? RMA_SUBSTANTIVE_FIELDS
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
  } else if (req.user!.role === 'LOGISTICS' || req.user!.role === 'ADMIN') {
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
          where: {
            id: b.linked_collection_id,
            deletedAt: null,
            category: 'ACCOUNTING_COLLECTION',
            AND: [recordScope(req.user!)]
          }
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
    if (b.reference !== undefined && existing.category !== 'RMA') data.reference = b.reference;
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

  if (req.user!.role === 'TASS' && existing.category === 'RMA') {
    if (b.priority !== undefined) data.priority = b.priority;
    if (b.rma_reference !== undefined) data.rmaReference = typeof b.rma_reference === 'string' ? b.rma_reference.trim() || null : null;
    if (b.area !== undefined) data.area = b.area;
    if (b.address !== undefined) data.address = b.address;
    if (b.account_manager !== undefined) data.accountManager = b.account_manager;
    if (b.delivery_date !== undefined) data.deliveryDate = b.delivery_date;
    if (b.item_type !== undefined) data.itemType = b.item_type;
    if (b.is_draft !== undefined) data.draft = b.is_draft === 'Yes';
    if (b.item_description !== undefined) data.itemDescription = b.item_description;
    if (Array.isArray(b.line_items)) data.lineItems = { deleteMany: {}, create: b.line_items.map((li: any) => ({ sku: li.sku || li.description || '', quantity: typeof li.quantity === 'number' ? li.quantity : parseInt(li.quantity, 10) || 1 })) };
    if (b.rma_type !== undefined) data.rmaType = normalizeRmaCategory(b.rma_type);
    if (b.purchase_date !== undefined) data.purchaseDate = b.purchase_date || null;
    if (b.customer_contact_name !== undefined) data.customerContactName = typeof b.customer_contact_name === 'string' ? b.customer_contact_name.trim() || null : null;
    if (b.customer_contact_email !== undefined) data.customerContactEmail = typeof b.customer_contact_email === 'string' ? b.customer_contact_email.trim() || null : null;
    if (b.customer_contact_phone !== undefined) data.customerContactPhone = typeof b.customer_contact_phone === 'string' ? b.customer_contact_phone.trim() || null : null;
  }
  if (existing.category === 'RMA' && b.rma_movement !== undefined) {
    const movementError = rmaMovementInputError(b);
    if (movementError) return res.status(400).json({ error: movementError });
    data.rmaMovement = b.rma_movement || null;
  }
  if (existing.category === 'DELIVERY' && (req.user!.role === 'SALES_COORDINATOR' || req.user!.role === 'ADMIN') && b.delivery_date !== undefined && !isValidDateOnly(b.delivery_date)) {
    return res.status(400).json({ error: 'Delivery Date must be a valid YYYY-MM-DD date.' });
  }

  // Admin can correct the same full metadata exposed by the staff editor.
  if (req.user!.role === 'ADMIN') {
    const metadata: Record<string, string> = { company_id: 'companyId', account_manager: 'accountManager', delivery_date: 'deliveryDate', item_type: 'itemType', item_description: 'itemDescription' };
    if (existing.category !== 'RMA') metadata.reference = 'reference';
    for (const [input, field] of Object.entries(metadata)) if (b[input] !== undefined) data[field] = b[input];
    if (b.amount !== undefined) data.amount = b.amount != null ? parseFloat(String(b.amount)) : null;
    if (Array.isArray(b.attachments) && b.attachments.length > 0) data.documentAttachment = b.attachments[0];
    if (Array.isArray(b.line_items)) data.lineItems = { deleteMany: {}, create: b.line_items.map((li: any) => ({ sku: li.sku || li.description || '', quantity: typeof li.quantity === 'number' ? li.quantity : parseInt(li.quantity, 10) || 1 })) };
    if (existing.category === 'RMA') {
      if (b.reference !== undefined) return res.status(400).json({ error: 'Use rma_reference for the RMA document reference.' });
      if (b.rma_reference !== undefined) data.rmaReference = typeof b.rma_reference === 'string' ? b.rma_reference.trim() || null : null;
      if (b.rma_type !== undefined) data.rmaType = normalizeRmaCategory(b.rma_type);
      if (b.purchase_date !== undefined) data.purchaseDate = b.purchase_date || null;
      if (b.customer_contact_name !== undefined) data.customerContactName = typeof b.customer_contact_name === 'string' ? b.customer_contact_name.trim() || null : null;
      if (b.customer_contact_email !== undefined) data.customerContactEmail = typeof b.customer_contact_email === 'string' ? b.customer_contact_email.trim() || null : null;
      if (b.customer_contact_phone !== undefined) data.customerContactPhone = typeof b.customer_contact_phone === 'string' ? b.customer_contact_phone.trim() || null : null;
    }
  }
  if (b.is_draft !== undefined) data.draft = b.is_draft === 'Yes';
  if (b.remarks !== undefined) data.remarks = String(b.remarks).trim();
  if (b.received_by !== undefined && typeof b.received_by !== 'string') return res.status(400).json({ error: 'Received By must be a name.' });
  if (data.companyId !== undefined && (typeof data.companyId !== 'string' || !data.companyId.trim())) return res.status(400).json({ error: 'Select an existing Company.' });
  const result = await withDriverDirectoryLock(prisma, async tx => {
    await lockPodRecord(tx, existing.id);
    const current = await tx.deliveryRecord.findUnique({ where: { id: existing.id }, include: { lineItems: true } });
    if (!current || current.deletedAt) return { error: 'Record not found', updated: null };
    if (!canWriteCategory(req.user!, current.category) || (req.user!.role === 'DRIVER' && !isAssignedDriver(req.user!, current))) return { error: 'Record access denied', updated: null };
    if (current.category !== 'RMA') {
      const salesMetadata = ['company_id', 'reference', 'area', 'address', 'account_manager', 'delivery_date', 'item_type', 'date_time', 'item_description', 'line_items', 'attachments', 'amount'];
      if (req.user!.role === 'SALES_COORDINATOR' && !current.draft && runState(current) !== 'Scheduled'
        && salesMetadata.some(field => field in b)) return { error: 'Sales metadata is locked after dispatch. Ask Logistics or Admin to correct the record.', updated: null, writeStatus: 403 };
    }
    if (current.category === 'RMA') {
      const policy = await rmaActionPolicy(tx, req.user!, current);
      const operation = data.draft === true && !current.draft ? 'STATUS' : data.draft === false && current.draft ? 'SUBMIT' : 'UPDATE';
      if (!canPerformPolicyRecordAction(policy, current, operation, { path: 'rma', targetStatus: data.draft ? 'Draft' : 'Scheduled' })) return { error: 'Record access denied', updated: null };
      const editsDetails = Object.keys(b).some(key => !['is_draft', 'remarks', 'expected_version'].includes(key));
      if (editsDetails && !canPerformPolicyRecordAction(policy, current, 'UPDATE', { path: 'rma' })) return { error: 'Record access denied', updated: null };
      const stale = rmaVersionError(current, b.expected_version);
      if (stale) return { error: stale, updated: null, rmaStatus: Number.isSafeInteger(b.expected_version) ? 409 : 400 };
      const movement = data.rmaMovement === undefined ? current.rmaMovement : data.rmaMovement;
      const movementError = rmaMovementInputError({ rma_movement: movement, delivery_date: data.deliveryDate ?? current.deliveryDate }, !(data.draft ?? current.draft));
      if (movementError) return { error: movementError, updated: null };
      const movementChanged = movement !== current.rmaMovement;
      if ((movementChanged || data.deliveryDate !== undefined && data.deliveryDate !== current.deliveryDate || data.draft === true)
        && (current.rmaTransportStartedAt || current.rmaReceivedAt || current.status === 'ACCOMPLISHED')) return { error: 'Movement responsibility, date and submission cannot change after transport starts or receipt is confirmed.', updated: null };
      if (movementChanged) {
        data.rmaTransportStatus = movement === 'LOGISTICS_TRANSPORT' ? 'PENDING' : null;
        data.driverId = null; data.driver = ''; data.vehicle = '(None)'; data.driverAssistants = '[]';
      }
      data.rmaVersion = { increment: 1 };
    }
    const dateError = driverDeliveryDateError(current, req.user!.role);
    if (dateError) return { error: dateError, updated: null };
    if (data.priority !== undefined && data.priority !== current.priority && runState(current) === 'Delivered') return { error: PRIORITY_LOCKED_ERROR, updated: null };
    if (data.draft !== undefined && data.draft !== current.draft) {
      if (!['SALES_COORDINATOR', 'ADMIN'].includes(req.user!.role) && !(req.user!.role === 'TASS' && current.category === 'RMA')) return { error: 'Only Sales Coordinator, TASS for RMA, or Admin may submit or return drafts.', updated: null };
      const invalid = transitionError(current, data.draft ? 'Draft' : 'Scheduled', req.user!.role);
      if (invalid) return { error: invalid, updated: null };
      if (!data.draft && current.category === 'RMA') {
        const rmaSubmission = {
          priority: data.priority ?? current.priority,
          area: data.area ?? current.area,
          account_manager: data.accountManager ?? current.accountManager,
          rma_reference: data.rmaReference ?? current.rmaReference,
          rma_type: data.rmaType ?? current.rmaType,
          purchase_date: data.purchaseDate ?? current.purchaseDate,
          customer_contact_name: data.customerContactName ?? current.customerContactName,
          customer_contact_email: data.customerContactEmail ?? current.customerContactEmail,
          customer_contact_phone: data.customerContactPhone ?? current.customerContactPhone,
        };
        const rmaError = rmaInputError(rmaSubmission, true);
        if (rmaError) return { error: rmaError, updated: null };
      }
      data.status = 'SCHEDULED';
    }
    if (!(data.draft ?? current.draft) && (current.draft || data.reference !== undefined || data.deliveryDate !== undefined)) {
      const submissionError = recordSubmissionError({ ...current, ...data });
      if (submissionError) return { error: submissionError, updated: null };
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
    // DEF-008: an unknown Company is a client error, not a foreign-key 500.
    if (data.companyId !== undefined && data.companyId !== current.companyId) {
      const company = await tx.company.findUnique({ where: { id: data.companyId as string }, select: { id: true, isActive: true } });
      if (!company) return { error: 'Select an existing Company.', updated: null };
      if (!company.isActive) return { error: 'This company is inactive. Choose an active company.', updated: null };
    }
    // Old records may keep a retired name; any new choice must be an active Account Manager.
    if (data.accountManager !== undefined) {
      const accountManager = await recordAccountManager(tx, data.accountManager, current.accountManager);
      if ('error' in accountManager) return { error: accountManager.error, updated: null };
      data.accountManager = accountManager.name;
    }
    if (current.category !== 'RMA') {
      const conflict = recordEditError(current, b.expected_edit_version);
      if (conflict) return { error: conflict.error, updated: null, writeStatus: conflict.status };
    }
    Object.assign(data, submittedAtChange(current.draft, data.draft ?? current.draft));
    const updated = await tx.deliveryRecord.update({ where: { id: existing.id }, data, include: recordInclude });
    await tx.auditLog.create({ data: {
      recordId: updated.id, recordType: 'DeliveryRecord', action: 'UPDATE', changedById: req.user!.id,
      previousValue: JSON.stringify(serializeRecord({ ...existing, ...current })),
      newValue: JSON.stringify(serializeRecord(updated)),
    } });
    if (typeof b.remarks === 'string' && b.remarks.trim()) await tx.remarkLog.create({ data: {
      recordId: updated.id, body: b.remarks.trim(), context: hasTimestamp ? 'TIMESTAMP_CORRECTION' : 'GENERAL_EDIT', authorId: req.user!.id,
    } });
    if (current.draft && !updated.draft && current.category !== 'RMA') await notifyOrdinarySubmission(tx, updated);
    if (current.category === 'RMA' && needsLogisticsHandoff(updated) && (current.draft || !isLogisticsRma(current))) {
      await notifyRmaRecipients(tx, updated, ['LOGISTICS'], 'RMA request — driver needed', `${updated.rmaReference || updated.id} · ${updated.company.name} on ${updated.deliveryDate} · ${updated.address || updated.area}`);
    }
    return { error: null, updated, previousDraft: current.draft };
  }).catch(error => {
    if (error instanceof RmaActionError) return { error: error.message, updated: null, rmaStatus: error.status };
    // The Company can disappear between the lookup and the write; the transaction has rolled back.
    if ((error as { code?: string })?.code === 'P2003' && data.companyId !== undefined) return { error: 'Select an existing Company.', updated: null };
    throw error;
  });
  if (result.error) return res.status('writeStatus' in result ? Number(result.writeStatus) : 'rmaStatus' in result ? Number(result.rmaStatus) : result.error === 'Record not found' ? 404 : result.error === 'Record access denied' || result.error.startsWith('Only Sales Coordinator') ? 403 : 400).json({ error: result.error });
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

  res.json(serializeRecord(updated, req.user!));
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
  res.json(serializeRecord(result.saved, req.user!));
}));

// Every completion path validates persisted proof and stamps server Time Out atomically.
router.patch('/:id/status', requireAuth, requireResource('records'), requireRecordAccess, requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER', 'TASS'), asyncRoute(async (req, res) => {
  const { status, remarks, received_by, priority } = req.body ?? {};
  if (!status || !STATUS_TO_DB[status]) return res.status(400).json({ error: 'Valid status is required' });
  if (typeof remarks !== 'string' || !remarks.trim()) return res.status(400).json({ error: 'Remarks are required when changing status.' });
  if (req.body.time_in !== undefined || req.body.time_out !== undefined) return res.status(400).json({ error: 'Use Record Time In or timestamp corrections; Time Out is recorded automatically on completion.' });
  if (received_by !== undefined && typeof received_by !== 'string') return res.status(400).json({ error: 'Received By must be a name.' });
  const hasPriority = priority !== undefined && priority !== '';
  if (hasPriority && !['LOGISTICS', 'ADMIN', 'TASS'].includes(req.user!.role)) return res.status(403).json({ error: 'Your role cannot change record priority.' });
  if (hasPriority && !['1 - Low', '2 - Moderate', '3 - High'].includes(priority)) return res.status(400).json({ error: 'Invalid record priority.' });
  const newDeliveryDate = req.body.delivery_date;
  const hasNewDeliveryDate = newDeliveryDate !== undefined && newDeliveryDate !== null && newDeliveryDate !== '';
  if (hasNewDeliveryDate && !isValidDateOnly(newDeliveryDate)) return res.status(400).json({ error: 'New delivery date must be a valid YYYY-MM-DD date.' });
  // WAN storage downloads and image decoding can exceed Prisma's default 5s
  // transaction limit. Verify the actual persisted bytes before acquiring the
  // record lock; the transaction below still validates the identical attachment.
  const completionRecord = status === 'Delivered'
    ? await prisma.deliveryRecord.findFirst({ where: { id: req.params.id, deletedAt: null, AND: [recordScope(req.user!)] }, select: { category: true } })
    : null;
  const verifiedPod = status === 'Delivered' && completionRecord?.category !== 'RMA'
    ? await findVerifiedDeliveryPhoto(prisma, req.params.id)
    : null;
  const result = await prisma.$transaction(async tx => {
    await lockPodRecord(tx, req.params.id);
    const current = await tx.deliveryRecord.findUnique({ where: { id: req.params.id }, include: recordInclude });
    if (!current || current.deletedAt || (req.user!.role === 'DRIVER' && !isAssignedDriver(req.user!, current)) || !canWriteCategory(req.user!, current.category)) return { error: 'Record access denied', saved: null, previous: null };
    if (current.category === 'RMA') {
      if (req.user!.role !== 'TASS' && (status === 'Delivered' || received_by !== undefined)) return { error: RMA_COMPLETION_ROLE_ERROR, saved: null, previous: null };
      const policy = await rmaActionPolicy(tx, req.user!, current);
      const operation = status === 'Delivered' ? 'COMPLETE' : current.draft && status === 'Scheduled' ? 'SUBMIT' : 'STATUS';
      if (!canPerformPolicyRecordAction(policy, current, operation, { path: 'rma', targetStatus: status as RunState, rmaTransport: rmaTransportContext(current) })) return { error: 'Record access denied', saved: null, previous: null };
      if (hasPriority && !canPerformPolicyRecordAction(policy, current, 'UPDATE', { path: 'rma' })) return { error: 'Record access denied', saved: null, previous: null };
      const stale = rmaVersionError(current, req.body.expected_version);
      if (stale) return { error: stale, saved: null, previous: null, rmaStatus: Number.isSafeInteger(req.body.expected_version) ? 409 : 400 };
      if (status === 'Delivered' && !rmaCapabilities(policy, current).complete) return { error: 'Confirm physical receipt and complete any Logistics transport before completing this RMA.', saved: null, previous: null };
      if (received_by !== undefined && (status !== 'Delivered' || received_by.trim() !== current.rmaRecipient)) return { error: 'Use the confirmed physical receipt recipient for RMA completion.', saved: null, previous: null };
      if (status === 'Draft' && (current.rmaTransportStartedAt || current.rmaReceivedAt)) return { error: 'An RMA with started transport or confirmed receipt cannot return to Draft.', saved: null, previous: null };
      if (current.draft && status === 'Scheduled') {
        const movementError = rmaMovementInputError({ rma_movement: current.rmaMovement, delivery_date: current.deliveryDate }, true);
        if (movementError) return { error: movementError, saved: null, previous: null };
      }
    }
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
      if (current.category !== 'RMA' && (status === 'Delivered' || status === 'Pending') && !isoTimestamp(current.timeIn)) return { error: 'Record a valid Time In before completing or marking this run Pending.', saved: null, previous: null };
      const error = transitionError(current, status as RunState, req.user!.role);
      if (error) return { error, saved: null, previous: null };
    }
    if (current.draft && status === 'Scheduled' && current.category === 'RMA') {
      const rmaError = rmaInputError({
        priority: current.priority,
        area: current.area,
        account_manager: current.accountManager,
        rma_reference: current.rmaReference,
        rma_type: current.rmaType,
        purchase_date: current.purchaseDate,
        customer_contact_name: current.customerContactName,
        customer_contact_email: current.customerContactEmail,
        customer_contact_phone: current.customerContactPhone,
      }, true);
      if (rmaError) return { error: rmaError, saved: null, previous: null };
    }
    if (current.draft && status === 'Scheduled') {
      const submissionError = recordSubmissionError(current);
      if (submissionError) return { error: submissionError, saved: null, previous: null };
    }
    const data: any = { ...(statusChanged ? { status: STATUS_TO_DB[status], draft: status === 'Draft' } : {}), remarks: remarks.trim(), modifiedById: req.user!.id };
    if (hasPriority) data.priority = priority;
    if (current.status === 'ACCOMPLISHED' && received_by !== undefined && !received_by.trim()) return { error: 'Received By is required on completed runs.', saved: null, previous: null };
    if (received_by !== undefined && current.category !== 'RMA') data.receivedBy = received_by.trim();
    if (statusChanged && status === 'Delivered') {
      if (current.category !== 'RMA' && !isoTimestamp(current.timeIn)) return { error: 'Record a valid Time In before completing this run.', saved: null, previous: null };
      const recipient = current.category === 'RMA' ? current.rmaRecipient : received_by ?? current.receivedBy;
      if (!String(recipient ?? '').trim()) return { error: current.category === 'RMA' ? 'Recipient / Collector is required before completing this RMA.' : 'Received By is required before completing this run.', saved: null, previous: null };
      if (current.category !== 'RMA' && (!verifiedPod || !await tx.podAttachment.findFirst({
        where: {
          id: verifiedPod.id,
          recordId: current.id,
          storageKey: verifiedPod.storageKey,
          mimeType: verifiedPod.mimeType,
          size: verifiedPod.size,
        },
      }))) return { error: DELIVERY_PHOTO_REQUIRED, saved: null, previous: null };
      data.receivedBy = String(recipient).trim();
      const completedAt = new Date();
      if (current.category === 'RMA') data.rmaCompletedAt = completedAt;
      else data.timeOut = completedAt.toISOString();
      if (current.category === 'DELIVERY') {
        const schedule = deliveryScheduleState(current.deliveryDate, completedAt);
        data.completedLate = schedule.valid && schedule.overdue;
        data.daysLate = schedule.valid ? schedule.daysLate : 0;
      }
    }
    if (statusChanged && status === 'Rescheduled' && current.category !== 'RMA') { data.timeIn = null; data.timeOut = null; data.receivedBy = null; }
    if (requiresNewDate) data.deliveryDate = newDeliveryDate;
    if (current.category !== 'RMA' && (hasPriority || hasNewDeliveryDate)) {
      const conflict = recordEditError(current, req.body.expected_edit_version);
      if (conflict) return { error: conflict.error, saved: null, previous: null, writeStatus: conflict.status };
    }
    if (current.category === 'RMA') data.rmaVersion = { increment: 1 };
    Object.assign(data, submittedAtChange(current.draft, data.draft ?? current.draft));
    const saved = await tx.deliveryRecord.update({ where: { id: current.id }, data, include: recordInclude });
    await tx.auditLog.create({ data: {
      recordId: saved.id, recordType: 'DeliveryRecord', action: 'UPDATE', changedById: req.user!.id,
      previousValue: JSON.stringify(serializeRecord(current)), newValue: JSON.stringify(serializeRecord(saved)),
    } });
    await tx.remarkLog.create({ data: { recordId: saved.id, body: remarks.trim(), context: 'STATUS_CHANGE', authorId: req.user!.id } });
    if (current.draft && !saved.draft && current.category !== 'RMA') await notifyOrdinarySubmission(tx, saved);
    if (current.category === 'RMA' && current.draft && needsLogisticsHandoff(saved)) await notifyRmaRecipients(tx, saved, ['LOGISTICS'], 'RMA request — driver needed', `${saved.rmaReference || saved.id} · ${saved.company.name} on ${saved.deliveryDate} · ${saved.address || saved.area}`);
    if (current.category === 'RMA' && status === 'Delivered') await notifyRmaRecipients(tx, saved, ['TASS', 'LOGISTICS'], 'RMA completed', `${saved.rmaReference || saved.id} · ${saved.company.name} · Final completion recorded by TASS.`, req.user!.id);
    return { error: null, saved, previous: current };
  }, { timeout: 30_000, maxWait: 10_000 }).catch(error => {
    if (error instanceof RmaActionError) return { error: error.message, saved: null, previous: null, rmaStatus: error.status };
    throw error;
  });
  if (result.error) return res.status('writeStatus' in result ? Number(result.writeStatus) : 'rmaStatus' in result ? Number(result.rmaStatus) : result.error === RMA_COMPLETION_ROLE_ERROR || result.error === 'Record access denied' || result.error === 'TASS status updates are limited to RMA records' || result.error === 'Sales Coordinator may only submit or return drafts.' || result.error.startsWith('Only Sales Coordinator') ? 403 : 400).json({ error: result.error });
  const updated = result.saved!;
  if (status === 'Delivered' && updated.category !== 'RMA' && result.previous!.status !== 'ACCOMPLISHED') {
    await notifyAccomplished({
      id: updated.id, companyName: updated.company.name, deliveryDate: updated.deliveryDate,
      reference: updated.reference, accountManager: updated.accountManager, accomplishedByName: req.user!.name,
      recipientOverride: updated.category === 'ACCOUNTING_COLLECTION' ? 'Billing Department' : undefined,
    });
    if (updated.category === 'ACCOUNTING_COLLECTION') await notifyRole('TASS', 'Collection ready for verification', `${updated.company.name} · ${updated.reference} is now accomplished and requires collection verification.`, updated.id, 'DeliveryRecord');
  }
  res.json(serializeRecord(updated, req.user!));
}));

// Collection verification - TASS only, for ACCOUNTING_COLLECTION records that are ACCOMPLISHED.
router.patch('/:id/verify-collection', requireAuth, requireResource('records'), requireRecordAccess, requireRole('TASS'), asyncRoute(async (req, res) => {
  const result = await prisma.$transaction(async tx => {
    // Share the lifecycle lock with status changes, and re-read mutable state.
    await lockPodRecord(tx, req.params.id);
    const current = await tx.deliveryRecord.findFirst({
      where: { id: req.params.id, deletedAt: null, AND: [recordScope(req.user!)] },
      include: recordInclude,
    });
    if (!current) return { status: 404, error: 'Record not found' };
    const operationError = recordOperationError(req.user!, current, req.body ?? {}, '/:id/verify-collection', 'PATCH');
    if (operationError || !canWriteCategory(req.user!, current.category)) return { status: 403, error: operationError || 'Record access denied' };
    if (current.category !== 'ACCOUNTING_COLLECTION') return { status: 403, error: 'Collection verification only applies to Accounting Collection records' };
    if (current.draft || current.status !== 'ACCOMPLISHED') return { status: 400, error: 'Collection can only be verified after delivery is marked Accomplished' };
    if (current.collectionVerified) return { status: 409, error: 'This collection has already been verified' };

    const changed = await tx.deliveryRecord.updateMany({
      where: { id: current.id, deletedAt: null, category: 'ACCOUNTING_COLLECTION', draft: false, status: 'ACCOMPLISHED', collectionVerified: false, AND: [recordScope(req.user!)] },
      data: { collectionVerified: true, collectionVerifiedBy: req.user!.name, collectionVerifiedAt: new Date(), modifiedById: req.user!.id },
    });
    if (changed.count !== 1) return { status: 409, error: 'The collection changed. Refresh and try again.' };
    const updated = await tx.deliveryRecord.findUniqueOrThrow({ where: { id: current.id }, include: recordInclude });
    await tx.auditLog.create({ data: {
      recordId: updated.id, recordType: 'DeliveryRecord', action: 'UPDATE', changedById: req.user!.id,
      previousValue: JSON.stringify(serializeRecord(current)), newValue: JSON.stringify(serializeRecord(updated)),
    } });
    // The alert is persisted atomically; a failure rolls back verification too.
    await tx.notification.create({ data: {
      userId: current.createdById, title: 'Collection verified',
      message: `${updated.company.name} · ${updated.reference} collection verified by ${req.user!.name}.`,
      recordId: updated.id, recordType: 'DeliveryRecord',
    } });
    return { status: 200, updated };
  });
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json(serializeRecord(result.updated, req.user!));
}));

// OQ-03: operational records cannot be deleted by any role.
router.delete('/:id', requireAuth, requireResource('records'), requireRecordAccess, requireRole('SALES_COORDINATOR'), (_req, res) => {
  res.status(403).json({ error: 'Record deletion is disabled for all roles.' });
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

router.post('/:id/comments', requireAuth, requireResource('records'), requireRecordAccess, requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER', 'TASS'), asyncRoute(async (req, res) => {
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

  const commentInput = {
    data: {
      recordId: req.params.id,
      recordType: 'DeliveryRecord',
      body: String(body).trim(),
      authorId: req.user!.id
    },
    include: { author: { select: { name: true } } }
  };
  const comment = record.category === 'RMA' ? await prisma.$transaction(async tx => {
    await lockPodRecord(tx, record.id);
    const current = await tx.deliveryRecord.findUnique({ where: { id: record.id } });
    const policy = await readRmaPermissions(tx, req.user!.id);
    if (!current || current.deletedAt || !policy || !canPerformPolicyRecordAction(policy, current, 'COMMENT', {
      path: req.user!.role === 'DRIVER' ? 'driver_dashboard' : 'rma', rmaTransport: rmaTransportContext(current),
    })) return null;
    return tx.comment.create(commentInput);
  }) : await prisma.comment.create(commentInput);
  if (!comment) return res.status(403).json({ error: 'RMA comments are not permitted.' });

  res.status(201).json({
    id: comment.id,
    body: comment.body,
    author: comment.author.name,
    created_at: comment.createdAt,
    updated_at: comment.updatedAt
  });
}));

export default router;
