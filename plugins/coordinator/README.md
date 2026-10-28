# coordinator

A Claude Code plugin for running several Claude sessions at once with one of them in charge.

**The idea.** For each piece of work (a "workstream"), you start one **coordinator** session
and a few **builder** sessions. Each builder gets one task, in its own git worktree on its own
branch, so builders never edit the same files. The coordinator writes no product code. Its only
job is the builders: it hands out work, keeps track of who is waiting on whom, passes messages
between them, reviews their code, and gives you one short summary. You talk to the coordinator;
it talks to the builders.

This plugin does the coordinator's bookkeeping. It finds the builder sessions, shows them in a
side panel with who owes whom a reply, keeps a running log (the "board"), and fills in a brief
template. Claude gets the same things as tools, so it doesn't have to dig through session files.

## The pattern

One coordinator looks after 3 to 8 builders. It:

1. **Routes work.** It turns what you ask for into a written brief and sends it to a builder.
2. **Gates.** Builders send a plan of 10 lines or fewer before building. The coordinator
   approves it, usually with a few conditions.
3. **Reviews.** For each pull request, it runs a review subagent on the latest commit with a
   numbered "check these things" list, then sends the verdict back to the builder.
4. **Verifies after merge.** It checks the merge commit and CI on the main branch.
5. **Keeps state on disk.** It logs every decision, commit and owed check on an append-only
   board, so a fresh session can take over after a `/handoff`.

Messages between sessions use Claude Code's own `SendMessage` tool. The plugin only watches them.

**Run the coordinator in its own worktree** (`claude -w auth-coord`), not in your main
checkout. Unrelated sessions start in the main checkout all day, so anything remembered by
folder there would leak into them. The plugin refuses an unnamed `/coord on` in the main
checkout.

## Quick start

Install once:

```bash
claude plugin marketplace add dupe-com/skills
claude plugin install coordinator@dupe-skills --scope user
```

Then start a workstream. Name every worktree `<workstream>-<task>`; that shared prefix is how
the plugin groups them, with no setup:

```bash
# the coordinator, in its own worktree, turned on from its first message
claude -w auth-coord -n "Auth Coordinator" -- "/coord on"

# builders, one per task, each in its own worktree and branch
claude -w auth-login -n "auth login"
claude -w auth-reset -n "auth reset"
```

`claude -w <name>` creates a git worktree at `.claude/worktrees/<name>` with its own branch.
Add `--tmux` to open each one in its own tmux window, which lets the panel jump to it. Then tell
the coordinator what you want built. It will brief the builders.

The [handoff skill](../../skills/handoff) is a good companion: when a coordinator's context gets
long, `/handoff` then `/clear`, and it picks up where it left off, still bound to its workstream.

## What the plugin adds

- **The panel** (`/coord` or `/coord panel`): one entry per live builder. Each shows busy or
  idle, its worktree folder, its pull request, and one of:
  - **you owe a reply** (red): the builder wrote last
  - **waiting on them**: you wrote last
  - **nudge?** (yellow): you wrote last and it has been idle for 15+ minutes

  Builders waiting on you are listed first. The panel refreshes every 20 seconds and pull
  requests every 2 minutes. In tmux, click a name (or Tab to it and press Enter) to jump to
  that session's window.
- **`/coord on [project|all]`** turns it on and opens the panel. It stays on for this folder
  (or this session name) after `/clear` and restarts. `/coord off` turns it off. Until then,
  builders that have the plugin installed get only the one `/coord` command.
- **`/coord status [all]`**: the same as text, plus each session's address, folder and branch.
- **`/coord board-path <file>`** sets the board. `/coord board` shows its last 15 lines and
  `/coord board <text>` adds a timestamped line. Every message to or from a builder also gets a
  line in `messages.md` next to the board.
- **`/coord brief <session> [goal]`** puts a brief in the prompt box, already filled with the
  builder's address, the house rules and your reply-to address. Edit it, then press Enter.
- **Tools for Claude** (only while on): `sessions`, `board` and `brief`.

### Groups and projects

- **Groups need no setup.** Worktrees named `<group>-<anything>` form a group: `auth-login` and
  `auth-coord` are both in group `auth`. Once two or more of a group's sessions are live, each
  builder shows the group on its status line (`🍋 auth · login`) and renames its tmux tab
  (`🍋 login`). The emoji comes from a hash of the name, so every session agrees with nothing
  stored. Plain `/coord on` in `auth-coord` coordinates group `auth`.
  - The catch: unrelated folders that share a prefix group together. `/coord drop` the odd one
    out, or rename the folder.
- **Projects override groups.** `/coord project auth auth-* 🌸 /path/to/board.md` creates one
  (`-` in place of the emoji clears it). `/coord project` lists them and
  `/coord project auth remove` deletes one. `/coord add <session or folder>` adds a builder the
  pattern misses; `/coord drop <…>` removes one it catches.

### Where it looks

- **Worktrees** under `<repo>/.claude/worktrees/` (what `claude -w` creates) or
  `<root>/branches/` (a common bare-repo layout).
- **Sessions** in `~/.claude/sessions/`, or under `$CLAUDE_CONFIG_DIR` if you set it. If you run
  builders on a second Claude account with its own config folder, list it in
  `CLAUDE_COORD_CONFIG_DIRS` (colon-separated), for example
  `CLAUDE_COORD_CONFIG_DIRS=~/.claude-work`, so the coordinator sees them too.

## What it does not do

- **It does not pass on approvals.** A builder should refuse a risky action that the
  coordinator says "the user approved". Type that approval in the builder's own session.
- **It does not run reviews by itself.** The coordinator does that with a review subagent.

## Working on the plugin

```bash
claude plugin validate plugins/coordinator
claude plugin test plugins/coordinator
claude --plugin-dir plugins/coordinator   # try it in one session without installing
```

For a live test, run the sessions on their own tmux server (`tmux -L coordtest`) and set
`CLAUDE_COORD_PROJECTS=<scratch file>`, so test projects never relabel your real builders.
