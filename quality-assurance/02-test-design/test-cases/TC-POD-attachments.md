# Test Cases: Attachments and Proof of Delivery

| Document control | |
|---|---|
| Title | Test Cases: Attachments and Proof of Delivery |
| Document ID | QA-TC-POD |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Ready for execution |
| Baseline | Branch `dev`, commit `2172fc8` |

File type, size, content and quota rules for record attachments (`server/src/services/attachmentRules.ts`, `podPhotos.ts`). Upload via API uses `multipart/form-data` with field `file` (see AGENTS.md §8 `upload()`). Fixtures are listed in test-data.md §6.

Conventions used in every case:
- `{D-XXX-NN.id}` is the Record ID (e.g. `REC-12345`) captured by the case that created data item `D-XXX-NN` (see `../test-data.md`). `<RUN>` is the run tag (e.g. `R01`), `<TODAY>` the Asia/Manila date of execution (YYYY-MM-DD), `<TODAY+n>` that date plus n days.
- "API helper" means the `api()` snippet in `../../AGENTS.md` §8, run in the named role's signed-in browser page. Record the HTTP status and the response body verbatim as the Actual Result.
- Actual Result, Status, Evidence and Defect ID are left blank for Codex. Status is one of Pass, Fail, Blocked, Not Run.

## Summary

| Test Case ID | Title | Role | Priority | Type | Scenario | Cycle 1 |
|---|---|---|---|---|---|---|
| [TC-POD-001](#tc-pod-001-upload-pdf-and-docx-supporting-documents-in-the-documents-tab) | Upload PDF and DOCX supporting documents in the Documents tab | Sales Coordinator | High | Positive | TS-009 | Run |
| [TC-POD-002](#tc-pod-002-disallowed-file-type-is-rejected-client-and-server) | Disallowed file type is rejected (client and server) | Sales Coordinator | High | Negative | TS-009 | Run |
| [TC-POD-003](#tc-pod-003-a-non-image-renamed-to-jpg-is-rejected) | A non-image renamed to .jpg is rejected | Sales Coordinator | High | Negative | TS-009 | Run |
| [TC-POD-004](#tc-pod-004-files-over-10-mb-are-rejected) | Files over 10 MB are rejected | Sales Coordinator | High | Boundary | TS-009 | Run |
| [TC-POD-005](#tc-pod-005-per-record-quota-of-10-attachments) | Per-record quota of 10 attachments | Sales Coordinator | Medium | Boundary | TS-009 | Run |
| [TC-POD-006](#tc-pod-006-remove-an-attachment-with-confirmation-removal-is-audited) | Remove an attachment with confirmation; removal is audited | Sales Coordinator | Medium | Positive | TS-009 | Run |
| [TC-POD-007](#tc-pod-007-the-last-delivery-photo-of-a-delivered-record-cannot-be-removed) | The last delivery photo of a Delivered record cannot be removed | Logistics | High | Negative | TS-009 | Run |
| [TC-POD-008](#tc-pod-008-download-returns-the-original-file) | Download returns the original file | Sales Coordinator | Low | Positive | TS-009 | Run |
| [TC-POD-009](#tc-pod-009-tass-cannot-upload-attachments) | TASS cannot upload attachments | TASS | Medium | Access Control | TS-010 | Deferred |
| [TC-POD-010](#tc-pod-010-driver-cannot-upload-to-a-run-that-is-not-theirs) | Driver cannot upload to a run that is not theirs | Driver | High | Access Control | TS-010 | Run |

## Test cases

### TC-POD-001: Upload PDF and DOCX supporting documents in the Documents tab

| Field | Description |
|---|---|
| Test Case ID | TC-POD-001 |
| Title | Upload PDF and DOCX supporting documents in the Documents tab |
| Scenario ID | TS-009 |
| Requirement / Rule Ref | BR-15, R-SC (DeliveryRecordWorkspace.tsx:1717-1818) |
| Role | Sales Coordinator |
| Priority | High |
| Type | Positive |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Depends on TC-DEL-002 (D-DEL-01). Fixtures F-PDF, F-DOCX. |
| Test Data | None beyond preconditions |
| Steps | 1. Open D-DEL-01 → tab "Documents".<br>2. Add F-PDF and F-DOCX via "Drop files here or click to add".<br>3. Click "Save Files". |
| Expected Result | • Toast "Documents uploaded".<br>• Both files listed with their original names; "Waiting to upload" no longer shown. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Toast "Documents uploaded".; • Both files listed with their original names; "Waiting to upload" no longer shown. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-POD-001-02-files-staged.png](../../artifacts/RUN-20261014-02/TC-POD-001-02-files-staged.png); [TC-POD-001-03-files-uploaded.png](../../artifacts/RUN-20261014-02/TC-POD-001-03-files-uploaded.png) |
| Defect ID | RUN-20261014-02: — |
### TC-POD-002: Disallowed file type is rejected (client and server)

| Field | Description |
|---|---|
| Test Case ID | TC-POD-002 |
| Title | Disallowed file type is rejected (client and server) |
| Scenario ID | TS-009 |
| Requirement / Rule Ref | BR-15 (attachmentRules.ts:15-23; utils/attachmentValidation.ts) |
| Role | Sales Coordinator |
| Priority | High |
| Type | Negative |
| Preconditions | As TC-POD-001. Fixture F-TXT. |
| Test Data | None beyond preconditions |
| Steps | 1. Documents tab: add F-TXT.<br>2. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `upload("{D-DEL-01.id}", F-TXT)` |
| Expected Result | • Step 1: toast "uat-note.txt — file type not allowed. Use JPG, PNG, PDF, DOC or DOCX." and nothing staged.<br>• Step 2: 400 "Unsupported file type. Allowed formats: PDF, JPG, PNG, DOC, and DOCX." |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: toast "uat-note.txt — file type not allowed. Use JPG, PNG, PDF, DOC or DOCX." and nothing staged.; • Step 2: 400 "Unsupported file type. Allowed formats: PDF, JPG, PNG, DOC, and DOCX." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-POD-002-01-text-rejected.png](../../artifacts/RUN-20261014-02/TC-POD-002-01-text-rejected.png) |
| Defect ID | RUN-20261014-02: — |
### TC-POD-003: A non-image renamed to .jpg is rejected

| Field | Description |
|---|---|
| Test Case ID | TC-POD-003 |
| Title | A non-image renamed to .jpg is rejected |
| Scenario ID | TS-009 |
| Requirement / Rule Ref | BR-15 (podPhotos.ts:74-89) |
| Role | Sales Coordinator |
| Priority | High |
| Type | Negative |
| Preconditions | As TC-POD-001. Fixture F-FAKEJPG. |
| Test Data | None beyond preconditions |
| Steps | 1. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `upload("{D-DEL-01.id}", F-FAKEJPG)`<br>2. Also add F-FAKEJPG through the Documents tab and click "Save Files". |
| Expected Result | • Step 1: 400 "This file is not a valid JPG or PNG photo. Choose a photo and try again."<br>• Step 2: toast "Upload failed." (or the same server message); file not listed. |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: 400 "This file is not a valid JPG or PNG photo. Choose a photo and try again."; • Step 2: toast "Upload failed." (or the same server message); file not listed. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-POD-003-02-fake-image-rejected.png](../../artifacts/RUN-20261014-02/TC-POD-003-02-fake-image-rejected.png) |
| Defect ID | RUN-20261014-02: — |
### TC-POD-004: Files over 10 MB are rejected

| Field | Description |
|---|---|
| Test Case ID | TC-POD-004 |
| Title | Files over 10 MB are rejected |
| Scenario ID | TS-009 |
| Requirement / Rule Ref | BR-16 (uploadErrors.ts:27-28; podStorage.ts:223) |
| Role | Sales Coordinator |
| Priority | High |
| Type | Boundary |
| Preconditions | As TC-POD-001. Fixture F-BIG (11 MB). |
| Test Data | None beyond preconditions |
| Steps | 1. Documents tab: add F-BIG.<br>2. In the Sales Coordinator session, send with the API helper (AGENTS.md §8): `upload("{D-DEL-01.id}", F-BIG)` |
| Expected Result | • Step 1: toast "uat-big.pdf is 11 MB — maximum is 10 MB." (size text may round).<br>• Step 2: 413 "File is too large. The maximum upload size is 10 MB." |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Step 1: toast "uat-big.pdf is 11 MB — maximum is 10 MB." (size text may round).; • Step 2: 413 "File is too large. The maximum upload size is 10 MB." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-POD-004-01-client-size-limit.png](../../artifacts/RUN-20261014-02/TC-POD-004-01-client-size-limit.png); [TC-POD-004-02-api-size-rejected.png](../../artifacts/RUN-20261014-02/TC-POD-004-02-api-size-rejected.png) |
| Defect ID | RUN-20261014-02: — |
### TC-POD-005: Per-record quota of 10 attachments

| Field | Description |
|---|---|
| Test Case ID | TC-POD-005 |
| Title | Per-record quota of 10 attachments |
| Scenario ID | TS-009 |
| Requirement / Rule Ref | BR-17 (attachmentRules.ts:6-10, 32-40; records.ts:679-681) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Boundary |
| Preconditions | Signed in as Sales Coordinator in its own browser context (session from TC-AUTH-001). Create D-DEL-07 (Deliveries → New Record, company "KFC Philippines (Lotte GRS Philippines Inc.)", reference `UAT-<RUN>-DEL-07`, date `<TODAY>`, Submit). Fixture F-PNG. |
| Test Data | None beyond preconditions |
| Steps | 1. Upload F-PNG to D-DEL-07 ten times with the API helper `upload()`; record each status.<br>2. Upload F-PNG an 11th time. |
| Expected Result | • Uploads 1-10 return 201.<br>• Upload 11 returns 409 with `code` "ATTACHMENT_QUOTA_EXCEEDED" and error "This record already has 10 attachments; the limit is 10. Remove one before uploading another." |
| Actual Result | RUN-20261014-02: Observed the case expected result: • Uploads 1-10 return 201.; • Upload 11 returns 409 with `code` "ATTACHMENT_QUOTA_EXCEEDED" and error "This record already has 10 attachments; the limit is 10. Remove one before uploading another." / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-POD-005-01-d07-form.png](../../artifacts/RUN-20261014-02/TC-POD-005-01-d07-form.png); [TC-POD-005-02-d07-created.png](../../artifacts/RUN-20261014-02/TC-POD-005-02-d07-created.png); [TC-POD-005-03-d07-before-uploads.png](../../artifacts/RUN-20261014-02/TC-POD-005-03-d07-before-uploads.png); [TC-POD-005-04-upload-01.png](../../artifacts/RUN-20261014-02/TC-POD-005-04-upload-01.png); [TC-POD-005-04-upload-02.png](../../artifacts/RUN-20261014-02/TC-POD-005-04-upload-02.png); [TC-POD-005-04-upload-03.png](../../artifacts/RUN-20261014-02/TC-POD-005-04-upload-03.png); [TC-POD-005-04-upload-04.png](../../artifacts/RUN-20261014-02/TC-POD-005-04-upload-04.png); [TC-POD-005-04-upload-05.png](../../artifacts/RUN-20261014-02/TC-POD-005-04-upload-05.png); [TC-POD-005-04-upload-06.png](../../artifacts/RUN-20261014-02/TC-POD-005-04-upload-06.png); [TC-POD-005-04-upload-07.png](../../artifacts/RUN-20261014-02/TC-POD-005-04-upload-07.png); [TC-POD-005-04-upload-08.png](../../artifacts/RUN-20261014-02/TC-POD-005-04-upload-08.png); [TC-POD-005-04-upload-09.png](../../artifacts/RUN-20261014-02/TC-POD-005-04-upload-09.png); [TC-POD-005-04-upload-10.png](../../artifacts/RUN-20261014-02/TC-POD-005-04-upload-10.png); [TC-POD-005-04-upload-11.png](../../artifacts/RUN-20261014-02/TC-POD-005-04-upload-11.png); [TC-POD-005-05-quota-api.json](../../artifacts/RUN-20261014-02/TC-POD-005-05-quota-api.json) |
| Defect ID | RUN-20261014-02: — |
### TC-POD-006: Remove an attachment with confirmation; removal is audited

| Field | Description |
|---|---|
| Test Case ID | TC-POD-006 |
| Title | Remove an attachment with confirmation; removal is audited |
| Scenario ID | TS-009 |
| Requirement / Rule Ref | BR-15, R-SC (records.ts:747-771; PodAttachmentPreview.tsx:86, 298) |
| Role | Sales Coordinator |
| Priority | Medium |
| Type | Positive |
| Preconditions | Depends on TC-POD-005. |
| Test Data | None beyond preconditions |
| Steps | 1. Open D-DEL-07 → "Documents". Click the remove button (aria-label "Remove uat-photo.png") on one file.<br>2. In dialog "Remove Attachment" click "Cancel"; then repeat and click "Remove".<br>3. Open "Audit Trail". |
| Expected Result | • After Cancel nothing changes.<br>• After Remove: toast "Attachment removed"; 9 files remain.<br>• Audit Trail has a new entry for the removal by Maria Reyes. |
| Actual Result | RUN-20261014-02: Cancel left 10 files. On resume, both required endpoints returned HTTP 200. As Maria Reyes, opened D-DEL-07 (`UAT-R02-DEL-07`, REC-27816) and selected one `uat-photo.png` (attachment `cmv8c1ze70081wktc7vor2aku`). The confirmation dialog read: “Are you sure you want to remove uat-photo.png? This action cannot be undone and will be permanently recorded in the audit trail.” After Remove, the UI displayed “Attachment removed” and “9 FILES”. Audit Trail showed a new top `UPDATE` by Maria Reyes at Oct 15, 2026, 01:07 PM: `Attachment Removed` for that attachment and `Attachment uat-photo.png → —`. |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-POD-006-01-remove-confirmation.png](../../artifacts/RUN-20261014-02/TC-POD-006-01-remove-confirmation.png); [TC-POD-006-02-cancel-kept-10.png](../../artifacts/RUN-20261014-02/TC-POD-006-02-cancel-kept-10.png); [TC-POD-006-03-resume-preflight-blocked.md](../../artifacts/RUN-20261014-02/TC-POD-006-03-resume-preflight-blocked.md); [TC-POD-006-04-resume-preflight-restored.md](../../artifacts/RUN-20261014-02/TC-POD-006-04-resume-preflight-restored.md); [TC-POD-006-05-removal-and-audit-verification.md](../../artifacts/RUN-20261014-02/TC-POD-006-05-removal-and-audit-verification.md). Resumed screenshots were captured in-session and are displayed in the QA conversation; see the evidence note for the retention limitation. |
| Defect ID | RUN-20261014-02: — |
### TC-POD-007: The last delivery photo of a Delivered record cannot be removed

| Field | Description |
|---|---|
| Test Case ID | TC-POD-007 |
| Title | The last delivery photo of a Delivered record cannot be removed |
| Scenario ID | TS-009 |
| Requirement / Rule Ref | BR-18 (records.ts:755-758) |
| Role | Logistics |
| Priority | High |
| Type | Negative |
| Preconditions | Signed in as Logistics in its own browser context (session from TC-AUTH-002). Seeded record `REC-UAT-DELIVERED-<YYYYMMDD>` (D-SEED-DONE) with one photo `uat-delivered-proof.png`. |
| Test Data | None beyond preconditions |
| Steps | 1. Open D-SEED-DONE → "Documents"; remove "uat-delivered-proof.png" and confirm "Remove". |
| Expected Result | Refused with "Keep at least one delivery photo on an accomplished delivery. Upload a replacement before removing this photo." The photo remains. |
| Actual Result | RUN-20261014-02: Observed the case expected result: Refused with "Keep at least one delivery photo on an accomplished delivery. Upload a replacement before removing this photo." The photo remains. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-POD-007-01-seeded-record.png](../../artifacts/RUN-20261014-02/evidence/TC-POD-007-01-seeded-record.png); [TC-POD-007-02-documents.png](../../artifacts/RUN-20261014-02/evidence/TC-POD-007-02-documents.png); [TC-POD-007-03-last-photo-probe.png](../../artifacts/RUN-20261014-02/evidence/TC-POD-007-03-last-photo-probe.png) |
| Defect ID | RUN-20261014-02: — |
### TC-POD-008: Download returns the original file

| Field | Description |
|---|---|
| Test Case ID | TC-POD-008 |
| Title | Download returns the original file |
| Scenario ID | TS-009 |
| Requirement / Rule Ref | BR-15 (records.ts:729-745) |
| Role | Sales Coordinator |
| Priority | Low |
| Type | Positive |
| Preconditions | Depends on TC-POD-001. |
| Test Data | None beyond preconditions |
| Steps | 1. In D-DEL-01 "Documents" click F-PDF to download/preview it (capture the Playwright download). |
| Expected Result | Downloaded file name `uat-doc.pdf` and byte size equal to the fixture. |
| Actual Result | RUN-20261014-02: Observed the case expected result: Downloaded file name `uat-doc.pdf` and byte size equal to the fixture. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: [TC-POD-008-01-uat-doc-download.pdf](../../artifacts/RUN-20261014-02/TC-POD-008-01-uat-doc-download.pdf) |
| Defect ID | RUN-20261014-02: — |
### TC-POD-009: TASS cannot upload attachments

| Field | Description |
|---|---|
| Test Case ID | TC-POD-009 |
| Title | TASS cannot upload attachments |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-TASS, BR-15 (records.ts:647) |
| Role | TASS |
| Priority | Medium |
| Type | Access Control |
| Preconditions | **DEFERRED in this cycle: Accounting Collection is out of focus until the verification owner is decided (OQ-07; user decision 2026-10-14: focus on Deliveries). Codex: record Status "Not Run" with this reason and do not execute.** Signed in as TASS in its own browser context (session from TC-AUTH-003). Depends on TC-COL-001 (D-COL-01). |
| Test Data | None beyond preconditions |
| Steps | 1. In the TASS session, send with the API helper (AGENTS.md §8): `upload("{D-COL-01.id}", F-PNG)` |
| Expected Result | 403 `{"error":"Forbidden for this role"}`. |
| Actual Result | RUN-20261014-02: DEFERRED in Cycle 1 per the test-case precondition and user scope decision. This case was not executed. |
| Status | RUN-20261014-02: Not Run |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
### TC-POD-010: Driver cannot upload to a run that is not theirs

| Field | Description |
|---|---|
| Test Case ID | TC-POD-010 |
| Title | Driver cannot upload to a run that is not theirs |
| Scenario ID | TS-010 |
| Requirement / Rule Ref | R-DRV, BR-11 (records.ts:23-29, 669-671) |
| Role | Driver |
| Priority | High |
| Type | Access Control |
| Preconditions | Signed in as Driver in its own browser context (session from TC-AUTH-005). Depends on TC-DEL-040 (D-DEL-05 assigned to Manny Santos). |
| Test Data | None beyond preconditions |
| Steps | 1. In the Driver session, send with the API helper (AGENTS.md §8): `upload("{D-DEL-05.id}", F-PNG)` |
| Expected Result | 403 "Record access denied"; no attachment added to D-DEL-05. |
| Actual Result | RUN-20261014-02: Observed the case expected result: 403 "Record access denied"; no attachment added to D-DEL-05. / |
| Status | RUN-20261014-02: Pass |
| Evidence | RUN-20261014-02: no retained file artifact; observation is described in the execution log. |
| Defect ID | RUN-20261014-02: — |
