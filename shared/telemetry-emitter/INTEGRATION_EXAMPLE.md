# Integration Example

This document shows how to integrate the `@integrations/telemetry-emitter` into an existing integration module (e.g., Anthropic, Slack, etc.).

## Installation

From your integration directory (e.g., `/workspaces/integrations/anthropic/typescript`):

```bash
# If using workspace references
npm install @integrations/telemetry-emitter

# Or add to package.json
{
  "dependencies": {
    "@integrations/telemetry-emitter": "workspace:*"
  }
}
```

## Example: Anthropic Integration

Here's how to add telemetry to an Anthropic API integration:

```typescript
// anthropic/typescript/src/client.ts
import { TelemetryEmitter } from '@integrations/telemetry-emitter';
import { v4 as uuidv4 } from 'uuid';

// Get the singleton emitter instance
const telemetry = TelemetryEmitter.getInstance();

export class AnthropicClient {
  async sendMessage(params: MessageParams): Promise<MessageResponse> {
    // Generate a unique correlation ID for this request
    const correlationId = uuidv4();

    // Emit request start event
    telemetry.emitRequestStart(
      'anthropic',
      correlationId,
      {
        model: params.model,
        endpoint: '/v1/messages',
        maxTokens: params.max_tokens,
      },
      {
        provider: params.model,
      }
    );

    const startTime = Date.now();

    try {
      // Make the actual API request
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(params),
      });

      const endTime = Date.now();
      const latency = endTime - startTime;

      // Parse response
      const data = await response.json();

      if (!response.ok) {
        // Emit error event
        telemetry.emitError(
          'anthropic',
          correlationId,
          new Error(`API Error: ${response.status}`),
          {
            statusCode: response.status,
            errorType: data.error?.type,
            errorMessage: data.error?.message,
          },
          { provider: params.model }
        );

        throw new Error(`API Error: ${response.status} - ${data.error?.message}`);
      }

      // Emit latency event
      telemetry.emitLatency(
        'anthropic',
        correlationId,
        latency,
        {
          endpoint: '/v1/messages',
          statusCode: response.status,
        },
        { provider: params.model }
      );

      // Emit request complete event
      telemetry.emitRequestComplete(
        'anthropic',
        correlationId,
        {
          statusCode: response.status,
          inputTokens: data.usage?.input_tokens,
          outputTokens: data.usage?.output_tokens,
          totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
          stopReason: data.stop_reason,
        },
        { provider: params.model }
      );

      return data;
    } catch (error) {
      const endTime = Date.now();
      const latency = endTime - startTime;

      // Emit error event
      telemetry.emitError(
        'anthropic',
        correlationId,
        error as Error,
        {
          latency,
          endpoint: '/v1/messages',
        },
        { provider: params.model }
      );

      // Re-throw the error - telemetry should never affect the main flow
      throw error;
    }
  }
}
```

## Example: Streaming Support

For streaming endpoints:

```typescript
export class AnthropicClient {
  async *streamMessage(params: MessageParams): AsyncGenerator<MessageChunk> {
    const correlationId = uuidv4();

    telemetry.emitRequestStart(
      'anthropic',
      correlationId,
      {
        model: params.model,
        endpoint: '/v1/messages',
        stream: true,
      },
      { provider: params.model }
    );

    const startTime = Date.now();
    let chunkCount = 0;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ ...params, stream: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        telemetry.emitError(
          'anthropic',
          correlationId,
          new Error(`API Error: ${response.status}`),
          { statusCode: response.status, errorType: data.error?.type },
          { provider: params.model }
        );
        throw new Error(`API Error: ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        chunkCount++;
        yield JSON.parse(chunk);
      }

      const endTime = Date.now();
      const latency = endTime - startTime;

      telemetry.emitLatency('anthropic', correlationId, latency, {
        endpoint: '/v1/messages',
        stream: true,
        chunkCount,
      }, { provider: params.model });

      telemetry.emitRequestComplete('anthropic', correlationId, {
        statusCode: response.status,
        stream: true,
        chunkCount,
      }, { provider: params.model });

    } catch (error) {
      telemetry.emitError('anthropic', correlationId, error as Error, {
        latency: Date.now() - startTime,
        stream: true,
      }, { provider: params.model });
      throw error;
    }
  }
}
```

## Example: With Distributed Tracing

If you're using OpenTelemetry or another tracing system:

```typescript
import { TelemetryEmitter } from '@integrations/telemetry-emitter';
import { trace, context } from '@opentelemetry/api';

export class AnthropicClient {
  async sendMessage(params: MessageParams): Promise<MessageResponse> {
    const tracer = trace.getTracer('anthropic-integration');

    return tracer.startActiveSpan('anthropic.messages.create', async (span) => {
      const correlationId = uuidv4();
      const spanContext = span.spanContext();

      // Include trace and span IDs in telemetry
      const tracingOptions = {
        provider: params.model,
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
      };

      telemetry.emitRequestStart(
        'anthropic',
        correlationId,
        { model: params.model, endpoint: '/v1/messages' },
        tracingOptions
      );

      try {
        const response = await this.makeRequest(params);

        telemetry.emitRequestComplete(
          'anthropic',
          correlationId,
          { statusCode: 200, ...response.usage },
          tracingOptions
        );

        span.end();
        return response;
      } catch (error) {
        telemetry.emitError(
          'anthropic',
          correlationId,
          error as Error,
          {},
          tracingOptions
        );

        span.recordException(error as Error);
        span.end();
        throw error;
      }
    });
  }
}
```

## Key Benefits

1. **Non-intrusive**: Telemetry never affects the main integration logic
2. **Fire-and-forget**: No performance impact from telemetry emission
3. **Fail-safe**: If telemetry fails, the integration continues to work
4. **Consistent**: All integrations use the same event shape
5. **Correlation**: Easy to trace events across the lifecycle of a request

## Best Practices

1. **Generate correlation IDs early**: Create a unique ID at the start of each request
2. **Include relevant metadata**: Add context that helps debug and analyze events
3. **Use the provider field**: Specify the model/provider for better filtering
4. **Emit all lifecycle events**: Start, complete, error, and latency events
5. **Don't await telemetry**: The emit methods are synchronous and non-blocking
6. **Include error context**: When emitting errors, include helpful metadata

## Environment Configuration

Set the ingest endpoint via environment variable:

```bash
# .env or deployment configuration
RUVVECTOR_INGEST_URL=https://telemetry.example.com/ingest
```

Or configure programmatically (should be done once at startup):

```typescript
// In your integration's initialization
import { TelemetryEmitter } from '@integrations/telemetry-emitter';

const telemetry = TelemetryEmitter.getInstance({
  ingestUrl: process.env.RUVVECTOR_INGEST_URL,
  maxRetries: 2,
  initialRetryDelay: 100,
  timeout: 5000,
});
```
