import { prisma } from '../db';
import { STATUS_TO_DB } from '../mappings';
import { manilaToday, runState } from './deliveryLifecycle';

export async function saveDailyStatusSnapshot() {
  const date = manilaToday();
  const records = await prisma.deliveryRecord.findMany({
    where: { deletedAt: null },
    select: { category: true, isInternalTransfer: true, status: true, draft: true, timeIn: true },
  });
  const counts = new Map<string, { date: string; category: string; status: string; count: number }>();
  for (const record of records) {
    const state = runState(record);
    const status = state === 'Draft' ? 'DRAFT' : STATUS_TO_DB[state] ?? record.status;
    // Non-RMA internal transfers get their own bucket so RMA history stays RMA-only.
    const bucket = record.category === 'RMA' && record.isInternalTransfer ? 'INTERNAL_TRANSFER' : record.category;
    for (const category of [bucket, 'ALL']) {
      const key = `${category}::${status}`;
      const row = counts.get(key) ?? { date, category, status, count: 0 };
      row.count++;
      counts.set(key, row);
    }
  }
  // Replace today's rollup atomically so a status that falls to zero cannot
  // leave an old nonzero count behind on the next boot or scheduled run.
  await prisma.$transaction([
    prisma.dailyStatusSnapshot.deleteMany({ where: { date } }),
    prisma.dailyStatusSnapshot.createMany({ data: [...counts.values()] }),
  ]);
}
