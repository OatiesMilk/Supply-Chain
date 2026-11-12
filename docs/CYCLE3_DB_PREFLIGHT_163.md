# Cycle 3 — Database preflight, migration review and release decision (#163)

> **Read-only assessment — 2026-10-14. NO-GO for #93 pending isolated target, backup/restore and rehearsal.**
>
> This is evidence from a directly inspected Supabase project and Render service metadata, **not proof that Render points at that project**. Preserve [DONT_BREAK_THIS.md](../DONT_BREAK_THIS.md) and the release gate [#162](https://github.com/MarcZxc1/Supply-Chain/issues/162).

## Identified infrastructure (metadata-only)

- Render service: `Supply-Chain` (`srv-dav06no473hc73cuirkg`) tracks `staging` and has auto-deploy enabled. Service root is `server/`; startup command is `npx prisma migrate deploy && npm run start`. **Merging #93 can apply schema changes to whatever database its secret `DATABASE_URL` points at.**
- Supabase project inspected: `bpuloyyvwhadadttqyvx` (`Supply Chain`; active). Query returned `current_database()=postgres`, PostgreSQL `17.11`.
- **Unknown:** the actual host/project/database referenced by Render's `DATABASE_URL`; Cloudflare preview-vs-staging isolation; any complete database backup/snapshot and successful restoration. Health checks do not answer these questions.
- No deployment, migration, seed, upload, backup or DB write was performed in this audit.

## Database evidence — inspected Supabase project only

| Verification | Result |
| --- | ---: |
| `_prisma_migrations` completed | **5 of 5** |
| Incomplete / failed / rolled-back migration entries | **0 / 0 / 0** |
| `DeliveryRecord` rows | **64** |
| Non-null legacy `DeliveryRecord.dateAndTime` values | **64** |
| `portal_archive.delivery_date_before_20261007_migration` rows | **64** |
| Source records lacking an archive row | **0** |
| Archive rows without a source record | **0** |
| Archived values not matching current legacy values | **0** |
| Duplicate archive record IDs | **0** |
| Driver directory profiles (`type=DRIVER`) | **4** |
| Portal user accounts (`role=DRIVER`) | **1** |
| Profiles with an unambiguous same-name matching login | **1** |
| Profiles with no matching login | **3** |
| Nondeleted records assigned by driver display name | **26** |
| Assignments with a unique matching login/profile | **2** |
| Assignments with a unique profile but **no** matching login | **24** |
| POD attachment metadata rows | **1** |

The archive preserves this legacy field for the inspected rows but is **not** a full recoverable DB backup. The Driver numbers are count-only; do not publish user names, IDs or assignment details. Until Admin-approved account linking occurs, ID-based access will intentionally deny those 24 assignments to the otherwise unlinked users. Do not auto-create accounts.

## Migration assessment against `dev`

Five migration directories are represented by completed database history:
1. `20260922071007_init`
2. `20260923020300_link_account_users_fk`
3. `20260924065827_init`
4. `20260930120000_add_pod_attachments`
5. `20260930150000_add_line_items`

Four additional `dev` migrations are **absent from the inspected project's applied history** (not necessarily absent from Render's unidentified actual DB target):

| Migration | Change | Risk / required rehearsal |
| --- | --- | --- |
| `20261007060000_remove_delivery_record_date_and_time` | **DROP** non-null `DeliveryRecord.dateAndTime` column | Destructive; verify 64/64 archive and independent restore; dropping does not preserve the column in a rollback |
| `20261008020000_link_driver_identity` | Adds `Driver.userId` and `DeliveryRecord.driverId`, indexes/FKs, exact unique-name backfill | Inspect 24 assignments for post-migration access; test linked/unlinked drivers against restored fixture; no auto-provisioning |
| `20261008093000_add_delivery_lateness` | Adds `completedLate` (default false) and `daysLate` (default 0) | Validate row counts, defaults and actual business/date rules |
| `20261013131000_oauth_login_state` | Adds `OAuthLoginState` and `User.microsoftApprovedAt` | Validate table/index, approved OID behavior, and local vs corporate Entra separation |

These are assessed from the checked-in SQL. **No migration was rehearsed or applied to this cloud project.**

## Executed vs pending acceptance criteria

- [x] Inspect accessible Render service metadata and record automatic migration risk (does **not** establish its database target)
- [x] Inspect Supabase migration history; compare it to `dev` migration files
- [x] Check archive completeness and equality without publishing record data
- [x] Reconcile count-only Driver profile/login risks
- [x] Review all four pending migration SQL files
- [ ] **Verify Render `DATABASE_URL` host/project identity through authorized secret-aware deployment administration** (report only safe identifiers)
- [ ] Prove staging DB/storage isolation or obtain explicit authorized shared-data deployment decision
- [ ] Capture a complete, secure recoverable backup; record restoration owner and test restore into disposable independent DB
- [ ] Run the four migrations on that disposable restored DB only; compare row counts, data preservation, Driver visibility and SSO schema
- [ ] Verify correct deployment rollback for code **and data**, not just reversing git commits
- [ ] Obtain Dylan/Julius peer review, prepare redacted evidence and record release-owner GO/NO-GO under [#162](https://github.com/MarcZxc1/Supply-Chain/issues/162)

## Safe procedure and release owner decision

1. **Identify target first.** In approved Render configuration, establish actual `DATABASE_URL` destination without copying the connection string into GitHub, issue comments, logs or chat. Compare to intended non-production database and `POD_STORAGE_PROVIDER`/bucket. Do not infer target from URL or status code.
2. **Backup before migration.** Use the target platform's supported complete database backup/snapshot process with authorized access. Record backup completion, retention and restore owner. **Prove a restore** into an independent, isolated copy. Archive table != backup.
3. **Rehearse on restored copy only.** Confirm the copied DB's identity, migrations and baseline counts; apply migrations with a connection that has access to **the isolated copy only**. Compare counts and negative permission tests. Keep independent before/after redacted evidence. Never run seed/reset on shared or staging systems.
4. **Plan rollback.** A code rollback does not reverse `DROP COLUMN`. Establish restoration decision point, maintenance/write coordination and backup restore/forward-fix procedure before any merge.
5. **Collect reviews and signoff.** Dylan reviews DB/backend/config risk; Julius verifies Driver-profile identity and test fixtures. Post a sanitized decision to #162.
6. **Do not merge PR #93 until the mandatory preflight is accepted.** Render auto-deploy would invoke `prisma migrate deploy`. Corporate Microsoft SSO remains disabled for shared staging absent the required IT authorization, even though the OID-linked login works locally.

### Reproducible count-only inspection

See [`server/prisma/preflight-163-readonly.sql`](../server/prisma/preflight-163-readonly.sql). This file contains **read-only SELECTs only** and a READ ONLY transaction. It is for **explicitly authorized** database inspection and **is not an instruction to connect to an unverified environment**. It does not create a backup, restore a DB, or rehearse a migration.

**Decision as of 2026-10-14:** **NO-GO** on PR #93, because the actual Render database target and recoverable backup/rehearsal remain unverified, regardless of green CI or the number of closed GitHub implementation issues.
