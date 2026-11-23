import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { submittedAtChange, submittedAtOnCreate } from '../src/services/submission';
import { BACKFILL_COUNTS_SQL, BACKFILL_FROM_AUDIT_SQL, BACKFILL_FROM_CREATED_SQL } from '../src/services/submittedAtBackfill';
import { serializeRecord } from '../src/mappings';

const t0 = new Date('2026-11-01T01:00:00Z');
const t1 = new Date('2026-11-05T01:00:00Z');

test('a record created as submitted gets submittedAt, a draft gets none', () => {
  assert.equal(submittedAtOnCreate(false, t0), t0);
  assert.equal(submittedAtOnCreate(true, t0), null);
});

test('submitting sets submittedAt, returning to draft clears it, resubmitting restarts it', () => {
  assert.deepEqual(submittedAtChange(true, false, t0), { submittedAt: t0 });
  assert.deepEqual(submittedAtChange(false, true, t1), { submittedAt: null });
  assert.deepEqual(submittedAtChange(true, false, t1), { submittedAt: t1 });
});

test('edits that do not change draft state leave submittedAt untouched', () => {
  assert.deepEqual(submittedAtChange(false, false, t1), {});
  assert.deepEqual(submittedAtChange(true, true, t1), {});
  assert.equal('submittedAt' in submittedAtChange(false, false), false);
});

test('serializeRecord exposes submitted_at as null for drafts and legacy rows', () => {
  const base: any = { id: 'r1', category: 'RMA', status: 'SCHEDULED', draft: false, company: { name: 'Acme' }, lineItems: [], createdAt: t0 };
  assert.equal(serializeRecord({ ...base, submittedAt: t1 }).submitted_at, t1);
  assert.equal(serializeRecord({ ...base, draft: true, submittedAt: null }).submitted_at, null);
  assert.equal(serializeRecord(base).submitted_at, null);
});

test('migration adds a nullable column and holds the same backfill statements as the dry run', () => {
  const dir = path.join(__dirname, '..', 'prisma', 'migrations');
  const name = readdirSync(dir).find(entry => entry.endsWith('_record_submitted_at'));
  assert.ok(name, 'migration folder exists');
  const sql = readFileSync(path.join(dir, name!, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n'); // Windows checkouts use CRLF
  assert.match(sql, /ADD COLUMN "submittedAt" TIMESTAMP\(3\);/);
  assert.doesNotMatch(sql, /NOT NULL|DEFAULT/);
  assert.ok(sql.includes(BACKFILL_FROM_AUDIT_SQL + ';'), 'rule 1 SQL matches');
  assert.ok(sql.includes(BACKFILL_FROM_CREATED_SQL + ';'), 'rule 2 SQL matches');
  assert.ok(sql.indexOf(BACKFILL_FROM_AUDIT_SQL) < sql.indexOf(BACKFILL_FROM_CREATED_SQL), 'audit rule runs before the createdAt fallback');
});

test('the dry-run SQL is a single SELECT and the script cannot write', () => {
  assert.match(BACKFILL_COUNTS_SQL, /^WITH /);
  const withoutLiterals = BACKFILL_COUNTS_SQL.replace(/'[^']*'/g, "''");
  assert.doesNotMatch(withoutLiterals, /\b(UPDATE|INSERT|DELETE|ALTER|DROP)\b/i);
  const script = readFileSync(path.join(__dirname, '..', 'prisma', 'dry-run-submitted-at-backfill.ts'), 'utf8');
  assert.match(script, /SET TRANSACTION READ ONLY/);
  assert.doesNotMatch(script, /\$executeRaw(?!Unsafe\('SET TRANSACTION READ ONLY')/);
});
