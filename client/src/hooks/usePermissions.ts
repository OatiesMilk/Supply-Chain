import { useState, useEffect } from 'react';
import { ApiUser } from '@/api';
import { UserRole } from '@/types';
import { roleFromApi } from '@/context/AuthContext';

// Role scope: which screens each role can access (default baseline)
export const DEFAULT_ROLE_SCOPE: Record<string, string[]> = {
  'Sales Coordinator': [
    'main',
    'dashboard',
    'deliveries',
    'rma',
    'accounting_collection',
    'procurement_pickup',
    'sales_orders',
    'customers',
    'suppliers',
    'am_directory',
    'transactions',
    'inventory',
  ],
  'Logistics': [
    'main',
    'dashboard',
    'deliveries',
    'rma',
    'accounting_collection',
    'procurement_pickup',
    'sales_orders',
    'customers',
    'suppliers',
    'driver',
    'driver_manager',
    'calendar',
    'driver_board',
    'transactions',
    'inventory',
    'status_history',
    'statistical_reports',
  ],
  'TASS': [
    'main',
    'dashboard',
    'rma',
    'procurement_pickup',
    'accounting_collection',
    'transactions',
    'inventory',
    'suppliers',
  ],
  'Admin': [
    'main',
    'dashboard',
    'deliveries',
    'rma',
    'accounting_collection',
    'procurement_pickup',
    'sales_orders',
    'customers',
    'suppliers',
    'driver',
    'driver_manager',
    'admin',
    'calendar',
    'driver_board',
    'am_directory',
    'transactions',
    'inventory',
    'data_sampler',
    'status_history',
    'statistical_reports',
  ],
  'Driver': ['driver_dashboard'],
};

export function usePermissions(authUser: ApiUser | null) {
  const [effectiveScreens, setEffectiveScreens] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!authUser) {
      setEffectiveScreens(new Set());
      return;
    }
    const role: UserRole = roleFromApi(authUser.role);
    const screens = new Set(DEFAULT_ROLE_SCOPE[role] ?? []);
    for (const perm of authUser.permissions ?? []) {
      if (perm.granted) screens.add(perm.screen);
      else screens.delete(perm.screen);
    }
    // Admin always retains the admin screen regardless of overrides
    if (authUser.role === 'ADMIN') screens.add('admin');
    // Warehouse module is retired — force-excluded
    screens.delete('warehouses');
    setEffectiveScreens(screens);
  }, [authUser]);

  const canAccess = (screen: string) => effectiveScreens.has(screen);

  return {
    effectiveScreens,
    canAccess,
  };
}
