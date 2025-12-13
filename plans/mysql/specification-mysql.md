# MySQL Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/database/mysql`

---

## 1. Overview

### 1.1 Purpose

Provide a thin adapter layer enabling the LLM Dev Ops platform to interact with MySQL databases for structured data access, transactional workloads, metadata storage, and analytical queries, supporting both single-instance and clustered deployments with read/write separation.

### 1.2 Scope

**In Scope:**
- Connection pooling and lifecycle management
- Query execution (SELECT, INSERT, UPDATE, DELETE)
- Prepared statement support
- Transaction management (BEGIN, COMMIT, ROLLBACK)
- Read/write endpoint separation (primary/replica)
- Result set streaming for large queries
- Query timeout and cancellation
- Connection health monitoring
- Metadata introspection (tables, columns, indexes)
- Query execution plan analysis (EXPLAIN)
- Batch operations
- Simulation and replay

**Out of Scope:**
- Database provisioning and configuration
- Schema creation and migration
- User and permission management
- Backup and restore operations
- Replication configuration
- MySQL server administration
- Core orchestration logic

### 1.3 Thin Adapter Principle

| Concern | Delegation |
|---------|------------|
| Credential management | `shared/secrets` module |
| Retry with backoff | `shared/resilience` |
| Circuit breaker | `shared/resilience` |
| Metrics emission | `shared/observability` |
| Distributed tracing | `shared/observability` |
| Structured logging | `shared/observability` |
| Vector embeddings | `shared/vector-memory` |

---

## 2. API Operations

### 2.1 ConnectionService

| Operation | Description |
|-----------|-------------|
| `acquire_connection` | Get connection from pool |
| `release_connection` | Return connection to pool |
| `get_pool_status` | Pool statistics (active, idle, waiting) |
| `health_check` | Verify connection health |
| `reconfigure_pool` | Adjust pool parameters at runtime |

### 2.2 QueryService

| Operation | Description |
|-----------|-------------|
| `execute` | Execute SQL returning affected rows |
| `query` | Execute query returning result set |
| `query_one` | Execute query expecting single row |
| `query_stream` | Execute query with streaming results |
| `execute_batch` | Execute multiple statements |
| `prepare` | Create prepared statement |
| `execute_prepared` | Execute prepared statement |

### 2.3 TransactionService

| Operation | Description |
|-----------|-------------|
| `begin` | Start transaction |
| `commit` | Commit transaction |
| `rollback` | Rollback transaction |
| `savepoint` | Create savepoint |
| `rollback_to_savepoint` | Rollback to savepoint |
| `with_transaction` | Execute closure in transaction |

### 2.4 ReplicaService

| Operation | Description |
|-----------|-------------|
| `get_primary` | Get primary (write) connection |
| `get_replica` | Get replica (read) connection |
| `get_replica_status` | Check replica lag |
| `route_query` | Automatic read/write routing |

### 2.5 MetadataService

| Operation | Description |
|-----------|-------------|
| `list_databases` | List accessible databases |
| `list_tables` | List tables in database |
| `describe_table` | Get table schema |
| `list_indexes` | List indexes on table |
| `get_table_stats` | Get table statistics |
| `explain_query` | Get query execution plan |

### 2.6 HealthService

| Operation | Description |
|-----------|-------------|
| `ping` | Basic connectivity check |
| `check_replication` | Verify replication status |
| `get_server_status` | Get server variables |
| `get_process_list` | Get active connections |

---

## 3. Core Types

### 3.1 Connection Types

```
ConnectionConfig:
  host: String
  port: u16                      # Default: 3306
  database: String
  username: String
  password: SecretString
  ssl_mode: SslMode
  ssl_ca: Option<String>
  ssl_cert: Option<String>
  ssl_key: Option<String>
  charset: String                # Default: utf8mb4
  collation: String              # Default: utf8mb4_unicode_ci
  timezone: Option<String>
  connect_timeout_ms: u64        # Default: 10000
  read_timeout_ms: Option<u64>
  write_timeout_ms: Option<u64>

SslMode:
  | Disabled
  | Preferred
  | Required
  | VerifyCA
  | VerifyIdentity

PoolConfig:
  min_connections: u32           # Default: 5
  max_connections: u32           # Default: 20
  acquire_timeout_ms: u64        # Default: 30000
  idle_timeout_ms: u64           # Default: 600000
  max_lifetime_ms: u64           # Default: 1800000
  validation_interval_ms: u64    # Default: 30000
  validation_query: String       # Default: "SELECT 1"

Connection:
  id: ConnectionId
  state: ConnectionState
  created_at: DateTime
  last_used_at: DateTime
  transaction_depth: u32

ConnectionState:
  | Idle
  | InUse
  | InTransaction
  | Closed
```

### 3.2 Query Types

```
Query:
  sql: String
  params: Vec<Value>
  timeout_ms: Option<u64>

PreparedStatement:
  id: StatementId
  sql: String
  param_count: usize
  columns: Vec<ColumnMetadata>

Value:
  | Null
  | Bool(bool)
  | Int(i64)
  | UInt(u64)
  | Float(f64)
  | Double(f64)
  | String(String)
  | Bytes(Vec<u8>)
  | Date(Date)
  | Time(Time)
  | DateTime(DateTime)
  | Timestamp(i64)
  | Decimal(Decimal)
  | Json(JsonValue)

ResultSet:
  columns: Vec<ColumnMetadata>
  rows: Vec<Row>
  affected_rows: u64
  last_insert_id: Option<u64>
  warnings: u16

Row:
  values: Vec<Value>

ColumnMetadata:
  name: String
  table: Option<String>
  database: Option<String>
  column_type: ColumnType
  flags: ColumnFlags
  decimals: u8
  max_length: u32

ColumnType:
  | TinyInt | SmallInt | MediumInt | Int | BigInt
  | Float | Double | Decimal
  | Char | VarChar | Text | MediumText | LongText
  | Binary | VarBinary | Blob | MediumBlob | LongBlob
  | Date | Time | DateTime | Timestamp | Year
  | Enum | Set | Bit | Json | Geometry
```

### 3.3 Transaction Types

```
Transaction:
  id: TransactionId
  connection: Connection
  isolation_level: IsolationLevel
  started_at: DateTime
  savepoints: Vec<Savepoint>

IsolationLevel:
  | ReadUncommitted
  | ReadCommitted
  | RepeatableRead      # MySQL default
  | Serializable

Savepoint:
  name: String
  created_at: DateTime

TransactionOptions:
  isolation_level: Option<IsolationLevel>
  read_only: bool
  timeout_ms: Option<u64>
```

### 3.4 Replica Types

```
ReplicaConfig:
  primary: ConnectionConfig
  replicas: Vec<ReplicaEndpoint>
  load_balance_strategy: LoadBalanceStrategy
  max_replica_lag_ms: u64        # Default: 1000

ReplicaEndpoint:
  config: ConnectionConfig
  weight: u32                    # Default: 1
  priority: u32                  # Default: 0

LoadBalanceStrategy:
  | RoundRobin
  | Random
  | LeastConnections
  | WeightedRoundRobin

ReplicaStatus:
  endpoint: String
  seconds_behind_master: Option<u64>
  io_running: bool
  sql_running: bool
  last_error: Option<String>
```

### 3.5 Metadata Types

```
TableInfo:
  name: String
  database: String
  engine: String
  row_format: String
  rows: u64
  avg_row_length: u64
  data_length: u64
  index_length: u64
  auto_increment: Option<u64>
  create_time: DateTime
  update_time: Option<DateTime>
  collation: String
  comment: String

ColumnInfo:
  name: String
  ordinal_position: u32
  default: Option<String>
  is_nullable: bool
  data_type: String
  column_type: String
  max_length: Option<u64>
  numeric_precision: Option<u32>
  numeric_scale: Option<u32>
  character_set: Option<String>
  collation: Option<String>
  column_key: ColumnKey
  extra: String
  comment: String

ColumnKey:
  | None
  | Primary
  | Unique
  | Multiple
  | ForeignKey

IndexInfo:
  name: String
  table: String
  unique: bool
  index_type: IndexType
  columns: Vec<IndexColumn>
  comment: String

IndexType:
  | BTree
  | Hash
  | FullText
  | Spatial

IndexColumn:
  name: String
  ordinal: u32
  direction: SortDirection
  sub_part: Option<u32>

ExplainResult:
  id: u32
  select_type: String
  table: Option<String>
  partitions: Option<String>
  access_type: AccessType
  possible_keys: Option<String>
  key: Option<String>
  key_len: Option<String>
  ref_: Option<String>
  rows: u64
  filtered: f64
  extra: Option<String>

AccessType:
  | System | Const | EqRef | Ref | FullText
  | RefOrNull | IndexMerge | UniqueSubquery
  | IndexSubquery | Range | Index | All
```

### 3.6 Pool Statistics

```
PoolStats:
  total_connections: u32
  active_connections: u32
  idle_connections: u32
  waiting_requests: u32
  max_connections: u32
  connections_created: u64
  connections_closed: u64
  acquire_count: u64
  acquire_timeout_count: u64
  avg_acquire_time_ms: f64
```

---

## 4. Configuration

```
MysqlConfig:
  # Connection settings
  connection: ConnectionConfig

  # Pool settings
  pool: PoolConfig

  # Replica settings (optional)
  replica: Option<ReplicaConfig>

  # Query settings
  default_query_timeout_ms: u64     # Default: 30000
  max_query_size_bytes: usize       # Default: 16777216 (16MB)
  stream_batch_size: u32            # Default: 1000

  # Resilience settings
  max_retries: u32                  # Default: 3
  circuit_breaker_threshold: u32    # Default: 5
  circuit_breaker_timeout_ms: u64   # Default: 60000

  # Tracing settings
  log_queries: bool                 # Default: false
  slow_query_threshold_ms: u64      # Default: 1000

  # Read/write separation
  auto_route_reads: bool            # Default: true
  transaction_on_primary: bool      # Default: true
```

---

## 5. Error Taxonomy

| Error Type | MySQL Error | Retryable | Description |
|------------|-------------|-----------|-------------|
| `ConnectionRefused` | 2003 | Yes | Cannot connect to server |
| `AuthenticationFailed` | 1045 | No | Access denied |
| `DatabaseNotFound` | 1049 | No | Unknown database |
| `TableNotFound` | 1146 | No | Table doesn't exist |
| `DuplicateKey` | 1062 | No | Duplicate entry for key |
| `ForeignKeyViolation` | 1451, 1452 | No | Foreign key constraint |
| `DataTooLong` | 1406 | No | Data too long for column |
| `DeadlockDetected` | 1213 | Yes | Deadlock found |
| `LockWaitTimeout` | 1205 | Yes | Lock wait timeout |
| `QueryTimeout` | - | Yes | Query execution timeout |
| `ConnectionLost` | 2006, 2013 | Yes | Connection lost |
| `TooManyConnections` | 1040 | Yes | Too many connections |
| `ServerGone` | 2006 | Yes | Server has gone away |
| `SyntaxError` | 1064 | No | SQL syntax error |
| `AccessDenied` | 1142 | No | Permission denied |
| `ReadOnlyTransaction` | 1792 | No | Cannot execute in read-only |
| `TransactionAborted` | 1180 | No | Transaction rolled back |

---

## 6. Rate Limits and Quotas

| Limit | Description | Default |
|-------|-------------|---------|
| Max connections per pool | Per-pool connection limit | 20 |
| Max query size | Maximum query bytes | 16MB |
| Query timeout | Default execution timeout | 30s |
| Connection timeout | Connection establish timeout | 10s |
| Idle connection timeout | Close idle connections after | 10min |
| Connection max lifetime | Force reconnect after | 30min |
| Max prepared statements | Per-connection cache | 256 |
| Batch operation size | Max statements per batch | 1000 |

---

## 7. Security Requirements

### 7.1 Credential Protection
- Passwords via `SecretString`
- SSL/TLS for connections
- Certificate validation options
- No credential logging

### 7.2 Query Safety
- Parameterized queries only (no string interpolation)
- Query size limits
- Statement type validation
- SQL injection prevention

### 7.3 Connection Security
- SSL mode enforcement
- Certificate chain validation
- Connection encryption
- Secure connection pooling

### 7.4 Audit Requirements
- Query logging (without parameters in production)
- Connection lifecycle events
- Transaction events
- Error logging (sanitized)

---

## 8. Simulation Requirements

### 8.1 MockMysqlClient
- Simulate all query operations
- Configurable result sets
- Inject errors for testing
- Track query history

### 8.2 Query Replay
- Record query/response pairs
- Replay for regression testing
- Parameter matching

### 8.3 Transaction Simulation
- Simulate commit/rollback
- Deadlock injection
- Isolation level behavior

---

## 9. Integration Points

### 9.1 Shared Modules

```
shared/secrets:
  - get_credential(key) -> SecretString
  - rotate_credential(key) -> SecretString

shared/resilience:
  - RetryPolicy for transient errors
  - CircuitBreaker per endpoint
  - ConnectionPool management

shared/observability:
  - Metrics: mysql.queries, mysql.connections, mysql.latency
  - Traces: span per query/transaction
  - Logs: structured, parameter-redacted

shared/vector-memory:
  - store_query_embedding(query_hash, metadata)
  - search_similar_queries(query)
```

### 9.2 Related Integrations

```
analytics:
  - Query result caching
  - Aggregation pipelines

data-sync:
  - Change data capture
  - Cross-database sync
```

---

## 10. Read/Write Separation

### 10.1 Routing Rules

```
Write Operations (Primary):
  - INSERT, UPDATE, DELETE
  - CREATE, ALTER, DROP
  - LOCK, UNLOCK
  - All transactions
  - SET commands

Read Operations (Replica):
  - SELECT (outside transaction)
  - SHOW commands
  - DESCRIBE, EXPLAIN
  - Information schema queries
```

### 10.2 Replica Lag Handling

```
Lag Detection:
  - Monitor Seconds_Behind_Master
  - Track GTID positions
  - Health check intervals

Lag Mitigation:
  - Skip lagging replicas
  - Fall back to primary
  - Configurable thresholds
```

---

## 11. MySQL Version Compatibility

| Feature | MySQL 5.7 | MySQL 8.0 |
|---------|-----------|-----------|
| JSON columns | Yes | Yes |
| Window functions | No | Yes |
| CTEs | No | Yes |
| EXPLAIN ANALYZE | No | Yes (8.0.18+) |
| Multi-valued indexes | No | Yes |
| Invisible indexes | No | Yes |
| Instant DDL | Limited | Yes |

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-mysql.md | Complete |
| 2. Pseudocode | pseudocode-mysql.md | Pending |
| 3. Architecture | architecture-mysql.md | Pending |
| 4. Refinement | refinement-mysql.md | Pending |
| 5. Completion | completion-mysql.md | Pending |

---

*Phase 1: Specification - Complete*
