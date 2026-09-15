import { prisma } from '../db';

export async function notifyRole(
  role: string,
  title: string,
  message: string,
  recordId?: string,
  recordType?: string
) {
  const users = await prisma.user.findMany({
    where: { role, isActive: true },
    select: { id: true }
  });
  if (users.length === 0) return;
  await prisma.notification.createMany({
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
