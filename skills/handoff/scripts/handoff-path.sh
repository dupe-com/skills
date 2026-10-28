#!/usr/bin/env bash
# The one place that turns a session into a handoff path. Both sides use it -- the
# /handoff skill to decide where to write, pickup.sh to decide what to read -- so the
# writer and the reader cannot drift apart. That is the whole reason it exists as a
# script rather than as a rule stated twice.
#
# Usage:
#   handoff-path.sh                     print the handoff directory for this session
#                                       (creating it)
#   handoff-path.sh --cwd <dir>         use <dir> outright, skipping session lookup
#                                       (unless --transcript is given too, which wins)
#   handoff-path.sh --transcript <path> start from a session transcript (what the
#                                       SessionStart payload calls transcript_path)
#   handoff-path.sh --session <id>      start from a session id, when you have the id
#                                       but not the transcript path
#   handoff-path.sh --rotate            archive any current latest.md, then print the
#                                       full path to write the new one to
#   handoff-path.sh --name <name>       in a shared folder, key on this session name
#                                       instead of looking this session's name up
#
# Directory name is `<readable-slug>.<hash>`:
#
#   - the slug is the path with `/` turned into `-`, so you can still recognise your
#     own worktree in a directory listing;
#   - the hash is 12 hex characters of sha256 over the FULL path, because the slug
#     alone is not collision-free -- `/w/foo-bar` and `/w/foo/bar` both slug to
#     `-w-foo-bar`, and two working directories sharing a handoff is precisely the
#     wrong-context injection this is supposed to prevent.
#
# The slug is truncated from the left when long (keeping the tail, which is the part
# that identifies the worktree) so the directory name stays inside filesystem limits.
# Truncation is safe because uniqueness rests on the hash, never on the slug.
#
# ---------------------------------------------------------------------------
# Why this does not simply use the current directory
# ---------------------------------------------------------------------------
#
# It used to, and that was a silent bug. A working directory is not a session's
# identity -- it is only where the session happened to be standing at the moment you
# asked. Both sides drift, in different ways:
#
#   - the writer drifts because the agent `cd`s around during the session, so by the
#     time you run /handoff, $PWD can be two worktrees away from where you started;
#   - the reader drifts because a session whose launch directory has been deleted (a
#     finished worktree) comes back with $HOME as its cwd.
#
# Seen in practice: a session launched in one worktree wrote its handoff under the
# main worktree's key, and the /clear that followed looked under $HOME's key. Two
# different wrong answers, one lost handoff.
#
# So resolve the session's LAUNCH directory instead, which never moves. Claude Code
# files every transcript under ~/.claude/projects/<slug-of-launch-dir>/<session>.jsonl,
# and that path is fixed when the session is created. That gives us a slug we trust
# but cannot reverse -- it is lossy, `/`, `.` and `_` all become `-`. So we use it as
# a CHECK rather than as an answer: take each candidate real path we have, slugify it
# the same way, and accept the first one that reproduces the project directory's name.
#
# Candidates, in order:
#
#   1. the directory we were handed (--cwd / $PWD / the hook's cwd). Usually right,
#      costs nothing to check, and keeps the common case free of file reads.
#   2. $CLAUDE_PROJECT_DIR, which Claude Code sets for hooks.
#   3. THIS session's own transcript, when we know which file it is. Its first `cwd`
#      is where this very session started, so it is the one file whose answer is
#      about us rather than about a neighbour.
#   4. the launch cwd recorded inside the project's other transcripts, in plain glob
#      order (the loop below says why it does not sort).
#
# Candidates 3 and 4 both need validating, not just reading. A session that itself
# started after a drift records the drifted directory as its own launch cwd -- that is
# exactly how the /clear above went wrong -- so even our own transcript can be wrong,
# and is checked like any other candidate rather than trusted.
#
# If nothing validates -- an unrecognised project layout, a remote `ssh-*` project, a
# machine with no transcripts -- fall through to the directory we were handed. That is
# the old behaviour, so the worst case is what we had before, never worse.
#
# The residual ambiguity is the slug's own: `/a/b-c` and `/a/b/c` slugify alike, and
# Claude Code already merges them into one project, so we could pick the wrong one of
# a colliding pair. That is the same collision class the hash below exists to contain,
# and it needs two live sessions in two look-alike directories to bite.
set -uo pipefail

CONFIG_ROOT="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
CONFIG_ROOT="${CONFIG_ROOT%/}"
HANDOFF_ROOT="${CLAUDE_HANDOFF_DIR:-$CONFIG_ROOT/handoffs}"
PROJECTS_ROOT="${CLAUDE_PROJECTS_DIR:-$CONFIG_ROOT/projects}"
SLUG_MAX=180
# Enough to cover a busy project directory, small enough that a pathological one
# cannot make a SessionStart hook miss its timeout.
TRANSCRIPT_SCAN_MAX="${CLAUDE_HANDOFF_SCAN_MAX:-40}"

cwd="$PWD"
cwd_explicit=0
transcript=""
session_arg=""
name_arg=""
rotate=0
# `shift 2` on a flag whose value is missing shifts nothing and the loop spins for
# ever, so a single typo would hang the shell instead of printing the usage error
# every other bad input gets. Check before shifting.
need_value() {
  [ "$1" -ge 2 ] || { echo "handoff-path.sh: $2 needs a value" >&2; exit 2; }
}
while [ $# -gt 0 ]; do
  case "$1" in
    --cwd) need_value $# "$1"; cwd="$2"; cwd_explicit=1; shift 2 ;;
    --transcript) need_value $# "$1"; transcript="$2"; shift 2 ;;
    --session) need_value $# "$1"; session_arg="$2"; shift 2 ;;
    --rotate) rotate=1; shift ;;
    --name) need_value $# "$1"; name_arg="$2"; shift 2 ;;
    -h|--help) sed -n '7,19p' "$0"; exit 0 ;;
    *) echo "handoff-path.sh: unknown argument '$1'" >&2; exit 2 ;;
  esac
done
[ -n "$cwd" ] || cwd="$PWD"

sha256_of() {
  if command -v shasum >/dev/null 2>&1; then printf '%s' "$1" | shasum -a 256 | cut -d' ' -f1
  elif command -v sha256sum >/dev/null 2>&1; then printf '%s' "$1" | sha256sum | cut -d' ' -f1
  else printf ''
  fi
}

# Claude Code's project-directory slug: `/`, `.` and `_` all collapse to `-`.
project_slug_of() { printf '%s' "$1" | sed 's#[/._]#-#g'; }

# The first `cwd` a transcript records, which is where that session was launched.
# grep -m1 stops at the first matching LINE, so a multi-megabyte transcript costs a
# few kilobytes of reading rather than a full parse -- but -o then prints every match
# on that line, and the line in question is the one carrying whatever was injected at
# session start, which precedes the record's own `cwd` key. Quoted text cannot match,
# because JSON escapes its quotes (`\"cwd\":\"`), but a NESTED OBJECT's `cwd` is not
# escaped and does match. The top-level key comes first in practice -- checked against
# every transcript on one machine, no mismatches -- so take the first match and no more
# rather than relying on the record shape staying that way.
launch_cwd_of() {
  [ -n "${1:-}" ] && [ -f "$1" ] || return 0
  grep -m1 -o '"cwd":"[^"]*"' "$1" 2>/dev/null | head -1 | sed 's/^"cwd":"//; s/"$//'
}

# Which ~/.claude/projects/<slug> directory does this session belong to?
# The reader is handed transcript_path outright; failing that, a session id names the
# transcript. The writer has neither, but CLAUDE_CODE_SESSION_ID is in its environment.
# Prints the transcript file belonging to a session id, wherever it is filed.
transcript_for_session() {
  [ -n "${1:-}" ] && [ -d "$PROJECTS_ROOT" ] || return 0
  for f in "$PROJECTS_ROOT"/*/"$1".jsonl; do
    [ -f "$f" ] || continue
    printf '%s\n' "$f"
    return 0
  done
}

# A `--cwd` arriving on its own is somebody naming a directory on purpose -- give them
# that directory, not this session's. But only on its own: pickup.sh passes the hook's
# cwd alongside the session, where it is a hint and not an instruction, and treating it
# as an override there would put the reader back on cwd while the writer stayed on the
# session -- the exact split this script exists to prevent. That is why pickup.sh sends
# a session id as well as a transcript path: a build whose SessionStart payload omits
# transcript_path must not silently fall back to the old behaviour on one side only.
project_dir=""
own_transcript=""
if [ -n "$transcript" ]; then
  own_transcript="$transcript"
elif [ -n "$session_arg" ]; then
  own_transcript=$(transcript_for_session "$session_arg")
elif [ "$cwd_explicit" = "1" ]; then
  own_transcript=""
else
  own_transcript=$(transcript_for_session "${CLAUDE_CODE_SESSION_ID:-}")
fi
[ -n "$own_transcript" ] && project_dir=$(dirname "$own_transcript")

launch_dir=""
launch_via=""
if [ -n "$project_dir" ] && [ -d "$project_dir" ]; then
  want=$(basename "$project_dir")

  try_candidate() {
    [ -n "${1:-}" ] || return 1
    [ "$(project_slug_of "$1")" = "$want" ] || return 1
    launch_dir="$1"; launch_via="$2"; return 0
  }

  try_candidate "$cwd" "working directory" ||
    try_candidate "${CLAUDE_PROJECT_DIR:-}" "CLAUDE_PROJECT_DIR" ||
    # This session's own transcript, tried before anyone else's. It is the file whose
    # launch cwd is actually ours, and going straight to it also means a project
    # directory holding more than TRANSCRIPT_SCAN_MAX transcripts cannot push the one
    # answer we care about past the cap and back onto the old cwd behaviour.
    try_candidate "$(launch_cwd_of "$own_transcript")" "own transcript" || {
      n=0
      # Plain glob order, no sorting. Every session filed under this project was
      # launched at a path that slugifies to its name, so all but the drifted ones
      # validate and the first file tried is almost always the answer -- ordering
      # them by date would buy nothing and cost a stat per transcript inside a hook
      # that has to finish in seconds.
      for f in "$project_dir"/*.jsonl; do
        [ -f "$f" ] || continue
        [ "$f" != "$own_transcript" ] || continue   # already tried, above
        n=$((n + 1)); [ "$n" -le "$TRANSCRIPT_SCAN_MAX" ] || break
        try_candidate "$(launch_cwd_of "$f")" "transcript $(basename "$f")" && break
      done
    }
fi

if [ -n "$launch_dir" ] && [ "$launch_dir" != "$cwd" ]; then
  # Worth saying out loud: it means the session had wandered, and this is the line
  # that explains why the handoff is not under the directory you are standing in.
  echo "handoff-path.sh: keying on the session's launch directory $launch_dir (via $launch_via), not $cwd" >&2
  cwd="$launch_dir"
fi

# Resolve symlinks before doing anything else. A layout where `repo/main` is a symlink
# to `repo/branches/main` so the same directory has two spellings depending on how
# you got there -- and keying on the raw string would give one worktree two handoffs,
# which is the same "one directory, two identities" failure as a colliding slug, just
# from the other direction. A path that no longer exists (a deleted worktree) cannot
# be resolved, so fall back to the literal string rather than losing the handoff.
if [ -d "$cwd" ]; then
  resolved=$(cd "$cwd" 2>/dev/null && pwd -P)
  [ -n "$resolved" ] && cwd="$resolved"
fi

# A handoff is collected by the next session that STARTS in this directory. If the
# directory is gone -- a worktree finished and removed while the session was still
# running, which is exactly how a long session ends -- no session will ever start
# there, so nothing will ever collect this. Write it anyway: the document is not
# worthless and the path below stays readable by hand. But do not let it happen
# quietly, because the agent calling this is the only one in a position to tell the
# user, and a handoff nobody knows about is the failure this whole skill exists to
# prevent. Only on --rotate: that is the writer, and the moment the orphan is made.
if [ "$rotate" -eq 1 ] && [ ! -d "$cwd" ]; then
  echo "handoff-path.sh: WARNING -- $cwd no longer exists, so no future session can start there and nothing will pick this handoff up on its own. Write it, then tell the user the path and that they will have to open it by hand." >&2
fi

# ---------------------------------------------------------------------------
# Shared folders: key on the session's name, not the folder
# ---------------------------------------------------------------------------
#
# The main checkout and the worktree root are where unrelated sessions start all day:
# the folder holding .claude/worktrees/ (where `claude -w` puts worktrees) or
# branches/, plus branches/main or branches/master. Keyed by folder, a coordinator's handoff there went
# to whichever session happened to start next -- often a stranger, between the
# coordinator's /handoff and its /clear -- and the coordinator got nothing.
#
# So in those two places a handoff belongs to a session NAME the person gave
# (`claude -n`, /rename), which survives /clear. A name Claude Code derived on its own
# (`myrepo-e9`) is different every session, so it counts as no name. An unnamed
# session there is keyed by its own session id: the reader, a new session, never
# matches it, so unnamed sessions start clean. Real worktrees never reach this block.
is_shared_dir() {
  case "$1" in
    */.claude/worktrees/*) return 1 ;;
    */branches/main|*/branches/main/*|*/branches/master|*/branches/master/*) return 0 ;;
    */branches/*) return 1 ;;
  esac
  [ -d "$1/branches" ] && return 0
  # A folder holding .claude/worktrees/ is the main checkout itself, so a folder inside it
  # (a session started in apps/web of a monorepo) is shared too.
  local d="$1"
  while [ -n "$d" ] && [ "$d" != "/" ]; do
    [ -d "$d/.claude/worktrees" ] && return 0
    d=$(dirname "$d")
  done
  return 1
}

# This session's file in <config>/sessions/, named by the Claude process id. CLAUDE_PID,
# when set, names it outright. Otherwise walk up from here: hooks and Bash commands are
# both a few processes below Claude. The session id is a last resort: a file keeps its
# old id after /clear until the session next changes state.
own_session_file() {
  local sdir="${CLAUDE_HANDOFF_SESSIONS_DIR:-${CLAUDE_CONFIG_DIR:-$HOME/.claude}}"
  [ -n "${CLAUDE_HANDOFF_SESSIONS_DIR:-}" ] || sdir="${sdir%/}/sessions"
  [ -d "$sdir" ] || return 0
  is_own() { [ -f "$sdir/$1.json" ] && grep -q "\"pid\":${1}[,}]" "$sdir/$1.json" 2>/dev/null; }
  local p n=0 info comm
  if [ -n "${CLAUDE_PID:-}" ]; then
    is_own "$CLAUDE_PID" && { printf '%s\n' "$sdir/$CLAUDE_PID.json"; return 0; }
  else
    p=$$
    # Each ps costs a fresh process; Claude sits within a few levels of a hook. A session
    # file outlives its process, and a shell can reuse its pid, so a match only counts
    # when that process is Claude itself (node or bun when run from source).
    while [ -n "$p" ] && [ "$p" -gt 1 ] 2>/dev/null && [ "$n" -lt 6 ]; do
      info=$(ps -o ppid=,comm= -p "$p" 2>/dev/null)
      comm=$(printf '%s' "$info" | sed -E 's/^ *[0-9]+ +//; s#.*/##')
      if is_own "$p" && printf '%s' "$comm" | grep -Eiq "${CLAUDE_HANDOFF_CLAUDE_COMM:-^(.*claude.*|node|bun)$}"; then
        printf '%s\n' "$sdir/$p.json"
        return 0
      fi
      n=$((n + 1))
      p=$(printf '%s' "$info" | awk '{print $1}')
    done
  fi
  local sid="${session_arg:-${CLAUDE_CODE_SESSION_ID:-}}"
  [ -n "$sid" ] && grep -l "\"sessionId\":\"$sid\"" "$sdir"/*.json 2>/dev/null | head -1
  return 0
}

# The name the person gave this session, or nothing.
user_name_of() {
  [ -n "${1:-}" ] && [ -f "$1" ] || return 0
  if command -v jq >/dev/null 2>&1; then
    jq -r 'select(.nameSource == "user") | .name // empty' "$1" 2>/dev/null
  elif grep -q '"nameSource":"user"' "$1" 2>/dev/null; then
    # Take the whole escaped string, so a quote inside can't cut it short, then decode
    # \" and \\ so the key matches what jq and --name give for the same name.
    sed -En 's/.*"name":"(([^"\\]|\\.)*)".*/\1/p' "$1" | head -1 | sed -e 's/\\"/"/g' -e 's/\\\\/\\/g'
  fi
}

key="$cwd"
key_suffix=""
make_dir=1
if is_shared_dir "$cwd"; then
  name="$name_arg"
  [ -n "$name" ] || name=$(user_name_of "$(own_session_file)")
  if [ -n "$name" ]; then
    key="$cwd"$'\n'"name:$name"
    key_suffix="@$(printf '%s' "$name" | tr -c 'A-Za-z0-9._-' '-')"
  else
    sid="${session_arg:-${CLAUDE_CODE_SESSION_ID:-}}"
    [ -n "$sid" ] || sid="pid-${CLAUDE_PID:-$$}"
    key="$cwd"$'\n'"session:$sid"
    key_suffix="@unnamed-$sid"
    # A reader only ever finds nothing here; don't leave an empty folder per session.
    [ "$rotate" -eq 1 ] || make_dir=0
    if [ "$rotate" -eq 1 ]; then
      echo "handoff-path.sh: WARNING -- $cwd is shared by unrelated sessions, so handoffs there belong to a session name, and this session has none (only a name you gave it counts). Nothing will pick this handoff up on its own. Either name the session (/rename <name>) and run /handoff again, or write it here and tell the user the path to open by hand." >&2
    fi
  fi
fi

slug=$(printf '%s' "$cwd" | sed 's#/#-#g')$key_suffix
if [ "${#slug}" -gt "$SLUG_MAX" ]; then
  slug="...${slug: -$SLUG_MAX}"
fi

hash=$(sha256_of "$key")
if [ -n "$hash" ]; then
  dir="$HANDOFF_ROOT/${slug}.${hash:0:12}"
else
  # No sha256 available at all. Fall back to the bare slug rather than failing --
  # a handoff that might collide beats no handoff -- but say so, because the
  # isolation guarantee is weaker on this machine.
  echo "handoff-path.sh: no shasum/sha256sum found; falling back to a slug that is not collision-free" >&2
  dir="$HANDOFF_ROOT/$slug"
fi

[ "$make_dir" -eq 0 ] || mkdir -p "$dir" 2>/dev/null || true

if [ "$rotate" -eq 1 ]; then
  if [ -f "$dir/latest.md" ]; then
    stamp=$(date +%Y-%m-%d-%H%M%S)
    archive="$dir/archive-$stamp.md"
    # Seconds are not a guarantee either: two runs inside the same second would
    # still land on one name. Never overwrite an archive -- walk to a free suffix.
    n=2
    while [ -e "$archive" ]; do
      archive="$dir/archive-$stamp-$n.md"
      n=$((n + 1))
    done
    mv "$dir/latest.md" "$archive"
  fi
  printf '%s/latest.md\n' "$dir"
else
  printf '%s\n' "$dir"
fi
