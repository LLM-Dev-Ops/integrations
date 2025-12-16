/**
 * Resilience orchestrator that combines all resilience patterns.
 *
 * Coordinates retry logic, circuit breaker, rate limiter, and degradation
 * management in a unified execution flow.
 */

import { RetryExecutor } from './retry.js';
import { CircuitBreaker, CircuitBreakerOpenError } from './circuit-breaker.js';
import { RateLimiter } from './rate-limiter.js';
import { DegradationManager } from './degradation.js';
import {
  ResilienceConfig,
  ResilienceHooks,
  CircuitBreakerState,
  DegradationMode,
} from './types.js';

// ============================================================================
// Resilience Orchestrator
// ============================================================================

/**
 * Event hooks for resilience operations
 */
export interface ResilienceEventHooks extends ResilienceHooks {
  /** Called before operation execution */
  onExecuteStart?: () => void | Promise<void>;
  /** Called after successful execution */
  onExecuteSuccess?: (latencyMs: number) => void | Promise<void>;
  /** Called after failed execution */
  onExecuteError?: (error: unknown, latencyMs: number) => void | Promise<void>;
}

/**
 * Execution result with resilience metadata
 */
export interface ResilienceExecutionResult<T> {
  /** The result value */
  value: T;
  /** Total execution time including retries */
  totalLatencyMs: number;
  /** Number of attempts made */
  attempts: number;
  /** Whether circuit breaker was triggered */
  circuitBreakerTriggered: boolean;
  /** Whether rate limiter delayed the request */
  rateLimited: boolean;
  /** Current degradation mode */
  degradationMode: DegradationMode;
}

/**
 * Orchestrates all resilience patterns for unified fault tolerance
 */
export class ResilienceOrchestrator {
  private readonly retry?: RetryExecutor;
  private readonly circuitBreaker?: CircuitBreaker;
  private readonly rateLimiter?: RateLimiter;
  private readonly degradation?: DegradationManager;
  private readonly config: Required<
    Pick<
      ResilienceConfig,
      | 'enableRetry'
      | 'enableCircuitBreaker'
      | 'enableRateLimiter'
      | 'enableDegradation'
    >
  >;
  private readonly hooks: ResilienceEventHooks = {};

  constructor(config?: ResilienceConfig, hooks?: ResilienceEventHooks) {
    // Set defaults
    this.config = {
      enableRetry: config?.enableRetry ?? true,
      enableCircuitBreaker: config?.enableCircuitBreaker ?? true,
      enableRateLimiter: config?.enableRateLimiter ?? true,
      enableDegradation: config?.enableDegradation ?? true,
    };

    // Initialize components based on configuration
    if (this.config.enableRetry) {
      this.retry = new RetryExecutor(config?.retry);
      if (hooks?.onRetry) {
        this.retry.addHook(hooks.onRetry);
      }
    }

    if (this.config.enableCircuitBreaker) {
      this.circuitBreaker = new CircuitBreaker(config?.circuitBreaker);
      if (hooks?.onCircuitStateChange) {
        this.circuitBreaker.addHook(hooks.onCircuitStateChange);
      }
    }

    if (this.config.enableRateLimiter) {
      this.rateLimiter = new RateLimiter(config?.rateLimiter);
    }

    if (this.config.enableDegradation) {
      this.degradation = new DegradationManager(config?.degradation);
      if (hooks?.onDegradationModeChange) {
        this.degradation.addHook(hooks.onDegradationModeChange);
      }
    }

    this.hooks = hooks ?? {};
  }

  /**
   * Execute a function with all enabled resilience patterns
   *
   * Execution order:
   * 1. Rate Limiter - Ensure we don't exceed rate limits
   * 2. Circuit Breaker - Fast-fail if service is known to be down
   * 3. Retry - Retry transient failures with backoff
   * 4. Degradation - Track success/failure for adaptive behavior
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    let attempts = 0;
    let circuitBreakerTriggered = false;
    let rateLimited = false;

    try {
      // Hook: Execute start
      await this.hooks.onExecuteStart?.();

      // Step 1: Rate Limiter
      if (this.rateLimiter) {
        await this.rateLimiter.acquire();
        rateLimited = true;
      }

      // Step 2: Circuit Breaker check
      if (this.circuitBreaker && !this.circuitBreaker.allowRequest()) {
        circuitBreakerTriggered = true;
        throw new CircuitBreakerOpenError('Circuit breaker is open');
      }

      // Step 3: Execute with retry
      let result: T;
      if (this.retry) {
        // Execute with retry logic
        result = await this.retry.execute(async () => {
          attempts++;
          // Execute with circuit breaker protection
          if (this.circuitBreaker) {
            return await this.circuitBreaker.execute(fn);
          }
          return await fn();
        });
      } else if (this.circuitBreaker) {
        // Execute with circuit breaker only
        attempts++;
        result = await this.circuitBreaker.execute(fn);
      } else {
        // Execute directly
        attempts++;
        result = await fn();
      }

      // Step 4: Record success in degradation manager
      const latency = Date.now() - startTime;
      if (this.degradation) {
        this.degradation.onSuccess(latency);
      }

      // Hook: Execute success
      await this.hooks.onExecuteSuccess?.(latency);

      return result;
    } catch (error) {
      // Record failure in degradation manager
      const latency = Date.now() - startTime;
      if (this.degradation) {
        this.degradation.onError(error);
      }

      // Hook: Execute error
      await this.hooks.onExecuteError?.(error, latency);

      throw error;
    }
  }

  /**
   * Execute with metadata about the resilience execution
   */
  async executeWithMetadata<T>(
    fn: () => Promise<T>
  ): Promise<ResilienceExecutionResult<T>> {
    const startTime = Date.now();
    let attempts = 0;
    let circuitBreakerTriggered = false;
    let rateLimited = false;

    // Track attempts using a wrapper
    const wrappedFn = async () => {
      attempts++;
      return await fn();
    };

    try {
      const value = await this.execute(wrappedFn);
      const totalLatencyMs = Date.now() - startTime;

      return {
        value,
        totalLatencyMs,
        attempts,
        circuitBreakerTriggered,
        rateLimited,
        degradationMode: this.degradation?.getMode() ?? DegradationMode.Normal,
      };
    } catch (error) {
      // Check if circuit breaker was the cause
      if (error instanceof CircuitBreakerOpenError) {
        circuitBreakerTriggered = true;
      }

      throw error;
    }
  }

  /**
   * Update rate limits from response headers
   */
  updateRateLimitsFromHeaders(headers: Headers | Record<string, string>): void {
    this.rateLimiter?.updateFromHeaders(headers);
  }

  /**
   * Get adjusted batch size based on degradation mode
   */
  adjustBatchSize(requestedSize: number): number {
    if (!this.degradation) {
      return requestedSize;
    }
    return this.degradation.adjustBatchSize(requestedSize);
  }

  /**
   * Get adjusted search limit based on degradation mode
   */
  adjustSearchLimit(requestedLimit: number): number {
    if (!this.degradation) {
      return requestedLimit;
    }
    return this.degradation.adjustSearchLimit(requestedLimit);
  }

  /**
   * Check if vectors should be included in response
   */
  shouldIncludeVector(): boolean {
    if (!this.degradation) {
      return true;
    }
    return this.degradation.shouldIncludeVector();
  }

  /**
   * Get current circuit breaker state
   */
  getCircuitBreakerState(): CircuitBreakerState | undefined {
    return this.circuitBreaker?.getState();
  }

  /**
   * Get current degradation mode
   */
  getDegradationMode(): DegradationMode | undefined {
    return this.degradation?.getMode();
  }

  /**
   * Get retry executor (if enabled)
   */
  getRetry(): RetryExecutor | undefined {
    return this.retry;
  }

  /**
   * Get circuit breaker (if enabled)
   */
  getCircuitBreaker(): CircuitBreaker | undefined {
    return this.circuitBreaker;
  }

  /**
   * Get rate limiter (if enabled)
   */
  getRateLimiter(): RateLimiter | undefined {
    return this.rateLimiter;
  }

  /**
   * Get degradation manager (if enabled)
   */
  getDegradationManager(): DegradationManager | undefined {
    return this.degradation;
  }

  /**
   * Reset all resilience components
   */
  reset(): void {
    this.circuitBreaker?.reset();
    this.rateLimiter?.reset();
    this.degradation?.reset();
  }

  /**
   * Get overall health status
   */
  getHealthStatus(): {
    circuitBreaker?: { state: CircuitBreakerState; healthy: boolean };
    rateLimiter?: { available: number; healthy: boolean };
    degradation?: { mode: DegradationMode; healthy: boolean };
  } {
    const status: ReturnType<typeof this.getHealthStatus> = {};

    if (this.circuitBreaker) {
      const state = this.circuitBreaker.getState();
      status.circuitBreaker = {
        state,
        healthy: state === CircuitBreakerState.Closed,
      };
    }

    if (this.rateLimiter) {
      const rateLimiterState = this.rateLimiter.getState();
      status.rateLimiter = {
        available: rateLimiterState.available,
        healthy: rateLimiterState.available > 0,
      };
    }

    if (this.degradation) {
      const mode = this.degradation.getMode();
      status.degradation = {
        mode,
        healthy: mode === DegradationMode.Normal,
      };
    }

    return status;
  }
}
