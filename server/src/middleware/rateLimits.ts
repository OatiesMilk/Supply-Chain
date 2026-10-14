import { Request } from 'express';
import { isIP } from 'node:net';
import { rateLimit, ipKeyGenerator, type Options } from 'express-rate-limit';
import { readSession } from './auth';
import { safeEqual } from './csrf';

// AUD-003 request throttling. Counters live in this process's memory: the API
// runs as one Render instance (its persistent disk rules out scaling out), so
// they are consistent across requests and simply reset when it restarts. Move
// to a shared store before running more than one instance.

const MINUTE = 60 * 1000;

export const RATE_LIMITS = {
  // Failed sign-ins only; successful ones are not counted.
  loginPerAccount: { windowMs: 15 * MINUTE, limit: 5 },
  loginPerIp: { windowMs: 15 * MINUTE, limit: 20 },
  microsoftAuth: { windowMs: 15 * MINUTE, limit: 60 },
  mail: { windowMs: MINUTE, limit: 10 },
  upload: { windowMs: 10 * MINUTE, limit: 30 },
  api: { windowMs: MINUTE, limit: 600 },
};
export type RateLimitSettings = typeof RATE_LIMITS;

// Headers the Cloudflare Worker sets when it proxies /api (see worker.js).
export const PROXY_SECRET_HEADER = 'x-mg-proxy-secret';
export const PROXY_CLIENT_IP_HEADER = 'x-mg-client-ip';

// The caller's address. A forwarded address is believed only when it arrives
// with the secret shared with our own proxy; otherwise anyone reaching the API
// directly could pick the address they are counted under. Without the secret
// this is the socket peer, or Express's proxy-aware value when TRUST_PROXY is set.
export type ClientAddressSource = 'worker-proxy' | 'trusted-proxy' | 'socket';

// TRUST_PROXY as a hop count; 0 when unset or not a positive whole number.
export function trustedProxyHops(env: NodeJS.ProcessEnv = process.env): number {
  const hops = Number(env.TRUST_PROXY);
  return Number.isInteger(hops) && hops > 0 ? hops : 0;
}

export function clientAddress(req: Request, env: NodeJS.ProcessEnv = process.env): { ip: string; source: ClientAddressSource } {
  const secret = env.PROXY_SHARED_SECRET;
  if (secret && safeEqual(req.get(PROXY_SECRET_HEADER) ?? '', secret)) {
    const forwarded = req.get(PROXY_CLIENT_IP_HEADER) ?? '';
    if (isIP(forwarded)) return { ip: forwarded, source: 'worker-proxy' };
  }
  return {
    ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
    source: trustedProxyHops(env) > 0 ? 'trusted-proxy' : 'socket',
  };
}

export function clientIp(req: Request, env: NodeJS.ProcessEnv = process.env): string {
  return clientAddress(req, env).ip;
}

const ipKey = (req: Request) => `ip:${ipKeyGenerator(clientIp(req))}`;

// Signed-in callers are counted per account, so colleagues behind one office
// address do not share a budget.
const userKey = (req: Request) => {
  const session = readSession(req);
  return session ? `user:${session.id}` : ipKey(req);
};

function limiter(settings: { windowMs: number; limit: number }, options: Partial<Options>) {
  return rateLimit({
    ...settings,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // The client address is resolved by clientIp above, not from this header.
    validate: { xForwardedForHeader: false },
    message: { error: 'Too many requests. Please wait and try again.' },
    ...options,
  });
}

export function createRateLimiters(settings: RateLimitSettings = RATE_LIMITS) {
  return {
    loginPerAccount: limiter(settings.loginPerAccount, {
      skipSuccessfulRequests: true,
      keyGenerator: req => `${ipKey(req)}|${String(req.body?.email ?? '').trim().toLowerCase()}`,
    }),
    loginPerIp: limiter(settings.loginPerIp, { skipSuccessfulRequests: true, keyGenerator: ipKey }),
    microsoftAuth: limiter(settings.microsoftAuth, { keyGenerator: ipKey }),
    mail: limiter(settings.mail, { keyGenerator: userKey }),
    upload: limiter(settings.upload, { keyGenerator: userKey }),
    // Render and the self-ping poll /health; throttling it would fail deploys.
    api: limiter(settings.api, { keyGenerator: userKey, skip: req => req.path === '/health' }),
  };
}
