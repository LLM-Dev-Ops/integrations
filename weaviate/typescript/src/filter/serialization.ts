/**
 * Filter serialization
 *
 * Provides functions to serialize WhereFilter objects to GraphQL and REST API formats.
 */

import type { WhereFilter, FilterOperand, FilterValue } from './types.js';
import { isOperandFilter, isAndFilter, isGeoRange } from './types.js';
import { operatorToGraphQL } from './operators.js';

/**
 * Serialize a filter to GraphQL where clause
 *
 * @param filter - The filter to serialize
 * @returns GraphQL where clause string
 *
 * @example
 * ```typescript
 * const filter = Filter.property("year").greaterThan(2020);
 * const graphql = serializeFilter(filter);
 * // Returns: "{ path: ["year"], operator: GreaterThan, valueInt: 2020 }"
 * ```
 */
export function serializeFilter(filter: WhereFilter): string {
  if (isOperandFilter(filter)) {
    return serializeOperand(filter.operand);
  }

  if (isAndFilter(filter)) {
    const operands = filter.operands
      .map((f) => serializeFilter(f))
      .join(', ');
    return `{ operator: And, operands: [${operands}] }`;
  }

  // OrFilter
  const operands = filter.operands.map((f) => serializeFilter(f)).join(', ');
  return `{ operator: Or, operands: [${operands}] }`;
}

/**
 * Serialize a filter to JSON for REST API
 *
 * @param filter - The filter to serialize
 * @returns JSON object
 */
export function serializeFilterJSON(filter: WhereFilter): object {
  if (isOperandFilter(filter)) {
    return serializeOperandJSON(filter.operand);
  }

  if (isAndFilter(filter)) {
    return {
      operator: 'And',
      operands: filter.operands.map((f) => serializeFilterJSON(f)),
    };
  }

  // OrFilter
  return {
    operator: 'Or',
    operands: filter.operands.map((f) => serializeFilterJSON(f)),
  };
}

/**
 * Serialize a filter operand to GraphQL
 *
 * @param operand - The operand to serialize
 * @returns GraphQL operand string
 */
export function serializeOperand(operand: FilterOperand): string {
  const pathStr = operand.path.map((p) => `"${escapeGraphQLString(p)}"`).join(', ');
  const operator = operatorToGraphQL(operand.operator);
  const valueStr = serializeValue(operand.value, operand.valueType);

  return `{ path: [${pathStr}], operator: ${operator}, ${valueStr} }`;
}

/**
 * Serialize a filter operand to JSON
 *
 * @param operand - The operand to serialize
 * @returns JSON object
 */
export function serializeOperandJSON(operand: FilterOperand): object {
  const result: any = {
    path: operand.path,
    operator: operatorToGraphQL(operand.operator),
  };

  // Add value with appropriate key
  const valueKey = getValueKey(operand.value, operand.valueType);
  result[valueKey] = serializeValueJSON(operand.value);

  return result;
}

/**
 * Serialize a filter value to GraphQL
 *
 * @param value - The value to serialize
 * @param valueType - Optional type hint
 * @returns GraphQL value string (key: value format)
 */
export function serializeValue(
  value: FilterValue,
  valueType?: string
): string {
  if (value === null) {
    return 'valueBoolean: true'; // IsNull operator uses boolean
  }

  // Handle GeoRange
  if (isGeoRange(value)) {
    return serializeGeoRange(value);
  }

  // Handle arrays
  if (Array.isArray(value)) {
    const key = getArrayValueKey(value, valueType);
    if (typeof value[0] === 'string') {
      const items = value
        .map((v) => `"${escapeGraphQLString(String(v))}"`)
        .join(', ');
      return `${key}: [${items}]`;
    } else {
      const items = value.join(', ');
      return `${key}: [${items}]`;
    }
  }

  // Handle primitives
  const key = getValueKey(value, valueType);
  const serializedValue = serializeValueJSON(value);

  if (typeof serializedValue === 'string') {
    return `${key}: "${escapeGraphQLString(serializedValue)}"`;
  }

  return `${key}: ${serializedValue}`;
}

/**
 * Serialize a filter value to JSON
 *
 * @param value - The value to serialize
 * @returns JSON value
 */
export function serializeValueJSON(value: FilterValue): any {
  if (value === null) {
    return true; // IsNull operator uses boolean
  }

  if (isGeoRange(value)) {
    return {
      geoCoordinates: {
        latitude: value.latitude,
        longitude: value.longitude,
      },
      distance: {
        max: value.distanceKm * 1000, // Convert to meters
      },
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

/**
 * Serialize a geo range to GraphQL
 *
 * @param geoRange - The geo range to serialize
 * @returns GraphQL geo range string
 */
function serializeGeoRange(geoRange: {
  latitude: number;
  longitude: number;
  distanceKm: number;
}): string {
  const distanceMeters = geoRange.distanceKm * 1000;
  return `valueGeoRange: { geoCoordinates: { latitude: ${geoRange.latitude}, longitude: ${geoRange.longitude} }, distance: { max: ${distanceMeters} } }`;
}

/**
 * Get the appropriate value key for a value
 *
 * @param value - The value
 * @param valueType - Optional type hint
 * @returns Value key (e.g., "valueText", "valueInt")
 */
function getValueKey(value: FilterValue, valueType?: string): string {
  if (valueType) {
    switch (valueType) {
      case 'text':
        return 'valueText';
      case 'int':
        return 'valueInt';
      case 'number':
        return 'valueNumber';
      case 'boolean':
        return 'valueBoolean';
      case 'date':
        return 'valueDate';
      case 'uuid':
        return 'valueText';
    }
  }

  // Infer from value type
  if (typeof value === 'string') {
    return 'valueText';
  }
  if (typeof value === 'boolean') {
    return 'valueBoolean';
  }
  if (typeof value === 'number') {
    // Default to int for whole numbers, number for decimals
    return Number.isInteger(value) ? 'valueInt' : 'valueNumber';
  }
  if (value instanceof Date) {
    return 'valueDate';
  }
  if (isGeoRange(value)) {
    return 'valueGeoRange';
  }

  return 'valueText'; // Default fallback
}

/**
 * Get the appropriate value key for an array
 *
 * @param value - The array value
 * @param valueType - Optional type hint
 * @returns Value key for array
 */
function getArrayValueKey(value: unknown[], valueType?: string): string {
  if (valueType) {
    return valueType === 'int' ? 'valueInt' : 'valueText';
  }

  if (value.length === 0) {
    return 'valueText'; // Default
  }

  const firstItem = value[0];
  if (typeof firstItem === 'string') {
    return 'valueText';
  }
  if (typeof firstItem === 'number') {
    return Number.isInteger(firstItem) ? 'valueInt' : 'valueNumber';
  }

  return 'valueText'; // Default fallback
}

/**
 * Escape a string for use in GraphQL
 *
 * Escapes special characters that need escaping in GraphQL strings.
 *
 * @param str - String to escape
 * @returns Escaped string
 */
export function escapeGraphQLString(str: string): string {
  return str
    .replace(/\\/g, '\\\\') // Backslash
    .replace(/"/g, '\\"') // Double quote
    .replace(/\n/g, '\\n') // Newline
    .replace(/\r/g, '\\r') // Carriage return
    .replace(/\t/g, '\\t'); // Tab
}

/**
 * Build a complete GraphQL where clause
 *
 * Wraps the filter in the appropriate GraphQL syntax.
 *
 * @param filter - The filter to serialize
 * @returns Complete GraphQL where clause
 */
export function buildWhereClause(filter: WhereFilter): string {
  return `where: ${serializeFilter(filter)}`;
}
