# Microsoft Teams Tab App

This directory contains the Teams app manifest for embedding the Supply Chain Portal as a Teams tab.

## Setup Steps

### 1. Prepare icons

Place two PNG icons in this directory:

- **`icon-color.png`** — 192x192 px, full-color logo (used in Teams app gallery)
- **`icon-outline.png`** — 32x32 px, white-on-transparent outline (used in Teams sidebar)

You can resize `public/microgenesis_logo.png` for the color icon and `public/microgenesis_mark_white.png` for the outline icon.

### 2. Fill in placeholders

`manifest.json` contains three placeholders that must be resolved before the app can be
uploaded to Teams. Don't edit `manifest.json` directly — use `build.sh` (step 5), which
fills them into a generated `manifest.filled.json` and leaves the template untouched.

| Placeholder | Value | Example |
|---|---|---|
| `{{AZURE_CLIENT_ID}}` | Your Azure AD app registration client ID | `12345678-abcd-...` |
| `{{APP_URL}}` | The production URL of the portal | `https://portal.microgenesis.com` |
| `{{APP_DOMAIN}}` | Just the domain (no protocol) | `portal.microgenesis.com` |

### 3. Azure AD app registration

In [Azure Portal → App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps):

1. **Create** a new registration (or use the existing one if SSO is already set up)
2. **Name**: `Microgenesis Supply Chain Portal`
3. **Supported account types**: Single tenant (your org only)
4. **Redirect URI** (Web): `https://portal.microgenesis.com/api/auth/microsoft/callback`
5. Under **Authentication**:
   - Add `https://your-app.onrender.com/api/auth/microsoft/callback` for staging
   - Enable **ID tokens** under Implicit grant
6. Under **Certificates & secrets** → New client secret → copy the value
7. Under **API permissions** → Add: `Microsoft Graph → Delegated → openid, profile, email, User.Read`
8. If sending email via Graph API, also add: `Application → Mail.Send` and grant admin consent
9. Under **Expose an API**:
   - Set Application ID URI to `api://portal.microgenesis.com/{client-id}`
   - Add a scope: `access_as_user`
   - Authorized client applications: add Teams desktop (`1fec8e78-bce4-4aaf-ab1b-5451cc387264`) and Teams web (`5e3ce6c0-2b1f-4285-8d4b-75ee78787346`)

### 4. Set environment variables

On your hosting platform (Render, Azure App Service, etc.), set:

```
AZURE_CLIENT_ID=<from step 6>
AZURE_CLIENT_SECRET=<from step 6>
AZURE_TENANT_ID=<your tenant ID>
APP_URL=https://portal.microgenesis.com
```

### 5. Package and upload to Teams

Run `build.sh` from the `teams/` directory. It reads `AZURE_CLIENT_ID`, `APP_URL`, and
`APP_DOMAIN` from your shell environment (or from a `teams/.env` file — gitignored, never
committed), substitutes them into a generated `manifest.filled.json`, and zips it together
with the two icons as `microgenesis-teams-app.zip`.

```bash
cd teams

# Option A: export the variables directly
export AZURE_CLIENT_ID=12345678-abcd-...
export APP_URL=https://portal.microgenesis.com
export APP_DOMAIN=portal.microgenesis.com
./build.sh

# Option B: put them in teams/.env instead (one KEY=value per line)
cat > .env <<'ENV'
AZURE_CLIENT_ID=12345678-abcd-...
APP_URL=https://portal.microgenesis.com
APP_DOMAIN=portal.microgenesis.com
ENV
./build.sh
```

The script fails fast with a clear message if any variable is missing or an icon file is
absent. It never modifies `manifest.json` — the filled copy and the zip are both generated,
gitignored artifacts you can safely regenerate any time the placeholders change (e.g.
switching from the Render staging URL to the production domain).

Then in **Teams Admin Center** → Manage apps → Upload custom app → upload
`microgenesis-teams-app.zip`.

### 6. Verify

- Open Teams → Apps → find "Supply Chain Portal"
- Pin it to the sidebar
- Sign in should use SSO automatically (same Microsoft account)
