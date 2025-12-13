# SQL Server Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/sqlserver`

---

## 1. Overview

### 1.1 Document Purpose

This specification defines requirements for the SQL Server Integration Module, providing a production-ready interface for relational data access, transactional workloads, metadata storage, and analytical queries within the LLM Dev Ops platform.

### 1.2 Methodology

- **SPARC**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first, mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to shared primitives

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The SQL Server Integration Module provides a **thin adapter layer** that:
- Connects to SQL Server instances (on-premises, Azure SQL, Azure SQL MI)
- Executes queries with parameterized inputs
- Manages transactions with configurable isolation levels
- Supports read/write separation for scalability
- Provides connection pooling with health checks
- Handles bulk operations efficiently
- Enables simulation/replay of database interactions

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Connection Management** | Pooling, health checks, failover |
| **Query Execution** | SELECT, INSERT, UPDATE, DELETE, stored procedures |
| **Transaction Support** | Begin, commit, rollback, savepoints |
| **Read/Write Separation** | Route reads to replicas |
| **Bulk Operations** | Bulk insert, TVP support |
| **Result Mapping** | Row-to-struct mapping |
| **Error Handling** | SQL errors, deadlocks, timeouts |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Connection pooling | Min/max connections, idle timeout |
| Parameterized queries | Prevent SQL injection |
| Transactions | All isolation levels |
| Stored procedures | Input/output parameters |
| Bulk insert | High-performance inserts |
| Table-valued parameters | Complex parameter passing |
| Read replicas | Automatic routing |
| Retry logic | Transient fault handling |
| Query timeout | Per-query configuration |
| Result streaming | Large result sets |
| Dual language | Rust (primary) and TypeScript |

#### Out of Scope

| Item | Reason |
|------|--------|
| Schema migrations | Separate tooling (e.g., Flyway) |
| ORM functionality | Keep adapter thin |
| Query building | Application responsibility |
| Database provisioning | Infrastructure/DBA scope |
| Backup/restore | Admin operations |
| Index management | DBA responsibility |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Async-first | Non-blocking I/O |
| No panics | Reliability |
| Trait-based | Testability |
| TDS protocol | Native SQL Server protocol |
| Prepared statements | Performance and security |

---

## 3. Dependency Policy

### 3.1 Shared Modules

| Module | Purpose |
|--------|---------|
| `shared/credentials` | SQL Server credentials |
| `shared/resilience` | Retry, circuit breaker |
| `shared/observability` | Logging, metrics, tracing |

### 3.2 External Dependencies (Rust)

| Crate | Purpose |
|-------|---------|
| `tokio` | Async runtime |
| `tiberius` | TDS protocol client |
| `bb8` / `deadpool` | Connection pooling |
| `serde` | Serialization |
| `thiserror` | Error derivation |
| `async-trait` | Async trait support |
| `futures` | Stream handling |

### 3.3 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `diesel` | Full ORM not needed |
| `sqlx` | SQL Server support limited |
| `sea-orm` | ORM overhead |

---

## 4. SQL Server Connectivity

### 4.1 Connection String Formats

```
# Standard
Server=tcp:hostname,1433;Database=dbname;User Id=user;Password=pwd;Encrypt=true;

# Azure SQL with AAD
Server=tcp:server.database.windows.net,1433;Database=db;Authentication=Active Directory Default;

# Named instance
Server=hostname\instancename;Database=db;Integrated Security=true;

# Read-only intent
Server=hostname;Database=db;ApplicationIntent=ReadOnly;
```

### 4.2 Authentication Methods

| Method | Use Case |
|--------|----------|
| SQL Authentication | Username/password |
| Windows Authentication | Domain integrated |
| Azure AD Password | Azure SQL with AAD |
| Azure AD Integrated | Managed identity |
| Azure AD Service Principal | Automation |

### 4.3 Connection Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `connect_timeout` | 30s | Connection establishment timeout |
| `command_timeout` | 30s | Query execution timeout |
| `pool_min` | 1 | Minimum pool connections |
| `pool_max` | 10 | Maximum pool connections |
| `pool_idle_timeout` | 300s | Idle connection lifetime |
| `encrypt` | true | TLS encryption |
| `trust_server_cert` | false | Certificate validation |

---

## 5. API Coverage

### 5.1 Query Operations

| Operation | Description |
|-----------|-------------|
| `query` | Execute SELECT, return rows |
| `query_one` | Execute SELECT, return single row |
| `query_optional` | Execute SELECT, return 0 or 1 row |
| `execute` | Execute INSERT/UPDATE/DELETE, return affected rows |
| `execute_scalar` | Execute query, return single value |
| `batch` | Execute multiple statements |

### 5.2 Transaction Operations

| Operation | Description |
|-----------|-------------|
| `begin_transaction` | Start transaction with isolation level |
| `commit` | Commit transaction |
| `rollback` | Rollback transaction |
| `savepoint` | Create savepoint |
| `rollback_to_savepoint` | Rollback to savepoint |

### 5.3 Bulk Operations

| Operation | Description |
|-----------|-------------|
| `bulk_insert` | High-speed bulk insert |
| `tvp_execute` | Execute with table-valued parameter |
| `merge` | MERGE statement execution |

### 5.4 Stored Procedure Operations

| Operation | Description |
|-----------|-------------|
| `call_procedure` | Execute stored procedure |
| `call_procedure_with_output` | Execute with output parameters |

### 5.5 Isolation Levels

| Level | Use Case |
|-------|----------|
| `ReadUncommitted` | Dirty reads acceptable |
| `ReadCommitted` | Default, no dirty reads |
| `RepeatableRead` | Consistent reads in transaction |
| `Serializable` | Full isolation |
| `Snapshot` | Optimistic concurrency |

---

## 6. Error Taxonomy

### 6.1 Error Hierarchy

```
SqlServerError
├── ConfigurationError
│   ├── InvalidConnectionString
│   ├── InvalidCredentials
│   └── InvalidDatabase
│
├── ConnectionError
│   ├── ConnectionFailed
│   ├── ConnectionTimeout
│   ├── PoolExhausted
│   ├── ConnectionDropped
│   └── SslError
│
├── AuthenticationError
│   ├── LoginFailed
│   ├── PasswordExpired
│   ├── AccountLocked
│   └── AadTokenError
│
├── QueryError
│   ├── SyntaxError
│   ├── InvalidObject
│   ├── InvalidColumn
│   ├── TypeMismatch
│   └── ConstraintViolation
│
├── TransactionError
│   ├── DeadlockVictim
│   ├── LockTimeout
│   ├── TransactionAborted
│   └── IsolationConflict
│
├── ExecutionError
│   ├── QueryTimeout
│   ├── QueryCancelled
│   ├── OutOfMemory
│   └── TempDbFull
│
├── DataError
│   ├── TruncationError
│   ├── NullConstraint
│   ├── UniqueViolation
│   ├── ForeignKeyViolation
│   └── CheckConstraint
│
└── ServerError
    ├── ServerUnavailable
    ├── DatabaseOffline
    ├── FailoverInProgress
    └── ReadOnlyDatabase
```

### 6.2 SQL Error Code Mapping

| Error Number | Error Type | Retryable |
|--------------|------------|-----------|
| 18456 | `AuthenticationError::LoginFailed` | No |
| 1205 | `TransactionError::DeadlockVictim` | Yes |
| 1222 | `TransactionError::LockTimeout` | Yes |
| 2627 | `DataError::UniqueViolation` | No |
| 547 | `DataError::ForeignKeyViolation` | No |
| -2 | `ExecutionError::QueryTimeout` | Yes |
| 40613 | `ServerError::DatabaseOffline` | Yes |
| 40197 | `ServerError::FailoverInProgress` | Yes |
| 40501 | `ServerError::ServerUnavailable` | Yes |
| 10928 | `ExecutionError::ResourceLimit` | Yes |
| 10929 | `ExecutionError::ResourceLimit` | Yes |

---

## 7. Resilience Requirements

### 7.1 Retry Configuration

| Error Type | Retry | Max Attempts | Backoff |
|------------|-------|--------------|---------|
| `DeadlockVictim` | Yes | 3 | Exponential (100ms) |
| `LockTimeout` | Yes | 3 | Exponential (200ms) |
| `QueryTimeout` | Yes | 2 | Fixed (1s) |
| `ConnectionDropped` | Yes | 3 | Immediate (reconnect) |
| `FailoverInProgress` | Yes | 5 | Exponential (2s) |
| `ServerUnavailable` | Yes | 5 | Exponential (5s) |
| `ResourceLimit` | Yes | 3 | Wait for headers |

### 7.2 Connection Pool Health

| Check | Interval | Action |
|-------|----------|--------|
| Connection validation | On acquire | `SELECT 1` |
| Idle connection check | 30s | Close stale connections |
| Pool size monitoring | Continuous | Metric emission |

### 7.3 Circuit Breaker

| Parameter | Default |
|-----------|---------|
| Failure threshold | 5 failures |
| Success threshold | 2 successes |
| Reset timeout | 30 seconds |
| Half-open max requests | 3 |

---

## 8. Observability Requirements

### 8.1 Tracing Spans

| Span | Attributes |
|------|------------|
| `sql.query` | `db.statement`, `db.operation`, `db.rows_affected` |
| `sql.transaction` | `db.transaction.isolation`, `db.transaction.id` |
| `sql.connect` | `db.server`, `db.name`, `db.user` |
| `sql.pool.acquire` | `pool.size`, `pool.available`, `pool.waiting` |
| `sql.bulk_insert` | `db.table`, `db.rows_count` |
| `sql.procedure` | `db.procedure`, `db.params_count` |

### 8.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `sql_queries_total` | Counter | `operation`, `status`, `database` |
| `sql_query_duration_seconds` | Histogram | `operation`, `database` |
| `sql_rows_affected_total` | Counter | `operation`, `database` |
| `sql_transactions_total` | Counter | `isolation`, `status` |
| `sql_pool_connections` | Gauge | `state` (active/idle/waiting) |
| `sql_pool_acquire_duration_seconds` | Histogram | `database` |
| `sql_errors_total` | Counter | `error_type`, `database` |
| `sql_deadlocks_total` | Counter | `database` |
| `sql_retries_total` | Counter | `error_type`, `database` |

### 8.3 Logging

| Level | When |
|-------|------|
| ERROR | Connection failures, query errors, deadlocks |
| WARN | Retries, slow queries (>1s), pool exhaustion warnings |
| INFO | Transaction boundaries, bulk operations |
| DEBUG | Query execution, parameter binding |
| TRACE | Full query text, result sets |

---

## 9. Security Requirements

### 9.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Password never logged | `SecretString` wrapper |
| Connection strings sanitized | Mask password in logs |
| AAD tokens secured | Token cache with refresh |

### 9.2 Query Security

| Requirement | Implementation |
|-------------|----------------|
| Parameterized queries only | No string concatenation |
| Input validation | Type checking |
| SQL injection prevention | Prepared statements |

### 9.3 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ | Enforced by default |
| Certificate validation | Enabled for production |
| Encrypted connections | `Encrypt=true` |

### 9.4 Principle of Least Privilege

| Requirement | Implementation |
|-------------|----------------|
| Read-only connections | Separate credentials |
| Schema restrictions | db_datareader/db_datawriter |
| Procedure execution | EXECUTE permission only |

---

## 10. Performance Requirements

### 10.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Simple SELECT | < 5ms | < 50ms |
| Complex SELECT | < 50ms | < 500ms |
| Single INSERT | < 5ms | < 50ms |
| Bulk INSERT (1000 rows) | < 100ms | < 500ms |
| Transaction commit | < 10ms | < 100ms |
| Connection acquire | < 5ms | < 50ms |

### 10.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Queries per second | 1000+ |
| Concurrent connections | 100+ |
| Bulk insert rows/sec | 50,000+ |

---

## 11. Enterprise Features

### 11.1 Read/Write Separation

| Feature | Description |
|---------|-------------|
| Read replica routing | Automatic routing for SELECT |
| Write primary routing | All writes to primary |
| Replica lag awareness | Skip lagging replicas |
| Failover handling | Automatic reconnection |

### 11.2 Multi-Database Support

| Feature | Description |
|---------|-------------|
| Database switching | `USE database` |
| Cross-database queries | Fully qualified names |
| Connection per database | Isolated pools |

### 11.3 Advanced Query Features

| Feature | Description |
|---------|-------------|
| Query hints | `OPTION (RECOMPILE)`, etc. |
| Table hints | `WITH (NOLOCK)`, etc. |
| Query store awareness | Execution plan hints |
| Result streaming | Async iteration |

### 11.4 Bulk Operations

| Feature | Description |
|---------|-------------|
| Bulk copy | High-speed inserts |
| Table-valued parameters | Complex input |
| Batch size control | Memory management |
| Minimal logging | Performance optimization |

### 11.5 Simulation and Replay

| Feature | Description |
|---------|-------------|
| Mock mode | In-memory database simulation |
| Record mode | Capture query/response pairs |
| Replay mode | Deterministic testing |
| Latency simulation | Realistic timing |

---

## 12. Acceptance Criteria

### 12.1 Functional

- [ ] Connect with SQL authentication
- [ ] Connect with Windows authentication
- [ ] Connect with Azure AD authentication
- [ ] Connection pooling functional
- [ ] Execute parameterized queries
- [ ] Execute stored procedures
- [ ] Handle output parameters
- [ ] Begin/commit/rollback transactions
- [ ] Support all isolation levels
- [ ] Create and rollback to savepoints
- [ ] Bulk insert operations
- [ ] Table-valued parameters
- [ ] Read replica routing
- [ ] Query timeout handling
- [ ] Result streaming for large sets
- [ ] Row-to-struct mapping

### 12.2 Non-Functional

- [ ] No panics
- [ ] Credentials protected
- [ ] Retry works correctly
- [ ] Circuit breaker functions
- [ ] Deadlock retry succeeds
- [ ] Pool health checks work
- [ ] Test coverage > 80%

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Specification |

---

**Next Phase:** Pseudocode - Core algorithms for connection pooling, query execution, transaction management, and bulk operations.
