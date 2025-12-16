/**
 * Firestore Credentials Provider
 *
 * OAuth2 and service account authentication for Firestore.
 * Following the SPARC specification.
 */

import * as crypto from "crypto";
import * as fs from "fs/promises";

/**
 * Service account key structure.
 */
export interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

/**
 * GCP credentials type.
 */
export type AuthConfig =
  | { type: "service_account"; keyFile: string }
  | { type: "service_account_json"; key: ServiceAccountKey }
  | { type: "default_credentials" }
  | { type: "access_token"; token: string }
  | { type: "emulator" };

/**
 * Token response from OAuth2.
 */
export interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Cached access token.
 */
export interface CachedToken {
  token: string;
  expiresAt: Date;
}

/**
 * GCP authentication provider interface.
 */
export interface GcpAuthProvider {
  /**
   * Get a valid access token.
   */
  getAccessToken(): Promise<string>;

  /**
   * Force refresh the access token.
   */
  refreshToken(): Promise<void>;

  /**
   * Check if the current token is valid.
   */
  isTokenValid(): boolean;
}

/**
 * Create an auth provider from credentials configuration.
 *
 * @param config - The authentication configuration
 * @returns A configured auth provider
 *
 * @example
 * ```typescript
 * // Service account from file
 * const provider = await createAuthProvider({
 *   type: "service_account",
 *   keyFile: "/path/to/key.json"
 * });
 *
 * // Application default credentials
 * const provider = await createAuthProvider({
 *   type: "application_default"
 * });
 * ```
 */
export async function createAuthProvider(config: AuthConfig): Promise<GcpAuthProvider> {
  switch (config.type) {
    case "service_account": {
      const keyContent = await fs.readFile(config.keyFile, "utf-8");
      const key = JSON.parse(keyContent) as ServiceAccountKey;
      return new ServiceAccountAuthProvider(key);
    }

    case "service_account_json":
      return new ServiceAccountAuthProvider(config.key);

    case "default_credentials":
      return new DefaultCredentialsAuthProvider();

    case "access_token":
      return new AccessTokenAuthProvider(config.token);

    case "emulator":
      return new EmulatorAuthProvider();

    default:
      throw new Error(`Unknown credentials type: ${(config as AuthConfig).type}`);
  }
}

/**
 * Default credentials auth provider (Application Default Credentials).
 *
 * Attempts to find credentials in the following order:
 * 1. GOOGLE_APPLICATION_CREDENTIALS environment variable
 * 2. Well-known file locations (~/.config/gcloud/application_default_credentials.json)
 * 3. GCE/GKE metadata server
 *
 * @example
 * ```typescript
 * const provider = new DefaultCredentialsAuthProvider();
 * const token = await provider.getAccessToken();
 * ```
 */
export class DefaultCredentialsAuthProvider implements GcpAuthProvider {
  private innerProvider?: GcpAuthProvider;
  private initLock: Promise<void> | null = null;

  async getAccessToken(): Promise<string> {
    await this.ensureInitialized();
    return this.innerProvider!.getAccessToken();
  }

  async refreshToken(): Promise<void> {
    await this.ensureInitialized();
    return this.innerProvider!.refreshToken();
  }

  isTokenValid(): boolean {
    if (!this.innerProvider) {
      return false;
    }
    return this.innerProvider.isTokenValid();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.innerProvider) return;

    if (this.initLock) {
      await this.initLock;
      return;
    }

    this.initLock = this.initialize();
    await this.initLock;
    this.initLock = null;
  }

  private async initialize(): Promise<void> {
    // Try GOOGLE_APPLICATION_CREDENTIALS environment variable
    const credentialsFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credentialsFile) {
      try {
        const content = await fs.readFile(credentialsFile, "utf-8");
        const key = JSON.parse(content) as ServiceAccountKey;
        this.innerProvider = new ServiceAccountAuthProvider(key);
        return;
      } catch (error) {
        // Fall through to next method
      }
    }

    // Try well-known file locations
    const homeDir = process.env.HOME ?? process.env.USERPROFILE;
    if (homeDir) {
      const wellKnownPath = `${homeDir}/.config/gcloud/application_default_credentials.json`;
      try {
        const content = await fs.readFile(wellKnownPath, "utf-8");
        const creds = JSON.parse(content);

        if (creds.type === "service_account") {
          this.innerProvider = new ServiceAccountAuthProvider(creds);
          return;
        }

        // Handle user credentials (authorized_user type)
        if (creds.type === "authorized_user") {
          this.innerProvider = new UserCredentialsAuthProvider(creds);
          return;
        }
      } catch {
        // Fall through to next method
      }
    }

    // Try metadata server (for GCE/GKE)
    try {
      this.innerProvider = new MetadataServerAuthProvider();
      // Test if metadata server is available
      await this.innerProvider.getAccessToken();
      return;
    } catch {
      // Fall through
    }

    throw new Error(
      "Could not find application default credentials. Set GOOGLE_APPLICATION_CREDENTIALS or run 'gcloud auth application-default login'"
    );
  }
}

/**
 * Service account authentication provider.
 *
 * Uses a service account key to generate JWT tokens and exchange them for
 * access tokens via OAuth2.
 *
 * @example
 * ```typescript
 * const key = JSON.parse(await fs.readFile('key.json', 'utf-8'));
 * const provider = new ServiceAccountAuthProvider(key);
 * const token = await provider.getAccessToken();
 * ```
 */
export class ServiceAccountAuthProvider implements GcpAuthProvider {
  private serviceAccountKey: ServiceAccountKey;
  private cachedToken?: CachedToken;
  private tokenLock: Promise<void> | null = null;

  constructor(key: ServiceAccountKey) {
    this.serviceAccountKey = key;
  }

  async getAccessToken(): Promise<string> {
    // Check cached token
    if (this.cachedToken && !this.isTokenExpired(this.cachedToken)) {
      return this.cachedToken.token;
    }

    // Avoid concurrent token refreshes
    if (this.tokenLock) {
      await this.tokenLock;
      return this.cachedToken!.token;
    }

    this.tokenLock = this.performRefresh();
    try {
      await this.tokenLock;
      return this.cachedToken!.token;
    } finally {
      this.tokenLock = null;
    }
  }

  async refreshToken(): Promise<void> {
    this.cachedToken = undefined;
    await this.getAccessToken();
  }

  isTokenValid(): boolean {
    return this.cachedToken !== undefined && !this.isTokenExpired(this.cachedToken);
  }

  private async performRefresh(): Promise<void> {
    const jwt = this.createJwt();

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Token refresh failed: ${body}`);
    }

    const tokenResponse: TokenResponse = await response.json();

    // Cache token with 60 second buffer before expiry
    this.cachedToken = {
      token: tokenResponse.access_token,
      expiresAt: new Date(Date.now() + (tokenResponse.expires_in - 60) * 1000),
    };
  }

  private isTokenExpired(cached: CachedToken): boolean {
    return cached.expiresAt <= new Date();
  }

  private createJwt(): string {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 3600; // 1 hour

    const header = {
      alg: "RS256",
      typ: "JWT",
    };

    const claims = {
      iss: this.serviceAccountKey.client_email,
      sub: this.serviceAccountKey.client_email,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: exp,
      scope:
        "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/cloud-platform",
    };

    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const encodedClaims = this.base64UrlEncode(JSON.stringify(claims));
    const signatureInput = `${encodedHeader}.${encodedClaims}`;

    const signature = this.signRs256(signatureInput, this.serviceAccountKey.private_key);
    const encodedSignature = this.base64UrlEncode(signature);

    return `${signatureInput}.${encodedSignature}`;
  }

  private base64UrlEncode(data: string | Buffer): string {
    const buffer = typeof data === "string" ? Buffer.from(data) : data;
    return buffer.toString("base64url");
  }

  private signRs256(data: string, privateKey: string): Buffer {
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(data);
    return sign.sign(privateKey);
  }
}

/**
 * Access token authentication provider.
 *
 * Uses an explicit access token. Useful for testing or when the token
 * is obtained through other means.
 *
 * @example
 * ```typescript
 * const provider = new AccessTokenAuthProvider('ya29.a0AfH6...');
 * const token = await provider.getAccessToken();
 * ```
 */
export class AccessTokenAuthProvider implements GcpAuthProvider {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async getAccessToken(): Promise<string> {
    return this.token;
  }

  async refreshToken(): Promise<void> {
    // Cannot refresh static token
    return;
  }

  isTokenValid(): boolean {
    return this.token !== undefined && this.token.length > 0;
  }
}

/**
 * Emulator authentication provider.
 *
 * No authentication required when using the Firestore emulator.
 *
 * @example
 * ```typescript
 * const provider = new EmulatorAuthProvider();
 * const token = await provider.getAccessToken();
 * ```
 */
export class EmulatorAuthProvider implements GcpAuthProvider {
  async getAccessToken(): Promise<string> {
    return "emulator-token";
  }

  async refreshToken(): Promise<void> {
    // No-op for emulator
    return;
  }

  isTokenValid(): boolean {
    return true;
  }
}

/**
 * Metadata server authentication provider (for GCE/GKE).
 *
 * Fetches access tokens from the GCP metadata server available on
 * Compute Engine and Kubernetes Engine instances.
 *
 * @example
 * ```typescript
 * const provider = new MetadataServerAuthProvider();
 * const token = await provider.getAccessToken();
 * ```
 */
export class MetadataServerAuthProvider implements GcpAuthProvider {
  private cachedToken?: CachedToken;
  private tokenLock: Promise<void> | null = null;

  async getAccessToken(): Promise<string> {
    // Check cached token
    if (this.cachedToken && !this.isTokenExpired(this.cachedToken)) {
      return this.cachedToken.token;
    }

    // Avoid concurrent token refreshes
    if (this.tokenLock) {
      await this.tokenLock;
      return this.cachedToken!.token;
    }

    this.tokenLock = this.performRefresh();
    try {
      await this.tokenLock;
      return this.cachedToken!.token;
    } finally {
      this.tokenLock = null;
    }
  }

  async refreshToken(): Promise<void> {
    this.cachedToken = undefined;
    await this.getAccessToken();
  }

  isTokenValid(): boolean {
    return this.cachedToken !== undefined && !this.isTokenExpired(this.cachedToken);
  }

  private async performRefresh(): Promise<void> {
    const response = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      {
        headers: {
          "Metadata-Flavor": "Google",
        },
        signal: AbortSignal.timeout(5000), // Metadata server should respond quickly
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Metadata server token fetch failed: ${body}`);
    }

    const tokenResponse: TokenResponse = await response.json();

    // Cache token with 60 second buffer before expiry
    this.cachedToken = {
      token: tokenResponse.access_token,
      expiresAt: new Date(Date.now() + (tokenResponse.expires_in - 60) * 1000),
    };
  }

  private isTokenExpired(cached: CachedToken): boolean {
    return cached.expiresAt <= new Date();
  }
}

/**
 * User credentials auth provider (for gcloud auth).
 *
 * Uses user credentials obtained via `gcloud auth application-default login`.
 *
 * @example
 * ```typescript
 * const creds = {
 *   client_id: 'xxx.apps.googleusercontent.com',
 *   client_secret: 'xxx',
 *   refresh_token: 'xxx'
 * };
 * const provider = new UserCredentialsAuthProvider(creds);
 * const token = await provider.getAccessToken();
 * ```
 */
export class UserCredentialsAuthProvider implements GcpAuthProvider {
  private clientId: string;
  private clientSecret: string;
  private refreshTokenValue: string;
  private cachedToken?: CachedToken;
  private tokenLock: Promise<void> | null = null;

  constructor(credentials: { client_id: string; client_secret: string; refresh_token: string }) {
    this.clientId = credentials.client_id;
    this.clientSecret = credentials.client_secret;
    this.refreshTokenValue = credentials.refresh_token;
  }

  async getAccessToken(): Promise<string> {
    // Check cached token
    if (this.cachedToken && !this.isTokenExpired(this.cachedToken)) {
      return this.cachedToken.token;
    }

    // Avoid concurrent token refreshes
    if (this.tokenLock) {
      await this.tokenLock;
      return this.cachedToken!.token;
    }

    this.tokenLock = this.performRefresh();
    try {
      await this.tokenLock;
      return this.cachedToken!.token;
    } finally {
      this.tokenLock = null;
    }
  }

  async refreshToken(): Promise<void> {
    this.cachedToken = undefined;
    await this.getAccessToken();
  }

  isTokenValid(): boolean {
    return this.cachedToken !== undefined && !this.isTokenExpired(this.cachedToken);
  }

  private async performRefresh(): Promise<void> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshTokenValue,
      grant_type: "refresh_token",
    });

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(`Token refresh failed: ${responseBody}`);
    }

    const tokenResponse: TokenResponse = await response.json();

    // Cache token with 60 second buffer before expiry
    this.cachedToken = {
      token: tokenResponse.access_token,
      expiresAt: new Date(Date.now() + (tokenResponse.expires_in - 60) * 1000),
    };
  }

  private isTokenExpired(cached: CachedToken): boolean {
    return cached.expiresAt <= new Date();
  }
}
