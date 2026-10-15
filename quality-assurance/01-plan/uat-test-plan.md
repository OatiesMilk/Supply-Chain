# UAT Test Plan: Microgenesis Supply Chain Portal

| Document control | |
|---|---|
| Title | UAT Test Plan, Microgenesis Supply Chain Portal |
| Document ID | QA-PLAN-001 |
| Version | 1.2 |
| Date | 2026-10-14 |
| Author agent | Claude Code (test designer) |
| Status | Approved for execution, pending user sign-off |
| Baseline | Branch `dev`, commit `2172fc8` |
| Standard | Structure follows ISO/IEC/IEEE 29119-3 (Test Plan); terminology follows the ISTQB Glossary |

## Revision history

| Version | Date | Author agent | Change |
|---|---|---|---|
| 1.0 | 2026-10-14 | Claude Code | Initial UAT package for the current system |
| 1.1 | 2026-10-14 | Claude Code | User answers to OQ-01..OQ-09: cycle 1 focuses on Deliveries; RMA, Accounting Collection, Procurement Pick-up, Sales Orders, TASS-specific cases and the completion email deferred; no record deletion; Sales Coordinator gets Calendar and Reports |
| 1.2 | 2026-10-14 | Claude Code | Baseline moved to the latest `dev` commit `2172fc8` (only `server/src/services/mailer.ts` changed since `9157425`: Graph mail packages load at startup; no code reference in this package moved) |

---

## 1. Introduction

This plan governs User Acceptance Testing (UAT) of the Microgenesis Supply Chain Portal as it exists today. The portal is an internal web application that manages Deliveries, RMA, Accounting Collection, Procurement Pick-up and Sales Orders records, the drivers who execute them, the supporting directories (companies, customers, suppliers, drivers, SKUs), dashboards, notifications and administration.

UAT here is a **findings-only** quality assurance exercise. Its purpose is to establish, by observation, what passes and what fails. Nobody in this process fixes anything: failures are recorded as defects with evidence and reported to the user, who decides what happens next.

## 2. Objectives

1. Confirm, role by role, that each of the five roles (Sales Coordinator, Logistics, TASS, Admin, Driver) can complete the business workflows assigned to it, end to end.
2. Confirm that each role is **prevented** from doing what belongs to another role, both in the user interface and at the API.
3. Confirm that every server-enforced status transition and business rule behaves as the code documents it.
4. Confirm or disprove each suspected issue raised during discovery (`00-discovery/open-questions.md`, items SI-01 to SI-NN).
5. Produce an evidence-backed recommendation (Go / Conditional Go / No-Go) for the user, who is the UAT sign-off authority.

## 3. Scope

### 3.1 In scope

- Email and password sign-in, session handling, sign-out (non-SSO only).
- Role-based module access (default screens per role, per-user grants and denials).
- Record lifecycle for all five categories: create, save as Draft, submit, edit with remarks, assign driver/vehicle/assistants, Record Time In, status changes (Scheduled, In Transit, Pending, On-Hold, Rescheduled, Delivered, Draft), proof-of-delivery photo rule, Received By, completion stamping, soft delete, comments, remark history, audit trail.
- Accounting Collection verification by TASS and linking a delivery to a collection.
- Driver mobile dashboard (own runs only, future-dated read-only rule, Time In, photo, completion).
- Attachments: accepted types, 10 MB per-file limit, 10-files / 50 MB per-record quota, content verification, removal rules.
- Driver directory (Driver Manager), Delivery Calendar, Driver Board, Driver View.
- Companies, Customers (create, edit with reason, optimistic concurrency, audit trail), Suppliers (create).
- SKU Master (create, edit, stock adjustment with non-negative balance) and the Transaction Center.
- Dashboards per role, Statistical Reports, AM Directory.
- In-app notifications (bell, unread count, mark read, mark all read) and the record-completion email log (mock mailer).
- Admin Panel: users (create, edit, deactivate, activate, delete), Driver login linking, module access editor, audit log, integration status, test email.
- Server-side security behaviours observable from a browser or HTTP client: CSRF token requirement on writes, login rate limiting, session invalidation on deactivation.

### 3.2 Out of scope (features not to be tested)

| Feature | Reason |
|---|---|
| **Microsoft SSO login ("Sign in with Microsoft" button; the prompt calls it "Login with Microsoft")** and every `/api/auth/microsoft*` endpoint, Microsoft identity linking in Admin Panel | **Excluded from this UAT cycle** by the user. No test case covers it. Testers must never click it or use a Microsoft account. |
| Microsoft Teams tab packaging (`teams/`) | Needs a live tenant |
| Real email delivery through Microsoft Graph or SMTP | The local environment uses the mock mailer; only the `NotificationLog` outcome is checked |
| Scheduled jobs (4 PM reminders, 6 PM end-of-day alerts, Monday 8 AM weekly report, daily status snapshot) | Time-triggered in-process timers (`server/src/index.ts:150-338`) cannot be triggered on demand without changing the clock or code |
| Data Sampler "Full Reset" / "Reset to Seed Data" and Navbar "Reset Demo Data" | Destructive; constraint 7 forbids destructive commands. Only visibility of the controls is checked |
| Staging seed and staging reset scripts, Render/Cloudflare deployment | Deployment tooling, not user functionality |
| Performance, load and penetration testing | Not part of UAT |
| Automated unit, HTTP and Playwright suites already in the repository (`server/tests`, `client/**/__tests__`, `e2e/tests`) | Developer tests; UAT does not re-run or change them |

### 3.3 Deferred to a later cycle (user decision 2026-10-14)

The test cases below stay in the package but are **not executed in cycle 1**; Codex records them as Not Run with the reason written in each case. Details: `00-discovery/open-questions.md` §0.

| Deferred | Reason |
|---|---|
| RMA workflow (TC-RMA-*, TC-ACC-017, TC-DRV-008) | Who starts RMA runs is undecided (OQ-01) |
| Accounting Collection and verification (TC-COL-*, TC-POD-009) | Verification owner undecided (OQ-07) |
| Procurement Pick-up (TC-PRC-*), Sales Orders (TC-SO-*), non-Delivery driver date rule (TC-DRV-010) | Focus on Deliveries for now (OQ-01, OQ-04) |
| TASS-specific behaviour (TC-ACC-005, 006, 010, TC-TXN-004, TC-RPT-003, TC-MD-011) | TASS responsibilities not yet defined (OQ-02) |
| Completion email (TC-NOT-005) | In-app notifications suffice for now (OQ-08) |

## 4. References

| Ref | Document |
|---|---|
| R1 | `quality-assurance/00-discovery/system-overview.md` (system model with code references) |
| R2 | `quality-assurance/00-discovery/open-questions.md` (open questions and suspected issues) |
| R3 | `quality-assurance/02-test-design/test-scenarios.md` |
| R4 | `quality-assurance/02-test-design/test-cases/` |
| R5 | `quality-assurance/02-test-design/test-data.md` |
| R6 | `quality-assurance/02-test-design/traceability-matrix.md` |
| R7 | `docs/GETTING_STARTED.md` (setup and run instructions) |
| R8 | `docs/BUSINESS_REQUIREMENTS.md`, `docs/MODULE_ACCESS.md` (project's own descriptions; code is authoritative where they differ) |
| R9 | ISO/IEC/IEEE 29119-3:2021 Test documentation; ISTQB Glossary |

## 5. Test items

| Item | Location | Version |
|---|---|---|
| Web client (React 19, Vite) | `client/` | commit `2172fc8` |
| API server (Express 4, Prisma 7, PostgreSQL) | `server/` | commit `2172fc8` |
| Database schema | `server/prisma/schema.prisma`, migration `20260922071007_init` | commit `2172fc8` |

Codex records the actual commit hash of the build under test in every execution log; if it differs from the baseline `2172fc8` (the latest `dev` commit when the package was finalised), the difference must be noted and reported to the user.

## 6. Features to be tested

Grouped by test-case file (each file is one module or workflow):

| File | Module / workflow |
|---|---|
| `TC-AUTH-authentication.md` | Sign-in, session, sign-out, security behaviours |
| `TC-ACC-access-control.md` | Module access per role and cross-role negative checks |
| `TC-DEL-deliveries.md` | Deliveries lifecycle (the main end-to-end chain) |
| `TC-DRV-driver-app.md` | Driver dashboard |
| `TC-POD-attachments.md` | Attachments and proof of delivery |
| `TC-RMA-rma.md` | RMA workflow (TASS) |
| `TC-COL-accounting-collection.md` | Accounting Collection and verification |
| `TC-PRC-procurement-pickup.md` | Procurement Pick-up |
| `TC-SO-sales-orders.md` | Sales Orders |
| `TC-DIR-driver-directory.md` | Driver Manager, Calendar, Driver Board, Driver View |
| `TC-MD-master-data.md` | Companies, Customers, Suppliers |
| `TC-SKU-sku-master.md` | SKU Master and stock adjustments |
| `TC-TXN-transaction-center.md` | Transaction Center |
| `TC-RPT-dashboards-reports.md` | Dashboards, Statistical Reports, AM Directory |
| `TC-NOT-notifications.md` | In-app notifications and completion email log |
| `TC-ADM-administration.md` | Admin Panel: users, module access, audit log, integrations |

## 7. Approach

- **Level and type:** acceptance testing, black-box, end-to-end and role-based. Test design techniques: use-case / scenario testing for workflows, state-transition testing for the record lifecycle (`server/src/services/deliveryLifecycle.ts:49-57`), equivalence partitioning and boundary value analysis for validations, and negative (error-guessing) tests for every suspected issue.
- **Interfaces:** the browser UI is primary. Where a rule is enforced only by the server, or a UI control is hidden for a role, the case exercises the API directly (with the role's authenticated session and its CSRF token) to prove the server, not just the UI, enforces it. API steps are written so they can be run from Playwright `page.request` or the browser console with `fetch`.
- **Chain ordering:** cases are ordered so data created by one role's case feeds the next role's case (see dependency notes in each case and the execution order in `AGENTS.md`).
- **Findings only:** a failure is recorded and execution continues. No retry after changing anything; no code, configuration or data is altered to make a case pass.
- **Evidence:** Playwright screenshots at every key step and at every failure (full page), Playwright traces and console errors for failures, HTTP responses saved as text where the UI is not involved.

## 8. Roles and responsibilities

| Party | Responsibility |
|---|---|
| Claude Code (test designer) | Discovery, this plan, scenarios, test cases, test data, traceability, templates, initial handoff. Does not execute tests. |
| ChatGPT Codex (test executor and reporter) | Sets up the environment, executes cases in order, captures evidence, writes execution logs, defect reports and the UAT summary report, writes handoffs. Does not fix anything. |
| User (UAT sign-off authority) | Provides the environment prerequisites and passwords at run time, reviews reports, decides Go / Conditional Go / No-Go, commits and pushes all documents manually. |

## 9. Test environment and prerequisites

| Need | Detail | Provided by |
|---|---|---|
| Node.js 20 and npm | As in `docs/GETTING_STARTED.md` | User machine |
| Docker with PostgreSQL | `docker compose up -d`, port 5433 | User |
| **Disposable** local database | Name ending `_sandbox` or `_test`, loopback host, with `LOCAL_DESTRUCTIVE_SEED=true` and `LOCAL_SEED_DATABASE` set (see `docs/GETTING_STARTED.md` §4) | User |
| Env files | `.env` and `server/.env` copied from the examples and filled in; no SMTP / Azure values (mock mailer) | User |
| Seed | `npm run seed:uat` run once before RUN-01 (it wipes and reseeds the disposable database) | User, or Codex only with the user's explicit approval for that run |
| Servers running | `npm run dev` from the repository root: client `http://localhost:3000`, API `http://localhost:4000` | User / Codex |
| Passwords for the test accounts | Supplied by the user at run time; never written to any file | User |
| Playwright | Installed only inside `quality-assurance/e2e/` | Codex |
| Test files | JPG, PNG, PDF, DOCX, an 11 MB file, a renamed non-image, listed in `test-data.md` §6 | Codex creates them under `quality-assurance/e2e/fixtures/` |

The seed sets every demo run's Delivery Date to the Manila date on which it ran. Execute the Driver cases on the **same Manila calendar day** as the seed, or reseed first (with approval).

## 10. Entry criteria

1. The environment in §9 is running and `GET /api/health` returns HTTP 200.
2. All five seeded role accounts can sign in through the email form.
3. The UAT package (this folder) is at version 1.0 or later and HO-001 has been read.
4. The database is disposable and freshly seeded with `npm run seed:uat`.

## 11. Exit criteria

UAT execution is complete when:
1. Every test case has a status of Pass, Fail, Blocked or Not Run, with evidence for Pass and Fail.
2. Every Fail has a defect report in `05-defects/`.
3. Every suspected issue SI-xx has a recorded outcome in the summary report.
4. The UAT summary report is written and a handoff to the user exists.

Recommendation rules for the summary report:
- **Go:** no open Critical or Major defects, at least 95% of executed cases pass, and the end-to-end scenarios TS-001 to TS-003 pass.
- **Conditional Go:** no open Critical defects, Major defects have an accepted workaround, and TS-001 passes.
- **No-Go:** any open Critical defect, or TS-001 fails.

## 12. Suspension and resumption criteria

**Suspend** execution (write a handoff with status Blocked) when:
- the API or client cannot start, or `/api/health` fails;
- sign-in fails for two or more roles;
- data needed by the remaining chain is corrupted or missing and cannot be recreated through the UI;
- a step would require a destructive action, a code or configuration change, or a Microsoft account.

**Resume** when the user confirms the cause is resolved. A resumed run uses a new run ID (`RUN-<YYYYMMDD>-<NN+1>`); cases already executed are not re-run unless the user asks for a retest.

## 13. Test data strategy

- Base data comes from `npm run seed:uat`: five role accounts, 15 companies, customers, suppliers, three drivers and three assistants, one completed delivery with a stored photo, and one assigned demo run per category for the Driver "John Doe" dated the seed day.
- Every record a case creates uses a unique reference with the run prefix, e.g. `UAT-<RUN>-DEL-01`, so runs never collide and evidence is traceable.
- Exact input values are in `02-test-design/test-data.md`; cases refer to them by key (e.g. `D-DEL-01`).
- No real customer data, real credentials or secrets are used or recorded.

## 14. Defect severity and priority

| Severity | Definition | Example |
|---|---|---|
| Critical | A core workflow cannot be completed, data is lost or corrupted, or a role can read or change data it must not access | Driver cannot mark any run Delivered; TASS can edit Deliveries |
| Major | A workflow step fails or gives a wrong result but a workaround exists, or a business rule is not enforced | Draft can be submitted by the wrong role; request hangs with no response |
| Minor | Incorrect message, label, count or cosmetic behaviour that does not change the outcome | Dashboard count includes records the role cannot open |
| Trivial | Typo or visual polish | Misaligned icon |

| Priority | Meaning |
|---|---|
| P1 | Must be resolved before go-live |
| P2 | Should be resolved before go-live |
| P3 | Can follow go-live |
| P4 | Nice to have |

Codex proposes severity and priority; the user may change them.

## 15. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Date-sensitive rules (future-dated runs read-only, overdue days, "today" dashboards) depend on the Manila calendar day | False failures if run across midnight | Run Driver and dashboard cases on the seed day; record Manila time on each case |
| Chained cases: one failure blocks later ones | Many Blocked cases | Each case lists dependencies; Codex may create replacement data through the UI (never the database) and must say so |
| UI labels were read from the client source code; a label may differ slightly at run time | Steps cannot be followed literally | Codex follows the intent, records the deviation in the execution log, and logs a Trivial defect only if the label is wrong against the spec |
| Rate limiting (5 failed logins per account per 15 minutes) | Locks a test account | Brute-force case uses a dedicated account created in TC-ADM; never the shared role accounts |
| Session or CSRF token handling in API steps | False 403s | AGENTS.md explains how to read the `X-CSRF-Token` header |
| Destructive commands | Data loss | Constraint: never run reset/seed/db commands without the user's approval for that run |

## 16. Deliverables

| Deliverable | Producer | Location |
|---|---|---|
| Discovery, plan, scenarios, cases, data, traceability, templates, HO-001 | Claude Code | `00-discovery/`, `01-plan/`, `02-test-design/`, `templates/`, `03-handoffs/` |
| Execution logs | Codex | `04-execution/RUN-<YYYYMMDD>-<NN>/` |
| Defect reports | Codex | `05-defects/` |
| Evidence | Codex | `artifacts/RUN-<YYYYMMDD>-<NN>/` |
| Evidence-capture Playwright scripts | Codex | `e2e/` |
| UAT summary report | Codex | `06-reports/` |
| Handoffs | Both agents | `03-handoffs/` |

## 17. Sign-off

| Role | Name | Decision | Date | Signature |
|---|---|---|---|---|
| Test designer | Claude Code | Plan issued | 2026-10-14 | n/a |
| Test executor | ChatGPT Codex | Plan acknowledged | | n/a |
| UAT sign-off authority | (user) | Plan approved | | |
