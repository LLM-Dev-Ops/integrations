/**
 * Filter evaluation for mock client
 *
 * This module implements Weaviate's where filter logic for filtering
 * objects in the mock client's in-memory store.
 */

import type {
  WhereFilter,
  FilterOperand,
  FilterOperator,
  FilterValue,
  GeoRange,
} from '../types/filter.js';
import type { WeaviateObject } from '../types/object.js';
import { isAndFilter, isOrFilter, isOperandFilter, isGeoRange } from '../types/filter.js';
import { isGeoCoordinates } from '../types/property.js';

/**
 * Evaluates a where filter against an object
 *
 * @param object - The object to evaluate
 * @param filter - The filter to apply
 * @returns True if the object matches the filter
 */
export function matchesFilter(
  object: WeaviateObject,
  filter: WhereFilter
): boolean {
  if (isOperandFilter(filter)) {
    return evaluateOperand(object, filter.operand);
  } else if (isAndFilter(filter)) {
    // All operands must match
    return filter.operands.every((f) => matchesFilter(object, f));
  } else if (isOrFilter(filter)) {
    // At least one operand must match
    return filter.operands.some((f) => matchesFilter(object, f));
  }

  return false;
}

/**
 * Evaluates a single filter operand against an object
 *
 * @param object - The object to evaluate
 * @param operand - The filter operand
 * @returns True if the operand matches
 */
export function evaluateOperand(
  object: WeaviateObject,
  operand: FilterOperand
): boolean {
  // Navigate the property path
  const value = getPropertyValue(object, operand.path);

  // Evaluate the operator
  return evaluateOperator(value, operand.operator, operand.value);
}

/**
 * Gets a property value from an object following a path
 *
 * @param object - The object
 * @param path - Property path (supports nested properties)
 * @returns Property value or undefined if not found
 */
function getPropertyValue(
  object: WeaviateObject,
  path: string[]
): unknown {
  let current: any = object.properties;

  for (const segment of path) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

/**
 * Evaluates an operator against a value
 *
 * @param actualValue - The actual property value from the object
 * @param operator - The filter operator
 * @param filterValue - The filter value to compare against
 * @returns True if the comparison matches
 */
export function evaluateOperator(
  actualValue: unknown,
  operator: FilterOperator,
  filterValue: FilterValue
): boolean {
  switch (operator) {
    case 'Equal':
      return isEqual(actualValue, filterValue);

    case 'NotEqual':
      return !isEqual(actualValue, filterValue);

    case 'GreaterThan':
      return isGreaterThan(actualValue, filterValue);

    case 'GreaterThanEqual':
      return isGreaterThanEqual(actualValue, filterValue);

    case 'LessThan':
      return isLessThan(actualValue, filterValue);

    case 'LessThanEqual':
      return isLessThanEqual(actualValue, filterValue);

    case 'Like':
      return matchesLike(actualValue, filterValue);

    case 'WithinGeoRange':
      return isWithinGeoRange(actualValue, filterValue);

    case 'IsNull':
      return actualValue === null || actualValue === undefined;

    case 'ContainsAny':
      return containsAny(actualValue, filterValue);

    case 'ContainsAll':
      return containsAll(actualValue, filterValue);

    default:
      throw new Error(`Unsupported filter operator: ${operator}`);
  }
}

/**
 * Checks equality
 */
function isEqual(actual: unknown, filter: FilterValue): boolean {
  if (actual instanceof Date && filter instanceof Date) {
    return actual.getTime() === filter.getTime();
  }
  return actual === filter;
}

/**
 * Checks greater than
 */
function isGreaterThan(actual: unknown, filter: FilterValue): boolean {
  if (typeof actual === 'number' && typeof filter === 'number') {
    return actual > filter;
  }
  if (actual instanceof Date && filter instanceof Date) {
    return actual > filter;
  }
  return false;
}

/**
 * Checks greater than or equal
 */
function isGreaterThanEqual(actual: unknown, filter: FilterValue): boolean {
  if (typeof actual === 'number' && typeof filter === 'number') {
    return actual >= filter;
  }
  if (actual instanceof Date && filter instanceof Date) {
    return actual >= filter;
  }
  return false;
}

/**
 * Checks less than
 */
function isLessThan(actual: unknown, filter: FilterValue): boolean {
  if (typeof actual === 'number' && typeof filter === 'number') {
    return actual < filter;
  }
  if (actual instanceof Date && filter instanceof Date) {
    return actual < filter;
  }
  return false;
}

/**
 * Checks less than or equal
 */
function isLessThanEqual(actual: unknown, filter: FilterValue): boolean {
  if (typeof actual === 'number' && typeof filter === 'number') {
    return actual <= filter;
  }
  if (actual instanceof Date && filter instanceof Date) {
    return actual <= filter;
  }
  return false;
}

/**
 * Checks wildcard pattern matching
 *
 * Supports:
 * - ? for single character
 * - * for any characters
 */
function matchesLike(actual: unknown, filter: FilterValue): boolean {
  if (typeof actual !== 'string' || typeof filter !== 'string') {
    return false;
  }

  // Convert wildcard pattern to regex
  const pattern = filter
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
    .replace(/\?/g, '.') // ? matches single char
    .replace(/\*/g, '.*'); // * matches any chars

  const regex = new RegExp(`^${pattern}$`, 'i');
  return regex.test(actual);
}

/**
 * Checks if coordinates are within geo range
 */
function isWithinGeoRange(actual: unknown, filter: FilterValue): boolean {
  if (!isGeoCoordinates(actual) || !isGeoRange(filter)) {
    return false;
  }

  // Calculate distance using Haversine formula
  const distance = calculateGeoDistance(
    actual.latitude,
    actual.longitude,
    filter.latitude,
    filter.longitude
  );

  return distance <= filter.distanceKm;
}

/**
 * Calculates distance between two coordinates using Haversine formula
 *
 * @param lat1 - First latitude
 * @param lon1 - First longitude
 * @param lat2 - Second latitude
 * @param lon2 - Second longitude
 * @returns Distance in kilometers
 */
function calculateGeoDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Converts degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Checks if array contains any of the filter values
 */
function containsAny(actual: unknown, filter: FilterValue): boolean {
  if (!Array.isArray(actual)) {
    return false;
  }

  if (Array.isArray(filter)) {
    return filter.some((filterVal) =>
      actual.some((actualVal) => actualVal === filterVal)
    );
  }

  return actual.includes(filter);
}

/**
 * Checks if array contains all of the filter values
 */
function containsAll(actual: unknown, filter: FilterValue): boolean {
  if (!Array.isArray(actual)) {
    return false;
  }

  if (Array.isArray(filter)) {
    return filter.every((filterVal) =>
      actual.some((actualVal) => actualVal === filterVal)
    );
  }

  return actual.includes(filter);
}
