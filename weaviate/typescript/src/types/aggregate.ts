/**
 * Weaviate aggregation types
 *
 * This module defines types for aggregation queries which allow
 * computing statistics over object collections.
 */

import type { Properties, PropertyValue } from './property.js';
import type { WhereFilter } from './filter.js';

/**
 * Aggregation operations supported by Weaviate
 */
export enum Aggregation {
  /**
   * Count of objects
   */
  Count = 'count',

  /**
   * Sum of numeric values
   */
  Sum = 'sum',

  /**
   * Mean (average) of numeric values
   */
  Mean = 'mean',

  /**
   * Median of numeric values
   */
  Median = 'median',

  /**
   * Mode (most common value)
   */
  Mode = 'mode',

  /**
   * Minimum value
   */
  Minimum = 'minimum',

  /**
   * Maximum value
   */
  Maximum = 'maximum',

  /**
   * Type statistics (for mixed types)
   */
  Type = 'type',

  /**
   * Top occurring values with counts
   */
  TopOccurrences = 'topOccurrences',

  /**
   * Count of objects pointing to this reference
   */
  PointingTo = 'pointingTo',
}

/**
 * Top occurrences configuration
 */
export interface TopOccurrencesConfig {
  /**
   * Maximum number of top values to return
   */
  limit: number;
}

/**
 * Field to aggregate
 *
 * @example
 * ```typescript
 * const field: AggregateField = {
 *   property: "price",
 *   aggregations: [Aggregation.Mean, Aggregation.Minimum, Aggregation.Maximum]
 * };
 * ```
 */
export interface AggregateField {
  /**
   * Property name to aggregate
   */
  property: string;

  /**
   * Aggregation operations to perform
   */
  aggregations: Aggregation[];

  /**
   * Configuration for TopOccurrences aggregation
   */
  topOccurrencesConfig?: TopOccurrencesConfig;
}

/**
 * Aggregation query
 *
 * @example
 * ```typescript
 * const query: AggregateQuery = {
 *   className: "Product",
 *   groupBy: ["category"],
 *   fields: [
 *     {
 *       property: "price",
 *       aggregations: [Aggregation.Mean, Aggregation.Count]
 *     }
 *   ],
 *   filter: {
 *     operator: 'Operand',
 *     operand: {
 *       path: ['inStock'],
 *       operator: FilterOperator.Equal,
 *       value: true
 *     }
 *   }
 * };
 * ```
 */
export interface AggregateQuery {
  /**
   * Name of the class to aggregate
   */
  className: string;

  /**
   * Properties to group by
   * If not specified, aggregates over all matching objects
   */
  groupBy?: string[];

  /**
   * Filter to select objects for aggregation
   */
  filter?: WhereFilter;

  /**
   * Tenant name for multi-tenant collections
   */
  tenant?: string;

  /**
   * Fields to aggregate
   */
  fields: AggregateField[];

  /**
   * Maximum number of groups to return
   */
  limit?: number;

  /**
   * Object count limit (for meta count)
   */
  objectLimit?: number;
}

/**
 * Occurrence count - value and its occurrence count
 */
export interface OccurrenceCount {
  /**
   * The value
   */
  value: PropertyValue;

  /**
   * Number of occurrences
   */
  count: number;
}

/**
 * Type count - count per data type
 */
export interface TypeCount {
  /**
   * Data type name
   */
  type: string;

  /**
   * Number of occurrences
   */
  count: number;
}

/**
 * Numeric aggregation result
 */
export interface NumericAggregation {
  /**
   * Count of values
   */
  count?: number;

  /**
   * Sum of values
   */
  sum?: number;

  /**
   * Mean (average) value
   */
  mean?: number;

  /**
   * Median value
   */
  median?: number;

  /**
   * Mode (most common) value
   */
  mode?: number;

  /**
   * Minimum value
   */
  minimum?: number;

  /**
   * Maximum value
   */
  maximum?: number;
}

/**
 * Text aggregation result
 */
export interface TextAggregation {
  /**
   * Count of values
   */
  count?: number;

  /**
   * Type statistics
   */
  type?: TypeCount[];

  /**
   * Top occurring values
   */
  topOccurrences?: OccurrenceCount[];
}

/**
 * Boolean aggregation result
 */
export interface BooleanAggregation {
  /**
   * Count of values
   */
  count?: number;

  /**
   * Total count of true values
   */
  totalTrue?: number;

  /**
   * Total count of false values
   */
  totalFalse?: number;

  /**
   * Percentage of true values
   */
  percentageTrue?: number;

  /**
   * Percentage of false values
   */
  percentageFalse?: number;
}

/**
 * Date aggregation result
 */
export interface DateAggregation {
  /**
   * Count of values
   */
  count?: number;

  /**
   * Minimum (earliest) date
   */
  minimum?: Date;

  /**
   * Maximum (latest) date
   */
  maximum?: Date;

  /**
   * Mode (most common) date
   */
  mode?: Date;

  /**
   * Median date
   */
  median?: Date;
}

/**
 * Reference aggregation result
 */
export interface ReferenceAggregation {
  /**
   * Count of references
   */
  pointingTo?: number;

  /**
   * Type information
   */
  type?: string;
}

/**
 * Aggregation value - union of all possible aggregation result types
 */
export type AggregateValue =
  | number
  | string
  | boolean
  | Date
  | NumericAggregation
  | TextAggregation
  | BooleanAggregation
  | DateAggregation
  | ReferenceAggregation
  | OccurrenceCount[]
  | TypeCount[]
  | null;

/**
 * Aggregation group - results for a single group
 *
 * @example
 * ```typescript
 * const group: AggregateGroup = {
 *   groupedBy: {
 *     category: "Electronics"
 *   },
 *   aggregations: {
 *     price: {
 *       mean: 299.99,
 *       minimum: 49.99,
 *       maximum: 999.99,
 *       count: 150
 *     }
 *   },
 *   count: 150
 * };
 * ```
 */
export interface AggregateGroup {
  /**
   * Values that define this group (if groupBy was used)
   * Maps property names to their values for this group
   */
  groupedBy?: Properties;

  /**
   * Aggregation results per property
   * Maps property names to their aggregation results
   */
  aggregations: Record<string, AggregateValue>;

  /**
   * Total count of objects in this group
   */
  count: number;
}

/**
 * Metadata about the aggregation
 */
export interface AggregateMeta {
  /**
   * Total count of objects that matched the filter
   */
  count?: number;
}

/**
 * Aggregation result
 *
 * @example
 * ```typescript
 * const result: AggregateResult = {
 *   groups: [
 *     {
 *       groupedBy: { category: "Electronics" },
 *       aggregations: {
 *         price: { mean: 299.99, count: 150 }
 *       },
 *       count: 150
 *     },
 *     {
 *       groupedBy: { category: "Books" },
 *       aggregations: {
 *         price: { mean: 19.99, count: 300 }
 *       },
 *       count: 300
 *     }
 *   ],
 *   meta: {
 *     count: 450
 *   }
 * };
 * ```
 */
export interface AggregateResult {
  /**
   * Aggregation groups
   * If no groupBy was specified, contains a single group with all results
   */
  groups: AggregateGroup[];

  /**
   * Overall metadata
   */
  meta?: AggregateMeta;
}

/**
 * Simple count query (shorthand for aggregation)
 */
export interface CountQuery {
  /**
   * Name of the class
   */
  className: string;

  /**
   * Filter to select objects to count
   */
  filter?: WhereFilter;

  /**
   * Tenant name
   */
  tenant?: string;
}

/**
 * Count result
 */
export interface CountResult {
  /**
   * Total count of matching objects
   */
  count: number;
}

/**
 * Meta count query - total object count without filter
 */
export interface MetaCountQuery {
  /**
   * Name of the class
   */
  className: string;

  /**
   * Tenant name
   */
  tenant?: string;
}

/**
 * Type guard to check if aggregate value is numeric
 */
export function isNumericAggregation(
  value: AggregateValue
): value is NumericAggregation {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('mean' in value || 'sum' in value || 'median' in value)
  );
}

/**
 * Type guard to check if aggregate value is text
 */
export function isTextAggregation(
  value: AggregateValue
): value is TextAggregation {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('topOccurrences' in value || 'type' in value) &&
    !('mean' in value)
  );
}

/**
 * Type guard to check if aggregate value is boolean
 */
export function isBooleanAggregation(
  value: AggregateValue
): value is BooleanAggregation {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('totalTrue' in value || 'totalFalse' in value)
  );
}

/**
 * Type guard to check if aggregate value is date
 */
export function isDateAggregation(
  value: AggregateValue
): value is DateAggregation {
  return (
    typeof value === 'object' &&
    value !== null &&
    'minimum' in value &&
    value.minimum instanceof Date
  );
}
