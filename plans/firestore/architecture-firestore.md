# Google Firestore Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/google/firestore`

---

## 1. C4 Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LLM Dev Ops Platform                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   State     │  │   Event     │  │   Config    │  │  Metadata   │    │
│  │  Manager    │  │  Recorder   │  │   Store     │  │   Service   │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │            │
│         └────────────────┴────────┬───────┴────────────────┘            │
│                                   │                                      │
│                          ┌────────▼────────┐                            │
│                          │Firestore Adapter│                            │
│                          │     Module      │                            │
│                          └────────┬────────┘                            │
└───────────────────────────────────┼─────────────────────────────────────┘
                                    │
                                    │ gRPC
                                    │
                           ┌────────▼────────┐
                           │  Google Cloud   │
                           │   Firestore     │
                           │   (Native Mode) │
                           └─────────────────┘
```

---

## 2. C4 Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Firestore Adapter Module                           │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                        Service Layer                             │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │    │
│  │  │ Document │ │Collection│ │  Query   │ │  Batch   │           │    │
│  │  │ Service  │ │ Service  │ │ Service  │ │ Service  │           │    │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘           │    │
│  │       │            │            │            │                   │    │
│  │  ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐                        │    │
│  │  │Transactn │ │ Listener │ │  Field   │                        │    │
│  │  │ Service  │ │ Service  │ │Transform │                        │    │
│  │  └──────────┘ └──────────┘ └──────────┘                        │    │
│  └─────────────────────────────┬───────────────────────────────────┘    │
│                                │                                         │
│  ┌─────────────────────────────▼───────────────────────────────────┐    │
│  │                      Transport Layer                             │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                 │    │
│  │  │   gRPC     │  │  Listener  │  │   Error    │                 │    │
│  │  │  Channel   │  │  Manager   │  │   Mapper   │                 │    │
│  │  └────────────┘  └────────────┘  └────────────┘                 │    │
│  └─────────────────────────────┬───────────────────────────────────┘    │
│                                │                                         │
│  ┌─────────────────────────────▼───────────────────────────────────┐    │
│  │                    Shared Dependencies                           │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │    │
│  │  │ gcp/auth │  │resilience│  │observabil│  │  vector  │        │    │
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
│  │ DocumentService │    │CollectionService│    │  QueryService   │     │
│  │                 │    │                 │    │                 │     │
│  │ - get           │    │ - list_docs     │    │ - execute       │     │
│  │ - create        │    │ - list_colls    │    │ - stream        │     │
│  │ - set           │    │ - add           │    │ - aggregate     │     │
│  │ - update        │    │ - group         │    │ - paginate      │     │
│  │ - delete        │    │                 │    │ - explain       │     │
│  │ - exists        │    │                 │    │                 │     │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘     │
│           │                      │                      │               │
│  ┌────────┴──────────────────────┴──────────────────────┴────────┐     │
│  │                       FirestoreClient                          │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │     │
│  │  │   Config    │  │  Channel    │  │  Listeners  │            │     │
│  │  └─────────────┘  └─────────────┘  └─────────────┘            │     │
│  └────────────────────────────┬──────────────────────────────────┘     │
│                               │                                         │
│  ┌─────────────────┐    ┌─────┴───────────┐    ┌─────────────────┐     │
│  │  BatchService   │    │TransactionService│   │ ListenerService │     │
│  │                 │    │                 │    │                 │     │
│  │ - create_batch  │    │ - run           │    │ - listen_doc    │     │
│  │ - set           │    │ - run_readonly  │    │ - listen_coll   │     │
│  │ - update        │    │ - get_in_tx     │    │ - listen_query  │     │
│  │ - delete        │    │ - set_in_tx     │    │ - unsubscribe   │     │
│  │ - commit        │    │ - delete_in_tx  │    │                 │     │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘     │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    FieldTransformService                         │    │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐       │    │
│  │  │ increment │ │array_union│ │array_rmv  │ │server_ts  │       │    │
│  │  └───────────┘ └───────────┘ └───────────┘ └───────────┘       │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Module Structure

```
integrations/google/firestore/
├── mod.rs                          # Module exports
├── client.rs                       # FirestoreClient implementation
├── config.rs                       # Configuration types
├── error.rs                        # Error types and mapping
│
├── types/
│   ├── mod.rs                      # Type exports
│   ├── document.rs                 # Document, DocumentRef, DocumentSnapshot
│   ├── collection.rs               # CollectionRef, CollectionPath
│   ├── field_value.rs              # FieldValue, FieldTransform
│   ├── query.rs                    # Query, Filter, OrderBy, Cursor
│   ├── aggregation.rs              # Aggregation, AggregationResult
│   ├── batch.rs                    # WriteBatch, Write, Precondition
│   ├── transaction.rs              # Transaction, TransactionOptions
│   └── listener.rs                 # ListenerRegistration, ChangeType
│
├── services/
│   ├── mod.rs                      # Service exports
│   ├── document.rs                 # DocumentService (6 operations)
│   ├── collection.rs               # CollectionService (4 operations)
│   ├── query.rs                    # QueryService (5 operations)
│   ├── batch.rs                    # BatchService (5 operations)
│   ├── transaction.rs              # TransactionService (6 operations)
│   ├── listener.rs                 # ListenerService (4 operations)
│   └── field_transform.rs          # FieldTransformService (5 operations)
│
├── transport/
│   ├── mod.rs                      # Transport exports
│   ├── channel.rs                  # gRPC channel management
│   ├── proto_convert.rs            # Protobuf conversions
│   └── error_mapper.rs             # gRPC to domain error mapping
│
├── query/
│   ├── mod.rs                      # Query exports
│   ├── builder.rs                  # QueryBuilder
│   ├── filter.rs                   # Filter building
│   └── cursor.rs                   # Pagination cursors
│
├── listener/
│   ├── mod.rs                      # Listener exports
│   ├── manager.rs                  # ListenerManager
│   ├── stream.rs                   # Listener stream handling
│   └── reconnect.rs                # Reconnection logic
│
├── simulation/
│   ├── mod.rs                      # Simulation exports
│   ├── mock_client.rs              # MockFirestoreClient
│   ├── mock_store.rs               # In-memory document store
│   ├── mock_query.rs               # Query evaluation
│   ├── recorder.rs                 # Operation recording
│   └── replay.rs                   # Replay engine
│
└── tests/
    ├── unit/
    │   ├── document_test.rs        # Document operation tests
    │   ├── query_test.rs           # Query building tests
    │   ├── transaction_test.rs     # Transaction tests
    │   └── listener_test.rs        # Listener tests
    ├── integration/
    │   ├── crud_test.rs            # CRUD operations
    │   ├── batch_test.rs           # Batch operations
    │   └── realtime_test.rs        # Real-time listener tests
    └── fixtures/
        ├── documents/              # Test documents
        └── recordings/             # Replay recordings
```

---

## 5. Data Flow Architecture

### 5.1 Document Read Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Document Read Flow                                │
│                                                                           │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                 │
│  │ Application │────▶│  Document   │────▶│  Firestore  │                 │
│  │   Request   │     │   Service   │     │   Client    │                 │
│  └─────────────┘     └──────┬──────┘     └──────┬──────┘                 │
│                             │                   │                         │
│                             ▼                   ▼                         │
│                      ┌──────────────┐    ┌──────────────┐                │
│                      │ Build Doc    │    │   Circuit    │                │
│                      │    Path      │    │   Breaker    │                │
│                      └──────────────┘    └──────┬───────┘                │
│                                                 │                         │
│                                          ┌──────▼───────┐                │
│                                          │    Retry     │                │
│                                          │   Handler    │                │
│                                          └──────┬───────┘                │
│                                                 │                         │
│                                          ┌──────▼───────┐                │
│                                          │    gRPC      │                │
│                                          │  GetDocument │                │
│                                          └──────┬───────┘                │
│                                                 │                         │
│                                          ┌──────▼───────┐                │
│                                          │   Parse      │                │
│                                          │  Response    │                │
│                                          └──────┬───────┘                │
│                                                 │                         │
│                                          ┌──────▼───────┐                │
│                                          │  Document    │                │
│                                          │  Snapshot    │                │
│                                          └──────────────┘                │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Transaction Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         Transaction Flow                                  │
│                                                                           │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐ │
│  │   Begin     │────▶│                 Transaction Loop                 │ │
│  │ Transaction │     │                                                  │ │
│  └─────────────┘     │  ┌─────────────┐     ┌─────────────┐            │ │
│                      │  │   gRPC      │────▶│   Execute   │            │ │
│                      │  │   Begin     │     │   User Fn   │            │ │
│                      │  └─────────────┘     └──────┬──────┘            │ │
│                      │                             │                    │ │
│                      │         ┌───────────────────┼───────────────┐   │ │
│                      │         │                   │               │   │ │
│                      │         ▼                   ▼               ▼   │ │
│                      │  ┌─────────────┐     ┌─────────────┐ ┌─────────┐│ │
│                      │  │   Read      │     │   Write     │ │ Commit  ││ │
│                      │  │   Docs      │     │   Buffer    │ │         ││ │
│                      │  └─────────────┘     └─────────────┘ └────┬────┘│ │
│                      │                                           │     │ │
│                      │                                    ┌──────▼────┐│ │
│                      │                                    │  Success  ││ │
│                      │                                    └───────────┘│ │
│                      │                                           │     │ │
│                      │  ┌─────────────────────────────────┐      │     │ │
│                      │  │            On ABORTED            │◀─────┘     │ │
│                      │  │  ┌─────────────┐                │            │ │
│                      │  │  │  Backoff    │──▶ Retry Loop  │            │ │
│                      │  │  └─────────────┘                │            │ │
│                      │  └─────────────────────────────────┘            │ │
│                      └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Real-Time Listener Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Listener Lifecycle                                 │
│                                                                           │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                 │
│  │  Register   │────▶│   Create    │────▶│   Open      │                 │
│  │  Listener   │     │   Target    │     │   Stream    │                 │
│  └─────────────┘     └─────────────┘     └──────┬──────┘                 │
│                                                 │                         │
│                                          ┌──────▼───────┐                │
│                                          │   Receive    │◀───────┐       │
│                                          │    Event     │        │       │
│                                          └──────┬───────┘        │       │
│                                                 │                │       │
│                      ┌──────────────────────────┼────────────────┤       │
│                      │                          │                │       │
│                      ▼                          ▼                ▼       │
│               ┌─────────────┐           ┌─────────────┐  ┌─────────────┐ │
│               │  Document   │           │   Target    │  │   Error     │ │
│               │   Change    │           │   Current   │  │             │ │
│               └──────┬──────┘           └─────────────┘  └──────┬──────┘ │
│                      │                                          │       │
│                      ▼                                          ▼       │
│               ┌─────────────┐                            ┌─────────────┐ │
│               │   Invoke    │                            │  Transient? │ │
│               │  Callback   │                            └──────┬──────┘ │
│               └──────┬──────┘                                   │       │
│                      │                           ┌──────────────┴──────┐│
│                      │                           │ Yes             No  ││
│                      │                           ▼                  ▼  ││
│                      │                    ┌─────────────┐    ┌─────────┐│
│                      │                    │  Reconnect  │    │  Stop   ││
│                      │                    │  w/Backoff  │    │         ││
│                      │                    └──────┬──────┘    └─────────┘│
│                      │                           │                      │
│                      └───────────────────────────┴──────────────────────┘
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Query Architecture

### 6.1 Query Builder Pattern

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          QueryBuilder                                    │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                    Fluent Interface                            │      │
│  │                                                                │      │
│  │  collection("users")                                           │      │
│  │    .where_("status", Equal, "active")                          │      │
│  │    .where_("age", GreaterThan, 18)                             │      │
│  │    .order_by("created_at", Descending)                         │      │
│  │    .limit(10)                                                  │      │
│  │    .start_after([last_doc_values])                             │      │
│  │    .select(["id", "name", "email"])                            │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                               │                                          │
│                               ▼                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                   Structured Query                             │      │
│  │                                                                │      │
│  │  {                                                             │      │
│  │    from: [{ collection_id: "users", all_descendants: false }], │      │
│  │    where: {                                                    │      │
│  │      composite_filter: {                                       │      │
│  │        op: AND,                                                │      │
│  │        filters: [                                              │      │
│  │          { field: "status", op: EQUAL, value: "active" },      │      │
│  │          { field: "age", op: GREATER_THAN, value: 18 }         │      │
│  │        ]                                                       │      │
│  │      }                                                         │      │
│  │    },                                                          │      │
│  │    order_by: [{ field: "created_at", direction: DESCENDING }], │      │
│  │    limit: 10,                                                  │      │
│  │    start_at: { values: [...], before: true }                   │      │
│  │  }                                                             │      │
│  └───────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Composite Filter Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Composite Filter Tree                               │
│                                                                          │
│                           ┌─────────┐                                    │
│                           │   AND   │                                    │
│                           └────┬────┘                                    │
│                    ┌───────────┼───────────┐                            │
│                    │           │           │                            │
│              ┌─────▼────┐ ┌────▼────┐ ┌────▼────┐                       │
│              │ status = │ │   OR    │ │ age >   │                       │
│              │ "active" │ │         │ │   18    │                       │
│              └──────────┘ └────┬────┘ └─────────┘                       │
│                          ┌─────┴─────┐                                  │
│                          │           │                                  │
│                    ┌─────▼────┐ ┌────▼─────┐                           │
│                    │ role =   │ │ role =   │                           │
│                    │ "admin"  │ │ "editor" │                           │
│                    └──────────┘ └──────────┘                           │
│                                                                          │
│  Equivalent: status == "active" AND (role == "admin" OR role == "editor")│
│              AND age > 18                                                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Listener Manager Architecture

### 7.1 Listener Manager

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ListenerManager                                   │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                    Active Listeners                            │      │
│  │                                                                │      │
│  │  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐     │      │
│  │  │ Listener #1    │ │ Listener #2    │ │ Listener #3    │     │      │
│  │  │ ────────────   │ │ ────────────   │ │ ────────────   │     │      │
│  │  │ Target: Doc    │ │ Target: Query  │ │ Target: Coll   │     │      │
│  │  │ State: Active  │ │ State: Reconn  │ │ State: Active  │     │      │
│  │  │ Resume: token1 │ │ Resume: token2 │ │ Resume: token3 │     │      │
│  │  └────────────────┘ └────────────────┘ └────────────────┘     │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                    Stream Management                           │      │
│  │                                                                │      │
│  │  - Single multiplexed gRPC stream                              │      │
│  │  - Target IDs for routing                                      │      │
│  │  - Resume tokens for reconnection                              │      │
│  │  - Automatic reconnection with backoff                         │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                    Limits Enforcement                          │      │
│  │                                                                │      │
│  │  - max_listeners: 100 (configurable)                           │      │
│  │  - Per-target type limits                                      │      │
│  │  - Graceful rejection when limit reached                       │      │
│  └───────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Reconnection Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Reconnection Strategy                                │
│                                                                          │
│  On Disconnect:                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  1. Save resume token from last successful event                 │    │
│  │  2. Classify error (transient vs permanent)                      │    │
│  │  3. If transient: enter reconnection loop                        │    │
│  │  4. If permanent: notify callback, stop listener                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Reconnection Loop:                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Attempt 1: wait 1s                                              │    │
│  │  Attempt 2: wait 2s                                              │    │
│  │  Attempt 3: wait 4s                                              │    │
│  │  Attempt 4: wait 8s                                              │    │
│  │  ...                                                             │    │
│  │  Max wait: 60s                                                   │    │
│  │  Max attempts: unlimited (until unsubscribe)                     │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Resume Token Usage:                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  - Included in Listen request on reconnect                       │    │
│  │  - Server resumes from last acknowledged position                │    │
│  │  - Avoids re-sending already processed changes                   │    │
│  │  - Falls back to full sync if token expired                      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Batch and Transaction Architecture

### 8.1 Batch Write Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Batch Write Pipeline                                │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    WriteBatch Builder                            │    │
│  │                                                                  │    │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐        │    │
│  │  │ Set 1  │ │ Set 2  │ │Update 1│ │Delete 1│ │Trans 1 │        │    │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘        │    │
│  │                                                                  │    │
│  │  Operation count: 5 / 500 max                                    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                               │                                          │
│                               ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Commit Request                                │    │
│  │                                                                  │    │
│  │  database: "projects/X/databases/(default)"                      │    │
│  │  writes: [Write, Write, Write, Write, Write]                     │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                               │                                          │
│                               ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Atomic Commit                                 │    │
│  │                                                                  │    │
│  │  - All or nothing execution                                      │    │
│  │  - Single commit_time for all writes                             │    │
│  │  - WriteResults returned per operation                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Transaction Isolation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Transaction Isolation Model                           │
│                                                                          │
│  Serializable Isolation:                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  - Reads see consistent snapshot at transaction start            │    │
│  │  - Writes are buffered until commit                              │    │
│  │  - Commit validates no conflicting writes occurred               │    │
│  │  - ABORTED on conflict, client must retry                        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Conflict Detection:                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Transaction A                    Transaction B                  │    │
│  │  ────────────                    ────────────                   │    │
│  │  BEGIN                           BEGIN                          │    │
│  │  READ doc/1 (v1)                 READ doc/1 (v1)                │    │
│  │  ...                             WRITE doc/1 (v2)               │    │
│  │  ...                             COMMIT ✓                       │    │
│  │  WRITE doc/1 (v3)                                               │    │
│  │  COMMIT ✗ (ABORTED)                                             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Read-Only Transactions:                                                 │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  - No conflict detection needed                                  │    │
│  │  - Reads from consistent snapshot                                │    │
│  │  - No writes allowed                                             │    │
│  │  - Lower latency than read-write                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Error Handling Architecture

### 9.1 Error Classification

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Error Handler                                    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                      gRPC Error                                  │    │
│  └────────────────────────────┬────────────────────────────────────┘    │
│                               │                                          │
│              ┌────────────────┼────────────────┐                        │
│              ▼                ▼                ▼                        │
│     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│     │  Retryable  │  │  Terminal   │  │   Auth      │                  │
│     │   Errors    │  │   Errors    │  │   Errors    │                  │
│     └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │
│            │                │                │                          │
│            ▼                ▼                ▼                          │
│     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│     │ - ABORTED   │  │ - NOT_FOUND │  │ - UNAUTHENT │                  │
│     │ - UNAVAIL   │  │ - INVALID   │  │ - PERM_DEN  │                  │
│     │ - RESOURCE  │  │ - ALREADY   │  │             │                  │
│     │ - DEADLINE  │  │ - FAILED_   │  │             │                  │
│     │ - INTERNAL  │  │   PRECON    │  │             │                  │
│     └─────────────┘  └─────────────┘  └─────────────┘                  │
│                                                                          │
│  Actions:                                                                │
│  ├── Retryable: Exponential backoff with jitter                         │
│  ├── Terminal: Return error immediately                                  │
│  └── Auth: Refresh token, then retry once                               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Observability Integration

### 10.1 Metrics

```
Metrics Emitted:
├── firestore.reads                  # Counter: document reads
├── firestore.writes                 # Counter: document writes
├── firestore.deletes                # Counter: document deletes
├── firestore.queries                # Counter: query executions
├── firestore.query.documents        # Histogram: docs per query
├── firestore.transactions           # Counter: by status
├── firestore.transaction.duration   # Histogram: tx duration
├── firestore.transaction.retries    # Counter: retry attempts
├── firestore.batch.size             # Histogram: ops per batch
├── firestore.listeners.active       # Gauge: active listeners
├── firestore.listeners.reconnects   # Counter: reconnection events
├── firestore.request.latency_ms     # Histogram: request latency
├── firestore.errors                 # Counter: by error type
└── firestore.circuit_breaker.state  # Gauge: breaker state
```

### 10.2 Tracing

```
Span Hierarchy:
firestore.get_document
├── firestore.build_request
├── firestore.circuit_breaker.check
├── firestore.grpc.call
│   ├── grpc.client.send
│   └── grpc.client.receive
├── firestore.parse_response
└── firestore.metrics.emit

firestore.transaction
├── firestore.grpc.begin_transaction
├── firestore.user_function
│   ├── firestore.get_in_transaction (multiple)
│   └── firestore.set_in_transaction (multiple)
├── firestore.grpc.commit
└── firestore.transaction.retry (on ABORTED)
```

---

## 11. Security Architecture

### 11.1 Credential Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Credential Resolution                               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     AuthConfig                                   │    │
│  └────────────────────────────┬────────────────────────────────────┘    │
│                               │                                          │
│           ┌───────────────────┼───────────────────┐                     │
│           │                   │                   │                     │
│           ▼                   ▼                   ▼                     │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐               │
│  │  Default    │     │  Service    │     │  Emulator   │               │
│  │ Credentials │     │  Account    │     │   (No Auth) │               │
│  └──────┬──────┘     └──────┬──────┘     └─────────────┘               │
│         │                   │                                           │
│         ▼                   ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    gcp/auth Module                               │    │
│  │  - Token caching                                                 │    │
│  │  - Automatic refresh (before expiry)                             │    │
│  │  - Scope validation                                              │    │
│  └────────────────────────────┬────────────────────────────────────┘    │
│                               │                                          │
│                               ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    gRPC Credentials                              │    │
│  │  - Bearer token in metadata                                      │    │
│  │  - TLS for transport security                                    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Interface Contracts

### 12.1 Client Interface

```
trait FirestoreClientTrait:
    // Document operations
    fn get_document(path: DocumentPath) -> Result<DocumentSnapshot>
    fn set_document(path, data, options) -> Result<WriteResult>
    fn update_document(path, updates, precondition) -> Result<WriteResult>
    fn delete_document(path, precondition) -> Result<WriteResult>

    // Collection operations
    fn list_documents(collection, options) -> DocumentIterator
    fn add_document(collection, data) -> Result<DocumentRef>
    fn collection_group(collection_id) -> QueryBuilder

    // Query operations
    fn query(collection) -> QueryBuilder
    fn aggregate(query, aggregations) -> Result<AggregationResult>

    // Batch operations
    fn batch() -> WriteBatch
    fn commit_batch(batch) -> Result<Vec<WriteResult>>

    // Transaction operations
    fn run_transaction<T>(f, options) -> Result<T>

    // Listener operations
    fn listen_document(path, callback) -> ListenerRegistration
    fn listen_query(query, callback) -> ListenerRegistration
```

### 12.2 Shared Module Interfaces

```
gcp/auth:
  fn get_credentials(config: AuthConfig) -> Result<Credentials>
  fn get_access_token() -> Result<AccessToken>
  fn refresh_token() -> Result<AccessToken>

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
| 1. Specification | specification-firestore.md | Complete |
| 2. Pseudocode | pseudocode-firestore.md | Complete |
| 3. Architecture | architecture-firestore.md | Complete |
| 4. Refinement | refinement-firestore.md | Pending |
| 5. Completion | completion-firestore.md | Pending |

---

*Phase 3: Architecture - Complete*
