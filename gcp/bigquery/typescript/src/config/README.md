# BigQuery Configuration Module

This module provides configuration management for the BigQuery TypeScript integration, following the SPARC specification and the pattern established by the GCS integration.

## Features

- **BigQueryConfig interface**: Complete configuration for BigQuery client
- **BigQueryConfigBuilder**: Fluent API for building configurations
- **Environment variable support**: Load configuration from environment
- **Validation**: Comprehensive validation of project IDs, dataset IDs, table IDs, and locations
- **Shared types**: Reuses GCP credential types from the GCS integration pattern

## Usage

### Basic Configuration

```typescript
import { configBuilder } from './config/index.js';

const config = configBuilder()
  .projectId('my-project')
  .location('US')
  .timeout(60000)
  .build();
```

### Environment Variables

```typescript
const config = configBuilder()
  .fromEnv()
  .build();
```

Supported environment variables:
- `GOOGLE_CLOUD_PROJECT` / `GCLOUD_PROJECT` / `GCP_PROJECT` - Project ID
- `GOOGLE_APPLICATION_CREDENTIALS` - Service account key file path
- `BIGQUERY_LOCATION` - BigQuery location/region
- `BIGQUERY_EMULATOR_HOST` - Emulator endpoint
- `BIGQUERY_MAX_BYTES_BILLED` - Global cost limit
- `BIGQUERY_USE_QUERY_CACHE` - Enable/disable query cache
- `BIGQUERY_USE_LEGACY_SQL` - Enable/disable legacy SQL
- `BIGQUERY_ENABLE_LOGGING` - Enable/disable logging

### Credential Configuration

```typescript
// Service account key file
const config = configBuilder()
  .projectId('my-project')
  .serviceAccountKeyFile('/path/to/key.json')
  .build();

// Application default credentials
const config = configBuilder()
  .projectId('my-project')
  .applicationDefault()
  .build();

// Workload identity (GKE)
const config = configBuilder()
  .projectId('my-project')
  .workloadIdentity()
  .build();

// Access token
const config = configBuilder()
  .projectId('my-project')
  .accessToken('ya29...')
  .build();
```

### Cost Controls

```typescript
const config = configBuilder()
  .projectId('my-project')
  .maximumBytesBilled(1000000000n) // 1GB limit
  .build();
```

### Query Settings

```typescript
const config = configBuilder()
  .projectId('my-project')
  .useQueryCache(true)
  .useLegacySql(false)
  .build();
```

### Retry and Circuit Breaker Configuration

```typescript
const config = configBuilder()
  .projectId('my-project')
  .retryConfig({
    maxAttempts: 5,
    baseDelay: 1000,
    maxDelay: 60000,
    multiplier: 2,
  })
  .circuitBreakerConfig({
    failureThreshold: 10,
    successThreshold: 3,
    resetTimeout: 60000,
  })
  .build();
```

## Configuration Interface

```typescript
interface BigQueryConfig {
  projectId: string;
  location: string; // default: 'US'
  credentials?: GcpCredentials;
  timeout: number; // default: 30000ms
  retryConfig: RetryConfig;
  circuitBreakerConfig: CircuitBreakerConfig;
  maximumBytesBilled?: bigint;
  useQueryCache: boolean; // default: true
  useLegacySql: boolean; // default: false
  enableLogging: boolean; // default: false
  apiEndpoint?: string;
}
```

## Validation Functions

The module provides validation functions for BigQuery identifiers:

- `validateProjectId(projectId: string)` - Validates GCP project ID format
- `validateDatasetId(datasetId: string)` - Validates BigQuery dataset ID format
- `validateTableId(tableId: string)` - Validates BigQuery table ID format
- `validateLocation(location: string)` - Validates BigQuery location/region

## Endpoint Resolution

```typescript
import { resolveEndpoint } from './config/index.js';

const endpoint = resolveEndpoint(config);
// Returns: "https://bigquery.googleapis.com/bigquery/v2" (default)
// Or custom endpoint if apiEndpoint is set
```

## Default Configuration

```typescript
const DEFAULT_CONFIG = {
  location: "US",
  timeout: 30000,
  retryConfig: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    multiplier: 2,
  },
  circuitBreakerConfig: {
    failureThreshold: 5,
    successThreshold: 2,
    resetTimeout: 30000,
  },
  useQueryCache: true,
  useLegacySql: false,
  enableLogging: false,
};
```

## Error Handling

Configuration errors throw `ConfigurationError` with specific error codes:
- `MissingProject` - Project ID not provided
- `InvalidConfig` - Invalid configuration values
- `InvalidLocation` - Invalid BigQuery location
- `InvalidCredentials` - Invalid credential configuration
