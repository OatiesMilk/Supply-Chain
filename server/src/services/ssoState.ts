import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

// Server-held state is stored as SHA-256 only. The raw nonce is browser-bound
// and expires separately as a short-lived, httpOnly cookie.
export const SSO_STATE_COOKIE = 'mg_sso_state';
export const SSO_STATE_MAX_AGE_MS = 5 * 60 * 1000;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATE = /^[a-f0-9]{64}$/;

export function isMicrosoftGuid(value: unknown): value is string {
  return typeof value === 'string' && GUID.test(value);
}

export function createSsoState(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function validateSsoState(received: unknown, stored: unknown): received is string {
  if (typeof received !== 'string' || typeof stored !== 'string') return false;
  if (!STATE.test(received) || !STATE.test(stored)) return false;
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(stored, 'hex'));
}

export function stateDigest(state: string): string {
  return crypto.createHash('sha256').update(state).digest('hex');
}

// Explicit tenant GUID is required in EVERY environment: 'common',
// 'organizations', 'consumers' and guessed tenant IDs are not safe defaults.
// App URL must be one clean origin; require HTTPS except loopback development.
export function getMsalConfig(env: NodeJS.ProcessEnv = process.env) {
  const clientId = env.AZURE_CLIENT_ID;
  const clientSecret = env.AZURE_CLIENT_SECRET;
  const tenantId = env.AZURE_TENANT_ID?.trim();
  if (!clientId || !clientSecret || !isMicrosoftGuid(tenantId)) return null;
  const rawUrl = env.APP_URL || (env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');
  try {
    const app = new URL(rawUrl);
    if (app.username || app.password || app.search || app.hash || app.pathname !== '/') return null;
    if (app.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && app.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(app.hostname))) return null;
    return { clientId, clientSecret, tenantId: tenantId.toLowerCase(), appUrl: app.origin };
  } catch {
    return null;
  }
}

type StateStorage = Pick<PrismaClient, 'oAuthLoginState'>;

// Expired state rows are pruned at initiation; no scheduled job is required.
export async function registerSsoState(db: StateStorage, state: string, now: Date = new Date()): Promise<void> {
  if (!STATE.test(state)) throw new Error('Invalid generated SSO state');
  await db.oAuthLoginState.deleteMany({ where: { expiresAt: { lte: now } } });
  await db.oAuthLoginState.create({
    data: { id: stateDigest(state), expiresAt: new Date(now.getTime() + SSO_STATE_MAX_AGE_MS) }
  });
}

// Atomic conditional delete enforces single-use across *all* API replicas.
// A replay/expired state cannot reach Microsoft's token endpoint.
export async function consumeSsoState(db: StateStorage, state: string, now: Date = new Date()): Promise<boolean> {
  if (!STATE.test(state)) return false;
  const result = await db.oAuthLoginState.deleteMany({
    where: { id: stateDigest(state), expiresAt: { gt: now } }
  });
  return result.count === 1;
}
