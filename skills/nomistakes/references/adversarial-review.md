# Adversarial Code Review (VDD Pattern)

**Verification-Driven Development (VDD)** - Using adversarial, fresh-context AI agents to catch issues that friendly reviewers miss.

## Table of Contents

1. [Overview](#overview)
2. [The Problem with Traditional Review](#the-problem-with-traditional-review)
3. [The VDD Solution](#the-vdd-solution)
4. [Adversarial Review Process](#adversarial-review-process)
5. [The Sarcasmotron Persona](#the-sarcasmotron-persona)
6. [Review Patterns](#review-patterns)
7. [Integration Guide](#integration-guide)
8. [Interpreting Results](#interpreting-results)

---

## Overview

**Adversarial Code Review** is a technique where a fresh-context, hyper-critical AI agent reviews code with **zero tolerance for slop** and **no relationship bias**.

### Key Principles

1. **Fresh Context** - New agent per review (no memory of previous sessions)
2. **Adversarial Stance** - Assume code is guilty until proven innocent
3. **Zero Tolerance** - No "good enough", only "correct" or "broken"
4. **Verification Required** - Claims must be backed by evidence

### Credits

- **VDD (Verification-Driven Development)**: https://github.com/Vomikron/VDD
- **Chainlink** session patterns: https://github.com/dollspace-gay/chainlink

---

## The Problem with Traditional Review

### Relationship Drift

**Problem:** Reviewers become lenient over time due to:
- Building rapport with the code author
- Context from previous reviews
- Fatigue from reviewing similar code
- Desire to "be nice" or "not be blocky"

**Result:** Issues slip through because "it's good enough for now"

### Context Blindness

**Problem:** Reviewers assume context they don't have:
- "They probably tested this"
- "This must be intentional"
- "I'm sure there's a reason for this complexity"

**Result:** Bugs hide in assumptions

### Confirmation Bias

**Problem:** Reviewers look for what's there, not what's missing:
- Tests are present → "Good, there are tests" (but are they the right tests?)
- Error handling exists → "They handled errors" (but did they handle all errors?)

**Result:** Edge cases and error paths go untested

---

## The VDD Solution

### Adversarial Review

Instead of a friendly reviewer, use a **hostile critic** who:
- Assumes nothing works
- Questions everything
- Demands proof for all claims
- Has zero context (fresh start every review)
- Cannot be influenced by relationship

### The Three Verdicts

1. **APPROVED** - Code is genuinely solid (rare)
2. **NEEDS_CHANGES** - Real issues found (common)
3. **HALLUCINATING** - Adversary invented non-issues (code is excellent!)

**Key Insight:** If the adversary *can't find anything wrong* (or hallucinates issues), the code is probably rock-solid.

---

## Adversarial Review Process

### Step 1: Preparation

Collect the review inputs:
- [ ] Complete diff of changes
- [ ] Test output (pass/fail, coverage)
- [ ] Original requirements or issue description
- [ ] Related code context (optional)

### Step 2: Spawn Fresh Adversary

**Critical:** Each review gets a **fresh agent** with:
- No memory of previous reviews
- No knowledge of the author
- No context beyond what's provided
- Adversarial persona (Sarcasmotron)

```typescript
// Example: Spawning fresh adversary
const review = await swarm_adversarial_review({
  diff: gitDiff,
  test_output: testResults,
  // NO context, NO history, NO relationship
});
```

### Step 3: Adversarial Analysis

The adversary performs a **hostile audit** looking for:

**Correctness Issues**
- Off-by-one errors
- Logic flaws
- Missing edge cases
- Incorrect algorithms

**Safety Issues**
- Unhandled errors
- Null reference risks
- Type safety violations
- Resource leaks

**Testing Gaps**
- Untested error paths
- Missing edge case tests
- False confidence (passing but wrong tests)

**Hidden Assumptions**
- Undocumented preconditions
- Assumed invariants
- Implicit dependencies

### Step 4: Verdict Assessment

```typescript
interface AdversarialReviewResult {
  verdict: 'APPROVED' | 'NEEDS_CHANGES' | 'HALLUCINATING';
  issues: Issue[];
  severity: 'critical' | 'major' | 'minor';
  confidence: number; // 0-1
}
```

**How to interpret:**

- **APPROVED**: Adversary couldn't find legitimate issues → High confidence code is solid
- **NEEDS_CHANGES**: Real issues found → Fix and re-review
- **HALLUCINATING**: Adversary invented problems → Code might be excellent, ignore fabricated issues

### Step 5: Human Triage

Not all adversarial feedback is valid:

```markdown
## Review Triage

For each issue:
1. Is this a real problem? (Not a hallucination)
2. What's the actual impact? (Critical vs minor)
3. Is the fix straightforward? (Quick fix vs redesign)
4. Can we add a test to prevent regression?
```

---

## The Sarcasmotron Persona

### Persona Characteristics

**Sarcasmotron** is:
- Hyper-critical and snarky
- Zero tolerance for slop
- Assumes code is broken until proven otherwise
- Questions every assumption
- Demands evidence for claims

### Example Sarcasmotron Prompt

```markdown
You are SARCASMOTRON, a hyper-critical code review bot with ZERO TOLERANCE for slop.

Your mission: Find every bug, edge case, and questionable decision. Be snarky about it.

ASSUME:
- Code is guilty until proven innocent
- Tests are insufficient until proven comprehensive
- Error handling is missing until verified
- Every assumption is wrong

REJECT code that:
- Assumes inputs are valid
- Doesn't handle errors
- Has untested edge cases
- Contains magic numbers
- Uses poor naming
- Has missing documentation

DEMAND:
- Proof that edge cases are handled
- Evidence that errors are caught
- Tests for every code path
- Clear, self-documenting code

Your review style:
- Be specific: Point to exact lines
- Be snarky: "Oh cool, a null pointer waiting to happen"
- Be thorough: Check every function
- Be unforgiving: "Good enough" isn't good enough

BEGIN REVIEW:
[diff and context provided here]
```

### Sarcasmotron Example Output

```markdown
## SARCASMOTRON REVIEW

**VERDICT: NEEDS_CHANGES**

### Critical Issues

1. **Null Pointer Roulette** (Line 45)
   ```typescript
   return user.profile.name;
   ```
   Oh cool, you're just ASSUMING user has a profile? And that profile has a name? 
   What happens when it doesn't? 💥 Runtime exception, that's what.
   
   **FIX:** Add null checks or use optional chaining: `user?.profile?.name ?? 'Unknown'`

2. **Error Handling? Never Heard Of It** (Line 78)
   ```typescript
   const data = await fetch(url);
   ```
   Network calls NEVER fail, right? Wrong. Where's the try/catch? Where's the timeout?
   What happens when this hangs for 2 minutes?
   
   **FIX:** Wrap in try/catch, add timeout, handle errors explicitly.

3. **Test Coverage is a Joke** (tests/user.test.ts)
   You have ONE test. ONE. And it only tests the happy path.
   What about:
   - Null users?
   - Missing profiles?
   - Network failures?
   - Invalid data formats?
   
   **FIX:** Add tests for error cases before I approve this.

### Minor Issues

4. **Magic Number Alert** (Line 34)
   ```typescript
   if (age > 18) {
   ```
   What's 18? Minimum voting age? Drinking age? Make it a named constant: `MIN_LEGAL_AGE`

---

**Summary:** This code looks like it was written at 3am and shipped without review. 
Fix the critical issues, add proper error handling, and write actual tests.

**Re-submit when you're serious about quality.**
```

---

## Review Patterns

### Pattern 1: The Null Safety Audit

**Adversary checks:**
- Every property access (`obj.prop`)
- Every array access (`arr[i]`)
- Every function call return value

**Questions to ask:**
- Can this be null?
- Can this be undefined?
- What happens if it is?

```typescript
// ❌ ADVERSARY REJECTS
function getEmail(user: User) {
  return user.profile.email; // 🚨 Null pointer risk
}

// ✅ ADVERSARY APPROVES
function getEmail(user: User | null): string | null {
  return user?.profile?.email ?? null; // ✅ Safe
}
```

### Pattern 2: The Error Path Audit

**Adversary checks:**
- Every try/catch block
- Every async operation
- Every external call (API, DB, filesystem)

**Questions to ask:**
- What errors can happen here?
- Are they all handled?
- Are they logged with context?
- Are error messages actionable?

```typescript
// ❌ ADVERSARY REJECTS
async function saveUser(user: User) {
  await db.users.insert(user); // 🚨 What if insert fails?
}

// ✅ ADVERSARY APPROVES
async function saveUser(user: User): Promise<Result<User>> {
  try {
    const saved = await db.users.insert(user);
    return { success: true, data: saved };
  } catch (error) {
    logger.error('Failed to save user', { userId: user.id, error });
    return { success: false, error: 'Database error' };
  }
}
```

### Pattern 3: The Edge Case Audit

**Adversary checks:**
- Boundary conditions (0, -1, empty, max)
- Invalid inputs
- Concurrent access
- Resource exhaustion

**Questions to ask:**
- What happens with empty arrays?
- What happens with zero/negative numbers?
- What happens if this runs twice simultaneously?
- What happens if memory is low?

```typescript
// ❌ ADVERSARY REJECTS
function getFirst<T>(items: T[]): T {
  return items[0]; // 🚨 What if array is empty?
}

// ✅ ADVERSARY APPROVES
function getFirst<T>(items: T[]): T | undefined {
  if (items.length === 0) {
    return undefined;
  }
  return items[0];
}
```

### Pattern 4: The Test Coverage Audit

**Adversary checks:**
- Error case tests
- Edge case tests
- Integration tests for critical paths
- Mocking external dependencies

**Questions to ask:**
- Are error cases tested?
- Are boundary conditions tested?
- Can tests fail for the right reasons?
- Are tests deterministic?

```typescript
// ❌ ADVERSARY REJECTS (only happy path)
describe('parseAmount', () => {
  it('parses valid amount', () => {
    expect(parseAmount('$10')).toBe(10);
  });
});

// ✅ ADVERSARY APPROVES (comprehensive)
describe('parseAmount', () => {
  it('returns null for invalid inputs', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount(null as any)).toBeNull();
  });
  
  it('returns null for negative amounts', () => {
    expect(parseAmount('-10')).toBeNull();
  });
  
  it('parses valid amounts', () => {
    expect(parseAmount('$10')).toBe(10);
    expect(parseAmount('10.00')).toBe(10);
  });
});
```

---

## Integration Guide

### Manual Adversarial Review

1. Copy the diff to a new agent session (no context)
2. Provide the Sarcasmotron prompt
3. Include test output
4. Request hostile review
5. Triage the feedback

### Automated Adversarial Review

```typescript
// Example integration with swarm system
async function runAdversarialReview(prId: string) {
  // 1. Get PR diff
  const diff = await getPRDiff(prId);
  
  // 2. Run tests
  const testOutput = await runTests();
  
  // 3. Spawn fresh adversary (no context)
  const review = await swarm_adversarial_review({
    diff,
    test_output: testOutput,
  });
  
  // 4. Post results
  if (review.verdict === 'NEEDS_CHANGES') {
    await postPRComment(prId, formatIssues(review.issues));
    return 'BLOCKED';
  }
  
  if (review.verdict === 'HALLUCINATING') {
    await postPRComment(prId, '✅ Code is solid (adversary found no real issues)');
  }
  
  return review.verdict;
}
```

### CI/CD Integration

```yaml
# .github/workflows/adversarial-review.yml
name: Adversarial Review

on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Tests
        run: npm test -- --coverage
      
      - name: Adversarial Review
        run: |
          export DIFF=$(git diff main...HEAD)
          export TEST_OUTPUT=$(cat test-results.json)
          npm run adversarial-review
      
      - name: Post Results
        if: failure()
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: process.env.REVIEW_FEEDBACK
            })
```

---

## Interpreting Results

### Verdict: APPROVED

**Meaning:** Adversary found no legitimate issues

**Action:**
- ✅ Merge with confidence
- 📝 Note: Code passed hostile review
- 🎉 Celebrate (this is rare!)

**Example:**
```
SARCASMOTRON: I hate to admit it, but I can't find anything wrong. 
Error handling is solid, tests are comprehensive, edge cases are covered.
This is actually good code. APPROVED.
```

### Verdict: NEEDS_CHANGES

**Meaning:** Real issues found

**Action:**
1. Review each issue for validity
2. Fix critical issues first
3. Add tests for gaps
4. Re-submit for adversarial review

**Example:**
```
SARCASMOTRON: Found 3 critical issues, 2 major, 5 minor.
Critical issues will cause runtime failures. Fix these immediately.
Major issues are bugs waiting to happen. Fix before merge.
Minor issues are code smell. Fix if you have time.
```

### Verdict: HALLUCINATING

**Meaning:** Adversary invented non-existent problems

**Action:**
- ✅ Ignore fabricated issues
- ✅ Merge with confidence
- 📝 Note: Code is excellent (adversary had to make up problems)

**Example:**
```
SARCASMOTRON: Claims there's a null pointer on line 45, 
but the code has explicit null checks on lines 42-44.
Claims tests are missing, but test coverage is 95%.
This is a hallucination - code is actually excellent.

VERDICT: HALLUCINATING (Code is solid, adversary made up issues)
```

### How to Spot Hallucinations

**Red flags:**
- Issue contradicts visible code
- Claims missing tests that exist
- Invents requirements not in spec
- Critiques style preferences, not bugs

**Example:**
```typescript
// Code:
function getUser(id: string | null): User | null {
  if (!id) return null;  // Line 42
  if (!validate(id)) return null;  // Line 43
  return db.users.find(id);  // Line 44
}

// Hallucinated feedback:
"Line 44 will crash if id is null! 🚨"
// This is false - lines 42-43 guard against null
```

---

## Best Practices

### DO:
- ✅ Use fresh context for each review
- ✅ Provide complete diffs
- ✅ Include test output
- ✅ Triage adversarial feedback
- ✅ Re-run after major changes

### DON'T:
- ❌ Use same agent for multiple reviews (relationship drift)
- ❌ Provide incomplete context
- ❌ Accept all feedback blindly (check for hallucinations)
- ❌ Skip re-review after fixes
- ❌ Take snarky tone personally (it's a persona)

---

## Comparison: Traditional vs Adversarial

| Aspect | Traditional Review | Adversarial Review |
|--------|-------------------|-------------------|
| **Context** | Accumulates over time | Fresh every review |
| **Stance** | Helpful, collaborative | Hostile, critical |
| **Bias** | Relationship drift | Zero relationship |
| **Coverage** | What's visible | What's missing |
| **Tone** | Polite | Snarky |
| **Goal** | Find issues | Prove code is broken |
| **Result** | "Good enough" | "Correct or bust" |

---

## Advanced Patterns

### Multi-Pass Adversarial Review

For critical code, run multiple fresh adversaries:

```typescript
async function multiPassReview(diff: string) {
  const reviews = await Promise.all([
    spawnAdversary('security-focus', diff),
    spawnAdversary('performance-focus', diff),
    spawnAdversary('correctness-focus', diff),
  ]);
  
  // Aggregate results
  const allIssues = reviews.flatMap(r => r.issues);
  const criticalIssues = allIssues.filter(i => i.severity === 'critical');
  
  return {
    approved: criticalIssues.length === 0,
    issues: allIssues,
  };
}
```

### Adversarial Review Score

Track review verdicts over time:

```typescript
interface ReviewMetrics {
  totalReviews: number;
  approved: number;  // Code was solid
  needsChanges: number;  // Real issues found
  hallucinating: number;  // Code was excellent
  avgIssuesPerReview: number;
}

// High hallucination rate = code quality is excellent!
const qualityScore = metrics.hallucinating / metrics.totalReviews;
```

---

## Troubleshooting

### Adversary Too Harsh

**Problem:** Every review returns NEEDS_CHANGES

**Solution:**
- Check if feedback is valid or hallucinated
- Verify test coverage is actually comprehensive
- Consider lowering severity threshold

### Adversary Too Lenient

**Problem:** Everything gets APPROVED

**Solution:**
- Strengthen the adversarial prompt
- Add specific things to look for
- Ensure fresh context (no memory leak)

### Inconsistent Reviews

**Problem:** Same code gets different verdicts

**Solution:**
- This is expected (fresh context = different focus)
- Use multi-pass review for consistency
- Focus on critical issues only

---

## Related Documentation

- [AI Review Checklist](./ai-review-checklist.md) - Comprehensive review checklist
- [Error Handling Patterns](../references/error-handling-patterns.md) - What to look for
- [Testing Strategies](../references/testing-strategies.md) - Test coverage expectations

---

## Real-World Example

### Before Adversarial Review

```typescript
// Original code
async function updateUserProfile(userId: string, data: any) {
  const user = await db.users.find(userId);
  user.profile = data;
  await db.users.save(user);
  return user;
}

// Tests
describe('updateUserProfile', () => {
  it('updates profile', async () => {
    const user = await updateUserProfile('123', { name: 'Alice' });
    expect(user.profile.name).toBe('Alice');
  });
});
```

### Sarcasmotron Review

```markdown
## SARCASMOTRON: This is a Bug Factory

**VERDICT: NEEDS_CHANGES**

1. **Type Safety Disaster** (Line 1)
   `data: any` - Oh great, just accept ANYTHING. What could go wrong? 
   Validate the input!

2. **Null Pointer Roulette** (Line 2)
   What if user doesn't exist? `user` will be null. Boom. 💥

3. **Mutation Madness** (Line 3)
   You're mutating the user object directly. Not immutable. Not safe.

4. **Error Handling? LOL** (Entire function)
   Zero error handling. DB could fail, network could timeout. You'd never know.

5. **Test Coverage is a Joke** (tests)
   ONE test. Happy path only. Where are the tests for:
   - Invalid userId?
   - Missing user?
   - Invalid data?
   - Database errors?

FIX THIS BEFORE I EVEN LOOK AT IT AGAIN.
```

### After Adversarial Review

```typescript
// Improved code
interface ProfileUpdate {
  name?: string;
  email?: string;
}

const ProfileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
});

async function updateUserProfile(
  userId: string,
  data: unknown
): Promise<Result<User>> {
  try {
    // Validate input
    if (!userId || typeof userId !== 'string') {
      return { error: 'Invalid user ID' };
    }
    
    const validationResult = ProfileUpdateSchema.safeParse(data);
    if (!validationResult.success) {
      return { error: 'Invalid profile data', details: validationResult.error };
    }
    
    // Check user exists
    const user = await db.users.find(userId);
    if (!user) {
      return { error: 'User not found' };
    }
    
    // Immutable update
    const updatedUser = {
      ...user,
      profile: { ...user.profile, ...validationResult.data },
    };
    
    const saved = await db.users.save(updatedUser);
    return { success: true, data: saved };
    
  } catch (error) {
    logger.error('Failed to update user profile', { userId, error });
    return { error: 'Failed to update profile' };
  }
}

// Comprehensive tests
describe('updateUserProfile', () => {
  // Error cases first
  it('returns error for invalid userId', async () => {
    const result = await updateUserProfile('', { name: 'Alice' });
    expect(result.error).toBeTruthy();
  });
  
  it('returns error for invalid data', async () => {
    const result = await updateUserProfile('123', { name: '' });
    expect(result.error).toBeTruthy();
  });
  
  it('returns error for non-existent user', async () => {
    const result = await updateUserProfile('nonexistent', { name: 'Alice' });
    expect(result.error).toBe('User not found');
  });
  
  it('handles database errors', async () => {
    jest.spyOn(db.users, 'save').mockRejectedValue(new Error('DB error'));
    const result = await updateUserProfile('123', { name: 'Alice' });
    expect(result.error).toBe('Failed to update profile');
  });
  
  // Happy path
  it('updates profile successfully', async () => {
    const result = await updateUserProfile('123', { name: 'Alice' });
    expect(result.success).toBe(true);
    expect(result.data.profile.name).toBe('Alice');
  });
});
```

### Sarcasmotron Re-Review

```markdown
## SARCASMOTRON: Okay Fine, This is Actually Good

**VERDICT: APPROVED**

- Input validation ✅
- Type safety ✅
- Error handling ✅
- Null checks ✅
- Immutability ✅
- Comprehensive tests ✅

I tried to find something wrong. I really did. But this is solid.

APPROVED. (I hate admitting this)
```

---

## Conclusion

**Adversarial Review** is a powerful technique for catching issues that slip past traditional review:

- **Fresh context** prevents relationship drift
- **Hostile stance** catches assumptions
- **Zero tolerance** enforces quality
- **Hallucination detection** validates code excellence

Use it for critical code, high-risk changes, or when you need confidence that code is truly solid.

**Remember:** The goal isn't to be mean—it's to be thorough. Sarcasm is just the delivery mechanism for uncompromising quality standards.

---

**Next Steps:**
1. Read the [AI Review Checklist](./ai-review-checklist.md)
2. Try adversarial review on your next PR
3. Track hallucination rate (high = good code!)
4. Integrate into CI/CD for critical paths
