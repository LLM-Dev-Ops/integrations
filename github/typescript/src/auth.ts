/**
 * Authentication mechanisms for GitHub API.
 * @module auth
 */

import * as jose from 'jose';
import { GitHubError, GitHubErrorKind } from './errors.js';

/**
 * Secret string wrapper to prevent accidental exposure.
 */
export class SecretString {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  /**
   * Exposes the secret value.
   * Use with caution - avoid logging or displaying.
   */
  expose(): string {
    return this.value;
  }

  /**
   * Returns a safe representation for logging.
   */
  toString(): string {
    return '***';
  }

  /**
   * Custom JSON serialization to prevent accidental exposure.
   */
  toJSON(): string {
    return '***';
  }
}

/**
 * OAuth token with optional refresh.
 */
export interface OAuthToken {
  /** Access token. */
  accessToken: SecretString;
  /** Refresh token. */
  refreshToken?: SecretString;
  /** Token expiration time. */
  expiresAt?: Date;
}

/**
 * GitHub App authentication configuration.
 */
export interface AppAuth {
  /** GitHub App ID. */
  appId: number;
  /** Private key (PEM format). */
  privateKey: SecretString;
  /** Installation ID (optional, for installation token). */
  installationId?: number;
}

/**
 * Helper to create AppAuth with installation ID.
 */
export function createAppAuth(
  appId: number,
  privateKey: string,
  installationId?: number
): AppAuth {
  return {
    appId,
    privateKey: new SecretString(privateKey),
    installationId,
  };
}

/**
 * Authentication method for GitHub API.
 */
export type AuthMethod =
  | { type: 'pat'; token: SecretString }
  | { type: 'oauth'; token: OAuthToken }
  | { type: 'app'; auth: AppAuth }
  | { type: 'actions'; token: SecretString };

/**
 * Authentication method factory functions.
 */
export namespace AuthMethod {
  /**
   * Creates a PAT authentication method.
   */
  export function pat(token: string): AuthMethod {
    return { type: 'pat', token: new SecretString(token) };
  }

  /**
   * Creates an OAuth authentication method.
   */
  export function oauth(token: string, options?: {
    refreshToken?: string;
    expiresAt?: Date;
  }): AuthMethod {
    return {
      type: 'oauth',
      token: {
        accessToken: new SecretString(token),
        refreshToken: options?.refreshToken
          ? new SecretString(options.refreshToken)
          : undefined,
        expiresAt: options?.expiresAt,
      },
    };
  }

  /**
   * Creates a GitHub Actions token authentication method.
   */
  export function actions(token: string): AuthMethod {
    return { type: 'actions', token: new SecretString(token) };
  }

  /**
   * Creates a GitHub App authentication method.
   */
  export function app(
    appId: number,
    privateKey: string,
    installationId?: number
  ): AuthMethod {
    return {
      type: 'app',
      auth: createAppAuth(appId, privateKey, installationId),
    };
  }

  /**
   * Gets the token prefix for logging.
   */
  export function tokenPrefix(method: AuthMethod): string {
    switch (method.type) {
      case 'pat': {
        const exposed = method.token.expose();
        if (exposed.startsWith('ghp_')) {
          return 'ghp_***';
        } else if (exposed.startsWith('github_pat_')) {
          return 'github_pat_***';
        }
        return '***';
      }
      case 'oauth':
        return 'gho_***';
      case 'actions':
        return 'ghs_***';
      case 'app':
        return 'app_jwt';
    }
  }
}

/**
 * JWT claims for GitHub App authentication.
 */
interface JwtClaims extends Record<string, unknown> {
  /** Issued at (Unix timestamp). */
  iat: number;
  /** Expiration (Unix timestamp). */
  exp: number;
  /** Issuer (App ID). */
  iss: string;
}

/**
 * Installation token response.
 */
export interface InstallationToken {
  /** Access token. */
  token: string;
  /** Expiration time. */
  expiresAt: Date;
  /** Permissions granted. */
  permissions: Record<string, string>;
  /** Repository selection. */
  repositorySelection?: string;
}

/**
 * Cached installation token.
 */
interface CachedToken {
  token: SecretString;
  expiresAt: Date;
}

/**
 * Authentication manager for handling token refresh and caching.
 */
export class AuthManager {
  private readonly method: AuthMethod;
  private cachedInstallationToken?: CachedToken;

  constructor(method: AuthMethod) {
    this.method = method;
  }

  /**
   * Gets the authentication method.
   */
  getMethod(): AuthMethod {
    return this.method;
  }

  /**
   * Generates the Authorization header value.
   */
  async getAuthHeader(): Promise<string> {
    switch (this.method.type) {
      case 'pat':
        return `Bearer ${this.method.token.expose()}`;

      case 'oauth':
        return `Bearer ${this.method.token.accessToken.expose()}`;

      case 'actions':
        return `Bearer ${this.method.token.expose()}`;

      case 'app':
        if (this.method.auth.installationId !== undefined) {
          // For installation tokens, check cache first
          const cached = this.getCachedInstallationToken();
          if (cached) {
            return `Bearer ${cached.expose()}`;
          }
        }
        // Generate JWT for app-level auth
        const jwt = await this.generateJwt(this.method.auth);
        return `Bearer ${jwt}`;
    }
  }

  /**
   * Generates a JWT for GitHub App authentication.
   */
  private async generateJwt(app: AppAuth): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    // Issued at: 60 seconds in the past for clock drift tolerance
    const iat = now - 60;
    // Expires in 9 minutes (max allowed is 10)
    const exp = now + 9 * 60;

    const payload: JwtClaims = {
      iat,
      exp,
      iss: app.appId.toString(),
    };

    try {
      // Parse the private key
      const privateKey = await jose.importPKCS8(
        app.privateKey.expose(),
        'RS256'
      );

      // Sign the JWT
      const jwt = await new jose.SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
        .setIssuedAt(iat)
        .setExpirationTime(exp)
        .setIssuer(app.appId.toString())
        .sign(privateKey);

      return jwt;
    } catch (error) {
      if (error instanceof Error) {
        throw new GitHubError(
          GitHubErrorKind.InvalidAppCredentials,
          `Failed to generate JWT: ${error.message}`,
          { cause: error }
        );
      }
      throw new GitHubError(
        GitHubErrorKind.AppAuthenticationFailed,
        'Failed to generate JWT'
      );
    }
  }

  /**
   * Gets cached installation token if valid.
   */
  private getCachedInstallationToken(): SecretString | undefined {
    if (!this.cachedInstallationToken) {
      return undefined;
    }

    // Check if token is still valid (5 minute buffer)
    const bufferMs = 5 * 60 * 1000;
    const now = new Date();
    const expiresWithBuffer = new Date(
      this.cachedInstallationToken.expiresAt.getTime() - bufferMs
    );

    if (expiresWithBuffer > now) {
      return this.cachedInstallationToken.token;
    }

    return undefined;
  }

  /**
   * Caches an installation token.
   */
  cacheInstallationToken(token: string, expiresAt: Date): void {
    this.cachedInstallationToken = {
      token: new SecretString(token),
      expiresAt,
    };
  }

  /**
   * Clears the installation token cache.
   */
  clearCache(): void {
    this.cachedInstallationToken = undefined;
  }

  /**
   * Returns true if authentication requires an installation token.
   */
  requiresInstallationToken(): boolean {
    return (
      this.method.type === 'app' &&
      this.method.auth.installationId !== undefined
    );
  }

  /**
   * Gets the installation ID if applicable.
   */
  installationId(): number | undefined {
    if (this.method.type === 'app') {
      return this.method.auth.installationId;
    }
    return undefined;
  }
}

/**
 * Credential provider interface for dynamic credential resolution.
 */
export interface CredentialProvider {
  /**
   * Gets the current authentication method.
   */
  getAuth(): Promise<AuthMethod>;

  /**
   * Refreshes credentials if needed.
   */
  refresh(): Promise<void>;

  /**
   * Checks if credentials are valid.
   */
  isValid(): Promise<boolean>;
}

/**
 * Static credential provider using fixed credentials.
 */
export class StaticCredentialProvider implements CredentialProvider {
  private readonly method: AuthMethod;

  constructor(method: AuthMethod) {
    this.method = method;
  }

  async getAuth(): Promise<AuthMethod> {
    return this.method;
  }

  async refresh(): Promise<void> {
    // Static credentials cannot be refreshed
  }

  async isValid(): Promise<boolean> {
    return true;
  }
}

/**
 * Environment variable credential provider.
 */
export class EnvCredentialProvider implements CredentialProvider {
  private readonly tokenVar: string;

  /**
   * Creates a provider from GITHUB_TOKEN environment variable.
   */
  static fromGitHubToken(): EnvCredentialProvider {
    return new EnvCredentialProvider('GITHUB_TOKEN');
  }

  /**
   * Creates a provider from a custom environment variable.
   */
  constructor(varName: string) {
    this.tokenVar = varName;
  }

  async getAuth(): Promise<AuthMethod> {
    const token = process.env[this.tokenVar];
    if (!token) {
      throw new GitHubError(
        GitHubErrorKind.MissingAuth,
        `Environment variable ${this.tokenVar} not set`
      );
    }
    return AuthMethod.pat(token);
  }

  async refresh(): Promise<void> {
    // Environment variables are re-read each time
  }

  async isValid(): Promise<boolean> {
    return process.env[this.tokenVar] !== undefined;
  }
}
