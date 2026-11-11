/**
 * Delivery and Operations module types
 */

import { AuditFields } from './common';
import type { RmaCategory } from '../utils/rma';

export type DeliveryCategory =
  | 'Sales Orders'
  | 'Deliveries'
  | 'RMA'
  | 'Accounting Collection'
  | 'Procurement Pick-up';

export type DeliveryStatus = 'Draft' | 'Scheduled' | 'In Transit' | 'Delivered' | 'On-Hold' | 'Rescheduled' | 'Pending';

export type RmaMovement = 'LOGISTICS_TRANSPORT' | 'SUPPLIER_COLLECTION' | 'INTERNAL_NO_DRIVER';
export type RmaTransportStatus = 'PENDING' | 'IN_TRANSIT' | 'COMPLETED';

export type PriorityLevel = '1 - Low' | '2 - Moderate' | '3 - High';

export type ItemType = 'Small Item' | 'Unit' | 'Medium Item' | 'Large / Pallet';

export type OutputActionTrigger =
  | 'Record Created'
  | 'Accomplished'
  | 'Rescheduled'
  | 'On-Hold'
  | 'RMA Completed'
  | 'Collection Verified';

export interface OutputActionConfig {
  notifyAM: boolean;
  notifyLogistics: boolean;
  notifyTASS: boolean;
  exportPDF: boolean;
  internalOnly: boolean; // suppresses these additional outputs; server workflow notifications remain independent
}

export interface OutputActionLogEntry {
  trigger: OutputActionTrigger;
  message: string;
  at: string; // ISO timestamp
}

export interface DeliveryRecord extends AuditFields {
  id: string; // e.g., REC-4001
  edit_version?: string; // Server-issued metadata editor precondition.
  expected_edit_version?: string;
  company_name: string; // display name of the record's Company
  company_id: string; // Company the record belongs to (never a Customer ID)
  priority: PriorityLevel;
  reference: string; // SAP reference for non-RMA records; aliases the RMA document reference in the UI
  rma_reference?: string | null;
  legacy_sap_reference?: string | null;
  remarks: string;
  status: DeliveryStatus;
  allowed_statuses?: DeliveryStatus[]; // Authoritative transitions supplied by the server
  vehicle: string;
  area: string;
  driver: string; // display name of the assigned Driver profile
  driver_id?: string | null; // stable Driver profile id — what assignment saves and what decides Driver access
  driver_assistants: string[];
  time_in?: string | null;
  time_out?: string | null;
  received_by?: string | null;
  account_manager: string;
  delivery_date: string; // date, YYYY-MM-DD
  overdue?: boolean;
  days_late?: number;
  completed_late?: boolean;
  category: DeliveryCategory;
  item_type: ItemType;
  is_draft: 'Yes' | 'No';
  submitted_at?: string | null; // ISO; when the record last left Draft
  created_by_id?: string;
  modified_by_id?: string;
  deleted_at?: string | null;
  document_attachment?: string | null;
  rma_type?: RmaCategory | null;
  rma_movement?: RmaMovement | null;
  rma_transport_status?: RmaTransportStatus | null;
  rma_version?: number;
  expected_version?: number; // Mutation precondition; never substitutes for the server version.
  rma_transport_started_at?: string | null;
  rma_transport_completed_at?: string | null;
  rma_received_at?: string | null;
  rma_received_by?: string | null;
  rma_recipient?: string | null;
  rma_completed_at?: string | null;
  purchase_date?: string | null;
  customer_contact_name?: string | null;
  customer_contact_email?: string | null;
  customer_contact_phone?: string | null;
  item_description: string;
  line_items?: { id?: string, sku: string, quantity: number }[];
  attachments: string[]; // mock file names only
  email_notification_sent: boolean;
  output_actions_log: OutputActionLogEntry[]; // full history of fired output actions
  collection_verified?: boolean;
  collection_verified_by?: string | null;
  collection_verified_at?: string | null;
  amount?: number | null; // Philippine Peso — required for Accounting Collection, null for others
  address?: string;
  linked_collection_id?: string | null;
  linked_collection?: {
    id: string;
    reference: string;
    company_name: string;
    status: string;
    collection_verified: boolean;
  } | null;
}

export interface ApiDriver {
  id: string;
  name: string;
  type: 'DRIVER' | 'ASSISTANT';
  coverage_areas: string[];
  is_active: boolean;
  created_by: string;
  created_at: string;
  modified_by: string;
  modified_at: string;
}
