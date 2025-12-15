/**
 * Azure Blob Storage Authentication Provider
 *
 * Handles authentication for Azure Blob Storage including:
 * - Storage Account Key
 * - Azure AD (Entra ID)
 * - Managed Identity
 * - SAS Tokens
 */

/** Authentication method types */
export type AuthMethod = 'storage-key' | 'azure-ad' | 'managed-identity' | 'sas-token' | 'connection-string';

/** Authentication header tuple [headerName, headerValue] */
export type AuthHeader = [string, string];

/** Authentication provider interface */
export interface AuthProvider {
  /** Get the authentication header for requests */
  getAuthHeader(): Promise<AuthHeader>;
  /** Get authorization header for specific URL (for SAS) */
  getAuthUrl?(url: string): Promise<string>;
  /** Refresh credentials if applicable */
  refresh?(): Promise<void>;
  /** Get the authentication method type */
  getMethod(): AuthMethod;
}

/**
 * Storage Account Key authentication provider
 */
export class StorageKeyAuthProvider implements AuthProvider {
  private readonly accountName: string;
  private readonly accountKey: string;

  constructor(accountName: string, accountKey: string) {
    if (!accountName) {
      throw new Error('Account name is required');
    }
    if (!accountKey) {
      throw new Error('Account key is required');
    }
    this.accountName = accountName;
    this.accountKey = accountKey;
  }

  async getAuthHeader(): Promise<AuthHeader> {
    // For SharedKey auth, we need to compute the signature
    // This is a simplified version - full implementation would compute HMAC-SHA256
    // In production, you'd use the Azure SDK or compute the full signature
    const signature = await this.computeSignature();
    return ['Authorization', `SharedKey ${this.accountName}:${signature}`];
  }

  getMethod(): AuthMethod {
    return 'storage-key';
  }

  private async computeSignature(): Promise<string> {
    // Simplified - actual implementation requires HMAC-SHA256 of canonical request
    // This would need the full request details (method, headers, URL, etc.)
    return this.accountKey;
  }

  /** Get account name */
  getAccountName(): string {
    return this.accountName;
  }

  /** Get account key for signature computation */
  getAccountKey(): string {
    return this.accountKey;
  }
}

/** Azure AD credentials configuration */
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
 * Azure AD (Entra ID) authentication provider for Blob Storage
 */
export class AzureAdAuthProvider implements AuthProvider {
  private readonly credentials: AzureAdCredentials;
  private cachedToken?: CachedToken;
  private readonly tokenBufferMs = 5 * 60 * 1000; // 5 minute buffer
  private readonly scope = 'https://storage.azure.com/.default';

  constructor(credentials: AzureAdCredentials) {
    if (!credentials.tenantId && !credentials.useManagedIdentity) {
      throw new Error('Tenant ID is required for Azure AD authentication');
    }
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

    const data = (await response.json()) as {
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
    imdsUrl.searchParams.set('resource', 'https://storage.azure.com');

    if (this.credentials.clientId) {
      imdsUrl.searchParams.set('client_id', this.credentials.clientId);
    }

    const response = await fetch(imdsUrl.toString(), {
      method: 'GET',
      headers: {
        Metadata: 'true',
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to acquire managed identity token: ${response.status} ${error}`);
    }

    const data = (await response.json()) as {
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
 * SAS Token authentication provider
 */
export class SasTokenAuthProvider implements AuthProvider {
  private readonly sasToken: string;

  constructor(sasToken: string) {
    if (!sasToken) {
      throw new Error('SAS token is required');
    }
    // Remove leading ? if present
    this.sasToken = sasToken.startsWith('?') ? sasToken.slice(1) : sasToken;
  }

  async getAuthHeader(): Promise<AuthHeader> {
    // SAS tokens don't use headers, they're appended to URLs
    return ['', ''];
  }

  async getAuthUrl(url: string): Promise<string> {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${this.sasToken}`;
  }

  getMethod(): AuthMethod {
    return 'sas-token';
  }

  /** Get the SAS token */
  getSasToken(): string {
    return this.sasToken;
  }
}

/**
 * Connection string authentication provider
 * Parses connection string and creates appropriate auth provider
 */
export class ConnectionStringAuthProvider implements AuthProvider {
  private readonly innerProvider: AuthProvider;
  private readonly accountName: string;
  private readonly endpoint?: string;

  constructor(connectionString: string) {
    const parsed = this.parseConnectionString(connectionString);

    if (parsed.sasToken) {
      this.innerProvider = new SasTokenAuthProvider(parsed.sasToken);
    } else if (parsed.accountKey) {
      this.innerProvider = new StorageKeyAuthProvider(parsed.accountName, parsed.accountKey);
    } else {
      throw new Error('Connection string must contain AccountKey or SharedAccessSignature');
    }

    this.accountName = parsed.accountName;
    this.endpoint = parsed.blobEndpoint;
  }

  async getAuthHeader(): Promise<AuthHeader> {
    return this.innerProvider.getAuthHeader();
  }

  async getAuthUrl(url: string): Promise<string> {
    if (this.innerProvider.getAuthUrl) {
      return this.innerProvider.getAuthUrl(url);
    }
    return url;
  }

  getMethod(): AuthMethod {
    return 'connection-string';
  }

  /** Get account name */
  getAccountName(): string {
    return this.accountName;
  }

  /** Get blob endpoint if specified */
  getBlobEndpoint(): string | undefined {
    return this.endpoint;
  }

  private parseConnectionString(connectionString: string): {
    accountName: string;
    accountKey?: string;
    sasToken?: string;
    blobEndpoint?: string;
  } {
    const parts: Record<string, string> = {};

    for (const part of connectionString.split(';')) {
      const [key, ...valueParts] = part.split('=');
      if (key && valueParts.length > 0) {
        parts[key.trim()] = valueParts.join('=').trim();
      }
    }

    const accountName = parts['AccountName'];
    if (!accountName) {
      throw new Error('Connection string must contain AccountName');
    }

    return {
      accountName,
      accountKey: parts['AccountKey'],
      sasToken: parts['SharedAccessSignature'],
      blobEndpoint: parts['BlobEndpoint'],
    };
  }
}

/**
 * Creates an auth provider based on configuration
 */
export function createAuthProvider(options: {
  connectionString?: string;
  accountName?: string;
  accountKey?: string;
  sasToken?: string;
  azureAdCredentials?: AzureAdCredentials;
}): AuthProvider {
  // Connection string takes precedence
  if (options.connectionString) {
    return new ConnectionStringAuthProvider(options.connectionString);
  }

  // Azure AD / Managed Identity
  if (options.azureAdCredentials) {
    return new AzureAdAuthProvider(options.azureAdCredentials);
  }

  // SAS Token
  if (options.sasToken) {
    return new SasTokenAuthProvider(options.sasToken);
  }

  // Storage Account Key
  if (options.accountName && options.accountKey) {
    return new StorageKeyAuthProvider(options.accountName, options.accountKey);
  }

  throw new Error(
    'Authentication configuration required: provide connectionString, sasToken, accountName+accountKey, or azureAdCredentials'
  );
}
