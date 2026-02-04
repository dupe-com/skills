# Testing Strategies: Error Coverage

## Table of Contents

1. [Testing Pyramid](#testing-pyramid)
2. [Test Error Cases First](#test-error-cases-first)
3. [Property-Based Testing](#property-based-testing)
4. [Mutation Testing](#mutation-testing)
5. [Contract Testing](#contract-testing)
6. [Integration Testing with Error Scenarios](#integration-testing-with-error-scenarios)
7. [Async Testing Patterns](#async-testing-patterns)
8. [Mocking and Stubbing](#mocking-and-stubbing)
9. [Test Data Builders](#test-data-builders)
10. [Snapshot Testing](#snapshot-testing)

---

## Testing Pyramid

### Test Distribution Strategy

```
        /\
       /  \
      / E2E \        10% - End-to-end tests (slow, brittle)
     /______\
    /        \
   /Integration\    20% - Integration tests (medium speed)
  /____________\
 /              \
/  Unit Tests    \  70% - Unit tests (fast, reliable)
/________________\
```

**Focus:** Most tests should be unit tests. Test error conditions at the unit level where they're easier to reproduce.

---

## Test Error Cases First

### The Error-First Testing Pattern

```typescript
describe('parseAmount', () => {
  // 1. Test null/undefined inputs
  it('returns null for null input', () => {
    expect(parseAmount(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseAmount(undefined)).toBeNull();
  });

  // 2. Test invalid types
  it('returns null for non-string input', () => {
    expect(parseAmount(123 as any)).toBeNull();
    expect(parseAmount({} as any)).toBeNull();
    expect(parseAmount([] as any)).toBeNull();
  });

  // 3. Test empty/whitespace
  it('returns null for empty string', () => {
    expect(parseAmount('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseAmount('   ')).toBeNull();
  });

  // 4. Test invalid formats
  it('returns null for invalid format', () => {
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('$')).toBeNull();
    expect(parseAmount('12.34.56')).toBeNull();
  });

  // 5. Test boundary conditions
  it('returns null for negative amounts', () => {
    expect(parseAmount('-10')).toBeNull();
  });

  it('returns null for zero', () => {
    expect(parseAmount('0')).toBeNull();
  });

  // 6. Finally, test happy paths
  it('parses valid dollar amount', () => {
    expect(parseAmount('$10.00')).toBe(10.00);
  });

  it('parses amount without dollar sign', () => {
    expect(parseAmount('10.00')).toBe(10.00);
  });

  it('parses amount with commas', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56);
  });
});
```

### Error Testing Checklist

For every function, test:

- [ ] Null inputs
- [ ] Undefined inputs
- [ ] Empty strings/arrays/objects
- [ ] Invalid types (use `as any` to bypass TypeScript)
- [ ] Boundary values (min, max, zero, negative)
- [ ] Invalid formats
- [ ] Unexpected combinations
- [ ] Race conditions (async)
- [ ] Resource exhaustion (memory, connections)
- [ ] Network failures (timeouts, errors)

---

## Property-Based Testing

### What is Property-Based Testing?

Instead of writing specific test cases, define **properties** that should always be true, then generate hundreds of random inputs.

### Using fast-check

```typescript
import fc from 'fast-check';

// Property: Parsing a stringified number should return the original number
describe('parseAmount properties', () => {
  it('roundtrip: parse(format(n)) === n', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0.01, max: 1000000 }),
        (amount) => {
          const formatted = formatAmount(amount);
          const parsed = parseAmount(formatted);
          expect(parsed).toBeCloseTo(amount, 2);
        }
      )
    );
  });

  it('never returns negative', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = parseAmount(input);
        return result === null || result >= 0;
      })
    );
  });

  it('is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const first = parseAmount(input);
        const second = parseAmount(input);
        expect(first).toBe(second);
      })
    );
  });
});
```

### Common Properties to Test

**Invariants (always true):**

```typescript
// Array operations
it('filter never increases length', () => {
  fc.assert(
    fc.property(fc.array(fc.integer()), (arr) => {
      const filtered = arr.filter(() => Math.random() > 0.5);
      return filtered.length <= arr.length;
    })
  );
});

// Math operations
it('abs(x) >= 0', () => {
  fc.assert(
    fc.property(fc.float(), (x) => {
      return Math.abs(x) >= 0;
    })
  );
});

// String operations
it('trim does not add characters', () => {
  fc.assert(
    fc.property(fc.string(), (str) => {
      return str.trim().length <= str.length;
    })
  );
});
```

**Roundtrip Properties:**

```typescript
// Encode/decode
it('decode(encode(x)) === x', () => {
  fc.assert(
    fc.property(fc.string(), (str) => {
      const encoded = btoa(str);
      const decoded = atob(encoded);
      expect(decoded).toBe(str);
    })
  );
});

// Serialize/deserialize
it('parse(stringify(x)) deep equals x', () => {
  fc.assert(
    fc.property(fc.object(), (obj) => {
      const json = JSON.stringify(obj);
      const parsed = JSON.parse(json);
      expect(parsed).toEqual(obj);
    })
  );
});
```

**Idempotence:**

```typescript
// Applying operation twice gives same result as once
it('sort is idempotent', () => {
  fc.assert(
    fc.property(fc.array(fc.integer()), (arr) => {
      const sorted1 = [...arr].sort();
      const sorted2 = [...sorted1].sort();
      expect(sorted2).toEqual(sorted1);
    })
  );
});
```

---

## Mutation Testing

### What is Mutation Testing?

Mutation testing modifies your code (e.g., changes `>` to `>=`) to see if tests catch the bug. If tests still pass, you have weak coverage.

### Using Stryker

```bash
npm install --save-dev @stryker-mutator/core @stryker-mutator/vitest-runner
```

```javascript
// stryker.conf.json
{
  "mutator": "typescript",
  "testRunner": "vitest",
  "coverageAnalysis": "perTest",
  "mutate": [
    "src/**/*.ts",
    "!src/**/*.test.ts"
  ]
}
```

### Example: Weak Test Exposed by Mutation

```typescript
// Production code
function isPositive(n: number): boolean {
  return n > 0; // Mutated to: n >= 0
}

// ❌ BAD: Test doesn't catch mutation
it('returns true for positive numbers', () => {
  expect(isPositive(5)).toBe(true);
});

// ✅ GOOD: Test catches mutation
it('returns true for positive numbers', () => {
  expect(isPositive(5)).toBe(true);
  expect(isPositive(0.1)).toBe(true);
});

it('returns false for zero', () => {
  expect(isPositive(0)).toBe(false); // Catches >= mutation
});

it('returns false for negative numbers', () => {
  expect(isPositive(-5)).toBe(false);
});
```

---

## Contract Testing

### API Contract Testing with Pact

```typescript
import { PactV3, MatchersV3 } from '@pact-foundation/pact';

describe('User API Contract', () => {
  const provider = new PactV3({
    consumer: 'WebApp',
    provider: 'UserService',
  });

  it('gets a user by ID', async () => {
    await provider
      .given('user 123 exists')
      .uponReceiving('a request for user 123')
      .withRequest({
        method: 'GET',
        path: '/users/123',
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          id: '123',
          name: MatchersV3.string('John Doe'),
          email: MatchersV3.regex('.*@.*', 'john@example.com'),
        },
      });

    await provider.executeTest(async (mockServer) => {
      const response = await fetch(`${mockServer.url}/users/123`);
      const user = await response.json();

      expect(user.id).toBe('123');
      expect(user.name).toBeTruthy();
      expect(user.email).toMatch(/.+@.+/);
    });
  });

  // Test error scenarios
  it('returns 404 for non-existent user', async () => {
    await provider
      .given('user 999 does not exist')
      .uponReceiving('a request for user 999')
      .withRequest({
        method: 'GET',
        path: '/users/999',
      })
      .willRespondWith({
        status: 404,
        body: {
          error: 'User not found',
        },
      });

    await provider.executeTest(async (mockServer) => {
      const response = await fetch(`${mockServer.url}/users/999`);
      expect(response.status).toBe(404);
    });
  });
});
```

---

## Integration Testing with Error Scenarios

### Database Error Testing

```typescript
describe('UserRepository integration', () => {
  let db: Database;

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  // Happy path
  it('creates a user', async () => {
    const user = await db.users.create({
      name: 'John',
      email: 'john@example.com',
    });

    expect(user.id).toBeTruthy();
  });

  // Error: Duplicate email
  it('throws on duplicate email', async () => {
    await db.users.create({
      name: 'John',
      email: 'duplicate@example.com',
    });

    await expect(
      db.users.create({
        name: 'Jane',
        email: 'duplicate@example.com',
      })
    ).rejects.toThrow('Duplicate email');
  });

  // Error: Foreign key violation
  it('throws when referencing non-existent user', async () => {
    await expect(
      db.posts.create({
        userId: 'non-existent',
        title: 'Test',
      })
    ).rejects.toThrow('User not found');
  });

  // Error: Transaction rollback
  it('rolls back transaction on error', async () => {
    const tx = await db.beginTransaction();

    try {
      await tx.users.create({ name: 'John', email: 'john@test.com' });
      await tx.users.create({ name: 'Jane', email: 'john@test.com' }); // Duplicate
      await tx.commit();
    } catch (error) {
      await tx.rollback();
    }

    // Verify rollback - no users created
    const users = await db.users.findAll();
    expect(users).toHaveLength(0);
  });

  // Error: Connection loss
  it('retries on connection loss', async () => {
    const spy = vi.spyOn(db, 'query');
    
    // Simulate connection loss on first attempt
    spy.mockRejectedValueOnce(new Error('Connection lost'));
    spy.mockResolvedValueOnce([{ id: '1', name: 'John' }]);

    const result = await db.users.findById('1', { retry: true });
    
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.name).toBe('John');
  });
});
```

### HTTP Error Testing

```typescript
describe('API integration', () => {
  let server: Server;

  beforeAll(() => {
    server = startTestServer();
  });

  afterAll(() => {
    server.close();
  });

  // Error: Invalid input
  it('returns 400 for invalid request', async () => {
    const response = await fetch(`${server.url}/users`, {
      method: 'POST',
      body: JSON.stringify({ name: '' }), // Invalid: empty name
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('name');
  });

  // Error: Unauthorized
  it('returns 401 without auth token', async () => {
    const response = await fetch(`${server.url}/protected`);
    expect(response.status).toBe(401);
  });

  // Error: Rate limiting
  it('returns 429 when rate limited', async () => {
    // Make multiple requests quickly
    const promises = Array.from({ length: 100 }, () =>
      fetch(`${server.url}/api/endpoint`)
    );

    const responses = await Promise.all(promises);
    const rateLimited = responses.some((r) => r.status === 429);

    expect(rateLimited).toBe(true);
  });

  // Error: Timeout
  it('times out on slow endpoint', async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);

    await expect(
      fetch(`${server.url}/slow-endpoint`, {
        signal: controller.signal,
      })
    ).rejects.toThrow('abort');

    clearTimeout(timeout);
  });
});
```

---

## Async Testing Patterns

### Testing Promises

```typescript
// ✅ GOOD: Use async/await
it('fetches user data', async () => {
  const user = await fetchUser('123');
  expect(user.name).toBe('John');
});

// ✅ GOOD: Test rejection
it('throws on invalid ID', async () => {
  await expect(fetchUser('invalid')).rejects.toThrow('Invalid ID');
});

// ❌ BAD: Forgetting await (test passes even if promise rejects)
it('fetches user data', () => {
  fetchUser('123').then(user => {
    expect(user.name).toBe('John');
  });
  // Test ends before promise resolves!
});
```

### Testing Race Conditions

```typescript
describe('race conditions', () => {
  it('handles concurrent updates correctly', async () => {
    const counter = new Counter();

    // Start 100 concurrent increments
    const promises = Array.from({ length: 100 }, () =>
      counter.increment()
    );

    await Promise.all(promises);

    // Counter should be exactly 100 (not less due to race condition)
    expect(counter.value).toBe(100);
  });

  it('handles request cancellation', async () => {
    const controller = new AbortController();
    
    const promise = fetchWithCancel('/slow', controller.signal);
    
    // Cancel after 10ms
    setTimeout(() => controller.abort(), 10);

    await expect(promise).rejects.toThrow('aborted');
  });
});
```

### Testing Retry Logic

```typescript
describe('retry logic', () => {
  it('retries on failure', async () => {
    const mockFn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(mockFn, { maxAttempts: 3 });

    expect(mockFn).toHaveBeenCalledTimes(3);
    expect(result).toBe('success');
  });

  it('gives up after max attempts', async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      withRetry(mockFn, { maxAttempts: 3 })
    ).rejects.toThrow('always fails');

    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('uses exponential backoff', async () => {
    const delays: number[] = [];
    const mockDelay = vi.fn((ms) => {
      delays.push(ms);
      return Promise.resolve();
    });

    const mockFn = vi.fn().mockRejectedValue(new Error('fail'));

    await withRetry(mockFn, {
      maxAttempts: 4,
      initialDelay: 100,
      backoffMultiplier: 2,
    }).catch(() => {});

    // Delays should be ~100, ~200, ~400 (exponential)
    expect(delays[0]).toBeCloseTo(100, -1);
    expect(delays[1]).toBeCloseTo(200, -1);
    expect(delays[2]).toBeCloseTo(400, -1);
  });
});
```

---

## Mocking and Stubbing

### Test Doubles: Stubs vs Mocks vs Spies

```typescript
// Stub: Provides canned responses
const stubUserService = {
  getUser: () => Promise.resolve({ id: '1', name: 'John' }),
};

// Mock: Verifies interactions
const mockLogger = {
  error: vi.fn(),
};

// Later in test:
expect(mockLogger.error).toHaveBeenCalledWith('Error message');

// Spy: Wraps real object to observe calls
const spy = vi.spyOn(realObject, 'method');
spy.mockReturnValue('mocked');
expect(spy).toHaveBeenCalled();
```

### Mocking External Services

```typescript
describe('UserService with mocked dependencies', () => {
  let userService: UserService;
  let mockDb: Database;
  let mockLogger: Logger;

  beforeEach(() => {
    mockDb = {
      query: vi.fn(),
    } as any;

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
    } as any;

    userService = new UserService(mockDb, mockLogger);
  });

  it('logs error when database fails', async () => {
    mockDb.query.mockRejectedValue(new Error('DB Error'));

    await expect(userService.getUser('123')).rejects.toThrow();

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('DB Error'),
      expect.any(Object)
    );
  });

  it('queries database with correct parameters', async () => {
    mockDb.query.mockResolvedValue([{ id: '123', name: 'John' }]);

    await userService.getUser('123');

    expect(mockDb.query).toHaveBeenCalledWith(
      'SELECT * FROM users WHERE id = ?',
      ['123']
    );
  });
});
```

### Mocking Time

```typescript
describe('time-dependent tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('expires tokens after 1 hour', () => {
    const token = createToken();
    expect(token.isValid()).toBe(true);

    // Fast-forward 1 hour
    vi.advanceTimersByTime(60 * 60 * 1000);

    expect(token.isValid()).toBe(false);
  });

  it('retries with delay', async () => {
    const mockFn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    const promise = withRetry(mockFn, { initialDelay: 1000 });

    // First call fails immediately
    await vi.runOnlyPendingTimersAsync();
    expect(mockFn).toHaveBeenCalledTimes(1);

    // Fast-forward delay
    vi.advanceTimersByTime(1000);
    await vi.runOnlyPendingTimersAsync();

    // Second call succeeds
    expect(mockFn).toHaveBeenCalledTimes(2);
    await expect(promise).resolves.toBe('success');
  });
});
```

---

## Test Data Builders

### Problem: Brittle Test Setup

```typescript
// ❌ BAD: Tests break when User type changes
it('creates a user', () => {
  const user = {
    id: '1',
    name: 'John',
    email: 'john@example.com',
    age: 30,
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    isActive: true,
    preferences: { theme: 'dark' },
    // ... 20 more fields
  };

  // Test uses only name and email
  expect(processUser(user)).toContain(user.name);
});
```

### Solution: Test Data Builders

```typescript
// ✅ GOOD: Builder pattern for test data
class UserBuilder {
  private user: Partial<User> = {
    id: 'test-id',
    name: 'Test User',
    email: 'test@example.com',
    age: 30,
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true,
    preferences: { theme: 'dark' },
  };

  withId(id: string): this {
    this.user.id = id;
    return this;
  }

  withName(name: string): this {
    this.user.name = name;
    return this;
  }

  withEmail(email: string): this {
    this.user.email = email;
    return this;
  }

  withRole(role: User['role']): this {
    this.user.role = role;
    return this;
  }

  inactive(): this {
    this.user.isActive = false;
    return this;
  }

  build(): User {
    return this.user as User;
  }
}

// Usage: Only specify what matters for the test
it('processes user name', () => {
  const user = new UserBuilder()
    .withName('John Doe')
    .build();

  expect(processUser(user)).toContain('John Doe');
});

it('rejects inactive users', () => {
  const user = new UserBuilder()
    .inactive()
    .build();

  expect(() => processUser(user)).toThrow('User is inactive');
});

it('handles admin role', () => {
  const admin = new UserBuilder()
    .withRole('admin')
    .build();

  expect(processUser(admin)).toContain('Admin:');
});
```

### Factory Functions

```typescript
// Alternative: Factory functions
function createTestUser(overrides?: Partial<User>): User {
  return {
    id: 'test-id',
    name: 'Test User',
    email: 'test@example.com',
    age: 30,
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true,
    preferences: { theme: 'dark' },
    ...overrides,
  };
}

// Usage
const user = createTestUser({ name: 'John', role: 'admin' });
```

---

## Snapshot Testing

### When to Use Snapshots

**✅ Good use cases:**

- Component rendering (React, Vue)
- API response structure
- Generated code output
- Error messages

**❌ Bad use cases:**

- Logic testing (use explicit assertions)
- Data with timestamps or random values
- Large, frequently changing data structures

### Snapshot Testing Example

```typescript
describe('ErrorFormatter', () => {
  it('formats validation error', () => {
    const error = new ValidationError('Invalid email', 'email', {
      value: 'not-an-email',
    });

    const formatted = formatError(error);

    expect(formatted).toMatchSnapshot();
  });

  // Inline snapshot (stored in test file)
  it('formats API error', () => {
    const error = new APIError('Not found', 404);

    expect(formatError(error)).toMatchInlineSnapshot(`
      {
        "code": 404,
        "message": "Not found",
        "type": "APIError",
      }
    `);
  });

  // Custom snapshot serializer
  expect.addSnapshotSerializer({
    test: (val) => val instanceof Date,
    serialize: (val: Date) => `Date<${val.toISOString()}>`,
  });
});
```

---

## Summary: Testing Checklist

- [ ] Write tests for error cases before happy paths
- [ ] Test null, undefined, empty inputs
- [ ] Test boundary conditions (min, max, zero)
- [ ] Use property-based testing for invariants
- [ ] Test async errors (rejections, timeouts, race conditions)
- [ ] Mock external dependencies
- [ ] Use test data builders to reduce brittleness
- [ ] Test retry logic and backoff strategies
- [ ] Test transaction rollbacks
- [ ] Use mutation testing to find weak tests
- [ ] Test error logging and monitoring
- [ ] Verify error messages are helpful

**Remember:** Good tests don't just verify success—they ensure failures are handled gracefully!
