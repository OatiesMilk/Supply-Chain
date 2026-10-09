import { create } from 'zustand';
import { subscribeWithSelector, persist } from 'zustand/middleware';
import { OutputActionConfig, OutputActionTrigger } from '@/types';
import { DEFAULT_OUTPUT_ACTIONS } from '@/outputActions';
import { CATEGORY_SCREENS } from '@/routes/screenRouting';
import { DashboardFilterId } from '@/utils/dashboardFilters';

export interface UIState {
  currentScreen: string;
  navigationNonce: number;
  isSidebarOpen: boolean;
  isSidebarCollapsed: boolean;
  zoomFactor: number;
  searchOpen: boolean;
  accessRequestOpen: boolean;
  accessRequestScreen: string;
  selectedProductId: string | null;
  selectedRecordId: string | null;
  dashboardFilterId: DashboardFilterId | null;
  outputActionConfigs: Record<OutputActionTrigger, OutputActionConfig>;
}

export interface UIActions {
  setCurrentScreen: (screen: string) => void;
  setIsSidebarOpen: (open: boolean) => void;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setZoomFactor: (zoom: number | ((prev: number) => number)) => void;
  setSearchOpen: (open: boolean) => void;
  openAccessRequest: (screen?: string) => void;
  closeAccessRequest: () => void;
  setSelectedProductId: (id: string | null) => void;
  setSelectedRecordId: (id: string | null) => void;
  handleNavigate: (screen: string, item_id?: string, dashboardFilterId?: DashboardFilterId) => void;
  clearDashboardFilter: () => void;
  resetSession: () => void;
  updateOutputActionConfig: (trigger: OutputActionTrigger, patch: Partial<OutputActionConfig>) => void;
}

export type UIStore = UIState & UIActions;

export const useUIStore = create<UIStore>()(
  persist(
    subscribeWithSelector((set, get) => ({
      currentScreen: 'dashboard',
      navigationNonce: 0,
      isSidebarOpen: false,
      isSidebarCollapsed: false,
      zoomFactor: 100,
      searchOpen: false,
      accessRequestOpen: false,
      accessRequestScreen: '',
      selectedProductId: null,
      selectedRecordId: null,
      dashboardFilterId: null,
      outputActionConfigs: DEFAULT_OUTPUT_ACTIONS,

      setCurrentScreen: (screen: string) => set({ currentScreen: screen }),

      setIsSidebarOpen: (open: boolean) => set({ isSidebarOpen: open }),

      setIsSidebarCollapsed: (collapsed: boolean) => set({ isSidebarCollapsed: collapsed }),

      toggleSidebarCollapsed: () =>
        set(state => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

      setZoomFactor: (zoom: number | ((prev: number) => number)) =>
        set(state => ({
          zoomFactor: typeof zoom === 'function' ? zoom(state.zoomFactor) : zoom,
        })),

      setSearchOpen: (open: boolean) => set({ searchOpen: open }),

      openAccessRequest: (screen = '') =>
        set({ accessRequestOpen: true, accessRequestScreen: screen }),

      closeAccessRequest: () =>
        set({ accessRequestOpen: false, accessRequestScreen: '' }),

      setSelectedProductId: (id: string | null) => set({ selectedProductId: id }),

      setSelectedRecordId: (id: string | null) => set({ selectedRecordId: id }),

      resetSession: () => {
        window.history.replaceState({ screen: 'login' }, '', '/login');
        set({
          currentScreen: 'dashboard',
          isSidebarOpen: false,
          searchOpen: false,
          accessRequestOpen: false,
          accessRequestScreen: '',
          selectedProductId: null,
          selectedRecordId: null,
          dashboardFilterId: null,
        });
      },

      handleNavigate: (screen: string, item_id?: string, dashboardFilterId?: DashboardFilterId) => {
        const targetPath = `/${screen}${item_id ? `?item=${item_id}` : ''}`;
        const currentPathWithSearch = window.location.pathname + window.location.search;
        
        if (targetPath !== currentPathWithSearch) {
          window.history.pushState({ screen, item_id }, '', targetPath);
        }

        set({
          currentScreen: screen,
          navigationNonce: get().navigationNonce + 1,
          isSidebarOpen: false,
          dashboardFilterId: dashboardFilterId ?? null,
          selectedProductId: screen === 'inventory' && item_id ? item_id : null,
          selectedRecordId: CATEGORY_SCREENS[screen] && item_id ? item_id : null,
        });
      },

      clearDashboardFilter: () => set({ dashboardFilterId: null }),

      updateOutputActionConfig: (trigger: OutputActionTrigger, patch: Partial<OutputActionConfig>) =>
        set(state => ({
          outputActionConfigs: {
            ...state.outputActionConfigs,
            [trigger]: {
              ...state.outputActionConfigs[trigger],
              ...patch,
            },
          },
        })),
    })),
    {
      name: 'ui_store',
      partialize: state => ({
        isSidebarCollapsed: state.isSidebarCollapsed,
        zoomFactor: state.zoomFactor,
        outputActionConfigs: state.outputActionConfigs,
      }),
    }
  )
);
