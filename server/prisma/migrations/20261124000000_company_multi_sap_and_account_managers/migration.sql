-- Additive, zero-data-loss migration: optional multi-SAP numbers and multiple
-- Account Managers per Company. Legacy Company."sapNumber" and
-- Company."defaultAccountManagerId" stay in place as synchronized snapshots
-- (first SAP number / first active assigned Account Manager).
BEGIN;

ALTER TABLE "Company" ALTER COLUMN "sapNumber" SET DEFAULT '';

CREATE TABLE IF NOT EXISTS "CompanySapNumber" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyId" TEXT NOT NULL,
  "sapNumber" TEXT NOT NULL,
  "normalizedNumber" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanySapNumber_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CompanySapNumber_normalizedNumber_key" ON "CompanySapNumber"("normalizedNumber");
CREATE INDEX IF NOT EXISTS "CompanySapNumber_companyId_idx" ON "CompanySapNumber"("companyId");
-- Same posture as every other public table on Supabase: only the server role reads it.
ALTER TABLE "CompanySapNumber" ENABLE ROW LEVEL SECURITY;

-- Fail fast if legacy data holds case-insensitive SAP duplicates across companies.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Company"
     WHERE btrim("sapNumber") <> ''
     GROUP BY lower(btrim("sapNumber"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate non-blank Company SAP numbers (case-insensitive) exist. Resolve them before applying this migration.';
  END IF;
END $$;

-- Backfill non-blank legacy SAP numbers. Blank ones stay unassigned (valid walk-in clients).
INSERT INTO "CompanySapNumber" ("id", "companyId", "sapNumber", "normalizedNumber", "position")
SELECT 'legacy-company-sap-' || md5("id" || ':' || lower(btrim("sapNumber"))),
       "id", btrim("sapNumber"), lower(btrim("sapNumber")), 0
  FROM "Company"
 WHERE btrim("sapNumber") <> ''
ON CONFLICT DO NOTHING;
-- Keep the snapshot equal to the stored (trimmed) first SAP number.
UPDATE "Company" SET "sapNumber" = btrim("sapNumber") WHERE "sapNumber" <> btrim("sapNumber");

CREATE TABLE IF NOT EXISTS "CompanyAccountManager" (
  "companyId" TEXT NOT NULL,
  "accountManagerId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanyAccountManager_pkey" PRIMARY KEY ("companyId", "accountManagerId"),
  CONSTRAINT "CompanyAccountManager_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompanyAccountManager_accountManagerId_fkey"
    FOREIGN KEY ("accountManagerId") REFERENCES "AccountManager"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "CompanyAccountManager_accountManagerId_idx" ON "CompanyAccountManager"("accountManagerId");
ALTER TABLE "CompanyAccountManager" ENABLE ROW LEVEL SECURITY;

-- Backfill legacy default Account Manager assignments.
INSERT INTO "CompanyAccountManager" ("companyId", "accountManagerId")
SELECT "id", "defaultAccountManagerId"
  FROM "Company"
 WHERE "defaultAccountManagerId" IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
