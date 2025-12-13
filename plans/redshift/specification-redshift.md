# Amazon Redshift Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/aws/redshift`

---

## 1. Overview

### 1.1 Purpose

Provide a thin adapter layer enabling the LLM Dev Ops platform to interact with Amazon Redshift as a cloud data warehouse for analytical queries, batch data ingestion, feature extraction, and reporting workflows.

### 1.2 Scope

**In Scope:**
- Query execution (synchronous and asynchronous)
- Prepared statements and parameterized queries
- Batch data loading (COPY command orchestration)
- Data unloading (UNLOAD command orchestration)
- Connection pooling and management
- Workload Management (WLM) queue awareness
- Query monitoring and cancellation
- Result set streaming and pagination
- Transaction management
- Federated query support (Redshift Spectrum)
- Materialized view refresh triggering
- Simulation and replay

**Out of Scope:**
- Cluster provisioning and scaling
- Schema design and DDL management
- Snapshot and backup operations
- User and permission management
- VPC and network configuration
- Core orchestration logic

### 1.3 Thin Adapter Principle

| Concern | Delegation |
|---------|------------|
| AWS credential management | `aws/auth` module |
| Retry with backoff | `shared/resilience` |
| Circuit breaker | `shared/resilience` |
| Metrics emission | `shared/observability` |
| Distributed tracing | `shared/observability` |
| Structured logging | `shared/observability` |
| Vector embeddings | `shared/vector-memory` |

---

## 2. API Operations

### 2.1 QueryService

| Operation | Description |
|-----------|-------------|
| `execute_query` | Execute SQL query synchronously |
| `execute_query_async` | Submit query for async execution |
| `get_query_status` | Check async query status |
| `get_query_results` | Retrieve async query results |
| `cancel_query` | Cancel running query |
| `stream_results` | Stream large result sets |
| `explain_query` | Get query execution plan |

### 2.2 PreparedStatementService

| Operation | Description |
|-----------|-------------|
| `prepare` | Create prepared statement |
| `execute_prepared` | Execute with parameters |
| `deallocate` | Release prepared statement |
| `batch_execute` | Execute with multiple parameter sets |

### 2.3 DataLoadService

| Operation | Description |
|-----------|-------------|
| `copy_from_s3` | Load data from S3 via COPY |
| `copy_from_dynamodb` | Load from DynamoDB table |
| `copy_status` | Check COPY operation status |
| `validate_copy` | Validate COPY parameters |
| `get_load_errors` | Retrieve STL_LOAD_ERRORS |

### 2.4 DataUnloadService

| Operation | Description |
|-----------|-------------|
| `unload_to_s3` | Export data to S3 via UNLOAD |
| `unload_status` | Check UNLOAD operation status |
| `validate_unload` | Validate UNLOAD parameters |

### 2.5 ConnectionService

| Operation | Description |
|-----------|-------------|
| `get_connection` | Acquire connection from pool |
| `release_connection` | Return connection to pool |
| `health_check` | Verify cluster connectivity |
| `get_pool_stats` | Connection pool statistics |

### 2.6 TransactionService

| Operation | Description |
|-----------|-------------|
| `begin` | Start transaction |
| `commit` | Commit transaction |
| `rollback` | Rollback transaction |
| `execute_in_transaction` | Run queries in transaction |

### 2.7 WorkloadService

| Operation | Description |
|-----------|-------------|
| `get_queue_state` | Current WLM queue status |
| `set_query_group` | Assign query to WLM group |
| `get_running_queries` | List active queries |
| `get_query_metrics` | Query performance metrics |

### 2.8 SpectrumService

| Operation | Description |
|-----------|-------------|
| `query_external` | Query external S3 data |
| `list_external_schemas` | List Spectrum schemas |
| `list_external_tables` | List external tables |

---

## 3. Core Types

### 3.1 Connection Types

```
RedshiftEndpoint:
  host: String
  port: u16                    # Default: 5439
  database: String
  ssl_mode: SslMode

SslMode:
  | Disable
  | Require
  | VerifyCa { ca_cert: String }
  | VerifyFull { ca_cert: String }

ConnectionConfig:
  endpoint: RedshiftEndpoint
  credentials: CredentialSource
  pool_size: u32               # Default: 10
  connection_timeout_ms: u64   # Default: 30000
  idle_timeout_ms: u64         # Default: 600000
  max_lifetime_ms: u64         # Default: 1800000

CredentialSource:
  | IamRole { role_arn: String }
  | IamUser { access_key: SecretString, secret_key: SecretString }
  | DatabaseAuth { username: String, password: SecretString }
  | SecretsManager { secret_id: String }

Connection:
  id: ConnectionId
  state: ConnectionState
  created_at: Timestamp
  last_used: Timestamp
  session_params: Map<String, String>

ConnectionState:
  | Available
  | InUse
  | Stale
  | Failed
```

### 3.2 Query Types

```
Query:
  sql: String
  parameters: Vec<QueryParam>
  timeout_ms: Option<u64>
  query_group: Option<String>
  label: Option<String>

QueryParam:
  | Null
  | Boolean(bool)
  | SmallInt(i16)
  | Integer(i32)
  | BigInt(i64)
  | Real(f32)
  | Double(f64)
  | Numeric { value: String, precision: u8, scale: u8 }
  | Char(String)
  | Varchar(String)
  | Date(Date)
  | Timestamp(Timestamp)
  | TimestampTz(TimestampTz)
  | Time(Time)
  | Interval(Interval)
  | Binary(Vec<u8>)
  | SuperValue(String)         # JSON/semi-structured

QueryResult:
  columns: Vec<ColumnMetadata>
  rows: Vec<Row>
  rows_affected: u64
  execution_time_ms: u64
  query_id: QueryId

ColumnMetadata:
  name: String
  data_type: DataType
  nullable: bool
  precision: Option<u8>
  scale: Option<u8>

Row:
  values: Vec<Option<Value>>

AsyncQueryHandle:
  query_id: QueryId
  status: QueryStatus
  submitted_at: Timestamp

QueryStatus:
  | Submitted
  | Queued
  | Running { progress_pct: Option<u8> }
  | Completed { rows: u64 }
  | Failed { error: QueryError }
  | Cancelled
```

### 3.3 Data Loading Types

```
CopyCommand:
  table: TableRef
  source: CopySource
  format: DataFormat
  options: CopyOptions

CopySource:
  | S3 { bucket: String, prefix: String, manifest: bool }
  | DynamoDB { table_name: String, read_ratio: u8 }

DataFormat:
  | Csv { delimiter: char, quote: char, escape: char, header: bool }
  | Json { json_paths: Option<String>, auto: bool }
  | Parquet
  | Orc
  | Avro

CopyOptions:
  iam_role: String
  region: Option<String>
  compression: Option<Compression>
  max_errors: u32              # Default: 0
  truncate_columns: bool
  blank_as_null: bool
  empty_as_null: bool
  date_format: Option<String>
  time_format: Option<String>
  accept_inv_chars: Option<char>

Compression:
  | None
  | Gzip
  | Lzop
  | Bzip2
  | Zstd

CopyResult:
  rows_loaded: u64
  errors: u32
  duration_ms: u64
  bytes_scanned: u64

LoadError:
  line_number: u64
  column_name: Option<String>
  error_code: u32
  error_message: String
  raw_value: Option<String>
```

### 3.4 Data Unloading Types

```
UnloadCommand:
  query: String
  destination: S3Destination
  format: UnloadFormat
  options: UnloadOptions

S3Destination:
  bucket: String
  prefix: String

UnloadFormat:
  | Csv { delimiter: char, header: bool }
  | Parquet { compression: ParquetCompression }
  | Json

ParquetCompression:
  | None
  | Snappy
  | Gzip
  | Zstd

UnloadOptions:
  iam_role: String
  parallel: bool               # Default: true
  max_file_size_mb: u32        # Default: 6200
  manifest: bool
  encrypted: bool
  kms_key_id: Option<String>
  partition_by: Vec<String>
  allow_overwrite: bool

UnloadResult:
  files_created: u32
  rows_unloaded: u64
  bytes_written: u64
  duration_ms: u64
  manifest_path: Option<String>
```

### 3.5 Workload Management Types

```
WlmQueue:
  name: String
  slots: u32
  memory_pct: u32
  timeout_ms: u64
  query_group: Option<String>
  user_group: Option<Vec<String>>

QueueState:
  queue: WlmQueue
  running_queries: u32
  queued_queries: u32
  available_slots: u32

RunningQuery:
  query_id: QueryId
  pid: u32
  user: String
  database: String
  start_time: Timestamp
  elapsed_ms: u64
  state: String
  query_text: String           # Truncated
  queue: String

QueryMetrics:
  query_id: QueryId
  compile_time_ms: u64
  queue_time_ms: u64
  execution_time_ms: u64
  rows_returned: u64
  bytes_scanned: u64
  disk_spill_mb: u64
  cpu_time_ms: u64
  segments_scanned: u64
  steps: u32
```

### 3.6 Transaction Types

```
Transaction:
  id: TransactionId
  isolation: IsolationLevel
  state: TransactionState
  started_at: Timestamp

IsolationLevel:
  | Serializable              # Redshift default

TransactionState:
  | Active
  | Committed
  | RolledBack
  | Failed
```

### 3.7 Spectrum Types

```
ExternalSchema:
  name: String
  database: String
  catalog: ExternalCatalog

ExternalCatalog:
  | GlueCatalog { database: String, region: String }
  | HiveCatalog { uri: String }

ExternalTable:
  schema: String
  name: String
  location: String
  format: DataFormat
  columns: Vec<ColumnMetadata>
  partitions: Vec<PartitionColumn>

PartitionColumn:
  name: String
  data_type: DataType
```

---

## 4. Configuration

```
RedshiftConfig:
  # Connection settings
  endpoint: RedshiftEndpoint
  credentials: CredentialSource

  # Pool settings
  pool_size: u32               # Default: 10
  min_connections: u32         # Default: 2
  connection_timeout_ms: u64   # Default: 30000
  idle_timeout_ms: u64         # Default: 600000
  max_lifetime_ms: u64         # Default: 1800000

  # Query settings
  default_timeout_ms: u64      # Default: 300000 (5 min)
  max_query_timeout_ms: u64    # Default: 86400000 (24 hr)
  fetch_size: u32              # Default: 10000

  # WLM settings
  default_query_group: Option<String>
  workload_concurrency_limit: u32  # Default: 15

  # Resilience settings
  max_retries: u32             # Default: 3
  retry_backoff_ms: u64        # Default: 1000
  circuit_breaker_threshold: u32  # Default: 5

  # Data loading settings
  default_copy_iam_role: Option<String>
  max_copy_errors: u32         # Default: 0
  default_unload_iam_role: Option<String>
```

---

## 5. Error Taxonomy

| Error Type | SQL State | Retryable | Description |
|------------|-----------|-----------|-------------|
| `ConnectionFailed` | 08xxx | Yes | Unable to connect |
| `AuthenticationFailed` | 28xxx | No | Invalid credentials |
| `QueryCancelled` | 57014 | No | Query cancelled |
| `QueryTimeout` | 57xxx | Yes | Query exceeded timeout |
| `SerializationFailure` | 40001 | Yes | Concurrent transaction conflict |
| `DiskFull` | 53100 | No | Cluster storage exhausted |
| `OutOfMemory` | 53200 | Yes | Query exceeded memory |
| `ResourceBusy` | 53300 | Yes | WLM queue full |
| `InvalidSql` | 42xxx | No | Syntax or semantic error |
| `TableNotFound` | 42P01 | No | Table does not exist |
| `ColumnNotFound` | 42703 | No | Column does not exist |
| `PermissionDenied` | 42501 | No | Insufficient privileges |
| `DataError` | 22xxx | No | Invalid data format |
| `CopyError` | - | Partial | COPY command failure |
| `UnloadError` | - | Partial | UNLOAD command failure |
| `SpectrumError` | - | Yes | External table query error |

---

## 6. Rate Limits and Quotas

| Limit | Value | Scope |
|-------|-------|-------|
| Max concurrent connections | 500 | Per cluster |
| Max query length | 16 MB | Per query |
| Max columns per table | 1,600 | Per table |
| Max result set size | Unlimited | Streaming |
| Max COPY file size | 1 GB (CSV), 128 MB (JSON) | Per file |
| Max UNLOAD file size | 6.2 GB | Per file |
| Max WLM queues | 8 | Per cluster |
| Max concurrent queries | 50 | Default WLM |
| Spectrum: Max files per query | 1 million | Per query |
| Spectrum: Max partitions | 1 million | Per table |

---

## 7. Security Requirements

### 7.1 Credential Protection
- AWS credentials via `aws/auth` module
- Database passwords in Secrets Manager
- IAM role assumption for COPY/UNLOAD
- No credential logging

### 7.2 Query Safety
- Parameterized queries only (no string interpolation)
- SQL injection prevention
- Query text redaction in logs
- Result set size limits

### 7.3 Network Security
- SSL/TLS required in production
- VPC endpoint support
- IP allowlisting awareness

### 7.4 Audit Requirements
- Query execution logged (ID, duration, user)
- Connection events logged
- Data load/unload operations logged
- Error logging (sanitized)

---

## 8. Performance Considerations

### 8.1 Query Optimization
- Column projection (SELECT specific columns)
- Predicate pushdown awareness
- Sort key utilization
- Distribution style awareness

### 8.2 Data Loading Best Practices
- Parallel COPY from multiple files
- Manifest-based loading
- Compression for network efficiency
- Sort key order for optimal loading

### 8.3 Connection Management
- Connection pooling with warm-up
- Idle connection recycling
- Session parameter persistence
- Graceful connection draining

### 8.4 Result Streaming
- Cursor-based fetching for large results
- Configurable fetch size
- Memory-bounded streaming
- Early termination support

---

## 9. Workload Management

### 9.1 Queue Assignment
```
Query Group Routing:
  - Set via SET query_group
  - Matches WLM queue configuration
  - Falls back to default queue
  - Label for identification

Priority Mapping:
  | Priority | Use Case |
  |----------|----------|
  | High | Real-time dashboards |
  | Normal | Ad-hoc analytics |
  | Low | Batch reporting |
  | Bulk | Data loading |
```

### 9.2 Concurrency Scaling
- Awareness of concurrency scaling status
- Burst queue detection
- Scaling cluster routing hints

---

## 10. Simulation Requirements

### 10.1 MockRedshiftClient
- Simulate query execution
- In-memory result sets
- Query plan simulation
- Connection pool behavior

### 10.2 Load Simulation
- COPY operation mocking
- S3 integration simulation
- Error injection

### 10.3 Workload Replay
- Record query sequences
- Replay with timing
- Performance comparison

---

## 11. Integration Points

### 11.1 Shared Modules

```
aws/auth:
  - get_credentials() -> Credentials
  - assume_role(role_arn) -> Credentials
  - get_db_token(cluster) -> Token

shared/resilience:
  - RetryPolicy for transient errors
  - CircuitBreaker per cluster
  - RateLimiter (query concurrency)

shared/observability:
  - Metrics: redshift.queries, redshift.latency, redshift.pool
  - Traces: span per query
  - Logs: structured, query-redacted
```

### 11.2 Related Integrations

```
aws/s3:
  - COPY source/UNLOAD destination
  - Manifest file handling

aws/glue:
  - Spectrum catalog integration
  - External table metadata

aws/secrets_manager:
  - Database credential storage
```

---

## 12. Federated Query Patterns

### 12.1 Spectrum Queries
- External schema references
- Partition pruning awareness
- Pushdown limitations
- Mixed internal/external joins

### 12.2 Cross-Database
- Datashare awareness
- Consumer database queries
- Producer/consumer patterns

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-redshift.md | Complete |
| 2. Pseudocode | pseudocode-redshift.md | Pending |
| 3. Architecture | architecture-redshift.md | Pending |
| 4. Refinement | refinement-redshift.md | Pending |
| 5. Completion | completion-redshift.md | Pending |

---

*Phase 1: Specification - Complete*
