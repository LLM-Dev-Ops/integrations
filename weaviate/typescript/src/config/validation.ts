/**
 * Configuration validation for Weaviate client.
 * @module config/validation
 */

import type { WeaviateConfig, WeaviateAuth } from './types.js';
import {
  isApiKeyAuth,
  isOidcAuth,
  isClientCredentialsAuth,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_BATCH_SIZE,
} from './types.js';

/**
 * Configuration error thrown when validation fails.
 */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConfigurationError);
    }
  }
}

/**
 * Validates Weaviate configuration.
 *
 * @param config - Configuration to validate
 * @throws {ConfigurationError} If configuration is invalid
 */
export function validateConfig(config: WeaviateConfig): void {
  // Validate endpoint (required)
  validateEndpoint(config.endpoint);

  // Validate gRPC endpoint if provided
  if (config.grpcEndpoint !== undefined) {
    validateGrpcEndpoint(config.grpcEndpoint);
  }

  // Validate auth if provided
  if (config.auth !== undefined) {
    validateAuth(config.auth);
  }

  // Validate timeout if provided
  if (config.timeout !== undefined) {
    validateTimeout(config.timeout);
  }

  // Validate batch size if provided
  if (config.batchSize !== undefined) {
    validateBatchSize(config.batchSize);
  }

  // Validate max retries if provided
  if (config.maxRetries !== undefined) {
    validateMaxRetries(config.maxRetries);
  }

  // Validate retry backoff if provided
  if (config.retryBackoff !== undefined) {
    validateRetryBackoff(config.retryBackoff);
  }

  // Validate circuit breaker threshold if provided
  if (config.circuitBreakerThreshold !== undefined) {
    validateCircuitBreakerThreshold(config.circuitBreakerThreshold);
  }

  // Validate pool size if provided
  if (config.poolSize !== undefined) {
    validatePoolSize(config.poolSize);
  }

  // Validate idle timeout if provided
  if (config.idleTimeout !== undefined) {
    validateIdleTimeout(config.idleTimeout);
  }

  // Validate schema cache TTL if provided
  if (config.schemaCacheTtl !== undefined) {
    validateSchemaCacheTtl(config.schemaCacheTtl);
  }

  // Validate tenant allowlist if provided
  if (config.tenantAllowlist !== undefined) {
    validateTenantAllowlist(config.tenantAllowlist);
  }
}

/**
 * Validates endpoint URL.
 *
 * @param endpoint - Endpoint URL to validate
 * @throws {ConfigurationError} If endpoint is invalid
 */
export function validateEndpoint(endpoint: string): void {
  if (!endpoint || typeof endpoint !== 'string' || endpoint.trim().length === 0) {
    throw new ConfigurationError('Endpoint must be a non-empty string');
  }

  // Validate URL format
  try {
    const url = new URL(endpoint);
    if (!url.protocol || (!url.protocol.startsWith('http:') && !url.protocol.startsWith('https:'))) {
      throw new ConfigurationError('Endpoint URL must use http: or https: protocol');
    }
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error;
    }
    throw new ConfigurationError(`Invalid endpoint URL: ${endpoint}`);
  }
}

/**
 * Validates gRPC endpoint.
 *
 * @param grpcEndpoint - gRPC endpoint to validate
 * @throws {ConfigurationError} If gRPC endpoint is invalid
 */
export function validateGrpcEndpoint(grpcEndpoint: string): void {
  if (!grpcEndpoint || typeof grpcEndpoint !== 'string' || grpcEndpoint.trim().length === 0) {
    throw new ConfigurationError('gRPC endpoint must be a non-empty string');
  }

  // gRPC endpoints should be in format host:port
  const grpcPattern = /^[a-zA-Z0-9.-]+:\d+$/;
  if (!grpcPattern.test(grpcEndpoint)) {
    throw new ConfigurationError(
      `Invalid gRPC endpoint format: ${grpcEndpoint}. Expected format: 'host:port' (e.g., 'localhost:50051')`
    );
  }
}

/**
 * Validates authentication configuration.
 *
 * @param auth - Authentication configuration to validate
 * @throws {ConfigurationError} If auth is invalid
 */
export function validateAuth(auth: WeaviateAuth): void {
  if (isApiKeyAuth(auth)) {
    validateApiKey(auth.apiKey);
  } else if (isOidcAuth(auth)) {
    validateOidcToken(auth.token);

    // Validate refresh token if provided
    if (auth.refreshToken !== undefined && (!auth.refreshToken || auth.refreshToken.trim().length === 0)) {
      throw new ConfigurationError('OIDC refresh token must be non-empty if provided');
    }

    // Validate expiry timestamp if provided
    if (auth.expiresAt !== undefined && auth.expiresAt <= 0) {
      throw new ConfigurationError('OIDC token expiry timestamp must be positive');
    }
  } else if (isClientCredentialsAuth(auth)) {
    validateClientCredentials(auth.clientId, auth.clientSecret, auth.scopes);

    // Validate token endpoint if provided
    if (auth.tokenEndpoint !== undefined) {
      try {
        const url = new URL(auth.tokenEndpoint);
        if (!url.protocol || (!url.protocol.startsWith('http:') && !url.protocol.startsWith('https:'))) {
          throw new ConfigurationError('Token endpoint URL must use http: or https: protocol');
        }
      } catch (error) {
        if (error instanceof ConfigurationError) {
          throw error;
        }
        throw new ConfigurationError(`Invalid token endpoint URL: ${auth.tokenEndpoint}`);
      }
    }
  }
  // 'none' type doesn't need validation
}

/**
 * Validates API key.
 *
 * @param apiKey - API key to validate
 * @throws {ConfigurationError} If API key is invalid
 */
export function validateApiKey(apiKey: string): void {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new ConfigurationError('API key must be a non-empty string');
  }

  if (apiKey.length < 10) {
    throw new ConfigurationError('API key appears to be invalid (too short)');
  }
}

/**
 * Validates OIDC token.
 *
 * @param token - OIDC token to validate
 * @throws {ConfigurationError} If token is invalid
 */
export function validateOidcToken(token: string): void {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    throw new ConfigurationError('OIDC token must be a non-empty string');
  }

  if (token.length < 20) {
    throw new ConfigurationError('OIDC token appears to be invalid (too short)');
  }
}

/**
 * Validates client credentials.
 *
 * @param clientId - Client ID to validate
 * @param clientSecret - Client secret to validate
 * @param scopes - Optional scopes to validate
 * @throws {ConfigurationError} If credentials are invalid
 */
export function validateClientCredentials(
  clientId: string,
  clientSecret: string,
  scopes?: string[]
): void {
  if (!clientId || typeof clientId !== 'string' || clientId.trim().length === 0) {
    throw new ConfigurationError('Client ID must be a non-empty string');
  }

  if (!clientSecret || typeof clientSecret !== 'string' || clientSecret.trim().length === 0) {
    throw new ConfigurationError('Client secret must be a non-empty string');
  }

  if (scopes !== undefined) {
    if (!Array.isArray(scopes)) {
      throw new ConfigurationError('Scopes must be an array');
    }

    for (const scope of scopes) {
      if (!scope || typeof scope !== 'string' || scope.trim().length === 0) {
        throw new ConfigurationError('Each scope must be a non-empty string');
      }
    }
  }
}

/**
 * Validates timeout value.
 *
 * @param timeout - Timeout in milliseconds to validate
 * @throws {ConfigurationError} If timeout is invalid
 */
export function validateTimeout(timeout: number): void {
  if (typeof timeout !== 'number' || !Number.isFinite(timeout)) {
    throw new ConfigurationError('Timeout must be a finite number');
  }

  if (timeout <= 0) {
    throw new ConfigurationError('Timeout must be positive');
  }

  if (timeout > 600000) {
    // Max 10 minutes
    throw new ConfigurationError('Timeout must not exceed 600000ms (10 minutes)');
  }
}

/**
 * Validates batch size.
 *
 * @param batchSize - Batch size to validate
 * @throws {ConfigurationError} If batch size is invalid
 */
export function validateBatchSize(batchSize: number): void {
  if (typeof batchSize !== 'number' || !Number.isInteger(batchSize)) {
    throw new ConfigurationError('Batch size must be an integer');
  }

  if (batchSize <= 0) {
    throw new ConfigurationError('Batch size must be positive');
  }

  if (batchSize > 10000) {
    throw new ConfigurationError('Batch size must not exceed 10000');
  }
}

/**
 * Validates max retries.
 *
 * @param maxRetries - Max retries to validate
 * @throws {ConfigurationError} If max retries is invalid
 */
export function validateMaxRetries(maxRetries: number): void {
  if (typeof maxRetries !== 'number' || !Number.isInteger(maxRetries)) {
    throw new ConfigurationError('Max retries must be an integer');
  }

  if (maxRetries < 0) {
    throw new ConfigurationError('Max retries must be non-negative');
  }

  if (maxRetries > 100) {
    throw new ConfigurationError('Max retries must not exceed 100');
  }
}

/**
 * Validates retry backoff.
 *
 * @param retryBackoff - Retry backoff in milliseconds to validate
 * @throws {ConfigurationError} If retry backoff is invalid
 */
export function validateRetryBackoff(retryBackoff: number): void {
  if (typeof retryBackoff !== 'number' || !Number.isFinite(retryBackoff)) {
    throw new ConfigurationError('Retry backoff must be a finite number');
  }

  if (retryBackoff < 0) {
    throw new ConfigurationError('Retry backoff must be non-negative');
  }

  if (retryBackoff > 60000) {
    // Max 1 minute
    throw new ConfigurationError('Retry backoff must not exceed 60000ms (1 minute)');
  }
}

/**
 * Validates circuit breaker threshold.
 *
 * @param threshold - Circuit breaker threshold to validate
 * @throws {ConfigurationError} If threshold is invalid
 */
export function validateCircuitBreakerThreshold(threshold: number): void {
  if (typeof threshold !== 'number' || !Number.isInteger(threshold)) {
    throw new ConfigurationError('Circuit breaker threshold must be an integer');
  }

  if (threshold <= 0) {
    throw new ConfigurationError('Circuit breaker threshold must be positive');
  }

  if (threshold > 100) {
    throw new ConfigurationError('Circuit breaker threshold must not exceed 100');
  }
}

/**
 * Validates pool size.
 *
 * @param poolSize - Pool size to validate
 * @throws {ConfigurationError} If pool size is invalid
 */
export function validatePoolSize(poolSize: number): void {
  if (typeof poolSize !== 'number' || !Number.isInteger(poolSize)) {
    throw new ConfigurationError('Pool size must be an integer');
  }

  if (poolSize <= 0) {
    throw new ConfigurationError('Pool size must be positive');
  }

  if (poolSize > 1000) {
    throw new ConfigurationError('Pool size must not exceed 1000');
  }
}

/**
 * Validates idle timeout.
 *
 * @param idleTimeout - Idle timeout in milliseconds to validate
 * @throws {ConfigurationError} If idle timeout is invalid
 */
export function validateIdleTimeout(idleTimeout: number): void {
  if (typeof idleTimeout !== 'number' || !Number.isFinite(idleTimeout)) {
    throw new ConfigurationError('Idle timeout must be a finite number');
  }

  if (idleTimeout <= 0) {
    throw new ConfigurationError('Idle timeout must be positive');
  }

  if (idleTimeout > 3600000) {
    // Max 1 hour
    throw new ConfigurationError('Idle timeout must not exceed 3600000ms (1 hour)');
  }
}

/**
 * Validates schema cache TTL.
 *
 * @param ttl - Schema cache TTL in milliseconds to validate
 * @throws {ConfigurationError} If TTL is invalid
 */
export function validateSchemaCacheTtl(ttl: number): void {
  if (typeof ttl !== 'number' || !Number.isFinite(ttl)) {
    throw new ConfigurationError('Schema cache TTL must be a finite number');
  }

  if (ttl < 0) {
    throw new ConfigurationError('Schema cache TTL must be non-negative');
  }

  if (ttl > 86400000) {
    // Max 24 hours
    throw new ConfigurationError('Schema cache TTL must not exceed 86400000ms (24 hours)');
  }
}

/**
 * Validates tenant allowlist.
 *
 * @param allowlist - Tenant allowlist to validate
 * @throws {ConfigurationError} If allowlist is invalid
 */
export function validateTenantAllowlist(allowlist: string[]): void {
  if (!Array.isArray(allowlist)) {
    throw new ConfigurationError('Tenant allowlist must be an array');
  }

  if (allowlist.length === 0) {
    throw new ConfigurationError('Tenant allowlist must not be empty if provided');
  }

  for (const tenant of allowlist) {
    if (!tenant || typeof tenant !== 'string' || tenant.trim().length === 0) {
      throw new ConfigurationError('Each tenant in allowlist must be a non-empty string');
    }
  }

  // Check for duplicates
  const uniqueTenants = new Set(allowlist);
  if (uniqueTenants.size !== allowlist.length) {
    throw new ConfigurationError('Tenant allowlist contains duplicate entries');
  }
}

/**
 * Type guard to check if an error is a ConfigurationError.
 *
 * @param error - Error to check
 * @returns True if error is a ConfigurationError
 */
export function isConfigurationError(error: unknown): error is ConfigurationError {
  return error instanceof ConfigurationError;
}
