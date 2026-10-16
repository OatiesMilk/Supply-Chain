# Confirmed major issue remediation

| Document control | Value |
|---|---|
| Date | 2026-10-16 |
| Branch | dev; uncommitted working-tree changes |
| Status | Implemented and automated validation passed; live browser acceptance pending |

The user authorized fixing the confirmed issues in the [remaining-major-issues review](2026-10-16-remaining-major-issues-review.md). This is application remediation, superseding the findings-only constraint for these authorized fixes. Historical UAT outcomes are preserved.

## Scope

| Finding | Intended resulting behavior |
|---|---|
| DEF-010 | Only Sales Coordinator/Admin can submit an existing Draft. Logistics can still create an unassigned new Scheduled record. |
| DEF-011 | The operational record deletion endpoint refuses deletion for all roles. This does not authorize or change separate administrative fixture-reset tooling. |
| DEF-026 | Stock adjustments accept only Goods Receipt, Sale, Adjustment or Transfer; quantities must be finite nonzero integers within supported bounds and resulting stock cannot be negative or overflow. |
| DEF-017 | Duplicate user-email changes return a conflict response. Customer creation validates input before Prisma and forwards unexpected failures to the normal error handler. Duplicate SKU creation was addressed in the prior authorized change. |
| DEF-006/007 | Delivery creation rejects invalid dates and priorities before writing. Drafts may still omit the date/reference where allowed. |
| DEF-008 | Unknown companies receive a validation response, including foreign-key failure if the company disappears between lookup and write. |
| DEF-025 | SKU edits use the same numeric validation as creation and cannot bypass the creation safeguards. |

The older BR-REC-03/07 text and role table are aligned to the recorded OQ-03/OQ-06 user decisions. Sales Calendar/Reports defaults remain unchanged under the user's current policy (DEF-003 accepted after manual grants).

DEF-019 remains a report-detail requirement question; DEF-021 needs the original two-session browser reproduction because conflict handling already exists in source. Neither is claimed fixed by this change. The earlier Admin SKU creation and Reports fixes remain in the working tree.

## Verification

Automated validation passed on the working tree:

- `npm run test:server`: 239 tests passed, zero failed. The run used unrestricted local listener access for the existing HTTP integration tests. Apparent output stalling was a tool-delivery delay; the complete suite passed.
- `npm run test:client`: all 27 reported test files passed, zero failed.
- New `server/tests/majorDefects.test.ts`: 13 focused cases passed, covering rejected requests without writes and permitted operations. Database behavior in this file is mocked; session/module middleware is covered separately by the existing integration suites.
- Focused client checks: 5 passed, including refusal of fractional stock input. Existing TSK-120 workflow checks: 4 passed.
- Client and server `tsc --noEmit` checks: passed.
- `git diff --check`: passed.

Stock changes, ledger entries, product stamps and their audit are committed together; a failed audit aborts the transaction. SKU creation/editing likewise save their audit with the catalog change. Existing Admin SKU creation and Reports regression coverage remains passing.

No live database writes, schema migrations, environment changes, branch creation or commits were performed. Live browser UAT has not been rerun; these are implementation/regression results, not new UAT Pass values or revised historical totals. The confirmed issues are implemented pending live browser acceptance using the checklist below.

## Browser acceptance checklist

Use disposable fixtures and separate role sessions. A denied request must leave its record/stock unchanged. Use the browser-console helper from `quality-assurance/AGENTS.md` section 8 for API-only controls; do not save cookies, passwords or CSRF headers with evidence.

1. Create a disposable Delivery draft as Sales Coordinator. As Logistics, attempt `PATCH /api/records/<id>/status` with Scheduled and remarks: expect 403 and unchanged Draft. As Sales Coordinator/Admin, submission should succeed. Logistics creating a separate new Scheduled record should still succeed.
2. As Sales Coordinator, request deletion of a disposable record: expect 403 and the record still accessible. Other roles must also be refused. Do not target business records for the check.
3. As Admin, attempt adjustment type Gift on a disposable SKU: expect 400 with no stock/ledger change. Zero, fractional and oversized quantities must also be rejected. A valid Goods Receipt with a reference should succeed and have an audit entry.
4. As Admin, edit a disposable user's email to an existing test user's email: expect a clear 409 conflict promptly and unchanged email. A valid distinct email should save.
5. As Sales Coordinator, create a customer using a number/object for name: expect 400 promptly with no customer created. Valid customer text should save; invalid email/phone input must be rejected.
6. As Sales Coordinator, attempt Delivery creation with malformed date, unknown priority or nonexistent company: expect 400 and no record created. Valid creation should succeed; a Draft may still omit its date/reference.
7. As Admin, attempt a SKU edit with negative cost or nonnumeric price: expect 400 and unchanged SKU. A valid numeric edit should save with an audit entry.

The focused regression tests cover these rules using mocks, but the browser checklist verifies deployed wiring, current sessions and actual persistence independently.
