import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import cookieParser from 'cookie-parser';
import { Client } from 'pg';
import { prisma } from '../src/db';
import { signToken } from '../src/middleware/auth';
import suppliers from '../src/routes/suppliers';
import { assertPermissionBackfillTarget } from '../src/services/permissionBackfill';

const target = process.env.SEED_TEST_DATABASE_URL;
function assertTarget() {
  assert.equal(process.env.DATABASE_URL, target);
  assertPermissionBackfillTarget({ ...process.env, DATABASE_URL: target, NODE_ENV: 'test', PERMISSION_BACKFILL_DATABASE: new URL(target!).pathname.slice(1) });
}

test('PostgreSQL supplier migration preserves legacy labels and reports blanks without guessing category splits', { skip: !target }, async () => {
  assertTarget();
  const client = new Client({ connectionString: target });
  const schema = `supplier_migration_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^supplier_migration_test_[a-f0-9]+$/);
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query('CREATE TABLE "Supplier" (id TEXT PRIMARY KEY, category TEXT NOT NULL)');
    const labels = [' Hardware ', 'HARDWARE', 'Custom, Services', '', '  '];
    for (const [index, label] of labels.entries()) await client.query('INSERT INTO "Supplier" VALUES ($1,$2)', [String(index), label]);
    const migration = await readFile(resolve(__dirname, '../prisma/migrations/20261105010000_supplier_category_catalog/migration.sql'), 'utf8');
    await client.query(migration);
    const rows = (await client.query('SELECT s.id, s.category, c.name FROM "Supplier" s LEFT JOIN "SupplierCategoryAssignment" a ON a."supplierId"=s.id LEFT JOIN "SupplierCategory" c ON c.id=a."categoryId" ORDER BY s.id')).rows;
    assert.deepEqual(rows.map(row => row.category), labels);
    assert.deepEqual(rows.map(row => row.name), ['Hardware', 'Hardware', 'Custom, Services', null, null]);
    assert.equal((await client.query('SELECT COUNT(*)::int n FROM "SupplierCategory"')).rows[0].n, 6);
  } finally {
    await client.query('ROLLBACK');
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});

test('PostgreSQL supplier writes roll back with audits and serialize stale edits and category deactivation', { skip: !target, timeout: 60_000 }, async t => {
  assertTarget();
  const oldMode = process.env.PERMISSION_MODE;
  process.env.PERMISSION_MODE = 'LEGACY';
  const suffix = randomUUID().replaceAll('-', '');
  const prefix = `supplier_regression_${suffix}`;
  const actor = await prisma.user.create({ data: { name: prefix, email: `${prefix}@example.test`, password: 'unused', role: 'ADMIN' } });
  const category = await prisma.supplierCategory.create({ data: { name: prefix, normalizedName: prefix } });
  const other = await prisma.supplierCategory.create({ data: { name: `${prefix}_other`, normalizedName: `${prefix}_other` } });
  const app = express();
  app.use(express.json(), cookieParser()); app.use('/suppliers', suppliers);
  app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: 'Injected database failure' }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/suppliers`;
  const cookie = `mg_session=${signToken({ id: actor.id, name: actor.name, email: actor.email, role: 'ADMIN' })}`;
  const request = (path: string, method: string, body: unknown) => fetch(base + path, {
    method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const sql = new Client({ connectionString: target }); await sql.connect();
  const functionName = `reject_supplier_audit_${suffix}`;
  try {
    const initial = await request('', 'POST', { name: prefix, category_ids: [category.id] });
    assert.equal(initial.status, 201);
    const supplier = await initial.json() as any;
    await t.test('an audit failure rolls back supplier create, catalog create/update and assignment replacement', async () => {
      // The trigger only rejects this test's unique records; other audits are untouched.
      await sql.query(`CREATE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."recordId" IN ('${supplier.id}', '${category.id}') OR NEW."newValue"::jsonb->>'name' = '${prefix}_fail' THEN RAISE EXCEPTION 'Injected supplier audit failure'; END IF; RETURN NEW; END $$`);
      await sql.query(`CREATE TRIGGER "${functionName}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
      try {
        assert.equal((await request('', 'POST', { name: `${prefix}_fail`, category_ids: [category.id] })).status, 500);
        assert.equal(await prisma.supplier.count({ where: { name: `${prefix}_fail` } }), 0);
        assert.equal((await request('/categories', 'POST', { name: `${prefix}_fail` })).status, 500);
        assert.equal(await prisma.supplierCategory.count({ where: { normalizedName: `${prefix}_fail` } }), 0);
        assert.equal((await request(`/categories/${category.id}`, 'PATCH', { name: `${prefix}_rename`, expected_version: 1 })).status, 500);
        assert.equal((await prisma.supplierCategory.findUniqueOrThrow({ where: { id: category.id } })).version, 1);
        assert.equal((await request(`/${supplier.id}/categories`, 'PUT', { category_ids: [other.id], expected_version: 1 })).status, 500);
        const unchanged = await prisma.supplier.findUniqueOrThrow({ where: { id: supplier.id }, include: { categories: true } });
        assert.equal(unchanged.version, 1);
        assert.deepEqual(unchanged.categories.map(link => link.categoryId), [category.id]);
        assert.equal(await prisma.auditLog.count({ where: { recordId: supplier.id } }), 1);
      } finally {
        await sql.query(`DROP TRIGGER "${functionName}" ON "AuditLog"`);
        await sql.query(`DROP FUNCTION "${functionName}"()`);
      }
    });
    await t.test('competing edits with one expected version yield one success and one conflict', async () => {
      const responses = await Promise.all([
        request(`/${supplier.id}/categories`, 'PUT', { category_ids: [other.id], expected_version: 1 }),
        request(`/${supplier.id}/categories`, 'PUT', { category_ids: [category.id, other.id], expected_version: 1 }),
      ]);
      assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
      assert.equal(await prisma.auditLog.count({ where: { recordId: supplier.id } }), 2);
    });
    await t.test('a queued new assignment rechecks active state after catalog deactivation commits', async () => {
      await sql.query('BEGIN'); await sql.query('SELECT pg_advisory_xact_lock(731105, 1)');
      const queued = request('', 'POST', { name: `${prefix}_race`, category_ids: [category.id] });
      let waiting = false;
      for (let attempt = 0; attempt < 40; attempt++) {
        const result = await sql.query("SELECT COUNT(*)::int n FROM pg_locks WHERE locktype='advisory' AND classid=731105 AND objid=1 AND NOT granted");
        if (result.rows[0].n) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.equal(waiting, true, 'the new assignment waits for the catalog lock');
      // The held advisory lock forces the route to wait until this state commits.
      await sql.query('UPDATE "SupplierCategory" SET "isActive"=false, version=version+1 WHERE id=$1', [category.id]);
      await sql.query('COMMIT');
      assert.equal((await queued).status, 409);
      assert.equal(await prisma.supplier.count({ where: { name: `${prefix}_race` } }), 0);
    });
  } finally {
    await sql.query('ROLLBACK'); await sql.end();
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.supplier.deleteMany({ where: { createdById: actor.id } });
    await prisma.auditLog.deleteMany({ where: { changedById: actor.id } });
    await prisma.supplierCategory.deleteMany({ where: { normalizedName: { startsWith: prefix } } });
    await prisma.user.delete({ where: { id: actor.id } });
    if (oldMode === undefined) delete process.env.PERMISSION_MODE; else process.env.PERMISSION_MODE = oldMode;
    await prisma.$disconnect();
  }
});
