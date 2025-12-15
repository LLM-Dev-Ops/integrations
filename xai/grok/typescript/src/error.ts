/**
 * Grok Error Types
 *
 * Error taxonomy for xAI Grok API integration.
 *
 * @module error
 */

/**
 * Error codes for Grok API errors.
 */
export type GrokErrorCode =
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'CAPACITY_EXCEEDED'
  | 'CONTEXT_LENGTH_EXCEEDED'
  | 'MODEL_NOT_FOUND'
  | 'INVALID_REQUEST'
  | 'VALIDATION_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR'
  | 'SERVER_ERROR'
  | 'STREAM_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Error details from xAI API response.
 */
export interface GrokErrorDetails {
  /** xAI error type */
  readonly type?: string;

  /** Error code from API */
  readonly code?: string;

  /** Detailed error message */
  readonly message?: string;

  /** Parameter that caused the error */
  readonly param?: string;
}

/**
 * Grok API error.
 */
export class GrokError extends Error {
  /** Error code */
  readonly code: GrokErrorCode;

  /** HTTP status code */
  readonly statusCode?: number;

  /** Whether the error is retryable */
  readonly retryable: boolean;

  /** Retry-After header value in seconds */
  readonly retryAfter?: number;

  /** Error details from API */
  readonly details?: GrokErrorDetails;

  /** Request ID for support */
  readonly requestId?: string;

  constructor(
    message: string,
    code: GrokErrorCode,
    options: {
      statusCode?: number;
      retryable?: boolean;
      retryAfter?: number;
      details?: GrokErrorDetails;
      requestId?: string;
      cause?: Error;
    } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = 'GrokError';
    this.code = code;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.retryAfter = options.retryAfter;
    this.details = options.details;
    this.requestId = options.requestId;

    // Maintain proper stack trace for V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GrokError);
    }
  }

  /**
   * Create a string representation of the error.
   */
  override toString(): string {
    let str = `${this.name}: [${this.code}] ${this.message}`;
    if (this.statusCode) {
      str += ` (HTTP ${this.statusCode})`;
    }
    if (this.requestId) {
      str += ` [Request ID: ${this.requestId}]`;
    }
    return str;
  }

  /**
   * Convert to JSON for logging.
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
      requestId: this.requestId,
    };
  }
}

/**
 * Map HTTP status code to error code.
 *
 * @param statusCode - HTTP status code
 * @param errorBody - Error response body
 * @returns Mapped error code
 */
export function mapHttpStatusToErrorCode(
  statusCode: number,
  _errorBody?: GrokErrorDetails
): GrokErrorCode {
  switch (statusCode) {
    case 400:
      return 'INVALID_REQUEST';
    case 401:
      return 'AUTHENTICATION_ERROR';
    case 403:
      return 'AUTHORIZATION_ERROR';
    case 404:
      return 'MODEL_NOT_FOUND';
    case 422:
      return 'VALIDATION_ERROR';
    case 429:
      return 'RATE_LIMIT_ERROR';
    case 498:
      return 'CAPACITY_EXCEEDED';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'SERVER_ERROR';
    default:
      if (statusCode >= 400 && statusCode < 500) {
        return 'INVALID_REQUEST';
      }
      if (statusCode >= 500) {
        return 'SERVER_ERROR';
      }
      return 'UNKNOWN_ERROR';
  }
}

/**
 * Determine if an error is retryable based on status code.
 *
 * @param statusCode - HTTP status code
 * @returns True if the error is retryable
 */
export function isRetryableStatus(statusCode: number): boolean {
  return (
    statusCode === 429 || // Rate limit
    statusCode === 498 || // Capacity exceeded
    statusCode === 500 || // Internal server error
    statusCode === 502 || // Bad gateway
    statusCode === 503 || // Service unavailable
    statusCode === 504    // Gateway timeout
  );
}

/**
 * Parse error response from xAI API.
 *
 * @param statusCode - HTTP status code
 * @param body - Response body
 * @param headers - Response headers
 * @returns GrokError instance
 */
export function parseErrorResponse(
  statusCode: number,
  body: unknown,
  headers?: Headers
): GrokError {
  let details: GrokErrorDetails | undefined;
  let message = `HTTP ${statusCode} error`;

  // Parse error body (OpenAI-compatible format)
  if (body && typeof body === 'object') {
    const errorObj = body as Record<string, unknown>;
    if (errorObj.error && typeof errorObj.error === 'object') {
      const error = errorObj.error as Record<string, unknown>;
      details = {
        type: error.type as string | undefined,
        code: error.code as string | undefined,
        message: error.message as string | undefined,
        param: error.param as string | undefined,
      };
      if (details.message) {
        message = details.message;
      }
    }
  }

  const code = mapHttpStatusToErrorCode(statusCode, details);
  const retryable = isRetryableStatus(statusCode);

  // Parse Retry-After header
  let retryAfter: number | undefined;
  if (headers) {
    const retryAfterHeader = headers.get('retry-after');
    if (retryAfterHeader) {
      const parsed = parseInt(retryAfterHeader, 10);
      if (!isNaN(parsed)) {
        retryAfter = parsed;
      }
    }
  }

  // Parse request ID
  const requestId = headers?.get('x-request-id') ?? undefined;

  // Check for context length exceeded
  if (
    details?.code === 'context_length_exceeded' ||
    message.includes('context length')
  ) {
    return new GrokError(message, 'CONTEXT_LENGTH_EXCEEDED', {
      statusCode,
      retryable: false,
      details,
      requestId,
    });
  }

  return new GrokError(message, code, {
    statusCode,
    retryable,
    retryAfter,
    details,
    requestId,
  });
}

/**
 * Create a configuration error.
 *
 * @param message - Error message
 * @returns GrokError instance
 */
export function configurationError(message: string): GrokError {
  return new GrokError(message, 'CONFIGURATION_ERROR', {
    retryable: false,
  });
}

/**
 * Create a validation error.
 *
 * @param message - Error message
 * @param param - Parameter that failed validation
 * @returns GrokError instance
 */
export function validationError(message: string, param?: string): GrokError {
  return new GrokError(message, 'VALIDATION_ERROR', {
    retryable: false,
    details: param ? { param } : undefined,
  });
}

/**
 * Create a network error.
 *
 * @param message - Error message
 * @param cause - Original error
 * @returns GrokError instance
 */
export function networkError(message: string, cause?: Error): GrokError {
  return new GrokError(message, 'NETWORK_ERROR', {
    retryable: true,
    cause,
  });
}

/**
 * Create a timeout error.
 *
 * @param message - Error message
 * @returns GrokError instance
 */
export function timeoutError(message: string): GrokError {
  return new GrokError(message, 'TIMEOUT_ERROR', {
    retryable: true,
  });
}

/**
 * Create a stream error.
 *
 * @param message - Error message
 * @param cause - Original error
 * @returns GrokError instance
 */
export function streamError(message: string, cause?: Error): GrokError {
  return new GrokError(message, 'STREAM_ERROR', {
    retryable: false,
    cause,
  });
}
