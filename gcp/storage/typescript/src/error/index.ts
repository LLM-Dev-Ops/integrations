/**
 * GCS Error Types
 *
 * Comprehensive error hierarchy following the SPARC specification.
 */

/**
 * Base GCS error class.
 */
export class GcsError extends Error {
  public readonly code: string;
  public readonly requestId?: string;
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: string,
    options?: { requestId?: string; retryable?: boolean }
  ) {
    super(message);
    this.name = "GcsError";
    this.code = code;
    this.requestId = options?.requestId;
    this.retryable = options?.retryable ?? false;
    Object.setPrototypeOf(this, GcsError.prototype);
  }

  /**
   * Get retry-after hint in milliseconds if available.
   */
  get retryAfter(): number | undefined {
    return undefined;
  }

  /**
   * HTTP status code if applicable.
   */
  get statusCode(): number | undefined {
    return undefined;
  }
}

/**
 * Configuration error.
 */
export class ConfigurationError extends GcsError {
  constructor(
    message: string,
    code:
      | "InvalidBucketName"
      | "InvalidObjectName"
      | "InvalidCredentials"
      | "MissingProject"
      | "InvalidConfig" = "InvalidConfig"
  ) {
    super(message, `Configuration.${code}`);
    this.name = "ConfigurationError";
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * Authentication error.
 */
export class AuthenticationError extends GcsError {
  private readonly _statusCode?: number;
  private readonly _retryAfter?: number;

  constructor(
    message: string,
    code:
      | "TokenExpired"
      | "TokenRefreshFailed"
      | "InvalidServiceAccount"
      | "PermissionDenied"
      | "InvalidCredentials" = "InvalidCredentials",
    options?: { requestId?: string; statusCode?: number; retryAfter?: number }
  ) {
    super(message, `Authentication.${code}`, {
      requestId: options?.requestId,
      retryable: code === "TokenExpired",
    });
    this.name = "AuthenticationError";
    this._statusCode = options?.statusCode;
    this._retryAfter = options?.retryAfter;
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }

  override get statusCode(): number | undefined {
    return this._statusCode;
  }

  override get retryAfter(): number | undefined {
    return this._retryAfter;
  }
}

/**
 * Object operation error.
 */
export class ObjectError extends GcsError {
  public readonly bucket?: string;
  public readonly object?: string;
  private readonly _statusCode?: number;

  constructor(
    message: string,
    code:
      | "NotFound"
      | "PreconditionFailed"
      | "GenerationMismatch"
      | "TooLarge"
      | "InvalidRange",
    options?: { bucket?: string; object?: string; requestId?: string; statusCode?: number }
  ) {
    super(message, `Object.${code}`, { requestId: options?.requestId });
    this.name = "ObjectError";
    this.bucket = options?.bucket;
    this.object = options?.object;
    this._statusCode = options?.statusCode;
    Object.setPrototypeOf(this, ObjectError.prototype);
  }

  override get statusCode(): number | undefined {
    return this._statusCode;
  }
}

/**
 * Bucket operation error.
 */
export class BucketError extends GcsError {
  public readonly bucket?: string;
  private readonly _statusCode?: number;

  constructor(
    message: string,
    code: "NotFound" | "AccessDenied" | "InvalidState",
    options?: { bucket?: string; requestId?: string; statusCode?: number }
  ) {
    super(message, `Bucket.${code}`, { requestId: options?.requestId });
    this.name = "BucketError";
    this.bucket = options?.bucket;
    this._statusCode = options?.statusCode;
    Object.setPrototypeOf(this, BucketError.prototype);
  }

  override get statusCode(): number | undefined {
    return this._statusCode;
  }
}

/**
 * Upload error.
 */
export class UploadError extends GcsError {
  public readonly offset?: number;

  constructor(
    message: string,
    code:
      | "InitiationFailed"
      | "ChunkFailed"
      | "SessionExpired"
      | "ChecksumMismatch"
      | "Aborted",
    options?: { offset?: number; requestId?: string; retryable?: boolean }
  ) {
    super(message, `Upload.${code}`, {
      requestId: options?.requestId,
      retryable: options?.retryable ?? (code === "ChunkFailed"),
    });
    this.name = "UploadError";
    this.offset = options?.offset;
    Object.setPrototypeOf(this, UploadError.prototype);
  }
}

/**
 * Download error.
 */
export class DownloadError extends GcsError {
  constructor(
    message: string,
    code: "RangeNotSatisfiable" | "StreamInterrupted" | "DecompressionFailed",
    options?: { requestId?: string; retryable?: boolean }
  ) {
    super(message, `Download.${code}`, {
      requestId: options?.requestId,
      retryable: options?.retryable ?? (code === "StreamInterrupted"),
    });
    this.name = "DownloadError";
    Object.setPrototypeOf(this, DownloadError.prototype);
  }
}

/**
 * Network/transport error.
 */
export class NetworkError extends GcsError {
  constructor(
    message: string,
    code: "ConnectionFailed" | "Timeout" | "DnsResolutionFailed" | "TlsError",
    options?: { retryable?: boolean }
  ) {
    super(message, `Network.${code}`, {
      retryable: options?.retryable ?? (code !== "TlsError"),
    });
    this.name = "NetworkError";
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Server-side error.
 */
export class ServerError extends GcsError {
  private readonly _statusCode?: number;
  private readonly _retryAfter?: number;

  constructor(
    message: string,
    code: "InternalError" | "ServiceUnavailable" | "RateLimited" | "QuotaExceeded",
    options?: { statusCode?: number; retryAfter?: number; requestId?: string }
  ) {
    super(message, `Server.${code}`, { requestId: options?.requestId, retryable: true });
    this.name = "ServerError";
    this._statusCode = options?.statusCode;
    this._retryAfter = options?.retryAfter;
    Object.setPrototypeOf(this, ServerError.prototype);
  }

  override get statusCode(): number | undefined {
    return this._statusCode;
  }

  override get retryAfter(): number | undefined {
    return this._retryAfter;
  }
}

/**
 * Signing error.
 */
export class SigningError extends GcsError {
  constructor(message: string) {
    super(message, "SigningError");
    this.name = "SigningError";
    Object.setPrototypeOf(this, SigningError.prototype);
  }
}

/**
 * GCS error response from JSON.
 */
export interface GcsErrorResponse {
  code: number;
  message: string;
  errors?: Array<{
    domain: string;
    reason: string;
    message: string;
  }>;
}

/**
 * Parse GCS error from HTTP response.
 */
export function parseGcsError(
  status: number,
  body: string,
  requestId?: string
): GcsError {
  let errorResponse: GcsErrorResponse | undefined;

  try {
    const json = JSON.parse(body);
    errorResponse = json.error as GcsErrorResponse;
  } catch {
    // Body is not JSON, use status code to determine error type
  }

  const message = errorResponse?.message ?? `HTTP ${status}`;
  const reason = errorResponse?.errors?.[0]?.reason;

  // Map HTTP status codes to error types
  switch (status) {
    case 400:
      return new ConfigurationError(message, "InvalidConfig");

    case 401:
      return new AuthenticationError(message, "TokenExpired", {
        requestId,
        statusCode: status,
      });

    case 403:
      if (reason === "forbidden") {
        return new AuthenticationError(message, "PermissionDenied", {
          requestId,
          statusCode: status,
        });
      }
      return new BucketError(message, "AccessDenied", { requestId, statusCode: status });

    case 404:
      if (reason === "notFound") {
        return new ObjectError(message, "NotFound", { requestId, statusCode: status });
      }
      return new BucketError(message, "NotFound", { requestId, statusCode: status });

    case 408:
      return new NetworkError(message, "Timeout");

    case 412:
      return new ObjectError(message, "PreconditionFailed", {
        requestId,
        statusCode: status,
      });

    case 416:
      return new DownloadError(message, "RangeNotSatisfiable", { requestId });

    case 429:
      return new ServerError(message, "RateLimited", {
        requestId,
        statusCode: status,
      });

    case 500:
      return new ServerError(message, "InternalError", {
        requestId,
        statusCode: status,
      });

    case 503:
      return new ServerError(message, "ServiceUnavailable", {
        requestId,
        statusCode: status,
      });

    default:
      if (status >= 500) {
        return new ServerError(message, "InternalError", {
          requestId,
          statusCode: status,
        });
      }
      return new GcsError(message, `HTTP_${status}`, { requestId });
  }
}

/**
 * Map GCS error code (reason) to appropriate error class.
 */
export function mapGcsErrorCode(
  reason: string,
  message: string,
  requestId?: string
): GcsError {
  switch (reason) {
    // Object errors
    case "notFound":
      return new ObjectError(message, "NotFound", { requestId });
    case "conditionNotMet":
      return new ObjectError(message, "PreconditionFailed", { requestId });

    // Auth errors
    case "authError":
    case "required":
      return new AuthenticationError(message, "TokenExpired", { requestId });
    case "forbidden":
    case "accessNotConfigured":
      return new AuthenticationError(message, "PermissionDenied", { requestId });

    // Rate limiting
    case "rateLimitExceeded":
    case "userRateLimitExceeded":
      return new ServerError(message, "RateLimited", { requestId });
    case "quotaExceeded":
      return new ServerError(message, "QuotaExceeded", { requestId });

    // Server errors
    case "backendError":
    case "internalError":
      return new ServerError(message, "InternalError", { requestId });

    default:
      return new GcsError(message, reason, { requestId });
  }
}
