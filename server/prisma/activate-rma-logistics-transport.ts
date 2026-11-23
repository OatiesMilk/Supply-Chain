import { prisma } from '../src/db';
import { provisionRmaLogisticsTransport, type RmaLogisticsTransportMode } from '../src/services/rmaDispatchPermissions';

// Dry run unless --apply or --revoke is given. Writes nothing in a dry run.
const args = process.argv.slice(2);
const mode: RmaLogisticsTransportMode = args.includes('--revoke') ? 'revoke' : args.includes('--apply') ? 'apply' : 'dry-run';
provisionRmaLogisticsTransport(prisma, process.env.RMA_DISPATCH_ADMIN_ID, mode).then(result => {
  console.log(JSON.stringify(result, null, 2));
  if (result.status === 'skipped') process.exitCode = 1;
}).finally(() => prisma.$disconnect()).catch(error => {
  console.error(`RMA Logistics transport switch failed: ${error instanceof Error ? error.message : 'unknown error'}. Identify an active Admin and review the Logistics policy revision.`);
  process.exitCode = 1;
});
