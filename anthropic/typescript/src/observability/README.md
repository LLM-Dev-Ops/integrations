# Observability Layer

The observability layer provides comprehensive tracing, metrics collection, and structured logging capabilities for monitoring and debugging the Anthropic TypeScript integration.

## Overview

The observability layer consists of three main components:

1. **Tracing** - Distributed request tracking with spans and traces
2. **Metrics** - Counter, histogram, and gauge metric collection
3. **Logging** - Structured logging with configurable levels and formats

## Usage

### Tracing

Track operations with distributed tracing:

```typescript
import { DefaultTracer, withAttribute, finishSpan, finishSpanWithError } from '@integrations/anthropic';

// Create a tracer
const tracer = new DefaultTracer('my-service');

// Start a span
const span = tracer.startSpan('api-request');

// Add attributes
let requestSpan = withAttribute(span, 'http.method', 'POST');
requestSpan = withAttribute(requestSpan, 'http.url', '/v1/messages');

try {
  // Perform operation
  await performRequest();

  // Finish successfully
  const finished = finishSpan(requestSpan);
  tracer.endSpan(finished);
} catch (error) {
  // Finish with error
  const finished = finishSpanWithError(requestSpan, error.message);
  tracer.endSpan(finished);
}
```

For production environments where tracing overhead is not desired:

```typescript
import { NoopTracer } from '@integrations/anthropic';

const tracer = new NoopTracer();
```

### Metrics

Collect metrics for monitoring:

```typescript
import { InMemoryMetricsCollector, MetricNames } from '@integrations/anthropic';

// Create metrics collector
const metrics = new InMemoryMetricsCollector();

// Track request counts
metrics.incrementCounter(MetricNames.REQUEST_COUNT, 1, {
  endpoint: '/messages',
  method: 'POST',
});

// Record latencies
metrics.recordHistogram(MetricNames.REQUEST_DURATION_MS, 150, {
  endpoint: '/messages',
});

// Track token usage
metrics.incrementCounter(MetricNames.TOKENS_INPUT, 100);
metrics.incrementCounter(MetricNames.TOKENS_OUTPUT, 50);

// Set circuit breaker state
metrics.setGauge(MetricNames.CIRCUIT_BREAKER_STATE, 1); // 1 = closed, 0 = open

// Retrieve metrics
const requestCount = metrics.getCounter(MetricNames.REQUEST_COUNT, {
  endpoint: '/messages',
  method: 'POST',
});

const latencies = metrics.getHistogram(MetricNames.REQUEST_DURATION_MS, {
  endpoint: '/messages',
});
```

For production environments where metrics collection is handled externally:

```typescript
import { NoopMetricsCollector } from '@integrations/anthropic';

const metrics = new NoopMetricsCollector();
```

### Logging

Structured logging with multiple formats:

```typescript
import { ConsoleLogger, logRequest, logResponse, logError } from '@integrations/anthropic';

// Create logger with configuration
const logger = new ConsoleLogger({
  level: 'info',
  format: 'json',
  includeTimestamps: true,
});

// Log at different levels
logger.trace('Trace message');
logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');

// Log with context
logger.info('User action', {
  userId: '123',
  action: 'create_message',
  duration: 150,
});

// Use helper functions
logRequest(logger, 'POST', '/v1/messages', { max_tokens: 1024 });
logResponse(logger, 200, 150, { id: 'msg_123' });
logError(logger, new Error('Connection failed'), 'HTTP request');
```

Available log formats:

- **pretty** - Human-readable format with newlines (default)
- **json** - JSON format for log aggregation
- **compact** - Single-line format

For production environments where logging is handled externally:

```typescript
import { NoopLogger } from '@integrations/anthropic';

const logger = new NoopLogger();
```

## Standard Metric Names

The observability layer defines standard metric names for common operations:

- `anthropic.requests.total` - Total number of API requests
- `anthropic.requests.duration_ms` - Request duration in milliseconds
- `anthropic.requests.errors` - Total number of errors
- `anthropic.tokens.input` - Total input tokens consumed
- `anthropic.tokens.output` - Total output tokens generated
- `anthropic.rate_limit.hits` - Number of rate limit hits
- `anthropic.circuit_breaker.state` - Circuit breaker state (0=open, 1=closed)
- `anthropic.retry.attempts` - Total number of retry attempts

## Integration Example

Complete example integrating all three components:

```typescript
import {
  createClient,
  DefaultTracer,
  InMemoryMetricsCollector,
  ConsoleLogger,
  MetricNames,
  withAttribute,
  finishSpan,
  finishSpanWithError,
  logRequest,
  logResponse,
  logError,
} from '@integrations/anthropic';

// Initialize observability components
const tracer = new DefaultTracer('anthropic-client');
const metrics = new InMemoryMetricsCollector();
const logger = new ConsoleLogger({ level: 'info', format: 'json' });

// Create client
const client = createClient({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Make a request with full observability
async function createMessage(content: string) {
  const span = tracer.startSpan('create-message');
  let requestSpan = withAttribute(span, 'operation', 'messages.create');

  const startTime = Date.now();

  try {
    logger.info('Creating message', { content });
    logRequest(logger, 'POST', '/v1/messages', { content });

    metrics.incrementCounter(MetricNames.REQUEST_COUNT, 1, {
      endpoint: 'messages',
    });

    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content }],
    });

    const duration = Date.now() - startTime;

    metrics.recordHistogram(MetricNames.REQUEST_DURATION_MS, duration, {
      endpoint: 'messages',
    });
    metrics.incrementCounter(MetricNames.TOKENS_INPUT, response.usage.input_tokens);
    metrics.incrementCounter(MetricNames.TOKENS_OUTPUT, response.usage.output_tokens);

    logResponse(logger, 200, duration, { id: response.id });

    const finished = finishSpan(requestSpan);
    tracer.endSpan(finished);

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;

    metrics.incrementCounter(MetricNames.REQUEST_ERRORS, 1, {
      endpoint: 'messages',
    });
    metrics.recordHistogram(MetricNames.REQUEST_DURATION_MS, duration, {
      endpoint: 'messages',
    });

    logError(logger, error as Error, 'create-message');

    const finished = finishSpanWithError(requestSpan, (error as Error).message);
    tracer.endSpan(finished);

    throw error;
  }
}

// Use the function
await createMessage('Hello, Claude!');

// Retrieve metrics
console.log('Total requests:', metrics.getCounter(MetricNames.REQUEST_COUNT));
console.log('Average latency:',
  metrics.getHistogram(MetricNames.REQUEST_DURATION_MS)
    .reduce((a, b) => a + b, 0) /
  metrics.getHistogram(MetricNames.REQUEST_DURATION_MS).length
);
```

## Best Practices

1. **Use appropriate log levels**: Use `debug` for detailed information, `info` for important events, `warn` for potential issues, and `error` for failures.

2. **Add context to spans**: Use `withAttribute` to add relevant metadata to spans for better debugging.

3. **Label metrics consistently**: Always use the same label keys for metrics to enable proper aggregation.

4. **Use Noop implementations in production**: If you have external observability tools, use `NoopTracer`, `NoopMetricsCollector`, and `NoopLogger` to avoid overhead.

5. **Track token usage**: Monitor input and output tokens to understand API costs.

6. **Set appropriate log formats**: Use `json` format for production log aggregation, `pretty` for development.

## Testing

All observability components include comprehensive test coverage. Run tests with:

```bash
npm test -- src/observability/
```
