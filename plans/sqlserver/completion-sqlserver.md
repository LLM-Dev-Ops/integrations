# SQL Server Integration Module - Completion

**SPARC Phase 5: Completion**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/sqlserver`

---

## 1. Implementation Requirements

### 1.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | SQL authentication (username/password) | P0 | ☐ |
| FR-02 | Windows/Integrated authentication | P1 | ☐ |
| FR-03 | Azure AD password authentication | P1 | ☐ |
| FR-04 | Azure AD managed identity (MSI) | P1 | ☐ |
| FR-05 | Azure AD service principal | P1 | ☐ |
| FR-06 | Connection pooling with min/max | P0 | ☐ |
| FR-07 | Pool health checks (SELECT 1) | P0 | ☐ |
| FR-08 | Idle connection cleanup | P1 | ☐ |
| FR-09 | Parameterized query execution | P0 | ☐ |
| FR-10 | Query with single row result | P0 | ☐ |
| FR-11 | Query with optional result | P0 | ☐ |
| FR-12 | Execute (INSERT/UPDATE/DELETE) | P0 | ☐ |
| FR-13 | Execute scalar | P1 | ☐ |
| FR-14 | Batch execution | P1 | ☐ |
| FR-15 | Begin transaction | P0 | ☐ |
| FR-16 | Commit transaction | P0 | ☐ |
| FR-17 | Rollback transaction | P0 | ☐ |
| FR-18 | All isolation levels | P0 | ☐ |
| FR-19 | Savepoints | P1 | ☐ |
| FR-20 | Rollback to savepoint | P1 | ☐ |
| FR-21 | Stored procedure execution | P1 | ☐ |
| FR-22 | Output parameter handling | P1 | ☐ |
| FR-23 | Bulk insert | P1 | ☐ |
| FR-24 | Table-valued parameters | P2 | ☐ |
| FR-25 | Read replica routing | P1 | ☐ |
| FR-26 | Query timeout configuration | P0 | ☐ |
| FR-27 | Result streaming | P2 | ☐ |
| FR-28 | Deadlock retry | P0 | ☐ |

### 1.2 Non-Functional Requirements

| ID | Requirement | Target | Status |
|----|-------------|--------|--------|
| NFR-01 | No panics in library code | 0 panics | ☐ |
| NFR-02 | Passwords never logged | 100% | ☐ |
| NFR-03 | Connection strings sanitized in logs | 100% | ☐ |
| NFR-04 | Retry logic functional | All retryable errors | ☐ |
| NFR-05 | Circuit breaker operational | 5 failures threshold | ☐ |
| NFR-06 | Pool health checks working | Every 30s | ☐ |
| NFR-07 | Deadlock retry succeeds | 3 attempts max | ☐ |
| NFR-08 | TLS encryption by default | Enabled | ☐ |
| NFR-09 | Parameterized queries only | No concatenation | ☐ |
| NFR-10 | Auto-rollback on drop | Transactions | ☐ |

### 1.3 Performance Requirements

| ID | Metric | Target | Status |
|----|--------|--------|--------|
| PR-01 | Simple SELECT latency (p50) | < 5ms | ☐ |
| PR-02 | Simple SELECT latency (p99) | < 50ms | ☐ |
| PR-03 | Single INSERT latency (p50) | < 5ms | ☐ |
| PR-04 | Bulk INSERT 1000 rows (p50) | < 100ms | ☐ |
| PR-05 | Transaction commit (p50) | < 10ms | ☐ |
| PR-06 | Connection acquire (p50) | < 5ms | ☐ |
| PR-07 | Queries per second | 1000+ | ☐ |
| PR-08 | Concurrent connections | 100+ | ☐ |

---

## 2. Test Coverage Requirements

### 2.1 Unit Test Coverage

| Component | Target | Files |
|-----------|--------|-------|
| Connection Pool | 90% | `connection/pool.rs` |
| Query Executor | 85% | `query/executor.rs` |
| Parameter Binding | 95% | `query/params.rs` |
| Transaction | 90% | `transaction/*.rs` |
| Error Handling | 90% | `error.rs` |
| Auth Providers | 85% | `auth/*.rs` |
| Query Router | 90% | `routing/*.rs` |
| **Overall** | **85%** | |

### 2.2 Test File Structure

```
tests/
├── unit/
│   ├── pool_test.rs
│   │   ├── test_pool_acquire_release
│   │   ├── test_pool_exhaustion_timeout
│   │   ├── test_pool_health_check
│   │   ├── test_pool_idle_cleanup
│   │   └── test_pool_min_connections
│   ├── params_test.rs
│   │   ├── test_param_binding_all_types
│   │   ├── test_null_param_handling
│   │   ├── test_param_type_mismatch
│   │   └── test_tvp_construction
│   ├── transaction_test.rs
│   │   ├── test_transaction_commit
│   │   ├── test_transaction_rollback
│   │   ├── test_transaction_auto_rollback_on_drop
│   │   ├── test_savepoint_create_rollback
│   │   └── test_isolation_levels
│   ├── error_test.rs
│   │   ├── test_error_classification
│   │   ├── test_retry_eligibility
│   │   └── test_error_code_mapping
│   └── router_test.rs
│       ├── test_write_intent_detection
│       ├── test_read_intent_detection
│       └── test_replica_selection
├── integration/
│   ├── connection_test.rs
│   ├── query_test.rs
│   ├── transaction_test.rs
│   ├── bulk_test.rs
│   └── procedure_test.rs
└── simulation/
    ├── mock_scenarios_test.rs
    ├── deadlock_test.rs
    └── failover_test.rs
```

### 2.3 Critical Test Scenarios

| Scenario | Type | Priority |
|----------|------|----------|
| SQL authentication flow | Integration | P0 |
| Connection pool lifecycle | Unit | P0 |
| Parameterized query execution | Integration | P0 |
| Transaction commit/rollback | Integration | P0 |
| Deadlock detection and retry | Unit | P0 |
| Connection recovery after drop | Integration | P0 |
| Bulk insert with batching | Integration | P1 |
| Read replica routing | Unit | P1 |
| Stored procedure with output | Integration | P1 |
| Azure AD token refresh | Unit | P1 |

---

## 3. Implementation Tasks

### 3.1 Rust Implementation

| Task | Est. LOC | Dependencies | Priority |
|------|----------|--------------|----------|
| `config.rs` - Configuration types | 180 | - | P0 |
| `error.rs` - Error types and mapping | 250 | - | P0 |
| `connection/pool.rs` - Connection pool | 350 | config | P0 |
| `connection/health.rs` - Health checker | 120 | pool | P0 |
| `connection/builder.rs` - Conn builder | 200 | config | P0 |
| `auth/sql_auth.rs` - SQL authentication | 100 | - | P0 |
| `auth/windows_auth.rs` - Windows auth | 80 | - | P1 |
| `auth/azure_ad.rs` - Azure AD auth | 220 | - | P1 |
| `query/executor.rs` - Query execution | 300 | pool | P0 |
| `query/params.rs` - Parameter binding | 200 | - | P0 |
| `query/results.rs` - Result mapping | 180 | - | P0 |
| `transaction/transaction.rs` - Tx impl | 280 | pool | P0 |
| `transaction/builder.rs` - Tx builder | 120 | transaction | P0 |
| `bulk/insert.rs` - Bulk insert | 250 | pool | P1 |
| `bulk/tvp.rs` - Table-valued params | 180 | - | P2 |
| `procedure/executor.rs` - Stored procs | 200 | pool | P1 |
| `routing/router.rs` - Query router | 180 | pool | P1 |
| `routing/replica.rs` - Replica mgmt | 200 | router | P1 |
| `client.rs` - Main client | 250 | all | P0 |
| `simulation/mock.rs` - Mock database | 300 | - | P1 |
| `simulation/recorder.rs` - Record/replay | 200 | mock | P2 |
| `lib.rs` - Public exports | 60 | all | P0 |
| **Rust Total** | **~4,400** | | |

### 3.2 TypeScript Implementation

| Task | Est. LOC | Dependencies | Priority |
|------|----------|--------------|----------|
| `types/index.ts` - Type definitions | 200 | - | P0 |
| `config.ts` - Configuration | 120 | types | P0 |
| `pool.ts` - Connection pooling | 180 | tedious, tarn | P0 |
| `client.ts` - Main client | 200 | pool | P0 |
| `query.ts` - Query execution | 180 | client | P0 |
| `transaction.ts` - Transactions | 150 | client | P0 |
| `bulk.ts` - Bulk operations | 150 | client | P1 |
| `procedure.ts` - Stored procedures | 120 | client | P1 |
| `index.ts` - Public exports | 40 | all | P0 |
| **TypeScript Total** | **~1,340** | | |

### 3.3 Test Implementation

| Task | Est. LOC | Priority |
|------|----------|----------|
| Unit tests - Pool | 350 | P0 |
| Unit tests - Params | 250 | P0 |
| Unit tests - Transaction | 300 | P0 |
| Unit tests - Error | 200 | P0 |
| Unit tests - Router | 200 | P1 |
| Integration tests - Connection | 250 | P0 |
| Integration tests - Query | 300 | P0 |
| Integration tests - Transaction | 300 | P0 |
| Integration tests - Bulk | 200 | P1 |
| Simulation tests - Deadlock | 250 | P0 |
| Simulation tests - Failover | 200 | P1 |
| Property-based tests | 200 | P2 |
| **Test Total** | **~3,000** | |

### 3.4 Total Estimated LOC

| Category | LOC |
|----------|-----|
| Rust Implementation | 4,400 |
| TypeScript Implementation | 1,340 |
| Tests | 3,000 |
| **Grand Total** | **~8,740** |

---

## 4. Security Checklist

### 4.1 Credential Security

| Check | Implementation | Status |
|-------|----------------|--------|
| Passwords never logged | `SecretString` wrapper | ☐ |
| Connection strings sanitized | Mask password in output | ☐ |
| Tokens redacted in traces | Custom `Debug` impl | ☐ |
| Memory cleared on drop | `Zeroize` trait | ☐ |
| No credential persistence | In-memory only | ☐ |

### 4.2 Query Security

| Check | Implementation | Status |
|-------|----------------|--------|
| Parameterized queries only | No string concat | ☐ |
| SQL injection prevention | Prepared statements | ☐ |
| Input type validation | SqlParam enum | ☐ |
| Query length limits | Configurable max | ☐ |

### 4.3 Transport Security

| Check | Implementation | Status |
|-------|----------------|--------|
| TLS 1.2+ minimum | Enforced by default | ☐ |
| Certificate validation | Enabled for production | ☐ |
| Encrypt=true default | Connection config | ☐ |
| No plaintext fallback | Error if TLS fails | ☐ |

### 4.4 Access Control

| Check | Implementation | Status |
|-------|----------------|--------|
| Least privilege connections | Separate read/write creds | ☐ |
| Connection timeout | Configurable | ☐ |
| Pool size limits | Max connections | ☐ |
| Query timeout | Per-query configurable | ☐ |

---

## 5. Operational Readiness

### 5.1 Monitoring Dashboards

| Dashboard | Metrics | Purpose |
|-----------|---------|---------|
| Connection Pool | `sql_pool_connections`, acquire latency | Pool health |
| Query Performance | `sql_query_duration_seconds`, QPS | Performance |
| Transactions | `sql_transactions_total`, duration | Tx health |
| Errors | `sql_errors_total`, deadlocks | Issue detection |
| Read Replicas | Lag, health status | Replica monitoring |

### 5.2 Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| Pool Exhaustion | Available connections = 0 | Critical |
| High Error Rate | > 1% error rate | Warning |
| Query Latency High | p99 > 1s | Warning |
| Deadlock Spike | > 10 deadlocks/min | Warning |
| Connection Failures | > 5 failures/min | Critical |
| Replica Lag High | > 30s lag | Warning |
| Circuit Breaker Open | Any circuit open | Critical |
| Auth Failures | > 3 failures/min | Critical |

### 5.3 Runbook Items

| Scenario | Response |
|----------|----------|
| Pool exhaustion | 1. Check active queries 2. Increase pool_max 3. Check for leaks |
| High deadlock rate | 1. Review query patterns 2. Add indexes 3. Reduce transaction scope |
| Connection failures | 1. Check SQL Server status 2. Verify network 3. Check credentials |
| Replica lag high | 1. Check replica health 2. Route to primary 3. Contact DBA |
| Query timeout | 1. Identify slow query 2. Check execution plan 3. Add indexes |
| Auth failures | 1. Verify credentials 2. Check account status 3. Token refresh |

---

## 6. Configuration Reference

### 6.1 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SQLSERVER_HOST` | Server hostname | Required |
| `SQLSERVER_PORT` | Server port | `1433` |
| `SQLSERVER_DATABASE` | Database name | Required |
| `SQLSERVER_USER` | Username | Required* |
| `SQLSERVER_PASSWORD` | Password | Required* |
| `SQLSERVER_USE_MSI` | Use managed identity | `false` |
| `SQLSERVER_ENCRYPT` | Enable TLS | `true` |
| `SQLSERVER_TRUST_CERT` | Trust server cert | `false` |
| `SQLSERVER_POOL_MIN` | Min pool size | `1` |
| `SQLSERVER_POOL_MAX` | Max pool size | `10` |
| `SQLSERVER_CONNECT_TIMEOUT` | Connect timeout (sec) | `30` |
| `SQLSERVER_QUERY_TIMEOUT` | Query timeout (sec) | `30` |
| `SQLSERVER_READ_HOST` | Read replica host | - |
| `SQLSERVER_CONNECTION_STRING` | Full connection string | - |

### 6.2 Configuration File (YAML)

```yaml
sqlserver:
  write:
    host: "sql-primary.example.com"
    port: 1433
    database: "mydb"
    auth:
      method: "sql"  # sql | windows | azure_ad_password | azure_ad_msi | azure_ad_sp
      username: "app_user"
      password: "${SQLSERVER_PASSWORD}"  # From env

  read_replicas:
    - host: "sql-replica-1.example.com"
      lag_threshold: 5s
    - host: "sql-replica-2.example.com"
      lag_threshold: 5s

  pool:
    min: 2
    max: 20
    idle_timeout: 300s
    acquire_timeout: 30s
    health_check_interval: 30s

  timeouts:
    connect: 30s
    query: 30s
    transaction: 60s

  retry:
    max_attempts: 3
    base_delay: 100ms
    max_delay: 2s

  circuit_breaker:
    failure_threshold: 5
    success_threshold: 2
    reset_timeout: 30s

  tls:
    encrypt: true
    trust_server_cert: false
    # ca_cert: "/path/to/ca.crt"  # Optional

  load_balancing:
    strategy: "least_lag"  # round_robin | least_lag | random
```

---

## 7. API Reference

### 7.1 Rust API

```rust
// Client initialization
let config = SqlServerConfig::from_env()?;
let client = SqlServerClient::new(config).await?;

// Simple queries
let users: Vec<User> = client.query(
    "SELECT id, name, email FROM users WHERE active = @p1",
    &[true.into()]
).await?;

let user: User = client.query_one(
    "SELECT id, name, email FROM users WHERE id = @p1",
    &[42.into()]
).await?;

let user: Option<User> = client.query_optional(
    "SELECT id, name, email FROM users WHERE id = @p1",
    &[42.into()]
).await?;

// Execute (INSERT/UPDATE/DELETE)
let rows_affected = client.execute(
    "UPDATE users SET last_login = @p1 WHERE id = @p2",
    &[Utc::now().into(), 42.into()]
).await?;

// Transactions
let result = client.transaction(IsolationLevel::ReadCommitted, |tx| async move {
    tx.execute("INSERT INTO orders (user_id, total) VALUES (@p1, @p2)", &[1.into(), 99.99.into()]).await?;
    let order_id: i32 = tx.execute_scalar("SELECT SCOPE_IDENTITY()").await?;
    tx.execute("INSERT INTO order_items (order_id, product_id) VALUES (@p1, @p2)", &[order_id.into(), 100.into()]).await?;
    Ok(order_id)
}).await?;

// With savepoints
let tx = client.begin_transaction(IsolationLevel::RepeatableRead).await?;
tx.execute("INSERT INTO logs (msg) VALUES (@p1)", &["start".into()]).await?;
tx.savepoint("before_risky").await?;

match risky_operation(&tx).await {
    Ok(_) => {},
    Err(_) => tx.rollback_to_savepoint("before_risky").await?,
}

tx.commit().await?;

// Bulk insert
let rows_inserted = client.bulk_insert("users")
    .columns(&["name", "email", "created_at"])
    .batch_size(1000)
    .tablock()
    .execute(users_iter)
    .await?;

// Stored procedures
let result: ProcedureResult<Order> = client.call_procedure(
    ProcedureCall::new("dbo.CreateOrder")
        .param("@CustomerId", 123)
        .param("@Total", 99.99)
        .output_param("@OrderId", SqlType::Int)
).await?;

let order_id: i32 = result.output_values["@OrderId"].clone().try_into()?;

// Read replica routing (automatic)
let reports: Vec<Report> = client.query(
    "SELECT * FROM reports WHERE date > @p1",  // Routes to replica
    &[date.into()]
).await?;
```

### 7.2 TypeScript API

```typescript
import { SqlServerClient, IsolationLevel } from '@llm-devops/sqlserver';

// Client initialization
const client = await SqlServerClient.create({
  host: 'sql.example.com',
  database: 'mydb',
  auth: { type: 'sql', username: 'user', password: process.env.DB_PASSWORD },
});

// Simple queries
const users = await client.query<User>(
  'SELECT id, name, email FROM users WHERE active = @active',
  { active: true }
);

const user = await client.queryOne<User>(
  'SELECT id, name, email FROM users WHERE id = @id',
  { id: 42 }
);

// Execute
const rowsAffected = await client.execute(
  'UPDATE users SET last_login = @now WHERE id = @id',
  { now: new Date(), id: 42 }
);

// Transactions
const orderId = await client.transaction(async (tx) => {
  await tx.execute(
    'INSERT INTO orders (user_id, total) VALUES (@userId, @total)',
    { userId: 1, total: 99.99 }
  );

  const result = await tx.queryOne<{ id: number }>(
    'SELECT SCOPE_IDENTITY() as id'
  );

  await tx.execute(
    'INSERT INTO order_items (order_id, product_id) VALUES (@orderId, @productId)',
    { orderId: result.id, productId: 100 }
  );

  return result.id;
}, { isolation: IsolationLevel.ReadCommitted });

// Bulk insert
const inserted = await client.bulkInsert('users', {
  columns: ['name', 'email', 'created_at'],
  rows: usersData,
  batchSize: 1000,
});

// Stored procedure
const { rows, output } = await client.callProcedure<Order>('dbo.CreateOrder', {
  params: { CustomerId: 123, Total: 99.99 },
  output: { OrderId: 'int' },
});
```

---

## 8. Deployment Checklist

### 8.1 Pre-Deployment

| Check | Status |
|-------|--------|
| All P0 requirements implemented | ☐ |
| Unit test coverage ≥ 85% | ☐ |
| Integration tests passing | ☐ |
| Security checklist complete | ☐ |
| Documentation complete | ☐ |
| Cargo clippy clean | ☐ |
| No compiler warnings | ☐ |
| Load testing completed | ☐ |

### 8.2 Deployment

| Check | Status |
|-------|--------|
| Database credentials configured | ☐ |
| Connection string validated | ☐ |
| TLS certificates in place | ☐ |
| Network connectivity verified | ☐ |
| Pool size appropriate | ☐ |
| Monitoring dashboards deployed | ☐ |
| Alerts configured | ☐ |

### 8.3 Post-Deployment

| Check | Status |
|-------|--------|
| Connection successful | ☐ |
| Health checks passing | ☐ |
| Sample queries working | ☐ |
| Metrics flowing | ☐ |
| Logs structured correctly | ☐ |
| Replica routing functional | ☐ |
| Runbooks accessible | ☐ |

---

## 9. Dependencies

### 9.1 Rust Dependencies (Cargo.toml)

```toml
[dependencies]
tokio = { version = "1.35", features = ["full"] }
tiberius = { version = "0.12", features = ["tds73", "chrono", "rust_decimal"] }
bb8 = "0.8"
bb8-tiberius = "0.15"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
async-trait = "0.1"
thiserror = "1.0"
tracing = "0.1"
chrono = { version = "0.4", features = ["serde"] }
rust_decimal = "1.33"
uuid = { version = "1.6", features = ["v4", "serde"] }
futures = "0.3"
rand = "0.8"
zeroize = "1.7"
secrecy = "0.8"

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.12"
proptest = "1.4"
test-case = "3.3"
testcontainers = "0.15"
```

### 9.2 TypeScript Dependencies (package.json)

```json
{
  "dependencies": {
    "tedious": "^18.0.0",
    "tarn": "^3.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/tedious": "^4.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.1.0"
  }
}
```

---

## 10. Sign-Off

### 10.1 Review Checklist

| Reviewer | Area | Status | Date |
|----------|------|--------|------|
| Tech Lead | Architecture | ☐ | |
| Security | Security controls | ☐ | |
| DBA | Query patterns | ☐ | |
| SRE | Operational readiness | ☐ | |
| QA | Test coverage | ☐ | |

### 10.2 Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Project Lead | | | |
| Engineering Manager | | | |
| Security Officer | | | |
| DBA Lead | | | |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Completion |

---

**SPARC Cycle Complete** - Ready for implementation.
