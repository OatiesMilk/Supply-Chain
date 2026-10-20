# HO-002: Claude Code to Codex, cycle-1 scope update

| Document control | |
|---|---|
| Title | HO-002 Claude Code to Codex: cycle-1 scope update after user decisions |
| Version | 1.0 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Open |

| Field | Value |
|---|---|
| From | Claude Code (test designer) |
| To | ChatGPT Codex (test executor and reporter) |
| Date (Asia/Manila) | 2026-10-14 |
| Status | Ready |
| Related run(s) | RUN-<YYYYMMDD>-01 (first run, not started) |
| Previous handoff | HO-001 (still valid except where this handoff changes it) |
| Baseline | Latest `dev` commit `2172fc8` (all documents updated to reference it) |

## Summary

The user answered all nine open questions. **Cycle 1 focuses on Deliveries.** 172 of the 213 test cases run; 41 are deferred and must be recorded as Not Run with the reason written in each case. Two expectations changed: records must never be deleted, and Sales Coordinator must have "Delivery Calendar" and "Reports". Use `AGENTS.md` version 1.1 (§6 has the new execution order).

## What changed

| Area | Change | Files |
|---|---|---|
| Scope | RMA, Accounting Collection, Procurement Pick-up, Sales Orders, TASS-specific behaviour and the completion email are deferred | `01-plan/uat-test-plan.md` §3.3; deferred cases carry a bold note in Preconditions and "Deferred" in each file's Summary table |
| TS-001 | Now SC → Logistics → Driver → Admin on one Delivery (no collection, no TASS) | `02-test-design/test-scenarios.md` |
| TS-006 | Bulk actions tested on Deliveries (new TC-DEL-029, TC-DEL-049) | `TC-DEL-deliveries.md`; data D-DEL-08, D-DEL-09 in `test-data.md` |
| Deletion (OQ-03) | TC-DEL-024 now expects the API to **refuse** deletion (SI-26 if it succeeds); TC-DEL-025 expects **no** delete button (SI-24 resolved) | `TC-DEL-deliveries.md` |
| SC screens (OQ-09) | TC-ACC-001, TC-ACC-002 and TC-RPT-006 expect SC to see and open Delivery Calendar and Reports (SI-25 if not); TC-ADM-014 now grants "SKU Master" to test overrides | `TC-ACC-access-control.md`, `TC-RPT-dashboards-reports.md`, `TC-ADM-administration.md` |
| Logistics drafts (OQ-06) | Confirmed: Logistics must not submit drafts (TC-DEL-022) | `TC-DEL-deliveries.md` |
| Drivers and customers (OQ-05) | Confirmed: Drivers must not create customers (TC-ACC-014) | `TC-ACC-access-control.md` |
| Driver seeded runs | TC-DRV-006/007, TC-DRV-011 and TC-NOT-007 now use the seeded **Delivery** run D-SEED-DEL | `TC-DRV-driver-app.md`, `TC-NOT-notifications.md` |
| Traceability | Items covered only by deferred cases are marked "Deferred" | `02-test-design/traceability-matrix.md` |

## What is needed next

1. **Codex:** execute RUN-<YYYYMMDD>-01 following `AGENTS.md` §6 (phases 0-15); record deferred cases as Not Run.
2. **Codex:** in the summary report, list SI-25 and SI-26 with the other suspected issues, and list the SIs that were not exercised because their cases are deferred (SI-01, SI-08, SI-14, SI-17, SI-20, SI-22, SI-23).
3. **User:** environment prerequisites are unchanged from HO-001.

## Open issues

| ID | Description | Owner | Blocking? |
|---|---|---|---|
| OQ-01, OQ-02, OQ-07 | RMA ownership, TASS responsibilities and collection verification owner still to be decided; deferred cases resume when they are | User | No |
| Git | No branches, commits or pushes until the whole UAT is finished on the user's machine | All | No |

## Links to relevant files

- [`../AGENTS.md`](../AGENTS.md)
- [`../00-discovery/open-questions.md`](../00-discovery/open-questions.md) §0
- [`../01-plan/uat-test-plan.md`](../01-plan/uat-test-plan.md) §3.3
- [`../02-test-design/test-scenarios.md`](../02-test-design/test-scenarios.md)
- [`../02-test-design/traceability-matrix.md`](../02-test-design/traceability-matrix.md)
- [`HO-001-claude-to-codex-uat-ready.md`](HO-001-claude-to-codex-uat-ready.md)
