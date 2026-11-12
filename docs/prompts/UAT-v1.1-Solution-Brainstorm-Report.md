# UAT v1.1 — Solution Brainstorm Report

Source: `UAT-Plan-Sales-Coordinator-Logistics-and-Driver.md` (v1.1, 2026-10-06) plus a read-only review of `dev` @ `60d5f09` (source tree identical to `8dca432` and `origin/staging`).
Status: **brainstorm only.** No code was changed.

---

## 0. Blocking questions — answered 2026-10-06

| # | Question | Answer | Effect on this report |
| --- | --- | --- | --- |
| 1 | Is `supply-chain-en7.pages.dev` used by anyone outside the dev team? | **No** | G-0 stays Critical and **release-blocking**, but it is not an emergency hotfix. It ships in batch 1 and must be closed before the site gets wider access. |
| 2 | Should a Driver see upcoming (future-dated) runs? | **Yes** | The "Other Dates" section is intended. New item **D-4** turns it into a proper read-only "Upcoming" list. The UAT plan's "today only" wording (Part C note, C-1.4) needs correcting. |
| 3 | Are `Customer` and `Company` the same entity? | **Separate** | **E-2** changes from "link the entities" to "remove the false link". A-4.3 is an invalid test, so it should be dropped from or rewritten in the UAT plan. |

---

## 1. Executive summary

- **Critical gap not covered by UAT:** `POST /api/dev/public-seed` is **unauthenticated, has no production guard, and wipes every table, including `AuditLog` and `User`** (`server/src/routes/dev.ts:26-34`, `server/prisma/seed.ts:164-179`). The login page calls it (`client/src/features/auth/LoginView.tsx:75`). It is mounted in all environments (`server/src/index.ts:96-98`). Anyone who can reach the API can erase the audit trail. The site is internal-only for now (answer 1), so this is a release blocker rather than an emergency.
- **Shared root cause 1: driver identity is a display-name string.** Records store `driver` as text (`schema.prisma:113`). Driver access compares `existing.driver !== req.user.name` (`server/src/routes/records.ts:418, 545`) and `recordScope` filters on `driver: user.name` (`server/src/services/recordAccess.ts:26`). An Admin rename (`server/src/routes/users.ts:53-69`) silently orphans every assignment for that driver. This one cause explains B-3.3 and the "name must match exactly" caveat in Part C.
- **Shared root cause 2: there's no feedback system.** The client has no toast or notification library at all (a repo-wide search for toast/sonner/Toaster finds nothing). This explains B-2.2, B-2.5 and part of B-2.6.
- **Shared root cause 3: there's no record lifecycle model.** `draft` is a free boolean that any SC edit can flip back (`records.ts:463`, UI select `DeliveryRecordWorkspace.tsx:396-401`). Drafts aren't excluded from driver scope (`recordAccess.ts:23-28`) and can't be told apart in lists (no draft rendering in `DeliveryRecordsView.tsx`). This explains A-2.5.
- **Several "defects" are actually hidden UI.** B-4.5: the remove button exists but has `opacity-0 group-hover:opacity-100` (`DeliveryRecordWorkspace.tsx:1548`), so it's invisible until hover and never shows on touch screens. B-2.6: the Save button is disabled when the status is unchanged (`DeliveryRecordWorkspace.tsx:944`), so the expected message can't appear. The server does return 409 with that message (`records.ts:559-561`).
- **A data-format bug:** the Logistics Time In/Out inputs use `type="time"` and save `"HH:MM"` (`DeliveryRecordWorkspace.tsx:1073-1088`), while the Driver saves full ISO timestamps (`DriverDashboard.tsx:79, 89`). The Driver card then calls `new Date("09:30")`, which gives **Invalid Date** (`DriverDashboard.tsx:32-36`).
- **A-4.3 is structurally broken, not just missing data.** `CustomerWorkspace` filters on `r.customer_id === customer.id` (`client/src/features/customers/CustomerWorkspace.tsx:113`), but `customer_id` is mapped from `company_id` (`client/src/api/queries/useRecordsQuery.ts:10`), and Customer IDs are never Company IDs. The business has confirmed the two are separate (answer 3), so the tab is a false feature and the test is invalid.
- **Top 3 release blockers:** G-0 (open DB wipe), A-1 (drafts visible to drivers), B-1 (POD removal is invisible and has no audit trail).

---

## 2. Solutions by theme

### A. Record lifecycle & drafts

**[A-1] Explicit Draft → Submitted lifecycle** — UAT: `A-2.5`
- **Type:** Business-rule decision + Missing capability
- **Current behavior:** Draft is a Yes/No select on create (`RecordCreateForm.tsx:371-379`) and on edit (`DeliveryRecordWorkspace.tsx:396-401`). The server accepts `is_draft` on any SC PUT (`records.ts:463`). If a draft is promoted to "No", nothing re-validates the required `reference` (the POST checks it at `records.ts:293-299`; the PUT doesn't). Drafts aren't excluded from driver scope (`recordAccess.ts:23-28`). Logistics gets a "driver needed" notification even for drafts (`records.ts:367-373`).
- **Root cause:** Draft is modelled as an attribute rather than a lifecycle state, and its transitions aren't enforced.
- **Options:**
  | Option | Approach | Pros | Cons | Effort |
  | --- | --- | --- | --- | --- |
  | 1 | Keep the boolean and add guards: one-way flip (Yes→No only), re-validate required fields on promotion, exclude drafts from driver scope and assignment, suppress the Logistics notification | No schema change | The rules stay scattered across routes | S |
  | 2 | **A state machine with a `DRAFT` status** in the existing `status` column, plus an allowed-transition table in `mappings.ts` | One source of truth; works for status history and reports; standard practice | Every status filter or report must treat DRAFT correctly | M |
  | 3 | A separate drafts table | Strong isolation | Duplicates the model; promotion becomes a copy | L |
- **Decision (2026-10-06):** ✅ **Submitted records may go back to Draft.** This overrides the tester's A-2.5 remark ("not … reverting valid records to draft").
- **Recommendation:** Option 2, with transitions in **both directions** (`DRAFT ⇄ SCHEDULED`), each guarded:
  - **Draft → Submitted:** runs the same validator as create (Reference, Delivery Date per A-3).
  - **Submitted → Draft:** an explicit "Move back to Draft" action (not a Yes/No dropdown), available to SC and Admin, with remarks required as for any edit. It's allowed **only before work has started**: status is Scheduled (or Rescheduled), no Time In, not Delivered. After Time In the delivery is in progress (see D-1), so reverting it would hide a live run from the driver.
  - **If a driver is already assigned when it's reverted:** keep the assignment data, hide the record from the driver (drafts are out of driver scope), and notify Logistics and that driver that the run was pulled back. This is the standard "recall a dispatched job" pattern.
  - Drafts are invisible to Drivers, can't be newly assigned, and don't trigger the "driver needed" notification.
- **Business rules affected:** new rule: "A draft can't be dispatched or seen by a Driver. A record can go back to Draft only before Time In."
- **Severity:** High · **MoSCoW:** Must
- **Decision 1a (2026-10-06):** ✅ **Keep the assignment, hidden.** Reverting to Draft doesn't clear the driver. The run simply disappears from the driver's dashboard while it's a draft and comes back when it's re-submitted. Show a visible "The assigned driver won't see this while it's a draft" warning to the SC and Logistics. Notify the driver that the run was pulled back.
- **Draft acceptance criteria:**
  - Given a draft record, when Logistics assigns a driver, then the server returns 400 "Submit the draft before dispatch".
  - Given a Driver account, when they load records, then no draft records are returned by `/api/records`.
  - Given a draft with an empty Reference, when the SC clicks Submit, then the Reference error appears and the record stays Draft.
  - Given a Scheduled record with no Time In, when the SC chooses "Move back to Draft" with remarks, then it becomes Draft and the Audit Trail records the change.
  - Given a record with Time In recorded, then "Move back to Draft" is unavailable, and the API returns 409.
  - Given the deliveries list, then draft rows show a visible "Draft" badge and can be filtered.

**[A-2] Two explicit actions on the create form** — UAT: `A-2.5`, `A-2.6`
- **Type:** UX consistency
- **Current behavior:** There's one "Save Record" button (`RecordCreateForm.tsx:542`) plus the Draft select.
- **Options:** (1) **Secondary "Save as Draft" + primary "Submit Record" in a bottom-right action bar** (the standard form pattern: one primary action in a consistent place); (2) keep the select but default it to No (doesn't meet the tester's ask).
- **Recommendation:** Option 1, shipped together with C-2 (shared action bar).
- **Severity:** Medium · **MoSCoW:** Should · **Effort:** S
- **Draft acceptance criteria:** Given the create form, there is no Draft dropdown, and the two buttons validate different required-field sets.

**[A-3] Required Delivery Date and auto-stamped Date & Time** — UAT: `A-2.4`
- **Type:** Business-rule decision + UX
- **Current behavior:** `delivery_date` isn't validated on the client (`RecordCreateForm.tsx:234-237`) or the server (`records.ts:293-295`). The empty string `''` is stored (`records.ts:335`). Records with an empty date never appear on the Driver dashboard or the calendar. `date_time` is a manual `datetime-local` input (`RecordCreateForm.tsx:438`) and duplicates `createdAt` (`schema.prisma:144`).
- **Options:** (1) **Require Delivery Date on Submit (not on Draft); drop the manual Date & Time field and show `createdAt` read-only**; (2) keep Date & Time but rename it to "Requested pickup/arrival time" if it's actually used operationally.
- **Recommendation:** Option 1, unless stakeholders confirm that Date & Time means a requested arrival window, in which case Option 2.
- **Severity:** Medium · **MoSCoW:** Must (date) / Should (date_time) · **Effort:** S
- **Needs sign-off:** Yes. "What does Date & Time represent today?"
- **Also:** the A-2.4 note that the validation highlight isn't cleared on valid selection needs an [UNVERIFIED] check of `updateField` error clearing in `RecordCreateForm.tsx`. The fix is a convention: inline errors clear on the field's next valid change.

### B. Documents & POD

**[B-1] File removal: visible, audited, role-aware** — UAT: `B-4.5`, `C-2.5`
- **Type:** Defect (hidden UI) + Missing capability (Driver) + audit gap
- **Current behavior:**
  - The server DELETE exists for SC/Logistics/Admin and blocks removing the last photo on an accomplished delivery (`records.ts:247-267`). Driver is excluded.
  - The Documents tab's ✕ button is invisible until hover (`DeliveryRecordWorkspace.tsx:1548`), so on touch screens it never shows. It has no confirmation (`:1555-1562`).
  - The Driver's `PodUploader` has no remove control (`client/src/components/PodUploader.tsx:52-54`).
  - **Neither upload nor delete writes to `AuditLog`** (`records.ts:178-229, 247-267`), so POD evidence can disappear without a trace.
- **Root cause:** Delete was built as a convenience feature, not as a controlled action on evidence.
- **Options:**
  | Option | Approach | Pros | Cons | Effort |
  | --- | --- | --- | --- | --- |
  | 1 | Make the ✕ always visible and add a confirm dialog | Fixes the UAT fail quickly | No audit; Driver still can't remove | S |
  | 2 | **ePOD standard:** soft delete (`deletedAt`, `deletedById`) + an AuditLog entry for upload and delete. Driver may remove *their own* uploads only **before** the record is Delivered. After Delivered, only Logistics/Admin can change POD, and the last-photo rule is kept. | Defensible evidence trail; meets C-2.5 | Needs a schema migration | M |
  | 3 | Immutable POD (no delete ever; add a "superseded" flag) | Strongest integrity | Heavy for an internal tool; wrong uploads stay visible | M |
- **Decision (2026-10-06):** ✅ **Removing an attachment does not need a reason.**
- **Recommendation:** Option 2 without a reason field. Keep a light confirmation ("Remove *file.pdf*?") to stop accidental taps. The Audit Trail still records **who removed which file and when**: that's attribution, not a reason, and it costs the user nothing.
- **With staged uploads (B-2):** a file that's only *staged* (not saved yet) is removed instantly with no confirmation and no audit entry, because it never reached the server. Confirmation and audit apply only to saved files.
- **Business rules affected:** the photo-required invariant is respected and the last-photo guard stays. New rule: "Driver may remove own attachments only while the record isn't Delivered."
- **Severity:** High · **MoSCoW:** Must
- **Draft acceptance criteria:**
  - Given the Documents tab on a touch device, the Remove control is visible without hover.
  - Given a saved file, when a user clicks Remove and confirms, it's removed without asking for a reason, and the Audit Trail shows "Attachment *name* removed by *user*".
  - Given a Driver on an active record, when they remove their own saved PDF, it disappears.
  - Given a Delivered record, when the Driver tries a delete via the API, then the response is 403.
  - Given any saved upload, the Audit Trail shows the file name and uploader.

**[B-2] Staged uploads: files are saved only when the user saves** — UAT: `B-4.2`
- **Type:** Business rule, ✅ **decided 2026-10-06: staged upload**
- **Current behavior:** Files upload the moment they're selected (`DeliveryRecordWorkspace.tsx:1452-1470`, `PodUploader.tsx:22-34`). The Driver's photo gate relies on a photo already **saved** on the server (`DriverDashboard.tsx:278`, `usePodAttachments.ts:38`).
- **Recommended design:**
  1. **Staging area:** selected files appear in the list with a "Not saved yet" chip, and they can be removed freely (B-1). Client-side checks (type, 10 MB) run at selection as they do today. The client also does a lightweight **JPG/PNG header check**, so a fake "photo" is flagged straight away rather than at Save. The server's full magic-byte check (`podPhotos.ts:48-83`) stays the authority.
  2. **Desktop (Documents tab):** staged files count as unsaved changes (`useWorkspaceDraft('documents', …)` at `DeliveryRecordWorkspace.tsx:1445` turns dirty), so the existing leave-page guard protects them. They upload through the shared **Save** in the sticky action bar (C-3). This also answers the tester's "redundant Save buttons" remark.
  3. **Driver (Accomplish):** the photo gate accepts a **staged** valid JPG/PNG. On Confirm, the client uploads the staged files first, then sends the status change. If any upload fails, the status change is **not** sent and the driver sees which file failed. The server still re-checks for a saved photo inside the locked transaction (`records.ts:572-576`), so the rule can't be bypassed.
  4. **Field resilience:** drivers often have weak signal or reload the page. Keep staged files in the browser's **IndexedDB per record** until they're saved or removed, so a reload or closed tab doesn't lose a delivery photo. Show "2 files waiting to upload" on the card.
  5. **Optional, more robust server path:** a combined `POST /:id/complete` multipart endpoint (files + status + Received By in one transaction) removes the partial-failure case altogether. Treat it as the M-effort upgrade if step 3 proves flaky.
- **Risks:** staged files exist only on that device until saved. Logistics can't see them, and they're lost if the browser data is cleared. Make this visible in the UI.
- **Severity:** Medium · **MoSCoW:** Should · **Effort:** M
- **Draft acceptance criteria:**
  - Given a user selects a PDF in the Documents tab, then it shows as "Not saved yet", and no file reaches the server until Save.
  - Given staged files, when the user tries to leave the record, then the unsaved-changes prompt appears.
  - Given a driver has staged a valid JPG and filled remarks and Received By, when they Confirm, then the photo uploads, the status becomes Delivered, and the photo appears in the Documents tab for Logistics.
  - Given the upload fails, then the status remains unchanged and the staged file stays available to retry.
  - Given the driver reloads the page, then their staged files are still listed.

**[B-3] Driver can open an accomplished record (read-only)** — UAT: `C-3.1`
- **Type:** Missing capability
- **Current behavior:** Done cards are static `div`s with no handler (`DriverDashboard.tsx:321-361`). There's no way to see POD files or remarks after completion.
- **Options:** (1) **Tap to expand a read-only detail sheet** (bottom sheet: POD thumbnails, remarks, times, Received By); (2) a separate "History" screen.
- **Recommendation:** Option 1. It's a mobile-first pattern and needs no new route.
- **Severity:** Medium · **MoSCoW:** Should · **Effort:** S

### C. Save model & system feedback

**[C-1] Global toast/feedback service** — UAT: `B-2.2`, `B-2.5`, `B-2.6`
- **Type:** Missing capability (cross-cutting)
- **Current behavior:** There's no toast system. Success is silent, and errors appear inline only (`DeliveryRecordWorkspace.tsx:950-951, 1120`).
- **Options:** (1) **Sonner (or an equivalent) mounted once in `App.tsx`, with a `notify.success/error` wrapper; mutations call it on settle**; (2) custom Zustand toast store; (3) inline "Saved ✓" text near each button.
- **Recommendation:** Option 1 for transient success, keeping the inline errors for field-level problems. This follows Nielsen heuristic #1 (visibility of system status).
- **Severity:** Medium · **MoSCoW:** Must (cheap, high perceived quality) · **Effort:** S

**[C-2] "Same status" feedback** — UAT: `B-2.6`
- **Type:** Defect in the test expectation, or a UX gap
- **Current behavior:** The button is disabled when `selectedStatus === record.status` (`DeliveryRecordWorkspace.tsx:944`). The server 409 (`records.ts:559-561`) can't be reached from the UI. That's correct error prevention, but there's no explanation.
- **Recommendation:** Keep the disabled button, and add helper text: "Select a different status to enable saving." Update the UAT expected result to match. Prevention is preferred over an error (Nielsen #5).
- **Severity:** Low · **MoSCoW:** Should · **Effort:** S

**[C-3] One save model per workspace tab** — UAT: `B-4.2`, `A-2.6`, `A-4.2`
- **Type:** UX consistency
- **Current behavior:** The Dispatch tab has two independent saves, "Save Status Change" (`:948`) and "Save Driver & Delivery Details" (`:1128`), each with its own remarks box. The Overview save is in the header (`:271-276`), while the create form's save is at the bottom (`RecordCreateForm.tsx:542`).
- **Options:**
  | Option | Approach | Pros | Cons | Effort |
  | --- | --- | --- | --- | --- |
  | 1 | **Sticky bottom action bar per tab**: one Remarks field, one "Save changes" button, a dirty-state indicator ("3 unsaved changes"). The server receives one PUT for the fields plus one PATCH for status, in sequence. | One mental model; matches the "remarks per change" rule | The status PATCH and field PUT are separate transactions: partial failure has to be handled | M |
  | 2 | Keep both sections, but give them identical visual placement and a shared remarks field | Low effort | Still two saves | S |
  | 3 | New combined server endpoint that writes status and fields in one `$transaction` | Atomic; one audit entry | New API surface; must keep the photo lock (`records.ts:572-576`) | M |
- **Recommendation:** Option 1 in the UI, backed by Option 3 on the server if partial failures turn out to matter. Also set a portal-wide convention: **primary action bottom-right, secondary to its left, in a sticky bar**.
- **Severity:** Medium · **MoSCoW:** Should
- **Needs sign-off:** Yes. "Is one remark acceptable to cover both a status change and a driver change made together?"

### D. Field ownership (Time In/Out, Priority, Received By)

**[D-1] Time In starts the run (→ In Transit); Time Out is stamped on Delivered** — UAT: `B-2.7`, `C-2.1`, `C-3.2`
- **Type:** Business rule, ✅ **decided 2026-10-06** + Defect (data format)
- **Decision:**
  - **Time In** = the start of the scheduled delivery. It's captured when the driver taps **Record Time In**, and it moves the record's status to **In Transit**, a **new status** (decision 3a, Option B).
  - **Pending** keeps its existing meaning: "started but couldn't complete yet" (the driver's amber button, C-2.9).
  - **Time Out** = recorded automatically when the delivery is marked **Delivered**.
  - This replaces the earlier wording "Time In → Pending". The intent ("the record shows the run has started") is unchanged, but it now has an unambiguous status.
- **Current behavior:**
  - Record Time In sends a field-only `PUT` with `time_in` (`DriverDashboard.tsx:78-80` → `useRecordsQuery.ts:61-72` → `records.ts:421`). Status stays **Scheduled**, so the status side of the decision isn't implemented.
  - Time In comes from the **device clock** (`new Date()` on the phone), and the Driver can overwrite it repeatedly (`records.ts:421`).
  - Time Out is set only on the Driver path, also from the device clock (`DriverDashboard.tsx:89`). **When Logistics marks a delivery Delivered from the Dispatch tab, no Time Out is recorded at all** (`DeliveryRecordWorkspace.tsx:817-832` sends only status and remarks).
  - Logistics' manual inputs store `"HH:MM"` (`DeliveryRecordWorkspace.tsx:1075, 1084`) while the Driver path stores ISO, and the Driver card shows "Invalid Date" for the former (`DriverDashboard.tsx:32-36`).
  - The Driver's "today" is computed in **UTC** (`DriverDashboard.tsx:46`).
- **Decision 3a (2026-10-06):** ✅ **Option B: a new "In Transit" status.** It removes the Pending ambiguity and follows the industry-standard lifecycle (Scheduled → In Transit → Delivered). Options A (repurpose Pending, remap the button to On-Hold) and C (overload Pending) are rejected.
- **Status model after this change:**
  | Display | DB value | Meaning | Who sets it |
  | --- | --- | --- | --- |
  | Draft | `DRAFT` (A-1) | Not submitted; invisible to drivers | SC / Admin |
  | Scheduled | `SCHEDULED` | Submitted, not started | System on submit; Logistics |
  | **In Transit** | **`IN_TRANSIT`** | **Run started (Time In recorded)** | **Only the Time In action**, never a manual status pick |
  | Pending | `PENDING` | Started but couldn't complete yet | Driver (amber button), Logistics |
  | On-Hold | `ON_HOLD` | Stopped by the office | Logistics |
  | Rescheduled | `RESCHEDULED` | Moved to another date | Driver, Logistics |
  | Delivered | `ACCOMPLISHED` | Completed (photo + remarks + Received By + Time In) | Driver, Logistics, Admin |
- **Allowed transitions** (enforced in one table in `server/src/mappings.ts`, checked by `PATCH /status` and the Time In action):
  - `SCHEDULED | RESCHEDULED → IN_TRANSIT`: only through Record Time In.
  - `IN_TRANSIT → DELIVERED | PENDING | RESCHEDULED | ON_HOLD`.
  - `PENDING → IN_TRANSIT` (resume: Time In is kept, the status returns to In Transit, and the resume is audited) `| DELIVERED | RESCHEDULED | ON_HOLD`.
  - `→ DELIVERED` requires Time In (3b), so it's only reachable from In Transit or Pending.
  - **Rescheduling a started run resets it** (✅ decision 3c): moving to `RESCHEDULED` clears `timeIn` (and `timeOut` if set). The previous values stay in the Audit Trail and RemarkLog, so the driver records a fresh Time In on the new date. "Once per run" means once per attempt.
- **Ripple effect (why the effort is M):** statuses are hard-coded across roughly **39 files**, including:
  - **Server:** `mappings.ts:23-37`, `routes/records.ts:91`, `routes/dashboard.ts`, `routes/reports.ts`, `routes/notifications.ts`, the end-of-day snapshot in `index.ts`, and `prisma/seed.ts`.
  - **Client:** the `DELIVERY_STATUSES` list (`client/src/data.ts:90`), the `DeliveryStatus` type (`types/delivery.ts`), `StatusStepper`, badge colours in `DriverDashboard.tsx:104-117` and the workspace, the dashboards, calendar, Driver Board, Transaction Center, filters, and the export, route-slip and driver-report utilities.

  Recommend a single shared status config: label, colour, order and terminal flag, defined once on each side. Add In Transit to that config instead of patching 39 switch statements. No Prisma migration is needed because `status` is a string column (`schema.prisma:110`), but `DailyStatusSnapshot` rows gain a new status key.
- **Recommended implementation (brainstorm):**
  1. **New action endpoint** `POST /api/records/:id/time-in` (DRIVER for own records; Logistics/Admin too). In one `prisma.$transaction` it sets `timeIn = now()` **from the server clock** and status → `IN_TRANSIT`, and writes an AuditLog entry plus a RemarkLog entry with a system remark ("Time In recorded by *driver*", context `TIME_IN`). That satisfies the remarks-on-every-change rule without making the driver type anything.
  2. **Guards:** allowed only once per run (409 if `timeIn` is already set), only on non-draft records, and only from Scheduled or Rescheduled. Overdue runs are allowed but flagged (D-4). Logistics/Admin may use the same action on a driver's behalf, for example when the driver's phone is dead, and the audit records who did it.
     - **Decision 3c (2026-10-06):** ✅ when a run that already had Time In is **Rescheduled**, its Time In is **cleared**, and the old value is kept in the Audit Trail. The driver records a new Time In on the new date, and the run shows as Rescheduled (not started) until then.
  3. **Time Out:** inside the existing completion transaction (`records.ts:572-600`), set `timeOut = now()` from the server whenever status becomes `ACCOMPLISHED`, **for every role** (this fixes the Dispatch-tab gap). Ignore any client-sent `time_out`.
  4. **Completion requires Time In** (✅ decision 3b: a delivery **cannot** be Delivered without a Time In). The server rejects `ACCOMPLISHED` with 400 "Record Time In before completing this delivery" when `timeIn` is empty, for every role. The check goes next to the photo and Received By checks in the completion transaction. The driver's Accomplish button stays disabled until Time In is recorded, and so does the Delivered option on the Dispatch tab.
  4b. **Bulk status bar:** Logistics can bulk-set Delivered and Pending today (`DeliveryRecordsView.tsx:748`). Bulk Delivered would now fail per record on photo, Received By and Time In. Recommend removing **Delivered** from the bulk options and **never offering In Transit** there, or in the Dispatch tab's manual status buttons (`DeliveryRecordWorkspace.tsx:918-933`). In Transit is reachable only through the Time In action. Pending, On-Hold, Rescheduled and Scheduled stay in bulk, but they must respect the transition table, so for example a bulk Pending is refused for a record that was never started.
  5. **Logistics edits become corrections:** the Dispatch tab inputs switch to `datetime-local`, are stored as ISO, need remarks, and are labelled "Correct Time In / Time Out". A correction doesn't change the status.
  6. **"Today"** is computed in `Asia/Manila` on both client and server.
- **Business rules affected:** new rule: "Time In and Time Out are system-stamped events. Time In moves Scheduled → **In Transit**, and Delivered stamps Time Out. Status changes follow the allowed-transition table. Manual time changes are audited corrections."
- **Severity:** High · **MoSCoW:** Must · **Effort:** M
- **Draft acceptance criteria:**
  - Given a Scheduled run, when the driver taps Record Time In, then Time In is stored from the server clock, the status is **In Transit**, and the Audit Trail shows both changes.
  - Given an In Transit run, when the driver taps Pending with remarks, then the status is Pending and Time In is kept. When they resume, the status returns to In Transit.
  - Given Logistics opens the Dispatch tab or the bulk bar, then In Transit isn't offered as a manual status.
  - Given a Scheduled run with no Time In, when anyone sends `status=Delivered` or `status=Pending`, then the server rejects it as an invalid transition.
  - Given an In Transit run with Time In 09:10, when it's Rescheduled, then Time In is empty on the record, the Audit Trail still shows 09:10, and on the new date the driver can record a new Time In.
  - Given the dashboards, calendar, Driver Board, reports and exports, then In Transit appears with its own label and colour, and it counts as active (not done).
  - Given Time In is already recorded, when Record Time In is sent again, then the server returns 409 and nothing changes.
  - Given Logistics marks a delivery Delivered from the Dispatch tab, then Time Out is stamped automatically.
  - Given Logistics corrects Time In with remarks, then the stored value is ISO, the status doesn't change, and the Driver card shows a valid time.
  - Given 01:00 Manila time, the Driver sees that calendar day's runs.
- **UAT plan change:** C-2.1's expected result should add "status changes to **In Transit**". C-2.9 (Pending) now runs on an In Transit record. B-2.5's status options no longer include In Transit. B-2.7 becomes "Correct Time In (with remarks)". Add a test that Logistics completion stamps Time Out.

**[D-2] Received By is mandatory to accomplish a delivery (Driver and Dispatch tab)** — UAT: `C-2.7`, `C-3.3`
- **Type:** Business rule, ✅ **decided 2026-10-06**
- **Decision:** Received By is required whenever a delivery is marked Accomplished/Delivered: by a Driver on the Driver dashboard, and (decision 4a) by Logistics or Admin on the Dispatch tab.
- **Current behavior:**
  - The input is labelled and commented as optional (`DriverDashboard.tsx:251-267`).
  - A blank value is sent as `null` (`DriverDashboard.tsx:91`).
  - The confirm button checks only remarks and the photo (`DriverDashboard.tsx:466-468`).
  - The server accepts `received_by` without checking it (`records.ts:570`).
- **Recommended implementation (brainstorm):**
  1. **Server (the authority):** in `PATCH /:id/status`, when `category === 'DELIVERY'` and the new status is `ACCOMPLISHED`, **for every role** (decision 4a), work out `receivedBy = body.received_by ?? existing.receivedBy`. If it's blank or whitespace-only, reject with 400 "Enter the name of the person who received the delivery." Put this check next to the photo check (`records.ts:574`) so both completion rules sit together.
  1b. **Dispatch tab (Logistics/Admin):** "Save Status Change" to Delivered currently sends only status and remarks (`DeliveryRecordWorkspace.tsx:817-832`), and Received By sits in a separate save section. Disable Delivered until Received By is filled, and send it in the same request. The unified save bar (C-3) makes this natural.
  2. **Client:** show a red `*` on the label. Disable Accomplish until Received By is filled (the same pattern as the photo gate at `DriverDashboard.tsx:278`). Show the field's value read-only in the confirm dialog. Keep the confirm disabled while it's blank.
  3. **Data quality:** trim the value, require at least 2 characters, and cap it at about 100.
  4. Pending and Rescheduled **don't** require it.
- **Business rules affected:** extends invariant 1. Any delivery marked Delivered requires a JPG/PNG photo, remarks **and Received By**, whichever role completes it.
- **Severity:** Medium · **MoSCoW:** **Must** · **Effort:** S
- **Decision 4a (2026-10-06):** ✅ **Yes. The rule also applies when Logistics or Admin marks a delivery Delivered from the Dispatch tab**, so it can't be bypassed from the desktop.
- **Draft acceptance criteria:**
  - Given a driver with a saved photo and remarks but a blank Received By, then Accomplish is disabled.
  - Given the same state sent through the API as the driver, then the server returns 400 and the record status doesn't change.
  - Given Received By "Juan Cruz", when the driver confirms, then the record is Delivered and the Accomplished card shows "Juan Cruz".
  - Given a Pending or Rescheduled action with a blank Received By, then it saves normally.
  - Given Logistics selects Delivered on the Dispatch tab with Received By blank, then the save is blocked, and the API returns 400 if called directly.
- **UAT plan change:** C-2.7 becomes "Received By is required". Add a negative test: "Accomplish is blocked when Received By is blank". Add a matching Logistics test in Part B.

**[D-3] Priority: shared by SC and Logistics, edited in Overview** — UAT: `B-2.8`
- **Type:** Business rule, ✅ **decided 2026-10-06: both SC and Logistics can change Priority**
- **Current behavior:**
  - **Server:** already allows both. `PUT` accepts `priority` from SC, Logistics and Admin (`records.ts:395-402, 425, 456`), and `PATCH /status` accepts it from Logistics and Admin (`records.ts:532-540`).
  - **SC:** can edit Priority per record in the Overview form, but only while the record is **Scheduled** (`canEditFull`, `DeliveryRecordWorkspace.tsx:135, 336-343`), and in bulk (`DeliveryRecordsView.tsx:754-760`).
  - **Logistics:** per record, the Overview edit is limited to Area/Address (`DeliveryRecordWorkspace.tsx:136`). The only Logistics priority control in the code is the **bulk** bar (`DeliveryRecordsView.tsx:204-206, 754`). [UNVERIFIED] which screen the tester used for B-2.8.
- **Recommendation:**
  1. Add Priority to the Logistics Overview edit (alongside Area/Address), so both roles change it in **one place** per record, plus bulk. This is the tester's B-2.8 request.
  2. Make SC's priority edit independent of the `Scheduled`-only gate. Priority often rises *after* scheduling (an urgent customer call). Keep the other SC fields gated as they are.
  3. Remarks stay required (the existing rule), and the Audit Trail shows who changed it.
  4. Last write wins. The existing concurrency guard on PATCH (`records.ts:578-583`) shows the pattern if conflicts become an issue.
- **Severity:** Low · **MoSCoW:** Should · **Effort:** S
- **Draft acceptance criteria:**
  - Given Logistics opens Overview → Edit, then Priority is editable, and saving with remarks updates the badge and the Audit Trail.
  - Given an SC on a Pending record, then they can still change Priority with remarks.
  - Given a Driver, then Priority isn't editable (the server returns 403, as today).

**[D-4] Driver "Upcoming" runs: keep them, but make them correct** — UAT: `C-1.3`, `C-1.4`, Part C note
- **Type:** Business rule confirmed (drivers see future runs, answer 2) + defects in the current section
- **Current behavior:** "Other Dates" lists every assigned record where `delivery_date !== today && status !== "Delivered"` (`DriverDashboard.tsx:367-398`). That one filter mixes three groups:
  - **Future** runs (intended);
  - **Past-dated, still-open** runs, which are overdue work but look like ordinary upcoming items;
  - **Drafts** and records with an **empty Delivery Date** (`''` is never equal to today), because neither is excluded (see A-1, A-3).
  The cards are static and read-only. "Today" is computed in UTC (D-1).
- **Options:**
  | Option | Approach | Pros | Cons | Effort |
  | --- | --- | --- | --- | --- |
  | 1 | Rename the section to "Upcoming" and filter to `delivery_date > today` only | Simple; matches the decision | Overdue runs disappear from the driver's view | S |
  | 2 | **Split into "Overdue" (past-dated, open; amber, shown above Today, actionable) and "Upcoming" (future, sorted by date, grouped by day, read-only).** | Standard dispatch-app pattern; nothing gets lost | Slightly more UI | S |
  | 3 | Give the driver a full date picker or calendar | Flexible | Over-built for a mobile field app | M |
- **Decision 2a (2026-10-06):** ✅ **A driver can act on an overdue run, and the action must be recorded as overdue.**
- **Recommendation:** Option 2. Overdue cards have the same actions as today's (Time In, upload, Accomplish, Pending, Reschedule). Upcoming cards stay read-only. Exclude drafts and empty-date records on the server (A-1), and use the Manila-time "today" (D-1).
- **Recording overdue actions (industry practice: on-time delivery / OTIF measurement):**
  1. **The server decides, not the phone.** When any driver action (Time In, status change, upload) happens, the server compares `deliveryDate` with today in `Asia/Manila`. If it's earlier, the action is overdue and `daysLate = today − deliveryDate`.
  2. **Audit:** the AuditLog `newValue` and the RemarkLog get an `overdue: true, daysLate: N` marker, and the RemarkLog context becomes e.g. `OVERDUE_STATUS_CHANGE`. The Audit Trail shows an amber "Overdue by N days" chip.
  3. **On the record, for reporting:** when it's completed, store `completedLate` (boolean) and `daysLate` (int) on `DeliveryRecord` (schema migration). Statistical Reports can then show the on-time rate per driver, area and customer without parsing audit JSON.
  4. **Visibility:** the driver's confirm dialog says "This run was due *date*. It will be recorded as overdue." Logistics gets an in-app notification ("*Driver* completed an overdue run: *ref*, N days late").
  5. **Remarks:** keep the normal remarks rule. Recommend the driver's remarks placeholder on overdue runs asks for the reason for the delay.
- **Business rules affected:** invariant 4 changes to: "A Driver sees only records assigned to them. They can act on today's and overdue runs, and future runs are read-only. Every action on an overdue run is recorded as overdue." The UAT plan wording in Part C and C-1.4 needs updating.
- **Severity:** Medium · **MoSCoW:** Should · **Effort:** M (with the reporting fields)
- **Draft acceptance criteria:**
  - Given a run dated tomorrow, then it appears under "Upcoming" with no action buttons.
  - Given an open run dated yesterday, then it appears under "Overdue" above today's runs, with action buttons.
  - Given the driver accomplishes that run today, then the Audit Trail shows "Overdue by 1 day", the record stores `completedLate = true, daysLate = 1`, and Logistics is notified.
  - Given a run completed on its delivery date, then no overdue marker is recorded.
  - Given a draft or a record without a Delivery Date assigned to the driver, then it appears in no section.

### E. Master data & identity

**[E-1] Driver profile ↔ user account linked by FK** — UAT: `B-3.3`, Part C note
- **Type:** Missing capability (root cause)
- **Current behavior:** The `Driver` model has no `userId` (`schema.prisma:292-302`). The Driver Manager creates directory entries only (`server/src/routes/drivers.ts:102-112`). The Admin creates users separately (`users.ts:27-37`). Linking and scoping are done by name string (see the executive summary).
- **Options:**
  | Option | Approach | Pros | Cons | Effort |
  | --- | --- | --- | --- | --- |
  | 1 | Keep names; block user renames when assignments exist | No migration | The fragility stays | S |
  | 2 | **Add `Driver.userId` (optional, unique) and `DeliveryRecord.driverId` FK; backfill by name; scope by `driverId`** | Correct identity; renames are safe; standard practice | Migration plus backfill; historical names must stay displayable | L |
  | 3 | ~~2 + the Driver Manager can "Invite login"~~ | — | **Rejected by decision 6:** only Admin creates accounts | — |
- **Decision (2026-10-06):** **Only Admin can create driver accounts.** This matches today's guards: every user write route is `requireRole('ADMIN')` (`server/src/routes/users.ts:26, 51, 88, 117, 143, 207`). Logistics' Driver Manager stays a **directory** of profiles, so B-3.3 ("no account created") is **working as designed**, and the UAT expected result should say so.
- **Recommendation:** Option 2. The gap B-3.3 exposed is the missing link between the two records, not who creates them:
  1. **Admin Panel → Create user:** when the role is DRIVER, require the Admin to **pick an existing Driver profile** (or create one inline). Save the user and set `Driver.userId` in one `prisma.$transaction`.
  2. **Driver Manager (Logistics):** show a read-only "Login: Linked / Not linked" badge on each profile. Optionally add a "Request account" action that notifies Admins through the existing `notifyRole('ADMIN', …)` (`server/src/services/inAppNotify`). It creates nothing itself.
  3. **Scoping:** driver access uses `driverId` / `userId` instead of the display name (`recordAccess.ts:26`, `records.ts:418, 545`), so an Admin rename can't orphan assignments.
  4. **Guard:** a DRIVER user without a linked profile sees "Your account isn't linked to a driver profile. Contact an Admin." instead of an empty dashboard.
- **Severity:** High · **MoSCoW:** Must (link + scoping) / Could ("Request account")
- **Draft acceptance criteria:**
  - Given a Logistics user, when they call `POST /api/users`, then the response is 403 (already true today; keep it).
  - Given an Admin creating a DRIVER user, when no Driver profile is chosen, then the save is blocked.
  - Given a linked driver whom an Admin renames, then the driver still sees all their assigned runs.
  - Given a Driver profile with no login, then the Driver Manager shows "Not linked".
- **UAT plan change:** B-3.3's expected result should add "No login is created; an Admin creates and links the account". Add an Admin test for creating and linking a driver account.

**[E-2] Remove the false Customer → delivery-history link** — UAT: `A-4.3`
- **Type:** Defect (a feature that can never work) + invalid test
- **Decision:** Customer (merchant directory) and Company (record lookup) are **separate** entities (answer 3), which matches `schema.prisma:65-67`.
- **Current behavior:** The Customer workspace shows a "Record History" tab (`CustomerWorkspace.tsx:31`) that filters on `r.customer_id === customer.id` (`:113`). The client fills `customer_id` with `company_id` (`useRecordsQuery.ts:10`), and the `customer_id` field in `client/src/types/delivery.ts:45` is commented "link back to Customer master", which is misleading. The tab will always say "No records found".
- **Options:**
  | Option | Approach | Pros | Cons | Effort |
  | --- | --- | --- | --- | --- |
  | 1 | **Remove the Record History tab and the misleading `customer_id` alias** | Honest UI; no false "no records"; matches the confirmed model | Customers page shows no transaction context | S |
  | 2 | Keep the tab but relabel it as an explanation ("Customers aren't linked to delivery records") | Very cheap | Leaves dead UI in place | S |
  | 3 | Show delivery history where it actually lives: a **Company** detail view (records joined by `companyId`) | Gives users the history they expected in A-4.3 | A new view; new scope | M |
- **Recommendation:** Option 1 now. Log Option 3 as a separate feature request if SC users want per-company history.
- **UAT plan change:** remove A-4.3, or rewrite it as "Customer workspace has no Record History tab."
- **Severity:** Medium · **MoSCoW:** Should · **Effort:** S
- **Draft acceptance criteria:**
  - Given any Customer, when its workspace opens, then no Record History tab is shown.
  - Given the codebase, then no client type or mapping calls a Company ID `customer_id`.

**[E-3] Edit customers** — UAT: `A-4.2`
- **Type:** Missing capability
- **Current behavior:** Only GET and POST exist (`server/src/routes/customers.ts:7, 30`). Note that POST allows **DRIVER** (`customers.ts:30`), which looks unintended.
- **Recommendation:** Add `PUT /api/customers/:id` (SC/Logistics/Admin, with an AuditLog entry) and remove DRIVER from POST.
- **Severity:** Medium · **MoSCoW:** Must · **Effort:** S

**[E-4] Per-Company delivery history** — UAT: `A-4.3` (replacement)
- **Type:** New capability, ✅ **decided 2026-10-06 (7a: yes)**
- **Context:** records belong to a **Company** (`DeliveryRecord.companyId`, indexed at `schema.prisma:151`). Customers stay a separate directory (decision 7), so history belongs to the Company.
- **Options:**
  | Option | Approach | Pros | Cons | Effort |
  | --- | --- | --- | --- | --- |
  | 1 | **Company history panel:** clicking a company name (in the Deliveries list or the Record Workspace header) opens a side panel listing that company's records across all categories, with filters for category, status and date range | No new screen or permission; reuses the existing Record History table from `CustomerWorkspace.tsx:182-250` | Discoverable only from records | S–M |
  | 2 | A new "Companies" screen (list + workspace) | Full master-data view | New screen: must be registered in `screenRouting.ts`, the Sidebar and `SCREEN_LABELS`/`ROLE_DEFAULTS` (CLAUDE.md rule) | M |
  | 3 | A "Company" filter in Transaction Center | Very cheap | Not a history view | S |
- **Recommendation:** Option 1. Move the Record History table out of `CustomerWorkspace` (it's being removed there by E-2) into a shared component, and point it at `companyId`. Data can come from the records the client already loads, or from `GET /api/records?companyId=` if volume grows. Both respect `recordScope`, so TASS and others only see categories they're allowed to.
- **Severity:** Medium · **MoSCoW:** Should · **Effort:** S–M
- **Draft acceptance criteria:**
  - Given an SC clicks a company name, then a panel lists every record for that Company that the SC is allowed to see, newest first.
  - Given a record in the panel is clicked, then it opens in its own module's workspace.
  - Given a TASS user, then the panel shows only RMA and Accounting Collection records.
- **UAT plan change:** replace A-4.3 with "Company delivery history shows linked records".

### F. Terminology & module cleanup

**[F-1] RMA vs TASS label** — UAT: `B-1.2`
- **Current behavior:** Hard-coded swap for Logistics only (`client/src/layouts/Sidebar.tsx:178-181`). TASS is also a *role* name (`auth.ts:7`), so the module label clashes with the role.
- **Decision (2026-10-06):** ✅ **Rename to "RMA" everywhere.** The module is the process; TASS is the team or role that owns it.
- **Recommendation:** remove the role-based swap in `Sidebar.tsx:178-181`. Also check other user-facing strings that call the module "TASS", such as the server error "Logistics has view-only access to RMA/TASS records" (`records.ts:304, 386, 550`), and change them to "RMA records". Keep `TASS` as the role name. **Severity:** Low · **MoSCoW:** Should · **Effort:** S
- **UAT plan change:** B-1.2's expected result becomes "Label reads RMA for every role".

**[F-2] Comments vs Remarks** — UAT: `B-1.4`
- **Current behavior:** Three similar concepts: `DeliveryRecord.remarks` (latest note), `RemarkLog` (append-only change reasons, `schema.prisma:277-287`), and `Comment` (free discussion, `:248-259`). There are separate Remarks and Comments tabs (`DeliveryRecordWorkspace.tsx:76`).
- **Recommendation:** Rename for intent: **"Change reason"** (required, tied to an edit) and **"Discussion"** (optional chat). Add helper text under each input. **Severity:** Low · **MoSCoW:** Should.

**[F-3] Remove Status History** — UAT: `B-5.2`
- **Current behavior:** The screen is registered (`Sidebar.tsx:304-305`) and backed by `/records/status-history-counts` (`records.ts:68-127`). Why it failed in UAT is [UNVERIFIED].
- **Recommendation:** Remove the screen, the permission key (`server/src/services/permissions.ts:118, 127`), and the endpoint. The per-record Audit Trail plus Statistical Reports cover the same need. Clean up `UserPermission` rows for `status_history`. **MoSCoW:** Must (stakeholder already decided) · **Effort:** S.

**[F-4] Driver Board layout** — UAT: `B-3.1`
- **Recommendation:** A lane-per-driver board (a column for each driver, with run cards ordered by priority and time, and status color chips), or a dispatch timeline. Use the same badge palette as `DriverDashboard.tsx:104-117` for consistency. **MoSCoW:** Could.

**[F-5] Visual consistency** — UAT: `A-4.1`
- **Recommendation:** Set a typography token rule (entity names in tables `font-semibold`, never `font-bold`) and apply it across list views. **MoSCoW:** Could · **Effort:** S.

### G. Verification gaps & repo-found gaps

**[G-0] Unauthenticated database wipe** — UAT: none (found in the repo review)
- **Type:** Security defect
- **Current behavior:** `router.post('/public-seed', …)` has no auth and no `NODE_ENV` check (`server/src/routes/dev.ts:26-34`). It deletes all tables, including users and audit logs (`server/prisma/seed.ts:164-179`). It breaks the CLAUDE.md rule "every write route must have requireAuth + requireRole".
- **Options:** (1) **Delete the route and the login-page button; use only the CLI `npm run seed`**; (2) gate it like `public-seed-uat` (env flag plus non-production).
- **Recommendation:** Option 1. A demo convenience doesn't justify an unauthenticated destructive endpoint.
- **Severity:** **Critical** · **MoSCoW:** Must · **Effort:** S

**[G-1] Comments POST missing `requireRole`** — `server/src/routes/records.ts:721`
- This breaks the project write-route convention. Add an explicit role list (decide whether DRIVER may comment). **Severity:** Medium · **MoSCoW:** Must · **Effort:** S

**[G-2] C-2.12 — Delivered without a photo via the API**
- **Code status:** Guard present. Inside a row-locked transaction (`records.ts:572-576`), it returns 400 `DELIVERY_PHOTO_REQUIRED` (`records.ts:601`).
- **Test:** Sign in as the driver. Use a record with only a PDF. Run `PATCH /api/records/:id/status` with `{"status":"Delivered","remarks":"test"}`. Expect 400 and the photo message. Then `GET /api/records/:id` should still show the previous status. Add this as a Vitest/supertest case.

**[G-3] C-2.13 — another driver's record**
- **Code status:** Guard present, at two layers: `requireRecordAccess` scopes by driver name, giving a 403 "Record access denied" (`records.ts:16-22`, `recordAccess.ts:26`), and there are explicit name checks (`records.ts:418-420, 545-547`). Uploads are also scoped (`records.ts:191`, which returns 404 rather than 403 after the middleware 403).
- **Test:** Driver A sends `POST /api/records/<B's id>/attachments` and `PATCH …/status`. Expect 403. Caveat: this relies on unique driver names (see E-1).

**[G-4] Driver can upload after Delivered**
- `POST /:id/attachments` has no status check (`records.ts:178-229`). Decide whether that's allowed (adding late evidence is OK if it's audited, per B-1).

---

## 3. Cross-cutting proposals

| Proposal | Resolves |
| --- | --- |
| **Driver identity by FK** (`Driver.userId`, `DeliveryRecord.driverId`) | E-1, B-3.3, the rename-orphan risk, G-3 caveat, A-1 driver-scope rule |
| **Record lifecycle state machine** (DRAFT → SCHEDULED → … with a transition table) | A-1, A-2, A-3 (required-on-submit), F-3 (history derives from audit) |
| **Toast service + sticky action bar convention** | C-1, C-2, C-3, A-2.6, A-4.2 placement |
| **Evidence-grade attachments** (soft delete, AuditLog on upload/delete, role and status rules) | B-1, C-2.5, G-4 |
| **Timestamp normalization** (ISO + `Asia/Manila` for "today") | D-1, C-3.2 rendering, driver "today" bug |
| **Glossary / ubiquitous language** | F-1, F-2, Accomplished↔Delivered labelling |

---

## 4. Decision log (for stakeholder review)

All decisions were confirmed on 2026-10-06. None are open.

| # | Decision | Answer / recommendation | Status | Owner |
| --- | --- | --- | --- | --- |
| 1 | Can a submitted record go back to Draft? | **Yes.** SC/Admin, with remarks, only before Time In (A-1) | ✅ Decided | SC lead |
| 1a | Does reverting to Draft clear the assigned driver? | **No, keep it hidden.** The assignment is kept but the driver can't see it while it's a draft (A-1) | ✅ Decided | Logistics lead |
| 2 | Do Drivers see future-dated runs? | **Yes.** Read-only "Upcoming" (D-4) | ✅ Decided | Logistics lead |
| 2a | Can a driver act on an overdue run? | **Yes, recorded as overdue** (audit marker + `completedLate`/`daysLate`) (D-4) | ✅ Decided | Logistics lead |
| 3 | What does Time In mean? | **Start of the scheduled delivery.** "Record Time In" moves the status to **In Transit** (see 3a). **Time Out** is auto-stamped on Delivered (D-1) | ✅ Decided | Logistics lead |
| 3a | What status does Time In set, given "Pending" already means "couldn't complete"? | **New "In Transit" status**, set only by Time In; Pending keeps its meaning (D-1) | ✅ Decided | Logistics lead |
| 3c | When a started run is Rescheduled, is its Time In cleared for the new date? | **Yes, clear it.** The old value stays in the Audit Trail (D-1) | ✅ Decided | Logistics lead |
| 3b | Can a delivery be marked Delivered without a Time In? | **No.** The server blocks completion without Time In, for every role (D-1) | ✅ Decided | Logistics lead |
| 4 | Is Received By mandatory? | **Yes**, on the Driver dashboard (D-2) | ✅ Decided | Logistics + SC |
| 4a | Also required from the Dispatch tab (Logistics/Admin)? | **Yes**, so there's no desktop bypass (D-2) | ✅ Decided | Logistics lead |
| 5 | Who owns Priority? | **Both SC and Logistics**, edited in Overview + bulk (D-3) | ✅ Decided | SC + Logistics |
| 6 | Can Logistics create driver logins? | **No. Admin only**, linked to a Driver profile (E-1) | ✅ Decided | Admin |
| 7 | Customer vs Company: one entity? | **Separate.** Remove the false history tab (E-2) | ✅ Decided | SC lead + Dev |
| 7a | Should SC get per-Company delivery history? | **Yes.** Company history panel (E-4) | ✅ Decided | SC lead |
| 8 | Module name | **"RMA" everywhere**; TASS stays a role name (F-1) | ✅ Decided | TASS lead |
| 9 | Reason required to remove an attachment? | **No reason.** Light confirm + audit entry (B-1) | ✅ Decided | Logistics lead |
| 10 | Staged vs immediate upload | **Staged until Save** (B-2) | ✅ Decided | Logistics lead |

---

## 5. Priority matrix

| Item | Severity | MoSCoW | Effort | Release-blocking? |
| --- | --- | --- | --- | --- |
| G-0 Unauthenticated DB wipe | Critical | Must | S | **Yes** |
| A-1 Draft lifecycle (both directions) / driver visibility | High | Must | M | **Yes** |
| B-1 Attachment removal + audit | High | Must | M | **Yes** |
| D-1 New In Transit status + transition table, server-stamped Time In/Out, Manila "today" | High | Must | M | **Yes** |
| G-1 Comments `requireRole` | Medium | Must | S | **Yes** (convention) |
| D-2 Received By required (all roles) | Medium | Must | S | **Yes** (decided completion rule) |
| E-1 Driver identity FK + Admin create-and-link | High | Must | L | No (mitigate: block renames) |
| E-3 Customer edit + remove DRIVER create | Medium | Must | S | No |
| F-3 Remove Status History | Medium | Must | S | No |
| A-3 Required Delivery Date | Medium | Must | S | No |
| C-1 Toast service | Medium | Must | S | No |
| C-3 Unified save bar | Medium | Should | M | No (but B-2 depends on it) |
| B-2 Staged upload (+ IndexedDB for drivers) | Medium | Should | M | No |
| D-4 Overdue (actionable, recorded) / Upcoming | Medium | Should | M | No |
| E-2 Remove false Customer history tab | Medium | Should | S | No |
| E-4 Per-Company delivery history panel | Medium | Should | S–M | No |
| B-3 Driver views done record | Medium | Should | S | No |
| A-2 Draft/Submit buttons | Medium | Should | S | No |
| C-2 Same-status helper text | Low | Should | S | No |
| F-1 / F-2 Terminology | Low | Should | S | No |
| G-2 / G-3 API tests | Low | Should | S | No |
| D-3 Priority in Logistics Overview + SC after Scheduled | Low | Should | S | No |
| F-4 / F-5 Visual polish | Low | Could | S–M | No |

**Schema migrations implied** (bundle where possible, per the CLAUDE.md rule to run `prisma migrate dev` for every schema change): B-1 attachment soft delete; D-4 `completedLate`/`daysLate`; E-1 `Driver.userId` + `DeliveryRecord.driverId`. A-1 and D-1 need **no** migration, because `status`, `timeIn` and `timeOut` are already string columns. Normalizing existing `"HH:MM"` time values to ISO needs a one-off data script.

---

## 6. Suggested sequencing

1. **Security batch:** G-0, G-1. No dependencies. The site is internal-only, so this goes through the normal `fix/` flow instead of a hotfix, but it must land before the site is shared more widely.
2. **Delivery-rules batch** (all decided, no migration): D-1 (time-in endpoint → In Transit, In Transit status + transition table via a shared status config, server-stamped Time Out for all roles, ISO corrections, Manila "today", Time In required to complete, bulk Delivered/Pending removed), D-2 (Received By, all roles), A-3 (required date), and the interim E-1 mitigation (block user renames when assignments exist).
3. **Lifecycle batch:** A-1 (Draft ⇄ Submitted with guards; the driver assignment is kept but hidden), A-2 buttons, then D-4 Overdue/Upcoming (depends on A-1 hiding drafts and D-1 "today"). A-1 must land before the drivers re-test Part C.
4. **Feedback & save-model batch:** C-1 toast service, then C-3 sticky save bar, C-2, A-2.6/A-4.2 placement, F-5. C-3 comes before B-2 because staged files upload through that Save.
5. **Evidence batch (one migration):** B-1 soft delete + audit, D-4 reporting fields, B-2 staged upload (desktop through the save bar; Driver stages and uploads on Confirm, with IndexedDB), the G-4 rule, B-3.
6. **Master-data batch (one migration):** E-1 (Driver↔User FK, Admin create-and-link flow, ID-based scoping), E-3. E-2 and E-4 ship together (they share the Record History table) and can go any time.
7. **Cleanup batch:** F-3 removal, F-1 rename to RMA, F-2 terminology, D-3 priority placement, F-4 Driver Board.
8. **Regression:** G-2/G-3 automated tests. Update the UAT plan (A-2.5, A-4.3, B-1.2, B-2.7, B-2.8, B-3.3, C-1.4, C-2.1, C-2.7, C-2.9, Part C note) and re-run Parts A–C and X.
