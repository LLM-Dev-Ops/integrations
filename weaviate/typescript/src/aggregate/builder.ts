/**
 * Fluent API builder for aggregation queries
 *
 * Provides a convenient builder pattern for constructing aggregation queries.
 */

import type {
  AggregateQuery,
  AggregateField,
  Aggregation,
} from '../types/aggregate.js';
import type { WhereFilter } from '../types/filter.js';

/**
 * Fluent builder for aggregation queries
 *
 * Provides a chainable interface for constructing complex aggregation queries.
 *
 * @example
 * ```typescript
 * const query = AggregateQueryBuilder.forClass("Product")
 *   .groupBy(["category"])
 *   .filter({
 *     operator: 'Operand',
 *     operand: {
 *       path: ["inStock"],
 *       operator: FilterOperator.Equal,
 *       value: true
 *     }
 *   })
 *   .field("price", [Aggregation.Mean, Aggregation.Minimum, Aggregation.Maximum])
 *   .field("quantity", [Aggregation.Sum])
 *   .build();
 * ```
 */
export class AggregateQueryBuilder {
  private className: string;
  private groupByProps?: string[];
  private whereFilter?: WhereFilter;
  private tenantName?: string;
  private fields: AggregateField[] = [];
  private limitValue?: number;
  private objectLimitValue?: number;

  /**
   * Private constructor - use static factory method instead
   *
   * @param className - Name of the class to aggregate
   */
  private constructor(className: string) {
    this.className = className;
  }

  /**
   * Creates a new aggregation query builder
   *
   * @param className - Name of the class to aggregate
   * @returns New builder instance
   *
   * @example
   * ```typescript
   * const builder = AggregateQueryBuilder.forClass("Article");
   * ```
   */
  static forClass(className: string): AggregateQueryBuilder {
    return new AggregateQueryBuilder(className);
  }

  /**
   * Sets the groupBy properties
   *
   * Results will be grouped by the specified properties. Each unique
   * combination of values will produce a separate group in the results.
   *
   * @param properties - Property names to group by
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.groupBy(["category", "status"]);
   * ```
   */
  groupBy(properties: string[]): this {
    this.groupByProps = properties;
    return this;
  }

  /**
   * Sets the filter for selecting objects to aggregate
   *
   * Only objects matching the filter will be included in aggregations.
   *
   * @param filter - Where filter condition
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.filter({
   *   operator: 'Operand',
   *   operand: {
   *     path: ["year"],
   *     operator: FilterOperator.GreaterThan,
   *     value: 2020
   *   }
   * });
   * ```
   */
  filter(filter: WhereFilter): this {
    this.whereFilter = filter;
    return this;
  }

  /**
   * Sets the tenant for multi-tenant collections
   *
   * @param tenant - Tenant name
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.tenant("customer-123");
   * ```
   */
  tenant(tenant: string): this {
    this.tenantName = tenant;
    return this;
  }

  /**
   * Adds a field to aggregate
   *
   * Specifies a property to aggregate and which aggregation operations
   * to perform on it.
   *
   * @param property - Property name to aggregate
   * @param aggregations - Array of aggregation operations
   * @param topOccurrencesLimit - Optional limit for TopOccurrences aggregation
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * // Numeric aggregations
   * builder.field("price", [Aggregation.Mean, Aggregation.Minimum, Aggregation.Maximum]);
   *
   * // Top occurrences
   * builder.field("tags", [Aggregation.TopOccurrences], 10);
   * ```
   */
  field(
    property: string,
    aggregations: Aggregation[],
    topOccurrencesLimit?: number
  ): this {
    const field: AggregateField = {
      property,
      aggregations,
    };

    if (topOccurrencesLimit !== undefined) {
      field.topOccurrencesConfig = { limit: topOccurrencesLimit };
    }

    this.fields.push(field);
    return this;
  }

  /**
   * Sets the maximum number of groups to return
   *
   * Only applicable when using groupBy.
   *
   * @param limit - Maximum number of groups
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.groupBy(["category"]).limit(10);
   * ```
   */
  limit(limit: number): this {
    this.limitValue = limit;
    return this;
  }

  /**
   * Sets the object limit for meta count
   *
   * Limits the number of objects to consider in the aggregation.
   *
   * @param limit - Maximum number of objects
   * @returns This builder for chaining
   *
   * @example
   * ```typescript
   * builder.objectLimit(1000);
   * ```
   */
  objectLimit(limit: number): this {
    this.objectLimitValue = limit;
    return this;
  }

  /**
   * Builds the aggregation query
   *
   * Constructs and returns the final AggregateQuery object.
   *
   * @returns Constructed aggregation query
   *
   * @example
   * ```typescript
   * const query = builder.build();
   * const result = await aggregateService.aggregate(query);
   * ```
   */
  build(): AggregateQuery {
    return {
      className: this.className,
      groupBy: this.groupByProps,
      filter: this.whereFilter,
      tenant: this.tenantName,
      fields: this.fields,
      limit: this.limitValue,
      objectLimit: this.objectLimitValue,
    };
  }

  /**
   * Creates a simple count query (no field aggregations)
   *
   * Shorthand for creating a query that only returns the count.
   *
   * @returns Constructed aggregation query for counting
   *
   * @example
   * ```typescript
   * const query = AggregateQueryBuilder.forClass("Article")
   *   .filter(myFilter)
   *   .buildCount();
   * ```
   */
  buildCount(): AggregateQuery {
    return {
      className: this.className,
      filter: this.whereFilter,
      tenant: this.tenantName,
      fields: [],
    };
  }
}

/**
 * Helper function to create a simple aggregation query
 *
 * Convenience function for simple aggregation queries without using the builder.
 *
 * @param className - Name of the class
 * @param property - Property to aggregate
 * @param aggregations - Aggregation operations
 * @param filter - Optional filter
 * @returns Aggregation query
 *
 * @example
 * ```typescript
 * const query = createSimpleAggregateQuery(
 *   "Product",
 *   "price",
 *   [Aggregation.Mean, Aggregation.Count]
 * );
 * ```
 */
export function createSimpleAggregateQuery(
  className: string,
  property: string,
  aggregations: Aggregation[],
  filter?: WhereFilter
): AggregateQuery {
  return {
    className,
    fields: [{ property, aggregations }],
    filter,
  };
}

/**
 * Helper function to create a count query
 *
 * Convenience function for creating a simple count query.
 *
 * @param className - Name of the class
 * @param filter - Optional filter
 * @param tenant - Optional tenant
 * @returns Aggregation query for counting
 *
 * @example
 * ```typescript
 * const query = createCountQuery("Article", myFilter);
 * ```
 */
export function createCountQuery(
  className: string,
  filter?: WhereFilter,
  tenant?: string
): AggregateQuery {
  return {
    className,
    fields: [],
    filter,
    tenant,
  };
}
