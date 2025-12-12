/**
 * Error handling module for Google Drive integration.
 *
 * Provides a comprehensive error taxonomy with retryability hints.
 */

/**
 * Configuration error types.
 */
export enum ConfigurationErrorType {
  MissingCredentials = "missing_credentials",
  InvalidCredentials = "invalid_credentials",
  InvalidConfiguration = "invalid_configuration",
  MissingScope = "missing_scope",
}

/**
 * Authentication error types.
 */
export enum AuthenticationErrorType {
  InvalidToken = "invalid_token",
  ExpiredToken = "expired_token",
  RefreshFailed = "refresh_failed",
  InvalidGrant = "invalid_grant",
  InsufficientPermissions = "insufficient_permissions",
  InvalidCredentials = "invalid_credentials",
}

/**
 * Authorization error types.
 */
export enum AuthorizationErrorType {
  Forbidden = "forbidden",
  InsufficientPermissions = "insufficient_permissions",
  FileNotAccessible = "file_not_accessible",
  DomainPolicy = "domain_policy",
  UserRateLimitExceeded = "user_rate_limit_exceeded",
}

/**
 * Request error types.
 */
export enum RequestErrorType {
  ValidationError = "validation_error",
  InvalidParameter = "invalid_parameter",
  MissingParameter = "missing_parameter",
  InvalidQuery = "invalid_query",
  InvalidRange = "invalid_range",
  InvalidMimeType = "invalid_mime_type",
}

/**
 * Resource error types.
 */
export enum ResourceErrorType {
  FileNotFound = "file_not_found",
  FolderNotFound = "folder_not_found",
  PermissionNotFound = "permission_not_found",
  CommentNotFound = "comment_not_found",
  RevisionNotFound = "revision_not_found",
  DriveNotFound = "drive_not_found",
  AlreadyExists = "already_exists",
  CannotModify = "cannot_modify",
}

/**
 * Quota error types.
 */
export enum QuotaErrorType {
  StorageQuotaExceeded = "storage_quota_exceeded",
  UserRateLimitExceeded = "user_rate_limit_exceeded",
  DailyLimitExceeded = "daily_limit_exceeded",
  ProjectRateLimitExceeded = "project_rate_limit_exceeded",
}

/**
 * Upload error types.
 */
export enum UploadErrorType {
  UploadInterrupted = "upload_interrupted",
  UploadFailed = "upload_failed",
  InvalidUploadRequest = "invalid_upload_request",
  UploadSizeExceeded = "upload_size_exceeded",
  ResumableUploadExpired = "resumable_upload_expired",
  ChunkSizeMismatch = "chunk_size_mismatch",
}

/**
 * Export error types.
 */
export enum ExportErrorType {
  ExportNotSupported = "export_not_supported",
  ExportSizeExceeded = "export_size_exceeded",
  InvalidExportFormat = "invalid_export_format",
}

/**
 * Network error types.
 */
export enum NetworkErrorType {
  ConnectionFailed = "connection_failed",
  Timeout = "timeout",
  DnsResolutionFailed = "dns_resolution_failed",
  TlsError = "tls_error",
}

/**
 * Server error types.
 */
export enum ServerErrorType {
  InternalError = "internal_error",
  BackendError = "backend_error",
  ServiceUnavailable = "service_unavailable",
  BadGateway = "bad_gateway",
}

/**
 * Response error types.
 */
export enum ResponseErrorType {
  DeserializationError = "deserialization_error",
  UnexpectedFormat = "unexpected_format",
  InvalidJson = "invalid_json",
}

/**
 * Base class for all Google Drive errors.
 */
export class GoogleDriveError extends Error {
  /** Error type discriminator */
  public readonly type: string;

  /** Whether this error is retryable */
  public readonly retryable: boolean;

  /** Optional retry delay in milliseconds */
  public readonly retryAfterMs?: number;

  /** HTTP status code if applicable */
  public readonly statusCode?: number;

  /** Google API error reason if available */
  public readonly reason?: string;

  /** Additional error context */
  public readonly context?: Record<string, unknown>;

  constructor(
    type: string,
    message: string,
    options?: {
      retryable?: boolean;
      retryAfterMs?: number;
      statusCode?: number;
      reason?: string;
      context?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = "GoogleDriveError";
    this.type = type;
    this.retryable = options?.retryable ?? false;
    this.retryAfterMs = options?.retryAfterMs;
    this.statusCode = options?.statusCode;
    this.reason = options?.reason;
    this.context = options?.context;

    // Store cause if provided
    if (options?.cause) {
      (this as any).cause = options.cause;
    }

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Check if this error is retryable.
   */
  isRetryable(): boolean {
    return this.retryable;
  }

  /**
   * Get retry delay if specified.
   */
  getRetryAfter(): number | undefined {
    return this.retryAfterMs;
  }

  /**
   * Convert error to JSON for logging.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
      statusCode: this.statusCode,
      reason: this.reason,
      context: this.context,
      stack: this.stack,
    };
  }

  /**
   * Create an error from an HTTP response.
   *
   * @param response - HTTP response
   * @param body - Response body (parsed JSON)
   * @returns GoogleDriveError instance
   */
  static fromResponse(response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
  }, body?: unknown): GoogleDriveError {
    const errorBody = body as {
      error?: {
        code?: number;
        message?: string;
        errors?: Array<{ reason?: string; message?: string }>;
        status?: string;
      };
    };

    const statusCode = response.status;
    const reason = errorBody?.error?.errors?.[0]?.reason;
    const message = errorBody?.error?.message ?? response.statusText;
    const retryAfter = response.headers["retry-after"];
    const retryAfterMs = retryAfter ? parseRetryAfter(retryAfter) : undefined;

    // Map HTTP status and reason to error type
    if (statusCode === 400) {
      if (reason === "invalidParameter") {
        return new GoogleDriveError(RequestErrorType.InvalidParameter, message, {
          statusCode,
          reason,
          retryable: false,
        });
      }
      if (reason === "invalidQuery") {
        return new GoogleDriveError(RequestErrorType.InvalidQuery, message, {
          statusCode,
          reason,
          retryable: false,
        });
      }
      return new GoogleDriveError(RequestErrorType.ValidationError, message, {
        statusCode,
        reason,
        retryable: false,
      });
    }

    if (statusCode === 401) {
      if (reason === "authError") {
        return new GoogleDriveError(AuthenticationErrorType.InvalidToken, message, {
          statusCode,
          reason,
          retryable: false,
        });
      }
      if (reason === "expired") {
        return new GoogleDriveError(AuthenticationErrorType.ExpiredToken, message, {
          statusCode,
          reason,
          retryable: false,
        });
      }
      return new GoogleDriveError(AuthenticationErrorType.InvalidToken, message, {
        statusCode,
        reason,
        retryable: false,
      });
    }

    if (statusCode === 403) {
      if (reason === "userRateLimitExceeded") {
        return new GoogleDriveError(QuotaErrorType.UserRateLimitExceeded, message, {
          statusCode,
          reason,
          retryable: true,
          retryAfterMs: retryAfterMs ?? 60000,
        });
      }
      if (reason === "rateLimitExceeded") {
        return new GoogleDriveError(QuotaErrorType.ProjectRateLimitExceeded, message, {
          statusCode,
          reason,
          retryable: true,
          retryAfterMs: retryAfterMs ?? 60000,
        });
      }
      if (reason === "storageQuotaExceeded") {
        return new GoogleDriveError(QuotaErrorType.StorageQuotaExceeded, message, {
          statusCode,
          reason,
          retryable: false,
        });
      }
      if (reason === "insufficientPermissions") {
        return new GoogleDriveError(AuthorizationErrorType.InsufficientPermissions, message, {
          statusCode,
          reason,
          retryable: false,
        });
      }
      if (reason === "domainPolicy") {
        return new GoogleDriveError(AuthorizationErrorType.DomainPolicy, message, {
          statusCode,
          reason,
          retryable: false,
        });
      }
      return new GoogleDriveError(AuthorizationErrorType.Forbidden, message, {
        statusCode,
        reason,
        retryable: false,
      });
    }

    if (statusCode === 404) {
      return new GoogleDriveError(ResourceErrorType.FileNotFound, message, {
        statusCode,
        reason,
        retryable: false,
      });
    }

    if (statusCode === 429) {
      return new GoogleDriveError(QuotaErrorType.UserRateLimitExceeded, message, {
        statusCode,
        reason,
        retryable: true,
        retryAfterMs: retryAfterMs ?? 60000,
      });
    }

    if (statusCode === 500) {
      return new GoogleDriveError(ServerErrorType.InternalError, message, {
        statusCode,
        reason,
        retryable: true,
        retryAfterMs: retryAfterMs ?? 5000,
      });
    }

    if (statusCode === 502) {
      return new GoogleDriveError(ServerErrorType.BadGateway, message, {
        statusCode,
        reason,
        retryable: true,
        retryAfterMs: retryAfterMs ?? 5000,
      });
    }

    if (statusCode === 503) {
      if (reason === "backendError") {
        return new GoogleDriveError(ServerErrorType.BackendError, message, {
          statusCode,
          reason,
          retryable: true,
          retryAfterMs: retryAfterMs ?? 30000,
        });
      }
      return new GoogleDriveError(ServerErrorType.ServiceUnavailable, message, {
        statusCode,
        reason,
        retryable: true,
        retryAfterMs: retryAfterMs ?? 30000,
      });
    }

    // Default to generic error
    return new GoogleDriveError("unknown_error", message, {
      statusCode,
      reason,
      retryable: statusCode >= 500,
    });
  }
}

/**
 * Parse Retry-After header value to milliseconds.
 *
 * @param retryAfter - Retry-After header value
 * @returns Delay in milliseconds
 */
function parseRetryAfter(retryAfter: string): number {
  // Try parsing as seconds (numeric)
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as HTTP date
  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  // Default to 60 seconds
  return 60000;
}

/**
 * Create a configuration error.
 */
export function createConfigurationError(
  type: ConfigurationErrorType,
  message: string,
  context?: Record<string, unknown>
): GoogleDriveError {
  return new GoogleDriveError(type, message, { retryable: false, context });
}

/**
 * Create an authentication error.
 */
export function createAuthenticationError(
  type: AuthenticationErrorType,
  message: string,
  context?: Record<string, unknown>
): GoogleDriveError {
  return new GoogleDriveError(type, message, { retryable: false, context });
}

/**
 * Create a network error.
 */
export function createNetworkError(
  type: NetworkErrorType,
  message: string,
  cause?: Error
): GoogleDriveError {
  return new GoogleDriveError(type, message, {
    retryable: type === NetworkErrorType.Timeout || type === NetworkErrorType.ConnectionFailed,
    cause,
  });
}

/**
 * Create an upload error.
 */
export function createUploadError(
  type: UploadErrorType,
  message: string,
  context?: Record<string, unknown>
): GoogleDriveError {
  return new GoogleDriveError(type, message, {
    retryable: type === UploadErrorType.UploadInterrupted,
    context,
  });
}

/**
 * Create a response error.
 */
export function createResponseError(
  type: ResponseErrorType,
  message: string,
  cause?: Error
): GoogleDriveError {
  return new GoogleDriveError(type, message, { retryable: false, cause });
}
