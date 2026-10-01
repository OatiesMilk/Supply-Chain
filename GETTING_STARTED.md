# Getting Started

This guide sets up the Supply Chain Portal locally on **Linux** or
**Windows**. The frontend runs on port `3000`, the backend runs on port
`4000`, and PostgreSQL runs in Docker on port `5433`.

## Prerequisites

- Git
- Node.js 18 or newer
- npm
- Docker Desktop (Windows) or Docker Engine with the Compose plugin (Linux)

Check the installed tools:

```bash
node --version
npm --version
docker --version
docker compose version
```

On Windows, run the commands below in **PowerShell**. On Linux, run them in
your terminal. Docker Desktop must be running on Windows before starting the
database.

## 1. Clone and install

```bash
git clone https://github.com/MarcZxc1/Supply-Chain.git
cd Supply-Chain
npm install
```

The repository uses npm workspaces, so installing from the root installs both
the `client` and `server` dependencies. Do not run a second `npm install`
inside `server/`.

## 2. Configure environment files

### Linux

```bash
cp .env.example .env
cp .env server/.env
```

### Windows PowerShell

```powershell
Copy-Item .env.example .env
Copy-Item .env server/.env
```

Edit `server/.env` and confirm these local values:

```env
DATABASE_URL="postgresql://mg_portal_user:replace_with_a_secure_database_password@127.0.0.1:5433/mg_portal?schema=public"
JWT_SECRET="replace-with-a-long-random-development-secret"
PORT=4000
CLIENT_ORIGIN="http://localhost:3000"
POD_UPLOAD_DIR="./uploads/pod"
POD_STORAGE_PROVIDER="local"
SUPABASE_URL=""
SUPABASE_SERVICE_ROLE_KEY=""
SUPABASE_STORAGE_BUCKET="pod"
```

`DATABASE_URL` must use the same username, password, database, host, and port
as the Docker settings in the root `.env`. `POD_UPLOAD_DIR` is relative to
the `server/` directory and is ignored by Git. Local development uses
`POD_STORAGE_PROVIDER="local"`. Staging/production should use
`POD_STORAGE_PROVIDER="supabase"` with a private bucket and the server-only
`SUPABASE_SERVICE_ROLE_KEY`; never expose that key to the client.

Never commit `.env`, `server/.env`, or credentials to source control.

## 3. Start PostgreSQL with Docker

Run from the repository root.

### Linux and Windows PowerShell

```bash
docker compose up -d
docker compose ps
```

The database is available at `127.0.0.1:5433`. To view database logs:

```bash
docker compose logs -f postgres
```

To stop PostgreSQL while preserving its data:

```bash
docker compose down
```

To stop PostgreSQL and delete all local database data:

```bash
docker compose down -v
```

The last command is destructive. It does not delete files in the POD upload
directory because POD files are stored by the backend outside this
PostgreSQL-only Compose service.

## 4. Apply migrations and seed demo data

```bash
cd server
npx prisma migrate dev
npm run seed
cd ..
```

For a clean database in a disposable local environment, use:
npx prisma generate
npx prisma migrate deploy
```

`migrate deploy` applies every committed migration, including the `LineItem`
migration required by the current delivery-record API. This is the same
migration command used by staging and production; it prevents a fresh
environment from having Prisma code that expects tables which do not exist.

```bash
npm run db:reset
```

Do not run `migrate reset` against a database containing data you need. If
Prisma reports migration drift, stop and inspect the database rather than
accepting an automatic reset.

## 5. Run the application

From the repository root:

```bash
npm run dev
```

This starts both workspaces:

- Frontend: <http://localhost:3000>
- Backend API: <http://localhost:4000>
- Health check: <http://localhost:4000/api/health>

To run them separately:

### Linux

```bash
# Terminal 1
cd server
npm run dev

# Terminal 2
cd client
npm run dev
```

### Windows PowerShell

```powershell
# Terminal 1
Set-Location server
npm run dev

# Terminal 2
Set-Location client
npm run dev
```

## 6. Log in locally

Open <http://localhost:3000> and use a seeded account:

| Email | Password | Role |
|---|---|---|
| `admin@microgenesis.com` | `password123` | Admin |
| `sales@microgenesis.com` | `password123` | Sales Coordinator |
| `logistics@microgenesis.com` | `password123` | Logistics |
| `tass@microgenesis.com` | `password123` | TASS |

An Admin can create Driver accounts from **Admin Panel → Users**.

## POD file storage

Local POD files are stored under:

```text
server/uploads/pod/
```

The application stores file metadata in PostgreSQL and serves files through
authenticated record routes. Uploads are limited to 10 MB per file. The
storage provider can later be replaced with Supabase Storage without changing
the delivery UI or database API.

## Useful Docker commands

These commands are the same in Linux shells and Windows PowerShell:

```bash
docker compose up -d                 # start PostgreSQL
docker compose ps                    # show service status
docker compose logs -f postgres      # follow database logs
docker compose restart postgres      # restart PostgreSQL
docker compose stop                  # stop without removing containers
docker compose down                  # stop and remove containers
docker compose down -v               # remove containers and database volume
```

## Troubleshooting

### Database connection failure

Confirm that the container is running:

```bash
docker compose ps
```

Then confirm that `server/.env` uses port `5433` and the same credentials as
the root `.env`.

### Prisma asks to reset the database

This means the live database and migration history are out of sync. Do not
accept the reset if the database contains data you need. Back up the database
and resolve the migration history before continuing.

### Frontend cannot reach the backend

Make sure the backend is running on port `4000` and visit
<http://localhost:4000/api/health>. Check the backend terminal for errors.

### Port already in use
**You changed `server/prisma/schema.prisma` and now things are broken**
Don't hand-edit the database directly or use `prisma db push` for shared
environments. From inside `server/`, create and review a migration locally:

```bash
npx prisma migrate dev --name describe-your-change
npx prisma generate
```

Commit the generated migration directory with the schema change. Other
environments apply it with `npx prisma migrate deploy`. See
[`DONT_BREAK_THIS.md`](./DONT_BREAK_THIS.md) for why this matters.

Stop the process using port `3000`, `4000`, or `5433`, or change the
corresponding environment/Compose setting before restarting.

## Further documentation
**You want an empty database with users only**
This destructive workflow removes all local business data and creates only the
standard Admin, Sales Coordinator, Logistics, and TASS accounts:

```bash
npm run db:clean
npm run seed:users-only
```

It leaves companies, customers, suppliers, deliveries, inventory, drivers,
notifications, audit history, and POD metadata empty.

**You want to reconcile local POD files**
If an upload or delete operation is interrupted, run the maintenance command
from the repository root to remove untracked POD files and report metadata
whose physical file is missing:

```bash
npm run pod:reconcile
```

## Where to go next

- [`DONT_BREAK_THIS.md`](./DONT_BREAK_THIS.md)
- [`docs/API_CONTRACT.md`](./docs/API_CONTRACT.md)
- [`docs/MODULE_ACCESS.md`](./docs/MODULE_ACCESS.md)
- [`docs/git-cheat-sheet.md`](./docs/git-cheat-sheet.md)
