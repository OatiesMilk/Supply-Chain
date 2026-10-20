// Shared mappings between the frontend's display-friendly string literals
// (DeliveryCategory / DeliveryStatus in src/types.ts) and the DB enums defined
// in prisma/schema.prisma. Keeping this in one place means the API can accept
// and return the same strings the existing frontend already uses everywhere,
// without forcing a UI rewrite of every label.

import { allowedStatuses, deliveryScheduleState, runState } from './services/deliveryLifecycle';
import { canReadRecord, readableCategories } from './services/recordAccess';
import type { AuthUser } from './middleware/auth';

export const CATEGORY_TO_DB: Record<string, string> = {
  'Sales Orders': 'SALES_ORDERS',
  'Deliveries': 'DELIVERY',
  'RMA': 'RMA',
  'Accounting Collection': 'ACCOUNTING_COLLECTION',
  'Procurement Pick-up': 'PROCUREMENT_PICKUP'
};

export const CATEGORY_FROM_DB: Record<string, string> = {
  SALES_ORDERS: 'Sales Orders',
  DELIVERY: 'Deliveries',
  RMA: 'RMA',
  ACCOUNTING_COLLECTION: 'Accounting Collection',
  PROCUREMENT_PICKUP: 'Procurement Pick-up'
};

export const STATUS_TO_DB: Record<string, string> = {
  Draft: 'SCHEDULED',
  Scheduled: 'SCHEDULED',
  'In Transit': 'IN_TRANSIT',
  Delivered: 'ACCOMPLISHED',
  'On-Hold': 'ON_HOLD',
  Rescheduled: 'RESCHEDULED',
  Pending: 'PENDING'
};

export const STATUS_FROM_DB: Record<string, string> = {
  DRAFT: 'Draft',
  IN_TRANSIT: 'In Transit',
  SCHEDULED: 'Scheduled',
  ACCOMPLISHED: 'Delivered',
  ON_HOLD: 'On-Hold',
  RESCHEDULED: 'Rescheduled',
  PENDING: 'Pending'
};

export function parseDriverAssistants(value: unknown): string[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === 'string') : [];
  } catch {
    return [];
  }
}

export function serializeRecord(r: any, user?: AuthUser) {
  const state = r.category === 'DELIVERY' ? deliveryScheduleState(r.deliveryDate) : null;
  const completed = runState(r) === 'Delivered';
  const completedLate = r.category === 'DELIVERY' && completed && Boolean(r.completedLate);
  const canViewLinked = !user || (
    r.linkedCollection
      ? canReadRecord(user, r.linkedCollection)
      : (r.linkedCollectionId ? (user.role !== 'DRIVER' && readableCategories(user).includes('ACCOUNTING_COLLECTION')) : true)
  );
  return {
    id: r.id,
    company_name: r.company?.name ?? '',
    company_id: r.companyId,
    priority: r.priority,
    reference: r.reference,
    remarks: r.remarks,
    status: runState(r),
    allowed_statuses: allowedStatuses(r),
    vehicle: r.vehicle,
    area: r.area,
    driver: r.driver,
    driver_id: r.driverId ?? null,
    driver_assistants: parseDriverAssistants(r.driverAssistants),
    time_in: r.timeIn ?? null,
    time_out: r.timeOut ?? null,
    received_by: r.receivedBy ?? null,
    account_manager: r.accountManager,
    delivery_date: r.deliveryDate,
    ...(state ? {
      overdue: completed ? completedLate : state.overdue,
      days_late: completed ? (completedLate ? Number(r.daysLate ?? 0) : 0) : state.daysLate,
      completed_late: completedLate,
    } : {}),
    category: CATEGORY_FROM_DB[r.category] ?? r.category,
    item_type: r.itemType,
    is_draft: r.draft ? 'Yes' : 'No',
    
    item_description: r.itemDescription,
    line_items: r.lineItems?.map((li: any) => ({ id: li.id, sku: li.sku, quantity: li.quantity })) || [],
    address: r.address ?? '',
    document_attachment: r.documentAttachment,
    attachments: r.documentAttachment ? [r.documentAttachment] : [],
    collection_verified: r.collectionVerified ?? false,
    collection_verified_by: r.collectionVerifiedBy ?? null,
    collection_verified_at: r.collectionVerifiedAt ?? null,
    amount: r.amount ?? null,
    linked_collection_id: canViewLinked ? (r.linkedCollectionId ?? null) : null,
    linked_collection: (canViewLinked && r.linkedCollection && !r.linkedCollection.draft) ? {
      id: r.linkedCollection.id,
      reference: r.linkedCollection.reference,
      company_name: r.linkedCollection.company?.name ?? '',
      status: STATUS_FROM_DB[r.linkedCollection.status] ?? r.linkedCollection.status,
      collection_verified: r.linkedCollection.collectionVerified ?? false,
    } : null,
    created_by: r.createdBy?.name ?? '',
    created_by_id: r.createdById,
    created_at: r.createdAt,
    modified_by: r.modifiedBy?.name ?? '',
    modified_by_id: r.modifiedById,
    modified_at: r.updatedAt,
    deleted_at: r.deletedAt
  };
}
