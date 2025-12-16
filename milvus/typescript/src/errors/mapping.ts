import { MilvusError } from './base.js';
import {
  MilvusAuthenticationError,
  MilvusAuthorizationError,
  MilvusCollectionNotFoundError,
  MilvusCollectionNotLoadedError,
  MilvusConnectionError,
  MilvusRateLimitError,
  MilvusServerError,
  MilvusTimeoutError,
} from './categories.js';

/**
 * gRPC status codes.
 */
export enum GrpcStatusCode {
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
 * Milvus error codes from the server.
 */
export enum MilvusErrorCode {
  Success = 0,
  UnexpectedError = 1,
  CollectionNotExists = 100,
  CollectionNotLoaded = 101,
  PartitionNotExists = 102,
  IndexNotExists = 103,
  // Add more as needed from Milvus documentation
}

/**
 * Check if a gRPC status code is retryable.
 */
export function isRetryableGrpcCode(code: GrpcStatusCode): boolean {
  return (
    code === GrpcStatusCode.UNAVAILABLE ||
    code === GrpcStatusCode.RESOURCE_EXHAUSTED ||
    code === GrpcStatusCode.INTERNAL ||
    code === GrpcStatusCode.DEADLINE_EXCEEDED ||
    code === GrpcStatusCode.ABORTED
  );
}

/**
 * Create appropriate error from gRPC status.
 */
export function createErrorFromGrpcStatus(
  code: GrpcStatusCode,
  message: string,
  details?: Record<string, unknown>
): MilvusError {
  switch (code) {
    case GrpcStatusCode.UNAUTHENTICATED:
      return new MilvusAuthenticationError(message, details);

    case GrpcStatusCode.PERMISSION_DENIED:
      return new MilvusAuthorizationError(message, details);

    case GrpcStatusCode.NOT_FOUND:
      // Try to extract resource type from message
      if (message.toLowerCase().includes('collection')) {
        const match = message.match(/collection[:\s]+(\w+)/i);
        return new MilvusCollectionNotFoundError(match?.[1] ?? 'unknown');
      }
      return new MilvusServerError(message, code);

    case GrpcStatusCode.RESOURCE_EXHAUSTED:
      return new MilvusRateLimitError(message);

    case GrpcStatusCode.DEADLINE_EXCEEDED:
      return new MilvusTimeoutError(message, 0);

    case GrpcStatusCode.UNAVAILABLE:
      return new MilvusConnectionError(message);

    default:
      return new MilvusServerError(message, code);
  }
}

/**
 * Create appropriate error from Milvus server error code.
 */
export function createErrorFromMilvusCode(
  code: MilvusErrorCode,
  message: string,
  collectionName?: string
): MilvusError {
  switch (code) {
    case MilvusErrorCode.CollectionNotExists:
      return new MilvusCollectionNotFoundError(
        collectionName ?? extractCollectionName(message) ?? 'unknown'
      );

    case MilvusErrorCode.CollectionNotLoaded:
      return new MilvusCollectionNotLoadedError(
        collectionName ?? extractCollectionName(message) ?? 'unknown'
      );

    case MilvusErrorCode.UnexpectedError:
    default:
      return new MilvusServerError(message, code);
  }
}

/**
 * Extract collection name from error message.
 */
function extractCollectionName(message: string): string | undefined {
  const match = message.match(/collection[:\s]+["']?(\w+)["']?/i);
  return match?.[1];
}

/**
 * Check if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof MilvusError) {
    return error.isRetryable;
  }
  return false;
}

/**
 * Check if an error indicates collection needs loading.
 */
export function shouldAutoLoad(error: unknown): boolean {
  return error instanceof MilvusCollectionNotLoadedError;
}

/**
 * Get retry delay from error, if applicable.
 */
export function getRetryDelay(error: unknown): number | undefined {
  if (error instanceof MilvusError && error.retryAfterMs) {
    return error.retryAfterMs;
  }
  return undefined;
}
