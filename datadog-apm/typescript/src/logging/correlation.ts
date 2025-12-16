/**
 * Log-trace correlation functions for Datadog APM
 */

import type { Span, SpanContext } from '../types/index.js';
import type { LogContext } from './context.js';
import { createLogContext } from './context.js';

/**
 * Get log context from a span
 * @param span - Span to extract context from
 * @param service - Service name
 * @param env - Environment
 * @param version - Version
 * @returns Log context or null if span is invalid
 */
export function getLogContextFromSpan(
  span: Span | null,
  service: string,
  env: string,
  version: string
): LogContext | null {
  if (!span) {
    return null;
  }

  return createLogContext(span.traceId, span.spanId, service, env, version);
}

/**
 * Get log context from span context
 * @param context - Span context
 * @param service - Service name
 * @param env - Environment
 * @param version - Version
 * @returns Log context or null if context is invalid
 */
export function getLogContextFromSpanContext(
  context: SpanContext | null,
  service: string,
  env: string,
  version: string
): LogContext | null {
  if (!context) {
    return null;
  }

  return createLogContext(context.traceId, context.spanId, service, env, version);
}

/**
 * Inject trace context into log record
 * @param logRecord - Log record to enrich
 * @param logContext - Log context to inject
 * @returns Enriched log record
 */
export function injectTraceContext<T extends Record<string, any>>(
  logRecord: T,
  logContext: LogContext | null
): T {
  if (!logContext) {
    return logRecord;
  }

  return {
    ...logRecord,
    ...logContext,
  };
}

/**
 * Extract correlation IDs from log context
 * @param logContext - Log context
 * @returns Correlation IDs
 */
export function extractCorrelationIds(logContext: LogContext): {
  traceId: string;
  spanId: string;
} {
  return {
    traceId: logContext.dd.trace_id,
    spanId: logContext.dd.span_id,
  };
}