# Weaviate Batch Operations

Comprehensive batch operations module for the Weaviate TypeScript integration. Provides efficient, resilient, and observable batch processing with automatic chunking, parallel execution, retry logic, and progress tracking.

## Features

- **Automatic Chunking**: Splits large batches into manageable chunks
- **Parallel Execution**: Processes multiple chunks concurrently with configurable parallelism
- **Retry Logic**: Automatic retry for transient failures with exponential backoff
- **Progress Tracking**: Real-time progress updates during batch operations
- **Observability**: Full tracing, metrics, and logging integration
- **Resilience**: Circuit breaker, rate limiting, and degradation management
- **Type Safety**: Full TypeScript type definitions

## Quick Start

```typescript
import { BatchService } from './batch';

// Initialize the batch service
const batchService = new BatchService(
  transport,
  observability,
  resilience,
  {
    defaultBatchSize: 100,
    defaultMaxParallelism: 4
  }
);

// Batch create objects
const objects = [
  {
    className: 'Article',
    properties: {
      title: 'My Article',
      content: 'Article content...'
    },
    vector: [0.1, 0.2, 0.3, ...]
  },
  // ... more objects
];

const response = await batchService.batchCreate(objects, {
  batchSize: 100,
  maxParallelism: 4,
  onProgress: (current, total, successful, failed) => {
    console.log(`${current}/${total} completed`);
  }
});

console.log(`Created ${response.successful} objects`);
```

## API Reference

### BatchService

Main service class for batch operations.

#### Constructor

```typescript
new BatchService(
  transport: HttpTransport,
  observability: ObservabilityContext,
  resilience: ResilienceOrchestrator,
  config?: BatchServiceConfig
)
```

#### Methods

##### batchCreate()

Create multiple objects in a single batch operation.

```typescript
async batchCreate(
  objects: BatchObject[],
  options?: BatchOptions
): Promise<BatchResponse>
```

**Parameters:**
- `objects`: Array of objects to create
- `options`: Optional batch configuration
  - `batchSize`: Max objects per chunk (default: 100)
  - `maxParallelism`: Max concurrent requests (default: 4)
  - `continueOnError`: Continue on failures (default: false)
  - `onProgress`: Progress callback function
  - `consistencyLevel`: Consistency level for operations
  - `tenant`: Tenant name for multi-tenant collections

**Returns:**
- `BatchResponse` with success/failure counts and errors

**Example:**
```typescript
const response = await batchService.batchCreate(objects, {
  batchSize: 100,
  maxParallelism: 4,
  continueOnError: true,
  onProgress: (current, total, successful, failed) => {
    const percentage = Math.floor((current / total) * 100);
    console.log(`${percentage}% - ${successful} ok, ${failed} failed`);
  }
});
```

##### batchCreateWithRetry()

Create objects with automatic retry for failed items.

```typescript
async batchCreateWithRetry(
  objects: BatchObject[],
  options?: BatchRetryOptions
): Promise<BatchResult>
```

**Parameters:**
- `objects`: Array of objects to create
- `options`: Retry configuration
  - `maxRetries`: Max retry attempts (default: 3)
  - `initialDelayMs`: Initial retry delay (default: 1000ms)
  - `maxDelayMs`: Max retry delay (default: 30000ms)
  - `backoffMultiplier`: Backoff multiplier (default: 2)
  - `jitter`: Add random jitter (default: true)
  - Plus all `BatchOptions`

**Returns:**
- `BatchResult` with detailed retry information

**Example:**
```typescript
const result = await batchService.batchCreateWithRetry(objects, {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  jitter: true
});

console.log(`${result.successful} succeeded after ${result.attempts} attempts`);
```

##### batchDelete()

Delete objects matching a filter.

```typescript
async batchDelete(
  className: string,
  filter: WhereFilter,
  options?: BatchDeleteOptions
): Promise<BatchDeleteResponse>
```

**Parameters:**
- `className`: Name of the class
- `filter`: Filter to match objects for deletion
- `options`: Delete configuration
  - `dryRun`: Only count, don't delete (default: false)
  - `tenant`: Tenant name
  - `consistencyLevel`: Consistency level
  - `output`: Response detail level ('minimal' | 'verbose')

**Returns:**
- `BatchDeleteResponse` with matched/deleted counts

**Example:**
```typescript
// Dry run first
const dryRun = await batchService.batchDelete(
  'Article',
  { operator: 'Operand', operand: { path: ['status'], operator: 'Equal', value: 'archived' } },
  { dryRun: true }
);
console.log(`Would delete ${dryRun.matched} objects`);

// Actual deletion
const response = await batchService.batchDelete(
  'Article',
  { operator: 'Operand', operand: { path: ['status'], operator: 'Equal', value: 'archived' } },
  { dryRun: false }
);
console.log(`Deleted ${response.deleted} objects`);
```

##### batchUpdate()

Update multiple objects.

```typescript
async batchUpdate(
  objects: BatchUpdateObject[],
  options?: BatchOptions
): Promise<BatchResponse>
```

**Parameters:**
- `objects`: Array of update objects
- `options`: Batch configuration

**Returns:**
- `BatchResponse` with success/failure counts

**Example:**
```typescript
const updates = [
  {
    className: 'Article',
    id: '123e4567-e89b-12d3-a456-426614174000',
    properties: { status: 'published' },
    merge: true
  }
];

const response = await batchService.batchUpdate(updates, {
  batchSize: 50,
  continueOnError: true
});
```

### Utility Functions

#### Chunking

```typescript
import { chunkArray, createChunks, estimateBatchSize } from './batch';

// Split array into chunks
const chunks = chunkArray(objects, 100);

// Create chunks with metadata
const batchChunks = createChunks(objects, 100);

// Estimate batch size in bytes
const sizeBytes = estimateBatchSize(objects);
```

#### Progress Tracking

```typescript
import { BatchProgressTracker } from './batch';

const tracker = new BatchProgressTracker(1000, 10);

tracker.onProgress((current, total, successful, failed) => {
  console.log(`${current}/${total} - ${tracker.getPercentage()}%`);
  console.log(`Rate: ${tracker.getProcessingRate()} obj/sec`);
  console.log(`ETA: ${tracker.getEstimatedTimeRemainingMs()}ms`);
});

tracker.start();
tracker.updateProgress(100, 95, 5);
tracker.complete();
```

#### Retry Utilities

```typescript
import {
  isRetriableBatchError,
  extractFailedObjects,
  calculateRetryDelay
} from './batch';

// Check if error is retriable
if (isRetriableBatchError(error)) {
  const delay = calculateRetryDelay(attempt, 1000, 30000, 2, true);
  await new Promise(resolve => setTimeout(resolve, delay));
  // Retry...
}

// Extract failed objects for retry
const failedObjects = extractFailedObjects(response, originalObjects);
```

## Best Practices

### 1. Choose Appropriate Batch Size

```typescript
// Small objects (< 1KB each) - larger batches
await batchService.batchCreate(smallObjects, {
  batchSize: 200
});

// Large objects (> 10KB each) - smaller batches
await batchService.batchCreate(largeObjects, {
  batchSize: 25
});
```

### 2. Use Progress Tracking for Long Operations

```typescript
let lastLogTime = Date.now();

await batchService.batchCreate(objects, {
  onProgress: (current, total, successful, failed) => {
    const now = Date.now();
    // Log every 5 seconds
    if (now - lastLogTime > 5000) {
      console.log(`Progress: ${current}/${total} (${Math.floor(current/total*100)}%)`);
      lastLogTime = now;
    }
  }
});
```

### 3. Handle Errors Gracefully

```typescript
const response = await batchService.batchCreate(objects, {
  continueOnError: true
});

if (response.failed > 0 && response.errors) {
  // Log errors
  console.error(`${response.failed} objects failed:`);
  response.errors.forEach(error => {
    console.error(`  [${error.index}] ${error.errorMessage}`);
  });

  // Retry failed objects
  const failedObjects = extractFailedObjects(response, objects);
  // ... retry logic
}
```

### 4. Use Retry for Transient Failures

```typescript
// Automatic retry with exponential backoff
const result = await batchService.batchCreateWithRetry(objects, {
  maxRetries: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  continueOnError: true
});

// Only non-retriable errors remain
if (result.failed > 0) {
  console.error(`${result.failed} objects failed permanently`);
}
```

### 5. Optimize Parallelism

```typescript
// Low parallelism for large objects or shared resources
await batchService.batchCreate(largeObjects, {
  maxParallelism: 2
});

// High parallelism for small objects and good network
await batchService.batchCreate(smallObjects, {
  maxParallelism: 8
});
```

### 6. Multi-Tenant Operations

```typescript
// Batch operations for specific tenant
await batchService.batchCreate(objects, {
  tenant: 'tenant-123'
});

await batchService.batchDelete('Product', filter, {
  tenant: 'tenant-123'
});
```

## Error Handling

### Retriable vs Non-Retriable Errors

**Retriable Errors:**
- Timeout errors
- Connection errors
- Rate limit errors (429)
- Service unavailable (503)
- Internal server errors (500)

**Non-Retriable Errors:**
- Validation errors
- Invalid vector dimensions
- Class not found
- Authentication errors

### Error Recovery

```typescript
try {
  const response = await batchService.batchCreate(objects, {
    continueOnError: true
  });

  // Process partial success
  if (response.failed > 0) {
    // Retry failed objects
    const result = await batchService.batchCreateWithRetry(
      extractFailedObjects(response, objects).map(f => f.object),
      { maxRetries: 3 }
    );
  }
} catch (error) {
  // Handle complete failure
  console.error('Batch operation failed:', error);
}
```

## Performance Tips

1. **Batch Size**: Start with 100 and adjust based on object size
2. **Parallelism**: 4-8 concurrent requests works well for most cases
3. **Progress Callbacks**: Throttle logging to avoid performance impact
4. **Memory**: Process very large datasets in multiple batches
5. **Network**: Increase parallelism for high-latency networks

## Observability

All batch operations include:

- **Tracing**: Spans for batch operations with metadata
- **Metrics**: Success/failure counts, latency, throughput
- **Logging**: Operation start/complete, errors, summaries

```typescript
// Metrics recorded:
// - weaviate.batch.objects (successful count)
// - weaviate.batch.errors (error count)

// Spans created:
// - weaviate.batch_create
// - weaviate.batch_delete

// Logs generated:
// - Batch operation start
// - Progress updates
// - Completion summary
// - Error details
```

## See Also

- [SPARC Pseudocode](../../../plans/weaviate/pseudocode-weaviate.md) - Section 3: Batch Operations
- [Core Types](../types/batch.ts) - Batch type definitions
- [Examples](./examples.ts) - Working code examples
