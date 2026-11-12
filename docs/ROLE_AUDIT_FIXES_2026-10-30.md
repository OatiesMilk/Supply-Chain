# Role audit fixes — 2026-10-30

This change addresses findings F1–F8 from the October 30 role functionality audit, originally recorded against `0e33fa7`. The original audit remains a separate historical snapshot. Existing instruction/documentation edits in the working tree were preserved.

## Changes

| Finding | Result |
| --- | --- |
| F1 — Draft submission | Shared reference/date validation covers creation and both existing-draft submission paths. Transactional checks validate the final record state. Submitted records also reject edits that clear required fields. RMA retains its movement-specific validation. |
| F2 — Driver visibility | All four non-RMA categories keep unfinished overdue and started runs visible across Manila midnight. Draft, completed and unassigned records stay excluded; RMA retains its separate panel. |
| F3 — Collection verification | The handler uses the shared record lock, rereads state, conditionally updates the unverified collection, and persists verification, audit and creator alert in one transaction. Duplicate confirmation returns 409; action denial remains 403. Async failures reach error middleware. |
| F4 — Output reporting | Creation outputs run only after persistence. Email results distinguish sent, failed, mocked and skipped outcomes; notification results are logged on the server with record context. PDF success follows the actual exporter. Delivered status no longer implies successful email. Saved record identity survives optional-output failures. Additional output preferences are explicitly separate from automatic workflow notifications, and client completion outputs avoid duplicating automatic AM email. |
| F5 — Collection events | Collection transport completion uses Accomplished/Collection Collected, independently of TASS Collection Verified. Server email lifecycle checks preserve that distinction in both permission modes. |
| F6 — Billing recipients | Collections resolve the configured exact active portal identity with current record-read permission in LEGACY and V1. Missing, ambiguous, inactive or denied mappings log SKIPPED; no placeholder address is generated. Automatic AM email likewise requires an exact authorized identity. |
| F7 — TASS evidence | Documents and Verification expose saved collection attachments through the existing protected preview/download components and shared query cache. The viewer is read-only, supports error/retry/empty states, and respects read revocation independently of verification permission. |
| F8 — Record IDs | Normal creation and the demo sampler share UUID-backed `REC-` identifiers. Existing IDs remain addressable. The new IDs fit current list and cursor constraints. |

The broader inventory, master-data and financial-reconciliation capability gaps in the audit remain separate business-design work. These fixes do not introduce automatic stock movements or financial reconciliation.

## Billing setup

Set `BILLING_NOTIFICATION_USER_EMAIL` in the API deployment environment to the approved billing recipient's existing portal email. The account must be active and allowed to read Accounting Collection records. V1 additionally requires the existing verified permission conversion. The setting does not create accounts or grant permissions. See [staging configuration](STAGING_CONFIGURATION.md#collection-billing-notifications).

No live environment settings or business data were changed. Schema changes are comments only; no database migration is required. Notification log outcomes record provider acceptance or mock/failure/skip results, not proof of inbox delivery. The client notification indicator remains conservative when the server supplies no explicit delivery confirmation.

## PR validation on updated dev

The PR checkout applies these fixes to updated `dev` at `d5ababa`, retaining the upstream RBAC presentation and attachment/export changes. Fresh dependencies were installed in that separate checkout; existing local instruction edits and audit drafts were excluded from the PR.

| Check | Result |
| --- | --- |
| `npm run test:client` | 253 passed, zero failed/skipped |
| `npm run test:server` | 405 passed, zero failed, three skipped; 408 total |
| Client and server `tsc --noEmit` | Passed |
| Client and server production builds | Passed; Vite retains the large-chunk advisory |
| Prisma generation and schema validation | Passed; no database migration or connection required |
| Staged scope, local report links and `git diff --cached --check` | Passed |

The three designated PostgreSQL tests and external/browser validation limits below still apply. Fresh logs are `/tmp/supply-chain-role-pr-client-tests.log`, `/tmp/supply-chain-role-pr-server-tests.log` and `/tmp/supply-chain-role-pr-build.log`.

## Original validation

| Check | Result |
| --- | --- |
| `npm run test:client` | 247 passed, zero failed/skipped |
| `npm run test:server` | 399 passed, zero failed, three skipped; 402 total at that run |
| Final affected server checks, after extracting the shared ID generator and adding sampler coverage | 123 passed, zero failed/skipped: `recordIntegrity`, `permissionEnforcement`, `podRequirements`, `notificationDelivery`, `permissionVisibility` |
| Final output/creation/normalization checks, from the client workspace | Eight passed, zero failed/skipped |
| Client and server `tsc --noEmit` | Passed |
| `npm run build --workspace=client` | Passed; Vite reports its existing large-chunk advisory |
| `git diff --check` | Passed |

The full server run preceded the final sampler test; its 399 passes and the 123 focused passes overlap and must not be added together. The final focused checks cover the shared generator in both runtime creation paths, verification races/rollback, submission validation, recipient permissions and output outcomes. Client regressions include actual React views in JSDOM, cache updates and revoked access.

Three existing suites requiring designated disposable PostgreSQL targets were skipped: permission conversion, permission-management transactions/races/rollback, and activation/reassignment access. Router concurrency/rollback checks use database doubles, not live PostgreSQL. Browser E2E, real browser downloads, SMTP/Graph delivery, Microsoft tenant behavior and private storage were not validated. An initial mail-test mock failed to attach and reached Graph authentication, which was rejected before delivery; the corrected tests clear provider credentials and replace the actual SMTP transport boundary.

Full-suite logs are `/tmp/supply-chain-fixes-client-tests.log` and `/tmp/supply-chain-fixes-server-tests.log`. Final regression logs are `/tmp/supply-chain-fixes-final-client-regressions.log` and `/tmp/supply-chain-fixes-final-server-regressions.log`; build output is `/tmp/supply-chain-fixes-build.log`. These temporary logs may not persist.
