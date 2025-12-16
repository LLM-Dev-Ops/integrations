# Object Operations - Usage Examples

Complete examples demonstrating the object operations service.

## Basic Setup

```typescript
import { ObjectService } from './operations';
import { FetchTransport } from '../transport';
import { Tracer, MetricsCollector, Logger } from '../observability';
import { ResilienceOrchestrator } from '../resilience';
import { ConsistencyLevel } from '../types';

// Setup dependencies
const transport = new FetchTransport({
  baseUrl: 'http://localhost:8080',
  authProvider: apiKeyAuth,
});

const observability = {
  tracer: new Tracer(),
  metrics: new MetricsCollector(),
  logger: new Logger(),
};

const resilience = new ResilienceOrchestrator({
  enableRetry: true,
  enableCircuitBreaker: true,
  enableRateLimiter: true,
});

// Create service
const objectService = new ObjectService(
  transport,
  observability,
  schemaCache,
  resilience
);
```

## Example 1: Create and Retrieve an Article

```typescript
// Create an article with vector embedding
const article = await objectService.createObject(
  'Article',
  {
    title: 'Introduction to Vector Databases',
    content: 'Vector databases are specialized systems...',
    author: 'John Doe',
    publishedDate: new Date('2024-01-15'),
    tags: ['database', 'ai', 'vectors'],
    readTime: 5,
  },
  {
    vector: [0.1, 0.2, 0.3, 0.4, 0.5],
    validate: true,
    consistencyLevel: ConsistencyLevel.Quorum,
  }
);

console.log('Created article:', article.id);

// Retrieve the article
const retrieved = await objectService.getObject(
  'Article',
  article.id,
  {
    includeVector: true,
  }
);

console.log('Retrieved:', retrieved.properties.title);
```

## Example 2: Update Article Properties

```typescript
// Partial update (merge)
const updated = await objectService.updateObject(
  'Article',
  article.id,
  {
    title: 'Updated: Introduction to Vector Databases',
    readTime: 7, // Updated reading time
  },
  {
    merge: true, // Merge with existing properties
  }
);

// Full replacement
const replaced = await objectService.updateObject(
  'Article',
  article.id,
  {
    title: 'Completely New Article',
    content: 'New content',
    author: 'Jane Smith',
    publishedDate: new Date(),
  },
  {
    merge: false, // Replace all properties
    vector: [0.9, 0.8, 0.7, 0.6, 0.5], // New vector
  }
);
```

## Example 3: Multi-tenant Operations

```typescript
// Create in tenant-a
const tenantArticle = await objectService.createObject(
  'Article',
  {
    title: 'Tenant-specific Article',
    content: 'This article belongs to tenant-a',
  },
  {
    tenant: 'tenant-a',
    vector: [0.1, 0.2, 0.3],
  }
);

// Retrieve from tenant-a
const retrieved = await objectService.getObject(
  'Article',
  tenantArticle.id,
  {
    tenant: 'tenant-a',
  }
);

// Update in tenant-a
await objectService.updateObject(
  'Article',
  tenantArticle.id,
  { title: 'Updated Tenant Article' },
  {
    tenant: 'tenant-a',
  }
);

// Delete from tenant-a
await objectService.deleteObject('Article', tenantArticle.id, {
  tenant: 'tenant-a',
});
```

## Example 4: Working with Complex Property Types

```typescript
// Article with geo coordinates and references
const complexArticle = await objectService.createObject(
  'Article',
  {
    title: 'San Francisco Tech Scene',
    content: 'Exploring the tech ecosystem...',

    // Geo coordinates
    location: {
      latitude: 37.7749,
      longitude: -122.4194,
    },

    // Phone number
    contactPhone: {
      input: '+1-555-123-4567',
      international: '+1 555-123-4567',
      countryCode: 'US',
      valid: true,
    },

    // Date array
    importantDates: [
      new Date('2024-01-01'),
      new Date('2024-02-15'),
      new Date('2024-03-30'),
    ],

    // Reference to authors
    authors: [
      {
        beacon: 'weaviate://localhost/Author/author-1-uuid',
        className: 'Author',
        id: 'author-1-uuid',
      },
    ],
  }
);
```

## Example 5: Validation Before Creation

```typescript
// Validate without creating
const validation = await objectService.validate(
  'Article',
  {
    title: 'Test Article',
    content: 'Test content',
    invalidField: 'This field does not exist in schema',
  }
);

if (!validation.valid) {
  console.error('Validation errors:');
  validation.errors.forEach((error) => {
    console.error(`- ${error.property}: ${error.message}`);
  });
} else {
  // Validation passed, safe to create
  const article = await objectService.createObject(
    'Article',
    properties
  );
}
```

## Example 6: Error Handling

```typescript
try {
  // Try to get non-existent object
  const article = await objectService.getObject(
    'Article',
    'non-existent-uuid'
  );

  if (article === null) {
    console.log('Article not found');
  }
} catch (error) {
  if (error instanceof ObjectNotFoundError) {
    console.error('Object not found:', error.message);
  } else if (error instanceof InvalidVectorError) {
    console.error('Vector validation failed:', error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}

// Delete with ignore not found
await objectService.deleteObject('Article', 'maybe-exists-uuid', {
  ignoreNotFound: true, // Won't throw if not found
});
```

## Example 7: Checking Object Existence

```typescript
// Quick existence check (HEAD request)
const exists = await objectService.exists(
  'Article',
  'some-uuid'
);

if (exists) {
  console.log('Article exists');

  // Safe to retrieve
  const article = await objectService.getObject(
    'Article',
    'some-uuid'
  );
} else {
  console.log('Article does not exist');
}

// With tenant
const existsInTenant = await objectService.exists(
  'Article',
  'some-uuid',
  'tenant-a'
);
```

## Example 8: Consistency Levels

```typescript
// Fast write, eventual consistency
await objectService.createObject('Article', properties, {
  consistencyLevel: ConsistencyLevel.One,
});

// Balanced (default)
await objectService.createObject('Article', properties, {
  consistencyLevel: ConsistencyLevel.Quorum,
});

// Strong consistency, slower
await objectService.createObject('Article', properties, {
  consistencyLevel: ConsistencyLevel.All,
});

// Apply to reads too
const article = await objectService.getObject('Article', id, {
  consistencyLevel: ConsistencyLevel.All,
});
```

## Example 9: Selective Property Retrieval

```typescript
// Get only specific properties
const article = await objectService.getObject(
  'Article',
  id,
  {
    properties: ['title', 'author', 'publishedDate'],
    includeVector: false, // Exclude vector
  }
);

// Only returns: title, author, publishedDate
console.log(article.properties);
```

## Example 10: Working with Binary Data (Blobs)

```typescript
// Create with blob
const document = await objectService.createObject(
  'Document',
  {
    title: 'PDF Document',
    content: new Uint8Array([0x25, 0x50, 0x44, 0x46]), // PDF header
  }
);

// Retrieve blob
const retrieved = await objectService.getObject('Document', document.id);
const blob = retrieved.properties.content as Uint8Array;

// Convert to base64 for storage/transmission
const base64 = Buffer.from(blob).toString('base64');
```

## Example 11: Batch-like Sequential Operations

```typescript
// Create multiple articles sequentially
const articles = [];

for (const data of articleData) {
  try {
    const article = await objectService.createObject(
      'Article',
      data.properties,
      {
        vector: data.vector,
      }
    );
    articles.push(article);
  } catch (error) {
    console.error('Failed to create article:', error);
    // Continue with next article
  }
}

console.log(`Created ${articles.length} articles`);
```

## Example 12: Update Vector Only

```typescript
// Update just the vector embedding
await objectService.updateObject(
  'Article',
  articleId,
  {}, // No property changes
  {
    vector: newVector,
    merge: true,
  }
);
```

## Example 13: Using with Schema Cache

```typescript
// Implement schema cache
class SimpleSchemaCache implements SchemaCache {
  private cache = new Map<string, ClassDefinition>();
  private schemaService: SchemaService;

  constructor(schemaService: SchemaService) {
    this.schemaService = schemaService;
  }

  async getClass(className: string): Promise<ClassDefinition | null> {
    // Check cache
    if (this.cache.has(className)) {
      return this.cache.get(className)!;
    }

    // Fetch from API
    const classDef = await this.schemaService.getClass(className);
    if (classDef) {
      this.cache.set(className, classDef);
    }

    return classDef;
  }

  invalidate(className: string): void {
    this.cache.delete(className);
  }

  clear(): void {
    this.cache.clear();
  }
}

// Use with object service
const schemaCache = new SimpleSchemaCache(schemaService);
const objectService = new ObjectService(
  transport,
  observability,
  schemaCache, // Enable validation
  resilience
);

// Now validation works
const article = await objectService.createObject(
  'Article',
  properties,
  {
    validate: true, // Will use schema cache
  }
);
```

## Example 14: Observability Integration

```typescript
// All operations automatically emit traces and metrics

// Create operation emits:
// - Span: weaviate.create_object
// - Metric: weaviate.object.create.success
await objectService.createObject('Article', properties);

// Update operation emits:
// - Span: weaviate.update_object
// - Metric: weaviate.object.update.success
await objectService.updateObject('Article', id, properties);

// Delete operation emits:
// - Span: weaviate.delete_object
// - Metric: weaviate.object.delete.success
await objectService.deleteObject('Article', id);

// Errors are recorded:
// - Metric: weaviate.object.create.error with error_type tag
// - Span status: error with error details
```

## Example 15: Resilience Patterns

```typescript
// Automatic retry on transient failures
// Automatic circuit breaker protection
// Automatic rate limiting

const objectService = new ObjectService(
  transport,
  observability,
  schemaCache,
  resilience // Enables all resilience patterns
);

// This operation benefits from:
// 1. Rate limiting - won't exceed API limits
// 2. Circuit breaker - fails fast if service is down
// 3. Retry - retries on transient failures
// 4. Degradation - adapts under load
await objectService.createObject('Article', properties);
```

## Testing Example

```typescript
import { describe, it, expect } from 'vitest';

describe('ObjectService', () => {
  it('should create an object', async () => {
    const mockTransport = {
      async post(path: string, body: unknown) {
        return {
          status: 200,
          data: {
            id: 'test-uuid',
            class: 'Article',
            properties: body.properties,
            vector: body.vector,
          },
        };
      },
    };

    const service = new ObjectService(
      mockTransport as any,
      mockObservability,
    );

    const result = await service.createObject(
      'Article',
      { title: 'Test' },
      { vector: [0.1, 0.2, 0.3] }
    );

    expect(result.className).toBe('Article');
    expect(result.properties.title).toBe('Test');
  });
});
```

## Performance Considerations

```typescript
// For high-throughput scenarios:

// 1. Use ONE consistency for fastest writes
const options = { consistencyLevel: ConsistencyLevel.One };

// 2. Disable vector inclusion when not needed
const getOptions = { includeVector: false };

// 3. Request only needed properties
const selectiveOptions = {
  properties: ['title', 'author'],
  includeVector: false,
};

// 4. Use exists() instead of get() for checks
const exists = await objectService.exists('Article', id);

// 5. Leverage resilience for rate limiting
// (automatically handled by ResilienceOrchestrator)
```
