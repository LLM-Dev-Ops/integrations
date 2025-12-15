/**
 * Circuit Breaker Implementation for vLLM
 * Prevents cascading failures by failing fast when errors exceed threshold
 */

import type { CircuitBreakerConfig } from '../types/index.js';
import { CircuitOpenError } from '../types/errors.js';

export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitBreakerHook {
  onStateChange(from: CircuitState, to: CircuitState): void;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | undefined;
  config: CircuitBreakerConfig;
  timeUntilHalfOpen: number | undefined;
}

/**
 * Circuit breaker that prevents cascading failures by failing fast
 *
 * States:
 * - Closed: Normal operation, tracks failures
 * - Open: Fails fast, rejects all requests immediately
 * - Half-Open: Allows test requests through to check if service recovered
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | undefined = undefined;
  private readonly config: CircuitBreakerConfig;
  private hooks: CircuitBreakerHook[] = [];
  private readonly serverId: string;

  constructor(serverId: string, config: CircuitBreakerConfig) {
    this.serverId = serverId;
    this.config = config;
  }

  /**
   * Add a hook to be called on state changes
   */
  addHook(hook: CircuitBreakerHook): void {
    this.hooks.push(hook);
  }

  /**
   * Check if a request can proceed
   * @throws CircuitOpenError if circuit is open
   */
  check(): void {
    this.checkStateTransition();

    if (this.state === 'open') {
      throw new CircuitOpenError(
        this.serverId,
        this.getTimeUntilHalfOpen()
      );
    }
  }

  /**
   * Execute an operation through the circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.check();

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Record a successful operation
   */
  recordSuccess(): void {
    if (this.state === 'half_open') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo('closed');
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed operation
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half_open') {
      // Any failure in half-open state reopens the circuit
      this.transitionTo('open');
    } else if (this.state === 'closed' && this.failureCount >= this.config.failureThreshold) {
      this.transitionTo('open');
    }
  }

  /**
   * Get the current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get comprehensive statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      config: { ...this.config },
      timeUntilHalfOpen: this.getTimeUntilHalfOpen(),
    };
  }

  /**
   * Reset to closed state
   */
  reset(): void {
    this.transitionTo('closed');
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
  }

  private checkStateTransition(): void {
    if (this.state === 'open' && this.shouldTransitionToHalfOpen()) {
      this.transitionTo('half_open');
    }
  }

  private shouldTransitionToHalfOpen(): boolean {
    if (!this.lastFailureTime) return false;
    return Date.now() - this.lastFailureTime >= this.config.openDurationMs;
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;

    // Reset counters based on new state
    if (newState === 'closed') {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === 'half_open') {
      this.successCount = 0;
    } else if (newState === 'open') {
      this.successCount = 0;
    }

    // Notify hooks
    for (const hook of this.hooks) {
      hook.onStateChange(oldState, newState);
    }
  }

  private getTimeUntilHalfOpen(): number | undefined {
    if (this.state !== 'open' || !this.lastFailureTime) {
      return undefined;
    }
    const elapsed = Date.now() - this.lastFailureTime;
    const remaining = this.config.openDurationMs - elapsed;
    return remaining > 0 ? remaining : 0;
  }
}

/**
 * Manage circuit breakers for multiple servers
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private readonly config: CircuitBreakerConfig;
  private globalHooks: CircuitBreakerHook[] = [];

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  /**
   * Get or create a circuit breaker for a server
   */
  get(serverId: string): CircuitBreaker {
    let breaker = this.breakers.get(serverId);
    if (!breaker) {
      breaker = new CircuitBreaker(serverId, this.config);
      for (const hook of this.globalHooks) {
        breaker.addHook(hook);
      }
      this.breakers.set(serverId, breaker);
    }
    return breaker;
  }

  /**
   * Add a hook to all current and future circuit breakers
   */
  addGlobalHook(hook: CircuitBreakerHook): void {
    this.globalHooks.push(hook);
    for (const breaker of this.breakers.values()) {
      breaker.addHook(hook);
    }
  }

  /**
   * Get stats for all servers
   */
  getAllStats(): Map<string, CircuitBreakerStats> {
    const stats = new Map<string, CircuitBreakerStats>();
    for (const [serverId, breaker] of this.breakers) {
      stats.set(serverId, breaker.getStats());
    }
    return stats;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}
