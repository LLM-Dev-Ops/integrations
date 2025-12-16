/**
 * Weaviate Configuration
 *
 * Configuration interfaces and utilities for Weaviate client.
 *
 * @example
 * ```typescript
 * import { WeaviateConfigBuilder, fromEnv } from './config';
 *
 * // Build configuration programmatically
 * const config = new WeaviateConfigBuilder()
 *   .endpoint('http://localhost:8080')
 *   .apiKey('my-secret-key')
 *   .timeout(60000)
 *   .build();
 *
 * // Load configuration from environment variables
 * const envConfig = fromEnv();
 * ```
 *
 * @module config
 */

// Export types and enums
export type {
  WeaviateConfig,
  WeaviateAuth,
  NoneAuth,
  ApiKeyAuth,
  OidcAuth,
  ClientCredentialsAuth,
} from './types.js';

export {
  ConsistencyLevel,
  isNoneAuth,
  isApiKeyAuth,
  isOidcAuth,
  isClientCredentialsAuth,
  DEFAULT_ENDPOINT,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_BATCH_SIZE,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_BACKOFF_MS,
  DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
  DEFAULT_POOL_SIZE,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_SCHEMA_CACHE_TTL_MS,
  DEFAULT_CONSISTENCY_LEVEL,
} from './types.js';

// Export builder
export { WeaviateConfigBuilder } from './builder.js';

// Export validation
export {
  validateConfig,
  validateEndpoint,
  validateApiKey,
  validateTimeout,
  validateBatchSize,
  ConfigurationError,
  isConfigurationError,
} from './validation.js';

// Export environment utilities
export {
  fromEnv,
  getEnv,
  getEnvNumber,
  getEnvBoolean,
  hasEnv,
  getRequiredEnv,
} from './env.js';
