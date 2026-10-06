import { DeliveryCategory } from '../types';

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

export function syncAuthenticatedRoute(screens: Set<string>, navigate: (screen: string, itemId?: string) => void) {
  const requested = window.location.pathname.substring(1) || 'dashboard';
  if (screens.has(requested)) {
    navigate(requested, new URLSearchParams(window.location.search).get('item') || undefined);
    return;
  }
  const fallback = screens.has('dashboard') ? 'dashboard' : screens.values().next().value ?? 'no-access';
  if (fallback) {
    window.history.replaceState({ screen: fallback }, '', `/${fallback}`);
    navigate(fallback);
  }
}

export function keepLoginRoute() {
  const sync = () => window.history.replaceState({ screen: 'login' }, '', '/login');
  sync();
  window.addEventListener('popstate', sync);
  return () => window.removeEventListener('popstate', sync);
}
