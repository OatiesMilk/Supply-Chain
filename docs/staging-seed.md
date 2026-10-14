# Excel route seed for staging

`npm run seed:staging` previews an additive staging seed.
`npm run seed:staging:reset` previews replacing staging operational data with the
Excel snapshot while preserving login accounts and permissions. Both require
explicit `-- --apply` to write. They are separate from the local demo/UAT seed
commands and are never called during startup or deployment. Local development
continues to use its current `seed` / `seed:uat` dataset and safeguards.

The reviewed source is the committed snapshot
[`staging-route-source.json`](../server/prisma/data/staging-route-source.json),
extracted from `DELIVERY ROUTE 2026 2_f754f462-85d0-4a04-be04-72b6b657af17.xlsx`.
It retains the workbook SHA256, original worksheet headers, source sheet/row and
raw cell strings. This is a **static snapshot**, not a dynamic Excel importer or
automatic sync. A revised workbook needs a new reviewed extraction before use.

The [Cycle 3 preflight](./CYCLE3_DB_PREFLIGHT_163.md) records an unverified Render
database target and a shared Supabase database named `postgres`. Adding this
command does not resolve those deployment blockers or authorize seeding that
environment. The target guard intentionally refuses that database name. Establish
an isolated, approved staging database before using `--apply`; the existing
preflight release decision remains unchanged.

**Current approval state:** the user confirmed approval for the original workbook
and staging data, and authorized replacing staging operational seeds while
preserving login accounts and permissions. This does not establish deployment
isolation or make the inspected Supabase target eligible. The environment checks
and explicit apply/reset acknowledgements still apply.

## Prerequisites

- Use a dedicated PostgreSQL staging database whose exact name ends `_staging`.
  Apply the normal application migrations first; this command does not migrate.
- Independently verify and record the actual staging project, database host/name,
  backend API target and storage isolation from production. A `_staging` suffix,
  matching environment variables or `current_database()` **does not prove
  isolation**. Confirm the project and storage with the environment owner; the
  shared inspected Supabase `postgres` target remains blocked.
- Confirm the staging frontend's API target points to the staging backend, and
  that backend points to this database. Previewing a local database does not
  populate a deployed staging service.
- An existing **active ADMIN** account must be present in that database. Use its
  email for `STAGING_SEED_ADMIN_EMAIL`. If this is a new database without an Admin,
  have the staging owner provision the initial Admin through the established
  account setup before running this command. Do not use demo seeds to bootstrap
  it. This command creates no users, passwords, roles or Microsoft approvals.
- Set these in the staging backend environment (or `server/.env` when running
  against staging from your workstation). Keep `DATABASE_URL` private:

```text
NODE_ENV=production
APP_ENV=staging
DATABASE_URL=<your existing staging PostgreSQL connection URL>
STAGING_SEED_DATABASE=<exact database name, for example supply_chain_staging>
STAGING_SEED_HOST=<exact hostname in DATABASE_URL, without port or scheme>
STAGING_SEED_ADMIN_EMAIL=<existing active staging Admin email>
```

`NODE_ENV=production` remains suitable for deployed staging. The guard checks
`APP_ENV=staging`, the PostgreSQL URL, its `_staging` database name, and exact
`STAGING_SEED_DATABASE` and `STAGING_SEED_HOST` confirmation before any database access. It then verifies
`current_database()` and the Admin account. Remote hosts are allowed only when
explicitly confirmed; names without the required suffix are refused. Deployment readiness and routing can be
reviewed separately through the Admin deployment status check.

## Preview and apply

Run from the repository root:

```bash
npm run seed:staging
```

The default is a **read-only dry-run**. It validates the source and target, reads
existing source identities/audits, and prints create/skip counts. It creates no
records, locks or audit entries. With an empty business dataset and an existing
Admin, expect 21 companies, six directory profiles and 32 route records to create.

Dry-run does not require data-approval acknowledgement. After the owner approves
use of the source company/personnel data, and the environment owner verifies
isolation and the preview, set `STAGING_SEED_DATA_APPROVED=true` in the staging
backend environment. This is an operator acknowledgement, not independent proof
of approval. Applying without it is refused before any database access. Then
explicitly apply:

```bash
npm run seed:staging -- --apply
```

All new companies, profiles, route records and CREATE audits are committed in one
transaction. A collision or failed audit rolls back the entire import. The seed
does not delete, reset or update existing business data. Repeating it skips
previously imported identities, including records edited afterward. Existing
rows without matching seed provenance, mismatched source fingerprints or orphaned
audits are refused instead of overwritten. Review such collisions before retrying.

## What the snapshot creates

- **32 source rows** dated June 16, 2026: eight from `Sheet2`, four from `1`,
  fourteen from `2`, and six courier rows from `3`. Blank/template rows are absent.
- **21 distinct company names** using exact source spelling. Required SAP number,
  address and contact-person fields remain empty; no master/contact data is invented.
- **Six inactive, unlinked directory profiles**: source drivers Francis, Jayson and
  Joel; source helpers Albert, Karl and Noli. Short names are not guessed into full
  personnel names or matched to existing login accounts. Admins must review any
  activation or account linking separately.
- Courier rows retain Kimberly as the source owner in remarks/provenance, with no
  Driver assignment. Source mode, waybill and additional remarks are also retained.

Every route record begins as a **draft, PENDING, DELIVERY** record. Blank source
priority becomes `1 - Low`; these are explicit staging defaults required by the
application, **not verified historical status, priority or activity category**.
Source date, vehicle, area and remarks are retained. Item type, account manager,
address and other unknown fields remain empty. Blank timing cells remain null.
The source client-signature cell stays in the raw provenance; it is not assumed
to be a receiver's name or a proof-of-delivery attachment.

For the application's single reference field, use source `Reference` (column D)
when supplied, otherwise `Documents` or `S.O Number` (column C). The original
separate fields remain in the snapshot and labelled item description. Two source
rows with S.O number `11000583` stay separate: identity uses workbook/sheet/row,
not a supposedly unique business reference.

Readable route IDs are `REC-STG-<workbook SHA prefix>-<sheet>-<row>`. CREATE audits
retain the full workbook hash, row content fingerprint, raw source row, selected
Admin actor and staging defaults. Later business edits are preserved; an edited
snapshot under an existing source identity is refused. This edit preservation
describes additive seeding; explicit reset replaces the operational records.

The June monthly report's totals (1,002 accomplished and ten pending) are aggregate
figures. They cannot reconstruct 1,012 individual deliveries and are **not seeded**.
No demo SKU, inventory, inventory movement, generated current-day run or fabricated
POD is included.

## Replace staging operational seeds

The [Cycle 3 preflight NO-GO](./CYCLE3_DB_PREFLIGHT_163.md) still applies. Before
an applied reset, obtain release-gate clearance for the independently verified
isolated staging target and record a verified database backup with its restore
plan. Host/name confirmations and reset acknowledgement do not establish either
isolation or release readiness.

Put staging in maintenance mode first: stop active application writes and
background jobs, and keep them stopped until replacement finishes. The applied
reset also locks affected operational tables for its transaction; maintenance
avoids queued writers adding old/unrelated data immediately afterward. Do not run
the local `seed`, `seed:users-only`, `seed:uat`, `db:clean` or `db:reset` commands
against staging.

Preview proposed deletions, preserved counts and source creations:

```bash
npm run seed:staging:reset
```

Preview remains read-only and requires neither data-approval nor reset
acknowledgement. It reports existing source records as replacements, not skips.
After reviewing the exact isolated target and preview, set these acknowledgements
in the staging backend environment:

```text
STAGING_SEED_DATA_APPROVED=true
STAGING_SEED_ALLOW_RESET=true
```

Then explicitly replace operational data:

```bash
npm run seed:staging:reset -- --apply
```

Equivalent direct flags are `npm run seed:staging -- --reset --apply`.
Missing acknowledgement is refused before any database access. All deletes,
source inserts and reset/source audits occur in **one transaction**; a failure
rolls back deletions as well as inserted replacements.

The reset removes delivery records and their POD metadata/line items, comments,
remark history, notifications/email logs, daily snapshots, companies, customers,
suppliers, products, stock and inventory transactions. It removes only **unlinked**
Driver directory profiles, then recreates the six source profiles when needed.

It preserves **every existing User and UserPermission**, credentials, roles,
Microsoft links/approvals and login-owned Driver profiles (`userId` is not null).
Existing demo accounts also remain; they are not automatically deactivated.
Login state and existing AuditLog evidence stay intact. Recreated source entities
retain their immutable provenance anchors and append new CREATE audits; a RESET
audit records the actor and deletion/preservation counts without copying removed
business rows. Subsequent additive seeding remains idempotent.

Resetting POD metadata **does not delete external storage objects** or wipe a
bucket/local file store. Those objects remain untouched and may be orphaned after
metadata replacement. Any later storage cleanup is a separate reviewed operation.
This is an operational-data reset, not a schema drop or a full account/database
reset. It creates no default accounts, credentials, current-day fixture runs or
fabricated POD.

## Historical drafts and Driver UAT

These June 16, 2026 historical drafts are for reviewing source provenance and
application mapping. They are not current-day scheduled runs and do not provide
an automated active Driver UAT dataset: directory profiles remain inactive and
unlinked, and the records remain drafts.

Active automated Driver UAT requires separately approved fixture data and an
isolated test environment with deliberately reviewed account/profile assignments.
Do not generate live staging users, POD or historical deliveries to fill that
gap. The existing local `seed:uat` disposable-database safeguards remain intact;
this staging command does not authorize running that destructive fixture seed
against a deployed staging or shared production database.
