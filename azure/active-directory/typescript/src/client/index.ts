/**
 * Azure Active Directory OAuth2 Client
 *
 * Main client for Azure AD authentication and authorization.
 * Following the SPARC specification for Azure AD integration.
 */

import type {
  AccessToken,
  TokenResponse,
  DeviceCodeResponse,
  AuthorizationUrl,
  TokenClaims,
} from "../types/index.js";
import type { AzureAdConfig } from "../config.js";
import { AzureAdConfigBuilder } from "../config.js";
import { TokenCache, createTokenCache } from "../token/cache.js";
import { JwksCache, validateClaims, verifySignature } from "../token/validation.js";
import { SimulationLayer, createSimulationLayer } from "../simulation/index.js";
import { ResilientExecutor, createResilientExecutor } from "../resilience/index.js";
import {
  acquireTokenClientCredentials,
} from "../flows/client-credentials.js";
import {
  getAuthorizationUrl,
  acquireTokenByAuthCode,
  type AuthCodeParams,
} from "../flows/authorization-code.js";
import {
  initiateDeviceCode,
  acquireTokenByDeviceCode,
} from "../flows/device-code.js";
import {
  acquireTokenManagedIdentity,
  isManagedIdentityAvailable,
} from "../flows/managed-identity.js";
import { parseJwtHeader } from "../crypto/jwt.js";
import { networkError, invalidToken } from "../error.js";
import type { Logger, MetricsCollector, Tracer } from "../observability/index.js";
import {
  createNoopLogger,
  createNoopMetricsCollector,
  createNoopTracer,
  MetricNames,
} from "../observability/index.js";

/**
 * Azure AD client options.
 */
export interface AzureAdClientOptions {
  logger?: Logger;
  metrics?: MetricsCollector;
  tracer?: Tracer;
  httpFetch?: typeof fetch;
}

/**
 * Azure AD OAuth2 client.
 *
 * @example
 * ```typescript
 * // Create client with client secret
 * const client = await AzureAdClient.create(
 *   new AzureAdConfigBuilder('tenant-id', 'client-id')
 *     .withClientSecret('secret')
 *     .build()
 * );
 *
 * // Acquire token
 * const token = await client.acquireTokenClientCredentials([
 *   'https://graph.microsoft.com/.default'
 * ]);
 * ```
 */
export class AzureAdClient {
  private readonly config: AzureAdConfig;
  private readonly cache: TokenCache;
  private readonly jwksCache: JwksCache;
  private readonly simulation: SimulationLayer;
  private readonly resilient: ResilientExecutor;
  private readonly logger: Logger;
  private readonly metrics: MetricsCollector;
  private readonly tracer: Tracer;
  private readonly httpFetch: typeof fetch;

  private constructor(
    config: AzureAdConfig,
    options: AzureAdClientOptions = {}
  ) {
    this.config = config;
    this.cache = createTokenCache(config.cache);
    this.jwksCache = new JwksCache();
    this.simulation = createSimulationLayer(config.simulation);
    this.resilient = createResilientExecutor(config.retry, config.circuitBreaker);
    this.logger = options.logger ?? createNoopLogger();
    this.metrics = options.metrics ?? createNoopMetricsCollector();
    this.tracer = options.tracer ?? createNoopTracer();
    this.httpFetch = options.httpFetch ?? fetch;
  }

  /**
   * Create a new Azure AD client.
   */
  static async create(
    config: AzureAdConfig,
    options: AzureAdClientOptions = {}
  ): Promise<AzureAdClient> {
    const client = new AzureAdClient(config, options);
    await client.simulation.initialize();
    return client;
  }

  /**
   * Create a client from environment variables.
   */
  static async fromEnv(options: AzureAdClientOptions = {}): Promise<AzureAdClient> {
    const config = AzureAdConfigBuilder.fromEnv().build();
    return AzureAdClient.create(config, options);
  }

  /**
   * Acquire token using client credentials flow.
   *
   * @param scopes - Scopes to request (e.g., ['https://graph.microsoft.com/.default'])
   * @returns Access token
   */
  async acquireTokenClientCredentials(scopes: string[]): Promise<AccessToken> {
    const span = this.tracer.startSpan("azure_ad.acquire_token_client_credentials", {
      scopes: scopes.join(" "),
    });

    const startTime = Date.now();

    try {
      this.logger.debug("Acquiring token via client credentials", { scopes });

      // Check simulation replay
      if (this.simulation.isReplay()) {
        const token = await this.simulation.replayTokenRequest({
          grantType: "client_credentials",
          clientId: this.config.clientId,
          scopes: scopes.join(" "),
          flowType: "client_credentials",
        });
        this.metrics.incrementCounter(MetricNames.TOKEN_ACQUISITIONS_TOTAL, 1, {
          flow: "client_credentials",
          source: "simulation",
        });
        span.setStatus("ok");
        return token;
      }

      const token = await this.resilient.execute(() =>
        acquireTokenClientCredentials(this.config, scopes, this.cache, this.httpFetch)
      );

      const durationMs = Date.now() - startTime;
      this.metrics.recordHistogram(MetricNames.LATENCY_SECONDS, durationMs / 1000, {
        flow: "client_credentials",
      });
      this.metrics.incrementCounter(MetricNames.TOKEN_ACQUISITIONS_TOTAL, 1, {
        flow: "client_credentials",
      });

      this.logger.info("Token acquired via client credentials", {
        expiresIn: Math.floor((token.expiresOn.getTime() - Date.now()) / 1000),
      });

      span.setStatus("ok");
      return token;
    } catch (error) {
      this.metrics.incrementCounter(MetricNames.ERRORS_TOTAL, 1, {
        flow: "client_credentials",
      });
      span.setStatus("error", error instanceof Error ? error.message : "Unknown error");
      this.logger.error("Failed to acquire token via client credentials", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Get authorization URL for user login.
   *
   * @param params - Authorization parameters
   * @returns Authorization URL and PKCE verifier
   */
  getAuthorizationUrl(params: AuthCodeParams): AuthorizationUrl {
    this.logger.debug("Generating authorization URL", {
      redirectUri: params.redirectUri,
      scopes: params.scopes,
    });

    return getAuthorizationUrl(this.config, params);
  }

  /**
   * Exchange authorization code for tokens.
   *
   * @param code - Authorization code from callback
   * @param redirectUri - Redirect URI used in authorization request
   * @param codeVerifier - PKCE code verifier
   * @returns Token response with access token, refresh token, and ID token
   */
  async acquireTokenByAuthCode(
    code: string,
    redirectUri: string,
    codeVerifier: string
  ): Promise<TokenResponse> {
    const span = this.tracer.startSpan("azure_ad.acquire_token_by_auth_code");
    const startTime = Date.now();

    try {
      this.logger.debug("Exchanging authorization code for tokens");

      const response = await this.resilient.execute(() =>
        acquireTokenByAuthCode(
          this.config,
          code,
          redirectUri,
          codeVerifier,
          this.cache,
          this.httpFetch
        )
      );

      const durationMs = Date.now() - startTime;
      this.metrics.recordHistogram(MetricNames.LATENCY_SECONDS, durationMs / 1000, {
        flow: "authorization_code",
      });
      this.metrics.incrementCounter(MetricNames.TOKEN_ACQUISITIONS_TOTAL, 1, {
        flow: "authorization_code",
      });

      this.logger.info("Token acquired via authorization code");
      span.setStatus("ok");
      return response;
    } catch (error) {
      this.metrics.incrementCounter(MetricNames.ERRORS_TOTAL, 1, {
        flow: "authorization_code",
      });
      span.setStatus("error", error instanceof Error ? error.message : "Unknown error");
      this.logger.error("Failed to exchange authorization code", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Initiate device code flow.
   *
   * @param scopes - Scopes to request
   * @returns Device code response with user instructions
   */
  async initiateDeviceCode(scopes: string[]): Promise<DeviceCodeResponse> {
    const span = this.tracer.startSpan("azure_ad.initiate_device_code", {
      scopes: scopes.join(" "),
    });

    try {
      this.logger.debug("Initiating device code flow", { scopes });

      const response = await initiateDeviceCode(this.config, scopes, this.httpFetch);

      this.logger.info("Device code flow initiated", {
        userCode: response.userCode,
        verificationUri: response.verificationUri,
      });

      span.setStatus("ok");
      return response;
    } catch (error) {
      span.setStatus("error", error instanceof Error ? error.message : "Unknown error");
      this.logger.error("Failed to initiate device code flow", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Poll for device code token.
   *
   * @param deviceCode - Device code from initiation
   * @param interval - Polling interval in seconds
   * @returns Access token when user completes login
   */
  async acquireTokenByDeviceCode(deviceCode: string, interval: number): Promise<AccessToken> {
    const span = this.tracer.startSpan("azure_ad.acquire_token_by_device_code");
    const startTime = Date.now();

    try {
      this.logger.debug("Polling for device code token");

      const token = await acquireTokenByDeviceCode(
        this.config,
        deviceCode,
        interval,
        this.cache,
        this.httpFetch
      );

      const durationMs = Date.now() - startTime;
      this.metrics.recordHistogram(MetricNames.LATENCY_SECONDS, durationMs / 1000, {
        flow: "device_code",
      });
      this.metrics.incrementCounter(MetricNames.TOKEN_ACQUISITIONS_TOTAL, 1, {
        flow: "device_code",
      });

      this.logger.info("Token acquired via device code flow");
      span.setStatus("ok");
      return token;
    } catch (error) {
      this.metrics.incrementCounter(MetricNames.ERRORS_TOTAL, 1, {
        flow: "device_code",
      });
      span.setStatus("error", error instanceof Error ? error.message : "Unknown error");
      this.logger.error("Failed to acquire token via device code", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Acquire token using managed identity.
   *
   * @param resource - Resource scope (e.g., 'https://storage.azure.com/')
   * @returns Access token
   */
  async acquireTokenManagedIdentity(resource: string): Promise<AccessToken> {
    const span = this.tracer.startSpan("azure_ad.acquire_token_managed_identity", {
      resource,
    });
    const startTime = Date.now();

    try {
      this.logger.debug("Acquiring token via managed identity", { resource });

      const token = await acquireTokenManagedIdentity(
        this.config,
        resource,
        this.cache,
        this.httpFetch
      );

      const durationMs = Date.now() - startTime;
      this.metrics.recordHistogram(MetricNames.LATENCY_SECONDS, durationMs / 1000, {
        flow: "managed_identity",
      });
      this.metrics.incrementCounter(MetricNames.TOKEN_ACQUISITIONS_TOTAL, 1, {
        flow: "managed_identity",
      });

      this.logger.info("Token acquired via managed identity", {
        expiresIn: Math.floor((token.expiresOn.getTime() - Date.now()) / 1000),
      });

      span.setStatus("ok");
      return token;
    } catch (error) {
      this.metrics.incrementCounter(MetricNames.ERRORS_TOTAL, 1, {
        flow: "managed_identity",
      });
      span.setStatus("error", error instanceof Error ? error.message : "Unknown error");
      this.logger.error("Failed to acquire token via managed identity", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Validate a JWT token.
   *
   * @param token - JWT token to validate
   * @returns Validated token claims
   */
  async validateToken(token: string): Promise<TokenClaims> {
    const span = this.tracer.startSpan("azure_ad.validate_token");

    try {
      this.logger.debug("Validating token");

      // Parse header to get kid
      const header = parseJwtHeader(token);

      // Get signing key from JWKS
      const key = await this.getSigningKey(header.kid);

      // Verify signature and get claims
      const claims = verifySignature(token, key);

      // Validate claims
      validateClaims(claims, this.config.clientId, this.config.tenantId);

      this.metrics.incrementCounter(MetricNames.TOKEN_VALIDATION_TOTAL, 1, {
        result: "success",
      });

      this.logger.debug("Token validated successfully");
      span.setStatus("ok");
      return claims;
    } catch (error) {
      this.metrics.incrementCounter(MetricNames.TOKEN_VALIDATION_TOTAL, 1, {
        result: "failure",
      });
      span.setStatus("error", error instanceof Error ? error.message : "Unknown error");
      this.logger.error("Token validation failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Refresh an access token.
   *
   * @param refreshToken - Refresh token
   * @param scopes - Scopes to request
   * @returns New token response
   */
  async refreshToken(refreshToken: string, scopes: string[]): Promise<TokenResponse> {
    const span = this.tracer.startSpan("azure_ad.refresh_token");
    const startTime = Date.now();

    try {
      this.logger.debug("Refreshing token");

      const tokenEndpoint = `${this.config.authority}/${this.config.tenantId}/oauth2/v2.0/token`;

      const params = new URLSearchParams();
      params.set("grant_type", "refresh_token");
      params.set("client_id", this.config.clientId);
      params.set("refresh_token", refreshToken);
      params.set("scope", scopes.join(" "));

      if (this.config.credential.type === "secret") {
        params.set("client_secret", this.config.credential.value);
      }

      const response = await this.httpFetch(tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      const data = await response.json() as {
        access_token: string;
        token_type: string;
        expires_in: number;
        refresh_token?: string;
        id_token?: string;
        scope?: string;
        error?: string;
        error_description?: string;
      };

      if (data.error) {
        throw invalidToken(data.error_description ?? data.error);
      }

      const responseScopes = data.scope ? data.scope.split(" ") : scopes;

      const accessToken: AccessToken = {
        token: data.access_token,
        tokenType: data.token_type,
        expiresOn: new Date(Date.now() + data.expires_in * 1000),
        scopes: responseScopes,
        tenantId: this.config.tenantId,
      };

      // Update cache
      const cacheKey = TokenCache.buildKey(
        this.config.tenantId,
        this.config.clientId,
        "refresh",
        responseScopes
      );
      this.cache.set(cacheKey, accessToken);

      if (data.refresh_token) {
        this.cache.setRefreshToken(cacheKey, data.refresh_token);
      }

      const durationMs = Date.now() - startTime;
      this.metrics.recordHistogram(MetricNames.LATENCY_SECONDS, durationMs / 1000, {
        flow: "refresh",
      });
      this.metrics.incrementCounter(MetricNames.TOKEN_REFRESH_TOTAL, 1);

      this.logger.info("Token refreshed successfully");
      span.setStatus("ok");

      return {
        accessToken,
        refreshToken: data.refresh_token,
        idToken: data.id_token,
        expiresIn: data.expires_in,
      };
    } catch (error) {
      this.metrics.incrementCounter(MetricNames.ERRORS_TOTAL, 1, {
        flow: "refresh",
      });
      span.setStatus("error", error instanceof Error ? error.message : "Unknown error");
      this.logger.error("Token refresh failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Clear the token cache.
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug("Token cache cleared");
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { accessTokenCount: number; refreshTokenCount: number } {
    return this.cache.getStats();
  }

  /**
   * Get circuit breaker state.
   */
  getCircuitState(): "closed" | "open" | "half-open" {
    return this.resilient.getCircuitState();
  }

  /**
   * Reset the circuit breaker.
   */
  resetCircuitBreaker(): void {
    this.resilient.reset();
    this.logger.debug("Circuit breaker reset");
  }

  /**
   * Check if managed identity is available.
   */
  static async isManagedIdentityAvailable(timeoutMs?: number): Promise<boolean> {
    return isManagedIdentityAvailable(timeoutMs);
  }

  /**
   * Save simulation recordings.
   */
  async saveSimulationRecordings(): Promise<void> {
    await this.simulation.save();
    this.logger.debug("Simulation recordings saved");
  }

  /**
   * Get signing key from JWKS.
   */
  private async getSigningKey(kid?: string): Promise<{ kid: string; kty: string; use: string; n: string; e: string; x5c?: string[] }> {
    // Check cache first
    if (kid && this.jwksCache.isValid()) {
      const key = this.jwksCache.findKey(kid);
      if (key) {
        return key;
      }
    }

    // Fetch JWKS
    const jwksEndpoint = `${this.config.authority}/${this.config.tenantId}/discovery/v2.0/keys`;

    let response: Response;
    try {
      response = await this.httpFetch(jwksEndpoint);
    } catch (error) {
      throw networkError(error instanceof Error ? error : new Error(String(error)));
    }

    if (!response.ok) {
      throw invalidToken(`Failed to fetch JWKS: ${response.status}`);
    }

    const jwks = await response.json() as { keys: Array<{ kid: string; kty: string; use: string; n: string; e: string; x5c?: string[] }> };
    this.jwksCache.set(jwks);

    // Find key
    if (kid) {
      const key = jwks.keys.find(k => k.kid === kid);
      if (!key) {
        throw invalidToken(`Signing key ${kid} not found`);
      }
      return key;
    }

    // Return first key if no kid specified
    if (jwks.keys.length === 0) {
      throw invalidToken("No signing keys found in JWKS");
    }

    return jwks.keys[0]!;
  }
}

/**
 * Create an Azure AD client.
 */
export async function createAzureAdClient(
  config: AzureAdConfig,
  options?: AzureAdClientOptions
): Promise<AzureAdClient> {
  return AzureAdClient.create(config, options);
}

/**
 * Create an Azure AD client from environment variables.
 */
export async function createAzureAdClientFromEnv(
  options?: AzureAdClientOptions
): Promise<AzureAdClient> {
  return AzureAdClient.fromEnv(options);
}
