/**
 * MongoDB services module.
 *
 * Re-exports all service implementations following SPARC specification.
 * Provides collection operations, transaction management, and factory functions.
 */

import type { Document } from '../types/index.js';
import type { TransactionManager } from './transaction.js';

// ============================================================================
// Collection Service
// ============================================================================

/**
 * MongoDB Collection service class.
 * Provides CRUD operations, aggregation, change streams, and index management.
 */
export class MongoDBCollection<T extends Document = Document> {
  // Placeholder - actual implementation should be in ./collection.ts
  constructor() {
    throw new Error('MongoDBCollection not yet implemented');
  }
}

// ============================================================================
// Transaction Service
// ============================================================================

// Re-export transaction service components from the actual implementation
export {
  SessionOptions,
  TransactionOptions,
  SessionWrapper,
  TransactionManager,
  MongoDBClient,
  runInTransaction,
} from './transaction.js';

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a collection service instance.
 *
 * @param client - MongoDB client instance
 * @param dbName - Database name
 * @param collName - Collection name
 * @returns Collection service instance
 */
export function createCollectionService<T extends Document = Document>(
  _client: unknown,
  _dbName: string,
  _collName: string
): MongoDBCollection<T> {
  throw new Error('createCollectionService not yet implemented');
}

/**
 * Create a transaction manager instance.
 *
 * @param client - MongoDB client instance
 * @returns Transaction manager instance
 */
export function createTransactionManager(_client: unknown): TransactionManager {
  throw new Error('createTransactionManager not yet implemented');
}

// ============================================================================
// Re-export Types for Convenience
// ============================================================================

// Base types
export type {
  Document,
  ObjectId,
  WithId,
  DocumentWithTimestamps,
} from '../types/index.js';

// Filter and query types
export type {
  Filter,
  UpdateFilter,
  Sort,
  SortOrder,
  Projection,
} from '../types/index.js';

// Options types
export type {
  FindOptions,
  FindOneOptions,
  InsertOneOptions,
  InsertManyOptions,
  UpdateOptions,
  DeleteOptions,
  ReplaceOptions,
  CountOptions,
  DistinctOptions,
  AggregateOptions,
  CollationOptions,
} from '../types/index.js';

// Result types
export type {
  InsertOneResult,
  InsertManyResult,
  UpdateResult,
  DeleteResult,
  BulkWriteResult,
} from '../types/index.js';

// Bulk operation types
export type {
  BulkWriteOperation,
  InsertOneOperation,
  UpdateOneOperation,
  UpdateManyOperation,
  DeleteOneOperation,
  DeleteManyOperation,
  ReplaceOneOperation,
} from '../types/index.js';

// Index types
export type {
  IndexSpecification,
  IndexDirection,
  CreateIndexOptions,
  IndexDescription,
} from '../types/index.js';

// Aggregation types
export type {
  PipelineStage,
  MatchStage,
  GroupStage,
  ProjectStage,
  SortStage,
  LimitStage,
  SkipStage,
  LookupStage,
  UnwindStage,
  AddFieldsStage,
  ReplaceRootStage,
  FacetStage,
  BucketStage,
  CountStage,
  OutStage,
  MergeStage,
  SampleStage,
  RedactStage,
  AggregationCursor,
} from '../types/index.js';

// Change stream types
export type {
  ChangeStreamOptions,
  ChangeEvent,
  ChangeStreamCursor,
  OperationType,
  ResumeToken,
  DocumentKey,
  UpdateDescription,
} from '../types/index.js';

// Validation utilities
export {
  isValidObjectId,
  generateObjectId,
  getObjectIdTimestamp,
  validateDocument,
  validateFilter,
  validateUpdateFilter,
  validatePipeline,
  estimateDocumentSize,
  isDocumentTooLarge,
  OBJECT_ID_PATTERN,
  MAX_DOCUMENT_SIZE,
} from '../types/index.js';
