import { prisma } from '../src/db';
import { planHistoricalDrivers } from '../src/services/historicalDrivers';
import { lockDriverDirectory } from '../src/services/driverDirectory';

async function main() {
  const apply = process.argv.includes('--apply');
  const entries = await prisma.$transaction(async tx => {
    if (apply) await lockDriverDirectory(tx);
    const managed = await tx.driver.findMany({ select: { name: true, type: true } });
    const records = await tx.deliveryRecord.findMany({ select: { driver: true, driverAssistants: true } });
    const planned = planHistoricalDrivers(managed, records);
    if (apply && planned.length) await tx.driver.createMany({ data: planned });
    return planned;
  });
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'preview', count: entries.length, entries }, null, 2));
  if (!apply) console.log('Use --apply to import these entries as inactive. Activate reviewed entries through Driver Manager.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
