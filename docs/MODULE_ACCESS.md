# Module access (TSK-55)

> Last verified: 2026-10-09 against commit `ccbf192` (`dev`).

`server/src/services/permissions.ts` owns the screen catalog, role defaults,
account overrides, resource dependencies and effective access calculation.
Module Access edits one account, not the defaults of every account in a role.
An explicit grant adds a module; an explicit denial removes it; resetting removes
the overrides. Existing overrides continue to apply after a role change where
the new role supports that module.

## Default screens by role

Generated from `ROLE_DEFAULTS` and `SCREEN_LABELS` in `services/permissions.ts`.
`Y` = default grant. An Admin can grant or deny any non-privileged screen per
account (see "Privileged modules" below).

| Screen key (sidebar label) | SC | Logistics | TASS | Admin | Driver |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `main` (Main) | Y | Y | Y | Y | |
| `dashboard` (Dashboard) | Y | Y | Y | Y | |
| `deliveries` (Deliveries) | Y | Y | | Y | |
| `rma` (RMA) | Y | Y | Y | Y | |
| `accounting_collection` (Accounting Collection) | Y | Y | Y | Y | |
| `procurement_pickup` (Procurement Pick-up) | Y | Y | | Y | |
| `sales_orders` (Sales Orders) | Y | Y | | Y | |
| `customers` (Customers) | Y | Y | | Y | |
| `suppliers` (Suppliers) | Y | Y | Y | Y | |
| `driver` (Driver View) | | Y | | Y | |
| `driver_manager` (Driver Manager) | | Y | | Y | |
| `calendar` (Delivery Calendar) | | Y | | Y | |
| `driver_board` (Driver Board) | | Y | | Y | |
| `am_directory` (AM Directory) | Y | | | Y | |
| `transactions` (Transaction Center) | Y | Y | Y | Y | |
| `statistical_reports` (Reports) | | Y | | Y | |
| `inventory` (SKU Master) | | | | Y | |
| `data_sampler` (Data Sampler) | | | | Y | |
| `admin` (Admin Panel) | | | | Y | |
| `driver_dashboard` (Driver Dashboard) | | | | | Y |

Notes:

- SKU Master is an Admin-only default since TSK-118. Admin can grant it to another account.
- Record visibility: TASS reads only RMA and Accounting Collection records
  (`readableCategories` in `services/recordAccess.ts`). The Procurement Pick-up
  screen was removed from TASS on 2026-11-11 and cannot be granted back.
- Logistics cannot create or edit RMA records regardless of module grants.
- There is no Status History screen (removed in TSK-103).

## Operational module rules (driver job cards, 2026-11-11)

Source: `server/src/services/moduleAccessRules.ts` (mirrored for the UI in
`client/src/utils/moduleAccessRules.ts`). These rules narrow whatever the
permission mode (LEGACY or V1) and stored role policies allow; a stored Allow
cannot bypass them, and stored `RolePolicy` rows are not changed.

| Module | Sales Coordinator | Logistics | TASS | Admin | Driver |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Deliveries | Create, edit, submit | Assign driver, run, Pending/Reschedule | No access | View only | Assigned runs: Start, Complete |
| RMA | No access | View, assign driver (Logistics transport only); for the assigned driver, Start and Complete transport and upload the proof photo (after the Logistics transport switch) | Create, edit, receipt, final completion | View only | Assigned Logistics-transport RMAs: Start, Complete transport |
| Procurement Pick-up | Create, edit, submit | Assign driver, run, Pending/Reschedule | No access (screen removed) | View only | Assigned runs: Start, Complete |
| Sales Orders | Create, edit, submit | Assign driver, run, Pending/Reschedule | No access | View only | Assigned runs: Start, Complete |

- Admin "view only" blocks every write on these four modules: create, edit,
  submit, assign, RMA assignment, Time In, status, attachments, comments,
  timestamp corrections and record emails. Accounting Collection is unchanged.
- RMA with `INTERNAL_NO_DRIVER` or `SUPPLIER_COLLECTION` movement never gets a
  driver and never reaches a driver dashboard.
- Drivers can only start transport and complete. `PATCH /records/:id/status`
  from a Driver accepts only `Delivered`; anything else is a 403. Completing
  any job needs a saved JPG/PNG proof photo (10 MB per file, JPG/PNG/PDF/DOCX/XLSX,
  at most 10 files and 50 MB per record) and Received By (1 to 120 characters).
  For RMA the name is stored in `rmaTransportReceivedBy`, separate from the
  TASS receipt recipient.
- Driver record responses include `driver_actions: { start, complete,
  start_blocked_reason }`.

## Privileged modules and shared resources

- Admin Panel is reserved for the ADMIN role and cannot be revoked from it.
  Non-admin grants previously stored for this screen are ignored. Delegating user
  or integration management requires a separate action-level permission design.
- Data Sampler is restricted to ADMIN. Driver accounts use Driver Dashboard only.
  The editor locks unsupported options and the API rejects attempts to change them.
- Ordinary screen grants authorize reads for that module. Existing action/field
  restrictions still govern writes (for example, driver management requires
  Logistics/Admin and driver assignments retain their existing restrictions).
- Company/driver lookups can be used by permitted operational screens even when
  their directory screen is disabled. Lookup access does not grant directory
  management. Supplier lookup access is also needed by Procurement Pick-up.
- SKU endpoints require SKU Master access; dashboard data remains available from
  the separately authorized dashboard statistics endpoint. Transaction Center and
  reporting are independent read capabilities and retain their own data views.
- Shared record endpoints apply existing TASS category and Driver assignment
  limits. Explicit operation-category denials additionally filter record lists,
  details, comments, audit history and record-based email requests. Aggregate
  screens can read shared records but do not grant unrestricted editing.

## Session and persistence behavior

Login and `/auth/me` return the same session DTO, including `permissions`,
`effectiveScreens`, `resources` and `permissionVersion`. Responses are not cached.
The client never substitutes role defaults when the snapshot is missing.

Every protected API request reloads the current account and permissions. An
already-issued cookie therefore does not preserve revoked access. The client
refreshes its session every 30 seconds, on focus/reconnect, and following an API
401/403. Saving one's own overrides refreshes the session immediately. An
unverifiable session clears local access. Browser timer throttling can delay
background-tab polling; the server still checks each request.

A changed permission version replaces the query cache and closes open search
and detail state. Logout/login creates a new session cache. Old session responses
cannot replace newer accounts. Business queries no longer restore unscoped local
storage or simulate successful writes when the server rejects/fails a request.

Denied links are hidden, direct URLs fall back to an allowed route, and accounts
without any modules reach `/no-access` with a sign-out option.

Permission edits require the editor's `expectedVersion`. The backend validates
the full payload, locks the target user row, checks the version, replaces overrides
and writes the audit entry in one transaction. Stale editors receive 409; close
and reopen Module Access to review current values. No database migration is needed.
Deploy/restart the client and server together because the session contract changed.

## Verification

From the repository root:

```powershell
npm run lint --workspace=client
npm run lint --workspace=server
npm run build
npm run test:client
npm run test:server
```

Both workspaces use Node's built-in test runner through `tsx` (not Vitest).
The permission suites are `client/tests/permissions.test.ts` and
`server/tests/permissions.test.ts`.

The server HTTP tests use the actual routers/middleware with database test
doubles. Transaction tests simulate rollback and stale versions; they do not
replace live PostgreSQL concurrency testing.

Browser acceptance checks:

1. As Admin, disable Main and Dashboard for a Sales Coordinator and save. Log
   out and sign into that account without refreshing. Both links must be hidden
   immediately, and the landing page must be permitted.
2. Try `/main`, `/dashboard` and history navigation. Denied pages must not render.
3. Deny SKU Master and Transaction Center; verify their links and direct API
   requests are blocked. Verify other permitted modules still load.
4. Keep the target account open in another browser/profile. Change its permissions
   as Admin. Focus that window or wait for the refresh; removed access and cached
   details must disappear. Direct API requests must already be denied.
5. Grant an ordinary module, reset defaults, and repeat with TASS and Logistics.
   Driver Manager and Reports (Statistical Reports) must appear correctly
   in the editor. Admin Panel remains locked to Admin accounts.
6. Deny all modules for a non-admin; verify the no-access page and sign out.
7. Open Module Access in two admin sessions. Save one, then save the stale editor;
   it must report a conflict rather than overwrite the newer changes.
