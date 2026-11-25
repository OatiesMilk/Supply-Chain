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
  searchOpen: boolean;
  accessRequestOpen: boolean;
  accessRequestScreen: string;
  selectedProductId: string | null;
  selectedRecordId: string | null;
  /** Company/Supplier addition request opened from a notification or a ?request= link. Never a record id. */
  selectedAdditionRequestId: string | null;
  dashboardFilterId: DashboardFilterId | null;
  outputActionConfigs: Record<OutputActionTrigger, OutputActionConfig>;
}

export interface UIActions {
  setCurrentScreen: (screen: string) => void;
  setIsSidebarOpen: (open: boolean) => void;
  setIsSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setSearchOpen: (open: boolean) => void;
  openAccessRequest: (screen?: string) => void;
  closeAccessRequest: () => void;
  setSelectedProductId: (id: string | null) => void;
  setSelectedRecordId: (id: string | null) => void;
  setSelectedAdditionRequestId: (id: string | null) => void;
  /** Open a screen focused on an addition request without touching record or product selection. */
  handleNavigateAdditionRequest: (screen: string, requestId: string) => void;
  handleNavigate: (screen: string, item_id?: string, dashboardFilterId?: DashboardFilterId) => void;
  clearDashboardFilter: () => void;
  resetSession: () => void;
  updateOutputActionConfig: (trigger: OutputActionTrigger, patch: Partial<OutputActionConfig>) => void;
}

export type UIStore = UIState & UIActions;

type PersistedUIState = Pick<UIState, 'isSidebarCollapsed' | 'outputActionConfigs'>;

export const useUIStore = create<UIStore>()(
  persist(
    subscribeWithSelector((set, get) => ({
      currentScreen: 'dashboard',
      navigationNonce: 0,
      isSidebarOpen: false,
      isSidebarCollapsed: false,
      searchOpen: false,
      accessRequestOpen: false,
      accessRequestScreen: '',
      selectedProductId: null,
      selectedRecordId: null,
      selectedAdditionRequestId: null,
      dashboardFilterId: null,
      outputActionConfigs: DEFAULT_OUTPUT_ACTIONS,

      setCurrentScreen: (screen: string) => set({ currentScreen: screen }),

      setIsSidebarOpen: (open: boolean) => set({ isSidebarOpen: open }),

      setIsSidebarCollapsed: (collapsed: boolean) => set({ isSidebarCollapsed: collapsed }),

      toggleSidebarCollapsed: () =>
        set(state => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

      setSearchOpen: (open: boolean) => set({ searchOpen: open }),

      openAccessRequest: (screen = '') =>
        set({ accessRequestOpen: true, accessRequestScreen: screen }),

      closeAccessRequest: () =>
        set({ accessRequestOpen: false, accessRequestScreen: '' }),

      setSelectedProductId: (id: string | null) => set({ selectedProductId: id }),

      setSelectedRecordId: (id: string | null) => set({ selectedRecordId: id }),

      setSelectedAdditionRequestId: (id: string | null) => set({ selectedAdditionRequestId: id }),

      handleNavigateAdditionRequest: (screen: string, requestId: string) => {
        const targetPath = `/${screen}?request=${encodeURIComponent(requestId)}`;
        if (targetPath !== window.location.pathname + window.location.search) {
          window.history.pushState({ screen, request_id: requestId }, '', targetPath);
        }
        set({
          currentScreen: screen,
          navigationNonce: get().navigationNonce + 1,
          isSidebarOpen: false,
          dashboardFilterId: null,
          selectedProductId: null,
          selectedRecordId: null,
          selectedAdditionRequestId: requestId,
        });
      },

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
          selectedAdditionRequestId: null,
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
          selectedAdditionRequestId: null,
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
      version: 1,
      partialize: (state): PersistedUIState => ({
        isSidebarCollapsed: state.isSidebarCollapsed,
        outputActionConfigs: state.outputActionConfigs,
      }),
      // v1: "Record Created" became opt-out (notify every role by default), so
      // a config saved under the old opt-in default is reset to the new one.
      migrate: (persisted, version) => {
        const state = persisted as PersistedUIState;
        if (version < 1 && state?.outputActionConfigs) {
          return {
            ...state,
            outputActionConfigs: {
              ...state.outputActionConfigs,
              'Record Created': DEFAULT_OUTPUT_ACTIONS['Record Created'],
            },
          };
        }
        return state;
      },
    }
  )
);
