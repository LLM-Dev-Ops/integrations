# FilterBuilder Quick Reference

## Import

```typescript
import { FilterBuilder } from './filter';
```

## Basic Usage

```typescript
const filter = new FilterBuilder()
  .fieldMatch('status', 'active')
  .build();
```

## Method Reference

### Field Matching

| Method | Description | Example |
|--------|-------------|---------|
| `fieldMatch(key, value)` | Exact match | `.fieldMatch('status', 'active')` |
| `fieldMatchAny(key, values)` | Match any | `.fieldMatchAny('tags', ['a', 'b'])` |

### Ranges

| Method | Description | Example |
|--------|-------------|---------|
| `fieldRange(key, range)` | Custom range | `.fieldRange('price', {gte: 10, lte: 100})` |
| `fieldGte(key, value)` | Greater or equal | `.fieldGte('age', 18)` |
| `fieldGt(key, value)` | Greater than | `.fieldGt('score', 0.5)` |
| `fieldLte(key, value)` | Less or equal | `.fieldLte('price', 1000)` |
| `fieldLt(key, value)` | Less than | `.fieldLt('count', 100)` |
| `fieldBetween(key, min, max)` | Between (inclusive) | `.fieldBetween('rating', 3, 5)` |

### Geographic

| Method | Description | Example |
|--------|-------------|---------|
| `geoRadius(key, lat, lon, meters)` | Radius search | `.geoRadius('loc', 40.7, -74.0, 5000)` |
| `geoBoundingBox(key, tl, br)` | Bounding box | `.geoBoundingBox('loc', {lat:40.8, lon:-74.1}, {lat:40.7, lon:-74.0})` |

### Existence

| Method | Description | Example |
|--------|-------------|---------|
| `fieldExists(key)` | Field not empty | `.fieldExists('description')` |
| `fieldIsNull(key)` | Field is null | `.fieldIsNull('deletedAt')` |
| `fieldIsNotNull(key)` | Field not null | `.fieldIsNotNull('publishedAt')` |

### Special

| Method | Description | Example |
|--------|-------------|---------|
| `hasId(ids)` | Filter by IDs | `.hasId(['id1', 'id2'])` |
| `nested(key, filter)` | Nested filter | `.nested('items', itemFilter)` |

### Boolean Logic

| Method | Description | Example |
|--------|-------------|---------|
| `or(builder)` | Combine with OR | `.or(otherBuilder)` |
| `not(condition)` | Negate condition | `.not(condition)` |
| `must(condition)` | Add must condition | `.must(condition)` |
| `should(condition)` | Add should condition | `.should(condition)` |
| `minShouldMatch(n)` | Min should matches | `.minShouldMatch(2)` |

### Build & Validate

| Method | Description | Example |
|--------|-------------|---------|
| `build()` | Build filter | `.build()` |
| `validate()` | Validate filter | `.validate()` |

## Common Patterns

### E-commerce Product Filter
```typescript
new FilterBuilder()
  .fieldMatch('category', 'electronics')
  .fieldMatchAny('brand', ['apple', 'samsung'])
  .fieldBetween('price', 100, 1000)
  .fieldGte('rating', 4.0)
  .build();
```

### Location Search
```typescript
new FilterBuilder()
  .geoRadius('location', 40.7128, -74.0060, 10000)
  .fieldMatch('type', 'restaurant')
  .fieldGte('rating', 4.5)
  .build();
```

### Nested Array Filter
```typescript
const variantFilter = new FilterBuilder()
  .fieldMatch('color', 'red')
  .fieldGte('stock', 1)
  .build();

new FilterBuilder()
  .nested('variants', variantFilter)
  .build();
```

### OR Combination
```typescript
const filter1 = new FilterBuilder().fieldMatch('urgent', true);
const filter2 = new FilterBuilder().fieldMatch('priority', 'high');
filter1.or(filter2).build();
```

## Type Reference

### Filter
```typescript
interface Filter {
  must: Condition[];
  should: Condition[];
  mustNot: Condition[];
  minShould?: MinShould;
}
```

### Range
```typescript
interface Range {
  gte?: number;  // >=
  gt?: number;   // >
  lte?: number;  // <=
  lt?: number;   // <
}
```

### GeoPoint
```typescript
interface GeoPoint {
  lat: number;  // -90 to 90
  lon: number;  // -180 to 180
}
```

## Error Handling

```typescript
try {
  const filter = new FilterBuilder()
    .fieldBetween('price', 1000, 100)  // Invalid!
    .build();
} catch (error) {
  console.error(error.message);
}
```

## Validation

```typescript
const builder = new FilterBuilder()
  .fieldMatch('status', 'active');

const result = builder.validate();
if (!result.isValid) {
  console.error(result.errors);
}
```
