# Git Command Cheat Sheet

A reference guide for developers on the Microgenesis Supply Chain team. Use this cheat sheet for daily branch management, rebasing, and troubleshooting.

> [!IMPORTANT] Core rules for the team
> - **All features must be tested in `dev`:** Before any branch goes to `main`, it should first be merged into the `dev` branch for testing.
> - **`git pull` is only for updating `main`:** Run `git pull --ff-only` exclusively while on `main` with clean files.
> - **Never run `git pull` on a feature branch:** When syncing your feature branch with `main`, always use `git fetch origin && git rebase origin/main` to keep commit history linear.
> - **If you have uncommitted edits:** Always stash first (`git stash`), fetch and rebase, then restore (`git stash pop`).

---

## Daily development cycle

```text
1. Update main:    git switch main && git pull --ff-only
2. Start task:     git switch -c feat/<subsystem>-SC-XX-<topic>
3. Inspect edits:  git status && git diff
4. Save progress:  git add <file> && git commit -m "<type>(<subsystem>): <message> (SC-XX)"
5. Sync upstream:  git fetch origin && git rebase origin/main
6. Push branch:    git push -u origin <branch-name>
```

---

## 1. Starting a new task

### Create and switch to a new branch
Always branch from the latest `main`:
```bash
git switch main
git pull --ff-only
git switch -c feat/<subsystem>-SC-XX-<description>
```
*Example:*
```bash
git switch -c feat/client-SC-14-delivery-manifest
```

*Shortcut (branch directly off fresh origin/main without switching to local main):*
```bash
git fetch origin
git switch -c feat/<subsystem>-SC-XX-<description> origin/main
```

### Switch between existing branches
```bash
git switch main
git switch feat/client-SC-14-delivery-manifest
```

---

## 2. Inspecting your work

### Check working tree status
Shows modified files, staged files, and untracked files:
```bash
git status
```

### Review unstaged changes
Shows line-by-line diffs before staging:
```bash
git diff
```

### Review staged changes
Shows what will be included in your next commit:
```bash
git diff --staged
```

### View recent commits
Shows a compact, clean commit history:
```bash
git log --oneline -n 5
```

---

## 3. Saving and shelving progress

### Stage files
Stage specific files or directories:
```bash
git add client/src/components/
```
Stage all modified files:
```bash
git add -A
```

### Commit changes
Follow the team convention (`<type>(<scope>): <subject> (SC-XX)`):
```bash
git commit -m "feat(client): add offline support to delivery form (SC-14)"
```

### Stash work in progress
Temporarily shelf uncommitted edits to switch branches or test something:
```bash
# Save active edits to stash
git stash

# Restore stashed edits later
git stash pop

# View current stash list
git stash list
```

---

## 4. Syncing with teammates (rebasing on main)

Whenever a teammate merges a PR to `main`, update your branch to avoid divergence:

```bash
# 1. Download newest commits without touching your files
git fetch origin

# 2. Replay your feature branch commits on top of newest main
git rebase origin/main
```

### If conflicts occur
Git pauses the rebase and marks conflicting files:
1. Open conflicting files and remove conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`).
2. Stage the resolved files:
   ```bash
   git add <resolved-file>
   ```
3. Continue the rebase (do not run `git commit`):
   ```bash
   git rebase --continue
   ```

### Emergency abort (safety net)
If a rebase goes wrong or gets confusing, return to the exact state before rebasing:
```bash
git rebase --abort
```

---

## 5. Pushing to GitHub

### First push of a new branch
Sets up remote tracking (`-u`):
```bash
git push -u origin <your-branch-name>
```

### Pushing after a rebase
Because rebase recalculates commit hashes, regular `git push` will be rejected. Use `--force-with-lease`:
```bash
git push --force-with-lease origin <your-branch-name>
```
> [!CAUTION] Prohibited command
> Never run `git push --force` or `--force-with-lease` on `main`.

---

## 6. Fixing mistakes

### Discard uncommitted changes in a file
Reverts a modified file back to the last commit:
```bash
git restore <file-path>
```

### Unstage a file
Keeps your edits in the file but removes it from the staging area:
```bash
git restore --staged <file-path>
```

### Modify the last commit
Add forgotten files or edit the commit message without creating a new commit:
```bash
git add <forgotten-file>
git commit --amend --no-edit
```

### Undo the last commit but keep edits
Moves your changes back into the staging area:
```bash
git reset --soft HEAD~1
```

### Completely discard the last commit and all changes
Permanently erases the commit and resets files:
```bash
git reset --hard HEAD~1
```

---

## 7. Common troubleshooting scenarios

### Scenario A: Your push is rejected because main moved ahead
```text
! [rejected] main -> main (non-fast-forward)
```
**Fix:** Run fast-forward pull to bring in the remote commits:
```bash
git pull --ff-only
```

### Scenario B: You accidentally committed on main instead of a feature branch
```bash
# 1. Create a new branch with your commit intact
git branch feat/<subsystem>-SC-XX-<topic>

# 2. Reset local main back to origin/main
git reset --hard origin/main

# 3. Switch to your new branch and continue working
git switch feat/<subsystem>-SC-XX-<topic>
```

### Scenario C: You have uncommitted edits and need to sync with main
```bash
# 1. Shelve your uncommitted work
git stash

# 2. Download newest commits
git fetch origin

# 3. Replay your branch commits on top of main
git rebase origin/main

# 4. Restore your uncommitted edits
git stash pop
```

### Scenario D: You want to checkout and test a teammate's branch
```bash
# 1. Download all remote branch references
git fetch origin

# 2. Switch directly to their branch (Git sets up tracking automatically)
git switch <teammate-branch-name>
```

### Scenario E: Cleaning up branches after your PR is merged
```bash
# 1. Switch back to main and get the merged code
git switch main
git pull --ff-only

# 2. Delete your local feature branch
git branch -d feat/<subsystem>-SC-XX-<topic>

# 3. Clean up deleted remote tracking branches
git fetch --prune
```
