# TypeScript Safety: Advanced Patterns

## Table of Contents

1. [Type-Safe Builders](#type-safe-builders)
2. [Discriminated Unions for State Machines](#discriminated-unions-for-state-machines)
3. [Branded Types](#branded-types)
4. [Type Guards and Narrowing](#type-guards-and-narrowing)
5. [Exhaustiveness Checking](#exhaustiveness-checking)
6. [Template Literal Types](#template-literal-types)
7. [Const Assertions](#const-assertions)
8. [Utility Types and Transformations](#utility-types-and-transformations)
9. [Type-Safe APIs](#type-safe-apis)
10. [Runtime Validation with Zod](#runtime-validation-with-zod)

---

## Type-Safe Builders

### Problem: Invalid Configuration Objects

```typescript
// ❌ BAD: Can create invalid states
interface Config {
  host: string;
  port: number;
  ssl?: boolean;
  cert?: string;
  key?: string;
}

const config: Config = {
  host: 'localhost',
  port: 443,
  ssl: true,
  // Oops! Forgot cert and key
};
```

### Solution: Builder Pattern with Conditional Types

```typescript
// ✅ GOOD: Type system enforces valid states
type SSLConfig = {
  ssl: true;
  cert: string;
  key: string;
};

type NoSSLConfig = {
  ssl?: false;
};

type Config = {
  host: string;
  port: number;
} & (SSLConfig | NoSSLConfig);

// Valid configs
const config1: Config = {
  host: 'localhost',
  port: 80,
  ssl: false,
};

const config2: Config = {
  host: 'localhost',
  port: 443,
  ssl: true,
  cert: '/path/to/cert',
  key: '/path/to/key',
};

// ❌ TypeScript error: Property 'cert' is missing
const config3: Config = {
  host: 'localhost',
  port: 443,
  ssl: true,
};
```

### Advanced Builder with Phantom Types

```typescript
// Track build state at compile time
type Unset = { _tag: 'unset' };
type Set<T> = { _tag: 'set'; value: T };

class QueryBuilder<
  TTable extends string | Unset = Unset,
  TWhere extends string | Unset = Unset,
  TSelect extends string | Unset = Unset
> {
  private state: {
    table?: string;
    where?: string;
    select?: string;
  } = {};

  // Only available when table is unset
  table<T extends string>(
    this: QueryBuilder<Unset, TWhere, TSelect>,
    table: T
  ): QueryBuilder<Set<T>, TWhere, TSelect> {
    this.state.table = table;
    return this as any;
  }

  // Only available when table is set
  where<W extends string>(
    this: QueryBuilder<Set<TTable>, Unset, TSelect>,
    condition: W
  ): QueryBuilder<Set<TTable>, Set<W>, TSelect> {
    this.state.where = condition;
    return this as any;
  }

  // Only available when table is set
  select<S extends string>(
    this: QueryBuilder<Set<TTable>, TWhere, Unset>,
    fields: S
  ): QueryBuilder<Set<TTable>, TWhere, Set<S>> {
    this.state.select = fields;
    return this as any;
  }

  // Only available when all required fields are set
  build(
    this: QueryBuilder<Set<TTable>, Set<TWhere>, Set<TSelect>>
  ): string {
    return `SELECT ${this.state.select} FROM ${this.state.table} WHERE ${this.state.where}`;
  }
}

// ✅ GOOD: Valid query
const query = new QueryBuilder()
  .table('users')
  .where('age > 18')
  .select('name, email')
  .build();

// ❌ TypeScript error: Cannot call build without all required fields
const invalid = new QueryBuilder()
  .table('users')
  .build(); // Error!
```

---

## Discriminated Unions for State Machines

### Problem: Implicit State Coupling

```typescript
// ❌ BAD: Can have invalid combinations
interface Request {
  status: 'idle' | 'loading' | 'success' | 'error';
  data?: any;
  error?: Error;
  startedAt?: number;
}

// Can create invalid states
const request: Request = {
  status: 'idle',
  data: { user: 'John' }, // Should not have data when idle
  error: new Error('Failed'), // Should not have error when idle
};
```

### Solution: Discriminated Unions

```typescript
// ✅ GOOD: Only valid states are representable
type Request<T> =
  | { status: 'idle' }
  | { status: 'loading'; startedAt: number }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

// Type system enforces valid states
const idle: Request<User> = { status: 'idle' };

const loading: Request<User> = {
  status: 'loading',
  startedAt: Date.now(),
};

const success: Request<User> = {
  status: 'success',
  data: { id: '1', name: 'John' },
};

// ❌ TypeScript error: Cannot add data to idle state
const invalid: Request<User> = {
  status: 'idle',
  data: { id: '1', name: 'John' }, // Error!
};

// Pattern matching with exhaustive checking
function handleRequest<T>(request: Request<T>): string {
  switch (request.status) {
    case 'idle':
      return 'Waiting to start...';
    case 'loading':
      return `Loading (started ${Date.now() - request.startedAt}ms ago)`;
    case 'success':
      return `Got data: ${JSON.stringify(request.data)}`;
    case 'error':
      return `Error: ${request.error.message}`;
  }
}
```

### Complex State Machine Example

```typescript
// WebSocket connection state machine
type WebSocketState =
  | { status: 'disconnected' }
  | { status: 'connecting'; attemptCount: number }
  | { status: 'connected'; socket: WebSocket; connectedAt: number }
  | { status: 'reconnecting'; attemptCount: number; lastError: Error }
  | { status: 'failed'; error: Error; attemptCount: number };

// State transitions are explicit
function connect(state: WebSocketState): WebSocketState {
  switch (state.status) {
    case 'disconnected':
      return { status: 'connecting', attemptCount: 1 };
    case 'connecting':
      // Cannot connect when already connecting
      return state;
    case 'connected':
      // Already connected
      return state;
    case 'reconnecting':
      return { ...state, attemptCount: state.attemptCount + 1 };
    case 'failed':
      return { status: 'connecting', attemptCount: 1 };
  }
}

function onConnected(
  state: Extract<WebSocketState, { status: 'connecting' | 'reconnecting' }>,
  socket: WebSocket
): WebSocketState {
  return {
    status: 'connected',
    socket,
    connectedAt: Date.now(),
  };
}

function onError(
  state: WebSocketState,
  error: Error
): WebSocketState {
  switch (state.status) {
    case 'connecting':
    case 'reconnecting':
      if (state.attemptCount >= 5) {
        return { status: 'failed', error, attemptCount: state.attemptCount };
      }
      return { status: 'reconnecting', attemptCount: state.attemptCount, lastError: error };
    default:
      return state;
  }
}
```

---

## Branded Types

### Problem: Primitive Obsession

```typescript
// ❌ BAD: Can mix up user IDs and post IDs
function getUser(id: string) { ... }
function getPost(id: string) { ... }

const userId = '123';
const postId = '456';

getUser(postId); // Oops! Wrong ID type, but TypeScript allows it
```

### Solution: Branded Types

```typescript
// ✅ GOOD: Type system prevents mixing
declare const brand: unique symbol;

type Brand<T, TBrand> = T & { [brand]: TBrand };

export type UserId = Brand<string, 'UserId'>;
export type PostId = Brand<string, 'PostId'>;
export type Email = Brand<string, 'Email'>;

// Constructor functions with validation
export function UserId(value: string): UserId {
  if (!value || !/^user_[a-z0-9]+$/.test(value)) {
    throw new Error('Invalid user ID format');
  }
  return value as UserId;
}

export function PostId(value: string): PostId {
  if (!value || !/^post_[a-z0-9]+$/.test(value)) {
    throw new Error('Invalid post ID format');
  }
  return value as PostId;
}

export function Email(value: string): Email {
  if (!value || !/.+@.+\..+/.test(value)) {
    throw new Error('Invalid email format');
  }
  return value as Email;
}

// Type-safe functions
function getUser(id: UserId): User { ... }
function getPost(id: PostId): Post { ... }

// Usage
const userId = UserId('user_abc123');
const postId = PostId('post_xyz789');

getUser(userId); // ✅ OK
getUser(postId); // ❌ TypeScript error!
```

### Branded Numbers

```typescript
export type PositiveNumber = Brand<number, 'PositiveNumber'>;
export type Port = Brand<number, 'Port'>;
export type Percentage = Brand<number, 'Percentage'>;

export function PositiveNumber(value: number): PositiveNumber {
  if (value <= 0) {
    throw new Error('Number must be positive');
  }
  return value as PositiveNumber;
}

export function Port(value: number): Port {
  if (value < 1 || value > 65535 || !Number.isInteger(value)) {
    throw new Error('Port must be integer between 1 and 65535');
  }
  return value as Port;
}

export function Percentage(value: number): Percentage {
  if (value < 0 || value > 100) {
    throw new Error('Percentage must be between 0 and 100');
  }
  return value as Percentage;
}

// Type-safe APIs
function startServer(port: Port): Server { ... }

startServer(Port(3000)); // ✅ OK
startServer(3000); // ❌ TypeScript error
startServer(Port(99999)); // ❌ Runtime error
```

---

## Type Guards and Narrowing

### Basic Type Guards

```typescript
// Type guard for null/undefined
function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

// Usage
const users: (User | null)[] = [user1, null, user2];
const definedUsers: User[] = users.filter(isDefined);

// Type guard for specific type
interface Cat {
  type: 'cat';
  meow(): void;
}

interface Dog {
  type: 'dog';
  bark(): void;
}

type Animal = Cat | Dog;

function isCat(animal: Animal): animal is Cat {
  return animal.type === 'cat';
}

function handleAnimal(animal: Animal) {
  if (isCat(animal)) {
    animal.meow(); // ✅ TypeScript knows it's a Cat
  } else {
    animal.bark(); // ✅ TypeScript knows it's a Dog
  }
}
```

### Advanced Type Guards with Validation

```typescript
// Runtime validation with type guard
interface User {
  id: string;
  name: string;
  email: string;
  age: number;
}

function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'email' in value &&
    typeof value.email === 'string' &&
    'age' in value &&
    typeof value.age === 'number'
  );
}

// Usage with API response
async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  const data = await response.json();

  if (!isUser(data)) {
    throw new Error('Invalid user data from API');
  }

  return data; // ✅ TypeScript knows it's User
}
```

### Assertion Functions

```typescript
// Assertion function (throws on failure)
function assertIsDefined<T>(
  value: T | null | undefined,
  message?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message ?? 'Value is null or undefined');
  }
}

// Usage
function processUser(user: User | null) {
  assertIsDefined(user, 'User must be defined');
  // After this line, TypeScript knows user is User (not null)
  console.log(user.name); // ✅ No error
}

// Assertion for specific type
function assertIsUser(value: unknown): asserts value is User {
  if (!isUser(value)) {
    throw new Error('Value is not a valid User');
  }
}
```

---

## Exhaustiveness Checking

### Never Type for Exhaustive Checks

```typescript
type Status = 'pending' | 'approved' | 'rejected';

function handleStatus(status: Status): string {
  switch (status) {
    case 'pending':
      return 'Waiting for approval';
    case 'approved':
      return 'Approved!';
    case 'rejected':
      return 'Rejected';
    default:
      // Exhaustiveness check
      const exhaustiveCheck: never = status;
      throw new Error(`Unhandled status: ${exhaustiveCheck}`);
  }
}

// If we add a new status without handling it:
type Status = 'pending' | 'approved' | 'rejected' | 'cancelled';

// ❌ TypeScript error in default case: Type 'cancelled' is not assignable to type 'never'
```

### Helper Function

```typescript
function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}

function handleStatus(status: Status): string {
  switch (status) {
    case 'pending':
      return 'Waiting';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    default:
      assertNever(status); // TypeScript ensures all cases handled
  }
}
```

---

## Template Literal Types

### Type-Safe Routes

```typescript
// Define route patterns
type RouteParams<T extends string> =
  T extends `${infer Start}/:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof RouteParams<Rest>]: string }
    : T extends `${infer Start}/:${infer Param}`
    ? { [K in Param]: string }
    : {};

// Usage
type UserRoute = '/users/:userId';
type PostRoute = '/users/:userId/posts/:postId';

type UserParams = RouteParams<UserRoute>; // { userId: string }
type PostParams = RouteParams<PostRoute>; // { userId: string; postId: string }

// Type-safe route builder
function buildRoute<T extends string>(
  template: T,
  params: RouteParams<T>
): string {
  let result: string = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`:${key}`, value);
  }
  return result;
}

// ✅ Type-safe usage
const userRoute = buildRoute('/users/:userId', { userId: '123' });
const postRoute = buildRoute('/users/:userId/posts/:postId', {
  userId: '123',
  postId: '456',
});

// ❌ TypeScript error: Missing required param
const invalid = buildRoute('/users/:userId', {}); // Error!
```

### CSS-in-JS Type Safety

```typescript
// Type-safe CSS properties
type CSSUnit = 'px' | 'rem' | 'em' | '%' | 'vh' | 'vw';
type CSSValue<T extends number> = `${T}${CSSUnit}`;

type Spacing = CSSValue<4 | 8 | 16 | 24 | 32>;

interface StyleProps {
  margin?: Spacing;
  padding?: Spacing;
  gap?: Spacing;
}

// ✅ Valid
const style1: StyleProps = { margin: '16px', padding: '8px' };

// ❌ TypeScript error: '5px' not in allowed values
const style2: StyleProps = { margin: '5px' }; // Error!
```

---

## Const Assertions

### Narrow Types with `as const`

```typescript
// Without const assertion
const colors = ['red', 'green', 'blue'];
// Type: string[]

// With const assertion
const colorsConst = ['red', 'green', 'blue'] as const;
// Type: readonly ['red', 'green', 'blue']

type Color = typeof colorsConst[number];
// Type: 'red' | 'green' | 'blue'

function setColor(color: Color) { ... }

setColor('red'); // ✅ OK
setColor('yellow'); // ❌ Error
```

### Type-Safe Configuration

```typescript
const CONFIG = {
  api: {
    baseUrl: 'https://api.example.com',
    timeout: 5000,
    endpoints: {
      users: '/users',
      posts: '/posts',
      comments: '/comments',
    },
  },
  features: {
    darkMode: true,
    notifications: false,
  },
} as const;

type Config = typeof CONFIG;
type Endpoint = keyof Config['api']['endpoints']; // 'users' | 'posts' | 'comments'

// Type-safe access
function getEndpoint(endpoint: Endpoint): string {
  return CONFIG.api.endpoints[endpoint];
}
```

---

## Utility Types and Transformations

### Essential Utility Types

```typescript
// Make all properties optional
type Partial<T> = { [P in keyof T]?: T[P] };

// Make all properties required
type Required<T> = { [P in keyof T]-?: T[P] };

// Make all properties readonly
type Readonly<T> = { readonly [P in keyof T]: T[P] };

// Pick specific properties
type Pick<T, K extends keyof T> = { [P in K]: T[P] };

// Omit specific properties
type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

// Usage
interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  createdAt: Date;
}

type PublicUser = Omit<User, 'password'>; // No password field
type UserUpdate = Partial<Omit<User, 'id' | 'createdAt'>>; // Only name/email/password, all optional
type UserCreate = Pick<User, 'name' | 'email' | 'password'>; // Only these fields
```

### Custom Utility Types

```typescript
// Deep Partial
type DeepPartial<T> = T extends object
  ? { [P in keyof T]?: DeepPartial<T[P]> }
  : T;

// Deep Readonly
type DeepReadonly<T> = T extends object
  ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
  : T;

// Nullable
type Nullable<T> = T | null;

// NonNullable (built-in)
type NonNullable<T> = T extends null | undefined ? never : T;

// Make specific keys required
type RequiredKeys<T, K extends keyof T> = T & { [P in K]-?: T[P] };

// Make specific keys optional
type OptionalKeys<T, K extends keyof T> = Omit<T, K> & { [P in K]?: T[P] };

// Usage
interface Config {
  host?: string;
  port?: number;
  database: {
    url?: string;
    poolSize?: number;
  };
}

type RequiredConfig = RequiredKeys<Config, 'host' | 'port'>;
// { host: string; port: number; database: { url?: string; poolSize?: number } }
```

---

## Type-Safe APIs

### Request/Response Types

```typescript
// Define API endpoints with types
interface API {
  '/users': {
    GET: {
      query: { page: number; limit: number };
      response: { users: User[]; total: number };
    };
    POST: {
      body: { name: string; email: string };
      response: { user: User };
    };
  };
  '/users/:id': {
    GET: {
      params: { id: string };
      response: { user: User };
    };
    PUT: {
      params: { id: string };
      body: Partial<User>;
      response: { user: User };
    };
    DELETE: {
      params: { id: string };
      response: { success: boolean };
    };
  };
}

// Type-safe API client
type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

type ExtractParams<T> = T extends { params: infer P } ? P : never;
type ExtractQuery<T> = T extends { query: infer Q } ? Q : never;
type ExtractBody<T> = T extends { body: infer B } ? B : never;
type ExtractResponse<T> = T extends { response: infer R } ? R : never;

async function apiCall<
  TPath extends keyof API,
  TMethod extends keyof API[TPath] & Method,
  TEndpoint extends API[TPath][TMethod]
>(
  path: TPath,
  method: TMethod,
  options: {
    params?: ExtractParams<TEndpoint>;
    query?: ExtractQuery<TEndpoint>;
    body?: ExtractBody<TEndpoint>;
  }
): Promise<ExtractResponse<TEndpoint>> {
  // Implementation
  const url = buildUrl(path, options.params, options.query);
  const response = await fetch(url, {
    method,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return response.json();
}

// ✅ Type-safe usage
const users = await apiCall('/users', 'GET', {
  query: { page: 1, limit: 10 },
});
// Type: { users: User[]; total: number }

const newUser = await apiCall('/users', 'POST', {
  body: { name: 'John', email: 'john@example.com' },
});
// Type: { user: User }

// ❌ TypeScript errors
await apiCall('/users', 'GET', {
  query: { page: '1' }, // Error: page must be number
});

await apiCall('/users/:id', 'GET', {}); // Error: Missing params
```

---

## Runtime Validation with Zod

### Schema Definition

```typescript
import { z } from 'zod';

// Define schema
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().positive().max(120),
  role: z.enum(['user', 'admin', 'moderator']),
  createdAt: z.date(),
  profile: z.object({
    bio: z.string().optional(),
    avatar: z.string().url().optional(),
  }),
});

// Infer TypeScript type from schema
type User = z.infer<typeof UserSchema>;

// Validate data
function createUser(data: unknown): User {
  return UserSchema.parse(data); // Throws if invalid
}

// Safe validation (returns Result-like)
function safeCreateUser(data: unknown): Result<User, string> {
  const result = UserSchema.safeParse(data);
  if (result.success) {
    return Ok(result.data);
  }
  return Err(result.error.message);
}
```

### Advanced Zod Patterns

```typescript
// Refinements (custom validation)
const PasswordSchema = z
  .string()
  .min(8)
  .refine(
    (pw) => /[A-Z]/.test(pw),
    { message: 'Password must contain uppercase letter' }
  )
  .refine(
    (pw) => /[0-9]/.test(pw),
    { message: 'Password must contain number' }
  );

// Transformations
const DateStringSchema = z.string().transform((str) => new Date(str));

const NumberStringSchema = z.string().transform((str) => parseInt(str, 10));

// Discriminated unions
const EventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), x: z.number(), y: z.number() }),
  z.object({ type: z.literal('keypress'), key: z.string() }),
  z.object({ type: z.literal('resize'), width: z.number(), height: z.number() }),
]);

type Event = z.infer<typeof EventSchema>;
// Type: { type: 'click'; x: number; y: number } | ...

// API validation middleware
function validateBody<T>(schema: z.ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.format(),
      });
    }
    req.body = result.data; // Now typed as T
    next();
  };
}

// Usage
app.post('/users', validateBody(UserSchema), (req, res) => {
  // req.body is typed as User
  const user = req.body;
  // ...
});
```

---

## Summary: TypeScript Safety Checklist

- [ ] Use discriminated unions for state machines
- [ ] Use branded types for domain primitives (IDs, emails)
- [ ] Implement type guards with runtime validation
- [ ] Use exhaustiveness checking with `never`
- [ ] Leverage template literal types for DSLs
- [ ] Use const assertions for literal types
- [ ] Create type-safe API contracts
- [ ] Validate external data with Zod
- [ ] Avoid `any` - use `unknown` instead
- [ ] Make invalid states unrepresentable

**Remember:** TypeScript's type system is powerful - use it to catch bugs at compile time, not runtime!
