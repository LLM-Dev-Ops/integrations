# GraphQL Module Quick Reference

## Quick Start

```typescript
import { GetQueryBuilder, GraphQLExecutor } from './graphql/index.js';

// 1. Build a query
const query = new GetQueryBuilder('Article')
  .nearVector([0.1, 0.2, 0.3], { certainty: 0.7 })
  .limit(10)
  .build();

// 2. Execute
const executor = new GraphQLExecutor({ transport: httpClient });
const data = await executor.execute(query);

// 3. Parse
const result = parseGraphQLResponse(data, 'Article');
```

## Common Patterns

### Vector Search
```typescript
new GetQueryBuilder('Article')
  .nearVector([0.1, 0.2, 0.3], { certainty: 0.7 })
  .limit(10)
  .properties(['title', 'content'])
  .additional(['id', 'distance'])
  .build();
```

### Text Search
```typescript
new GetQueryBuilder('Article')
  .nearText(['AI', 'ML'], { certainty: 0.7 })
  .limit(10)
  .build();
```

### Hybrid Search
```typescript
new GetQueryBuilder('Product')
  .hybrid('laptop', { alpha: 0.5 })
  .limit(10)
  .build();
```

### BM25 Search
```typescript
new GetQueryBuilder('Document')
  .bm25('search term', ['title', 'content'])
  .limit(10)
  .build();
```

### With Filter
```typescript
new GetQueryBuilder('Product')
  .nearVector([0.1, 0.2, 0.3])
  .where({
    operator: 'Operand',
    operand: {
      path: ['price'],
      operator: FilterOperator.LessThan,
      value: 1000
    }
  })
  .limit(10)
  .build();
```

### Aggregation
```typescript
new AggregateQueryBuilder('Product')
  .groupBy(['category'])
  .field('price', [Aggregation.Mean, Aggregation.Count])
  .build();
```

## Builder Methods

### GetQueryBuilder

| Method | Description | Example |
|--------|-------------|---------|
| `className(name)` | Set class name | `.className('Article')` |
| `nearVector(vector, opts?)` | Vector search | `.nearVector([0.1, 0.2], { certainty: 0.7 })` |
| `nearText(concepts, opts?)` | Text search | `.nearText(['AI'], { certainty: 0.7 })` |
| `nearObject(id, className, opts?)` | Similar objects | `.nearObject(id, 'Article')` |
| `hybrid(query, opts?)` | Hybrid search | `.hybrid('query', { alpha: 0.5 })` |
| `bm25(query, properties?)` | Keyword search | `.bm25('query', ['title'])` |
| `where(filter)` | Add filter | `.where(filterObj)` |
| `limit(n)` | Result limit | `.limit(10)` |
| `offset(n)` | Skip results | `.offset(20)` |
| `properties(props)` | Properties to return | `.properties(['title', 'content'])` |
| `additional(fields)` | Additional fields | `.additional(['id', 'distance'])` |
| `tenant(name)` | Multi-tenant | `.tenant('tenant-123')` |
| `groupBy(config)` | Group results | `.groupBy({ path: ['category'], groups: 5, objectsPerGroup: 3 })` |
| `autocut(value)` | Adaptive limit | `.autocut(1)` |
| `build()` | Generate query | `.build()` |

### AggregateQueryBuilder

| Method | Description | Example |
|--------|-------------|---------|
| `className(name)` | Set class name | `.className('Product')` |
| `groupBy(paths)` | Group by properties | `.groupBy(['category', 'status'])` |
| `where(filter)` | Add filter | `.where(filterObj)` |
| `tenant(name)` | Multi-tenant | `.tenant('tenant-123')` |
| `field(property, aggs)` | Add aggregation | `.field('price', [Aggregation.Mean])` |
| `build()` | Generate query | `.build()` |

## Additional Fields

Common fields for `.additional()`:
- `'id'` - Object UUID
- `'vector'` - Vector embedding
- `'certainty'` - Certainty score (0-1)
- `'distance'` - Distance score
- `'score'` - Hybrid/BM25 score
- `'explainScore'` - Score explanation
- `'creationTimeUnix'` - Creation timestamp
- `'lastUpdateTimeUnix'` - Update timestamp

## Aggregation Types

```typescript
import { Aggregation } from '../types/aggregate.js';

Aggregation.Count          // Object count
Aggregation.Sum            // Sum of values
Aggregation.Mean           // Average
Aggregation.Median         // Median
Aggregation.Mode           // Most common
Aggregation.Minimum        // Min value
Aggregation.Maximum        // Max value
Aggregation.TopOccurrences // Top values
Aggregation.PointingTo     // Reference count
```

## Filter Operators

```typescript
import { FilterOperator } from '../types/filter.js';

FilterOperator.Equal              // ==
FilterOperator.NotEqual           // !=
FilterOperator.GreaterThan        // >
FilterOperator.GreaterThanEqual   // >=
FilterOperator.LessThan           // <
FilterOperator.LessThanEqual      // <=
FilterOperator.Like               // Wildcard match
FilterOperator.WithinGeoRange     // Geo distance
FilterOperator.IsNull             // Null check
FilterOperator.ContainsAny        // Array contains any
FilterOperator.ContainsAll        // Array contains all
```

## Filter Examples

### Simple Filter
```typescript
{
  operator: 'Operand',
  operand: {
    path: ['price'],
    operator: FilterOperator.LessThan,
    value: 1000
  }
}
```

### AND Filter
```typescript
{
  operator: 'And',
  operands: [
    { operator: 'Operand', operand: { path: ['price'], operator: FilterOperator.LessThan, value: 1000 } },
    { operator: 'Operand', operand: { path: ['inStock'], operator: FilterOperator.Equal, value: true } }
  ]
}
```

### OR Filter
```typescript
{
  operator: 'Or',
  operands: [
    { operator: 'Operand', operand: { path: ['category'], operator: FilterOperator.Equal, value: 'A' } },
    { operator: 'Operand', operand: { path: ['category'], operator: FilterOperator.Equal, value: 'B' } }
  ]
}
```

### Nested Filter
```typescript
{
  operator: 'And',
  operands: [
    { operator: 'Operand', operand: { path: ['price'], operator: FilterOperator.LessThan, value: 1000 } },
    {
      operator: 'Or',
      operands: [
        { operator: 'Operand', operand: { path: ['category'], operator: FilterOperator.Equal, value: 'A' } },
        { operator: 'Operand', operand: { path: ['category'], operator: FilterOperator.Equal, value: 'B' } }
      ]
    }
  ]
}
```

## Error Handling

```typescript
import {
  ClassNotFoundError,
  InvalidFilterError,
  GraphQLError
} from '../errors/types.js';

try {
  const result = await executor.execute(query);
} catch (error) {
  if (error instanceof ClassNotFoundError) {
    console.error('Class does not exist');
  } else if (error instanceof InvalidFilterError) {
    console.error('Invalid filter');
  } else if (error instanceof GraphQLError) {
    console.error('GraphQL errors:', error.errors);
  }
}
```

## Parsing Results

### Search Results
```typescript
const result = parseGraphQLResponse(data, 'Article');
// result.objects: SearchHit[]
// result.totalCount: number

for (const hit of result.objects) {
  console.log(hit.id);           // UUID
  console.log(hit.properties);   // Object properties
  console.log(hit.distance);     // Similarity score
  console.log(hit.vector);       // Vector (if requested)
}
```

### Aggregate Results
```typescript
const result = parseAggregateResult(data, 'Product');
// result.groups: AggregateGroup[]
// result.meta: { count: number }

for (const group of result.groups) {
  console.log(group.groupedBy);        // Grouped field values
  console.log(group.aggregations);     // Aggregation results
  console.log(group.count);            // Group count
}
```

## Performance Tips

1. **Request only needed properties**: Use `.properties()` to limit returned fields
2. **Use appropriate search type**: Vector for semantic, BM25 for exact keywords, Hybrid for both
3. **Limit results**: Always use `.limit()` to control result size
4. **Use filters**: Pre-filter with `.where()` before vector search
5. **Batch queries**: Use `executeBatch()` for multiple independent queries
6. **Cache parsed results**: Parser output can be safely cached

## TypeScript Types

All query results are fully typed:

```typescript
import type { SearchResult, SearchHit } from '../types/search.js';
import type { AggregateResult, AggregateGroup } from '../types/aggregate.js';

const result: SearchResult = parseGraphQLResponse(data, 'Article');
const hit: SearchHit = result.objects[0];

const aggResult: AggregateResult = parseAggregateResult(data, 'Product');
const group: AggregateGroup = aggResult.groups[0];
```
