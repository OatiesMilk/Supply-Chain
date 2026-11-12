# Prompt — UAT v1.1 Solution Brainstorm (SC · Logistics · Driver)

> Paste everything below the line into Claude Code, running from the Supply-Chain repo root.
> Attach or reference: `UAT-Plan-Sales-Coordinator-Logistics-and-Driver.md`

---

<role>
You are a senior product engineer and business analyst who specializes in logistics and supply-chain portals: delivery management, ePOD, dispatch, and RMA. You know industry-standard practice for document management, RBAC, audit trails, form UX, and record state machines. Your job is to brainstorm solutions. You are not implementing anything.
</role>

<context>
Project: the Microgenesis Supply Chain Portal. Stack: React 19 + TS + Vite + TanStack Query + Zustand + Tailwind v4 on the frontend; Express + TS + Prisma/PostgreSQL on the backend; auth is a JWT in an httpOnly cookie. Roles: SALES_COORDINATOR, LOGISTICS, TASS, ADMIN, DRIVER. CLAUDE.md in the repo root is authoritative for conventions.

UAT Plan v1.1 (2026-10-06) was executed against the Sales Coordinator, Logistics, and Driver roles. Most tests passed. The testers did log hard Fails, some "Pass with a remark" results that are effectively defects, untested items, and many UX and business-rule observations. Those findings are the input to this brainstorm.
</context>

<hard_constraints>
- BRAINSTORM ONLY. Do NOT edit, create, or delete source files. Do NOT run migrations, seeds, `npm run dev`, git commits, or Notion writes. You may only read and search (Read, Grep, Glob, read-only shell).
- Ground every claim about current behavior in the code and cite it as `path:line`. If you could not verify something, label it **[UNVERIFIED]**. Never guess silently.
- Every proposal must keep these existing business rules (invariants) unless you explicitly argue for changing one and mark the item "Rule change — needs sign-off":
  1. A delivery can become Delivered/Accomplished only when it has ≥1 real JPG/PNG photo (validated by its magic bytes), remarks, a non-blank **Received By**, and a recorded **Time In**, **whichever role completes it** (Driver, Logistics or Admin). This is enforced on the server as well as the client. PDF/DOC files are supporting documents only.
  2. Remarks are mandatory on every edit, driver assignment, and status change. Every such change writes to the Audit Trail with the actor's name. Exception: removing an attachment needs no reason, but it is still audited.
  3. Every write route keeps `requireAuth` + `requireRole(...)`. Never propose weakening a guard.
  4. A Driver sees only non-draft records assigned to them. They can act on **today's and overdue** runs, and every overdue action is recorded as overdue. **Future** runs are visible but read-only. Assigned-driver checks are enforced on the server (expect 403 otherwise).
  5. The Driver UI label "Accomplished" maps to the Logistics/system status "Delivered".
  6. Logistics has view-only access to RMA records.
- Keep within the scope of the findings below. Do not propose unrelated refactors.
</hard_constraints>

<confirmed_decisions date="2026-10-06">
These are settled stakeholder decisions. Treat them as fixed requirements: design around them, and don't present alternatives to them.
- **Hosting:** `supply-chain-en7.pages.dev` is internal to the dev team only. Security gaps are release blockers, not emergency hotfixes.
- **Drafts:** submitted records may go back to Draft (SC/Admin, with remarks), but only before Time In. Drafts are invisible to drivers and can't be newly assigned. If a driver is already assigned, the assignment is **kept but hidden** until the record is re-submitted.
- **Status lifecycle:** Draft → Scheduled → **In Transit** → Delivered, with Pending, On-Hold and Rescheduled as side states. **In Transit is a new status, set only by the Time In action** and never picked manually or in bulk. Pending means "started but couldn't complete yet". All transitions go through one allowed-transition table.
- **Time In** = the start of the scheduled delivery. It's stamped from the server clock when the driver (or Logistics/Admin on the driver's behalf) taps Record Time In, and it moves the record to In Transit, once per attempt. **Time Out** is stamped automatically by the server when a record becomes Delivered, for every role. Manual Logistics edits are audited corrections stored as ISO. "Today" is `Asia/Manila`.
- **Rescheduling a started run** clears Time In (and Time Out). The old values stay in the Audit Trail.
- **Received By** is mandatory to complete a delivery from both the Driver dashboard and the Dispatch tab.
- **Overdue runs:** drivers may act on them. The server records the overdue marker and days late, and stores `completedLate`/`daysLate` on completion.
- **Attachments:** removal needs no reason, but it shows a light confirmation and writes an audit entry. Uploads are **staged until Save**; driver photos are kept in IndexedDB until uploaded.
- **Priority:** SC and Logistics can both change it, from Overview and from bulk.
- **Driver accounts:** **only Admin** creates them, linked to a Driver profile. Driver Manager (Logistics) is a profile directory only.
- **Customer vs Company:** separate entities. Remove the Customer "Record History" tab, and provide **per-Company delivery history** instead.
- **Module name:** "RMA" everywhere. TASS remains a role name only.
</confirmed_decisions>

<findings>
Classify each finding yourself; the hints in brackets are only a starting point.

**Hard Fails / effective defects**
- B-4.5 [Defect]: The Documents tab has no delete/remove button for uploaded files.
- C-2.5 [Defect, blocks test]: The Driver cannot remove uploaded files, so the test "PDF/DOC alone cannot accomplish" could not be run cleanly.
- B-2.6 [Defect, logged as Pass]: Saving the same status twice shows no error message (expected: "Choose a different status before saving.").
- C-3.1 [Defect/Gap]: The Driver cannot open or view an accomplished record's details.
- B-5.2 [Decision]: Status History fails to load, and the stakeholder says the module "is to be removed".

**Business-rule / data-lifecycle remarks**
- A-2.4: Delivery Date should be marked required. The separate Date/Time entry is redundant and could be auto-stamped on creation. The SAP No. and Company Name validation highlight is not cleared after a valid company is selected.
- A-2.5: Drafts look the same as valid records on /deliveries. Drafts must NOT be visible to Driver accounts. The create form should offer two explicit actions ("Save as Draft" / "Submit") instead of a Draft toggle, and should not allow a valid record to be reverted to Draft.
- C-3.3: "Received By" should be required to accomplish a delivery.
- B-2.7: The purpose of Time In / Time Out is unclear. Logistics can enter Time In manually and the Driver can also record it. Who owns these fields, and what do they measure?
- B-2.8: Priority can only be changed on the Dispatch tab; the tester expects it in Overview too. Decide who owns Priority (SC vs Logistics).
- B-3.3: Driver Manager creates a driver *profile*, but no login account is created. Note: the Driver dashboard currently matches records to the account **by exact name string**. Assess that design.
- B-4.2: Files upload immediately on selection. The tester expects them to stay staged until "Save" is clicked.
- A-4.2: Customers cannot be edited after creation.
- A-4.3 [Test gap]: Customer → delivery-history link could not be verified (no data).

**Feedback & UI consistency remarks**
- B-2.2, B-2.5: No success toast after saving a driver assignment or confirming a status change.
- B-4.2: There are redundant Save buttons inside Dispatch & Logistics. Propose a unified save model.
- A-2.6, A-4.2: Save/Submit button placement is inconsistent (left vs right, top vs bottom) across pages.
- A-4.1: Font weight is inconsistent (customer names are bold only on the Customers page).
- B-3.1: The Driver Board UI is described as "ugly". Propose a layout direction, not a pixel spec.

**Terminology / module remarks**
- B-1.2: The same module is labelled "RMA" for SC and "TASS" for Logistics. Should there be one name or role-specific names?
- B-1.4: The difference between "Comments" (Comments tab) and "Remarks" (mandatory change reason) is unclear to users.

**Verification gaps (not run)**
- C-2.12: API PATCH to Delivered without a photo → expect 400.
- C-2.13: Driver acting on another driver's record → expect 403.
For these two, do not brainstorm features. Read the code, state whether the guard exists, and give the exact manual or automated test that would prove it.
</findings>

<method>
Work through these steps in order. Show the result of each step only where the output format asks for it.

1. **Read first.** Read CLAUDE.md, `server/prisma/schema.prisma`, `server/src/middleware/auth.ts`, `server/src/mappings.ts`, the record/status/upload/customer/driver routes, `client/src/screenRouting.ts`, and the Deliveries workspace, Documents tab, Dispatch tab, and Driver dashboard components. Locate the code for each finding.
2. **Diagnose.** For each finding, record the observed behavior, the expected behavior, and a root-cause hypothesis backed by `path:line` evidence.
3. **Classify** each finding as one of: Defect · Missing capability · Business-rule decision · UX consistency · Test gap.
4. **Look for shared root causes.** Several findings probably trace back to one cause, for example: no shared toast/feedback system, no shared save-bar pattern, a driver↔user identity link done by name string, or no record state machine (Draft → Scheduled → …). Propose one cross-cutting solution per shared cause instead of patching each finding separately.
5. **Generate options.** For each item, give 2–3 options grounded in an industry-standard approach and name the standard or pattern. Relevant ones include:
   - ePOD practice: POD is immutable after completion; soft-delete with a reason before completion; capture the recipient name (and optionally a signature or geotag).
   - Document management: staged vs immediate upload, soft delete with an audit entry, retention.
   - Explicit record state machines with allowed transitions (draft/published, no backward transitions without privilege).
   - RBAC least privilege and row-level ownership.
   - Identity: link the driver profile to the user account with a foreign key, never by display-name matching.
   - Append-only audit trails.
   - Nielsen heuristics (visibility of system status, consistency & standards, error prevention).
   - Form UX conventions: one primary action in a consistent position, inline validation that clears on a valid input.
   - DDD ubiquitous language and a glossary for terminology conflicts.
6. **Recommend** one option per item and justify it in 1–3 sentences: business value, risk, effort, and fit with the existing invariants.
7. **Self-check.** Before finishing, verify that no proposal violates an invariant or contradicts a confirmed decision, that every item links back to a UAT ID, that every "current behavior" claim has a citation or an [UNVERIFIED] tag, and that nothing proposes code changes outside the findings.
</method>

<output_format>
Produce a single Markdown report with these sections:

### 0. Blocking questions
List anything you could not resolve from the code or the findings that would change a recommendation. Keep it short, and only include true blockers.

### 1. Executive summary
5–8 bullets: the top risks, the shared root causes, and the 3 items that most block a release.

### 2. Solutions by theme
Use these themes (adjust if the evidence argues otherwise): **A. Record lifecycle & drafts · B. Documents & POD · C. Save model & system feedback · D. Field ownership (Time In/Out, Priority, Received By) · E. Master data & identity (customers, drivers ↔ users) · F. Terminology & module cleanup · G. Verification gaps.**

For each item use this template:

**[Theme-#] Title** — UAT: `B-4.5, C-2.5`
- **Type:** Defect | Missing capability | Business-rule decision | UX consistency | Test gap
- **Current behavior:** … (`path:line`)
- **Root cause:** …
- **Options:**
  | Option | Approach (standard/pattern) | Pros | Cons | Effort (S/M/L) |
  | --- | --- | --- | --- | --- |
- **Recommendation:** … + why
- **Business rules affected:** existing invariants respected / new rule proposed: "…"
- **Severity:** Critical / High / Medium / Low · **MoSCoW:** Must / Should / Could / Won't (this release)
- **Needs stakeholder sign-off:** Yes/No — the question to ask: "…"
- **Draft acceptance criteria:** 2–4 Given/When/Then lines

### 3. Cross-cutting proposals
Shared patterns that resolve several items at once, such as a toast/feedback service, a unified sticky save bar, a record status state machine, or a driver–user FK. For each, list the items it resolves.

### 4. Decision log (for stakeholder review)
| # | Decision needed | Recommended answer | Alternatives | Owner (SC / Logistics / Admin / Dev) |

### 5. Priority matrix
| Item | Severity | MoSCoW | Effort | Release-blocking? |
Sort by release-blocking first, then by severity.

### 6. Suggested sequencing
An ordered list of work batches that respects dependencies (for example, the driver↔user link before draft-visibility rules for drivers). Do not write code.
</output_format>

<style>
- Be specific and concise. Prefer tables and bullets to prose.
- Use the portal's own vocabulary (Record Workspace, Dispatch & Logistics tab, Documents tab, Audit Trail, Field Mobile Dashboard).
- Mark opinions as recommendations and facts as citations. Do not pad the report.
</style>
