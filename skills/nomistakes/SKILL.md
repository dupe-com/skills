---
name: nomistakes
description: Error prevention and best practices enforcement for agent-assisted coding. Use when writing code to catch common mistakes, enforce patterns, prevent bugs, validate inputs, handle errors, follow coding standards, avoid anti-patterns, and ensure code quality through proactive checks and guardrails.
---

# No Mistakes: Error Prevention & Best Practices Enforcement

## Purpose

This skill helps agents write higher-quality code by proactively preventing common errors, enforcing best practices, and applying defensive programming patterns. Use this skill when writing any code to reduce bugs, improve maintainability, and follow established patterns.

## When to Use This Skill

Activate this skill when:
- Writing new code or functions
- Refactoring existing code
- Implementing API integrations
- Handling user input or external data
- Working with async operations
- Managing state or side effects
- Writing tests or validation logic
- Reviewing code for potential issues

## Core Error Prevention Principles

### 1. Input Validation (Guard at Boundaries)

**Always validate inputs at function boundaries:**

```typescript
// ❌ BAD: No validation
function processUser(id: string) {
  return database.query(id); // What if id is empty? SQL injection?
}

// ✅ GOOD: Guard at entry
function processUser(id: string) {
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid user ID: must be non-empty string');
  }
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    throw new Error('Invalid user ID format: alphanumeric and hyphens only');
  }
  return database.query(id);
}
```

**Validation checklist:**
- [ ] Type checking (runtime, not just TypeScript)
- [ ] Null/undefined checks
- [ ] Range validation (min/max, length limits)
- [ ] Format validation (regex, schemas)
- [ ] Business rule validation (allowed states, permissions)

### 2. Error Handling (Fail Fast, Fail Loudly)

**Never silently swallow errors:**

```typescript
// ❌ BAD: Silent failure
try {
  await criticalOperation();
} catch (e) {
  // Silent failure - bug goes unnoticed
}

// ✅ GOOD: Explicit handling
try {
  await criticalOperation();
} catch (e) {
  logger.error('Critical operation failed', { error: e, context });
  throw new ApplicationError('Operation failed', { cause: e });
}
```

**Error handling checklist:**
- [ ] Catch specific errors, not generic `Error`
- [ ] Log errors with context (what, when, why)
- [ ] Preserve error stack traces (`cause` property)
- [ ] Return typed error objects (not strings)
- [ ] Use domain-specific error types

### 3. Null Safety (Avoid Billion Dollar Mistakes)

**Treat null/undefined as exceptional:**

```typescript
// ❌ BAD: Assumes data exists
function getUserName(user) {
  return user.profile.name; // Can crash on null user or profile
}

// ✅ GOOD: Defensive checks
function getUserName(user: User | null): string {
  if (!user?.profile?.name) {
    return 'Unknown User'; // Safe default or throw error
  }
  return user.profile.name;
}
```

**Null safety checklist:**
- [ ] Use optional chaining (`?.`) for nested access
- [ ] Nullish coalescing (`??`) for defaults
- [ ] Early returns for null checks
- [ ] Make nullability explicit in types
- [ ] Avoid `any` type (disables null checks)

### 4. Async Operations (No Race Conditions)

**Handle async errors and edge cases:**

```typescript
// ❌ BAD: Unhandled promise rejection
async function loadData() {
  const data = await fetch(url); // What if network fails?
  return data;
}

// ✅ GOOD: Comprehensive async handling
async function loadData(): Promise<Result<Data>> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (!response.ok) {
      return { error: `HTTP ${response.status}` };
    }
    
    const data = await response.json();
    return { data };
  } catch (e) {
    if (e.name === 'AbortError') {
      return { error: 'Request timeout' };
    }
    return { error: `Network error: ${e.message}` };
  }
}
```

**Async safety checklist:**
- [ ] Always await or return promises
- [ ] Handle promise rejections (try/catch or .catch)
- [ ] Implement timeouts for network calls
- [ ] Use abort controllers for cancelation
- [ ] Avoid fire-and-forget patterns (use `void` intentionally)

### 5. Type Safety (Make Invalid States Unrepresentable)

**Use TypeScript to prevent bugs at compile time:**

```typescript
// ❌ BAD: Stringly-typed
type Status = string; // Can be anything
function setStatus(status: Status) { ... }
setStatus("complted"); // Typo not caught

// ✅ GOOD: Union types
type Status = 'pending' | 'completed' | 'failed';
function setStatus(status: Status) { ... }
setStatus("complted"); // Compile error!

// ✅ BETTER: Discriminated unions for state machines
type State = 
  | { status: 'idle' }
  | { status: 'loading'; startedAt: number }
  | { status: 'success'; data: Data }
  | { status: 'error'; error: Error };
```

**Type safety checklist:**
- [ ] Use literal types instead of strings
- [ ] Use discriminated unions for complex state
- [ ] Avoid `any`, use `unknown` when type is truly unknown
- [ ] Make illegal states unrepresentable
- [ ] Use branded types for IDs and tokens

### 6. Boundary Checks (Arrays, Strings, Numbers)

**Always validate indices and ranges:**

```typescript
// ❌ BAD: No bounds checking
function getItem(index: number) {
  return items[index]; // Returns undefined if out of bounds
}

// ✅ GOOD: Explicit bounds checking
function getItem(index: number): Item {
  if (index < 0 || index >= items.length) {
    throw new RangeError(`Index ${index} out of bounds [0, ${items.length})`);
  }
  return items[index];
}
```

**Boundary checklist:**
- [ ] Check array indices before access
- [ ] Validate string lengths before slicing
- [ ] Check numeric ranges (min/max)
- [ ] Validate pagination parameters
- [ ] Handle empty collections gracefully

### 7. Resource Management (Clean Up After Yourself)

**Always release resources:**

```typescript
// ❌ BAD: Resource leak
async function processFile(path: string) {
  const file = await fs.open(path);
  const data = await file.read();
  return data; // File never closed!
}

// ✅ GOOD: Guaranteed cleanup
async function processFile(path: string) {
  const file = await fs.open(path);
  try {
    const data = await file.read();
    return data;
  } finally {
    await file.close(); // Always executed
  }
}

// ✅ BETTER: Using resource patterns
await using file = await fs.open(path); // Auto-closes
const data = await file.read();
return data;
```

**Resource checklist:**
- [ ] Close file handles (use `finally` or `using`)
- [ ] Clear timeouts and intervals
- [ ] Unsubscribe from event listeners
- [ ] Cancel pending requests on unmount
- [ ] Release database connections

### 8. Immutability (Avoid Mutation Bugs)

**Prefer immutable operations:**

```typescript
// ❌ BAD: Mutates input
function addItem(list: Item[], item: Item) {
  list.push(item); // Mutates caller's array
  return list;
}

// ✅ GOOD: Immutable update
function addItem(list: Item[], item: Item): Item[] {
  return [...list, item]; // New array
}

// ✅ GOOD: Immutable object update
function updateUser(user: User, name: string): User {
  return { ...user, name }; // New object
}
```

**Immutability checklist:**
- [ ] Use spread operators for copies
- [ ] Avoid `.push()`, `.pop()`, `.splice()` on inputs
- [ ] Use `Object.freeze()` for constants
- [ ] Return new objects/arrays instead of mutating
- [ ] Use `readonly` type modifiers

### 9. Configuration Validation (Fail at Startup)

**Validate configuration early:**

```typescript
// ❌ BAD: Lazy validation
function sendEmail(to: string) {
  const apiKey = process.env.SENDGRID_API_KEY; // Might be undefined
  return sendgrid.send({ to, apiKey });
}

// ✅ GOOD: Validate at startup
const config = {
  sendgridApiKey: requireEnv('SENDGRID_API_KEY'),
  databaseUrl: requireEnv('DATABASE_URL'),
};

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}
```

**Configuration checklist:**
- [ ] Validate env vars at startup, not at use
- [ ] Use schema validation (Zod, Joi) for config
- [ ] Fail fast if config is invalid
- [ ] Provide clear error messages
- [ ] Document required configuration

### 10. Defensive Programming (Assume the Worst)

**Code as if everything can fail:**

```typescript
// ❌ BAD: Optimistic
function parseJSON(text: string) {
  return JSON.parse(text); // Can throw
}

// ✅ GOOD: Defensive
function parseJSON(text: string): Result<any> {
  try {
    if (!text || text.trim() === '') {
      return { error: 'Empty JSON string' };
    }
    const data = JSON.parse(text);
    return { data };
  } catch (e) {
    return { error: `Invalid JSON: ${e.message}` };
  }
}
```

**Defensive checklist:**
- [ ] Validate external data (APIs, files, user input)
- [ ] Handle parsing errors (JSON, XML, CSV)
- [ ] Check function preconditions
- [ ] Return errors instead of throwing when appropriate
- [ ] Use Result types for fallible operations

### 11. Performance Anti-Patterns (Core Web Vitals)

**Optimize for user experience metrics:**

| Metric | Target | What it Measures |
|--------|--------|------------------|
| **LCP** (Largest Contentful Paint) | < 2.5s | Loading performance |
| **INP** (Interaction to Next Paint) | < 200ms | Interactivity/responsiveness |
| **CLS** (Cumulative Layout Shift) | < 0.1 | Visual stability |

```typescript
// ❌ BAD: Blocking resources, layout shifts
function ProductPage() {
  return (
    <div>
      {/* No dimensions = CLS issues */}
      <img src={product.image} />
      
      {/* Sync heavy computation = INP issues */}
      <div>{expensiveCalculation(data)}</div>
      
      {/* Render-blocking = LCP issues */}
      <script src="huge-library.js" />
    </div>
  );
}

// ✅ GOOD: Optimized for Web Vitals
function ProductPage() {
  // Defer heavy work off main thread
  const [result, setResult] = useState<Result | null>(null);
  
  useEffect(() => {
    // Use Web Worker or requestIdleCallback for heavy work
    requestIdleCallback(() => {
      setResult(expensiveCalculation(data));
    });
  }, [data]);
  
  return (
    <div>
      {/* Explicit dimensions prevent layout shift */}
      <img 
        src={product.image} 
        width={400} 
        height={300}
        loading="lazy"
        decoding="async"
      />
      
      {/* Skeleton prevents CLS while loading */}
      {result ? <div>{result}</div> : <Skeleton />}
    </div>
  );
}
```

**Performance checklist:**
- [ ] Images have explicit `width` and `height` attributes
- [ ] Use skeleton loaders for dynamic content
- [ ] Defer non-critical JavaScript (`async`/`defer`)
- [ ] Move heavy computation to Web Workers
- [ ] Use `loading="lazy"` for below-fold images
- [ ] Avoid layout shifts from dynamic content injection

### 12. Fire-and-Forget Detection (Critical Bug Pattern)

**Never use `void` with async functions in workers or handlers:**

```typescript
// ❌ CRITICAL BUG: Worker terminates before async work completes
// This kills background jobs in Inngest, Vercel Functions, etc.
export async function handler() {
  void processInBackground(data); // Worker exits immediately!
  return { status: 'accepted' };
}

// ❌ BAD: Signal handlers can't be async
process.on('SIGTERM', () => {
  void gracefulShutdown(); // Process exits before cleanup!
});

// ✅ GOOD: Await in worker contexts
export async function handler() {
  await processInBackground(data); // Waits for completion
  return { status: 'processed' };
}

// ✅ GOOD: For intentional fire-and-forget, handle errors explicitly
export async function handler() {
  // Explicit error handling for background work
  processInBackground(data).catch(err => {
    logger.error('Background task failed', { error: err });
    metrics.increment('background_task_failures');
  });
  return { status: 'accepted' };
}

// ✅ GOOD: Signal handler with proper async handling
let shutdownPromise: Promise<void> | null = null;
process.on('SIGTERM', () => {
  shutdownPromise = gracefulShutdown();
});
process.on('beforeExit', async () => {
  if (shutdownPromise) await shutdownPromise;
});
```

**ESLint rule to catch this:**
```json
{
  "rules": {
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error"
  }
}
```

**Fire-and-forget checklist:**
- [ ] Enable `@typescript-eslint/no-floating-promises` rule
- [ ] Never use `void asyncFunc()` in serverless/worker contexts
- [ ] For intentional background work, add explicit `.catch()` handling
- [ ] Signal handlers must store promise and await in `beforeExit`
- [ ] Audit existing code for `void` + async patterns

### 13. Server Actions Error Handling (Next.js/React)

**Never throw in Server Actions - return typed errors instead:**

```typescript
// ❌ BAD: Throwing breaks React hydration and error boundaries
'use server'
export async function createUser(formData: FormData) {
  const data = Object.fromEntries(formData);
  
  if (!data.email) {
    throw new Error('Email required'); // Crashes client!
  }
  
  const user = await db.users.create(data);
  return user;
}

// ✅ GOOD: Return typed Result objects
'use server'
export async function createUser(formData: FormData): Promise<
  { data: User } | { error: string }
> {
  const raw = Object.fromEntries(formData);
  
  // Validate with schema
  const parsed = UserSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  
  try {
    const user = await db.users.create(parsed.data);
    return { data: user };
  } catch (e) {
    logger.error('Failed to create user', { error: e });
    return { error: 'Failed to create user. Please try again.' };
  }
}

// ✅ Client-side usage with proper error handling
function CreateUserForm() {
  const [state, formAction] = useActionState(createUser, null);
  
  return (
    <form action={formAction}>
      {state?.error && <ErrorMessage>{state.error}</ErrorMessage>}
      <input name="email" type="email" required />
      <button type="submit">Create</button>
    </form>
  );
}
```

**Server Actions checklist:**
- [ ] Never `throw` in Server Actions - always return `{ error }` or `{ data }`
- [ ] Use Zod/Valibot `.safeParse()` for validation (not `.parse()`)
- [ ] Log errors server-side before returning user-friendly message
- [ ] Type the return as a discriminated union
- [ ] Handle errors gracefully in the client component

### 14. Security Quick Wins (OWASP Top 10 2025)

**Essential security patterns for every application:**

```typescript
// 1. Rate Limiting - Prevent brute force attacks
import rateLimit from 'express-rate-limit';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: 'Too many login attempts. Try again later.' },
  standardHeaders: true,
});
app.post('/login', loginLimiter, loginHandler);

// 2. Input Validation - Prevent injection attacks
import { z } from 'zod';

const UserInputSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100).regex(/^[a-zA-Z\s-]+$/),
  // Never trust client data
});

// 3. Output Encoding - Prevent XSS
import { encode } from 'html-entities';

function renderUserContent(content: string): string {
  return encode(content); // Escapes <, >, &, ", '
}

// 4. Parameterized Queries - Prevent SQL injection
// ❌ BAD: String interpolation
const query = `SELECT * FROM users WHERE id = '${userId}'`;

// ✅ GOOD: Parameterized
const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);

// 5. Secrets Management - Never hardcode
// ❌ BAD
const API_KEY = 'sk-1234567890abcdef';

// ✅ GOOD
const API_KEY = requireEnv('API_KEY'); // Validated at startup
```

**Security headers (add to all responses):**
```typescript
// Using Helmet.js or manual headers
app.use(helmet({
  contentSecurityPolicy: true,
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: true,
  dnsPrefetchControl: true,
  frameguard: true,
  hidePoweredBy: true,
  hsts: true,
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: true,
  xssFilter: true,
}));
```

**Security checklist:**
- [ ] Rate limiting on authentication endpoints
- [ ] Input validation with allowlists (not blocklists)
- [ ] Output encoding for user-generated content
- [ ] Parameterized queries (never string interpolation)
- [ ] Secrets in env vars, validated at startup
- [ ] Security headers on all responses
- [ ] `npm audit` and Snyk in CI/CD pipeline
- [ ] 2FA enabled on npm/GitHub accounts

### 15. TypeScript 5.x Safety Features

**Leverage modern TypeScript for safer code:**

```typescript
// 1. `const` type parameters - Preserve literal types
// ❌ Without const: type is string[]
function createRoute<T extends string[]>(paths: T) {
  return paths;
}
const routes = createRoute(['users', 'posts']); // string[]

// ✅ With const: type is readonly ["users", "posts"]
function createRoute<const T extends string[]>(paths: T) {
  return paths;
}
const routes = createRoute(['users', 'posts']); // readonly ["users", "posts"]

// 2. `satisfies` operator - Type-check without widening
// ❌ Type annotation widens the type
const config: Config = { port: 3000 }; // port is number

// ✅ satisfies preserves the literal type
const config = { port: 3000 } satisfies Config; // port is 3000

// 3. `using` declarations - Automatic resource cleanup
// ❌ Manual cleanup (easy to forget)
async function processFile(path: string) {
  const file = await fs.open(path);
  try {
    return await file.read();
  } finally {
    await file.close();
  }
}

// ✅ Automatic cleanup with `using`
async function processFile(path: string) {
  await using file = await fs.open(path);
  return await file.read();
} // file.close() called automatically

// 4. NoInfer utility type - Prevent inference from specific positions
function createFSM<S extends string>(
  initial: NoInfer<S>,  // Won't infer S from this parameter
  states: S[]
) { /* ... */ }

// 5. Import attributes for JSON (type-safe imports)
import config from './config.json' with { type: 'json' };
```

**TypeScript 5.x checklist:**
- [ ] Use `const` type parameters for literal preservation
- [ ] Use `satisfies` for type-checking without widening
- [ ] Use `using`/`await using` for resource cleanup
- [ ] Enable `"moduleResolution": "bundler"` for modern imports
- [ ] Use `NoInfer<T>` to control type inference

### 16. Modern Validation Library Selection

**Choose the right validation library for your use case:**

| Library | Bundle Size | Best For |
|---------|-------------|----------|
| **Zod** | ~14KB gzip | Server-side, complex schemas, transforms |
| **Valibot** | ~600B gzip | Client-side, bundle-critical, simple schemas |
| **@effect/schema** | Varies | Type-safe errors, branded types, enterprise |

```typescript
// Zod - Full-featured, great DX
import { z } from 'zod';

const UserSchema = z.object({
  email: z.string().email(),
  age: z.number().min(0).max(150),
  role: z.enum(['admin', 'user']),
}).transform(data => ({
  ...data,
  email: data.email.toLowerCase(),
}));

// Valibot - 10x smaller bundle (tree-shakeable)
import * as v from 'valibot';

const UserSchema = v.object({
  email: v.pipe(v.string(), v.email()),
  age: v.pipe(v.number(), v.minValue(0), v.maxValue(150)),
  role: v.picklist(['admin', 'user']),
});

// Decision guide:
// - Client-side form validation → Valibot (bundle size matters)
// - Server-side API validation → Zod (features matter)
// - Need .transform() → Zod
// - Tree-shaking critical → Valibot
// - Enterprise with branded types → Effect Schema
```

**Validation library checklist:**
- [ ] Use Valibot for client-side validation (smaller bundle)
- [ ] Use Zod for server-side validation (better DX)
- [ ] Always use `.safeParse()` to get Result type
- [ ] Never use `.parse()` in Server Actions (throws)
- [ ] Consider Effect Schema for complex enterprise needs

## Common Anti-Patterns to Avoid

### 1. The Silent Failure

```typescript
// ❌ NEVER DO THIS
try {
  await importantOperation();
} catch (e) {
  // Empty catch - hides bugs
}
```

**Fix:** Always log, re-throw, or return error.

### 2. The String Error

```typescript
// ❌ BAD: Loses stack trace
throw "Something went wrong";

// ✅ GOOD: Proper Error object
throw new Error("Something went wrong");
```

### 3. The Floating Promise

```typescript
// ❌ BAD: Fire and forget
async function handler() {
  someAsyncOperation(); // Unhandled rejection risk
}

// ✅ GOOD: Explicit handling
async function handler() {
  void someAsyncOperation().catch(logError); // Intentional fire-and-forget
  // OR
  await someAsyncOperation(); // Wait for completion
}
```

### 4. The Type Assertion Lie

```typescript
// ❌ BAD: Assumes shape without validation
const user = apiResponse as User; // Might not be User!

// ✅ GOOD: Runtime validation
const user = UserSchema.parse(apiResponse); // Throws if invalid
```

### 5. The Magic Number

```typescript
// ❌ BAD: Unclear meaning
if (status === 2) { ... }

// ✅ GOOD: Named constant
const STATUS_COMPLETED = 2;
if (status === STATUS_COMPLETED) { ... }

// ✅ BETTER: Enum
enum Status { Pending = 1, Completed = 2 }
if (status === Status.Completed) { ... }
```

## Testing Best Practices

### Test Error Cases First

```typescript
describe('processPayment', () => {
  // Test failure modes first
  it('throws on invalid amount', () => {
    expect(() => processPayment(-10)).toThrow('Invalid amount');
  });
  
  it('throws on missing payment method', () => {
    expect(() => processPayment(10, null)).toThrow('Payment method required');
  });
  
  // Then test happy path
  it('processes valid payment', () => {
    const result = processPayment(10, { type: 'card' });
    expect(result.success).toBe(true);
  });
});
```

### Use Property-Based Testing for Edge Cases

```typescript
// Test invariants across many inputs
test('parseAmount never returns negative', () => {
  fc.assert(fc.property(fc.string(), (input) => {
    const result = parseAmount(input);
    return result === null || result >= 0;
  }));
});
```

## Pre-Commit Checklist

Before completing your task, verify:

### Core Safety
- [ ] **Input validation**: All function inputs validated
- [ ] **Error handling**: No empty catch blocks, all errors logged
- [ ] **Null safety**: No unsafe property access (use `?.`)
- [ ] **Type safety**: No `any` types, proper union types
- [ ] **Async safety**: All promises awaited or handled
- [ ] **Resource cleanup**: Files, connections, timers cleaned up
- [ ] **Immutability**: No mutation of input parameters

### Modern Patterns (2024+)
- [ ] **No floating promises**: `@typescript-eslint/no-floating-promises` enabled
- [ ] **Server Actions**: Return `{ error }` or `{ data }`, never throw
- [ ] **Web Vitals**: Images have dimensions, no layout shifts
- [ ] **TypeScript 5.x**: Using `using` for resources, `satisfies` for config
- [ ] **Validation**: Valibot client-side, Zod server-side

### Security
- [ ] **Rate limiting**: Auth endpoints have rate limits
- [ ] **Input sanitization**: User content escaped before render
- [ ] **Secrets**: No hardcoded secrets, env vars validated at startup
- [ ] **Dependencies**: `npm audit` passes, no critical vulnerabilities

### Quality
- [ ] **Tests**: Error cases tested first, then happy paths
- [ ] **Documentation**: Error conditions documented
- [ ] **Logging**: Errors logged with sufficient context

## Quick Reference: Error Prevention Patterns

| Scenario | Pattern |
|----------|---------|
| External API call | Try/catch + timeout + retry logic |
| User input | Validate with schema (Zod, Joi) |
| Array access | Check length before index |
| Object property | Use optional chaining `?.` |
| Async operation | Always await or .catch() |
| Configuration | Validate at startup |
| Type unknown | Use `unknown` + type guards |
| Resource (file/socket) | Use `using` (TS 5.2+) or `finally` |
| State machine | Discriminated unions |
| Error context | Include error cause chain |
| **Background job** | **Never `void asyncFn()`, always await** |
| **Server Action** | **Return `{error}` or `{data}`, never throw** |
| **Client validation** | **Valibot (600B) over Zod (14KB)** |
| **Image rendering** | **Explicit width/height, lazy loading** |
| **Heavy computation** | **Web Worker or requestIdleCallback** |
| **Auth endpoint** | **Rate limiting middleware** |
| **User content** | **Escape HTML/JS before render** |
| **Literal types** | **Use `const` type params (TS 5.0+)** |
| **Config objects** | **Use `satisfies` (TS 4.9+)** |

## Further Reading

For detailed examples and reference implementations, see:
- `references/error-handling-patterns.md` - Comprehensive error handling guide
- `references/typescript-safety.md` - Advanced TypeScript safety patterns
- `references/testing-strategies.md` - Test coverage for error conditions
- `references/ai-review-checklist.md` - Code review checklist for AI agents
- `references/adversarial-review.md` - VDD pattern for hostile code review
- `references/api-reference.md` - Quick lookup for patterns and code examples
- `references/real-world-patterns.md` - Real-world implementation examples
- `references/BIOME_MIGRATION.md` - ESLint/Prettier to Biome migration guide

## When NOT to Use This Skill

- Writing proof-of-concept code (but refactor before production)
- Performance-critical hot paths (after profiling shows overhead)
- Throwaway scripts (but consider: will this become production code?)
