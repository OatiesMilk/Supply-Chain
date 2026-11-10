const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('en');

/** 999 stays 999; 1234 becomes 1.2K. */
export function formatCompact(value: number): string {
  return Math.abs(value) > 999 ? compact.format(value) : String(value);
}
export const formatFull = (value: number): string => full.format(value);
