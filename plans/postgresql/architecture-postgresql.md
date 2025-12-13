# Architecture: PostgreSQL Integration Module

## SPARC Phase 3: Architecture

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/postgresql`

---

## Table of Contents

1. [System Context](#1-system-context)
2. [Component Architecture](#2-component-architecture)
3. [Data Flow](#3-data-flow)
4. [Module Structure](#4-module-structure)
5. [Concurrency Model](#5-concurrency-model)
6. [Error Handling](#6-error-handling)
7. [Integration Patterns](#7-integration-patterns)

---

## 1. System Context

### 1.1 C4 Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM CONTEXT                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│    ┌──────────────┐         ┌──────────────────────┐                        │
│    │   LLM Dev    │         │   Workflow Engine    │                        │
│    │   Ops Core   │         │                      │                        │
│    └──────┬───────┘         └──────────┬───────────┘                        │
│           │                            │                                     │
│           │  Query/Transaction         │  Data triggers                      │
│           │                            │                                     │
│           ▼                            ▼                                     │
│    ┌─────────────────────────────────────────────────┐                      │
│    │                                                  │                      │
│    │           PostgreSQL Integration Module          │                      │
│    │                                                  │                      │
│    │  ┌─────────┐ ┌─────────┐ ┌─────────┐           │                      │
│    │  │ Queries │ │  Txns   │ │ Streams │           │                      │
│    │  └─────────┘ └─────────┘ └─────────┘           │                      │
│    │                                                  │                      │
│    └──────────────────┬──────────────────────────────┘                      │
│                       │                                                      │
│           ┌───────────┼───────────┐                                         │
│           │           │           │                                          │
│           ▼           ▼           ▼                                          │
│    ┌──────────┐ ┌──────────┐ ┌──────────┐                                   │
│    │ Primary  │ │ Replica  │ │  Shared  │                                   │
│    │   (RW)   │ │   (RO)   │ │   Auth   │                                   │
│    └──────────┘ └──────────┘ └──────────┘                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 External Dependencies

| System | Protocol | Purpose |
|--------|----------|---------|
| PostgreSQL Primary | Wire Protocol v3 | Read/write operations |
| PostgreSQL Replicas | Wire Protocol v3 | Read-only queries |
| Shared Auth | Internal | Credential management |
| Shared Metrics | Internal | Prometheus export |
| Vector Memory | Internal | pgvector integration |

---

## 2. Component Architecture

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        POSTGRESQL INTEGRATION MODULE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         PUBLIC API LAYER                             │    │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐           │    │
│  │  │ QueryOps  │ │ TxnOps    │ │ StreamOps │ │ BulkOps   │           │    │
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          PG CLIENT CORE                              │    │
│  │                                                                      │    │
│  │   ┌─────────────────────────────────────────────────────────────┐   │    │
│  │   │                    Request Pipeline                          │   │    │
│  │   │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │   │    │
│  │   │  │ Intent  │─▶│  Route  │─▶│ Acquire │─▶│ Execute │        │   │    │
│  │   │  │ Detect  │  │         │  │  Conn   │  │         │        │   │    │
│  │   │  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │   │    │
│  │   └─────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│         ┌────────────────────────────┼────────────────────────────┐         │
│         ▼                            ▼                            ▼         │
│  ┌─────────────┐           ┌─────────────────┐           ┌─────────────┐   │
│  │ Connection  │           │    Connection   │           │  Simulation │   │
│  │   Router    │           │      Pools      │           │    Layer    │   │
│  │             │           │                 │           │             │   │
│  │ ┌─────────┐ │           │ ┌─────────────┐ │           │ ┌─────────┐ │   │
│  │ │ Policy  │ │           │ │Primary Pool │ │           │ │Recorder │ │   │
│  │ │ Engine  │ │           │ ├─────────────┤ │           │ │Replayer │ │   │
│  │ ├─────────┤ │           │ │Replica Pools│ │           │ └─────────┘ │   │
│  │ │Lag Track│ │           │ └─────────────┘ │           │             │   │
│  │ └─────────┘ │           │                 │           │             │   │
│  └─────────────┘           └─────────────────┘           └─────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        INFRASTRUCTURE LAYER                          │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐        │    │
│  │  │   Type    │  │  Metrics  │  │  Tracing  │  │ Credential│        │    │
│  │  │  Mapper   │  │ Collector │  │           │  │  Provider │        │    │
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────┘        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| QueryOps | Execute queries, prepared statements |
| TxnOps | Transaction lifecycle, savepoints |
| StreamOps | Cursors, row streaming, LISTEN/NOTIFY |
| BulkOps | COPY protocol, batch operations |
| ConnectionRouter | Read/write routing, load balancing |
| ConnectionPools | Pool management, health checks |
| TypeMapper | Rust ↔ PostgreSQL type conversion |
| SimulationLayer | Record/replay for testing |

---

## 3. Data Flow

### 3.1 Query Execution Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          QUERY EXECUTION FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Client                   PgClient                    PostgreSQL             │
│    │                         │                            │                  │
│    │  query(sql, params)     │                            │                  │
│    │────────────────────────▶│                            │                  │
│    │                         │                            │                  │
│    │                         │  Detect intent (READ)      │                  │
│    │                         │  ┌──────────────────┐      │                  │
│    │                         │  │ Parse SQL for    │      │                  │
│    │                         │  │ SELECT/INSERT... │      │                  │
│    │                         │  └──────────────────┘      │                  │
│    │                         │                            │                  │
│    │                         │  Route to replica          │                  │
│    │                         │  ┌──────────────────┐      │                  │
│    │                         │  │ Check lag, health│      │                  │
│    │                         │  │ Select by policy │      │                  │
│    │                         │  └──────────────────┘      │                  │
│    │                         │                            │                  │
│    │                         │  Acquire connection        │                  │
│    │                         │  ┌──────────────────┐      │                  │
│    │                         │  │ Pool.get()       │      │                  │
│    │                         │  │ with timeout     │      │                  │
│    │                         │  └──────────────────┘      │                  │
│    │                         │                            │                  │
│    │                         │  Execute query             │                  │
│    │                         │─────────────────────────────▶                 │
│    │                         │◀─────────────────────────────                 │
│    │                         │  Result rows               │                  │
│    │                         │                            │                  │
│    │                         │  Convert types             │                  │
│    │                         │  ┌──────────────────┐      │                  │
│    │                         │  │ PG types → Rust  │      │                  │
│    │                         │  └──────────────────┘      │                  │
│    │                         │                            │                  │
│    │  Vec<Row>               │                            │                  │
│    │◀────────────────────────│                            │                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Transaction Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TRANSACTION FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Client                Transaction                   PostgreSQL              │
│    │                       │                            │                    │
│    │  begin()              │                            │                    │
│    │──────────────────────▶│                            │                    │
│    │                       │  Acquire PRIMARY conn      │                    │
│    │                       │  BEGIN ISOLATION LEVEL ... │                    │
│    │                       │───────────────────────────▶│                    │
│    │                       │◀───────────────────────────│                    │
│    │  Transaction          │                            │                    │
│    │◀──────────────────────│                            │                    │
│    │                       │                            │                    │
│    │  execute(...)         │                            │                    │
│    │──────────────────────▶│  SQL statement             │                    │
│    │                       │───────────────────────────▶│                    │
│    │                       │◀───────────────────────────│                    │
│    │  Result               │                            │                    │
│    │◀──────────────────────│                            │                    │
│    │                       │                            │                    │
│    │  savepoint("sp1")     │                            │                    │
│    │──────────────────────▶│  SAVEPOINT sp1             │                    │
│    │                       │───────────────────────────▶│                    │
│    │                       │◀───────────────────────────│                    │
│    │  Savepoint            │                            │                    │
│    │◀──────────────────────│                            │                    │
│    │                       │                            │                    │
│    │  commit()             │                            │                    │
│    │──────────────────────▶│  COMMIT                    │                    │
│    │                       │───────────────────────────▶│                    │
│    │                       │◀───────────────────────────│                    │
│    │  Ok(())               │  Release connection        │                    │
│    │◀──────────────────────│                            │                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Connection Pool Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CONNECTION POOL MANAGEMENT                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                        ┌───────────────────────┐                             │
│                        │    Connection Pool    │                             │
│                        │                       │                             │
│                        │  ┌─────┬─────┬─────┐ │                             │
│                        │  │Conn1│Conn2│Conn3│ │  ← Idle connections         │
│                        │  └─────┴─────┴─────┘ │                             │
│                        │  ┌─────┬─────┐       │                             │
│                        │  │Conn4│Conn5│       │  ← In-use connections       │
│                        │  └─────┴─────┘       │                             │
│                        └───────────┬───────────┘                             │
│                                    │                                         │
│    ┌───────────────────────────────┼───────────────────────────────┐        │
│    │                               │                               │        │
│    ▼                               ▼                               ▼        │
│ ┌──────────┐                ┌──────────────┐               ┌──────────┐     │
│ │ Acquire  │                │ Health Check │               │ Cleanup  │     │
│ │          │                │              │               │          │     │
│ │ 1. Check │                │ 1. Periodic  │               │ 1. Idle  │     │
│ │    idle  │                │    SELECT 1  │               │  timeout │     │
│ │ 2. Create│                │ 2. Mark bad  │               │ 2. Max   │     │
│ │    new   │                │ 3. Remove    │               │  lifetime│     │
│ │ 3. Wait  │                │    dead      │               │ 3. Close │     │
│ └──────────┘                └──────────────┘               └──────────┘     │
│                                                                              │
│  Pool States:                                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ min_size=5  max_size=20  current=12  idle=7  in_use=5  waiting=0    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Read/Write Routing Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         READ/WRITE ROUTING                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                        ┌─────────────────┐                                   │
│                        │ Incoming Query  │                                   │
│                        └────────┬────────┘                                   │
│                                 │                                            │
│                                 ▼                                            │
│                        ┌─────────────────┐                                   │
│                        │ Intent Detection│                                   │
│                        │ SELECT → READ   │                                   │
│                        │ INSERT → WRITE  │                                   │
│                        │ UPDATE → WRITE  │                                   │
│                        │ DELETE → WRITE  │                                   │
│                        └────────┬────────┘                                   │
│                                 │                                            │
│              ┌──────────────────┴──────────────────┐                        │
│              │                                     │                         │
│              ▼                                     ▼                         │
│     ┌─────────────────┐                   ┌─────────────────┐               │
│     │   READ Intent   │                   │  WRITE Intent   │               │
│     └────────┬────────┘                   └────────┬────────┘               │
│              │                                     │                         │
│              ▼                                     │                         │
│     ┌─────────────────┐                           │                         │
│     │ Replica Router  │                           │                         │
│     │                 │                           │                         │
│     │ ┌─────────────┐ │                           │                         │
│     │ │Check health │ │                           │                         │
│     │ │Check lag    │ │                           │                         │
│     │ │Apply policy │ │                           │                         │
│     │ └─────────────┘ │                           │                         │
│     └────────┬────────┘                           │                         │
│              │                                     │                         │
│    ┌─────────┴─────────┐                          │                         │
│    │                   │                          │                         │
│    ▼                   ▼                          ▼                         │
│ ┌───────┐  ┌───────┐  ┌───────┐           ┌───────────┐                    │
│ │Replica│  │Replica│  │Primary│           │  Primary  │                    │
│ │   1   │  │   2   │  │(fallbk)           │           │                    │
│ └───────┘  └───────┘  └───────┘           └───────────┘                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Module Structure

### 4.1 Directory Layout

```
integrations/postgresql/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Public exports, prelude
│   ├── client.rs                 # PgClient implementation
│   ├── config.rs                 # PgConfig, PoolConfig, builders
│   ├── error.rs                  # PgError enum
│   │
│   ├── types/
│   │   ├── mod.rs                # Type exports
│   │   ├── value.rs              # Value enum
│   │   ├── row.rs                # Row, Column types
│   │   ├── convert.rs            # Type conversion traits
│   │   └── json.rs               # JSON/JSONB handling
│   │
│   ├── pool/
│   │   ├── mod.rs                # Pool exports
│   │   ├── manager.rs            # Connection manager
│   │   ├── health.rs             # Health check logic
│   │   └── stats.rs              # Pool statistics
│   │
│   ├── router/
│   │   ├── mod.rs                # Router exports
│   │   ├── policy.rs             # Routing policies
│   │   ├── intent.rs             # Query intent detection
│   │   └── lag.rs                # Replica lag tracking
│   │
│   ├── operations/
│   │   ├── mod.rs                # Operation traits
│   │   ├── query.rs              # Query execution
│   │   ├── transaction.rs        # Transaction management
│   │   ├── stream.rs             # Row streaming, cursors
│   │   ├── bulk.rs               # COPY, batch ops
│   │   └── notify.rs             # LISTEN/NOTIFY
│   │
│   ├── simulation/
│   │   ├── mod.rs                # Simulation exports
│   │   ├── recorder.rs           # Request recording
│   │   └── replayer.rs           # Request replay
│   │
│   └── metrics.rs                # Prometheus metrics
│
├── tests/
│   ├── integration/
│   │   ├── query_tests.rs
│   │   ├── transaction_tests.rs
│   │   ├── routing_tests.rs
│   │   ├── stream_tests.rs
│   │   └── bulk_tests.rs
│   └── fixtures/
│       └── *.json
│
└── examples/
    ├── basic_query.rs
    ├── transactions.rs
    ├── read_replica.rs
    └── bulk_import.rs
```

### 4.2 Module Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MODULE DEPENDENCIES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  lib.rs                                                                      │
│    │                                                                         │
│    ├── client.rs                                                             │
│    │     ├── config.rs                                                       │
│    │     ├── pool/mod.rs ────────────▶ pool/manager.rs                      │
│    │     │                            pool/health.rs                         │
│    │     │                            pool/stats.rs                          │
│    │     │                                                                   │
│    │     ├── router/mod.rs ──────────▶ router/policy.rs                     │
│    │     │                            router/intent.rs                       │
│    │     │                            router/lag.rs                          │
│    │     │                                                                   │
│    │     ├── simulation/mod.rs                                               │
│    │     └── metrics.rs                                                      │
│    │                                                                         │
│    ├── operations/mod.rs                                                     │
│    │     ├── query.rs ───────────────▶ types/convert.rs                     │
│    │     ├── transaction.rs                                                  │
│    │     ├── stream.rs                                                       │
│    │     ├── bulk.rs                                                         │
│    │     └── notify.rs                                                       │
│    │                                                                         │
│    ├── types/mod.rs                                                          │
│    │     ├── value.rs                                                        │
│    │     ├── row.rs                                                          │
│    │     ├── convert.rs                                                      │
│    │     └── json.rs                                                         │
│    │                                                                         │
│    └── error.rs ◀──────────────────── (all modules)                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Concurrency Model

### 5.1 Shared State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONCURRENCY MODEL                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PgClient (Arc)                                                              │
│  ├── config: Arc<PgConfig>                    [Immutable - no sync]         │
│  ├── primary_pool: Arc<Pool>                  [Internally synchronized]     │
│  ├── replica_pools: Arc<Vec<Pool>>            [Internally synchronized]     │
│  ├── router: Arc<ConnectionRouter>            [RwLock for state]            │
│  ├── credentials: Arc<dyn CredentialProvider> [Internally synchronized]     │
│  ├── simulation: Arc<SimulationLayer>         [RwLock for recordings]       │
│  └── metrics: Arc<MetricsCollector>           [Atomic counters]             │
│                                                                              │
│  ConnectionRouter                                                            │
│  ├── replica_states: RwLock<Vec<ReplicaState>>  [Updated by health check]  │
│  └── next_replica: AtomicUsize                   [Round-robin counter]      │
│                                                                              │
│  Synchronization Strategy:                                                   │
│  ┌──────────────────┬───────────────────┬──────────────────────────────┐    │
│  │ Component        │ Sync Mechanism    │ Rationale                    │    │
│  ├──────────────────┼───────────────────┼──────────────────────────────┤    │
│  │ Connection Pool  │ Internal (deadpool)│ High-perf pool management   │    │
│  │ Router State     │ RwLock            │ Frequent reads, rare writes  │    │
│  │ Round-robin idx  │ AtomicUsize       │ Lock-free increment          │    │
│  │ Metrics          │ Atomics           │ Counter increments           │    │
│  │ Simulation       │ RwLock            │ Recording during tests       │    │
│  └──────────────────┴───────────────────┴──────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Connection Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CONNECTION LIFECYCLE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Connection States                             │    │
│  │                                                                      │    │
│  │    ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐  │    │
│  │    │  Idle    │────▶│ Acquired │────▶│  In Use  │────▶│ Released │  │    │
│  │    └──────────┘     └──────────┘     └──────────┘     └──────────┘  │    │
│  │         ▲                                                   │        │    │
│  │         └───────────────────────────────────────────────────┘        │    │
│  │                                                                      │    │
│  │    Transitions:                                                      │    │
│  │    • Idle → Acquired: pool.get() succeeds                           │    │
│  │    • Acquired → In Use: query/transaction started                   │    │
│  │    • In Use → Released: operation complete, returned to pool        │    │
│  │    • Released → Idle: connection validated, ready for reuse         │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Connection Recycling:                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │    ┌──────────┐     ┌──────────┐     ┌──────────┐                   │    │
│  │    │ Created  │────▶│  Active  │────▶│ Recycled │                   │    │
│  │    └──────────┘     └──────────┘     └──────────┘                   │    │
│  │                           │                                          │    │
│  │                           ▼                                          │    │
│  │                     ┌──────────┐                                     │    │
│  │                     │ Disposed │  (max_lifetime, error, idle_timeout)│    │
│  │                     └──────────┘                                     │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Error Handling

### 6.1 Error Taxonomy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ERROR TAXONOMY                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PgError                                                                     │
│  │                                                                           │
│  ├── Connection                                                              │
│  │   ├── ConnectionFailed { host, port, source }                            │
│  │   ├── AcquireTimeout { waited: Duration }                                │
│  │   ├── PoolExhausted { max_size: u32 }                                    │
│  │   ├── TlsError { message }                                               │
│  │   └── AuthenticationFailed { username }                                  │
│  │                                                                           │
│  ├── Query                                                                   │
│  │   ├── ExecutionError { sql_state, message }                              │
│  │   ├── NoRows                                                             │
│  │   ├── TooManyRows { count }                                              │
│  │   ├── QueryTimeout { timeout: Duration }                                 │
│  │   └── ParamCountMismatch { expected, got }                               │
│  │                                                                           │
│  ├── Transaction                                                             │
│  │   ├── SerializationFailure                                               │
│  │   ├── DeadlockDetected                                                   │
│  │   ├── TransactionAborted                                                 │
│  │   └── InvalidSavepoint { name }                                          │
│  │                                                                           │
│  ├── Type                                                                    │
│  │   ├── UnsupportedType { oid }                                            │
│  │   ├── ConversionError { from, to }                                       │
│  │   ├── NullValue { column }                                               │
│  │   └── InvalidJson { source }                                             │
│  │                                                                           │
│  ├── Protocol                                                                │
│  │   ├── UnexpectedMessage                                                  │
│  │   ├── InvalidResponse                                                    │
│  │   └── ProtocolVersionMismatch                                            │
│  │                                                                           │
│  └── Simulation                                                              │
│      ├── SimulationMismatch { sql }                                         │
│      ├── SimulatedError { message }                                         │
│      └── RecordingNotFound { path }                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Recovery Strategies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RECOVERY STRATEGIES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┬────────────┬─────────────┬────────────────────────┐    │
│  │ Error Type      │ Retryable  │ Max Retries │ Strategy               │    │
│  ├─────────────────┼────────────┼─────────────┼────────────────────────┤    │
│  │ Connection fail │ Yes        │ 3           │ Exponential backoff    │    │
│  │ Acquire timeout │ Yes        │ 2           │ Immediate retry        │    │
│  │ Pool exhausted  │ Yes        │ 3           │ Backoff + wait         │    │
│  │ Serialization   │ Yes        │ 5           │ Immediate retry (txn)  │    │
│  │ Deadlock        │ Yes        │ 3           │ Backoff + retry        │    │
│  │ Query timeout   │ Configurable│ 1          │ Cancel + retry         │    │
│  │ Replica lag     │ Yes        │ 1           │ Fallback to primary    │    │
│  │ Auth failed     │ No         │ 0           │ Fail immediately       │    │
│  │ Invalid SQL     │ No         │ 0           │ Fail immediately       │    │
│  └─────────────────┴────────────┴─────────────┴────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Integration Patterns

### 7.1 Repository Pattern

```rust
// Domain repository backed by PostgreSQL
#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn find_by_id(&self, id: Uuid) -> Result<Option<User>>;
    async fn create(&self, user: &User) -> Result<()>;
    async fn update(&self, user: &User) -> Result<()>;
}

pub struct PgUserRepository {
    client: Arc<PgClient>,
}

#[async_trait]
impl UserRepository for PgUserRepository {
    async fn find_by_id(&self, id: Uuid) -> Result<Option<User>> {
        self.client.query_opt(
            "SELECT id, name, email FROM users WHERE id = $1",
            &[Value::Uuid(id)],
        ).await?.map(User::from_row).transpose()
    }

    async fn create(&self, user: &User) -> Result<()> {
        self.client.execute(
            "INSERT INTO users (id, name, email) VALUES ($1, $2, $3)",
            &user.to_values(),
        ).await?;
        Ok(())
    }
}
```

### 7.2 Unit of Work Pattern

```rust
// Transaction-scoped unit of work
pub struct UnitOfWork<'a> {
    txn: Transaction<'a>,
}

impl<'a> UnitOfWork<'a> {
    pub async fn begin(client: &'a PgClient) -> Result<Self> {
        Ok(Self { txn: client.begin().await? })
    }

    pub async fn users(&mut self) -> TxnUserRepo<'_> {
        TxnUserRepo { txn: &mut self.txn }
    }

    pub async fn commit(self) -> Result<()> {
        self.txn.commit().await
    }
}

// Usage
async fn transfer_credits(client: &PgClient, from: Uuid, to: Uuid, amt: i64) -> Result<()> {
    let mut uow = UnitOfWork::begin(client).await?;

    uow.users().debit(from, amt).await?;
    uow.users().credit(to, amt).await?;

    uow.commit().await
}
```

### 7.3 Event Sourcing Pattern

```rust
// NOTIFY-based event publishing
pub struct PgEventPublisher {
    client: Arc<PgClient>,
    channel: String,
}

impl PgEventPublisher {
    pub async fn publish<E: Serialize>(&self, event: &E) -> Result<()> {
        let payload = serde_json::to_string(event)?;
        self.client.notify(&self.channel, &payload).await
    }
}

// LISTEN-based event subscription
pub struct PgEventSubscriber {
    stream: NotificationStream,
}

impl PgEventSubscriber {
    pub fn events<E: DeserializeOwned>(&mut self) -> impl Stream<Item = Result<E>> + '_ {
        self.stream.stream().map(|n| {
            serde_json::from_str(&n?.payload).map_err(Into::into)
        })
    }
}
```

### 7.4 Read Model Pattern

```rust
// Replica-optimized read model
pub struct ReadModelService {
    client: Arc<PgClient>,
    max_lag: Duration,
}

impl ReadModelService {
    pub async fn get_dashboard(&self, user_id: Uuid) -> Result<Dashboard> {
        // Uses replica with lag tolerance
        let stats = self.client.query_with_max_lag(
            "SELECT * FROM user_stats WHERE user_id = $1",
            &[Value::Uuid(user_id)],
            self.max_lag,
        ).await?;

        let recent = self.client.query_with_max_lag(
            "SELECT * FROM user_activity WHERE user_id = $1 LIMIT 10",
            &[Value::Uuid(user_id)],
            self.max_lag,
        ).await?;

        Ok(Dashboard::from_rows(stats, recent))
    }
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-PG-ARCH-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Architecture Document**

*Proceed to Refinement phase upon approval.*
