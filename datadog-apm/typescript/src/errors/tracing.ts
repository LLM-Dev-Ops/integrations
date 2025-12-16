/**
 * Tracing-related errors for Datadog APM.
 *
 * Errors related to span management, trace context, and propagation.
 */

import { DatadogAPMError } from './base';

/**
 * Base error for tracing-related issues
 */
export class TracingError extends DatadogAPMError {
  constructor(
    message: string,
    options?: {
      isRetryable?: boolean;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super({
      category: 'tracing',
      message,
      isRetryable: options?.isRetryable ?? false,
      details: options?.details,
      cause: options?.cause,
    });
    this.name = 'TracingError';
  }
}

/**
 * Error thrown when a span is not found
 */
export class SpanNotFoundError extends TracingError {
  constructor(
    spanId: string,
    options?: { details?: Record<string, unknown>; cause?: Error }
  ) {
    super(`Span not found: ${spanId}`, {
      isRetryable: false,
      details: { spanId, ...options?.details },
      cause: options?.cause,
    });
    this.name = 'SpanNotFoundError';
  }
}

/**
 * Error thrown when trace context is invalid
 */
export class InvalidTraceContextError extends TracingError {
  constructor(
    reason: string,
    options?: { details?: Record<string, unknown>; cause?: Error }
  ) {
    super(`Invalid trace context: ${reason}`, {
      isRetryable: false,
      details: options?.details,
      cause: options?.cause,
    });
    this.name = 'InvalidTraceContextError';
  }

  /**
   * Create an InvalidTraceContextError for missing trace ID
   */
  static missingTraceId(): InvalidTraceContextError {
    return new InvalidTraceContextError('Missing trace ID');
  }

  /**
   * Create an InvalidTraceContextError for missing span ID
   */
  static missingSpanId(): InvalidTraceContextError {
    return new InvalidTraceContextError('Missing span ID');
  }

  /**
   * Create an InvalidTraceContextError for malformed trace ID
   */
  static malformedTraceId(traceId: string): InvalidTraceContextError {
    return new InvalidTraceContextError('Malformed trace ID', {
      details: { traceId },
    });
  }

  /**
   * Create an InvalidTraceContextError for malformed span ID
   */
  static malformedSpanId(spanId: string): InvalidTraceContextError {
    return new InvalidTraceContextError('Malformed span ID', {
      details: { spanId },
    });
  }
}

/**
 * Error thrown when context propagation fails
 */
export class PropagationFailedError extends TracingError {
  constructor(
    reason: string,
    options?: { details?: Record<string, unknown>; cause?: Error }
  ) {
    super(`Context propagation failed: ${reason}`, {
      isRetryable: false,
      details: options?.details,
      cause: options?.cause,
    });
    this.name = 'PropagationFailedError';
  }

  /**
   * Create a PropagationFailedError for injection failure
   */
  static injectionFailed(format: string, cause?: Error): PropagationFailedError {
    return new PropagationFailedError('Failed to inject context', {
      details: { format },
      cause,
    });
  }

  /**
   * Create a PropagationFailedError for extraction failure
   */
  static extractionFailed(
    format: string,
    cause?: Error
  ): PropagationFailedError {
    return new PropagationFailedError('Failed to extract context', {
      details: { format },
      cause,
    });
  }

  /**
   * Create a PropagationFailedError for unsupported format
   */
  static unsupportedFormat(format: string): PropagationFailedError {
    return new PropagationFailedError('Unsupported propagation format', {
      details: { format },
    });
  }
}
