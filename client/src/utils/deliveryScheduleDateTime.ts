export function deliveryDateFromDateTime(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2})?$/.exec(value);
  return match?.[1] ?? null;
}

export function syncDateTimeToDeliveryDate(dateTime: string, deliveryDate: string): string {
  if (!dateTime || !deliveryDate) return dateTime;
  const separator = dateTime.indexOf('T');
  if (separator < 0) return dateTime;
  return `${deliveryDate}${dateTime.slice(separator)}`;
}
