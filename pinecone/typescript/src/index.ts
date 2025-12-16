/**
 * @integrations/pinecone
 *
 * Production-ready TypeScript client for the Pinecone Vector Database API.
 *
 * @example
 * ```typescript
 * import { createClient, createClientFromEnv, FilterBuilder } from '@integrations/pinecone';
 *
 * // Create client with explicit configuration
 * const client = createClient({
 *   apiKey: 'your-api-key',
 *   environment: 'us-east-1-aws',
 *   indexName: 'my-index',
 *   projectId: 'your-project-id',
 * });
 *
 * // Or create from environment variables
 * const envClient = createClientFromEnv();
 *
 * // Upsert vectors
 * await client.index.upsert({
 *   vectors: [
 *     { id: 'vec1', values: [0.1, 0.2, 0.3], metadata: { category: 'docs' } },
 *   ],
 *   namespace: 'default',
 * });
 *
 * // Query with filter
 * const filter = FilterBuilder.new()
 *   .eq('category', 'docs')
 *   .gte('score', 0.5)
 *   .build();
 *
 * const results = await client.index.query({
 *   vector: [0.1, 0.2, 0.3],
 *   topK: 10,
 *   filter,
 *   includeMetadata: true,
 * });
 * ```
 */

// Client exports
export {
  createClient,
  createClientFromEnv,
  PineconeClientImpl,
  type PineconeClient,
  type IndexOperations,
} from './client/index.js';

// Configuration exports
export {
  validateConfig,
  resolveBaseUrl,
  PineconeConfigBuilder,
  PineconeConfig,
  type ValidatedPineconeConfig,
  type PoolConfig,
  type RetryConfig,
  DEFAULT_TIMEOUT,
  DEFAULT_MAX_RETRIES,
  DEFAULT_INITIAL_BACKOFF,
  DEFAULT_MAX_BACKOFF,
  DEFAULT_BACKOFF_MULTIPLIER,
  DEFAULT_MAX_CONNECTIONS,
  DEFAULT_MIN_CONNECTIONS,
  DEFAULT_IDLE_TIMEOUT,
  DEFAULT_MAX_LIFETIME,
  DEFAULT_ACQUIRE_TIMEOUT,
  DEFAULT_POOL_CONFIG,
  DEFAULT_RETRY_CONFIG,
} from './config.js';

// Error exports
export { PineconeError } from './errors/error.js';
export {
  ConfigurationError,
  AuthenticationError,
  ValidationError,
  RateLimitError,
  NetworkError,
  ServerError,
  NotFoundError,
  TimeoutError,
  ConnectionError,
} from './errors/categories.js';

// Type exports - Core vector types
export type {
  Vector,
  ScoredVector,
  SparseValues,
} from './types/vector.js';

export type {
  Metadata,
  MetadataValue,
} from './types/metadata.js';

// Type exports - Filter types
export type {
  MetadataFilter,
  FilterCondition,
  FieldCondition,
} from './types/filter.js';

export {
  LogicalOperator,
  ComparisonOperator,
  isAndCondition,
  isOrCondition,
  isFieldCondition,
} from './types/filter.js';

// Filter builder
export {
  FilterBuilder,
  filter,
} from './types/filter-builder.js';

// Type exports - Request/Response types
export type {
  QueryRequest,
  QueryResponse,
  Usage,
} from './types/query.js';

export type {
  UpsertRequest,
  UpsertResponse,
} from './types/upsert.js';

export type {
  FetchRequest,
  FetchResponse,
} from './types/fetch.js';

export type {
  UpdateRequest,
  UpdateResponse,
} from './types/update.js';

export type {
  DeleteRequest,
  DeleteResponse,
} from './types/delete.js';

// Type exports - Index stats
export type {
  IndexStats,
  NamespaceStats,
  NamespaceInfo,
  DescribeIndexStatsRequest,
  DescribeIndexStatsResponse,
} from './types/index.js';

// Transport exports
export type {
  HttpTransportConfig,
  RequestOptions,
  HttpResponse,
} from './transport/http.js';

export {
  HttpTransport,
  createHttpTransport,
} from './transport/http.js';

export type {
  RetryConfig as TransportRetryConfig,
} from './transport/retry.js';

export {
  RetryExecutor,
  isRetryableError,
  createDefaultRetryConfig,
} from './transport/retry.js';

// Operations exports
export {
  upsert,
  chunkVectors,
  query,
  fetch,
  update,
  deleteVectors,
  describeIndexStats,
  type UpsertOperationConfig,
  type QueryOperationConfig,
  type FetchOperationConfig,
  type UpdateOperationConfig,
  type DeleteOperationConfig,
  type StatsOperationConfig,
} from './operations/index.js';

// Batch exports
export {
  chunkByCount,
  estimateChunks,
  type ChunkOptions,
} from './batch/chunker.js';

export {
  createProgress,
  updateProgress,
  getPercentage,
  type BatchProgress,
} from './batch/progress.js';

export {
  ParallelExecutor,
  type BatchOptions,
  type BatchResult,
} from './batch/executor.js';

export {
  batchUpsert,
  batchFetch,
  batchDelete,
  type BatchUpsertRequest,
  type BatchUpsertResponse,
  type BatchFetchRequest,
  type BatchDeleteRequest,
} from './batch/operations.js';

// Validation exports
export {
  VectorValidator,
  MAX_ID_LENGTH,
  MAX_DIMENSIONS,
  MAX_METADATA_SIZE,
} from './validation/vector.js';

export {
  QueryValidator,
  MAX_TOP_K,
  MAX_FILTER_DEPTH,
  ComparisonOp,
  FilterOperator,
} from './validation/query.js';

export {
  NamespaceValidator,
  MAX_NAMESPACE_LENGTH,
  NAMESPACE_PATTERN,
} from './validation/namespace.js';

// Namespace routing exports
export {
  NamespaceRouter,
  type OperationContext,
  type NamespaceRoutingConfig,
} from './namespace/router.js';

export {
  NamespaceAccessControl,
  type Operation,
  type AccessControlConfig,
} from './namespace/access.js';

// RAG exports
export {
  RAGRetriever,
  type RetrievalQuery,
  type RetrievalResult,
  type RAGRetrieverConfig,
} from './rag/retriever.js';

// Simulation exports
export {
  SimulationLayer,
  type SimulationLayerConfig,
} from './simulation/layer.js';

export type {
  SimulationMode,
  SimulationRecord,
  SimulationStorage,
} from './simulation/types.js';

export {
  FileStorage,
  InMemoryStorage,
} from './simulation/storage.js';

export {
  generateFingerprint,
  normalizeRequest,
} from './simulation/fingerprint.js';

// Metrics exports
export type {
  MetricsCollector,
  Timer,
  MetricsSnapshot,
  HistogramData,
} from './metrics/index.js';

export {
  InMemoryMetricsCollector,
  NoopMetricsCollector,
  MetricNames,
  createMetricsCollector,
} from './metrics/index.js';

// Version
export const VERSION = '0.1.0';
