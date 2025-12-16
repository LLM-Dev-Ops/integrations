/**
 * Firestore Error Types
 *
 * Comprehensive error hierarchy following the SPARC specification.
 * Aligned with gRPC status codes for Firestore operations.
 */

import type { FirestoreConfig } from "../config/index.js";

/**
 * gRPC status codes for Firestore errors.
 */
export enum GrpcCode {
  OK = 0,
  CANCELLED = 1,
  UNKNOWN = 2,
  INVALID_ARGUMENT = 3,
  DEADLINE_EXCEEDED = 4,
  NOT_FOUND = 5,
  ALREADY_EXISTS = 6,
  PERMISSION_DENIED = 7,
  RESOURCE_EXHAUSTED = 8,
  FAILED_PRECONDITION = 9,
  ABORTED = 10,
  OUT_OF_RANGE = 11,
  UNIMPLEMENTED = 12,
  INTERNAL = 13,
  UNAVAILABLE = 14,
  DATA_LOSS = 15,
  UNAUTHENTICATED = 16,
}

/**
 * Base Firestore error class.
 */
export class FirestoreError extends Error {
  public readonly code: string;
  public readonly grpcCode: GrpcCode;
  public readonly retryable: boolean;
  public readonly requestId?: string;

  constructor(
    message: string,
    code: string,
    grpcCode: GrpcCode,
    options?: { retryable?: boolean; requestId?: string }
  ) {
    super(message);
    this.name = "FirestoreError";
    this.code = code;
    this.grpcCode = grpcCode;
    this.retryable = options?.retryable ?? false;
    this.requestId = options?.requestId;
    Object.setPrototypeOf(this, FirestoreError.prototype);
  }
}

/**
 * Configuration error.
 */
export class ConfigurationError extends FirestoreError {
  constructor(message: string) {
    super(message, "CONFIGURATION_ERROR", GrpcCode.INVALID_ARGUMENT, {
      retryable: false,
    });
    this.name = "ConfigurationError";
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * Document not found error (NOT_FOUND).
 * Not retryable as the document does not exist.
 */
export class NotFoundError extends FirestoreError {
  public readonly path?: string;

  constructor(message: string, options?: { path?: string; requestId?: string }) {
    super(message, "NOT_FOUND", GrpcCode.NOT_FOUND, {
      retryable: false,
      requestId: options?.requestId,
    });
    this.name = "NotFoundError";
    this.path = options?.path;
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Document already exists error (ALREADY_EXISTS).
 * Not retryable as the document already exists.
 */
export class AlreadyExistsError extends FirestoreError {
  public readonly path?: string;

  constructor(message: string, options?: { path?: string; requestId?: string }) {
    super(message, "ALREADY_EXISTS", GrpcCode.ALREADY_EXISTS, {
      retryable: false,
      requestId: options?.requestId,
    });
    this.name = "AlreadyExistsError";
    this.path = options?.path;
    Object.setPrototypeOf(this, AlreadyExistsError.prototype);
  }
}

/**
 * Permission denied error (PERMISSION_DENIED).
 * Not retryable as permissions need to be fixed.
 */
export class PermissionDeniedError extends FirestoreError {
  constructor(message: string, options?: { requestId?: string }) {
    super(message, "PERMISSION_DENIED", GrpcCode.PERMISSION_DENIED, {
      retryable: false,
      requestId: options?.requestId,
    });
    this.name = "PermissionDeniedError";
    Object.setPrototypeOf(this, PermissionDeniedError.prototype);
  }
}

/**
 * Invalid argument error (INVALID_ARGUMENT).
 * Not retryable as the request is malformed.
 */
export class InvalidArgumentError extends FirestoreError {
  public readonly argumentName?: string;

  constructor(message: string, options?: { argumentName?: string; requestId?: string }) {
    super(message, "INVALID_ARGUMENT", GrpcCode.INVALID_ARGUMENT, {
      retryable: false,
      requestId: options?.requestId,
    });
    this.name = "InvalidArgumentError";
    this.argumentName = options?.argumentName;
    Object.setPrototypeOf(this, InvalidArgumentError.prototype);
  }
}

/**
 * Failed precondition error (FAILED_PRECONDITION).
 * Not retryable as the system is not in a state required for the operation.
 */
export class FailedPreconditionError extends FirestoreError {
  constructor(message: string, options?: { requestId?: string }) {
    super(message, "FAILED_PRECONDITION", GrpcCode.FAILED_PRECONDITION, {
      retryable: false,
      requestId: options?.requestId,
    });
    this.name = "FailedPreconditionError";
    Object.setPrototypeOf(this, FailedPreconditionError.prototype);
  }
}

/**
 * Aborted error (ABORTED).
 * Retryable as it indicates transaction contention.
 */
export class AbortedError extends FirestoreError {
  constructor(message: string, options?: { requestId?: string }) {
    super(message, "ABORTED", GrpcCode.ABORTED, {
      retryable: true,
      requestId: options?.requestId,
    });
    this.name = "AbortedError";
    Object.setPrototypeOf(this, AbortedError.prototype);
  }
}

/**
 * Resource exhausted error (RESOURCE_EXHAUSTED).
 * Retryable with backoff as the system is under load.
 */
export class ResourceExhaustedError extends FirestoreError {
  public readonly retryAfter?: number;

  constructor(message: string, options?: { retryAfter?: number; requestId?: string }) {
    super(message, "RESOURCE_EXHAUSTED", GrpcCode.RESOURCE_EXHAUSTED, {
      retryable: true,
      requestId: options?.requestId,
    });
    this.name = "ResourceExhaustedError";
    this.retryAfter = options?.retryAfter;
    Object.setPrototypeOf(this, ResourceExhaustedError.prototype);
  }
}

/**
 * Unavailable error (UNAVAILABLE).
 * Retryable as the service is temporarily unavailable.
 */
export class UnavailableError extends FirestoreError {
  constructor(message: string, options?: { requestId?: string }) {
    super(message, "UNAVAILABLE", GrpcCode.UNAVAILABLE, {
      retryable: true,
      requestId: options?.requestId,
    });
    this.name = "UnavailableError";
    Object.setPrototypeOf(this, UnavailableError.prototype);
  }
}

/**
 * Deadline exceeded error (DEADLINE_EXCEEDED).
 * Retryable as the operation may succeed if retried.
 */
export class DeadlineExceededError extends FirestoreError {
  constructor(message: string, options?: { requestId?: string }) {
    super(message, "DEADLINE_EXCEEDED", GrpcCode.DEADLINE_EXCEEDED, {
      retryable: true,
      requestId: options?.requestId,
    });
    this.name = "DeadlineExceededError";
    Object.setPrototypeOf(this, DeadlineExceededError.prototype);
  }
}

/**
 * Internal error (INTERNAL).
 * Retryable as it indicates a transient server error.
 */
export class InternalError extends FirestoreError {
  constructor(message: string, options?: { requestId?: string }) {
    super(message, "INTERNAL", GrpcCode.INTERNAL, {
      retryable: true,
      requestId: options?.requestId,
    });
    this.name = "InternalError";
    Object.setPrototypeOf(this, InternalError.prototype);
  }
}

/**
 * Cancelled error (CANCELLED).
 * Not retryable as the operation was cancelled by the caller.
 */
export class CancelledError extends FirestoreError {
  constructor(message: string, options?: { requestId?: string }) {
    super(message, "CANCELLED", GrpcCode.CANCELLED, {
      retryable: false,
      requestId: options?.requestId,
    });
    this.name = "CancelledError";
    Object.setPrototypeOf(this, CancelledError.prototype);
  }
}

/**
 * Unauthenticated error (UNAUTHENTICATED).
 * Not retryable as authentication credentials are invalid or missing.
 */
export class UnauthenticatedError extends FirestoreError {
  constructor(message: string, options?: { requestId?: string }) {
    super(message, "UNAUTHENTICATED", GrpcCode.UNAUTHENTICATED, {
      retryable: false,
      requestId: options?.requestId,
    });
    this.name = "UnauthenticatedError";
    Object.setPrototypeOf(this, UnauthenticatedError.prototype);
  }
}

/**
 * Document too large error.
 * Firestore documents have a 1 MiB size limit.
 */
export class DocumentTooLargeError extends FirestoreError {
  public readonly sizeBytes: number;
  public readonly maxSizeBytes: number = 1048576; // 1 MiB

  constructor(message: string, sizeBytes: number, options?: { requestId?: string }) {
    super(message, "DOCUMENT_TOO_LARGE", GrpcCode.INVALID_ARGUMENT, {
      retryable: false,
      requestId: options?.requestId,
    });
    this.name = "DocumentTooLargeError";
    this.sizeBytes = sizeBytes;
    Object.setPrototypeOf(this, DocumentTooLargeError.prototype);
  }
}

/**
 * Batch size limit exceeded error.
 * Firestore batches have a 500 operation limit.
 */
export class BatchSizeLimitError extends FirestoreError {
  public readonly batchSize: number;
  public readonly maxBatchSize: number = 500;

  constructor(message: string, batchSize: number, options?: { requestId?: string }) {
    super(message, "BATCH_SIZE_LIMIT", GrpcCode.INVALID_ARGUMENT, {
      retryable: false,
      requestId: options?.requestId,
    });
    this.name = "BatchSizeLimitError";
    this.batchSize = batchSize;
    Object.setPrototypeOf(this, BatchSizeLimitError.prototype);
  }
}

/**
 * Transaction contention error.
 * Retryable as it indicates concurrent transaction conflicts.
 */
export class TransactionContentionError extends FirestoreError {
  public readonly attemptNumber: number;

  constructor(message: string, attemptNumber: number, options?: { requestId?: string }) {
    super(message, "TRANSACTION_CONTENTION", GrpcCode.ABORTED, {
      retryable: true,
      requestId: options?.requestId,
    });
    this.name = "TransactionContentionError";
    this.attemptNumber = attemptNumber;
    Object.setPrototypeOf(this, TransactionContentionError.prototype);
  }
}

/**
 * Field path too deep error.
 * Firestore has practical limits on nested field depth.
 */
export class FieldPathTooDeepError extends FirestoreError {
  public readonly depth: number;
  public readonly maxDepth: number = 20;

  constructor(message: string, depth: number, options?: { requestId?: string }) {
    super(message, "FIELD_PATH_TOO_DEEP", GrpcCode.INVALID_ARGUMENT, {
      retryable: false,
      requestId: options?.requestId,
    });
    this.name = "FieldPathTooDeepError";
    this.depth = depth;
    Object.setPrototypeOf(this, FieldPathTooDeepError.prototype);
  }
}

/**
 * Index required error.
 * Not retryable as a composite index needs to be created.
 */
export class IndexRequiredError extends FirestoreError {
  public readonly indexUrl?: string;

  constructor(message: string, options?: { indexUrl?: string; requestId?: string }) {
    super(message, "INDEX_REQUIRED", GrpcCode.FAILED_PRECONDITION, {
      retryable: false,
      requestId: options?.requestId,
    });
    this.name = "IndexRequiredError";
    this.indexUrl = options?.indexUrl;
    Object.setPrototypeOf(this, IndexRequiredError.prototype);
  }
}

/**
 * gRPC error response structure.
 */
export interface GrpcErrorResponse {
  code: number;
  message: string;
  status?: string;
  details?: Array<{
    "@type": string;
    [key: string]: unknown;
  }>;
}

/**
 * Map gRPC error to Firestore error type.
 * @param grpcError - gRPC error object or response
 * @param requestId - Optional request ID for tracking
 * @returns Appropriate FirestoreError subclass
 */
export function mapFirestoreError(
  grpcError: GrpcErrorResponse | Error | unknown,
  requestId?: string
): FirestoreError {
  // Handle gRPC error response
  if (typeof grpcError === "object" && grpcError !== null && "code" in grpcError) {
    const error = grpcError as GrpcErrorResponse;
    const message = error.message || "Unknown Firestore error";
    const code = error.code;

    // Extract index URL from error details if present
    let indexUrl: string | undefined;
    if (error.details) {
      for (const detail of error.details) {
        if (detail["@type"]?.includes("QuotaFailure") && "links" in detail) {
          const links = detail.links as Array<{ url?: string }>;
          indexUrl = links[0]?.url;
          break;
        }
      }
    }

    switch (code) {
      case GrpcCode.NOT_FOUND:
        return new NotFoundError(message, { requestId });

      case GrpcCode.ALREADY_EXISTS:
        return new AlreadyExistsError(message, { requestId });

      case GrpcCode.PERMISSION_DENIED:
        return new PermissionDeniedError(message, { requestId });

      case GrpcCode.INVALID_ARGUMENT:
        // Check for specific error types
        if (message.toLowerCase().includes("document too large")) {
          return new DocumentTooLargeError(message, 0, { requestId });
        }
        if (message.toLowerCase().includes("batch") && message.toLowerCase().includes("limit")) {
          return new BatchSizeLimitError(message, 0, { requestId });
        }
        if (message.toLowerCase().includes("field path") && message.toLowerCase().includes("deep")) {
          return new FieldPathTooDeepError(message, 0, { requestId });
        }
        return new InvalidArgumentError(message, { requestId });

      case GrpcCode.FAILED_PRECONDITION:
        // Check for index required error
        if (message.toLowerCase().includes("index") || indexUrl) {
          return new IndexRequiredError(message, { indexUrl, requestId });
        }
        return new FailedPreconditionError(message, { requestId });

      case GrpcCode.ABORTED:
        // Check for transaction contention
        if (message.toLowerCase().includes("transaction") || message.toLowerCase().includes("contention")) {
          return new TransactionContentionError(message, 0, { requestId });
        }
        return new AbortedError(message, { requestId });

      case GrpcCode.RESOURCE_EXHAUSTED:
        return new ResourceExhaustedError(message, { requestId });

      case GrpcCode.UNAVAILABLE:
        return new UnavailableError(message, { requestId });

      case GrpcCode.DEADLINE_EXCEEDED:
        return new DeadlineExceededError(message, { requestId });

      case GrpcCode.INTERNAL:
        return new InternalError(message, { requestId });

      case GrpcCode.CANCELLED:
        return new CancelledError(message, { requestId });

      case GrpcCode.UNAUTHENTICATED:
        return new UnauthenticatedError(message, { requestId });

      default:
        return new FirestoreError(message, `GRPC_${code}`, code as GrpcCode, { requestId });
    }
  }

  // Handle Error objects
  if (grpcError instanceof Error) {
    return new FirestoreError(
      grpcError.message,
      "UNKNOWN_ERROR",
      GrpcCode.UNKNOWN,
      { requestId }
    );
  }

  // Handle unknown error types
  return new FirestoreError(
    String(grpcError),
    "UNKNOWN_ERROR",
    GrpcCode.UNKNOWN,
    { requestId }
  );
}

/**
 * Check if an error is retryable.
 * @param error - Error to check
 * @returns True if the error is retryable
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof FirestoreError) {
    return error.retryable;
  }
  return false;
}

/**
 * Retry policy configuration.
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial backoff delay in milliseconds */
  initialBackoffMs: number;
  /** Maximum backoff delay in milliseconds */
  maxBackoffMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Jitter factor (0-1) to add randomness to backoff */
  jitterFactor: number;
}

/**
 * Get retry policy from configuration.
 * @param config - Firestore configuration
 * @returns Retry policy
 */
export function getRetryPolicy(config: FirestoreConfig): RetryPolicy {
  return {
    maxRetries: config.max_retries,
    initialBackoffMs: config.retry_backoff_ms,
    maxBackoffMs: config.retry_backoff_ms * 32, // Exponential backoff up to 32x
    backoffMultiplier: 2,
    jitterFactor: 0.1,
  };
}

/**
 * Calculate backoff delay for retry attempt.
 * @param attempt - Retry attempt number (0-based)
 * @param policy - Retry policy
 * @returns Delay in milliseconds
 */
export function calculateBackoff(attempt: number, policy: RetryPolicy): number {
  const exponentialBackoff = Math.min(
    policy.initialBackoffMs * Math.pow(policy.backoffMultiplier, attempt),
    policy.maxBackoffMs
  );

  // Add jitter to prevent thundering herd
  const jitter = exponentialBackoff * policy.jitterFactor * (Math.random() * 2 - 1);
  return Math.max(0, exponentialBackoff + jitter);
}

/**
 * Check if an error should be retried based on retry policy.
 * @param error - Error to check
 * @param attemptNumber - Current attempt number (0-based)
 * @param policy - Retry policy
 * @returns True if the error should be retried
 */
export function shouldRetry(error: Error, attemptNumber: number, policy: RetryPolicy): boolean {
  if (attemptNumber >= policy.maxRetries) {
    return false;
  }
  return isRetryableError(error);
}

/**
 * Network error (for transport layer).
 * Represents network-level failures like connection errors, timeouts, DNS failures.
 */
export class NetworkError extends FirestoreError {
  constructor(
    message: string,
    code: "ConnectionFailed" | "Timeout" | "DnsResolutionFailed" | "TlsError",
    options?: { retryable?: boolean }
  ) {
    super(
      message,
      `NETWORK_${code.toUpperCase()}`,
      GrpcCode.UNAVAILABLE,
      {
        retryable: options?.retryable ?? (code !== "TlsError"),
      }
    );
    this.name = "NetworkError";
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}
