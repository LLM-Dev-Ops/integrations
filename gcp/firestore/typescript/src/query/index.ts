/**
 * Query module for Google Cloud Firestore.
 *
 * Exports all query-related functionality including:
 * - QueryBuilder: Fluent API for constructing queries
 * - Filter helpers: Functions for creating and validating filters
 * - Cursor utilities: Pagination cursor handling
 * - Aggregation builders: COUNT, SUM, AVG operations
 */

// Export QueryBuilder
export { QueryBuilder, createQueryBuilder } from "./builder.js";

// Export filter helpers
export {
  createFieldReference,
  fieldFilter,
  unaryFilter,
  compositeFilter,
  validateFilter,
  validateInClause,
  validateOrClauses,
  toFieldValue,
  fromFieldValue,
  andFilters,
  orFilters,
} from "./filter.js";

// Export cursor utilities
export {
  createCursor,
  encodeCursor,
  decodeCursor,
  extractCursorFromDocument,
  extractCursorValuesFromDocument,
  createCursorFromValues,
  cursorToValues,
  validateCursor,
  createPageToken,
  cursorsEqual,
} from "./cursor.js";

// Export aggregation builders
export {
  createCountAggregation,
  createSumAggregation,
  createAverageAggregation,
  buildAggregationQuery,
  validateAggregations,
  validateAggregation,
  createStatsAggregations,
  extractAggregationValue,
  parseAggregationResults,
  isCountAggregation,
  isSumAggregation,
  isAverageAggregation,
} from "./aggregation.js";

// Re-export relevant types from types module
export type {
  Query,
  Filter,
  FieldFilter,
  UnaryFilter,
  CompositeFilter,
  OrderBy,
  Cursor,
  Projection,
  CollectionSelector,
  FieldValue,
  FieldReference,
  FilterOp,
  CompositeOp,
  UnaryOp,
  Direction,
  Aggregation,
  CountAggregation,
  SumAggregation,
  AverageAggregation,
  AggregationQuery,
  AggregationResult,
  QueryResult,
  DocumentSnapshot,
} from "../types/index.js";
