/**
 * Configuration types for the Amazon ECR client.
 * @module config
 */

import { EcrError, EcrErrorKind } from './errors.js';

/** Default AWS ECR region. */
export const DEFAULT_REGION = 'us-east-1';

/** Default maximum retry attempts. */
export const DEFAULT_MAX_RETRIES = 3;

/** Default request timeout in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 30000;

/** Default token refresh buffer in seconds (5 minutes before expiry). */
export const DEFAULT_TOKEN_REFRESH_BUFFER_SECS = 300;

/**
 * Authentication configuration using default AWS credential chain.
 * This will attempt to load credentials from:
 * 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 * 2. Shared credentials file (~/.aws/credentials)
 * 3. IAM role for EC2/ECS/Lambda
 */
export interface DefaultChainAuth {
  type: 'default';
}

/**
 * Authentication configuration using static credentials.
 */
export interface StaticAuth {
  type: 'static';
  /** AWS access key ID. */
  accessKeyId: string;
  /** AWS secret access key. */
  secretAccessKey: string;
  /** Optional session token for temporary credentials. */
  sessionToken?: string;
}

/**
 * Authentication configuration using AssumeRole.
 */
export interface AssumeRoleAuth {
  type: 'assume_role';
  /** ARN of the role to assume. */
  roleArn: string;
  /** Optional session name (defaults to generated name). */
  sessionName?: string;
  /** Optional external ID for role assumption. */
  externalId?: string;
}

/**
 * Authentication configuration using Web Identity token.
 * Used for OIDC/IRSA in Kubernetes environments.
 */
export interface WebIdentityAuth {
  type: 'web_identity';
  /** ARN of the role to assume. */
  roleArn: string;
  /** Path to the token file. */
  tokenFile: string;
}

/**
 * Union type for all authentication configurations.
 */
export type AuthConfig =
  | DefaultChainAuth
  | StaticAuth
  | AssumeRoleAuth
  | WebIdentityAuth;

/**
 * Amazon ECR client configuration.
 */
export interface EcrConfig {
  /** Authentication configuration. */
  auth: AuthConfig;

  /** AWS region (e.g., 'us-east-1', 'eu-west-1'). */
  region: string;

  /** AWS account ID (registry ID). If not specified, defaults to the caller's account. */
  registryId?: string;

  /** Override endpoint URL for testing or VPC endpoints. */
  endpointUrl?: string;

  /** Use FIPS-compliant endpoints (default: false). */
  useFips?: boolean;

  /** Use dual-stack endpoints for IPv4/IPv6 (default: false). */
  useDualstack?: boolean;

  /** Maximum number of retry attempts (default: 3). */
  maxRetries?: number;

  /** Request timeout in milliseconds (default: 30000). */
  requestTimeoutMs?: number;

  /** Token refresh buffer in seconds - refresh tokens this many seconds before expiry (default: 300). */
  tokenRefreshBufferSecs?: number;

  /** Use ECR Public registry instead of private (default: false). */
  publicRegistry?: boolean;
}

/**
 * Validates an ECR configuration.
 * @param config - The configuration to validate.
 * @throws {EcrError} If the configuration is invalid.
 */
export function validateConfig(config: EcrConfig): void {
  // Validate region
  if (!config.region || config.region.trim() === '') {
    throw new EcrError(
      EcrErrorKind.InvalidRegion,
      'Region cannot be empty'
    );
  }

  // Basic region format validation (e.g., us-east-1, eu-west-2)
  const regionPattern = /^[a-z]{2}-[a-z]+-\d+$/;
  if (!regionPattern.test(config.region)) {
    throw new EcrError(
      EcrErrorKind.InvalidRegion,
      `Invalid region format: ${config.region}. Expected format: xx-xxxx-N (e.g., us-east-1)`
    );
  }

  // Validate endpoint URL if provided
  if (config.endpointUrl) {
    if (!config.endpointUrl.startsWith('http://') && !config.endpointUrl.startsWith('https://')) {
      throw new EcrError(
        EcrErrorKind.InvalidEndpointUrl,
        'Endpoint URL must start with http:// or https://'
      );
    }

    try {
      new URL(config.endpointUrl);
    } catch (error) {
      throw new EcrError(
        EcrErrorKind.InvalidEndpointUrl,
        `Invalid endpoint URL format: ${config.endpointUrl}`
      );
    }
  }

  // Validate timeout
  if (config.requestTimeoutMs !== undefined && config.requestTimeoutMs <= 0) {
    throw new EcrError(
      EcrErrorKind.InvalidConfiguration,
      'Request timeout must be greater than 0'
    );
  }

  // Validate max retries
  if (config.maxRetries !== undefined && config.maxRetries < 0) {
    throw new EcrError(
      EcrErrorKind.InvalidConfiguration,
      'Max retries must be non-negative'
    );
  }

  // Validate token refresh buffer
  if (config.tokenRefreshBufferSecs !== undefined && config.tokenRefreshBufferSecs < 0) {
    throw new EcrError(
      EcrErrorKind.InvalidConfiguration,
      'Token refresh buffer must be non-negative'
    );
  }

  // Validate authentication configuration
  validateAuthConfig(config.auth);
}

/**
 * Validates authentication configuration.
 * @param auth - The authentication configuration to validate.
 * @throws {EcrError} If the authentication configuration is invalid.
 */
function validateAuthConfig(auth: AuthConfig): void {
  switch (auth.type) {
    case 'default':
      // No additional validation needed
      break;

    case 'static':
      if (!auth.accessKeyId || auth.accessKeyId.trim() === '') {
        throw new EcrError(
          EcrErrorKind.MissingAuth,
          'Access key ID is required for static authentication'
        );
      }
      if (!auth.secretAccessKey || auth.secretAccessKey.trim() === '') {
        throw new EcrError(
          EcrErrorKind.MissingAuth,
          'Secret access key is required for static authentication'
        );
      }
      break;

    case 'assume_role':
      if (!auth.roleArn || auth.roleArn.trim() === '') {
        throw new EcrError(
          EcrErrorKind.MissingAuth,
          'Role ARN is required for assume role authentication'
        );
      }
      // Validate ARN format
      if (!auth.roleArn.startsWith('arn:aws:iam::')) {
        throw new EcrError(
          EcrErrorKind.InvalidConfiguration,
          `Invalid role ARN format: ${auth.roleArn}. Expected format: arn:aws:iam::ACCOUNT:role/ROLE_NAME`
        );
      }
      break;

    case 'web_identity':
      if (!auth.roleArn || auth.roleArn.trim() === '') {
        throw new EcrError(
          EcrErrorKind.MissingAuth,
          'Role ARN is required for web identity authentication'
        );
      }
      if (!auth.tokenFile || auth.tokenFile.trim() === '') {
        throw new EcrError(
          EcrErrorKind.MissingAuth,
          'Token file is required for web identity authentication'
        );
      }
      break;

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = auth;
      throw new EcrError(
        EcrErrorKind.InvalidConfiguration,
        `Unknown authentication type: ${(_exhaustive as AuthConfig).type}`
      );
  }
}

/**
 * Creates a default ECR configuration with default chain authentication.
 * @param region - The AWS region (default: us-east-1).
 * @returns The default configuration.
 */
export function createDefaultConfig(region: string = DEFAULT_REGION): EcrConfig {
  return {
    auth: { type: 'default' },
    region,
    maxRetries: DEFAULT_MAX_RETRIES,
    requestTimeoutMs: DEFAULT_TIMEOUT_MS,
    tokenRefreshBufferSecs: DEFAULT_TOKEN_REFRESH_BUFFER_SECS,
    useFips: false,
    useDualstack: false,
    publicRegistry: false,
  };
}

/**
 * Builder for EcrConfig.
 */
export class EcrConfigBuilder {
  private config: EcrConfig;

  constructor(region: string = DEFAULT_REGION) {
    this.config = createDefaultConfig(region);
  }

  /**
   * Sets the AWS region.
   * @param region - The AWS region.
   * @returns The builder instance for chaining.
   */
  region(region: string): this {
    this.config.region = region;
    return this;
  }

  /**
   * Sets default chain authentication.
   * @returns The builder instance for chaining.
   */
  defaultAuth(): this {
    this.config.auth = { type: 'default' };
    return this;
  }

  /**
   * Sets static credentials authentication.
   * @param accessKeyId - AWS access key ID.
   * @param secretAccessKey - AWS secret access key.
   * @param sessionToken - Optional session token.
   * @returns The builder instance for chaining.
   */
  staticAuth(
    accessKeyId: string,
    secretAccessKey: string,
    sessionToken?: string
  ): this {
    this.config.auth = {
      type: 'static',
      accessKeyId,
      secretAccessKey,
      sessionToken,
    };
    return this;
  }

  /**
   * Sets assume role authentication.
   * @param roleArn - ARN of the role to assume.
   * @param sessionName - Optional session name.
   * @param externalId - Optional external ID.
   * @returns The builder instance for chaining.
   */
  assumeRoleAuth(
    roleArn: string,
    sessionName?: string,
    externalId?: string
  ): this {
    this.config.auth = {
      type: 'assume_role',
      roleArn,
      sessionName,
      externalId,
    };
    return this;
  }

  /**
   * Sets web identity authentication.
   * @param roleArn - ARN of the role to assume.
   * @param tokenFile - Path to the token file.
   * @returns The builder instance for chaining.
   */
  webIdentityAuth(roleArn: string, tokenFile: string): this {
    this.config.auth = {
      type: 'web_identity',
      roleArn,
      tokenFile,
    };
    return this;
  }

  /**
   * Sets the registry ID (AWS account ID).
   * @param registryId - The AWS account ID.
   * @returns The builder instance for chaining.
   */
  registryId(registryId: string): this {
    this.config.registryId = registryId;
    return this;
  }

  /**
   * Sets the endpoint URL override.
   * @param url - The endpoint URL.
   * @returns The builder instance for chaining.
   */
  endpointUrl(url: string): this {
    this.config.endpointUrl = url;
    return this;
  }

  /**
   * Enables FIPS-compliant endpoints.
   * @param enabled - Whether to use FIPS endpoints (default: true).
   * @returns The builder instance for chaining.
   */
  useFips(enabled: boolean = true): this {
    this.config.useFips = enabled;
    return this;
  }

  /**
   * Enables dual-stack endpoints.
   * @param enabled - Whether to use dual-stack endpoints (default: true).
   * @returns The builder instance for chaining.
   */
  useDualstack(enabled: boolean = true): this {
    this.config.useDualstack = enabled;
    return this;
  }

  /**
   * Sets the maximum number of retry attempts.
   * @param retries - Maximum retry attempts.
   * @returns The builder instance for chaining.
   */
  maxRetries(retries: number): this {
    this.config.maxRetries = retries;
    return this;
  }

  /**
   * Sets the request timeout.
   * @param timeoutMs - Timeout in milliseconds.
   * @returns The builder instance for chaining.
   */
  requestTimeout(timeoutMs: number): this {
    this.config.requestTimeoutMs = timeoutMs;
    return this;
  }

  /**
   * Sets the token refresh buffer.
   * @param bufferSecs - Buffer in seconds.
   * @returns The builder instance for chaining.
   */
  tokenRefreshBuffer(bufferSecs: number): this {
    this.config.tokenRefreshBufferSecs = bufferSecs;
    return this;
  }

  /**
   * Enables ECR Public registry mode.
   * @param enabled - Whether to use ECR Public (default: true).
   * @returns The builder instance for chaining.
   */
  publicRegistry(enabled: boolean = true): this {
    this.config.publicRegistry = enabled;
    return this;
  }

  /**
   * Builds and validates the configuration.
   * @returns The validated configuration.
   * @throws {EcrError} If the configuration is invalid.
   */
  build(): EcrConfig {
    validateConfig(this.config);
    return { ...this.config };
  }
}

/**
 * Namespace for EcrConfig-related utilities.
 */
export namespace EcrConfig {
  /**
   * Creates a new configuration builder.
   * @param region - The AWS region (default: us-east-1).
   * @returns A new EcrConfigBuilder instance.
   */
  export function builder(region?: string): EcrConfigBuilder {
    return new EcrConfigBuilder(region);
  }

  /**
   * Creates a default configuration.
   * @param region - The AWS region (default: us-east-1).
   * @returns The default configuration.
   */
  export function defaultConfig(region?: string): EcrConfig {
    return createDefaultConfig(region);
  }

  /**
   * Validates a configuration.
   * @param config - The configuration to validate.
   * @throws {EcrError} If the configuration is invalid.
   */
  export function validate(config: EcrConfig): void {
    validateConfig(config);
  }
}
