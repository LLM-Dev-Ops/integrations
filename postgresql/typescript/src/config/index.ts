/**
 * Configuration module for PostgreSQL integration.
 * @module config
 */

import {
  ConnectionConfig,
  PoolConfig,
  SslMode,
  validateConnectionConfig,
  validatePoolConfig,
  DEFAULT_POSTGRES_PORT,
  DEFAULT_CONNECT_TIMEOUT,
  DEFAULT_ACQUIRE_TIMEOUT,
  DEFAULT_IDLE_TIMEOUT,
  DEFAULT_MAX_LIFETIME,
  DEFAULT_HEALTH_CHECK_INTERVAL,
  DEFAULT_MIN_CONNECTIONS,
  DEFAULT_MAX_CONNECTIONS,
} from '../types/index.js';
import { ConfigurationError, InvalidConnectionStringError } from '../errors/index.js';

/**
 * Complete PostgreSQL client configuration.
 */
export interface PgConfig {
  /** Primary database configuration */
  primary: ConnectionConfig;
  /** Replica database configurations (optional) */
  replicas?: ConnectionConfig[];
  /** Connection pool configuration */
  pool: PoolConfig;
  /** Query timeout in milliseconds */
  queryTimeout?: number;
  /** Statement cache size */
  statementCacheSize?: number;
}

/**
 * Validates complete PostgreSQL configuration.
 *
 * @param config - Configuration to validate
 * @throws {PgError} If configuration is invalid
 */
export function validatePgConfig(config: PgConfig): void {
  const errors: string[] = [];

  // Validate primary connection
  errors.push(...validateConnectionConfig(config.primary));

  // Validate replicas if present
  if (config.replicas) {
    config.replicas.forEach((replica, index) => {
      const replicaErrors = validateConnectionConfig(replica);
      errors.push(...replicaErrors.map(err => `Replica ${index}: ${err}`));
    });
  }

  // Validate pool configuration
  errors.push(...validatePoolConfig(config.pool));

  // Validate query timeout
  if (config.queryTimeout !== undefined) {
    if (config.queryTimeout < 0) {
      errors.push('Query timeout cannot be negative');
    }
    if (config.queryTimeout > 300000) {
      errors.push('Query timeout exceeds maximum of 5 minutes (300000ms)');
    }
  }

  // Validate statement cache size
  if (config.statementCacheSize !== undefined) {
    if (config.statementCacheSize < 0) {
      errors.push('Statement cache size cannot be negative');
    }
    if (config.statementCacheSize > 10000) {
      errors.push('Statement cache size exceeds reasonable limit of 10000');
    }
  }

  if (errors.length > 0) {
    throw new ConfigurationError(`Configuration validation failed: ${errors.join('; ')}`);
  }
}

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
    port: DEFAULT_POSTGRES_PORT,
    sslMode: SslMode.Prefer,
    connectTimeout: DEFAULT_CONNECT_TIMEOUT,
    applicationName: 'llmdevops-postgresql',
    ...overrides,
  };
}

/**
 * Creates a default pool configuration.
 *
 * @param overrides - Partial configuration to override defaults
 * @returns Complete pool configuration with defaults
 */
export function createDefaultPoolConfig(
  overrides?: Partial<PoolConfig>
): PoolConfig {
  return {
    minConnections: DEFAULT_MIN_CONNECTIONS,
    maxConnections: DEFAULT_MAX_CONNECTIONS,
    acquireTimeout: DEFAULT_ACQUIRE_TIMEOUT,
    idleTimeout: DEFAULT_IDLE_TIMEOUT,
    maxLifetime: DEFAULT_MAX_LIFETIME,
    healthCheckInterval: DEFAULT_HEALTH_CHECK_INTERVAL,
    ...overrides,
  };
}

/**
 * Parses a PostgreSQL connection string into ConnectionConfig.
 *
 * Supports format: postgresql://user:password@host:port/database?options
 *
 * @param connectionString - PostgreSQL connection string
 * @returns Parsed connection configuration
 * @throws {PgError} If connection string is invalid
 */
export function parseConnectionString(connectionString: string): ConnectionConfig {
  try {
    const url = new URL(connectionString);

    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
      throw new Error('Protocol must be postgresql:// or postgres://');
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

    // Parse query parameters for SSL mode and other options
    const params = url.searchParams;
    let sslMode = SslMode.Prefer;
    if (params.has('sslmode')) {
      const mode = params.get('sslmode')!;
      switch (mode) {
        case 'disable':
          sslMode = SslMode.Disable;
          break;
        case 'prefer':
          sslMode = SslMode.Prefer;
          break;
        case 'require':
          sslMode = SslMode.Require;
          break;
        case 'verify-ca':
          sslMode = SslMode.VerifyCa;
          break;
        case 'verify-full':
          sslMode = SslMode.VerifyFull;
          break;
        default:
          throw new Error(`Invalid SSL mode: ${mode}`);
      }
    }

    const config: ConnectionConfig = {
      host: url.hostname,
      port: url.port ? parseInt(url.port, 10) : DEFAULT_POSTGRES_PORT,
      database,
      username: url.username,
      password: decodeURIComponent(url.password),
      sslMode,
      connectTimeout: params.has('connect_timeout')
        ? parseInt(params.get('connect_timeout')!, 10) * 1000
        : DEFAULT_CONNECT_TIMEOUT,
      applicationName: params.get('application_name') || 'llmdevops-postgresql',
    };

    // Validate the parsed configuration
    const errors = validateConnectionConfig(config);
    if (errors.length > 0) {
      throw new Error(errors.join('; '));
    }

    return config;
  } catch (error) {
    throw new InvalidConnectionStringError(
      connectionString,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Converts ConnectionConfig to a PostgreSQL connection string.
 *
 * SECURITY NOTE: The returned string contains the password in plain text.
 * Only use for internal purposes, never log or expose.
 *
 * @param config - Connection configuration
 * @returns PostgreSQL connection string
 */
export function toConnectionString(config: ConnectionConfig): string {
  const url = new URL('postgresql://localhost');
  url.hostname = config.host;
  url.port = config.port.toString();
  url.username = config.username;
  url.password = encodeURIComponent(config.password);
  url.pathname = `/${config.database}`;

  // Add query parameters
  url.searchParams.set('sslmode', config.sslMode);
  if (config.connectTimeout !== DEFAULT_CONNECT_TIMEOUT) {
    url.searchParams.set('connect_timeout', Math.floor(config.connectTimeout / 1000).toString());
  }
  if (config.applicationName) {
    url.searchParams.set('application_name', config.applicationName);
  }

  return url.toString();
}

/**
 * Redacts sensitive information from configuration for logging.
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
