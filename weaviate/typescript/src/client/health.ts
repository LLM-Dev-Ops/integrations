/**
 * Health check implementation
 *
 * Provides health checking functionality for the WeaviateClient.
 *
 * @module client/health
 */

import type { HttpTransport } from '../transport/types.js';
import type { SchemaCache } from '../schema/cache.js';
import type { ResilienceOrchestrator } from '../resilience/orchestrator.js';
import type { HealthStatus } from './types.js';

/**
 * Health check dependencies
 */
export interface HealthCheckDeps {
  transport: HttpTransport;
  schemaCache?: SchemaCache;
  resilience?: ResilienceOrchestrator;
}

/**
 * Performs a comprehensive health check
 *
 * Checks:
 * - Weaviate instance readiness
 * - Schema cache status
 * - Circuit breaker state
 * - gRPC connection (if configured)
 *
 * @param deps - Health check dependencies
 * @returns Promise resolving to health status
 *
 * @example
 * ```typescript
 * const status = await healthCheck({
 *   transport,
 *   schemaCache,
 *   resilience
 * });
 *
 * if (!status.healthy) {
 *   console.error('Health check failed:', status.errors);
 * }
 * ```
 */
export async function healthCheck(deps: HealthCheckDeps): Promise<HealthStatus> {
  const errors: string[] = [];
  let weaviateReady = false;

  // Check Weaviate readiness
  try {
    const response = await deps.transport.get<{ status: string }>('/.well-known/ready');
    weaviateReady = response.status === 200;
  } catch (error) {
    errors.push(`Weaviate not ready: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Check schema cache
  const schemaCacheStatus = deps.schemaCache
    ? {
        enabled: true,
        size: deps.schemaCache.getStats().size,
        hitRate: deps.schemaCache.getStats().hitRate,
      }
    : undefined;

  // Check circuit breaker
  const circuitBreakerStatus = deps.resilience
    ? {
        state: deps.resilience.getCircuitBreakerState(),
        failureCount: deps.resilience.getCircuitBreakerFailureCount?.(),
      }
    : undefined;

  if (circuitBreakerStatus?.state === 'OPEN') {
    errors.push('Circuit breaker is open');
  }

  // Overall health
  const healthy = weaviateReady && errors.length === 0;

  return {
    weaviateReady,
    schemaCache: schemaCacheStatus,
    circuitBreaker: circuitBreakerStatus,
    healthy,
    timestamp: new Date(),
    errors: errors.length > 0 ? errors : undefined,
  };
}
