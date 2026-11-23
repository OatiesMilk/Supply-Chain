import type { Prisma } from '@prisma/client';
import { evaluatePermissions } from './permissionEvaluator';
import { sessionUser } from './permissions';
import { canReadRecord } from './recordAccess';
import { permissionMode } from './permissionManagement';
import { permissionSession } from './sessionPermissions';

/** Role notifications obey the saved record's read and ownership boundaries.
 * They commit with the work that created them. */
export async function notifyRecordRecipients(
  tx: Prisma.TransactionClient,
  record: { id: string; category: string; driverId?: string | null; draft: boolean; rmaMovement?: string | null },
  roles: string[], title: string, message: string, excludeUserId?: string,
) {
  const recipients = await tx.user.findMany({ where: { role: { in: roles }, isActive: true }, include: {
    permissions: true, permissionOverrides: true, driverProfile: true, permissionConversion: true,
  } });
  const policies = await tx.rolePolicy.findMany({ where: { role: { in: roles } }, include: { permissions: true } });
  const data = recipients.filter(user => {
    if (user.id === excludeUserId) return false;
    const permissions = evaluatePermissions({ userId: user.id, role: user.role, isActive: user.isActive,
      authorizationRevision: user.authorizationRevision, overrides: user.permissionOverrides,
      driverProfile: user.driverProfile, rolePolicy: policies.find(policy => policy.role === user.role) ?? null,
    });
    if (permissionMode() === 'V1') return user.permissionConversion?.catalogVersion === 1 && canReadRecord(permissionSession(user, permissions) as any, record);
    return canReadRecord({ ...sessionUser(user), driverProfileId: permissions.driverProfileId, rmaPermissions: permissions } as any, record);
  }).map(user => ({ userId: user.id, title, message, recordId: record.id, recordType: 'DeliveryRecord' }));
  if (data.length) await tx.notification.createMany({ data });
}

export const notifyRmaRecipients = notifyRecordRecipients;
