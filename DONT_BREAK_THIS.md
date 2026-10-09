# Don't Break This

> Last verified: 2026-10-09 against commit `ccbf192` (`dev`).

A short list of things in this codebase that look editable — and are, technically — but will quietly break something important if you change them without knowing why they're built this way. If you're using AI tools to make changes ("vibe coding"), it's worth pasting this whole file into your prompt as context before asking for a change in one of these areas.

If you're not sure whether something you want to change is on this list, ask before you change it, or grep the README for it first.

---

## 1. There is one giant `DeliveryRecord` table, not five

Deliveries, RMA, Sales Orders, Procurement Pick-up, and Accounting Collection all live in the **same** database table (`DeliveryRecord`). A field called `category` is what tells them apart. This is intentional — the export system, audit trail, daily status snapshots, and reporting all rely on there being one table.

**Don't:** split this into separate tables per category, or create a new table for a "new" record type that's really just another category.
**Do:** if you need a new kind of record that behaves like the existing five, add it as a new `category` value instead.

## 2. Permissions are checked in TWO places, and both must agree

The canonical policy is `server/src/services/permissions.ts`. Login and session
restoration return effective permissions to the frontend; the Admin editor uses
the same policy. The frontend uses that snapshot to gate navigation, routes and
queries. Backend routes enforce `requireResource`/`requireScreen` and retain
`requireRole` and field-level restrictions for privileged actions.

**Don't:** reintroduce separate role defaults in the frontend or treat hiding a
button as API authorization. A module grant must not implicitly grant user
management or other administrative actions.
**Do:** update the canonical policy and relevant API guards together, and cover
both allowed and denied requests. See [Module access](docs/MODULE_ACCESS.md) for
shared-resource rules, session refresh and the test checklist.

---

## 3. Most "Output Actions" are simulated, on purpose

The Output Actions panel (the one with "Notify Logistics", "Notify TASS", "Export to PDF" toggles) only *actually* does something for one trigger: when a delivery is marked **Accomplished**. That one sends an email (real if Microsoft Graph or SMTP is configured, otherwise logged to the terminal) and writes a `NotificationLog` row. The other triggers only show a confirmation banner from this panel.

Real in-app (bell) notifications and the scheduled 4 PM / 6 PM / weekly jobs are separate from this panel and are implemented (`server/src/services/inAppNotify.ts`, `server/src/index.ts`).

**Don't:** assume a toggle in that panel is doing something just because the UI shows a checkmark or confirmation message.
**Don't:** "fix" the other triggers to fake it further, or remove them thinking they're dead code — they're deliberately simulated to demonstrate the intended behavior without wiring up real automation yet.
**Do:** if you're asked to make one of these real, look at `server/src/services/notify.ts` — that's the one real example to copy the pattern from.

## 4. Emails are only delivered when a mail provider is configured

With no `AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`/`AZURE_TENANT_ID` (Microsoft Graph) and no `SMTP_HOST` in `server/.env`, every "email" the app sends is only logged to the backend terminal (the `mock` mailer). `GET /api/health` reports which mode is active (`graph`, `smtp` or `mock`).

**Don't:** be surprised when a "notification email" never arrives in an inbox — check the backend terminal output instead.
**Do:** if real email delivery is needed, configure Graph or fill in `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` in `server/.env` — the code already supports it, nothing to build.

## 5. Database changes go through Prisma migrations, never by hand

The database schema lives in `server/prisma/schema.prisma`. You should never manually add/rename/delete a column directly in the database (through a database GUI tool, for example).

**Don't:** edit the database directly, or edit `schema.prisma` and just restart the server expecting it to update the database.
**Do:** edit `schema.prisma`, then run `npx prisma migrate dev --name something-descriptive` from inside `server/`. This creates a migration file (in `server/prisma/migrations/`) that records the change and applies it safely.

## 6. Deploys run migrations, not the seed — keep it that way

`render.yaml` starts the API with `npx prisma migrate deploy && npm run start`. The demo seed is **not** run on deploy any more. Every deploy still applies new migrations straight to the live database with no approval step.

**Don't:** write a migration you haven't tested locally first.
**Don't:** add `seed` back to `startCommand`. `runSeed(true)` deletes every table.
**Don't:** leave `POST /api/dev/public-seed` reachable in production. It is unauthenticated and calls `runSeed(true)` (see issue 13.1 in [the issues report](docs/PROJECT_ISSUES_REPORT.md)). Only `/api/dev/reset-seed` (Admin, blocked in production) and `/api/dev/public-seed-uat` (blocked in production, needs `UAT_SEED_ENABLED=true`) are guarded.

## 7. TASS's role is not finalized — treat it as a guess, not a spec

`TASS` stands for **Technical Admin System Services**. Nobody has confirmed with the actual TASS department what they need this role to do — everything currently implemented for TASS (RMA and Accounting Collection access, collection verification, its dashboard, its permissions) is this project's best guess, made before a stakeholder meeting.

**Don't:** treat TASS's current permissions or workflow as "the correct requirements" and build heavily on top of them, or describe them to anyone as confirmed.
**Do:** check `docs/archive/ROLES.md` and the open questions in [`docs/BUSINESS_REQUIREMENTS.md`](docs/BUSINESS_REQUIREMENTS.md) before changing or extending anything TASS-related — and update them if you learn anything new from an actual TASS stakeholder.

## 8. The `Warehouses` screen exists in the code but is deliberately turned off

`WarehousesView.tsx` and `WarehouseWorkspace.tsx` remain in `client/src/features/inventory/`, but no screen routes to them (`client/src/routes/AppRouter.tsx` has no case for them and there is no sidebar entry). This wasn't left in by accident.

**Don't:** delete these files assuming they're abandoned junk, or re-enable them without checking why they were retired first (the inventory data model doesn't currently support multiple warehouse locations per item, which is part of why this was shelved).

## 9. Record IDs are generated in specific number ranges — don't let them collide

Human-readable record IDs (`REC-XXXXX`) are generated from different number ranges depending on where the record came from: seed data (4001–4999), normal user-created records (10000–49999), and Admin's Data Sampler tool (50000–99999).

**Don't:** hardcode a new ID range, or generate IDs randomly, without checking existing ranges — you could create duplicate IDs.

## 10. Uploaded documents are real files; the old filename field is not

Proof-of-delivery files are stored for real (local disk in development, Supabase Storage in staging/production) and tracked in the PodAttachment table. They are served only through authenticated record routes (/api/records/:id/attachments). Delivered requires a server-verified JPG/PNG photo.

The older DeliveryRecord.documentAttachment column is a legacy filename string only; there is no file behind it.

**Do not** treat documentAttachment as proof of delivery, or accept client claims that a photo exists. The server decodes the stored image at completion.
**Do not** serve uploaded files from a public path; keep them behind the authenticated routes.
**Do** run npm run pod:reconcile if an upload or delete was interrupted.
