/** No deployed environment may expose the development sample-data endpoints. */
export function dataSamplerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const appEnv = env.APP_ENV ?? nodeEnv;
  const hosted = ['RENDER', 'RENDER_SERVICE_ID', 'RENDER_EXTERNAL_URL', 'RAILWAY_ENVIRONMENT', 'VERCEL', 'FLY_APP_NAME', 'K_SERVICE', 'HEROKU_APP_NAME']
    .some(key => Boolean(env[key]));
  return !hosted && ['development', 'test'].includes(nodeEnv) && ['development', 'test'].includes(appEnv);
}
