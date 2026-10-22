import type { DeliveryCategory } from '../types';

/** Presentation only: route keys, permission keys and domain values stay unchanged. */
export const SCREEN_LABELS: Record<string, string> = {
  main: 'All Records', dashboard: 'Dashboard', deliveries: 'Deliveries',
  rma: 'RMA', accounting_collection: 'Accounting Collection',
  procurement_pickup: 'Procurement Pick-up', sales_orders: 'Sales Orders',
  customers: 'Customers', suppliers: 'Suppliers', driver: 'Drivers',
  driver_board: 'Drivers', driver_manager: 'Drivers', driver_dashboard: 'My Runs',
  admin: 'Admin Panel', calendar: 'Delivery Calendar', statistical_reports: 'Reports',
  am_directory: 'Account Managers', transactions: 'Transaction Center',
  inventory: 'Products / SKU Master', data_sampler: 'Data Sampler',
};

export function screenLabel(screen: string): string {
  return Object.hasOwn(SCREEN_LABELS, screen) ? SCREEN_LABELS[screen] : screen.replace(/_/g, ' ');
}

export const CREATE_RECORD_LABEL = 'Create Record';
export const DRAFT_RECORDS_LABEL = 'Drafts Awaiting Submission';

export function completionActionLabel(category: DeliveryCategory): string {
  return category === 'Deliveries' ? 'Mark as Delivered' : 'Accomplish';
}
