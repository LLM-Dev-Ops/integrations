/**
 * Error types for the Amazon ECR client.
 * @module errors
 */

/**
 * Error kinds for categorizing ECR errors.
 */
export enum EcrErrorKind {
  // Resource errors
  /** Repository does not exist. */
  RepositoryNotFound = 'repository_not_found',
  /** Image not found. */
  ImageNotFound = 'image_not_found',
  /** Image layers not available. */
  LayersNotFound = 'layers_not_found',
  /** Lifecycle policy not found. */
  LifecyclePolicyNotFound = 'lifecycle_policy_not_found',
  /** Repository policy not found. */
  RepositoryPolicyNotFound = 'repository_policy_not_found',
  /** Scan not found. */
  ScanNotFound = 'scan_not_found',

  // Request errors
  /** Invalid request parameter. */
  InvalidParameter = 'invalid_parameter',
  /** Invalid layer part. */
  InvalidLayerPart = 'invalid_layer_part',

  // Limit errors
  /** Service limit exceeded. */
  LimitExceeded = 'limit_exceeded',
  /** Too many tags on resource. */
  TooManyTags = 'too_many_tags',

  // Image operation errors
  /** Image tag already exists (immutable repository). */
  ImageTagAlreadyExists = 'image_tag_already_exists',
  /** Image digest verification failed. */
  ImageDigestMismatch = 'image_digest_mismatch',

  // Authorization errors
  /** Insufficient permissions. */
  AccessDenied = 'access_denied',

  // KMS errors
  /** KMS operation failed. */
  KmsError = 'kms_error',

  // Service errors
  /** ECR service error. */
  ServiceUnavailable = 'service_unavailable',
  /** Request throttled. */
  ThrottlingException = 'throttling_exception',

  // Network errors
  /** Request timeout. */
  Timeout = 'timeout',
  /** Connection failed. */
  ConnectionFailed = 'connection_failed',

  // Scan errors
  /** Scan is in progress. */
  ScanInProgress = 'scan_in_progress',
  /** Scan failed. */
  ScanFailed = 'scan_failed',

  // Configuration errors
  /** Invalid configuration. */
  InvalidConfiguration = 'invalid_configuration',
  /** Missing authentication configuration. */
  MissingAuth = 'missing_auth',
  /** Invalid region. */
  InvalidRegion = 'invalid_region',
  /** Invalid endpoint URL. */
  InvalidEndpointUrl = 'invalid_endpoint_url',

  // Generic
  /** Unknown error. */
  Unknown = 'unknown',
}

/**
 * Amazon ECR API error with detailed information.
 */
export class EcrError extends Error {
  /** Error kind. */
  public readonly kind: EcrErrorKind;
  /** HTTP status code. */
  public readonly statusCode?: number;
  /** AWS request ID. */
  public readonly requestId?: string;
  /** Retry-After header value in seconds (if present). */
  public readonly retryAfter?: number;
  /** Underlying cause. */
  public readonly cause?: Error;

  constructor(
    kind: EcrErrorKind,
    message: string,
    options?: {
      statusCode?: number;
      requestId?: string;
      retryAfter?: number;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'EcrError';
    this.kind = kind;
    this.statusCode = options?.statusCode;
    this.requestId = options?.requestId;
    this.retryAfter = options?.retryAfter;
    this.cause = options?.cause;

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EcrError);
    }
  }

  /**
   * Sets the HTTP status code.
   */
  withStatus(code: number): this {
    return new EcrError(this.kind, this.message, {
      ...this,
      statusCode: code,
    }) as this;
  }

  /**
   * Sets the AWS request ID.
   */
  withRequestId(id: string): this {
    return new EcrError(this.kind, this.message, {
      ...this,
      requestId: id,
    }) as this;
  }

  /**
   * Sets the retry-after duration.
   */
  withRetryAfter(seconds: number): this {
    return new EcrError(this.kind, this.message, {
      ...this,
      retryAfter: seconds,
    }) as this;
  }

  /**
   * Sets the underlying cause.
   */
  withCause(cause: Error): this {
    return new EcrError(this.kind, this.message, {
      ...this,
      cause,
    }) as this;
  }

  /**
   * Returns true if this error is retryable.
   * Retryable errors include:
   * - LimitExceeded: Service limit exceeded, may succeed after backoff
   * - KmsError: Some KMS errors are transient
   * - ServiceUnavailable: ECR service error, temporary
   * - ThrottlingException: Request throttled, retry with backoff
   * - Timeout: Network timeout, may succeed on retry
   * - ConnectionFailed: Network issue, may be transient
   */
  isRetryable(): boolean {
    return [
      EcrErrorKind.LimitExceeded,
      EcrErrorKind.KmsError,
      EcrErrorKind.ServiceUnavailable,
      EcrErrorKind.ThrottlingException,
      EcrErrorKind.Timeout,
      EcrErrorKind.ConnectionFailed,
    ].includes(this.kind);
  }

  /**
   * Creates an error from an HTTP status code and ECR error response.
   */
  static fromResponse(
    status: number,
    message: string,
    options?: {
      errorCode?: string;
      requestId?: string;
      retryAfter?: number;
    }
  ): EcrError {
    const kind = EcrError.kindFromErrorCode(options?.errorCode, status);
    return new EcrError(kind, message, {
      statusCode: status,
      requestId: options?.requestId,
      retryAfter: options?.retryAfter,
    });
  }

  /**
   * Maps AWS error code and HTTP status to error kind.
   */
  private static kindFromErrorCode(
    errorCode?: string,
    status?: number
  ): EcrErrorKind {
    if (errorCode) {
      switch (errorCode) {
        case 'RepositoryNotFoundException':
          return EcrErrorKind.RepositoryNotFound;
        case 'ImageNotFoundException':
          return EcrErrorKind.ImageNotFound;
        case 'LayersNotFoundException':
          return EcrErrorKind.LayersNotFound;
        case 'LifecyclePolicyNotFoundException':
          return EcrErrorKind.LifecyclePolicyNotFound;
        case 'RepositoryPolicyNotFoundException':
          return EcrErrorKind.RepositoryPolicyNotFound;
        case 'ScanNotFoundException':
          return EcrErrorKind.ScanNotFound;
        case 'InvalidParameterException':
          return EcrErrorKind.InvalidParameter;
        case 'InvalidLayerPartException':
          return EcrErrorKind.InvalidLayerPart;
        case 'LimitExceededException':
          return EcrErrorKind.LimitExceeded;
        case 'TooManyTagsException':
          return EcrErrorKind.TooManyTags;
        case 'ImageTagAlreadyExistsException':
          return EcrErrorKind.ImageTagAlreadyExists;
        case 'ImageDigestDoesNotMatchException':
          return EcrErrorKind.ImageDigestMismatch;
        case 'AccessDeniedException':
          return EcrErrorKind.AccessDenied;
        case 'KmsException':
          return EcrErrorKind.KmsError;
        case 'ServerException':
          return EcrErrorKind.ServiceUnavailable;
        case 'ThrottlingException':
          return EcrErrorKind.ThrottlingException;
        case 'ScanInProgressException':
          return EcrErrorKind.ScanInProgress;
      }
    }

    // Fallback to HTTP status code
    if (status) {
      switch (status) {
        case 400:
          return EcrErrorKind.InvalidParameter;
        case 403:
          return EcrErrorKind.AccessDenied;
        case 404:
          return EcrErrorKind.RepositoryNotFound;
        case 429:
          return EcrErrorKind.ThrottlingException;
        case 500:
        case 502:
        case 503:
        case 504:
          return EcrErrorKind.ServiceUnavailable;
      }
    }

    return EcrErrorKind.Unknown;
  }

  // Convenience factory methods

  /**
   * Creates a configuration error.
   */
  static configuration(message: string): EcrError {
    return new EcrError(EcrErrorKind.InvalidConfiguration, message);
  }

  /**
   * Creates a not found error.
   */
  static notFound(message: string): EcrError {
    return new EcrError(EcrErrorKind.RepositoryNotFound, message, {
      statusCode: 404,
    });
  }

  /**
   * Creates a rate limit error.
   */
  static rateLimit(message: string, retryAfter?: number): EcrError {
    return new EcrError(EcrErrorKind.ThrottlingException, message, {
      statusCode: 429,
      retryAfter,
    });
  }

  /**
   * Creates a timeout error.
   */
  static timeout(message: string): EcrError {
    return new EcrError(EcrErrorKind.Timeout, message);
  }

  /**
   * Creates an access denied error.
   */
  static accessDenied(message: string): EcrError {
    return new EcrError(EcrErrorKind.AccessDenied, message, {
      statusCode: 403,
    });
  }

  /**
   * Creates a service unavailable error.
   */
  static serviceUnavailable(message: string): EcrError {
    return new EcrError(EcrErrorKind.ServiceUnavailable, message, {
      statusCode: 503,
    });
  }

  /**
   * Creates an invalid parameter error.
   */
  static invalidParameter(message: string): EcrError {
    return new EcrError(EcrErrorKind.InvalidParameter, message, {
      statusCode: 400,
    });
  }

  /**
   * Creates an image not found error.
   */
  static imageNotFound(message: string): EcrError {
    return new EcrError(EcrErrorKind.ImageNotFound, message, {
      statusCode: 404,
    });
  }

  /**
   * Creates a repository not found error.
   */
  static repositoryNotFound(message: string): EcrError {
    return new EcrError(EcrErrorKind.RepositoryNotFound, message, {
      statusCode: 404,
    });
  }

  /**
   * Creates a scan in progress error.
   */
  static scanInProgress(message: string): EcrError {
    return new EcrError(EcrErrorKind.ScanInProgress, message);
  }

  /**
   * Creates a KMS error.
   */
  static kmsError(message: string): EcrError {
    return new EcrError(EcrErrorKind.KmsError, message);
  }

  /**
   * Creates an image tag already exists error.
   */
  static imageTagAlreadyExists(tag: string): EcrError {
    return new EcrError(
      EcrErrorKind.ImageTagAlreadyExists,
      `Image tag '${tag}' already exists in immutable repository`
    );
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
    if (this.retryAfter !== undefined) {
      result += ` [retry_after: ${this.retryAfter}s]`;
    }
    return result;
  }
}

/**
 * Result type alias for ECR operations.
 */
export type EcrResult<T> = Promise<T>;

/**
 * Type guard for EcrError.
 */
export function isEcrError(error: unknown): error is EcrError {
  return error instanceof EcrError;
}

/**
 * Checks if an error is a retryable error.
 */
export function isRetryableError(error: EcrError): boolean {
  return error.isRetryable();
}

/**
 * Checks if an error is a not found error.
 */
export function isNotFoundError(error: EcrError): boolean {
  return [
    EcrErrorKind.RepositoryNotFound,
    EcrErrorKind.ImageNotFound,
    EcrErrorKind.LayersNotFound,
    EcrErrorKind.LifecyclePolicyNotFound,
    EcrErrorKind.RepositoryPolicyNotFound,
    EcrErrorKind.ScanNotFound,
  ].includes(error.kind);
}

/**
 * Checks if an error is a throttling error.
 */
export function isThrottlingError(error: EcrError): boolean {
  return [
    EcrErrorKind.LimitExceeded,
    EcrErrorKind.ThrottlingException,
  ].includes(error.kind);
}
