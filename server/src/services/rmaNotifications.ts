import type { Prisma } from '@prisma/client';
import { evaluatePermissions } from './permissionEvaluator';
import { sessionUser } from './permissions';
import { canReadRecord } from './recordAccess';

/** RMA notifications obey the same category and assigned-Driver boundaries as
 * the saved record. They commit with the work that created them. */
export async function notifyRmaRecipients(
  tx: Prisma.TransactionClient,
  record: { id: string; category: string; driverId?: string | null; draft: boolean; rmaMovement?: string | null },
  roles: string[], title: string, message: string, excludeUserId?: string,
) {
  const recipients = await tx.user.findMany({ where: { role: { in: roles }, isActive: true }, include: {
    permissions: true, permissionOverrides: true, driverProfile: true,
  } });
  const policies = await tx.rolePolicy.findMany({ where: { role: { in: roles } }, include: { permissions: true } });
  const data = recipients.filter(user => {
    if (user.id === excludeUserId) return false;
    const rmaPermissions = evaluatePermissions({ userId: user.id, role: user.role, isActive: user.isActive,
      authorizationRevision: user.authorizationRevision, overrides: user.permissionOverrides,
      driverProfile: user.driverProfile, rolePolicy: policies.find(policy => policy.role === user.role) ?? null,
    });
    return canReadRecord({ ...sessionUser(user), driverProfileId: rmaPermissions.driverProfileId, rmaPermissions } as any, record);
  }).map(user => ({ userId: user.id, title, message, recordId: record.id, recordType: 'DeliveryRecord' }));
  if (data.length) await tx.notification.createMany({ data });
}
