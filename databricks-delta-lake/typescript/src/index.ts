/**
 * Databricks Delta Lake Integration
 *
 * Production-ready TypeScript client for Databricks with:
 * - Full type safety
 * - Multiple authentication methods (PAT, OAuth, Service Principal, Azure AD)
 * - Resilience patterns (retry, circuit breaker, rate limiting)
 * - Observability (tracing, metrics, logging)
 * - Unity Catalog integration
 * - Delta Lake operations
 * - SQL Warehouse execution
 * - Jobs API support
 *
 * @packageDocumentation
 */

// ============================================================================
// Core Exports
// ============================================================================

export { DatabricksClient, createClient, createClientFromEnv } from './client/index.js';
export type { DatabricksClientOptions } from './client/index.js';

// ============================================================================
// Configuration
// ============================================================================

export {
  DatabricksConfig,
  DatabricksConfigBuilder,
  SecretString,
  DEFAULTS,
} from './config/index.js';
export type {
  DatabricksConfigOptions,
  AuthConfig,
  RetryConfig,
  ResilienceConfig,
} from './config/index.js';

// ============================================================================
// Authentication
// ============================================================================

export {
  PatAuthProvider,
  OAuthProvider,
  ServicePrincipalProvider,
  createAuthProvider,
  AuthenticationError as AuthError,
  InvalidCredentialsError,
  TokenExpiredError,
  TokenRefreshError,
  isAuthenticationError,
  validateTokenFormat,
  maskToken,
} from './auth/index.js';
export type {
  AuthProvider,
  CachedToken,
  PatAuthConfig,
  OAuthConfig,
  ServicePrincipalConfig,
} from './auth/index.js';

// ============================================================================
// Errors
// ============================================================================

export {
  DatabricksError,
  ConfigurationError,
  InvalidWorkspaceUrl,
  InvalidCredentials,
  MissingConfiguration,
  AuthenticationError,
  TokenExpired,
  InvalidToken,
  ServicePrincipalError,
  OAuthFlowFailed,
  JobError,
  JobNotFound,
  RunFailed,
  RunCanceled,
  ClusterNotAvailable,
  ResourceQuotaExceeded,
  SqlError,
  StatementFailed,
  StatementCanceled,
  WarehouseNotRunning,
  SyntaxError,
  PermissionDenied,
  DeltaError,
  TableNotFound,
  SchemaEvolutionConflict,
  ConcurrentModification,
  VersionNotFound,
  ConstraintViolation,
  CatalogError,
  CatalogNotFound,
  SchemaNotFound,
  AccessDenied,
  ServiceError,
  RateLimited,
  ServiceUnavailable,
  InternalError,
  NetworkError,
  isRetryableError,
  getRetryAfter,
  parseApiError,
} from './errors/index.js';
export type { ErrorCategory } from './errors/index.js';

// ============================================================================
// Types
// ============================================================================

export type {
  ApiVersion,
  // Job Types
  JobTask,
  NotebookTask,
  SparkJarTask,
  SparkPythonTask,
  SparkSubmitTask,
  AutoscaleConfig,
  ClusterSpec,
  RunId,
  RunLifeCycleState,
  ResultState,
  RunState,
  RunStatus,
  RunOutput,
  WaitConfig,
  // SQL Types
  StatementState,
  ColumnInfo,
  Row,
  StatementResult,
  StatementStatus,
  // Delta Lake Types
  ReadOptions,
  WriteMode,
  WriteResult,
  MergeAction,
  MergeResult,
  HistoryEntry,
  OptimizeOptions,
  OptimizeResult,
  VacuumResult,
  // Schema Types
  ColumnSchema,
  TableSchema,
  SchemaCompatibility,
  // Catalog Types
  CatalogInfo,
  SchemaInfo,
  TableType,
  TableInfo,
  // Streaming Types
  StreamSource,
  StreamSink,
  TriggerMode,
  StreamingJobSpec,
  StreamingQueryStatus,
  // Common Types
  Usage,
  Metrics,
  ListParams,
  ListResponse,
  ErrorCode,
  Duration,
  TimeUnit,
  PaginationCursor,
} from './types/index.js';

// ============================================================================
// HTTP and Resilience
// ============================================================================

export {
  HttpExecutor,
  ResilienceOrchestrator,
  RetryExecutor,
  CircuitBreaker,
  CircuitState,
  RateLimiter,
  EndpointRateLimiters,
  DatabricksHttpError,
  RateLimitError,
  ServiceUnavailableError,
  CircuitBreakerOpenError,
  ConcurrentModificationError,
  isRetryableError as isHttpRetryableError,
  OPERATION_TIMEOUTS,
  getOperationTimeout,
} from './http/index.js';
export type {
  HttpMethod,
  HttpRequestOptions,
  HttpResponse,
  DatabricksErrorResponse,
  HttpExecutorConfig,
  RetryConfig as HttpRetryConfig,
  CircuitBreakerConfig,
  RateLimiterConfig,
} from './http/index.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Default Databricks API version
 */
export const DEFAULT_API_VERSION = '2.1';

/**
 * Default request timeout in seconds
 */
export const DEFAULT_TIMEOUT_SECS = 30;

/**
 * Default rate limit (requests per second)
 */
export const DEFAULT_RATE_LIMIT = 100;

/**
 * Default maximum retry attempts
 */
export const DEFAULT_MAX_RETRIES = 3;

/**
 * Default base delay for retry backoff in milliseconds
 */
export const DEFAULT_BASE_DELAY_MS = 500;

/**
 * Default maximum delay for retry backoff in milliseconds
 */
export const DEFAULT_MAX_DELAY_MS = 30000;

/**
 * Default circuit breaker failure threshold
 */
export const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 5;

/**
 * Default circuit breaker reset timeout in seconds
 */
export const DEFAULT_CIRCUIT_BREAKER_RESET_TIMEOUT = 60;

/**
 * Default catalog name
 */
export const DEFAULT_CATALOG = 'main';

/**
 * Default schema name
 */
export const DEFAULT_SCHEMA = 'default';

/**
 * Default OAuth scopes
 */
export const DEFAULT_OAUTH_SCOPES = ['sql', 'offline_access'];

// ============================================================================
// Re-export utility functions
// ============================================================================

/**
 * Convert duration to milliseconds
 */
export { toMilliseconds } from './types/index.js';

/**
 * Create a secret string for secure credential handling
 */
export { createSecretString } from './types/index.js';
