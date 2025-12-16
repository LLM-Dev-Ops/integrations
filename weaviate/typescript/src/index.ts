/**
 * Weaviate TypeScript Integration
 *
 * Production-ready Weaviate Vector Database client for LLM DevOps platform.
 *
 * ## Features
 *
 * - **Full CRUD Operations**: Create, read, update, delete objects with type safety
 * - **Advanced Search**: Vector similarity, hybrid, BM25, semantic text search
 * - **Batch Operations**: High-throughput batch create/delete with retry logic
 * - **Filter Builder**: Type-safe, fluent API for complex queries
 * - **Aggregations**: Statistical analysis over object collections
 * - **Multi-tenancy**: Full support for tenant isolation and management
 * - **Cross-references**: Manage relationships between objects
 * - **Schema Introspection**: Read-only schema access with caching
 * - **Resilience Patterns**: Retry, circuit breaker, rate limiting, graceful degradation
 * - **Observability**: Tracing, metrics, structured logging, health checks
 * - **Testing Support**: Mock client with in-memory simulation
 *
 * ## Quick Start
 *
 * ```typescript
 * import { createClient, WeaviateConfig, Filter } from '@llmdevops/weaviate-integration';
 *
 * // Create client from environment variables
 * const client = createClientFromEnv();
 *
 * // Or configure manually
 * const config = WeaviateConfig.builder()
 *   .endpoint('http://localhost:8080')
 *   .apiKey('your-api-key')
 *   .timeout(30000)
 *   .build();
 *
 * const client = createClient(config);
 *
 * // Create an object
 * const article = await client.createObject('Article', {
 *   title: 'Introduction to Vector Search',
 *   content: 'Vector search enables semantic similarity...',
 *   year: 2024
 * }, { vector: embeddings });
 *
 * // Search with filters
 * const filter = Filter.property('year')
 *   .greaterThan(2020)
 *   .and(Filter.property('category').equal('technology'));
 *
 * const results = await client.nearVector('Article', {
 *   vector: queryEmbedding,
 *   certainty: 0.7,
 *   limit: 10,
 *   filter
 * });
 * ```
 *
 * @packageDocumentation
 * @module @llmdevops/weaviate-integration
 */

// ============================================================================
// Configuration
// ============================================================================

export {
  WeaviateConfig,
  WeaviateConfigBuilder,
  createConfigFromEnv,
  DEFAULT_ENDPOINT,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_BATCH_SIZE,
  DEFAULT_POOL_SIZE,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_BACKOFF_MS,
  DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
  DEFAULT_SCHEMA_CACHE_TTL_SECONDS,
} from './config/index.js';

export type {
  WeaviateConfigOptions,
  PoolConfig,
  ResilienceConfig,
  CacheConfig,
  TenantConfig,
} from './config/types.js';

// ============================================================================
// Authentication
// ============================================================================

export type {
  WeaviateAuth,
  ApiKeyAuth,
  OidcAuth,
  ClientCredentialsAuth,
  NoAuth,
  AuthProvider,
} from './auth/types.js';

export {
  createApiKeyAuth,
  createOidcAuth,
  createClientCredentialsAuth,
  createNoAuth,
  createAuthFromEnv,
} from './auth/factory.js';

// ============================================================================
// Core Types
// ============================================================================

// Property types
export type {
  PropertyValue,
  Properties,
  GeoCoordinates,
  PhoneNumber,
  UUID,
  ObjectReference,
} from './types/property.js';

export {
  isGeoCoordinates,
  isPhoneNumber,
  isObjectReference,
  isObjectReferenceArray,
  createUUID,
  isValidUUID,
} from './types/property.js';

// Vector types
export type {
  Vector,
  VectorWithMetadata,
  SimilarityScores,
  PQConfig,
} from './types/vector.js';

export {
  DistanceMetric,
  isValidVectorDimensions,
  isValidVectorValues,
  isValidVector,
  normalizeVector,
} from './types/vector.js';

// Filter types
export type {
  WhereFilter,
  FilterOperand,
  FilterValue,
  GeoRange,
  AndFilter,
  OrFilter,
  OperandFilter,
} from './types/filter.js';

export {
  FilterOperator,
  isOperandFilter,
  isAndFilter,
  isOrFilter,
  isGeoRange,
} from './types/filter.js';

// Object types
export type {
  WeaviateObject,
  CreateOptions,
  GetOptions,
  UpdateOptions,
  DeleteOptions,
  ExistsOptions,
  ValidateOptions,
  ValidationResult,
  ListOptions,
  ListResponse,
  SortOptions,
} from './types/object.js';

export { ConsistencyLevel } from './types/object.js';

// Search types
export type {
  NearVectorQuery,
  NearObjectQuery,
  NearTextQuery,
  HybridQuery,
  BM25Query,
  SearchResult,
  SearchHit,
  SearchGroup,
  MoveParams,
  GroupByConfig,
  AskQuery,
  AskResult,
} from './types/search.js';

export { FusionType } from './types/search.js';

// Batch types
export type {
  BatchObject,
  BatchRequest,
  BatchResponse,
  BatchError,
  BatchObjectResult,
  BatchDeleteRequest,
  BatchDeleteResponse,
  BatchUpdateRequest,
  BatchUpdateResponse,
  BatchReferenceRequest,
  BatchReferenceResponse,
  BatchStatus,
} from './types/batch.js';

// Aggregate types
export type {
  AggregateQuery,
  AggregateField,
  AggregateResult,
  AggregateGroup,
  AggregateValue,
  AggregateMeta,
  OccurrenceCount,
  TypeCount,
  NumericAggregation,
  TextAggregation,
  BooleanAggregation,
  DateAggregation,
  ReferenceAggregation,
  CountQuery,
  CountResult,
  MetaCountQuery,
  TopOccurrencesConfig,
} from './types/aggregate.js';

export {
  Aggregation,
  isNumericAggregation,
  isTextAggregation,
  isBooleanAggregation,
  isDateAggregation,
} from './types/aggregate.js';

// Tenant types
export type {
  Tenant,
  TenantOptions,
  CreateTenantOptions,
  UpdateTenantOptions,
  ListTenantsRequest,
  ListTenantsResponse,
  GetTenantRequest,
  ActivateTenantRequest,
  DeactivateTenantRequest,
  DeleteTenantRequest,
  TenantStats,
  BatchTenantOperation,
  BatchTenantResult,
} from './types/tenant.js';

export {
  TenantStatus,
  isTenantActive,
  isTenantInactive,
  isTenantOffloaded,
  isTenantQueryable,
} from './types/tenant.js';

// Schema types
export type {
  Schema,
  ClassDefinition,
  PropertyDefinition,
  VectorIndexConfig,
  InvertedIndexConfig,
  ReplicationConfig,
  ShardingConfig,
  MultiTenancyConfig,
  ShardInfo,
  ShardsResponse,
  GetSchemaRequest,
  GetClassRequest,
  ListClassesResponse,
  GetShardsRequest,
} from './types/schema.js';

export {
  Tokenization,
  ShardStatus,
  isTextProperty,
  isReferenceProperty,
  isArrayProperty,
  getBaseDataType,
} from './types/schema.js';

// Reference types
export type {
  Reference,
  AddReferenceOptions,
  DeleteReferenceOptions,
  UpdateReferencesOptions,
  GetReferencesOptions,
  ReferenceWithMetadata,
  GetReferencesResponse,
  ReferenceValidationResult,
  BatchReferenceOperation,
  BatchReferenceResult,
} from './types/reference.js';

export {
  createBeacon,
  parseBeacon,
  createReference,
  isValidBeacon,
  isReference,
  isReferenceArray,
} from './types/reference.js';

// ============================================================================
// Filter Builder
// ============================================================================

export {
  Filter,
  FilterBuilder,
  WhereFilterExtensions,
  and,
  or,
} from './filter/builder.js';

export {
  validateFilter,
  validateOperand,
  validatePropertyPath,
  isPropertyFilterable,
  getValidationSummary,
} from './filter/validation.js';

export {
  optimizeFilter,
  estimateSelectivity,
  flattenNestedFilters,
  reorderBySelectivity,
  removeRedundantFilters,
  countFilterConditions,
  calculateFilterDepth,
} from './filter/optimize.js';

export type {
  ValidationError,
  FilterValidationResult,
} from './filter/validation.js';

// ============================================================================
// Aggregation Builder
// ============================================================================

export {
  AggregateQueryBuilder,
  createSimpleAggregateQuery,
  createCountQuery,
} from './aggregate/builder.js';

// ============================================================================
// Search Utilities
// ============================================================================

export {
  SearchIterator,
  createSearchIterator,
  fetchAllResults,
} from './search/iterator.js';

export {
  parseSearchResultSafe,
  parseSearchHitSafe,
  filterProperties,
  extractProperty,
  sortByProperty,
  sortByScore,
  sortByDistance,
  filterByCertainty,
  filterByDistance,
  filterByScore,
  deduplicateHits,
  mergeSearchResults,
  paginateHits,
} from './search/result.js';

// ============================================================================
// Errors
// ============================================================================

export {
  WeaviateError,
  ConfigurationError,
  AuthenticationError,
  UnauthorizedError,
  ForbiddenError,
  ObjectNotFoundError,
  ClassNotFoundError,
  TenantNotFoundError,
  InvalidObjectError,
  InvalidFilterError,
  InvalidVectorError,
  RateLimitedError,
  ServiceUnavailableError,
  InternalError,
  TimeoutError,
  ConnectionError,
  NetworkError,
  BatchPartialFailureError,
  GraphQLError,
  TenantNotActiveError,
  isWeaviateError,
  isRetryableError,
  isErrorCategory,
  getRetryAfter,
  isConfigurationError,
  isAuthenticationError,
  isBatchPartialFailureError,
  isGraphQLError,
  isNotFoundError,
  isValidationError,
  isNetworkError,
} from './errors/index.js';

export type {
  ErrorCategory,
  BatchErrorDetail,
  GraphQLErrorDetail,
} from './errors/types.js';

// ============================================================================
// Observability
// ============================================================================

export type {
  Span,
  SpanStatus,
  Tracer,
  MetricValue,
  MetricsCollector,
  Logger,
  LogEntry,
  HealthCheck,
  HealthCheckResult,
  ComponentHealth,
  ObservabilityContext,
} from './observability/types.js';

export {
  LogLevel,
  HealthStatus,
  MetricNames,
  SpanNames,
  SpanAttributes,
} from './observability/types.js';

export {
  NoopTracer,
  ConsoleTracer,
  TracerSpan,
  createTracer,
} from './observability/tracer.js';

export {
  NoopMetricsCollector,
  InMemoryMetricsCollector,
  createMetricsCollector,
} from './observability/metrics.js';

export {
  NoopLogger,
  ConsoleLogger,
  createLogger,
  createLogContext,
} from './observability/logger.js';

export {
  createDefaultObservability,
  createDevObservability,
  createProductionObservability,
  createTestObservability,
  createCustomObservability,
  combineObservability,
  createObservabilityFromEnv,
} from './observability/context.js';

export {
  WeaviateHealthCheck,
  createHealthCheck,
  isHealthy,
  formatHealthCheckResult,
} from './observability/health.js';

export type {
  ConsoleLoggerOptions,
} from './observability/logger.js';

export type {
  HealthCheckOptions,
} from './observability/health.js';

// ============================================================================
// Resilience (Optional Advanced Exports)
// ============================================================================

export {
  RetryPolicy,
  CircuitBreaker,
  RateLimiter,
  GracefulDegradation,
  ResilienceOrchestrator,
} from './resilience/index.js';

export type {
  RetryConfig,
  CircuitBreakerConfig,
  CircuitBreakerState,
  RateLimiterConfig,
  DegradationConfig,
  ResilienceMetrics,
  OperationContext,
} from './resilience/types.js';

// ============================================================================
// GraphQL (Optional Advanced Exports)
// ============================================================================

export {
  GraphQLQueryBuilder,
  GraphQLExecutor,
  parseGraphQLResponse,
  extractGraphQLErrors,
  handleGraphQLResponse,
} from './graphql/index.js';

export type {
  GraphQLQuery,
  GraphQLResponse,
  GraphQLErrorResponse,
  GraphQLField,
  GraphQLArgument,
} from './graphql/types.js';

// ============================================================================
// Transport (Optional Advanced Exports)
// ============================================================================

export type {
  HttpTransport,
  TransportRequest,
  TransportResponse,
  TransportOptions,
  ConnectionPool,
  PoolStats,
} from './transport/types.js';

export {
  createHttpTransport,
  createConnectionPool,
} from './transport/index.js';

// ============================================================================
// Operations (Internal exports for advanced usage)
// ============================================================================

export {
  ObjectService,
  createObjectService,
} from './operations/object.js';

export {
  validateObjectProperties,
  validateObjectVector,
  validateObjectId,
  validateClassName,
} from './operations/validation.js';

export type {
  ObjectServiceConfig,
} from './operations/types.js';

// ============================================================================
// Batch Operations
// ============================================================================

export {
  BatchService,
  createBatchService,
} from './batch/service.js';

export {
  createBatchChunker,
  calculateOptimalBatchSize,
  estimateBatchMemory,
} from './batch/chunker.js';

export {
  BatchProgressTracker,
  createProgressTracker,
} from './batch/progress.js';

export type {
  BatchServiceConfig,
  BatchChunkerConfig,
  BatchRetryConfig,
  BatchProgressEvent,
} from './batch/types.js';

// ============================================================================
// Search Service
// ============================================================================

export {
  SearchService,
  createSearchService,
} from './search/service.js';

export type {
  SearchServiceConfig,
  SearchIteratorConfig,
  VectorValidationResult,
  VectorizerValidationResult,
} from './search/types.js';

// ============================================================================
// Aggregate Service
// ============================================================================

export {
  AggregateService,
  createAggregateService,
} from './aggregate/service.js';

export type {
  AggregateServiceConfig,
} from './aggregate/service.js';

// ============================================================================
// Reference Service
// ============================================================================

export {
  ReferenceService,
} from './reference/service.js';

export {
  createBeacon as createReferenceBeacon,
  parseBeacon as parseReferenceBeacon,
  validateBeacon,
  isValidBeaconFormat,
  extractClassFromBeacon,
  extractIdFromBeacon,
  extractHostFromBeacon,
} from './reference/beacon.js';

export {
  validateReferenceProperty,
  getExpectedReferenceClasses,
  validateCrossReference,
  checkCircularReference,
  detectCircularReferenceChain,
  validateReferenceDepth,
  calculateReferenceDepth,
  validateReference,
} from './reference/validation.js';

// ============================================================================
// Tenant Service
// ============================================================================

export {
  TenantService,
} from './tenant/service.js';

export {
  validateTenantAccess,
  validateTenantName,
  isTenantAllowed,
} from './tenant/validation.js';

export {
  parseTenantStatus,
  serializeTenantStatus,
  isTenantQueryable as isTenantQueryableUtil,
  canTransitionTo,
} from './tenant/status.js';

export {
  TenantStatusCache,
} from './tenant/cache.js';

export type {
  TenantCacheEntry,
  TenantCacheOptions,
  TenantValidationOptions,
} from './tenant/validation.js';

// ============================================================================
// Schema Service
// ============================================================================

export {
  SchemaService,
  SchemaCache,
  createSchemaService,
  createSchemaCache,
  createSchemaSetup,
} from './schema/index.js';

export {
  parseSchema,
  parseClassDefinition,
  parsePropertyDefinition,
  parseVectorIndexConfig,
  parseInvertedIndexConfig,
  parseReplicationConfig,
  parseShardingConfig,
  parseMultiTenancyConfig,
  parseShardInfo,
  parseShardStatus,
  parseTokenization,
} from './schema/parser.js';

export {
  isTextProperty as schemaIsTextProperty,
  isReferenceProperty as schemaIsReferenceProperty,
  isArrayProperty as schemaIsArrayProperty,
  getBaseDataType as schemaGetBaseDataType,
  findProperty,
  getVectorDimension,
  hasVectorizer,
  getVectorizerModule,
  isMultiTenancyEnabled,
  getPropertyCount,
  getTextProperties,
  getReferenceProperties,
  getArrayProperties,
  getSearchableProperties,
  getFilterableProperties,
  getReplicationFactor,
  hasAsyncReplication,
  getDistanceMetric,
  isPQEnabled,
} from './schema/helpers.js';

export type {
  CacheStats,
} from './schema/cache.js';

// ============================================================================
// Client (Main Entry Point)
// ============================================================================

// Note: Client implementation would be in ./client/index.ts
// For now, we export factory functions that create a client-like object
// using the services above

/**
 * Factory function to create a Weaviate client
 *
 * @param config - Weaviate configuration
 * @returns Configured Weaviate client
 *
 * @example
 * ```typescript
 * const config = WeaviateConfig.builder()
 *   .endpoint('http://localhost:8080')
 *   .apiKey('your-api-key')
 *   .build();
 *
 * const client = createClient(config);
 * ```
 */
export function createClient(config: WeaviateConfig): WeaviateClient {
  // This is a placeholder - actual implementation would be in ./client/index.ts
  throw new Error('Client implementation pending - use individual services for now');
}

/**
 * Factory function to create a Weaviate client from environment variables
 *
 * Environment variables:
 * - WEAVIATE_ENDPOINT: Weaviate endpoint URL
 * - WEAVIATE_API_KEY: API key for authentication
 * - WEAVIATE_GRPC_ENDPOINT: Optional gRPC endpoint
 * - WEAVIATE_TIMEOUT_MS: Optional request timeout
 *
 * @returns Configured Weaviate client
 *
 * @example
 * ```typescript
 * const client = createClientFromEnv();
 * ```
 */
export function createClientFromEnv(): WeaviateClient {
  const config = createConfigFromEnv();
  return createClient(config);
}

/**
 * Placeholder WeaviateClient type
 * Actual implementation would provide full client interface
 */
export interface WeaviateClient {
  // Object operations
  createObject(className: string, properties: Properties, options?: CreateOptions): Promise<WeaviateObject>;
  getObject(className: string, id: UUID, options?: GetOptions): Promise<WeaviateObject | null>;
  updateObject(className: string, id: UUID, properties: Properties, options?: UpdateOptions): Promise<WeaviateObject>;
  deleteObject(className: string, id: UUID, options?: DeleteOptions): Promise<void>;
  exists(className: string, id: UUID, tenant?: string): Promise<boolean>;

  // Search operations
  nearVector(className: string, query: NearVectorQuery): Promise<SearchResult>;
  nearText(className: string, query: NearTextQuery): Promise<SearchResult>;
  nearObject(className: string, query: NearObjectQuery): Promise<SearchResult>;
  hybrid(className: string, query: HybridQuery): Promise<SearchResult>;
  bm25(className: string, query: BM25Query): Promise<SearchResult>;

  // Batch operations
  batchCreate(objects: BatchObject[], options?: BatchRequest): Promise<BatchResponse>;
  batchDelete(className: string, filter: WhereFilter, options?: BatchDeleteRequest): Promise<BatchDeleteResponse>;

  // Aggregation
  aggregate(query: AggregateQuery): Promise<AggregateResult>;
  count(className: string, filter?: WhereFilter, tenant?: string): Promise<number>;

  // References
  addReference(fromClass: string, fromId: UUID, property: string, toClass: string, toId: UUID, options?: AddReferenceOptions): Promise<void>;
  deleteReference(fromClass: string, fromId: UUID, property: string, toClass: string, toId: UUID, options?: DeleteReferenceOptions): Promise<void>;
  updateReferences(fromClass: string, fromId: UUID, property: string, references: Reference[], options?: UpdateReferencesOptions): Promise<void>;

  // Tenants
  listTenants(className: string): Promise<Tenant[]>;
  getTenant(className: string, tenantName: string): Promise<Tenant | null>;
  activateTenant(className: string, tenantName: string): Promise<void>;
  deactivateTenant(className: string, tenantName: string): Promise<void>;

  // Schema
  getSchema(): Promise<Schema>;
  getClass(className: string): Promise<ClassDefinition | null>;
  listClasses(): Promise<string[]>;
  getShards(className: string): Promise<ShardInfo[]>;
  invalidateSchemaCache(className?: string): void;

  // Health
  healthCheck(): Promise<HealthCheckResult>;
  close(): Promise<void>;
}

// Re-export config type for convenience
export type { WeaviateConfig } from './config/types.js';

// ============================================================================
// Testing Utilities
// ============================================================================

// Note: Simulation/mock implementation would be in ./simulation/
// These are placeholder exports for the planned testing utilities

/**
 * Mock Weaviate client for testing
 * Provides in-memory simulation of Weaviate operations
 */
export interface MockWeaviateClient extends WeaviateClient {
  // Additional testing utilities
  insertObject(object: WeaviateObject): void;
  clearClass(className: string): void;
  clearAll(): void;
  setSearchResponse(className: string, result: SearchResult): void;
  injectError(pattern: string, error: WeaviateError): void;
  setLatency(latency: number): void;
  getRecordedOperations(): RecordedOperation[];
  clearRecordedOperations(): void;
  assertOperationRecorded(opType: string): void;
  assertObjectCreated(className: string, count: number): void;
  assertSearchExecuted(className: string): void;
}

/**
 * Recorded operation for testing assertions
 */
export interface RecordedOperation {
  type: string;
  className?: string;
  id?: UUID;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Create a mock Weaviate client for testing
 *
 * @param schema - Optional schema definition
 * @returns Mock client instance
 */
export function createTestClient(schema?: Schema): MockWeaviateClient {
  throw new Error('Mock client implementation pending');
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default Weaviate endpoint
 */
export const DEFAULT_WEAVIATE_ENDPOINT = 'http://localhost:8080';

/**
 * Default request timeout in milliseconds
 */
export const DEFAULT_WEAVIATE_TIMEOUT = 30000;

/**
 * Default batch size for batch operations
 */
export const DEFAULT_WEAVIATE_BATCH_SIZE = 100;

/**
 * Library version
 */
export const VERSION = '0.1.0';
