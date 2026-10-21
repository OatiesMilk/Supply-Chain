/** Stable date ordering for the unpaged fallback and generated exports.
 * The server applies the same modes to the entire permission-scoped dataset
 * before choosing any page; do not sort server-paged rows again in the UI.
 * Date-only strings represent calendar days, not browser-local timestamps.
 */
export type DeliveryDateSort = 'default' | 'nearest' | 'oldest' | 'furthest';

export function sortDeliveryRows<T extends { delivery_date?: string | null }>(
  rows: T[], mode: DeliveryDateSort, now = Date.now(),
): T[] {
  if (mode === 'default') return rows;
  const asTime = (day?: string | null): number | null => {
    if (!day) return null;
    const time = Date.parse(day + 'T12:00:00Z');
    return Number.isFinite(time) ? time : null;
  };
  return [...rows].sort((a, b) => {
    const da = asTime(a.delivery_date);
    const db = asTime(b.delivery_date);
    if (da === null) return db === null ? 0 : 1;
    if (db === null) return -1;
    if (mode === 'nearest') return Math.abs(da - now) - Math.abs(db - now);
    if (mode === 'oldest') return da - db;
    return db - da;
  });
}
