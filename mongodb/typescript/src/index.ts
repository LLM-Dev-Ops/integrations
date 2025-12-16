/**
 * MongoDB Integration Module for LLM Dev Ops Platform
 *
 * Provides complete MongoDB integration including:
 * - Client/connection handling
 * - Database/collection access
 * - CRUD operations
 * - Query/aggregation execution
 * - Read/write concern awareness
 * - Transaction and session management
 * - Error classification and retry handling
 * - Performance/metadata capture
 *
 * Following SPARC specification for production-grade implementation.
 *
 * @module @llmdevops/mongodb-integration
 * @version 1.0.0
 */

// ============================================================================
// Configuration
// ============================================================================

export {
  MongoDBConfig,
  MongoDBConfigBuilder,
  MongoDBConnectionOptions,
  RateLimitConfig,
  RetryConfig,
  CircuitBreakerConfig,
  ReadConcernLevel,
  WriteConcernOptions,
  SimulationMode,
  SecretString,
  DEFAULT_RATE_LIMIT_CONFIG,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_WRITE_CONCERN,
  DEFAULT_CONNECTION_OPTIONS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
} from './config/index.js';

// ============================================================================
// Types
// ============================================================================

export {
  // Core types
  ObjectId,
  Document,
  WithId,
  DocumentWithTimestamps,

  // Query operators
  ComparisonOperators,
  LogicalOperators,
  ElementOperators,
  ArrayOperators,
  EvaluationOperators,
  FieldQueryOperators,
  Filter,

  // Update operators
  UpdateOperators,
  ArrayUpdateOperators,
  UpdateFilter,

  // Sort and projection
  SortOrder,
  Sort,
  Projection,

  // Operation options
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

  // Result types
  InsertOneResult,
  InsertManyResult,
  UpdateResult,
  DeleteResult,
  BulkWriteResult,

  // Index types
  IndexDirection,
  IndexSpecification,
  CreateIndexOptions,
  IndexDescription,

  // Bulk operations
  BulkWriteOperation,
  InsertOneOperation,
  UpdateOneOperation,
  UpdateManyOperation,
  DeleteOneOperation,
  DeleteManyOperation,
  ReplaceOneOperation,

  // Aggregation pipeline
  MatchStage,
  ProjectStage,
  GroupStage,
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
  PipelineStage,
  AggregationCursor,

  // Change stream types
  OperationType,
  ResumeToken,
  ChangeStreamOptions,
  DocumentKey,
  UpdateDescription,
  ChangeEvent,
  ChangeStreamCursor,

  // Validation utilities
  OBJECT_ID_PATTERN,
  isValidObjectId,
  generateObjectId,
  getObjectIdTimestamp,
  validateDocument,
  validateFilter,
  validateUpdateFilter,
  validatePipeline,
  MAX_DOCUMENT_SIZE,
  estimateDocumentSize,
  isDocumentTooLarge,
} from './types/index.js';

// ============================================================================
// Errors
// ============================================================================

export {
  // Error codes
  MongoDBErrorCode,

  // Base error
  MongoDBError,

  // Configuration errors
  ConfigurationError,
  NoConnectionStringError,
  InvalidConnectionStringError,

  // Authentication errors
  AuthenticationError,
  AuthenticationExpiredError,

  // Connection errors
  ConnectionFailedError,
  ConnectionTimeoutError,
  ConnectionPoolExhaustedError,

  // Network/server errors
  NetworkError,
  TimeoutError,
  ServerSelectionFailedError,
  ServerError,
  ServiceUnavailableError,
  NotPrimaryError,
  NotReplicaSetMemberError,

  // Write errors
  WriteError,
  BulkWriteError,
  DuplicateKeyError,

  // Query errors
  InvalidQueryError,
  InvalidAggregationError,
  CursorNotFoundError,

  // Transaction errors
  TransactionError,
  TransactionAbortedError,
  WriteConflictError,

  // Rate limiting errors
  RateLimitedError,
  RateLimitTimeoutError,

  // Circuit breaker errors
  CircuitBreakerOpenError,

  // Error utilities
  parseMongoDBError,
  isMongoDBError,
  isRetryableError,
  getRetryDelayMs,
} from './errors/index.js';

// ============================================================================
// Client
// ============================================================================

export {
  MongoDBClient,
  MongoDBDatabase,
  MongoDBCollection,
  CollectionInfo,
  CreateCollectionOptions,
  DatabaseStats,
  createMongoDBClient,
  createMongoDBClientFromEnv,
} from './client/index.js';

// ============================================================================
// Resilience
// ============================================================================

export {
  RateLimiter,
  CircuitBreaker,
  CircuitBreakerState,
  RetryExecutor,
  RetryHooks,
  ResilienceOrchestrator,
  ResilientExecuteOptions,
  createRetryExecutor,
} from './resilience/index.js';

// ============================================================================
// Observability
// ============================================================================

export {
  // Logger
  LogLevel,
  Logger,
  ConsoleLogger,
  NoopLogger,
  InMemoryLogger,
  LogEntry,

  // Metrics
  MetricNames,
  MetricsCollector,
  NoopMetricsCollector,
  InMemoryMetricsCollector,
  MetricEntry,

  // Tracer
  SpanStatus,
  SpanContext,
  Tracer,
  NoopTracer,
  InMemoryTracer,
  InMemorySpanContext,

  // Container
  Observability,
  createNoopObservability,
  createInMemoryObservability,
  createConsoleObservability,
} from './observability/index.js';

// ============================================================================
// Services
// ============================================================================

export {
  // Collection service
  MongoDBCollection as MongoDBCollectionService,
  createCollectionService,

  // Transaction service
  SessionWrapper,
  TransactionManager,
  SessionOptions,
  TransactionOptions,
  runInTransaction,
} from './services/index.js';

// ============================================================================
// Convenience Factory
// ============================================================================

import { MongoDBClient, createMongoDBClient } from './client/index.js';
import { MongoDBConfig, MongoDBConfigBuilder } from './config/index.js';
import { Observability, createNoopObservability } from './observability/index.js';
import { TransactionManager, createTransactionManager } from './services/index.js';

/**
 * Complete MongoDB integration with all services.
 */
export interface MongoDBIntegration {
  /** Core MongoDB client */
  client: MongoDBClient;
  /** Transaction manager for session/transaction handling */
  transactions: TransactionManager;
}

/**
 * Creates a complete MongoDB integration.
 *
 * @param config - MongoDB configuration
 * @param options - Integration options
 * @returns MongoDB integration instance
 *
 * @example
 * ```typescript
 * const config = new MongoDBConfigBuilder()
 *   .withConnectionUri('mongodb://localhost:27017')
 *   .withDefaultDatabase('myapp')
 *   .build();
 *
 * const integration = await createMongoDBIntegration(config);
 * await integration.client.connect();
 *
 * const users = integration.client.getCollection('users');
 * const driverCollection = users.getDriverCollection();
 *
 * // Use collection service for type-safe operations
 * const userService = createCollectionService(driverCollection, integration.client);
 * const result = await userService.findOne({ email: 'user@example.com' });
 * ```
 */
export function createMongoDBIntegration(
  config: MongoDBConfig,
  options?: {
    observability?: Observability;
  }
): MongoDBIntegration {
  const observability = options?.observability ?? createNoopObservability();
  const client = createMongoDBClient(config, observability);

  return {
    client,
    transactions: createTransactionManager(client),
  };
}

/**
 * Creates a MongoDB integration from environment variables.
 *
 * Environment variables used:
 * - MONGODB_URI: Connection URI (required)
 * - MONGODB_DATABASE: Default database name
 * - MONGODB_MAX_POOL_SIZE: Maximum connection pool size
 * - MONGODB_MIN_POOL_SIZE: Minimum connection pool size
 * - MONGODB_CONNECT_TIMEOUT_MS: Connection timeout
 * - MONGODB_SERVER_SELECTION_TIMEOUT_MS: Server selection timeout
 *
 * @example
 * ```typescript
 * // Set environment variables
 * process.env.MONGODB_URI = 'mongodb://localhost:27017';
 * process.env.MONGODB_DATABASE = 'myapp';
 *
 * const integration = createMongoDBIntegrationFromEnv();
 * await integration.client.connect();
 * ```
 */
export function createMongoDBIntegrationFromEnv(options?: {
  observability?: Observability;
}): MongoDBIntegration {
  const config = MongoDBConfigBuilder.fromEnv().build();
  return createMongoDBIntegration(config, options);
}

/**
 * Quick start helper - creates and connects a MongoDB client.
 *
 * @param uri - MongoDB connection URI
 * @param database - Default database name
 * @param options - Additional options
 * @returns Connected MongoDB client
 *
 * @example
 * ```typescript
 * const client = await connectMongoDB('mongodb://localhost:27017', 'myapp');
 *
 * try {
 *   const users = client.getCollection('users');
 *   // ... use collection
 * } finally {
 *   await client.disconnect();
 * }
 * ```
 */
export async function connectMongoDB(
  uri: string,
  database: string,
  options?: {
    observability?: Observability;
  }
): Promise<MongoDBClient> {
  const config = new MongoDBConfigBuilder()
    .withConnectionUri(uri)
    .withDefaultDatabase(database)
    .build();

  const observability = options?.observability ?? createNoopObservability();
  const client = createMongoDBClient(config, observability);
  await client.connect();
  return client;
}
