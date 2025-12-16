/**
 * Configuration module for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/config
 */

export type {
  R2Config,
  R2CircuitBreakerConfig,
  R2RetryConfig,
  R2SimulationConfig,
  R2FullConfig,
  NormalizedR2Config,
} from './types.js';

export {
  DEFAULT_TIMEOUT,
  DEFAULT_MULTIPART_THRESHOLD,
  DEFAULT_MULTIPART_PART_SIZE,
  DEFAULT_MULTIPART_CONCURRENCY,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from './defaults.js';

export { validateConfig, normalizeConfig } from './validation.js';

export { R2ConfigBuilder } from './builder.js';

export { createConfigFromEnv } from './env.js';
