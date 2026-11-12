// Request failures prompt a health check; they do not prove the whole server is down.
export const SERVER_CHECK_EVENT = 'server-check-requested';

const API_BASE = typeof import.meta.env === 'object'
  ? import.meta.env.VITE_API_BASE_URL || ''
  : '';

export function requestServerCheck() {
  window.dispatchEvent(new Event(SERVER_CHECK_EVENT));
}

export async function checkServerHealth(signal: AbortSignal): Promise<boolean> {
  const response = await fetch(`${API_BASE}/api/v1/health`, {
    credentials: 'include',
    cache: 'no-store',
    signal,
  });
  if (!response.ok) return false;
  const body = await response.json();
  return body?.ok === true;
}
