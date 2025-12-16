# Weaviate Observability Module

Comprehensive observability implementation for the Weaviate TypeScript integration, providing tracing, metrics, logging, and health checks.

## Overview

The observability module provides:

- **Tracing**: Distributed tracing with span creation, parent/child relationships, and attributes
- **Metrics**: Counter, gauge, and histogram metrics with labels
- **Logging**: Structured logging with automatic sensitive data redaction
- **Health Checks**: Component health monitoring for Weaviate, schema cache, circuit breaker, and gRPC

## Quick Start

### Default Configuration

```typescript
import { createDefaultObservability } from './observability';

const obs = createDefaultObservability();
// No-op tracer and metrics, console logger at INFO level
```

### Development Configuration

```typescript
import { createDevObservability } from './observability';

const obs = createDevObservability();
// Console tracer, in-memory metrics, debug-level logging
```

### Production Configuration

```typescript
import { createProductionObservability } from './observability';

const obs = createProductionObservability({
  enableTracing: true,
  enableMetrics: true,
  enableLogging: true,
  logLevel: LogLevel.Info,
  jsonLogs: true,
});
```

## Tracing

### Creating Spans

```typescript
import { SpanNames, SpanAttributes } from './observability';

const span = obs.tracer.startSpan(SpanNames.NEAR_VECTOR, {
  [SpanAttributes.CLASS_NAME]: 'Article',
  [SpanAttributes.VECTOR_DIMENSION]: 384,
});

try {
  // Perform operation
  span.setAttribute(SpanAttributes.RESULT_COUNT, 10);
  span.end('ok');
} catch (error) {
  span.recordError(error);
  span.end('error');
}
```

### Nested Spans

```typescript
const parentSpan = obs.tracer.startSpan(SpanNames.BATCH_CREATE);

const childSpan = obs.tracer.startSpan(SpanNames.CHUNK_OBJECTS);
childSpan.setAttribute('batch_size', 100);
childSpan.end();

parentSpan.end();
```

### Standard Span Names

- `weaviate.create_object` - Object creation
- `weaviate.get_object` - Object retrieval
- `weaviate.update_object` - Object update
- `weaviate.delete_object` - Object deletion
- `weaviate.batch_create` - Batch object creation
- `weaviate.near_vector` - Vector similarity search
- `weaviate.near_text` - Text similarity search
- `weaviate.hybrid` - Hybrid search
- `weaviate.graphql` - GraphQL query execution

### Standard Span Attributes

- `operation` - Operation name
- `class_name` - Weaviate class name
- `tenant` - Tenant identifier
- `duration_ms` - Operation duration
- `result_count` - Number of results
- `batch_size` - Batch size
- `vector_dimension` - Vector dimension
- `certainty` - Certainty threshold
- `distance` - Distance metric

## Metrics

### Counters

```typescript
import { MetricNames } from './observability';

// Increment counter
obs.metrics.increment(MetricNames.OBJECT_CREATE);

// Increment with custom value
obs.metrics.increment(MetricNames.BATCH_OBJECTS, 100);

// Increment with labels
obs.metrics.increment(MetricNames.SEARCH_NEAR_VECTOR, 1, {
  class: 'Article',
  tenant: 'tenant_a',
});
```

### Gauges

```typescript
// Set gauge value
obs.metrics.gauge(MetricNames.CONNECTION_ACTIVE, 5);
```

### Histograms

```typescript
// Record histogram value
obs.metrics.histogram(MetricNames.SEARCH_LATENCY_MS, 45);

// Record timing (convenience method)
obs.metrics.recordTiming(MetricNames.GRAPHQL_LATENCY_MS, duration);
```

### Standard Metrics

#### Object Operations
- `weaviate.object.create` (counter)
- `weaviate.object.get` (counter)
- `weaviate.object.update` (counter)
- `weaviate.object.delete` (counter)

#### Batch Operations
- `weaviate.batch.objects` (counter)
- `weaviate.batch.errors` (counter)

#### Search Operations
- `weaviate.search.near_vector` (counter)
- `weaviate.search.near_text` (counter)
- `weaviate.search.hybrid` (counter)
- `weaviate.search.bm25` (counter)

#### Latency Metrics
- `weaviate.search.latency_ms` (histogram)
- `weaviate.graphql.latency_ms` (histogram)
- `weaviate.grpc.latency_ms` (histogram)
- `weaviate.rest.latency_ms` (histogram)

#### Error Metrics
- `weaviate.error` (counter, with labels)

### Accessing Metrics

```typescript
// Get counter value
const count = obs.metrics.getCounter(MetricNames.OBJECT_CREATE);

// Get histogram statistics
const stats = obs.metrics.getHistogramStats(MetricNames.SEARCH_LATENCY_MS);
console.log(`Avg: ${stats.avg}ms, P95: ${stats.p95}ms`);

// Export Prometheus format
const promText = obs.metrics.exportPrometheus();
```

## Logging

### Basic Logging

```typescript
obs.logger.debug('Debug message', { key: 'value' });
obs.logger.info('Operation completed', { duration_ms: 45 });
obs.logger.warn('Slow query detected', { duration_ms: 1000 });
obs.logger.error('Operation failed', { error: err.message });
```

### Structured Logging

```typescript
import { createLogContext } from './observability';

const context = createLogContext({
  operation: 'near_vector',
  class: 'Article',
  tenant: 'tenant_a',
  duration_ms: 45,
  results: 10,
});

obs.logger.info('Vector search completed', context);
```

### Automatic Redaction

The logger automatically redacts sensitive fields:

- `apiKey`, `api_key` - Replaced with `[REDACTED]`
- `token`, `password`, `secret` - Replaced with `[REDACTED]`
- `authorization`, `auth`, `bearer` - Replaced with `[REDACTED]`
- `vector`, `vectors` - Replaced with `[vector:N]` where N is array length
- `embedding`, `embeddings` - Replaced with `[vector:N]`

```typescript
obs.logger.info('Request made', {
  apiKey: 'secret-key',        // Logged as: [REDACTED]
  vector: [0.1, 0.2, 0.3],     // Logged as: [vector:3]
  results: 10,                 // Logged as: 10
});
```

### JSON Logging

```typescript
const logger = new ConsoleLogger({
  name: 'weaviate',
  level: LogLevel.Info,
  json: true,
});

logger.info('Operation completed', { duration: 45 });
// Output: {"level":1,"message":"Operation completed","timestamp":1234567890,"context":{"duration":45},"component":"weaviate"}
```

## Health Checks

### Creating a Health Check

```typescript
import { createHealthCheck, HealthStatus } from './observability';

const healthCheck = createHealthCheck({
  baseUrl: 'http://localhost:8080',
  timeout: 5000,
  logger: obs.logger,
  schemaCacheStats: () => ({
    size: 10,
    hitRate: 0.75,
    enabled: true,
  }),
  circuitBreakerState: () => ({
    state: 'closed',
    failures: 0,
  }),
  grpcConnectionCheck: async () => true,
});
```

### Running Health Checks

```typescript
// Check all components
const result = await healthCheck.check();

console.log(`Overall: ${result.status}`);
for (const component of result.components) {
  console.log(`${component.name}: ${component.status}`);
}

// Check individual component
const weaviateHealth = await healthCheck.checkComponent('weaviate_ready');
```

### Health Check Components

1. **weaviate_ready** - Checks `/v1/.well-known/ready` endpoint
2. **schema_cache** - Validates schema cache statistics
3. **circuit_breaker** - Monitors circuit breaker state
4. **grpc_connection** - Verifies gRPC connection health

### Health Statuses

- `HealthStatus.Healthy` - Component is operating normally
- `HealthStatus.Degraded` - Component is operational but with reduced performance
- `HealthStatus.Unhealthy` - Component is not functioning properly

## Advanced Usage

### Custom Observability Context

```typescript
import { createCustomObservability, LogLevel } from './observability';

const obs = createCustomObservability({
  tracer: 'console',
  metrics: 'memory',
  logger: 'console',
  logLevel: LogLevel.Debug,
  jsonLogs: false,
});
```

### Combining Contexts

```typescript
import { combineObservability } from './observability';

const baseObs = createDefaultObservability();
const customObs = combineObservability(
  baseObs,
  { tracer: new ConsoleTracer() },
  { metrics: new InMemoryMetricsCollector() }
);
```

### Environment-Based Configuration

```typescript
import { createObservabilityFromEnv } from './observability';

// Reads from environment variables:
// - WEAVIATE_TRACING_ENABLED
// - WEAVIATE_METRICS_ENABLED
// - WEAVIATE_LOG_LEVEL
// - WEAVIATE_JSON_LOGS

const obs = createObservabilityFromEnv();
```

## Integration Example

```typescript
import {
  createDevObservability,
  SpanNames,
  SpanAttributes,
  MetricNames,
  createLogContext,
} from './observability';

const obs = createDevObservability();

async function searchArticles(vector: number[]) {
  const span = obs.tracer.startSpan(SpanNames.NEAR_VECTOR, {
    [SpanAttributes.CLASS_NAME]: 'Article',
    [SpanAttributes.VECTOR_DIMENSION]: vector.length,
  });

  const startTime = Date.now();

  try {
    // Perform search
    const results = await performSearch(vector);

    // Record metrics
    const duration = Date.now() - startTime;
    obs.metrics.increment(MetricNames.SEARCH_NEAR_VECTOR, 1, {
      class: 'Article',
    });
    obs.metrics.histogram(MetricNames.SEARCH_LATENCY_MS, duration);

    // Log success
    obs.logger.info(
      'Vector search completed',
      createLogContext({
        operation: 'near_vector',
        class: 'Article',
        duration_ms: duration,
        results: results.length,
      })
    );

    span.setAttribute(SpanAttributes.RESULT_COUNT, results.length);
    span.end('ok');

    return results;
  } catch (error) {
    // Record error
    obs.metrics.increment(MetricNames.ERROR, 1, {
      type: error.name,
      operation: 'near_vector',
    });

    // Log error
    obs.logger.error(
      'Vector search failed',
      createLogContext({
        operation: 'near_vector',
        class: 'Article',
        error: error as Error,
      })
    );

    span.recordError(error as Error);
    span.end('error');

    throw error;
  }
}
```

## Testing

The observability module includes comprehensive tests. Run them with:

```bash
npm test -- observability
```

## Architecture Alignment

This implementation follows the SPARC architecture specification (Section 10) in `/workspaces/integrations/plans/weaviate/architecture-weaviate.md` and provides:

- ✅ Distributed tracing with parent/child spans
- ✅ Required span names and attributes
- ✅ All specified metric types (counters, histograms)
- ✅ Required metric names
- ✅ Structured logging with context
- ✅ Automatic sensitive data redaction
- ✅ Health checks for all components
- ✅ Multiple configuration options
- ✅ Zero-overhead no-op implementations

## License

See the main integration module license.
