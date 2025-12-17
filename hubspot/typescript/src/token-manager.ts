/**
 * HubSpot API Integration - Token Manager
 *
 * Manages OAuth access tokens with automatic refresh capabilities.
 * Handles token expiration, refresh token flow, and concurrent refresh prevention.
 */

import type { TokenManagerConfig, Tokens } from './types/config.js';

/**
 * Error thrown when token refresh fails
 */
export class TokenRefreshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenRefreshError';
  }
}

/**
 * TokenManager handles OAuth token lifecycle management
 *
 * Features:
 * - Automatic token refresh when expiring
 * - Prevents concurrent refresh requests
 * - 1-minute buffer before expiration
 * - Callback notification on token refresh
 */
export class TokenManager {
  private accessToken: string;
  private refreshToken?: string;
  private expiresAt?: Date;
  private clientId?: string;
  private clientSecret?: string;
  private onRefresh?: (tokens: Tokens) => void;
  private refreshing: Promise<string> | null = null;

  /**
   * Creates a new TokenManager instance
   *
   * @param config - Token manager configuration
   */
  constructor(config: TokenManagerConfig) {
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
    this.expiresAt = config.expiresAt;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.onRefresh = config.onRefresh;
  }

  /**
   * Gets a valid access token, refreshing if necessary
   *
   * Checks if the token is expiring within 1 minute and refreshes it if needed.
   * Prevents concurrent refreshes by reusing the same refresh promise.
   *
   * @returns Valid access token
   * @throws {TokenRefreshError} If token refresh fails
   */
  async getValidToken(): Promise<string> {
    // Check if token needs refresh
    if (this.refreshToken && this.expiresAt) {
      // Refresh 1 minute before expiry (60000ms buffer)
      if (Date.now() > this.expiresAt.getTime() - 60000) {
        return await this.refreshAccessToken();
      }
    }

    return this.accessToken;
  }

  /**
   * Refreshes the access token using the refresh token
   *
   * Prevents concurrent refresh requests by storing and reusing the refresh promise.
   * Cleans up the promise reference after completion or failure.
   *
   * @returns New access token
   * @throws {TokenRefreshError} If refresh fails
   */
  async refreshAccessToken(): Promise<string> {
    // Prevent concurrent refreshes
    if (this.refreshing) {
      return await this.refreshing;
    }

    this.refreshing = this.doRefresh();

    try {
      return await this.refreshing;
    } finally {
      this.refreshing = null;
    }
  }

  /**
   * Performs the actual token refresh API call
   *
   * @private
   * @returns New access token
   * @throws {TokenRefreshError} If refresh fails
   */
  private async doRefresh(): Promise<string> {
    if (!this.refreshToken) {
      throw new TokenRefreshError('No refresh token available');
    }

    if (!this.clientId || !this.clientSecret) {
      throw new TokenRefreshError('Client ID and secret required for token refresh');
    }

    const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new TokenRefreshError(`Token refresh failed: ${errorText}`);
    }

    const tokens = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    // Update internal state
    this.accessToken = tokens.access_token;
    this.refreshToken = tokens.refresh_token;
    this.expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // Notify callback if provided
    if (this.onRefresh) {
      this.onRefresh({
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        expiresAt: this.expiresAt,
      });
    }

    return this.accessToken;
  }
}
