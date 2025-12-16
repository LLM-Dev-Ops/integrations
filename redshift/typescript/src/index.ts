/**
 * Amazon Redshift Integration for LLM DevOps Platform
 *
 * A comprehensive TypeScript SDK for Amazon Redshift that provides:
 * - Connection pooling with session management
 * - Query execution with parameterized statements
 * - Transaction support with savepoints
 * - Workload management (WLM) integration
 * - Data ingestion via COPY and bulk insert
 * - Result streaming for large datasets
 * - S3 data export via UNLOAD
 * - Metadata discovery for schemas, tables, and Spectrum
 * - Simulation/replay mode for testing
 * - Metrics collection and security auditing
 *
 * @module @llmdevops/redshift-integration
 *
 * @example
 * ```typescript
 * import {
 *   RedshiftClient,
 *   ConnectionPool,
 *   QueryExecutor,
 *   CopyExecutor,
 * } from '@llmdevops/redshift-integration';
 *
 * // Create a client
 * const client = new RedshiftClient({
 *   host: 'my-cluster.region.redshift.amazonaws.com',
 *   port: 5439,
 *   database: 'mydb',
 *   user: 'admin',
 *   password: process.env.REDSHIFT_PASSWORD,
 * });
 *
 * await client.connect();
 *
 * // Execute queries
 * const result = await client.query('SELECT * FROM users WHERE status = $1', ['active']);
 * console.log(result.rows);
 *
 * // Stream large results
 * const stream = await client.stream('SELECT * FROM large_table');
 * for await (const row of stream) {
 *   console.log(row);
 * }
 *
 * await client.close();
 * ```
 */

// ============================================================================
// Client Module - Main Entry Point
// ============================================================================

export {
  RedshiftClient,
  createRedshiftClient,
  type RedshiftClientConfig,
  type RedshiftClientOptions,
} from './client/index.js';

// ============================================================================
// Configuration Module
// ============================================================================

export {
  RedshiftConfig,
  createConfig,
  loadConfigFromEnv,
  mergeConfigs,
  DEFAULT_CONFIG,
  type DatabaseConfig,
  type AuthConfig,
  type PoolSettings,
  type QuerySettings,
  type RetrySettings,
  type SecuritySettings,
  type SimulationConfig,
  type TelemetrySettings,
} from './config/index.js';

// ============================================================================
// Types Module
// ============================================================================

export {
  // Value types
  type Value,
  type NullValue,
  type BooleanValue,
  type StringValue,
  type NumberValue,
  type BigIntValue,
  type BinaryValue,
  type DateValue,
  type TimestampValue,
  type JsonValue,
  type SuperValue,
  type UuidValue,
  type GeometryValue,
  type GeographyValue,
  type HllsketchValue,
  type UnknownValue,
  isNullValue,
  isBooleanValue,
  isStringValue,
  isNumberValue,
  isBigIntValue,
  isBinaryValue,
  isDateValue,
  isTimestampValue,
  isJsonValue,
  isSuperValue,
  isUuidValue,
  isGeometryValue,
  isGeographyValue,
  isHllsketchValue,
  toValue,

  // Column metadata
  type ColumnMetadata,
  type RedshiftDataType,

  // Row types
  type Row,
  createRow,

  // Result set types
  type ResultSet,
  type QueryResult,
  type QueryStatistics,

  // Simulation types
  type SimulationMode,
  type RecordedQuery,

  // UNLOAD types
  type UnloadCommand,
  type UnloadFormat,
  type UnloadOptions,
  type UnloadResult,
} from './types/index.js';

// ============================================================================
// Error Module
// ============================================================================

export {
  RedshiftError,
  RedshiftErrorCode,
  ConnectionError,
  AuthenticationError,
  QueryError,
  TransactionError,
  ConfigurationError,
  TimeoutError,
  isRedshiftError,
  isRetryable,
  getErrorCode,
  type RedshiftErrorOptions,
} from './errors/index.js';

// ============================================================================
// Authentication Module
// ============================================================================

export {
  // Credential providers
  StaticCredentialProvider,
  IamCredentialProvider,
  createStaticProvider,
  createIamProvider,
  type CredentialProvider,
  type CredentialResult,
  type StaticCredentialOptions,
  type IamCredentialOptions,
  type IamAuthMethod,
} from './auth/index.js';

// ============================================================================
// Connection Pool Module
// ============================================================================

export {
  // Session management
  Session,
  type SessionState,
  type SessionInfo,
  type ExecuteOptions,

  // Connection pool
  ConnectionPool,
  type PoolEvents,
  type RedshiftEndpoint,
  type CredentialSource,
  type ConnectionConfig,
  type PoolConfig,
  DEFAULT_POOL_MIN,
  DEFAULT_POOL_MAX,
  DEFAULT_POOL_ACQUIRE_TIMEOUT_MS,
  DEFAULT_POOL_IDLE_TIMEOUT_MS,
  DEFAULT_POOL_MAX_LIFETIME_MS,
  DEFAULT_REDSHIFT_PORT,

  // Transaction management
  Transaction,
  TransactionManager,
  withTransaction,
  type IsolationLevel,
  type TransactionState,
  type TransactionOptions,
  type TransactionManagerOptions,
} from './pool/index.js';

// ============================================================================
// Query Module
// ============================================================================

export {
  // Query builder
  QueryBuilder,
  createQueryBuilder,
  type Query,

  // Parameter binding
  ParameterBinder,
  createParameterBinder,
  type ParameterValue,
  toParameterValue,
  extractParameterValue,
  type ParameterBinding,
  createPositionalBinding,
  createNamedBinding,
  addPositionalParam,
  addNamedParam,
  validateBinding,
  toDriverParams,
  fromRawValues,

  // Query execution
  QueryExecutor,
  createQueryExecutor,
  type QueryExecutorConfig,
  type QueryExecutionOptions,
  type RetryConfig,
} from './query/index.js';

// ============================================================================
// Result Module
// ============================================================================

export {
  // Result parsing
  ResultParser,
  parseColumns,
  parseRow,
  parseResult,
  parseBoolean,
  parseNumber,
  parseBigInt,
  parseDate,
  parseTimestamp,
  parseJson,

  // Result streaming
  ResultStream,
  createCursorStream,
  type StreamOptions,

  // S3 export (UNLOAD)
  UnloadExecutor,
  createUnloadExecutor,
  buildCsvUnload,
  buildParquetUnload,
  buildJsonUnload,
  type UnloadConfig,
} from './result/index.js';

// ============================================================================
// Ingestion Module
// ============================================================================

export {
  // COPY from S3
  CopyExecutor,
  validateS3Path,
  parseS3Path,
  buildS3Path,
  type CopyOptions,
  type CopyConfig,
  type CopyResult,
  type LoadError,
  type StlLoadError,

  // Bulk insert
  BulkInsert,
  batchRecords,
  validateBulkRecords,
  estimateBatchSize,
  recordsToCsv,
  type BulkInsertOptions,
  type BulkInsertResult,
  type BulkInsertError,

  // Format specifications
  formatToSqlClause,
  CSV_COMMA,
  CSV_PIPE,
  CSV_TAB,
  JSON_AUTO,
  type DataFormat,
  type CsvFormatOptions,
  type JsonFormatOptions,
  type ParquetFormatOptions,
  type AvroFormatOptions,
  type OrcFormatOptions,
} from './ingestion/index.js';

// ============================================================================
// Workload Management Module
// ============================================================================

export {
  // WLM management
  WlmManager,
  type WlmQueueInfo,
  type WlmQueueState,
  type ConcurrencyScalingMode,

  // Status monitoring
  StatusMonitor,
  type ClusterStatus,
  type RunningQuery,
  type QueryInfo,
  type NodeDiskUsage,
} from './workload/index.js';

// ============================================================================
// Metadata Module
// ============================================================================

export {
  // Schema discovery
  SchemaDiscovery,
  type SchemaInfo,
  type TableInfo,
  type ColumnInfo,
  type TableStats,

  // Spectrum external tables
  SpectrumManager,
  type ExternalSchemaInfo,
  type ExternalTableInfo,
  type ExternalColumnInfo,
  type PartitionInfo,
} from './metadata/index.js';

// ============================================================================
// Simulation Module
// ============================================================================

export {
  // Query fingerprinting
  QueryFingerprinter,
  defaultFingerprinter,

  // Recording
  QueryRecorder,

  // Replay
  SimulationReplayer,
  type ReplayStatistics,

  // Simulation layer
  SimulationLayer,
  type SimulationOptions,
  type QueryExecutor as SimulationQueryExecutor,
} from './simulation/index.js';

// ============================================================================
// Security Module
// ============================================================================

export {
  // Audit logging
  AuditLogger,
  type AuditLogEntry,
  type AuditEventType,
  type AuditConfig,

  // Security utilities
  sanitizeQuery,
  maskCredentials,
  type SecurityConfig,
} from './security/index.js';

// ============================================================================
// Metrics Module
// ============================================================================

export {
  // Metrics collection
  MetricsCollector,
  createMetricsCollector,
  type QueryMetrics,
  type ConnectionMetrics,
  type PoolMetrics,
  type MetricsConfig,
  type MetricsSummary,
  type MetricsExporter,
} from './metrics/index.js';
