# Reference Service

The Reference Service module provides comprehensive functionality for managing cross-references between Weaviate objects. This includes adding, deleting, updating, and retrieving references, as well as utilities for beacon URL handling and reference validation.

## Overview

References in Weaviate create relationships between objects, similar to foreign keys in relational databases. They use a beacon URL format: `weaviate://localhost/ClassName/uuid`.

## Features

- **CRUD Operations**: Add, delete, update, and get references
- **Beacon URL Handling**: Create, parse, and validate beacon URLs
- **Reference Validation**: Validate reference properties, cross-references, and detect circular references
- **Observability**: Built-in tracing, logging, and metrics
- **Batch Operations**: Add multiple references efficiently
- **Type Safety**: Full TypeScript support with comprehensive types

## Module Structure

```
reference/
├── index.ts           # Main exports
├── service.ts         # ReferenceService class
├── beacon.ts          # Beacon URL utilities
├── validation.ts      # Reference validation utilities
├── types.ts           # Type definitions
└── README.md          # This file
```

## Usage

### Basic Setup

```typescript
import { ReferenceService } from './reference';
import { createTransport } from './transport';
import { createTracer, createLogger, createMetricsCollector } from './observability';

// Create transport and observability components
const transport = createTransport({
  baseUrl: 'http://localhost:8080',
  authProvider: apiKeyAuth,
});

const observability = {
  tracer: createTracer({ type: 'console' }),
  logger: createLogger({ level: LogLevel.Info }),
  metrics: createMetricsCollector(),
};

// Create reference service
const referenceService = new ReferenceService(transport, observability);
```

### Adding a Reference

```typescript
// Add a single reference
await referenceService.addReference(
  'Article',                          // From class
  '550e8400-e29b-41d4-a716-446655440000' as UUID,  // From ID
  'authors',                          // Property name
  'Author',                           // To class
  '660e8400-e29b-41d4-a716-446655440001' as UUID   // To ID
);

// With options
await referenceService.addReference(
  'Article',
  articleId,
  'authors',
  'Author',
  authorId,
  {
    tenant: 'my-tenant',
    consistencyLevel: 'QUORUM',
  }
);
```

### Deleting a Reference

```typescript
await referenceService.deleteReference(
  'Article',
  articleId,
  'authors',
  'Author',
  authorId
);
```

### Updating References

Replace all references on a property:

```typescript
import { createReference } from './reference';

const newAuthors = [
  createReference('Author', 'author-1-id' as UUID),
  createReference('Author', 'author-2-id' as UUID),
];

await referenceService.updateReferences(
  'Article',
  articleId,
  'authors',
  newAuthors
);
```

### Getting References

```typescript
// Get all references from a property
const references = await referenceService.getReferences(
  'Article',
  articleId,
  'authors'
);

references.forEach(ref => {
  console.log(`Reference to ${ref.className}/${ref.id}`);
  console.log(`Beacon: ${ref.beacon}`);
});

// With options
const refsWithProps = await referenceService.getReferences(
  'Article',
  articleId,
  'authors',
  {
    includeProperties: true,
    properties: ['name', 'email'],
  }
);
```

### Batch Operations

```typescript
const operations = [
  {
    fromClass: 'Article',
    fromId: articleId1,
    property: 'authors',
    toClass: 'Author',
    toId: authorId1,
  },
  {
    fromClass: 'Article',
    fromId: articleId2,
    property: 'authors',
    toClass: 'Author',
    toId: authorId2,
  },
];

const results = await referenceService.batchAddReferences(operations);

results.forEach((result, index) => {
  if (result.success) {
    console.log(`Operation ${index}: Success`);
  } else {
    console.error(`Operation ${index}: Failed - ${result.error?.message}`);
  }
});
```

## Beacon URL Utilities

### Creating Beacons

```typescript
import { createBeacon } from './reference';

const beacon = createBeacon('Author', authorId);
// Returns: "weaviate://localhost/Author/550e8400-..."

// With custom host
const beaconCustom = createBeacon('Author', authorId, 'my-host');
// Returns: "weaviate://my-host/Author/550e8400-..."
```

### Parsing Beacons

```typescript
import { parseBeacon } from './reference';

const parsed = parseBeacon('weaviate://localhost/Author/550e8400-...');
// Returns: { host: 'localhost', className: 'Author', id: '550e8400-...' }
```

### Validating Beacons

```typescript
import { validateBeacon, isValidBeaconFormat } from './reference';

if (validateBeacon(beaconUrl)) {
  console.log('Valid beacon');
}

// Extract components
import { extractClassFromBeacon, extractIdFromBeacon } from './reference';

const className = extractClassFromBeacon(beacon);  // "Author"
const id = extractIdFromBeacon(beacon);            // UUID
```

## Reference Validation

### Validate Reference Property

```typescript
import { validateReferenceProperty } from './reference';

const isValid = validateReferenceProperty(classDefinition, 'authors');
// Returns: true if property exists and is a reference type
```

### Validate Cross-Reference

```typescript
import { validateCrossReference } from './reference';

const result = validateCrossReference(
  schema,
  'Article',      // From class
  'authors',      // Property
  'Author'        // To class
);

if (!result.valid) {
  console.error(result.error);
  console.log('Expected classes:', result.expectedClasses);
}
```

### Check for Circular References

```typescript
import { checkCircularReference } from './reference';

const refs = [
  { className: 'Author', id: 'author-1', beacon: '...' },
  { className: 'Article', id: 'article-1', beacon: '...' }
];

const hasCircular = checkCircularReference(refs, 'Article', 'article-1');
if (hasCircular) {
  console.warn('Circular reference detected!');
}
```

### Validate Reference Depth

```typescript
import { validateReferenceDepth } from './reference';

const isValid = validateReferenceDepth(currentDepth, maxDepth);
if (!isValid) {
  throw new Error('Reference depth exceeded');
}
```

### Comprehensive Validation

```typescript
import { validateReference } from './reference';

const result = validateReference({
  schema,
  fromClass: 'Article',
  property: 'authors',
  toClass: 'Author',
  toId: authorId,
  existingReferences: currentRefs,
  referenceChain: chainOfRefs,
  maxDepth: 5,
});

if (!result.valid) {
  result.errors.forEach(error => {
    console.error(`${error.code}: ${error.message}`);
  });
}

console.log('Property exists:', result.propertyExists);
console.log('Is reference property:', result.isReferenceProperty);
console.log('Expected classes:', result.expectedClasses);
console.log('Circular reference:', result.circularReference);
console.log('Current depth:', result.depth);
```

## Error Handling

The reference service throws specific error types for different failure conditions:

```typescript
import { ObjectNotFoundError, NetworkError } from './errors';

try {
  await referenceService.addReference(
    'Article',
    articleId,
    'authors',
    'Author',
    authorId
  );
} catch (error) {
  if (error instanceof ObjectNotFoundError) {
    console.error('Object not found:', error.message);
  } else if (error instanceof NetworkError) {
    console.error('Network error:', error.message);
  } else {
    console.error('Unknown error:', error);
  }
}
```

## Observability

The service provides built-in observability:

### Tracing

Automatic spans for all operations:
- `weaviate.add_reference`
- `weaviate.delete_reference`
- `weaviate.update_references`
- `weaviate.get_references`
- `weaviate.batch_add_references`

### Metrics

Counters and histograms:
- `weaviate.reference.add.success`
- `weaviate.reference.add.error`
- `weaviate.reference.delete.success`
- `weaviate.reference.update.count`
- `weaviate.reference.get.count`
- `weaviate.reference.batch_add.total`

### Logging

Debug and info logs for all operations with structured context.

## Type Definitions

### Reference

```typescript
interface Reference {
  beacon: string;      // "weaviate://localhost/ClassName/uuid"
  className: string;   // Target class name
  id: UUID;           // Target object ID
  href?: string;      // Optional href
}
```

### ReferenceOptions

```typescript
interface ReferenceOptions {
  tenant?: string;
  consistencyLevel?: 'ONE' | 'QUORUM' | 'ALL';
}
```

### GetReferencesOptions

```typescript
interface GetReferencesOptions extends ReferenceOptions {
  includeProperties?: boolean;
  properties?: string[];
}
```

## Best Practices

1. **Use Batch Operations**: For adding multiple references, use `batchAddReferences` for better performance.

2. **Validate Before Adding**: Use validation utilities to check references before adding them.

3. **Handle Errors Appropriately**: Catch and handle specific error types for better error recovery.

4. **Monitor Metrics**: Track reference operation metrics to identify issues.

5. **Avoid Deep Reference Chains**: Keep reference depth under 3 levels for optimal performance.

6. **Use Consistent Naming**: Follow Weaviate naming conventions (PascalCase for classes, camelCase for properties).

## API Reference

See the inline TypeScript documentation for detailed API information:

- [ReferenceService](./service.ts) - Main service class
- [Beacon Utilities](./beacon.ts) - Beacon URL handling
- [Validation Utilities](./validation.ts) - Reference validation
- [Types](./types.ts) - Type definitions

## Related Documentation

- [Weaviate References Documentation](https://weaviate.io/developers/weaviate/manage-data/cross-references)
- [Transport Layer](../transport/README.md)
- [Observability](../observability/README.md)
- [Error Handling](../errors/README.md)
