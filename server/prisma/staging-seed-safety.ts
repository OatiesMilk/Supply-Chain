/** Separate from destructive demo seeding: deployed staging keeps production mode. */
export class StagingSeedError extends Error {}

function assertSupabaseProject(url: URL, env: NodeJS.ProcessEnv) {
  // pg-connection-string lets query parameters override URL target fields.
  // Confirming the visible host/user must also confirm the connection it opens.
  if ([...url.searchParams.keys()].some(key => ['host', 'hostaddr', 'user', 'username', 'database', 'dbname', 'db', 'port'].includes(key.toLowerCase()))) {
    throw new StagingSeedError('Staging seed refused: database URL query parameters must not override the confirmed target.');
  }
  const ref = env.STAGING_SEED_SUPABASE_PROJECT_REF;
  if (!ref || !/^[a-z0-9]{20}$/.test(ref)) {
    throw new StagingSeedError('Staging seed refused: postgres requires the exact staging project reference in STAGING_SEED_SUPABASE_PROJECT_REF.');
  }
  let projectUrl: URL;
  try { projectUrl = new URL(env.SUPABASE_URL || ''); }
  catch { throw new StagingSeedError('Staging seed refused: SUPABASE_URL must identify the confirmed staging project.'); }
  if (projectUrl.protocol !== 'https:' || projectUrl.hostname !== `${ref}.supabase.co` ||
      projectUrl.port || projectUrl.username || projectUrl.password || projectUrl.pathname !== '/' || projectUrl.search || projectUrl.hash) {
    throw new StagingSeedError('Staging seed refused: SUPABASE_URL must identify the confirmed staging project.');
  }
  let username: string;
  try { username = decodeURIComponent(url.username); }
  catch { throw new StagingSeedError('Staging seed refused: invalid database username.'); }
  const direct = url.hostname === `db.${ref}.supabase.co`;
  // A shared pooler hostname identifies a region, not a project. Its username
  // must independently bind the connection to the explicitly confirmed project.
  const pooler = /^aws-\d+-[a-z]{2}(?:-[a-z]+)+-\d+\.pooler\.supabase\.com$/.test(url.hostname)
    && username === `postgres.${ref}`;
  if (!direct && !pooler) {
    throw new StagingSeedError('Staging seed refused: database connection must identify the confirmed Supabase project by direct host or pooler username.');
  }
}

export function assertStagingSeedTarget(env: NodeJS.ProcessEnv = process.env, options: { apply?: boolean; reset?: boolean } = {}): { database: string; adminEmail: string } {
  if (env.APP_ENV !== 'staging') throw new StagingSeedError('Staging seed refused: APP_ENV must explicitly be staging.');
  let url: URL;
  try { url = new URL(env.DATABASE_URL || ''); }
  catch { throw new StagingSeedError('Staging seed refused: invalid DATABASE_URL.'); }
  let database: string;
  try { database = decodeURIComponent(url.pathname.replace(/^\//, '')); }
  catch { throw new StagingSeedError('Staging seed refused: invalid database name.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname ||
      (!/^[A-Za-z0-9_]+_staging$/.test(database) && database !== 'postgres') || env.STAGING_SEED_DATABASE !== database) {
    throw new StagingSeedError('Staging seed refused: confirm the exact PostgreSQL *_staging database or approved Supabase postgres database with STAGING_SEED_DATABASE.');
  }
  if (env.STAGING_SEED_HOST !== url.hostname) {
    throw new StagingSeedError('Staging seed refused: confirm the exact database hostname with STAGING_SEED_HOST.');
  }
  if (database === 'postgres') assertSupabaseProject(url, env);
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
