# Dupe Skills

Skills and plugins for AI coding agents, mostly Claude Code. Skills are packaged instructions
and scripts that extend what an agent can do. They follow the
[Agent Skills](https://agentskills.io/) specification.

## The coordinator workflow

This is how we run several Claude Code sessions in parallel without losing track of them.

- **One coordinator per workstream.** It is a Claude Code session whose only job is the other
  sessions: it hands out tasks, tracks their status, passes messages between them, reviews their
  code, and gives you one short summary. It writes no product code itself.
- **One builder per task.** Each builder is one session, in one git worktree, on one branch, so
  builders never step on each other's files.
- **You talk to the coordinator.** It talks to the builders.

Two pieces in this repo make it work:

- [**coordinator**](./plugins/coordinator) (a Claude Code plugin): a side panel listing every
  builder and who is waiting on whom, a running log of decisions, brief templates, and the same
  things as tools for Claude.
- [**handoff**](./skills/handoff) (a skill): when a session's context gets long, `/handoff`
  writes down where things stand, and the next session in that folder picks it up on its own.

Getting started takes about 5 minutes:

```bash
# install both, once
claude plugin marketplace add dupe-com/skills
claude plugin install coordinator@dupe-skills --scope user
npx skills add dupe-com/skills/handoff
bash ~/.claude/skills/handoff/scripts/install-pickup-hook.sh

# start a workstream: the coordinator and two builders, each in its own worktree
claude -w auth-coord -n "Auth Coordinator" -- "/coord on"
claude -w auth-login -n "auth login"
claude -w auth-reset -n "auth reset"
```

`claude -w <name>` is Claude Code's built-in worktree flag; add `--tmux` to give each session
its own tmux window. Name worktrees `<workstream>-<task>` and the coordinator groups them by
that prefix with no setup. Then tell the coordinator what you want built. The
[plugin README](./plugins/coordinator) covers the details.

## Available Skills

### [handoff](./skills/handoff)

Compact a long session into a handoff note that the next session picks up automatically.

**Use when:**

- You type `/handoff`, or you're running low on context and want a fresh session
- You're stopping for the day and want tomorrow's session to start where you left off

**Features:**

- One note per folder, so parallel worktrees never get each other's context
- A `SessionStart` hook loads a fresh note on its own and asks before loading an old one
- In shared folders like the main checkout, notes belong to the session's name instead
- Ships an installer that wires the hook into `settings.json`

### [reviews](./skills/reviews)

Address GitHub PR review feedback end-to-end from your agent.

**Use when:**

- User types `/reviews` or asks to "address review comments"
- Going through inline PR feedback after a code review
- Responding to a specific PR by number, URL, or branch name

**Features:**

- Fetches all reviews, inline comments, and conversation threads via REST + GraphQL
- Triages actionable vs ambiguous items; skips already-resolved threads
- Applies code changes, posts replies, and resolves threads incrementally
- Surfaces ambiguous items and disagreements for human review before proceeding
- Posts a structured summary comment to the PR
- Never pushes — the human always reviews the commit and pushes

### [rebased](./skills/rebased)

Rebase the current branch onto `origin/main` and resolve conflicts intelligently.

**Use when:**

- User types `/rebased` or asks to "rebase and fix conflicts"
- Branch has fallen behind main and needs to be brought up to date
- A rebase is already in progress and needs help resolving remaining conflicts

**Features:**

- Pre-flight checks for dirty working tree, in-progress rebases, and edge cases
- Merges both sides of each conflict by understanding intent, not blindly picking one
- Regenerates lock files (`bun.lockb`, `package-lock.json`, etc.) rather than hand-merging
- Works commit-by-commit through multi-step rebases
- Never force-pushes without explicit user confirmation

### [note](./skills/note)

Pin a short personal reminder to the Claude Code status line.

**Use when:**

- You type `/note <reminder>` (e.g. `/note revert the test-only flag before merging`)
- You say "remind me to…", "note to self", "pin a note", "set a reminder"
- You want to clear it: `/note clear`

**Features:**

- Synthesizes your input into a terse one-line reminder (strips filler)
- Renders on its own status-line row as a bold black-on-yellow sticky note
- Scoped to the current session — notes don't leak across Claude sessions
- Persists across compactions/restarts until cleared
- Ships an idempotent installer that wires the status line for you

---

## Available Plugins

### [coordinator](./plugins/coordinator)

Run one Claude Code session as the coordinator of several builder sessions.

**Features:**

- Side panel of live builders: busy or idle, worktree, pull request, and who owes whom a reply
- Groups builders by worktree name (`auth-login`, `auth-reset`) with no setup
- An append-only board and a message log, so a fresh coordinator can take over
- `/coord brief` fills in a brief for a builder; `sessions`, `board` and `brief` tools for Claude
- Jumps to a builder's tmux window from the panel

---

## Installation

Install any skill with a single command via [skills.sh](https://skills.sh):

```bash
npx skills add dupe-com/skills/handoff
npx skills add dupe-com/skills/reviews
npx skills add dupe-com/skills/rebased
npx skills add dupe-com/skills/note
```

This works with Claude Code, OpenCode, Cursor, Windsurf, Cline, Codex, AMP, Copilot, and any agent that supports the [agentskills.io](https://agentskills.io) standard.

Install the plugins from this repo's Claude Code marketplace:

```bash
claude plugin marketplace add dupe-com/skills
claude plugin install coordinator@dupe-skills --scope user
```

### Manual Installation

```bash
git clone https://github.com/dupe-com/skills.git
cp -r skills/skills/<skill-name> ~/.claude/skills/
```

---

## Skill Structure

Each skill follows a consistent structure:

```
skills/skill-name/
├── SKILL.md           # Main instructions (required)
├── README.md          # Detailed documentation
├── metadata.json      # Version, author, tags
├── references/        # Additional documentation (optional)
└── scripts/           # Executable utilities (optional)
```

Plugins live in `plugins/<name>/` with a `.claude-plugin/plugin.json`, and are listed in
[`.claude-plugin/marketplace.json`](./.claude-plugin/marketplace.json).

---

## Creating New Skills

Copy an existing skill such as [`skills/note`](./skills/note) as a starting point.

### Required Fields

```yaml
---
name: my-skill-name # lowercase-hyphenated
description: What it does and when to use it
---
```

### Guidelines

1. **Keep SKILL.md under 500 lines** - Move detailed docs to `references/`
2. **Write for agents** - Clear, actionable instructions
3. **Include examples** - Show both ❌ BAD and ✅ GOOD patterns
4. **Test your skill** - Put tests in `scripts/*.test.sh`; CI runs them

---

## Contributing

1. Fork this repository
2. Create a new skill in `skills/your-skill-name/`
3. Follow the structure and guidelines above
4. Submit a pull request

---

## License

Individual skills may have their own licenses; check for a LICENSE file in the skill's folder.

Repository structure and shared tooling: MIT

---

## About

Built by [Dupe.com](https://dupe.com) - AI-powered shopping research.
