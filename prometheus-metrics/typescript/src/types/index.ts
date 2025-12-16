/**
 * Type definitions for Prometheus metrics.
 */

export type Labels = Record<string, string>;

export enum MetricType {
  Counter = 'counter',
  Gauge = 'gauge',
  Histogram = 'histogram',
  Summary = 'summary',
  Untyped = 'untyped',
}

export interface MetricValue {
  labels: Labels;
  value: number;
  timestamp?: number;
}

export interface HistogramValue {
  labels: Labels;
  buckets: Map<number, number>; // le -> count
  sum: number;
  count: number;
  timestamp?: number;
}

export interface MetricFamily {
  name: string;
  help: string;
  type: MetricType;
  metrics: (MetricValue | HistogramValue)[];
  unit?: string;
}

export interface Counter {
  inc(value?: number): void;
  get(): number;
}

export interface CounterVec {
  withLabelValues(...values: string[]): Counter;
  reset(): void;
}

export interface Gauge {
  set(value: number): void;
  inc(value?: number): void;
  dec(value?: number): void;
  add(value: number): void;
  sub(value: number): void;
  get(): number;
  setToCurrentTime(): void;
}

export interface GaugeVec {
  withLabelValues(...values: string[]): Gauge;
  reset(): void;
}

export interface Histogram {
  observe(value: number): void;
  startTimer(): () => void;
}

export interface HistogramVec {
  withLabelValues(...values: string[]): Histogram;
  reset(): void;
}

/**
 * Custom collector interface for gathering metrics.
 */
export interface Collector {
  collect(): MetricFamily[];
  describe(): MetricFamily[];
}

export interface CounterOptions {
  name: string;
  help: string;
  labelNames?: string[];
  subsystem?: string;
}

export interface GaugeOptions {
  name: string;
  help: string;
  labelNames?: string[];
  subsystem?: string;
}

export interface HistogramOptions {
  name: string;
  help: string;
  labelNames?: string[];
  buckets?: number[];
  subsystem?: string;
}

/**
 * LLM request tracking parameters
 */
export interface LlmRequestParams {
  model: string;
  provider: string;
  operation: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  status: 'success' | 'error';
}

/**
 * Agent execution tracking parameters
 */
export interface AgentExecutionParams {
  agentType: string;
  durationMs: number;
  status: 'success' | 'failed' | 'timeout' | 'cancelled';
}

/**
 * Default histogram buckets for latency measurements (in seconds).
 * Covers: 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s
 */
export const DEFAULT_LATENCY_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0,
];

/**
 * Error classes for metric validation.
 */
export class CardinalityExceededError extends Error {
  constructor(
    public readonly metricName: string,
    public readonly limit: number,
    public readonly current: number
  ) {
    super(
      `Cardinality limit exceeded for metric "${metricName}": ${current} >= ${limit}`
    );
    this.name = 'CardinalityExceededError';
  }
}

export class InvalidMetricNameError extends Error {
  constructor(public readonly name: string, public readonly reason: string) {
    super(`Invalid metric name "${name}": ${reason}`);
    this.name = 'InvalidMetricNameError';
  }
}

export class InvalidLabelNameError extends Error {
  constructor(public readonly name: string, public readonly reason: string) {
    super(`Invalid label name "${name}": ${reason}`);
    this.name = 'InvalidLabelNameError';
  }
}

/**
 * Validates metric name against Prometheus naming conventions.
 * Must match: [a-zA-Z_:][a-zA-Z0-9_:]*
 */
export function isValidMetricName(name: string): boolean {
  if (!name || name.length === 0) {
    return false;
  }

  const firstChar = name[0];
  if (!firstChar.match(/[a-zA-Z_:]/)) {
    return false;
  }

  for (let i = 1; i < name.length; i++) {
    if (!name[i].match(/[a-zA-Z0-9_:]/)) {
      return false;
    }
  }

  return true;
}

/**
 * Validates label name against Prometheus naming conventions.
 * Must match: [a-zA-Z_][a-zA-Z0-9_]*
 * Cannot start with __
 */
export function isValidLabelName(name: string): boolean {
  if (!name || name.length === 0) {
    return false;
  }

  // Reserved for internal use
  if (name.startsWith('__')) {
    return false;
  }

  const firstChar = name[0];
  if (!firstChar.match(/[a-zA-Z_]/)) {
    return false;
  }

  for (let i = 1; i < name.length; i++) {
    if (!name[i].match(/[a-zA-Z0-9_]/)) {
      return false;
    }
  }

  return true;
}

/**
 * Format full metric name with subsystem.
 */
export function formatMetricName(name: string, subsystem?: string): string {
  if (subsystem) {
    return `${subsystem}_${name}`;
  }
  return name;
}
