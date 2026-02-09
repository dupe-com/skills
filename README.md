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

---

## Installation

### Claude Code

```bash
# Install a specific skill
npx skills add dupe-com/skills/skills/nomistakes

# Or copy directly to your skills directory
git clone https://github.com/dupe-com/skills.git
cp -r skills/skills/nomistakes ~/.claude/skills/
```

### OpenCode

```bash
npx skills add dupe-com/skills/skills/nomistakes
```

### Other Compatible Agents

Any agent supporting the [agentskills.io](https://agentskills.io) standard can use these skills. Check your agent's documentation for skill installation instructions.

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
4. **Test your skill** - Run `node scripts/validate-skill.js` if available

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
