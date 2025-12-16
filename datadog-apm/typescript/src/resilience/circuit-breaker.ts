/**
 * Circuit breaker for Datadog Agent communication
 *
 * @module resilience/circuit-breaker
 */

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker options
 */
export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit */
  threshold?: number;
  /** Time in ms before attempting to reset (half-open) */
  resetTimeout?: number;
  /** Optional logger */
  logger?: {
    warn(message: string, context?: Record<string, unknown>): void;
    debug(message: string, context?: Record<string, unknown>): void;
  };
}

/**
 * Circuit breaker for protecting against cascading failures
 */
export class AgentCircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: number = 0;
  private lastFailure: number = 0;
  private threshold: number;
  private resetTimeout: number;
  private logger?: CircuitBreakerOptions['logger'];

  constructor(options?: CircuitBreakerOptions) {
    this.threshold = options?.threshold ?? 5;
    this.resetTimeout = options?.resetTimeout ?? 30000;
    this.logger = options?.logger;
  }

  /**
   * Execute an operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T | null> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'half-open';
        this.logger?.debug('Circuit breaker entering half-open state');
      } else {
        // Circuit is open, skip operation
        this.logger?.debug('Circuit breaker is open, skipping operation');
        return null;
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      return null;
    }
  }

  /**
   * Execute with fallback value
   */
  async executeWithFallback<T>(
    operation: () => Promise<T>,
    fallback: T
  ): Promise<T> {
    const result = await this.execute(operation);
    return result ?? fallback;
  }

  /**
   * Record a successful operation
   */
  private onSuccess(): void {
    this.failures = 0;
    if (this.state === 'half-open') {
      this.logger?.debug('Circuit breaker closing after successful half-open test');
    }
    this.state = 'closed';
  }

  /**
   * Record a failed operation
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();

    if (this.failures >= this.threshold && this.state !== 'open') {
      this.state = 'open';
      this.logger?.warn('Circuit breaker opened', {
        failures: this.failures,
        threshold: this.threshold,
      });
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    // Check if we should transition from open to half-open
    if (this.state === 'open' && Date.now() - this.lastFailure > this.resetTimeout) {
      return 'half-open';
    }
    return this.state;
  }

  /**
   * Get failure count
   */
  getFailureCount(): number {
    return this.failures;
  }

  /**
   * Force close the circuit (reset)
   */
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.lastFailure = 0;
    this.logger?.debug('Circuit breaker manually reset');
  }

  /**
   * Force open the circuit
   */
  trip(): void {
    this.state = 'open';
    this.lastFailure = Date.now();
    this.logger?.warn('Circuit breaker manually tripped');
  }

  /**
   * Check if circuit is open
   */
  isOpen(): boolean {
    return this.getState() === 'open';
  }

  /**
   * Check if circuit is closed
   */
  isClosed(): boolean {
    return this.getState() === 'closed';
  }
}
