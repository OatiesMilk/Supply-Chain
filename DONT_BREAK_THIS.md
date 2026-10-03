# Don't Break This

A short list of things in this codebase that look editable — and are, technically — but will quietly break something important if you change them without knowing why they're built this way. If you're using AI tools to make changes ("vibe coding"), it's worth pasting this whole file into your prompt as context before asking for a change in one of these areas.

If you're not sure whether something you want to change is on this list, ask before you change it, or grep the README for it first.

---

## 1. There is one giant `DeliveryRecord` table, not five

Deliveries, RMA, Sales Orders, Procurement Pick-up, and Accounting Collection all live in the **same** database table (`DeliveryRecord`). A field called `category` is what tells them apart. This is intentional — the export system, audit trail, status history, and reporting all rely on there being one table.

**Don't:** split this into separate tables per category, or create a new table for a "new" record type that's really just another category.
**Do:** if you need a new kind of record that behaves like the existing five, add it as a new `category` value instead.

## 2. Permissions are checked in TWO places, and both must agree

Who can see or do what is enforced twice:
- On the frontend, in `src/App.tsx` (`DEFAULT_ROLE_SCOPE`) — this only controls what's *shown* in the UI.
- On the backend, in `server/src/middleware/auth.ts` (`requireAuth`/`requireRole`) — this is the *real* security boundary.

**Don't:** change only the frontend to "give someone access" to a screen or button. Hiding a button doesn't stop someone from calling the API directly — the backend check is what actually protects the data.
**Do:** if you're changing who can do something, change the backend route's `requireRole(...)` first, then update the frontend to match. If you only touch one side, you'll either create a security hole (frontend hidden, backend still open) or a confusing bug (backend blocks it, frontend still shows it as available).

## 3. Most "notifications" in Output Actions are fake — on purpose

The Output Actions panel (the one with "Notify Logistics", "Notify TASS", "Export to PDF" toggles) only *actually* does something for one out of six trigger events: when a delivery is marked **Accomplished**. That one sends a real (if mocked) email and writes a database log. The other five just show a confirmation banner — no real email, no real notification is sent.

**Don't:** assume a toggle in that panel is doing something just because the UI shows a checkmark or confirmation message.
**Don't:** "fix" the other five triggers to also fake it further, or remove them thinking they're dead code — they're deliberately simulated to demonstrate the intended behavior without wiring up real automation yet.
**Do:** if you're asked to make one of these real, look at `server/src/services/notify.ts` — that's the one real example to copy the pattern from.

## 4. Emails aren't really sent — they're printed to the terminal

Unless someone has filled in real `SMTP_*` values in `server/.env`, every "email" the app sends just gets logged to the backend terminal window, not actually delivered. This is intentional for a demo/dev environment.

**Don't:** be surprised when a "notification email" never arrives in an inbox — check the backend terminal output instead.
**Do:** if real email delivery is needed, fill in `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` in `server/.env` — the code already supports it, nothing to build.

## 5. Database changes go through Prisma migrations, never by hand

The database schema lives in `server/prisma/schema.prisma`. You should never manually add/rename/delete a column directly in the database (through a database GUI tool, for example).

**Don't:** edit the database directly, or edit `schema.prisma` and just restart the server expecting it to update the database.
**Do:** edit `schema.prisma`, then run `npx prisma migrate dev --name something-descriptive` from inside `server/`. This creates a migration file (in `server/prisma/migrations/`) that records the change and applies it safely.

## 6. Deploying to production automatically re-runs the database migrations AND the seed script

Look at `render.yaml` — every single deploy runs `prisma migrate deploy` (applies any new migrations) **and then re-runs the demo seed script** against the live database. This is fine for a demo, but it means:

**Don't:** write a migration you haven't tested locally first — a bad migration goes straight at the real deployed database on the next deploy, with no manual approval step in between.
**Don't:** assume production data is safe from the seed script if this app is ever used with real, non-demo data — right now every deploy re-seeds. If this project ever moves from "demo" to "real data in production," someone needs to remove the seed step from `render.yaml` first.

## 7. TASS's role is not finalized — treat it as a guess, not a spec

`TASS` stands for **Technical Admin System Services**. Nobody has confirmed with the actual TASS department what they need this role to do — everything currently implemented for TASS (collection verification, its dashboard, its permissions) is this project's best guess, made before a stakeholder meeting.

**Don't:** treat TASS's current permissions or workflow as "the correct requirements" and build heavily on top of them, or describe them to anyone as confirmed.
**Do:** check `docs/ROLES.md` for the latest status before changing or extending anything TASS-related — and update that doc if you learn anything new from an actual TASS stakeholder.

## 8. The `Warehouses` screen exists in the code but is deliberately turned off

`WarehousesView.tsx` and related files are still in the codebase, but they're explicitly blocked from ever appearing in the UI, in `src/App.tsx`. This wasn't left in by accident.

**Don't:** delete these files assuming they're abandoned junk, or re-enable them without checking why they were retired first (the inventory data model doesn't currently support multiple warehouse locations per item, which is part of why this was shelved).

## 9. Record IDs are generated in specific number ranges — don't let them collide

Human-readable record IDs (`REC-XXXXX`) are generated from different number ranges depending on where the record came from: seed data (4001–4999), normal user-created records (10000–49999), and Admin's Data Sampler tool (50000–99999).

**Don't:** hardcode a new ID range, or generate IDs randomly, without checking existing ranges — you could create duplicate IDs.

## 10. Uploaded "documents" aren't actually stored

The `documentAttachment` field only stores a filename, as text. No actual file is uploaded or saved anywhere.

**Don't:** assume that field means there's a real file behind it. If someone asks for real file uploads/storage, that's a new feature to build, not something to fix.
