/**
 * Error types for the Prometheus metrics integration.
 *
 * Provides a comprehensive error hierarchy for handling metrics-related
 * failures including configuration, validation, collection, and serialization errors.
 */

/**
 * Error category for classification
 */
export type ErrorCategory =
  | 'configuration'
  | 'validation'
  | 'registration'
  | 'collection'
  | 'serialization'
  | 'cardinality'
  | 'endpoint'
  | 'timeout';

/**
 * Base error class for all metrics errors
 */
export abstract class MetricsError extends Error {
  abstract readonly category: ErrorCategory;
  abstract readonly isRetryable: boolean;
  readonly statusCode?: number;

  constructor(
    message: string,
    options?: { statusCode?: number | undefined; cause?: Error | undefined }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = this.constructor.name;
    if (options?.statusCode !== undefined) {
      this.statusCode = options.statusCode;
    }
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Configuration error - invalid or missing configuration
 */
export class ConfigurationError extends MetricsError {
  readonly category = 'configuration' as const;
  readonly isRetryable = false;

  constructor(message: string, options?: { cause?: Error | undefined }) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
  }
}

/**
 * Validation error - invalid metric names, labels, or values
 */
export class ValidationError extends MetricsError {
  readonly category = 'validation' as const;
  readonly isRetryable = false;
  readonly field?: string;

  constructor(
    message: string,
    options?: { field?: string | undefined; statusCode?: number | undefined; cause?: Error | undefined }
  ) {
    const statusCode = options?.statusCode ?? 400;
    super(message, { statusCode, ...(options?.cause ? { cause: options.cause } : {}) });
    if (options?.field !== undefined) {
      this.field = options.field;
    }
  }
}

/**
 * Registration error - metric already registered or registration failed
 */
export class RegistrationError extends MetricsError {
  readonly category = 'registration' as const;
  readonly isRetryable = false;
  readonly metricName?: string;

  constructor(
    message: string,
    options?: { metricName?: string | undefined; cause?: Error | undefined }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    if (options?.metricName !== undefined) {
      this.metricName = options.metricName;
    }
  }
}

/**
 * Cardinality error - too many unique label combinations
 */
export class CardinalityError extends MetricsError {
  readonly category = 'cardinality' as const;
  readonly isRetryable = false;
  readonly metricName?: string;
  readonly currentCardinality?: number;
  readonly limit?: number;

  constructor(
    message: string,
    options?: {
      metricName?: string | undefined;
      currentCardinality?: number | undefined;
      limit?: number | undefined;
      cause?: Error | undefined;
    }
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    if (options?.metricName !== undefined) {
      this.metricName = options.metricName;
    }
    if (options?.currentCardinality !== undefined) {
      this.currentCardinality = options.currentCardinality;
    }
    if (options?.limit !== undefined) {
      this.limit = options.limit;
    }
  }
}

/**
 * Collection error - failed to collect metric values
 */
export class CollectionError extends MetricsError {
  readonly category = 'collection' as const;
  readonly isRetryable = true;
  readonly metricName?: string;

  constructor(
    message: string,
    options?: { metricName?: string | undefined; statusCode?: number | undefined; cause?: Error | undefined }
  ) {
    const statusCode = options?.statusCode ?? 500;
    super(message, { statusCode, ...(options?.cause ? { cause: options.cause } : {}) });
    if (options?.metricName !== undefined) {
      this.metricName = options.metricName;
    }
  }
}

/**
 * Serialization error - failed to serialize metrics to text format
 */
export class SerializationError extends MetricsError {
  readonly category = 'serialization' as const;
  readonly isRetryable = true;
  readonly metricName?: string;

  constructor(
    message: string,
    options?: { metricName?: string | undefined; statusCode?: number | undefined; cause?: Error | undefined }
  ) {
    const statusCode = options?.statusCode ?? 500;
    super(message, { statusCode, ...(options?.cause ? { cause: options.cause } : {}) });
    if (options?.metricName !== undefined) {
      this.metricName = options.metricName;
    }
  }
}

/**
 * Timeout error - operation exceeded timeout
 */
export class TimeoutError extends MetricsError {
  readonly category = 'timeout' as const;
  readonly isRetryable = true;
  readonly timeoutMs?: number;

  constructor(
    message: string,
    options?: { timeoutMs?: number | undefined; statusCode?: number | undefined; cause?: Error | undefined }
  ) {
    const statusCode = options?.statusCode ?? 504;
    super(message, { statusCode, ...(options?.cause ? { cause: options.cause } : {}) });
    if (options?.timeoutMs !== undefined) {
      this.timeoutMs = options.timeoutMs;
    }
  }
}

/**
 * Endpoint error - HTTP endpoint failure
 */
export class EndpointError extends MetricsError {
  readonly category = 'endpoint' as const;
  readonly isRetryable = false;

  constructor(
    message: string,
    options?: { statusCode?: number | undefined; cause?: Error | undefined }
  ) {
    const statusCode = options?.statusCode ?? 500;
    super(message, { statusCode, ...(options?.cause ? { cause: options.cause } : {}) });
  }
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof MetricsError) {
    return error.isRetryable;
  }
  return false;
}

/**
 * Check if an error is a metrics error
 */
export function isMetricsError(error: unknown): error is MetricsError {
  return error instanceof MetricsError;
}

/**
 * Get the error category from an error
 */
export function getErrorCategory(error: unknown): ErrorCategory | undefined {
  if (error instanceof MetricsError) {
    return error.category;
  }
  return undefined;
}

/**
 * Format error for logging
 */
export function formatError(error: unknown): string {
  if (error instanceof MetricsError) {
    const parts = [
      `[${error.category.toUpperCase()}]`,
      error.name,
      ':',
      error.message,
    ];

    if (error.statusCode) {
      parts.push(`(HTTP ${error.statusCode})`);
    }

    return parts.join(' ');
  }

  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}
