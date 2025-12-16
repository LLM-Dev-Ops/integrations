/**
 * Error types for the Docker Hub client.
 * @module errors
 */

/**
 * Error kinds for categorizing Docker Hub errors.
 */
export enum DockerHubErrorKind {
  // Configuration errors
  /** Invalid registry URL or configuration. */
  InvalidRegistry = 'invalid_registry',
  /** Invalid namespace. */
  InvalidNamespace = 'invalid_namespace',
  /** Invalid credentials format. */
  InvalidCredentials = 'invalid_credentials',

  // Authentication errors
  /** Authentication token is invalid. */
  AuthInvalidToken = 'auth_invalid_token',
  /** Authentication token has expired. */
  TokenExpired = 'token_expired',
  /** Failed to refresh authentication token. */
  TokenRefreshFailed = 'token_refresh_failed',
  /** Token lacks required scope for the operation. */
  UnauthorizedScope = 'unauthorized_scope',

  // Repository errors
  /** Repository not found. */
  RepositoryNotFound = 'repository_not_found',
  /** Access denied to repository. */
  RepositoryAccessDenied = 'repository_access_denied',
  /** Repository name is invalid. */
  RepositoryNameInvalid = 'repository_name_invalid',
  /** Repository already exists. */
  RepositoryAlreadyExists = 'repository_already_exists',

  // Manifest errors
  /** Manifest not found. */
  ManifestNotFound = 'manifest_not_found',
  /** Manifest is invalid. */
  ManifestInvalid = 'manifest_invalid',
  /** Manifest digest mismatch. */
  ManifestDigestMismatch = 'manifest_digest_mismatch',
  /** Manifest schema version not supported. */
  ManifestSchemaNotSupported = 'manifest_schema_not_supported',

  // Blob errors
  /** Blob not found. */
  BlobNotFound = 'blob_not_found',
  /** Blob upload is invalid. */
  BlobUploadInvalid = 'blob_upload_invalid',
  /** Blob digest mismatch. */
  BlobDigestMismatch = 'blob_digest_mismatch',
  /** Blob size exceeds limit. */
  BlobSizeExceeded = 'blob_size_exceeded',

  // Rate limit errors
  /** Pull rate limit exceeded. */
  PullLimitExceeded = 'pull_limit_exceeded',
  /** Push rate limit exceeded. */
  PushLimitExceeded = 'push_limit_exceeded',
  /** Search rate limit exceeded. */
  SearchLimitExceeded = 'search_limit_exceeded',

  // Network errors
  /** Connection to Docker Hub failed. */
  ConnectionFailed = 'connection_failed',
  /** Request timeout. */
  Timeout = 'timeout',
  /** DNS resolution failed. */
  DnsResolutionFailed = 'dns_resolution_failed',

  // Server errors
  /** Docker Hub internal server error. */
  InternalError = 'internal_error',
  /** Docker Hub service unavailable. */
  ServiceUnavailable = 'service_unavailable',

  // Generic
  /** Unknown error. */
  Unknown = 'unknown',
}

/**
 * Rate limit information for Docker Hub.
 */
export interface DockerHubRateLimitInfo {
  /** Maximum requests allowed in the time window. */
  limit: number;
  /** Remaining requests in current window. */
  remaining: number;
  /** Time when the rate limit resets. */
  resetAt: Date;
  /** Retry-After header value in seconds (if present). */
  retryAfter?: number;
  /** Source of the rate limit (e.g., 'pull', 'push', 'search'). */
  source?: string;
}

/**
 * Docker Hub API error with detailed information.
 */
export class DockerHubError extends Error {
  /** Error kind. */
  public readonly kind: DockerHubErrorKind;
  /** HTTP status code. */
  public readonly statusCode?: number;
  /** Time when rate limit resets (for rate limit errors). */
  public readonly resetAt?: Date;
  /** Retry-after duration in seconds. */
  public readonly retryAfterSeconds?: number;
  /** Rate limit information (if applicable). */
  public readonly rateLimitInfo?: DockerHubRateLimitInfo;
  /** Underlying cause. */
  public readonly cause?: Error;
  /** Additional error details from Docker Hub API. */
  public readonly details?: string;

  constructor(
    kind: DockerHubErrorKind,
    message: string,
    options?: {
      statusCode?: number;
      resetAt?: Date;
      retryAfter?: number;
      rateLimitInfo?: DockerHubRateLimitInfo;
      cause?: Error;
      details?: string;
    }
  ) {
    super(message);
    this.name = 'DockerHubError';
    this.kind = kind;
    this.statusCode = options?.statusCode;
    this.resetAt = options?.resetAt;
    this.retryAfterSeconds = options?.retryAfter;
    this.rateLimitInfo = options?.rateLimitInfo;
    this.cause = options?.cause;
    this.details = options?.details;

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DockerHubError);
    }
  }

  /**
   * Sets the HTTP status code.
   */
  withStatus(code: number): this {
    return new DockerHubError(this.kind, this.message, {
      ...this,
      statusCode: code,
    }) as this;
  }

  /**
   * Sets the rate limit reset time.
   */
  withResetAt(resetAt: Date): this {
    return new DockerHubError(this.kind, this.message, {
      ...this,
      resetAt,
    }) as this;
  }

  /**
   * Sets the retry-after duration.
   */
  withRetryAfter(seconds: number): this {
    return new DockerHubError(this.kind, this.message, {
      ...this,
      retryAfter: seconds,
    }) as this;
  }

  /**
   * Sets the rate limit info.
   */
  withRateLimit(info: DockerHubRateLimitInfo): this {
    return new DockerHubError(this.kind, this.message, {
      ...this,
      rateLimitInfo: info,
    }) as this;
  }

  /**
   * Sets the underlying cause.
   */
  withCause(cause: Error): this {
    return new DockerHubError(this.kind, this.message, {
      ...this,
      cause,
    }) as this;
  }

  /**
   * Sets additional error details.
   */
  withDetails(details: string): this {
    return new DockerHubError(this.kind, this.message, {
      ...this,
      details,
    }) as this;
  }

  /**
   * Returns the retry-after duration in seconds.
   */
  retryAfter(): number | undefined {
    // Explicit retry-after value takes precedence
    if (this.retryAfterSeconds !== undefined) {
      return this.retryAfterSeconds;
    }

    // Check rate limit info
    if (this.rateLimitInfo?.retryAfter !== undefined) {
      return this.rateLimitInfo.retryAfter;
    }

    // Calculate from resetAt
    if (this.resetAt) {
      const now = new Date();
      if (this.resetAt > now) {
        return Math.ceil((this.resetAt.getTime() - now.getTime()) / 1000);
      }
    }

    // Calculate from rate limit info resetAt
    if (this.rateLimitInfo?.resetAt) {
      const now = new Date();
      const resetAt = this.rateLimitInfo.resetAt;
      if (resetAt > now) {
        return Math.ceil((resetAt.getTime() - now.getTime()) / 1000);
      }
    }

    return undefined;
  }

  /**
   * Returns true if this error is retryable.
   */
  isRetryable(): boolean {
    // Authentication errors with token refresh capability are retryable
    if (this.kind === DockerHubErrorKind.AuthInvalidToken ||
        this.kind === DockerHubErrorKind.TokenExpired) {
      return true;
    }

    // Rate limit errors are retryable after waiting
    if (this.kind === DockerHubErrorKind.PullLimitExceeded ||
        this.kind === DockerHubErrorKind.PushLimitExceeded ||
        this.kind === DockerHubErrorKind.SearchLimitExceeded) {
      return true;
    }

    // Network errors are retryable
    if (this.kind === DockerHubErrorKind.ConnectionFailed ||
        this.kind === DockerHubErrorKind.Timeout ||
        this.kind === DockerHubErrorKind.DnsResolutionFailed) {
      return true;
    }

    // Server errors are retryable
    if (this.kind === DockerHubErrorKind.InternalError ||
        this.kind === DockerHubErrorKind.ServiceUnavailable) {
      return true;
    }

    return false;
  }

  /**
   * Creates an error from an HTTP status code and Docker Hub error response.
   */
  static fromResponse(
    status: number,
    message: string,
    options?: {
      details?: string;
      resetAt?: Date;
      retryAfter?: number;
    }
  ): DockerHubError {
    const kind = DockerHubError.kindFromStatus(status, message);
    return new DockerHubError(kind, message, {
      statusCode: status,
      details: options?.details,
      resetAt: options?.resetAt,
      retryAfter: options?.retryAfter,
    });
  }

  /**
   * Maps HTTP status code to error kind.
   */
  private static kindFromStatus(status: number, message?: string): DockerHubErrorKind {
    switch (status) {
      case 400:
        // Check message for specific manifest errors
        if (message?.toLowerCase().includes('manifest')) {
          return DockerHubErrorKind.ManifestInvalid;
        }
        return DockerHubErrorKind.Unknown;

      case 401:
        if (message?.toLowerCase().includes('token')) {
          return DockerHubErrorKind.AuthInvalidToken;
        }
        return DockerHubErrorKind.InvalidCredentials;

      case 403:
        if (message?.toLowerCase().includes('scope')) {
          return DockerHubErrorKind.UnauthorizedScope;
        }
        return DockerHubErrorKind.RepositoryAccessDenied;

      case 404:
        if (message?.toLowerCase().includes('manifest')) {
          return DockerHubErrorKind.ManifestNotFound;
        }
        if (message?.toLowerCase().includes('blob')) {
          return DockerHubErrorKind.BlobNotFound;
        }
        return DockerHubErrorKind.RepositoryNotFound;

      case 429:
        if (message?.toLowerCase().includes('pull')) {
          return DockerHubErrorKind.PullLimitExceeded;
        }
        if (message?.toLowerCase().includes('push')) {
          return DockerHubErrorKind.PushLimitExceeded;
        }
        if (message?.toLowerCase().includes('search')) {
          return DockerHubErrorKind.SearchLimitExceeded;
        }
        return DockerHubErrorKind.PullLimitExceeded; // Default to pull limit

      case 500:
        return DockerHubErrorKind.InternalError;

      case 503:
        return DockerHubErrorKind.ServiceUnavailable;

      default:
        return DockerHubErrorKind.Unknown;
    }
  }

  // Convenience factory methods for Configuration errors

  /**
   * Creates an invalid registry error.
   */
  static invalidRegistry(message: string): DockerHubError {
    return new DockerHubError(DockerHubErrorKind.InvalidRegistry, message);
  }

  /**
   * Creates an invalid namespace error.
   */
  static invalidNamespace(message: string): DockerHubError {
    return new DockerHubError(DockerHubErrorKind.InvalidNamespace, message);
  }

  /**
   * Creates an invalid credentials error.
   */
  static invalidCredentials(message: string): DockerHubError {
    return new DockerHubError(DockerHubErrorKind.InvalidCredentials, message, {
      statusCode: 401,
    });
  }

  // Convenience factory methods for Authentication errors

  /**
   * Creates an authentication error.
   */
  static authentication(message: string): DockerHubError {
    return new DockerHubError(DockerHubErrorKind.AuthInvalidToken, message, {
      statusCode: 401,
    });
  }

  /**
   * Creates a token expired error.
   */
  static tokenExpired(message: string): DockerHubError {
    return new DockerHubError(DockerHubErrorKind.TokenExpired, message, {
      statusCode: 401,
    });
  }

  /**
   * Creates a token refresh failed error.
   */
  static tokenRefreshFailed(message: string, cause?: Error): DockerHubError {
    return new DockerHubError(DockerHubErrorKind.TokenRefreshFailed, message, {
      cause,
    });
  }

  /**
   * Creates an unauthorized scope error.
   */
  static unauthorizedScope(message: string): DockerHubError {
    return new DockerHubError(DockerHubErrorKind.UnauthorizedScope, message, {
      statusCode: 403,
    });
  }

  // Convenience factory methods for Repository errors

  /**
   * Creates a repository not found error.
   */
  static repositoryNotFound(repository: string): DockerHubError {
    return new DockerHubError(
      DockerHubErrorKind.RepositoryNotFound,
      `Repository not found: ${repository}`,
      { statusCode: 404 }
    );
  }

  /**
   * Creates a repository access denied error.
   */
  static repositoryAccessDenied(repository: string): DockerHubError {
    return new DockerHubError(
      DockerHubErrorKind.RepositoryAccessDenied,
      `Access denied to repository: ${repository}`,
      { statusCode: 403 }
    );
  }

  /**
   * Creates a repository name invalid error.
   */
  static repositoryNameInvalid(name: string): DockerHubError {
    return new DockerHubError(
      DockerHubErrorKind.RepositoryNameInvalid,
      `Invalid repository name: ${name}`,
      { statusCode: 400 }
    );
  }

  /**
   * Creates a repository already exists error.
   */
  static repositoryAlreadyExists(repository: string): DockerHubError {
    return new DockerHubError(
      DockerHubErrorKind.RepositoryAlreadyExists,
      `Repository already exists: ${repository}`,
      { statusCode: 409 }
    );
  }

  // Convenience factory methods for Manifest errors

  /**
   * Creates a manifest not found error.
   */
  static manifestNotFound(reference: string): DockerHubError {
    return new DockerHubError(
      DockerHubErrorKind.ManifestNotFound,
      `Manifest not found: ${reference}`,
      { statusCode: 404 }
    );
  }

  /**
   * Creates a manifest invalid error.
   */
  static manifestInvalid(message: string): DockerHubError {
    return new DockerHubError(DockerHubErrorKind.ManifestInvalid, message, {
      statusCode: 400,
    });
  }

  /**
   * Creates a manifest digest mismatch error.
   */
  static manifestDigestMismatch(expected: string, actual: string): DockerHubError {
    return new DockerHubError(
      DockerHubErrorKind.ManifestDigestMismatch,
      `Manifest digest mismatch: expected ${expected}, got ${actual}`,
      { statusCode: 400 }
    );
  }

  /**
   * Creates a manifest schema not supported error.
   */
  static manifestSchemaNotSupported(schema: string): DockerHubError {
    return new DockerHubError(
      DockerHubErrorKind.ManifestSchemaNotSupported,
      `Manifest schema not supported: ${schema}`,
      { statusCode: 400 }
    );
  }

  // Convenience factory methods for Blob errors

  /**
   * Creates a blob not found error.
   */
  static blobNotFound(digest: string): DockerHubError {
    return new DockerHubError(
      DockerHubErrorKind.BlobNotFound,
      `Blob not found: ${digest}`,
      { statusCode: 404 }
    );
  }

  /**
   * Creates a blob upload invalid error.
   */
  static blobUploadInvalid(message: string): DockerHubError {
    return new DockerHubError(DockerHubErrorKind.BlobUploadInvalid, message, {
      statusCode: 400,
    });
  }

  /**
   * Creates a blob digest mismatch error.
   */
  static blobDigestMismatch(expected: string, actual: string): DockerHubError {
    return new DockerHubError(
      DockerHubErrorKind.BlobDigestMismatch,
      `Blob digest mismatch: expected ${expected}, got ${actual}`,
      { statusCode: 400 }
    );
  }

  /**
   * Creates a blob size exceeded error.
   */
  static blobSizeExceeded(size: number, maxSize: number): DockerHubError {
    return new DockerHubError(
      DockerHubErrorKind.BlobSizeExceeded,
      `Blob size ${size} exceeds maximum allowed size ${maxSize}`,
      { statusCode: 413 }
    );
  }

  // Convenience factory methods for Rate Limit errors

  /**
   * Creates a pull rate limit exceeded error.
   */
  static pullLimitExceeded(info?: DockerHubRateLimitInfo): DockerHubError {
    const message = info
      ? `Pull rate limit exceeded: ${info.remaining}/${info.limit} remaining`
      : 'Pull rate limit exceeded';

    return new DockerHubError(DockerHubErrorKind.PullLimitExceeded, message, {
      statusCode: 429,
      rateLimitInfo: info,
      resetAt: info?.resetAt,
      retryAfter: info?.retryAfter,
    });
  }

  /**
   * Creates a push rate limit exceeded error.
   */
  static pushLimitExceeded(info?: DockerHubRateLimitInfo): DockerHubError {
    const message = info
      ? `Push rate limit exceeded: ${info.remaining}/${info.limit} remaining`
      : 'Push rate limit exceeded';

    return new DockerHubError(DockerHubErrorKind.PushLimitExceeded, message, {
      statusCode: 429,
      rateLimitInfo: info,
      resetAt: info?.resetAt,
      retryAfter: info?.retryAfter,
    });
  }

  /**
   * Creates a search rate limit exceeded error.
   */
  static searchLimitExceeded(info?: DockerHubRateLimitInfo): DockerHubError {
    const message = info
      ? `Search rate limit exceeded: ${info.remaining}/${info.limit} remaining`
      : 'Search rate limit exceeded';

    return new DockerHubError(DockerHubErrorKind.SearchLimitExceeded, message, {
      statusCode: 429,
      rateLimitInfo: info,
      resetAt: info?.resetAt,
      retryAfter: info?.retryAfter,
    });
  }

  /**
   * Creates a generic rate limit error.
   */
  static rateLimit(info: DockerHubRateLimitInfo): DockerHubError {
    const source = info.source || 'pull';
    const message = `Rate limit exceeded for ${source}: ${info.remaining}/${info.limit} remaining`;

    let kind: DockerHubErrorKind;
    switch (source) {
      case 'push':
        kind = DockerHubErrorKind.PushLimitExceeded;
        break;
      case 'search':
        kind = DockerHubErrorKind.SearchLimitExceeded;
        break;
      default:
        kind = DockerHubErrorKind.PullLimitExceeded;
    }

    return new DockerHubError(kind, message, {
      statusCode: 429,
      rateLimitInfo: info,
    });
  }

  // Convenience factory methods for Network errors

  /**
   * Creates a connection failed error.
   */
  static connectionFailed(message: string, cause?: Error): DockerHubError {
    return new DockerHubError(DockerHubErrorKind.ConnectionFailed, message, {
      cause,
    });
  }

  /**
   * Creates a timeout error.
   */
  static timeout(message: string): DockerHubError {
    return new DockerHubError(DockerHubErrorKind.Timeout, message);
  }

  /**
   * Creates a DNS resolution failed error.
   */
  static dnsResolutionFailed(message: string, cause?: Error): DockerHubError {
    return new DockerHubError(DockerHubErrorKind.DnsResolutionFailed, message, {
      cause,
    });
  }

  // Convenience factory methods for Server errors

  /**
   * Creates an internal server error.
   */
  static internalError(message: string): DockerHubError {
    return new DockerHubError(DockerHubErrorKind.InternalError, message, {
      statusCode: 500,
    });
  }

  /**
   * Creates a service unavailable error.
   */
  static serviceUnavailable(message: string): DockerHubError {
    return new DockerHubError(DockerHubErrorKind.ServiceUnavailable, message, {
      statusCode: 503,
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
    if (this.details) {
      result += ` - ${this.details}`;
    }
    if (this.rateLimitInfo) {
      const retryAfter = this.retryAfter();
      if (retryAfter !== undefined) {
        result += ` [retry after ${retryAfter}s]`;
      }
    }
    return result;
  }
}

/**
 * Result type alias for Docker Hub operations.
 */
export type DockerHubResult<T> = Promise<T>;

/**
 * Type guard for DockerHubError.
 */
export function isDockerHubError(error: unknown): error is DockerHubError {
  return error instanceof DockerHubError;
}

/**
 * Checks if an error is a rate limit error.
 */
export function isRateLimitError(error: DockerHubError): boolean {
  return [
    DockerHubErrorKind.PullLimitExceeded,
    DockerHubErrorKind.PushLimitExceeded,
    DockerHubErrorKind.SearchLimitExceeded,
  ].includes(error.kind);
}

/**
 * Checks if an error is an authentication error.
 */
export function isAuthenticationError(error: DockerHubError): boolean {
  return [
    DockerHubErrorKind.InvalidCredentials,
    DockerHubErrorKind.AuthInvalidToken,
    DockerHubErrorKind.TokenExpired,
    DockerHubErrorKind.TokenRefreshFailed,
    DockerHubErrorKind.UnauthorizedScope,
  ].includes(error.kind);
}

/**
 * Checks if an error is a repository error.
 */
export function isRepositoryError(error: DockerHubError): boolean {
  return [
    DockerHubErrorKind.RepositoryNotFound,
    DockerHubErrorKind.RepositoryAccessDenied,
    DockerHubErrorKind.RepositoryNameInvalid,
    DockerHubErrorKind.RepositoryAlreadyExists,
  ].includes(error.kind);
}

/**
 * Checks if an error is a manifest error.
 */
export function isManifestError(error: DockerHubError): boolean {
  return [
    DockerHubErrorKind.ManifestNotFound,
    DockerHubErrorKind.ManifestInvalid,
    DockerHubErrorKind.ManifestDigestMismatch,
    DockerHubErrorKind.ManifestSchemaNotSupported,
  ].includes(error.kind);
}

/**
 * Checks if an error is a blob error.
 */
export function isBlobError(error: DockerHubError): boolean {
  return [
    DockerHubErrorKind.BlobNotFound,
    DockerHubErrorKind.BlobUploadInvalid,
    DockerHubErrorKind.BlobDigestMismatch,
    DockerHubErrorKind.BlobSizeExceeded,
  ].includes(error.kind);
}

/**
 * Checks if an error is a network error.
 */
export function isNetworkError(error: DockerHubError): boolean {
  return [
    DockerHubErrorKind.ConnectionFailed,
    DockerHubErrorKind.Timeout,
    DockerHubErrorKind.DnsResolutionFailed,
  ].includes(error.kind);
}

/**
 * Checks if an error is a server error.
 */
export function isServerError(error: DockerHubError): boolean {
  return [
    DockerHubErrorKind.InternalError,
    DockerHubErrorKind.ServiceUnavailable,
  ].includes(error.kind);
}

// ============================================================================
// Specialized Error Classes
// ============================================================================

/**
 * Error for authentication failures.
 */
export class AuthenticationError extends DockerHubError {
  constructor(message: string) {
    super(DockerHubErrorKind.AuthInvalidToken, message, { statusCode: 401 });
    this.name = 'AuthenticationError';
  }
}

/**
 * Error for rate limit exceeded.
 */
export class RateLimitError extends DockerHubError {
  constructor(message: string, info?: DockerHubRateLimitInfo) {
    super(DockerHubErrorKind.PullLimitExceeded, message, {
      statusCode: 429,
      rateLimitInfo: info,
    });
    this.name = 'RateLimitError';
  }
}

/**
 * Error for network failures.
 */
export class NetworkError extends DockerHubError {
  constructor(message: string, cause?: Error) {
    super(DockerHubErrorKind.ConnectionFailed, message, { cause });
    this.name = 'NetworkError';
  }
}

/**
 * Error for request timeouts.
 */
export class TimeoutError extends DockerHubError {
  constructor(message: string) {
    super(DockerHubErrorKind.Timeout, message);
    this.name = 'TimeoutError';
  }
}

/**
 * Error for blob not found.
 */
export class BlobNotFoundError extends DockerHubError {
  constructor(digest: string) {
    super(DockerHubErrorKind.BlobNotFound, `Blob not found: ${digest}`, {
      statusCode: 404,
    });
    this.name = 'BlobNotFoundError';
  }
}

/**
 * Error for blob upload failures.
 */
export class BlobUploadError extends DockerHubError {
  constructor(message: string) {
    super(DockerHubErrorKind.BlobUploadInvalid, message, { statusCode: 400 });
    this.name = 'BlobUploadError';
  }
}

/**
 * Error for blob digest mismatch.
 */
export class BlobDigestMismatchError extends DockerHubError {
  constructor(expected: string, actual: string) {
    super(
      DockerHubErrorKind.BlobDigestMismatch,
      `Blob digest mismatch: expected ${expected}, got ${actual}`,
      { statusCode: 400 }
    );
    this.name = 'BlobDigestMismatchError';
  }
}
