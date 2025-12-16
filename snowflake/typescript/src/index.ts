/**
 * Snowflake Integration
 *
 * A comprehensive TypeScript client library for Snowflake data warehouse operations.
 *
 * @module @llmdevops/snowflake-integration
 *
 * @example
 * ```typescript
 * import { SnowflakeClient, SnowflakeConfigBuilder } from '@llmdevops/snowflake-integration';
 *
 * // Create client from environment variables
 * const client = await SnowflakeClient.fromEnv();
 *
 * // Or use the builder
 * const config = new SnowflakeConfigBuilder()
 *   .account('my-account')
 *   .passwordAuth('my-user', 'my-password')
 *   .warehouse('COMPUTE_WH')
 *   .database('MY_DB')
 *   .schema('PUBLIC')
 *   .build();
 *
 * const client = await SnowflakeClient.create(config);
 *
 * // Execute queries
 * const result = await client.execute('SELECT * FROM users WHERE active = ?', [true]);
 *
 * // Close when done
 * await client.close();
 * ```
 */

// ============================================================================
// Core Types
// ============================================================================

export type {
  // Primitive types
  SnowflakeDataType,
  Value,

  // Row and result types
  Row,
  ResultSet,
  QueryResult,
  AsyncQueryStatus,
  QueryStatus,
  ColumnMetadata,

  // Health check
  HealthCheckResult,

  // Metadata types
  DatabaseInfo,
  SchemaInfo,
  TableInfo,
  ColumnInfo,

  // Query history
  QueryHistoryEntry,

  // Cost types
  CreditUsage,
  CostEstimate,

  // Warehouse types
  WarehouseStatus,
  WarehouseSize,
  WarehouseState,
  WorkloadType,

  // Ingestion types
  FileFormat,
  FormatType,
  CopyIntoRequest,
  CopyIntoResult,
  CopyOptions,
  PutOptions,
  PutResult,
  StageFile,
  BulkInsertOptions,

  // Simulation types
  SimulationMode,
  RecordedQuery,
} from './types/index.js';

// ============================================================================
// Configuration
// ============================================================================

export type {
  SnowflakeConfig,
  ConnectionConfig,
  PoolConfig,
  RetryConfig,
  CircuitBreakerConfig,
  WarehouseRoutingConfig,
  WarehouseConfig,
  CostConfig,
  ObservabilityConfig,
  SimulationConfig,
  LogLevel,
  AuthMethod,
  AuthConfig,
  PasswordAuthConfig,
  KeyPairAuthConfig,
  OAuthAuthConfig,
  ExternalBrowserAuthConfig,
} from './config/index.js';

export {
  SnowflakeConfigBuilder,
  applyDefaults,
  validateConfig,
  configFromEnvironment,
  DEFAULT_SNOWFLAKE_PORT,
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_QUERY_TIMEOUT_MS,
  DEFAULT_LOGIN_TIMEOUT_MS,
  DEFAULT_POOL_MIN,
  DEFAULT_POOL_MAX,
  DEFAULT_POOL_ACQUIRE_TIMEOUT_MS,
  DEFAULT_POOL_IDLE_TIMEOUT_MS,
  DEFAULT_POOL_MAX_LIFETIME_MS,
  DEFAULT_RETRY_MAX_ATTEMPTS,
  DEFAULT_RETRY_BASE_DELAY_MS,
  DEFAULT_RETRY_MAX_DELAY_MS,
  DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
  DEFAULT_CIRCUIT_BREAKER_TIMEOUT_MS,
} from './config/index.js';

// ============================================================================
// Client
// ============================================================================

export { SnowflakeClient, type SnowflakeClientOptions } from './client/index.js';

// ============================================================================
// Errors
// ============================================================================

export {
  SnowflakeError,
  SnowflakeErrorCode,
  ConnectionError,
  ConnectionTimeoutError,
  ConnectionLostError,
  SessionExpiredError,
  AuthenticationError,
  InvalidCredentialsError,
  TokenExpiredError,
  PoolExhaustedError,
  AcquireTimeoutError,
  QueryError,
  QueryTimeoutError,
  QueryCancelledError,
  SyntaxError,
  ObjectNotFoundError,
  PermissionDeniedError,
  TransactionError,
  TransactionAbortedError,
  DeadlockError,
  WarehouseSuspendedError,
  WarehouseNotFoundError,
  ResourceLimitError,
  StageNotFoundError,
  FileNotFoundError,
  CopyFailedError,
  PutFailedError,
  CircuitBreakerOpenError,
  RetryExhaustedError,
  ConfigurationError,
  MissingConfigurationError,
  isSnowflakeError,
  isRetryableError,
  wrapError,
  fromSdkError,
} from './errors/index.js';

// ============================================================================
// Authentication
// ============================================================================

export type { CredentialProvider, Credentials } from './auth/index.js';

export {
  BaseCredentialProvider,
  PasswordCredentialProvider,
  KeyPairCredentialProvider,
  OAuthCredentialProvider,
  createCredentialProvider,
} from './auth/index.js';

// ============================================================================
// Connection Pool
// ============================================================================

export type { ExecuteOptions, PoolEvents } from './pool/index.js';

export { Session, ConnectionPool } from './pool/index.js';

// ============================================================================
// Query Execution
// ============================================================================

export type {
  QueryExecutionOptions,
  QueryExecutionFn,
  AsyncQuerySubmissionFn,
  StatusPollingFn,
  QueryCancellationFn,
  RawQueryResult,
  RetryConfig as QueryRetryConfig,
  ParameterBinding,
  WaitOptions,
  StatusPoller,
  QueryCanceller,
} from './query/index.js';

export {
  QueryBuilder,
  query,
  Query,
  QueryExecutionMode,
  QueryExecutor,
  createQueryExecutor,
  AsyncQueryHandle,
  createAsyncQueryHandle,
  createPositionalBinding,
  createNamedBinding,
  addPositionalParam,
  addNamedParam,
  getParameter,
  getParameterValues,
  toSdkBinds,
  validateBinding,
  fromRawValues,
} from './query/index.js';

// ============================================================================
// Result Handling
// ============================================================================

export type {
  RawColumnMetadata,
  RawRow,
  RawResultSet,
  FetchPageFn,
  ResultStreamOptions,
  ResultStreamItem,
  CsvExportOptions,
  JsonExportOptions,
  JsonLinesExportOptions,
  StreamExportOptions,
} from './result/index.js';

export {
  parseColumns,
  parseRow,
  parseResultSet,
  validateValue,
  toSnowflakeValue,
  ResultStream,
  fromResultSet,
  toCsv,
  toCsvStream,
  toJson,
  toJsonStream,
  toJsonLines,
  toJsonLinesStream,
  ResultExporter,
  createExporter,
} from './result/index.js';

// ============================================================================
// Data Ingestion
// ============================================================================

export type {
  StageQueryExecutor,
  ListStageOptions,
  GetFileOptions,
  CopyQueryExecutor,
  BulkQueryExecutor,
  BulkInserterConfig,
} from './ingestion/index.js';

export {
  StageManager,
  createStagePath,
  parseStagePath,
  isValidStagePath,
  CopyIntoBuilder,
  CopyIntoExecutor,
  copyInto,
  validateCopyRequest,
  estimateFileCount,
  createCopyRequest,
  BulkInserter,
  batchRecords,
  validateBulkRecords,
  recordsToCsv,
  FileFormatBuilder,
  csv,
  json,
  avro,
  orc,
  parquet,
  xml,
  formatToSql,
  CSV_COMMA,
  CSV_PIPE,
  CSV_TAB,
  JSON_AUTO,
  JSON_ARRAY,
  PARQUET_AUTO,
} from './ingestion/index.js';

// ============================================================================
// Warehouse Routing
// ============================================================================

export type {
  WarehouseSelectionCriteria,
  WarehouseSelectionResult,
  WarehouseRoutingMetrics,
  WarehouseAvailabilityResult,
  WarehouseStatusProvider,
  WarehouseStatusCheckerOptions,
} from './warehouse/index.js';

export {
  WarehouseRouter,
  WarehouseStatusChecker,
  WAREHOUSE_SIZE_ORDER,
  meetsMinimumSize,
  compareWarehouseSizes,
} from './warehouse/index.js';

// ============================================================================
// Cost Monitoring
// ============================================================================

export type {
  CostAlert,
  AlertSeverity,
  AlertCallback,
  UsageQueryExecutor,
  EstimatorQueryExecutor,
} from './cost/index.js';

export {
  CreditUsageTracker,
  QueryCostEstimator,
  CostAlertManager,
} from './cost/index.js';

// ============================================================================
// Metadata Discovery
// ============================================================================

export type {
  TableStatistics,
  ClusteringInfo,
  StorageInfo,
  QueryHistoryOptions,
  DiscoveryQueryExecutor,
  HistoryQueryExecutor,
  StatsQueryExecutor,
} from './metadata/index.js';

export {
  SchemaDiscoveryService,
  QueryHistoryService,
  TableStatsService,
} from './metadata/index.js';

// ============================================================================
// Simulation (Record/Replay)
// ============================================================================

export type { SimulationConfig as SimulationLayerConfig } from './simulation/index.js';

export {
  QueryFingerprinter,
  defaultFingerprinter,
  QueryRecorder,
  SimulationReplayer,
} from './simulation/index.js';

// ============================================================================
// Metrics
// ============================================================================

export type {
  MetricType,
  Labels,
  MetricDefinition,
  HistogramBuckets,
} from './metrics/index.js';

export {
  MetricsCollector,
  getMetrics,
  resetMetrics,
  DEFAULT_METRICS,
} from './metrics/index.js';

// ============================================================================
// Security
// ============================================================================

export type { AuditEventType, AuditEvent, AuditEventHandler } from './security/index.js';

export {
  SecretString,
  SqlSanitizer,
  AuditLogger,
  getAuditLogger,
  resetAuditLogger,
  redactCredentials,
} from './security/index.js';
