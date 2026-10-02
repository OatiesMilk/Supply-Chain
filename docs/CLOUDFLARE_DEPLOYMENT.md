# Cloudflare Deployment

The production frontend is hosted at Cloudflare Workers and the API is hosted
on Render. Cloudflare Workers Builds tracks the `staging` branch and uses
`client/` as its project root.

## Frontend and API configuration

Set the production client API base URL in Cloudflare:

```env
VITE_API_BASE_URL="https://supply-chain-9fnl.onrender.com"
```

The Cloudflare Workers build configuration is:

```text
Root directory: client
Build command: npm run build
Output directory: dist
```

The API base URL is compiled into the Vite bundle at build time. A value
changed in Cloudflare is not used by an already deployed bundle until a new
Workers build completes. Requests made by the client, including
`/api/health`, must use the Render base URL; otherwise the Cloudflare SPA
fallback returns `index.html` instead of the JSON API response, and the client
incorrectly reports that the server is unavailable.

The Render service must allow the exact frontend origin:

```env
CLIENT_ORIGIN="https://supply-chain.mgenesis.workers.dev"
```

The frontend uses `credentials: include`, so production authentication
cookies must be configured as `HttpOnly`, `Secure`, and `SameSite=None`. This
is required because the Cloudflare frontend and Render API are different
sites. After changing cookie settings or deploying the production client,
clear old cookies and sign in again.

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
