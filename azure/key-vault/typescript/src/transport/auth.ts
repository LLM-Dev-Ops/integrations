// Token scope for Key Vault
export const KEY_VAULT_SCOPE = 'https://vault.azure.net/.default';

export interface KeyVaultCredential {
  getToken(scope: string): Promise<{ token: string; expiresOn: Date }>;
}

// Simple credential that uses environment variables
export class EnvironmentCredential implements KeyVaultCredential {
  private tenantId: string;
  private clientId: string;
  private clientSecret: string;

  constructor() {
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error(
        'Missing required environment variables: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET'
      );
    }

    this.tenantId = tenantId;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  async getToken(scope: string): Promise<{ token: string; expiresOn: Date }> {
    const tokenEndpoint = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope,
      grant_type: 'client_credentials',
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to acquire token: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = await response.json() as { access_token: string; expires_in?: number };

    // Calculate expiration time
    const expiresIn = data.expires_in ?? 3600; // Default to 1 hour if not provided
    const expiresOn = new Date(Date.now() + expiresIn * 1000);

    return {
      token: data.access_token,
      expiresOn,
    };
  }
}

// Credential that uses a static token (for testing)
export class StaticTokenCredential implements KeyVaultCredential {
  private token: string;
  private expiresOn: Date;

  constructor(token: string, expiresOn?: Date) {
    this.token = token;
    // Default to 1 hour from now if not provided
    this.expiresOn = expiresOn || new Date(Date.now() + 3600 * 1000);
  }

  async getToken(_scope: string): Promise<{ token: string; expiresOn: Date }> {
    return {
      token: this.token,
      expiresOn: this.expiresOn,
    };
  }
}

// Create credential from environment
export function createDefaultCredential(): KeyVaultCredential {
  return new EnvironmentCredential();
}
