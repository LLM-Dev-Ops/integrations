/**
 * Error types for the Jenkins client.
 * @module errors
 */

/**
 * Error kinds for categorizing Jenkins errors.
 */
export enum JenkinsErrorKind {
  // API errors (HTTP status codes)
  /** Bad request (400). */
  BadRequest = 'bad_request',
  /** Unauthorized (401). */
  Unauthorized = 'unauthorized',
  /** Forbidden (403). */
  Forbidden = 'forbidden',
  /** Not found (404). */
  NotFound = 'not_found',
  /** Conflict (409). */
  Conflict = 'conflict',
  /** Internal server error (500). */
  InternalError = 'internal_error',
  /** Service unavailable (503). */
  ServiceUnavailable = 'service_unavailable',

  // Client errors
  /** Invalid job reference. */
  InvalidJobRef = 'invalid_job_ref',
  /** Invalid build reference. */
  InvalidBuildRef = 'invalid_build_ref',
  /** Invalid queue location. */
  InvalidQueueLocation = 'invalid_queue_location',
  /** No queue location returned. */
  NoQueueLocation = 'no_queue_location',
  /** Network connection failed. */
  Network = 'network',
  /** Request timeout. */
  Timeout = 'timeout',

  // Crumb errors
  /** CSRF crumb protection not enabled. */
  CrumbNotEnabled = 'crumb_not_enabled',
  /** Failed to fetch CSRF crumb. */
  CrumbFetchFailed = 'crumb_fetch_failed',

  // Queue errors
  /** Queue item timed out waiting for build. */
  QueueTimeout = 'queue_timeout',
  /** Queue item was cancelled. */
  QueueCancelled = 'queue_cancelled',

  // Pipeline errors
  /** Pipeline stage not found. */
  StageNotFound = 'stage_not_found',
  /** Pipeline input not found. */
  InputNotFound = 'input_not_found',

  // Simulation errors
  /** Simulation data not available. */
  SimulationMiss = 'simulation_miss',
  /** Simulation data corrupted. */
  SimulationCorrupted = 'simulation_corrupted',

  // Generic
  /** Unknown error. */
  Unknown = 'unknown',
}

/**
 * Jenkins API error with detailed information.
 */
export class JenkinsError extends Error {
  /** Error kind. */
  public readonly kind: JenkinsErrorKind;
  /** HTTP status code. */
  public readonly statusCode?: number;
  /** Jenkins request ID. */
  public readonly requestId?: string;
  /** Documentation URL. */
  public readonly documentationUrl?: string;
  /** Underlying cause. */
  public readonly cause?: Error;

  constructor(
    kind: JenkinsErrorKind,
    message: string,
    options?: {
      statusCode?: number;
      requestId?: string;
      documentationUrl?: string;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'JenkinsError';
    this.kind = kind;
    this.statusCode = options?.statusCode;
    this.requestId = options?.requestId;
    this.documentationUrl = options?.documentationUrl;
    this.cause = options?.cause;

    // Maintains proper stack trace for where error was thrown (only available on V8)
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
   * Sets the documentation URL.
   */
  withDocumentationUrl(url: string): this {
    return new JenkinsError(this.kind, this.message, {
      ...this,
      documentationUrl: url,
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
      JenkinsErrorKind.InternalError,
      JenkinsErrorKind.ServiceUnavailable,
      JenkinsErrorKind.Network,
      JenkinsErrorKind.Timeout,
    ].includes(this.kind);
  }

  /**
   * Creates an error from an HTTP status code and Jenkins error response.
   */
  static fromResponse(
    status: number,
    message: string,
    options?: {
      documentationUrl?: string;
      requestId?: string;
    }
  ): JenkinsError {
    const kind = JenkinsError.kindFromStatus(status);
    return new JenkinsError(kind, message, {
      statusCode: status,
      documentationUrl: options?.documentationUrl,
      requestId: options?.requestId,
    });
  }

  /**
   * Maps HTTP status code to error kind.
   */
  private static kindFromStatus(status: number): JenkinsErrorKind {
    switch (status) {
      case 400:
        return JenkinsErrorKind.BadRequest;
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
      case 503:
        return JenkinsErrorKind.ServiceUnavailable;
      default:
        return JenkinsErrorKind.Unknown;
    }
  }

  // Convenience factory methods

  /**
   * Creates a not found error.
   */
  static notFound(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.NotFound, message, {
      statusCode: 404,
    });
  }

  /**
   * Creates an unauthorized error.
   */
  static unauthorized(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.Unauthorized, message, {
      statusCode: 401,
    });
  }

  /**
   * Creates a forbidden error.
   */
  static forbidden(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.Forbidden, message, {
      statusCode: 403,
    });
  }

  /**
   * Creates a timeout error.
   */
  static timeout(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.Timeout, message);
  }

  /**
   * Creates a bad request error.
   */
  static badRequest(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.BadRequest, message, {
      statusCode: 400,
    });
  }

  /**
   * Creates an invalid job reference error.
   */
  static invalidJobRef(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.InvalidJobRef, message);
  }

  /**
   * Creates an invalid build reference error.
   */
  static invalidBuildRef(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.InvalidBuildRef, message);
  }

  /**
   * Creates a crumb not enabled error.
   */
  static crumbNotEnabled(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.CrumbNotEnabled, message);
  }

  /**
   * Creates a crumb fetch failed error.
   */
  static crumbFetchFailed(message: string, cause?: Error): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.CrumbFetchFailed, message, {
      cause,
    });
  }

  /**
   * Creates a queue timeout error.
   */
  static queueTimeout(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.QueueTimeout, message);
  }

  /**
   * Creates a queue cancelled error.
   */
  static queueCancelled(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.QueueCancelled, message);
  }

  /**
   * Creates a stage not found error.
   */
  static stageNotFound(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.StageNotFound, message);
  }

  /**
   * Creates an input not found error.
   */
  static inputNotFound(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.InputNotFound, message);
  }

  /**
   * Creates a simulation miss error.
   */
  static simulationMiss(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.SimulationMiss, message);
  }

  /**
   * Creates a simulation corrupted error.
   */
  static simulationCorrupted(message: string): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.SimulationCorrupted, message);
  }

  /**
   * Creates a network error.
   */
  static network(message: string, cause?: Error): JenkinsError {
    return new JenkinsError(JenkinsErrorKind.Network, message, { cause });
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
 * Result type alias for Jenkins operations.
 */
export type JenkinsResult<T> = Promise<T>;

/**
 * Type guard for JenkinsError.
 */
export function isJenkinsError(error: unknown): error is JenkinsError {
  return error instanceof JenkinsError;
}
