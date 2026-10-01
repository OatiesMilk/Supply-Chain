import { prisma } from '../src/db';
import { seedUsers } from './seeds/users';

async function main() {
  const podTable = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass('public."PodAttachment"') IS NOT NULL AS exists
  `;
  if (podTable[0]?.exists) await prisma.$executeRaw`DELETE FROM "PodAttachment"`;
  await prisma.remarkLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.userPermission.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.dailyStatusSnapshot.deleteMany();
  await prisma.inventoryTransaction.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.product.deleteMany();
  await prisma.deliveryRecord.deleteMany();
  await prisma.company.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.user.deleteMany();

  const users = await seedUsers();
  console.log(`Users-only seed complete: ${Object.keys(users).length} users created.`);
}

main()
  .catch(error => {
    console.error('Users-only seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
