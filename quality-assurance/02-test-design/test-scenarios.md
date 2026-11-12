# Test Scenarios

| Document control | |
|---|---|
| Title | UAT Test Scenarios |
| Document ID | QA-TS-001 |
| Version | 1.1 |
| Date | 2026-10-14 |
| Author agent | Claude Code |
| Status | Ready for execution |
| Baseline | Branch `dev`, commit `2172fc8` |

High-level business scenarios (ISO/IEC/IEEE 29119-3 "test conditions" grouped into scenarios). Each scenario lists its test cases in execution order; the cases hold the exact steps and expected results. Together the scenarios cover the whole record lifecycle across all five roles.

> **Cycle 1 scope (user decision 2026-10-14):** focus on Deliveries. TS-004 (RMA) and TS-005 (Procurement Pick-up) are deferred, TS-006 now exercises bulk actions on Deliveries, and TASS is not part of TS-001 because its responsibilities are not yet defined. Deferred cases are recorded as Not Run. See `../00-discovery/open-questions.md` §0.

| ID | Scenario | Type | Roles | Priority |
|---|---|---|---|---|
| TS-001 | Delivery end to end through every role in scope | Happy path (E2E) | SC → LOG → DRV → ADMIN | Critical |
| TS-002 | Delivery alternate chain A: hold, reschedule, restart, Logistics completes | Alternate | LOG, ADMIN | High |
| TS-003 | Delivery alternate chain B: pending, re-attempt, return to Draft | Alternate | LOG, SC | High |
| TS-004 | RMA from creation to completion (**deferred**) | E2E | SC, TASS, ADMIN, DRV, LOG | High |
| TS-005 | Procurement Pick-up from creation to completion (**deferred**) | E2E | SC, LOG, TASS | Medium |
| TS-006 | Bulk list actions on Deliveries (Sales Orders cases deferred) | Alternate | SC, LOG | Medium |
| TS-007 | Draft handling and soft delete | Alternate | SC, LOG, ADMIN | High |
| TS-008 | Driver field execution and date/ownership rules | E2E / Negative | DRV, LOG | High |
| TS-009 | Attachments and proof-of-delivery rules | Negative / Boundary | SC, LOG, DRV | High |
| TS-010 | Unauthorized access attempts by every role | Access control | All | Critical |
| TS-011 | Invalid input on records | Negative / Boundary | SC, LOG, TASS | High |
| TS-012 | Companies, customers and suppliers | Positive / Negative | SC, LOG, TASS | Medium |
| TS-013 | Driver directory and dispatch views | Positive / Negative | ADMIN, LOG | Medium |
| TS-014 | SKU Master, stock adjustments and Transaction Center | Positive / Negative | ADMIN, LOG, SC, TASS | Medium |
| TS-015 | Dashboards, reports, exports and notifications | Positive / Negative | All staff roles | Medium |
| TS-016 | User administration and module access | Positive / Negative | ADMIN | High |
| TS-017 | Authentication and session security | Positive / Negative | All, anonymous | Critical |

---

## TS-001: Delivery end to end through every role in scope

**Goal.** One customer delivery travels from the first role to the last: a Sales Coordinator books a delivery for Jollibee; Logistics is notified and dispatches it; the Sales Coordinator is notified and adjusts it; the Driver delivers it with photo proof; Admin reviews the audit trail. TASS is not part of this chain in cycle 1 (responsibilities not yet defined, OQ-02/OQ-07); the collection steps of version 1.0 are deferred.

**Preconditions.** Fresh `npm run seed:uat`; sessions from TC-AUTH-001..005.

| Step | Role | What happens | Test case(s) |
|---|---|---|---|
| 1 | Sales Coordinator | Creates and submits Delivery `UAT-<RUN>-DEL-01` | TC-DEL-002 |
| 2 | Logistics | Is notified that a driver is needed | TC-NOT-001 |
| 3 | Logistics | Assigns John Doe and an assistant | TC-DEL-011 |
| 4 | Sales Coordinator | Is notified "Driver assigned"; raises priority with remarks; comments | TC-NOT-002, TC-DEL-014, TC-DEL-020 |
| 5 | Driver | Sees the run, records Time In, uploads proof, records Received By, completes | TC-DRV-001, TC-DRV-002, TC-DRV-004, TC-DRV-005 |
| 6 | Sales Coordinator | Reviews the record history in the Transaction Center | TC-TXN-003 |
| 7 | Admin | Reviews the audit trail and dashboard for the delivery | TC-ADM-023 |

Deferred from this scenario in cycle 1: TC-COL-001, 003, 004, 005, 006, 011 (collection), TC-NOT-005 (email).

**Pass condition.** Every step passes; D-DEL-01 ends "Delivered" with Time Out, Received By and photo, and its audit trail shows each role's action.

## TS-002: Delivery alternate chain A (D-DEL-02)

Logistics creates a delivery and walks it through On-Hold, Scheduled, Rescheduled (date rules), On-Hold, Rescheduled, Time In from Rescheduled, On-Hold while started, then completes it on the driver's behalf after the photo and Received By rules block it; Delivered is terminal and locks priority; timestamp corrections are checked.

Cases: TC-DEL-010 → TC-DEL-030 → TC-DEL-031 → TC-DEL-032 → TC-DEL-033 → TC-DEL-034 → TC-DEL-035 → TC-DEL-036 → TC-DEL-037 → TC-DEL-038 → TC-DEL-039 → TC-DEL-028.

## TS-003: Delivery alternate chain B (D-DEL-05)

Logistics starts a run, marks it Pending, holds and releases it, reschedules (timestamps cleared), restarts and reschedules again; the Sales Coordinator returns it to Draft from Rescheduled and later from On-Hold.

Cases: TC-DEL-019 → TC-DEL-040 → TC-DEL-041 → TC-DEL-042 → TC-DEL-043 → TC-DEL-044 → TC-DEL-045 → TC-DEL-046 → TC-DEL-047 → TC-DEL-048.

## TS-004: RMA from creation to completion (DEFERRED in cycle 1)

Sales Coordinator creates the RMA; Logistics only reads it; TASS works it (UI availability is checked, then server rules via API); Admin dispatches and starts the run; the Driver completes it. A seeded RMA run is rescheduled by the Driver.

Cases: TC-RMA-001 → TC-RMA-002 → TC-ACC-017 → TC-RMA-003 → TC-RMA-004 → TC-RMA-007 → TC-RMA-009; TC-DRV-008. Negative companions in TS-010: TC-RMA-005, TC-RMA-006, TC-RMA-008.

## TS-005: Procurement Pick-up (DEFERRED in cycle 1)

Sales Coordinator creates; Logistics dispatches, starts and completes; TASS visibility of the module it is granted is checked; the Suppliers pick-up tab is opened.

Cases: TC-PRC-001 → TC-PRC-006 → TC-PRC-002 → TC-PRC-003.

## TS-006: Bulk list actions on Deliveries

Logistics bulk-holds two Deliveries; the Sales Coordinator bulk-raises priority and a selection that includes a Delivered record is checked for the priority lock. The Sales Orders cases of version 1.0 are deferred.

Cases: TC-DEL-029 → TC-DEL-049. Deferred: TC-SO-001 → TC-SO-004.

## TS-007: Draft handling and soft delete

Save as Draft, submit refused without reference, complete and submit, return to Draft, delete via API, UI delete availability.

Cases: TC-DEL-001 → TC-DEL-015 → TC-DEL-016 → TC-DEL-017 → TC-DEL-025 → TC-DEL-024. Per OQ-03 no record may be deleted: TC-DEL-024 expects the API to refuse and TC-DEL-025 expects no delete control.

## TS-008: Driver field execution and date/ownership rules

The Driver works seeded runs (Time In, Pending, completion), cannot act on a future-dated delivery, cannot see another driver's runs, and an unlinked Driver login sees nothing.

Cases: TC-DIR-015 → TC-DRV-006 → TC-DRV-007 → TC-DRV-009; TC-ACC-011; TC-ACC-013. Deferred: TC-DRV-010 (non-Delivery date rule, OQ-04).

## TS-009: Attachments and proof-of-delivery rules

Allowed and disallowed types, disguised files, the 10 MB limit, the 10-file quota, removal with confirmation, protection of the last delivery photo, download fidelity, and that documents alone never count as proof.

Cases: TC-POD-001 → TC-POD-002 → TC-POD-003 → TC-POD-004 → TC-POD-008 → TC-DRV-003 → TC-POD-005 → TC-POD-006 → TC-POD-007. Deferred: TC-COL-008.

## TS-010: Unauthorized access attempts by every role

Each role is shown its own modules only and is refused (UI and API) what belongs to others: Sales Coordinator assigning drivers or opening admin screens; Logistics writing RMA, creating companies, submitting drafts, deleting; TASS reading Deliveries, assigning drivers, submitting drafts, uploading; Admin deleting records or verifying collections; Driver reading staff modules, other drivers' runs, changing metadata or sending emails; anonymous access.

Cases: TC-AUTH-011, TC-ACC-001..010, TC-ACC-014..016, TC-DEL-022, TC-DEL-023, TC-DEL-026, TC-DEL-027, TC-DRV-011, TC-POD-009, TC-POD-010, TC-RMA-002, TC-RMA-005, TC-RMA-006, TC-RMA-008, TC-COL-007, TC-COL-013, TC-DIR-003, TC-DIR-006, TC-DIR-008, TC-MD-011, TC-SKU-011, TC-TXN-005, TC-NOT-006, TC-NOT-007, TC-ADM-018.

## TS-011: Invalid input on records

Missing required fields, malformed and past dates, unknown priority/company/status, assignment of unknown or inactive people, Time In and status preconditions, filter validation, collection verification preconditions, invalid collection links.

Cases: TC-DEL-003..009, TC-DEL-012, TC-DEL-013, TC-DEL-018, TC-DEL-019, TC-DEL-021, TC-COL-002, TC-COL-009, TC-COL-010, TC-COL-012.

## TS-012: Companies, customers and suppliers

Cases: TC-MD-001 → TC-MD-002 → TC-MD-003 → TC-MD-004 → TC-MD-005 → TC-MD-006 → TC-MD-007 → TC-MD-008 → TC-MD-009 → TC-MD-010 (and TC-MD-011 in TS-010).

## TS-013: Driver directory and dispatch views

Cases: TC-DIR-001 → TC-DIR-002 → TC-DIR-004 → TC-DIR-005 → TC-DIR-007 → TC-DIR-009 → TC-DIR-010 → TC-DIR-011 → TC-DIR-012 → TC-DIR-013.

## TS-014: SKU Master, stock and Transaction Center

Cases: TC-SKU-001 → TC-SKU-002 → TC-SKU-003 → TC-SKU-004 → TC-SKU-005 → TC-SKU-006 → TC-SKU-007 → TC-SKU-008 → TC-SKU-009 → TC-SKU-010; TC-TXN-001, TC-TXN-002, TC-TXN-004, TC-TXN-006.

## TS-015: Dashboards, reports, exports and notifications

Cases: TC-RPT-001..009, TC-DIR-014, TC-NOT-003, TC-NOT-004.

## TS-016: User administration and module access

Cases: TC-ADM-001 → TC-ADM-002 → TC-ADM-003 → TC-ADM-004 → TC-ADM-005 → TC-ADM-006 → TC-ACC-012 → TC-ADM-007 → TC-ADM-016 → TC-ADM-019 → TC-ADM-021 → TC-ADM-022 → TC-ADM-008 → TC-ADM-009 → TC-ADM-011 → TC-ADM-010 → TC-ADM-012 → TC-ADM-013 → TC-ADM-014 → TC-ADM-015 → TC-ADM-017 → TC-ADM-020.

## TS-017: Authentication and session security

Cases: TC-AUTH-001..005 (sessions), TC-AUTH-006..010, TC-AUTH-012, TC-AUTH-013 (after TC-ADM-003), TC-DRV-012.
