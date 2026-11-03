/** Existing Admin screen access is the only route from account settings to administrative tools. */
export function canManageAdminSettings(role: string, canAccessScreen: (screen: string) => boolean): boolean {
  return role === 'ADMIN' && canAccessScreen('admin');
}
