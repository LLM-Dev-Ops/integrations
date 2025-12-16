/**
 * Configuration validation and normalization for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/config/validation
 */

import { ConfigError } from '../errors/index.js';
import type { R2Config, NormalizedR2Config, R2FullConfig } from './types.js';
import {
  DEFAULT_TIMEOUT,
  DEFAULT_MULTIPART_THRESHOLD,
  DEFAULT_MULTIPART_PART_SIZE,
  DEFAULT_MULTIPART_CONCURRENCY,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from './defaults.js';

/**
 * Validates R2 configuration.
 * Throws ConfigError if validation fails.
 *
 * @param config - Configuration to validate
 * @throws {ConfigError} If configuration is invalid
 */
export function validateConfig(config: Partial<R2Config>): void {
  // Validate required fields
  if (!config.accountId) {
    throw new ConfigError({
      message: 'accountId is required',
      code: 'MISSING_ACCOUNT_ID',
      isRetryable: false,
    });
  }

  if (!config.accessKeyId) {
    throw new ConfigError({
      message: 'accessKeyId is required',
      code: 'MISSING_ACCESS_KEY_ID',
      isRetryable: false,
    });
  }

  if (!config.secretAccessKey) {
    throw new ConfigError({
      message: 'secretAccessKey is required',
      code: 'MISSING_SECRET_ACCESS_KEY',
      isRetryable: false,
    });
  }

  // Validate accountId format (alphanumeric and hyphens)
  if (!/^[a-zA-Z0-9-]+$/.test(config.accountId)) {
    throw new ConfigError({
      message: 'accountId must contain only alphanumeric characters and hyphens',
      code: 'INVALID_ACCOUNT_ID',
      isRetryable: false,
    });
  }

  // Validate endpoint URL if provided
  if (config.endpoint) {
    try {
      const url = new URL(config.endpoint);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new ConfigError({
          message: 'endpoint must use http or https protocol',
          code: 'INVALID_ENDPOINT_PROTOCOL',
          isRetryable: false,
        });
      }
    } catch (error) {
      throw new ConfigError({
        message: `Invalid endpoint URL: ${error instanceof Error ? error.message : 'unknown error'}`,
        code: 'INVALID_ENDPOINT',
        isRetryable: false,
      });
    }
  }

  // Validate numeric parameters
  if (config.timeout !== undefined) {
    if (!Number.isInteger(config.timeout) || config.timeout <= 0) {
      throw new ConfigError({
        message: 'timeout must be a positive integer',
        code: 'INVALID_TIMEOUT',
        isRetryable: false,
      });
    }
  }

  if (config.multipartThreshold !== undefined) {
    if (!Number.isInteger(config.multipartThreshold) || config.multipartThreshold <= 0) {
      throw new ConfigError({
        message: 'multipartThreshold must be a positive integer',
        code: 'INVALID_MULTIPART_THRESHOLD',
        isRetryable: false,
      });
    }
    // Minimum 5MB for multipart threshold
    if (config.multipartThreshold < 5242880) {
      throw new ConfigError({
        message: 'multipartThreshold must be at least 5MB (5242880 bytes)',
        code: 'MULTIPART_THRESHOLD_TOO_SMALL',
        isRetryable: false,
      });
    }
  }

  if (config.multipartPartSize !== undefined) {
    if (!Number.isInteger(config.multipartPartSize) || config.multipartPartSize <= 0) {
      throw new ConfigError({
        message: 'multipartPartSize must be a positive integer',
        code: 'INVALID_MULTIPART_PART_SIZE',
        isRetryable: false,
      });
    }
    // Part size must be at least 5MB
    if (config.multipartPartSize < 5242880) {
      throw new ConfigError({
        message: 'multipartPartSize must be at least 5MB (5242880 bytes)',
        code: 'MULTIPART_PART_SIZE_TOO_SMALL',
        isRetryable: false,
      });
    }
    // Part size must not exceed 5GB
    if (config.multipartPartSize > 5368709120) {
      throw new ConfigError({
        message: 'multipartPartSize must not exceed 5GB (5368709120 bytes)',
        code: 'MULTIPART_PART_SIZE_TOO_LARGE',
        isRetryable: false,
      });
    }
  }

  if (config.multipartConcurrency !== undefined) {
    if (!Number.isInteger(config.multipartConcurrency) || config.multipartConcurrency <= 0) {
      throw new ConfigError({
        message: 'multipartConcurrency must be a positive integer',
        code: 'INVALID_MULTIPART_CONCURRENCY',
        isRetryable: false,
      });
    }
    if (config.multipartConcurrency > 100) {
      throw new ConfigError({
        message: 'multipartConcurrency must not exceed 100',
        code: 'MULTIPART_CONCURRENCY_TOO_HIGH',
        isRetryable: false,
      });
    }
  }
}

/**
 * Builds the R2 endpoint URL from account ID.
 *
 * @param accountId - Cloudflare account ID
 * @returns R2 endpoint URL
 */
function buildEndpointUrl(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

/**
 * Normalizes R2 configuration by applying defaults and validating.
 *
 * @param config - Configuration to normalize
 * @returns Normalized configuration with all fields populated
 * @throws {ConfigError} If configuration is invalid
 */
export function normalizeConfig(config: R2Config | R2FullConfig): NormalizedR2Config {
  // Validate first
  validateConfig(config);

  // Build endpoint URL
  const endpointUrl = config.endpoint || buildEndpointUrl(config.accountId);

  // Merge with defaults
  const normalized: NormalizedR2Config = {
    accountId: config.accountId,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    endpoint: config.endpoint || endpointUrl,
    endpointUrl,
    timeout: config.timeout ?? DEFAULT_TIMEOUT,
    multipartThreshold: config.multipartThreshold ?? DEFAULT_MULTIPART_THRESHOLD,
    multipartPartSize: config.multipartPartSize ?? DEFAULT_MULTIPART_PART_SIZE,
    multipartConcurrency: config.multipartConcurrency ?? DEFAULT_MULTIPART_CONCURRENCY,
    retry: {
      ...DEFAULT_RETRY_CONFIG,
      ...('retry' in config ? config.retry : {}),
    },
    circuitBreaker: {
      ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
      ...('circuitBreaker' in config ? config.circuitBreaker : {}),
    },
    simulation: 'simulation' in config ? config.simulation : undefined,
  };

  return normalized;
}
