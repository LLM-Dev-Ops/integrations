/**
 * GCP Credentials Provider for Pub/Sub
 *
 * OAuth2 and service account authentication.
 * Following the SPARC specification.
 */

import * as crypto from "crypto";
import * as fs from "fs/promises";
import { GcpCredentials, ServiceAccountKey } from "../config/index.js";
import { AuthenticationError } from "../error/index.js";
import { HttpTransport, FetchTransport } from "../transport/index.js";

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
  refreshToken(): Promise<string>;
}

/**
 * Create an auth provider from credentials configuration.
 */
export async function createAuthProvider(
  credentials: GcpCredentials,
  transport?: HttpTransport
): Promise<GcpAuthProvider> {
  const httpTransport = transport ?? new FetchTransport();

  switch (credentials.type) {
    case "service_account": {
      const keyContent = await fs.readFile(credentials.keyFile, "utf-8");
      const key = JSON.parse(keyContent) as ServiceAccountKey;
      return new ServiceAccountAuthProvider(key, httpTransport);
    }

    case "service_account_json":
      return new ServiceAccountAuthProvider(credentials.key, httpTransport);

    case "workload_identity":
      return new WorkloadIdentityAuthProvider(httpTransport);

    case "application_default":
      return new ApplicationDefaultAuthProvider(httpTransport);

    case "access_token":
      return new StaticTokenAuthProvider(credentials.token);

    case "none":
      return new NoAuthProvider();

    default:
      throw new AuthenticationError(
        `Unknown credentials type: ${(credentials as GcpCredentials).type}`,
        "InvalidCredentials"
      );
  }
}

/**
 * No-op auth provider (for emulator).
 */
export class NoAuthProvider implements GcpAuthProvider {
  async getAccessToken(): Promise<string> {
    return "";
  }

  async refreshToken(): Promise<string> {
    return "";
  }
}

/**
 * Static token provider (for testing).
 */
export class StaticTokenAuthProvider implements GcpAuthProvider {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async getAccessToken(): Promise<string> {
    return this.token;
  }

  async refreshToken(): Promise<string> {
    return this.token;
  }
}

/**
 * Service account authentication provider.
 */
export class ServiceAccountAuthProvider implements GcpAuthProvider {
  private serviceAccountKey: ServiceAccountKey;
  private transport: HttpTransport;
  private cachedToken?: CachedToken;
  private tokenLock: Promise<string> | null = null;

  constructor(key: ServiceAccountKey, transport: HttpTransport) {
    this.serviceAccountKey = key;
    this.transport = transport;
  }

  async getAccessToken(): Promise<string> {
    // Check cached token
    if (this.cachedToken && !this.isTokenExpired(this.cachedToken)) {
      return this.cachedToken.token;
    }

    // Avoid concurrent token refreshes
    if (this.tokenLock) {
      return this.tokenLock;
    }

    this.tokenLock = this.refreshToken();
    try {
      return await this.tokenLock;
    } finally {
      this.tokenLock = null;
    }
  }

  async refreshToken(): Promise<string> {
    const jwt = this.createJwt();

    const response = await this.transport.send({
      method: "POST",
      url: "https://oauth2.googleapis.com/token",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (response.status !== 200) {
      throw new AuthenticationError(
        `Token refresh failed: ${response.body.toString()}`,
        "TokenRefreshFailed"
      );
    }

    const tokenResponse: TokenResponse = JSON.parse(response.body.toString());

    // Cache token with 60 second buffer before expiry
    this.cachedToken = {
      token: tokenResponse.access_token,
      expiresAt: new Date(Date.now() + (tokenResponse.expires_in - 60) * 1000),
    };

    return this.cachedToken.token;
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
      scope: "https://www.googleapis.com/auth/pubsub",
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
 * Workload identity authentication provider (for GKE).
 */
export class WorkloadIdentityAuthProvider implements GcpAuthProvider {
  private transport: HttpTransport;
  private cachedToken?: CachedToken;
  private tokenLock: Promise<string> | null = null;

  constructor(transport: HttpTransport) {
    this.transport = transport;
  }

  async getAccessToken(): Promise<string> {
    // Check cached token
    if (this.cachedToken && !this.isTokenExpired(this.cachedToken)) {
      return this.cachedToken.token;
    }

    // Avoid concurrent token refreshes
    if (this.tokenLock) {
      return this.tokenLock;
    }

    this.tokenLock = this.refreshToken();
    try {
      return await this.tokenLock;
    } finally {
      this.tokenLock = null;
    }
  }

  async refreshToken(): Promise<string> {
    const response = await this.transport.send({
      method: "GET",
      url: "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      headers: {
        "Metadata-Flavor": "Google",
      },
      timeout: 5000, // Metadata server should respond quickly
    });

    if (response.status !== 200) {
      throw new AuthenticationError(
        `Workload identity token fetch failed: ${response.body.toString()}`,
        "TokenRefreshFailed"
      );
    }

    const tokenResponse: TokenResponse = JSON.parse(response.body.toString());

    // Cache token with 60 second buffer before expiry
    this.cachedToken = {
      token: tokenResponse.access_token,
      expiresAt: new Date(Date.now() + (tokenResponse.expires_in - 60) * 1000),
    };

    return this.cachedToken.token;
  }

  private isTokenExpired(cached: CachedToken): boolean {
    return cached.expiresAt <= new Date();
  }
}

/**
 * Application default credentials provider.
 */
export class ApplicationDefaultAuthProvider implements GcpAuthProvider {
  private transport: HttpTransport;
  private innerProvider?: GcpAuthProvider;
  private initLock: Promise<void> | null = null;

  constructor(transport: HttpTransport) {
    this.transport = transport;
  }

  async getAccessToken(): Promise<string> {
    await this.ensureInitialized();
    return this.innerProvider!.getAccessToken();
  }

  async refreshToken(): Promise<string> {
    await this.ensureInitialized();
    return this.innerProvider!.refreshToken();
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
    const credentialsFile = process.env["GOOGLE_APPLICATION_CREDENTIALS"];
    if (credentialsFile) {
      try {
        const content = await fs.readFile(credentialsFile, "utf-8");
        const key = JSON.parse(content) as ServiceAccountKey;
        this.innerProvider = new ServiceAccountAuthProvider(key, this.transport);
        return;
      } catch {
        // Fall through to next method
      }
    }

    // Try well-known file locations
    const homeDir = process.env["HOME"] ?? process.env["USERPROFILE"];
    if (homeDir) {
      const wellKnownPath = `${homeDir}/.config/gcloud/application_default_credentials.json`;
      try {
        const content = await fs.readFile(wellKnownPath, "utf-8");
        const creds = JSON.parse(content);

        if (creds.type === "service_account") {
          this.innerProvider = new ServiceAccountAuthProvider(creds, this.transport);
          return;
        }

        // Handle user credentials (authorized_user type)
        if (creds.type === "authorized_user") {
          this.innerProvider = new UserCredentialsAuthProvider(creds, this.transport);
          return;
        }
      } catch {
        // Fall through to next method
      }
    }

    // Try metadata server (for GCE/GKE)
    try {
      this.innerProvider = new WorkloadIdentityAuthProvider(this.transport);
      // Test if metadata server is available
      await this.innerProvider.getAccessToken();
      return;
    } catch {
      // Fall through
    }

    throw new AuthenticationError(
      "Could not find application default credentials. Set GOOGLE_APPLICATION_CREDENTIALS or run 'gcloud auth application-default login'",
      "InvalidCredentials"
    );
  }
}

/**
 * User credentials auth provider (for gcloud auth).
 */
export class UserCredentialsAuthProvider implements GcpAuthProvider {
  private clientId: string;
  private clientSecret: string;
  private refreshTokenValue: string;
  private transport: HttpTransport;
  private cachedToken?: CachedToken;
  private tokenLock: Promise<string> | null = null;

  constructor(
    credentials: { client_id: string; client_secret: string; refresh_token: string },
    transport: HttpTransport
  ) {
    this.clientId = credentials.client_id;
    this.clientSecret = credentials.client_secret;
    this.refreshTokenValue = credentials.refresh_token;
    this.transport = transport;
  }

  async getAccessToken(): Promise<string> {
    // Check cached token
    if (this.cachedToken && !this.isTokenExpired(this.cachedToken)) {
      return this.cachedToken.token;
    }

    // Avoid concurrent token refreshes
    if (this.tokenLock) {
      return this.tokenLock;
    }

    this.tokenLock = this.refreshToken();
    try {
      return await this.tokenLock;
    } finally {
      this.tokenLock = null;
    }
  }

  async refreshToken(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshTokenValue,
      grant_type: "refresh_token",
    });

    const response = await this.transport.send({
      method: "POST",
      url: "https://oauth2.googleapis.com/token",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (response.status !== 200) {
      throw new AuthenticationError(
        `Token refresh failed: ${response.body.toString()}`,
        "TokenRefreshFailed"
      );
    }

    const tokenResponse: TokenResponse = JSON.parse(response.body.toString());

    // Cache token with 60 second buffer before expiry
    this.cachedToken = {
      token: tokenResponse.access_token,
      expiresAt: new Date(Date.now() + (tokenResponse.expires_in - 60) * 1000),
    };

    return this.cachedToken.token;
  }

  private isTokenExpired(cached: CachedToken): boolean {
    return cached.expiresAt <= new Date();
  }
}
