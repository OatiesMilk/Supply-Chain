import { prisma } from '../src/db';
import { seedAccounts } from './seeds/accounts';

async function main() {
  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!adminUser) {
    console.error('Error: No ADMIN user found in the database. You must seed users first.');
    process.exit(1);
  }

  await seedAccounts(adminUser.id);
  console.log('Accounts (Companies, Customers, Suppliers) seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
