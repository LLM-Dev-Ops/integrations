/**
 * Resilience patterns for the Weaviate TypeScript client.
 *
 * This module provides comprehensive fault tolerance mechanisms including:
 * - Retry with exponential backoff and jitter
 * - Circuit breaker for fast-fail protection
 * - Rate limiting with token bucket algorithm
 * - Graceful degradation for service stability
 * - Unified orchestration of all patterns
 *
 * @module resilience
 */

// ============================================================================
// Types
// ============================================================================

export type {
  BackoffStrategy,
  RetryConfig,
  ErrorRetryConfig,
  RetryPolicyConfig,
  RetryContext,
  RetryHook,
  CircuitBreakerConfig,
  CircuitBreakerStateInfo,
  CircuitStateChangeHook,
  RateLimiterAlgorithm,
  RateLimiterConfig,
  RateLimiterStateInfo,
  DegradationThresholds,
  DegradationLimits,
  DegradationConfig,
  DegradationStateInfo,
  DegradationModeChangeHook,
  ResilienceConfig,
  ResilienceHooks,
} from './types.js';

export { CircuitBreakerState, DegradationMode } from './types.js';

// ============================================================================
// Retry
// ============================================================================

export {
  RetryExecutor,
  DEFAULT_RETRY_CONFIG,
  ERROR_RETRY_CONFIGS,
  NON_RETRYABLE_ERRORS,
  DEFAULT_RETRY_POLICY_CONFIG,
} from './retry.js';

// ============================================================================
// Circuit Breaker
// ============================================================================

export {
  CircuitBreaker,
  CircuitBreakerOpenError,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from './circuit-breaker.js';

// ============================================================================
// Rate Limiter
// ============================================================================

export {
  RateLimiter,
  RateLimitExceededError,
  DEFAULT_RATE_LIMITER_CONFIG,
} from './rate-limiter.js';

// ============================================================================
// Degradation
// ============================================================================

export {
  DegradationManager,
  DEFAULT_DEGRADATION_CONFIG,
  DEFAULT_DEGRADATION_THRESHOLDS,
  DEFAULT_DEGRADATION_LIMITS,
} from './degradation.js';

// ============================================================================
// Orchestrator
// ============================================================================

export type {
  ResilienceEventHooks,
  ResilienceExecutionResult,
} from './orchestrator.js';

export { ResilienceOrchestrator } from './orchestrator.js';

// ============================================================================
// Convenience Exports
// ============================================================================

// Import types locally for use in function signatures
import { ResilienceOrchestrator } from './orchestrator.js';
import type { ResilienceConfig, ResilienceHooks, RetryPolicyConfig } from './types.js';

/**
 * Create a resilience orchestrator with default configuration
 */
export function createDefaultOrchestrator(): ResilienceOrchestrator {
  return new ResilienceOrchestrator();
}

/**
 * Create a resilience orchestrator with custom configuration
 */
export function createOrchestrator(
  config?: ResilienceConfig,
  hooks?: ResilienceHooks
): ResilienceOrchestrator {
  return new ResilienceOrchestrator(config, hooks);
}

/**
 * Create a minimal orchestrator with only retry enabled
 */
export function createRetryOnlyOrchestrator(
  retryConfig?: Partial<RetryPolicyConfig>
): ResilienceOrchestrator {
  return new ResilienceOrchestrator({
    enableRetry: true,
    enableCircuitBreaker: false,
    enableRateLimiter: false,
    enableDegradation: false,
    retry: retryConfig,
  });
}

/**
 * Create an orchestrator with all features enabled (default)
 */
export function createFullOrchestrator(
  config?: ResilienceConfig
): ResilienceOrchestrator {
  return new ResilienceOrchestrator({
    enableRetry: true,
    enableCircuitBreaker: true,
    enableRateLimiter: true,
    enableDegradation: true,
    ...config,
  });
}
