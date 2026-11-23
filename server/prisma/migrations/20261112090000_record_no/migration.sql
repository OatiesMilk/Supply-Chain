-- DeliveryRecord.recordNo: short user-facing record numbers, e.g. DEL-26-00042.
-- Format {PREFIX}-{YY}-{NNNNN}; the counter restarts each Asia/Manila year per category.
-- Run `npm run records:record-no-dry-run --workspace=mg-portal-server` first.
-- Rollback (loses the numbers, the internal ids are untouched):
--   DROP TRIGGER IF EXISTS "DeliveryRecord_keep_record_no" ON "DeliveryRecord";
--   DROP TRIGGER IF EXISTS "DeliveryRecord_assign_record_no" ON "DeliveryRecord";
--   DROP FUNCTION IF EXISTS keep_record_no(); DROP FUNCTION IF EXISTS assign_record_no();
--   DROP INDEX IF EXISTS "DeliveryRecord_recordNo_key";
--   ALTER TABLE "DeliveryRecord" DROP COLUMN IF EXISTS "recordNo";
--   DROP TABLE IF EXISTS "RecordSequence";
BEGIN;

CREATE TABLE "RecordSequence" (
    "category" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecordSequence_pkey" PRIMARY KEY ("category","year")
);

ALTER TABLE "DeliveryRecord" ADD COLUMN "recordNo" TEXT;

-- Backfill every existing row, soft-deleted ones included, oldest first.
UPDATE "DeliveryRecord" r
SET "recordNo" = b.record_no
FROM (SELECT n.id, n.category, n.year, n.seq,
    n.prefix || '-' || lpad((n.year % 100)::text, 2, '0') || '-' || lpad(n.seq::text, GREATEST(5, length(n.seq::text)), '0') AS record_no
  FROM (
    SELECT r.id, r.category, CASE r.category
    WHEN 'DELIVERY' THEN 'DEL'
    WHEN 'RMA' THEN 'RMA'
    WHEN 'PROCUREMENT_PICKUP' THEN 'PUP'
    WHEN 'SALES_ORDERS' THEN 'SO'
    WHEN 'ACCOUNTING_COLLECTION' THEN 'COL'
  END AS prefix, y.year,
      (COALESCE(s."lastValue", 0) + ROW_NUMBER() OVER (PARTITION BY r.category, y.year ORDER BY r."createdAt", r.id))::int AS seq
    FROM "DeliveryRecord" r
    CROSS JOIN LATERAL (SELECT EXTRACT(YEAR FROM ((r."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Manila'))::int AS year) y
    LEFT JOIN "RecordSequence" s ON s.category = r.category AND s.year = y.year
    WHERE r."recordNo" IS NULL
  ) n) b
WHERE b.id = r.id AND r."recordNo" IS NULL;

INSERT INTO "RecordSequence" (category, year, "lastValue")
SELECT r.category, EXTRACT(YEAR FROM ((r."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Manila'))::int, max(split_part(r."recordNo", '-', 3)::int)
FROM "DeliveryRecord" r
WHERE r."recordNo" IS NOT NULL
GROUP BY 1, 2
ON CONFLICT (category, year) DO UPDATE SET "lastValue" = GREATEST("RecordSequence"."lastValue", EXCLUDED."lastValue");

ALTER TABLE "DeliveryRecord" ALTER COLUMN "recordNo" SET NOT NULL;
CREATE UNIQUE INDEX "DeliveryRecord_recordNo_key" ON "DeliveryRecord"("recordNo");

CREATE OR REPLACE FUNCTION assign_record_no() RETURNS trigger AS $$
DECLARE
  prefix text := CASE NEW.category
    WHEN 'DELIVERY' THEN 'DEL'
    WHEN 'RMA' THEN 'RMA'
    WHEN 'PROCUREMENT_PICKUP' THEN 'PUP'
    WHEN 'SALES_ORDERS' THEN 'SO'
    WHEN 'ACCOUNTING_COLLECTION' THEN 'COL'
  END;
  record_year int;
  seq int;
BEGIN
  IF NEW."recordNo" IS NOT NULL THEN
    RETURN NEW; -- restores and imports keep the number they bring
  END IF;
  IF prefix IS NULL THEN
    RAISE EXCEPTION 'No record number prefix for category %', NEW.category;
  END IF;
  record_year := EXTRACT(YEAR FROM ((COALESCE(NEW."createdAt", now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Manila'))::int;
  INSERT INTO "RecordSequence" (category, year, "lastValue") VALUES (NEW.category, record_year, 1)
  ON CONFLICT (category, year) DO UPDATE SET "lastValue" = "RecordSequence"."lastValue" + 1
  RETURNING "lastValue" INTO seq;
  NEW."recordNo" := prefix || '-' || lpad((record_year % 100)::text, 2, '0') || '-' || lpad(seq::text, GREATEST(5, length(seq::text)), '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION keep_record_no() RETURNS trigger AS $$
BEGIN
  IF OLD."recordNo" IS NOT NULL AND NEW."recordNo" IS DISTINCT FROM OLD."recordNo" THEN
    RAISE EXCEPTION 'Record numbers cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DeliveryRecord_assign_record_no" BEFORE INSERT ON "DeliveryRecord"
  FOR EACH ROW EXECUTE FUNCTION assign_record_no();

CREATE TRIGGER "DeliveryRecord_keep_record_no" BEFORE UPDATE OF "recordNo" ON "DeliveryRecord"
  FOR EACH ROW EXECUTE FUNCTION keep_record_no();

COMMIT;
