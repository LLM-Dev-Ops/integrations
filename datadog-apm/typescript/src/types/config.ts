/**
 * Configuration types for Datadog APM integration.
 *
 * Defines configuration structure, redaction rules, and logger interface.
 */

import type { Tags } from './common';

/**
 * Logger interface for integration logging
 */
export interface Logger {
  /** Log debug message */
  debug(message: string, context?: Record<string, unknown>): void;
  /** Log info message */
  info(message: string, context?: Record<string, unknown>): void;
  /** Log warning message */
  warn(message: string, context?: Record<string, unknown>): void;
  /** Log error message */
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Redaction rule for removing sensitive data from traces
 */
export interface RedactionRule {
  /** Pattern to match (string or regex) */
  pattern: string | RegExp;
  /** Replacement text (defaults to '[REDACTED]') */
  replacement?: string;
  /** Whether to apply to span names */
  applyToSpanNames?: boolean;
  /** Whether to apply to resource names */
  applyToResources?: boolean;
  /** Whether to apply to tag keys */
  applyToTagKeys?: boolean;
  /** Whether to apply to tag values */
  applyToTagValues?: boolean;
}

/**
 * Configuration for Datadog APM integration
 */
export interface DatadogAPMConfig {
  // Required fields
  /** Service name for the application */
  service: string;
  /** Environment (e.g., 'production', 'staging', 'development') */
  env: string;
  /** Application version */
  version: string;

  // Agent connection settings
  /** Datadog agent host (defaults to 'localhost') */
  agentHost?: string;
  /** Datadog agent port (defaults to 8126 for traces) */
  agentPort?: number;
  /** StatsD host for metrics (defaults to 'localhost') */
  statsdHost?: string;
  /** StatsD port for metrics (defaults to 8125) */
  statsdPort?: number;

  // Sampling configuration
  /** Sample rate for traces (0.0 to 1.0, defaults to 1.0) */
  sampleRate?: number;
  /** Enable priority sampling (defaults to true) */
  prioritySampling?: boolean;

  // Metrics configuration
  /** Prefix for all metrics (defaults to 'datadog.apm') */
  metricsPrefix?: string;
  /** Buffer size for metrics before flushing (defaults to 1000) */
  metricsBufferSize?: number;
  /** Interval in ms to flush metrics (defaults to 10000) */
  metricsFlushInterval?: number;

  // Tracing configuration
  /** Buffer size for traces before flushing (defaults to 1000) */
  traceBufferSize?: number;
  /** Timeout in ms for flushing traces (defaults to 2000) */
  flushTimeout?: number;

  // Authentication
  /** API key for Datadog (required for direct API submission) */
  apiKey?: string;

  // Security and privacy
  /** Redaction rules for sensitive data */
  redactionRules?: RedactionRule[];

  // Tagging
  /** Global tags to apply to all spans and metrics */
  globalTags?: Tags;

  // Logging
  /** Logger instance for integration logging */
  logger?: Logger;
}
