/**
 * Dashboard module types
 */

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
      rma_in_transit: number;
      rma_aging: number;
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
        record_no?: string | null;
        record_type: string;
        timestamp: string;
      }[];
    };
