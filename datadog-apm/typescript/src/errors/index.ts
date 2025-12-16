/**
 * Error classes for Datadog APM integration.
 *
 * Exports all error classes and utility functions.
 */

// Base error
export {
  DatadogAPMError,
  isDatadogAPMError,
  isRetryableError,
  isErrorCategory,
} from './base';
export type { ErrorCategory } from './base';

// Configuration errors
export { ConfigurationError } from './configuration';

// Connection errors
export {
  ConnectionError,
  AgentUnreachableError,
  AgentTimeoutError,
  SocketError,
} from './connection';

// Tracing errors
export {
  TracingError,
  SpanNotFoundError,
  InvalidTraceContextError,
  PropagationFailedError,
} from './tracing';

// Metric errors
export {
  MetricError,
  InvalidMetricNameError,
  TagLimitExceededError,
  BufferOverflowError,
} from './metric';
