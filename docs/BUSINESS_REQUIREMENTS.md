# Business System Requirements: Microgenesis Supply Chain Portal

> Last full-document verification: 2026-11-11 against commit `1e2b900` (`dev`).
> Status tags: **Implemented** (verified in code), **Partial** (works with a stated gap), **Planned** (not built), **Open question** (needs a stakeholder decision).
> Companion documents: [User Operating Manuals](./USER_MANUALS.md), [Features Inventory](./FEATURES_INVENTORY.md), [Admin Master Data](./ADMIN_MASTER_DATA.md), [Performance Audit](./PERFORMANCE_IMPROVEMENT_AUDIT_2026-11-11.md).
> Updated (2026-11-11): Master Data directories (Companies and Account Managers) are fully Admin-managed with unique normalization; Supplier multi-category catalog and atomic audit events are implemented.

## 1. Purpose and scope

Microgenesis coordinates deliveries, returns (RMA), collections, pick-ups and sales orders across several teams. The portal replaces SharePoint trackers with one record store, role-based access, an audit trail and field proof of delivery.

In scope: operational records, driver dispatch and field execution, directories (Companies, Customers, Suppliers, Drivers, Account Managers), SKU master and stock ledger, dashboards and reports, notifications, administration.
Out of scope today: automatic stock movement from deliveries, customer signature capture, offline driver mode, a finance/accounting role (see section 9).

## 2. Actors

| Actor | Role code | Purpose |
| :--- | :--- | :--- |
| Sales Coordinator | `SALES_COORDINATOR` | Creates and maintains Deliveries, Procurement Pick-ups, Sales Orders; manages customers and companies. Cannot assign drivers |
| Logistics | `LOGISTICS` | Dispatches: assigns driver, vehicle and assistants, runs the calendar and driver board, manages the driver directory. View-only on RMA |
| TASS | `TASS` | Works RMA and Accounting Collection records and verifies collections. Role scope is provisional (section 9) |
| Admin | `ADMIN` | Full access, accounts and module access, audit log, integrations, SKU Master, Data Sampler |
| Driver | `DRIVER` | Executes assigned runs on a mobile dashboard: Time In, proof photo, status, comments |

## 3. Functional requirements

### 3.1 Operational records (Deliveries, RMA, Accounting Collection, Procurement Pick-up, Sales Orders)

| ID | Requirement | Status | Roles / notes |
| :--- | :--- | :--- | :--- |
| BR-REC-01 | One record model with five categories; each category has its own module and sidebar entry | Implemented | Single `DeliveryRecord` table |
| BR-REC-02 | Create a record against a validated Company with an SAP/reference number; Draft records may omit the reference | Implemented | Create: Sales Coordinator, Logistics, Admin. Logistics cannot create RMA |
| BR-REC-03 | Drafts are hidden from Drivers and must be submitted; submitting a non-draft record notifies Logistics that a driver is needed | Implemented | Submit an existing Draft: Sales Coordinator/Admin only (OQ-06). Return to Draft: Sales Coordinator/Admin, only before Time In |
| BR-REC-04 | Editing a record requires remarks; every change is written to the audit trail and the append-only remark history | Implemented | Edit: SC, Logistics, Admin, Driver (own runs), TASS (RMA only) |
| BR-REC-05 | Delivery date is required for deliveries and validated; overdue days are computed against Asia/Manila time | Implemented | |
| BR-REC-06 | Multiple line items (SKU and quantity) per record | Partial | `LineItem` stores SKU text and quantity; no link to the SKU Master, no serial numbers |
| BR-REC-07 | Refuse record deletion for every role, including soft deletion | Implemented | User decision OQ-03; preserve existing records and history |
| BR-REC-08 | Comments on a record visible in its timeline | Implemented | All roles with access to the record |
| BR-REC-09 | Link a collection record to related deliveries | Implemented | `linkedCollectionId` |
| BR-REC-10 | Priority (1 Low, 2 Moderate, 3 High) editable from the Overview tab | Implemented | Sales Coordinator, Logistics |
| BR-REC-11 | Company history panel listing the company's accessible records | Implemented | Respects role/category limits (TASS sees RMA and Accounting Collection only) |
| BR-REC-12 | Stage document uploads and save with the record; save feedback and "unchanged status" explanations | Implemented | Sonner toasts, unified save actions |
| BR-REC-13 | Every record has a short, unique record number users can read, search and quote (e.g. DEL-26-00042) | Implemented | Assigned by PostgreSQL on insert; prefix per type, yearly counter in Asia/Manila; the internal id is never shown. Plan: `docs/plans/short-record-ids.md` |

### 3.2 Status lifecycle and dispatch

| ID | Requirement | Status | Notes |
| :--- | :--- | :--- | :--- |
| BR-LIFE-01 | States: Draft, Scheduled, In Transit, Pending, On-Hold, Rescheduled, Delivered, with server-enforced transitions | Implemented | `services/deliveryLifecycle.ts` |
| BR-LIFE-02 | In Transit only via a dedicated Time In action; needs an assigned driver and a Scheduled or Rescheduled run | Implemented | Driver, Logistics, Admin |
| BR-LIFE-03 | Delivered requires Time In, recipient name, remarks and a verified JPG/PNG proof photo; the server stamps Time Out | Implemented | PDF/DOC are supporting files only |
| BR-LIFE-04 | Status changes require remarks; Rescheduling clears the run timestamps | Implemented | Exception: a Driver starting an assigned run (Start transport, including RMA transport start) may leave the note blank; the server records `Transport started`. Logistics/Admin recording Time In and every completion still require remarks |
| BR-LIFE-05 | Drivers may act only on their own assigned, non-draft runs; future-dated unstarted deliveries are read-only; overdue ones stay actionable and are flagged | Implemented | Ownership by Admin-linked `Driver` profile id |
| BR-LIFE-06 | Late completion is recorded (`completedLate`, `daysLate`) | Implemented | |
| BR-LIFE-07 | Assign driver, vehicle, assistants; coverage areas guide driver matching | Implemented | Logistics, Admin |
| BR-LIFE-08 | Bulk status and priority update from the record list | Implemented | Logistics for status, Sales Coordinator/Logistics for priority; remarks are generated automatically and each record's transition is checked (TSK-76) |
| BR-LIFE-09 | Delivery calendar, dispatch/driver board and manifest views | Implemented | Logistics, Admin |

### 3.3 Proof of delivery

| ID | Requirement | Status | Notes |
| :--- | :--- | :--- | :--- |
| BR-POD-01 | Upload photos and documents (10 MB limit) to a record | Implemented | JPG/PNG verified by byte signature and pixel decoding |
| BR-POD-02 | Preview POD photos in Deliveries Documents and on accomplished run details | Implemented | |
| BR-POD-03 | Remove an attachment with confirmation and an audit entry | Implemented | SC, Logistics, Admin |
| BR-POD-04 | Private object storage in staging/production | Implemented | Supabase provider; local disk in development |
| BR-POD-05 | Digital customer signature and PDC/2307 photo workflows | Planned | Photos can be attached as documents, but no signature capture |

### 3.4 Collections and RMA (TASS)

| ID | Requirement | Status | Notes |
| :--- | :--- | :--- | :--- |
| BR-TASS-01 | TASS works RMA and Accounting Collection records only; edits and status updates limited to RMA records | Implemented | |
| BR-TASS-02 | A delivered Accounting Collection notifies TASS; TASS verifies the collection once, recording who and when | Implemented | `PATCH /records/:id/verify-collection` (TASS only) |
| BR-TASS-03 | Confirm which department owns collection verification | Open question | See section 9 |

### 3.5 Directories

| ID | Requirement | Status | Roles |
| :--- | :--- | :--- | :--- |
| BR-DIR-01 | Companies (SAP number, address, contact, default AM) used on records | Implemented | Read: any permitted record screen. Create/Edit: Admin only (normalized name, unique SAP) |
| BR-DIR-02 | Customers directory with edit, validation, reason-for-change and audit trail | Implemented | Edit: Sales Coordinator, Logistics, Admin. Create also open to Driver |
| BR-DIR-03 | Suppliers directory | Implemented | Create: SC, Logistics, Admin, Driver under applicable supplier permissions. Creation records a central `Supplier` CREATE audit event atomically. Existing category assignments may be edited by Admin only; general contact editing/deletion remains unavailable. See BR-DIR-07 |
| BR-DIR-04 | Driver and assistant directory with coverage areas, active flag and Admin-linked login | Implemented | Admin adds Drivers; Logistics adds Assistants and edits coverage/status; type changes and Driver renames are Admin only (TSK-119) |
| BR-DIR-05 | Account Manager directory | Implemented | Admin-managed directory tab with case-normalized unique names and optional linked User logins |
| BR-DIR-06 | Single unified Company/Customer directory | Planned | Two directories remain |
| BR-DIR-07 | Admin-managed supplier category catalog with multiple categories per supplier | Implemented | Admin creates/renames/deactivates/reactivates categories and edits existing assignments; supplier creators select active categories under their existing authority. Relations, API/UI/filter/export/audit, conflict handling and additive legacy mapping are implemented. See [contract and verification](SUPPLIER_CATEGORIES.md) |

### 3.6 SKU Master and stock

| ID | Requirement | Status | Notes |
| :--- | :--- | :--- | :--- |
| BR-SKU-01 | SKU catalog with cost, price, reorder point, warehouse location | Implemented | Create/edit: Admin. SKU Master is an Admin-default screen (TSK-118); Admin can grant it per user |
| BR-SKU-02 | Manual stock adjustments written to a ledger with non-negative balance enforcement | Implemented | Admin, Logistics (with SKU Master access) |
| BR-SKU-03 | SKU audit trail | Implemented | Admin |
| BR-SKU-04 | Deliveries/RMA/Procurement automatically move stock | Planned | Records do not touch stock |
| BR-SKU-05 | Multiple warehouse locations per SKU | Planned | The Warehouses view is retired |

### 3.7 Dashboards, reports and exports

| ID | Requirement | Status | Notes |
| :--- | :--- | :--- | :--- |
| BR-RPT-01 | Role-specific dashboards (Admin, Logistics, TASS, Driver) with KPI cards and charts | Implemented | Repeated KPI icons removed (TSK-83) |
| BR-RPT-02 | Main view with record lists across modules, filters and date-range validation | Implemented | |
| BR-RPT-03 | Statistical Reports summary with filters | Implemented | Logistics, Admin; `GET /api/reports/summary` |
| BR-RPT-04 | Transaction Center merging delivery events and stock transactions with paging and source filters | Implemented | Inventory data limited to Admin, Sales Coordinator, Logistics with SKU access |
| BR-RPT-05 | Export to CSV, Excel, PDF and Word; route slips | Implemented | Generated in the browser |
| BR-RPT-06 | Daily status-history screen | Retired | Removed in TSK-103; daily snapshots are still written |

### 3.8 Notifications

| ID | Requirement | Status | Notes |
| :--- | :--- | :--- | :--- |
| BR-NOT-01 | In-app bell notifications per user (unread count, mark read / all read) | Implemented | |
| BR-NOT-02 | Email to the Account Manager when a record is Accomplished (Billing Department for collections), logged in `NotificationLog` | Implemented | Real delivery needs Graph or SMTP configuration; otherwise logged only |
| BR-NOT-03 | 4 PM reminders, 6 PM end-of-day alerts, Monday 8 AM weekly report | Implemented | In-process timers, Asia/Manila |
| BR-NOT-04 | Other Output Actions (Rescheduled, On-Hold, RMA completed, PDF export, ...) | Partial | UI confirmations only, intentionally simulated |

### 3.9 Administration and access

| ID | Requirement | Status | Notes |
| :--- | :--- | :--- | :--- |
| BR-ADM-01 | Create, edit, deactivate, activate and delete users; link a Driver login to a driver profile | Implemented | Admin; an Admin cannot remove their own admin role |
| BR-ADM-02 | Per-user module access (grant/deny/reset) with version conflict protection and immediate effect | Implemented | See [Module access](./MODULE_ACCESS.md) |
| BR-ADM-03 | System audit log and per-entity audit trails | Implemented | Supplier creation stores the initial detail snapshot and actor with the supplier row in one transaction |
| BR-ADM-04 | Integration status and test email | Implemented | Admin |
| BR-ADM-05 | Temporary Data Sampler for development/demo data | Temporary; removal planned after development | User decision 2026-11-05: no further sampler fixes; remove when development is complete because it is outside final product scope. Current generation is Admin-only and local development/test only; reset has additional disposable-database safeguards. Removal is not yet implemented; see the [retirement task](SUPPLY_CHAIN_IMPLEMENTATION_STATUS_2026-11-05.md#data-sampler-retirement-task) |
| BR-ADM-06 | Local email/password login plus optional Microsoft SSO | Implemented (login); SSO planned for company rollout | SSO is intended for company use once the system is complete and has not been rolled out. Before rollout, decide how unknown Microsoft users are provisioned: today they are auto-created as Sales Coordinator (issues report 13.4) |
| BR-ADM-07 | Microsoft Teams tab packaging | Partial | Manifest and script in `teams/`; not verified in a live tenant |

## 4. Role capability summary

| Capability | SC | Logistics | TASS | Admin | Driver |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Create records | Yes | Yes (not RMA) | No | Yes | No |
| Edit records | Yes | Yes (not RMA) | RMA only | Yes | Own runs |
| Assign driver/vehicle | No | Yes | No | Yes | No |
| Change status | Draft/Scheduled flow only | Yes (not RMA; cannot submit existing Drafts) | RMA only | Yes | Own runs |
| Record Time In | No | Yes | No | Yes | Own runs |
| Delete record | No | No | No | No | No |
| Verify collection | No | No | Yes | No | No |
| Manage users and module access | No | No | No | Yes | No |
| Manage SKUs | No | Adjust only | No | Yes | No |
| Manage driver directory | No | Assistants, coverage, status | No | Yes (adds Drivers) | No |

The exact default screens per role are listed in [Module access](./MODULE_ACCESS.md).

## 5. Business rules

1. A record has exactly one category; category determines which module, role limits and TASS visibility apply.
2. Reference/SAP number is required unless the record is a Draft.
3. Remarks are mandatory for any substantive edit and for every status change. Exception (BR-LIFE-04): a Driver starting transport may omit the note and the server writes `Transport started`.
4. A started run (Time In recorded) cannot return to Draft or Scheduled.
5. Proof of delivery means a verified JPG/PNG saved on the server; client claims are never trusted.
6. A Driver sees and writes only runs assigned to their linked profile; an unlinked Driver account sees nothing.
7. Record deletion is disabled for every role (OQ-03); audit rows and remark history are never edited.
8. Access is decided by the server on every request from current account data; hiding a button is not authorization.
9. Dates are `YYYY-MM-DD` strings interpreted in Asia/Manila.

## 6. Non-functional requirements

| Area | Requirement | Status |
| :--- | :--- | :--- |
| Security | `httpOnly` cookie session, 8-hour token, per-request account reload, bcrypt passwords | Implemented |
| Security | Brute-force protection, security headers, CSRF token on cross-site cookie | Planned (see issues 2.5, 2.6, 2.8) |
| Auditability | Audit log, remark log, comments, notification log | Implemented |
| Availability | Health endpoint with database/mailer/env checks; client "server unavailable" screen with retry | Implemented |
| Availability | Jobs safe under multiple instances / host sleep | Planned |
| Performance | Indexed record queries, optional cursor paging on `GET /api/records`, paged Transaction Center | Partial |
| Mobile | Mobile-first Driver dashboard | Implemented; offline mode Planned |
| Compliance | Time zone: Asia/Manila for scheduling and overdue logic | Implemented |
| Quality | Automated tests (unit/HTTP-level and Playwright E2E); CI runs build/type/schema checks only | Partial |

## 7. Integrations

| Integration | Purpose | Status |
| :--- | :--- | :--- |
| Microsoft Graph / SMTP | Outbound email | Implemented (mock fallback) |
| Microsoft Entra ID | SSO | Implemented, not verified live |
| Supabase Storage | POD files | Implemented |
| Microsoft Teams | Tab app | Partial |
| SAP | Reference numbers are typed manually; no data exchange | Not integrated |

## 8. Key workflows

1. **Delivery:** Sales Coordinator creates (or drafts) → submit notifies Logistics → Logistics assigns driver/vehicle → Driver records Time In → Driver uploads photo and names recipient → Delivered (server Time Out, Account Manager email) → audit trail.
2. **Collection:** Collection record delivered → TASS notified → TASS verifies once.
3. **RMA:** Created by Sales Coordinator/Admin; Logistics view-only; TASS edits and updates status.
4. **Access change:** Admin edits module access → the user's session refreshes within 30 seconds (or on focus) → revoked access is denied by the API immediately.

## 9. Open questions and assumptions

- **TASS scope:** TASS is documented as "Technical Admin System Services". Its current permissions (RMA, collections, verification) were assumed before a stakeholder meeting. Whether collection verification belongs to Finance/Accounting is unconfirmed.
- **TASS and Procurement:** TASS gets the Procurement Pick-up and Suppliers screens by default, but record scope limits TASS to RMA and Accounting Collection records (see issues report 13.3).
- **SAP:** Whether references should be validated against SAP is undecided.
- **Inventory coupling:** Whether deliveries should reserve or deduct stock is undecided.
