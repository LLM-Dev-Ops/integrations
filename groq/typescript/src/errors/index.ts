/**
 * Error types for the Groq client.
 */

/**
 * Error codes for Groq errors.
 */
export enum GroqErrorCode {
  /** Configuration error. */
  Configuration = 'configuration_error',
  /** Authentication error. */
  Authentication = 'authentication_error',
  /** Authorization error. */
  Authorization = 'authorization_error',
  /** Validation error. */
  Validation = 'validation_error',
  /** Model not found or unavailable. */
  Model = 'model_error',
  /** Context length exceeded. */
  ContextLength = 'context_length_exceeded',
  /** Content filter triggered. */
  ContentFilter = 'content_filter_error',
  /** Rate limit exceeded. */
  RateLimit = 'rate_limit_error',
  /** Server error. */
  Server = 'server_error',
  /** Network error. */
  Network = 'network_error',
  /** Timeout error. */
  Timeout = 'timeout_error',
  /** Stream error. */
  Stream = 'stream_error',
  /** Circuit breaker open. */
  CircuitOpen = 'circuit_open',
  /** Unknown error. */
  Unknown = 'unknown_error',
}

/**
 * Additional error details.
 */
export interface GroqErrorDetails {
  /** HTTP status code. */
  statusCode?: number;
  /** Request ID for debugging. */
  requestId?: string;
  /** Parameter that caused the error. */
  param?: string;
  /** Invalid value. */
  value?: string;
  /** Retry after duration in seconds. */
  retryAfter?: number;
  /** API key hint (last 4 chars). */
  apiKeyHint?: string;
  /** Model ID. */
  model?: string;
  /** Original error. */
  cause?: Error;
}

/**
 * Groq API error.
 */
export class GroqError extends Error {
  /** Error code. */
  readonly code: GroqErrorCode;

  /** Additional error details. */
  readonly details: GroqErrorDetails;

  constructor(code: GroqErrorCode, message: string, details: GroqErrorDetails = {}) {
    super(message);
    this.name = 'GroqError';
    this.code = code;
    this.details = details;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GroqError);
    }
  }

  /**
   * Returns true if this error is retryable.
   */
  isRetryable(): boolean {
    return [
      GroqErrorCode.RateLimit,
      GroqErrorCode.Server,
      GroqErrorCode.Network,
      GroqErrorCode.Timeout,
      GroqErrorCode.CircuitOpen,
    ].includes(this.code);
  }

  /**
   * Returns the retry-after duration in seconds if available.
   */
  getRetryAfter(): number | undefined {
    return this.details.retryAfter;
  }

  /**
   * Returns true if this error should trigger circuit breaker.
   */
  shouldCircuitBreak(): boolean {
    return (
      this.code === GroqErrorCode.Server ||
      this.code === GroqErrorCode.Timeout ||
      (this.details.statusCode !== undefined &&
        this.details.statusCode >= 500 &&
        this.details.statusCode <= 504)
    );
  }

  /**
   * Creates a configuration error.
   */
  static configuration(message: string): GroqError {
    return new GroqError(GroqErrorCode.Configuration, message);
  }

  /**
   * Creates an authentication error.
   */
  static authentication(message: string, apiKeyHint?: string): GroqError {
    return new GroqError(GroqErrorCode.Authentication, message, { apiKeyHint });
  }

  /**
   * Creates a validation error.
   */
  static validation(message: string, param?: string, value?: string): GroqError {
    return new GroqError(GroqErrorCode.Validation, message, { param, value });
  }

  /**
   * Creates a model error.
   */
  static model(message: string, model?: string): GroqError {
    return new GroqError(GroqErrorCode.Model, message, { model });
  }

  /**
   * Creates a rate limit error.
   */
  static rateLimit(message: string, retryAfter?: number): GroqError {
    return new GroqError(GroqErrorCode.RateLimit, message, { retryAfter });
  }

  /**
   * Creates a server error.
   */
  static server(message: string, statusCode: number, requestId?: string): GroqError {
    return new GroqError(GroqErrorCode.Server, message, { statusCode, requestId });
  }

  /**
   * Creates a network error.
   */
  static network(message: string, cause?: Error): GroqError {
    return new GroqError(GroqErrorCode.Network, message, { cause });
  }

  /**
   * Creates a timeout error.
   */
  static timeout(message: string): GroqError {
    return new GroqError(GroqErrorCode.Timeout, message);
  }

  /**
   * Creates a stream error.
   */
  static stream(message: string): GroqError {
    return new GroqError(GroqErrorCode.Stream, message);
  }

  /**
   * Creates a circuit open error.
   */
  static circuitOpen(): GroqError {
    return new GroqError(
      GroqErrorCode.CircuitOpen,
      'Circuit breaker open: service temporarily unavailable'
    );
  }

  /**
   * Converts to JSON.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * API error response from Groq.
 */
export interface ApiErrorResponse {
  error: {
    type?: string;
    message: string;
    param?: string;
    code?: string;
  };
}

/**
 * Type guard for GroqError.
 */
export function isGroqError(error: unknown): error is GroqError {
  return error instanceof GroqError;
}

/**
 * Checks if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (isGroqError(error)) {
    return error.isRetryable();
  }
  return false;
}

/**
 * Creates a GroqError from an API error response.
 */
export function fromApiError(
  status: number,
  body: ApiErrorResponse,
  requestId?: string
): GroqError {
  const { error } = body;
  const errorType = error.type ?? '';

  switch (status) {
    case 401:
      return GroqError.authentication(error.message);
    case 403:
      return new GroqError(GroqErrorCode.Authorization, error.message);
    case 404:
      if (errorType === 'model_not_found') {
        return GroqError.model(error.message, error.param);
      }
      return new GroqError(GroqErrorCode.Model, error.message);
    case 400:
      return GroqError.validation(error.message, error.param);
    case 429:
      return GroqError.rateLimit(error.message);
    default:
      if (status >= 500 && status < 600) {
        return GroqError.server(error.message, status, requestId);
      }
      return new GroqError(GroqErrorCode.Unknown, error.message, {
        statusCode: status,
        requestId,
      });
  }
}
