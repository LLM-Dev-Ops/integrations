/**
 * Error types for the GitHub client.
 * @module errors
 */

/**
 * Error kinds for categorizing GitHub errors.
 */
export enum GitHubErrorKind {
  // Configuration errors
  /** Missing authentication configuration. */
  MissingAuth = 'missing_auth',
  /** Invalid base URL. */
  InvalidBaseUrl = 'invalid_base_url',
  /** Invalid GitHub App credentials. */
  InvalidAppCredentials = 'invalid_app_credentials',
  /** Invalid configuration. */
  InvalidConfiguration = 'invalid_configuration',

  // Authentication errors
  /** Invalid token format or value. */
  InvalidToken = 'invalid_token',
  /** Token has expired. */
  ExpiredToken = 'expired_token',
  /** Token lacks required scopes. */
  InsufficientScopes = 'insufficient_scopes',
  /** Bad credentials. */
  BadCredentials = 'bad_credentials',
  /** GitHub App authentication failed. */
  AppAuthenticationFailed = 'app_auth_failed',

  // Authorization errors
  /** Access forbidden. */
  Forbidden = 'forbidden',
  /** Resource not accessible. */
  ResourceNotAccessible = 'resource_not_accessible',
  /** SSO required. */
  SsoRequired = 'sso_required',

  // Request errors
  /** Request validation failed. */
  ValidationError = 'validation_error',
  /** Invalid parameter. */
  InvalidParameter = 'invalid_parameter',
  /** Missing required parameter. */
  MissingParameter = 'missing_parameter',
  /** Unprocessable entity (422). */
  UnprocessableEntity = 'unprocessable_entity',

  // Resource errors
  /** Resource not found (404). */
  NotFound = 'not_found',
  /** Resource is gone (410). */
  Gone = 'gone',
  /** Resource conflict (409). */
  Conflict = 'conflict',
  /** Resource already exists. */
  AlreadyExists = 'already_exists',

  // Rate limit errors
  /** Primary rate limit exceeded. */
  PrimaryRateLimitExceeded = 'primary_rate_limit_exceeded',
  /** Secondary rate limit exceeded. */
  SecondaryRateLimitExceeded = 'secondary_rate_limit_exceeded',
  /** Abuse detection triggered. */
  AbuseDetected = 'abuse_detected',

  // Network errors
  /** Connection failed. */
  ConnectionFailed = 'connection_failed',
  /** Request timeout. */
  Timeout = 'timeout',
  /** DNS resolution failed. */
  DnsResolutionFailed = 'dns_resolution_failed',
  /** TLS error. */
  TlsError = 'tls_error',

  // Server errors
  /** Internal server error (500). */
  InternalError = 'internal_error',
  /** Bad gateway (502). */
  BadGateway = 'bad_gateway',
  /** Service unavailable (503). */
  ServiceUnavailable = 'service_unavailable',

  // Response errors
  /** Failed to deserialize response. */
  DeserializationError = 'deserialization_error',
  /** Unexpected response format. */
  UnexpectedFormat = 'unexpected_format',
  /** Invalid JSON in response. */
  InvalidJson = 'invalid_json',

  // Webhook errors
  /** Invalid webhook signature. */
  InvalidSignature = 'invalid_signature',
  /** Unsupported webhook event. */
  UnsupportedEvent = 'unsupported_event',
  /** Webhook payload parse error. */
  PayloadParseError = 'payload_parse_error',

  // GraphQL errors
  /** GraphQL query error. */
  QueryError = 'query_error',
  /** GraphQL rate limit exceeded. */
  GraphQlRateLimitExceeded = 'graphql_rate_limit_exceeded',
  /** GraphQL node limit exceeded. */
  NodeLimitExceeded = 'node_limit_exceeded',

  // Generic
  /** Unknown error. */
  Unknown = 'unknown',
}

/**
 * Rate limit information extracted from error.
 */
export interface RateLimitInfo {
  /** Maximum requests allowed. */
  limit: number;
  /** Remaining requests in current window. */
  remaining: number;
  /** Time when the rate limit resets. */
  resetAt: Date;
  /** Retry-After header value in seconds (if present). */
  retryAfter?: number;
  /** Resource category. */
  resource?: string;
}

/**
 * GitHub API error with detailed information.
 */
export class GitHubError extends Error {
  /** Error kind. */
  public readonly kind: GitHubErrorKind;
  /** HTTP status code. */
  public readonly statusCode?: number;
  /** GitHub request ID. */
  public readonly requestId?: string;
  /** Documentation URL. */
  public readonly documentationUrl?: string;
  /** Rate limit info (if applicable). */
  public readonly rateLimitInfo?: RateLimitInfo;
  /** Underlying cause. */
  public readonly cause?: Error;

  constructor(
    kind: GitHubErrorKind,
    message: string,
    options?: {
      statusCode?: number;
      requestId?: string;
      documentationUrl?: string;
      rateLimitInfo?: RateLimitInfo;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'GitHubError';
    this.kind = kind;
    this.statusCode = options?.statusCode;
    this.requestId = options?.requestId;
    this.documentationUrl = options?.documentationUrl;
    this.rateLimitInfo = options?.rateLimitInfo;
    this.cause = options?.cause;

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GitHubError);
    }
  }

  /**
   * Sets the HTTP status code.
   */
  withStatus(code: number): this {
    return new GitHubError(this.kind, this.message, {
      ...this,
      statusCode: code,
    }) as this;
  }

  /**
   * Sets the GitHub request ID.
   */
  withRequestId(id: string): this {
    return new GitHubError(this.kind, this.message, {
      ...this,
      requestId: id,
    }) as this;
  }

  /**
   * Sets the documentation URL.
   */
  withDocumentationUrl(url: string): this {
    return new GitHubError(this.kind, this.message, {
      ...this,
      documentationUrl: url,
    }) as this;
  }

  /**
   * Sets the rate limit info.
   */
  withRateLimit(info: RateLimitInfo): this {
    return new GitHubError(this.kind, this.message, {
      ...this,
      rateLimitInfo: info,
    }) as this;
  }

  /**
   * Sets the underlying cause.
   */
  withCause(cause: Error): this {
    return new GitHubError(this.kind, this.message, {
      ...this,
      cause,
    }) as this;
  }

  /**
   * Returns the retry-after duration in seconds.
   */
  retryAfter(): number | undefined {
    if (this.rateLimitInfo?.retryAfter !== undefined) {
      return this.rateLimitInfo.retryAfter;
    }

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
    return [
      GitHubErrorKind.PrimaryRateLimitExceeded,
      GitHubErrorKind.SecondaryRateLimitExceeded,
      GitHubErrorKind.AbuseDetected,
      GitHubErrorKind.ConnectionFailed,
      GitHubErrorKind.Timeout,
      GitHubErrorKind.DnsResolutionFailed,
      GitHubErrorKind.InternalError,
      GitHubErrorKind.BadGateway,
      GitHubErrorKind.ServiceUnavailable,
    ].includes(this.kind);
  }

  /**
   * Creates an error from an HTTP status code and GitHub error response.
   */
  static fromResponse(
    status: number,
    message: string,
    options?: {
      documentationUrl?: string;
      requestId?: string;
    }
  ): GitHubError {
    const kind = GitHubError.kindFromStatus(status);
    return new GitHubError(kind, message, {
      statusCode: status,
      documentationUrl: options?.documentationUrl,
      requestId: options?.requestId,
    });
  }

  /**
   * Maps HTTP status code to error kind.
   */
  private static kindFromStatus(status: number): GitHubErrorKind {
    switch (status) {
      case 400:
        return GitHubErrorKind.ValidationError;
      case 401:
        return GitHubErrorKind.BadCredentials;
      case 403:
        return GitHubErrorKind.Forbidden;
      case 404:
        return GitHubErrorKind.NotFound;
      case 409:
        return GitHubErrorKind.Conflict;
      case 410:
        return GitHubErrorKind.Gone;
      case 422:
        return GitHubErrorKind.UnprocessableEntity;
      case 429:
        return GitHubErrorKind.SecondaryRateLimitExceeded;
      case 500:
        return GitHubErrorKind.InternalError;
      case 502:
        return GitHubErrorKind.BadGateway;
      case 503:
        return GitHubErrorKind.ServiceUnavailable;
      default:
        return GitHubErrorKind.Unknown;
    }
  }

  // Convenience factory methods

  /**
   * Creates a configuration error.
   */
  static configuration(message: string): GitHubError {
    return new GitHubError(GitHubErrorKind.InvalidConfiguration, message);
  }

  /**
   * Creates an authentication error.
   */
  static authentication(message: string): GitHubError {
    return new GitHubError(GitHubErrorKind.BadCredentials, message);
  }

  /**
   * Creates a not found error.
   */
  static notFound(message: string): GitHubError {
    return new GitHubError(GitHubErrorKind.NotFound, message, {
      statusCode: 404,
    });
  }

  /**
   * Creates a rate limit error.
   */
  static rateLimit(info: RateLimitInfo): GitHubError {
    return new GitHubError(
      GitHubErrorKind.PrimaryRateLimitExceeded,
      'Rate limit exceeded',
      {
        statusCode: 403,
        rateLimitInfo: info,
      }
    );
  }

  /**
   * Creates a timeout error.
   */
  static timeout(message: string): GitHubError {
    return new GitHubError(GitHubErrorKind.Timeout, message);
  }

  /**
   * Creates a webhook signature error.
   */
  static invalidSignature(message: string): GitHubError {
    return new GitHubError(GitHubErrorKind.InvalidSignature, message);
  }

  /**
   * Creates a deserialization error.
   */
  static deserialization(message: string): GitHubError {
    return new GitHubError(GitHubErrorKind.DeserializationError, message);
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
 * Result type alias for GitHub operations.
 */
export type GitHubResult<T> = Promise<T>;

/**
 * Type guard for GitHubError.
 */
export function isGitHubError(error: unknown): error is GitHubError {
  return error instanceof GitHubError;
}

/**
 * Checks if an error is a rate limit error.
 */
export function isRateLimitError(error: GitHubError): boolean {
  return [
    GitHubErrorKind.PrimaryRateLimitExceeded,
    GitHubErrorKind.SecondaryRateLimitExceeded,
    GitHubErrorKind.AbuseDetected,
  ].includes(error.kind);
}
