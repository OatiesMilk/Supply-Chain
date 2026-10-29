import { useMemo } from 'react';
import type { ApiUser } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { permissionsFor } from '@/utils/permissions';

export function usePermissions(authUser?: ApiUser | null) {
  const current = useAuthStore(state => state.authUser);
  const route = useUIStore(state => state.currentScreen);
  return useMemo(() => {
    const user = authUser === undefined ? current : authUser;
    const access = permissionsFor(user);
    const screen = user?.role === 'DRIVER' && access.canAccess('driver_dashboard') ? 'driver_dashboard' : route;
    return { ...access, canRecord: (category: string, action: import('@/types/permissions').PermissionAction = 'READ', path = screen) => access.canRecord(category, action, path) };
  }, [authUser, current, route]);
}
