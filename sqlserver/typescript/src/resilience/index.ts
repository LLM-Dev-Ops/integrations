/**
 * Resilience components for SQL Server client following SPARC specification.
 *
 * Provides circuit breaker and other resilience patterns for fault tolerance.
 */

export {
  CircuitBreaker,
  CircuitBreakerConfig,
  CircuitBreakerStats,
  CircuitState,
  createCircuitBreaker,
} from './circuit-breaker.js';
