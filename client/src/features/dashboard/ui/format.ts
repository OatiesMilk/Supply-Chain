const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('en');

/** 999 stays 999; 1234 becomes 1.2K. */
export function formatCompact(value: number): string {
  return Math.abs(value) > 999 ? compact.format(value) : String(value);
}
export const formatFull = (value: number): string => full.format(value);

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
/** "2026-07-12" becomes "Jul 12, 2026". Anything that is not a plain date is returned as is, or "Not set" when empty. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}
