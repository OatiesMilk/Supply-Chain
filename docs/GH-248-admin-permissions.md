# GH-248: Admin permission editors

Roles & Permissions lives inside the existing Admin Panel. It uses the server's
V1 role catalog, `canAllow` ceilings, policy revisions and user editor snapshots.
The browser does not carry a role-default matrix or calculate effective access.
Driver views, board and manager are grouped visually while retaining separate keys.

Role saves send the complete policy. Individual saves send the complete explicit
override list; only Inherit removes a row. Equal-to-default Allow/Deny rows remain
explicit. Reset is a separately confirmed draft followed by an explicit Save and
the dedicated versioned reset request. Cancel never writes.

The saved server snapshot shows effective result, provenance and reasons beside
each permission. Draft preview lists requested row changes only. Local dependency
checks catch missing Read/Write without granting them automatically; the server
still validates management-module, role, ownership, assignment and state rules.
The role preview names only accounts already loaded by User Management and labels
that limitation; there is no invented affected-account count or preview endpoint.

A 409 preserves the draft and disables resubmission. Refresh loads a separate
review showing changed policy rows, role defaults, revisions and current server
decisions. An explicit acknowledgment adopts the refreshed version. The preserved
draft remains visible and must still pass dependency checks. Save conflicts never
silently update a token or discard explicit exceptions.

Close and navigation buttons/links prompt before discarding changes; browser
unload is guarded. Controls have labels, visible keyboard focus and status/error
announcements, with wrapping controls and scrollable permission lists. Automated
DOM tests verify interaction and navigation guards; they do not prove reference
screenshot matching or every viewport/browser combination.

Safe audit diffs display only recognized permission keys/effects and allowlisted
authorization fields. They do not render arbitrary stored JSON. Existing Admin
user lifecycle operations acquire current V1 account editors, and role changes
require review of the server role-change preview and removed exceptions.

## Rollout boundaries

No database schema, migrations, backfill, deployment setting or business rule is
changed by this frontend work. LEGACY remains active until the coordinated
rollout: V1 editors are explicitly read-only candidate views; the existing legacy
individual editor remains available. #247 server enforcement/session integration
and the foundation migration/conversion rehearsal remain prerequisites to V1
activation. A conversion checkpoint alone is not migration acceptance.

The three Step 00 reference screenshots were unavailable. The UI follows existing
Admin Panel styling provisionally. Visual acceptance/reference mapping is still
required before claiming all screenshot-dependent #248 acceptance criteria pass.

## Verification

- Client and server TypeScript checks passed.
- Full client suite: 229 passed, including policy component interaction and account lifecycle
  request-contract tests.
- Full server suite: 347 passed, 3 optional PostgreSQL tests skipped without an explicit
  disposable database target.
- Production frontend build; existing large-chunk advisory remains.

No PR, push, migration or activation is performed by this implementation.
