/** Local-only fixtures for the three-session RMA dispatch verification. */
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db';
import { initializePermissionFoundation } from '../src/services/permissionBackfill';
import { provisionRmaDispatchPermissions } from '../src/services/rmaDispatchPermissions';

const target = new URL(process.env.DATABASE_URL ?? 'invalid:');
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  || !/^sc255_[a-z0-9_]+_test$/.test(target.pathname.slice(1))
  || process.env.NODE_ENV !== 'test') {
  throw new Error('RMA browser fixtures require the designated local sc255_*_test database.');
}

async function seed() {
  const password = await bcrypt.hash('sc255-test-password', 4);
  const roles = ['ADMIN', 'TASS', 'LOGISTICS', 'DRIVER', 'DRIVER'] as const;
  for (const [index, role] of roles.entries()) {
    const id = `sc255-user-${index}`;
    await prisma.user.upsert({
      where: { id },
      create: { id, name: `RMA Test ${role} ${index}`, email: `sc255-${index}@example.test`, password, role },
      update: {},
    });
  }
  await initializePermissionFoundation(prisma, 'sc255-user-0');
  for (const index of [3, 4]) {
    const id = `sc255-driver-${index}`;
    await prisma.driver.upsert({
      where: { id },
      create: {
        id, name: `RMA Driver ${index}`, type: 'DRIVER', userId: `sc255-user-${index}`,
        coverageAreas: JSON.stringify(['Carmona']), createdBy: 'RMA Test Admin', modifiedBy: 'RMA Test Admin',
      },
      update: {},
    });
  }
  await prisma.driver.upsert({
    where: { id: 'sc255-assistant' },
    create: { id: 'sc255-assistant', name: 'RMA Test Assistant', type: 'ASSISTANT', createdBy: 'RMA Test Admin', modifiedBy: 'RMA Test Admin' },
    update: {},
  });
  await prisma.company.upsert({
    where: { id: 'sc255-company' },
    create: { id: 'sc255-company', name: 'RMA Dispatch Test Company', sapNumber: 'SC255', address: 'Carmona', contactPerson: 'Test Contact' },
    update: {},
  });
  const activation = await provisionRmaDispatchPermissions(prisma, 'sc255-user-0');
  if (activation.skipped.length) throw new Error('Review customized policies before running browser fixtures.');
  console.log('Local RMA browser fixtures ready.');
}

seed().finally(() => prisma.$disconnect()).catch(() => {
  console.error('RMA fixture setup failed; verify the isolated local database and migrations.');
  process.exitCode = 1;
});
