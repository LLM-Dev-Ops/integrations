/**
 * Error types for Google Artifact Registry integration.
 * @module errors
 */

/**
 * Error kinds for categorizing Artifact Registry errors.
 */
export enum ArtifactRegistryErrorKind {
  // Configuration errors
  InvalidProject = 'invalid_project',
  InvalidLocation = 'invalid_location',
  InvalidRepository = 'invalid_repository',
  InvalidConfiguration = 'invalid_configuration',

  // Authentication errors
  CredentialsNotFound = 'credentials_not_found',
  TokenExpired = 'token_expired',
  TokenRefreshFailed = 'token_refresh_failed',
  ServiceAccountInvalid = 'service_account_invalid',

  // Authorization errors
  PermissionDenied = 'permission_denied',
  ProjectAccessDenied = 'project_access_denied',
  RepositoryAccessDenied = 'repository_access_denied',

  // Repository errors
  RepositoryNotFound = 'repository_not_found',
  FormatMismatch = 'format_mismatch',
  LocationUnavailable = 'location_unavailable',

  // Package errors
  PackageNotFound = 'package_not_found',
  VersionNotFound = 'version_not_found',
  TagNotFound = 'tag_not_found',

  // Manifest errors
  ManifestNotFound = 'manifest_not_found',
  ManifestInvalid = 'manifest_invalid',
  DigestMismatch = 'digest_mismatch',
  SchemaNotSupported = 'schema_not_supported',
  PlatformNotFound = 'platform_not_found',
  UnsupportedMediaType = 'unsupported_media_type',

  // Blob errors
  BlobNotFound = 'blob_not_found',
  UploadFailed = 'upload_failed',
  UploadInitFailed = 'upload_init_failed',
  MountFailed = 'mount_failed',

  // Quota errors
  StorageExceeded = 'storage_exceeded',
  RequestsExceeded = 'requests_exceeded',
  DownloadExceeded = 'download_exceeded',

  // Network errors
  ConnectionFailed = 'connection_failed',
  Timeout = 'timeout',
  DnsResolutionFailed = 'dns_resolution_failed',

  // Server errors
  InternalError = 'internal_error',
  ServiceUnavailable = 'service_unavailable',

  // Vulnerability scan errors
  ScanFailed = 'scan_failed',
  ScanTimeout = 'scan_timeout',

  // Generic
  Unknown = 'unknown',
}

/**
 * Rate limit information extracted from error.
 */
export interface QuotaInfo {
  /** Retry-After header value in seconds */
  retryAfter?: number;
  /** Reset time */
  resetAt?: Date;
  /** Quota type */
  quotaType?: string;
}

/**
 * Base error class for Artifact Registry errors.
 */
export class ArtifactRegistryError extends Error {
  /** Error kind */
  public readonly kind: ArtifactRegistryErrorKind;
  /** HTTP status code */
  public readonly statusCode?: number;
  /** GCP request ID */
  public readonly requestId?: string;
  /** Quota information (if applicable) */
  public readonly quotaInfo?: QuotaInfo;
  /** Underlying cause */
  public readonly cause?: Error;
  /** Additional details */
  public readonly details?: Record<string, unknown>;

  constructor(
    kind: ArtifactRegistryErrorKind,
    message: string,
    options?: {
      statusCode?: number;
      requestId?: string;
      quotaInfo?: QuotaInfo;
      cause?: Error;
      details?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.name = 'ArtifactRegistryError';
    this.kind = kind;
    this.statusCode = options?.statusCode;
    this.requestId = options?.requestId;
    this.quotaInfo = options?.quotaInfo;
    this.cause = options?.cause;
    this.details = options?.details;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ArtifactRegistryError);
    }
  }

  /**
   * Returns true if this error is retryable.
   */
  isRetryable(): boolean {
    return [
      ArtifactRegistryErrorKind.TokenExpired,
      ArtifactRegistryErrorKind.RequestsExceeded,
      ArtifactRegistryErrorKind.ServiceUnavailable,
      ArtifactRegistryErrorKind.InternalError,
      ArtifactRegistryErrorKind.Timeout,
      ArtifactRegistryErrorKind.ConnectionFailed,
    ].includes(this.kind);
  }

  /**
   * Returns the retry delay in milliseconds.
   */
  getRetryDelay(): number | undefined {
    if (this.quotaInfo?.retryAfter !== undefined) {
      return this.quotaInfo.retryAfter * 1000;
    }

    if (this.quotaInfo?.resetAt) {
      const now = new Date();
      const resetAt = this.quotaInfo.resetAt;
      if (resetAt > now) {
        return resetAt.getTime() - now.getTime();
      }
    }

    // Default delays by error type
    switch (this.kind) {
      case ArtifactRegistryErrorKind.TokenExpired:
        return 0; // Immediate refresh
      case ArtifactRegistryErrorKind.RequestsExceeded:
        return 30000; // 30 seconds
      case ArtifactRegistryErrorKind.ServiceUnavailable:
        return 2000; // 2 seconds
      case ArtifactRegistryErrorKind.InternalError:
        return 1000; // 1 second
      case ArtifactRegistryErrorKind.Timeout:
        return 1000; // 1 second
      default:
        return undefined;
    }
  }

  /**
   * Creates an error from an HTTP status code.
   */
  static fromHttpStatus(
    status: number,
    message: string,
    options?: {
      requestId?: string;
      retryAfter?: number;
    }
  ): ArtifactRegistryError {
    const kind = ArtifactRegistryError.kindFromStatus(status);
    return new ArtifactRegistryError(kind, message, {
      statusCode: status,
      requestId: options?.requestId,
      quotaInfo: options?.retryAfter
        ? { retryAfter: options.retryAfter }
        : undefined,
    });
  }

  /**
   * Maps HTTP status code to error kind.
   */
  private static kindFromStatus(status: number): ArtifactRegistryErrorKind {
    switch (status) {
      case 400:
        return ArtifactRegistryErrorKind.InvalidConfiguration;
      case 401:
        return ArtifactRegistryErrorKind.TokenExpired;
      case 403:
        return ArtifactRegistryErrorKind.PermissionDenied;
      case 404:
        return ArtifactRegistryErrorKind.RepositoryNotFound;
      case 429:
        return ArtifactRegistryErrorKind.RequestsExceeded;
      case 500:
        return ArtifactRegistryErrorKind.InternalError;
      case 503:
        return ArtifactRegistryErrorKind.ServiceUnavailable;
      default:
        return ArtifactRegistryErrorKind.Unknown;
    }
  }

  /**
   * Creates an error from a Docker registry error response.
   */
  static fromRegistryError(
    errors: RegistryErrorResponse[]
  ): ArtifactRegistryError {
    const error = errors[0];
    if (!error) {
      return new ArtifactRegistryError(
        ArtifactRegistryErrorKind.Unknown,
        'Unknown registry error'
      );
    }

    const kind = ArtifactRegistryError.kindFromRegistryCode(error.code);
    return new ArtifactRegistryError(kind, error.message, {
      details: { code: error.code, detail: error.detail },
    });
  }

  /**
   * Maps Docker registry error code to error kind.
   */
  private static kindFromRegistryCode(
    code: string
  ): ArtifactRegistryErrorKind {
    switch (code) {
      case 'MANIFEST_UNKNOWN':
        return ArtifactRegistryErrorKind.ManifestNotFound;
      case 'BLOB_UNKNOWN':
        return ArtifactRegistryErrorKind.BlobNotFound;
      case 'DIGEST_INVALID':
        return ArtifactRegistryErrorKind.DigestMismatch;
      case 'NAME_UNKNOWN':
        return ArtifactRegistryErrorKind.RepositoryNotFound;
      case 'UNAUTHORIZED':
        return ArtifactRegistryErrorKind.TokenExpired;
      case 'DENIED':
        return ArtifactRegistryErrorKind.PermissionDenied;
      case 'MANIFEST_INVALID':
        return ArtifactRegistryErrorKind.ManifestInvalid;
      case 'UNSUPPORTED':
        return ArtifactRegistryErrorKind.SchemaNotSupported;
      default:
        return ArtifactRegistryErrorKind.Unknown;
    }
  }

  // Convenience factory methods

  static configuration(message: string): ArtifactRegistryError {
    return new ArtifactRegistryError(
      ArtifactRegistryErrorKind.InvalidConfiguration,
      message
    );
  }

  static credentialsNotFound(message: string): ArtifactRegistryError {
    return new ArtifactRegistryError(
      ArtifactRegistryErrorKind.CredentialsNotFound,
      message
    );
  }

  static tokenExpired(): ArtifactRegistryError {
    return new ArtifactRegistryError(
      ArtifactRegistryErrorKind.TokenExpired,
      'Token has expired',
      { statusCode: 401 }
    );
  }

  static permissionDenied(
    resource?: string,
    permission?: string
  ): ArtifactRegistryError {
    const message = resource
      ? `Permission denied for ${resource}${permission ? `: ${permission}` : ''}`
      : 'Permission denied';
    return new ArtifactRegistryError(
      ArtifactRegistryErrorKind.PermissionDenied,
      message,
      { statusCode: 403, details: { resource, permission } }
    );
  }

  static repositoryNotFound(name: string): ArtifactRegistryError {
    return new ArtifactRegistryError(
      ArtifactRegistryErrorKind.RepositoryNotFound,
      `Repository not found: ${name}`,
      { statusCode: 404 }
    );
  }

  static packageNotFound(name: string): ArtifactRegistryError {
    return new ArtifactRegistryError(
      ArtifactRegistryErrorKind.PackageNotFound,
      `Package not found: ${name}`,
      { statusCode: 404 }
    );
  }

  static versionNotFound(name: string): ArtifactRegistryError {
    return new ArtifactRegistryError(
      ArtifactRegistryErrorKind.VersionNotFound,
      `Version not found: ${name}`,
      { statusCode: 404 }
    );
  }

  static tagNotFound(name: string): ArtifactRegistryError {
    return new ArtifactRegistryError(
      ArtifactRegistryErrorKind.TagNotFound,
      `Tag not found: ${name}`,
      { statusCode: 404 }
    );
  }

  static manifestNotFound(reference: string): ArtifactRegistryError {
    return new ArtifactRegistryError(
      ArtifactRegistryErrorKind.ManifestNotFound,
      `Manifest not found: ${reference}`,
      { statusCode: 404 }
    );
  }

  static blobNotFound(digest: string): ArtifactRegistryError {
    return new ArtifactRegistryError(
      ArtifactRegistryErrorKind.BlobNotFound,
      `Blob not found: ${digest}`,
      { statusCode: 404 }
    );
  }

  static digestMismatch(
    expected: string,
    actual: string
  ): ArtifactRegistryError {
    return new ArtifactRegistryError(
      ArtifactRegistryErrorKind.DigestMismatch,
      `Digest mismatch: expected ${expected}, got ${actual}`,
      { details: { expected, actual } }
    );
  }

  static platformNotFound(
    requested: { architecture: string; os: string },
    available: { architecture: string; os: string }[]
  ): ArtifactRegistryError {
    return new ArtifactRegistryError(
      ArtifactRegistryErrorKind.PlatformNotFound,
      `Platform ${requested.os}/${requested.architecture} not found`,
      { details: { requested, available } }
    );
  }

  static uploadFailed(message: string): ArtifactRegistryError {
    return new ArtifactRegistryError(
      ArtifactRegistryErrorKind.UploadFailed,
      message
    );
  }

  static quotaExceeded(
    quotaType: string,
    retryAfter?: number
  ): ArtifactRegistryError {
    return new ArtifactRegistryError(
      ArtifactRegistryErrorKind.RequestsExceeded,
      `Quota exceeded: ${quotaType}`,
      {
        statusCode: 429,
        quotaInfo: { quotaType, retryAfter },
      }
    );
  }

  static timeout(message: string): ArtifactRegistryError {
    return new ArtifactRegistryError(
      ArtifactRegistryErrorKind.Timeout,
      message
    );
  }

  static scanFailed(reason: string): ArtifactRegistryError {
    return new ArtifactRegistryError(
      ArtifactRegistryErrorKind.ScanFailed,
      `Vulnerability scan failed: ${reason}`
    );
  }

  static scanTimeout(): ArtifactRegistryError {
    return new ArtifactRegistryError(
      ArtifactRegistryErrorKind.ScanTimeout,
      'Vulnerability scan timed out'
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
    return result;
  }
}

/**
 * Docker registry error response format.
 */
export interface RegistryErrorResponse {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Additional detail */
  detail?: unknown;
}

/**
 * Type guard for ArtifactRegistryError.
 */
export function isArtifactRegistryError(
  error: unknown
): error is ArtifactRegistryError {
  return error instanceof ArtifactRegistryError;
}

/**
 * Checks if an error is a quota/rate limit error.
 */
export function isQuotaError(error: ArtifactRegistryError): boolean {
  return [
    ArtifactRegistryErrorKind.StorageExceeded,
    ArtifactRegistryErrorKind.RequestsExceeded,
    ArtifactRegistryErrorKind.DownloadExceeded,
  ].includes(error.kind);
}

/**
 * Checks if an error is an authentication error.
 */
export function isAuthError(error: ArtifactRegistryError): boolean {
  return [
    ArtifactRegistryErrorKind.CredentialsNotFound,
    ArtifactRegistryErrorKind.TokenExpired,
    ArtifactRegistryErrorKind.TokenRefreshFailed,
    ArtifactRegistryErrorKind.ServiceAccountInvalid,
  ].includes(error.kind);
}

/**
 * Checks if an error is a not found error.
 */
export function isNotFoundError(error: ArtifactRegistryError): boolean {
  return [
    ArtifactRegistryErrorKind.RepositoryNotFound,
    ArtifactRegistryErrorKind.PackageNotFound,
    ArtifactRegistryErrorKind.VersionNotFound,
    ArtifactRegistryErrorKind.TagNotFound,
    ArtifactRegistryErrorKind.ManifestNotFound,
    ArtifactRegistryErrorKind.BlobNotFound,
  ].includes(error.kind);
}
