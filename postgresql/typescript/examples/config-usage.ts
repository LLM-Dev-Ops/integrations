/**
 * Example usage of PostgreSQL configuration.
 * This file demonstrates various ways to configure the PostgreSQL client.
 */

import {
  PgConfig,
  PgConfigBuilder,
  SslMode,
  SimulationMode,
  RoutingPolicy,
  createDefaultConfig,
  createConfigFromEnv,
  parseConnectionString,
  validateConfig,
} from '../src/config/index.js';

// Example 1: Using default configuration
console.log('Example 1: Default configuration');
const defaultConfig = createDefaultConfig();
console.log(JSON.stringify(defaultConfig, null, 2));

// Example 2: Using the builder pattern
console.log('\nExample 2: Using builder pattern');
const config1 = PgConfig.builder()
  .host('db.example.com')
  .port(5432)
  .database('myapp')
  .credentials('myuser', 'mypassword')
  .sslMode(SslMode.Require)
  .poolSize(10, 50)
  .queryTimeout(60000)
  .applicationName('my-application')
  .build();
console.log(JSON.stringify(config1, null, 2));

// Example 3: Using connection string
console.log('\nExample 3: Using connection string');
const config2 = PgConfig.builder()
  .connectionString('postgresql://user:pass@localhost:5432/mydb?sslmode=require&application_name=myapp')
  .poolSize(5, 20)
  .build();
console.log(JSON.stringify(config2, null, 2));

// Example 4: Configuration with replicas
console.log('\nExample 4: Configuration with replicas');
const config3 = PgConfig.builder()
  .host('primary.db.example.com')
  .database('myapp')
  .credentials('myuser', 'mypassword')
  .addReplicaHost('replica1.db.example.com')
  .addReplicaHost('replica2.db.example.com')
  .routingPolicy(RoutingPolicy.RoundRobin)
  .build();
console.log(JSON.stringify(config3, null, 2));

// Example 5: Advanced pool configuration
console.log('\nExample 5: Advanced pool configuration');
const config4 = PgConfig.builder()
  .host('localhost')
  .database('mydb')
  .credentials('user', 'pass')
  .pool({
    minConnections: 10,
    maxConnections: 100,
    acquireTimeout: 60000,
    idleTimeout: 300000,
    maxLifetime: 1800000,
    healthCheckInterval: 30000,
  })
  .build();
console.log(JSON.stringify(config4, null, 2));

// Example 6: SSL configuration with certificates
console.log('\nExample 6: SSL configuration with certificates');
const config5 = PgConfig.builder()
  .host('secure.db.example.com')
  .database('mydb')
  .credentials('user', 'pass')
  .ssl({
    mode: SslMode.VerifyFull,
    ca: '/path/to/ca-cert.pem',
    cert: '/path/to/client-cert.pem',
    key: '/path/to/client-key.pem',
    rejectUnauthorized: true,
  })
  .build();
console.log(JSON.stringify(config5, null, 2));

// Example 7: Simulation mode for testing
console.log('\nExample 7: Simulation mode configuration');
const config6 = PgConfig.builder()
  .host('localhost')
  .database('testdb')
  .credentials('testuser', 'testpass')
  .simulation(SimulationMode.Record, '/tmp/pg-simulation.json')
  .build();
console.log(JSON.stringify(config6, null, 2));

// Example 8: Using environment variables
console.log('\nExample 8: Configuration from environment variables');
// Set some example environment variables
process.env.PG_HOST = 'env.db.example.com';
process.env.PG_PORT = '5432';
process.env.PG_DATABASE = 'envdb';
process.env.PG_USERNAME = 'envuser';
process.env.PG_PASSWORD = 'envpass';
process.env.PG_POOL_MIN = '5';
process.env.PG_POOL_MAX = '25';
process.env.PG_SSLMODE = 'require';

const configFromEnv = createConfigFromEnv();
console.log(JSON.stringify(configFromEnv, null, 2));

// Example 9: Parsing connection string
console.log('\nExample 9: Parsing connection string');
const connConfig = parseConnectionString(
  'postgresql://user:password@db.example.com:5432/mydb?sslmode=verify-full&application_name=myapp'
);
console.log(JSON.stringify(connConfig, null, 2));

// Example 10: Validating configuration
console.log('\nExample 10: Validating configuration');
try {
  const validConfig = PgConfig.builder()
    .host('localhost')
    .database('mydb')
    .credentials('user', 'pass')
    .build();

  validateConfig(validConfig);
  console.log('Configuration is valid!');
} catch (error) {
  console.error('Configuration validation failed:', error);
}

// Example 11: Invalid configuration (will throw error)
console.log('\nExample 11: Invalid configuration example');
try {
  const invalidConfig = PgConfig.builder()
    .host('localhost')
    .database('mydb')
    .credentials('user', 'pass')
    .poolSize(50, 10) // min > max - invalid!
    .build();
} catch (error) {
  console.error('Expected error:', error instanceof Error ? error.message : error);
}

// Example 12: Complete production configuration
console.log('\nExample 12: Production-ready configuration');
const productionConfig = PgConfig.builder()
  .host('prod-primary.db.example.com')
  .port(5432)
  .database('production')
  .credentials('prod_user', 'secure_password')
  .sslMode(SslMode.VerifyFull)
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
    healthCheckInterval: 30000,
  })
  .queryTimeout(30000)
  .connectTimeout(10000)
  .statementCacheSize(200)
  .applicationName('production-app')
  .addReplicaHost('prod-replica1.db.example.com')
  .addReplicaHost('prod-replica2.db.example.com')
  .addReplicaHost('prod-replica3.db.example.com')
  .routingPolicy(RoutingPolicy.ReadReplica)
  .build();

console.log(JSON.stringify(productionConfig, null, 2));

// Example 13: Environment variable configuration with replicas
console.log('\nExample 13: Environment variables with replicas');
process.env.PG_HOST = 'primary.example.com';
process.env.PG_DATABASE = 'mydb';
process.env.PG_USERNAME = 'user';
process.env.PG_PASSWORD = 'pass';
process.env.PG_REPLICA_HOSTS = 'replica1.example.com:5432,replica2.example.com:5432,replica3.example.com:5433';
process.env.PG_POOL_MIN = '10';
process.env.PG_POOL_MAX = '50';
process.env.PG_QUERY_TIMEOUT = '60000';

const replicaConfig = createConfigFromEnv();
console.log(JSON.stringify(replicaConfig, null, 2));
