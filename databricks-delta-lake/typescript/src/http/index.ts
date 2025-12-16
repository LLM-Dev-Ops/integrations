/**
 * HTTP client with resilience patterns for Databricks Delta Lake.
 *
 * This module provides:
 * - HTTP request execution with authentication
 * - Circuit breaker for fault tolerance
 * - Adaptive rate limiting per endpoint
 * - Retry with exponential backoff
 * - Request/response parsing
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * HTTP method types
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * HTTP request options
 */
export interface HttpRequestOptions {
  method: HttpMethod;
  path: string;
  body?: unknown;
  timeout?: number;
  headers?: Record<string, string>;
}

/**
 * HTTP response wrapper
 */
export interface HttpResponse<T = unknown> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

/**
 * Databricks error response
 */
export interface DatabricksErrorResponse {
  error_code?: string;
  message: string;
  details?: unknown;
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base Databricks HTTP error
 */
export class DatabricksHttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'DatabricksHttpError';
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends DatabricksHttpError {
  constructor(
    message: string,
    public readonly retryAfter?: number
  ) {
    super(message, 429, 'RATE_LIMITED');
    this.name = 'RateLimitError';
  }
}

/**
 * Service unavailable error
 */
export class ServiceUnavailableError extends DatabricksHttpError {
  constructor(message: string) {
    super(message, 503, 'SERVICE_UNAVAILABLE');
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends DatabricksHttpError {
  constructor(message: string) {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'AuthenticationError';
  }
}

/**
 * Circuit breaker open error
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Concurrent modification error
 */
export class ConcurrentModificationError extends DatabricksHttpError {
  constructor(message: string) {
    super(message, 409, 'RESOURCE_CONFLICT');
    this.name = 'ConcurrentModificationError';
  }
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof RateLimitError) return true;
  if (error instanceof ServiceUnavailableError) return true;
  if (error instanceof ConcurrentModificationError) return true;
  if (error instanceof DatabricksHttpError) {
    return error.statusCode >= 500 || error.statusCode === 429 || error.statusCode === 409;
  }
  return false;
}

// ============================================================================
// Retry Executor
// ============================================================================

/**
 * Retry configuration for different error types
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  multiplier: number;
  maxDelayMs: number;
}

/**
 * Default retry configurations by error type
 */
const RETRY_CONFIGS: Record<string, RetryConfig> = {
  RATE_LIMITED: {
    maxAttempts: 5,
    initialDelayMs: 1000,
    multiplier: 2,
    maxDelayMs: 60000,
  },
  SERVICE_UNAVAILABLE: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    multiplier: 2,
    maxDelayMs: 30000,
  },
  INTERNAL_ERROR: {
    maxAttempts: 3,
    initialDelayMs: 500,
    multiplier: 2,
    maxDelayMs: 10000,
  },
  CONCURRENT_MODIFICATION: {
    maxAttempts: 3,
    initialDelayMs: 100,
    multiplier: 2,
    maxDelayMs: 5000,
  },
  TOKEN_EXPIRED: {
    maxAttempts: 1,
    initialDelayMs: 0,
    multiplier: 1,
    maxDelayMs: 0,
  },
};

/**
 * Retry executor with exponential backoff
 */
export class RetryExecutor {
  /**
   * Execute function with retry logic
   */
  async execute<T>(
    fn: () => Promise<T>,
    errorType: string = 'INTERNAL_ERROR'
  ): Promise<T> {
    const config = RETRY_CONFIGS[errorType] || RETRY_CONFIGS.INTERNAL_ERROR;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on last attempt
        if (attempt >= config.maxAttempts) {
          throw error;
        }

        // Check if error is retryable
        if (!isRetryableError(error)) {
          throw error;
        }

        // Calculate delay
        let delayMs = config.initialDelayMs * Math.pow(config.multiplier, attempt - 1);
        delayMs = Math.min(delayMs, config.maxDelayMs);

        // Respect Retry-After header for rate limits
        if (error instanceof RateLimitError && error.retryAfter) {
          delayMs = error.retryAfter * 1000;
        }

        // Add jitter (±25%)
        const jitterFactor = 0.75 + Math.random() * 0.5;
        delayMs = Math.floor(delayMs * jitterFactor);

        // Wait before retry
        await this.delay(delayMs);
      }
    }

    throw lastError || new Error('Retry exhausted');
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/**
 * Circuit breaker states
 */
export enum CircuitState {
  Closed = 'closed',
  Open = 'open',
  HalfOpen = 'half_open',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  resetTimeoutMs: number;
}

/**
 * Circuit breaker for fault tolerance
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.Closed;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private failures: number[] = [];

  constructor(
    private readonly config: CircuitBreakerConfig = {
      failureThreshold: 5,
      successThreshold: 2,
      resetTimeoutMs: 60000,
    }
  ) {}

  /**
   * Get current state
   */
  getState(): CircuitState {
    this.updateState();
    return this.state;
  }

  /**
   * Check if request can proceed
   */
  canExecute(): boolean {
    this.updateState();
    return this.state !== CircuitState.Open;
  }

  /**
   * Execute with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new CircuitBreakerOpenError();
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Record successful request
   */
  recordSuccess(): void {
    if (this.state === CircuitState.HalfOpen) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.reset();
      }
    } else if (this.state === CircuitState.Closed) {
      // Clean up old failures
      this.failures = [];
    }
  }

  /**
   * Record failed request
   */
  recordFailure(): void {
    const now = Date.now();
    this.lastFailureTime = now;
    this.failures.push(now);

    // Keep only recent failures (last 5 minutes)
    const fiveMinutesAgo = now - 300000;
    this.failures = this.failures.filter((t) => t > fiveMinutesAgo);

    if (this.state === CircuitState.HalfOpen) {
      this.trip();
    } else if (this.failures.length >= this.config.failureThreshold) {
      this.trip();
    }
  }

  /**
   * Update state based on time
   */
  private updateState(): void {
    if (this.state === CircuitState.Open) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.state = CircuitState.HalfOpen;
        this.successCount = 0;
      }
    }
  }

  /**
   * Trip the circuit breaker
   */
  private trip(): void {
    this.state = CircuitState.Open;
    this.failureCount = 0;
    this.successCount = 0;
  }

  /**
   * Reset the circuit breaker
   */
  private reset(): void {
    this.state = CircuitState.Closed;
    this.failureCount = 0;
    this.successCount = 0;
    this.failures = [];
  }
}

// ============================================================================
// Adaptive Rate Limiter
// ============================================================================

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  requestsPerMinute: number;
  adaptiveBackoff: boolean;
  minRate: number;
}

/**
 * Adaptive token bucket rate limiter
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private currentRate: number;

  constructor(private readonly config: RateLimiterConfig) {
    this.tokens = config.requestsPerMinute;
    this.lastRefill = Date.now();
    this.currentRate = config.requestsPerMinute;
  }

  /**
   * Acquire a token (blocks until available)
   */
  async acquire(): Promise<void> {
    while (true) {
      this.refillTokens();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      // Wait for next token
      const waitMs = (60000 / this.currentRate) * 1000;
      await this.delay(Math.min(waitMs, 1000));
    }
  }

  /**
   * Handle rate limit response
   */
  onRateLimit(retryAfter?: number): void {
    if (this.config.adaptiveBackoff) {
      // Reduce rate by 50%
      this.currentRate = Math.max(
        this.currentRate * 0.5,
        this.config.minRate
      );
    }
  }

  /**
   * Handle successful response
   */
  onSuccess(): void {
    if (this.config.adaptiveBackoff) {
      // Gradually increase rate by 10%
      this.currentRate = Math.min(
        this.currentRate * 1.1,
        this.config.requestsPerMinute
      );
    }
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefill;

    if (elapsedMs >= 60000) {
      // Full refill every minute
      this.tokens = this.currentRate;
      this.lastRefill = now;
    } else {
      // Partial refill (linear)
      const refillRate = this.currentRate / 60000; // tokens per ms
      const tokensToAdd = elapsedMs * refillRate;
      if (tokensToAdd >= 1) {
        this.tokens = Math.min(this.tokens + Math.floor(tokensToAdd), this.currentRate);
        this.lastRefill = now;
      }
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Per-Endpoint Rate Limiters
// ============================================================================

/**
 * Rate limiter manager for different endpoints
 */
export class EndpointRateLimiters {
  private limiters: Map<string, RateLimiter> = new Map();

  constructor() {
    // Databricks API rate limits (requests per minute)
    this.limiters.set('/jobs/runs/submit', new RateLimiter({
      requestsPerMinute: 100,
      adaptiveBackoff: true,
      minRate: 10,
    }));

    this.limiters.set('/jobs/runs/get', new RateLimiter({
      requestsPerMinute: 1000,
      adaptiveBackoff: true,
      minRate: 100,
    }));

    this.limiters.set('/sql/statements', new RateLimiter({
      requestsPerMinute: 200,
      adaptiveBackoff: true,
      minRate: 20,
    }));

    this.limiters.set('/unity-catalog', new RateLimiter({
      requestsPerMinute: 500,
      adaptiveBackoff: true,
      minRate: 50,
    }));

    // Default limiter
    this.limiters.set('_default', new RateLimiter({
      requestsPerMinute: 100,
      adaptiveBackoff: true,
      minRate: 10,
    }));
  }

  /**
   * Get rate limiter for endpoint
   */
  getLimiter(path: string): RateLimiter {
    // Match endpoint prefix
    for (const [prefix, limiter] of this.limiters.entries()) {
      if (path.startsWith(prefix)) {
        return limiter;
      }
    }
    return this.limiters.get('_default')!;
  }
}

// ============================================================================
// Resilience Orchestrator
// ============================================================================

/**
 * Orchestrates all resilience patterns
 */
export class ResilienceOrchestrator {
  private readonly retry: RetryExecutor;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly rateLimiters: EndpointRateLimiters;

  constructor(
    retryConfig?: Record<string, RetryConfig>,
    circuitBreakerConfig?: CircuitBreakerConfig
  ) {
    this.retry = new RetryExecutor();
    this.circuitBreaker = new CircuitBreaker(circuitBreakerConfig);
    this.rateLimiters = new EndpointRateLimiters();
  }

  /**
   * Execute with all resilience patterns
   */
  async execute<T>(
    path: string,
    fn: () => Promise<T>,
    errorType: string = 'INTERNAL_ERROR'
  ): Promise<T> {
    // Apply rate limiting first
    const rateLimiter = this.rateLimiters.getLimiter(path);
    await rateLimiter.acquire();

    // Check circuit breaker
    if (!this.circuitBreaker.canExecute()) {
      throw new CircuitBreakerOpenError();
    }

    // Execute with retry
    try {
      const result = await this.retry.execute(async () => {
        return await this.circuitBreaker.execute(fn);
      }, errorType);

      rateLimiter.onSuccess();
      return result;
    } catch (error) {
      if (error instanceof RateLimitError) {
        rateLimiter.onRateLimit(error.retryAfter);
      }
      throw error;
    }
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }
}

// ============================================================================
// Operation Timeouts
// ============================================================================

/**
 * Default timeouts for different operations (in milliseconds)
 */
export const OPERATION_TIMEOUTS: Record<string, number> = {
  'jobs.submit': 30000,        // 30s
  'jobs.status': 10000,        // 10s
  'sql.execute': 300000,       // 300s (5 minutes)
  'sql.chunk': 60000,          // 60s
  'delta.read': 120000,        // 120s (2 minutes)
  'delta.write': 300000,       // 300s (5 minutes)
  'default': 30000,            // 30s
};

/**
 * Get timeout for operation
 */
export function getOperationTimeout(path: string): number {
  if (path.includes('/jobs/runs/submit')) return OPERATION_TIMEOUTS['jobs.submit'];
  if (path.includes('/jobs/runs/get')) return OPERATION_TIMEOUTS['jobs.status'];
  if (path.includes('/sql/statements') && !path.includes('/chunks')) {
    return OPERATION_TIMEOUTS['sql.execute'];
  }
  if (path.includes('/chunks')) return OPERATION_TIMEOUTS['sql.chunk'];
  return OPERATION_TIMEOUTS['default'];
}

// ============================================================================
// Auth Provider Interface
// ============================================================================

/**
 * Authentication provider interface
 */
export interface AuthProvider {
  /**
   * Get authentication token
   */
  getToken(): Promise<string>;

  /**
   * Refresh authentication token
   */
  refreshToken(): Promise<void>;
}

// ============================================================================
// HTTP Executor
// ============================================================================

/**
 * HTTP executor configuration
 */
export interface HttpExecutorConfig {
  workspaceUrl: string;
  authProvider: AuthProvider;
  baseTimeout?: number;
  resilience?: {
    retry?: Record<string, RetryConfig>;
    circuitBreaker?: CircuitBreakerConfig;
  };
}

/**
 * HTTP executor with resilience patterns
 */
export class HttpExecutor {
  private readonly workspaceUrl: string;
  private readonly authProvider: AuthProvider;
  private readonly baseTimeout: number;
  private readonly resilience: ResilienceOrchestrator;

  constructor(config: HttpExecutorConfig) {
    this.workspaceUrl = config.workspaceUrl.replace(/\/$/, '');
    this.authProvider = config.authProvider;
    this.baseTimeout = config.baseTimeout || 30000;
    this.resilience = new ResilienceOrchestrator(
      config.resilience?.retry,
      config.resilience?.circuitBreaker
    );
  }

  /**
   * Execute HTTP request
   */
  async request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    options?: { timeout?: number; headers?: Record<string, string> }
  ): Promise<T> {
    // Build full URL
    const url = `${this.workspaceUrl}/api/2.1${path}`;

    // Determine timeout
    const timeout = options?.timeout || getOperationTimeout(path);

    // Determine error type for retry
    const errorType = this.determineErrorType(path);

    // Execute with resilience
    return await this.resilience.execute(
      path,
      async () => {
        return await this.executeRequest<T>(method, url, body, timeout, options?.headers);
      },
      errorType
    );
  }

  /**
   * Execute single HTTP request
   */
  private async executeRequest<T>(
    method: HttpMethod,
    url: string,
    body: unknown,
    timeout: number,
    additionalHeaders?: Record<string, string>
  ): Promise<T> {
    // Get auth token
    const token = await this.authProvider.getToken();

    // Build headers
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'databricks-delta-lake-integration/1.0.0',
      ...additionalHeaders,
    };

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Execute request
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle response
      return await this.handleResponse<T>(response);
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort
      if (error instanceof Error && error.name === 'AbortError') {
        throw new DatabricksHttpError('Request timeout', 408, 'TIMEOUT');
      }

      throw error;
    }
  }

  /**
   * Handle HTTP response
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    // Success (2xx)
    if (response.ok) {
      // Handle empty responses
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return {} as T;
      }
      return await response.json();
    }

    // Parse error response
    let errorData: DatabricksErrorResponse;
    try {
      errorData = await response.json();
    } catch {
      errorData = {
        message: response.statusText || 'Unknown error',
      };
    }

    const message = errorData.message || 'Unknown error';
    const errorCode = errorData.error_code;

    // Handle specific error codes
    switch (response.status) {
      case 401:
        // Try to refresh token
        try {
          await this.authProvider.refreshToken();
          throw new AuthenticationError('Token expired, refreshed');
        } catch {
          throw new AuthenticationError(message);
        }

      case 429:
        // Rate limited
        const retryAfter = response.headers.get('retry-after');
        const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;
        throw new RateLimitError(message, retryAfterSeconds);

      case 503:
        throw new ServiceUnavailableError(message);

      case 409:
        if (errorCode === 'RESOURCE_CONFLICT') {
          throw new ConcurrentModificationError(message);
        }
        throw new DatabricksHttpError(message, response.status, errorCode, errorData.details);

      case 400:
      case 403:
      case 404:
        // Non-retryable client errors
        throw new DatabricksHttpError(message, response.status, errorCode, errorData.details);

      default:
        // Server errors (5xx) or other errors
        throw new DatabricksHttpError(message, response.status, errorCode, errorData.details);
    }
  }

  /**
   * Determine error type for retry configuration
   */
  private determineErrorType(path: string): string {
    if (path.includes('/sql/')) return 'INTERNAL_ERROR';
    if (path.includes('/jobs/')) return 'SERVICE_UNAVAILABLE';
    return 'INTERNAL_ERROR';
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(): CircuitState {
    return this.resilience.getCircuitState();
  }

  /**
   * Make GET request
   */
  async get<T>(path: string, options?: { timeout?: number; headers?: Record<string, string> }): Promise<T> {
    return this.request<T>('GET', path, undefined, options);
  }

  /**
   * Make POST request
   */
  async post<T>(path: string, body?: unknown, options?: { timeout?: number; headers?: Record<string, string> }): Promise<T> {
    return this.request<T>('POST', path, body, options);
  }

  /**
   * Make PUT request
   */
  async put<T>(path: string, body?: unknown, options?: { timeout?: number; headers?: Record<string, string> }): Promise<T> {
    return this.request<T>('PUT', path, body, options);
  }

  /**
   * Make PATCH request
   */
  async patch<T>(path: string, body?: unknown, options?: { timeout?: number; headers?: Record<string, string> }): Promise<T> {
    return this.request<T>('PATCH', path, body, options);
  }

  /**
   * Make DELETE request
   */
  async delete<T>(path: string, options?: { timeout?: number; headers?: Record<string, string> }): Promise<T> {
    return this.request<T>('DELETE', path, undefined, options);
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  HttpExecutor,
  ResilienceOrchestrator,
  RetryExecutor,
  CircuitBreaker,
  RateLimiter,
  EndpointRateLimiters,
};
