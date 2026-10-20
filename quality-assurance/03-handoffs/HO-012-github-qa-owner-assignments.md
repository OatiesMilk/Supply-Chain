# GitHub QA ownership handoff

| Document control | Value |
|---|---|
| Date | 2026-10-16 |
| Status | Issues created, assigned and cross-linked; developer acceptance pending |

The user authorized assigning the three repository collaborators detailed, non-overlapping follow-up work. GitHub `dev` was verified at `665775f41c981a81a431008fb954fecd09988644`; the local remediation is still uncommitted and must be shared/published by Marc before the team builds on it. No code was committed or pushed during this assignment.

| Issue | Assignee | Scope |
|---|---|---|
| [#181](https://github.com/MarcZxc1/Supply-Chain/issues/181) | OatiesMilk | Review/integrate the existing backend/catalog fixes, address reproduced gaps and supply exact-build acceptance evidence. Owns record/user/customer/SKU APIs and inventory UI. |
| [#182](https://github.com/MarcZxc1/Supply-Chain/issues/182) | roelandremagbitang | Verify Reports fix; obtain an explicit aggregate/detail CSV decision, then implement detail only if approved. Owns report route/UI/export files. |
| [#183](https://github.com/MarcZxc1/Supply-Chain/issues/183) | mndzjls21 | Reproduce the customer stale-edit conflict with two sessions; fix only a reproduced customer UI failure. Backend failures are handed to #181. |

Each issue includes background, the local-versus-published baseline distinction, reproduction steps, expected behavior, acceptance criteria, exclusive file ownership, test expectations and dependencies. The same ownership matrix appears in all three. #181 exclusively owns the shared API helper/payload, SKU test file and requirements policy document. #182 uses dedicated reporting tests; #183 uses customer-specific tests and waits for a stable customer API before final acceptance. Nobody is assigned to rebuild the already-written candidate independently.

Coordination comments were posted to existing [#165](https://github.com/MarcZxc1/Supply-Chain/issues/165) and [#162](https://github.com/MarcZxc1/Supply-Chain/issues/162). #165 retains consolidated role/staging UAT; #163 retains DB/migration/rollback work; #162 remains the release gate. Existing #177 mail and #180 SSO issues are excluded from these new tasks. Assignment does not authorize deployment, staging writes or data resets.

The local automated checks passed (239 server tests, 27 reported client test files, both TypeScript checks). Remaining live acceptance is not a newly reproduced failure. DEF-019 still needs a report-shape decision; DEF-021 still needs browser reproduction. Sales default access (DEF-003) is accepted under the user's clarified policy.
