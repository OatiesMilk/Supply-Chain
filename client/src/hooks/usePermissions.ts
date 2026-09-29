import { useMemo } from 'react';
import type { ApiUser } from '@/api';

export function usePermissions(authUser: ApiUser | null) {
  // An incomplete session never falls back to potentially broader role defaults.
  const effectiveScreens = useMemo(() => new Set(authUser?.effectiveScreens ?? []), [authUser]);
  return { effectiveScreens, canAccess: (screen: string) => effectiveScreens.has(screen) };
}
