# Qdrant Point Operations Module

Comprehensive point operations for managing vectors in Qdrant collections.

## Overview

The Point Operations module provides production-ready functionality for:

- **Upsert Operations**: Insert or update points (vectors) in collections
- **Batch Processing**: Efficiently process large datasets with adaptive batch sizing and parallel execution
- **Point Retrieval**: Get points by ID with optional payload and vector data
- **Deletion**: Delete points by ID or using complex filters
- **Scrolling**: Paginate through large result sets
- **Counting**: Count points matching filters

## Features

### 🚀 Performance

- **Adaptive Batch Sizing**: Automatically adjusts batch size based on success/failure rates
- **Concurrent Processing**: Process multiple batches in parallel with semaphore-based concurrency control
- **Progress Tracking**: Real-time callbacks for monitoring batch operations

### 🎯 Type Safety

- Full TypeScript type definitions
- Compile-time type checking
- Type guards for vector types (dense, sparse, named)

### 🔧 Flexibility

- Support for multiple vector types:
  - Dense vectors (number arrays)
  - Sparse vectors (indices + values)
  - Named vectors (multiple vectors per point)
- Complex filtering with must/should/must_not logic
- Geo-location filtering (radius and bounding box)
- Range queries and payload matching

## Installation

```bash
npm install @llm-devops/qdrant-integration
```

## Quick Start

```typescript
import { createPointsClient } from '@llm-devops/qdrant-integration/points';

// Create client
const client = createPointsClient({
  httpClient: myHttpClient,
  collectionName: 'my_collection'
});

// Upsert points
const result = await client.upsert([
  {
    id: 1,
    vector: [0.1, 0.2, 0.3, 0.4],
    payload: { title: 'Document 1' }
  }
]);

// Get points
const points = await client.get([1, 2, 3]);

// Scroll with filter
const results = await client.scroll({
  filter: {
    must: [
      { key: 'category', match: { value: 'news' } }
    ]
  },
  limit: 20
});
```

## API Reference

### PointsClient

Main client for point operations.

#### Constructor

```typescript
new PointsClient(config: PointsClientConfig)
```

**Config Options:**
- `httpClient`: HTTP client for making requests
- `collectionName`: Name of the collection
- `baseUrl?`: Optional base URL override
- `timeout?`: Request timeout in milliseconds

#### Methods

##### upsert(points: Point[]): Promise<UpsertResult>

Insert or update points in the collection.

```typescript
const result = await client.upsert([
  {
    id: 1,
    vector: [0.1, 0.2, 0.3],
    payload: { name: 'Item 1' }
  }
]);
```

##### upsertBatch(points: Point[], batchSize?: number, options?: BatchOptions): Promise<BatchUpsertResult>

Batch upsert with parallel processing and progress tracking.

```typescript
const result = await client.upsertBatch(largeArray, 100, {
  maxConcurrency: 5,
  onProgress: (processed, total) => {
    console.log(`${processed}/${total}`);
  }
});
```

**Options:**
- `batchSize`: Number of points per batch (default: 100)
- `maxConcurrency`: Max parallel batches (default: 5)
- `onProgress`: Progress callback
- `onBatchComplete`: Batch completion callback
- `onBatchError`: Error callback

##### get(ids: PointId[], withPayload?: boolean, withVectors?: boolean): Promise<Point[]>

Retrieve points by their IDs.

```typescript
// Get with payload and vectors
const points = await client.get([1, 2, 3]);

// Get payload only
const payloads = await client.get([1, 2, 3], true, false);
```

##### delete(ids: PointId[]): Promise<DeleteResult>

Delete points by ID.

```typescript
const result = await client.delete([1, 2, 3]);
```

##### deleteByFilter(filter: Filter): Promise<DeleteResult>

Delete points matching a filter.

```typescript
const result = await client.deleteByFilter({
  must: [
    { key: 'status', match: { value: 'inactive' } }
  ]
});
```

##### scroll(options: ScrollOptions): Promise<ScrollResult>

Scroll through points with pagination.

```typescript
// First page
const page1 = await client.scroll({ limit: 10 });

// Next page
const page2 = await client.scroll({
  limit: 10,
  offset: page1.nextOffset
});

// With filter
const filtered = await client.scroll({
  filter: {
    must: [
      { key: 'category', match: { value: 'news' } }
    ]
  },
  limit: 20,
  orderBy: {
    key: 'published_date',
    direction: 'desc'
  }
});
```

**Options:**
- `filter?`: Filter condition
- `limit?`: Max results (default: 10)
- `offset?`: Pagination offset
- `withPayload?`: Include payload (default: true)
- `withVectors?`: Include vectors (default: false)
- `orderBy?`: Sort order

##### count(filter?: Filter): Promise<number>

Count points matching a filter.

```typescript
// Count all
const total = await client.count();

// Count with filter
const active = await client.count({
  must: [
    { key: 'status', match: { value: 'active' } }
  ]
});
```

## Types

### Point

```typescript
interface Point {
  id: PointId;              // string or number
  vector: Vector;           // Dense, sparse, or named vectors
  payload?: Payload;        // Optional metadata
}
```

### Vector Types

```typescript
// Dense vector
type DenseVector = number[];

// Sparse vector
interface SparseVector {
  indices: number[];
  values: number[];
}

// Named vectors
type NamedVectors = Record<string, number[]>;

// Union type
type Vector = DenseVector | SparseVector | NamedVectors;
```

### Filter

```typescript
interface Filter {
  must?: FilterCondition[];      // AND logic
  should?: FilterCondition[];    // OR logic
  must_not?: FilterCondition[];  // NOT logic
}

interface FilterCondition {
  key: string;
  match?: { value: unknown };
  range?: {
    gt?: number;
    gte?: number;
    lt?: number;
    lte?: number;
  };
  geo_radius?: {
    center: { lon: number; lat: number };
    radius: number;
  };
  geo_bounding_box?: {
    top_left: { lon: number; lat: number };
    bottom_right: { lon: number; lat: number };
  };
}
```

## Advanced Usage

### Adaptive Batch Processing

The batch processor automatically adjusts batch size based on performance:

```typescript
import { BatchProcessor } from '@llm-devops/qdrant-integration/points';

const processor = new BatchProcessor(
  (points) => client.upsert(points)
);

const result = await processor.processBatches(largeArray, {
  batchSize: 100,
  maxConcurrency: 5
});
```

**Adaptive Sizing Logic:**
- High success rate (>95%): Increases batch size by 1.5x
- Lower success rate (<80%): Decreases batch size by 0.7x
- Automatically stays within min/max bounds (10-1000)

### Batch Processing with Retry

```typescript
const result = await processor.processBatchesWithRetry(points, {
  batchSize: 100,
  maxConcurrency: 5,
  maxRetries: 3
});
```

Features:
- Exponential backoff between retries
- Partial success handling
- Detailed error reporting

### Complex Filtering

```typescript
// Multi-condition filter
const filter: Filter = {
  must: [
    { key: 'category', match: { value: 'news' } },
    { key: 'views', range: { gte: 100, lte: 1000 } }
  ],
  should: [
    { key: 'featured', match: { value: true } },
    { key: 'trending', match: { value: true } }
  ],
  must_not: [
    { key: 'status', match: { value: 'archived' } }
  ]
};

const results = await client.scroll({ filter, limit: 50 });
```

### Geo-Location Queries

```typescript
// Radius search
const nearby = await client.scroll({
  filter: {
    must: [
      {
        key: 'location',
        geo_radius: {
          center: { lon: -122.4194, lat: 37.7749 },
          radius: 5000  // 5km
        }
      }
    ]
  }
});

// Bounding box search
const inBox = await client.scroll({
  filter: {
    must: [
      {
        key: 'location',
        geo_bounding_box: {
          top_left: { lon: -122.5, lat: 37.8 },
          bottom_right: { lon: -122.3, lat: 37.7 }
        }
      }
    ]
  }
});
```

### Type Guards

```typescript
import { isSparseVector, isNamedVector, isDenseVector } from '@llm-devops/qdrant-integration/points';

if (isDenseVector(point.vector)) {
  console.log('Dense vector:', point.vector.length);
}

if (isSparseVector(point.vector)) {
  console.log('Sparse vector:', point.vector.indices.length);
}

if (isNamedVector(point.vector)) {
  console.log('Named vectors:', Object.keys(point.vector));
}
```

## REST API Mappings

| Method | REST Endpoint | HTTP Method |
|--------|---------------|-------------|
| `upsert()` | `/collections/{name}/points` | PUT |
| `get()` | `/collections/{name}/points` | POST |
| `delete()` | `/collections/{name}/points/delete` | POST |
| `deleteByFilter()` | `/collections/{name}/points/delete` | POST |
| `scroll()` | `/collections/{name}/points/scroll` | POST |
| `count()` | `/collections/{name}/points/count` | POST |

## Error Handling

```typescript
try {
  await client.upsert(points);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid input:', error.message);
  } else if (error instanceof NetworkError) {
    console.error('Network issue:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Best Practices

### 1. Batch Size Selection

- **Small datasets (<1000)**: Use single `upsert()`
- **Medium datasets (1K-100K)**: Use `upsertBatch()` with 100-500 batch size
- **Large datasets (>100K)**: Use `upsertBatch()` with adaptive sizing

### 2. Concurrency Tuning

- **Local Qdrant**: Use higher concurrency (10-20)
- **Cloud Qdrant**: Use moderate concurrency (3-7)
- **Rate-limited API**: Use low concurrency (1-3)

### 3. Memory Management

```typescript
// Process in chunks to avoid memory issues
const CHUNK_SIZE = 10000;

for (let i = 0; i < allPoints.length; i += CHUNK_SIZE) {
  const chunk = allPoints.slice(i, i + CHUNK_SIZE);
  await client.upsertBatch(chunk, 100);
}
```

### 4. Progress Monitoring

```typescript
let totalProcessed = 0;

await client.upsertBatch(points, 100, {
  onProgress: (processed, total) => {
    totalProcessed = processed;
    // Update UI or log
  },
  onBatchError: (index, error) => {
    // Log or retry failed batch
  }
});
```

## Performance Tips

1. **Disable vectors in scroll** when only payload is needed
2. **Use filters** instead of retrieving and filtering client-side
3. **Adjust batch size** based on network latency and payload size
4. **Enable concurrency** for batch operations on large datasets
5. **Use count()** before large scroll operations to estimate pagination

## Examples

See the [examples](../../examples/points-example.ts) directory for complete working examples.

## License

MIT
