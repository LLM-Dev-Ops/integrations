/**
 * Resilience orchestrator combining retry and circuit breaker
 */
import { RetryExecutor, createDefaultRetryConfig } from './retry.js';
import { CircuitBreaker, createDefaultCircuitBreakerConfig } from './circuit-breaker.js';
import type { RetryConfig } from './retry.js';
import type { CircuitBreakerConfig } from '../config/config.js';

/**
 * Resilience configuration
 */
export interface ResilienceConfig {
  retry: RetryConfig;
  circuitBreaker: CircuitBreakerConfig;
}

/**
 * Interface for resilience orchestration
 */
export interface ResilienceOrchestrator {
  /**
   * Executes an operation with resilience patterns
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
   * Creates an orchestrator with configuration
   */
  static create(config?: Partial<ResilienceConfig>): DefaultResilienceOrchestrator {
    const retry = new RetryExecutor(config?.retry ?? createDefaultRetryConfig());
    const circuitBreaker = new CircuitBreaker(
      config?.circuitBreaker ?? createDefaultCircuitBreakerConfig()
    );

    return new DefaultResilienceOrchestrator(retry, circuitBreaker);
  }
}

/**
 * Passthrough orchestrator that executes operations directly
 */
export class PassthroughResilienceOrchestrator implements ResilienceOrchestrator {
  private readonly dummyCircuitBreaker: CircuitBreaker;
  private readonly dummyRetry: RetryExecutor;

  constructor() {
    this.dummyCircuitBreaker = new CircuitBreaker({
      enabled: false,
      failureThreshold: 0,
      successThreshold: 0,
      timeout: 0,
    });
    this.dummyRetry = new RetryExecutor({
      maxRetries: 0,
      baseDelayMs: 0,
      maxDelayMs: 0,
      backoffMultiplier: 0,
      jitterFactor: 0,
    });
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return operation();
  }

  getCircuitBreaker(): CircuitBreaker {
    return this.dummyCircuitBreaker;
  }

  getRetryExecutor(): RetryExecutor {
    return this.dummyRetry;
  }
}

/**
 * Creates default resilience configuration
 */
export function createDefaultResilienceConfig(): ResilienceConfig {
  return {
    retry: createDefaultRetryConfig(),
    circuitBreaker: createDefaultCircuitBreakerConfig(),
  };
}
