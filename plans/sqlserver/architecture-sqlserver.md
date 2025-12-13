# SQL Server Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/sqlserver`

---

## 1. Module Structure

### 1.1 Directory Layout

```
integrations/sqlserver/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Public API exports
│   ├── client.rs                 # SqlServerClient
│   ├── config.rs                 # Configuration types
│   ├── connection/
│   │   ├── mod.rs
│   │   ├── pool.rs               # Connection pooling
│   │   ├── health.rs             # Health checker
│   │   └── builder.rs            # Connection builder
│   ├── auth/
│   │   ├── mod.rs
│   │   ├── sql_auth.rs           # SQL authentication
│   │   ├── windows_auth.rs       # Windows/Integrated
│   │   └── azure_ad.rs           # Azure AD methods
│   ├── query/
│   │   ├── mod.rs
│   │   ├── executor.rs           # Query execution
│   │   ├── params.rs             # Parameter binding
│   │   └── results.rs            # Result mapping
│   ├── transaction/
│   │   ├── mod.rs
│   │   ├── transaction.rs        # Transaction impl
│   │   └── builder.rs            # Transaction builder
│   ├── bulk/
│   │   ├── mod.rs
│   │   ├── insert.rs             # Bulk insert
│   │   └── tvp.rs                # Table-valued params
│   ├── procedure/
│   │   ├── mod.rs
│   │   └── executor.rs           # Stored procedures
│   ├── routing/
│   │   ├── mod.rs
│   │   ├── router.rs             # Query router
│   │   └── replica.rs            # Read replica mgmt
│   ├── error.rs                  # Error types
│   └── simulation/
│       ├── mod.rs
│       ├── mock.rs               # Mock database
│       └── recorder.rs           # Record/replay
├── tests/
│   ├── integration/
│   │   ├── connection_test.rs
│   │   ├── query_test.rs
│   │   ├── transaction_test.rs
│   │   └── bulk_test.rs
│   └── unit/
│       ├── pool_test.rs
│       ├── params_test.rs
│       └── error_test.rs
└── typescript/
    ├── package.json
    ├── src/
    │   ├── index.ts
    │   ├── client.ts
    │   ├── pool.ts
    │   ├── transaction.ts
    │   └── types/
    └── tests/
```

### 1.2 Module Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                        sqlserver                             │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Query     │  │ Transaction │  │       Bulk          │  │
│  │  Executor   │  │   Manager   │  │    Operations       │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│                   ┌──────▼──────┐                            │
│                   │   Client    │                            │
│                   └──────┬──────┘                            │
│                          │                                   │
│         ┌────────────────┼────────────────┐                  │
│         │                │                │                  │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌─────▼─────┐            │
│  │    Pool     │  │   Router    │  │ Simulation│            │
│  │   Manager   │  │  (R/W Split)│  │   Layer   │            │
│  └──────┬──────┘  └─────────────┘  └───────────┘            │
│         │                                                    │
│  ┌──────▼──────┐                                            │
│  │    Auth     │                                            │
│  │  Provider   │                                            │
│  └─────────────┘                                            │
├─────────────────────────────────────────────────────────────┤
│                      Shared Modules                          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│  │Credentials │ │ Resilience │ │Observability│              │
│  └────────────┘ └────────────┘ └────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Component Architecture

### 2.1 High-Level Component Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         LLM Dev Ops Platform                          │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         SqlServerClient                               │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                        Query Layer                              │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌────────────────────────┐ │  │
│  │  │    Query     │ │  Transaction │ │    Stored Procedure    │ │  │
│  │  │   Executor   │ │    Manager   │ │       Executor         │ │  │
│  │  └──────────────┘ └──────────────┘ └────────────────────────┘ │  │
│  │  ┌──────────────┐ ┌──────────────┐                            │  │
│  │  │ Bulk Insert  │ │     TVP      │                            │  │
│  │  │   Builder    │ │   Builder    │                            │  │
│  │  └──────────────┘ └──────────────┘                            │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                     Connection Layer                            │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌────────────────────────┐ │  │
│  │  │    Query     │ │   Write      │ │      Read Replica      │ │  │
│  │  │    Router    │ │    Pool      │ │        Pools           │ │  │
│  │  └──────────────┘ └──────────────┘ └────────────────────────┘ │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌────────────────────────┐ │  │
│  │  │   Circuit    │ │    Retry     │ │       Health           │ │  │
│  │  │   Breaker    │ │    Policy    │ │       Checker          │ │  │
│  │  └──────────────┘ └──────────────┘ └────────────────────────┘ │  │
│  └────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬──────────────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   SQL Server    │      │   SQL Server    │      │   SQL Server    │
│    Primary      │      │   Read Replica  │      │   Read Replica  │
│  (Read/Write)   │      │   (Read Only)   │      │   (Read Only)   │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

### 2.2 Connection Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Connection Flow                               │
└─────────────────────────────────────────────────────────────────────┘

Client Request                                        SQL Server
     │                                                     │
     ▼                                                     │
┌─────────────┐                                           │
│ Query Router│                                           │
└──────┬──────┘                                           │
       │                                                   │
       ▼ SELECT intent?                                    │
┌─────────────────────────────────────┐                   │
│         Pool Selection              │                   │
│  ┌─────────────┐  ┌─────────────┐  │                   │
│  │ Write Pool  │  │ Read Pools  │  │                   │
│  │  (Primary)  │  │ (Replicas)  │  │                   │
│  └──────┬──────┘  └──────┬──────┘  │                   │
│         │                │          │                   │
│         └───────┬────────┘          │                   │
└─────────────────┼───────────────────┘                   │
                  │                                        │
                  ▼                                        │
         ┌─────────────┐                                  │
         │  Semaphore  │ (concurrency control)            │
         └──────┬──────┘                                  │
                │                                          │
                ▼                                          │
         ┌─────────────┐                                  │
         │ Get/Create  │                                  │
         │ Connection  │                                  │
         └──────┬──────┘                                  │
                │                                          │
                ▼                                          │
         ┌─────────────┐                                  │
         │  Validate   │──── SELECT 1 ───────────────────►│
         │ Connection  │◄──────────────────────────────── │
         └──────┬──────┘                                  │
                │                                          │
                ▼                                          │
         ┌─────────────┐                                  │
         │   Return    │                                  │
         │PooledConn   │                                  │
         └─────────────┘                                  │
```

---

## 3. Connection Pool Architecture

### 3.1 Pool State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│                    Connection Pool States                        │
└─────────────────────────────────────────────────────────────────┘

                    ┌───────────────┐
                    │  Initializing │
                    └───────┬───────┘
                            │ Create min connections
                            ▼
                    ┌───────────────┐
          ┌────────│     Ready     │────────┐
          │        └───────┬───────┘        │
          │                │                │
     acquire()         health check    pool exhausted
          │                │                │
          ▼                ▼                ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│   In Use      │  │   Checking    │  │   Waiting     │
│  (connection) │  │   (health)    │  │   (queue)     │
└───────┬───────┘  └───────┬───────┘  └───────┬───────┘
        │                  │                  │
   release()          pass/fail          timeout/acquire
        │                  │                  │
        ▼                  ▼                  │
┌───────────────┐  ┌───────────────┐         │
│     Idle      │  │   Remove if   │         │
│  (available)  │  │    failed     │◄────────┘
└───────┬───────┘  └───────────────┘
        │
   idle timeout
        │
        ▼
┌───────────────┐
│    Closed     │
└───────────────┘
```

### 3.2 Pool Configuration

```
┌─────────────────────────────────────────────────────────────────┐
│                    Connection Pool Config                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Size Management                       │    │
│  │                                                          │    │
│  │  pool_min: 1          Minimum connections maintained     │    │
│  │  pool_max: 10         Maximum connections allowed        │    │
│  │                                                          │    │
│  │  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐     │    │
│  │  │ C1  │ C2  │ C3  │ ... │ ... │ ... │ ... │ C10 │     │    │
│  │  │idle │idle │ in  │     │     │     │     │ max │     │    │
│  │  │     │     │ use │     │     │     │     │     │     │    │
│  │  └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘     │    │
│  │    min=1                                      max=10    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Timeouts                              │    │
│  │                                                          │    │
│  │  connect_timeout: 30s     Time to establish connection   │    │
│  │  pool_idle_timeout: 300s  Max idle time before close     │    │
│  │  acquire_timeout: 30s     Max wait for available conn    │    │
│  │  health_check: 30s        Interval between health checks │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Transaction Architecture

### 4.1 Transaction Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                    Transaction Lifecycle                         │
└─────────────────────────────────────────────────────────────────┘

     BEGIN                                              END
       │                                                 │
       ▼                                                 │
┌─────────────┐                                         │
│   Created   │                                         │
└──────┬──────┘                                         │
       │ SET ISOLATION LEVEL                            │
       │ BEGIN TRANSACTION                              │
       ▼                                                │
┌─────────────┐     query/execute                       │
│   Active    │◄─────────────────┐                     │
└──────┬──────┘                  │                     │
       │                         │                     │
       ├─────────────────────────┘                     │
       │                                               │
       │         savepoint()                           │
       │              │                                │
       │              ▼                                │
       │      ┌─────────────┐                         │
       │      │  Savepoint  │                         │
       │      │   Created   │                         │
       │      └──────┬──────┘                         │
       │             │                                │
       │      rollback_to_savepoint()                 │
       │             │                                │
       │             ▼                                │
       │      ┌─────────────┐                         │
       │      │  Partial    │                         │
       │      │  Rollback   │──────┐                  │
       │      └─────────────┘      │                  │
       │                           │                  │
       │◄──────────────────────────┘                  │
       │                                               │
       ├───────────────────┬───────────────────┐      │
       │                   │                   │      │
  commit()           rollback()            drop()     │
       │                   │                   │      │
       ▼                   ▼                   ▼      │
┌─────────────┐    ┌─────────────┐    ┌─────────────┐│
│  Committed  │    │ Rolled Back │    │Auto Rollback││
└─────────────┘    └─────────────┘    └─────────────┘│
       │                   │                   │      │
       └───────────────────┴───────────────────┴──────┘
                           │
                    Connection Released
```

### 4.2 Isolation Level Selection

```
┌─────────────────────────────────────────────────────────────────┐
│                    Isolation Level Decision Tree                 │
└─────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │ Need isolation? │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
           No │                             │ Yes
              ▼                             ▼
    ┌─────────────────┐         ┌─────────────────┐
    │ ReadCommitted   │         │ Dirty reads OK? │
    │    (default)    │         └────────┬────────┘
    └─────────────────┘                  │
                              ┌──────────┴──────────┐
                              │                     │
                           Yes│                     │No
                              ▼                     ▼
                    ┌─────────────────┐   ┌─────────────────┐
                    │ ReadUncommitted │   │ Repeatable read │
                    │   (NOLOCK)      │   │    needed?      │
                    └─────────────────┘   └────────┬────────┘
                                                   │
                                        ┌──────────┴──────────┐
                                        │                     │
                                     Yes│                     │No
                                        ▼                     ▼
                              ┌─────────────────┐   ┌─────────────────┐
                              │ RepeatableRead  │   │ Full isolation? │
                              └─────────────────┘   └────────┬────────┘
                                                             │
                                                  ┌──────────┴──────────┐
                                                  │                     │
                                               Yes│                     │No
                                                  ▼                     ▼
                                        ┌─────────────────┐   ┌─────────────────┐
                                        │  Serializable   │   │    Snapshot     │
                                        │ (lock-based)    │   │  (optimistic)   │
                                        └─────────────────┘   └─────────────────┘
```

---

## 5. Read/Write Separation Architecture

### 5.1 Query Routing Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                    Read/Write Topology                           │
└─────────────────────────────────────────────────────────────────┘

                         ┌─────────────┐
                         │   Client    │
                         └──────┬──────┘
                                │
                                ▼
                         ┌─────────────┐
                         │Query Router │
                         └──────┬──────┘
                                │
              ┌─────────────────┴─────────────────┐
              │                                   │
      INSERT/UPDATE/                          SELECT
      DELETE/EXEC                          (no transaction)
              │                                   │
              ▼                                   ▼
       ┌─────────────┐                    ┌─────────────┐
       │ Write Pool  │                    │ Read Pools  │
       └──────┬──────┘                    └──────┬──────┘
              │                                   │
              │                          Load Balance
              │                    ┌──────────┼──────────┐
              │                    │          │          │
              ▼                    ▼          ▼          ▼
       ┌─────────────┐      ┌──────────┐ ┌──────────┐ ┌──────────┐
       │   Primary   │─────►│ Replica1 │ │ Replica2 │ │ Replica3 │
       │  SQL Server │ sync │ (async)  │ │ (async)  │ │ (async)  │
       └─────────────┘      └──────────┘ └──────────┘ └──────────┘
```

### 5.2 Replica Health Monitoring

```
┌─────────────────────────────────────────────────────────────────┐
│                    Replica Health States                         │
└─────────────────────────────────────────────────────────────────┘

         ┌───────────────┐
         │   Healthy     │◄──────────────────────────┐
         │ (lag < 5s)    │                           │
         └───────┬───────┘                           │
                 │                                    │
            lag > 5s                              lag < 5s
                 │                                    │
                 ▼                                    │
         ┌───────────────┐                           │
         │   Degraded    │───────────────────────────┤
         │ (lag 5s-30s)  │                           │
         └───────┬───────┘                           │
                 │                                    │
            lag > 30s                                │
                 │                                    │
                 ▼                                    │
         ┌───────────────┐                           │
         │   Unhealthy   │───────────────────────────┘
         │ (lag > 30s)   │       recovery
         └───────┬───────┘
                 │
         connection failed
                 │
                 ▼
         ┌───────────────┐
         │    Offline    │
         │ (removed)     │
         └───────────────┘
```

---

## 6. Error Handling Architecture

### 6.1 Error Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                       Error Handling Flow                        │
└─────────────────────────────────────────────────────────────────┘

SQL Server Error                                    Client
      │                                               │
      ▼                                               │
┌─────────────────────────────────────────────────────────────┐
│                    Error Classification                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ TDS Error   │  │ Network     │  │ Authentication      │  │
│  │   Codes     │  │   Errors    │  │    Errors           │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         └────────────────┼────────────────────┘             │
│                          ▼                                   │
│                  SqlServerError                              │
└─────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Retryable  │    │   Fatal     │    │ Transaction │
│  (backoff)  │    │  (fail)     │    │ (rollback)  │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       ▼                  │                  ▼
┌─────────────┐           │          ┌─────────────┐
│   Retry     │           │          │  Rollback   │
│   Loop      │           │          │    Tx       │
└──────┬──────┘           │          └──────┬──────┘
       │                  │                  │
       ├──────success─────┴──────────────────┤
       │                                      │
       ▼                                      ▼
┌─────────────┐                       ┌─────────────┐
│   Result    │                       │    Error    │
│     OK      │                       │  Returned   │
└─────────────┘                       └─────────────┘
```

### 6.2 Retry Decision Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                    Retry Decision Matrix                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Error Code    │ Type                │ Retry │ Backoff          │
│  ─────────────────────────────────────────────────────────────  │
│  1205          │ Deadlock            │  Yes  │ 100ms exp        │
│  1222          │ Lock timeout        │  Yes  │ 200ms exp        │
│  -2            │ Query timeout       │  Yes  │ 1s fixed         │
│  40613         │ Database offline    │  Yes  │ 5s exp           │
│  40197         │ Failover            │  Yes  │ 2s exp           │
│  40501         │ Service busy        │  Yes  │ 5s exp           │
│  10928/10929   │ Resource limit      │  Yes  │ Wait header      │
│  ─────────────────────────────────────────────────────────────  │
│  18456         │ Login failed        │  No   │ -                │
│  2627/2601     │ Unique violation    │  No   │ -                │
│  547           │ FK violation        │  No   │ -                │
│  515           │ NULL violation      │  No   │ -                │
│  207           │ Invalid column      │  No   │ -                │
│  208           │ Invalid object      │  No   │ -                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Bulk Operations Architecture

### 7.1 Bulk Insert Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Bulk Insert Pipeline                          │
└─────────────────────────────────────────────────────────────────┘

Input Data                                          SQL Server
    │                                                    │
    ▼                                                    │
┌─────────────┐                                         │
│   Batch     │                                         │
│  Splitter   │                                         │
└──────┬──────┘                                         │
       │                                                 │
       ▼        batch_size = 1000                       │
┌─────────────────────────────────────────┐            │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐      │            │
│  │ B1  │ │ B2  │ │ B3  │ │ B4  │ ...  │            │
│  │1000 │ │1000 │ │1000 │ │ 500 │      │            │
│  └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘      │            │
└─────┼───────┼───────┼───────┼──────────┘            │
      │       │       │       │                        │
      │       │       │       │    Sequential          │
      │       │       │       │    Processing          │
      ▼       ▼       ▼       ▼                        │
┌─────────────────────────────────────────┐           │
│           TDS Bulk Copy                  │           │
│    ┌────────────────────────────────┐   │           │
│    │  BCP Protocol (streaming)      │───┼──────────►│
│    │  - Column metadata             │   │           │
│    │  - Row data packets            │   │           │
│    │  - Done token                  │   │           │
│    └────────────────────────────────┘   │           │
└─────────────────────────────────────────┘           │
                                                       │
                                          ┌────────────┘
                                          ▼
                                   ┌─────────────┐
                                   │   Target    │
                                   │   Table     │
                                   └─────────────┘
```

### 7.2 TVP Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                  Table-Valued Parameter                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SQL Server Type Definition:                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  CREATE TYPE dbo.OrderItemType AS TABLE (                  │ │
│  │      ProductId INT,                                        │ │
│  │      Quantity INT,                                         │ │
│  │      UnitPrice DECIMAL(10,2)                               │ │
│  │  )                                                         │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Client-side TVP:                                                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  TvpBuilder::new("dbo.OrderItemType")                      │ │
│  │      .add_column("ProductId", SqlType::Int)                │ │
│  │      .add_column("Quantity", SqlType::Int)                 │ │
│  │      .add_column("UnitPrice", SqlType::Decimal)            │ │
│  │      .add_row(vec![101.into(), 5.into(), 29.99.into()])    │ │
│  │      .add_row(vec![102.into(), 3.into(), 49.99.into()])    │ │
│  │      .build()                                              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Stored Procedure Usage:                                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  EXEC dbo.ProcessOrder @OrderId = 1, @Items = @tvp_param   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Observability Architecture

### 8.1 Telemetry Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Observability Pipeline                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐                                                │
│  │   Query     │                                                │
│  │  Execution  │                                                │
│  └──────┬──────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Instrumentation                         │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────────────┐   │    │
│  │  │  Tracing  │  │  Metrics  │  │     Logging       │   │    │
│  │  │  (spans)  │  │ (counters)│  │  (structured)     │   │    │
│  │  └─────┬─────┘  └─────┬─────┘  └─────────┬─────────┘   │    │
│  └────────┼──────────────┼──────────────────┼──────────────┘    │
│           │              │                  │                    │
│           ▼              ▼                  ▼                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐          │
│  │   Jaeger    │  │ Prometheus  │  │      ELK        │          │
│  └─────────────┘  └─────────────┘  └─────────────────┘          │
│                                                                  │
│  Span Attributes:                                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  db.system        = "mssql"                             │    │
│  │  db.name          = "mydb"                              │    │
│  │  db.statement     = "SELECT * FROM users WHERE id=@p0"  │    │
│  │  db.operation     = "SELECT"                            │    │
│  │  db.rows_affected = 1                                   │    │
│  │  db.pool.size     = 5                                   │    │
│  │  db.pool.active   = 2                                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Security Architecture

### 9.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Authentication Methods                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   SQL Authentication                     │    │
│  │  Client ──► Username/Password ──► SQL Server            │    │
│  │              (TDS Login7)                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 Windows Authentication                   │    │
│  │  Client ──► SSPI/Kerberos ──► Domain Controller         │    │
│  │                    │                 │                   │    │
│  │                    └────► SQL Server ◄┘                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Azure AD Authentication                     │    │
│  │                                                          │    │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────────────┐   │    │
│  │  │  Client  │───►│ Azure AD │───►│  Access Token    │   │    │
│  │  └──────────┘    └──────────┘    └────────┬─────────┘   │    │
│  │                                           │              │    │
│  │                                           ▼              │    │
│  │                                    ┌──────────────┐      │    │
│  │                                    │  Azure SQL   │      │    │
│  │                                    └──────────────┘      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. TypeScript Architecture

### 10.1 TypeScript Module Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                TypeScript Implementation                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   SqlServerClient                        │    │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────┐ │    │
│  │  │ query()   │ │execute()  │ │ transaction│ │ bulk()  │ │    │
│  │  └───────────┘ └───────────┘ └───────────┘ └─────────┘ │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Driver: tedious (TDS protocol)                                  │
│  Pool: tarn.js                                                   │
│  Types: Zod schemas for runtime validation                       │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  // Transaction usage                                    │    │
│  │  await client.transaction(async (tx) => {               │    │
│  │    await tx.execute('INSERT ...', [...]);               │    │
│  │    await tx.execute('UPDATE ...', [...]);               │    │
│  │  });                                                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Architecture |

---

**Next Phase:** Refinement - Edge cases, deadlock handling, connection recovery, query optimization hints, and advanced transaction scenarios.
