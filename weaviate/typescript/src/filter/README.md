# Weaviate Filter Builder

A fluent TypeScript API for building Weaviate where filters with type safety and optimization.

## Features

- **Fluent API**: Chain methods to build complex filters
- **Type Safety**: Full TypeScript support with type checking
- **Validation**: Validate filters against schema before execution
- **Optimization**: Automatic filter optimization for better performance
- **Serialization**: Convert filters to GraphQL or REST API format

## Quick Start

### Simple Filters

```typescript
import { Filter } from './filter';

// Equal filter
const filter1 = Filter.property("category").equal("science");

// Comparison filters
const filter2 = Filter.property("year").greaterThan(2020);
const filter3 = Filter.property("price").lessThanEqual(99.99);

// Text matching with wildcards
const filter4 = Filter.property("title").like("*vector*");

// Array filters
const filter5 = Filter.property("tags").containsAny(["ai", "ml", "nlp"]);
const filter6 = Filter.property("categories").containsAll(["tech", "science"]);

// Null checks
const filter7 = Filter.property("deletedAt").isNull(true);
```

### Combining Filters

```typescript
// AND combination
const andFilter = Filter.and(
  Filter.property("year").greaterThan(2020),
  Filter.property("category").equal("science"),
  Filter.property("tags").containsAny(["ai", "ml"])
);

// OR combination
const orFilter = Filter.or(
  Filter.property("category").equal("science"),
  Filter.property("category").equal("technology")
);

// Nested combinations
const complexFilter = Filter.and(
  Filter.property("year").greaterThan(2020),
  Filter.or(
    Filter.property("category").equal("science"),
    Filter.property("category").equal("technology")
  )
);
```

### Geographic Filters

```typescript
// Find locations within 10km of San Francisco
const geoFilter = Filter.property("location").withinGeoRange(
  37.7749,  // latitude
  -122.4194, // longitude
  10         // distance in km
);
```

### Nested Property Paths

```typescript
// For cross-reference properties
const nestedFilter = Filter.propertyPath(["author", "name"]).equal("John Doe");
```

## Serialization

### GraphQL Format

```typescript
import { serializeFilter } from './filter';

const filter = Filter.property("year").greaterThan(2020);
const graphql = serializeFilter(filter);
// Returns: "{ path: ["year"], operator: GreaterThan, valueInt: 2020 }"
```

### REST API Format

```typescript
import { serializeFilterJSON } from './filter';

const filter = Filter.property("year").greaterThan(2020);
const json = serializeFilterJSON(filter);
// Returns: { path: ["year"], operator: "GreaterThan", valueInt: 2020 }
```

### Complete GraphQL Where Clause

```typescript
import { buildWhereClause } from './filter';

const filter = Filter.property("category").equal("science");
const whereClause = buildWhereClause(filter);
// Returns: "where: { path: ["category"], operator: Equal, valueText: "science" }"
```

## Validation

Validate filters against a schema to ensure they reference valid properties and use compatible operators:

```typescript
import { validateFilter } from './filter';

const filter = Filter.property("year").greaterThan(2020);
const result = validateFilter(filter, schema);

if (!result.valid) {
  console.error('Filter validation failed:');
  result.errors.forEach(error => {
    console.error(`- ${error.message}`);
  });
}
```

## Optimization

Optimize filters for better query performance:

```typescript
import { optimizeFilter } from './filter';

const filter = Filter.and(
  Filter.property("tags").containsAny(["ai"]),
  Filter.property("id").equal("123"), // More selective
  Filter.property("year").greaterThan(2020)
);

const optimized = optimizeFilter(filter, schema);
// Reorders filters by selectivity (most selective first)
```

## Advanced Features

### Selectivity Estimation

```typescript
import { estimateSelectivity } from './filter';

const filter = Filter.property("id").equal("123");
const selectivity = estimateSelectivity(filter, schema);
// Returns: 0.05 (very selective)
```

### Filter Flattening

```typescript
import { flattenNestedFilters } from './filter';

const nested = Filter.and(
  Filter.and(
    Filter.property("a").equal(1),
    Filter.property("b").equal(2)
  ),
  Filter.property("c").equal(3)
);

const flattened = flattenNestedFilters(nested);
// Transforms to: AND(a=1, b=2, c=3)
```

### Remove Redundancies

```typescript
import { removeRedundantFilters } from './filter';

const redundant = Filter.and(
  Filter.property("year").greaterThan(2020),
  Filter.property("year").greaterThan(2020), // Duplicate
  Filter.property("category").equal("science")
);

const cleaned = removeRedundantFilters(redundant);
// Removes duplicate year filter
```

## Operator Compatibility

Check if an operator is compatible with a data type:

```typescript
import { isOperatorCompatible } from './filter';

isOperatorCompatible(FilterOperator.GreaterThan, 'int');    // true
isOperatorCompatible(FilterOperator.GreaterThan, 'text');   // true
isOperatorCompatible(FilterOperator.Like, 'text');          // true
isOperatorCompatible(FilterOperator.Like, 'int');           // false
isOperatorCompatible(FilterOperator.ContainsAny, 'text[]'); // true
```

## Complete Example

```typescript
import {
  Filter,
  serializeFilter,
  validateFilter,
  optimizeFilter
} from './filter';

// Build a complex filter
const filter = Filter.and(
  Filter.property("year").greaterThan(2020),
  Filter.or(
    Filter.property("category").equal("science"),
    Filter.property("category").equal("technology")
  ),
  Filter.property("tags").containsAny(["ai", "ml", "deep-learning"]),
  Filter.property("publishedAt").isNull(false)
);

// Validate against schema
const validation = validateFilter(filter, schema);
if (!validation.valid) {
  throw new Error(`Invalid filter: ${validation.errors.map(e => e.message).join(', ')}`);
}

// Optimize for performance
const optimized = optimizeFilter(filter, schema);

// Serialize for GraphQL query
const graphql = serializeFilter(optimized);

// Use in a query
const query = `
  {
    Get {
      Article(
        ${buildWhereClause(optimized)}
        limit: 10
      ) {
        title
        content
        _additional { id distance }
      }
    }
  }
`;
```

## API Reference

### Filter Class

- `Filter.property(path: string): FilterBuilder` - Start building a filter
- `Filter.propertyPath(path: string[]): FilterBuilder` - Build filter with nested path
- `Filter.and(...filters: WhereFilter[]): WhereFilter` - Combine with AND
- `Filter.or(...filters: WhereFilter[]): WhereFilter` - Combine with OR

### FilterBuilder Methods

- `equal<T>(value: T): WhereFilter` - Equal operator
- `notEqual<T>(value: T): WhereFilter` - Not equal operator
- `greaterThan<T>(value: T): WhereFilter` - Greater than operator
- `greaterThanEqual<T>(value: T): WhereFilter` - Greater than or equal operator
- `lessThan<T>(value: T): WhereFilter` - Less than operator
- `lessThanEqual<T>(value: T): WhereFilter` - Less than or equal operator
- `like(pattern: string): WhereFilter` - Wildcard text matching
- `containsAny(values: string[] | number[]): WhereFilter` - Array contains any
- `containsAll(values: string[] | number[]): WhereFilter` - Array contains all
- `isNull(isNull?: boolean): WhereFilter` - Null check
- `withinGeoRange(lat: number, lon: number, distanceKm: number): WhereFilter` - Geographic range

### Serialization Functions

- `serializeFilter(filter: WhereFilter): string` - To GraphQL
- `serializeFilterJSON(filter: WhereFilter): object` - To JSON
- `buildWhereClause(filter: WhereFilter): string` - Complete where clause

### Validation Functions

- `validateFilter(filter: WhereFilter, schema: ClassDefinition): FilterValidationResult`
- `validateOperand(operand: FilterOperand, schema: ClassDefinition): ValidationError[]`
- `validatePropertyPath(path: string[], schema: ClassDefinition): ValidationError[]`
- `isPropertyFilterable(property: PropertyDefinition): boolean`

### Optimization Functions

- `optimizeFilter(filter: WhereFilter, schema: ClassDefinition): WhereFilter`
- `estimateSelectivity(filter: WhereFilter, schema: ClassDefinition): number`
- `flattenNestedFilters(filter: WhereFilter): WhereFilter`
- `reorderBySelectivity(filters: WhereFilter[], schema: ClassDefinition): WhereFilter[]`
- `removeRedundantFilters(filter: WhereFilter): WhereFilter`

## Filter Operators

- `Equal` - Equal to (=)
- `NotEqual` - Not equal to (!=)
- `GreaterThan` - Greater than (>)
- `GreaterThanEqual` - Greater than or equal (>=)
- `LessThan` - Less than (<)
- `LessThanEqual` - Less than or equal (<=)
- `Like` - Wildcard text matching (?, *)
- `ContainsAny` - Array contains any value
- `ContainsAll` - Array contains all values
- `IsNull` - Null check
- `WithinGeoRange` - Geographic range query

## License

See main integration LICENSE file.
