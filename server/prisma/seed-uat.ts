import { prisma } from '../src/db';
import { seedAccounts } from './seeds/accounts';
import { seedDrivers } from './seeds/drivers';
import { seedUsers } from './seeds/users';
import { seedDriverDemo } from './seed-driver-demo';

export async function runUatSeed() {
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
  await seedAccounts(users.ADMIN.id);
  await seedDrivers(prisma, users.ADMIN.name);
  const driverRecords = await seedDriverDemo(prisma);

  return { userCount: Object.keys(users).length, driverRecords };
}

if (require.main === module) {
  runUatSeed()
    .then(result => {
      console.log(`UAT seed complete: ${result.userCount} users and ${result.driverRecords} driver demo records created.`);
    })
    .catch(error => {
      console.error('UAT seed failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => { await prisma.$disconnect(); });
}
