/**
 * Error mapping utilities for converting HTTP status codes and API errors
 * to appropriate GeminiError instances.
 */

import { GeminiError } from './types.js';
import {
  InvalidApiKeyError,
  ExpiredApiKeyError,
  AuthQuotaExceededError,
  ValidationError,
  InvalidModelError,
  InvalidParameterError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  TooManyRequestsError,
  QuotaExceededError,
  InternalServerError,
  ServiceUnavailableError,
  ModelOverloadedError,
  FileNotFoundError,
  ModelNotFoundError,
  CachedContentNotFoundError,
  SafetyBlockedError,
  RecitationBlockedError,
  ProhibitedContentError,
  DeserializationError,
} from './categories.js';

/**
 * Maps HTTP status code to appropriate GeminiError
 */
export function mapHttpStatusToError(
  status: number,
  message: string,
  retryAfter?: number
): GeminiError {
  switch (status) {
    case 400:
      // Try to determine specific 400 error
      if (message.toLowerCase().includes('validation')) {
        return new ValidationError(message);
      }
      if (message.toLowerCase().includes('model')) {
        return new InvalidModelError(message);
      }
      if (message.toLowerCase().includes('parameter')) {
        return new InvalidParameterError('unknown', message);
      }
      return new GeminiError({
        type: 'validation_error',
        message,
        status: 400,
        isRetryable: false,
      });

    case 401:
      if (message.toLowerCase().includes('expired')) {
        return new ExpiredApiKeyError();
      }
      return new InvalidApiKeyError();

    case 403:
      if (message.toLowerCase().includes('quota')) {
        return new AuthQuotaExceededError();
      }
      if (message.toLowerCase().includes('prohibited')) {
        return new ProhibitedContentError();
      }
      return new GeminiError({
        type: 'authentication_error',
        message,
        status: 403,
        isRetryable: false,
      });

    case 404:
      if (message.toLowerCase().includes('file')) {
        return new FileNotFoundError(message);
      }
      if (message.toLowerCase().includes('model')) {
        return new ModelNotFoundError(message);
      }
      if (message.toLowerCase().includes('cached')) {
        return new CachedContentNotFoundError(message);
      }
      return new GeminiError({
        type: 'resource_error',
        message,
        status: 404,
        isRetryable: false,
      });

    case 413:
      return new PayloadTooLargeError(0, 0);

    case 415:
      return new UnsupportedMediaTypeError('unknown');

    case 429:
      if (message.toLowerCase().includes('quota')) {
        return new QuotaExceededError(retryAfter);
      }
      return new TooManyRequestsError(retryAfter);

    case 500:
      return new InternalServerError(message);

    case 503:
      if (message.toLowerCase().includes('overload')) {
        return new ModelOverloadedError('unknown');
      }
      return new ServiceUnavailableError(retryAfter);

    default:
      return new GeminiError({
        type: 'unknown_error',
        message: `HTTP ${status}: ${message}`,
        status,
        isRetryable: status >= 500,
      });
  }
}

/**
 * Maps API error response to GeminiError
 */
export function mapApiErrorToGeminiError(error: {
  status?: number;
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
  retryAfter?: number;
}): GeminiError {
  const { status, message = 'Unknown error', code, details, retryAfter } = error;

  // Handle specific error codes if provided
  if (code) {
    switch (code.toUpperCase()) {
      case 'INVALID_API_KEY':
      case 'UNAUTHENTICATED':
        return new InvalidApiKeyError();

      case 'EXPIRED_API_KEY':
        return new ExpiredApiKeyError();

      case 'PERMISSION_DENIED':
      case 'QUOTA_EXCEEDED':
        if (status === 403) {
          return new AuthQuotaExceededError();
        }
        return new QuotaExceededError(retryAfter);

      case 'INVALID_ARGUMENT':
      case 'VALIDATION_ERROR':
        return new ValidationError(message);

      case 'INVALID_MODEL':
        return new InvalidModelError(message);

      case 'RESOURCE_EXHAUSTED':
      case 'RATE_LIMIT_EXCEEDED':
        return new TooManyRequestsError(retryAfter);

      case 'NOT_FOUND':
        if (message.toLowerCase().includes('file')) {
          return new FileNotFoundError(message);
        }
        if (message.toLowerCase().includes('model')) {
          return new ModelNotFoundError(message);
        }
        if (message.toLowerCase().includes('cached')) {
          return new CachedContentNotFoundError(message);
        }
        return new GeminiError({
          type: 'resource_error',
          message,
          status: 404,
          isRetryable: false,
        });

      case 'INTERNAL':
      case 'INTERNAL_ERROR':
        return new InternalServerError(message);

      case 'UNAVAILABLE':
      case 'SERVICE_UNAVAILABLE':
        return new ServiceUnavailableError(retryAfter);

      case 'DEADLINE_EXCEEDED':
      case 'TIMEOUT':
        return new GeminiError({
          type: 'network_error',
          message: `Request timeout: ${message}`,
          isRetryable: true,
        });

      case 'SAFETY_BLOCKED':
        return new SafetyBlockedError(
          details?.category as string,
          details?.probability as string
        );

      case 'RECITATION_BLOCKED':
        return new RecitationBlockedError();

      case 'PROHIBITED_CONTENT':
        return new ProhibitedContentError();

      case 'DESERIALIZATION_ERROR':
        return new DeserializationError(message);
    }
  }

  // Fall back to HTTP status mapping
  if (status) {
    return mapHttpStatusToError(status, message, retryAfter);
  }

  // Default unknown error
  return new GeminiError({
    type: 'unknown_error',
    message,
    isRetryable: false,
    details,
  });
}

/**
 * Extracts retry-after value from response headers
 */
export function extractRetryAfter(headers: Record<string, string>): number | undefined {
  const retryAfter = headers['retry-after'] || headers['Retry-After'];
  if (!retryAfter) {
    return undefined;
  }

  // Try parsing as number (seconds)
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds;
  }

  // Try parsing as HTTP date
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    const now = Date.now();
    const retryTime = date.getTime();
    return Math.max(0, Math.floor((retryTime - now) / 1000));
  }

  return undefined;
}
