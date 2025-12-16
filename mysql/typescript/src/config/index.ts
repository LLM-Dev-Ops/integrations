/**
 * Configuration module for MySQL integration.
 * @module config
 */

// Note: Types will be imported from '../types/index.js' once that module is created
// For now, we define the necessary types inline

/**
 * SSL/TLS mode for MySQL connections.
 */
export enum SslMode {
  /** SSL is disabled */
  Disabled = 'DISABLED',
  /** SSL is preferred but not required */
  Preferred = 'PREFERRED',
  /** SSL is required */
  Required = 'REQUIRED',
  /** SSL is required and CA certificate must be verified */
  VerifyCA = 'VERIFY_CA',
  /** SSL is required and full certificate chain must be verified */
  VerifyIdentity = 'VERIFY_IDENTITY',
}

/**
 * Load balancing strategy for replica connections.
 */
export enum LoadBalanceStrategy {
  /** Simple round-robin distribution */
  RoundRobin = 'ROUND_ROBIN',
  /** Random selection */
  Random = 'RANDOM',
  /** Route to replica with least active connections */
  LeastConnections = 'LEAST_CONNECTIONS',
  /** Weighted round-robin based on replica weights */
  WeightedRoundRobin = 'WEIGHTED_ROUND_ROBIN',
}

/**
 * MySQL connection configuration.
 */
export interface ConnectionConfig {
  /** Database host */
  host: string;
  /** Database port (default: 3306) */
  port: number;
  /** Database name */
  database: string;
  /** Database username */
  username: string;
  /** Database password */
  password: string;
  /** SSL/TLS mode */
  sslMode: SslMode;
  /** Path to SSL CA certificate */
  sslCa?: string;
  /** Path to SSL client certificate */
  sslCert?: string;
  /** Path to SSL client key */
  sslKey?: string;
  /** Character set (default: utf8mb4) */
  charset: string;
  /** Collation (default: utf8mb4_unicode_ci) */
  collation: string;
  /** Timezone for connection */
  timezone?: string;
  /** Connection timeout in milliseconds */
  connectTimeout: number;
  /** Read timeout in milliseconds */
  readTimeout?: number;
  /** Write timeout in milliseconds */
  writeTimeout?: number;
}

/**
 * Connection pool configuration.
 */
export interface PoolConfig {
  /** Minimum number of connections to maintain */
  minConnections: number;
  /** Maximum number of connections allowed */
  maxConnections: number;
  /** Timeout for acquiring a connection from pool (ms) */
  acquireTimeout: number;
  /** Timeout before closing idle connections (ms) */
  idleTimeout: number;
  /** Maximum lifetime of a connection (ms) */
  maxLifetime: number;
  /** Interval for connection health checks (ms) */
  validationInterval: number;
  /** SQL query used for validation */
  validationQuery: string;
}

/**
 * Replica endpoint configuration.
 */
export interface ReplicaEndpoint {
  /** Connection configuration for this replica */
  config: ConnectionConfig;
  /** Weight for load balancing (default: 1) */
  weight: number;
  /** Priority for failover (default: 0) */
  priority: number;
}

/**
 * Replica configuration for read/write separation.
 */
export interface ReplicaConfig {
  /** Primary (write) endpoint configuration */
  primary: ConnectionConfig;
  /** Replica (read) endpoints */
  replicas: ReplicaEndpoint[];
  /** Load balancing strategy */
  loadBalanceStrategy: LoadBalanceStrategy;
  /** Maximum acceptable replica lag in milliseconds */
  maxReplicaLagMs: number;
}

/**
 * Complete MySQL client configuration.
 */
export interface MysqlConfig {
  /** Primary database connection configuration */
  connection: ConnectionConfig;
  /** Connection pool configuration */
  pool: PoolConfig;
  /** Replica configuration (optional) */
  replica?: ReplicaConfig;
  /** Default query timeout in milliseconds */
  defaultQueryTimeoutMs: number;
  /** Maximum query size in bytes */
  maxQuerySizeBytes: number;
  /** Batch size for streaming results */
  streamBatchSize: number;
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Circuit breaker failure threshold */
  circuitBreakerThreshold: number;
  /** Circuit breaker timeout in milliseconds */
  circuitBreakerTimeoutMs: number;
  /** Enable query logging */
  logQueries: boolean;
  /** Threshold for logging slow queries (ms) */
  slowQueryThresholdMs: number;
  /** Automatically route read queries to replicas */
  autoRouteReads: boolean;
  /** Execute all transactions on primary */
  transactionOnPrimary: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/** Default MySQL port */
export const DEFAULT_MYSQL_PORT = 3306;

/** Default character set */
export const DEFAULT_CHARSET = 'utf8mb4';

/** Default collation */
export const DEFAULT_COLLATION = 'utf8mb4_unicode_ci';

/** Default connection timeout (10 seconds) */
export const DEFAULT_CONNECT_TIMEOUT = 10000;

/** Default read timeout */
export const DEFAULT_READ_TIMEOUT = undefined;

/** Default write timeout */
export const DEFAULT_WRITE_TIMEOUT = undefined;

/** Default minimum pool connections */
export const DEFAULT_MIN_CONNECTIONS = 5;

/** Default maximum pool connections */
export const DEFAULT_MAX_CONNECTIONS = 20;

/** Default connection acquire timeout (30 seconds) */
export const DEFAULT_ACQUIRE_TIMEOUT = 30000;

/** Default idle timeout (10 minutes) */
export const DEFAULT_IDLE_TIMEOUT = 600000;

/** Default max connection lifetime (30 minutes) */
export const DEFAULT_MAX_LIFETIME = 1800000;

/** Default validation interval (30 seconds) */
export const DEFAULT_VALIDATION_INTERVAL = 30000;

/** Default validation query */
export const DEFAULT_VALIDATION_QUERY = 'SELECT 1';

/** Default query timeout (30 seconds) */
export const DEFAULT_QUERY_TIMEOUT = 30000;

/** Default maximum query size (16 MB) */
export const DEFAULT_MAX_QUERY_SIZE = 16777216;

/** Default stream batch size */
export const DEFAULT_STREAM_BATCH_SIZE = 1000;

/** Default max retries */
export const DEFAULT_MAX_RETRIES = 3;

/** Default circuit breaker threshold */
export const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 5;

/** Default circuit breaker timeout (60 seconds) */
export const DEFAULT_CIRCUIT_BREAKER_TIMEOUT = 60000;

/** Default log queries setting */
export const DEFAULT_LOG_QUERIES = false;

/** Default slow query threshold (1 second) */
export const DEFAULT_SLOW_QUERY_THRESHOLD = 1000;

/** Default auto route reads setting */
export const DEFAULT_AUTO_ROUTE_READS = true;

/** Default transaction on primary setting */
export const DEFAULT_TRANSACTION_ON_PRIMARY = true;

/** Default replica weight */
export const DEFAULT_REPLICA_WEIGHT = 1;

/** Default replica priority */
export const DEFAULT_REPLICA_PRIORITY = 0;

/** Default max replica lag (1 second) */
export const DEFAULT_MAX_REPLICA_LAG = 1000;

/** Default load balance strategy */
export const DEFAULT_LOAD_BALANCE_STRATEGY = LoadBalanceStrategy.RoundRobin;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validates a connection configuration.
 *
 * @param config - Connection configuration to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validateConnectionConfig(config: ConnectionConfig): string[] {
  const errors: string[] = [];

  if (!config.host || config.host.trim().length === 0) {
    errors.push('Host is required');
  }

  if (config.port <= 0 || config.port > 65535) {
    errors.push('Port must be between 1 and 65535');
  }

  if (!config.database || config.database.trim().length === 0) {
    errors.push('Database name is required');
  }

  if (!config.username || config.username.trim().length === 0) {
    errors.push('Username is required');
  }

  if (!config.password) {
    errors.push('Password is required');
  }

  if (!config.charset || config.charset.trim().length === 0) {
    errors.push('Charset is required');
  }

  if (!config.collation || config.collation.trim().length === 0) {
    errors.push('Collation is required');
  }

  if (config.connectTimeout < 0) {
    errors.push('Connect timeout cannot be negative');
  }

  if (config.readTimeout !== undefined && config.readTimeout < 0) {
    errors.push('Read timeout cannot be negative');
  }

  if (config.writeTimeout !== undefined && config.writeTimeout < 0) {
    errors.push('Write timeout cannot be negative');
  }

  return errors;
}

/**
 * Validates a pool configuration.
 *
 * @param config - Pool configuration to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validatePoolConfig(config: PoolConfig): string[] {
  const errors: string[] = [];

  if (config.minConnections < 0) {
    errors.push('Minimum connections cannot be negative');
  }

  if (config.maxConnections < 1) {
    errors.push('Maximum connections must be at least 1');
  }

  if (config.minConnections > config.maxConnections) {
    errors.push('Minimum connections cannot exceed maximum connections');
  }

  if (config.acquireTimeout < 0) {
    errors.push('Acquire timeout cannot be negative');
  }

  if (config.idleTimeout < 0) {
    errors.push('Idle timeout cannot be negative');
  }

  if (config.maxLifetime < 0) {
    errors.push('Max lifetime cannot be negative');
  }

  if (config.validationInterval < 0) {
    errors.push('Validation interval cannot be negative');
  }

  if (!config.validationQuery || config.validationQuery.trim().length === 0) {
    errors.push('Validation query is required');
  }

  return errors;
}

/**
 * Validates a replica configuration.
 *
 * @param config - Replica configuration to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validateReplicaConfig(config: ReplicaConfig): string[] {
  const errors: string[] = [];

  // Validate primary
  const primaryErrors = validateConnectionConfig(config.primary);
  errors.push(...primaryErrors.map(err => `Primary: ${err}`));

  // Validate replicas
  if (!config.replicas || config.replicas.length === 0) {
    errors.push('At least one replica is required');
  } else {
    config.replicas.forEach((replica, index) => {
      const replicaErrors = validateConnectionConfig(replica.config);
      errors.push(...replicaErrors.map(err => `Replica ${index}: ${err}`));

      if (replica.weight < 0) {
        errors.push(`Replica ${index}: Weight cannot be negative`);
      }

      if (replica.priority < 0) {
        errors.push(`Replica ${index}: Priority cannot be negative`);
      }
    });
  }

  if (config.maxReplicaLagMs < 0) {
    errors.push('Max replica lag cannot be negative');
  }

  return errors;
}

/**
 * Validates complete MySQL configuration.
 *
 * @param config - Configuration to validate
 * @throws {Error} If configuration is invalid
 */
export function validateMysqlConfig(config: MysqlConfig): void {
  const errors: string[] = [];

  // Validate connection
  errors.push(...validateConnectionConfig(config.connection));

  // Validate pool
  errors.push(...validatePoolConfig(config.pool));

  // Validate replica if present
  if (config.replica) {
    errors.push(...validateReplicaConfig(config.replica));
  }

  // Validate query settings
  if (config.defaultQueryTimeoutMs < 0) {
    errors.push('Default query timeout cannot be negative');
  }

  if (config.defaultQueryTimeoutMs > 300000) {
    errors.push('Default query timeout exceeds maximum of 5 minutes (300000ms)');
  }

  if (config.maxQuerySizeBytes < 0) {
    errors.push('Max query size cannot be negative');
  }

  if (config.streamBatchSize < 1) {
    errors.push('Stream batch size must be at least 1');
  }

  // Validate resilience settings
  if (config.maxRetries < 0) {
    errors.push('Max retries cannot be negative');
  }

  if (config.circuitBreakerThreshold < 1) {
    errors.push('Circuit breaker threshold must be at least 1');
  }

  if (config.circuitBreakerTimeoutMs < 0) {
    errors.push('Circuit breaker timeout cannot be negative');
  }

  // Validate tracing settings
  if (config.slowQueryThresholdMs < 0) {
    errors.push('Slow query threshold cannot be negative');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed: ${errors.join('; ')}`);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a default connection configuration.
 *
 * @param overrides - Partial configuration to override defaults
 * @returns Complete connection configuration with defaults
 */
export function createDefaultConnectionConfig(
  overrides: Partial<ConnectionConfig> & Pick<ConnectionConfig, 'host' | 'database' | 'username' | 'password'>
): ConnectionConfig {
  return {
    port: DEFAULT_MYSQL_PORT,
    sslMode: SslMode.Preferred,
    charset: DEFAULT_CHARSET,
    collation: DEFAULT_COLLATION,
    connectTimeout: DEFAULT_CONNECT_TIMEOUT,
    ...overrides,
  };
}

/**
 * Creates a default pool configuration.
 *
 * @param overrides - Partial configuration to override defaults
 * @returns Complete pool configuration with defaults
 */
export function createDefaultPoolConfig(overrides?: Partial<PoolConfig>): PoolConfig {
  return {
    minConnections: DEFAULT_MIN_CONNECTIONS,
    maxConnections: DEFAULT_MAX_CONNECTIONS,
    acquireTimeout: DEFAULT_ACQUIRE_TIMEOUT,
    idleTimeout: DEFAULT_IDLE_TIMEOUT,
    maxLifetime: DEFAULT_MAX_LIFETIME,
    validationInterval: DEFAULT_VALIDATION_INTERVAL,
    validationQuery: DEFAULT_VALIDATION_QUERY,
    ...overrides,
  };
}

/**
 * Creates a default replica endpoint configuration.
 *
 * @param config - Connection configuration for the replica
 * @param overrides - Partial configuration to override defaults
 * @returns Complete replica endpoint configuration with defaults
 */
export function createDefaultReplicaEndpoint(
  config: ConnectionConfig,
  overrides?: Partial<Omit<ReplicaEndpoint, 'config'>>
): ReplicaEndpoint {
  return {
    config,
    weight: DEFAULT_REPLICA_WEIGHT,
    priority: DEFAULT_REPLICA_PRIORITY,
    ...overrides,
  };
}

/**
 * Creates a default replica configuration.
 *
 * @param primary - Primary connection configuration
 * @param replicas - Replica endpoint configurations
 * @param overrides - Partial configuration to override defaults
 * @returns Complete replica configuration with defaults
 */
export function createDefaultReplicaConfig(
  primary: ConnectionConfig,
  replicas: ReplicaEndpoint[],
  overrides?: Partial<Omit<ReplicaConfig, 'primary' | 'replicas'>>
): ReplicaConfig {
  return {
    primary,
    replicas,
    loadBalanceStrategy: DEFAULT_LOAD_BALANCE_STRATEGY,
    maxReplicaLagMs: DEFAULT_MAX_REPLICA_LAG,
    ...overrides,
  };
}

// ============================================================================
// Connection String Functions
// ============================================================================

/**
 * Parses a MySQL connection string into ConnectionConfig.
 *
 * Supports formats:
 * - mysql://user:password@host:port/database
 * - mysql://user:password@host:port/database?option1=value1&option2=value2
 *
 * Supported query parameters:
 * - charset: Character set (default: utf8mb4)
 * - collation: Collation (default: utf8mb4_unicode_ci)
 * - timezone: Connection timezone
 * - sslmode: SSL mode (disable, prefer, require, verify-ca, verify-identity)
 * - connect_timeout: Connection timeout in seconds
 * - read_timeout: Read timeout in seconds
 * - write_timeout: Write timeout in seconds
 *
 * @param connectionString - MySQL connection string
 * @returns Parsed connection configuration
 * @throws {Error} If connection string is invalid
 */
export function parseConnectionString(connectionString: string): ConnectionConfig {
  try {
    const url = new URL(connectionString);

    if (url.protocol !== 'mysql:') {
      throw new Error('Protocol must be mysql://');
    }

    if (!url.username) {
      throw new Error('Username is required');
    }

    if (!url.password) {
      throw new Error('Password is required');
    }

    if (!url.hostname) {
      throw new Error('Hostname is required');
    }

    const database = url.pathname.slice(1); // Remove leading slash
    if (!database) {
      throw new Error('Database name is required');
    }

    // Parse query parameters
    const params = url.searchParams;

    // Parse SSL mode
    let sslMode = SslMode.Preferred;
    if (params.has('sslmode')) {
      const mode = params.get('sslmode')!;
      switch (mode.toLowerCase()) {
        case 'disable':
        case 'disabled':
          sslMode = SslMode.Disabled;
          break;
        case 'prefer':
        case 'preferred':
          sslMode = SslMode.Preferred;
          break;
        case 'require':
        case 'required':
          sslMode = SslMode.Required;
          break;
        case 'verify-ca':
        case 'verify_ca':
          sslMode = SslMode.VerifyCA;
          break;
        case 'verify-identity':
        case 'verify_identity':
          sslMode = SslMode.VerifyIdentity;
          break;
        default:
          throw new Error(`Invalid SSL mode: ${mode}`);
      }
    }

    const config: ConnectionConfig = {
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : DEFAULT_MYSQL_PORT,
      database,
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      sslMode,
      charset: params.get('charset') || DEFAULT_CHARSET,
      collation: params.get('collation') || DEFAULT_COLLATION,
      connectTimeout: params.has('connect_timeout')
        ? parseInt(params.get('connect_timeout')!, 10) * 1000
        : DEFAULT_CONNECT_TIMEOUT,
    };

    // Optional parameters
    if (params.has('timezone')) {
      config.timezone = params.get('timezone')!;
    }

    if (params.has('read_timeout')) {
      config.readTimeout = parseInt(params.get('read_timeout')!, 10) * 1000;
    }

    if (params.has('write_timeout')) {
      config.writeTimeout = parseInt(params.get('write_timeout')!, 10) * 1000;
    }

    if (params.has('ssl_ca')) {
      config.sslCa = params.get('ssl_ca')!;
    }

    if (params.has('ssl_cert')) {
      config.sslCert = params.get('ssl_cert')!;
    }

    if (params.has('ssl_key')) {
      config.sslKey = params.get('ssl_key')!;
    }

    // Validate the parsed configuration
    const errors = validateConnectionConfig(config);
    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }

    return config;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('Invalid URL')) {
      throw new Error(`Invalid connection string format: ${connectionString}`);
    }
    throw new Error(
      `Failed to parse connection string: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Converts ConnectionConfig to a MySQL connection string.
 *
 * SECURITY NOTE: The returned string contains the password in plain text.
 * Only use for internal purposes, never log or expose.
 *
 * @param config - Connection configuration
 * @returns MySQL connection string
 */
export function toConnectionString(config: ConnectionConfig): string {
  const url = new URL('mysql://localhost');
  url.hostname = config.host;
  url.port = config.port.toString();
  url.username = encodeURIComponent(config.username);
  url.password = encodeURIComponent(config.password);
  url.pathname = `/${config.database}`;

  // Add query parameters
  if (config.charset !== DEFAULT_CHARSET) {
    url.searchParams.set('charset', config.charset);
  }

  if (config.collation !== DEFAULT_COLLATION) {
    url.searchParams.set('collation', config.collation);
  }

  if (config.timezone) {
    url.searchParams.set('timezone', config.timezone);
  }

  // SSL mode
  const sslModeMap: Record<SslMode, string> = {
    [SslMode.Disabled]: 'disable',
    [SslMode.Preferred]: 'prefer',
    [SslMode.Required]: 'require',
    [SslMode.VerifyCA]: 'verify-ca',
    [SslMode.VerifyIdentity]: 'verify-identity',
  };
  if (config.sslMode !== SslMode.Preferred) {
    url.searchParams.set('sslmode', sslModeMap[config.sslMode]);
  }

  if (config.connectTimeout !== DEFAULT_CONNECT_TIMEOUT) {
    url.searchParams.set('connect_timeout', Math.floor(config.connectTimeout / 1000).toString());
  }

  if (config.readTimeout !== undefined) {
    url.searchParams.set('read_timeout', Math.floor(config.readTimeout / 1000).toString());
  }

  if (config.writeTimeout !== undefined) {
    url.searchParams.set('write_timeout', Math.floor(config.writeTimeout / 1000).toString());
  }

  if (config.sslCa) {
    url.searchParams.set('ssl_ca', config.sslCa);
  }

  if (config.sslCert) {
    url.searchParams.set('ssl_cert', config.sslCert);
  }

  if (config.sslKey) {
    url.searchParams.set('ssl_key', config.sslKey);
  }

  return url.toString();
}

/**
 * Redacts sensitive information from connection configuration for safe logging.
 *
 * @param config - Connection configuration
 * @returns Redacted configuration safe for logging
 */
export function redactConfig(config: ConnectionConfig): Omit<ConnectionConfig, 'password'> & { password: string } {
  return {
    ...config,
    password: '[REDACTED]',
  };
}

/**
 * Redacts sensitive information from complete MySQL configuration for safe logging.
 *
 * @param config - MySQL configuration
 * @returns Redacted configuration safe for logging
 */
export function redactMysqlConfig(
  config: MysqlConfig
): Omit<MysqlConfig, 'connection' | 'replica'> & {
  connection: ReturnType<typeof redactConfig>;
  replica?: Omit<ReplicaConfig, 'primary' | 'replicas'> & {
    primary: ReturnType<typeof redactConfig>;
    replicas: Array<Omit<ReplicaEndpoint, 'config'> & { config: ReturnType<typeof redactConfig> }>;
  };
} {
  const redacted: any = {
    ...config,
    connection: redactConfig(config.connection),
  };

  if (config.replica) {
    redacted.replica = {
      ...config.replica,
      primary: redactConfig(config.replica.primary),
      replicas: config.replica.replicas.map(replica => ({
        ...replica,
        config: redactConfig(replica.config),
      })),
    };
  }

  return redacted;
}

// ============================================================================
// Config Builder
// ============================================================================

/**
 * Fluent builder for constructing MySQL configurations.
 *
 * @example
 * ```typescript
 * const config = new MysqlConfigBuilder()
 *   .withConnection({
 *     host: 'localhost',
 *     database: 'mydb',
 *     username: 'user',
 *     password: 'pass'
 *   })
 *   .withPool({ maxConnections: 50 })
 *   .withQueryTimeout(60000)
 *   .build();
 * ```
 */
export class MysqlConfigBuilder {
  private config: Partial<MysqlConfig> = {};

  /**
   * Sets the connection configuration.
   *
   * @param connection - Connection configuration
   * @returns This builder for chaining
   */
  withConnection(
    connection: Partial<ConnectionConfig> & Pick<ConnectionConfig, 'host' | 'database' | 'username' | 'password'>
  ): this {
    this.config.connection = createDefaultConnectionConfig(connection);
    return this;
  }

  /**
   * Sets the connection configuration from a connection string.
   *
   * @param connectionString - MySQL connection string
   * @returns This builder for chaining
   */
  withConnectionString(connectionString: string): this {
    this.config.connection = parseConnectionString(connectionString);
    return this;
  }

  /**
   * Sets the pool configuration.
   *
   * @param pool - Pool configuration
   * @returns This builder for chaining
   */
  withPool(pool?: Partial<PoolConfig>): this {
    this.config.pool = createDefaultPoolConfig(pool);
    return this;
  }

  /**
   * Sets the replica configuration.
   *
   * @param replica - Replica configuration
   * @returns This builder for chaining
   */
  withReplica(replica: ReplicaConfig): this {
    this.config.replica = replica;
    return this;
  }

  /**
   * Sets the default query timeout.
   *
   * @param timeoutMs - Timeout in milliseconds
   * @returns This builder for chaining
   */
  withQueryTimeout(timeoutMs: number): this {
    this.config.defaultQueryTimeoutMs = timeoutMs;
    return this;
  }

  /**
   * Sets the maximum query size.
   *
   * @param sizeBytes - Size in bytes
   * @returns This builder for chaining
   */
  withMaxQuerySize(sizeBytes: number): this {
    this.config.maxQuerySizeBytes = sizeBytes;
    return this;
  }

  /**
   * Sets the stream batch size.
   *
   * @param batchSize - Batch size
   * @returns This builder for chaining
   */
  withStreamBatchSize(batchSize: number): this {
    this.config.streamBatchSize = batchSize;
    return this;
  }

  /**
   * Sets the maximum retry attempts.
   *
   * @param maxRetries - Maximum retries
   * @returns This builder for chaining
   */
  withMaxRetries(maxRetries: number): this {
    this.config.maxRetries = maxRetries;
    return this;
  }

  /**
   * Sets the circuit breaker configuration.
   *
   * @param threshold - Failure threshold
   * @param timeoutMs - Timeout in milliseconds
   * @returns This builder for chaining
   */
  withCircuitBreaker(threshold: number, timeoutMs: number): this {
    this.config.circuitBreakerThreshold = threshold;
    this.config.circuitBreakerTimeoutMs = timeoutMs;
    return this;
  }

  /**
   * Enables or disables query logging.
   *
   * @param enabled - Whether to log queries
   * @returns This builder for chaining
   */
  withQueryLogging(enabled: boolean): this {
    this.config.logQueries = enabled;
    return this;
  }

  /**
   * Sets the slow query threshold.
   *
   * @param thresholdMs - Threshold in milliseconds
   * @returns This builder for chaining
   */
  withSlowQueryThreshold(thresholdMs: number): this {
    this.config.slowQueryThresholdMs = thresholdMs;
    return this;
  }

  /**
   * Enables or disables automatic read routing.
   *
   * @param enabled - Whether to auto-route reads
   * @returns This builder for chaining
   */
  withAutoRouteReads(enabled: boolean): this {
    this.config.autoRouteReads = enabled;
    return this;
  }

  /**
   * Enables or disables transactions on primary.
   *
   * @param enabled - Whether to execute transactions on primary
   * @returns This builder for chaining
   */
  withTransactionOnPrimary(enabled: boolean): this {
    this.config.transactionOnPrimary = enabled;
    return this;
  }

  /**
   * Builds and validates the configuration.
   *
   * @returns Complete MySQL configuration
   * @throws {Error} If configuration is invalid or incomplete
   */
  build(): MysqlConfig {
    if (!this.config.connection) {
      throw new Error('Connection configuration is required');
    }

    const fullConfig: MysqlConfig = {
      connection: this.config.connection,
      pool: this.config.pool || createDefaultPoolConfig(),
      replica: this.config.replica,
      defaultQueryTimeoutMs: this.config.defaultQueryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT,
      maxQuerySizeBytes: this.config.maxQuerySizeBytes ?? DEFAULT_MAX_QUERY_SIZE,
      streamBatchSize: this.config.streamBatchSize ?? DEFAULT_STREAM_BATCH_SIZE,
      maxRetries: this.config.maxRetries ?? DEFAULT_MAX_RETRIES,
      circuitBreakerThreshold: this.config.circuitBreakerThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
      circuitBreakerTimeoutMs: this.config.circuitBreakerTimeoutMs ?? DEFAULT_CIRCUIT_BREAKER_TIMEOUT,
      logQueries: this.config.logQueries ?? DEFAULT_LOG_QUERIES,
      slowQueryThresholdMs: this.config.slowQueryThresholdMs ?? DEFAULT_SLOW_QUERY_THRESHOLD,
      autoRouteReads: this.config.autoRouteReads ?? DEFAULT_AUTO_ROUTE_READS,
      transactionOnPrimary: this.config.transactionOnPrimary ?? DEFAULT_TRANSACTION_ON_PRIMARY,
    };

    validateMysqlConfig(fullConfig);

    return fullConfig;
  }
}
