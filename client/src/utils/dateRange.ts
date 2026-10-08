export const DATE_RANGE_ERROR = 'Date To cannot be earlier than Date From.';

export function dateRangeState(dateFrom: string, dateTo: string, enforceChronology: boolean) {
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

export function dateRangeAfterFromChange(
  nextDateFrom: string,
  currentDateTo: string,
  enforceChronology: boolean,
) {
  return {
    dateFrom: nextDateFrom,
    dateTo: enforceChronology && nextDateFrom !== '' && currentDateTo !== '' && currentDateTo < nextDateFrom
      ? ''
      : currentDateTo,
  };
}
