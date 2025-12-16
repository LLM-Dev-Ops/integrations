/**
 * MongoDB services module.
 *
 * Re-exports all service implementations following SPARC specification.
 * Provides collection operations, transaction management, and factory functions.
 */

import type { Document } from '../types/index.js';
import {
  MongoDBCollection,
  createMongoDBCollection,
} from './collection.js';
import {
  TransactionManager,
  MongoDBClient as TransactionClient,
} from './transaction.js';

// ============================================================================
// Collection Service
// ============================================================================

// Re-export the complete MongoDBCollection implementation from collection.ts
export {
  MongoDBCollection,
  createMongoDBCollection,
  IndexInfo,
  ChangeStreamWrapper,
  BulkOperationBuilder,
  BulkOperationFinder,
} from './collection.js';

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

// Type for the client interface used by collection service
interface CollectionServiceClient {
  readonly logger: {
    trace(message: string, context?: Record<string, unknown>): void;
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
  };
  readonly metrics: {
    increment(name: string, value?: number, tags?: Record<string, string>): void;
    gauge(name: string, value: number, tags?: Record<string, string>): void;
    timing(name: string, durationMs: number, tags?: Record<string, string>): void;
  };
  readonly tracer: {
    withSpan<T>(
      name: string,
      fn: (span: any) => T | Promise<T>,
      attributes?: Record<string, unknown>
    ): Promise<T>;
  };
  execute<T>(operation: () => Promise<T>): Promise<T>;
}

/**
 * Create a collection service instance.
 *
 * This factory creates a MongoDBCollection service wrapper that provides
 * comprehensive CRUD operations, aggregation, indexing, change streams,
 * and bulk operations with full observability and resilience support.
 *
 * @param collection - MongoDB driver Collection instance
 * @param client - Client providing observability and resilience
 * @param dbName - Database name
 * @param collName - Collection name
 * @returns Collection service instance
 *
 * @example
 * ```typescript
 * const client = await connectMongoDB('mongodb://localhost:27017', 'mydb');
 * const collection = client.getCollection('users').getDriverCollection();
 *
 * const userService = createCollectionService(collection, client, 'mydb', 'users');
 * const user = await userService.findOne({ email: 'test@example.com' });
 * ```
 */
export function createCollectionService<T extends Document = Document>(
  collection: unknown,
  client: CollectionServiceClient,
  dbName: string,
  collName: string
): MongoDBCollection<T> {
  return createMongoDBCollection<T>(collection, client, dbName, collName);
}

/**
 * Create a transaction manager instance.
 *
 * This factory creates a TransactionManager that provides session and
 * transaction management with automatic retry logic for transient errors
 * and unknown commit results.
 *
 * @param client - MongoDB client with session creation capabilities
 * @returns Transaction manager instance
 *
 * @example
 * ```typescript
 * const client = await connectMongoDB('mongodb://localhost:27017', 'mydb');
 * const txnManager = createTransactionManager(client);
 *
 * await txnManager.withTransaction(async (session) => {
 *   // Perform transactional operations
 *   await collection.insertOne(doc, { session: session.driverSession });
 * });
 * ```
 */
export function createTransactionManager(client: TransactionClient): TransactionManager {
  return new TransactionManager(client);
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
