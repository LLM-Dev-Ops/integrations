/**
 * Configuration types for the Pinecone client.
 * @module config
 */

/** Default request timeout in milliseconds. */
export const DEFAULT_TIMEOUT = 30000;

/** Default maximum retry attempts. */
export const DEFAULT_MAX_RETRIES = 3;

/** Default initial backoff in milliseconds. */
export const DEFAULT_INITIAL_BACKOFF = 100;

/** Default maximum backoff in milliseconds. */
export const DEFAULT_MAX_BACKOFF = 10000;

/** Default backoff multiplier. */
export const DEFAULT_BACKOFF_MULTIPLIER = 2.0;

/** Default maximum connections. */
export const DEFAULT_MAX_CONNECTIONS = 10;

/** Default minimum connections. */
export const DEFAULT_MIN_CONNECTIONS = 1;

/** Default idle timeout in milliseconds (5 minutes). */
export const DEFAULT_IDLE_TIMEOUT = 300000;

/** Default max connection lifetime in milliseconds (30 minutes). */
export const DEFAULT_MAX_LIFETIME = 1800000;

/** Default acquire timeout in milliseconds. */
export const DEFAULT_ACQUIRE_TIMEOUT = 30000;

/**
 * Connection pool configuration.
 */
export interface PoolConfig {
  /** Maximum number of connections in the pool. */
  maxConnections: number;
  /** Minimum number of connections to maintain. */
  minConnections: number;
  /** Idle timeout in milliseconds before connection is closed. */
  idleTimeout: number;
  /** Maximum lifetime of a connection in milliseconds. */
  maxLifetime: number;
  /** Timeout for acquiring a connection from the pool in milliseconds. */
  acquireTimeout: number;
}

/**
 * Default connection pool configuration.
 */
export const DEFAULT_POOL_CONFIG: PoolConfig = {
  maxConnections: DEFAULT_MAX_CONNECTIONS,
  minConnections: DEFAULT_MIN_CONNECTIONS,
  idleTimeout: DEFAULT_IDLE_TIMEOUT,
  maxLifetime: DEFAULT_MAX_LIFETIME,
  acquireTimeout: DEFAULT_ACQUIRE_TIMEOUT,
};

/**
 * Retry configuration for failed requests.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts. */
  maxRetries: number;
  /** Initial backoff delay in milliseconds. */
  initialBackoff: number;
  /** Maximum backoff delay in milliseconds. */
  maxBackoff: number;
  /** Backoff multiplier for exponential backoff. */
  backoffMultiplier: number;
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: DEFAULT_MAX_RETRIES,
  initialBackoff: DEFAULT_INITIAL_BACKOFF,
  maxBackoff: DEFAULT_MAX_BACKOFF,
  backoffMultiplier: DEFAULT_BACKOFF_MULTIPLIER,
};

/**
 * Pinecone client configuration.
 */
export interface PineconeConfig {
  /** Pinecone API key (required). */
  apiKey: string;
  /** Pinecone environment (required), e.g., "us-east-1-aws". */
  environment: string;
  /** Index name (required). */
  indexName: string;
  /** Optional project ID for URL construction. */
  projectId?: string;
  /** Optional base URL override (for testing). */
  baseUrl?: string;
  /** Request timeout in milliseconds. */
  timeout?: number;
  /** Connection pool configuration. */
  poolConfig?: PoolConfig;
  /** Retry configuration. */
  retryConfig?: RetryConfig;
}

/**
 * Validated Pinecone configuration with all required defaults applied.
 */
export interface ValidatedPineconeConfig {
  /** Pinecone API key. */
  apiKey: string;
  /** Pinecone environment, e.g., "us-east-1-aws". */
  environment: string;
  /** Index name. */
  indexName: string;
  /** Optional project ID for URL construction. */
  projectId?: string;
  /** Optional base URL override (for testing). */
  baseUrl?: string;
  /** Request timeout in milliseconds. */
  timeout: number;
  /** Connection pool configuration. */
  poolConfig: PoolConfig;
  /** Retry configuration. */
  retryConfig: RetryConfig;
}

/**
 * Validates and returns a complete Pinecone configuration with defaults applied.
 * @param config - The configuration to validate.
 * @returns A complete configuration with all optional fields filled with defaults.
 * @throws {Error} If required fields are missing or invalid.
 */
export function validateConfig(config: PineconeConfig): ValidatedPineconeConfig {
  // Validate required fields
  if (!config.apiKey || config.apiKey.trim() === '') {
    throw new Error('API key is required and cannot be empty');
  }

  if (!config.environment || config.environment.trim() === '') {
    throw new Error('Environment is required and cannot be empty');
  }

  if (!config.indexName || config.indexName.trim() === '') {
    throw new Error('Index name is required and cannot be empty');
  }

  // Validate timeout if provided
  if (config.timeout !== undefined && config.timeout <= 0) {
    throw new Error('Timeout must be greater than 0');
  }

  // Validate pool config if provided
  if (config.poolConfig) {
    if (config.poolConfig.maxConnections < config.poolConfig.minConnections) {
      throw new Error('maxConnections must be greater than or equal to minConnections');
    }
    if (config.poolConfig.maxConnections <= 0) {
      throw new Error('maxConnections must be greater than 0');
    }
    if (config.poolConfig.minConnections < 0) {
      throw new Error('minConnections must be non-negative');
    }
  }

  // Validate retry config if provided
  if (config.retryConfig) {
    if (config.retryConfig.maxRetries < 0) {
      throw new Error('maxRetries must be non-negative');
    }
    if (config.retryConfig.initialBackoff <= 0) {
      throw new Error('initialBackoff must be greater than 0');
    }
    if (config.retryConfig.maxBackoff < config.retryConfig.initialBackoff) {
      throw new Error('maxBackoff must be greater than or equal to initialBackoff');
    }
    if (config.retryConfig.backoffMultiplier <= 0) {
      throw new Error('backoffMultiplier must be greater than 0');
    }
  }

  // Return configuration with defaults
  return {
    apiKey: config.apiKey,
    environment: config.environment,
    indexName: config.indexName,
    projectId: config.projectId,
    baseUrl: config.baseUrl,
    timeout: config.timeout ?? DEFAULT_TIMEOUT,
    poolConfig: {
      ...DEFAULT_POOL_CONFIG,
      ...config.poolConfig,
    },
    retryConfig: {
      ...DEFAULT_RETRY_CONFIG,
      ...config.retryConfig,
    },
  };
}

/**
 * Resolves the base URL for Pinecone API requests.
 * If baseUrl is provided in config, it is used directly.
 * Otherwise, constructs the URL from indexName, projectId, and environment.
 * @param config - The Pinecone configuration.
 * @returns The resolved base URL.
 * @throws {Error} If projectId is required but not provided.
 */
export function resolveBaseUrl(config: PineconeConfig): string {
  // If baseUrl is explicitly provided, use it
  if (config.baseUrl) {
    return config.baseUrl;
  }

  // For standard Pinecone URLs, projectId is required
  if (!config.projectId) {
    throw new Error(
      'projectId is required when baseUrl is not provided. ' +
      'Format: https://{indexName}-{projectId}.svc.{environment}.pinecone.io'
    );
  }

  // Construct standard Pinecone URL
  return `https://${config.indexName}-${config.projectId}.svc.${config.environment}.pinecone.io`;
}

/**
 * Fluent builder for PineconeConfig.
 * Follows the Anthropic pattern for configuration building.
 */
export class PineconeConfigBuilder {
  private config: Partial<PineconeConfig>;

  constructor() {
    this.config = {};
  }

  /**
   * Sets the API key.
   * @param apiKey - The Pinecone API key.
   * @returns The builder instance for chaining.
   */
  apiKey(apiKey: string): this {
    this.config.apiKey = apiKey;
    return this;
  }

  /**
   * Sets the environment.
   * @param environment - The Pinecone environment (e.g., "us-east-1-aws").
   * @returns The builder instance for chaining.
   */
  environment(environment: string): this {
    this.config.environment = environment;
    return this;
  }

  /**
   * Sets the index name.
   * @param indexName - The name of the Pinecone index.
   * @returns The builder instance for chaining.
   */
  indexName(indexName: string): this {
    this.config.indexName = indexName;
    return this;
  }

  /**
   * Sets the project ID.
   * @param projectId - The Pinecone project ID.
   * @returns The builder instance for chaining.
   */
  projectId(projectId: string): this {
    this.config.projectId = projectId;
    return this;
  }

  /**
   * Sets the base URL override.
   * @param baseUrl - The base URL for API requests.
   * @returns The builder instance for chaining.
   */
  baseUrl(baseUrl: string): this {
    this.config.baseUrl = baseUrl;
    return this;
  }

  /**
   * Sets the request timeout.
   * @param timeout - The timeout in milliseconds.
   * @returns The builder instance for chaining.
   */
  timeout(timeout: number): this {
    this.config.timeout = timeout;
    return this;
  }

  /**
   * Sets the connection pool configuration.
   * @param poolConfig - The pool configuration.
   * @returns The builder instance for chaining.
   */
  poolConfig(poolConfig: Partial<PoolConfig>): this {
    this.config.poolConfig = {
      ...DEFAULT_POOL_CONFIG,
      ...this.config.poolConfig,
      ...poolConfig,
    };
    return this;
  }

  /**
   * Sets the retry configuration.
   * @param retryConfig - The retry configuration.
   * @returns The builder instance for chaining.
   */
  retryConfig(retryConfig: Partial<RetryConfig>): this {
    this.config.retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...this.config.retryConfig,
      ...retryConfig,
    };
    return this;
  }

  /**
   * Builds and validates the configuration.
   * @returns The validated configuration with all defaults applied.
   * @throws {Error} If the configuration is invalid.
   */
  build(): ValidatedPineconeConfig {
    // Ensure required fields are present
    if (!this.config.apiKey || !this.config.environment || !this.config.indexName) {
      throw new Error('apiKey, environment, and indexName are required');
    }

    return validateConfig(this.config as PineconeConfig);
  }
}

/**
 * Namespace for PineconeConfig-related utilities.
 */
export namespace PineconeConfig {
  /**
   * Creates a new configuration builder.
   * @returns A new PineconeConfigBuilder instance.
   */
  export function builder(): PineconeConfigBuilder {
    return new PineconeConfigBuilder();
  }

  /**
   * Validates a configuration.
   * @param config - The configuration to validate.
   * @returns A complete configuration with all defaults applied.
   * @throws {Error} If the configuration is invalid.
   */
  export function validate(config: PineconeConfig): ValidatedPineconeConfig {
    return validateConfig(config);
  }

  /**
   * Resolves the base URL from configuration.
   * @param config - The configuration.
   * @returns The resolved base URL.
   * @throws {Error} If URL cannot be resolved.
   */
  export function getBaseUrl(config: PineconeConfig): string {
    return resolveBaseUrl(config);
  }
}
