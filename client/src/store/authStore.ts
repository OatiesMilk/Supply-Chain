import { create } from 'zustand';
import { subscribeWithSelector, persist } from 'zustand/middleware';
import { api, ApiUser } from '@/api';
import { DEV_ADMIN_USER } from '@/mockData';
import { UserRole } from '@/types';

export const roleFromApi = (role: ApiUser['role']): UserRole => {
  switch (role) {
    case 'SALES_COORDINATOR':
      return 'Sales Coordinator';
    case 'LOGISTICS':
      return 'Logistics';
    case 'TASS':
      return 'TASS';
    case 'ADMIN':
      return 'Admin';
    case 'DRIVER':
      return 'Driver';
    default:
      return 'Sales Coordinator';
  }
};

export const initialsFor = (name: string): string => {
  return name
    .split(' ')
    .filter(Boolean)
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
};

export interface AuthState {
  authUser: ApiUser | null;
  authChecked: boolean;
}

export interface AuthActions {
  setAuthUser: (user: ApiUser | null) => void;
  login: (user: ApiUser) => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  persist(
    subscribeWithSelector((set, get) => ({
      authUser: DEV_ADMIN_USER,
      authChecked: false,

      setAuthUser: (user: ApiUser | null) => set({ authUser: user }),

      login: (user: ApiUser) => set({ authUser: user, authChecked: true }),

      logout: async () => {
        try {
          await api.logout();
        } catch {
          // ignore network failure
        }
        set({ authUser: null, authChecked: true });
      },

      checkAuth: async () => {
        try {
          const user = await api.me();
          set({ authUser: user, authChecked: true });
        } catch {
          // Keep offline bypassed session if available, otherwise fallback
          const current = get().authUser ?? DEV_ADMIN_USER;
          set({ authUser: current, authChecked: true });
        }
      },
    })),
    {
      name: 'auth_user_store',
      partialize: state => ({ authUser: state.authUser }),
    }
  )
);

// Backward-compatible hook matching previous useAuth() API
export function useAuth() {
  const authUser = useAuthStore(s => s.authUser);
  const authChecked = useAuthStore(s => s.authChecked);
  const login = useAuthStore(s => s.login);
  const logout = useAuthStore(s => s.logout);
  const setAuthUser = useAuthStore(s => s.setAuthUser);
  const checkAuth = useAuthStore(s => s.checkAuth);

  const currentUserRole: UserRole = authUser ? roleFromApi(authUser.role) : 'Sales Coordinator';
  const currentUserName = authUser ? authUser.name : '';
  const currentUserInitials = initialsFor(currentUserName);

  return {
    authUser,
    authChecked,
    currentUserRole,
    currentUserName,
    currentUserInitials,
    login,
    logout,
    setAuthUser,
    checkAuth,
  };
}
