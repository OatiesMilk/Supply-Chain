-- TSK-100: stable Driver identity.
-- Driver profiles link to DRIVER logins by id, and deliveries reference the
-- assigned Driver profile by id. DeliveryRecord.driver stays as display text.

-- AlterTable
ALTER TABLE "DeliveryRecord" ADD COLUMN     "driverId" TEXT;

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "DeliveryRecord_driverId_idx" ON "DeliveryRecord"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_userId_key" ON "Driver"("userId");

-- AddForeignKey
ALTER TABLE "DeliveryRecord" ADD CONSTRAINT "DeliveryRecord_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill (deterministic, exact matches only — mirrors classifyDriverIdentity
-- in src/services/driverIdentity.ts). Previous access was `record.driver = user.name`
-- (exact, case-sensitive), so nothing below grants access that did not exist.
-- Ambiguous names are left unlinked for Admin review:
--   npm run drivers:identity-report --workspace=mg-portal-server

-- 1) Link a DRIVER profile to a DRIVER login only when exactly one DRIVER login
--    and exactly one DRIVER profile carry that exact name.
UPDATE "Driver" AS d
SET "userId" = u."id"
FROM "User" AS u
WHERE d."type" = 'DRIVER'
  AND u."role" = 'DRIVER'
  AND u."name" = d."name"
  AND (SELECT COUNT(*) FROM "User" AS u2 WHERE u2."role" = 'DRIVER' AND u2."name" = d."name") = 1
  AND (SELECT COUNT(*) FROM "Driver" AS d2 WHERE d2."type" = 'DRIVER' AND d2."name" = d."name") = 1;

-- 2) Point each assignment at the DRIVER profile whose exact name it stores,
--    only when exactly one DRIVER profile has that name. Records pointing at an
--    unlinked profile stay invisible to every Driver until Admin links it.
UPDATE "DeliveryRecord" AS r
SET "driverId" = d."id"
FROM "Driver" AS d
WHERE r."driverId" IS NULL
  AND r."driver" <> ''
  AND d."type" = 'DRIVER'
  AND d."name" = r."driver"
  AND (SELECT COUNT(*) FROM "Driver" AS d2 WHERE d2."type" = 'DRIVER' AND d2."name" = r."driver") = 1;
