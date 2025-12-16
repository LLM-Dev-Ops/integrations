# PostgreSQL Configuration Module

This module provides a comprehensive configuration system for the PostgreSQL client, following the SPARC specification and industry best practices.

## Features

- **Type-safe configuration** with TypeScript interfaces
- **Fluent builder API** for easy configuration construction
- **Connection string parsing** for PostgreSQL URLs
- **Environment variable support** for 12-factor app compliance
- **SSL/TLS configuration** with multiple modes
- **Connection pooling** with customizable settings
- **Read replica support** with multiple routing policies
- **Simulation mode** for testing and development
- **Comprehensive validation** with detailed error messages

## Installation

```bash
npm install @llmdevops/postgresql-integration
```

## Quick Start

### Using the Builder Pattern

```typescript
import { PgConfig, SslMode, RoutingPolicy } from '@llmdevops/postgresql-integration';

const config = PgConfig.builder()
  .host('localhost')
  .port(5432)
  .database('myapp')
  .credentials('user', 'password')
  .sslMode(SslMode.Require)
  .poolSize(10, 50)
  .queryTimeout(60000)
  .build();
```

### Using Connection String

```typescript
const config = PgConfig.builder()
  .connectionString('postgresql://user:pass@localhost:5432/mydb?sslmode=require')
  .poolSize(5, 20)
  .build();
```

### Using Environment Variables

```typescript
// Set environment variables:
// PG_HOST=localhost
// PG_DATABASE=mydb
// PG_USERNAME=user
// PG_PASSWORD=pass

const config = PgConfig.fromEnv();
```

## Configuration Types

### PgConfig

Main configuration interface containing all PostgreSQL client settings.

```typescript
interface PgConfig {
  primary: ConnectionConfig;      // Primary database connection
  replicas: ConnectionConfig[];   // Read replica connections
  pool: PoolConfig;                // Connection pool settings
  queryTimeout: number;            // Query timeout in milliseconds
  statementCacheSize: number;      // Prepared statement cache size
  simulation: SimulationConfig;    // Simulation mode settings
  routing: RoutingPolicy;          // Query routing policy
}
```

### ConnectionConfig

Configuration for a single database connection.

```typescript
interface ConnectionConfig {
  host: string;                    // Host name or IP address
  port: number;                    // Port number (default: 5432)
  database: string;                // Database name
  username: string;                // Username
  password?: string;               // Password (optional)
  ssl: SslConfig;                  // SSL configuration
  connectTimeout: number;          // Connect timeout in milliseconds
  applicationName?: string;        // Application name for connection
}
```

### PoolConfig

Connection pool configuration.

```typescript
interface PoolConfig {
  minConnections: number;          // Minimum connections (default: 5)
  maxConnections: number;          // Maximum connections (default: 20)
  acquireTimeout: number;          // Acquire timeout in ms (default: 30000)
  idleTimeout: number;             // Idle timeout in ms (default: 600000)
  maxLifetime: number;             // Max lifetime in ms (default: 1800000)
  healthCheckInterval: number;     // Health check interval in ms (default: 30000)
}
```

### SslConfig

SSL/TLS configuration.

```typescript
interface SslConfig {
  mode: SslMode;                   // SSL mode
  ca?: string;                     // CA certificate path
  cert?: string;                   // Client certificate path
  key?: string;                    // Client key path
  rejectUnauthorized?: boolean;    // Reject unauthorized certificates
}
```

### Enumerations

#### SslMode

```typescript
enum SslMode {
  Disable = 'disable',             // Disable SSL
  Allow = 'allow',                 // Allow SSL if available
  Prefer = 'prefer',               // Prefer SSL (default)
  Require = 'require',             // Require SSL
  VerifyCa = 'verify-ca',         // Require SSL and verify CA
  VerifyFull = 'verify-full',     // Require SSL and verify full certificate
}
```

#### SimulationMode

```typescript
enum SimulationMode {
  Off = 'off',                     // Simulation disabled (default)
  Record = 'record',               // Record queries and responses
  Replay = 'replay',               // Replay recorded queries
}
```

#### RoutingPolicy

```typescript
enum RoutingPolicy {
  Primary = 'primary',             // All queries to primary (default)
  ReadReplica = 'read-replica',    // Reads to replicas, writes to primary
  RoundRobin = 'round-robin',      // Round-robin load balancing
  LeastConnections = 'least-connections', // Least connections routing
  Random = 'random',               // Random routing
}
```

## Builder API

The `PgConfigBuilder` provides a fluent API for constructing configurations.

### Connection Methods

```typescript
builder
  .connectionString(url: string)           // Parse connection string
  .host(host: string)                      // Set host
  .port(port: number)                      // Set port
  .database(database: string)              // Set database name
  .credentials(username: string, password: string) // Set credentials
  .connectTimeout(ms: number)              // Set connect timeout
  .applicationName(name: string)           // Set application name
```

### SSL Methods

```typescript
builder
  .ssl(config: SslConfig)                  // Set SSL configuration
  .sslMode(mode: SslMode)                  // Set SSL mode
```

### Pool Methods

```typescript
builder
  .pool(config: Partial<PoolConfig>)       // Set pool configuration
  .poolSize(min: number, max: number)      // Set pool size
```

### Query Methods

```typescript
builder
  .queryTimeout(ms: number)                // Set query timeout
  .statementCacheSize(size: number)        // Set statement cache size
```

### Replica Methods

```typescript
builder
  .addReplica(config: ConnectionConfig)    // Add replica connection
  .addReplicaHost(host: string, port?: number) // Add replica by host
  .routingPolicy(policy: RoutingPolicy)    // Set routing policy
```

### Simulation Methods

```typescript
builder
  .simulation(mode: SimulationMode, path?: string) // Set simulation mode
```

### Build

```typescript
builder.build()  // Build and validate configuration
```

## Environment Variables

The configuration system supports the following environment variables:

### Connection Settings

- `PG_HOST` - Database host (default: localhost)
- `PG_PORT` - Database port (default: 5432)
- `PG_DATABASE` - Database name (default: postgres)
- `PG_USERNAME` - Username (default: postgres)
- `PG_PASSWORD` - Password

### SSL Settings

- `PG_SSLMODE` - SSL mode (disable, allow, prefer, require, verify-ca, verify-full)
- `PG_SSLCERT` - Client certificate path
- `PG_SSLKEY` - Client key path
- `PG_SSLROOTCERT` - CA certificate path

### Pool Settings

- `PG_POOL_MIN` - Minimum pool connections (default: 5)
- `PG_POOL_MAX` - Maximum pool connections (default: 20)
- `PG_ACQUIRE_TIMEOUT` - Pool acquire timeout in ms (default: 30000)

### Query Settings

- `PG_QUERY_TIMEOUT` - Query timeout in ms (default: 30000)

### Replica Settings

- `PG_REPLICA_HOSTS` - Comma-separated list of replica hosts (e.g., "host1:5432,host2:5432")

### Simulation Settings

- `PG_SIMULATION_MODE` - Simulation mode (off, record, replay)
- `PG_SIMULATION_PATH` - Path to simulation file

## Examples

### Basic Configuration

```typescript
const config = PgConfig.builder()
  .host('localhost')
  .database('myapp')
  .credentials('user', 'password')
  .build();
```

### Production Configuration with SSL

```typescript
const config = PgConfig.builder()
  .host('prod.db.example.com')
  .database('production')
  .credentials('prod_user', 'secure_password')
  .ssl({
    mode: SslMode.VerifyFull,
    ca: '/etc/ssl/certs/ca-bundle.crt',
    rejectUnauthorized: true,
  })
  .pool({
    minConnections: 20,
    maxConnections: 100,
    acquireTimeout: 30000,
    idleTimeout: 600000,
    maxLifetime: 1800000,
  })
  .queryTimeout(30000)
  .applicationName('production-app')
  .build();
```

### Configuration with Read Replicas

```typescript
const config = PgConfig.builder()
  .host('primary.db.example.com')
  .database('myapp')
  .credentials('user', 'password')
  .addReplicaHost('replica1.db.example.com')
  .addReplicaHost('replica2.db.example.com')
  .addReplicaHost('replica3.db.example.com')
  .routingPolicy(RoutingPolicy.RoundRobin)
  .build();
```

### Testing Configuration with Simulation

```typescript
const config = PgConfig.builder()
  .host('localhost')
  .database('testdb')
  .credentials('testuser', 'testpass')
  .simulation(SimulationMode.Record, '/tmp/queries.json')
  .build();
```

### Connection String Configuration

```typescript
const config = PgConfig.builder()
  .connectionString('postgresql://user:pass@db.example.com:5432/mydb?sslmode=require&application_name=myapp')
  .poolSize(10, 50)
  .build();
```

## Validation

The configuration system performs comprehensive validation:

```typescript
import { validateConfig, PgError } from '@llmdevops/postgresql-integration';

try {
  const config = PgConfig.builder()
    .host('localhost')
    .database('mydb')
    .credentials('user', 'pass')
    .poolSize(50, 10)  // Invalid: min > max
    .build();
} catch (error) {
  if (error instanceof PgError) {
    console.error(`Configuration error: ${error.message}`);
    console.error(`Error kind: ${error.kind}`);
  }
}
```

### Validation Rules

- Host cannot be empty
- Port must be between 1 and 65535
- Database name cannot be empty
- Username cannot be empty
- Connect timeout must be greater than 0
- Min connections cannot be negative
- Max connections must be greater than 0
- Min connections cannot exceed max connections
- All timeouts must be greater than 0
- Statement cache size cannot be negative
- Simulation mode Record/Replay requires a path
- Routing policies other than Primary require at least one replica

## Factory Functions

### createDefaultConfig()

Creates a configuration with default values.

```typescript
const config = createDefaultConfig();
```

### createConfigFromEnv()

Creates a configuration from environment variables.

```typescript
const config = createConfigFromEnv();
```

### parseConnectionString(url)

Parses a PostgreSQL connection string.

```typescript
const connConfig = parseConnectionString('postgresql://user:pass@localhost:5432/mydb');
```

### validateConfig(config)

Validates a configuration object.

```typescript
validateConfig(config);  // Throws PgError if invalid
```

## Namespace API

The `PgConfig` namespace provides convenient utility functions:

```typescript
// Create a builder
const builder = PgConfig.builder();

// Get default config
const defaults = PgConfig.defaultConfig();

// Create from environment
const envConfig = PgConfig.fromEnv();

// Parse connection string
const parsed = PgConfig.parse('postgresql://...');

// Validate config
PgConfig.validate(config);
```

## Error Handling

The configuration system uses typed errors from the `PgError` class:

```typescript
import { PgError, PgErrorKind, isPgError } from '@llmdevops/postgresql-integration';

try {
  const config = PgConfig.builder().build();
} catch (error) {
  if (isPgError(error)) {
    switch (error.kind) {
      case PgErrorKind.InvalidConfiguration:
        console.error('Invalid configuration:', error.message);
        break;
      case PgErrorKind.InvalidConnectionString:
        console.error('Invalid connection string:', error.message);
        break;
      // ... handle other error kinds
    }
  }
}
```

## Best Practices

1. **Use environment variables in production** - Keep sensitive data out of code
2. **Enable SSL in production** - Use `SslMode.VerifyFull` for maximum security
3. **Configure connection pooling** - Tune pool size based on your workload
4. **Set appropriate timeouts** - Prevent hanging connections and queries
5. **Use read replicas** - Distribute read load across multiple servers
6. **Enable health checks** - Detect and remove unhealthy connections
7. **Set application name** - Helps with monitoring and debugging
8. **Validate configuration** - Catch configuration errors early
9. **Use simulation mode for testing** - Test without a real database
10. **Monitor pool metrics** - Track connection usage and performance

## TypeScript Support

The configuration module is written in TypeScript and provides full type definitions. All types are exported for use in your application:

```typescript
import type {
  PgConfig,
  ConnectionConfig,
  PoolConfig,
  SslConfig,
  SimulationConfig,
} from '@llmdevops/postgresql-integration';
```

## License

MIT
