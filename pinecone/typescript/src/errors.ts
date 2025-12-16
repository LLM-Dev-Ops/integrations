/**
 * Error classes for the Pinecone client.
 * Provides structured error handling with retry capabilities and error categorization.
 * @module errors
 */

/**
 * Base error class for all Pinecone errors.
 * Provides structured error information including error code, message,
 * retry capabilities, and optional retry-after information.
 */
export class PineconeError extends Error {
  /**
   * Error code for categorization.
   */
  public readonly code: string;

  /**
   * Indicates whether this error type can be retried.
   */
  public readonly retryable: boolean;

  /**
   * HTTP status code associated with the error, if applicable.
   */
  public readonly statusCode?: number;

  /**
   * Additional error details.
   */
  public readonly details?: Record<string, unknown>;

  constructor(options: {
    code: string;
    message: string;
    retryable: boolean;
    statusCode?: number;
    details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = 'PineconeError';
    this.code = options.code;
    this.retryable = options.retryable;
    this.statusCode = options.statusCode;
    this.details = options.details;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns whether this error is retryable.
   * @returns True if the error can be retried, false otherwise.
   */
  isRetryable(): boolean {
    return this.retryable;
  }

  /**
   * Returns the error code.
   * @returns The error code.
   */
  get errorCode(): string {
    return this.code;
  }

  /**
   * Returns a JSON representation of the error.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

/**
 * Error thrown when authentication fails (401).
 * This typically indicates an invalid or missing API key.
 */
export class AuthenticationError extends PineconeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'authentication_error',
      message,
      retryable: false,
      statusCode: 401,
      details,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when authorization fails (403).
 * This indicates the authenticated user doesn't have permission for the requested operation.
 */
export class AuthorizationError extends PineconeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'authorization_error',
      message,
      retryable: false,
      statusCode: 403,
      details,
    });
    this.name = 'AuthorizationError';
  }
}

/**
 * Error thrown when a requested resource is not found (404).
 */
export class NotFoundError extends PineconeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'not_found_error',
      message,
      retryable: false,
      statusCode: 404,
      details,
    });
    this.name = 'NotFoundError';
  }
}

/**
 * Error thrown when rate limits are exceeded (429).
 * Includes information about when to retry.
 */
export class RateLimitError extends PineconeError {
  /**
   * Number of seconds to wait before retrying, if provided by the API.
   */
  private readonly _retryAfter?: number;

  constructor(message: string, retryAfter?: number, details?: Record<string, unknown>) {
    super({
      code: 'rate_limit_error',
      message,
      retryable: true,
      statusCode: 429,
      details: {
        ...details,
        retryAfter,
      },
    });
    this.name = 'RateLimitError';
    this._retryAfter = retryAfter;
  }

  /**
   * Returns the number of seconds to wait before retrying.
   * @returns The retry-after value in seconds, if available.
   */
  get retryAfter(): number | undefined {
    return this._retryAfter;
  }
}

/**
 * Error thrown when request validation fails.
 * This typically indicates invalid parameters or malformed requests.
 */
export class ValidationError extends PineconeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'validation_error',
      message,
      retryable: false,
      statusCode: 400,
      details,
    });
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when the server returns a 5xx error.
 * These errors are typically retryable as they indicate temporary server issues.
 */
export class ServerError extends PineconeError {
  constructor(message: string, statusCode: number, details?: Record<string, unknown>) {
    super({
      code: 'server_error',
      message,
      retryable: true,
      statusCode,
      details,
    });
    this.name = 'ServerError';
  }
}

/**
 * Error thrown when network-level connection failures occur.
 * This includes DNS resolution failures, connection timeouts, etc.
 */
export class ConnectionError extends PineconeError {
  constructor(message: string, cause?: Error, details?: Record<string, unknown>) {
    super({
      code: 'connection_error',
      message,
      retryable: true,
      details: {
        ...details,
        cause: cause?.message,
      },
    });
    this.name = 'ConnectionError';
  }
}

/**
 * Error thrown when a request times out.
 */
export class TimeoutError extends PineconeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      code: 'timeout_error',
      message,
      retryable: true,
      details,
    });
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when connection pool operations fail.
 * This includes failures to acquire connections, pool exhaustion, etc.
 */
export class PoolError extends PineconeError {
  constructor(message: string, retryable: boolean = false, details?: Record<string, unknown>) {
    super({
      code: 'pool_error',
      message,
      retryable,
      details,
    });
    this.name = 'PoolError';
  }
}

/**
 * Error thrown by the simulation layer.
 * Used for testing and simulation purposes.
 */
export class SimulationError extends PineconeError {
  constructor(message: string, retryable: boolean = false, details?: Record<string, unknown>) {
    super({
      code: 'simulation_error',
      message,
      retryable,
      details,
    });
    this.name = 'SimulationError';
  }
}

/**
 * Creates an appropriate error instance from an HTTP response.
 * @param status - HTTP status code.
 * @param message - Error message.
 * @param details - Optional additional error details.
 * @returns An appropriate PineconeError subclass instance.
 */
export function createErrorFromResponse(
  status: number,
  message: string,
  details?: Record<string, unknown>
): PineconeError {
  switch (status) {
    case 400:
      return new ValidationError(message, details);
    case 401:
      return new AuthenticationError(message, details);
    case 403:
      return new AuthorizationError(message, details);
    case 404:
      return new NotFoundError(message, details);
    case 429: {
      // Try to extract retry-after from details if available
      const retryAfter = details?.retryAfter as number | undefined;
      return new RateLimitError(message, retryAfter, details);
    }
    default:
      if (status >= 500 && status < 600) {
        return new ServerError(message, status, details);
      }
      // For any other status codes, return a generic PineconeError
      return new PineconeError({
        code: 'unknown_error',
        message: message || `HTTP error ${status}`,
        retryable: false,
        statusCode: status,
        details,
      });
  }
}

/**
 * Type guard to check if an error is a PineconeError.
 * @param error - The error to check.
 * @returns True if the error is a PineconeError, false otherwise.
 */
export function isPineconeError(error: unknown): error is PineconeError {
  return error instanceof PineconeError;
}

/**
 * Type guard to check if an error is retryable.
 * @param error - The error to check.
 * @returns True if the error is retryable, false otherwise.
 */
export function isRetryableError(error: unknown): boolean {
  if (isPineconeError(error)) {
    return error.isRetryable();
  }
  return false;
}
