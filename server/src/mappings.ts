// Shared mappings between the frontend's display-friendly string literals
// (DeliveryCategory / DeliveryStatus in src/types.ts) and the DB enums defined
// in prisma/schema.prisma. Keeping this in one place means the API can accept
// and return the same strings the existing frontend already uses everywhere,
// without forcing a UI rewrite of every label.

import { allowedStatuses, deliveryScheduleState, runState } from './services/deliveryLifecycle';
import { canReadRecord, readableCategories } from './services/recordAccess';
import type { AuthUser } from './middleware/auth';
import { recordEditVersion } from './services/recordEditVersion';
import { isReturnToCustomerCategory, normalizeRmaCategory } from './services/rmaRules';
import { driverActions } from './services/driverActions';

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
  TRANSPORT_COMPLETE: 'Transport Complete',
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

/** RMA contact list, falling back to the legacy single-contact columns. */
function serializeRmaContacts(r: any): { id?: string; name: string; phone: string | null; email: string | null }[] {
  if (r.category !== 'RMA') return [];
  if (Array.isArray(r.rmaContacts) && r.rmaContacts.length) {
    return r.rmaContacts.map((c: any) => ({ id: c.id, name: c.name ?? '', phone: c.phone ?? null, email: c.email ?? null }));
  }
  if ([r.customerContactName, r.customerContactPhone, r.customerContactEmail].some(value => typeof value === 'string' && value.trim())) {
    return [{ name: r.customerContactName ?? '', phone: r.customerContactPhone ?? null, email: r.customerContactEmail ?? null }];
  }
  return [];
}

export function serializeRecord(r: any, user?: AuthUser) {
  const state = r.category === 'DELIVERY' ? deliveryScheduleState(r.deliveryDate) : null;
  const completed = runState(r) === 'Delivered';
  const transportFinished = completed || runState(r) === 'Transport Complete';
  const completedLate = r.category === 'DELIVERY' && transportFinished && Boolean(r.completedLate);
  const canViewLinked = !user || (
    r.linkedCollection
      ? canReadRecord(user, r.linkedCollection)
      : (r.linkedCollectionId ? (user.role !== 'DRIVER' && readableCategories(user).includes('ACCOUNTING_COLLECTION')) : true)
  );
  return {
    id: r.id,
    record_no: r.recordNo ?? null,
    edit_version: recordEditVersion(r),
    company_name: r.company?.name ?? '',
    company_id: r.companyId,
    priority: r.priority,
    reference: r.category === 'RMA' ? (r.rmaReference ?? '') : r.reference,
    rma_reference: r.category === 'RMA' ? (r.rmaReference ?? null) : null,
    legacy_sap_reference: r.category === 'RMA' ? (r.legacySapReference ?? null) : null,
    remarks: r.remarks,
    status: runState(r),
    allowed_statuses: allowedStatuses(r),
    ...(user?.role === 'DRIVER' ? { driver_actions: driverActions(r) } : {}),
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
      overdue: transportFinished ? completedLate : state.overdue,
      days_late: transportFinished ? (completedLate ? Number(r.daysLate ?? 0) : 0) : state.daysLate,
      completed_late: completedLate,
    } : {}),
    category: CATEGORY_FROM_DB[r.category] ?? r.category,
    item_type: r.itemType,
    is_draft: r.draft ? 'Yes' : 'No',
    rma_type: normalizeRmaCategory(r.rmaType),
    is_internal_transfer: r.category === 'RMA' ? Boolean(r.isInternalTransfer) : false,
    purchase_date: r.purchaseDate ?? null,
    customer_contact_name: r.customerContactName ?? null,
    customer_contact_email: r.customerContactEmail ?? null,
    customer_contact_phone: r.customerContactPhone ?? null,
    case_number: r.category === 'RMA' ? (r.caseNumber ?? null) : null,
    // SS# only exists on Return to Customer Slip records.
    service_slip_no: r.category === 'RMA' && isReturnToCustomerCategory(r.rmaType) ? (r.serviceSlipNo ?? null) : null,
    client_remarks: r.category === 'RMA' ? (r.clientRemarks ?? null) : null,
    internal_logistics_remarks: r.category === 'RMA' ? (r.internalLogisticsRemarks ?? null) : null,
    rma_contacts: serializeRmaContacts(r),
    rma_movement: r.rmaMovement ?? null,
    rma_transport_status: r.rmaTransportStatus ?? null,
    rma_transport_started_at: r.rmaTransportStartedAt ?? null,
    rma_transport_completed_at: r.rmaTransportCompletedAt ?? null,
    rma_transport_received_by: r.rmaTransportReceivedBy ?? null,
    rma_received_at: r.rmaReceivedAt ?? null,
    rma_received_by: r.rmaReceivedBy ?? null,
    rma_recipient: r.rmaRecipient ?? null,
    rma_completed_at: r.rmaCompletedAt ?? null,
    rma_version: r.rmaVersion ?? 0,
    item_description: r.itemDescription,
    line_items: r.lineItems?.map((li: any) => ({
      id: li.id,
      sku: li.sku,
      quantity: li.quantity,
      ...(r.category === 'RMA' ? {
        unit_type: li.unitType ?? null,
        serial_number: li.serialNumber ?? null,
        new_serial_number: li.newSerialNumber ?? null,
        defective_serial_number: li.defectiveSerialNumber ?? null,
        purchase_date: li.purchaseDate ?? null,
        sales_order_no: li.salesOrderNo ?? null,
        accessories: li.accessories ?? null,
        problem_description: li.problemDescription ?? null,
        repair_note: li.repairNote ?? null,
        status_tag: li.statusTag ?? null,
      } : {}),
    })) || [],
    address: r.address ?? '',
    document_attachment: r.documentAttachment,
    attachments: r.documentAttachment ? [r.documentAttachment] : [],
    collection_verified: r.collectionVerified ?? false,
    collection_verified_by: r.collectionVerifiedBy ?? null,
    collection_verified_at: r.collectionVerifiedAt ?? null,
    completion_signed_off_by: r.completionSignedOffBy?.name ?? null,
    completion_signed_off_at: r.completionSignedOffAt ?? null,
    completion_remarks: r.completionRemarks ?? null,
    completion_reviewed_photo_id: r.completionReviewedPhotoId ?? null,
    amount: r.amount ?? null,
    linked_collection_id: canViewLinked ? (r.linkedCollectionId ?? null) : null,
    linked_collection: (canViewLinked && r.linkedCollection && !r.linkedCollection.draft) ? {
      id: r.linkedCollection.id,
      record_no: r.linkedCollection.recordNo ?? null,
      reference: r.linkedCollection.reference,
      company_name: r.linkedCollection.company?.name ?? '',
      status: STATUS_FROM_DB[r.linkedCollection.status] ?? r.linkedCollection.status,
      collection_verified: r.linkedCollection.collectionVerified ?? false,
    } : null,
    created_by: r.createdBy?.name ?? '',
    created_by_id: r.createdById,
    // Slip PDFs skip the issuer-signature fetch when none is on file. Presence
    // and timestamp only: the storage key is never serialized.
    ...(r.category === 'RMA' ? {
      created_by_has_signature: Boolean(r.createdBy?.signature),
      created_by_signature_updated_at: r.createdBy?.signature?.updatedAt ?? null,
    } : {}),
    created_at: r.createdAt,
    submitted_at: r.submittedAt ?? null,
    modified_by: r.modifiedBy?.name ?? '',
    modified_by_id: r.modifiedById,
    modified_at: r.updatedAt,
    deleted_at: r.deletedAt
  };
}
