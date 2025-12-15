/**
 * AWS CloudWatch Logs Batch Configuration
 *
 * This module contains configuration for batch buffering of log events.
 */

/**
 * Batch configuration interface.
 */
export interface BatchConfig {
  /** Maximum number of events per batch (AWS limit: 10,000) */
  maxEvents: number;
  /** Maximum batch size in bytes (AWS limit: 1,048,576 bytes / 1MB) */
  maxBytes: number;
  /** Flush interval in milliseconds (default: 5000ms / 5s) */
  flushIntervalMs: number;
  /** Maximum number of retries for failed flushes (default: 3) */
  maxRetries: number;
}

/**
 * Default batch configuration following AWS CloudWatch Logs limits.
 */
export const DEFAULT_BATCH_CONFIG: BatchConfig = {
  maxEvents: 10000,
  maxBytes: 1048576, // 1MB
  flushIntervalMs: 5000, // 5s
  maxRetries: 3,
};

/**
 * Validates batch configuration.
 * @param config - Batch configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateBatchConfig(config: BatchConfig): void {
  if (config.maxEvents <= 0 || config.maxEvents > 10000) {
    throw new Error('maxEvents must be between 1 and 10000');
  }
  if (config.maxBytes <= 0 || config.maxBytes > 1048576) {
    throw new Error('maxBytes must be between 1 and 1048576 (1MB)');
  }
  if (config.flushIntervalMs <= 0) {
    throw new Error('flushIntervalMs must be positive');
  }
  if (config.maxRetries < 0) {
    throw new Error('maxRetries must be non-negative');
  }
}
