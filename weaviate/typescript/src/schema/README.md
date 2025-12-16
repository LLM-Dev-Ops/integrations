# Weaviate Schema Module

Comprehensive schema introspection for the Weaviate TypeScript integration. This module provides read-only access to Weaviate schema information with intelligent caching and error handling.

## Features

- **Schema Introspection**: Get complete schema or individual class definitions
- **Smart Caching**: TTL-based cache with automatic invalidation on schema errors
- **Shard Information**: Retrieve shard status and statistics
- **Type-Safe Parsing**: Robust parsing of Weaviate API responses
- **Helper Utilities**: Convenient functions for working with schemas
- **Error Handling**: Automatic cache invalidation and retry logic

## Installation

```typescript
import {
  SchemaService,
  SchemaCache,
  createSchemaSetup,
} from '@weaviate/schema';
```

## Quick Start

### Basic Usage

```typescript
import { createTransport } from '@weaviate/transport';
import { createObservability } from '@weaviate/observability';
import { createSchemaSetup } from '@weaviate/schema';

// Create dependencies
const transport = createTransport(baseUrl, authProvider);
const observability = createObservability();

// Create schema service with cache
const { service, cache } = createSchemaSetup(transport, observability);

// Get full schema
const schema = await service.getSchema();
console.log(`Found ${schema.classes.length} classes`);

// Get specific class (uses cache)
const articleClass = await cache.getClass('Article');
console.log(`Article has ${articleClass.properties.length} properties`);
```

### With Custom Cache TTL

```typescript
// Create with 1-minute cache TTL
const { service, cache } = createSchemaSetup(
  transport,
  observability,
  60 // 60 seconds
);

// Fast-changing schemas
const fastCache = new SchemaCache(service, 30); // 30 seconds

// Stable schemas
const longCache = new SchemaCache(service, 3600); // 1 hour
```

## Core Components

### SchemaService

Main service for fetching schema information from Weaviate.

```typescript
const service = new SchemaService(transport, observability);

// Get complete schema
const schema = await service.getSchema();

// Get specific class
const classDef = await service.getClass('Article');
if (classDef) {
  console.log(`Vectorizer: ${classDef.vectorizer}`);
  console.log(`Properties: ${classDef.properties.length}`);
}

// List all classes
const classes = await service.listClasses();
console.log('Available classes:', classes);

// Get shard information
const shards = await service.getShards('Article');
for (const shard of shards) {
  console.log(`Shard ${shard.name}: ${shard.objectCount} objects`);
}
```

### SchemaCache

Intelligent caching layer with TTL and manual invalidation.

```typescript
const cache = new SchemaCache(service, 300); // 5-minute TTL

// Get cached or fetch
const classDef = await cache.getClass('Article');

// Invalidate on schema change
cache.invalidate('Article');

// Invalidate all
cache.invalidateAll();

// Get cached class names
const cachedClasses = cache.getCachedClasses();

// Check cache performance
const stats = cache.getStats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
console.log(`Cache size: ${stats.size}`);
console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);
```

## Working with Class Definitions

### Inspecting Properties

```typescript
import {
  isTextProperty,
  isReferenceProperty,
  isArrayProperty,
  findProperty,
} from '@weaviate/schema';

const classDef = await cache.getClass('Article');

// Find specific property
const titleProp = findProperty(classDef, 'title');
if (titleProp) {
  console.log(`Title is searchable: ${titleProp.indexSearchable}`);
}

// Filter by property type
for (const prop of classDef.properties) {
  if (isTextProperty(prop)) {
    console.log(`Text property: ${prop.name} (${prop.tokenization})`);
  }
  if (isReferenceProperty(prop)) {
    console.log(`Reference: ${prop.name} -> ${prop.dataType[0]}`);
  }
  if (isArrayProperty(prop)) {
    const baseType = getBaseDataType(prop);
    console.log(`Array: ${prop.name}: ${baseType}[]`);
  }
}
```

### Using Helper Functions

```typescript
import {
  getTextProperties,
  getReferenceProperties,
  getSearchableProperties,
  getFilterableProperties,
  hasVectorizer,
  getVectorizerModule,
  isMultiTenancyEnabled,
} from '@weaviate/schema';

const classDef = await cache.getClass('Article');

// Get properties by type
const textProps = getTextProperties(classDef);
const refProps = getReferenceProperties(classDef);
const searchable = getSearchableProperties(classDef);
const filterable = getFilterableProperties(classDef);

// Check vectorization
if (hasVectorizer(classDef)) {
  const vectorizer = getVectorizerModule(classDef);
  console.log(`Automatic vectorization: ${vectorizer}`);
} else {
  console.log('Manual vectors required');
}

// Check multi-tenancy
if (isMultiTenancyEnabled(classDef)) {
  console.log('Multi-tenancy enabled - tenant parameter required');
}

// Check configuration
const replicationFactor = getReplicationFactor(classDef);
const distanceMetric = getDistanceMetric(classDef);
console.log(`Replication: ${replicationFactor}x`);
console.log(`Distance metric: ${distanceMetric}`);
```

## Error Handling

### Automatic Cache Invalidation

```typescript
import {
  withSchemaRefresh,
  invalidateCacheOnError,
} from '@weaviate/schema';

// Automatic retry with cache invalidation
try {
  const result = await withSchemaRefresh(
    cache,
    'Article',
    async () => {
      const schema = await cache.getClass('Article');
      return validateObject(object, schema);
    }
  );
} catch (error) {
  console.error('Validation failed:', error);
}

// Manual cache invalidation on errors
try {
  await createObject(client, className, properties);
} catch (error) {
  invalidateCacheOnError(cache, error as WeaviateError, className);
  throw error;
}
```

### Handling Schema Errors

```typescript
import {
  isSchemaError,
  extractClassNameFromError,
} from '@weaviate/schema';

try {
  await operation();
} catch (error) {
  if (isSchemaError(error as WeaviateError)) {
    const className = extractClassNameFromError(error as WeaviateError);
    console.log(`Schema error for class: ${className}`);
    cache.invalidate(className);
  }
}
```

## Shard Information

```typescript
// Get shard details
const shards = await service.getShards('Article');

console.log(`Total shards: ${shards.length}`);

for (const shard of shards) {
  console.log(`\nShard: ${shard.name}`);
  console.log(`  Status: ${shard.status}`);
  console.log(`  Objects: ${shard.objectCount}`);
  console.log(`  Vector indexing: ${shard.vectorIndexingStatus}`);

  if (shard.vectorQueueLength !== undefined) {
    console.log(`  Vector queue: ${shard.vectorQueueLength}`);
  }

  if (shard.compressed) {
    console.log('  Compression: enabled');
  }
}

// Calculate total objects across shards
const totalObjects = shards.reduce((sum, s) => sum + s.objectCount, 0);
console.log(`\nTotal objects: ${totalObjects}`);
```

## Advanced Usage

### Cache Monitoring

```typescript
// Monitor cache performance
setInterval(() => {
  const stats = cache.getStats();
  console.log('Cache Stats:', {
    size: stats.size,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
  });

  // Warn on low hit rate
  if (stats.hitRate < 0.5 && stats.hits + stats.misses > 100) {
    console.warn('Low cache hit rate - consider increasing TTL');
  }
}, 60000); // Every minute

// Periodic cleanup
setInterval(() => {
  const removed = cache.cleanup();
  if (removed > 0) {
    console.log(`Cleaned up ${removed} expired cache entries`);
  }
}, 300000); // Every 5 minutes
```

### Batch Cache Invalidation

```typescript
import { batchInvalidateCache } from '@weaviate/schema';

// After bulk schema operations
batchInvalidateCache(cache, ['Article', 'Author', 'Category']);

// Or invalidate all
cache.invalidateAll();
```

### Custom Error Handling

```typescript
import {
  createSchemaValidationError,
  conditionallyInvalidateCache,
} from '@weaviate/schema';

// Create detailed validation errors
if (typeof value !== 'string') {
  throw createSchemaValidationError(
    'Article',
    'title',
    'text',
    typeof value
  );
}

// Smart cache invalidation
try {
  await operation();
} catch (error) {
  const invalidated = conditionallyInvalidateCache(
    cache,
    error as WeaviateError,
    'Article'
  );

  if (invalidated) {
    console.log('Cache invalidated due to schema error');
  }

  throw error;
}
```

## Parsing API Responses

```typescript
import {
  parseSchema,
  parseClassDefinition,
  parsePropertyDefinition,
  parseShardInfo,
} from '@weaviate/schema';

// Parse raw API responses
const response = await fetch('/v1/schema');
const data = await response.json();
const schema = parseSchema(data);

// Parse individual class
const classResponse = await fetch('/v1/schema/Article');
const classData = await classResponse.json();
const classDef = parseClassDefinition(classData);
```

## Type Exports

All schema-related types are re-exported for convenience:

```typescript
import type {
  Schema,
  ClassDefinition,
  PropertyDefinition,
  VectorIndexConfig,
  InvertedIndexConfig,
  ReplicationConfig,
  ShardingConfig,
  MultiTenancyConfig,
  ShardInfo,
  CacheStats,
} from '@weaviate/schema';

import { Tokenization, ShardStatus } from '@weaviate/schema';
```

## Best Practices

### 1. Use Caching for Performance

```typescript
// Always use cache for repeated access
const cache = new SchemaCache(service, 300);

// Good: Uses cache
const classDef = await cache.getClass('Article');

// Avoid: Direct service calls in hot paths
// const classDef = await service.getClass('Article');
```

### 2. Choose Appropriate TTL

```typescript
// Frequently changing schemas
const devCache = new SchemaCache(service, 60); // 1 minute

// Production schemas (rarely change)
const prodCache = new SchemaCache(service, 3600); // 1 hour

// Default (good for most cases)
const defaultCache = new SchemaCache(service, 300); // 5 minutes
```

### 3. Monitor Cache Performance

```typescript
// Log cache stats periodically
const stats = cache.getStats();
if (stats.hitRate < 0.7) {
  console.warn('Consider increasing cache TTL');
}
```

### 4. Handle Schema Changes Gracefully

```typescript
// Use withSchemaRefresh for operations that depend on schema
const result = await withSchemaRefresh(cache, 'Article', async () => {
  const schema = await cache.getClass('Article');
  return performOperation(schema);
});
```

### 5. Cleanup Expired Entries

```typescript
// Periodic cleanup to free memory
setInterval(() => cache.cleanup(), 300000); // Every 5 minutes
```

## Error Types

The module throws these error types:

- `ClassNotFoundError` - Class does not exist (404)
- `InternalError` - API request failed (5xx)
- `InvalidObjectError` - Property validation failed
- `InvalidFilterError` - Filter validation failed

All errors include detailed context in the `details` field.

## API Reference

See individual file documentation for detailed API reference:

- [service.ts](./service.ts) - SchemaService class
- [cache.ts](./cache.ts) - SchemaCache class
- [parser.ts](./parser.ts) - Parsing functions
- [helpers.ts](./helpers.ts) - Helper utilities
- [error-handler.ts](./error-handler.ts) - Error handling

## Examples

See the module exports and inline documentation for comprehensive examples.

## License

MIT
