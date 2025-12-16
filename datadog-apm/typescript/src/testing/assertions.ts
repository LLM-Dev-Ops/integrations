/**
 * Test assertion helpers for Datadog APM
 *
 * @module testing/assertions
 */

import type { Tags, TagValue } from '../types/common.js';
import type { MockDatadogAPMClient, CapturedMetric } from './mock-client.js';
import type { CapturedSpan } from './mock-span.js';

/**
 * Assertion error for test failures
 */
export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

/**
 * Assert that a span was created with the given name
 */
export function assertSpanCreated(
  client: MockDatadogAPMClient,
  name: string,
  tags?: Tags
): CapturedSpan {
  const spans = client.getSpans({ name });

  if (spans.length === 0) {
    throw new AssertionError(`Span "${name}" was not created`);
  }

  const span = spans[0];

  if (tags) {
    for (const [key, expectedValue] of Object.entries(tags)) {
      const actualValue = span.tags[key];
      if (actualValue !== expectedValue) {
        throw new AssertionError(
          `Span "${name}" tag "${key}" expected "${expectedValue}", got "${actualValue}"`
        );
      }
    }
  }

  return span;
}

/**
 * Assert that a span was NOT created with the given name
 */
export function assertSpanNotCreated(client: MockDatadogAPMClient, name: string): void {
  const spans = client.getSpans({ name });

  if (spans.length > 0) {
    throw new AssertionError(`Span "${name}" was unexpectedly created`);
  }
}

/**
 * Assert that a span has a specific tag
 */
export function assertSpanHasTag(
  span: CapturedSpan,
  key: string,
  expectedValue?: TagValue
): void {
  if (!(key in span.tags)) {
    throw new AssertionError(`Span "${span.name}" does not have tag "${key}"`);
  }

  if (expectedValue !== undefined && span.tags[key] !== expectedValue) {
    throw new AssertionError(
      `Span "${span.name}" tag "${key}" expected "${expectedValue}", got "${span.tags[key]}"`
    );
  }
}

/**
 * Assert that a span was finished
 */
export function assertSpanFinished(span: CapturedSpan): void {
  if (!span.finished) {
    throw new AssertionError(`Span "${span.name}" was not finished`);
  }
}

/**
 * Assert that a span has an error
 */
export function assertSpanHasError(span: CapturedSpan, errorType?: string): void {
  if (!span.error && span.tags['error'] !== true) {
    throw new AssertionError(`Span "${span.name}" does not have an error`);
  }

  if (errorType && span.tags['error.type'] !== errorType) {
    throw new AssertionError(
      `Span "${span.name}" error type expected "${errorType}", got "${span.tags['error.type']}"`
    );
  }
}

/**
 * Assert that a metric was recorded
 */
export function assertMetricRecorded(
  client: MockDatadogAPMClient,
  name: string,
  type: CapturedMetric['type'],
  tags?: Tags
): CapturedMetric {
  const metrics = client.getMetrics({ name, type });

  if (metrics.length === 0) {
    throw new AssertionError(`Metric "${name}" (${type}) was not recorded`);
  }

  const metric = metrics[0];

  if (tags) {
    for (const [key, expectedValue] of Object.entries(tags)) {
      const actualValue = metric.tags[key];
      if (actualValue !== expectedValue) {
        throw new AssertionError(
          `Metric "${name}" tag "${key}" expected "${expectedValue}", got "${actualValue}"`
        );
      }
    }
  }

  return metric;
}

/**
 * Assert that a metric has a specific value
 */
export function assertMetricValue(
  client: MockDatadogAPMClient,
  name: string,
  expectedValue: number,
  type?: CapturedMetric['type']
): void {
  const metrics = client.getMetrics({ name, type });

  if (metrics.length === 0) {
    throw new AssertionError(`Metric "${name}" was not recorded`);
  }

  const metric = metrics[metrics.length - 1]; // Get most recent

  if (metric.value !== expectedValue) {
    throw new AssertionError(
      `Metric "${name}" value expected ${expectedValue}, got ${metric.value}`
    );
  }
}

/**
 * Assert that counter was incremented by a specific amount
 */
export function assertCounterIncremented(
  client: MockDatadogAPMClient,
  name: string,
  expectedTotal: number,
  tags?: Tags
): void {
  const metrics = client.getMetrics({ name, type: 'counter' });

  if (metrics.length === 0) {
    throw new AssertionError(`Counter "${name}" was not recorded`);
  }

  // Filter by tags if provided
  const filtered = tags
    ? metrics.filter((m) => Object.entries(tags).every(([k, v]) => m.tags[k] === v))
    : metrics;

  const total = filtered.reduce((sum, m) => sum + m.value, 0);

  if (total !== expectedTotal) {
    throw new AssertionError(
      `Counter "${name}" total expected ${expectedTotal}, got ${total}`
    );
  }
}

/**
 * Assert that context was propagated correctly
 */
export function assertContextPropagated(
  client: MockDatadogAPMClient,
  traceId: string
): void {
  const spans = client.getSpans();
  const hasTrace = spans.some((s) => s.traceId === traceId);

  if (!hasTrace) {
    throw new AssertionError(`No spans found with trace ID "${traceId}"`);
  }
}

/**
 * Assert span parent-child relationship
 */
export function assertSpanParentChild(parent: CapturedSpan, child: CapturedSpan): void {
  if (child.parentId !== parent.spanId) {
    throw new AssertionError(
      `Expected "${child.name}" to be child of "${parent.name}", but parent ID mismatch`
    );
  }

  if (child.traceId !== parent.traceId) {
    throw new AssertionError(
      `Expected "${child.name}" to share trace ID with "${parent.name}"`
    );
  }
}

/**
 * Get span count for assertions
 */
export function getSpanCount(client: MockDatadogAPMClient, filter?: { name?: string }): number {
  return client.getSpans(filter).length;
}

/**
 * Get metric count for assertions
 */
export function getMetricCount(
  client: MockDatadogAPMClient,
  filter?: { name?: string; type?: CapturedMetric['type'] }
): number {
  return client.getMetrics(filter).length;
}

// ==================== LLM Span Assertions ====================

/**
 * Assert that an LLM span was created with expected attributes
 */
export function assertLLMSpanCreated(
  client: MockDatadogAPMClient,
  name: string,
  options?: {
    provider?: string;
    model?: string;
    requestType?: string;
  }
): CapturedSpan {
  const span = assertSpanCreated(client, name);

  // Verify it's an LLM span
  if (!span.tags['llm.provider']) {
    throw new AssertionError(`Span "${name}" is not an LLM span (missing llm.provider tag)`);
  }

  // Check optional attributes
  if (options?.provider && span.tags['llm.provider'] !== options.provider) {
    throw new AssertionError(
      `LLM span "${name}" provider expected "${options.provider}", got "${span.tags['llm.provider']}"`
    );
  }

  if (options?.model && span.tags['llm.model'] !== options.model) {
    throw new AssertionError(
      `LLM span "${name}" model expected "${options.model}", got "${span.tags['llm.model']}"`
    );
  }

  if (options?.requestType && span.tags['llm.request_type'] !== options.requestType) {
    throw new AssertionError(
      `LLM span "${name}" request type expected "${options.requestType}", got "${span.tags['llm.request_type']}"`
    );
  }

  return span;
}

/**
 * Assert that LLM token counts were recorded
 */
export function assertLLMTokensRecorded(
  client: MockDatadogAPMClient,
  name: string,
  inputTokens: number,
  outputTokens: number
): CapturedSpan {
  const span = assertLLMSpanCreated(client, name);

  const actualInputTokens = span.tags['llm.input_tokens'];
  const actualOutputTokens = span.tags['llm.output_tokens'];

  if (actualInputTokens !== inputTokens) {
    throw new AssertionError(
      `LLM span "${name}" input tokens expected ${inputTokens}, got ${actualInputTokens}`
    );
  }

  if (actualOutputTokens !== outputTokens) {
    throw new AssertionError(
      `LLM span "${name}" output tokens expected ${outputTokens}, got ${actualOutputTokens}`
    );
  }

  // Verify total tokens are calculated correctly
  const expectedTotal = inputTokens + outputTokens;
  const actualTotal = span.tags['llm.total_tokens'];

  if (actualTotal !== expectedTotal) {
    throw new AssertionError(
      `LLM span "${name}" total tokens expected ${expectedTotal}, got ${actualTotal}`
    );
  }

  return span;
}

// ==================== Agent Span Assertions ====================

/**
 * Assert that an Agent span was created with expected attributes
 */
export function assertAgentSpanCreated(
  client: MockDatadogAPMClient,
  name: string,
  options?: {
    agentName?: string;
    agentType?: string;
  }
): CapturedSpan {
  const span = assertSpanCreated(client, name);

  // Verify it's an Agent span
  if (!span.tags['agent.name']) {
    throw new AssertionError(`Span "${name}" is not an Agent span (missing agent.name tag)`);
  }

  // Check optional attributes
  if (options?.agentName && span.tags['agent.name'] !== options.agentName) {
    throw new AssertionError(
      `Agent span "${name}" agent name expected "${options.agentName}", got "${span.tags['agent.name']}"`
    );
  }

  if (options?.agentType && span.tags['agent.type'] !== options.agentType) {
    throw new AssertionError(
      `Agent span "${name}" agent type expected "${options.agentType}", got "${span.tags['agent.type']}"`
    );
  }

  return span;
}

/**
 * Assert that an agent step was tracked
 */
export function assertAgentStepTracked(
  client: MockDatadogAPMClient,
  parentSpan: CapturedSpan,
  stepNumber: number
): CapturedSpan {
  // Find a span with the parent's spanId as its parentId and matching step number
  const spans = client.getSpans();
  const stepSpan = spans.find(
    (s) => s.parentId === parentSpan.spanId && s.tags['agent.step'] === stepNumber
  );

  if (!stepSpan) {
    throw new AssertionError(
      `Agent step ${stepNumber} not found for parent span "${parentSpan.name}"`
    );
  }

  return stepSpan;
}

/**
 * Assert that a tool call was recorded
 */
export function assertToolCallRecorded(
  client: MockDatadogAPMClient,
  agentName: string,
  toolName: string,
  success: boolean
): CapturedMetric {
  const metrics = client.getMetrics({ name: 'agent.tool_calls', type: 'counter' });

  const toolCallMetric = metrics.find(
    (m) =>
      m.tags['agent'] === agentName &&
      m.tags['tool'] === toolName &&
      m.tags['status'] === (success ? 'success' : 'error')
  );

  if (!toolCallMetric) {
    throw new AssertionError(
      `Tool call metric for agent "${agentName}", tool "${toolName}", status "${success ? 'success' : 'error'}" was not recorded`
    );
  }

  return toolCallMetric;
}

// ==================== Log Correlation Assertions ====================

/**
 * Assert that log context was captured with correct correlation IDs
 */
export function assertLogCorrelated(
  client: MockDatadogAPMClient,
  traceId: string,
  spanId: string
): void {
  const logContext = client.getLogContext();

  if (!logContext) {
    throw new AssertionError('No log context available');
  }

  const dd = logContext.dd as any;

  if (!dd) {
    throw new AssertionError('Log context missing "dd" field');
  }

  if (dd.trace_id !== traceId) {
    throw new AssertionError(
      `Log context trace_id expected "${traceId}", got "${dd.trace_id}"`
    );
  }

  if (dd.span_id !== spanId) {
    throw new AssertionError(`Log context span_id expected "${spanId}", got "${dd.span_id}"`);
  }
}

// ==================== Error Tracking Assertions ====================

/**
 * Assert that an error was tracked on a span
 */
export function assertErrorTracked(
  client: MockDatadogAPMClient,
  errorType?: string,
  errorMessage?: string
): CapturedSpan {
  const spans = client.getSpans();
  const errorSpan = spans.find((s) => s.error !== null || s.tags['error'] === true);

  if (!errorSpan) {
    throw new AssertionError('No error span found');
  }

  if (errorType && errorSpan.tags['error.type'] !== errorType) {
    throw new AssertionError(
      `Error type expected "${errorType}", got "${errorSpan.tags['error.type']}"`
    );
  }

  if (errorMessage && errorSpan.tags['error.message'] !== errorMessage) {
    throw new AssertionError(
      `Error message expected "${errorMessage}", got "${errorSpan.tags['error.message']}"`
    );
  }

  return errorSpan;
}
