# nomistakes

> Error prevention and best practices enforcement for AI agent-assisted coding

## What It Does

**nomistakes** is like a coding coach that lives inside AI agents, helping them write bulletproof code by preventing common mistakes before they happen.

## Use When

- Writing new code or functions
- Refactoring existing code
- Implementing API integrations
- Handling user input or external data
- Working with async operations
- Reviewing AI-generated code (Copilot, Cursor, Claude)

## Features

### 10 Core Error Prevention Principles

1. **Input Validation** - Guard all function boundaries
2. **Error Handling** - Fail fast, fail loudly
3. **Null Safety** - Optional chaining, explicit handling
4. **Async Operations** - Timeouts, cancellation, proper error propagation
5. **Type Safety** - Runtime checks + TypeScript
6. **Boundary Checks** - Array bounds, division by zero
7. **Resource Management** - Cleanup, file handles, connections
8. **Immutability** - Prevent accidental mutations
9. **Configuration Validation** - Validate env vars
10. **Defensive Programming** - Assertions, fail-safes

### Latest 2026 Tooling

- **Biome Migration** - Automated migration from ESLint + Prettier (50-100x faster)
- **AI Code Review** - Checklist for catching bugs in AI-generated code
- **TypeScript 5.x** - Latest type safety patterns

## Quick Example

**Without nomistakes:**
```typescript
async function createUser(email, password) {
  const user = await db.insert({ email, password });
  return user;
}
```

**With nomistakes:**
```typescript
async function createUser(
  email: string, 
  password: string
): Promise<Result<User, ValidationError>> {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: new ValidationError('Invalid email format') };
  }
  
  try {
    const user = await db.insert({ 
      email: email.toLowerCase().trim(), 
      password: await hash(password) 
    });
    return { data: user };
  } catch (e) {
    logger.error('User creation failed', { email, error: e });
    throw new ApplicationError('Failed to create user', { cause: e });
  }
}
```

## Documentation

| File | Description |
|------|-------------|
| [SKILL.md](./SKILL.md) | Core principles and checklists |
| [references/api-reference.md](./references/api-reference.md) | Quick pattern lookup |
| [references/real-world-patterns.md](./references/real-world-patterns.md) | Production-ready examples |
| [references/error-handling-patterns.md](./references/error-handling-patterns.md) | Result types, retry, circuit breaker |
| [references/typescript-safety.md](./references/typescript-safety.md) | Branded types, exhaustive checks |
| [references/testing-strategies.md](./references/testing-strategies.md) | Property-based, mutation testing |
| [references/ai-review-checklist.md](./references/ai-review-checklist.md) | AI code review guide |
| [references/BIOME_MIGRATION.md](./references/BIOME_MIGRATION.md) | ESLint → Biome guide |

## Scripts

| Script | Description |
|--------|-------------|
| `scripts/validate-skill.js` | Validate SKILL.md against agentskills.io spec |
| `scripts/migrate-to-biome.js` | Automated ESLint/Prettier → Biome migration |

## License

MIT - see [LICENSE](./LICENSE) for details.
