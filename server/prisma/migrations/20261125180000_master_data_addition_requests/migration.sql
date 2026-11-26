-- Additive, zero-data-loss migration for TASS Feature 4b (Sec 5.4):
--   Adds "MasterDataAdditionRequest" for TASS-submitted, ADMIN-reviewed Company & Supplier
--   addition requests with strict PostgreSQL CHECK constraints, a partial unique index for
--   pending requests, optimistic version, entity links, and Supabase-compatible RLS.
--   Existing tables, columns, and rows are not altered. Every statement is idempotent so
--   re-running on an already-migrated database preserves all existing rows.
--
-- Rollback (zero impact on Company, Supplier, User, DeliveryRecord, Notification, or AuditLog):
--   DROP TABLE IF EXISTS "MasterDataAdditionRequest";
BEGIN;

CREATE TABLE IF NOT EXISTS "MasterDataAdditionRequest" (
  "id" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "sapNumbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "contactPerson" TEXT NOT NULL DEFAULT '',
  "contactPhone" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "address" TEXT NOT NULL DEFAULT '',
  "city" TEXT NOT NULL DEFAULT '',
  "accountManagerIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "supplierCategoryIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1,
  "requestedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "reviewNotes" TEXT,
  "createdCompanyId" TEXT,
  "createdSupplierId" TEXT,
  "createdEntityName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MasterDataAdditionRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MasterDataAdditionRequest_requestedById_fkey"
    FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MasterDataAdditionRequest_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MasterDataAdditionRequest_createdCompanyId_fkey"
    FOREIGN KEY ("createdCompanyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MasterDataAdditionRequest_createdSupplierId_fkey"
    FOREIGN KEY ("createdSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MasterDataAdditionRequest_entityType_check"
    CHECK ("entityType" IN ('COMPANY', 'SUPPLIER')),
  CONSTRAINT "MasterDataAdditionRequest_status_check"
    CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED')),
  CONSTRAINT "MasterDataAdditionRequest_version_check"
    CHECK ("version" >= 1),
  CONSTRAINT "MasterDataAdditionRequest_name_nonblank_check"
    CHECK (btrim("name") <> '' AND btrim("normalizedName") <> ''),
  CONSTRAINT "MasterDataAdditionRequest_entity_link_check"
    CHECK (
      NOT ("createdCompanyId" IS NOT NULL AND "createdSupplierId" IS NOT NULL)
      AND ("entityType" <> 'COMPANY' OR "createdSupplierId" IS NULL)
      AND ("entityType" <> 'SUPPLIER' OR "createdCompanyId" IS NULL)
    ),
  -- array_length() is NULL for an empty array; COALESCE keeps the CHECK from
  -- evaluating to NULL (which PostgreSQL treats as passing).
  CONSTRAINT "MasterDataAdditionRequest_entity_arrays_check"
    CHECK (
      ("entityType" = 'COMPANY' AND COALESCE(array_length("supplierCategoryIds", 1), 0) = 0)
      OR ("entityType" = 'SUPPLIER' AND COALESCE(array_length("accountManagerIds", 1), 0) = 0)
    ),
  CONSTRAINT "MasterDataAdditionRequest_lifecycle_check"
    CHECK (
      ("status" = 'PENDING'
        AND "reviewedAt" IS NULL
        AND "rejectionReason" IS NULL
        AND "createdCompanyId" IS NULL
        AND "createdSupplierId" IS NULL
        AND "createdEntityName" IS NULL)
      OR ("status" = 'APPROVED'
        AND "reviewedAt" IS NOT NULL
        AND "rejectionReason" IS NULL
        AND "createdEntityName" IS NOT NULL
        AND btrim("createdEntityName") <> '')
      OR ("status" = 'REJECTED'
        AND "reviewedAt" IS NOT NULL
        AND "rejectionReason" IS NOT NULL
        AND btrim("rejectionReason") <> ''
        AND "createdCompanyId" IS NULL
        AND "createdSupplierId" IS NULL
        AND "createdEntityName" IS NULL)
    )
);

-- Prevents concurrent duplicate PENDING requests for the same (entityType, normalizedName),
-- while allowing resubmission after a prior REJECTED request and retaining historical APPROVED rows.
CREATE UNIQUE INDEX IF NOT EXISTS "MasterDataAdditionRequest_pending_entity_name_key"
  ON "MasterDataAdditionRequest"("entityType", "normalizedName")
  WHERE "status" = 'PENDING';

CREATE INDEX IF NOT EXISTS "MasterDataAdditionRequest_status_createdAt_idx"
  ON "MasterDataAdditionRequest"("status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "MasterDataAdditionRequest_requestedById_createdAt_idx"
  ON "MasterDataAdditionRequest"("requestedById", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "MasterDataAdditionRequest_entityType_status_createdAt_idx"
  ON "MasterDataAdditionRequest"("entityType", "status", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "MasterDataAdditionRequest_reviewedById_idx"
  ON "MasterDataAdditionRequest"("reviewedById");

CREATE INDEX IF NOT EXISTS "MasterDataAdditionRequest_createdCompanyId_idx"
  ON "MasterDataAdditionRequest"("createdCompanyId");

CREATE INDEX IF NOT EXISTS "MasterDataAdditionRequest_createdSupplierId_idx"
  ON "MasterDataAdditionRequest"("createdSupplierId");

-- Match every other public table on Supabase: only the server role accesses it.
ALTER TABLE "MasterDataAdditionRequest" ENABLE ROW LEVEL SECURITY;

COMMIT;
