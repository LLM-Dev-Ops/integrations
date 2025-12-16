# DatadogAPMClientFactory Usage Guide

This guide demonstrates how to use the updated `DatadogAPMClientFactory` to create Datadog APM clients.

## Overview

The factory provides three methods for creating clients:

1. **`createWithTracer()`** - Recommended for production use with pre-initialized dd-trace
2. **`create()`** - Auto-initializes dd-trace via dynamic import (async)
3. **`createMock()`** - Creates a mock client for testing

## Method 1: Using `createWithTracer()` (Recommended for Production)

This is the recommended approach when you have already initialized dd-trace in your application.

```typescript
import tracer from 'dd-trace';
import StatsD from 'hot-shots';
import { DatadogAPMClientFactory } from '@llm-devops/datadog-apm';

// Initialize dd-trace first (typically in your application entry point)
tracer.init({
  service: 'my-service',
  env: 'production',
  version: '1.0.0',
  hostname: 'localhost',
  port: 8126,
});

// Optionally initialize StatsD for metrics
const statsD = new StatsD({
  host: 'localhost',
  port: 8125,
});

// Create the APM client
const client = DatadogAPMClientFactory.createWithTracer(tracer, statsD, {
  service: 'my-service',
  env: 'production',
  version: '1.0.0',
});

// Use the client
const span = client.startSpan('my-operation');
span.setTag('user.id', '12345');
span.finish();
```

### Without StatsD (tracing only)

```typescript
import tracer from 'dd-trace';
import { DatadogAPMClientFactory } from '@llm-devops/datadog-apm';

tracer.init({
  service: 'my-service',
  env: 'production',
  version: '1.0.0',
});

const client = DatadogAPMClientFactory.createWithTracer(tracer, undefined, {
  service: 'my-service',
  env: 'production',
  version: '1.0.0',
});
```

## Method 2: Using `create()` (Auto-initialization)

This method attempts to dynamically import and initialize dd-trace. It's async and requires dd-trace to be installed.

```typescript
import { DatadogAPMClientFactory } from '@llm-devops/datadog-apm';

async function initializeAPM() {
  try {
    const client = await DatadogAPMClientFactory.create({
      service: 'my-service',
      env: 'production',
      version: '1.0.0',
      agentHost: 'localhost',
      agentPort: 8126,
      sampleRate: 1.0,
      // Optional: Include statsdPort to also initialize metrics
      statsdPort: 8125,
    });

    return client;
  } catch (error) {
    console.error('Failed to initialize Datadog APM:', error);
    throw error;
  }
}

// Use in an async context
const client = await initializeAPM();
```

### Error Handling

The `create()` method provides helpful error messages:

```typescript
try {
  const client = await DatadogAPMClientFactory.create(config);
} catch (error) {
  if (error.message.includes('dd-trace module not found')) {
    console.error('Please install dd-trace: npm install dd-trace');
    // You can fall back to using a mock client for development
    const mockClient = DatadogAPMClientFactory.createMock(config);
  }
}
```

## Method 3: Using `createMock()` (Testing)

For testing, use the mock client that implements all methods as no-ops:

```typescript
import { DatadogAPMClientFactory } from '@llm-devops/datadog-apm';

// In your test setup
beforeEach(() => {
  const client = DatadogAPMClientFactory.createMock({
    service: 'test-service',
    env: 'test',
    version: '1.0.0',
  });

  // Use the client in your tests
  const span = client.startSpan('test-operation');
  span.setTag('test.id', '123');
  span.finish();
});

afterEach(() => {
  const client = DatadogAPMClientFactory.getInstance();
  await client.shutdown();
  DatadogAPMClientFactory.reset();
});
```

## Singleton Pattern

The factory enforces the singleton pattern. Only one client can exist at a time:

```typescript
// First client creation succeeds
const client1 = DatadogAPMClientFactory.createMock();

// Second creation attempt throws an error
try {
  const client2 = DatadogAPMClientFactory.createMock();
} catch (error) {
  console.error(error.message);
  // "DatadogAPM client already initialized. Use reset() to clear the existing client first."
}

// Get the existing instance
const existingClient = DatadogAPMClientFactory.getInstance();

// Reset to create a new client
DatadogAPMClientFactory.reset();
const client2 = DatadogAPMClientFactory.createMock();
```

## Configuration Validation

All factory methods validate the configuration using `validateConfig()`:

```typescript
import { DatadogAPMClientFactory } from '@llm-devops/datadog-apm';

try {
  const client = DatadogAPMClientFactory.createWithTracer(tracer, undefined, {
    service: 'My-Service', // Invalid: must be lowercase
    env: 'production',
    version: '1.0.0',
  });
} catch (error) {
  console.error(error.message);
  // "Invalid service name: must contain only lowercase letters, numbers, underscores, and hyphens"
}
```

### Required Fields

- `service` - Service name (lowercase alphanumeric, underscores, hyphens)
- `env` - Environment name
- `version` - Application version

### Optional Fields (with defaults)

- `agentHost` - Default: 'localhost'
- `agentPort` - Default: 8126
- `statsdPort` - Default: undefined (StatsD disabled)
- `sampleRate` - Default: 1.0 (100% sampling)
- `globalTags` - Default: {}
- `metricsPrefix` - Default: undefined
- `logger` - Default: undefined

## Complete Example

Here's a complete example showing production usage:

```typescript
// app.ts
import tracer from 'dd-trace';
import StatsD from 'hot-shots';
import { DatadogAPMClientFactory } from '@llm-devops/datadog-apm';

// Initialize tracer at application startup
tracer.init({
  service: process.env.DD_SERVICE || 'my-service',
  env: process.env.DD_ENV || 'development',
  version: process.env.DD_VERSION || '1.0.0',
  hostname: process.env.DD_AGENT_HOST || 'localhost',
  port: parseInt(process.env.DD_TRACE_AGENT_PORT || '8126'),
  logInjection: true,
});

// Initialize StatsD
const statsD = new StatsD({
  host: process.env.DD_AGENT_HOST || 'localhost',
  port: parseInt(process.env.DD_DOGSTATSD_PORT || '8125'),
  globalTags: {
    env: process.env.DD_ENV || 'development',
    service: process.env.DD_SERVICE || 'my-service',
  },
});

// Create the APM client
const apmClient = DatadogAPMClientFactory.createWithTracer(tracer, statsD, {
  service: process.env.DD_SERVICE || 'my-service',
  env: process.env.DD_ENV || 'development',
  version: process.env.DD_VERSION || '1.0.0',
  globalTags: {
    region: process.env.AWS_REGION || 'us-east-1',
  },
});

// Use the client throughout your application
export { apmClient };

// In another file
import { apmClient } from './app';

function processRequest(request: Request) {
  const span = apmClient.startSpan('process.request');

  try {
    // Your business logic
    span.setTag('http.method', request.method);
    span.setTag('http.url', request.url);

    // Record metrics
    apmClient.increment('requests.processed', 1, {
      endpoint: request.url,
      method: request.method,
    });

    return { success: true };
  } catch (error) {
    span.setError(error);
    throw error;
  } finally {
    span.finish();
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await apmClient.shutdown();
  process.exit(0);
});
```

## Migration from Old Factory

If you were using the old factory that threw an error about dd-trace not being found:

### Before
```typescript
// This would fail if dd-trace wasn't installed
const client = DatadogAPMClientFactory.create(config);
```

### After (Option 1: Recommended)
```typescript
import tracer from 'dd-trace';
tracer.init({ ... });

const client = DatadogAPMClientFactory.createWithTracer(tracer, undefined, config);
```

### After (Option 2: Auto-initialize)
```typescript
const client = await DatadogAPMClientFactory.create(config);
```

### After (Option 3: Testing/Development)
```typescript
const client = DatadogAPMClientFactory.createMock(config);
```
