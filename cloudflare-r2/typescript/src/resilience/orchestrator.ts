/**
 * Resilience orchestrator combining retry and circuit breaker patterns
 */

import { RetryExecutor, createRetryExecutor, createDefaultRetryExecutor } from './retry.js';
import { CircuitBreaker, createCircuitBreaker, createDefaultCircuitBreaker } from './circuit-breaker.js';
import type { R2RetryConfig, R2CircuitBreakerConfig } from '../config/index.js';

/**
 * Resilience orchestrator interface
 */
export interface ResilienceOrchestrator {
  /**
   * Executes an operation with resilience patterns applied
   */
  execute<T>(operation: () => Promise<T>): Promise<T>;

  /**
   * Gets the circuit breaker instance
   */
  getCircuitBreaker(): CircuitBreaker;

  /**
   * Gets the retry executor instance
   */
  getRetryExecutor(): RetryExecutor;
}

/**
 * Default resilience orchestrator implementation
 *
 * Execution order:
 * 1. Circuit breaker - Check if circuit is open
 * 2. Retry executor - Execute with retry logic
 *
 * This ensures we don't waste retries when the circuit is open.
 */
export class DefaultResilienceOrchestrator implements ResilienceOrchestrator {
  private readonly retry: RetryExecutor;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(retry: RetryExecutor, circuitBreaker: CircuitBreaker) {
    this.retry = retry;
    this.circuitBreaker = circuitBreaker;
  }

  /**
   * Executes an operation through all resilience layers
   *
   * Circuit breaker wraps retry logic to prevent cascading failures.
   * If circuit is open, the operation is rejected immediately without retries.
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(() => this.retry.execute(operation));
  }

  /**
   * Gets the circuit breaker instance
   */
  getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  /**
   * Gets the retry executor instance
   */
  getRetryExecutor(): RetryExecutor {
    return this.retry;
  }

  /**
   * Creates an orchestrator with default configuration
   */
  static createDefault(): DefaultResilienceOrchestrator {
    return new DefaultResilienceOrchestrator(
      createDefaultRetryExecutor(),
      createDefaultCircuitBreaker()
    );
  }

  /**
   * Creates an orchestrator with custom configuration
   */
  static create(
    retryConfig: R2RetryConfig,
    circuitBreakerConfig: R2CircuitBreakerConfig
  ): DefaultResilienceOrchestrator {
    return new DefaultResilienceOrchestrator(
      createRetryExecutor(retryConfig),
      createCircuitBreaker(circuitBreakerConfig)
    );
  }
}

/**
 * Passthrough orchestrator that executes operations directly without resilience
 *
 * Useful for testing or when resilience features need to be disabled.
 */
export class PassthroughOrchestrator implements ResilienceOrchestrator {
  private readonly dummyCircuitBreaker: CircuitBreaker;
  private readonly dummyRetry: RetryExecutor;

  constructor() {
    // Create disabled instances for interface compatibility
    this.dummyCircuitBreaker = new CircuitBreaker({
      enabled: false,
      failureThreshold: 0,
      successThreshold: 0,
      resetTimeout: 0,
    });

    this.dummyRetry = new RetryExecutor({
      maxRetries: 0,
      baseDelayMs: 0,
      maxDelayMs: 0,
      jitterFactor: 0,
    });
  }

  /**
   * Executes operation directly without any resilience patterns
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return operation();
  }

  /**
   * Gets a dummy circuit breaker (disabled)
   */
  getCircuitBreaker(): CircuitBreaker {
    return this.dummyCircuitBreaker;
  }

  /**
   * Gets a dummy retry executor (no retries)
   */
  getRetryExecutor(): RetryExecutor {
    return this.dummyRetry;
  }
}

/**
 * Creates a resilience orchestrator with custom configuration
 */
export function createResilienceOrchestrator(
  retryConfig: R2RetryConfig,
  circuitBreakerConfig: R2CircuitBreakerConfig
): ResilienceOrchestrator {
  return DefaultResilienceOrchestrator.create(retryConfig, circuitBreakerConfig);
}

/**
 * Creates a default resilience orchestrator
 */
export function createDefaultResilienceOrchestrator(): ResilienceOrchestrator {
  return DefaultResilienceOrchestrator.createDefault();
}

/**
 * Creates a passthrough orchestrator (no resilience)
 */
export function createPassthroughOrchestrator(): ResilienceOrchestrator {
  return new PassthroughOrchestrator();
}
