# rebased

> Intelligent git rebase with conflict resolution for AI coding agents

## What It Does

**rebased** fetches `origin/main`, starts the rebase, and works through conflicts one commit at a time — understanding the *intent* of both sides rather than blindly picking one. It handles lock files, generated files, and complex multi-step rebases, then hands the result back to you to test and force-push.

## Use When

- User types `/rebased` in their agent session
- User says "rebase me on main", "rebase and fix conflicts", "get this branch up to date with main"
- Branch has fallen behind main and needs to be brought up to date before merging

## Features

- **Pre-flight checks** — detects dirty working tree, already-in-progress rebases, detached HEAD, and main/master branches before touching anything
- **Intent-preserving resolution** — reads both sides of each conflict and merges them semantically rather than choosing one
- **Lock file handling** — regenerates `bun.lockb`, `package-lock.json`, `yarn.lock` rather than hand-merging them
- **Generated file handling** — detects migrations and snapshots and regenerates from source
- **Step-by-step loop** — processes one commit at a time, type-checking after each resolution
- **Error recovery** — handles rename conflicts, empty commits, and stuck states with clear guidance
- **Never force-pushes automatically** — always confirms with the user before any destructive operation

## Installation

```bash
npx skills add dupe-com/skills/rebased
```

## Usage

```
/rebased    # rebase current branch onto origin/main
```

## Requirements

- `git` with a remote named `origin` pointing to the repo
- The base branch is named `main` (not `master` — ask the user if the default branch differs)

## Hard Rules

The skill will never:
- Run `git rebase --skip` or `--abort` without asking
- Use `--theirs`/`--ours` to wholesale discard one side
- Delete a conflicted file unless there's clear evidence it was intentionally deleted
- Bypass commit hooks with `--no-verify`
- Force-push without explicit user confirmation
