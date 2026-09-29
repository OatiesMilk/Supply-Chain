// Request failures prompt a health check; they do not prove the whole server is down.
export const SERVER_CHECK_EVENT = 'server-check-requested';

export function requestServerCheck() {
  window.dispatchEvent(new Event(SERVER_CHECK_EVENT));
}

export async function checkServerHealth(signal: AbortSignal): Promise<boolean> {
  const response = await fetch('/api/health', {
    credentials: 'include',
    cache: 'no-store',
    signal,
  });
  if (!response.ok) return false;
  const body = await response.json();
  return body?.ok === true;
}
