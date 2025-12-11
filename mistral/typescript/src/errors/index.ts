/**
 * Error types for the Mistral client.
 */

/**
 * Error codes for Mistral errors.
 */
export enum MistralErrorCode {
  /** Configuration error. */
  Configuration = 'configuration',
  /** Authentication error. */
  Authentication = 'authentication',
  /** Permission denied. */
  Permission = 'permission',
  /** Resource not found. */
  NotFound = 'not_found',
  /** Bad request. */
  BadRequest = 'bad_request',
  /** Validation error. */
  Validation = 'validation',
  /** Rate limit exceeded. */
  RateLimit = 'rate_limit',
  /** Internal server error. */
  Internal = 'internal',
  /** Service unavailable. */
  ServiceUnavailable = 'service_unavailable',
  /** Gateway timeout. */
  GatewayTimeout = 'gateway_timeout',
  /** Network error. */
  Network = 'network',
  /** Timeout error. */
  Timeout = 'timeout',
  /** Streaming error. */
  Stream = 'stream',
  /** Serialization error. */
  Serialization = 'serialization',
  /** Deserialization error. */
  Deserialization = 'deserialization',
  /** Circuit breaker open. */
  CircuitOpen = 'circuit_open',
  /** Unknown error. */
  Unknown = 'unknown',
}

/**
 * Base error class for Mistral errors.
 */
export class MistralError extends Error {
  /** Error code. */
  readonly code: MistralErrorCode;
  /** HTTP status code if applicable. */
  readonly status?: number;
  /** Whether the error is retryable. */
  readonly retryable: boolean;
  /** Retry-after duration in seconds if applicable. */
  readonly retryAfter?: number;
  /** Request ID for debugging. */
  readonly requestId?: string;
  /** Original error if wrapped. */
  readonly cause?: Error;

  constructor(
    code: MistralErrorCode,
    message: string,
    options?: {
      status?: number;
      retryable?: boolean;
      retryAfter?: number;
      requestId?: string;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'MistralError';
    this.code = code;
    this.status = options?.status;
    this.retryable = options?.retryable ?? false;
    this.retryAfter = options?.retryAfter;
    this.requestId = options?.requestId;
    this.cause = options?.cause;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Creates a configuration error.
   */
  static configuration(message: string): MistralError {
    return new MistralError(MistralErrorCode.Configuration, message);
  }

  /**
   * Creates an authentication error.
   */
  static authentication(message: string): MistralError {
    return new MistralError(MistralErrorCode.Authentication, message, { status: 401 });
  }

  /**
   * Creates a permission error.
   */
  static permission(message: string): MistralError {
    return new MistralError(MistralErrorCode.Permission, message, { status: 403 });
  }

  /**
   * Creates a not found error.
   */
  static notFound(message: string, resource?: string): MistralError {
    return new MistralError(
      MistralErrorCode.NotFound,
      resource ? `${message}: ${resource}` : message,
      { status: 404 }
    );
  }

  /**
   * Creates a bad request error.
   */
  static badRequest(message: string): MistralError {
    return new MistralError(MistralErrorCode.BadRequest, message, { status: 400 });
  }

  /**
   * Creates a validation error.
   */
  static validation(message: string, errors?: string[]): MistralError {
    const fullMessage = errors?.length
      ? `${message}: ${errors.join(', ')}`
      : message;
    return new MistralError(MistralErrorCode.Validation, fullMessage, { status: 422 });
  }

  /**
   * Creates a rate limit error.
   */
  static rateLimit(message: string, retryAfter?: number): MistralError {
    return new MistralError(MistralErrorCode.RateLimit, message, {
      status: 429,
      retryable: true,
      retryAfter,
    });
  }

  /**
   * Creates an internal error.
   */
  static internal(message: string, requestId?: string): MistralError {
    return new MistralError(MistralErrorCode.Internal, message, {
      status: 500,
      retryable: true,
      requestId,
    });
  }

  /**
   * Creates a service unavailable error.
   */
  static serviceUnavailable(message: string, retryAfter?: number): MistralError {
    return new MistralError(MistralErrorCode.ServiceUnavailable, message, {
      status: 503,
      retryable: true,
      retryAfter,
    });
  }

  /**
   * Creates a gateway timeout error.
   */
  static gatewayTimeout(message: string): MistralError {
    return new MistralError(MistralErrorCode.GatewayTimeout, message, {
      status: 504,
      retryable: true,
    });
  }

  /**
   * Creates a network error.
   */
  static network(message: string, cause?: Error): MistralError {
    return new MistralError(MistralErrorCode.Network, message, {
      retryable: true,
      cause,
    });
  }

  /**
   * Creates a timeout error.
   */
  static timeout(message: string): MistralError {
    return new MistralError(MistralErrorCode.Timeout, message, { retryable: true });
  }

  /**
   * Creates a stream error.
   */
  static stream(message: string, cause?: Error): MistralError {
    return new MistralError(MistralErrorCode.Stream, message, { cause });
  }

  /**
   * Creates a circuit open error.
   */
  static circuitOpen(message: string): MistralError {
    return new MistralError(MistralErrorCode.CircuitOpen, message, { retryable: false });
  }

  /**
   * Creates an error from an HTTP response.
   */
  static fromResponse(
    status: number,
    body: string,
    headers?: Record<string, string>
  ): MistralError {
    const requestId = headers?.['x-request-id'];
    const retryAfter = headers?.['retry-after']
      ? parseInt(headers['retry-after'], 10)
      : undefined;

    let message = body;
    try {
      const parsed = JSON.parse(body);
      if (parsed.error?.message) {
        message = parsed.error.message;
      }
    } catch {
      // Use body as-is
    }

    switch (status) {
      case 400:
        return MistralError.badRequest(message);
      case 401:
        return MistralError.authentication(message);
      case 403:
        return MistralError.permission(message);
      case 404:
        return MistralError.notFound(message);
      case 422:
        return MistralError.validation(message);
      case 429:
        return MistralError.rateLimit(message, retryAfter);
      case 500:
        return MistralError.internal(message, requestId);
      case 503:
        return MistralError.serviceUnavailable(message, retryAfter);
      case 504:
        return MistralError.gatewayTimeout(message);
      default:
        return new MistralError(MistralErrorCode.Unknown, message, {
          status,
          requestId,
          retryable: status >= 500,
        });
    }
  }

  /**
   * Converts the error to a JSON object.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this.status,
      retryable: this.retryable,
      retryAfter: this.retryAfter,
      requestId: this.requestId,
    };
  }
}

/**
 * Type guard for MistralError.
 */
export function isMistralError(error: unknown): error is MistralError {
  return error instanceof MistralError;
}

/**
 * Type for operation results.
 */
export type Result<T, E = MistralError> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Creates a successful result.
 */
export function ok<T>(data: T): Result<T> {
  return { success: true, data };
}

/**
 * Creates a failed result.
 */
export function err<E = MistralError>(error: E): Result<never, E> {
  return { success: false, error };
}
