# UI component and interactable audit — historical scan and correction

**Original report date:** 2026-11-11; its source revision was not recorded.
**Correction date:** 2026-11-12
**Correction source:** `81214c5` on `fix/fullstack-role-review-remediations`, including local clipboard and audit-skill changes.
**Scope:** `client/src` static inventory, with the earlier branch review's source traces and isolated checks referenced separately.
**Functional health score:** Not established. The original “100% operational” conclusion is withdrawn because handler presence and static warning triage do not prove functional behavior.

## Current inventory and coverage

The revised [component-interactable-audit skill](../.codex/skills/component-interactable-audit/SKILL.md)
uses the TypeScript compiler AST rather than heuristic tag matching. A new static
scan was run during this documentation update:

```bash
python3 .codex/skills/component-interactable-audit/scripts/audit_interactables.py --path client/src --format json --out /tmp/component-audit-doc-refresh.json
```

| Observation | Count / result |
| --- | --- |
| Discovered source files | 234 |
| Parsed files | 229 |
| Individually excluded files | 5 |
| Inventoried syntax entries | 673 |
| `WIRED_UNVERIFIED` | 358 |
| `NEEDS_REVIEW` | 311 |
| `NATIVE_BEHAVIOR` | 4 |
| Static issue candidates | 0 |
| Parser diagnostics / unsupported files discovered | 0 / 0 |
| Runtime-verified controls from the scanner | 0 |
| Route reachability | Not assessed by the scanner |
| Parser | TypeScript 5.8.3 |

The 673 entries are source syntax, not distinct rendered controls or mounted
screens. Wrappers and their callsites may be separate entries. Zero static
candidates does not clear the 311 unresolved entries or the known workflow bugs.
The local JSON output is temporary; the command, baseline and aggregate results
are retained here so the coverage statement survives that artifact's removal.

Default exclusions include hidden directories, dependencies, generated/build
output, `public`, `__tests__`, test results, `*.test.*`, `*.spec.*`, `*.stories.*`
and declaration files. The helper accepts JSX/TSX/JS/TS; Vue/Svelte/HTML are
reported as unsupported when encountered. This source scan encountered none.
Custom wrappers, prop spreads, imports, conditional states and arbitrary custom
control naming need source/runtime review. Label hints are not accessible-name
or keyboard/focus verification.

## Confirmed workflow defects remain

The [branch readiness follow-up](COMMIT_READINESS_REVIEW_2026-11-12.md) records
four still-present application defects with trigger, source and evidence:

1. Drivers View requires/sends a new reschedule date for categories whose status
   endpoint rejects that field; Procurement, Sales Order and Collection route
   callback checks returned HTTP 400 using transaction doubles.
2. 4 PM summaries link a user ID as a DeliveryRecord ID and are hidden by record
   visibility filtering.
3. 4 PM AM resolution can bypass inactive-directory and ambiguous-name rules.
4. Weekly notification logging can report `SENT` for mixed success/failure.

These defects demonstrate why static wiring cannot establish operational
readiness. The local Access Request modal now handles clipboard failures by
source inspection; its existing initial-render test does not exercise the
interactive failure path. No fresh every-screen browser audit was performed.

## Selected source paths, not end-to-end test results

| Interaction | Client / API path | Evidence limit |
| --- | --- | --- |
| Create a record | Record form → `api.createRecord` → `POST /api/v1/records` | Route existence does not prove every payload/role/state succeeds |
| Update record metadata | `api.updateRecord` → `PUT /api/v1/records/:id` | Shared field/role checks, versions and transactions remain relevant |
| Complete a run / final RMA | `api.patchStatus` → `PATCH /api/v1/records/:id/status` | RMA final completion belongs to TASS after separate receipt/transport prerequisites |
| Progress RMA transport | `api.progressRmaTransport` → `PATCH /api/v1/records/:id/rma-transport` | Assigned Driver only; transport completion is not physical receipt |
| Confirm RMA receipt | `api.receiveRma` → `POST /api/v1/records/:id/rma-receipt` | TASS receipt permission and workflow state apply |
| Verify collection | `api.verifyCollection` → `PATCH /api/v1/records/:id/verify-collection` | TASS only, accomplished and unverified collection |
| Save policy | Role editor → `PUT /api/v1/admin/roles/:role/permissions`; account editor → `PUT /api/v1/users/:id/permissions` | Requires the applicable permission-mode contract, current authority and expected version |

These method/path corrections replace the earlier report's incorrect PATCH
metadata and POST collection-verification examples. No table entry is a claim
of fresh browser, real database or provider validation.

## Historical record and withdrawn conclusions

The original heuristic scan reported 67 files, 600 interactables, no stub or
input-lock findings and three dismissed warnings. The warnings described a
Lucide `Menu` icon and two TypeScript `useState<Form>` generics. Those examples
illustrate parser false positives; dismissing them does not verify user actions.
The old scanner was heuristic, despite being described as AST-based.

The original per-area counts were:

| Area | Originally reported entries |
| --- | ---: |
| Deliveries and operations | 140 |
| Admin and policies | 128 |
| Shared primitives | 87 |
| Driver portal and board | 55 |
| Accounting Collection | 37 |
| Inventory and SKUs | 31 |
| Suppliers | 30 |
| Dashboard | 25 |
| Customers | 24 |
| Layout/navigation | 12 |
| Transactions | 9 |
| Authentication | 8 |
| App/routing | 4 |
| Sum of listed areas | 590 |

The listed areas sum to 590, not the original headline 600; the discrepancy is
unresolved. These counts were not reproduced and must not be used as current
coverage or compared directly with the AST inventory's different denominator.
The original “all inputs wired,” “100% working” area labels and “no fixes
required” recommendation are unsupported and no longer stand as conclusions.

The original report also recorded a strict TypeScript pass and 420 client tests
(419 passed, 1 skipped). Those historical results were not reproduced as part of
this documentation update. The later `1218fcd` validation is recorded in the
readiness follow-up: both TypeScript checks passed, 79 client test files passed,
and the explicit LEGACY-default server suite passed 528 tests with 8 PostgreSQL
checks skipped. Those results predate `81214c5`.

## Skill validation and next checks

The revised helper passed 17 regression tests, covering comments/strings,
TypeScript generics, icon aliases, ARIA roles, handler/event kinds, form ownership,
false disabled/read-only values, unresolved wrappers/spreads, malformed or
unreadable sources, exclusions and output contracts. An independent synthetic
review found four planted workflow defects beyond the single static stub
candidate and passed six isolated checks using browser/API/database doubles.
These validate the skill/helper behavior, not this application's workflows.

Prioritize the confirmed defects, then trace requested high-impact journeys and
unresolved controls through current authorization, validation, persisted state,
feedback/cache and the next role's view. Browser role walkthroughs, real
PostgreSQL checks on designated disposable targets and authorized provider
validation remain separate work. Severity follows practical impact rather than
a scanner status, and no functional-health percentage is inferred here.
