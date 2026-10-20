-- Cycle 3 issue #163 — read-only, count-only database inspection.
-- Run ONLY against an explicitly authorized and identified database.
-- Do not paste credentials, returned row contents or user identities into GitHub.
-- This script does not create backups, rehearse migrations or authorize deployment.
-- It expects the baseline schema and portal_archive table of the inspected
-- Supabase project; on different schemas, stop and inspect before rerunning.
-- NEVER substitute seed, db:reset, db:clean or migrate deploy for this script.

BEGIN TRANSACTION READ ONLY;

-- Confirm the inspected database identity. This does not prove which DB Render uses.
SELECT
  current_database() AS database_name,
  current_schema() AS schema_name,
  current_setting('server_version') AS postgres_version;

-- Only returns migration names and states, not credentials or business data.
SELECT
  migration_name,
  CASE
    WHEN finished_at IS NOT NULL THEN 'applied'
    WHEN rolled_back_at IS NOT NULL THEN 'rolled_back'
    ELSE 'failed_or_incomplete'
  END AS state
FROM public."_prisma_migrations"
ORDER BY started_at;

-- Count-only evidence before dropping the legacy dateAndTime column.
SELECT
  (SELECT COUNT(*) FROM "DeliveryRecord") AS delivery_rows,
  (SELECT COUNT(*) FROM "DeliveryRecord" WHERE "dateAndTime" IS NOT NULL)
    AS nonnull_legacy_date_time,
  (SELECT COUNT(*) FROM portal_archive.delivery_date_before_20261007_migration)
    AS archived_rows,
  (SELECT COUNT(*)
   FROM "DeliveryRecord" AS r
   LEFT JOIN portal_archive.delivery_date_before_20261007_migration AS a
     ON a.record_id = r.id
   WHERE a.record_id IS NULL) AS rows_missing_archive,
  (SELECT COUNT(*)
   FROM portal_archive.delivery_date_before_20261007_migration AS a
   LEFT JOIN "DeliveryRecord" AS r
     ON r.id = a.record_id
   WHERE r.id IS NULL) AS orphaned_archive_rows,
  (SELECT COUNT(*)
   FROM "DeliveryRecord" AS r
   JOIN portal_archive.delivery_date_before_20261007_migration AS a
     ON a.record_id = r.id
   WHERE r."dateAndTime" IS DISTINCT FROM a.legacy_date_and_time)
     AS archived_value_mismatches,
  (SELECT COUNT(*)
   FROM (
     SELECT record_id
     FROM portal_archive.delivery_date_before_20261007_migration
     GROUP BY record_id HAVING COUNT(*) > 1
   ) AS duplicates) AS duplicate_archive_record_ids;

-- Exact-name deterministic Driver identity preview. Returns counts only.
-- Never publish user names, record identifiers or private assignment details.
WITH profiles AS (
  SELECT
    d.id,
    d.name,
    (SELECT COUNT(*) FROM "User" u
     WHERE u.role = 'DRIVER' AND u.name = d.name) AS login_matches,
    (SELECT COUNT(*) FROM "Driver" d2
     WHERE d2.type = 'DRIVER' AND d2.name = d.name) AS profile_matches
  FROM "Driver" d
  WHERE d.type = 'DRIVER'
),
assignments AS (
  SELECT
    (SELECT COUNT(*) FROM "Driver" d
     WHERE d.type = 'DRIVER' AND d.name = r.driver) AS profile_matches,
    (SELECT COUNT(*) FROM "User" u
     WHERE u.role = 'DRIVER' AND u.name = r.driver) AS login_matches
  FROM "DeliveryRecord" r
  WHERE r."deletedAt" IS NULL AND r.driver <> ''
)
SELECT
  (SELECT COUNT(*) FROM profiles) AS driver_profiles,
  (SELECT COUNT(*) FROM "User" WHERE role = 'DRIVER') AS driver_logins,
  (SELECT COUNT(*) FROM profiles
   WHERE profile_matches = 1 AND login_matches = 1) AS uniquely_linkable_profiles,
  (SELECT COUNT(*) FROM profiles WHERE login_matches = 0)
    AS profiles_without_login,
  (SELECT COUNT(*) FROM profiles
   WHERE profile_matches > 1 OR login_matches > 1) AS ambiguous_profiles,
  (SELECT COUNT(*) FROM assignments) AS assigned_records,
  (SELECT COUNT(*) FROM assignments
   WHERE profile_matches = 1 AND login_matches = 1) AS matching_login_assignments,
  (SELECT COUNT(*) FROM assignments
   WHERE profile_matches = 1 AND login_matches = 0) AS unlinked_login_assignments,
  (SELECT COUNT(*) FROM assignments
   WHERE profile_matches <> 1 OR login_matches > 1) AS ambiguous_or_missing_assignments;

-- Track columns to detect whether the connected DB is pre- or post-migration.
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'DeliveryRecord'
      AND column_name IN ('dateAndTime', 'driverId', 'completedLate', 'daysLate'))
    OR (table_name = 'Driver' AND column_name = 'userId')
    OR (table_name = 'User' AND column_name = 'microsoftApprovedAt')
  )
ORDER BY table_name, column_name;

COMMIT;
