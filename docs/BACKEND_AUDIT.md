# Backend Handover Audit — Microgenesis Supply Chain Portal

Audit performed against `docs/Microgenesis-Supply-Chain-Portal-Documentation.docx` (the SRS), `DONT_BREAK_THIS.md`, and `docs/ROLES.md`, by reading the actual route/middleware/service code — not inferring behavior from file names. Findings are grouped by severity. Each item cites the exact file(s)/line(s) checked.

**Status key:** 🔴 Fixed · 🟡 Open / needs a decision · ⚪ Note only (no action needed)

---

## 1. Deployment safety

**Checked:** `render.yaml`, `package.json` scripts, `server/prisma/seed.ts`, `server/src/routes/dev.ts`, `server/src/routes/data-sampler.ts`, `server/src/index.ts` route mounting.

### 🔴 FIXED — Unauthenticated endpoint could wipe the entire production database
- `server/src/routes/dev.ts:10` — `POST /api/dev/reset-seed` had **no auth or role check at all**.
- `server/src/index.ts:71` — mounted unconditionally, including in production (the old comment literally said "available in all environments since this is a demo app").
- It called `runSeed(true)` (`prisma/seed.ts:222-257`), which does `deleteMany()` on `auditLog`, `notificationLog`, `dailyStatusSnapshot`, `inventoryTransaction`, `inventoryItem`, `product`, `deliveryRecord`, `company`, `customer`, `supplier`, `user` — every core table — then reseeds demo data.
- **Impact:** any unauthenticated request to the live Render URL could destroy all production data and replace it with fictional demo data.
- **Fix applied:** route now requires `requireAuth` + `requireRole('ADMIN')`, and refuses with `403` whenever `NODE_ENV=production`. The frontend "Reset Demo Data" header button is now hidden for non-Admins, matching the backend check (per the repo's own two-places RBAC rule in `DONT_BREAK_THIS.md` #2).
- **Files changed:** `server/src/routes/dev.ts`, `server/src/index.ts` (comment only), `client/src/App.tsx`.

### ⚪ Note — Seed-on-deploy is *not* actually destructive as shipped
`render.yaml:24` runs `npx tsx prisma/seed.ts` on every deploy, which calls `runSeed()` with `force` defaulted to `false` (`prisma/seed.ts:427-431`). `runSeed(false)` only does the full destructive wipe when `userCount === 0` (`seed.ts:225`); otherwise it just tops up missing admin/products/customers without touching existing data. The SRS's stated risk here is real in spirit, but the actual danger was the unauthenticated `force=true` endpoint above (now fixed), not the deploy-time seed step itself.

### ⚪ Note — `data-sampler.ts` reset endpoint is correctly guarded
`server/src/routes/data-sampler.ts:230` (`POST /reset`) already used `requireAuth, requireRole('ADMIN')` before this audit — used as the reference pattern for the dev.ts fix.

---

## 2. RBAC enforcement (`requireRole`)

**Checked:** every route file in `server/src/routes/` against the RBAC matrix in SRS section 3.1.

### 🟡 OPEN — TASS's implemented permissions don't match even the SRS's own (provisional) matrix
- SRS matrix: TASS = "Edit record fields: **Read-only**", "Change record status: **Read-only**"; SRS section 12: "TASS's scope is narrowed to **Accounting Collection, RMA, and Procurement Pick-up** records, read-only outside collection verification."
- Code: `server/src/routes/records.ts:245` (`PUT /:id`) and `:365` (`PATCH /:id/status`) both include `'TASS'` in `requireRole(...)`, gated only by `existing.category !== 'RMA'` (lines 254-256, 384-386).
- **Result:** TASS can fully edit and change status of **RMA** records (contradicts "read-only"), but **cannot** touch Accounting Collection or Procurement Pick-up at all for edits (contradicts the "scope narrowed to" list).
- TASS is explicitly flagged provisional in the SRS — **this needs the real TASS stakeholder meeting**, not a unilateral code fix. Neither the matrix nor the code should be treated as ground truth until then.

### 🟡 OPEN — Driver role can read SKU Master / Inventory / Transactions via the API
- `server/src/routes/skus.ts:50,60` and `server/src/routes/transactions.ts:33,161` — GET routes use only `requireAuth`, no role restriction.
- SRS matrix explicitly lists "SKU Master / Inventory / Transactions ... Driver: **No**". The frontend may hide the screen, but the backend is the real boundary (`DONT_BREAK_THIS.md` #2) — currently open to any authenticated Driver.
- **Suggested fix:** add `requireRole('SALES_COORDINATOR','LOGISTICS','TASS','ADMIN')` to these GET routes.

### 🟡 OPEN — SKU Master write access narrower than the matrix suggests
- `server/src/routes/skus.ts:95,132` (edit/create) — `ADMIN` only; `:184` (stock adjust) — `ADMIN` + `LOGISTICS`.
- SRS matrix marks "SKU Master / Inventory / Transactions" as "Yes" for Sales Coordinator, Logistics, TASS, and Admin without distinguishing read vs. write. Possibly intentional; worth confirming with the matrix owner rather than assuming.

### ⚪ Confirmed correct — everything else checked
- `server/src/routes/records.ts` — create (`SALES_COORDINATOR`/`LOGISTICS`), full update, status change, collection verification (`TASS` exclusive at `:441`), and soft-delete (`SALES_COORDINATOR` only, `:492`) all match the SRS matrix and Separation-of-Duties rules described in section 3, aside from the TASS item above.
- `server/src/routes/admin.ts`, `users.ts` — all routes `ADMIN`-only, matches "Admin Panel / Data Sampler: Yes (exclusive)".
- `server/src/routes/reports.ts:11,90` — `LOGISTICS`/`ADMIN` only, matches "Statistical Reports / Status History".
- `server/src/routes/drivers.ts:103,121,140` — create/update/delete restricted to `LOGISTICS`/`ADMIN`.
- Every write path to `DeliveryRecord` goes through `writeAuditLog()` (`server/src/services/audit.ts`) — no bypassing direct Prisma calls found outside admin-only reset tools (`data-sampler.ts:249`, which is a full wipe and correctly doesn't need audit entries for records that no longer exist).

---

## 3. Auth flow (Azure AD SSO + local)

**Checked:** `server/src/routes/auth.ts`, `server/src/middleware/auth.ts`.

### ⚪ Confirmed correct
- `auth.ts:136-166` — microsoftOid-then-email matching implemented as specified (FR-AUTH-03): looks up by `microsoftOid` first, falls back to email, links an existing email account to the Microsoft identity if unlinked.
- `auth.ts:149-160` — auto-provisioning on first SSO login uses `role: 'SALES_COORDINATOR'` (lowest privilege), matching FR-AUTH-04.
- `auth.ts:145-147` — deactivated accounts are blocked at the **callback** stage (`if (user && !user.isActive) return res.redirect('/?error=account_deactivated')`), not just at a UI check — matches FR-AUTH-05.
- `middleware/auth.ts:30-38` — cookie flags are `secure: isProd, sameSite: isProd ? 'none' : 'lax'`, matching the "Secure + SameSite=None in production" requirement for Teams iframe embedding.
- Missing Azure env vars are handled cleanly, not silently: `auth.ts:64-66` returns `501 { error: 'Microsoft login is not configured' }` from the initiate endpoint, and `auth.ts:95-97` redirects to `/?error=sso_not_configured` from the callback — no silent failure or flicker.

No issues found in this area.

---

## 4. Audit trail integrity (FR-AUD-01)

**Checked:** `server/src/services/audit.ts`, every `prisma.deliveryRecord.*` call site (`records.ts`, `data-sampler.ts`).

### ⚪ Confirmed correct
All four mutation routes in `records.ts` (create, full update, status change, collection verification, soft-delete) call `writeAuditLog()` immediately after the Prisma write. `data-sampler.ts:183-218` (sample record generation) also writes an audit entry. The only unlogged deletion (`data-sampler.ts:249`, full reset) is a wipe of the whole table, where an audit entry would be meaningless.

### 🔴 FIXED-ADJACENT — NotificationLog overstated delivery outcome in two scheduled jobs
Not strictly `DeliveryRecord` audit, but the same "never overstate what happened" principle from the SRS applies to `NotificationLog`:
- `server/src/index.ts:298-307` (`notifyWeeklyReport`) wrote `status: 'SENT'` **before** attempting to send any email, regardless of outcome.
- `server/src/index.ts:173-181` (`notify4PM`) derived `status: amUser ? 'SENT' : 'MOCKED'` from whether a matching user record existed, not from the actual `sendEmail()` result.
- Correct pattern (for comparison): `server/src/services/notify.ts:35` branches on the real `SendResult`.
- **Status: identified, not yet fixed** — flagged as High priority, not part of the reset-seed fix that's already shipped.

---

## 5. Data integrity / validation (FR-DATA-01)

**Checked:** `server/src/routes/records.ts` create/update handlers, `server/src/mappings.ts`, `server/prisma/schema.prisma`.

### 🟡 OPEN — "Validated lookups" aren't actually validated server-side for most fields
SRS section 5 promises validated lookups for Company, Area, Priority, Category, Vehicle, Driver, Account Manager.
- **Category/Status** (`mappings.ts` + `records.ts:175`): `CATEGORY_TO_DB[b.category] ?? b.category` silently falls back to the raw client string if unmatched. Since these are plain string DB columns (not Postgres enums, per SRS section 8), the DB doesn't reject an unknown value either.
- **Priority, Vehicle, Area, Driver name, Account Manager** (`records.ts:190-217` POST, `:271-321` PUT): accepted as free text with zero lookup against any reference table.
- **Company** is the only field genuinely protected, and only incidentally via a Prisma FK constraint (`schema.prisma:98`) — an invalid `company_id` throws an unhandled 500, not a clean 400.
- **Suggested fix:** validate `area`, `vehicle`, `driver`, `accountManager` server-side before write; return 400 on unrecognized `category`/`status` instead of falling back to the raw value.

### ⚪ Note — no uniqueness constraint on Company
`schema.prisma:50-58` — `Company.name`/`sapNumber` have no `@unique`, and `companies.ts:21-41` doesn't check for duplicates before insert. Partially undermines the SRS's stated goal (section 1) of eliminating duplicate company values. Flagged as a suspected risk, not load-tested.

---

## 6. Export & notification pipelines

**Checked:** `server/src/services/mailer.ts`, `server/src/services/notify.ts`, `client/src/utils/export.ts`, `exportDocx.ts`, `exportDriverReport.ts`, `routeSlip.ts`, `allOpsExport.ts`.

### 🟡 OPEN — Mailer's "3-tier fallback" is config-based selection, not a runtime fallback chain
- `server/src/services/mailer.ts:100-109` — `sendEmail()` picks exactly one transport based on which env vars are present, and returns whatever that transport reports. If Graph is configured but the live API call throws, it returns `{ok:false}` and **never tries SMTP or mock** — same for SMTP failing to mock.
- SRS section 4/9 describes "Graph → SMTP → mock" as a cascade, which reads as fallback-on-failure, not static selection.
- **Suggested fix:** on a non-mock transport returning `ok:false`, retry the next tier down.

### 🟡 OPEN — Export logic is not actually unified as SRS section 6 claims
- `client/src/utils/routeSlip.ts` (1,300+ lines) imports only `fmtDate` from `export.ts` (`routeSlip.ts:7`) and reimplements its own jsPDF/ExcelJS/docx generation.
- `client/src/utils/exportDriverReport.ts` (1,645 lines) imports **nothing** from `export.ts` — fully independent PDF/DOCX/CSV generation.
- Only `export.ts` and `allOpsExport.ts` genuinely share the core engine.
- **Impact:** exactly the drift risk the shared-module design was meant to prevent. Flagged for a refactor ticket, not a quick fix.

### ⚪ Confirmed correct / documentation issue found
- Only `ACCOMPLISHED` triggers a real email + NotificationLog entry (`server/src/services/notify.ts:4-6`, explicit comment "the ONE automated trigger required by spec... Do not add other automated triggers here"). This matches `DONT_BREAK_THIS.md` #3.
- **The generated SRS `.docx` contradicts itself** on this point: section 7's first paragraph and sections 11–12 claim "five of six" Output Action triggers send real email, while the "Important" callout in the same section 7 says only one (Accomplished) does. The code and `DONT_BREAK_THIS.md` agree with the "Important" callout. **This is a documentation bug in the generated SRS, not a code bug** — the `.docx` needs correcting in 3 places, the code should not be changed to match the wrong majority text.

---

## 7. Schema governance

**Checked:** `server/prisma/migrations/`, grep for raw SQL, `client/src/App.tsx` Warehouses gating.

### ⚪ Confirmed correct
- No `$queryRaw`/`$executeRaw` anywhere in `server/src` or `server/prisma` — all schema changes go through Prisma migrations.
- `server/prisma/migrations/` — 16 sequential, well-formed migrations; no manual out-of-band changes found.
- `client/src/App.tsx:319` — Warehouses module is force-excluded from the UI ("Warehouse module is retired — force-excluded regardless of any stale..."), matching SRS section 12 / `DONT_BREAK_THIS.md` #8.

### ⚪ Note — one migration is misnamed
`server/prisma/migrations/20260916005903_init/migration.sql` is only 8 lines (drops/re-adds a FK on `UserPermission`, sets a column default) — a routine incremental change, not a schema init. The `_init` suffix (normally reserved for the first migration) is misleading for future audits. Not destructive, just confusing — rename convention going forward.

---

## Summary — fix order

| # | Item | Severity | Status |
|---|---|---|---|
| 1 | `/api/dev/reset-seed` unauthenticated data wipe | Critical | 🔴 **Fixed** (this session) |
| 2 | NotificationLog overstates SENT (weekly + 4PM jobs) | Critical | 🟡 Open |
| 3 | Server-side validation missing for Area/Vehicle/Driver/Account Manager/Category | High | 🟡 Open |
| 4 | Driver role can read SKU/Inventory/Transactions | High | 🟡 Open |
| 5 | Mailer doesn't cascade Graph→SMTP→mock on failure | High | 🟡 Open |
| 6 | TASS permissions vs. SRS matrix mismatch | High | 🟡 Open — needs stakeholder input, not a code fix |
| 7 | Generated SRS `.docx` self-contradicts on Output Actions | Medium | 🟡 Open — doc fix, not code |
| 8 | Export logic duplicated (routeSlip.ts, exportDriverReport.ts) | Medium | 🟡 Open — backlog/refactor |
| 9 | SKU Master write access narrower than matrix | Medium | 🟡 Open — confirm intent |
| 10 | Migration misnamed `_init` | Low | ⚪ Note only |
| 11 | No uniqueness constraint on Company | Low | ⚪ Note only |

*Generated during a backend handover audit. See git history on `claude/upbeat-lovelace-7zno1r` for the code fix to item 1.*
