/**
 * Authentication mechanisms for GitLab API.
 * @module auth
 */

/**
 * Secret string wrapper to prevent accidental exposure in logs.
 *
 * This class wraps sensitive string values (like tokens and secrets) to prevent
 * them from being accidentally logged or serialized. The secret value can only
 * be accessed through the expose() method.
 */
export class SecretString {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  /**
   * Exposes the secret value.
   * Use with caution - avoid logging or displaying.
   *
   * @returns The raw secret value
   */
  expose(): string {
    return this.value;
  }

  /**
   * Returns a safe representation for logging.
   *
   * @returns A redacted string "[REDACTED]"
   */
  toString(): string {
    return '[REDACTED]';
  }

  /**
   * Custom JSON serialization to prevent accidental exposure.
   *
   * @returns A redacted string "[REDACTED]"
   */
  toJSON(): string {
    return '[REDACTED]';
  }
}

/**
 * Token provider interface for async credential resolution.
 *
 * This interface follows the async trait pattern and provides a common
 * abstraction for different authentication mechanisms.
 */
export interface TokenProvider {
  /**
   * Returns a valid access token (PAT or OAuth2).
   * For OAuth2 providers, this method should automatically refresh
   * the token if it has expired.
   *
   * @returns A promise that resolves to a valid access token
   * @throws Error if token cannot be obtained
   */
  getToken(): Promise<string>;

  /**
   * Invalidates the cached token, forcing a refresh on next getToken() call.
   * For PAT providers, this is typically a no-op.
   * For OAuth2 providers, this clears the cached access token.
   *
   * @returns A promise that resolves when the token is invalidated
   */
  invalidate(): Promise<void>;
}

/**
 * Personal Access Token (PAT) provider.
 *
 * This provider returns a static token that doesn't expire or refresh.
 * It's the simplest form of authentication for GitLab.
 */
export class PatTokenProvider implements TokenProvider {
  private readonly token: SecretString;

  /**
   * Creates a new PAT token provider.
   *
   * @param token - The personal access token
   */
  constructor(token: string) {
    this.token = new SecretString(token);
  }

  /**
   * Returns the PAT token directly.
   *
   * @returns The access token
   */
  async getToken(): Promise<string> {
    return this.token.expose();
  }

  /**
   * No-op for PAT tokens since they don't refresh.
   */
  async invalidate(): Promise<void> {
    // PAT tokens cannot be invalidated
  }
}

/**
 * OAuth2 token configuration.
 */
interface OAuth2Config {
  /** OAuth2 client ID */
  clientId: string;
  /** OAuth2 client secret */
  clientSecret: string;
  /** GitLab instance URL (default: https://gitlab.com) */
  gitlabUrl?: string;
  /** Initial access token (optional) */
  accessToken?: string;
  /** Initial refresh token (optional) */
  refreshToken?: string;
  /** Token expiration time (optional) */
  expiresAt?: Date;
  /** OAuth2 scopes (optional) */
  scopes?: string[];
}

/**
 * OAuth2 token response from GitLab.
 */
interface OAuth2TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  created_at?: number;
}

/**
 * OAuth2 token provider with automatic refresh.
 *
 * This provider manages OAuth2 access tokens and automatically refreshes
 * them when they expire. Tokens are cached in memory and refreshed using
 * the refresh token when needed.
 */
export class OAuth2TokenProvider implements TokenProvider {
  private readonly clientId: string;
  private readonly clientSecret: SecretString;
  private readonly gitlabUrl: string;
  private readonly scopes?: string[];

  private accessToken?: SecretString;
  private refreshToken?: SecretString;
  private expiresAt?: Date;

  /**
   * Creates a new OAuth2 token provider.
   *
   * @param config - OAuth2 configuration
   */
  constructor(config: OAuth2Config) {
    this.clientId = config.clientId;
    this.clientSecret = new SecretString(config.clientSecret);
    this.gitlabUrl = config.gitlabUrl || 'https://gitlab.com';
    this.scopes = config.scopes;

    if (config.accessToken) {
      this.accessToken = new SecretString(config.accessToken);
    }
    if (config.refreshToken) {
      this.refreshToken = new SecretString(config.refreshToken);
    }
    if (config.expiresAt) {
      this.expiresAt = config.expiresAt;
    }
  }

  /**
   * Gets a valid access token, refreshing if necessary.
   *
   * @returns A valid access token
   * @throws Error if token cannot be obtained or refreshed
   */
  async getToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.accessToken && this.isTokenValid()) {
      return this.accessToken.expose();
    }

    // Try to refresh the token
    if (this.refreshToken) {
      await this.refresh();
      if (this.accessToken) {
        return this.accessToken.expose();
      }
    }

    throw new Error('No valid access token available and cannot refresh');
  }

  /**
   * Invalidates the cached token, forcing a refresh on next getToken() call.
   */
  async invalidate(): Promise<void> {
    this.accessToken = undefined;
    this.expiresAt = undefined;
  }

  /**
   * Checks if the current token is still valid.
   * Tokens are considered invalid if they expire within the next 5 minutes.
   *
   * @returns True if the token is valid, false otherwise
   */
  private isTokenValid(): boolean {
    if (!this.expiresAt) {
      // If no expiration time, assume token is valid
      return true;
    }

    // Add 5 minute buffer to account for clock skew and request time
    const bufferMs = 5 * 60 * 1000;
    const now = new Date();
    const expiresWithBuffer = new Date(this.expiresAt.getTime() - bufferMs);

    return expiresWithBuffer > now;
  }

  /**
   * Refreshes the access token using the refresh token.
   *
   * @throws Error if refresh fails
   */
  private async refresh(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const tokenUrl = `${this.gitlabUrl}/oauth/token`;
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken.expose(),
      client_id: this.clientId,
      client_secret: this.clientSecret.expose(),
    });

    if (this.scopes && this.scopes.length > 0) {
      params.append('scope', this.scopes.join(' '));
    }

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = (await response.json()) as OAuth2TokenResponse;

      // Update tokens
      this.accessToken = new SecretString(data.access_token);
      if (data.refresh_token) {
        this.refreshToken = new SecretString(data.refresh_token);
      }

      // Calculate expiration time
      if (data.expires_in) {
        const expiresInMs = data.expires_in * 1000;
        this.expiresAt = new Date(Date.now() + expiresInMs);
      } else if (data.created_at && data.expires_in) {
        const createdAtMs = data.created_at * 1000;
        const expiresInMs = data.expires_in * 1000;
        this.expiresAt = new Date(createdAtMs + expiresInMs);
      }
    } catch (error) {
      // Clear tokens on error
      this.accessToken = undefined;
      this.expiresAt = undefined;

      if (error instanceof Error) {
        throw new Error(`Failed to refresh token: ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }
  }
}

/**
 * Environment variable token provider.
 *
 * This provider reads the token from an environment variable.
 * Useful for CI/CD environments and local development.
 */
export class EnvironmentTokenProvider implements TokenProvider {
  private readonly envVar: string;

  /**
   * Creates a new environment token provider.
   *
   * @param envVar - Environment variable name (default: GITLAB_TOKEN)
   */
  constructor(envVar: string = 'GITLAB_TOKEN') {
    this.envVar = envVar;
  }

  /**
   * Returns the token from the environment variable.
   *
   * @returns The access token
   * @throws Error if environment variable is not set
   */
  async getToken(): Promise<string> {
    const token = process.env[this.envVar];
    if (!token) {
      throw new Error(`Environment variable ${this.envVar} is not set`);
    }
    return token;
  }

  /**
   * No-op for environment tokens since they're read fresh each time.
   */
  async invalidate(): Promise<void> {
    // Environment variables are re-read each time
  }
}

/**
 * Personal Access Token authentication configuration.
 */
export interface PatAuth {
  type: 'pat';
  /** Personal access token */
  token: string;
}

/**
 * OAuth2 authentication configuration.
 */
export interface OAuth2Auth {
  type: 'oauth2';
  /** OAuth2 client ID */
  clientId: string;
  /** OAuth2 client secret */
  clientSecret: string;
  /** GitLab instance URL (optional, default: https://gitlab.com) */
  gitlabUrl?: string;
  /** Initial access token (optional) */
  accessToken?: string;
  /** Initial refresh token (optional) */
  refreshToken?: string;
  /** Token expiration time (optional) */
  expiresAt?: Date;
  /** OAuth2 scopes (optional) */
  scopes?: string[];
}

/**
 * Environment variable authentication configuration.
 */
export interface EnvironmentAuth {
  type: 'environment';
  /** Environment variable name (optional, default: GITLAB_TOKEN) */
  envVar?: string;
}

/**
 * GitLab authentication configuration union type.
 *
 * This type represents all possible authentication methods for GitLab.
 */
export type GitLabAuth = PatAuth | OAuth2Auth | EnvironmentAuth;

/**
 * Creates a token provider from GitLab authentication configuration.
 *
 * This factory function creates the appropriate TokenProvider implementation
 * based on the authentication configuration type.
 *
 * @param auth - GitLab authentication configuration
 * @returns A TokenProvider instance
 *
 * @example
 * ```typescript
 * // PAT authentication
 * const provider = createTokenProvider({
 *   type: 'pat',
 *   token: 'glpat-xxxxxxxxxxxxxxxxxxxx'
 * });
 *
 * // OAuth2 authentication
 * const provider = createTokenProvider({
 *   type: 'oauth2',
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   refreshToken: 'your-refresh-token'
 * });
 *
 * // Environment authentication
 * const provider = createTokenProvider({
 *   type: 'environment',
 *   envVar: 'GITLAB_TOKEN' // optional, this is the default
 * });
 * ```
 */
export function createTokenProvider(auth: GitLabAuth): TokenProvider {
  switch (auth.type) {
    case 'pat':
      return new PatTokenProvider(auth.token);

    case 'oauth2':
      return new OAuth2TokenProvider({
        clientId: auth.clientId,
        clientSecret: auth.clientSecret,
        gitlabUrl: auth.gitlabUrl,
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        expiresAt: auth.expiresAt,
        scopes: auth.scopes,
      });

    case 'environment':
      return new EnvironmentTokenProvider(auth.envVar);

    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = auth;
      throw new Error(`Unknown auth type: ${(_exhaustive as GitLabAuth).type}`);
  }
}

/**
 * Helper functions for creating GitLab authentication configurations.
 */
export namespace GitLabAuth {
  /**
   * Creates a PAT authentication configuration.
   *
   * @param token - Personal access token
   * @returns PAT authentication configuration
   */
  export function pat(token: string): PatAuth {
    return { type: 'pat', token };
  }

  /**
   * Creates an OAuth2 authentication configuration.
   *
   * @param config - OAuth2 configuration
   * @returns OAuth2 authentication configuration
   */
  export function oauth2(config: Omit<OAuth2Auth, 'type'>): OAuth2Auth {
    return { type: 'oauth2', ...config };
  }

  /**
   * Creates an environment variable authentication configuration.
   *
   * @param envVar - Environment variable name (default: GITLAB_TOKEN)
   * @returns Environment authentication configuration
   */
  export function environment(envVar?: string): EnvironmentAuth {
    return { type: 'environment', envVar };
  }
}
