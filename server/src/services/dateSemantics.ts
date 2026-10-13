import { isValidDateOnly, manilaToday } from './deliveryLifecycle';

export const MANILA_TIME_ZONE = 'Asia/Manila';

const manilaDateTime = new Intl.DateTimeFormat('en-CA', {
  timeZone: MANILA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function nextDateOnly(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/** Convert Manila midnight for a validated calendar date into its UTC instant. */
export function manilaStartOfDay(date: string): Date {
  if (!isValidDateOnly(date)) throw new Error('date must be a valid YYYY-MM-DD value');

  const [year, month, day] = date.split('-').map(Number);
  const targetLocalAsUtc = Date.UTC(year, month - 1, day);
  let instant = targetLocalAsUtc;

  // Reconcile the requested wall-clock fields against the IANA zone offset.
  // Repeating handles an offset transition at the candidate instant.
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(manilaDateTime.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
    const localAsUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    const correction = targetLocalAsUtc - localAsUtc;
    instant += correction;
    if (correction === 0) break;
  }

  return new Date(instant);
}

export interface ManilaDateRange {
  gte?: Date;
  lt?: Date;
}

export function manilaDateRange(from?: string, to?: string): ManilaDateRange {
  if (from && !isValidDateOnly(from)) throw new Error('dateFrom must be a valid YYYY-MM-DD value');
  if (to && !isValidDateOnly(to)) throw new Error('dateTo must be a valid YYYY-MM-DD value');
  if (from && to && from > to) throw new Error('dateFrom must be on or before dateTo');

  return {
    ...(from ? { gte: manilaStartOfDay(from) } : {}),
    ...(to ? { lt: manilaStartOfDay(nextDateOnly(to)) } : {}),
  };
}

export function manilaTodayRange(now = new Date()): { start: Date; end: Date; dateStr: string } {
  const dateStr = manilaToday(now);
  return {
    start: manilaStartOfDay(dateStr),
    end: manilaStartOfDay(nextDateOnly(dateStr)),
    dateStr,
  };
}

export function manilaWeekStart(date: string): Date {
  if (!isValidDateOnly(date)) throw new Error('date must be a valid YYYY-MM-DD value');
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const sunday = new Date(Date.UTC(year, month - 1, day - weekday)).toISOString().slice(0, 10);
  return manilaStartOfDay(sunday);
}
