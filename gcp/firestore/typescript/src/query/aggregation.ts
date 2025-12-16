/**
 * Aggregation query building for Firestore.
 *
 * Provides functions for creating and executing aggregation queries
 * including COUNT, SUM, and AVG operations.
 */

import {
  Aggregation,
  CountAggregation,
  SumAggregation,
  AverageAggregation,
  AggregationQuery,
  Query,
  FieldReference,
} from "../types/index.js";
import { createFieldReference } from "./filter.js";

/**
 * Default alias for count aggregations when none is provided.
 */
const DEFAULT_COUNT_ALIAS = "count";

/**
 * Default alias prefix for sum aggregations.
 */
const DEFAULT_SUM_ALIAS_PREFIX = "sum_";

/**
 * Default alias prefix for average aggregations.
 */
const DEFAULT_AVG_ALIAS_PREFIX = "avg_";

/**
 * Create a COUNT aggregation.
 *
 * @param alias - Optional alias for the aggregation result (default: "count")
 * @returns Count aggregation object
 *
 * @example
 * ```typescript
 * // Count all documents in result set
 * const countAgg = createCountAggregation();
 *
 * // Count with custom alias
 * const countAgg = createCountAggregation("total_users");
 * ```
 */
export function createCountAggregation(alias?: string): CountAggregation {
  return {
    count: {},
    alias: alias ?? DEFAULT_COUNT_ALIAS,
  };
}

/**
 * Create a SUM aggregation.
 *
 * @param field - Field path to sum
 * @param alias - Optional alias for the aggregation result
 * @returns Sum aggregation object
 *
 * @example
 * ```typescript
 * // Sum the "price" field
 * const sumAgg = createSumAggregation("price");
 *
 * // Sum with custom alias
 * const sumAgg = createSumAggregation("items.quantity", "total_quantity");
 * ```
 */
export function createSumAggregation(
  field: string | FieldReference,
  alias?: string
): SumAggregation {
  const fieldRef = typeof field === "string" ? createFieldReference(field) : field;
  const defaultAlias =
    typeof field === "string"
      ? `${DEFAULT_SUM_ALIAS_PREFIX}${field}`
      : `${DEFAULT_SUM_ALIAS_PREFIX}field`;

  return {
    sum: {
      field: fieldRef,
    },
    alias: alias ?? defaultAlias,
  };
}

/**
 * Create an AVG (average) aggregation.
 *
 * @param field - Field path to average
 * @param alias - Optional alias for the aggregation result
 * @returns Average aggregation object
 *
 * @example
 * ```typescript
 * // Average the "rating" field
 * const avgAgg = createAverageAggregation("rating");
 *
 * // Average with custom alias
 * const avgAgg = createAverageAggregation("scores.math", "avg_math_score");
 * ```
 */
export function createAverageAggregation(
  field: string | FieldReference,
  alias?: string
): AverageAggregation {
  const fieldRef = typeof field === "string" ? createFieldReference(field) : field;
  const defaultAlias =
    typeof field === "string"
      ? `${DEFAULT_AVG_ALIAS_PREFIX}${field}`
      : `${DEFAULT_AVG_ALIAS_PREFIX}field`;

  return {
    avg: {
      field: fieldRef,
    },
    alias: alias ?? defaultAlias,
  };
}

/**
 * Build an aggregation query from a structured query and aggregations.
 *
 * @param query - The structured query to aggregate over
 * @param aggregations - Array of aggregation operations
 * @returns Aggregation query object
 *
 * @example
 * ```typescript
 * const query: Query = {
 *   from: [{ collectionId: "products", allDescendants: false }],
 *   where: fieldFilter("category", "EQUAL", { stringValue: "electronics" })
 * };
 *
 * const aggQuery = buildAggregationQuery(query, [
 *   createCountAggregation(),
 *   createSumAggregation("price", "total_price"),
 *   createAverageAggregation("rating")
 * ]);
 * ```
 */
export function buildAggregationQuery(
  query: Query,
  aggregations: Aggregation[]
): AggregationQuery {
  validateAggregations(aggregations);

  return {
    structuredQuery: query,
    aggregations,
  };
}

/**
 * Validate an array of aggregations.
 *
 * @param aggregations - Array of aggregations to validate
 * @throws {Error} If validation fails
 */
export function validateAggregations(aggregations: Aggregation[]): void {
  if (!aggregations || !Array.isArray(aggregations)) {
    throw new Error("Aggregations must be an array");
  }

  if (aggregations.length === 0) {
    throw new Error("Must provide at least one aggregation");
  }

  // Check for duplicate aliases
  const aliases = new Set<string>();
  for (const agg of aggregations) {
    if (agg.alias) {
      if (aliases.has(agg.alias)) {
        throw new Error(`Duplicate aggregation alias: ${agg.alias}`);
      }
      aliases.add(agg.alias);
    }
  }

  // Validate individual aggregations
  aggregations.forEach((agg) => validateAggregation(agg));
}

/**
 * Validate a single aggregation.
 *
 * @param aggregation - The aggregation to validate
 * @throws {Error} If validation fails
 */
export function validateAggregation(aggregation: Aggregation): void {
  if (!aggregation) {
    throw new Error("Aggregation cannot be null or undefined");
  }

  // Validate count aggregation
  if ("count" in aggregation) {
    if (aggregation.count === null || aggregation.count === undefined) {
      throw new Error("Count aggregation must have a count property");
    }
    return;
  }

  // Validate sum aggregation
  if ("sum" in aggregation) {
    if (!aggregation.sum || !aggregation.sum.field) {
      throw new Error("Sum aggregation must specify a field");
    }
    if (!aggregation.sum.field.fieldPath) {
      throw new Error("Sum aggregation field must have a fieldPath");
    }
    return;
  }

  // Validate avg aggregation
  if ("avg" in aggregation) {
    if (!aggregation.avg || !aggregation.avg.field) {
      throw new Error("Average aggregation must specify a field");
    }
    if (!aggregation.avg.field.fieldPath) {
      throw new Error("Average aggregation field must have a fieldPath");
    }
    return;
  }

  throw new Error("Invalid aggregation type");
}

/**
 * Create multiple aggregations for common statistics.
 * Returns count, sum, and average for a field.
 *
 * @param field - Field path to aggregate
 * @param prefix - Optional prefix for aliases
 * @returns Array of aggregations [count, sum, avg]
 *
 * @example
 * ```typescript
 * // Get count, sum, and average for price field
 * const aggs = createStatsAggregations("price");
 * // Returns: [COUNT as "count", SUM(price) as "sum_price", AVG(price) as "avg_price"]
 *
 * // With custom prefix
 * const aggs = createStatsAggregations("amount", "total");
 * // Returns: [COUNT as "count", SUM(amount) as "total_sum", AVG(amount) as "total_avg"]
 * ```
 */
export function createStatsAggregations(
  field: string | FieldReference,
  prefix?: string
): [CountAggregation, SumAggregation, AverageAggregation] {
  const fieldName = typeof field === "string" ? field : "field";
  const aliasPrefix = prefix ?? fieldName;

  return [
    createCountAggregation(DEFAULT_COUNT_ALIAS),
    createSumAggregation(field, `${aliasPrefix}_sum`),
    createAverageAggregation(field, `${aliasPrefix}_avg`),
  ];
}

/**
 * Extract aggregation result value as a JavaScript type.
 * Converts FieldValue results to usable JavaScript values.
 *
 * @param result - Aggregation result from query
 * @returns JavaScript value (number for count/sum/avg, null if no result)
 *
 * @example
 * ```typescript
 * const result = await runAggregationQuery(...);
 * for (const aggResult of result.results) {
 *   const value = extractAggregationValue(aggResult);
 *   console.log(`${aggResult.alias}: ${value}`);
 * }
 * ```
 */
export function extractAggregationValue(
  result: { alias?: string; value: any }
): number | null {
  if (!result.value) {
    return null;
  }

  const value = result.value;

  // Handle different FieldValue types
  if ("integerValue" in value) {
    return parseInt(value.integerValue, 10);
  }

  if ("doubleValue" in value) {
    return value.doubleValue;
  }

  if ("nullValue" in value) {
    return null;
  }

  // For count aggregations, the value might be directly a number
  if (typeof value === "number") {
    return value;
  }

  return null;
}

/**
 * Parse aggregation results into a more usable format.
 *
 * @param results - Array of aggregation results
 * @returns Map of alias to value
 *
 * @example
 * ```typescript
 * const aggregationResult = await runAggregationQuery(...);
 * const parsed = parseAggregationResults(aggregationResult.results);
 * // { count: 150, sum_price: 4500.50, avg_price: 30.00 }
 * ```
 */
export function parseAggregationResults(
  results: Array<{ alias?: string; value: any }>
): Record<string, number | null> {
  const parsed: Record<string, number | null> = {};

  for (const result of results) {
    const alias = result.alias ?? "result";
    parsed[alias] = extractAggregationValue(result);
  }

  return parsed;
}

/**
 * Check if an aggregation is a count aggregation.
 *
 * @param aggregation - Aggregation to check
 * @returns True if it's a count aggregation
 */
export function isCountAggregation(
  aggregation: Aggregation
): aggregation is CountAggregation {
  return "count" in aggregation;
}

/**
 * Check if an aggregation is a sum aggregation.
 *
 * @param aggregation - Aggregation to check
 * @returns True if it's a sum aggregation
 */
export function isSumAggregation(
  aggregation: Aggregation
): aggregation is SumAggregation {
  return "sum" in aggregation;
}

/**
 * Check if an aggregation is an average aggregation.
 *
 * @param aggregation - Aggregation to check
 * @returns True if it's an average aggregation
 */
export function isAverageAggregation(
  aggregation: Aggregation
): aggregation is AverageAggregation {
  return "avg" in aggregation;
}
