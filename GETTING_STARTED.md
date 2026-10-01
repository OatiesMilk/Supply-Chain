# Getting Started

This is the "start here" doc. It assumes you've never touched this codebase, and maybe haven't used Express, Prisma, or Postgres before. Follow the steps in order — don't skip around.

If you get stuck, also read [`DONT_BREAK_THIS.md`](./DONT_BREAK_THIS.md) before you start changing things, and [`docs/GLOSSARY.md`](./docs/GLOSSARY.md) if a term doesn't make sense.

## What this project actually is

Two programs that run at the same time and talk to each other:

1. **The backend** (`server/` folder) — handles logins, and reads/writes everything to a database. Lives on port `4000`.
2. **The frontend** (everything else, mostly `src/`) — the actual website you click around in. Lives on port `3000` and asks the backend for data.

Both need to be running for the app to work. Neither one works alone.

There's also a **database** — this app needs a real PostgreSQL database to store its data (delivery records, users, etc.). You can't skip this step; the app does not work with no database at all.

## Step 0 — Setup Environment & Database (Docker)

The project includes a `docker-compose.yml` and an `.env.example` in the root folder to easily spin up a local PostgreSQL database.

1. **Copy the root environment file**:
   ```bash
   cp .env.example .env
   ```
   *(Edit `.env` if you need to change the default database passwords, though the defaults are fine for local development).*

2. **Start the database via Docker**:
   ```bash
   docker-compose up -d
   ```
   This will spin up a local PostgreSQL instance on port `5433`.

## Step 1 — Install dependencies

From the project root:

```bash
npm install
```

Then also install the backend's own dependencies (it has a separate `package.json`):

```bash
cd server
npm install
cd ..
```

## Step 2 — Setup Server Environment Variables

The backend needs its own `.env` file (which gets created in the `server/` folder). 
Because we use a unified root `.env` for Docker, you just need to copy the root `.env` into the server folder:

```bash
cp .env server/.env
```

Now, open `server/.env` and make sure `DATABASE_URL` is defined properly. (If you copied it from the root, you might need to manually resolve the string interpolation so it reads exactly like this):

```bash
DATABASE_URL="postgresql://mg_portal_user:replace_with_a_secure_database_password@127.0.0.1:5433/mg_portal?schema=public"
JWT_SECRET="make-up-some-random-password-here"
```

## Step 3 — Set up the database tables

Still inside `server/`:

```bash
npx prisma generate
npx prisma migrate deploy
```

`migrate deploy` applies every committed migration, including the `LineItem`
migration required by the current delivery-record API. This is the same
migration command used by staging and production; it prevents a fresh
environment from having Prisma code that expects tables which do not exist.

Then load some demo data (fake users, fake delivery records, etc.) so the app isn't empty:

```bash
npm run seed
```

## Step 4 — Run it

You need **two terminal windows/tabs** open at once.

**Terminal 1 — backend:**
```bash
cd server
npm run dev
```
Leave this running. It should say it's listening on port 4000.

**Terminal 2 — frontend:**
```bash
npm run dev
```
(run from the project root, not `server/`). It should say it's running at `http://localhost:3000`.

## Step 5 — Log in

Open `http://localhost:3000` in your browser. You'll see a login screen with demo accounts listed on it. Use any of these (also listed in the main `README.md`):

| Email | Password | Role |
|---|---|---|
| sales@microgenesis.com | password123 | Sales Coordinator |
| logistics@microgenesis.com | password123 | Logistics |
| tass@microgenesis.com | password123 | TASS |
| admin@microgenesis.com | admin123 | Admin |

If login fails, the backend terminal (Terminal 1) is the first place to look for an error message.

## Troubleshooting

**"Can't reach database server" / Prisma errors on `migrate dev`**
Your `DATABASE_URL` in `server/.env` is wrong, or the database isn't actually running/reachable. Double check the connection string from Step 0.

**Frontend loads but nothing shows up / login button does nothing**
The backend (Terminal 1) probably isn't running, or crashed. Check that terminal for a red error message.

**"Port already in use"**
Something else on your machine is already using port 3000 or 4000. Close whatever that is, or stop a leftover `npm run dev` process from a previous session.

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

**You want to wipe everything and start over with fresh demo data**
Log in as Admin → Admin Panel → Data Sampler → "Reset to Seed Data". Or from the backend: `npm run seed` again (after truncating tables) — see `server/prisma/seed.ts`.

**You want an empty database with users only**
This destructive workflow removes all local business data and creates only the
standard Admin, Sales Coordinator, Logistics, and TASS accounts:

```bash
npm run db:clean
npm run seed:users-only
```

It leaves companies, customers, suppliers, deliveries, inventory, drivers,
notifications, audit history, and POD metadata empty.

## Where to go next

- [`DONT_BREAK_THIS.md`](./DONT_BREAK_THIS.md) — read this before making changes.
- [`docs/GLOSSARY.md`](./docs/GLOSSARY.md) — what TASS, RMA, SKU, etc. actually mean.
- [`README.md`](./README.md) — the full feature-by-feature reference doc.
- [`docs/ROLES.md`](./docs/ROLES.md) — full breakdown of what each login role can and can't do.
