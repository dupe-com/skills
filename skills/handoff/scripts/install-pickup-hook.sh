#!/usr/bin/env bash
# Wire pickup.sh into Claude Code as a SessionStart hook, so the next session started
# in the same directory loads the handoff on its own. Safe to run again: it does
# nothing once the hook is there.
set -euo pipefail

CFG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CFG="${CFG%/}"
SETTINGS="$CFG/settings.json"
HERE=$(cd "$(dirname "$0")" && pwd)
CMD="bash \"$HERE/pickup.sh\""

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is not installed, so this script can't edit $SETTINGS safely."
  echo "Add this hook to it by hand:"
  echo
  printf '  "hooks": { "SessionStart": [ { "hooks": [ { "type": "command", "command": %s } ] } ] }\n' "$(printf '%s' "$CMD" | sed 's/"/\\"/g; s/^/"/; s/$/"/')"
  exit 0
fi

mkdir -p "$CFG"
[ -s "$SETTINGS" ] || echo '{}' > "$SETTINGS"

if jq -e --arg c "$CMD" '[.hooks.SessionStart[]?.hooks[]?.command] | index($c) != null' "$SETTINGS" >/dev/null; then
  echo "Handoff pickup hook already installed in $SETTINGS"
  exit 0
fi

cp "$SETTINGS" "$SETTINGS.bak"
tmp=$(mktemp)
jq --arg c "$CMD" '.hooks.SessionStart = ((.hooks.SessionStart // []) + [{hooks: [{type: "command", command: $c}]}])' \
  "$SETTINGS" > "$tmp"
mv "$tmp" "$SETTINGS"
echo "Added the handoff pickup hook to $SETTINGS (backup: $SETTINGS.bak)"
echo "Restart Claude Code for it to take effect."
