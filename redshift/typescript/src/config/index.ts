/**
 * Redshift Integration Configuration
 *
 * Configuration types and builders for the Redshift integration module.
 * @module @llmdevops/redshift-integration/config
 */

import type { SimulationMode } from '../types/index.js';
import { ConfigurationError, MissingConfigurationError } from '../errors/index.js';

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_PORT = 5439;
export const DEFAULT_CONNECT_TIMEOUT_MS = 30000;
export const DEFAULT_QUERY_TIMEOUT_MS = 300000;
export const DEFAULT_POOL_MIN = 2;
export const DEFAULT_POOL_MAX = 10;
export const DEFAULT_POOL_ACQUIRE_TIMEOUT_MS = 30000;
export const DEFAULT_POOL_IDLE_TIMEOUT_MS = 600000;
export const DEFAULT_POOL_MAX_LIFETIME_MS = 1800000;
export const DEFAULT_RETRY_MAX_ATTEMPTS = 3;
export const DEFAULT_RETRY_BASE_DELAY_MS = 1000;
export const DEFAULT_RETRY_MAX_DELAY_MS = 30000;
export const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 5;
export const DEFAULT_CIRCUIT_BREAKER_TIMEOUT_MS = 60000;

// ============================================================================
// SSL Configuration
// ============================================================================

/**
 * SSL mode for connections.
 */
export type SslMode = 'disable' | 'require' | 'verify-ca' | 'verify-full';

// ============================================================================
// Credential Types
// ============================================================================

/**
 * IAM role-based authentication.
 */
export interface IamRoleCredentials {
  type: 'iam_role';
  /** ARN of the IAM role to assume */
  roleArn: string;
  /** Optional external ID for role assumption */
  externalId?: string;
  /** Optional session name */
  sessionName?: string;
  /** Optional duration in seconds */
  durationSeconds?: number;
}

/**
 * IAM user-based authentication.
 */
export interface IamUserCredentials {
  type: 'iam_user';
  /** AWS access key ID */
  accessKeyId: string;
  /** AWS secret access key */
  secretAccessKey: string;
  /** Optional session token for temporary credentials */
  sessionToken?: string;
}

/**
 * Database username/password authentication.
 */
export interface DatabaseAuthCredentials {
  type: 'database';
  /** Database username */
  username: string;
  /** Database password */
  password: string;
}

/**
 * AWS Secrets Manager authentication.
 */
export interface SecretsManagerCredentials {
  type: 'secrets_manager';
  /** Secret ID or ARN */
  secretId: string;
  /** Optional AWS region */
  region?: string;
}

/**
 * Union type for all credential sources.
 */
export type CredentialSource =
  | IamRoleCredentials
  | IamUserCredentials
  | DatabaseAuthCredentials
  | SecretsManagerCredentials;

// ============================================================================
// Endpoint Configuration
// ============================================================================

/**
 * Redshift cluster endpoint configuration.
 */
export interface RedshiftEndpoint {
  /** Cluster hostname */
  host: string;
  /** Port number (default: 5439) */
  port?: number;
  /** Database name */
  database: string;
  /** SSL mode */
  sslMode?: SslMode;
  /** CA certificate for SSL verification */
  caCert?: string;
}

// ============================================================================
// Pool Configuration
// ============================================================================

/**
 * Connection pool configuration.
 */
export interface PoolConfig {
  /** Minimum number of connections */
  minConnections?: number;
  /** Maximum number of connections */
  maxConnections?: number;
  /** Timeout for acquiring a connection in milliseconds */
  acquireTimeoutMs?: number;
  /** Idle timeout before connection is closed in milliseconds */
  idleTimeoutMs?: number;
  /** Maximum connection lifetime in milliseconds */
  maxLifetimeMs?: number;
  /** Health check interval in milliseconds */
  healthCheckIntervalMs?: number;
  /** Validation query */
  validationQuery?: string;
}

// ============================================================================
// Retry Configuration
// ============================================================================

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts?: number;
  /** Base delay between retries in milliseconds */
  baseDelayMs?: number;
  /** Maximum delay between retries in milliseconds */
  maxDelayMs?: number;
  /** Exponential backoff multiplier */
  multiplier?: number;
  /** Jitter factor (0-1) */
  jitter?: number;
  /** Error codes to retry on */
  retryOnCodes?: string[];
}

// ============================================================================
// Circuit Breaker Configuration
// ============================================================================

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold?: number;
  /** Time to wait before attempting reset in milliseconds */
  resetTimeoutMs?: number;
  /** Number of successes to close circuit */
  successThreshold?: number;
  /** Sliding window size */
  windowSize?: number;
}

// ============================================================================
// COPY Configuration
// ============================================================================

/**
 * COPY command configuration.
 */
export interface CopyConfig {
  /** Default IAM role for COPY operations */
  defaultIamRole?: string;
  /** Maximum number of errors allowed before failing */
  maxErrors?: number;
  /** Default compression type */
  defaultCompression?: 'GZIP' | 'BZIP2' | 'LZOP' | 'ZSTD' | 'AUTO' | 'NONE';
  /** Default delimiter for CSV files */
  defaultDelimiter?: string;
  /** Default escape character */
  defaultEscape?: string;
  /** Default null string */
  defaultNullAs?: string;
  /** Enable statistics collection */
  collectStatistics?: boolean;
}

// ============================================================================
// UNLOAD Configuration
// ============================================================================

/**
 * UNLOAD command configuration.
 */
export interface UnloadConfig {
  /** Default IAM role for UNLOAD operations */
  defaultIamRole?: string;
  /** Default compression type */
  defaultCompression?: 'GZIP' | 'BZIP2' | 'ZSTD' | 'NONE';
  /** Maximum file size in MB */
  maxFileSize?: number;
  /** Enable parallel unload */
  parallel?: boolean;
  /** Add header row */
  addHeader?: boolean;
  /** Default delimiter */
  defaultDelimiter?: string;
  /** Default null string */
  defaultNullAs?: string;
}

// ============================================================================
// WLM Configuration
// ============================================================================

/**
 * Workload Management (WLM) configuration.
 */
export interface WlmConfig {
  /** Default query group */
  defaultQueryGroup?: string;
  /** Concurrency limit for queries */
  concurrencyLimit?: number;
  /** Default query priority (lowest, low, normal, high, highest) */
  defaultPriority?: 'lowest' | 'low' | 'normal' | 'high' | 'highest';
  /** Query slot count */
  querySlotCount?: number;
  /** Memory percentage for query */
  memoryPercentage?: number;
}

// ============================================================================
// Observability Configuration
// ============================================================================

/**
 * Logging level.
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/**
 * Observability configuration.
 */
export interface ObservabilityConfig {
  /** Logging level */
  logLevel?: LogLevel;
  /** Enable query logging */
  logQueries?: boolean;
  /** Slow query threshold in milliseconds */
  slowQueryThresholdMs?: number;
  /** Enable metrics collection */
  enableMetrics?: boolean;
  /** Enable distributed tracing */
  enableTracing?: boolean;
  /** Metrics prefix */
  metricsPrefix?: string;
  /** Enable query plan logging */
  logQueryPlans?: boolean;
}

// ============================================================================
// Simulation Configuration
// ============================================================================

/**
 * Simulation configuration.
 */
export interface SimulationConfig {
  /** Simulation mode */
  mode: SimulationMode;
  /** Recording file path */
  recordingPath?: string;
  /** Replay strict mode (fail on unmatched queries) */
  strictMode?: boolean;
}

// ============================================================================
// Main Configuration
// ============================================================================

/**
 * Complete Redshift configuration.
 */
export interface RedshiftConfig {
  /** Cluster endpoint configuration */
  endpoint: RedshiftEndpoint;
  /** Credential source */
  credentials: CredentialSource;
  /** Pool configuration */
  pool?: PoolConfig;
  /** Retry configuration */
  retry?: RetryConfig;
  /** Circuit breaker configuration */
  circuitBreaker?: CircuitBreakerConfig;
  /** COPY configuration */
  copy?: CopyConfig;
  /** UNLOAD configuration */
  unload?: UnloadConfig;
  /** WLM configuration */
  wlm?: WlmConfig;
  /** Observability configuration */
  observability?: ObservabilityConfig;
  /** Simulation configuration */
  simulation?: SimulationConfig;
  /** Connection timeout in milliseconds */
  connectTimeoutMs?: number;
  /** Default query timeout in milliseconds */
  queryTimeoutMs?: number;
}

// ============================================================================
// Configuration Builder
// ============================================================================

/**
 * Builder for Redshift configuration with fluent API.
 */
export class RedshiftConfigBuilder {
  private config: Partial<RedshiftConfig> = {};

  /**
   * Sets the cluster endpoint.
   * @param host - Cluster hostname
   * @param database - Database name
   * @param port - Port number (default: 5439)
   */
  endpoint(host: string, database: string, port?: number): this {
    this.config.endpoint = {
      host,
      database,
      port: port ?? DEFAULT_PORT,
    };
    return this;
  }

  /**
   * Sets IAM role-based authentication.
   * @param roleArn - ARN of the IAM role
   * @param options - Additional IAM role options
   */
  withIamRole(
    roleArn: string,
    options?: {
      externalId?: string;
      sessionName?: string;
      durationSeconds?: number;
    }
  ): this {
    this.config.credentials = {
      type: 'iam_role',
      roleArn,
      ...options,
    };
    return this;
  }

  /**
   * Sets IAM user-based authentication.
   * @param accessKeyId - AWS access key ID
   * @param secretAccessKey - AWS secret access key
   * @param sessionToken - Optional session token
   */
  withIamUser(accessKeyId: string, secretAccessKey: string, sessionToken?: string): this {
    this.config.credentials = {
      type: 'iam_user',
      accessKeyId,
      secretAccessKey,
      sessionToken,
    };
    return this;
  }

  /**
   * Sets database username/password authentication.
   * @param username - Database username
   * @param password - Database password
   */
  withDatabaseAuth(username: string, password: string): this {
    this.config.credentials = {
      type: 'database',
      username,
      password,
    };
    return this;
  }

  /**
   * Sets AWS Secrets Manager authentication.
   * @param secretId - Secret ID or ARN
   * @param region - Optional AWS region
   */
  withSecretsManager(secretId: string, region?: string): this {
    this.config.credentials = {
      type: 'secrets_manager',
      secretId,
      region,
    };
    return this;
  }

  /**
   * Sets connection pool size.
   * @param min - Minimum number of connections
   * @param max - Maximum number of connections
   */
  poolSize(min: number, max: number): this {
    this.config.pool = {
      ...this.config.pool,
      minConnections: min,
      maxConnections: max,
    };
    return this;
  }

  /**
   * Sets connection timeout.
   * @param timeoutMs - Timeout in milliseconds
   */
  connectionTimeout(timeoutMs: number): this {
    this.config.connectTimeoutMs = timeoutMs;
    return this;
  }

  /**
   * Sets default query timeout.
   * @param timeoutMs - Timeout in milliseconds
   */
  queryTimeout(timeoutMs: number): this {
    this.config.queryTimeoutMs = timeoutMs;
    return this;
  }

  /**
   * Sets default WLM query group.
   * @param queryGroup - Query group name
   */
  defaultQueryGroup(queryGroup: string): this {
    this.config.wlm = {
      ...this.config.wlm,
      defaultQueryGroup: queryGroup,
    };
    return this;
  }

  /**
   * Sets SSL mode.
   * @param mode - SSL mode
   * @param caCert - Optional CA certificate
   */
  sslMode(mode: SslMode, caCert?: string): this {
    this.config.endpoint = {
      ...this.config.endpoint!,
      sslMode: mode,
      caCert,
    };
    return this;
  }

  /**
   * Sets pool configuration.
   * @param config - Pool configuration
   */
  poolConfig(config: PoolConfig): this {
    this.config.pool = config;
    return this;
  }

  /**
   * Sets retry configuration.
   * @param config - Retry configuration
   */
  retryConfig(config: RetryConfig): this {
    this.config.retry = config;
    return this;
  }

  /**
   * Sets circuit breaker configuration.
   * @param config - Circuit breaker configuration
   */
  circuitBreakerConfig(config: CircuitBreakerConfig): this {
    this.config.circuitBreaker = config;
    return this;
  }

  /**
   * Sets COPY configuration.
   * @param config - COPY configuration
   */
  copyConfig(config: CopyConfig): this {
    this.config.copy = config;
    return this;
  }

  /**
   * Sets UNLOAD configuration.
   * @param config - UNLOAD configuration
   */
  unloadConfig(config: UnloadConfig): this {
    this.config.unload = config;
    return this;
  }

  /**
   * Sets WLM configuration.
   * @param config - WLM configuration
   */
  wlmConfig(config: WlmConfig): this {
    this.config.wlm = config;
    return this;
  }

  /**
   * Sets observability configuration.
   * @param config - Observability configuration
   */
  observabilityConfig(config: ObservabilityConfig): this {
    this.config.observability = config;
    return this;
  }

  /**
   * Sets simulation mode.
   * @param mode - Simulation mode
   * @param recordingPath - Path for recording/replay file
   */
  simulationMode(mode: SimulationMode, recordingPath?: string): this {
    this.config.simulation = {
      mode,
      recordingPath,
    };
    return this;
  }

  /**
   * Builds and validates the configuration.
   * @returns The validated configuration
   * @throws {MissingConfigurationError} If required configuration is missing
   * @throws {ConfigurationError} If configuration is invalid
   */
  build(): RedshiftConfig {
    if (!this.config.endpoint) {
      throw new MissingConfigurationError('endpoint');
    }
    if (!this.config.endpoint.host) {
      throw new MissingConfigurationError('endpoint.host');
    }
    if (!this.config.endpoint.database) {
      throw new MissingConfigurationError('endpoint.database');
    }
    if (!this.config.credentials) {
      throw new MissingConfigurationError('credentials');
    }

    const config: RedshiftConfig = {
      endpoint: this.config.endpoint,
      credentials: this.config.credentials,
      pool: this.config.pool,
      retry: this.config.retry,
      circuitBreaker: this.config.circuitBreaker,
      copy: this.config.copy,
      unload: this.config.unload,
      wlm: this.config.wlm,
      observability: this.config.observability,
      simulation: this.config.simulation,
      connectTimeoutMs: this.config.connectTimeoutMs,
      queryTimeoutMs: this.config.queryTimeoutMs,
    };

    // Validate the configuration
    validateConfig(config);

    return config;
  }
}

// ============================================================================
// Configuration from Environment
// ============================================================================

/**
 * Creates configuration from environment variables.
 *
 * Environment variables:
 * - REDSHIFT_HOST: Cluster hostname (required)
 * - REDSHIFT_PORT: Port number (default: 5439)
 * - REDSHIFT_DATABASE: Database name (required)
 * - REDSHIFT_SSL_MODE: SSL mode (disable, require, verify-ca, verify-full)
 * - REDSHIFT_CA_CERT: CA certificate for SSL verification
 *
 * Authentication (one of the following sets):
 * - REDSHIFT_IAM_ROLE: IAM role ARN
 * - REDSHIFT_IAM_EXTERNAL_ID: External ID for role assumption
 * - REDSHIFT_IAM_SESSION_NAME: Session name for role assumption
 *
 * - REDSHIFT_AWS_ACCESS_KEY_ID: AWS access key ID
 * - REDSHIFT_AWS_SECRET_ACCESS_KEY: AWS secret access key
 * - REDSHIFT_AWS_SESSION_TOKEN: AWS session token
 *
 * - REDSHIFT_USER: Database username
 * - REDSHIFT_PASSWORD: Database password
 *
 * - REDSHIFT_SECRET_ID: AWS Secrets Manager secret ID
 * - REDSHIFT_SECRET_REGION: AWS region for Secrets Manager
 *
 * Pool settings:
 * - REDSHIFT_POOL_MIN: Minimum connections (default: 2)
 * - REDSHIFT_POOL_MAX: Maximum connections (default: 10)
 * - REDSHIFT_POOL_ACQUIRE_TIMEOUT: Acquire timeout in ms
 * - REDSHIFT_POOL_IDLE_TIMEOUT: Idle timeout in ms
 * - REDSHIFT_POOL_MAX_LIFETIME: Max lifetime in ms
 *
 * Timeout settings:
 * - REDSHIFT_CONNECT_TIMEOUT: Connection timeout in ms
 * - REDSHIFT_QUERY_TIMEOUT: Query timeout in ms
 *
 * WLM settings:
 * - REDSHIFT_QUERY_GROUP: Default query group
 * - REDSHIFT_CONCURRENCY_LIMIT: Concurrency limit
 *
 * COPY/UNLOAD settings:
 * - REDSHIFT_COPY_IAM_ROLE: Default IAM role for COPY
 * - REDSHIFT_COPY_MAX_ERRORS: Max errors for COPY
 * - REDSHIFT_UNLOAD_IAM_ROLE: Default IAM role for UNLOAD
 *
 * Observability:
 * - REDSHIFT_LOG_LEVEL: Log level (trace, debug, info, warn, error)
 * - REDSHIFT_LOG_QUERIES: Enable query logging (true/false)
 * - REDSHIFT_ENABLE_METRICS: Enable metrics (true/false)
 * - REDSHIFT_ENABLE_TRACING: Enable tracing (true/false)
 *
 * Simulation:
 * - REDSHIFT_SIMULATION_MODE: Simulation mode (disabled, record, replay)
 * - REDSHIFT_SIMULATION_PATH: Path for recording/replay file
 *
 * @returns The configuration built from environment variables
 * @throws {MissingConfigurationError} If required environment variables are missing
 */
export function configFromEnvironment(): RedshiftConfig {
  const host = process.env['REDSHIFT_HOST'];
  const database = process.env['REDSHIFT_DATABASE'];
  const port = process.env['REDSHIFT_PORT'];

  if (!host) {
    throw new MissingConfigurationError('REDSHIFT_HOST');
  }
  if (!database) {
    throw new MissingConfigurationError('REDSHIFT_DATABASE');
  }

  const builder = new RedshiftConfigBuilder().endpoint(
    host,
    database,
    port ? parseInt(port, 10) : undefined
  );

  // SSL configuration
  const sslMode = process.env['REDSHIFT_SSL_MODE'] as SslMode | undefined;
  const caCert = process.env['REDSHIFT_CA_CERT'];
  if (sslMode) {
    builder.sslMode(sslMode, caCert);
  }

  // Authentication - try each method in order
  const iamRole = process.env['REDSHIFT_IAM_ROLE'];
  const secretId = process.env['REDSHIFT_SECRET_ID'];
  const awsAccessKey = process.env['REDSHIFT_AWS_ACCESS_KEY_ID'];
  const username = process.env['REDSHIFT_USER'];
  const password = process.env['REDSHIFT_PASSWORD'];

  if (iamRole) {
    // IAM role authentication
    builder.withIamRole(iamRole, {
      externalId: process.env['REDSHIFT_IAM_EXTERNAL_ID'],
      sessionName: process.env['REDSHIFT_IAM_SESSION_NAME'],
      durationSeconds: process.env['REDSHIFT_IAM_DURATION']
        ? parseInt(process.env['REDSHIFT_IAM_DURATION'], 10)
        : undefined,
    });
  } else if (secretId) {
    // Secrets Manager authentication
    builder.withSecretsManager(secretId, process.env['REDSHIFT_SECRET_REGION']);
  } else if (awsAccessKey) {
    // IAM user authentication
    const awsSecretKey = process.env['REDSHIFT_AWS_SECRET_ACCESS_KEY'];
    if (!awsSecretKey) {
      throw new MissingConfigurationError('REDSHIFT_AWS_SECRET_ACCESS_KEY');
    }
    builder.withIamUser(
      awsAccessKey,
      awsSecretKey,
      process.env['REDSHIFT_AWS_SESSION_TOKEN']
    );
  } else if (username && password) {
    // Database authentication
    builder.withDatabaseAuth(username, password);
  } else {
    throw new MissingConfigurationError(
      'One of: REDSHIFT_IAM_ROLE, REDSHIFT_SECRET_ID, REDSHIFT_AWS_ACCESS_KEY_ID, or REDSHIFT_USER/PASSWORD'
    );
  }

  // Pool settings
  const poolMin = process.env['REDSHIFT_POOL_MIN'];
  const poolMax = process.env['REDSHIFT_POOL_MAX'];
  if (poolMin || poolMax) {
    builder.poolSize(
      poolMin ? parseInt(poolMin, 10) : DEFAULT_POOL_MIN,
      poolMax ? parseInt(poolMax, 10) : DEFAULT_POOL_MAX
    );
  }

  const poolConfig: PoolConfig = {};
  const acquireTimeout = process.env['REDSHIFT_POOL_ACQUIRE_TIMEOUT'];
  const idleTimeout = process.env['REDSHIFT_POOL_IDLE_TIMEOUT'];
  const maxLifetime = process.env['REDSHIFT_POOL_MAX_LIFETIME'];

  if (acquireTimeout) poolConfig.acquireTimeoutMs = parseInt(acquireTimeout, 10);
  if (idleTimeout) poolConfig.idleTimeoutMs = parseInt(idleTimeout, 10);
  if (maxLifetime) poolConfig.maxLifetimeMs = parseInt(maxLifetime, 10);

  if (Object.keys(poolConfig).length > 0) {
    builder.poolConfig({ ...poolConfig });
  }

  // Timeout settings
  const connectTimeout = process.env['REDSHIFT_CONNECT_TIMEOUT'];
  const queryTimeout = process.env['REDSHIFT_QUERY_TIMEOUT'];
  if (connectTimeout) {
    builder.connectionTimeout(parseInt(connectTimeout, 10));
  }
  if (queryTimeout) {
    builder.queryTimeout(parseInt(queryTimeout, 10));
  }

  // WLM settings
  const queryGroup = process.env['REDSHIFT_QUERY_GROUP'];
  if (queryGroup) {
    builder.defaultQueryGroup(queryGroup);
  }

  const concurrencyLimit = process.env['REDSHIFT_CONCURRENCY_LIMIT'];
  if (concurrencyLimit || queryGroup) {
    builder.wlmConfig({
      defaultQueryGroup: queryGroup,
      concurrencyLimit: concurrencyLimit ? parseInt(concurrencyLimit, 10) : undefined,
    });
  }

  // COPY configuration
  const copyIamRole = process.env['REDSHIFT_COPY_IAM_ROLE'];
  const copyMaxErrors = process.env['REDSHIFT_COPY_MAX_ERRORS'];
  if (copyIamRole || copyMaxErrors) {
    builder.copyConfig({
      defaultIamRole: copyIamRole,
      maxErrors: copyMaxErrors ? parseInt(copyMaxErrors, 10) : undefined,
    });
  }

  // UNLOAD configuration
  const unloadIamRole = process.env['REDSHIFT_UNLOAD_IAM_ROLE'];
  if (unloadIamRole) {
    builder.unloadConfig({
      defaultIamRole: unloadIamRole,
    });
  }

  // Observability
  const logLevel = process.env['REDSHIFT_LOG_LEVEL'] as LogLevel | undefined;
  const logQueries = process.env['REDSHIFT_LOG_QUERIES'] === 'true';
  const enableMetrics = process.env['REDSHIFT_ENABLE_METRICS'] === 'true';
  const enableTracing = process.env['REDSHIFT_ENABLE_TRACING'] === 'true';

  if (logLevel || logQueries || enableMetrics || enableTracing) {
    builder.observabilityConfig({
      logLevel,
      logQueries,
      enableMetrics,
      enableTracing,
    });
  }

  // Simulation mode
  const simMode = process.env['REDSHIFT_SIMULATION_MODE'] as SimulationMode | undefined;
  if (simMode && simMode !== 'disabled') {
    builder.simulationMode(simMode, process.env['REDSHIFT_SIMULATION_PATH']);
  }

  return builder.build();
}

// ============================================================================
// Configuration Validation
// ============================================================================

/**
 * Validates a Redshift configuration.
 * @param config - Configuration to validate
 * @throws {MissingConfigurationError} If required configuration is missing
 * @throws {ConfigurationError} If configuration is invalid
 */
export function validateConfig(config: RedshiftConfig): void {
  // Validate endpoint config
  if (!config.endpoint) {
    throw new MissingConfigurationError('endpoint');
  }
  if (!config.endpoint.host) {
    throw new MissingConfigurationError('endpoint.host');
  }
  if (!config.endpoint.database) {
    throw new MissingConfigurationError('endpoint.database');
  }

  // Validate credentials
  if (!config.credentials) {
    throw new MissingConfigurationError('credentials');
  }

  const creds = config.credentials;
  if (creds.type === 'database') {
    if (!creds.username) throw new MissingConfigurationError('credentials.username');
    if (!creds.password) throw new MissingConfigurationError('credentials.password');
  } else if (creds.type === 'iam_role') {
    if (!creds.roleArn) throw new MissingConfigurationError('credentials.roleArn');
  } else if (creds.type === 'iam_user') {
    if (!creds.accessKeyId) throw new MissingConfigurationError('credentials.accessKeyId');
    if (!creds.secretAccessKey) throw new MissingConfigurationError('credentials.secretAccessKey');
  } else if (creds.type === 'secrets_manager') {
    if (!creds.secretId) throw new MissingConfigurationError('credentials.secretId');
  }

  // Validate pool config
  if (config.pool) {
    const { minConnections, maxConnections } = config.pool;
    if (minConnections !== undefined && maxConnections !== undefined) {
      if (minConnections > maxConnections) {
        throw new ConfigurationError(
          `minConnections (${minConnections}) cannot be greater than maxConnections (${maxConnections})`
        );
      }
    }
    if (minConnections !== undefined && minConnections < 0) {
      throw new ConfigurationError('minConnections must be non-negative');
    }
    if (maxConnections !== undefined && maxConnections < 1) {
      throw new ConfigurationError('maxConnections must be at least 1');
    }
  }

  // Validate retry config
  if (config.retry) {
    const { maxAttempts, baseDelayMs, maxDelayMs } = config.retry;
    if (maxAttempts !== undefined && maxAttempts < 1) {
      throw new ConfigurationError('maxAttempts must be at least 1');
    }
    if (baseDelayMs !== undefined && baseDelayMs < 0) {
      throw new ConfigurationError('baseDelayMs must be non-negative');
    }
    if (maxDelayMs !== undefined && maxDelayMs < 0) {
      throw new ConfigurationError('maxDelayMs must be non-negative');
    }
    if (baseDelayMs !== undefined && maxDelayMs !== undefined) {
      if (baseDelayMs > maxDelayMs) {
        throw new ConfigurationError(
          `baseDelayMs (${baseDelayMs}) cannot be greater than maxDelayMs (${maxDelayMs})`
        );
      }
    }
  }

  // Validate circuit breaker config
  if (config.circuitBreaker) {
    const { failureThreshold, resetTimeoutMs } = config.circuitBreaker;
    if (failureThreshold !== undefined && failureThreshold < 1) {
      throw new ConfigurationError('failureThreshold must be at least 1');
    }
    if (resetTimeoutMs !== undefined && resetTimeoutMs < 0) {
      throw new ConfigurationError('resetTimeoutMs must be non-negative');
    }
  }

  // Validate COPY config
  if (config.copy) {
    const { maxErrors } = config.copy;
    if (maxErrors !== undefined && maxErrors < 0) {
      throw new ConfigurationError('maxErrors must be non-negative');
    }
  }

  // Validate UNLOAD config
  if (config.unload) {
    const { maxFileSize } = config.unload;
    if (maxFileSize !== undefined && maxFileSize <= 0) {
      throw new ConfigurationError('maxFileSize must be positive');
    }
  }

  // Validate WLM config
  if (config.wlm) {
    const { concurrencyLimit, querySlotCount, memoryPercentage } = config.wlm;
    if (concurrencyLimit !== undefined && concurrencyLimit < 1) {
      throw new ConfigurationError('concurrencyLimit must be at least 1');
    }
    if (querySlotCount !== undefined && querySlotCount < 1) {
      throw new ConfigurationError('querySlotCount must be at least 1');
    }
    if (memoryPercentage !== undefined) {
      if (memoryPercentage < 0 || memoryPercentage > 100) {
        throw new ConfigurationError('memoryPercentage must be between 0 and 100');
      }
    }
  }
}

// ============================================================================
// Apply Defaults
// ============================================================================

/**
 * Applies default values to a configuration.
 * @param config - Configuration to apply defaults to
 * @returns Configuration with defaults applied
 */
export function applyDefaults(config: RedshiftConfig): RedshiftConfig {
  return {
    ...config,
    endpoint: {
      ...config.endpoint,
      port: config.endpoint.port ?? DEFAULT_PORT,
      sslMode: config.endpoint.sslMode ?? 'require',
    },
    pool: {
      minConnections: config.pool?.minConnections ?? DEFAULT_POOL_MIN,
      maxConnections: config.pool?.maxConnections ?? DEFAULT_POOL_MAX,
      acquireTimeoutMs: config.pool?.acquireTimeoutMs ?? DEFAULT_POOL_ACQUIRE_TIMEOUT_MS,
      idleTimeoutMs: config.pool?.idleTimeoutMs ?? DEFAULT_POOL_IDLE_TIMEOUT_MS,
      maxLifetimeMs: config.pool?.maxLifetimeMs ?? DEFAULT_POOL_MAX_LIFETIME_MS,
      validationQuery: config.pool?.validationQuery ?? 'SELECT 1',
      ...config.pool,
    },
    retry: {
      maxAttempts: config.retry?.maxAttempts ?? DEFAULT_RETRY_MAX_ATTEMPTS,
      baseDelayMs: config.retry?.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS,
      maxDelayMs: config.retry?.maxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS,
      multiplier: config.retry?.multiplier ?? 2,
      jitter: config.retry?.jitter ?? 0.1,
      ...config.retry,
    },
    circuitBreaker: {
      failureThreshold: config.circuitBreaker?.failureThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
      resetTimeoutMs: config.circuitBreaker?.resetTimeoutMs ?? DEFAULT_CIRCUIT_BREAKER_TIMEOUT_MS,
      successThreshold: config.circuitBreaker?.successThreshold ?? 2,
      windowSize: config.circuitBreaker?.windowSize ?? 10,
      ...config.circuitBreaker,
    },
    copy: config.copy
      ? {
          maxErrors: config.copy.maxErrors ?? 0,
          defaultCompression: config.copy.defaultCompression ?? 'AUTO',
          collectStatistics: config.copy.collectStatistics ?? true,
          ...config.copy,
        }
      : undefined,
    unload: config.unload
      ? {
          defaultCompression: config.unload.defaultCompression ?? 'GZIP',
          parallel: config.unload.parallel ?? true,
          addHeader: config.unload.addHeader ?? false,
          ...config.unload,
        }
      : undefined,
    wlm: config.wlm
      ? {
          defaultPriority: config.wlm.defaultPriority ?? 'normal',
          ...config.wlm,
        }
      : undefined,
    connectTimeoutMs: config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
    queryTimeoutMs: config.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
    simulation: config.simulation ?? { mode: 'disabled' },
    observability: {
      logLevel: config.observability?.logLevel ?? 'info',
      logQueries: config.observability?.logQueries ?? false,
      slowQueryThresholdMs: config.observability?.slowQueryThresholdMs ?? 10000,
      enableMetrics: config.observability?.enableMetrics ?? true,
      enableTracing: config.observability?.enableTracing ?? false,
      metricsPrefix: config.observability?.metricsPrefix ?? 'redshift',
      logQueryPlans: config.observability?.logQueryPlans ?? false,
      ...config.observability,
    },
  };
}
