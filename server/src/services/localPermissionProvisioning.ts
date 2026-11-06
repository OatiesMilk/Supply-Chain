/** Explicit operator entry point for an existing local development database.
 * Kept separate from the disposable-only migration/backfill command. */
export function localPermissionProvisioningTarget(env: NodeJS.ProcessEnv = process.env) {
  let url: URL;
  try { url = new URL(env.DATABASE_URL ?? ''); } catch { throw new Error('Local permission provisioning requires an explicit DATABASE_URL'); }
  let database: string;
  try { database = decodeURIComponent(url.pathname.slice(1)); } catch { throw new Error('Invalid local permission provisioning database'); }
  const deployed = ['CI', 'RENDER', 'RENDER_SERVICE_ID', 'RAILWAY_ENVIRONMENT', 'VERCEL', 'FLY_APP_NAME', 'K_SERVICE', 'HEROKU_APP_NAME'].some(key => Boolean(env[key]));
  const safeQuery = [...url.searchParams].every(([key, value]) => key === 'schema' && value === 'public');
  if (deployed || env.NODE_ENV !== 'development' || env.APP_ENV && env.APP_ENV !== 'development'
    || !['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || !/^[a-zA-Z0-9_]+$/.test(database) || env.PERMISSION_PROVISION_DATABASE !== database || !safeQuery || url.hash) {
    throw new Error('Permission provisioning requires an explicitly confirmed local development database');
  }
  const actorId = env.PERMISSION_PROVISION_ACTOR_ID?.trim();
  if (!actorId) throw new Error('PERMISSION_PROVISION_ACTOR_ID must identify the active Admin operator');
  return { connectionString: env.DATABASE_URL!, actorId };
}
