/**
 * Configuration validation for DynamoDB client.
 * @module config/validation
 */

import type { DynamoDBConfig, CredentialsConfig } from './config.js';
import { isStaticCredentials, isProfileCredentials, isRoleCredentials, isWebIdentityCredentials } from './config.js';

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
 * Validates DynamoDB configuration.
 *
 * @param config - Configuration to validate
 * @throws {ConfigurationError} If configuration is invalid
 */
export function validateConfig(config: DynamoDBConfig): void {
  // Validate region if provided
  if (config.region !== undefined) {
    validateRegion(config.region);
  }

  // Validate endpoint if provided
  if (config.endpoint !== undefined) {
    validateEndpoint(config.endpoint);
  }

  // Validate credentials if provided
  if (config.credentials !== undefined) {
    validateCredentials(config.credentials);
  }

  // Validate retry config if provided
  if (config.retryConfig !== undefined) {
    validateRetryConfig(config.retryConfig);
  }

  // Validate circuit breaker config if provided
  if (config.circuitBreakerConfig !== undefined) {
    validateCircuitBreakerConfig(config.circuitBreakerConfig);
  }

  // Validate timeout if provided
  if (config.timeout !== undefined) {
    validateTimeout(config.timeout);
  }

  // Validate max connections if provided
  if (config.maxConnections !== undefined) {
    validateMaxConnections(config.maxConnections);
  }
}

/**
 * Validates AWS region format.
 *
 * @param region - AWS region to validate
 * @throws {ConfigurationError} If region is invalid
 */
function validateRegion(region: string): void {
  if (!region || typeof region !== 'string' || region.trim().length === 0) {
    throw new ConfigurationError('Region must be a non-empty string');
  }

  // Basic validation for AWS region format (e.g., us-east-1, eu-west-2)
  const regionPattern = /^[a-z]{2}-[a-z]+-\d+$/;
  if (!regionPattern.test(region)) {
    throw new ConfigurationError(
      `Invalid region format: ${region}. Expected format like 'us-east-1' or 'eu-west-2'`
    );
  }
}

/**
 * Validates endpoint URL.
 *
 * @param endpoint - Endpoint URL to validate
 * @throws {ConfigurationError} If endpoint is invalid
 */
function validateEndpoint(endpoint: string): void {
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
 * Validates credentials configuration.
 *
 * @param credentials - Credentials to validate
 * @throws {ConfigurationError} If credentials are invalid
 */
function validateCredentials(credentials: CredentialsConfig): void {
  if (isStaticCredentials(credentials)) {
    if (!credentials.accessKeyId || credentials.accessKeyId.trim().length === 0) {
      throw new ConfigurationError('Static credentials require non-empty accessKeyId');
    }
    if (!credentials.secretAccessKey || credentials.secretAccessKey.trim().length === 0) {
      throw new ConfigurationError('Static credentials require non-empty secretAccessKey');
    }
    // Session token is optional
  } else if (isProfileCredentials(credentials)) {
    if (!credentials.profileName || credentials.profileName.trim().length === 0) {
      throw new ConfigurationError('Profile credentials require non-empty profileName');
    }
  } else if (isRoleCredentials(credentials)) {
    if (!credentials.roleArn || credentials.roleArn.trim().length === 0) {
      throw new ConfigurationError('Role credentials require non-empty roleArn');
    }
    // Validate ARN format
    if (!credentials.roleArn.startsWith('arn:aws:iam::')) {
      throw new ConfigurationError(`Invalid role ARN format: ${credentials.roleArn}`);
    }
    // External ID is optional
  } else if (isWebIdentityCredentials(credentials)) {
    if (!credentials.roleArn || credentials.roleArn.trim().length === 0) {
      throw new ConfigurationError('Web identity credentials require non-empty roleArn');
    }
    if (!credentials.roleArn.startsWith('arn:aws:iam::')) {
      throw new ConfigurationError(`Invalid role ARN format: ${credentials.roleArn}`);
    }
    if (!credentials.tokenFile || credentials.tokenFile.trim().length === 0) {
      throw new ConfigurationError('Web identity credentials require non-empty tokenFile');
    }
  }
  // Environment credentials don't need validation
}

/**
 * Validates retry configuration.
 *
 * @param config - Retry configuration to validate
 * @throws {ConfigurationError} If retry config is invalid
 */
function validateRetryConfig(config: { maxAttempts: number; baseDelayMs: number; maxDelayMs: number }): void {
  if (config.maxAttempts < 0) {
    throw new ConfigurationError('Retry maxAttempts must be non-negative');
  }
  if (config.maxAttempts > 100) {
    throw new ConfigurationError('Retry maxAttempts must not exceed 100');
  }
  if (config.baseDelayMs < 0) {
    throw new ConfigurationError('Retry baseDelayMs must be non-negative');
  }
  if (config.maxDelayMs < 0) {
    throw new ConfigurationError('Retry maxDelayMs must be non-negative');
  }
  if (config.baseDelayMs > config.maxDelayMs) {
    throw new ConfigurationError('Retry baseDelayMs must not exceed maxDelayMs');
  }
}

/**
 * Validates circuit breaker configuration.
 *
 * @param config - Circuit breaker configuration to validate
 * @throws {ConfigurationError} If circuit breaker config is invalid
 */
function validateCircuitBreakerConfig(config: {
  failureThreshold: number;
  successThreshold: number;
  openDurationMs: number;
}): void {
  if (config.failureThreshold <= 0) {
    throw new ConfigurationError('Circuit breaker failureThreshold must be positive');
  }
  if (config.failureThreshold > 100) {
    throw new ConfigurationError('Circuit breaker failureThreshold must not exceed 100');
  }
  if (config.successThreshold <= 0) {
    throw new ConfigurationError('Circuit breaker successThreshold must be positive');
  }
  if (config.successThreshold > 100) {
    throw new ConfigurationError('Circuit breaker successThreshold must not exceed 100');
  }
  if (config.openDurationMs <= 0) {
    throw new ConfigurationError('Circuit breaker openDurationMs must be positive');
  }
  if (config.openDurationMs > 3600000) {
    // Max 1 hour
    throw new ConfigurationError('Circuit breaker openDurationMs must not exceed 3600000 (1 hour)');
  }
}

/**
 * Validates timeout value.
 *
 * @param timeout - Timeout in milliseconds to validate
 * @throws {ConfigurationError} If timeout is invalid
 */
function validateTimeout(timeout: number): void {
  if (timeout < 0) {
    throw new ConfigurationError('Timeout must be non-negative');
  }
  if (timeout > 300000) {
    // Max 5 minutes
    throw new ConfigurationError('Timeout must not exceed 300000ms (5 minutes)');
  }
}

/**
 * Validates max connections value.
 *
 * @param maxConnections - Maximum connections to validate
 * @throws {ConfigurationError} If max connections is invalid
 */
function validateMaxConnections(maxConnections: number): void {
  if (maxConnections <= 0) {
    throw new ConfigurationError('Max connections must be positive');
  }
  if (maxConnections > 1000) {
    throw new ConfigurationError('Max connections must not exceed 1000');
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
