/**
 * Pinecone Metadata Filter Builder
 *
 * Provides a fluent API for constructing complex metadata filters
 * for Pinecone queries. Supports chaining multiple conditions with
 * AND/OR logical operators.
 *
 * @see https://docs.pinecone.io/docs/metadata-filtering
 */

import type { MetadataValue } from "./metadata.js";
import type { MetadataFilter, FilterCondition, FieldCondition } from "./filter.js";

/**
 * Fluent builder for constructing Pinecone metadata filters.
 *
 * Provides a chainable API for building complex filter expressions
 * that combine multiple field conditions with AND/OR logic.
 *
 * @example
 * ```typescript
 * // Simple equality filter
 * const filter = FilterBuilder.new()
 *   .eq("status", "active")
 *   .build();
 * // Result: { "status": { "$eq": "active" } }
 *
 * // Multiple AND conditions
 * const andFilter = FilterBuilder.new()
 *   .eq("status", "active")
 *   .gte("age", 18)
 *   .lt("age", 65)
 *   .build();
 * // Result: { "$and": [
 * //   { "status": { "$eq": "active" } },
 * //   { "age": { "$gte": 18 } },
 * //   { "age": { "$lt": 65 } }
 * // ]}
 *
 * // OR conditions
 * const orFilter = FilterBuilder.new()
 *   .or()
 *   .eq("country", "US")
 *   .eq("country", "CA")
 *   .build();
 * // Result: { "$or": [
 * //   { "country": { "$eq": "US" } },
 * //   { "country": { "$eq": "CA" } }
 * // ]}
 *
 * // Complex nested filter
 * const complexFilter = FilterBuilder.new()
 *   .and()
 *   .gte("score", 50)
 *   .in("category", ["premium", "gold"])
 *   .or()
 *   .eq("vip", true)
 *   .gte("purchases", 10)
 *   .build();
 * ```
 */
export class FilterBuilder {
  private conditions: FilterCondition[] = [];
  private operator: "and" | "or" = "and";

  /**
   * Create a new FilterBuilder instance.
   *
   * @returns A new FilterBuilder instance
   *
   * @example
   * ```typescript
   * const builder = FilterBuilder.new();
   * ```
   */
  static new(): FilterBuilder {
    return new FilterBuilder();
  }

  /**
   * Set the logical operator to AND.
   *
   * All subsequent conditions will be combined with AND logic.
   * This is the default operator.
   *
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * const filter = FilterBuilder.new()
   *   .and()
   *   .eq("status", "active")
   *   .gte("score", 50)
   *   .build();
   * // Result: { "$and": [...] }
   * ```
   */
  and(): this {
    this.operator = "and";
    return this;
  }

  /**
   * Set the logical operator to OR.
   *
   * All subsequent conditions will be combined with OR logic.
   *
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * const filter = FilterBuilder.new()
   *   .or()
   *   .eq("category", "premium")
   *   .eq("category", "gold")
   *   .build();
   * // Result: { "$or": [...] }
   * ```
   */
  or(): this {
    this.operator = "or";
    return this;
  }

  /**
   * Add an equality condition.
   *
   * Filters for records where the field value equals the specified value.
   *
   * @param field - The metadata field name
   * @param value - The value to match
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * // String equality
   * builder.eq("status", "active");
   *
   * // Numeric equality
   * builder.eq("count", 42);
   *
   * // Boolean equality
   * builder.eq("verified", true);
   * ```
   */
  eq(field: string, value: MetadataValue): this {
    this.addFieldCondition(field, { $eq: value });
    return this;
  }

  /**
   * Add a not-equal condition.
   *
   * Filters for records where the field value does not equal the specified value.
   *
   * @param field - The metadata field name
   * @param value - The value to exclude
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.ne("status", "deleted");
   * ```
   */
  ne(field: string, value: MetadataValue): this {
    this.addFieldCondition(field, { $ne: value });
    return this;
  }

  /**
   * Add a greater-than condition.
   *
   * Filters for records where the field value is greater than the specified number.
   *
   * @param field - The metadata field name
   * @param value - The minimum value (exclusive)
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.gt("age", 18);
   * builder.gt("score", 50.5);
   * ```
   */
  gt(field: string, value: number): this {
    this.addFieldCondition(field, { $gt: value });
    return this;
  }

  /**
   * Add a greater-than-or-equal condition.
   *
   * Filters for records where the field value is greater than or equal to
   * the specified number.
   *
   * @param field - The metadata field name
   * @param value - The minimum value (inclusive)
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.gte("age", 18);
   * ```
   */
  gte(field: string, value: number): this {
    this.addFieldCondition(field, { $gte: value });
    return this;
  }

  /**
   * Add a less-than condition.
   *
   * Filters for records where the field value is less than the specified number.
   *
   * @param field - The metadata field name
   * @param value - The maximum value (exclusive)
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.lt("age", 65);
   * ```
   */
  lt(field: string, value: number): this {
    this.addFieldCondition(field, { $lt: value });
    return this;
  }

  /**
   * Add a less-than-or-equal condition.
   *
   * Filters for records where the field value is less than or equal to
   * the specified number.
   *
   * @param field - The metadata field name
   * @param value - The maximum value (inclusive)
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.lte("age", 65);
   * ```
   */
  lte(field: string, value: number): this {
    this.addFieldCondition(field, { $lte: value });
    return this;
  }

  /**
   * Add an in-array condition.
   *
   * Filters for records where the field value is in the specified array.
   *
   * @param field - The metadata field name
   * @param values - Array of values to match
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * // String array
   * builder.in("status", ["active", "pending", "processing"]);
   *
   * // Number array
   * builder.in("priority", [1, 2, 3]);
   * ```
   */
  in(field: string, values: MetadataValue[]): this {
    this.addFieldCondition(field, { $in: values });
    return this;
  }

  /**
   * Add a not-in-array condition.
   *
   * Filters for records where the field value is NOT in the specified array.
   *
   * @param field - The metadata field name
   * @param values - Array of values to exclude
   * @returns This builder instance for chaining
   *
   * @example
   * ```typescript
   * builder.nin("status", ["deleted", "archived"]);
   * ```
   */
  nin(field: string, values: MetadataValue[]): this {
    this.addFieldCondition(field, { $nin: values });
    return this;
  }

  /**
   * Build the final MetadataFilter.
   *
   * Constructs the filter object from all added conditions.
   * - If no conditions: returns an empty object
   * - If one condition: returns the condition directly
   * - If multiple conditions: wraps in $and or $or based on operator
   *
   * @returns The constructed metadata filter
   *
   * @example
   * ```typescript
   * const filter = FilterBuilder.new()
   *   .eq("status", "active")
   *   .gte("score", 50)
   *   .build();
   *
   * // Use in a query
   * await index.query({
   *   vector: [...],
   *   filter: filter,
   *   topK: 10
   * });
   * ```
   */
  build(): MetadataFilter {
    if (this.conditions.length === 0) {
      // Return empty object if no conditions
      return {};
    }

    if (this.conditions.length === 1) {
      // Return single condition directly
      const singleCondition = this.conditions[0];
      if (singleCondition) {
        return singleCondition;
      }
      return {};
    }

    // Multiple conditions - wrap in $and or $or
    if (this.operator === "or") {
      return { $or: this.conditions };
    } else {
      return { $and: this.conditions };
    }
  }

  /**
   * Add a field condition to the builder.
   *
   * Creates a filter condition for a specific field and adds it to the list.
   *
   * @param field - The metadata field name
   * @param condition - The field condition object
   * @private
   */
  private addFieldCondition(field: string, condition: FieldCondition): void {
    this.conditions.push({ [field]: condition });
  }
}

/**
 * Create a new FilterBuilder instance.
 *
 * Convenience function for creating a new filter builder without
 * using the `new` keyword.
 *
 * @returns A new FilterBuilder instance
 *
 * @example
 * ```typescript
 * import { filter } from './filter-builder';
 *
 * const myFilter = filter()
 *   .eq("status", "active")
 *   .gte("score", 50)
 *   .build();
 * ```
 */
export function filter(): FilterBuilder {
  return FilterBuilder.new();
}
