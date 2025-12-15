/**
 * Azure Authentication Provider
 *
 * Handles API Key and Azure AD authentication for Azure OpenAI.
 */

import type { AuthMethod } from '../types/index.js';

/** Authentication header tuple */
export type AuthHeader = [string, string];

/** Authentication provider interface */
export interface AuthProvider {
  /** Get the authentication header for requests */
  getAuthHeader(): Promise<AuthHeader>;
  /** Refresh credentials if applicable */
  refresh?(): Promise<void>;
  /** Get the authentication method type */
  getMethod(): AuthMethod;
}

/**
 * API Key authentication provider
 */
export class ApiKeyAuthProvider implements AuthProvider {
  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new Error('API key is required');
    }
  }

  async getAuthHeader(): Promise<AuthHeader> {
    return ['api-key', this.apiKey];
  }

  getMethod(): AuthMethod {
    return 'api-key';
  }
}

/** Azure AD credentials */
export interface AzureAdCredentials {
  tenantId: string;
  clientId: string;
  clientSecret?: string;
  useManagedIdentity?: boolean;
}

/** Cached token with expiry */
interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Azure AD (Entra ID) authentication provider
 */
export class AzureAdAuthProvider implements AuthProvider {
  private readonly credentials: AzureAdCredentials;
  private cachedToken?: CachedToken;
  private readonly tokenBufferMs = 5 * 60 * 1000; // 5 minute buffer
  private readonly scope = 'https://cognitiveservices.azure.com/.default';

  constructor(credentials: AzureAdCredentials) {
    this.credentials = credentials;
  }

  async getAuthHeader(): Promise<AuthHeader> {
    const token = await this.getValidToken();
    return ['Authorization', `Bearer ${token}`];
  }

  async refresh(): Promise<void> {
    this.cachedToken = undefined;
    await this.getValidToken();
  }

  getMethod(): AuthMethod {
    return this.credentials.useManagedIdentity ? 'managed-identity' : 'azure-ad';
  }

  private async getValidToken(): Promise<string> {
    // Check if cached token is still valid
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - this.tokenBufferMs) {
      return this.cachedToken.accessToken;
    }

    // Acquire new token
    const token = await this.acquireToken();
    this.cachedToken = token;
    return token.accessToken;
  }

  private async acquireToken(): Promise<CachedToken> {
    if (this.credentials.useManagedIdentity) {
      return this.acquireTokenManagedIdentity();
    }
    return this.acquireTokenClientCredentials();
  }

  /**
   * Acquires token using client credentials (service principal)
   */
  private async acquireTokenClientCredentials(): Promise<CachedToken> {
    if (!this.credentials.clientSecret) {
      throw new Error('Client secret is required for service principal authentication');
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.credentials.tenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      scope: this.scope,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to acquire Azure AD token: ${response.status} ${error}`);
    }

    const data = await response.json() as {
      access_token: string;
      expires_in: number;
    };

    return {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  }

  /**
   * Acquires token using managed identity (IMDS)
   */
  private async acquireTokenManagedIdentity(): Promise<CachedToken> {
    const imdsUrl = new URL('http://169.254.169.254/metadata/identity/oauth2/token');
    imdsUrl.searchParams.set('api-version', '2019-08-01');
    imdsUrl.searchParams.set('resource', 'https://cognitiveservices.azure.com');

    if (this.credentials.clientId) {
      imdsUrl.searchParams.set('client_id', this.credentials.clientId);
    }

    const response = await fetch(imdsUrl.toString(), {
      method: 'GET',
      headers: {
        'Metadata': 'true',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to acquire managed identity token: ${response.status} ${error}`);
    }

    const data = await response.json() as {
      access_token: string;
      expires_on: string;
    };

    return {
      accessToken: data.access_token,
      expiresAt: parseInt(data.expires_on, 10) * 1000,
    };
  }
}

/**
 * Creates an auth provider based on configuration
 */
export function createAuthProvider(
  apiKey?: string,
  azureAdCredentials?: AzureAdCredentials
): AuthProvider {
  if (azureAdCredentials?.tenantId) {
    return new AzureAdAuthProvider(azureAdCredentials);
  }

  if (apiKey) {
    return new ApiKeyAuthProvider(apiKey);
  }

  throw new Error('Either API key or Azure AD credentials must be provided');
}
