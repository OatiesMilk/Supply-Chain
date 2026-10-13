import type { Express } from 'express';
import helmet from 'helmet';
import { verifyCsrfToken, verifyRequestOrigin } from './csrf';
import { createRateLimiters, RATE_LIMITS, type RateLimitSettings } from './rateLimits';

// Hosts allowed to embed the portal: itself and the Microsoft Teams clients
// (personal tab, teams/manifest.json). X-Frame-Options cannot express an
// allow-list, so framing is governed by frame-ancestors alone.
const FRAME_ANCESTORS = [
  "'self'",
  'https://teams.microsoft.com',
  'https://*.teams.microsoft.com',
  'https://teams.cloud.microsoft',
  'https://*.skype.com',
];

// The built frontend loads only its own bundled assets. Inline styles are
// allowed because UI libraries inject style elements at runtime; inline
// scripts are not. worker.js sends the same policy with the HTML it serves.
export const CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'"],
  'frame-src': ["'self'", 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': FRAME_ANCESTORS,
};

export const CONTENT_SECURITY_POLICY = Object.entries(CSP_DIRECTIVES)
  .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
  .join(';');

export const securityHeaders = helmet({
  contentSecurityPolicy: { useDefaults: false, directives: CSP_DIRECTIVES },
  frameguard: false,
  // The Microsoft sign-in may run in a pop-up that must reach its opener.
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
});

// AUD-003: response headers, CSRF checks and rate limits for the whole API.
// Call once, after the body and cookie parsers and before any route, so a
// rejected request never reaches a handler.
export function applySecurity(app: Express, settings: RateLimitSettings = RATE_LIMITS) {
  // Hops of trusted reverse proxy in front of Express, when it is not behind
  // the Worker's shared-secret headers. Unset means trust none.
  const trustedHops = Number(process.env.TRUST_PROXY);
  if (Number.isInteger(trustedHops) && trustedHops > 0) app.set('trust proxy', trustedHops);
  else if (process.env.NODE_ENV === 'production' && !process.env.PROXY_SHARED_SECRET) {
    console.warn('[security] Neither PROXY_SHARED_SECRET nor TRUST_PROXY is set: per-address rate limits will count every visitor behind the proxy as one client.');
  }

  const limits = createRateLimiters(settings);

  app.use(securityHeaders);
  // CSRF checks come first so forged requests cannot spend the victim's limits.
  app.use('/api', verifyRequestOrigin(), verifyCsrfToken);
  app.use('/api', limits.api);
  app.post('/api/auth/login', limits.loginPerIp, limits.loginPerAccount);
  app.use('/api/auth/microsoft', limits.microsoftAuth);
  app.post(['/api/notifications/send-email', '/api/admin/test-email'], limits.mail);
  app.post('/api/records/:id/attachments', limits.upload);
}
