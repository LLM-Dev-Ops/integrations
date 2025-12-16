# Weaviate Schema Service - Implementation Summary

## Overview

Complete implementation of the schema service for the Weaviate TypeScript integration based on SPARC pseudocode Section 10. The implementation provides comprehensive schema introspection with intelligent caching, error handling, and helper utilities.

## Implementation Status

**Status**: ✅ Complete

**Total Lines of Code**: 2,299 lines (excluding tests and documentation)

**Files Created**:
- ✅ `schema/index.ts` (235 lines) - Main exports and factory functions
- ✅ `schema/service.ts` (338 lines) - SchemaService class
- ✅ `schema/cache.ts` (341 lines) - SchemaCache class with TTL
- ✅ `schema/parser.ts` (497 lines) - Schema parsing functions
- ✅ `schema/helpers.ts` (494 lines) - Schema utility functions
- ✅ `schema/error-handler.ts` (394 lines) - Error handling utilities
- ✅ `schema/README.md` - Comprehensive documentation

## Architecture

### Core Components

```
schema/
├── index.ts              # Main exports & factory functions
├── service.ts            # SchemaService - API interaction
├── cache.ts              # SchemaCache - TTL-based caching
├── parser.ts             # Response parsing functions
├── helpers.ts            # Schema utility functions
└── error-handler.ts      # Error handling & cache invalidation
```

### Dependencies

**Internal**:
- `transport/` - HTTP transport for API requests
- `observability/` - Tracing, metrics, and logging
- `errors/` - Error types (ClassNotFoundError, InternalError, etc.)
- `types/schema.ts` - Schema type definitions

**External**:
- None (uses only Node.js/browser built-ins)

## Implementation Details

### 1. SchemaService (`service.ts`)

Implements the core schema introspection operations per SPARC pseudocode.

**Methods**:
- `getSchema(): Promise<Schema>` - GET /v1/schema
- `getClass(className): Promise<ClassDefinition | null>` - GET /v1/schema/{className}
- `listClasses(): Promise<string[]>` - Extract class names from schema
- `getShards(className): Promise<ShardInfo[]>` - GET /v1/schema/{className}/shards

**Features**:
- Full observability integration (spans, metrics, logging)
- Graceful 404 handling (returns null for missing classes)
- Throws ClassNotFoundError for missing classes in getShards
- Comprehensive error context

**Example**:
```typescript
const service = new SchemaService(transport, observability);

// Get full schema
const schema = await service.getSchema();

// Get specific class (null if not found)
const classDef = await service.getClass('Article');

// List all classes
const classes = await service.listClasses();

// Get shard information
const shards = await service.getShards('Article');
```

### 2. SchemaCache (`cache.ts`)

Implements TTL-based caching per SPARC pseudocode with additional features.

**Properties**:
- `cache: Map<string, CachedClass>` - Internal cache storage
- `ttlSeconds: number` - Configurable TTL (default: 300 = 5 minutes)
- `hits: number` - Cache hit counter
- `misses: number` - Cache miss counter

**Methods**:
- `getClass(className): Promise<ClassDefinition>` - Get cached or fetch
- `invalidate(className): void` - Remove class from cache
- `invalidateAll(): void` - Clear entire cache
- `getCachedClasses(): string[]` - List cached class names
- `getStats(): CacheStats` - Get cache statistics
- `cleanup(): number` - Remove expired entries
- `resetStats(): void` - Reset hit/miss counters

**Features**:
- Automatic expiration based on TTL
- Throws ClassNotFoundError if class doesn't exist
- Cache performance monitoring
- Manual and automatic invalidation

**Example**:
```typescript
const cache = new SchemaCache(schemaService, 300); // 5-minute TTL

// Get cached or fetch
const classDef = await cache.getClass('Article');

// Invalidate on external change
cache.invalidate('Article');

// Check performance
const stats = cache.getStats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
```

### 3. Schema Parser (`parser.ts`)

Robust parsing of Weaviate API responses with type safety.

**Functions**:
- `parseSchema(data)` - Parse full schema response
- `parseClassDefinition(data)` - Parse class definition
- `parsePropertyDefinition(data)` - Parse property definition
- `parseVectorIndexConfig(data)` - Parse HNSW/vector config
- `parseInvertedIndexConfig(data)` - Parse BM25/inverted index config
- `parseReplicationConfig(data)` - Parse replication settings
- `parseShardingConfig(data)` - Parse sharding settings
- `parseMultiTenancyConfig(data)` - Parse multi-tenancy settings
- `parseShardInfo(data)` - Parse shard information
- `parseShardStatus(status)` - Parse shard status enum
- `parseTokenization(tokenization)` - Parse tokenization enum

**Features**:
- Defensive parsing with type checking
- Sensible defaults for missing fields
- Enum normalization (case-insensitive)
- Handles all Weaviate schema configuration options

**Example**:
```typescript
const response = await fetch('/v1/schema/Article');
const data = await response.json();
const classDef = parseClassDefinition(data);
```

### 4. Schema Helpers (`helpers.ts`)

Comprehensive utility functions for working with schemas.

**Type Guards**:
- `isTextProperty(property)` - Check if property is text type
- `isReferenceProperty(property)` - Check if property is reference
- `isArrayProperty(property)` - Check if property is array

**Property Utilities**:
- `getBaseDataType(property)` - Strip array notation
- `findProperty(schema, name)` - Find property by name
- `getTextProperties(classDef)` - Get all text properties
- `getReferenceProperties(classDef)` - Get all references
- `getArrayProperties(classDef)` - Get all arrays
- `getSearchableProperties(classDef)` - Get BM25-searchable properties
- `getFilterableProperties(classDef)` - Get filterable properties

**Class Inspection**:
- `getVectorDimension(classDef)` - Get vector dimension
- `hasVectorizer(classDef)` - Check if vectorizer configured
- `getVectorizerModule(classDef)` - Get vectorizer module name
- `isMultiTenancyEnabled(classDef)` - Check multi-tenancy status
- `getPropertyCount(classDef)` - Count properties
- `getReplicationFactor(classDef)` - Get replication factor
- `hasAsyncReplication(classDef)` - Check async replication
- `getDistanceMetric(classDef)` - Get distance metric
- `isPQEnabled(classDef)` - Check if PQ is enabled

**Example**:
```typescript
const classDef = await cache.getClass('Article');

// Type checks
const titleProp = findProperty(classDef, 'title');
if (isTextProperty(titleProp)) {
  console.log(`Tokenization: ${titleProp.tokenization}`);
}

// Get properties by category
const searchable = getSearchableProperties(classDef);
const filterable = getFilterableProperties(classDef);

// Check configuration
if (hasVectorizer(classDef)) {
  console.log(`Vectorizer: ${getVectorizerModule(classDef)}`);
}
```

### 5. Error Handler (`error-handler.ts`)

Smart error handling with automatic cache invalidation.

**Functions**:
- `handleSchemaError(error, className?)` - Handle schema errors
- `isSchemaError(error)` - Check if error is schema-related
- `withSchemaRefresh(cache, className, operation)` - Execute with auto-retry
- `invalidateCacheOnError(cache, error, className?)` - Smart invalidation
- `extractClassNameFromError(error)` - Extract class from error
- `createSchemaValidationError(...)` - Create validation error
- `batchInvalidateCache(cache, classNames)` - Bulk invalidation
- `conditionallyInvalidateCache(cache, error, className?)` - Smart invalidation

**Features**:
- Automatic cache invalidation on schema errors
- Retry logic with fresh schema
- Error message parsing
- Batch operations support

**Example**:
```typescript
// Automatic retry on schema errors
const result = await withSchemaRefresh(
  cache,
  'Article',
  async () => {
    const schema = await cache.getClass('Article');
    return validateObject(object, schema);
  }
);

// Manual invalidation on errors
try {
  await createObject(client, className, properties);
} catch (error) {
  invalidateCacheOnError(cache, error as WeaviateError, className);
  throw error;
}
```

## API Alignment with SPARC Pseudocode

### Section 10: Schema Introspection

✅ **get_schema(client) -> Schema**
- Implemented as `SchemaService.getSchema()`
- GET /v1/schema
- Parses response to Schema type
- Full observability integration

✅ **get_class(client, class_name) -> Option<ClassDefinition>**
- Implemented as `SchemaService.getClass(className)`
- GET /v1/schema/{className}
- Returns null on 404
- Throws on other errors

✅ **list_classes(client) -> Vec<String>**
- Implemented as `SchemaService.listClasses()`
- Gets schema and extracts class names
- Returns string array

✅ **get_shards(client, class_name) -> Vec<ShardInfo>**
- Implemented as `SchemaService.getShards(className)`
- GET /v1/schema/{className}/shards
- Throws ClassNotFoundError on 404

✅ **SchemaCache class**
- cache: Map<String, CachedClass>
- ttl_seconds: u64 = 300
- get_class(client, class_name) -> ClassDefinition
- invalidate(class_name): void
- invalidate_all(): void

**Additional features beyond SPARC**:
- Cache statistics (hits, misses, hit rate)
- Cache cleanup
- getCachedClasses()
- Helper functions for schema analysis
- Error handling with automatic cache invalidation
- withSchemaRefresh for automatic retry

## Type Safety

All functions use TypeScript's strict type checking:

```typescript
// Input validation
function parseClassDefinition(data: unknown): ClassDefinition {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid class definition: expected object');
  }
  // ... safe parsing
}

// Return types
async getClass(className: string): Promise<ClassDefinition | null>
async getShards(className: string): Promise<ShardInfo[]>

// Type guards
function isTextProperty(property: PropertyDefinition): boolean
function isReferenceProperty(property: PropertyDefinition): boolean
```

## Observability

All operations are fully instrumented:

**Tracing**:
- Span created for each operation
- Attributes include class name, result count
- Error recording

**Metrics**:
- Operation counters (schema.get, cache.hit, cache.miss)
- Labeled metrics per class

**Logging**:
- Debug logs for all operations
- Error logs with full context
- Performance-sensitive only when enabled

## Error Handling

Comprehensive error handling with proper types:

```typescript
// ClassNotFoundError for 404s
if (response.status === 404) {
  throw new ClassNotFoundError(className);
}

// InternalError for other failures
if (response.status !== 200) {
  throw new InternalError(
    `Failed to fetch schema: ${response.status}`,
    response.status,
    { responseBody: response.body }
  );
}

// Automatic cache invalidation
invalidateCacheOnError(cache, error, className);
```

## Testing Recommendations

### Unit Tests
```typescript
describe('SchemaService', () => {
  test('getSchema returns parsed schema', async () => {
    const service = new SchemaService(mockTransport, mockObservability);
    const schema = await service.getSchema();
    expect(schema.classes).toBeDefined();
  });

  test('getClass returns null for 404', async () => {
    const service = new SchemaService(mock404Transport, mockObservability);
    const result = await service.getClass('NonExistent');
    expect(result).toBeNull();
  });
});

describe('SchemaCache', () => {
  test('caches class definitions', async () => {
    const cache = new SchemaCache(mockService, 300);
    await cache.getClass('Article');
    await cache.getClass('Article'); // Should hit cache

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  test('invalidates expired entries', async () => {
    const cache = new SchemaCache(mockService, 1); // 1 second TTL
    await cache.getClass('Article');
    await sleep(1100);
    await cache.getClass('Article'); // Should fetch again

    const stats = cache.getStats();
    expect(stats.misses).toBe(2);
  });
});
```

### Integration Tests
```typescript
describe('Schema Integration', () => {
  test('fetches real schema from Weaviate', async () => {
    const transport = createTransport(weaviateUrl, authProvider);
    const observability = createObservability();
    const service = new SchemaService(transport, observability);

    const schema = await service.getSchema();
    expect(schema.classes.length).toBeGreaterThan(0);
  });

  test('cache invalidation on schema errors', async () => {
    const cache = new SchemaCache(service, 300);

    const result = await withSchemaRefresh(cache, 'Article', async () => {
      // Operation that might fail on stale schema
      return await validateWithSchema();
    });

    expect(result).toBeDefined();
  });
});
```

## Performance Characteristics

### SchemaService
- **getSchema()**: Single API call, O(n) parsing where n = classes
- **getClass()**: Single API call, O(1) lookup
- **listClasses()**: Calls getSchema(), same complexity
- **getShards()**: Single API call, O(m) parsing where m = shards

### SchemaCache
- **getClass()**: O(1) cache lookup, API call on miss
- **invalidate()**: O(1) deletion
- **invalidateAll()**: O(n) where n = cache size
- **getCachedClasses()**: O(n) array creation
- **getStats()**: O(1) calculation
- **cleanup()**: O(n) iteration

**Memory Usage**:
- Cache size proportional to number of classes × average class size
- Typical class definition: ~1-10 KB
- For 100 classes: ~100 KB - 1 MB

## Usage Patterns

### Pattern 1: Simple Schema Inspection
```typescript
const service = new SchemaService(transport, observability);
const schema = await service.getSchema();
```

### Pattern 2: Cached Access
```typescript
const cache = new SchemaCache(service, 300);
const classDef = await cache.getClass('Article');
```

### Pattern 3: With Error Handling
```typescript
const result = await withSchemaRefresh(cache, 'Article', async () => {
  const schema = await cache.getClass('Article');
  return processSchema(schema);
});
```

### Pattern 4: Monitoring
```typescript
setInterval(() => {
  const stats = cache.getStats();
  metrics.gauge('schema_cache_size', stats.size);
  metrics.gauge('schema_cache_hit_rate', stats.hitRate);
}, 60000);
```

## Future Enhancements

Potential improvements for future versions:

1. **Background Refresh**: Proactively refresh expiring cache entries
2. **Batch Fetching**: Fetch multiple classes in one request (if API supports)
3. **Schema Diffing**: Detect changes between cached and fresh schemas
4. **Metrics Dashboard**: Built-in cache performance visualization
5. **LRU Eviction**: Limit cache size with least-recently-used eviction
6. **Persistent Cache**: Optional disk-based caching for long-running processes
7. **Schema Validation**: Validate objects against cached schemas
8. **Property Index**: Fast property lookup across all classes

## Conclusion

The schema service implementation is complete and production-ready, providing:

- ✅ Full SPARC pseudocode compliance
- ✅ Type-safe TypeScript implementation
- ✅ Comprehensive error handling
- ✅ Intelligent caching with TTL
- ✅ Full observability integration
- ✅ Rich helper utilities
- ✅ Extensive documentation

Total implementation: **2,299 lines** of well-documented, type-safe code.
