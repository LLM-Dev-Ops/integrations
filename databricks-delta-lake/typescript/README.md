# Databricks Delta Lake Integration

Production-ready TypeScript client for Databricks with comprehensive support for Delta Lake, Unity Catalog, SQL Warehouses, and Jobs API.

## Features

- **Multiple Authentication Methods**: PAT, OAuth 2.0, Azure Service Principal, Azure AD
- **Full Type Safety**: Comprehensive TypeScript types for all APIs
- **Resilience Patterns**: Built-in retry, circuit breaker, and rate limiting
- **Unity Catalog**: Complete metadata operations for catalogs, schemas, and tables
- **Delta Lake Operations**: Read, write, merge, optimize, vacuum, and time travel
- **SQL Warehouse**: Execute queries with automatic result pagination
- **Jobs API**: Submit and monitor Databricks job runs
- **Streaming**: Configure Delta Live Tables and streaming jobs
- **Observability**: Integrated metrics, tracing, and logging

## Installation

```bash
npm install @llm-devops/databricks-delta-lake
```

## Quick Start

### Personal Access Token Authentication

```typescript
import { createClient, SecretString } from '@llm-devops/databricks-delta-lake';

const client = createClient({
  workspaceUrl: 'https://my-workspace.cloud.databricks.com',
  auth: {
    type: 'personal_access_token',
    token: new SecretString('dapi...')
  }
});
```

### OAuth 2.0 Authentication

```typescript
import { createClient, SecretString } from '@llm-devops/databricks-delta-lake';

const client = createClient({
  workspaceUrl: 'https://my-workspace.cloud.databricks.com',
  auth: {
    type: 'oauth',
    clientId: 'my-client-id',
    clientSecret: new SecretString('my-client-secret'),
    scopes: ['sql', 'all-apis']
  }
});
```

### Environment Variables

```typescript
import { createClientFromEnv } from '@llm-devops/databricks-delta-lake';

// Requires DATABRICKS_HOST and DATABRICKS_TOKEN environment variables
const client = createClientFromEnv();
```

## Usage Examples

### SQL Queries

```typescript
// Create SQL client for a warehouse
const sql = client.sql('my-warehouse-id');

// Execute a query
const result = await sql.execute('SELECT * FROM my_table LIMIT 100');
console.log(result.rows);

// Execute with parameters
const result2 = await sql.execute(
  'SELECT * FROM users WHERE age > :min_age',
  { min_age: 18 }
);
```

### Delta Lake Operations

```typescript
// Create Delta client for a catalog/schema
const delta = client.delta('main', 'analytics');

// Read data
const data = await delta.read('user_events', {
  columns: ['user_id', 'event_type', 'timestamp'],
  filter: "event_type = 'click'",
  limit: 1000
});

// Write data
await delta.write('user_events', data, 'append');

// Merge (upsert) data
await delta.merge('user_events', {
  source: newData,
  condition: 'target.user_id = source.user_id',
  whenMatched: { type: 'update' },
  whenNotMatched: { type: 'insert' }
});

// Optimize table
await delta.optimize('user_events', {
  zorderColumns: ['user_id', 'timestamp']
});

// Time travel
const historical = await delta.read('user_events', {
  version: 5  // Read version 5
});

const snapshot = await delta.read('user_events', {
  timestamp: '2024-01-01T00:00:00Z'  // Read at specific time
});
```

### Unity Catalog

```typescript
// List catalogs
const catalogs = await client.catalog.listCatalogs();

// List schemas in a catalog
const schemas = await client.catalog.listSchemas('main');

// List tables in a schema
const tables = await client.catalog.listTables('main', 'analytics');

// Get table metadata
const table = await client.catalog.getTable('main.analytics.user_events');
console.log(table.columns);
console.log(table.storageLocation);
```

### Jobs API

```typescript
// Submit a notebook job
const run = await client.jobs.submitRun({
  task: {
    type: 'notebook',
    notebookPath: '/Shared/my-etl-notebook',
    baseParameters: {
      input_date: '2024-01-01',
      output_table: 'processed_data'
    }
  },
  cluster: {
    sparkVersion: '13.3.x-scala2.12',
    nodeTypeId: 'Standard_DS3_v2',
    numWorkers: 2
  }
});

// Wait for completion
const result = await client.jobs.waitForRun(run.runId, {
  pollIntervalMs: 5000,
  timeoutMs: 3600000  // 1 hour
});

if (result.state.resultState === 'SUCCESS') {
  console.log('Job completed successfully');
  const output = await client.jobs.getRunOutput(run.runId);
  console.log(output);
}
```

### Streaming Jobs

```typescript
const stream = client.streaming()
  .source({ type: 'delta', table: 'bronze.raw_events' })
  .transform('SELECT *, current_timestamp() as processed_at FROM source')
  .sink({ type: 'delta', table: 'silver.processed_events' })
  .trigger({ type: 'processing_time', intervalMs: 10000 })
  .checkpointLocation('/mnt/checkpoints/my-stream')
  .build();

// Monitor streaming query
const status = await stream.getStatus();
console.log(status.recentProgress);
```

## Configuration Options

### Client Options

```typescript
interface DatabricksClientOptions {
  // Required
  workspaceUrl: string;
  auth: AuthConfig;

  // Optional
  warehouseId?: string;           // Default SQL warehouse
  catalog?: string;               // Default catalog (default: 'main')
  schema?: string;                // Default schema (default: 'default')
  timeoutSecs?: number;           // Request timeout (default: 30)
  rateLimit?: number;             // Requests per second (default: 100)
  maxRetries?: number;            // Max retry attempts (default: 3)
  userAgentSuffix?: string;       // Custom user agent suffix
}
```

### Authentication Types

```typescript
// Personal Access Token
auth: {
  type: 'personal_access_token',
  token: SecretString
}

// OAuth 2.0
auth: {
  type: 'oauth',
  clientId: string,
  clientSecret: SecretString,
  scopes?: string[]
}

// Azure Service Principal
auth: {
  type: 'service_principal',
  tenantId: string,
  clientId: string,
  clientSecret: SecretString
}

// Azure AD
auth: {
  type: 'azure_ad',
  tenantId: string,
  clientId: string
}
```

## Error Handling

The library provides comprehensive error types for different failure scenarios:

```typescript
import {
  DatabricksError,
  AuthenticationError,
  RateLimited,
  TableNotFound,
  isRetryableError
} from '@llm-devops/databricks-delta-lake';

try {
  await client.delta().read('nonexistent_table');
} catch (error) {
  if (error instanceof TableNotFound) {
    console.error('Table does not exist:', error.tableName);
  } else if (error instanceof RateLimited) {
    console.error('Rate limited, retry after:', error.retryAfter);
  } else if (isRetryableError(error)) {
    console.error('Retryable error:', error);
  }
}
```

## Resilience

The client includes built-in resilience patterns:

- **Automatic Retry**: Exponential backoff with jitter for transient failures
- **Circuit Breaker**: Prevents cascading failures by failing fast when service is down
- **Rate Limiting**: Adaptive rate limiting per endpoint with backoff
- **Timeouts**: Configurable timeouts for different operation types

```typescript
// Access resilience state
const resilience = client.getResilience();
const circuitState = resilience.getCircuitState();
console.log('Circuit breaker state:', circuitState);
```

## Environment Variables

The client supports the following environment variables:

- `DATABRICKS_HOST`: Workspace URL (required)
- `DATABRICKS_TOKEN`: Personal access token
- `DATABRICKS_CLIENT_ID`: OAuth client ID
- `DATABRICKS_CLIENT_SECRET`: OAuth client secret
- `AZURE_TENANT_ID`: Azure tenant ID
- `AZURE_CLIENT_ID`: Azure client ID
- `AZURE_CLIENT_SECRET`: Azure client secret
- `DATABRICKS_WAREHOUSE_ID`: Default SQL warehouse ID
- `DATABRICKS_CATALOG`: Default catalog name
- `DATABRICKS_SCHEMA`: Default schema name
- `DATABRICKS_TIMEOUT_SECS`: Request timeout in seconds
- `DATABRICKS_RATE_LIMIT`: Rate limit (requests per second)
- `DATABRICKS_MAX_RETRIES`: Maximum retry attempts

## TypeScript Support

The library is written in TypeScript and provides full type definitions:

```typescript
import type {
  DatabricksClient,
  StatementResult,
  TableInfo,
  RunStatus,
  WriteResult
} from '@llm-devops/databricks-delta-lake';
```

## License

MIT

## Contributing

Contributions are welcome! Please see the main repository for contribution guidelines.
