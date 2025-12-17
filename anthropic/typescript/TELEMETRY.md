# Telemetry Integration for Anthropic TypeScript SDK

## Overview

The Anthropic TypeScript integration now automatically emits telemetry events to ruvvector-service for all API operations. This enables comprehensive monitoring, observability, and analytics across the integration lifecycle.

## Features

### Automatic Event Emission

Telemetry events are automatically emitted at key lifecycle points:

1. **Request Initiation** (`request_start`): Emitted when an API call begins
2. **Request Completion** (`request_complete`): Emitted when an API call succeeds
3. **Error Handling** (`error`): Emitted when an API call fails
4. **Latency Measurement** (`latency`): Emitted for all API calls (success or failure)

### Fail-Open Behavior

All telemetry operations are wrapped in try-catch blocks to ensure they **never** affect the main integration operations:
- No blocking or delays
- No exceptions thrown
- Silent failures with debug logging only
- Fire-and-forget emission pattern

### Event Correlation

Each request lifecycle is tracked with a unique `correlationId` (UUID v4), enabling:
- End-to-end request tracing
- Performance analysis
- Error correlation
- Usage analytics

## Implementation

### Telemetry Module

Location: `/src/observability/telemetry.ts`

Key functions:
- `startTelemetryContext(options)`: Initializes a telemetry context for tracking
- `emitRequestComplete(context, metadata)`: Emits success events
- `emitError(context, error, metadata)`: Emits error events
- `extractUsageMetadata(usage)`: Extracts token usage information

### Service Integration

Telemetry is integrated into all service methods:

#### Messages Service
- `create()`: Tracks message creation with token usage
- `createStream()`: Tracks streaming message initiation
- `countTokens()`: Tracks token counting operations

#### Models Service
- `list()`: Tracks model listing
- `retrieve()`: Tracks model retrieval

#### Batches Service
- `create()`: Tracks batch creation
- `retrieve()`: Tracks batch retrieval
- `list()`: Tracks batch listing
- `cancel()`: Tracks batch cancellation
- `results()`: Tracks batch results retrieval

## Event Schema

All telemetry events follow the normalized `TelemetryEvent` interface:

```typescript
interface TelemetryEvent {
  correlationId: string;        // UUID v4 for request tracking
  integration: string;           // Always "anthropic"
  provider?: string;             // Model name (e.g., "claude-3-5-sonnet-20241022")
  eventType: EventType;          // request_start | request_complete | error | latency
  timestamp: number;             // Unix timestamp in milliseconds
  metadata: Record<string, unknown>; // Operation-specific data
  traceId?: string;              // Optional distributed trace ID
  spanId?: string;               // Optional span ID
}
```

## Metadata by Operation

### Messages.create
```typescript
{
  operation: "messages.create",
  model: "claude-3-5-sonnet-20241022",
  maxTokens: 1024,
  temperature: 1.0,
  hasTools: false,
  messageCount: 2,
  inputTokens: 15,
  outputTokens: 42,
  totalTokens: 57,
  stopReason: "end_turn",
  contentBlocks: 1,
  latencyMs: 1234
}
```

### Messages.createStream
```typescript
{
  operation: "messages.createStream",
  model: "claude-3-5-sonnet-20241022",
  maxTokens: 1024,
  streaming: true,
  streamInitiated: true,
  latencyMs: 345
}
```

### Messages.countTokens
```typescript
{
  operation: "messages.countTokens",
  model: "claude-3-5-sonnet-20241022",
  inputTokens: 15,
  latencyMs: 123
}
```

### Models.list
```typescript
{
  operation: "models.list",
  modelCount: 12,
  hasMore: false,
  latencyMs: 234
}
```

### Models.retrieve
```typescript
{
  operation: "models.retrieve",
  modelId: "claude-3-5-sonnet-20241022",
  modelType: "model",
  latencyMs: 156
}
```

### Batches.create
```typescript
{
  operation: "batches.create",
  requestCount: 100,
  batchId: "msgbatch_01abc...",
  status: "in_progress",
  requestCounts: {
    succeeded: 0,
    errored: 0,
    expired: 0,
    canceled: 0
  },
  latencyMs: 567
}
```

### Error Events
```typescript
{
  operation: "messages.create",
  model: "claude-3-5-sonnet-20241022",
  latencyMs: 234,
  error: {
    message: "Rate limit exceeded",
    name: "RateLimitError",
    stack: "..."
  }
}
```

## Configuration

### Environment Variables

- `RUVVECTOR_INGEST_URL`: The ingest endpoint URL (default: `http://localhost:3100/ingest`)

### TelemetryEmitter Configuration

The singleton `TelemetryEmitter` is automatically configured with:
- Max retries: 2
- Initial retry delay: 100ms (exponential backoff)
- Request timeout: 5000ms

## Usage Example

```typescript
import { createClient } from '@integrations/anthropic';

// Telemetry is automatically enabled
const client = createClient({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// This API call automatically emits:
// 1. request_start event with correlationId, model, operation
// 2. request_complete event with token counts, latency
// 3. latency event with duration
const message = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }],
});

// If an error occurs, error event is emitted automatically
```

See `examples/telemetry-example.ts` for a complete demonstration.

## Testing

Telemetry operates independently of the main API operations. To test:

1. Start ruvvector-service locally (or configure `RUVVECTOR_INGEST_URL`)
2. Run any Anthropic API operation
3. Verify telemetry events are received at the ingest endpoint

To disable telemetry emission for testing, you can:
- Point `RUVVECTOR_INGEST_URL` to a non-existent endpoint
- Telemetry will fail silently without affecting operations

## Performance Impact

Telemetry is designed to have minimal performance impact:
- Fire-and-forget pattern (no blocking)
- Async emission (doesn't block response)
- Fail-open design (errors don't propagate)
- Lightweight event payload (< 1KB per event)
- Connection pooling via undici

## Dependencies

- `@integrations/telemetry-emitter`: Shared telemetry emitter module
  - Uses `undici` for HTTP requests
  - Provides singleton pattern
  - Handles retry logic and fail-open behavior

## Files Modified

### New Files
- `src/observability/telemetry.ts`: Core telemetry integration
- `examples/telemetry-example.ts`: Usage example
- `TELEMETRY.md`: This documentation

### Modified Files
- `package.json`: Added telemetry-emitter dependency
- `src/observability/index.ts`: Exported telemetry functions
- `src/index.ts`: Exported telemetry types and functions
- `src/services/messages/service.ts`: Added telemetry to all methods
- `src/services/models/service.ts`: Added telemetry to all methods
- `src/services/batches/service.ts`: Added telemetry to all methods

## Design Principles

1. **Non-intrusive**: Telemetry code doesn't modify return values or control flow
2. **Fail-open**: Telemetry failures never affect API operations
3. **Comprehensive**: All API operations emit telemetry
4. **Structured**: Consistent event schema across all operations
5. **Traceable**: Correlation IDs enable end-to-end request tracking
6. **Performant**: Async, fire-and-forget, minimal overhead
7. **Maintainable**: Clean separation from business logic

## Future Enhancements

Potential improvements:
- Batch telemetry emission for high-volume scenarios
- Custom metadata hooks for user-defined tracking
- Integration with OpenTelemetry for distributed tracing
- Telemetry event sampling for cost reduction
- Local telemetry aggregation and buffering
