/** Separate from destructive demo seeding: deployed staging keeps production mode. */
export class StagingSeedError extends Error {}

export function assertStagingSeedTarget(env: NodeJS.ProcessEnv = process.env, options: { apply?: boolean; reset?: boolean } = {}): { database: string; adminEmail: string } {
  if (env.APP_ENV !== 'staging') throw new StagingSeedError('Staging seed refused: APP_ENV must explicitly be staging.');
  let url: URL;
  try { url = new URL(env.DATABASE_URL || ''); }
  catch { throw new StagingSeedError('Staging seed refused: invalid DATABASE_URL.'); }
  let database: string;
  try { database = decodeURIComponent(url.pathname.replace(/^\//, '')); }
  catch { throw new StagingSeedError('Staging seed refused: invalid database name.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
      !/^[A-Za-z0-9_]+_staging$/.test(database) || env.STAGING_SEED_DATABASE !== database) {
    throw new StagingSeedError('Staging seed refused: confirm the exact PostgreSQL *_staging database with STAGING_SEED_DATABASE.');
  }
  if (env.STAGING_SEED_HOST !== url.hostname) {
    throw new StagingSeedError('Staging seed refused: confirm the exact database hostname with STAGING_SEED_HOST.');
  }
  if (options.apply === true && env.STAGING_SEED_DATA_APPROVED !== 'true') {
    throw new StagingSeedError('Staging seed refused: applying source data requires STAGING_SEED_DATA_APPROVED=true after data-owner approval.');
  }
  if (options.apply === true && options.reset === true && env.STAGING_SEED_ALLOW_RESET !== 'true') {
    throw new StagingSeedError('Staging seed refused: resetting operational data requires STAGING_SEED_ALLOW_RESET=true.');
  }
  const adminEmail = env.STAGING_SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail || !/^[^\s@]+@[^\s@]+$/.test(adminEmail)) {
    throw new StagingSeedError('Staging seed refused: STAGING_SEED_ADMIN_EMAIL must select an existing active Admin.');
  }
  return { database, adminEmail };
}
