import type { ApiUser } from '../../src/api';
import { useAuthStore } from '../../src/store/authStore';
import { useUIStore } from '../../src/store/uiStore';
import { PERMISSION_SCREENS, RESOURCE_ACTIONS } from '../../src/types/permissions';

/** Explicit server-shaped legacy fixture for tests of existing role workflows. */
export function installLegacySession(role: ApiUser['role'] = 'ADMIN', screen = 'dashboard'): ApiUser {
  const user: ApiUser = {
    id: `fixture-${role}`, name: 'Fixture User', email: 'fixture@example.test', role,
    permissions: [], effectiveScreens: [...PERMISSION_SCREENS],
    resources: Object.keys(RESOURCE_ACTIONS), permissionVersion: 'legacy-fixture-1',
  };
  useAuthStore.getState().setAuthUser(user);
  useUIStore.setState({ currentScreen: screen });
  return user;
}
