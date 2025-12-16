/**
 * Type definitions for resilience patterns in the Weaviate client.
 *
 * Includes retry policies, circuit breaker configuration, rate limiting,
 * and degradation management types.
 */

// ============================================================================
// Retry Types
// ============================================================================

/**
 * Backoff strategy for retries
 */
export type BackoffStrategy = 'exponential' | 'linear' | 'constant';

/**
 * Retry configuration for a specific error type
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Backoff strategy to use */
  backoffStrategy: BackoffStrategy;
  /** Base delay in milliseconds */
  baseDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier (for exponential strategy) */
  multiplier?: number;
  /** Whether to add random jitter to delays */
  jitter?: boolean;
}

/**
 * Per-error-type retry configuration map
 */
export interface ErrorRetryConfig {
  RateLimited: RetryConfig;
  ServiceUnavailable: RetryConfig;
  InternalError: RetryConfig;
  Timeout: RetryConfig;
  ConnectionError: RetryConfig;
}

/**
 * Retry policy configuration
 */
export interface RetryPolicyConfig {
  /** Default retry configuration */
  defaultConfig: RetryConfig;
  /** Per-error-type retry configurations */
  errorConfigs?: Partial<ErrorRetryConfig>;
  /** Error types that should never be retried */
  nonRetryableErrors?: string[];
}

/**
 * Retry context passed to hooks
 */
export interface RetryContext {
  /** Current attempt number (1-indexed) */
  attempt: number;
  /** Maximum attempts allowed */
  maxAttempts: number;
  /** The error that triggered the retry */
  error: unknown;
  /** Calculated delay before next retry in milliseconds */
  delayMs: number;
  /** Timestamp when the first attempt started */
  startTime: number;
  /** Total elapsed time since first attempt */
  elapsedMs: number;
}

/**
 * Hook called before each retry attempt
 */
export type RetryHook = (context: RetryContext) => void | Promise<void>;

// ============================================================================
// Circuit Breaker Types
// ============================================================================

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
  /** Circuit is closed, requests flow normally */
  Closed = 'closed',
  /** Circuit is open, requests are rejected */
  Open = 'open',
  /** Circuit is testing if service has recovered */
  HalfOpen = 'half_open',
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Number of successes needed to close from half-open */
  successThreshold: number;
  /** Time in milliseconds before transitioning from open to half-open */
  resetTimeoutMs: number;
  /** Number of test requests to allow in half-open state */
  halfOpenRequests: number;
  /** Time window for counting failures (milliseconds) */
  monitoringWindowMs: number;
  /** Exception types that should be recorded as failures */
  recordExceptions: string[];
  /** Exception types that should be ignored */
  ignoreExceptions: string[];
}

/**
 * Circuit breaker state information
 */
export interface CircuitBreakerStateInfo {
  /** Current state */
  state: CircuitBreakerState;
  /** Number of failures in current window */
  failureCount: number;
  /** Number of successes in half-open state */
  successCount: number;
  /** Timestamp of last failure */
  lastFailureTime?: number;
  /** Timestamp when circuit opened */
  openedAt?: number;
  /** Time until reset in milliseconds (when open) */
  timeUntilReset?: number;
}

/**
 * Hook called when circuit state changes
 */
export type CircuitStateChangeHook = (
  oldState: CircuitBreakerState,
  newState: CircuitBreakerState,
  info: CircuitBreakerStateInfo
) => void | Promise<void>;

// ============================================================================
// Rate Limiter Types
// ============================================================================

/**
 * Rate limiter algorithm
 */
export type RateLimiterAlgorithm = 'token_bucket' | 'fixed_window' | 'sliding_window';

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /** Algorithm to use for rate limiting */
  algorithm: RateLimiterAlgorithm;
  /** Maximum requests allowed per window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Whether to queue requests when rate limited */
  queueRequests: boolean;
  /** Maximum number of queued requests */
  maxQueueSize: number;
  /** Whether to update limits from response headers */
  updateFromHeaders: boolean;
}

/**
 * Rate limiter state information
 */
export interface RateLimiterStateInfo {
  /** Available tokens/requests */
  available: number;
  /** Maximum capacity */
  capacity: number;
  /** Number of queued requests */
  queueSize: number;
  /** Time until next token refill in milliseconds */
  timeUntilRefillMs: number;
}

// ============================================================================
// Degradation Types
// ============================================================================

/**
 * Degradation modes
 */
export enum DegradationMode {
  /** Normal operation, no degradation */
  Normal = 'normal',
  /** Throttled operation, reduced batch sizes and limits */
  Throttled = 'throttled',
  /** Degraded operation, minimal batch sizes and limits */
  Degraded = 'degraded',
}

/**
 * Degradation thresholds
 */
export interface DegradationThresholds {
  /** Consecutive errors before entering throttled mode */
  throttledErrorThreshold: number;
  /** Consecutive errors before entering degraded mode */
  degradedErrorThreshold: number;
  /** Latency threshold for throttled mode (milliseconds) */
  throttledLatencyMs: number;
  /** Latency threshold for degraded mode (milliseconds) */
  degradedLatencyMs: number;
  /** Error rate threshold for throttled mode (0-1) */
  throttledErrorRate: number;
  /** Error rate threshold for degraded mode (0-1) */
  degradedErrorRate: number;
}

/**
 * Degradation limits for each mode
 */
export interface DegradationLimits {
  normal: {
    maxBatchSize: number;
    maxSearchLimit: number;
  };
  throttled: {
    maxBatchSize: number;
    maxSearchLimit: number;
  };
  degraded: {
    maxBatchSize: number;
    maxSearchLimit: number;
  };
}

/**
 * Degradation manager configuration
 */
export interface DegradationConfig {
  /** Degradation thresholds */
  thresholds: DegradationThresholds;
  /** Degradation limits per mode */
  limits: DegradationLimits;
  /** Time window for error rate calculation (milliseconds) */
  errorRateWindowMs: number;
}

/**
 * Degradation state information
 */
export interface DegradationStateInfo {
  /** Current mode */
  mode: DegradationMode;
  /** Consecutive errors */
  consecutiveErrors: number;
  /** Recent latency measurements */
  recentLatencyMs: number[];
  /** Current error rate (0-1) */
  errorRate: number;
  /** Current batch size limit */
  currentBatchSize: number;
  /** Current search limit */
  currentSearchLimit: number;
}

/**
 * Hook called when degradation mode changes
 */
export type DegradationModeChangeHook = (
  oldMode: DegradationMode,
  newMode: DegradationMode,
  info: DegradationStateInfo
) => void | Promise<void>;

// ============================================================================
// Resilience Configuration
// ============================================================================

/**
 * Combined resilience configuration
 */
export interface ResilienceConfig {
  /** Retry policy configuration */
  retry?: Partial<RetryPolicyConfig>;
  /** Circuit breaker configuration */
  circuitBreaker?: Partial<CircuitBreakerConfig>;
  /** Rate limiter configuration */
  rateLimiter?: Partial<RateLimiterConfig>;
  /** Degradation configuration */
  degradation?: Partial<DegradationConfig>;
  /** Whether to enable retry mechanism */
  enableRetry?: boolean;
  /** Whether to enable circuit breaker */
  enableCircuitBreaker?: boolean;
  /** Whether to enable rate limiter */
  enableRateLimiter?: boolean;
  /** Whether to enable degradation manager */
  enableDegradation?: boolean;
}

/**
 * Event hooks for monitoring resilience patterns
 */
export interface ResilienceHooks {
  /** Called before each retry */
  onRetry?: RetryHook;
  /** Called when circuit state changes */
  onCircuitStateChange?: CircuitStateChangeHook;
  /** Called when degradation mode changes */
  onDegradationModeChange?: DegradationModeChangeHook;
}
