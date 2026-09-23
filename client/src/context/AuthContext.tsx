import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, ApiUser } from '@/api';
import { DEV_ADMIN_USER } from '@/mockData';
import { loadState, saveState, clearPersistedState } from '@/utils/persistence';
import { UserRole } from '@/types';

interface AuthContextType {
  authUser: ApiUser | null;
  authChecked: boolean;
  currentUserRole: UserRole;
  currentUserName: string;
  currentUserInitials: string;
  login: (user: ApiUser) => void;
  logout: () => Promise<void>;
  setAuthUser: React.Dispatch<React.SetStateAction<ApiUser | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const roleFromApi = (role: ApiUser['role']): UserRole => {
  switch (role) {
    case 'SALES_COORDINATOR': return 'Sales Coordinator';
    case 'LOGISTICS': return 'Logistics';
    case 'TASS': return 'TASS';
    case 'ADMIN': return 'Admin';
    case 'DRIVER': return 'Driver';
    default: return 'Sales Coordinator';
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

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [authUser, setAuthUser] = useState<ApiUser | null>(() => {
    return loadState<ApiUser | null>('auth_user', DEV_ADMIN_USER);
  });
  const [authChecked, setAuthChecked] = useState(true);

  useEffect(() => {
    api.me()
      .then(user => {
        setAuthUser(user);
        saveState('auth_user', user);
      })
      .catch(() => {
        const current = loadState<ApiUser | null>('auth_user', DEV_ADMIN_USER);
        setAuthUser(current);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  const login = (user: ApiUser) => {
    setAuthUser(user);
    saveState('auth_user', user);
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    clearPersistedState();
    setAuthUser(null);
  };

  const currentUserRole: UserRole = authUser ? roleFromApi(authUser.role) : 'Sales Coordinator';
  const currentUserName = authUser ? authUser.name : '';
  const currentUserInitials = initialsFor(currentUserName);

  return (
    <AuthContext.Provider
      value={{
        authUser,
        authChecked,
        currentUserRole,
        currentUserName,
        currentUserInitials,
        login,
        logout,
        setAuthUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
