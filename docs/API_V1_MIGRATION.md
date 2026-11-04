# API v1 URL migration

The user selected a full switch from `/api` to `/api/v1` on 2026-11-04. The canonical request prefix is `/api/v1`; unversioned `/api` endpoints have no compatibility alias or redirect.

This versions the HTTP URL namespace. It does not select `PERMISSION_MODE`, activate permission policies, change record lifecycle rules, or create a new payload contract. Existing resource-relative paths, methods, JSON fields, status codes, cookie authentication, CSRF protections, role restrictions and rate limits continue under the new prefix.

## Caller contract

| Operation | Canonical URL |
| --- | --- |
| Health | `/api/v1/health` |
| Login / session / logout | `/api/v1/auth/login`, `/api/v1/auth/me`, `/api/v1/auth/logout` |
| Microsoft initiation / callback | `/api/v1/auth/microsoft`, `/api/v1/auth/microsoft/callback` |
| Records and RMA actions | `/api/v1/records` and its existing subpaths |
| Dashboard | `/api/v1/dashboard/stats`, `/api/v1/dashboard/overview` |
| Permission editors | `/api/v1/admin/roles/:role/permissions`, `/api/v1/users/:id/permissions` |
| Protected attachment URLs | `/api/v1/records/:recordId/attachments/:attachmentId/download` or `/preview` |

The other existing routers (companies, customers, suppliers, users, admin, SKUs, transactions, notifications, data sampler, reports and drivers) also use `/api/v1`. Removed development reset endpoints remain unavailable.

Old `/api/...` requests and unsupported versions such as `/api/v2/...` return HTTP 404 JSON. No state-changing request is redirected or replayed under a new version. Unknown API paths return JSON 404 rather than the production SPA HTML. The development proxy still forwards the entire `/api` namespace so the backend can reject retired paths; it does not implement old routes. Both Cloudflare Worker copies forward only v1 and reject retired/unsupported versions before assets or an upstream request.

Use `apiUrl()` or the central client API helpers rather than hardcoded URLs. The health probe and protected preview fetcher use the same version. Attachment links returned by the server use v1. Existing bookmarks, saved external attachment links and third-party clients using unversioned paths must be updated; no historical business records are rewritten.

## Coordinated deployment

This is a breaking URL change. Deploy the API, frontend and Worker together; an old frontend and a new API (or vice versa) are not compatible. Refresh cached browser tabs after cutover. The Worker `API_BASE_URL` stays an origin such as `https://api.example.com`, without an appended `/api/v1`; it forwards the browser's versioned path unchanged.

Before deployment, update Microsoft Entra app registrations for each environment to the exact Web redirect URI `<APP_URL>/api/v1/auth/microsoft/callback`. The API sends this URI and scopes its temporary SSO-state cookie to this callback path. Restart any sign-in already in progress during cutover. Update external host health monitors to `/api/v1/health`, as well as integration clients, saved requests and test environments. These external changes are operator work; editing repository code does not apply them.

No deployment, environment-secret update, Entra registration change, database migration or business-data mutation is performed by this code change. Rolling back requires restoring matching frontend/API/Worker versions and redirect/monitor configuration together.

## Documentation baselines and validation

The current setup guide and runnable tests use v1. Older QA execution logs and the pinned generated [testing reference](testing-reference/README.md) describe their recorded source revisions; their historical `/api` observations are not current endpoint aliases. Regenerate the reference from a clean committed revision with `scripts/generate-test-reference.cjs` after this change is committed, preserving its provenance guard.

Validation covers actual middleware/router HTTP tests with synthetic database responses, client request URLs and attachment guards, Worker forwarding/rejection, mocked Microsoft callback construction and log redaction, and the existing suites. Tests using an optional disposable PostgreSQL target or live provider credentials must be reported separately; passing mocks does not prove real Entra login, deployment configuration or database behavior.

The separately accepted [V1 dashboard permission model](../quality-assurance/06-reports/2026-11-04-v1-dashboard-access-acceptance.md) remains applicable: screen, resource and category access are independent of this URL version.
