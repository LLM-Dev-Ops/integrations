/**
 * Example usage of the TelemetryEmitter module
 *
 * This demonstrates how to use the telemetry emitter in an integration.
 */

import { TelemetryEmitter } from './src/index.js';

// Get the singleton instance
const emitter = TelemetryEmitter.getInstance({
  ingestUrl: process.env.RUVVECTOR_INGEST_URL || 'http://localhost:3100/ingest',
  maxRetries: 2,
  initialRetryDelay: 100,
  timeout: 5000,
});

// Example 1: Emit a request start event
const correlationId = `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;

emitter.emitRequestStart(
  'anthropic',
  correlationId,
  {
    model: 'claude-3-5-sonnet-20241022',
    endpoint: '/v1/messages',
    maxTokens: 1024,
  },
  {
    provider: 'claude-3-5-sonnet-20241022',
    traceId: 'trace-abc123',
    spanId: 'span-def456',
  }
);

// Simulate some processing time
await new Promise(resolve => setTimeout(resolve, 100));

// Example 2: Emit a latency event
emitter.emitLatency(
  'anthropic',
  correlationId,
  100,
  {
    endpoint: '/v1/messages',
    phase: 'api_call',
  }
);

// Example 3: Emit a request complete event
emitter.emitRequestComplete(
  'anthropic',
  correlationId,
  {
    statusCode: 200,
    tokensUsed: 150,
    inputTokens: 50,
    outputTokens: 100,
  },
  {
    provider: 'claude-3-5-sonnet-20241022',
    traceId: 'trace-abc123',
    spanId: 'span-def456',
  }
);

// Example 4: Emit an error event (in case of failure)
try {
  // Simulate an error
  throw new Error('API rate limit exceeded');
} catch (error) {
  emitter.emitError(
    'anthropic',
    correlationId,
    error as Error,
    {
      statusCode: 429,
      retryAfter: 60,
    }
  );
}

// Example 5: Emit a custom event
emitter.emit({
  correlationId: `custom-${Date.now()}`,
  integration: 'slack',
  provider: 'slack-api',
  eventType: 'request_start',
  timestamp: Date.now(),
  metadata: {
    channel: '#general',
    messageType: 'text',
  },
  traceId: 'trace-ghi789',
  spanId: 'span-jkl012',
});

// Check configuration
console.log('Emitter config:', emitter.getConfig());

console.log('Telemetry events emitted successfully (fire-and-forget)');
