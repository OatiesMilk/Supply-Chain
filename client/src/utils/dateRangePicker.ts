export type CalendarRange = { from: string; to: string };

export function calendarDate(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

export function calendarDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(day: string, amount: number): string {
  const date = calendarDate(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return calendarDay(date);
}

export function monthStart(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** Clamp month/year navigation to the last day of the destination month. */
export function addCalendarMonths(day: string, amount: number): string {
  const date = calendarDate(monthStart(day));
  date.setUTCMonth(date.getUTCMonth() + amount);
  const last = new Date(date);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(Number(day.slice(8)), last.getUTCDate()));
  return calendarDay(date);
}

export function orderedCalendarRange(first: string, last: string): CalendarRange {
  return first <= last ? { from: first, to: last } : { from: last, to: first };
}

/** Six stable calendar rows; other months are blank to avoid duplicate dates. */
export function calendarCells(month: string): string[][] {
  const first = monthStart(month);
  const offset = calendarDate(first).getUTCDay();
  const count = Number(addCalendarDays(addCalendarMonths(first, 1), -1).slice(8));
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= count ? `${first.slice(0, 8)}${String(day).padStart(2, '0')}` : '';
  });
  return Array.from({ length: 6 }, (_, row) => cells.slice(row * 7, row * 7 + 7));
}

export function calendarKeyboardDay(day: string, key: string, shift = false): string | null {
  switch (key) {
    case 'ArrowLeft': return addCalendarDays(day, -1);
    case 'ArrowRight': return addCalendarDays(day, 1);
    case 'ArrowUp': return addCalendarDays(day, -7);
    case 'ArrowDown': return addCalendarDays(day, 7);
    case 'Home': return addCalendarDays(day, -calendarDate(day).getUTCDay());
    case 'End': return addCalendarDays(day, 6 - calendarDate(day).getUTCDay());
    case 'PageUp': return addCalendarMonths(day, shift ? -12 : -1);
    case 'PageDown': return addCalendarMonths(day, shift ? 12 : 1);
    default: return null;
  }
}

export function formatCalendarDay(day: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(calendarDate(day));
}

export function formatCalendarRange(from: string, to: string): string {
  if (from && to) return from === to ? formatCalendarDay(from) : `${formatCalendarDay(from)} – ${formatCalendarDay(to)}`;
  if (from) return `From ${formatCalendarDay(from)}`;
  if (to) return `Through ${formatCalendarDay(to)}`;
  return 'All delivery dates';
}

export function calendarPresets(today: string) {
  return [
    { label: 'Today', ...orderedCalendarRange(today, today) },
    { label: 'Last 7 days', ...orderedCalendarRange(addCalendarDays(today, -6), today) },
    { label: 'This month', from: monthStart(today), to: addCalendarDays(addCalendarMonths(monthStart(today), 1), -1) },
  ];
}
