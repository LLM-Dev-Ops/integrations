/**
 * Circuit breaker for Slack API.
 */

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half_open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  volumeThreshold: number;
  failureRateThreshold: number;
}

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
  volumeThreshold: 10,
  failureRateThreshold: 0.5,
};

/**
 * Circuit breaker error
 */
export class CircuitOpenError extends Error {
  constructor(message: string = 'Circuit breaker is open') {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private totalCount = 0;
  private lastFailureTime = 0;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    this.checkTimeout();
    return this.state;
  }

  /**
   * Check if circuit allows requests
   */
  isAllowed(): boolean {
    this.checkTimeout();
    return this.state !== 'open';
  }

  /**
   * Record success
   */
  recordSuccess(): void {
    this.totalCount++;

    if (this.state === 'half_open') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.close();
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Record failure
   */
  recordFailure(): void {
    this.totalCount++;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half_open') {
      // Any failure in half-open state reopens
      this.open();
    } else if (this.state === 'closed') {
      // Check if we should open
      if (this.shouldOpen()) {
        this.open();
      }
    }
  }

  /**
   * Execute with circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.isAllowed()) {
      throw new CircuitOpenError();
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
   * Force open the circuit
   */
  open(): void {
    this.state = 'open';
    this.successCount = 0;
  }

  /**
   * Force close the circuit
   */
  close(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.totalCount = 0;
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.close();
    this.lastFailureTime = 0;
  }

  /**
   * Get metrics
   */
  getMetrics(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    totalCount: number;
    failureRate: number;
  } {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalCount: this.totalCount,
      failureRate: this.totalCount > 0 ? this.failureCount / this.totalCount : 0,
    };
  }

  private checkTimeout(): void {
    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.timeout) {
        this.state = 'half_open';
        this.successCount = 0;
      }
    }
  }

  private shouldOpen(): boolean {
    // Check failure threshold
    if (this.failureCount >= this.config.failureThreshold) {
      return true;
    }

    // Check failure rate (only if volume threshold met)
    if (this.totalCount >= this.config.volumeThreshold) {
      const failureRate = this.failureCount / this.totalCount;
      if (failureRate >= this.config.failureRateThreshold) {
        return true;
      }
    }

    return false;
  }
}

/**
 * Create circuit breaker
 */
export function createCircuitBreaker(
  config: Partial<CircuitBreakerConfig> = {}
): CircuitBreaker {
  return new CircuitBreaker(config);
}
