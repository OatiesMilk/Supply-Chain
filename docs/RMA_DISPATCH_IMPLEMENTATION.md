# RMA dispatch — issue #255

Marc requested implementation, tests, verification, push and a PR to `dev`,
without merging. The implementation started from `dev` at `f77d7ff`.

After the proposed workflow and remaining decisions were presented, Marc
instructed Codex to continue. This records that instruction, not independent
Operations sign-off or completed UAT.

## Accepted workflow and role boundaries

TASS selects an explicit movement method when submitting an RMA:

| Method | Logistics assignment work | Driver task | Planned date |
| --- | --- | --- | --- |
| Logistics transport | Yes, immediately on submission | Linked, assigned Driver only | Required |
| Supplier collection | None | None | Optional |
| Internal / no driver | None | None | Optional |

There is no separate Logistics acknowledgment stage. Drafts never create
assignment work. Historical records remain unclassified until TASS explicitly
selects a method; an old subtype or assignment is never evidence of eligibility.

Logistics can view/print saved RMA records and use the dedicated assignment
action for Driver, vehicle and assistants. It cannot edit general RMA details,
confirm physical receipt or complete the RMA. Admin retains approved existing
metadata/assignment authority, with no physical-receipt or final-completion bypass.

Once the Logistics transport switch below has run, Logistics can also **Start
transport**, upload the transport proof photo and **Complete transport** on an
assigned Logistics-transport RMA, for the assigned Driver, from the RMA record's
Status & Actions tab and from Drivers > View. Logistics follows the same rules
as the Driver (assigned Driver, planned date reached, verified JPG/PNG proof
photo, Received By) and must also enter remarks on Start. Every remark, audit
entry and notification names the Logistics user who acted. Logistics still
cannot change RMA status, edit details, confirm physical receipt or complete the
RMA, and Admin stays view-only.

The assigned Driver records **Pending → In Transit → Transport Complete**.
Transport cannot start before its planned date in Asia/Manila. Completion
requires a persisted, verified JPG/PNG proof photo. Transport does not change
the final RMA status or imply physical receipt. Reassignment transfers access
immediately; an in-progress task must retain a Driver. Responsibility/date/draft
changes are blocked after transport begins or physical receipt is confirmed.

Record table status columns show one unprefixed status, such as `In Transit`,
`Transport Complete`, `Received` or `Complete`. Summaries and operational views
show transport progress alongside the separately labeled final RMA status. For
example, `Transport: Complete` with `RMA: Scheduled` means the Driver finished
transport and TASS still needs to confirm receipt and complete the RMA. The RMA
list's **Final RMA status** filter applies to that final status; transport
completion alone does not move a record into the final Delivered filter.

Only TASS confirms physical receipt, recording the recipient, authenticated
actor and server timestamp. Only TASS then performs final RMA completion.
Supplier/internal movements follow the same separate receipt/completion actions
without driver assignment, transport timestamps or delivery Time In/Time Out.
Historical clocks are retained; new completion uses `rma_completed_at`.

Supplier identity/evidence refinements, receipt exceptions, inventory effects
and Excel migration remain with #231/#239; this does not complete those tickets.

## API and concurrency

All paths below are under `/api/records/:id`. New actions require authenticated
cookies, the role guard, current category/action permissions and saved-record
ownership. Read/Write/action Deny continues to apply through alternate record,
transaction, attachment and notification access paths.

| Method/path | Payload beyond `remarks` and `expected_version` |
| --- | --- |
| `GET /rma-capabilities` | None; returns `assign`, `transport`, `receive`, `complete`, `pod`, `status` |
| `PATCH /rma-assignment` | `driver_id`, optional `vehicle`, optional `driver_assistants` |
| `PATCH /rma-transport` | `transport_status`: `IN_TRANSIT` or `COMPLETED` |
| `POST /rma-receipt` | `recipient` |
| Existing `PATCH /status` | `status: "Delivered"` for final completion; existing nonfinal transitions remain |

RMA metadata edits and status changes also require `expected_version`, copied
from the returned integer `rma_version`. A stale version returns 409. Related
record changes, actor-attributed audit/remark history and new RMA notifications
commit together. Assignment directory validation and row locks serialize
reassignment, progress, receipt and final completion. Driver proof is verified
before opening a transaction and its exact persisted membership is rechecked
under the record lock. Uploaded evidence does not advance the operational
version; removal cannot erase the last proof of completed transport.

New serialized fields use the `rma_` prefix: `movement`, `transport_status`,
`version`, `transport_started_at`, `transport_completed_at`, `received_at`,
`received_by` (actor ID), `recipient`, and `completed_at`.

## Rollout

The additive migration adds nullable movement/progress/receipt fields and a
version initialized to zero. It neither classifies historical records nor
fabricates timestamps or assignments. Apply it through the normal reviewed
Prisma migration process; regenerate the Prisma client before deploying code.

The permission foundation from #243/#244 must already have been initialized
and the approved legacy-account conversion completed **before** feature
activation. The frozen no-expansion backfill is intentionally unchanged and
must not run after activating/customizing role policies.

RMA access fails closed when the permission foundation is missing/incomplete.
For an existing local development database, first complete
[`permissions:provision-local`](PERMISSION_FOUNDATION.md#existing-local-development-database-missing-the-foundation)
and verify all account conversions. Provisioning the baseline restores TASS
creation; Logistics assignment and Driver transport require the separate
activation below. Run it from `server` with the reviewed target supplied
explicitly in `DATABASE_URL`:

```bash
DATABASE_URL='<reviewed-postgresql-connection>' \
RMA_DISPATCH_ADMIN_ID='<active-admin-user-id>' \
npm run permissions:activate-rma-dispatch
```

This grants only the approved Logistics assignment and Driver RMA transport
defaults. The identified active Admin and exact untouched baseline policies are
required. Activation accounts for the database triggers that advance the initial
policy revision for every inserted catalog row. It is idempotent, audits the
before/after policies and leaves individual overrides untouched. Customized
policies are reported in `skipped` and produce a nonzero exit: their responsible
Admin must review/enable the bounded actions explicitly. No customized Deny is
silently overwritten. Admin/TASS defaults already contain their approved actions.

After activation, refresh the Logistics and Driver sessions. Logistics opens a
submitted RMA with movement **Logistics transport**, then uses **Status &
Actions → Save assignment** to assign the Driver, vehicle and assistants. The
assigned Driver uses **Start transport** and **Complete transport** on or after
the planned date. TASS separately confirms physical receipt and completes the
RMA. Drafts, supplier/internal movements and historical records without an
explicit movement do not become dispatch work merely because permissions were
activated. TASS must review and classify historical records individually.

### Logistics transport switch

The Logistics rights above are off until an explicit, audited switch runs once
per environment. Run it from `server` with the reviewed target in `DATABASE_URL`
and an active Admin in `RMA_DISPATCH_ADMIN_ID`. It is a dry run unless a flag is
given:

```bash
npm run permissions:activate-rma-logistics-transport              # dry run, writes nothing
npm run permissions:activate-rma-logistics-transport -- --apply   # grant STATUS and POD on RMA
npm run permissions:activate-rma-logistics-transport -- --revoke  # set both back to DENY
```

The dry run prints the Logistics policy revision and the two rows it would change
(`CATEGORY:RMA:STATUS`, `CATEGORY:RMA:POD`). `--apply` and `--revoke` only change
a Logistics policy that exactly matches the state recorded by the #255 activation
(or by the previous run of this switch) at the recorded revision. Anything else is
reported as `skipped` with exit code 1 for an Admin to review. It is idempotent,
takes the same advisory lock as the #255 activation, writes one audit entry
(`source: RMA_LOGISTICS_TRANSPORT`) and leaves individual user overrides untouched.
Staging and production: dry run first, review the output, then `--apply`.

Until it runs nothing changes for Logistics (it fails closed). The server reads
role policies on every request; the Logistics screen shows the buttons after its
next session refresh (within 30 seconds or on focus) or a reload. In V1 mode an
Admin can later switch the two rights off in Admin permissions; in LEGACY mode
policy saves return 503, so this script is the only switch.

Rollback order: `--revoke` first, then roll back the code.

For rollback, retain the additive columns and audit evidence. Restore reviewed
policy defaults through revision-checked administration, and roll back the app
under the normal release process. Do not reset the database or drop operational
data as part of rollback.

## Synchronization and verification

The agreed target is propagation within five seconds between visible online
TASS, Logistics and Driver sessions. Affected TanStack Query reads poll every
two seconds and revalidate on focus/reconnect; unrelated lookup data keeps its
existing cache policy. Record versions prevent older RMA responses from
replacing newer cached state. Dirty action forms retain their edit version so a
remote change produces a conflict instead of silently overwriting saved work.

The unmodified starting baseline passed 189 client tests, 327 server tests (two
optional PostgreSQL tests skipped), and strict client/server TypeScript. The
implementation adds API tests for authorization, linked identity, reassignment,
POD, receipt/final separation, version conflicts, audit rollback and generic
mutation bypasses; component/cache tests; and browser verification in separate
role contexts. An opt-in PostgreSQL regression creates its own temporary local
database, applies the actual migrations, and checks activation revisions,
individual Deny, notification revocation and customized-policy preservation.

Set `RMA_DISPATCH_TEST_DATABASE_URL` to an explicitly designated local
`sc255_*_test` database with create-database privileges when running
`server/tests/rmaDispatch.postgres.test.ts`. It creates/drops only its UUID-named
database. The browser fixture is local-only and guarded; it never resets or
seeds a shared database. Actual final results and observed propagation timings
are attached to the PR. Browser checks use services started separately on
3000/4000; test code does not start development servers.

### Executed verification — 2026-10-29

The final branch passed the following checks in the isolated local environment:

| Check | Result |
| --- | --- |
| `npm run test:client` | 207 passed, zero failed |
| `npm run test:server` | 334 passed, zero failed, three optional database tests skipped |
| New PostgreSQL regression, explicitly enabled separately | One passed, zero skipped |
| Strict client and server TypeScript | Both passed |
| Browser spec/config TypeScript | Passed |
| Production client build | Passed; existing large-chunk advisory remains |
| `npx playwright test --config rma-dispatch.config.ts` from `e2e` | Three passed |
| Existing Logistics sidebar/navigation regression, with the revised RMA action boundary | One passed |

Browser verification used independent authenticated TASS, Logistics and Driver
contexts, plus a second linked Driver to verify reassignment. The observations
below all satisfy the five-second target; they are local measurements, not a
production latency guarantee.

| Observed update | Elapsed |
| --- | --- |
| Submission to Logistics board | 1,399 ms |
| Assignment to Driver task | 554 ms |
| Reassignment removes previous Driver's task | 1,838 ms |
| Transport start to TASS | 561 ms |
| Transport completion to TASS | 1,522 ms |
| Reconnect to server-saved final status | 470 ms |

The same browser run verified separate transport/POD, physical receipt and
final completion; draft exclusion; supplier/internal movements without driver
clocks; and two concurrent assignment requests producing one success, one 409
and one attributed audit change. The reconnect regression also covers an outage
before the fallback screen was ever opened and resuming queries when their
provider missed the browser's online event. HMR/file watching was disabled for
the final browser run so ongoing edits could not reload the test sessions.

AI assistance: OpenAI Codex implemented and tested this change at Marc's request.
Human review is required before merge. No merge, deployment or stakeholder UAT
approval is claimed.
