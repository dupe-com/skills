# Dupe Skills

A collection of skills for AI coding agents. Skills are packaged instructions and references that extend agent capabilities.

Skills follow the [Agent Skills](https://agentskills.io/) specification.

## Available Skills

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

## Installation

Install any skill with a single command via [skills.sh](https://skills.sh):

```bash
npx skills add dupe-com/skills/reviews
npx skills add dupe-com/skills/rebased
npx skills add dupe-com/skills/note
```

This works with Claude Code, OpenCode, Cursor, Windsurf, Cline, Codex, AMP, Copilot, and any agent that supports the [agentskills.io](https://agentskills.io) standard.

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
├── LICENSE            # Skill-specific license
├── references/        # Additional documentation
└── scripts/           # Executable utilities
```

---

## Creating New Skills

Use the template in [`template/SKILL.md`](./template/SKILL.md) as a starting point.

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
4. **Test your skill** - Run `node scripts/validate-skill.cjs` if available

---

## Contributing

1. Fork this repository
2. Create a new skill in `skills/your-skill-name/`
3. Follow the structure and guidelines above
4. Submit a pull request

---

## License

Individual skills may have their own licenses. See each skill's LICENSE file.

Repository structure and shared tooling: MIT

---

## About

Built by [Dupe.com](https://dupe.com) - AI-powered shopping research.
