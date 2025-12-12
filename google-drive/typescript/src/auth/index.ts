/**
 * Authentication module for Google Drive integration.
 *
 * Provides OAuth 2.0 and Service Account authentication.
 */

import * as jose from "jose";
import { createAuthenticationError, AuthenticationErrorType } from "../errors";

/**
 * Access token with metadata.
 */
export interface AccessToken {
  /** The access token */
  token: string;

  /** Token type (usually "Bearer") */
  tokenType: string;

  /** Expiration time */
  expiresAt: Date;

  /** Scopes granted */
  scopes: string[];
}

/**
 * Authentication provider interface.
 */
export interface AuthProvider {
  /**
   * Get an access token for API requests.
   */
  getAccessToken(): Promise<AccessToken>;

  /**
   * Force refresh the access token.
   */
  refreshToken(): Promise<AccessToken>;

  /**
   * Check if the current token is expired.
   */
  isExpired(): boolean;
}

/**
 * OAuth 2.0 credentials.
 */
export interface OAuth2Credentials {
  /** Client ID */
  clientId: string;

  /** Client secret */
  clientSecret: string;

  /** Refresh token */
  refreshToken: string;

  /** Optional access token */
  accessToken?: string;

  /** Optional token expiration */
  expiresAt?: Date;

  /** Token endpoint (default: Google's token endpoint) */
  tokenEndpoint?: string;
}

/**
 * Service account credentials.
 */
export interface ServiceAccountCredentials {
  /** Service account email */
  clientEmail: string;

  /** Private key in PEM format */
  privateKey: string;

  /** Optional private key ID */
  privateKeyId?: string;

  /** Optional project ID */
  projectId?: string;

  /** Required scopes */
  scopes: string[];

  /** Optional subject for domain-wide delegation */
  subject?: string;

  /** Token endpoint (default: Google's token endpoint) */
  tokenEndpoint?: string;
}

/**
 * OAuth 2.0 token response.
 */
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  refresh_token?: string;
}

/**
 * Default Google OAuth 2.0 token endpoint.
 */
const DEFAULT_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * Default Google token audience for service accounts.
 */
const DEFAULT_TOKEN_AUDIENCE = "https://oauth2.googleapis.com/token";

/**
 * OAuth 2.0 authentication provider.
 */
export class OAuth2Provider implements AuthProvider {
  private credentials: OAuth2Credentials;
  private cachedToken?: AccessToken;
  private tokenEndpoint: string;

  constructor(credentials: OAuth2Credentials) {
    this.credentials = credentials;
    this.tokenEndpoint = credentials.tokenEndpoint ?? DEFAULT_TOKEN_ENDPOINT;

    // Initialize with provided token if available
    if (credentials.accessToken && credentials.expiresAt) {
      this.cachedToken = {
        token: credentials.accessToken,
        tokenType: "Bearer",
        expiresAt: credentials.expiresAt,
        scopes: [],
      };
    }
  }

  async getAccessToken(): Promise<AccessToken> {
    // Return cached token if valid
    if (this.cachedToken && !this.isExpired()) {
      return this.cachedToken;
    }

    // Refresh token
    return this.refreshToken();
  }

  async refreshToken(): Promise<AccessToken> {
    try {
      const params = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        refresh_token: this.credentials.refreshToken,
      });

      const response = await fetch(this.tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const error = await response.text();
        throw createAuthenticationError(
          AuthenticationErrorType.RefreshFailed,
          `Failed to refresh token: ${response.statusText}`,
          { status: response.status, error }
        );
      }

      const data = await response.json() as TokenResponse;

      // Calculate expiration time (with 60s buffer)
      const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);

      const token: AccessToken = {
        token: data.access_token,
        tokenType: data.token_type,
        expiresAt,
        scopes: data.scope ? data.scope.split(" ") : [],
      };

      this.cachedToken = token;
      return token;
    } catch (error) {
      if (error instanceof Error && error.name === "GoogleDriveError") {
        throw error;
      }
      throw createAuthenticationError(
        AuthenticationErrorType.RefreshFailed,
        `Token refresh failed: ${error instanceof Error ? error.message : String(error)}`,
        { originalError: error }
      );
    }
  }

  isExpired(): boolean {
    if (!this.cachedToken) {
      return true;
    }
    // Add 60s buffer to avoid edge cases
    return Date.now() >= this.cachedToken.expiresAt.getTime() - 60000;
  }
}

/**
 * Service account authentication provider.
 */
export class ServiceAccountProvider implements AuthProvider {
  private credentials: ServiceAccountCredentials;
  private cachedToken?: AccessToken;
  private tokenEndpoint: string;

  constructor(credentials: ServiceAccountCredentials) {
    this.credentials = credentials;
    this.tokenEndpoint = credentials.tokenEndpoint ?? DEFAULT_TOKEN_ENDPOINT;
  }

  async getAccessToken(): Promise<AccessToken> {
    // Return cached token if valid
    if (this.cachedToken && !this.isExpired()) {
      return this.cachedToken;
    }

    // Generate new token
    return this.refreshToken();
  }

  async refreshToken(): Promise<AccessToken> {
    try {
      // Generate JWT assertion
      const assertion = await this.generateJwtAssertion();

      // Exchange JWT for access token
      const params = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      });

      const response = await fetch(this.tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const error = await response.text();
        throw createAuthenticationError(
          AuthenticationErrorType.RefreshFailed,
          `Failed to exchange JWT for token: ${response.statusText}`,
          { status: response.status, error }
        );
      }

      const data = await response.json() as TokenResponse;

      // Calculate expiration time (with 60s buffer)
      const expiresAt = new Date(Date.now() + (data.expires_in - 60) * 1000);

      const token: AccessToken = {
        token: data.access_token,
        tokenType: data.token_type,
        expiresAt,
        scopes: this.credentials.scopes,
      };

      this.cachedToken = token;
      return token;
    } catch (error) {
      if (error instanceof Error && error.name === "GoogleDriveError") {
        throw error;
      }
      throw createAuthenticationError(
        AuthenticationErrorType.RefreshFailed,
        `Service account authentication failed: ${error instanceof Error ? error.message : String(error)}`,
        { originalError: error }
      );
    }
  }

  isExpired(): boolean {
    if (!this.cachedToken) {
      return true;
    }
    // Add 60s buffer to avoid edge cases
    return Date.now() >= this.cachedToken.expiresAt.getTime() - 60000;
  }

  /**
   * Generate JWT assertion for service account authentication.
   */
  private async generateJwtAssertion(): Promise<string> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const exp = now + 3600; // 1 hour expiration

      // Import private key
      const privateKey = await jose.importPKCS8(
        this.credentials.privateKey,
        "RS256"
      );

      // Create JWT payload
      const payload = {
        iss: this.credentials.clientEmail,
        sub: this.credentials.subject ?? this.credentials.clientEmail,
        aud: DEFAULT_TOKEN_AUDIENCE,
        scope: this.credentials.scopes.join(" "),
        iat: now,
        exp,
      };

      // Sign JWT
      const header: jose.JWTHeaderParameters = {
        alg: "RS256",
        typ: "JWT",
      };
      if (this.credentials.privateKeyId) {
        header.kid = this.credentials.privateKeyId;
      }

      const jwt = await new jose.SignJWT(payload)
        .setProtectedHeader(header)
        .setIssuedAt(now)
        .setExpirationTime(exp)
        .sign(privateKey);

      return jwt;
    } catch (error) {
      throw createAuthenticationError(
        AuthenticationErrorType.InvalidGrant,
        `Failed to generate JWT assertion: ${error instanceof Error ? error.message : String(error)}`,
        { originalError: error }
      );
    }
  }
}

/**
 * Create OAuth2 provider from credentials.
 *
 * @param credentials - OAuth2 credentials
 * @returns OAuth2Provider instance
 */
export function createOAuth2Provider(credentials: OAuth2Credentials): OAuth2Provider {
  return new OAuth2Provider(credentials);
}

/**
 * Create service account provider from credentials.
 *
 * @param credentials - Service account credentials
 * @returns ServiceAccountProvider instance
 */
export function createServiceAccountProvider(
  credentials: ServiceAccountCredentials
): ServiceAccountProvider {
  return new ServiceAccountProvider(credentials);
}

/**
 * Load service account credentials from a JSON key file object.
 *
 * @param keyFile - Parsed JSON key file
 * @param scopes - Required scopes
 * @param subject - Optional subject for domain-wide delegation
 * @returns Service account credentials
 */
export function loadServiceAccountFromKeyFile(
  keyFile: {
    type?: string;
    project_id?: string;
    private_key_id?: string;
    private_key?: string;
    client_email?: string;
    client_id?: string;
    auth_uri?: string;
    token_uri?: string;
  },
  scopes: string[],
  subject?: string
): ServiceAccountCredentials {
  if (keyFile.type !== "service_account") {
    throw createAuthenticationError(
      AuthenticationErrorType.InvalidCredentials,
      "Invalid key file: type must be 'service_account'"
    );
  }

  if (!keyFile.client_email) {
    throw createAuthenticationError(
      AuthenticationErrorType.InvalidCredentials,
      "Invalid key file: missing client_email"
    );
  }

  if (!keyFile.private_key) {
    throw createAuthenticationError(
      AuthenticationErrorType.InvalidCredentials,
      "Invalid key file: missing private_key"
    );
  }

  const credentials: ServiceAccountCredentials = {
    clientEmail: keyFile.client_email,
    privateKey: keyFile.private_key,
    scopes,
  };

  if (keyFile.private_key_id) {
    credentials.privateKeyId = keyFile.private_key_id;
  }
  if (keyFile.project_id) {
    credentials.projectId = keyFile.project_id;
  }
  if (subject) {
    credentials.subject = subject;
  }
  if (keyFile.token_uri) {
    credentials.tokenEndpoint = keyFile.token_uri;
  }

  return credentials;
}
