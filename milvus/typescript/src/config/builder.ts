import { ConsistencyLevel } from '../types/consistency.js';
import {
  MilvusConfig,
  TlsConfig,
  PoolConfig,
  RetryConfig,
  createDefaultConfig,
  DEFAULT_POOL_CONFIG,
  DEFAULT_RETRY_CONFIG,
} from './types.js';
import { MilvusConfigurationError } from '../errors/index.js';

/**
 * Builder for creating Milvus configuration with validation.
 */
export class MilvusConfigBuilder {
  private config: MilvusConfig;

  constructor() {
    this.config = createDefaultConfig();
  }

  /**
   * Set the Milvus host address.
   */
  host(host: string): this {
    this.config.host = host;
    return this;
  }

  /**
   * Set the Milvus gRPC port.
   */
  port(port: number): this {
    this.config.port = port;
    return this;
  }

  /**
   * Set token authentication.
   */
  authToken(token: string): this {
    this.config.auth = { type: 'token', token };
    return this;
  }

  /**
   * Set username/password authentication.
   */
  authUserPass(username: string, password: string): this {
    this.config.auth = { type: 'userPass', username, password };
    return this;
  }

  /**
   * Disable authentication.
   */
  authNone(): this {
    this.config.auth = { type: 'none' };
    return this;
  }

  /**
   * Set TLS configuration.
   */
  tls(tlsConfig: TlsConfig): this {
    this.config.tls = tlsConfig;
    return this;
  }

  /**
   * Enable TLS with default settings.
   */
  tlsEnabled(): this {
    this.config.tls = {};
    return this;
  }

  /**
   * Set connection pool configuration.
   */
  poolConfig(poolConfig: Partial<PoolConfig>): this {
    this.config.poolConfig = { ...DEFAULT_POOL_CONFIG, ...poolConfig };
    return this;
  }

  /**
   * Set request timeout in milliseconds.
   */
  timeout(timeoutMs: number): this {
    this.config.timeoutMs = timeoutMs;
    return this;
  }

  /**
   * Set retry configuration.
   */
  retryConfig(retryConfig: Partial<RetryConfig>): this {
    this.config.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    return this;
  }

  /**
   * Set default consistency level.
   */
  defaultConsistency(level: ConsistencyLevel): this {
    this.config.defaultConsistency = level;
    return this;
  }

  /**
   * Enable or disable auto-loading collections.
   */
  autoLoad(enabled: boolean): this {
    this.config.autoLoad = enabled;
    return this;
  }

  /**
   * Build and validate the configuration.
   */
  build(): MilvusConfig {
    this.validate();
    return { ...this.config };
  }

  /**
   * Validate the configuration.
   */
  private validate(): void {
    if (!this.config.host || this.config.host.trim() === '') {
      throw new MilvusConfigurationError('Host is required');
    }

    if (this.config.port < 1 || this.config.port > 65535) {
      throw new MilvusConfigurationError(
        `Invalid port: ${this.config.port}. Must be between 1 and 65535`
      );
    }

    if (this.config.timeoutMs < 0) {
      throw new MilvusConfigurationError(
        `Invalid timeout: ${this.config.timeoutMs}. Must be non-negative`
      );
    }

    if (this.config.poolConfig.maxConnections < 1) {
      throw new MilvusConfigurationError(
        'Maximum pool connections must be at least 1'
      );
    }

    if (
      this.config.poolConfig.minConnections > this.config.poolConfig.maxConnections
    ) {
      throw new MilvusConfigurationError(
        'Minimum pool connections cannot exceed maximum'
      );
    }

    if (this.config.retryConfig.maxRetries < 0) {
      throw new MilvusConfigurationError('Max retries must be non-negative');
    }
  }

  /**
   * Create configuration from environment variables.
   */
  static fromEnv(): MilvusConfig {
    const builder = new MilvusConfigBuilder();

    // Host and port
    const host = process.env['MILVUS_HOST'];
    if (host) {
      builder.host(host);
    }

    const port = process.env['MILVUS_PORT'];
    if (port) {
      const portNum = parseInt(port, 10);
      if (!isNaN(portNum)) {
        builder.port(portNum);
      }
    }

    // Authentication
    const token = process.env['MILVUS_TOKEN'];
    const username = process.env['MILVUS_USERNAME'];
    const password = process.env['MILVUS_PASSWORD'];

    if (token) {
      builder.authToken(token);
    } else if (username && password) {
      builder.authUserPass(username, password);
    }

    // TLS
    if (process.env['MILVUS_TLS_ENABLED'] === 'true') {
      builder.tls({
        caCertPath: process.env['MILVUS_TLS_CA_CERT'],
        clientCertPath: process.env['MILVUS_TLS_CLIENT_CERT'],
        clientKeyPath: process.env['MILVUS_TLS_CLIENT_KEY'],
        serverName: process.env['MILVUS_TLS_SERVER_NAME'],
        skipVerify: process.env['MILVUS_TLS_SKIP_VERIFY'] === 'true',
      });
    }

    // Pool config
    const maxConnections = process.env['MILVUS_POOL_MAX_CONNECTIONS'];
    const minConnections = process.env['MILVUS_POOL_MIN_CONNECTIONS'];
    if (maxConnections || minConnections) {
      builder.poolConfig({
        maxConnections: maxConnections ? parseInt(maxConnections, 10) : undefined,
        minConnections: minConnections ? parseInt(minConnections, 10) : undefined,
      });
    }

    // Timeout
    const timeout = process.env['MILVUS_TIMEOUT_SECONDS'];
    if (timeout) {
      builder.timeout(parseInt(timeout, 10) * 1000);
    }

    // Consistency
    const consistency = process.env['MILVUS_DEFAULT_CONSISTENCY'];
    if (consistency) {
      const level = ConsistencyLevel[consistency as keyof typeof ConsistencyLevel];
      if (level) {
        builder.defaultConsistency(level);
      }
    }

    // Auto-load
    if (process.env['MILVUS_AUTO_LOAD'] === 'false') {
      builder.autoLoad(false);
    }

    return builder.build();
  }
}

/**
 * Create a new configuration builder.
 */
export function createConfigBuilder(): MilvusConfigBuilder {
  return new MilvusConfigBuilder();
}

/**
 * Create configuration from environment variables.
 */
export function createConfigFromEnv(): MilvusConfig {
  return MilvusConfigBuilder.fromEnv();
}
