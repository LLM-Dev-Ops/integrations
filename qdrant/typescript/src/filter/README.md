# Qdrant Filter Builder

Type-safe filter construction for Qdrant vector searches following the SPARC specification.

## Overview

The FilterBuilder provides a fluent API for building complex filters with support for:

- **Must conditions** (AND logic)
- **Should conditions** (OR logic)
- **Must_not conditions** (NOT logic)
- **Field matching** (exact match, match any)
- **Numeric ranges** (gte, gt, lte, lt, between)
- **Geographic filters** (radius, bounding box)
- **Existence checks** (exists, is null)
- **Nested filters** (for array elements)
- **ID filtering** (filter by point IDs)
- **Validation** (comprehensive filter validation)

## Basic Usage

### Exact Match

```typescript
import { FilterBuilder } from './filter';

const filter = new FilterBuilder()
  .fieldMatch('category', 'electronics')
  .fieldMatch('status', 'active')
  .fieldMatch('inStock', true)
  .build();
```

### Match Any (OR within field)

```typescript
const filter = new FilterBuilder()
  .fieldMatchAny('brand', ['apple', 'samsung', 'google'])
  .build();
```

## Range Filtering

### Basic Range

```typescript
const filter = new FilterBuilder()
  .fieldRange('price', { gte: 100, lte: 500 })
  .build();
```

### Convenience Methods

```typescript
// Greater than or equal
const filter1 = new FilterBuilder()
  .fieldGte('age', 18)
  .build();

// Less than or equal
const filter2 = new FilterBuilder()
  .fieldLte('price', 1000)
  .build();

// Between (inclusive)
const filter3 = new FilterBuilder()
  .fieldBetween('rating', 3.5, 5.0)
  .build();

// Greater than (exclusive)
const filter4 = new FilterBuilder()
  .fieldGt('score', 0.5)
  .build();

// Less than (exclusive)
const filter5 = new FilterBuilder()
  .fieldLt('quantity', 100)
  .build();
```

## Geographic Filtering

### Radius Search

```typescript
// Find locations within 5km of New York City
const filter = new FilterBuilder()
  .geoRadius('location', 40.7128, -74.0060, 5000) // lat, lon, radius in meters
  .build();
```

### Bounding Box Search

```typescript
// Find locations within a rectangular area
const filter = new FilterBuilder()
  .geoBoundingBox(
    'location',
    { lat: 40.8, lon: -74.1 },  // Top-left corner
    { lat: 40.7, lon: -74.0 }   // Bottom-right corner
  )
  .build();
```

## Existence Checks

### Field Exists

```typescript
const filter = new FilterBuilder()
  .fieldExists('description')  // Field must not be empty
  .build();
```

### Null Checks

```typescript
// Field is null
const filter1 = new FilterBuilder()
  .fieldIsNull('deletedAt')
  .build();

// Field is not null
const filter2 = new FilterBuilder()
  .fieldIsNotNull('publishedAt')
  .build();
```

## Point ID Filtering

```typescript
// Filter by UUID strings
const filter1 = new FilterBuilder()
  .hasId(['uuid-1', 'uuid-2', 'uuid-3'])
  .build();

// Filter by numeric IDs
const filter2 = new FilterBuilder()
  .hasId([1, 2, 3, 4, 5])
  .build();
```

## Nested Filters

For filtering on array elements:

```typescript
// Create filter for array elements
const variantFilter = new FilterBuilder()
  .fieldMatch('color', 'red')
  .fieldGte('stock', 1)
  .build();

// Apply to nested array field
const filter = new FilterBuilder()
  .fieldMatch('category', 'clothing')
  .nested('variants', variantFilter)
  .build();

// This will match products where:
// - category is 'clothing' AND
// - at least one variant has color='red' AND stock >= 1
```

## Boolean Logic

### Combining Filters with OR

```typescript
const categoryFilter = new FilterBuilder()
  .fieldMatch('category', 'electronics');

const brandFilter = new FilterBuilder()
  .fieldMatch('brand', 'apple');

// Match electronics OR apple brand
const filter = categoryFilter.or(brandFilter).build();
```

### NOT Logic

```typescript
import { Condition } from './filter';

const deletedCondition: Condition = {
  type: 'Field',
  condition: {
    key: 'status',
    match: { type: 'Keyword', value: 'deleted' }
  }
};

const filter = new FilterBuilder()
  .fieldMatch('category', 'electronics')
  .not(deletedCondition)  // Exclude deleted items
  .build();
```

### Should with Minimum Match

```typescript
import { Condition } from './filter';

const condition1: Condition = {
  type: 'Field',
  condition: { key: 'premium', match: { type: 'Bool', value: true } }
};
const condition2: Condition = {
  type: 'Field',
  condition: { key: 'verified', match: { type: 'Bool', value: true } }
};
const condition3: Condition = {
  type: 'Field',
  condition: { key: 'featured', match: { type: 'Bool', value: true } }
};

const filter = new FilterBuilder()
  .should(condition1)
  .should(condition2)
  .should(condition3)
  .minShouldMatch(2)  // At least 2 of the 3 must match
  .build();
```

## Complex Examples

### E-commerce Product Search

```typescript
const filter = new FilterBuilder()
  .fieldMatch('category', 'electronics')
  .fieldMatchAny('brand', ['apple', 'samsung', 'sony'])
  .fieldBetween('price', 100, 1000)
  .fieldGte('rating', 4.0)
  .fieldIsNotNull('availability')
  .build();
```

### Location-based Search with Multiple Criteria

```typescript
const filter = new FilterBuilder()
  .geoRadius('location', 40.7128, -74.0060, 10000) // 10km radius
  .fieldMatch('type', 'restaurant')
  .fieldGte('rating', 4.5)
  .fieldMatch('openNow', true)
  .build();
```

### Document Search with Metadata

```typescript
const filter = new FilterBuilder()
  .fieldMatchAny('documentType', ['article', 'blog', 'documentation'])
  .fieldGte('publishedDate', 1640000000) // Unix timestamp
  .fieldMatch('language', 'en')
  .fieldExists('summary')
  .build();
```

### Multi-condition with OR Logic

```typescript
// High priority OR urgent
const priorityFilter = new FilterBuilder()
  .fieldMatch('priority', 'high');

const urgentFilter = new FilterBuilder()
  .fieldMatch('urgent', true);

const filter = priorityFilter
  .or(urgentFilter)
  .fieldMatch('status', 'open')
  .fieldIsNotNull('assignee')
  .build();
```

## Validation

The FilterBuilder includes comprehensive validation:

```typescript
const builder = new FilterBuilder()
  .fieldMatch('category', 'electronics')
  .fieldBetween('price', 100, 500);

const validation = builder.validate();

if (!validation.isValid) {
  console.error('Validation errors:', validation.errors);
  for (const error of validation.errors) {
    console.error(`- ${error.message} (${error.code})`);
  }
}

if (validation.warnings.length > 0) {
  console.warn('Validation warnings:', validation.warnings);
}

const filter = builder.build();
```

### Validation Checks

The validator checks for:

- Empty filters (warning)
- Invalid field keys
- Invalid ranges (min > max)
- Invalid geographic coordinates
- Invalid point IDs
- Empty match arrays
- Conflicting conditions
- Excessive nesting depth (max 10 levels)

## Type Definitions

### Filter Structure

```typescript
interface Filter {
  must: Condition[];      // AND logic
  should: Condition[];    // OR logic
  mustNot: Condition[];   // NOT logic
  minShould?: MinShould;  // Minimum number of should conditions
}
```

### Condition Types

```typescript
type Condition =
  | { type: 'Field'; condition: FieldCondition }
  | { type: 'HasId'; condition: HasIdCondition }
  | { type: 'Nested'; condition: NestedCondition }
  | { type: 'Filter'; filter: Filter };
```

### Field Condition

```typescript
interface FieldCondition {
  key: string;
  match?: MatchValue;
  range?: Range;
  geoBoundingBox?: GeoBoundingBox;
  geoRadius?: GeoRadius;
  isEmpty?: boolean;
  isNull?: boolean;
}
```

## Error Handling

All builder methods validate inputs and throw descriptive errors:

```typescript
try {
  const filter = new FilterBuilder()
    .fieldBetween('price', 1000, 100)  // Invalid: min > max
    .build();
} catch (error) {
  console.error('Filter construction failed:', error.message);
  // "Invalid range for field 'price': min (1000) > max (100)"
}
```

## Best Practices

1. **Use type-safe methods**: Prefer `fieldMatch()`, `fieldGte()`, etc. over manual condition construction
2. **Validate before use**: Call `validate()` to catch issues early
3. **Keep nesting shallow**: Avoid deep nested filters (max 10 levels)
4. **Use appropriate match types**: Use `fieldMatchAny()` for OR within a field
5. **Check coordinates**: Ensure geographic coordinates are valid before filtering
6. **Combine logically**: Use `.or()` for alternative conditions, `.must()` for required ones

## Performance Considerations

- **Pre-filter optimization**: Qdrant applies filters before vector search for better performance
- **Index payload fields**: Create payload indices for frequently filtered fields
- **Limit nesting**: Deep nesting can impact query performance
- **Use appropriate conditions**: Exact match is faster than range queries
- **Geographic queries**: Bounding box is generally faster than radius for rectangular areas

## Integration with Qdrant

The Filter type is designed to be converted to Qdrant's native filter format:

```typescript
const filter = new FilterBuilder()
  .fieldMatch('category', 'electronics')
  .build();

// Use with Qdrant search
const searchResults = await qdrantClient.search({
  collection: 'products',
  vector: embeddings,
  filter: filter,  // Pass filter directly
  limit: 10
});
```

## License

Part of the LLM Dev Ops platform Qdrant integration module.
