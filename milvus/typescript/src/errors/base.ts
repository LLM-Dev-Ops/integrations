/**
 * Base error class for all Milvus errors.
 */
export abstract class MilvusError extends Error {
  /** Error type identifier */
  abstract readonly type: string;
  /** Whether this error is retryable */
  abstract readonly isRetryable: boolean;
  /** HTTP-like status code */
  readonly status?: number;
  /** Retry-after hint in milliseconds */
  readonly retryAfterMs?: number;
  /** Additional error details */
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      status?: number;
      retryAfterMs?: number;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = this.constructor.name;
    this.status = options?.status;
    this.retryAfterMs = options?.retryAfterMs;
    this.details = options?.details;

    // Maintain proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON representation.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      isRetryable: this.isRetryable,
      status: this.status,
      retryAfterMs: this.retryAfterMs,
      details: this.details,
      stack: this.stack,
    };
  }

  /**
   * Create a string representation of the error.
   */
  toString(): string {
    let str = `${this.name}: ${this.message}`;
    if (this.status) {
      str += ` (status: ${this.status})`;
    }
    return str;
  }
}

/**
 * Error categories for classification.
 */
export enum ErrorCategory {
  Configuration = 'Configuration',
  Authentication = 'Authentication',
  Authorization = 'Authorization',
  Validation = 'Validation',
  Connection = 'Connection',
  Timeout = 'Timeout',
  RateLimit = 'RateLimit',
  NotFound = 'NotFound',
  Server = 'Server',
  Pool = 'Pool',
  Simulation = 'Simulation',
}
