# Pinecone Filter Quick Reference

## Import

```typescript
import { FilterBuilder, filter } from "./types/filter-builder.js";
import type { MetadataFilter } from "./types/filter.js";
```

## Quick Examples

### Single Condition

```typescript
// Equality
filter().eq("status", "active").build()
// => { "status": { "$eq": "active" } }

// Greater than
filter().gt("age", 18).build()
// => { "age": { "$gt": 18 } }

// In array
filter().in("tier", ["premium", "gold"]).build()
// => { "tier": { "$in": ["premium", "gold"] } }
```

### Multiple Conditions (AND)

```typescript
filter()
  .and()  // default, can be omitted
  .eq("status", "active")
  .gte("age", 18)
  .build()
// => { "$and": [{ "status": { "$eq": "active" } }, { "age": { "$gte": 18 } }] }
```

### Multiple Conditions (OR)

```typescript
filter()
  .or()
  .eq("country", "US")
  .eq("country", "CA")
  .build()
// => { "$or": [{ "country": { "$eq": "US" } }, { "country": { "$eq": "CA" } }] }
```

### Range Query

```typescript
filter()
  .gte("price", 100)
  .lte("price", 1000)
  .build()
// => { "$and": [{ "price": { "$gte": 100 } }, { "price": { "$lte": 1000 } }] }
```

## All Operators

| Method | Operator | Description | Example |
|--------|----------|-------------|---------|
| `eq(field, value)` | `$eq` | Equal to | `.eq("status", "active")` |
| `ne(field, value)` | `$ne` | Not equal to | `.ne("role", "admin")` |
| `gt(field, value)` | `$gt` | Greater than | `.gt("age", 18)` |
| `gte(field, value)` | `$gte` | Greater than or equal | `.gte("score", 50)` |
| `lt(field, value)` | `$lt` | Less than | `.lt("count", 100)` |
| `lte(field, value)` | `$lte` | Less than or equal | `.lte("price", 999)` |
| `in(field, values)` | `$in` | In array | `.in("tier", ["a", "b"])` |
| `nin(field, values)` | `$nin` | Not in array | `.nin("status", ["deleted"])` |

## Logical Operators

| Method | Operator | Description |
|--------|----------|-------------|
| `and()` | `$and` | All conditions must be true (default) |
| `or()` | `$or` | At least one condition must be true |

## Common Patterns

### User Filter
```typescript
filter()
  .eq("type", "user")
  .eq("verified", true)
  .gte("age", 18)
  .in("country", ["US", "CA", "UK"])
  .build()
```

### Product Filter
```typescript
filter()
  .in("category", ["electronics", "computers"])
  .gte("price", 100)
  .lte("price", 1000)
  .eq("in_stock", true)
  .build()
```

### Multi-Status Filter
```typescript
filter()
  .or()
  .eq("status", "active")
  .eq("status", "pending")
  .eq("status", "processing")
  .build()
```

### Complex Nested (Manual)
```typescript
const complexFilter: MetadataFilter = {
  $and: [
    { age: { $gte: 18, $lte: 65 } },
    {
      $or: [
        { country: { $eq: "US" } },
        { country: { $eq: "CA" } }
      ]
    },
    { status: { $eq: "active" } }
  ]
};
```

## Type Guards

```typescript
import { isAndCondition, isOrCondition, isFieldCondition } from "./types/filter.js";

if (isAndCondition(filter)) {
  console.log(filter.$and.length);
}

if (isOrCondition(filter)) {
  console.log(filter.$or.length);
}

if (isFieldCondition(filter)) {
  const fields = Object.keys(filter);
}
```

## Usage with Queries

```typescript
import type { QueryRequest } from "./types/query.js";

const queryRequest: QueryRequest = {
  vector: [0.1, 0.2, 0.3, /* ... */],
  topK: 10,
  filter: filter()
    .eq("status", "active")
    .gte("score", 50)
    .build(),
  includeMetadata: true,
};
```

## Serialization Format

The filters serialize to Pinecone's expected JSON format:

```typescript
// Single field
{ "field": { "$eq": "value" } }

// Multiple with AND
{ "$and": [
  { "field1": { "$eq": "value1" } },
  { "field2": { "$gt": 10 } }
]}

// Multiple with OR
{ "$or": [
  { "field1": { "$eq": "value1" } },
  { "field2": { "$eq": "value2" } }
]}

// Nested
{
  "$and": [
    { "field1": { "$eq": "value1" } },
    {
      "$or": [
        { "field2": { "$eq": "value2" } },
        { "field3": { "$eq": "value3" } }
      ]
    }
  ]
}
```
