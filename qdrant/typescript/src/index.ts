/**
 * Qdrant Integration Module
 *
 * Production-ready interface for vector storage, similarity search,
 * and retrieval-augmented generation (RAG) workflows.
 *
 * @module @llm-devops/qdrant-integration
 *
 * @example Basic Client Usage
 * ```typescript
 * import { QdrantClient, QdrantConfigBuilder } from '@llm-devops/qdrant-integration';
 *
 * // Create client from environment
 * const client = QdrantClient.fromEnv();
 *
 * // Or with explicit configuration
 * const config = new QdrantConfigBuilder()
 *   .host('localhost')
 *   .port(6333)
 *   .build();
 * const client2 = new QdrantClient(config);
 *
 * // Check health
 * const health = await client.health();
 * console.log(`Qdrant version: ${health.version}`);
 * ```
 *
 * @example Collection Operations
 * ```typescript
 * import { QdrantClient, Distance } from '@llm-devops/qdrant-integration';
 *
 * const client = QdrantClient.fromEnv();
 * const collection = client.collection('my_vectors');
 *
 * // Create collection
 * await collection.create({
 *   vectorSize: 384,
 *   distance: Distance.Cosine,
 * });
 *
 * // Upsert points
 * await collection.upsert([
 *   { id: 1, vector: [...], payload: { text: 'Hello' } },
 *   { id: 2, vector: [...], payload: { text: 'World' } },
 * ]);
 *
 * // Search
 * const results = await collection.search(queryVector, { limit: 10 });
 * ```
 *
 * @example Filter Building
 * ```typescript
 * import { FilterBuilder } from '@llm-devops/qdrant-integration';
 *
 * const filter = new FilterBuilder()
 *   .fieldMatch('category', 'electronics')
 *   .fieldRange('price', { gte: 100, lte: 500 })
 *   .build();
 * ```
 *
 * @example RAG Workflows
 * ```typescript
 * import { RagHelper } from '@llm-devops/qdrant-integration';
 *
 * const ragHelper = new RagHelper(collectionClient);
 * const docs = await ragHelper.retrieveDocuments(queryVector, {
 *   chunkLimit: 100,
 *   documentLimit: 5,
 * });
 * ```
 */

// ============================================================================
// Core Client
// ============================================================================

export { QdrantClient, CollectionClient } from './client.js';

// ============================================================================
// Configuration
// ============================================================================

export {
  // Constants
  DEFAULT_HOST,
  DEFAULT_GRPC_PORT,
  DEFAULT_REST_PORT,
  DEFAULT_TIMEOUT,
  DEFAULT_MAX_RETRIES,
  DEFAULT_POOL_SIZE,
  DEFAULT_VERIFY_TLS,
  // Builder and functions
  QdrantConfigBuilder,
  createDefaultConfig,
  validateConfig,
  parseQdrantUrl,
  createConfigFromEnv,
  sanitizeConfigForLogging,
} from './config.js';

export type { QdrantConfig } from './config.js';

// ============================================================================
// Core Types
// ============================================================================

export {
  // Enums
  Distance,
  DistanceMetric,
  CollectionStatus,
  RecommendStrategy,
} from './types.js';

export type {
  // Point types
  PointId,
  DenseVector,
  SparseVectorIndex,
  SparseVector,
  MultiVector,
  Vector,
  NamedVectors,
  // Payload types
  PayloadValue,
  Payload,
  Point,
  ScoredPoint,
  // Collection types
  VectorParams,
  VectorConfig,
  VectorsConfig,
  OptimizerConfig,
  WalConfig,
  ScalarQuantization,
  ProductQuantization,
  QuantizationConfig,
  HnswConfig,
  CollectionConfig,
  CollectionInfo,
  // Filter types
  Condition,
  Filter,
  // Search types
  QuantizationSearchParams,
  SearchParams,
  SearchRequest,
  ScrollParams,
  ScrollResult,
  // Result types
  UpsertResult,
  UpdateResult,
  DeleteResult,
  CreateCollectionResult,
  DeleteCollectionResult,
  CountResult,
  BatchResult,
  // Cluster types
  HealthStatus,
  ClusterInfo,
  CollectionAlias,
  // Batch types
  BatchUpsertRequest,
  BatchDeleteRequest,
  // Recommendation types
  RecommendRequest,
  ContextPair,
  DiscoverRequest,
  // Group types
  PointGroup,
  GroupsResult,
  SearchGroupsRequest,
  // Snapshot types
  SnapshotInfo,
  SnapshotResult,
  // Payload operations
  SetPayloadOperation,
  DeletePayloadOperation,
  ClearPayloadOperation,
} from './types.js';

// ============================================================================
// Errors
// ============================================================================

export {
  // Base error
  QdrantError,
  // Configuration errors
  ConfigurationError,
  InvalidUrlError,
  InvalidApiKeyConfigError,
  MissingConfigurationError,
  // Connection errors
  ConnectionError,
  ConnectionFailedError,
  ConnectionTimeoutError,
  TlsError,
  DnsResolutionFailedError,
  // Authentication errors
  AuthenticationError,
  InvalidApiKeyError,
  ApiKeyExpiredError,
  PermissionDeniedError,
  // Validation errors
  ValidationError,
  // Collection errors
  CollectionError,
  CollectionNotFoundError,
  CollectionAlreadyExistsError,
  InvalidVectorConfigError,
  CollectionLockedError,
  // Point errors
  PointError,
  PointNotFoundError,
  InvalidPointIdError,
  InvalidVectorError,
  VectorDimensionMismatchError,
  PayloadTooLargeError,
  // Search errors
  SearchError,
  InvalidFilterError,
  InvalidSearchVectorError,
  SearchTimeoutError,
  // Service errors
  ServiceError,
  RateLimitedError,
  ServiceUnavailableError,
  InternalError,
  StorageFullError,
  // Other errors
  TimeoutError,
  CircuitBreakerError,
  // Utility functions
  createErrorFromResponse,
  isQdrantError,
  isRetryableError,
} from './errors.js';

// ============================================================================
// Filter Builder
// ============================================================================

export { FilterBuilder } from './filter/index.js';

export type {
  Condition as FilterCondition,
  FieldCondition,
  Filter as FilterType,
  FilterValidationError,
  GeoBoundingBox,
  GeoPoint,
  GeoRadius,
  HasIdCondition,
  MatchValue,
  MinShould,
  NestedCondition,
  PointId as FilterPointId,
  Range,
  ValidationResult,
} from './filter/index.js';

export { FilterValidationErrorCode, isValidGeoPoint, isValidPointId, isValidRange } from './filter/index.js';

// ============================================================================
// Connection & Resilience
// ============================================================================

export {
  RetryExecutor,
  CircuitBreaker,
  CircuitOpenError,
  getRetryConfigForError,
  isTransientError,
  createDefaultRetryExecutor,
  createRetryExecutorForError,
  createDefaultCircuitBreaker,
  createCircuitBreaker,
} from './connection/index.js';

export type {
  RetryConfig,
  CircuitBreakerConfig,
  CircuitState,
  CircuitBreakerStats,
  QdrantErrorLike,
} from './connection/index.js';

// ============================================================================
// Collection Operations
// ============================================================================

export { CollectionClient as CollectionOperations } from './collection/index.js';
export type { QdrantClientInterface } from './collection/index.js';

export {
  Distance as CollectionDistance,
  VectorDataType,
  CollectionStatus as CollectionStatusType,
  PayloadSchemaType,
} from './collection/index.js';

export type {
  HnswConfig as CollectionHnswConfig,
  ScalarQuantizationConfig,
  ProductQuantizationConfig,
  BinaryQuantizationConfig,
  QuantizationConfig as CollectionQuantizationConfig,
  VectorConfig as CollectionVectorConfig,
  WriteConsistencyFactor,
  CollectionConfigType,
  SparseVectorConfig,
  OptimizersConfig,
  WalConfig as CollectionWalConfig,
  UpdateParams,
  OptimizerStatus,
  PayloadSchemaInfo,
  CollectionInfo as CollectionInfoType,
  CollectionExistsInfo,
} from './collection/index.js';

export { CollectionConfig as CollectionConfigBuilder } from './collection/index.js';

// ============================================================================
// Point Operations
// ============================================================================

export { PointsClient, createPointsClient, BatchProcessor, createBatchProcessor, chunkArray, parallelMap } from './points/index.js';

export type {
  HttpClient as PointsHttpClient,
  PointsClientConfig,
  Point as PointType,
  PointId as PointsPointId,
  Vector as PointsVector,
  SparseVector as PointsSparseVector,
  Payload as PointsPayload,
  UpsertResult as PointsUpsertResult,
  BatchUpsertResult,
  BatchError,
  DeleteResult as PointsDeleteResult,
  Filter as PointsFilter,
  FilterCondition as PointsFilterCondition,
  ScrollOptions,
  ScrollResult as PointsScrollResult,
  BatchOptions,
} from './points/index.js';

export { isSparseVector, isNamedVector, isDenseVector } from './points/index.js';

// ============================================================================
// Search Operations
// ============================================================================

export { SearchClient, SearchRequestBuilder } from './search/index.js';

export type {
  HttpClient as SearchHttpClient,
  SearchClientOptions,
  PointId as SearchPointId,
  Vector as SearchVector,
  Payload as SearchPayload,
  PayloadSelectorType,
  PayloadSelector,
  VectorSelectorType,
  SearchParams as SearchParamsType,
  Filter as SearchFilter,
  Condition as SearchCondition,
  FieldCondition as SearchFieldCondition,
  HasIdCondition as SearchHasIdCondition,
  FilterCondition as SearchFilterCondition,
  MatchValue as SearchMatchValue,
  RangeValue,
  GeoBoundingBox as SearchGeoBoundingBox,
  GeoRadius as SearchGeoRadius,
  GeoPoint as SearchGeoPoint,
  ValuesCount,
  SearchRequest as SearchRequestType,
  SearchGroupsRequest as SearchGroupsRequestType,
  RecommendRequest as SearchRecommendRequest,
  DiscoverRequest as SearchDiscoverRequest,
  ScoredPoint as SearchScoredPoint,
  PointGroup as SearchPointGroup,
  ContextPair as SearchContextPair,
} from './search/index.js';

// ============================================================================
// RAG Helpers
// ============================================================================

export { RagHelper } from './rag/index.js';

export type {
  CollectionClient as RagCollectionClient,
  SearchParams as RagSearchParams,
  ScrollableClient,
  Payload as RagPayload,
  RetrieveOptions,
  RetrievedDocument,
  ContextConfig,
  ContextualChunk,
  ScoreAggregation,
  DocumentRetrievalOptions,
  AggregatedDocument,
} from './rag/index.js';

export {
  extractDocumentId,
  extractChunkIndex,
  extractContent,
  buildContextFilter,
  fetchContextChunks,
  enrichWithContext,
  groupByDocument,
  sortChunksInDocuments,
} from './rag/index.js';

// ============================================================================
// Testing Utilities
// ============================================================================

export {
  MockQdrantClient,
  MockCollectionClient,
  createMockQdrantClient,
  // Fixtures
  randomVector,
  normalizeVector,
  testPayload,
  createTestPoint,
  createTestPoints,
  createSimilarPoints,
  createTestCollection,
  createPopulatedCollection,
  createCategorizedPoints,
  createTimeSeriesPoints,
  createNestedPayloadPoints,
  createMultiVectorPoints,
  createQueryVector,
  createSearchVectorBatch,
  createUuidPoints,
  createClusteredPoints,
  createDocumentChunks,
  createVariedPayloadPoints,
  assertions,
  PerformanceTracker,
} from './testing/index.js';

export type {
  PointId as MockPointId,
  Vector as MockVector,
  Payload as MockPayload,
  Point as MockPoint,
  ScoredPoint as MockScoredPoint,
  CollectionConfig as MockCollectionConfig,
  CollectionInfo as MockCollectionInfo,
  SearchRequest as MockSearchRequest,
  Filter as MockFilter,
  Condition as MockCondition,
  ScrollOptions as MockScrollOptions,
  ScrollResult as MockScrollResult,
  UpsertResult as MockUpsertResult,
  DeleteResult as MockDeleteResult,
  HealthStatus as MockHealthStatus,
  Operation as MockOperation,
  DocumentChunk,
} from './testing/index.js';
