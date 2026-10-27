# Latest PRs and version-dependent assertions

GitHub state checked on 2026-10-27. Pinned current merged baseline: `8660bdee15b502867716ca0c60683965c6cd87f6`. PR #240 head: `c6661e41df073906a940ceace3e9694c078372ed`. These are source-review and existing CI-log observations, not production deployment or new local/browser execution performed by this documentation task.

## Merged PR #237: RMA ownership and manual references

[PR #237](https://github.com/OatiesMilk/Supply-Chain/pull/237) merged before #238 and is included in the baseline. Acceptance coverage should distinguish:

- TASS/Admin RMA creation, drafts, submission, metadata/priority edits, documents and manual reference ownership.
- Logistics saved-record read/print only; SC/Driver no RMA access, including aggregate/search/transaction/audit/attachment paths.
- Optional manual `rma_reference`, separate historical `legacy_sap_reference`, seven RMA category labels and legacy normalization.
- Existing purchase date/contact fields in persistence/serialization versus unresolved #230 business/document semantics.
- The remaining lifecycle problem that #236/#240 address: entry ownership alone did not remove internal Delivery Time In/POD prerequisites.

## Merged PR #238: route-slip periods

[PR #238](https://github.com/OatiesMilk/Supply-Chain/pull/238) merged into dev on 2026-10-27. It is in the default `merged-dev` profile, not a future capability.

| Concern | Contract to test |
| --- | --- |
| Selection | Single day, From date onward, From–To range, shared with table dates |
| Day | Both effective bounds equal selected day; entire scheduled business day |
| From | Lower bound inclusive, no upper bound |
| Range | Both real date-only bounds required; inclusive; From<=To |
| Date basis | Scheduled Delivery Date, Asia/Manila business day; no substitute generation/creation date |
| Data | All matching cursor pages, limit100, preserve active filters and server scope |
| Drivers | Group by actual assigned Driver names, even for partial Driver search; omit unassigned from slips |
| Formats | Excel/PDF/Word use same selected rows/period; generic CSV remains row export |
| Variants | Current status and lifetime Status Trail; do not redefine trail as events during selected days |
| Errors | Blank/inverted/partial invalid selections prevent generation; no matching assigned Driver yields visible error |
| UX | Usable labels/summary, keyboard Escape/focus, mobile layout, loading/errors |

Existing new tests: `client/src/utils/__tests__/routeSlipPeriod.test.ts`, `client/tests/routeSlipExports.test.ts`, `client/tests/routeSlipMenu.test.ts`. The artifact suite includes 36 generated-document combinations. The actual DeliveryRecordsView test covers dedicated-menu pagination and selected filters; other test harnesses cover both menus. Do not infer that the actual-view test exercises every general-menu/error/format combination.

PR metadata reported 186 client and 280 server tests with strict TypeScript/build checks. Earlier in this session those two suites/typechecks were also observed passing at #238 head `31a2417` (the source content merged as `efb0283`). That evidence is not a new test run performed by creating this reference, and it does not cover PR #240 or every case proposed here. PR text still mentioned visual verification pending; merger alone does not create that evidence.

## Merged PR #240: RMA lifecycle

[PR #240](https://github.com/OatiesMilk/Supply-Chain/pull/240), author Julius, merged on 2026-10-27 at08:57:30 UTC as `8660bde` and is included in this reference's default baseline. It changes the existing status endpoint and lifecycle helpers; it adds no new RMA completion endpoint or database migration. Its own policy document says approval was obtained in its implementation chat; this reference records the PR's implemented delta rather than independently certifying that approval.

### Integrated tree and current CI evidence

The PR head was rebased onto `efb0283` (merged #238), then merged as `8660bde`. Both route-slip and RMA changes are present in the current baseline. The previous `efb0283` snapshot is used only for explicitly historical comparisons below.

[CI run 40473515083](https://github.com/OatiesMilk/Supply-Chain/actions/runs/40473515083) on this updated PR passed its quality/build and Playwright jobs. Reading the actual job logs showed **189 client tests and 288 server tests passed, zero failed/skipped in those Node suites**, plus **67 browser tests passed** (20 SC, 28 Logistics, 15 Driver, 4 cross-role). Cloudflare Pages also reported success. These are existing hosted-run results inspected during documentation, not newly run local tests.

The PR description/policy document still report an older 145-client local result. Prefer the SHA-bound current CI log for integrated automated evidence. The browser projects do not establish a dedicated persisted TASS/Admin RMA completion journey. The PR description still lists that verification and human review as pending; merge status alone is not evidence that those activities were performed.

### Contract delta

| Behavior | Historical `efb0283` before #240 | Current `8660bde` including #240 |
| --- | --- | --- |
| RMA Pending/Delivered prerequisites | Internal run Time In required | RMA independent of internal run |
| RMA completion owner | Entry owned by TASS/Admin, but normal progress blocked by inherited lifecycle | TASS/Admin complete via status action |
| Completion body | Generic run body, prerequisites block new RMA | `{status:"Delivered",remarks:"...",received_by:"<recipient / collector>"}` |
| Driver/vehicle | No fabricated assignment should be created; inherited run start blocks lifecycle | Completion needs no internal Driver/vehicle |
| Time In/POD/Delivery Date | Generic completion rules apply; no new physical-receipt action | No RMA Time In, POD photo or scheduled-date prerequisite |
| Completion timestamp | Generic server Time Out when allowed | Server `time_out`, displayed as Completed at for RMA |
| Atomicity | Existing locked status transaction | Recipient/status/time/actor/audit/remark persist in one existing transaction |
| Legacy RMA Scheduled with Time In | Effective state becomes In Transit | Explicit RMA status remains Scheduled; stamp is historical evidence |
| Reschedule RMA | Clears Time In/Time Out/recipient | Preserves historical values; does not auto-complete or auto-start |
| Return legacy started RMA to Draft | Blocked by Time In | Still blocked |
| RMA last photo | Generic last-proof retention | May remove optional RMA photo after completion |
| Logistics/SC/Driver RMA access | Logistics read/print, SC/Driver denied | Same role boundaries |
| Ordinary Delivery proof and clocks | Required | Preserved; regression cases must prove it |
| Supplier-specific identity/routing/receipt | Unimplemented requirements | Still outside #240; #231/#239 |

### RMA state graph in the current merged profile

| From | Allowed next states |
| --- | --- |
| Draft | Scheduled |
| Scheduled | Pending, On-Hold, Rescheduled, Delivered, Draft |
| Pending | On-Hold, Rescheduled, Delivered |
| On-Hold | Scheduled, Pending, Rescheduled, Delivered, Draft |
| Rescheduled | Scheduled, On-Hold, Draft |
| Legacy In Transit | Pending, On-Hold, Rescheduled, Delivered |
| Delivered | None |

RMA Rescheduled cannot go directly to Delivered: first return to Scheduled or On-Hold. Existing Time In removes Draft return. Use server-provided choices plus endpoint role checks; do not hardcode the ordinary Delivery graph into the RMA UI/tests.

Example request for TASS/Admin on an eligible RMA:

```http
PATCH /api/records/<rma-id>/status
Content-Type: application/json
X-CSRF-Token: <session-token>
```

```json
{"status":"Delivered","remarks":"RMA handover confirmed","received_by":"QA Collector"}
```

Expected 200 full serialized RMA: Delivered, recipient preserved, nonblank server `time_out` between request start/end, correct `modified_by_id`, and matching audit/STATUS_CHANGE remark. No preliminary PUT, Driver assignment or attachment read/upload is needed merely to satisfy RMA completion. Existing optional attachments remain readable.

### Required regression families

- TASS and Admin status/priority/completion through the actual workspace, one atomic status request, save/reload and audit verification.
- Empty recipient/remarks, disallowed transitions, repeated terminal completion and forged client timestamps rejected without partial mutation.
- Logistics read/print works but all mutations denied; SC/Driver cannot read RMA even with forged grants/IDs.
- Completed RMA attachment removal versus unchanged last-proof protection for ordinary deliveries.
- Legacy RMA Time In survives rescheduling and Scheduled does not normalize back to In Transit in detail, filters, AM summary or status-history counts.
- Ordinary Delivery still requires company Driver start, valid scheduled date, Time In, actual saved proof and recipient; future/late behavior preserved.
- Merged #238 route-slip cases still run on the integrated tree.

Existing branch files: `server/tests/podRequirements.test.ts`, `recordsDateSorting.test.ts`, `statusHistoryLifecycle.test.ts`; client `rmaCompletionWorkspace.test.ts`, lifecycle/POD/mutation tests. Current CI has the integrated counts above. Its description still lists persisted RMA browser verification and human review as pending. Passing general role suites or the merge action does not establish evidence for that specific journey.

## Requirements that must remain separate

| Issue | Do not assume |
| --- | --- |
| #230 | Contact fields absent merely because ticket is open; or their requiredness/source/document layouts are approved because fields exist |
| #231 | Supplier identity/direction/collector workflow implemented by generic RMA completion |
| #232 | No preview exists; images/PDF/DOCX already have a preview API, but generated-document and full fidelity scope still need review |
| #239 | A complete movement ownership/physical receipt/partial receipt/visibility/Excel migration workflow exists |

Keep future-business acceptance scenarios tagged `requirements-only` until the human decisions and implementation are present. Do not quietly broaden current or historical test fixtures to grant new permissions or fabricate receiving evidence.
