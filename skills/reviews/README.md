# reviews

> End-to-end GitHub PR review workflow for AI coding agents

## What It Does

**reviews** handles the full cycle of addressing PR review feedback: fetching every comment and inline thread, triaging what's actionable vs ambiguous, making code changes, posting replies, resolving threads, and leaving a summary comment on the PR.

## Use When

- User types `/reviews` in their agent session
- User says "address review comments", "go through PR feedback", "handle the review on #123"
- Responding to inline comments after a code review

## Features

- **Full comment fetch** — pulls top-level reviews, inline comments, and conversation-tab comments in parallel via GitHub REST + GraphQL
- **Smart triage** — categorizes comments as actionable, question, disagreement, ambiguous, or out-of-scope; skips already-resolved threads
- **Code changes** — applies edits using exact file + line context from the diff hunk
- **Selective replies** — posts replies only where they add value for other reviewers
- **Thread resolution** — resolves threads immediately after addressing them (not in a batch at the end)
- **Human-in-the-loop** — surfaces ambiguous items and disagreements for the user before proceeding
- **Summary comment** — posts a structured summary to the PR listing fixed, won't-fix, and follow-up items
- **Never pushes** — always leaves the final push decision to the human

## Installation

```bash
npx skills add dupe-com/skills/reviews
```

## Usage

```
/reviews              # address reviews on the current branch's PR
/reviews 3239         # address reviews on PR #3239
/reviews feature/foo  # address reviews on the PR for branch feature/foo
```

## Requirements

- `gh` CLI installed and authenticated (`gh auth status`)
- Write access to the repository (for posting replies and resolving threads)

## Hard Rules

The skill will never:
- Push the resulting commit (that's yours to review and push)
- Close, merge, approve, or dismiss-review the PR
- Delete or edit other people's comments
- Resolve threads it didn't address
- Silently accept a suggestion it disagrees with
