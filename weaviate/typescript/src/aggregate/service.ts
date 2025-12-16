/**
 * Aggregation service
 *
 * Provides methods for executing aggregation queries against Weaviate.
 */

import type {
  AggregateQuery,
  AggregateResult,
} from '../types/aggregate.js';
import type { WhereFilter } from '../types/filter.js';
import type { GraphQLExecutor } from '../graphql/executor.js';
import type { GraphQLObservability } from '../graphql/executor.js';
import { buildAggregateQuery, buildCountQuery } from './graphql.js';
import { parseAggregateResult } from './result.js';

/**
 * No-op observability implementation
 */
class NoOpObservability implements GraphQLObservability {
  startSpan(_name: string): { end(): void } {
    return { end: () => {} };
  }

  recordError(_error: Error): void {
    // No-op
  }
}

/**
 * Aggregation service configuration
 */
export interface AggregateServiceConfig {
  /**
   * GraphQL executor for executing queries
   */
  graphqlExecutor: GraphQLExecutor;

  /**
   * Optional observability provider for tracing and metrics
   */
  observability?: GraphQLObservability;
}

/**
 * Aggregation service
 *
 * Handles execution of aggregation queries with proper error handling,
 * observability, and result parsing.
 *
 * @example
 * ```typescript
 * const service = new AggregateService({
 *   graphqlExecutor: executor,
 *   observability: metrics
 * });
 *
 * // Execute aggregation
 * const result = await service.aggregate(query);
 *
 * // Simple count
 * const count = await service.count("Article", filter);
 * ```
 */
export class AggregateService {
  private readonly executor: GraphQLExecutor;
  private readonly observability: GraphQLObservability;

  constructor(config: AggregateServiceConfig) {
    this.executor = config.graphqlExecutor;
    this.observability = config.observability ?? new NoOpObservability();
  }

  /**
   * Executes an aggregation query
   *
   * Performs aggregation operations on objects matching the query criteria.
   * Supports grouping, filtering, and various statistical operations.
   *
   * @param query - Aggregation query configuration
   * @returns Aggregation results
   * @throws WeaviateError if the query fails
   *
   * @example
   * ```typescript
   * // Group products by category and compute price statistics
   * const query: AggregateQuery = {
   *   className: "Product",
   *   groupBy: ["category"],
   *   fields: [
   *     {
   *       property: "price",
   *       aggregations: [Aggregation.Mean, Aggregation.Minimum, Aggregation.Maximum]
   *     },
   *     {
   *       property: "quantity",
   *       aggregations: [Aggregation.Sum]
   *     }
   *   ],
   *   filter: {
   *     operator: 'Operand',
   *     operand: {
   *       path: ["inStock"],
   *       operator: FilterOperator.Equal,
   *       value: true
   *     }
   *   }
   * };
   *
   * const result = await service.aggregate(query);
   *
   * for (const group of result.groups) {
   *   console.log(`Category: ${group.groupedBy?.category}`);
   *   console.log(`Average price: ${group.aggregations.price.mean}`);
   *   console.log(`Total quantity: ${group.aggregations.quantity.sum}`);
   * }
   * ```
   */
  async aggregate(query: AggregateQuery): Promise<AggregateResult> {
    const span = this.observability.startSpan('weaviate.aggregate');

    try {
      // Build GraphQL query
      const graphqlQuery = buildAggregateQuery(query);

      // Execute query
      const data = await this.executor.execute<any>(graphqlQuery);

      // Parse results
      const result = parseAggregateResult(data, query.className);

      return result;
    } catch (error) {
      if (error instanceof Error) {
        this.observability.recordError(error);
      }
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Counts objects matching the filter
   *
   * Simple count operation using aggregate meta.count. This is a shorthand
   * for creating an aggregation query with no field aggregations.
   *
   * @param className - Name of the class to count
   * @param filter - Optional filter to select objects
   * @param tenant - Optional tenant name
   * @returns Number of matching objects
   * @throws WeaviateError if the query fails
   *
   * @example
   * ```typescript
   * // Count all articles
   * const total = await service.count("Article");
   *
   * // Count articles matching filter
   * const published = await service.count("Article", {
   *   operator: 'Operand',
   *   operand: {
   *     path: ["status"],
   *     operator: FilterOperator.Equal,
   *     value: "published"
   *   }
   * });
   *
   * // Count in specific tenant
   * const tenantCount = await service.count("Article", undefined, "customer-123");
   * ```
   */
  async count(
    className: string,
    filter?: WhereFilter,
    tenant?: string
  ): Promise<number> {
    const span = this.observability.startSpan('weaviate.aggregate.count');

    try {
      // Build count query
      const graphqlQuery = buildCountQuery(className, filter, tenant);

      // Execute query
      const data = await this.executor.execute<any>(graphqlQuery);

      // Parse result
      const result = parseAggregateResult(data, className);

      // Extract count from meta
      return result.meta?.count ?? 0;
    } catch (error) {
      if (error instanceof Error) {
        this.observability.recordError(error);
      }
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Gets total object count without filter
   *
   * Returns the total number of objects in a class, optionally for a
   * specific tenant. This is equivalent to count() without a filter.
   *
   * @param className - Name of the class
   * @param tenant - Optional tenant name
   * @returns Total object count
   * @throws WeaviateError if the query fails
   *
   * @example
   * ```typescript
   * // Get total count
   * const total = await service.metaCount("Article");
   *
   * // Get count for tenant
   * const tenantTotal = await service.metaCount("Article", "customer-123");
   * ```
   */
  async metaCount(className: string, tenant?: string): Promise<number> {
    return this.count(className, undefined, tenant);
  }

  /**
   * Aggregates a single property
   *
   * Convenience method for aggregating a single property without grouping.
   *
   * @param className - Name of the class
   * @param property - Property to aggregate
   * @param aggregations - Aggregation operations
   * @param filter - Optional filter
   * @param tenant - Optional tenant
   * @returns Aggregation result
   *
   * @example
   * ```typescript
   * const result = await service.aggregateProperty(
   *   "Product",
   *   "price",
   *   [Aggregation.Mean, Aggregation.Minimum, Aggregation.Maximum]
   * );
   *
   * const priceStats = result.groups[0].aggregations.price;
   * console.log(`Average: ${priceStats.mean}`);
   * console.log(`Range: ${priceStats.minimum} - ${priceStats.maximum}`);
   * ```
   */
  async aggregateProperty(
    className: string,
    property: string,
    aggregations: import('../types/aggregate.js').Aggregation[],
    filter?: WhereFilter,
    tenant?: string
  ): Promise<AggregateResult> {
    const query: AggregateQuery = {
      className,
      fields: [{ property, aggregations }],
      filter,
      tenant,
    };

    return this.aggregate(query);
  }
}

/**
 * Creates an aggregation service instance
 *
 * @param config - Service configuration
 * @returns AggregateService instance
 *
 * @example
 * ```typescript
 * const service = createAggregateService({
 *   graphqlExecutor: executor,
 *   observability: metrics
 * });
 * ```
 */
export function createAggregateService(
  config: AggregateServiceConfig
): AggregateService {
  return new AggregateService(config);
}
