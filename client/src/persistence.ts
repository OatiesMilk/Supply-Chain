// Prototype persistence: keeps record edits, status changes, and Output
// Actions config across page reloads via localStorage. This is a demo-only
// substitute for a real backend - there is no server, no multi-user sync.
const STORAGE_PREFIX = 'mg_portal_v1_';

export function loadState<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveState<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // localStorage unavailable or full - fail silently, data just won't persist
  }
}

export function clearPersistedState(): void {
  try {
    Object.keys(window.localStorage)
      .filter(k => k.startsWith(STORAGE_PREFIX))
      .forEach(k => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
