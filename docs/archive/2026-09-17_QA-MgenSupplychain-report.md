# QA & Test Plan Report

**Project:** Microgenesis Supply Chain Portal (MgenSupplychain)  
**Date:** 2026-09-17  
**Type:** Quality Assurance & Testing Analysis

---

## 1. Executive Summary

A comprehensive Quality Assurance (QA) audit was performed on the `MgenSupplychain` project codebase. The audit evaluated test coverage, quality gates, static analysis, and Continuous Integration (CI) readiness.

**Finding:** The project currently operates as an untested monolith. There are no automated testing frameworks configured, resulting in **0% code coverage** across Unit, Integration, and End-to-End (E2E) layers. 

To ensure stability and prevent regressions in production, a testing strategy must be immediately adopted using Vitest (for Unit/Integration) and Playwright (for E2E).

---

## 2. Current QA Status (Testing Pyramid)

| Testing Layer | Status | Findings | Risk Level |
|---------------|--------|----------|------------|
| **Unit Tests** | ❌ Missing | Zero `*.test.ts` or `*.spec.ts` files found. No frameworks (Jest/Vitest) installed. | **High** |
| **Integration** | ❌ Missing | No backend tests for Node/Express API routes (`server/src/routes/`). | **High** |
| **E2E / UI** | ❌ Missing | No browser automation tools (Playwright/Cypress) configured. | **Critical** |

### Quality Gates Checklist
- ❌ **Linting & Formatting:** No `eslint` or `prettier` configured.
- ❌ **Type Safety:** Excessive use of `any` types throughout both `client/` and `server/`.
- ✅ **Static Type Checking:** Passed. `tsc --noEmit` is configured as a `lint` script.
- ❌ **CI/CD Automation:** No automated pull request validation pipelines (e.g., GitHub Actions).

---

## 3. Recommended Testing Strategy & Implementation Plan

### Phase 1: Static Analysis & Quality Gates
Before writing tests, the codebase must be structurally sound.
1. **Install ESLint and Prettier** to enforce consistent code style and remove syntax anomalies.
2. **Strict TypeScript:** Progressively replace `@ts-ignore` and `any` types in `server/src/routes/` and `client/src/components/` with strict interfaces from Prisma and Zod.
3. **CI Pipeline:** Create a `.github/workflows/main.yml` to run `npm run lint` and `tsc` on every pull request.

### Phase 2: Unit Testing (Vitest)
Vitest is recommended due to existing Vite usage on the frontend.
**Target Areas:**
- **Backend Utilities:** `server/src/services/` (e.g., `mailer.ts`, `audit.ts`, `inAppNotify.ts`).
- **Frontend Utilities:** `client/src/utils/` (e.g., `export.ts`, `routeSlip.ts`).
- **Mocking:** Use `vitest-mock-extended` to mock the Prisma database client so utility logic can be tested without a live SQLite database.

### Phase 3: Integration Testing
**Target Areas:**
- Express API endpoints in `server/src/routes/`.
- Spin up a test database (`test.db`) and use `supertest` to validate API HTTP responses (e.g., `GET /api/records`, `POST /api/records`).

### Phase 4: End-to-End (E2E) Testing (Playwright)
Playwright is recommended for browser automation to test critical user flows.

---

## 4. Priority Test Cases

The following test cases represent the critical path of the application and should be automated first via E2E/Integration tests.

### Test Case 1: Role-Based Access Control (RBAC) Verification
**Description:** Verify that users are restricted to their authorized views.
- **Pre-condition:** Seed database with `SALES_COORDINATOR`, `LOGISTICS`, `TASS`, and `ADMIN` users.
- **Action 1:** Login as `SALES_COORDINATOR`.
- **Expected 1:** Main Dashboard and Deliveries views are accessible. Admin Panel is hidden.
- **Action 2:** Attempt to directly navigate to `/admin`.
- **Expected 2:** User is redirected or shown an "Access Denied" component.

### Test Case 2: Delivery Record Creation Flow
**Description:** Verify that a Sales Coordinator can successfully create a new Delivery Record.
- **Pre-condition:** Logged in as `SALES_COORDINATOR`.
- **Action:** Navigate to Deliveries, click "Create Record", fill in mandatory fields (Company, Priority, Delivery Date, Items), and submit.
- **Expected:** API returns 201 Created. The new record appears at the top of the Delivery table. An audit log entry is recorded as `CREATE`.

### Test Case 3: Status Transition Logic (Logistics)
**Description:** Verify that Logistics can update the status of a scheduled delivery.
- **Pre-condition:** Logged in as `LOGISTICS`. Database has a `SCHEDULED` record.
- **Action:** Open record details, assign a Driver (`driver_board` screen), and change status to `PENDING`.
- **Expected:** Status successfully updates. Audit log records the `UPDATE`. Notification badge increments for involved parties.

### Test Case 4: Data Sampler Reset Safety (Admin)
**Description:** Verify the `dev.ts` or `data-sampler.ts` reset mechanisms work without corrupting the database state.
- **Pre-condition:** Logged in as `ADMIN`.
- **Action:** Generate 50 sample records, then hit the "Reset Demo Data" action.
- **Expected:** All 50 transactional records are wiped, but the core 4 users and Companies remain intact. System stabilizes gracefully.
