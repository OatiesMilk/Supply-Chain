# Don't Break This

> Source-reviewed: 2026-10-13 against commit `e90986a` (`dev`). This is a snapshot, **not an immutable specification or a staging/production configuration audit**. Recheck current code, tests, approved requirements and deployment settings before applying any guidance below.

> Targeted health update, 2026-11-05: public readiness now returns only availability.
> Use authenticated Admin diagnostics for mailer/configuration details; see the
> [current implementation record](docs/SUPPLY_CHAIN_IMPLEMENTATION_STATUS_2026-11-05.md#healthreadiness-follow-up).

A short list of things in this codebase that look editable — and are, technically — but will quietly break something important if you change them without knowing why they're built this way. If you're using AI tools to make changes ("vibe coding"), it's worth pasting this whole file into your prompt as context before asking for a change in one of these areas.

If you're not sure whether something you want to change is on this list, ask before you change it, or grep the README for it first.

---

## 1. There is one giant `DeliveryRecord` table, not five

Deliveries, RMA, Sales Orders, Procurement Pick-up, and Accounting Collection all live in the **same** database table (`DeliveryRecord`). A field called `category` is what tells them apart. This is intentional — the export system, audit trail, daily status snapshots, and reporting all rely on there being one table.

**Don't:** split this into separate tables per category or introduce a second record model just for a new operational record category without an approved architecture change.
**Do:** follow the existing one-model design. Adding a category requires updating category mappings, server validation, record scope/role permissions, frontend routes, exports, reports, lifecycle handling and regression tests—not merely writing a new string value. See `server/src/services/recordAccess.ts`, `server/src/mappings.ts` and the business requirements.

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

## 3. Output Actions are mixed real and simulated behavior—inspect the call path

`client/src/outputActions.ts` supports **Record Created, Accomplished, Rescheduled, On-Hold, RMA Completed, and Collection Verified**. When a caller supplies **both** an existing `recordId` and an API client, selected email-recipient toggles can call the real, authenticated `POST /api/notifications/send-email` endpoint in `server/src/routes/notifications.ts`; that route resolves recipients, invokes Graph/SMTP/**mock** transport and writes `NotificationLog` entries. Status-change callers in `DeliveryRecordWorkspace.tsx` and `DriverView.tsx` can supply that context. These email side effects are **not limited to Accomplished**.

Other portions remain simulated or incomplete: the **Export to PDF** toggle reports a banner but does not itself generate a file; the creation form invokes `runOutputActions('Record Created', ...)` **without** the saved record ID or API client, so that invocation displays feedback but does not send its configured email. A banner such as "Email sent" is **not proof** that an email was sent, delivered, or even attempted; verify the API call, resolved recipients and `NotificationLog` status. Separately, `server/src/services/notify.ts` implements the dedicated Accomplished notification, and the in-app bell / scheduled reminders are separate workflows.

**Don't:** disable real email behavior assuming all non-Accomplished triggers are mock-only; do not expose unthrottled or CSRF-vulnerable notification endpoints (AUD-003).
**Don't:** interpret confirmation banners as storage, email or PDF evidence, or silently change trigger semantics without stakeholder approval.
**Do:** trace the actual caller → `runOutputActions` → `/api/notifications/send-email` → mailer + audit log, test both real and no-context paths, and preserve intentional simulations unless the ticket explicitly authorizes replacing them.

## 4. Emails are only delivered when a mail provider is configured

With no `AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`/`AZURE_TENANT_ID` (Microsoft Graph) and no `SMTP_HOST` in `server/.env`, every "email" the app sends is only logged to the backend terminal (the `mock` mailer). Authenticated Admin `GET /api/v1/admin/integration-status` reports the configured mode (`graph`, `smtp` or `mock`); public `GET /api/v1/health` returns only readiness. Configured mode does not establish provider delivery.

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
**Don't:** restore the removed anonymous `POST /api/dev/public-seed` or `POST /api/dev/public-seed-uat` routes. The remaining reset routes require an authenticated, active Admin with the relevant resource permission and a server-verified local disposable database. They must remain denied in staging, production, CI and cloud deployments.
**Do:** keep normal Data Sampler generation available. For an intentional local reset, use only a loopback PostgreSQL database named `*_sandbox` or `*_test`, set the explicit local opt-ins, and verify that the loopback port is not a tunnel to a remote database.

## 7. TASS's role is not finalized — treat it as a guess, not a spec

`TASS` stands for **Technical Admin System Services**. Nobody has confirmed with the actual TASS department what they need this role to do — everything currently implemented for TASS (RMA and Accounting Collection access, collection verification, its dashboard, its permissions) is this project's best guess, made before a stakeholder meeting.

**Don't:** treat TASS's current permissions or workflow as "the correct requirements" and build heavily on top of them, or describe them to anyone as confirmed.
**Do:** check `docs/archive/ROLES.md` and the open questions in [`docs/BUSINESS_REQUIREMENTS.md`](docs/BUSINESS_REQUIREMENTS.md) before changing or extending anything TASS-related — and update them if you learn anything new from an actual TASS stakeholder.

## 8. The `Warehouses` screen exists in the code but is deliberately turned off

`WarehousesView.tsx` and `WarehouseWorkspace.tsx` remain in `client/src/features/inventory/`, but no screen routes to them (`client/src/routes/AppRouter.tsx` has no case for them and there is no sidebar entry). This wasn't left in by accident.

**Don't:** delete these files assuming they're abandoned junk, or re-enable them without checking why they were retired first (the inventory data model doesn't currently support multiple warehouse locations per item, which is part of why this was shelved).

## 9. Record IDs use multiple namespaces—do not assume all IDs are numeric

Standard numeric `REC-XXXXX` IDs are generally assigned in different ranges: the default demo dataset occupies values around **4001–4999**, normal record creation draws random integers in **10000–49999** (`server/src/routes/records.ts`), and the Admin Data Sampler draws random integers in **50000–99999** (`server/src/routes/data-sampler.ts`). These are **conventions, not globally enforced disjoint schemas**; the database unique key still matters.

There are also intentional nonnumeric identifiers: the disposable UAT fixture uses `REC-UAT-DELIVERED-<date>` (`server/prisma/seed-uat.ts`) and driver-demo fixtures use `REC-DEMO-...` (`server/prisma/seed-driver-demo.ts`). Their existence does **not** authorize arbitrary production ID formats.

**Don't:** assume every record ID matches `REC-[0-9]+`, reuse a demo namespace for live records, or add an unchecked random ID generator. Treat uniqueness conflicts and retries explicitly.
**Do:** inspect the generator, unique constraint, import/fixture behavior and references before changing formats or creating new record kinds; preserve existing IDs and historical links.

## 10. Uploaded documents are real files; the old filename field is not

Proof-of-delivery files are stored as **real private files** through the `PodAttachment` table and authenticated `/api/records/:id/attachments` routes; Delivered requires a server-verified JPG/PNG photo. The backend chooses the **Supabase** provider **only** when `POD_STORAGE_PROVIDER=supabase`; otherwise it uses the **local disk** provider (`server/src/services/podStorage.ts`). The current `render.yaml` declares a `/data` persistent disk but does **not** itself set `POD_STORAGE_PROVIDER=supabase`. A production/staging environment might use Supabase through external environment settings, so **inspect the effective deployed configuration**, not just this document, before making operational assumptions.

The older `DeliveryRecord.documentAttachment` column is a legacy filename string only; there is no corresponding stored file behind it.

**Do not** treat documentAttachment as proof of delivery, or accept client claims that a photo exists. The server decodes the stored image at completion.
**Do not** serve uploaded files from a public path or expose a Supabase service-role key to the client; keep files behind authenticated routes. Do not assume production storage is durable merely because a provider or disk is configured—verify it.
**Do** run `npm run pod:reconcile` (from the repo root) if an upload or delete was interrupted, using the correct environment and without destructive reset.
