#!/usr/bin/env bash
# Idempotently wire the Claude Code status line to render the /note sticky note.
# Safe to run repeatedly — it no-ops once installed.
#
# What it renders: the note for the CURRENT session, read from
#   $CFG/notes/<session_id>.txt
# on its own line, as a bold black-on-yellow sticky note. (Claude Code's status
# line only honors SGR color / OSC 8 link escapes and trims leading whitespace,
# so right-alignment isn't achievable — the note is left-aligned.)
set -euo pipefail

CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SL="$CFG/statusline-command.sh"
START="# >>> note-skill (per-session sticky note) >>>"
END="# <<< note-skill <<<"

read -r -d '' BLOCK <<'EOF' || true
# >>> note-skill (per-session sticky note) >>>
# Renders this session's pinned note (set via the /note skill) on its own line.
# Assumes the script captured stdin into $input (input=$(cat)).
__cfg="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
__sid=$(printf '%s' "${input:-}" | jq -r '.session_id // empty' 2>/dev/null || true)
if [ -n "${__sid:-}" ] && [ -s "$__cfg/notes/$__sid.txt" ]; then
  __note=$(tr -d '\n' < "$__cfg/notes/$__sid.txt")
  if [ -n "$__note" ]; then
    printf "\n\033[1;30;103m 📌 %s \033[0m" "$__note"
  fi
fi
# <<< note-skill <<<
EOF

mkdir -p "$CFG/notes"

# Already installed?
if [ -f "$SL" ] && grep -qF "$START" "$SL"; then
  echo "note-skill status line already installed at $SL"
  exit 0
fi

# Fresh install: create a complete, self-contained status line.
if [ ! -f "$SL" ]; then
  {
    printf '#!/usr/bin/env bash\n'
    printf '# Claude Code status line\n'
    printf 'input=$(cat)\n\n'
    printf '%s\n' "$BLOCK"
  } > "$SL"
  chmod +x "$SL"
  echo "Created $SL"
  echo
  echo "Add this to your settings.json (\"$CFG/settings.json\") so Claude Code uses it:"
  echo '  "statusLine": { "type": "command", "command": "bash '"$SL"'" }'
  exit 0
fi

# Existing status line that captures stdin into $input — safe to append our block.
if grep -qE 'input=\$\(cat\)|input="\$\(cat\)"' "$SL"; then
  printf '\n%s\n' "$BLOCK" >> "$SL"
  echo "Appended note-skill block to existing $SL"
  exit 0
fi

# Existing custom status line we don't recognize — don't risk mangling it.
echo "A custom status line already exists at $SL and it doesn't use the standard"
echo "'input=\$(cat)' stdin capture, so this installer won't edit it automatically."
echo "Add the following block to it (it needs the raw stdin JSON in a var named \$input):"
echo
printf '%s\n' "$BLOCK"
exit 0
