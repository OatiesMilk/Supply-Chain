// SQL for the DeliveryRecord.recordNo backfill and the insert trigger.
// The migration 20261112090000_record_no holds the same statements;
// recordNoBackfill.test.ts keeps the two in step. Rules mirror recordIds.ts.

/** Prefix per category, matching RECORD_NO_PREFIX. Unknown categories map to NULL. */
export const PREFIX_CASE_SQL = (column: string) => `CASE ${column}
    WHEN 'DELIVERY' THEN 'DEL'
    WHEN 'RMA' THEN 'RMA'
    WHEN 'PROCUREMENT_PICKUP' THEN 'PUP'
    WHEN 'SALES_ORDERS' THEN 'SO'
    WHEN 'ACCOUNTING_COLLECTION' THEN 'COL'
  END`;

/** Year in Asia/Manila of a UTC timestamp(3) column. */
export const MANILA_YEAR_SQL = (column: string) => `EXTRACT(YEAR FROM ((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Manila'))::int`;

/** Two-digit year and a sequence padded to five digits that grows instead of truncating. */
export const FORMAT_SQL = (prefix: string, year: string, seq: string) =>
  `${prefix} || '-' || lpad((${year} % 100)::text, 2, '0') || '-' || lpad(${seq}::text, GREATEST(5, length(${seq}::text)), '0')`;

/**
 * Every record without a number, numbered per category per Manila year of
 * createdAt, oldest first (id breaks ties). Soft-deleted rows are included so
 * their numbers are never handed out again. Before the migration has run there
 * is no column or counter table yet, so the dry run passes migrated = false.
 */
export const numberedSql = (migrated = true) => `SELECT n.id, n.category, n.year, n.seq,
    ${FORMAT_SQL('n.prefix', 'n.year', 'n.seq')} AS record_no
  FROM (
    SELECT r.id, r.category, ${PREFIX_CASE_SQL('r.category')} AS prefix, y.year,
      (${migrated ? 'COALESCE(s."lastValue", 0)' : '0'} + ROW_NUMBER() OVER (PARTITION BY r.category, y.year ORDER BY r."createdAt", r.id))::int AS seq
    FROM "DeliveryRecord" r
    CROSS JOIN LATERAL (SELECT ${MANILA_YEAR_SQL('r."createdAt"')} AS year) y${migrated ? `
    LEFT JOIN "RecordSequence" s ON s.category = r.category AND s.year = y.year
    WHERE r."recordNo" IS NULL` : ''}
  ) n`;

export const BACKFILL_SQL = `UPDATE "DeliveryRecord" r
SET "recordNo" = b.record_no
FROM (${numberedSql()}) b
WHERE b.id = r.id AND r."recordNo" IS NULL`;

/** Move each counter to the highest number now in use. */
export const SEQUENCE_SYNC_SQL = `INSERT INTO "RecordSequence" (category, year, "lastValue")
SELECT r.category, ${MANILA_YEAR_SQL('r."createdAt"')}, max(split_part(r."recordNo", '-', 3)::int)
FROM "DeliveryRecord" r
WHERE r."recordNo" IS NOT NULL
GROUP BY 1, 2
ON CONFLICT (category, year) DO UPDATE SET "lastValue" = GREATEST("RecordSequence"."lastValue", EXCLUDED."lastValue")`;

/** Read-only preview for the dry run: one row per category and year. */
export const previewSql = (migrated = true) => `SELECT category, year, count(*)::int AS records,
    min(seq)::int AS first_seq, max(seq)::int AS last_seq,
    count(*) FILTER (WHERE record_no IS NULL)::int AS unknown_category
  FROM (${numberedSql(migrated)}) b
  GROUP BY category, year
  ORDER BY category, year`;

/** Insert trigger: assigns the next number for the row's category and Manila year. */
export const ASSIGN_FUNCTION_SQL = `CREATE OR REPLACE FUNCTION assign_record_no() RETURNS trigger AS $$
DECLARE
  prefix text := ${PREFIX_CASE_SQL('NEW.category')};
  record_year int;
  seq int;
BEGIN
  IF NEW."recordNo" IS NOT NULL THEN
    RETURN NEW; -- restores and imports keep the number they bring
  END IF;
  IF prefix IS NULL THEN
    RAISE EXCEPTION 'No record number prefix for category %', NEW.category;
  END IF;
  record_year := ${MANILA_YEAR_SQL('COALESCE(NEW."createdAt", now() AT TIME ZONE \'UTC\')')};
  INSERT INTO "RecordSequence" (category, year, "lastValue") VALUES (NEW.category, record_year, 1)
  ON CONFLICT (category, year) DO UPDATE SET "lastValue" = "RecordSequence"."lastValue" + 1
  RETURNING "lastValue" INTO seq;
  NEW."recordNo" := ${FORMAT_SQL('prefix', 'record_year', 'seq')};
  RETURN NEW;
END;
$$ LANGUAGE plpgsql`;

/** Update trigger: a record number never changes once assigned (a backfill may fill a missing one). */
export const KEEP_FUNCTION_SQL = `CREATE OR REPLACE FUNCTION keep_record_no() RETURNS trigger AS $$
BEGIN
  IF OLD."recordNo" IS NOT NULL AND NEW."recordNo" IS DISTINCT FROM OLD."recordNo" THEN
    RAISE EXCEPTION 'Record numbers cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql`;
