/**
 * Aggregation types for Google Cloud Firestore.
 *
 * Following the SPARC specification for Firestore integration.
 * Represents aggregation queries (count, sum, average) and their results.
 */

import { Query, FieldReference } from "./query.js";
import { FieldValue } from "./field-value.js";
import { Timestamp } from "./document.js";

// ============================================================================
// Aggregation Types
// ============================================================================

/**
 * Count aggregation - counts documents matching a query.
 */
export interface CountAggregation {
  type: "count";
  /** Optional alias for the result */
  alias?: string;
}

/**
 * Sum aggregation - sums values of a numeric field.
 */
export interface SumAggregation {
  type: "sum";
  /** Field to sum */
  field: FieldReference;
  /** Optional alias for the result */
  alias?: string;
}

/**
 * Average aggregation - calculates average of a numeric field.
 */
export interface AverageAggregation {
  type: "average";
  /** Field to average */
  field: FieldReference;
  /** Optional alias for the result */
  alias?: string;
}

/**
 * Aggregation union type.
 */
export type Aggregation = CountAggregation | SumAggregation | AverageAggregation;

// ============================================================================
// Aggregation Result Types
// ============================================================================

/**
 * Integer value result from an aggregation.
 */
export interface IntegerValue {
  type: "integer";
  value: number;
}

/**
 * Double value result from an aggregation.
 */
export interface DoubleValue {
  type: "double";
  value: number;
}

/**
 * Null value result from an aggregation.
 */
export interface NullValue {
  type: "null";
  value: null;
}

/**
 * Aggregate value union type.
 * Result values from aggregation operations.
 */
export type AggregateValue = IntegerValue | DoubleValue | NullValue;

/**
 * Single aggregation result.
 */
export interface AggregateFieldResult {
  /** Alias of the aggregation */
  alias: string;
  /** Aggregated value */
  value: AggregateValue;
}

/**
 * Result of an aggregation query.
 */
export interface AggregationResult {
  /** Map of alias to aggregated values */
  aggregations: Map<string, AggregateValue>;
  /** Time the aggregation was read */
  read_time: Timestamp;
}

/**
 * Aggregation query combining a base query with aggregations.
 */
export interface AggregationQuery {
  /** Base structured query to aggregate over */
  structuredQuery: Query;
  /** Aggregations to compute */
  aggregations: Aggregation[];
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a count aggregation.
 */
export function createCountAggregation(alias?: string): CountAggregation {
  return { type: "count", alias };
}

/**
 * Create a sum aggregation.
 */
export function createSumAggregation(
  fieldPath: string,
  alias?: string
): SumAggregation {
  return {
    type: "sum",
    field: { fieldPath },
    alias,
  };
}

/**
 * Create an average aggregation.
 */
export function createAverageAggregation(
  fieldPath: string,
  alias?: string
): AverageAggregation {
  return {
    type: "average",
    field: { fieldPath },
    alias,
  };
}

/**
 * Create an aggregation query.
 */
export function createAggregationQuery(
  query: Query,
  aggregations: Aggregation[]
): AggregationQuery {
  return {
    structuredQuery: query,
    aggregations,
  };
}

/**
 * Create an integer aggregate value.
 */
export function integerAggregateValue(value: number): AggregateValue {
  return { type: "integer", value: Math.floor(value) };
}

/**
 * Create a double aggregate value.
 */
export function doubleAggregateValue(value: number): AggregateValue {
  return { type: "double", value };
}

/**
 * Create a null aggregate value.
 */
export function nullAggregateValue(): AggregateValue {
  return { type: "null", value: null };
}

/**
 * Convert an AggregateValue to a JavaScript number or null.
 */
export function fromAggregateValue(value: AggregateValue): number | null {
  switch (value.type) {
    case "integer":
    case "double":
      return value.value;
    case "null":
      return null;
  }
}

/**
 * Create an aggregation result.
 */
export function createAggregationResult(
  aggregations: Map<string, AggregateValue>,
  read_time: Timestamp
): AggregationResult {
  return { aggregations, read_time };
}

/**
 * Get aggregation result by alias.
 */
export function getAggregationValue(
  result: AggregationResult,
  alias: string
): AggregateValue | undefined {
  return result.aggregations.get(alias);
}

/**
 * Get aggregation result as number.
 */
export function getAggregationNumber(
  result: AggregationResult,
  alias: string
): number | null {
  const value = getAggregationValue(result, alias);
  return value ? fromAggregateValue(value) : null;
}

/**
 * Parse aggregation result from API response.
 */
export function parseAggregationResult(
  response: Record<string, unknown>,
  read_time: Timestamp
): AggregationResult {
  const aggregations = new Map<string, AggregateValue>();

  if (response.result && typeof response.result === "object") {
    const resultObj = response.result as Record<string, unknown>;

    for (const [alias, value] of Object.entries(resultObj)) {
      if (value && typeof value === "object") {
        const fieldValue = value as FieldValue;

        if ("integerValue" in fieldValue) {
          const intVal =
            typeof fieldValue.integerValue === "string"
              ? parseInt(fieldValue.integerValue, 10)
              : (fieldValue.integerValue as number);
          aggregations.set(alias, integerAggregateValue(intVal));
        } else if ("doubleValue" in fieldValue) {
          aggregations.set(
            alias,
            doubleAggregateValue(fieldValue.doubleValue as number)
          );
        } else if ("nullValue" in fieldValue) {
          aggregations.set(alias, nullAggregateValue());
        }
      }
    }
  }

  return createAggregationResult(aggregations, read_time);
}
