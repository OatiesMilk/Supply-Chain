import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { api, ApiUser } from '@/api';
import { UserRole } from '@/types';
import { useUIStore } from './uiStore';

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
  logoutPending: boolean;
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
let pendingLogout: Promise<void> | null = null;
let logoutUnconfirmed = false;
const LOGOUT_MARKER = 'portal_logout_unconfirmed';

function rememberLogout(required: boolean) {
  logoutUnconfirmed = required;
  try {
    if (required) window.sessionStorage?.setItem(LOGOUT_MARKER, 'true');
    else window.sessionStorage?.removeItem(LOGOUT_MARKER);
  } catch { /* In-memory intent still protects the current tab. */ }
}

function needsLogout() {
  try { return logoutUnconfirmed || window.sessionStorage?.getItem(LOGOUT_MARKER) === 'true'; }
  catch { return logoutUnconfirmed; }
}

export const useAuthStore = create<AuthStore>()(
  subscribeWithSelector((set) => ({
    authUser: null,
    authChecked: false,
    logoutPending: false,

    setAuthUser: (user: ApiUser | null) => {
      authRevision++;
      set({ authUser: user });
    },

    login: (user: ApiUser) => {
      authRevision++;
      rememberLogout(false);
      set({ authUser: user, authChecked: true });
    },

    logout: async () => {
      if (pendingLogout) return pendingLogout;
      authRevision++;
      rememberLogout(true);
      set({ authUser: null, authChecked: true, logoutPending: true });
      useUIStore.getState().resetSession();
      pendingLogout = (async () => {
        try {
          await api.logout();
          rememberLogout(false);
        } catch {
          // Local access stays revoked even if the server cannot be reached.
        }
      })();
      await pendingLogout;
      pendingLogout = null;
      set({ logoutPending: false });
    },

    checkAuth: async () => {
      const revision = ++authRevision;
      if (pendingLogout) await pendingLogout;
      if (revision !== authRevision) return;
      set({ authUser: null, authChecked: false });
      try {
        // A failed offline logout must not revive the old cookie on reconnect.
        if (needsLogout()) {
          await api.logout();
          if (revision !== authRevision) return;
          rememberLogout(false);
          set({ authUser: null, authChecked: true });
          return;
        }
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
  const logoutPending = useAuthStore(s => s.logoutPending);
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
    logoutPending,
    currentUserRole,
    currentUserName,
    currentUserInitials,
    login,
    logout,
    setAuthUser,
    checkAuth,
  };
}
