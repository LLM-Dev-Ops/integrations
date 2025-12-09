# Architecture: Cohere Integration Module - Part 1

**System Overview, C4 Diagrams, Module Structure**

**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/cohere`
**SPARC Phase:** Architecture (1 of 3)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Design Principles](#2-design-principles)
3. [C4 Context Diagram](#3-c4-context-diagram)
4. [C4 Container Diagram](#4-c4-container-diagram)
5. [C4 Component Diagram](#5-c4-component-diagram)
6. [Rust Crate Architecture](#6-rust-crate-architecture)
7. [TypeScript Package Architecture](#7-typescript-package-architecture)

---

## 1. Executive Summary

### 1.1 Purpose

The Cohere Integration Module provides a production-ready, type-safe client library for interacting with Cohere's AI API services. It supports the full range of Cohere capabilities including chat, text generation, embeddings, reranking, classification, summarization, and fine-tuning.

### 1.2 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Hexagonal Architecture | Isolates business logic from infrastructure concerns |
| Interface-First Design | Enables London-School TDD with comprehensive mocking |
| Async-First | Non-blocking I/O for high throughput |
| Primitive Composition | Leverages shared resilience, observability primitives |
| Dual-Language Support | Rust (primary) and TypeScript implementations |

### 1.3 Scope

**In Scope:**
- Full Cohere API v1/v2 coverage
- Streaming SSE support
- RAG with connectors and documents
- Tool/function calling
- Citation generation
- Multiple embedding types
- Fine-tuning management
- Connector OAuth flows

**Out of Scope:**
- Direct database integrations
- Custom model hosting
- Multi-provider abstraction (handled at higher layer)

---

## 2. Design Principles

### 2.1 SOLID Principles

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOLID in Cohere Integration                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  S - Single Responsibility                                       │
│      Each service handles one API domain                         │
│      ChatService → Chat operations only                          │
│      EmbedService → Embedding operations only                    │
│                                                                  │
│  O - Open/Closed                                                 │
│      Extensible via traits/interfaces                            │
│      New auth methods without modifying existing                 │
│                                                                  │
│  L - Liskov Substitution                                         │
│      MockTransport substitutable for HttpTransport               │
│      All implementations honor interface contracts               │
│                                                                  │
│  I - Interface Segregation                                       │
│      Small, focused interfaces                                   │
│      Clients depend only on needed capabilities                  │
│                                                                  │
│  D - Dependency Inversion                                        │
│      Services depend on transport interface                      │
│      High-level modules independent of low-level                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Hexagonal Architecture

```
                            ┌─────────────────┐
                            │   Cohere API    │
                            │   (External)    │
                            └────────┬────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
              ┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐
              │   HTTP    │    │    SSE    │    │  OAuth    │
              │  Adapter  │    │  Adapter  │    │  Adapter  │
              └─────┬─────┘    └─────┬─────┘    └─────┬─────┘
                    │                │                │
                    └────────────────┼────────────────┘
                                     │
                            ┌────────▼────────┐
                            │                 │
                            │   PORT LAYER    │
                            │  (Interfaces)   │
                            │                 │
                            └────────┬────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
  │   Chat    │  │  Embed    │  │  Rerank   │  │ Classify  │  │ Finetune  │
  │  Service  │  │  Service  │  │  Service  │  │  Service  │  │  Service  │
  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
        │              │              │              │              │
        └──────────────┴──────────────┼──────────────┴──────────────┘
                                      │
                            ┌─────────▼─────────┐
                            │                   │
                            │    CORE DOMAIN    │
                            │   (Types/Logic)   │
                            │                   │
                            └─────────┬─────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
              ┌─────▼─────┐     ┌─────▼─────┐     ┌─────▼─────┐
              │  Config   │     │  Metrics  │     │  Tracing  │
              │  Adapter  │     │  Adapter  │     │  Adapter  │
              └───────────┘     └───────────┘     └───────────┘
                    │                 │                 │
                    ▼                 ▼                 ▼
              ┌───────────┐     ┌───────────┐     ┌───────────┐
              │   Env     │     │Prometheus │     │   OTLP    │
              │   Vars    │     │  /StatsD  │     │  Exporter │
              └───────────┘     └───────────┘     └───────────┘
```

### 2.3 London-School TDD Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                      Test Boundary Layers                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Layer 1: Unit Tests (Mocked Dependencies)                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ChatService ──mock──▶ HttpTransport                        ││
│  │  EmbedService ──mock──▶ HttpTransport                       ││
│  │  ResilienceOrchestrator ──mock──▶ CircuitBreaker           ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Layer 2: Integration Tests (Real Components, Mock External)     │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  CohereClient ──real──▶ Services ──mock──▶ HTTP             ││
│  │  Full pipeline with MockHttpTransport                        ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Layer 3: Contract Tests (Real External, Controlled)             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  CohereClient ──real──▶ Cohere API (test account)           ││
│  │  Validates API contract compliance                           ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. C4 Context Diagram

### 3.1 System Context

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           SYSTEM CONTEXT                                 │
│                                                                          │
│                         ┌─────────────────┐                              │
│                         │                 │                              │
│                         │   Application   │                              │
│                         │    (User's)     │                              │
│                         │                 │                              │
│                         └────────┬────────┘                              │
│                                  │                                       │
│                                  │ Uses                                  │
│                                  ▼                                       │
│                    ┌─────────────────────────────┐                       │
│                    │                             │                       │
│                    │    Cohere Integration       │                       │
│                    │         Module              │                       │
│                    │                             │                       │
│                    │  ┌───────────────────────┐  │                       │
│                    │  │ • Chat & Generate     │  │                       │
│                    │  │ • Embeddings          │  │                       │
│                    │  │ • Rerank & Classify   │  │                       │
│                    │  │ • Summarize           │  │                       │
│                    │  │ • Fine-tuning         │  │                       │
│                    │  │ • Connectors (RAG)    │  │                       │
│                    │  └───────────────────────┘  │                       │
│                    │                             │                       │
│                    └─────────────┬───────────────┘                       │
│                                  │                                       │
│            ┌─────────────────────┼─────────────────────┐                 │
│            │                     │                     │                 │
│            ▼                     ▼                     ▼                 │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐       │
│   │                 │   │                 │   │                 │       │
│   │   Cohere API    │   │  Integration    │   │  Observability  │       │
│   │   (External)    │   │   Primitives    │   │   Backends      │       │
│   │                 │   │                 │   │                 │       │
│   │ api.cohere.ai   │   │ • Retry         │   │ • Prometheus    │       │
│   │                 │   │ • Circuit Break │   │ • Jaeger/OTLP   │       │
│   │                 │   │ • Rate Limit    │   │ • Logging       │       │
│   │                 │   │ • Tracing       │   │                 │       │
│   └─────────────────┘   └─────────────────┘   └─────────────────┘       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 External Systems

| System | Description | Protocol | Data Flow |
|--------|-------------|----------|-----------|
| Cohere API | AI model inference and management | HTTPS/SSE | Request/Response, Streaming |
| Integration Primitives | Shared resilience and observability | Library | In-process calls |
| Observability Backends | Metrics and tracing collection | OTLP/HTTP | Telemetry export |
| OAuth Providers | Connector authentication | OAuth 2.0 | Token exchange |

---

## 4. C4 Container Diagram

### 4.1 Container Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CONTAINER DIAGRAM                                │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     Cohere Integration Module                       │ │
│  │                                                                     │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │ │
│  │  │             │  │             │  │             │  │            │ │ │
│  │  │   Cohere    │  │   Service   │  │  Transport  │  │ Streaming  │ │ │
│  │  │   Client    │──│    Layer    │──│    Layer    │──│   Layer    │ │ │
│  │  │             │  │             │  │             │  │            │ │ │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘ │ │
│  │         │                │                │               │        │ │
│  │         │                │                │               │        │ │
│  │  ┌──────▼──────────────────────────────────────────────────────┐  │ │
│  │  │                    Resilience Layer                          │  │ │
│  │  │  ┌────────────┐  ┌────────────────┐  ┌──────────────────┐   │  │ │
│  │  │  │   Retry    │  │ Circuit Breaker│  │   Rate Limiter   │   │  │ │
│  │  │  │  Executor  │  │  State Machine │  │  (Token Bucket)  │   │  │ │
│  │  │  └────────────┘  └────────────────┘  └──────────────────┘   │  │ │
│  │  └──────────────────────────────────────────────────────────────┘  │ │
│  │                                                                     │ │
│  │  ┌──────────────────────────────────────────────────────────────┐  │ │
│  │  │                   Observability Layer                         │  │ │
│  │  │  ┌────────────┐  ┌────────────────┐  ┌──────────────────┐   │  │ │
│  │  │  │   Tracer   │  │    Metrics     │  │     Logger       │   │  │ │
│  │  │  │   (Spans)  │  │   (Counters)   │  │  (Structured)    │   │  │ │
│  │  │  └────────────┘  └────────────────┘  └──────────────────┘   │  │ │
│  │  └──────────────────────────────────────────────────────────────┘  │ │
│  │                                                                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│                                    │                                     │
│                                    │ HTTPS/SSE                           │
│                                    ▼                                     │
│                         ┌─────────────────────┐                          │
│                         │     Cohere API      │                          │
│                         │   api.cohere.ai     │                          │
│                         └─────────────────────┘                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Container Responsibilities

| Container | Responsibility | Technology |
|-----------|---------------|------------|
| Cohere Client | Entry point, service factory | Rust/TypeScript |
| Service Layer | Business logic, request building | Rust/TypeScript |
| Transport Layer | HTTP communication, TLS | reqwest/hyper, fetch |
| Streaming Layer | SSE parsing, event dispatch | tokio, AsyncIterator |
| Resilience Layer | Retry, circuit breaker, rate limit | integrations-* crates |
| Observability Layer | Tracing, metrics, logging | integrations-* crates |

---

## 5. C4 Component Diagram

### 5.1 Service Layer Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      SERVICE LAYER COMPONENTS                            │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                         CohereClient                               │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                    Service Factory                           │  │  │
│  │  │  • Lazy service initialization                               │  │  │
│  │  │  • Shared service context                                    │  │  │
│  │  │  • Configuration management                                  │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                      │                                   │
│           ┌──────────────────────────┼──────────────────────────┐       │
│           │              │           │           │              │       │
│           ▼              ▼           ▼           ▼              ▼       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  │ ChatService │ │EmbedService │ │RerankService│ │ClassifyServ │ │SummarizeServ│
│  ├─────────────┤ ├─────────────┤ ├─────────────┤ ├─────────────┤ ├─────────────┤
│  │• chat()     │ │• embed()    │ │• rerank()   │ │• classify() │ │• summarize()│
│  │• stream()   │ │• embed_text │ │• rerank_txt │ │• with_model │ │• summarize_ │
│  │• with_rag() │ │• embed_typed│ │• rerank_doc │ │• with_ex    │ │   text()    │
│  │• with_tools │ │             │ │             │ │             │ │             │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
│         │              │              │              │              │       │
│         └──────────────┴──────────────┼──────────────┴──────────────┘       │
│                                       │                                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  │TokenizeServ │ │ModelsService│ │DatasetsServ │ │ConnectorServ│ │FinetuneServ │
│  ├─────────────┤ ├─────────────┤ ├─────────────┤ ├─────────────┤ ├─────────────┤
│  │• tokenize() │ │• list()     │ │• create()   │ │• create()   │ │• create()   │
│  │• detokenize │ │• get()      │ │• list()     │ │• list()     │ │• list()     │
│  │• count_toks │ │• list_all() │ │• get()      │ │• get()      │ │• get()      │
│  │             │ │             │ │• delete()   │ │• update()   │ │• update()   │
│  │             │ │             │ │• get_usage()│ │• delete()   │ │• delete()   │
│  │             │ │             │ │             │ │• authorize()│ │• get_events │
│  │             │ │             │ │             │ │             │ │• get_metrics│
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Transport Layer Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     TRANSPORT LAYER COMPONENTS                           │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      HttpTransport                                 │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐  │  │
│  │  │  RequestBuilder  │  │ ResponseHandler  │  │   SSE Parser    │  │  │
│  │  ├──────────────────┤  ├──────────────────┤  ├─────────────────┤  │  │
│  │  │ • method()       │  │ • parse_json()   │  │ • parse()       │  │  │
│  │  │ • path()         │  │ • parse_error()  │  │ • parse_event() │  │  │
│  │  │ • query()        │  │ • handle()       │  │ • event_stream()│  │  │
│  │  │ • json()         │  │                  │  │                 │  │  │
│  │  │ • multipart()    │  │                  │  │                 │  │  │
│  │  │ • build()        │  │                  │  │                 │  │  │
│  │  └──────────────────┘  └──────────────────┘  └─────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                      │                                   │
│                                      ▼                                   │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      AuthProvider                                  │  │
│  │  ┌──────────────────────────────────────────────────────────────┐ │  │
│  │  │                   BearerTokenAuth                             │ │  │
│  │  │  • authenticate(request) -> Result<Request, AuthError>       │ │  │
│  │  │  • validate() -> Result<(), AuthError>                       │ │  │
│  │  │  • auth_type() -> "bearer_token"                             │ │  │
│  │  └──────────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Resilience Layer Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     RESILIENCE LAYER COMPONENTS                          │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                   ResilienceOrchestrator                           │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │  execute<T, F>(operation, context) -> Result<T, Error>      │  │  │
│  │  │                                                              │  │  │
│  │  │  Pipeline:                                                   │  │  │
│  │  │  1. Check circuit breaker state                              │  │  │
│  │  │  2. Acquire rate limit permit                                │  │  │
│  │  │  3. Execute with retry wrapper                               │  │  │
│  │  │  4. Update circuit breaker on result                         │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                      │                                   │
│           ┌──────────────────────────┼──────────────────────────┐       │
│           ▼                          ▼                          ▼       │
│  ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐ │
│  │  RetryExecutor  │      │ CircuitBreaker  │      │   RateLimiter   │ │
│  │  (from primitive)│      │ (from primitive)│      │ (from primitive)│ │
│  ├─────────────────┤      ├─────────────────┤      ├─────────────────┤ │
│  │• Exponential    │      │ States:         │      │ Strategies:     │ │
│  │  backoff        │      │ • Closed        │      │ • Token Bucket  │ │
│  │• Jitter         │      │ • Open          │      │ • Sliding Window│ │
│  │• Retryable      │      │ • Half-Open     │      │ • Fixed Window  │ │
│  │  status codes   │      │                 │      │                 │ │
│  └─────────────────┘      └─────────────────┘      └─────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Rust Crate Architecture

### 6.1 Crate Structure

```
integrations-cohere/
├── Cargo.toml
├── README.md
├── src/
│   ├── lib.rs                      # Public API exports
│   │
│   ├── client/
│   │   ├── mod.rs                  # Client module
│   │   ├── builder.rs              # Client builder pattern
│   │   └── context.rs              # Service context
│   │
│   ├── config/
│   │   ├── mod.rs                  # Configuration module
│   │   ├── types.rs                # Config type definitions
│   │   ├── builder.rs              # Config builder
│   │   └── validation.rs           # Config validation
│   │
│   ├── error/
│   │   ├── mod.rs                  # Error module
│   │   ├── types.rs                # Error type definitions
│   │   └── conversion.rs           # Error conversions
│   │
│   ├── transport/
│   │   ├── mod.rs                  # Transport module
│   │   ├── http.rs                 # HTTP transport implementation
│   │   ├── request.rs              # Request builder
│   │   ├── response.rs             # Response handler
│   │   └── tls.rs                  # TLS configuration
│   │
│   ├── auth/
│   │   ├── mod.rs                  # Auth module
│   │   └── bearer.rs               # Bearer token auth
│   │
│   ├── resilience/
│   │   ├── mod.rs                  # Resilience module
│   │   └── orchestrator.rs         # Resilience orchestrator
│   │
│   ├── streaming/
│   │   ├── mod.rs                  # Streaming module
│   │   ├── sse.rs                  # SSE parser
│   │   ├── events.rs               # Event type definitions
│   │   └── collector.rs            # Stream collector
│   │
│   ├── services/
│   │   ├── mod.rs                  # Services module
│   │   ├── chat/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs          # Chat service implementation
│   │   │   ├── types.rs            # Chat types
│   │   │   └── streaming.rs        # Chat streaming
│   │   ├── generate/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs
│   │   │   └── types.rs
│   │   ├── embed/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs
│   │   │   └── types.rs
│   │   ├── rerank/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs
│   │   │   └── types.rs
│   │   ├── classify/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs
│   │   │   └── types.rs
│   │   ├── summarize/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs
│   │   │   └── types.rs
│   │   ├── tokenize/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs
│   │   │   └── types.rs
│   │   ├── models/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs
│   │   │   └── types.rs
│   │   ├── datasets/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs
│   │   │   └── types.rs
│   │   ├── connectors/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs
│   │   │   └── types.rs
│   │   └── finetune/
│   │       ├── mod.rs
│   │       ├── service.rs
│   │       └── types.rs
│   │
│   └── types/
│       ├── mod.rs                  # Shared types module
│       ├── common.rs               # Common types
│       ├── api.rs                  # API response types
│       └── meta.rs                 # Metadata types
│
├── tests/
│   ├── unit/
│   │   ├── mod.rs
│   │   ├── client_test.rs
│   │   ├── config_test.rs
│   │   ├── chat_test.rs
│   │   ├── embed_test.rs
│   │   └── ...
│   ├── integration/
│   │   ├── mod.rs
│   │   ├── pipeline_test.rs
│   │   └── streaming_test.rs
│   └── contract/
│       ├── mod.rs
│       └── api_contract_test.rs
│
├── benches/
│   ├── throughput.rs
│   └── latency.rs
│
└── examples/
    ├── chat.rs
    ├── streaming.rs
    ├── embeddings.rs
    ├── rag.rs
    └── finetuning.rs
```

### 6.2 Cargo.toml Dependencies

```toml
[package]
name = "integrations-cohere"
version = "0.1.0"
edition = "2021"
rust-version = "1.75"
description = "Cohere AI integration for the LLM-Dev-Ops Integration Repository"
license = "SEE LICENSE"
repository = "https://github.com/org/integrations"

[features]
default = ["rustls-tls"]
rustls-tls = ["reqwest/rustls-tls"]
native-tls = ["reqwest/native-tls"]

[dependencies]
# Integration Primitives (internal)
integrations-errors = { path = "../integrations-errors" }
integrations-retry = { path = "../integrations-retry" }
integrations-circuit-breaker = { path = "../integrations-circuit-breaker" }
integrations-rate-limit = { path = "../integrations-rate-limit" }
integrations-tracing = { path = "../integrations-tracing" }
integrations-logging = { path = "../integrations-logging" }
integrations-types = { path = "../integrations-types" }
integrations-config = { path = "../integrations-config" }

# Async runtime
tokio = { version = "1.35", features = ["rt-multi-thread", "macros", "time"] }
futures = "0.3"
async-stream = "0.3"

# HTTP client
reqwest = { version = "0.11", default-features = false, features = ["json", "stream"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Security
secrecy = { version = "0.8", features = ["serde"] }

# Utilities
thiserror = "1.0"
url = "2.5"
bytes = "1.5"
pin-project-lite = "0.2"

# Tracing
tracing = "0.1"

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.12"
wiremock = "0.5"
criterion = { version = "0.5", features = ["async_tokio"] }
test-log = { version = "0.2", features = ["trace"] }

[[bench]]
name = "throughput"
harness = false

[[bench]]
name = "latency"
harness = false
```

### 6.3 Module Visibility

```rust
// src/lib.rs - Public API

// Re-export primary types
pub use client::{CohereClient, CohereClientBuilder};
pub use config::{CohereConfig, CohereConfigBuilder};
pub use error::CohereError;

// Re-export service traits and types
pub mod chat {
    pub use crate::services::chat::{
        ChatService, ChatRequest, ChatResponse,
        ChatMessage, ChatRole, Tool, ToolCall,
        Citation, Document, Connector,
    };
}

pub mod generate {
    pub use crate::services::generate::{
        GenerateService, GenerateRequest, GenerateResponse,
        Generation,
    };
}

pub mod embed {
    pub use crate::services::embed::{
        EmbedService, EmbedRequest, EmbedResponse,
        EmbeddingType, InputType,
    };
}

pub mod rerank {
    pub use crate::services::rerank::{
        RerankService, RerankRequest, RerankResponse,
        RerankResult, RerankDocument,
    };
}

pub mod classify {
    pub use crate::services::classify::{
        ClassifyService, ClassifyRequest, ClassifyResponse,
        Classification, ClassifyExample,
    };
}

pub mod summarize {
    pub use crate::services::summarize::{
        SummarizeService, SummarizeRequest, SummarizeResponse,
        SummarizeLength, SummarizeFormat,
    };
}

pub mod tokenize {
    pub use crate::services::tokenize::{
        TokenizeService, TokenizeRequest, TokenizeResponse,
        DetokenizeRequest, DetokenizeResponse,
    };
}

pub mod models {
    pub use crate::services::models::{
        ModelsService, Model, ListModelsRequest, ListModelsResponse,
    };
}

pub mod datasets {
    pub use crate::services::datasets::{
        DatasetsService, Dataset, CreateDatasetRequest,
        DatasetType, ValidationStatus,
    };
}

pub mod connectors {
    pub use crate::services::connectors::{
        ConnectorsService, Connector, CreateConnectorRequest,
        UpdateConnectorRequest, OAuthConfig,
    };
}

pub mod finetune {
    pub use crate::services::finetune::{
        FinetuneService, FineTunedModel, CreateFinetuneRequest,
        FinetuneStatus, Hyperparameters,
    };
}

// Re-export streaming types
pub mod streaming {
    pub use crate::streaming::{
        CohereStreamEvent, EventStream, StreamCollector,
    };
}

// Internal modules (not exported)
mod transport;
mod auth;
mod resilience;
```

---

## 7. TypeScript Package Architecture

### 7.1 Package Structure

```
packages/integrations-cohere/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── README.md
├── src/
│   ├── index.ts                    # Public exports
│   │
│   ├── client/
│   │   ├── index.ts
│   │   ├── client.ts               # CohereClient
│   │   ├── builder.ts              # Client builder
│   │   └── context.ts              # Service context
│   │
│   ├── config/
│   │   ├── index.ts
│   │   ├── types.ts                # Config types
│   │   ├── builder.ts              # Config builder
│   │   └── validation.ts           # Config validation
│   │
│   ├── errors/
│   │   ├── index.ts
│   │   ├── types.ts                # Error types
│   │   └── conversion.ts           # Error conversions
│   │
│   ├── transport/
│   │   ├── index.ts
│   │   ├── http.ts                 # HTTP transport
│   │   ├── request.ts              # Request builder
│   │   ├── response.ts             # Response handler
│   │   └── types.ts                # Transport types
│   │
│   ├── auth/
│   │   ├── index.ts
│   │   └── bearer.ts               # Bearer token auth
│   │
│   ├── resilience/
│   │   ├── index.ts
│   │   └── orchestrator.ts         # Resilience orchestrator
│   │
│   ├── streaming/
│   │   ├── index.ts
│   │   ├── sse.ts                  # SSE parser
│   │   ├── events.ts               # Event types
│   │   └── collector.ts            # Stream collector
│   │
│   ├── services/
│   │   ├── index.ts
│   │   ├── chat/
│   │   │   ├── index.ts
│   │   │   ├── service.ts
│   │   │   ├── types.ts
│   │   │   └── streaming.ts
│   │   ├── generate/
│   │   │   ├── index.ts
│   │   │   ├── service.ts
│   │   │   └── types.ts
│   │   ├── embed/
│   │   │   ├── index.ts
│   │   │   ├── service.ts
│   │   │   └── types.ts
│   │   ├── rerank/
│   │   │   ├── index.ts
│   │   │   ├── service.ts
│   │   │   └── types.ts
│   │   ├── classify/
│   │   │   ├── index.ts
│   │   │   ├── service.ts
│   │   │   └── types.ts
│   │   ├── summarize/
│   │   │   ├── index.ts
│   │   │   ├── service.ts
│   │   │   └── types.ts
│   │   ├── tokenize/
│   │   │   ├── index.ts
│   │   │   ├── service.ts
│   │   │   └── types.ts
│   │   ├── models/
│   │   │   ├── index.ts
│   │   │   ├── service.ts
│   │   │   └── types.ts
│   │   ├── datasets/
│   │   │   ├── index.ts
│   │   │   ├── service.ts
│   │   │   └── types.ts
│   │   ├── connectors/
│   │   │   ├── index.ts
│   │   │   ├── service.ts
│   │   │   └── types.ts
│   │   └── finetune/
│   │       ├── index.ts
│   │       ├── service.ts
│   │       └── types.ts
│   │
│   └── types/
│       ├── index.ts
│       ├── common.ts
│       ├── api.ts
│       └── meta.ts
│
├── tests/
│   ├── unit/
│   │   ├── client.test.ts
│   │   ├── config.test.ts
│   │   ├── chat.test.ts
│   │   ├── embed.test.ts
│   │   └── ...
│   ├── integration/
│   │   ├── pipeline.test.ts
│   │   └── streaming.test.ts
│   └── contract/
│       └── api-contract.test.ts
│
└── examples/
    ├── chat.ts
    ├── streaming.ts
    ├── embeddings.ts
    ├── rag.ts
    └── finetuning.ts
```

### 7.2 Package.json

```json
{
  "name": "@integrations/cohere",
  "version": "0.1.0",
  "description": "Cohere AI integration for the LLM-Dev-Ops Integration Repository",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./chat": {
      "import": "./dist/services/chat/index.mjs",
      "require": "./dist/services/chat/index.js",
      "types": "./dist/services/chat/index.d.ts"
    },
    "./embed": {
      "import": "./dist/services/embed/index.mjs",
      "require": "./dist/services/embed/index.js",
      "types": "./dist/services/embed/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@integrations/errors": "workspace:*",
    "@integrations/retry": "workspace:*",
    "@integrations/circuit-breaker": "workspace:*",
    "@integrations/rate-limit": "workspace:*",
    "@integrations/tracing": "workspace:*",
    "@integrations/logging": "workspace:*",
    "@integrations/types": "workspace:*",
    "@integrations/config": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "tsup": "^8.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "eslint": "^8.55.0",
    "nock": "^13.4.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "files": [
    "dist",
    "README.md"
  ]
}
```

### 7.3 TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### 7.4 Public Exports

```typescript
// src/index.ts

// Main client
export { CohereClient, CohereClientBuilder } from './client';
export { CohereConfig, CohereConfigBuilder } from './config';
export { CohereError, CohereErrorType } from './errors';

// Service types
export type {
  ChatService,
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ChatRole,
  Tool,
  ToolCall,
  Citation,
  Document,
  Connector,
} from './services/chat';

export type {
  GenerateService,
  GenerateRequest,
  GenerateResponse,
  Generation,
} from './services/generate';

export type {
  EmbedService,
  EmbedRequest,
  EmbedResponse,
  EmbeddingType,
  InputType,
} from './services/embed';

export type {
  RerankService,
  RerankRequest,
  RerankResponse,
  RerankResult,
  RerankDocument,
} from './services/rerank';

export type {
  ClassifyService,
  ClassifyRequest,
  ClassifyResponse,
  Classification,
  ClassifyExample,
} from './services/classify';

export type {
  SummarizeService,
  SummarizeRequest,
  SummarizeResponse,
  SummarizeLength,
  SummarizeFormat,
} from './services/summarize';

export type {
  TokenizeService,
  TokenizeRequest,
  TokenizeResponse,
  DetokenizeRequest,
  DetokenizeResponse,
} from './services/tokenize';

export type {
  ModelsService,
  Model,
  ListModelsRequest,
  ListModelsResponse,
} from './services/models';

export type {
  DatasetsService,
  Dataset,
  CreateDatasetRequest,
  DatasetType,
  ValidationStatus,
} from './services/datasets';

export type {
  ConnectorsService,
  Connector as ConnectorConfig,
  CreateConnectorRequest,
  UpdateConnectorRequest,
  OAuthConfig,
} from './services/connectors';

export type {
  FinetuneService,
  FineTunedModel,
  CreateFinetuneRequest,
  FinetuneStatus,
  Hyperparameters,
} from './services/finetune';

// Streaming types
export type {
  CohereStreamEvent,
  EventStream,
  StreamCollector,
} from './streaming';
```

---

## Summary

This document covers the foundational architecture for the Cohere integration module:

1. **Design Principles**: SOLID, Hexagonal Architecture, London-School TDD
2. **C4 Context**: System boundaries and external dependencies
3. **C4 Container**: Major components and their responsibilities
4. **C4 Component**: Detailed service and infrastructure components
5. **Rust Architecture**: Complete crate structure with module organization
6. **TypeScript Architecture**: Package structure with modern TypeScript patterns

---

**Next Document:** `architecture-cohere-2.md` - Data Flow, Concurrency, Error Propagation

---

*Architecture Phase: Part 1 of 3 Complete*
