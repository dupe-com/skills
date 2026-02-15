---
name: dupe-research
description: Start AI-powered product research tasks on dupe.com. Kick off deep product research with archetype-based personas, track progress, and get comprehensive reports with product recommendations, pricing, and editorial articles. Use when the user wants to research, compare, or find the best products in a category.
compatibility:
  - Requires curl, shasum (or openssl), and internet access
  - Agent must solve a BOTCHA speed challenge to authenticate — no SDKs or packages needed
metadata:
  author: dupe.com
  version: 1.1.0
---

# Dupe.com AI Product Research

Launch deep product research tasks from your terminal or AI agent — the same research pipeline that powers the dupe.com web app.

## What This Skill Does

This skill lets AI agents:

1. **Start a research task** — provide a search query and shopper archetype
2. **Track progress** — poll the task status as it moves through research phases
3. **Get results** — receive product candidates, a research article, and a link to the published report

Research tasks run an AI-powered pipeline that discovers products, gathers reviews, analyzes video content, structures data, and writes a comprehensive research article.

## When to Use

Use this skill when the user wants to:

- Research the best products in a category ("best wireless earbuds under $100")
- Compare products with specific priorities (value, quality, reviews, etc.)
- Get AI-powered product recommendations with reasoning
- Generate a detailed research report for a product category

## When NOT to Use

- For finding visual dupes/lookalikes of a specific product URL — use the `dupe` skill instead
- For quick price comparisons without deep research

## IMPORTANT: Run as a Background Task

Research takes 2-5 minutes. **Do NOT poll in the main conversation thread.** Instead:

1. Ask the user to pick an archetype (Step 1 below)
2. **Spawn a background agent / subagent / task** to handle Steps 2-4 (auth, start, poll, return results)
3. Tell the user: "Research is running in the background. I'll share results when it's ready."
4. Continue the conversation — the background task will complete on its own

**For Claude Code:** Use the `Task` tool with `subagent_type: "general"` and pass the full research prompt (query, archetype, instructions from Steps 2-4).

**For OpenCode / Cursor / other agents:** Use whatever background task or subagent mechanism is available. If none exists, warn the user that polling will block the thread for a few minutes.

## Instructions

### Step 1: Choose an Archetype

Before starting a research task, ask the user which research style they prefer. Present these options:

| # | Label | Pass this as `archetype` |
|---|-------|--------------------------|
| 1 | **Best Value (Deal Hunter)** | `Shoppers who prioritize getting the best price-to-quality ratio. They compare prices across retailers, look for sales and discounts, and want products that deliver good performance without overpaying. Budget-conscious but quality-aware. Typical budget: $50-$150.` |
| 2 | **Highest Quality Only** | `Shoppers who only want the absolute best version of a product. They prioritize premium materials, superior construction, and long-term durability. Price is secondary to quality. They read expert reviews and trust established premium brands. Typical budget: $200+.` |
| 3 | **Just Tell Me Which One** | `Busy shoppers who want a clear, confident recommendation without spending hours researching. They trust expert guidance and want a single "best" option that works for most people. They value convenience and quick decision-making over deep analysis.` |
| 4 | **Social Proof Focused** | `Shoppers who heavily rely on customer reviews, ratings, and real user experiences. They read both positive and negative reviews, look for patterns in feedback, and trust the wisdom of the crowd over marketing claims. They want products with 4+ star ratings and hundreds of reviews.` |
| 5 | **Deep Research & Comparison** | `Detail-oriented shoppers who want comprehensive breakdowns of specs, features, pros/cons, and side-by-side comparisons. They enjoy the research process and want all the data before deciding. They compare multiple options across different criteria.` |

If the user doesn't specify a preference, default to option 5 (Deep Research & Comparison).

### Step 2: Authenticate with BOTCHA

The API is protected by [BOTCHA](https://botcha.ai) — a reverse CAPTCHA for AI agents. Run this **single command** to get a token. It fetches the challenge, solves all 5 SHA-256 hashes, and submits the answer — all in one shot:

```bash
TOKEN=$(python3 -c "
import urllib.request, json, hashlib
headers = {'User-Agent': 'dupe-research-skill/1.1', 'Content-Type': 'application/json'}
req = urllib.request.Request('https://botcha.ai/v1/token', headers=headers)
with urllib.request.urlopen(req) as r:
    data = json.loads(r.read())
ch = data['challenge']
answers = [hashlib.sha256(str(p['num']).encode()).hexdigest()[:8] for p in ch['problems']]
payload = json.dumps({'id': ch['id'], 'answers': answers, 'audience': 'https://api.dupe.com'}).encode()
req2 = urllib.request.Request('https://botcha.ai/v1/token/verify', data=payload, headers=headers, method='POST')
with urllib.request.urlopen(req2) as r2:
    result = json.loads(r2.read())
print(result.get('access_token', ''))
")
echo "Token obtained: ${TOKEN:0:20}..."
```

**Critical details:**
- The `audience` field MUST be `"https://api.dupe.com"` — without it the token will be rejected by the API
- The `User-Agent` header is required — BOTCHA returns 403 without it
- The entire solve must complete within 500ms of receiving the challenge — python3 handles this easily in a single script
- Tokens expire in 1 hour. If you get a `401`, re-run this command
- Uses only `python3` (available on macOS and Linux) — no `jq`, `node`, or other dependencies

### Step 3: Start the Research Task

```bash
RESULT=$(curl -s -X POST "https://api.dupe.com/api/research/agent-skill/start" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"title\": \"<USER_SEARCH_QUERY>\",
    \"archetype\": \"<FULL_ARCHETYPE_DESCRIPTION>\",
    \"count\": 10
  }")
TASK_ID=$(echo "$RESULT" | sed -n 's/.*"taskId":"\([^"]*\)".*/\1/p')
REPORT_URL=$(echo "$RESULT" | sed -n 's/.*"reportUrl":"\([^"]*\)".*/\1/p')
echo "Task: $TASK_ID"
echo "Report will be at: $REPORT_URL"
```

**Request body fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | The user's search query (min 5 characters) |
| `archetype` | string | Yes | Full archetype description from table above (NOT the label) |
| `count` | number | No | Number of products to research (2-20, default: 10) |

If a task with the same title already exists for this month, the API returns the existing task (200) so you can resume polling.

### Step 4: Poll Until Complete

Run this polling loop. It checks every 10 seconds and exits when research reaches a terminal state:

```bash
while true; do
  STATUS_JSON=$(curl -s "https://api.dupe.com/api/research/agent-skill/$TASK_ID/status" \
    -H "Authorization: Bearer $TOKEN")
  PROGRESS=$(echo "$STATUS_JSON" | sed -n 's/.*"progress":\([0-9]*\).*/\1/p')
  TASK_STATUS=$(echo "$STATUS_JSON" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')
  PHASE=$(echo "$STATUS_JSON" | sed -n 's/.*"currentPhase":"\([^"]*\)".*/\1/p')
  echo "[$PROGRESS%] $PHASE — $TASK_STATUS"
  case "$TASK_STATUS" in
    researched|published|complete|failed|cancelled) break ;;
  esac
  sleep 10
done
echo "Final status: $TASK_STATUS"
echo "$STATUS_JSON"
```

**Research phases (in order):**

| Phase | Description |
|-------|-------------|
| `initializing` | Setting up the research task |
| `brief` | Writing research brief |
| `discovery` | Discovering products |
| `gather` | Gathering detailed product info |
| `video_insights` | Analyzing video reviews |
| `social_insights` | Analyzing social media |
| `schema` | Structuring product data |
| `writing_article` | Writing the research article |
| `finalize` | Final processing |

**Terminal statuses** — stop polling when you see one of these:

| Status | Meaning |
|--------|---------|
| `researched` | Research is complete, article is ready |
| `published` | Research report website is deployed |
| `complete` | Everything is done |
| `failed` | Research failed (check error message) |
| `cancelled` | Task was cancelled |

### Step 5: Present Results

When the task reaches a terminal status, parse the final `STATUS_JSON` and present:

```
## Research Complete: <title>

Found <productsTotal> products.

### Top Picks

1. **<candidate.name>** (<candidate.brand>)
   - Price: $<candidate.priceLow> - $<candidate.priceHigh>
   - [View product details]

2. ...

### Full Report

Read the complete research article: <reportUrl>

---
Powered by dupe.com AI Research
```

If `article` is present in the response, you can also display or summarize the full article content directly.

If `reportUrl` is available, always include it — it links to a beautifully formatted research report page.

## Error Handling

| Status Code | Meaning | Action |
|-------------|---------|--------|
| 401 | BOTCHA token missing/invalid/expired | Re-run the BOTCHA auth command from Step 2 |
| 400 | Invalid request body | Check title (min 5 chars) and archetype (min 10 chars) |
| 404 | Task not found | Verify the taskId is correct |
| 500 | Server error | Retry after a few seconds |

## Links

- **dupe.com**: [https://dupe.com](https://dupe.com)
- **BOTCHA (agent auth)**: [https://botcha.ai](https://botcha.ai)
- **dupe.com skills repo**: [github.com/dupe-com/skills](https://github.com/dupe-com/skills)
