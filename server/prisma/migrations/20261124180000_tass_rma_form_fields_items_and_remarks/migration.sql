-- Additive, zero-data-loss migration for TASS RMA form fields:
--   1. DeliveryRecord: caseNumber, serviceSlipNo (RTC-only CHECK), clientRemarks, internalLogisticsRemarks
--   2. LineItem: position + structured RMA unit/item columns (unitType, single SN vs New/Defective SN pair,
--      purchaseDate, salesOrderNo, accessories, problemDescription, repairNote, statusTag) + CHECK constraints
--   3. RmaContact: multi-contact table with RLS enabled and an idempotent backfill from customerContact*
--
-- Rollback (preserves all existing DeliveryRecord and legacy LineItem rows/columns):
--   DROP TABLE IF EXISTS "RmaContact";
--   ALTER TABLE "LineItem" DROP CONSTRAINT IF EXISTS "LineItem_unitType_check";
--   ALTER TABLE "LineItem" DROP CONSTRAINT IF EXISTS "LineItem_serial_mode_check";
--   ALTER TABLE "LineItem" DROP CONSTRAINT IF EXISTS "LineItem_quantity_check";
--   DROP INDEX IF EXISTS "LineItem_deliveryRecordId_position_idx";
--   DROP INDEX IF EXISTS "LineItem_serialNumber_idx";
--   DROP INDEX IF EXISTS "LineItem_newSerialNumber_idx";
--   DROP INDEX IF EXISTS "LineItem_defectiveSerialNumber_idx";
--   ALTER TABLE "LineItem"
--     DROP COLUMN IF EXISTS "position", DROP COLUMN IF EXISTS "unitType", DROP COLUMN IF EXISTS "serialNumber",
--     DROP COLUMN IF EXISTS "newSerialNumber", DROP COLUMN IF EXISTS "defectiveSerialNumber", DROP COLUMN IF EXISTS "purchaseDate",
--     DROP COLUMN IF EXISTS "salesOrderNo", DROP COLUMN IF EXISTS "accessories", DROP COLUMN IF EXISTS "problemDescription",
--     DROP COLUMN IF EXISTS "repairNote", DROP COLUMN IF EXISTS "statusTag";
--   ALTER TABLE "DeliveryRecord" DROP CONSTRAINT IF EXISTS "DeliveryRecord_serviceSlipNo_rtc_check";
--   ALTER TABLE "DeliveryRecord" DROP CONSTRAINT IF EXISTS "DeliveryRecord_rma_only_fields_check";
--   DROP INDEX IF EXISTS "DeliveryRecord_category_caseNumber_idx";
--   DROP INDEX IF EXISTS "DeliveryRecord_category_serviceSlipNo_idx";
--   ALTER TABLE "DeliveryRecord"
--     DROP COLUMN IF EXISTS "caseNumber", DROP COLUMN IF EXISTS "serviceSlipNo",
--     DROP COLUMN IF EXISTS "clientRemarks", DROP COLUMN IF EXISTS "internalLogisticsRemarks";
BEGIN;

-- 1. DeliveryRecord RMA form and separated-remarks columns.
ALTER TABLE "DeliveryRecord"
  ADD COLUMN IF NOT EXISTS "caseNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "serviceSlipNo" TEXT,
  ADD COLUMN IF NOT EXISTS "clientRemarks" TEXT,
  ADD COLUMN IF NOT EXISTS "internalLogisticsRemarks" TEXT;

CREATE INDEX IF NOT EXISTS "DeliveryRecord_category_caseNumber_idx"
  ON "DeliveryRecord"("category", "caseNumber");
CREATE INDEX IF NOT EXISTS "DeliveryRecord_category_serviceSlipNo_idx"
  ON "DeliveryRecord"("category", "serviceSlipNo");

DO $$
BEGIN
  -- Service Slip (SS#) is valid only on Return to Customer Slip (RTC) records,
  -- including the legacy 'Return to Customer' / 'RTC' labels.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryRecord_serviceSlipNo_rtc_check') THEN
    ALTER TABLE "DeliveryRecord"
      ADD CONSTRAINT "DeliveryRecord_serviceSlipNo_rtc_check"
      CHECK (
        "serviceSlipNo" IS NULL
        OR (
          "category" = 'RMA'
          AND "rmaType" IN ('Return to Customer Slip', 'Return to Customer', 'RTC')
          AND btrim("serviceSlipNo") <> ''
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryRecord_rma_only_fields_check') THEN
    ALTER TABLE "DeliveryRecord"
      ADD CONSTRAINT "DeliveryRecord_rma_only_fields_check"
      CHECK (
        "category" = 'RMA'
        OR (
          "caseNumber" IS NULL
          AND "serviceSlipNo" IS NULL
          AND "clientRemarks" IS NULL
          AND "internalLogisticsRemarks" IS NULL
        )
      );
  END IF;
END $$;

-- 2. LineItem structured RMA unit/item columns (legacy rows keep NULLs and position 0).
ALTER TABLE "LineItem"
  ADD COLUMN IF NOT EXISTS "position" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "unitType" TEXT,
  ADD COLUMN IF NOT EXISTS "serialNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "newSerialNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "defectiveSerialNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "purchaseDate" TEXT,
  ADD COLUMN IF NOT EXISTS "salesOrderNo" TEXT,
  ADD COLUMN IF NOT EXISTS "accessories" TEXT,
  ADD COLUMN IF NOT EXISTS "problemDescription" TEXT,
  ADD COLUMN IF NOT EXISTS "repairNote" TEXT,
  ADD COLUMN IF NOT EXISTS "statusTag" TEXT;

CREATE INDEX IF NOT EXISTS "LineItem_deliveryRecordId_position_idx" ON "LineItem"("deliveryRecordId", "position");
CREATE INDEX IF NOT EXISTS "LineItem_serialNumber_idx" ON "LineItem"("serialNumber");
CREATE INDEX IF NOT EXISTS "LineItem_newSerialNumber_idx" ON "LineItem"("newSerialNumber");
CREATE INDEX IF NOT EXISTS "LineItem_defectiveSerialNumber_idx" ON "LineItem"("defectiveSerialNumber");

-- Same Supabase posture as every other public table: only the server role accesses it.
ALTER TABLE "LineItem" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LineItem_unitType_check') THEN
    ALTER TABLE "LineItem"
      ADD CONSTRAINT "LineItem_unitType_check"
      CHECK ("unitType" IS NULL OR "unitType" IN ('Unit', 'Item'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LineItem_serial_mode_check') THEN
    ALTER TABLE "LineItem"
      ADD CONSTRAINT "LineItem_serial_mode_check"
      CHECK ("serialNumber" IS NULL OR ("newSerialNumber" IS NULL AND "defectiveSerialNumber" IS NULL));
  END IF;

  -- NOT VALID: enforced for every new or updated row without failing the
  -- migration on any historical row saved with a non-positive quantity.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LineItem_quantity_check') THEN
    ALTER TABLE "LineItem"
      ADD CONSTRAINT "LineItem_quantity_check" CHECK ("quantity" >= 1) NOT VALID;
  END IF;
END $$;

-- 3. Multiple contact persons and phones per RMA record.
CREATE TABLE IF NOT EXISTS "RmaContact" (
  "id" TEXT NOT NULL,
  "deliveryRecordId" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RmaContact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RmaContact_deliveryRecordId_fkey"
    FOREIGN KEY ("deliveryRecordId") REFERENCES "DeliveryRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RmaContact_nonempty_check"
    CHECK (btrim("name") <> '' OR ("phone" IS NOT NULL AND btrim("phone") <> '') OR ("email" IS NOT NULL AND btrim("email") <> ''))
);

CREATE INDEX IF NOT EXISTS "RmaContact_deliveryRecordId_position_idx" ON "RmaContact"("deliveryRecordId", "position");

ALTER TABLE "RmaContact" ENABLE ROW LEVEL SECURITY;

-- Idempotently copy legacy single-contact details into RmaContact.
INSERT INTO "RmaContact" ("id", "deliveryRecordId", "position", "name", "phone", "email")
SELECT
  'legacy-rma-contact-' || md5("id"),
  "id",
  0,
  COALESCE(NULLIF(btrim("customerContactName"), ''), ''),
  NULLIF(btrim(COALESCE("customerContactPhone", '')), ''),
  NULLIF(btrim(COALESCE("customerContactEmail", '')), '')
FROM "DeliveryRecord"
WHERE "category" = 'RMA'
  AND (
    NULLIF(btrim(COALESCE("customerContactName", '')), '') IS NOT NULL
    OR NULLIF(btrim(COALESCE("customerContactPhone", '')), '') IS NOT NULL
    OR NULLIF(btrim(COALESCE("customerContactEmail", '')), '') IS NOT NULL
  )
ON CONFLICT ("id") DO NOTHING;

COMMIT;
