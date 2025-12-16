# Weaviate GraphQL Module

This module provides a complete GraphQL interface for Weaviate operations including search, aggregation, and filtering.

## Overview

The GraphQL module consists of several components:

1. **Types** (`types.ts`) - Core GraphQL type definitions
2. **Query Builders** (`builder.ts`) - Fluent builders for Get and Aggregate queries
3. **Search Clause Builders** (`search-builder.ts`) - Functions to build search clauses
4. **Filter Builder** (`filter-builder.ts`) - Converts filters to GraphQL format
5. **Executor** (`executor.ts`) - Executes GraphQL queries with error handling
6. **Parser** (`parser.ts`) - Parses GraphQL responses to typed objects
7. **Error Handler** (`error.ts`) - Maps GraphQL errors to typed exceptions

## Usage Examples

### Basic Vector Search

```typescript
import {
  GetQueryBuilder,
  GraphQLExecutor,
  parseGraphQLResponse
} from './graphql/index.js';

// Build query
const query = new GetQueryBuilder('Article')
  .nearVector([0.1, 0.2, 0.3], { certainty: 0.7 })
  .limit(10)
  .properties(['title', 'content'])
  .additional(['id', 'distance'])
  .build();

// Execute
const executor = new GraphQLExecutor({ transport: httpClient });
const data = await executor.execute(query);

// Parse
const result = parseGraphQLResponse(data, 'Article');
console.log(result.objects); // Array of SearchHit
```

### Hybrid Search with Filter

```typescript
import { GetQueryBuilder } from './graphql/index.js';
import { FilterOperator } from '../types/filter.js';

const query = new GetQueryBuilder('Product')
  .hybrid('laptop computer', { alpha: 0.5 })
  .where({
    operator: 'And',
    operands: [
      {
        operator: 'Operand',
        operand: {
          path: ['price'],
          operator: FilterOperator.LessThan,
          value: 1000
        }
      },
      {
        operator: 'Operand',
        operand: {
          path: ['inStock'],
          operator: FilterOperator.Equal,
          value: true
        }
      }
    ]
  })
  .limit(20)
  .properties(['name', 'price', 'description'])
  .additional(['id', 'score'])
  .build();
```

### Aggregation Query

```typescript
import { AggregateQueryBuilder } from './graphql/index.js';
import { Aggregation } from '../types/aggregate.js';

const query = new AggregateQueryBuilder('Product')
  .groupBy(['category'])
  .field('price', [Aggregation.Mean, Aggregation.Minimum, Aggregation.Maximum])
  .field('rating', [Aggregation.Mean])
  .where({
    operator: 'Operand',
    operand: {
      path: ['inStock'],
      operator: FilterOperator.Equal,
      value: true
    }
  })
  .build();

const data = await executor.execute(query);
const result = parseAggregateResult(data, 'Product');

// Access aggregations
for (const group of result.groups) {
  console.log('Category:', group.groupedBy?.category);
  console.log('Average price:', group.aggregations.price.mean);
  console.log('Price range:', group.aggregations.price.minimum, '-', group.aggregations.price.maximum);
}
```

### Near Text Search with Move Parameters

```typescript
const query = new GetQueryBuilder('Article')
  .nearText(
    ['artificial intelligence', 'machine learning'],
    {
      certainty: 0.7,
      moveTo: {
        concepts: ['deep learning'],
        force: 0.5
      },
      moveAway: {
        concepts: ['statistics'],
        force: 0.3
      }
    }
  )
  .limit(10)
  .properties(['title', 'content', 'author'])
  .additional(['id', 'certainty'])
  .build();
```

### BM25 Keyword Search

```typescript
const query = new GetQueryBuilder('Article')
  .bm25('machine learning algorithms', ['title', 'content'])
  .limit(10)
  .properties(['title', 'content'])
  .additional(['id', 'score'])
  .build();
```

### Multi-Tenant Query

```typescript
const query = new GetQueryBuilder('Document')
  .nearVector([0.1, 0.2, 0.3])
  .tenant('tenant-123')
  .limit(10)
  .properties(['title', 'content'])
  .additional(['id', 'distance'])
  .build();
```

### Grouped Results

```typescript
const query = new GetQueryBuilder('Article')
  .nearVector([0.1, 0.2, 0.3])
  .groupBy({
    path: ['category'],
    groups: 5,
    objectsPerGroup: 3
  })
  .properties(['title', 'category'])
  .additional(['id', 'distance'])
  .build();
```

## Query Output Example

The builders generate properly formatted GraphQL queries:

```graphql
{
  Get {
    Article(
      nearVector: { vector: [0.1, 0.2, 0.3], certainty: 0.7 }
      where: { path: ["year"], operator: GreaterThan, valueInt: 2020 }
      limit: 10
    ) {
      title
      content
      _additional {
        id
        distance
        certainty
      }
    }
  }
}
```

## Error Handling

The module automatically maps GraphQL errors to typed exceptions:

```typescript
try {
  const result = await executor.execute(query);
} catch (error) {
  if (error instanceof ClassNotFoundError) {
    console.error('Class does not exist:', error.message);
  } else if (error instanceof InvalidFilterError) {
    console.error('Invalid filter:', error.message);
  } else if (error instanceof GraphQLError) {
    console.error('GraphQL errors:', error.errors);
  }
}
```

## Architecture

### Query Building Flow

1. Create builder instance (`GetQueryBuilder` or `AggregateQueryBuilder`)
2. Chain methods to configure the query
3. Call `build()` to generate GraphQL string

### Execution Flow

1. `GraphQLExecutor.execute()` sends query to Weaviate
2. Response is checked for errors
3. Errors are mapped to typed exceptions via `handleGraphQLErrors()`
4. Success data is returned

### Parsing Flow

1. Raw response is passed to `parseGraphQLResponse()`
2. Response type is detected (Get vs Aggregate)
3. Appropriate parser is called
4. Data is converted to typed TypeScript objects

## Type Safety

All components are fully typed:

- Query builders ensure valid query construction
- Parser converts to strongly-typed results
- Error handlers throw typed exceptions
- Filter serialization validates filter structure

## Performance Considerations

- Queries are built as strings (no runtime overhead)
- Minimal parsing overhead (simple JSON transformation)
- No unnecessary data copying
- Efficient error handling with early returns
