---
name: reviews
description: Pull down GitHub PR reviews and inline comments for the current branch (or a given PR number / URL / branch name), address them with code changes, reply where clarification helps other reviewers, resolve handled threads, and post a summary comment. Use when the user invokes /reviews or asks to address PR feedback.
allowed-tools: Bash, Read, Edit, Write
---

# Reviews

Triage and address PR review feedback end-to-end: fetch every comment, fix what's actionable, ask the user about anything ambiguous, reply on threads where it helps other reviewers, resolve handled threads, and post a summary of what was addressed.

## When to use

User typed `/reviews`, or asked something like "address review comments", "go through PR feedback", "handle the review on #3239", "respond to the inline comments".

## Resolve the target PR

Argument forms (`/reviews <arg>` or no arg):

- **No arg** → use current branch's PR. Detect with:
  ```bash
  gh pr view --json number,url,headRefName,baseRefName,state
  ```
  If no PR exists for the current branch, stop and tell the user.
- **Number** (e.g. `3239`) → `gh pr view 3239 --json ...`
- **URL** (e.g. `https://github.com/owner/repo/pull/3239`) → extract the number, same as above
- **Branch name** (e.g. `feature/foo`) → `gh pr view feature/foo --json ...`

Resolve `OWNER/REPO` from `gh repo view --json owner,name`.

Stop and ask if:
- The PR is `MERGED` or `CLOSED` (addressing review on a merged PR is almost always wrong).
- The PR is `DRAFT` and has no reviews yet.
- The current branch is `main`/`master` and no arg was given.

## Pre-flight on the local checkout

Before editing anything:

```bash
git status --porcelain=v1 -b
git rev-parse --abbrev-ref HEAD
```

- **Working tree dirty** → ask whether to stash, commit, or proceed. Don't silently mix unrelated changes into the review-fix commit.
- **Not on the PR's `headRefName`** → ask before checking it out. The user may be intentionally addressing reviews from a different worktree.
- **Mid-rebase / mid-merge** (`.git/rebase-merge`, `.git/MERGE_HEAD` exists) → stop. Finish that first.

## Fetch all feedback

Run these in parallel — they're independent reads:

```bash
# Top-level reviews (the "Approve / Request changes / Comment" submissions, plus their summary body)
gh api "repos/$OWNER/$REPO/pulls/$NUM/reviews?per_page=100"

# Inline review comments (line-by-line — these are the ones with path + line + diff_hunk)
gh api "repos/$OWNER/$REPO/pulls/$NUM/comments?per_page=100"

# Issue/conversation-tab comments (top-level chat on the PR)
gh api "repos/$OWNER/$REPO/issues/$NUM/comments?per_page=100"

# Review threads with resolved state — GraphQL is the only way to get this
gh api graphql -f query='
  query($owner:String!, $repo:String!, $num:Int!) {
    repository(owner:$owner, name:$repo) {
      pullRequest(number:$num) {
        reviewThreads(first:100) {
          nodes {
            id
            isResolved
            isOutdated
            comments(first:50) {
              nodes { id databaseId author { login } body path line originalLine diffHunk url }
            }
          }
        }
      }
    }
  }' -F owner="$OWNER" -F repo="$REPO" -F num=$NUM
```

The GraphQL `reviewThreads.nodes[].id` is the **thread ID** needed for `resolveReviewThread`. The `comments.nodes[].databaseId` matches the REST `id` on inline comments — use this to bridge the two APIs.

If pagination hits the cap (>100 of any kind), page through with `--paginate` or follow `Link` headers.

## Triage

Build a working list. For each comment:

**Skip:**
- Threads where `isResolved == true`.
- Comments authored by the PR author (you / the user) — those are replies, not asks.
- Bot comments unless they are CodeRabbit / Copilot review bots making concrete suggestions (those count).
- Outdated threads (`isOutdated == true`) where the line no longer exists — note for the summary as "no longer applicable" but don't try to fix.
- Pure approvals ("LGTM", `state: APPROVED` with empty body and no inline asks).

**Categorize the rest:**
- **Actionable** — clear code change requested ("rename this", "this should be `Promise.all`", "missing null check"). Make the change.
- **Question** — reviewer is asking for clarification ("why this approach?", "is this safe?"). Reply, don't change code.
- **Suggestion you disagree with** — flag for the user. Don't silently dismiss.
- **Ambiguous** — can't tell what they want. Flag for the user.
- **Out of scope** — valid but belongs in a follow-up. Reply saying so + (with user OK) open a follow-up issue.

## Address actionable comments

For each one:

1. Read the surrounding code (use `path`, `line`, and `diffHunk` from the inline comment payload to locate exactly what they're pointing at).
2. Read the comment carefully — reviewers often link to other code, paste suggested diffs, or reference related comments. Honor suggested diffs (`suggestion` blocks) when they're correct.
3. Make the change with `Edit`.
4. Track in a running list: `{ commentId, threadId, file, line, what_changed }`.

**Don't batch-edit blindly.** Each comment is a separate decision. If two comments contradict, ask the user.

After all changes, run a quick sanity pass:
- Run the project's type checker on touched files (e.g. `tsc --noEmit`, `bun typecheck`, `npx tsc`)
- If the change touches tests or business logic the user explicitly cited, run the relevant test file

Commit the changes locally with a clear message:

```bash
git add <changed files>
git commit -m "$(cat <<'EOF'
review: address feedback from PR #<NUM>

<bullet list of what changed, one line per comment>

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

**Do not push.** The user reviews and pushes.

## Reply to comments

Reply when it adds value for *other reviewers* — not just for the original commenter:

- **Worth replying:** explanation of the fix's approach (esp. if non-obvious), pointer to the commit/line where the fix landed, "good catch — also fixed the same issue in X", a "won't fix because Y" rationale, or answers to direct questions.
- **Skip the reply:** trivial typo fixes, formatting nits, anything where the diff itself is self-explanatory.

Post a reply to a specific inline comment:

```bash
gh api -X POST "repos/$OWNER/$REPO/pulls/$NUM/comments/$COMMENT_ID/replies" \
  -f body="<your reply>"
```

For a thread-level reply via GraphQL:

```bash
gh api graphql -f query='
  mutation($threadId:ID!, $body:String!) {
    addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$threadId, body:$body}) {
      comment { id url }
    }
  }' -F threadId="$THREAD_ID" -f body="$BODY"
```

Keep replies short. One or two sentences. Reference the commit SHA when useful (`fixed in abc1234`).

## Resolve threads

Resolve a thread once it's handled (code changed + optional reply posted), or once the user has explicitly said "won't fix" with a reply explaining why.

```bash
gh api graphql -f query='
  mutation($threadId:ID!) {
    resolveReviewThread(input:{threadId:$threadId}) {
      thread { id isResolved }
    }
  }' -F threadId="$THREAD_ID"
```

**Do not resolve threads:**
- That you didn't address.
- That are still pending user input.
- That belong to a reviewer who explicitly requested the author resolve them — ask first if you see that pattern.

## Ambiguous / human-in-the-loop items

Before posting the summary, surface anything that needs the user:

- Comments you classified as ambiguous → list them with the comment URL + a one-line description, and ask what to do.
- Suggestions you disagreed with → state your reasoning and ask whether to push back, accept, or punt.
- Out-of-scope items → propose the follow-up issue title/body and ask before opening.

Wait for user response. **Do not guess on these.**

## Post the summary comment

After all decisions are made and changes committed, post one summary comment to the PR. Format:

```markdown
## Review feedback addressed

Thanks for the review! Here's what was addressed in <commit-range>:

### Fixed
- **`path/to/file.ts:42`** — <one-line description> ([comment](url))
- **`path/to/other.ts:88`** — <one-line description> ([comment](url))

### Won't fix (with rationale)
- **`path/to/x.ts:10`** — <reason> ([comment](url))

### Follow-up
- Opened #<issue> for <thing> ([comment](url))
```

Post it with:

```bash
gh pr comment $NUM --body "$(cat <<'EOF'
<rendered summary>
EOF
)"
```

Skip the summary if there were ≤2 small items handled — individual replies suffice.

## Hard rules

- **Never push** the resulting commit. The user reviews and pushes.
- **Never close, merge, approve, or dismiss-review** the PR.
- **Never delete or edit other people's comments.**
- **Never resolve a thread you didn't address** or that is awaiting user input.
- **Never post the summary comment before the user has confirmed any ambiguous items.**
- **Never silently disagree** — if a reviewer's suggestion is wrong, post a reply explaining why and let them respond.
- **Don't batch-resolve at the end** — resolve each thread immediately after addressing it.
- **If `gh` returns 403 / 404**, the user likely needs to re-auth (`gh auth refresh -s repo,read:org`) or doesn't have write access. Stop and tell them.

## Reporting

End-of-skill summary:

`Addressed N comments on PR #<num> in <commit-sha>: K fixed, L replied-only, M won't-fix, P escalated to user. Summary posted. Run tests, then push.`
