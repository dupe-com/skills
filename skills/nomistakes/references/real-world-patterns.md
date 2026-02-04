# Real-World Error Prevention Patterns

Complete, production-ready examples demonstrating error prevention principles.

## Table of Contents

- [API Route Handler (Express)](#api-route-handler-express)
- [Data Fetching Service](#data-fetching-service)
- [Form Validation](#form-validation)
- [File Upload Handler](#file-upload-handler)
- [Background Job Processor](#background-job-processor)
- [Database Repository](#database-repository)

---

## API Route Handler (Express)

Complete API endpoint with validation, error handling, and logging.

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from './logger';

// Schema validation
const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().min(0).max(150).optional(),
});

type CreateUserInput = z.infer<typeof CreateUserSchema>;

// Custom errors
class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

// Async handler wrapper
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Route handlers
const router = Router();

router.post('/users', asyncHandler(async (req: Request, res: Response) => {
  // 1. Validate input
  const parseResult = CreateUserSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError(parseResult.error.message);
  }
  
  const userData = parseResult.data;
  
  // 2. Business logic with error handling
  try {
    const user = await createUser(userData);
    
    // 3. Return success response
    res.status(201).json({
      success: true,
      data: user,
    });
  } catch (e) {
    // 4. Log and rethrow for global handler
    logger.error('Failed to create user', {
      error: e,
      userData: { ...userData, email: '***' }, // Sanitize PII
    });
    throw e;
  }
}));

router.get('/users/:id', asyncHandler(async (req: Request, res: Response) => {
  // Validate route params
  const { id } = req.params;
  if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) {
    throw new ValidationError('Invalid user ID format');
  }
  
  const user = await getUser(id);
  if (!user) {
    throw new NotFoundError('User', id);
  }
  
  res.json({
    success: true,
    data: user,
  });
}));

// Global error handler
router.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  // Don't expose internal errors in production
  const isDev = process.env.NODE_ENV === 'development';
  
  if (err instanceof ValidationError) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: err.message,
      field: err.field,
    });
  }
  
  if (err instanceof NotFoundError) {
    return res.status(404).json({
      error: 'NOT_FOUND',
      message: err.message,
    });
  }
  
  // Unexpected error
  logger.error('Unhandled error', {
    error: err,
    path: req.path,
    method: req.method,
  });
  
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: isDev ? err.message : 'An unexpected error occurred',
    ...(isDev && { stack: err.stack }),
  });
});

export default router;
```

---

## Data Fetching Service

Production-ready API client with retry, timeout, and error handling.

```typescript
import { z } from 'zod';

// Response schemas
const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  createdAt: z.string().datetime(),
});

const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  statusCode: z.number(),
});

type User = z.infer<typeof UserSchema>;
type ApiError = z.infer<typeof ApiErrorSchema>;

// Result type
type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

// API Client
class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly defaultTimeout: number = 5000
  ) {
    // Validate config at construction
    if (!baseUrl) {
      throw new Error('baseUrl is required');
    }
    if (!apiKey) {
      throw new Error('apiKey is required');
    }
  }
  
  /**
   * Fetch with timeout and abort support
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit & { timeout?: number } = {}
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutMs = options.timeout ?? this.defaultTimeout;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          ...options.headers,
        },
      });
      
      return response;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  
  /**
   * Retry logic with exponential backoff
   */
  private async retry<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3
  ): Promise<T> {
    let lastError: unknown;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (e) {
        lastError = e;
        
        // Don't retry client errors (4xx)
        if (e instanceof Error && e.message.includes('400')) {
          throw e;
        }
        
        if (attempt < maxAttempts) {
          const delayMs = Math.pow(2, attempt - 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }
    
    throw new Error(
      `Failed after ${maxAttempts} attempts: ${lastError instanceof Error ? lastError.message : 'Unknown error'}`
    );
  }
  
  /**
   * Get user by ID with full error handling
   */
  async getUser(id: string): Promise<Result<User, string>> {
    // Validate input
    if (!id || typeof id !== 'string') {
      return { success: false, error: 'Invalid user ID' };
    }
    
    try {
      const response = await this.retry(() =>
        this.fetchWithTimeout(`${this.baseUrl}/users/${id}`)
      );
      
      // Handle HTTP errors
      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, error: `User not found: ${id}` };
        }
        
        // Try to parse API error
        try {
          const errorData = await response.json();
          const apiError = ApiErrorSchema.parse(errorData);
          return { success: false, error: apiError.message };
        } catch {
          return {
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
          };
        }
      }
      
      // Parse and validate response
      const data = await response.json();
      const user = UserSchema.parse(data);
      
      return { success: true, data: user };
    } catch (e) {
      // Network errors, timeouts, parsing errors
      const message = e instanceof Error ? e.message : 'Unknown error';
      return { success: false, error: message };
    }
  }
  
  /**
   * List users with pagination
   */
  async listUsers(
    page: number = 1,
    limit: number = 10
  ): Promise<Result<User[], string>> {
    // Validate pagination params
    if (!Number.isInteger(page) || page < 1) {
      return { success: false, error: 'Page must be a positive integer' };
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return { success: false, error: 'Limit must be between 1 and 100' };
    }
    
    try {
      const url = `${this.baseUrl}/users?page=${page}&limit=${limit}`;
      const response = await this.retry(() => this.fetchWithTimeout(url));
      
      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }
      
      const data = await response.json();
      const users = z.array(UserSchema).parse(data);
      
      return { success: true, data: users };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      return { success: false, error: message };
    }
  }
}

// Usage
const apiClient = new ApiClient(
  process.env.API_BASE_URL!,
  process.env.API_KEY!,
  10000 // 10s timeout
);

const result = await apiClient.getUser('user-123');
if (result.success) {
  console.log('User:', result.data);
} else {
  console.error('Error:', result.error);
}
```

---

## Form Validation

React form with comprehensive validation and error handling.

```typescript
import React, { useState } from 'react';
import { z } from 'zod';

// Validation schema
const SignupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
  age: z
    .number()
    .int('Age must be a whole number')
    .min(18, 'Must be 18 or older')
    .max(150, 'Invalid age'),
  terms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms' }),
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type SignupForm = z.infer<typeof SignupSchema>;

type FieldErrors = Partial<Record<keyof SignupForm, string>>;

export function SignupForm() {
  const [formData, setFormData] = useState<Partial<SignupForm>>({
    email: '',
    password: '',
    confirmPassword: '',
    age: undefined,
    terms: false,
  });
  
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  // Validate single field
  const validateField = (name: keyof SignupForm, value: any) => {
    try {
      SignupSchema.shape[name].parse(value);
      setErrors(prev => ({ ...prev, [name]: undefined }));
    } catch (e) {
      if (e instanceof z.ZodError) {
        setErrors(prev => ({ ...prev, [name]: e.errors[0]?.message }));
      }
    }
  };
  
  // Handle field change
  const handleChange = (name: keyof SignupForm, value: any) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear field error on change
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };
  
  // Handle field blur (validate on blur)
  const handleBlur = (name: keyof SignupForm) => {
    const value = formData[name];
    if (value !== undefined && value !== '') {
      validateField(name, value);
    }
  };
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset errors
    setErrors({});
    setSubmitError(null);
    
    // Validate entire form
    const parseResult = SignupSchema.safeParse(formData);
    
    if (!parseResult.success) {
      // Map Zod errors to field errors
      const fieldErrors: FieldErrors = {};
      parseResult.error.errors.forEach(err => {
        const field = err.path[0] as keyof SignupForm;
        if (field && !fieldErrors[field]) {
          fieldErrors[field] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }
    
    // Submit form
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parseResult.data),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Signup failed');
      }
      
      // Success! Redirect or show success message
      window.location.href = '/dashboard';
    } catch (e) {
      const message = e instanceof Error ? e.message : 'An error occurred';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={handleSubmit} noValidate>
      {submitError && (
        <div className="error-banner" role="alert">
          {submitError}
        </div>
      )}
      
      <div className="form-field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          onBlur={() => handleBlur('email')}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        {errors.email && (
          <span id="email-error" className="error-message" role="alert">
            {errors.email}
          </span>
        )}
      </div>
      
      <div className="form-field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={formData.password}
          onChange={(e) => handleChange('password', e.target.value)}
          onBlur={() => handleBlur('password')}
          aria-invalid={!!errors.password}
          aria-describedby={errors.password ? 'password-error' : undefined}
        />
        {errors.password && (
          <span id="password-error" className="error-message" role="alert">
            {errors.password}
          </span>
        )}
      </div>
      
      <div className="form-field">
        <label htmlFor="confirmPassword">Confirm Password</label>
        <input
          id="confirmPassword"
          type="password"
          value={formData.confirmPassword}
          onChange={(e) => handleChange('confirmPassword', e.target.value)}
          onBlur={() => handleBlur('confirmPassword')}
          aria-invalid={!!errors.confirmPassword}
          aria-describedby={errors.confirmPassword ? 'confirm-error' : undefined}
        />
        {errors.confirmPassword && (
          <span id="confirm-error" className="error-message" role="alert">
            {errors.confirmPassword}
          </span>
        )}
      </div>
      
      <div className="form-field">
        <label htmlFor="age">Age</label>
        <input
          id="age"
          type="number"
          value={formData.age ?? ''}
          onChange={(e) => {
            const value = e.target.value === '' ? undefined : Number(e.target.value);
            handleChange('age', value);
          }}
          onBlur={() => handleBlur('age')}
          aria-invalid={!!errors.age}
          aria-describedby={errors.age ? 'age-error' : undefined}
        />
        {errors.age && (
          <span id="age-error" className="error-message" role="alert">
            {errors.age}
          </span>
        )}
      </div>
      
      <div className="form-field">
        <label>
          <input
            type="checkbox"
            checked={formData.terms ?? false}
            onChange={(e) => handleChange('terms', e.target.checked)}
            aria-invalid={!!errors.terms}
            aria-describedby={errors.terms ? 'terms-error' : undefined}
          />
          I accept the terms and conditions
        </label>
        {errors.terms && (
          <span id="terms-error" className="error-message" role="alert">
            {errors.terms}
          </span>
        )}
      </div>
      
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Signing up...' : 'Sign Up'}
      </button>
    </form>
  );
}
```

---

## File Upload Handler

Secure file upload with validation and error handling.

```typescript
import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod';

// Configuration
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const UPLOAD_DIR = './uploads';

// File validation schema
const FileSchema = z.object({
  fieldname: z.string(),
  originalname: z.string(),
  encoding: z.string(),
  mimetype: z.enum(ALLOWED_TYPES),
  size: z.number().max(MAX_FILE_SIZE),
  destination: z.string(),
  filename: z.string(),
  path: z.string(),
});

type ValidFile = z.infer<typeof FileSchema>;

// Custom errors
class FileUploadError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'FileUploadError';
  }
}

// Configure multer
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    } catch (e) {
      cb(e as Error, UPLOAD_DIR);
    }
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.mimetype as any)) {
      cb(new FileUploadError(
        `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}`,
        'INVALID_FILE_TYPE'
      ));
      return;
    }
    
    // Validate filename
    if (!/^[\w\-. ]+$/.test(file.originalname)) {
      cb(new FileUploadError(
        'Invalid filename. Only alphanumeric, dash, underscore, dot, and space allowed',
        'INVALID_FILENAME'
      ));
      return;
    }
    
    cb(null, true);
  },
});

// Upload handler
export const uploadFile = async (req: Request, res: Response) => {
  // Wrap multer in promise for async/await
  await new Promise<void>((resolve, reject) => {
    upload.single('file')(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  }).catch((e) => {
    // Handle multer errors
    if (e instanceof multer.MulterError) {
      if (e.code === 'LIMIT_FILE_SIZE') {
        throw new FileUploadError(
          `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
          'FILE_TOO_LARGE'
        );
      }
      throw new FileUploadError(e.message, e.code);
    }
    throw e;
  });
  
  // Validate file exists
  if (!req.file) {
    throw new FileUploadError('No file uploaded', 'NO_FILE');
  }
  
  let filePath: string | null = null;
  
  try {
    // Validate file with schema
    const validFile = FileSchema.parse(req.file);
    filePath = validFile.path;
    
    // Additional security: verify file content matches MIME type
    // (This is a simplified check; use a library like 'file-type' in production)
    const fileBuffer = await fs.readFile(validFile.path);
    const isValidImage = await verifyImageFile(fileBuffer, validFile.mimetype);
    
    if (!isValidImage) {
      throw new FileUploadError(
        'File content does not match declared type',
        'CONTENT_MISMATCH'
      );
    }
    
    // Process file (resize, optimize, etc.)
    // ...
    
    // Save file metadata to database
    // ...
    
    res.status(201).json({
      success: true,
      data: {
        id: 'file-123', // From database
        filename: validFile.originalname,
        size: validFile.size,
        mimeType: validFile.mimetype,
        url: `/uploads/${validFile.filename}`,
      },
    });
  } catch (e) {
    // Clean up file on error
    if (filePath) {
      await fs.unlink(filePath).catch(console.error);
    }
    
    if (e instanceof FileUploadError) {
      return res.status(400).json({
        error: e.code,
        message: e.message,
      });
    }
    
    throw e;
  }
};

// Verify image file (simplified)
async function verifyImageFile(buffer: Buffer, mimeType: string): Promise<boolean> {
  // Check magic numbers (file signatures)
  const signatures: Record<string, number[]> = {
    'image/jpeg': [0xFF, 0xD8, 0xFF],
    'image/png': [0x89, 0x50, 0x4E, 0x47],
    'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF
  };
  
  const signature = signatures[mimeType];
  if (!signature) return false;
  
  return signature.every((byte, index) => buffer[index] === byte);
}
```

---

## Background Job Processor

Worker that processes jobs from a queue with error handling and retries.

```typescript
import { Queue, Job, Worker } from 'bullmq';
import { z } from 'zod';
import { logger } from './logger';

// Job data schema
const EmailJobSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string(),
  templateId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

type EmailJob = z.infer<typeof EmailJobSchema>;

// Job result type
type JobResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; retryable: boolean };

// Email service (mock)
class EmailService {
  async send(email: EmailJob): Promise<{ messageId: string }> {
    // Simulate email sending
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Simulate occasional failures
    if (Math.random() < 0.1) {
      throw new Error('SMTP connection failed');
    }
    
    return { messageId: `msg-${Date.now()}` };
  }
}

const emailService = new EmailService();

// Create queue
const emailQueue = new Queue('email', {
  connection: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep for 24 hours
      count: 1000,
    },
    removeOnFail: {
      age: 7 * 24 * 3600, // Keep for 7 days
    },
  },
});

// Process job with error handling
async function processEmailJob(job: Job<unknown>): Promise<JobResult<string>> {
  logger.info('Processing email job', { jobId: job.id });
  
  try {
    // 1. Validate job data
    const emailData = EmailJobSchema.parse(job.data);
    
    // 2. Check if job is stale (optional)
    const jobAge = Date.now() - job.timestamp;
    if (jobAge > 60 * 60 * 1000) { // 1 hour
      logger.warn('Job is stale', { jobId: job.id, ageMs: jobAge });
      // Continue anyway, or fail as non-retryable
    }
    
    // 3. Process job
    const result = await emailService.send(emailData);
    
    // 4. Return success
    logger.info('Email sent successfully', {
      jobId: job.id,
      messageId: result.messageId,
      to: emailData.to,
    });
    
    return {
      success: true,
      data: result.messageId,
    };
  } catch (e) {
    // Determine if error is retryable
    const isRetryable = isRetryableError(e);
    const errorMessage = e instanceof Error ? e.message : 'Unknown error';
    
    logger.error('Failed to process email job', {
      jobId: job.id,
      error: e,
      attempt: job.attemptsMade,
      retryable: isRetryable,
    });
    
    return {
      success: false,
      error: errorMessage,
      retryable: isRetryable,
    };
  }
}

// Determine if error is retryable
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  
  // Network errors, timeouts -> retryable
  const retryablePatterns = [
    /ECONNREFUSED/,
    /ETIMEDOUT/,
    /SMTP connection/,
    /Rate limit/,
  ];
  
  return retryablePatterns.some(pattern => pattern.test(error.message));
}

// Create worker
const worker = new Worker(
  'email',
  async (job: Job) => {
    const result = await processEmailJob(job);
    
    if (!result.success) {
      // Throw to trigger retry (if retryable)
      if (result.retryable) {
        throw new Error(result.error);
      } else {
        // Move to failed queue without retry
        await job.moveToFailed(new Error(result.error), job.token!, false);
      }
    }
    
    return result.data;
  },
  {
    connection: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
    },
    concurrency: 10,
  }
);

// Worker event handlers
worker.on('completed', (job, result) => {
  logger.info('Job completed', { jobId: job.id, result });
});

worker.on('failed', (job, error) => {
  logger.error('Job failed', {
    jobId: job?.id,
    error,
    attempts: job?.attemptsMade,
  });
});

worker.on('error', (error) => {
  logger.error('Worker error', { error });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing worker...');
  await worker.close();
  await emailQueue.close();
  process.exit(0);
});

// Export for adding jobs
export async function sendEmail(email: EmailJob): Promise<void> {
  await emailQueue.add('send-email', email, {
    priority: email.metadata?.priority as number ?? 1,
    delay: email.metadata?.delayMs as number ?? 0,
  });
}
```

---

## Database Repository

Type-safe database repository with transaction support and error handling.

```typescript
import { Pool, PoolClient } from 'pg';
import { z } from 'zod';

// Database schemas
const UserRowSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  created_at: z.date(),
  updated_at: z.date(),
});

type UserRow = z.infer<typeof UserRowSchema>;

// Domain models
interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

// Custom errors
class DatabaseError extends Error {
  constructor(message: string, public code: string, public cause?: unknown) {
    super(message);
    this.name = 'DatabaseError';
  }
}

class NotFoundError extends DatabaseError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND');
  }
}

class DuplicateError extends DatabaseError {
  constructor(field: string, value: string) {
    super(`${field} already exists: ${value}`, 'DUPLICATE');
  }
}

// Result type
type Result<T, E = DatabaseError> =
  | { success: true; data: T }
  | { success: false; error: E };

// Repository
export class UserRepository {
  constructor(private readonly pool: Pool) {
    if (!pool) {
      throw new Error('Database pool is required');
    }
  }
  
  /**
   * Map database row to domain model
   */
  private mapRowToUser(row: UserRow): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  
  /**
   * Find user by ID
   */
  async findById(id: string): Promise<Result<User>> {
    // Validate input
    if (!id || typeof id !== 'string') {
      return {
        success: false,
        error: new DatabaseError('Invalid user ID', 'INVALID_INPUT'),
      };
    }
    
    try {
      const result = await this.pool.query(
        'SELECT * FROM users WHERE id = $1',
        [id]
      );
      
      if (result.rows.length === 0) {
        return {
          success: false,
          error: new NotFoundError('User', id),
        };
      }
      
      const row = UserRowSchema.parse(result.rows[0]);
      return {
        success: true,
        data: this.mapRowToUser(row),
      };
    } catch (e) {
      return {
        success: false,
        error: new DatabaseError(
          'Failed to fetch user',
          'QUERY_FAILED',
          e
        ),
      };
    }
  }
  
  /**
   * Create new user
   */
  async create(email: string, name: string): Promise<Result<User>> {
    // Validate inputs
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return {
        success: false,
        error: new DatabaseError('Invalid email', 'INVALID_INPUT'),
      };
    }
    
    if (!name || name.length === 0) {
      return {
        success: false,
        error: new DatabaseError('Name is required', 'INVALID_INPUT'),
      };
    }
    
    try {
      const result = await this.pool.query(
        `INSERT INTO users (email, name, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         RETURNING *`,
        [email, name]
      );
      
      const row = UserRowSchema.parse(result.rows[0]);
      return {
        success: true,
        data: this.mapRowToUser(row),
      };
    } catch (e: any) {
      // Handle duplicate email
      if (e.code === '23505') { // Unique violation
        return {
          success: false,
          error: new DuplicateError('email', email),
        };
      }
      
      return {
        success: false,
        error: new DatabaseError(
          'Failed to create user',
          'QUERY_FAILED',
          e
        ),
      };
    }
  }
  
  /**
   * Update user
   */
  async update(id: string, updates: Partial<Pick<User, 'name' | 'email'>>): Promise<Result<User>> {
    if (!id) {
      return {
        success: false,
        error: new DatabaseError('User ID is required', 'INVALID_INPUT'),
      };
    }
    
    // Build dynamic update query
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    
    if (updates.email !== undefined) {
      fields.push(`email = $${paramIndex++}`);
      values.push(updates.email);
    }
    
    if (fields.length === 0) {
      return {
        success: false,
        error: new DatabaseError('No fields to update', 'INVALID_INPUT'),
      };
    }
    
    fields.push(`updated_at = NOW()`);
    values.push(id); // Add ID as last parameter
    
    try {
      const result = await this.pool.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        values
      );
      
      if (result.rows.length === 0) {
        return {
          success: false,
          error: new NotFoundError('User', id),
        };
      }
      
      const row = UserRowSchema.parse(result.rows[0]);
      return {
        success: true,
        data: this.mapRowToUser(row),
      };
    } catch (e: any) {
      if (e.code === '23505') {
        return {
          success: false,
          error: new DuplicateError('email', updates.email!),
        };
      }
      
      return {
        success: false,
        error: new DatabaseError(
          'Failed to update user',
          'QUERY_FAILED',
          e
        ),
      };
    }
  }
  
  /**
   * Execute multiple operations in a transaction
   */
  async transaction<T>(
    fn: (client: PoolClient) => Promise<T>
  ): Promise<Result<T>> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      
      return { success: true, data: result };
    } catch (e) {
      await client.query('ROLLBACK');
      
      return {
        success: false,
        error: new DatabaseError(
          'Transaction failed',
          'TRANSACTION_FAILED',
          e
        ),
      };
    } finally {
      client.release();
    }
  }
}

// Usage example
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const userRepo = new UserRepository(pool);

// Simple query
const result = await userRepo.findById('user-123');
if (result.success) {
  console.log('User:', result.data);
} else {
  console.error('Error:', result.error.message);
}

// Transaction
const txResult = await userRepo.transaction(async (client) => {
  // Multiple operations in transaction
  const user1 = await client.query('INSERT INTO users ...');
  const user2 = await client.query('INSERT INTO users ...');
  return { user1, user2 };
});
```

---

## Key Takeaways

1. **Validate Early**: Check inputs at boundaries before processing
2. **Use Result Types**: Return `Result<T, E>` for expected failures
3. **Log Errors**: Always log errors with context for debugging
4. **Clean Up Resources**: Use `finally` or `using` for cleanup
5. **Handle Retries**: Distinguish between retryable and permanent errors
6. **Type Safety**: Use Zod or similar for runtime validation
7. **Test Error Cases**: Write tests for failure modes, not just happy paths

For more patterns and principles, see:
- [API Reference](../api/reference.md)
- [SKILL.md](../../SKILL.md)
