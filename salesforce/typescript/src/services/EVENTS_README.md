# Salesforce Events Service

Production-quality TypeScript implementation of Salesforce Platform Events and Pub/Sub API.

## Overview

This service provides comprehensive support for event-driven architecture in Salesforce:

- **Platform Events Publishing**: Publish events via REST API (single or batch)
- **Pub/Sub API**: High-throughput gRPC-based event streaming (interface provided)
- **Streaming API**: HTTP-based event streaming via CometD (production-ready)

## Features

### Platform Events Publishing

```typescript
import { createSalesforceClient } from '../client/index.js';
import { createEventService } from './events.js';

const client = createSalesforceClient(config);
const eventService = createEventService(client);

// Publish single event
const result = await eventService.publish('Order_Event__e', {
  Order_Number__c: 'ORD-12345',
  Amount__c: 1500.0,
  Status__c: 'Shipped',
});

// Publish batch
const results = await eventService.publishBatch('Order_Event__e', [
  { Order_Number__c: 'ORD-1', Amount__c: 100 },
  { Order_Number__c: 'ORD-2', Amount__c: 200 },
]);
```

### Event Subscription (Streaming API)

```typescript
import { createSimplePubSubClient } from './events.js';

const streamingClient = createSimplePubSubClient(client);

// Subscribe to platform events
for await (const event of streamingClient.subscribe('/event/Order_Event__e', -1)) {
  console.log('Event:', event.data.payload);
  await processEvent(event);
  await storeReplayId(event.replayId); // For resumption
}

// Subscribe to Change Data Capture
for await (const change of streamingClient.subscribe('/data/AccountChangeEvent')) {
  console.log('Change type:', change.data.payload.changeType);
  console.log('Record IDs:', change.data.payload.recordIds);
}
```

## Architecture

### Publishing Flow

```
EventService.publish()
  → SalesforceClient.post()
  → POST /sobjects/EventType__e/
  → PublishResult (id, success, errors)
```

### Batch Publishing Flow

```
EventService.publishBatch()
  → SalesforceClient.post()
  → POST /composite (multiple subrequests)
  → PublishResult[] (one per event)
```

### Streaming Flow (HTTP)

```
SimplePubSubClient.subscribe()
  → Handshake (establish session)
  → Subscribe (register channel)
  → Connect (long-poll for events)
  → Yield events as AsyncGenerator
```

## API Reference

### EventService Interface

#### `publish(eventType, event)`

Publishes a single platform event.

**Parameters:**
- `eventType` (string): Platform event API name (e.g., 'Order_Event__e')
- `event` (Record<string, unknown>): Event payload with custom fields

**Returns:** `Promise<PublishResult>`

**Example:**
```typescript
const result = await eventService.publish('Order_Event__e', {
  Order_Number__c: 'ORD-12345',
  Amount__c: 1500.0,
});
```

#### `publishBatch(eventType, events)`

Publishes multiple platform events efficiently using Composite API.

**Parameters:**
- `eventType` (string): Platform event API name
- `events` (Record<string, unknown>[]): Array of event payloads

**Returns:** `Promise<PublishResult[]>`

**Benefits:**
- Single API call for multiple events
- Reduced API limits consumption
- Partial success supported (allOrNone: false)

### SimplePubSubClient Class

#### `subscribe(channel, replayId?)`

Subscribes to events via HTTP-based Streaming API (CometD).

**Parameters:**
- `channel` (string): Channel to subscribe to
  - Platform Events: `/event/{EventType__e}`
  - Change Data Capture: `/data/{SObjectName}ChangeEvent`
  - PushTopic: `/topic/{PushTopicName}`
- `replayId` (number, optional): Replay position
  - `-1`: Latest events (default)
  - `-2`: Earliest available (24-hour window)
  - Specific ID: Resume from that position

**Returns:** `AsyncGenerator<StreamingEvent>`

**Example:**
```typescript
for await (const event of client.subscribe('/event/Order_Event__e', -1)) {
  console.log(event.data.payload);
  await storeReplayId(event.replayId);
}
```

### PubSubClient Interface (gRPC)

**Status:** Interface defined, production implementation required

The gRPC-based Pub/Sub API provides:
- Higher throughput than Streaming API
- Lower latency
- Binary payload serialization (Apache Avro)
- Bidirectional streaming

**Production Requirements:**
1. Install dependencies: `@grpc/grpc-js`, `@grpc/proto-loader`, `avro-js`
2. Download proto file: https://github.com/developerforce/pub-sub-api
3. Implement gRPC client with OAuth authentication
4. Implement Avro deserialization

## Types

### PublishResult

```typescript
interface PublishResult {
  id: string;           // Event ID
  success: boolean;     // Whether publish succeeded
  errors: PublishError[]; // Errors if failed
}
```

### PublishError

```typescript
interface PublishError {
  statusCode: string;   // Error code
  message: string;      // Error message
  fields?: string[];    // Fields that caused error
}
```

### StreamingEvent

```typescript
interface StreamingEvent {
  channel: string;      // Channel name
  replayId: number;     // Event position
  data: {
    payload: Record<string, unknown>; // Event data
    event: {
      replayId: number;
      createdDate?: string;
    };
  };
}
```

### SubscribeOptions (Pub/Sub API)

```typescript
interface SubscribeOptions {
  topicName: string;           // e.g., '/event/Order_Event__e'
  replayPreset: ReplayPreset;  // LATEST | EARLIEST | CUSTOM
  replayId?: Uint8Array;       // For CUSTOM preset
  numRequested: number;        // Events per batch
}
```

### PlatformEventMessage (Pub/Sub API)

```typescript
interface PlatformEventMessage {
  replayId: Uint8Array;  // Binary replay position
  event: {
    schemaId: string;    // Avro schema ID
    payload: Uint8Array; // Binary event data
    id: string;          // Event ID
    createdDate: string; // ISO 8601 timestamp
  };
}
```

## Replay ID Management

Replay IDs allow resuming event subscriptions from a specific position.

### Best Practices

1. **Store Replay IDs**: Persist after processing each event
2. **Resume on Reconnect**: Use stored ID to avoid missing events
3. **Handle Expiration**: Replay window is 24 hours (Streaming API)
4. **Monitor Lag**: Track distance from latest event

### Example Implementation

```typescript
// Simple in-memory storage (use database in production)
let lastReplayId = -1;

for await (const event of client.subscribe('/event/Order_Event__e', lastReplayId)) {
  try {
    await processEvent(event);
    lastReplayId = event.replayId; // Update on success
  } catch (error) {
    console.error('Processing failed:', error);
    // Don't update replay ID - will retry this event
    break;
  }
}
```

### Production Storage

```typescript
import { Redis } from 'ioredis';

const redis = new Redis();

async function storeReplayId(channel: string, replayId: number) {
  await redis.set(`salesforce:replay:${channel}`, replayId);
}

async function loadReplayId(channel: string): Promise<number> {
  const stored = await redis.get(`salesforce:replay:${channel}`);
  return stored ? parseInt(stored) : -1;
}
```

## Error Handling

### Publishing Errors

```typescript
try {
  const result = await eventService.publish('Order_Event__e', event);

  if (!result.success) {
    result.errors.forEach(error => {
      console.error(`${error.statusCode}: ${error.message}`);
      if (error.fields) {
        console.error(`Fields: ${error.fields.join(', ')}`);
      }
    });
  }
} catch (error) {
  // Network, authentication, or server errors
  console.error('Publication failed:', error);
}
```

### Subscription Errors

```typescript
try {
  for await (const event of client.subscribe('/event/Order_Event__e')) {
    await processEvent(event);
  }
} catch (error) {
  if (error.code === 'TOKEN_EXPIRED') {
    // Session expired - reconnect
    await reconnect();
  } else {
    // Other errors
    console.error('Subscription error:', error);
  }
}
```

## Performance Considerations

### Publishing

- **Batch Size**: Use `publishBatch()` for multiple events
- **Optimal Batch Size**: 100-200 events per batch
- **Rate Limits**: Monitor hourly platform event limits
- **Composite API Limit**: Max 25 subrequests per call

### Subscribing

- **Connection Pooling**: Reuse streaming connections
- **Event Processing**: Process events asynchronously
- **Backpressure**: Don't request more events than you can handle
- **Replay Storage**: Use fast storage (Redis) for replay IDs

## Platform Event Types

### Platform Events

Custom event types defined in Salesforce.

**Naming Convention:** `{Name}__e`

**Example:**
```typescript
// Define in Salesforce: Order_Event__e
// Fields: Order_Number__c, Amount__c, Status__c

await eventService.publish('Order_Event__e', {
  Order_Number__c: 'ORD-12345',
  Amount__c: 1500.0,
  Status__c: 'Shipped',
});
```

### Change Data Capture

Automatic events for SObject changes.

**Naming Convention:** `{SObjectName}ChangeEvent`

**Example:**
```typescript
for await (const change of client.subscribe('/data/AccountChangeEvent')) {
  console.log('Change:', change.data.payload.changeType); // CREATE, UPDATE, DELETE
  console.log('Records:', change.data.payload.recordIds);
  console.log('Fields:', change.data.payload.changedFields);
}
```

### Standard Events

Built-in Salesforce platform events.

**Examples:**
- `PlatformStatusChangeEvent`: Platform status changes
- `LoginEventStream`: User login events
- `LogoutEventStream`: User logout events

## Testing

### Unit Testing

```typescript
import { createEventService } from './events.js';
import { createMockClient } from '../client/__tests__/mock.js';

describe('EventService', () => {
  it('should publish event', async () => {
    const mockClient = createMockClient();
    const eventService = createEventService(mockClient);

    mockClient.post.mockResolvedValue({
      id: '123',
      success: true,
      errors: [],
    });

    const result = await eventService.publish('Test__e', { Field__c: 'value' });

    expect(result.success).toBe(true);
    expect(mockClient.post).toHaveBeenCalledWith('/sobjects/Test__e/', {
      Field__c: 'value',
    });
  });
});
```

### Integration Testing

```typescript
// Use Salesforce sandbox for testing
const config = SalesforceConfigBuilder.fromEnv().build();
const client = createSalesforceClient(config);
const eventService = createEventService(client);

// Publish test event
const result = await eventService.publish('Test_Event__e', {
  Test_Field__c: 'integration test',
});

expect(result.success).toBe(true);
```

## Migration from Legacy Code

### From JSforce

```typescript
// Before (JSforce)
const conn = new jsforce.Connection({ /* ... */ });
await conn.sobject('Order_Event__e').create({
  Order_Number__c: 'ORD-123',
});

// After (this library)
const eventService = createEventService(client);
await eventService.publish('Order_Event__e', {
  Order_Number__c: 'ORD-123',
});
```

### From Salesforce REST API

```typescript
// Before (raw REST)
const response = await fetch(
  `${instanceUrl}/services/data/v59.0/sobjects/Order_Event__e/`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ Order_Number__c: 'ORD-123' }),
  }
);

// After (this library)
const result = await eventService.publish('Order_Event__e', {
  Order_Number__c: 'ORD-123',
});
```

## Observability

All operations are instrumented with:
- **Logging**: Debug, info, warn, and error logs
- **Metrics**: Success/failure counts, latency tracking
- **Tracing**: Distributed tracing support

```typescript
import { ConsoleLogger, LogLevel } from '../observability/index.js';

const client = createSalesforceClient(config, {
  logger: new ConsoleLogger({ level: LogLevel.DEBUG }),
  metrics: metricsCollector,
  tracer: openTelemetryTracer,
});

// Logs automatically include context
const eventService = createEventService(client);
await eventService.publish('Order_Event__e', event);
// Logs: "Publishing platform event" { eventType: "Order_Event__e" }
```

## Security

### Authentication

Events service uses the client's configured authentication:
- JWT Bearer Token Flow (recommended for server-to-server)
- Refresh Token Flow (for user-context applications)

### Data Protection

- Sensitive fields are automatically redacted in logs
- Use SecretString for credentials in configuration
- Events are transmitted over HTTPS/TLS

### Best Practices

1. **Least Privilege**: Grant minimal permissions for event publishing
2. **Field-Level Security**: Respect Salesforce field-level security
3. **Audit Trail**: Platform events are automatically audited
4. **Encryption**: Use encrypted fields for sensitive data

## Troubleshooting

### Event Not Published

**Symptoms:** `success: false` with errors

**Solutions:**
1. Check field permissions and visibility
2. Validate required fields are provided
3. Verify platform event definition in Salesforce
4. Check API version compatibility

### Subscription Not Receiving Events

**Symptoms:** No events yielded from subscription

**Solutions:**
1. Verify channel name is correct
2. Check user has permission to receive events
3. Ensure events are being published
4. Validate replay ID is within retention window

### Session Expired

**Symptoms:** `TokenExpiredError` or `CometD session expired`

**Solutions:**
1. Reconnect with fresh authentication
2. Use automatic retry logic (built-in)
3. Implement reconnection handling

### Rate Limits Exceeded

**Symptoms:** 429 Too Many Requests

**Solutions:**
1. Use batch publishing to reduce API calls
2. Monitor hourly platform event limits
3. Implement backoff and retry logic (built-in)
4. Request limit increase from Salesforce

## Resources

- [Platform Events Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.platform_events.meta/platform_events/)
- [Pub/Sub API Guide](https://developer.salesforce.com/docs/platform/pub-sub-api/overview)
- [Streaming API Guide](https://developer.salesforce.com/docs/atlas.en-us.api_streaming.meta/api_streaming/)
- [Change Data Capture Guide](https://developer.salesforce.com/docs/atlas.en-us.change_data_capture.meta/change_data_capture/)

## License

See main project LICENSE file.
