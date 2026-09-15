# Getting Started

This is the "start here" doc. It assumes you've never touched this codebase, and maybe haven't used Express, Prisma, or Postgres before. Follow the steps in order — don't skip around.

If you get stuck, also read [`DONT_BREAK_THIS.md`](./DONT_BREAK_THIS.md) before you start changing things, and [`docs/GLOSSARY.md`](./docs/GLOSSARY.md) if a term doesn't make sense.

## What this project actually is

Two programs that run at the same time and talk to each other:

1. **The backend** (`server/` folder) — handles logins, and reads/writes everything to a database. Lives on port `4000`.
2. **The frontend** (everything else, mostly `src/`) — the actual website you click around in. Lives on port `3000` and asks the backend for data.

Both need to be running for the app to work. Neither one works alone.

There's also a **database** — this app needs a real PostgreSQL database to store its data (delivery records, users, etc.). You can't skip this step; the app does not work with no database at all.

## Step 0 — Get a database

The simplest option: create a free Postgres database at [Render](https://render.com) or [Supabase](https://supabase.com) (or install Postgres locally if you're comfortable with that). Either way, you end up with a connection string that looks like:

```
postgresql://username:password@host:5432/databasename
```

Keep that string handy — you'll paste it into a file in Step 2.

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

## Step 2 — Set up environment variables

The backend needs a config file that isn't checked into git (because it has secrets in it). Copy the example and fill it in:

```bash
cd server
cp .env.example .env
```

Open `server/.env` and edit these two lines:

- `DATABASE_URL` — paste the Postgres connection string from Step 0 here.
- `JWT_SECRET` — replace `change-me-to-a-long-random-string` with literally any long random string (this signs login sessions — it just needs to be unpredictable).

Leave everything else as-is for now (`PORT`, `CLIENT_ORIGIN`, the `SMTP_*` lines).

## Step 3 — Set up the database tables

Still inside `server/`:

```bash
npx prisma migrate dev
```

This reads the schema file (`server/prisma/schema.prisma`) and creates all the tables in your database. If it works, you'll see a list of migrations being applied.

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
Don't hand-edit the database directly. After changing the schema file, run `npx prisma migrate dev --name describe-your-change` from inside `server/` to generate a proper migration. See [`DONT_BREAK_THIS.md`](./DONT_BREAK_THIS.md) for why this matters.

**You want to wipe everything and start over with fresh demo data**
Log in as Admin → Admin Panel → Data Sampler → "Reset to Seed Data". Or from the backend: `npm run seed` again (after truncating tables) — see `server/prisma/seed.ts`.

## Where to go next

- [`DONT_BREAK_THIS.md`](./DONT_BREAK_THIS.md) — read this before making changes.
- [`docs/GLOSSARY.md`](./docs/GLOSSARY.md) — what TASS, RMA, SKU, etc. actually mean.
- [`README.md`](./README.md) — the full feature-by-feature reference doc.
- [`docs/ROLES.md`](./docs/ROLES.md) — full breakdown of what each login role can and can't do.
