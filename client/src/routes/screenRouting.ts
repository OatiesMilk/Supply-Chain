import { DeliveryCategory } from '../types';
import { loadState, saveState } from '../utils/persistence';

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

// The three driver screens share one "Drivers" sidebar item and are switched
// with tabs. Each tab keeps its own screen key, URL and permission grant.
export const DRIVER_TABS = [
  { screen: 'driver', label: 'View' },
  { screen: 'driver_board', label: 'Board' },
  { screen: 'driver_manager', label: 'Manager' },
] as const;

const LAST_DRIVER_TAB_KEY = 'last_driver_tab';

export function isDriverScreen(screen: string): boolean {
  return DRIVER_TABS.some(tab => tab.screen === screen);
}

export function rememberDriverTab(screen: string): void {
  if (isDriverScreen(screen)) saveState(LAST_DRIVER_TAB_KEY, screen);
}

// Where the "Drivers" sidebar item opens: the last tab used if it is still
// granted, otherwise the first granted tab. Null when none are granted.
export function driverLandingScreen(canAccess: (screen: string) => boolean): string | null {
  const last = loadState<string | null>(LAST_DRIVER_TAB_KEY, null);
  if (last && isDriverScreen(last) && canAccess(last)) return last;
  return DRIVER_TABS.find(tab => canAccess(tab.screen))?.screen ?? null;
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
