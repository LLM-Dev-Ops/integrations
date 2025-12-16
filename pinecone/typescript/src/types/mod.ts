/**
 * Core type definitions for Pinecone vector database integration
 *
 * This module provides TypeScript type definitions for all Pinecone operations
 * including vector CRUD operations, queries, and index management.
 */

// Metadata types
export type { Metadata, MetadataValue } from './metadata.js';

// Filter types
export type {
  MetadataFilter,
  FilterCondition,
  FieldCondition,
} from './filter.js';
export {
  LogicalOperator,
  ComparisonOperator,
  isAndCondition,
  isOrCondition,
  isFieldCondition,
} from './filter.js';

// Filter builder
export { FilterBuilder, filter } from './filter-builder.js';

// Vector types
export type { Vector, ScoredVector, SparseValues } from './vector.js';

// Query types
export type {
  QueryRequest,
  QueryResponse,
  Usage,
} from './query.js';

// Upsert types
export type { UpsertRequest, UpsertResponse } from './upsert.js';

// Fetch types
export type { FetchRequest, FetchResponse } from './fetch.js';

// Update types
export type { UpdateRequest, UpdateResponse } from './update.js';

// Delete types
export type { DeleteRequest, DeleteResponse } from './delete.js';

// Index stats types
export type {
  IndexStats,
  NamespaceStats,
  NamespaceInfo,
  DescribeIndexStatsRequest,
  DescribeIndexStatsResponse,
} from './index.js';
