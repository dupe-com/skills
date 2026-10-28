#!/usr/bin/env bash
# Tests for handoff-path.sh and pickup.sh in shared folders (the worktree root and
# branches/main, or a main checkout holding .claude/worktrees/), where handoffs are
# keyed by session name instead of by folder. Run it from the repo:
#   bash skills/handoff/scripts/handoff-path.test.sh
set -uo pipefail

here=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT

mkdir -p "$T/w/branches/main" "$T/w/branches/master" "$T/w/branches/auth-x" "$T/w/runs/x" "$T/r/.claude/worktrees/auth-y" "$T/handoffs" "$T/projects" "$T/sessions"
ln -s branches/main "$T/w/main"
W=$(cd "$T/w" && pwd -P)
R=$(cd "$T/r" && pwd -P)

export CLAUDE_HANDOFF_DIR="$T/handoffs"
export CLAUDE_PROJECTS_DIR="$T/projects"
export CLAUDE_HANDOFF_SESSIONS_DIR="$T/sessions"
unset CLAUDE_PID CLAUDE_CODE_SESSION_ID CLAUDE_PROJECT_DIR

fails=0
check() {
  if [ "$2" = "ok" ]; then echo "ok   $1"; else echo "FAIL $1${3:+: $3}"; fails=$((fails + 1)); fi
}

# A session file for a fake Claude process. Source "user" is a name the person gave.
session() {
  printf '{"pid":%s,"sessionId":"%s","cwd":"%s","name":"%s","nameSource":"%s","status":"idle"}\n' \
    "$1" "$2" "$3" "$4" "$5" > "$T/sessions/$1.json"
}

write_handoff() {
  local path
  path=$(cd "$1" && "$here/handoff-path.sh" --rotate 2>"$T/stderr")
  printf '# %s\n\n> state\n\nbody %s\n' "$2" "$2" > "$path"
  printf '%s\n' "$path"
}

pickup() {
  printf '{"cwd":"%s","session_id":"%s","source":"clear"}' "$1" "$2" | "$here/pickup.sh"
}

old_key_dir() {
  local h
  h=$(printf '%s' "$1" | shasum -a 256 | cut -c1-12)
  printf '%s/%s.%s\n' "$CLAUDE_HANDOFF_DIR" "$(printf '%s' "$1" | sed 's#/#-#g')" "$h"
}

# 1. A named coordinator in the root gets its own handoff back after /clear.
session 900001 s1 "$W" "Auth Coordinator" user
p=$(CLAUDE_PID=900001 write_handoff "$W" coord-note)
case "$p" in *"@Auth-Coordinator."*/latest.md) check "root, named: keyed by name" ok ;; *) check "root, named: keyed by name" fail "$p" ;; esac
case "$p" in *.[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]/latest.md) check "root, named: keeps the .<hash>/latest.md shape" ok ;; *) check "root, named: keeps the .<hash>/latest.md shape" fail "$p" ;; esac
[ ! -d "$(old_key_dir "$W")" ] && check "root, named: nothing under the folder's key" ok || check "root, named: nothing under the folder's key" fail

# 2. A stranger starting in the root -- unnamed, or under another name -- gets nothing.
session 900002 s2 "$W" "myrepo-e9" derived
out=$(CLAUDE_PID=900002 pickup "$W" s2)
[ -z "$out" ] && check "root, unnamed stranger: starts clean" ok || check "root, unnamed stranger: starts clean" fail "$out"
session 900003 s3 "$W" "Billing Coordinator" user
out=$(CLAUDE_PID=900003 pickup "$W" s3)
[ -z "$out" ] && check "root, other name: starts clean" ok || check "root, other name: starts clean" fail "$out"

# 3. The coordinator itself, after /clear (new session id, same process), picks it up once.
out=$(CLAUDE_PID=900001 pickup "$W" s1-after-clear)
case "$out" in *"body coord-note"*) check "root, same name: picks it up" ok ;; *) check "root, same name: picks it up" fail "$out" ;; esac
out=$(CLAUDE_PID=900001 pickup "$W" s1-second-clear)
[ -z "$out" ] && check "root, same name: served once" ok || check "root, same name: served once" fail "$out"

# 4. A note left under the root's folder key by the old scheme is not served to anyone.
mkdir -p "$(old_key_dir "$W")"
printf '# old\n\nold body\n' > "$(old_key_dir "$W")/latest.md"
out=$(CLAUDE_PID=900002 pickup "$W" s2b)
[ -z "$out" ] && check "root: a folder-keyed note is ignored" ok || check "root: a folder-keyed note is ignored" fail "$out"

# 5. An unnamed session writing in the root is warned, and its note is not served later.
p=$(CLAUDE_PID=900002 CLAUDE_CODE_SESSION_ID=s2 write_handoff "$W" unnamed-note)
grep -q "has none" "$T/stderr" && check "root, unnamed writer: warned" ok || check "root, unnamed writer: warned" fail "$(cat "$T/stderr")"
case "$p" in *"@unnamed-s2."*) check "root, unnamed writer: keyed by session id" ok ;; *) check "root, unnamed writer: keyed by session id" fail "$p" ;; esac
out=$(CLAUDE_PID=900002 pickup "$W" s2-after-clear)
[ -z "$out" ] && check "root, unnamed: next session starts clean" ok || check "root, unnamed: next session starts clean" fail "$out"
before=$(find "$T/handoffs" -type d | wc -l)
CLAUDE_PID=900002 pickup "$W" s2-third >/dev/null
after=$(find "$T/handoffs" -type d | wc -l)
[ "$before" = "$after" ] && check "root, unnamed reader: leaves no empty folder" ok || check "root, unnamed reader: leaves no empty folder" fail

# 6. branches/main, reached through the main symlink, behaves the same.
session 900004 s4 "$W/main" "Main Lane" user
p=$(CLAUDE_PID=900004 write_handoff "$W/main" main-note)
case "$p" in *"-branches-main@Main-Lane."*) check "branches/main, named: keyed by name" ok ;; *) check "branches/main, named: keyed by name" fail "$p" ;; esac
session 900005 s5 "$W/main" "main-7" derived
out=$(CLAUDE_PID=900005 pickup "$W/main" s5)
[ -z "$out" ] && check "branches/main, unnamed: starts clean" ok || check "branches/main, unnamed: starts clean" fail "$out"
out=$(CLAUDE_PID=900004 pickup "$W/branches/main" s4b)
case "$out" in *"body main-note"*) check "branches/main, same name: picks it up" ok ;; *) check "branches/main, same name: picks it up" fail "$out" ;; esac

# 6b. The other spelling of the main worktree is shared too; a folder under the root is not.
session 900008 s8m "$W/branches/master" "master-3" derived
p=$(CLAUDE_PID=900008 CLAUDE_CODE_SESSION_ID=s8m write_handoff "$W/branches/master" master-note)
case "$p" in *"@unnamed-s8m."*) check "branches/master, unnamed: keyed by session id" ok ;; *) check "branches/master, unnamed: keyed by session id" fail "$p" ;; esac
p=$(CLAUDE_PID=900008 write_handoff "$W/runs/x" runs-note)
[ "$p" = "$(old_key_dir "$W/runs/x")/latest.md" ] && check "folder under the root: keyed by folder as before" ok || check "folder under the root: keyed by folder as before" fail "$p"

# 7. A real worktree is unchanged: keyed by folder, name or no name.
session 900006 s6 "$W/branches/auth-x" "Auth Builder" user
p=$(CLAUDE_PID=900006 write_handoff "$W/branches/auth-x" builder-note)
[ "$p" = "$(old_key_dir "$W/branches/auth-x")/latest.md" ] && check "worktree: same path as before" ok || check "worktree: same path as before" fail "$p"
[ ! -s "$T/stderr" ] && check "worktree: no warning" ok || check "worktree: no warning" fail "$(cat "$T/stderr")"
session 900007 s7 "$W/branches/auth-x" "auth-x-2" derived
out=$(CLAUDE_PID=900007 pickup "$W/branches/auth-x" s7)
case "$out" in *"body builder-note"*) check "worktree: any session there picks it up" ok ;; *) check "worktree: any session there picks it up" fail "$out" ;; esac

# 7b. The `claude -w` layout: the main checkout holding .claude/worktrees/ is shared,
#     a worktree under it is not.
session 900009 s9 "$R" "Auth Coordinator" user
p=$(CLAUDE_PID=900009 write_handoff "$R" r-coord-note)
case "$p" in *"@Auth-Coordinator."*) check "main checkout with .claude/worktrees, named: keyed by name" ok ;; *) check "main checkout with .claude/worktrees, named: keyed by name" fail "$p" ;; esac
session 900010 s10 "$R" "r-4" derived
out=$(CLAUDE_PID=900010 pickup "$R" s10)
[ -z "$out" ] && check "main checkout with .claude/worktrees, unnamed stranger: starts clean" ok || check "main checkout with .claude/worktrees, unnamed stranger: starts clean" fail "$out"
session 900011 s11 "$R/.claude/worktrees/auth-y" "auth-y-1" derived
p=$(CLAUDE_PID=900011 write_handoff "$R/.claude/worktrees/auth-y" y-note)
[ "$p" = "$(old_key_dir "$R/.claude/worktrees/auth-y")/latest.md" ] && check "claude -w worktree: keyed by folder" ok || check "claude -w worktree: keyed by folder" fail "$p"

# 8. With no CLAUDE_PID, the session file is found by walking up the process tree, but
#    only on a Claude process: here a stale file whose pid a shell (this script) reuses.
session $$ s8 "$W" "Stale Coordinator" user
p=$(write_handoff "$W" stale-note)
case "$p" in *"@unnamed-"*) check "process-tree walk skips a stale file on a non-Claude pid" ok ;; *) check "process-tree walk skips a stale file on a non-Claude pid" fail "$p" ;; esac
p=$(CLAUDE_HANDOFF_CLAUDE_COMM='^bash$' write_handoff "$W" walk-note)
case "$p" in *"@Stale-Coordinator."*) check "process-tree walk finds the session on its Claude process" ok ;; *) check "process-tree walk finds the session on its Claude process" fail "$p" ;; esac
rm -f "$T/sessions/$$.json"

# 9. --name overrides the lookup.
p=$(cd "$W" && "$here/handoff-path.sh" --name "Auth Coordinator")
case "$p" in *"@Auth-Coordinator."*) check "--name keys on that name" ok ;; *) check "--name keys on that name" fail "$p" ;; esac

echo
if [ "$fails" -eq 0 ]; then echo "all passed"; exit 0; fi
echo "$fails failed"
exit 1
