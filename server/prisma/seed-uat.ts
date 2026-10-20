import { assertDisposableSeedTarget } from './seed-safety';
import { prisma } from '../src/db';
import { seedAccounts } from './seeds/accounts';
import { seedDrivers } from './seeds/drivers';
import { seedUsers } from './seeds/users';
import { seedDriverDemo } from './seed-driver-demo';
import sharp from 'sharp';
import { podStorage } from '../src/services/podStorage';
import { manilaToday } from '../src/services/deliveryLifecycle';

// AUD-009 follow-up: this fixture belongs ONLY to the disposable UAT seed.
// The surrounding assertDisposableSeedTarget() gate must run before this code.
async function seedDeliveredPhotoFixture() {
  if (process.env.POD_STORAGE_PROVIDER && process.env.POD_STORAGE_PROVIDER !== 'local') {
    throw new Error('UAT completed-run fixture requires local POD storage.');
  }

  const date = manilaToday();
  const id = `REC-UAT-DELIVERED-${date.replace(/-/g, '')}`;
  const [company, sales, logistics, driverUser] = await Promise.all([
    prisma.company.findFirst(),
    prisma.user.findUnique({ where: { email: 'sales@microgenesis.com' } }),
    prisma.user.findUnique({ where: { email: 'logistics@microgenesis.com' } }),
    prisma.user.findUnique({ where: { email: 'driver@microgenesis.com' } }),
  ]);
  if (!company || !sales || !logistics || !driverUser) {
    throw new Error('Missing required UAT users or Company for completed-run fixture.');
  }
  const profile = await prisma.driver.findUnique({ where: { userId: driverUser.id } });
  if (!profile || !profile.isActive || profile.type !== 'DRIVER') {
    throw new Error('UAT Driver login must have a linked active Driver profile.');
  }

  // Generate a genuinely decodable PNG, not a filename-only mock.
  const buffer = await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 25, g: 115, b: 195 } },
  }).png().toBuffer();
  const originalName = 'uat-delivered-proof.png';
  const storageKey = await podStorage.save({
    originalName, mimeType: 'image/png', size: buffer.length, buffer,
  });
  const completedAt = new Date();

  try {
    await prisma.$transaction(async tx => {
      await tx.deliveryRecord.create({
        data: {
          id,
          companyId: company.id,
          reference: 'SAP-UAT-DELIVERED-PRIORITY',
          priority: '2 - Moderate',
          remarks: 'Disposable UAT completed delivery for priority-lock and POD lightbox checks',
          status: 'ACCOMPLISHED',
          vehicle: 'Van-01 (L300)',
          area: 'Quezon City - Diliman',
          driver: profile.name,
          driverId: profile.id,
          accountManager: 'Demo Account',
          deliveryDate: date,
          category: 'DELIVERY',
          itemType: 'Small Item',
          itemDescription: 'Completed UAT delivery fixture',
          draft: false,
          timeIn: new Date(completedAt.getTime() - 15 * 60 * 1000).toISOString(),
          timeOut: completedAt.toISOString(),
          receivedBy: 'UAT Receiver',
          createdById: sales.id,
          modifiedById: logistics.id,
          podAttachments: {
            create: {
              originalName, storageKey, mimeType: 'image/png',
              size: buffer.length, uploadedById: driverUser.id,
            },
          },
        },
      });
    });
  } catch (error) {
    await podStorage.remove(storageKey).catch(cleanupError => {
      console.error('Could not clean up failed disposable UAT POD fixture', cleanupError);
    });
    throw error;
  }
}


export async function runUatSeed() {
  assertDisposableSeedTarget();
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
  await seedDeliveredPhotoFixture();

  return { userCount: Object.keys(users).length, driverRecords, completedFixtures: 1 };
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
