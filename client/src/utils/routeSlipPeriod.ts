export type RouteSlipPeriodMode = 'day' | 'from' | 'range';

export interface RouteSlipPeriodSelection {
  mode: RouteSlipPeriodMode;
  dateFrom: string;
  dateTo: string;
}

export interface RouteSlipPeriod {
  dateFrom: string;
  /** Empty or omitted means every scheduled delivery date from dateFrom onward. */
  dateTo?: string;
}

export function isRouteSlipDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function routeSlipPeriodError(period: RouteSlipPeriod): string | null {
  if (!period.dateFrom) return 'Choose a day or a From date for the route slip.';
  if (!isRouteSlipDay(period.dateFrom)) return 'Enter a valid From date.';
  if (period.dateTo && !isRouteSlipDay(period.dateTo)) return 'Enter a valid To date.';
  if (period.dateTo && period.dateTo < period.dateFrom) return 'To cannot be earlier than From.';
  return null;
}

export function routeSlipSelectionError(selection: RouteSlipPeriodSelection): string | null {
  if (selection.mode === 'range' && !selection.dateTo) return 'Choose both From and To dates for a date range.';
  return routeSlipPeriodError(routeSlipPeriod(selection));
}

export function routeSlipPeriod(selection: RouteSlipPeriodSelection): RouteSlipPeriod {
  return {
    dateFrom: selection.dateFrom,
    dateTo: selection.mode === 'day' ? selection.dateFrom : selection.mode === 'from' ? '' : selection.dateTo,
  };
}

export function routeSlipModeForDates(from: string, to: string): RouteSlipPeriodMode {
  return to ? (from === to ? 'day' : 'range') : from ? 'from' : 'day';
}

export function routeSlipPeriodLabel(period: RouteSlipPeriod): string {
  const error = routeSlipPeriodError(period);
  if (error) throw new Error(error);
  // Calendar dates stay as dates, regardless of the browser's timezone.
  const format = (day: string) => new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
  if (!period.dateTo) return `From ${format(period.dateFrom)} onward`;
  if (period.dateFrom === period.dateTo) return format(period.dateFrom);
  return `${format(period.dateFrom)} – ${format(period.dateTo)}`;
}

export function filterRouteSlipRecords<T extends { delivery_date?: string | null }>(records: T[], period: RouteSlipPeriod): T[] {
  const error = routeSlipPeriodError(period);
  if (error) throw new Error(error);
  return records.filter(record => isRouteSlipDay(record.delivery_date) &&
    record.delivery_date >= period.dateFrom && (!period.dateTo || record.delivery_date <= period.dateTo));
}

export function routeSlipDriverNames(records: { driver?: string | null }[]): string[] {
  return [...new Set(records.map(record => record.driver?.trim()).filter((name): name is string =>
    Boolean(name) && name!.toLowerCase() !== 'unassigned'))].sort((a, b) => a.localeCompare(b));
}
