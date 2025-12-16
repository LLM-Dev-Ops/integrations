/**
 * Configuration type definitions for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/config/types
 */

/**
 * Core R2 configuration parameters.
 */
export interface R2Config {
  /**
   * Cloudflare account ID.
   */
  accountId: string;

  /**
   * R2 access key ID.
   */
  accessKeyId: string;

  /**
   * R2 secret access key.
   */
  secretAccessKey: string;

  /**
   * Custom endpoint URL (optional).
   * If not provided, will be constructed from accountId.
   */
  endpoint?: string;

  /**
   * Request timeout in milliseconds.
   * @default 300000 (5 minutes)
   */
  timeout?: number;

  /**
   * Minimum size in bytes for multipart upload.
   * Objects larger than this will use multipart upload.
   * @default 104857600 (100 MB)
   */
  multipartThreshold?: number;

  /**
   * Size of each part in multipart upload (in bytes).
   * @default 10485760 (10 MB)
   */
  multipartPartSize?: number;

  /**
   * Number of concurrent part uploads.
   * @default 4
   */
  multipartConcurrency?: number;
}

/**
 * Circuit breaker configuration.
 */
export interface R2CircuitBreakerConfig {
  /**
   * Whether circuit breaker is enabled.
   */
  enabled: boolean;

  /**
   * Number of consecutive failures before opening circuit.
   * @default 5
   */
  failureThreshold: number;

  /**
   * Number of consecutive successes to close circuit.
   * @default 3
   */
  successThreshold: number;

  /**
   * Time in milliseconds before attempting to close circuit.
   * @default 30000 (30 seconds)
   */
  resetTimeout: number;
}

/**
 * Retry configuration.
 */
export interface R2RetryConfig {
  /**
   * Maximum number of retry attempts.
   * @default 3
   */
  maxRetries: number;

  /**
   * Base delay in milliseconds for exponential backoff.
   * @default 100
   */
  baseDelayMs: number;

  /**
   * Maximum delay in milliseconds between retries.
   * @default 30000 (30 seconds)
   */
  maxDelayMs: number;

  /**
   * Jitter factor (0.0 to 1.0) for randomizing delays.
   * @default 0.1
   */
  jitterFactor: number;
}

/**
 * Simulation/testing configuration.
 */
export interface R2SimulationConfig {
  /**
   * Whether simulation mode is enabled.
   */
  enabled: boolean;

  /**
   * Path to recording file for playback.
   */
  recordingPath?: string;
}

/**
 * Full configuration with all optional subsections.
 */
export interface R2FullConfig extends R2Config {
  /**
   * Retry configuration.
   */
  retry: R2RetryConfig;

  /**
   * Circuit breaker configuration.
   */
  circuitBreaker: R2CircuitBreakerConfig;

  /**
   * Simulation configuration (optional).
   */
  simulation?: R2SimulationConfig;
}

/**
 * Normalized configuration with all required fields populated.
 */
export interface NormalizedR2Config extends Required<R2Config> {
  /**
   * Fully resolved endpoint URL.
   */
  endpointUrl: string;

  /**
   * Retry configuration.
   */
  retry: R2RetryConfig;

  /**
   * Circuit breaker configuration.
   */
  circuitBreaker: R2CircuitBreakerConfig;

  /**
   * Simulation configuration (optional).
   */
  simulation?: R2SimulationConfig;
}
