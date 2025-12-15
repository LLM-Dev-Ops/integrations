/**
 * Discord error types and handling.
 *
 * Error hierarchy follows the SPARC specification with proper categorization
 * for retryable vs non-retryable errors.
 */

/**
 * Error codes for Discord errors.
 */
export enum DiscordErrorCode {
  // Rate limiting
  RateLimited = 'RATE_LIMITED',
  RateLimitTimeout = 'RATE_LIMIT_TIMEOUT',
  QueueFull = 'QUEUE_FULL',
  QueueTimeout = 'QUEUE_TIMEOUT',

  // Authentication
  NoAuthentication = 'NO_AUTHENTICATION',
  Unauthorized = 'UNAUTHORIZED',
  Forbidden = 'FORBIDDEN',

  // Resource errors
  NotFound = 'NOT_FOUND',
  InvalidWebhookUrl = 'INVALID_WEBHOOK_URL',
  UnknownChannelRoute = 'UNKNOWN_CHANNEL_ROUTE',
  NoWebhookConfigured = 'NO_WEBHOOK_CONFIGURED',

  // Request errors
  BadRequest = 'BAD_REQUEST',
  ValidationError = 'VALIDATION_ERROR',

  // Server errors
  ServerError = 'SERVER_ERROR',
  NetworkError = 'NETWORK_ERROR',

  // Simulation errors
  SimulationNoMatch = 'SIMULATION_NO_MATCH',
  SimulationLoadError = 'SIMULATION_LOAD_ERROR',

  // Configuration errors
  ConfigurationError = 'CONFIGURATION_ERROR',
}

/**
 * Discord API error response structure.
 */
export interface DiscordApiErrorResponse {
  /** Discord error code */
  code?: number;
  /** Error message */
  message?: string;
  /** Detailed errors per field */
  errors?: Record<string, unknown>;
  /** Retry-After value (present on 429) */
  retry_after?: number;
  /** Whether this is a global rate limit */
  global?: boolean;
}

/**
 * Base Discord error class.
 */
export class DiscordError extends Error {
  /** Error code */
  readonly code: DiscordErrorCode;
  /** HTTP status code (if applicable) */
  readonly statusCode?: number;
  /** Whether this error is retryable */
  readonly retryable: boolean;
  /** Retry-after duration in milliseconds */
  readonly retryAfterMs?: number;
  /** Discord API error code */
  readonly discordCode?: number;
  /** Additional error details */
  readonly details?: Record<string, unknown>;

  constructor(options: {
    code: DiscordErrorCode;
    message: string;
    statusCode?: number;
    retryable?: boolean;
    retryAfterMs?: number;
    discordCode?: number;
    details?: Record<string, unknown>;
    cause?: Error;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'DiscordError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.discordCode = options.discordCode;
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
      retryAfterMs: this.retryAfterMs,
      discordCode: this.discordCode,
      details: this.details,
    };
  }
}

// ============================================================================
// Rate Limiting Errors (Retryable)
// ============================================================================

/**
 * Rate limited by Discord API.
 */
export class RateLimitedError extends DiscordError {
  constructor(retryAfterMs: number, isGlobal: boolean = false) {
    super({
      code: DiscordErrorCode.RateLimited,
      message: `Rate limited${isGlobal ? ' (global)' : ''}, retry after ${retryAfterMs}ms`,
      statusCode: 429,
      retryable: true,
      retryAfterMs,
      details: { isGlobal },
    });
    this.name = 'RateLimitedError';
  }
}

/**
 * Rate limit wait time exceeded timeout.
 */
export class RateLimitTimeoutError extends DiscordError {
  constructor(waitTime: number, maxWait: number) {
    super({
      code: DiscordErrorCode.RateLimitTimeout,
      message: `Rate limit wait time (${waitTime}ms) exceeds maximum (${maxWait}ms)`,
      retryable: false,
      details: { waitTime, maxWait },
    });
    this.name = 'RateLimitTimeoutError';
  }
}

/**
 * Request queue is full.
 */
export class QueueFullError extends DiscordError {
  constructor(queueSize: number, maxSize: number) {
    super({
      code: DiscordErrorCode.QueueFull,
      message: `Request queue is full (${queueSize}/${maxSize})`,
      retryable: false,
      details: { queueSize, maxSize },
    });
    this.name = 'QueueFullError';
  }
}

/**
 * Request timed out waiting in queue.
 */
export class QueueTimeoutError extends DiscordError {
  constructor(timeout: number) {
    super({
      code: DiscordErrorCode.QueueTimeout,
      message: `Request timed out waiting in queue after ${timeout}ms`,
      retryable: false,
      details: { timeout },
    });
    this.name = 'QueueTimeoutError';
  }
}

// ============================================================================
// Authentication Errors (Non-Retryable)
// ============================================================================

/**
 * No authentication configured.
 */
export class NoAuthenticationError extends DiscordError {
  constructor() {
    super({
      code: DiscordErrorCode.NoAuthentication,
      message: 'No authentication configured (bot token or webhook URL required)',
      retryable: false,
    });
    this.name = 'NoAuthenticationError';
  }
}

/**
 * Invalid or expired token.
 */
export class UnauthorizedError extends DiscordError {
  constructor(message: string = 'Invalid or expired authentication token') {
    super({
      code: DiscordErrorCode.Unauthorized,
      message,
      statusCode: 401,
      retryable: false,
    });
    this.name = 'UnauthorizedError';
  }
}

/**
 * Missing permissions for the operation.
 */
export class ForbiddenError extends DiscordError {
  constructor(message: string = 'Missing permissions for this operation') {
    super({
      code: DiscordErrorCode.Forbidden,
      message,
      statusCode: 403,
      retryable: false,
    });
    this.name = 'ForbiddenError';
  }
}

// ============================================================================
// Resource Errors (Non-Retryable)
// ============================================================================

/**
 * Resource not found.
 */
export class NotFoundError extends DiscordError {
  constructor(resource: string) {
    super({
      code: DiscordErrorCode.NotFound,
      message: `Resource not found: ${resource}`,
      statusCode: 404,
      retryable: false,
      details: { resource },
    });
    this.name = 'NotFoundError';
  }
}

/**
 * Invalid webhook URL format.
 */
export class InvalidWebhookUrlError extends DiscordError {
  constructor() {
    super({
      code: DiscordErrorCode.InvalidWebhookUrl,
      message: 'Invalid webhook URL format',
      retryable: false,
    });
    this.name = 'InvalidWebhookUrlError';
  }
}

/**
 * Unknown channel route name.
 */
export class UnknownChannelRouteError extends DiscordError {
  constructor(name: string) {
    super({
      code: DiscordErrorCode.UnknownChannelRoute,
      message: `Unknown channel route: ${name}`,
      retryable: false,
      details: { routeName: name },
    });
    this.name = 'UnknownChannelRouteError';
  }
}

/**
 * No webhook URL configured.
 */
export class NoWebhookConfiguredError extends DiscordError {
  constructor() {
    super({
      code: DiscordErrorCode.NoWebhookConfigured,
      message: 'No webhook URL configured',
      retryable: false,
    });
    this.name = 'NoWebhookConfiguredError';
  }
}

// ============================================================================
// Request Errors (Non-Retryable)
// ============================================================================

/**
 * Bad request (invalid payload).
 */
export class BadRequestError extends DiscordError {
  constructor(message: string, discordCode?: number, errors?: Record<string, unknown>) {
    super({
      code: DiscordErrorCode.BadRequest,
      message,
      statusCode: 400,
      retryable: false,
      discordCode,
      details: errors ? { errors } : undefined,
    });
    this.name = 'BadRequestError';
  }
}

/**
 * Validation error (pre-request validation).
 */
export class ValidationError extends DiscordError {
  constructor(errors: string[]) {
    super({
      code: DiscordErrorCode.ValidationError,
      message: `Validation failed: ${errors.join(', ')}`,
      retryable: false,
      details: { errors },
    });
    this.name = 'ValidationError';
  }
}

// ============================================================================
// Server Errors (Retryable)
// ============================================================================

/**
 * Discord server error.
 */
export class ServerError extends DiscordError {
  constructor(statusCode: number, message: string = 'Discord server error') {
    super({
      code: DiscordErrorCode.ServerError,
      message,
      statusCode,
      retryable: true,
    });
    this.name = 'ServerError';
  }
}

/**
 * Network error (connection failure).
 */
export class NetworkError extends DiscordError {
  constructor(message: string, cause?: Error) {
    super({
      code: DiscordErrorCode.NetworkError,
      message: `Network error: ${message}`,
      retryable: true,
      cause,
    });
    this.name = 'NetworkError';
  }
}

// ============================================================================
// Simulation Errors (Non-Retryable)
// ============================================================================

/**
 * No matching recording for simulation replay.
 */
export class SimulationNoMatchError extends DiscordError {
  constructor(key: string) {
    super({
      code: DiscordErrorCode.SimulationNoMatch,
      message: `No simulation recording matches key: ${key}`,
      retryable: false,
      details: { key },
    });
    this.name = 'SimulationNoMatchError';
  }
}

/**
 * Failed to load simulation recordings.
 */
export class SimulationLoadError extends DiscordError {
  constructor(path: string, cause?: Error) {
    super({
      code: DiscordErrorCode.SimulationLoadError,
      message: `Failed to load simulation recordings from: ${path}`,
      retryable: false,
      details: { path },
      cause,
    });
    this.name = 'SimulationLoadError';
  }
}

// ============================================================================
// Configuration Errors (Non-Retryable)
// ============================================================================

/**
 * Configuration error.
 */
export class ConfigurationError extends DiscordError {
  constructor(message: string) {
    super({
      code: DiscordErrorCode.ConfigurationError,
      message: `Configuration error: ${message}`,
      retryable: false,
    });
    this.name = 'ConfigurationError';
  }
}

// ============================================================================
// Error Parsing Utilities
// ============================================================================

/**
 * Parses a Discord API error response into the appropriate error type.
 */
export function parseDiscordApiError(
  statusCode: number,
  body: DiscordApiErrorResponse | null,
  retryAfterHeader?: string
): DiscordError {
  const message = body?.message ?? `HTTP ${statusCode}`;
  const discordCode = body?.code;
  const errors = body?.errors;

  switch (statusCode) {
    case 400:
      return new BadRequestError(message, discordCode, errors);

    case 401:
      return new UnauthorizedError(message);

    case 403:
      return new ForbiddenError(message);

    case 404:
      return new NotFoundError(message);

    case 429: {
      // Rate limited - extract retry-after
      let retryAfterMs = 1000; // Default 1 second
      if (body?.retry_after) {
        retryAfterMs = body.retry_after * 1000;
      } else if (retryAfterHeader) {
        retryAfterMs = parseFloat(retryAfterHeader) * 1000;
      }
      return new RateLimitedError(retryAfterMs, body?.global ?? false);
    }

    default:
      if (statusCode >= 500) {
        return new ServerError(statusCode, message);
      }
      return new BadRequestError(message, discordCode, errors);
  }
}

/**
 * Checks if an error is a Discord error.
 */
export function isDiscordError(error: unknown): error is DiscordError {
  return error instanceof DiscordError;
}

/**
 * Checks if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (isDiscordError(error)) {
    return error.retryable;
  }
  // Network errors from fetch are typically retryable
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  return false;
}
