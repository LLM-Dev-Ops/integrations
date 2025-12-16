/**
 * Span-related types for distributed tracing.
 *
 * Defines span types, options, and context for Datadog APM tracing.
 */

import type { Tags } from './common';

/**
 * Span type enumeration for categorizing different types of operations
 */
export enum SpanType {
  /** Web request/response */
  WEB = 'web',
  /** HTTP client request */
  HTTP = 'http',
  /** Database query (SQL) */
  SQL = 'sql',
  /** Cache operation */
  CACHE = 'cache',
  /** Custom application span */
  CUSTOM = 'custom',
  /** LLM operation */
  LLM = 'llm',
  /** AI agent operation */
  AGENT = 'agent',
}

/**
 * Span context containing trace and span IDs for propagation
 */
export interface SpanContext {
  /** Trace ID (64-bit or 128-bit hex string) */
  traceId: string;
  /** Span ID (64-bit hex string) */
  spanId: string;
  /** Parent span ID (64-bit hex string), if this span has a parent */
  parentId?: string;
  /** Sampling priority (0 = drop, 1 = keep, 2 = user keep) */
  samplingPriority?: number;
  /** Origin of the trace (e.g., 'synthetics', 'rum') */
  origin?: string;
}

/**
 * Options for creating a new span
 */
export interface SpanOptions {
  /** Resource name (e.g., endpoint path, query, function name) */
  resource?: string;
  /** Span type */
  type?: SpanType;
  /** Tags to attach to the span */
  tags?: Tags;
  /** Parent span or span context to link this span to */
  childOf?: SpanContext;
  /** Start time in milliseconds since epoch (defaults to now) */
  startTime?: number;
}
