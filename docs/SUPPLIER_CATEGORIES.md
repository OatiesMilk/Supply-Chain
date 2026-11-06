# Supplier categories

Implemented locally on 2026-11-05 from clean `dev` at `8adf405`; awaiting PR,
merge and deployment. This implements the user-approved replacement for the
fixed-five-category proposal (DEF-022 / BR-DIR-07).

## Authority and behavior

- Admin manages the catalog from **Suppliers → Manage Categories**: create,
  rename, deactivate and reactivate. Admin alone may change an existing
  supplier's category assignments from its General tab.
- These writes also require supplier resource Write and supplier screen Write
  under V1. Admin role alone does not bypass explicit denials. Existing supplier
  creators retain their applicable role, screen and resource Create checks.
- Creation requires one to 100 distinct active category IDs. Assignment edits
  require one to 100 IDs; already-assigned inactive categories may be retained
  or removed, but cannot be newly assigned. A removed inactive category cannot
  be re-added until Admin reactivates it.
- Names are trimmed, limited to 120 characters for catalog writes and unique
  case-insensitively, including inactive entries. PostgreSQL case conversion is
  shared with the migration. Renaming changes current labels everywhere;
  audit snapshots retain the label and stable category ID at the time of writing.
- Supplier list/detail show every category. Category filters use IDs and include
  inactive entries and an Uncategorized review option. Exports use the filtered
  supplier set and include all labels for each matching supplier.
- Failed creation preserves the draft and selections. Pending creation cannot
  be submitted twice or dismissed. If a selected category becomes inactive while
  a creation draft is open, it remains visible for removal; conflict responses
  refresh the catalog without discarding the draft. Native dialogs contain
  keyboard focus.

Catalog/assignment writes acquire the same transaction-scoped PostgreSQL
advisory lock, then recheck category availability and expected versions. Related
audit entries commit atomically. Stale category or supplier editors receive 409;
the client refreshes affected data while preserving the draft until closed.
Unchanged edits return the current object without an extra audit/version change.

## API

All paths are under `/api/v1/suppliers`; see [API contract](API_CONTRACT.md#3-directories).

| Method / path | Contract |
| --- | --- |
| GET `/categories` | Supplier resource Read. Returns active and inactive `{ id, name, is_active, version }` entries. |
| POST `/categories` | Admin and supplier resource/screen Write. Body `{ "name": "Hardware" }`. Returns 201. |
| PATCH `/categories/:id` | Same guards. Body includes `expected_version` and `name` and/or boolean `is_active`. |
| POST `/` | Existing supplier creation authority. Body includes `name`, `category_ids`, optional `contact_person`, `email`, `phone`, `address`, `city`. |
| PUT `/:id/categories` | Admin and supplier resource/screen Write. Full replacement `{ "category_ids": ["id"], "expected_version": 1 }`. |

Supplier responses add `version` and `categories` (catalog DTOs). The deprecated
`category` response remains a display string joined with `; `; consumers must
use IDs/arrays for filtering and selection. Legacy create bodies with a single
`category` label still resolve an existing active catalog entry. Unknown labels
are rejected; sending both `category` and `category_ids` is rejected. Empty,
duplicate or malformed selections return 400; stale versions or newly assigning
an inactive category return 409; missing edit targets return 404.

## Migration and deployment

The additive [migration](../server/prisma/migrations/20261105010000_supplier_category_catalog/migration.sql)
adds `SupplierCategory`, `SupplierCategoryAssignment` and `Supplier.version`.
It retains the original `Supplier.category` text and all historical audits.
Each nonblank legacy value becomes **one label**, even if it contains commas or
semicolons. Case/outer-space variants map to one category, with deterministic
display-name selection and preference for the existing five standard names.
Custom labels are retained. Blank values remain unassigned for Admin review;
the migration does not guess a category or invent an actor/audit event.

Before deployment, identify the intended database and obtain the normal release
authorization. From the repository root, run this read-only report against that
explicitly configured target, then review blank IDs and label variants:

```powershell
npm run suppliers:category-report --workspace=server
```

Back up the release database through its established process. Apply committed
migrations and generate the client before running the new API. The existing
Render configuration generates Prisma at build time and runs `prisma migrate
deploy` before API startup; verify the service actually uses those commands.
Pause supplier/category writes during the migration and matching API/frontend
cutover: an old API instance could otherwise insert a legacy-only supplier after
the backfill. Drain old writers before reopening writes, then rerun the report
to review any unassigned suppliers. Production/Render migration or deployment
was not performed here.

The retained legacy column is a compatibility snapshot, not a lossless rollback
format for multiple categories. An old API cannot expose/edit this feature and
may show stale labels after catalog renames. A rollback needs a coordinated
release/data review; preserve the additive tables and their links rather than
reconstructing assignments from a joined string. Account seeds now create catalog
links; normal read requests never seed data.

## Verification recorded on 2026-11-05

- Full server suite: **483 passed, 0 failed, 7 optional PostgreSQL checks skipped**
  (490 total). The two new opt-in cases were then exercised separately against
  verified loopback `mg_portal_sandbox`.
- Full client suite: **320 passed, 0 failed, 1 optional PostgreSQL integration
  check skipped** (321 total).
- Both strict workspace TypeScript checks and Prisma schema validation passed.
  Client and server production builds passed; Vite reports its large-chunk
  advisory for the export bundles.
- [Supplier router tests](../server/tests/suppliers.test.ts) use database doubles
  for creation, validation, role ceilings, stale/no-op edits and safe audits.
  [V1 middleware tests](../server/tests/permissionEnforcement.test.ts) and
  [client guards](../client/tests/permissionsV1.test.ts) exercise supplier
  screen/resource denials and Admin-only authority without adding catalog keys.
- [PostgreSQL checks](../server/tests/supplierCategories.postgres.test.ts) verify
  migration mapping in a unique temporary schema, real audit-trigger rollback
  for supplier/catalog creation, rename and assignment replacement, competing
  versions (one success/one conflict), and an assignment blocked on the advisory
  lock rechecking active state after deactivation commits. Only unique fixtures
  and that temporary schema are cleaned up; no database reset is used.
- [Mounted client tests](../client/tests/supplierCategories.test.ts) verify
  failure/retry draft retention, pending submission protection, Admin controls,
  filters, export labels, cache invalidation, stale editor versions, audit diff,
  and removal of a selection deactivated while the create draft is open.
- Local in-app browser with real database in LEGACY mode: Admin catalog creation,
  case/space duplicate rejection, required selection, multi-category supplier
  creation, ID filter, rename refresh, deactivation/retained labels, exclusion
  from new selections, reactivation and Admin assignment editing passed. Sales
  Coordinator created a two-category supplier and had no catalog/edit controls.
  A downloaded filtered CSV contained exactly both matching test suppliers and
  all their category labels. Browser access was subsequently declined when
  returning to Admin. A user-authorized retry was also blocked by a saved
  permission for `http://localhost:3000`, so the final audit-screen check and
  browser check of deactivation during an open creation draft were not completed.
  Audit persistence, rollback, projection and that draft recovery are covered by
  the PostgreSQL/router/mounted-client checks above.

Browser fixtures were removed by exact IDs after validation: two suppliers, one
temporary category and seven related audit entries. The six pre-existing
suppliers, five catalog categories and six migrated assignments remain.

General supplier contact editing/deletion, directory uniqueness, operational
Supplier/Product links and automatic stock posting remain separate scope. The
Data Sampler and deferred development password-policy decision are unaffected.
