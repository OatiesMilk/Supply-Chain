// Shared mappings between the frontend's display-friendly string literals
// (DeliveryCategory / DeliveryStatus in src/types.ts) and the DB enums defined
// in prisma/schema.prisma. Keeping this in one place means the API can accept
// and return the same strings the existing frontend already uses everywhere,
// without forcing a UI rewrite of every label.

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
  Scheduled: 'SCHEDULED',
  Delivered: 'ACCOMPLISHED',
  'On-Hold': 'ON_HOLD',
  Rescheduled: 'RESCHEDULED',
  Pending: 'PENDING'
};

export const STATUS_FROM_DB: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  ACCOMPLISHED: 'Delivered',
  ON_HOLD: 'On-Hold',
  RESCHEDULED: 'Rescheduled',
  PENDING: 'Pending'
};

export function serializeRecord(r: any) {
  return {
    id: r.id,
    company_name: r.company?.name ?? '',
    company_id: r.companyId,
    priority: r.priority,
    reference: r.reference,
    remarks: r.remarks,
    status: STATUS_FROM_DB[r.status] ?? r.status,
    vehicle: r.vehicle,
    area: r.area,
    driver: r.driver,
    driver_assistants: (() => { try { return JSON.parse(r.driverAssistants || '[]'); } catch { return []; } })(),
    time_in: r.timeIn ?? null,
    time_out: r.timeOut ?? null,
    received_by: r.receivedBy ?? null,
    account_manager: r.accountManager,
    delivery_date: r.deliveryDate,
    category: CATEGORY_FROM_DB[r.category] ?? r.category,
    item_type: r.itemType,
    is_draft: r.draft ? 'Yes' : 'No',
    date_time: r.dateAndTime,
    item_description: r.itemDescription,
    address: r.address ?? '',
    document_attachment: r.documentAttachment,
    attachments: r.documentAttachment ? [r.documentAttachment] : [],
    collection_verified: r.collectionVerified ?? false,
    collection_verified_by: r.collectionVerifiedBy ?? null,
    collection_verified_at: r.collectionVerifiedAt ?? null,
    amount: r.amount ?? null,
    linked_collection_id: r.linkedCollectionId ?? null,
    linked_collection: r.linkedCollection ? {
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
