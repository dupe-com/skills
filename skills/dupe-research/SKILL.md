---
name: dupe-research
description: Start AI-powered product research tasks on dupe.com. Kick off deep product research with archetype-based personas, track progress, and get comprehensive reports with product recommendations, pricing, and editorial articles.
compatibility: Requires curl, shasum (or openssl), and internet access. Agent must solve a BOTCHA speed challenge to authenticate — no SDKs or packages needed.
metadata:
  author: dupe.com
  version: '1.0'
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

## Prerequisites

This endpoint is protected by [BOTCHA](https://botcha.ai) — a reverse CAPTCHA that proves the caller is an AI agent. You only need `curl` and a way to compute SHA-256 hashes (e.g. `shasum`, `openssl`).

### Authenticating with BOTCHA

**1. Request a challenge:**

```bash
CHALLENGE=$(curl -s "https://botcha.ai/v1/token?app_id=dupe-research")
```

The response contains a challenge `id` and an array of `numbers` (5 integers).

**2. Solve:** compute the SHA-256 of each number and take the **first 8 hex characters**:

```bash
# For each number in the challenge:
printf '%s' "12345" | shasum -a 256 | cut -c1-8
```

**3. Submit answers** (must complete within 500ms of receiving the challenge):

```bash
TOKEN=$(curl -s -X POST "https://botcha.ai/v1/token/verify" \
  -H "Content-Type: application/json" \
  -d '{"id":"<challenge_id>","answers":["<hash1>","<hash2>","<hash3>","<hash4>","<hash5>"]}' \
  | jq -r '.access_token')
```

Include the token as a Bearer header in all API requests:

```
Authorization: Bearer $TOKEN
```

Tokens expire in **1 hour**. If you get a `401`, re-solve a challenge to get a fresh token.

## Instructions

### Step 1: Choose an Archetype

Before starting a research task, ask the user which research style they prefer. Present these options:

| Option | Label | Pass this as `archetype` |
|--------|-------|--------------------------|
| 1 | **Best Value (Deal Hunter)** | `Shoppers who prioritize getting the best price-to-quality ratio. They compare prices across retailers, look for sales and discounts, and want products that deliver good performance without overpaying. Budget-conscious but quality-aware. Typical budget: $50-$150.` |
| 2 | **Highest Quality Only** | `Shoppers who only want the absolute best version of a product. They prioritize premium materials, superior construction, and long-term durability. Price is secondary to quality. They read expert reviews and trust established premium brands. Typical budget: $200+.` |
| 3 | **Just Tell Me Which One** | `Busy shoppers who want a clear, confident recommendation without spending hours researching. They trust expert guidance and want a single "best" option that works for most people. They value convenience and quick decision-making over deep analysis.` |
| 4 | **Social Proof Focused** | `Shoppers who heavily rely on customer reviews, ratings, and real user experiences. They read both positive and negative reviews, look for patterns in feedback, and trust the wisdom of the crowd over marketing claims. They want products with 4+ star ratings and hundreds of reviews.` |
| 5 | **Deep Research & Comparison** | `Detail-oriented shoppers who want comprehensive breakdowns of specs, features, pros/cons, and side-by-side comparisons. They enjoy the research process and want all the data before deciding. They compare multiple options across different criteria.` |

If the user doesn't specify a preference, default to option 5 (Deep Research & Comparison).

### Step 2: Start the Research Task

```bash
curl -X POST https://api.dupe.com/api/research/agent-skill/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <BOTCHA_TOKEN>" \
  -d '{
    "title": "<user search query>",
    "archetype": "<full archetype description from table above>",
    "count": 10
  }'
```

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | The user's search query (min 5 characters). Example: "best noise cancelling headphones" |
| `archetype` | string | Yes | Full archetype description from the table above (min 10 characters). Do NOT pass the label — pass the full description text. |
| `count` | number | No | Number of products to research (2-20, default: 10) |

**Response (202 Accepted):**

```json
{
  "taskId": "best-noise-cancelling-headphones-feb2026",
  "status": "queued",
  "message": "Research job queued successfully",
  "pollUrl": "/api/research/agent-skill/best-noise-cancelling-headphones-feb2026/status",
  "reportUrl": "https://dupe.com/research/best-noise-cancelling-headphones-feb2026"
}
```

If a task with the same title already exists for this month, the API returns the existing task (200) so you can resume polling.

### Step 3: Poll for Status

Poll the status endpoint every **5-10 seconds** until the task reaches a terminal state.

```bash
curl https://api.dupe.com/api/research/agent-skill/<taskId>/status \
  -H "Authorization: Bearer <BOTCHA_TOKEN>"
```

**Response:**

```json
{
  "taskId": "best-noise-cancelling-headphones-feb2026",
  "title": "Best Noise Cancelling Headphones",
  "status": "gather",
  "currentPhase": "gather",
  "progress": 45,
  "message": "Gathering product details...",
  "productsTotal": 10,
  "productsComplete": 4,
  "productsFailed": 0,
  "candidates": [
    {
      "slug": "sony-wh-1000xm5",
      "name": "Sony WH-1000XM5",
      "brand": "Sony",
      "image": "https://...",
      "priceLow": 278,
      "priceHigh": 399,
      "msrp": 399,
      "currency": "USD"
    }
  ],
  "reportUrl": null,
  "articleReady": false,
  "brief": "## Research Brief\n...",
  "article": null,
  "createdAt": "2026-02-15T10:00:00Z",
  "updatedAt": "2026-02-15T10:02:30Z",
  "completedAt": null
}
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

### Step 4: Present Results

When the task reaches a terminal status (`researched`, `published`, or `complete`), present the results:

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
| 401 | BOTCHA token missing/invalid/expired | Re-solve a BOTCHA challenge |
| 400 | Invalid request body | Check title (min 5 chars) and archetype (min 10 chars) |
| 404 | Task not found | Verify the taskId is correct |
| 500 | Server error | Retry after a few seconds |

## Example: Full Workflow

```bash
# 1. Get BOTCHA token
CHALLENGE=$(curl -s "https://botcha.ai/v1/token?app_id=dupe-research")
CHALLENGE_ID=$(echo $CHALLENGE | jq -r '.id')
# Solve: SHA-256 each number, first 8 hex chars
# Example: printf '%s' "12345" | shasum -a 256 | cut -c1-8
TOKEN=$(curl -s -X POST "https://botcha.ai/v1/token/verify" \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"$CHALLENGE_ID\",\"answers\":[\"hash1\",\"hash2\",\"hash3\",\"hash4\",\"hash5\"]}" \
  | jq -r '.access_token')

# 2. Start research
RESULT=$(curl -s -X POST https://api.dupe.com/api/research/agent-skill/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "best robot vacuum for pet hair",
    "archetype": "Shoppers who heavily rely on customer reviews, ratings, and real user experiences. They read both positive and negative reviews, look for patterns in feedback, and trust the wisdom of the crowd over marketing claims. They want products with 4+ star ratings and hundreds of reviews.",
    "count": 10
  }')

TASK_ID=$(echo $RESULT | jq -r '.taskId')

# 3. Poll until complete
while true; do
  STATUS=$(curl -s "https://api.dupe.com/api/research/agent-skill/$TASK_ID/status" \
    -H "Authorization: Bearer $TOKEN")

  PROGRESS=$(echo $STATUS | jq -r '.progress')
  TASK_STATUS=$(echo $STATUS | jq -r '.status')

  echo "Progress: $PROGRESS% — Status: $TASK_STATUS"

  if [[ "$TASK_STATUS" == "researched" || "$TASK_STATUS" == "published" || "$TASK_STATUS" == "complete" || "$TASK_STATUS" == "failed" ]]; then
    break
  fi

  sleep 10
done

# 4. Show results
echo $STATUS | jq '.candidates'
echo "Report: $(echo $STATUS | jq -r '.reportUrl')"
```

## Links

- **dupe.com**: [https://dupe.com](https://dupe.com)
- **BOTCHA (agent auth)**: [https://botcha.ai](https://botcha.ai)
- **dupe.com skills repo**: [github.com/dupe-com/skills](https://github.com/dupe-com/skills)
