# Plan: Logistics "Mark as delivered" button on every record type

Status: approved by Dylan on 2026-11-13 (section 11). Ready for stage 2.
Date: 2026-11-13
Base: `feature/logistics-rma-transport` at `f07da8a` (off `dev` at `40c14af`; pushed, not merged, QA with Codex in
progress). All code references below are on `f07da8a`.
Feature branch for stage 2: `feature/logistics-mark-delivered`, stacked on `feature/logistics-rma-transport`. After that
branch merges into `dev`, rebase this one onto `dev` before its PR. This file moves to
`docs/plans/logistics-mark-delivered.md` in the first commit.
Screens: record page > Status & Actions (Deliveries, Sales Orders, Procurement Pick-up, RMA); Accounting Collection >
Overview > Collection Status; Drivers > View.
Mockups: `mockups/` next to this file. They are static pages drawn with the app's Tailwind classes, not app code.

## 1. Summary

Dylan's ask: Logistics should mark a record as delivered through an option button in the Status & Actions tab, on every
record type (Deliveries, Sales Orders, Procurement Pick-up, RMA, Accounting Collection), instead of the proof uploader,
Received By field and completion controls being shown directly on the page.

Today the steps to complete a run are spread over up to four places on the tab: the photo uploader at the top, the
"Delivered" status option, Received By inside the driver section, and remarks plus Save Changes at the bottom. They
also look different on each record type and screen. On an In Transit RMA the completion controls sit under the long
assignment form, which is why they were hard to find.

Proposal: every record type gets one **Next step** card at the top of its status area with a single, clearly named
button: **Start transport** before the run starts, then **Mark as delivered** (**Mark as collected** on Accounting
Collection). The button opens a focused dialog that holds exactly what that step needs: proof photo, Received by and
remarks to complete, remarks to start. Nothing about completion is shown inline any more.

This is a client-only change. No API, server, permission or database change: the dialogs call the endpoints and checks
that exist today, and each button appears only for users who can already do that action.

## 2. Current behaviour (verified in code on `f07da8a`)

### 2.1 What Logistics sees on each record type

| Record type | Where the controls are | To mark it delivered today |
| :--- | :--- | :--- |
| Deliveries, Sales Orders, Procurement Pick-up | Record > Status & Actions (`ActionsTab`, `client/src/features/deliveries/DeliveryRecordWorkspace.tsx:1075`) | 1. proof uploader at the top of the tab (`:1256`), shown even before the run starts; 2. pick "Delivered" among the status options (`:1269-1286`); 3. type Received By in "Driver & delivery details" (`:1451-1461`); 4. type remarks and press Save Changes at the bottom (`:1491-1541`). The missing-photo message appears under the status options (`:1320`). |
| Accounting Collection | Record > Overview > Collection Status card (`client/src/features/accounting/AccountingCollectionWorkspace.tsx:576-640`). This workspace has no Status & Actions tab (tabs at `:49-54`). | Uploader (`:587`), Received By (`:588-589`) and remarks are inline; the "Collected" status button stays disabled until everything is present (`:616`). |
| RMA (Logistics transport) | Record > Status & Actions (`client/src/features/deliveries/RmaWorkflowPanel.tsx`) | The proof uploader (`:270`) and the "Recording for <driver>" line (`:271`) sit below the assignment form; Received by (`:287-290`) and one shared Remarks box (`:291-294`) feed both Save assignment and Complete transport (`:311-319`). |
| Any type, from Drivers > View | Run detail (`client/src/features/drivers/DriverView.tsx:367-399`) | Received By and the uploader are inline; Accomplish opens a confirm dialog that asks for remarks only (`:427-460`). |

Starting a run has the same problem on the record page: the blue "Record Time In" box
(`DeliveryRecordWorkspace.tsx:1257-1263`, `AccountingCollectionWorkspace.tsx:590-591`) stays disabled until remarks are
typed in the box at the bottom of the tab.

Before picture: `../logistics-rma-transport/evidence/logistics-procurement-pickup-actions.png`.

### 2.2 Rules the dialogs keep exactly as they are

- Non-RMA completion, `PATCH /records/:id/status` (`server/src/routes/records.ts:1610`): Time In recorded, Received By
  required, a saved and server-verified JPG/PNG photo, remarks required. Delivered is allowed from In Transit, Pending
  and On-Hold once Time In exists (`server/src/services/deliveryLifecycle.ts:51-59`). The server stamps Time Out. The
  Accomplished output actions run after a successful save (`DeliveryRecordWorkspace.tsx:1227-1237`).
- RMA transport completion, `PATCH /records/:id/rma-transport`: remarks, Received by (1 to 120 characters), a verified
  proof photo and `expected_version` (409 when stale). TASS still confirms receipt and completes the RMA.
- Start: `POST /records/:id/time-in` (non-RMA) or `rma-transport` `IN_TRANSIT` (RMA). Remarks stay required for
  Logistics and Admin (decision 1 of driver-start-confirmation). Logistics keeps the planned-date rule on RMA.
- Photos picked before confirming are staged on the device and already count as ready
  (`client/src/api/queries/usePodAttachments.ts:112`); they upload when the action is confirmed, as today.
- The driver's flow (job card and sheets, `client/src/features/dashboard/DriverDashboard.tsx:375-466`) sets the wording
  and order: title, "<Company> (<type>)", reference, fields, Cancel and Confirm.

## 3. Options considered

| Question | Option | Verdict |
| :--- | :--- | :--- |
| How the button reveals the fields | **A. Modal dialog** (the existing `ActionDialog`, a native `<dialog>`) | **Recommended.** Completing is a commit with three required inputs. A dialog separates it from the tab's other edit-then-save sections, keeps keyboard focus inside, closes with Escape, and matches Download PDF, Return to Draft and the driver sheets. |
| | B. Inline expand (the button opens a panel in place) | Keeps the page visible, but the panel competes with the tab's own Save Changes button and the long scroll, and it is easy to leave half-filled. |
| Where the button sits | **A. Next step card at the top of the tab** | **Recommended.** The main action is the first thing Logistics sees; exception statuses stay in their own section below. |
| | B. Inside the status options grid | Mixes a save-now action with toggles that still need Save Changes. |
| Start transport | **A. Same pattern: a button that opens a small dialog with required remarks** | **Recommended.** Fixes the "type remarks at the bottom first" problem and makes start and finish look alike. |
| | B. Keep the blue Record Time In box | Leaves one of the two scattered flows in place. |

UI/UX basis: no dedicated UI/UX skill is installed in this account or in the repo (checked), so the design applies
Nielsen's usability heuristics (show the next step, recognition over recall, prevent errors and always show why an action
is blocked), the WAI-ARIA dialog pattern and WCAG 2.2 AA (focus order and return, labelled fields, 44 px targets, no
colour-only cues, phone width without sideways scrolling). It reuses the app's existing dialog, colours and wording.

## 4. Scope

In scope
- A Next step card at the top of: Status & Actions for Deliveries, Sales Orders and Procurement Pick-up; the RMA
  transport panel (record page and Drivers > View); the Collection Status card on Accounting Collection (Q3).
- **Mark as delivered** dialog (**Mark as collected** on Accounting Collection): summary, the "Recording for <driver>"
  line, proof photo, Received by (required, up to 120 characters), Remarks (required), a live "Still needed" line, Cancel
  and Confirm.
- **Start transport** dialog (Q2): summary, the "Recording for <driver>" line, "Time In is recorded when you confirm.",
  Remarks (required), Cancel and Confirm.
- Removing the inline controls: the always-on proof uploader, the "Delivered" status option, Received By before
  delivery and the blue Record Time In box (record page and Accounting Collection); the inline uploader, Received by and
  transport buttons in the RMA panel.
- Drivers > View uses the same two dialogs (Q4).
- Client tests, E2E updates and the UAT doc.

Out of scope
- Server, API, permission and database changes, and the RMA permission switch (handled by
  `feature/logistics-rma-transport`).
- Pending, On-Hold, Rescheduled and Return to Draft keep today's option buttons and Save Changes. (Possible follow-up:
  the same dialog pattern.)
- TASS RMA actions (Confirm physical receipt, Save RMA status, Complete RMA) and collection verification.
- The driver dashboard, job card and sheets.
- A server-side 120-character limit for Received By on non-RMA records (today only the client checks it; possible
  follow-up).

## 5. Changes

### 5.1 Data and API

None. No migration, no new endpoint, no switch.

### 5.2 Permissions

None. Each button shows only when today's checks already allow the action, and the server keeps enforcing every rule:

| Button | Shown when |
| :--- | :--- |
| Start transport (non-RMA) | Logistics or Admin, `canRecord(category, 'TIME_IN')` and `canRecordTimeIn(record)` (same as today's Record Time In) |
| Mark as delivered or collected (non-RMA) | Logistics or Admin, `canRecord(category, 'STATUS')` and `canRecord(category, 'COMPLETE')`, record not Draft, `allowed_statuses` includes Delivered (so Time In exists) |
| Start transport (RMA) | `caps.transport` and transport Pending (Logistics after the switch; never Admin, decision D1) |
| Mark as delivered (RMA) | `caps.transport` and transport In Transit |

### 5.3 Client

New shared pieces
- `client/src/features/deliveries/NextStepCard.tsx`: one presentational card (state line, one action button, and a
  short hint that says what the button opens, for example "Opens a short form for the proof photo, Received by and
  remarks."), used on all four screens.
- `client/src/features/deliveries/MarkDeliveredDialog.tsx`: wraps `ActionDialog`. It owns the `PodUploader` (purpose
  `transport` on RMA), Received by and Remarks. On Confirm it uploads staged photos, then calls the screen's
  `onConfirm({ receivedBy, remarks })`. A rejected save keeps the dialog open with the server message and the typed
  values.
- `client/src/features/deliveries/StartTransportDialog.tsx`: wraps `ActionDialog`; Remarks only; calls
  `onConfirm(remarks)`.
- `client/src/utils/completionDialog.ts` (pure functions, unit tested): the button label per category, the "Still
  needed" list (photo, Received by, remarks, the 120-character limit, upload in progress, photo check failed), the next
  step for a record, and the line "Recording for <driver>. This is saved under your name." (same wording as the RMA panel
  today; the RMA helper reuses it).
- `client/src/components/ActionDialog.tsx`: three optional props. `size` (`'md'` default, `'lg'` for these dialogs),
  `icon` (defaults to today's icon; these dialogs use a check icon, because the current alert icon reads as a warning)
  and `confirmHint`, text shown above the buttons, linked to Confirm with `aria-describedby` and announced politely.
  Existing dialogs do not change.

Record page for Deliveries, Sales Orders and Procurement Pick-up (`ActionsTab`)
- Next step card first. It shows one of: "Assign a driver below before this run can start." (no button); Start
  transport (assigned, not started); "In transit since <time>." with Mark as delivered (Time In recorded and In Transit,
  Pending or On-Hold); "Delivered <time>. Received by <name>." (done, no button).
- Remove the top uploader, the blue Record Time In box and "Delivered" from the status options. Received By in "Driver &
  delivery details" shows only once the record is Delivered, for corrections with remarks as today.
- After Mark as delivered succeeds, run the same Accomplished output actions as the Save path. Move that block into one
  function that both paths call.
- While the tab has unsaved edits (a status option picked, a driver, assistant or time change, or typed remarks), the
  Next step button is disabled and the card says "Save or revert your changes below first." The dialog only sends the
  completion, so this avoids a silent conflict with half-made edits.

RMA panel (`RmaWorkflowPanel.tsx`, used on the record page and in Drivers > View)
- A Transport card right after the summary and before the assignment form: the "Recording for <driver>" line, then Start
  transport (Pending) or Mark as delivered (In Transit). Before the planned date it shows "Transport can start on
  <date>." and no button.
- Mark as delivered sends `transport_status: 'COMPLETED'` with `received_by`, `remarks` and the `rma_version` the dialog
  opened with. A 409 keeps the dialog open with "This RMA changed in another session. Close this and try again." and
  refreshes the record.
- Remove the inline uploader, the Received by field and the Start and Complete transport buttons from the actions
  section. Its Remarks box stays for Save assignment and the TASS actions. Transport no longer counts toward
  `hasAction` (`:159`), so a Logistics user with only transport rights does not see an empty actions section.

Accounting Collection (Overview > Collection Status card)
- The same card at the top of the Collection Status card: Start transport, then Mark as collected. Remove the inline
  uploader, Received By, Record Time In button and completion hint, and the "Collected" status button for Logistics and
  Admin. The Remarks box stays for the other status buttons and the Sales Coordinator's Submit.

Drivers > View (Q4)
- Record time in opens Start transport. Accomplish becomes Mark as delivered and opens the same dialog. Remove the
  inline Received By and uploader. Pending and Reschedule keep their confirm dialog.

Dialog behaviour on every screen
- Title "Mark as delivered" (or "Mark as collected"). Description "<Company> · <type> · Ref <reference>". On RMA it also
  says "This completes the transport. TASS still confirms receipt and completes the RMA."
- Focus moves into the dialog when it opens. Escape and Cancel close it unless it is saving. Closing saves nothing and
  clears the typed text; staged photos stay staged and show again next time (today's behaviour). Focus returns to the
  button, or to the card heading after a success.
- Confirm stays disabled until everything is ready, and the "Still needed: proof photo, remarks" line always says why.
  Inputs use `text-base` on phones so iOS does not zoom in.
- Success messages: "Marked as delivered", "Marked as collected", and on RMA "Transport complete. Waiting for TASS
  receipt." (same as the driver).

### 5.4 Docs

- `docs/UAT_PLAN.md`: B-2.7 becomes Start transport through the dialog; new rows for Mark as delivered on each record
  type and Mark as collected.
- `docs/testing-reference/existing-tests.md`: new and changed tests.

## 6. Wireframes

Status & Actions, Delivery in transit, as Logistics (rendered: `mockups/1-status-actions.png`):

```
┌ Next step ─────────────────────────────────────────────────────────┐
│ In transit since 9:42 AM · Driver: Juan Driver                     │
│ [ ✓ Mark as delivered ]                                            │
└────────────────────────────────────────────────────────────────────┘
┌ Delivery status ───────────────────────────────────────────────────┐
│ [ Pending ] [ On-Hold ] [ Rescheduled ]     (no "Delivered" here)  │
│ Current status: In Transit                                         │
└────────────────────────────────────────────────────────────────────┘
┌ Driver & delivery details ─────────────────────────────────────────┐
│ Driver, assistants, Time In / Time Out (Received By only after     │
│ delivery, for corrections)                                         │
└────────────────────────────────────────────────────────────────────┘
┌ Save delivery changes ─────────────────────────────────────────────┐
│ Change reason / remarks                     [ Revert ] [ Save ]    │
└────────────────────────────────────────────────────────────────────┘
```

Mark as delivered dialog (rendered: `mockups/2-mark-delivered-dialog.png`, phone: `mockups/3-dialog-phone.png`):

```
┌────────────────────────────────────────────────────┐
│ (✓) Mark as delivered                              │
│     Gap Check Company · Deliveries · Ref DR-1043   │
│                                                    │
│ Recording for Juan Driver. This is saved under     │
│ your name.                                         │
│                                                    │
│ Proof photo  (required)                            │
│ [ 📎 Select photo / document ]                     │
│ JPG or PNG. PDF, DOCX and XLSX are optional.       │
│                                                    │
│ Received by  (required)                            │
│ [ Who received it                               ]  │
│                                                    │
│ Remarks  (required)                                │
│ [                                               ]  │
│ Saved with your name in Remarks History.           │
│ ────────────────────────────────────────────────── │
│ Still needed: proof photo, Received by, remarks    │
│                       [ Cancel ] [ Mark as delivered ] │
└────────────────────────────────────────────────────┘
```

RMA in transit (rendered: `mockups/4-rma-transport-card.png`): the Transport card with the "Recording for" line and
Mark as delivered sits above "Driver & transport details".

## 7. Risks

1. Received By can no longer be typed before completion. It belongs to completion and is captured there; corrections
   after delivery still work.
2. Supporting documents before completion: the top uploader goes away. The Documents tab (unchanged) and the dialog both
   still accept files.
3. Two save models on one tab: Mark as delivered saves on Confirm, while the other statuses still need Save Changes.
   Mitigated by the separate card, the distinct button, the dialog's explicit Confirm and the unsaved-edits rule.
4. Skipped notifications: if the dialog path missed the Accomplished output actions, account managers would not be
   notified. AC6 covers it.
5. Stacked branch: this work depends on `feature/logistics-rma-transport`. If its QA sends fixes, rebase this branch;
   rebase onto `dev` after it merges. Other branches that edit `DeliveryRecordWorkspace.tsx` may also conflict.
6. Tests that drive the old inline controls (the Logistics RMA test in `client/tests/rmaCompletionWorkspace.test.ts` and
   the Logistics case in `e2e/tests/rma-dispatch.spec.ts`) are updated in the same phase, never skipped. JSDOM has no
   `showModal`; tests stub it like the existing dialog tests do (`client/tests/adminPanel.test.ts:55`).
7. `client/src/features/**/__tests__` is not in the client test command (`client/package.json`), so new tests go in
   `client/tests/` and `client/src/utils/__tests__/`.

## 8. Acceptance criteria (testable)

Setup unless stated: signed in as Logistics; a submitted Delivery assigned to Juan Driver, Time In recorded, status In
Transit. RMA cases assume the RMA switch is applied.

- **AC1** Status & Actions shows the Next step card first, with Mark as delivered. No proof uploader, Received By input
  or "Delivered" status option appears on the tab. Pending, On-Hold and Rescheduled are still offered.
- **AC2** Mark as delivered opens a modal dialog titled "Mark as delivered" that shows the company, record type,
  reference and "Recording for Juan Driver. This is saved under your name.", with a proof photo picker, a required
  Received by field (up to 120 characters) and a required Remarks field. Focus is inside the dialog and the page behind
  it cannot be used.
- **AC3** Confirm is disabled, and "Still needed" lists every missing item, until a JPG or PNG photo is staged or saved,
  Received by has 1 to 120 characters and remarks are typed. A PDF alone does not count.
- **AC4** Confirm uploads staged photos, then sends `PATCH /records/:id/status` with `status: 'Delivered'`, the trimmed
  `received_by` and the remarks. On 200 the dialog closes, "Marked as delivered" shows, the record shows Delivered with
  Time out and Received by, and the card reads "Delivered <time>. Received by <name>."
- **AC5** A rejected save (400 with no verified photo, 403, network error) keeps the dialog open with the message and
  the typed values. Nothing is saved.
- **AC6** The configured Accomplished output actions run after a dialog completion exactly as after the old Save path
  (same trigger and arguments).
- **AC7** Cancel or Escape saves nothing, clears the typed values, keeps staged photos staged and returns focus to Mark
  as delivered. While saving, Cancel and Escape do nothing.
- **AC8** AC1 to AC7 also hold for Sales Orders and Procurement Pick-up.
- **AC9** (Q2) On an assigned Scheduled run without Time In, the card shows Start transport. Its dialog requires
  remarks and sends `POST /records/:id/time-in`; on 200 the run is In Transit and the card shows Mark as delivered. The
  blue Record Time In box is gone. With no driver assigned, the card says to assign one and shows no button.
- **AC10** Accounting Collection: the Collection Status card shows Start transport, then Mark as collected. The dialog
  is titled "Mark as collected"; on 200 the status reads Collected and TASS gets "Collection ready for verification".
  Logistics sees no inline uploader, Received By or Collected status button.
- **AC11** RMA with Logistics transport, In Transit: the Transport card above the assignment form shows Mark as
  delivered. The dialog uses the transport proof photo. Confirm sends `PATCH /records/:id/rma-transport` with
  `transport_status: 'COMPLETED'`, `received_by`, `remarks` and `expected_version`. On 200 the RMA shows "Transport:
  Complete" and "Awaiting physical receipt confirmation by TASS.", and the RMA status is unchanged. A stale version (409)
  keeps the dialog open with the message and refreshes the record.
- **AC12** RMA Pending: Start transport opens the start dialog and sends `IN_TRANSIT` with remarks. With a planned date
  in the future the card shows "Transport can start on <date>." and no button. Save assignment still works with its own
  remarks.
- **AC13** Who sees the buttons does not change: Admin sees them on non-RMA records where it has the rights today and
  never on RMA transport; TASS and Sales Coordinator never see them; a Logistics account with Complete switched off for a
  category (V1) sees no Mark as delivered there; before the RMA switch runs, Logistics sees no RMA transport button.
- **AC14** No button on: Draft, Delivered, RMA transport Completed or received, or an RMA whose movement is not
  Logistics transport.
- **AC15** With unsaved edits on the tab, the Next step button is disabled and the card says "Save or revert your
  changes below first."
- **AC16** (Q4) Drivers > View: Record time in and Mark as delivered open the same dialogs; there is no inline Received
  By or uploader; Pending and Reschedule work as before. An RMA run there shows the Transport card.
- **AC17** Keyboard only and at 390 x 844: every control in the card and dialog is reachable with Tab, has a visible
  focus ring and a 44 px target; the dialog fits without sideways scrolling; a screen reader announces the title,
  description, "Still needed" changes and errors.
- **AC18** The driver dashboard is unchanged: job card, start sheet and complete sheet behave as before.
- **AC19** `npx tsc --noEmit` passes for the client. Client tests pass, with new tests for AC1 to AC17 at component
  level. Server tests are unchanged and pass. E2E: the Logistics case in `e2e/tests/rma-dispatch.spec.ts` uses the
  dialog and passes, and a new Logistics Delivery case (start, upload photo, mark as delivered) in
  `e2e/tests/logistics.spec.ts` passes.

## 9. Stage 2 phases (one commit each, tests alongside)

1. Shared pieces: `completionDialog.ts`, `ActionDialog` `size` and `confirmHint`, `NextStepCard`,
   `MarkDeliveredDialog`, `StartTransportDialog`. Tests: `client/src/utils/__tests__/completionDialog.test.ts`,
   `client/tests/markDeliveredDialog.test.ts`.
2. Record page for Deliveries, Sales Orders and Procurement Pick-up. Tests: `client/tests/logisticsNextStep.test.ts`
   (AC1 to AC9, AC13 to AC15).
3. RMA panel. Tests: update `client/tests/rmaCompletionWorkspace.test.ts` (AC11, AC12).
4. Accounting Collection. Tests for AC10.
5. Drivers > View (Q4). Tests: `client/tests/driversPage.test.ts`.
6. E2E and docs: update the Logistics case in `e2e/tests/rma-dispatch.spec.ts`, add a Logistics Delivery case to
   `e2e/tests/logistics.spec.ts`, update `docs/UAT_PLAN.md` and `docs/testing-reference/existing-tests.md`.

Release (stage 4): no migration and no switch. Merge `feature/logistics-rma-transport` first, then this branch after
QA.

## 10. Open questions for Dylan

All answered (section 11).

- **Q1.** Modal dialog or inline expand? Answered: modal dialog (popup).
- **Q2.** Should Start transport become a button with a dialog too, replacing the blue Record Time In box? Answered:
  yes, with remarks still required for Logistics.
- **Q3.** Accounting Collection has no Status & Actions tab; its status controls are in the Collection Status card on
  Overview. Put the button there, or add a Status & Actions tab? Answered: the Collection Status card.
- **Q4.** Use the same buttons and dialogs in Drivers > View? Answered: yes. (The RMA run there changes either way,
  because it shares the RMA panel.)

## 11. Decisions log

Dylan, 2026-11-13:
- Q1. Popup: the fields open in a modal dialog (`ActionDialog`). Option not taken: inline expand.
- Q2. Yes: Start transport becomes a button that opens a dialog with required remarks, replacing the blue Record Time
  In box (record page and Accounting Collection).
- Q3. The button goes in the Collection Status card on Accounting Collection > Overview. No new Status & Actions tab.
- Q4. Yes: Drivers > View uses the same Start transport and Mark as delivered dialogs.
- Answers matched every recommendation; plan approved as written. The stated defaults apply: "Mark as delivered"
  everywhere except "Mark as collected" on Accounting Collection, and the branch is stacked on
  `feature/logistics-rma-transport`, rebased onto `dev` after that branch merges.
