# Architecture: Ollama Integration Module

## SPARC Phase 2: Architecture

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/ollama`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Design Principles](#2-design-principles)
3. [C4 Model Diagrams](#3-c4-model-diagrams)
4. [Module Structure](#4-module-structure)
5. [Component Design](#5-component-design)
6. [Data Flow](#6-data-flow)
7. [Simulation Layer](#7-simulation-layer)
8. [Deployment Considerations](#8-deployment-considerations)

---

## 1. Architecture Overview

### 1.1 System Context

The Ollama integration module provides a thin adapter layer connecting LLM Dev Ops applications to a locally running Ollama runtime. It prioritizes minimal overhead, local-first workflows, and developer experience.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Application Layer                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   CLI App   │  │  Dev Tools  │  │   Testing Harness       │ │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘ │
└─────────┼────────────────┼──────────────────────┼───────────────┘
          │                │                      │
          └────────────────┼──────────────────────┘
                           │
          ┌────────────────▼────────────────┐
          │       Ollama Integration        │
          │  ┌──────────────────────────┐  │
          │  │      OllamaClient        │  │
          │  │  ┌─────┐ ┌─────┐ ┌────┐  │  │
          │  │  │Chat │ │ Gen │ │Emb │  │  │
          │  │  └─────┘ └─────┘ └────┘  │  │
          │  └──────────────────────────┘  │
          │         │                      │
          │  ┌──────▼──────────────────┐  │
          │  │   Simulation Layer      │  │
          │  │ (Record/Replay Mode)    │  │
          │  └─────────────────────────┘  │
          │         │                      │
          │  ┌──────▼──────────────────┐  │
          │  │   Shared Primitives     │  │
          │  │  logging│tracing│errors │  │
          │  └─────────────────────────┘  │
          └────────────────┬───────────────┘
                           │
          ┌────────────────▼────────────────┐
          │        Ollama Runtime           │
          │     localhost:11434             │
          │  ┌──────┐ ┌──────┐ ┌──────┐    │
          │  │Model │ │Model │ │Model │    │
          │  │ A    │ │ B    │ │ C    │    │
          │  └──────┘ └──────┘ └──────┘    │
          └─────────────────────────────────┘
```

### 1.2 Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Pattern | Thin Adapter | Minimal overhead, no business logic |
| Transport | HTTP (localhost) | Native Ollama protocol |
| Streaming | NDJSON | Ollama API standard |
| Auth | Optional | Local use typically unauthenticated |
| Error Strategy | Typed hierarchy | Clear error handling |
| Configuration | Builder pattern | Fluent, validated |
| Testing | Simulation layer | Record/replay for CI/CD |

### 1.3 Thin Adapter Principles

This module explicitly avoids:
- Business logic implementation
- Infrastructure duplication
- Deployment orchestration
- Authentication systems (uses shared)
- Logging systems (uses shared)
- Metrics systems (uses shared)

This module only provides:
- Type-safe API bindings
- Request/response serialization
- Stream handling (NDJSON)
- Connection management
- Error mapping
- Simulation/replay capability

---

## 2. Design Principles

### 2.1 SOLID Principles Application

```
┌─────────────────────────────────────────────────────────────┐
│                    Responsibility Mapping                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  OllamaClient      → Client lifecycle, service access        │
│  ChatService       → Chat completions only                   │
│  GenerateService   → Text generation only                    │
│  EmbeddingsService → Embeddings only                         │
│  ModelsService     → Model management only                   │
│  HttpTransport     → HTTP communication only                 │
│  SimulationLayer   → Record/replay only                      │
│  NdjsonParser      → Stream parsing only                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Extension Points

```
┌─────────────────────────────────────────────────────────────┐
│                    Extension Points                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  trait HttpTransport    → Custom transport implementations   │
│       ├── HttpTransportImpl (default)                        │
│       ├── MockHttpTransport (testing)                        │
│       └── SimulatedTransport (replay)                        │
│                                                              │
│  trait RecordStorage    → Custom recording storage           │
│       ├── MemoryStorage (default)                            │
│       └── FileStorage (persistent)                           │
│                                                              │
│  Configuration          → Builder extension                  │
│       └── Custom headers, timeouts, endpoints                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Hexagonal Architecture (Simplified)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Thin Adapter Architecture                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                          ┌─────────────┐                            │
│    ┌─────────────────────│   SERVICES  │─────────────────────┐      │
│    │                     │             │                     │      │
│    │  ┌──────────────────┴─────────────┴──────────────────┐  │      │
│    │  │                                                   │  │      │
│    │  │  ┌─────────────┐  ┌─────────────┐  ┌──────────┐  │  │      │
│    │  │  │ChatService  │  │GenerateServ │  │EmbedServ │  │  │      │
│    │  │  └─────────────┘  └─────────────┘  └──────────┘  │  │      │
│    │  │                                                   │  │      │
│    │  │  Request validation → Serialization → Response    │  │      │
│    │  │                                                   │  │      │
│    │  └───────────────────────────────────────────────────┘  │      │
│    │                          │                              │      │
│    │         ┌────────────────┼────────────────┐             │      │
│    │         │                │                │             │      │
│    │         ▼                ▼                ▼             │      │
│    │  ┌──────────┐     ┌──────────┐     ┌──────────┐        │      │
│    │  │   PORT   │     │   PORT   │     │   PORT   │        │      │
│    │  │Transport │     │Simulation│     │Observ.  │        │      │
│    │  └────┬─────┘     └────┬─────┘     └────┬─────┘        │      │
│    │       │                │                │               │      │
│    └───────┼────────────────┼────────────────┼───────────────┘      │
│            │                │                │                       │
│            ▼                ▼                ▼                       │
│     ┌──────────┐     ┌──────────┐     ┌──────────────┐              │
│     │ ADAPTER  │     │ ADAPTER  │     │   ADAPTER    │              │
│     │HTTP/Local│     │ Record/  │     │  Primitives  │              │
│     │          │     │ Replay   │     │              │              │
│     └────┬─────┘     └──────────┘     └──────────────┘              │
│          │                                                           │
│          ▼                                                           │
│   ┌────────────┐                                                    │
│   │  Ollama    │                                                    │
│   │  Runtime   │                                                    │
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
│                                │                                     │
│                         Uses   │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │              Development Application                         │   │
│  │                [Software System]                             │   │
│  │                                                              │   │
│  │   Uses Ollama for local LLM inference during development    │   │
│  │                                                              │   │
│  └─────────────────────────────┬───────────────────────────────┘   │
│                                │                                     │
│                         Uses   │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │                Ollama Integration Module                     │   │
│  │                  [Software System]                           │   │
│  │                                                              │   │
│  │   Thin adapter for local Ollama runtime                     │   │
│  │                                                              │   │
│  └─────────────────────────────┬───────────────────────────────┘   │
│                                │                                     │
│             HTTP (localhost)   │                                     │
│                                ▼                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │                    Ollama Runtime                            │   │
│  │                  [Local System]                              │   │
│  │                                                              │   │
│  │   Local LLM inference engine running on developer machine   │   │
│  │                                                              │   │
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
│  │                  Ollama Integration Module                   │   │
│  │                                                              │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │                   Rust Crate                         │    │   │
│  │  │                  [Container]                         │    │   │
│  │  │                                                      │    │   │
│  │  │  Primary implementation in Rust                      │    │   │
│  │  │  Async runtime: tokio                                │    │   │
│  │  │  HTTP client: reqwest                                │    │   │
│  │  │                                                      │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  │                                                              │   │
│  │  ┌─────────────────────────────────────────────────────┐    │   │
│  │  │                TypeScript Package                    │    │   │
│  │  │                  [Container]                         │    │   │
│  │  │                                                      │    │   │
│  │  │  TypeScript/JavaScript implementation                │    │   │
│  │  │  Runtime: Node.js / Browser                          │    │   │
│  │  │  HTTP client: fetch / axios                          │    │   │
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
│  │  │  errors, retry, tracing, logging, types, config      │    │   │
│  │  │                                                      │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  │                                                              │   │
│  └──────────────────────────────┬──────────────────────────────┘   │
│                                 │                                    │
│                    HTTP         │                                    │
│                                 ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      Ollama Runtime                          │   │
│  │                    [Local Service]                           │   │
│  │                                                              │   │
│  │  Base URL: http://localhost:11434                           │   │
│  │  Format: JSON / NDJSON (streaming)                          │   │
│  │  Auth: None (local) or Bearer (proxied)                     │   │
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
│  │   │  │ OllamaClient  │  │    OllamaClientBuilder       │    │ │  │
│  │   │  │  [Component]  │  │       [Component]            │    │ │  │
│  │   │  └───────┬───────┘  └──────────────────────────────┘    │ │  │
│  │   └──────────┼──────────────────────────────────────────────┘ │  │
│  │              │                                                 │  │
│  │              │ owns                                            │  │
│  │              ▼                                                 │  │
│  │   ┌─────────────────────────────────────────────────────────┐ │  │
│  │   │                     SERVICES                             │ │  │
│  │   │  ┌────────────┐  ┌────────────┐  ┌────────────────┐     │ │  │
│  │   │  │ChatService │  │GenerateSrv │  │EmbeddingsServ  │     │ │  │
│  │   │  │[Component] │  │[Component] │  │  [Component]   │     │ │  │
│  │   │  └─────┬──────┘  └─────┬──────┘  └───────┬────────┘     │ │  │
│  │   │        │               │                 │               │ │  │
│  │   │  ┌─────┴───────────────┴─────────────────┴──────┐       │ │  │
│  │   │  │             ModelsService [Component]         │       │ │  │
│  │   │  └───────────────────────────────────────────────┘       │ │  │
│  │   └─────────────────────────┬───────────────────────────────┘ │  │
│  │                             │                                  │  │
│  │                             │ uses                             │  │
│  │                             ▼                                  │  │
│  │   ┌─────────────────────────────────────────────────────────┐ │  │
│  │   │                   INFRASTRUCTURE                         │ │  │
│  │   │                                                          │ │  │
│  │   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │ │  │
│  │   │  │HttpTransport │  │ Simulation   │  │ NdjsonParser │   │ │  │
│  │   │  │   [Port]     │  │   [Port]     │  │ [Component]  │   │ │  │
│  │   │  └──────┬───────┘  └──────┬───────┘  └──────────────┘   │ │  │
│  │   │         │                 │                              │ │  │
│  │   │         ▼                 ▼                              │ │  │
│  │   │  ┌──────────────┐  ┌──────────────┐                     │ │  │
│  │   │  │HttpTransImpl │  │RecordReplay  │                     │ │  │
│  │   │  │  [Adapter]   │  │  [Adapter]   │                     │ │  │
│  │   │  └──────────────┘  └──────────────┘                     │ │  │
│  │   │                                                          │ │  │
│  │   └─────────────────────────────────────────────────────────┘ │  │
│  │                                                                │  │
│  │   ┌─────────────────────────────────────────────────────────┐ │  │
│  │   │                      TYPES                               │ │  │
│  │   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐    │ │  │
│  │   │  │  Chat   │ │Generate │ │Embedding│ │   Errors    │    │ │  │
│  │   │  │ Types   │ │  Types  │ │  Types  │ │   Types     │    │ │  │
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
ollama/
├── Cargo.toml                      # Package manifest
├── src/
│   ├── lib.rs                      # Crate root, public exports
│   │
│   ├── client.rs                   # OllamaClient, OllamaClientBuilder
│   ├── config.rs                   # OllamaConfig
│   ├── error.rs                    # OllamaError, OllamaResult
│   │
│   ├── services/
│   │   ├── mod.rs                  # Service exports
│   │   ├── chat.rs                 # ChatService
│   │   ├── generate.rs             # GenerateService
│   │   ├── embeddings.rs           # EmbeddingsService
│   │   └── models.rs               # ModelsService
│   │
│   ├── types/
│   │   ├── mod.rs                  # Type exports
│   │   ├── chat.rs                 # Chat request/response types
│   │   ├── generate.rs             # Generate request/response types
│   │   ├── embeddings.rs           # Embeddings types
│   │   ├── models.rs               # Model types
│   │   └── options.rs              # ModelOptions
│   │
│   ├── transport/
│   │   ├── mod.rs                  # Transport trait and exports
│   │   ├── http.rs                 # HttpTransportImpl
│   │   └── streaming.rs            # NdjsonParser, stream types
│   │
│   ├── simulation/
│   │   ├── mod.rs                  # Simulation exports
│   │   ├── recorder.rs             # Recording mode
│   │   ├── replayer.rs             # Replay mode
│   │   └── storage.rs              # MemoryStorage, FileStorage
│   │
│   └── observability/
│       └── mod.rs                  # Tracing utilities (delegates to primitive)
│
├── tests/
│   ├── common/
│   │   ├── mod.rs                  # Test utilities
│   │   ├── mocks.rs                # Mock implementations
│   │   └── fixtures.rs             # Test fixtures
│   │
│   ├── unit/
│   │   ├── chat_test.rs            # Chat service unit tests
│   │   ├── generate_test.rs        # Generate service unit tests
│   │   ├── embeddings_test.rs      # Embeddings unit tests
│   │   ├── models_test.rs          # Models service unit tests
│   │   ├── streaming_test.rs       # NDJSON parser tests
│   │   └── simulation_test.rs      # Simulation layer tests
│   │
│   └── integration/
│       ├── chat_integration.rs     # Chat integration tests
│       └── client_integration.rs   # Client integration tests
│
└── examples/
    ├── basic_chat.rs               # Basic chat example
    ├── streaming_chat.rs           # Streaming example
    ├── generate.rs                 # Text generation example
    ├── embeddings.rs               # Embeddings example
    ├── model_switching.rs          # Model switching example
    └── simulation.rs               # Record/replay example
```

### 4.2 TypeScript Package Layout

```
ollama/
├── package.json                    # Package manifest
├── tsconfig.json                   # TypeScript config
│
├── src/
│   ├── index.ts                    # Package exports
│   │
│   ├── client.ts                   # OllamaClient, OllamaClientBuilder
│   ├── config.ts                   # OllamaConfig
│   ├── errors.ts                   # OllamaError classes
│   │
│   ├── services/
│   │   ├── index.ts                # Service exports
│   │   ├── chat.ts                 # ChatService
│   │   ├── generate.ts             # GenerateService
│   │   ├── embeddings.ts           # EmbeddingsService
│   │   └── models.ts               # ModelsService
│   │
│   ├── types/
│   │   ├── index.ts                # Type exports
│   │   ├── chat.ts                 # Chat types
│   │   ├── generate.ts             # Generate types
│   │   ├── embeddings.ts           # Embeddings types
│   │   ├── models.ts               # Model types
│   │   └── options.ts              # ModelOptions
│   │
│   ├── transport/
│   │   ├── index.ts                # Transport exports
│   │   ├── http.ts                 # HttpTransport implementation
│   │   └── streaming.ts            # NDJSON parser, stream types
│   │
│   └── simulation/
│       ├── index.ts                # Simulation exports
│       ├── recorder.ts             # Recording mode
│       ├── replayer.ts             # Replay mode
│       └── storage.ts              # Storage implementations
│
├── tests/
│   ├── helpers/
│   │   ├── mocks.ts                # Mock implementations
│   │   └── fixtures.ts             # Test fixtures
│   │
│   ├── unit/
│   │   ├── chat.test.ts            # Chat service tests
│   │   ├── generate.test.ts        # Generate service tests
│   │   ├── streaming.test.ts       # NDJSON parser tests
│   │   └── simulation.test.ts      # Simulation tests
│   │
│   └── integration/
│       └── client.integration.ts   # Client integration tests
│
└── examples/
    ├── basic-chat.ts               # Basic usage
    ├── streaming.ts                # Streaming example
    ├── model-switching.ts          # Model switching
    └── simulation.ts               # Record/replay example
```

### 4.3 Cargo.toml Configuration

```toml
[package]
name = "ollama"
version = "0.1.0"
edition = "2021"
authors = ["LLM-Dev-Ops Team"]
description = "Ollama API client for local LLM inference"
license = "MIT OR Apache-2.0"
repository = "https://github.com/LLM-Dev-Ops/integrations"
readme = "README.md"
keywords = ["ollama", "llm", "ai", "local", "async"]
categories = ["api-bindings", "asynchronous"]

[features]
default = []
simulation = []  # Enable simulation/replay features

[dependencies]
# Async runtime
tokio = { version = "1.0", features = ["rt-multi-thread", "macros", "time", "fs"] }
futures = "0.3"
async-stream = "0.3"

# HTTP client
reqwest = { version = "0.11", default-features = false, features = ["json", "stream"] }

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Error handling
thiserror = "1.0"

# Observability (delegates to primitives)
tracing = "0.1"

# Shared primitives (workspace dependencies)
primitives-errors = { path = "../primitives/errors" }
primitives-retry = { path = "../primitives/retry" }
primitives-tracing = { path = "../primitives/tracing" }
primitives-logging = { path = "../primitives/logging" }
primitives-types = { path = "../primitives/types" }
primitives-config = { path = "../primitives/config" }

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.11"
wiremock = "0.5"
tempfile = "3.0"
```

---

## 5. Component Design

### 5.1 Service Component Details

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SERVICE COMPONENT DETAILS                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      ChatService                             │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │                                                              │    │
│  │  Responsibilities:                                           │    │
│  │    • Chat completion requests (sync)                         │    │
│  │    • Streaming chat completions (NDJSON)                     │    │
│  │    • Multi-turn conversation support                         │    │
│  │    • Image content handling                                  │    │
│  │                                                              │    │
│  │  Key Methods:                                                │    │
│  │    • create(ChatRequest) -> ChatResponse                    │    │
│  │    • create_stream(ChatRequest) -> Stream<ChatChunk>        │    │
│  │                                                              │    │
│  │  Endpoint: POST /api/chat                                    │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    GenerateService                           │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │                                                              │    │
│  │  Responsibilities:                                           │    │
│  │    • Raw text generation from prompts                        │    │
│  │    • Context continuation support                            │    │
│  │    • Template customization                                  │    │
│  │    • Raw mode (skip templating)                              │    │
│  │                                                              │    │
│  │  Key Methods:                                                │    │
│  │    • create(GenerateRequest) -> GenerateResponse            │    │
│  │    • create_stream(GenerateRequest) -> Stream<GenChunk>     │    │
│  │                                                              │    │
│  │  Endpoint: POST /api/generate                                │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   EmbeddingsService                          │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │                                                              │    │
│  │  Responsibilities:                                           │    │
│  │    • Generate embeddings for text                            │    │
│  │    • Support both single and batch requests                  │    │
│  │                                                              │    │
│  │  Key Methods:                                                │    │
│  │    • create(EmbeddingsRequest) -> EmbeddingsResponse        │    │
│  │    • create_batch(requests) -> Vec<EmbeddingsResponse>      │    │
│  │                                                              │    │
│  │  Endpoint: POST /api/embeddings                              │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     ModelsService                            │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │                                                              │    │
│  │  Responsibilities:                                           │    │
│  │    • List locally available models                           │    │
│  │    • Show model details                                      │    │
│  │    • Check running models                                    │    │
│  │    • Model availability checking                             │    │
│  │                                                              │    │
│  │  Key Methods:                                                │    │
│  │    • list() -> ModelList                                    │    │
│  │    • show(name) -> ModelInfo                                │    │
│  │    • running() -> RunningModelList                          │    │
│  │    • is_available(name) -> bool                             │    │
│  │                                                              │    │
│  │  Endpoints: GET /api/tags, POST /api/show, GET /api/ps      │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Transport Component

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TRANSPORT COMPONENT                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     HttpTransport                            │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │                                                              │    │
│  │  trait HttpTransport {                                       │    │
│  │      async fn send(&self, request) -> Result<Response>      │    │
│  │      async fn send_streaming(&self, request)                │    │
│  │          -> Result<Stream<Bytes>>                           │    │
│  │      async fn health(&self) -> Result<bool>                 │    │
│  │  }                                                           │    │
│  │                                                              │    │
│  │  HttpTransportImpl:                                          │    │
│  │    • Uses reqwest for HTTP                                   │    │
│  │    • Connection pooling via keep-alive                       │    │
│  │    • Configurable timeouts                                   │    │
│  │    • Optional auth header injection                          │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    NdjsonParser                              │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │                                                              │    │
│  │  Responsibilities:                                           │    │
│  │    • Parse newline-delimited JSON streams                    │    │
│  │    • Handle partial line buffering                           │    │
│  │    • Emit typed chunks                                       │    │
│  │    • Detect stream completion                                │    │
│  │                                                              │    │
│  │  Key Features:                                               │    │
│  │    • Zero-copy parsing where possible                        │    │
│  │    • Bounded memory usage                                    │    │
│  │    • Error recovery for malformed lines                      │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Data Flow

### 6.1 Synchronous Request Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SYNCHRONOUS REQUEST FLOW                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Application         OllamaClient        Service          Ollama   │
│       │                   │                  │                │     │
│       │──create()────────►│                  │                │     │
│       │                   │──chat()─────────►│                │     │
│       │                   │                  │                │     │
│       │                   │                  │──validate()    │     │
│       │                   │                  │                │     │
│       │                   │                  │──serialize()   │     │
│       │                   │                  │                │     │
│       │                   │                  │──POST /api/chat│     │
│       │                   │                  │───────────────►│     │
│       │                   │                  │                │     │
│       │                   │                  │◄──JSON response│     │
│       │                   │                  │                │     │
│       │                   │                  │──deserialize() │     │
│       │                   │                  │                │     │
│       │                   │◄─ChatResponse────│                │     │
│       │◄─Result──────────│                  │                │     │
│       │                   │                  │                │     │
│                                                                      │
│   Timing:                                                            │
│     • Client overhead: < 1ms                                        │
│     • Network: < 1ms (localhost)                                    │
│     • Inference: Model-dependent (100ms - 60s+)                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Streaming Request Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    STREAMING REQUEST FLOW                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Application       OllamaClient     Service       Parser   Ollama  │
│       │                 │               │            │         │    │
│       │──stream()──────►│               │            │         │    │
│       │                 │──chat()──────►│            │         │    │
│       │                 │               │──POST ─────────────►│    │
│       │                 │               │  stream:true        │    │
│       │                 │               │            │         │    │
│       │                 │               │◄─NDJSON line 1──────│    │
│       │                 │               │──parse()──►│         │    │
│       │                 │               │◄─ChatChunk─│         │    │
│       │◄─chunk 1────────│◄──────────────│            │         │    │
│       │                 │               │            │         │    │
│       │                 │               │◄─NDJSON line 2──────│    │
│       │◄─chunk 2────────│◄──────────────│◄───────────│         │    │
│       │                 │               │            │         │    │
│       │                 │               │◄─NDJSON final───────│    │
│       │◄─final chunk────│◄──────────────│◄───────────│         │    │
│       │  (done:true)    │               │            │         │    │
│       │                 │               │            │         │    │
│                                                                      │
│   NDJSON Format:                                                     │
│     {"model":"llama3","message":{"content":"Hello"},"done":false}   │
│     {"model":"llama3","message":{"content":" world"},"done":false}  │
│     {"model":"llama3","message":{"content":"!"},"done":true,...}    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.3 Error Handling Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ERROR HANDLING FLOW                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Error Source          Detection           Action                  │
│   ────────────          ─────────           ──────                  │
│                                                                      │
│   Server not running    Connection refused  Return ServerNotRunning │
│                                             with start hint          │
│                                                                      │
│   Model not found       404 response        Return ModelNotFound    │
│                                             with available models    │
│                                                                      │
│   Model loading         Timeout during      Return ModelLoading     │
│                         first request       with progress if avail   │
│                                                                      │
│   Invalid request       400 response        Return ValidationError  │
│                                             with details             │
│                                                                      │
│   Stream interrupted    Connection reset    Return StreamError      │
│                                             with partial content     │
│                                                                      │
│   Timeout               Request timeout     Return TimeoutError     │
│                                             with operation info      │
│                                                                      │
│   Retry Strategy:                                                   │
│     • ServerNotRunning: Retry 3x with 500ms initial backoff        │
│     • ModelLoading: Retry with longer timeout                       │
│     • StreamError: No retry (user should re-initiate)              │
│     • Others: No retry                                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Simulation Layer

### 7.1 Simulation Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SIMULATION ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    SimulationLayer                           │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │                                                              │    │
│  │  enum SimulationMode {                                       │    │
│  │      Disabled,                 // Pass through to Ollama    │    │
│  │      Recording { storage },    // Capture requests/responses │    │
│  │      Replay { source, timing } // Return recorded responses │    │
│  │  }                                                           │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      Recording Mode                          │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │                                                              │    │
│  │   Request ──► [Recorder] ──► Real Ollama                    │    │
│  │                   │              │                           │    │
│  │                   │              ▼                           │    │
│  │                   │          Response                        │    │
│  │                   │              │                           │    │
│  │                   ▼              │                           │    │
│  │              [Storage] ◄─────────┘                           │    │
│  │                   │                                          │    │
│  │                   ▼                                          │    │
│  │              Persist to memory/file                          │    │
│  │                                                              │    │
│  │  Recorded Data:                                              │    │
│  │    • Request (serialized)                                    │    │
│  │    • Response (serialized)                                   │    │
│  │    • Timing information                                      │    │
│  │    • Model used                                              │    │
│  │    • Timestamp                                               │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                       Replay Mode                            │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │                                                              │    │
│  │   Request ──► [Replayer] ──► Match recorded request         │    │
│  │                   │                                          │    │
│  │                   │                                          │    │
│  │                   ▼                                          │    │
│  │              [Storage] ──► Retrieve recorded response        │    │
│  │                   │                                          │    │
│  │                   ▼                                          │    │
│  │              Apply timing (optional)                         │    │
│  │                   │                                          │    │
│  │                   ▼                                          │    │
│  │              Return response                                 │    │
│  │                                                              │    │
│  │  Timing Modes:                                               │    │
│  │    • Instant: Return immediately                            │    │
│  │    • Realistic: Simulate original timing                    │    │
│  │    • Fixed: Use configured delay                            │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Recording Format

```
┌─────────────────────────────────────────────────────────────────────┐
│                    RECORDING FORMAT                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  struct Recording {                                                 │
│      version: String,             // "1.0"                         │
│      created_at: DateTime,                                          │
│      entries: Vec<RecordEntry>,                                     │
│  }                                                                  │
│                                                                      │
│  struct RecordEntry {                                               │
│      id: String,                  // UUID                          │
│      timestamp: DateTime,                                           │
│      operation: String,           // "chat", "generate", etc       │
│      model: String,                                                 │
│      request: Value,              // Serialized request            │
│      response: RecordedResponse,                                    │
│      timing: TimingInfo,                                            │
│  }                                                                  │
│                                                                      │
│  enum RecordedResponse {                                            │
│      Success { body: Value },                                       │
│      Stream { chunks: Vec<Value> },                                 │
│      Error { error: Value },                                        │
│  }                                                                  │
│                                                                      │
│  struct TimingInfo {                                                │
│      total_duration_ms: u64,                                        │
│      first_token_ms: Option<u64>,  // For streaming               │
│      chunk_timings: Option<Vec<u64>>,                               │
│  }                                                                  │
│                                                                      │
│  Example JSON:                                                      │
│  {                                                                  │
│    "version": "1.0",                                                │
│    "created_at": "2025-12-13T10:00:00Z",                           │
│    "entries": [{                                                    │
│      "id": "abc-123",                                               │
│      "timestamp": "2025-12-13T10:00:01Z",                          │
│      "operation": "chat",                                           │
│      "model": "llama3.2",                                           │
│      "request": { "messages": [...] },                             │
│      "response": { "Success": { "body": {...} } },                 │
│      "timing": { "total_duration_ms": 1250 }                       │
│    }]                                                               │
│  }                                                                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.3 Request Matching Strategy

```
┌─────────────────────────────────────────────────────────────────────┐
│                    REQUEST MATCHING                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Matching Criteria:                                                 │
│    1. Operation type (chat, generate, embeddings)                  │
│    2. Model name (exact match)                                      │
│    3. Request content (configurable)                                │
│                                                                      │
│  Matching Modes:                                                    │
│                                                                      │
│    Strict:                                                          │
│      - Exact match on all request fields                           │
│      - Best for regression testing                                  │
│                                                                      │
│    Relaxed:                                                         │
│      - Match operation and model only                               │
│      - Return first matching recording                              │
│      - Good for development iteration                               │
│                                                                      │
│    Sequence:                                                        │
│      - Return recordings in order received                          │
│      - Ignore request content                                       │
│      - Useful for scripted tests                                    │
│                                                                      │
│  No Match Behavior:                                                 │
│    - Return SimulationError::NoRecordingFound                      │
│    - Include request details for debugging                          │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. Deployment Considerations

### 8.1 Local Development Setup

```
┌─────────────────────────────────────────────────────────────────────┐
│                    LOCAL DEVELOPMENT                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Prerequisites:                                                     │
│    1. Install Ollama: https://ollama.ai                            │
│    2. Pull a model: `ollama pull llama3.2`                         │
│    3. Start server: `ollama serve` (or Ollama app)                 │
│                                                                      │
│  Integration Setup:                                                 │
│                                                                      │
│    // Rust                                                          │
│    let client = OllamaClient::builder()                            │
│        .build()?;  // Uses localhost:11434 by default              │
│                                                                      │
│    // TypeScript                                                    │
│    const client = new OllamaClient();                               │
│                                                                      │
│  Environment Variables:                                             │
│    OLLAMA_HOST=http://localhost:11434  // Override base URL        │
│    OLLAMA_MODEL=llama3.2               // Default model            │
│                                                                      │
│  Health Check:                                                      │
│    client.health()  // Returns Ok(true) if server running          │
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
│    # Record locally                                                 │
│    OLLAMA_SIMULATION=record cargo test                              │
│                                                                      │
│    # Commit recordings to repo                                      │
│    git add tests/recordings/                                        │
│                                                                      │
│    # CI uses replay mode                                            │
│    OLLAMA_SIMULATION=replay cargo test                              │
│                                                                      │
│  Benefits:                                                          │
│    - No Ollama required in CI                                       │
│    - Fast, deterministic tests                                      │
│    - Works offline                                                  │
│                                                                      │
│  ─────────────────────────────────────────                          │
│                                                                      │
│  Option 2: Real Ollama in CI                                        │
│  ─────────────────────────────────                                  │
│                                                                      │
│    # GitHub Actions example                                         │
│    - name: Setup Ollama                                             │
│      run: |                                                         │
│        curl -fsSL https://ollama.ai/install.sh | sh                │
│        ollama serve &                                               │
│        sleep 5                                                      │
│        ollama pull llama3.2:1b  # Smallest model                   │
│                                                                      │
│    - name: Run tests                                                │
│      run: cargo test                                                │
│                                                                      │
│  Considerations:                                                    │
│    - Slower (model download + inference)                            │
│    - Requires CI resources for inference                            │
│    - Non-deterministic timing                                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.3 Remote Ollama Configuration

```
┌─────────────────────────────────────────────────────────────────────┐
│                    REMOTE OLLAMA SETUP                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  For shared development servers or GPU clusters:                    │
│                                                                      │
│    let client = OllamaClient::builder()                            │
│        .base_url("http://gpu-server.internal:11434")               │
│        .auth_token(token)  // If proxied                           │
│        .timeout(Duration::from_secs(120))  // Longer for remote    │
│        .build()?;                                                   │
│                                                                      │
│  Security Considerations:                                           │
│    - Use HTTPS for remote connections                               │
│    - Consider VPN or SSH tunnel                                     │
│    - Add authentication via reverse proxy                           │
│    - Log warns when connecting to non-localhost                     │
│                                                                      │
│  Network Considerations:                                            │
│    - Increase timeouts for network latency                          │
│    - Consider retry config for transient failures                   │
│    - Streaming may be affected by network buffering                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-OLLAMA-ARCH-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Architecture Document**

*SPARC Phase 2 Complete - Proceed to Pseudocode phase with "Next phase."*
