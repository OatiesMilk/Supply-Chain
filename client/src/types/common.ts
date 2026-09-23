/**
 * Common shared types across all modules
 */

export interface AuditFields {
  created_by: string;
  created_at: string; // ISO timestamp
  modified_by: string;
  modified_at: string; // ISO timestamp
}

// Role-based access: 3 operational roles + Admin + Driver
export type UserRole = 'Sales Coordinator' | 'Logistics' | 'TASS' | 'Admin' | 'Driver';

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
