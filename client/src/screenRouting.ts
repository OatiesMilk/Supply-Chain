import { DeliveryCategory } from './types';

// "Sales Orders" is a real record category but has no dedicated sidebar item
// (only the 9 confirmed items do). Records in that category are still
// reachable by deep-linking to this screen key - just not from the sidebar.
export const CATEGORY_SCREENS: Record<string, DeliveryCategory> = {
  deliveries: 'Deliveries',
  rma: 'RMA',
  accounting_collection: 'Accounting Collection',
  procurement_pickup: 'Procurement Pick-up',
  sales_orders: 'Sales Orders'
};

export function screenKeyForCategory(category: DeliveryCategory): string {
  const found = Object.entries(CATEGORY_SCREENS).find(([, cat]) => cat === category);
  return found ? found[0] : 'dashboard';
}
