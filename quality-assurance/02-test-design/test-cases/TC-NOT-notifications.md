# Test Cases: Notifications

| Document control | |
|---|---|
| Title | Test Cases: Notifications |
| Document ID | QA-TC-NOT |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Ready for execution |
| Baseline | Branch `dev`, commit `2172fc8` |

In-app bell notifications (`server/src/services/inAppNotify.ts`) and the completion email, which the local mock mailer prints to the API terminal (`server/src/services/mailer.ts:92-94`) and logs in `NotificationLog`.

Conventions used in every case:
- `{D-XXX-NN.id}` is the Record ID (e.g. `REC-12345`) captured by the case that created data item `D-XXX-NN` (see `../test-data.md`). `<RUN>` is the run tag (e.g. `R01`), `<TODAY>` the Asia/Manila date of execution (YYYY-MM-DD), `<TODAY+n>` that date plus n days.
- "API helper" means the `api()` snippet in `../../AGENTS.md` §8, run in the named role's signed-in browser page. Record the HTTP status and the response body verbatim as the Actual Result.
- Actual Result, Status, Evidence and Defect ID are left blank for Codex. Status is one of Pass, Fail, Blocked, Not Run.

## Summary

| Test Case ID | Title | Role | Priority | Type | Scenario | Cycle 1 |
|---|---|---|---|---|---|---|
| [TC-NOT-001](#tc-not-001-logistics-is-notified-when-a-record-needs-a-driver) | Logistics is notified when a record needs a driver | Logistics | High | Positive | TS-001 | Run |
| [TC-NOT-002](#tc-not-002-record-creator-is-notified-when-a-driver-is-assigned) | Record creator is notified when a driver is assigned | Sales Coordinator | High | Positive | TS-001 | Run |
| [TC-NOT-003](#tc-not-003-mark-one-notification-read) | Mark one notification read | Logistics | Medium | Positive | TS-015 | Run |
| [TC-NOT-004](#tc-not-004-mark-all-notifications-read) | Mark all notifications read | Logistics | Medium | Positive | TS-015 | Run |
| [TC-NOT-005](#tc-not-005-completion-email-is-produced-for-the-account-manager) | Completion email is produced for the Account Manager | Driver | Medium | Positive | TS-001 | Deferred |
| [TC-NOT-006](#tc-not-006-notifications-are-private-to-their-owner) | Notifications are private to their owner | Sales Coordinator | Medium | Access Control | TS-010 | Run |
| [TC-NOT-007](#tc-not-007-only-authorized-roles-can-trigger-outbound-emails) | Only authorized roles can trigger outbound emails | Driver | High | Access Control | TS-010 | Deferred |

## Test cases

### TC-NOT-001: Logistics is notified when a record needs a driver

| Field | Description |
|---|---|
| Test Case ID | TC-NOT-001 |
| Title | Logistics is notified when a record needs a driver |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | R-LOG, WF-1 (records.ts:868-874, 1176-1184) |
| Role | Logistics |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Depends on TC-DEL-002 and TC-DEL-016. |
| Test Data | None beyond preconditions |
| Steps | 1. Click the bell (title "Notifications").<br>2. Find notifications for `UAT-<RUN>-DEL-01` and `UAT-<RUN>-DEL-03`. |
| Expected Result | Each has title "New DELIVERY record — driver needed" and message "<company> · UAT-<RUN>-DEL-0x on <date> requires driver assignment." |
| Actual Result | RUN-20261014-02: Observed the case expected result: Each has title "New DELIVERY record — driver needed" and message "<company> · UAT-<RUN>-DEL-0x on <date> requires driver assignment." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-NOT-001-01-driver-needed.png](../../artifacts/RUN-20261014-02/TC-NOT-001-01-driver-needed.png) |
| Defect ID | RUN-20261014-02: — |
### TC-NOT-002: Record creator is notified when a driver is assigned

| Field | Description |
|---|---|
| Test Case ID | TC-NOT-002 |
| Title | Record creator is notified when a driver is assigned |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | R-SC, WF-1 (records.ts:1061-1074) |
| Role | Sales Coordinator |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-DEL-011. |
| Test Data | None beyond preconditions |
| Steps | 1. Open the bell; find "Driver assigned".<br>2. Click the notification. |
| Expected Result | • Message "John Doe has been assigned to Jollibee Foods Corp. - Quezon City Cluster · UAT-<RUN>-DEL-01."<br>• Clicking opens D-DEL-01 and marks it read. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Message "John Doe has been assigned to Jollibee Foods Corp. - Quezon City Cluster · UAT-<RUN>-DEL-01."; • Clicking opens D-DEL-01 and marks it read. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-NOT-003: Mark one notification read

| Field | Description |
|---|---|
| Test Case ID | TC-NOT-003 |
| Title | Mark one notification read |
| Scenario ID | TS-015 |
| Requirement / Rule Ref | BR-32 (notifications.ts:44-56; NotificationBell.tsx:226) |
| Role | Logistics |
| Priority | Medium |
| Type | Positive |
| Preconditions | Depends on TC-NOT-001. |
| Test Data | None beyond preconditions |
| Steps | 1. Note the unread badge number.<br>2. Click the ✓ button (title "Mark as read") on one unread item. |
| Expected Result | Badge decreases by 1; the item shows as read. |
| Actual Result | RUN-20261014-02: After one notification was marked read, read controls fell from 13 to 12 while the navbar badge remained 9+. |
| Status | RUN-20261014-02: Fail |
| Evidence | RUN-20261014-02: [TC-NOT-003-01-notifications-open.png](../../artifacts/RUN-20261014-02/TC-NOT-003-01-notifications-open.png); [TC-NOT-003-02-one-read.png](../../artifacts/RUN-20261014-02/TC-NOT-003-02-one-read.png) |
| Defect ID | RUN-20261014-02: DEF-031 |
### TC-NOT-004: Mark all notifications read

| Field | Description |
|---|---|
| Test Case ID | TC-NOT-004 |
| Title | Mark all notifications read |
| Scenario ID | TS-015 |
| Requirement / Rule Ref | BR-32 (notifications.ts:36-42) |
| Role | Logistics |
| Priority | Medium |
| Type | Positive |
| Preconditions | Depends on TC-NOT-003. |
| Test Data | None beyond preconditions |
| Steps | 1. Click "All read" (title "Mark all as read").<br>2. Reload the page. |
| Expected Result | No unread badge; "All read" disappears; state persists after reload. |
| Actual Result | RUN-20261014-02: Observed the case expected result: No unread badge; "All read" disappears; state persists after reload. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-NOT-004-01-all-read.png](../../artifacts/RUN-20261014-02/TC-NOT-004-01-all-read.png) |
| Defect ID | RUN-20261014-02: — |
### TC-NOT-005: Completion email is produced for the Account Manager

| Field | Description |
|---|---|
| Test Case ID | TC-NOT-005 |
| Title | Completion email is produced for the Account Manager |
| Scenario ID | TS-001 |
| Requirement / Rule Ref | WF-1, OQ-08 (services/notify.ts:6-35; mailer.ts:92-94) |
| Role | Driver |
| Priority | Medium |
| Type | Positive |
| Preconditions | **DEFERRED in this cycle: the completion email is not required for now; in-app notifications suffice (OQ-08; user decision 2026-10-14). Codex: record Status "Not Run" with this reason and do not execute.** Depends on TC-DRV-004. Access to the terminal running the API (ask the user for its output if Codex did not start it). |
| Test Data | None beyond preconditions |
| Steps | 1. Read the API terminal output around the time of TC-DRV-004. |
| Expected Result | A "[MOCK EMAIL]" block with "To: m.reyes@microgenesis.example", "Subject: Delivery Accomplished — Jollibee Foods Corp. - Quezon City Cluster", "Reference / SAP Number: UAT-<RUN>-DEL-01", "Accomplished By: John Doe". If the terminal is unavailable mark Blocked. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-NOT-006: Notifications are private to their owner

| Field | Description |
|---|---|
| Test Case ID | TC-NOT-006 |
| Title | Notifications are private to their owner |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | BR-32 (notifications.ts:44-50) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Access Control |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). and Signed in as Logistics in its own browser context (session from TC-AUTH-002). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Logistics session, send with the API helper (AGENTS.md §8): `GET /api/notifications`; copy one `id`.<br>2. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `PATCH /api/notifications/<Logistics id>/read` |
| Expected Result | Step 2: 404 "Notification not found". |
| Actual Result | RUN-20261014-02: Observed the case expected result: Step 2: 404 "Notification not found". / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-NOT-007: Only authorized roles can trigger outbound emails

| Field | Description |
|---|---|
| Test Case ID | TC-NOT-007 |
| Title | Only authorized roles can trigger outbound emails |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | SI-09, R-DRV (notifications.ts:100-150) |
| Role | Driver |
| Priority | High |
| Type | Access Control |
| Preconditions | **DEFERRED in this cycle: this environment sends real email through Microsoft Graph, and the user decided to disregard email in this UAT (2026-10-14). Running this case could email real mailboxes. Codex: record Status "Not Run" with this reason and do not execute.** Signed in as Driver in its own browser context (session from TC-AUTH-005). A John Doe run id (D-SEED-DEL). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Driver session, send with the API helper (AGENTS.md §8): `POST /api/notifications/send-email` body `{"recordId":"{D-SEED-DEL.id}","trigger":"UAT Probe","recipients":["LOGISTICS","TASS"]}` |
| Expected Result | 403 (write routes require a role check). Fail (SI-09) if 200 with `resolvedCount` > 0; record `sent`/`resolvedCount` and the mock-email lines in the API terminal. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |