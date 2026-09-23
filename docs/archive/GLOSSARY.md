# Glossary

Plain-English definitions of terms used throughout this codebase and its docs. If you're new to logistics/supply-chain software, or new to this specific business, start here — the code and docs assume you already know most of these.

### Business / domain terms

- **TASS** — Technical Admin System Services. One of the five login roles. Its exact responsibilities are **not yet confirmed** with the actual TASS department — see the provisional-role note in `README.md` and `docs/ROLES.md`. Do not assume "TASS" means "Accounting" or "Finance."
- **RMA** — Return Merchandise Authorization. A record category for handling product returns.
- **SKU** — Stock Keeping Unit. A unique code/identifier for a specific product, used to track inventory.
- **SKU Master** — the master list/directory of all products (SKUs) the business tracks, with cost, price, reorder point, etc. Implemented as the `Product` table.
- **Account Manager (AM)** — a staff member responsible for a customer relationship; referenced on delivery records and in notifications, but not one of the five login roles.
- **Sales Coordinator** — the login role responsible for creating and owning delivery records (order intake).
- **Logistics** — the login role responsible for assigning drivers/vehicles and managing field dispatch.
- **Driver** — a login role for field staff; sees only their own assigned deliveries in a dedicated mobile-style app.
- **Collection Verification** — confirming that payment/collection for a delivery has been received and recorded. Currently an exclusive action of the TASS role in this implementation.
- **Procurement Pick-up** — a record category for goods being picked up from a supplier, as opposed to delivered to a customer.
- **Reorder Point** — the stock quantity threshold at which a product should be reordered, tracked per SKU.
- **Route Slip** — a printable/exportable daily schedule document for a driver, matching Microgenesis's existing paper form.
- **Status Trail (export)** — an export mode, available alongside the normal export in every export menu, that counts each record under **every** status it has ever held (Pending, Scheduled, etc.), not just its current one. Built specifically in response to a request from Logistics. See `README.md`'s Audit Logs section.

### Technical terms

- **RBAC** — Role-Based Access Control. The system that decides what each login role is allowed to see and do, enforced on both frontend and backend (see `docs/ROLES.md`).
- **Prisma** — the tool (an "ORM") this project uses to talk to the Postgres database from TypeScript code, and to manage schema changes ("migrations"). The schema lives in `server/prisma/schema.prisma`.
- **Migration** — a recorded, versioned change to the database's structure (e.g. "add a new column"). Created by running `npx prisma migrate dev` after editing the schema file. Never edit the database structure by hand — see `DONT_BREAK_THIS.md`.
- **Seed / Seeding** — loading a fixed set of demo data (fake users, fake records) into an empty database, via `server/prisma/seed.ts`, so the app isn't empty when you first run it.
- **JWT (JSON Web Token)** — the type of token used to keep a user logged in, stored in a browser cookie after login.
- **Endpoint / Route** — a specific URL the frontend can call on the backend to get or change data (e.g. `POST /api/records`). Defined in `server/src/routes/`.
- **Express** — the backend web framework handling those routes/endpoints.
- **Vite** — the tool that runs the frontend during development and builds it for production.
- **Audit Log / Audit Trail** — a record of who changed what and when, stored in the `AuditLog` database table. Distinct from "Remarks" (free-text notes) and "Comments" (discussion threads) — see `README.md`'s Audit Logs section.
- **Output Actions** — the configurable panel that decides what happens (notify someone, export a PDF, etc.) when a record event occurs (created, accomplished, etc.). Mostly simulated today — see `DONT_BREAK_THIS.md` item 3.
- **Soft Delete** — marking a record as deleted (via a `deletedAt` timestamp) without actually removing it from the database, so history isn't lost.
- **`.env` file** — a local, git-ignored file holding secrets/config (database connection string, JWT secret, etc.). Copied from `.env.example` and filled in per environment — see `GETTING_STARTED.md`.
- **Seed data vs. live data** — "seed data" is the fake demo dataset loaded by the seed script; "live data" is whatever real users have entered since. Resetting to seed data wipes live data — see `DONT_BREAK_THIS.md` item 6.
