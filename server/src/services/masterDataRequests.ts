import { Prisma, type PrismaClient } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { sessionUser } from './permissions';
import { permissionMode } from './permissionManagement';
import { evaluatePermissions } from './permissionEvaluator';
import { permissionSession } from './sessionPermissions';
import { notifyUser } from './inAppNotify';
import {
  DirectoryInputError, body, has, displayName, optionalText, optionalEmail, expectedVersion, parseSapNumbers, parseAccountManagerIds,
  normalizedDirectoryName, assertSapsAvailable, assignableAccountManagers, legacyDefaultAccountManagerId, companyInclude, companyDto, companyAudit,
} from './accountDirectory';
import { SupplierInputError, findSupplierByNormalizedName, lockSupplierCatalog, selectedCategories, supplierInclude, supplierDto, categorySnapshot } from './supplierCategories';
import {
  ENTITY_TYPES, REQUEST_STATUSES, MAX_SUPPLIER_SAP_NUMBERS, MAX_SUPPLIER_CATEGORIES, MAX_REQUEST_NOTES, REQUEST_RECORD_TYPE, entityLabel, isEntityType,
  readableEntityTypes, canReadMasterDataRequests, canSubmitMasterDataRequest, canApproveMasterDataRequest, canRejectMasterDataRequest,
  type EntityType, type RequestStatus,
} from './masterDataRequestAccess';

export {
  ENTITY_TYPES, REQUEST_STATUSES, MAX_SUPPLIER_SAP_NUMBERS, MAX_SUPPLIER_CATEGORIES, MAX_REQUEST_NOTES, REQUEST_RECORD_TYPE,
  readableEntityTypes, canReadMasterDataRequests, canSubmitMasterDataRequest, canApproveMasterDataRequest, canRejectMasterDataRequest,
  type EntityType, type RequestStatus,
};

export class MasterDataRequestError extends Error {
  constructor(readonly status: number, message: string, readonly field?: string) { super(message); }
}

const sessionInclude = {
  permissions: { select: { screen: true, granted: true } },
  permissionOverrides: { select: { userId: true, permissionKey: true, effect: true } },
  permissionConversion: { select: { catalogVersion: true } },
  driverProfile: { select: { id: true, type: true, isActive: true } },
} satisfies Prisma.UserInclude;
type SessionAccount = Prisma.UserGetPayload<{ include: typeof sessionInclude }>;
type RolePolicyRow = Prisma.RolePolicyGetPayload<{ include: { permissions: true } }>;
type Db = Pick<Prisma.TransactionClient, 'user' | 'rolePolicy'>;

/** The session requireAuth would build for this account in the active mode; null when inactive or unverifiable. */
function accountSession(user: SessionAccount, rolePolicy: RolePolicyRow | null): AuthUser | null {
  if (!user.isActive) return null;
  if (permissionMode() === 'V1') {
    const snapshot = evaluatePermissions({ userId: user.id, role: user.role, isActive: user.isActive,
      authorizationRevision: user.authorizationRevision, driverProfile: user.driverProfile,
      rolePolicy: user.permissionConversion?.catalogVersion === 1 ? rolePolicy : null, overrides: user.permissionOverrides });
    if (!snapshot.valid) return null;
    const session = permissionSession(user, snapshot) as AuthUser;
    Object.defineProperty(session, 'rmaPermissions', { value: snapshot, writable: true, enumerable: false });
    return session;
  }
  const session = sessionUser(user) as AuthUser;
  Object.defineProperty(session, 'rmaPermissions', { value: evaluatePermissions({ userId: user.id, role: user.role, isActive: user.isActive,
    authorizationRevision: user.authorizationRevision, overrides: user.permissionOverrides, driverProfile: user.driverProfile, rolePolicy,
  }), writable: true, enumerable: false });
  return session;
}

/** Re-read the actor inside the write transaction so a deactivation, demotion or revocation mid-flight is honoured. */
export async function loadFreshActorAuth(tx: Db, userId: string): Promise<AuthUser | null> {
  const user = await tx.user.findUnique({ where: { id: userId }, include: sessionInclude });
  if (!user?.isActive) return null;
  const rolePolicy = await tx.rolePolicy.findUnique({ where: { role: user.role }, include: { permissions: true } });
  return accountSession(user, rolePolicy);
}

/** Active Admins who may currently read the review queue. */
async function reviewerIds(tx: Db): Promise<string[]> {
  const admins = await tx.user.findMany({ where: { role: 'ADMIN', isActive: true }, include: sessionInclude, orderBy: { id: 'asc' } });
  if (!admins.length) return [];
  const rolePolicy = await tx.rolePolicy.findUnique({ where: { role: 'ADMIN' }, include: { permissions: true } });
  return admins.filter(admin => { const session = accountSession(admin, rolePolicy); return !!session && canReadMasterDataRequests(session); })
    .map(admin => admin.id);
}

// ── Input parsing ───────────────────────────────────────────────────────────
export interface RequestFields {
  name: string; sapNumbers: string[]; contactPerson: string; contactPhone: string; email: string; address: string; city: string;
  accountManagerIds: string[]; supplierCategoryIds: string[];
}
export interface SubmitInput extends RequestFields { entityType: EntityType; notes: string }
export interface ApproveInput { expectedVersion: number; entityType?: EntityType; overrides: Partial<RequestFields>; reviewNotes: string | null }
export interface RejectInput { expectedVersion: number; rejectionReason: string }

const FIELD_KEYS = ['name', 'sap_number', 'sap_numbers', 'contact_person', 'contact_phone', 'email', 'address', 'city', 'account_manager_ids', 'supplier_category_ids'];
const SUBMIT_KEYS = ['entity_type', ...FIELD_KEYS, 'notes'];
const APPROVE_KEYS = ['expected_version', 'entity_type', ...FIELD_KEYS, 'review_notes'];
const REJECT_KEYS = ['expected_version', 'rejection_reason'];

function parseEntityType(value: unknown): EntityType {
  if (!isEntityType(value)) throw new MasterDataRequestError(400, 'entity_type must be COMPANY or SUPPLIER', 'entity_type');
  return value;
}
function parseCategoryIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_SUPPLIER_CATEGORIES || value.some(id => typeof id !== 'string' || !id || id.length > 200)) {
    throw new MasterDataRequestError(400, `Select at most ${MAX_SUPPLIER_CATEGORIES} categories`, 'supplier_category_ids');
  }
  if (new Set(value).size !== value.length) throw new MasterDataRequestError(400, 'Category selections must be unique', 'supplier_category_ids');
  return value as string[];
}

/** Parse the subset of request fields present in `input`, enforcing entity-specific rules. */
function parseFields(input: Record<string, unknown>, entityType: EntityType, partial: boolean): Partial<RequestFields> {
  const label = entityLabel(entityType);
  const fields: Partial<RequestFields> = {};
  if (!partial || has(input, 'name')) fields.name = displayName(input.name, `${label} name`, 200);
  const saps = parseSapNumbers(input);
  if (saps !== undefined) {
    if (entityType === 'SUPPLIER' && saps.length > MAX_SUPPLIER_SAP_NUMBERS) {
      throw new MasterDataRequestError(400, `At most ${MAX_SUPPLIER_SAP_NUMBERS} SAP / reference numbers may be given for a supplier`, 'sap_numbers');
    }
    fields.sapNumbers = saps;
  } else if (!partial) fields.sapNumbers = [];
  if (!partial || has(input, 'contact_person')) fields.contactPerson = optionalText(input.contact_person, 'Contact person', 200);
  if (!partial || has(input, 'contact_phone')) fields.contactPhone = optionalText(input.contact_phone, 'Contact phone', 50);
  if (!partial || has(input, 'email')) fields.email = optionalEmail(input.email) ?? '';
  if (!partial || has(input, 'address')) fields.address = optionalText(input.address, 'Address', 1000);
  if (!partial || has(input, 'city')) {
    const city = optionalText(input.city, 'City', 250);
    if (city && entityType === 'COMPANY') throw new MasterDataRequestError(400, 'City applies to supplier requests only', 'city');
    fields.city = city;
  }
  if (has(input, 'account_manager_ids')) {
    if (entityType === 'SUPPLIER') throw new MasterDataRequestError(400, 'Account Managers apply to company requests only', 'account_manager_ids');
    fields.accountManagerIds = parseAccountManagerIds(input) ?? [];
  } else if (!partial) fields.accountManagerIds = [];
  if (has(input, 'supplier_category_ids')) {
    if (entityType === 'COMPANY') throw new MasterDataRequestError(400, 'Supplier categories apply to supplier requests only', 'supplier_category_ids');
    fields.supplierCategoryIds = parseCategoryIds(input.supplier_category_ids);
  } else if (!partial) fields.supplierCategoryIds = [];
  return fields;
}

export function parseSubmitInput(raw: unknown): SubmitInput {
  const input = body(raw, SUBMIT_KEYS);
  const entityType = parseEntityType(input.entity_type);
  const fields = parseFields(input, entityType, false) as RequestFields;
  return { entityType, ...fields, notes: optionalText(input.notes, 'Notes', MAX_REQUEST_NOTES) };
}

export function parseApproveInput(raw: unknown): ApproveInput {
  const input = body(raw ?? {}, APPROVE_KEYS);
  const version = expectedVersion(input.expected_version);
  const entityType = has(input, 'entity_type') ? parseEntityType(input.entity_type) : undefined;
  // Entity-specific field rules are applied once the locked request's type is known.
  const reviewNotes = has(input, 'review_notes') ? optionalText(input.review_notes, 'Review notes', MAX_REQUEST_NOTES) || null : null;
  return { expectedVersion: version, entityType, overrides: input as Partial<RequestFields>, reviewNotes };
}

export function parseRejectInput(raw: unknown): RejectInput {
  const input = body(raw ?? {}, REJECT_KEYS);
  const version = expectedVersion(input.expected_version);
  const reason = typeof input.rejection_reason === 'string' ? input.rejection_reason.trim() : '';
  if (reason.length < 3 || reason.length > MAX_REQUEST_NOTES) {
    throw new MasterDataRequestError(400, `A rejection reason of 3 to ${MAX_REQUEST_NOTES} characters is required`, 'rejection_reason');
  }
  return { expectedVersion: version, rejectionReason: reason };
}

// ── Serialization ───────────────────────────────────────────────────────────
export const requestInclude = {
  requestedBy: { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
} satisfies Prisma.MasterDataAdditionRequestInclude;
export type RequestRow = Prisma.MasterDataAdditionRequestGetPayload<{ include: typeof requestInclude }>;
type Choice = { id: string; name: string; isActive: boolean };
export interface RequestLabels { accountManagers: Map<string, Choice>; categories: Map<string, Choice> }

export async function requestLabels(db: Pick<Prisma.TransactionClient, 'accountManager' | 'supplierCategory'>,
  rows: ReadonlyArray<Pick<RequestRow, 'accountManagerIds' | 'supplierCategoryIds'>>): Promise<RequestLabels> {
  const amIds = [...new Set(rows.flatMap(row => row.accountManagerIds))];
  const categoryIds = [...new Set(rows.flatMap(row => row.supplierCategoryIds))];
  const [ams, categories] = await Promise.all([
    amIds.length ? db.accountManager.findMany({ where: { id: { in: amIds } }, select: { id: true, name: true, isActive: true } }) : [],
    categoryIds.length ? db.supplierCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true, isActive: true } }) : [],
  ]);
  return { accountManagers: new Map(ams.map(row => [row.id, row])), categories: new Map(categories.map(row => [row.id, row])) };
}
const choices = (ids: readonly string[], lookup: Map<string, Choice>, fallback: string) =>
  ids.map(id => ({ id, name: lookup.get(id)?.name ?? fallback, is_active: lookup.get(id)?.isActive ?? false }));

export function requestDto(row: RequestRow, labels: RequestLabels) {
  return {
    id: row.id, entity_type: row.entityType as EntityType, status: row.status as RequestStatus, name: row.name,
    sap_numbers: [...row.sapNumbers], contact_person: row.contactPerson, contact_phone: row.contactPhone, email: row.email,
    address: row.address, city: row.city,
    account_managers: choices(row.accountManagerIds, labels.accountManagers, 'Unknown Account Manager'),
    supplier_categories: choices(row.supplierCategoryIds, labels.categories, 'Unknown category'),
    notes: row.notes, version: row.version,
    requested_by: { id: row.requestedBy.id, name: row.requestedBy.name },
    reviewed_by: row.reviewedBy ? { id: row.reviewedBy.id, name: row.reviewedBy.name } : null,
    reviewed_at: row.reviewedAt, rejection_reason: row.rejectionReason, review_notes: row.reviewNotes,
    created_company_id: row.createdCompanyId, created_supplier_id: row.createdSupplierId, created_entity_name: row.createdEntityName,
    created_at: row.createdAt, updated_at: row.updatedAt,
  };
}
export type MasterDataRequestDto = ReturnType<typeof requestDto>;

/** Business audit snapshot: request content and outcome only; no requester/reviewer identifiers. */
export function requestAudit(row: RequestRow, labels: RequestLabels) {
  const dto = requestDto(row, labels);
  return {
    entity_type: dto.entity_type, status: dto.status, name: dto.name, sap_numbers: dto.sap_numbers, contact_person: dto.contact_person,
    contact_phone: dto.contact_phone, email: dto.email, address: dto.address, city: dto.city,
    account_managers: dto.account_managers.map(({ id, name }) => ({ id, name })),
    supplier_categories: dto.supplier_categories.map(({ id, name }) => ({ id, name })),
    notes: dto.notes, rejection_reason: dto.rejection_reason ?? '', review_notes: dto.review_notes ?? '',
    created_entity_name: dto.created_entity_name ?? '', version: dto.version,
  };
}

// ── Reads ───────────────────────────────────────────────────────────────────
export function parseListQuery(query: Record<string, unknown>) {
  // Repeated query params arrive as arrays: reject them rather than silently listing unfiltered.
  if (query.status !== undefined && typeof query.status !== 'string') {
    throw new MasterDataRequestError(400, 'status must be PENDING, APPROVED, REJECTED or ALL');
  }
  const status = typeof query.status === 'string' && query.status.trim() ? query.status.trim().toUpperCase() : undefined;
  if (status !== undefined && status !== 'ALL' && !(REQUEST_STATUSES as readonly string[]).includes(status)) {
    throw new MasterDataRequestError(400, 'status must be PENDING, APPROVED, REJECTED or ALL');
  }
  if (query.entity_type !== undefined && typeof query.entity_type !== 'string') {
    throw new MasterDataRequestError(400, 'entity_type must be COMPANY, SUPPLIER or ALL');
  }
  const entity = typeof query.entity_type === 'string' && query.entity_type.trim() ? query.entity_type.trim().toUpperCase() : undefined;
  if (entity !== undefined && entity !== 'ALL' && !isEntityType(entity)) throw new MasterDataRequestError(400, 'entity_type must be COMPANY, SUPPLIER or ALL');
  if (query.search !== undefined && typeof query.search !== 'string') throw new MasterDataRequestError(400, 'search must be text');
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search.length > MAX_SEARCH_LENGTH) throw new MasterDataRequestError(400, `search must be at most ${MAX_SEARCH_LENGTH} characters`);
  const page = positiveInteger(query.page, 'page', 1);
  const limit = positiveInteger(query.limit, 'limit', DEFAULT_LIST_LIMIT);
  if (limit > MAX_LIST_LIMIT) throw new MasterDataRequestError(400, `limit must be between 1 and ${MAX_LIST_LIMIT}`);
  // OFFSET is a 32-bit integer in PostgreSQL (same bound as the admin audit log).
  if ((page - 1) * limit > 2147483647) throw new MasterDataRequestError(400, 'page is out of range');
  return {
    status: status && status !== 'ALL' ? status as RequestStatus : undefined,
    entityType: entity && entity !== 'ALL' ? entity as EntityType : undefined,
    search, page, limit,
  };
}
export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;
export const MAX_SEARCH_LENGTH = 200;
function positiveInteger(value: unknown, label: string, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new MasterDataRequestError(400, label === 'limit' ? `limit must be between 1 and ${MAX_LIST_LIMIT}` : `${label} must be a positive integer`);
  return parsed;
}
const escapeLike = (value: string) => value.replace(/[\\%_]/g, match => `\\${match}`);

/** Name, contact, notes, outcome, requester and SAP numbers (exact or substring), case-insensitive. */
async function searchWhere(db: PrismaClient, search: string): Promise<Prisma.MasterDataAdditionRequestWhereInput | null> {
  if (!search) return null;
  const text = { contains: search, mode: 'insensitive' as const };
  let sapIds: string[] = [];
  try {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "MasterDataAdditionRequest"
       WHERE EXISTS (SELECT 1 FROM unnest("sapNumbers") AS s WHERE s ILIKE ${`%${escapeLike(search)}%`} ESCAPE '\\')`;
    sapIds = Array.isArray(rows) ? rows.map(row => row.id).filter(id => typeof id === 'string') : [];
  } catch { sapIds = []; } // Exact SAP matches below still apply.
  return { OR: [
    { name: text }, { notes: text }, { contactPerson: text }, { contactPhone: text }, { email: text }, { address: text }, { city: text },
    { createdEntityName: text }, { rejectionReason: text }, { requestedBy: { name: text } }, { sapNumbers: { has: search } },
    ...(sapIds.length ? [{ id: { in: sapIds } }] : []),
  ] };
}

/** TASS: strictly own requests (any requester filter is ignored). ADMIN: the full review queue. */
function scopeWhere(user: AuthUser): Prisma.MasterDataAdditionRequestWhereInput {
  const types = readableEntityTypes(user);
  if (!types.length) throw new MasterDataRequestError(403, 'Addition requests are not available for this account.');
  return { entityType: { in: types }, ...(user.role === 'ADMIN' ? {} : { requestedById: user.id }) };
}

/** One page of requests plus exact per-status counts for the same scope, type and search, so
 * status tabs and the pending badge always agree however many requests exist. */
export async function listMasterDataRequests(db: PrismaClient, user: AuthUser, query: Record<string, unknown> = {}) {
  const scope = scopeWhere(user);
  const filters = parseListQuery(query);
  const search = await searchWhere(db, filters.search);
  const baseWhere: Prisma.MasterDataAdditionRequestWhereInput = { AND: [scope,
    ...(filters.entityType ? [{ entityType: filters.entityType }] : []), ...(search ? [search] : [])] };
  const pageWhere: Prisma.MasterDataAdditionRequestWhereInput = { AND: [baseWhere, ...(filters.status ? [{ status: filters.status }] : [])] };
  const [rows, grouped] = await Promise.all([
    db.masterDataAdditionRequest.findMany({ where: pageWhere, include: requestInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (filters.page - 1) * filters.limit, take: filters.limit }),
    db.masterDataAdditionRequest.groupBy({ by: ['status'], where: baseWhere, _count: { _all: true } }),
  ]);
  const count = (status: RequestStatus) => grouped.find(group => group.status === status)?._count._all ?? 0;
  const counts = { pending: count('PENDING'), approved: count('APPROVED'), rejected: count('REJECTED') };
  const total = filters.status ? count(filters.status) : counts.pending + counts.approved + counts.rejected;
  const labels = await requestLabels(db, rows);
  return {
    requests: rows.map(row => requestDto(row, labels)), counts, total, page: filters.page, limit: filters.limit,
    pages: Math.max(1, Math.ceil(total / filters.limit)),
    // The server's own decision, so a LEGACY client never offers a submit it would refuse.
    capabilities: { can_submit_company: canSubmitMasterDataRequest(user, 'COMPANY'), can_submit_supplier: canSubmitMasterDataRequest(user, 'SUPPLIER') },
  };
}

export async function getMasterDataRequest(db: PrismaClient, user: AuthUser, id: string) {
  const scope = scopeWhere(user);
  // Another requester's id is indistinguishable from a missing one.
  const row = await db.masterDataAdditionRequest.findFirst({ where: { AND: [scope, { id }] }, include: requestInclude });
  if (!row) throw new MasterDataRequestError(404, 'Addition request not found');
  return requestDto(row, await requestLabels(db, [row]));
}

// ── Writes ──────────────────────────────────────────────────────────────────
type Tx = Prisma.TransactionClient;
/** Shared lock pairing with permissionManagement.ts's exclusive (243, 1) lock, taken FIRST in every
 * request write: request writes never block one another, a concurrent account/policy revocation
 * either commits before the fresh authorization read or waits for the write to commit, and the
 * order (243, 1) -> request row -> directory lock is acyclic, so it cannot deadlock. */
async function lockAuthorizationRead(tx: Tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(243, 1)`;
}
async function lockDirectory(tx: Tx, entityType: EntityType) {
  // Same advisory locks as companies.ts / suppliers.ts, so request approvals and direct creation serialize.
  if (entityType === 'COMPANY') await tx.$executeRaw`SELECT pg_advisory_xact_lock(731110, 1)`;
  else await lockSupplierCatalog(tx);
}

async function assertCompanyNameFree(tx: Tx, normalizedName: string) {
  const clash = await tx.company.findUnique({ where: { normalizedName }, select: { name: true } });
  if (clash) throw new MasterDataRequestError(409, `A company named "${clash.name}" already exists in the directory.`, 'name');
}
async function assertSupplierNameFree(tx: Tx, name: string) {
  const clash = await findSupplierByNormalizedName(tx, name);
  if (clash) throw new MasterDataRequestError(409, `A supplier named "${clash.name}" already exists in the directory.`, 'name');
}
async function sapKeys(tx: Tx, sapNumbers: readonly string[]) {
  try { return await assertSapsAvailable(tx, sapNumbers); }
  catch (error) {
    if (error instanceof DirectoryInputError) throw new MasterDataRequestError(error.status, error.message, 'sap_numbers');
    throw error;
  }
}
async function activeManagers(tx: Tx, ids: readonly string[]) {
  try { return await assignableAccountManagers(tx, ids); }
  catch (error) {
    if (error instanceof DirectoryInputError) throw new MasterDataRequestError(error.status, error.message, 'account_manager_ids');
    throw error;
  }
}
async function activeCategories(tx: Tx, ids: string[]) {
  if (!ids.length) return [];
  try { return await selectedCategories(tx, ids); }
  catch (error) {
    if (error instanceof SupplierInputError) throw new MasterDataRequestError(error.status, error.message, 'supplier_category_ids');
    throw error;
  }
}

async function writeRequestAudit(tx: Tx, actorId: string, action: 'CREATE' | 'UPDATE', next: RequestRow, previous?: RequestRow) {
  const labels = await requestLabels(tx, previous ? [previous, next] : [next]);
  await tx.auditLog.create({ data: { recordId: next.id, recordType: REQUEST_RECORD_TYPE, action, changedById: actorId,
    previousValue: previous ? JSON.stringify(requestAudit(previous, labels)) : null, newValue: JSON.stringify(requestAudit(next, labels)) } });
  return labels;
}

export async function submitMasterDataRequest(db: PrismaClient, actorId: string, input: SubmitInput) {
  return db.$transaction(async tx => {
    await lockAuthorizationRead(tx);
    await lockDirectory(tx, input.entityType);
    const actor = await loadFreshActorAuth(tx, actorId);
    if (!actor || !canSubmitMasterDataRequest(actor, input.entityType)) {
      throw new MasterDataRequestError(403, 'Submitting addition requests is not permitted for this account.');
    }
    const normalizedName = await normalizedDirectoryName(tx, input.name);
    if (input.entityType === 'COMPANY') {
      await assertCompanyNameFree(tx, normalizedName);
      await sapKeys(tx, input.sapNumbers);
      await activeManagers(tx, input.accountManagerIds);
    } else {
      await assertSupplierNameFree(tx, input.name);
      await activeCategories(tx, input.supplierCategoryIds);
    }
    const pending = await tx.masterDataAdditionRequest.findFirst({ where: { entityType: input.entityType, normalizedName, status: 'PENDING' }, select: { id: true } });
    if (pending) throw new MasterDataRequestError(409, `A pending addition request for "${input.name}" already exists.`, 'name');
    const created = await tx.masterDataAdditionRequest.create({ data: {
      entityType: input.entityType, status: 'PENDING', name: input.name, normalizedName, sapNumbers: input.sapNumbers,
      contactPerson: input.contactPerson, contactPhone: input.contactPhone, email: input.email, address: input.address, city: input.city,
      accountManagerIds: input.accountManagerIds, supplierCategoryIds: input.supplierCategoryIds, notes: input.notes, requestedById: actor.id,
    }, include: requestInclude });
    const label = entityLabel(input.entityType);
    const reviewers = await reviewerIds(tx);
    if (reviewers.length) await tx.notification.createMany({ data: reviewers.map(userId => ({ userId,
      title: `New ${label} addition request`, message: `${actor.name} requested to add ${label.toLowerCase()} "${created.name}".`,
      recordId: created.id, recordType: REQUEST_RECORD_TYPE })) });
    const labels = await writeRequestAudit(tx, actor.id, 'CREATE', created);
    return requestDto(created, labels);
  });
}

async function lockRequest(tx: Tx, id: string) {
  const [locked] = await tx.$queryRaw<Array<{ id: string; entityType: string; status: string; version: number }>>`
    SELECT "id", "entityType", "status", "version" FROM "MasterDataAdditionRequest" WHERE "id" = ${id} FOR UPDATE`;
  if (!locked) throw new MasterDataRequestError(404, 'Addition request not found');
  return locked;
}
function assertReviewable(row: { status: string; version: number }, expected: number) {
  if (row.status !== 'PENDING') throw new MasterDataRequestError(409, `This request has already been ${row.status.toLowerCase()}.`);
  if (row.version !== expected) throw new MasterDataRequestError(409, 'This request was updated in another session. Refresh and try again.');
}

/** Contact person for the created Company: the submitted phone is folded in unless the Admin set it explicitly. */
export function companyContactPerson(contactPerson: string, contactPhone: string, explicit: boolean) {
  if (explicit) return contactPerson;
  const combined = contactPerson && contactPhone && !contactPerson.includes(contactPhone) ? `${contactPerson} (${contactPhone})` : contactPerson || contactPhone;
  return combined.slice(0, 200);
}

export async function approveMasterDataRequest(db: PrismaClient, actorId: string, id: string, input: ApproveInput) {
  return db.$transaction(async tx => {
    await lockAuthorizationRead(tx);
    const locked = await lockRequest(tx, id);
    const entityType = locked.entityType as EntityType;
    if (input.entityType && input.entityType !== entityType) throw new MasterDataRequestError(400, 'entity_type does not match this request', 'entity_type');
    await lockDirectory(tx, entityType);
    const actor = await loadFreshActorAuth(tx, actorId);
    if (!actor || !canApproveMasterDataRequest(actor, entityType)) {
      throw new MasterDataRequestError(403, `Approving ${entityLabel(entityType).toLowerCase()} addition requests is not permitted for this account.`);
    }
    const before = await tx.masterDataAdditionRequest.findUniqueOrThrow({ where: { id }, include: requestInclude });
    assertReviewable(before, input.expectedVersion);
    const overrides = parseFields(input.overrides as Record<string, unknown>, entityType, true);
    const final: RequestFields = {
      name: overrides.name ?? before.name, sapNumbers: overrides.sapNumbers ?? before.sapNumbers,
      contactPerson: overrides.contactPerson ?? before.contactPerson, contactPhone: overrides.contactPhone ?? before.contactPhone,
      email: overrides.email ?? before.email, address: overrides.address ?? before.address, city: overrides.city ?? before.city,
      accountManagerIds: overrides.accountManagerIds ?? before.accountManagerIds, supplierCategoryIds: overrides.supplierCategoryIds ?? before.supplierCategoryIds,
    };
    if (entityType === 'SUPPLIER' && final.sapNumbers.length > MAX_SUPPLIER_SAP_NUMBERS) {
      throw new MasterDataRequestError(400, `At most ${MAX_SUPPLIER_SAP_NUMBERS} SAP / reference numbers may be given for a supplier`, 'sap_numbers');
    }
    const normalizedName = await normalizedDirectoryName(tx, final.name);
    let createdCompany: Prisma.CompanyGetPayload<{ include: typeof companyInclude }> | null = null;
    let createdSupplier: Prisma.SupplierGetPayload<{ include: typeof supplierInclude }> | null = null;
    if (entityType === 'COMPANY') {
      await assertCompanyNameFree(tx, normalizedName);
      const keys = await sapKeys(tx, final.sapNumbers);
      const managers = await activeManagers(tx, final.accountManagerIds);
      createdCompany = await tx.company.create({ data: {
        name: final.name, normalizedName, sapNumber: final.sapNumbers[0] ?? '', address: final.address,
        contactPerson: companyContactPerson(final.contactPerson, final.contactPhone, overrides.contactPerson !== undefined),
        defaultAccountManagerId: legacyDefaultAccountManagerId(managers),
        sapNumbers: { create: final.sapNumbers.map((sapNumber, position) => ({ sapNumber, normalizedNumber: keys[position], position })) },
        accountManagers: { create: managers.map(am => ({ accountManagerId: am.id })) },
      }, include: companyInclude });
      await tx.auditLog.create({ data: { recordId: createdCompany.id, recordType: 'Company', action: 'CREATE', changedById: actor.id,
        previousValue: null, newValue: JSON.stringify(companyAudit(createdCompany)) } });
    } else {
      await assertSupplierNameFree(tx, final.name);
      const categories = await activeCategories(tx, final.supplierCategoryIds);
      createdSupplier = await tx.supplier.create({ data: {
        name: final.name, contactPerson: final.contactPerson, email: final.email, phone: final.contactPhone, address: final.address, city: final.city,
        category: categories.map(category => category.name).join('; '),
        ...(categories.length ? { categories: { create: categories.map(category => ({ categoryId: category.id })) } } : {}),
        createdById: actor.id, modifiedById: actor.id,
      }, include: supplierInclude });
      const dto = supplierDto(createdSupplier);
      await tx.auditLog.create({ data: { recordId: createdSupplier.id, recordType: 'Supplier', action: 'CREATE', changedById: actor.id,
        previousValue: null, newValue: JSON.stringify({ name: dto.name, contact_person: dto.contact_person, email: dto.email,
          phone: dto.phone, address: dto.address, city: dto.city, category: dto.category, categories: categorySnapshot(categories) }) } });
    }
    const createdName = (createdCompany ?? createdSupplier)!.name;
    // Persist the approved values so the request shows exactly what was created.
    const updated = await tx.masterDataAdditionRequest.update({ where: { id }, data: {
      status: 'APPROVED', reviewedById: actor.id, reviewedAt: new Date(), reviewNotes: input.reviewNotes,
      name: final.name, normalizedName, sapNumbers: final.sapNumbers, contactPerson: final.contactPerson, contactPhone: final.contactPhone,
      email: final.email, address: final.address, city: final.city, accountManagerIds: final.accountManagerIds, supplierCategoryIds: final.supplierCategoryIds,
      createdCompanyId: createdCompany?.id ?? null, createdSupplierId: createdSupplier?.id ?? null, createdEntityName: createdName,
      version: { increment: 1 },
    }, include: requestInclude });
    const label = entityLabel(entityType);
    await notifyUser(before.requestedById, `${label} addition request approved`,
      `Your request to add ${label.toLowerCase()} "${createdName}" was approved by ${actor.name} and added to the directory.`,
      updated.id, REQUEST_RECORD_TYPE, tx);
    const labels = await writeRequestAudit(tx, actor.id, 'UPDATE', updated, before);
    return {
      request: requestDto(updated, labels),
      ...(createdCompany ? { created_company: companyDto(createdCompany) } : {}),
      ...(createdSupplier ? { created_supplier: supplierDto(createdSupplier) } : {}),
    };
  });
}

export async function rejectMasterDataRequest(db: PrismaClient, actorId: string, id: string, input: RejectInput) {
  return db.$transaction(async tx => {
    await lockAuthorizationRead(tx);
    const locked = await lockRequest(tx, id);
    const actor = await loadFreshActorAuth(tx, actorId);
    if (!actor || !canRejectMasterDataRequest(actor)) throw new MasterDataRequestError(403, 'Rejecting addition requests is not permitted for this account.');
    assertReviewable(locked, input.expectedVersion);
    const before = await tx.masterDataAdditionRequest.findUniqueOrThrow({ where: { id }, include: requestInclude });
    const updated = await tx.masterDataAdditionRequest.update({ where: { id }, data: {
      status: 'REJECTED', reviewedById: actor.id, reviewedAt: new Date(), rejectionReason: input.rejectionReason, version: { increment: 1 },
    }, include: requestInclude });
    const label = entityLabel(before.entityType as EntityType);
    await notifyUser(before.requestedById, `${label} addition request rejected`,
      `Your request to add ${label.toLowerCase()} "${before.name}" was rejected by ${actor.name}: ${input.rejectionReason}`,
      updated.id, REQUEST_RECORD_TYPE, tx);
    const labels = await writeRequestAudit(tx, actor.id, 'UPDATE', updated, before);
    return { request: requestDto(updated, labels) };
  });
}

/** Translate known failures to deterministic HTTP responses; anything else is rethrown. */
type ErrorBody = { error: string; field?: string; fields?: Record<string, string> };
const withField = (error: string, field?: string): ErrorBody => field ? { error, field, fields: { [field]: error } } : { error };
export function requestErrorResponse(error: unknown): { status: number; body: ErrorBody } | null {
  if (error instanceof MasterDataRequestError) return { status: error.status, body: withField(error.message, error.field) };
  if (error instanceof DirectoryInputError) return { status: error.status, body: { error: error.message } };
  if (error instanceof SupplierInputError) return { status: error.status, body: { error: error.message } };
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = JSON.stringify(error.meta ?? {});
    if (target.includes('normalizedNumber') || target.includes('CompanySapNumber')) return { status: 409, body: withField('Another company already uses this SAP number', 'sap_numbers') };
    if (target.includes('MasterDataAdditionRequest') || target.includes('entityType')) return { status: 409, body: withField('A pending addition request for this name already exists.', 'name') };
    return { status: 409, body: withField('A directory entry with this name already exists, including inactive ones.', 'name') };
  }
  return null;
}
