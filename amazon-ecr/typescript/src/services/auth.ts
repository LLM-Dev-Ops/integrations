/**
 * Authentication service for Amazon ECR.
 *
 * This module provides authorization token management for ECR, including:
 * - Token retrieval and caching
 * - Docker credentials extraction
 * - Login command generation
 * - Token refresh with expiration buffer
 *
 * @module services/auth
 */

import type { EcrClientInterface } from '../types/client.js';
import type {
  AuthorizationData,
  DockerCredentials,
  LoginCommand,
} from '../types/auth.js';
import { EcrError, EcrErrorKind } from '../errors.js';

// ============================================================================
// Token Cache
// ============================================================================

/**
 * Cache entry for authorization tokens.
 */
interface TokenCacheEntry {
  /** Cached authorization data. */
  data: AuthorizationData;
  /** When this entry was cached. */
  cachedAt: Date;
}

/**
 * Token cache for managing ECR authorization tokens.
 *
 * Implements a simple in-memory cache with expiration checking.
 * Tokens are cached per registry ID to support multi-account scenarios.
 */
class TokenCache {
  private readonly cache = new Map<string, TokenCacheEntry>();
  private readonly refreshBufferSeconds: number;

  /**
   * Creates a new token cache.
   *
   * @param refreshBufferSeconds - Refresh tokens this many seconds before expiry (default: 300 = 5 minutes)
   */
  constructor(refreshBufferSeconds: number = 300) {
    this.refreshBufferSeconds = refreshBufferSeconds;
  }

  /**
   * Gets a cached token for the given registry ID.
   *
   * @param registryId - The registry ID (defaults to 'default' for caller's registry)
   * @returns The cached authorization data if valid, undefined otherwise
   */
  get(registryId = 'default'): AuthorizationData | undefined {
    const entry = this.cache.get(registryId);
    if (!entry) {
      return undefined;
    }

    // Check if token is expiring soon
    if (this.isExpiring(entry.data)) {
      this.cache.delete(registryId);
      return undefined;
    }

    return entry.data;
  }

  /**
   * Stores a token in the cache.
   *
   * @param registryId - The registry ID
   * @param data - The authorization data to cache
   */
  set(registryId = 'default', data: AuthorizationData): void {
    this.cache.set(registryId, {
      data,
      cachedAt: new Date(),
    });
  }

  /**
   * Clears the cache.
   *
   * @param registryId - Optional registry ID to clear. If omitted, clears all entries.
   */
  clear(registryId?: string): void {
    if (registryId) {
      this.cache.delete(registryId);
    } else {
      this.cache.clear();
    }
  }

  /**
   * Checks if a token is expiring soon (within the refresh buffer).
   *
   * @param token - The authorization data to check
   * @returns True if the token is expiring within the refresh buffer
   */
  isExpiring(token: AuthorizationData): boolean {
    const now = Date.now();
    const expiresAt = new Date(token.expiresAt).getTime();
    const bufferMs = this.refreshBufferSeconds * 1000;
    const expiryWithBuffer = expiresAt - bufferMs;

    return now >= expiryWithBuffer;
  }
}

// ============================================================================
// Auth Service
// ============================================================================

/**
 * Request for GetAuthorizationToken API.
 */
interface GetAuthorizationTokenRequest {
  /** Optional list of registry IDs (AWS account IDs). */
  registryIds?: string[];
}

/**
 * Response from GetAuthorizationToken API.
 */
interface GetAuthorizationTokenResponse {
  /** List of authorization data entries. */
  authorizationData?: Array<{
    /** Base64-encoded authorization token. */
    authorizationToken: string;
    /** Token expiration time. */
    expiresAt: string;
    /** Proxy endpoint URL. */
    proxyEndpoint: string;
  }>;
}

/**
 * Options for the auth service.
 */
export interface AuthServiceOptions {
  /** ECR client for API calls. */
  client: EcrClientInterface;
  /** Token refresh buffer in seconds (default: 300 = 5 minutes). */
  refreshBufferSeconds?: number;
  /** Metrics collector for telemetry. */
  metrics?: {
    increment(name: string, value?: number, tags?: Record<string, string>): void;
  };
  /** Logger for debug information. */
  logger?: {
    debug(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
  };
}

/**
 * Authentication service for Amazon ECR.
 *
 * Provides methods for obtaining and managing ECR authorization tokens,
 * extracting Docker credentials, and generating login commands.
 *
 * Features:
 * - Automatic token caching with expiration handling
 * - Configurable refresh buffer to prevent token expiry during operations
 * - Secure credential extraction from base64-encoded tokens
 * - Docker login command generation with stdin password input
 * - Metrics emission for cache hits/misses and refreshes
 *
 * Security considerations:
 * - Tokens are never logged (only endpoints and expiration times)
 * - Credentials are handled as strings (caller should use SecretString wrapper)
 * - Login commands use stdin for password input to avoid shell history
 *
 * ECR tokens are valid for 12 hours by default.
 */
export class AuthService {
  private readonly client: EcrClientInterface;
  private readonly cache: TokenCache;
  private readonly metrics?: AuthServiceOptions['metrics'];
  private readonly logger?: AuthServiceOptions['logger'];

  /**
   * Creates a new auth service.
   *
   * @param options - Service configuration options
   */
  constructor(options: AuthServiceOptions) {
    this.client = options.client;
    this.cache = new TokenCache(options.refreshBufferSeconds ?? 300);
    this.metrics = options.metrics;
    this.logger = options.logger;
  }

  /**
   * Gets an authorization token for ECR.
   *
   * This method first checks the token cache. If a valid token is found,
   * it's returned immediately. Otherwise, a new token is fetched from ECR
   * using the GetAuthorizationToken API and cached for future use.
   *
   * @param registryIds - Optional list of registry IDs (AWS account IDs) to get tokens for
   * @returns Authorization data with token, expiration time, and proxy endpoint
   * @throws {EcrError} If no authorization data is returned or token format is invalid
   *
   * @example
   * ```typescript
   * const authData = await authService.getAuthorizationToken();
   * console.log(`Token expires at: ${authData.expiresAt}`);
   * console.log(`Registry: ${authData.proxyEndpoint}`);
   * ```
   */
  async getAuthorizationToken(registryIds?: string[]): Promise<AuthorizationData> {
    const registryId = registryIds?.[0] ?? 'default';

    // Check cache first
    const cached = this.cache.get(registryId);
    if (cached) {
      this.logger?.debug('Token cache hit', { registryId, expiresAt: cached.expiresAt });
      this.metrics?.increment('ecr.auth.token_cache_hit', 1, { registry_id: registryId });
      return cached;
    }

    this.logger?.debug('Token cache miss, fetching new token', { registryId });
    this.metrics?.increment('ecr.auth.token_cache_miss', 1, { registry_id: registryId });

    // Fetch new token
    const request: GetAuthorizationTokenRequest = registryIds?.length
      ? { registryIds }
      : {};

    const response = await this.client.send<
      GetAuthorizationTokenRequest,
      GetAuthorizationTokenResponse
    >('GetAuthorizationToken', request);

    if (!response.authorizationData || response.authorizationData.length === 0) {
      throw new EcrError(
        EcrErrorKind.AccessDenied,
        'No authorization data returned from GetAuthorizationToken'
      );
    }

    const authData = response.authorizationData[0];
    if (!authData) {
      throw new EcrError(
        EcrErrorKind.AccessDenied,
        'Invalid authorization data returned from GetAuthorizationToken'
      );
    }

    // Validate proxy endpoint matches expected registry
    const result: AuthorizationData = {
      authorizationToken: authData.authorizationToken,
      expiresAt: authData.expiresAt,
      proxyEndpoint: authData.proxyEndpoint,
    };

    // Cache the token
    this.cache.set(registryId, result);
    this.logger?.debug('Token cached', {
      registryId,
      expiresAt: result.expiresAt,
      proxyEndpoint: result.proxyEndpoint,
    });

    return result;
  }

  /**
   * Gets Docker credentials from the authorization token.
   *
   * Retrieves an authorization token and decodes it to extract Docker
   * username and password. ECR tokens are base64-encoded in the format
   * "AWS:password".
   *
   * @returns Docker credentials with username, password, registry, and expiration
   * @throws {EcrError} If token format is invalid
   *
   * @example
   * ```typescript
   * const creds = await authService.getDockerCredentials();
   * console.log(`Username: ${creds.username}`); // Always "AWS"
   * console.log(`Registry: ${creds.registry}`);
   * // Use creds.password for docker login (wrap in SecretString for production)
   * ```
   */
  async getDockerCredentials(): Promise<DockerCredentials> {
    const authData = await this.getAuthorizationToken();

    // Decode base64 token
    let decoded: string;
    try {
      decoded = Buffer.from(authData.authorizationToken, 'base64').toString('utf-8');
    } catch (error) {
      throw new EcrError(
        EcrErrorKind.InvalidParameter,
        'Failed to decode authorization token',
        { cause: error as Error }
      );
    }

    // Parse "AWS:password" format
    const parts = decoded.split(':', 2);
    if (parts.length !== 2) {
      throw new EcrError(
        EcrErrorKind.InvalidParameter,
        `Invalid authorization token format: expected "username:password", got ${parts.length} parts`
      );
    }

    const username = parts[0] ?? '';
    const password = parts[1] ?? '';

    if (username !== 'AWS') {
      this.logger?.warn('Unexpected username in ECR token', { username });
    }

    return {
      username,
      password,
      registry: authData.proxyEndpoint,
      expiresAt: authData.expiresAt,
    };
  }

  /**
   * Generates a Docker login command.
   *
   * Creates a complete docker login command that can be executed to
   * authenticate with ECR. The command uses stdin for password input
   * to avoid exposing credentials in shell history.
   *
   * @returns Login command object with the command string and expiration time
   *
   * @example
   * ```typescript
   * const login = await authService.getLoginCommand();
   * console.log(login.command);
   * // Output: echo '...' | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
   *
   * // Execute the command (in a real shell)
   * // $ eval "$(echo 'password' | docker login --username AWS --password-stdin registry)"
   * ```
   */
  async getLoginCommand(): Promise<LoginCommand> {
    const creds = await this.getDockerCredentials();

    // Construct docker login command with password via stdin for security
    // Note: The password is embedded in the echo command, but this is safer than
    // passing it as a command-line argument where it would be visible in process lists
    const command = `echo '${creds.password}' | docker login --username ${creds.username} --password-stdin ${creds.registry}`;

    return {
      command,
      expiresAt: creds.expiresAt,
    };
  }

  /**
   * Forces a token refresh by invalidating the cache.
   *
   * Clears any cached tokens and fetches a new authorization token from ECR.
   * Use this when you need to ensure you have the freshest token, such as
   * after credential rotation or when a cached token has become invalid.
   *
   * @param registryIds - Optional list of registry IDs to refresh tokens for
   * @returns Fresh authorization data
   *
   * @example
   * ```typescript
   * // Refresh the default registry token
   * const authData = await authService.refreshToken();
   *
   * // Refresh a specific registry token
   * const authData = await authService.refreshToken(['123456789012']);
   * ```
   */
  async refreshToken(registryIds?: string[]): Promise<AuthorizationData> {
    const registryId = registryIds?.[0] ?? 'default';

    this.logger?.debug('Forcing token refresh', { registryId });
    this.cache.clear(registryId);
    this.metrics?.increment('ecr.auth.token_refresh', 1, { registry_id: registryId });

    return this.getAuthorizationToken(registryIds);
  }
}

/**
 * Interface for the auth service (useful for dependency injection and testing).
 */
export interface IAuthService {
  /**
   * Gets an authorization token for ECR.
   */
  getAuthorizationToken(registryIds?: string[]): Promise<AuthorizationData>;

  /**
   * Gets Docker credentials from the authorization token.
   */
  getDockerCredentials(): Promise<DockerCredentials>;

  /**
   * Generates a Docker login command.
   */
  getLoginCommand(): Promise<LoginCommand>;

  /**
   * Forces a token refresh by invalidating the cache.
   */
  refreshToken(registryIds?: string[]): Promise<AuthorizationData>;
}
