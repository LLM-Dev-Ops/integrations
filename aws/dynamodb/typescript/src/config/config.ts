/**
 * Configuration types and interfaces for DynamoDB client.
 * @module config
 */

/**
 * Credentials configuration with support for multiple authentication methods.
 */
export type CredentialsConfig =
  | { type: 'static'; accessKeyId: string; secretAccessKey: string; sessionToken?: string }
  | { type: 'profile'; profileName: string }
  | { type: 'role'; roleArn: string; externalId?: string }
  | { type: 'webIdentity'; roleArn: string; tokenFile: string }
  | { type: 'environment' };

/**
 * Retry configuration for failed requests.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts. */
  maxAttempts: number;
  /** Base delay in milliseconds before first retry. */
  baseDelayMs: number;
  /** Maximum delay in milliseconds between retries. */
  maxDelayMs: number;
}

/**
 * Circuit breaker configuration for fault tolerance.
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit. */
  failureThreshold: number;
  /** Number of successes to close the circuit. */
  successThreshold: number;
  /** Duration in milliseconds to keep the circuit open. */
  openDurationMs: number;
}

/**
 * Main configuration interface for DynamoDB client.
 */
export interface DynamoDBConfig {
  /**
   * AWS region where DynamoDB is located.
   * @example 'us-east-1', 'eu-west-1'
   */
  region?: string;

  /**
   * Custom endpoint URL (useful for local DynamoDB or testing).
   * @example 'http://localhost:8000' for DynamoDB Local
   */
  endpoint?: string;

  /**
   * Credentials configuration for authentication.
   * Supports multiple authentication methods including static credentials,
   * AWS profiles, IAM roles, and web identity.
   */
  credentials?: CredentialsConfig;

  /**
   * Retry configuration for handling transient failures.
   */
  retryConfig?: RetryConfig;

  /**
   * Circuit breaker configuration for fault tolerance.
   */
  circuitBreakerConfig?: CircuitBreakerConfig;

  /**
   * Request timeout in milliseconds.
   * @default 5000
   */
  timeout?: number;

  /**
   * Custom headers to include in all requests.
   */
  headers?: Record<string, string>;

  /**
   * Maximum number of connections in the connection pool.
   */
  maxConnections?: number;
}

/**
 * Helper to check if credentials are static.
 */
export function isStaticCredentials(
  credentials: CredentialsConfig
): credentials is { type: 'static'; accessKeyId: string; secretAccessKey: string; sessionToken?: string } {
  return credentials.type === 'static';
}

/**
 * Helper to check if credentials use a profile.
 */
export function isProfileCredentials(
  credentials: CredentialsConfig
): credentials is { type: 'profile'; profileName: string } {
  return credentials.type === 'profile';
}

/**
 * Helper to check if credentials use a role.
 */
export function isRoleCredentials(
  credentials: CredentialsConfig
): credentials is { type: 'role'; roleArn: string; externalId?: string } {
  return credentials.type === 'role';
}

/**
 * Helper to check if credentials use web identity.
 */
export function isWebIdentityCredentials(
  credentials: CredentialsConfig
): credentials is { type: 'webIdentity'; roleArn: string; tokenFile: string } {
  return credentials.type === 'webIdentity';
}

/**
 * Helper to check if credentials come from environment.
 */
export function isEnvironmentCredentials(
  credentials: CredentialsConfig
): credentials is { type: 'environment' } {
  return credentials.type === 'environment';
}

/**
 * Fluent builder for creating DynamoDBConfig objects.
 */
export class DynamoDBConfigBuilder {
  private config: DynamoDBConfig = {};

  /**
   * Sets the AWS region.
   */
  withRegion(region: string): this {
    this.config.region = region;
    return this;
  }

  /**
   * Sets the custom endpoint URL.
   */
  withEndpoint(endpoint: string): this {
    this.config.endpoint = endpoint;
    return this;
  }

  /**
   * Sets static credentials.
   */
  withStaticCredentials(
    accessKeyId: string,
    secretAccessKey: string,
    sessionToken?: string
  ): this {
    this.config.credentials = {
      type: 'static',
      accessKeyId,
      secretAccessKey,
      sessionToken,
    };
    return this;
  }

  /**
   * Sets profile-based credentials.
   */
  withProfileCredentials(profileName: string): this {
    this.config.credentials = {
      type: 'profile',
      profileName,
    };
    return this;
  }

  /**
   * Sets role-based credentials.
   */
  withRoleCredentials(roleArn: string, externalId?: string): this {
    this.config.credentials = {
      type: 'role',
      roleArn,
      externalId,
    };
    return this;
  }

  /**
   * Sets web identity credentials.
   */
  withWebIdentityCredentials(roleArn: string, tokenFile: string): this {
    this.config.credentials = {
      type: 'webIdentity',
      roleArn,
      tokenFile,
    };
    return this;
  }

  /**
   * Sets environment-based credentials.
   */
  withEnvironmentCredentials(): this {
    this.config.credentials = { type: 'environment' };
    return this;
  }

  /**
   * Sets the retry configuration.
   */
  withRetryConfig(config: RetryConfig): this {
    this.config.retryConfig = config;
    return this;
  }

  /**
   * Sets the circuit breaker configuration.
   */
  withCircuitBreakerConfig(config: CircuitBreakerConfig): this {
    this.config.circuitBreakerConfig = config;
    return this;
  }

  /**
   * Sets the request timeout.
   */
  withTimeout(timeout: number): this {
    this.config.timeout = timeout;
    return this;
  }

  /**
   * Adds a custom header.
   */
  withHeader(key: string, value: string): this {
    this.config.headers = { ...this.config.headers, [key]: value };
    return this;
  }

  /**
   * Sets multiple custom headers.
   */
  withHeaders(headers: Record<string, string>): this {
    this.config.headers = { ...this.config.headers, ...headers };
    return this;
  }

  /**
   * Sets the maximum number of connections.
   */
  withMaxConnections(maxConnections: number): this {
    this.config.maxConnections = maxConnections;
    return this;
  }

  /**
   * Builds the configuration.
   */
  build(): DynamoDBConfig {
    return { ...this.config };
  }

  /**
   * Creates a builder from an existing config.
   */
  static from(config: DynamoDBConfig): DynamoDBConfigBuilder {
    const builder = new DynamoDBConfigBuilder();
    builder.config = { ...config };
    return builder;
  }
}
