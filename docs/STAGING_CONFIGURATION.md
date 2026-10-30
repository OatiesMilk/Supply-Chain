# Staging configuration

Use the example files as templates and replace placeholders privately. They do
not change a running environment or create accounts/data. Keep the staging
frontend, API, database and private storage pointed at the intended staging
resources.

## Separate the three environments

| Layer | Example / location | Settings |
|---|---|---|
| Express API runtime | [server/.env.staging.example](../server/.env.staging.example) → backend service variables | `NODE_ENV=production`, `APP_ENV=staging`, database/auth/storage settings, allowed origins |
| Vite frontend build | [client/.env.staging.example](../client/.env.staging.example) → `client/.env.staging` or build environment | `VITE_SHOW_DEMO_ACCOUNTS=false` |
| Cloudflare Worker runtime | Worker service variables and secrets | `API_BASE_URL` points to the staging API; `PROXY_SHARED_SECRET` matches the API secret when configured |

The root `.env` configures local Docker PostgreSQL. The API uses plain dotenv,
which loads `.env` from its working directory (normally `server/`); it does not
automatically select `.env.staging`. Hosted API settings belong in the backend
service environment. `APP_ENV=staging` is used by the guarded staging seed CLI;
it does not control the frontend build or hide login content.

Vite loads its files from `client/`, not the repository root or `server/`.
Every `VITE_*` value is public browser configuration. Keep `DATABASE_URL`,
`JWT_SECRET`, Microsoft client secrets and `SUPABASE_SERVICE_ROLE_KEY` on the
server. The Worker's `API_BASE_URL` is a runtime setting, not a Vite variable;
the browser sends API requests to same-origin `/api/*`.

## Hide login demo content

Copy the frontend staging template to `client/.env.staging`, or set
`VITE_SHOW_DEMO_ACCOUNTS=false` in the frontend build environment. Build with:

```bash
npm run build --workspace=client -- --mode staging
```

Deploy the resulting `client/dist` assets through the existing deployment
workflow. The login Quick Switch, its demo-account buttons and demo setup text
are hidden in staging and production builds, even if the flag was mistakenly
set to `true`. Setting only a backend runtime variable cannot modify assets
already built by Vite; rebuild and deploy the frontend for frontend changes.

Local demos require Vite development mode and an explicit
`VITE_SHOW_DEMO_ACCOUNTS=true` in `client/.env` (restart the dev server after
changing it). [client/.env.example](../client/.env.example) defaults to false.
Normal Microsoft/email sign-in remains available. This flag hides demo UI; it
does not deactivate existing demo users or change authentication permissions.

## API settings

Set `NODE_ENV=production` for hosted staging, a distinct random `JWT_SECRET`,
the reviewed staging `DATABASE_URL`, and the staging frontend HTTPS origin in
both `CLIENT_ORIGIN` and `APP_URL`. Use `POD_STORAGE_PROVIDER=supabase` with the
private staging project/bucket settings. Add `TRUSTED_ORIGINS` only when another
frontend origin is intentionally permitted.

If requests go through the Cloudflare Worker, configure the same
`PROXY_SHARED_SECRET` on both sides. Enable `REQUIRE_PROXY_SECRET=true` only
after both sides are configured. For another reverse proxy without that secret,
set `TRUST_PROXY` to the verified hop count. Leave `LOCAL_DESTRUCTIVE_SEED=false`;
local demo/UAT reset commands remain unavailable on hosted staging.

The staging API template leaves Microsoft and SMTP credentials empty. Enabling
Microsoft SSO requires a specific corporate `AZURE_TENANT_ID` GUID and approved
client credentials. The current mailer also uses those Azure credentials to
select Microsoft Graph before SMTP, so review staging mail delivery separately
before enabling them. With neither Azure nor SMTP configured, email uses the
existing mock behavior. This change does not add a mail-provider selector.

Microsoft sign-in requests an account picker. Users can choose a remembered
corporate account or use another account; choosing an existing session does not
require entering their email/password again. Portal logout clears only the
portal session, preserving Microsoft 365 and Teams sessions. This avoids global
Microsoft sign-out when switching portal accounts. Tenant and Admin-approved
Microsoft identity checks still apply to the chosen account.

Leave the Entra app registration's **Front-channel logout URL** blank: the portal
does not implement that endpoint. This account picker does not implement or
verify native Teams SDK SSO or sign-in within an embedded Teams tab; validate
those deployment flows separately.

Staging data preparation is optional and never runs automatically during startup
or deployment. The commented `STAGING_SEED_*` settings in the API template are
used only by the [guarded staging seed commands](./staging-seed.md); supply them
only for that separate reviewed operation.

## Collection billing notifications

Set `BILLING_NOTIFICATION_USER_EMAIL` in the API environment to the exact email
of the approved billing recipient's existing active portal account. The account
must currently be allowed to read Accounting Collection records. This mapping
works in LEGACY and V1; V1 also requires verified permission conversion. It does
not grant permissions or create an account. Missing, ambiguous, inactive or denied
mappings are recorded as `SKIPPED` in the notification log, with no placeholder
address or inferred mailbox. Account Manager completion emails similarly require
one exact active portal identity with record access.

Completion workflow notifications run automatically. The UI's additional output
preferences govern extra emails and PDF exports, and cannot suppress the required
completion handoff. A mock provider records `MOCKED`, not `SENT`; a configured
provider's acceptance still does not prove inbox delivery. Review recipient
mapping and provider configuration separately before enabling live delivery.
