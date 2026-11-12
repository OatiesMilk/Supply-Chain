# Frontend permission controls — GH-246

Implemented against `dev` at `b50c577a82125a040bcb1f64902401fedf2334f9`.
This change consumes server-computed permissions. It does not activate V1,
change the database, implement the admin editor from #248, or replace the
server enforcement/session integration owned by #247.

## Session handoff for #247

Keep the existing session fields (`id`, `name`, `email`, `role`, `permissions`,
`effectiveScreens`, `resources`, `permissionVersion`) on login, `/auth/me`, and
Microsoft sign-in. The active V1 shape adds:

```ts
{
  activeMode: 'V1',
  contractVersion: 1,
  snapshot: EffectivePermissionSnapshot
}
```

`snapshot` is the complete output of the shared server evaluator. Top-level
screens/resources must match the snapshot. Role/account revisions are positive
decimal strings, never JSON numbers. The client validates the frozen V1 catalog,
account identity, revision fields and Read/Write dependencies. Unknown versions,
missing modules/actions, invalid snapshots and mixed legacy/V1 payloads deny
access. Candidate snapshots from the admin policy editor must not be installed
as an active session.

Existing complete untagged legacy sessions and explicit `activeMode: 'LEGACY'`
sessions with no V1 fields retain their existing role/workflow checks. A running
V1 session cannot downgrade to legacy during refresh. Keep the existing
`PERMISSION_MODE` deployment setting unchanged until the coordinated rollout.

## Frontend behavior

- Navigation checks screen Read before mounting pages. Protected data loading
  checks resource and category Read, including explicit category denials.
- Record actions intersect screen Write, category Write and the specific
  operation. Create, submit, metadata, status/completion, assignment, Time In,
  receiving, comments and attachments are distinct. Category moves require
  source authority and destination creation authority.
- Directory/SKU actions require their management permission; shared lookup Read
  cannot grant creation, editing or inventory adjustment. Read-only exports and
  authorized document previews remain usable.
- UI controls and API dispatch both check permissions. Old/direct handlers reject
  before fetch. Permission changes during a response or CSRF refresh reject stale
  results/retries. Forbidden email dispatch remains an error, not a success log.
- The session identity includes role/account policy revisions. A change remounts
  the protected query cache and closes selected records, products, search and
  stale filters. Attachment staging is scoped to session/revision.
- Existing record-specific server capabilities, Driver identity/ownership,
  workflow/state restrictions and dedicated RMA transport actions remain
  necessary. TASS receiving/final completion stay separate from transport.

## Verification and remaining integration

Client tests include actual server-evaluator snapshots for all five roles,
malformed contract rejection, read-only API calls, mixed-field and category-move
denials, lookup restrictions, mounted UI revocation, late-response isolation and
CSRF retry revocation. Existing component tests use explicit legacy sessions.

- Full client suite: 217 passed before the final additional bounded-RMA test;
  the final permission suite also includes that case.
- Full server suite: 347 passed, 0 failed, 3 optional database tests skipped.
- Client/server TypeScript: passed.
- Production client build: passed, with the existing large-chunk advisory.

No development servers were started, no application database was changed, and
no migration was created. Live V1 endpoint, same-cookie revocation and coordinated
activation verification remain dependent on #247 and final integration #250.
The frontend checks do not provide server-side authorization on their own.

AI assistance: OpenAI Codex. The user's implementation request authorized this
local change. No independent human code review, posted GitHub developer
confirmation, deployment approval or completed stakeholder UAT is claimed.
