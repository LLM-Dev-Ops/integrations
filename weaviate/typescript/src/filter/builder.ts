/**
 * Filter builder
 *
 * Provides a fluent API for constructing Weaviate where filters.
 *
 * @example
 * ```typescript
 * // Simple filter
 * const filter = Filter.property("year").greaterThan(2020);
 *
 * // Combined filters
 * const combined = Filter.property("year").greaterThan(2020)
 *   .and(Filter.property("category").equal("science"))
 *   .and(Filter.property("tags").containsAny(["ai", "ml"]));
 *
 * // Nested property paths
 * const nested = Filter.propertyPath(["author", "name"]).equal("John Doe");
 * ```
 */

import type {
  WhereFilter,
  FilterOperand,
  FilterValue,
  GeoRange,
} from './types.js';
import { FilterOperator } from './types.js';

/**
 * Main filter builder entry point
 *
 * Provides static methods to start building filters.
 */
export class Filter {
  /**
   * Start building a filter for a property
   *
   * @param path - Property name
   * @returns Filter builder for the property
   *
   * @example
   * ```typescript
   * Filter.property("age").greaterThan(18)
   * ```
   */
  static property(path: string): FilterBuilder {
    return new FilterBuilder([path]);
  }

  /**
   * Start building a filter for a nested property path
   *
   * @param path - Array of property names representing the path
   * @returns Filter builder for the property path
   *
   * @example
   * ```typescript
   * Filter.propertyPath(["author", "name"]).equal("John Doe")
   * ```
   */
  static propertyPath(path: string[]): FilterBuilder {
    return new FilterBuilder(path);
  }

  /**
   * Combine multiple filters with AND
   *
   * @param filters - Filters to combine
   * @returns Combined AND filter
   *
   * @example
   * ```typescript
   * Filter.and(
   *   Filter.property("year").greaterThan(2020),
   *   Filter.property("category").equal("science")
   * )
   * ```
   */
  static and(...filters: WhereFilter[]): WhereFilter {
    if (filters.length === 0) {
      throw new Error('AND filter requires at least one operand');
    }
    if (filters.length === 1) {
      return filters[0];
    }
    return {
      operator: 'And',
      operands: filters,
    } as WhereFilter;
  }

  /**
   * Combine multiple filters with OR
   *
   * @param filters - Filters to combine
   * @returns Combined OR filter
   *
   * @example
   * ```typescript
   * Filter.or(
   *   Filter.property("category").equal("science"),
   *   Filter.property("category").equal("technology")
   * )
   * ```
   */
  static or(...filters: WhereFilter[]): WhereFilter {
    if (filters.length === 0) {
      throw new Error('OR filter requires at least one operand');
    }
    if (filters.length === 1) {
      return filters[0];
    }
    return {
      operator: 'Or',
      operands: filters,
    } as WhereFilter;
  }
}

/**
 * Filter builder for a specific property
 *
 * Provides chainable methods to build filter conditions.
 */
export class FilterBuilder {
  constructor(private readonly path: string[]) {}

  /**
   * Equal to operator
   *
   * @param value - Value to compare
   * @returns Where filter
   */
  equal<T extends FilterValue>(value: T): WhereFilter {
    return this.createOperand(FilterOperator.Equal, value);
  }

  /**
   * Not equal to operator
   *
   * @param value - Value to compare
   * @returns Where filter
   */
  notEqual<T extends FilterValue>(value: T): WhereFilter {
    return this.createOperand(FilterOperator.NotEqual, value);
  }

  /**
   * Greater than operator
   *
   * @param value - Value to compare
   * @returns Where filter
   */
  greaterThan<T extends FilterValue>(value: T): WhereFilter {
    return this.createOperand(FilterOperator.GreaterThan, value);
  }

  /**
   * Greater than or equal operator
   *
   * @param value - Value to compare
   * @returns Where filter
   */
  greaterThanEqual<T extends FilterValue>(value: T): WhereFilter {
    return this.createOperand(FilterOperator.GreaterThanEqual, value);
  }

  /**
   * Less than operator
   *
   * @param value - Value to compare
   * @returns Where filter
   */
  lessThan<T extends FilterValue>(value: T): WhereFilter {
    return this.createOperand(FilterOperator.LessThan, value);
  }

  /**
   * Less than or equal operator
   *
   * @param value - Value to compare
   * @returns Where filter
   */
  lessThanEqual<T extends FilterValue>(value: T): WhereFilter {
    return this.createOperand(FilterOperator.LessThanEqual, value);
  }

  /**
   * Like operator (wildcard text matching)
   *
   * Supports wildcards:
   * - `?`: Matches exactly one character
   * - `*`: Matches zero or more characters
   *
   * @param pattern - Pattern with wildcards
   * @returns Where filter
   *
   * @example
   * ```typescript
   * Filter.property("title").like("*vector*") // Contains "vector"
   * Filter.property("code").like("A?C")       // Matches ABC, A1C, etc.
   * ```
   */
  like(pattern: string): WhereFilter {
    return this.createOperand(FilterOperator.Like, pattern);
  }

  /**
   * Contains any of the specified values
   *
   * For array properties, checks if the array contains at least one of the values.
   *
   * @param values - Array of values
   * @returns Where filter
   */
  containsAny(values: string[] | number[]): WhereFilter {
    return this.createOperand(FilterOperator.ContainsAny, values as FilterValue);
  }

  /**
   * Contains all of the specified values
   *
   * For array properties, checks if the array contains all of the values.
   *
   * @param values - Array of values
   * @returns Where filter
   */
  containsAll(values: string[] | number[]): WhereFilter {
    return this.createOperand(FilterOperator.ContainsAll, values as FilterValue);
  }

  /**
   * Is null operator
   *
   * @param isNull - Whether the property should be null (true) or not null (false)
   * @returns Where filter
   */
  isNull(isNull = true): WhereFilter {
    return this.createOperand(FilterOperator.IsNull, isNull);
  }

  /**
   * Within geographic range operator
   *
   * Finds objects within a specified distance from a geo-coordinate.
   *
   * @param latitude - Latitude in decimal degrees
   * @param longitude - Longitude in decimal degrees
   * @param distanceKm - Maximum distance in kilometers
   * @returns Where filter
   *
   * @example
   * ```typescript
   * Filter.property("location").withinGeoRange(37.7749, -122.4194, 10)
   * // Finds locations within 10km of San Francisco
   * ```
   */
  withinGeoRange(
    latitude: number,
    longitude: number,
    distanceKm: number
  ): WhereFilter {
    const geoRange: GeoRange = {
      latitude,
      longitude,
      distanceKm,
    };
    return this.createOperand(FilterOperator.WithinGeoRange, geoRange);
  }

  /**
   * Creates a filter operand
   *
   * @param operator - Filter operator
   * @param value - Filter value
   * @returns Where filter with operand
   */
  private createOperand(
    operator: FilterOperator,
    value: FilterValue
  ): WhereFilter {
    const operand: FilterOperand = {
      path: this.path,
      operator,
      value,
    };
    return {
      operator: 'Operand',
      operand,
    } as WhereFilter;
  }
}

/**
 * Extension methods for WhereFilter to enable chaining
 */
export class WhereFilterExtensions {
  /**
   * Combine this filter with another using AND
   *
   * @param left - First filter
   * @param right - Second filter
   * @returns Combined AND filter
   */
  static and(left: WhereFilter, right: WhereFilter): WhereFilter {
    // Optimize: if left is already an AND, append to its operands
    if (left.operator === 'And') {
      return {
        operator: 'And',
        operands: [...left.operands, right],
      } as WhereFilter;
    }

    return {
      operator: 'And',
      operands: [left, right],
    } as WhereFilter;
  }

  /**
   * Combine this filter with another using OR
   *
   * @param left - First filter
   * @param right - Second filter
   * @returns Combined OR filter
   */
  static or(left: WhereFilter, right: WhereFilter): WhereFilter {
    // Optimize: if left is already an OR, append to its operands
    if (left.operator === 'Or') {
      return {
        operator: 'Or',
        operands: [...left.operands, right],
      } as WhereFilter;
    }

    return {
      operator: 'Or',
      operands: [left, right],
    } as WhereFilter;
  }
}

/**
 * Helper functions to combine filters using the static methods
 *
 * These are convenience exports that match the WhereFilterExtensions static methods.
 */

/**
 * Combine two filters with AND
 *
 * @param left - First filter
 * @param right - Second filter
 * @returns Combined AND filter
 */
export function and(left: WhereFilter, right: WhereFilter): WhereFilter {
  return WhereFilterExtensions.and(left, right);
}

/**
 * Combine two filters with OR
 *
 * @param left - First filter
 * @param right - Second filter
 * @returns Combined OR filter
 */
export function or(left: WhereFilter, right: WhereFilter): WhereFilter {
  return WhereFilterExtensions.or(left, right);
}
