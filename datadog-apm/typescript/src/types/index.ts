/**
 * Type definitions for Datadog APM integration.
 *
 * Exports all type definitions used throughout the integration.
 */

// Common types
export type { Tags, TagValue, Carrier, LogContext } from './common';

// Span types
export { SpanType } from './span';
export type { SpanContext, SpanOptions } from './span';

// Metric types
export { MetricType } from './metric';
export type { CapturedMetric } from './metric';

// Configuration types
export type { DatadogAPMConfig, RedactionRule, Logger } from './config';
