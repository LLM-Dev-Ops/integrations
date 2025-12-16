/**
 * Testing module exports
 *
 * Provides mock implementations and test utilities for Datadog APM
 *
 * @module testing
 */

// Mock span exports
export {
  type CapturedEvent,
  type CapturedSpan,
  type MockSpanContext,
  MockSpan,
} from './mock-span.js';

// Mock client exports
export {
  type CapturedMetric,
  type CapturedLog,
  type MockSpanOptions,
  MockDatadogAPMClient,
} from './mock-client.js';

// Assertion exports
export {
  AssertionError,
  assertSpanCreated,
  assertSpanNotCreated,
  assertSpanHasTag,
  assertSpanFinished,
  assertSpanHasError,
  assertMetricRecorded,
  assertMetricValue,
  assertCounterIncremented,
  assertContextPropagated,
  assertSpanParentChild,
  getSpanCount,
  getMetricCount,
  // LLM span assertions
  assertLLMSpanCreated,
  assertLLMTokensRecorded,
  // Agent span assertions
  assertAgentSpanCreated,
  assertAgentStepTracked,
  assertToolCallRecorded,
  // Log correlation assertions
  assertLogCorrelated,
  // Error tracking assertions
  assertErrorTracked,
} from './assertions.js';

// Fixture exports
export {
  createTestSpanFixture,
  createFinishedSpanFixture,
  createErrorSpanFixture,
  createTestMetricFixture,
  createLLMSpanOptionsFixture,
  createLLMSpanFixture,
  createAgentSpanOptionsFixture,
  createAgentSpanFixture,
  createSpanEventFixture,
  createDatadogHeadersFixture,
  createW3CHeadersFixture,
  createConfigFixture,
} from './fixtures.js';
