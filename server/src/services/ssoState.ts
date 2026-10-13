import crypto from 'crypto';

// A short-lived, unpredictable, browser-bound CSRF nonce for Entra redirect login.
// No state values, authorization codes, or session tokens should be logged.
export const SSO_STATE_COOKIE = 'mg_sso_state';
export const SSO_STATE_MAX_AGE_MS = 5 * 60 * 1000;

export function createSsoState(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function validateSsoState(received: unknown, stored: unknown): boolean {
  if (typeof received !== 'string' || typeof stored !== 'string') return false;
  if (!/^[a-f0-9]{64}$/.test(received) || !/^[a-f0-9]{64}$/.test(stored)) return false;
  const a = Buffer.from(received, 'hex');
  const b = Buffer.from(stored, 'hex');
  return crypto.timingSafeEqual(a, b);
}
