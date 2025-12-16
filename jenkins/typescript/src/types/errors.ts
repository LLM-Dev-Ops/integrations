/**
 * Error types for the Jenkins client.
 * @module errors
 */

/**
 * Jenkins error kinds for categorizing errors.
 */
export enum JenkinsErrorKind {
  // Configuration errors
  MissingAuth = 'missing_auth',
  InvalidBaseUrl = 'invalid_base_url',
  InvalidConfiguration = 'invalid_configuration',

  // Authentication/Authorization errors
  InvalidCredentials = 'invalid_credentials',
  Unauthorized = 'unauthorized',
  Forbidden = 'forbidden',

  // Request errors
  ValidationError = 'validation_error',
  InvalidParameter = 'invalid_parameter',
  MissingParameter = 'missing_parameter',

  // Resource errors
  NotFound = 'not_found',
  Conflict = 'conflict',

  // CSRF/Crumb errors
  CrumbError = 'crumb_error',
  CrumbExpired = 'crumb_expired',
  CsrfProtectionRequired = 'csrf_protection_required',

  // Network errors
  ConnectionFailed = 'connection_failed',
  Timeout = 'timeout',
  NetworkError = 'network_error',

  // Server errors
  InternalError = 'internal_error',
  BadGateway = 'bad_gateway',
  ServiceUnavailable = 'service_unavailable',

  // Response errors
  DeserializationError = 'deserialization_error',
  UnexpectedFormat = 'unexpected_format',
  InvalidJson = 'invalid_json',

  // Job/Build errors
  JobNotFound = 'job_not_found',
  BuildNotFound = 'build_not_found',
  JobDisabled = 'job_disabled',
  BuildInProgress = 'build_in_progress',
  QueueItemNotFound = 'queue_item_not_found',

  // Queue errors
  NoQueueLocation = 'no_queue_location',
  InvalidQueueLocation = 'invalid_queue_location',
  QueueTimeout = 'queue_timeout',
  QueueCancelled = 'queue_cancelled',

  // Generic
  Unknown = 'unknown',
}

/**
 * Jenkins API error with detailed information.
 */
export class JenkinsError extends Error {
  /** Error kind */
  public readonly kind: JenkinsErrorKind;
  /** HTTP status code */
  public readonly statusCode?: number;
  /** Jenkins request ID */
  public readonly requestId?: string;
  /** Underlying cause */
  public readonly cause?: Error;

  constructor(
    kind: JenkinsErrorKind,
    message: string,
    options?: {
      statusCode?: number;
      requestId?: string;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'JenkinsError';
    this.kind = kind;
    this.statusCode = options?.statusCode;
    this.requestId = options?.requestId;
    this.cause = options?.cause;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, JenkinsError);
    }
  }

  /**
   * Sets the HTTP status code.
   */
  withStatus(code: number): this {
    return new JenkinsError(this.kind, this.message, {
      ...this,
      statusCode: code,
    }) as this;
  }

  /**
   * Sets the Jenkins request ID.
   */
  withRequestId(id: string): this {
    return new JenkinsError(this.kind, this.message, {
      ...this,
      requestId: id,
    }) as this;
  }

  /**
   * Sets the underlying cause.
   */
  withCause(cause: Error): this {
    return new JenkinsError(this.kind, this.message, {
      ...this,
      cause,
    }) as this;
  }

  /**
   * Returns true if this error is retryable.
   */
  isRetryable(): boolean {
    return [
      JenkinsErrorKind.ConnectionFailed,
      JenkinsErrorKind.Timeout,
      JenkinsErrorKind.NetworkError,
      JenkinsErrorKind.InternalError,
      JenkinsErrorKind.BadGateway,
      JenkinsErrorKind.ServiceUnavailable,
    ].includes(this.kind);
  }

  /**
   * Creates an error from an HTTP status code and response.
   */
  static fromResponse(
    status: number,
    message: string,
    options?: {
      requestId?: string;
    }
  ): JenkinsError {
    const kind = JenkinsError.kindFromStatus(status);
    return new JenkinsError(kind, message, {
      statusCode: status,
      requestId: options?.requestId,
    });
  }

  /**
   * Maps HTTP status code to error kind.
   */
  private static kindFromStatus(status: number): JenkinsErrorKind {
    switch (status) {
      case 400:
        return JenkinsErrorKind.ValidationError;
      case 401:
        return JenkinsErrorKind.Unauthorized;
      case 403:
        return JenkinsErrorKind.Forbidden;
      case 404:
        return JenkinsErrorKind.NotFound;
      case 409:
        return JenkinsErrorKind.Conflict;
      case 500:
        return JenkinsErrorKind.InternalError;
      case 502:
        return JenkinsErrorKind.BadGateway;
      case 503:
        return JenkinsErrorKind.ServiceUnavailable;
      default:
        return JenkinsErrorKind.Unknown;
    }
  }

  // Convenience factory methods

  /**
   * Creates a configuration error.
   */
  static configuration(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.InvalidConfiguration, message);
  }

  /**
   * Creates an authentication error.
   */
  static authentication(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.InvalidCredentials, message);
  }

  /**
   * Creates a not found error.
   */
  static notFound(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.NotFound, message, {
      statusCode: 404,
    });
  }

  /**
   * Creates a timeout error.
   */
  static timeout(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.Timeout, message);
  }

  /**
   * Creates a crumb error.
   */
  static crumb(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.CrumbError, message);
  }

  /**
   * Creates a deserialization error.
   */
  static deserialization(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.DeserializationError, message);
  }

  /**
   * Formats the error for display.
   */
  toString(): string {
    let result = `[${this.kind}] ${this.message}`;
    if (this.statusCode) {
      result += ` (HTTP ${this.statusCode})`;
    }
    if (this.requestId) {
      result += ` [request_id: ${this.requestId}]`;
    }
    return result;
  }
}

/**
 * Type guard for JenkinsError.
 */
export function isJenkinsError(error: unknown): error is JenkinsError {
  return error instanceof JenkinsError;
}
