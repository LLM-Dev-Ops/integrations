/**
 * Validation module for Pinecone integration.
 *
 * Re-exports all validators and validation utilities for vectors, queries,
 * and namespaces.
 *
 * @module validation
 */

// Vector validation
export {
  VectorValidator,
  ValidationError,
  MAX_ID_LENGTH,
  MAX_DIMENSIONS,
  MAX_METADATA_SIZE,
  type Vector,
  type SparseValues,
  type Metadata,
  type MetadataValue,
} from './vector.js';

// Query validation
export {
  QueryValidator,
  MAX_TOP_K,
  MAX_FILTER_DEPTH,
  ComparisonOp,
  FilterOperator,
  type QueryRequest,
  type MetadataFilter,
  type MetadataFilterValue,
  type FilterCondition,
} from './query.js';

// Namespace validation
export {
  NamespaceValidator,
  MAX_NAMESPACE_LENGTH,
  NAMESPACE_PATTERN,
} from './namespace.js';
