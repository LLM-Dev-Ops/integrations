/**
 * Connection layer for Qdrant integration
 * Provides resilience mechanisms for reliable Qdrant operations
 */

// Resilience exports
export type {
  RetryConfig,
  CircuitBreakerConfig,
  CircuitState,
  CircuitBreakerStats,
  QdrantErrorLike,
} from './resilience.js';

export {
  RetryExecutor,
  CircuitBreaker,
  CircuitOpenError,
  getRetryConfigForError,
  isTransientError,
  createDefaultRetryExecutor,
  createRetryExecutorForError,
  createDefaultCircuitBreaker,
  createCircuitBreaker,
} from './resilience.js';
