# Weaviate Object Operations Module

This module provides comprehensive CRUD operations for Weaviate objects with built-in observability, resilience, and validation support.

## Features

- **Full CRUD Operations**: Create, read, update, and delete objects
- **Schema Validation**: Validate objects against schema definitions
- **Observability**: Built-in tracing and metrics
- **Resilience**: Retry logic, circuit breaker, and degradation support
- **Multi-tenancy**: Support for tenant-specific operations
- **Consistency Control**: Configurable consistency levels
- **Vector Support**: Full vector embedding support with validation

## Components

### ObjectService

Main service class providing CRUD operations:

```typescript
import { ObjectService } from './operations';
import { createUUID } from './types';

// Create service instance
const objectService = new ObjectService(
  transport,
  observability,
  schemaCache,
  resilience
);

// Create an object
const object = await objectService.createObject(
  'Article',
  {
    title: 'Introduction to Weaviate',
    content: 'Weaviate is a vector database...',
    publishedDate: new Date('2024-01-15'),
  },
  {
    vector: [0.1, 0.2, 0.3, ...],
    validate: true,
    consistencyLevel: ConsistencyLevel.Quorum,
  }
);

// Get an object
const retrieved = await objectService.getObject(
  'Article',
  object.id,
  {
    includeVector: true,
  }
);

// Update an object
const updated = await objectService.updateObject(
  'Article',
  object.id,
  {
    title: 'Updated Title',
  },
  {
    merge: true, // Merge with existing properties
  }
);

// Delete an object
await objectService.deleteObject('Article', object.id);

// Check if object exists
const exists = await objectService.exists('Article', object.id);

// Validate an object
const validation = await objectService.validate(
  'Article',
  {
    title: 'Test Article',
    content: 'Content',
  }
);
```

### Serialization

Handles conversion between internal types and API format:

```typescript
import {
  serializeObject,
  deserializeObject,
  serializeProperties,
  deserializeProperties,
} from './operations';

// Serialize for API request
const apiRequest = serializeObject(weaviateObject);

// Deserialize from API response
const object = deserializeObject(apiResponse);

// Serialize individual properties
const serializedProps = serializeProperties({
  title: 'Hello',
  publishedDate: new Date(),
  location: { latitude: 37.7749, longitude: -122.4194 },
});
```

### Validation

Validate objects and vectors against schema:

```typescript
import {
  validateObject,
  validateVector,
  validateProperties,
  getVectorDimension,
} from './operations';

// Validate complete object
const result = validateObject(object, classDefinition);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}

// Validate vector dimensions
try {
  validateVector(vector, classDefinition);
} catch (error) {
  console.error('Vector validation failed:', error.message);
}

// Validate properties only
const propertyErrors = validateProperties(properties, classDefinition);

// Get expected vector dimensions
const dimensions = getVectorDimension(classDefinition);
```

## Types

### CreateObjectOptions

```typescript
interface CreateObjectOptions {
  id?: UUID;                      // Custom UUID
  vector?: Vector;                // Vector embedding
  tenant?: string;                // Tenant name
  consistencyLevel?: ConsistencyLevel;
  validate?: boolean;             // Validate before creation
}
```

### GetObjectOptions

```typescript
interface GetObjectOptions {
  includeVector?: boolean;
  includeClassification?: boolean;
  properties?: string[];          // Specific properties to return
  tenant?: string;
  consistencyLevel?: ConsistencyLevel;
  nodeName?: string;              // For directed reads
}
```

### UpdateObjectOptions

```typescript
interface UpdateObjectOptions {
  vector?: Vector;
  merge?: boolean;                // Merge (PATCH) or replace (PUT)
  tenant?: string;
  consistencyLevel?: ConsistencyLevel;
}
```

### DeleteObjectOptions

```typescript
interface DeleteObjectOptions {
  tenant?: string;
  consistencyLevel?: ConsistencyLevel;
  ignoreNotFound?: boolean;       // Don't throw on 404
}
```

## Property Type Support

The serialization module handles all Weaviate property types:

- **Primitives**: `string`, `number`, `boolean`, `Date`
- **Arrays**: `string[]`, `number[]`, `boolean[]`, `Date[]`, `UUID[]`
- **Complex Types**:
  - `GeoCoordinates`: `{ latitude: number, longitude: number }`
  - `PhoneNumber`: `{ input: string, international: string, ... }`
  - `Blob`: `Uint8Array` (binary data)
  - `ObjectReference[]`: Cross-references to other objects

## Schema Cache Interface

For validation support, implement the `SchemaCache` interface:

```typescript
interface SchemaCache {
  getClass(className: string): Promise<ClassDefinition | null>;
  invalidate(className: string): void;
  clear(): void;
}
```

## Error Handling

The service throws specific error types:

- `ObjectNotFoundError`: Object with given ID not found (404)
- `InvalidObjectError`: Object validation failed
- `InvalidVectorError`: Vector validation failed
- `ClassNotFoundError`: Class not found in schema
- Standard HTTP errors via `mapHttpError()`

## Observability

All operations emit:

- **Traces**: Spans for each operation with class name and tenant
- **Metrics**:
  - `weaviate.object.create.success/error`
  - `weaviate.object.update.success/error`
  - `weaviate.object.delete.success/error`
  - Tagged with `class_name` and `error_type`

## Resilience

When configured with `ResilienceOrchestrator`:

- **Retry**: Automatic retry on transient failures
- **Circuit Breaker**: Fast-fail when service is down
- **Rate Limiting**: Respect API rate limits
- **Degradation**: Adaptive behavior under load

## Multi-tenancy

All operations support tenant-specific access:

```typescript
// Create in tenant
await objectService.createObject('Article', properties, {
  tenant: 'tenant-a',
});

// Get from tenant
const object = await objectService.getObject('Article', id, {
  tenant: 'tenant-a',
});
```

## Consistency Levels

Control read/write consistency:

```typescript
import { ConsistencyLevel } from '../types';

// ONE: Fastest, least consistent
await objectService.createObject('Article', properties, {
  consistencyLevel: ConsistencyLevel.One,
});

// QUORUM: Balanced (default)
await objectService.createObject('Article', properties, {
  consistencyLevel: ConsistencyLevel.Quorum,
});

// ALL: Slowest, most consistent
await objectService.createObject('Article', properties, {
  consistencyLevel: ConsistencyLevel.All,
});
```

## Implementation Details

### UUID Generation

The service auto-generates UUIDs v4 for new objects if not provided.

### HTTP Methods

- Create: `POST /v1/objects`
- Get: `GET /v1/objects/{className}/{id}`
- Update (merge): `PATCH /v1/objects/{className}/{id}`
- Update (replace): `PUT /v1/objects/{className}/{id}`
- Delete: `DELETE /v1/objects/{className}/{id}`
- Exists: `HEAD /v1/objects/{className}/{id}`
- Validate: `POST /v1/objects/validate`

### Date Handling

Dates are automatically converted:
- **Serialization**: `Date` → ISO 8601 string
- **Deserialization**: ISO 8601 string → `Date`

### Blob Handling

Binary data is base64 encoded:
- **Serialization**: `Uint8Array` → base64 string
- **Deserialization**: base64 string → `Uint8Array`

## Testing

For testing, you can inject mock implementations:

```typescript
// Mock schema cache
const mockCache: SchemaCache = {
  async getClass(className) {
    return mockClassDefinition;
  },
  invalidate() {},
  clear() {},
};

// Mock transport
const mockTransport: HttpTransport = {
  async post(path, body) {
    return { status: 200, data: mockResponse };
  },
  // ... other methods
};
```

## See Also

- [SPARC Pseudocode](../../../plans/weaviate/pseudocode-weaviate.md) - Section 2
- [Type Definitions](../types/)
- [Error Handling](../errors/)
- [Transport Layer](../transport/)
- [Observability](../observability/)
- [Resilience](../resilience/)
