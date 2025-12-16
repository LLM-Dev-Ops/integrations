/**
 * Test fixtures for Datadog APM testing
 *
 * @module testing/fixtures
 */

import type { CapturedSpan, CapturedEvent } from './mock-span.js';
import type { CapturedMetric } from './mock-client.js';

/**
 * Create a test span fixture
 */
export function createTestSpanFixture(overrides?: Partial<CapturedSpan>): CapturedSpan {
  return {
    name: 'test-span',
    traceId: 'abc123def456',
    spanId: 'def456abc789',
    tags: {},
    events: [],
    error: null,
    startTime: Date.now(),
    endTime: null,
    finished: false,
    ...overrides,
  };
}

/**
 * Create a finished span fixture
 */
export function createFinishedSpanFixture(overrides?: Partial<CapturedSpan>): CapturedSpan {
  const startTime = Date.now() - 100;
  const endTime = Date.now();

  return {
    name: 'test-span',
    traceId: 'abc123def456',
    spanId: 'def456abc789',
    tags: {},
    events: [],
    error: null,
    startTime,
    endTime,
    duration: endTime - startTime,
    finished: true,
    ...overrides,
  };
}

/**
 * Create an error span fixture
 */
export function createErrorSpanFixture(
  error: Error = new Error('Test error'),
  overrides?: Partial<CapturedSpan>
): CapturedSpan {
  return createFinishedSpanFixture({
    error,
    tags: {
      error: true,
      'error.type': error.name,
      'error.message': error.message,
      'error.stack': error.stack ?? '',
    },
    ...overrides,
  });
}

/**
 * Create a test metric fixture
 */
export function createTestMetricFixture(overrides?: Partial<CapturedMetric>): CapturedMetric {
  return {
    type: 'counter',
    name: 'test.metric',
    value: 1,
    tags: {},
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Create LLM span options fixture
 */
export function createLLMSpanOptionsFixture(overrides?: Record<string, unknown>): {
  provider: string;
  model: string;
  requestType: string;
  streaming: boolean;
  maxTokens?: number;
  temperature?: number;
} {
  return {
    provider: 'anthropic',
    model: 'claude-3-opus',
    requestType: 'chat',
    streaming: false,
    ...overrides,
  };
}

/**
 * Create LLM span fixture with token usage
 */
export function createLLMSpanFixture(
  tokens: { input: number; output: number } = { input: 100, output: 200 },
  overrides?: Partial<CapturedSpan>
): CapturedSpan {
  return createFinishedSpanFixture({
    name: 'llm.chat',
    type: 'llm',
    resource: 'anthropic.chat',
    tags: {
      'llm.provider': 'anthropic',
      'llm.model': 'claude-3-opus',
      'llm.request_type': 'chat',
      'llm.input_tokens': tokens.input,
      'llm.output_tokens': tokens.output,
      'llm.total_tokens': tokens.input + tokens.output,
      'llm.streaming': false,
    },
    ...overrides,
  });
}

/**
 * Create agent span options fixture
 */
export function createAgentSpanOptionsFixture(overrides?: Record<string, unknown>): {
  agentName: string;
  agentType: string;
} {
  return {
    agentName: 'test-agent',
    agentType: 'generic',
    ...overrides,
  };
}

/**
 * Create agent span fixture
 */
export function createAgentSpanFixture(
  steps: number = 3,
  overrides?: Partial<CapturedSpan>
): CapturedSpan {
  return createFinishedSpanFixture({
    name: 'agent.test-agent',
    type: 'agent',
    resource: 'test-agent',
    tags: {
      'agent.name': 'test-agent',
      'agent.type': 'generic',
      'agent.step_count': steps,
      'agent.total_steps': steps,
    },
    ...overrides,
  });
}

/**
 * Create a span event fixture
 */
export function createSpanEventFixture(overrides?: Partial<CapturedEvent>): CapturedEvent {
  return {
    name: 'test-event',
    timestamp: Date.now(),
    attributes: {},
    ...overrides,
  };
}

/**
 * Create header carrier fixture with Datadog headers
 */
export function createDatadogHeadersFixture(overrides?: Record<string, string>): Record<string, string> {
  return {
    'x-datadog-trace-id': '1234567890abcdef',
    'x-datadog-parent-id': 'abcdef1234567890',
    'x-datadog-sampling-priority': '1',
    ...overrides,
  };
}

/**
 * Create header carrier fixture with W3C headers
 */
export function createW3CHeadersFixture(overrides?: Record<string, string>): Record<string, string> {
  return {
    traceparent: '00-00000000000000001234567890abcdef-abcdef1234567890-01',
    tracestate: 'dd=s:1',
    ...overrides,
  };
}

/**
 * Create config fixture
 */
export function createConfigFixture(overrides?: Record<string, unknown>): {
  service: string;
  env: string;
  version: string;
  agentHost: string;
  agentPort: number;
  statsdPort: number;
  sampleRate: number;
} {
  return {
    service: 'test-service',
    env: 'test',
    version: '1.0.0',
    agentHost: 'localhost',
    agentPort: 8126,
    statsdPort: 8125,
    sampleRate: 1.0,
    ...overrides,
  };
}
