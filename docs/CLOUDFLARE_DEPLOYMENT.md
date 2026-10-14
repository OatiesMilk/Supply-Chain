# Cloudflare Deployment

> Last verified: 2026-10-09 against commit `ccbf192` (`dev`). The Cloudflare dashboard and the live Render service were not inspected; settings below come from the repository (`wrangler.json`, `worker.js`, `render.yaml`, `client/src/api/`).

The production frontend is hosted at Cloudflare Workers and the API is hosted
on Render. Cloudflare Workers Builds tracks the `staging` branch and uses
`client/` as its project root.

## How API requests reach the API

The client calls relative `/api/...` URLs. `worker.js` forwards every `/api/*`
request to `env.API_BASE_URL`. There is no built-in fallback host: if the
variable is unset the Worker answers `503 API proxy is not configured`, so a
deployment can never reach an API it was not explicitly pointed at.
The health check is also relative when `VITE_API_BASE_URL` is unset, so it uses
the same Worker proxy. This keeps browser requests and the session cookie on the
Cloudflare origin.

## Frontend and API configuration

Set this Worker runtime variable in Cloudflare:

```env
API_BASE_URL="https://supply-chain-9fnl.onrender.com"
```

Also set these for request security (AUD-003):

- **Worker secret `PROXY_SHARED_SECRET`** and the same value as the Render
  environment variable `PROXY_SHARED_SECRET`. The Worker then forwards the
  visitor's address (`CF-Connecting-IP`) to the API, which uses it for rate
  limits. Without it every visitor is counted as one address.
- **Render `CLIENT_ORIGIN`** (and `APP_URL` if SSO is configured) must be the
  public Cloudflare origin, for example `https://portal.microgenesis.com`. The
  API refuses writes whose `Origin` is not one of these.

Set `API_BASE_URL` for **every** Cloudflare environment (production and
preview). A preview that uses the same value as production writes to the same
database and file store; it is not an isolated test backend.

## Verifying a deployment (read-only)

`GET /api/health` shows the service works, not what it is connected to. To
confirm the real targets, sign in to the deployed site as an Admin and open
`/api/admin/deployment-status` in the same browser. It reports, without any
secret value:

- `database`: host, port and database name the API is connected to.
- `storage`: the file store in use. For Supabase it reads the bucket's own
  settings (private or public, size limit, allowed types) and writes nothing.
- `origins` and `session_cookie`: the origins allowed to send writes and the
  cookie flags in effect.
- `proxy.request_carried_valid_secret`: `true` only when the request came
  through the Worker with a `PROXY_SHARED_SECRET` matching the API's.
  `proxy.client_address` is the address you are rate-limited under; it should
  be your own public address, not a Cloudflare or Render one.
- `settings_present`: whether each reviewed setting is set (yes/no only).
- `warnings`: anything above that looks unsafe.

`POD_STORAGE_PROVIDER` must be exactly `local` or `supabase`; the API refuses
to start on any other value. Left unset it means `local`, which loses uploads
on restart unless `POD_UPLOAD_DIR` is on a persistent disk.

The Worker also adds the Content-Security-Policy and related headers to the
HTML it serves. The policy string in `worker.js` must match the one in
`server/src/middleware/security.ts`; `npm run test:server` fails if they differ.

The Cloudflare Workers build configuration is:

```text
Root directory: client
Build command: npm run build
Output directory: dist
```

Do not set `VITE_API_BASE_URL` for the deployed frontend. It bypasses the Worker
proxy and makes browser authentication cross-site, which is especially fragile
on browsers that restrict third-party cookies. `ASSETS` is created from
`wrangler.json`; it is not a secret or manually configured variable.

The Render service must allow the exact frontend origin:

```env
CLIENT_ORIGIN="https://supply-chain.mgenesis.workers.dev"
```

The frontend uses `credentials: include`. The browser receives the proxied
response from the Cloudflare origin while the Worker forwards the request to
Render. Keep the backend cookie `HttpOnly` and `Secure`, and set
`CLIENT_ORIGIN` to the exact Cloudflare origin. After changing cookie settings
or deploying the production client, clear old cookies and sign in again.

## Wrangler preview configuration

A successful Vite build is not the same as a successful Workers deployment.
Check both stages in the Cloudflare log:

1. `vite build` must finish successfully.
2. `wrangler preview` must find the `previews` block in the active Wrangler
   configuration.
3. Wrangler must upload the Worker and print the
   `supply-chain.mgenesis.workers.dev` deployment URL.

The Vite chunk-size warning is non-fatal. If the build succeeds but the
deployment still serves old behavior, verify that Workers Builds is connected
to `staging`, then start a new deployment from the latest staging commit. A
hostname such as `supply-chain.supply-chain.workers.dev` is invalid; use the
deployed `supply-chain.mgenesis.workers.dev` hostname.

For Cloudflare Workers Builds with `client` as the root directory, use this
Preview command:

```bash
npx --yes wrangler@4.146.0 preview --config ../wrangler.json
```

The command pins Wrangler and explicitly selects the repository-root
`wrangler.json` from the `client` working directory. Do not use a bare
`npx wrangler preview`, which can install an unpinned CLI and may resolve a
different configuration file. Both `client/wrangler.json` and the
repository-root `wrangler.json` must retain `"previews": {}`.

## Resolved Wrangler deployment errors

### Missing `cf:preview` script

If the log reports:

```text
Missing script: "cf:preview"
```

the build is using a checkout that predates the deployment hotfix or
Cloudflare is running a stale deployment. Confirm that the Workers Build is
tracking `staging` and start a new deployment from the latest commit. The
current `client/package.json` defines the script.

### Cannot read `./wrangler.json`

If the log reports:

```text
Could not read file: ./wrangler.json
ENOENT: no such file or directory
```

Cloudflare is running from the `client` root directory, while the active
Wrangler configuration is at the repository root. Use:

```bash
npx --yes wrangler@4.146.0 preview --config ../wrangler.json
```

The repository-root configuration uses `worker.js` and serves assets from
`client/dist`.

### Uploading a Pages `_worker.js` file as an asset

If the log reports:

```text
Uploading a Pages _worker.js file as an asset
```

do not keep `_worker.js` under `client/public/`. Vite copies files from that
directory into `client/dist`, causing Wrangler to see the Worker entrypoint as
both executable Worker code and a public asset. Keep the Worker entrypoint at
the repository root as `worker.js`, remove `client/public/_worker.js`, and
configure `wrangler.json` with:

```json
{
  "main": "worker.js",
  "assets": {
    "directory": "client/dist",
    "binding": "ASSETS"
  }
}
```

After the fix, `vite build` should complete without generating
`client/dist/_worker.js`, and the Wrangler preview should upload the static
assets successfully.

## Client-side route refreshes

The application uses client-side routes such as `/dashboard` and
`/deliveries`. Browser navigation works because the app changes the URL without
requesting a new document, but a direct refresh asks the Worker for that path.
The Worker must return `client/dist/index.html` for an extensionless asset
request that is not found; otherwise Cloudflare returns HTTP 404 for routes
that the React app can handle.

The repository's `worker.js` preserves `/api/*` proxying and implements this
SPA fallback. Keep this behavior when changing the Worker entrypoint. A
successful deployment log does not by itself verify route refreshes, so test
the deployed root URL and a direct refresh of `/dashboard` or another
extensionless application route.
