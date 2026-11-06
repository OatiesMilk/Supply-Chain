#!/usr/bin/env node
// Own the complete database lifecycle: never use DATABASE_URL from the caller.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import net from 'node:net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.argv.includes('--help')) {
  console.log('Create a private temporary PostgreSQL cluster, apply migrations, load UAT seeds, run seeded API and PostgreSQL tests, then remove the cluster. Requires local initdb, pg_ctl and psql. Never uses your configured database or starts application servers.');
  process.exit(0);
}
const deployed = ['CI', 'RENDER', 'RENDER_SERVICE_ID', 'RENDER_EXTERNAL_URL', 'RAILWAY_ENVIRONMENT', 'VERCEL', 'FLY_APP_NAME', 'K_SERVICE', 'HEROKU_APP_NAME'];
if (deployed.some(key => process.env[key])) throw new Error('This local seeded-database runner is unavailable in deployed/CI environments.');

let activeChild;
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { interrupted = true; activeChild?.kill('SIGTERM'); });
async function run(command, args, env = process.env, cwd = root, cleanup = false) {
  if (interrupted && !cleanup) throw new Error('Test run interrupted');
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
    activeChild = child;
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (activeChild === child) activeChild = undefined;
      if (code === 0) resolve(); else reject(new Error(`${command} failed (${signal ?? code}); see output above`));
    });
  });
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

let directory;
let startupAttempted = false;
try {
  for (const command of ['initdb', 'pg_ctl', 'psql']) await run(command, ['--version']);
  directory = await mkdtemp(path.join(tmpdir(), 'supply-chain-seeded-'));
  const data = path.join(directory, 'postgres');
  const sockets = path.join(directory, 'sockets');
  const passwordFile = path.join(directory, 'password');
  const password = randomBytes(24).toString('base64url');
  await mkdir(sockets);
  await writeFile(passwordFile, password, { mode: 0o600 });
  const port = await freePort();
  // libpq service/hostaddr/options settings must never redirect private psql work.
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG[A-Z_]+$/.test(key)));
  const env = { ...inherited, PGUSER: 'seed_test', PGPASSWORD: password, PGHOST: '127.0.0.1', PGPORT: String(port),
    JWT_SECRET: randomBytes(32).toString('base64url'), PERMISSION_MODE: 'LEGACY', APP_ENV: 'test', NODE_ENV: 'test',
    POD_STORAGE_PROVIDER: 'local', POD_UPLOAD_DIR: path.join(directory, 'pod'), POD_TEMP_DIR: path.join(directory, 'quarantine'),
    REQUIRE_PROXY_SECRET: 'false', PROXY_SHARED_SECRET: '', TRUST_PROXY: '', CLIENT_ORIGIN: 'http://localhost:3000' };
  for (const key of ['DATABASE_URL', 'PERMISSION_TEST_DATABASE_URL', 'RMA_DISPATCH_TEST_DATABASE_URL', 'SEED_TEST_DATABASE_URL']) delete env[key];
  // Tests use local storage and no external mail or identity provider.
  // Blank values also prevent dotenv.config() from restoring provider secrets.
  for (const key of [...Object.keys(env), 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SMTP_SECURE',
    'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'BILLING_NOTIFICATION_USER_EMAIL']) {
    if (/^(SMTP_|AZURE_|SUPABASE_|BILLING_NOTIFICATION_)/.test(key)) env[key] = '';
  }
  await run('initdb', ['-D', data, '-U', 'seed_test', '--auth=scram-sha-256', `--pwfile=${passwordFile}`, '--no-locale', '-E', 'UTF8'], env);
  startupAttempted = true;
  await run('pg_ctl', ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${sockets}`, '-w', 'start'], env);
  const serverDir = path.join(root, 'server');
  const prismaCli = path.join(root, 'node_modules/prisma/build/index.js');
  async function database(name) {
    await run('psql', ['-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `CREATE DATABASE "${name}"`], env);
    const databaseEnv = { ...env, DATABASE_URL: `postgresql://seed_test:${password}@127.0.0.1:${port}/${name}?schema=public` };
    await run(process.execPath, [prismaCli, 'migrate', 'deploy'], databaseEnv, serverDir);
    return databaseEnv;
  }

  const seeded = await database('supply_chain_seed_test');
  console.log('Loading the existing UAT seed into the private test database.');
  await run(process.execPath, ['--import', 'tsx', 'prisma/seed-uat.ts'], { ...seeded, NODE_ENV: 'development', APP_ENV: 'development',
    LOCAL_DESTRUCTIVE_SEED: 'true', LOCAL_SEED_DATABASE: 'supply_chain_seed_test' }, serverDir);
  await run(process.execPath, ['--import', 'tsx', '--test', 'tests/seededDatabase.postgres.test.ts'],
    { ...seeded, SEED_TEST_DATABASE_URL: seeded.DATABASE_URL }, serverDir);
  await run(process.execPath, ['--import', 'tsx', '--test', 'tests/podDeletion.postgres.test.ts'],
    { ...seeded, SEED_TEST_DATABASE_URL: seeded.DATABASE_URL }, serverDir);

  // Separate databases prevent role-policy fixtures from affecting seeded users
  // or each other. These tests exercise actual PostgreSQL constraints and races.
  for (const [name, file] of [
    ['supply_chain_foundation_test', 'tests/permissionFoundation.test.ts'],
    ['supply_chain_management_test', 'tests/permissionManagement.postgres.test.ts'],
    ['sc255_activation_test', 'tests/rmaDispatch.postgres.test.ts'],
  ]) {
    const target = await database(name);
    const key = name.startsWith('sc255_') ? 'RMA_DISPATCH_TEST_DATABASE_URL' : 'PERMISSION_TEST_DATABASE_URL';
    await run(process.execPath, ['--import', 'tsx', '--test', file], { ...target, [key]: target.DATABASE_URL }, serverDir);
  }
  console.log('Seeded API and PostgreSQL checks completed.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Seeded database test run failed');
  process.exitCode = 1;
} finally {
  let stopped = !startupAttempted;
  if (startupAttempted) {
    try { await run('pg_ctl', ['-D', path.join(directory, 'postgres'), '-m', 'immediate', '-w', 'stop'], process.env, root, true); stopped = true; }
    catch { console.error(`Temporary PostgreSQL could not confirm shutdown; retained ${directory} for cleanup.`); process.exitCode = 1; }
  }
  if (directory && stopped) await rm(directory, { recursive: true, force: true });
}
