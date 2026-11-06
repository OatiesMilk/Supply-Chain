import type { PermissionAction, PermissionSession } from '../types/permissions';
import { permissionCategory, permissionSessionKey, permissionsFor } from '../utils/permissions';

type Context = { user: PermissionSession | null; screen?: string; epoch?: number };
let context: () => Context = () => ({ user: null });
const records = new Map<string, string>();
const drafts = new Set<string>();
let recordSession = '';
export function installPermissionContext(provider: () => Context) { context = provider; }
export function permissionRequestVersion(): string { const { user, epoch } = context(); return user ? JSON.stringify([epoch ?? 0, permissionSessionKey(user)]) : ''; }
export function assertPermissionRequestVersion(expected: string) { if (expected !== permissionRequestVersion()) throw new ClientPermissionError(); }
export function permissionStagingKey(recordId: string): string { return `session:${permissionRequestVersion()}:${recordId}`; }
function current() {
  const value = context();
  const key = permissionRequestVersion();
  if (key !== recordSession) { records.clear(); drafts.clear(); recordSession = key; }
  return { ...value, permissions: permissionsFor(value.user) };
}
export class ClientPermissionError extends Error {
  readonly status = 403;
  constructor() { super('This action is not available for your account. Refresh your permissions or contact your administrator.'); }
}
export function rememberPermissionRecord(value: unknown): void {
  current();
  if (Array.isArray(value)) { value.forEach(rememberPermissionRecord); return; }
  if (!value || typeof value !== 'object') return;
  const row = value as Record<string, unknown>;
  if (typeof row.id === 'string' && typeof row.category === 'string' && permissionCategory(row.category)) {
    records.set(row.id, row.category);
    if (row.is_draft === 'Yes' || row.status === 'Draft') drafts.add(row.id); else drafts.delete(row.id);
  }
  if (Array.isArray(row.rows)) row.rows.forEach(rememberPermissionRecord);
}
export function canCurrentRecord(id: string, action: PermissionAction = 'READ'): boolean {
  const { user, screen, permissions } = current();
  if (!user) return false;
  if (!permissions.v1) return permissions.valid;
  const category = records.get(id);
  return !!category && permissions.canRecord(category, action, screen);
}
export function assertCurrentRecord(id: string, action: PermissionAction = 'READ') {
  if (!canCurrentRecord(id, action)) throw new ClientPermissionError();
}

/** Defense in depth for stale/direct client handlers. Server checks remain mandatory (#247). */
export function assertPermissionRequest(path: string, options: RequestInit = {}): void {
  if (path.startsWith('/auth/')) return;
  const { user, screen, permissions: p } = current();
  if (!p.valid || !user) throw new ClientPermissionError();
  // The existing backend still emits legacy sessions until coordinated activation.
  // Their existing role/action guards remain in place; never invent role defaults here.
  if (!p.v1) return;
  const url = new URL(path, 'https://permission.local');
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const [root, id, operation] = parts;
  const write = !['GET', 'HEAD'].includes(options.method?.toUpperCase() ?? 'GET');
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : {};
  const require = (allowed: boolean) => { if (!allowed) throw new ClientPermissionError(); };
  // Personal read-state is self-scoped by the server, independent of module Write.
  if (root === 'notifications' && ((!write && (!id || id === 'unread-count'))
    || options.method === 'PATCH' && (id === 'read-all' && !operation || !!id && operation === 'read'))) return;
  if (root === 'records' || root === 'notifications' && id === 'send-email') {
    require(p.canResource('records'));
    const recordId = root === 'notifications' ? body.recordId : id;
    const category = permissionCategory(body.category ?? url.searchParams.get('category') ?? records.get(recordId) ?? '');
    if (write) {
      require(!!category && p.canRecord(category!, 'WRITE', screen));
      const source = records.get(recordId);
      if (id && root === 'records') require(!!source && p.canRecord(source, 'WRITE', screen));
      if (source && body.category !== undefined && permissionCategory(source) !== category) {
        require(p.canRecord(source, 'UPDATE', screen) && p.canRecord(category!, 'CREATE', screen));
      }
      const actions: PermissionAction[] = [];
      if (root === 'notifications') { require(['ADMIN', 'SALES_COORDINATOR', 'LOGISTICS', 'TASS'].includes(user.role)); }
      else if (!id) actions.push('CREATE', ...(body.is_draft !== 'Yes' ? ['SUBMIT' as const] : []));
      else if (operation === 'comments') actions.push('COMMENT');
      else if (operation === 'attachments') actions.push('POD');
      else if (operation === 'time-in') actions.push('TIME_IN');
      else if (operation === 'verify-collection') { require(user.role === 'TASS'); actions.push('VERIFY_COLLECTION'); }
      else if (operation === 'rma-assignment') actions.push('ASSIGN');
      else if (operation === 'rma-transport') actions.push('STATUS');
      else if (operation === 'rma-receipt') actions.push('RECEIVE');
      else if (operation === 'status') actions.push('STATUS', ...(body.status === 'Delivered' ? ['COMPLETE' as const] : []), ...(body.status === 'Draft' || body.status === 'Scheduled' && drafts.has(recordId) ? ['SUBMIT' as const] : []), ...(body.priority !== undefined || body.delivery_date !== undefined ? ['UPDATE' as const] : []));
      else if (options.method === 'DELETE') actions.push('DELETE');
      else {
        const keys = Object.keys(body).filter(key => !['remarks', 'expected_version', 'expected_edit_version'].includes(key));
        if (keys.some(key => ['driver', 'driver_id', 'driver_assistants', 'vehicle'].includes(key))) actions.push('ASSIGN');
        if (keys.includes('status')) actions.push('STATUS', ...(body.status === 'Delivered' ? ['COMPLETE' as const] : []), ...(body.status === 'Draft' || body.status === 'Scheduled' && drafts.has(recordId) ? ['SUBMIT' as const] : []));
        if (keys.includes('is_draft')) actions.push('SUBMIT');
        if (keys.includes('time_in')) actions.push('TIME_IN');
        if (keys.includes('time_out') || keys.includes('received_by')) actions.push('COMPLETE');
        if (keys.some(key => !['driver', 'driver_id', 'driver_assistants', 'vehicle', 'status', 'is_draft'].includes(key))) actions.push('UPDATE');
        if (actions.length === 0) actions.push('UPDATE');
      }
      actions.forEach(action => require(p.canRecord(category!, action, screen) && (!source || p.canRecord(source, action, screen))));
    } else {
      require(category ? p.canRecord(category, 'READ', screen) : user.snapshot!.readableCategories.length > 0);
      if (screen) require(p.canAccess(screen));
    }
    return;
  }
  const resource = ({ 'data-sampler': 'dataSampler', dev: 'dataSampler', reports: 'records' } as Record<string, string>)[root] ?? root;
  require(p.canResource(resource));
  if (root === 'reports' || root === 'transactions') {
    require(p.canAccess(root === 'reports' ? 'statistical_reports' : user.role === 'DRIVER' ? 'driver_dashboard' : 'transactions'));
    const category = url.searchParams.get('category');
    if (category) require(p.canCategory(category));
    if (write) throw new ClientPermissionError();
    return;
  }
  if (!write) return;
  const managementScreen = ({ customers: 'customers', suppliers: 'suppliers', drivers: 'driver_manager', skus: 'inventory', users: 'admin', admin: 'admin', dataSampler: 'data_sampler' } as Record<string, string>)[resource];
  if (managementScreen) require(p.canWrite(managementScreen));
  if (root === 'suppliers' && (id === 'categories' || operation === 'categories')) {
    require(user.role === 'ADMIN' && p.canResource('suppliers', 'WRITE'));
    return;
  }
  const action: PermissionAction = operation === 'adjust' ? 'ADJUST' : options.method === 'DELETE' ? 'DELETE' : !id && options.method === 'POST' ? 'CREATE' : ['admin', 'dataSampler'].includes(resource) ? 'WRITE' : 'UPDATE';
  require(p.canResource(resource, action));
}

/** Reject record data for revoked categories even if an outdated endpoint returns it. */
export function checkPermissionResponse<T>(path: string, data: T): T {
  const { permissions: p } = current();
  if (!p.v1 || !path.startsWith('/records')) {
    if (path.startsWith('/records')) rememberPermissionRecord(data);
    return data;
  }
  if (path.startsWith('/records/active-counts') && data && typeof data === 'object') {
    const result = { ...data } as Record<string, unknown>;
    const categories = { deliveries: 'DELIVERY', rma: 'RMA', accounting_collection: 'ACCOUNTING_COLLECTION', procurement_pickup: 'PROCUREMENT_PICKUP', sales_orders: 'SALES_ORDERS' };
    for (const [key, category] of Object.entries(categories)) if (!p.canCategory(category)) result[key] = 0;
    return result as T;
  }
  const allowed = (row: any) => !row || typeof row.category !== 'string' || p.canCategory(row.category);
  if (Array.isArray(data)) {
    const rows = data.filter(allowed) as T;
    rememberPermissionRecord(rows); return rows;
  }
  if (data && typeof data === 'object') {
    if (!allowed(data)) throw new ClientPermissionError();
    const result = data as any;
    if (Array.isArray(result.rows) && result.rows.some((row: any) => !allowed(row))) throw new ClientPermissionError();
  }
  rememberPermissionRecord(data); return data;
}
