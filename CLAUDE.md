# Supply Chain — Claude Project Context

This file is automatically read by Claude when working in this repository.
It provides the context, conventions, and constraints Claude must follow at all times.

---

## Project Overview

**Supply Chain Management System** for Microgenesis. A full-stack internal portal for managing deliveries, RMA/TASS, procurement, accounting collection, sales orders, and driver operations.

## Stack

| Layer | Technology |
| :--- | :--- |
| Frontend | React 19 + TypeScript, Vite, TanStack Query, Zustand, Tailwind CSS v4, Lucide |
| Backend | Node.js, Express, TypeScript |
| ORM | Prisma (PostgreSQL) |
| Auth | JWT in `httpOnly` cookie (`mg_session`) |
| Testing | Node built-in test runner (`node:test` via `tsx`) for client and server; Playwright E2E in `e2e/` |

## Dev Environment

| Service | Port |
| :--- | :--- |
| Frontend (Vite) | `3000` |
| Backend (Express) | `4000` |

Vite proxies `/api/*` → `http://localhost:4000`.
Root `.env` holds the Docker PostgreSQL settings (`POSTGRES_*`); `server/.env` holds `DATABASE_URL`, `JWT_SECRET` and the other API settings (see `docs/GETTING_STARTED.md`). `NOTION_API_KEY` is only used for the Notion ticketing workflow; no application code reads it.

## Common Commands

```bash
# Run both frontend and backend
npm run dev

# Frontend only
npm run dev --workspace=client

# Backend only
npm run dev --workspace=server

# Type check frontend
cd client && npx tsc --noEmit

# Type check backend
cd server && npx tsc --noEmit

# Run client tests (node:test, not Vitest)
cd client && node --import tsx --test tests/*.test.ts src/components/__tests__/*.test.ts src/utils/__tests__/*.test.ts src/utils/tests/*.test.ts

# Run server tests
cd server && node --import tsx --test tests/*.test.ts

# Prisma migration
cd server && npx prisma migrate dev --name <migration-name>

# Prisma studio
cd server && npx prisma studio
```

## Project Structure

```
/
├── client/src/
│   ├── api/            # TanStack Query hooks
│   ├── features/       # Per-module feature components
│   ├── layouts/        # Sidebar, Header, Layout
│   ├── pages/          # Top-level page components
│   ├── store/          # Zustand stores
│   ├── types/          # Shared TypeScript types
│   ├── routes/         # AppRouter.tsx (screen → page switch), screenRouting.ts
│   └── screenRouting.ts  # Re-exports routes/screenRouting.ts
├── server/src/
│   ├── routes/         # Express route handlers (one file per resource)
│   ├── middleware/      # auth.ts — requireAuth, requireRole
│   ├── services/        # inAppNotify, mailer, driverDirectory
│   ├── db.ts            # Prisma client singleton
│   └── mappings.ts      # Role/status/category mappings
└── server/prisma/
    └── schema.prisma    # Database schema
```

## Roles (RBAC)

```
SALES_COORDINATOR | LOGISTICS | TASS | ADMIN | DRIVER
```

Defined in `server/src/middleware/auth.ts`. Role checks are done via:
```ts
requireRole('ADMIN', 'SALES_COORDINATOR')
```

## Conventions Claude Must Follow

### Backend
- Every **write** route (`POST`, `PATCH`, `PUT`, `DELETE`) must have `requireAuth` + `requireRole(...)` — no exceptions
- Multi-model writes use `prisma.$transaction([...])`
- New routes must be imported and mounted in `server/src/index.ts`
- Never touch `dist/` — build artifacts only

### Frontend
- New screens must be registered in `client/src/screenRouting.ts`
- Sidebar buttons use `canAccess(screen)` (effective screens from the session snapshot) — new screens need a permission entry in `server/src/services/permissions.ts` (`SCREEN_LABELS`, `ROLE_DEFAULTS`) and a case in `client/src/routes/AppRouter.tsx`
- API calls go through `client/src/api.ts` or hooks in `client/src/api/`
- Global state lives in Zustand stores in `client/src/store/`
- TypeScript strict mode is on — all code must pass `tsc --noEmit`

### Testing
- Component tests go in `__tests__/` folders co-located with their source files
- Do **not** run `npm run dev` inside tests — servers are already running

### Security
- Never expose `JWT_SECRET`, `NOTION_API_KEY`, `DATABASE_URL`, or any `.env` value in logs or responses
- JWT tokens stay in `httpOnly` cookies — never in `localStorage` or response bodies

### Git (from `docs/git-cheat-sheet.md`)
| Type | Branch pattern |
| :--- | :--- |
| Feature | `feature/<subsystem>-TSK-XX-<description>` |
| Bug fix | `fix/<subsystem>-TSK-XX-<description>` |
| Hotfix | `hotfix/<subsystem>-TSK-XX-<description>` |
| Refactor | `refactor/<subsystem>-TSK-XX-<description>` |
| Docs | `docs/<description>` |
| Chore | `chore/<description>` |

Commit format: `<type>(<subsystem>): <message> (TSK-XX)`

Subsystems: `client`, `server`, `api`, `db`, `admin`

## Notion Ticketing

Tickets use the `TSK-XX` prefix. The API key is in `.env` as `NOTION_API_KEY`.
Tickets database ID: `3e4df087-849c-80e8-96fb-fd136a743e8b`

## What NOT to Do

- Do not weaken or remove `requireAuth` / `requireRole` guards
- Do not modify `schema.prisma` without running `npx prisma migrate dev`
- Do not refactor code outside the scope of the requested task
- Do not create new frontend modules without registering them in `screenRouting.ts` and the Sidebar
- Do not run `npm run dev` in tests or scripts
- Do not write to `dist/`
- Do not commit `.env`
