import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ASSIGN_FUNCTION_SQL, BACKFILL_SQL, KEEP_FUNCTION_SQL, SEQUENCE_SYNC_SQL, previewSql } from '../src/services/recordNoBackfill';
import { RECORD_NO_PREFIX } from '../src/services/recordIds';

const migration = readFileSync(path.join(__dirname, '../prisma/migrations/20261112090000_record_no/migration.sql'), 'utf8');

test('the record number migration runs the same SQL as the dry run and tests', () => {
  for (const sql of [BACKFILL_SQL, SEQUENCE_SYNC_SQL, ASSIGN_FUNCTION_SQL, KEEP_FUNCTION_SQL]) assert.ok(migration.includes(sql));
  assert.match(migration, /BEGIN;[\s\S]*SET NOT NULL[\s\S]*CREATE UNIQUE INDEX "DeliveryRecord_recordNo_key"[\s\S]*COMMIT;/);
  assert.match(migration, /BEFORE INSERT ON "DeliveryRecord"/);
  assert.match(migration, /-- Rollback/);
});

test('the SQL prefixes match the TypeScript prefixes', () => {
  for (const [category, prefix] of Object.entries(RECORD_NO_PREFIX)) {
    assert.ok(ASSIGN_FUNCTION_SQL.includes(`WHEN '${category}' THEN '${prefix}'`), category);
    assert.ok(BACKFILL_SQL.includes(`WHEN '${category}' THEN '${prefix}'`), category);
  }
});

test('the pre-migration preview does not touch the new column or counter table', () => {
  assert.doesNotMatch(previewSql(false), /recordNo|RecordSequence/);
  assert.match(previewSql(true), /"recordNo" IS NULL/);
});
