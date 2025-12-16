/**
 * Agent module exports
 * Provides instrumentation for agent operations in Datadog APM
 */

export type { AgentSpan, AgentSpanOptions, AgentStepSpanOptions } from './interface.js';
export { AgentSpanImpl, AGENT_TAGS, AGENT_METRICS } from './span.js';
export type { DatadogAPMClient } from './span.js';
export { AgentCorrelationManager } from './correlation.js';
export type { AgentCorrelation } from './correlation.js';
export { ToolCallInstrumentor } from './tool-call.js';
export type { ToolCallResult } from './tool-call.js';
export { traceStep, traceSteps } from './step.js';
export type { StepResult } from './step.js';