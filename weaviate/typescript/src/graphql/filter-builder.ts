/**
 * GraphQL filter serialization
 *
 * Converts WhereFilter objects to GraphQL where clause strings.
 */

import type {
  WhereFilter,
  FilterOperator,
  FilterValue,
  GeoRange,
} from '../types/filter.js';
import {
  isOperandFilter,
  isAndFilter,
  isOrFilter,
  isGeoRange,
} from '../types/filter.js';

/**
 * Serializes a filter to GraphQL where clause format
 *
 * @param filter - The filter to serialize
 * @returns GraphQL where clause string
 *
 * @example
 * ```typescript
 * const filter: WhereFilter = {
 *   operator: 'Operand',
 *   operand: {
 *     path: ['age'],
 *     operator: FilterOperator.GreaterThan,
 *     value: 18
 *   }
 * };
 *
 * const graphql = serializeFilterGraphQL(filter);
 * // Returns: "{ path: [\"age\"], operator: GreaterThan, valueInt: 18 }"
 * ```
 */
export function serializeFilterGraphQL(filter: WhereFilter): string {
  if (isOperandFilter(filter)) {
    return serializeOperandFilter(filter.operand);
  } else if (isAndFilter(filter)) {
    const operands = filter.operands
      .map((f) => serializeFilterGraphQL(f))
      .join(', ');
    return `{ operator: And, operands: [${operands}] }`;
  } else if (isOrFilter(filter)) {
    const operands = filter.operands
      .map((f) => serializeFilterGraphQL(f))
      .join(', ');
    return `{ operator: Or, operands: [${operands}] }`;
  }

  throw new Error(`Unknown filter type: ${JSON.stringify(filter)}`);
}

/**
 * Serializes a single operand filter
 */
function serializeOperandFilter(operand: {
  path: string[];
  operator: FilterOperator;
  value: FilterValue;
  valueType?: string;
}): string {
  const pathStr = operand.path.map((p) => `"${escapeString(p)}"`).join(', ');
  const operatorStr = serializeOperator(operand.operator);
  const valueStr = serializeFilterValue(operand.value, operand.operator);

  return `{ path: [${pathStr}], operator: ${operatorStr}, ${valueStr} }`;
}

/**
 * Serializes a filter operator to GraphQL format
 *
 * @param operator - The operator to serialize
 * @returns GraphQL operator string
 */
export function serializeOperator(operator: FilterOperator): string {
  // Operators are already in the correct format for GraphQL
  return operator;
}

/**
 * Serializes a filter value to GraphQL format
 *
 * Determines the correct value field (valueText, valueInt, etc.) based on
 * the value type and operator.
 *
 * @param value - The value to serialize
 * @param operator - The operator being used (affects serialization)
 * @returns GraphQL value field string (e.g., "valueInt: 42")
 */
export function serializeFilterValue(
  value: FilterValue,
  operator: FilterOperator
): string {
  // Handle null
  if (value === null) {
    return 'valueBoolean: true'; // IsNull operator uses valueBoolean
  }

  // Handle GeoRange
  if (isGeoRange(value)) {
    return serializeGeoRange(value);
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return serializeArrayValue(value);
  }

  // Handle Date
  if (value instanceof Date) {
    return `valueDate: "${value.toISOString()}"`;
  }

  // Handle primitives
  if (typeof value === 'string') {
    return `valueText: "${escapeString(value)}"`;
  }

  if (typeof value === 'number') {
    // Check if it's an integer or float
    if (Number.isInteger(value)) {
      return `valueInt: ${value}`;
    } else {
      return `valueNumber: ${value}`;
    }
  }

  if (typeof value === 'boolean') {
    return `valueBoolean: ${value}`;
  }

  throw new Error(`Unsupported filter value type: ${typeof value}`);
}

/**
 * Serializes an array value
 */
function serializeArrayValue(arr: unknown[]): string {
  if (arr.length === 0) {
    return 'valueText: []';
  }

  const first = arr[0];

  // String array
  if (typeof first === 'string') {
    const items = (arr as string[])
      .map((s) => `"${escapeString(s)}"`)
      .join(', ');
    return `valueText: [${items}]`;
  }

  // Number array
  if (typeof first === 'number') {
    const items = (arr as number[]).join(', ');
    // Determine if int or number
    if ((arr as number[]).every((n) => Number.isInteger(n))) {
      return `valueInt: [${items}]`;
    } else {
      return `valueNumber: [${items}]`;
    }
  }

  // Date array
  if (first instanceof Date) {
    const items = (arr as Date[])
      .map((d) => `"${d.toISOString()}"`)
      .join(', ');
    return `valueDate: [${items}]`;
  }

  throw new Error(`Unsupported array element type: ${typeof first}`);
}

/**
 * Serializes a GeoRange value
 */
function serializeGeoRange(range: GeoRange): string {
  const distanceMeters = range.distanceKm * 1000;
  return `valueGeoRange: { geoCoordinates: { latitude: ${range.latitude}, longitude: ${range.longitude} }, distance: { max: ${distanceMeters} } }`;
}

/**
 * Escapes special characters in strings for GraphQL
 *
 * @param str - String to escape
 * @returns Escaped string
 */
function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\') // Backslash
    .replace(/"/g, '\\"') // Double quote
    .replace(/\n/g, '\\n') // Newline
    .replace(/\r/g, '\\r') // Carriage return
    .replace(/\t/g, '\\t'); // Tab
}

/**
 * Builds a simple operand filter as GraphQL string
 *
 * Convenience function for single operand filters.
 *
 * @example
 * ```typescript
 * const clause = buildOperandClause(['status'], FilterOperator.Equal, 'active');
 * // Returns: "{ path: [\"status\"], operator: Equal, valueText: \"active\" }"
 * ```
 */
export function buildOperandClause(
  path: string[],
  operator: FilterOperator,
  value: FilterValue
): string {
  return serializeFilterGraphQL({
    operator: 'Operand',
    operand: { path, operator, value },
  });
}
