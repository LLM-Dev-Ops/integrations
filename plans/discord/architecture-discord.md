# Architecture: Discord Integration Module

## SPARC Phase 3: Architecture

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/discord`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [C4 Model Diagrams](#2-c4-model-diagrams)
3. [Module Architecture](#3-module-architecture)
4. [Data Flow Architecture](#4-data-flow-architecture)
5. [Rate Limiting Architecture](#5-rate-limiting-architecture)
6. [Simulation Architecture](#6-simulation-architecture)
7. [Concurrency Model](#7-concurrency-model)
8. [Error Handling Architecture](#8-error-handling-architecture)
9. [Integration Patterns](#9-integration-patterns)
10. [Deployment Architecture](#10-deployment-architecture)

---

## 1. Architecture Overview

### 1.1 Design Philosophy

The Discord integration follows a **thin adapter pattern**:

| Principle | Implementation |
|-----------|----------------|
| Single Responsibility | REST API and webhook operations only |
| No Infrastructure | No bot hosting or gateway management |
| Shared Primitives | Leverage platform logging, metrics, retry |
| Stateless Core | No persistent state beyond rate limits |
| Testability | Simulation layer for CI/CD |

### 1.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LLM Dev Ops Platform                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Discord Integration                       │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │    │
│  │  │ Webhook │  │ Message │  │ Channel │  │   Rate Limit    │ │    │
│  │  │   Ops   │  │   Ops   │  │   Ops   │  │    Handler      │ │    │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────────┬────────┘ │    │
│  │       │            │            │                │          │    │
│  │       └────────────┴────────────┴────────────────┘          │    │
│  │                           │                                  │    │
│  │                    ┌──────┴──────┐                          │    │
│  │                    │ HTTP Client │                          │    │
│  │                    │  + Retry    │                          │    │
│  │                    └──────┬──────┘                          │    │
│  │                           │                                  │    │
│  │                    ┌──────┴──────┐                          │    │
│  │                    │ Simulation  │                          │    │
│  │                    │   Layer     │                          │    │
│  │                    └─────────────┘                          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Shared Primitives                         │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │    │
│  │  │ Logging │  │ Metrics │  │  Retry  │  │  Auth/Secrets   │ │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    Discord API      │
                    │  ┌───────────────┐  │
                    │  │   Webhooks    │  │
                    │  ├───────────────┤  │
                    │  │   REST API    │  │
                    │  └───────────────┘  │
                    └─────────────────────┘
```

### 1.3 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| No gateway connection | Avoids WebSocket complexity and state |
| Webhook-first approach | Fire-and-forget for notifications |
| In-memory rate limits | No external dependencies |
| Bucket-based limiting | Matches Discord's rate limit model |
| Simulation layer | Enables deterministic testing |

---

## 2. C4 Model Diagrams

### 2.1 Context Diagram (Level 1)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                           «System»                                   │
│                      LLM Dev Ops Platform                            │
│                                                                      │
│    ┌────────────────────────────────────────────────────────┐       │
│    │                                                         │       │
│    │              Discord Integration Module                 │       │
│    │                                                         │       │
│    │    Sends messages, manages webhooks, handles rate      │       │
│    │    limits for Discord messaging operations              │       │
│    │                                                         │       │
│    └────────────────────────────────────────────────────────┘       │
│                                                                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │ HTTPS/REST
                               │
                               ▼
                    ┌─────────────────────┐
                    │   «External System» │
                    │     Discord API     │
                    │                     │
                    │  - Webhook endpoints│
                    │  - Channel messages │
                    │  - Thread operations│
                    │  - DM channels      │
                    └─────────────────────┘
```

### 2.2 Container Diagram (Level 2)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Discord Integration Module                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐     │
│  │   «Component»  │    │   «Component»  │    │   «Component»  │     │
│  │  Webhook Ops   │    │  Message Ops   │    │  Channel Ops   │     │
│  │                │    │                │    │                │     │
│  │  - Execute     │    │  - Send        │    │  - Create      │     │
│  │  - Edit        │    │  - Edit        │    │    Thread      │     │
│  │  - Delete      │    │  - Delete      │    │  - Send DM     │     │
│  │                │    │  - React       │    │                │     │
│  └───────┬────────┘    └───────┬────────┘    └───────┬────────┘     │
│          │                     │                     │              │
│          └─────────────────────┼─────────────────────┘              │
│                                │                                     │
│                         ┌──────┴──────┐                             │
│                         │ «Component» │                             │
│                         │   Client    │                             │
│                         │    Core     │                             │
│                         └──────┬──────┘                             │
│                                │                                     │
│          ┌─────────────────────┼─────────────────────┐              │
│          │                     │                     │              │
│  ┌───────┴────────┐    ┌───────┴───────┐    ┌───────┴────────┐     │
│  │  «Component»   │    │  «Component»  │    │   «Component»  │     │
│  │  Rate Limiter  │    │  HTTP Client  │    │   Simulation   │     │
│  │                │    │               │    │     Layer      │     │
│  │  - Buckets     │    │  - Retry      │    │                │     │
│  │  - Queue       │    │  - Timeout    │    │  - Record      │     │
│  │  - Backoff     │    │  - TLS        │    │  - Replay      │     │
│  └────────────────┘    └───────────────┘    └────────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 Component Diagram (Level 3)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client Core                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     DiscordClient                            │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │    │
│  │  │   Config    │  │  HttpClient  │  │   RateLimiter    │   │    │
│  │  │   (Arc)     │  │    (Arc)     │  │      (Arc)       │   │    │
│  │  └─────────────┘  └──────────────┘  └──────────────────┘   │    │
│  │                                                              │    │
│  │  ┌──────────────────────────────────────────────────────┐   │    │
│  │  │                 SimulationLayer (Arc)                 │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Public API:                                                         │
│  ├── execute_webhook(params) -> Result<Option<Message>>             │
│  ├── edit_webhook_message(params) -> Result<Message>                │
│  ├── delete_webhook_message(params) -> Result<()>                   │
│  ├── send_message(params) -> Result<Message>                        │
│  ├── edit_message(params) -> Result<Message>                        │
│  ├── delete_message(channel, msg_id) -> Result<()>                  │
│  ├── add_reaction(params) -> Result<()>                             │
│  ├── create_thread(params) -> Result<Channel>                       │
│  ├── send_to_thread(thread_id, params) -> Result<Message>           │
│  └── send_dm(user_id, params) -> Result<Message>                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Module Architecture

### 3.1 Directory Structure

```
integrations/discord/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Public exports
│   ├── client.rs                 # DiscordClient implementation
│   ├── config.rs                 # Configuration & builder
│   │
│   ├── operations/
│   │   ├── mod.rs
│   │   ├── webhook.rs            # Webhook execute/edit/delete
│   │   ├── message.rs            # Message send/edit/delete/react
│   │   └── channel.rs            # Thread/DM operations
│   │
│   ├── rate_limit/
│   │   ├── mod.rs
│   │   ├── bucket.rs             # Rate limit bucket
│   │   ├── limiter.rs            # Rate limiter coordinator
│   │   └── queue.rs              # Request queue
│   │
│   ├── simulation/
│   │   ├── mod.rs
│   │   ├── layer.rs              # Simulation layer
│   │   ├── recorder.rs           # Interaction recorder
│   │   └── storage.rs            # File persistence
│   │
│   ├── types/
│   │   ├── mod.rs
│   │   ├── message.rs            # Message, Embed types
│   │   ├── component.rs          # Button, SelectMenu
│   │   ├── channel.rs            # Channel, Thread types
│   │   └── snowflake.rs          # Snowflake ID type
│   │
│   └── error.rs                  # Error types
│
├── tests/
│   ├── integration/
│   │   ├── webhook_test.rs
│   │   ├── message_test.rs
│   │   └── channel_test.rs
│   ├── unit/
│   │   ├── rate_limit_test.rs
│   │   ├── simulation_test.rs
│   │   └── types_test.rs
│   └── fixtures/
│       └── recordings/           # Simulation recordings
│
└── examples/
    ├── send_webhook.rs
    ├── channel_messaging.rs
    └── simulation_mode.rs
```

### 3.2 Module Dependencies

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Module Dependencies                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  lib.rs                                                              │
│    ├── client.rs                                                     │
│    │     ├── config.rs                                               │
│    │     ├── operations/                                             │
│    │     │     ├── webhook.rs → types/message.rs                     │
│    │     │     ├── message.rs → types/message.rs, types/component.rs │
│    │     │     └── channel.rs → types/channel.rs                     │
│    │     ├── rate_limit/                                             │
│    │     │     ├── limiter.rs → bucket.rs, queue.rs                  │
│    │     │     ├── bucket.rs                                         │
│    │     │     └── queue.rs                                          │
│    │     ├── simulation/                                             │
│    │     │     ├── layer.rs → recorder.rs, storage.rs                │
│    │     │     ├── recorder.rs                                       │
│    │     │     └── storage.rs                                        │
│    │     └── error.rs                                                │
│    └── types/                                                        │
│          ├── message.rs                                              │
│          ├── component.rs                                            │
│          ├── channel.rs                                              │
│          └── snowflake.rs                                            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 External Dependencies

| Crate | Version | Purpose |
|-------|---------|---------|
| tokio | 1.0+ | Async runtime |
| reqwest | 0.11+ | HTTP client |
| serde | 1.0+ | Serialization |
| serde_json | 1.0+ | JSON handling |
| secrecy | 0.8+ | Secret handling |
| thiserror | 1.0+ | Error types |
| tracing | 0.1+ | Observability |
| parking_lot | 0.12+ | Synchronization |
| regex | 1.0+ | URL parsing |

---

## 4. Data Flow Architecture

### 4.1 Webhook Message Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Webhook Message Flow                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Caller invokes execute_webhook(params)                          │
│                          │                                           │
│                          ▼                                           │
│  2. ┌─────────────────────────────────────┐                         │
│     │     Check Simulation Mode           │                         │
│     │  ┌──────────────────────────────┐  │                         │
│     │  │ Replay? → Return mock data   │  │                         │
│     │  └──────────────────────────────┘  │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼ (Not replay)                             │
│  3. ┌─────────────────────────────────────┐                         │
│     │     Parse Webhook URL               │                         │
│     │  Extract webhook_id, webhook_token  │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  4. ┌─────────────────────────────────────┐                         │
│     │     Acquire Rate Limit Slot         │                         │
│     │  Bucket: webhook:{webhook_id}       │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  5. ┌─────────────────────────────────────┐                         │
│     │     Build HTTP Request              │                         │
│     │  POST /webhooks/{id}/{token}        │                         │
│     │  Body: { content, embeds, ... }     │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  6. ┌─────────────────────────────────────┐                         │
│     │     Execute with Retry              │                         │
│     │  ┌──────────────────────────────┐  │                         │
│     │  │ 429? → Wait retry_after      │  │                         │
│     │  │ 5xx? → Exponential backoff   │  │                         │
│     │  └──────────────────────────────┘  │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  7. ┌─────────────────────────────────────┐                         │
│     │     Update Rate Limit State         │                         │
│     │  From X-RateLimit-* headers         │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  8. ┌─────────────────────────────────────┐                         │
│     │     Record if Recording Mode        │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  9. Return Result<Option<Message>>                                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Channel Message Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Channel Message Flow                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Caller invokes send_message(params)                             │
│                          │                                           │
│                          ▼                                           │
│  2. ┌─────────────────────────────────────┐                         │
│     │     Resolve Channel Target          │                         │
│     │  ┌──────────────────────────────┐  │                         │
│     │  │ Id(snowflake) → Use directly │  │                         │
│     │  │ Name(str) → Lookup in routing│  │                         │
│     │  └──────────────────────────────┘  │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  3. ┌─────────────────────────────────────┐                         │
│     │     Acquire Rate Limit Slot         │                         │
│     │  Bucket: channel:{channel_id}:msgs  │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  4. ┌─────────────────────────────────────┐                         │
│     │     Build HTTP Request              │                         │
│     │  POST /channels/{id}/messages       │                         │
│     │  Header: Authorization: Bot {token} │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  5. ┌─────────────────────────────────────┐                         │
│     │     Execute with Retry              │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  6. Return Result<Message>                                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 DM Message Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DM Message Flow                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Caller invokes send_dm(user_id, params)                         │
│                          │                                           │
│                          ▼                                           │
│  2. ┌─────────────────────────────────────┐                         │
│     │     Create/Get DM Channel           │                         │
│     │  POST /users/@me/channels           │                         │
│     │  Body: { recipient_id: user_id }    │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  3. ┌─────────────────────────────────────┐                         │
│     │     Send to DM Channel              │                         │
│     │  POST /channels/{dm_id}/messages    │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  4. Return Result<Message>                                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Rate Limiting Architecture

### 5.1 Rate Limit Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Rate Limit Architecture                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                       RateLimiter                            │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │                   Global Bucket                      │    │    │
│  │  │  - Limit: 50 req/sec                                 │    │    │
│  │  │  - Tracks all requests                               │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  │                                                              │    │
│  │  ┌─────────────────────────────────────────────────────┐    │    │
│  │  │               Route-Specific Buckets                 │    │    │
│  │  │  ┌───────────────┐  ┌───────────────────────────┐   │    │    │
│  │  │  │ webhook:123   │  │ channel:456:messages      │   │    │    │
│  │  │  │ 30/min        │  │ varies per headers        │   │    │    │
│  │  │  └───────────────┘  └───────────────────────────┘   │    │    │
│  │  │  ┌───────────────┐  ┌───────────────────────────┐   │    │    │
│  │  │  │ users:dm      │  │ channel:789:reactions     │   │    │    │
│  │  │  │ varies        │  │ varies                    │   │    │    │
│  │  │  └───────────────┘  └───────────────────────────┘   │    │    │
│  │  └─────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Bucket State Machine

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Bucket State Machine                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                         ┌───────────┐                               │
│                         │  READY    │                               │
│                         │ remaining │                               │
│                         │   > 0     │                               │
│                         └─────┬─────┘                               │
│                               │                                      │
│                    request()  │                                      │
│                               ▼                                      │
│                         ┌───────────┐                               │
│                         │ ACQUIRED  │                               │
│                         │ remaining │                               │
│                         │   -= 1    │                               │
│                         └─────┬─────┘                               │
│                               │                                      │
│              ┌────────────────┼────────────────┐                    │
│              │                │                │                    │
│              ▼                ▼                ▼                    │
│        ┌───────────┐   ┌───────────┐   ┌───────────┐               │
│        │  SUCCESS  │   │ RATE_LIM  │   │   ERROR   │               │
│        │  update   │   │   429     │   │  retry?   │               │
│        │  headers  │   │           │   │           │               │
│        └─────┬─────┘   └─────┬─────┘   └─────┬─────┘               │
│              │               │               │                      │
│              │               ▼               │                      │
│              │         ┌───────────┐         │                      │
│              │         │  WAITING  │         │                      │
│              │         │ retry_    │         │                      │
│              │         │ after     │         │                      │
│              │         └─────┬─────┘         │                      │
│              │               │               │                      │
│              └───────────────┴───────────────┘                      │
│                              │                                       │
│                              ▼                                       │
│                         ┌───────────┐                               │
│                         │  READY    │                               │
│                         └───────────┘                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 Rate Limit Header Handling

| Header | Purpose | Handling |
|--------|---------|----------|
| X-RateLimit-Limit | Max requests in window | Store for monitoring |
| X-RateLimit-Remaining | Requests remaining | Update bucket state |
| X-RateLimit-Reset | Unix timestamp of reset | Set reset_at |
| X-RateLimit-Reset-After | Seconds until reset | Calculate wait time |
| X-RateLimit-Bucket | Bucket identifier | Route grouping |
| Retry-After | Seconds to wait (429) | Sleep duration |
| X-RateLimit-Global | Global limit hit | Pause all requests |

---

## 6. Simulation Architecture

### 6.1 Simulation Layer Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Simulation Architecture                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     SimulationLayer                          │    │
│  │                                                              │    │
│  │  ┌────────────────┐                                          │    │
│  │  │ SimulationMode │                                          │    │
│  │  │ ├── Disabled   │ → Pass-through to real API              │    │
│  │  │ ├── Recording  │ → Execute + record interactions         │    │
│  │  │ └── Replay     │ → Return mock responses                 │    │
│  │  └────────────────┘                                          │    │
│  │                                                              │    │
│  │  ┌────────────────────────────────────────────────────┐     │    │
│  │  │                 SimulationRecorder                  │     │    │
│  │  │  - Captures request details                         │     │    │
│  │  │  - Captures response details                        │     │    │
│  │  │  - Captures rate limit headers                      │     │    │
│  │  │  - Thread-safe (RwLock)                             │     │    │
│  │  └────────────────────────────────────────────────────┘     │    │
│  │                                                              │    │
│  │  ┌────────────────────────────────────────────────────┐     │    │
│  │  │                 SimulationStorage                   │     │    │
│  │  │  - Load recordings from file                        │     │    │
│  │  │  - Save recordings to file                          │     │    │
│  │  │  - Index by operation + params                      │     │    │
│  │  └────────────────────────────────────────────────────┘     │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Recording Format

```json
{
  "metadata": {
    "version": "1.0",
    "created": "2025-12-13T00:00:00Z",
    "discord_api_version": "10"
  },
  "interactions": [
    {
      "id": "uuid-1",
      "timestamp": "2025-12-13T00:00:01Z",
      "operation": "webhook:123456789:execute",
      "request": {
        "method": "POST",
        "path": "/webhooks/123456789/token123",
        "body": {
          "content": "Test message",
          "embeds": []
        }
      },
      "response": {
        "status": 200,
        "body": {
          "id": "987654321",
          "channel_id": "111222333",
          "content": "Test message"
        }
      },
      "rate_limit": {
        "bucket": "webhook:123456789",
        "remaining": 29,
        "reset_after": 60.0
      }
    }
  ]
}
```

### 6.3 Replay Matching

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Replay Matching                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Request Key Generation:                                             │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  key = hash(operation, method, normalized_body)              │    │
│  │                                                              │    │
│  │  Normalization:                                              │    │
│  │  - Remove timestamp fields                                   │    │
│  │  - Sort object keys                                          │    │
│  │  - Normalize whitespace                                      │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Matching Strategy:                                                  │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  1. Exact match on key                                       │    │
│  │  2. Fuzzy match on operation                                 │    │
│  │  3. Return SimulationNoMatch error                           │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Response Generation:                                                │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  1. Load recorded response                                   │    │
│  │  2. Generate fresh Snowflake IDs                             │    │
│  │  3. Update timestamps to current time                        │    │
│  │  4. Return modified response                                 │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Concurrency Model

### 7.1 Shared State

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Concurrency Model                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  DiscordClient (Cloneable, Send + Sync)                             │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  Arc<DiscordConfig>    - Immutable after creation           │    │
│  │  Arc<HttpClient>       - Internally synchronized            │    │
│  │  Arc<RateLimiter>      - Thread-safe buckets                │    │
│  │  Arc<SimulationLayer>  - RwLock protected                   │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  RateLimiter                                                         │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  RwLock<HashMap<String, Arc<Bucket>>>  - Bucket registry    │    │
│  │  Arc<GlobalBucket>                     - Global limiter     │    │
│  │                                                              │    │
│  │  Bucket                                                      │    │
│  │  ├── AtomicU32 (remaining)                                   │    │
│  │  ├── AtomicU64 (reset_at)                                    │    │
│  │  └── Semaphore (concurrent requests)                         │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  SimulationLayer                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  RwLock<SimulationMode>                                      │    │
│  │  RwLock<SimulationRecorder>                                  │    │
│  │  SimulationStorage (immutable after load)                    │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Thread Safety Guarantees

| Component | Synchronization | Guarantee |
|-----------|-----------------|-----------|
| DiscordClient | Arc wrapper | Safe to clone and share |
| RateLimiter | RwLock + Atomics | Lock-free fast path |
| Bucket | Atomics + Semaphore | Concurrent rate limiting |
| SimulationLayer | RwLock | Concurrent reads, exclusive writes |
| HttpClient (reqwest) | Internal | Connection pooling |

---

## 8. Error Handling Architecture

### 8.1 Error Categories

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Error Handling Architecture                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      DiscordError                            │    │
│  │                                                              │    │
│  │  Retryable Errors:                                           │    │
│  │  ├── RateLimited { retry_after }   → Wait and retry         │    │
│  │  ├── ServerError { status }        → Exponential backoff    │    │
│  │  └── NetworkError                  → Connection retry        │    │
│  │                                                              │    │
│  │  Non-Retryable Errors:                                       │    │
│  │  ├── Unauthorized                  → Invalid token           │    │
│  │  ├── Forbidden                     → Missing permissions     │    │
│  │  ├── NotFound                      → Resource deleted        │    │
│  │  ├── BadRequest                    → Invalid input           │    │
│  │  └── ValidationError               → Schema violation        │    │
│  │                                                              │    │
│  │  Configuration Errors:                                       │    │
│  │  ├── NoAuthentication              → Missing token/webhook   │    │
│  │  ├── InvalidWebhookUrl             → Malformed URL           │    │
│  │  └── UnknownChannelRoute           → Route not configured    │    │
│  │                                                              │    │
│  │  Queue Errors:                                               │    │
│  │  ├── QueueFull                     → Too many pending        │    │
│  │  ├── QueueTimeout                  → Request expired         │    │
│  │  └── RateLimitTimeout              → Wait too long           │    │
│  │                                                              │    │
│  │  Simulation Errors:                                          │    │
│  │  ├── SimulationNoMatch             → No recorded response    │    │
│  │  └── SimulationLoadError           → File read failure       │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Error Recovery Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Error Recovery Flow                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                         Execute Request                              │
│                              │                                       │
│                              ▼                                       │
│                    ┌───────────────────┐                            │
│                    │   Check Status    │                            │
│                    └─────────┬─────────┘                            │
│                              │                                       │
│       ┌──────────┬──────────┼──────────┬──────────┐                 │
│       │          │          │          │          │                 │
│       ▼          ▼          ▼          ▼          ▼                 │
│   ┌──────┐  ┌───────┐  ┌───────┐  ┌───────┐  ┌───────┐             │
│   │ 2xx  │  │  429  │  │  5xx  │  │ 4xx   │  │Network│             │
│   │      │  │       │  │       │  │       │  │ Error │             │
│   └──┬───┘  └───┬───┘  └───┬───┘  └───┬───┘  └───┬───┘             │
│      │          │          │          │          │                  │
│      │          ▼          ▼          │          ▼                  │
│      │    ┌──────────┐ ┌─────────┐    │    ┌─────────┐             │
│      │    │ Parse    │ │ Retry   │    │    │ Retry   │             │
│      │    │ Retry-   │ │ Count   │    │    │ Count   │             │
│      │    │ After    │ │ Check   │    │    │ Check   │             │
│      │    └────┬─────┘ └────┬────┘    │    └────┬────┘             │
│      │         │            │         │         │                   │
│      │         ▼            ▼         │         ▼                   │
│      │    ┌──────────┐ ┌─────────┐    │    ┌─────────┐             │
│      │    │ Wait     │ │Exp Back │    │    │Exp Back │             │
│      │    │ Duration │ │  off    │    │    │  off    │             │
│      │    └────┬─────┘ └────┬────┘    │    └────┬────┘             │
│      │         │            │         │         │                   │
│      │         └─────┬──────┘         │         │                   │
│      │               │                │         │                   │
│      │               ▼                │         │                   │
│      │         ┌───────────┐          │         │                   │
│      │         │   Retry   │◄─────────┴─────────┘                   │
│      │         │  Request  │                                        │
│      │         └─────┬─────┘                                        │
│      │               │                                              │
│      └───────────────┴───────────────────────────────┐              │
│                                                      │              │
│                                                      ▼              │
│                                              ┌───────────┐          │
│                                              │  Return   │          │
│                                              │  Result   │          │
│                                              └───────────┘          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. Integration Patterns

### 9.1 Notification Pattern

```rust
// Fire-and-forget webhook notification
async fn send_alert(client: &DiscordClient, alert: Alert) -> Result<(), DiscordError> {
    let embed = Embed::builder()
        .title(&alert.title)
        .description(&alert.message)
        .color(severity_to_color(alert.severity))
        .timestamp(alert.timestamp)
        .build();

    client.execute_webhook(WebhookParams {
        content: None,
        embeds: vec![embed],
        wait: false,  // Fire and forget
        ..Default::default()
    }).await?;

    Ok(())
}
```

### 9.2 Interactive Workflow Pattern

```rust
// Create thread for pipeline, update as stages complete
async fn pipeline_workflow(client: &DiscordClient, pipeline: Pipeline) -> Result<(), DiscordError> {
    // Create thread for this pipeline run
    let thread = client.create_thread(CreateThreadParams {
        channel: ChannelTarget::Name("pipelines".into()),
        name: format!("Pipeline: {}", pipeline.name),
        ..Default::default()
    }).await?;

    // Send initial status
    let msg = client.send_to_thread(thread.id, SendMessageParams {
        content: Some(format!("Pipeline **{}** started", pipeline.name)),
        embeds: vec![pipeline_status_embed(&pipeline)],
        ..Default::default()
    }).await?;

    // Update as stages complete
    for stage in &pipeline.stages {
        stage.run().await?;

        client.edit_message(EditMessageParams {
            channel: ChannelTarget::Id(thread.id),
            message_id: msg.id,
            embeds: Some(vec![pipeline_status_embed(&pipeline)]),
            ..Default::default()
        }).await?;
    }

    // Add completion reaction
    client.add_reaction(ReactionParams {
        channel: ChannelTarget::Id(thread.id),
        message_id: msg.id,
        emoji: Emoji::Unicode("✅".into()),
    }).await?;

    Ok(())
}
```

### 9.3 Multi-Channel Routing Pattern

```rust
// Route messages based on type
async fn route_notification(
    client: &DiscordClient,
    notification: Notification,
) -> Result<(), DiscordError> {
    // Channel routing configured at client creation:
    // "alerts" -> 123456789
    // "deployments" -> 987654321
    // "feedback" -> 111222333

    let channel = match notification.category {
        Category::Alert => ChannelTarget::Name("alerts".into()),
        Category::Deployment => ChannelTarget::Name("deployments".into()),
        Category::Feedback => ChannelTarget::Name("feedback".into()),
        _ => ChannelTarget::Name("general".into()),
    };

    client.send_message(SendMessageParams {
        channel,
        content: Some(notification.message),
        embeds: notification.embeds,
        ..Default::default()
    }).await?;

    Ok(())
}
```

---

## 10. Deployment Architecture

### 10.1 Runtime Requirements

| Requirement | Specification |
|-------------|---------------|
| Rust Version | 1.70+ |
| Async Runtime | Tokio 1.0+ |
| Memory | ~10MB base + queue |
| Network | Outbound HTTPS |
| TLS | 1.2+ required |

### 10.2 Configuration Sources

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Configuration Sources                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Priority Order (highest to lowest):                                 │
│                                                                      │
│  1. Direct Config                                                    │
│     DiscordConfigBuilder::new()                                      │
│         .with_bot_token("...")                                       │
│         .with_webhook("...")                                         │
│         .build()                                                     │
│                                                                      │
│  2. Environment Variables                                            │
│     DISCORD_BOT_TOKEN      - Bot authentication token               │
│     DISCORD_WEBHOOK_URL    - Default webhook URL                    │
│     DISCORD_API_VERSION    - API version (default: 10)              │
│                                                                      │
│  3. Secrets Manager Integration                                      │
│     Via shared primitives-secrets                                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.3 Observability Integration

| Metric | Type | Description |
|--------|------|-------------|
| discord_requests_total | Counter | Total API requests |
| discord_requests_success | Counter | Successful requests |
| discord_requests_failed | Counter | Failed requests |
| discord_rate_limits_hit | Counter | 429 responses received |
| discord_request_duration_seconds | Histogram | Request latency |
| discord_queue_depth | Gauge | Pending requests in queue |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-DISCORD-ARCH-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Architecture Document**

*SPARC Phase 3 Complete - Proceed to Refinement phase with "Next phase."*
