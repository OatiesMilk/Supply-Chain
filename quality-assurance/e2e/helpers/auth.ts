import { beforeEach } from 'node:test';
import { apiBase, assertWriteTarget, credentials, roleForEmail, evidence } from './runtime';

export interface UserSession {
  email: string;
  role: string;
  cookie: string;
  csrf: string;
  body: any;
}
const sessions = new Map<string, UserSession>();
let requestNumber = 0;
let testName = '';
beforeEach(context => { testName = context.name; });

export async function getSession(email: string, bypassCache = false): Promise<UserSession> {
  if (!bypassCache && sessions.has(email)) return sessions.get(email)!;
  const { password } = credentials(roleForEmail(email));
  const response = await fetch(`${apiBase()}/auth/login`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  if (response.status !== 200) throw new Error(`Blocked: QA login returned HTTP ${response.status}`);
  const cookieHeader = response.headers.get('set-cookie') ?? '';
  const cookie = cookieHeader.match(/(?:^|,\s*)(mg_session=[^;,\s]+)/)?.[1];
  const csrf = response.headers.get('x-csrf-token');
  if (!cookie || !csrf || !/httponly/i.test(cookieHeader)) throw new Error('Login must issue an HttpOnly session and CSRF header');
  const body = await response.json();
  const session = { email, role: body.role, cookie, csrf, body };
  sessions.set(email, session);
  return session;
}

export async function apiRequest(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', endpoint: string,
  session?: UserSession, body?: any, timeoutMs = 15000) {
  if (!endpoint.startsWith('/') || endpoint.startsWith('//') || endpoint.includes('://') || endpoint.includes('\\')) {
    throw new Error('Only relative QA API paths are permitted');
  }
  const base = apiBase();
  const url = new URL(base + endpoint);
  if (url.origin !== new URL(base).origin || !url.pathname.startsWith('/api/v1/')) throw new Error('API path escaped QA target');
  if (method !== 'GET' && url.pathname !== '/api/v1/auth/login') assertWriteTarget();
  const headers: Record<string, string> = {};
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (session?.cookie) headers.Cookie = session.cookie;
  if (session?.csrf && method !== 'GET') headers['X-CSRF-Token'] = session.csrf;
  const name = `${process.env.UAT_SUITE_ID ?? 'api'}-${++requestNumber}.json`;
  try {
    const res = await fetch(url, { method, redirect: 'error', headers,
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    const data = res.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text;
    // Login responses may contain session metadata. Never retain authentication responses.
    if (!url.pathname.startsWith('/api/v1/auth/')) evidence(name, { test: testName, method, endpoint, status: res.status, body: data });
    return { status: res.status, headers: res.headers, data };
  } catch (error) {
    evidence(name, { test: testName, method, endpoint, error: error instanceof Error ? error.name : 'RequestError' });
    throw new Error(`QA request failed (${error instanceof Error ? error.name : 'RequestError'}); see ${name}`);
  }
}
