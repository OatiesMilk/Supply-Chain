---
name: ship-pr
description: >-
  Automates branching, committing, pushing, opening a Pull Request to dev, and
  arming GitHub auto-merge (gated on required CI checks) after implementing and
  verifying a fix or feature in the Supply Chain repository. Use automatically
  after completing and verifying a code fix or feature, or whenever the user
  asks to ship, PR, or publish changes.
---

# Ship PR (`ship-pr`)

Follow this workflow once a fix or feature is implemented and locally verified.

## Hard Rules

- **Never** commit or push directly to `dev`, `staging`, or `main`.
- **Never** use `gh pr merge --admin` or bypass GitHub branch rulesets.
- **Never** add `Co-Authored-By:` trailers, `Generated with ...` footers, or any
  AI model/tool attribution to commit messages or PR descriptions.
- **Never** run `git add -A` or `git add .` — stage only the files belonging to
  the current task. Never stage `dist/`, `.env*`, or unrelated WIP files.
- **Target `dev` by default.** Promoting `dev` → `staging` or `staging` → `main`
  requires explicit user authorization.

## Steps

1. **Verify locally before branching/committing**
   - Backend changes: `npm run lint --workspace=mg-portal-server` and `npm run test:server`
   - Frontend changes: `npm run lint --workspace=client` and `npm run test:client`
   - Do not open a PR if local TypeScript or unit tests fail.

2. **Create a new branch from `origin/dev`**
   - Fetch if needed (`git fetch origin dev`) and create a branch matching
     `AGENTS.md` naming:
     - `fix/<subsystem>-[TSK-XX-]<short-description>`
     - `feature/<subsystem>-[TSK-XX-]<short-description>`
     - `chore/<short-description>`
     - `docs/<short-description>`
   - If you are already on a dedicated task branch (e.g., an Orca worktree
     created off `origin/dev`), keep using it.

3. **Stage and commit only task files**
   ```bash
   git add <path1> <path2> ...
   git commit -m "<type>(<subsystem>): <concise summary>"
   ```
   - Append `(TSK-XX)` if a ticket ID was provided.
   - Keep the commit message clean — no `Co-Authored-By:` or AI tool footers.

4. **Push and open the PR targeting `dev`**
   ```bash
   git push -u origin <branch>
   gh pr create --base dev --head <branch> \
     --title "<type>(<subsystem>): <concise summary>" \
     --body "## Summary\n- ...\n\n## Verification\n- ..."
   ```
   - Do not include `Generated with ...` or AI attribution in the PR body.

5. **Arm GitHub Auto-Merge (CI-gated)**
   ```bash
   gh pr merge <pr-url> --auto --squash --delete-branch
   ```
   - The `CI Check (dev)` ruleset requires both `Lint, Validate & Build` and
     `Playwright E2E Tests` to pass before GitHub merges the PR.
   - Verify with `gh pr view <pr-url> --json number,url,state,autoMergeRequest,mergeStateStatus`.

6. **Restore workspace cleanliness**
   - If working in the main checkout (not an isolated worktree), switch back to
     `dev` (`git switch dev`) so unrelated unstaged WIP files remain where the
     user left them.
   - Report the branch name, commit SHA, PR URL, auto-merge status, and exact
     local verification results.
