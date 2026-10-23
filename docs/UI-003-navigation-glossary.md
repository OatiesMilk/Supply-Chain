# UI-003 navigation and plain-language glossary

Tracks [GitHub #211](https://github.com/MarcZxc1/Supply-Chain/issues/211).
The user approved the following labels in chat on 2026-10-22. First-time staff
validation remains pending with UI-006 / #214; approval is not usability evidence.

| Previous wording | User-visible wording | Rationale | Affected surfaces |
| --- | --- | --- | --- |
| Main | All Records | Describes the cross-module record list available to the account | Sidebar, header, list heading |
| New Delivery (multiple categories) / New Record | Create Record | Does not imply all records are deliveries | All Records action/modal, module list action |
| AM Directory | Account Managers | Expands an internal abbreviation | Sidebar, header, denied-state explanation |
| SKU Master | Products / SKU Master | Adds a familiar term while preserving the domain name | Sidebar, header, product workspace return link, search heading |
| Delivery For Approval | Drafts Awaiting Submission | Drafts have not been submitted; this is not a new approval workflow | All Records filter |
| Accomplish (delivery action only) | Mark as Delivered | Makes the action's result explicit | Driver delivery completion action |

`client/src/utils/navigationLabels.ts` owns presentation labels. Internal screen
keys, permission checks, categories, status values, API payloads, export metadata
and KPI definitions are unchanged. Non-delivery completion keeps its existing
domain wording. RMA remains RMA, with “Return Merchandise Authorization” explained
on its list; SKU is explained as “Stock Keeping Unit” on the product list. These
expansions follow `docs/archive/GLOSSARY.md`. TASS workflows remain provisional
under `DONT_BREAK_THIS.md` and have not been redefined.

## Navigation and guidance

The sidebar groups existing permitted destinations into Manage Records, People
and Products, Plan and Review, and Administration. A group is hidden when it has
no accessible destinations. Counts and driver-tab landing selection retain their
existing behavior. Current destinations expose `aria-current="page"`; collapsed
items retain accessible names, visible focus and focus-triggered tooltips. Closed
mobile navigation is inert, so offscreen controls cannot receive keyboard focus.

All Records explains its scope, uses an accessible record reference button, and
offers a clear-filter recovery when filters hide records. Unavailable creation
explains current module access without promising a grant. Loading, failure and
denial guidance names a next step; feedback does not claim an administrator has
been notified. Driver receiver fields have associated labels and completion
requirements are associated with the disabled completion action.

## Help coordination and acceptance

[#197](https://github.com/MarcZxc1/Supply-Chain/issues/197) owns Settings + Help
Center. It is still pending in this checkout: this change does not add a second
help system or a link to an unavailable page. Its future article headings and
search synonyms should use this glossary, retaining old terms as search aliases.
Until that destination exists, denied/error guidance truthfully directs users to
their administrator (or Logistics for Driver assignments).

UI-006 should observe first-time staff locating Create Record, finding an existing
record, identifying an allowed status update and finding available help. Cover
expanded/collapsed desktop navigation, mobile menu closed/open states, keyboard
focus and the permission-denied path. Record untested roles as Not Run. This
implementation does not constitute staff acceptance or WCAG compliance.
