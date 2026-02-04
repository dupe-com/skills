# Error Handling Patterns: Comprehensive Guide

## Table of Contents

1. [Error Types and When to Use Them](#error-types-and-when-to-use-them)
2. [Result Type Pattern](#result-type-pattern)
3. [Error Boundaries](#error-boundaries)
4. [Retry Strategies](#retry-strategies)
5. [Circuit Breaker Pattern](#circuit-breaker-pattern)
6. [Error Context and Stack Traces](#error-context-and-stack-traces)
7. [Logging Best Practices](#logging-best-practices)
8. [API Error Handling](#api-error-handling)
9. [Database Error Handling](#database-error-handling)
10. [File System Error Handling](#file-system-error-handling)

---

## Error Types and When to Use Them

### Creating Domain-Specific Error Classes

**Why:** Generic `Error` loses context. Domain-specific errors enable precise handling.

```typescript
// Base application error with cause chaining
export class ApplicationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = this.constructor.name;
    
    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// Validation errors (user input problems)
export class ValidationError extends ApplicationError {
  constructor(message: string, public readonly field?: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', { field, ...context });
  }
}

// Business logic violations
export class BusinessRuleError extends ApplicationError {
  constructor(message: string, public readonly rule: string, context?: Record<string, unknown>) {
    super(message, 'BUSINESS_RULE_VIOLATION', { rule, ...context });
  }
}

// External service failures
export class ExternalServiceError extends ApplicationError {
  constructor(
    message: string,
    public readonly service: string,
    public readonly statusCode?: number,
    options?: ErrorOptions
  ) {
    super(message, 'EXTERNAL_SERVICE_ERROR', { service, statusCode }, options);
  }
}

// Database errors
export class DatabaseError extends ApplicationError {
  constructor(message: string, public readonly operation: string, options?: ErrorOptions) {
    super(message, 'DATABASE_ERROR', { operation }, options);
  }
}

// Authentication/Authorization errors
export class AuthenticationError extends ApplicationError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUTHENTICATION_ERROR', context);
  }
}

export class AuthorizationError extends ApplicationError {
  constructor(
    message: string,
    public readonly resource: string,
    public readonly action: string
  ) {
    super(message, 'AUTHORIZATION_ERROR', { resource, action });
  }
}

// Rate limiting errors
export class RateLimitError extends ApplicationError {
  constructor(
    message: string,
    public readonly retryAfter?: number,
    context?: Record<string, unknown>
  ) {
    super(message, 'RATE_LIMIT_EXCEEDED', { retryAfter, ...context });
  }
}
```

### Using Custom Errors

```typescript
// ❌ BAD: Generic errors lose information
function transferMoney(from: Account, to: Account, amount: number) {
  if (amount <= 0) {
    throw new Error('Invalid amount');
  }
  if (from.balance < amount) {
    throw new Error('Insufficient funds');
  }
  // ...
}

// ✅ GOOD: Specific errors enable precise handling
function transferMoney(from: Account, to: Account, amount: number) {
  if (amount <= 0) {
    throw new ValidationError('Amount must be positive', 'amount', { amount });
  }
  
  if (from.balance < amount) {
    throw new BusinessRuleError(
      'Insufficient funds for transfer',
      'SUFFICIENT_BALANCE',
      { accountId: from.id, balance: from.balance, requested: amount }
    );
  }
  
  // ...
}

// Caller can handle specific errors
try {
  transferMoney(fromAccount, toAccount, amount);
} catch (error) {
  if (error instanceof ValidationError) {
    return { error: 'Please enter a valid amount', field: error.field };
  }
  if (error instanceof BusinessRuleError && error.rule === 'SUFFICIENT_BALANCE') {
    return { error: 'Insufficient funds. Please add money to your account.' };
  }
  // Re-throw unexpected errors
  throw error;
}
```

---

## Result Type Pattern

### The Problem with Throwing

Throwing exceptions has hidden control flow and isn't tracked by TypeScript:

```typescript
// ❌ BAD: Caller doesn't know this can fail
async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  return response.json(); // Can throw! Type system doesn't help
}

// Caller forgets error handling
const user = await fetchUser('123'); // 💥 Unhandled rejection
```

### Result Type Implementation

```typescript
// Result type: either success (data) or failure (error)
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

// Convenience constructors
export const Ok = <T>(data: T): Result<T, never> => ({ success: true, data });
export const Err = <E>(error: E): Result<never, E> => ({ success: false, error });

// ✅ GOOD: Explicit error handling in types
async function fetchUser(id: string): Promise<Result<User, string>> {
  try {
    const response = await fetch(`/api/users/${id}`);
    
    if (!response.ok) {
      return Err(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    return Ok(data);
  } catch (error) {
    return Err(`Network error: ${error.message}`);
  }
}

// Caller is forced to handle both cases
const result = await fetchUser('123');
if (result.success) {
  console.log('User:', result.data);
} else {
  console.error('Error:', result.error);
}
```

### Result Type Utilities

```typescript
// Map: Transform success value
export function mapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  return result.success ? Ok(fn(result.data)) : result;
}

// Chain: Combine multiple Results
export function chainResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return result.success ? fn(result.data) : result;
}

// Collect: Convert array of Results to Result of array
export function collectResults<T, E>(
  results: Result<T, E>[]
): Result<T[], E[]> {
  const errors: E[] = [];
  const values: T[] = [];
  
  for (const result of results) {
    if (result.success) {
      values.push(result.data);
    } else {
      errors.push(result.error);
    }
  }
  
  return errors.length > 0 ? Err(errors) : Ok(values);
}

// Usage example
const userResult = await fetchUser('123');
const emailResult = mapResult(userResult, (user) => user.email);

if (emailResult.success) {
  await sendEmail(emailResult.data);
}
```

---

## Error Boundaries

### React Error Boundaries

```typescript
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error) => ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to error reporting service
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback?.(this.state.error) ?? (
        <div>
          <h1>Something went wrong</h1>
          <pre>{this.state.error.message}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

// Usage
<ErrorBoundary
  fallback={(error) => <ErrorFallback error={error} />}
  onError={(error, info) => logErrorToService(error, info)}
>
  <App />
</ErrorBoundary>
```

### Async Error Boundaries (for Suspense)

```typescript
// React doesn't catch async errors by default
// Workaround: Convert promise rejections to sync errors

export function useAsyncError() {
  const [, setError] = useState();
  
  return useCallback(
    (error: Error) => {
      setError(() => {
        throw error; // Re-throw in render phase
      });
    },
    [setError]
  );
}

// Usage in component
function AsyncComponent() {
  const throwError = useAsyncError();
  
  useEffect(() => {
    loadData().catch(throwError);
  }, [throwError]);
  
  // ...
}
```

---

## Retry Strategies

### Exponential Backoff with Jitter

```typescript
interface RetryOptions {
  maxAttempts: number;
  initialDelay: number; // milliseconds
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors?: (error: Error) => boolean;
}

const defaultRetryOptions: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...defaultRetryOptions, ...options };
  let lastError: Error;
  
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Check if error is retryable
      if (opts.retryableErrors && !opts.retryableErrors(lastError)) {
        throw lastError;
      }
      
      // Don't retry on last attempt
      if (attempt === opts.maxAttempts) {
        throw lastError;
      }
      
      // Calculate delay with exponential backoff
      let delay = opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt - 1);
      delay = Math.min(delay, opts.maxDelay);
      
      // Add jitter to prevent thundering herd
      if (opts.jitter) {
        delay = delay * (0.5 + Math.random() * 0.5);
      }
      
      console.log(`Retry attempt ${attempt}/${opts.maxAttempts} after ${delay}ms`);
      await sleep(delay);
    }
  }
  
  throw lastError!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Usage
const data = await withRetry(
  () => fetch('https://api.example.com/data').then(r => r.json()),
  {
    maxAttempts: 5,
    initialDelay: 1000,
    retryableErrors: (error) => {
      // Only retry on network errors or 5xx
      return error.message.includes('network') || error.message.includes('fetch');
    },
  }
);
```

### Retry with Timeout

```typescript
export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  timeout: number,
  retryOptions?: Partial<RetryOptions>
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Operation timed out after ${timeout}ms`)), timeout);
  });
  
  const retryPromise = withRetry(fn, retryOptions);
  
  return Promise.race([retryPromise, timeoutPromise]);
}
```

---

## Circuit Breaker Pattern

Prevent cascading failures when external service is down:

```typescript
enum CircuitState {
  CLOSED, // Normal operation
  OPEN,   // Service is down, fail fast
  HALF_OPEN, // Testing if service recovered
}

interface CircuitBreakerOptions {
  failureThreshold: number; // Failures before opening
  resetTimeout: number; // Time before attempting recovery (ms)
  monitoringPeriod: number; // Time window for failure counting (ms)
}

export class CircuitBreaker {
  private state = CircuitState.CLOSED;
  private failures = 0;
  private lastFailureTime = 0;
  private nextAttemptTime = 0;

  constructor(private options: CircuitBreakerOptions) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('Circuit breaker is OPEN. Service unavailable.');
      }
      // Try to recover
      this.state = CircuitState.HALF_OPEN;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = CircuitState.CLOSED;
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.options.resetTimeout;
      console.error(
        `Circuit breaker opened after ${this.failures} failures. ` +
        `Will retry at ${new Date(this.nextAttemptTime).toISOString()}`
      );
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}

// Usage
const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  monitoringPeriod: 10000, // 10 seconds
});

async function callExternalAPI() {
  return breaker.execute(async () => {
    const response = await fetch('https://api.example.com/data');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  });
}
```

---

## Error Context and Stack Traces

### Preserving Error Context

```typescript
// ❌ BAD: Loses original error
try {
  await database.query(sql);
} catch (error) {
  throw new Error('Database query failed'); // Stack trace lost!
}

// ✅ GOOD: Preserve cause chain
try {
  await database.query(sql);
} catch (error) {
  throw new DatabaseError('Failed to fetch users', 'query', { cause: error });
}

// ✅ BETTER: Add context at each layer
async function getUser(id: string): Promise<User> {
  try {
    return await database.query('SELECT * FROM users WHERE id = ?', [id]);
  } catch (error) {
    throw new DatabaseError('Failed to fetch user', 'query', {
      cause: error,
      context: { userId: id },
    });
  }
}

async function processUserRequest(req: Request): Promise<Response> {
  try {
    const user = await getUser(req.params.id);
    return { status: 200, data: user };
  } catch (error) {
    if (error instanceof DatabaseError) {
      // Log full error chain
      console.error('Request processing failed:', {
        error: error.message,
        cause: error.cause,
        context: error.context,
        stack: error.stack,
      });
      return { status: 500, error: 'Failed to fetch user' };
    }
    throw error;
  }
}
```

### Enhanced Error Logging

```typescript
interface ErrorLog {
  message: string;
  name: string;
  code?: string;
  stack?: string;
  cause?: ErrorLog;
  context?: Record<string, unknown>;
  timestamp: string;
}

function serializeError(error: Error): ErrorLog {
  const log: ErrorLog = {
    message: error.message,
    name: error.name,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  };

  if (error instanceof ApplicationError) {
    log.code = error.code;
    log.context = error.context;
  }

  // Recursively serialize cause chain
  if (error.cause instanceof Error) {
    log.cause = serializeError(error.cause);
  }

  return log;
}

// Usage
try {
  await riskyOperation();
} catch (error) {
  const errorLog = serializeError(error as Error);
  console.error('Operation failed:', JSON.stringify(errorLog, null, 2));
  // Send to error tracking service
  await trackError(errorLog);
}
```

---

## Logging Best Practices

### Structured Logging

```typescript
enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogContext {
  requestId?: string;
  userId?: string;
  operation?: string;
  duration?: number;
  [key: string]: unknown;
}

class Logger {
  constructor(private context: LogContext = {}) {}

  private log(level: LogLevel, message: string, data?: LogContext) {
    const logEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...this.context,
      ...data,
    };

    // In production, send to logging service
    console.log(JSON.stringify(logEntry));
  }

  debug(message: string, data?: LogContext) {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: LogContext) {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: LogContext) {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, error?: Error, data?: LogContext) {
    this.log(LogLevel.ERROR, message, {
      ...data,
      error: error ? serializeError(error) : undefined,
    });
  }

  child(context: LogContext): Logger {
    return new Logger({ ...this.context, ...context });
  }
}

// Usage
const logger = new Logger({ service: 'api' });

async function handleRequest(req: Request) {
  const requestLogger = logger.child({
    requestId: req.id,
    userId: req.user?.id,
  });

  requestLogger.info('Processing request', { path: req.path });

  try {
    const result = await processRequest(req);
    requestLogger.info('Request completed', { duration: req.duration });
    return result;
  } catch (error) {
    requestLogger.error('Request failed', error as Error, {
      duration: req.duration,
    });
    throw error;
  }
}
```

---

## API Error Handling

### HTTP Client with Comprehensive Error Handling

```typescript
export class APIError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly response?: unknown,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'APIError';
  }
}

export async function apiRequest<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    clearTimeout(timeout);

    // Handle HTTP errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new APIError(
        errorData?.message || `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        errorData
      );
    }

    // Parse response
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return await response.json();
    }

    return (await response.text()) as T;
  } catch (error) {
    clearTimeout(timeout);

    // Handle abort/timeout
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new APIError('Request timeout', 408, null, { cause: error });
    }

    // Handle network errors
    if (error instanceof TypeError) {
      throw new APIError('Network error', 0, null, { cause: error });
    }

    // Re-throw API errors
    if (error instanceof APIError) {
      throw error;
    }

    // Unknown error
    throw new APIError('Unknown error', 500, null, { cause: error as Error });
  }
}

// Usage with retry
const data = await withRetry(
  () => apiRequest<User>('/api/users/123'),
  {
    retryableErrors: (error) => {
      if (error instanceof APIError) {
        // Retry on 5xx or network errors
        return error.statusCode >= 500 || error.statusCode === 0;
      }
      return false;
    },
  }
);
```

---

## Database Error Handling

### Transaction Error Handling

```typescript
export async function withTransaction<T>(
  fn: (tx: Transaction) => Promise<T>
): Promise<Result<T, DatabaseError>> {
  const tx = await db.beginTransaction();

  try {
    const result = await fn(tx);
    await tx.commit();
    return Ok(result);
  } catch (error) {
    await tx.rollback();

    // Handle specific database errors
    if (error.code === 'UNIQUE_VIOLATION') {
      return Err(
        new DatabaseError('Duplicate entry', 'insert', {
          cause: error,
          context: { constraint: error.constraint },
        })
      );
    }

    if (error.code === 'FOREIGN_KEY_VIOLATION') {
      return Err(
        new DatabaseError('Referenced record not found', 'insert', {
          cause: error,
          context: { constraint: error.constraint },
        })
      );
    }

    return Err(
      new DatabaseError('Transaction failed', 'transaction', { cause: error })
    );
  }
}

// Usage
const result = await withTransaction(async (tx) => {
  const user = await tx.insert('users', userData);
  await tx.insert('profiles', { userId: user.id, ...profileData });
  return user;
});

if (!result.success) {
  console.error('Transaction failed:', result.error);
}
```

---

## File System Error Handling

### Safe File Operations

```typescript
import { promises as fs } from 'fs';
import { dirname } from 'path';

export async function safeReadFile(
  path: string
): Promise<Result<string, string>> {
  try {
    const content = await fs.readFile(path, 'utf-8');
    return Ok(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return Err(`File not found: ${path}`);
    }
    if (error.code === 'EACCES') {
      return Err(`Permission denied: ${path}`);
    }
    return Err(`Failed to read file: ${error.message}`);
  }
}

export async function safeWriteFile(
  path: string,
  content: string
): Promise<Result<void, string>> {
  try {
    // Ensure directory exists
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, content, 'utf-8');
    return Ok(undefined);
  } catch (error) {
    if (error.code === 'EACCES') {
      return Err(`Permission denied: ${path}`);
    }
    if (error.code === 'ENOSPC') {
      return Err('No space left on device');
    }
    return Err(`Failed to write file: ${error.message}`);
  }
}

// Atomic write (write to temp file, then rename)
export async function atomicWriteFile(
  path: string,
  content: string
): Promise<Result<void, string>> {
  const tempPath = `${path}.tmp.${Date.now()}`;

  try {
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(tempPath, content, 'utf-8');
    await fs.rename(tempPath, path);
    return Ok(undefined);
  } catch (error) {
    // Clean up temp file on error
    await fs.unlink(tempPath).catch(() => {});
    return Err(`Failed to write file atomically: ${error.message}`);
  }
}
```

---

## Summary: Error Handling Checklist

- [ ] Use domain-specific error classes
- [ ] Preserve error causes and stack traces
- [ ] Add context at each layer
- [ ] Log errors with structured data
- [ ] Use Result types for expected failures
- [ ] Implement retry logic with exponential backoff
- [ ] Use circuit breakers for external services
- [ ] Handle specific error codes (HTTP, DB, FS)
- [ ] Never silently swallow errors
- [ ] Test error scenarios thoroughly

**Remember:** Good error handling is about making failures visible, diagnosable, and recoverable.
