# Qdrant Collection Client

The Collection module provides comprehensive collection management capabilities for Qdrant vector database.

## Features

- **Collection Management**: Create, delete, and update collections
- **Builder Pattern**: Fluent API for configuration
- **Multi-Vector Support**: Named vector spaces for multimodal data
- **Advanced Configuration**: HNSW indexing, quantization, sharding, replication
- **Type Safety**: Full TypeScript support with strict typing
- **Production Ready**: Proper error handling and validation

## Installation

```typescript
import { CollectionClient, Distance, CollectionConfig } from '@llm-devops/qdrant-integration/collection';
```

## Quick Start

### Creating a Simple Collection

```typescript
const collection = new CollectionClient(qdrantClient, 'my_collection');

await collection.create({
  vectors: {
    size: 384,
    distance: Distance.Cosine
  }
});
```

### Using the Builder Pattern

```typescript
const config = CollectionConfig.defaultWithSize(768)
  .withDistance(Distance.Cosine)
  .withHnsw(16, 200)
  .withScalarQuantization()
  .withOnDisk(true)
  .withReplicationFactor(2)
  .build();

await collection.create(config);
```

## API Reference

### CollectionClient

#### Constructor

```typescript
new CollectionClient(client: QdrantClientInterface, collectionName: string)
```

Creates a new collection client for managing a specific collection.

#### Methods

##### `create(config: CollectionConfig): Promise<void>`

Creates a new collection with the specified configuration.

```typescript
await collection.create({
  vectors: {
    size: 384,
    distance: Distance.Cosine,
    hnswConfig: { m: 16, efConstruct: 100 }
  },
  shardNumber: 2,
  replicationFactor: 2
});
```

##### `createWithNamedVectors(configs: Map<string, VectorConfig>): Promise<void>`

Creates a multi-vector collection with named vector spaces.

```typescript
await collection.createWithNamedVectors(
  new Map([
    ['text', { size: 384, distance: Distance.Cosine }],
    ['image', { size: 512, distance: Distance.Euclidean }]
  ])
);
```

##### `info(): Promise<CollectionInfo>`

Gets detailed information about the collection.

```typescript
const info = await collection.info();
console.log(`Points: ${info.pointsCount}, Status: ${info.status}`);
```

##### `exists(): Promise<boolean>`

Checks if the collection exists.

```typescript
if (await collection.exists()) {
  console.log('Collection exists');
}
```

##### `delete(): Promise<void>`

Deletes the collection permanently.

```typescript
await collection.delete();
```

##### `updateParams(params: UpdateParams): Promise<void>`

Updates collection parameters.

```typescript
await collection.updateParams({
  params: {
    replicationFactor: 3,
    writeConsistencyFactor: 'majority'
  }
});
```

### CollectionConfig Builder

The builder provides a fluent API for constructing collection configurations.

#### Factory Method

##### `CollectionConfig.defaultWithSize(size: number)`

Creates a builder with default configuration for the given vector size.

```typescript
const config = CollectionConfig.defaultWithSize(384);
```

#### Builder Methods

##### `withDistance(distance: Distance)`

Sets the distance metric.

```typescript
.withDistance(Distance.Euclidean)
```

Supported distance metrics:
- `Distance.Cosine` - Cosine similarity (default)
- `Distance.Euclidean` - L2 distance
- `Distance.Dot` - Dot product
- `Distance.Manhattan` - L1 distance

##### `withHnsw(m: number, efConstruct: number)`

Configures HNSW indexing parameters.

```typescript
.withHnsw(16, 200) // m=16, efConstruct=200
```

Parameters:
- `m` - Number of edges per node (default: 16)
- `efConstruct` - Size of dynamic candidate list (default: 100)

##### `withScalarQuantization(quantile?: number, alwaysRam?: boolean)`

Enables scalar quantization for compression.

```typescript
.withScalarQuantization(0.99, true)
```

##### `withProductQuantization(compression: string, alwaysRam?: boolean)`

Enables product quantization.

```typescript
.withProductQuantization('x16', false)
```

Compression options: `'x4'`, `'x8'`, `'x16'`, `'x32'`, `'x64'`

##### `withBinaryQuantization(alwaysRam?: boolean)`

Enables binary quantization.

```typescript
.withBinaryQuantization(true)
```

##### `withOnDisk(onDisk: boolean)`

Stores vectors on disk.

```typescript
.withOnDisk(true)
```

##### `withOnDiskPayload(onDiskPayload: boolean)`

Stores payload on disk.

```typescript
.withOnDiskPayload(true)
```

##### `withShardNumber(shardNumber: number)`

Sets the number of shards.

```typescript
.withShardNumber(4)
```

##### `withReplicationFactor(replicationFactor: number)`

Sets the replication factor.

```typescript
.withReplicationFactor(2)
```

##### `withWriteConsistency(factor: WriteConsistencyFactor)`

Sets write consistency factor.

```typescript
.withWriteConsistency('majority')
```

Options: number, `'majority'`, `'quorum'`, `'all'`

##### `withNamedVector(name: string, config: VectorConfig)`

Adds a named vector space (for multi-vector collections).

```typescript
.withNamedVector('text', { size: 384, distance: Distance.Cosine })
.withNamedVector('image', { size: 512, distance: Distance.Euclidean })
```

##### `build(): CollectionConfig`

Builds the final configuration object.

```typescript
const config = builder.build();
```

## Types

### Distance

```typescript
enum Distance {
  Cosine = 'Cosine',
  Euclidean = 'Euclidean',
  Dot = 'Dot',
  Manhattan = 'Manhattan'
}
```

### VectorConfig

```typescript
interface VectorConfig {
  size: number;
  distance: Distance;
  hnswConfig?: HnswConfig;
  quantizationConfig?: QuantizationConfig;
  onDisk?: boolean;
  datatype?: VectorDataType;
}
```

### CollectionInfo

```typescript
interface CollectionInfo {
  status: CollectionStatus;
  optimizerStatus: OptimizerStatus;
  vectorsCount?: number;
  indexedVectorsCount?: number;
  pointsCount: number;
  segmentsCount: number;
  config: { /* ... */ };
  payloadSchema?: Record<string, PayloadSchemaInfo>;
}
```

## Examples

### Example 1: Simple Collection

```typescript
const collection = new CollectionClient(client, 'embeddings');

await collection.create({
  vectors: {
    size: 384,
    distance: Distance.Cosine
  }
});
```

### Example 2: Optimized Collection

```typescript
const config = CollectionConfig.defaultWithSize(1536)
  .withDistance(Distance.Cosine)
  .withHnsw(32, 200)
  .withScalarQuantization(0.99)
  .withShardNumber(4)
  .withReplicationFactor(2)
  .build();

await collection.create(config);
```

### Example 3: Multi-Vector Collection

```typescript
await collection.createWithNamedVectors(
  new Map([
    ['text', {
      size: 384,
      distance: Distance.Cosine,
      hnswConfig: { m: 16, efConstruct: 100 }
    }],
    ['image', {
      size: 512,
      distance: Distance.Euclidean,
      quantizationConfig: {
        type: 'product',
        compression: 'x16'
      }
    }]
  ])
);
```

### Example 4: Collection with On-Disk Storage

```typescript
const config = CollectionConfig.defaultWithSize(768)
  .withDistance(Distance.Cosine)
  .withOnDisk(true)
  .withOnDiskPayload(true)
  .withHnsw(16, 100)
  .build();

await collection.create(config);
```

### Example 5: High-Performance Configuration

```typescript
const config = CollectionConfig.defaultWithSize(384)
  .withDistance(Distance.Dot)
  .withHnsw(32, 200)
  .withBinaryQuantization(true)
  .withShardNumber(8)
  .withReplicationFactor(3)
  .withWriteConsistency('quorum')
  .build();

await collection.create(config);
```

### Example 6: Check and Update Collection

```typescript
// Check if collection exists
if (await collection.exists()) {
  // Get current info
  const info = await collection.info();
  console.log(`Status: ${info.status}`);

  // Update parameters
  await collection.updateParams({
    params: {
      replicationFactor: 3
    }
  });
}
```

## REST API Mapping

The CollectionClient maps to the following Qdrant REST API endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `create()` | `PUT /collections/{name}` | Create collection |
| `info()` | `GET /collections/{name}` | Get collection info |
| `exists()` | `GET /collections/{name}/exists` | Check existence |
| `delete()` | `DELETE /collections/{name}` | Delete collection |
| `updateParams()` | `PATCH /collections/{name}` | Update parameters |

## Error Handling

The client throws errors for invalid operations:

```typescript
try {
  await collection.create(config);
} catch (error) {
  if (error.message.includes('already exists')) {
    console.log('Collection already exists');
  } else {
    console.error('Failed to create collection:', error);
  }
}
```

## Best Practices

1. **Use Builder Pattern**: For complex configurations, use the builder pattern for better readability
2. **Check Existence**: Always check if a collection exists before creating it
3. **Appropriate Quantization**: Use quantization for large-scale deployments to reduce memory usage
4. **Replication**: Use replication for high availability in production
5. **Sharding**: Use sharding for collections with millions of vectors
6. **On-Disk Storage**: Use on-disk storage for very large collections that don't fit in RAM

## Performance Considerations

### HNSW Parameters

- **m**: Higher values = better quality, more memory (typical: 16-64)
- **efConstruct**: Higher values = better quality, slower indexing (typical: 100-400)

### Quantization

- **Scalar**: Best for general use, 4x compression
- **Product**: Higher compression (up to 64x), slight quality loss
- **Binary**: Extreme compression (32x), best for high-dimensional vectors

### Sharding

Distribute data across multiple shards when:
- Collection has >10M vectors
- Need horizontal scaling
- Want to parallelize queries

### Replication

Use replication when:
- Need high availability
- Want read scalability
- Deploying in production

## License

MIT
