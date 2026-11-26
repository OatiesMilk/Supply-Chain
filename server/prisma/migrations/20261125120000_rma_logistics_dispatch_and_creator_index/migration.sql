-- Additive, zero-data-loss migration for TASS Feature 5b:
--   1. Adds composite index on DeliveryRecord(category, createdById) for Created By filtering.
--   2. Adds "RmaLogisticsDispatch" table recording TASS -> Logistics daily handoffs with
--      idempotency key, strict CHECK constraints, and Supabase-compatible Row-Level Security.
--   Existing columns and rows are not altered. Every statement is idempotent so a
--   re-run on an already-migrated database preserves existing dispatch rows.
--
-- Rollback (zero impact on existing DeliveryRecord or User rows):
--   DROP TABLE IF EXISTS "RmaLogisticsDispatch";
--   DROP INDEX IF EXISTS "DeliveryRecord_category_createdById_idx";
BEGIN;

CREATE INDEX IF NOT EXISTS "DeliveryRecord_category_createdById_idx"
  ON "DeliveryRecord"("category", "createdById");

CREATE TABLE IF NOT EXISTS "RmaLogisticsDispatch" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "dispatchDate" TEXT NOT NULL,
  "dispatchedById" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "recipientName" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "recordIds" TEXT[] NOT NULL,
  "recordCount" INTEGER NOT NULL,
  "logisticsCount" INTEGER NOT NULL DEFAULT 0,
  "supplierCount" INTEGER NOT NULL DEFAULT 0,
  "internalCount" INTEGER NOT NULL DEFAULT 0,
  "routeSlipFileName" TEXT NOT NULL,
  "clientSlipsFileName" TEXT NOT NULL,
  "note" TEXT,
  "inAppNotificationId" TEXT,
  "emailStatus" TEXT NOT NULL,
  "emailMethod" TEXT,
  "emailError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RmaLogisticsDispatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RmaLogisticsDispatch_dispatchedById_fkey"
    FOREIGN KEY ("dispatchedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RmaLogisticsDispatch_recipientUserId_fkey"
    FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RmaLogisticsDispatch_dispatchDate_check"
    CHECK ("dispatchDate" ~ '^\d{4}-\d{2}-\d{2}$'),
  -- array_length() is NULL for an empty array; COALESCE keeps the CHECK from
  -- evaluating to NULL (which PostgreSQL treats as passing).
  CONSTRAINT "RmaLogisticsDispatch_recordCount_check"
    CHECK ("recordCount" > 0 AND "recordCount" <= 100
      AND COALESCE(array_length("recordIds", 1), 0) = "recordCount"),
  CONSTRAINT "RmaLogisticsDispatch_movementCounts_check"
    CHECK ("logisticsCount" >= 0 AND "supplierCount" >= 0 AND "internalCount" >= 0
      AND "logisticsCount" + "supplierCount" + "internalCount" = "recordCount"),
  CONSTRAINT "RmaLogisticsDispatch_emailStatus_check"
    CHECK ("emailStatus" IN ('SENT', 'MOCKED', 'SKIPPED', 'FAILED')),
  CONSTRAINT "RmaLogisticsDispatch_emailMethod_check"
    CHECK ("emailMethod" IS NULL OR "emailMethod" IN ('graph', 'smtp', 'mock'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "RmaLogisticsDispatch_idempotencyKey_key"
  ON "RmaLogisticsDispatch"("idempotencyKey");

CREATE INDEX IF NOT EXISTS "RmaLogisticsDispatch_dispatchDate_createdAt_idx"
  ON "RmaLogisticsDispatch"("dispatchDate", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "RmaLogisticsDispatch_dispatchedById_createdAt_idx"
  ON "RmaLogisticsDispatch"("dispatchedById", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "RmaLogisticsDispatch_recipientUserId_createdAt_idx"
  ON "RmaLogisticsDispatch"("recipientUserId", "createdAt" DESC);

-- Match the Supabase RLS posture of every other public table: only the server role accesses it.
ALTER TABLE "RmaLogisticsDispatch" ENABLE ROW LEVEL SECURITY;

COMMIT;
