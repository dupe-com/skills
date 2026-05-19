---
name: rebased
description: Rebase the current branch onto origin/main and intelligently resolve any conflicts that arise. Use when the user invokes /rebased or asks to rebase the current branch on main and resolve conflicts.
allowed-tools: Bash, Read, Edit, Write
---

# Rebased

Rebases the current branch onto `origin/main` and resolves conflicts as they appear, one rebase step at a time.

## When to use

The user typed `/rebased`, or asked something like "rebase me on main", "rebase and fix conflicts", "get this branch up to date with main".

## Pre-flight checks (run in parallel)

Before touching anything, gather state:

```bash
git status --porcelain=v1 -b
git rev-parse --abbrev-ref HEAD
git rev-parse --git-dir   # to detect in-progress rebase via $GIT_DIR/rebase-merge or rebase-apply
```

Decision matrix:

- **Working tree dirty** → stop and ask the user whether to stash, commit, or abort. Do not silently `git stash` — that hides their work.
- **Already on `main`/`master`** → stop and ask. Rebasing main onto itself is almost never what they want.
- **Rebase already in progress** (`.git/rebase-merge` or `.git/rebase-apply` exists) → skip the fetch/rebase-start step and jump straight to the conflict-resolution loop.
- **Detached HEAD** → stop and ask.

## Execution

### 1. Fetch and start the rebase

```bash
git fetch origin main
git rebase origin/main
```

If it returns clean ("Successfully rebased"), report that and stop.

If it stops with conflicts, proceed to the loop.

### 2. Conflict-resolution loop

Repeat until rebase is complete or the user tells you to stop.

**a. Identify what's conflicted:**

```bash
git status --porcelain=v1
git diff --name-only --diff-filter=U
```

**b. Understand the current rebase step.** This is critical — the conflict is between *their* commit (the one being replayed, marked `<<<<<<< HEAD` in working-tree convention during rebase is actually the *upstream* / `main` side; `>>>>>>> commit-sha` is the *branch* side being replayed). Get context:

```bash
git log --oneline -1 REBASE_HEAD       # the commit being applied
git show --stat REBASE_HEAD             # what it tried to change
git log --oneline origin/main -5        # recent main commits for context
```

**c. For each conflicted file:**

1. `Read` the file to see the conflict markers.
2. Decide the right resolution by understanding **both intents**:
   - What was main trying to do? (`git log -1 -p origin/main -- <file>` for the most recent main change to this file)
   - What was the branch commit trying to do? (`git show REBASE_HEAD -- <file>`)
3. Edit the file to merge both intents — do not blindly pick one side. Common patterns:
   - Both sides added imports → keep both, deduped, in sorted order
   - Both sides edited the same function differently → combine the changes if they're orthogonal; ask if they conflict semantically
   - One side renamed/moved code the other side edited → apply the edit at the new location
   - Lock files (`bun.lockb`, `package-lock.json`, `yarn.lock`) → regenerate (`bun install` / `npm install` / `yarn`) rather than hand-merge
   - Generated files (migrations, snapshots) → regenerate from source
4. Remove all `<<<<<<<`, `=======`, `>>>>>>>` markers.
5. `git add <file>`.

**d. Sanity-check the resolution before continuing:**

- For TypeScript/JS, run the project's type checker on affected files if the change touches types or imports.
- For tests, **don't** run the full suite — too slow per step. Save that for after the rebase completes.

**e. Continue the rebase:**

```bash
git -c core.editor=true rebase --continue
```

The `-c core.editor=true` skips the commit-message editor. If a commit becomes empty (all its changes are now upstream), use `git rebase --skip` instead.

**f. If `--continue` produces another conflict**, loop back to step (a). Each rebase step is one commit being replayed, so you may go through this several times.

### 3. Post-rebase

When rebase finishes:

```bash
git status
git log --oneline origin/main..HEAD     # show what was replayed
```

Report back: how many commits replayed, how many files had conflicts, anything you regenerated (lock files, migrations).

**Do not push.** Pushing a rebased branch requires a force-push, which is destructive — confirm with the user first, and use `--force-with-lease` not `--force`.

## Hard rules

- **Never use `git rebase --skip` or `--abort` without asking** — these throw away work.
- **Never use `git checkout --theirs`/`--ours` blindly** — these discard one side wholesale and almost always lose intent.
- **Never resolve a conflict by deleting the file** unless you have positive evidence the file was deleted on purpose on one side (check `git log --diff-filter=D`).
- **Never bypass hooks** with `--no-verify`. If a pre-commit hook blocks `--continue`, fix the underlying issue.
- **Never force-push automatically.** Always confirm.
- If the conflict resolution is non-obvious (e.g. both sides rewrote the same function with different intent), **stop and ask the user** rather than guessing.

## Error recovery

- **"could not apply ..." with no obvious conflict** → check for renames; `git status` will show "both modified" vs "added by us/them". For a rename conflict, find the new path with `git log --follow --name-status` and apply the change there.
- **Lock-file conflict that won't resolve cleanly** → `git checkout --theirs <lockfile> && <install-command> && git add <lockfile>` (using "theirs" = the branch being replayed onto, i.e. main's lockfile as the base).
- **Stuck and want to bail out** → tell the user the state, then ask before running `git rebase --abort`. Their working tree will return to pre-rebase state.

## Reporting

End with a one-line summary: `Rebased <branch> onto origin/main: N commits replayed, M files had conflicts (resolved). Run tests before pushing.`
