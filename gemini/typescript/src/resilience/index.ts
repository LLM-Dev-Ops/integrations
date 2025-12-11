/**
 * Resilience patterns for fault-tolerant API interactions.
 *
 * This module provides retry logic with exponential backoff, circuit breaker,
 * and rate limiting to ensure robust and reliable API communication.
 *
 * @example
 * ```typescript
 * import { ResilienceOrchestrator } from '@integrations/gemini';
 *
 * const orchestrator = new ResilienceOrchestrator({
 *   retry: {
 *     maxAttempts: 3,
 *     initialDelay: 1000,
 *     maxDelay: 60000,
 *     multiplier: 2,
 *     jitter: 0.25,
 *   },
 *   circuitBreaker: {
 *     failureThreshold: 5,
 *     successThreshold: 3,
 *     openDuration: 30000,
 *     halfOpenMaxRequests: 1,
 *   },
 *   rateLimit: {
 *     requestsPerMinute: 60,
 *     tokensPerMinute: 1000000,
 *   },
 * });
 *
 * // Execute operation with resilience
 * const result = await orchestrator.execute(async () => {
 *   return await apiCall();
 * });
 * ```
 */

// Core components
export { RetryExecutor } from './retry.js';
export { CircuitBreaker, CircuitBreakerOpenError } from './circuit-breaker.js';
export { RateLimiter } from './rate-limiter.js';
export { ResilienceOrchestrator, type ResilienceConfig } from './orchestrator.js';

// Types and enums
export { CircuitState } from './types.js';
