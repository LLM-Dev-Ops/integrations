/**
 * Health check functionality for the Weaviate client.
 *
 * Provides health checks for Weaviate readiness, schema cache, circuit breaker, and gRPC connection.
 */

import {
  HealthCheck,
  HealthCheckResult,
  ComponentHealth,
  HealthStatus,
  Logger,
} from './types';

// ============================================================================
// Health Check Implementation
// ============================================================================

/**
 * Health check options
 */
export interface HealthCheckOptions {
  /** Weaviate base URL */
  baseUrl: string;
  /** Request timeout in ms */
  timeout?: number;
  /** Optional logger */
  logger?: Logger;
  /** Schema cache stats provider */
  schemaCacheStats?: () => {
    size: number;
    hitRate?: number;
    enabled: boolean;
  };
  /** Circuit breaker state provider */
  circuitBreakerState?: () => {
    state: 'closed' | 'open' | 'half-open';
    failures: number;
    lastFailure?: number;
  };
  /** gRPC connection check */
  grpcConnectionCheck?: () => Promise<boolean>;
}

/**
 * Weaviate health check implementation
 */
export class WeaviateHealthCheck implements HealthCheck {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly logger?: Logger;
  private readonly schemaCacheStats?: () => {
    size: number;
    hitRate?: number;
    enabled: boolean;
  };
  private readonly circuitBreakerState?: () => {
    state: 'closed' | 'open' | 'half-open';
    failures: number;
    lastFailure?: number;
  };
  private readonly grpcConnectionCheck?: () => Promise<boolean>;

  constructor(options: HealthCheckOptions) {
    this.baseUrl = options.baseUrl;
    this.timeout = options.timeout ?? 5000;
    this.logger = options.logger;
    this.schemaCacheStats = options.schemaCacheStats;
    this.circuitBreakerState = options.circuitBreakerState;
    this.grpcConnectionCheck = options.grpcConnectionCheck;
  }

  async check(): Promise<HealthCheckResult> {
    const components: ComponentHealth[] = [];

    // Check Weaviate readiness
    const weaviateReady = await this.checkWeaviateReady();
    components.push(weaviateReady);

    // Check schema cache (if provided)
    if (this.schemaCacheStats) {
      const schemaCache = this.checkSchemaCache();
      components.push(schemaCache);
    }

    // Check circuit breaker (if provided)
    if (this.circuitBreakerState) {
      const circuitBreaker = this.checkCircuitBreaker();
      components.push(circuitBreaker);
    }

    // Check gRPC connection (if provided)
    if (this.grpcConnectionCheck) {
      const grpcConnection = await this.checkGrpcConnection();
      components.push(grpcConnection);
    }

    // Determine overall status
    const status = this.determineOverallStatus(components);

    return {
      status,
      components,
      timestamp: Date.now(),
    };
  }

  async checkComponent(name: string): Promise<ComponentHealth> {
    switch (name) {
      case 'weaviate_ready':
        return this.checkWeaviateReady();
      case 'schema_cache':
        return this.checkSchemaCache();
      case 'circuit_breaker':
        return this.checkCircuitBreaker();
      case 'grpc_connection':
        return this.checkGrpcConnection();
      default:
        throw new Error(`Unknown component: ${name}`);
    }
  }

  private async checkWeaviateReady(): Promise<ComponentHealth> {
    const name = 'weaviate_ready';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const url = `${this.baseUrl}/v1/.well-known/ready`;
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        this.logger?.debug('Weaviate ready check passed', { url, status: response.status });

        return {
          name,
          status: HealthStatus.Healthy,
          message: 'Weaviate is ready',
          metadata: {
            statusCode: response.status,
            url,
          },
          timestamp: Date.now(),
        };
      } else {
        this.logger?.warn('Weaviate ready check failed', {
          url,
          status: response.status,
        });

        return {
          name,
          status: HealthStatus.Unhealthy,
          message: `Weaviate not ready: ${response.status} ${response.statusText}`,
          metadata: {
            statusCode: response.status,
            url,
          },
          timestamp: Date.now(),
        };
      }
    } catch (error) {
      this.logger?.error('Weaviate ready check error', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        name,
        status: HealthStatus.Unhealthy,
        message: `Weaviate check failed: ${error instanceof Error ? error.message : String(error)}`,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
        timestamp: Date.now(),
      };
    }
  }

  private checkSchemaCache(): ComponentHealth {
    const name = 'schema_cache';

    if (!this.schemaCacheStats) {
      return {
        name,
        status: HealthStatus.Healthy,
        message: 'Schema cache not configured',
        timestamp: Date.now(),
      };
    }

    try {
      const stats = this.schemaCacheStats();

      if (!stats.enabled) {
        return {
          name,
          status: HealthStatus.Healthy,
          message: 'Schema cache disabled',
          metadata: { enabled: false },
          timestamp: Date.now(),
        };
      }

      const hitRate = stats.hitRate ?? 0;
      let status = HealthStatus.Healthy;
      let message = 'Schema cache operating normally';

      // Degraded if hit rate is low (less than 50%)
      if (hitRate < 0.5 && stats.size > 0) {
        status = HealthStatus.Degraded;
        message = 'Schema cache hit rate is low';
      }

      return {
        name,
        status,
        message,
        metadata: {
          size: stats.size,
          hitRate: hitRate,
          enabled: stats.enabled,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger?.error('Schema cache check error', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        name,
        status: HealthStatus.Unhealthy,
        message: `Schema cache check failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      };
    }
  }

  private checkCircuitBreaker(): ComponentHealth {
    const name = 'circuit_breaker';

    if (!this.circuitBreakerState) {
      return {
        name,
        status: HealthStatus.Healthy,
        message: 'Circuit breaker not configured',
        timestamp: Date.now(),
      };
    }

    try {
      const state = this.circuitBreakerState();

      let status = HealthStatus.Healthy;
      let message = 'Circuit breaker closed';

      if (state.state === 'open') {
        status = HealthStatus.Unhealthy;
        message = 'Circuit breaker is open';
      } else if (state.state === 'half-open') {
        status = HealthStatus.Degraded;
        message = 'Circuit breaker is half-open';
      }

      return {
        name,
        status,
        message,
        metadata: {
          state: state.state,
          failures: state.failures,
          lastFailure: state.lastFailure,
        },
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger?.error('Circuit breaker check error', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        name,
        status: HealthStatus.Unhealthy,
        message: `Circuit breaker check failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      };
    }
  }

  private async checkGrpcConnection(): Promise<ComponentHealth> {
    const name = 'grpc_connection';

    if (!this.grpcConnectionCheck) {
      return {
        name,
        status: HealthStatus.Healthy,
        message: 'gRPC not configured',
        timestamp: Date.now(),
      };
    }

    try {
      const isConnected = await this.grpcConnectionCheck();

      if (isConnected) {
        return {
          name,
          status: HealthStatus.Healthy,
          message: 'gRPC connection is healthy',
          metadata: { connected: true },
          timestamp: Date.now(),
        };
      } else {
        return {
          name,
          status: HealthStatus.Unhealthy,
          message: 'gRPC connection is not available',
          metadata: { connected: false },
          timestamp: Date.now(),
        };
      }
    } catch (error) {
      this.logger?.error('gRPC connection check error', {
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        name,
        status: HealthStatus.Unhealthy,
        message: `gRPC connection check failed: ${error instanceof Error ? error.message : String(error)}`,
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
        timestamp: Date.now(),
      };
    }
  }

  private determineOverallStatus(components: ComponentHealth[]): HealthStatus {
    if (components.length === 0) {
      return HealthStatus.Healthy;
    }

    // If any component is unhealthy, overall is unhealthy
    if (components.some((c) => c.status === HealthStatus.Unhealthy)) {
      return HealthStatus.Unhealthy;
    }

    // If any component is degraded, overall is degraded
    if (components.some((c) => c.status === HealthStatus.Degraded)) {
      return HealthStatus.Degraded;
    }

    return HealthStatus.Healthy;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a health check instance
 */
export function createHealthCheck(options: HealthCheckOptions): HealthCheck {
  return new WeaviateHealthCheck(options);
}

/**
 * Check if a health status is acceptable
 */
export function isHealthy(status: HealthStatus): boolean {
  return status === HealthStatus.Healthy || status === HealthStatus.Degraded;
}

/**
 * Format health check result for logging
 */
export function formatHealthCheckResult(result: HealthCheckResult): string {
  const lines = [
    `Overall Status: ${result.status}`,
    `Timestamp: ${new Date(result.timestamp).toISOString()}`,
    '',
    'Components:',
  ];

  for (const component of result.components) {
    lines.push(`  ${component.name}: ${component.status}`);
    if (component.message) {
      lines.push(`    ${component.message}`);
    }
    if (component.metadata && Object.keys(component.metadata).length > 0) {
      lines.push(`    Metadata: ${JSON.stringify(component.metadata)}`);
    }
  }

  return lines.join('\n');
}
