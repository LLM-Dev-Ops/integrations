/**
 * Docker Hub API Client
 *
 * Main client implementation for Docker Hub dual API architecture:
 * 1. Hub API (hub.docker.com) - JWT auth for repository operations
 * 2. Registry API (registry-1.docker.io/v2) - Bearer tokens for manifests/blobs
 *
 * Features:
 * - Dual API support with separate authentication flows
 * - Rate limit tracking (RateLimit-Limit, RateLimit-Remaining headers)
 * - Retry with exponential backoff
 * - Circuit breaker pattern
 * - Comprehensive error handling
 * - Service-oriented architecture
 *
 * @module client
 */

import type { DockerHubConfig } from './config.js';
import type { AuthManager } from './auth/manager.js';
import { createAuthManager } from './auth/manager.js';
import {
  DockerHubError,
  DockerHubErrorKind,
  AuthenticationError,
  RateLimitError,
  NetworkError,
  TimeoutError,
} from './errors.js';
import { CircuitBreaker, CircuitBreakerState } from './util/circuit-breaker.js';
import { DockerRateLimiter, RateLimitStatus } from './util/rate-limiter.js';

// Service imports (lazy-loaded)
import type { RepositoryService } from './services/repository.js';
import type { ManifestService } from './services/manifest.js';
import type { BlobService } from './services/blob.js';
import type { TagService } from './services/tag.js';
import type { VulnerabilityService } from './services/vulnerability.js';

/**
 * HTTP method types
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

/**
 * Base request options
 */
export interface BaseRequestOptions {
  /** Request headers */
  headers?: Record<string, string>;
  /** Query parameters */
  query?: Record<string, string | number | boolean | undefined>;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Skip retry logic */
  skipRetry?: boolean;
}

/**
 * Hub API request
 */
export interface HubRequest extends BaseRequestOptions {
  /** HTTP method */
  method: HttpMethod;
  /** API path (relative to Hub API base) */
  path: string;
  /** Request body */
  body?: unknown;
}

/**
 * Registry API request
 */
export interface RegistryRequest extends BaseRequestOptions {
  /** HTTP method */
  method: HttpMethod;
  /** API path (relative to Registry API base) */
  path: string;
  /** Request body */
  body?: unknown;
}

/**
 * HTTP response structure
 */
export interface HttpResponse<T = unknown> {
  /** Response status code */
  status: number;
  /** Response headers */
  headers: Headers;
  /** Parsed response body */
  data: T;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum retry attempts */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  multiplier: number;
  /** Add jitter to delays */
  jitter: boolean;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  jitter: true,
};

/**
 * Main Docker Hub API client interface
 */
export interface DockerHubClient {
  /**
   * Execute a Hub API request
   */
  executeHubRequest<T = unknown>(request: HubRequest): Promise<HttpResponse<T>>;

  /**
   * Execute a Registry API request
   * @param request - Registry API request
   * @param scope - Registry scope (e.g., "repository:user/image:pull")
   */
  executeRegistryRequest<T = unknown>(
    request: RegistryRequest,
    scope: string
  ): Promise<HttpResponse<T>>;

  /**
   * Login to Docker Hub (obtain JWT token)
   */
  login(): Promise<void>;

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): RateLimitStatus;

  /**
   * Get repository service
   */
  repositories(): RepositoryService;

  /**
   * Get manifest service
   */
  manifests(): ManifestService;

  /**
   * Get blob service
   */
  blobs(): BlobService;

  /**
   * Get tag service
   */
  tags(): TagService;

  /**
   * Get vulnerability service
   */
  vulnerabilities(): VulnerabilityService;

  /**
   * Get client configuration
   */
  getConfig(): Readonly<DockerHubConfig>;

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState(): CircuitBreakerState;
}

/**
 * Docker Hub API client implementation
 */
export class DockerHubClientImpl implements DockerHubClient {
  private readonly config: DockerHubConfig;
  private readonly authManager: AuthManager;
  private readonly rateLimiter: DockerRateLimiter;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly hubBaseUrl: string;
  private readonly registryBaseUrl: string;
  private readonly retryConfig: RetryConfig;

  // Lazy-loaded services
  private _repositories?: RepositoryService;
  private _manifests?: ManifestService;
  private _blobs?: BlobService;
  private _tags?: TagService;
  private _vulnerabilities?: VulnerabilityService;

  constructor(config: DockerHubConfig) {
    this.config = { ...config };
    this.hubBaseUrl = config.hubBaseUrl || 'https://hub.docker.com';
    this.registryBaseUrl = config.registryBaseUrl || 'https://registry-1.docker.io';
    this.retryConfig = config.retryConfig || DEFAULT_RETRY_CONFIG;

    // Initialize auth manager
    this.authManager = createAuthManager(config);

    // Initialize rate limiter
    this.rateLimiter = new DockerRateLimiter({
      maxRequests: config.rateLimitConfig?.maxRequests ?? 100,
      windowMs: config.rateLimitConfig?.windowMs ?? 60000,
      bufferPercentage: config.rateLimitConfig?.bufferPercentage ?? 0.1,
    });

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker({
      enabled: config.circuitBreakerConfig?.enabled ?? true,
      threshold: config.circuitBreakerConfig?.threshold ?? 5,
      resetTimeoutMs: config.circuitBreakerConfig?.resetTimeoutMs ?? 60000,
      halfOpenMaxAttempts: config.circuitBreakerConfig?.halfOpenMaxAttempts ?? 3,
    });
  }

  async login(): Promise<void> {
    if (!this.config.credentials) {
      throw new AuthenticationError('No credentials configured for login');
    }

    try {
      await this.authManager.login();
    } catch (error) {
      throw new AuthenticationError(
        `Login failed: ${(error as Error).message}`,
        { cause: error as Error }
      );
    }
  }

  async executeHubRequest<T = unknown>(request: HubRequest): Promise<HttpResponse<T>> {
    return this.executeRequest<T>(
      'hub',
      request.method,
      request.path,
      request.body,
      request.headers,
      request.query,
      request.timeout,
      request.skipRetry
    );
  }

  async executeRegistryRequest<T = unknown>(
    request: RegistryRequest,
    scope: string
  ): Promise<HttpResponse<T>> {
    // Get registry token for the specific scope
    const token = await this.authManager.getRegistryToken(scope);

    // Add bearer token to headers
    const headers = {
      ...request.headers,
      Authorization: `Bearer ${token}`,
    };

    return this.executeRequest<T>(
      'registry',
      request.method,
      request.path,
      request.body,
      headers,
      request.query,
      request.timeout,
      request.skipRetry
    );
  }

  getRateLimitStatus(): RateLimitStatus {
    return this.rateLimiter.getStatus();
  }

  repositories(): RepositoryService {
    if (!this._repositories) {
      // Lazy load to avoid circular dependencies
      const { RepositoryServiceImpl } = require('./services/repository.js');
      this._repositories = new RepositoryServiceImpl(this);
    }
    return this._repositories;
  }

  manifests(): ManifestService {
    if (!this._manifests) {
      const { ManifestServiceImpl } = require('./services/manifest.js');
      this._manifests = new ManifestServiceImpl(this);
    }
    return this._manifests;
  }

  blobs(): BlobService {
    if (!this._blobs) {
      const { BlobServiceImpl } = require('./services/blob.js');
      this._blobs = new BlobServiceImpl(this);
    }
    return this._blobs;
  }

  tags(): TagService {
    if (!this._tags) {
      const { TagServiceImpl } = require('./services/tag.js');
      this._tags = new TagServiceImpl(this);
    }
    return this._tags;
  }

  vulnerabilities(): VulnerabilityService {
    if (!this._vulnerabilities) {
      const { VulnerabilityServiceImpl } = require('./services/vulnerability.js');
      this._vulnerabilities = new VulnerabilityServiceImpl(this);
    }
    return this._vulnerabilities;
  }

  getConfig(): Readonly<DockerHubConfig> {
    return { ...this.config };
  }

  getCircuitBreakerState(): CircuitBreakerState {
    return this.circuitBreaker.getState();
  }

  /**
   * Core HTTP request execution with resilience patterns
   */
  private async executeRequest<T>(
    apiType: 'hub' | 'registry',
    method: HttpMethod,
    path: string,
    body?: unknown,
    customHeaders?: Record<string, string>,
    query?: Record<string, string | number | boolean | undefined>,
    timeout?: number,
    skipRetry?: boolean
  ): Promise<HttpResponse<T>> {
    // Check circuit breaker
    this.circuitBreaker.checkState();

    // Check rate limit
    const rateLimitCheck = this.rateLimiter.tryAcquire();
    if (!rateLimitCheck.allowed) {
      throw new RateLimitError(
        'Rate limit exceeded',
        rateLimitCheck.limit,
        rateLimitCheck.remaining,
        rateLimitCheck.resetAt,
        rateLimitCheck.retryAfterMs
      );
    }

    // Execute with retry
    const executeOnce = async (): Promise<HttpResponse<T>> => {
      return this.performRequest<T>(
        apiType,
        method,
        path,
        body,
        customHeaders,
        query,
        timeout
      );
    };

    try {
      const response = skipRetry
        ? await executeOnce()
        : await this.executeWithRetry(executeOnce);

      // Record success in circuit breaker
      this.circuitBreaker.recordSuccess();

      return response;
    } catch (error) {
      // Record failure in circuit breaker
      this.circuitBreaker.recordFailure(error as Error);
      throw error;
    }
  }

  /**
   * Execute function with retry and exponential backoff
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    attempt: number = 0
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      // Check if error is retryable
      if (!this.isRetryableError(error) || attempt >= this.retryConfig.maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const baseDelay = this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.multiplier, attempt);
      const cappedDelay = Math.min(baseDelay, this.retryConfig.maxDelayMs);

      // Add jitter if enabled
      const delay = this.retryConfig.jitter
        ? cappedDelay * (0.5 + Math.random() * 0.5)
        : cappedDelay;

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Retry
      return this.executeWithRetry(fn, attempt + 1);
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof DockerHubError) {
      return [
        DockerHubErrorKind.NetworkError,
        DockerHubErrorKind.Timeout,
        DockerHubErrorKind.InternalError,
        DockerHubErrorKind.BadGateway,
        DockerHubErrorKind.ServiceUnavailable,
        DockerHubErrorKind.RateLimitExceeded,
      ].includes(error.kind);
    }
    return false;
  }

  /**
   * Perform the actual HTTP request
   */
  private async performRequest<T>(
    apiType: 'hub' | 'registry',
    method: HttpMethod,
    path: string,
    body?: unknown,
    customHeaders?: Record<string, string>,
    query?: Record<string, string | number | boolean | undefined>,
    timeout?: number
  ): Promise<HttpResponse<T>> {
    // Build URL
    const baseUrl = apiType === 'hub' ? this.hubBaseUrl : this.registryBaseUrl;
    const url = this.buildUrl(baseUrl, path, query);

    // Build headers
    const headers = await this.buildHeaders(apiType, customHeaders);

    // Setup timeout
    const requestTimeout = timeout ?? this.config.timeout ?? 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Update rate limit info from headers
      this.updateRateLimitInfo(response.headers);

      // Handle error responses
      if (!response.ok) {
        throw await this.parseErrorResponse(response);
      }

      // Parse response body
      const data = await this.parseResponseBody<T>(response);

      return {
        status: response.status,
        headers: response.headers,
        data,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if ((error as Error).name === 'AbortError') {
        throw new TimeoutError(`Request timeout after ${requestTimeout}ms`);
      }

      if (error instanceof DockerHubError) {
        throw error;
      }

      throw new NetworkError(
        `Network error: ${(error as Error).message}`,
        { cause: error as Error }
      );
    }
  }

  /**
   * Build full URL with query parameters
   */
  private buildUrl(
    baseUrl: string,
    path: string,
    query?: Record<string, string | number | boolean | undefined>
  ): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(normalizedPath, baseUrl);

    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    return url.toString();
  }

  /**
   * Build request headers with authentication
   */
  private async buildHeaders(
    apiType: 'hub' | 'registry',
    customHeaders?: Record<string, string>
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': this.config.userAgent || 'docker-hub-integration-ts/1.0.0',
      ...customHeaders,
    };

    // Add authentication for Hub API
    if (apiType === 'hub') {
      const authHeader = await this.authManager.getAuthHeader();
      if (authHeader) {
        headers.Authorization = authHeader;
      }
    }

    return headers;
  }

  /**
   * Update rate limit information from response headers
   */
  private updateRateLimitInfo(headers: Headers): void {
    const limit = headers.get('RateLimit-Limit') || headers.get('X-RateLimit-Limit');
    const remaining = headers.get('RateLimit-Remaining') || headers.get('X-RateLimit-Remaining');
    const reset = headers.get('RateLimit-Reset') || headers.get('X-RateLimit-Reset');

    if (limit && remaining) {
      this.rateLimiter.updateLimits({
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        resetAt: reset ? new Date(parseInt(reset, 10) * 1000) : undefined,
      });
    }
  }

  /**
   * Parse response body based on content type
   */
  private async parseResponseBody<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('Content-Type') || '';

    // Handle empty responses
    if (response.status === 204 || response.headers.get('Content-Length') === '0') {
      return undefined as T;
    }

    // Parse JSON responses
    if (contentType.includes('application/json')) {
      try {
        const text = await response.text();
        return text ? JSON.parse(text) : (undefined as T);
      } catch (error) {
        throw new DockerHubError(
          DockerHubErrorKind.DeserializationError,
          `Failed to parse JSON response: ${(error as Error).message}`,
          { statusCode: response.status, cause: error as Error }
        );
      }
    }

    // Handle Docker manifest formats
    if (
      contentType.includes('application/vnd.docker.distribution.manifest') ||
      contentType.includes('application/vnd.oci.image.manifest')
    ) {
      try {
        return await response.json();
      } catch (error) {
        throw new DockerHubError(
          DockerHubErrorKind.DeserializationError,
          `Failed to parse manifest: ${(error as Error).message}`,
          { statusCode: response.status, cause: error as Error }
        );
      }
    }

    // Return text for other content types
    const text = await response.text();
    return text as T;
  }

  /**
   * Parse error response from Docker Hub API
   */
  private async parseErrorResponse(response: Response): Promise<DockerHubError> {
    const status = response.status;
    let errorBody: any;

    try {
      errorBody = await response.json();
    } catch {
      errorBody = { message: await response.text().catch(() => `HTTP ${status}`) };
    }

    const message = errorBody.message || errorBody.detail || `HTTP ${status} error`;
    const errors = errorBody.errors;

    // Map status codes to specific error types
    switch (status) {
      case 400:
        return new DockerHubError(
          DockerHubErrorKind.ValidationError,
          message,
          { statusCode: 400, details: errors }
        );

      case 401:
        return new AuthenticationError(
          message || 'Authentication required',
          { statusCode: 401 }
        );

      case 403:
        // Check for rate limiting
        if (message.toLowerCase().includes('rate limit')) {
          const retryAfter = this.parseRetryAfter(response.headers);
          const limit = parseInt(response.headers.get('RateLimit-Limit') || '0', 10);
          const remaining = parseInt(response.headers.get('RateLimit-Remaining') || '0', 10);
          const reset = response.headers.get('RateLimit-Reset');
          const resetAt = reset ? new Date(parseInt(reset, 10) * 1000) : undefined;

          return new RateLimitError(
            message,
            limit,
            remaining,
            resetAt,
            retryAfter
          );
        }

        return new DockerHubError(
          DockerHubErrorKind.Forbidden,
          message,
          { statusCode: 403 }
        );

      case 404:
        return new DockerHubError(
          DockerHubErrorKind.NotFound,
          message || 'Resource not found',
          { statusCode: 404 }
        );

      case 409:
        return new DockerHubError(
          DockerHubErrorKind.Conflict,
          message,
          { statusCode: 409 }
        );

      case 429:
        const retryAfter = this.parseRetryAfter(response.headers);
        return new RateLimitError(message, 0, 0, undefined, retryAfter);

      case 500:
        return new DockerHubError(
          DockerHubErrorKind.InternalError,
          message || 'Internal server error',
          { statusCode: 500 }
        );

      case 502:
        return new DockerHubError(
          DockerHubErrorKind.BadGateway,
          message || 'Bad gateway',
          { statusCode: 502 }
        );

      case 503:
        return new DockerHubError(
          DockerHubErrorKind.ServiceUnavailable,
          message || 'Service unavailable',
          { statusCode: 503 }
        );

      default:
        return new DockerHubError(
          DockerHubErrorKind.Unknown,
          message,
          { statusCode: status }
        );
    }
  }

  /**
   * Parse Retry-After header value
   */
  private parseRetryAfter(headers: Headers): number | undefined {
    const retryAfter = headers.get('Retry-After');
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        return seconds * 1000; // Convert to milliseconds
      }
    }
    return undefined;
  }
}

/**
 * Create a new Docker Hub client instance
 */
export function createClient(config: DockerHubConfig): DockerHubClient {
  return new DockerHubClientImpl(config);
}

/**
 * Create a Docker Hub client from environment variables
 */
export function createClientFromEnv(): DockerHubClient {
  const username = process.env.DOCKERHUB_USERNAME || process.env.DOCKER_USERNAME;
  const password = process.env.DOCKERHUB_PASSWORD || process.env.DOCKER_PASSWORD;
  const token = process.env.DOCKERHUB_TOKEN || process.env.DOCKER_TOKEN;

  if (!username && !token) {
    throw new AuthenticationError(
      'No Docker Hub credentials found in environment. Set DOCKERHUB_USERNAME and DOCKERHUB_PASSWORD, or DOCKERHUB_TOKEN'
    );
  }

  const config: DockerHubConfig = {
    credentials: token
      ? { token }
      : { username: username!, password: password! },
    hubBaseUrl: process.env.DOCKERHUB_HUB_URL,
    registryBaseUrl: process.env.DOCKERHUB_REGISTRY_URL,
    timeout: process.env.DOCKERHUB_TIMEOUT
      ? parseInt(process.env.DOCKERHUB_TIMEOUT, 10)
      : undefined,
    userAgent: process.env.DOCKERHUB_USER_AGENT,
    retryConfig: {
      maxRetries: process.env.DOCKERHUB_MAX_RETRIES
        ? parseInt(process.env.DOCKERHUB_MAX_RETRIES, 10)
        : 3,
      initialDelayMs: 1000,
      maxDelayMs: 60000,
      multiplier: 2,
      jitter: true,
    },
  };

  return createClient(config);
}
