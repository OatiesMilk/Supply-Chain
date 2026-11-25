-- Additive, zero-data-loss migration for TASS Feature 5a:
--   Adds the private per-user digital signature metadata table "UserSignature"
--   with strict CHECK constraints (MIME, size <= 2 MiB, opaque storageKey format,
--   pixel dimensions) and Supabase-compatible Row-Level Security enabled.
--   Existing tables are not altered.
--
-- Rollback (zero impact on existing User or DeliveryRecord rows):
--   DROP TABLE IF EXISTS "UserSignature";
BEGIN;

CREATE TABLE IF NOT EXISTS "UserSignature" (
  "userId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "uploadedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserSignature_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "UserSignature_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UserSignature_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "UserSignature_mimeType_check"
    CHECK ("mimeType" IN ('image/png', 'image/jpeg')),
  CONSTRAINT "UserSignature_size_check"
    CHECK ("size" > 0 AND "size" <= 2097152),
  CONSTRAINT "UserSignature_storageKey_check"
    CHECK ("storageKey" ~ '^sig-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$'),
  -- Both dimensions are NULL together or both are within 16..4096. The explicit
  -- IS NOT NULL terms stop a single NULL from making the CHECK evaluate to NULL
  -- (which PostgreSQL treats as passing).
  CONSTRAINT "UserSignature_dimensions_check"
    CHECK (
      ("width" IS NULL AND "height" IS NULL)
      OR ("width" IS NOT NULL AND "height" IS NOT NULL
        AND "width" >= 16 AND "width" <= 4096 AND "height" >= 16 AND "height" <= 4096)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserSignature_storageKey_key"
  ON "UserSignature"("storageKey");

CREATE INDEX IF NOT EXISTS "UserSignature_uploadedById_idx"
  ON "UserSignature"("uploadedById");

-- Same Supabase posture as every other public table: only the server role accesses it.
ALTER TABLE "UserSignature" ENABLE ROW LEVEL SECURITY;

COMMIT;
