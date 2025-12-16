/**
 * GitLab Integration Error Types
 *
 * Comprehensive error handling for the GitLab integration based on SPARC specifications.
 * Provides categorized errors for API, client, webhook, and simulation failures.
 */

/**
 * Base error class for all GitLab integration errors.
 * Extends the native Error class with additional metadata for error handling.
 */
export class GitLabError extends Error {
  /**
   * Error code for programmatic error identification
   */
  readonly code: string;

  /**
   * HTTP status code (if applicable)
   */
  readonly statusCode?: number;

  /**
   * Whether the operation can be retried
   */
  readonly retryable: boolean;

  /**
   * Number of seconds to wait before retrying (from Retry-After header)
   */
  readonly retryAfter?: number;

  /**
   * URL to relevant documentation for this error
   */
  readonly documentationUrl?: string;

  /**
   * Original error that caused this error (if any)
   */
  override readonly cause?: Error;

  constructor(
    message: string,
    code: string,
    options: {
      statusCode?: number;
      retryable?: boolean;
      retryAfter?: number;
      documentationUrl?: string;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
    this.retryAfter = options.retryAfter;
    this.documentationUrl = options.documentationUrl;
    this.cause = options.cause;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Check if this error can be retried
   */
  isRetryable(): boolean {
    return this.retryable;
  }

  /**
   * Get a JSON representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      retryable: this.retryable,
      retryAfter: this.retryAfter,
      documentationUrl: this.documentationUrl,
      stack: this.stack,
    };
  }
}

// ============================================================================
// API Errors (from GitLab)
// ============================================================================

/**
 * Error thrown when GitLab API returns 400 Bad Request.
 * Indicates malformed request. Not retryable.
 */
export class BadRequestError extends GitLabError {
  constructor(message: string = "Bad request to GitLab API") {
    super(message, "BAD_REQUEST", {
      statusCode: 400,
      retryable: false,
      documentationUrl: "https://docs.gitlab.com/ee/api/rest/#status-codes",
    });
  }
}

/**
 * Error thrown when GitLab API returns 401 Unauthorized.
 * Indicates invalid or missing authentication token. Not retryable.
 */
export class UnauthorizedError extends GitLabError {
  constructor(message: string = "Unauthorized - check your GitLab token") {
    super(message, "UNAUTHORIZED", {
      statusCode: 401,
      retryable: false,
      documentationUrl: "https://docs.gitlab.com/ee/api/rest/#authentication",
    });
  }
}

/**
 * Error thrown when GitLab API returns 403 Forbidden.
 * Indicates insufficient permissions. Not retryable.
 */
export class ForbiddenError extends GitLabError {
  constructor(
    message: string = "Forbidden - check your GitLab permissions"
  ) {
    super(message, "FORBIDDEN", {
      statusCode: 403,
      retryable: false,
      documentationUrl: "https://docs.gitlab.com/ee/user/permissions.html",
    });
  }
}

/**
 * Error thrown when GitLab API returns 404 Not Found.
 * Indicates the requested resource does not exist. Not retryable.
 */
export class NotFoundError extends GitLabError {
  constructor(message: string = "Resource not found in GitLab") {
    super(message, "NOT_FOUND", {
      statusCode: 404,
      retryable: false,
      documentationUrl: "https://docs.gitlab.com/ee/api/rest/#status-codes",
    });
  }
}

/**
 * Error thrown when GitLab API returns 409 Conflict.
 * Indicates a conflict (e.g., merge request conflicts). Not retryable.
 */
export class ConflictError extends GitLabError {
  constructor(
    message: string = "Conflict with existing resource (e.g., merge request conflicts)"
  ) {
    super(message, "CONFLICT", {
      statusCode: 409,
      retryable: false,
      documentationUrl: "https://docs.gitlab.com/ee/api/rest/#status-codes",
    });
  }
}

/**
 * Error thrown when GitLab API returns 429 Too Many Requests.
 * Indicates rate limiting. Retryable after waiting Retry-After duration.
 */
export class RateLimitError extends GitLabError {
  constructor(message: string = "Rate limit exceeded", retryAfter?: number) {
    super(message, "RATE_LIMIT", {
      statusCode: 429,
      retryable: true,
      retryAfter,
      documentationUrl: "https://docs.gitlab.com/ee/user/gitlab_com/index.html#gitlabcom-specific-rate-limits",
    });
  }
}

/**
 * Error thrown when GitLab API returns 500 Internal Server Error.
 * Indicates a server-side error. Retryable.
 */
export class InternalServerError extends GitLabError {
  constructor(message: string = "GitLab internal server error") {
    super(message, "INTERNAL_SERVER_ERROR", {
      statusCode: 500,
      retryable: true,
      documentationUrl: "https://docs.gitlab.com/ee/api/rest/#status-codes",
    });
  }
}

/**
 * Error thrown when GitLab API returns 503 Service Unavailable.
 * Indicates GitLab service is temporarily unavailable. Retryable.
 */
export class ServiceUnavailableError extends GitLabError {
  constructor(
    message: string = "GitLab service temporarily unavailable",
    retryAfter?: number
  ) {
    super(message, "SERVICE_UNAVAILABLE", {
      statusCode: 503,
      retryable: true,
      retryAfter,
      documentationUrl: "https://docs.gitlab.com/ee/api/rest/#status-codes",
    });
  }
}

// ============================================================================
// Client Errors
// ============================================================================

/**
 * Error thrown when a project reference (ID or path) is invalid.
 * Indicates validation failure. Not retryable.
 */
export class InvalidProjectRefError extends GitLabError {
  constructor(
    message: string = "Invalid project reference format",
    projectRef?: string
  ) {
    const fullMessage = projectRef
      ? `${message}: ${projectRef}`
      : message;
    super(fullMessage, "INVALID_PROJECT_REF", {
      retryable: false,
    });
  }
}

/**
 * Error thrown when a URL cannot be parsed or is invalid.
 * Indicates URL parsing failure. Not retryable.
 */
export class InvalidUrlError extends GitLabError {
  constructor(message: string = "Invalid URL format", url?: string) {
    const fullMessage = url ? `${message}: ${url}` : message;
    super(fullMessage, "INVALID_URL", {
      retryable: false,
    });
  }
}

/**
 * Error thrown when JSON serialization/deserialization fails.
 * Indicates data format error. Not retryable.
 */
export class SerializationError extends GitLabError {
  constructor(message: string = "JSON serialization error", cause?: Error) {
    super(message, "SERIALIZATION_ERROR", {
      retryable: false,
      cause,
    });
  }
}

/**
 * Error thrown when a network request fails.
 * Indicates network connectivity issues. Retryable.
 */
export class NetworkError extends GitLabError {
  constructor(message: string = "Network request failed", cause?: Error) {
    super(message, "NETWORK_ERROR", {
      retryable: true,
      cause,
    });
  }
}

/**
 * Error thrown when a request times out.
 * Indicates the request took too long to complete. Retryable.
 */
export class TimeoutError extends GitLabError {
  constructor(message: string = "Request timeout", cause?: Error) {
    super(message, "TIMEOUT_ERROR", {
      retryable: true,
      cause,
    });
  }
}

// ============================================================================
// Webhook Errors
// ============================================================================

/**
 * Error thrown when webhook validation fails.
 * Indicates token mismatch or invalid signature. Not retryable.
 */
export class WebhookValidationError extends GitLabError {
  constructor(message: string = "Webhook validation failed - token mismatch") {
    super(message, "WEBHOOK_VALIDATION_ERROR", {
      retryable: false,
      documentationUrl: "https://docs.gitlab.com/ee/user/project/integrations/webhooks.html#validate-payloads-by-using-a-secret-token",
    });
  }
}

/**
 * Error thrown when required webhook event header is missing.
 * Indicates malformed webhook request. Not retryable.
 */
export class InvalidWebhookEventError extends GitLabError {
  constructor(message: string = "Missing or invalid webhook event header") {
    super(message, "INVALID_WEBHOOK_EVENT", {
      retryable: false,
      documentationUrl: "https://docs.gitlab.com/ee/user/project/integrations/webhooks.html#events",
    });
  }
}

/**
 * Error thrown when webhook event type is not supported.
 * Indicates unsupported event type. Not retryable.
 */
export class UnknownWebhookEventError extends GitLabError {
  constructor(eventType: string) {
    super(
      `Unknown or unsupported webhook event type: ${eventType}`,
      "UNKNOWN_WEBHOOK_EVENT",
      {
        retryable: false,
        documentationUrl: "https://docs.gitlab.com/ee/user/project/integrations/webhooks.html#events",
      }
    );
  }
}

// ============================================================================
// Simulation Errors
// ============================================================================

/**
 * Error thrown when a simulation cache key is not found.
 * Indicates missing test data. Not retryable.
 */
export class SimulationMissError extends GitLabError {
  constructor(cacheKey: string) {
    super(
      `Simulation cache miss: key "${cacheKey}" not found`,
      "SIMULATION_MISS",
      {
        retryable: false,
      }
    );
  }
}

/**
 * Error thrown when simulation data file is corrupted or cannot be parsed.
 * Indicates file parsing error. Not retryable.
 */
export class SimulationCorruptedError extends GitLabError {
  constructor(message: string = "Simulation data corrupted", cause?: Error) {
    super(message, "SIMULATION_CORRUPTED", {
      retryable: false,
      cause,
    });
  }
}

// ============================================================================
// Error Parsing Utility
// ============================================================================

/**
 * Parse a GitLab API error response and return the appropriate error type.
 *
 * @param status - HTTP status code
 * @param body - Response body (may contain error details)
 * @param headers - Response headers (may contain Retry-After)
 * @returns Appropriate GitLabError subclass instance
 *
 * @example
 * ```typescript
 * const response = await fetch(url);
 * if (!response.ok) {
 *   const body = await response.json().catch(() => ({}));
 *   throw parseGitLabError(response.status, body, response.headers);
 * }
 * ```
 */
export function parseGitLabError(
  status: number,
  body: any,
  headers?: Headers
): GitLabError {
  // Extract error message from body if available
  let message: string | undefined;
  if (body && typeof body === "object") {
    message =
      body.message ||
      body.error ||
      body.error_description ||
      (Array.isArray(body.errors) ? body.errors.join(", ") : undefined);
  }

  // Extract Retry-After header if present
  let retryAfter: number | undefined;
  if (headers?.has("Retry-After")) {
    const retryAfterValue = headers.get("Retry-After");
    if (retryAfterValue) {
      const parsed = parseInt(retryAfterValue, 10);
      if (!isNaN(parsed)) {
        retryAfter = parsed;
      }
    }
  }

  // Map status code to specific error type
  switch (status) {
    case 400:
      return new BadRequestError(message);
    case 401:
      return new UnauthorizedError(message);
    case 403:
      return new ForbiddenError(message);
    case 404:
      return new NotFoundError(message);
    case 409:
      return new ConflictError(message);
    case 429:
      return new RateLimitError(message, retryAfter);
    case 500:
      return new InternalServerError(message);
    case 503:
      return new ServiceUnavailableError(message, retryAfter);
    default:
      // For unknown status codes, create a generic error
      const isRetryable = status >= 500 && status < 600;
      return new GitLabError(
        message || `GitLab API error: ${status}`,
        "UNKNOWN_ERROR",
        {
          statusCode: status,
          retryable: isRetryable,
          retryAfter,
        }
      );
  }
}

/**
 * Type guard to check if an error is a GitLabError
 */
export function isGitLabError(error: unknown): error is GitLabError {
  return error instanceof GitLabError;
}

/**
 * Type guard to check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  return isGitLabError(error) && error.isRetryable();
}
