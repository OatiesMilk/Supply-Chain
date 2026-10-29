import { prisma } from '../src/db';
import { provisionRmaDispatchPermissions } from '../src/services/rmaDispatchPermissions';

const actorId = process.env.RMA_DISPATCH_ADMIN_ID;
provisionRmaDispatchPermissions(prisma, actorId).then(result => {
  console.log(JSON.stringify(result));
  if (result.skipped.length) process.exitCode = 1;
}).finally(() => prisma.$disconnect()).catch(() => {
  console.error('RMA dispatch activation failed. Identify an active Admin and review the target policy revisions.');
  process.exitCode = 1;
});
