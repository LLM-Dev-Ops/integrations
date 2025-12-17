/**
 * Salesforce TypeScript Integration - Main Entry Point
 *
 * Provides a comprehensive TypeScript SDK for interacting with the Salesforce REST API,
 * including SObject operations, SOQL queries, Bulk API 2.0, Platform Events,
 * and organizational limits tracking.
 *
 * @module @llmdevops/salesforce
 */

// ============================================================================
// Type Definitions
// ============================================================================

export type {
  // SObject Types
  SObjectRecord,
  SObjectDescribe,
  SObjectField,
  FieldType,
  PicklistValue,
  ChildRelationship,
  RecordTypeInfo,

  // Query Types
  QueryResult,
  QueryExplainPlan,
  QueryPlanItem,
  QueryPlanNote,
  QueryOptions,
  PaginationInfo,

  // CRUD Types
  CreateResult,
  UpdateResult,
  UpsertResult,
  DeleteResult,
  SalesforceFieldError,

  // Composite Types
  CompositeRequest,
  CompositeResponse,
  CompositeSubResponse,
  CompositeGraphRequest,
  CompositeGraphSubRequest,

  // Bulk API Types
  BulkJobInfo,
  BulkOperation,
  BulkJobState,
  ColumnDelimiter,
  LineEnding,
  ConcurrencyMode,
  ContentType,
  BulkJobResult,
  BulkRecordResult,
  BulkJobCreateRequest,

  // Event Types
  PlatformEvent,
  PublishResult,
  SubscribeRequest,
  ReplayPreset,
  EventMessage,

  // Limits Types
  SalesforceLimits,
  LimitInfo,
  CommonLimits,

  // Auth Token Types
  TokenResponse,
  GrantType,
  TokenRequest,

  // Metadata Types
  ApiVersion,
  GlobalDescribe,
  SObjectDescribeBasic,

  // Search Types
  SearchResult,
  SearchRecord,

  // Utility Types
  RecordReference,
} from './types/index.js';

// ============================================================================
// Error Classes and Utilities
// ============================================================================

export {
  // Error Codes
  SalesforceErrorCode,

  // Base Error
  SalesforceError,

  // Configuration Errors
  ConfigurationError,
  NoAuthenticationError,

  // Authentication Errors
  AuthenticationError,
  TokenExpiredError,
  TokenRefreshFailedError,

  // Access Errors
  PermissionDeniedError,
  RecordNotFoundError,
  SObjectNotFoundError,

  // Validation Errors
  ValidationError,
  InvalidSoqlError,
  RequiredFieldMissingError,
  InvalidFieldValueError,
  DuplicateValueError,

  // Rate Limiting Errors
  RateLimitedError,
  RateLimitTimeoutError,
  DailyLimitExceededError,
  ConcurrentRequestLimitExceededError,

  // Network/Server Errors
  NetworkError,
  TimeoutError,
  ServerError,
  ServiceUnavailableError,

  // Bulk API Errors
  BulkJobFailedError,
  BulkPartialFailureError,
  BulkJobAbortedError,
  BulkBatchFailedError,

  // Platform Event Errors
  EventPublishFailedError,
  SubscriptionFailedError,
  EventDeliveryFailedError,

  // Simulation Errors
  SimulationNoMatchError,
  SimulationLoadError,

  // Circuit Breaker Errors
  CircuitBreakerOpenError,

  // Entity Locking Errors
  EntityIsLockedError,
  UnableToLockRowError,

  // Error Utilities
  parseSalesforceApiError,
  isSalesforceError,
  isRetryableError,
  getRetryDelayMs,
} from './errors/index.js';

export type {
  SalesforceApiErrorResponse,
} from './errors/index.js';

// ============================================================================
// Configuration
// ============================================================================

export {
  // Configuration Builder
  SalesforceConfigBuilder,

  // Secret String
  SecretString,

  // Default Configurations
  DEFAULT_RATE_LIMIT_CONFIG,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  DEFAULT_API_VERSION,
} from './config/index.js';

export type {
  // Main Configuration
  SalesforceConfig,

  // Authentication Types
  AuthMethod,
  JwtBearerAuth,
  RefreshTokenAuth,

  // Simulation Mode
  SimulationMode,

  // Config Interfaces
  RateLimitConfig,
  RetryConfig,
  CircuitBreakerConfig,
} from './config/index.js';

// ============================================================================
// Client
// ============================================================================

export {
  // Client Class
  SalesforceClient,

  // Client Factory Functions
  createSalesforceClient,
  createSalesforceClientFromEnv,
} from './client/index.js';

export type {
  // HTTP Types
  HttpMethod,
  RequestOptions,
  Response,
} from './client/index.js';

// ============================================================================
// Authentication
// ============================================================================

export {
  // Auth Providers
  JwtBearerAuthProvider,
  RefreshTokenAuthProvider,
  TokenManager,

  // Auth Factory
  createAuthProvider,
} from './auth/index.js';

export type {
  // Auth Interface
  AuthProvider,
  Headers,
} from './auth/index.js';

// ============================================================================
// Services
// ============================================================================

// SObject Service
export {
  createSObjectService,
  isValidSalesforceId,
  validateSObjectType,
} from './services/sobject.js';

export type {
  SObjectService,
  UpdateResult as SObjectUpdateResult,
  DeleteResult as SObjectDeleteResult,
  GlobalDescribeResult,
} from './services/sobject.js';

// Query Service
export {
  createQueryService,
  encodeSOQL,
} from './services/query.js';

export type {
  QueryService,
  SearchResult as QuerySearchResult,
} from './services/query.js';

// Bulk Service
export {
  createBulkService,
  createBulkOrchestrator,
} from './services/bulk.js';

export type {
  BulkService,
  BulkOrchestrator,
  CreateBulkJobOptions,
  BulkExecuteOptions,
  BulkJobResult as BulkJobExecuteResult,
} from './services/bulk.js';

// Event Service
export {
  createEventService,
  createPubSubClient,
  createSimplePubSubClient,
} from './services/events.js';

export type {
  EventService,
  PubSubClient,
  PublishResult as EventPublishResult,
  PublishError,
  StreamingEvent,
  SubscribeOptions,
  PlatformEventMessage,
  EventSchema,
  ChangeDataCaptureEvent,
} from './services/events.js';

export { SimplePubSubClient } from './services/events.js';

// Limits Service
export {
  createLimitsService,
  createLimitsTracker,
  LimitNames,
} from './services/limits.js';

export type {
  LimitsService,
  LimitsTracker,
  LimitsTrackerOptions,
  LimitWarning,
  LimitWarningCallback,
} from './services/limits.js';

// ============================================================================
// Resilience
// ============================================================================

export {
  RateLimiter,
  CircuitBreaker,
  ResilienceOrchestrator,
} from './resilience/index.js';

export type {
  CircuitBreakerState,
  ResilientExecuteOptions,
  RetryHooks,
} from './resilience/index.js';

// ============================================================================
// Observability
// ============================================================================

export {
  // Log Levels
  LogLevel,

  // Logger Implementations
  ConsoleLogger,
  NoopLogger,
  InMemoryLogger,

  // Metrics Implementations
  NoopMetricsCollector,
  InMemoryMetricsCollector,

  // Tracer Implementations
  NoopTracer,
  InMemoryTracer,
  InMemorySpanContext,

  // Metric Names
  MetricNames,

  // Observability Factories
  createNoopObservability,
  createInMemoryObservability,
  createConsoleObservability,
} from './observability/index.js';

export type {
  // Interfaces
  Logger,
  MetricsCollector,
  Tracer,
  SpanContext,
  SpanStatus,
  Observability,
} from './observability/index.js';

// ============================================================================
// Convenience API Factory
// ============================================================================

/**
 * Unified Salesforce API interface with all services pre-configured.
 */
export interface SalesforceApi {
  /** The underlying Salesforce client */
  client: import('./client/index.js').SalesforceClient;

  /** SObject operations service */
  sobjects: import('./services/sobject.js').SObjectService;

  /** SOQL query service */
  query: import('./services/query.js').QueryService;

  /** Bulk API 2.0 service */
  bulk: import('./services/bulk.js').BulkService;

  /** Platform Events service */
  events: import('./services/events.js').EventService;

  /** Organizational limits service */
  limits: import('./services/limits.js').LimitsService;
}

// Import service factories for convenience API
import { createSalesforceClient as createClient } from './client/index.js';
import { createSObjectService } from './services/sobject.js';
import { createQueryService } from './services/query.js';
import { createBulkService } from './services/bulk.js';
import { createEventService } from './services/events.js';
import { createLimitsService } from './services/limits.js';
import { SalesforceConfigBuilder as ConfigBuilder } from './config/index.js';
import type { SalesforceConfig } from './config/index.js';
import type { Observability } from './observability/index.js';

/**
 * Creates a unified Salesforce API with all services pre-configured.
 *
 * This is a convenience function that creates a SalesforceClient and all
 * associated services in a single call.
 *
 * @param config - Salesforce configuration
 * @param observability - Optional observability configuration
 * @returns Unified API object with all services
 *
 * @example Basic usage
 * ```typescript
 * import { createSalesforceApi, SalesforceConfigBuilder } from '@llmdevops/salesforce';
 *
 * const config = new SalesforceConfigBuilder()
 *   .withInstanceUrl('https://your-org.my.salesforce.com')
 *   .withJwtBearer(clientId, privateKey, username)
 *   .build();
 *
 * const api = createSalesforceApi(config);
 *
 * // Use services directly
 * const account = await api.sobjects.get('Account', accountId);
 * const results = await api.query.query('SELECT Id, Name FROM Account');
 * await api.events.publish('Order_Event__e', { Amount__c: 1500 });
 * ```
 *
 * @example With observability
 * ```typescript
 * import { createSalesforceApi, createConsoleObservability, LogLevel } from '@llmdevops/salesforce';
 *
 * const config = SalesforceConfigBuilder.fromEnv().build();
 * const observability = createConsoleObservability(LogLevel.DEBUG);
 *
 * const api = createSalesforceApi(config, observability);
 *
 * // Logging is automatically enabled
 * const accounts = await api.query.query('SELECT Id, Name FROM Account');
 * ```
 */
export function createSalesforceApi(
  config: SalesforceConfig,
  observability?: Observability
): SalesforceApi {
  // Create client
  const client = createClient(config, observability);

  // Create all services
  return {
    client,
    sobjects: createSObjectService(client),
    query: createQueryService(client),
    bulk: createBulkService(client),
    events: createEventService(client),
    limits: createLimitsService(client),
  };
}

/**
 * Creates a unified Salesforce API from environment variables.
 *
 * This is a convenience function that creates configuration from environment
 * variables and returns a fully configured API object.
 *
 * @param observability - Optional observability configuration
 * @returns Unified API object with all services
 *
 * @example
 * ```typescript
 * import { createSalesforceApiFromEnv } from '@llmdevops/salesforce';
 *
 * // Configuration loaded from environment variables:
 * // SF_INSTANCE_URL, SF_CLIENT_ID, SF_PRIVATE_KEY, SF_USERNAME, etc.
 * const api = createSalesforceApiFromEnv();
 *
 * const accounts = await api.query.query('SELECT Id, Name FROM Account LIMIT 10');
 * ```
 */
export function createSalesforceApiFromEnv(
  observability?: Observability
): SalesforceApi {
  const config = ConfigBuilder.fromEnv().build();
  return createSalesforceApi(config, observability);
}
