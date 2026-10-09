/**
 * Thin fetch wrapper for the real Express + Prisma backend (server/). All
 * requests go through the Vite dev proxy at /api/* (see vite.config.ts), so
 * they're same-origin and the httpOnly session cookie set by the backend is
 * sent automatically via `credentials: 'include'`.
 */

import { requestServerCheck } from './availability';

export const API_BASE = '';

export function apiUrl(path: string): string {
  return `${API_BASE}/api${path}`;
}

export class ApiError extends Error {
  status: number;
  /** Per-field validation messages from the server, keyed by API field name. */
  fields: Record<string, string>;
  constructor(message: string, status: number, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      credentials: 'include',
      headers: options.body instanceof FormData
        ? { ...(options.headers || {}) }
        : { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) requestServerCheck();
    throw error;
  }

  if ((res.status === 401 || res.status === 403) && !path.startsWith('/auth/') && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('session-permissions-changed'));
  }

  if (res.status >= 500) requestServerCheck();

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let fields: Record<string, string> = {};
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      if (body?.fields && typeof body.fields === 'object') fields = body.fields;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new ApiError(message, res.status, fields);
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

/** Optional server-side filters for GET /records; the server always applies the user's record scope. */
export interface RecordListFilters {
  company_id?: string;
  category?: string;
  limit?: number;
  cursor?: string;
}

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: 'SALES_COORDINATOR' | 'LOGISTICS' | 'TASS' | 'ADMIN' | 'DRIVER';
  permissions: { screen: string; granted: boolean }[];
  effectiveScreens: string[];
  resources: string[];
  permissionVersion: string;
}

export interface ApiPermissionEditor {
  userId: string;
  permissions: { screen: string; granted: boolean }[];
  effectiveScreens: string[];
  resources: string[];
  permissionVersion: string;
  roleDefaults: string[];
  catalog: { screen: string; label: string }[];
  editableScreens: string[];
}

// Extended user record returned by the admin user-management endpoint
export interface ApiUserAdmin {
  id: string;
  name: string;
  email: string;
  role: 'SALES_COORDINATOR' | 'LOGISTICS' | 'TASS' | 'ADMIN' | 'DRIVER';
  is_active: boolean;
  microsoft_linked: boolean;
  created_at: string;
  driver_profile?: { id: string; name: string } | null; // DRIVER logins: the linked Driver profile
}

export interface ApiIntegrationStatus {
  azure_sso: { configured: boolean; tenant: string | null; redirect_uri: string | null };
  email: { method: 'graph' | 'smtp' | 'mock'; smtp_host: string | null; from: string | null };
  users: { total: number; active: number; microsoft_linked: number };
  app_url: string;
  node_env: string;
}

export interface ApiTestEmailResult {
  ok: boolean;
  method: 'graph' | 'smtp' | 'mock';
  error: string | null;
}

export interface ApiCompany {
  id: string;
  name: string;
  sap_number: string;
  address: string;
  contact_person: string;
  created_at: string;
}

export interface ApiCustomer {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  created_by: string;
  created_at: string;
  modified_by: string;
  modified_at: string;
}

export type CustomerEditableField = 'name' | 'contact_person' | 'email' | 'phone' | 'city' | 'address';

export type CustomerUpdateInput = Partial<Record<CustomerEditableField, string>> & {
  remarks: string;
  /** The modified_at value the edit was based on; the server rejects stale edits with 409. */
  expected_modified_at: string;
};

export interface ApiCustomerAuditEntry {
  id: string;
  action: string;
  changed_by: string;
  timestamp: string;
  remarks: string;
  changes: Array<{ field: string; label: string; from: string; to: string }>;
}

export interface ApiSupplier {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  category: string;
  created_by: string;
  created_at: string;
  modified_by: string;
  modified_at: string;
}

export interface ApiDriver {
  id: string;
  name: string;
  type: 'DRIVER' | 'ASSISTANT';
  coverage_areas: string[];
  is_active: boolean;
  is_linked?: boolean; // has a DRIVER login (linked by Admin)
  linked_user?: { id: string; name: string; email: string } | null; // Admin responses only
  created_by: string;
  created_at: string;
  modified_by: string;
  modified_at: string;
}

export type ApiDashboardStats =
  | {
      role: 'SALES_COORDINATOR';
      deliveries_scheduled_today: number;
      pending_driver_assignment: number;
      on_hold: number;
      rescheduled: number;
      accomplished_today: number;
    }
  | {
      role: 'LOGISTICS';
      assigned_today: number;
      unassigned_count: number;
      completed_today: number;
      on_hold_rescheduled: number;
    }
  | {
      role: 'TASS';
      open_rma: number;
      rma_on_hold: number;
      pending_procurement_pickup: number;
      pending_verification: number;
      verified_today: number;
    }
  | {
      role: 'ADMIN';
      total_active_users: number;
      user_breakdown: Record<string, number>;
      records_this_week: number;
      unverified_collections: number;
      audit_events_today: number;
      records_by_status: { status: string; count: number }[];
      recent_audit: {
        id: string;
        action: string;
        changed_by: string;
        record_id: string;
        record_type: string;
        timestamp: string;
      }[];
    };

export interface ApiNotification {
  id: string;
  title: string;
  message: string;
  record_id: string | null;
  record_type: string | null;
  is_read: boolean;
  created_at: string;
}

export interface ApiComment {
  id: string;
  body: string;
  author: string;
  created_at: string;
  updated_at: string;
}

export interface ApiAuditEntry {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  changed_by: string;
  previous_value: unknown;
  new_value: unknown;
  timestamp: string;
}

export interface ApiRemarkLog {
  id: string;
  body: string;
  context: string; // CREATION | GENERAL_EDIT | DRIVER_UPDATE | STATUS_CHANGE
  author: string;
  author_role: string;
  created_at: string;
}

export interface ApiPodAttachment {
  id: string;
  is_photo: boolean;
  name: string;
  mime_type: string;
  size: number;
  uploaded_at: string;
  download_url: string;
}

export interface ApiReportSummary {
  total: number;
  accomplished: number;
  on_hold: number;
  pending: number;
  completion_rate: number;
  by_status:   { status: string;   count: number }[];
  by_category: { category: string; count: number }[];
  by_area:     { area: string;     count: number }[];
  by_driver:   { driver: string;   count: number }[];
}

export interface ApiAdminAuditEntry {
  id: string;
  record_id: string;
  record_type: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  changed_by: string;
  changed_by_id: string;
  timestamp: string;
}

export interface ApiAdminAuditLog {
  page: number;
  limit: number;
  total: number;
  pages: number;
  entries: ApiAdminAuditEntry[];
}

export interface ApiSkuTransaction {
  id: string;
  type: string;
  qty_change: number;
  resulting_balance: number;
  reference: string;
  date: string;
}

export interface ApiSku {
  id: string;
  sku_code: string;
  name: string;
  category: string;
  unit_cost: number;
  unit_price: number;
  reorder_point: number;
  description: string;
  created_by: string;
  modified_by: string;
  created_at: string;
  updated_at: string;
  inventory: {
    warehouse_location: string;
    on_hand_qty: number;
    allocated_qty: number;
    atp: number;
  } | null;
  recent_transactions: ApiSkuTransaction[];
}

// ─── Transaction Center types ─────────────────────────────────────────────────

export interface ApiTransaction {
  id: string;
  source: 'delivery' | 'inventory';
  type: string;
  date: string;
  reference: string;
  entity: string;
  entity_id: string;
  status: string | null;
  description: string;
  qty_change?: number;
  resulting_balance?: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiTransactionList {
  page: number;
  limit: number;
  total: number;
  pages: number;
  transactions: ApiTransaction[];
}

export interface ApiTimelineEvent {
  event_type: string;
  action: string;
  changed_by: string;
  timestamp: string;
  previous_value: unknown;
  new_value: unknown;
  label: string;
}

export interface ApiTransactionDetail {
  id: string;
  source: 'delivery' | 'inventory';
  type: string;
  reference: string;
  entity: string;
  entity_id: string;
  status: string | null;
  description?: string;
  // delivery-specific
  vehicle?: string;
  area?: string;
  driver?: string;
  driver_assistants?: string[];
  account_manager?: string;
  delivery_date?: string;
  item_type?: string;
  remarks?: string;
  priority?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  timeline?: ApiTimelineEvent[];
  // inventory-specific
  qty_change?: number;
  resulting_balance?: number;
  product?: {
    id: string;
    sku_code: string;
    name: string;
    category: string;
  };
  related_transactions?: Array<{
    id: string;
    date: string;
    type: string;
    qty_change: number;
    resulting_balance: number;
    reference: string;
  }>;
}

export const api = {
  login: (email: string, password: string) =>
    request<ApiUser>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<ApiUser>('/auth/me'),

  getRecords: (filters: RecordListFilters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const query = params.toString();
    return request<any[]>(`/records${query ? `?${query}` : ''}`);
  },
  getRecord: (id: string) => request<any>(`/records/${id}`),
  getRecordAudit: (id: string) => request<ApiAuditEntry[]>(`/records/${id}/audit`),
  createRecord: (data: Record<string, unknown>) =>
    request<any>('/records', { method: 'POST', body: JSON.stringify(data) }),
  updateRecord: (id: string, data: Record<string, unknown>) =>
    request<any>(`/records/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  recordTimeIn: (id: string, remarks: string) =>
    request<any>(`/records/${id}/time-in`, { method: 'POST', body: JSON.stringify({ remarks }) }),
  patchStatus: (id: string, status: string, remarks?: string, extra?: { time_out?: string; received_by?: string; priority?: string }) =>
    request<any>(`/records/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, remarks: remarks ?? '', ...extra }) }),
  verifyCollection: (id: string) =>
    request<any>(`/records/${id}/verify-collection`, { method: 'PATCH' }),
  getRecordAttachments: (id: string) => request<ApiPodAttachment[]>(`/records/${id}/attachments`),
  uploadRecordAttachment: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<ApiPodAttachment>(`/records/${id}/attachments`, { method: 'POST', body: form });
  },
  deleteRecordAttachment: (id: string, attachmentId: string, remarks: string) =>
    request<void>(`/records/${id}/attachments/${attachmentId}`, { method: 'DELETE', body: JSON.stringify({ remarks }) }),

  getCompanies: () => request<ApiCompany[]>('/companies'),

  getCustomers: () => request<ApiCustomer[]>('/customers'),
  createCustomer: (data: { name: string; contact_person?: string; email?: string; phone?: string; address?: string; city?: string }) =>
    request<ApiCustomer>('/customers', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomer: (id: string, data: CustomerUpdateInput) =>
    request<ApiCustomer>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getCustomerAudit: (id: string) => request<ApiCustomerAuditEntry[]>(`/customers/${id}/audit`),

  getSuppliers: () => request<ApiSupplier[]>('/suppliers'),
  createSupplier: (data: { name: string; contact_person?: string; email?: string; phone?: string; address?: string; city?: string; category?: string }) =>
    request<ApiSupplier>('/suppliers', { method: 'POST', body: JSON.stringify(data) }),

  getDashboardStats: () => request<ApiDashboardStats>('/dashboard/stats'),

  // Admin user management
  getUsers: () => request<ApiUserAdmin[]>('/users'),
  // DRIVER logins: driver_profile_id links an existing profile; omit it to create one.
  createUser: (data: { name: string; email: string; password: string; role: string; driver_profile_id?: string }) =>
    request<ApiUserAdmin>('/users', { method: 'POST', body: JSON.stringify(data) }),
  setUserDriverProfile: (userId: string, driverProfileId: string | null) =>
    request<{ user_id: string; driver_profile: { id: string; name: string } | null }>(`/users/${userId}/driver-profile`, { method: 'PUT', body: JSON.stringify({ driver_profile_id: driverProfileId }) }),
  updateUser: (id: string, data: { name?: string; email?: string; role?: string }) =>
    request<ApiUserAdmin>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deactivateUser: (id: string) =>
    request<ApiUserAdmin>(`/users/${id}/deactivate`, { method: 'PATCH' }),
  activateUser: (id: string) =>
    request<ApiUserAdmin>(`/users/${id}/activate`, { method: 'PATCH' }),
  deleteUser: (id: string) =>
    request<{ ok: boolean; deleted_id: string }>(`/users/${id}`, { method: 'DELETE' }),
  getUserPermissions: (userId: string) =>
    request<ApiPermissionEditor>(`/users/${userId}/permissions`),
  setUserPermissions: (userId: string, permissions: { screen: string; granted: boolean }[], expectedVersion: string) =>
    request<ApiPermissionEditor>(`/users/${userId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions, expectedVersion })
    }),

  // Admin integration diagnostics
  getIntegrationStatus: () => request<ApiIntegrationStatus>('/admin/integration-status'),
  sendTestEmail: (to: string) =>
    request<ApiTestEmailResult>('/admin/test-email', { method: 'POST', body: JSON.stringify({ to }) }),

  // Admin audit log
  getAuditLog: (params: { page?: number; limit?: number; action?: string; from?: string; to?: string; userId?: string }) => {
    const qs = new URLSearchParams();
    if (params.page)   qs.set('page',   String(params.page));
    if (params.limit)  qs.set('limit',  String(params.limit));
    if (params.action) qs.set('action', params.action);
    if (params.from)   qs.set('from',   params.from);
    if (params.to)     qs.set('to',     params.to);
    if (params.userId) qs.set('userId', params.userId);
    return request<ApiAdminAuditLog>(`/admin/audit-log?${qs.toString()}`);
  },

  // SKU Master
  getSkus: () => request<ApiSku[]>('/skus'),
  getSku: (id: string) => request<ApiSku>(`/skus/${id}`),
  getSkuAudit: (id: string) => request<ApiAuditEntry[]>(`/skus/${id}/audit`),
  updateSku: (id: string, data: Partial<ApiSku>) =>
    request<ApiSku>(`/skus/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  createSku: (data: Omit<ApiSku, 'id' | 'created_by' | 'modified_by' | 'created_at' | 'updated_at' | 'inventory' | 'recent_transactions'>) =>
    request<ApiSku>('/skus', { method: 'POST', body: JSON.stringify(data) }),
  adjustStock: (id: string, data: { type: string; qty_change: number; reference: string }) =>
    request<ApiSku>(`/skus/${id}/adjust`, { method: 'POST', body: JSON.stringify(data) }),

  resetSeed: () => request<{ ok: boolean }>('/dev/reset-seed', { method: 'POST' }),
  canResetDemo: () => request<{ enabled: boolean }>('/dev/reset-capability'),

  // Data Sampler (Admin only)
  dataSampler: {
    getCounts: () =>
      request<{ key: string; label: string; count: number }[]>('/data-sampler/counts'),
    generate: (params: { module: string; count: number; fields?: Record<string, unknown> }) =>
      request<{ created: number; records: unknown[] }>('/data-sampler/generate', {
        method: 'POST',
        body: JSON.stringify(params)
      }),
    reset: (mode: 'full' | 'seed') =>
      request<{ deleted: number; mode: string }>('/data-sampler/reset', {
        method: 'POST',
        body: JSON.stringify({ mode })
      }),
  },

  // Notifications
  getNotifications: () => request<ApiNotification[]>('/notifications'),
  getUnreadCount: () => request<{ count: number }>('/notifications/unread-count'),
  markNotificationRead: (id: string) =>
    request<{ ok: boolean }>(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () =>
    request<{ ok: boolean }>('/notifications/read-all', { method: 'PATCH' }),

  // Record comments
  getRecordComments: (id: string) => request<ApiComment[]>(`/records/${id}/comments`),
  createRecordComment: (id: string, body: string) =>
    request<ApiComment>(`/records/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body })
    }),

  // Remarks history (append-only)
  getRecordRemarks: (id: string) => request<ApiRemarkLog[]>(`/records/${id}/remarks`),

  // Statistical report summary
  getReportSummary: (params: { dateFrom?: string; dateTo?: string; category?: string; area?: string; driver?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params.dateFrom)  qs.set('dateFrom',  params.dateFrom);
    if (params.dateTo)    qs.set('dateTo',    params.dateTo);
    if (params.category)  qs.set('category',  params.category);
    if (params.area)      qs.set('area',      params.area);
    if (params.driver)    qs.set('driver',    params.driver);
    if (params.status)    qs.set('status',    params.status);
    return request<ApiReportSummary>(`/reports/summary?${qs.toString()}`);
  },

  // Transaction Center
  getTransactions: (params: {
    page?: number;
    limit?: number;
    source?: string;
    category?: string;
    from?: string;
    to?: string;
    status?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params.page)     qs.set('page',     String(params.page));
    if (params.limit)    qs.set('limit',    String(params.limit));
    if (params.source)   qs.set('source',   params.source);
    if (params.category) qs.set('category', params.category);
    if (params.from)     qs.set('from',     params.from);
    if (params.to)       qs.set('to',       params.to);
    if (params.status)   qs.set('status',   params.status);
    return request<ApiTransactionList>(`/transactions?${qs.toString()}`);
  },

  getTransaction: (source: string, id: string) =>
    request<ApiTransactionDetail>(`/transactions/${source}/${id}`),

  // Driver Manager
  getDrivers: (all?: boolean) => request<ApiDriver[]>(`/drivers${all ? '?all=1' : ''}`),
  createDriver: (data: { name: string; type: 'DRIVER' | 'ASSISTANT'; coverage_areas?: string[] }) =>
    request<ApiDriver>('/drivers', { method: 'POST', body: JSON.stringify(data) }),
  updateDriver: (id: string, data: Partial<{ name: string; type: string; coverage_areas: string[]; is_active: boolean }>) =>
    request<ApiDriver>(`/drivers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDriver: (id: string) =>
    request<void>(`/drivers/${id}`, { method: 'DELETE' }),

  // Email notifications
  sendNotificationEmail: (data: { recordId: string; trigger: string; recipients: string[] }) =>
    request<{ ok: boolean; sent: number; failed: number }>('/notifications/send-email', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
