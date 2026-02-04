# Error Prevention API Reference

Quick reference guide for error prevention patterns. For comprehensive explanation and principles, see [SKILL.md](../../SKILL.md).

## Table of Contents

- [Input Validation](#input-validation)
- [Error Handling](#error-handling)
- [Null Safety](#null-safety)
- [Async Operations](#async-operations)
- [Type Safety](#type-safety)
- [Boundary Checks](#boundary-checks)
- [Resource Management](#resource-management)
- [Result Types](#result-types)
- [Common Utilities](#common-utilities)

---

## Input Validation

### String Validation

```typescript
function validateUserId(id: string): void {
  if (!id || typeof id !== 'string') {
    throw new ValidationError('Invalid user ID: must be non-empty string');
  }
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    throw new ValidationError('Invalid user ID format: alphanumeric and hyphens only');
  }
}
```

### Email Validation

```typescript
function validateEmail(email: string): void {
  if (!email || typeof email !== 'string') {
    throw new ValidationError('Email is required');
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format');
  }
}
```

### Numeric Range Validation

```typescript
function validateAge(age: number): void {
  if (typeof age !== 'number' || isNaN(age)) {
    throw new ValidationError('Age must be a number');
  }
  if (age < 0 || age > 150) {
    throw new ValidationError('Age must be between 0 and 150');
  }
}
```

### Schema Validation (Using Zod)

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  age: z.number().min(0).max(150),
  role: z.enum(['admin', 'user', 'guest']),
});

type User = z.infer<typeof UserSchema>;

function validateUser(data: unknown): User {
  return UserSchema.parse(data); // Throws ZodError if invalid
}

// Safe variant that returns Result
function validateUserSafe(data: unknown): Result<User> {
  const result = UserSchema.safeParse(data);
  if (result.success) {
    return { data: result.data };
  }
  return { error: result.error.message };
}
```

### Pagination Parameters

```typescript
interface PaginationParams {
  page: number;
  limit: number;
}

function validatePagination(page: unknown, limit: unknown): PaginationParams {
  const pageNum = Number(page);
  const limitNum = Number(limit);
  
  if (!Number.isInteger(pageNum) || pageNum < 1) {
    throw new ValidationError('Page must be a positive integer');
  }
  
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 100) {
    throw new ValidationError('Limit must be between 1 and 100');
  }
  
  return { page: pageNum, limit: limitNum };
}
```

---

## Error Handling

### Custom Error Classes

```typescript
class ApplicationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public cause?: unknown
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

class ValidationError extends ApplicationError {
  constructor(message: string, cause?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, cause);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends ApplicationError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

class UnauthorizedError extends ApplicationError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}
```

### Try-Catch with Logging

```typescript
import { logger } from './logger';

async function criticalOperation(id: string): Promise<void> {
  try {
    await performOperation(id);
  } catch (e) {
    logger.error('Critical operation failed', {
      error: e,
      id,
      stack: e instanceof Error ? e.stack : undefined,
    });
    throw new ApplicationError(
      'Operation failed',
      'OPERATION_FAILED',
      500,
      e
    );
  }
}
```

### Error Boundary Pattern (Express)

```typescript
import { Request, Response, NextFunction } from 'express';

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Usage
app.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await getUser(req.params.id);
  res.json(user);
}));

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof ApplicationError) {
    return res.status(err.statusCode).json({
      error: err.code,
      message: err.message,
    });
  }
  
  logger.error('Unhandled error', { error: err });
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
});
```

---

## Null Safety

### Optional Chaining

```typescript
// Safe nested property access
const userName = user?.profile?.name ?? 'Unknown';

// Safe function call
const result = config?.validate?.();

// Safe array access
const firstItem = items?.[0];
```

### Nullish Coalescing

```typescript
// Use ?? for null/undefined, not ||
const port = config.port ?? 3000; // Only uses 3000 if port is null/undefined
const count = config.count ?? 0;  // Preserves 0, unlike ||
```

### Type Guards

```typescript
function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'email' in value
  );
}

function processValue(value: unknown): void {
  if (isUser(value)) {
    // TypeScript knows value is User here
    console.log(value.email);
  }
}
```

### Assertion Functions

```typescript
function assertDefined<T>(value: T | null | undefined, name: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(`${name} is required but was ${value}`);
  }
}

function processUser(user: User | null): void {
  assertDefined(user, 'user');
  // TypeScript knows user is not null here
  console.log(user.email);
}
```

---

## Async Operations

### Timeout Pattern

```typescript
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

// Usage
const data = await withTimeout(fetch(url), 5000);
```

### Abort Controller

```typescript
async function fetchWithAbort(url: string, timeoutMs: number = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}
```

### Retry Logic

```typescript
async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoff?: boolean;
  } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const delayMs = options.delayMs ?? 1000;
  const backoff = options.backoff ?? true;
  
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      
      if (attempt < maxAttempts) {
        const delay = backoff ? delayMs * Math.pow(2, attempt - 1) : delayMs;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`Failed after ${maxAttempts} attempts: ${lastError}`);
}

// Usage
const data = await retry(() => fetchData(url), {
  maxAttempts: 3,
  delayMs: 1000,
  backoff: true,
});
```

### Promise.allSettled Pattern

```typescript
async function processMultipleItems(items: string[]): Promise<ProcessResult[]> {
  const promises = items.map(item => processItem(item));
  const results = await Promise.allSettled(promises);
  
  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return { success: true, data: result.value };
    } else {
      logger.error(`Failed to process item ${items[index]}`, { error: result.reason });
      return { success: false, error: result.reason };
    }
  });
}
```

---

## Type Safety

### Discriminated Unions

```typescript
// State machine pattern
type AsyncState<T, E = Error> =
  | { status: 'idle' }
  | { status: 'loading'; startedAt: number }
  | { status: 'success'; data: T; completedAt: number }
  | { status: 'error'; error: E; failedAt: number };

function handleState<T>(state: AsyncState<T>): void {
  switch (state.status) {
    case 'idle':
      // No data or error available
      break;
    case 'loading':
      // Only startedAt is available
      console.log(`Loading since ${state.startedAt}`);
      break;
    case 'success':
      // Only data is available, no error possible
      console.log(state.data);
      break;
    case 'error':
      // Only error is available, no data possible
      console.error(state.error);
      break;
  }
}
```

### Branded Types

```typescript
// Prevent mixing up different ID types
type UserId = string & { readonly __brand: 'UserId' };
type PostId = string & { readonly __brand: 'PostId' };

function createUserId(id: string): UserId {
  return id as UserId;
}

function createPostId(id: string): PostId {
  return id as PostId;
}

function getUser(id: UserId): User { /* ... */ }
function getPost(id: PostId): Post { /* ... */ }

const userId = createUserId('user-123');
const postId = createPostId('post-456');

getUser(userId); // ✅ OK
getUser(postId); // ❌ Type error: PostId not assignable to UserId
```

### Literal Types

```typescript
// Instead of string
type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

// Instead of number
type Port = 3000 | 3001 | 8080;

// Instead of boolean (when you need more states)
type FeatureFlag = 'enabled' | 'disabled' | 'beta';
```

### Unknown vs Any

```typescript
// ❌ Never use any
function process(data: any) {
  return data.value; // No type safety
}

// ✅ Use unknown + type guards
function process(data: unknown): string {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Data must be an object');
  }
  
  if (!('value' in data)) {
    throw new Error('Data must have a value property');
  }
  
  const { value } = data;
  if (typeof value !== 'string') {
    throw new Error('Value must be a string');
  }
  
  return value;
}
```

---

## Boundary Checks

### Array Access

```typescript
function getItemAt<T>(array: T[], index: number): T {
  if (index < 0 || index >= array.length) {
    throw new RangeError(`Index ${index} out of bounds [0, ${array.length})`);
  }
  return array[index];
}

// Safe variant
function getItemAtSafe<T>(array: T[], index: number): T | undefined {
  if (index < 0 || index >= array.length) {
    return undefined;
  }
  return array[index];
}
```

### String Slicing

```typescript
function safeSlice(str: string, start: number, end?: number): string {
  if (start < 0 || start > str.length) {
    throw new RangeError(`Start index ${start} out of bounds [0, ${str.length}]`);
  }
  
  if (end !== undefined && (end < start || end > str.length)) {
    throw new RangeError(`End index ${end} invalid`);
  }
  
  return str.slice(start, end);
}
```

### Numeric Range

```typescript
function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new Error('min must be less than or equal to max');
  }
  return Math.min(Math.max(value, min), max);
}

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}
```

---

## Resource Management

### File Handling

```typescript
import * as fs from 'fs/promises';

async function processFile(path: string): Promise<string> {
  const file = await fs.open(path, 'r');
  try {
    const content = await file.readFile('utf-8');
    return content;
  } finally {
    await file.close(); // Always executed
  }
}

// Using new Explicit Resource Management (TypeScript 5.2+)
async function processFileWithUsing(path: string): Promise<string> {
  await using file = await fs.open(path, 'r');
  const content = await file.readFile('utf-8');
  return content; // file.close() called automatically
}
```

### Timer Cleanup

```typescript
class IntervalTask {
  private intervalId: NodeJS.Timeout | null = null;
  
  start(fn: () => void, ms: number): void {
    if (this.intervalId !== null) {
      throw new Error('Task already started');
    }
    this.intervalId = setInterval(fn, ms);
  }
  
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
```

### Event Listener Cleanup

```typescript
class EventManager {
  private listeners: Array<{ target: EventTarget; type: string; handler: EventListener }> = [];
  
  addEventListener(target: EventTarget, type: string, handler: EventListener): void {
    target.addEventListener(type, handler);
    this.listeners.push({ target, type, handler });
  }
  
  cleanup(): void {
    for (const { target, type, handler } of this.listeners) {
      target.removeEventListener(type, handler);
    }
    this.listeners = [];
  }
}
```

### Abort Signal Pattern

```typescript
async function runWithCancellation(
  fn: (signal: AbortSignal) => Promise<void>,
  timeoutMs?: number
): Promise<void> {
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | undefined;
  
  if (timeoutMs) {
    timeout = setTimeout(() => controller.abort(), timeoutMs);
  }
  
  try {
    await fn(controller.signal);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

// Usage
await runWithCancellation(async (signal) => {
  const response = await fetch(url, { signal });
  const data = await response.json();
  return data;
}, 5000);
```

---

## Result Types

### Basic Result Type

```typescript
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

function divide(a: number, b: number): Result<number> {
  if (b === 0) {
    return { success: false, error: new Error('Division by zero') };
  }
  return { success: true, data: a / b };
}

// Usage with type narrowing
const result = divide(10, 2);
if (result.success) {
  console.log(result.data); // TypeScript knows data exists
} else {
  console.error(result.error); // TypeScript knows error exists
}
```

### Option Type (Rust-inspired)

```typescript
type Option<T> =
  | { some: true; value: T }
  | { some: false };

function findUser(id: string): Option<User> {
  const user = database.find(id);
  if (user) {
    return { some: true, value: user };
  }
  return { some: false };
}

// Usage
const userOption = findUser('123');
if (userOption.some) {
  console.log(userOption.value.email);
}
```

### Railway-Oriented Programming

```typescript
class Result<T, E = Error> {
  private constructor(
    private readonly value?: T,
    private readonly error?: E,
    private readonly isSuccess?: boolean
  ) {}
  
  static ok<T>(value: T): Result<T, never> {
    return new Result(value, undefined, true);
  }
  
  static err<E>(error: E): Result<never, E> {
    return new Result(undefined, error, false);
  }
  
  map<U>(fn: (value: T) => U): Result<U, E> {
    if (this.isSuccess && this.value !== undefined) {
      return Result.ok(fn(this.value));
    }
    return Result.err(this.error!);
  }
  
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    if (this.isSuccess && this.value !== undefined) {
      return fn(this.value);
    }
    return Result.err(this.error!);
  }
  
  unwrap(): T {
    if (!this.isSuccess) {
      throw this.error;
    }
    return this.value!;
  }
  
  unwrapOr(defaultValue: T): T {
    return this.isSuccess ? this.value! : defaultValue;
  }
}

// Usage
const result = Result.ok(5)
  .map(x => x * 2)
  .flatMap(x => x > 0 ? Result.ok(x) : Result.err('Negative'))
  .map(x => x.toString());
```

---

## Common Utilities

### Environment Variable Validation

```typescript
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  
  const num = Number(value);
  if (isNaN(num)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${value}`);
  }
  return num;
}

// Validate all config at startup
const config = {
  port: getEnvNumber('PORT', 3000),
  databaseUrl: requireEnv('DATABASE_URL'),
  apiKey: requireEnv('API_KEY'),
  nodeEnv: getEnv('NODE_ENV', 'development'),
} as const;
```

### Safe JSON Parse

```typescript
function parseJSON<T>(text: string): Result<T> {
  try {
    if (!text || text.trim() === '') {
      return { success: false, error: new Error('Empty JSON string') };
    }
    const data = JSON.parse(text);
    return { success: true, data };
  } catch (e) {
    return {
      success: false,
      error: new Error(`Invalid JSON: ${e instanceof Error ? e.message : 'Unknown error'}`),
    };
  }
}

// With schema validation
function parseJSONWithSchema<T>(text: string, schema: z.ZodSchema<T>): Result<T> {
  const parseResult = parseJSON<unknown>(text);
  if (!parseResult.success) {
    return parseResult;
  }
  
  const validationResult = schema.safeParse(parseResult.data);
  if (validationResult.success) {
    return { success: true, data: validationResult.data };
  }
  
  return { success: false, error: new Error(validationResult.error.message) };
}
```

### Debounce with Cleanup

```typescript
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number
): T & { cancel: () => void } {
  let timeoutId: NodeJS.Timeout | null = null;
  
  const debounced = ((...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delayMs);
  }) as T & { cancel: () => void };
  
  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  
  return debounced;
}

// Usage
const debouncedSearch = debounce((query: string) => {
  console.log(`Searching for: ${query}`);
}, 300);

// Cleanup
window.addEventListener('beforeunload', () => {
  debouncedSearch.cancel();
});
```

### Exhaustive Switch

```typescript
function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`);
}

type Shape = 
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; size: number }
  | { kind: 'rectangle'; width: number; height: number };

function getArea(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return Math.PI * shape.radius ** 2;
    case 'square':
      return shape.size ** 2;
    case 'rectangle':
      return shape.width * shape.height;
    default:
      // If a new shape is added, TypeScript will error here
      return assertNever(shape);
  }
}
```

### Deep Freeze

```typescript
function deepFreeze<T>(obj: T): Readonly<T> {
  Object.freeze(obj);
  
  Object.getOwnPropertyNames(obj).forEach(prop => {
    const value = (obj as any)[prop];
    if (value && typeof value === 'object') {
      deepFreeze(value);
    }
  });
  
  return obj;
}

// Usage
const config = deepFreeze({
  api: {
    baseUrl: 'https://api.example.com',
    timeout: 5000,
  },
});

// config.api.timeout = 10000; // ❌ Error in strict mode
```

---

## Quick Decision Tree

**When to throw vs return Result:**
- **Throw**: Programming errors (null pointer, invalid state)
- **Return Result**: Expected failures (network error, validation failure)

**When to use optional chaining:**
- Use `?.` when absence is **expected** (optional field)
- Use assertion when absence is **impossible** (after validation)

**When to validate:**
- **Startup**: Environment variables, configuration
- **Boundaries**: API inputs, file contents, user data
- **Not needed**: Internal functions with validated inputs

**When to use branded types:**
- Different ID types that must not be mixed (UserId vs PostId)
- Security-sensitive values (Token, Password)
- Units that could be confused (Meters vs Feet)

---

## Related Resources

- [SKILL.md](../../SKILL.md) - Complete error prevention guide with principles
- [TypeScript Handbook: Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [Zod Documentation](https://zod.dev/)
- [Effect: A Fully-Fledged Functional Effect System](https://effect.website/)

---

## Contributing

Found a useful pattern not listed here? Add it with:
1. Clear example code
2. When to use it
3. Common pitfalls to avoid
4. Link to relevant section in SKILL.md
