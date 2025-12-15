# AWS CloudWatch Logs Batch Buffer

This module provides efficient batching of log events before sending to CloudWatch Logs.

## Features

- **Automatic Batching**: Buffers log events until reaching AWS limits (10,000 events or 1MB)
- **Auto-Flush**: Background timer flushes events at configurable intervals (default: 5s)
- **Size Calculation**: Accurately calculates event size including AWS overhead (26 bytes per event)
- **Sequence Token Management**: Handles deprecated sequence tokens for backward compatibility
- **Retry Logic**: Configurable retries with exponential backoff
- **Concurrent Flush Protection**: Prevents duplicate flushes for the same stream
- **Graceful Shutdown**: Ensures all buffered events are flushed before stopping

## Usage

### Basic Usage

```typescript
import { BatchBufferImpl } from './batch';
import type { FlushFunction } from './batch';

// Define your flush function (calls LogEventsService.put())
const flushFunction: FlushFunction = async (logGroup, logStream, events, sequenceToken) => {
  // Call CloudWatch Logs PutLogEvents API
  const response = await logEventsService.put({
    logGroupName: logGroup,
    logStreamName: logStream,
    logEvents: events,
    sequenceToken,
  });

  return { nextSequenceToken: response.nextSequenceToken };
};

// Create buffer with default configuration
const buffer = new BatchBufferImpl(flushFunction);

// Start background flush timer
buffer.start();

// Add events
await buffer.add('/app/logs', 'stream-1', {
  timestamp: Date.now(),
  message: 'Log message',
});

// Add structured events
await buffer.addStructured('/app/logs', 'stream-1', {
  level: 'info',
  message: 'User login',
  traceId: 'abc-123',
  requestId: 'req-456',
  fields: { userId: 'user-789' },
});

// Manual flush (optional)
await buffer.flush('/app/logs', 'stream-1');

// Get metrics
const metrics = buffer.getMetrics();
console.log(`Buffered: ${metrics.eventsBuffered} events, ${metrics.bytesBuffered} bytes`);

// Graceful shutdown
await buffer.stop();
```

### Custom Configuration

```typescript
import { BatchBufferImpl, DEFAULT_BATCH_CONFIG } from './batch';

const buffer = new BatchBufferImpl(flushFunction, {
  maxEvents: 5000,        // Flush after 5000 events (instead of 10000)
  maxBytes: 524288,       // Flush after 512KB (instead of 1MB)
  flushIntervalMs: 2000,  // Flush every 2s (instead of 5s)
  maxRetries: 5,          // Retry up to 5 times (instead of 3)
});
```

## Event Size Calculation

Events are sized according to AWS CloudWatch Logs specifications:

```
Event Size = UTF-8 bytes in message + 26 bytes overhead
```

The 26-byte overhead is a fixed cost per event added by CloudWatch Logs.

## Automatic Flushing

The buffer automatically flushes when:

1. **Event count limit**: Buffer reaches `maxEvents` (default: 10,000)
2. **Byte size limit**: Buffer reaches `maxBytes` (default: 1MB)
3. **Time interval**: Background timer triggers (default: 5 seconds)
4. **Manual flush**: `flush()` or `flushAll()` is called
5. **Shutdown**: `stop()` is called

## Error Handling

### Retryable Errors

The following errors trigger automatic retry with exponential backoff:
- `ThrottlingException`
- `ServiceUnavailableException`
- `InternalServerError`
- `RequestTimeoutException`
- `InvalidSequenceTokenException` (also invalidates sequence token)

### Non-Retryable Errors

The following errors fail immediately without retry:
- `InvalidParameterException`
- `ResourceNotFoundException`
- `ResourceAlreadyExistsException`
- `AccessDeniedException`
- `DataAlreadyAcceptedException`

Failed events are re-added to the buffer and `flushesFailed` metric is incremented.

## Metrics

The `getMetrics()` method returns:

```typescript
{
  eventsBuffered: number;    // Current events in buffer
  bytesBuffered: number;     // Current bytes in buffer
  flushesPending: number;    // Active flush operations
  flushesCompleted: number;  // Total successful flushes
  flushesFailed: number;     // Total failed flushes
}
```

## Sequence Token Management

Although sequence tokens are deprecated in newer AWS SDK versions, this implementation includes a `SequenceTokenManager` for backward compatibility:

```typescript
import { SequenceTokenManager } from './batch';

const manager = new SequenceTokenManager();

// Set token after successful PutLogEvents
manager.setToken('/app/logs', 'stream-1', 'token-xyz');

// Get token for next request
const token = manager.getToken('/app/logs', 'stream-1');

// Invalidate on error
manager.invalidateToken('/app/logs', 'stream-1');
```

## Architecture

### Buffer Structure

```
Buffer (Map)
└── Log Group (Map)
    ├── Log Stream 1 (StreamBuffer)
    │   ├── events: InputLogEvent[]
    │   └── bytes: number
    ├── Log Stream 2 (StreamBuffer)
    │   └── ...
    └── ...
```

### Flush Process

1. Lock stream to prevent concurrent flushes
2. Extract and sort events by timestamp
3. Clear buffer immediately (prevents blocking new adds)
4. Retrieve sequence token
5. Call flush function with retry logic
6. Update sequence token on success
7. Re-buffer events on failure

### Concurrency

- **Add operations**: Can run concurrently (buffer is isolated per stream)
- **Flush operations**: Serialized per stream using flush lock
- **Background timer**: Runs independently, errors are logged but don't throw

## Testing

See the tests in `/tests/unit/batch/` for comprehensive examples:

- `buffer.test.ts` - Buffer operations, auto-flush, metrics
- `sequencing.test.ts` - Sequence token management
- `config.test.ts` - Configuration validation

## AWS Limits

CloudWatch Logs enforces these limits (as of 2024):

- **Max events per request**: 10,000
- **Max request size**: 1,048,576 bytes (1MB)
- **Max event size**: 256KB (not enforced by buffer, should be validated before adding)
- **Event timestamp**: Within ±14 days, not more than 2 hours in future

The buffer respects the first two limits automatically.
