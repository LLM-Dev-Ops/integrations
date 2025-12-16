/**
 * Type definitions for Datadog APM integration.
 *
 * Exports all type definitions used throughout the integration.
 */

// Common types
export type { Tags, TagValue, Carrier, LogContext } from './common.js';

// Span types
export { SpanType } from './span.js';
export type { SpanContext, SpanOptions } from './span.js';

// Re-export Span interface from tracing module for convenience
export type { Span } from '../tracing/interface.js';

// Metric types
export { MetricType } from './metric.js';
export type { CapturedMetric } from './metric.js';

// Configuration types
export type { DatadogAPMConfig, RedactionRule, Logger } from './config.js';
