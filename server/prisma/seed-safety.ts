/** Fail closed before any Prisma operation in demo and UAT seed commands. */
export function assertDisposableSeedTarget(env: NodeJS.ProcessEnv = process.env): void {
  const deployed = [
    'CI', 'RENDER', 'RENDER_SERVICE_ID', 'RENDER_EXTERNAL_URL',
    'RAILWAY_ENVIRONMENT', 'VERCEL', 'FLY_APP_NAME', 'K_SERVICE', 'HEROKU_APP_NAME'
  ].some(key => Boolean(env[key]));

  if (env.NODE_ENV !== 'development' || env.LOCAL_DESTRUCTIVE_SEED !== 'true' || deployed) {
    throw new Error('Destructive seeding is disabled: use an opted-in local development sandbox only.');
  }

  let url: URL;
  try {
    url = new URL(env.DATABASE_URL || '');
  } catch {
    throw new Error('Destructive seeding is disabled: invalid DATABASE_URL.');
  }

  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const isLoopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !isLoopback ||
    !/^[A-Za-z0-9_]+_(sandbox|test)$/.test(database) ||
    env.LOCAL_SEED_DATABASE !== database
  ) {
    throw new Error('Destructive seeding is disabled: use the approved local *_sandbox or *_test database.');
  }
}
