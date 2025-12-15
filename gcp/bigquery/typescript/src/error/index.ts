/**
 * BigQuery Error Types
 *
 * Comprehensive error hierarchy following the SPARC specification.
 */

/**
 * Base BigQuery error class.
 */
export class BigQueryError extends Error {
  public readonly code: string;
  public readonly requestId?: string;
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: string,
    options?: { requestId?: string; retryable?: boolean }
  ) {
    super(message);
    this.name = "BigQueryError";
    this.code = code;
    this.requestId = options?.requestId;
    this.retryable = options?.retryable ?? false;
    Object.setPrototypeOf(this, BigQueryError.prototype);
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
export class ConfigurationError extends BigQueryError {
  constructor(
    message: string,
    code:
      | "InvalidProjectId"
      | "InvalidDataset"
      | "InvalidTable"
      | "InvalidConfig"
      | "MissingProject" = "InvalidConfig"
  ) {
    super(message, `Configuration.${code}`);
    this.name = "ConfigurationError";
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * Authentication error.
 */
export class AuthenticationError extends BigQueryError {
  private readonly _statusCode?: number;
  private readonly _retryAfter?: number;

  constructor(
    message: string,
    code:
      | "TokenExpired"
      | "TokenRefreshFailed"
      | "PermissionDenied"
      | "InvalidCredentials" = "InvalidCredentials",
    options?: { requestId?: string; statusCode?: number; retryAfter?: number }
  ) {
    super(message, `Authentication.${code}`, {
      requestId: options?.requestId,
      retryable: code === "TokenExpired" || code === "TokenRefreshFailed",
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
 * Query execution error.
 */
export class QueryError extends BigQueryError {
  public readonly query?: string;
  private readonly _statusCode?: number;

  constructor(
    message: string,
    code:
      | "InvalidQuery"
      | "SyntaxError"
      | "ResourceNotFound"
      | "AccessDenied"
      | "TimeoutExceeded"
      | "BytesExceeded"
      | "SlotUnavailable",
    options?: { query?: string; requestId?: string; statusCode?: number }
  ) {
    super(message, `Query.${code}`, {
      requestId: options?.requestId,
      retryable: code === "TimeoutExceeded" || code === "SlotUnavailable",
    });
    this.name = "QueryError";
    this.query = options?.query;
    this._statusCode = options?.statusCode;
    Object.setPrototypeOf(this, QueryError.prototype);
  }

  override get statusCode(): number | undefined {
    return this._statusCode;
  }
}

/**
 * Job operation error.
 */
export class JobError extends BigQueryError {
  public readonly jobId?: string;
  private readonly _statusCode?: number;

  constructor(
    message: string,
    code: "NotFound" | "Cancelled" | "Failed" | "Timeout",
    options?: { jobId?: string; requestId?: string; statusCode?: number; retryable?: boolean }
  ) {
    super(message, `Job.${code}`, {
      requestId: options?.requestId,
      retryable: options?.retryable ?? (code === "Timeout")
    });
    this.name = "JobError";
    this.jobId = options?.jobId;
    this._statusCode = options?.statusCode;
    Object.setPrototypeOf(this, JobError.prototype);
  }

  override get statusCode(): number | undefined {
    return this._statusCode;
  }
}

/**
 * Streaming insert error.
 */
export class StreamingError extends BigQueryError {
  public readonly failedRows?: number;

  constructor(
    message: string,
    code: "InsertFailed" | "TemplateSuffixMismatch" | "InvalidRows" | "RowCountExceeded",
    options?: { failedRows?: number; requestId?: string; retryable?: boolean }
  ) {
    super(message, `Streaming.${code}`, {
      requestId: options?.requestId,
      retryable: options?.retryable ?? (code === "InsertFailed"),
    });
    this.name = "StreamingError";
    this.failedRows = options?.failedRows;
    Object.setPrototypeOf(this, StreamingError.prototype);
  }
}

/**
 * Network/transport error.
 */
export class NetworkError extends BigQueryError {
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
export class ServerError extends BigQueryError {
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
 * BigQuery error response from JSON.
 */
export interface BigQueryErrorResponse {
  code: number;
  message: string;
  status?: string;
  errors?: Array<{
    domain: string;
    reason: string;
    message: string;
    location?: string;
    locationType?: string;
  }>;
}

/**
 * Parse BigQuery error from HTTP response.
 */
export function parseBigQueryError(
  status: number,
  body: string,
  requestId?: string
): BigQueryError {
  let errorResponse: BigQueryErrorResponse | undefined;

  try {
    const json = JSON.parse(body);
    errorResponse = json.error as BigQueryErrorResponse;
  } catch {
    // Body is not JSON, use status code to determine error type
  }

  const message = errorResponse?.message ?? `HTTP ${status}`;
  const reason = errorResponse?.errors?.[0]?.reason;

  // If we have a reason, try to map it first for more specific errors
  if (reason) {
    const mappedError = mapBigQueryErrorReason(reason, message, requestId, status);
    if (mappedError) {
      return mappedError;
    }
  }

  // Map HTTP status codes to error types
  switch (status) {
    case 400:
      // Bad request - could be invalid query or configuration
      if (reason === "invalidQuery" || reason === "invalid") {
        return new QueryError(message, "InvalidQuery", {
          requestId,
          statusCode: status,
        });
      }
      return new ConfigurationError(message, "InvalidConfig");

    case 401:
      return new AuthenticationError(message, "TokenExpired", {
        requestId,
        statusCode: status,
      });

    case 403:
      // Forbidden - permission denied
      return new AuthenticationError(message, "PermissionDenied", {
        requestId,
        statusCode: status,
      });

    case 404:
      // Not found - could be resource, table, dataset, or job
      if (message.toLowerCase().includes("job")) {
        return new JobError(message, "NotFound", {
          requestId,
          statusCode: status,
        });
      }
      // Default to query resource not found
      return new QueryError(message, "ResourceNotFound", {
        requestId,
        statusCode: status,
      });

    case 408:
      // Request timeout
      return new QueryError(message, "TimeoutExceeded", {
        requestId,
        statusCode: status,
      });

    case 429:
      // Too many requests - rate limited
      return new ServerError(message, "RateLimited", {
        requestId,
        statusCode: status,
      });

    case 500:
      // Internal server error
      return new ServerError(message, "InternalError", {
        requestId,
        statusCode: status,
      });

    case 503:
      // Service unavailable
      return new ServerError(message, "ServiceUnavailable", {
        requestId,
        statusCode: status,
      });

    case 504:
      // Gateway timeout
      return new QueryError(message, "TimeoutExceeded", {
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
      return new BigQueryError(message, `HTTP_${status}`, { requestId });
  }
}

/**
 * Map BigQuery error reason to appropriate error class.
 */
function mapBigQueryErrorReason(
  reason: string,
  message: string,
  requestId?: string,
  statusCode?: number
): BigQueryError | null {
  switch (reason) {
    // Query errors
    case "invalidQuery":
      return new QueryError(message, "InvalidQuery", { requestId, statusCode });
    case "syntaxError":
      return new QueryError(message, "SyntaxError", { requestId, statusCode });
    case "notFound":
      // Determine type based on message content
      if (message.toLowerCase().includes("job")) {
        return new JobError(message, "NotFound", { requestId, statusCode });
      }
      return new QueryError(message, "ResourceNotFound", { requestId, statusCode });
    case "timeout":
      return new QueryError(message, "TimeoutExceeded", { requestId, statusCode });
    case "jobRateLimitExceeded":
    case "resourcesExceeded":
      return new QueryError(message, "SlotUnavailable", { requestId, statusCode });
    case "accessDenied":
      return new QueryError(message, "AccessDenied", { requestId, statusCode });
    case "billingTierLimitExceeded":
    case "responseTooLarge":
      return new QueryError(message, "BytesExceeded", { requestId, statusCode });

    // Auth errors
    case "authError":
    case "required":
    case "unauthenticated":
      return new AuthenticationError(message, "TokenExpired", {
        requestId,
        statusCode,
      });
    case "forbidden":
    case "insufficientPermissions":
      return new AuthenticationError(message, "PermissionDenied", {
        requestId,
        statusCode,
      });

    // Rate limiting and quota
    case "rateLimitExceeded":
    case "userRateLimitExceeded":
    case "concurrentRateLimitExceeded":
      return new ServerError(message, "RateLimited", { requestId, statusCode });
    case "quotaExceeded":
    case "resourceExhausted":
      return new ServerError(message, "QuotaExceeded", { requestId, statusCode });

    // Server errors
    case "backendError":
      return new ServerError(message, "InternalError", { requestId, statusCode });
    case "internalError":
      return new ServerError(message, "InternalError", { requestId, statusCode });
    case "serviceUnavailable":
      return new ServerError(message, "ServiceUnavailable", { requestId, statusCode });

    // Streaming errors
    case "invalid":
      if (message.toLowerCase().includes("row")) {
        return new StreamingError(message, "InvalidRows", { requestId });
      }
      return null; // Let caller handle with default logic
    case "stopped":
      return new StreamingError(message, "InsertFailed", { requestId });

    // Job errors
    case "jobNotFound":
      return new JobError(message, "NotFound", { requestId, statusCode });
    case "duplicate":
      return new ConfigurationError(message, "InvalidConfig");

    default:
      return null; // Let caller handle with default logic
  }
}
