/**
 * Main Amazon ECR client implementation.
 *
 * This module provides the core EcrClient class with:
 * - Lazy service initialization
 * - Rate limiting (adaptive)
 * - Circuit breaker (per-region)
 * - Token caching
 * - Multi-region support
 *
 * @module client
 */

import type { EcrConfig } from './config.js';
import { validateConfig, DEFAULT_REGION } from './config.js';
import { EcrError, EcrErrorKind } from './errors.js';
import { buildEcrEndpoint, type EndpointOptions } from './transport/request.js';
import { mapAwsError, isRetryableAwsError, getRetryDelay } from './transport/error-mapper.js';

/**
 * Rate limiter with adaptive backoff.
 */
class AdaptiveRateLimiter {
  private requestsPerSecond: number;
  private lastRequestTime: number = 0;
  private readonly minRate: number = 10;
  private readonly maxRate: number = 1000;
  private readonly initialRate: number = 100;

  constructor(initialRate: number = 100) {
    this.requestsPerSecond = initialRate;
    this.initialRate = initialRate;
  }

  /**
   * Wait for rate limit allowance.
   */
  async acquire(): Promise<void> {
    const now = Date.now();
    const minInterval = 1000 / this.requestsPerSecond;
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < minInterval) {
      const waitTime = minInterval - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Decrease rate after throttling error.
   */
  onThrottled(): void {
    this.requestsPerSecond = Math.max(
      this.minRate,
      this.requestsPerSecond * 0.5
    );
  }

  /**
   * Gradually increase rate after successful requests.
   */
  onSuccess(): void {
    this.requestsPerSecond = Math.min(
      this.maxRate,
      this.requestsPerSecond * 1.1
    );
  }

  /**
   * Reset to initial rate.
   */
  reset(): void {
    this.requestsPerSecond = this.initialRate;
  }

  /**
   * Get current rate.
   */
  getCurrentRate(): number {
    return this.requestsPerSecond;
  }
}

/**
 * Circuit breaker state.
 */
enum CircuitState {
  Closed = 'CLOSED',
  Open = 'OPEN',
  HalfOpen = 'HALF_OPEN',
}

/**
 * Circuit breaker implementation.
 */
class CircuitBreaker {
  private state: CircuitState = CircuitState.Closed;
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private readonly failureThreshold: number;
  private readonly failureWindow: number;
  private readonly openDuration: number;

  constructor(
    failureThreshold: number = 5,
    failureWindow: number = 30000,
    openDuration: number = 60000
  ) {
    this.failureThreshold = failureThreshold;
    this.failureWindow = failureWindow;
    this.openDuration = openDuration;
  }

  /**
   * Check if request is allowed.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === CircuitState.Open) {
      // Check if we should move to half-open
      if (Date.now() - this.lastFailureTime >= this.openDuration) {
        this.state = CircuitState.HalfOpen;
      } else {
        throw new EcrError(
          EcrErrorKind.ServiceUnavailable,
          'Circuit breaker is open - too many recent failures',
          { statusCode: 503 }
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful request.
   */
  private onSuccess(): void {
    if (this.state === CircuitState.HalfOpen) {
      this.state = CircuitState.Closed;
      this.failures = 0;
    }
  }

  /**
   * Handle failed request.
   */
  private onFailure(): void {
    const now = Date.now();
    this.lastFailureTime = now;

    // Reset failure count if outside the window
    if (now - this.lastFailureTime > this.failureWindow) {
      this.failures = 0;
    }

    this.failures++;

    if (this.failures >= this.failureThreshold) {
      this.state = CircuitState.Open;
    }
  }

  /**
   * Get current state.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Reset circuit breaker.
   */
  reset(): void {
    this.state = CircuitState.Closed;
    this.failures = 0;
    this.lastFailureTime = 0;
  }
}

/**
 * Token cache entry.
 */
interface TokenCacheEntry {
  token: string;
  expiresAt: Date;
  endpoint: string;
}

/**
 * Token cache for authorization tokens.
 */
class TokenCache {
  private cache: Map<string, TokenCacheEntry> = new Map();
  private readonly refreshBufferMs: number;

  constructor(refreshBufferSecs: number = 300) {
    this.refreshBufferMs = refreshBufferSecs * 1000;
  }

  /**
   * Get cached token if valid.
   */
  get(registry: string): TokenCacheEntry | null {
    const entry = this.cache.get(registry);
    if (!entry) {
      return null;
    }

    // Check if token is still valid (with refresh buffer)
    const now = Date.now();
    const expiresAt = entry.expiresAt.getTime();
    const effectiveExpiry = expiresAt - this.refreshBufferMs;

    if (now >= effectiveExpiry) {
      // Token expired or in refresh window
      this.cache.delete(registry);
      return null;
    }

    return entry;
  }

  /**
   * Set token in cache.
   */
  set(registry: string, token: string, expiresAt: Date, endpoint: string): void {
    this.cache.set(registry, { token, expiresAt, endpoint });
  }

  /**
   * Clear token from cache.
   */
  clear(registry: string): void {
    this.cache.delete(registry);
  }

  /**
   * Clear all tokens.
   */
  clearAll(): void {
    this.cache.clear();
  }
}

/**
 * Main ECR client interface.
 */
export interface EcrClientInterface {
  /**
   * Get the client configuration (read-only).
   */
  getConfig(): Readonly<EcrConfig>;

  /**
   * Get the region.
   */
  getRegion(): string;

  /**
   * Raw API call method (used by services).
   * @param operation - ECR API operation name
   * @param params - Operation parameters
   * @returns Response data
   */
  send<T>(operation: string, params: any): Promise<T>;

  /**
   * Service accessor methods (lazily initialized).
   * These will be implemented by the actual services.
   */
  // repositories(): RepositoryService;
  // images(): ImageService;
  // manifests(): ManifestService;
  // scans(): ScanService;
  // auth(): AuthService;
  // replication(): ReplicationService;
  // public(): PublicRegistryService;
}

/**
 * Main ECR client implementation.
 */
export class EcrClient implements EcrClientInterface {
  private readonly config: EcrConfig;
  private readonly endpoint: string;
  private readonly rateLimiter: AdaptiveRateLimiter;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly tokenCache: TokenCache;

  constructor(config: EcrConfig) {
    // Validate and store config
    validateConfig(config);
    this.config = { ...config };

    // Build endpoint
    const endpointOptions: EndpointOptions = {
      useFips: config.useFips,
      useDualstack: config.useDualstack,
      publicRegistry: config.publicRegistry,
      endpointUrl: config.endpointUrl,
    };
    this.endpoint = buildEcrEndpoint(config.region, endpointOptions);

    // Initialize resilience components
    this.rateLimiter = new AdaptiveRateLimiter(100);
    this.circuitBreaker = new CircuitBreaker(5, 30000, 60000);
    this.tokenCache = new TokenCache(config.tokenRefreshBufferSecs ?? 300);
  }

  getConfig(): Readonly<EcrConfig> {
    return Object.freeze({ ...this.config });
  }

  getRegion(): string {
    return this.config.region;
  }

  /**
   * Send a raw API request.
   */
  async send<T>(operation: string, params: any = {}): Promise<T> {
    const maxRetries = this.config.maxRetries ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Apply rate limiting
        await this.rateLimiter.acquire();

        // Execute through circuit breaker
        const result = await this.circuitBreaker.execute(async () => {
          return await this.executeRequest<T>(operation, params);
        });

        // Success - update rate limiter
        this.rateLimiter.onSuccess();
        return result;
      } catch (error) {
        lastError = error as Error;
        const ecrError = error instanceof EcrError ? error : mapAwsError(error);

        // Check if retryable
        if (!ecrError.isRetryable() || attempt >= maxRetries) {
          throw ecrError;
        }

        // Handle throttling
        if (ecrError.kind === EcrErrorKind.ThrottlingException) {
          this.rateLimiter.onThrottled();
        }

        // Calculate retry delay
        const delay = ecrError.retryAfter
          ? ecrError.retryAfter * 1000
          : getRetryDelay(error, attempt);

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Max retries exceeded
    throw lastError || new EcrError(
      EcrErrorKind.Unknown,
      'Max retries exceeded'
    );
  }

  /**
   * Execute the actual HTTP request.
   */
  private async executeRequest<T>(
    operation: string,
    params: any
  ): Promise<T> {
    // This is a placeholder - in a real implementation, this would:
    // 1. Build the request using transport/request.ts
    // 2. Sign the request with AWS SigV4 (using AWS SDK or custom implementation)
    // 3. Make the HTTP request
    // 4. Parse the response using transport/response.ts
    // 5. Handle errors using transport/error-mapper.ts

    throw new EcrError(
      EcrErrorKind.Unknown,
      'Request execution not implemented - requires AWS SDK integration'
    );
  }

  /**
   * Get the token cache.
   */
  getTokenCache(): TokenCache {
    return this.tokenCache;
  }

  /**
   * Get the rate limiter.
   */
  getRateLimiter(): AdaptiveRateLimiter {
    return this.rateLimiter;
  }

  /**
   * Get the circuit breaker.
   */
  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }
}

/**
 * Regional client pool for multi-region operations.
 */
export class RegionalClientPool {
  private clients: Map<string, EcrClient> = new Map();
  private readonly baseConfig: EcrConfig;
  private readonly sharedTokenCache: TokenCache;

  constructor(baseConfig: EcrConfig) {
    this.baseConfig = { ...baseConfig };
    this.sharedTokenCache = new TokenCache(
      baseConfig.tokenRefreshBufferSecs ?? 300
    );
  }

  /**
   * Get or create a client for a specific region.
   */
  getClient(region: string): EcrClient {
    let client = this.clients.get(region);

    if (!client) {
      // Create new client for this region
      const regionalConfig: EcrConfig = {
        ...this.baseConfig,
        region,
      };

      client = new EcrClient(regionalConfig);
      this.clients.set(region, client);
    }

    return client;
  }

  /**
   * Get the shared token cache.
   */
  getSharedTokenCache(): TokenCache {
    return this.sharedTokenCache;
  }

  /**
   * Get all active regions.
   */
  getActiveRegions(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Clear all clients.
   */
  clearAll(): void {
    this.clients.clear();
    this.sharedTokenCache.clearAll();
  }
}

/**
 * Factory function to create an ECR client.
 */
export function createClient(config: EcrConfig): EcrClient {
  return new EcrClient(config);
}

/**
 * Factory function to create an ECR client from environment variables.
 *
 * Environment variables:
 * - AWS_REGION or ECR_REGION: AWS region (default: us-east-1)
 * - AWS_ACCESS_KEY_ID: AWS access key ID (for static auth)
 * - AWS_SECRET_ACCESS_KEY: AWS secret access key (for static auth)
 * - AWS_SESSION_TOKEN: AWS session token (optional, for static auth)
 * - ECR_ENDPOINT_URL: Custom endpoint URL override
 * - ECR_USE_FIPS: Use FIPS endpoints (true/false)
 * - ECR_USE_DUALSTACK: Use dualstack endpoints (true/false)
 * - ECR_MAX_RETRIES: Maximum retry attempts
 * - ECR_TIMEOUT_MS: Request timeout in milliseconds
 * - ECR_PUBLIC: Use ECR Public registry (true/false)
 */
export function createClientFromEnv(
  overrides?: Partial<EcrConfig>
): EcrClient {
  const region =
    overrides?.region ||
    process.env.ECR_REGION ||
    process.env.AWS_REGION ||
    DEFAULT_REGION;

  // Determine authentication method
  let auth: EcrConfig['auth'];

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;

  if (accessKeyId && secretAccessKey) {
    auth = {
      type: 'static',
      accessKeyId,
      secretAccessKey,
      sessionToken,
    };
  } else {
    auth = { type: 'default' };
  }

  const config: EcrConfig = {
    auth,
    region,
    endpointUrl: process.env.ECR_ENDPOINT_URL,
    useFips: process.env.ECR_USE_FIPS === 'true',
    useDualstack: process.env.ECR_USE_DUALSTACK === 'true',
    maxRetries: process.env.ECR_MAX_RETRIES
      ? parseInt(process.env.ECR_MAX_RETRIES, 10)
      : undefined,
    requestTimeoutMs: process.env.ECR_TIMEOUT_MS
      ? parseInt(process.env.ECR_TIMEOUT_MS, 10)
      : undefined,
    publicRegistry: process.env.ECR_PUBLIC === 'true',
    ...overrides,
  };

  return createClient(config);
}

/**
 * Create a regional client for a specific region.
 */
export function createRegionalClient(
  region: string,
  baseConfig: Partial<EcrConfig> = {}
): EcrClient {
  const config: EcrConfig = {
    auth: baseConfig.auth ?? { type: 'default' },
    region,
    ...baseConfig,
  };

  return createClient(config);
}

/**
 * Create a regional client pool.
 */
export function createRegionalClientPool(
  baseConfig: Partial<EcrConfig> = {}
): RegionalClientPool {
  const config: EcrConfig = {
    auth: baseConfig.auth ?? { type: 'default' },
    region: baseConfig.region ?? DEFAULT_REGION,
    ...baseConfig,
  };

  return new RegionalClientPool(config);
}
