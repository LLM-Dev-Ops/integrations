/**
 * Milvus Vector Database Integration
 *
 * A thin adapter layer enabling the LLM DevOps platform to interact with Milvus
 * as a high-performance vector database for embeddings storage, similarity search,
 * and large-scale RAG workflows.
 *
 * @example
 * ```typescript
 * import { MilvusClient, createConfigBuilder, ConsistencyLevel } from '@llm-devops/milvus';
 *
 * // Create client
 * const client = new MilvusClient(
 *   createConfigBuilder()
 *     .host('localhost')
 *     .port(19530)
 *     .authToken('your-token')
 *     .build()
 * );
 *
 * // Connect and search
 * await client.connect();
 * const results = await client.search({
 *   collectionName: 'documents',
 *   vectorField: 'embedding',
 *   vectors: [queryEmbedding],
 *   metricType: MetricType.Cosine,
 *   topK: 10,
 *   params: createHnswSearchParams(64),
 *   outputFields: ['content', 'title'],
 * });
 * ```
 */

// ==================== Configuration ====================
export {
  // Config types
  MilvusConfig,
  AuthConfig,
  TlsConfig,
  PoolConfig,
  RetryConfig,
  DEFAULT_POOL_CONFIG,
  DEFAULT_RETRY_CONFIG,
  createDefaultConfig,
  // Config builder
  MilvusConfigBuilder,
  createConfigBuilder,
  createConfigFromEnv,
} from './config/index.js';

// ==================== Types ====================
export {
  // Consistency
  ConsistencyLevel,
  consistencyLevelToProto,
  getGuaranteeTimestamp,
  // Metrics and indexes
  MetricType,
  IndexType,
  SearchParams,
  createIvfSearchParams,
  createHnswSearchParams,
  createDiskAnnSearchParams,
  createAutoIndexSearchParams,
  createFlatSearchParams,
  // Fields and schema
  FieldType,
  LoadState,
  FieldSchema,
  CollectionSchema,
  CollectionInfo,
  CollectionStats,
  PartitionInfo,
  PartitionStats,
  // Entities
  Entity,
  FieldValue,
  SparseVector,
  FieldData,
  createInt64Field,
  createStringField,
  createFloatField,
  createFloatVectorField,
  createJsonField,
  createSparseVectorField,
  getRowCount,
  // Search
  SearchRequest,
  SearchResponse,
  SearchHits,
  SearchHit,
  iterateSearchHits,
  HybridSearchRequest,
  RerankStrategy,
  createRRFStrategy,
  createWeightedSumStrategy,
  createMaxScoreStrategy,
  RangeSearchRequest,
  // Query
  QueryRequest,
  QueryResponse,
  GetRequest,
  GetResponse,
  // Insert/mutation
  InsertRequest,
  InsertResponse,
  UpsertRequest,
  UpsertResponse,
  DeleteRequest,
  DeleteResponse,
  BatchInsertOptions,
  BatchProgress,
  BatchInsertResponse,
} from './types/index.js';

// ==================== Errors ====================
export {
  // Base
  MilvusError,
  ErrorCategory,
  // Categories
  MilvusConfigurationError,
  MilvusAuthenticationError,
  MilvusAuthorizationError,
  MilvusValidationError,
  MilvusConnectionError,
  MilvusTimeoutError,
  MilvusRateLimitError,
  MilvusNotFoundError,
  MilvusCollectionNotFoundError,
  MilvusPartitionNotFoundError,
  MilvusCollectionNotLoadedError,
  MilvusLoadFailedError,
  MilvusLoadTimeoutError,
  MilvusServerError,
  MilvusPoolError,
  MilvusSimulationError,
  // Mapping
  GrpcStatusCode,
  MilvusErrorCode,
  isRetryableGrpcCode,
  createErrorFromGrpcStatus,
  createErrorFromMilvusCode,
  isRetryableError,
  shouldAutoLoad,
  getRetryDelay,
} from './errors/index.js';

// ==================== Client ====================
export {
  // Interfaces
  VectorOperations,
  SearchOperations,
  CollectionOperations,
  PartitionOperations,
  ConsistencyOperations,
  MilvusClientInterface,
  // Client
  MilvusClient,
} from './client/index.js';

// ==================== Search Utilities ====================
export {
  // Expression builder
  ExpressionBuilder,
  ExprValue,
  createExpressionBuilder,
  eq,
  inFilter,
  range,
  // Reranking
  rerankResults,
  rrfFusion,
  weightedFusion,
  maxScoreFusion,
  normalizeScores,
  filterByScore,
  truncateResults,
} from './search/index.js';

// ==================== Validation ====================
export {
  MAX_DIMENSIONS,
  MAX_VARCHAR_LENGTH,
  MAX_BATCH_SIZE,
  validateInsertRequest,
  MAX_TOP_K,
  MAX_NQ,
  validateSearchRequest,
  validateHybridSearchRequest,
  validateVectors,
  validateSearchParams,
  validateFilterExpression,
} from './validation/index.js';

// ==================== Transport ====================
export {
  // Retry utilities
  executeWithRetry,
  calculateBackoff,
  sleep,
  createTimeout,
  withTimeout,
  RetryOptions,
  // Mock transport for testing
  MockTransport,
  MockCollection,
  MockEntity,
  MockCollectionOptions,
  createMockTransport,
} from './transport/index.js';

// ==================== Metrics ====================
export {
  MetricValue,
  MetricsCollector,
  NoopMetricsCollector,
  InMemoryMetricsCollector,
  createMetricsCollector,
} from './metrics/index.js';

// ==================== Simulation ====================
export {
  SimulationMode,
  SimulationRecord,
  SimulationStorage,
  InMemorySimulationStorage,
  SimulationLayer,
  createSimulationLayer,
  getSimulationModeFromEnv,
} from './simulation/index.js';

// ==================== RAG ====================
export {
  RetrievalQuery,
  RetrievalResult,
  RAGRetriever,
  createRAGRetriever,
} from './rag/index.js';
