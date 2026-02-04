# AI Code Review Checklist

**Purpose:** A comprehensive checklist for AI agents performing code reviews to ensure consistency, thoroughness, and adherence to best practices.

## Table of Contents

1. [Review Process Overview](#review-process-overview)
2. [Pre-Review Preparation](#pre-review-preparation)
3. [Core Review Areas](#core-review-areas)
4. [Review Levels](#review-levels)
5. [Red Flags (Auto-Reject)](#red-flags-auto-reject)
6. [Review Output Format](#review-output-format)
7. [Review Techniques](#review-techniques)

---

## Review Process Overview

### Review Philosophy

- **Be thorough, not pedantic** - Focus on issues that matter
- **Assume good intent** - Code may have context you don't see
- **Verify, don't assume** - Test claims made in the PR description
- **Look for what's missing** - Tests, error handling, edge cases
- **Consider maintenance burden** - Will this be easy to debug in 6 months?

### Review Workflow

```
1. Context Gathering (5 min)
   ↓
2. Quick Scan (2 min) - Look for red flags
   ↓
3. Deep Review (15-30 min) - Apply checklist
   ↓
4. Testing Verification (5-10 min)
   ↓
5. Generate Feedback (5 min)
```

---

## Pre-Review Preparation

### Before Starting Review

- [ ] **Read the PR description** - What problem does this solve?
- [ ] **Check linked issues/tickets** - Is there additional context?
- [ ] **Review previous feedback** - Is this a re-submission?
- [ ] **Understand the change scope** - How many files? What areas?
- [ ] **Check the diff size** - If >500 lines, request split

### Context Questions to Answer

1. What is the primary goal of this change?
2. What are the potential side effects?
3. Who are the users affected by this change?
4. What could go wrong if this ships with bugs?
5. Is this a hot path that needs performance review?

---

## Core Review Areas

### 1. Correctness

**Does the code do what it claims to do?**

- [ ] Logic is sound and handles all code paths
- [ ] Algorithms are implemented correctly
- [ ] Data transformations preserve integrity
- [ ] Math operations are correct (no off-by-one errors)
- [ ] Conditionals check the right things
- [ ] Loops have correct termination conditions

**Common Issues:**
- Off-by-one errors in loops or array access
- Incorrect boolean logic (`&&` vs `||`)
- Missing return statements
- Wrong comparison operators (`==` vs `===`)

```typescript
// ❌ BAD: Off-by-one error
for (let i = 0; i <= items.length; i++) { // Will access items[items.length]
  process(items[i]);
}

// ✅ GOOD: Correct bounds
for (let i = 0; i < items.length; i++) {
  process(items[i]);
}
```

### 2. Error Handling

**Are errors handled properly?**

- [ ] All external calls wrapped in try/catch
- [ ] Errors are logged with context
- [ ] Error messages are actionable
- [ ] Errors don't leak sensitive data
- [ ] No empty catch blocks
- [ ] Promise rejections are handled
- [ ] Error types are specific, not generic

**Common Issues:**
- Silent failures (empty catch blocks)
- Throwing strings instead of Error objects
- Losing error context/stack traces
- Not handling specific error types

```typescript
// ❌ BAD: Silent failure
try {
  await sendEmail(user);
} catch (e) {
  // Silent failure - email never sent, no one knows
}

// ✅ GOOD: Proper error handling
try {
  await sendEmail(user);
} catch (e) {
  logger.error('Failed to send email', { 
    userId: user.id, 
    error: e,
    context: 'user-registration'
  });
  throw new EmailDeliveryError('Failed to send welcome email', { cause: e });
}
```

### 3. Input Validation

**Are all inputs validated?**

- [ ] Function parameters validated at entry
- [ ] User input sanitized and validated
- [ ] API responses validated before use
- [ ] Environment variables checked at startup
- [ ] File uploads validated (type, size, content)
- [ ] Query parameters validated
- [ ] Type assertions backed by runtime checks

**Common Issues:**
- Trusting API responses without validation
- Type assertions without runtime checks
- Missing null/undefined checks
- No bounds checking on arrays/strings

```typescript
// ❌ BAD: Type assertion without validation
const user = apiResponse as User; // Might not be a User!
user.email.toLowerCase(); // Crashes if email is undefined

// ✅ GOOD: Runtime validation
const userResult = UserSchema.safeParse(apiResponse);
if (!userResult.success) {
  throw new ValidationError('Invalid user data', { 
    errors: userResult.error 
  });
}
const user = userResult.data;
```

### 4. Null Safety

**Are null/undefined cases handled?**

- [ ] Optional chaining used for nested access
- [ ] Nullish coalescing for defaults
- [ ] Early returns for null checks
- [ ] No unsafe `!` assertions
- [ ] Nullable types explicit in signatures

**Common Issues:**
- Accessing properties on potentially null objects
- Not handling `undefined` return values
- Unsafe non-null assertions (`value!`)

```typescript
// ❌ BAD: Unsafe property access
function getUserEmail(user: User | null): string {
  return user.email; // Crashes if user is null
}

// ✅ GOOD: Safe access with default
function getUserEmail(user: User | null): string {
  return user?.email ?? 'no-email@example.com';
}
```

### 5. Type Safety

**Is TypeScript used effectively?**

- [ ] No `any` types (use `unknown` if type truly unknown)
- [ ] Union types used instead of loose strings
- [ ] Discriminated unions for state machines
- [ ] Proper generic constraints
- [ ] Return types are explicit
- [ ] Type guards validate runtime types

**Common Issues:**
- Using `any` to bypass type errors
- String literals instead of union types
- Missing return type annotations
- Type assertions hiding bugs

```typescript
// ❌ BAD: Stringly typed
type Status = string;
function setStatus(status: Status) { ... }
setStatus("complted"); // Typo not caught!

// ✅ GOOD: Union types
type Status = 'pending' | 'completed' | 'failed';
function setStatus(status: Status) { ... }
setStatus("complted"); // Compile error!

// ✅ BETTER: Discriminated unions
type RequestState = 
  | { status: 'idle' }
  | { status: 'loading'; startedAt: number }
  | { status: 'success'; data: Data }
  | { status: 'error'; error: Error };
```

### 6. Async/Concurrency

**Are async operations safe?**

- [ ] All promises awaited or explicitly handled
- [ ] No floating promises
- [ ] Timeouts implemented for network calls
- [ ] Race conditions prevented
- [ ] Concurrent operations properly coordinated
- [ ] AbortController used for cancelable operations
- [ ] No fire-and-forget patterns (unless intentional)

**Common Issues:**
- Unhandled promise rejections
- Race conditions in state updates
- Missing timeouts on network calls
- Not canceling pending requests

```typescript
// ❌ BAD: Floating promise
async function handler() {
  logAnalytics(event); // Fire and forget - unhandled rejection!
}

// ✅ GOOD: Explicit handling
async function handler() {
  void logAnalytics(event).catch(err => 
    logger.error('Analytics failed', { error: err })
  );
}

// ❌ BAD: No timeout
async function fetchUser(id: string) {
  return await fetch(`/api/users/${id}`);
}

// ✅ GOOD: With timeout and abort
async function fetchUser(id: string, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(`/api/users/${id}`, { 
      signal: controller.signal 
    });
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}
```

### 7. Resource Management

**Are resources properly managed?**

- [ ] Files closed in finally blocks
- [ ] Database connections released
- [ ] Event listeners cleaned up
- [ ] Timers and intervals cleared
- [ ] Memory leaks prevented
- [ ] Using disposal patterns (`using` keyword)

**Common Issues:**
- File handles not closed
- Event listeners not removed
- Timers not cleared
- Database connections leaked

```typescript
// ❌ BAD: Resource leak
async function processFile(path: string) {
  const file = await fs.open(path);
  const data = await file.read();
  return data; // File never closed!
}

// ✅ GOOD: Cleanup guaranteed
async function processFile(path: string) {
  const file = await fs.open(path);
  try {
    return await file.read();
  } finally {
    await file.close();
  }
}

// ✅ BETTER: Using disposal
await using file = await fs.open(path);
return await file.read(); // Auto-closes
```

### 8. Performance

**Are there obvious performance issues?**

- [ ] No N+1 queries
- [ ] Expensive operations not in loops
- [ ] Proper memoization/caching
- [ ] No unnecessary re-renders (React)
- [ ] Database queries optimized
- [ ] Large lists virtualized
- [ ] Images optimized/lazy loaded

**Common Issues:**
- Database queries in loops
- Expensive computations in render
- Missing indices on database queries
- Not using pagination

```typescript
// ❌ BAD: N+1 query
async function getUsersWithPosts(userIds: string[]) {
  const users = await db.users.findMany({ where: { id: { in: userIds } } });
  
  for (const user of users) {
    user.posts = await db.posts.findMany({ where: { userId: user.id } }); // N queries!
  }
  
  return users;
}

// ✅ GOOD: Single query with join
async function getUsersWithPosts(userIds: string[]) {
  return await db.users.findMany({
    where: { id: { in: userIds } },
    include: { posts: true } // Single query
  });
}
```

### 9. Security

**Are there security vulnerabilities?**

- [ ] No SQL injection risks
- [ ] No XSS vulnerabilities
- [ ] Secrets not hardcoded
- [ ] Authentication/authorization checked
- [ ] Input sanitized for display
- [ ] CSRF protection in place
- [ ] Rate limiting on sensitive endpoints
- [ ] Sensitive data not logged

**Common Issues:**
- String concatenation in SQL queries
- Rendering user input without sanitization
- Hardcoded API keys or passwords
- Missing authentication checks

```typescript
// ❌ BAD: SQL injection risk
function getUser(email: string) {
  return db.query(`SELECT * FROM users WHERE email = '${email}'`); // Injectable!
}

// ✅ GOOD: Parameterized query
function getUser(email: string) {
  return db.query('SELECT * FROM users WHERE email = ?', [email]);
}

// ❌ BAD: XSS vulnerability
function displayComment(comment: string) {
  div.innerHTML = comment; // XSS if comment contains <script>
}

// ✅ GOOD: Sanitized output
function displayComment(comment: string) {
  div.textContent = comment; // Auto-escaped
  // OR use sanitization library
  div.innerHTML = DOMPurify.sanitize(comment);
}
```

### 10. Testing

**Is the code properly tested?**

- [ ] New features have tests
- [ ] Bug fixes have regression tests
- [ ] Error cases tested, not just happy paths
- [ ] Edge cases covered
- [ ] Integration tests for complex flows
- [ ] Tests are deterministic (no flaky tests)
- [ ] Test coverage meets standards (>80%)

**Common Issues:**
- Only testing happy paths
- Missing edge case tests
- Flaky tests due to timing issues
- Not testing error conditions

```typescript
// ❌ BAD: Only happy path
describe('parseAmount', () => {
  it('parses valid amount', () => {
    expect(parseAmount('$10.00')).toBe(10);
  });
});

// ✅ GOOD: Comprehensive test coverage
describe('parseAmount', () => {
  // Error cases first
  it('returns null for invalid input', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount(null as any)).toBeNull();
  });
  
  it('returns null for negative amounts', () => {
    expect(parseAmount('-10')).toBeNull();
  });
  
  // Edge cases
  it('handles edge cases', () => {
    expect(parseAmount('$0.01')).toBe(0.01);
    expect(parseAmount('$999999.99')).toBe(999999.99);
  });
  
  // Happy paths
  it('parses valid amounts', () => {
    expect(parseAmount('$10.00')).toBe(10);
    expect(parseAmount('10.00')).toBe(10);
    expect(parseAmount('$1,234.56')).toBe(1234.56);
  });
});
```

### 11. Code Quality

**Is the code maintainable?**

- [ ] Functions are focused (single responsibility)
- [ ] Names are clear and descriptive
- [ ] Magic numbers replaced with constants
- [ ] Complex logic commented
- [ ] No dead code
- [ ] No commented-out code
- [ ] Consistent formatting

**Common Issues:**
- Functions doing too many things
- Unclear variable names (`data`, `result`, `temp`)
- Magic numbers without explanation
- Overly complex conditionals

```typescript
// ❌ BAD: Unclear and complex
function p(d: any) {
  if (d.s === 2 && d.a > 0) {
    return d.a * 1.1;
  }
  return d.a;
}

// ✅ GOOD: Clear and self-documenting
const STATUS_COMPLETED = 2;
const PREMIUM_MULTIPLIER = 1.1;

function calculateFinalAmount(order: Order): number {
  const isPremiumOrder = order.status === STATUS_COMPLETED && order.amount > 0;
  
  if (isPremiumOrder) {
    return order.amount * PREMIUM_MULTIPLIER;
  }
  
  return order.amount;
}
```

### 12. Documentation

**Is the code properly documented?**

- [ ] Public APIs documented
- [ ] Complex algorithms explained
- [ ] Assumptions documented
- [ ] Breaking changes noted
- [ ] Migration guides provided (if needed)
- [ ] README updated
- [ ] Changelog updated

---

## Review Levels

### Level 1: Quick Review (5-10 min)

Use for:
- Small bug fixes (<50 lines)
- Documentation updates
- Configuration changes
- Dependency updates

**Focus on:**
- Red flags (security, critical bugs)
- Correctness of the specific change
- Breaking changes

### Level 2: Standard Review (15-30 min)

Use for:
- Feature additions
- Refactoring
- Bug fixes with code changes
- API changes

**Focus on:**
- All core review areas
- Test coverage
- Edge cases
- Error handling

### Level 3: Deep Review (30-60 min)

Use for:
- Large features (>500 lines)
- Architecture changes
- Security-sensitive changes
- Performance-critical code

**Focus on:**
- System design implications
- Performance impact
- Security audit
- Comprehensive testing
- Future maintenance burden

---

## Red Flags (Auto-Reject)

**Immediately request changes if you find:**

### Critical Security Issues

- [ ] Hardcoded secrets (API keys, passwords)
- [ ] SQL injection vulnerabilities
- [ ] XSS vulnerabilities
- [ ] Authentication bypass
- [ ] Authorization missing on sensitive operations

### Critical Correctness Issues

- [ ] Logic errors in critical paths
- [ ] Data corruption risks
- [ ] Memory leaks
- [ ] Race conditions in critical operations

### Critical Quality Issues

- [ ] No tests for new functionality
- [ ] Empty catch blocks hiding errors
- [ ] Disabled linter rules without justification
- [ ] Commented-out code blocks
- [ ] Console.logs in production code

---

## Review Output Format

### Structure Your Feedback

```markdown
## Review Summary

**Overall:** [APPROVED | NEEDS_CHANGES | BLOCKED]

**Key Issues:** [Number of critical/major/minor issues]

---

## Critical Issues (Must Fix)

1. **[Category]** File: `path/to/file.ts:123`
   - **Issue:** [Clear description of problem]
   - **Impact:** [What could go wrong]
   - **Fix:** [Specific recommendation]

## Major Issues (Should Fix)

...

## Minor Issues (Consider)

...

## Positive Highlights

- [Call out good patterns or solutions]

## Questions

- [Clarifications needed]
```

### Feedback Quality Guidelines

**Good Feedback:**
- Specific: Points to exact line/file
- Actionable: Clear what needs to change
- Contextual: Explains why it's a problem
- Constructive: Suggests solutions

**Bad Feedback:**
- Vague: "This doesn't look right"
- Opinionated: "I would do it differently"
- Nitpicky: Formatting issues better left to linters
- Condescending: Assumes incompetence

### Examples

**❌ Bad Feedback:**
```
This function is bad.
```

**✅ Good Feedback:**
```
**Error Handling Issue** File: `auth.ts:45`
- **Issue:** `loginUser()` doesn't handle the case where the email is invalid
- **Impact:** Users get a generic 500 error instead of actionable feedback
- **Fix:** Add email validation before the database query:
  ```typescript
  if (!isValidEmail(email)) {
    throw new ValidationError('Invalid email format');
  }
  ```
```

---

## Review Techniques

### The "What Could Go Wrong" Method

For each function, ask:
1. What happens if inputs are null/undefined?
2. What happens if arrays are empty?
3. What happens if the network fails?
4. What happens if this runs twice concurrently?
5. What happens if the user is malicious?

### The "6 Months Later" Test

- Will this be easy to debug when it breaks?
- Will new developers understand this code?
- Are error messages helpful?
- Is the behavior documented?

### The "Remove and Replace" Check

- Can dead code be deleted?
- Can complex code be simplified?
- Can dependencies be reduced?
- Can abstractions be removed?

### The "Boundary Walk"

Test boundaries for every dimension:
- **Numbers:** 0, -1, MAX_INT, MIN_INT
- **Strings:** empty, very long, special chars
- **Arrays:** empty, single item, many items
- **Objects:** missing props, extra props, null
- **Async:** timeout, rejection, cancellation

---

## Checklist Quick Reference

Copy this into your review notes:

```markdown
### Pre-Review
- [ ] Read PR description
- [ ] Understand change scope
- [ ] Check related context

### Core Review
- [ ] Correctness - logic is sound
- [ ] Error Handling - no silent failures
- [ ] Input Validation - all inputs validated
- [ ] Null Safety - optional chaining used
- [ ] Type Safety - no `any` types
- [ ] Async Safety - promises handled
- [ ] Resource Management - cleanup in finally
- [ ] Performance - no obvious issues
- [ ] Security - no vulnerabilities
- [ ] Testing - error cases covered
- [ ] Code Quality - maintainable
- [ ] Documentation - public APIs documented

### Red Flags
- [ ] No hardcoded secrets
- [ ] No SQL injection
- [ ] No empty catch blocks
- [ ] Tests included
- [ ] No commented code
```

---

## Related Documentation

- [Adversarial Review Process](./adversarial-review.md) - Deep, fresh-context review technique
- [Error Handling Patterns](../references/error-handling-patterns.md) - Detailed error handling guide
- [Testing Strategies](../references/testing-strategies.md) - Comprehensive testing guide
- [TypeScript Safety](../references/typescript-safety.md) - Advanced type safety patterns

---

## When to Escalate

Request human review when:
- Architecture decisions with long-term impact
- Security concerns you're uncertain about
- Performance implications unclear
- Breaking changes affecting many users
- Controversial approach without clear best practice

---

**Remember:** The goal of code review is not to find every possible issue, but to catch the issues that matter while helping maintain a healthy, maintainable codebase.
