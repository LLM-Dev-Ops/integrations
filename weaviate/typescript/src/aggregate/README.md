# Weaviate Aggregation Module

Complete implementation of the aggregation service for Weaviate TypeScript integration, following the SPARC pseudocode specification (Section 7).

## Overview

The aggregation module provides powerful statistical analysis capabilities over Weaviate object collections. It supports:

- **Statistical Aggregations**: Count, Sum, Mean, Median, Mode, Minimum, Maximum
- **Text Aggregations**: Top occurrences, type counts
- **Boolean Aggregations**: True/false counts and percentages
- **Date Aggregations**: Min, max, mode, median dates
- **Reference Aggregations**: Counting references
- **Grouping**: Group results by one or more properties
- **Filtering**: Apply complex filters to select objects
- **Multi-tenancy**: Tenant-specific aggregations

## Architecture

### Files

```
aggregate/
├── index.ts          # Main exports and module documentation
├── service.ts        # AggregateService class - main entry point
├── builder.ts        # Fluent API query builder
├── graphql.ts        # GraphQL query construction
├── result.ts         # Result parsing and type conversion
├── examples.ts       # Usage examples
└── README.md         # This file
```

### Components

#### 1. AggregateService (`service.ts`)

Main service class that handles aggregation operations:

```typescript
class AggregateService {
  async aggregate(query: AggregateQuery): Promise<AggregateResult>
  async count(className: string, filter?: WhereFilter, tenant?: string): Promise<number>
  async metaCount(className: string, tenant?: string): Promise<number>
  async aggregateProperty(...): Promise<AggregateResult>
}
```

**Features:**
- GraphQL query execution with error handling
- Observability integration (tracing, metrics)
- Result parsing and type conversion
- Convenience methods for common operations

#### 2. AggregateQueryBuilder (`builder.ts`)

Fluent API for constructing aggregation queries:

```typescript
const query = AggregateQueryBuilder.forClass("Product")
  .groupBy(["category"])
  .filter(whereFilter)
  .field("price", [Aggregation.Mean, Aggregation.Count])
  .tenant("customer-123")
  .limit(10)
  .build();
```

**Methods:**
- `forClass(className)` - Start building a query
- `groupBy(properties)` - Group results by properties
- `filter(filter)` - Add where filter
- `tenant(tenant)` - Set tenant for multi-tenancy
- `field(property, aggregations, topOccurrencesLimit?)` - Add aggregation field
- `limit(limit)` - Limit number of groups
- `objectLimit(limit)` - Limit objects to aggregate
- `build()` - Build final query
- `buildCount()` - Build count-only query

#### 3. GraphQL Builder (`graphql.ts`)

Constructs GraphQL aggregation queries:

```typescript
function buildAggregateQuery(query: AggregateQuery): string
function buildAggregateField(field: AggregateField): string
function buildAggregationClause(aggregation: Aggregation, config?): string
function buildCountQuery(className, filter?, tenant?): string
```

**Output Example:**
```graphql
{
  Aggregate {
    Article(
      groupBy: ["category"]
      where: { path: ["year"], operator: GreaterThan, valueInt: 2020 }
    ) {
      meta { count }
      groupedBy { path value }
      wordCount { count mean minimum maximum }
      views { sum mean }
    }
  }
}
```

#### 4. Result Parser (`result.ts`)

Parses GraphQL responses into typed structures:

```typescript
function parseAggregateResult(data: any, className: string): AggregateResult
function parseAggregateGroup(data: any): AggregateGroup
function extractNumericAggregation(data: any): NumericAggregation
function extractTextAggregation(data: any): TextAggregation
function extractBooleanAggregation(data: any): BooleanAggregation
function extractDateAggregation(data: any): DateAggregation
function extractTopOccurrences(data: any): OccurrenceCount[]
```

**Features:**
- Type-safe result parsing
- Automatic type detection
- Date parsing from ISO strings
- Grouped result handling

## Usage Examples

### Basic Count

```typescript
import { AggregateService } from './aggregate';

const service = new AggregateService({
  graphqlExecutor: executor,
  observability: metrics
});

// Count all objects
const total = await service.count("Article");

// Count with filter
const published = await service.count("Article", {
  operator: 'Operand',
  operand: {
    path: ["status"],
    operator: FilterOperator.Equal,
    value: "published"
  }
});
```

### Numeric Aggregations

```typescript
import { AggregateQueryBuilder, Aggregation } from './aggregate';

const query = AggregateQueryBuilder.forClass("Product")
  .field("price", [
    Aggregation.Mean,
    Aggregation.Minimum,
    Aggregation.Maximum,
    Aggregation.Count
  ])
  .build();

const result = await service.aggregate(query);
const stats = result.groups[0].aggregations.price;

console.log(`Average: $${stats.mean}`);
console.log(`Range: $${stats.minimum} - $${stats.maximum}`);
console.log(`Products: ${stats.count}`);
```

### Grouping

```typescript
const query = AggregateQueryBuilder.forClass("Product")
  .groupBy(["category"])
  .field("price", [Aggregation.Mean, Aggregation.Count])
  .field("views", [Aggregation.Sum])
  .build();

const result = await service.aggregate(query);

for (const group of result.groups) {
  const category = group.groupedBy?.category;
  const avgPrice = group.aggregations.price.mean;
  const totalViews = group.aggregations.views.sum;

  console.log(`${category}: $${avgPrice} avg, ${totalViews} views`);
}
```

### Top Occurrences

```typescript
const query = AggregateQueryBuilder.forClass("Article")
  .field("tags", [Aggregation.TopOccurrences], 10)
  .build();

const result = await service.aggregate(query);
const topTags = result.groups[0].aggregations.tags.topOccurrences;

for (const tag of topTags) {
  console.log(`${tag.value}: ${tag.count} occurrences`);
}
```

### Complex Filter

```typescript
const query = AggregateQueryBuilder.forClass("Article")
  .field("views", [Aggregation.Sum, Aggregation.Mean])
  .filter({
    operator: 'And',
    operands: [
      {
        operator: 'Operand',
        operand: {
          path: ["status"],
          operator: FilterOperator.Equal,
          value: "published"
        }
      },
      {
        operator: 'Operand',
        operand: {
          path: ["year"],
          operator: FilterOperator.GreaterThanEqual,
          value: 2023
        }
      }
    ]
  })
  .build();

const result = await service.aggregate(query);
```

### Multi-Tenant

```typescript
// Count per tenant
const count = await service.count(
  "Article",
  undefined,
  "customer-123"
);

// Aggregate with tenant
const query = AggregateQueryBuilder.forClass("Product")
  .tenant("customer-123")
  .field("price", [Aggregation.Mean])
  .build();
```

## Aggregation Types

### Numeric Aggregations

- **Count**: Number of values
- **Sum**: Total sum of values
- **Mean**: Average value
- **Median**: Middle value
- **Mode**: Most common value
- **Minimum**: Smallest value
- **Maximum**: Largest value

```typescript
interface NumericAggregation {
  count?: number;
  sum?: number;
  mean?: number;
  median?: number;
  mode?: number;
  minimum?: number;
  maximum?: number;
}
```

### Text Aggregations

- **Count**: Number of values
- **Type**: Type statistics
- **TopOccurrences**: Most common values with counts

```typescript
interface TextAggregation {
  count?: number;
  type?: TypeCount[];
  topOccurrences?: OccurrenceCount[];
}
```

### Boolean Aggregations

- **Count**: Total count
- **TotalTrue**: Count of true values
- **TotalFalse**: Count of false values
- **PercentageTrue**: Percentage of true values
- **PercentageFalse**: Percentage of false values

```typescript
interface BooleanAggregation {
  count?: number;
  totalTrue?: number;
  totalFalse?: number;
  percentageTrue?: number;
  percentageFalse?: number;
}
```

### Date Aggregations

- **Count**: Number of dates
- **Minimum**: Earliest date
- **Maximum**: Latest date
- **Mode**: Most common date
- **Median**: Middle date

```typescript
interface DateAggregation {
  count?: number;
  minimum?: Date;
  maximum?: Date;
  mode?: Date;
  median?: Date;
}
```

## Implementation Details

### SPARC Pseudocode Compliance

This implementation follows Section 7 of the SPARC pseudocode specification:

1. **Build aggregation fields clause** ✓
   - `buildAggregateField()` constructs field clauses
   - Supports all aggregation types

2. **Build groupBy clause if specified** ✓
   - `buildAggregateQuery()` handles groupBy
   - Supports multiple grouping properties

3. **Build where filter clause if specified** ✓
   - Uses `serializeFilterGraphQL()` from graphql module
   - Supports complex nested filters

4. **Build tenant clause if specified** ✓
   - Tenant parameter included in query
   - Multi-tenant support throughout

5. **Execute GraphQL and parse results** ✓
   - `GraphQLExecutor` handles execution
   - Type-safe result parsing

6. **Trace weaviate.aggregate span** ✓
   - Observability integration
   - Span tracking for all operations

### Error Handling

The service uses the GraphQL executor's error handling:

- GraphQL errors are parsed and converted to typed exceptions
- Network errors are propagated
- All errors are traced via observability

### Type Safety

Full TypeScript type safety:

- Strongly typed aggregation queries
- Typed result structures
- Type guards for result inspection
- IntelliSense support

## Testing

See `examples.ts` for comprehensive usage examples covering:

- Simple count operations
- Numeric aggregations
- Grouping (single and multi-dimension)
- Top occurrences
- Date aggregations
- Boolean aggregations
- Multi-tenant operations
- Complex filters
- Pagination

## Dependencies

- `../types/aggregate.ts` - Aggregation type definitions
- `../types/filter.ts` - Filter types
- `../types/property.ts` - Property value types
- `../graphql/executor.ts` - GraphQL execution
- `../graphql/filter-builder.ts` - Filter serialization

## Performance Considerations

1. **Grouping**: Grouping by many properties can be expensive
2. **Filtering**: Pre-filter data when possible to reduce aggregation set
3. **TopOccurrences**: Limit the number of results to reduce overhead
4. **Object Limit**: Use `objectLimit` to cap the number of objects processed

## Future Enhancements

Potential improvements:

- Caching for frequently-used aggregations
- Batch aggregation across multiple classes
- Streaming results for large datasets
- Query optimization hints
- Aggregation result materialization

## License

Part of the Weaviate TypeScript integration module.
