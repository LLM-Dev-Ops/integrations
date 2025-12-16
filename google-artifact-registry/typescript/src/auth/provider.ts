/**
 * GCP authentication provider for Artifact Registry.
 * @module auth/provider
 */

import { GoogleAuth, OAuth2Client, type AuthClient } from 'google-auth-library';
import { SecretString } from './secret.js';
import { ArtifactRegistryError, ArtifactRegistryErrorKind } from '../errors.js';
import type { AuthMethod } from '../config.js';

/**
 * OAuth2 token response.
 */
export interface TokenResponse {
  /** Access token */
  accessToken: string;
  /** Token expiration time */
  expiresAt: Date;
  /** Token type (usually "Bearer") */
  tokenType: string;
}

/**
 * Cached token with expiration.
 */
export interface CachedToken {
  /** Access token (wrapped) */
  token: SecretString;
  /** Expiration time */
  expiresAt: Date;
}

/**
 * OAuth2 scopes required for Artifact Registry operations.
 */
const ARTIFACT_REGISTRY_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
];

/**
 * Refresh threshold - refresh token when 20% of TTL remains.
 */
const REFRESH_THRESHOLD = 0.2;

/**
 * GCP authentication provider supporting multiple auth methods.
 */
export class GcpAuthProvider {
  private readonly authMethod: AuthMethod;
  private readonly projectId: string;
  private googleAuth?: GoogleAuth<AuthClient>;
  private cachedToken?: CachedToken;
  private refreshPromise?: Promise<CachedToken>;

  constructor(authMethod: AuthMethod, projectId: string) {
    this.authMethod = authMethod;
    this.projectId = projectId;
  }

  /**
   * Gets an access token for API calls.
   * Handles caching and automatic refresh.
   */
  async getToken(): Promise<string> {
    // Fast path: check if cached token is still valid
    if (this.cachedToken && !this.shouldRefresh(this.cachedToken)) {
      return this.cachedToken.token.expose();
    }

    // Prevent thundering herd - only one refresh at a time
    if (this.refreshPromise) {
      const cached = await this.refreshPromise;
      return cached.token.expose();
    }

    // Refresh token
    this.refreshPromise = this.refreshToken();
    try {
      const cached = await this.refreshPromise;
      return cached.token.expose();
    } finally {
      this.refreshPromise = undefined;
    }
  }

  /**
   * Refreshes the access token.
   */
  private async refreshToken(): Promise<CachedToken> {
    try {
      const response = await this.fetchToken();
      const cached: CachedToken = {
        token: new SecretString(response.accessToken),
        expiresAt: response.expiresAt,
      };
      this.cachedToken = cached;
      return cached;
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  /**
   * Fetches a new token based on the auth method.
   */
  private async fetchToken(): Promise<TokenResponse> {
    switch (this.authMethod.type) {
      case 'service_account':
        return this.fetchServiceAccountToken();
      case 'workload_identity':
        return this.fetchWorkloadIdentityToken();
      case 'adc':
        return this.fetchAdcToken();
      case 'access_token':
        // For explicit access tokens, we don't know the expiry
        // Set a reasonable expiry and let it refresh on error
        return {
          accessToken: this.authMethod.token,
          expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour
          tokenType: 'Bearer',
        };
    }
  }

  /**
   * Fetches token using service account credentials.
   */
  private async fetchServiceAccountToken(): Promise<TokenResponse> {
    const auth = await this.getOrCreateAuth();
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();

    if (!tokenResponse.token) {
      throw new ArtifactRegistryError(
        ArtifactRegistryErrorKind.TokenRefreshFailed,
        'Failed to obtain access token from service account'
      );
    }

    // Get expiry from the client if available
    let expiresAt = new Date(Date.now() + 3600 * 1000); // Default 1 hour
    if (client instanceof OAuth2Client) {
      const credentials = client.credentials;
      if (credentials.expiry_date) {
        expiresAt = new Date(credentials.expiry_date);
      }
    }

    return {
      accessToken: tokenResponse.token,
      expiresAt,
      tokenType: 'Bearer',
    };
  }

  /**
   * Fetches token using workload identity (GKE metadata server).
   */
  private async fetchWorkloadIdentityToken(): Promise<TokenResponse> {
    const auth = await this.getOrCreateAuth();
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();

    if (!tokenResponse.token) {
      throw new ArtifactRegistryError(
        ArtifactRegistryErrorKind.TokenRefreshFailed,
        'Failed to obtain access token from workload identity'
      );
    }

    let expiresAt = new Date(Date.now() + 3600 * 1000);
    if (client instanceof OAuth2Client && client.credentials.expiry_date) {
      expiresAt = new Date(client.credentials.expiry_date);
    }

    return {
      accessToken: tokenResponse.token,
      expiresAt,
      tokenType: 'Bearer',
    };
  }

  /**
   * Fetches token using Application Default Credentials.
   */
  private async fetchAdcToken(): Promise<TokenResponse> {
    const auth = await this.getOrCreateAuth();
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();

    if (!tokenResponse.token) {
      throw new ArtifactRegistryError(
        ArtifactRegistryErrorKind.TokenRefreshFailed,
        'Failed to obtain access token from ADC'
      );
    }

    let expiresAt = new Date(Date.now() + 3600 * 1000);
    if (client instanceof OAuth2Client && client.credentials.expiry_date) {
      expiresAt = new Date(client.credentials.expiry_date);
    }

    return {
      accessToken: tokenResponse.token,
      expiresAt,
      tokenType: 'Bearer',
    };
  }

  /**
   * Gets or creates the GoogleAuth instance.
   */
  private async getOrCreateAuth(): Promise<GoogleAuth<AuthClient>> {
    if (this.googleAuth) {
      return this.googleAuth;
    }

    const options: ConstructorParameters<typeof GoogleAuth>[0] = {
      scopes: ARTIFACT_REGISTRY_SCOPES,
      projectId: this.projectId,
    };

    if (this.authMethod.type === 'service_account') {
      if (this.authMethod.keyPath) {
        options.keyFile = this.authMethod.keyPath;
      } else if (this.authMethod.keyJson) {
        try {
          options.credentials = JSON.parse(this.authMethod.keyJson);
        } catch {
          throw new ArtifactRegistryError(
            ArtifactRegistryErrorKind.ServiceAccountInvalid,
            'Invalid service account key JSON'
          );
        }
      }
    }

    this.googleAuth = new GoogleAuth(options);
    return this.googleAuth;
  }

  /**
   * Checks if the token should be refreshed.
   */
  private shouldRefresh(cached: CachedToken): boolean {
    const now = Date.now();
    const expiresAt = cached.expiresAt.getTime();
    const totalTtl = expiresAt - (now - 3600 * 1000); // Approximate original TTL
    const remaining = expiresAt - now;

    // Refresh when less than REFRESH_THRESHOLD of TTL remains
    return remaining < totalTtl * REFRESH_THRESHOLD;
  }

  /**
   * Wraps errors in ArtifactRegistryError.
   */
  private wrapError(error: unknown): ArtifactRegistryError {
    if (error instanceof ArtifactRegistryError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);

    // Check for common error patterns
    if (message.includes('Could not load the default credentials')) {
      return new ArtifactRegistryError(
        ArtifactRegistryErrorKind.CredentialsNotFound,
        'GCP credentials not found. Set GOOGLE_APPLICATION_CREDENTIALS or configure authentication.',
        { cause: error instanceof Error ? error : undefined }
      );
    }

    if (message.includes('invalid_grant') || message.includes('Token has been expired')) {
      return new ArtifactRegistryError(
        ArtifactRegistryErrorKind.TokenExpired,
        'Token has expired or been revoked',
        { cause: error instanceof Error ? error : undefined }
      );
    }

    return new ArtifactRegistryError(
      ArtifactRegistryErrorKind.TokenRefreshFailed,
      `Failed to refresh token: ${message}`,
      { cause: error instanceof Error ? error : undefined }
    );
  }

  /**
   * Clears the token cache, forcing a refresh on next request.
   */
  clearCache(): void {
    this.cachedToken = undefined;
    this.refreshPromise = undefined;
  }

  /**
   * Gets the project ID.
   */
  getProjectId(): string {
    return this.projectId;
  }

  /**
   * Gets the authentication method type.
   */
  getAuthMethodType(): AuthMethod['type'] {
    return this.authMethod.type;
  }
}
