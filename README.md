# Dupe Skills

A collection of skills for AI coding agents. Skills are packaged instructions and references that extend agent capabilities.

Skills follow the [Agent Skills](https://agentskills.io/) specification.

## Available Skills

### [dupe](./skills/dupe)

Find similar products using dupe.com's visual search API.

**Use when:**

- User provides a product URL and asks for similar/alternative products
- User shares an image URL and wants to find matching items
- Searching for dupes, alternatives, or look-alikes

**Features:**

- Product URL search via dupe.com API
- Direct image URL search capability
- Returns matches with prices, store info, and direct links
- Provides similarity scores and product rankings
- Generates dupe.com result page links

### [dupe-research](./skills/dupe-research)

Launch AI-powered product research tasks from your agent — the same pipeline that powers dupe.com.

**Use when:**

- Researching the best products in a category ("best wireless earbuds under $100")
- Comparing products with specific priorities (value, quality, reviews, etc.)
- Getting AI-powered product recommendations with detailed reasoning
- Generating a comprehensive research report for a product category

**Features:**

- 5 research archetypes (deal hunter, quality-first, quick pick, social proof, deep research)
- Real-time progress tracking across 9 research phases
- Returns product candidates with pricing, images, and brand info
- Generates full editorial research articles
- Links to published report pages on dupe.com
- Protected by [BOTCHA](https://botcha.ai) — agent solves a speed challenge to authenticate (no API keys or SDKs needed)

### [nomistakes](./skills/nomistakes)

Error prevention and best practices enforcement for AI agent-assisted coding.

**Use when:**

- Writing new code or functions
- Refactoring existing code
- Implementing API integrations
- Handling user input or external data
- Working with async operations
- Reviewing AI-generated code

**Features:**

- 10 core error prevention principles
- Input validation, null safety, async handling
- TypeScript strict mode patterns
- Biome migration guide (ESLint → Biome)
- AI code review checklist
- Model configuration recommendations (Claude 3.5+, GPT-4+, extended thinking)
- 60KB+ of reference documentation

### [ascii-renderer](./skills/ascii-renderer)

Generate ASCII art from images or text using shape vector rendering.

**Use when:**

- Creating ASCII text banners for terminals, READMEs, or CLI tools
- Converting images to ASCII art with high-quality edge detection
- Building terminal splash screens or headers
- Generating retro/terminal aesthetic text

**Features:**

- Text-to-ASCII with customizable fonts (Arial Black, Impact, etc.)
- Image-to-ASCII conversion with sharp edge detection
- Shape vector algorithm for superior quality vs traditional brightness mapping
- Adjustable contrast, size, and invert options
- Built-in demo mode

---

## Installation

Install any skill with a single command via [skills.sh](https://skills.sh):

```bash
npx skills add dupe-com/skills/dupe-research
npx skills add dupe-com/skills/dupe
npx skills add dupe-com/skills/nomistakes
npx skills add dupe-com/skills/ascii-renderer
```

This works with Claude Code, OpenCode, Cursor, Windsurf, Cline, Codex, AMP, Copilot, and any agent that supports the [agentskills.io](https://agentskills.io) standard.

### Manual Installation

```bash
git clone https://github.com/dupe-com/skills.git
cp -r skills/skills/<skill-name> ~/.claude/skills/
```

---

## Skill Structure

Each skill follows a consistent structure:

```
skills/skill-name/
├── SKILL.md           # Main instructions (required)
├── README.md          # Detailed documentation
├── metadata.json      # Version, author, tags
├── LICENSE            # Skill-specific license
├── references/        # Additional documentation
└── scripts/           # Executable utilities
```

---

## Creating New Skills

Use the template in [`template/SKILL.md`](./template/SKILL.md) as a starting point.

### Required Fields

```yaml
---
name: my-skill-name # lowercase-hyphenated
description: What it does and when to use it
---
```

### Guidelines

1. **Keep SKILL.md under 500 lines** - Move detailed docs to `references/`
2. **Write for agents** - Clear, actionable instructions
3. **Include examples** - Show both ❌ BAD and ✅ GOOD patterns
4. **Test your skill** - Run `node scripts/validate-skill.cjs` if available

---

## Contributing

1. Fork this repository
2. Create a new skill in `skills/your-skill-name/`
3. Follow the structure and guidelines above
4. Submit a pull request

---

## License

Individual skills may have their own licenses. See each skill's LICENSE file.

Repository structure and shared tooling: MIT

---

## About

Built by [Dupe.com](https://dupe.com) - AI-powered shopping research.
