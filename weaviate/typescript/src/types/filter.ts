/**
 * Weaviate filter types
 *
 * This module provides type definitions for Weaviate's where filter syntax,
 * supporting complex nested conditions and various comparison operators.
 *
 * @see https://weaviate.io/developers/weaviate/api/graphql/filters
 */

import type { UUID } from './property.js';

/**
 * Filter operators supported by Weaviate
 *
 * Operators are used to compare property values in where filters.
 */
export enum FilterOperator {
  /**
   * Equal to (=)
   */
  Equal = 'Equal',

  /**
   * Not equal to (!=)
   */
  NotEqual = 'NotEqual',

  /**
   * Greater than (>)
   */
  GreaterThan = 'GreaterThan',

  /**
   * Greater than or equal to (>=)
   */
  GreaterThanEqual = 'GreaterThanEqual',

  /**
   * Less than (<)
   */
  LessThan = 'LessThan',

  /**
   * Less than or equal to (<=)
   */
  LessThanEqual = 'LessThanEqual',

  /**
   * Wildcard text matching
   * Supports: ?, * wildcards
   */
  Like = 'Like',

  /**
   * Geo-spatial range query
   * Finds objects within a radius
   */
  WithinGeoRange = 'WithinGeoRange',

  /**
   * Checks if property is null
   */
  IsNull = 'IsNull',

  /**
   * Array contains any of the specified values
   */
  ContainsAny = 'ContainsAny',

  /**
   * Array contains all of the specified values
   */
  ContainsAll = 'ContainsAll',
}

/**
 * Geographic range for geo-spatial queries
 */
export interface GeoRange {
  /**
   * Latitude in decimal degrees
   */
  latitude: number;

  /**
   * Longitude in decimal degrees
   */
  longitude: number;

  /**
   * Maximum distance in kilometers
   */
  distanceKm: number;
}

/**
 * Filter value types
 *
 * Union type representing all possible values in filter conditions.
 */
export type FilterValue =
  | string // Text value
  | number // Int or Number value
  | boolean // Boolean value
  | Date // Date value
  | UUID // UUID value
  | string[] // Text array
  | number[] // Int or Number array
  | UUID[] // UUID array
  | GeoRange // Geographic range
  | null; // Null value

/**
 * Filter operand - a single comparison operation
 *
 * Specifies a property path, operator, and value to compare against.
 *
 * @example
 * ```typescript
 * // Simple property comparison
 * const filter: FilterOperand = {
 *   path: ['age'],
 *   operator: FilterOperator.GreaterThan,
 *   value: 18
 * };
 *
 * // Nested property path
 * const nestedFilter: FilterOperand = {
 *   path: ['author', 'name'],
 *   operator: FilterOperator.Equal,
 *   value: 'John Doe'
 * };
 *
 * // Geo-spatial query
 * const geoFilter: FilterOperand = {
 *   path: ['location'],
 *   operator: FilterOperator.WithinGeoRange,
 *   value: {
 *     latitude: 37.7749,
 *     longitude: -122.4194,
 *     distanceKm: 10
 *   }
 * };
 * ```
 */
export interface FilterOperand {
  /**
   * Property path (supports nesting via dot notation or array)
   * Examples: ['title'], ['author', 'name'], ['tags']
   */
  path: string[];

  /**
   * Comparison operator
   */
  operator: FilterOperator;

  /**
   * Value to compare against
   * Type must match the operator and property type
   */
  value: FilterValue;

  /**
   * Optional value type hint for better query planning
   */
  valueType?: 'text' | 'int' | 'number' | 'boolean' | 'date' | 'uuid';
}

/**
 * Composite AND filter
 *
 * All operands must match for the filter to pass.
 */
export interface AndFilter {
  /**
   * Discriminator for type narrowing
   */
  operator: 'And';

  /**
   * Array of filter conditions that must all be true
   */
  operands: WhereFilter[];
}

/**
 * Composite OR filter
 *
 * At least one operand must match for the filter to pass.
 */
export interface OrFilter {
  /**
   * Discriminator for type narrowing
   */
  operator: 'Or';

  /**
   * Array of filter conditions where at least one must be true
   */
  operands: WhereFilter[];
}

/**
 * Single operand filter wrapper
 */
export interface OperandFilter {
  /**
   * Discriminator for type narrowing
   */
  operator: 'Operand';

  /**
   * The filter operand
   */
  operand: FilterOperand;
}

/**
 * Where filter - recursive filter structure
 *
 * A where filter can be:
 * - A single operand (property comparison)
 * - An AND combination of multiple filters
 * - An OR combination of multiple filters
 *
 * This recursive structure allows for complex nested conditions.
 *
 * @example
 * ```typescript
 * // Simple operand
 * const simple: WhereFilter = {
 *   operator: 'Operand',
 *   operand: {
 *     path: ['status'],
 *     operator: FilterOperator.Equal,
 *     value: 'active'
 *   }
 * };
 *
 * // AND combination
 * const andFilter: WhereFilter = {
 *   operator: 'And',
 *   operands: [
 *     {
 *       operator: 'Operand',
 *       operand: {
 *         path: ['age'],
 *         operator: FilterOperator.GreaterThanEqual,
 *         value: 18
 *       }
 *     },
 *     {
 *       operator: 'Operand',
 *       operand: {
 *         path: ['status'],
 *         operator: FilterOperator.Equal,
 *         value: 'active'
 *       }
 *     }
 *   ]
 * };
 *
 * // Complex nested filter
 * const complex: WhereFilter = {
 *   operator: 'And',
 *   operands: [
 *     {
 *       operator: 'Operand',
 *       operand: {
 *         path: ['category'],
 *         operator: FilterOperator.Equal,
 *         value: 'premium'
 *       }
 *     },
 *     {
 *       operator: 'Or',
 *       operands: [
 *         {
 *           operator: 'Operand',
 *           operand: {
 *             path: ['country'],
 *             operator: FilterOperator.Equal,
 *             value: 'US'
 *           }
 *         },
 *         {
 *           operator: 'Operand',
 *           operand: {
 *             path: ['country'],
 *             operator: FilterOperator.Equal,
 *             value: 'CA'
 *           }
 *         }
 *       ]
 *     }
 *   ]
 * };
 * ```
 */
export type WhereFilter = OperandFilter | AndFilter | OrFilter;

/**
 * Type guard to check if a filter is an operand filter
 *
 * @param filter - The filter to check
 * @returns True if the filter is an OperandFilter
 */
export function isOperandFilter(filter: WhereFilter): filter is OperandFilter {
  return filter.operator === 'Operand';
}

/**
 * Type guard to check if a filter is an AND filter
 *
 * @param filter - The filter to check
 * @returns True if the filter is an AndFilter
 */
export function isAndFilter(filter: WhereFilter): filter is AndFilter {
  return filter.operator === 'And';
}

/**
 * Type guard to check if a filter is an OR filter
 *
 * @param filter - The filter to check
 * @returns True if the filter is an OrFilter
 */
export function isOrFilter(filter: WhereFilter): filter is OrFilter {
  return filter.operator === 'Or';
}

/**
 * Type guard to check if a value is a GeoRange
 *
 * @param value - The value to check
 * @returns True if the value is a GeoRange
 */
export function isGeoRange(value: unknown): value is GeoRange {
  return (
    typeof value === 'object' &&
    value !== null &&
    'latitude' in value &&
    'longitude' in value &&
    'distanceKm' in value &&
    typeof (value as GeoRange).latitude === 'number' &&
    typeof (value as GeoRange).longitude === 'number' &&
    typeof (value as GeoRange).distanceKm === 'number'
  );
}
