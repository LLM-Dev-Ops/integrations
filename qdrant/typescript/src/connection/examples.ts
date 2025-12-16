/**
 * Example usage of the Qdrant resilience layer
 * These examples demonstrate how to use retry and circuit breaker patterns
 */

import {
  RetryExecutor,
  CircuitBreaker,
  CircuitOpenError,
  createDefaultRetryExecutor,
  createRetryExecutorForError,
  createDefaultCircuitBreaker,
  getRetryConfigForError,
  isTransientError,
  type QdrantErrorLike,
} from './resilience.js';

// Mock Qdrant client for examples
interface MockQdrantClient {
  search(params: any): Promise<any>;
  upsertPoints(params: any): Promise<any>;
  getPoints(params: any): Promise<any>;
  getCollection(name: string): Promise<any>;
  deletePoints(params: any): Promise<any>;
}

/**
 * Example 1: Basic retry with default configuration
 */
export async function basicRetryExample(client: MockQdrantClient) {
  const executor = createDefaultRetryExecutor();

  try {
    const results = await executor.execute(async () => {
      return await client.search({
        collection: 'documents',
        vector: [0.1, 0.2, 0.3, 0.4],
        limit: 10,
      });
    });

    console.log('Search completed successfully:', results);
    return results;
  } catch (error) {
    console.error('Search failed after retries:', error);
    throw error;
  }
}

/**
 * Example 2: Error-specific retry configuration
 */
export async function errorSpecificRetryExample(client: MockQdrantClient) {
  // Use optimized retry config for rate limiting scenarios
  const executor = createRetryExecutorForError('rate_limit_error');

  try {
    const result = await executor.execute(async () => {
      return await client.upsertPoints({
        collection: 'documents',
        points: [
          { id: 1, vector: [0.1, 0.2, 0.3], payload: { text: 'Document 1' } },
          { id: 2, vector: [0.4, 0.5, 0.6], payload: { text: 'Document 2' } },
        ],
        wait: true,
      });
    });

    console.log('Upsert completed successfully:', result);
    return result;
  } catch (error) {
    console.error('Upsert failed after retries:', error);
    throw error;
  }
}

/**
 * Example 3: Custom retry configuration
 */
export async function customRetryExample(client: MockQdrantClient) {
  const executor = new RetryExecutor({
    maxAttempts: 5,
    baseDelayMs: 200,
    maxDelayMs: 10000,
    jitterFactor: 0.2,
  });

  try {
    const points = await executor.execute(async () => {
      return await client.getPoints({
        collection: 'documents',
        ids: [1, 2, 3, 4, 5],
      });
    });

    console.log('Retrieved points:', points);
    return points;
  } catch (error) {
    console.error('Failed to retrieve points:', error);
    throw error;
  }
}

/**
 * Example 4: Basic circuit breaker
 */
export async function basicCircuitBreakerExample(client: MockQdrantClient) {
  const breaker = createDefaultCircuitBreaker();

  try {
    const collection = await breaker.execute(async () => {
      return await client.getCollection('documents');
    });

    console.log('Collection info:', collection);
    return collection;
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      console.error('Circuit breaker is open - service is unavailable');
    } else {
      console.error('Operation failed:', error);
    }
    throw error;
  }
}

/**
 * Example 5: Custom circuit breaker with monitoring
 */
export async function monitoredCircuitBreakerExample(client: MockQdrantClient) {
  const breaker = new CircuitBreaker({
    failureThreshold: 10,
    successThreshold: 3,
    openDurationMs: 60000, // 1 minute
  });

  // Log state before operation
  console.log('Circuit state before:', breaker.getState());

  try {
    const result = await breaker.execute(async () => {
      return await client.search({
        collection: 'documents',
        vector: [0.1, 0.2, 0.3, 0.4],
        limit: 10,
      });
    });

    // Log statistics after successful operation
    const stats = breaker.getStats();
    console.log('Circuit stats:', {
      state: stats.state,
      failureCount: stats.failureCount,
      successCount: stats.successCount,
    });

    return result;
  } catch (error) {
    // Log statistics after failure
    const stats = breaker.getStats();
    console.error('Circuit stats after failure:', {
      state: stats.state,
      failureCount: stats.failureCount,
      timeUntilHalfOpen: stats.timeUntilHalfOpen,
    });
    throw error;
  }
}

/**
 * Example 6: Combined retry and circuit breaker
 */
export async function combinedResilienceExample(client: MockQdrantClient) {
  const executor = createRetryExecutorForError('search_timeout');
  const breaker = createDefaultCircuitBreaker();

  try {
    const results = await breaker.execute(async () => {
      return await executor.execute(async () => {
        return await client.search({
          collection: 'documents',
          vector: [0.1, 0.2, 0.3, 0.4],
          limit: 10,
          filter: {
            must: [
              { key: 'category', match: { value: 'technical' } },
            ],
          },
        });
      });
    });

    console.log('Search with resilience completed:', results);
    return results;
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      console.error('Circuit breaker is open');
    } else {
      console.error('Search failed:', error);
    }
    throw error;
  }
}

/**
 * Example 7: Error type checking
 */
export function errorTypeCheckingExample(error: QdrantErrorLike) {
  const errorType = error.type || 'unknown';

  console.log('Error type:', errorType);
  console.log('Is transient:', isTransientError(errorType));

  if (isTransientError(errorType)) {
    const retryConfig = getRetryConfigForError(errorType);
    console.log('Retry configuration:', {
      maxAttempts: retryConfig.maxAttempts,
      baseDelayMs: retryConfig.baseDelayMs,
      maxDelayMs: retryConfig.maxDelayMs,
      backoffType: retryConfig.jitterFactor === 0 ? 'linear' : 'exponential',
    });
  } else {
    console.log('Error is not retryable');
  }
}

/**
 * Example 8: Batch operations with rate limiting protection
 */
export async function batchOperationsExample(client: MockQdrantClient) {
  const executor = createRetryExecutorForError('rate_limit_error');
  const breaker = createDefaultCircuitBreaker();

  const batches = [
    [
      { id: 1, vector: [0.1, 0.2], payload: { text: 'Doc 1' } },
      { id: 2, vector: [0.3, 0.4], payload: { text: 'Doc 2' } },
    ],
    [
      { id: 3, vector: [0.5, 0.6], payload: { text: 'Doc 3' } },
      { id: 4, vector: [0.7, 0.8], payload: { text: 'Doc 4' } },
    ],
  ];

  const results = [];

  for (const batch of batches) {
    try {
      const result = await breaker.execute(async () => {
        return await executor.execute(async () => {
          return await client.upsertPoints({
            collection: 'documents',
            points: batch,
            wait: true,
          });
        });
      });

      results.push(result);
      console.log(`Batch completed: ${batch.length} points`);
    } catch (error) {
      console.error('Batch failed:', error);
      // Optionally break the loop or continue with next batch
      break;
    }
  }

  return results;
}

/**
 * Example 9: Graceful degradation with circuit breaker
 */
export async function gracefulDegradationExample(client: MockQdrantClient) {
  const breaker = createDefaultCircuitBreaker();

  try {
    // Try primary search
    const results = await breaker.execute(async () => {
      return await client.search({
        collection: 'documents',
        vector: [0.1, 0.2, 0.3, 0.4],
        limit: 10,
      });
    });

    return {
      source: 'qdrant',
      results,
    };
  } catch (error) {
    if (error instanceof CircuitOpenError) {
      // Fallback to cache or alternative search
      console.log('Circuit open, using fallback mechanism');
      return {
        source: 'cache',
        results: [], // Return cached results or empty array
      };
    }
    throw error;
  }
}

/**
 * Example 10: Reset circuit breaker manually
 */
export async function manualCircuitResetExample(client: MockQdrantClient) {
  const breaker = new CircuitBreaker({
    failureThreshold: 3,
    successThreshold: 2,
    openDurationMs: 30000,
  });

  // Simulate failures that open the circuit
  for (let i = 0; i < 3; i++) {
    try {
      await breaker.execute(async () => {
        throw new Error('Service unavailable');
      });
    } catch (error) {
      console.log(`Attempt ${i + 1} failed`);
    }
  }

  console.log('Circuit state after failures:', breaker.getState()); // 'open'

  // After confirming service is back online, reset manually
  console.log('Service is back online, resetting circuit');
  breaker.reset();

  console.log('Circuit state after reset:', breaker.getState()); // 'closed'

  // Now operations can proceed normally
  try {
    const result = await breaker.execute(async () => {
      return await client.getCollection('documents');
    });
    console.log('Operation succeeded after reset');
    return result;
  } catch (error) {
    console.error('Operation still failing:', error);
    throw error;
  }
}
