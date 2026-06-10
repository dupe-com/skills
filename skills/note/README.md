# note

Pin a short personal reminder to the Claude Code status line. Type `/note <something>` and
the agent synthesizes it into a terse line that shows on its own status-line row with a bold
black-on-yellow "sticky note" background. The note is **scoped to the current session** and
persists until you clear it.

## Use when

- You type `/note <reminder>` (e.g. `/note revert the test-only flag before merging`)
- You say "remind me to…", "note to self…", "pin a note", "set a reminder"
- You want to clear it: `/note clear` (also `done` / `remove` / `delete` / `off` / `x`, or empty)

## What it does

- **Set / replace:** synthesizes your input into ≤ ~45 chars (strips "remind me to" filler,
  imperative, single line) and writes it to `~/.claude/notes/<session_id>.txt`.
- **Clear:** deletes this session's note file.
- The status line renders the current session's note on its own line as ` 📌 <note> ` in
  bold black-on-yellow.

## Setup

The skill wires the status line for you on first use via:

```bash
bash ~/.claude/skills/note/scripts/install-note-statusline.sh
```

This idempotently injects a guarded snippet into `~/.claude/statusline-command.sh` (respecting
`$CLAUDE_CONFIG_DIR`). If you have no status line yet, it creates one and prints the
`settings.json` line to enable it. If you already have a custom status line that doesn't use
the standard `input=$(cat)` stdin capture, the installer won't touch it — it prints the snippet
for you to paste instead.

## Notes

- One active note per session; setting a new one replaces it.
- Notes do not leak across sessions — each session reads only its own file.
- Old sessions' note files harmlessly accumulate in `~/.claude/notes/`; only the current
  session's is ever displayed.
