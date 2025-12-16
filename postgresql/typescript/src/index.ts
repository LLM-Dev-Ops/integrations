/**
 * PostgreSQL Integration for LLM Dev Ops Platform
 *
 * Official TypeScript connector for PostgreSQL providing:
 * - Connection pooling with health checks
 * - Query execution with parameterized queries
 * - Transaction management with isolation levels
 * - Read/write routing with replica support
 * - Resilience patterns (retry, circuit breaker)
 * - Comprehensive observability
 * - Simulation mode for testing
 *
 * @example Basic usage
 * ```typescript
 * import { createPgClient, PgConfig } from '@llmdevops/postgresql-integration';
 *
 * const config: PgConfig = {
 *   primary: {
 *     host: 'localhost',
 *     port: 5432,
 *     database: 'mydb',
 *     username: 'user',
 *     password: 'password',
 *     sslMode: SslMode.Prefer,
 *     connectTimeout: 10000,
 *     applicationName: 'myapp',
 *   },
 *   pool: {
 *     minConnections: 2,
 *     maxConnections: 10,
 *     acquireTimeout: 30000,
 *     idleTimeout: 10000,
 *     maxLifetime: 1800000,
 *     healthCheckInterval: 30000,
 *   },
 * };
 *
 * const client = createPgClient({ config });
 *
 * // Execute a query
 * const result = await client.query('SELECT * FROM users WHERE id = $1', [1]);
 *
 * // Use transactions
 * await client.withTransaction(async (tx) => {
 *   await tx.execute('INSERT INTO users (name) VALUES ($1)', ['Alice']);
 *   await tx.execute('INSERT INTO users (name) VALUES ($1)', ['Bob']);
 * });
 *
 * // Close the client when done
 * await client.close();
 * ```
 *
 * @module @llmdevops/postgresql-integration
 */

// =============================================================================
// Main Client
// =============================================================================

export {
  PgClient,
  PgClientOptions,
  createPgClient,
  createPgClientFromEnv,
} from './client.js';

// =============================================================================
// Configuration
// =============================================================================

export {
  PgConfig,
  validatePgConfig,
  createDefaultConnectionConfig,
  createDefaultPoolConfig,
  parseConnectionString,
  toConnectionString,
  redactConfig,
} from './config/index.js';

// =============================================================================
// Types
// =============================================================================

export {
  // Connection types
  ConnectionConfig,
  PoolConfig,
  SslMode,

  // Query types
  QueryIntent,
  PoolStats,

  // Transaction types
  IsolationLevel,
  Savepoint,
  generateTransactionId,

  // Value types
  Value,
  Row,
  createRow,
  extractValue,

  // Validation
  validateConnectionConfig,
  validatePoolConfig,

  // Constants
  DEFAULT_POSTGRES_PORT,
  DEFAULT_CONNECT_TIMEOUT,
  DEFAULT_ACQUIRE_TIMEOUT,
  DEFAULT_IDLE_TIMEOUT,
  DEFAULT_MAX_LIFETIME,
  DEFAULT_HEALTH_CHECK_INTERVAL,
  DEFAULT_MIN_CONNECTIONS,
  DEFAULT_MAX_CONNECTIONS,
} from './types/index.js';

// =============================================================================
// Connection Pool
// =============================================================================

export {
  ConnectionPool,
  PooledConnection,
  HealthCheckResult,
} from './pool/index.js';

// =============================================================================
// Query Execution
// =============================================================================

export {
  QueryExecutor,
  QueryResult,
  QueryOptions,
  QueryParam,
  QueryTarget,
  PreparedStatement,
} from './operations/query.js';

// =============================================================================
// Transaction Management
// =============================================================================

export {
  TransactionManager,
  Transaction,
  TransactionOptions,
} from './operations/transaction.js';

// =============================================================================
// Routing
// =============================================================================

export {
  QueryRouter,
  RoutingPolicy,
  RoutingDecision,
  RouteOptions,
  RoutingConfig,
  ReplicaHealth,
  DEFAULT_ROUTING_CONFIG,
  createDefaultRouter,
  createReplicaPreferringRouter,
  createLeastConnectionsRouter,
} from './router/index.js';

// =============================================================================
// Errors
// =============================================================================

export {
  // Base error
  PgError,
  PgErrorCode,
  SqlState,
  PgErrorResponse,

  // Configuration errors
  ConfigurationError,
  NoCredentialsError,
  InvalidConnectionStringError,

  // Connection errors
  ConnectionFailedError,
  AcquireTimeoutError,
  PoolExhaustedError,
  TlsError,

  // Authentication errors
  AuthenticationFailedError,
  InvalidPasswordError,

  // Query errors
  ExecutionError,
  NoRowsError,
  TooManyRowsError,
  QueryTimeoutError,
  ParamCountMismatchError,
  QueryCanceledError,

  // Transaction errors
  SerializationFailureError,
  DeadlockDetectedError,
  TransactionAbortedError,
  InvalidSavepointError,
  TransactionRollbackError,

  // Type errors
  UnsupportedTypeError,
  ConversionError,
  NullValueError,
  InvalidJsonError,
  NumericValueOutOfRangeError,

  // Constraint errors
  UniqueViolationError,
  ForeignKeyViolationError,
  CheckViolationError,
  NotNullViolationError,

  // Object errors
  UndefinedTableError,
  UndefinedColumnError,
  UndefinedFunctionError,
  InvalidIdentifierError,

  // Syntax errors
  SyntaxError,
  InsufficientPrivilegeError,

  // Protocol errors
  UnexpectedMessageError,
  InvalidResponseError,
  ProtocolVersionMismatchError,

  // Simulation errors
  SimulationMismatchError,
  SimulatedError,
  RecordingNotFoundError,

  // Circuit breaker errors
  CircuitBreakerOpenError,

  // Utilities
  parsePostgresError,
  isPgError,
  isRetryableError,
  getRetryDelayMs,
  getConstraintName,
  getTableName,
  getColumnName,
} from './errors/index.js';

// =============================================================================
// Observability
// =============================================================================

export {
  // Interfaces
  Observability,
  Logger,
  MetricsCollector,
  Tracer,
  SpanContext,
  SpanStatus,

  // Logger implementations
  LogLevel,
  LogEntry,
  ConsoleLogger,
  NoopLogger,
  InMemoryLogger,

  // Metrics implementations
  MetricNames,
  MetricEntry,
  NoopMetricsCollector,
  InMemoryMetricsCollector,

  // Tracer implementations
  NoopTracer,
  InMemoryTracer,
  InMemorySpanContext,

  // Factories
  createNoopObservability,
  createInMemoryObservability,
  createConsoleObservability,
} from './observability/index.js';

// =============================================================================
// Resilience
// =============================================================================

export {
  // Configuration
  RetryConfig,
  CircuitBreakerConfig,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,

  // State
  CircuitBreakerState,

  // Components
  CircuitBreaker,
  RetryExecutor,
  ResilienceOrchestrator,
} from './resilience/index.js';

// =============================================================================
// Simulation
// =============================================================================

export {
  // Mode
  SimulationMode,

  // Types
  Recording,
  SerializedError,
  RecordingStore,

  // Implementations
  InMemoryRecordingStore,
  FileRecordingStore,
  SimulationInterceptor,

  // Errors
  SimulationMismatchError as SimulationMismatchErrorClass,
  RecordingNotFoundError as RecordingNotFoundErrorClass,

  // Utilities
  normalizeQuery,
} from './simulation/index.js';
