# Existing test inventory

Pinned source: `8660bdee15b502867716ca0c60683965c6cd87f6`. Presence in this inventory is not proof of passing tests or full feature coverage. Some route tests replace Prisma with mocks; JSDOM is not a real browser and cannot verify layout. CI role Playwright suites use isolated PostgreSQL. No new execution evidence is asserted by this document.

## client/src/components/__tests__/commentComposer.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/components/__tests__/commentComposer.test.ts).

- a single line is as tall as the Send button
- the textarea grows with its text up to six lines, then scrolls

## client/src/utils/__tests__/companyHistory.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/utils/__tests__/companyHistory.test.ts).

- company history joins on the Company ID, never on a matching name
- rows link to their own module only when the user can open it
- category filters only offer modules the user can access
- pagination continues from the last row only after a full page

## client/src/utils/__tests__/customerValidation.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/utils/__tests__/customerValidation.test.ts).

- a valid edit with a reason has no errors
- required name, email format, phone characters and the reason are checked inline
- optional fields may be cleared, but not past their length limits
- only fields that differ after trimming count as changes

## client/src/utils/__tests__/dashboardFilters.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/utils/__tests__/dashboardFilters.test.ts).

- SC and Logistics delivery presets exclude other modules and both draft representations
- SC needs-attention union counts each matching Delivery once and includes overdue due-soon rows
- Logistics Flags union counts unique unassigned and blocked Delivery rows
- Completed Today uses Manila Time Out day boundaries
- TASS and Admin collection presets preserve category, lifecycle, and verification predicates
- Admin week preset starts Sunday in Manila

## client/src/utils/__tests__/dateRangePicker.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/utils/__tests__/dateRangePicker.test.ts).

- dragging backwards and selecting a single day produce valid inclusive ranges
- calendar arithmetic crosses leap days and years without timezone shifts
- keyboard navigation follows calendar weeks, months and years
- presets use the supplied business date and the trigger describes open-ended filters

## client/src/utils/__tests__/driverCoverage.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/utils/__tests__/driverCoverage.test.ts).

- an exact Area covers only that Area, case-insensitively
- an explicit Subregion covers every Area inside it
- one covered Area never implies its whole Subregion
- no substring or fuzzy matching, and unknown or empty areas match nothing
- drivers are grouped exact Area, then explicit Subregion, then everyone else (still selectable)
- canonical names are recognised for Areas and Subregions only

## client/src/utils/__tests__/podRequirement.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/utils/__tests__/podRequirement.test.ts).

- delivery completion requires a server-validated saved photo, not a name or MIME claim
- loading, failed reads and pending uploads block completion even with a cached photo
- an upload only unlocks completion after the saved attachment has been confirmed
- failed upload with no saved photo stays blocked; retry can recover
- other run categories require a saved photo for completion, while side states do not
- RMA completion requires a recipient but no Time In or attachment readiness
- completion needs Time In and a nonblank receiver even with verified photos
- previewable supporting documents remain valid while count, format and size limits apply

## client/src/utils/__tests__/recordLifecycle.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/utils/__tests__/recordLifecycle.test.ts).

- Save as Draft accepts an incomplete reference; Submit requires the reference and both require a selected company
- RMA drafts and submissions require company, priority, area and account manager only
- frontend choices use server transitions and limit Draft to SC/Admin before Time In
- drafts can be submitted but cannot start runs or receive assignments
- only assigned, not-yet-started Scheduled/Rescheduled runs offer Time In
- today and corrections consistently use Manila around UTC day boundaries
- Delivery actionability uses the latest date, allows overdue runs, and keeps upcoming runs read-only
- completed-late display uses the persisted completion value
- started Delivery eligibility requires the server timestamp format
- TSK-123: reschedule date must be present, valid, not past and different from the current date
- TSK-124: Priority is locked only once a record is Delivered
- TSK-125: Return to Draft consequences name the driver only when assigned and mention Logistics only with dispatch

## client/src/utils/__tests__/routeSlipPeriod.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/utils/__tests__/routeSlipPeriod.test.ts).

- route slips select a whole calendar day, an inclusive range, or every day from the starting date
- blank, partial range, inverted, impossible and timestamp inputs cannot silently generate an unbounded route slip
- period labels preserve calendar dates across host timezones and distinguish an open ending
- partial driver matching is grouped under the actual assigned driver names

## client/src/utils/tests/dateRange.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/utils/tests/dateRange.test.ts).

- all Operations pages reject an earlier Date To and apply neither half of the invalid range (default enforceChronology=true)
- equal dates are a valid one-day range
- clearing Date From removes the Date To minimum and retains Date To
- explicit enforceChronology=false allows an inverted range (legacy opt-out path)
- moving Date From after an existing Date To clears Date To (default enforceChronology=true)
- moving Date From before an existing Date To keeps Date To
- explicit enforceChronology=false never clears Date To when Date From moves past it
- sort: default preserves input order
- sort: oldest first (ascending delivery_date, nulls last)
- sort: furthest future first (descending delivery_date, nulls last)
- sort: nearest to present (ascending |distance| from reference, nulls last)
- sort: blank delivery dates remain last when sorting oldest or furthest

## client/src/utils/tests/demoLocations.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/utils/tests/demoLocations.test.ts).

- every demo location uses an exact canonical AREA_HIERARCHY area and a nonblank address
- selection returns one intact fixture so Area and Address cannot come from different rows
- deterministic index boundaries select the first and last fixtures safely
- BGC fixture maps to a Taguig and BGC address

## client/src/utils/tests/exportDates.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/utils/tests/exportDates.test.ts).

- date-only exports preserve the Manila calendar date
- timestamp exports display the Manila calendar date and clock time

## client/src/utils/tests/podPreview.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/src/utils/tests/podPreview.test.ts).

- splitPodAttachments trusts the server is_photo flag instead of the file name or MIME type
- nextLightboxIndex moves in either direction and wraps at both ends

## client/tests/csrfToken.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/csrfToken.test.ts).

- the token from a response is sent on later requests, including file uploads
- a refused token is refreshed from the session and the write is retried once
- a write that is still refused after the retry fails instead of looping

## client/tests/customerEditConflict.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/customerEditConflict.test.ts).

- customer edit keeps its draft after load-latest fails and saves against the retried version

## client/tests/dateRangePicker.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/dateRangePicker.test.ts).

- calendar edits stay local until Apply; cancelling restores the saved range
- reverse pointer dragging captures one pointer, previews a range, and applies only once
- touch selects the range with two taps without intercepting scroll gestures

## client/tests/demoAccounts.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/demoAccounts.test.ts).

- demo login requires explicit opt-in during development
- staging and production cannot enable demo login even with flag true

## client/tests/driverDirectory.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/driverDirectory.test.ts).

- an empty directory stays empty and failed reads reject instead of returning demo drivers
- failed creation propagates the error without fabricating a driver
- assignment options exclude inactive entries and accept an authoritative empty roster

## client/tests/driverReportCSV.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/driverReportCSV.test.ts).

- DEF-019: CSV begins with company header and report title
- DEF-019: Performance section is present with correct column headers
- DEF-019: Each driver appears exactly once in the performance section
- DEF-019: TOTALS row sums all drivers correctly
- DEF-019: PERCENTAGE row ends with 100%
- DEF-019: Departure and Arrival breakdown sections are present
- DEF-019: Vehicle plate breakdown section lists plate numbers
- DEF-019: Remarks section includes drivers with remarks
- DEF-019: RFC 4180 - cell containing commas and quotes is quoted correctly
- DEF-019: RFC 4180 - cell containing newlines is enclosed in double quotes
- DEF-019: CSV contains NO individual delivery reference rows (aggregate-only contract confirmed)

## client/tests/driversPage.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/driversPage.test.ts).

- the Drivers item opens the first granted tab when nothing is remembered
- the Drivers item reopens the last tab only while it is still granted
- Drivers page shows a tab per granted screen and marks the current one
- Drivers page hides the tab bar when only one screen is granted

## client/tests/lazyLoading.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/lazyLoading.test.ts).

- AppRouter wraps accessible views in a Suspense boundary without throwing
- isResourceQueryEnabled scopes queries to active screens while keeping global data available
- record lists load for operational screens but not unrelated directories
- driver directory loads on every operational creation and assignment screen

## client/tests/lazyLoadingRecovery.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/lazyLoadingRecovery.test.ts).

- vendor chunk rules match actual package boundaries, including pnpm and Windows paths
- cold page resource errors/loading are visible and cached refresh failures do not hide data
- failed lazy imports can retry successfully and navigation remounts a failed shared page

## client/tests/manilaTimestamp.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/manilaTimestamp.test.ts).

- UTC timestamps render as explicit 12-hour Manila time independent of host timezone
- missing and invalid timestamps display an em dash
- workspace header, Overview and its editing state show Manila timestamps with safe empty values

## client/tests/notificationNavigation.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/notificationNavigation.test.ts).

- notification resolves correct category without fetching the entire records list

## client/tests/pagination.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/pagination.test.ts).

- getPaginationItems handles small page sets without ellipsis (TSK-29)
- getPaginationItems handles large page sets with smart ellipsis windowing (TSK-29)
- Pagination renders active page with bold brand styling and touch-friendly targets (TSK-29)
- Pagination handles zero records gracefully (TSK-29)

## client/tests/permissions.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/permissions.test.ts).

- all sidebar links follow access checks, including the formerly unconditional modules
- an incomplete session renders no role-default permissions
- denied queries never restore unscoped browser data
- a forbidden record update remains an error instead of a simulated successful save

## client/tests/recordAttachments.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/recordAttachments.test.ts).

- attachment reconciliation matches duplicate metadata as a multiset
- retry reconciles an upload saved by the server before a lost response

## client/tests/recordLifecycleMutations.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/recordLifecycleMutations.test.ts).

- RMA completion patches recipient and remarks atomically without loading optional proof
- priority edits on an already completed legacy record do not trigger a new completion or require attachments
- a new completion is blocked before patching when proof or Time In is missing
- the assignment board hides new and retained-assignment drafts until submission

## client/tests/rmaAutofill.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/rmaAutofill.test.ts).

- RMA Auto Fill preserves blank and manually entered references for every category
- Admin RMA sample defaults leave Reference empty and use the current category and item choices

## client/tests/rmaCompletionWorkspace.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/rmaCompletionWorkspace.test.ts).

- TASS and Admin complete RMA through the workspace with recipient and remarks in one status request

## client/tests/routeSlipExports.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/routeSlipExports.test.ts).

- actual PDF, Excel and Word outputs agree on period, boundaries, drivers and lifetime trail

## client/tests/routeSlipMenu.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/routeSlipMenu.test.ts).

- both menus share day/from/range values, reject invalid ranges and restore keyboard focus on Escape
- dedicated and general export paths include later pages and retain every active filter
- the actual DeliveryRecordsView fetches every page with its selected filters instead of exporting cached rows

## client/tests/serverAvailability.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/serverAvailability.test.ts).

- health requires an explicit healthy response, bypasses cache, and supports cancellation
- disconnection and malformed health responses reject so the monitor can show the outage page
- API connectivity failures request a probe without retrying writes; auth errors do not

## client/tests/sessionNavigation.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/sessionNavigation.test.ts).

- logged-out Back navigation keeps the login URL and stops listening after login
- login and history routes honor role defaults, grants, revocations, and valid detail links
- logout stays pending until its response finishes; session checks cannot restore the old account meanwhile
- new sessions cannot reuse previous query data or late results
- a failed logout is retried on reconnect before the old cookie can restore an account
- logout from Admin clears the route and open details before another role logs in, even offline
- permissions are available on first render and respect grants and revocations
- inaccessible routes never mount protected pages
- a login without an authoritative permission snapshot is rejected
- revocation refresh updates the active session without logout and stale refreshes cannot replace another login
- permission refresh errors revoke unverifiable local access

## client/tests/sidebarIcons.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/sidebarIcons.test.ts).

- Sidebar renders distinct Layers icon for Main and LayoutDashboard for Dashboard (TSK-31)
- Sidebar keeps every module behind its existing canAccess check
- Sidebar groups the driver screens under one Drivers item

## client/tests/skuCreation.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/skuCreation.test.ts).

- only Admin sees SKU creation
- successful SKU creation updates catalog cache and refreshes
- SKU form preserves fields on conflict and can retry successfully
- report failure ends loading and displays error with retry available
- stock adjustment refuses fractional quantities without silently truncating or posting

## client/tests/workspaceTabs.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/client/tests/workspaceTabs.test.ts).

- manual tabs wrap arrow navigation and support Home/End without activating on unrelated keys
- tabs expose linked accessible panels, one keyboard entry, and lazy initial contents

## e2e/tests/driver.spec.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/e2e/tests/driver.spec.ts).

- C-1 Driver Dashboard
- C-1.1 Driver lands on Field Mobile dashboard (no sidebar)
- C-1.2 Stats strip shows correct counters
- C-1.3 Future assigned Delivery stays visible and read-only
- C-1.4 Overdue assigned Delivery shows lateness and execution controls
- C-1.5 Logout works
- C-2 ePOD Flow
- C-2.1 Record Time In button is clickable
- C-2.2 POD upload section is visible on an active delivery
- C-2.4 Driver can upload a valid delivery photo
- C-2.3 Supporting documents upload but do not satisfy photo proof
- C-2.7 Received By field accepts text
- C-2.10 Confirm button is disabled without remarks
- C-2.8 Full Accomplish flow with remarks
- C-3 Accomplished Records View
- C-3.1 Accomplished section visible after delivery
- C-3.2 POD photo opens in a lightbox and Escape closes it

## e2e/tests/integration.spec.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/e2e/tests/integration.spec.ts).

- X Cross-Role Integration
- TSK-120: SC Draft submission reaches Logistics and the assigned Driver
- X-1 Driver Time In is visible to Logistics on the same record
- X-2 Audit Trail shows Driver activity

## e2e/tests/logistics.spec.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/e2e/tests/logistics.spec.ts).

- B-1 Login & Access Control
- B-1.1 Logistics sidebar has extended screens
- B-1.2 RMA module is labelled "RMA" for Logistics
- B-1.3 Admin Panel NOT visible for Logistics
- B-1.4 RMA records are read-only for Logistics
- B-1.5 Collapsed sidebar rail supports keyboard access, persistence, and the mobile drawer
- TSK-126 dashboard card filters
- Logistics unassigned card opens the matching Delivery list
- B-2 Dispatch & Assign Driver
- B-2.0a Logistics cannot create Delivery records
- B-2.0 Delivery dates support reverse dragging, keyboard selection and cancellation
- B-2.1 Status & Actions tab is visible
- B-2.3 Driver assignment blocked without remarks
- B-2.5 Status change works with remarks
- B-2.5a TSK-123 Rescheduled requires a new delivery date saved with the status
- B-2.5b TSK-124 Priority is locked on Delivered records, including in bulk edit
- B-2.5c TSK-125 Logistics has no Return to Draft action
- B-2.5d Logistics starts and completes a Delivery through the Next step card and dialogs
- B-2.6 Saving without changes shows feedback
- B-2.7 Active Deliveries sidebar uses the existing discard guard for unsaved driver changes
- B-2.8 Active Accounting Collection sidebar returns to the list and guards unsaved edits
- B-2.9 Active sidebar navigation returns to category lists without changing module behavior
- B-3 Driver Board & Calendar
- B-3.1 Driver Board renders
- B-3.2 Delivery Calendar renders
- B-3.3 Driver Manager renders
- B-4 Documents Tab (POD upload)
- B-4.1 Documents tab visible with upload zone
- B-4.1a Invalid upload shows a toast and no inline duplicate
- B-4.2 Stages a PDF until Save Files is clicked
- B-4.3 Persisted photos open in the shared preview with visible actions
- B-5 Reports
- B-5.1 Statistical Reports renders
- B-5.2 Retired Status History screen redirects to dashboard

## e2e/tests/sales_coordinator.spec.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/e2e/tests/sales_coordinator.spec.ts).

- A-1 Login & Access Control
- A-1.1 Dashboard loads after login
- A-1.2 SC sidebar shows correct permitted screens
- A-1.3 SC sidebar does NOT show restricted screens
- TSK-126 dashboard card filters
- SC On-Hold card opens the matching list, wraps at supported widths, and clears
- A-2 Create a Delivery Record
- A-2.1 Auto Fill keeps Area and Address in one demo-location fixture
- A-2.2 Empty form submission shows validation errors
- A-2.3 Company must be selected from list
- A-2.4 Valid record creates with Scheduled status
- A-2.7 Reject file over 10 MB
- A-2.8 Reject unsupported file type
- A-3 Edit a Record
- A-3.9 SC can stage, save, and preview a photo from Documents
- A-3.6 Active Deliveries sidebar returns to the list and preserves filters
- A-3.7 Global search deep links still open and browser back/forward returns between workspace and list
- A-3.8 Active module navigation works with collapsed and mobile sidebars
- A-3.3 Status & Actions tab NOT visible for SC
- A-3.5 SC can leave a comment
- A-3.10 TSK-125 Return to Draft uses a confirmation dialog with a required reason
- A-3.9 TSK-124 Priority is read-only on a Delivered record
- A-5 Transaction Center
- A-5.1 Transaction Center page renders

## server/tests/activeRecordCounts.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/activeRecordCounts.test.ts).

- grouped counts preserve badge statuses and exclude non-RMA On-Hold

## server/tests/adminAuditDateFilter.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/adminAuditDateFilter.test.ts).

- admin audit date filters cover the full Manila day

## server/tests/attachmentRules.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/attachmentRules.test.ts).

- genuine PDF and Word documents are recognised by their content
- spoofed, truncated and polyglot PDFs fail closed
- only an OLE file holding a Word stream is accepted as .doc
- a ZIP archive is a .docx only when it is a complete, ordinary Word package
- the stored content type comes from the allow-list, never from the client
- the per-record quota is exact at both boundaries
- an upload is written to the private quarantine folder under a server-chosen name
- oversized, wrongly typed and aborted uploads leave nothing in quarantine
- files abandoned by a crash are removed at startup; fresh ones are left alone
- storage copies an upload from disk, streams it back and stays inside its folder
- no more than the fixed number of whole files is ever held in memory

## server/tests/customers.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/customers.test.ts).

- Sales Coordinator saves a customer edit with a trimmed value, actor and reason in the audit log
- TASS and Driver cannot edit customers through the API
- Invalid fields and a missing reason return inline field errors without saving
- A stale edit is rejected with 409 instead of overwriting newer values
- Saving without any field change is rejected
- Customer audit trail lists actor, reason and changed fields; TASS is denied
- Creating a customer writes a CREATE audit entry with the initial values in the same transaction

## server/tests/dashboardLifecycle.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/dashboardLifecycle.test.ts).

- dashboard today uses Manila midnight and excludes drafts from assignment counts
- Sales Coordinator dashboard counts only Delivery records and completes by Time Out
- TASS dashboard count definitions remain category-specific
- admin weekly statistics start at Sunday midnight in Manila

## server/tests/dateSemantics.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/dateSemantics.test.ts).

- Manila date filters include the full final calendar day with a half-open UTC range
- Manila boundaries work for one-sided ranges and Sunday week starts
- today range follows the Manila calendar around UTC midnight
- Manila date ranges reject impossible dates and reversed bounds

## server/tests/deploymentStatus.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/deploymentStatus.test.ts).

- the storage provider must be named exactly; a typo is refused, not treated as local disk
- the database identity is host, port and name only
- a correctly proxied cloud deployment reports identities, no secrets and no warnings
- risky deployments are called out
- only an Admin can read the deployment check
- the Worker refuses to proxy without a configured API target and never forwards spoofed proxy headers

## server/tests/driverCoverage.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/driverCoverage.test.ts).

- the server area list stays identical to the client AREA_HIERARCHY
- legacy keywords map to exact canonical Areas, never by substring
- an explicit Subregion keeps its name and makes its own Areas redundant
- migration is idempotent: canonical coverage is unchanged on a second run
- stored coverage uses canonical spelling without duplicates
- HTTP: POST and PUT /drivers reject coverage outside the area list before any write

## server/tests/driverDemoSeed.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/driverDemoSeed.test.ts).

- successful run, exact login name match when case differs, rerun test, and renamed account
- one fixture when account matches a seeded driver
- never moves a profile link that belongs to another login
- handles identical long name prefixes without ID collisions
- missing prerequisite / incorrect role actor users
- missing driver account and company
- invalid calendar dates
- preserves all fields of edited/completed fixtures and unrelated records
- unchanged inactive directory identities (takes precedence over active)
- rollback when a later record creation fails

## server/tests/driverDirectory.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/driverDirectory.test.ts).

- directory reads stay empty without writes and exclude inactive rows by default
- missing directory entries return not found without updating or auditing
- deactivation retains IDs, audits the change, and is idempotent with or without delivery history
- new assistant assignments require an active matching directory entry; historical assistants can remain
- Driver assignments resolve to a stable active profile id; the name is only copied for display
- renaming a Driver profile keeps ownership and refreshes the record display name; linked or assigned profiles keep their type
- historical imports skip existing inactive identities, deduplicate, and never activate new entries
- invalid types and coverage payloads are rejected; malformed legacy coverage is safe to display
- rejected async routes reach the Express error handler
- simultaneous creates cannot duplicate an identity; inactive entries cannot be recreated
- assignment validation waits for a concurrent deactivation and sees the committed inactive state

## server/tests/driverIdentity.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/driverIdentity.test.ts).

- backfill links exact unique names and leaves duplicate or near-match names for Admin review
- duplicate DRIVER profile names are neither linked nor assigned
- Admin creating a DRIVER login creates and links a new profile, audited
- an existing profile with the same name is never linked silently; it must be chosen explicitly
- linking rejects assistants, profiles owned by another login and non-DRIVER logins
- relinking moves the login to the new profile and unlinking removes ownership, both audited
- HTTP: Logistics cannot link Driver logins through the roster or the users API; no data is touched

## server/tests/driverIdentityReport.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/driverIdentityReport.test.ts).

- legacy Driver identity preview is count-only and covers inactive, ambiguous, and unresolved assigned names

## server/tests/driversRoute.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/driversRoute.test.ts).

- Logistics cannot add a Driver, explicitly or by omitting the type; nothing is written
- Logistics can add an Assistant; Admin can add a Driver; both are audited with the actor
- Logistics cannot change an entry type or rename a Driver; nothing is written
- Logistics keeps coverage and status edits, may resend the unchanged Driver name, and may rename Assistants
- Admin can rename a Driver and change an unassigned entry type
- Sales Coordinator still cannot write the roster

## server/tests/majorDefects.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/majorDefects.test.ts).

- existing Draft submission refuses Logistics without writes and permits Sales/Admin
- record deletion is forbidden for every role without record or audit mutation
- record creation validates dates and priorities before any database write
- unknown company is a clean validation failure and a disappearing company maps P2003 to 400
- editing a record to an unknown company is a 400 without writes, including a P2003 race
- valid creation preserves Scheduled defaults and an optional empty Draft date
- stock adjustments reject unsupported types and non-finite/fractional quantities without writes
- all supported stock types preserve integer changes with an audit in the transaction
- stock audit failure aborts transaction and reaches error handling; insufficient stock is 400
- duplicate user email returns 409 and unexpected failures are forwarded
- valid user email edits normalize email; invalid input is rejected without writing
- customer creation rejects malformed/empty/invalid text without writes
- customer creation accepts trimmed fields/defaults and forwards unexpected errors
- SKU editing shares numeric validation with creation and preserves valid updates

## server/tests/microsoftAccountPicker.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/microsoftAccountPicker.test.ts).

- Microsoft login offers account selection before and after portal-only logout while preserving tenant, scopes and fresh state

## server/tests/permissions.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/permissions.test.ts).

- editor, login and restored sessions share defaults, overrides, catalog and locked modules
- RMA access defaults keep Sales out, TASS as owner, Logistics read-only, and Admin unchanged
- invalid, unknown and duplicate permission inputs fail validation
- permission replacement is atomic, audited, rejects stale editors and can reset to defaults
- record scopes retain role limits and explicit denials even through shared views
- HTTP login includes denials immediately; the same cookie enforces subsequent revocations

## server/tests/podRequirements.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/podRequirements.test.ts).

- image proof checks bytes, rejecting renamed, empty, mismatched and truncated files
- Delivery schedule eligibility uses valid Manila dates and leaves started/non-Delivery runs alone
- server rejects future unstarted Driver writes across execution, POD, record edit and comments
- Logistics can reschedule a Delivery with remarks and audit while preserving its Driver assignment
- overdue Driver Time In and POD upload audit the effective date and days late
- Delivery completion persists completedLate and daysLate from the effective Manila date
- assigned driver can upload a saved photo and list its verified photo flag
- driver cannot upload to another driver record and counterfeit image uploads are rejected before storage
- delivery completion rejects absent, document-only, missing and counterfeit photos without writes
- a persisted photo enables delivery completion after taking the record lock
- remote POD decoding completes before the completion transaction starts
- completion refuses a verified photo removed before the locked membership recheck
- delivery completion and attachment deletion configure a 30s timeout on prisma transaction
- hasStoredDeliveryPhoto queries attachments ordered by createdAt desc to check newest proof first
- Pending requires a started run and non-RMA categories require photo for completion
- delivery creation cannot bypass proof by specifying Delivered or a filename
- last photo deletion on accomplished delivery is blocked under the same record lock
- a replacement photo allows removal while preserving delivery proof
- RMA supporting photos remain optional after completion
- completion enforces receiver and remarks for every role and Time In for internal runs without partial writes
- all allowed completion roles persist Delivered with automatic server Time Out
- Time In stamps once for an assigned actionable run, ignores client clock and rejects repeat
- RMA status graph is independent of Time In and preserves the approved reschedule restrictions
- TASS and Admin complete unassigned RMA from each approved state with an atomic recipient, timestamp and audit
- RMA completion rejects missing recipient/remarks, drafts and rescheduled records without writes
- RMA Pending needs no Time In, legacy rescheduling preserves clocks, and new Time In is rejected
- Logistics, Sales Coordinator and Driver cannot complete RMA via direct API
- Time In rejects drafts, unassigned, held, completed and other-driver runs
- manual In Transit, early completion, early Pending and reopening Delivered are rejected
- assigned Driver cannot mark Pending before Time In and the rejected request makes no writes
- SC/Admin return pre-start run to Draft, retain assignment and audit; started run cannot revert
- draft assignment blocked; ISO corrections are restricted, audited and cannot stamp a new attempt
- rescheduling clears timestamps and preserves them and actor in audit for next attempt
- TSK-123: Logistics/Admin must send a valid new date when rescheduling a Delivery
- TSK-123: delivery_date is rejected on any status change other than a Delivery reschedule
- TSK-123: Driver and non-Delivery reschedules still work without a date; Sales Coordinator cannot reschedule
- record scope hides drafts in driver list/detail and related transactions; table omits manual In Transit
- same-status priority changes remain audited without resetting timestamps
- legacy Scheduled ISO Time In is normalized; invalid legacy clocks cannot complete and can be corrected
- data sampler rejects manually requested In Transit or Delivered before database work
- RMA samples never generate document references and preserve manually supplied values in the serialized field
- RMA sampler rejects unsupported categories and item types before database work
- Admin can fill a draft reference with remarks and submit, preserving assignment
- C-2.12 isolates missing photo with valid recipient, Time In and remarks for every completion role
- C-2.13 status, edit and upload reject another driver with no mutations or storage writes
- completion prerequisites are enforced independently for Driver, Logistics and Admin
- owner positive controls stamp server Time Out and authenticated audit actor for all roles
- reassignment between access check and locked mutation is denied for status and edit
- client Time Out cannot be spoofed through driver PUT or status actions
- a priority-only save on an accomplished record is rejected and preserves its original Time Out
- TSK-124: a changed Priority on a Delivered record is rejected for every role and route without writes
- TSK-124: re-sending the same Priority, or editing other fields, on a Delivered record still works
- TSK-124: Priority on non-Delivered records is still editable
- Logistics and Admin retain audited ISO Time Out corrections
- Logistics RMA write restrictions remain enforced for status, edit and upload
- RMA accepts only the four required fields and can submit without optional details
- all seven RMA categories save with the exact manually supplied reference
- earlier RMA category labels remain readable without rewriting saved data
- TASS creates, edits, submits and changes priority/status for an RMA record
- Sales Coordinator cannot read, create or update RMA records
- Logistics can read an RMA record and preview its saved PDF but cannot edit it
- protected status, edit and upload routes reject unauthenticated requests without mutations
- framed counterfeit PNG and JPEG cannot satisfy actual pixel decoding
- real multipart middleware accepts genuine bytes and rejects counterfeit bytes without storage writes
- upload rejects reassignment under the row lock before any storage or metadata write
- upload compensates object storage on metadata and transaction commit failure
- attachment removal does not require a reason and always writes an audit entry
- locked status, edit and upload checks reject a record newly returned to Draft or a newly denied category
- locked PUT retains draft role restrictions and timestamp chronology after an intervening edit
- Logistics RMA discussion is readable but comment writes are denied without mutation
- RMA comments are limited to TASS and Admin and reject blank discussion
- Logistics assigns and reassigns by profile id; ownership moves with the id, not the name
- a display name equal to the Driver login name grants nothing without the profile id
- Sales Coordinator cannot assign a Driver by profile id on create or edit
- document uploads are verified by content and stored under the server-derived type
- a record at its attachment quota refuses another file before anything is stored
- parallel uploads to one record cannot take it past the quota
- the quarantined upload is removed after success, refusal, storage failure and database failure

## server/tests/recordAuditVisibility.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/recordAuditVisibility.test.ts).

Titles are dynamically defined or use other test helpers; inspect the file.

## server/tests/recordsDateSorting.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/recordsDateSorting.test.ts).

- oldest and furthest sort dates globally, with blank dates in a separate final partition
- nearest sort collects bounded nearest candidates from both sides of today before slicing page two
- rejects an unsupported sort mode and disallows mixing cursor with non-default date sort
- status filters preserve Scheduled legacy RMA while internal Time In still implies In Transit

## server/tests/recordsIntegration.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/recordsIntegration.test.ts).

- Logistics cannot create a Delivery but retains access to existing Delivery operations
- RMA creation requires company, priority, area and account manager before database access
- Sales Coordinator cannot assign drivers when creating a record
- Logistics has view-only access to RMA records on update
- Company history filters by company_id and keeps the role scope
- Company history for TASS stays limited to RMA and Accounting Collection
- Company history for drivers only returns their own non-draft records
- a Driver login without a linked profile sees no records, even with a matching name
- Record list maps the category filter and paginates with a cursor
- Record list rejects invalid filters

## server/tests/reportsLifecycle.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/reportsLifecycle.test.ts).

- statistical summary uses the same draft and started-run states as records
- statistical report applies Manila Delivery Date filters and counts completion by Time Out separately
- snapshot rollups keep Draft distinct and atomically replace today to remove stale counts
- date-filtered summary counts the exact Manila boundary using Prisma String filters
- summary forwards database failures to Express instead of leaving the request pending
- single lower bound without upper returns records from that date onward in the cohort
- single upper bound without lower returns records up to and including that date in the cohort
- unbounded summary (no dates) returns a result without a deliveryDate filter
- inverted date range (from after to) is rejected with 400 before any database query
- Sales Coordinator without a statistical_reports grant is denied with 403
- Sales Coordinator with Admin-granted statistical_reports screen receives a summary
- two sequential requests receive independent results and the first error does not taint a later success
- first request with exact failing date range (2026-07-01 to 2026-12-31) succeeds and repeat succeeds immediately

## server/tests/rmaRules.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/rmaRules.test.ts).

- client and server expose the same seven legacy RMA categories
- Reference and Category stay optional, while supplied values are validated

## server/tests/security.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/security.test.ts).

- forged cross-site writes are refused before any handler runs
- cookie-authenticated writes need the token of that exact session
- reads, sign-in and requests without a session are not blocked by the token check
- trusted origins come from configuration and ignore malformed entries
- repeated failed sign-ins return 429 per account and address; successes are not counted
- mail and upload routes are throttled per signed-in user
- the general API limit returns 429 but never throttles the health check
- a forwarded client address is believed only with the proxy secret
- requests that bypass the Worker are refused when the proxy secret is required
- requiring the proxy secret without one, or with an unrecognised value, stops startup
- responses carry the security headers and a Teams-compatible framing policy
- the Cloudflare Worker serves the same policy and strips spoofed proxy headers
- the Microsoft-identity write and SSO routes are covered without blocking the callback

## server/tests/seedResetSecurity.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/seedResetSecurity.test.ts).

- CLI seeding requires explicit local disposable database approval
- production CLI seed requests are rejected before touching Prisma
- removed public reset endpoints remain 404 regardless of role and environment
- local-demo reset endpoints reject anonymous, wrong-role, and hosted Admin without database writes
- capability reports enabled only for authenticated Admin on a permitted local demo database
- approved local Admin can run both reset APIs through safely mocked operations
- Data Sampler read-only counts remain functional for Admin only

## server/tests/serverPagination.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/serverPagination.test.ts).

- encodeCursor and decodeCursor correctly serialize and deserialize tuple
- decodeCursor handles legacy raw record ID gracefully
- decodeCursor returns null on corrupted or invalid token
- GET /records?paged=true returns structured payload with rows, count, nextCursor, and hasMore
- Tuple cursor constructs exact composite comparison filter (createdAt < cursorDate OR (createdAt = cursorDate AND id < cursorId))
- Cursor navigation succeeds even if the cursor record was concurrently deleted
- Negative validation: rejects limit > 100, limit <= 0, and malformed cursor with 400
- Server-side filters are mapped accurately into Prisma where clauses
- Draft status filter maps to is_draft Yes
- Backward compatibility: unpaginated request returns plain DeliveryRecord array
- GET /records/calendar-summary returns bounded records up to 500 for requested range

## server/tests/skuCreation.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/skuCreation.test.ts).

- SKU creation denies all non-Admin roles before any database writes
- SKU creation rejects invalid fields without database writes
- SKU creation commits product, empty inventory and audit within one transaction
- duplicate SKU produces a prompt conflict response
- audit failure aborts creation transaction and forwards the error

## server/tests/ssoDiagnostics.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/ssoDiagnostics.test.ts).

- SSO diagnostics retain actionable machine codes without provider secrets
- unrecognized and malformed diagnostic fields are omitted
- AADSTS extraction deduplicates and bounds the number of codes
- access logger strips every callback query parameter including case and trailing slash variants
- production access logging removes queries from all endpoints

## server/tests/ssoIdentity.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/ssoIdentity.test.ts).

- only an active, Admin-prelinked Microsoft OID in the required tenant is accepted

## server/tests/ssoRoutes.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/ssoRoutes.test.ts).

- Admin can approve Microsoft sign-in at creation, while ordinary accounts remain unlinked
- user creation requires Admin approval, a valid optional Object ID and a password
- identity/email conflicts preserve 409 responses and an audit failure cannot commit a created user
- Microsoft callback rejects missing and mismatched browser state before contacting Microsoft/DB
- Microsoft account prelink is Admin-only, audited, rejects bad IDs and duplicates

## server/tests/ssoState.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/ssoState.test.ts).

- SSO state is unpredictable and matches only the initiating browser cookie
- SSO requires a specific tenant GUID, configured credentials, and a safe origin
- state registration stores only a digest and consume is atomic, single-use and expiring

## server/tests/stagingAuditFixes.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/stagingAuditFixes.test.ts).

- canReadRecord respects category permissions and Driver profile ownership
- RMA serialization exposes the document reference separately from any legacy SAP value
- serializeRecord strips linked collection details and ID when target is unreadable by the caller
- HTTP GET /api/records/:id redacts linked collection details for unauthorized callers
- PUT /api/records/:id rejects linking to an Accounting Collection outside the caller recordScope
- concurrent stock adjustments are serialized, preventing overselling and inventory desynchronization

## server/tests/stagingSeed.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/stagingSeed.test.ts).

- staging guard allows deployed production mode but requires exact explicit staging confirmation
- reset requires a separate acknowledgement before any database access and preview proposes replacement without writes
- staging reset replaces operational seeds while preserving accounts, permissions, linked profiles and prior audits
- failed staging reset rolls deletions and replacement inserts back together
- target guard failure occurs before any database access; dry-run performs no writes
- missing/inactive/non-Admin actor and wrong connected database cannot seed
- source identities preserve all 32 real rows and duplicate SO numbers without inventing deliveries
- apply is atomic, audited, leaves profiles unlinked, and rerun preserves edits
- identity/content collisions abort rather than overwrite, and audit failure rolls everything back
- Supabase postgres accepts a confirmed direct project and project-bound shared pooler without renaming the database
- Supabase postgres refuses missing/mismatched projects, spoofed hosts, and shared poolers without project identity before any access
- confirmed Supabase postgres still enforces approval, reset acknowledgement, connected database and active Admin

## server/tests/statusHistoryLifecycle.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/statusHistoryLifecycle.test.ts).

- status counts distinguish drafts and both new and legacy started runs, including audit-held Draft
- Draft filter does not include Scheduled records and In Transit includes legacy Time In
- legacy RMA clocks do not inflate current or historical In Transit counts after rescheduling
- operational status counts use the same Delivery Date cohort and identify lifetime history
- creation-date cohort aliases use full Manila days and reject invalid ranges

## server/tests/transactionAccess.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/transactionAccess.test.ts).

- transaction policy explicitly denies unknown roles and driver inventory despite forged module grants
- HTTP transaction reads enforce driver ownership, category, inventory denial and live module revocation

## server/tests/tsk120Regression.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/tsk120Regression.test.ts).

- submitting an unassigned Delivery Draft notifies Logistics once and keeps other categories unchanged
- Logistics cannot create a Delivery; Sales Coordinator owns creation
- Logistics assignment persists and notifies the creator while SC dispatch edits leave the Driver unchanged
- Logistics cannot assign a Draft and Driver B cannot read or mutate Driver A records

## server/tests/upload-errors.test.ts

[Source](https://github.com/OatiesMilk/Supply-Chain/blob/8660bdee15b502867716ca0c60683965c6cd87f6/server/tests/upload-errors.test.ts).

- previewable PDF, JPG, JPEG, PNG and DOCX uploads with matching MIME types are accepted
- unsupported formats and extension/MIME mismatches return actionable 400 responses
- uploads larger than 10 MB return an actionable 413 response through Multer
- an upload exactly 10 MiB is accepted
