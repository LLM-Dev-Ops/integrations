import { MilvusError, ErrorCategory } from './base.js';

/**
 * Configuration error - non-retryable.
 */
export class MilvusConfigurationError extends MilvusError {
  readonly type = ErrorCategory.Configuration;
  readonly isRetryable = false;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { status: 400, details });
  }
}

/**
 * Authentication error - non-retryable.
 */
export class MilvusAuthenticationError extends MilvusError {
  readonly type = ErrorCategory.Authentication;
  readonly isRetryable = false;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { status: 401, details });
  }
}

/**
 * Authorization error - non-retryable.
 */
export class MilvusAuthorizationError extends MilvusError {
  readonly type = ErrorCategory.Authorization;
  readonly isRetryable = false;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { status: 403, details });
  }
}

/**
 * Validation error - non-retryable.
 */
export class MilvusValidationError extends MilvusError {
  readonly type = ErrorCategory.Validation;
  readonly isRetryable = false;
  readonly field?: string;

  constructor(
    message: string,
    options?: { field?: string; details?: Record<string, unknown> }
  ) {
    super(message, { status: 400, details: options?.details });
    this.field = options?.field;
  }
}

/**
 * Connection error - retryable.
 */
export class MilvusConnectionError extends MilvusError {
  readonly type = ErrorCategory.Connection;
  readonly isRetryable = true;

  constructor(message: string, cause?: Error) {
    super(message, { status: 503, cause });
  }
}

/**
 * Timeout error - retryable.
 */
export class MilvusTimeoutError extends MilvusError {
  readonly type = ErrorCategory.Timeout;
  readonly isRetryable = true;
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message, {
      status: 504,
      details: { timeoutMs },
    });
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Rate limit error - retryable with backoff.
 */
export class MilvusRateLimitError extends MilvusError {
  readonly type = ErrorCategory.RateLimit;
  readonly isRetryable = true;

  constructor(message: string, retryAfterMs?: number) {
    super(message, {
      status: 429,
      retryAfterMs,
      details: { retryAfterMs },
    });
  }
}

/**
 * Not found error - non-retryable.
 */
export class MilvusNotFoundError extends MilvusError {
  readonly type = ErrorCategory.NotFound;
  readonly isRetryable = false;
  readonly resourceType: string;
  readonly resourceName: string;

  constructor(resourceType: string, resourceName: string) {
    super(`${resourceType} not found: ${resourceName}`, {
      status: 404,
      details: { resourceType, resourceName },
    });
    this.resourceType = resourceType;
    this.resourceName = resourceName;
  }
}

/**
 * Collection not found error.
 */
export class MilvusCollectionNotFoundError extends MilvusNotFoundError {
  constructor(collectionName: string) {
    super('Collection', collectionName);
  }
}

/**
 * Partition not found error.
 */
export class MilvusPartitionNotFoundError extends MilvusNotFoundError {
  readonly collectionName: string;

  constructor(collectionName: string, partitionName: string) {
    super('Partition', `${collectionName}/${partitionName}`);
    this.collectionName = collectionName;
  }
}

/**
 * Collection not loaded error - potentially retryable with auto-load.
 */
export class MilvusCollectionNotLoadedError extends MilvusError {
  readonly type = 'CollectionNotLoaded';
  readonly isRetryable = true;
  readonly collectionName: string;

  constructor(collectionName: string) {
    super(`Collection not loaded: ${collectionName}`, {
      status: 400,
      details: { collectionName },
    });
    this.collectionName = collectionName;
  }
}

/**
 * Load failed error - non-retryable.
 */
export class MilvusLoadFailedError extends MilvusError {
  readonly type = 'LoadFailed';
  readonly isRetryable = false;
  readonly collectionName: string;

  constructor(collectionName: string) {
    super(`Failed to load collection: ${collectionName}`, {
      status: 500,
      details: { collectionName },
    });
    this.collectionName = collectionName;
  }
}

/**
 * Load timeout error - retryable.
 */
export class MilvusLoadTimeoutError extends MilvusError {
  readonly type = 'LoadTimeout';
  readonly isRetryable = true;
  readonly collectionName: string;

  constructor(collectionName: string, timeoutMs: number) {
    super(`Load timeout for collection: ${collectionName}`, {
      status: 504,
      details: { collectionName, timeoutMs },
    });
    this.collectionName = collectionName;
  }
}

/**
 * Server error - retryable.
 */
export class MilvusServerError extends MilvusError {
  readonly type = ErrorCategory.Server;
  readonly isRetryable = true;
  readonly errorCode: number;

  constructor(message: string, errorCode: number, cause?: Error) {
    super(message, {
      status: 500,
      details: { errorCode },
      cause,
    });
    this.errorCode = errorCode;
  }
}

/**
 * Pool error - potentially retryable.
 */
export class MilvusPoolError extends MilvusError {
  readonly type = ErrorCategory.Pool;
  readonly isRetryable: boolean;

  constructor(message: string, retryable: boolean = false) {
    super(message, { status: 503 });
    this.isRetryable = retryable;
  }
}

/**
 * Simulation error - non-retryable.
 */
export class MilvusSimulationError extends MilvusError {
  readonly type = ErrorCategory.Simulation;
  readonly isRetryable = false;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, { status: 500, details });
  }
}
