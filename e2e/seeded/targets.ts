export function seededTargets() {
  const base = new URL(process.env.BASE_URL || 'http://localhost:3000');
  const api = new URL(process.env.API_BASE_URL || `${base.origin}/api`);
  for (const url of [base, api]) {
    if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.search || url.hash) {
      throw new Error('Seeded E2E requires loopback HTTP(S) BASE_URL/API_BASE_URL without credentials, query or fragment.');
    }
  }
  if (base.pathname !== '/' || api.pathname.replace(/\/$/, '') !== '/api' || base.hostname !== api.hostname) {
    throw new Error('BASE_URL must be an origin; API_BASE_URL must end in /api on the same hostname so session cookies reach the UI.');
  }
  return { baseURL: base.origin, apiURL: api.href.replace(/\/$/, '') };
}
export const apiUrl = (path: string) => `${seededTargets().apiURL}${path}`;
