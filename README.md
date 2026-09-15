# Microgenesis Supply Chain Portal

A full-stack replacement for **Microgenesis Business Systems'** internal Supply Chain System — previously a SharePoint List-based tracker.

> **Status:** Full-stack application, deployed to Render as a single service (`render.yaml`). Delivery records, companies, customers, suppliers, drivers, users/auth, and the SKU Master all run on a real Express + Prisma + **PostgreSQL** backend (`server/`) with JWT-cookie login and server-enforced RBAC across **five roles** (Sales Coordinator, Logistics, TASS, Admin, and **Driver**) — see [Full-Stack Setup](#full-stack-setup) below. Login also supports **Microsoft Azure AD single sign-on** alongside email+password, real outbound email via **Microsoft Graph** (with SMTP/console-log fallbacks), and an optional **Microsoft Teams tab app** packaging — see [Authentication & Microsoft 365 Integration](#authentication--microsoft-365-integration).

This document is written for two audiences at once: engineers who need to run, extend, or evaluate the codebase, and stakeholders who want to understand *why* the system is built the way it is and what it replaces. Wherever a feature is described, the intent is to answer not just "what does this do" but "what business problem does this solve, and for whom."

> **New to this project?** Start with [`GETTING_STARTED.md`](./GETTING_STARTED.md) for step-by-step local setup, and read [`DONT_BREAK_THIS.md`](./DONT_BREAK_THIS.md) before making changes — it covers the handful of things in this codebase that look editable but will quietly break something if changed without context. Unfamiliar terms (TASS, RMA, SKU, migration, etc.) are defined in [`docs/GLOSSARY.md`](./docs/GLOSSARY.md).

## Table of Contents

- **[Getting Started (step-by-step for newcomers)](./GETTING_STARTED.md)**
- **[Don't Break This (read before making changes)](./DONT_BREAK_THIS.md)**
- **[Glossary](./docs/GLOSSARY.md)** · **[Roles & Permissions detail](./docs/ROLES.md)**
- [Full-Stack Setup](#full-stack-setup)
- [Background](#background)
- [System Architecture](#system-architecture)
- [Features](#features)
- [Roles & Permissions (RBAC)](#roles--permissions-rbac)
- [Authentication & Microsoft 365 Integration](#authentication--microsoft-365-integration)
- [Microsoft Teams Integration](#microsoft-teams-integration)
- [Logistics Operations](#logistics-operations)
- [Dashboard](#dashboard)
- [Inventory](#inventory)
- [Exporting System](#exporting-system)
- [Notifications](#notifications)
- [Output Actions](#output-actions)
- [Audit Logs](#audit-logs)
- [Statistical Reports](#statistical-reports)
- [Admin Panel](#admin-panel)
- [Tech Stack](#tech-stack)
- [Database Architecture](#database-architecture)
- [Backend API](#backend-api)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Data & Persistence](#data--persistence)
- [Deployment](#deployment)
- [Known Limitations](#known-limitations)

## Full-Stack Setup

This app is two separate processes in local dev:

1. **Backend** (`server/`) — Express + Prisma + PostgreSQL, JWT auth in an httpOnly cookie, runs on port 4000.
2. **Frontend** (this directory) — Vite + React, runs on port 3000 and proxies `/api/*` to the backend (see `vite.config.ts`), so the session cookie stays same-origin.

```bash
# Terminal 1 - backend (start this first)
cd server
npm install
cp .env.example .env          # fill in a PostgreSQL DATABASE_URL + JWT_SECRET (see Environment Variables)
npx prisma migrate dev        # applies the schema to your Postgres database
npm run seed                  # loads demo users, companies, customers, and delivery records
npm run dev                   # http://localhost:4000

# Terminal 2 - frontend
npm install
npm run dev                   # http://localhost:3000
```

Open `http://localhost:3000` and log in with one of the seeded accounts (also shown on the login screen):

| Email | Password | Role |
|---|---|---|
| sales@microgenesis.com | password123 | Sales Coordinator |
| logistics@microgenesis.com | password123 | Logistics |
| tass@microgenesis.com | password123 | TASS |
| admin@microgenesis.com | admin123 | Admin |

> There is no seeded Driver account by default — an Admin creates Driver logins through **Admin Panel → Users** (or `POST /api/users`) once the app is running. See [Roles & Permissions](#roles--permissions-rbac) for what the Driver role sees.

The **Sign in with Microsoft** button is always visible on the login screen — without `AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET` set, clicking it shows a clear error and expands the email-login form above, rather than failing silently. See [Authentication & Microsoft 365 Integration](#authentication--microsoft-365-integration) for the full SSO flow and how to configure it.

See `server/src/index.ts` and `server/.env.example` for backend configuration details. Production runs on Render with a managed Postgres instance — see [Deployment](#deployment) and `render.yaml`.

## Background

The existing AS-IS system is a Microsoft SharePoint List that Microgenesis uses to track deliveries, returns, collections, and pick-ups. It has three confirmed pain points this portal is designed to fix — the first two came up repeatedly as direct user complaints, not just an engineering assessment:

1. **No audit trail — by far the most frequent user complaint.** The SharePoint list has no reliable "who created / who last modified" record on individual entries. Users repeatedly reported that when a delivery date changed or a status was disputed, there was simply no way to answer "who did this, and when" without manually asking around the office. This portal replaces that with a real, structured `AuditLog` on every tracked record — see [Audit Logs](#audit-logs) below, including a **Status Trail export** that directly answers the specific ask Logistics raised: seeing a record counted under *every* status it ever passed through (e.g. Pending → Scheduled), not just its current one.
2. **Free-text data entry** — fields like Company Name and Area are typed manually, causing inconsistent/duplicate values ("Microgenesis Inc." vs. "MG Inc" vs. "microgenesis"), which in turn breaks any attempt at reliable filtering, reporting, or trend analysis.
3. **A hard record-count ceiling — solved in this system, not just mitigated.** SharePoint's list view threshold (5,000 items) blocks the view once exceeded, requiring a support ticket to keep working — a genuine, recurring operational stoppage for an operation logging deliveries, collections, and pickups daily. The new portal is backed by a real PostgreSQL table instead of a SharePoint list view, which has **no equivalent item-count ceiling**: there is no 5,000-row wall to hit, no support ticket required, and no view that silently stops showing data as the operation grows. See [Dashboard](#dashboard) for the live, uncapped record count.

Each of these pain points maps directly onto a subsystem documented below: audit trail → [Audit Logs](#audit-logs), free-text entry → validated lookups and master data tables ([Database Architecture](#database-architecture)), and the record ceiling → a Postgres-backed record table with no artificial view limit ([Dashboard](#dashboard)).

The portal models the real AS-IS data as **one unified delivery/task record list** (the `DeliveryRecord` model), where a `category` field distinguishes the type of work — **Sales Orders, Deliveries, RMA, Accounting Collection, Procurement Pick-up**. Most of the sidebar's record screens are simply filtered views over that same underlying table, not separate business objects. This mirrors how the business actually thinks about the work: it is all "a record that needs to move through a lifecycle," just with different terminology and a different owning department depending on category. Alongside it, the portal has grown a real **SKU Master / inventory** subsystem and master-data directories (Companies, Customers, Suppliers, Drivers) that are genuinely backed by their own Postgres tables — this is no longer a delivery-tracker prototype only, it is the operational system of record for logistics, inventory, and collections at Microgenesis.

## System Architecture

The application is split into two independently deployable layers that share a single Postgres database as the source of truth.

**Frontend/backend separation.** The frontend (`src/`) is a React 19 + TypeScript single-page application built with Vite; it owns no persistent state of its own beyond in-memory React state and a thin `localStorage` layer (`persistence.ts`) that is now largely vestigial, since nearly all data is fetched from and written back to the Express API. The backend (`server/`) is a standalone Express + TypeScript + Prisma service that owns all reads/writes to Postgres, all authentication, and all authorization decisions. In local development these run as two processes on two ports, with Vite proxying `/api/*` calls so the session cookie stays same-origin; in production they collapse into a single Node process, with Express serving the built frontend assets alongside the API (`server/src/index.ts`).

This separation exists so that **authorization cannot be bypassed by talking to the API directly**. The frontend's role-scoped navigation is a UX convenience, not a security boundary — every meaningful read or write is re-checked server-side by `requireAuth`/`requireRole` middleware (see [Roles & Permissions](#roles--permissions-rbac)). A user cannot get data for a screen they are not permitted to see just because they know the endpoint.

**Shared utilities and reusable components.** Both layers centralize cross-cutting logic instead of duplicating it per feature:
- On the frontend, `src/data.ts` holds shared lookup lists (areas, vehicles, area hierarchy) consumed by both record-creation forms and every export module, so a dropdown option and its exported spelling can never drift apart. `src/utils/export.ts` is a single export engine reused by every record list's export menu, rather than each module hand-rolling its own CSV/Excel/PDF writer. `OutputActionsPanel.tsx` and `ComboboxField.tsx` are reusable UI primitives shared across the delivery, RMA, procurement, and accounting collection workspaces, since those four modules are really the same record shape with different framing.
- On the backend, `services/audit.ts` and `services/inAppNotify.ts` are the single choke points through which audit rows and in-app notifications get written, so that no route handler can silently skip logging a change. `mappings.ts` is the single source of truth for translating the plain-string values stored in Postgres (status, category, role, etc.) into the display strings the UI shows, so a renamed status can't drift between what's stored and what's rendered.

**Service-oriented backend.** Route handlers in `server/src/routes/` stay thin: they authenticate, authorize, validate input shape, and delegate side effects (audit logging, notification fan-out, outbound email) to dedicated service modules in `server/src/services/`. This keeps business rules like "every accomplished delivery must trigger a notification" in one place rather than copy-pasted across every route that can change a record's status.

**Scalability considerations.** The data model deliberately keeps `DeliveryRecord` as one wide table with a `category` discriminator rather than five separate tables, so that cross-category reporting, search, and the "All Operations" export don't require unioning multiple schemas. Historical/statistical reporting reads from a pre-aggregated `DailyStatusSnapshot` rollup table instead of scanning the full `DeliveryRecord` table on every dashboard load, which keeps report queries fast as record volume grows — directly addressing the SharePoint list-threshold failure mode by design rather than by luck.

## Features

- **Branding** — Microgenesis logo, navy (`#1F3864`) / blue (`#0078C1`) palette applied consistently across sidebar, headers, primary actions, and exported documents.
- **Role-scoped sidebar navigation**, driven per-user by a role default plus optional per-screen overrides (see [Roles & Permissions](#roles--permissions-rbac)): Dashboard, Deliveries, RMA, Accounting Collection, Procurement Pick-up, Sales Orders (deep-link only, no dedicated sidebar item), Customers, Suppliers, SKU Master / Inventory, Transactions, Driver Dispatch Board, Driver Board (Kanban), Delivery Calendar, Driver Manager, AM Directory, Status History, Statistical Reports, Admin Panel, and (Admin only) Data Sampler.
- **Per-record audit trail** — delivery records and SKUs show `Created By` / `Modified By` with timestamps, backed by a central `AuditLog` table; a separate append-only `RemarkLog` keeps a full history of remarks per record (contexts: `CREATION`, `GENERAL_EDIT`, `DRIVER_UPDATE`, `STATUS_CHANGE`). See [Audit Logs](#audit-logs).
- **Validated lookups** — Company, Area, Priority, Category, Vehicle, Driver, and Account Manager are dropdowns backed by master data, not free text, directly eliminating the duplicate/inconsistent-value problem that plagued the SharePoint list.
- **Auto Fill on record creation** — create-record forms (Deliveries/RMA/Procurement Pick-up/Sales Orders/Accounting Collection) each have an "Auto Fill" button that populates every field with realistic, category-appropriate demo data for fast demoing.
- **Role-based views**, including a dedicated full-screen mobile-style app for the **Driver** role (`DriverDashboard.tsx`), separate from the sidebar shell every other role sees — see [Roles & Permissions](#roles--permissions-rbac).
- **Logistics Dispatch Board** (`DriverView.tsx`) — a phone-mockup simulation of what each driver sees in the field. Unassigned records are grouped by category in a searchable dropdown (`DispatchBoardSelector.tsx`). Actions taken here on behalf of a driver are still logged against the acting Logistics account, keeping the audit trail traceable. See [Logistics Operations](#logistics-operations).
- **Driver Board** (`DriverBoard.tsx`) — a Kanban-style board view of records by status, and a **Delivery Calendar** (`DeliveryCalendar.tsx`) for date-based scheduling views.
- **Driver directory management** (`DriverManagerView.tsx` + `Driver` table) — CRUD over real driver/assistant records (`type`: `DRIVER` or `ASSISTANT`), each with coverage areas and an active flag, replacing what used to be a hardcoded array in `src/data.ts`.
- **Customers & Suppliers directories** — both are real backend-served master-data tables (`Customer`, `Supplier`) with their own workspace/detail views (`CustomerWorkspace.tsx`, `SupplierWorkspace.tsx`); Suppliers additionally carry a `category` (Hardware, Consumables, Electronics, Packaging, Services) used for Procurement Pick-up context.
- **SKU Master & Inventory** — `Product` / `InventoryItem` / `InventoryTransaction` tables track SKU code, category (A/B/C), unit cost/price, reorder point, warehouse bin location, on-hand/allocated quantity, and a full transaction ledger (`Goods Receipt`, `Sale`, `Adjustment`, `Transfer`) viewable in `TransactionCenter.tsx` / `TransactionDetail.tsx`. See [Inventory](#inventory).
- **Linked collections** — an Accounting Collection record can be linked back to the delivery record(s) that generated it (`linkedCollectionId`, a self-relation on `DeliveryRecord`), so billing can be traced to the original fulfillment.
- **Per-user granular permissions** — beyond each role's default screen set, an Admin can grant or revoke access to individual screens for a specific user (`UserPermission` table, managed from Admin Panel or `GET/PUT /api/users/:id/permissions`).
- **Microsoft Azure AD single sign-on** — a "Sign in with Microsoft" button always visible on the login screen alongside email+password, backed by a real OAuth 2.0 authorization-code flow (`@azure/msal-node`), with auto-provisioning of new users and account linking via a `microsoftOid` field on `User`. See [Authentication & Microsoft 365 Integration](#authentication--microsoft-365-integration).
- **Real outbound email** — a unified mailer (`server/src/services/mailer.ts`) that sends through **Microsoft Graph** when Azure credentials are configured, falls back to **SMTP**, and falls back again to a console-logged mock if neither is set — so the app behaves the same in every environment, just with a different delivery method. See [Authentication & Microsoft 365 Integration](#authentication--microsoft-365-integration).
- **Microsoft Teams tab app packaging** — a Teams v1.17 app manifest, icons, and a build script (`teams/`) for embedding the portal as a Teams tab with SSO. See [Microsoft Teams Integration](#microsoft-teams-integration).
- **Admin integration diagnostics** — an Admin Panel tab showing live Azure SSO / email-delivery configuration status, Microsoft-linked user counts, and a one-click test-email sender, so an Admin can verify integrations without reading server logs. See [Admin Panel](#admin-panel).
- **In-app notifications** — a notification bell (`NotificationBell.tsx`) backed by a `Notification` table, plus a separate `NotificationLog` audit trail of trigger events (title/message, recipient, send status) distinct from the in-app bell. See [Notifications](#notifications).
- **IPO-style configurable Output Actions** — six process-output trigger events, each with independently configurable output channels, dispatching real outbound email through the unified mailer. See [Output Actions](#output-actions).
- **CSV / Excel / PDF / Word export**, shared across record modules, with dedicated driver reports, route slips, and a cross-category "All Operations" export. See [Exporting System](#exporting-system).
- **Reports** — `StatisticalReportView.tsx` and the `reports.ts` API surface trend data drawn from a `DailyStatusSnapshot` daily rollup table. See [Statistical Reports](#statistical-reports).
- **Global Search** (`GlobalSearch.tsx`) — search across records from anywhere in the app.
- **Data Sampler** (Admin only) — generates realistic demo records per module with human-readable `REC-XXXXX` IDs, plus a Reset control with two modes: **Full Reset** (wipes transactional data, keeps users/master data) or **Reset to Seed Data** (full wipe + re-seed, which logs everyone out).
- **Admin Panel** — user management (list/create/edit/deactivate/activate, per-user permission overrides, Microsoft-linked auth badge), a system-wide audit log viewer, and an Integrations tab (Azure SSO / email status, test email), gated to the `Admin` role both in the UI and on every backend route. See [Admin Panel](#admin-panel).
- **No record-volume cap** — the dashboard shows a live record count with no artificial data-entry block, addressing the SharePoint list-threshold pain point directly.
- **Deep-linkable flagged records** — the Dashboard's "Needs Attention" panel and the Dispatch Board's unassigned-driver list are clickable, jumping straight to the record's detail drawer regardless of category.
- **Server-backed, reload-safe** — nearly all data (delivery records, companies, customers, suppliers, drivers, users, SKU/inventory) lives server-side in PostgreSQL; multiple browsers/users share the same data and see each other's changes on refresh.

## Roles & Permissions (RBAC)

Access is real, server-enforced role-based access control tied to a login — the frontend UI reflects the same rules the backend enforces on every request (`requireAuth` + `requireRole(...)` in `server/src/middleware/auth.ts`). There are **five** roles: `SALES_COORDINATOR`, `LOGISTICS`, `TASS`, `ADMIN`, `DRIVER`. Each role gets a default set of accessible screens (`DEFAULT_ROLE_SCOPE` in `src/App.tsx`); an Admin can additionally grant or revoke individual screens per user.

RBAC exists because different departments have different responsibilities and different blast radii if they make a mistake — a Sales Coordinator entering a wrong delivery date is a data-entry error, but marking a delivery "Accomplished" without it happening is a billing and customer-trust problem. The software enforces the same separation of duties the business expects on paper: record *creation* (Sales Coordinator) is separated from *dispatch execution* (Logistics/Driver) and from *collection verification* (TASS exclusively).

> **⚠️ TASS is provisional.** `TASS` = **Technical Admin System Services**, not Accounting or Finance. Its permissions below are this project's current best-guess implementation, made **before** a stakeholder meeting with the TASS department — treat them as unconfirmed and subject to change.

**For the full permissions table (who can do what, screen by screen) and the TASS status tracker, see [`docs/ROLES.md`](./docs/ROLES.md).**

## Authentication & Microsoft 365 Integration

### Overview

Login supports two paths side by side, both landing in the same session-cookie/RBAC system described above: **email + password** (the original path, still fully supported) and **Microsoft Azure AD single sign-on** via an OAuth 2.0 authorization-code flow. The "Sign in with Microsoft" button is always visible on the login screen — it does not depend on Azure being configured, and if it isn't, clicking it surfaces a clear inline error and expands the email form instead of silently failing or flickering.

Once a user is authenticated by either path, outbound email (delivery notifications, the daily 4 PM logistics/AM alert, the weekly report, Output Action notifications) all flow through a single unified mailer with a three-tier fallback chain: **Microsoft Graph → SMTP → console-logged mock**. This means the exact same application code runs unmodified whether the deployment has full Microsoft 365 integration configured, only SMTP, or neither.

### Why it Matters

Microgenesis staff already have Microsoft 365 accounts for email and Teams; requiring a second, separate password for this portal is friction with no security benefit, and it means account lifecycle (a staff member leaving the company) has to be managed in two places instead of one. Real outbound email — as opposed to a mock console log — is what actually makes the Output Actions and daily alert system useful in production rather than just a demo of the UX.

### Business Benefits

- **Single sign-on convenience** — staff sign in with the Microsoft account they already use for Outlook/Teams; no separate password to remember or reset.
- **Centralized account lifecycle** — deactivating a user's Microsoft 365 account is enough to keep them out day-to-day (their portal session still expires on its normal 8-hour JWT schedule); an Admin can also deactivate the linked portal account directly from the Admin Panel.
- **Real notification delivery** — once Azure or SMTP credentials are configured, every Output Action email, the 4 PM logistics/AM reminder, and the weekly Logistics/Admin report are genuinely delivered, not just logged to a server console.
- **Zero-downtime rollout** — because the mailer and login both silently fall back (SSO button still works for email login when Azure isn't configured; email falls back to SMTP, then to a mock), this can be deployed and tested before Azure credentials exist, and Azure can be added later without a code change.

### How Sign-In Works

1. User clicks **Sign in with Microsoft** on the login screen (`LoginView.tsx`).
2. Frontend calls `POST /api/auth/microsoft`; if Azure isn't configured, the backend returns a `501` with a clear error, which the frontend shows inline and uses to expand the email-login form — the button itself never disappears.
3. If configured, the backend builds an MSAL (`@azure/msal-node`) authorization URL and the browser is redirected to Microsoft's login page.
4. Microsoft redirects back to `GET /api/auth/microsoft/callback` with an authorization code.
5. The backend exchanges the code for an ID token, reads the `oid` (object ID), `email`, and `name` claims, and looks up an existing user — **preferring a `microsoftOid` match, falling back to an email match** — so a user who already had an email+password account before SSO was enabled gets linked to their Microsoft identity automatically on first SSO login rather than getting a duplicate account.
6. If no matching user exists, one is auto-created with role `SALES_COORDINATOR`, a random (unusable, never surfaced) password, and `isActive: true`.
7. If the matched or created user is deactivated, the callback redirects back to the login page with an `account_deactivated` error instead of issuing a session.
8. A signed session JWT is set in the same `mg_session` httpOnly cookie used by email+password login — from this point on, SSO and email-login sessions are indistinguishable to every other part of the app.

### Cookie Hardening for Teams/Iframe Contexts

`setSessionCookie` (`server/src/middleware/auth.ts`) sets `secure: true` and `sameSite: 'none'` when `NODE_ENV=production`, and `sameSite: 'lax'` in local dev. This is specifically required for the portal to work when embedded in an iframe — such as a Microsoft Teams tab (see [Microsoft Teams Integration](#microsoft-teams-integration)) — since browsers block same-site-lax cookies in a cross-site iframe context.

### Email Delivery Chain

`server/src/services/mailer.ts` exposes a single `sendEmail({ to, subject, text, html? })` entry point used by every code path that sends outbound mail (the 4 PM/weekly scheduled jobs in `index.ts`, the Output Actions email endpoint in `notifications.ts`, the Accomplished-trigger notifier in `notify.ts`, and the Admin Panel's test-email button). It picks a delivery method automatically:

1. **Microsoft Graph** — used when `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and `AZURE_TENANT_ID` are all set. Authenticates via `@azure/identity`'s `ClientSecretCredential` and sends through the Graph API's `/users/{from}/sendMail`, requiring the Azure app registration to have `Mail.Send` application permission with admin consent.
2. **SMTP** — used when Graph isn't configured but `SMTP_HOST` is set, via `nodemailer`.
3. **Mock (console log)** — the default when neither is configured; the full email content is logged to the server console instead of sent, so the rest of the app behaves identically in an unconfigured environment.

Every send returns a `{ ok, method, error? }` result, and callers that write to `NotificationLog` record the real outcome — `SENT` for Graph/SMTP, `MOCKED` only when the mailer genuinely fell back to console-only delivery, `FAILED` on error — so the audit trail never overstates what actually happened.

### Admin Diagnostics

`GET /api/admin/integration-status` (Admin only) reports whether Azure SSO is configured (and its tenant/redirect URI), which email method is currently active, and how many users are Microsoft-linked vs. email-only — surfaced in the Admin Panel's **Integrations** tab (see [Admin Panel](#admin-panel)). `POST /api/admin/test-email` sends a real test email through the same `sendEmail()` path and reports which method handled it, so an Admin can confirm end-to-end delivery without needing server console/log access.

### Technical Highlights

New users created via SSO get role `SALES_COORDINATOR` by default — the same default role a brand-new manually-created account would need explicitly assigned, keeping the auto-provisioning path's blast radius equivalent to the lowest-privilege manual path. The `User.microsoftOid` column is unique and nullable, so email-only accounts are entirely unaffected by SSO being enabled or disabled. `getMsalConfig()` (`server/src/routes/auth.ts`) is the single source of truth for whether Azure is "configured" — checked by the auth routes, the `/microsoft/status` endpoint, and the admin diagnostics endpoint — so there is exactly one place that decides whether SSO is available.

## Microsoft Teams Integration

### Overview

The `teams/` directory packages the portal as a Microsoft Teams tab app: a manifest (`teams/manifest.json`), color/outline icons, a build script (`teams/build.sh`) that fills in deployment-specific placeholders and produces an upload-ready zip, and a step-by-step setup guide (`teams/README.md`) covering the Azure AD app registration required for Teams SSO.

### Why it Matters

Staff already live in Microsoft Teams throughout the day; a portal that's one more browser tab to remember to open is a portal that gets checked less often than one pinned directly in Teams. Packaging the app as a Teams tab, rather than asking IT to build a separate Teams integration from scratch, means the same Azure AD app registration used for browser SSO (see [Authentication & Microsoft 365 Integration](#authentication--microsoft-365-integration)) also powers the Teams tab's identity.

### How It's Packaged

The manifest defines both a **static personal tab** (pinned to a user's own Teams sidebar) and a **configurable tab** (added inside a Team or group chat), both pointing at the deployed portal URL with a `?teams=1` query flag. Three placeholders — `{{AZURE_CLIENT_ID}}`, `{{APP_URL}}`, `{{APP_DOMAIN}}` — must be resolved before the manifest can be uploaded; `teams/build.sh` handles this by reading the values from environment variables or a gitignored `teams/.env` file, writing a `manifest.filled.json` (the tracked `manifest.json` template is never modified), and zipping it together with both icons under the exact filename Teams requires (`manifest.json` inside the zip). The script prefers the standard `zip` CLI and falls back to PowerShell's `Compress-Archive` when `zip` isn't on `PATH` (e.g. some Windows Git Bash setups).

### Setup

**Full step-by-step instructions, including the Azure AD app registration (redirect URIs, API permissions, Application ID URI, authorized Teams client IDs), live in [`teams/README.md`](./teams/README.md).** In summary: register (or reuse) an Azure AD app, add the Teams-specific redirect URI and API exposure, set the same `AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`/`AZURE_TENANT_ID`/`APP_URL` environment variables used for browser SSO (see [Environment Variables](#environment-variables)), run `teams/build.sh` to produce the zip, and upload it in **Teams Admin Center → Manage apps → Upload custom app**.

### Technical Highlights

Because the Teams tab and the browser login share one Azure AD app registration and one session-cookie mechanism, there is no separate "Teams identity" to keep in sync — a user's portal account, permissions, and audit trail are identical whether they open the portal in a browser tab or a Teams tab. The cookie hardening described in [Authentication & Microsoft 365 Integration](#authentication--microsoft-365-integration) exists specifically to make the Teams iframe embedding work; without `sameSite: 'none'; Secure`, the session cookie would be silently dropped inside the Teams client.

## Logistics Operations

### Overview

Logistics Operations is the set of modules that coordinate how a scheduled record actually gets executed in the field: assigning a driver and vehicle, tracking status as work progresses, and giving both dispatchers and drivers a live view of the day's workload. It spans the Dispatch Board, the Driver Board, the Delivery Calendar, the Driver directory, and — for the Driver role specifically — a standalone mobile-style dashboard.

### Why it Matters

On the old SharePoint list, "who is doing this delivery today" lived in whatever the last edited cell said, with no structured assignment step and no dedicated view for a dispatcher to see the whole day's unassigned work at a glance. Logistics needed a purpose-built coordination surface, not a spreadsheet row.

### Business Benefits

Centralizing dispatch into a small number of purpose-built views reduces the time Logistics spends hunting for "what's still unassigned today," cuts down on double-booking a driver, and creates a durable record of who assigned what and when — because every action taken on behalf of a driver from the Dispatch Board is still attributed and audited to the acting Logistics user, preserving accountability even when Logistics is acting on a driver's behalf.

### Department Impact

- **Logistics** — owns the Dispatch Board, Driver Board, Calendar, and Driver Manager; assigns drivers/vehicles and progresses record status.
- **Drivers** — see only their own assigned records, either through Logistics acting on their behalf via the Dispatch Board, or directly by logging into their own `DriverDashboard`.
- **Admin** — has full visibility into the same dispatch tooling as Logistics, for oversight and backup coverage.
- **Sales Coordinator / TASS** — do not participate in dispatch; their involvement ends at record creation and collection verification respectively.

### Operational Workflow

1. A record is created (by Sales Coordinator) with status effectively unassigned/scheduled.
2. Logistics opens the **Dispatch Board** (`DriverView.tsx`), a phone-mockup simulation of each driver's device. Unassigned records are grouped by category in a searchable dropdown (`DispatchBoardSelector.tsx`), letting a dispatcher jump straight to any pending record regardless of which module it lives under.
3. Logistics assigns a driver, assistant(s), and vehicle, and the record enters the field-execution phase.
4. Status progresses — `SCHEDULED → ACCOMPLISHED / ON_HOLD / RESCHEDULED / PENDING` — visible on the **Driver Board** (`DriverBoard.tsx`), a Kanban-style board grouped by current status, and on the **Delivery Calendar** (`DeliveryCalendar.tsx`) for date-based scheduling views.
5. If the record is an Accounting Collection, once delivery is accomplished it can be picked up by TASS for the separate collection-verification step, with `linkedCollectionId` tracing the collection back to its originating delivery.
6. A Driver logging in directly sees only their own assigned records in the dedicated `DriverDashboard` app — a full-screen, sidebar-free experience distinct from every other role's shell, reflecting that a driver in the field needs a simple mobile-first task list, not an administrative console.

### Technical Highlights

The **Driver directory** (`DriverManagerView.tsx` + `Driver` model: `type` DRIVER/ASSISTANT, JSON `coverageAreas`, `isActive`) replaced a formerly hardcoded array in `src/data.ts`, making driver rosters editable without a code deploy. Status changes go through `PATCH /api/records/:id/status`, gated to the same five roles as full edit, but the frontend further restricts the *status control itself* to Logistics, Admin, and Driver-on-own-records (Sales Coordinator and TASS see status read-only), enforcing the segregation-of-duties split described in [Roles & Permissions](#roles--permissions-rbac).

## Dashboard

### Overview

The Dashboard (`DashboardView.tsx`) is the role-scoped landing screen that surfaces KPIs, charts, and flagged records without requiring a user to go hunting through individual modules. It dispatches to per-role variants — `LogisticsDashboard.tsx`, `TassDashboard.tsx`, `AdminDashboard.tsx`, and a standalone `DriverDashboard.tsx` — each tuned to what that department actually needs to see first thing.

### Why it Matters

Different departments need different at-a-glance answers: Sales Coordinator wants to know how many records are scheduled, pending a driver, on hold, or rescheduled today; Logistics and TASS care more about inventory and fulfillment status; Admin needs the full picture. A single one-size-fits-all dashboard would either overwhelm or under-serve most roles.

### Business Benefits

- **Operational awareness** — a live, no-cap record count and status breakdown means nobody has to open the full record list just to answer "how are we doing today."
- **Workload monitoring** — KPI tiles (Scheduled / Pending Driver / On-Hold / Rescheduled / Completed Today, and inventory/fulfillment equivalents for Logistics/TASS) give a quick health check without manual counting.
- **Decision support** — the "Needs Attention" panel surfaces flagged/blocked records and deep-links straight into the record detail drawer regardless of category, so a supervisor can act on a problem the moment it's spotted rather than searching for it.

### Department Impact

Every role except Driver sees a dashboard variant tailored to its KPIs (`GET /api/dashboard/stats` returns a role-discriminated payload); Driver instead gets its own full-screen app rather than a dashboard, since a driver's "dashboard" is really just their assigned task list.

### Technical Highlights

Charts are rendered with Recharts. KPI data is computed server-side per role in `dashboard.ts` rather than shipped as raw record data for the frontend to aggregate, keeping the payload small and the aggregation logic in one place. Because the underlying `DeliveryRecord` table has no artificial row cap, the dashboard's live count is a direct, working answer to the SharePoint list-threshold problem described in [Background](#background).

## Inventory

### Overview

The Inventory subsystem tracks physical stock through three related tables: `Product` (the SKU Master — code, name, category, cost/price, reorder point), `InventoryItem` (one-to-one with each product — warehouse location, on-hand quantity, allocated quantity), and `InventoryTransaction` (an append-style ledger of every stock movement: Goods Receipt, Sale, Adjustment, Transfer).

### Why it Matters

Logistics and Procurement need to know not just what a product is, but where it physically sits, how much is available versus already committed, and when it's time to reorder — none of which a delivery-tracking spreadsheet was ever designed to answer. Bundling SKU identity, live stock level, and transaction history into one linked set of tables gives the business a single place to answer "do we have this, where is it, and what happened to it" instead of reconciling multiple spreadsheets.

### Business Benefits

- **Inventory visibility** — on-hand and allocated quantities are tracked per product in real time via `InventoryItem`, rather than inferred from scattered notes.
- **Procurement support** — `reorderPoint` on each `Product` gives a concrete, comparable threshold against current stock, feeding "needs attention"-style alerts.
- **Warehouse management** — `warehouseLocation` on `InventoryItem` records where a SKU physically lives, supporting pick/pack operations.
- **Product lifecycle** — `Product` supports soft-delete (`deletedAt`) so a discontinued SKU's history isn't destroyed, and every SKU carries its own audit trail (`GET /api/skus/:id/audit`).
- **Data consistency** — every stock change is expected to flow through an `InventoryTransaction` row with a `resultingBalance`, so the on-hand quantity is always reconstructable from history, not just trusted at face value.

### Department Impact

- **Logistics** — can adjust stock (`POST /api/skus/:id/adjust`) alongside Admin, and reviews inventory/fulfillment KPIs on its dashboard.
- **Admin** — owns SKU creation/editing (`skus.ts` write routes are Admin-only outside adjustments) and can review per-SKU audit history.
- **TASS and Sales Coordinator** — have read access to SKU Master/Inventory/Transactions to support their own workflows (e.g., confirming stock availability before scheduling a delivery), without write access.

### Operational Workflow

A new SKU is created by Admin with its cost, price, category (A/B/C), and reorder point. As goods move — receipts, sales, adjustments, transfers — each movement is recorded as an `InventoryTransaction`, and the associated `InventoryItem.onHandQty`/`allocatedQty` reflects the running result. `TransactionCenter.tsx` / `TransactionDetail.tsx` give a ledger view for reviewing that history per product or per source document.

### Technical Highlights

`InventoryItem` is a strict one-to-one with `Product` (unique `productId`), not a one-to-many warehouse-split model — the schema currently models a single stock location per SKU rather than multi-warehouse allocation. A previously separate `WarehousesView.tsx` / `WarehouseWorkspace.tsx` UI for multi-location warehouse management exists in the codebase but is retired and force-excluded from every role's screen set in `App.tsx`.

## Exporting System

### Overview

Exporting is one of the most heavily built-out subsystems in the portal, because it is where the system hands data back to people who need it outside the app — printed for a driver, emailed to a manager, attached to a customer communication, or archived for compliance. Rather than each module implementing its own file-generation logic, all exports flow through a small set of shared, reusable modules under `src/utils/`:

- **`export.ts`** — the shared CSV / Excel (`exceljs`) / PDF (`jsPDF` + `jspdf-autotable`) engine used by `ExportMenu.tsx` on every record list. It owns the formatting rules everyone else builds on: a 3-row metadata header (what was exported, when, by whom/from where), a navy header row with white bold text matching Microgenesis's brand palette, Title-Case column headers, Microgenesis-formatted dates/times, status "pill" badges rendered directly in the PDF output, alternating row shading for readability, and a footer row stating the total record count.
- **`exportDocx.ts`** — Word (`.docx`) export via the `docx` package, laid out A4 landscape, for contexts where a formatted document (rather than a spreadsheet or PDF) is the expected deliverable.
- **`exportDriverReport.ts`** — a styled Excel driver report using a distinct Microgenesis navy/gold theme, purpose-built for handing a driver (or their supervisor) a printed or digital summary of their route.
- **`routeSlip.ts`** — the "Daily Route Slip" export (Excel + PDF), matching Microgenesis's existing paper delivery-route template, so field staff already trained on the paper form recognize the digital equivalent immediately.
- **`allOpsExport.ts`** — a cross-category "All Operations" export (`AllOpsExportMenu.tsx`) that pulls records across every category into one output, with selectable sort order (nearest/oldest/furthest date), a computed summary block, and CSV / Excel (with a dedicated Summary sheet) / PDF (with a cover page) outputs.

Every export menu also offers a **Status Trail** mode alongside the normal ("Current Status") export — see [Audit Logs → Status Trail Export](#audit-logs) for the full explanation. This is a direct response to a specific request from Logistics: an export where a record that was `Pending` and later became `Scheduled` is counted under both statuses, not just whichever one it holds today.

### Why it Matters

Under the SharePoint-based workflow, getting a clean, presentable copy of the day's deliveries — for a driver, a manager, or an external partner — meant manually copying rows out of a list view with no consistent formatting, no branding, and no guarantee the copy matched what was actually in the system. Every export in this portal is generated directly from the live database record, so the exported document and the system's data can never silently drift apart.

### Business Benefits

- **Reduces manual documentation** — a driver report, route slip, or full operations export is generated in one click instead of being manually assembled or retyped.
- **Supports reporting** — the "All Operations" export's computed summary block gives supervisors and management a ready-made rollup without opening a spreadsheet and building pivot tables from scratch.
- **Improves communication between departments** — a Logistics-generated route slip and a TASS-facing collection export both draw from the same underlying record data and the same formatting engine, so every department is working from a consistent, mutually legible document format.
- **Supports historical record-keeping** — exported PDFs/Excel files serve as point-in-time snapshots that can be archived, attached to emails, or filed, independent of whatever the live system shows later.
- **Assists supervisors** — the Daily Route Slip and driver reports give a supervisor a print-ready, at-a-glance view of a driver's assigned work for the day, matching a paper process staff are already trained on.
- **Improves professionalism through standardized formatting** — every export carries the same navy/blue Microgenesis branding, metadata header, and pill-styled status badges, so a document handed to a customer or partner looks like it came from a real enterprise system rather than an ad hoc spreadsheet dump.
- **Improves organizational documentation through consistent branding** — because all exports share the same underlying engine (`export.ts`) and palette, there is no risk of one team's export looking different from another's; brand consistency is enforced by code, not by convention.

### Department Impact

- **Logistics** — route slips and driver reports for daily dispatch planning and handoff to field staff.
- **Sales Coordinator / Account Managers** — standard record exports (CSV/Excel/PDF/Word) for customer-facing or internal recordkeeping.
- **TASS** — exports of Accounting Collection records for reconciliation and reporting.
- **Drivers** — the Daily Route Slip is designed to be handed to or printed for drivers directly.
- **Administrators / Management** — the "All Operations" export's cross-category summary and cover page are built for a management-level view spanning every record type at once.

### Technical Highlights

The 3-row metadata header and footer total row are generated once in `export.ts` and reused by every export path, meaning any future export format automatically inherits the branding and metadata conventions rather than needing to reimplement them. PDF status pills are rendered as custom-drawn badges (not just colored text) via `jspdf-autotable` cell hooks. The "All Operations" Excel export adds a dedicated Summary worksheet alongside the raw data sheet, and its PDF equivalent adds a cover page — both generated from the same computed summary object, so the numbers in the Excel summary and the PDF cover page can never disagree.

## Notifications

### Overview

The portal has two distinct notification concepts, backed by two separate tables, and they should not be confused with each other:

1. **In-app bell notifications** — the `Notification` model and `NotificationBell.tsx` UI. These are created by `services/inAppNotify.ts` (`notifyRole(role, ...)` to fan out to every active user of a role, or `notifyUser(userId, ...)` for a specific person), and consumed via `notifications.ts` routes (list, unread count, mark-read/read-all).
2. **Outbound trigger audit** — the `NotificationLog` model. Every Output Action trigger that resolves at least one recipient and has a `recordId` to attach to (see [Output Actions](#output-actions)) calls `POST /api/notifications/send-email`, which resolves recipients (Account Manager by name match, or every active Logistics/TASS user), sends through the unified mailer (see [Authentication & Microsoft 365 Integration](#authentication--microsoft-365-integration)), and writes one `NotificationLog` row per recipient with the real outcome (`SENT`/`FAILED`/`MOCKED`). The Accomplished trigger specifically is additionally covered by a dedicated `services/notify.ts::notifyAccomplished()` function, per the original spec.

### Why it Matters

Cross-department coordination in the old system depended on people remembering to check the list or being told verbally that something changed. A notification system replaces "hope someone mentions it" with a structured, queryable record of who was told what, and when.

### Business Benefits

- **Cross-department coordination** — role-targeted notifications (`notifyRole`) mean the right department is told about a relevant event without anyone having to manually loop them in.
- **Operational awareness** — the unread-count badge on the bell gives an at-a-glance signal that something needs attention.
- **Process automation** — status-change triggers (Accomplished, Rescheduled, On-Hold, RMA Completed, Collection Verified) fire automatically and dispatch real email through the unified mailer, with no manual step required to notify stakeholders.
- **Event tracking** — `NotificationLog` retains a durable record of every triggered notification event and its actual delivery status (`SENT`/`FAILED`/`MOCKED`), independent of whether the in-app bell notification was ever read.

### Department Impact

Notifications are role-targeted rather than broadcast to everyone — Logistics, TASS, and Account Managers are the primary recipients configured through the Output Actions panel (see below), reflecting who actually needs to act on a given event.

### Technical Highlights

`POST /api/notifications/send-email` resolves the `AM` recipient by a case-insensitive name match against the record's `accountManager` field, and `LOGISTICS`/`TASS` recipients as every currently-active user with that role — so a role recipient list always reflects who's actually active today, not a stale roster. A code comment in `services/notify.ts` explicitly warns against wiring additional automated triggers into `notifyAccomplished()` beyond the Accomplished event — the general-purpose send-email endpoint (used by the other status-change triggers) is the intended place for new trigger wiring, not that function.

## Output Actions

### Overview

Output Actions are an IPO-style ("Input-Process-Output") configurable automation panel (`OutputActionsPanel.tsx`, logic in `src/outputActions.ts`) attached to every record workspace. Six trigger events — **Record Created, Accomplished, Rescheduled, On-Hold, RMA Completed, Collection Verified** — can each be configured with an independent set of output channels: Notify AM, Notify Logistics, Notify TASS, Export to PDF, or Internal Only.

### Why it Matters

Different record events matter to different audiences, and a one-size-fits-all "notify everyone on every change" policy either spams people or, more likely, gets disabled entirely. Making the output channel per-trigger and configurable lets each department tune exactly which events they need to hear about, mirroring how the business already routes information manually — the Account Manager cares that a record was created, Logistics cares that it's on hold, TASS cares that collection was verified.

### Business Benefits

Output Actions formalize what used to be an informal, memory-dependent notification habit ("remember to tell TASS when this is verified") into a configurable, consistent system behavior — improving communication reliability and reducing the chance that a stakeholder is simply forgotten.

### Operational Workflow

**Five of the six triggers dispatch real email** through `POST /api/notifications/send-email` (see [Notifications](#notifications)): **Accomplished, Rescheduled, On-Hold, RMA Completed, and Collection Verified** all fire from a context that already has the record's ID (`DeliveryRecordWorkspace.tsx`, `DriverView.tsx`), so `runOutputActions()` (`src/outputActions.ts`) calls the real endpoint with whichever recipients (AM/Logistics/TASS) are toggled on for that trigger, and the response's sent/failed counts are reflected in the confirmation banner. **Record Created** is the one remaining client-side simulation — it fires from `RecordCreateForm.tsx` *before* the record has been persisted and assigned an ID, so there is nothing yet to attach a `NotificationLog` row to; it still produces a visible confirmation banner and a persisted per-record log entry once the record is saved, just without a real network call. This is a deliberate consequence of where in the creation flow the trigger fires, not an arbitrary scope cut — see [Notifications](#notifications) Technical Highlights for the equivalent boundary in `notify.ts`.

Every trigger's "Export to PDF" and "Internal Only" channels remain UI-only regardless of which trigger fires — internal-only suppresses all output as intended, and PDF export is represented as a confirmation/log entry rather than an automatic file generation.

### Technical Highlights

Because `OutputActionsPanel.tsx` is a single reusable component embedded across the Deliveries, RMA, Procurement Pick-up, and Accounting Collection workspaces, and `runOutputActions()` already accepts an optional `{ recordId, api }` context, wiring the Record Created trigger to a real send in the future is a matter of moving the call to after record creation succeeds (where an ID exists), not adding new plumbing.

## Audit Logs

### Overview

Audit logging is centralized through `services/audit.ts`'s `writeAuditLog({recordId, recordType, action, changedById, previousValue, newValue})`, which writes to the generic `AuditLog` table. A code comment states explicitly that every create/update to a tracked entity (currently `DeliveryRecord` and `Product`/SKU) is expected to route through this function rather than writing to `AuditLog` ad hoc inside individual route handlers.

### Why it Matters

This is the direct fix for the single most frequently raised complaint in [Background](#background): the old SharePoint list had no reliable way to answer "who created or last modified this entry." Every write to a tracked record now produces a durable, queryable `AuditLog` row capturing who made the change, what action it was (CREATE/UPDATE/DELETE), and the before/after values as JSON — an answer that used to require manually asking around the office is now a click away.

### Business Benefits

- **Accountability** — every change to a delivery record or SKU is attributable to a specific logged-in user, not just "someone edited this."
- **Traceability** — previous and new values are stored side by side, so a disputed change ("who changed the delivery date?") can be answered definitively rather than reconstructed from memory.
- **Compliance / administrative investigations** — a system-wide audit log viewer (`GET /api/admin/audit-log`, surfaced in `AdminPanel.tsx`) lets Admin review changes across the whole system, not just one record at a time, supporting after-the-fact investigation of a specific incident or user's activity.
- **Historical tracking** — because `AuditLog.recordType` is generic, the same mechanism already extends beyond delivery records to SKUs, and could extend to further entities without a schema change.

### Department Impact

Admin has exclusive access to the system-wide audit log viewer; any role that can view a specific record can also view that record's own audit history via `GET /api/records/:id/audit` (or `GET /api/skus/:id/audit` for SKUs, Admin only).

### Status Trail Export — answering Logistics' specific request

Logistics specifically asked whether it was possible to export data that reflects a record's full status history, not just its current status — for example, a record that was `Pending` and is now `Scheduled` should be countable under **both** statuses in a report, not just its current one. This is implemented: every export menu in the app (see [Exporting System](#exporting-system)) offers two modes, side by side:

- **Current Status** — the standard export, where each record is counted once, under whatever status it holds right now.
- **Status Trail** — each record is counted under **every status it has ever held**, reconstructed from that record's `AuditLog` entries (`computeStatusHistoryCounts()` in `src/utils/export.ts`, backed by `GET /api/records/status-history-counts`). A record that moved Pending → Scheduled → Accomplished is counted once in each of those three buckets in Trail mode, answering exactly the "was it ever Pending" question the SharePoint list couldn't.

Status Trail is available in CSV, Excel, Word, and PDF, across every export menu (per-module `ExportMenu.tsx` and the cross-category `AllOpsExportMenu.tsx`), not as a one-off report — it's a first-class option next to the normal export in the same dropdown.

### Technical Highlights

`AuditLog` is kept deliberately separate from two other, easily-confused trails: `RemarkLog` (append-only, free-text remarks tagged by context — `CREATION`/`GENERAL_EDIT`/`DRIVER_UPDATE`/`STATUS_CHANGE` — never edited or deleted after creation) and `Comment` (threaded discussion on a record). `AuditLog` answers "what changed, structurally"; `RemarkLog` answers "what was said about this record, and in what context"; `Comment` is open-ended discussion. Keeping these three concerns in separate tables avoids conflating a structured audit trail with free-text human commentary.

## Statistical Reports

### Overview

`StatisticalReportView.tsx` and the `reports.ts` API (`GET /daily-status-history`, `GET /summary`, both gated to Logistics and Admin) surface trend data over time, backed by the `DailyStatusSnapshot` table — a daily rollup of `(date, category, status, count)`, written once per day by an end-of-day job (intended to run at 6 PM per the schema's own comment). A dedicated `StatusHistoryView.tsx` / `StatusStepper.tsx` pair covers per-record status progression, distinct from the aggregate statistical reports.

### Why it Matters

Answering "how many deliveries were on hold last week" by scanning every individual `DeliveryRecord` row becomes slower as the table grows — exactly the kind of query that would have degraded badly under the SharePoint list's own scaling limits. Pre-aggregating a daily snapshot means historical/trend queries stay fast regardless of how many live records exist.

### Business Benefits

- **Trend analysis** — daily counts per category and status make it possible to see patterns (e.g., a rising rate of On-Hold deliveries) that would be invisible scanning a live list one day at a time.
- **Operational insights / performance monitoring** — Logistics and Admin can review historical status distributions to spot bottlenecks in the delivery pipeline.
- **Planning and decision-making** — management-facing summary data supports resourcing and process decisions grounded in actual historical volume, not anecdote.

### Department Impact

Statistical Reports and Status History are visible to Logistics and Admin only, reflecting that these are operational-planning tools rather than something every department needs day to day.

### Technical Highlights

`DailyStatusSnapshot` uses a special `category` value of `"ALL"` to store the combined cross-category daily total alongside per-category rows, avoiding a separate table or a client-side sum for the "all categories" view. The `@@unique([date, category, status])` constraint keeps the rollup idempotent per day.

## Admin Panel

### Overview

`AdminPanel.tsx` is the Admin-only control surface for the system, with three tabs: **User Management**, **System Audit Log** (see [Audit Logs](#audit-logs)), and **Integrations**.

- **User Management** — list every account with role, active status, and a Microsoft-linked auth badge (see [Authentication & Microsoft 365 Integration](#authentication--microsoft-365-integration)); create a new user; edit an existing user's name, email, or role inline (`PATCH /api/users/:id`); deactivate/reactivate an account; and manage per-user screen-permission overrides on top of the role default (`GET`/`PUT /api/users/:id/permissions`).
- **System Audit Log** — a paginated, filterable view over the global `AuditLog` table (see [Audit Logs](#audit-logs)).
- **Integrations** — live diagnostics for Azure AD SSO and email delivery (`GET /api/admin/integration-status`): whether Azure is configured and its tenant/redirect URI, which email method is currently active (Graph/SMTP/mock), how many users are Microsoft-linked, and the app's environment. A **Send Test Email** form (`POST /api/admin/test-email`) sends a real email through the same mailer used everywhere else and reports which method handled it and whether it succeeded.

### Why it Matters

Once Azure AD SSO and real email are in play, "is it actually working" becomes a question an Admin needs to answer without SSH access to server logs — especially across two deployments (a Render staging environment and eventual production). The Integrations tab exists specifically so that question has a UI answer.

### Business Benefits

- **Faster incident triage** — an Admin can immediately see whether an email-delivery complaint traces back to a misconfigured environment variable (method shows `mock`) versus a genuine delivery failure (a test email fails with a Graph/SMTP error).
- **Safe verification before rollout** — a new deployment's email configuration can be confirmed with a real test send before relying on it for the daily 4 PM/weekly automated notifications.
- **Clear account provenance** — the Microsoft-linked badge in User Management makes it immediately visible which accounts were auto-provisioned via SSO versus created manually by an Admin.

### Technical Highlights

The Integrations tab and the login page's SSO button independently call the same `getMsalConfig()`-backed "is Azure configured" check (via different endpoints — `/api/auth/microsoft/status` for the login page, `/api/admin/integration-status` for the Admin Panel), so the two surfaces can never disagree about whether SSO is live. `PATCH /api/users/:id` validates the `role` value against the same role list used at user-creation time, so an inline edit can't set a user into an invalid role.

## Tech Stack

**Frontend:**
- **React 19** + **TypeScript** — component model & type safety
- **Vite 6** — dev server & build tooling (proxies `/api/*` to the backend)
- **Tailwind CSS 4** — styling (via `@tailwindcss/vite`)
- **Recharts** — dashboard charts
- **lucide-react** — icon set
- **motion** — animations
- **jsPDF + jspdf-autotable** — branded, styled PDF export
- **exceljs** / **xlsx** — styled Excel (`.xlsx`) export
- **docx** — Word (`.docx`) export

**Backend (`server/`):**
- **Node.js + Express** + **TypeScript**
- **Prisma** ORM with the **PostgreSQL** provider
- **JWT** (`jsonwebtoken`) in an httpOnly cookie for auth, 8-hour session expiry, `secure`/`sameSite: 'none'` in production for Teams/iframe compatibility
- **bcryptjs** for password hashing
- **`@azure/msal-node`** — Microsoft Azure AD OAuth 2.0 authorization-code flow for SSO login
- **`@azure/identity`** + **`@microsoft/microsoft-graph-client`** — Microsoft Graph API email delivery (`Mail.Send`)
- **Nodemailer** — SMTP fallback when Graph isn't configured
- Unified mailer (`services/mailer.ts`): Graph → SMTP → console-logged mock, in that priority order — see [Authentication & Microsoft 365 Integration](#authentication--microsoft-365-integration)

**Microsoft Teams packaging (`teams/`):** a Teams v1.17 app manifest + icons + build script — no additional runtime dependency, since the Teams tab is just the same web app loaded in an iframe. See [Microsoft Teams Integration](#microsoft-teams-integration).

**Deployment:** Render, one web service serving the built Vite frontend + Express API from a single Node process, backed by a managed Render PostgreSQL database (see [Deployment](#deployment) and `render.yaml`).

> Note: the root `package.json` also lists `@google/genai` and a root `.env.example` with a `GEMINI_API_KEY` / `APP_URL` — these are leftovers from the project's original AI Studio scaffold and are not used by any current application feature.

## Database Architecture

PostgreSQL via Prisma (`server/prisma/schema.prisma`). Enum-like fields (role, status, category, etc.) are modeled as plain `String` columns — valid values are enforced in application code (`server/src/mappings.ts`, RBAC in `middleware/auth.ts` and the route handlers), not by native Postgres enums. This is a deliberate tradeoff: it keeps the schema portable and avoids migration churn every time a new status or category value is introduced, at the cost of pushing validation responsibility into the application layer.

### Why the data model is shaped this way

`DeliveryRecord` is intentionally one wide table with a `category` discriminator (Sales Orders, Deliveries, RMA, Accounting Collection, Procurement Pick-up) rather than five separate tables per record type. This mirrors the business reality described in [Background](#background) — all five categories are fundamentally "a task that moves through a status lifecycle," just owned by different departments and carrying a few category-specific fields (like `amount`, used only for Accounting Collection). Modeling them as one table means a single audit mechanism, a single export engine, a single status-history mechanism, and a single "All Operations" report can cover every category without duplicated logic.

`User` sits at the center of the accountability model: it is the `createdBy`/`modifiedBy` party on `DeliveryRecord` and `Product`, the `changedBy` on `AuditLog`, the `author` on `Comment` and `RemarkLog`, and the recipient of `Notification` — every accountability and communication trail in the system ultimately traces back to a specific logged-in user, never an anonymous edit.

`Customer`, `Supplier`, and `Driver` are deliberately **not** foreign-keyed to `DeliveryRecord` — they exist as standalone relationship-management directories rather than being locked to specific record fields, which keeps the delivery record's own required fields (validated against `Company` only) simpler while still giving Sales/Procurement a real customer/supplier directory to work from.

`Product` maintains a strict 1:1 relationship with `InventoryItem` (current stock snapshot) and a 1:many relationship with `InventoryTransaction` (full movement history) — separating "what is true right now" from "how we got here," so the on-hand quantity can always be reconciled against its transaction history.

`DeliveryRecord.linkedCollectionId` is a self-relation, letting an Accounting Collection record reference the delivery record(s) that generated it, so billing can be traced back to fulfillment without a separate join table.

### Model Summary

| Model | Purpose |
|---|---|
| `User` | Login accounts: name, email, hashed password, `role`, `isActive`, `microsoftOid` (unique, nullable — set when the account is linked to a Microsoft identity via SSO). Relations to created/modified records, audit entries, notifications, comments, permissions, remark logs. |
| `UserPermission` | Per-user, per-screen access override (`screen`, `granted`), layered on top of the role default. |
| `Company` | The validated Company/SAP lookup (`sapNumber`, address, contact person) that `DeliveryRecord.companyId` references. |
| `Customer` | Merchant/customer directory — a relationship-management directory, intentionally **not** foreign-keyed to `DeliveryRecord`. |
| `Supplier` | Supplier directory with a `category` (Hardware/Consumables/Electronics/Packaging/Services) — also not foreign-keyed to `DeliveryRecord`; feeds Procurement Pick-up context. |
| `Driver` | Real driver/assistant directory: `type` (`DRIVER`/`ASSISTANT`), JSON `coverageAreas`, `isActive`. |
| `DeliveryRecord` | The core unified record: `category`, `status`, `priority`, `companyId`, `driver`, `driverAssistants`, `vehicle`, `area`, `deliveryDate`, `itemType`/`itemDescription`, `timeIn`/`timeOut`, `receivedBy`, `accountManager`, `amount` (Accounting Collection), `collectionVerified`/`By`/`At`, `documentAttachment` (filename only), `address`, `linkedCollectionId` (self-relation to a related record), `createdById`/`modifiedById`, soft-delete `deletedAt`. |
| `AuditLog` | Generic audit trail for any entity: `recordId`, `recordType`, `action` (CREATE/UPDATE/DELETE), `changedById`, `previousValue`/`newValue` (JSON), timestamp. |
| `RemarkLog` | Append-only remark history per record, with a `context` (`CREATION`/`GENERAL_EDIT`/`DRIVER_UPDATE`/`STATUS_CHANGE`). |
| `Comment` | Threaded comments on a record (`recordId`, `recordType`, `body`, `authorId`). |
| `Notification` | In-app notification-bell entries per user (`title`, `message`, `recordId`/`recordType`, `isRead`). |
| `NotificationLog` | Audit trail of outbound trigger events (`triggerEvent`, `recipientRole`, `recipientName`, `message`, `status`: SENT/FAILED/MOCKED). |
| `Product` | SKU Master: `skuCode`, `name`, `category` (A/B/C), `unitCost`, `unitPrice`, `reorderPoint`, soft-delete. |
| `InventoryItem` | One-to-one with `Product`: `warehouseLocation`, `onHandQty`, `allocatedQty`. |
| `InventoryTransaction` | Ledger entries per product: `date`, `type` (Goods Receipt/Sale/Adjustment/Transfer), `qtyChange`, `resultingBalance`, `reference`. |
| `DailyStatusSnapshot` | Daily rollup (`date`, `category`, `status`, `count`) written by an end-of-day job, powering fast historical/statistical reporting without scanning the full record table. |

See `server/prisma/migrations/` for the full evolution history (RBAC fixes, SKU Master, notifications/comments, user permissions, driver table, customers/suppliers, remark log, linked collections, and more).

## Backend API

All routes are mounted under `/api` and require an authenticated session (`mg_session` JWT cookie) unless noted. Role names in parentheses gate write/sensitive operations via `requireRole(...)`.

The API is organized by business domain, not as a generic CRUD-for-everything layer: authentication (`auth.ts`) is separate from the core operational record surface (`records.ts`), which is separate from master-data directories (`companies.ts`, `customers.ts`, `suppliers.ts`, `drivers.ts`), which is separate again from administration (`users.ts`, `admin.ts`) and inventory (`skus.ts`, `transactions.ts`). This grouping mirrors the RBAC model above — most route files map cleanly onto "the set of endpoints one department cares about" — and keeps each file's `requireRole` gates easy to audit in isolation, since a reviewer checking "can Sales Coordinator do X" only needs to read one file rather than search the whole route tree.

| Route file | Endpoints |
|---|---|
| `auth.ts` | `POST /login`, `POST /logout`, `GET /me`, `POST /microsoft` (returns Azure AD auth URL, or `501` if unconfigured), `GET /microsoft/callback` (OAuth redirect target), `GET /microsoft/status` (no auth — `{ configured: boolean }`, used by the login page) |
| `records.ts` | `GET /`, `GET /status-history-counts`, `GET /:id`, `GET /:id/audit`, `GET /:id/remarks`, `GET/POST /:id/comments`, `POST /` (Sales Coordinator, Logistics), `PUT /:id` (Sales Coordinator, Logistics, Admin, Driver, TASS), `PATCH /:id/status` (same 5 roles), `PATCH /:id/verify-collection` (TASS only), `DELETE /:id` (Sales Coordinator only) |
| `companies.ts` | `GET /` (any authed user), `POST /` (Sales Coordinator only) |
| `customers.ts` | `GET /` (any authed), `POST /` (Sales Coordinator, Logistics, Admin, Driver) |
| `suppliers.ts` | `GET /` (any authed), `POST /` (Sales Coordinator, Logistics, Admin, Driver) |
| `drivers.ts` | `GET /` (any authed), `POST`/`PUT`/`DELETE` (Logistics, Admin) |
| `users.ts` | `GET /`, `POST /`, `PATCH /:id` (edit name/email/role), `PATCH /:id/deactivate`, `PATCH /:id/activate`, `GET/PUT /:id/permissions` — all Admin only |
| `skus.ts` | `GET /`, `GET /:id`, `GET /:id/audit` (Admin), `POST /` (Admin), `PUT /:id` (Admin), `POST /:id/adjust` (Admin, Logistics) |
| `transactions.ts` | `GET /`, `GET /:source/:id` |
| `dashboard.ts` | `GET /stats` — role-discriminated KPI payload |
| `reports.ts` | `GET /daily-status-history`, `GET /summary` (Logistics, Admin) |
| `notifications.ts` | `GET /`, `GET /unread-count`, `PATCH /read-all`, `PATCH /:id/read`, `POST /send-email` (dispatches a real Output Action email and writes `NotificationLog`) |
| `admin.ts` | `GET /audit-log`, `GET /integration-status` (Azure/email/user diagnostics), `POST /test-email` — all Admin only |
| `data-sampler.ts` | `GET /counts`, `POST /generate`, `POST /reset` — all Admin only |
| `dev.ts` | `POST /reset-seed` — no auth required; dev/demo convenience only, truncates and re-seeds the database |

The frontend never talks to Postgres or Prisma directly — `src/api.ts` is the single fetch wrapper every component goes through, keeping the contract between frontend and backend at the HTTP/JSON layer rather than leaking database concerns into UI code.

## Project Structure

```
src/
├── App.tsx                        # Shell: sidebar, header, auth gate, role screen scope (DEFAULT_ROLE_SCOPE + per-user overrides), top-level state
├── api.ts                         # fetch wrapper for the Express backend (/api/*)
├── types.ts                       # Domain types (DeliveryRecord, Product, Customer, Supplier, Driver, UserRole, Output Actions...)
├── data.ts                        # Shared option lists (AREAS, VEHICLES, AREA_HIERARCHY, ...) used by forms and exports
├── outputActions.ts               # IPO output-actions trigger logic and defaults
├── screenRouting.ts                # Category <-> screen key mapping, incl. deep-link support for Sales Orders
├── persistence.ts                 # localStorage helpers (legacy leftovers only; core data is server-backed now)
└── utils/
    ├── export.ts                  # Shared CSV/Excel/PDF export engine — formatters, per-module column configs, PDF pill-badge renderer
    ├── exportDocx.ts               # Word (.docx) export
    ├── exportDriverReport.ts       # Styled Excel driver report
    ├── routeSlip.ts                 # Daily Route Slip export (Excel + PDF)
    └── allOpsExport.ts              # Cross-category "All Operations" export with sort modes and summary

src/components/
├── LoginView.tsx                              # Email/password login screen
├── DashboardView.tsx                           # Role-scoped KPIs, charts, Needs Attention panel; dispatches to role dashboards below
├── LogisticsDashboard.tsx / TassDashboard.tsx / AdminDashboard.tsx / DriverDashboard.tsx  # Per-role dashboard variants (Driver's is a full-screen app, not embedded)
├── DeliveryRecordsView.tsx                      # Generic record list + drawer + Auto Fill, powers Deliveries/RMA/Procurement Pick-up/Sales Orders
├── DeliveryRecordWorkspace.tsx                  # Shared record detail drawer (audit trail, remarks, comments, output-action log)
├── AccountingCollectionView.tsx / AccountingCollectionWorkspace.tsx  # Accounting Collection module (adds `amount`, TASS verification workflow)
├── DriverView.tsx                               # Logistics Dispatch Board (phone mockups per driver)
├── DispatchBoardSelector.tsx                    # Grouped dropdown for jumping to any unassigned record by category
├── DriverBoard.tsx / DeliveryCalendar.tsx        # Kanban board and calendar views
├── DriverManagerView.tsx                        # CRUD screen for the Driver directory
├── InventoryView.tsx / SkuWorkspace.tsx          # SKU Master (backend-served)
├── TransactionCenter.tsx / TransactionDetail.tsx # Inventory transaction ledger
├── CustomersView.tsx / CustomerWorkspace.tsx      # Customer directory (backend-served)
├── SuppliersView.tsx / SupplierWorkspace.tsx      # Supplier directory (backend-served)
├── WarehousesView.tsx / WarehouseWorkspace.tsx    # Warehouse location workspace (retired from the sidebar; force-excluded in App.tsx)
├── AdminPanel.tsx                               # Admin-only: user management, permission overrides, system audit log
├── DataSamplerView.tsx                           # Admin-only: bulk demo-record generation + Full Reset / Reset to Seed Data
├── AccountManagerDirectory.tsx / AccountManagerCombobox.tsx  # AM directory + lookup combobox
├── StatusHistoryView.tsx / StatusStepper.tsx      # Status history and status-progression UI
├── StatisticalReportView.tsx                     # Statistical reports screen
├── RecordCreateForm.tsx                          # Record creation form (Auto Fill support)
├── ExportMenu.tsx / AllOpsExportMenu.tsx / RouteSlipMenu.tsx  # Export dropdowns (per-module, all-ops, route slip)
├── OutputActionsPanel.tsx                        # Reusable IPO output-actions toggle panel
├── GlobalSearch.tsx / NotificationBell.tsx        # Global search and notification bell
├── ComboboxField.tsx                              # Reusable combobox input
└── MainView.tsx                                   # Landing/overview screen distinct from Dashboard

server/
├── prisma/schema.prisma       # All models (see Database Architecture) — PostgreSQL
├── prisma/migrations/         # Full migration history
├── prisma/seed.ts             # Seed script (reused by POST /api/dev/reset-seed and the Admin Data Sampler's "Reset to Seed Data")
└── src/
    ├── index.ts                # Express app entrypoint (serves API + built frontend in production)
    ├── db.ts                   # Prisma client
    ├── mappings.ts              # DB value <-> frontend display-string mapping, serializeRecord()
    ├── middleware/auth.ts       # JWT cookie auth + requireAuth/requireRole RBAC + production cookie hardening (secure/sameSite=none)
    ├── services/audit.ts        # Central AuditLog writer
    ├── services/notify.ts       # The dedicated ACCOMPLISHED trigger (writes NotificationLog + sends real email via the mailer)
    ├── services/inAppNotify.ts  # Writes in-app Notification rows
    ├── services/mailer.ts       # Unified mailer: Microsoft Graph -> SMTP -> console-logged mock
    └── routes/                  # See Backend API above (auth.ts includes Azure AD SSO routes)

teams/
├── manifest.json              # Teams v1.17 app manifest template (placeholders resolved by build.sh, never edited directly)
├── build.sh                   # Fills placeholders from env/`.env`, packages microgenesis-teams-app.zip
├── icon-color.png / icon-outline.png  # Teams app gallery + sidebar icons
└── README.md                  # Azure AD app registration + Teams upload walkthrough
```

## Getting Started

**For step-by-step local setup written for someone new to this codebase, see [`GETTING_STARTED.md`](./GETTING_STARTED.md).** The quick reference below assumes you've already done that once.

**Prerequisites:** Node.js 18+, a PostgreSQL database (local or remote).

See [Full-Stack Setup](#full-stack-setup) for the two-process local dev flow — the backend must be running for the frontend to load any data beyond the login screen.

```bash
npm install
npm run dev
```

The frontend runs at `http://localhost:3000`. It requires the backend (`server/`, port 4000) to be running to log in or load any data.

Other frontend scripts:

```bash
npm run build     # production build to dist/
npm run preview   # preview a production build locally
npm run clean     # remove dist/ and server.js
npm run lint       # type-check with tsc --noEmit
```

Backend scripts (run from `server/`):

```bash
npm run dev              # tsx watch src/index.ts — http://localhost:4000
npm run build             # tsc build to dist/
npm start                 # run the compiled build (node dist/src/index.js)
npm run prisma:generate   # regenerate the Prisma client
npm run prisma:migrate    # prisma migrate dev --name init
npm run seed               # tsx prisma/seed.ts
npm run lint                # type-check with tsc --noEmit
```

## Environment Variables

**`server/.env`** (copy from `server/.env.example`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (the schema is Postgres-only — despite the shipped `.env.example` showing a stale SQLite-style `file:./dev.db` placeholder, a real deployment needs a Postgres URL, e.g. `postgresql://user:pass@host:5432/dbname`) |
| `JWT_SECRET` | Long random string used to sign session JWTs |
| `PORT` | Backend port (defaults to `4000`) |
| `CLIENT_ORIGIN` | Allowed CORS origin for the frontend in dev (e.g. `http://localhost:3000`) |
| `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` | Azure AD app registration credentials — leave both blank to disable Microsoft SSO entirely (email+password login still works; the SSO button shows a clear error instead of failing silently) |
| `AZURE_TENANT_ID` | Azure AD tenant ID (defaults to `common`); also required alongside the two above for the mailer to use Microsoft Graph for email |
| `APP_URL` | This deployment's own base URL, e.g. `https://portal.microgenesis.com` — used to build the Azure AD redirect URI (`{APP_URL}/api/auth/microsoft/callback`) and must exactly match a redirect URI registered in Azure. **Do not confuse with the root `.env.example`'s `APP_URL`** (see below) — this is the real one. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | SMTP credentials, used as the email fallback when Graph isn't configured — leave blank to keep the console-logging mock mailer (`server/src/services/mailer.ts`) |

See [`teams/README.md`](./teams/README.md) for the Azure AD app registration walkthrough (redirect URIs, API permissions, Teams-specific configuration) that produces the `AZURE_*` values above.

**Root `.env`** — `GEMINI_API_KEY` / `APP_URL` in the root `.env.example` are unused AI Studio scaffold leftovers from before this project existed; no current feature reads them. This is a different, unrelated `APP_URL` from the one in `server/.env` described above — only the one in `server/.env` matters for Azure AD SSO.

## Data & Persistence

Delivery records, companies, customers, suppliers, drivers, users/auth, notifications, audit logs, and the SKU Master (Products/Inventory/Transactions) all live in a real PostgreSQL database via Prisma, served by the Express backend. Multiple browsers/users share the same server-side data and see each other's changes on refresh.

- "Notifying AM/Logistics/TASS" via the Output Actions panel is a **real network call** for 5 of the 6 IPO trigger events (Accomplished, Rescheduled, On-Hold, RMA Completed, Collection Verified) — each calls `POST /api/notifications/send-email`, which sends through the unified mailer (Graph/SMTP/mock, see [Authentication & Microsoft 365 Integration](#authentication--microsoft-365-integration)) and writes a `NotificationLog` row per recipient. **Record Created** remains a client-side simulation, since it fires before the record has an ID to attach a log entry to — it still produces a visible confirmation banner and a persisted per-record log entry. "Export to PDF" as an Output Action channel is always a confirmation/log entry, not an automatic file generation — the **real** PDF/CSV/Excel/Word export menus elsewhere in the app are genuine client-side file generators, not simulations.
- The header's "Reset Demo Data" action calls `POST /api/dev/reset-seed`, which truncates and re-seeds the database, then refetches. The Admin-only **Data Sampler** offers finer-grained control: **Full Reset** (deletes transactional records/audit/comments/notifications, keeps users & master data) or **Reset to Seed Data** (complete wipe + re-seed via `server/prisma/seed.ts`, which also recreates user accounts — this logs everyone out).
- **Record IDs** are always the human-readable `REC-XXXXX` format, not raw Prisma cuids — generated per-source with disjoint ranges to avoid collisions: seed data uses `4001`–`4999`, records created through the normal Operations-tab forms use `10000`–`49999`, and the Admin Data Sampler uses `50000`–`99999`.
- Document Attachments store only the file name (`documentAttachment` column) — no file bytes are uploaded or stored.

## Deployment

Deployed on **Render** as a single Blueprint (`render.yaml`) with two resources:

- **`mg-portal-db`** — a managed Render PostgreSQL database.
- **`mg-portal`** — a Node web service that:
  - **Builds** the frontend and backend in one pass: `npm install --include=dev && npm run build && cd server && npm install --include=dev && npx prisma generate && npm run build`
  - **Starts** by applying migrations, seeding, then serving both the API and the built frontend from one Express process: `cd server && npx prisma migrate deploy && npx tsx prisma/seed.ts && cd .. && node server/dist/src/index.js`
  - Gets `DATABASE_URL` from the linked database and an auto-generated `JWT_SECRET`; `NODE_ENV=production`, `PORT=10000`.
  - Declares placeholders (`sync: false`) for `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `APP_URL`, and `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` — Render will prompt for these values in its dashboard rather than committing them to the repo; leaving them blank keeps Microsoft SSO disabled and email on the console-logged mock, so the Blueprint deploys and runs correctly with zero of them filled in.

> Note: the current start command re-runs `prisma/seed.ts` on every deploy/restart, not only on first deploy. This is a deliberate convenience for a demo/evaluation deployment (it guarantees a known-good demo dataset after every deploy), but it is worth flagging explicitly for anyone adapting this Blueprint toward a true production deployment with real, non-seed transactional data, since a redeploy would re-run the seed script against live data.

> **Running Render alongside a separate production deployment:** there is no conflict in keeping Render as a staging/QA environment after the company stands up its own production hosting — they're independent deployments of the same repository. The one thing that needs updating in both places is the Azure AD app registration's **redirect URIs** (Authentication blade): add one entry per environment (e.g. `https://your-app.onrender.com/api/auth/microsoft/callback` for Render, `https://portal.microgenesis.com/api/auth/microsoft/callback` for production) and remove Render's once it's decommissioned.

## Known Limitations

- **Driver is a real login role, not a Logistics-operated simulation.** The Driver Dispatch Board (`DriverView.tsx`) still exists for Logistics to act on behalf of drivers in the field, but a Driver can also log in directly and use the dedicated `DriverDashboard` app, scoped to their own assigned records.
- **TASS scope is narrowed**: TASS sees Accounting Collection, RMA, and Procurement Pick-up records (read-only outside collection verification), not Deliveries or Sales Orders.
- **Status changes are restricted**: the record drawer's status control is only editable for Logistics, Admin, and (on their own records) Driver — matching the backend's `PATCH /api/records/:id/status` RBAC. Sales Coordinator and TASS see status as read-only.
- **Sales Coordinator has no dispatch actions**: by design, Sales Coordinator can create and fully edit a record but cannot assign a driver or change status — enforcing a segregation-of-duties (SoD) split between record creation and dispatch execution. Logistics is the primary role with "Assign Driver" / "Schedule" actions.
- **Warehouses module is retired**: `WarehousesView.tsx` / `WarehouseWorkspace.tsx` still exist in the codebase but the `warehouses` screen is force-excluded from every role's effective screen set in `App.tsx` (including stale per-user permission grants), so it is not reachable from the UI.
- **Document Attachments are filename-only** — no file bytes are uploaded or stored anywhere.
- **Record Created is the one Output Action trigger not wired to real email** — it fires before the record is persisted and has an ID, so it remains a client-side confirmation/log entry only; the other five triggers (Accomplished, Rescheduled, On-Hold, RMA Completed, Collection Verified) dispatch real email. See [Output Actions](#output-actions).
- **Email defaults to a console-logged mock** — real delivery requires configuring either Microsoft Graph (`AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`/`AZURE_TENANT_ID`) or SMTP (`SMTP_*`) variables in `server/.env`; with neither set, all "sent" email is logged to the server console only, and the Admin Panel's Integrations tab will show the active method as `mock`.
- **Microsoft SSO auto-provisions new users as Sales Coordinator** — a first-time Microsoft sign-in with no matching existing account creates a new user with the lowest-privilege role by default; an Admin must manually promote them if a different role is needed.
- **Inventory is single-location per SKU** — `InventoryItem` models one `warehouseLocation` per `Product` (a strict 1:1 relationship), not a multi-warehouse allocation model; the retired Warehouses module suggests multi-location support was explored but not carried into the current data model.
- **Seed data is re-applied on every Render deploy** — see the note under [Deployment](#deployment).
