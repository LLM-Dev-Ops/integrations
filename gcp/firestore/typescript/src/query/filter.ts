/**
 * Filter construction helpers for Firestore queries.
 *
 * Provides helper functions for creating and validating filters
 * according to Firestore query constraints and best practices.
 */

import {
  Filter,
  FieldFilter,
  UnaryFilter,
  CompositeFilter,
  FieldValue,
  FilterOp,
  CompositeOp,
  UnaryOp,
  FieldReference,
} from "../types/index.js";

/**
 * Maximum number of values allowed in IN and ARRAY_CONTAINS_ANY clauses.
 * Firestore limit is 30 values.
 */
const MAX_IN_VALUES = 30;

/**
 * Maximum number of OR clauses in a composite filter.
 * Firestore limit is 30 disjunctions.
 */
const MAX_OR_CLAUSES = 30;

/**
 * Create a field reference from a field path.
 *
 * @param fieldPath - The field path (e.g., "user.email")
 * @returns Field reference object
 */
export function createFieldReference(fieldPath: string): FieldReference {
  return { fieldPath };
}

/**
 * Create a field filter.
 *
 * @param field - Field path or field reference
 * @param op - Filter operator
 * @param value - Value to filter on
 * @returns Field filter wrapped in Filter union type
 *
 * @example
 * ```typescript
 * const filter = fieldFilter("age", "GREATER_THAN", { integerValue: "18" });
 * ```
 */
export function fieldFilter(
  field: string | FieldReference,
  op: FilterOp,
  value: FieldValue
): Filter {
  const fieldRef = typeof field === "string" ? createFieldReference(field) : field;

  const filter: FieldFilter = {
    field: fieldRef,
    op,
    value,
  };

  return { fieldFilter: filter };
}

/**
 * Create a unary filter.
 *
 * @param field - Field path or field reference
 * @param op - Unary operator (IS_NULL, IS_NOT_NULL, IS_NAN, IS_NOT_NAN)
 * @returns Unary filter wrapped in Filter union type
 *
 * @example
 * ```typescript
 * const filter = unaryFilter("deletedAt", "IS_NULL");
 * ```
 */
export function unaryFilter(
  field: string | FieldReference,
  op: UnaryOp
): Filter {
  const fieldRef = typeof field === "string" ? createFieldReference(field) : field;

  const filter: UnaryFilter = {
    field: fieldRef,
    op,
  };

  return { unaryFilter: filter };
}

/**
 * Create a composite filter combining multiple filters.
 *
 * @param op - Composite operator (AND or OR)
 * @param filters - Array of filters to combine
 * @returns Composite filter wrapped in Filter union type
 *
 * @throws {Error} If validation fails
 *
 * @example
 * ```typescript
 * const filter = compositeFilter("AND", [
 *   fieldFilter("age", "GREATER_THAN", { integerValue: "18" }),
 *   fieldFilter("city", "EQUAL", { stringValue: "NYC" })
 * ]);
 * ```
 */
export function compositeFilter(op: CompositeOp, filters: Filter[]): Filter {
  validateCompositeFilter(op, filters);

  const filter: CompositeFilter = {
    op,
    filters,
  };

  return { compositeFilter: filter };
}

/**
 * Validate a filter for Firestore constraints.
 *
 * @param filter - The filter to validate
 * @throws {Error} If the filter is invalid
 */
export function validateFilter(filter: Filter): void {
  if ("fieldFilter" in filter) {
    validateFieldFilter(filter.fieldFilter);
  } else if ("unaryFilter" in filter) {
    validateUnaryFilter(filter.unaryFilter);
  } else if ("compositeFilter" in filter) {
    validateCompositeFilter(
      filter.compositeFilter.op,
      filter.compositeFilter.filters
    );
  }
}

/**
 * Validate a field filter.
 *
 * @param filter - The field filter to validate
 * @throws {Error} If the filter is invalid
 */
function validateFieldFilter(filter: FieldFilter): void {
  if (!filter.field || !filter.field.fieldPath) {
    throw new Error("Field filter must have a valid field path");
  }

  if (!filter.op) {
    throw new Error("Field filter must have an operator");
  }

  if (!filter.value) {
    throw new Error("Field filter must have a value");
  }

  // Validate IN and NOT_IN operators
  if (filter.op === "IN" || filter.op === "NOT_IN") {
    if (!("arrayValue" in filter.value)) {
      throw new Error(`${filter.op} operator requires an array value`);
    }
    validateInClause(filter.value.arrayValue.values);
  }

  // Validate ARRAY_CONTAINS_ANY operator
  if (filter.op === "ARRAY_CONTAINS_ANY") {
    if (!("arrayValue" in filter.value)) {
      throw new Error("ARRAY_CONTAINS_ANY operator requires an array value");
    }
    validateInClause(filter.value.arrayValue.values);
  }
}

/**
 * Validate a unary filter.
 *
 * @param filter - The unary filter to validate
 * @throws {Error} If the filter is invalid
 */
function validateUnaryFilter(filter: UnaryFilter): void {
  if (!filter.field || !filter.field.fieldPath) {
    throw new Error("Unary filter must have a valid field path");
  }

  if (!filter.op) {
    throw new Error("Unary filter must have an operator");
  }

  const validOps: UnaryOp[] = ["IS_NULL", "IS_NOT_NULL", "IS_NAN", "IS_NOT_NAN"];
  if (!validOps.includes(filter.op)) {
    throw new Error(`Invalid unary operator: ${filter.op}`);
  }
}

/**
 * Validate IN clause values.
 * Firestore allows maximum 30 values in IN, NOT_IN, and ARRAY_CONTAINS_ANY.
 *
 * @param values - Array of values to validate
 * @throws {Error} If validation fails
 */
export function validateInClause(values: FieldValue[]): void {
  if (!Array.isArray(values)) {
    throw new Error("IN clause values must be an array");
  }

  if (values.length === 0) {
    throw new Error("IN clause must have at least one value");
  }

  if (values.length > MAX_IN_VALUES) {
    throw new Error(
      `IN clause cannot have more than ${MAX_IN_VALUES} values (got ${values.length})`
    );
  }
}

/**
 * Validate composite filter.
 *
 * @param op - Composite operator
 * @param filters - Array of filters
 * @throws {Error} If validation fails
 */
function validateCompositeFilter(op: CompositeOp, filters: Filter[]): void {
  if (!filters || !Array.isArray(filters)) {
    throw new Error("Composite filter must have an array of filters");
  }

  if (filters.length === 0) {
    throw new Error("Composite filter must have at least one filter");
  }

  // Validate OR clause count
  if (op === "OR") {
    validateOrClauses(filters);
  }

  // Recursively validate all child filters
  filters.forEach((filter) => validateFilter(filter));
}

/**
 * Validate OR clauses.
 * Firestore allows maximum 30 OR clauses in a disjunction.
 *
 * @param filters - Array of filters to validate
 * @throws {Error} If validation fails
 */
export function validateOrClauses(filters: Filter[]): void {
  if (!Array.isArray(filters)) {
    throw new Error("OR clauses must be an array");
  }

  if (filters.length > MAX_OR_CLAUSES) {
    throw new Error(
      `OR filter cannot have more than ${MAX_OR_CLAUSES} clauses (got ${filters.length})`
    );
  }
}

/**
 * Convert JavaScript value to FieldValue.
 * Helper function for creating field values from common types.
 *
 * @param value - JavaScript value to convert
 * @returns Firestore FieldValue
 *
 * @example
 * ```typescript
 * toFieldValue(null)           // { nullValue: null }
 * toFieldValue(true)           // { booleanValue: true }
 * toFieldValue(42)             // { integerValue: "42" }
 * toFieldValue(3.14)           // { doubleValue: 3.14 }
 * toFieldValue("hello")        // { stringValue: "hello" }
 * toFieldValue(new Date())     // { timestampValue: "..." }
 * toFieldValue([1, 2, 3])      // { arrayValue: { values: [...] } }
 * toFieldValue({ a: 1 })       // { mapValue: { fields: {...} } }
 * ```
 */
export function toFieldValue(value: unknown): FieldValue {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return { integerValue: String(value) };
    }
    return { doubleValue: value };
  }

  if (typeof value === "string") {
    return { stringValue: value };
  }

  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }

  if (value instanceof Uint8Array) {
    return { bytesValue: Buffer.from(value).toString("base64") };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((v) => toFieldValue(v)),
      },
    };
  }

  if (typeof value === "object") {
    // Check for GeoPoint
    if ("latitude" in value && "longitude" in value) {
      return {
        geoPointValue: {
          latitude: (value as any).latitude,
          longitude: (value as any).longitude,
        },
      };
    }

    // Regular object - convert to map
    const fields: Record<string, FieldValue> = {};
    for (const [key, val] of Object.entries(value)) {
      fields[key] = toFieldValue(val);
    }
    return { mapValue: { fields } };
  }

  throw new Error(`Cannot convert value to FieldValue: ${typeof value}`);
}

/**
 * Convert FieldValue to JavaScript value.
 *
 * @param fieldValue - Firestore FieldValue to convert
 * @returns JavaScript value
 */
export function fromFieldValue(fieldValue: FieldValue): unknown {
  if ("nullValue" in fieldValue) {
    return null;
  }

  if ("booleanValue" in fieldValue) {
    return fieldValue.booleanValue;
  }

  if ("integerValue" in fieldValue) {
    return parseInt(fieldValue.integerValue, 10);
  }

  if ("doubleValue" in fieldValue) {
    return fieldValue.doubleValue;
  }

  if ("timestampValue" in fieldValue) {
    return new Date(fieldValue.timestampValue);
  }

  if ("stringValue" in fieldValue) {
    return fieldValue.stringValue;
  }

  if ("bytesValue" in fieldValue) {
    return Buffer.from(fieldValue.bytesValue, "base64");
  }

  if ("referenceValue" in fieldValue) {
    return fieldValue.referenceValue;
  }

  if ("geoPointValue" in fieldValue) {
    return fieldValue.geoPointValue;
  }

  if ("arrayValue" in fieldValue) {
    return fieldValue.arrayValue.values.map((v) => fromFieldValue(v));
  }

  if ("mapValue" in fieldValue) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(fieldValue.mapValue.fields)) {
      result[key] = fromFieldValue(val);
    }
    return result;
  }

  throw new Error("Unknown FieldValue type");
}

/**
 * Create multiple filters with AND logic.
 *
 * @param filters - Array of filters to combine
 * @returns Combined filter, or single filter if only one provided
 */
export function andFilters(...filters: Filter[]): Filter {
  if (filters.length === 0) {
    throw new Error("Must provide at least one filter");
  }

  if (filters.length === 1) {
    return filters[0];
  }

  return compositeFilter("AND", filters);
}

/**
 * Create multiple filters with OR logic.
 *
 * @param filters - Array of filters to combine
 * @returns Combined filter, or single filter if only one provided
 */
export function orFilters(...filters: Filter[]): Filter {
  if (filters.length === 0) {
    throw new Error("Must provide at least one filter");
  }

  if (filters.length === 1) {
    return filters[0];
  }

  return compositeFilter("OR", filters);
}
