# MySQL Integration Module - Completion

**SPARC Phase 5: Completion**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/database/mysql`

---

## 1. Final Implementation Structure

```
integrations/database/mysql/
├── mod.rs                          # Public API exports
├── client.rs                       # MysqlClient implementation
├── config.rs                       # Configuration types
├── error.rs                        # Error types and mapping
│
├── types/
│   ├── mod.rs                      # Type exports
│   ├── connection.rs               # Connection, ConnectionState
│   ├── query.rs                    # Query, Value, ResultSet, Row
│   ├── column.rs                   # ColumnMetadata, ColumnType, ColumnFlags
│   ├── transaction.rs              # Transaction, IsolationLevel, Savepoint
│   ├── replica.rs                  # ReplicaConfig, ReplicaStatus, LoadBalanceStrategy
│   └── metadata.rs                 # TableInfo, ColumnInfo, IndexInfo, ExplainResult
│
├── pool/
│   ├── mod.rs                      # Pool exports
│   ├── connection_pool.rs          # ConnectionPool implementation
│   ├── pool_config.rs              # PoolConfig
│   ├── health_checker.rs           # Background health monitor
│   ├── stats.rs                    # PoolStats
│   └── waiter.rs                   # Connection waiter queue
│
├── services/
│   ├── mod.rs                      # Service exports
│   ├── connection.rs               # ConnectionService (5 operations)
│   ├── query.rs                    # QueryService (7 operations)
│   ├── transaction.rs              # TransactionService (6 operations)
│   ├── replica.rs                  # ReplicaService (4 operations)
│   ├── metadata.rs                 # MetadataService (6 operations)
│   └── health.rs                   # HealthService (4 operations)
│
├── routing/
│   ├── mod.rs                      # Routing exports
│   ├── router.rs                   # Query router
│   ├── load_balancer.rs            # Load balancing strategies
│   └── statement_parser.rs         # SQL statement type detection
│
├── prepared/
│   ├── mod.rs                      # Prepared statement exports
│   ├── cache.rs                    # LRU statement cache
│   └── statement.rs                # PreparedStatement
│
├── simulation/
│   ├── mod.rs                      # Simulation exports
│   ├── mock_client.rs              # MockMysqlClient
│   ├── mock_connection.rs          # Mock connection
│   ├── mock_pool.rs                # Mock pool
│   ├── recorder.rs                 # Query recording
│   └── replay.rs                   # Query replay
│
└── tests/
    ├── unit/
    │   ├── pool_test.rs            # Pool tests
    │   ├── router_test.rs          # Routing tests
    │   ├── transaction_test.rs     # Transaction tests
    │   ├── parser_test.rs          # Statement parser tests
    │   └── error_test.rs           # Error mapping tests
    ├── integration/
    │   ├── query_test.rs           # Query execution tests
    │   ├── replica_test.rs         # Replica routing tests
    │   ├── transaction_test.rs     # Transaction workflow tests
    │   ├── streaming_test.rs       # Large result tests
    │   └── metadata_test.rs        # Metadata tests
    └── fixtures/
        ├── schemas/                # Test schemas
        ├── data/                   # Test data
        └── recordings/             # Replay recordings
```

---

## 2. Implementation Components

### 2.1 Core Components (12)

| Component | File | Description |
|-----------|------|-------------|
| `MysqlClient` | `client.rs` | Main client with pool management |
| `MysqlConfig` | `config.rs` | Configuration with connection/pool/replica settings |
| `ConnectionConfig` | `config.rs` | Connection parameters |
| `PoolConfig` | `pool/pool_config.rs` | Pool tuning parameters |
| `ReplicaConfig` | `types/replica.rs` | Replica topology configuration |
| `MysqlError` | `error.rs` | Domain error types |
| `ErrorMapper` | `error.rs` | MySQL code to domain error mapping |
| `ConnectionPool` | `pool/connection_pool.rs` | Pool implementation |
| `HealthChecker` | `pool/health_checker.rs` | Background health monitor |
| `QueryRouter` | `routing/router.rs` | Read/write routing |
| `LoadBalancer` | `routing/load_balancer.rs` | Replica selection |
| `PreparedCache` | `prepared/cache.rs` | LRU statement cache |

### 2.2 Type Components (18)

| Component | File | Description |
|-----------|------|-------------|
| `Connection` | `types/connection.rs` | Connection handle |
| `ConnectionState` | `types/connection.rs` | Idle/InUse/InTransaction/Closed |
| `Query` | `types/query.rs` | SQL with parameters |
| `Value` | `types/query.rs` | Parameter value variants |
| `ResultSet` | `types/query.rs` | Query result with rows |
| `Row` | `types/query.rs` | Single result row |
| `ColumnMetadata` | `types/column.rs` | Column information |
| `ColumnType` | `types/column.rs` | MySQL column types |
| `Transaction` | `types/transaction.rs` | Active transaction handle |
| `IsolationLevel` | `types/transaction.rs` | Transaction isolation |
| `Savepoint` | `types/transaction.rs` | Transaction savepoint |
| `ReplicaEndpoint` | `types/replica.rs` | Replica connection info |
| `ReplicaStatus` | `types/replica.rs` | Replication status |
| `LoadBalanceStrategy` | `types/replica.rs` | Selection strategy enum |
| `TableInfo` | `types/metadata.rs` | Table metadata |
| `ColumnInfo` | `types/metadata.rs` | Column schema info |
| `IndexInfo` | `types/metadata.rs` | Index metadata |
| `ExplainResult` | `types/metadata.rs` | Query plan result |

### 2.3 Service Components (6)

| Component | File | Operations |
|-----------|------|------------|
| `ConnectionService` | `services/connection.rs` | acquire, release, pool_status, health_check, reconfigure |
| `QueryService` | `services/query.rs` | execute, query, query_one, query_stream, execute_batch, prepare, execute_prepared |
| `TransactionService` | `services/transaction.rs` | begin, commit, rollback, savepoint, rollback_to_savepoint, with_transaction |
| `ReplicaService` | `services/replica.rs` | get_primary, get_replica, get_replica_status, route_query |
| `MetadataService` | `services/metadata.rs` | list_databases, list_tables, describe_table, list_indexes, get_table_stats, explain_query |
| `HealthService` | `services/health.rs` | ping, check_replication, get_server_status, get_process_list |

### 2.4 Routing Components (3)

| Component | File | Description |
|-----------|------|-------------|
| `QueryRouter` | `routing/router.rs` | Statement type detection, routing decisions |
| `LoadBalancer` | `routing/load_balancer.rs` | RoundRobin, Weighted, LeastConnections |
| `StatementParser` | `routing/statement_parser.rs` | SQL parsing for routing |

### 2.5 Simulation Components (5)

| Component | File | Description |
|-----------|------|-------------|
| `MockMysqlClient` | `simulation/mock_client.rs` | Mock client implementation |
| `MockConnection` | `simulation/mock_connection.rs` | Mock connection |
| `MockPool` | `simulation/mock_pool.rs` | Mock pool with state |
| `QueryRecorder` | `simulation/recorder.rs` | Record query/response pairs |
| `ReplayEngine` | `simulation/replay.rs` | Replay recorded sessions |

---

## 3. Public API

### 3.1 Client Interface

```rust
// Client creation
pub fn create_mysql_client(config: MysqlConfig) -> Result<MysqlClient, MysqlError>;

// Connection operations
pub async fn acquire_connection(client: &MysqlClient) -> Result<Connection, MysqlError>;
pub fn release_connection(client: &MysqlClient, conn: Connection);
pub fn get_pool_status(client: &MysqlClient) -> PoolStats;
pub async fn health_check(client: &MysqlClient) -> Result<HealthStatus, MysqlError>;

// Query operations
pub async fn execute(
    client: &MysqlClient,
    sql: &str,
    params: Vec<Value>,
) -> Result<ExecuteResult, MysqlError>;

pub async fn query(
    client: &MysqlClient,
    sql: &str,
    params: Vec<Value>,
) -> Result<ResultSet, MysqlError>;

pub async fn query_one(
    client: &MysqlClient,
    sql: &str,
    params: Vec<Value>,
) -> Result<Option<Row>, MysqlError>;

pub fn query_stream(
    client: &MysqlClient,
    sql: &str,
    params: Vec<Value>,
    options: StreamOptions,
) -> Result<RowStream, MysqlError>;

pub async fn execute_batch(
    client: &MysqlClient,
    statements: Vec<Query>,
) -> Result<Vec<ExecuteResult>, MysqlError>;

// Prepared statements
pub async fn prepare(
    client: &MysqlClient,
    sql: &str,
) -> Result<PreparedStatement, MysqlError>;

pub async fn execute_prepared(
    client: &MysqlClient,
    stmt: &PreparedStatement,
    params: Vec<Value>,
) -> Result<ResultSet, MysqlError>;

// Transaction operations
pub async fn begin_transaction(
    client: &MysqlClient,
    options: TransactionOptions,
) -> Result<Transaction, MysqlError>;

pub async fn commit(tx: Transaction) -> Result<(), MysqlError>;

pub async fn rollback(tx: Transaction) -> Result<(), MysqlError>;

pub async fn savepoint(
    tx: &mut Transaction,
    name: &str,
) -> Result<Savepoint, MysqlError>;

pub async fn rollback_to_savepoint(
    tx: &mut Transaction,
    savepoint: &Savepoint,
) -> Result<(), MysqlError>;

pub async fn with_transaction<T, F>(
    client: &MysqlClient,
    options: TransactionOptions,
    f: F,
) -> Result<T, MysqlError>
where
    F: FnOnce(&Transaction) -> Future<Output = Result<T, MysqlError>>;

// Replica operations
pub async fn get_primary(client: &MysqlClient) -> Result<Connection, MysqlError>;
pub async fn get_replica(client: &MysqlClient) -> Result<Connection, MysqlError>;
pub async fn get_replica_status(client: &MysqlClient) -> Result<Vec<ReplicaStatus>, MysqlError>;

// Metadata operations
pub async fn list_databases(client: &MysqlClient) -> Result<Vec<String>, MysqlError>;

pub async fn list_tables(
    client: &MysqlClient,
    database: &str,
) -> Result<Vec<TableInfo>, MysqlError>;

pub async fn describe_table(
    client: &MysqlClient,
    database: &str,
    table: &str,
) -> Result<Vec<ColumnInfo>, MysqlError>;

pub async fn list_indexes(
    client: &MysqlClient,
    database: &str,
    table: &str,
) -> Result<Vec<IndexInfo>, MysqlError>;

pub async fn explain_query(
    client: &MysqlClient,
    sql: &str,
) -> Result<Vec<ExplainResult>, MysqlError>;
```

### 3.2 Configuration API

```rust
// Configuration building
pub fn config_builder() -> MysqlConfigBuilder;

impl MysqlConfigBuilder {
    // Connection settings
    pub fn host(self, host: &str) -> Self;
    pub fn port(self, port: u16) -> Self;
    pub fn database(self, database: &str) -> Self;
    pub fn username(self, username: &str) -> Self;
    pub fn credential_key(self, key: &str) -> Self;
    pub fn ssl_mode(self, mode: SslMode) -> Self;
    pub fn ssl_ca(self, path: &str) -> Self;
    pub fn charset(self, charset: &str) -> Self;
    pub fn timezone(self, tz: &str) -> Self;
    pub fn connect_timeout_ms(self, timeout: u64) -> Self;

    // Pool settings
    pub fn min_connections(self, min: u32) -> Self;
    pub fn max_connections(self, max: u32) -> Self;
    pub fn acquire_timeout_ms(self, timeout: u64) -> Self;
    pub fn idle_timeout_ms(self, timeout: u64) -> Self;
    pub fn max_lifetime_ms(self, lifetime: u64) -> Self;

    // Replica settings
    pub fn add_replica(self, config: ReplicaEndpoint) -> Self;
    pub fn load_balance_strategy(self, strategy: LoadBalanceStrategy) -> Self;
    pub fn max_replica_lag_ms(self, lag: u64) -> Self;

    // Query settings
    pub fn default_query_timeout_ms(self, timeout: u64) -> Self;
    pub fn slow_query_threshold_ms(self, threshold: u64) -> Self;
    pub fn auto_route_reads(self, enabled: bool) -> Self;

    // Build
    pub fn build(self) -> Result<MysqlConfig, ConfigError>;
}
```

### 3.3 Simulation API

```rust
// Mock client creation
pub fn create_mock_client() -> MockMysqlClient;

impl MockMysqlClient {
    pub fn with_query_response(self, sql_pattern: &str, result: ResultSet) -> Self;
    pub fn with_execute_response(self, sql_pattern: &str, result: ExecuteResult) -> Self;
    pub fn with_error(self, sql_pattern: &str, error: MysqlError) -> Self;
    pub fn with_transaction_support(self) -> Self;
    pub fn with_replica(self, id: &str, lag_ms: u64) -> Self;
    pub fn with_latency(self, min_ms: u64, max_ms: u64) -> Self;
    pub fn get_operation_history(&self) -> Vec<RecordedOperation>;
    pub fn get_metrics(&self) -> MockMetrics;
    pub fn reset(&mut self);
}

// Recording and replay
pub fn create_recorder(output_file: &str) -> QueryRecorder;
pub fn wrap_for_recording(
    client: MysqlClient,
    recorder: &QueryRecorder,
) -> RecordingClient;

pub fn create_replay_client(recording_file: &str) -> Result<ReplayClient, ReplayError>;
```

---

## 4. Integration Points

### 4.1 Shared Module Dependencies

```rust
// shared/secrets integration
use shared_secrets::{get_credential, on_rotation, SecretString};

// shared/resilience integration
use shared_resilience::{
    RetryPolicy, CircuitBreaker, RateLimiter,
    with_retry, with_circuit_breaker
};

// shared/observability integration
use shared_observability::{
    emit_metric, start_span, log_structured,
    Metric, Span, LogLevel
};

// shared/vector-memory integration
use shared_vector_memory::{
    store_embedding, search_similar,
    EmbeddingStore, SearchQuery
};
```

### 4.2 Platform Integration

```rust
// Repository pattern integration
impl MysqlClient {
    pub fn repository<T: Entity>(&self) -> Repository<T> {
        Repository::new(self.clone())
    }
}

// Query builder integration
pub fn query_builder(table: &str) -> QueryBuilder {
    QueryBuilder::new(table)
}

impl QueryBuilder {
    pub fn select(self, columns: &[&str]) -> Self;
    pub fn where_eq(self, column: &str, value: Value) -> Self;
    pub fn where_in(self, column: &str, values: Vec<Value>) -> Self;
    pub fn order_by(self, column: &str, direction: SortDirection) -> Self;
    pub fn limit(self, limit: u32) -> Self;
    pub fn offset(self, offset: u32) -> Self;
    pub fn build(self) -> Query;
}
```

---

## 5. Usage Examples

### 5.1 Basic Query Operations

```rust
use integrations::database::mysql::{
    create_mysql_client, config_builder,
    query, execute, Value,
};

async fn basic_operations() -> Result<(), MysqlError> {
    // Create client
    let config = config_builder()
        .host("localhost")
        .port(3306)
        .database("myapp")
        .username("app_user")
        .credential_key("mysql/myapp/password")
        .ssl_mode(SslMode::Required)
        .max_connections(20)
        .build()?;

    let client = create_mysql_client(config)?;

    // Simple query
    let users = query(
        &client,
        "SELECT id, name, email FROM users WHERE active = ?",
        vec![Value::Bool(true)],
    ).await?;

    for row in users.rows {
        let id: i64 = row.get("id")?;
        let name: String = row.get("name")?;
        println!("User {}: {}", id, name);
    }

    // Insert with returning last insert id
    let result = execute(
        &client,
        "INSERT INTO users (name, email) VALUES (?, ?)",
        vec![Value::String("Alice".into()), Value::String("alice@example.com".into())],
    ).await?;

    println!("Inserted user with id: {:?}", result.last_insert_id);

    // Update
    let result = execute(
        &client,
        "UPDATE users SET last_login = NOW() WHERE id = ?",
        vec![Value::Int(1)],
    ).await?;

    println!("Updated {} rows", result.affected_rows);

    Ok(())
}
```

### 5.2 Transaction Handling

```rust
use integrations::database::mysql::{
    create_mysql_client, config_builder,
    with_transaction, TransactionOptions, IsolationLevel,
    execute, query_one, Value,
};

async fn transfer_funds(
    client: &MysqlClient,
    from_account: i64,
    to_account: i64,
    amount: f64,
) -> Result<(), MysqlError> {
    let options = TransactionOptions {
        isolation_level: Some(IsolationLevel::Serializable),
        read_only: false,
        timeout_ms: Some(10000),
    };

    with_transaction(&client, options, |tx| async move {
        // Check source balance
        let source = query_one(
            tx,
            "SELECT balance FROM accounts WHERE id = ? FOR UPDATE",
            vec![Value::Int(from_account)],
        ).await?;

        let source = source.ok_or(MysqlError::NotFound("Source account"))?;
        let balance: f64 = source.get("balance")?;

        if balance < amount {
            return Err(MysqlError::InsufficientFunds);
        }

        // Debit source
        execute(
            tx,
            "UPDATE accounts SET balance = balance - ? WHERE id = ?",
            vec![Value::Double(amount), Value::Int(from_account)],
        ).await?;

        // Credit destination
        execute(
            tx,
            "UPDATE accounts SET balance = balance + ? WHERE id = ?",
            vec![Value::Double(amount), Value::Int(to_account)],
        ).await?;

        // Record transfer
        execute(
            tx,
            "INSERT INTO transfers (from_id, to_id, amount, created_at) VALUES (?, ?, ?, NOW())",
            vec![
                Value::Int(from_account),
                Value::Int(to_account),
                Value::Double(amount),
            ],
        ).await?;

        Ok(())
    }).await
}
```

### 5.3 Read/Write Separation

```rust
use integrations::database::mysql::{
    create_mysql_client, config_builder,
    query, execute,
    ReplicaEndpoint, LoadBalanceStrategy,
};

async fn read_write_separation() -> Result<(), MysqlError> {
    // Configure with replicas
    let config = config_builder()
        .host("primary.db.example.com")
        .port(3306)
        .database("myapp")
        .username("app_user")
        .credential_key("mysql/myapp/password")
        .add_replica(ReplicaEndpoint {
            host: "replica1.db.example.com".into(),
            port: 3306,
            weight: 2,
            priority: 0,
        })
        .add_replica(ReplicaEndpoint {
            host: "replica2.db.example.com".into(),
            port: 3306,
            weight: 1,
            priority: 0,
        })
        .load_balance_strategy(LoadBalanceStrategy::WeightedRoundRobin)
        .max_replica_lag_ms(1000)
        .auto_route_reads(true)
        .build()?;

    let client = create_mysql_client(config)?;

    // This query automatically routes to a replica
    let products = query(
        &client,
        "SELECT * FROM products WHERE category = ?",
        vec![Value::String("electronics".into())],
    ).await?;

    // This executes on primary (write operation)
    execute(
        &client,
        "UPDATE products SET view_count = view_count + 1 WHERE id = ?",
        vec![Value::Int(123)],
    ).await?;

    // Force read from primary with hint
    let critical_data = query(
        &client,
        "/*+ PRIMARY */ SELECT * FROM orders WHERE id = ?",
        vec![Value::Int(456)],
    ).await?;

    Ok(())
}
```

### 5.4 Streaming Large Results

```rust
use integrations::database::mysql::{
    create_mysql_client, config_builder,
    query_stream, StreamOptions,
};

async fn process_large_dataset(client: &MysqlClient) -> Result<(), MysqlError> {
    let options = StreamOptions {
        batch_size: 1000,
        timeout_ms: Some(300000),
    };

    let mut stream = query_stream(
        client,
        "SELECT * FROM events WHERE created_at > ?",
        vec![Value::DateTime(one_week_ago())],
        options,
    )?;

    let mut processed = 0;

    while let Some(batch) = stream.next_batch().await? {
        for row in batch {
            let event_id: i64 = row.get("id")?;
            let event_type: String = row.get("event_type")?;

            // Process event
            process_event(event_id, &event_type).await?;
            processed += 1;
        }

        println!("Processed {} events so far", processed);
    }

    println!("Total processed: {} events", processed);
    Ok(())
}
```

### 5.5 Prepared Statement Usage

```rust
use integrations::database::mysql::{
    create_mysql_client, prepare, execute_prepared,
    Value,
};

async fn bulk_insert(client: &MysqlClient, records: Vec<Record>) -> Result<(), MysqlError> {
    // Prepare statement once
    let stmt = prepare(
        client,
        "INSERT INTO records (name, value, created_at) VALUES (?, ?, NOW())",
    ).await?;

    // Execute multiple times
    for record in records {
        execute_prepared(
            client,
            &stmt,
            vec![
                Value::String(record.name),
                Value::Double(record.value),
            ],
        ).await?;
    }

    Ok(())
}
```

### 5.6 Testing with Mock Client

```rust
use integrations::database::mysql::simulation::{
    create_mock_client, ResultSet, Row, Value,
};

#[tokio::test]
async fn test_user_service() {
    // Create mock client with predefined responses
    let mock = create_mock_client()
        .with_query_response(
            "SELECT * FROM users WHERE id = ?",
            ResultSet {
                columns: vec![/* column metadata */],
                rows: vec![Row::new(vec![
                    Value::Int(1),
                    Value::String("Alice".into()),
                    Value::String("alice@example.com".into()),
                ])],
                affected_rows: 0,
                last_insert_id: None,
                warnings: 0,
            },
        )
        .with_execute_response(
            "UPDATE users SET last_login = NOW() WHERE id = ?",
            ExecuteResult {
                affected_rows: 1,
                last_insert_id: None,
            },
        );

    // Test user service
    let user_service = UserService::new(mock.clone());

    let user = user_service.get_by_id(1).await.unwrap();
    assert_eq!(user.name, "Alice");

    user_service.record_login(1).await.unwrap();

    // Verify operations
    let history = mock.get_operation_history();
    assert_eq!(history.len(), 2);
    assert_eq!(history[0].sql, "SELECT * FROM users WHERE id = ?");
    assert_eq!(history[1].sql, "UPDATE users SET last_login = NOW() WHERE id = ?");
}

#[tokio::test]
async fn test_transaction_rollback_on_error() {
    let mock = create_mock_client()
        .with_transaction_support()
        .with_error(
            "UPDATE accounts SET balance = balance - ?",
            MysqlError::ConstraintViolation("balance cannot be negative".into()),
        );

    let result = transfer_funds(&mock, 1, 2, 1000.0).await;

    assert!(result.is_err());
    assert!(mock.get_metrics().transactions_rolled_back == 1);
}
```

---

## 6. Deployment Checklist

### 6.1 Configuration Requirements

| Requirement | Description | Default |
|-------------|-------------|---------|
| Host | MySQL server hostname | Required |
| Port | MySQL server port | 3306 |
| Database | Database name | Required |
| Username | Connection username | Required |
| Credential Key | Secrets manager key | Required |
| SSL Mode | Connection encryption | Required (production) |
| Min Connections | Pool minimum | 5 |
| Max Connections | Pool maximum | 20 |

### 6.2 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `MYSQL_HOST` | MySQL host override | No |
| `MYSQL_PORT` | MySQL port override | No |
| `MYSQL_DATABASE` | Database name override | No |
| `MYSQL_SSL_CA` | Path to CA certificate | Production |
| `MYSQL_MAX_CONNECTIONS` | Pool size override | No |

### 6.3 MySQL Server Requirements

```sql
-- Required privileges for application user
GRANT SELECT, INSERT, UPDATE, DELETE ON myapp.* TO 'app_user'@'%';

-- For metadata operations
GRANT SELECT ON information_schema.* TO 'app_user'@'%';

-- For replication status (replica routing)
GRANT REPLICATION CLIENT ON *.* TO 'app_user'@'%';

-- Recommended server settings
SET GLOBAL max_connections = 200;
SET GLOBAL wait_timeout = 600;
SET GLOBAL interactive_timeout = 600;
SET GLOBAL innodb_lock_wait_timeout = 30;
```

### 6.4 Observability Setup

```yaml
# Metrics to monitor
metrics:
  - mysql.connections.total
  - mysql.connections.active
  - mysql.connections.waiting
  - mysql.pool.acquire_time_ms
  - mysql.queries.count
  - mysql.queries.latency_ms
  - mysql.queries.errors
  - mysql.queries.slow
  - mysql.transactions.count
  - mysql.transactions.duration_ms
  - mysql.replica.lag_ms
  - mysql.circuit_breaker.state

# Alerts to configure
alerts:
  - name: MySQL Pool Exhausted
    condition: mysql.connections.waiting > 10
    duration: 1m

  - name: MySQL High Query Latency
    condition: mysql.queries.latency_ms{quantile="0.99"} > 1000
    duration: 5m

  - name: MySQL Replica Lag High
    condition: mysql.replica.lag_ms > 5000
    duration: 2m

  - name: MySQL Circuit Breaker Open
    condition: mysql.circuit_breaker.state == 1
    duration: 0m

  - name: MySQL Deadlock Rate High
    condition: rate(mysql.deadlock.detected[5m]) > 1
    duration: 5m

# Log queries
logs:
  - name: MySQL Errors
    query: module="mysql" level="error"

  - name: Slow Queries
    query: module="mysql" message="Slow query detected"

  - name: Transaction Failures
    query: module="mysql" event_type=~"TRANSACTION_(ROLLED|ABORTED)"
```

---

## 7. Validation Criteria

### 7.1 Functional Requirements

| Requirement | Validation Method |
|-------------|-------------------|
| Basic CRUD operations | Integration tests |
| Prepared statements | Unit + integration tests |
| Transaction management | Integration tests with rollback |
| Read/write routing | Mock tests with replica simulation |
| Streaming results | Load test with large dataset |
| Connection pooling | Stress tests with pool exhaustion |
| Replica failover | Fault injection tests |
| Deadlock retry | Simulated deadlock scenarios |

### 7.2 Non-Functional Requirements

| Requirement | Target | Validation |
|-------------|--------|------------|
| Query latency P99 | < 100ms | Load test |
| Connection acquire P99 | < 50ms | Pool stress test |
| Pool utilization | < 80% normal | Monitoring |
| Replica lag tolerance | < 1000ms | Health checks |
| Deadlock retry success | > 90% | Integration test |
| Memory per connection | < 1MB | Profiling |

### 7.3 Security Requirements

| Requirement | Validation |
|-------------|------------|
| SSL/TLS in production | Configuration validation |
| Parameterized queries only | Code review + static analysis |
| No credential logging | Log audit |
| Credential rotation | Integration test |
| Connection encryption | Network capture test |

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-mysql.md | Complete |
| 2. Pseudocode | pseudocode-mysql.md | Complete |
| 3. Architecture | architecture-mysql.md | Complete |
| 4. Refinement | refinement-mysql.md | Complete |
| 5. Completion | completion-mysql.md | Complete |

---

## Implementation Summary

The MySQL integration module provides a thin adapter layer with:

- **6 service components** covering 32 operations
- **18 type definitions** for MySQL domain objects
- **12 core components** for connection pooling and routing
- **5 simulation components** for testing
- **Read/write separation** with automatic query routing
- **Connection pooling** with health monitoring
- **Transaction support** with savepoints and isolation levels
- **Prepared statement caching** for performance
- **Replica load balancing** with lag awareness
- **Comprehensive error handling** with retry strategies

The module delegates to shared platform components for secrets, resilience, observability, and vector memory, maintaining the thin adapter principle throughout.

---

*Phase 5: Completion - Complete*
*SPARC Documentation Complete*
