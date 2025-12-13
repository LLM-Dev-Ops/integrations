# Architecture: Google Cloud Pub/Sub Integration Module

## SPARC Phase 3: Architecture

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/google-cloud-pubsub`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Design Principles](#2-design-principles)
3. [C4 Model Diagrams](#3-c4-model-diagrams)
4. [Module Structure](#4-module-structure)
5. [Component Design](#5-component-design)
6. [Data Flow](#6-data-flow)
7. [Concurrency Model](#7-concurrency-model)
8. [Deployment Considerations](#8-deployment-considerations)

---

## 1. Architecture Overview

### 1.1 System Context

The Google Cloud Pub/Sub integration provides a thin adapter layer connecting the LLM Dev Ops platform to GCP's managed messaging service for enterprise-scale event-driven workflows.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Application Layer                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Event Proc  │  │  Workflow   │  │   Background Jobs       │ │
│  │  Services   │  │  Engines    │  │                         │ │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘ │
└─────────┼────────────────┼──────────────────────┼───────────────┘
          │                │                      │
          └────────────────┼──────────────────────┘
                           │
          ┌────────────────▼────────────────┐
          │      Pub/Sub Integration        │
          │  ┌──────────────────────────┐  │
          │  │      PubSubClient        │  │
          │  │  ┌─────────┐ ┌────────┐  │  │
          │  │  │Publisher│ │Subscrib│  │  │
          │  │  └─────────┘ └────────┘  │  │
          │  └──────────────────────────┘  │
          │         │                      │
          │  ┌──────▼──────────────────┐  │
          │  │   Simulation Layer      │  │
          │  └─────────────────────────┘  │
          │         │                      │
          │  ┌──────▼──────────────────┐  │
          │  │   Shared Primitives     │  │
          │  │  auth│logging│metrics   │  │
          │  └─────────────────────────┘  │
          └────────────────┬───────────────┘
                           │ gRPC/TLS
          ┌────────────────▼────────────────┐
          │      Google Cloud Pub/Sub       │
          │  ┌──────────────────────────┐  │
          │  │Topics│Subscriptions│DLQs │  │
          │  └──────────────────────────┘  │
          └─────────────────────────────────┘
```

### 1.2 Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Pattern | Thin Adapter | No infrastructure management |
| Transport | gRPC | Native Pub/Sub protocol |
| Streaming | Bidirectional gRPC | Streaming pull efficiency |
| Batching | Client-side | Throughput optimization |
| Auth | ADC/Service Account | GCP standard |
| Testing | Simulation layer | CI/CD without GCP |

### 1.3 Performance Targets

| Metric | Target | Design Impact |
|--------|--------|---------------|
| Publish latency | < 50ms p99 | Batching, connection reuse |
| Throughput | > 10,000 msg/sec | Parallel publishing, batching |
| Streaming pull | Millions/sec | Flow control, backpressure |
| Memory | Bounded | Flow control limits |

---

## 2. Design Principles

### 2.1 Thin Adapter Principles

```
┌─────────────────────────────────────────────────────────────┐
│                 THIN ADAPTER BOUNDARIES                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  IN SCOPE (This Module):                                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  • Message publishing (single, batch, ordered)         │ │
│  │  • Message subscribing (pull, streaming pull)          │ │
│  │  • Message acknowledgment (ack, nack, deadline)        │ │
│  │  • Seek operations (timestamp, snapshot)               │ │
│  │  • Client-side batching and flow control               │ │
│  │  • Simulation/replay for testing                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  OUT OF SCOPE (Infrastructure/Admin):                       │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  ✗ Topic creation/deletion                             │ │
│  │  ✗ Subscription creation/deletion                      │ │
│  │  ✗ IAM policy management                               │ │
│  │  ✗ Schema registry management                          │ │
│  │  ✗ Push endpoint configuration                         │ │
│  │  ✗ Dead letter policy configuration                    │ │
│  │  ✗ Retention policy management                         │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 SOLID Principles

```
┌─────────────────────────────────────────────────────────────┐
│                  RESPONSIBILITY MAPPING                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  PubSubClient      → Client lifecycle, service access        │
│  PubSubPublisher   → Publishing operations only              │
│  PubSubSubscriber  → Subscription operations only            │
│  MessageBatcher    → Batch accumulation only                 │
│  StreamingPull     → Streaming subscription only             │
│  SimulationLayer   → Record/replay only                      │
│  CredentialsLoader → Authentication only                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Hexagonal Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    HEXAGONAL ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                          ┌─────────────┐                            │
│    ┌─────────────────────│   DOMAIN    │─────────────────────┐      │
│    │                     │    CORE     │                     │      │
│    │  ┌──────────────────┴─────────────┴──────────────────┐  │      │
│    │  │                                                   │  │      │
│    │  │  ┌─────────────┐  ┌─────────────┐               │  │      │
│    │  │  │  Publisher  │  │  Subscriber │               │  │      │
│    │  │  │   Service   │  │   Service   │               │  │      │
│    │  │  └─────────────┘  └─────────────┘               │  │      │
│    │  │                                                   │  │      │
│    │  │  ┌─────────────────────────────────────────────┐ │  │      │
│    │  │  │           Business Logic                     │ │  │      │
│    │  │  │  • Message validation                       │ │  │      │
│    │  │  │  • Batching logic                          │ │  │      │
│    │  │  │  • Flow control                            │ │  │      │
│    │  │  │  • Error mapping                           │ │  │      │
│    │  │  └─────────────────────────────────────────────┘ │  │      │
│    │  │                                                   │  │      │
│    │  └───────────────────────────────────────────────────┘  │      │
│    │                          │                              │      │
│    │         ┌────────────────┼────────────────┐             │      │
│    │         │                │                │             │      │
│    │         ▼                ▼                ▼             │      │
│    │  ┌──────────┐     ┌──────────┐     ┌──────────┐        │      │
│    │  │   PORT   │     │   PORT   │     │   PORT   │        │      │
│    │  │  gRPC    │     │Simulation│     │   Auth   │        │      │
│    │  └────┬─────┘     └────┬─────┘     └────┬─────┘        │      │
│    │       │                │                │               │      │
│    └───────┼────────────────┼────────────────┼───────────────┘      │
│            │                │                │                       │
│            ▼                ▼                ▼                       │
│     ┌──────────┐     ┌──────────┐     ┌──────────────┐              │
│     │ ADAPTER  │     │ ADAPTER  │     │   ADAPTER    │              │
│     │ Pub/Sub  │     │ Record/  │     │  ADC/SA Key  │              │
│     │  gRPC    │     │ Replay   │     │              │              │
│     └────┬─────┘     └──────────┘     └──────────────┘              │
│          │                                                           │
│          ▼                                                           │
│   ┌────────────┐                                                    │
│   │ Cloud      │                                                    │
│   │ Pub/Sub    │                                                    │
│   └────────────┘                                                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. C4 Model Diagrams

### 3.1 Level 1: System Context

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SYSTEM CONTEXT DIAGRAM                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                        ┌───────────────┐                            │
│                        │   Developer   │                            │
│                        │    [Person]   │                            │
│                        └───────┬───────┘                            │
│                                │ Uses                               │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │               LLM Dev Ops Platform                           │   │
│  │              [Software System]                               │   │
│  │                                                              │   │
│  │   Event-driven workflows with Pub/Sub messaging             │   │
│  └─────────────────────────────┬───────────────────────────────┘   │
│                                │ Uses                               │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │            Pub/Sub Integration Module                        │   │
│  │              [Software System]                               │   │
│  │                                                              │   │
│  │   Thin adapter for Google Cloud Pub/Sub                     │   │
│  └─────────────────────────────┬───────────────────────────────┘   │
│                                │ gRPC                               │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │             Google Cloud Pub/Sub                             │   │
│  │            [External System]                                 │   │
│  │                                                              │   │
│  │   Managed messaging service with global scale               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Level 2: Container Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                       CONTAINER DIAGRAM                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                Pub/Sub Integration Module                    │   │
│  │                                                              │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │                   Rust Crate                         │    │   │
│  │  │                  [Container]                         │    │   │
│  │  │                                                      │    │   │
│  │  │  Primary implementation                              │    │   │
│  │  │  gRPC client: tonic + google-cloud-pubsub           │    │   │
│  │  │  Async runtime: tokio                                │    │   │
│  │  │                                                      │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  │                                                              │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │                TypeScript Package                    │    │   │
│  │  │                  [Container]                         │    │   │
│  │  │                                                      │    │   │
│  │  │  TypeScript implementation                           │    │   │
│  │  │  gRPC client: @google-cloud/pubsub                  │    │   │
│  │  │                                                      │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  │                                                              │   │
│  │                          │                                   │   │
│  │                   Uses   │                                   │   │
│  │                          ▼                                   │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │                Shared Primitives                     │    │   │
│  │  │                  [Container]                         │    │   │
│  │  │                                                      │    │   │
│  │  │  auth, logging, tracing, metrics, errors, config    │    │   │
│  │  │                                                      │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  │                                                              │   │
│  └──────────────────────────────┬──────────────────────────────┘   │
│                                 │ gRPC/TLS                          │
│                                 ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  Google Cloud Pub/Sub                        │   │
│  │                  [External Service]                          │   │
│  │                                                              │   │
│  │  Endpoints: pubsub.googleapis.com:443                       │   │
│  │  Protocol: gRPC with TLS                                    │   │
│  │  Auth: OAuth2 / Service Account                             │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 Level 3: Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                      COMPONENT DIAGRAM                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                        Rust Crate                              │  │
│  │                                                                │  │
│  │   ┌─────────────────────────────────────────────────────────┐ │  │
│  │   │                    PUBLIC API                            │ │  │
│  │   │  ┌───────────────┐  ┌──────────────────────────────┐    │ │  │
│  │   │  │ PubSubClient  │  │   PubSubClientBuilder        │    │ │  │
│  │   │  └───────┬───────┘  └──────────────────────────────┘    │ │  │
│  │   └──────────┼──────────────────────────────────────────────┘ │  │
│  │              │ owns                                            │  │
│  │              ▼                                                 │  │
│  │   ┌─────────────────────────────────────────────────────────┐ │  │
│  │   │                     SERVICES                             │ │  │
│  │   │  ┌────────────────┐  ┌────────────────┐                 │ │  │
│  │   │  │ PubSubPublisher│  │PubSubSubscriber│                 │ │  │
│  │   │  │  [Component]   │  │  [Component]   │                 │ │  │
│  │   │  └───────┬────────┘  └───────┬────────┘                 │ │  │
│  │   └──────────┼───────────────────┼──────────────────────────┘ │  │
│  │              │                   │                             │  │
│  │   ┌──────────▼───────────────────▼──────────────────────────┐ │  │
│  │   │                   INFRASTRUCTURE                         │ │  │
│  │   │                                                          │ │  │
│  │   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │ │  │
│  │   │  │MessageBatcher│  │StreamingPull │  │  Simulation  │   │ │  │
│  │   │  │ [Component]  │  │ [Component]  │  │   [Port]     │   │ │  │
│  │   │  └──────────────┘  └──────────────┘  └──────┬───────┘   │ │  │
│  │   │                                             │            │ │  │
│  │   │  ┌──────────────┐  ┌──────────────┐        ▼            │ │  │
│  │   │  │ gRPC Client  │  │ Credentials  │  ┌──────────────┐   │ │  │
│  │   │  │  [Adapter]   │  │  [Adapter]   │  │RecordReplay  │   │ │  │
│  │   │  └──────────────┘  └──────────────┘  │  [Adapter]   │   │ │  │
│  │   │                                       └──────────────┘   │ │  │
│  │   └─────────────────────────────────────────────────────────┘ │  │
│  │                                                                │  │
│  │   ┌─────────────────────────────────────────────────────────┐ │  │
│  │   │                      TYPES                               │ │  │
│  │   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐    │ │  │
│  │   │  │ Message │ │ Config  │ │ Stream  │ │   Errors    │    │ │  │
│  │   │  │  Types  │ │  Types  │ │  Types  │ │   Types     │    │ │  │
│  │   │  └─────────┘ └─────────┘ └─────────┘ └─────────────┘    │ │  │
│  │   └─────────────────────────────────────────────────────────┘ │  │
│  │                                                                │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Module Structure

### 4.1 Rust Crate Layout

```
google-cloud-pubsub/
├── Cargo.toml
├── src/
│   ├── lib.rs                      # Public API exports
│   │
│   ├── client.rs                   # PubSubClient, PubSubClientBuilder
│   ├── config.rs                   # Configuration types
│   ├── error.rs                    # Error types
│   │
│   ├── publisher/
│   │   ├── mod.rs                  # Publisher exports
│   │   ├── publisher.rs            # PubSubPublisher
│   │   ├── batcher.rs              # MessageBatcher
│   │   └── ordering.rs             # Ordering key management
│   │
│   ├── subscriber/
│   │   ├── mod.rs                  # Subscriber exports
│   │   ├── subscriber.rs           # PubSubSubscriber
│   │   ├── streaming.rs            # StreamingPullStream
│   │   └── flow_control.rs         # Flow control logic
│   │
│   ├── types/
│   │   ├── mod.rs                  # Type exports
│   │   ├── message.rs              # PubSubMessage, ReceivedMessage
│   │   ├── config.rs               # BatchSettings, FlowControl
│   │   └── result.rs               # PublishResult
│   │
│   ├── simulation/
│   │   ├── mod.rs                  # Simulation exports
│   │   ├── layer.rs                # SimulationLayer
│   │   ├── recorder.rs             # Recording logic
│   │   ├── replayer.rs             # Replay logic
│   │   └── storage.rs              # Storage backends
│   │
│   ├── auth/
│   │   ├── mod.rs                  # Auth exports
│   │   └── credentials.rs          # Credential loading
│   │
│   └── grpc/
│       ├── mod.rs                  # gRPC exports
│       └── client.rs               # Inner gRPC client wrapper
│
├── tests/
│   ├── unit/
│   │   ├── publisher_test.rs
│   │   ├── subscriber_test.rs
│   │   ├── batcher_test.rs
│   │   └── simulation_test.rs
│   │
│   └── integration/
│       ├── publish_test.rs
│       └── subscribe_test.rs
│
└── examples/
    ├── publish.rs
    ├── subscribe.rs
    ├── streaming.rs
    └── simulation.rs
```

### 4.2 TypeScript Package Layout

```
google-cloud-pubsub/
├── package.json
├── tsconfig.json
│
├── src/
│   ├── index.ts                    # Public exports
│   │
│   ├── client.ts                   # PubSubClient, builder
│   ├── config.ts                   # Configuration types
│   ├── errors.ts                   # Error classes
│   │
│   ├── publisher/
│   │   ├── index.ts
│   │   ├── publisher.ts            # PubSubPublisher
│   │   └── batcher.ts              # MessageBatcher
│   │
│   ├── subscriber/
│   │   ├── index.ts
│   │   ├── subscriber.ts           # PubSubSubscriber
│   │   └── streaming.ts            # StreamingPull
│   │
│   ├── types/
│   │   ├── index.ts
│   │   ├── message.ts
│   │   └── config.ts
│   │
│   └── simulation/
│       ├── index.ts
│       ├── layer.ts
│       └── storage.ts
│
├── tests/
│   ├── unit/
│   └── integration/
│
└── examples/
    ├── publish.ts
    └── subscribe.ts
```

### 4.3 Cargo.toml

```toml
[package]
name = "google-cloud-pubsub"
version = "0.1.0"
edition = "2021"

[features]
default = []
simulation = []

[dependencies]
# Async runtime
tokio = { version = "1.0", features = ["rt-multi-thread", "macros", "time", "sync"] }
futures = "0.3"
async-stream = "0.3"

# gRPC
tonic = { version = "0.10", features = ["tls", "gzip"] }
prost = "0.12"

# Google Cloud
google-cloud-pubsub = "0.20"
google-cloud-auth = "0.13"

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
bytes = "1.0"

# Error handling
thiserror = "1.0"

# Observability
tracing = "0.1"

# Utilities
uuid = { version = "1.0", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }

# Shared primitives
primitives-errors = { path = "../primitives/errors" }
primitives-retry = { path = "../primitives/retry" }
primitives-tracing = { path = "../primitives/tracing" }
primitives-logging = { path = "../primitives/logging" }

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.11"
tempfile = "3.0"
```

---

## 5. Component Design

### 5.1 Publisher Component

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PUBLISHER COMPONENT                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    PubSubPublisher                           │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │                                                              │    │
│  │  Responsibilities:                                           │    │
│  │    • Single message publishing                               │    │
│  │    • Batch message publishing                                │    │
│  │    • Ordered message publishing                              │    │
│  │    • Ordering key state management                           │    │
│  │    • Message validation                                      │    │
│  │                                                              │    │
│  │  Dependencies:                                               │    │
│  │    • MessageBatcher (batching)                              │    │
│  │    • SimulationLayer (record/replay)                        │    │
│  │    • gRPC PublisherClient (transport)                       │    │
│  │                                                              │    │
│  │  Key Methods:                                                │    │
│  │    • publish(message) -> PublishResult                      │    │
│  │    • publish_batch(messages) -> Vec<PublishResult>          │    │
│  │    • publish_ordered(message, key) -> PublishResult         │    │
│  │    • resume_ordering(key) -> ()                             │    │
│  │    • flush() -> ()                                          │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    MessageBatcher                            │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │                                                              │    │
│  │  Responsibilities:                                           │    │
│  │    • Accumulate messages into batches                        │    │
│  │    • Flush based on count/size/time                          │    │
│  │    • Return results to callers                               │    │
│  │                                                              │    │
│  │  Triggers:                                                   │    │
│  │    • max_messages reached                                    │    │
│  │    • max_bytes reached                                       │    │
│  │    • max_latency elapsed                                     │    │
│  │    • manual flush() call                                     │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Subscriber Component

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SUBSCRIBER COMPONENT                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   PubSubSubscriber                           │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │                                                              │    │
│  │  Responsibilities:                                           │    │
│  │    • Pull messages (synchronous)                             │    │
│  │    • Start streaming pull                                    │    │
│  │    • Acknowledge messages                                    │    │
│  │    • Negative acknowledge (nack)                             │    │
│  │    • Modify ack deadline                                     │    │
│  │    • Seek to timestamp/snapshot                              │    │
│  │                                                              │    │
│  │  Key Methods:                                                │    │
│  │    • pull(max) -> Vec<ReceivedMessage>                      │    │
│  │    • streaming_pull(config) -> MessageStream                │    │
│  │    • ack(ack_ids) -> ()                                     │    │
│  │    • nack(ack_ids) -> ()                                    │    │
│  │    • seek_to_time(timestamp) -> ()                          │    │
│  │    • seek_to_snapshot(snapshot) -> ()                       │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  StreamingPullStream                         │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │                                                              │    │
│  │  Responsibilities:                                           │    │
│  │    • Maintain bidirectional gRPC stream                      │    │
│  │    • Flow control enforcement                                │    │
│  │    • Automatic ack deadline extension                        │    │
│  │    • Automatic reconnection                                  │    │
│  │    • In-stream ack/nack                                      │    │
│  │                                                              │    │
│  │  Implements: Stream<Item = ReceivedMessage>                  │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Data Flow

### 6.1 Publish Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                       PUBLISH DATA FLOW                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Application         Publisher          Batcher           Pub/Sub  │
│       │                   │                  │                │     │
│       │──publish()───────►│                  │                │     │
│       │                   │                  │                │     │
│       │                   │──validate()      │                │     │
│       │                   │                  │                │     │
│       │                   │──check_ordering()│                │     │
│       │                   │                  │                │     │
│       │                   │──submit()───────►│                │     │
│       │                   │                  │──accumulate()  │     │
│       │                   │                  │                │     │
│       │                   │                  │ [batch full?]  │     │
│       │                   │                  │       │        │     │
│       │                   │                  │       ▼        │     │
│       │                   │                  │──flush()──────►│     │
│       │                   │                  │                │     │
│       │                   │                  │◄─message_ids───│     │
│       │                   │                  │                │     │
│       │                   │◄─PublishResult───│                │     │
│       │◄─Result───────────│                  │                │     │
│       │                   │                  │                │     │
│                                                                      │
│   Batch Triggers:                                                   │
│     • max_messages (default: 100)                                   │
│     • max_bytes (default: 1MB)                                      │
│     • max_latency (default: 10ms)                                   │
│     • manual flush()                                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Streaming Pull Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                   STREAMING PULL DATA FLOW                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Application      StreamingPull       gRPC Stream        Pub/Sub   │
│       │                 │                   │                │      │
│       │──next()────────►│                   │                │      │
│       │                 │                   │                │      │
│       │                 │──flow_control()   │                │      │
│       │                 │                   │                │      │
│       │                 │──receive()───────►│◄──messages─────│      │
│       │                 │                   │                │      │
│       │                 │◄─StreamingPullResponse             │      │
│       │                 │                   │                │      │
│       │                 │──track_outstanding()               │      │
│       │                 │                   │                │      │
│       │                 │──start_deadline_extender()         │      │
│       │                 │                   │                │      │
│       │◄─ReceivedMessage│                   │                │      │
│       │                 │                   │                │      │
│       │──process()      │                   │                │      │
│       │                 │                   │                │      │
│       │──ack()─────────►│                   │                │      │
│       │                 │──send_ack()──────►│───────────────►│      │
│       │                 │                   │                │      │
│       │                 │──update_outstanding()              │      │
│       │                 │                   │                │      │
│                                                                      │
│   Flow Control:                                                     │
│     • max_outstanding_messages (default: 1000)                      │
│     • max_outstanding_bytes (default: 100MB)                        │
│     • Block or error when exceeded                                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.3 Simulation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SIMULATION DATA FLOW                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   RECORDING MODE:                                                   │
│   ───────────────                                                   │
│   Application ──► Service ──► SimulationLayer ──► Pub/Sub           │
│                                     │                               │
│                                     ▼                               │
│                               [Record Operation]                    │
│                                     │                               │
│                                     ▼                               │
│                                 Storage                             │
│                                                                      │
│   REPLAY MODE:                                                      │
│   ────────────                                                      │
│   Application ──► Service ──► SimulationLayer                       │
│                                     │                               │
│                                     ▼                               │
│                               [Find Recording]                      │
│                                     │                               │
│                                     ▼                               │
│                               [Return Response]                     │
│                                     │                               │
│                                     │ (No Pub/Sub call)             │
│   Application ◄─────────────────────┘                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Concurrency Model

### 7.1 Thread Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                      CONCURRENCY MODEL                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     Tokio Runtime                            │    │
│  │                                                              │    │
│  │  ┌───────────────────────────────────────────────────────┐  │    │
│  │  │                   Main Task Pool                       │  │    │
│  │  │                                                        │  │    │
│  │  │  • Publisher.publish() tasks                          │  │    │
│  │  │  • Subscriber.pull() tasks                            │  │    │
│  │  │  • Application message handlers                       │  │    │
│  │  │                                                        │  │    │
│  │  └───────────────────────────────────────────────────────┘  │    │
│  │                                                              │    │
│  │  ┌───────────────────────────────────────────────────────┐  │    │
│  │  │                Background Tasks                        │  │    │
│  │  │                                                        │  │    │
│  │  │  • Batcher flush timer (per topic)                    │  │    │
│  │  │  • Streaming pull receiver (per subscription)         │  │    │
│  │  │  • Ack deadline extender (per subscription)           │  │    │
│  │  │  • Connection health checker                          │  │    │
│  │  │                                                        │  │    │
│  │  └───────────────────────────────────────────────────────┘  │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Synchronization Primitives:                                        │
│    • RwLock: Publisher/subscriber caches, ordering state           │
│    • Mutex: Batcher pending queue                                   │
│    • mpsc channels: Batcher flush signal, streaming requests       │
│    • oneshot channels: Publish result delivery                     │
│    • AtomicU32/U64: Flow control counters                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Flow Control

```
┌─────────────────────────────────────────────────────────────────────┐
│                       FLOW CONTROL                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  PUBLISHER FLOW CONTROL:                                            │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │                                                             │     │
│  │   Application                                               │     │
│  │       │                                                     │     │
│  │       ▼                                                     │     │
│  │   [Check outstanding] ──► max_outstanding_messages?         │     │
│  │       │                         │                           │     │
│  │       │ No                      │ Yes                       │     │
│  │       ▼                         ▼                           │     │
│  │   [Submit to batcher]      [Block/Error]                    │     │
│  │                                                             │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  SUBSCRIBER FLOW CONTROL:                                           │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │                                                             │     │
│  │   StreamingPull                                             │     │
│  │       │                                                     │     │
│  │       ▼                                                     │     │
│  │   [Check outstanding] ──► max_outstanding_messages?         │     │
│  │       │                         │                           │     │
│  │       │ Under limit             │ At limit                  │     │
│  │       ▼                         ▼                           │     │
│  │   [Request more]           [Wait for acks]                  │     │
│  │                                                             │     │
│  │   On ack/nack: decrement outstanding, potentially request  │     │
│  │                                                             │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. Deployment Considerations

### 8.1 Authentication Setup

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION OPTIONS                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Option 1: Service Account Key (Development/CI)                     │
│  ────────────────────────────────────────────────                   │
│    let client = PubSubClient::builder()                             │
│        .project("my-project")                                       │
│        .credentials_file("/path/to/key.json")                       │
│        .build()?;                                                   │
│                                                                      │
│  Option 2: Application Default Credentials (Production)             │
│  ────────────────────────────────────────────────────               │
│    let client = PubSubClient::builder()                             │
│        .project("my-project")                                       │
│        .use_adc()                                                   │
│        .build()?;                                                   │
│                                                                      │
│  Option 3: Workload Identity (GKE)                                  │
│  ────────────────────────────────                                   │
│    # Configure workload identity in GKE                             │
│    # ADC automatically uses workload identity                       │
│    let client = PubSubClient::builder()                             │
│        .project_from_env()                                          │
│        .use_adc()                                                   │
│        .build()?;                                                   │
│                                                                      │
│  Option 4: Emulator (Local Development)                             │
│  ─────────────────────────────────────                              │
│    # Start emulator: gcloud beta emulators pubsub start             │
│    # Set: PUBSUB_EMULATOR_HOST=localhost:8085                       │
│    let client = PubSubClient::builder()                             │
│        .project("test-project")                                     │
│        .use_emulator_from_env()                                     │
│        .build()?;                                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 CI/CD Integration

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CI/CD INTEGRATION                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Option 1: Simulation Mode (Recommended)                            │
│  ─────────────────────────────────────────                          │
│                                                                      │
│    # Development: Record interactions                               │
│    PUBSUB_SIMULATION=record cargo test                              │
│                                                                      │
│    # Commit recordings                                              │
│    git add tests/recordings/                                        │
│                                                                      │
│    # CI: Replay mode                                                │
│    PUBSUB_SIMULATION=replay cargo test                              │
│                                                                      │
│  Benefits:                                                          │
│    • No GCP credentials in CI                                       │
│    • No network calls                                               │
│    • Fast, deterministic tests                                      │
│    • No cost for testing                                            │
│                                                                      │
│  Option 2: Emulator in CI                                           │
│  ────────────────────────                                           │
│                                                                      │
│    # GitHub Actions                                                 │
│    - name: Start Pub/Sub Emulator                                   │
│      run: |                                                         │
│        gcloud components install pubsub-emulator                    │
│        gcloud beta emulators pubsub start &                         │
│        sleep 5                                                      │
│                                                                      │
│    - name: Create test resources                                    │
│      run: |                                                         │
│        # Create topics and subscriptions in emulator               │
│                                                                      │
│    - name: Run tests                                                │
│      env:                                                           │
│        PUBSUB_EMULATOR_HOST: localhost:8085                         │
│      run: cargo test                                                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.3 Production Configuration

```
┌─────────────────────────────────────────────────────────────────────┐
│                  PRODUCTION CONFIGURATION                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  High-Throughput Publishing:                                        │
│  ───────────────────────────                                        │
│    let client = PubSubClient::builder()                             │
│        .project("prod-project")                                     │
│        .use_adc()                                                   │
│        .batch_settings(BatchSettings {                              │
│            max_messages: 1000,      // Max batch size               │
│            max_bytes: 10_000_000,   // 10MB batches                 │
│            max_latency: Duration::from_millis(50),                  │
│        })                                                           │
│        .enable_ordering()           // If needed                    │
│        .build()?;                                                   │
│                                                                      │
│  High-Volume Subscribing:                                           │
│  ────────────────────────                                           │
│    let subscriber = client.subscriber("my-subscription").await?;    │
│                                                                      │
│    let stream = subscriber.streaming_pull(StreamConfig {            │
│        flow_control: FlowControlSettings {                          │
│            max_outstanding_messages: 10_000,                        │
│            max_outstanding_bytes: 500_000_000,  // 500MB            │
│            limit_exceeded_behavior: LimitBehavior::Block,           │
│        },                                                           │
│        max_ack_extension: Duration::from_secs(3600),                │
│    }).await?;                                                       │
│                                                                      │
│  Recommended IAM Roles:                                             │
│  ─────────────────────                                              │
│    • Publisher: roles/pubsub.publisher                              │
│    • Subscriber: roles/pubsub.subscriber                            │
│    • Both: roles/pubsub.editor (not recommended for prod)           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-GCPUBSUB-ARCH-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Architecture Document**

*SPARC Phase 3 Complete - Proceed to Refinement phase with "Next phase."*
