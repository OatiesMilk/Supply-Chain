# Getting Started

> Last verified: 2026-10-09 against commit `ccbf192` (`dev`).
> This is the canonical setup guide. The root [`GETTING_STARTED.md`](../GETTING_STARTED.md) only points here.

This guide sets up the Supply Chain Portal locally on **Linux** or **Windows**.
The frontend runs on port `3000`, the backend on port `4000`, and PostgreSQL runs
in Docker on port `5433`.

## Prerequisites

- Git
- Node.js 20 (the version used by CI; see `.github/workflows/ci.yml`) and npm
- Docker Desktop (Windows) or Docker Engine with the Compose plugin (Linux)

Check the installed tools:

```bash
node --version
npm --version
docker --version
docker compose version
```

On Windows, run the commands below in **PowerShell**. Docker Desktop must be
running before you start the database.

## 1. Clone and install

```bash
git clone https://github.com/MarcZxc1/Supply-Chain.git
cd Supply-Chain
npm install
```

The repository uses npm workspaces (`client`, `server`), so installing from the
root installs both. Do not run a second `npm install` inside `server/`.

## 2. Configure environment files

There are two env files, both git-ignored. Copy the committed examples:

### Linux

```bash
cp .env.example .env
cp server/.env.example server/.env
```

### Windows PowerShell

```powershell
Copy-Item .env.example .env
Copy-Item server/.env.example server/.env
```

| File | Purpose | Variables (names only) |
| :--- | :--- | :--- |
| `.env` (root) | Docker Compose PostgreSQL container | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `POSTGRES_BIND_IP` |
| `server/.env` | Backend API | `DATABASE_URL`, `JWT_SECRET`, `PORT`, `CLIENT_ORIGIN`, `POD_UPLOAD_DIR`, `POD_STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, optional `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `AZURE_TENANT_ID` / `APP_URL` (Microsoft SSO and Graph mail), optional `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`, `RENDER_EXTERNAL_URL` (self-ping), and the local-only reset opt-ins described below |
| `client/.env` (optional) | Frontend build flags | `VITE_SHOW_DEMO_ACCOUNTS` (shows demo-account Quick Switch; it does not authorize or expose a destructive reset) |

Notes:

- `DATABASE_URL` in `server/.env` must be a literal value (Prisma and dotenv do
  not expand `${...}`). It must use the same user, password, database, host and
  port as the Docker settings in the root `.env`. If you change one, update the other.
- `POD_UPLOAD_DIR` is relative to `server/` and is git-ignored. Local development
  uses `POD_STORAGE_PROVIDER="local"`. Staging/production use
  `POD_STORAGE_PROVIDER="supabase"` with a private bucket and the server-only
  `SUPABASE_SERVICE_ROLE_KEY`; never expose that key to the client.
- With no `SMTP_*` or `AZURE_*` values, every email is logged to the backend
  terminal instead of being delivered (the `mock` mailer).
- Never commit `.env`, `server/.env`, or credentials.

## 3. Start PostgreSQL with Docker

Run from the repository root (same on Linux and PowerShell):

```bash
docker compose up -d
docker compose ps
```

The database is available at `127.0.0.1:5433`.

| Command | Effect |
| :--- | :--- |
| `docker compose logs -f postgres` | Follow database logs |
| `docker compose restart postgres` | Restart PostgreSQL |
| `docker compose stop` | Stop without removing containers |
| `docker compose down` | Stop and remove containers (data volume kept) |
| `docker compose down -v` | **Destructive:** also deletes the database volume. POD files in `server/uploads/pod/` are not affected |

Root shortcuts `npm run docker:up` / `npm run docker:down` call `docker-compose`.

## 4. Apply migrations and prepare demo data

```bash
cd server
npx prisma generate
npx prisma migrate deploy
cd ..
```

`migrate deploy` applies every committed migration (including line items, POD
attachments and the driver-identity link). It is the same command used by
staging and production. For active schema work use
`npx prisma migrate dev --name <change>` instead (see
[`DONT_BREAK_THIS.md`](../DONT_BREAK_THIS.md) section 5).

Do not run `npm run db:reset` or `npx prisma migrate reset` against a database
that holds data you need. If Prisma reports migration drift, stop and inspect the
database rather than accepting an automatic reset.

### Secure local seed and reset policy (TSK-122)

Anonymous `POST /api/dev/public-seed` and `POST /api/dev/public-seed-uat`
endpoints do not exist. Destructive seed/reset operations are always denied in
staging, production, CI and recognized cloud deployments.

To prepare demo data, create a disposable local PostgreSQL database whose name
ends in `_sandbox` or `_test`. Its `DATABASE_URL` must use `localhost`,
`127.0.0.1` or `::1`. Verify that this loopback port is not forwarded or
tunneled to a remote database. Then set matching values in `server/.env`:

```env
NODE_ENV=development
LOCAL_DESTRUCTIVE_SEED=true
LOCAL_SEED_DATABASE=mg_portal_sandbox
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5433/mg_portal_sandbox?schema=public
```

After applying migrations, run from the repository root:

```bash
npm run seed
# Or prepare the local UAT fixture:
npm run seed:uat
```

Both commands fail closed before Prisma access when any safeguard is missing.
When the API runs with the same approved configuration, an authenticated active
Admin sees the Navbar **Reset Demo Data** control and the Data Sampler **Full
Reset** / **Reset to Seed Data** controls. The frontend capability response only
controls visibility; the backend repeats every authorization and safety check.
Normal Data Sampler record generation remains available without enabling reset.

### Seed and maintenance commands

Run from the repository root (each forwards to the `server` workspace):

| Command | What it does |
| :--- | :--- |
| `npm run seed` | Full demo dataset. Destructive-capable and allowed only for the explicitly opted-in disposable local database described above |
| `npm run seed:users-only` | Only the standard accounts (use after `npm run db:clean` for an otherwise empty database) |
| `npm run seed:accounts` | Companies, customers and suppliers only |
| `npm run seed:driver-demo` | Adds today's demo runs for the seeded drivers, idempotent. See [driver-demo-seed.md](./driver-demo-seed.md) |
| `npm run seed:uat` | Destructive local UAT dataset preparation; uses the same disposable-database safeguards and is not exposed on the login screen |
| `npm run db:clean` / `npm run db:reset` | **Destructive:** `prisma migrate reset --force`, wipes the database |
| `npm run pod:reconcile` | Removes untracked local POD files and reports metadata whose file is missing |

Maintenance scripts (run via `--workspace=mg-portal-server`): `drivers:import`,
`drivers:identity-report`, `drivers:migrate-coverage`. See
[`server/prisma/DRIVER_IMPORT.md`](../server/prisma/DRIVER_IMPORT.md).

## 5. Run the application

From the repository root:

```bash
npm run dev
```

This starts both workspaces:

- Frontend: <http://localhost:3000> (Vite proxies `/api/*` to port 4000)
- Backend API: <http://localhost:4000>
- Health check: <http://localhost:4000/api/health>

To run them separately, use `npm run dev --workspace=server` and
`npm run dev --workspace=client` in two terminals.

## 6. Log in locally

Open <http://localhost:3000> and use a seeded account (demo values from
`server/prisma/seeds/users.ts`; development only, never reuse them anywhere real):

| Email | Password | Role |
| :--- | :--- | :--- |
| `admin@microgenesis.com` | `admin123` | Admin |
| `sales@microgenesis.com` | `password123` | Sales Coordinator |
| `logistics@microgenesis.com` | `password123` | Logistics |
| `tass@microgenesis.com` | `password123` | TASS |
| `driver@microgenesis.com` | `password123` | Driver (Leo Driver) |

`seed:users-only` creates the same accounts. An Admin can create more accounts,
link a Driver login to a driver profile, and edit per-user module access from
**Admin Panel → Users**.

## 7. Checks and tests

| Purpose | Command |
| :--- | :--- |
| Type check frontend | `npm run lint --workspace=client` (or `cd client && npx tsc --noEmit`) |
| Type check backend | `npm run lint --workspace=server` (or `cd server && npx tsc --noEmit`) |
| Validate Prisma schema | `npm run prisma:validate --workspace=mg-portal-server` |
| Production build | `npm run build` (client build); `npm run build --workspace=mg-portal-server` for the API |
| Server tests | `cd server && node --import tsx --test tests/*.test.ts` |
| Client tests | `cd client && node --import tsx --test tests/*.test.ts src/components/__tests__/*.test.ts src/utils/__tests__/*.test.ts src/utils/tests/*.test.ts` |
| End-to-end (Playwright) | `npm run e2e`, `npm run e2e:sc`, `npm run e2e:logistics`, `npm run e2e:driver` (servers must already be running; `npm run e2e:report` opens the report) |

Both workspaces use Node's built-in test runner (`node:test`) through `tsx`, not
Vitest. Server tests use the real routers and middleware with Prisma test
doubles; they do not need a database. CI (`.github/workflows/ci.yml`) runs
schema validation, type checks and builds; it does not run the test suites.

## POD file storage

Local POD files are stored under `server/uploads/pod/`. Metadata lives in
PostgreSQL (`PodAttachment`), files are served through authenticated record
routes, and uploads are limited to 10 MB per file. JPG/PNG photos are verified
by byte signature and pixel decoding before they count as delivery proof.
Staging/production use Supabase Storage (`POD_STORAGE_PROVIDER="supabase"`).

## Troubleshooting

### Database connection failure

Confirm the container is running (`docker compose ps`), then confirm
`server/.env` uses port `5433` and the same credentials as the root `.env`.

### Prisma asks to reset the database

The live database and migration history are out of sync. Do not accept the reset
if the database contains data you need. Back up and resolve the migration history first.

### You changed `server/prisma/schema.prisma` and things broke

Do not hand-edit the database or use `prisma db push` for shared environments.
From `server/`:

```bash
npx prisma migrate dev --name describe-your-change
npx prisma generate
```

Commit the generated migration directory with the schema change. Other
environments apply it with `npx prisma migrate deploy`. See
[`DONT_BREAK_THIS.md`](../DONT_BREAK_THIS.md).

### Render reports `P2021` or a missing `DeliveryRecord` table

Prisma queried a table that does not exist in the database named by
`DATABASE_URL`. A new Render database starts empty, so the service must apply
migrations before starting. `render.yaml` uses:

```yaml
startCommand: npx prisma migrate deploy && npm run start
```

Do not replace it with only `npm run start`. After deploying, confirm the
Render log lists each migration as applied and that `DATABASE_URL` points to the
intended database and `public` schema.

### Cloudflare deployment

See the [Cloudflare deployment guide](./CLOUDFLARE_DEPLOYMENT.md).

### Frontend cannot reach the backend

Make sure the backend is running on port `4000` and open
<http://localhost:4000/api/health>. Check the backend terminal for errors.

### Port already in use

Stop the process using port `3000`, `4000` or `5433`, or change the matching
environment/Compose setting before restarting.

### I want an empty database with users only

Destructive; removes all local business data:

```bash
npm run db:clean
npm run seed:users-only
```

## Where to go next

- [`DONT_BREAK_THIS.md`](../DONT_BREAK_THIS.md)
- [System architecture](./SYSTEM_ARCHITECTURE.md)
- [Business requirements](./BUSINESS_REQUIREMENTS.md)
- [API contract](./API_CONTRACT.md)
- [Module access](./MODULE_ACCESS.md)
- [UAT plan](./UAT_PLAN.md)
- [Git cheat sheet](./git-cheat-sheet.md)
