import type { PrismaClient } from '@prisma/client';
import { isMicrosoftGuid } from './ssoState';

// Never search by email to bind a Microsoft identity. The OID must already be
// associated to a user by an authorized Admin through users/:id/microsoft-identity.
export async function approvedMicrosoftUser(db: Pick<PrismaClient, 'user'>, claims: Record<string, unknown> | undefined, tenantId: string) {
  const oid = claims?.oid;
  const tid = claims?.tid;
  if (!isMicrosoftGuid(oid) || !isMicrosoftGuid(tid) || tid.toLowerCase() !== tenantId.toLowerCase()) {
    return { error: 'sso_invalid_identity' } as const;
  }
  const user = await db.user.findUnique({ where: { microsoftOid: oid } });
  if (!user) return { error: 'sso_not_approved' } as const;
  if (!user.isActive) return { error: 'account_deactivated' } as const;
  // If supplied by Entra, mismatched email/UPN needs Admin review. OID remains
  // the sole principal identifier; email alone never auto-links an account.
  const claimEmail = claims?.email ?? claims?.preferred_username;
  if (typeof claimEmail === 'string' && claimEmail.toLowerCase().trim() !== user.email.toLowerCase()) {
    return { error: 'sso_identity_mismatch' } as const;
  }
  return { user } as const;
}
