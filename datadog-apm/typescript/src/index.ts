/**
 * Datadog APM Integration for TypeScript
 *
 * This module provides a comprehensive Datadog APM integration following the SPARC specification.
 * It includes support for distributed tracing, metrics, LLM instrumentation, agent workflows,
 * log correlation, and production-ready features like PII redaction and circuit breaking.
 *
 * @packageDocumentation
 */

// ============================================================================
// Client Exports
// ============================================================================

export type { DatadogAPMClient } from './client';
export { DatadogAPMClientImpl, DatadogAPMClientFactory } from './client';

// ============================================================================
// Tracing Exports
// ============================================================================

export type { Span, SpanContext, SpanOptions } from './tracing';
export { SpanImpl, Tracer, SpanType } from './tracing';

// ============================================================================
// Propagation Exports
// ============================================================================

export { Carrier } from './propagation';
export { HeaderCarrier } from './propagation';
export {
  DD_TRACE_ID,
  DD_PARENT_ID,
  DD_SAMPLING_PRIORITY,
  DD_ORIGIN,
  DD_TAGS,
  injectDatadogContext,
  extractDatadogContext,
} from './propagation';
export {
  W3C_TRACEPARENT,
  W3C_TRACESTATE,
  injectW3CContext,
  extractW3CContext,
  formatTraceparent,
  parseTraceparent,
  formatTracestate,
} from './propagation';
export { CompositePropagator } from './propagation';
export { TraceIdConverter } from './propagation';

// ============================================================================
// Metrics Exports
// ============================================================================

export { MetricsClient } from './metrics';
export { DogStatsD } from './metrics';
export type { DogStatsDConfig } from './metrics';
export { Timer, createTimer } from './metrics';
export { MetricType } from './types';
export type { CapturedMetric } from './types';
export { CardinalityProtector } from './metrics';
export type { CardinalityProtectorConfig } from './metrics';

// ============================================================================
// LLM Exports
// ============================================================================

export type { LLMSpan, LLMSpanOptions } from './llm';
export { LLMRequestType, LLMSpanImpl, StreamingLLMSpan } from './llm';
export { LLM_TAGS, LLM_METRICS } from './llm';
export { CostTracker, MODEL_PRICING } from './llm';
export { ContentSanitizer } from './llm';
export type { SanitizationRule } from './llm';

// ============================================================================
// Agent Exports
// ============================================================================

export type { AgentSpan, AgentSpanOptions, AgentStepSpanOptions } from './agent';
export { AgentSpanImpl, AGENT_TAGS, AGENT_METRICS } from './agent';
export { AgentCorrelationManager } from './agent';
export type { AgentCorrelation } from './agent';
export { ToolCallInstrumentor } from './agent';
export type { ToolCallResult } from './agent';
export { traceStep, traceSteps } from './agent';
export type { StepResult } from './agent';

// ============================================================================
// Logging Exports
// ============================================================================

export type { LogContext, ExtendedLogContext } from './logging';
export { createLogContext, mergeLogContext } from './logging';
export {
  getLogContextFromSpan,
  getLogContextFromSpanContext,
  injectTraceContext,
  extractCorrelationIds,
} from './logging';
export { CorrelatedLogger } from './logging';
export type { LogContextProvider } from './logging';

// ============================================================================
// Error Exports
// ============================================================================

export {
  DatadogAPMError,
  isDatadogAPMError,
  isRetryableError,
  isErrorCategory,
} from './errors';
export type { ErrorCategory } from './errors';
export { ConfigurationError } from './errors';
export {
  ConnectionError,
  AgentUnreachableError,
  AgentTimeoutError,
  SocketError,
} from './errors';
export {
  TracingError,
  SpanNotFoundError,
  InvalidTraceContextError,
  PropagationFailedError,
} from './errors';
export {
  MetricError,
  InvalidMetricNameError,
  TagLimitExceededError,
  BufferOverflowError,
} from './errors';

// ============================================================================
// Configuration Exports
// ============================================================================

export type { DatadogAPMConfig } from './config';
export { DEFAULT_CONFIG, applyDefaults } from './config';
export { validateConfig } from './config';
export { configFromEnvironment } from './config';

// ============================================================================
// Security Exports
// ============================================================================

export type { RedactionRule } from './security';
export {
  DEFAULT_REDACTION_RULES,
  BLOCKED_TAG_KEYS,
  BLOCKED_TAG_PATTERNS,
  ALLOWED_TAGS,
  HIGH_CARDINALITY_PATTERNS,
} from './security';
export { PIIRedactor } from './security';
export type { BlockerLogger } from './security';
export { TagBlocker } from './security';
export { SafeTagSerializer } from './security';

// ============================================================================
// Resilience Exports
// ============================================================================

export type {
  CircuitState,
  CircuitBreakerOptions,
} from './resilience';
export { AgentCircuitBreaker } from './resilience';
export type {
  HealthCheckConfig,
  AgentHealthStatus,
} from './resilience';
export { AgentHealthChecker } from './resilience';
export type {
  SamplingDecision,
  SamplingContext,
  AdaptiveSamplerOptions,
} from './resilience';
export { AdaptiveSampler } from './resilience';

// ============================================================================
// Type Exports
// ============================================================================

export type { Tags, TagValue, Logger } from './types';

// ============================================================================
// Testing Exports (Subpath)
// ============================================================================

// Note: Testing utilities should be imported via the subpath:
// import { MockDatadogAPMClient } from '@datadog-apm/testing'
//
// The exports are available via './testing' for internal use:
// export * from './testing';
