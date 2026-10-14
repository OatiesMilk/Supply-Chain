const MANILA = 'Asia/Manila';

function timestampDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function formatManilaTime(value: string | null | undefined): string {
  const date = timestampDate(value);
  return date ? date.toLocaleTimeString('en-PH', {
    timeZone: MANILA, hour: '2-digit', minute: '2-digit', hour12: true,
  }) : '—';
}

export function formatManilaTimestamp(value: string | null | undefined): string {
  const date = timestampDate(value);
  return date ? date.toLocaleString('en-PH', {
    timeZone: MANILA, year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }) : '—';
}
