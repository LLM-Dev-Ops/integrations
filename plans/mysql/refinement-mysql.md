# MySQL Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/database/mysql`

---

## 1. Edge Cases and Boundary Conditions

### 1.1 Connection Pool Exhaustion

```
Scenario: All connections in use, new request arrives
───────────────────────────────────────────────────

State:
├── max_connections: 20
├── active_connections: 20
├── idle_connections: 0
└── waiting_requests: 5

Handling:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION acquire_with_backpressure(pool, timeout_ms):                    │
│                                                                          │
│   // Check waiting queue depth                                           │
│   IF pool.waiting_count > pool.max_connections * 2:                      │
│     // Fail fast to prevent cascade                                      │
│     emit_metric("mysql.pool.rejected", 1)                                │
│     RAISE PoolExhaustedError(                                            │
│       message: "Connection pool overwhelmed",                            │
│       active: pool.active_count,                                         │
│       waiting: pool.waiting_count                                        │
│     )                                                                    │
│                                                                          │
│   // Join waiting queue with timeout                                     │
│   pool.waiting_count.increment()                                         │
│   start = now()                                                          │
│                                                                          │
│   DEFER:                                                                 │
│     pool.waiting_count.decrement()                                       │
│                                                                          │
│   LOOP:                                                                  │
│     // Try to acquire                                                    │
│     IF let Some(conn) = try_acquire(pool):                               │
│       RETURN conn                                                        │
│                                                                          │
│     // Check timeout                                                     │
│     elapsed = now() - start                                              │
│     IF elapsed >= timeout_ms:                                            │
│       emit_metric("mysql.pool.timeout", 1)                               │
│       RAISE ConnectionAcquireTimeout(elapsed)                            │
│                                                                          │
│     // Wait with exponential backoff                                     │
│     wait_time = min(100 * (2 ^ attempt), 1000)                           │
│     sleep(wait_time)                                                     │
└─────────────────────────────────────────────────────────────────────────┘

Mitigation Strategies:
- Fail fast when queue too deep
- Emit metrics for monitoring
- Alert on sustained high waiting count
- Consider auto-scaling pool size
```

### 1.2 Transaction Left Open on Connection Return

```
Scenario: Connection returned to pool with active transaction
─────────────────────────────────────────────────────────────

Detection:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION release_connection_safe(pool, conn):                            │
│                                                                          │
│   // Check for orphaned transaction                                      │
│   IF conn.transaction_depth > 0:                                         │
│     log.error("Connection released with active transaction",             │
│       connection_id: conn.id,                                            │
│       transaction_depth: conn.transaction_depth,                         │
│       duration_ms: now() - conn.transaction_start                        │
│     )                                                                    │
│                                                                          │
│     emit_metric("mysql.transaction.orphaned", 1)                         │
│                                                                          │
│     // Attempt rollback                                                  │
│     TRY:                                                                 │
│       execute_raw(conn, "ROLLBACK")                                      │
│       conn.transaction_depth = 0                                         │
│       conn.state = Idle                                                  │
│                                                                          │
│     CATCH error:                                                         │
│       // Rollback failed, connection is corrupt                          │
│       log.error("Rollback failed, closing connection", error=error)      │
│       close_connection(conn)                                             │
│       pool.total_count.decrement()                                       │
│       RETURN                                                             │
│                                                                          │
│   // Normal release                                                      │
│   return_to_pool(pool, conn)                                             │
└─────────────────────────────────────────────────────────────────────────┘

Prevention:
- Use with_transaction() wrapper
- Implement connection guard with Drop
- Log stack trace for debugging
```

### 1.3 Deadlock Detection and Recovery

```
Scenario: Two transactions deadlock
────────────────────────────────────

MySQL Response: ERROR 1213 (40001): Deadlock found

Handling:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION execute_with_deadlock_retry(conn, sql, params, max_retries):   │
│                                                                          │
│   attempts = 0                                                           │
│   backoff = ExponentialBackoff(initial: 50ms, max: 2000ms)              │
│                                                                          │
│   LOOP:                                                                  │
│     TRY:                                                                 │
│       RETURN execute_query(conn, sql, params)                            │
│                                                                          │
│     CATCH DeadlockDetected:                                              │
│       attempts += 1                                                      │
│       emit_metric("mysql.deadlock.detected", 1)                          │
│                                                                          │
│       IF attempts >= max_retries:                                        │
│         log.error("Deadlock retry limit exceeded",                       │
│           attempts: attempts,                                            │
│           sql: redact_query(sql)                                         │
│         )                                                                │
│         RAISE DeadlockRetryExhausted(attempts)                           │
│                                                                          │
│       // Log deadlock info                                               │
│       deadlock_info = execute_raw(conn, "SHOW ENGINE INNODB STATUS")     │
│       log.warn("Deadlock detected, retrying",                            │
│         attempt: attempts,                                               │
│         info: extract_deadlock_section(deadlock_info)                    │
│       )                                                                  │
│                                                                          │
│       // Backoff before retry                                            │
│       sleep(backoff.next())                                              │
│                                                                          │
│       // Transaction was rolled back by MySQL, restart if needed         │
│       IF conn.in_transaction:                                            │
│         execute_raw(conn, "BEGIN")                                       │
└─────────────────────────────────────────────────────────────────────────┘

Best Practices:
- Access tables in consistent order
- Keep transactions short
- Use appropriate isolation level
- Add deadlock retry to write operations
```

### 1.4 Replica Lag Exceeds Threshold

```
Scenario: All replicas lag beyond acceptable threshold
──────────────────────────────────────────────────────

Detection:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION select_healthy_replica(client):                                 │
│                                                                          │
│   healthy_replicas = []                                                  │
│                                                                          │
│   FOR replica IN client.replica_pools:                                   │
│     // Skip if circuit breaker open                                      │
│     IF client.replica_breakers[replica.id].is_open():                    │
│       CONTINUE                                                           │
│                                                                          │
│     // Check replication lag                                             │
│     TRY:                                                                 │
│       lag = check_replica_lag(replica)                                   │
│       replica.last_known_lag = lag                                       │
│                                                                          │
│       IF lag <= client.config.max_replica_lag_ms:                        │
│         healthy_replicas.append(replica)                                 │
│       ELSE:                                                              │
│         emit_metric("mysql.replica.lagging", lag,                        │
│           tags: {replica: replica.id}                                    │
│         )                                                                │
│                                                                          │
│     CATCH error:                                                         │
│       replica.healthy = false                                            │
│       client.replica_breakers[replica.id].record_failure()               │
│                                                                          │
│   // Decision based on result                                            │
│   IF healthy_replicas.is_empty():                                        │
│     log.warn("No healthy replicas, falling back to primary")             │
│     emit_metric("mysql.replica.fallback_to_primary", 1)                  │
│     RETURN client.primary_pool                                           │
│                                                                          │
│   RETURN load_balancer.select(healthy_replicas)                          │
└─────────────────────────────────────────────────────────────────────────┘

Configuration Options:
- max_replica_lag_ms: Threshold for acceptable lag
- fallback_to_primary: Allow primary reads on lag
- lag_check_interval_ms: How often to check lag
```

### 1.5 Large Result Set Handling

```
Scenario: Query returns millions of rows
────────────────────────────────────────

Problem: Loading all rows into memory causes OOM

Solution:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION query_stream_safe(client, sql, params, options):                │
│                                                                          │
│   // Validate query has LIMIT or is known-bounded                        │
│   IF NOT has_limit_clause(sql) AND NOT options.allow_unbounded:          │
│     log.warn("Unbounded query without streaming", sql=redact_query(sql)) │
│     emit_metric("mysql.query.unbounded_warning", 1)                      │
│                                                                          │
│   // Use streaming for large results                                     │
│   conn = acquire_connection(client)                                      │
│                                                                          │
│   // Set server-side cursor                                              │
│   execute_raw(conn, "SET SESSION net_write_timeout = 600")               │
│   execute_raw(conn, "SET SESSION max_execution_time = " +                │
│     options.timeout_ms.to_string())                                      │
│                                                                          │
│   // Execute with streaming                                              │
│   result = mysql_query_streaming(conn, sql, params)                      │
│                                                                          │
│   RETURN StreamingResultSet {                                            │
│     connection: conn,                                                    │
│     result: result,                                                      │
│     rows_fetched: 0,                                                     │
│     batch_size: options.batch_size,                                      │
│                                                                          │
│     next_batch: FUNCTION() -> Option<Vec<Row>>:                          │
│       batch = []                                                         │
│       FOR _ IN 0..self.batch_size:                                       │
│         IF let Some(row) = self.result.fetch_row():                      │
│           batch.append(row)                                              │
│           self.rows_fetched += 1                                         │
│         ELSE:                                                            │
│           BREAK                                                          │
│                                                                          │
│       IF batch.is_empty():                                               │
│         release_connection(self.connection)                              │
│         RETURN None                                                      │
│                                                                          │
│       RETURN Some(batch)                                                 │
│   }                                                                      │
└─────────────────────────────────────────────────────────────────────────┘

Memory Limits:
- batch_size: 1000 rows per fetch
- Row size estimation for memory tracking
- Auto-cancel if memory threshold exceeded
```

### 1.6 Connection Loss Mid-Transaction

```
Scenario: Network failure during transaction
────────────────────────────────────────────

Detection and Handling:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION execute_in_transaction(tx, sql, params):                        │
│                                                                          │
│   TRY:                                                                   │
│     RETURN execute_query(tx.connection, sql, params)                     │
│                                                                          │
│   CATCH ConnectionLost, ServerGone:                                      │
│     // Connection lost, transaction is implicitly rolled back            │
│     log.error("Connection lost during transaction",                      │
│       transaction_id: tx.id,                                             │
│       duration_ms: now() - tx.started_at,                                │
│       statements_executed: tx.statement_count                            │
│     )                                                                    │
│                                                                          │
│     emit_metric("mysql.transaction.connection_lost", 1)                  │
│                                                                          │
│     // Mark transaction as failed                                        │
│     tx.state = Failed                                                    │
│                                                                          │
│     // Close corrupt connection (don't return to pool)                   │
│     close_connection(tx.connection)                                      │
│                                                                          │
│     RAISE TransactionAborted(                                            │
│       cause: "Connection lost",                                          │
│       recoverable: false,                                                │
│       hint: "Transaction was rolled back by server"                      │
│     )                                                                    │
└─────────────────────────────────────────────────────────────────────────┘

Recovery Options:
- Application must retry entire transaction
- Provide idempotency guidance
- Log transaction operations for replay
```

### 1.7 Prepared Statement Cache Invalidation

```
Scenario: Table schema changes, cached statements become invalid
───────────────────────────────────────────────────────────────

Detection:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION execute_prepared_safe(client, stmt, params):                    │
│                                                                          │
│   TRY:                                                                   │
│     RETURN mysql_execute_prepared(stmt, params)                          │
│                                                                          │
│   CATCH PreparedStatementInvalid:                                        │
│     // Statement no longer valid (schema change)                         │
│     log.info("Prepared statement invalidated, re-preparing",             │
│       sql: stmt.sql                                                      │
│     )                                                                    │
│                                                                          │
│     // Remove from cache                                                 │
│     client.prepared_cache.remove(stmt.cache_key)                         │
│                                                                          │
│     // Re-prepare                                                        │
│     new_stmt = prepare(client, stmt.sql)                                 │
│                                                                          │
│     // Retry with new statement                                          │
│     RETURN mysql_execute_prepared(new_stmt, params)                      │
│                                                                          │
│   CATCH ColumnCountMismatch:                                             │
│     // Parameter count changed                                           │
│     client.prepared_cache.remove(stmt.cache_key)                         │
│     RAISE SchemaChangedError(                                            │
│       message: "Table schema changed, statement invalid",                │
│       sql: stmt.sql                                                      │
│     )                                                                    │
└─────────────────────────────────────────────────────────────────────────┘

Cache Management:
- LRU eviction when cache full
- Manual invalidation API
- TTL-based expiration option
```

---

## 2. Security Hardening

### 2.1 SQL Injection Prevention

```
Query Safety Enforcement:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION validate_query_safety(sql: String, params: Vec<Value>):        │
│                                                                          │
│   // 1. No string interpolation allowed                                  │
│   IF contains_interpolation_pattern(sql):                                │
│     RAISE UnsafeQueryError("String interpolation detected")              │
│                                                                          │
│   // 2. Parameter count must match placeholders                          │
│   placeholder_count = count_placeholders(sql)                            │
│   IF placeholder_count != params.len():                                  │
│     RAISE ParameterCountMismatch(                                        │
│       expected: placeholder_count,                                       │
│       got: params.len()                                                  │
│     )                                                                    │
│                                                                          │
│   // 3. Check for dangerous patterns                                     │
│   dangerous_patterns = [                                                 │
│     r";\s*DROP\s+",           // Piggyback DROP                          │
│     r";\s*DELETE\s+",         // Piggyback DELETE                        │
│     r"LOAD\s+DATA\s+",        // File read                               │
│     r"INTO\s+OUTFILE",        // File write                              │
│     r"INTO\s+DUMPFILE",       // Binary file write                       │
│   ]                                                                      │
│                                                                          │
│   FOR pattern IN dangerous_patterns:                                     │
│     IF regex_match(pattern, sql.upper()):                                │
│       log.warn("Potentially dangerous query pattern detected",           │
│         pattern: pattern, sql: redact_query(sql))                        │
│       emit_metric("mysql.query.dangerous_pattern", 1)                    │
│       // Allow but flag for review                                       │
│                                                                          │
│   // 4. Validate parameter types                                         │
│   FOR param IN params:                                                   │
│     validate_param_type(param)                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Connection Security

```
SSL/TLS Configuration:
┌─────────────────────────────────────────────────────────────────────────┐
│ SSL Modes:                                                               │
│                                                                          │
│ Disabled:                                                                │
│   - No encryption (development only)                                     │
│   - Blocked in production configuration                                  │
│                                                                          │
│ Preferred:                                                               │
│   - Use SSL if server supports                                           │
│   - Fall back to unencrypted                                             │
│                                                                          │
│ Required:                                                                │
│   - SSL required, any certificate accepted                               │
│   - Minimum for production                                               │
│                                                                          │
│ VerifyCA:                                                                │
│   - SSL required                                                         │
│   - Server certificate verified against CA                               │
│   - Recommended for production                                           │
│                                                                          │
│ VerifyIdentity:                                                          │
│   - SSL required                                                         │
│   - Certificate verified against CA                                      │
│   - Hostname verified against certificate                                │
│   - Strictest security                                                   │
└─────────────────────────────────────────────────────────────────────────┘

Production Enforcement:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION validate_production_config(config: MysqlConfig):               │
│                                                                          │
│   IF is_production_environment():                                        │
│     // Enforce minimum SSL mode                                          │
│     IF config.ssl_mode IN [Disabled, Preferred]:                         │
│       RAISE ConfigurationError(                                          │
│         "Production requires ssl_mode >= Required"                       │
│       )                                                                  │
│                                                                          │
│     // Require CA certificate for VerifyCA/VerifyIdentity                │
│     IF config.ssl_mode IN [VerifyCA, VerifyIdentity]:                    │
│       IF config.ssl_ca IS null:                                          │
│         RAISE ConfigurationError("ssl_ca required for " + config.ssl_mode)│
│                                                                          │
│     // Warn if query logging enabled                                     │
│     IF config.log_queries:                                               │
│       log.warn("Query logging enabled in production")                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Credential Rotation

```
Credential Rotation Handling:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION handle_credential_rotation(client: MysqlClient):               │
│                                                                          │
│   // Subscribe to credential rotation events                             │
│   shared/secrets.on_rotation(client.config.credential_key, || {          │
│     log.info("Credential rotation detected, refreshing connections")     │
│                                                                          │
│     // Get new credentials                                               │
│     new_creds = shared/secrets.get_credential(client.config.credential_key)│
│                                                                          │
│     // Update configuration                                              │
│     client.config.password = new_creds                                   │
│                                                                          │
│     // Gracefully drain old connections                                  │
│     FOR conn IN client.primary_pool.idle_connections():                  │
│       close_connection(conn)                                             │
│                                                                          │
│     FOR replica_pool IN client.replica_pools:                            │
│       FOR conn IN replica_pool.idle_connections():                       │
│         close_connection(conn)                                           │
│                                                                          │
│     // Active connections will be replaced on release                    │
│     log.info("Credential rotation complete")                             │
│   })                                                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Audit Logging

```
Audit Events:
┌─────────────────────────────────────────────────────────────────────────┐
│ Event Type           │ Logged Fields                                    │
│ ─────────────────────┼────────────────────────────────────────────────  │
│ CONNECTION_ACQUIRED  │ connection_id, pool_id, wait_time_ms             │
│ CONNECTION_RELEASED  │ connection_id, usage_time_ms, in_transaction     │
│ CONNECTION_CLOSED    │ connection_id, reason, lifetime_ms               │
│ QUERY_EXECUTED       │ query_hash, execution_time_ms, rows_affected     │
│ QUERY_FAILED         │ query_hash, error_type, error_code               │
│ TRANSACTION_STARTED  │ transaction_id, isolation_level, read_only       │
│ TRANSACTION_COMMITTED│ transaction_id, duration_ms, statement_count     │
│ TRANSACTION_ROLLED   │ transaction_id, duration_ms, reason              │
│ DEADLOCK_DETECTED    │ transaction_id, tables_involved                  │
│ REPLICA_SELECTED     │ replica_id, lag_ms, selection_reason             │
│ REPLICA_SKIPPED      │ replica_id, reason (lag/breaker/health)          │
└─────────────────────────────────────────────────────────────────────────┘

Redaction Rules:
- Query parameters: Never logged
- Query text: Logged as hash or template only
- Credentials: Never logged, use "[REDACTED]"
- Row data: Never logged
```

---

## 3. Performance Optimizations

### 3.1 Connection Pool Tuning

```
Pool Sizing Guidelines:
┌─────────────────────────────────────────────────────────────────────────┐
│ Workload Type        │ min_conn │ max_conn │ idle_timeout │ Notes       │
│ ─────────────────────┼──────────┼──────────┼──────────────┼──────────── │
│ Web API (low)        │ 5        │ 20       │ 10 min       │ Standard    │
│ Web API (high)       │ 10       │ 50       │ 5 min        │ Busy API    │
│ Background jobs      │ 2        │ 10       │ 30 min       │ Batch work  │
│ Analytics            │ 3        │ 15       │ 5 min        │ Long queries│
│ Mixed workload       │ 5        │ 30       │ 10 min       │ General     │
└─────────────────────────────────────────────────────────────────────────┘

Formula:
  max_connections = (core_count * 2) + effective_spindle_count

For cloud/SSD: max_connections ≈ core_count * 4

Dynamic Adjustment:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION auto_tune_pool(pool, metrics_window):                           │
│                                                                          │
│   avg_wait_time = metrics.avg("mysql.pool.acquire_time", metrics_window) │
│   avg_active = metrics.avg("mysql.pool.active", metrics_window)          │
│   timeout_rate = metrics.rate("mysql.pool.timeout", metrics_window)      │
│                                                                          │
│   // Increase pool size if wait time high                                │
│   IF avg_wait_time > 100ms AND pool.max < absolute_max:                  │
│     new_max = min(pool.max * 1.5, absolute_max)                          │
│     pool.reconfigure(max_connections: new_max)                           │
│     log.info("Pool size increased", new_max: new_max)                    │
│                                                                          │
│   // Decrease pool size if underutilized                                 │
│   IF avg_active < pool.min * 0.5 AND pool.max > pool.min:                │
│     new_max = max(pool.min, pool.max * 0.75)                             │
│     pool.reconfigure(max_connections: new_max)                           │
│     log.info("Pool size decreased", new_max: new_max)                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Query Performance

```
Query Optimization Strategies:
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Prepared Statement Caching                                            │
│    - Cache frequently used queries                                       │
│    - Reduce parse overhead                                               │
│    - LRU eviction, size limit 256                                        │
│                                                                          │
│ 2. Result Set Streaming                                                  │
│    - Use for queries returning > 1000 rows                               │
│    - Reduces memory footprint                                            │
│    - Maintains connection during iteration                               │
│                                                                          │
│ 3. Batch Operations                                                      │
│    - Group multiple INSERTs                                              │
│    - Use multi-row INSERT syntax                                         │
│    - Limit batch size to 1000                                            │
│                                                                          │
│ 4. Read/Write Splitting                                                  │
│    - Route reads to replicas                                             │
│    - Reduce primary load                                                 │
│    - Consider eventual consistency                                       │
└─────────────────────────────────────────────────────────────────────────┘

Slow Query Detection:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION track_query_performance(sql, duration_ms, rows):                │
│                                                                          │
│   emit_metric("mysql.query.latency_ms", duration_ms, tags={              │
│     query_hash: hash(normalize_query(sql))                               │
│   })                                                                     │
│                                                                          │
│   IF duration_ms > config.slow_query_threshold_ms:                       │
│     emit_metric("mysql.query.slow", 1)                                   │
│                                                                          │
│     log.warn("Slow query detected",                                      │
│       duration_ms: duration_ms,                                          │
│       rows: rows,                                                        │
│       query_template: extract_template(sql)                              │
│     )                                                                    │
│                                                                          │
│     // Store for analysis                                                │
│     shared/vector-memory.store_embedding(                                │
│       key: "slow_query:" + hash(sql),                                    │
│       embedding: embed_query(sql),                                       │
│       metadata: {duration_ms, rows, timestamp: now()}                    │
│     )                                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Transaction Optimization

```
Transaction Best Practices:
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Keep Transactions Short                                               │
│    - Minimize lock duration                                              │
│    - Avoid external calls within transaction                             │
│    - Default timeout: 30 seconds                                         │
│                                                                          │
│ 2. Choose Appropriate Isolation Level                                    │
│    - READ COMMITTED for most cases                                       │
│    - REPEATABLE READ for consistency needs                               │
│    - SERIALIZABLE only when required                                     │
│                                                                          │
│ 3. Use Read-Only Transactions                                            │
│    - SET TRANSACTION READ ONLY                                           │
│    - Better optimization by MySQL                                        │
│    - Can use replicas                                                    │
│                                                                          │
│ 4. Batch Within Transactions                                             │
│    - Group related writes                                                │
│    - Single commit overhead                                              │
│    - Atomic success/failure                                              │
└─────────────────────────────────────────────────────────────────────────┘

Transaction Timeout:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION begin_transaction_with_timeout(client, options):                │
│                                                                          │
│   tx = begin_transaction(client, options)                                │
│                                                                          │
│   // Set server-side timeout                                             │
│   timeout_sec = options.timeout_ms / 1000                                │
│   execute_raw(tx.connection,                                             │
│     "SET SESSION innodb_lock_wait_timeout = " + timeout_sec              │
│   )                                                                      │
│                                                                          │
│   // Set client-side watchdog                                            │
│   tx.watchdog = spawn_watchdog(tx, options.timeout_ms, || {              │
│     log.error("Transaction timeout exceeded, forcing rollback")          │
│     TRY:                                                                 │
│       rollback(tx)                                                       │
│     CATCH:                                                               │
│       close_connection(tx.connection)                                    │
│   })                                                                     │
│                                                                          │
│   RETURN tx                                                              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Resilience Patterns

### 4.1 Retry Strategy

```
Retry Configuration by Error:
┌─────────────────────────────────────────────────────────────────────────┐
│ Error Type           │ Retries │ Backoff      │ Notes                   │
│ ─────────────────────┼─────────┼──────────────┼──────────────────────── │
│ DeadlockDetected     │ 3       │ 50-500ms exp │ Transaction restarted   │
│ LockWaitTimeout      │ 2       │ 100-1000ms   │ May need longer timeout │
│ ConnectionLost       │ 2       │ 100-500ms    │ New connection acquired │
│ TooManyConnections   │ 3       │ 500-2000ms   │ Wait for capacity       │
│ ServerGone           │ 1       │ 100ms        │ Reconnect attempt       │
│ QueryTimeout         │ 1       │ None         │ Query may be too slow   │
└─────────────────────────────────────────────────────────────────────────┘

Implementation:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION get_retry_policy(error: MysqlError) -> RetryPolicy:            │
│                                                                          │
│   MATCH error:                                                           │
│     DeadlockDetected => RetryPolicy {                                    │
│       max_attempts: 3,                                                   │
│       backoff: Exponential(base: 50ms, max: 500ms, jitter: 0.2)         │
│     }                                                                    │
│                                                                          │
│     LockWaitTimeout => RetryPolicy {                                     │
│       max_attempts: 2,                                                   │
│       backoff: Exponential(base: 100ms, max: 1000ms, jitter: 0.1)       │
│     }                                                                    │
│                                                                          │
│     ConnectionLost, ServerGone => RetryPolicy {                          │
│       max_attempts: 2,                                                   │
│       backoff: Fixed(100ms),                                             │
│       on_retry: |client| client.invalidate_connection()                  │
│     }                                                                    │
│                                                                          │
│     TooManyConnections => RetryPolicy {                                  │
│       max_attempts: 3,                                                   │
│       backoff: Exponential(base: 500ms, max: 2000ms, jitter: 0.3)       │
│     }                                                                    │
│                                                                          │
│     _ => RetryPolicy::no_retry()                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Circuit Breaker Configuration

```
Circuit Breaker Settings:
┌─────────────────────────────────────────────────────────────────────────┐
│ Endpoint Type   │ Threshold │ Window │ Open Duration │ Half-Open       │
│ ────────────────┼───────────┼────────┼───────────────┼──────────────── │
│ Primary         │ 5         │ 30s    │ 60s           │ 1 probe         │
│ Replica         │ 3         │ 20s    │ 30s           │ 2 probes        │
└─────────────────────────────────────────────────────────────────────────┘

Failure Events (trigger circuit breaker):
- Connection refused
- Connection timeout
- Server gone away
- Too many connections (after retries)

Non-Failure Events (don't trigger):
- Syntax errors
- Constraint violations
- Access denied
- Query timeout (configurable)
```

### 4.3 Health Check Strategy

```
Health Check Implementation:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION comprehensive_health_check(client) -> HealthStatus:            │
│                                                                          │
│   result = HealthStatus {                                                │
│     primary: Unknown,                                                    │
│     replicas: [],                                                        │
│     pool_status: None                                                    │
│   }                                                                      │
│                                                                          │
│   // Check primary                                                       │
│   TRY:                                                                   │
│     conn = client.primary_pool.acquire(timeout: 5000)                    │
│     execute_raw(conn, "SELECT 1")                                        │
│     client.primary_pool.release(conn)                                    │
│     result.primary = Healthy                                             │
│   CATCH error:                                                           │
│     result.primary = Unhealthy(error.message)                            │
│                                                                          │
│   // Check each replica                                                  │
│   FOR replica IN client.replica_pools:                                   │
│     TRY:                                                                 │
│       conn = replica.pool.acquire(timeout: 5000)                         │
│       execute_raw(conn, "SELECT 1")                                      │
│       lag = check_replica_lag(conn)                                      │
│       replica.pool.release(conn)                                         │
│       result.replicas.append(ReplicaHealth {                             │
│         id: replica.id,                                                  │
│         status: Healthy,                                                 │
│         lag_ms: lag                                                      │
│       })                                                                 │
│     CATCH error:                                                         │
│       result.replicas.append(ReplicaHealth {                             │
│         id: replica.id,                                                  │
│         status: Unhealthy(error.message),                                │
│         lag_ms: None                                                     │
│       })                                                                 │
│                                                                          │
│   // Pool statistics                                                     │
│   result.pool_status = client.primary_pool.get_stats()                   │
│                                                                          │
│   RETURN result                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Testing Strategy

### 5.1 Unit Tests

```
Test Categories:
┌─────────────────────────────────────────────────────────────────────────┐
│ Category               │ Test Cases                                     │
│ ───────────────────────┼─────────────────────────────────────────────── │
│ Connection Pool        │ - Acquire/release lifecycle                    │
│                        │ - Pool exhaustion handling                     │
│                        │ - Idle timeout eviction                        │
│                        │ - Max lifetime enforcement                     │
│                        │                                                │
│ Query Router           │ - Statement type detection                     │
│                        │ - SELECT FOR UPDATE routing                    │
│                        │ - Hint parsing (/*+ PRIMARY */)                │
│                        │ - Transaction context routing                  │
│                        │                                                │
│ Transaction            │ - Begin/commit/rollback                        │
│                        │ - Savepoint management                         │
│                        │ - Isolation level setting                      │
│                        │ - Orphan transaction detection                 │
│                        │                                                │
│ Error Mapping          │ - All MySQL error codes                        │
│                        │ - Retry classification                         │
│                        │ - Error message extraction                     │
│                        │                                                │
│ Load Balancer          │ - Round robin selection                        │
│                        │ - Weighted distribution                        │
│                        │ - Least connections                            │
│                        │ - Health filtering                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Integration Tests

```
Integration Test Scenarios:
┌─────────────────────────────────────────────────────────────────────────┐
│ Scenario                    │ Setup                                     │
│ ────────────────────────────┼──────────────────────────────────────────│
│ Basic CRUD                  │ Single MySQL instance                     │
│ Transaction isolation       │ Concurrent transactions                   │
│ Deadlock handling           │ Trigger deadlock, verify retry            │
│ Connection pool stress      │ Max connections reached                   │
│ Replica routing             │ Primary + 2 replicas                      │
│ Replica lag handling        │ Simulated lag via delayed replication     │
│ Connection loss             │ Network partition simulation              │
│ Prepared statement cache    │ Schema change mid-operation               │
│ Large result streaming      │ 100k row query                            │
│ Batch operations            │ 1000 insert batch                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Simulation Tests

```
Mock-Based Tests:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION test_deadlock_retry():                                          │
│   mock = MockMysqlClient::new()                                          │
│                                                                          │
│   // Configure deadlock on first attempt, success on second              │
│   mock.configure_response("UPDATE users SET ...", [                      │
│     Response::Error(DeadlockDetected),                                   │
│     Response::Success(affected_rows: 1)                                  │
│   ])                                                                     │
│                                                                          │
│   result = execute(mock, "UPDATE users SET ...", [])                     │
│                                                                          │
│   ASSERT result.is_ok()                                                  │
│   ASSERT result.affected_rows == 1                                       │
│   ASSERT mock.attempt_count("UPDATE users SET ...") == 2                 │
│   ASSERT mock.metrics["mysql.deadlock.detected"] == 1                    │
│                                                                          │
│ FUNCTION test_replica_failover():                                        │
│   mock = MockMysqlClient::new()                                          │
│     .with_primary(healthy: true)                                         │
│     .with_replica("r1", healthy: false)                                  │
│     .with_replica("r2", healthy: true, lag_ms: 500)                      │
│                                                                          │
│   // Query should route to r2 (skip unhealthy r1)                        │
│   result = query(mock, "SELECT * FROM users", [])                        │
│                                                                          │
│   ASSERT result.is_ok()                                                  │
│   ASSERT mock.last_endpoint() == "r2"                                    │
│   ASSERT mock.metrics["mysql.replica.skipped"] == 1                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Observability Refinements

### 6.1 Metric Dimensions

```
Metric Tagging:
┌─────────────────────────────────────────────────────────────────────────┐
│ Metric                      │ Tags                                      │
│ ────────────────────────────┼──────────────────────────────────────────│
│ mysql.connections.*         │ pool (primary/replica-N), state           │
│ mysql.queries.count         │ operation (select/insert/update/delete)   │
│ mysql.queries.latency_ms    │ operation, database                       │
│ mysql.queries.errors        │ error_type, retryable                     │
│ mysql.transactions.*        │ isolation_level, read_only                │
│ mysql.replica.lag_ms        │ replica_id                                │
│ mysql.replica.queries       │ replica_id                                │
│ mysql.pool.acquire_time_ms  │ pool                                      │
│ mysql.circuit_breaker.state │ endpoint                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Structured Log Format

```
Log Format:
┌─────────────────────────────────────────────────────────────────────────┐
│ {                                                                        │
│   "timestamp": "2025-12-13T10:30:00.000Z",                              │
│   "level": "info",                                                       │
│   "message": "Query executed successfully",                              │
│   "module": "mysql.query_service",                                       │
│   "operation": "query",                                                  │
│   "query_hash": "a1b2c3d4",                                              │
│   "execution_time_ms": 45,                                               │
│   "rows_returned": 100,                                                  │
│   "endpoint": "replica-1",                                               │
│   "connection_id": "conn-789",                                           │
│   "trace_id": "abc-123-def",                                             │
│   "span_id": "span-456"                                                  │
│ }                                                                        │
└─────────────────────────────────────────────────────────────────────────┘

Log Levels:
- ERROR: Connection failures, transaction aborts, unrecoverable errors
- WARN: Slow queries, replica lag, deadlock retries, pool pressure
- INFO: Connection lifecycle, transaction boundaries
- DEBUG: Query execution (development only), routing decisions
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-mysql.md | Complete |
| 2. Pseudocode | pseudocode-mysql.md | Complete |
| 3. Architecture | architecture-mysql.md | Complete |
| 4. Refinement | refinement-mysql.md | Complete |
| 5. Completion | completion-mysql.md | Pending |

---

*Phase 4: Refinement - Complete*
