/**
 * HTTP Error Mapper for Firestore
 *
 * Maps HTTP status codes and error responses to Firestore error types.
 * Handles both REST API error responses and gRPC-style error codes.
 */

import {
  FirestoreError,
  InvalidArgumentError,
  UnauthenticatedError,
  PermissionDeniedError,
  NotFoundError,
  AlreadyExistsError,
  AbortedError,
  FailedPreconditionError,
  ResourceExhaustedError,
  CancelledError,
  InternalError,
  UnavailableError,
  DeadlineExceededError,
  GrpcCode,
} from "../error/index.js";

/**
 * Firestore error response structure from REST API.
 */
export interface FirestoreErrorResponse {
  error: {
    code: number;
    message: string;
    status?: string;
    details?: Array<{
      "@type": string;
      [key: string]: unknown;
    }>;
  };
}

/**
 * Parse Firestore error response from JSON body.
 * @param body - Response body as string
 * @returns Parsed error response or null if parsing fails
 */
export function parseFirestoreErrorResponse(
  body: string
): { code: number; message: string; status?: string; details?: unknown[] } | null {
  try {
    const json = JSON.parse(body) as FirestoreErrorResponse;
    if (json.error) {
      return {
        code: json.error.code,
        message: json.error.message,
        status: json.error.status,
        details: json.error.details,
      };
    }
  } catch {
    // Body is not valid JSON, return null
  }
  return null;
}

/**
 * Map HTTP status code to gRPC code.
 * @param status - HTTP status code
 * @returns Corresponding gRPC code
 */
export function httpStatusToGrpcCode(status: number): GrpcCode {
  switch (status) {
    case 400:
      return GrpcCode.INVALID_ARGUMENT;
    case 401:
      return GrpcCode.UNAUTHENTICATED;
    case 403:
      return GrpcCode.PERMISSION_DENIED;
    case 404:
      return GrpcCode.NOT_FOUND;
    case 409:
      return GrpcCode.ABORTED; // Can be ALREADY_EXISTS, check message
    case 412:
      return GrpcCode.FAILED_PRECONDITION;
    case 429:
      return GrpcCode.RESOURCE_EXHAUSTED;
    case 499:
      return GrpcCode.CANCELLED;
    case 500:
      return GrpcCode.INTERNAL;
    case 503:
      return GrpcCode.UNAVAILABLE;
    case 504:
      return GrpcCode.DEADLINE_EXCEEDED;
    default:
      if (status >= 500) {
        return GrpcCode.INTERNAL;
      }
      return GrpcCode.UNKNOWN;
  }
}

/**
 * Map HTTP error to Firestore error.
 * @param status - HTTP status code
 * @param body - Response body
 * @param requestId - Optional request ID for tracking
 * @returns Appropriate Firestore error
 */
export function mapHttpError(
  status: number,
  body: string,
  requestId?: string
): FirestoreError {
  // Try to parse error response
  const errorResponse = parseFirestoreErrorResponse(body);

  // Extract message
  const message = errorResponse?.message ?? `HTTP ${status}`;

  // Extract gRPC code if available, otherwise map from HTTP status
  const grpcCode = errorResponse?.code ?? httpStatusToGrpcCode(status);

  // Extract retry-after header value if present in details
  let retryAfter: number | undefined;
  if (errorResponse?.details) {
    for (const detail of errorResponse.details) {
      if (
        typeof detail === "object" &&
        detail !== null &&
        "@type" in detail &&
        typeof detail["@type"] === "string" &&
        detail["@type"].includes("RetryInfo") &&
        "retryDelay" in detail
      ) {
        const retryDelay = detail.retryDelay as { seconds?: number; nanos?: number };
        if (retryDelay.seconds !== undefined) {
          retryAfter = retryDelay.seconds * 1000;
          if (retryDelay.nanos) {
            retryAfter += Math.floor(retryDelay.nanos / 1_000_000);
          }
        }
      }
    }
  }

  // Map based on HTTP status code
  switch (status) {
    case 400:
      return new InvalidArgumentError(message, { requestId });

    case 401:
      return new UnauthenticatedError(message, { requestId });

    case 403:
      return new PermissionDeniedError(message, { requestId });

    case 404:
      return new NotFoundError(message, { requestId });

    case 409:
      // Check if it's ALREADY_EXISTS or ABORTED
      if (
        message.toLowerCase().includes("already exists") ||
        errorResponse?.status === "ALREADY_EXISTS"
      ) {
        return new AlreadyExistsError(message, { requestId });
      }
      return new AbortedError(message, { requestId });

    case 412:
      return new FailedPreconditionError(message, { requestId });

    case 429:
      return new ResourceExhaustedError(message, { retryAfter, requestId });

    case 499:
      return new CancelledError(message, { requestId });

    case 500:
      return new InternalError(message, { requestId });

    case 503:
      return new UnavailableError(message, { requestId });

    case 504:
      return new DeadlineExceededError(message, { requestId });

    default:
      // For other status codes, create a generic FirestoreError
      return new FirestoreError(
        message,
        errorResponse?.status ?? `HTTP_${status}`,
        grpcCode,
        { requestId }
      );
  }
}

/**
 * Check if error response indicates a retryable error.
 * @param status - HTTP status code
 * @param body - Response body
 * @returns True if the error is retryable
 */
export function isRetryableHttpError(status: number, body?: string): boolean {
  // Server errors (5xx) are generally retryable
  if (status >= 500) {
    return true;
  }

  // Rate limiting (429) is retryable
  if (status === 429) {
    return true;
  }

  // Conflict/Aborted (409) may be retryable for transactions
  if (status === 409) {
    if (body) {
      const errorResponse = parseFirestoreErrorResponse(body);
      // ABORTED is retryable, ALREADY_EXISTS is not
      if (
        errorResponse?.status === "ABORTED" ||
        (errorResponse?.message && errorResponse.message.toLowerCase().includes("aborted"))
      ) {
        return true;
      }
    }
  }

  // Request timeout (408) is retryable
  if (status === 408) {
    return true;
  }

  // Client cancelled (499) is not retryable
  if (status === 499) {
    return false;
  }

  // All other errors are not retryable
  return false;
}

/**
 * Extract retry-after value from error response.
 * @param body - Response body
 * @param headers - Response headers
 * @returns Retry-after delay in milliseconds, or undefined
 */
export function getRetryAfter(
  body?: string,
  headers?: Record<string, string>
): number | undefined {
  // Check Retry-After header first
  if (headers) {
    const retryAfterHeader = headers["retry-after"] ?? headers["Retry-After"];
    if (retryAfterHeader) {
      const seconds = parseInt(retryAfterHeader, 10);
      if (!isNaN(seconds)) {
        return seconds * 1000;
      }
    }
  }

  // Check error details
  if (body) {
    const errorResponse = parseFirestoreErrorResponse(body);
    if (errorResponse?.details) {
      for (const detail of errorResponse.details) {
        if (
          typeof detail === "object" &&
          detail !== null &&
          "@type" in detail &&
          typeof detail["@type"] === "string" &&
          detail["@type"].includes("RetryInfo") &&
          "retryDelay" in detail
        ) {
          const retryDelay = detail.retryDelay as { seconds?: number; nanos?: number };
          if (retryDelay.seconds !== undefined) {
            let ms = retryDelay.seconds * 1000;
            if (retryDelay.nanos) {
              ms += Math.floor(retryDelay.nanos / 1_000_000);
            }
            return ms;
          }
        }
      }
    }
  }

  return undefined;
}

/**
 * Check if the error indicates an index is required.
 * @param status - HTTP status code
 * @param body - Response body
 * @returns True if an index is required
 */
export function isIndexRequiredError(status: number, body: string): boolean {
  if (status !== 412) {
    return false;
  }

  const errorResponse = parseFirestoreErrorResponse(body);
  if (!errorResponse) {
    return false;
  }

  const message = errorResponse.message.toLowerCase();
  return message.includes("index") || message.includes("composite");
}

/**
 * Extract index creation URL from error response.
 * @param body - Response body
 * @returns Index creation URL if present
 */
export function getIndexCreationUrl(body: string): string | undefined {
  const errorResponse = parseFirestoreErrorResponse(body);
  if (!errorResponse?.details) {
    return undefined;
  }

  for (const detail of errorResponse.details) {
    if (
      typeof detail === "object" &&
      detail !== null &&
      "@type" in detail &&
      typeof detail["@type"] === "string"
    ) {
      if (detail["@type"].includes("QuotaFailure") && "links" in detail) {
        const links = detail.links as Array<{ url?: string; description?: string }>;
        for (const link of links) {
          if (link.url && link.description?.toLowerCase().includes("index")) {
            return link.url;
          }
        }
      }

      // Also check for Help or ErrorInfo types
      if (detail["@type"].includes("Help") && "links" in detail) {
        const links = detail.links as Array<{ url?: string }>;
        if (links[0]?.url) {
          return links[0].url;
        }
      }
    }
  }

  return undefined;
}
