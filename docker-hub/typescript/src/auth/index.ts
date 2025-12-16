/**
 * Authentication module for Docker Hub integration following SPARC specification.
 *
 * Docker Hub uses dual authentication:
 * 1. Hub API (hub.docker.com) - JWT Token authentication for user/repository management
 * 2. Registry API (registry-1.docker.io) - Bearer Token authentication for image operations
 *
 * @module auth
 */

// ============================================================================
// SecretString - Prevents accidental exposure in logs
// ============================================================================

/**
 * SecretString wrapper to prevent accidental logging of sensitive values.
 * The value is only accessible via the expose() method.
 */
export class SecretString {
  private readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  /**
   * Exposes the secret value. Use with caution.
   */
  expose(): string {
    return this.value;
  }

  /**
   * Returns a redacted string for logging.
   */
  toString(): string {
    return '***';
  }

  /**
   * Returns a redacted value for JSON serialization.
   */
  toJSON(): string {
    return '***';
  }
}

// ============================================================================
// Token Interfaces
// ============================================================================

/**
 * Hub API JWT token response from /v2/users/login.
 */
export interface HubJwtToken {
  /** JWT access token for Hub API */
  token: SecretString;
  /** Optional refresh token for token renewal */
  refreshToken?: SecretString;
  /** Token expiration time in seconds (relative) */
  expiresIn: number;
  /** Absolute expiration timestamp */
  expiresAt?: Date;
}

/**
 * Registry API Bearer token for image operations.
 * Tokens are scoped per repository and action.
 */
export interface RegistryToken {
  /** Bearer token for registry authentication */
  token: SecretString;
  /** Token expiration timestamp */
  expiresAt?: Date;
  /** Scope string (e.g., "repository:namespace/repo:pull,push") */
  scope: string;
  /** Issued at timestamp */
  issuedAt?: Date;
}

// ============================================================================
// Token Cache - Caches registry tokens by scope
// ============================================================================

/**
 * Cache entry for registry tokens.
 */
interface TokenCacheEntry {
  token: RegistryToken;
  insertedAt: number;
}

/**
 * Token cache for caching scoped registry tokens.
 * Registry tokens are short-lived and scoped to specific repositories and actions.
 */
export class TokenCache {
  private readonly cache: Map<string, TokenCacheEntry>;
  private readonly ttlMs: number;
  private readonly maxSize: number;

  /**
   * Creates a new token cache.
   *
   * @param ttlMs - Time-to-live in milliseconds (default: 5 minutes)
   * @param maxSize - Maximum cache size (default: 100)
   */
  constructor(ttlMs: number = 300000, maxSize: number = 100) {
    this.cache = new Map();
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }

  /**
   * Gets a token from cache if valid.
   *
   * @param scope - Token scope
   * @returns Token if valid, undefined otherwise
   */
  get(scope: string): RegistryToken | undefined {
    const entry = this.cache.get(scope);
    if (!entry) {
      return undefined;
    }

    const now = Date.now();

    // Check TTL expiration
    if (now - entry.insertedAt > this.ttlMs) {
      this.cache.delete(scope);
      return undefined;
    }

    // Check token expiration with 60 second buffer
    if (entry.token.expiresAt) {
      const expiresWithBuffer = new Date(entry.token.expiresAt.getTime() - 60000);
      if (expiresWithBuffer <= new Date(now)) {
        this.cache.delete(scope);
        return undefined;
      }
    }

    return entry.token;
  }

  /**
   * Sets a token in cache.
   *
   * @param scope - Token scope
   * @param token - Registry token
   */
  set(scope: string, token: RegistryToken): void {
    // Enforce max size by removing oldest entry
    if (this.cache.size >= this.maxSize && !this.cache.has(scope)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(scope, {
      token,
      insertedAt: Date.now(),
    });
  }

  /**
   * Invalidates a token for a specific scope.
   *
   * @param scope - Token scope to invalidate
   */
  delete(scope: string): void {
    this.cache.delete(scope);
  }

  /**
   * Clears all cached tokens.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Gets current cache size.
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Performs cleanup of expired tokens.
   */
  cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [scope, entry] of this.cache.entries()) {
      // Check TTL expiration
      if (now - entry.insertedAt > this.ttlMs) {
        toDelete.push(scope);
        continue;
      }

      // Check token expiration
      if (entry.token.expiresAt && entry.token.expiresAt <= new Date(now)) {
        toDelete.push(scope);
      }
    }

    for (const scope of toDelete) {
      this.cache.delete(scope);
    }
  }
}

// ============================================================================
// AuthManager - Main authentication manager
// ============================================================================

/**
 * Authentication credentials for Docker Hub.
 */
export interface DockerHubCredentials {
  /** Docker Hub username */
  username: string;
  /** Docker Hub password or personal access token */
  password: string;
}

/**
 * AuthManager configuration options.
 */
export interface AuthManagerOptions {
  /** Docker Hub credentials */
  credentials: DockerHubCredentials;
  /** Hub API base URL (default: https://hub.docker.com) */
  hubApiUrl?: string;
  /** Registry auth URL (default: https://auth.docker.io) */
  registryAuthUrl?: string;
  /** Token cache TTL in milliseconds (default: 5 minutes) */
  tokenCacheTtl?: number;
  /** Maximum cache size (default: 100) */
  tokenCacheMaxSize?: number;
}

/**
 * Authentication manager for Docker Hub.
 *
 * Manages both Hub API JWT tokens and Registry API Bearer tokens.
 * Implements automatic token refresh and caching for registry tokens.
 */
export class AuthManager {
  private readonly credentials: DockerHubCredentials;
  private readonly hubApiUrl: string;
  private readonly registryAuthUrl: string;
  private readonly tokenCache: TokenCache;

  private hubToken?: HubJwtToken;
  private hubTokenPromise?: Promise<HubJwtToken>;

  /**
   * Creates a new authentication manager.
   *
   * @param options - Configuration options
   */
  constructor(options: AuthManagerOptions) {
    this.credentials = options.credentials;
    this.hubApiUrl = options.hubApiUrl ?? 'https://hub.docker.com';
    this.registryAuthUrl = options.registryAuthUrl ?? 'https://auth.docker.io';
    this.tokenCache = new TokenCache(
      options.tokenCacheTtl ?? 300000,
      options.tokenCacheMaxSize ?? 100
    );
  }

  /**
   * Logs in to Docker Hub and obtains a JWT token.
   *
   * @returns Hub JWT token
   * @throws Error if login fails
   */
  async login(): Promise<HubJwtToken> {
    const loginUrl = `${this.hubApiUrl}/v2/users/login`;

    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: this.credentials.username,
        password: this.credentials.password,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `Docker Hub login failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = await response.json() as {
      token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const expiresIn = data.expires_in ?? 3600; // Default to 1 hour
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const hubToken: HubJwtToken = {
      token: new SecretString(data.token),
      refreshToken: data.refresh_token ? new SecretString(data.refresh_token) : undefined,
      expiresIn,
      expiresAt,
    };

    this.hubToken = hubToken;
    return hubToken;
  }

  /**
   * Ensures a valid Hub JWT token is available.
   * Returns cached token if valid, otherwise performs login.
   *
   * @returns Hub JWT token
   */
  async ensureHubToken(): Promise<SecretString> {
    // Check if we have a valid cached token
    if (this.hubToken) {
      const now = new Date();
      const expiresAt = this.hubToken.expiresAt;

      // Use token if it has at least 5 minutes remaining
      if (expiresAt) {
        const bufferMs = 5 * 60 * 1000;
        const expiresWithBuffer = new Date(expiresAt.getTime() - bufferMs);

        if (expiresWithBuffer > now) {
          return this.hubToken.token;
        }
      }
    }

    // Prevent concurrent login attempts
    if (this.hubTokenPromise) {
      const token = await this.hubTokenPromise;
      return token.token;
    }

    // Perform login
    this.hubTokenPromise = this.login();
    try {
      const token = await this.hubTokenPromise;
      return token.token;
    } finally {
      this.hubTokenPromise = undefined;
    }
  }

  /**
   * Gets a registry bearer token for the specified scope.
   * Returns cached token if available and valid.
   *
   * @param scope - Token scope (e.g., "repository:namespace/repo:pull,push")
   * @returns Registry bearer token
   * @throws Error if token request fails
   */
  async getRegistryToken(scope: string): Promise<RegistryToken> {
    // Check cache first
    const cachedToken = this.tokenCache.get(scope);
    if (cachedToken) {
      return cachedToken;
    }

    // Build token request URL
    const params = new URLSearchParams({
      service: 'registry.docker.io',
      scope,
    });
    const tokenUrl = `${this.registryAuthUrl}/token?${params.toString()}`;

    // Create Basic Auth header
    const authString = `${this.credentials.username}:${this.credentials.password}`;
    const authBase64 = Buffer.from(authString).toString('base64');

    const response = await fetch(tokenUrl, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${authBase64}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `Registry token request failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = await response.json() as {
      token: string;
      access_token?: string;
      expires_in?: number;
      issued_at?: string;
    };

    const tokenValue = data.token || data.access_token;
    if (!tokenValue) {
      throw new Error('Registry token response missing token field');
    }

    const expiresIn = data.expires_in ?? 300; // Default to 5 minutes
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const issuedAt = data.issued_at ? new Date(data.issued_at) : new Date();

    const registryToken: RegistryToken = {
      token: new SecretString(tokenValue),
      expiresAt,
      scope,
      issuedAt,
    };

    // Cache the token
    this.tokenCache.set(scope, registryToken);

    return registryToken;
  }

  /**
   * Builds a scope string for registry token requests.
   *
   * Format: repository:namespace/repo:action1,action2
   *
   * @param namespace - Repository namespace (username or organization)
   * @param repo - Repository name
   * @param actions - Array of actions (e.g., ["pull", "push"])
   * @returns Formatted scope string
   *
   * @example
   * buildScope("library", "nginx", ["pull"])
   * // Returns: "repository:library/nginx:pull"
   *
   * @example
   * buildScope("myuser", "myapp", ["pull", "push"])
   * // Returns: "repository:myuser/myapp:pull,push"
   */
  buildScope(namespace: string, repo: string, actions: string[]): string {
    const actionsStr = actions.join(',');
    return `repository:${namespace}/${repo}:${actionsStr}`;
  }

  /**
   * Invalidates a cached registry token for the specified scope.
   * Useful when a token is rejected by the registry.
   *
   * @param scope - Token scope to invalidate
   */
  invalidateToken(scope: string): void {
    this.tokenCache.delete(scope);
  }

  /**
   * Invalidates all cached registry tokens.
   */
  invalidateAllTokens(): void {
    this.tokenCache.clear();
  }

  /**
   * Invalidates the Hub JWT token, forcing re-login on next request.
   */
  invalidateHubToken(): void {
    this.hubToken = undefined;
  }

  /**
   * Gets the Hub API authorization header value.
   *
   * @returns Authorization header value (e.g., "JWT <token>")
   */
  async getHubAuthHeader(): Promise<string> {
    const token = await this.ensureHubToken();
    return `JWT ${token.expose()}`;
  }

  /**
   * Gets the Registry API authorization header value for a scope.
   *
   * @param scope - Token scope
   * @returns Authorization header value (e.g., "Bearer <token>")
   */
  async getRegistryAuthHeader(scope: string): Promise<string> {
    const token = await this.getRegistryToken(scope);
    return `Bearer ${token.token.expose()}`;
  }

  /**
   * Performs cleanup of expired tokens in cache.
   */
  cleanupCache(): void {
    this.tokenCache.cleanup();
  }

  /**
   * Gets current cache statistics.
   *
   * @returns Cache statistics object
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.tokenCache.size(),
      maxSize: 100, // This should match tokenCacheMaxSize from constructor
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates an AuthManager instance from credentials.
 *
 * @param username - Docker Hub username
 * @param password - Docker Hub password or personal access token
 * @param options - Optional configuration overrides
 * @returns AuthManager instance
 */
export function createAuthManager(
  username: string,
  password: string,
  options?: Partial<Omit<AuthManagerOptions, 'credentials'>>
): AuthManager {
  return new AuthManager({
    credentials: { username, password },
    ...options,
  });
}

/**
 * Creates an AuthManager instance from environment variables.
 *
 * Environment variables:
 * - DOCKER_USERNAME or DOCKERHUB_USERNAME: Docker Hub username (required)
 * - DOCKER_PASSWORD or DOCKERHUB_PASSWORD: Docker Hub password/token (required)
 * - DOCKER_HUB_API_URL: Hub API URL (optional)
 * - DOCKER_REGISTRY_AUTH_URL: Registry auth URL (optional)
 *
 * @returns AuthManager instance
 * @throws Error if required environment variables are missing
 */
export function createAuthManagerFromEnv(): AuthManager {
  const username = process.env.DOCKER_USERNAME ?? process.env.DOCKERHUB_USERNAME;
  const password = process.env.DOCKER_PASSWORD ?? process.env.DOCKERHUB_PASSWORD;

  if (!username) {
    throw new Error(
      'Docker Hub username not found in environment variables (DOCKER_USERNAME or DOCKERHUB_USERNAME)'
    );
  }

  if (!password) {
    throw new Error(
      'Docker Hub password not found in environment variables (DOCKER_PASSWORD or DOCKERHUB_PASSWORD)'
    );
  }

  return new AuthManager({
    credentials: { username, password },
    hubApiUrl: process.env.DOCKER_HUB_API_URL,
    registryAuthUrl: process.env.DOCKER_REGISTRY_AUTH_URL,
  });
}

// ============================================================================
// Exports
// ============================================================================

export default AuthManager;
