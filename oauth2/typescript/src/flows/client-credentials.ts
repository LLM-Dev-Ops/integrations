/**
 * Client Credentials Flow
 *
 * RFC 6749 Section 4.4 - Client Credentials Grant.
 */

import {
  ClientCredentialsParams,
  TokenResponse,
  OAuth2Config,
} from "../types";
import { OAuth2Error, ProviderError, ConfigurationError } from "../error";
import { createErrorFromResponse } from "../error/mapping";
import { HttpTransport } from "../core/transport";

/**
 * Client Credentials Flow interface.
 */
export interface ClientCredentialsFlow {
  /**
   * Request access token using client credentials.
   */
  requestToken(params?: ClientCredentialsParams): Promise<TokenResponse>;
}

/**
 * Caching Client Credentials Flow interface.
 */
export interface CachingClientCredentialsFlow extends ClientCredentialsFlow {
  /**
   * Request access token, using cache if valid.
   */
  requestToken(params?: ClientCredentialsParams): Promise<TokenResponse>;

  /**
   * Force refresh, bypassing cache.
   */
  forceRefresh(params?: ClientCredentialsParams): Promise<TokenResponse>;

  /**
   * Clear cached token.
   */
  clearCache(): void;
}

/**
 * Client Credentials Flow implementation.
 */
export class ClientCredentialsFlowImpl implements ClientCredentialsFlow {
  private config: OAuth2Config;
  private transport: HttpTransport;

  constructor(config: OAuth2Config, transport: HttpTransport) {
    this.config = config;
    this.transport = transport;

    // Client credentials flow requires client secret
    if (!config.credentials.clientSecret) {
      throw new ConfigurationError(
        "Client credentials flow requires client_secret",
        "MissingRequired"
      );
    }
  }

  async requestToken(params?: ClientCredentialsParams): Promise<TokenResponse> {
    const body = new URLSearchParams();
    body.set("grant_type", "client_credentials");

    // Scopes
    const scopes = params?.scopes ?? this.config.defaultScopes;
    if (scopes && scopes.length > 0) {
      body.set("scope", scopes.join(" "));
    }

    // Resource indicator (RFC 8707)
    if (params?.resource) {
      body.set("resource", params.resource);
    }

    // Audience
    if (params?.audience) {
      body.set("audience", params.audience);
    }

    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    };

    // Authentication
    if (this.config.credentials.authMethod === "client_secret_basic") {
      const credentials = Buffer.from(
        `${this.config.credentials.clientId}:${this.config.credentials.clientSecret}`
      ).toString("base64");
      headers["authorization"] = `Basic ${credentials}`;
    } else {
      // Default to client_secret_post
      body.set("client_id", this.config.credentials.clientId);
      body.set("client_secret", this.config.credentials.clientSecret!);
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

    return this.parseTokenResponse(response.body);
  }

  private parseTokenResponse(body: string): TokenResponse {
    try {
      const data = JSON.parse(body);

      if (!data.access_token) {
        throw new ProviderError("Missing access_token in response", "InvalidRequest");
      }

      return {
        accessToken: data.access_token,
        tokenType: data.token_type ?? "Bearer",
        expiresIn: data.expires_in,
        scope: data.scope,
        extra: this.extractExtraFields(data),
      };
    } catch (error) {
      if (error instanceof OAuth2Error) {
        throw error;
      }
      throw new ProviderError("Invalid token response", "InvalidRequest");
    }
  }

  private extractExtraFields(data: Record<string, unknown>): Record<string, unknown> {
    const standardFields = ["access_token", "token_type", "expires_in", "scope"];
    const extra: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (!standardFields.includes(key)) {
        extra[key] = value;
      }
    }
    return Object.keys(extra).length > 0 ? extra : {};
  }
}

/**
 * Caching Client Credentials Flow implementation.
 */
export class CachingClientCredentialsFlowImpl implements CachingClientCredentialsFlow {
  private innerFlow: ClientCredentialsFlow;
  private cachedToken?: TokenResponse;
  private cachedAt?: Date;
  private refreshThreshold: number;

  constructor(
    innerFlow: ClientCredentialsFlow,
    options?: { refreshThresholdSeconds?: number }
  ) {
    this.innerFlow = innerFlow;
    this.refreshThreshold = (options?.refreshThresholdSeconds ?? 300) * 1000; // 5 minutes
  }

  async requestToken(params?: ClientCredentialsParams): Promise<TokenResponse> {
    // Check cache
    if (this.cachedToken && this.cachedAt && !this.isExpiringSoon()) {
      return this.cachedToken;
    }

    // Request new token
    const token = await this.innerFlow.requestToken(params);
    this.cachedToken = token;
    this.cachedAt = new Date();
    return token;
  }

  async forceRefresh(params?: ClientCredentialsParams): Promise<TokenResponse> {
    this.clearCache();
    return this.requestToken(params);
  }

  clearCache(): void {
    this.cachedToken = undefined;
    this.cachedAt = undefined;
  }

  private isExpiringSoon(): boolean {
    if (!this.cachedToken?.expiresIn || !this.cachedAt) {
      return true;
    }

    const expiresAt = new Date(
      this.cachedAt.getTime() + this.cachedToken.expiresIn * 1000
    );
    const threshold = new Date(Date.now() + this.refreshThreshold);
    return expiresAt <= threshold;
  }
}

/**
 * Mock Client Credentials Flow for testing.
 */
export class MockClientCredentialsFlow implements ClientCredentialsFlow {
  private requestHistory: ClientCredentialsParams[] = [];
  private nextTokenResponse?: TokenResponse;
  private nextError?: OAuth2Error;

  /**
   * Set the next token response to return.
   */
  setNextTokenResponse(response: TokenResponse): this {
    this.nextTokenResponse = response;
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
   * Get request history.
   */
  getRequestHistory(): ClientCredentialsParams[] {
    return [...this.requestHistory];
  }

  async requestToken(params?: ClientCredentialsParams): Promise<TokenResponse> {
    this.requestHistory.push(params ?? {});

    if (this.nextError) {
      const error = this.nextError;
      this.nextError = undefined;
      throw error;
    }

    if (this.nextTokenResponse) {
      const response = this.nextTokenResponse;
      this.nextTokenResponse = undefined;
      return response;
    }

    return {
      accessToken: "mock-client-credentials-token",
      tokenType: "Bearer",
      expiresIn: 3600,
      scope: params?.scopes?.join(" ") ?? "api",
    };
  }
}

/**
 * Create mock Client Credentials Flow for testing.
 */
export function createMockClientCredentialsFlow(): MockClientCredentialsFlow {
  return new MockClientCredentialsFlow();
}
