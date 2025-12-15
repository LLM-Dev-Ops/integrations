/**
 * Azure Cognitive Search Integration Module
 *
 * A thin adapter layer for Azure Cognitive Search services following the SPARC specification.
 * Provides hybrid search (keyword + vector), vector search, document indexing,
 * and VectorStore abstraction for RAG pipelines.
 *
 * @example
 * ```typescript
 * import { createClient, createClientFromEnv } from '@integrations/azure-cognitive-search';
 *
 * // Create client from environment variables
 * const client = createClientFromEnv();
 *
 * // Or create with explicit configuration
 * const client = createClient({
 *   serviceName: 'my-search-service',
 *   apiKey: 'my-api-key',
 * });
 *
 * // Hybrid search (keyword + vector)
 * const results = await client
 *   .inIndex('products')
 *   .hybrid('wireless headphones', embeddingVector)
 *   .vectorField('descriptionVector')
 *   .filter("category eq 'Electronics'")
 *   .top(10)
 *   .execute();
 *
 * // Vector search
 * const similar = await client
 *   .inIndex('documents')
 *   .vector(queryVector)
 *   .field('contentVector')
 *   .k(5)
 *   .execute();
 *
 * // VectorStore for RAG
 * const vectorStore = client.asVectorStore({
 *   indexName: 'documents',
 *   vectorField: 'contentVector',
 *   keyField: 'id',
 *   contentField: 'content',
 *   dimensions: 1536,
 * });
 *
 * await vectorStore.upsert([{ id: '1', content: 'Hello', vector: [...] }]);
 * const results = await vectorStore.search({ vector: queryVector, topK: 5 });
 * ```
 *
 * @module @integrations/azure-cognitive-search
 */

// Client exports
export type { AcsClient } from './client/index.js';
export {
  AcsClientImpl,
  AcsClientBuilder,
  createClient,
  createClientFromEnv,
  builder,
} from './client/index.js';
export type {
  AcsConfig,
  NormalizedAcsConfig,
  RetryConfig,
  CircuitBreakerConfig,
  SimulationMode,
} from './client/index.js';
export {
  normalizeConfig,
  configFromEnv,
  DEFAULT_API_VERSION,
  DEFAULT_TIMEOUT,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from './client/index.js';

// Type exports
export type {
  ApiVersion,
  AuthMethod,
  QueryType,
  SearchMode,
  CaptionType,
  AnswerType,
  IndexAction,
  DocumentValue,
  Document,
  TokenUsage,
  RequestOptions,
  PaginationOptions,
  SortOptions,
  ScoringOptions,
} from './types/index.js';

// Request type exports
export type {
  BaseSearchRequest,
  VectorSearchRequest,
  KeywordSearchRequest,
  HybridSearchRequest,
  SemanticSearchRequest,
  SuggestRequest,
  AutocompleteRequest,
  UploadDocumentRequest,
  MergeDocumentRequest,
  DeleteDocumentRequest,
  BatchIndexRequest,
  LookupRequest,
  GetIndexRequest,
  GetIndexStatsRequest,
  CountDocumentsRequest,
} from './types/index.js';

// Response type exports
export type {
  SearchResult,
  Caption,
  Answer,
  FacetValue,
  SearchResults,
  SuggestionResult,
  SuggestResults,
  AutocompleteResult,
  AutocompleteResults,
  IndexResult,
  BatchIndexResult,
  IndexField,
  IndexDefinition,
  ScoringProfileDefinition,
  ScoringFunction,
  SemanticSettings,
  SemanticConfiguration,
  PrioritizedFields,
  SemanticField,
  IndexStats,
} from './types/index.js';

// Auth exports
export type { AuthProvider, AuthHeader, AzureAdCredentials } from './auth/index.js';
export { ApiKeyAuthProvider, AzureAdAuthProvider, createAuthProvider } from './auth/index.js';

// Service exports
export { SearchService, createSearchService } from './services/index.js';
export { DocumentService, createDocumentService, hasFailures, getFailedKeys, throwIfPartialFailure } from './services/index.js';
export { IndexService, createIndexService } from './services/index.js';

// Query builder exports
export {
  VectorQueryBuilder,
  KeywordQueryBuilder,
  HybridQueryBuilder,
  IndexBoundSearchBuilder,
  inIndex,
} from './query/index.js';

// VectorStore exports
export type {
  VectorStore,
  VectorStoreConfig,
  VectorDocument,
  VectorQuery,
  VectorSearchResult,
  MetadataFilter,
  FilterCondition,
  FilterOperator,
  FilterValue,
} from './vector-store/index.js';
export { AcsVectorStore, createVectorStore, buildMetadataFilter, FilterBuilder, filter } from './vector-store/index.js';

// Resilience exports
export type { CircuitState } from './resilience/index.js';
export {
  CircuitBreaker,
  RetryExecutor,
  ResilientExecutor,
  createCircuitBreaker,
  createRetryExecutor,
  createResilientExecutor,
} from './resilience/index.js';

// Error exports
export type { AcsErrorOptions } from './errors/index.js';
export {
  AcsError,
  ConfigurationError,
  InvalidEndpointError,
  InvalidIndexNameError,
  MissingCredentialsError,
  AuthenticationError,
  InvalidApiKeyError,
  TokenExpiredError,
  PermissionDeniedError,
  IndexError,
  IndexNotFoundError,
  FieldNotFoundError,
  InvalidSchemaError,
  DocumentError,
  DocumentNotFoundError,
  KeyFieldMissingError,
  ValidationFailedError,
  PartialFailureError,
  QueryError,
  InvalidFilterError,
  InvalidOrderByError,
  VectorDimensionMismatchError,
  SyntaxError,
  NetworkError,
  ConnectionFailedError,
  TimeoutError,
  DnsResolutionFailedError,
  ServerError,
  InternalServerError,
  ServiceUnavailableError,
  ServiceBusyError,
  QuotaExceededError,
  CircuitOpenError,
  isRetryable,
  getRetryDelay,
  mapStatusToError,
} from './errors/index.js';

// Observability exports
export type { LogLevel, Logger, MetricsCollector, SpanContext, Tracer } from './observability/index.js';
export {
  MetricNames,
  ConsoleLogger,
  NoopLogger,
  InMemoryLogger,
  InMemoryMetricsCollector,
  NoopMetricsCollector,
  NoopTracer,
  createConsoleLogger,
  createNoopLogger,
  createInMemoryLogger,
  createNoopMetricsCollector,
  createInMemoryMetricsCollector,
  createNoopTracer,
} from './observability/index.js';

// Simulation exports
export type {
  SerializedRequest,
  SerializedResponse,
  RecordedInteraction,
  SimulationFile,
  MatchingMode,
  SimulationConfig,
  SearchPattern,
} from './simulation/index.js';
export {
  MockAcsClient,
  MockSearchService,
  MockDocumentService,
  MockResponseBuilder,
  createMockClient,
  mockSearchResult,
  mockSearchResults,
} from './simulation/index.js';

// Transport exports (for advanced use cases)
export type { HttpMethod, HttpRequestOptions, HttpResponse } from './transport/index.js';
export { HttpTransport, createTransport } from './transport/index.js';
