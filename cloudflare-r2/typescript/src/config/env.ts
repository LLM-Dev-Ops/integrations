/**
 * Environment variable configuration loading for Cloudflare R2 Storage Integration
 * @module @studiorack/cloudflare-r2/config/env
 */

import { ConfigError } from '../errors/index.js';
import type { R2Config, NormalizedR2Config } from './types.js';
import { normalizeConfig } from './validation.js';

/**
 * Environment variable names for R2 configuration.
 */
const ENV_VARS = {
  ACCOUNT_ID: 'R2_ACCOUNT_ID',
  ACCESS_KEY_ID: 'R2_ACCESS_KEY_ID',
  SECRET_ACCESS_KEY: 'R2_SECRET_ACCESS_KEY',
  ENDPOINT: 'R2_ENDPOINT',
  TIMEOUT_MS: 'R2_TIMEOUT_MS',
  MULTIPART_THRESHOLD_BYTES: 'R2_MULTIPART_THRESHOLD_BYTES',
  MULTIPART_PART_SIZE_BYTES: 'R2_MULTIPART_PART_SIZE_BYTES',
  MULTIPART_CONCURRENCY: 'R2_MULTIPART_CONCURRENCY',
} as const;

/**
 * Parses an integer from an environment variable.
 *
 * @param value - String value to parse
 * @param name - Environment variable name (for error messages)
 * @returns Parsed integer or undefined if value is empty
 * @throws {ConfigError} If value is not a valid integer
 */
function parseIntEnv(value: string | undefined, name: string): number | undefined {
  if (!value || value.trim() === '') {
    return undefined;
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new ConfigError({
      message: `${name} must be a valid integer, got: ${value}`,
      code: 'INVALID_INTEGER',
      isRetryable: false,
    });
  }

  return parsed;
}

/**
 * Creates R2 configuration from environment variables.
 *
 * Environment variables:
 * - R2_ACCOUNT_ID (required): Cloudflare account ID
 * - R2_ACCESS_KEY_ID (required): R2 access key ID
 * - R2_SECRET_ACCESS_KEY (required): R2 secret access key
 * - R2_ENDPOINT (optional): Custom endpoint URL
 * - R2_TIMEOUT_MS (optional): Request timeout in milliseconds
 * - R2_MULTIPART_THRESHOLD_BYTES (optional): Multipart upload threshold in bytes
 * - R2_MULTIPART_PART_SIZE_BYTES (optional): Multipart part size in bytes
 * - R2_MULTIPART_CONCURRENCY (optional): Number of concurrent part uploads
 *
 * @returns Normalized R2 configuration
 * @throws {ConfigError} If required environment variables are missing or invalid
 */
export function createConfigFromEnv(): NormalizedR2Config {
  const config: Partial<R2Config> = {
    accountId: process.env[ENV_VARS.ACCOUNT_ID],
    accessKeyId: process.env[ENV_VARS.ACCESS_KEY_ID],
    secretAccessKey: process.env[ENV_VARS.SECRET_ACCESS_KEY],
    endpoint: process.env[ENV_VARS.ENDPOINT],
    timeout: parseIntEnv(process.env[ENV_VARS.TIMEOUT_MS], ENV_VARS.TIMEOUT_MS),
    multipartThreshold: parseIntEnv(
      process.env[ENV_VARS.MULTIPART_THRESHOLD_BYTES],
      ENV_VARS.MULTIPART_THRESHOLD_BYTES
    ),
    multipartPartSize: parseIntEnv(
      process.env[ENV_VARS.MULTIPART_PART_SIZE_BYTES],
      ENV_VARS.MULTIPART_PART_SIZE_BYTES
    ),
    multipartConcurrency: parseIntEnv(
      process.env[ENV_VARS.MULTIPART_CONCURRENCY],
      ENV_VARS.MULTIPART_CONCURRENCY
    ),
  };

  // normalizeConfig will validate required fields and apply defaults
  return normalizeConfig(config as R2Config);
}
