/**
 * Docker registry token provider for Artifact Registry.
 * @module auth/docker-token
 */

import { SecretString } from './secret.js';
import type { GcpAuthProvider } from './provider.js';
import { ArtifactRegistryError, ArtifactRegistryErrorKind } from '../errors.js';
import type { ImageReference } from '../types/common.js';
import { getRegistryUrl, getFullImageName } from '../types/common.js';

/**
 * Docker registry token response.
 */
export interface DockerTokenResponse {
  /** Access token for registry operations */
  token: string;
  /** Token expiration (optional) */
  expires_in?: number;
  /** Issue time (optional) */
  issued_at?: string;
}

/**
 * Cached Docker token with scope.
 */
interface CachedDockerToken {
  /** Token (wrapped) */
  token: SecretString;
  /** Expiration time */
  expiresAt: Date;
  /** Scope this token was issued for */
  scope: string;
}

/**
 * Docker registry token provider.
 * Handles OAuth2 token exchange for Docker registry operations.
 */
export class DockerTokenProvider {
  private readonly authProvider: GcpAuthProvider;
  private readonly tokenCache: Map<string, CachedDockerToken> = new Map();

  constructor(authProvider: GcpAuthProvider) {
    this.authProvider = authProvider;
  }

  /**
   * Gets a Docker registry token for the specified image and actions.
   */
  async getToken(
    image: ImageReference,
    actions: ('pull' | 'push')[]
  ): Promise<string> {
    const registryUrl = getRegistryUrl(image);
    const imageName = getFullImageName(image);
    const scope = `repository:${imageName}:${actions.join(',')}`;
    const cacheKey = `${registryUrl}:${scope}`;

    // Check cache
    const cached = this.tokenCache.get(cacheKey);
    if (cached && !this.isExpired(cached)) {
      return cached.token.expose();
    }

    // Exchange GCP token for Docker registry token
    const token = await this.exchangeToken(registryUrl, scope);

    // Cache the token
    this.tokenCache.set(cacheKey, {
      token: new SecretString(token.token),
      expiresAt: new Date(Date.now() + (token.expires_in ?? 300) * 1000),
      scope,
    });

    return token.token;
  }

  /**
   * Exchanges a GCP access token for a Docker registry token.
   */
  private async exchangeToken(
    registryUrl: string,
    scope: string
  ): Promise<DockerTokenResponse> {
    const accessToken = await this.authProvider.getToken();

    const tokenUrl = new URL(`https://${registryUrl}/v2/token`);
    tokenUrl.searchParams.set('service', registryUrl);
    tokenUrl.searchParams.set('scope', scope);

    const response = await fetch(tokenUrl.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();

      if (response.status === 401) {
        throw new ArtifactRegistryError(
          ArtifactRegistryErrorKind.TokenExpired,
          'Failed to authenticate with Docker registry',
          { statusCode: 401 }
        );
      }

      if (response.status === 403) {
        throw new ArtifactRegistryError(
          ArtifactRegistryErrorKind.PermissionDenied,
          `Permission denied for scope: ${scope}`,
          { statusCode: 403 }
        );
      }

      throw new ArtifactRegistryError(
        ArtifactRegistryErrorKind.TokenRefreshFailed,
        `Failed to get Docker registry token: ${body}`,
        { statusCode: response.status }
      );
    }

    const tokenResponse = await response.json() as DockerTokenResponse;

    if (!tokenResponse.token) {
      throw new ArtifactRegistryError(
        ArtifactRegistryErrorKind.TokenRefreshFailed,
        'Docker registry token response missing token'
      );
    }

    return tokenResponse;
  }

  /**
   * Checks if a cached token is expired.
   */
  private isExpired(cached: CachedDockerToken): boolean {
    // Consider expired if less than 30 seconds remaining
    return cached.expiresAt.getTime() - Date.now() < 30000;
  }

  /**
   * Clears the token cache.
   */
  clearCache(): void {
    this.tokenCache.clear();
  }

  /**
   * Clears cached tokens for a specific registry.
   */
  clearCacheForRegistry(registryUrl: string): void {
    for (const [key] of this.tokenCache) {
      if (key.startsWith(`${registryUrl}:`)) {
        this.tokenCache.delete(key);
      }
    }
  }
}
