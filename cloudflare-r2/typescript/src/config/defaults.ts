/**
 * Default configuration values for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/config/defaults
 */

import type { R2RetryConfig, R2CircuitBreakerConfig } from './types.js';

/**
 * Default request timeout in milliseconds (5 minutes).
 */
export const DEFAULT_TIMEOUT = 300000;

/**
 * Default multipart upload threshold in bytes (100 MB).
 * Objects larger than this will use multipart upload.
 */
export const DEFAULT_MULTIPART_THRESHOLD = 104857600;

/**
 * Default size of each part in multipart upload in bytes (10 MB).
 */
export const DEFAULT_MULTIPART_PART_SIZE = 10485760;

/**
 * Default number of concurrent part uploads.
 */
export const DEFAULT_MULTIPART_CONCURRENCY = 4;

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: R2RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 30000,
  jitterFactor: 0.1,
};

/**
 * Default circuit breaker configuration.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: R2CircuitBreakerConfig = {
  enabled: true,
  failureThreshold: 5,
  successThreshold: 3,
  resetTimeout: 30000,
};
