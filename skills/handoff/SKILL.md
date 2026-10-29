---
name: handoff
description: Write a handoff document so the next session in this worktree picks the work up automatically. Use when the user types "/handoff", says they are running out of context or want to continue in a fresh session, asks to wrap up or hand off, or when context has crossed into the degraded tier with the work unfinished.
argument-hint: "What will the next session be used for?"
---

# /handoff — compact a session into a pickup doc

Write a handoff document summarising the current conversation so a fresh agent can continue
the work.

## Where it goes

**Ask, don't derive.** From anywhere, run:

```bash
~/.claude/skills/handoff/scripts/handoff-path.sh --rotate
```

(Use wherever this skill is installed.)

It prints the full path to write to, creates the directory, and moves any existing handoff
aside to a timestamped `archive-*.md` first, so nothing is ever overwritten. Write your
document to exactly the path it printed.

It keys on the directory **this session was launched in**, not on the one you happen to be
standing in, so it does not matter how far the session has `cd`'d since. If those two differ
it says so on stderr; that line is information, not an error. It needs no argument — leave
`--cwd` alone unless you are deliberately writing a handoff for some other directory.

Do not work the path out yourself. `pickup.sh` calls the same script to decide what to read,
and that shared answer is the only thing keeping the writer and the reader in agreement — a
path you derived by hand can disagree with it and the handoff silently never gets picked up.
It is also not a plain slug: the directory name carries a hash of the full working directory,
because turning `/` into `-` is not collision-free and two directories sharing a handoff is
exactly the wrong-context injection this is meant to prevent.

One handoff per launch directory, so parallel worktrees never hand each other the wrong
context.

**Except in shared folders.** The main checkout (the folder holding `.claude/worktrees/`,
where `claude -w` puts worktrees, or `branches/`) and `branches/main` are where unrelated
sessions start all day, so there a handoff belongs to the session's **name**, not the folder:
only a later session with the same name picks it up. Only a name the person gave counts
(`claude -n "Auth Coordinator"` or `/rename`); the name Claude Code
makes up on its own changes every session. If this session has no such name, the script warns
that nothing will pick the document up. Tell the user, and suggest they `/rename` the session
and run `/handoff` again, or give them the path to open by hand.

**If it warns that the launch directory no longer exists, pass that on.** A worktree removed
while the session was still running means no future session can start there, so nothing will
collect the document on its own. It still gets written, and the path still works — but the
user has to be told the path and told to open it themselves, or the handoff is lost as surely
as if it had never been written.

Never write it into the workspace or the repo — it is session scratch, not a project artifact.
Do not use the OS temp directory: it does not survive a reboot, and the pickup hook does not
look there.

## It gets picked up automatically

`scripts/pickup.sh` in this skill directory runs as a `SessionStart` hook and injects `latest.md` into
the next session launched in the same directory, once, marking it consumed by mtime. So the
loop is `/handoff` → `/clear` → keep working. **Do not tell the user to paste a path** — that
is the friction this replaces. Tell them the handoff is written and that the next session will
pick it up on its own.

It reaches two audiences at once. The full document goes to the agent as context; the title and
the one-line summary go on screen as a `systemMessage` banner, so the person can see the new
session is not starting cold. That is why the first two lines of the document are a fixed shape
— see below.

Consequences worth respecting when you write:

- **It is read cold, by an agent with no memory of this session.** Anything left implicit is
  lost.
- **It is injected as context, not as a user instruction.** Write it as orientation for an
  agent, not as a message to a person.
- Rewriting `latest.md` re-arms the pickup. A handoff older than 14 days is not injected; the
  hook prints its path instead.

If the hook is not wired up in `settings.json`, say so once rather than silently falling back
to pasting a path, and offer to run the installer, which adds it (safe to run again):

```bash
bash ~/.claude/skills/handoff/scripts/install-pickup-hook.sh
```

## What to write

### Start with a title and a one-line state summary

The first two things in the document are fixed, because the pickup hook reads them and shows
them on screen to the *person* starting the next session — who otherwise sees what looks like
a blank slate and has no idea a handoff arrived:

```markdown
# <a short title naming the work, not "Handoff">

> <one sentence: where the work stands and what the next session should do first>
```

The blockquote is the only line most people will read. Make it concrete — "PR #123 is open and
awaiting review; nothing else is in flight" beats "continuing the handoff work". Everything
below it is for the agent.

### Then the body

Lead with the state a fresh agent cannot read off the repo. Everything else it can go and look
up for itself.

- **Do not duplicate content already captured elsewhere** — specs, plans, ADRs, issues,
  commits, diffs, PRs, published artifacts. Reference them by path or URL. A handoff that
  restates the PRD is worse than one that links it, because the copy goes stale.
- **Lead with what would mislead the next agent.** Wrong turns taken, numbers that shipped
  incorrect and were corrected, conclusions that look supported but are not. If something was
  got wrong twice, say so and say how it was caught.
- **Name what must not be done**, and why, with the doc or data that rules it out. Sequencing
  constraints ("do not start phase 3"), standing policy, and anything already half-built that
  should be extended rather than rebuilt.
- **Separate blocked from unblocked.** State which blockers are the user's to clear and which
  the next agent can clear itself. An agent that cannot tell will either stall or invent work.
- **List the open decisions** waiting on the user, including ones already asked and not yet
  answered.
- **Include a "suggested skills" section** naming the skills the next agent should invoke, each
  with the specific moment it applies to — not a generic list.
- **Flag disposable state** — scratch data, temp files, anything regenerable — so the next
  agent does not treat it as precious or as evidence.

Keep it scannable. A fresh agent reads this before it has any context to hang prose on.

## Redaction

Redact API keys, tokens, passwords, connection strings and personally identifying information.
Prefer roles to names for third parties. If the work involved people's performance data, say
whether the numbers are safe to repeat.

## Arguments

If the user passed arguments, treat them as a description of what the next session will focus
on, and tailor the document to that — foreground what that task needs and compress the rest.
