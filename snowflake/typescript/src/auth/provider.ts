/**
 * Credential Provider Interfaces
 *
 * Defines the credential provider interface and base implementations for Snowflake authentication.
 * @module @llmdevops/snowflake-integration/auth/provider
 */

// ============================================================================
// Credentials Type
// ============================================================================

/**
 * Snowflake credentials returned by providers.
 */
export interface Credentials {
  /** Authentication method type */
  method: 'password' | 'keypair' | 'oauth';
  /** Username (for password and keypair auth) */
  username?: string;
  /** Password (for password auth) */
  password?: string;
  /** JWT token (for keypair auth) */
  token?: string;
  /** OAuth token (for OAuth auth) */
  accessToken?: string;
  /** Token type (e.g., 'Bearer') */
  tokenType?: string;
  /** Token expiration time */
  expiresAt?: Date;
  /** Refresh token (for OAuth) */
  refreshToken?: string;
}

// ============================================================================
// Credential Provider Interface
// ============================================================================

/**
 * Interface for credential providers.
 * All authentication methods must implement this interface.
 */
export interface CredentialProvider {
  /**
   * Gets the current credentials.
   * This may trigger a refresh if credentials are expired.
   *
   * @returns Promise resolving to current credentials
   * @throws {AuthenticationError} If credentials cannot be obtained
   */
  getCredentials(): Promise<Credentials>;

  /**
   * Refreshes the credentials.
   * Forces a credential refresh regardless of expiration status.
   *
   * @returns Promise resolving to refreshed credentials
   * @throws {AuthenticationError} If credentials cannot be refreshed
   */
  refreshCredentials(): Promise<Credentials>;

  /**
   * Checks if the current credentials are expired.
   *
   * @returns true if credentials are expired, false otherwise
   */
  isExpired(): boolean;
}

// ============================================================================
// Base Credential Provider
// ============================================================================

/**
 * Base class for credential providers with common functionality.
 */
export abstract class BaseCredentialProvider implements CredentialProvider {
  protected credentials: Credentials | null = null;
  protected lastRefreshTime: Date | null = null;

  /**
   * Gets the current credentials.
   * Automatically refreshes if expired.
   */
  async getCredentials(): Promise<Credentials> {
    if (this.credentials === null || this.isExpired()) {
      await this.refreshCredentials();
    }
    return this.credentials!;
  }

  /**
   * Abstract method to refresh credentials.
   * Must be implemented by subclasses.
   */
  abstract refreshCredentials(): Promise<Credentials>;

  /**
   * Checks if credentials are expired.
   * Default implementation checks the expiresAt timestamp with a 5-minute buffer.
   */
  isExpired(): boolean {
    if (this.credentials === null) {
      return true;
    }

    if (!this.credentials.expiresAt) {
      // No expiration time means credentials don't expire (e.g., password auth)
      return false;
    }

    // Add 5-minute buffer before expiration
    const bufferMs = 5 * 60 * 1000;
    const expirationWithBuffer = new Date(this.credentials.expiresAt.getTime() - bufferMs);
    return new Date() >= expirationWithBuffer;
  }

  /**
   * Updates the stored credentials.
   */
  protected updateCredentials(credentials: Credentials): void {
    this.credentials = credentials;
    this.lastRefreshTime = new Date();
  }
}
