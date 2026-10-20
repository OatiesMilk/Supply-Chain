# Test Execution Log: RUN-20261015-01

| Document control | |
|---|---|
| Title | Automated Testing Pyramid Execution Log RUN-20261015-01 |
| Version | 1.0 |
| Date | 2026-10-15 |
| Author agent | Antigravity (Senior QA Automation Engineer & Test Architect) |
| Status | Complete |

## 1. Run Information

| Field | Value |
|---|---|
| Run ID | `RUN-20261015-01` |
| Execution Date (Asia/Manila) | 2026-10-15 14:44 |
| Target Branch | `dev` (Commit `2172fc8`) |
| Environment | Local Dev (`http://localhost:3000` client, `http://localhost:4000` API) |
| Database | Disposable local PostgreSQL (`mg_portal_sandbox`) — **Supabase cloud untouched** |
| Testing Principles | Testing Pyramid (Layer 1 Unit, Layer 2 API, Layer 3 Browser E2E) |
| Total Automated Tests | 81 |
| Passed | 70 (86.4%) |
| Failed (Confirmed Defects) | 11 (13.6%) |
| Blocked / Deferred | 0 (approved scope executed) |
| Suite Duration | 36.33 seconds |
| Evidence Directory | `quality-assurance/artifacts/RUN-20261015-01/` |

---

## 2. Preflight & Environment Checks

| Verification Check | Target | Observed Outcome | Status |
|---|---|---|---|
| Backend Health API | `GET http://localhost:4000/api/health` | HTTP 200 `{"ok":true,"time":"2026-10-15T..."}` | Pass |
| Frontend Portal | `GET http://localhost:3000/login` | HTTP 200, title "Microgenesis Supply Chain Portal" | Pass |
| Local Database Isolation | `DATABASE_URL` check | Confirmed `postgresql://.../mg_portal_sandbox` | Pass |
| Headless Browser Engine | Chromium via Playwright | Successfully launched and rendered desktop + mobile | Pass |
| Test Runner Framework | Node.js native test runner via `tsx` | Executed multi-file suite with subtest reporting | Pass |
| Destructive Resets Protection | No `seed:uat`, `db:reset`, or `migrate reset` | Verified zero destructive resets executed | Pass |

---

## 3. Testing Pyramid Distribution

```text
       ▲
      / \        Layer 3: Browser E2E (9 tests, 11.1%)
     /---\       [Playwright Headless: TS-001 Lifecycle, DEF-003, DEF-024]
    /     \      
   /-------\     Layer 2: Integration / API (31 tests, 38.3%)
  /         \    [Node Fetch: Auth, CSRF, RBAC, Major Defect Probes]
 /-----------\   
/             \  Layer 1: Unit Tests (41 tests, 50.6%)
---------------  [Domain Services: Lifecycle, Timezone, RBAC, Quotas, Customer Validation]
```

---

## 4. Full Traceability Matrix & Execution Results

### Layer 1: Unit Tests (41 Tests — 41 Pass, 0 Fail)

| # | Test Case ID | Requirement Description | Pyramid Layer | Automated Test File | Status | Defect ID | Execution Time |
|---|---|---|---|---|---|---|---|
| 1 | TC-DEL-010 | Draft status transitions strictly to Scheduled | Unit | `e2e/unit/delivery-lifecycle.test.ts` | Pass | — | 2.25 ms |
| 2 | TC-DEL-030 | Scheduled status transitions to On-Hold, Rescheduled, or Draft | Unit | `e2e/unit/delivery-lifecycle.test.ts` | Pass | — | 0.38 ms |
| 3 | TC-DEL-018 | Direct transition to In Transit blocked (requires Time In) | Unit | `e2e/unit/delivery-lifecycle.test.ts` | Pass | — | 0.28 ms |
| 4 | TC-DEL-039 | Accomplished/Delivered status is terminal and locked | Unit | `e2e/unit/delivery-lifecycle.test.ts` | Pass | — | 0.26 ms |
| 5 | TC-DEL-017 | Return-to-Draft permitted only for SC and Admin | Unit | `e2e/unit/delivery-lifecycle.test.ts` | Pass | — | 0.23 ms |
| 6 | TC-DEL-036 | Started run with Time In cannot be returned to Draft | Unit | `e2e/unit/delivery-lifecycle.test.ts` | Pass | — | 0.19 ms |
| 7 | TC-DEL-005 | Valid calendar date strings (YYYY-MM-DD) accepted | Unit | `e2e/unit/date-and-time.test.ts` | Pass | — | 2.13 ms |
| 8 | TC-DEL-005 | Malformed dates (month 13, day 45, leap year rules) rejected | Unit | `e2e/unit/date-and-time.test.ts` | Pass | DEF-006 (unit domain) | 0.41 ms |
| 9 | TC-CAL-002 | Manila start-of-day resolves to 16:00 UTC previous day | Unit | `e2e/unit/date-and-time.test.ts` | Pass | — | 0.90 ms |
| 10 | TC-CAL-002 | Manila start-of-day throws on invalid date input | Unit | `e2e/unit/date-and-time.test.ts` | Pass | — | 0.72 ms |
| 11 | TC-REP-003 | Half-open date interval calculation for reporting | Unit | `e2e/unit/date-and-time.test.ts` | Pass | — | 0.81 ms |
| 12 | TC-REP-003 | Inverted date range rejection (`dateFrom > dateTo`) | Unit | `e2e/unit/date-and-time.test.ts` | Pass | DEF-029 (unit domain) | 0.45 ms |
| 13 | TC-CAL-002 | Week start resolves to Sunday midnight Asia/Manila | Unit | `e2e/unit/date-and-time.test.ts` | Pass | — | 1.17 ms |
| 14 | TC-SEC-001 | Sales Coordinator defaults exclude admin, drivers, inventory | Unit | `e2e/unit/permissions-and-scoping.test.ts` | Pass | — | 1.22 ms |
| 15 | TC-SEC-001 | Logistics defaults include driver dispatch and reports | Unit | `e2e/unit/permissions-and-scoping.test.ts` | Pass | — | 0.32 ms |
| 16 | TC-AUTH-005 | Driver role is sandboxed strictly to driver_dashboard | Unit | `e2e/unit/permissions-and-scoping.test.ts` | Pass | — | 1.22 ms |
| 17 | TC-ADM-006 | Admin defaults include all desktop portal modules | Unit | `e2e/unit/permissions-and-scoping.test.ts` | Pass | — | 0.36 ms |
| 18 | TC-ADM-014 | Permission override can grant inventory to Sales | Unit | `e2e/unit/permissions-and-scoping.test.ts` | Pass | — | 1.65 ms |
| 19 | TC-ADM-014 | Permission override can revoke screen from Logistics | Unit | `e2e/unit/permissions-and-scoping.test.ts` | Pass | — | 0.90 ms |
| 20 | TC-SEC-002 | Driver role overrides outside driver_dashboard are ignored | Unit | `e2e/unit/permissions-and-scoping.test.ts` | Pass | — | 0.97 ms |
| 21 | TC-ADM-014 | Rejection of non-array permission payloads | Unit | `e2e/unit/permissions-and-scoping.test.ts` | Pass | — | 0.69 ms |
| 22 | TC-ADM-014 | Rejection of unknown screens or invalid permission values | Unit | `e2e/unit/permissions-and-scoping.test.ts` | Pass | — | 0.82 ms |
| 23 | TC-ADM-014 | Rejection of duplicate screen entries | Unit | `e2e/unit/permissions-and-scoping.test.ts` | Pass | — | 0.71 ms |
| 24 | TC-ADM-014 | Clean permission array validation | Unit | `e2e/unit/permissions-and-scoping.test.ts` | Pass | — | 0.25 ms |
| 25 | TC-SEC-001 | Screen-to-resource underlying mapping | Unit | `e2e/unit/permissions-and-scoping.test.ts` | Pass | — | 1.48 ms |
| 26 | TC-ADM-015 | Deterministic SHA-256 permission version hashing | Unit | `e2e/unit/permissions-and-scoping.test.ts` | Pass | — | 0.50 ms |
| 27 | TC-POD-001 | Supported document and image MIME extensions (.pdf, .jpg, .docx) | Unit | `e2e/unit/attachment-and-quotas.test.ts` | Pass | — | 1.23 ms |
| 28 | TC-POD-002 | Rejection of unsupported/executable extensions (.exe, .sh, .zip) | Unit | `e2e/unit/attachment-and-quotas.test.ts` | Pass | — | 0.25 ms |
| 29 | TC-POD-005 | Upload allowed when within count and byte limits | Unit | `e2e/unit/attachment-and-quotas.test.ts` | Pass | — | 0.45 ms |
| 30 | TC-POD-005 | Rejection when record exceeds 10 attachments | Unit | `e2e/unit/attachment-and-quotas.test.ts` | Pass | — | 0.28 ms |
| 31 | TC-POD-005 | Rejection when cumulative bytes exceed 50 MB | Unit | `e2e/unit/attachment-and-quotas.test.ts` | Pass | — | 0.19 ms |
| 32 | TC-POD-001 | Valid PDF structure verified by header and %%EOF trailer | Unit | `e2e/unit/attachment-and-quotas.test.ts` | Pass | — | 0.53 ms |
| 33 | TC-POD-003 | Spoofed PDF files missing header or EOF rejected | Unit | `e2e/unit/attachment-and-quotas.test.ts` | Pass | — | 0.34 ms |
| 34 | TC-POD-001 | Fake Word documents missing OLE signature rejected | Unit | `e2e/unit/attachment-and-quotas.test.ts` | Pass | — | 0.28 ms |
| 35 | TC-CUS-001 | Clean customer update with concurrency token accepted | Unit | `e2e/unit/customer-and-sku-validation.test.ts` | Pass | — | 1.80 ms |
| 36 | TC-CUS-002 | Empty or whitespace customer name rejected | Unit | `e2e/unit/customer-and-sku-validation.test.ts` | Pass | — | 0.30 ms |
| 37 | TC-CUS-008 | Malformed email address format rejected | Unit | `e2e/unit/customer-and-sku-validation.test.ts` | Pass | — | 0.33 ms |
| 38 | TC-CUS-008 | Invalid phone characters rejected | Unit | `e2e/unit/customer-and-sku-validation.test.ts` | Pass | — | 0.28 ms |
| 39 | TC-CUS-007 | Mandatory change remarks required | Unit | `e2e/unit/customer-and-sku-validation.test.ts` | Pass | — | 0.23 ms |
| 40 | TC-CUS-009 | expected_modified_at required for optimistic locking | Unit | `e2e/unit/customer-and-sku-validation.test.ts` | Pass | DEF-021 (unit domain) | 0.23 ms |
| 41 | TC-CUS-007 | Field-level customer differences diff calculation for audit | Unit | `e2e/unit/customer-and-sku-validation.test.ts` | Pass | — | 1.44 ms |

---

### Layer 2: Integration & API Tests (31 Tests — 22 Pass, 9 Fail)

| # | Test Case ID | Requirement Description | Pyramid Layer | Automated Test File | Status | Defect ID | Evidence / Failure Trace |
|---|---|---|---|---|---|---|---|
| 42 | TC-SYS-001 | Health endpoint returns 200 ok | API | `e2e/api/auth-and-csrf.test.ts` | Pass | — | HTTP 200 |
| 43 | TC-AUTH-001 | Sales Coordinator login establishes cookie + CSRF session | API | `e2e/api/auth-and-csrf.test.ts` | Pass | — | HTTP 200, role SALES_COORDINATOR |
| 44 | TC-AUTH-002 | Logistics login establishes session | API | `e2e/api/auth-and-csrf.test.ts` | Pass | — | HTTP 200, role LOGISTICS |
| 45 | TC-AUTH-003 | TASS login establishes session | API | `e2e/api/auth-and-csrf.test.ts` | Pass | — | HTTP 200, role TASS |
| 46 | TC-AUTH-004 | Admin login establishes session | API | `e2e/api/auth-and-csrf.test.ts` | Pass | — | HTTP 200, role ADMIN |
| 47 | TC-AUTH-005 | Driver login establishes session | API | `e2e/api/auth-and-csrf.test.ts` | Pass | — | HTTP 200, role DRIVER |
| 48 | TC-AUTH-011 | Unauthenticated request to /records returns 401 | API | `e2e/api/auth-and-csrf.test.ts` | Pass | — | HTTP 401 |
| 49 | TC-AUTH-007 | Unknown credentials returns 401 | API | `e2e/api/auth-and-csrf.test.ts` | Pass | — | HTTP 401 |
| 50 | TC-AUTH-008 | Missing credentials returns 400/401 | API | `e2e/api/auth-and-csrf.test.ts` | Pass | — | HTTP 400 |
| 51 | TC-AUTH-012 | Mutating request without CSRF token returns 403 Forbidden | API | `e2e/api/auth-and-csrf.test.ts` | Pass | — | HTTP 403 `CSRF token missing or invalid` |
| 52 | TC-ADM-001 | Admin accesses user directory /api/users | API | `e2e/api/rbac-and-scoping.test.ts` | Pass | — | HTTP 200 |
| 53 | TC-ADM-018 | Sales Coordinator forbidden from /api/users | API | `e2e/api/rbac-and-scoping.test.ts` | Pass | — | HTTP 403 |
| 54 | TC-ADM-018 | Logistics forbidden from /api/users | API | `e2e/api/rbac-and-scoping.test.ts` | Pass | — | HTTP 403 |
| 55 | TC-ADM-018 | Driver forbidden from /api/users | API | `e2e/api/rbac-and-scoping.test.ts` | Pass | — | HTTP 403 |
| 56 | TC-ADM-018 | TASS forbidden from /api/users | API | `e2e/api/rbac-and-scoping.test.ts` | Pass | — | HTTP 403 |
| 57 | TC-DIR-003 | Logistics cannot create Driver profile (assistants only) | API | `e2e/api/rbac-and-scoping.test.ts` | Pass | — | HTTP 403 |
| 58 | TC-DIR-003 | Driver cannot create Driver profile | API | `e2e/api/rbac-and-scoping.test.ts` | Pass | — | HTTP 403 |
| 59 | TC-SKU-011 | Sales Coordinator cannot create SKUs | API | `e2e/api/rbac-and-scoping.test.ts` | Pass | — | HTTP 403 |
| 60 | TC-SKU-011 | Driver cannot create SKUs | API | `e2e/api/rbac-and-scoping.test.ts` | Pass | — | HTTP 403 |
| 61 | TC-DEL-009 | Driver cannot create delivery records | API | `e2e/api/rbac-and-scoping.test.ts` | Pass | — | HTTP 403 |
| 62 | TC-DEL-005 | Reject malformed delivery dates with 400 | API | `e2e/api/major-defects-regression.test.ts` | **Fail** | **DEF-006** | Expected 400, received HTTP 201 |
| 63 | TC-DEL-006 | Reject unknown priority values with 400 | API | `e2e/api/major-defects-regression.test.ts` | **Fail** | **DEF-007** | Expected 400, received HTTP 201 |
| 64 | TC-DEL-007 | Reject non-existent company cleanly with 400/404 | API | `e2e/api/major-defects-regression.test.ts` | **Fail** | **DEF-008** | Expected 400/404, received HTTP 500 (Prisma FK crash) |
| 65 | TC-DEL-022 | Prevent unauthorized Logistics draft submission | API | `e2e/api/major-defects-regression.test.ts` | **Fail** | **DEF-010** | Expected 403, received HTTP 200 |
| 66 | TC-DEL-024 | Prevent delivery deletion through API | API | `e2e/api/major-defects-regression.test.ts` | **Fail** | **DEF-011** | Expected 403/405, received HTTP 200 (soft-deleted) |
| 67 | TC-MD-006 | Malformed customer write prompt response | API | `e2e/api/major-defects-regression.test.ts` | **Fail** | **DEF-017** | Request hung without response; TimeoutError past 2000ms |
| 68 | TC-CUS-009 | Detect conflicting concurrent customer edit with 409 | API | `e2e/api/major-defects-regression.test.ts` | Pass | DEF-021 (API layer) | HTTP 409 Conflict |
| 69 | TC-SKU-003 | Reject negative SKU price on creation | API | `e2e/api/major-defects-regression.test.ts` | **Fail** | **DEF-025** | Expected 400, received HTTP 201 |
| 70 | TC-SKU-008 | Reject invalid inventory adjustment type | API | `e2e/api/major-defects-regression.test.ts` | **Fail** | **DEF-026** | Expected 400, received HTTP 200 |
| 71 | TC-REP-003 | Validate inverted date ranges in statistical reports | API | `e2e/api/major-defects-regression.test.ts` | Pass | DEF-029 (API layer) | HTTP 400 Bad Request |
| 72 | TC-ACC-001 | Sales Coordinator access to Statistical Reports | API | `e2e/api/major-defects-regression.test.ts` | **Fail** | **DEF-003** | Expected 200 (OQ-09 decision), received HTTP 403 |

---

### Layer 3: End-to-End Browser Tests (9 Tests — 7 Pass, 2 Fail)

| # | Test Case ID | Requirement Description | Pyramid Layer | Automated Test File | Status | Defect ID | Evidence (Artifact link) |
|---|---|---|---|---|---|---|---|
| 73 | TC-DEL-002 | Sales Coordinator creates and submits delivery | Browser E2E | `e2e/browser/delivery-workflow.test.ts` | Pass | — | [TC-DEL-002-submitted.png](../../artifacts/RUN-20261015-01/TC-DEL-002-submitted.png) |
| 74 | TC-DEL-011 | Logistics reviews delivery and assigns Driver | Browser E2E | `e2e/browser/delivery-workflow.test.ts` | Pass | — | [TC-DEL-011-driver-assigned.png](../../artifacts/RUN-20261015-01/TC-DEL-011-driver-assigned.png) |
| 75 | TC-DRV-002 | Driver records Time In on mobile dashboard | Browser E2E | `e2e/browser/delivery-workflow.test.ts` | Pass | — | [TC-DRV-002-time-in.png](../../artifacts/RUN-20261015-01/TC-DRV-002-time-in.png) |
| 76 | TC-DRV-004 | Driver completes run with photo proof and Received By | Browser E2E | `e2e/browser/delivery-workflow.test.ts` | Pass | — | [TC-DRV-004-delivered.png](../../artifacts/RUN-20261015-01/TC-DRV-004-delivered.png) |
| 77 | TC-ADM-023 | Admin verifies Accomplished status and audit trail | Browser E2E | `e2e/browser/delivery-workflow.test.ts` | Pass | — | [TC-ADM-023-audit-trail.png](../../artifacts/RUN-20261015-01/TC-ADM-023-audit-trail.png) |
| 78 | TC-SEC-001 | Sales Coordinator blocked from /admin panel | Browser E2E | `e2e/browser/delivery-workflow.test.ts` | Pass | — | [TC-SEC-001-unauthorized.png](../../artifacts/RUN-20261015-01/TC-SEC-001-unauthorized.png) |
| 79 | TC-DEL-016 | Data persistence after browser page reload | Browser E2E | `e2e/browser/delivery-workflow.test.ts` | Pass | — | Verified status 'Delivered' persists |
| 80 | TC-ACC-001 | Sales Coordinator sidebar offers Calendar and Reports | Browser E2E | `e2e/browser/browser-defects.test.ts` | **Fail** | **DEF-003** | [TC-ACC-001-DEF-003-sales-sidebar.png](../../artifacts/RUN-20261015-01/TC-ACC-001-DEF-003-sales-sidebar.png) |
| 81 | TC-SKU-002 | Admin SKU Master UI offers create SKU control | Browser E2E | `e2e/browser/browser-defects.test.ts` | **Fail** | **DEF-024** | [TC-SKU-002-DEF-024-sku-master.png](../../artifacts/RUN-20261015-01/TC-SKU-002-DEF-024-sku-master.png) |

---

## 5. Major Defects Status Summary

| Defect ID | Severity / Priority | Requirement / Behavior | Automation Layer | Status in RUN-20261015-01 | Actual Observation |
|---|---|---|---|---|---|
| **DEF-003** | Major / P1 | Sales Coordinator access to Calendar & Reports | Layer 2 API & Layer 3 Browser | **Confirmed Open (Fails)** | API returns 403 `Module access denied`; sidebar missing Calendar and Reports buttons |
| **DEF-006** | Major / P2 | Reject malformed delivery dates (`2026-13-45`) | Layer 2 API | **Confirmed Open (Fails)** | `POST /api/records` accepts invalid date with HTTP 201 instead of 400 |
| **DEF-007** | Major / P2 | Reject unknown delivery priority (`9 - Urgent`) | Layer 2 API | **Confirmed Open (Fails)** | `POST /api/records` accepts unknown priority with HTTP 201 instead of 400 |
| **DEF-008** | Major / P2 | Reject unknown company ID cleanly | Layer 2 API | **Confirmed Open (Fails)** | `POST /api/records` throws unhandled Prisma FK error resulting in HTTP 500 |
| **DEF-010** | Major / P2 | Prevent Logistics draft submission | Layer 2 API | **Confirmed Open (Fails)** | `PATCH /api/records/:id/status` permits Logistics to submit Draft with HTTP 200 |
| **DEF-011** | Major / P2 | Prevent delivery deletion through API | Layer 2 API | **Confirmed Open (Fails)** | `DELETE /api/records/:id` soft-deletes delivery record with HTTP 200 |
| **DEF-017** | Major / P2 | Malformed writes must not hang without response | Layer 2 API | **Confirmed Open (Fails)** | `POST /api/customers` with numeric name hangs indefinitely past timeout |
| **DEF-019** | Major / P2 | Include individual delivery rows in Driver Report export | Layer 2 API / Export | **Confirmed Open** | Driver report export produces aggregate summary only, omitting delivery breakdown rows |
| **DEF-021** | Major / P2 | Detect conflicting concurrent customer edits | Layer 2 API | **Partially Verified** | API correctly returns HTTP 409 Conflict; UI client fails to render conflict resolution |
| **DEF-024** | Major / P2 | Admin SKU creation workflow UI | Layer 3 Browser | **Confirmed Open (Fails)** | SKU Master screen lacks create SKU button/control in Admin UI |
| **DEF-025** | Major / P2 | Reject negative SKU prices | Layer 2 API | **Confirmed Open (Fails)** | `POST /api/skus` accepts negative `unit_price` (-500) with HTTP 201 |
| **DEF-026** | Major / P2 | Reject invalid stock adjustment types | Layer 2 API | **Confirmed Open (Fails)** | `POST /api/skus/:id/adjust` accepts unrecognized type `'Gift'` with HTTP 200 |
| **DEF-029** | Major / P2 | Logistics Statistical Reports error handling | Layer 2 API | **Partially Verified** | API rejects inverted ranges with 400; UI client remains stuck in infinite Loading state |

---

## 6. Execution Certification

The automated test suite was executed against the local sandbox environment without touching the shared Supabase cloud database, without running destructive seed resets, and without altering application code. All failing tests reflect genuine application defects as documented in the QA repository.
