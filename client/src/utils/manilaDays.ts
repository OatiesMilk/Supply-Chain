const MANILA = 'Asia/Manila';
export const AGE_WARNING_DAYS = 4;
export const AGE_CRITICAL_DAYS = 7;

/** Manila calendar date (YYYY-MM-DD) of a moment, or null when it is not a valid date. */
function manilaDate(value: Date): string | null {
  if (!Number.isFinite(value.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: MANILA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}
const epochDay = (isoDate: string) => Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000);

/**
 * Whole Manila calendar days from `value` to `now`. A record submitted at 23:59
 * is 1 day old a minute later. Returns null for a missing or invalid timestamp,
 * and never goes below 0.
 */
export function manilaDaysSince(value: string | null | undefined, now: Date = new Date()): number | null {
  if (!value) return null;
  const then = manilaDate(new Date(value));
  const today = manilaDate(now);
  if (!then || !today) return null;
  return Math.max(0, epochDay(today) - epochDay(then));
}

export type AgeTone = 'normal' | 'warning' | 'critical';
/** Amber at 4 to 7 days, red above 7 days. */
export function ageTone(days: number): AgeTone {
  if (days > AGE_CRITICAL_DAYS) return 'critical';
  if (days >= AGE_WARNING_DAYS) return 'warning';
  return 'normal';
}
