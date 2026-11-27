-- Additive, zero-data-loss migration:
--   1. DeliveryRecord.isInternalTransfer (non-RMA internal Logistics transfer classification for TXO)
--   2. RmaReferenceSequence (atomic daily counter per (prefix, Asia/Manila YYYY-MM-DD))
--   3. Partial unique index and immutability trigger for allocated RMA document references
--
-- Rollback (preserves all DeliveryRecord rows and existing rmaReference values):
--   DROP TRIGGER IF EXISTS "DeliveryRecord_keep_rma_reference" ON "DeliveryRecord";
--   DROP FUNCTION IF EXISTS keep_rma_reference();
--   DROP INDEX IF EXISTS "DeliveryRecord_rmaReference_auto_key";
--   DROP INDEX IF EXISTS "DeliveryRecord_category_isInternalTransfer_status_idx";
--   ALTER TABLE "DeliveryRecord" DROP COLUMN IF EXISTS "isInternalTransfer";
--   DROP TABLE IF EXISTS "RmaReferenceSequence";
BEGIN;

-- 1. Explicit non-RMA internal transfer flag (false for every existing row).
ALTER TABLE "DeliveryRecord"
  ADD COLUMN IF NOT EXISTS "isInternalTransfer" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "DeliveryRecord_category_isInternalTransfer_status_idx"
  ON "DeliveryRecord"("category", "isInternalTransfer", "status");

-- 2. Atomic daily sequence per (TASS slip prefix, Asia/Manila calendar date).
CREATE TABLE IF NOT EXISTS "RmaReferenceSequence" (
  "prefix" TEXT NOT NULL,
  "manilaDate" TEXT NOT NULL,
  "lastValue" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "RmaReferenceSequence_pkey" PRIMARY KEY ("prefix", "manilaDate"),
  CONSTRAINT "RmaReferenceSequence_prefix_check"
    CHECK ("prefix" IN ('POS', 'RTC', 'RTS', 'ARD', 'RR', 'TXO')),
  CONSTRAINT "RmaReferenceSequence_manilaDate_check"
    CHECK ("manilaDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  CONSTRAINT "RmaReferenceSequence_lastValue_check"
    CHECK ("lastValue" >= 0)
);

-- Same Supabase posture as every other public table: only the server role accesses it.
ALTER TABLE "RmaReferenceSequence" ENABLE ROW LEVEL SECURITY;

-- 3. Seed the counters from existing RMA references that already use
--    <PREFIX><MMDDYY>-<NN> with a real calendar date, so new numbers never
--    collide with them. Malformed legacy strings are ignored.
WITH parsed AS (
  SELECT
    m[1] AS prefix,
    m[2]::int AS mm,
    m[3]::int AS dd,
    m[4]::int AS yy,
    m[5] AS seq_text
  FROM "DeliveryRecord" r
  CROSS JOIN LATERAL regexp_match(
    btrim(r."rmaReference"),
    '^(POS|RTC|RTS|ARD|RR|TXO)([0-9]{2})([0-9]{2})([0-9]{2})-([0-9]{2,})$'
  ) AS m
  WHERE r."category" = 'RMA'
    AND r."rmaReference" IS NOT NULL
    AND m IS NOT NULL
),
valid_dates AS (
  SELECT
    prefix,
    lpad((2000 + yy)::text, 4, '0') || '-' || lpad(mm::text, 2, '0') || '-' || lpad(dd::text, 2, '0') AS manila_date,
    seq_text::int AS seq
  FROM parsed
  WHERE length(seq_text) <= 9
    AND seq_text::int >= 1
    AND mm BETWEEN 1 AND 12
    AND dd BETWEEN 1 AND (
      CASE
        WHEN mm IN (1, 3, 5, 7, 8, 10, 12) THEN 31
        WHEN mm IN (4, 6, 9, 11) THEN 30
        WHEN mm = 2 AND ((2000 + yy) % 4 = 0 AND ((2000 + yy) % 100 <> 0 OR (2000 + yy) % 400 = 0)) THEN 29
        WHEN mm = 2 THEN 28
        ELSE 0
      END
    )
)
INSERT INTO "RmaReferenceSequence" ("prefix", "manilaDate", "lastValue")
SELECT prefix, manila_date, max(seq)
  FROM valid_dates
 GROUP BY prefix, manila_date
ON CONFLICT ("prefix", "manilaDate")
DO UPDATE SET "lastValue" = GREATEST("RmaReferenceSequence"."lastValue", EXCLUDED."lastValue");

-- 4. Fail fast if existing data already holds duplicate canonical slip references.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM "DeliveryRecord"
     WHERE "category" = 'RMA'
       AND "rmaReference" ~ '^(POS|RTC|RTS|ARD|RR|TXO)[0-9]{6}-[0-9]{2,}$'
     GROUP BY "rmaReference"
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate canonical TASS slip references exist in DeliveryRecord.rmaReference. Resolve duplicates before applying this migration.';
  END IF;
END $$;

-- The partial unique index forbids duplicate auto-generated slip references
-- while leaving legacy free-text references and NULL values untouched.
CREATE UNIQUE INDEX IF NOT EXISTS "DeliveryRecord_rmaReference_auto_key"
  ON "DeliveryRecord"("rmaReference")
  WHERE "category" = 'RMA' AND "rmaReference" ~ '^(POS|RTC|RTS|ARD|RR|TXO)[0-9]{6}-[0-9]{2,}$';

-- 5. Defense in depth: once an RMA has a non-empty rmaReference it cannot be
--    overwritten or cleared (NULL/blank -> assigned stays allowed for legacy rows).
CREATE OR REPLACE FUNCTION keep_rma_reference() RETURNS trigger AS $$
BEGIN
  IF OLD."category" = 'RMA'
     AND OLD."rmaReference" IS NOT NULL
     AND btrim(OLD."rmaReference") <> ''
     AND NEW."rmaReference" IS DISTINCT FROM OLD."rmaReference" THEN
    RAISE EXCEPTION 'RMA document reference cannot be changed once assigned';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "DeliveryRecord_keep_rma_reference" ON "DeliveryRecord";
CREATE TRIGGER "DeliveryRecord_keep_rma_reference"
  BEFORE UPDATE OF "rmaReference" ON "DeliveryRecord"
  FOR EACH ROW EXECUTE FUNCTION keep_rma_reference();

COMMIT;
