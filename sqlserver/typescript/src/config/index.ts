/**
 * Configuration module for SQL Server integration.
 * @module config
 */

import {
  ConnectionConfig,
  PoolConfig,
  EncryptionMode,
  AuthenticationType,
  validateConnectionConfig,
  validatePoolConfig,
  DEFAULT_SQLSERVER_PORT,
  DEFAULT_CONNECT_TIMEOUT,
  DEFAULT_REQUEST_TIMEOUT,
  DEFAULT_ACQUIRE_TIMEOUT,
  DEFAULT_IDLE_TIMEOUT,
  DEFAULT_MAX_LIFETIME,
  DEFAULT_HEALTH_CHECK_INTERVAL,
  DEFAULT_MIN_CONNECTIONS,
  DEFAULT_MAX_CONNECTIONS,
} from '../types/index.js';
import { ConfigurationError, InvalidConnectionStringError } from '../errors/index.js';

/**
 * Complete SQL Server client configuration.
 */
export interface SqlServerConfig {
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
 * Validates complete SQL Server configuration.
 *
 * @param config - Configuration to validate
 * @throws {SqlServerError} If configuration is invalid
 */
export function validateSqlServerConfig(config: SqlServerConfig): void {
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
    port: DEFAULT_SQLSERVER_PORT,
    authenticationType: AuthenticationType.SqlServer,
    encryptionMode: EncryptionMode.Require,
    trustServerCertificate: false,
    connectTimeout: DEFAULT_CONNECT_TIMEOUT,
    requestTimeout: DEFAULT_REQUEST_TIMEOUT,
    applicationName: 'llmdevops-sqlserver',
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
 * Parses a SQL Server connection string into ConnectionConfig.
 *
 * Supports formats:
 * - Server=host;Database=db;User Id=user;Password=pwd;
 * - mssql://user:password@host:port/database?options
 *
 * @param connectionString - SQL Server connection string
 * @returns Parsed connection configuration
 * @throws {SqlServerError} If connection string is invalid
 */
export function parseConnectionString(connectionString: string): ConnectionConfig {
  try {
    // Check if it's a URL format
    if (connectionString.startsWith('mssql://') || connectionString.startsWith('sqlserver://')) {
      return parseUrlConnectionString(connectionString);
    }

    // Parse ADO.NET style connection string
    return parseAdoConnectionString(connectionString);
  } catch (error) {
    throw new InvalidConnectionStringError(
      connectionString,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Parses URL-style connection string.
 */
function parseUrlConnectionString(connectionString: string): ConnectionConfig {
  const url = new URL(connectionString);

  if (url.protocol !== 'mssql:' && url.protocol !== 'sqlserver:') {
    throw new Error('Protocol must be mssql:// or sqlserver://');
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
  let encryptionMode = EncryptionMode.Require;
  if (params.has('encrypt')) {
    const encrypt = params.get('encrypt')!.toLowerCase();
    switch (encrypt) {
      case 'false':
      case 'no':
        encryptionMode = EncryptionMode.Disable;
        break;
      case 'true':
      case 'yes':
        encryptionMode = EncryptionMode.Require;
        break;
      case 'strict':
        encryptionMode = EncryptionMode.Strict;
        break;
      default:
        throw new Error(`Invalid encryption mode: ${encrypt}`);
    }
  }

  const config: ConnectionConfig = {
    host: url.hostname,
    port: url.port ? parseInt(url.port, 10) : DEFAULT_SQLSERVER_PORT,
    database,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    authenticationType: AuthenticationType.SqlServer,
    encryptionMode,
    trustServerCertificate: params.get('trustServerCertificate')?.toLowerCase() === 'true',
    connectTimeout: params.has('connectTimeout')
      ? parseInt(params.get('connectTimeout')!, 10) * 1000
      : DEFAULT_CONNECT_TIMEOUT,
    requestTimeout: params.has('requestTimeout')
      ? parseInt(params.get('requestTimeout')!, 10) * 1000
      : DEFAULT_REQUEST_TIMEOUT,
    applicationName: params.get('applicationName') || 'llmdevops-sqlserver',
    instanceName: params.get('instanceName') || undefined,
  };

  // Validate the parsed configuration
  const errors = validateConnectionConfig(config);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  return config;
}

/**
 * Parses ADO.NET-style connection string.
 */
function parseAdoConnectionString(connectionString: string): ConnectionConfig {
  const parts = connectionString.split(';').filter(p => p.trim().length > 0);
  const params: Record<string, string> = {};

  for (const part of parts) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) {
      throw new Error(`Invalid connection string part: ${part}`);
    }
    const key = part.substring(0, eqIndex).trim().toLowerCase();
    const value = part.substring(eqIndex + 1).trim();
    params[key] = value;
  }

  // Extract host and port from Server parameter
  const server = params['server'] || params['data source'];
  if (!server) {
    throw new Error('Server is required');
  }

  let host = server;
  let port = DEFAULT_SQLSERVER_PORT;
  let instanceName: string | undefined;

  // Handle named instances (Server\Instance format)
  if (server.includes('\\')) {
    const [hostPart, instance] = server.split('\\');
    host = hostPart ?? server;
    instanceName = instance;
  }

  // Handle port (Server,Port format)
  if (host.includes(',')) {
    const [hostPart, portStr] = host.split(',');
    host = hostPart ?? host;
    port = parseInt(portStr ?? String(DEFAULT_SQLSERVER_PORT), 10);
  }

  const database = params['database'] || params['initial catalog'];
  if (!database) {
    throw new Error('Database is required');
  }

  const username = params['user id'] || params['uid'] || params['user'];
  const password = params['password'] || params['pwd'];

  // Determine authentication type
  let authenticationType = AuthenticationType.SqlServer;
  const integratedSecurity = params['integrated security'] || params['trusted_connection'];
  if (integratedSecurity?.toLowerCase() === 'true' || integratedSecurity?.toLowerCase() === 'sspi') {
    authenticationType = AuthenticationType.Windows;
  }

  // Validate credentials for SQL Server auth
  if (authenticationType === AuthenticationType.SqlServer) {
    if (!username) {
      throw new Error('Username is required for SQL Server authentication');
    }
    if (!password) {
      throw new Error('Password is required for SQL Server authentication');
    }
  }

  // Encryption mode
  let encryptionMode = EncryptionMode.Require;
  const encrypt = params['encrypt'];
  if (encrypt) {
    switch (encrypt.toLowerCase()) {
      case 'false':
      case 'no':
        encryptionMode = EncryptionMode.Disable;
        break;
      case 'true':
      case 'yes':
        encryptionMode = EncryptionMode.Require;
        break;
      case 'strict':
        encryptionMode = EncryptionMode.Strict;
        break;
    }
  }

  const config: ConnectionConfig = {
    host,
    port,
    database,
    username: username || '',
    password: password || '',
    authenticationType,
    encryptionMode,
    trustServerCertificate: params['trustservercertificate']?.toLowerCase() === 'true',
    connectTimeout: params['connect timeout']
      ? parseInt(params['connect timeout'], 10) * 1000
      : DEFAULT_CONNECT_TIMEOUT,
    requestTimeout: params['command timeout']
      ? parseInt(params['command timeout'], 10) * 1000
      : DEFAULT_REQUEST_TIMEOUT,
    applicationName: params['application name'] || 'llmdevops-sqlserver',
    instanceName,
    domain: params['domain'],
  };

  // Validate the parsed configuration
  const errors = validateConnectionConfig(config);
  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  return config;
}

/**
 * Converts ConnectionConfig to a SQL Server connection string.
 *
 * SECURITY NOTE: The returned string contains the password in plain text.
 * Only use for internal purposes, never log or expose.
 *
 * @param config - Connection configuration
 * @returns SQL Server connection string
 */
export function toConnectionString(config: ConnectionConfig): string {
  const parts: string[] = [];

  // Server with optional port or instance
  let server = config.host;
  if (config.instanceName) {
    server += `\\${config.instanceName}`;
  } else if (config.port !== DEFAULT_SQLSERVER_PORT) {
    server += `,${config.port}`;
  }
  parts.push(`Server=${server}`);

  parts.push(`Database=${config.database}`);

  if (config.authenticationType === AuthenticationType.Windows) {
    parts.push('Integrated Security=SSPI');
    if (config.domain) {
      parts.push(`Domain=${config.domain}`);
    }
  } else {
    parts.push(`User Id=${config.username}`);
    parts.push(`Password=${config.password}`);
  }

  // Encryption
  switch (config.encryptionMode) {
    case EncryptionMode.Disable:
      parts.push('Encrypt=False');
      break;
    case EncryptionMode.Require:
      parts.push('Encrypt=True');
      break;
    case EncryptionMode.Strict:
      parts.push('Encrypt=Strict');
      break;
  }

  if (config.trustServerCertificate) {
    parts.push('TrustServerCertificate=True');
  }

  parts.push(`Connect Timeout=${Math.floor(config.connectTimeout / 1000)}`);
  parts.push(`Command Timeout=${Math.floor(config.requestTimeout / 1000)}`);
  parts.push(`Application Name=${config.applicationName}`);

  return parts.join(';');
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

/**
 * Creates a configuration from environment variables.
 *
 * Environment variables:
 * - SQLSERVER_HOST: Database server hostname
 * - SQLSERVER_PORT: Database server port (default: 1433)
 * - SQLSERVER_DATABASE: Database name
 * - SQLSERVER_USERNAME: Database username
 * - SQLSERVER_PASSWORD: Database password
 * - SQLSERVER_INSTANCE: Named instance (optional)
 * - SQLSERVER_ENCRYPT: Encryption mode (true/false/strict)
 * - SQLSERVER_TRUST_CERT: Trust server certificate (true/false)
 * - SQLSERVER_CONNECT_TIMEOUT: Connection timeout in seconds
 * - SQLSERVER_REQUEST_TIMEOUT: Request timeout in seconds
 * - SQLSERVER_APP_NAME: Application name
 * - SQLSERVER_POOL_MIN: Minimum pool connections
 * - SQLSERVER_POOL_MAX: Maximum pool connections
 *
 * @returns SQL Server configuration from environment
 * @throws {ConfigurationError} If required environment variables are missing
 */
export function createConfigFromEnv(): SqlServerConfig {
  const host = process.env['SQLSERVER_HOST'];
  const database = process.env['SQLSERVER_DATABASE'];
  const username = process.env['SQLSERVER_USERNAME'];
  const password = process.env['SQLSERVER_PASSWORD'];

  if (!host) {
    throw new ConfigurationError('SQLSERVER_HOST environment variable is required');
  }
  if (!database) {
    throw new ConfigurationError('SQLSERVER_DATABASE environment variable is required');
  }
  if (!username) {
    throw new ConfigurationError('SQLSERVER_USERNAME environment variable is required');
  }
  if (!password) {
    throw new ConfigurationError('SQLSERVER_PASSWORD environment variable is required');
  }

  // Parse encryption mode
  let encryptionMode = EncryptionMode.Require;
  const encrypt = process.env['SQLSERVER_ENCRYPT']?.toLowerCase();
  if (encrypt === 'false' || encrypt === 'no') {
    encryptionMode = EncryptionMode.Disable;
  } else if (encrypt === 'strict') {
    encryptionMode = EncryptionMode.Strict;
  }

  const primary = createDefaultConnectionConfig({
    host,
    port: process.env['SQLSERVER_PORT'] ? parseInt(process.env['SQLSERVER_PORT'], 10) : DEFAULT_SQLSERVER_PORT,
    database,
    username,
    password,
    instanceName: process.env['SQLSERVER_INSTANCE'],
    encryptionMode,
    trustServerCertificate: process.env['SQLSERVER_TRUST_CERT']?.toLowerCase() === 'true',
    connectTimeout: process.env['SQLSERVER_CONNECT_TIMEOUT']
      ? parseInt(process.env['SQLSERVER_CONNECT_TIMEOUT'], 10) * 1000
      : DEFAULT_CONNECT_TIMEOUT,
    requestTimeout: process.env['SQLSERVER_REQUEST_TIMEOUT']
      ? parseInt(process.env['SQLSERVER_REQUEST_TIMEOUT'], 10) * 1000
      : DEFAULT_REQUEST_TIMEOUT,
    applicationName: process.env['SQLSERVER_APP_NAME'] || 'llmdevops-sqlserver',
  });

  const pool = createDefaultPoolConfig({
    minConnections: process.env['SQLSERVER_POOL_MIN']
      ? parseInt(process.env['SQLSERVER_POOL_MIN'], 10)
      : DEFAULT_MIN_CONNECTIONS,
    maxConnections: process.env['SQLSERVER_POOL_MAX']
      ? parseInt(process.env['SQLSERVER_POOL_MAX'], 10)
      : DEFAULT_MAX_CONNECTIONS,
  });

  return {
    primary,
    pool,
  };
}
