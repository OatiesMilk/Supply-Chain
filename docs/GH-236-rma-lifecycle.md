# GH-236: RMA lifecycle

The repository owner approved this policy in the implementation chat on
2026-10-27. TASS and Admin manage RMA creation, submission, progress and
completion. Logistics remains read-only; Sales Coordinator and Driver cannot
access RMA records. Supplier-specific collection features remain in GH-231.

## Status transitions

| Current status | Allowed next statuses |
| --- | --- |
| Draft | Scheduled |
| Scheduled | Pending, On-Hold, Rescheduled, Delivered, Draft |
| Pending | On-Hold, Rescheduled, Delivered |
| On-Hold | Scheduled, Pending, Rescheduled, Delivered, Draft |
| Rescheduled | Scheduled, On-Hold, Draft |
| Legacy In Transit | Pending, On-Hold, Rescheduled, Delivered |
| Delivered | None |

Existing Time In prevents returning legacy started records to Draft. RMA
rescheduling preserves historical timestamps, which do not implicitly move a
Scheduled RMA back to In Transit. A rescheduled RMA must return to
Scheduled or On-Hold before completion; the server supplies the same permitted
choices displayed by the client.

## Completion

The **Complete RMA** action requires nonblank remarks and a recipient/collector
name. It does not require an internal driver, delivery Time In, scheduled
delivery date or POD photo. Supporting attachments remain optional.
The recipient input is offered only when selecting completion; other status
actions show the saved recipient as read-only, so they cannot silently discard
an unrelated recipient edit.

The status endpoint saves the recipient, Delivered status, server completion
timestamp, modifying actor, audit snapshot and append-only remarks within the
existing locked transaction. The completion timestamp uses the existing
`timeOut` / `time_out` field and is labeled **Completed at** in the RMA workspace;
no schema migration is needed. Historical Time In values are not fabricated or
erased. Existing internal Delivery transitions and proof requirements remain.

## Verification

- Server regression coverage: `server/tests/podRequirements.test.ts` exercises
  the approved graph, allowed and rejected role/status requests, missing
  recipient/remarks, terminal completion, timestamp/audit attribution, legacy
  clocks, optional attachments, and existing Delivery proof requirements.
- Client regression coverage: completion validation, server-provided status
  choices, hidden RMA Time In, and atomic status mutation without an attachment
  service dependency.
- Client and server strict TypeScript checks passed. Full Node test suites
  passed: client **145/145**, server **288/288**. The client suite includes a
  JSDOM interaction that completes an RMA as both TASS and Admin through the
  actual workspace/mutation path, with recipient and remarks in one status
  request and no preliminary record edit. Dependencies were refreshed and the
  Prisma client regenerated after updating dev; no package or lockfiles changed.
- Browser save/reload verification requires the existing services on ports
  3000/4000. Neither port was listening during implementation; persisted browser
  verification remains outstanding. No services or database resets were started.

AI assistance: Codex implemented the approved policy. Human PR review remains
required before merge; this document does not claim GitHub issue closure or
persisted browser verification.
