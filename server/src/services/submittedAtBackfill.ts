// SQL for the DeliveryRecord.submittedAt backfill. The migration holds the
// same statements; submittedAtBackfill.test.ts keeps the two in step. The
// audit match is a plain text match on the compact JSON written by
// serializeRecord, so a malformed legacy audit row can never abort the run.

const SUBMISSION_AUDIT = `"recordType" = 'DeliveryRecord'
    AND "action" = 'UPDATE'
    AND "previousValue" LIKE '%"is_draft":"Yes"%'
    AND "newValue" LIKE '%"is_draft":"No"%'`;

/** Latest submission audit entry per record. */
export const LATEST_SUBMISSION_AUDIT_SQL = `SELECT DISTINCT ON ("recordId") "recordId", "timestamp" AS submitted_at
  FROM "AuditLog"
  WHERE ${SUBMISSION_AUDIT}
  ORDER BY "recordId", "timestamp" DESC`;

export const BACKFILL_FROM_AUDIT_SQL = `UPDATE "DeliveryRecord" r
SET "submittedAt" = a.submitted_at
FROM (${LATEST_SUBMISSION_AUDIT_SQL}) a
WHERE a."recordId" = r."id" AND r."draft" = false AND r."submittedAt" IS NULL`;

export const BACKFILL_FROM_CREATED_SQL = `UPDATE "DeliveryRecord"
SET "submittedAt" = "createdAt"
WHERE "draft" = false AND "submittedAt" IS NULL`;

/** Read-only counts per rule, matching the two UPDATEs above. */
export const BACKFILL_COUNTS_SQL = `WITH latest AS (${LATEST_SUBMISSION_AUDIT_SQL})
SELECT
  count(*) FILTER (WHERE r."draft" = false AND r."submittedAt" IS NULL AND l."recordId" IS NOT NULL)::int AS from_audit,
  count(*) FILTER (WHERE r."draft" = false AND r."submittedAt" IS NULL AND l."recordId" IS NULL)::int AS from_created_at,
  count(*) FILTER (WHERE r."draft" = true)::int AS drafts_left_null,
  count(*) FILTER (WHERE r."submittedAt" IS NOT NULL)::int AS already_set,
  count(*)::int AS total
FROM "DeliveryRecord" r
LEFT JOIN latest l ON l."recordId" = r."id"`;
