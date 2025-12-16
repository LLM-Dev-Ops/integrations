/**
 * Authentication Provider Interfaces for Amazon Redshift
 *
 * Defines the core authentication provider interface and credential types
 * for Redshift database connections. Supports multiple authentication methods
 * including IAM, Secrets Manager, and traditional database credentials.
 *
 * @module @llmdevops/redshift-integration/auth/provider
 */

// ============================================================================
// Connection Credentials Type
// ============================================================================

/**
 * Database connection credentials returned by authentication providers.
 * These credentials are used to establish connections to Redshift clusters.
 */
export interface ConnectionCredentials {
  /**
   * Database username for authentication.
   * For IAM auth, this is typically the DbUser from GetClusterCredentials.
   */
  username: string;

  /**
   * Database password or authentication token.
   * For IAM auth, this is a temporary password/token from AWS.
   * For static auth, this is the database password.
   */
  password: string;

  /**
   * Optional expiration timestamp for temporary credentials.
   * IAM-generated credentials typically expire after 15 minutes.
   * Undefined for static credentials that don't expire.
   */
  expiresAt?: Date;

  /**
   * Optional database name to connect to.
   * Can be specified by the provider or overridden at connection time.
   */
  database?: string;
}

// ============================================================================
// Credential Source Configuration
// ============================================================================

/**
 * Configuration for IAM-based authentication.
 * Uses AWS IAM to generate temporary database credentials.
 */
export interface IamCredentialSource {
  /** Authentication method type */
  type: 'iam';

  /** Redshift cluster identifier or workgroup name */
  clusterIdentifier: string;

  /** AWS region where the Redshift cluster is located */
  region: string;

  /** Database username to authenticate as */
  dbUser: string;

  /** Optional IAM role ARN to assume for authentication */
  roleArn?: string;

  /** Optional database name */
  database?: string;

  /** Optional duration for credentials in seconds (default: 900 = 15 minutes) */
  durationSeconds?: number;

  /**
   * Whether this is a Redshift Serverless workgroup (true) or provisioned cluster (false).
   * Default: false (provisioned cluster)
   */
  isServerless?: boolean;
}

/**
 * Configuration for AWS Secrets Manager-based authentication.
 * Fetches database credentials from AWS Secrets Manager.
 */
export interface SecretsManagerCredentialSource {
  /** Authentication method type */
  type: 'secrets-manager';

  /** ARN or name of the secret in AWS Secrets Manager */
  secretId: string;

  /** AWS region where the secret is stored */
  region: string;

  /** Cache TTL in seconds (default: 3600 = 1 hour) */
  cacheTtl?: number;
}

/**
 * Configuration for static database credentials.
 * Uses traditional username/password authentication.
 */
export interface DatabaseCredentialSource {
  /** Authentication method type */
  type: 'database';

  /** Database username */
  username: string;

  /** Database password */
  password: string;

  /** Optional database name */
  database?: string;
}

/**
 * Union type of all supported credential sources.
 */
export type CredentialSource =
  | IamCredentialSource
  | SecretsManagerCredentialSource
  | DatabaseCredentialSource;

// ============================================================================
// Authentication Provider Interface
// ============================================================================

/**
 * Interface for authentication providers.
 *
 * All Redshift authentication methods must implement this interface.
 * Providers are responsible for obtaining, caching, and refreshing
 * database credentials as needed.
 *
 * @example
 * ```typescript
 * const provider = createAuthProvider({
 *   type: 'iam',
 *   clusterIdentifier: 'my-cluster',
 *   region: 'us-east-1',
 *   dbUser: 'admin'
 * });
 *
 * // Get credentials (will fetch if expired)
 * const creds = await provider.getCredentials();
 *
 * // Check if refresh needed
 * if (provider.isExpired()) {
 *   await provider.refresh();
 * }
 * ```
 */
export interface AuthProvider {
  /**
   * Gets the current credentials.
   *
   * This method returns cached credentials if they are still valid,
   * or automatically refreshes them if they have expired.
   *
   * @returns Promise resolving to database connection credentials
   * @throws {AuthenticationError} If credentials cannot be obtained
   */
  getCredentials(): Promise<ConnectionCredentials>;

  /**
   * Explicitly refreshes the credentials.
   *
   * Forces a credential refresh regardless of expiration status.
   * Useful for proactive refresh before credentials expire.
   *
   * @returns Promise that resolves when refresh is complete
   * @throws {AuthenticationError} If credentials cannot be refreshed
   */
  refresh(): Promise<void>;

  /**
   * Checks if the current credentials are expired or need refresh.
   *
   * Implementations should include a buffer time (e.g., 3 minutes)
   * before actual expiration to allow for proactive refresh.
   *
   * @returns true if credentials are expired or need refresh, false otherwise
   */
  isExpired(): boolean;
}

// ============================================================================
// Base Authentication Provider
// ============================================================================

/**
 * Abstract base class for authentication providers.
 *
 * Provides common functionality for credential caching, expiration checking,
 * and automatic refresh logic. Concrete providers should extend this class
 * and implement the `refreshCredentials` method.
 *
 * @example
 * ```typescript
 * class CustomAuthProvider extends BaseAuthProvider {
 *   protected async refreshCredentials(): Promise<ConnectionCredentials> {
 *     // Implement credential fetching logic
 *     return {
 *       username: 'myuser',
 *       password: 'mypass',
 *       expiresAt: new Date(Date.now() + 900000) // 15 minutes
 *     };
 *   }
 * }
 * ```
 */
export abstract class BaseAuthProvider implements AuthProvider {
  /** Cached credentials */
  protected credentials: ConnectionCredentials | null = null;

  /** Timestamp of last credential refresh */
  protected lastRefreshTime: Date | null = null;

  /**
   * Buffer time before expiration to trigger proactive refresh (in milliseconds).
   * Default: 3 minutes (180,000 ms)
   */
  protected readonly expirationBufferMs: number = 3 * 60 * 1000;

  /**
   * Gets the current credentials, refreshing if necessary.
   *
   * @returns Promise resolving to connection credentials
   * @throws {AuthenticationError} If credentials cannot be obtained
   */
  async getCredentials(): Promise<ConnectionCredentials> {
    if (this.credentials === null || this.isExpired()) {
      await this.refresh();
    }
    return this.credentials!;
  }

  /**
   * Refreshes the credentials by calling the implementation-specific method.
   *
   * @throws {AuthenticationError} If credentials cannot be refreshed
   */
  async refresh(): Promise<void> {
    const newCredentials = await this.refreshCredentials();
    this.updateCredentials(newCredentials);
  }

  /**
   * Checks if credentials are expired or need refresh.
   *
   * Credentials are considered expired if:
   * 1. No credentials are cached
   * 2. Credentials have an expiresAt timestamp and current time is within
   *    the expiration buffer window
   *
   * @returns true if credentials need refresh, false otherwise
   */
  isExpired(): boolean {
    if (this.credentials === null) {
      return true;
    }

    // Credentials without expiration time don't expire (e.g., static passwords)
    if (!this.credentials.expiresAt) {
      return false;
    }

    // Check if we're within the expiration buffer window
    const expirationWithBuffer = new Date(
      this.credentials.expiresAt.getTime() - this.expirationBufferMs
    );
    return new Date() >= expirationWithBuffer;
  }

  /**
   * Abstract method to fetch fresh credentials.
   *
   * Subclasses must implement this to provide authentication-specific logic.
   *
   * @returns Promise resolving to new connection credentials
   * @throws {AuthenticationError} If credentials cannot be fetched
   */
  protected abstract refreshCredentials(): Promise<ConnectionCredentials>;

  /**
   * Updates the cached credentials and refresh timestamp.
   *
   * @param credentials - New credentials to cache
   */
  protected updateCredentials(credentials: ConnectionCredentials): void {
    this.credentials = credentials;
    this.lastRefreshTime = new Date();
  }
}
