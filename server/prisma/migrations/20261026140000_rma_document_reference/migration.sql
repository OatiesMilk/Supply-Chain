ALTER TABLE "DeliveryRecord"
  ADD COLUMN "rmaReference" TEXT,
  ADD COLUMN "legacySapReference" TEXT;

-- Keep the existing SAP value for traceability, but never treat it as the RMA
-- document reference. Non-SAP reference values are migrated as document refs.
UPDATE "DeliveryRecord"
SET "legacySapReference" = "reference",
    "reference" = ''
WHERE "category" = 'RMA'
  AND "reference" ~* '^SAP[-_]';

UPDATE "DeliveryRecord"
SET "rmaReference" = "reference",
    "reference" = ''
WHERE "category" = 'RMA'
  AND "reference" <> ''
  AND "reference" !~* '^SAP[-_]';

CREATE INDEX "DeliveryRecord_category_rmaReference_idx"
  ON "DeliveryRecord"("category", "rmaReference");
