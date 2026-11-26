import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

// Real PostgreSQL rehearsal of `npm run seed:staging:rma-demo` against a
// designated DISPOSABLE 127.0.0.1 database whose name ends in _staging (never a
// shared or deployed database). The database must already hold migrations plus
// the full local seed (seed.ts), and is removed by its runner afterwards.
// Run serially: node --import tsx --test --test-concurrency=1 <this file>.
const target = process.env.SEED_TEST_DATABASE_URL;

// No external mail, identity or storage provider is reachable from this test.
// Blank (not delete) so dotenv in db.ts cannot restore real values from server/.env.
for (const key of Object.keys(process.env)) if (/^(AZURE_|SMTP_|SUPABASE_|NOTION_)/.test(key)) process.env[key] = '';
for (const key of ['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY', 'NOTION_API_KEY']) process.env[key] = '';

// Pure pre-import gate: pg-connection-string query parameters could otherwise
// redirect the connection away from the confirmed disposable target.
const TARGET_OVERRIDE_QUERY_PARAMS = new Set(['host', 'hostaddr', 'user', 'username', 'database', 'dbname', 'db', 'port', 'service']);
function assertDisposableStagingTarget(targetUrl: string, appDatabaseUrl: string | undefined) {
  const url = new URL(targetUrl);
  const database = decodeURIComponent(url.pathname.slice(1));
  assert.equal(appDatabaseUrl, targetUrl, 'the app and the test must use the same explicit disposable database');
  assert.equal(url.hostname, '127.0.0.1', 'disposable loopback target only');
  assert.match(database, /^[A-Za-z0-9_]+_staging$/, 'disposable *_staging rehearsal database only');
  assert.equal([...url.searchParams.keys()].some(key => TARGET_OVERRIDE_QUERY_PARAMS.has(key.toLowerCase())), false,
    'disposable staging test refused: database URL query parameters must not override the confirmed target.');
  return { url, database };
}

test('the disposable staging target gate refuses target-overriding query parameters (no database)', () => {
  const base = 'postgresql://seed_test:pw@127.0.0.1:5432/rehearsal_staging';
  for (const query of ['host=localhost', '%68ost=localhost', 'HOST=localhost', 'hostaddr=127.0.0.1', 'user=other', 'username=other',
    'database=other_staging', 'dbname=other_staging', 'db=other_staging', 'port=5433', 'service=prod']) {
    const candidate = `${base}?${query}`;
    assert.throws(() => assertDisposableStagingTarget(candidate, candidate), /must not override the confirmed target/, query);
  }
  const benign = `${base}?schema=public`;
  assert.deepEqual(assertDisposableStagingTarget(benign, benign).database, 'rehearsal_staging');
  assert.throws(() => assertDisposableStagingTarget('postgresql://u:p@10.0.0.5:5432/x_staging', 'postgresql://u:p@10.0.0.5:5432/x_staging'), /loopback/);
  assert.throws(() => assertDisposableStagingTarget('postgresql://u:p@127.0.0.1:5432/prod', 'postgresql://u:p@127.0.0.1:5432/prod'), /_staging/);
  assert.throws(() => assertDisposableStagingTarget(benign, 'postgresql://elsewhere/x_staging'), /same explicit disposable database/);
});

test('staging RMA demo refresh on real PostgreSQL: preview, rollback, apply, preservation and TASS dashboards',
  { skip: !target, timeout: 180_000 }, async t => {
    const { url, database } = assertDisposableStagingTarget(target!, process.env.DATABASE_URL);

    // Imported only after the target checks and provider blanking above.
    const { prisma } = await import('../src/db');
    const { runStagingRmaDemoSeed } = await import('../prisma/seed-staging-rma-demo');
    const { RMA_DEMO_COMPANY_NAMES } = await import('../prisma/seeds/rma-demo');
    const { localDirectoryKey } = await import('../src/services/accountDirectory');
    const { canonicalRmaCategory } = await import('../src/services/rmaRules');
    const { RMA_AUTO_REFERENCE_PATTERN } = await import('../src/services/rmaReference');
    const { manilaToday } = await import('../src/services/deliveryLifecycle');
    const express = (await import('express')).default;
    const cookieParser = (await import('cookie-parser')).default;
    const { applySecurity } = await import('../src/middleware/security');
    const auth = (await import('../src/routes/auth')).default;
    const records = (await import('../src/routes/records')).default;
    const dashboard = (await import('../src/routes/dashboard')).default;

    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', APP_ENV: 'staging', DATABASE_URL: target,
      STAGING_SEED_DATABASE: database, STAGING_SEED_HOST: url.hostname, STAGING_SEED_ADMIN_EMAIL: 'admin@microgenesis.com' };
    const applyEnv = { ...env, STAGING_RMA_DEMO_APPROVED: 'true', STAGING_RMA_DEMO_ALLOW_RESET: 'true' };
    let server: import('node:http').Server | null = null;
    try {
      // ── Baseline: the full local seed already passed every real DB constraint. ──
      const seededRmas = await prisma.deliveryRecord.findMany({ where: { category: 'RMA', id: { startsWith: 'REC-41' } }, orderBy: { id: 'asc' } });
      assert.equal(seededRmas.length, 15, 'seed.ts loaded the 15 curated RMAs');
      for (const [key, name] of Object.entries(RMA_DEMO_COMPANY_NAMES)) {
        assert.ok(await prisma.company.findUnique({ where: { normalizedName: localDirectoryKey(name) } }), `demo company ${key} matches seeds/accounts.ts`);
      }
      const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@microgenesis.com' } });
      const tass = await prisma.user.findUniqueOrThrow({ where: { email: 'tass@microgenesis.com' } });
      const company = await prisma.company.findFirstOrThrow();
      const base = { companyId: company.id, priority: '2 - Moderate', reference: '', area: 'Legacy', accountManager: 'Legacy',
        deliveryDate: '2026-11-20', itemType: 'Small Item', status: 'SCHEDULED', createdById: admin.id, modifiedById: admin.id };

      // Legacy staging-style RMAs (null / retired categories, no reference or movement) with children.
      await prisma.deliveryRecord.create({ data: { ...base, id: 'REC-LEGACY-RMA-1', category: 'RMA', rmaType: null } });
      await prisma.deliveryRecord.create({ data: { ...base, id: 'REC-LEGACY-RMA-2', category: 'RMA', rmaType: 'Pull-Out Slip',
        lineItems: { create: [{ sku: 'Legacy item', quantity: 1 }] }, rmaContacts: { create: [{ name: 'Legacy contact' }] } } });
      await prisma.deliveryRecord.create({ data: { ...base, id: 'REC-LEGACY-DEL', category: 'DELIVERY', reference: 'LEGACY-DEL',
        linkedCollectionId: 'REC-LEGACY-RMA-1', lineItems: { create: [{ sku: 'Delivery item', quantity: 2 }] } } });
      await prisma.remarkLog.create({ data: { recordId: 'REC-LEGACY-RMA-1', body: 'legacy', context: 'CREATION', authorId: admin.id } });
      await prisma.comment.create({ data: { recordId: 'REC-LEGACY-RMA-2', body: 'legacy comment', authorId: admin.id } });
      await prisma.comment.create({ data: { recordId: 'REC-LEGACY-DEL', body: 'delivery comment', authorId: admin.id } });
      const dispatchNote = await prisma.notification.create({ data: { userId: tass.id, title: 'Dispatch', message: 'legacy dispatch' } });
      await prisma.notification.create({ data: { userId: tass.id, title: 'RMA', message: 'legacy', recordId: 'REC-LEGACY-RMA-1', recordType: 'DeliveryRecord' } });
      await prisma.notification.create({ data: { userId: tass.id, title: 'Delivery', message: 'kept', recordId: 'REC-LEGACY-DEL', recordType: 'DeliveryRecord' } });
      await prisma.rmaLogisticsDispatch.create({ data: { idempotencyKey: 'legacy-dispatch-0001', dispatchDate: '2026-11-20', dispatchedById: tass.id,
        recipientUserId: admin.id, recipientName: admin.name, recipientEmail: admin.email, recordIds: ['REC-LEGACY-RMA-1'], recordCount: 1,
        internalCount: 1, routeSlipFileName: 'DRR112026.xlsx', clientSlipsFileName: 'Tass_Route_112026.pdf', emailStatus: 'MOCKED',
        emailMethod: 'mock', inAppNotificationId: dispatchNote.id } });
      // A counter above the seeded number must never be lowered.
      await prisma.rmaReferenceSequence.update({ where: { prefix_manilaDate: { prefix: 'POS', manilaDate: '2026-04-18' } }, data: { lastValue: 9 } });

      // Sentinels in every preserved table so preservation is checked on real rows.
      const currentManilaYear = Number(manilaToday().slice(0, 4));
      if (await prisma.userPermission.count() === 0) await prisma.userPermission.create({ data: { userId: tass.id, screen: 'rma', granted: true } });
      // PermissionDefinition only accepts catalog keys; reuse one or create a valid catalog entry.
      const definition = await prisma.permissionDefinition.findFirst({ orderBy: { key: 'asc' } })
        ?? await prisma.permissionDefinition.create({ data: { key: 'SCREEN:dashboard:READ', scope: 'SCREEN', module: 'dashboard', action: 'READ' } });
      if (await prisma.rolePolicy.count() === 0) {
        await prisma.rolePolicy.create({ data: { role: 'DRIVER', permissions: { create: [{ permissionKey: definition.key, effect: 'ALLOW' }] } } });
      }
      await prisma.userPermissionOverride.create({ data: { userId: tass.id, permissionKey: definition.key, effect: 'ALLOW' } });
      await prisma.permissionConversion.create({ data: { userId: tass.id, sourceHash: 'sentinel-hash', report: {} } });
      await prisma.permissionQuarantine.create({ data: { legacyId: 'quarantine-sentinel-1', userId: tass.id, screen: 'legacy', granted: true,
        reason: 'sentinel', sourceHash: 'sentinel-hash' } });
      // UserSignature storage keys must match the opaque sig-<uuid>.png format (DB CHECK).
      await prisma.userSignature.create({ data: { userId: tass.id, storageKey: 'sig-00000000-0000-4000-8000-000000000001.png', mimeType: 'image/png', size: 128 } });
      await prisma.oAuthLoginState.create({ data: { id: 'oauth-sentinel-1', expiresAt: new Date(Date.now() + 3_600_000) } });
      await prisma.masterDataAdditionRequest.create({ data: { entityType: 'COMPANY', name: 'Sentinel Pending Corp', normalizedName: 'sentinel pending corp', requestedById: tass.id } });
      await prisma.podAttachment.create({ data: { recordId: 'REC-LEGACY-RMA-1', storageKey: 'pod-legacy-rma-1', originalName: 'rma.png', mimeType: 'image/png', size: 64, uploadedById: admin.id } });
      await prisma.podAttachment.create({ data: { recordId: 'REC-LEGACY-DEL', storageKey: 'pod-legacy-del-1', originalName: 'del.png', mimeType: 'image/png', size: 64, uploadedById: admin.id } });
      await prisma.remarkLog.create({ data: { recordId: 'REC-LEGACY-DEL', body: 'delivery remark', context: 'CREATION', authorId: admin.id } });
      await prisma.comment.create({ data: { recordId: 'REC-LEGACY-RMA-2', recordType: 'Company', body: 'company-typed comment on an RMA id', authorId: admin.id } });
      await prisma.recordSequence.upsert({ where: { category_year: { category: 'RMA', year: currentManilaYear - 1 } },
        create: { category: 'RMA', year: currentManilaYear - 1, lastValue: 42 }, update: { lastValue: 42 } });
      assert.ok(await prisma.inventoryItem.count() > 0, 'seed.ts populated inventory items');
      assert.ok(await prisma.inventoryTransaction.count() > 0, 'seed.ts populated inventory transactions');

      // Full, deterministically ordered rows of every table the refresh must preserve or scope.
      const snapshot = async () => ({
        users: await prisma.user.findMany({ orderBy: { id: 'asc' } }),
        permissions: await prisma.userPermission.findMany({ orderBy: { id: 'asc' } }),
        rolePolicies: await prisma.rolePolicy.findMany({ orderBy: { role: 'asc' } }),
        rolePermissions: await prisma.rolePermission.findMany({ orderBy: [{ role: 'asc' }, { permissionKey: 'asc' }] }),
        permissionOverrides: await prisma.userPermissionOverride.findMany({ orderBy: [{ userId: 'asc' }, { permissionKey: 'asc' }] }),
        permissionConversions: await prisma.permissionConversion.findMany({ orderBy: { userId: 'asc' } }),
        permissionQuarantines: await prisma.permissionQuarantine.findMany({ orderBy: { legacyId: 'asc' } }),
        userSignatures: await prisma.userSignature.findMany({ orderBy: { userId: 'asc' } }),
        oauthLoginStates: await prisma.oAuthLoginState.findMany({ orderBy: { id: 'asc' } }),
        drivers: await prisma.driver.findMany({ orderBy: { id: 'asc' } }),
        companies: await prisma.company.findMany({ orderBy: { id: 'asc' } }),
        customers: await prisma.customer.findMany({ orderBy: { id: 'asc' } }),
        suppliers: await prisma.supplier.findMany({ orderBy: { id: 'asc' } }),
        products: await prisma.product.findMany({ orderBy: { id: 'asc' } }),
        inventoryItems: await prisma.inventoryItem.findMany({ orderBy: { id: 'asc' } }),
        inventoryTransactions: await prisma.inventoryTransaction.findMany({ orderBy: { id: 'asc' } }),
        masterDataRequests: await prisma.masterDataAdditionRequest.findMany({ orderBy: { id: 'asc' } }),
        recordSequences: await prisma.recordSequence.findMany({ orderBy: [{ category: 'asc' }, { year: 'asc' }] }),
        nonRma: await prisma.deliveryRecord.findMany({ where: { category: { not: 'RMA' } }, orderBy: { id: 'asc' },
          include: { lineItems: { orderBy: { id: 'asc' } }, podAttachments: { orderBy: { id: 'asc' } } } }),
        podAttachments: await prisma.podAttachment.findMany({ orderBy: { id: 'asc' } }),
        remarkLogs: await prisma.remarkLog.findMany({ orderBy: { id: 'asc' } }),
        comments: await prisma.comment.findMany({ orderBy: { id: 'asc' } }),
        notifications: await prisma.notification.findMany({ orderBy: { id: 'asc' } }),
        audits: await prisma.auditLog.findMany({ orderBy: { id: 'asc' } }),
        rmas: await prisma.deliveryRecord.findMany({ where: { category: 'RMA' }, orderBy: { id: 'asc' },
          include: { lineItems: { orderBy: { id: 'asc' } }, rmaContacts: { orderBy: { id: 'asc' } } } }),
        sequences: await prisma.rmaReferenceSequence.findMany({ orderBy: [{ prefix: 'asc' }, { manilaDate: 'asc' }] }),
        dispatches: await prisma.rmaLogisticsDispatch.findMany({ orderBy: { id: 'asc' } }),
      });
      const before = await snapshot();

      await t.test('preview writes nothing and reports the exact replacement plan', async () => {
        const plan = await runStagingRmaDemoSeed(prisma, {}, env);
        assert.equal(plan.mode, 'dry-run');
        assert.equal(plan.deletions.rmaRecords, before.rmas.length);
        assert.equal(plan.deletions.rmaLogisticsDispatches, 1);
        assert.equal(plan.deletions.unlinkedCollectionReferences, 1);
        assert.ok(plan.deletions.notifications >= 2);
        assert.equal(plan.preserved.nonRmaRecords.total, before.nonRma.length);
        assert.equal(plan.create.curatedRmaRecords, 15);
        assert.deepEqual(await snapshot(), before);
      });

      await t.test('a failure at the final audit write rolls back every deletion, insert and counter change', async () => {
        await prisma.$executeRawUnsafe(`CREATE FUNCTION rma_demo_test_reject_reset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."recordType" = 'StagingRmaDemoSeed' THEN RAISE EXCEPTION 'injected reset audit failure'; END IF; RETURN NEW; END $$`);
        await prisma.$executeRawUnsafe(`CREATE TRIGGER rma_demo_test_reject_reset BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION rma_demo_test_reject_reset()`);
        try {
          await assert.rejects(runStagingRmaDemoSeed(prisma, { apply: true }, applyEnv));
        } finally {
          await prisma.$executeRawUnsafe('DROP TRIGGER rma_demo_test_reject_reset ON "AuditLog"');
          await prisma.$executeRawUnsafe('DROP FUNCTION rma_demo_test_reject_reset()');
        }
        assert.deepEqual(await snapshot(), before);
      });

      await t.test('apply replaces only RMA data, preserves everything else and raises slip counters', async () => {
        const result = await runStagingRmaDemoSeed(prisma, { apply: true }, applyEnv);
        assert.equal(result.mode, 'applied');
        const after = await snapshot();
        for (const key of ['users', 'permissions', 'rolePolicies', 'rolePermissions', 'permissionOverrides', 'permissionConversions',
          'permissionQuarantines', 'userSignatures', 'oauthLoginStates', 'drivers', 'companies', 'customers', 'suppliers', 'products',
          'inventoryItems', 'inventoryTransactions', 'masterDataRequests'] as const) {
          assert.ok((before[key] as unknown[]).length > 0, `${key} has sentinel rows`);
          assert.deepEqual(after[key], before[key], key);
        }
        // RecordSequence is never reset: only the current Manila year's RMA counter advances, by the rows
        // the record_no trigger numbered; the prior-year RMA sentinel (42) and non-RMA counters are untouched.
        const currentManilaYear = Number(manilaToday().slice(0, 4));
        const rmaCreated = 15 + (await prisma.driver.count({ where: { type: 'DRIVER', isActive: true } }));
        assert.ok(before.recordSequences.some(s => s.category === 'RMA' && s.year === currentManilaYear - 1 && s.lastValue === 42));
        assert.deepEqual(after.recordSequences.map(s => s.category === 'RMA' && s.year === currentManilaYear ? { ...s, lastValue: s.lastValue - rmaCreated } : s),
          before.recordSequences);
        // The defensive unlink happened, then everything else on non-RMA rows is unchanged.
        assert.equal(before.nonRma.find(r => r.id === 'REC-LEGACY-DEL')!.linkedCollectionId, 'REC-LEGACY-RMA-1');
        assert.equal(after.nonRma.find(r => r.id === 'REC-LEGACY-DEL')!.linkedCollectionId, null);
        const unlink = (rows: typeof before.nonRma) => rows.map(r => r.id === 'REC-LEGACY-DEL' ? { ...r, linkedCollectionId: null, updatedAt: null } : r);
        assert.deepEqual(unlink(after.nonRma), unlink(before.nonRma));
        // Exact RMA-scoped cleanup on the full child tables.
        assert.deepEqual(after.podAttachments, before.podAttachments.filter(p => p.recordId !== 'REC-LEGACY-RMA-1'));
        assert.ok(after.podAttachments.some(p => p.storageKey === 'pod-legacy-del-1'));
        assert.deepEqual(after.remarkLogs, before.remarkLogs.filter(r => r.recordId !== 'REC-LEGACY-RMA-1'));
        assert.deepEqual(after.comments, before.comments.filter(c => !(c.recordId === 'REC-LEGACY-RMA-2' && c.recordType === 'DeliveryRecord')));
        assert.ok(after.comments.some(c => c.recordId === 'REC-LEGACY-RMA-2' && c.recordType === 'Company'));
        assert.deepEqual(after.notifications, before.notifications.filter(n => n.id !== dispatchNote.id && n.recordId !== 'REC-LEGACY-RMA-1'));
        assert.deepEqual(after.dispatches, []);
        // Prior audits compared by id; exactly one RESET entry is appended.
        const beforeAuditById = new Map(before.audits.map(a => [a.id, a]));
        const afterAuditById = new Map(after.audits.map(a => [a.id, a]));
        for (const [id, audit] of beforeAuditById) assert.deepEqual(afterAuditById.get(id), audit, `audit ${id} untouched`);
        const addedAudits = after.audits.filter(a => !beforeAuditById.has(a.id));
        assert.equal(addedAudits.length, 1);
        const [reset] = addedAudits;
        assert.deepEqual([reset.recordId, reset.recordType, reset.action, reset.changedById], [database, 'StagingRmaDemoSeed', 'RESET', admin.id]);
        assert.equal(JSON.parse(reset.newValue!).externalStorageDeleted, false);

        const activeDrivers = new Set((await prisma.driver.findMany({ where: { type: 'DRIVER', isActive: true } })).map(d => d.id));
        assert.equal(after.rmas.length, 15 + activeDrivers.size);
        assert.ok(!after.rmas.some(r => r.id.startsWith('REC-LEGACY')));
        for (const rma of after.rmas) {
          assert.equal(canonicalRmaCategory(rma.rmaType), rma.rmaType, rma.id);
          assert.match(rma.rmaReference ?? '', RMA_AUTO_REFERENCE_PATTERN, rma.id);
          assert.ok(rma.rmaMovement, rma.id);
          assert.ok(rma.rmaContacts.length >= 1 && rma.lineItems.length >= 1, rma.id);
          assert.ok(rma.recordNo, `${rma.id} received a record number from the trigger`);
          if (rma.driverId) assert.ok(activeDrivers.has(rma.driverId), `${rma.id} uses an existing active Driver profile`);
          if (rma.rmaReceivedBy) assert.equal(rma.rmaReceivedBy, tass.id);
        }
        const references = after.rmas.map(r => r.rmaReference);
        assert.equal(new Set(references).size, references.length, 'no duplicate slip references');
        const pos0418 = after.sequences.find(s => s.prefix === 'POS' && s.manilaDate === '2026-04-18');
        assert.equal(pos0418?.lastValue, 9, 'existing high-water mark kept');
        for (const s of before.sequences) {
          const now = after.sequences.find(x => x.prefix === s.prefix && x.manilaDate === s.manilaDate);
          assert.ok(now && now.lastValue >= s.lastValue, `${s.prefix}|${s.manilaDate} never lowered`);
        }
        const today = manilaToday();
        const todayPos = after.sequences.find(s => s.prefix === 'POS' && s.manilaDate === today)!;
        const beforeTodayPos = before.sequences.find(s => s.prefix === 'POS' && s.manilaDate === today)?.lastValue ?? 0;
        assert.equal(todayPos.lastValue, beforeTodayPos + activeDrivers.size, 'driver-demo runs allocated after the existing counter');
      });

      await t.test('TASS dashboards show every RMA queue and a new RMA gets the next non-colliding reference', async () => {
        const app = express();
        app.use(express.json(), cookieParser());
        applySecurity(app);
        app.use('/api/v1/auth', auth);
        app.use('/api/v1/records', records);
        app.use('/api/v1/dashboard', dashboard);
        server = app.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        const base = `http://127.0.0.1:${address.port}/api/v1`;
        const request = (route: string, cookie?: string, init: RequestInit = {}) => fetch(`${base}${route}`,
          { ...init, signal: AbortSignal.timeout(10_000), headers: { ...(cookie ? { Cookie: cookie } : {}), ...init.headers } });
        const login = await request('/auth/login', undefined, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'tass@microgenesis.com', password: 'password123' }) });
        assert.equal(login.status, 200);
        const cookie = login.headers.get('set-cookie')!.split(';')[0];

        const overview = await request('/dashboard/overview', cookie);
        assert.equal(overview.status, 200);
        const { counts } = await overview.json() as { counts: Record<string, number> };
        for (const queue of ['tass-open-rma', 'tass-rma-on-hold', 'tass-rma-aging', 'tass-rma-in-transit']) {
          assert.ok(counts[queue] > 0, `${queue} = ${counts[queue]}`);
        }
        assert.equal((await request('/dashboard/stats', cookie)).status, 200);
        const list = await request('/records?search=CAS-31417-Y4Y6Z3', cookie);
        assert.equal(list.status, 200);
        const body = await list.json() as { rows?: Array<{ id: string }> } | Array<{ id: string }>;
        const rows = Array.isArray(body) ? body : body.rows ?? [];
        assert.ok(rows.some(r => r.id === 'REC-4102'), 'TASS can list the curated RMAs');

        const session = await request('/auth/me', cookie);
        const csrf = session.headers.get('x-csrf-token')!;
        const sequenceBefore = (await prisma.rmaReferenceSequence.findUnique({ where: { prefix_manilaDate: { prefix: 'POS', manilaDate: manilaToday() } } }))?.lastValue ?? 0;
        const accountManager = await prisma.accountManager.findFirst({ where: { isActive: true }, orderBy: { name: 'asc' } })
          ?? await prisma.accountManager.create({ data: { name: 'Rehearsal AM', normalizedName: localDirectoryKey('Rehearsal AM') } });
        const create = await request('/records', cookie, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: JSON.stringify({ category: 'RMA', company_id: company.id, priority: '2 - Moderate', area: 'Carmona', account_manager: accountManager.name,
            rma_type: 'Pull Out Slip', rma_movement: 'INTERNAL_NO_DRIVER', remarks: 'Post-refresh RMA' }) });
        assert.equal(create.status, 201, await create.clone().text());
        const createdRma = await create.json() as { rma_reference: string };
        assert.match(createdRma.rma_reference, RMA_AUTO_REFERENCE_PATTERN);
        assert.ok(createdRma.rma_reference.endsWith(`-${String(sequenceBefore + 1).padStart(2, '0')}`), createdRma.rma_reference);
        assert.equal(await prisma.deliveryRecord.count({ where: { rmaReference: createdRma.rma_reference } }), 1, 'reference does not collide');
      });
    } finally {
      if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
      await prisma.$disconnect();
    }
  });
