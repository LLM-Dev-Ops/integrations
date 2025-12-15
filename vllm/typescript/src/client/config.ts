/**
 * vLLM Client Configuration
 * Validation and defaults for client configuration
 */

import type {
  VllmConfig,
  ServerConfig,
  PoolConfig,
  RetryConfig,
  CircuitBreakerConfig,
  RateLimitConfig,
  BatchConfig,
  defaultPoolConfig,
  defaultRetryConfig,
  defaultCircuitBreakerConfig,
  defaultBatchConfig,
} from '../types/index.js';
import {
  ConfigurationError,
  InvalidServerUrlError,
  InvalidTimeoutError,
  InvalidBatchConfigError,
} from '../types/errors.js';

const DEFAULT_POOL_CONFIG: PoolConfig = {
  maxConnectionsPerServer: 100,
  idleTimeout: 90000,
  acquireTimeout: 5000,
  keepaliveInterval: 30000,
};

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  exponentialBase: 2,
};

const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  openDurationMs: 30000,
};

const DEFAULT_BATCH_CONFIG: BatchConfig = {
  maxBatchSize: 32,
  batchTimeoutMs: 50,
  maxQueueDepth: 1000,
  maxConcurrentBatches: 8,
};

/**
 * Validate server URL
 */
function validateServerUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new InvalidServerUrlError(url);
    }
  } catch (error) {
    if (error instanceof InvalidServerUrlError) {
      throw error;
    }
    throw new InvalidServerUrlError(url);
  }
}

/**
 * Validate server configuration
 */
function validateServerConfig(config: ServerConfig): void {
  validateServerUrl(config.url);

  if (config.weight !== undefined && config.weight < 0) {
    throw new ConfigurationError(`Invalid server weight: ${config.weight}`);
  }
}

/**
 * Validate pool configuration
 */
function validatePoolConfig(config: PoolConfig): void {
  if (config.maxConnectionsPerServer < 1) {
    throw new ConfigurationError(
      `maxConnectionsPerServer must be >= 1, got ${config.maxConnectionsPerServer}`
    );
  }

  if (config.idleTimeout < 0) {
    throw new InvalidTimeoutError(config.idleTimeout);
  }

  if (config.acquireTimeout < 0) {
    throw new InvalidTimeoutError(config.acquireTimeout);
  }
}

/**
 * Validate retry configuration
 */
function validateRetryConfig(config: RetryConfig): void {
  if (config.maxAttempts < 1) {
    throw new ConfigurationError(
      `maxAttempts must be >= 1, got ${config.maxAttempts}`
    );
  }

  if (config.baseDelayMs < 0) {
    throw new InvalidTimeoutError(config.baseDelayMs);
  }

  if (config.maxDelayMs < config.baseDelayMs) {
    throw new ConfigurationError(
      'maxDelayMs must be >= baseDelayMs'
    );
  }

  if (config.exponentialBase < 1) {
    throw new ConfigurationError(
      `exponentialBase must be >= 1, got ${config.exponentialBase}`
    );
  }
}

/**
 * Validate circuit breaker configuration
 */
function validateCircuitBreakerConfig(config: CircuitBreakerConfig): void {
  if (config.failureThreshold < 1) {
    throw new ConfigurationError(
      `failureThreshold must be >= 1, got ${config.failureThreshold}`
    );
  }

  if (config.successThreshold < 1) {
    throw new ConfigurationError(
      `successThreshold must be >= 1, got ${config.successThreshold}`
    );
  }

  if (config.openDurationMs < 0) {
    throw new InvalidTimeoutError(config.openDurationMs);
  }
}

/**
 * Validate rate limit configuration
 */
function validateRateLimitConfig(config: RateLimitConfig): void {
  if (config.requestsPerSecond <= 0) {
    throw new ConfigurationError(
      `requestsPerSecond must be > 0, got ${config.requestsPerSecond}`
    );
  }

  if (config.burstSize < 1) {
    throw new ConfigurationError(
      `burstSize must be >= 1, got ${config.burstSize}`
    );
  }
}

/**
 * Validate batch configuration
 */
function validateBatchConfig(config: BatchConfig): void {
  if (config.maxBatchSize < 1) {
    throw new InvalidBatchConfigError(
      `maxBatchSize must be >= 1, got ${config.maxBatchSize}`
    );
  }

  if (config.batchTimeoutMs < 0) {
    throw new InvalidBatchConfigError(
      `batchTimeoutMs must be >= 0, got ${config.batchTimeoutMs}`
    );
  }

  if (config.maxQueueDepth < 1) {
    throw new InvalidBatchConfigError(
      `maxQueueDepth must be >= 1, got ${config.maxQueueDepth}`
    );
  }

  if (config.maxConcurrentBatches < 1) {
    throw new InvalidBatchConfigError(
      `maxConcurrentBatches must be >= 1, got ${config.maxConcurrentBatches}`
    );
  }
}

/**
 * Validate full configuration
 */
export function validateConfig(config: VllmConfig): Required<VllmConfig> {
  // Validate servers
  if (!config.servers || config.servers.length === 0) {
    throw new ConfigurationError('At least one server must be configured');
  }

  for (const server of config.servers) {
    validateServerConfig(server);
  }

  // Validate timeout
  if (config.timeout !== undefined && config.timeout < 0) {
    throw new InvalidTimeoutError(config.timeout);
  }

  // Validate sub-configs
  validatePoolConfig(config.pool);
  validateRetryConfig(config.retry);
  validateCircuitBreakerConfig(config.circuitBreaker);

  if (config.rateLimit) {
    validateRateLimitConfig(config.rateLimit);
  }

  if (config.batch) {
    validateBatchConfig(config.batch);
  }

  // Validate model discovery interval
  if (config.modelDiscoveryIntervalMs !== undefined && config.modelDiscoveryIntervalMs < 1000) {
    throw new ConfigurationError(
      `modelDiscoveryIntervalMs must be >= 1000, got ${config.modelDiscoveryIntervalMs}`
    );
  }

  return config as Required<VllmConfig>;
}

/**
 * Create default configuration with required servers
 */
export function createDefaultConfig(servers: ServerConfig[]): VllmConfig {
  return {
    servers,
    timeout: 120000,
    pool: DEFAULT_POOL_CONFIG,
    retry: DEFAULT_RETRY_CONFIG,
    circuitBreaker: DEFAULT_CIRCUIT_BREAKER_CONFIG,
    autoDiscoverModels: true,
    modelDiscoveryIntervalMs: 30000,
  };
}

/**
 * Merge partial config with defaults
 */
export function mergeConfig(
  partial: Partial<VllmConfig>,
  servers: ServerConfig[]
): VllmConfig {
  return {
    servers: partial.servers ?? servers,
    timeout: partial.timeout ?? 120000,
    pool: { ...DEFAULT_POOL_CONFIG, ...partial.pool },
    retry: { ...DEFAULT_RETRY_CONFIG, ...partial.retry },
    circuitBreaker: { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...partial.circuitBreaker },
    rateLimit: partial.rateLimit,
    batch: partial.batch ? { ...DEFAULT_BATCH_CONFIG, ...partial.batch } : undefined,
    autoDiscoverModels: partial.autoDiscoverModels ?? true,
    modelDiscoveryIntervalMs: partial.modelDiscoveryIntervalMs ?? 30000,
    defaultModel: partial.defaultModel,
  };
}
