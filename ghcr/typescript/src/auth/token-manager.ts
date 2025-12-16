/**
 * Token management for GitHub Container Registry authentication.
 * @module auth/token-manager
 */

import { GhcrError, GhcrErrorKind } from '../errors.js';

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

  /**
   * Gets the length without exposing the value.
   */
  get length(): number {
    return this.value.length;
  }

  /**
   * Checks if the value is empty.
   */
  isEmpty(): boolean {
    return this.value.length === 0;
  }
}

/**
 * Cached token with expiration.
 */
interface CachedToken {
  /** The token value */
  readonly token: SecretString;
  /** Scopes the token is valid for */
  readonly scopes: ReadonlySet<string>;
  /** When the token expires */
  readonly expiresAt: number;
}

/**
 * Token response from the registry.
 */
interface TokenResponse {
  token: string;
  access_token?: string;
  expires_in?: number;
  issued_at?: string;
}

/**
 * Token manager for scope-based token caching.
 */
export class TokenManager {
  private readonly cache: Map<string, CachedToken> = new Map();

  /** Token TTL in milliseconds (4.5 minutes) */
  private static readonly TOKEN_TTL = 270000;

  /** Refresh margin in milliseconds (30 seconds) */
  private static readonly REFRESH_MARGIN = 30000;

  /**
   * Gets a cached token for the given scope.
   * Returns undefined if not cached or expired.
   */
  getToken(scope: string): SecretString | undefined {
    const cached = this.cache.get(scope);
    if (!cached) {
      return undefined;
    }

    // Check if token is still valid with margin
    const now = Date.now();
    if (cached.expiresAt - TokenManager.REFRESH_MARGIN <= now) {
      // Token is expired or about to expire
      this.cache.delete(scope);
      return undefined;
    }

    return cached.token;
  }

  /**
   * Caches a token for the given scope.
   */
  setToken(scope: string, token: SecretString, expiresIn?: number): void {
    const ttl = expiresIn
      ? expiresIn * 1000
      : TokenManager.TOKEN_TTL;

    const scopes = new Set(scope.split(' '));
    const expiresAt = Date.now() + ttl;

    this.cache.set(scope, {
      token,
      scopes,
      expiresAt,
    });
  }

  /**
   * Invalidates a token for the given scope.
   */
  invalidateToken(scope: string): void {
    this.cache.delete(scope);
  }

  /**
   * Invalidates all cached tokens.
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Gets all cached scopes.
   */
  getCachedScopes(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Parses a token response from the registry.
   */
  static parseTokenResponse(json: TokenResponse): {
    token: SecretString;
    expiresIn?: number;
  } {
    const tokenValue = json.token || json.access_token;
    if (!tokenValue) {
      throw new GhcrError(
        GhcrErrorKind.AuthFailed,
        'Token response missing token field'
      );
    }

    return {
      token: new SecretString(tokenValue),
      expiresIn: json.expires_in,
    };
  }
}

/**
 * Builds an OCI scope string.
 */
export function buildScope(repository: string, actions: string[]): string {
  return `repository:${repository}:${actions.join(',')}`;
}

/**
 * Parses a scope string into repository and actions.
 */
export function parseScope(scope: string): {
  repository: string;
  actions: string[];
} | null {
  const match = scope.match(/^repository:([^:]+):(.+)$/);
  if (!match) {
    return null;
  }

  const repository = match[1];
  const actions = match[2]?.split(',') ?? [];

  return { repository: repository ?? '', actions };
}

/**
 * Scope actions for different operations.
 */
export const ScopeActions = {
  /** Pull scope for reading */
  pull: ['pull'] as const,

  /** Push scope for writing */
  push: ['push', 'pull'] as const,

  /** Delete scope for removing */
  delete: ['delete'] as const,

  /** All scopes */
  all: ['push', 'pull', 'delete'] as const,
};
