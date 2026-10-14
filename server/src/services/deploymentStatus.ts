import type { Request } from 'express';
import { sessionCookieOptions } from '../middleware/auth';
import { trustedOrigins } from '../middleware/csrf';
import { clientAddress, trustedProxyHops } from '../middleware/rateLimits';
import { podStorageStatus, type PodStorageStatus } from './podStorage';

// What the running process is actually connected to, for the Admin deployment
// check. A healthy /api/health proves the service works, not that it points at
// the intended database, file store or frontend. Everything returned here is an
// identity (host, name, origin) or a yes/no flag: no credential, connection
// string, user name or secret value ever leaves this module.

// Settings whose presence matters for a deployment review. Only whether each
// one is set is reported.
const REVIEWED_SETTINGS = [
  'DATABASE_URL', 'JWT_SECRET', 'CLIENT_ORIGIN', 'APP_URL', 'TRUSTED_ORIGINS',
  'PROXY_SHARED_SECRET', 'TRUST_PROXY', 'POD_STORAGE_PROVIDER', 'POD_UPLOAD_DIR',
  'SUPABASE_URL', 'SUPABASE_STORAGE_BUCKET', 'SUPABASE_SERVICE_ROLE_KEY', 'RENDER_EXTERNAL_URL',
] as const;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export type DatabaseIdentity = { host: string; port: string; database: string; loopback: boolean };

// Host, port and database name only. Null when unset or unreadable.
export function databaseIdentity(connectionString: string | undefined): DatabaseIdentity | null {
  if (!connectionString) return null;
  try {
    const url = new URL(connectionString);
    return {
      host: url.hostname,
      port: url.port || '5432',
      database: decodeURIComponent(url.pathname.replace(/^\//, '')),
      loopback: LOOPBACK_HOSTS.has(url.hostname),
    };
  } catch {
    return null;
  }
}

function findings(input: {
  production: boolean; database: DatabaseIdentity | null; storage: PodStorageStatus;
  secretConfigured: boolean; viaWorker: boolean; hops: number; env: NodeJS.ProcessEnv;
}): string[] {
  const { production, database, storage, secretConfigured, viaWorker, hops, env } = input;
  const warnings: string[] = [];

  if (!database) warnings.push('DATABASE_URL is missing or unreadable.');
  else if (production && database.loopback) warnings.push('DATABASE_URL points at this machine (localhost) in production.');

  if (production && !env.CLIENT_ORIGIN) warnings.push('CLIENT_ORIGIN is not set: writes are accepted only from http://localhost:3000.');

  if (secretConfigured && !viaWorker) {
    warnings.push('This request did not carry the Worker proxy secret. Either it bypassed the Worker, or the Worker secret is missing or differs from PROXY_SHARED_SECRET.');
  }
  if (production && !secretConfigured && hops === 0) {
    warnings.push('Neither PROXY_SHARED_SECRET nor TRUST_PROXY is set: signed-out visitors share one address for rate limits, so a few failed sign-ins can lock everyone out.');
  }

  if (storage.provider === 'local') {
    if (production) warnings.push('Uploads are stored on local disk. Files are lost on restart unless POD_UPLOAD_DIR is on a persistent disk.');
    if (!storage.writable && storage.exists) warnings.push('The upload folder is not writable.');
  } else {
    if (!storage.reachable) warnings.push(`The storage bucket could not be read: ${storage.error ?? 'unknown error'}.`);
    if (storage.public === true) warnings.push('The storage bucket is public. Proof-of-delivery files must stay in a private bucket.');
  }

  return warnings;
}

export async function deploymentStatus(req: Request, env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production';
  const database = databaseIdentity(env.DATABASE_URL);
  const storage = await podStorageStatus(env);
  const address = clientAddress(req, env);
  const secretConfigured = Boolean(env.PROXY_SHARED_SECRET);
  const viaWorker = address.source === 'worker-proxy';
  const hops = trustedProxyHops(env);
  const cookie = sessionCookieOptions(env);

  return {
    node_env: env.NODE_ENV || 'development',
    database,
    storage,
    origins: {
      cors: env.CLIENT_ORIGIN || 'http://localhost:3000',
      trusted_for_writes: [...trustedOrigins(env)].sort(),
    },
    session_cookie: { http_only: cookie.httpOnly, secure: cookie.secure, same_site: cookie.sameSite },
    proxy: {
      shared_secret_configured: secretConfigured,
      request_carried_valid_secret: viaWorker,
      trusted_proxy_hops: hops,
      // The address this request is rate-limited under, and how it was decided.
      client_address: address.ip,
      client_address_source: address.source,
    },
    settings_present: Object.fromEntries(REVIEWED_SETTINGS.map(name => [name, Boolean(env[name]?.trim())])),
    warnings: findings({ production, database, storage, secretConfigured, viaWorker, hops, env }),
  };
}
