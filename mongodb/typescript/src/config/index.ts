/**
 * MongoDB client configuration and builder following SPARC specification.
 */

// ============================================================================
// Simulation Mode
// ============================================================================

/**
 * Simulation mode for testing.
 */
export type SimulationMode =
  | { type: 'disabled' }
  | { type: 'recording'; path: string }
  | { type: 'replay'; path: string };

// ============================================================================
// Rate Limit Configuration
// ============================================================================

/**
 * Rate limit configuration.
 */
export interface RateLimitConfig {
  /** Operations per second limit. Default: 100 */
  operationsPerSecond: number;
  /** Maximum time to wait in queue (ms). Default: 30000 */
  queueTimeout: number;
  /** Maximum pending operations in queue. Default: 1000 */
  maxQueueSize: number;
  /** Whether to adapt rate based on server responses. Default: true */
  adaptiveRateLimit: boolean;
}

// ============================================================================
// Retry Configuration
// ============================================================================

/**
 * Retry configuration.
 */
export interface RetryConfig {
  /** Maximum retry attempts. Default: 3 */
  maxRetries: number;
  /** Maximum retries for rate limit errors. Default: 5 */
  maxRateLimitRetries: number;
  /** Initial backoff delay (ms). Default: 1000 */
  initialBackoffMs: number;
  /** Maximum backoff delay (ms). Default: 60000 */
  maxBackoffMs: number;
  /** Backoff multiplier. Default: 2 */
  backoffMultiplier: number;
  /** Jitter factor (0-1). Default: 0.1 */
  jitterFactor: number;
}

// ============================================================================
// Circuit Breaker Configuration
// ============================================================================

/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerConfig {
  /** Failure threshold before opening circuit. Default: 5 */
  failureThreshold: number;
  /** Success threshold to close circuit. Default: 2 */
  successThreshold: number;
  /** Reset timeout (ms). Default: 30000 */
  resetTimeoutMs: number;
  /** Enable circuit breaker. Default: true */
  enabled: boolean;
}

// ============================================================================
// MongoDB Connection Options
// ============================================================================

/**
 * Read concern level for MongoDB operations.
 */
export type ReadConcernLevel = 'local' | 'available' | 'majority' | 'linearizable' | 'snapshot';

/**
 * Write concern options for MongoDB operations.
 */
export interface WriteConcernOptions {
  /** Number of nodes to acknowledge writes, or 'majority'. Default: 'majority' */
  w: number | 'majority';
  /** Whether to wait for journal acknowledgment. Default: true */
  j: boolean;
  /** Write timeout in milliseconds */
  wtimeoutMs?: number;
}

/**
 * MongoDB connection pool and behavior options.
 */
export interface MongoDBConnectionOptions {
  /** Maximum number of connections in the pool. Default: 10 */
  maxPoolSize: number;
  /** Minimum number of connections in the pool. Default: 1 */
  minPoolSize: number;
  /** Maximum idle time for a connection (ms). Default: 60000 */
  maxIdleTimeMs: number;
  /** Connection timeout (ms). Default: 10000 */
  connectTimeoutMs: number;
  /** Server selection timeout (ms). Default: 30000 */
  serverSelectionTimeoutMs: number;
  /** Read preference for queries. Default: 'primary' */
  readPreference: 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest';
  /** Write concern options. Default: { w: 'majority', j: true } */
  writeConcern: WriteConcernOptions;
  /** Read concern level. Default: 'majority' */
  readConcern: ReadConcernLevel;
  /** Retry writes on transient errors. Default: true */
  retryWrites: boolean;
  /** Retry reads on transient errors. Default: true */
  retryReads: boolean;
  /** Compression algorithms to use */
  compressors?: ('snappy' | 'zlib' | 'zstd')[];
}

// ============================================================================
// Main Configuration Interface
// ============================================================================

/**
 * MongoDB client configuration.
 */
export interface MongoDBConfig {
  /** MongoDB connection URI (e.g., "mongodb://localhost:27017" or "mongodb+srv://...") */
  connectionUri: SecretString;
  /** Default database name */
  defaultDatabase: string;
  /** Connection pool and behavior options */
  connectionOptions: MongoDBConnectionOptions;
  /** Rate limit configuration */
  rateLimitConfig: RateLimitConfig;
  /** Retry configuration */
  retryConfig: RetryConfig;
  /** Circuit breaker configuration */
  circuitBreakerConfig: CircuitBreakerConfig;
  /** Simulation mode */
  simulationMode: SimulationMode;
  /** Request timeout in milliseconds. Default: 30000 */
  requestTimeoutMs: number;
  /** User agent string */
  userAgent: string;
}

// ============================================================================
// Default Configurations
// ============================================================================

/**
 * Default rate limit configuration.
 * MongoDB can handle much higher throughput than REST APIs.
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  operationsPerSecond: 100,
  queueTimeout: 30000,
  maxQueueSize: 1000,
  adaptiveRateLimit: true,
};

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  maxRateLimitRetries: 5,
  initialBackoffMs: 1000,
  maxBackoffMs: 60000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeoutMs: 30000,
  enabled: true,
};

/**
 * Default write concern options.
 * Uses 'majority' for durability and journaling for safety.
 */
export const DEFAULT_WRITE_CONCERN: WriteConcernOptions = {
  w: 'majority',
  j: true,
};

/**
 * Default MongoDB connection options.
 */
export const DEFAULT_CONNECTION_OPTIONS: MongoDBConnectionOptions = {
  maxPoolSize: 10,
  minPoolSize: 1,
  maxIdleTimeMs: 60000,
  connectTimeoutMs: 10000,
  serverSelectionTimeoutMs: 30000,
  readPreference: 'primary',
  writeConcern: DEFAULT_WRITE_CONCERN,
  readConcern: 'majority',
  retryWrites: true,
  retryReads: true,
};

/**
 * Default request timeout.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/**
 * Default user agent.
 */
export const DEFAULT_USER_AGENT = 'LLMDevOps-MongoDB/1.0.0';

// ============================================================================
// SecretString
// ============================================================================

/**
 * SecretString wrapper to prevent accidental logging of sensitive values.
 * The value is only accessible via the expose() method.
 */
export class SecretString {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  /**
   * Exposes the secret value. Use with caution.
   */
  expose(): string {
    return this.value;
  }

  /**
   * Returns a redacted string for logging.
   */
  toString(): string {
    return '[REDACTED]';
  }

  /**
   * Returns a redacted value for JSON serialization.
   */
  toJSON(): string {
    return '[REDACTED]';
  }
}

// ============================================================================
// Configuration Error
// ============================================================================

/**
 * Configuration validation error.
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(`Configuration error: ${message}`);
    this.name = 'ConfigurationError';
  }
}

/**
 * No connection URI configured.
 */
export class NoConnectionUriError extends Error {
  constructor() {
    super('No MongoDB connection URI configured (MONGODB_URI or connectionUri required)');
    this.name = 'NoConnectionUriError';
  }
}

// ============================================================================
// Configuration Builder
// ============================================================================

/**
 * Builder for MongoDB client configuration.
 */
export class MongoDBConfigBuilder {
  private connectionUri?: SecretString;
  private defaultDatabase?: string;
  private connectionOptions: MongoDBConnectionOptions = { ...DEFAULT_CONNECTION_OPTIONS };
  private rateLimitConfig: RateLimitConfig = { ...DEFAULT_RATE_LIMIT_CONFIG };
  private retryConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG };
  private circuitBreakerConfig: CircuitBreakerConfig = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG };
  private simulationMode: SimulationMode = { type: 'disabled' };
  private requestTimeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS;
  private userAgent: string = DEFAULT_USER_AGENT;

  /**
   * Sets the MongoDB connection URI.
   * @param uri - Connection URI (e.g., "mongodb://localhost:27017" or "mongodb+srv://...")
   */
  withConnectionUri(uri: string): this {
    if (!uri || uri.trim().length === 0) {
      throw new ConfigurationError('Connection URI cannot be empty');
    }
    // Basic URI validation
    const trimmedUri = uri.trim();
    if (!trimmedUri.startsWith('mongodb://') && !trimmedUri.startsWith('mongodb+srv://')) {
      throw new ConfigurationError('Connection URI must start with "mongodb://" or "mongodb+srv://"');
    }
    this.connectionUri = new SecretString(trimmedUri);
    return this;
  }

  /**
   * Sets the default database name.
   * @param database - Database name
   */
  withDefaultDatabase(database: string): this {
    if (!database || database.trim().length === 0) {
      throw new ConfigurationError('Database name cannot be empty');
    }
    this.defaultDatabase = database.trim();
    return this;
  }

  /**
   * Sets the connection options.
   */
  withConnectionOptions(options: Partial<MongoDBConnectionOptions>): this {
    // Validate pool sizes
    if (options.maxPoolSize !== undefined && options.maxPoolSize <= 0) {
      throw new ConfigurationError('Max pool size must be positive');
    }
    if (options.minPoolSize !== undefined && options.minPoolSize < 0) {
      throw new ConfigurationError('Min pool size must be non-negative');
    }
    if (
      options.maxPoolSize !== undefined &&
      options.minPoolSize !== undefined &&
      options.minPoolSize > options.maxPoolSize
    ) {
      throw new ConfigurationError('Min pool size cannot exceed max pool size');
    }

    // Validate timeouts
    if (options.connectTimeoutMs !== undefined && options.connectTimeoutMs <= 0) {
      throw new ConfigurationError('Connect timeout must be positive');
    }
    if (options.serverSelectionTimeoutMs !== undefined && options.serverSelectionTimeoutMs <= 0) {
      throw new ConfigurationError('Server selection timeout must be positive');
    }

    this.connectionOptions = { ...this.connectionOptions, ...options };
    return this;
  }

  /**
   * Sets the read preference.
   * @param readPreference - Read preference mode
   */
  withReadPreference(
    readPreference: 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest'
  ): this {
    this.connectionOptions.readPreference = readPreference;
    return this;
  }

  /**
   * Sets the write concern.
   * @param writeConcern - Write concern options
   */
  withWriteConcern(writeConcern: Partial<WriteConcernOptions>): this {
    this.connectionOptions.writeConcern = {
      ...this.connectionOptions.writeConcern,
      ...writeConcern,
    };
    return this;
  }

  /**
   * Sets the read concern level.
   * @param readConcern - Read concern level
   */
  withReadConcern(readConcern: ReadConcernLevel): this {
    this.connectionOptions.readConcern = readConcern;
    return this;
  }

  /**
   * Sets compression algorithms.
   * @param compressors - Array of compression algorithms
   */
  withCompressors(compressors: ('snappy' | 'zlib' | 'zstd')[]): this {
    this.connectionOptions.compressors = compressors;
    return this;
  }

  /**
   * Sets the rate limit configuration.
   */
  withRateLimitConfig(config: Partial<RateLimitConfig>): this {
    this.rateLimitConfig = { ...this.rateLimitConfig, ...config };
    return this;
  }

  /**
   * Sets the retry configuration.
   */
  withRetryConfig(config: Partial<RetryConfig>): this {
    this.retryConfig = { ...this.retryConfig, ...config };
    return this;
  }

  /**
   * Sets the circuit breaker configuration.
   */
  withCircuitBreakerConfig(config: Partial<CircuitBreakerConfig>): this {
    this.circuitBreakerConfig = { ...this.circuitBreakerConfig, ...config };
    return this;
  }

  /**
   * Enables recording simulation mode.
   * @param path - Path to save recordings
   */
  withRecording(path: string): this {
    this.simulationMode = { type: 'recording', path };
    return this;
  }

  /**
   * Enables replay simulation mode.
   * @param path - Path to load recordings from
   */
  withReplay(path: string): this {
    this.simulationMode = { type: 'replay', path };
    return this;
  }

  /**
   * Sets the request timeout.
   * @param timeoutMs - Timeout in milliseconds
   */
  withRequestTimeout(timeoutMs: number): this {
    if (timeoutMs <= 0) {
      throw new ConfigurationError('Request timeout must be positive');
    }
    this.requestTimeoutMs = timeoutMs;
    return this;
  }

  /**
   * Sets the user agent string.
   * @param userAgent - User agent string
   */
  withUserAgent(userAgent: string): this {
    this.userAgent = userAgent;
    return this;
  }

  /**
   * Creates a builder from environment variables.
   *
   * Environment variables:
   * - MONGODB_URI: Connection URI (required)
   * - MONGODB_DATABASE: Default database name (required)
   * - MONGODB_MAX_POOL_SIZE: Maximum pool size
   * - MONGODB_MIN_POOL_SIZE: Minimum pool size
   * - MONGODB_READ_PREFERENCE: Read preference (primary, primaryPreferred, etc.)
   * - MONGODB_WRITE_CONCERN_W: Write concern w value (number or 'majority')
   * - MONGODB_WRITE_CONCERN_J: Write concern journal flag (true/false)
   * - MONGODB_READ_CONCERN: Read concern level
   * - MONGODB_RETRY_WRITES: Retry writes flag (true/false)
   * - MONGODB_RETRY_READS: Retry reads flag (true/false)
   * - MONGODB_COMPRESSORS: Compression algorithms (comma-separated)
   * - MONGODB_TIMEOUT_MS: Request timeout in milliseconds
   * - MONGODB_OPERATIONS_PER_SECOND: Rate limit operations per second
   * - MONGODB_MAX_RETRIES: Maximum retry attempts
   */
  static fromEnv(): MongoDBConfigBuilder {
    const builder = new MongoDBConfigBuilder();

    // Connection URI (required)
    const uri = process.env.MONGODB_URI;
    if (uri) {
      builder.withConnectionUri(uri);
    }

    // Default database (required)
    const database = process.env.MONGODB_DATABASE;
    if (database) {
      builder.withDefaultDatabase(database);
    }

    // Connection pool options
    const maxPoolSize = process.env.MONGODB_MAX_POOL_SIZE;
    if (maxPoolSize) {
      builder.withConnectionOptions({ maxPoolSize: parseInt(maxPoolSize, 10) });
    }

    const minPoolSize = process.env.MONGODB_MIN_POOL_SIZE;
    if (minPoolSize) {
      builder.withConnectionOptions({ minPoolSize: parseInt(minPoolSize, 10) });
    }

    // Read preference
    const readPreference = process.env.MONGODB_READ_PREFERENCE;
    if (readPreference) {
      const validPreferences = ['primary', 'primaryPreferred', 'secondary', 'secondaryPreferred', 'nearest'];
      if (validPreferences.includes(readPreference)) {
        builder.withReadPreference(
          readPreference as 'primary' | 'primaryPreferred' | 'secondary' | 'secondaryPreferred' | 'nearest'
        );
      }
    }

    // Write concern
    const writeConcernW = process.env.MONGODB_WRITE_CONCERN_W;
    const writeConcernJ = process.env.MONGODB_WRITE_CONCERN_J;
    if (writeConcernW || writeConcernJ) {
      const writeConcern: Partial<WriteConcernOptions> = {};
      if (writeConcernW) {
        writeConcern.w = writeConcernW === 'majority' ? 'majority' : parseInt(writeConcernW, 10);
      }
      if (writeConcernJ) {
        writeConcern.j = writeConcernJ === 'true';
      }
      builder.withWriteConcern(writeConcern);
    }

    // Read concern
    const readConcern = process.env.MONGODB_READ_CONCERN;
    if (readConcern) {
      const validConcerns = ['local', 'available', 'majority', 'linearizable', 'snapshot'];
      if (validConcerns.includes(readConcern)) {
        builder.withReadConcern(readConcern as ReadConcernLevel);
      }
    }

    // Retry options
    const retryWrites = process.env.MONGODB_RETRY_WRITES;
    if (retryWrites !== undefined) {
      builder.withConnectionOptions({ retryWrites: retryWrites === 'true' });
    }

    const retryReads = process.env.MONGODB_RETRY_READS;
    if (retryReads !== undefined) {
      builder.withConnectionOptions({ retryReads: retryReads === 'true' });
    }

    // Compression
    const compressors = process.env.MONGODB_COMPRESSORS;
    if (compressors) {
      const compressorList = compressors.split(',').map(c => c.trim());
      const validCompressors = compressorList.filter(c =>
        ['snappy', 'zlib', 'zstd'].includes(c)
      ) as ('snappy' | 'zlib' | 'zstd')[];
      if (validCompressors.length > 0) {
        builder.withCompressors(validCompressors);
      }
    }

    // Timeout
    const timeout = process.env.MONGODB_TIMEOUT_MS;
    if (timeout) {
      builder.withRequestTimeout(parseInt(timeout, 10));
    }

    // Rate limit
    const operationsPerSecond = process.env.MONGODB_OPERATIONS_PER_SECOND;
    if (operationsPerSecond) {
      builder.withRateLimitConfig({ operationsPerSecond: parseInt(operationsPerSecond, 10) });
    }

    // Retry
    const maxRetries = process.env.MONGODB_MAX_RETRIES;
    if (maxRetries) {
      builder.withRetryConfig({ maxRetries: parseInt(maxRetries, 10) });
    }

    return builder;
  }

  /**
   * Builds the MongoDB configuration.
   * @throws ConfigurationError if required fields are missing
   */
  build(): MongoDBConfig {
    if (!this.connectionUri) {
      throw new NoConnectionUriError();
    }
    if (!this.defaultDatabase) {
      throw new ConfigurationError('Default database name is required');
    }

    return {
      connectionUri: this.connectionUri,
      defaultDatabase: this.defaultDatabase,
      connectionOptions: { ...this.connectionOptions },
      rateLimitConfig: { ...this.rateLimitConfig },
      retryConfig: { ...this.retryConfig },
      circuitBreakerConfig: { ...this.circuitBreakerConfig },
      simulationMode: this.simulationMode,
      requestTimeoutMs: this.requestTimeoutMs,
      userAgent: this.userAgent,
    };
  }
}
