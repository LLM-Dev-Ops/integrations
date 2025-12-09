import { AnthropicError } from './error.js';

/**
 * Error thrown when the client is misconfigured (e.g., missing API key, invalid base URL)
 */
export class ConfigurationError extends AnthropicError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      type: 'configuration_error',
      message,
      isRetryable: false,
      details,
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * Error thrown when authentication fails (e.g., invalid API key)
 */
export class AuthenticationError extends AnthropicError {
  constructor(message: string, status?: number, details?: Record<string, unknown>) {
    super({
      type: 'authentication_error',
      message,
      status: status ?? 401,
      isRetryable: false,
      details,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when request validation fails (e.g., invalid parameters, malformed request)
 */
export class ValidationError extends AnthropicError {
  constructor(message: string, status?: number, details?: Record<string, unknown>) {
    super({
      type: 'invalid_request_error',
      message,
      status: status ?? 400,
      isRetryable: false,
      details,
    });
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when rate limits are exceeded
 */
export class RateLimitError extends AnthropicError {
  constructor(message: string, retryAfter?: number, details?: Record<string, unknown>) {
    super({
      type: 'rate_limit_error',
      message,
      status: 429,
      retryAfter,
      isRetryable: true,
      details,
    });
    this.name = 'RateLimitError';
  }
}

/**
 * Error thrown when network-level failures occur (e.g., connection timeout, DNS resolution failure)
 */
export class NetworkError extends AnthropicError {
  constructor(message: string, cause?: Error, details?: Record<string, unknown>) {
    super({
      type: 'network_error',
      message,
      isRetryable: true,
      details: { ...details, cause: cause?.message },
    });
    this.name = 'NetworkError';
  }
}

/**
 * Error thrown when the API server returns a 5xx error
 */
export class ServerError extends AnthropicError {
  constructor(message: string, status: number, details?: Record<string, unknown>) {
    super({
      type: 'api_error',
      message,
      status,
      isRetryable: true,
      details,
    });
    this.name = 'ServerError';
  }
}

/**
 * Error thrown when a requested resource is not found (404)
 */
export class NotFoundError extends AnthropicError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      type: 'not_found_error',
      message,
      status: 404,
      isRetryable: false,
      details,
    });
    this.name = 'NotFoundError';
  }
}

/**
 * Error thrown when streaming fails or is interrupted
 */
export class StreamError extends AnthropicError {
  constructor(message: string, cause?: Error, details?: Record<string, unknown>) {
    super({
      type: 'stream_error',
      message,
      isRetryable: false,
      details: { ...details, cause: cause?.message },
    });
    this.name = 'StreamError';
  }
}

/**
 * Error thrown when request is overloaded (529)
 */
export class OverloadedError extends AnthropicError {
  constructor(message: string, retryAfter?: number, details?: Record<string, unknown>) {
    super({
      type: 'overloaded_error',
      message,
      status: 529,
      retryAfter,
      isRetryable: true,
      details,
    });
    this.name = 'OverloadedError';
  }
}

/**
 * Error thrown when the request exceeds token or content length limits
 */
export class ContentTooLargeError extends AnthropicError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      type: 'invalid_request_error',
      message,
      status: 413,
      isRetryable: false,
      details,
    });
    this.name = 'ContentTooLargeError';
  }
}
