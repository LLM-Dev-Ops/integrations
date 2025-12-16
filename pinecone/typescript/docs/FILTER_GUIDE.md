# Pinecone Metadata Filter Guide

This guide provides comprehensive documentation for using the Pinecone metadata filtering system, including the filter types and the fluent FilterBuilder API.

## Table of Contents

- [Overview](#overview)
- [Filter Types](#filter-types)
- [Filter Builder](#filter-builder)
- [Basic Usage](#basic-usage)
- [Advanced Usage](#advanced-usage)
- [API Reference](#api-reference)
- [Examples](#examples)

## Overview

Pinecone supports metadata filtering to narrow down query results based on metadata field values. The filter system supports:

- **Comparison operators**: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`
- **Logical operators**: `$and`, `$or`
- **Nested conditions**: Complex filters with multiple levels of logical operators

The Pinecone integration provides two ways to construct filters:

1. **Manual construction**: Build filter objects directly using TypeScript types
2. **Fluent builder**: Use the `FilterBuilder` class for a chainable, type-safe API

## Filter Types

### MetadataValue

Represents the types of values that can be stored in Pinecone metadata:

```typescript
type MetadataValue = string | number | boolean | string[];
```

### Metadata

A record mapping field names to metadata values:

```typescript
type Metadata = Record<string, MetadataValue>;
```

### ComparisonOperator

Enum of available comparison operators:

```typescript
enum ComparisonOperator {
  Eq = "$eq",      // Equal to
  Ne = "$ne",      // Not equal to
  Gt = "$gt",      // Greater than
  Gte = "$gte",    // Greater than or equal to
  Lt = "$lt",      // Less than
  Lte = "$lte",    // Less than or equal to
  In = "$in",      // In array
  Nin = "$nin",    // Not in array
}
```

### LogicalOperator

Enum of logical operators for combining conditions:

```typescript
enum LogicalOperator {
  And = "$and",    // All conditions must be true
  Or = "$or",      // At least one condition must be true
}
```

### FieldCondition

Defines comparison operations on a single field:

```typescript
interface FieldCondition {
  $eq?: MetadataValue;
  $ne?: MetadataValue;
  $gt?: number;
  $gte?: number;
  $lt?: number;
  $lte?: number;
  $in?: MetadataValue[];
  $nin?: MetadataValue[];
}
```

### FilterCondition

Union type representing any filter condition:

```typescript
type FilterCondition =
  | { $and: FilterCondition[] }
  | { $or: FilterCondition[] }
  | { [field: string]: FieldCondition };
```

### MetadataFilter

The top-level filter type used in queries:

```typescript
type MetadataFilter = FilterCondition;
```

## Filter Builder

The `FilterBuilder` class provides a fluent, chainable API for constructing metadata filters.

### Creating a Builder

```typescript
import { FilterBuilder, filter } from "./types/filter-builder.js";

// Using the static method
const builder1 = FilterBuilder.new();

// Using the convenience function
const builder2 = filter();
```

### Builder Methods

#### Logical Operators

- **`and()`**: Set the logical operator to AND (default)
- **`or()`**: Set the logical operator to OR

#### Comparison Methods

- **`eq(field: string, value: MetadataValue)`**: Equal to
- **`ne(field: string, value: MetadataValue)`**: Not equal to
- **`gt(field: string, value: number)`**: Greater than
- **`gte(field: string, value: number)`**: Greater than or equal to
- **`lt(field: string, value: number)`**: Less than
- **`lte(field: string, value: number)`**: Less than or equal to
- **`in(field: string, values: MetadataValue[])`**: In array
- **`nin(field: string, values: MetadataValue[])`**: Not in array

#### Building

- **`build()`**: Construct the final `MetadataFilter` object

## Basic Usage

### Simple Equality Filter

```typescript
import { FilterBuilder } from "./types/filter-builder.js";

const filter = FilterBuilder.new()
  .eq("status", "active")
  .build();

// Result: { "status": { "$eq": "active" } }
```

### Multiple Conditions (AND)

```typescript
const filter = FilterBuilder.new()
  .and()
  .eq("status", "active")
  .gte("age", 18)
  .build();

// Result:
// {
//   "$and": [
//     { "status": { "$eq": "active" } },
//     { "age": { "$gte": 18 } }
//   ]
// }
```

### Multiple Conditions (OR)

```typescript
const filter = FilterBuilder.new()
  .or()
  .eq("country", "US")
  .eq("country", "CA")
  .build();

// Result:
// {
//   "$or": [
//     { "country": { "$eq": "US" } },
//     { "country": { "$eq": "CA" } }
//   ]
// }
```

### Range Queries

```typescript
const filter = FilterBuilder.new()
  .gte("age", 18)
  .lte("age", 65)
  .build();

// Result:
// {
//   "$and": [
//     { "age": { "$gte": 18 } },
//     { "age": { "$lte": 65 } }
//   ]
// }
```

### Array Operators

```typescript
// In operator
const filter = FilterBuilder.new()
  .in("category", ["premium", "gold", "platinum"])
  .build();

// Result: { "category": { "$in": ["premium", "gold", "platinum"] } }

// Not-in operator
const filter2 = FilterBuilder.new()
  .nin("status", ["deleted", "archived"])
  .build();

// Result: { "status": { "$nin": ["deleted", "archived"] } }
```

## Advanced Usage

### Complex Filters with Manual Construction

For complex nested conditions, you may need to construct the filter manually:

```typescript
import type { MetadataFilter } from "./types/filter.js";

const complexFilter: MetadataFilter = {
  $and: [
    { age: { $gte: 18, $lte: 65 } },
    {
      $or: [
        { country: { $eq: "US" } },
        { country: { $eq: "CA" } },
      ],
    },
    { status: { $eq: "active" } },
  ],
};
```

### Combining Different Operators

```typescript
const filter = FilterBuilder.new()
  .and()
  .eq("type", "user")
  .ne("role", "admin")
  .gte("credits", 100)
  .in("tier", ["premium", "enterprise"])
  .build();

// Result:
// {
//   "$and": [
//     { "type": { "$eq": "user" } },
//     { "role": { "$ne": "admin" } },
//     { "credits": { "$gte": 100 } },
//     { "tier": { "$in": ["premium", "enterprise"] } }
//   ]
// }
```

### Using with Pinecone Queries

```typescript
import { FilterBuilder } from "./types/filter-builder.js";
import type { QueryRequest } from "./types/query.js";

// Build the filter
const metadataFilter = FilterBuilder.new()
  .and()
  .eq("document_type", "article")
  .gte("views", 1000)
  .in("category", ["technology", "science"])
  .build();

// Use in a query
const queryRequest: QueryRequest = {
  vector: [0.1, 0.2, 0.3, /* ... */],
  topK: 10,
  filter: metadataFilter,
  includeMetadata: true,
};
```

## API Reference

### Type Guards

The filter module provides type guards for runtime type checking:

#### `isAndCondition(condition: FilterCondition): boolean`

Checks if a condition is an AND condition.

```typescript
import { isAndCondition } from "./types/filter.js";

if (isAndCondition(condition)) {
  // TypeScript knows condition has $and property
  console.log(condition.$and.length);
}
```

#### `isOrCondition(condition: FilterCondition): boolean`

Checks if a condition is an OR condition.

```typescript
import { isOrCondition } from "./types/filter.js";

if (isOrCondition(condition)) {
  // TypeScript knows condition has $or property
  console.log(condition.$or.length);
}
```

#### `isFieldCondition(condition: FilterCondition): boolean`

Checks if a condition is a field-level condition.

```typescript
import { isFieldCondition } from "./types/filter.js";

if (isFieldCondition(condition)) {
  // TypeScript knows condition is a field filter
  const fields = Object.keys(condition);
}
```

## Examples

### User Search Filter

```typescript
const userFilter = FilterBuilder.new()
  .and()
  .eq("user_type", "premium")
  .gte("age", 18)
  .in("country", ["US", "CA", "UK"])
  .eq("verified", true)
  .build();
```

### E-commerce Product Filter

```typescript
const productFilter = FilterBuilder.new()
  .and()
  .in("category", ["electronics", "computers"])
  .gte("price", 100)
  .lte("price", 1000)
  .eq("in_stock", true)
  .build();
```

### Content Moderation Filter

```typescript
const moderationFilter = FilterBuilder.new()
  .or()
  .eq("flagged", true)
  .gte("reports", 5)
  .in("status", ["under_review", "flagged"])
  .build();
```

### Multi-Tier Access Filter

```typescript
const accessFilter: MetadataFilter = {
  $and: [
    { enabled: { $eq: true } },
    {
      $or: [
        { role: { $eq: "admin" } },
        { role: { $eq: "moderator" } },
        {
          $and: [
            { role: { $eq: "user" } },
            { verified: { $eq: true } },
            { tier: { $in: ["premium", "enterprise"] } },
          ],
        },
      ],
    },
  ],
};
```

## Best Practices

1. **Use the FilterBuilder for simple filters**: The fluent API provides better readability and type safety.

2. **Manually construct complex nested filters**: For filters with multiple levels of AND/OR nesting, manual construction may be clearer.

3. **Combine range operators on the same field**: Use `$gte` and `$lte` together for range queries.

4. **Prefer `$in` over multiple OR conditions**: Instead of multiple `$eq` checks with OR, use `$in` with an array.

5. **Keep metadata fields indexed**: Ensure frequently filtered fields are properly indexed in Pinecone for optimal performance.

6. **Test filters independently**: Verify filter logic with unit tests before integrating into queries.

## Performance Considerations

- **Filter selectivity**: More selective filters (those that match fewer records) improve query performance.
- **Field cardinality**: Filtering on fields with many unique values (high cardinality) can be less efficient.
- **Nested conditions**: Deeply nested logical operators may impact performance; prefer flatter structures when possible.
- **Array size**: For `$in` and `$nin` operators, keep array sizes reasonable (typically < 100 values).

## Further Reading

- [Pinecone Metadata Filtering Documentation](https://docs.pinecone.io/docs/metadata-filtering)
- [SPARC Specification for Pinecone Integration](/plans/pinecone/specification-pinecone.md)
- [Filter Examples](/examples/filter-examples.ts)
