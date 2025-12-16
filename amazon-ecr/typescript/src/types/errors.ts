/**
 * Error types for Amazon ECR.
 *
 * This module provides TypeScript error definitions for ECR operations,
 * matching the error taxonomy defined in the SPARC specification.
 *
 * @module types/errors
 */

/**
 * Error kinds for categorizing ECR errors.
 */
export enum EcrErrorKind {
  // Resource errors
  /** Repository not found. */
  RepositoryNotFound = 'repository_not_found',
  /** Image not found. */
  ImageNotFound = 'image_not_found',
  /** Layers not found. */
  LayersNotFound = 'layers_not_found',
  /** Lifecycle policy not found. */
  LifecyclePolicyNotFound = 'lifecycle_policy_not_found',
  /** Repository policy not found. */
  RepositoryPolicyNotFound = 'repository_policy_not_found',
  /** Scan not found. */
  ScanNotFound = 'scan_not_found',

  // Request errors
  /** Invalid parameter. */
  InvalidParameter = 'invalid_parameter',
  /** Invalid layer part. */
  InvalidLayerPart = 'invalid_layer_part',
  /** Limit exceeded. */
  LimitExceeded = 'limit_exceeded',
  /** Too many tags. */
  TooManyTags = 'too_many_tags',

  // Image errors
  /** Image tag already exists (immutable repository). */
  ImageTagAlreadyExists = 'image_tag_already_exists',
  /** Image digest mismatch. */
  ImageDigestMismatch = 'image_digest_mismatch',

  // Authentication/Authorization errors
  /** Access denied. */
  AccessDenied = 'access_denied',
  /** Unauthorized. */
  Unauthorized = 'unauthorized',

  // KMS errors
  /** KMS operation failed. */
  KmsError = 'kms_error',

  // Service errors
  /** Service unavailable. */
  ServiceUnavailable = 'service_unavailable',
  /** Request throttled. */
  ThrottlingException = 'throttling_exception',

  // Scan errors
  /** Scan is in progress. */
  ScanInProgress = 'scan_in_progress',
  /** Scan failed. */
  ScanFailed = 'scan_failed',

  // Generic
  /** Unknown error. */
  Unknown = 'unknown',
}

/**
 * ECR API error with detailed information.
 */
export class EcrError extends Error {
  /** Error kind. */
  public readonly kind: EcrErrorKind;
  /** HTTP status code. */
  public readonly statusCode?: number;
  /** AWS request ID. */
  public readonly requestId?: string;
  /** Underlying cause. */
  public readonly cause?: Error;

  constructor(
    kind: EcrErrorKind,
    message: string,
    options?: {
      statusCode?: number;
      requestId?: string;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'EcrError';
    this.kind = kind;
    this.statusCode = options?.statusCode;
    this.requestId = options?.requestId;
    this.cause = options?.cause;

    // Maintains proper stack trace for where error was thrown
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
   */
  isRetryable(): boolean {
    return [
      EcrErrorKind.LimitExceeded,
      EcrErrorKind.ServiceUnavailable,
      EcrErrorKind.ThrottlingException,
      EcrErrorKind.KmsError,
    ].includes(this.kind);
  }

  /**
   * Creates an error from an HTTP status code.
   */
  static fromResponse(
    status: number,
    message: string,
    options?: {
      requestId?: string;
    }
  ): EcrError {
    const kind = EcrError.kindFromStatus(status);
    return new EcrError(kind, message, {
      statusCode: status,
      requestId: options?.requestId,
    });
  }

  /**
   * Maps HTTP status code to error kind.
   */
  private static kindFromStatus(status: number): EcrErrorKind {
    switch (status) {
      case 400:
        return EcrErrorKind.InvalidParameter;
      case 401:
        return EcrErrorKind.Unauthorized;
      case 403:
        return EcrErrorKind.AccessDenied;
      case 404:
        return EcrErrorKind.ImageNotFound;
      case 429:
        return EcrErrorKind.ThrottlingException;
      case 500:
        return EcrErrorKind.ServiceUnavailable;
      case 503:
        return EcrErrorKind.ServiceUnavailable;
      default:
        return EcrErrorKind.Unknown;
    }
  }

  // Convenience factory methods

  /**
   * Creates a repository not found error.
   */
  static repositoryNotFound(repositoryName: string): EcrError {
    return new EcrError(
      EcrErrorKind.RepositoryNotFound,
      `Repository not found: ${repositoryName}`,
      { statusCode: 404 }
    );
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
   * Creates an image tag already exists error.
   */
  static imageTagAlreadyExists(tag: string): EcrError {
    return new EcrError(
      EcrErrorKind.ImageTagAlreadyExists,
      `Image tag already exists: ${tag}`,
      { statusCode: 400 }
    );
  }

  /**
   * Creates a scan in progress error.
   */
  static scanInProgress(message: string): EcrError {
    return new EcrError(EcrErrorKind.ScanInProgress, message);
  }

  /**
   * Creates a scan failed error.
   */
  static scanFailed(message: string): EcrError {
    return new EcrError(EcrErrorKind.ScanFailed, message);
  }

  /**
   * Creates a throttling error.
   */
  static throttling(message: string): EcrError {
    return new EcrError(EcrErrorKind.ThrottlingException, message, {
      statusCode: 429,
    });
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
 * Type guard for EcrError.
 */
export function isEcrError(error: unknown): error is EcrError {
  return error instanceof EcrError;
}
