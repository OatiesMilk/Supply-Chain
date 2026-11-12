export const DATE_RANGE_ERROR = 'Date To cannot be earlier than Date From.';

/**
 * Derives display/applied state for a date-range pair.
 *
 * @param enforceChronology - When true (default), an invalid range (dateTo < dateFrom)
 *   produces an error message and suppresses both halves from being applied. Pass false
 *   only when you deliberately want to allow inverted ranges (legacy opt-out).
 */
export function dateRangeState(dateFrom: string, dateTo: string, enforceChronology: boolean = true) {
  const error = enforceChronology && dateFrom !== '' && dateTo !== '' && dateTo < dateFrom
    ? DATE_RANGE_ERROR
    : null;

  return {
    error,
    dateToMin: enforceChronology && dateFrom ? dateFrom : undefined,
    appliedDateFrom: error ? '' : dateFrom,
    appliedDateTo: error ? '' : dateTo,
  };
}

/**
 * Returns updated dateFrom/dateTo values after the user changes Date From.
 * When enforceChronology is true, a dateTo that would now precede the new
 * dateFrom is cleared so the pair is always valid.
 */
export function dateRangeAfterFromChange(
  nextDateFrom: string,
  currentDateTo: string,
  enforceChronology: boolean = true,
) {
  return {
    dateFrom: nextDateFrom,
    dateTo: enforceChronology && nextDateFrom !== '' && currentDateTo !== '' && currentDateTo < nextDateFrom
      ? ''
      : currentDateTo,
  };
}
