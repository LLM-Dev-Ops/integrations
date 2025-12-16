/**
 * Snowflake Integration Configuration
 *
 * Configuration types and builders for the Snowflake integration module.
 * @module @llmdevops/snowflake-integration/config
 */

import type { SimulationMode, WorkloadType, WarehouseSize } from '../types/index.js';
import { ConfigurationError, MissingConfigurationError } from '../errors/index.js';

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_SNOWFLAKE_PORT = 443;
export const DEFAULT_CONNECT_TIMEOUT_MS = 30000;
export const DEFAULT_QUERY_TIMEOUT_MS = 300000;
export const DEFAULT_LOGIN_TIMEOUT_MS = 60000;
export const DEFAULT_POOL_MIN = 1;
export const DEFAULT_POOL_MAX = 10;
export const DEFAULT_POOL_ACQUIRE_TIMEOUT_MS = 30000;
export const DEFAULT_POOL_IDLE_TIMEOUT_MS = 600000;
export const DEFAULT_POOL_MAX_LIFETIME_MS = 3600000;
export const DEFAULT_RETRY_MAX_ATTEMPTS = 3;
export const DEFAULT_RETRY_BASE_DELAY_MS = 1000;
export const DEFAULT_RETRY_MAX_DELAY_MS = 30000;
export const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 5;
export const DEFAULT_CIRCUIT_BREAKER_TIMEOUT_MS = 60000;

// ============================================================================
// Authentication Types
// ============================================================================

/**
 * Authentication method type.
 */
export type AuthMethod = 'password' | 'keypair' | 'oauth' | 'external_browser';

/**
 * Password authentication configuration.
 */
export interface PasswordAuthConfig {
  method: 'password';
  username: string;
  password: string;
}

/**
 * Key-pair authentication configuration.
 */
export interface KeyPairAuthConfig {
  method: 'keypair';
  username: string;
  privateKeyPath?: string;
  privateKey?: string;
  privateKeyPassphrase?: string;
}

/**
 * OAuth authentication configuration.
 */
export interface OAuthAuthConfig {
  method: 'oauth';
  token: string;
  tokenType?: string;
}

/**
 * External browser authentication configuration.
 */
export interface ExternalBrowserAuthConfig {
  method: 'external_browser';
  username: string;
}

/**
 * Authentication configuration union.
 */
export type AuthConfig =
  | PasswordAuthConfig
  | KeyPairAuthConfig
  | OAuthAuthConfig
  | ExternalBrowserAuthConfig;

// ============================================================================
// Connection Configuration
// ============================================================================

/**
 * Connection configuration.
 */
export interface ConnectionConfig {
  /** Snowflake account identifier (e.g., 'myorg-myaccount') */
  account: string;
  /** Authentication configuration */
  auth: AuthConfig;
  /** Default database */
  database?: string;
  /** Default schema */
  schema?: string;
  /** Default warehouse */
  warehouse?: string;
  /** Default role */
  role?: string;
  /** Application name for tracking */
  application?: string;
  /** Connection timeout in milliseconds */
  connectTimeoutMs?: number;
  /** Login timeout in milliseconds */
  loginTimeoutMs?: number;
  /** Region (if not in account identifier) */
  region?: string;
  /** Cloud provider (aws, azure, gcp) */
  cloudProvider?: 'aws' | 'azure' | 'gcp';
  /** Custom host override */
  host?: string;
  /** Port (default: 443) */
  port?: number;
  /** Protocol (default: https) */
  protocol?: 'http' | 'https';
  /** Disable OCSP check */
  disableOcsp?: boolean;
  /** Client session keep alive */
  clientSessionKeepAlive?: boolean;
  /** Client session keep alive heartbeat frequency in seconds */
  clientSessionKeepAliveHeartbeatFrequency?: number;
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
// Warehouse Routing Configuration
// ============================================================================

/**
 * Warehouse configuration for routing.
 */
export interface WarehouseConfig {
  /** Warehouse name */
  name: string;
  /** Warehouse size */
  size?: WarehouseSize;
  /** Maximum queue depth before routing away */
  maxQueueDepth?: number;
  /** Preferred workload types */
  preferredWorkloads?: WorkloadType[];
  /** Priority (higher = preferred) */
  priority?: number;
  /** Auto-suspend time in seconds (for warehouse management) */
  autoSuspendSeconds?: number;
  /** Whether to auto-resume */
  autoResume?: boolean;
}

/**
 * Warehouse routing configuration.
 */
export interface WarehouseRoutingConfig {
  /** Default warehouse */
  defaultWarehouse: string;
  /** Available warehouses */
  warehouses: WarehouseConfig[];
  /** Enable dynamic routing */
  enableDynamicRouting?: boolean;
  /** Query queue threshold for switching */
  queueThreshold?: number;
}

// ============================================================================
// Cost Configuration
// ============================================================================

/**
 * Cost monitoring configuration.
 */
export interface CostConfig {
  /** Enable cost tracking */
  enableTracking?: boolean;
  /** Cost per credit (for estimation) */
  costPerCredit?: number;
  /** Alert threshold in credits */
  alertThresholdCredits?: number;
  /** Query cost limit in credits */
  queryCostLimit?: number;
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
 * Complete Snowflake configuration.
 */
export interface SnowflakeConfig {
  /** Connection configuration */
  connection: ConnectionConfig;
  /** Pool configuration */
  pool?: PoolConfig;
  /** Retry configuration */
  retry?: RetryConfig;
  /** Circuit breaker configuration */
  circuitBreaker?: CircuitBreakerConfig;
  /** Warehouse routing configuration */
  warehouseRouting?: WarehouseRoutingConfig;
  /** Cost monitoring configuration */
  cost?: CostConfig;
  /** Observability configuration */
  observability?: ObservabilityConfig;
  /** Simulation configuration */
  simulation?: SimulationConfig;
  /** Default query timeout in milliseconds */
  queryTimeoutMs?: number;
}

// ============================================================================
// Configuration Builder
// ============================================================================

/**
 * Builder for Snowflake configuration.
 */
export class SnowflakeConfigBuilder {
  private config: Partial<SnowflakeConfig> = {};

  /**
   * Sets the account identifier.
   */
  account(account: string): this {
    this.config.connection = {
      ...this.config.connection,
      account,
    } as ConnectionConfig;
    return this;
  }

  /**
   * Sets password authentication.
   */
  passwordAuth(username: string, password: string): this {
    this.config.connection = {
      ...this.config.connection,
      auth: { method: 'password', username, password },
    } as ConnectionConfig;
    return this;
  }

  /**
   * Sets key-pair authentication.
   */
  keyPairAuth(
    username: string,
    options: { privateKeyPath?: string; privateKey?: string; passphrase?: string }
  ): this {
    this.config.connection = {
      ...this.config.connection,
      auth: {
        method: 'keypair',
        username,
        privateKeyPath: options.privateKeyPath,
        privateKey: options.privateKey,
        privateKeyPassphrase: options.passphrase,
      },
    } as ConnectionConfig;
    return this;
  }

  /**
   * Sets OAuth authentication.
   */
  oauthAuth(token: string, tokenType?: string): this {
    this.config.connection = {
      ...this.config.connection,
      auth: { method: 'oauth', token, tokenType },
    } as ConnectionConfig;
    return this;
  }

  /**
   * Sets the default database.
   */
  database(database: string): this {
    this.config.connection = {
      ...this.config.connection,
      database,
    } as ConnectionConfig;
    return this;
  }

  /**
   * Sets the default schema.
   */
  schema(schema: string): this {
    this.config.connection = {
      ...this.config.connection,
      schema,
    } as ConnectionConfig;
    return this;
  }

  /**
   * Sets the default warehouse.
   */
  warehouse(warehouse: string): this {
    this.config.connection = {
      ...this.config.connection,
      warehouse,
    } as ConnectionConfig;
    return this;
  }

  /**
   * Sets the default role.
   */
  role(role: string): this {
    this.config.connection = {
      ...this.config.connection,
      role,
    } as ConnectionConfig;
    return this;
  }

  /**
   * Sets connection timeouts.
   */
  timeouts(options: { connectMs?: number; loginMs?: number; queryMs?: number }): this {
    if (options.connectMs !== undefined) {
      this.config.connection = {
        ...this.config.connection,
        connectTimeoutMs: options.connectMs,
      } as ConnectionConfig;
    }
    if (options.loginMs !== undefined) {
      this.config.connection = {
        ...this.config.connection,
        loginTimeoutMs: options.loginMs,
      } as ConnectionConfig;
    }
    if (options.queryMs !== undefined) {
      this.config.queryTimeoutMs = options.queryMs;
    }
    return this;
  }

  /**
   * Sets pool configuration.
   */
  poolConfig(config: PoolConfig): this {
    this.config.pool = config;
    return this;
  }

  /**
   * Sets pool size.
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
   * Sets retry configuration.
   */
  retryConfig(config: RetryConfig): this {
    this.config.retry = config;
    return this;
  }

  /**
   * Sets circuit breaker configuration.
   */
  circuitBreakerConfig(config: CircuitBreakerConfig): this {
    this.config.circuitBreaker = config;
    return this;
  }

  /**
   * Sets warehouse routing configuration.
   */
  warehouseRoutingConfig(config: WarehouseRoutingConfig): this {
    this.config.warehouseRouting = config;
    return this;
  }

  /**
   * Sets cost configuration.
   */
  costConfig(config: CostConfig): this {
    this.config.cost = config;
    return this;
  }

  /**
   * Sets observability configuration.
   */
  observabilityConfig(config: ObservabilityConfig): this {
    this.config.observability = config;
    return this;
  }

  /**
   * Sets simulation mode.
   */
  simulationMode(mode: SimulationMode, recordingPath?: string): this {
    this.config.simulation = {
      mode,
      recordingPath,
    };
    return this;
  }

  /**
   * Builds the configuration.
   */
  build(): SnowflakeConfig {
    if (!this.config.connection?.account) {
      throw new MissingConfigurationError('account');
    }
    if (!this.config.connection?.auth) {
      throw new MissingConfigurationError('auth');
    }

    return {
      connection: this.config.connection as ConnectionConfig,
      pool: this.config.pool,
      retry: this.config.retry,
      circuitBreaker: this.config.circuitBreaker,
      warehouseRouting: this.config.warehouseRouting,
      cost: this.config.cost,
      observability: this.config.observability,
      simulation: this.config.simulation,
      queryTimeoutMs: this.config.queryTimeoutMs,
    };
  }
}

// ============================================================================
// Configuration from Environment
// ============================================================================

/**
 * Creates configuration from environment variables.
 */
export function configFromEnvironment(): SnowflakeConfig {
  const account = process.env['SNOWFLAKE_ACCOUNT'];
  const user = process.env['SNOWFLAKE_USER'];
  const password = process.env['SNOWFLAKE_PASSWORD'];
  const privateKeyPath = process.env['SNOWFLAKE_PRIVATE_KEY_PATH'];
  const privateKey = process.env['SNOWFLAKE_PRIVATE_KEY'];
  const privateKeyPassphrase = process.env['SNOWFLAKE_PRIVATE_KEY_PASSPHRASE'];
  const oauthToken = process.env['SNOWFLAKE_OAUTH_TOKEN'];

  if (!account) {
    throw new MissingConfigurationError('SNOWFLAKE_ACCOUNT');
  }
  if (!user && !oauthToken) {
    throw new MissingConfigurationError('SNOWFLAKE_USER or SNOWFLAKE_OAUTH_TOKEN');
  }

  let auth: AuthConfig;
  if (oauthToken) {
    auth = { method: 'oauth', token: oauthToken };
  } else if (privateKeyPath || privateKey) {
    auth = {
      method: 'keypair',
      username: user!,
      privateKeyPath,
      privateKey,
      privateKeyPassphrase,
    };
  } else if (password) {
    auth = { method: 'password', username: user!, password };
  } else {
    throw new MissingConfigurationError('SNOWFLAKE_PASSWORD or SNOWFLAKE_PRIVATE_KEY');
  }

  const builder = new SnowflakeConfigBuilder()
    .account(account);

  // Set auth based on type
  if (auth.method === 'password') {
    builder.passwordAuth(auth.username, auth.password);
  } else if (auth.method === 'keypair') {
    builder.keyPairAuth(auth.username, {
      privateKeyPath: auth.privateKeyPath,
      privateKey: auth.privateKey,
      passphrase: auth.privateKeyPassphrase,
    });
  } else if (auth.method === 'oauth') {
    builder.oauthAuth(auth.token);
  }

  // Optional settings
  const database = process.env['SNOWFLAKE_DATABASE'];
  const schema = process.env['SNOWFLAKE_SCHEMA'];
  const warehouse = process.env['SNOWFLAKE_WAREHOUSE'];
  const role = process.env['SNOWFLAKE_ROLE'];

  if (database) builder.database(database);
  if (schema) builder.schema(schema);
  if (warehouse) builder.warehouse(warehouse);
  if (role) builder.role(role);

  // Pool settings
  const poolMin = process.env['SNOWFLAKE_POOL_MIN'];
  const poolMax = process.env['SNOWFLAKE_POOL_MAX'];
  if (poolMin || poolMax) {
    builder.poolSize(
      poolMin ? parseInt(poolMin, 10) : DEFAULT_POOL_MIN,
      poolMax ? parseInt(poolMax, 10) : DEFAULT_POOL_MAX
    );
  }

  // Timeout settings
  const connectTimeout = process.env['SNOWFLAKE_CONNECT_TIMEOUT'];
  const queryTimeout = process.env['SNOWFLAKE_QUERY_TIMEOUT'];
  if (connectTimeout || queryTimeout) {
    builder.timeouts({
      connectMs: connectTimeout ? parseInt(connectTimeout, 10) : undefined,
      queryMs: queryTimeout ? parseInt(queryTimeout, 10) : undefined,
    });
  }

  // Simulation mode
  const simMode = process.env['SNOWFLAKE_SIMULATION_MODE'] as SimulationMode | undefined;
  if (simMode && simMode !== 'disabled') {
    builder.simulationMode(simMode, process.env['SNOWFLAKE_SIMULATION_PATH']);
  }

  return builder.build();
}

// ============================================================================
// Configuration Validation
// ============================================================================

/**
 * Validates a Snowflake configuration.
 */
export function validateConfig(config: SnowflakeConfig): void {
  // Validate connection config
  if (!config.connection.account) {
    throw new MissingConfigurationError('account');
  }
  if (!config.connection.auth) {
    throw new MissingConfigurationError('auth');
  }

  // Validate auth config
  const auth = config.connection.auth;
  if (auth.method === 'password') {
    if (!auth.username) throw new MissingConfigurationError('username');
    if (!auth.password) throw new MissingConfigurationError('password');
  } else if (auth.method === 'keypair') {
    if (!auth.username) throw new MissingConfigurationError('username');
    if (!auth.privateKeyPath && !auth.privateKey) {
      throw new MissingConfigurationError('privateKeyPath or privateKey');
    }
  } else if (auth.method === 'oauth') {
    if (!auth.token) throw new MissingConfigurationError('token');
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
}

// ============================================================================
// Apply Defaults
// ============================================================================

/**
 * Applies default values to a configuration.
 */
export function applyDefaults(config: SnowflakeConfig): SnowflakeConfig {
  return {
    ...config,
    connection: {
      ...config.connection,
      port: config.connection.port ?? DEFAULT_SNOWFLAKE_PORT,
      protocol: config.connection.protocol ?? 'https',
      connectTimeoutMs: config.connection.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
      loginTimeoutMs: config.connection.loginTimeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS,
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
    queryTimeoutMs: config.queryTimeoutMs ?? DEFAULT_QUERY_TIMEOUT_MS,
    simulation: config.simulation ?? { mode: 'disabled' },
    observability: {
      logLevel: config.observability?.logLevel ?? 'info',
      logQueries: config.observability?.logQueries ?? false,
      slowQueryThresholdMs: config.observability?.slowQueryThresholdMs ?? 10000,
      enableMetrics: config.observability?.enableMetrics ?? true,
      enableTracing: config.observability?.enableTracing ?? false,
      metricsPrefix: config.observability?.metricsPrefix ?? 'snowflake',
      ...config.observability,
    },
  };
}
