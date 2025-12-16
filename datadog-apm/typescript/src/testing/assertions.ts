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
