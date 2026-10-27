# Endpoint catalog

Generated from merged baseline `8660bdee15b502867716ca0c60683965c6cd87f6`. All paths include `/api`.

This is **source evidence**, not an executable OpenAPI schema. Field reads do not establish requiredness or a strict whitelist. Local/imported validation helpers may read additional fields. Response snippets are TypeScript expressions, not example JSON. Default success statuses, shared middleware failures, binary streams, and helper-thrown errors must be interpreted using the handwritten contract and source.

| Method | Path | Source |
| --- | --- | --- |
| GET | `/api/admin/audit-log` | [admin.ts:11](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/admin.ts#L11) |
| GET | `/api/admin/deployment-status` | [admin.ts:114](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/admin.ts#L114) |
| GET | `/api/admin/integration-status` | [admin.ts:75](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/admin.ts#L75) |
| POST | `/api/admin/test-email` | [admin.ts:120](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/admin.ts#L120) |
| POST | `/api/auth/login` | [auth.ts:16](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/auth.ts#L16) |
| POST | `/api/auth/logout` | [auth.ts:42](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/auth.ts#L42) |
| GET | `/api/auth/me` | [auth.ts:47](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/auth.ts#L47) |
| POST | `/api/auth/microsoft` | [auth.ts:53](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/auth.ts#L53) |
| GET | `/api/auth/microsoft/callback` | [auth.ts:97](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/auth.ts#L97) |
| GET | `/api/auth/microsoft/status` | [auth.ts:174](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/auth.ts#L174) |
| GET | `/api/companies` | [companies.ts:7](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/companies.ts#L7) |
| POST | `/api/companies` | [companies.ts:21](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/companies.ts#L21) |
| GET | `/api/customers` | [customers.ts:9](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/customers.ts#L9) |
| POST | `/api/customers` | [customers.ts:32](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/customers.ts#L32) |
| PUT | `/api/customers/:id` | [customers.ts:96](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/customers.ts#L96) |
| GET | `/api/customers/:id/audit` | [customers.ts:131](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/customers.ts#L131) |
| GET | `/api/dashboard/stats` | [dashboard.ts:8](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/dashboard.ts#L8) |
| GET | `/api/data-sampler/counts` | [data-sampler.ts:20](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/data-sampler.ts#L20) |
| POST | `/api/data-sampler/generate` | [data-sampler.ts:131](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/data-sampler.ts#L131) |
| POST | `/api/data-sampler/reset` | [data-sampler.ts:305](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/data-sampler.ts#L305) |
| GET | `/api/dev/reset-capability` | [dev.ts:10](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/dev.ts#L10) |
| POST | `/api/dev/reset-seed` | [dev.ts:14](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/dev.ts#L14) |
| GET | `/api/drivers` | [drivers.ts:46](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/drivers.ts#L46) |
| POST | `/api/drivers` | [drivers.ts:52](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/drivers.ts#L52) |
| DELETE | `/api/drivers/:id` | [drivers.ts:86](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/drivers.ts#L86) |
| PUT | `/api/drivers/:id` | [drivers.ts:70](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/drivers.ts#L70) |
| GET | `/api/health` | [index.ts:67](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/index.ts#L67) |
| GET | `/api/notifications` | [notifications.ts:10](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/notifications.ts#L10) |
| PATCH | `/api/notifications/:id/read` | [notifications.ts:44](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/notifications.ts#L44) |
| PATCH | `/api/notifications/read-all` | [notifications.ts:36](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/notifications.ts#L36) |
| POST | `/api/notifications/send-email` | [notifications.ts:100](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/notifications.ts#L100) |
| GET | `/api/notifications/unread-count` | [notifications.ts:29](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/notifications.ts#L29) |
| GET | `/api/records` | [records.ts:314](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L314) |
| POST | `/api/records` | [records.ts:945](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L945) |
| DELETE | `/api/records/:id` | [records.ts:1538](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L1538) |
| GET | `/api/records/:id` | [records.ts:713](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L713) |
| PUT | `/api/records/:id` | [records.ts:1055](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L1055) |
| GET | `/api/records/:id/attachments` | [records.ts:747](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L747) |
| POST | `/api/records/:id/attachments` | [records.ts:764](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L764) |
| DELETE | `/api/records/:id/attachments/:attachmentId` | [records.ts:897](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L897) |
| GET | `/api/records/:id/attachments/:attachmentId/download` | [records.ts:853](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L853) |
| GET | `/api/records/:id/attachments/:attachmentId/preview` | [records.ts:871](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L871) |
| GET | `/api/records/:id/audit` | [records.ts:727](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L727) |
| GET | `/api/records/:id/comments` | [records.ts:1543](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L1543) |
| POST | `/api/records/:id/comments` | [records.ts:1560](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L1560) |
| GET | `/api/records/:id/remarks` | [records.ts:926](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L926) |
| PATCH | `/api/records/:id/status` | [records.ts:1365](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L1365) |
| POST | `/api/records/:id/time-in` | [records.ts:1339](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L1339) |
| PATCH | `/api/records/:id/verify-collection` | [records.ts:1487](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L1487) |
| GET | `/api/records/active-counts` | [records.ts:474](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L474) |
| GET | `/api/records/am-summary` | [records.ts:491](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L491) |
| GET | `/api/records/calendar-summary` | [records.ts:551](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L551) |
| GET | `/api/records/status-history-counts` | [records.ts:579](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L579) |
| GET | `/api/reports/summary` | [reports.ts:15](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/reports.ts#L15) |
| GET | `/api/skus` | [skus.ts:52](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/skus.ts#L52) |
| POST | `/api/skus` | [skus.ts:128](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/skus.ts#L128) |
| GET | `/api/skus/:id` | [skus.ts:62](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/skus.ts#L62) |
| PUT | `/api/skus/:id` | [skus.ts:97](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/skus.ts#L97) |
| POST | `/api/skus/:id/adjust` | [skus.ts:192](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/skus.ts#L192) |
| GET | `/api/skus/:id/audit` | [skus.ts:78](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/skus.ts#L78) |
| GET | `/api/suppliers` | [suppliers.ts:7](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/suppliers.ts#L7) |
| POST | `/api/suppliers` | [suppliers.ts:30](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/suppliers.ts#L30) |
| GET | `/api/transactions` | [transactions.ts:27](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/transactions.ts#L27) |
| GET | `/api/transactions/:source/:id` | [transactions.ts:149](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/transactions.ts#L149) |
| GET | `/api/users` | [users.ts:14](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L14) |
| POST | `/api/users` | [users.ts:31](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L31) |
| DELETE | `/api/users/:id` | [users.ts:253](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L253) |
| PATCH | `/api/users/:id` | [users.ts:149](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L149) |
| PATCH | `/api/users/:id/activate` | [users.ts:227](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L227) |
| PATCH | `/api/users/:id/deactivate` | [users.ts:198](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L198) |
| PUT | `/api/users/:id/driver-profile` | [users.ts:96](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L96) |
| PUT | `/api/users/:id/microsoft-identity` | [users.ts:117](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L117) |
| GET | `/api/users/:id/permissions` | [users.ts:311](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L311) |
| PUT | `/api/users/:id/permissions` | [users.ts:317](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L317) |

## GET /api/admin/audit-log

Source: [server/src/routes/admin.ts:11](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/admin.ts#L11).

Route middleware: `requireAuth`, `requireResource('admin')`, `requireRole('ADMIN')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: `action`, `from`, `limit`, `page`, `to`, `userId`.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 56:

```ts
{
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    entries: entries.map(e => ({
      id: e.id,
      record_id: e.recordId,
      record_type: e.recordType,
      action: e.action,
      changed_by: e.changedBy.name,
      changed_by_id: e.changedById,
      timestamp: e.timestamp
    }))
  }
```

## GET /api/admin/deployment-status

Source: [server/src/routes/admin.ts:114](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/admin.ts#L114).

Route middleware: `requireAuth`, `requireResource('admin')`, `requireRole('ADMIN')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 115:

```ts
await deploymentStatus(req)
```

## GET /api/admin/integration-status

Source: [server/src/routes/admin.ts:75](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/admin.ts#L75).

Route middleware: `requireAuth`, `requireResource('admin')`, `requireRole('ADMIN')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 89:

```ts
{
    azure_sso: {
      configured: azureConfigured,
      tenant: azureConfigured ? azureTenant : null,
      redirect_uri: azureConfigured ? `${appUrl}/api/auth/microsoft/callback` : null,
    },
    email: {
      method: emailMethod,
      smtp_host: smtpConfigured ? process.env.SMTP_HOST : null,
      from: process.env.SMTP_FROM || null,
    },
    users: {
      total: totalUsers,
      active: activeUsers,
      microsoft_linked: microsoftLinked,
    },
    app_url: appUrl,
    node_env: process.env.NODE_ENV || 'development',
  }
```

## POST /api/admin/test-email

Source: [server/src/routes/admin.ts:120](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/admin.ts#L120).

Route middleware: `requireAuth`, `requireResource('admin')`, `requireRole('ADMIN')`.

body fields observed in handler: `to`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 123:

```ts
{ error: 'A "to" email address is required' }
```

- Status `200`, `json`, line 133:

```ts
{
    ok: result.ok,
    method: result.method,
    error: result.error || null,
  }
```

## POST /api/auth/login

Source: [server/src/routes/auth.ts:16](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/auth.ts#L16).

Route middleware: No explicit per-route middleware (global middleware still applies).

body fields observed in handler: `email`, `password`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 19:

```ts
{ error: 'Email and password are required' }
```

- Status `401`, `json`, line 24:

```ts
{ error: 'Invalid email or password' }
```

- Status `401`, `json`, line 29:

```ts
{ error: 'Invalid email or password' }
```

- Status `401`, `json`, line 33:

```ts
{ error: 'Account is deactivated' }
```

- Status `200`, `json`, line 39:

```ts
sessionUser(user)
```

## POST /api/auth/logout

Source: [server/src/routes/auth.ts:42](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/auth.ts#L42).

Route middleware: No explicit per-route middleware (global middleware still applies).

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 44:

```ts
{ ok: true }
```

## GET /api/auth/me

Source: [server/src/routes/auth.ts:47](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/auth.ts#L47).

Route middleware: `requireAuth`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 48:

```ts
req.user
```

## POST /api/auth/microsoft

Source: [server/src/routes/auth.ts:53](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/auth.ts#L53).

Route middleware: No explicit per-route middleware (global middleware still applies).

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `501`, `json`, line 56:

```ts
{ error: 'Microsoft login is not configured' }
```

- Status `200`, `json`, line 90:

```ts
{ url: authUrl }
```

- Status `500`, `json`, line 93:

```ts
{ error: 'Failed to initiate Microsoft login' }
```

## GET /api/auth/microsoft/callback

Source: [server/src/routes/auth.ts:97](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/auth.ts#L97).

Route middleware: No explicit per-route middleware (global middleware still applies).

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: `code`, `error`, `state`.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `302`, `redirect`, line 100:

```ts
'/?error=sso_not_configured'
```

- Status `302`, `redirect`, line 115:

```ts
'/?error=sso_invalid_state'
```

- Status `302`, `redirect`, line 118:

```ts
'/?error=sso_invalid_state'
```

- Status `302`, `redirect`, line 127:

```ts
`/?error=sso_failed`
```

- Status `302`, `redirect`, line 153:

```ts
`/?error=${approval.error}`
```

- Status `302`, `redirect`, line 164:

```ts
'/'
```

- Status `302`, `redirect`, line 168:

```ts
'/?error=sso_failed'
```

## GET /api/auth/microsoft/status

Source: [server/src/routes/auth.ts:174](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/auth.ts#L174).

Route middleware: No explicit per-route middleware (global middleware still applies).

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 176:

```ts
{ configured }
```

## GET /api/companies

Source: [server/src/routes/companies.ts:7](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/companies.ts#L7).

Route middleware: `requireAuth`, `requireResource('companies')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 9:

```ts
companies.map(c => ({
      id: c.id,
      name: c.name,
      sap_number: c.sapNumber,
      address: c.address,
      contact_person: c.contactPerson,
      created_at: c.createdAt
    }))
```

## POST /api/companies

Source: [server/src/routes/companies.ts:21](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/companies.ts#L21).

Route middleware: `requireAuth`, `requireResource('companies')`, `requireRole('SALES_COORDINATOR', 'ADMIN')`.

body fields observed in handler: `address`, `contact_person`, `name`, `sap_number`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 23:

```ts
{ error: 'name is required' }
```

- Status `201`, `json`, line 33:

```ts
{
    id: created.id,
    name: created.name,
    sap_number: created.sapNumber,
    address: created.address,
    contact_person: created.contactPerson,
    created_at: created.createdAt
  }
```

## GET /api/customers

Source: [server/src/routes/customers.ts:9](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/customers.ts#L9).

Route middleware: `requireAuth`, `requireResource('customers')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 14:

```ts
customers.map(c => ({
      id: c.id,
      name: c.name,
      contact_person: c.contactPerson,
      email: c.email,
      phone: c.phone,
      address: c.address,
      city: c.city,
      created_by: c.createdBy.name,
      created_at: c.createdAt,
      modified_by: c.modifiedBy.name,
      modified_at: c.modifiedAt
    }))
```

## POST /api/customers

Source: [server/src/routes/customers.ts:32](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/customers.ts#L32).

Route middleware: `requireAuth`, `requireResource('customers')`, `requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 34:

```ts
parsed
```

- Status `201`, `json`, line 60:

```ts
{
    id: created.id,
    name: created.name,
    contact_person: created.contactPerson,
    email: created.email,
    phone: created.phone,
    address: created.address,
    city: created.city,
    created_by: created.createdBy.name,
    created_at: created.createdAt,
    modified_by: created.modifiedBy.name,
    modified_at: created.modifiedAt
  }
```

## PUT /api/customers/:id

Source: [server/src/routes/customers.ts:96](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/customers.ts#L96).

Route middleware: `requireAuth`, `requireResource('customers')`, `requireRole(...CUSTOMER_EDITORS)`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 98:

```ts
parsed
```

- Status `404`, `json`, line 124:

```ts
{ error: 'Customer not found.' }
```

- Status `409`, `json`, line 125:

```ts
{ error: 'Someone else saved changes to this customer after you opened it. Reload to see the latest values, then make your edit again.' }
```

- Status `400`, `json`, line 126:

```ts
{ error: 'No changes to save.', fields: {} }
```

- Status `200`, `json`, line 127:

```ts
serializeCustomer(result.updated)
```

## GET /api/customers/:id/audit

Source: [server/src/routes/customers.ts:131](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/customers.ts#L131).

Route middleware: `requireAuth`, `requireResource('customers')`, `requireRole(...CUSTOMER_EDITORS)`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 137:

```ts
entries.map(e => {
    const previous = e.previousValue ? JSON.parse(e.previousValue) : null;
    const next = e.newValue ? JSON.parse(e.newValue) : null;
    return {
      id: e.id,
      action: e.action,
      changed_by: e.changedBy.name,
      timestamp: e.timestamp,
      remarks: typeof next?.remarks === 'string' ? next.remarks : '',
      changes: customerChanges(previous, next),
    };
  })
```

## GET /api/dashboard/stats

Source: [server/src/routes/dashboard.ts:8](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/dashboard.ts#L8).

Route middleware: `requireAuth`, `requireResource('dashboard')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 21:

```ts
{
      role: 'SALES_COORDINATOR',
      deliveries_scheduled_today: deliveriesToday,
      pending_driver_assignment: pendingDriverAssignment,
      on_hold: onHold,
      rescheduled: rescheduled,
      accomplished_today: accomplishedToday
    }
```

- Status `200`, `json`, line 47:

```ts
{
      role: 'LOGISTICS',
      assigned_today: assignedToday,
      unassigned_count: unassignedCount,
      completed_today: completedToday,
      on_hold_rescheduled: onHoldRescheduled
    }
```

- Status `200`, `json`, line 81:

```ts
{
      role: 'TASS',
      open_rma: openRma,
      rma_on_hold: rmaOnHold,
      pending_procurement_pickup: pendingProcurementPickup,
      pending_verification: pendingVerification,
      verified_today: verifiedToday
    }
```

- Status `200`, `json`, line 129:

```ts
{
      role: 'ADMIN',
      total_active_users: activeUsers,
      user_breakdown: userBreakdown,
      records_this_week: recordsThisWeek,
      unverified_collections: unverifiedCollections,
      audit_events_today: auditEventsToday,
      records_by_status: recordsByStatus.map((r: any) => ({ status: r.status, count: r._count._all })),
      recent_audit: recentAudit.map((e: any) => ({
        id: e.id,
        action: e.action,
        changed_by: e.changedBy.name,
        record_id: e.recordId,
        record_type: e.recordType,
        timestamp: e.timestamp
      }))
    }
```

- Status `200`, `json`, line 148:

```ts
{ role }
```

## GET /api/data-sampler/counts

Source: [server/src/routes/data-sampler.ts:20](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/data-sampler.ts#L20).

Route middleware: `requireAuth`, `requireResource('dataSampler')`, `requireRole('ADMIN')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 29:

```ts
counts
```

## POST /api/data-sampler/generate

Source: [server/src/routes/data-sampler.ts:131](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/data-sampler.ts#L131).

Route middleware: `requireAuth`, `requireResource('dataSampler')`, `requireRole('ADMIN')`.

body fields observed in handler: `count`, `fields`, `module`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 137:

```ts
{ error: `Unknown module: ${module}` }
```

- Status `400`, `json`, line 140:

```ts
{ error: 'fields must be an object.' }
```

- Status `400`, `json`, line 141:

```ts
{ error: 'Sample records must start Scheduled. Record Time In and complete through the delivery workflow.' }
```

- Status `400`, `json`, line 146:

```ts
{ error }
```

- Status `400`, `json`, line 148:

```ts
{ error: 'RMA Item Type must be Small Item or Unit.' }
```

- Status `400`, `json`, line 155:

```ts
{ error: 'No companies found. Please seed the database first.' }
```

- Status `400`, `json`, line 165:

```ts
{ error: `Driver "${fields.driver}" is inactive or not in the directory. Choose an active entry.` }
```

- Status `201`, `json`, line 259:

```ts
{ created: created.length, records: created }
```

- Status `500`, `json`, line 262:

```ts
{ error: 'Failed to generate sample records. See server logs for details.' }
```

## POST /api/data-sampler/reset

Source: [server/src/routes/data-sampler.ts:305](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/data-sampler.ts#L305).

Route middleware: `requireAuth`, `requireResource('dataSampler')`, `requireRole('ADMIN')`, `createDataSamplerResetHandler()`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

No direct response call resolved; inspect the handler/helper and binary streaming behavior.

## GET /api/dev/reset-capability

Source: [server/src/routes/dev.ts:10](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/dev.ts#L10).

Route middleware: `requireAuth`, `requireResource('admin')`, `requireRole('ADMIN')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 11:

```ts
{ enabled: canResetLocalDemo(req) }
```

## POST /api/dev/reset-seed

Source: [server/src/routes/dev.ts:14](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/dev.ts#L14).

Route middleware: `requireAuth`, `requireResource('admin')`, `requireRole('ADMIN')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `403`, `json`, line 16:

```ts
{ error: 'Demo reset is available only on a verified local disposable database' }
```

- Status `200`, `json`, line 20:

```ts
{ ok: true }
```

- Status `500`, `json`, line 23:

```ts
{ error: 'Failed to reset local demo data' }
```

## GET /api/drivers

Source: [server/src/routes/drivers.ts:46](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/drivers.ts#L46).

Route middleware: `requireAuth`, `requireResource('drivers')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: `all`.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 48:

```ts
drivers.map(d => serialize(d, req.user!.role === 'ADMIN'))
```

## POST /api/drivers

Source: [server/src/routes/drivers.ts:52](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/drivers.ts#L52).

Route middleware: `requireAuth`, `requireResource('drivers')`, `requireScreen('driver_manager')`, `requireRole('LOGISTICS', 'ADMIN')`.

body fields observed in handler: `coverage_areas`, `name`, `type`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 56:

```ts
{ error: invalid }
```

- Status `403`, `json`, line 58:

```ts
{ error: 'Only Admin can add drivers. Logistics can add assistants.' }
```

- Status `201`, `json`, line 65:

```ts
serialize(created, req.user!.role === 'ADMIN')
```

## DELETE /api/drivers/:id

Source: [server/src/routes/drivers.ts:86](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/drivers.ts#L86).

Route middleware: `requireAuth`, `requireResource('drivers')`, `requireScreen('driver_manager')`, `requireRole('LOGISTICS', 'ADMIN')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `404`, `json`, line 88:

```ts
{ error: 'Driver not found' }
```

- Status `204`, `end`, line 89:

```ts
// no response body
```

## PUT /api/drivers/:id

Source: [server/src/routes/drivers.ts:70](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/drivers.ts#L70).

Route middleware: `requireAuth`, `requireResource('drivers')`, `requireScreen('driver_manager')`, `requireRole('LOGISTICS', 'ADMIN')`.

body fields observed in handler: `coverage_areas`, `is_active`, `name`, `type`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 74:

```ts
{ error: invalid }
```

- Status `404`, `json`, line 81:

```ts
{ error: 'Driver not found' }
```

- Status `200`, `json`, line 82:

```ts
serialize(updated, req.user!.role === 'ADMIN')
```

## GET /api/health

Source: [server/src/index.ts:67](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/index.ts#L67).

Route middleware: No explicit per-route middleware (global middleware still applies).

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `healthy ? 200 : 503`, `json`, line 91:

```ts
{ ok: healthy, checks }
```

## GET /api/notifications

Source: [server/src/routes/notifications.ts:10](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/notifications.ts#L10).

Route middleware: `requireAuth`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 16:

```ts
notifications.map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      record_id: n.recordId,
      record_type: n.recordType,
      is_read: n.isRead,
      created_at: n.createdAt
    }))
```

## PATCH /api/notifications/:id/read

Source: [server/src/routes/notifications.ts:44](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/notifications.ts#L44).

Route middleware: `requireAuth`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `404`, `json`, line 48:

```ts
{ error: 'Notification not found' }
```

- Status `200`, `json`, line 54:

```ts
{ ok: true }
```

## PATCH /api/notifications/read-all

Source: [server/src/routes/notifications.ts:36](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/notifications.ts#L36).

Route middleware: `requireAuth`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 41:

```ts
{ ok: true }
```

## POST /api/notifications/send-email

Source: [server/src/routes/notifications.ts:100](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/notifications.ts#L100).

Route middleware: `requireAuth`, `requireResource('records')`.

body fields observed in handler: `recipients`, `recordId`, `trigger`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 103:

```ts
{ error: 'recordId, trigger, and recipients[] are required' }
```

- Status `404`, `json`, line 112:

```ts
{ error: 'Record not found' }
```

- Status `200`, `json`, line 149:

```ts
{ ok: true, sent, failed, resolvedCount: targets.length }
```

## GET /api/notifications/unread-count

Source: [server/src/routes/notifications.ts:29](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/notifications.ts#L29).

Route middleware: `requireAuth`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 33:

```ts
{ count }
```

## GET /api/records

Source: [server/src/routes/records.ts:314](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L314).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 316:

```ts
{ error: parsed.error }
```

- Status `200`, `json`, line 333:

```ts
records.map(r => serializeRecord(r, req.user!))
```

- Status `400`, `json`, line 342:

```ts
{ error: 'cursor is invalid or expired' }
```

- Status `200`, `json`, line 405:

```ts
{
      rows: rows.map(r => serializeRecord(r, req.user!)),
      nextCursor: null,
      hasMore: total > offset + take,
      total,
      page: parsed.page ?? 1,
      limit: take,
    }
```

- Status `200`, `json`, line 440:

```ts
{
      rows: rows.map(r => serializeRecord(r, req.user!)),
      nextCursor: null, hasMore: total > offset + take,
      total, page: parsed.page ?? 1, limit: take,
    }
```

- Status `200`, `json`, line 462:

```ts
{
    rows: rows.map(r => serializeRecord(r, req.user!)),
    nextCursor,
    hasMore,
    total,
    page: parsed.page ?? 1,
    limit: take,
  }
```

## POST /api/records

Source: [server/src/routes/records.ts:945](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L945).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`, `requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'TASS')`.

body fields observed in handler: `account_manager`, `address`, `amount`, `area`, `attachments`, `category`, `company_id`, `customer_contact_email`, `customer_contact_name`, `customer_contact_phone`, `delivery_date`, `driver`, `driver_assistants`, `driver_id`, `is_draft`, `item_description`, `item_type`, `line_items`, `priority`, `purchase_date`, `reference`, `remarks`, `rma_reference`, `rma_type`, `status`, `vehicle`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 955:

```ts
{ error: `Missing required fields: ${missing.join(', ')}` }
```

- Status `400`, `json`, line 960:

```ts
{ error: rmaError }
```

- Status `403`, `json`, line 964:

```ts
{ error: 'Logistics has view-only access to RMA records' }
```

- Status `403`, `json`, line 972:

```ts
{ error: 'Sales Coordinator cannot assign drivers — use the Logistics role' }
```

- Status `400`, `json`, line 975:

```ts
{ error: 'Reference is required' }
```

- Status `400`, `json`, line 976:

```ts
{ error: 'Delivery Date is required' }
```

- Status `400`, `json`, line 977:

```ts
{ error: 'Delivery Date must be a valid YYYY-MM-DD date.' }
```

- Status `400`, `json`, line 978:

```ts
{ error: 'Invalid record priority.' }
```

- Status `400`, `json`, line 979:

```ts
{ error: 'New records must be Draft or Scheduled.' }
```

- Status `400`, `json`, line 980:

```ts
{ error: 'Assign drivers after submitting the record.' }
```

- Status `400`, `json`, line 982:

```ts
{ error: 'Select an existing Company.' }
```

- Status `400`, `json`, line 1038:

```ts
{ error: 'Select an existing Company.' }
```

- Status `201`, `json`, line 1050:

```ts
serializeRecord(created, req.user!)
```

## DELETE /api/records/:id

Source: [server/src/routes/records.ts:1538](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L1538).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`, `requireRole('SALES_COORDINATOR')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `403`, `json`, line 1539:

```ts
{ error: 'Record deletion is disabled for all roles.' }
```

## GET /api/records/:id

Source: [server/src/routes/records.ts:713](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L713).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `404`, `json`, line 718:

```ts
{ error: 'Record not found' }
```

- Status `403`, `json`, line 721:

```ts
{ error: 'TASS may only view Accounting Collection and RMA records' }
```

- Status `200`, `json`, line 724:

```ts
serializeRecord(record, req.user!)
```

## PUT /api/records/:id

Source: [server/src/routes/records.ts:1055](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L1055).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`, `requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER', 'TASS')`.

body fields observed in handler: `account_manager`, `address`, `amount`, `area`, `attachments`, `company_id`, `customer_contact_email`, `customer_contact_name`, `customer_contact_phone`, `delivery_date`, `driver`, `driver_assistants`, `driver_id`, `is_draft`, `item_description`, `item_type`, `line_items`, `linked_collection_id`, `priority`, `purchase_date`, `received_by`, `reference`, `remarks`, `rma_reference`, `rma_type`, `status`, `time_in`, `time_out`, `vehicle`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `404`, `json`, line 1057:

```ts
{ error: 'Record not found' }
```

- Status `403`, `json`, line 1061:

```ts
{ error: 'Logistics has view-only access to RMA records' }
```

- Status `403`, `json`, line 1065:

```ts
{ error: 'TASS write access is limited to RMA records' }
```

- Status `400`, `json`, line 1069:

```ts
{ error: 'Use the status action to change status.' }
```

- Status `403`, `json`, line 1071:

```ts
{ error: 'Only Logistics or Admin may correct recorded timestamps.' }
```

- Status `400`, `json`, line 1073:

```ts
{ error: 'Corrections require an existing timestamp and a full ISO timestamp with timezone. Use Record Time In to start the run.' }
```

- Status `400`, `json`, line 1075:

```ts
{ error: 'is_draft must be Yes or No.' }
```

- Status `403`, `json`, line 1076:

```ts
{ error: 'Only Sales Coordinator, TASS for RMA, or Admin may submit or return drafts.' }
```

- Status `403`, `json`, line 1080:

```ts
{ error: 'Your role cannot change record priority.' }
```

- Status `400`, `json`, line 1083:

```ts
{ error: 'Invalid record priority.' }
```

- Status `400`, `json`, line 1088:

```ts
{ error: 'Use rma_reference for the RMA document reference.' }
```

- Status `400`, `json`, line 1090:

```ts
{ error: rmaError }
```

- Status `400`, `json`, line 1107:

```ts
{ error: completeError }
```

- Status `400`, `json`, line 1125:

```ts
{ error: 'Remarks are required when editing a record.' }
```

- Status `403`, `json`, line 1133:

```ts
{ error: 'Drivers may only update their own assigned records' }
```

- Status `400`, `json`, line 1139:

```ts
{ error: 'Delivery Date must be a valid YYYY-MM-DD date.' }
```

- Status `400`, `json`, line 1145:

```ts
{ error: 'driver_id must be a Driver profile id or null.' }
```

- Status `400`, `json`, line 1148:

```ts
{ error: 'Driver must be a name or an empty string.' }
```

- Status `400`, `json`, line 1153:

```ts
{ error: 'Assistants must be an array of names.' }
```

- Status `400`, `json`, line 1177:

```ts
{ error: 'Linked record must be an existing Accounting Collection record' }
```

- Status `400`, `json`, line 1228:

```ts
{ error: 'Delivery Date must be a valid YYYY-MM-DD date.' }
```

- Status `400`, `json`, line 1240:

```ts
{ error: 'Use rma_reference for the RMA document reference.' }
```

- Status `400`, `json`, line 1251:

```ts
{ error: 'Received By must be a name.' }
```

- Status `400`, `json`, line 1252:

```ts
{ error: 'Select an existing Company.' }
```

- Status `result.error === 'Record not found' ? 404 : result.error === 'Record access denied' || result.error.startsWith('Only Sales Coordinator') ? 403 : 400`, `json`, line 1317:

```ts
{ error: result.error }
```

- Status `200`, `json`, line 1335:

```ts
serializeRecord(updated, req.user!)
```

## GET /api/records/:id/attachments

Source: [server/src/routes/records.ts:747](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L747).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 752:

```ts
await Promise.all(attachments.map(async attachment => ({
    id: attachment.id,
    name: attachment.originalName,
    mime_type: attachment.mimeType,
    is_photo: await isStoredPodPhoto(attachment),
    size: attachment.size,
    uploaded_at: attachment.createdAt,
    download_url: `/api/records/${req.params.id}/attachments/${attachment.id}/download`,
    preview_url: `/api/records/${req.params.id}/attachments/${attachment.id}/preview`
  })))
```

## POST /api/records/:id/attachments

Source: [server/src/routes/records.ts:764](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L764).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`, `requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER', 'TASS')`, `podUpload.single('file')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 772:

```ts
{ error: 'A file is required.' }
```

- Status `400`, `json`, line 784:

```ts
{ error: inspection.error }
```

- Status `result.status`, `json`, line 838:

```ts
{ error: result.error, ...(result.code ? { code: result.code } : {}) }
```

- Status `201`, `json`, line 840:

```ts
{
      id: attachment.id,
      name: attachment.originalName,
      mime_type: attachment.mimeType,
      is_photo: isPhoto,
      size: attachment.size,
      uploaded_at: attachment.createdAt,
      download_url: `/api/records/${req.params.id}/attachments/${attachment.id}/download`,
      preview_url: `/api/records/${req.params.id}/attachments/${attachment.id}/preview`
    }
```

## DELETE /api/records/:id/attachments/:attachmentId

Source: [server/src/routes/records.ts:897](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L897).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`, `requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'TASS')`.

body fields observed in handler: `remarks`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `attachmentId`, `id`.

Response calls (includes errors and conditional status expressions):

- Status `result.status`, `json`, line 921:

```ts
{ error: result.error }
```

- Status `204`, `send`, line 922:

```ts
// no response body
```

## GET /api/records/:id/attachments/:attachmentId/download

Source: [server/src/routes/records.ts:853](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L853).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `attachmentId`, `id`.

Response calls (includes errors and conditional status expressions):

- Status `404`, `json`, line 857:

```ts
{ error: 'Attachment not found' }
```

- Status `404`, `json`, line 866:

```ts
{ error: 'Attachment file not found' }
```

## GET /api/records/:id/attachments/:attachmentId/preview

Source: [server/src/routes/records.ts:871](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L871).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `attachmentId`, `id`.

Response calls (includes errors and conditional status expressions):

- Status `404`, `json`, line 873:

```ts
{ error: 'Attachment not found' }
```

- Status `415`, `json`, line 878:

```ts
{ error: 'Preview is available for PDF, DOCX, and image files. Legacy DOC files require conversion to PDF or DOCX.' }
```

- Status `404`, `json`, line 892:

```ts
{ error: 'Attachment file not found' }
```

## GET /api/records/:id/audit

Source: [server/src/routes/records.ts:727](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L727).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 735:

```ts
entries.map((e, index) => ({
      id: e.id,
      action: e.action,
      changed_by: e.changedBy.name,
      previous_value: snapshots[index].previousValue,
      new_value: snapshots[index].newValue,
      timestamp: e.timestamp
    }))
```

## GET /api/records/:id/comments

Source: [server/src/routes/records.ts:1543](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L1543).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 1549:

```ts
comments.map(c => ({
      id: c.id,
      body: c.body,
      author: c.author.name,
      created_at: c.createdAt,
      updated_at: c.updatedAt
    }))
```

## POST /api/records/:id/comments

Source: [server/src/routes/records.ts:1560](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L1560).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`, `requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER', 'TASS')`.

body fields observed in handler: `body`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 1563:

```ts
{ error: 'Comment body is required' }
```

- Status `404`, `json`, line 1569:

```ts
{ error: 'Record not found' }
```

- Status `400`, `json`, line 1571:

```ts
{ error: dateError }
```

- Status `201`, `json`, line 1583:

```ts
{
    id: comment.id,
    body: comment.body,
    author: comment.author.name,
    created_at: comment.createdAt,
    updated_at: comment.updatedAt
  }
```

## GET /api/records/:id/remarks

Source: [server/src/routes/records.ts:926](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L926).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 932:

```ts
remarks.map(r => ({
      id: r.id,
      body: r.body,
      context: r.context,
      author: r.author.name,
      author_role: r.author.role,
      created_at: r.createdAt
    }))
```

## PATCH /api/records/:id/status

Source: [server/src/routes/records.ts:1365](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L1365).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`, `requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER', 'TASS')`.

body fields observed in handler: `delivery_date`, `priority`, `received_by`, `remarks`, `status`, `time_in`, `time_out`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 1367:

```ts
{ error: 'Valid status is required' }
```

- Status `400`, `json`, line 1368:

```ts
{ error: 'Remarks are required when changing status.' }
```

- Status `400`, `json`, line 1369:

```ts
{ error: 'Use Record Time In or timestamp corrections; Time Out is recorded automatically on completion.' }
```

- Status `400`, `json`, line 1370:

```ts
{ error: 'Received By must be a name.' }
```

- Status `403`, `json`, line 1372:

```ts
{ error: 'Your role cannot change record priority.' }
```

- Status `400`, `json`, line 1373:

```ts
{ error: 'Invalid record priority.' }
```

- Status `400`, `json`, line 1376:

```ts
{ error: 'New delivery date must be a valid YYYY-MM-DD date.' }
```

- Status `result.error === 'Record access denied' || result.error === 'TASS status updates are limited to RMA records' || result.error === 'Sales Coordinator may only submit or return drafts.' || result.error.startsWith('Only Sales Coordinator') ? 403 : 400`, `json`, line 1464:

```ts
{ error: result.error }
```

- Status `200`, `json`, line 1483:

```ts
serializeRecord(updated, req.user!)
```

## POST /api/records/:id/time-in

Source: [server/src/routes/records.ts:1339](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L1339).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`, `requireRole('DRIVER', 'LOGISTICS', 'ADMIN')`.

body fields observed in handler: `remarks`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 1341:

```ts
{ error: 'Remarks are required when recording Time In.' }
```

- Status `400`, `json`, line 1360:

```ts
{ error: result.error }
```

- Status `200`, `json`, line 1361:

```ts
serializeRecord(result.saved, req.user!)
```

## PATCH /api/records/:id/verify-collection

Source: [server/src/routes/records.ts:1487](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L1487).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`, `requireRole('TASS')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `404`, `json`, line 1492:

```ts
{ error: 'Record not found' }
```

- Status `403`, `json`, line 1495:

```ts
{ error: 'Collection verification only applies to Accounting Collection records' }
```

- Status `400`, `json`, line 1499:

```ts
{ error: 'Collection can only be verified after delivery is marked Accomplished' }
```

- Status `400`, `json`, line 1503:

```ts
{ error: 'This collection has already been verified' }
```

- Status `200`, `json`, line 1534:

```ts
serializeRecord(updated, req.user!)
```

## GET /api/records/active-counts

Source: [server/src/routes/records.ts:474](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L474).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 486:

```ts
recordActiveCounts(groups)
```

## GET /api/records/am-summary

Source: [server/src/routes/records.ts:491](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L491).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 546:

```ts
result
```

## GET /api/records/calendar-summary

Source: [server/src/routes/records.ts:551](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L551).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: `dateFrom`, `dateTo`.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 557:

```ts
{ error: 'dateFrom is invalid' }
```

- Status `400`, `json`, line 558:

```ts
{ error: 'dateTo is invalid' }
```

- Status `400`, `json`, line 559:

```ts
{ error: 'dateFrom cannot be after dateTo' }
```

- Status `200`, `json`, line 575:

```ts
records.map(r => serializeRecord(r, req.user!))
```

## GET /api/records/status-history-counts

Source: [server/src/routes/records.ts:579](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/records.ts#L579).

Route middleware: `requireAuth`, `requireResource('records')`, `requireRecordAccess`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: `area`, `category`, `createdAtFrom`, `createdAtTo`, `dateBasis`, `dateFrom`, `dateTo`, `deliveryDateFrom`, `deliveryDateTo`, `driver`, `region`, `status`, `subregion`.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 603:

```ts
{ error: 'Date filters must be single string values.' }
```

- Status `400`, `json`, line 606:

```ts
{ error: 'Location filters must be single string values.' }
```

- Status `400`, `json`, line 609:

```ts
{ error: 'Use one date filter basis per request.' }
```

- Status `400`, `json`, line 617:

```ts
{ error: 'dateBasis must be deliveryDate or createdAt.' }
```

- Status `400`, `json`, line 621:

```ts
{ error: 'dateBasis must match the named date filter fields.' }
```

- Status `400`, `json`, line 644:

```ts
{ error: error instanceof Error ? error.message : 'Invalid date range.' }
```

- Status `400`, `json`, line 650:

```ts
{ error: 'region or subregion is invalid' }
```

- Status `200`, `json`, line 703:

```ts
{
    ever_held,
    current,
    total_records: records.length,
    date_basis: dateBasis,
    history_basis: 'lifetime',
    time_zone: 'Asia/Manila',
  }
```

## GET /api/reports/summary

Source: [server/src/routes/reports.ts:15](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/reports.ts#L15).

Route middleware: `requireAuth`, `requireScreen('statistical_reports')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: `area`, `category`, `dateFrom`, `dateTo`, `deliveryDateFrom`, `deliveryDateTo`, `driver`, `status`.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 30:

```ts
{ error: 'Report filters must be single string values.' }
```

- Status `400`, `json`, line 34:

```ts
{ error: 'Use deliveryDateFrom/deliveryDateTo or the legacy dateFrom/dateTo aliases, not both.' }
```

- Status `400`, `json`, line 41:

```ts
{ error: error instanceof Error ? error.message : 'Invalid delivery date range.' }
```

- Status `200`, `json`, line 99:

```ts
{
    total,
    accomplished,
    completed_in_range: completedInRange,
    on_hold:         byStatus['On-Hold']  ?? 0,
    pending:         byStatus['Pending']  ?? 0,
    completion_rate: total > 0 ? Math.round((accomplished / total) * 100) : 0,
    date_basis: {
      cohort: 'deliveryDate',
      completion: 'timeOut',
      time_zone: 'Asia/Manila',
    },
    by_status:    Object.entries(byStatus).map(([s, count]) => ({ status: s, count })),
    by_category:  Object.entries(byCategory).map(([c, count]) => ({ category: c, count })),
    by_area:      Object.entries(byArea).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([a, count]) => ({ area: a, count })),
    by_driver:    Object.entries(byDriver).sort((a, b) => b[1] - a[1]).map(([d, count]) => ({ driver: d, count })),
  }
```

## GET /api/skus

Source: [server/src/routes/skus.ts:52](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/skus.ts#L52).

Route middleware: `requireAuth`, `requireResource('skus')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 58:

```ts
products.map(p => serializeProduct(p))
```

## POST /api/skus

Source: [server/src/routes/skus.ts:128](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/skus.ts#L128).

Route middleware: `requireAuth`, `requireResource('skus')`, `requireRole('ADMIN')`.

body fields observed in handler: `category`, `description`, `name`, `reorder_point`, `sku_code`, `unit_cost`, `unit_price`, `warehouse_location`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 131:

```ts
{ error }
```

- Status `201`, `json`, line 155:

```ts
serializeProduct(created)
```

- Status `409`, `json`, line 158:

```ts
{ error: 'A SKU with this code already exists.' }
```

## GET /api/skus/:id

Source: [server/src/routes/skus.ts:62](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/skus.ts#L62).

Route middleware: `requireAuth`, `requireResource('skus')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `404`, `json`, line 73:

```ts
{ error: 'SKU not found' }
```

- Status `200`, `json`, line 74:

```ts
serializeProduct(product, true)
```

## PUT /api/skus/:id

Source: [server/src/routes/skus.ts:97](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/skus.ts#L97).

Route middleware: `requireAuth`, `requireResource('skus')`, `requireRole('ADMIN')`.

body fields observed in handler: `category`, `description`, `name`, `reorder_point`, `sku_code`, `unit_cost`, `unit_price`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 100:

```ts
{ error }
```

- Status `404`, `json`, line 102:

```ts
{ error: 'SKU not found' }
```

- Status `200`, `json`, line 120:

```ts
serializeProduct(updated)
```

- Status `409`, `json`, line 122:

```ts
{ error: 'A SKU with this code already exists.' }
```

## POST /api/skus/:id/adjust

Source: [server/src/routes/skus.ts:192](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/skus.ts#L192).

Route middleware: `requireAuth`, `requireResource('skus')`, `requireScreen('inventory')`, `requireRole('ADMIN', 'LOGISTICS')`.

body fields observed in handler: `qty_change`, `reference`, `type`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 194:

```ts
{ error: 'Invalid stock adjustment type.' }
```

- Status `400`, `json`, line 195:

```ts
{ error: 'Reference is required.' }
```

- Status `400`, `json`, line 198:

```ts
{ error: 'qty_change must be a non-zero finite whole number within the supported range.' }
```

- Status `404`, `json`, line 201:

```ts
{ error: 'SKU not found' }
```

- Status `200`, `json`, line 252:

```ts
serializeProduct(updated, true)
```

- Status `400`, `json`, line 255:

```ts
{ error: err.message }
```

## GET /api/skus/:id/audit

Source: [server/src/routes/skus.ts:78](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/skus.ts#L78).

Route middleware: `requireAuth`, `requireResource('skus')`, `requireRole('ADMIN')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 84:

```ts
entries.map(e => ({
      id: e.id,
      action: e.action,
      changed_by: e.changedBy.name,
      previous_value: e.previousValue ? JSON.parse(e.previousValue) : null,
      new_value: e.newValue ? JSON.parse(e.newValue) : null,
      timestamp: e.timestamp
    }))
```

## GET /api/suppliers

Source: [server/src/routes/suppliers.ts:7](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/suppliers.ts#L7).

Route middleware: `requireAuth`, `requireResource('suppliers')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 12:

```ts
suppliers.map(s => ({
      id: s.id,
      name: s.name,
      contact_person: s.contactPerson,
      email: s.email,
      phone: s.phone,
      address: s.address,
      city: s.city,
      category: s.category,
      created_by: s.createdBy.name,
      created_at: s.createdAt,
      modified_by: s.modifiedBy.name,
      modified_at: s.modifiedAt
    }))
```

## POST /api/suppliers

Source: [server/src/routes/suppliers.ts:30](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/suppliers.ts#L30).

Route middleware: `requireAuth`, `requireResource('suppliers')`, `requireScreen('suppliers')`, `requireRole('SALES_COORDINATOR', 'LOGISTICS', 'ADMIN', 'DRIVER')`.

body fields observed in handler: `address`, `category`, `city`, `contact_person`, `email`, `name`, `phone`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 32:

```ts
{ error: 'name and category are required' }
```

- Status `201`, `json`, line 49:

```ts
{
    id: created.id,
    name: created.name,
    contact_person: created.contactPerson,
    email: created.email,
    phone: created.phone,
    address: created.address,
    city: created.city,
    category: created.category,
    created_by: created.createdBy.name,
    created_at: created.createdAt,
    modified_by: created.modifiedBy.name,
    modified_at: created.modifiedAt
  }
```

## GET /api/transactions

Source: [server/src/routes/transactions.ts:27](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/transactions.ts#L27).

Route middleware: `requireAuth`, `requireTransactionAccess`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: `category`, `from`, `limit`, `page`, `source`, `status`, `to`.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 40:

```ts
{ error: 'Invalid source. Must be "all", "delivery" or "inventory".' }
```

- Status `403`, `json`, line 43:

```ts
{ error: 'Inventory access denied' }
```

- Status `200`, `json`, line 144:

```ts
{ page, limit, total, pages, transactions }
```

## GET /api/transactions/:source/:id

Source: [server/src/routes/transactions.ts:149](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/transactions.ts#L149).

Route middleware: `requireAuth`, `requireTransactionAccess`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`, `source`.

Response calls (includes errors and conditional status expressions):

- Status `404`, `json`, line 159:

```ts
{ error: 'Delivery record not found' }
```

- Status `200`, `json`, line 198:

```ts
{
      id:               record.id,
      source:           'delivery',
      type:             CATEGORY_FROM_DB[record.category] ?? record.category,
      reference:        record.reference,
      entity:           record.company.name,
      entity_id:        record.companyId,
      status:           record.status,
      description:      record.itemDescription,
      vehicle:          record.vehicle,
      area:             record.area,
      driver:           record.driver,
      driver_assistants: parseDriverAssistants(record.driverAssistants),
      account_manager:  record.accountManager,
      delivery_date:    record.deliveryDate,

      item_type:        record.itemType,
      remarks:          record.remarks,
      priority:         record.priority,
      created_by:       record.createdBy?.name ?? '',
      created_at:       record.createdAt,
      updated_at:       record.updatedAt,
      timeline
    }
```

- Status `403`, `json`, line 226:

```ts
{ error: 'Access denied' }
```

- Status `404`, `json`, line 233:

```ts
{ error: 'Inventory transaction not found' }
```

- Status `200`, `json`, line 242:

```ts
{
      id:                txn.id,
      source:            'inventory',
      type:              txn.type,
      reference:         txn.reference,
      entity:            txn.product.name,
      entity_id:         txn.productId,
      status:            null,
      qty_change:        txn.qtyChange,
      resulting_balance: txn.resultingBalance,
      created_by:        null,
      created_at:        txn.createdAt,
      updated_at:        txn.createdAt,
      product: {
        id:       txn.product.id,
        sku_code: txn.product.skuCode,
        name:     txn.product.name,
        category: txn.product.category
      },
      related_transactions: related.map(r => ({
        id:                r.id,
        date:              r.date.toISOString().split('T')[0],
        type:              r.type,
        qty_change:        r.qtyChange,
        resulting_balance: r.resultingBalance,
        reference:         r.reference
      }))
    }
```

- Status `400`, `json`, line 272:

```ts
{ error: 'Invalid source. Must be "delivery" or "inventory".' }
```

## GET /api/users

Source: [server/src/routes/users.ts:14](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L14).

Route middleware: `requireAuth`, `requireResource('users')`, `requireRole('ADMIN')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `200`, `json`, line 16:

```ts
users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    is_active: u.isActive,
    microsoft_linked: !!u.microsoftOid,
    created_at: u.createdAt,
    driver_profile: u.driverProfile,
  }))
```

## POST /api/users

Source: [server/src/routes/users.ts:31](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L31).

Route middleware: `requireAuth`, `requireResource('users')`, `requireRole('ADMIN')`.

body fields observed in handler: `driver_profile_id`, `email`, `microsoft_oid`, `name`, `password`, `role`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: none statically resolved; inspect delegated helper if present.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 34:

```ts
{ error: 'name, email, password, and role are required' }
```

- Status `400`, `json`, line 38:

```ts
{ error: `role must be one of: ${validRoles.join(', ')}` }
```

- Status `400`, `json`, line 41:

```ts
{ error: 'driver_profile_id is only valid for a DRIVER login and must be a Driver profile id.' }
```

- Status `400`, `json`, line 44:

```ts
{ error: 'microsoft_oid must be a Microsoft Entra object GUID' }
```

- Status `201`, `json`, line 69:

```ts
{
      id: created.id,
      name: created.name,
      email: created.email,
      role: created.role,
      is_active: created.isActive,
      microsoft_linked: !!created.microsoftOid,
      created_at: created.createdAt,
      driver_profile: profile ? { id: profile.id, name: profile.name } : null,
    }
```

- Status `error.status`, `json`, line 80:

```ts
{ error: error.message }
```

- Status `409`, `json`, line 88:

```ts
{ error: identityCollision ? 'Microsoft identity is already linked to another account' : 'An account with this email already exists.' }
```

## DELETE /api/users/:id

Source: [server/src/routes/users.ts:253](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L253).

Route middleware: `requireAuth`, `requireResource('users')`, `requireRole('ADMIN')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 258:

```ts
{ error: 'You cannot delete your own account' }
```

- Status `404`, `json`, line 262:

```ts
{ error: 'User not found' }
```

- Status `409`, `json`, line 296:

```ts
{
      error: `Cannot delete this user because they have ${totalLinked} associated record(s) in the system (delivery records, audit logs, products, etc.). Deactivate the account instead to preserve data integrity.`,
      linked_records: totalLinked,
    }
```

- Status `200`, `json`, line 307:

```ts
{ ok: true, deleted_id: id }
```

## PATCH /api/users/:id

Source: [server/src/routes/users.ts:149](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L149).

Route middleware: `requireAuth`, `requireResource('users')`, `requireRole('ADMIN')`.

body fields observed in handler: `email`, `name`, `role`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 153:

```ts
{ error: 'Enter a valid email address.' }
```

- Status `400`, `json`, line 154:

```ts
{ error: 'Name must be non-empty text.' }
```

- Status `404`, `json`, line 156:

```ts
{ error: 'User not found' }
```

- Status `400`, `json`, line 160:

```ts
{ error: `role must be one of: ${validRoles.join(', ')}` }
```

- Status `400`, `json`, line 163:

```ts
{ error: 'You cannot change your own admin role. Another admin must perform this action to prevent self-lockout.' }
```

- Status `400`, `json`, line 172:

```ts
{ error: 'At least one field (name, email, role) is required' }
```

- Status `409`, `json`, line 183:

```ts
{ error: 'An account with this email already exists.' }
```

- Status `200`, `json`, line 186:

```ts
{
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    is_active: updated.isActive,
    microsoft_linked: !!updated.microsoftOid,
    created_at: updated.createdAt,
  }
```

## PATCH /api/users/:id/activate

Source: [server/src/routes/users.ts:227](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L227).

Route middleware: `requireAuth`, `requireResource('users')`, `requireRole('ADMIN')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `404`, `json`, line 230:

```ts
{ error: 'User not found' }
```

- Status `400`, `json`, line 231:

```ts
{ error: 'User is already active' }
```

- Status `200`, `json`, line 238:

```ts
{
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    is_active: updated.isActive,
    microsoft_linked: !!updated.microsoftOid,
    created_at: updated.createdAt,
  }
```

## PATCH /api/users/:id/deactivate

Source: [server/src/routes/users.ts:198](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L198).

Route middleware: `requireAuth`, `requireResource('users')`, `requireRole('ADMIN')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 203:

```ts
{ error: 'You cannot deactivate your own account' }
```

- Status `404`, `json`, line 207:

```ts
{ error: 'User not found' }
```

- Status `400`, `json`, line 208:

```ts
{ error: 'User is already deactivated' }
```

- Status `200`, `json`, line 215:

```ts
{
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    is_active: updated.isActive,
    microsoft_linked: !!updated.microsoftOid,
    created_at: updated.createdAt,
  }
```

## PUT /api/users/:id/driver-profile

Source: [server/src/routes/users.ts:96](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L96).

Route middleware: `requireAuth`, `requireResource('users')`, `requireRole('ADMIN')`.

body fields observed in handler: `driver_profile_id`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 99:

```ts
{ error: 'driver_profile_id must be a Driver profile id or null.' }
```

- Status `200`, `json`, line 107:

```ts
{ user_id: req.params.id, driver_profile: profile ? { id: profile.id, name: profile.name } : null }
```

- Status `error.status`, `json`, line 109:

```ts
{ error: error.message }
```

## PUT /api/users/:id/microsoft-identity

Source: [server/src/routes/users.ts:117](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L117).

Route middleware: `requireAuth`, `requireResource('users')`, `requireRole('ADMIN')`.

body fields observed in handler: `microsoft_oid`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 120:

```ts
{ error: 'microsoft_oid must be a Microsoft Entra object GUID or null' }
```

- Status `404`, `json`, line 140:

```ts
{ error: 'User not found' }
```

- Status `200`, `json`, line 141:

```ts
{ user_id: updated.id, microsoft_linked: !!updated.microsoftOid }
```

- Status `409`, `json`, line 143:

```ts
{ error: 'Microsoft identity is already linked to another account' }
```

## GET /api/users/:id/permissions

Source: [server/src/routes/users.ts:311](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L311).

Route middleware: `requireAuth`, `requireResource('users')`, `requireRole('ADMIN')`.

body fields observed in handler: none statically resolved; inspect delegated helper if present.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `404`, `json`, line 313:

```ts
{ error: 'User not found' }
```

- Status `200`, `json`, line 314:

```ts
permissionEditor(user)
```

## PUT /api/users/:id/permissions

Source: [server/src/routes/users.ts:317](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/src/routes/users.ts#L317).

Route middleware: `requireAuth`, `requireResource('users')`, `requireRole('ADMIN')`.

body fields observed in handler: `expectedVersion`, `permissions`.

query fields observed in handler: none statically resolved; inspect delegated helper if present.

params fields observed in handler: `id`.

Response calls (includes errors and conditional status expressions):

- Status `400`, `json`, line 320:

```ts
{ error }
```

- Status `400`, `json`, line 321:

```ts
{ error: 'expectedVersion is required' }
```

- Status `200`, `json`, line 323:

```ts
await replacePermissions(prisma, req.params.id, req.user!.id, permissions, expectedVersion)
```

- Status `error.status`, `json`, line 325:

```ts
{ error: error.message }
```
