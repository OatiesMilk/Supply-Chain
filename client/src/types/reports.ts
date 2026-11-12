/**
 * Reports and Audit types
 */

export interface ApiReportSummary {
  total: number;
  accomplished: number;
  completed_in_range: number;
  on_hold: number;
  pending: number;
  completion_rate: number;
  date_basis: { cohort: 'deliveryDate'; completion: 'timeOut'; time_zone: 'Asia/Manila' };
  by_status:   { status: string;   count: number }[];
  by_category: { category: string; count: number }[];
  by_area:     { area: string;     count: number }[];
  by_driver:   { driver: string;   count: number }[];
}

export interface ApiAdminAuditEntry {
  record_no?: string | null;
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
