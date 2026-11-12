-- Admin-managed Account Manager directory and Company lifecycle fields.
-- Additive: DeliveryRecord.accountManager text and existing audits are untouched.
BEGIN;

-- Company: duplicate names (ignoring case and spacing) must be merged by a
-- person before this migration can add the unique key.
ALTER TABLE "Company"
  ADD COLUMN "normalizedName" TEXT,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "defaultAccountManagerId" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Company" SET "normalizedName" = lower(regexp_replace(btrim("name"), '\s+', ' ', 'g'));
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Company" GROUP BY "normalizedName" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate Company names (ignoring case/spacing) exist. Merge them before applying this migration.';
  END IF;
  IF EXISTS (SELECT 1 FROM "Company" WHERE btrim("sapNumber") <> '' GROUP BY btrim("sapNumber") HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate Company SAP numbers exist. Correct them before applying this migration.';
  END IF;
END $$;
ALTER TABLE "Company" ALTER COLUMN "normalizedName" SET NOT NULL;
CREATE UNIQUE INDEX "Company_normalizedName_key" ON "Company"("normalizedName");
-- Nonblank SAP numbers are kept unique by the companies API under the
-- directory advisory lock (Prisma cannot model a partial unique index).

CREATE TABLE "AccountManager" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "email" TEXT,
  "userId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AccountManager_normalizedName_key" ON "AccountManager"("normalizedName");
CREATE UNIQUE INDEX "AccountManager_userId_key" ON "AccountManager"("userId");
-- Same posture as every other public table on Supabase: only the server role reads it.
ALTER TABLE "AccountManager" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "Company" ADD CONSTRAINT "Company_defaultAccountManagerId_fkey"
  FOREIGN KEY ("defaultAccountManagerId") REFERENCES "AccountManager"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Company_defaultAccountManagerId_idx" ON "Company"("defaultAccountManagerId");

-- Seed the former hardcoded list plus every name already used on records.
-- Prefer the hardcoded spelling; merge case/spacing variants by key.
WITH labels AS (
  SELECT regexp_replace(btrim("accountManager"), '\s+', ' ', 'g') AS name, 1 AS priority
    FROM "DeliveryRecord" WHERE btrim("accountManager") <> ''
  UNION ALL SELECT name, 0 FROM (VALUES ('P. Soriano'), ('D. Macaraeg'), ('F. Valenzuela'), ('R. Pagkalinawan'),
    ('M. Reyes'), ('A. Santos'), ('C. Lim')) defaults(name)
), canonical AS (
  SELECT DISTINCT ON (lower(name)) name FROM labels ORDER BY lower(name), priority, name COLLATE "C"
)
INSERT INTO "AccountManager" ("id", "name", "normalizedName", "updatedAt")
SELECT 'legacy-account-manager-' || md5(lower(name)), name, lower(name), CURRENT_TIMESTAMP FROM canonical;

-- Keep today's mail behaviour: link a name only when exactly one active,
-- non-driver portal account has that name (the old exact-match rule).
WITH matches AS (
  SELECT am."id" AS am_id, min(u."id") AS user_id, count(*) AS n
    FROM "AccountManager" am
    JOIN "User" u ON lower(regexp_replace(btrim(u."name"), '\s+', ' ', 'g')) = am."normalizedName"
     AND u."isActive" AND u."role" <> 'DRIVER'
   GROUP BY am."id"
)
UPDATE "AccountManager" am SET "userId" = m.user_id
  FROM matches m WHERE m.am_id = am."id" AND m.n = 1;

COMMIT;
