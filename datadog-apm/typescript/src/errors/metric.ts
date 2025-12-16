/**
 * Metric-related errors for Datadog APM.
 *
 * Errors related to metric validation, collection, and submission.
 */

import { DatadogAPMError } from './base';

/**
 * Base error for metric-related issues
 */
export class MetricError extends DatadogAPMError {
  constructor(
    message: string,
    options?: {
      isRetryable?: boolean;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super({
      category: 'metric',
      message,
      isRetryable: options?.isRetryable ?? false,
      details: options?.details,
      cause: options?.cause,
    });
    this.name = 'MetricError';
  }
}

/**
 * Error thrown when a metric name is invalid
 */
export class InvalidMetricNameError extends MetricError {
  constructor(
    name: string,
    reason: string,
    options?: { details?: Record<string, unknown>; cause?: Error }
  ) {
    super(`Invalid metric name '${name}': ${reason}`, {
      isRetryable: false,
      details: { name, reason, ...options?.details },
      cause: options?.cause,
    });
    this.name = 'InvalidMetricNameError';
  }

  /**
   * Create an InvalidMetricNameError for empty metric name
   */
  static emptyName(): InvalidMetricNameError {
    return new InvalidMetricNameError('', 'Metric name cannot be empty');
  }

  /**
   * Create an InvalidMetricNameError for invalid characters
   */
  static invalidCharacters(name: string): InvalidMetricNameError {
    return new InvalidMetricNameError(
      name,
      'Metric name contains invalid characters'
    );
  }

  /**
   * Create an InvalidMetricNameError for name too long
   */
  static nameTooLong(name: string, maxLength: number): InvalidMetricNameError {
    return new InvalidMetricNameError(
      name,
      `Metric name exceeds maximum length of ${maxLength} characters`,
      { maxLength, actualLength: name.length }
    );
  }
}

/**
 * Error thrown when tag limit is exceeded
 */
export class TagLimitExceededError extends MetricError {
  constructor(
    tagCount: number,
    maxTags: number,
    options?: { details?: Record<string, unknown>; cause?: Error }
  ) {
    super(`Tag limit exceeded: ${tagCount} tags (maximum ${maxTags})`, {
      isRetryable: false,
      details: { tagCount, maxTags, ...options?.details },
      cause: options?.cause,
    });
    this.name = 'TagLimitExceededError';
  }
}

/**
 * Error thrown when metric buffer overflows
 */
export class BufferOverflowError extends MetricError {
  constructor(
    bufferSize: number,
    options?: { details?: Record<string, unknown>; cause?: Error }
  ) {
    super(`Metric buffer overflow: buffer size is ${bufferSize}`, {
      isRetryable: true,
      details: { bufferSize, ...options?.details },
      cause: options?.cause,
    });
    this.name = 'BufferOverflowError';
  }

  /**
   * Create a BufferOverflowError for dropped metrics
   */
  static metricsDropped(
    droppedCount: number,
    bufferSize: number
  ): BufferOverflowError {
    return new BufferOverflowError(bufferSize, {
      details: { droppedCount },
    });
  }
}
