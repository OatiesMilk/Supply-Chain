import { CATEGORY_SCREENS } from '@/routes/screenRouting';

export interface PageQueryState {
  data: unknown;
  isPending: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

/** Only resources consumed by the active page can block its initial render.
 * Global company lists, badges and search requests do not delay other screens. */
export function pageResources(screen?: string): string[] {
  if (!screen) return [];
  if (CATEGORY_SCREENS[screen] || screen === 'main') return ['records', 'companies', 'drivers'];
  switch (screen) {
    case 'dashboard': return ['records', 'skus', 'dashboard', 'drivers'];
    case 'customers': return ['customers'];
    case 'suppliers': return ['suppliers', 'records'];
    case 'inventory': return ['skus'];
    case 'driver':
    case 'driver_board': return ['records', 'drivers'];
    case 'driver_manager': return ['drivers'];
    case 'driver_dashboard': return ['records'];
    case 'calendar': return ['records', 'drivers'];
    case 'am_directory': return ['records'];
    case 'data_sampler': return ['companies', 'drivers'];
    default: return [];
  }
}

export function getPageDataState(queries: PageQueryState[]) {
  // Keep usable cached data visible during background refreshes and failures.
  const missing = queries.filter(query => query.data === undefined);
  return {
    loading: missing.some(query => query.isPending),
    error: missing.find(query => query.error)?.error?.message ?? null,
  };
}
