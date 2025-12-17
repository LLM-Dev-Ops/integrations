/**
 * Airtable error types and handling following SPARC specification.
 *
 * Error hierarchy with proper categorization for retryable vs non-retryable errors.
 * Maps HTTP status codes to appropriate error types.
 */

/**
 * Error codes for Airtable errors.
 */
export enum AirtableErrorCode {
  // Configuration errors
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  MISSING_CREDENTIALS = 'MISSING_CREDENTIALS',
  INVALID_BASE_URL = 'INVALID_BASE_URL',

  // Authentication errors
  UNAUTHORIZED = 'UNAUTHORIZED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INSUFFICIENT_SCOPE = 'INSUFFICIENT_SCOPE',

  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  RATE_LIMIT_EXHAUSTED = 'RATE_LIMIT_EXHAUSTED',
  QUEUE_TIMEOUT = 'QUEUE_TIMEOUT',

  // Resource errors
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  BATCH_SIZE_EXCEEDED = 'BATCH_SIZE_EXCEEDED',

  // Network/Server errors
  SERVER_ERROR = 'SERVER_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',

  // Webhook errors
  WEBHOOK_MISSING_SIGNATURE = 'WEBHOOK_MISSING_SIGNATURE',
  WEBHOOK_INVALID_SIGNATURE = 'WEBHOOK_INVALID_SIGNATURE',
  WEBHOOK_UNKNOWN = 'WEBHOOK_UNKNOWN',

  // Simulation errors
  SIMULATION_NOT_IN_REPLAY = 'SIMULATION_NOT_IN_REPLAY',
  SIMULATION_EXHAUSTED = 'SIMULATION_EXHAUSTED',
  SIMULATION_MISMATCH = 'SIMULATION_MISMATCH',

  // Circuit breaker
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
}

/**
 * Airtable API error response structure.
 */
export interface AirtableApiErrorResponse {
  /** Error object */
  error: {
    /** Error type/code */
    type: string;
    /** Error message */
    message: string;
  };
}

/**
 * Base Airtable error class.
 */
export class AirtableError extends Error {
  /** Error code */
  readonly code: AirtableErrorCode;
  /** HTTP status code (if applicable) */
  readonly statusCode?: number;
  /** Whether this error is retryable */
  readonly retryable: boolean;
  /** Retry-after duration in milliseconds */
  readonly retryAfter?: number;
  /** Additional error details */
  readonly details?: Record<string, unknown>;

  constructor(options: {
    code: AirtableErrorCode;
    message: string;
    statusCode?: number;
    retryable?: boolean;
    retryAfter?: number;
    details?: Record<string, unknown>;
    cause?: Error;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'AirtableError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.retryAfter = options.retryAfter;
    this.details = options.details;
  }

  /**
   * Creates a JSON representation of the error.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      retryAfter: this.retryAfter,
      details: this.details,
    };
  }
}

// ============================================================================
// Configuration Errors (Non-Retryable)
// ============================================================================

/**
 * Configuration error.
 */
export class ConfigurationError extends AirtableError {
  constructor(message: string) {
    super({
      code: AirtableErrorCode.CONFIGURATION_ERROR,
      message: `Configuration error: ${message}`,
      retryable: false,
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * Missing credentials error.
 */
export class MissingCredentialsError extends AirtableError {
  constructor() {
    super({
      code: AirtableErrorCode.MISSING_CREDENTIALS,
      message: 'Missing credentials (Personal Access Token or OAuth token required)',
      retryable: false,
    });
    this.name = 'MissingCredentialsError';
  }
}

/**
 * Invalid base URL error.
 */
export class InvalidBaseUrlError extends AirtableError {
  constructor(baseUrl: string) {
    super({
      code: AirtableErrorCode.INVALID_BASE_URL,
      message: `Invalid base URL: ${baseUrl}`,
      retryable: false,
      details: { baseUrl },
    });
    this.name = 'InvalidBaseUrlError';
  }
}

// ============================================================================
// Authentication Errors (Non-Retryable)
// ============================================================================

/**
 * Authentication error.
 */
export class AuthenticationError extends AirtableError {
  constructor(message: string = 'Authentication failed') {
    super({
      code: AirtableErrorCode.UNAUTHORIZED,
      message,
      statusCode: 401,
      retryable: false,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Token expired error.
 */
export class TokenExpiredError extends AirtableError {
  constructor() {
    super({
      code: AirtableErrorCode.TOKEN_EXPIRED,
      message: 'Authentication token has expired',
      statusCode: 401,
      retryable: true, // Can retry after refresh
    });
    this.name = 'TokenExpiredError';
  }
}

/**
 * Insufficient scope error.
 */
export class InsufficientScopeError extends AirtableError {
  constructor(requiredScope: string) {
    super({
      code: AirtableErrorCode.INSUFFICIENT_SCOPE,
      message: `Insufficient scope: ${requiredScope} required`,
      statusCode: 403,
      retryable: false,
      details: { requiredScope },
    });
    this.name = 'InsufficientScopeError';
  }
}

// ============================================================================
// Rate Limiting Errors (Retryable)
// ============================================================================

/**
 * Rate limit exceeded error.
 */
export class RateLimitedError extends AirtableError {
  constructor(retryAfterMs: number) {
    super({
      code: AirtableErrorCode.RATE_LIMIT_EXCEEDED,
      message: `Rate limited, retry after ${retryAfterMs}ms`,
      statusCode: 429,
      retryable: true,
      retryAfter: retryAfterMs,
    });
    this.name = 'RateLimitedError';
  }
}

/**
 * Rate limit exhausted error (exceeded max wait time).
 */
export class RateLimitExhaustedError extends AirtableError {
  constructor(waitTime: number, maxWait: number) {
    super({
      code: AirtableErrorCode.RATE_LIMIT_EXHAUSTED,
      message: `Rate limit wait time (${waitTime}ms) exceeds maximum (${maxWait}ms)`,
      retryable: false,
      details: { waitTime, maxWait },
    });
    this.name = 'RateLimitExhaustedError';
  }
}

/**
 * Queue timeout error.
 */
export class QueueTimeoutError extends AirtableError {
  constructor(timeoutMs: number) {
    super({
      code: AirtableErrorCode.QUEUE_TIMEOUT,
      message: `Request queued for too long (${timeoutMs}ms)`,
      retryable: false,
      details: { timeoutMs },
    });
    this.name = 'QueueTimeoutError';
  }
}

// ============================================================================
// Resource Errors (Non-Retryable)
// ============================================================================

/**
 * Resource not found error.
 */
export class NotFoundError extends AirtableError {
  constructor(resource: string) {
    super({
      code: AirtableErrorCode.NOT_FOUND,
      message: `Resource not found: ${resource}`,
      statusCode: 404,
      retryable: false,
      details: { resource },
    });
    this.name = 'NotFoundError';
  }
}

/**
 * Validation error.
 */
export class ValidationError extends AirtableError {
  constructor(message: string, field?: string) {
    super({
      code: AirtableErrorCode.VALIDATION_ERROR,
      message: field ? `Validation error for field '${field}': ${message}` : `Validation error: ${message}`,
      statusCode: 400,
      retryable: false,
      details: field ? { field } : undefined,
    });
    this.name = 'ValidationError';
  }
}

/**
 * Batch size exceeded error.
 */
export class BatchSizeExceededError extends AirtableError {
  constructor(max: number, actual: number) {
    super({
      code: AirtableErrorCode.BATCH_SIZE_EXCEEDED,
      message: `Batch size ${actual} exceeds maximum ${max}`,
      statusCode: 400,
      retryable: false,
      details: { max, actual },
    });
    this.name = 'BatchSizeExceededError';
  }
}

// ============================================================================
// Network/Server Errors (Retryable)
// ============================================================================

/**
 * Server error.
 */
export class ServerError extends AirtableError {
  constructor(statusCode: number, message: string = 'Airtable server error') {
    super({
      code: AirtableErrorCode.SERVER_ERROR,
      message,
      statusCode,
      retryable: true,
    });
    this.name = 'ServerError';
  }
}

/**
 * Network error.
 */
export class NetworkError extends AirtableError {
  constructor(message: string, cause?: Error) {
    super({
      code: AirtableErrorCode.NETWORK_ERROR,
      message: `Network error: ${message}`,
      retryable: true,
      cause,
    });
    this.name = 'NetworkError';
  }
}

/**
 * Request timeout error.
 */
export class TimeoutError extends AirtableError {
  constructor(timeoutMs: number) {
    super({
      code: AirtableErrorCode.TIMEOUT,
      message: `Request timed out after ${timeoutMs}ms`,
      retryable: true,
      details: { timeoutMs },
    });
    this.name = 'TimeoutError';
  }
}

// ============================================================================
// Webhook Errors (Non-Retryable)
// ============================================================================

/**
 * Missing webhook signature error.
 */
export class WebhookMissingSignatureError extends AirtableError {
  constructor() {
    super({
      code: AirtableErrorCode.WEBHOOK_MISSING_SIGNATURE,
      message: 'Missing webhook signature header',
      statusCode: 400,
      retryable: false,
    });
    this.name = 'WebhookMissingSignatureError';
  }
}

/**
 * Invalid webhook signature error.
 */
export class WebhookInvalidSignatureError extends AirtableError {
  constructor() {
    super({
      code: AirtableErrorCode.WEBHOOK_INVALID_SIGNATURE,
      message: 'Invalid webhook signature',
      statusCode: 401,
      retryable: false,
    });
    this.name = 'WebhookInvalidSignatureError';
  }
}

/**
 * Unknown webhook error.
 */
export class WebhookUnknownError extends AirtableError {
  constructor(webhookId: string) {
    super({
      code: AirtableErrorCode.WEBHOOK_UNKNOWN,
      message: `Unknown webhook: ${webhookId}`,
      statusCode: 404,
      retryable: false,
      details: { webhookId },
    });
    this.name = 'WebhookUnknownError';
  }
}

// ============================================================================
// Simulation Errors (Non-Retryable)
// ============================================================================

/**
 * Simulation not in replay mode error.
 */
export class SimulationNotInReplayError extends AirtableError {
  constructor() {
    super({
      code: AirtableErrorCode.SIMULATION_NOT_IN_REPLAY,
      message: 'Cannot use simulation recordings when not in replay mode',
      retryable: false,
    });
    this.name = 'SimulationNotInReplayError';
  }
}

/**
 * Simulation recordings exhausted error.
 */
export class SimulationExhaustedError extends AirtableError {
  constructor() {
    super({
      code: AirtableErrorCode.SIMULATION_EXHAUSTED,
      message: 'All simulation recordings have been consumed',
      retryable: false,
    });
    this.name = 'SimulationExhaustedError';
  }
}

/**
 * Simulation mismatch error.
 */
export class SimulationMismatchError extends AirtableError {
  constructor(expected: string, actual: string) {
    super({
      code: AirtableErrorCode.SIMULATION_MISMATCH,
      message: `Simulation mismatch: expected ${expected}, got ${actual}`,
      retryable: false,
      details: { expected, actual },
    });
    this.name = 'SimulationMismatchError';
  }
}

// ============================================================================
// Circuit Breaker Errors
// ============================================================================

/**
 * Circuit breaker is open error.
 */
export class CircuitBreakerOpenError extends AirtableError {
  constructor(resetInMs: number) {
    super({
      code: AirtableErrorCode.CIRCUIT_BREAKER_OPEN,
      message: `Circuit breaker is open, resets in ${resetInMs}ms`,
      retryable: false,
      details: { resetInMs },
    });
    this.name = 'CircuitBreakerOpenError';
  }
}

// ============================================================================
// Error Parsing Utilities
// ============================================================================

/**
 * Parses an Airtable API error response into the appropriate error type.
 *
 * @param statusCode - HTTP status code
 * @param body - Response body (may contain error object)
 * @param retryAfter - Retry-After header value in seconds
 * @returns Appropriate AirtableError instance
 */
export function parseAirtableApiError(
  statusCode: number,
  body?: AirtableApiErrorResponse | null,
  retryAfter?: number
): AirtableError {
  const errorType = body?.error?.type ?? 'UNKNOWN_ERROR';
  const errorMessage = body?.error?.message ?? `HTTP ${statusCode}`;

  switch (statusCode) {
    case 400: {
      // Validation errors
      if (errorType === 'INVALID_REQUEST' || errorMessage.toLowerCase().includes('invalid')) {
        return new ValidationError(errorMessage);
      }
      // Batch size errors
      if (errorMessage.toLowerCase().includes('batch') || errorMessage.toLowerCase().includes('too many')) {
        // Try to extract numbers from message
        const match = errorMessage.match(/(\d+)/g);
        if (match && match.length >= 2 && match[0] !== undefined && match[1] !== undefined) {
          return new BatchSizeExceededError(parseInt(match[0], 10), parseInt(match[1], 10));
        }
        return new ValidationError(errorMessage);
      }
      return new ValidationError(errorMessage);
    }

    case 401: {
      if (errorMessage.toLowerCase().includes('expired')) {
        return new TokenExpiredError();
      }
      return new AuthenticationError(errorMessage);
    }

    case 403: {
      if (errorMessage.toLowerCase().includes('scope')) {
        return new InsufficientScopeError(errorMessage);
      }
      return new AuthenticationError(errorMessage);
    }

    case 404: {
      return new NotFoundError(errorMessage);
    }

    case 429: {
      // Rate limited - extract retry-after
      let retryAfterMs = 30000; // Default 30 seconds
      if (retryAfter !== undefined) {
        // Airtable returns retry-after in seconds
        retryAfterMs = retryAfter * 1000;
      }
      return new RateLimitedError(retryAfterMs);
    }

    case 500:
    case 502:
    case 503:
    case 504: {
      return new ServerError(statusCode, errorMessage);
    }

    default: {
      if (statusCode >= 500) {
        return new ServerError(statusCode, errorMessage);
      }
      // Default to validation error for 4xx errors
      if (statusCode >= 400 && statusCode < 500) {
        return new ValidationError(errorMessage);
      }
      // Unexpected status code
      return new ServerError(statusCode, errorMessage);
    }
  }
}

/**
 * Checks if an error is an Airtable error.
 *
 * @param error - Error to check
 * @returns True if error is an AirtableError
 */
export function isAirtableError(error: unknown): error is AirtableError {
  return error instanceof AirtableError;
}

/**
 * Checks if an error is retryable.
 *
 * @param error - Error to check
 * @returns True if error can be retried
 */
export function isRetryableError(error: unknown): boolean {
  if (isAirtableError(error)) {
    return error.retryable;
  }
  // Network errors from fetch are typically retryable
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  return false;
}

/**
 * Gets retry delay in milliseconds from error, if applicable.
 *
 * @param error - Error to extract retry delay from
 * @returns Retry delay in milliseconds, or undefined if not applicable
 */
export function getRetryDelayMs(error: unknown): number | undefined {
  if (isAirtableError(error)) {
    return error.retryAfter;
  }
  return undefined;
}
