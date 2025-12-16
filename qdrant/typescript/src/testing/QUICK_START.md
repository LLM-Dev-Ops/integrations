# Quick Start Guide

## Installation

```typescript
import {
  createMockQdrantClient,
  createTestPoints,
  createTestCollection,
} from './testing';
```

## 5-Minute Tutorial

### 1. Create a Mock Client

```typescript
const client = createMockQdrantClient();
```

### 2. Create a Collection

```typescript
await client.collection('my_collection').create({
  vectorSize: 128,
  distance: 'Cosine',
});
```

### 3. Insert Data

```typescript
// Generate test points
const points = createTestPoints(100, 128);

// Insert into collection
await client.collection('my_collection').upsert(points);
```

### 4. Search

```typescript
// Basic search
const results = await client.collection('my_collection').search({
  vector: points[0].vector as number[],
  limit: 10,
});

console.log(`Found ${results.length} results`);
console.log(`Top result score: ${results[0].score}`);
```

### 5. Filter Search

```typescript
const results = await client.collection('my_collection').search({
  vector: randomVector(128),
  limit: 10,
  filter: {
    must: [
      { key: 'category', match: { value: 'electronics' } },
      { key: 'price', range: { gte: 100, lte: 500 } },
    ],
  },
});
```

## Common Patterns

### Testing with Jest/Vitest

```typescript
import { createMockQdrantClient, MockQdrantClient } from './testing';

describe('My Feature', () => {
  let client: MockQdrantClient;

  beforeEach(() => {
    client = createMockQdrantClient();
  });

  afterEach(() => {
    client.reset();
  });

  it('should search vectors', async () => {
    // Setup
    await client.collection('test').create({ vectorSize: 128 });
    const points = createTestPoints(50, 128);
    await client.collection('test').upsert(points);

    // Execute
    const results = await client.collection('test').search({
      vector: points[0].vector as number[],
      limit: 5,
    });

    // Assert
    expect(results).toHaveLength(5);
    expect(results[0].id).toBe(points[0].id);
  });
});
```

### RAG Workflow Testing

```typescript
import { createDocumentChunks } from './testing';

// Create document chunks
const chunks = createDocumentChunks(
  5,   // 5 documents
  10,  // 10 chunks each
  768  // 768 dimensions (e.g., OpenAI embeddings)
);

// Create collection and insert
await client.collection('documents').create({ vectorSize: 768 });
await client.collection('documents').upsert(chunks);

// Search for relevant chunks
const results = await client.collection('documents').search({
  vector: queryEmbedding,
  limit: 5,
  filter: {
    must: [
      { key: 'documentId', match: { value: 'doc-1' } },
    ],
  },
});

// Get surrounding context
const chunkIndex = results[0].payload?.chunkIndex as number;
const context = await client.collection('documents').scroll({
  filter: {
    must: [
      { key: 'documentId', match: { value: 'doc-1' } },
      { key: 'chunkIndex', range: { gte: chunkIndex - 2, lte: chunkIndex + 2 } },
    ],
  },
});
```

### Operation Logging for Debugging

```typescript
const client = createMockQdrantClient();

// Do operations
await client.collection('test').create({ vectorSize: 128 });
await client.collection('test').upsert(points);
await client.collection('test').search({ vector: randomVector(128), limit: 10 });

// Check what happened
const log = client.getOperationLog();
log.forEach(op => {
  console.log(`${op.type} at ${op.timestamp}`, op.params);
});
```

### Latency Testing

```typescript
const client = createMockQdrantClient()
  .withSimulatedLatency(50, 10); // 50ms ± 10ms

const start = Date.now();
await client.collection('test').search({
  vector: randomVector(128),
  limit: 10,
});
const duration = Date.now() - start;

console.log(`Search took ${duration}ms`); // ~50ms
```

### Performance Benchmarking

```typescript
import { PerformanceTracker } from './testing';

const tracker = new PerformanceTracker();

// Benchmark search operations
for (let i = 0; i < 100; i++) {
  await tracker.measure('search', () =>
    client.collection('test').search({
      vector: randomVector(128),
      limit: 10,
    })
  );
}

// Get statistics
const stats = tracker.getStats('search');
console.log(`Average: ${stats.avg.toFixed(2)}ms`);
console.log(`P95: ${stats.p95.toFixed(2)}ms`);
console.log(`P99: ${stats.p99.toFixed(2)}ms`);
```

## API Cheat Sheet

### Client Operations
```typescript
createMockQdrantClient()                    // Create client
client.withSimulatedLatency(baseMs, variance) // Add latency
client.collection(name)                     // Get collection client
client.listCollections()                    // List all collections
client.healthCheck()                        // Health check
client.getOperationLog()                    // Get operation log
client.clearOperationLog()                  // Clear log
client.reset()                              // Reset everything
```

### Collection Operations
```typescript
collection.create(config)                   // Create collection
collection.info()                           // Get collection info
collection.exists()                         // Check if exists
collection.delete()                         // Delete collection
```

### Point Operations
```typescript
collection.upsert(points)                   // Insert/update points
collection.get(ids)                         // Get points by IDs
collection.delete(ids)                      // Delete points by IDs
collection.deleteByFilter(filter)           // Delete by filter
collection.scroll(options)                  // Scroll through points
collection.count(filter)                    // Count points
```

### Search Operations
```typescript
collection.search(request)                  // Vector search
collection.searchBatch(requests)            // Batch search
```

### Fixtures
```typescript
randomVector(dimensions)                    // Random vector
createTestPoints(count, dimensions)         // Test points
createCategorizedPoints(cats, count, dim)   // Categorized points
createDocumentChunks(docs, chunks, dim)     // Document chunks
createTestCollection(client, name, config)  // Create & configure
createPopulatedCollection(client, name, n)  // Create & populate
```

### Filter Examples
```typescript
// Exact match
{ key: 'category', match: { value: 'electronics' } }

// Match any
{ key: 'brand', match: { any: ['apple', 'samsung'] } }

// Range
{ key: 'price', range: { gte: 100, lte: 500 } }

// Has ID
{ hasId: [1, 2, 3] }

// Null check
{ key: 'field', isNull: true }

// Complex filter
{
  must: [/* all must be true */],
  should: [/* at least one true */],
  mustNot: [/* all must be false */]
}
```

## Tips

1. Always call `client.reset()` in `afterEach` to avoid test pollution
2. Use `createPopulatedCollection()` to quickly setup test data
3. Enable latency simulation for integration tests
4. Use operation logging to verify API calls
5. Use assertions helpers for cleaner test code
6. Generate similar vectors to test ranking
7. Use document chunks for RAG workflow testing

## Full Example

```typescript
import {
  createMockQdrantClient,
  createPopulatedCollection,
  createQueryVector,
  assertions,
} from './testing';

describe('Vector Search', () => {
  let client;

  beforeEach(() => {
    client = createMockQdrantClient();
  });

  afterEach(() => {
    client.reset();
  });

  it('finds similar vectors', async () => {
    // Setup: Create collection with 100 points
    const points = await createPopulatedCollection(
      client,
      'test',
      100,
      128
    );

    // Execute: Search for similar vectors
    const query = createQueryVector(points[0], 0.95);
    const results = await client.collection('test').search({
      vector: query,
      limit: 5,
      scoreThreshold: 0.8,
    });

    // Assert: Verify results
    expect(results).toHaveLength(5);
    expect(results[0].id).toBe(points[0].id);
    expect(assertions.resultsSorted(results)).toBe(true);
    expect(assertions.scoresAboveThreshold(results, 0.8)).toBe(true);
  });
});
```

## Next Steps

- Read [README.md](./README.md) for detailed documentation
- Check [example.test.ts](./example.test.ts) for comprehensive examples
- See [FEATURES.md](./FEATURES.md) for implementation details
