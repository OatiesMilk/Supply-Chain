# Plan: Short, readable record numbers for every record type

Status: **Approved by Dylan on 2026-11-12.**
Branch: `feature/short-record-ids` (off `dev` at `6cb73f0`, after #312 and #314).

## Approved decisions (2026-11-12)

1. Format `{PREFIX}-{YY}-{NNNNN}` (e.g. `DEL-26-00042`), counter resets each Manila year per record type.
2. Prefixes `DEL`, `RMA`, `PUP`, `SO`, `COL`.
3. Accounting Collection is numbered too (all five types).
4. Drafts get their number at creation and keep it.
5. The long internal key is hidden from users entirely (no "System ID" line).

## 1. Summary

Every record (Deliveries, RMA, Procurement Pick-up, Sales Orders and Accounting Collection) shows its database key as the "Record ID", for example `REC-3f9a2c1e-7b4d-4e8a-9c21-5d6f0e8b1a73` (40 characters). It is hard to read aloud, does not fit table columns or route slips, and tells the user nothing.

The industry-standard fix (SAP, NetSuite, Odoo, ServiceNow all do this) is to **keep the internal key and add a separate, server-generated human-readable document number**, such as `DEL-26-00042`. The internal key stays the primary key, so no foreign key, audit entry, comment, POD file or bookmark breaks. Users only ever see the short number.

**Recommended limit: 12 characters, never more than 14.** Format `{PREFIX}-{YY}-{NNNNN}`:

| Record type | Prefix | Example | Length |
| :--- | :--- | :--- | :--- |
| Deliveries | `DEL` | `DEL-26-00042` | 12 |
| RMA | `RMA` | `RMA-26-00007` | 12 |
| Procurement Pick-up | `PUP` | `PUP-26-00113` | 12 |
| Sales Orders | `SO` | `SO-26-00381` | 11 |
| Accounting Collection | `COL` | `COL-26-00019` | 12 |

The counter restarts at 1 each year per record type (year in Asia/Manila time). Five digits gives 99,999 records per type per year; if that is ever exceeded the number grows to six digits (13 characters) instead of failing.

## 2. Current behaviour (verified in code on `dev`)

- One table, `DeliveryRecord`, holds all five types; `category` tells them apart and never changes after create.
- `server/src/services/recordIds.ts` creates new keys as `REC-${randomUUID()}` (40 chars). Used by `routes/records.ts` (create) and `routes/data-sampler.ts`.
- Older rows and seeds use other key shapes: `REC-4001` (seed), deterministic staging keys (`stagingEntityId`), cuid (schema default).
- The key is shown raw as "Record ID" in: `DeliveryRecordsView` table, `RecordCreateForm` and `AccountingCollectionView` success banners, `DeliveryManifest` (screen and PDF), `RouteSlipMenu`, `DriverReportModal`, `utils/export.ts`, `utils/allOpsExport.ts`, `LogisticsDashboard` cards, `AdminPanel` audit table, and RMA notification text (`rmaReference || id`).
- The key is referenced by `AuditLog.recordId`, `Comment.recordId`, `Notification.recordId`, `RemarkLog.recordId`, `PodAttachment.recordId`, `DeliveryRecord.linkedCollectionId`, and the "Collection Record ID" input when linking a collection (placeholder `REC-12345`).
- Record search already matches `id`, `reference`, `rmaReference`, `legacySapReference`, company, driver, area and account manager.
- `reference` / `rmaReference` are user-typed SAP numbers. They are not unique and are optional on drafts, so they cannot serve as the record number.

## 3. Options considered

| Option | Verdict |
| :--- | :--- |
| A. Add a short `recordNo` alongside the existing key (recommended) | Additive, no FK rewrite, reversible, standard practice. |
| B. Replace the primary key with the short number | Rewrites every FK and audit row, breaks old exports, bookmarks and POD storage references; high risk for a cosmetic gain. Rejected. |
| C. Just truncate the UUID in the UI (e.g. last 8 chars) | Not guaranteed unique, not meaningful, not searchable in a stable way. Rejected. |
| D. Use the SAP reference | Typed by users, not unique, missing on drafts. Rejected. |

## 4. Changes

### 4.1 Database (one migration, additive)

- New table `RecordSequence (category TEXT, year INT, lastValue INT, PRIMARY KEY (category, year))`.
- New column `DeliveryRecord.recordNo TEXT`, then backfilled, then `NOT NULL` and a **unique** index.
- Backfill (inside the migration, same pattern as `20261110040000_record_submitted_at`): number every existing row, **including soft-deleted rows**, per `category` per Manila year of `createdAt`, ordered by `createdAt, id`. Then set each `RecordSequence.lastValue` to the highest number used.
- Rollback documented at the top of the migration: drop the unique index, the column and the table.
- Read-only dry-run script `server/prisma/dry-run-record-no-backfill.ts` (npm script `records:record-no-dry-run`): prints counts per type/year, the first and last 5 numbers per group, any duplicates or nulls it would produce, and writes nothing.

### 4.2 Server

- `services/recordIds.ts`: add `allocateRecordNo(tx, category, createdAt)` using one `INSERT ... ON CONFLICT (category, year) DO UPDATE SET "lastValue" = "lastValue" + 1 RETURNING "lastValue"` inside the create transaction, so concurrent creates never collide (row lock per type/year). Formatting lives in one pure function `formatRecordNo(category, year, seq)` with unit tests.
- Every create path calls it: `routes/records.ts`, `routes/data-sampler.ts`, `seed.ts`, `seed-staging.ts`, `seed-uat.ts`, `seed-driver-demo.ts` (seeds stay idempotent: an existing row keeps its number).
- Drafts get a number at creation and keep it when submitted. Deleted records keep their number; numbers are never reused, and gaps are acceptable (standard for document numbering).
- `recordNo` is server-only: ignored if sent on create or update, never editable, not part of `edit_version`.
- `serializeRecord` adds `record_no`; `id` stays in the payload for API calls.
- Search: add `recordNo` (case-insensitive contains) to the existing OR list; legacy `id` search stays so old pasted keys still work.
- Link collection: `linked_collection_id` accepts either a record number or a legacy key; the server resolves it to the key and keeps the current permission checks.
- Notifications: replace the `rmaReference || id` fallback with `rmaReference || recordNo`.
- Admin audit list: for `recordType = 'DeliveryRecord'`, return the matching `record_no` so the table can show it.

### 4.3 Client

- One helper `recordLabel(record)` returning `record.record_no` (falls back to `id` only if missing, for safety during rollout).
- Replace every user-facing "Record ID" display listed in section 2 with the record number, including Excel/PDF exports, route slips, driver reports, the manifest, dashboard cards, success banners and the admin audit table. Column header becomes "Record No.", width reduced.
- "Collection Record ID" input becomes "Collection Record No." with placeholder `COL-26-00019`.
- Internal uses of `record.id` (API calls, React keys, selection sets, POD uploads) do not change.

## 5. Permissions

No new permissions. Whoever can read a record can see its number; nobody, including Admin, can set or edit it. Linking by number keeps the existing Logistics/Admin-only rule and category read checks.

## 6. Risks

| Risk | Mitigation |
| :--- | :--- |
| Duplicate numbers under concurrent creates | Counter row lock in the create transaction, plus a unique index as the last line of defence; Postgres test creating records in parallel. |
| Backfill on live data | Dry run first, reviewed by Dylan; migration is additive and wrapped in a transaction with a documented rollback. No live write without Dylan's go-ahead. |
| Old exports, screenshots or emails show the long key | Search and collection linking still accept the legacy key. |
| A create path forgets to assign a number | `NOT NULL` makes it fail loudly; tests cover every route and seed. |
| Year boundary in UTC vs Manila | Year computed with the existing `MANILA_TIME_ZONE` helper; unit test for 31 Dec 23:30 Manila. |
| E2E tests asserting on `REC-` text | Update selectors in the same phase as the UI change. |

## 7. Acceptance criteria (testable)

1. **AC1** A new record of each of the five types gets a number matching `^(DEL|RMA|PUP|SO|COL)-\d{2}-\d{5,}$`, at most 14 characters.
2. **AC2** Numbers increase by one per type within a year and restart at `00001` for the first record of a new Manila year.
3. **AC3** Creating 20 records of one type in parallel yields 20 distinct, consecutive numbers with no errors.
4. **AC4** A draft gets its number on create and keeps it after submission; a deleted record's number is never reused.
5. **AC5** Sending `record_no` on create or update is ignored; the stored value does not change.
6. **AC6** After the backfill, every existing row (including soft-deleted) has a unique number; the dry-run report and the migration produce the same counts; the next new record continues after the highest backfilled number.
7. **AC7** The records table, create success banner, manifest (screen and PDF), route slip, driver report, Excel/PDF exports, dashboard cards and admin audit table show the record number, not the long key.
8. **AC8** Searching by a full or partial record number finds the record; searching by a legacy key still finds it.
9. **AC9** Linking a collection works with either the record number or the legacy key, and still fails for roles that cannot link or cannot read Accounting Collection.
10. **AC10** RMA notification text shows `rmaReference`, or the record number when there is none.
11. **AC11** Existing API calls by `id`, comments, remarks, audit history and POD attachments keep working unchanged for old and new records.
12. **AC12** Client and server type checks and unit tests pass; existing E2E suites pass after selector updates.

## 8. Open questions for Dylan

1. **Format.** OK with `DEL-26-00042` (12 chars, yearly reset)? Alternatives: `DEL-2026-00042` (14 chars, full year) or `DEL-000042` (10 chars, never resets).
2. **Prefixes.** OK with `DEL`, `RMA`, `PUP`, `SO`, `COL`? Some teams prefer `PU` or `PRC` for Procurement Pick-up, or `AC` for Accounting Collection.
3. **Accounting Collection.** Your TODO lists four types; the plan also numbers Accounting Collection so every record looks the same. OK?
4. **Drafts.** Number assigned at create (recommended, simplest and stable), or only when a draft is first submitted (no gaps from abandoned drafts, but drafts show no number)?
5. **Legacy key visibility.** Hide the long key from users entirely (recommended), or keep it in a small "System ID" line on the record detail for support?

## 9. Stage 2 phases (one commit each, tests alongside)

1. `formatRecordNo` and `allocateRecordNo` with unit tests (format, year boundary, padding overflow).
2. Migration, backfill SQL and read-only dry-run script, with a Postgres test for backfill and concurrency.
3. Wire every create path (records route, data sampler, seeds); serializer `record_no`; ignore client-sent values.
4. Search, collection linking by number, notifications, admin audit lookup.
5. Client: `recordLabel` helper and every display, export, route slip and dashboard card; E2E selector updates.
6. Docs: `API_CONTRACT.md` (`record_no`), `BUSINESS_REQUIREMENTS.md`, and the migration runbook note for Release.
