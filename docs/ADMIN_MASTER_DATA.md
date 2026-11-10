# Account Managers and Companies (Admin)

Implemented locally on 2026-11-10 on `dev` (not committed). Replaces the
hardcoded `ACCOUNT_MANAGERS` list and adds Company management.

## Where

**Admin Panel → Account Managers** and **Admin Panel → Companies** tabs. No new
screen or permission catalog key was added (the V1 catalog stays frozen).

## Who can do what

| Action | Guard (server) |
| :--- | :--- |
| Read companies / Account Managers | `requireResource('companies')` (every record screen and AM Directory already has it) |
| Create | `companies:CREATE` + `admin:WRITE` + role `ADMIN` |
| Edit, deactivate, reactivate | `companies:WRITE` + `admin:WRITE` + role `ADMIN` |

Company creation was previously allowed for Sales Coordinators through the API
(no UI used it). It is now Admin-only. The client mirrors these checks in
`permissionRuntime.ts`; the server remains authoritative.

Non-Admin readers of `GET /account-managers` receive only `{ id, name, is_active }`.

## Data

- `AccountManager`: `name`, `normalizedName` (unique), optional contact `email`,
  optional unique `userId` (linked portal login), `isActive`, `version`.
- `Company` gains `normalizedName` (unique), `isActive`, `version`, `updatedAt`
  and optional `defaultAccountManagerId`.
- Names are trimmed and single-spaced; uniqueness ignores case and spacing,
  including inactive rows. Nonblank SAP numbers are unique (checked by the API
  under a transaction advisory lock, because Prisma cannot model a partial
  unique index). SAP number is required on create and edit.
- `DeliveryRecord.accountManager` stays text: records keep the name they were
  saved with. Nothing is hard-deleted.
- Migration `20261110030000_account_manager_directory` seeds the 7 former names
  plus every name already on records, and links an Account Manager to a portal
  login only when exactly one active non-Driver account has that exact name.
  It stops with a clear error if duplicate company names or SAP numbers exist.
  RLS is enabled on the new table, like every other public table.

## Behaviour

- Record forms (create, workspace edit, Accounting Collection, Data Sampler)
  list active Account Managers. A record whose saved name was deactivated still
  shows it.
- Server: a new or changed record Account Manager must be an active directory
  entry; the directory spelling is stored. An unchanged value is always accepted.
  New records and company changes need an active company.
- Picking a company fills its default Account Manager unless the user already
  chose someone else. RMA Auto Fill uses the default too.
- Optimistic locking: edits send `expected_version`; a stale edit gets 409 and
  the list refreshes.
- Every create/update writes an `AuditLog` row (`Company`, `AccountManager`)
  shown in the System Audit Log.

## AM email and 4 PM summary

`accountManagerMailUsers` / `summaryAccountManagerNames` in
`server/src/services/accountDirectory.ts`:

1. Deactivated Account Manager: no AM mail or summary.
2. Linked login: that account (if active), even when its display name differs.
3. Otherwise: the old rule, exactly one active account with that exact name.

The existing "recipient can read this record" check still applies. The Account
Manager's own `email` field is contact information only and is never mailed.

## API

| Method | Path | Body |
| :--- | :--- | :--- |
| GET | `/api/v1/account-managers[?active=true]` | |
| POST | `/api/v1/account-managers` | `{ name, email?, user_id? }` |
| PATCH | `/api/v1/account-managers/:id` | `{ expected_version, name?, email?, user_id?, is_active? }` |
| GET | `/api/v1/companies[?active=true]` | |
| POST | `/api/v1/companies` | `{ name, sap_number, address?, contact_person?, default_account_manager_id? }` |
| PATCH | `/api/v1/companies/:id` | `{ expected_version, …any create field, is_active? }` |

Errors: 400 validation (unknown fields rejected), 404 missing, 409 duplicate
name / SAP number / linked login, stale version, or inactive Account Manager.

## Deploying

1. `cd server && npx prisma migrate deploy` (staging: no duplicate names or SAP
   numbers were found on 2026-11-10).
2. `npx prisma generate` on each developer machine.
3. Review the seeded Account Managers in the new tab and link portal logins.

## Not in scope

Customers page, AM Directory redesign, CSV import, renaming the Account Manager
on old records when a name changes.
