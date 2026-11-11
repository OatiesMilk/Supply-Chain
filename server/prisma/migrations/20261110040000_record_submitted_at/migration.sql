-- DeliveryRecord.submittedAt: when a record last left Draft.
-- Additive and nullable. Rollback: ALTER TABLE "DeliveryRecord" DROP COLUMN "submittedAt";
-- Run `npm run records:submitted-at-dry-run --workspace=mg-portal-server` first.
BEGIN;

ALTER TABLE "DeliveryRecord" ADD COLUMN "submittedAt" TIMESTAMP(3);

-- Rule 1: the latest audit entry where is_draft went from Yes to No.
UPDATE "DeliveryRecord" r
SET "submittedAt" = a.submitted_at
FROM (SELECT DISTINCT ON ("recordId") "recordId", "timestamp" AS submitted_at
  FROM "AuditLog"
  WHERE "recordType" = 'DeliveryRecord'
    AND "action" = 'UPDATE'
    AND "previousValue" LIKE '%"is_draft":"Yes"%'
    AND "newValue" LIKE '%"is_draft":"No"%'
  ORDER BY "recordId", "timestamp" DESC) a
WHERE a."recordId" = r."id" AND r."draft" = false AND r."submittedAt" IS NULL;

-- Rule 2: other non-draft records were created as submitted.
UPDATE "DeliveryRecord"
SET "submittedAt" = "createdAt"
WHERE "draft" = false AND "submittedAt" IS NULL;

-- Rule 3: drafts stay NULL.

COMMIT;
