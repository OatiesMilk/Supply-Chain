import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma } from '../src/db';
import { assertPermissionBackfillTarget } from '../src/services/permissionBackfill';

// Runs only against the disposable seeded test database (SEED_TEST_DATABASE_URL).
// Every row it creates uses a usersig- id and is removed afterwards.
const target = process.env.SEED_TEST_DATABASE_URL;
const options = { skip: !target, timeout: 60_000 };
const userIds = ['usersig-owner', 'usersig-uploader'];
const key = () => `sig-${crypto.randomUUID()}.png`;

async function guard() {
  assert.equal(process.env.DATABASE_URL, target);
  assertPermissionBackfillTarget({ DATABASE_URL: target, NODE_ENV: 'test', PERMISSION_BACKFILL_DATABASE: new URL(target!).pathname.slice(1) });
}
const cleanup = async () => {
  await prisma.userSignature.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
};
async function users() {
  await cleanup();
  for (const id of userIds) {
    await prisma.user.create({ data: { id, name: id, email: `${id}@example.test`, password: 'x', role: 'TASS' } });
  }
}
const rejects = async (work: Promise<unknown>, constraint: string) => {
  await assert.rejects(work, (error: any) => String(error?.message ?? '').includes(constraint)
    || JSON.stringify(error?.meta ?? {}).includes(constraint) || error?.code === 'P2004' || /check constraint/i.test(String(error?.message)), constraint);
};

test('migration adds UserSignature with its indexes, CHECK constraints, foreign keys and RLS', options, async () => {
  await guard();
  const columns = (await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'UserSignature'`).map(row => row.column_name).sort();
  assert.deepEqual(columns, ['createdAt', 'height', 'mimeType', 'size', 'storageKey', 'updatedAt', 'uploadedById', 'userId', 'width']);
  const constraints = (await prisma.$queryRaw<{ conname: string }[]>`
    SELECT conname FROM pg_constraint WHERE conrelid = '"UserSignature"'::regclass`).map(row => row.conname);
  for (const name of ['UserSignature_pkey', 'UserSignature_userId_fkey', 'UserSignature_uploadedById_fkey', 'UserSignature_mimeType_check',
    'UserSignature_size_check', 'UserSignature_storageKey_check', 'UserSignature_dimensions_check']) assert.ok(constraints.includes(name), name);
  const indexes = (await prisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'UserSignature'`).map(row => row.indexname);
  for (const name of ['UserSignature_storageKey_key', 'UserSignature_uploadedById_idx']) assert.ok(indexes.includes(name), name);
  const [rls] = await prisma.$queryRaw<{ relrowsecurity: boolean }[]>`SELECT relrowsecurity FROM pg_class WHERE relname = 'UserSignature' AND relkind = 'r'`;
  assert.equal(rls.relrowsecurity, true);
});

test('CHECK constraints enforce MIME type, 2 MiB size, opaque storage key and pixel dimensions', options, async () => {
  await guard();
  await users();
  const base = { userId: 'usersig-owner', mimeType: 'image/png', size: 1024, width: 300, height: 100 };
  try {
    await rejects(prisma.userSignature.create({ data: { ...base, storageKey: key(), mimeType: 'image/svg+xml' } }), 'UserSignature_mimeType_check');
    await rejects(prisma.userSignature.create({ data: { ...base, storageKey: key(), size: 0 } }), 'UserSignature_size_check');
    await rejects(prisma.userSignature.create({ data: { ...base, storageKey: key(), size: 2 * 1024 * 1024 + 1 } }), 'UserSignature_size_check');
    for (const storageKey of ['../../evil.png', 'signature.png', `sig-${crypto.randomUUID()}.svg`, `SIG-${crypto.randomUUID()}.png`, `sig-${crypto.randomUUID()}.png/../x`]) {
      await rejects(prisma.userSignature.create({ data: { ...base, storageKey } }), 'UserSignature_storageKey_check');
    }
    await rejects(prisma.userSignature.create({ data: { ...base, storageKey: key(), width: 15 } }), 'UserSignature_dimensions_check');
    await rejects(prisma.userSignature.create({ data: { ...base, storageKey: key(), height: 4097 } }), 'UserSignature_dimensions_check');
    await rejects(prisma.userSignature.create({ data: { ...base, storageKey: key(), width: null } }), 'UserSignature_dimensions_check');
    await rejects(prisma.userSignature.create({ data: { ...base, storageKey: key(), height: null } }), 'UserSignature_dimensions_check');

    await prisma.userSignature.create({ data: { ...base, storageKey: key(), size: 2 * 1024 * 1024 } });
    await prisma.userSignature.update({ where: { userId: 'usersig-owner' }, data: { width: null, height: null, mimeType: 'image/jpeg', storageKey: `sig-${crypto.randomUUID()}.jpg` } });
  } finally { await cleanup(); }
});

test('deleting the owner cascades; deleting the uploader keeps the signature with uploadedById cleared', options, async () => {
  await guard();
  await users();
  try {
    await prisma.userSignature.create({ data: { userId: 'usersig-owner', storageKey: key(), mimeType: 'image/png', size: 10, width: 64, height: 32, uploadedById: 'usersig-uploader' } });
    await prisma.user.delete({ where: { id: 'usersig-uploader' } });
    const kept = await prisma.userSignature.findUniqueOrThrow({ where: { userId: 'usersig-owner' } });
    assert.equal(kept.uploadedById, null);
    await prisma.user.delete({ where: { id: 'usersig-owner' } });
    assert.equal(await prisma.userSignature.count({ where: { userId: 'usersig-owner' } }), 0);
  } finally { await cleanup(); }
});

test('the migration is idempotent: re-applying it changes nothing and keeps existing rows', options, async () => {
  await guard();
  await users();
  try {
    const storageKey = key();
    await prisma.userSignature.create({ data: { userId: 'usersig-owner', storageKey, mimeType: 'image/png', size: 10, width: 64, height: 32 } });
    const sql = fs.readFileSync(path.join(__dirname, '../prisma/migrations/20261125000000_user_digital_signatures/migration.sql'), 'utf8');
    const statements = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n')
      .split(';').map(statement => statement.trim()).filter(statement => statement && !/^(BEGIN|COMMIT)$/i.test(statement));
    for (const statement of statements) await prisma.$executeRawUnsafe(statement);
    const row = await prisma.userSignature.findUniqueOrThrow({ where: { userId: 'usersig-owner' } });
    assert.equal(row.storageKey, storageKey);
    const [count] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM pg_constraint WHERE conrelid = '"UserSignature"'::regclass`;
    assert.equal(Number(count.n), 7);
  } finally { await cleanup(); }
});
