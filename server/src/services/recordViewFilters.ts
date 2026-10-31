import type { Prisma } from '@prisma/client';
import { manilaToday } from './deliveryLifecycle';

export const RECORD_VIEWS = ['dispatch', 'runs', 'driver_dashboard'] as const;
export type RecordView = typeof RECORD_VIEWS[number];

/** These are read scopes only; action authorization still belongs to domain commands. */
export function runViewWhere(view: RecordView, queue?: 'active' | 'completed', today = manilaToday()): Prisma.DeliveryRecordWhereInput {
  const ordinary: Prisma.DeliveryRecordWhereInput = { category: { not: 'RMA' } };
  const rma: Prisma.DeliveryRecordWhereInput = { category: 'RMA', rmaMovement: 'LOGISTICS_TRANSPORT', status: { not: 'ACCOMPLISHED' } };
  const base: Prisma.DeliveryRecordWhereInput = { draft: false, OR: [ordinary, rma] };
  const active: Prisma.DeliveryRecordWhereInput = { OR: [
    { ...ordinary, status: { not: 'ACCOMPLISHED' } },
    { ...rma, rmaTransportStatus: { not: 'COMPLETED' } },
  ] };
  const completed: Prisma.DeliveryRecordWhereInput = { OR: [
    { ...ordinary, status: 'ACCOMPLISHED' },
    { ...rma, rmaTransportStatus: 'COMPLETED' },
  ] };
  if (view === 'dispatch') return { AND: [base, active] };
  if (view === 'runs') return { AND: [{ draft: false, OR: [ordinary, { ...rma, rmaTransportStatus: { not: 'COMPLETED' } }] }, ...(queue === 'active' ? [active] : queue === 'completed' ? [completed] : [])] };
  const nextDay = new Date(`${today}T00:00:00+08:00`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const doneToday: Prisma.DeliveryRecordWhereInput = { ...ordinary, status: 'ACCOMPLISHED', OR: [
    { timeOut: { gte: `${today}T00:00:00+08:00`, lt: nextDay.toISOString() } },
    { timeOut: null, deliveryDate: today },
  ] };
  // Stored clocks are canonical UTC strings. Compare against canonical UTC too.
  (doneToday.OR![0] as Prisma.DeliveryRecordWhereInput).timeOut = {
    gte: new Date(`${today}T00:00:00+08:00`).toISOString(), lt: nextDay.toISOString(),
  };
  const activeDue: Prisma.DeliveryRecordWhereInput = { ...ordinary, status: { not: 'ACCOMPLISHED' }, OR: [
    { deliveryDate: { gte: '0001-01-01', lte: today } }, { timeIn: { not: null } },
  ] };
  return { AND: [base, { OR: [rma, ...(queue !== 'completed' ? [activeDue] : []), ...(queue !== 'active' ? [doneToday] : [])] },
    ...(queue === 'active' ? [active] : queue === 'completed' ? [completed] : [])] };
}
