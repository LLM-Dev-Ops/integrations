/**
 * Filter module
 *
 * Provides a fluent API for building, validating, and optimizing
 * Weaviate where filters.
 *
 * @example
 * ```typescript
 * import { Filter } from './filter';
 *
 * // Simple filter
 * const filter = Filter.property("year").greaterThan(2020);
 *
 * // Combined filters
 * const combined = Filter.and(
 *   Filter.property("year").greaterThan(2020),
 *   Filter.property("category").equal("science")
 * );
 *
 * // Using builder pattern
 * const builder = Filter.property("year").greaterThan(2020);
 * const withAnd = Filter.and(
 *   builder,
 *   Filter.property("tags").containsAny(["ai", "ml"])
 * );
 * ```
 */

// Export types
export type {
  WhereFilter,
  FilterOperand,
  FilterValue,
  GeoRange,
  AndFilter,
  OrFilter,
  OperandFilter,
} from './types.js';

export {
  FilterOperator,
  isOperandFilter,
  isAndFilter,
  isOrFilter,
  isGeoRange,
} from './types.js';

// Export filter builder
export {
  Filter,
  FilterBuilder,
  WhereFilterExtensions,
  and,
  or,
} from './builder.js';

// Export operator utilities
export {
  operatorToGraphQL,
  isOperatorCompatible,
  getOperatorValueKey,
  getCompatibleOperators,
  isArrayOperator,
  isBooleanOperator,
  isComparisonOperator,
  isEqualityOperator,
  isGeoOperator,
  isTextOperator,
} from './operators.js';

// Export serialization functions
export {
  serializeFilter,
  serializeFilterJSON,
  serializeOperand,
  serializeOperandJSON,
  serializeValue,
  serializeValueJSON,
  escapeGraphQLString,
  buildWhereClause,
} from './serialization.js';

// Export validation functions
export type { ValidationError, FilterValidationResult, SchemaResolver } from './validation.js';

export {
  MAX_FILTER_DEPTH,
  validateFilter,
  validateOperand,
  validatePropertyPath,
  isPropertyFilterable,
  getValidationSummary,
  calculateFilterDepth as calculateFilterValidationDepth,
} from './validation.js';

// Export optimization functions
export {
  optimizeFilter,
  estimateSelectivity,
  flattenNestedFilters,
  reorderBySelectivity,
  removeRedundantFilters,
  countFilterConditions,
  calculateFilterDepth,
} from './optimize.js';
