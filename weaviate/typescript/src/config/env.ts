/**
 * Environment variable loading for Weaviate configuration.
 * @module config/env
 */

import type { WeaviateConfig } from './types.js';
import { ConsistencyLevel } from './types.js';
import {
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
import { ConfigurationError } from './validation.js';

/**
 * Loads Weaviate configuration from environment variables.
 *
 * Supported environment variables:
 * - WEAVIATE_ENDPOINT: Weaviate instance URL (e.g., 'http://localhost:8080')
 * - WEAVIATE_GRPC_ENDPOINT: gRPC endpoint (e.g., 'localhost:50051')
 * - WEAVIATE_API_KEY: API key for authentication
 * - WEAVIATE_OIDC_TOKEN: OIDC token for authentication
 * - WEAVIATE_OIDC_REFRESH_TOKEN: OIDC refresh token
 * - WEAVIATE_CLIENT_ID: OAuth client ID for client credentials flow
 * - WEAVIATE_CLIENT_SECRET: OAuth client secret for client credentials flow
 * - WEAVIATE_SCOPES: Comma-separated list of OAuth scopes
 * - WEAVIATE_TOKEN_ENDPOINT: OAuth token endpoint URL
 * - WEAVIATE_TIMEOUT: Request timeout in milliseconds
 * - WEAVIATE_BATCH_SIZE: Default batch size
 * - WEAVIATE_CONSISTENCY_LEVEL: Consistency level (ONE, QUORUM, ALL)
 * - WEAVIATE_MAX_RETRIES: Maximum retry attempts
 * - WEAVIATE_RETRY_BACKOFF: Retry backoff delay in milliseconds
 * - WEAVIATE_CIRCUIT_BREAKER_THRESHOLD: Circuit breaker failure threshold
 * - WEAVIATE_POOL_SIZE: gRPC connection pool size
 * - WEAVIATE_IDLE_TIMEOUT: Idle timeout for pooled connections in milliseconds
 * - WEAVIATE_SCHEMA_CACHE_TTL: Schema cache TTL in milliseconds
 * - WEAVIATE_TENANT_ALLOWLIST: Comma-separated list of allowed tenants
 *
 * @returns Weaviate configuration populated from environment variables
 * @throws {ConfigurationError} If required environment variables are missing or invalid
 */
export function fromEnv(): WeaviateConfig {
  const config: WeaviateConfig = {
    endpoint: getEnv('WEAVIATE_ENDPOINT', DEFAULT_ENDPOINT),
  };

  // Optional gRPC endpoint
  const grpcEndpoint = getEnv('WEAVIATE_GRPC_ENDPOINT');
  if (grpcEndpoint) {
    config.grpcEndpoint = grpcEndpoint;
  }

  // Authentication configuration
  config.auth = loadAuthFromEnv();

  // Numeric configurations with defaults
  config.timeout = getEnvNumber('WEAVIATE_TIMEOUT', DEFAULT_TIMEOUT_MS);
  config.batchSize = getEnvNumber('WEAVIATE_BATCH_SIZE', DEFAULT_BATCH_SIZE);
  config.maxRetries = getEnvNumber('WEAVIATE_MAX_RETRIES', DEFAULT_MAX_RETRIES);
  config.retryBackoff = getEnvNumber('WEAVIATE_RETRY_BACKOFF', DEFAULT_RETRY_BACKOFF_MS);
  config.circuitBreakerThreshold = getEnvNumber(
    'WEAVIATE_CIRCUIT_BREAKER_THRESHOLD',
    DEFAULT_CIRCUIT_BREAKER_THRESHOLD
  );
  config.poolSize = getEnvNumber('WEAVIATE_POOL_SIZE', DEFAULT_POOL_SIZE);
  config.idleTimeout = getEnvNumber('WEAVIATE_IDLE_TIMEOUT', DEFAULT_IDLE_TIMEOUT_MS);
  config.schemaCacheTtl = getEnvNumber('WEAVIATE_SCHEMA_CACHE_TTL', DEFAULT_SCHEMA_CACHE_TTL_MS);

  // Consistency level
  const consistencyLevel = getEnv('WEAVIATE_CONSISTENCY_LEVEL');
  if (consistencyLevel) {
    config.consistencyLevel = parseConsistencyLevel(consistencyLevel);
  } else {
    config.consistencyLevel = DEFAULT_CONSISTENCY_LEVEL;
  }

  // Tenant allowlist
  const tenantAllowlist = getEnv('WEAVIATE_TENANT_ALLOWLIST');
  if (tenantAllowlist) {
    config.tenantAllowlist = tenantAllowlist
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }

  return config;
}

/**
 * Loads authentication configuration from environment variables.
 *
 * Priority order:
 * 1. Client credentials (if CLIENT_ID and CLIENT_SECRET are set)
 * 2. OIDC token (if OIDC_TOKEN is set)
 * 3. API key (if API_KEY is set)
 * 4. None (default)
 *
 * @returns Authentication configuration
 */
function loadAuthFromEnv(): WeaviateConfig['auth'] {
  // Client credentials (highest priority for OAuth flows)
  const clientId = getEnv('WEAVIATE_CLIENT_ID');
  const clientSecret = getEnv('WEAVIATE_CLIENT_SECRET');

  if (clientId && clientSecret) {
    const scopes = getEnv('WEAVIATE_SCOPES');
    const tokenEndpoint = getEnv('WEAVIATE_TOKEN_ENDPOINT');

    return {
      type: 'clientCredentials',
      clientId,
      clientSecret,
      scopes: scopes ? scopes.split(',').map((s) => s.trim()) : undefined,
      tokenEndpoint,
    };
  }

  // OIDC token
  const oidcToken = getEnv('WEAVIATE_OIDC_TOKEN');
  if (oidcToken) {
    const refreshToken = getEnv('WEAVIATE_OIDC_REFRESH_TOKEN');
    const expiresAt = getEnvNumber('WEAVIATE_OIDC_EXPIRES_AT');

    return {
      type: 'oidc',
      token: oidcToken,
      refreshToken,
      expiresAt,
    };
  }

  // API key
  const apiKey = getEnv('WEAVIATE_API_KEY');
  if (apiKey) {
    return {
      type: 'apiKey',
      apiKey,
    };
  }

  // Default to no authentication
  return { type: 'none' };
}

/**
 * Parses consistency level from string.
 *
 * @param value - Consistency level string
 * @returns Parsed ConsistencyLevel enum value
 * @throws {ConfigurationError} If the value is not a valid consistency level
 */
function parseConsistencyLevel(value: string): ConsistencyLevel {
  const normalized = value.toUpperCase();

  switch (normalized) {
    case 'ONE':
      return ConsistencyLevel.ONE;
    case 'QUORUM':
      return ConsistencyLevel.QUORUM;
    case 'ALL':
      return ConsistencyLevel.ALL;
    default:
      throw new ConfigurationError(
        `Invalid consistency level: ${value}. Must be ONE, QUORUM, or ALL`
      );
  }
}

/**
 * Gets an environment variable value.
 *
 * @param key - Environment variable key
 * @param defaultValue - Default value if the variable is not set
 * @returns Environment variable value or default
 */
export function getEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

/**
 * Gets an environment variable as a number.
 *
 * @param key - Environment variable key
 * @param defaultValue - Default value if the variable is not set or invalid
 * @returns Environment variable value as number or default
 */
export function getEnvNumber(key: string, defaultValue?: number): number | undefined {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    return defaultValue;
  }

  return parsed;
}

/**
 * Gets an environment variable as a boolean.
 *
 * @param key - Environment variable key
 * @param defaultValue - Default value if the variable is not set
 * @returns Environment variable value as boolean or default
 */
export function getEnvBoolean(key: string, defaultValue = false): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }

  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Checks if an environment variable is set.
 *
 * @param key - Environment variable key
 * @returns True if the variable is set and non-empty
 */
export function hasEnv(key: string): boolean {
  const value = process.env[key];
  return value !== undefined && value.trim().length > 0;
}

/**
 * Gets a required environment variable.
 *
 * @param key - Environment variable key
 * @returns Environment variable value
 * @throws {ConfigurationError} If the variable is not set
 */
export function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new ConfigurationError(`Required environment variable ${key} is not set`);
  }
  return value;
}
