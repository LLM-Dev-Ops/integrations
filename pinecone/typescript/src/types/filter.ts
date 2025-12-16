/**
 * Pinecone Metadata Filter Types
 *
 * Type definitions for Pinecone metadata filtering with support for
 * complex nested conditions and various comparison operators.
 *
 * @see https://docs.pinecone.io/docs/metadata-filtering
 */

import type { MetadataValue } from "./metadata.js";

/**
 * Logical operators for combining multiple filter conditions.
 *
 * - `And`: All conditions must be true
 * - `Or`: At least one condition must be true
 */
export enum LogicalOperator {
  And = "$and",
  Or = "$or",
}

/**
 * Comparison operators for field-level filtering.
 *
 * Supported operators:
 * - `Eq`: Equal to (=)
 * - `Ne`: Not equal to (!=)
 * - `Gt`: Greater than (>)
 * - `Gte`: Greater than or equal to (>=)
 * - `Lt`: Less than (<)
 * - `Lte`: Less than or equal to (<=)
 * - `In`: Value is in the provided array
 * - `Nin`: Value is not in the provided array
 */
export enum ComparisonOperator {
  Eq = "$eq",
  Ne = "$ne",
  Gt = "$gt",
  Gte = "$gte",
  Lt = "$lt",
  Lte = "$lte",
  In = "$in",
  Nin = "$nin",
}

/**
 * Field-level filter condition.
 *
 * Specifies one or more comparison operations on a single field.
 * Multiple operators can be combined (e.g., gt AND lt for range queries).
 *
 * @example
 * ```typescript
 * // Single condition: age equals 25
 * const condition: FieldCondition = { $eq: 25 };
 *
 * // Range condition: age between 18 and 65
 * const rangeCondition: FieldCondition = { $gte: 18, $lte: 65 };
 *
 * // In condition: status is one of the allowed values
 * const inCondition: FieldCondition = { $in: ["active", "pending"] };
 * ```
 */
export interface FieldCondition {
  /** Equal to */
  $eq?: MetadataValue;
  /** Not equal to */
  $ne?: MetadataValue;
  /** Greater than (numbers only) */
  $gt?: number;
  /** Greater than or equal to (numbers only) */
  $gte?: number;
  /** Less than (numbers only) */
  $lt?: number;
  /** Less than or equal to (numbers only) */
  $lte?: number;
  /** In array */
  $in?: MetadataValue[];
  /** Not in array */
  $nin?: MetadataValue[];
}

/**
 * Filter condition union type.
 *
 * A filter condition can be:
 * - An AND composite filter combining multiple sub-conditions
 * - An OR composite filter combining multiple sub-conditions
 * - A field-level filter with comparison operators
 *
 * @example
 * ```typescript
 * // Field condition
 * const fieldFilter: FilterCondition = { "age": { $gte: 18 } };
 *
 * // AND condition
 * const andFilter: FilterCondition = {
 *   $and: [
 *     { "status": { $eq: "active" } },
 *     { "score": { $gt: 50 } }
 *   ]
 * };
 *
 * // OR condition
 * const orFilter: FilterCondition = {
 *   $or: [
 *     { "category": { $eq: "premium" } },
 *     { "vip": { $eq: true } }
 *   ]
 * };
 * ```
 */
export type FilterCondition =
  | { $and: FilterCondition[] }
  | { $or: FilterCondition[] }
  | { [field: string]: FieldCondition };

/**
 * Metadata filter wrapper.
 *
 * Top-level filter object that wraps a filter condition.
 * This is the type used in query and delete operations.
 *
 * @example
 * ```typescript
 * // Simple equality filter
 * const filter: MetadataFilter = {
 *   "status": { $eq: "active" }
 * };
 *
 * // Complex nested filter
 * const complexFilter: MetadataFilter = {
 *   $and: [
 *     { "age": { $gte: 18, $lte: 65 } },
 *     {
 *       $or: [
 *         { "country": { $eq: "US" } },
 *         { "country": { $eq: "CA" } }
 *       ]
 *     }
 *   ]
 * };
 * ```
 */
export type MetadataFilter = FilterCondition;

/**
 * Type guard to check if a filter condition is an AND condition.
 *
 * @param condition - The filter condition to check
 * @returns True if the condition is an AND condition
 *
 * @example
 * ```typescript
 * const condition: FilterCondition = { $and: [...] };
 * if (isAndCondition(condition)) {
 *   // TypeScript knows condition has $and property
 *   console.log(condition.$and.length);
 * }
 * ```
 */
export function isAndCondition(condition: FilterCondition): condition is { $and: FilterCondition[] } {
  return "$and" in condition;
}

/**
 * Type guard to check if a filter condition is an OR condition.
 *
 * @param condition - The filter condition to check
 * @returns True if the condition is an OR condition
 *
 * @example
 * ```typescript
 * const condition: FilterCondition = { $or: [...] };
 * if (isOrCondition(condition)) {
 *   // TypeScript knows condition has $or property
 *   console.log(condition.$or.length);
 * }
 * ```
 */
export function isOrCondition(condition: FilterCondition): condition is { $or: FilterCondition[] } {
  return "$or" in condition;
}

/**
 * Type guard to check if a filter condition is a field condition.
 *
 * @param condition - The filter condition to check
 * @returns True if the condition is a field condition
 *
 * @example
 * ```typescript
 * const condition: FilterCondition = { "age": { $gte: 18 } };
 * if (isFieldCondition(condition)) {
 *   // TypeScript knows condition is a field-level filter
 *   const fields = Object.keys(condition);
 * }
 * ```
 */
export function isFieldCondition(
  condition: FilterCondition
): condition is { [field: string]: FieldCondition } {
  return !isAndCondition(condition) && !isOrCondition(condition);
}
