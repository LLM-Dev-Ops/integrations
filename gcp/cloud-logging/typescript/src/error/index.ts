/**
 * GCL Error Types
 *
 * Comprehensive error hierarchy following the SPARC specification.
 */

/**
 * Base GCL error class.
 */
export class GclError extends Error {
  public readonly code: string;
  public readonly requestId?: string;
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: string,
    options?: { requestId?: string; retryable?: boolean }
  ) {
    super(message);
    this.name = "GclError";
    this.code = code;
    this.requestId = options?.requestId;
    this.retryable = options?.retryable ?? false;
    Object.setPrototypeOf(this, GclError.prototype);
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

  /**
   * Check if error is retryable.
   */
  isRetryable(): boolean {
    return this.retryable;
  }
}

/**
 * Configuration error.
 */
export class ConfigurationError extends GclError {
  constructor(
    message: string,
    code:
      | "InvalidProjectId"
      | "InvalidLogName"
      | "InvalidFilter"
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
export class AuthenticationError extends GclError {
  private readonly _statusCode?: number;
  private readonly _retryAfter?: number;

  constructor(
    message: string,
    code:
      | "TokenExpired"
      | "TokenRefreshFailed"
      | "PermissionDenied"
      | "QuotaExceeded"
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
 * Write operation error.
 */
export class WriteError extends GclError {
  public readonly successCount?: number;
  public readonly failureCount?: number;

  constructor(
    message: string,
    code:
      | "PayloadTooLarge"
      | "InvalidEntry"
      | "PartialFailure"
      | "BufferOverflow"
      | "CircuitOpen",
    options?: { requestId?: string; successCount?: number; failureCount?: number }
  ) {
    super(message, `Write.${code}`, {
      requestId: options?.requestId,
      retryable: code === "PartialFailure",
    });
    this.name = "WriteError";
    this.successCount = options?.successCount;
    this.failureCount = options?.failureCount;
    Object.setPrototypeOf(this, WriteError.prototype);
  }
}

/**
 * Query operation error.
 */
export class QueryError extends GclError {
  constructor(
    message: string,
    code:
      | "InvalidFilter"
      | "TimeRangeInvalid"
      | "ResultsTruncated",
    options?: { requestId?: string }
  ) {
    super(message, `Query.${code}`, { requestId: options?.requestId });
    this.name = "QueryError";
    Object.setPrototypeOf(this, QueryError.prototype);
  }
}

/**
 * Network/transport error.
 */
export class NetworkError extends GclError {
  constructor(
    message: string,
    code: "ConnectionFailed" | "Timeout" | "GrpcError",
    options?: { retryable?: boolean }
  ) {
    super(message, `Network.${code}`, {
      retryable: options?.retryable ?? true,
    });
    this.name = "NetworkError";
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

/**
 * Server-side error.
 */
export class ServerError extends GclError {
  private readonly _statusCode?: number;
  private readonly _retryAfter?: number;

  constructor(
    message: string,
    code: "InternalError" | "ServiceUnavailable" | "RateLimited",
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
 * GCL error response from JSON.
 */
export interface GclErrorResponse {
  code: number;
  message: string;
  status?: string;
  details?: Array<{
    "@type": string;
    [key: string]: unknown;
  }>;
}

/**
 * Parse GCL error from HTTP response.
 */
export function parseGclError(
  status: number,
  body: string,
  requestId?: string
): GclError {
  let errorResponse: GclErrorResponse | undefined;

  try {
    const json = JSON.parse(body) as { error?: GclErrorResponse };
    errorResponse = json.error;
  } catch {
    // Body is not JSON, use status code to determine error type
  }

  const message = errorResponse?.message ?? `HTTP ${status}`;

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
      return new AuthenticationError(message, "PermissionDenied", {
        requestId,
        statusCode: status,
      });

    case 404:
      return new ConfigurationError(message, "InvalidLogName");

    case 408:
      return new NetworkError(message, "Timeout");

    case 413:
      return new WriteError(message, "PayloadTooLarge", { requestId });

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
      return new GclError(message, `HTTP_${status}`, { requestId });
  }
}

/**
 * Check if an error is retryable based on its type.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof GclError) {
    return error.isRetryable();
  }
  return false;
}
