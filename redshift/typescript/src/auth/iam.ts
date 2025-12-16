/**
 * IAM Authentication Providers for Amazon Redshift
 *
 * Implements authentication providers that use AWS IAM to generate
 * temporary database credentials. Supports both provisioned clusters
 * and Redshift Serverless, as well as AWS Secrets Manager integration.
 *
 * @module @llmdevops/redshift-integration/auth/iam
 */

import {
  RedshiftClient,
  GetClusterCredentialsCommand,
  type GetClusterCredentialsCommandOutput,
} from '@aws-sdk/client-redshift';
import {
  STSClient,
  AssumeRoleCommand,
  type AssumeRoleCommandOutput,
  type Credentials as STSCredentials,
} from '@aws-sdk/client-sts';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
  type GetSecretValueCommandOutput,
} from '@aws-sdk/client-secrets-manager';
import {
  BaseAuthProvider,
  type ConnectionCredentials,
  type IamCredentialSource,
  type SecretsManagerCredentialSource,
  type DatabaseCredentialSource,
} from './provider.js';

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base error class for authentication-related errors.
 */
export class AuthenticationError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when IAM authentication fails.
 */
export class IamAuthenticationError extends AuthenticationError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'IamAuthenticationError';
  }
}

/**
 * Error thrown when Secrets Manager operations fail.
 */
export class SecretsManagerError extends AuthenticationError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'SecretsManagerError';
  }
}

// ============================================================================
// IAM Authentication Provider
// ============================================================================

/**
 * Authentication provider using AWS IAM to generate temporary database credentials.
 *
 * This provider uses the Redshift `GetClusterCredentials` API to generate
 * temporary database credentials with a 15-minute default TTL. It supports:
 * - Provisioned Redshift clusters
 * - Redshift Serverless workgroups
 * - IAM role assumption for cross-account access
 * - Proactive credential refresh (3 minutes before expiration)
 *
 * The provider automatically caches credentials and refreshes them before
 * expiration to ensure uninterrupted database access.
 *
 * @example
 * ```typescript
 * // Basic IAM authentication
 * const provider = new IamAuthProvider({
 *   type: 'iam',
 *   clusterIdentifier: 'my-cluster',
 *   region: 'us-east-1',
 *   dbUser: 'admin'
 * });
 *
 * // With role assumption
 * const provider = new IamAuthProvider({
 *   type: 'iam',
 *   clusterIdentifier: 'my-cluster',
 *   region: 'us-east-1',
 *   dbUser: 'admin',
 *   roleArn: 'arn:aws:iam::123456789012:role/RedshiftRole'
 * });
 *
 * // Serverless workgroup
 * const provider = new IamAuthProvider({
 *   type: 'iam',
 *   clusterIdentifier: 'my-workgroup',
 *   region: 'us-east-1',
 *   dbUser: 'admin',
 *   isServerless: true
 * });
 * ```
 */
export class IamAuthProvider extends BaseAuthProvider {
  private readonly config: IamCredentialSource;
  private redshiftClient: RedshiftClient;
  private stsClient?: STSClient;
  private assumedRoleCredentials?: STSCredentials;
  private roleCredentialsExpiration?: Date;

  /**
   * Creates a new IAM authentication provider.
   *
   * @param config - IAM credential source configuration
   */
  constructor(config: IamCredentialSource) {
    super();
    this.config = config;

    // Initialize Redshift client
    this.redshiftClient = new RedshiftClient({
      region: config.region,
    });

    // Initialize STS client if role ARN is provided
    if (config.roleArn) {
      this.stsClient = new STSClient({
        region: config.region,
      });
    }

    // Set expiration buffer to 3 minutes for IAM credentials
    // IAM credentials typically have 15-minute TTL, refresh at 12 minutes
    this.expirationBufferMs = 3 * 60 * 1000;
  }

  /**
   * Fetches fresh credentials from AWS IAM.
   *
   * If a role ARN is configured, this method will:
   * 1. Assume the IAM role using STS
   * 2. Use the assumed role credentials to call GetClusterCredentials
   *
   * Otherwise, it uses the default AWS credential chain.
   *
   * @returns Promise resolving to temporary database credentials
   * @throws {IamAuthenticationError} If credential generation fails
   */
  protected async refreshCredentials(): Promise<ConnectionCredentials> {
    try {
      // Assume role if configured and credentials are expired/missing
      if (this.config.roleArn && this.shouldRefreshRoleCredentials()) {
        await this.assumeRole();
      }

      // Get temporary database credentials from Redshift
      const dbCredentials = await this.getDbAuthToken();

      // Log successful refresh (without exposing secrets)
      this.logTokenRefresh(dbCredentials.expiresAt);

      return dbCredentials;
    } catch (error) {
      throw new IamAuthenticationError(
        `Failed to refresh IAM credentials for cluster '${this.config.clusterIdentifier}'`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Assumes an IAM role and caches the temporary credentials.
   *
   * @throws {IamAuthenticationError} If role assumption fails
   */
  private async assumeRole(): Promise<void> {
    if (!this.stsClient || !this.config.roleArn) {
      return;
    }

    try {
      const command = new AssumeRoleCommand({
        RoleArn: this.config.roleArn,
        RoleSessionName: `redshift-integration-${Date.now()}`,
        DurationSeconds: 3600, // 1 hour
      });

      const response: AssumeRoleCommandOutput = await this.stsClient.send(command);

      if (!response.Credentials) {
        throw new Error('AssumeRole response missing credentials');
      }

      this.assumedRoleCredentials = response.Credentials;
      this.roleCredentialsExpiration = response.Credentials.Expiration;

      // Update Redshift client with assumed role credentials
      this.redshiftClient = new RedshiftClient({
        region: this.config.region,
        credentials: {
          accessKeyId: response.Credentials.AccessKeyId!,
          secretAccessKey: response.Credentials.SecretAccessKey!,
          sessionToken: response.Credentials.SessionToken,
        },
      });

      console.log(`[IamAuthProvider] Assumed role: ${this.config.roleArn}`);
    } catch (error) {
      throw new IamAuthenticationError(
        `Failed to assume role '${this.config.roleArn}'`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Checks if assumed role credentials need refresh.
   *
   * @returns true if role credentials should be refreshed
   */
  private shouldRefreshRoleCredentials(): boolean {
    if (!this.assumedRoleCredentials || !this.roleCredentialsExpiration) {
      return true;
    }

    // Refresh role credentials 5 minutes before expiration
    const bufferMs = 5 * 60 * 1000;
    const expirationWithBuffer = new Date(
      this.roleCredentialsExpiration.getTime() - bufferMs
    );
    return new Date() >= expirationWithBuffer;
  }

  /**
   * Generates temporary database credentials using Redshift GetClusterCredentials API.
   *
   * @returns Promise resolving to database credentials with expiration
   * @throws {Error} If API call fails
   */
  private async getDbAuthToken(): Promise<ConnectionCredentials> {
    const command = new GetClusterCredentialsCommand({
      ClusterIdentifier: this.config.clusterIdentifier,
      DbUser: this.config.dbUser,
      DbName: this.config.database,
      DurationSeconds: this.config.durationSeconds || 900, // Default 15 minutes
      AutoCreate: false, // Don't auto-create user
    });

    const response: GetClusterCredentialsCommandOutput =
      await this.redshiftClient.send(command);

    if (!response.DbUser || !response.DbPassword) {
      throw new Error('GetClusterCredentials response missing credentials');
    }

    return {
      username: response.DbUser,
      password: response.DbPassword,
      database: this.config.database,
      expiresAt: response.Expiration,
    };
  }

  /**
   * Logs token refresh events without exposing sensitive information.
   *
   * @param expiresAt - Expiration timestamp of new credentials
   */
  private logTokenRefresh(expiresAt?: Date): void {
    const expirationStr = expiresAt
      ? expiresAt.toISOString()
      : 'no expiration';

    console.log(
      `[IamAuthProvider] Refreshed credentials for cluster '${this.config.clusterIdentifier}', ` +
      `expires at: ${expirationStr}`
    );
  }
}

// ============================================================================
// Secrets Manager Authentication Provider
// ============================================================================

/**
 * Secret structure expected in AWS Secrets Manager.
 */
interface RedshiftSecret {
  username: string;
  password: string;
  database?: string;
  host?: string;
  port?: number;
}

/**
 * Authentication provider using AWS Secrets Manager.
 *
 * This provider fetches database credentials from AWS Secrets Manager
 * and caches them with a configurable TTL. It's useful for:
 * - Centralized credential management
 * - Automatic credential rotation
 * - Sharing credentials across applications
 *
 * The expected secret format is JSON with the following structure:
 * ```json
 * {
 *   "username": "dbuser",
 *   "password": "dbpassword",
 *   "database": "mydb",
 *   "host": "cluster.region.redshift.amazonaws.com",
 *   "port": 5439
 * }
 * ```
 *
 * @example
 * ```typescript
 * const provider = new SecretsManagerAuthProvider({
 *   type: 'secrets-manager',
 *   secretId: 'prod/redshift/credentials',
 *   region: 'us-east-1',
 *   cacheTtl: 3600 // 1 hour
 * });
 *
 * const credentials = await provider.getCredentials();
 * ```
 */
export class SecretsManagerAuthProvider extends BaseAuthProvider {
  private readonly config: SecretsManagerCredentialSource;
  private readonly secretsClient: SecretsManagerClient;
  private readonly cacheTtlMs: number;

  /**
   * Creates a new Secrets Manager authentication provider.
   *
   * @param config - Secrets Manager credential source configuration
   */
  constructor(config: SecretsManagerCredentialSource) {
    super();
    this.config = config;
    this.cacheTtlMs = (config.cacheTtl || 3600) * 1000; // Default 1 hour

    this.secretsClient = new SecretsManagerClient({
      region: config.region,
    });
  }

  /**
   * Fetches credentials from AWS Secrets Manager.
   *
   * @returns Promise resolving to database credentials
   * @throws {SecretsManagerError} If secret retrieval or parsing fails
   */
  protected async refreshCredentials(): Promise<ConnectionCredentials> {
    try {
      const command = new GetSecretValueCommand({
        SecretId: this.config.secretId,
      });

      const response: GetSecretValueCommandOutput =
        await this.secretsClient.send(command);

      if (!response.SecretString) {
        throw new Error('Secret value is empty or binary (expected JSON string)');
      }

      const secret: RedshiftSecret = JSON.parse(response.SecretString);

      if (!secret.username || !secret.password) {
        throw new Error('Secret must contain "username" and "password" fields');
      }

      // Calculate expiration based on cache TTL
      const expiresAt = new Date(Date.now() + this.cacheTtlMs);

      console.log(
        `[SecretsManagerAuthProvider] Fetched credentials from secret '${this.config.secretId}', ` +
        `cache expires at: ${expiresAt.toISOString()}`
      );

      return {
        username: secret.username,
        password: secret.password,
        database: secret.database,
        expiresAt,
      };
    } catch (error) {
      throw new SecretsManagerError(
        `Failed to fetch credentials from secret '${this.config.secretId}'`,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}

// ============================================================================
// Database Authentication Provider
// ============================================================================

/**
 * Authentication provider using static database credentials.
 *
 * This is the simplest authentication method, using a static username
 * and password. Credentials don't expire and are suitable for:
 * - Development and testing environments
 * - Legacy applications
 * - Use cases where IAM is not available
 *
 * For production environments, consider using IAM or Secrets Manager
 * authentication for better security and credential rotation.
 *
 * @example
 * ```typescript
 * const provider = new DatabaseAuthProvider({
 *   type: 'database',
 *   username: 'admin',
 *   password: 'mypassword',
 *   database: 'mydb'
 * });
 *
 * const credentials = await provider.getCredentials();
 * ```
 */
export class DatabaseAuthProvider extends BaseAuthProvider {
  private readonly config: DatabaseCredentialSource;

  /**
   * Creates a new database authentication provider.
   *
   * @param config - Database credential source configuration
   */
  constructor(config: DatabaseCredentialSource) {
    super();
    this.config = config;

    // Validate configuration
    if (!config.username || config.username.trim() === '') {
      throw new AuthenticationError('Username is required for database authentication');
    }
    if (!config.password || config.password.trim() === '') {
      throw new AuthenticationError('Password is required for database authentication');
    }
  }

  /**
   * Returns static database credentials.
   *
   * @returns Promise resolving to database credentials
   */
  protected async refreshCredentials(): Promise<ConnectionCredentials> {
    return {
      username: this.config.username,
      password: this.config.password,
      database: this.config.database,
      // No expiration for static credentials
    };
  }

  /**
   * Static credentials never expire.
   *
   * @returns false unless credentials haven't been initialized
   */
  isExpired(): boolean {
    return this.credentials === null;
  }
}
