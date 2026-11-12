import { defaultRolePermissions, type PolicyRole } from '../src/services/permissionCatalog';
import { dispatchRolePermissions } from '../src/services/rmaDispatchPermissions';
import { prisma } from '../src/db';
import { mock } from 'node:test';

export function rmaTestPolicy(role: PolicyRole, dispatch = true) {
  return { role, catalogVersion: 1, revision: 143n,
    permissions: [...(dispatch ? dispatchRolePermissions(role) : defaultRolePermissions(role))]
      .map(([permissionKey, effect]) => ({ role, permissionKey, effect })),
  };
}
export function rmaTestAccount<T extends { role: string; driverProfile?: any }>(user: T) {
  return { ...user, authorizationRevision: 1n, permissionOverrides: [],
    ...(user.driverProfile ? { driverProfile: { ...user.driverProfile, isActive: true } } : {}),
  };
}
export function installRmaPolicyLookup() {
  const previous = prisma.rolePolicy.findUnique;
  prisma.rolePolicy.findUnique = mock.fn(async ({ where }: any) => rmaTestPolicy(where.role)) as any;
  return () => { prisma.rolePolicy.findUnique = previous; };
}
export function matchesRecordWhere(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, value]: [string, any]) => {
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(condition => matchesRecordWhere(row, condition));
    if (key === 'OR') return value.some((condition: any) => matchesRecordWhere(row, condition));
    if (key === 'NOT') return !matchesRecordWhere(row, value);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(row[key]);
      if ('not' in value) return row[key] !== value.not;
      if ('equals' in value) return row[key] === value.equals;
    }
    return row[key] === value;
  });
}
