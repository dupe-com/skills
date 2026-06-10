---
name: note
description: Pin a short personal reminder to the agent's status line. Use when the user types "/note", or says "remind me", "note to self", "pin a note", "set a reminder", or "clear my note". The note is synthesized into a terse line and shown on its own status-line row with a bold sticky-note background, scoped to the current session, until cleared.
---

# /note — status-line reminder (per session)

Pin a short reminder for the user to the Claude Code status line. A status-line snippet
reads the note for the **current session** from `$CFG/notes/<session_id>.txt` and renders it
on its own line with a bold black-on-yellow "sticky note" background. The note is scoped to
its session (it does NOT leak into other Claude sessions) and persists until cleared.

Throughout, `CFG` means `${CLAUDE_CONFIG_DIR:-$HOME/.claude}` — the agent's config dir. The
current session id is in the env var `$CLAUDE_CODE_SESSION_ID` (use it verbatim; never hardcode).

## First-time setup (run once per machine)

Before setting the first note, make sure the status line is wired to render it. This is
idempotent — safe to run every time; it no-ops if already installed:

```bash
bash ~/.claude/skills/note/scripts/install-note-statusline.sh
```

(Use wherever this skill is installed.) The installer injects a guarded snippet into
`CFG/statusline-command.sh`. If no status line exists yet it creates one and prints the line
to add to `settings.json` (`"statusLine": { "type": "command", "command": "bash <path>" }`);
relay that to the user. If you see "already installed", stay silent about setup and just set
the note.

## Behavior

Look at the argument the user passed after `/note` (or the equivalent natural-language request).

### 1. Clearing a note
If the argument is empty, or is one of: `clear`, `done`, `remove`, `delete`, `off`, `x`
→ remove this session's note file and confirm:
```bash
rm -f "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/notes/$CLAUDE_CODE_SESSION_ID.txt"
```
Then reply in one line: `Note cleared.`

### 2. Setting / replacing a note
Otherwise, **synthesize** the user's input into a single terse reminder line:
- Strip filler ("remind me to", "note to self", "don't forget") — keep only the actionable gist.
- Imperative, present tense. No trailing punctuation.
- **Keep it short — aim for ≤ 45 characters** so it fits the status line. If the source is long, compress to the essential cue, not a full sentence.
- Single line only — strip any newlines.

Write the synthesized text (no quotes, no markdown, no emoji — the status line adds its own 📌) to this session's file:
```bash
cfg="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"; mkdir -p "$cfg/notes"
printf '%s' 'SYNTHESIZED_NOTE_HERE' > "$cfg/notes/$CLAUDE_CODE_SESSION_ID.txt"
```
Use `printf '%s'` (not `echo`) so no trailing newline is added. Single-quote the note; if it contains a literal single quote, escape it as `'\''`.

Then reply in one line showing exactly what was pinned, e.g.: `Pinned: ship the eval on the Mac Studio`

## Notes
- The note is **per-session** — one active note per Claude session; setting a new one replaces this session's.
- It persists across compactions/restarts of the same session until cleared.
- The status line refreshes on activity, so a freshly pinned note appears on the next render (the next message/tool action), not instantly.
- Old sessions' note files harmlessly remain in `CFG/notes/`; the status line only shows the current session's.
- Do not over-explain; this is a fast utility. One-line confirmation only.
