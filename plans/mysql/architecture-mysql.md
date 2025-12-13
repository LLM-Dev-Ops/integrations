# MySQL Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/database/mysql`

---

## 1. C4 Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LLM Dev Ops Platform                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Workflow   │  │   Data      │  │  Analytics  │  │   Metadata  │    │
│  │ Orchestrator│  │   Sync      │  │   Engine    │  │   Service   │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │            │
│         └────────────────┴────────┬───────┴────────────────┘            │
│                                   │                                      │
│                          ┌────────▼────────┐                            │
│                          │  MySQL Adapter  │                            │
│                          │     Module      │                            │
│                          └────────┬────────┘                            │
└───────────────────────────────────┼─────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
           ┌────────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐
           │    MySQL      │ │   MySQL     │ │   MySQL    │
           │   Primary     │ │  Replica 1  │ │  Replica 2 │
           │   (Write)     │ │   (Read)    │ │   (Read)   │
           └───────────────┘ └─────────────┘ └────────────┘
```

---

## 2. C4 Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MySQL Adapter Module                             │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                        Service Layer                             │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │    │
│  │  │Connection│ │  Query   │ │Transactn │ │ Replica  │           │    │
│  │  │ Service  │ │ Service  │ │ Service  │ │ Service  │           │    │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘           │    │
│  │       │            │            │            │                   │    │
│  │  ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐                        │    │
│  │  │ Metadata │ │  Health  │ │ Prepared │                        │    │
│  │  │ Service  │ │ Service  │ │Stmt Cache│                        │    │
│  │  └──────────┘ └──────────┘ └──────────┘                        │    │
│  └─────────────────────────────┬───────────────────────────────────┘    │
│                                │                                         │
│  ┌─────────────────────────────▼───────────────────────────────────┐    │
│  │                      Connection Layer                            │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                 │    │
│  │  │  Primary   │  │  Replica   │  │   Load     │                 │    │
│  │  │   Pool     │  │   Pools    │  │ Balancer   │                 │    │
│  │  └────────────┘  └────────────┘  └────────────┘                 │    │
│  └─────────────────────────────┬───────────────────────────────────┘    │
│                                │                                         │
│  ┌─────────────────────────────▼───────────────────────────────────┐    │
│  │                    Shared Dependencies                           │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │    │
│  │  │ secrets  │  │resilience│  │observabil│  │  vector  │        │    │
│  │  │          │  │          │  │   ity    │  │  memory  │        │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. C4 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Service Layer                                  │
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │ ConnectionService│    │   QueryService  │    │TransactionService│    │
│  │                 │    │                 │    │                 │     │
│  │ - acquire       │    │ - execute       │    │ - begin         │     │
│  │ - release       │    │ - query         │    │ - commit        │     │
│  │ - pool_status   │    │ - query_one     │    │ - rollback      │     │
│  │ - health_check  │    │ - query_stream  │    │ - savepoint     │     │
│  │ - reconfigure   │    │ - execute_batch │    │ - with_tx       │     │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘     │
│           │                      │                      │               │
│  ┌────────┴──────────────────────┴──────────────────────┴────────┐     │
│  │                         MysqlClient                            │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │     │
│  │  │   Config    │  │ StmtCache   │  │   Router    │            │     │
│  │  └─────────────┘  └─────────────┘  └─────────────┘            │     │
│  └────────────────────────────┬──────────────────────────────────┘     │
│                               │                                         │
│  ┌────────────────────────────┴──────────────────────────────────┐     │
│  │                      ReplicaService                            │     │
│  │                                                                │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │     │
│  │  │get_primary  │  │ get_replica │  │ route_query │            │     │
│  │  └─────────────┘  └─────────────┘  └─────────────┘            │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │ MetadataService │    │  HealthService  │    │  PreparedCache  │     │
│  │                 │    │                 │    │                 │     │
│  │ - list_tables   │    │ - ping          │    │ - get           │     │
│  │ - describe      │    │ - check_repl    │    │ - prepare       │     │
│  │ - list_indexes  │    │ - server_status │    │ - invalidate    │     │
│  │ - explain       │    │ - process_list  │    │ - clear         │     │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Module Structure

```
integrations/database/mysql/
├── mod.rs                      # Module exports
├── client.rs                   # MysqlClient implementation
├── config.rs                   # Configuration types
├── error.rs                    # Error types and mapping
│
├── types/
│   ├── mod.rs                  # Type exports
│   ├── connection.rs           # Connection, ConnectionState
│   ├── query.rs                # Query, Value, ResultSet, Row
│   ├── column.rs               # ColumnMetadata, ColumnType
│   ├── transaction.rs          # Transaction, IsolationLevel
│   ├── replica.rs              # ReplicaConfig, ReplicaStatus
│   └── metadata.rs             # TableInfo, ColumnInfo, IndexInfo
│
├── pool/
│   ├── mod.rs                  # Pool exports
│   ├── connection_pool.rs      # ConnectionPool implementation
│   ├── pool_config.rs          # PoolConfig
│   ├── health_checker.rs       # Background health monitor
│   └── stats.rs                # PoolStats
│
├── services/
│   ├── mod.rs                  # Service exports
│   ├── connection.rs           # ConnectionService
│   ├── query.rs                # QueryService
│   ├── transaction.rs          # TransactionService
│   ├── replica.rs              # ReplicaService
│   ├── metadata.rs             # MetadataService
│   └── health.rs               # HealthService
│
├── routing/
│   ├── mod.rs                  # Routing exports
│   ├── router.rs               # Query router
│   ├── load_balancer.rs        # Load balancing strategies
│   └── statement_parser.rs     # SQL statement type detection
│
├── prepared/
│   ├── mod.rs                  # Prepared statement exports
│   ├── cache.rs                # LRU statement cache
│   └── statement.rs            # PreparedStatement
│
├── simulation/
│   ├── mod.rs                  # Simulation exports
│   ├── mock_client.rs          # MockMysqlClient
│   ├── mock_connection.rs      # Mock connection
│   ├── recorder.rs             # Query recording
│   └── replay.rs               # Query replay
│
└── tests/
    ├── unit/
    │   ├── pool_test.rs        # Pool tests
    │   ├── router_test.rs      # Routing tests
    │   ├── transaction_test.rs # Transaction tests
    │   └── parser_test.rs      # Statement parser tests
    ├── integration/
    │   ├── query_test.rs       # Query execution tests
    │   ├── replica_test.rs     # Replica routing tests
    │   └── metadata_test.rs    # Metadata tests
    └── fixtures/
        ├── schemas/            # Test schemas
        └── recordings/         # Replay recordings
```

---

## 5. Connection Pool Architecture

### 5.1 Pool Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          ConnectionPool                                  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                    Idle Connection Queue                       │      │
│  │  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                          │      │
│  │  │Conn│ │Conn│ │Conn│ │Conn│ │Conn│  (min_connections)       │      │
│  │  │ #1 │ │ #2 │ │ #3 │ │ #4 │ │ #5 │                          │      │
│  │  └────┘ └────┘ └────┘ └────┘ └────┘                          │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                     Active Connections                         │      │
│  │  ┌────┐ ┌────┐ ┌────┐                                         │      │
│  │  │Conn│ │Conn│ │Conn│  (currently in use)                     │      │
│  │  │ #6 │ │ #7 │ │ #8 │                                         │      │
│  │  └────┘ └────┘ └────┘                                         │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                       Waiting Queue                            │      │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                       │      │
│  │  │ Waiter 1 │ │ Waiter 2 │ │ Waiter 3 │  (acquire pending)    │      │
│  │  └──────────┘ └──────────┘ └──────────┘                       │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  Counters:                                                               │
│  ├── total_connections: 8                                                │
│  ├── active_connections: 3                                               │
│  ├── idle_connections: 5                                                 │
│  ├── waiting_requests: 3                                                 │
│  └── max_connections: 20                                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Connection Lifecycle

```
┌─────────┐     acquire      ┌─────────┐     release      ┌─────────┐
│  Idle   │─────────────────▶│  InUse  │─────────────────▶│  Idle   │
└────┬────┘                  └────┬────┘                  └────┬────┘
     │                            │                            │
     │ validation                 │ begin tx                   │ max lifetime
     │ failed                     ▼                            │ exceeded
     │                       ┌─────────┐                       │
     │                       │  InTx   │                       │
     │                       └────┬────┘                       │
     │                            │                            │
     │                            │ commit/rollback            │
     │                            ▼                            │
     │                       ┌─────────┐                       │
     └──────────────────────▶│ Closed  │◀──────────────────────┘
                             └─────────┘
```

### 5.3 Health Checker

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Health Checker Loop                               │
│                                                                          │
│  Every validation_interval_ms:                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  1. Drain idle connections                                       │    │
│  │  2. For each connection:                                         │    │
│  │     ├── Check idle_timeout → close if exceeded (above min)       │    │
│  │     ├── Check max_lifetime → close if exceeded                   │    │
│  │     └── Run validation_query → close if failed                   │    │
│  │  3. Return healthy connections to pool                           │    │
│  │  4. Top up to min_connections if below                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Metrics Emitted:                                                        │
│  ├── mysql.pool.connections.total                                        │
│  ├── mysql.pool.connections.active                                       │
│  ├── mysql.pool.connections.idle                                         │
│  ├── mysql.pool.connections.created                                      │
│  └── mysql.pool.connections.closed                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Read/Write Routing Architecture

### 6.1 Routing Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Query Router                                     │
│                                                                           │
│  ┌─────────────┐                                                          │
│  │ Incoming    │                                                          │
│  │ Query       │                                                          │
│  └──────┬──────┘                                                          │
│         │                                                                 │
│         ▼                                                                 │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐ │
│  │  Statement  │────▶│  Statement Type Detection                        │ │
│  │  Parser     │     │  ├── SELECT → Read                               │ │
│  └─────────────┘     │  ├── INSERT/UPDATE/DELETE → Write                │ │
│                      │  ├── BEGIN/COMMIT/ROLLBACK → Write               │ │
│                      │  ├── SELECT ... FOR UPDATE → Write               │ │
│                      │  └── SHOW/DESCRIBE/EXPLAIN → Read                │ │
│                      └───────────────────────┬─────────────────────────┘ │
│                                              │                            │
│                      ┌───────────────────────┴───────────────────────┐   │
│                      │                                               │   │
│                      ▼                                               ▼   │
│               ┌─────────────┐                                 ┌──────────┐
│               │   Write     │                                 │   Read   │
│               │  Operation  │                                 │ Operation│
│               └──────┬──────┘                                 └────┬─────┘
│                      │                                              │     │
│                      ▼                                              ▼     │
│               ┌─────────────┐                              ┌─────────────┐│
│               │   Primary   │                              │   Replica   ││
│               │    Pool     │                              │   Selector  ││
│               └─────────────┘                              └──────┬──────┘│
│                                                                   │       │
│                                            ┌──────────────────────┴──────┐│
│                                            │                             ││
│                                            ▼                             ▼│
│                                     ┌─────────────┐              ┌────────┐
│                                     │ Lag Check   │──── fail ───▶│Primary │
│                                     │ (threshold) │              │Fallback│
│                                     └──────┬──────┘              └────────┘
│                                            │ pass                         │
│                                            ▼                              │
│                                     ┌─────────────┐                       │
│                                     │   Replica   │                       │
│                                     │    Pool     │                       │
│                                     └─────────────┘                       │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Load Balancer Strategies

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Load Balancer                                    │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │  Strategy: Round Robin                                         │      │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                        │      │
│  │  │Replica 1│─▶│Replica 2│─▶│Replica 3│─▶ (cycle)              │      │
│  │  └─────────┘  └─────────┘  └─────────┘                        │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │  Strategy: Weighted Round Robin                                │      │
│  │  Replica 1 (weight=3): ███                                     │      │
│  │  Replica 2 (weight=2): ██                                      │      │
│  │  Replica 3 (weight=1): █                                       │      │
│  │  Selection: 1,1,1,2,2,3,1,1,1,2,2,3...                        │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │  Strategy: Least Connections                                   │      │
│  │  Replica 1: 5 active connections                               │      │
│  │  Replica 2: 3 active connections  ← Selected                   │      │
│  │  Replica 3: 7 active connections                               │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │  Health Filtering                                              │      │
│  │  - Skip replicas with open circuit breaker                     │      │
│  │  - Skip replicas exceeding lag threshold                       │      │
│  │  - Fall back to primary if no healthy replicas                 │      │
│  └───────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Transaction Architecture

### 7.1 Transaction State Machine

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Transaction States                                  │
│                                                                          │
│                           ┌─────────┐                                    │
│                    ┌──────│  None   │──────┐                            │
│                    │      └────┬────┘      │                            │
│                    │           │ begin()   │                            │
│              error │           ▼           │ error                      │
│                    │      ┌─────────┐      │                            │
│                    │      │ Active  │      │                            │
│                    │      └────┬────┘      │                            │
│                    │           │           │                            │
│           ┌────────┴───┬───────┼───────┬───┴────────┐                   │
│           │            │       │       │            │                   │
│           ▼            ▼       │       ▼            ▼                   │
│     ┌──────────┐ ┌──────────┐  │ ┌──────────┐ ┌──────────┐             │
│     │ Commit   │ │ Rollback │  │ │Savepoint │ │  Error   │             │
│     │ Pending  │ │ Pending  │  │ │ Created  │ │          │             │
│     └────┬─────┘ └────┬─────┘  │ └────┬─────┘ └────┬─────┘             │
│          │            │        │      │            │                    │
│          │            │        │      │ rollback   │                    │
│          ▼            ▼        │      │ to sp      │                    │
│     ┌──────────┐ ┌──────────┐  │      ▼            │                    │
│     │Committed │ │Rolled    │  │ ┌──────────┐      │                    │
│     │          │ │Back      │  │ │  Active  │      │                    │
│     └────┬─────┘ └────┬─────┘  │ └──────────┘      │                    │
│          │            │        │                   │                    │
│          └────────────┴────────┴───────────────────┘                    │
│                               │                                          │
│                               ▼                                          │
│                         ┌──────────┐                                    │
│                         │   Done   │                                    │
│                         │(conn released)│                               │
│                         └──────────┘                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Savepoint Stack

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Savepoint Stack                                  │
│                                                                          │
│  Transaction Start                                                       │
│  ├── depth = 0                                                           │
│  │                                                                       │
│  ├── SAVEPOINT sp1                                                       │
│  │   └── depth = 1, stack = [sp1]                                       │
│  │                                                                       │
│  ├── SAVEPOINT sp2                                                       │
│  │   └── depth = 2, stack = [sp1, sp2]                                  │
│  │                                                                       │
│  ├── SAVEPOINT sp3                                                       │
│  │   └── depth = 3, stack = [sp1, sp2, sp3]                             │
│  │                                                                       │
│  ├── ROLLBACK TO sp2                                                     │
│  │   └── depth = 2, stack = [sp1, sp2]  (sp3 discarded)                 │
│  │                                                                       │
│  └── COMMIT                                                              │
│      └── depth = 0, stack = [], connection released                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Error Handling Architecture

### 8.1 Error Classification

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Error Handler                                    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    MySQL Driver Error                            │    │
│  └────────────────────────────┬────────────────────────────────────┘    │
│                               │                                          │
│              ┌────────────────┼────────────────┐                        │
│              ▼                ▼                ▼                        │
│     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│     │  Retryable  │  │  Terminal   │  │ Connection  │                  │
│     │   Errors    │  │   Errors    │  │   Errors    │                  │
│     └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │
│            │                │                │                          │
│            ▼                ▼                ▼                          │
│     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│     │ - Deadlock  │  │ - Syntax    │  │ - Refused   │                  │
│     │ - LockWait  │  │ - DupKey    │  │ - AuthFail  │                  │
│     │ - TooMany   │  │ - FKViolate │  │ - Lost      │                  │
│     │   Conns     │  │ - DataLong  │  │ - Gone      │                  │
│     └─────────────┘  └─────────────┘  └─────────────┘                  │
│                                                                          │
│  Actions:                                                                │
│  ├── Retryable: Exponential backoff, max 3 attempts                     │
│  ├── Terminal: Return error immediately                                  │
│  └── Connection: Invalidate connection, acquire new, retry once         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Circuit Breaker Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  Circuit Breaker per Endpoint                            │
│                                                                          │
│  Primary Circuit Breaker:                                                │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Threshold: 5 failures / 30 seconds                              │    │
│  │  Open Duration: 60 seconds                                       │    │
│  │  Half-Open: Allow 1 probe                                        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Replica Circuit Breakers (per replica):                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Replica 1: Closed (healthy)                                     │    │
│  │  Replica 2: Open (failing) → skip in load balancer               │    │
│  │  Replica 3: Half-Open (probing)                                  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Failure Events:                                                         │
│  ├── Connection refused                                                  │
│  ├── Connection lost                                                     │
│  ├── Query timeout (configurable)                                        │
│  └── Too many connections                                                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Observability Integration

### 9.1 Metrics

```
Metrics Emitted:
├── mysql.connections.total          # Gauge: total pool connections
├── mysql.connections.active         # Gauge: in-use connections
├── mysql.connections.idle           # Gauge: idle connections
├── mysql.connections.waiting        # Gauge: waiting for connection
├── mysql.connections.created        # Counter: connections created
├── mysql.connections.closed         # Counter: connections closed
├── mysql.connections.acquire_time   # Histogram: acquire latency
├── mysql.queries.count              # Counter by operation type
├── mysql.queries.latency_ms         # Histogram: query latency
├── mysql.queries.errors             # Counter by error type
├── mysql.queries.slow               # Counter: slow queries
├── mysql.transactions.count         # Counter: transactions
├── mysql.transactions.duration_ms   # Histogram: transaction duration
├── mysql.transactions.rollbacks     # Counter: rollbacks
├── mysql.replica.lag_ms             # Gauge per replica
├── mysql.replica.queries            # Counter per replica
└── mysql.circuit_breaker.state      # Gauge: 0=closed, 1=open, 2=half
```

### 9.2 Tracing

```
Span Hierarchy:
mysql.query
├── mysql.router.decide
├── mysql.pool.acquire
│   └── mysql.connection.create (if needed)
├── mysql.connection.execute
│   ├── mysql.statement.prepare (if prepared)
│   └── mysql.protocol.send
├── mysql.result.parse
└── mysql.pool.release

mysql.transaction
├── mysql.pool.acquire
├── mysql.connection.begin
├── mysql.query (multiple)
├── mysql.connection.commit|rollback
└── mysql.pool.release
```

---

## 10. Simulation Architecture

### 10.1 Mock Client

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          MockMysqlClient                                 │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                    Response Registry                           │      │
│  │                                                                │      │
│  │  query_responses: HashMap<QueryPattern, ResultSet>             │      │
│  │  execute_responses: HashMap<QueryPattern, ExecuteResult>       │      │
│  │  error_injections: HashMap<QueryPattern, MysqlError>           │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                    State Simulation                            │      │
│  │                                                                │      │
│  │  transaction_state: Option<MockTransaction>                    │      │
│  │  prepared_statements: HashMap<String, MockPrepared>            │      │
│  │  tables: HashMap<String, MockTable>                            │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                    Operation Log                               │      │
│  │                                                                │      │
│  │  operations: Vec<RecordedOperation>                            │      │
│  │  - timestamp, operation_type, sql, params, result              │      │
│  └───────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Replay Engine

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          ReplayEngine                                    │
│                                                                          │
│  Recording Mode:                                                         │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │  Real MySQL ──▶ Recording Wrapper ──▶ File                    │      │
│  │                        │                                       │      │
│  │                        ▼                                       │      │
│  │              Record: query, params, result, latency            │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  Replay Mode:                                                            │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │  Query ──▶ Match against recordings ──▶ Return recorded result │      │
│  │                        │                                       │      │
│  │                        ├── Exact match: same SQL + params      │      │
│  │                        ├── Pattern match: SQL pattern only     │      │
│  │                        └── Fallback: error if no match         │      │
│  └───────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Security Architecture

### 11.1 Credential Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Credential Resolution                               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     MysqlConfig                                  │    │
│  │                                                                  │    │
│  │  credential_key: "mysql/production/primary"                      │    │
│  └────────────────────────────┬────────────────────────────────────┘    │
│                               │                                          │
│                               ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    shared/secrets                                │    │
│  │                                                                  │    │
│  │  get_credential("mysql/production/primary") -> SecretString     │    │
│  │  - AWS Secrets Manager                                           │    │
│  │  - HashiCorp Vault                                               │    │
│  │  - Environment variables (dev only)                              │    │
│  └────────────────────────────┬────────────────────────────────────┘    │
│                               │                                          │
│                               ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Connection                                    │    │
│  │                                                                  │    │
│  │  - Password stored as SecretString (zeroized on drop)           │    │
│  │  - SSL/TLS encryption enabled                                    │    │
│  │  - No password logging                                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Query Safety

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Query Safety Measures                               │
│                                                                          │
│  1. Parameterized Queries Only                                           │
│     ├── All user input via parameters                                    │
│     ├── No string concatenation                                          │
│     └── Prepared statement validation                                    │
│                                                                          │
│  2. Query Logging (Redacted)                                             │
│     ├── SQL template logged (no param values)                            │
│     ├── Param types logged (not values)                                  │
│     └── Sensitive tables flagged                                         │
│                                                                          │
│  3. Query Size Limits                                                    │
│     ├── max_query_size_bytes enforced                                    │
│     └── Batch size limits                                                │
│                                                                          │
│  4. Statement Type Validation                                            │
│     ├── DDL statements blocked (optional)                                │
│     └── LOAD DATA blocked                                                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Interface Contracts

### 12.1 Client Interface

```
trait MysqlClientTrait:
    // Connection
    fn acquire_connection() -> Result<Connection>
    fn release_connection(conn: Connection)
    fn get_pool_status() -> PoolStats

    // Query
    fn execute(sql, params) -> Result<ExecuteResult>
    fn query(sql, params) -> Result<ResultSet>
    fn query_one(sql, params) -> Result<Option<Row>>
    fn query_stream(sql, params) -> Result<RowStream>
    fn execute_batch(statements) -> Result<Vec<ExecuteResult>>

    // Prepared
    fn prepare(sql) -> Result<PreparedStatement>
    fn execute_prepared(stmt, params) -> Result<ResultSet>

    // Transaction
    fn begin(options) -> Result<Transaction>
    fn with_transaction<T>(options, f: Fn) -> Result<T>

    // Replica
    fn get_primary() -> Result<Connection>
    fn get_replica() -> Result<Connection>

    // Metadata
    fn list_tables(database) -> Result<Vec<TableInfo>>
    fn describe_table(database, table) -> Result<Vec<ColumnInfo>>
    fn explain(sql) -> Result<Vec<ExplainResult>>
```

### 12.2 Shared Module Interfaces

```
shared/secrets:
  fn get_credential(key: String) -> Result<SecretString>
  fn rotate_credential(key: String) -> Result<SecretString>

shared/resilience:
  fn with_retry<T>(policy: RetryPolicy, f: Fn) -> Result<T>
  fn circuit_breaker(name: String) -> CircuitBreaker

shared/observability:
  fn emit_metric(name: String, value: f64, tags: Tags)
  fn start_span(name: String) -> Span
  fn log_structured(level: Level, message: String, fields: Fields)

shared/vector-memory:
  fn store_embedding(key: String, embedding: Vec<f32>, metadata: Map)
  fn search_similar(query: Vec<f32>, limit: usize) -> Vec<Match>
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-mysql.md | Complete |
| 2. Pseudocode | pseudocode-mysql.md | Complete |
| 3. Architecture | architecture-mysql.md | Complete |
| 4. Refinement | refinement-mysql.md | Pending |
| 5. Completion | completion-mysql.md | Pending |

---

*Phase 3: Architecture - Complete*
