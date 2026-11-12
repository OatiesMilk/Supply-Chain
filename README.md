# Microgenesis Supply Chain Portal

> Last verified: 2026-10-09 against commit `ccbf192` (`dev`).

An internal, full-stack Supply Chain Management portal that replaces legacy SharePoint-based trackers. It unifies deliveries, RMA/TASS, procurement pick-ups, accounting collections, sales orders, driver operations and SKU master data in one role-controlled source of truth.

## Overview

The portal provides role-based tracking from record creation through dispatch, field proof of delivery and collection verification, with an audit trail on every change.

### Key Features
- **Operational records:** Deliveries, RMA, Accounting Collection, Procurement Pick-up and Sales Orders in one model, with Draft, Scheduled, In Transit, Pending, On-Hold, Rescheduled and Delivered states enforced on the server.
- **Dispatch and field execution:** Driver Manager, Driver Board, Delivery Calendar and a mobile-first Driver dashboard with server-stamped Time In/Out and verified JPG/PNG proof-of-delivery photos.
- **Role-based access control:** Sales Coordinator, Logistics, TASS, Admin and Driver roles, plus per-user module access managed by Admin.
- **Directories and SKU Master:** Companies, Customers, Suppliers, Drivers, Account Managers, and an Admin-managed SKU catalog with a stock ledger.
- **Dashboards, reports and exports:** Role-specific dashboards, Transaction Center, Reports, and CSV/Excel/PDF/Word exports and route slips.
- **Notifications:** In-app bell, email on Accomplished (Microsoft Graph, SMTP or a logged mock), and scheduled 4 PM / 6 PM / weekly jobs.

## Tech Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Query, Zustand, Recharts, Lucide, Sonner
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL, Prisma ORM
- **Authentication:** JWT in an `httpOnly` cookie, plus optional Microsoft Entra ID (Azure AD) SSO
- **Storage:** Local disk (development) or Supabase Storage (staging/production) for proof-of-delivery files
- **Testing:** Node's built-in test runner (`node:test` via `tsx`) and a Playwright E2E suite
- **Hosting:** Render (API), Cloudflare Pages/Worker (frontend), Docker Compose (local PostgreSQL)
- **Monorepo:** npm workspaces (`client/` and `server/`)

## Quick Start

```bash
npm install
cp .env.example .env && cp server/.env.example server/.env
docker compose up -d
cd server && npx prisma migrate deploy && cd ..
npm run dev
```

Frontend: <http://localhost:3000> · API: <http://localhost:4000>. Demo seeding is intentionally omitted from this short sequence because it requires explicit disposable-local-database safeguards. Follow the [Getting Started guide](./docs/GETTING_STARTED.md) for guarded seed setup, Windows PowerShell, accounts, tests and troubleshooting.

## Documentation

- [Unified Deployment Runbook](./docs/DEPLOYMENT.md): Cloudflare Pages, Render API, database/storage, SSO, API v1 cutover, verification and rollback.
- [Getting Started](./docs/GETTING_STARTED.md): local setup, database, seeds, tests.
- [System Architecture](./docs/SYSTEM_ARCHITECTURE.md): stack, components, auth, data model, deployment.
- [Business Requirements](./docs/BUSINESS_REQUIREMENTS.md): what the system does, by module and role, with status.
- [API Contract](./docs/API_CONTRACT.md): every route, guard and payload.
- [Module Access](./docs/MODULE_ACCESS.md): role defaults and per-user access rules.
- [UAT Plan](./docs/UAT_PLAN.md) and [UAT verification notes](./docs/uat/TSK-106-verification.md)
- [Project Issues Report](./docs/PROJECT_ISSUES_REPORT.md): audit findings and their current status.
- [Cloudflare Deployment](./docs/CLOUDFLARE_DEPLOYMENT.md), [Driver demo seed](./docs/driver-demo-seed.md), [Historical driver import](./server/prisma/DRIVER_IMPORT.md), [Teams tab app](./teams/README.md)
- [Git Cheat Sheet](./docs/git-cheat-sheet.md): branching and commit conventions.
- [Don't Break This](./DONT_BREAK_THIS.md): fragile areas to read before changing code.
- [Docs sync report](./docs/DOCS_SYNC_REPORT.md): what changed in the latest documentation audit.
- [Archive](./docs/archive): superseded documentation kept for history.
