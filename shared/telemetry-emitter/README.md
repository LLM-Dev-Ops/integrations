# Telemetry Emitter

A shared module for sending telemetry events to the ruvvector-service `/ingest` endpoint.

## Features

- **Non-blocking fire-and-forget pattern** - Fails open and never blocks integrations
- **Exponential backoff retry** - Max 2 retries with 100ms, 200ms delays
- **Singleton pattern** - Shared instance across integrations
- **Never throws exceptions** - Won't affect integration functionality
- **Configurable endpoint** - Via `RUVVECTOR_INGEST_URL` environment variable
- **Minimal dependencies** - Only uses `undici` for HTTP requests

## Installation

```bash
npm install @integrations/telemetry-emitter
```

Or from the workspace root:

```bash
cd shared/telemetry-emitter
npm install
npm run build
```

## Usage

### Basic Usage

```typescript
import { TelemetryEmitter } from '@integrations/telemetry-emitter';

const emitter = TelemetryEmitter.getInstance();

// Emit a request start event
emitter.emitRequestStart('anthropic', 'correlation-123', {
  model: 'claude-3-5-sonnet-20241022',
  endpoint: '/v1/messages',
});

// Emit a request complete event
emitter.emitRequestComplete('anthropic', 'correlation-123', {
  statusCode: 200,
  tokensUsed: 150,
});

// Emit an error event
emitter.emitError('anthropic', 'correlation-123', new Error('API Error'), {
  statusCode: 500,
});

// Emit a latency event
emitter.emitLatency('anthropic', 'correlation-123', 450, {
  endpoint: '/v1/messages',
});
```

### Custom Events

```typescript
import { TelemetryEmitter, TelemetryEvent } from '@integrations/telemetry-emitter';

const emitter = TelemetryEmitter.getInstance();

const customEvent: TelemetryEvent = {
  correlationId: 'correlation-123',
  integration: 'anthropic',
  provider: 'claude-3-5-sonnet-20241022',
  eventType: 'request_start',
  timestamp: Date.now(),
  metadata: {
    custom: 'data',
    endpoint: '/v1/messages',
  },
  traceId: 'trace-456',
  spanId: 'span-789',
};

emitter.emit(customEvent);
```

### Configuration

```typescript
import { TelemetryEmitter } from '@integrations/telemetry-emitter';

// Configure via constructor (first call only)
const emitter = TelemetryEmitter.getInstance({
  ingestUrl: 'https://custom-ingest-url.com/ingest',
  maxRetries: 3,
  initialRetryDelay: 200,
  timeout: 10000,
});

// Or via environment variable
process.env.RUVVECTOR_INGEST_URL = 'https://custom-ingest-url.com/ingest';
const emitter2 = TelemetryEmitter.getInstance();
```

### Distributed Tracing

```typescript
import { TelemetryEmitter } from '@integrations/telemetry-emitter';

const emitter = TelemetryEmitter.getInstance();

// Include trace and span IDs for distributed tracing
emitter.emitRequestStart(
  'anthropic',
  'correlation-123',
  { model: 'claude-3-5-sonnet-20241022' },
  {
    provider: 'claude-3-5-sonnet-20241022',
    traceId: 'trace-456',
    spanId: 'span-789',
  }
);
```

## API Reference

### TelemetryEmitter

#### `getInstance(config?: TelemetryEmitterConfig): TelemetryEmitter`

Get the singleton instance of TelemetryEmitter.

#### `emit(event: TelemetryEvent): void`

Emit a telemetry event with fire-and-forget pattern. Never blocks and never throws.

#### `emitRequestStart(integration, correlationId, metadata, options?): void`

Convenience method to emit a `request_start` event.

**Parameters:**
- `integration` (string) - Name of the integration (e.g., "anthropic", "slack")
- `correlationId` (string) - Unique ID for correlating events
- `metadata` (Record<string, unknown>) - Additional context
- `options` (optional) - `{ provider?, traceId?, spanId? }`

#### `emitRequestComplete(integration, correlationId, metadata, options?): void`

Convenience method to emit a `request_complete` event.

#### `emitError(integration, correlationId, error, metadata, options?): void`

Convenience method to emit an `error` event.

**Parameters:**
- `error` (Error | string) - The error object or message

#### `emitLatency(integration, correlationId, latencyMs, metadata, options?): void`

Convenience method to emit a `latency` event.

**Parameters:**
- `latencyMs` (number) - Latency in milliseconds

#### `getConfig(): Readonly<{...}>`

Get the current configuration (useful for debugging).

### TelemetryEvent Interface

```typescript
interface TelemetryEvent {
  correlationId: string;        // Unique ID for correlating events
  integration: string;          // Name of the integration (e.g., "anthropic", "slack")
  provider?: string;            // Provider or model identifier when applicable
  eventType: 'request_start' | 'request_complete' | 'error' | 'latency';
  timestamp: number;            // Unix timestamp in milliseconds
  metadata: Record<string, unknown>;  // Additional context from the integration
  traceId?: string;             // Optional trace ID for distributed tracing
  spanId?: string;              // Optional span ID
}
```

### TelemetryEmitterConfig Interface

```typescript
interface TelemetryEmitterConfig {
  ingestUrl?: string;           // Default: http://localhost:3100/ingest or RUVVECTOR_INGEST_URL
  maxRetries?: number;          // Default: 2
  initialRetryDelay?: number;   // Default: 100ms
  timeout?: number;             // Default: 5000ms
}
```

## Event Types

- `request_start` - Emitted when a request starts
- `request_complete` - Emitted when a request completes successfully
- `error` - Emitted when an error occurs
- `latency` - Emitted to record latency metrics

## Environment Variables

- `RUVVECTOR_INGEST_URL` - Override the default ingest endpoint URL
  - Default: `http://localhost:3100/ingest`

## Behavior Guarantees

1. **Never blocks** - All HTTP requests are fire-and-forget
2. **Never throws** - All errors are caught and logged silently
3. **Fails open** - If telemetry fails, integrations continue to work
4. **Minimal logging** - Only uses `console.debug` for failed requests
5. **Retries with backoff** - Automatically retries failed requests with exponential backoff

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Clean
npm run clean
```

## Testing

The module is designed to be completely non-intrusive. To verify it's working:

1. Set up the ruvvector-service with the `/ingest` endpoint
2. Enable debug logging: `DEBUG_TELEMETRY=true`
3. Watch the logs for successful/failed emission attempts

## License

LicenseRef-LLM-DevOps-Permanent
