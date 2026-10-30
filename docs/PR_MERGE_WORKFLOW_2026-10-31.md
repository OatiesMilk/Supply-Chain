# Merge workflow — 2026-10-31

These are instructions for later; no PR has been merged by this task.

| Order | PR / branch | Dependency |
| --- | --- | --- |
| 1 | [#268 — permission verification](https://github.com/OatiesMilk/Supply-Chain/pull/268), `feature/client-GH-250-permission-verification` | Independent of #269; recommended first so later regression checks include its coverage. |
| 2 | [#269 — role handoffs](https://github.com/OatiesMilk/Supply-Chain/pull/269), `fix/api-role-audit-findings` | Merge before the workflow follow-up. Revalidate against dev after #268 lands. |
| 3 | Workflow follow-up, `fix/api-role-workflow-followups` | Built on #269 commit `82974de6f1db9d654241504eb4e560598dfeb5ad`; targets `dev`. |

At publication, #268 and #269 were open and `origin/dev` was
`d5ababa5ece012769b27def211f2424eedbe076f`. Refresh statuses and branch heads before
following this procedure. Do not merge the follow-up while its parent changes are
still pending: its `dev` diff includes #269 until that dependency lands.

1. Review #268, confirm its checks and required approvals, and merge it to `dev`
   using the team's normal strategy. Its author owns any requested changes.
2. Update #269 with current `dev` in its clean checkout. Resolve conflicts with
   the permission tests/layout deliberately, run both TypeScript checks, both
   test suites and production builds, then push and wait for required CI and
   approvals. Merge #269 to `dev`.
3. Rebase the follow-up from a **clean** checkout/worktree on its branch. The
   original `/home/marc/Supply-Chain` has unrelated local edits; do not run a
   destructive reset or blanket stash there. If #269 was squash-merged (or
   otherwise has different commit identities), drop the old parent with:

   ```bash
   git switch fix/api-role-workflow-followups
   git status --short
   git fetch origin
   git branch backup/api-role-workflow-followups-before-rebase
   git rebase --onto origin/dev 82974de6f1db9d654241504eb4e560598dfeb5ad fix/api-role-workflow-followups
   ```

   Continue only if `git status --short` was empty. Choose an unused backup
   branch name if the suggested one already exists. Resolve each conflict,
   stage only the resolved paths, then `git rebase --continue`; use
   `git rebase --abort` if the result needs reassessment. Never replay the full
   parent diff after a squash merge. The `--onto` command also works after a
   merge-commit strategy because it selects only commits after the pinned parent.
4. Inspect the resulting diff against `origin/dev` and rerun:

   ```bash
   git diff --check
   npm run lint --workspace=client
   npm run lint --workspace=server
   npm run test:client
   npm run test:server
   npm run build --workspace=client
   npm run build --workspace=server
   ```

   Confirm only follow-up changes remain. Run relevant browser workflows against
   an authorized environment. Use only a designated disposable PostgreSQL target
   for race/rollback tests; do not reset or migrate a shared business database.
5. Push the rewritten branch with lease protection, then inspect the PR's new
   head/base, checks, approvals and conflict status:

   ```bash
   git push --force-with-lease origin fix/api-role-workflow-followups
   ```

   Investigate a lease rejection; do not replace it with an unconditional force
   push. Update the PR dependency note once #269 is merged and the diff is clean.
6. Merge the follow-up to `dev` only after required checks/review pass. Deploy
   matching frontend/backend builds together because record/account writes now
   require optimistic preconditions. No storage migration is required for this
   follow-up. Preserve #269's billing-recipient setup requirements and validate
   role handoffs, conflict recovery, record links, exports and completion dates in
   the intended environment.

If #269 changes before merging, the pinned parent above still identifies the
starting point of this follow-up. Review any changed parent behavior while
resolving/retesting; do not assume previous test results cover the new combination.
For behavioral changes and verification limits see
[the remediation report](ROLE_WORKFLOW_FIXES_2026-10-31.md).
