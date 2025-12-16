import { StripeError } from './error.js';

/**
 * Error thrown when the client is misconfigured
 */
export class ConfigurationError extends StripeError {
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
 * Error thrown when authentication fails (invalid API key)
 */
export class AuthenticationError extends StripeError {
  constructor(message: string, requestId?: string, details?: Record<string, unknown>) {
    super({
      type: 'authentication_error',
      message,
      status: 401,
      isRetryable: false,
      requestId,
      details,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when request validation fails
 */
export class ValidationError extends StripeError {
  constructor(
    message: string,
    param?: string,
    status?: number,
    details?: Record<string, unknown>
  ) {
    super({
      type: 'invalid_request_error',
      message,
      status: status ?? 400,
      param,
      isRetryable: false,
      details,
    });
    this.name = 'ValidationError';
  }
}

/**
 * Error thrown when rate limits are exceeded
 */
export class RateLimitError extends StripeError {
  constructor(
    message: string,
    retryAfter?: number,
    requestId?: string,
    details?: Record<string, unknown>
  ) {
    super({
      type: 'rate_limit_error',
      message,
      status: 429,
      retryAfter,
      isRetryable: true,
      requestId,
      details,
    });
    this.name = 'RateLimitError';
  }
}

/**
 * Error thrown when network-level failures occur
 */
export class NetworkError extends StripeError {
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
export class ServerError extends StripeError {
  constructor(
    message: string,
    status: number,
    requestId?: string,
    details?: Record<string, unknown>
  ) {
    super({
      type: 'api_error',
      message,
      status,
      isRetryable: true,
      requestId,
      details,
    });
    this.name = 'ServerError';
  }
}

/**
 * Error thrown when a requested resource is not found
 */
export class NotFoundError extends StripeError {
  constructor(
    message: string,
    resourceType?: string,
    resourceId?: string,
    requestId?: string,
    details?: Record<string, unknown>
  ) {
    super({
      type: 'not_found_error',
      message,
      status: 404,
      isRetryable: false,
      requestId,
      details: { ...details, resourceType, resourceId },
    });
    this.name = 'NotFoundError';
  }
}

/**
 * Error thrown for card-related issues
 */
export class CardError extends StripeError {
  constructor(
    message: string,
    code: string,
    declineCode?: string,
    param?: string,
    requestId?: string,
    details?: Record<string, unknown>
  ) {
    super({
      type: 'card_error',
      message,
      status: 402,
      code,
      declineCode,
      param,
      isRetryable: false,
      requestId,
      details,
    });
    this.name = 'CardError';
  }
}

/**
 * Error thrown when idempotency key is reused with different parameters
 */
export class IdempotencyError extends StripeError {
  constructor(message: string, requestId?: string, details?: Record<string, unknown>) {
    super({
      type: 'idempotency_error',
      message,
      status: 409,
      isRetryable: false,
      requestId,
      details,
    });
    this.name = 'IdempotencyError';
  }
}

/**
 * Error thrown when webhook signature verification fails
 */
export class WebhookSignatureError extends StripeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      type: 'webhook_signature_error',
      message,
      status: 401,
      isRetryable: false,
      details,
    });
    this.name = 'WebhookSignatureError';
  }
}

/**
 * Error thrown when webhook event processing fails
 */
export class WebhookProcessingError extends StripeError {
  constructor(message: string, eventId?: string, details?: Record<string, unknown>) {
    super({
      type: 'webhook_processing_error',
      message,
      isRetryable: false,
      details: { ...details, eventId },
    });
    this.name = 'WebhookProcessingError';
  }
}

/**
 * Error thrown when simulation mode encounters issues
 */
export class SimulationError extends StripeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super({
      type: 'simulation_error',
      message,
      isRetryable: false,
      details,
    });
    this.name = 'SimulationError';
  }
}

/**
 * Error thrown when request times out
 */
export class TimeoutError extends StripeError {
  constructor(message: string, timeoutMs: number, details?: Record<string, unknown>) {
    super({
      type: 'timeout_error',
      message,
      isRetryable: true,
      details: { ...details, timeoutMs },
    });
    this.name = 'TimeoutError';
  }
}
