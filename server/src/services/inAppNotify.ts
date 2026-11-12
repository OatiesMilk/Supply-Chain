import { prisma } from '../db';
import type { PrismaClient } from '@prisma/client';

export async function notifyRole(
  role: string,
  title: string,
  message: string,
  recordId?: string,
  recordType?: string,
  db: Pick<PrismaClient, 'user' | 'notification'> = prisma
) {
  const users = await db.user.findMany({
    where: { role, isActive: true },
    select: { id: true }
  });
  if (users.length === 0) return;
  await db.notification.createMany({
    data: users.map(u => ({
      userId: u.id,
      title,
      message,
      recordId: recordId ?? null,
      recordType: recordType ?? null
    }))
  });
}

export async function notifyUser(
  userId: string,
  title: string,
  message: string,
  recordId?: string,
  recordType?: string
) {
  await prisma.notification.create({
    data: {
      userId,
      title,
      message,
      recordId: recordId ?? null,
      recordType: recordType ?? null
    }
  });
}
