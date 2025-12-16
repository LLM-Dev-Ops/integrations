/**
 * Usage examples for the Weaviate observability module
 *
 * This file demonstrates common patterns for using tracing, metrics, logging, and health checks.
 */

import {
  createDevObservability,
  createProductionObservability,
  createHealthCheck,
  SpanNames,
  SpanAttributes,
  MetricNames,
  createLogContext,
  LogLevel,
  HealthStatus,
  InMemoryMetricsCollector,
} from './index';

// ============================================================================
// Example 1: Basic Setup
// ============================================================================

/**
 * Example 1: Basic observability setup for development
 */
export function example1_BasicSetup() {
  // Create observability context for development
  const obs = createDevObservability({
    logLevel: LogLevel.Debug,
    jsonLogs: false,
  });

  obs.logger.info('Weaviate client initialized', {
    version: '1.0.0',
    baseUrl: 'http://localhost:8080',
  });

  return obs;
}

// ============================================================================
// Example 2: Tracing a Vector Search Operation
// ============================================================================

/**
 * Example 2: Complete tracing for a vector search operation
 */
export async function example2_VectorSearchWithTracing(
  searchVector: number[],
  className: string
) {
  const obs = createDevObservability();

  // Start main operation span
  const searchSpan = obs.tracer.startSpan(SpanNames.NEAR_VECTOR, {
    [SpanAttributes.CLASS_NAME]: className,
    [SpanAttributes.VECTOR_DIMENSION]: searchVector.length,
    [SpanAttributes.LIMIT]: 10,
  });

  try {
    // Child span: Validate vector
    const validateSpan = obs.tracer.startSpan(SpanNames.VALIDATE_VECTOR);
    validateVector(searchVector);
    validateSpan.end('ok');

    // Child span: Build GraphQL query
    const buildSpan = obs.tracer.startSpan(SpanNames.BUILD_GRAPHQL);
    const query = buildGraphQLQuery(className, searchVector);
    buildSpan.setAttribute('query_length', query.length);
    buildSpan.end('ok');

    // Child span: Execute query
    const executeSpan = obs.tracer.startSpan(SpanNames.GRAPHQL_QUERY);
    const results = await executeGraphQL(query);
    executeSpan.setAttribute(SpanAttributes.RESULT_COUNT, results.length);
    executeSpan.end('ok');

    // Update parent span with results
    searchSpan.setAttribute(SpanAttributes.RESULT_COUNT, results.length);
    searchSpan.end('ok');

    return results;
  } catch (error) {
    searchSpan.recordError(error as Error);
    searchSpan.end('error');
    throw error;
  }
}

// ============================================================================
// Example 3: Comprehensive Metrics Collection
// ============================================================================

/**
 * Example 3: Collecting metrics for batch operations
 */
export async function example3_BatchOperationWithMetrics(objects: unknown[]) {
  const obs = createDevObservability();
  const metrics = obs.metrics as InMemoryMetricsCollector;

  const startTime = Date.now();
  let successCount = 0;
  let errorCount = 0;

  try {
    // Record batch size
    metrics.increment(MetricNames.BATCH_OBJECTS, objects.length, {
      operation: 'create',
    });

    // Process batch
    for (const obj of objects) {
      try {
        await createObject(obj);
        successCount++;
        metrics.increment(MetricNames.OBJECT_CREATE, 1, { status: 'success' });
      } catch (error) {
        errorCount++;
        metrics.increment(MetricNames.BATCH_ERRORS, 1, {
          error_type: (error as Error).name,
        });
      }
    }

    // Record timing
    const duration = Date.now() - startTime;
    metrics.histogram(MetricNames.GRAPHQL_LATENCY_MS, duration);

    // Record active connections gauge
    metrics.gauge(MetricNames.CONNECTION_ACTIVE, 5);

    // Log stats
    const stats = metrics.getHistogramStats(MetricNames.GRAPHQL_LATENCY_MS);
    obs.logger.info('Batch operation completed', {
      total: objects.length,
      success: successCount,
      errors: errorCount,
      duration_ms: duration,
      avg_latency_ms: stats?.avg,
    });

    return { successCount, errorCount };
  } finally {
    // Always record completion
    obs.logger.info('Batch metrics recorded', {
      success: successCount,
      errors: errorCount,
    });
  }
}

// ============================================================================
// Example 4: Structured Logging with Context
// ============================================================================

/**
 * Example 4: Structured logging for search operations
 */
export async function example4_StructuredLogging(
  className: string,
  searchParams: Record<string, unknown>
) {
  const obs = createDevObservability();

  // Log operation start
  obs.logger.info(
    'Starting hybrid search',
    createLogContext({
      operation: 'hybrid',
      class: className,
      ...searchParams,
    })
  );

  const startTime = Date.now();

  try {
    const results = await performHybridSearch(className, searchParams);

    // Log success with timing
    obs.logger.info(
      'Hybrid search completed',
      createLogContext({
        operation: 'hybrid',
        class: className,
        duration_ms: Date.now() - startTime,
        results: results.length,
      })
    );

    return results;
  } catch (error) {
    // Log error with full context
    obs.logger.error(
      'Hybrid search failed',
      createLogContext({
        operation: 'hybrid',
        class: className,
        duration_ms: Date.now() - startTime,
        error: error as Error,
      })
    );

    throw error;
  }
}

// ============================================================================
// Example 5: Sensitive Data Redaction
// ============================================================================

/**
 * Example 5: Automatic redaction of sensitive data
 */
export function example5_SensitiveDataRedaction() {
  const obs = createDevObservability();

  // These fields will be automatically redacted
  obs.logger.info('Client initialized', {
    baseUrl: 'http://localhost:8080',
    apiKey: 'weaviate-api-key-123',           // Will be [REDACTED]
    token: 'bearer-token-xyz',                // Will be [REDACTED]
    vector: [0.1, 0.2, 0.3, 0.4],            // Will be [vector:4]
    embedding: new Array(384).fill(0.1),     // Will be [vector:384]
    config: {
      timeout: 5000,
      authorization: 'Bearer secret',        // Will be [REDACTED]
      headers: {
        'X-Api-Key': 'secret-key',          // Will be [REDACTED]
      },
    },
  });
}

// ============================================================================
// Example 6: Health Monitoring
// ============================================================================

/**
 * Example 6: Comprehensive health monitoring
 */
export async function example6_HealthMonitoring() {
  const obs = createDevObservability();

  const healthCheck = createHealthCheck({
    baseUrl: 'http://localhost:8080',
    timeout: 5000,
    logger: obs.logger,
    schemaCacheStats: () => ({
      size: 10,
      hitRate: 0.85,
      enabled: true,
    }),
    circuitBreakerState: () => ({
      state: 'closed',
      failures: 0,
    }),
    grpcConnectionCheck: async () => {
      // Check gRPC connection
      return true;
    },
  });

  // Perform health check
  const result = await healthCheck.check();

  // Log overall status
  obs.logger.info('Health check completed', {
    status: result.status,
    timestamp: result.timestamp,
  });

  // Log component status
  for (const component of result.components) {
    const logLevel =
      component.status === HealthStatus.Healthy
        ? 'info'
        : component.status === HealthStatus.Degraded
          ? 'warn'
          : 'error';

    obs.logger[logLevel](`Component ${component.name}: ${component.status}`, {
      component: component.name,
      status: component.status,
      message: component.message,
      metadata: component.metadata,
    });
  }

  return result;
}

// ============================================================================
// Example 7: Production Configuration
// ============================================================================

/**
 * Example 7: Production-ready observability setup
 */
export function example7_ProductionSetup() {
  const obs = createProductionObservability({
    enableTracing: true,
    enableMetrics: true,
    enableLogging: true,
    logLevel: LogLevel.Info,
    jsonLogs: true, // JSON logs for log aggregation systems
  });

  // Production logging is JSON-formatted
  obs.logger.info('Production client started', {
    environment: 'production',
    region: 'us-east-1',
    version: '1.0.0',
  });

  return obs;
}

// ============================================================================
// Example 8: Complete Operation with All Observability
// ============================================================================

/**
 * Example 8: Complete operation with tracing, metrics, and logging
 */
export async function example8_CompleteObservability(
  className: string,
  vector: number[],
  tenant?: string
) {
  const obs = createDevObservability();

  // Start trace
  const span = obs.tracer.startSpan(SpanNames.NEAR_VECTOR, {
    [SpanAttributes.CLASS_NAME]: className,
    [SpanAttributes.VECTOR_DIMENSION]: vector.length,
    [SpanAttributes.TENANT]: tenant ?? 'default',
  });

  // Log operation start
  obs.logger.info(
    'Vector search started',
    createLogContext({
      operation: 'near_vector',
      class: className,
      tenant,
    })
  );

  const startTime = Date.now();

  try {
    // Increment counter
    obs.metrics.increment(MetricNames.SEARCH_NEAR_VECTOR, 1, {
      class: className,
      tenant: tenant ?? 'default',
    });

    // Perform search
    const results = await performVectorSearch(className, vector, tenant);
    const duration = Date.now() - startTime;

    // Record histogram
    obs.metrics.histogram(MetricNames.SEARCH_LATENCY_MS, duration, {
      class: className,
    });

    // Update span
    span.setAttribute(SpanAttributes.RESULT_COUNT, results.length);
    span.setAttribute(SpanAttributes.DURATION_MS, duration);
    span.end('ok');

    // Log success
    obs.logger.info(
      'Vector search completed',
      createLogContext({
        operation: 'near_vector',
        class: className,
        tenant,
        duration_ms: duration,
        results: results.length,
      })
    );

    return results;
  } catch (error) {
    const duration = Date.now() - startTime;

    // Record error metric
    obs.metrics.increment(MetricNames.ERROR, 1, {
      type: (error as Error).name,
      operation: 'near_vector',
    });

    // Record error in span
    span.recordError(error as Error);
    span.end('error');

    // Log error
    obs.logger.error(
      'Vector search failed',
      createLogContext({
        operation: 'near_vector',
        class: className,
        tenant,
        duration_ms: duration,
        error: error as Error,
      })
    );

    throw error;
  }
}

// ============================================================================
// Helper Functions (Mock implementations)
// ============================================================================

function validateVector(vector: number[]): void {
  if (!vector || vector.length === 0) {
    throw new Error('Invalid vector');
  }
}

function buildGraphQLQuery(className: string, vector: number[]): string {
  return `{ Get { ${className}(nearVector: { vector: [${vector.join(',')}] }) { _additional { id } } } }`;
}

async function executeGraphQL(_query: string): Promise<unknown[]> {
  // Mock implementation
  return [{ id: '1' }, { id: '2' }];
}

async function createObject(_obj: unknown): Promise<void> {
  // Mock implementation
  await new Promise((resolve) => setTimeout(resolve, 10));
}

async function performHybridSearch(
  _className: string,
  _params: Record<string, unknown>
): Promise<unknown[]> {
  // Mock implementation
  return [{ id: '1' }, { id: '2' }];
}

async function performVectorSearch(
  _className: string,
  _vector: number[],
  _tenant?: string
): Promise<unknown[]> {
  // Mock implementation
  return [{ id: '1' }, { id: '2' }];
}
