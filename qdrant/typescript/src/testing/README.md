# Qdrant Testing Module

Comprehensive mock client and test fixtures for testing Qdrant integrations.

## Overview

The testing module provides:
- **MockQdrantClient**: In-memory simulation of Qdrant operations
- **Test Fixtures**: Helper functions to generate test data
- **Operation Logging**: Track and assert on operations
- **Latency Simulation**: Simulate network delays

## Quick Start

```typescript
import {
  createMockQdrantClient,
  createTestPoints,
  createTestCollection,
} from './testing';

// Create mock client
const client = createMockQdrantClient();

// Create a collection
await createTestCollection(client, 'my_collection', {
  vectorSize: 128,
  distance: 'Cosine',
});

// Generate and insert test data
const points = createTestPoints(100, 128);
await client.collection('my_collection').upsert(points);

// Perform search
const results = await client.collection('my_collection').search({
  vector: points[0].vector as number[],
  limit: 10,
});
```

## MockQdrantClient

### Features

- ✅ In-memory storage for collections and points
- ✅ Full CRUD operations
- ✅ Search with multiple distance metrics
- ✅ Filter evaluation (must, should, must_not)
- ✅ Operation logging for testing
- ✅ Configurable latency simulation
- ✅ Event emission for monitoring

### Basic Usage

```typescript
const client = createMockQdrantClient();

// With simulated latency
const slowClient = createMockQdrantClient()
  .withSimulatedLatency(50, 10); // 50ms ± 10ms
```

## Collection Operations

### Create Collection

```typescript
await client.collection('test').create({
  vectorSize: 128,
  distance: 'Cosine',
  onDisk: false,
  hnswConfig: {
    m: 16,
    efConstruct: 100,
  },
});
```

### Multi-Vector Collections

```typescript
await client.collection('multi').create({
  vectors: {
    image: { size: 512, distance: 'Cosine' },
    text: { size: 768, distance: 'Dot' },
  },
});
```

### Collection Info

```typescript
const info = await client.collection('test').info();
// {
//   name: 'test',
//   status: 'green',
//   vectorsCount: 100,
//   pointsCount: 100,
//   segmentsCount: 1,
//   config: { ... }
// }
```

## Point Operations

### Upsert Points

```typescript
const points = createTestPoints(100, 128);
await client.collection('test').upsert(points);
```

### Get Points

```typescript
const points = await client.collection('test').get([1, 2, 3]);
```

### Delete Points

```typescript
// By IDs
await client.collection('test').delete([1, 2, 3]);

// By filter
await client.collection('test').deleteByFilter({
  must: [
    { key: 'category', match: { value: 'electronics' } },
  ],
});
```

### Scroll Points

```typescript
const result = await client.collection('test').scroll({
  limit: 50,
  filter: {
    must: [
      { key: 'price', range: { gte: 100, lte: 500 } },
    ],
  },
  withPayload: true,
  withVector: false,
});
```

### Count Points

```typescript
const count = await client.collection('test').count({
  must: [
    { key: 'category', match: { value: 'books' } },
  ],
});
```

## Search Operations

### Basic Search

```typescript
const results = await client.collection('test').search({
  vector: randomVector(128),
  limit: 10,
  withPayload: true,
  withVector: false,
});
```

### Search with Filters

```typescript
const results = await client.collection('test').search({
  vector: randomVector(128),
  limit: 10,
  filter: {
    must: [
      { key: 'category', match: { value: 'electronics' } },
      { key: 'price', range: { gte: 100, lte: 500 } },
    ],
    should: [
      { key: 'brand', match: { any: ['apple', 'samsung'] } },
    ],
  },
  scoreThreshold: 0.7,
});
```

### Batch Search

```typescript
const requests = [
  { vector: randomVector(128), limit: 5 },
  { vector: randomVector(128), limit: 5 },
  { vector: randomVector(128), limit: 5 },
];

const batchResults = await client.collection('test').searchBatch(requests);
// Returns: ScoredPoint[][]
```

## Distance Metrics

The mock client supports all Qdrant distance metrics:

### Cosine Similarity
```typescript
await client.collection('test').create({
  vectorSize: 128,
  distance: 'Cosine', // Range: [-1, 1], higher is better
});
```

### Euclidean Distance
```typescript
await client.collection('test').create({
  vectorSize: 128,
  distance: 'Euclidean', // Normalized: lower is better
});
```

### Dot Product
```typescript
await client.collection('test').create({
  vectorSize: 128,
  distance: 'Dot', // Higher is better
});
```

### Manhattan Distance
```typescript
await client.collection('test').create({
  vectorSize: 128,
  distance: 'Manhattan', // Normalized: lower is better
});
```

## Filters

### Match Filter

```typescript
// Exact match
{ key: 'category', match: { value: 'electronics' } }

// Match any
{ key: 'brand', match: { any: ['apple', 'samsung', 'sony'] } }
```

### Range Filter

```typescript
// Numeric range
{ key: 'price', range: { gte: 100, lte: 500 } }

// Greater than
{ key: 'rating', range: { gt: 4.0 } }

// Less than
{ key: 'age', range: { lt: 30 } }
```

### Has ID Filter

```typescript
{ hasId: [1, 2, 3, 4, 5] }
```

### Null/Empty Filters

```typescript
// Is null
{ key: 'field', isNull: true }

// Is not null
{ key: 'field', isNull: false }

// Is empty (undefined)
{ key: 'field', isEmpty: true }

// Exists (not undefined)
{ key: 'field', isEmpty: false }
```

### Nested Filter

```typescript
{
  nested: {
    key: 'items',
    filter: {
      must: [
        { key: 'price', range: { gte: 10, lte: 50 } },
      ],
    },
  },
}
```

### Boolean Combinations

```typescript
{
  must: [
    // All conditions must be true (AND)
    { key: 'category', match: { value: 'electronics' } },
    { key: 'inStock', match: { value: true } },
  ],
  should: [
    // At least one condition must be true (OR)
    { key: 'brand', match: { value: 'apple' } },
    { key: 'brand', match: { value: 'samsung' } },
  ],
  mustNot: [
    // All conditions must be false (NOT)
    { key: 'discontinued', match: { value: true } },
  ],
}
```

## Test Fixtures

### Random Vectors

```typescript
import { randomVector, normalizeVector } from './testing';

const vector = randomVector(128); // Random unit vector
const normalized = normalizeVector([1, 2, 3]); // Normalize any vector
```

### Test Points

```typescript
// Simple points
const points = createTestPoints(100, 128);

// Categorized points
const points = createCategorizedPoints(
  ['electronics', 'books', 'clothing'],
  50, // points per category
  128 // dimensions
);

// Time-series points
const points = createTimeSeriesPoints(
  100, // count
  128, // dimensions
  Date.now() - 86400000 // start time (24h ago)
);

// Similar points (for search testing)
const baseVector = randomVector(128);
const points = createSimilarPoints(baseVector, 10, 0.9); // 90% similar

// Clustered points
const points = createClusteredPoints(
  5,  // clusters
  20, // points per cluster
  128 // dimensions
);
```

### Multi-Vector Points

```typescript
const points = createMultiVectorPoints(100, {
  image: 512,
  text: 768,
  audio: 256,
});
```

### RAG Document Chunks

```typescript
const chunks = createDocumentChunks(
  10,  // documents
  20,  // chunks per document
  768  // dimensions
);

// Each chunk has:
// - documentId
// - chunkIndex
// - content
// - metadata.totalChunks
```

### Custom Payloads

```typescript
const points = createTestPoints(100, 128);
points.forEach((point, i) => {
  point.payload = {
    title: `Document ${i}`,
    category: 'custom',
    metadata: { /* ... */ },
  };
});
```

## Operation Logging

Track all operations for assertions:

```typescript
const client = createMockQdrantClient();

// Perform operations
await client.collection('test').create({ vectorSize: 128 });
await client.collection('test').upsert(points);

// Get operation log
const log = client.getOperationLog();
console.log(log);
// [
//   { type: 'collection.create', collection: 'test', timestamp: ..., params: ... },
//   { type: 'points.upsert', collection: 'test', timestamp: ..., params: ... },
// ]

// Assert operations
expect(log).toHaveLength(2);
expect(log[0].type).toBe('collection.create');
expect(log[1].params.pointCount).toBe(100);

// Clear log
client.clearOperationLog();
```

## Latency Simulation

Simulate network latency for realistic testing:

```typescript
// Fixed latency
const client = createMockQdrantClient()
  .withSimulatedLatency(50); // 50ms delay

// Variable latency
const client = createMockQdrantClient()
  .withSimulatedLatency(50, 20); // 50ms ± 20ms (30-70ms range)

// Measure performance
const start = Date.now();
await client.collection('test').search({ vector: randomVector(128), limit: 10 });
const duration = Date.now() - start;
console.log(`Search took ${duration}ms`); // ~50ms
```

## Event Monitoring

Listen to operations in real-time:

```typescript
const client = createMockQdrantClient();

client.on('operation', (op) => {
  console.log(`Operation: ${op.type} on ${op.collection}`);
});

await client.collection('test').create({ vectorSize: 128 });
// Logs: "Operation: collection.create on test"
```

## Performance Tracking

Use the PerformanceTracker for benchmarking:

```typescript
import { PerformanceTracker } from './testing';

const tracker = new PerformanceTracker();

// Measure operations
await tracker.measure('search', () =>
  client.collection('test').search({ vector: randomVector(128), limit: 10 })
);

await tracker.measure('search', () =>
  client.collection('test').search({ vector: randomVector(128), limit: 10 })
);

// Get statistics
const stats = tracker.getStats('search');
console.log(stats);
// {
//   count: 2,
//   min: 45.2,
//   max: 52.1,
//   avg: 48.65,
//   p50: 48.65,
//   p95: 52.1,
//   p99: 52.1
// }
```

## Assertions

Use built-in assertion helpers:

```typescript
import { assertions } from './testing';

const results = await client.collection('test').search({
  vector: randomVector(128),
  limit: 10,
  scoreThreshold: 0.7,
});

// Assert results are sorted
expect(assertions.resultsSorted(results)).toBe(true);

// Assert scores above threshold
expect(assertions.scoresAboveThreshold(results, 0.7)).toBe(true);

// Assert all results match condition
expect(
  assertions.allResultsMatch(results, 'category', 'electronics')
).toBe(true);
```

## Reset and Cleanup

```typescript
// Clear operation log only
client.clearOperationLog();

// Reset entire client (collections + operations)
client.reset();
```

## Complete Example

```typescript
import {
  createMockQdrantClient,
  createPopulatedCollection,
  createQueryVector,
  assertions,
} from './testing';

describe('Qdrant Search', () => {
  let client: MockQdrantClient;

  beforeEach(() => {
    client = createMockQdrantClient()
      .withSimulatedLatency(10, 5);
  });

  afterEach(() => {
    client.reset();
  });

  it('should find similar vectors', async () => {
    // Create and populate collection
    const points = await createPopulatedCollection(
      client,
      'test',
      100,
      128
    );

    // Search for similar points
    const queryVector = createQueryVector(points[0], 0.95);
    const results = await client.collection('test').search({
      vector: queryVector,
      limit: 5,
      scoreThreshold: 0.8,
    });

    // Assertions
    expect(results).toHaveLength(5);
    expect(results[0].id).toBe(points[0].id);
    expect(assertions.resultsSorted(results)).toBe(true);
    expect(assertions.scoresAboveThreshold(results, 0.8)).toBe(true);
  });

  it('should filter search results', async () => {
    await createPopulatedCollection(client, 'test', 100, 128);

    const results = await client.collection('test').search({
      vector: randomVector(128),
      limit: 10,
      filter: {
        must: [
          { key: 'category', match: { value: 'electronics' } },
          { key: 'price', range: { gte: 100, lte: 500 } },
        ],
      },
    });

    expect(
      assertions.allResultsMatch(results, 'category', 'electronics')
    ).toBe(true);

    results.forEach((result) => {
      expect(result.payload?.price).toBeGreaterThanOrEqual(100);
      expect(result.payload?.price).toBeLessThanOrEqual(500);
    });
  });
});
```

## Best Practices

1. **Use fixtures**: Leverage provided fixtures instead of creating data manually
2. **Reset between tests**: Always reset the client in `afterEach` hooks
3. **Simulate latency**: Add realistic latency for integration tests
4. **Log operations**: Use operation logging to verify correct API usage
5. **Test filters**: Extensively test filter combinations
6. **Benchmark**: Use PerformanceTracker to catch performance regressions
7. **Realistic data**: Use createDocumentChunks for RAG workflow testing

## Limitations

The mock client is designed for testing and has some intentional limitations:

- **No persistence**: Data is stored in memory only
- **No sharding**: All data is stored in a single "shard"
- **Simplified search**: Uses brute-force similarity calculation
- **No quantization**: Vector quantization is not simulated
- **No HNSW**: HNSW graph is not built (all searches are exhaustive)
- **No snapshots**: Snapshot operations are not supported

These limitations ensure the mock is simple, fast, and deterministic for testing.
