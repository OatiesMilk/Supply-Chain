# Plan: Fill the Amount column in the Accounting Collection record export (UAT-CSV-01)

Status: stage 1 (plan), waiting for Dylan's approval. No application code has changed.
Date: 2026-11-19
Defect: UAT-CSV-01, Medium, "collection amount missing from CSV". The source is `quality-assurance/06-reports/2026-11-12-staging-uat-results.md`, which is on `staging` (PR #315) but not on `dev`. There is no GitHub issue for it.
Base: `origin/dev` at `f726bf0`. Your local `dev` is at `027be8d`, one docs commit behind.
Stage 2 branch: `fix/client-collection-csv-amount` off `dev`. This follows the repo's `fix/` naming for bug fixes, like `fix/client-logistics-completed-today` in #318. The branch hasn't been created yet.
This file goes into the repo as `docs/plans/csv-amount-fix.md` in stage 2's first commit.

## 1. Summary

When TASS or Admin opens a single Accounting Collection record and uses its Export menu, the downloaded file has an
`Amount (₱)` column, but the cell is empty. The record page shows the amount, so the data is there. The cause is that the
single-record export builds its row by hand and never fills in the amount.

The fix moves that row into a small, tested helper. The helper adds the amount using the formatter the app already has
(`₱1,234.50`). The change is client-only, with no server, database, API or permission change.

## 2. Root cause (checked in code and reproduced)

**How exports work.** Every format looks up each column by its key in the row. When the key is missing, it writes an
empty cell. The lookups are in CSV `client/src/utils/export.ts:140-145`, Excel `export.ts:305-308`, PDF
`export.ts:513-518` and Word `client/src/utils/exportDocx.ts:84`.

**The defect.**
- The record page's Export menu is in `client/src/features/accounting/AccountingCollectionWorkspace.tsx:859-893` and
  only TASS and Admin see it. It builds its one row inline with 19 keys and passes the columns
  `[...DELIVERY_COLUMNS, ...AC_EXTRA_COLUMNS]`.
- The `Amount (₱)` column reads the key `amount_fmt` (`export.ts:665`). The inline row never sets `amount_fmt`. As a
  result, every format from this menu has an empty Amount cell: CSV, Excel, PDF and Word. UAT only tried CSV.
- The amount does reach the page. It goes from the database `Float` to the API `amount`
  (`server/src/mappings.ts:123`) to `record.amount`. The Overview tab shows it as "Amount to Collect"
  (`AccountingCollectionWorkspace.tsx:666-672`), and the Verification tab shows it too (`:472-477`).
- The same inline row is on `staging` (the build UAT tested), `main` and `dev`.

**Reproduced.** I ran dev's export code on a record like the UAT sample (₱1.00, verified). The row tail came out as
`"Julius Caesar Mendoza","Nov 12, 2026 5:34 PM","","Verified","Marc Dagode","Nov 12, 2026 5:49 PM"`. That is exactly
the row in the UAT report.

**Where Accounting Collection amounts are exported:**

| Export | Code | Amount today |
|---|---|---|
| Record page Export menu (TASS, Admin) | `AccountingCollectionWorkspace.tsx:859` | **Empty** in CSV, Excel, PDF and Word (this defect) |
| List page Export menu (TASS, Admin) | `AccountingCollectionView.tsx:442-463` and `:481-502` | Filled, for example `₱1.00` |
| All Operations export | `client/src/utils/allOpsExport.ts:156` | Filled |
| Record output PDF (manifest) | `client/src/utils/recordOutputPdf.ts:15` | Filled, without the ₱ sign |
| Accounting Collection branch in `DeliveryRecordsView.tsx` | `:539` and `:631` | Would be empty, but no screen reaches it: `accounting_collection` always opens `AccountingCollectionPage` (`client/src/routes/AppRouter.tsx:109`) |

**A second problem with the same cause (see Q1).** The `Driver Assistant` column reads the key `driver_assistant`
(`export.ts:654`). Every row builder sets `driver_assistants` instead:
`AccountingCollectionWorkspace.tsx:870`, `AccountingCollectionView.tsx:451` and `:490`, and
`DeliveryRecordsView.tsx:531` and `:623`. As a result, that column is blank in every CSV, Excel and Word export that
uses `DELIVERY_COLUMNS`. That covers Deliveries, RMA, Procurement Pick-up, Sales Orders and both Accounting Collection
exports. UAT missed it because its sample record had no driver assistant.

## 3. Options considered

| Option | Verdict |
|---|---|
| A. Add `amount_fmt` to the inline row and stop there | This fixes the symptom. But the row stays inside a React component that the node test runner can't reach, so there is no real regression test. |
| **B. Move the record export row into a pure helper in `client/src/utils/`, add the amount with `fmtCurrency`, and test it** | **Recommended.** It uses the same pattern as `rmaWorkflowExportFields` (`client/src/utils/rmaTransport.ts:11`, tested by `client/tests/rmaTransportExport.test.ts`). A column check in the test catches this kind of bug next time. |
| C. One shared row builder for every module's export | This removes the duplication everywhere. But it touches five modules and changes the list export's output: the list says Yes/No for Collection Verified, while the record page says Verified/Pending. It's too big for a UAT blocker, so it's listed as follow-up F3. |

## 4. Scope

In scope:
- The Accounting Collection record page export row. The change adds the amount and moves the row into
  `client/src/utils/collectionExport.ts`.
- Unit tests for the row and for the real CSV, Excel and Word output.
- If Q1 is yes, the Driver Assistant column key.
- `docs/FEATURE_TEST_COVERAGE.md`: add the new test to the exports row (line 65).

Out of scope (left as is):
- Server, API, database, migrations, seed data and permissions.
- The list export. Its rows, its amount format and its Yes/No wording stay the same.
- Header wording (`Amount (₱)` in CSV, Excel and Word, and `Amount (PHP)` in the list PDF). Excel also keeps storing
  amounts as text, as the list export does today.
- The record PDF layout. The record menu has no PDF column set, so its PDF prints all 20 CSV columns. Because of
  that, the amount wraps across lines (₱1,234.50 prints as `PHP` / `1,234` / `.50`), and the PDF font can't print the
  ₱ sign in the `Amount (₱)` header. This was already true before the fix. See follow-up F2.
- The unreachable Accounting Collection branch in `DeliveryRecordsView.tsx`.
- Status wording in exports (`Delivered`, where the page says Accomplished).
- The create form saves an amount of 0 as no amount (`AccountingCollectionView.tsx:328`, `|| null`). So a 0 typed
  in the form exports as an empty cell. That is existing behaviour, not part of this defect.

## 5. Changes

### 5.1 Data
None.

### 5.2 API
None. Exports are built in the browser from the record that's already loaded.

### 5.3 Client
1. A new file, `client/src/utils/collectionExport.ts`:
   ```ts
   export function collectionRecordExportRow(record: DeliveryRecord): Record<string, string>
   ```
   - It returns the same 19 values the workspace builds today, with the same keys and the same text.
   - It adds `amount_fmt: fmtCurrency(record.amount)` (`export.ts:89`). This gives `₱1,234.50`, always with two
     decimals, and an empty value when there is no amount. That matches the record page (`AccountingCollectionWorkspace.tsx:671`).
   - PDF output already turns ₱ into `PHP ` (`export.ts:509-514`).
   - Optional fields become `''`, the same way the list export uses `|| ''`. The file output doesn't change, because
     exports already print null as an empty cell.
2. In `AccountingCollectionWorkspace.tsx`, set `rows={[collectionRecordExportRow(record)]}`. Then remove `fmtDate`,
   `fmtDatetime` and `fmtStatus` from the import on line 25, since only the export row used them.
3. Only if Q1 is yes: in `export.ts:654`, change the Driver Assistant column key to `driver_assistants`. All five row
   builders already fill that key with a comma-separated list.

### 5.4 Tests
A new file, `client/src/utils/__tests__/collectionExport.test.ts`. The client test glob already picks up
`src/utils/__tests__/*.test.ts`. It covers:
- **Column check.** The helper's row has a key for every `AC_EXTRA_COLUMNS` column. If Q1 is yes, it checks every
  column in `[...DELIVERY_COLUMNS, ...AC_EXTRA_COLUMNS]`.
- **Amount format.** 1 → `₱1.00`; 1234.5 → `₱1,234.50`; 1234567.891 → `₱1,234,567.89`; 0 → `₱0.00`; null and
  missing → empty.
- **Real CSV.** Run `downloadCSV(..., returnBlob = true)` on a record like the UAT sample and parse the result. The
  `Amount (₱)` cell is `₱1.00`. Created By, Created At, Collection Verified, Verified By and Verified At keep today's values.
- **Real Excel and Word.** Generate both with `returnBlob = true` and check the amount cell and text. This works the
  same way `client/tests/routeSlipExports.test.ts` reads Excel and Word output.

I prototyped all of these against dev in a scratch copy outside the repo. They pass with the change. On today's row, the
column check fails and reports that `amount_fmt` is missing, along with `driver_assistant`.

## 6. Permissions
No change. The Export menus still show only for TASS and Admin (`AccountingCollectionWorkspace.tsx:859` and
`AccountingCollectionView.tsx:789`). The file is built in the browser from a record the person can already open, and
the Overview tab already shows the amount, so nothing new is exposed. No server route is involved.

## 7. Risks
- **Your local uncommitted work.**
  - Your local `dev` has uncommitted Sales Coordinator transport sign-off work from Nov 13. That's about 70 modified
    files, many with only line-ending changes. It also adds new files such as `docs/SALES_TRANSPORT_SIGNOFF.md` and
    the migration `20261113090000_sales_transport_signoff`.
  - The work includes `AccountingCollectionWorkspace.tsx` and `export.ts`. Stage 2 should work from a fresh copy of
    `origin/dev` and push the branch, so your folder is not touched.
  - After the fix is merged, `git pull` on your local `dev` will refuse to update those two files. Before you pull,
    commit that work on its own branch (recommended) or stash it.
  - That work doesn't touch the export block, so it should re-apply cleanly.
- **Merges happening now.** RMA transport (PR #321) and Mark as delivered are being merged into `dev`.
  - Mark as delivered edits the Overview tab of the same file (about lines 529-630), not the export block (859-893),
    so no conflict is expected.
  - Stage 2 should branch from `dev` after those two merge, or rebase onto it.
- **Release timing.** `dev` is far ahead of `staging`. The fix reaches staging only with the next `dev` → `staging`
  promotion, together with the other features waiting on `dev`. A hotfix straight to staging would bypass your
  workflow, so this plan doesn't use one.
- **Rounding.** After the fix, the record export always shows two decimals, like the record page. The list export
  sets a minimum of two decimals but no maximum. The two only differ for an amount with three or more decimals. The
  form allows that, but it's unlikely. See follow-up F1.
- **Driver Assistant (only if Q1 is yes).** The column starts showing names in CSV, Excel and Word exports for all
  five record types. That's the intended fix, but the change shows up outside Accounting Collection, so QA should
  spot-check one Deliveries export too.
- **Next UAT round.** UAT still has the PDF, Excel and Word layout checks open, and the record PDF layout above (F2)
  could be logged as a defect then.

## 8. Open questions for Dylan
1. **Q1. Driver Assistant column.** Should this branch fix it as its own commit, or should it be left and logged as a
   separate defect? I recommend fixing it here: it's one line with the same cause, and the new column check covers it.

## 9. Acceptance criteria (testable)
- **AC1 (UAT-CSV-01):** As TASS, open a completed and verified Accounting Collection record with an amount of ₱1.00,
  then Export → Export CSV → Download CSV.
  - The `Amount (₱)` cell is `₱1.00`.
  - Created By, Created At, Collection Verified (`Verified`), Verified By and Verified At are unchanged.
  - On staging, you can reuse the UAT sample `UAT-4ROLE-20261112-01` (₱1.00, verified).
- **AC2:** AC1 run as Admin gives the same result.
- **AC3:** From the same record menu, Excel and Word show `₱1.00` in the Amount column, and the PDF shows
  `PHP 1.00`. In the record PDF the value may wrap onto more than one line; that layout is out of scope (F2).
- **AC4:** The preview that opens before the download shows the amount in the Amount column.
- **AC5:** For records of ₱1,234.50 and ₱150,000.00, the record CSV shows `₱1,234.50` and `₱150,000.00`. These match
  the record's Overview tab and the list export.
- **AC6:** A Draft collection saved without an amount exports an empty Amount cell, with no `₱0.00` and no error.
- **AC7:** The list export (list page → Export CSV) is unchanged: same columns, same Amount values and the same
  Yes/No wording. If Q1 is yes, the Driver Assistant column is the only difference.
- **AC8 (only if Q1 is yes):** For a record with assistants, Driver Assistant shows comma-separated names in the
  record export, the list export and a Deliveries export. It's empty when there are no assistants.
- **AC9:** Permissions are unchanged. Sales Coordinator and Logistics see no Export menu on the Accounting
  Collection list or record pages, and TASS and Admin do.
- **AC10:** The new unit tests pass. The column check fails if `amount_fmt` is removed from the helper.
- **AC11:** `cd client && npx tsc --noEmit` passes, and `npm run test:client` passes with the new tests. The
  baseline on `f726bf0` is 438 passed, 1 skipped and 0 failed. No server files change.

## 10. Stage 2 phases (one commit each, tests alongside)
Work from a fresh copy of `origin/dev` on `fix/client-collection-csv-amount`. Push the branch and open a PR into
`dev`, then merge it after QA passes. Commit messages follow `<type>(<subsystem>): <message>`, with no co-author or
Claude lines.

1. `docs: add Collection CSV amount fix plan`. This file, saved as `docs/plans/csv-amount-fix.md`.
2. `fix(client): include the amount in the Accounting Collection record export`. The helper, the workspace change
   and the tests (AC1-AC6 and AC10 at unit level).
3. Only if Q1 is yes: `fix(client): fill the Driver Assistant column in record exports`. The column key change, with
   the column check widened to every column (AC8).
4. `docs: list the collection export tests in feature test coverage`. Updates row 65 of
   `docs/FEATURE_TEST_COVERAGE.md`.

After stage 2:
- Stage 3 writes `docs/qa-handoff/csv-amount-fix.md` for Codex, mapping AC1-AC11.
- Stage 4 needs no migration for this fix. Only the client build changes.

## 11. Follow-ups (not in this plan)
- **F1.** Use one amount formatter (`fmtCurrency`) in the list export and the list table too.
- **F2.** Give the record PDF its own PDF column set, the way the list export has `PDF_AC_COLUMNS`. Then the amount
  fits on one line under an `Amount (PHP)` header.
- **F3.** Share one row builder between the list and record exports (option C). First decide on one wording for
  Collection Verified.
