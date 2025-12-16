/**
 * Filter operator utilities
 *
 * Provides utilities for working with filter operators, including
 * GraphQL serialization, compatibility checks, and value key mapping.
 */

import { FilterOperator } from './types.js';

/**
 * Convert a filter operator to its GraphQL representation
 *
 * @param operator - Filter operator
 * @returns GraphQL operator string
 */
export function operatorToGraphQL(operator: FilterOperator): string {
  // FilterOperator enum values already match GraphQL format
  return operator;
}

/**
 * Check if an operator is compatible with a data type
 *
 * @param operator - Filter operator
 * @param dataType - Property data type
 * @returns True if the operator is compatible with the data type
 */
export function isOperatorCompatible(
  operator: FilterOperator,
  dataType: string
): boolean {
  const baseType = dataType.replace('[]', '').toLowerCase();

  switch (operator) {
    case FilterOperator.Equal:
    case FilterOperator.NotEqual:
    case FilterOperator.IsNull:
      // These operators work with all types
      return true;

    case FilterOperator.GreaterThan:
    case FilterOperator.GreaterThanEqual:
    case FilterOperator.LessThan:
    case FilterOperator.LessThanEqual:
      // Comparison operators work with numeric, date, and text types
      return (
        baseType === 'int' ||
        baseType === 'number' ||
        baseType === 'date' ||
        baseType === 'text'
      );

    case FilterOperator.Like:
      // Like operator only works with text
      return baseType === 'text';

    case FilterOperator.ContainsAny:
    case FilterOperator.ContainsAll:
      // Array operators require array types
      return dataType.includes('[]');

    case FilterOperator.WithinGeoRange:
      // Geo operator only works with geoCoordinates
      return baseType === 'geocoordinates';

    default:
      return false;
  }
}

/**
 * Get the value key for an operator
 *
 * Weaviate uses different value keys based on the data type:
 * - valueText for text
 * - valueInt for integers
 * - valueNumber for numbers
 * - valueBoolean for booleans
 * - valueDate for dates
 * - valueGeoRange for geo ranges
 *
 * @param operator - Filter operator
 * @returns Value key for GraphQL
 */
export function getOperatorValueKey(operator: FilterOperator): string {
  switch (operator) {
    case FilterOperator.WithinGeoRange:
      return 'valueGeoRange';
    case FilterOperator.IsNull:
      return 'valueBoolean';
    default:
      // The specific key is determined by the actual value type during serialization
      return 'value';
  }
}

/**
 * Get all operators compatible with a data type
 *
 * @param dataType - Property data type
 * @returns Array of compatible operators
 */
export function getCompatibleOperators(dataType: string): FilterOperator[] {
  return Object.values(FilterOperator).filter((op) =>
    isOperatorCompatible(op, dataType)
  );
}

/**
 * Check if an operator requires an array value
 *
 * @param operator - Filter operator
 * @returns True if the operator expects an array value
 */
export function isArrayOperator(operator: FilterOperator): boolean {
  return (
    operator === FilterOperator.ContainsAny ||
    operator === FilterOperator.ContainsAll
  );
}

/**
 * Check if an operator requires a boolean value
 *
 * @param operator - Filter operator
 * @returns True if the operator expects a boolean value
 */
export function isBooleanOperator(operator: FilterOperator): boolean {
  return operator === FilterOperator.IsNull;
}

/**
 * Check if an operator is a comparison operator
 *
 * @param operator - Filter operator
 * @returns True if the operator is a comparison operator
 */
export function isComparisonOperator(operator: FilterOperator): boolean {
  return (
    operator === FilterOperator.GreaterThan ||
    operator === FilterOperator.GreaterThanEqual ||
    operator === FilterOperator.LessThan ||
    operator === FilterOperator.LessThanEqual
  );
}

/**
 * Check if an operator is an equality operator
 *
 * @param operator - Filter operator
 * @returns True if the operator is an equality operator
 */
export function isEqualityOperator(operator: FilterOperator): boolean {
  return (
    operator === FilterOperator.Equal || operator === FilterOperator.NotEqual
  );
}

/**
 * Check if an operator is a geo operator
 *
 * @param operator - Filter operator
 * @returns True if the operator is a geo operator
 */
export function isGeoOperator(operator: FilterOperator): boolean {
  return operator === FilterOperator.WithinGeoRange;
}

/**
 * Check if an operator is a text operator
 *
 * @param operator - Filter operator
 * @returns True if the operator is a text operator
 */
export function isTextOperator(operator: FilterOperator): boolean {
  return operator === FilterOperator.Like;
}
