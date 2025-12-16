/**
 * Core type definitions for Prometheus metrics integration.
 *
 * Defines metric types, value structures, configuration interfaces,
 * and utility types for building and exposing Prometheus-compatible metrics.
 */

/**
 * Label types - key-value pairs for metric dimensions
 */
export type Labels = Record<string, string>;

/**
 * Prometheus metric types
 */
export enum MetricType {
  Counter = 'counter',
  Gauge = 'gauge',
  Histogram = 'histogram',
  Summary = 'summary',
  Untyped = 'untyped',
}

/**
 * Metric value types for internal representation
 */
export interface MetricValue {
  /** Label key-value pairs identifying this metric instance */
  labels: Labels;
  /** Current value of the metric */
  value: number;
  /** Optional timestamp in milliseconds (defaults to current time if not provided) */
  timestamp?: number;
}

/**
 * Histogram-specific value structure with bucket data
 */
export interface HistogramValue extends MetricValue {
  /** Map of upper bound to count of observations */
  buckets: Map<number, number>;
  /** Sum of all observed values */
  sum: number;
  /** Total count of observations */
  count: number;
}

/**
 * Metric family - collection of metrics with the same name
 *
 * A metric family groups all time series that share the same metric name
 * but differ by their label values.
 */
export interface MetricFamily {
  /** Metric name (must match [a-zA-Z_:][a-zA-Z0-9_:]*) */
  name: string;
  /** Human-readable help text describing the metric */
  help: string;
  /** Type of metric in this family */
  type: MetricType;
  /** Array of metric values with different label combinations */
  metrics: MetricValue[];
  /** Optional unit suffix (e.g., 'bytes', 'seconds') */
  unit?: string;
}

/**
 * Configuration for the metrics HTTP endpoint
 */
export interface MetricsEndpointConfig {
  /** HTTP path for metrics endpoint (default: /metrics) */
  path: string;
  /** Port to listen on (default: 9090) */
  port: number;
  /** Enable /health endpoint (default: true) */
  enableHealth: boolean;
  /** Enable gzip compression for responses (default: true) */
  enableCompression: boolean;
  /** Minimum response size in bytes to trigger compression (default: 1024) */
  compressionThreshold: number;
  /** Scrape timeout in milliseconds (default: 10000) */
  scrapeTimeout: number;
  /** Cache TTL in milliseconds for metrics (default: 0, disabled) */
  cacheTtl: number;
  /** Default labels applied to all metrics */
  defaultLabels: Labels;
  /** Cardinality limits per metric name to prevent explosion */
  cardinalityLimits: Record<string, number>;
  /** Enable process metrics (CPU, memory, file descriptors) */
  enableProcessMetrics: boolean;
  /** Enable runtime metrics (event loop lag, GC stats) */
  enableRuntimeMetrics: boolean;
}

/**
 * Options for creating a counter metric
 */
export interface CounterOptions {
  /** Metric name (must match [a-zA-Z_:][a-zA-Z0-9_:]*) */
  name: string;
  /** Help text describing what this counter measures */
  help: string;
  /** Optional array of label names that can be used with this counter */
  labelNames?: string[];
}

/**
 * Options for creating a gauge metric
 */
export interface GaugeOptions {
  /** Metric name (must match [a-zA-Z_:][a-zA-Z0-9_:]*) */
  name: string;
  /** Help text describing what this gauge measures */
  help: string;
  /** Optional array of label names that can be used with this gauge */
  labelNames?: string[];
}

/**
 * Options for creating a histogram metric
 */
export interface HistogramOptions {
  /** Metric name (must match [a-zA-Z_:][a-zA-Z0-9_:]*) */
  name: string;
  /** Help text describing what this histogram measures */
  help: string;
  /** Optional array of label names that can be used with this histogram */
  labelNames?: string[];
  /** Bucket upper bounds (default: DEFAULT_LATENCY_BUCKETS) */
  buckets?: number[];
}

/**
 * LLM request tracking parameters
 */
export interface LlmRequestParams {
  /** Model identifier (e.g., 'gpt-4', 'claude-3') */
  model: string;
  /** Provider name (e.g., 'openai', 'anthropic') */
  provider: string;
  /** Operation type (e.g., 'completion', 'embedding') */
  operation: string;
  /** Request duration in milliseconds */
  durationMs: number;
  /** Number of input tokens consumed */
  inputTokens: number;
  /** Number of output tokens generated */
  outputTokens: number;
  /** Request outcome */
  status: 'success' | 'error';
}

/**
 * Agent execution tracking parameters
 */
export interface AgentExecutionParams {
  /** Type of agent (e.g., 'task', 'reasoning', 'tool') */
  agentType: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Execution outcome */
  status: 'success' | 'failed' | 'timeout' | 'cancelled';
}

/**
 * Default histogram buckets for general latency measurements (in seconds)
 *
 * Covers: 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s
 */
export const DEFAULT_LATENCY_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0,
];

/**
 * Default buckets for LLM request latencies (in seconds)
 *
 * LLM requests typically take longer than standard API calls
 * Covers: 100ms to 2 minutes
 */
export const LLM_LATENCY_BUCKETS = [
  0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0,
];

/**
 * Default buckets for agent execution latencies (in seconds)
 *
 * Agent executions can be long-running
 * Covers: 500ms to 5 minutes
 */
export const AGENT_LATENCY_BUCKETS = [
  0.5, 1.0, 2.5, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0,
];
