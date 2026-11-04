import { NextFunction, Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { CSRF_HEADER, csrfToken, readSession } from './auth';

// AUD-003. The production session cookie is SameSite=None so the portal works
// inside a Microsoft Teams tab, which means the browser attaches it to
// cross-site requests. Two checks run on every state-changing API request
// before any route handler: the request must come from an approved origin, and
// a cookie-authenticated request must also carry the session's CSRF token.
// CORS is not part of this defence.

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Tells the client which check failed without it parsing the error body.
export const CSRF_ERROR_HEADER = 'X-CSRF-Error';

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Origins allowed to send writes: the frontend origin(s) the deployment is
// configured with. TRUSTED_ORIGINS is a comma-separated list for extras.
export function trustedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const configured = [env.CLIENT_ORIGIN || 'http://localhost:3000', env.APP_URL, ...(env.TRUSTED_ORIGINS ?? '').split(',')];
  const origins = new Set<string>();
  for (const value of configured) {
    try {
      if (value?.trim()) origins.add(new URL(value.trim()).origin);
    } catch {
      console.warn('[security] Ignoring an invalid trusted origin in the environment');
    }
  }
  return origins;
}

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export function verifyRequestOrigin(origins: Set<string> = trustedOrigins()) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!UNSAFE_METHODS.has(req.method)) return next();
    const site = req.get('sec-fetch-site');
    const origin = req.get('origin');
    // Browsers set Sec-Fetch-Site themselves; page script cannot forge it.
    if (site === 'same-origin') return next();
    // Older browsers send only Origin. It must be an approved frontend, or the
    // host this request was addressed to (frontend served by this server).
    if (origin && (origins.has(origin) || hostOf(origin) === req.get('host'))) return next();
    // Neither header: not a browser, so there is no ambient cookie to abuse.
    // A request that does carry a session still needs the token below.
    if (!origin && !site) return next();
    res.setHeader(CSRF_ERROR_HEADER, 'origin');
    res.status(403).json({ error: 'Cross-site request blocked' });
  };
}

// Reachable before a session exists or to end one, so no token can be
// required. The origin check above still applies to them.
const TOKEN_EXEMPT_PATHS = new Set(['/auth/login', '/auth/logout', '/auth/microsoft']);

// Mount under /api/v1: paths are compared relative to that prefix.
export function verifyCsrfToken(req: Request, res: Response, next: NextFunction) {
  if (!UNSAFE_METHODS.has(req.method) || TOKEN_EXEMPT_PATHS.has(req.path)) return next();
  const session = readSession(req);
  // No valid session means no authority to abuse; requireAuth answers 401.
  if (!session) return next();
  if (safeEqual(req.get(CSRF_HEADER) ?? '', csrfToken(session))) return next();
  res.setHeader(CSRF_ERROR_HEADER, 'token');
  res.status(403).json({ error: 'Security token missing or expired. Refresh the page and try again.' });
}
