/**
 * Token Manager
 *
 * Token lifecycle management with auto-refresh.
 */

import {
  StoredTokens,
  AccessToken,
  TokenResponse,
  RefreshTokenParams,
  OAuth2Config,
  toStoredTokens,
  toAccessToken,
  isExpiringSoon,
  hasRefreshToken,
} from "../types";
import { TokenError, OAuth2Error } from "../error";
import { createErrorFromResponse } from "../error/mapping";
import { HttpTransport } from "../core/transport";
import { TokenStorage } from "./storage";

/**
 * Token manager interface (for dependency injection).
 */
export interface TokenManager {
  /**
   * Get access token, refreshing if needed.
   */
  getAccessToken(key: string): Promise<AccessToken>;

  /**
   * Store tokens from a token response.
   */
  storeTokens(key: string, response: TokenResponse): Promise<void>;

  /**
   * Get stored tokens without refresh.
   */
  getStoredTokens(key: string): Promise<StoredTokens | null>;

  /**
   * Clear tokens for key.
   */
  clearTokens(key: string): Promise<void>;

  /**
   * Force refresh tokens, even if not expiring.
   */
  forceRefresh(key: string): Promise<TokenResponse>;
}

/**
 * Token manager implementation.
 */
export class TokenManagerImpl implements TokenManager {
  private config: OAuth2Config;
  private transport: HttpTransport;
  private storage: TokenStorage;
  private refreshThreshold: number;
  private refreshLocks: Map<string, Promise<TokenResponse>> = new Map();

  constructor(
    config: OAuth2Config,
    transport: HttpTransport,
    storage: TokenStorage,
    options?: { refreshThresholdSeconds?: number }
  ) {
    this.config = config;
    this.transport = transport;
    this.storage = storage;
    this.refreshThreshold = options?.refreshThresholdSeconds ?? 300; // 5 minutes
  }

  async getAccessToken(key: string): Promise<AccessToken> {
    const stored = await this.storage.get(key);

    if (!stored) {
      throw new TokenError("Token not found", "NotFound", { key });
    }

    // Check if refresh is needed
    if (isExpiringSoon(stored, this.refreshThreshold)) {
      if (hasRefreshToken(stored)) {
        try {
          const refreshed = await this.refreshWithLock(key, stored);
          const newStored = toStoredTokens(refreshed);
          await this.storage.store(key, newStored);
          return toAccessToken(newStored);
        } catch (error) {
          // If refresh fails but token isn't fully expired yet, return it
          if (!isExpiringSoon(stored, 0)) {
            return toAccessToken(stored);
          }
          throw error;
        }
      } else if (isExpiringSoon(stored, 0)) {
        // Expired and no refresh token
        throw new TokenError(
          "Token expired and no refresh token available",
          "Expired",
          { key }
        );
      }
    }

    return toAccessToken(stored);
  }

  async storeTokens(key: string, response: TokenResponse): Promise<void> {
    const stored = toStoredTokens(response);
    await this.storage.store(key, stored);
  }

  async getStoredTokens(key: string): Promise<StoredTokens | null> {
    return this.storage.get(key);
  }

  async clearTokens(key: string): Promise<void> {
    await this.storage.delete(key);
    this.refreshLocks.delete(key);
  }

  async forceRefresh(key: string): Promise<TokenResponse> {
    const stored = await this.storage.get(key);

    if (!stored) {
      throw new TokenError("Token not found", "NotFound", { key });
    }

    if (!hasRefreshToken(stored)) {
      throw new TokenError(
        "No refresh token available",
        "NoRefreshToken",
        { key }
      );
    }

    const response = await this.refreshTokens(stored.refreshToken!.expose());
    const newStored = toStoredTokens(response);
    await this.storage.store(key, newStored);
    return response;
  }

  /**
   * Refresh with lock to prevent concurrent refreshes.
   */
  private async refreshWithLock(
    key: string,
    stored: StoredTokens
  ): Promise<TokenResponse> {
    // Check if refresh is already in progress
    const existingLock = this.refreshLocks.get(key);
    if (existingLock) {
      return existingLock;
    }

    // Create refresh promise
    const refreshPromise = this.refreshTokens(stored.refreshToken!.expose())
      .finally(() => {
        this.refreshLocks.delete(key);
      });

    this.refreshLocks.set(key, refreshPromise);
    return refreshPromise;
  }

  /**
   * Execute refresh token request.
   */
  private async refreshTokens(refreshToken: string): Promise<TokenResponse> {
    const body = new URLSearchParams();
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", refreshToken);

    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    };

    // Authentication
    if (this.config.credentials.authMethod === "client_secret_basic" &&
        this.config.credentials.clientSecret) {
      const credentials = Buffer.from(
        `${this.config.credentials.clientId}:${this.config.credentials.clientSecret}`
      ).toString("base64");
      headers["authorization"] = `Basic ${credentials}`;
    } else {
      body.set("client_id", this.config.credentials.clientId);
      if (this.config.credentials.clientSecret) {
        body.set("client_secret", this.config.credentials.clientSecret);
      }
    }

    const response = await this.transport.send({
      method: "POST",
      url: this.config.provider.tokenEndpoint,
      headers,
      body: body.toString(),
      timeout: this.config.timeout,
    });

    if (response.status !== 200) {
      throw createErrorFromResponse(response.status, response.body);
    }

    return this.parseTokenResponse(response.body, refreshToken);
  }

  private parseTokenResponse(body: string, originalRefreshToken: string): TokenResponse {
    try {
      const data = JSON.parse(body);

      return {
        accessToken: data.access_token,
        tokenType: data.token_type ?? "Bearer",
        expiresIn: data.expires_in,
        // Keep original refresh token if new one not provided
        refreshToken: data.refresh_token ?? originalRefreshToken,
        scope: data.scope,
        idToken: data.id_token,
      };
    } catch {
      throw new TokenError("Invalid token response", "RefreshFailed");
    }
  }
}

/**
 * Mock token manager for testing.
 */
export class MockTokenManager implements TokenManager {
  private tokens: Map<string, StoredTokens> = new Map();
  private getAccessTokenHistory: string[] = [];
  private storeHistory: Array<{ key: string; response: TokenResponse }> = [];
  private refreshHistory: string[] = [];
  private nextAccessToken?: AccessToken;
  private nextError?: OAuth2Error;

  /**
   * Set the next access token to return.
   */
  setNextAccessToken(token: AccessToken): this {
    this.nextAccessToken = token;
    return this;
  }

  /**
   * Set the next error to throw.
   */
  setNextError(error: OAuth2Error): this {
    this.nextError = error;
    return this;
  }

  /**
   * Pre-populate tokens.
   */
  setTokens(key: string, tokens: StoredTokens): this {
    this.tokens.set(key, tokens);
    return this;
  }

  /**
   * Get access token history.
   */
  getGetAccessTokenHistory(): string[] {
    return [...this.getAccessTokenHistory];
  }

  /**
   * Get store history.
   */
  getStoreHistory(): Array<{ key: string; response: TokenResponse }> {
    return [...this.storeHistory];
  }

  /**
   * Get refresh history.
   */
  getRefreshHistory(): string[] {
    return [...this.refreshHistory];
  }

  async getAccessToken(key: string): Promise<AccessToken> {
    this.getAccessTokenHistory.push(key);

    if (this.nextError) {
      const error = this.nextError;
      this.nextError = undefined;
      throw error;
    }

    if (this.nextAccessToken) {
      const token = this.nextAccessToken;
      this.nextAccessToken = undefined;
      return token;
    }

    const stored = this.tokens.get(key);
    if (stored) {
      return toAccessToken(stored);
    }

    throw new TokenError("Token not found", "NotFound", { key });
  }

  async storeTokens(key: string, response: TokenResponse): Promise<void> {
    this.storeHistory.push({ key, response });
    this.tokens.set(key, toStoredTokens(response));
  }

  async getStoredTokens(key: string): Promise<StoredTokens | null> {
    return this.tokens.get(key) ?? null;
  }

  async clearTokens(key: string): Promise<void> {
    this.tokens.delete(key);
  }

  async forceRefresh(key: string): Promise<TokenResponse> {
    this.refreshHistory.push(key);

    if (this.nextError) {
      const error = this.nextError;
      this.nextError = undefined;
      throw error;
    }

    return {
      accessToken: "mock-refreshed-token",
      tokenType: "Bearer",
      expiresIn: 3600,
      refreshToken: "mock-new-refresh-token",
    };
  }
}

/**
 * Create mock token manager for testing.
 */
export function createMockTokenManager(): MockTokenManager {
  return new MockTokenManager();
}
