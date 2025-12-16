/**
 * Log context interface for Datadog APM
 * Following the SPARC specification
 */

/**
 * Log context for trace correlation
 */
export interface LogContext {
  dd: {
    trace_id: string;
    span_id: string;
    service: string;
    env: string;
    version: string;
  };
}

/**
 * Extended log context with additional fields
 */
export interface ExtendedLogContext extends LogContext {
  [key: string]: any;
}

/**
 * Create a log context from trace information
 * @param traceId - Trace ID
 * @param spanId - Span ID
 * @param service - Service name
 * @param env - Environment
 * @param version - Version
 * @returns Log context
 */
export function createLogContext(
  traceId: string,
  spanId: string,
  service: string,
  env: string,
  version: string
): LogContext {
  return {
    dd: {
      trace_id: traceId,
      span_id: spanId,
      service,
      env,
      version,
    },
  };
}

/**
 * Merge log context with additional fields
 * @param logContext - Base log context
 * @param additionalFields - Additional fields to merge
 * @returns Extended log context
 */
export function mergeLogContext(
  logContext: LogContext,
  additionalFields: Record<string, any>
): ExtendedLogContext {
  return {
    ...logContext,
    ...additionalFields,
  };
}