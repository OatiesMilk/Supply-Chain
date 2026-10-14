# Cloudflare Deployment

> This guide documents the repository configuration and safe checks. The Cloudflare, Render, and Supabase dashboards have not been inspected, so it does not confirm any live project, branch, environment variable, or deployment setting.

## Deployment models and repository files

The canonical module Worker is the repository-root **worker.js**. Cloudflare Pages Advanced Mode needs an **_worker.js** entrypoint in the Pages build output directory. This repository keeps a byte-identical mirror at **client/public/_worker.js**; Vite copies it to **client/dist/_worker.js**. CI compares the mirror with the canonical source. Edit the root file, copy its bytes to the mirror, and let CI verify parity.

The repository-consistent Pages build settings are:

| Setting | Intended value |
| --- | --- |
| Project root | **client** |
| Build command | **npm run build** |
| Build output directory | **dist** |
| Advanced Mode entrypoint | **_worker.js** in the output directory |

Verify these settings in the Pages project and confirm that the build output contains **client/dist/_worker.js**. The repository alone cannot establish which Pages project, branch, or build settings are live.

The root **wrangler.json** and **client/wrangler.json** configure a separate Wrangler Worker-with-assets deployment. The client **cf:preview** script selects the root config. That preview is useful for the standalone Worker but does not verify Pages Advanced Mode or the Pages dashboard.

Cloudflare Pages Advanced Mode uses its output-directory **_worker.js** as the request handler and provides the **ASSETS** binding for static files. Keep API proxying, static asset handling, security headers, and the React route fallback in the Worker.

## Request routing and runtime configuration

The Worker routes requests as follows:

- Requests under **/api/** are forwarded to **API_BASE_URL**. There is no built-in fallback host; if **API_BASE_URL** is unset, the Worker returns HTTP 503.
- Other requests go to **ASSETS**. A missing extensionless **GET** route falls back to **index.html** for React client-side routes.
- Responses for frontend assets receive security headers. The Content-Security-Policy in **worker.js** must match the API policy in **server/src/middleware/security.ts**; server tests check that repository-level parity.

Configure **API_BASE_URL** explicitly in every Cloudflare environment. Preview environments that point at a production API will share its database and file store; use an isolated backend for staging or preview UAT.

For proxy client-address handling, configure the same **PROXY_SHARED_SECRET** in the Worker and API environment. The Worker removes browser-supplied proxy headers before adding its secret and the Cloudflare visitor address. The API trusts the forwarded address only when the secret is valid. Set **CLIENT_ORIGIN** to the exact deployed frontend origin and configure **APP_URL** as needed for Microsoft SSO. Do not paste secret values into issue comments or deployment evidence.

The deployed frontend uses relative **/api/** URLs through the same-origin Worker proxy. Do not set **VITE_API_BASE_URL** for this deployment model. Pages supplies **ASSETS** to its Functions runtime; the separate Wrangler deployment declares the binding in its config.

## Read-only deployment identity check

The Admin-only **GET /api/admin/deployment-status** endpoint reports which services the running API is configured to use. Open it in the deployed app after signing in as an Admin. It is read-only and does not reveal credentials. It reports:

- Database host, port, database name, and whether the host is loopback.
- Upload provider and identity. For Supabase storage it reads bucket reachability, privacy, size limit, and allowed MIME types; it does not read or upload files.
- Configured origins, session-cookie flags, proxy-secret validity for the current request, and yes/no presence for reviewed settings.
- Warnings about settings that appear unsafe.

The response includes infrastructure identifiers and the client address used for rate limiting. Redact those details appropriately before sharing evidence. **GET /api/health** only shows that the service is healthy; it does not identify the database or upload store.

This endpoint does not prove database backup and restoration, migration rehearsal, attachment persistence, or isolated staging data. Complete those checks separately with an authorized release owner before staging writes or UAT.

## Local and deployed checks

From **client/**, **npm run cf:preview** uses the pinned Wrangler command and repository-root config. It previews the standalone Worker against **client/dist**. A successful preview does not verify a Pages project, a Pages Git integration, live environment variables, or deployed storage.

For Pages, verify the build log and deployed behavior separately. Confirm that the output contains **_worker.js**, that **/api/** reaches the intended API, and that a direct refresh of **/dashboard** or another React route returns the application. A successful build or health check alone is not deployment evidence.

When using the separate Workers static-assets model, Cloudflare treats a Pages **_worker.js** copied into the assets directory as a public asset unless it is excluded or moved outside that directory. Follow [Cloudflare Pages-to-Workers migration guidance](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) for that model. Keep the tracked **client/public/_worker.js** mirror for Pages Advanced Mode.

For details on the Pages entrypoint, see [Cloudflare Pages Advanced Mode](https://developers.cloudflare.com/pages/functions/advanced-mode/).