/**
 * Authorization Code Flow with PKCE
 *
 * RFC 7636 - Proof Key for Code Exchange.
 */

import {
  PkceAuthorizationParams,
  PkceAuthorizationUrl,
  PkceCodeExchangeRequest,
  TokenResponse,
  CallbackParams,
  OAuth2Config,
} from "../types";
import { OAuth2Error, AuthorizationError, ProviderError } from "../error";
import { createErrorFromResponse } from "../error/mapping";
import { HttpTransport } from "../core/transport";
import { StateManager } from "../core/state";
import { PkceGenerator, PkceMethod } from "../core/pkce";

/**
 * Authorization Code Flow with PKCE interface.
 */
export interface AuthorizationCodePkceFlow {
  /**
   * Build authorization URL with PKCE challenge.
   */
  buildAuthorizationUrl(params: PkceAuthorizationParams): PkceAuthorizationUrl;

  /**
   * Exchange authorization code for tokens with PKCE verifier.
   */
  exchangeCode(request: PkceCodeExchangeRequest): Promise<TokenResponse>;

  /**
   * Handle authorization callback with stored PKCE verifier.
   */
  handleCallback(callback: CallbackParams): Promise<TokenResponse>;
}

/**
 * Authorization Code Flow with PKCE implementation.
 */
export class AuthorizationCodePkceFlowImpl implements AuthorizationCodePkceFlow {
  private config: OAuth2Config;
  private transport: HttpTransport;
  private stateManager: StateManager;
  private pkceGenerator: PkceGenerator;

  constructor(
    config: OAuth2Config,
    transport: HttpTransport,
    stateManager: StateManager,
    pkceGenerator: PkceGenerator
  ) {
    this.config = config;
    this.transport = transport;
    this.stateManager = stateManager;
    this.pkceGenerator = pkceGenerator;
  }

  buildAuthorizationUrl(params: PkceAuthorizationParams): PkceAuthorizationUrl {
    const url = new URL(this.config.provider.authorizationEndpoint);

    // Generate PKCE parameters
    const pkceMethod: PkceMethod = params.challengeMethod ?? "S256";
    const pkce = this.pkceGenerator.generate(pkceMethod);

    // Required parameters
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.credentials.clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);

    // PKCE parameters
    url.searchParams.set("code_challenge", pkce.codeChallenge);
    url.searchParams.set("code_challenge_method", pkce.codeChallengeMethod);

    // Generate state with PKCE verifier stored
    const state = this.stateManager.generate({
      redirectUri: params.redirectUri,
      scopes: params.scopes ?? this.config.defaultScopes ?? [],
      pkceVerifier: pkce.codeVerifier,
    });

    url.searchParams.set("state", state);

    // Scopes
    const scopes = params.scopes ?? this.config.defaultScopes;
    if (scopes && scopes.length > 0) {
      url.searchParams.set("scope", scopes.join(" "));
    }

    // Optional parameters
    if (params.prompt) {
      url.searchParams.set("prompt", params.prompt);
    }
    if (params.loginHint) {
      url.searchParams.set("login_hint", params.loginHint);
    }

    // Extra parameters
    if (params.extraParams) {
      for (const [key, value] of Object.entries(params.extraParams)) {
        url.searchParams.set(key, value);
      }
    }

    return {
      url: url.toString(),
      state,
      codeVerifier: pkce.codeVerifier,
    };
  }

  async exchangeCode(request: PkceCodeExchangeRequest): Promise<TokenResponse> {
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", request.code);
    body.set("redirect_uri", request.redirectUri);
    body.set("client_id", this.config.credentials.clientId);
    body.set("code_verifier", request.codeVerifier);

    // Client secret if present (confidential client with PKCE)
    if (this.config.credentials.clientSecret &&
        this.config.credentials.authMethod === "client_secret_post") {
      body.set("client_secret", this.config.credentials.clientSecret);
    }

    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    };

    // Use Basic auth if configured
    if (this.config.credentials.authMethod === "client_secret_basic" &&
        this.config.credentials.clientSecret) {
      const credentials = Buffer.from(
        `${this.config.credentials.clientId}:${this.config.credentials.clientSecret}`
      ).toString("base64");
      headers["authorization"] = `Basic ${credentials}`;
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

  async handleCallback(callback: CallbackParams): Promise<TokenResponse> {
    // Check for error in callback
    if (callback.error) {
      throw new AuthorizationError(
        callback.errorDescription ?? callback.error,
        callback.error === "access_denied" ? "AccessDenied" : "InvalidRequest",
        {
          errorCode: callback.error,
          errorUri: callback.errorUri,
        }
      );
    }

    // Validate code is present
    if (!callback.code) {
      throw new AuthorizationError(
        "Missing authorization code in callback",
        "InvalidRequest"
      );
    }

    // Validate state
    if (!callback.state) {
      throw new AuthorizationError(
        "Missing state parameter in callback",
        "StateMismatch"
      );
    }

    const metadata = this.stateManager.consume(callback.state);
    if (!metadata) {
      throw new AuthorizationError(
        "Invalid or expired state parameter",
        "StateMismatch"
      );
    }

    // PKCE verifier must be in metadata
    if (!metadata.pkceVerifier) {
      throw new AuthorizationError(
        "Missing PKCE verifier in state metadata",
        "InvalidRequest"
      );
    }

    // Exchange code for tokens
    return this.exchangeCode({
      code: callback.code,
      redirectUri: metadata.redirectUri,
      state: callback.state,
      codeVerifier: metadata.pkceVerifier,
    });
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
        refreshToken: data.refresh_token,
        scope: data.scope,
        idToken: data.id_token,
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
    const standardFields = [
      "access_token",
      "token_type",
      "expires_in",
      "refresh_token",
      "scope",
      "id_token",
    ];

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
 * Mock Authorization Code PKCE Flow for testing.
 */
export class MockAuthorizationCodePkceFlow implements AuthorizationCodePkceFlow {
  private buildUrlHistory: PkceAuthorizationParams[] = [];
  private exchangeHistory: PkceCodeExchangeRequest[] = [];
  private callbackHistory: CallbackParams[] = [];
  private nextTokenResponse?: TokenResponse;
  private nextError?: OAuth2Error;
  private nextVerifier: string = "mock-verifier";

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
   * Set the next PKCE verifier to return.
   */
  setNextVerifier(verifier: string): this {
    this.nextVerifier = verifier;
    return this;
  }

  /**
   * Get build URL history.
   */
  getBuildUrlHistory(): PkceAuthorizationParams[] {
    return [...this.buildUrlHistory];
  }

  /**
   * Get exchange history.
   */
  getExchangeHistory(): PkceCodeExchangeRequest[] {
    return [...this.exchangeHistory];
  }

  /**
   * Get callback history.
   */
  getCallbackHistory(): CallbackParams[] {
    return [...this.callbackHistory];
  }

  buildAuthorizationUrl(params: PkceAuthorizationParams): PkceAuthorizationUrl {
    this.buildUrlHistory.push(params);
    return {
      url: `https://mock.example.com/authorize?redirect_uri=${params.redirectUri}`,
      state: "mock-state",
      codeVerifier: this.nextVerifier,
    };
  }

  async exchangeCode(request: PkceCodeExchangeRequest): Promise<TokenResponse> {
    this.exchangeHistory.push(request);

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
      accessToken: "mock-access-token",
      tokenType: "Bearer",
      expiresIn: 3600,
      refreshToken: "mock-refresh-token",
      scope: "openid profile email",
    };
  }

  async handleCallback(callback: CallbackParams): Promise<TokenResponse> {
    this.callbackHistory.push(callback);

    if (callback.error) {
      throw new AuthorizationError(
        callback.errorDescription ?? callback.error,
        "AccessDenied"
      );
    }

    return this.exchangeCode({
      code: callback.code ?? "",
      redirectUri: "https://example.com/callback",
      codeVerifier: this.nextVerifier,
    });
  }
}

/**
 * Create mock Authorization Code PKCE Flow for testing.
 */
export function createMockAuthorizationCodePkceFlow(): MockAuthorizationCodePkceFlow {
  return new MockAuthorizationCodePkceFlow();
}
