# handoff

When a Claude Code session gets long, type `/handoff`. Claude writes down where the work
stands, what to do next and what not to do. Then you `/clear` (or open a new session in the
same folder) and the new session reads that note on its own, so it doesn't start cold. You
don't copy or paste anything.

## Use when

- You type `/handoff`, optionally with what the next session will focus on
- You're running low on context and want to keep going in a fresh session
- You're wrapping up for the day and want tomorrow's session to pick up where you left off

## How it works

- `/handoff` asks `scripts/handoff-path.sh` where to write. There is one note per folder, so
  parallel worktrees never get each other's notes. The folder name includes a hash of the
  full path, so two look-alike paths never share a note.
- `scripts/pickup.sh` runs when a session starts. If the note in this folder was written in
  the last hour, it loads it and shows a one-line banner. If it is older, it shows the banner
  and Claude asks whether to load it. After 14 days it only prints the path. Each note is
  served once.
- **Shared folders.** Unrelated sessions start in your main checkout all day. That is the
  folder holding `.claude/worktrees/` (where `claude -w` puts worktrees) or `branches/`, plus
  `branches/main`. There a note belongs to the session's **name** instead of the folder, so
  only a session with the same name picks it up. Name a session with `claude -n "Auth
  Coordinator"` or `/rename`.

## Setup

Install the skill, then wire the pickup hook once:

```bash
npx skills add dupe-com/skills/handoff
bash ~/.claude/skills/handoff/scripts/install-pickup-hook.sh
```

The installer adds a `SessionStart` hook to `~/.claude/settings.json` (respecting
`$CLAUDE_CONFIG_DIR`), keeps a backup, and does nothing if the hook is already there. It needs
`jq`; without it, it prints the snippet to paste by hand. Restart Claude Code afterwards.

Notes live in `~/.claude/handoffs/`. They are never deleted; old ones are archived next to the
current one.

## Tests

```bash
bash skills/handoff/scripts/handoff-path.test.sh
```
