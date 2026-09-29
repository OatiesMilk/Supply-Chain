import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { api, ApiUser } from '@/api';
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

// Ignore session checks that complete after a newer login, logout, or check.
let authRevision = 0;

export const useAuthStore = create<AuthStore>()(
  subscribeWithSelector((set) => ({
    authUser: null,
    authChecked: false,

    setAuthUser: (user: ApiUser | null) => {
      authRevision++;
      set({ authUser: user });
    },

    login: (user: ApiUser) => {
      authRevision++;
      set({ authUser: user, authChecked: true });
    },

    logout: async () => {
      authRevision++;
      set({ authUser: null, authChecked: true });
      try {
        await api.logout();
      } catch {
        // Local access stays revoked even if the server cannot be reached.
      }
    },

    checkAuth: async () => {
      const revision = ++authRevision;
      set({ authUser: null, authChecked: false });
      try {
        const user = await api.me();
        if (revision === authRevision) set({ authUser: user, authChecked: true });
      } catch {
        // Missing, expired, and unverifiable sessions all fail closed.
        if (revision === authRevision) set({ authUser: null, authChecked: true });
      }
    },
  }))
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
