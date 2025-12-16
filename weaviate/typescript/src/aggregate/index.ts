/**
 * Weaviate aggregation module
 *
 * Provides aggregation functionality for computing statistics over object collections.
 *
 * ## Features
 *
 * - **Statistical Aggregations**: Count, sum, mean, median, mode, min, max
 * - **Text Aggregations**: Top occurrences, type counts
 * - **Boolean Aggregations**: True/false counts and percentages
 * - **Date Aggregations**: Min, max, mode, median dates
 * - **Grouping**: Group results by one or more properties
 * - **Filtering**: Apply filters to select objects for aggregation
 * - **Multi-tenancy**: Support for tenant-specific aggregations
 *
 * ## Basic Usage
 *
 * ```typescript
 * import { AggregateService, AggregateQueryBuilder } from './aggregate';
 * import { Aggregation } from '../types/aggregate';
 *
 * // Create service
 * const service = new AggregateService({
 *   graphqlExecutor: executor,
 *   observability: metrics
 * });
 *
 * // Simple count
 * const count = await service.count("Article");
 *
 * // Count with filter
 * const published = await service.count("Article", {
 *   operator: 'Operand',
 *   operand: {
 *     path: ["status"],
 *     operator: FilterOperator.Equal,
 *     value: "published"
 *   }
 * });
 *
 * // Aggregation with statistics
 * const query = AggregateQueryBuilder.forClass("Product")
 *   .field("price", [Aggregation.Mean, Aggregation.Minimum, Aggregation.Maximum])
 *   .field("quantity", [Aggregation.Sum])
 *   .build();
 *
 * const result = await service.aggregate(query);
 * const stats = result.groups[0].aggregations.price;
 * console.log(`Average price: ${stats.mean}`);
 * ```
 *
 * ## Grouping
 *
 * ```typescript
 * // Group by category and compute statistics per group
 * const query = AggregateQueryBuilder.forClass("Product")
 *   .groupBy(["category"])
 *   .field("price", [Aggregation.Mean, Aggregation.Count])
 *   .field("views", [Aggregation.Sum])
 *   .build();
 *
 * const result = await service.aggregate(query);
 *
 * for (const group of result.groups) {
 *   const category = group.groupedBy?.category;
 *   const avgPrice = group.aggregations.price.mean;
 *   const totalViews = group.aggregations.views.sum;
 *   console.log(`${category}: $${avgPrice} avg, ${totalViews} views`);
 * }
 * ```
 *
 * ## Top Occurrences
 *
 * ```typescript
 * // Find most common tags
 * const query = AggregateQueryBuilder.forClass("Article")
 *   .field("tags", [Aggregation.TopOccurrences], 10)
 *   .build();
 *
 * const result = await service.aggregate(query);
 * const topTags = result.groups[0].aggregations.tags.topOccurrences;
 *
 * for (const tag of topTags) {
 *   console.log(`${tag.value}: ${tag.count} occurrences`);
 * }
 * ```
 *
 * @module aggregate
 */

// Service
export { AggregateService, createAggregateService } from './service.js';
export type { AggregateServiceConfig } from './service.js';

// Builder
export {
  AggregateQueryBuilder,
  createSimpleAggregateQuery,
  createCountQuery,
} from './builder.js';

// GraphQL building
export {
  buildAggregateQuery,
  buildAggregateField,
  buildAggregationClause,
  buildWhereClause,
  buildCountQuery,
} from './graphql.js';

// Result parsing
export {
  parseAggregateResult,
  parseAggregateGroup,
  parseAggregateValue,
  extractNumericAggregation,
  extractTextAggregation,
  extractBooleanAggregation,
  extractDateAggregation,
  extractTopOccurrences,
} from './result.js';

// Re-export types from types/aggregate.ts for convenience
export type {
  AggregateQuery,
  AggregateField,
  AggregateResult,
  AggregateGroup,
  AggregateValue,
  AggregateMeta,
  NumericAggregation,
  TextAggregation,
  BooleanAggregation,
  DateAggregation,
  ReferenceAggregation,
  OccurrenceCount,
  TypeCount,
  TopOccurrencesConfig,
  CountQuery,
  CountResult,
  MetaCountQuery,
} from '../types/aggregate.js';

export { Aggregation } from '../types/aggregate.js';

export {
  isNumericAggregation,
  isTextAggregation,
  isBooleanAggregation,
  isDateAggregation,
} from '../types/aggregate.js';
