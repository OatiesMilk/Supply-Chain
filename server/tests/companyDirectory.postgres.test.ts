import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import cookieParser from 'cookie-parser';
import { Client } from 'pg';
import { assertPermissionBackfillTarget } from '../src/services/permissionBackfill';

// Runs only against a designated disposable database, inside a throwaway schema.
const target = process.env.SEED_TEST_DATABASE_URL;
const MIGRATION = '../prisma/migrations/20261124000000_company_multi_sap_and_account_managers/migration.sql';

async function withSchema(run: (client: Client) => Promise<void>) {
  assert.equal(process.env.DATABASE_URL, target);
  assertPermissionBackfillTarget({ ...process.env, DATABASE_URL: target, NODE_ENV: 'test', PERMISSION_BACKFILL_DATABASE: new URL(target!).pathname.slice(1) });
  const client = new Client({ connectionString: target });
  const schema = `company_migration_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^company_migration_test_[a-f0-9]+$/);
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query('CREATE TABLE "AccountManager" (id TEXT PRIMARY KEY, name TEXT NOT NULL)');
    await client.query(`CREATE TABLE "Company" (id TEXT PRIMARY KEY, name TEXT NOT NULL, "sapNumber" TEXT NOT NULL,
      "defaultAccountManagerId" TEXT REFERENCES "AccountManager"(id) ON DELETE SET NULL)`);
    await run(client);
  } finally {
    await client.query('ROLLBACK');
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
}

test('PostgreSQL company migration backfills SAP numbers and Account Managers idempotently and enforces the new keys', { skip: !target }, async () => {
  await withSchema(async client => {
    await client.query(`INSERT INTO "AccountManager" VALUES ('am-1', 'P. Soriano'), ('am-2', 'C. Lim')`);
    await client.query(`INSERT INTO "Company" VALUES ('co-1', 'Acme', ' SAP-1 ', 'am-1'), ('co-2', 'Walk-in', '  ', NULL), ('co-3', 'BDO', 'SAP-BDO', 'am-2')`);
    const migration = await readFile(resolve(__dirname, MIGRATION), 'utf8');
    await client.query(migration);
    await client.query(migration); // A re-run changes nothing.
    const saps = (await client.query('SELECT "companyId", "sapNumber", "normalizedNumber", position FROM "CompanySapNumber" ORDER BY "companyId"')).rows;
    assert.deepEqual(saps, [
      { companyId: 'co-1', sapNumber: 'SAP-1', normalizedNumber: 'sap-1', position: 0 },
      { companyId: 'co-3', sapNumber: 'SAP-BDO', normalizedNumber: 'sap-bdo', position: 0 },
    ], 'walk-in companies get no SAP row');
    assert.deepEqual((await client.query('SELECT "sapNumber" FROM "Company" ORDER BY id')).rows.map(row => row.sapNumber), ['SAP-1', '', 'SAP-BDO']);
    const links = (await client.query('SELECT "companyId", "accountManagerId" FROM "CompanyAccountManager" ORDER BY "companyId"')).rows;
    assert.deepEqual(links, [{ companyId: 'co-1', accountManagerId: 'am-1' }, { companyId: 'co-3', accountManagerId: 'am-2' }]);
    // New companies default to no SAP number.
    await client.query(`INSERT INTO "Company" (id, name) VALUES ('co-4', 'New walk-in')`);
    assert.equal((await client.query(`SELECT "sapNumber" FROM "Company" WHERE id = 'co-4'`)).rows[0].sapNumber, '');
    // One SAP number belongs to one company, ignoring case.
    await assert.rejects(client.query(`INSERT INTO "CompanySapNumber" (id, "companyId", "sapNumber", "normalizedNumber") VALUES ('x', 'co-4', 'sap-1', 'sap-1')`), /CompanySapNumber_normalizedNumber_key/);
    await client.query(`INSERT INTO "CompanySapNumber" (id, "companyId", "sapNumber", "normalizedNumber", position) VALUES ('y', 'co-3', 'SAP-BDO-2', 'sap-bdo-2', 1)`);
    // An Account Manager with assignments is deactivated, never deleted; deleting a company removes its child rows.
    await assert.rejects(client.query(`DELETE FROM "AccountManager" WHERE id = 'am-2'`), /CompanyAccountManager_accountManagerId_fkey/);
    await client.query(`DELETE FROM "Company" WHERE id = 'co-3'`);
    assert.equal((await client.query(`SELECT COUNT(*)::int n FROM "CompanySapNumber" WHERE "companyId" = 'co-3'`)).rows[0].n, 0);
    assert.equal((await client.query(`SELECT COUNT(*)::int n FROM "CompanyAccountManager" WHERE "companyId" = 'co-3'`)).rows[0].n, 0);
    const rls = (await client.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('CompanySapNumber', 'CompanyAccountManager')
      AND relnamespace = current_schema()::regnamespace ORDER BY relname`)).rows;
    assert.deepEqual(rls, [{ relname: 'CompanyAccountManager', relrowsecurity: true }, { relname: 'CompanySapNumber', relrowsecurity: true }]);
  });
});

test('PostgreSQL company migration refuses legacy SAP duplicates that differ only by case or spaces', { skip: !target }, async () => {
  await withSchema(async client => {
    await client.query(`INSERT INTO "Company" VALUES ('co-1', 'Acme', 'SAP-1', NULL), ('co-2', 'Beta', ' sap-1', NULL)`);
    const migration = await readFile(resolve(__dirname, MIGRATION), 'utf8');
    await assert.rejects(client.query(migration), /Duplicate non-blank Company SAP numbers/);
  });
});

test('PostgreSQL company routes reorder and re-case own SAP numbers, reject other companies\' numbers and roll back with the audit', { skip: !target, timeout: 60_000 }, async () => {
  assert.equal(process.env.DATABASE_URL, target);
  const { prisma } = await import('../src/db');
  const { signToken } = await import('../src/middleware/auth');
  const { default: companies } = await import('../src/routes/companies');
  const oldMode = process.env.PERMISSION_MODE;
  process.env.PERMISSION_MODE = 'LEGACY';
  const prefix = `company_regression_${randomUUID().replaceAll('-', '')}`;
  const sap = `T${randomUUID().slice(0, 8)}`; // SAP numbers are at most 50 characters
  const actor = await prisma.user.create({ data: { name: prefix, email: `${prefix}@example.test`, password: 'unused', role: 'ADMIN' } });
  const am1 = await prisma.accountManager.create({ data: { name: `${prefix} AM One`, normalizedName: `${prefix} am one` } });
  const am2 = await prisma.accountManager.create({ data: { name: `${prefix} AM Two`, normalizedName: `${prefix} am two` } });
  const app = express();
  app.use(express.json(), cookieParser()); app.use('/companies', companies);
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: 'Injected database failure' }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/companies`;
  const cookie = `mg_session=${signToken({ id: actor.id, name: actor.name, email: actor.email, role: 'ADMIN' })}`;
  const request = (path: string, method: string, body: unknown) => fetch(base + path, {
    method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const sql = new Client({ connectionString: target }); await sql.connect();
  const ids: string[] = [];
  try {
    const bdoRes = await request('', 'POST', { name: `${prefix} BDO`, sap_numbers: [`${sap}-A`, `${sap}-B`], account_manager_ids: [am1.id, am2.id] });
    assert.equal(bdoRes.status, 201);
    const bdo = await bdoRes.json() as any; ids.push(bdo.id);
    assert.deepEqual(bdo.sap_numbers, [`${sap}-A`, `${sap}-B`]);
    const walkIn = await request('', 'POST', { name: `${prefix} Walk-in` });
    assert.equal(walkIn.status, 201); ids.push((await walkIn.json() as any).id);
    const clash = await request('', 'POST', { name: `${prefix} Other`, sap_numbers: [` ${sap}-b `] });
    assert.equal(clash.status, 409, 'another company\'s second SAP number, different case');
    const reordered = await request(`/${bdo.id}`, 'PATCH', { sap_numbers: [`${sap}-b`, `${sap}-A`], expected_version: 1 });
    assert.equal(reordered.status, 200, 'reorder + re-case never conflicts with the company\'s own unique keys');
    assert.deepEqual((await reordered.json() as any).sap_numbers, [`${sap}-b`, `${sap}-A`]);
    const row = await prisma.company.findUniqueOrThrow({ where: { id: bdo.id }, include: { sapNumbers: { orderBy: { position: 'asc' } }, accountManagers: true } });
    assert.equal(row.sapNumber, `${sap}-b`);
    assert.deepEqual(row.sapNumbers.map(sap => sap.position), [0, 1]);
    assert.equal(row.accountManagers.length, 2);
    // An audit failure rolls the child-table replacement back too.
    const fn = `reject_company_audit_${prefix}`;
    await sql.query(`CREATE FUNCTION "${fn}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."recordId" = '${bdo.id}' THEN RAISE EXCEPTION 'Injected company audit failure'; END IF; RETURN NEW; END $$`);
    await sql.query(`CREATE TRIGGER "${fn}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`);
    try {
      assert.equal((await request(`/${bdo.id}`, 'PATCH', { sap_numbers: [], account_manager_ids: [], expected_version: 2 })).status, 500);
    } finally {
      await sql.query(`DROP TRIGGER "${fn}" ON "AuditLog"`); await sql.query(`DROP FUNCTION "${fn}"()`);
    }
    const unchanged = await prisma.company.findUniqueOrThrow({ where: { id: bdo.id }, include: { sapNumbers: true, accountManagers: true } });
    assert.equal(unchanged.version, 2);
    assert.equal(unchanged.sapNumbers.length, 2);
    assert.equal(unchanged.accountManagers.length, 2);
  } finally {
    await sql.end();
    server.close();
    await prisma.auditLog.deleteMany({ where: { recordId: { in: ids } } });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await prisma.accountManager.deleteMany({ where: { id: { in: [am1.id, am2.id] } } });
    await prisma.user.delete({ where: { id: actor.id } });
    if (oldMode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = oldMode;
  }
});
