/**
 * Configuration types for the Qdrant client.
 * @module config
 */

/** Default Qdrant host. */
export const DEFAULT_HOST = 'localhost';

/** Default Qdrant gRPC port. */
export const DEFAULT_GRPC_PORT = 6334;

/** Default Qdrant REST port. */
export const DEFAULT_REST_PORT = 6333;

/** Default request timeout in milliseconds (30 seconds). */
export const DEFAULT_TIMEOUT = 30000;

/** Default maximum retry attempts. */
export const DEFAULT_MAX_RETRIES = 3;

/** Default connection pool size. */
export const DEFAULT_POOL_SIZE = 10;

/** Default TLS verification setting. */
export const DEFAULT_VERIFY_TLS = true;

/**
 * Qdrant client configuration.
 */
export interface QdrantConfig {
  /**
   * Qdrant server host.
   * @default 'localhost'
   */
  host: string;

  /**
   * Qdrant server port.
   * @default 6334 (gRPC) or 6333 (REST)
   */
  port: number;

  /**
   * API key for authentication (if required).
   * This value is secret and will never be logged.
   */
  apiKey?: string;

  /**
   * Enable TLS/SSL for connections.
   * Automatically enabled if apiKey is present.
   * @default false (true if apiKey is set)
   */
  useTls: boolean;

  /**
   * Path to custom CA certificate for TLS verification.
   */
  caCertPath?: string;

  /**
   * Verify TLS certificates.
   * @default true
   */
  verifyTls: boolean;

  /**
   * Request timeout in milliseconds.
   * @default 30000 (30 seconds)
   */
  timeout: number;

  /**
   * Maximum number of retry attempts for failed requests.
   * @default 3
   */
  maxRetries: number;

  /**
   * Connection pool size.
   * @default 10
   */
  connectionPoolSize: number;
}

/**
 * Creates a default Qdrant configuration.
 * @returns The default configuration.
 */
export function createDefaultConfig(): QdrantConfig {
  return {
    host: DEFAULT_HOST,
    port: DEFAULT_GRPC_PORT,
    apiKey: undefined,
    useTls: false,
    caCertPath: undefined,
    verifyTls: DEFAULT_VERIFY_TLS,
    timeout: DEFAULT_TIMEOUT,
    maxRetries: DEFAULT_MAX_RETRIES,
    connectionPoolSize: DEFAULT_POOL_SIZE,
  };
}

/**
 * Validates a Qdrant configuration.
 * @param config - The configuration to validate.
 * @throws {Error} If the configuration is invalid.
 */
export function validateConfig(config: QdrantConfig): void {
  if (!config.host || config.host.trim() === '') {
    throw new Error('Host cannot be empty');
  }

  if (config.port <= 0 || config.port > 65535) {
    throw new Error('Port must be between 1 and 65535');
  }

  if (config.timeout <= 0) {
    throw new Error('Timeout must be greater than 0');
  }

  if (config.maxRetries < 0) {
    throw new Error('Max retries must be non-negative');
  }

  if (config.connectionPoolSize <= 0) {
    throw new Error('Connection pool size must be greater than 0');
  }

  // Warn if apiKey is set but TLS is disabled
  if (config.apiKey && !config.useTls) {
    console.warn(
      'Warning: API key is set but TLS is disabled. ' +
      'This is insecure and may expose your credentials. ' +
      'Consider enabling TLS with useTls: true'
    );
  }

  // Validate CA cert path if provided
  if (config.caCertPath && config.caCertPath.trim() === '') {
    throw new Error('CA certificate path cannot be empty string');
  }
}

/**
 * Parses a Qdrant URL and extracts host, port, and TLS settings.
 * Supports formats:
 * - http://host:port
 * - https://host:port
 * - host:port
 * - host (uses default port)
 *
 * @param url - The URL to parse.
 * @returns Parsed configuration components.
 * @throws {Error} If the URL format is invalid.
 */
export function parseQdrantUrl(url: string): Pick<QdrantConfig, 'host' | 'port' | 'useTls'> {
  if (!url || url.trim() === '') {
    throw new Error('URL cannot be empty');
  }

  let cleanUrl = url.trim();
  let useTls = false;

  // Check for protocol
  if (cleanUrl.startsWith('https://')) {
    useTls = true;
    cleanUrl = cleanUrl.substring(8);
  } else if (cleanUrl.startsWith('http://')) {
    useTls = false;
    cleanUrl = cleanUrl.substring(7);
  }

  // Remove trailing slash
  cleanUrl = cleanUrl.replace(/\/$/, '');

  // Parse host and port
  const parts = cleanUrl.split(':');
  if (parts.length > 2) {
    throw new Error(`Invalid URL format: ${url}`);
  }

  const host = parts[0];
  if (!host || host.trim() === '') {
    throw new Error(`Invalid host in URL: ${url}`);
  }

  let port: number;
  if (parts.length === 2) {
    port = parseInt(parts[1], 10);
    if (isNaN(port) || port <= 0 || port > 65535) {
      throw new Error(`Invalid port in URL: ${url}`);
    }
  } else {
    // Use default port based on TLS setting
    port = useTls ? DEFAULT_REST_PORT : DEFAULT_GRPC_PORT;
  }

  return { host, port, useTls };
}

/**
 * Builder for QdrantConfig with fluent API.
 */
export class QdrantConfigBuilder {
  private config: QdrantConfig;

  constructor() {
    this.config = createDefaultConfig();
  }

  /**
   * Sets the host.
   * @param host - The Qdrant server host.
   * @returns The builder instance for chaining.
   */
  withHost(host: string): this {
    this.config.host = host;
    return this;
  }

  /**
   * Sets the port.
   * @param port - The Qdrant server port.
   * @returns The builder instance for chaining.
   */
  withPort(port: number): this {
    this.config.port = port;
    return this;
  }

  /**
   * Sets the API key.
   * Automatically enables TLS if not explicitly disabled.
   * @param apiKey - The API key for authentication.
   * @returns The builder instance for chaining.
   */
  withApiKey(apiKey: string): this {
    this.config.apiKey = apiKey;
    // Auto-enable TLS if API key is provided
    if (apiKey && !this.config.useTls) {
      this.config.useTls = true;
    }
    return this;
  }

  /**
   * Enables or disables TLS.
   * @param useTls - Whether to use TLS/SSL.
   * @returns The builder instance for chaining.
   */
  withTls(useTls: boolean): this {
    this.config.useTls = useTls;
    return this;
  }

  /**
   * Sets the CA certificate path for TLS verification.
   * @param caCertPath - Path to the CA certificate file.
   * @returns The builder instance for chaining.
   */
  withCaCertPath(caCertPath: string): this {
    this.config.caCertPath = caCertPath;
    return this;
  }

  /**
   * Enables or disables TLS certificate verification.
   * @param verifyTls - Whether to verify TLS certificates.
   * @returns The builder instance for chaining.
   */
  withVerifyTls(verifyTls: boolean): this {
    this.config.verifyTls = verifyTls;
    return this;
  }

  /**
   * Sets the request timeout.
   * @param timeout - The timeout in milliseconds.
   * @returns The builder instance for chaining.
   */
  withTimeout(timeout: number): this {
    this.config.timeout = timeout;
    return this;
  }

  /**
   * Sets the maximum number of retries.
   * @param maxRetries - The maximum retry attempts.
   * @returns The builder instance for chaining.
   */
  withMaxRetries(maxRetries: number): this {
    this.config.maxRetries = maxRetries;
    return this;
  }

  /**
   * Sets the connection pool size.
   * @param poolSize - The connection pool size.
   * @returns The builder instance for chaining.
   */
  withConnectionPoolSize(poolSize: number): this {
    this.config.connectionPoolSize = poolSize;
    return this;
  }

  /**
   * Parses and applies settings from a Qdrant URL.
   * @param url - The Qdrant URL to parse.
   * @returns The builder instance for chaining.
   * @throws {Error} If the URL format is invalid.
   */
  withUrl(url: string): this {
    const parsed = parseQdrantUrl(url);
    this.config.host = parsed.host;
    this.config.port = parsed.port;
    this.config.useTls = parsed.useTls;
    return this;
  }

  /**
   * Configures for Qdrant Cloud with the given URL and API key.
   * This is a convenience method that:
   * - Parses the cloud URL
   * - Enables TLS
   * - Sets the API key
   * - Enables TLS verification
   *
   * @param cloudUrl - The Qdrant Cloud URL (e.g., "https://xyz-example.eu-central.aws.cloud.qdrant.io:6333").
   * @param apiKey - The Qdrant Cloud API key.
   * @returns The builder instance for chaining.
   */
  forCloud(cloudUrl: string, apiKey: string): this {
    const parsed = parseQdrantUrl(cloudUrl);
    this.config.host = parsed.host;
    this.config.port = parsed.port;
    this.config.useTls = true; // Always use TLS for cloud
    this.config.apiKey = apiKey;
    this.config.verifyTls = true;
    return this;
  }

  /**
   * Builds and validates the configuration.
   * @returns The validated configuration.
   * @throws {Error} If the configuration is invalid.
   */
  build(): QdrantConfig {
    validateConfig(this.config);
    return { ...this.config };
  }
}

/**
 * Creates a Qdrant configuration from environment variables.
 *
 * Environment variables:
 * - QDRANT_URL: Full URL (overrides host/port) (e.g., "https://localhost:6333")
 * - QDRANT_HOST: Server host
 * - QDRANT_PORT: Server port
 * - QDRANT_API_KEY: API key for authentication
 * - QDRANT_TLS: Enable TLS (true/false)
 * - QDRANT_CA_CERT: Path to CA certificate file
 * - QDRANT_VERIFY_TLS: Verify TLS certificates (true/false)
 * - QDRANT_TIMEOUT_SECS: Request timeout in seconds
 * - QDRANT_MAX_RETRIES: Maximum retry attempts
 * - QDRANT_POOL_SIZE: Connection pool size
 *
 * @returns A Qdrant configuration builder pre-configured from environment variables.
 */
export function createConfigFromEnv(): QdrantConfigBuilder {
  const builder = new QdrantConfigBuilder();

  // URL takes precedence over host/port
  const url = process.env.QDRANT_URL;
  if (url) {
    try {
      builder.withUrl(url);
    } catch (error) {
      throw new Error(
        `Failed to parse QDRANT_URL environment variable: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  } else {
    // Parse host and port separately
    const host = process.env.QDRANT_HOST;
    if (host) {
      builder.withHost(host);
    }

    const port = process.env.QDRANT_PORT;
    if (port) {
      const portNum = parseInt(port, 10);
      if (isNaN(portNum)) {
        throw new Error(`Invalid QDRANT_PORT environment variable: ${port}`);
      }
      builder.withPort(portNum);
    }
  }

  // API key
  const apiKey = process.env.QDRANT_API_KEY;
  if (apiKey) {
    builder.withApiKey(apiKey);
  }

  // TLS settings
  const useTls = process.env.QDRANT_TLS;
  if (useTls !== undefined) {
    builder.withTls(useTls.toLowerCase() === 'true');
  }

  const caCertPath = process.env.QDRANT_CA_CERT;
  if (caCertPath) {
    builder.withCaCertPath(caCertPath);
  }

  const verifyTls = process.env.QDRANT_VERIFY_TLS;
  if (verifyTls !== undefined) {
    builder.withVerifyTls(verifyTls.toLowerCase() === 'true');
  }

  // Timeout
  const timeoutSecs = process.env.QDRANT_TIMEOUT_SECS;
  if (timeoutSecs) {
    const timeout = parseInt(timeoutSecs, 10);
    if (isNaN(timeout)) {
      throw new Error(`Invalid QDRANT_TIMEOUT_SECS environment variable: ${timeoutSecs}`);
    }
    builder.withTimeout(timeout * 1000);
  }

  // Max retries
  const maxRetries = process.env.QDRANT_MAX_RETRIES;
  if (maxRetries) {
    const retries = parseInt(maxRetries, 10);
    if (isNaN(retries)) {
      throw new Error(`Invalid QDRANT_MAX_RETRIES environment variable: ${maxRetries}`);
    }
    builder.withMaxRetries(retries);
  }

  // Pool size
  const poolSize = process.env.QDRANT_POOL_SIZE;
  if (poolSize) {
    const size = parseInt(poolSize, 10);
    if (isNaN(size)) {
      throw new Error(`Invalid QDRANT_POOL_SIZE environment variable: ${poolSize}`);
    }
    builder.withConnectionPoolSize(size);
  }

  return builder;
}

/**
 * Sanitizes a configuration for logging by removing sensitive information.
 * @param config - The configuration to sanitize.
 * @returns A sanitized copy of the configuration safe for logging.
 */
export function sanitizeConfigForLogging(config: QdrantConfig): Partial<QdrantConfig> {
  return {
    host: config.host,
    port: config.port,
    apiKey: config.apiKey ? '[REDACTED]' : undefined,
    useTls: config.useTls,
    caCertPath: config.caCertPath,
    verifyTls: config.verifyTls,
    timeout: config.timeout,
    maxRetries: config.maxRetries,
    connectionPoolSize: config.connectionPoolSize,
  };
}

/**
 * Namespace for QdrantConfig-related utilities.
 */
export namespace QdrantConfig {
  /**
   * Creates a new configuration builder.
   * @returns A new QdrantConfigBuilder instance.
   */
  export function builder(): QdrantConfigBuilder {
    return new QdrantConfigBuilder();
  }

  /**
   * Creates a default configuration.
   * @returns The default configuration.
   */
  export function defaultConfig(): QdrantConfig {
    return createDefaultConfig();
  }

  /**
   * Validates a configuration.
   * @param config - The configuration to validate.
   * @throws {Error} If the configuration is invalid.
   */
  export function validate(config: QdrantConfig): void {
    validateConfig(config);
  }

  /**
   * Creates a configuration from environment variables.
   * @returns A configuration builder pre-configured from environment variables.
   */
  export function fromEnv(): QdrantConfigBuilder {
    return createConfigFromEnv();
  }

  /**
   * Creates a configuration for Qdrant Cloud.
   * @param cloudUrl - The Qdrant Cloud URL.
   * @param apiKey - The Qdrant Cloud API key.
   * @returns A configuration builder pre-configured for Qdrant Cloud.
   */
  export function cloud(cloudUrl: string, apiKey: string): QdrantConfigBuilder {
    return new QdrantConfigBuilder().forCloud(cloudUrl, apiKey);
  }

  /**
   * Parses a Qdrant URL.
   * @param url - The URL to parse.
   * @returns Parsed configuration components.
   * @throws {Error} If the URL format is invalid.
   */
  export function parseUrl(url: string): Pick<QdrantConfig, 'host' | 'port' | 'useTls'> {
    return parseQdrantUrl(url);
  }

  /**
   * Sanitizes a configuration for logging.
   * @param config - The configuration to sanitize.
   * @returns A sanitized copy safe for logging.
   */
  export function sanitize(config: QdrantConfig): Partial<QdrantConfig> {
    return sanitizeConfigForLogging(config);
  }
}
