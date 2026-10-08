# User Acceptance Testing (UAT) Plan
## Microgenesis Supply Chain Portal
**Version:** 1.0 · **Date:** 2026-10-06  
**Roles Covered:** Sales Coordinator · Logistics · Driver  
**Environment:** `http://localhost:3000` (Frontend) | `http://localhost:4000` (Backend)

> [!IMPORTANT]
> Before starting, ensure both servers are running: `npm run dev` from the project root.
> The test assumes your database is seeded with at least one user per role (Sales Coordinator, Logistics, Driver).

---

## Pre-Test: Seed Verification
Before running any test case, confirm the database is ready.

| Step | Action | Expected Result |
|------|--------|-----------------|
| P-1 | Set `VITE_SHOW_DEMO_ACCOUNTS=true` in the frontend and `UAT_SEED_ENABLED=true` in the backend staging environment | The login screen shows the demo-account and **Prepare UAT Data** controls |
| P-1.1 | Click **Prepare UAT Data (Accounts + Today’s Driver Run)** | Existing data is reset; demo accounts, companies, and a driver-assigned delivery for today are created |
| P-1.2 | Alternatively run `npm run seed:uat --workspace=mg-portal-server` from root | The same UAT dataset is created from the command line |
| P-2 | Open `http://localhost:3000` in browser | Login page is visible |
| P-3 | Check that you have one user per role: **Sales Coordinator**, **Logistics**, **Driver** | All three accounts are accessible |

---

## Part A — Sales Coordinator

**Login:** Use a Sales Coordinator account.  
**Expected Sidebar Items:** Main, Dashboard, Deliveries, RMA, Accounting Collection, Procurement Pick-up, Customers, Suppliers, AM Directory, Transaction Center, SKU Master.

### A-1 Login & Access Control

| Test ID | Test Case | Steps | Expected Result | Pass / Fail |
|---------|-----------|-------|-----------------|-------------|
| A-1.1 | Login with valid credentials | Enter SC email + password → click Sign In | Dashboard loads; sidebar shows SC-permitted screens only | |
| A-1.2 | Blocked screens not visible | Inspect sidebar | **No** Driver View, Driver Manager, Driver Board, Statistical Reports, Status History, Admin Panel | |
| A-1.3 | Logout and re-login | Click logout → return to login → re-login | Session is cleared; fresh dashboard loads | |
| A-1.4 | Wrong password blocked | Enter wrong password | Error message shown; no login | |

---

### A-2 Create a Delivery Record

> [!NOTE]
> Navigate to **Deliveries** in the sidebar to access this module.

| Test ID | Test Case | Steps | Expected Result | Pass / Fail |
|---------|-----------|-------|-----------------|-------------|
| A-2.1 | Open create form | Click **+ New Record** (or equivalent button) | Create record modal/form opens | |
| A-2.2 | Submit empty form | Click Save without filling anything | Validation errors shown for **Company Name** and **Reference (SAP)** | |
| A-2.3 | Company Name must match existing customer | Type a non-existent company → click Save | Error: "Select a company from the list" | |
| A-2.4 | Create a valid record | Fill in: Company (pick from dropdown), Reference (e.g. `SAP-TEST-001`), Delivery Date (today), Area, Item Type → click Save | Record appears in the list with status **Scheduled** | |
| A-2.5 | Create a Draft record | Toggle **Draft** ON → fill Company only → Save | Record saved with no Reference required; marked as Draft | |
| A-2.6 | Attach POD file on create | In the create form, click upload zone → select a PDF/JPG under 10 MB | File name appears below the drop zone; record saves with attachment | |
| A-2.7 | Reject oversized file | Attempt to attach a file over 10 MB | Error message: size exceeded; file not attached | |
| A-2.8 | Reject unsupported file type | Attempt to attach a `.exe` or `.zip` file | Error message: unsupported format | |

---

### A-3 Edit a Delivery Record

> [!NOTE]
> Click any record in the list to open the **Record Workspace**. Navigate to the **Overview** tab.

| Test ID | Test Case | Steps | Expected Result | Pass / Fail |
|---------|-----------|-------|-----------------|-------------|
| A-3.1 | Edit record details | Click a record → modify Area or Account Manager → click Save | Record updates; Audit Trail logs the change with SC's name | |
| A-3.2 | Remarks required on save | Attempt to save an edit without typing remarks | Error: "Remarks are required when editing a record." | |
| A-3.3 | Dispatch & Logistics tab is hidden | Open any record workspace | **Dispatch & Logistics** tab is **not visible** for SC role | |
| A-3.4 | Cannot change driver fields | Inspect workspace tabs | No driver, vehicle, or dispatch fields are accessible to SC | |
| A-3.5 | Leave a comment | Go to **Comments** tab → type a comment → submit | Comment appears with SC's name and timestamp | |
| A-3.6 | View Audit Trail | Go to **Audit Trail** tab | All previous changes are listed with who made them and when | |

---

### A-4 Customer Management

> [!NOTE]
> Navigate to **Customers** in the sidebar.

| Test ID | Test Case | Steps | Expected Result | Pass / Fail |
|---------|-----------|-------|-----------------|-------------|
| A-4.1 | View customer list | Navigate to Customers page | List of existing customers is displayed | |
| A-4.2 | Create a new customer | Click **+ Add Customer** → fill in Name + other required fields → Save | Customer appears in the list | |
| A-4.3 | Customer workspace has no record history | Click a customer name → review the workspace tabs | Only Overview, Documents & Attachments and (Admin) Audit Trail are shown. There is no Record History tab, because Customers are not linked to delivery records | |
| A-4.4 | Company delivery history shows linked records | Open any record → click the company name in the record summary | A Company history panel lists that Company's records you can access, newest first. Clicking a row opens it in its own module. A Customer with the same name as the Company is not included. As TASS, only RMA and Accounting Collection records appear | |
| A-4.5 | Edit an existing customer | As SC, Logistics or Admin: open a customer → **Edit customer** → change a field → enter a Reason for change → **Save changes** (bottom right) | The new value is shown, "Changes saved" appears, and the Audit Trail tab lists your name, the reason, and the before/after values | |
| A-4.6 | Customer edit validation | In the edit form, clear the name, enter an invalid email, leave the reason empty → **Save changes** | Each problem is shown under its field and nothing is saved. Your other entries stay in the form. Leaving with unsaved edits asks you to confirm | |
| A-4.7 | Unauthorized customer edit | Sign in as TASS or Driver | There is no Edit option, and a direct `PUT /api/customers/:id` request is rejected with 403 | |

---

### A-5 Transaction Center

> [!NOTE]
> Navigate to **Transaction Center** in the sidebar.

| Test ID | Test Case | Steps | Expected Result | Pass / Fail |
|---------|-----------|-------|-----------------|-------------|
| A-5.1 | Page loads correctly | Click Transaction Center | The page renders fully without a blank screen | |
| A-5.2 | Records are visible | Confirm delivery records created in A-2 appear | Record list is populated | |

---

## Part B — Logistics

**Login:** Log out of SC account. Log in with a Logistics account.  
**Expected Sidebar Items:** Everything SC has, **plus** Driver View, Driver Manager, Delivery Calendar, Driver Board, Status History, Statistical Reports.

### B-1 Login & Access Control

| Test ID | Test Case | Steps | Expected Result | Pass / Fail |
|---------|-----------|-------|-----------------|-------------|
| B-1.1 | Login as Logistics | Enter Logistics email + password → Sign In | Dashboard loads with expanded sidebar (Driver View, Driver Manager, etc.) | |
| B-1.2 | RMA module shows as "TASS" | Look at sidebar label for the RMA item | Label reads **"TASS"** for Logistics users (confirmed from source code) | |
| B-1.3 | Admin Panel is NOT visible | Inspect sidebar | No Admin Panel link is shown for Logistics | |
| B-1.4 | RMA records are read-only | Open the TASS/RMA module → try to edit a record | Blocked with error: "Logistics has view-only access to RMA/TASS records" | |

---

### B-2 Dispatch & Assign Driver

> [!NOTE]
> Open any delivery record (Deliveries module) and navigate to the **Dispatch & Logistics** tab.

| Test ID | Test Case | Steps | Expected Result | Pass / Fail |
|---------|-----------|-------|-----------------|-------------|
| B-2.1 | Dispatch tab is visible | Open a record workspace | **Dispatch & Logistics** tab is visible for Logistics role | |
| B-2.2 | Assign a driver | Select a driver from the Primary Driver dropdown → enter remarks → click Save Driver Fields | Driver name saved on record; Audit Trail logs the change | |
| B-2.3 | Remarks required for driver assignment | Try to save driver assignment with no remarks | Error: "Remarks are required when editing a record." | |
| B-2.4 | Add driver assistants | Type assistant names in the assistants field → Save with remarks | Assistants are saved and appear on the record | |
| B-2.5 | Change Status | Select a different status (e.g. On-Hold) → enter remarks → click Confirm Status | Status updates on the record; badge color changes | |
| B-2.6 | Cannot set same status twice | Set status to Pending → immediately try to set to Pending again | Error: "Choose a different status before saving." | |
| B-2.7 | Log Time In/Out manually | Enter a time in the Time In field → Save with remarks | Time In is saved on the record | |
| B-2.8 | Set Priority | Change Priority to "3 - High" → Save with remarks | Priority badge changes on the record | |

| Test ID | Test Case | Steps | Expected Result | Pass / Fail |
|---------|-----------|-------|-----------------|-------------|
| B-2.9 | Reschedule an assigned Delivery | In the existing General/Overview edit flow, change Delivery Date and enter remarks | Save preserves the Driver assignment; Audit Trail records actor, time and old/new dates. After refresh, the assigned Driver sees actionability recalculated from the saved date without reassignment | |

---

### B-3 Driver Board & Calendar

| Test ID | Test Case | Steps | Expected Result | Pass / Fail |
|---------|-----------|-------|-----------------|-------------|
| B-3.1 | Driver Board loads | Navigate to Driver Board in sidebar | Board view shows drivers with their assigned records for today | |
| B-3.2 | Calendar loads | Navigate to Delivery Calendar | Calendar view shows delivery records plotted on correct dates | |
| B-3.3 | Driver Manager | Navigate to Driver Manager → click Add Driver | Can create a new driver profile | |

---

### B-4 Documents Tab (POD Upload by Logistics)

> [!NOTE]
> Open a delivery record → navigate to **Documents** tab.

| Test ID | Test Case | Steps | Expected Result | Pass / Fail |
|---------|-----------|-------|-----------------|-------------|
| B-4.1 | Documents tab visible | Open any record workspace → click Documents tab | Drag-and-drop upload zone is visible: "Drop files here or click to upload" | |
| B-4.2 | Upload a file | Click the upload zone → select a PDF → wait for upload | File appears in the list below the drop zone with file name, size, and timestamp | |
| B-4.3 | Multiple files | Upload 2 files at once | Both files appear in the list | |
| B-4.4 | File count shows | Check the documents list header | Header shows correct count e.g. "2 files" | |
| B-4.5 | Remove a file | Click the delete button next to an uploaded file | File is removed from the list immediately | |

---

### B-5 Statistical Reports & Status History

| Test ID | Test Case | Steps | Expected Result | Pass / Fail |
|---------|-----------|-------|-----------------|-------------|
| B-5.1 | Statistical Reports loads | Navigate to Statistical Reports | Reports page renders without error | |
| B-5.2 | Status History loads | Navigate to Status History | Table of historical status changes is displayed | |

---

## Part C — Driver

**Login:** Log out of Logistics account. Log in with a Driver account.  
**Expected View:** Driver is sent directly to the **Field Mobile Dashboard** — there is no sidebar, no desktop workspace. It is a mobile-optimized fullscreen view.

> [!IMPORTANT]
> The Driver sees only assigned, non-draft records permitted by server-side ownership checks. For Deliveries, the latest saved Delivery Date is authoritative: today's and overdue runs are actionable, while future unstarted runs remain visible with details but read-only. Eligibility and overdue days use Asia/Manila. A run with Time In already recorded remains actionable if Logistics later moves its Delivery Date into the future. If no run is ready for execution today, the dashboard says "No runs ready for execution today." Make sure Logistics has assigned the Driver a submitted Delivery (Part B-2 above) before testing.

---

### C-1 Login & Dashboard

| Test ID | Test Case | Steps | Expected Result | Pass / Fail |
|---------|-----------|-------|-----------------|-------------|
| C-1.1 | Driver login | Enter Driver email + password → Sign In | Driver lands on **Microgenesis Field Mobile** dashboard — no sidebar visible | |
| C-1.2 | Correct stats shown | Check the 3 stats at the top | Shows "Today's Runs", "Accomplished", "Remaining" with correct counts | |
| C-1.3 | Assigned record appears | Verify the record assigned by Logistics in B-2 is listed under active runs | Record card shows company name, area, and reference number | |
| C-1.4 | Non-assigned record not visible | Ensure records belonging to other drivers are not shown | Only this driver's records are displayed | |
| C-1.5 | Logout | Click the Log Out button | Driver is returned to the login page | |

---

| Test ID | Test Case | Steps | Expected Result | Pass / Fail |
|---------|-----------|-------|-----------------|-------------|
| C-1.6 | Overdue Delivery is actionable | Give the assigned Driver an unstarted Delivery with a Delivery Date before today in Asia/Manila | The run appears with an overdue/days-late marker and the normal Time In, POD and lifecycle actions | |
| C-1.7 | Future Delivery is read-only | Give the assigned Driver an unstarted Delivery dated after today in Asia/Manila | The run and its details remain visible, with no execution or upload controls | |

### C-2 ePOD Flow (Full Workflow)

> [!NOTE]
> This tests the complete electronic Proof of Delivery workflow in the correct sequential order.

| Test ID | Test Case | Steps | Expected Result | Pass / Fail |
|---------|-----------|-------|-----------------|-------------|
| C-2.1 | Record Time In | Click **Record Time In** button on an active record card | Button disappears; replaced by a blue confirmation banner showing the recorded time | |
| C-2.2 | POD upload section is visible | Open an active delivery card, before or after Time In | A **"Proof of Delivery (photo required)"** section with an **Upload Photo / Document** button is visible | |
| C-2.3 | Upload a supporting document | Click **Upload Photo / Document** → select a PDF or DOC file | File name appears below the button; upload completes, but it does **not** satisfy the photo requirement | |
| C-2.4 | Upload a valid delivery photo | Select a real JPG or PNG image and wait for the saved confirmation | The photo appears as saved/verified; **Accomplish** becomes eligible once the other requirements are met | |
| C-2.5 | PDF/DOC alone cannot accomplish | With only PDF/DOC attachments saved, attempt to open or submit Accomplish | Accomplish remains disabled or the backend rejects completion with the photo-required message | |
| C-2.6 | POD upload rejected if wrong type | Select a non-JPG/PNG/PDF/DOC file | Error message shown; file is not uploaded | |
| C-2.7 | Fill Received By | Type a name in the **Received By** field | Text input accepts and stores the name for submission | |
| C-2.8 | Mark as Accomplished | After a saved JPG/PNG exists, click green **Accomplish** → enter remarks → click Confirm | Record moves to the **Accomplished** section; stats update | |
| C-2.9 | Mark as Pending | On a different active record, click amber **Pending** → enter remarks → Confirm | Record stays visible but status changes to Pending; no delivery photo is required | |
| C-2.10 | Mark as Rescheduled | Click purple **Reschedule** → enter remarks → Confirm | Record is marked Rescheduled; no delivery photo is required | |
| C-2.11 | Remarks are required | With a saved JPG/PNG, click **Accomplish** → click Confirm without entering remarks | Confirm button is **disabled**; cannot submit | |
| C-2.12 | Cannot complete through the API without a photo | Send a direct `PATCH /api/records/:id/status` request with `status=Delivered` and remarks but no saved photo | Backend returns **400** with the photo-required message; record remains unchanged | |
| C-2.13 | Cannot update other driver's record | Attempt to upload or complete a record belonging to another driver via URL/API manipulation | Backend returns **403**; assigned-driver access is enforced | |

---

| Test ID | Test Case | Steps | Expected Result | Pass / Fail |
|---------|-----------|-------|-----------------|-------------|
| C-2.14 | Future Delivery rejects direct writes | As the assigned Driver, call Time In, status, POD upload, record edit or comment endpoints for an unstarted future Delivery | The server rejects each write until its saved Delivery Date is today or overdue | |
| C-2.15 | Overdue completion is recorded | Complete an overdue Delivery through the normal flow, then inspect the record and Audit Trail | `completed_late` and `days_late` are persisted; overdue actions include the overdue marker and days late in the audit snapshot | |

### C-3 Accomplished Records View

| Test ID | Test Case | Steps | Expected Result | Pass / Fail |
|---------|-----------|-------|-----------------|-------------|
| C-3.1 | Accomplished section visible | After completing C-2.8, scroll to bottom of dashboard | An "Accomplished" divider section appears with completed record cards | |
| C-3.2 | Time In/Out shown on done cards | Check the accomplished record card | Time In and Time Out timestamps are displayed | |
| C-3.3 | Received By shown on done cards | Check accomplished record | The name entered in C-2.7 is displayed next to a checkmark icon | |

---

## Cross-Role Integration Test

This test verifies that Logistics can see the Driver's field updates in real-time.

| Test ID | Test Case | Steps | Expected Result | Pass / Fail |
|---------|-----------|-------|-----------------|-------------|
| X-1 | Driver records update visible to Logistics | Log in as Driver → Accomplish a record → Log out → Log in as Logistics → Open same record | Status shows **Delivered**, Time In/Out populated, Received By name shown, POD attachments visible in Documents tab | |
| X-2 | Audit trail shows Driver activity | As Logistics, open the Accomplished record → Audit Trail tab | The driver's status change and time entries are logged with the driver's name | |

> **Delivery completion rule:** A Delivery can be marked **Accomplished** only when at least one successfully saved, byte-validated JPG or PNG proof-of-delivery photo exists and remarks are provided. PDF/DOC files are optional supporting documents and do not satisfy the photo requirement. The backend enforces this rule independently of the frontend.

---

## Sign-Off

| Role | Tester Name | Date | Result |
|------|-------------|------|--------|
| Sales Coordinator | | | ☐ Pass ☐ Fail |
| Logistics | | | ☐ Pass ☐ Fail |
| Driver | | | ☐ Pass ☐ Fail |

**Overall UAT Outcome:** ☐ Approved for release  ☐ Requires fixes before release

**Notes / Defects Found:**
> _Write any failed test IDs and observations here._
