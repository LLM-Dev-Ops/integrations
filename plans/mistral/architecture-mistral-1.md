# Architecture: Mistral Integration Module - Part 1

**System Overview, C4 Diagrams, and Module Structure**
**Version:** 1.0.0
**Date:** 2025-12-09
**Status:** COMPLETE

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Design Principles](#2-design-principles)
3. [C4 Model - Context Diagram](#3-c4-model---context-diagram)
4. [C4 Model - Container Diagram](#4-c4-model---container-diagram)
5. [C4 Model - Component Diagram](#5-c4-model---component-diagram)
6. [Module Structure - Rust](#6-module-structure---rust)
7. [Module Structure - TypeScript](#7-module-structure---typescript)

---

## 1. Executive Summary

The Mistral Integration Module provides a production-ready, type-safe client library for interacting with Mistral AI's API services. The architecture follows hexagonal design principles with clear separation between domain logic, infrastructure concerns, and external dependencies.

### Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Hexagonal Architecture | Isolates business logic from infrastructure, enables testing via mocks |
| Async-First Design | Non-blocking I/O for high throughput and efficient resource usage |
| Trait-Based Abstraction | Enables dependency injection and London-School TDD |
| Layered Error Handling | Rich error types with context preservation across boundaries |
| Primitive Integration | Leverages shared infrastructure (retry, circuit breaker, rate limiting) |

### Architecture Constraints

1. **No Cross-Provider Dependencies**: Must not depend on `integrations-openai`, `integrations-anthropic`, or other provider modules
2. **No Layer 0 Dependencies**: Must not depend on `ruvbase`
3. **Primitive-Only Dependencies**: May only depend on `integrations-*` primitives
4. **Dual-Language Parity**: Rust and TypeScript implementations must have equivalent APIs

---

## 2. Design Principles

### 2.1 SOLID Principles

```
┌─────────────────────────────────────────────────────────────────┐
│                      SOLID in Mistral Module                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  S - Single Responsibility                                       │
│      Each service handles one API domain (Chat, Files, etc.)    │
│      Transport layer only handles HTTP concerns                  │
│      Resilience layer only handles retry/circuit breaker         │
│                                                                  │
│  O - Open/Closed                                                 │
│      New endpoints added via new service implementations         │
│      Base traits remain stable                                   │
│      Extension through composition, not modification             │
│                                                                  │
│  L - Liskov Substitution                                         │
│      MockHttpTransport substitutes ReqwestTransport              │
│      MockChatService substitutes ChatServiceImpl                 │
│      All implementations honor trait contracts                   │
│                                                                  │
│  I - Interface Segregation                                       │
│      ChatService separate from FilesService                      │
│      AuthProvider separate from HttpTransport                    │
│      Fine-grained traits for specific capabilities               │
│                                                                  │
│  D - Dependency Inversion                                        │
│      High-level services depend on transport traits              │
│      Client depends on service traits, not implementations       │
│      Configuration injected, not hardcoded                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Hexagonal Architecture

```
                              ┌─────────────────────────────┐
                              │      Application Core       │
                              │                             │
      ┌───────────────┐       │  ┌───────────────────────┐  │       ┌───────────────┐
      │               │       │  │                       │  │       │               │
      │   Driving     │──────▶│  │   Domain Services     │  │◀──────│    Driven     │
      │   Adapters    │       │  │                       │  │       │    Adapters   │
      │               │       │  │  - ChatService        │  │       │               │
      │  - API Entry  │       │  │  - FilesService       │  │       │  - HTTP       │
      │  - Builder    │       │  │  - FineTuningService  │  │       │  - SSE        │
      │  - Config     │       │  │  - AgentsService      │  │       │  - Auth       │
      │               │       │  │  - BatchService       │  │       │  - Resilience │
      └───────────────┘       │  │                       │  │       └───────────────┘
                              │  └───────────────────────┘  │
                              │                             │
                              │  ┌───────────────────────┐  │
                              │  │                       │  │
                              │  │       Ports           │  │
                              │  │                       │  │
                              │  │  - HttpTransport      │  │
                              │  │  - AuthProvider       │  │
                              │  │  - TracingProvider    │  │
                              │  │  - LoggingProvider    │  │
                              │  │                       │  │
                              │  └───────────────────────┘  │
                              │                             │
                              └─────────────────────────────┘
```

### 2.3 London-School TDD Support

```
┌─────────────────────────────────────────────────────────────────┐
│                    Testing Architecture                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Unit Tests (Mocked Dependencies)                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │   Test ──▶ ChatServiceImpl ──▶ MockHttpTransport        │    │
│  │                    │                                     │    │
│  │                    ▼                                     │    │
│  │            MockResilienceOrchestrator                    │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Integration Tests (Real HTTP, Mock Server)                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │   Test ──▶ MistralClient ──▶ WireMock/MockServer        │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Contract Tests (API Compliance)                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │   OpenAPI Spec ◀──▶ Generated Request/Response Types    │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. C4 Model - Context Diagram

### 3.1 System Context

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM CONTEXT                                  │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────────────────────┐
                    │                                 │
                    │     Application Developer       │
                    │                                 │
                    │   [Person]                      │
                    │   Builds applications using     │
                    │   Mistral AI capabilities       │
                    │                                 │
                    └───────────────┬─────────────────┘
                                    │
                                    │ Uses
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│                        Mistral Integration Module                          │
│                                                                            │
│   [Software System]                                                        │
│   Provides type-safe, resilient access to Mistral AI API services         │
│   with built-in retry, circuit breaker, and observability                 │
│                                                                            │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
                                    │ Calls API
                                    │ [HTTPS/TLS 1.2+]
                                    ▼
                    ┌─────────────────────────────────┐
                    │                                 │
                    │        Mistral AI API          │
                    │                                 │
                    │   [External System]             │
                    │   https://api.mistral.ai        │
                    │                                 │
                    │   - Chat Completions            │
                    │   - FIM Completions             │
                    │   - Embeddings                  │
                    │   - Models                      │
                    │   - Files                       │
                    │   - Fine-tuning                 │
                    │   - Agents                      │
                    │   - Batch                       │
                    │   - Classifiers                 │
                    │                                 │
                    └─────────────────────────────────┘
```

### 3.2 External Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL DEPENDENCIES                              │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
    │                 │     │                 │     │                 │
    │  integrations-  │     │  integrations-  │     │  integrations-  │
    │     errors      │     │     retry       │     │ circuit-breaker │
    │                 │     │                 │     │                 │
    │ [Library]       │     │ [Library]       │     │ [Library]       │
    │ Base error      │     │ Retry executor  │     │ Circuit breaker │
    │ types & traits  │     │ with backoff    │     │ state machine   │
    │                 │     │                 │     │                 │
    └────────┬────────┘     └────────┬────────┘     └────────┬────────┘
             │                       │                       │
             └───────────────────────┼───────────────────────┘
                                     │
                                     ▼
                    ┌─────────────────────────────────┐
                    │                                 │
                    │   Mistral Integration Module    │
                    │                                 │
                    └─────────────────────────────────┘
                                     ▲
                                     │
             ┌───────────────────────┼───────────────────────┐
             │                       │                       │
    ┌────────┴────────┐     ┌────────┴────────┐     ┌────────┴────────┐
    │                 │     │                 │     │                 │
    │  integrations-  │     │  integrations-  │     │  integrations-  │
    │   rate-limit    │     │    tracing      │     │    logging      │
    │                 │     │                 │     │                 │
    │ [Library]       │     │ [Library]       │     │ [Library]       │
    │ Token bucket,   │     │ Distributed     │     │ Structured      │
    │ sliding window  │     │ tracing spans   │     │ logging         │
    │                 │     │                 │     │                 │
    └─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## 4. C4 Model - Container Diagram

### 4.1 Container Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CONTAINER DIAGRAM                                 │
│                       Mistral Integration Module                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              Application                                     │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                          MistralClient                                 │  │
│  │                                                                        │  │
│  │  [Container: Rust Library / TypeScript Package]                        │  │
│  │  Main entry point providing access to all Mistral services            │  │
│  │                                                                        │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │                                       │
│              ┌───────────────────────┼───────────────────────┐              │
│              │                       │                       │              │
│              ▼                       ▼                       ▼              │
│  ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐     │
│  │                   │   │                   │   │                   │     │
│  │   Chat Service    │   │   Files Service   │   │  FineTune Service │     │
│  │                   │   │                   │   │                   │     │
│  │ [Container]       │   │ [Container]       │   │ [Container]       │     │
│  │ Chat completions  │   │ File upload/      │   │ Fine-tuning job   │     │
│  │ Streaming         │   │ download          │   │ management        │     │
│  │                   │   │                   │   │                   │     │
│  └─────────┬─────────┘   └─────────┬─────────┘   └─────────┬─────────┘     │
│            │                       │                       │               │
│  ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐     │
│  │                   │   │                   │   │                   │     │
│  │  Agents Service   │   │   Batch Service   │   │  Models Service   │     │
│  │                   │   │                   │   │                   │     │
│  │ [Container]       │   │ [Container]       │   │ [Container]       │     │
│  │ Agent CRUD and    │   │ Batch job         │   │ Model listing     │     │
│  │ completions       │   │ management        │   │ and management    │     │
│  │                   │   │                   │   │                   │     │
│  └─────────┬─────────┘   └─────────┬─────────┘   └─────────┬─────────┘     │
│            │                       │                       │               │
│            └───────────────────────┼───────────────────────┘               │
│                                    │                                        │
│                                    ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       Infrastructure Layer                             │  │
│  │                                                                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │  │
│  │  │   HTTP      │  │ Resilience  │  │    Auth     │  │    SSE      │   │  │
│  │  │ Transport   │  │Orchestrator │  │  Provider   │  │   Parser    │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTPS
                                      ▼
                         ┌─────────────────────────┐
                         │    Mistral AI API       │
                         │    [External System]    │
                         └─────────────────────────┘
```

### 4.2 Service Containers Detail

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SERVICE CONTAINERS                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ Chat Service Container                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Responsibilities:                                                            │
│  - Create chat completions (sync/stream)                                      │
│  - Build and validate chat requests                                           │
│  - Handle tool calling and function execution                                 │
│  - Parse streaming SSE responses                                              │
│  - Accumulate streamed content                                                │
│                                                                               │
│  API Endpoints:                                                               │
│  - POST /v1/chat/completions                                                  │
│                                                                               │
│  Key Types:                                                                   │
│  - ChatCompletionRequest, ChatCompletionResponse                              │
│  - Message (System, User, Assistant, Tool)                                    │
│  - Tool, ToolCall, ToolChoice                                                 │
│  - StreamEvent, ChatCompletionChunk                                           │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ FIM Service Container                                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Responsibilities:                                                            │
│  - Create fill-in-the-middle completions                                      │
│  - Handle code completion scenarios                                           │
│  - Support sync and streaming modes                                           │
│                                                                               │
│  API Endpoints:                                                               │
│  - POST /v1/fim/completions                                                   │
│                                                                               │
│  Key Types:                                                                   │
│  - FimCompletionRequest, FimCompletionResponse                                │
│  - FimCompletionChunk                                                         │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ Files Service Container                                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Responsibilities:                                                            │
│  - Upload files for fine-tuning or batch                                      │
│  - List, retrieve, delete files                                               │
│  - Download file content                                                      │
│  - Get signed URLs for downloads                                              │
│                                                                               │
│  API Endpoints:                                                               │
│  - POST /v1/files (multipart upload)                                          │
│  - GET /v1/files                                                              │
│  - GET /v1/files/{id}                                                         │
│  - DELETE /v1/files/{id}                                                      │
│  - GET /v1/files/{id}/content                                                 │
│                                                                               │
│  Key Types:                                                                   │
│  - FileUploadRequest, FileObject                                              │
│  - FilePurpose, FileStatus                                                    │
│  - FileContent, SignedUrl                                                     │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ Fine-Tuning Service Container                                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Responsibilities:                                                            │
│  - Create fine-tuning jobs                                                    │
│  - List, get, cancel, start jobs                                              │
│  - Archive/unarchive completed jobs                                           │
│  - Support W&B integration configuration                                      │
│                                                                               │
│  API Endpoints:                                                               │
│  - POST /v1/fine_tuning/jobs                                                  │
│  - GET /v1/fine_tuning/jobs                                                   │
│  - GET /v1/fine_tuning/jobs/{id}                                              │
│  - POST /v1/fine_tuning/jobs/{id}/cancel                                      │
│  - POST /v1/fine_tuning/jobs/{id}/start                                       │
│  - POST /v1/fine_tuning/jobs/{id}/archive                                     │
│  - DELETE /v1/fine_tuning/jobs/{id}/archive                                   │
│                                                                               │
│  Key Types:                                                                   │
│  - CreateFineTuningJobRequest, FineTuningJob                                  │
│  - FineTuningHyperparams, FineTuningStatus                                    │
│  - Integration, WandbConfig                                                   │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ Agents Service Container                                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Responsibilities:                                                            │
│  - Create, list, get, update, delete agents                                   │
│  - Run agent completions (sync/stream)                                        │
│  - Configure agent tools (function, web search, code interpreter)             │
│                                                                               │
│  API Endpoints:                                                               │
│  - POST /v1/agents                                                            │
│  - GET /v1/agents                                                             │
│  - GET /v1/agents/{id}                                                        │
│  - PATCH /v1/agents/{id}                                                      │
│  - DELETE /v1/agents/{id}                                                     │
│  - POST /v1/agents/{id}/completions                                           │
│                                                                               │
│  Key Types:                                                                   │
│  - Agent, CreateAgentRequest, UpdateAgentRequest                              │
│  - AgentTool (Function, WebSearch, CodeInterpreter, etc.)                     │
│  - AgentCompletionRequest, AgentCompletionResponse                            │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ Batch Service Container                                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Responsibilities:                                                            │
│  - Create batch processing jobs                                               │
│  - List, get, cancel batch jobs                                               │
│  - Monitor batch progress                                                     │
│                                                                               │
│  API Endpoints:                                                               │
│  - POST /v1/batch/jobs                                                        │
│  - GET /v1/batch/jobs                                                         │
│  - GET /v1/batch/jobs/{id}                                                    │
│  - POST /v1/batch/jobs/{id}/cancel                                            │
│                                                                               │
│  Key Types:                                                                   │
│  - CreateBatchJobRequest, BatchJob                                            │
│  - BatchEndpoint, BatchStatus                                                 │
│  - BatchErrors                                                                │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. C4 Model - Component Diagram

### 5.1 Component Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           COMPONENT DIAGRAM                                  │
│                         MistralClient Container                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                           Public API Layer                              │ │
│  │                                                                         │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │ │
│  │  │              │  │              │  │              │                  │ │
│  │  │ MistralClient│  │ClientBuilder │  │   Config     │                  │ │
│  │  │              │  │              │  │              │                  │ │
│  │  └──────┬───────┘  └──────────────┘  └──────────────┘                  │ │
│  │         │                                                               │ │
│  └─────────┼───────────────────────────────────────────────────────────────┘ │
│            │                                                                 │
│            │ provides access to                                              │
│            ▼                                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                          Service Layer                                  │ │
│  │                                                                         │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │ │
│  │  │  Chat   │ │   FIM   │ │  Files  │ │FineTune │ │ Agents  │          │ │
│  │  │ Service │ │ Service │ │ Service │ │ Service │ │ Service │          │ │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘          │ │
│  │       │           │           │           │           │                │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                      │ │
│  │  │  Batch  │ │ Models  │ │Embedding│ │Classify │                      │ │
│  │  │ Service │ │ Service │ │ Service │ │ Service │                      │ │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘                      │ │
│  │       │           │           │           │                            │ │
│  └───────┼───────────┼───────────┼───────────┼────────────────────────────┘ │
│          │           │           │           │                              │
│          └───────────┴─────┬─────┴───────────┘                              │
│                            │ uses                                            │
│                            ▼                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                       Infrastructure Layer                              │ │
│  │                                                                         │ │
│  │  ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────┐   │ │
│  │  │                  │    │                  │    │                 │   │ │
│  │  │  HttpTransport   │    │   Resilience     │    │   AuthProvider  │   │ │
│  │  │                  │    │   Orchestrator   │    │                 │   │ │
│  │  │  - send()        │    │                  │    │  - get_token()  │   │ │
│  │  │  - send_stream() │    │  - retry         │    │  - refresh()    │   │ │
│  │  │                  │    │  - circuit_break │    │                 │   │ │
│  │  │                  │    │  - rate_limit    │    │                 │   │ │
│  │  └────────┬─────────┘    └────────┬─────────┘    └────────┬────────┘   │ │
│  │           │                       │                       │            │ │
│  │  ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────┐   │ │
│  │  │                  │    │                  │    │                 │   │ │
│  │  │   SseParser      │    │  RequestBuilder  │    │ ResponseParser  │   │ │
│  │  │                  │    │                  │    │                 │   │ │
│  │  │  - parse()       │    │  - build()       │    │  - parse()      │   │ │
│  │  │  - accumulate()  │    │  - with_auth()   │    │  - map_error()  │   │ │
│  │  │                  │    │  - with_body()   │    │                 │   │ │
│  │  └──────────────────┘    └──────────────────┘    └─────────────────┘   │ │
│  │                                                                         │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                            │                                                 │
│                            │ integrates with                                 │
│                            ▼                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                       Primitives Layer                                  │ │
│  │                                                                         │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │ │
│  │  │ errors   │ │  retry   │ │ circuit  │ │   rate   │ │ tracing  │     │ │
│  │  │          │ │          │ │ breaker  │ │  limit   │ │          │     │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘     │ │
│  │                                                                         │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Component Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        COMPONENT RELATIONSHIPS                               │
└─────────────────────────────────────────────────────────────────────────────┘

                              MistralClient
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
              ┌─────────┐    ┌───────────┐    ┌─────────────┐
              │ Config  │    │ Services  │    │ Resilience  │
              │         │    │ Registry  │    │Orchestrator │
              └────┬────┘    └─────┬─────┘    └──────┬──────┘
                   │               │                  │
                   │               │                  │
     ┌─────────────┴─────┐    ┌────┴────┐        ┌───┴───┐
     │                   │    │         │        │       │
     ▼                   ▼    ▼         ▼        ▼       ▼
┌─────────┐       ┌─────────┐ ┌────┐ ┌────┐  ┌─────┐ ┌─────┐
│ Timeout │       │ BaseURL │ │Chat│ │FIM │  │Retry│ │Circ.│
│ Config  │       │         │ │Svc │ │Svc │  │     │ │Brkr │
└─────────┘       └─────────┘ └──┬─┘ └──┬─┘  └─────┘ └─────┘
                                 │      │
                                 │      │
                    ┌────────────┴──────┴────────────┐
                    │                                │
                    ▼                                ▼
              ┌───────────┐                   ┌───────────┐
              │   HTTP    │                   │    SSE    │
              │ Transport │                   │  Parser   │
              └─────┬─────┘                   └───────────┘
                    │
                    │
           ┌────────┴────────┐
           │                 │
           ▼                 ▼
    ┌─────────────┐   ┌─────────────┐
    │   Request   │   │  Response   │
    │   Builder   │   │   Parser    │
    └─────────────┘   └─────────────┘
```

---

## 6. Module Structure - Rust

### 6.1 Crate Organization

```
integrations-mistral/
├── Cargo.toml
├── src/
│   ├── lib.rs                      # Public API exports
│   │
│   ├── client/
│   │   ├── mod.rs                  # Client module exports
│   │   ├── builder.rs              # ClientBuilder implementation
│   │   ├── client.rs               # MistralClient implementation
│   │   └── config.rs               # ClientConfig, RetryConfig, etc.
│   │
│   ├── services/
│   │   ├── mod.rs                  # Service module exports
│   │   ├── chat.rs                 # ChatService trait and impl
│   │   ├── fim.rs                  # FimService trait and impl
│   │   ├── embeddings.rs           # EmbeddingsService trait and impl
│   │   ├── models.rs               # ModelsService trait and impl
│   │   ├── files.rs                # FilesService trait and impl
│   │   ├── fine_tuning.rs          # FineTuningService trait and impl
│   │   ├── agents.rs               # AgentsService trait and impl
│   │   ├── batch.rs                # BatchService trait and impl
│   │   └── classifiers.rs          # ClassifiersService trait and impl
│   │
│   ├── types/
│   │   ├── mod.rs                  # Type module exports
│   │   ├── chat.rs                 # Chat-related types
│   │   ├── fim.rs                  # FIM-related types
│   │   ├── embeddings.rs           # Embedding types
│   │   ├── models.rs               # Model types
│   │   ├── files.rs                # File types
│   │   ├── fine_tuning.rs          # Fine-tuning types
│   │   ├── agents.rs               # Agent types
│   │   ├── batch.rs                # Batch types
│   │   ├── classifiers.rs          # Classifier types
│   │   ├── common.rs               # Shared types (Usage, etc.)
│   │   └── streaming.rs            # Streaming event types
│   │
│   ├── transport/
│   │   ├── mod.rs                  # Transport module exports
│   │   ├── http.rs                 # HttpTransport trait
│   │   ├── reqwest.rs              # ReqwestTransport implementation
│   │   ├── request.rs              # RequestBuilder
│   │   └── response.rs             # ResponseParser
│   │
│   ├── streaming/
│   │   ├── mod.rs                  # Streaming module exports
│   │   ├── sse.rs                  # SSE parser
│   │   └── accumulator.rs          # Stream accumulator
│   │
│   ├── auth/
│   │   ├── mod.rs                  # Auth module exports
│   │   ├── provider.rs             # AuthProvider trait
│   │   └── bearer.rs               # BearerAuthProvider
│   │
│   ├── resilience/
│   │   ├── mod.rs                  # Resilience module exports
│   │   └── orchestrator.rs         # ResilienceOrchestrator
│   │
│   ├── error/
│   │   ├── mod.rs                  # Error module exports
│   │   ├── types.rs                # MistralError enum
│   │   └── mapper.rs               # Error mapping logic
│   │
│   └── observability/
│       ├── mod.rs                  # Observability module exports
│       ├── metrics.rs              # Metrics definitions
│       └── logging.rs              # Logging utilities
│
├── tests/
│   ├── common/
│   │   ├── mod.rs                  # Test utilities
│   │   ├── fixtures.rs             # Test fixtures
│   │   └── mocks.rs                # Mock implementations
│   │
│   ├── unit/
│   │   ├── client_test.rs
│   │   ├── chat_test.rs
│   │   ├── files_test.rs
│   │   └── ...
│   │
│   └── integration/
│       ├── chat_integration_test.rs
│       ├── files_integration_test.rs
│       └── ...
│
├── benches/
│   ├── chat_bench.rs
│   └── streaming_bench.rs
│
└── examples/
    ├── chat_completion.rs
    ├── streaming.rs
    ├── tool_calling.rs
    └── fine_tuning.rs
```

### 6.2 Cargo.toml Dependencies

```toml
[package]
name = "integrations-mistral"
version = "0.1.0"
edition = "2021"
description = "Mistral AI API client for Rust"
license = "MIT OR Apache-2.0"

[dependencies]
# Workspace primitives
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
reqwest = { version = "0.11", features = ["json", "stream", "rustls-tls"] }

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

[dev-dependencies]
# Testing
tokio-test = "0.4"
mockall = "0.12"
wiremock = "0.5"
test-case = "3.3"
criterion = { version = "0.5", features = ["async_tokio"] }
tracing-test = "0.2"

[[bench]]
name = "chat_bench"
harness = false
```

### 6.3 Public API Surface (lib.rs)

```rust
//! Mistral AI API Client Library
//!
//! This crate provides a type-safe, async-first client for the Mistral AI API.
//!
//! # Quick Start
//!
//! ```rust,no_run
//! use integrations_mistral::{MistralClient, ChatCompletionRequest, Message};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let client = MistralClient::builder()
//!         .api_key("your-api-key")
//!         .build()?;
//!
//!     let request = ChatCompletionRequest::builder()
//!         .model("mistral-large-latest")
//!         .messages(vec![
//!             Message::user("What is the capital of France?")
//!         ])
//!         .build();
//!
//!     let response = client.chat().create(request).await?;
//!     println!("{}", response.choices[0].message.content);
//!
//!     Ok(())
//! }
//! ```

// Re-export client
pub use client::{MistralClient, ClientBuilder, ClientConfig};

// Re-export services (traits only for mocking)
pub use services::{
    ChatService, FimService, EmbeddingsService,
    ModelsService, FilesService, FineTuningService,
    AgentsService, BatchService, ClassifiersService,
};

// Re-export types
pub use types::{
    // Chat types
    ChatCompletionRequest, ChatCompletionResponse,
    Message, SystemMessage, UserMessage, AssistantMessage, ToolMessage,
    Tool, ToolCall, ToolChoice, FunctionDefinition,
    ResponseFormat, JsonSchema,
    ChatChoice, FinishReason, Usage,

    // Streaming types
    ChatCompletionChunk, StreamChoice, ContentDelta,
    StreamEvent,

    // FIM types
    FimCompletionRequest, FimCompletionResponse,

    // Embedding types
    EmbeddingRequest, EmbeddingResponse, EmbeddingObject,

    // Model types
    Model, ListModelsResponse,

    // File types
    FileObject, FileUploadRequest, FilePurpose, FileStatus,
    ListFilesRequest, ListFilesResponse, FileContent,

    // Fine-tuning types
    FineTuningJob, CreateFineTuningJobRequest,
    FineTuningHyperparams, FineTuningStatus,
    TrainingFile, Integration, WandbConfig,

    // Agent types
    Agent, CreateAgentRequest, UpdateAgentRequest,
    AgentTool, AgentCompletionRequest, AgentCompletionResponse,

    // Batch types
    BatchJob, CreateBatchJobRequest, BatchStatus, BatchEndpoint,

    // Classifier types
    ClassificationRequest, ClassificationResponse,
    ModerationRequest, ModerationResponse,
};

// Re-export errors
pub use error::{MistralError, Result};

// Re-export config types
pub use client::{RetryConfig, CircuitBreakerConfig, RateLimitConfig};

// Internal modules
mod client;
mod services;
mod types;
mod transport;
mod streaming;
mod auth;
mod resilience;
mod error;
mod observability;
```

---

## 7. Module Structure - TypeScript

### 7.1 Package Organization

```
packages/integrations-mistral/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── src/
│   ├── index.ts                    # Public API exports
│   │
│   ├── client/
│   │   ├── index.ts                # Client exports
│   │   ├── builder.ts              # ClientBuilder
│   │   ├── client.ts               # MistralClient
│   │   └── config.ts               # Configuration types
│   │
│   ├── services/
│   │   ├── index.ts                # Service exports
│   │   ├── chat.ts                 # ChatService
│   │   ├── fim.ts                  # FimService
│   │   ├── embeddings.ts           # EmbeddingsService
│   │   ├── models.ts               # ModelsService
│   │   ├── files.ts                # FilesService
│   │   ├── fine-tuning.ts          # FineTuningService
│   │   ├── agents.ts               # AgentsService
│   │   ├── batch.ts                # BatchService
│   │   └── classifiers.ts          # ClassifiersService
│   │
│   ├── types/
│   │   ├── index.ts                # Type exports
│   │   ├── chat.ts                 # Chat types
│   │   ├── fim.ts                  # FIM types
│   │   ├── embeddings.ts           # Embedding types
│   │   ├── models.ts               # Model types
│   │   ├── files.ts                # File types
│   │   ├── fine-tuning.ts          # Fine-tuning types
│   │   ├── agents.ts               # Agent types
│   │   ├── batch.ts                # Batch types
│   │   ├── classifiers.ts          # Classifier types
│   │   ├── common.ts               # Shared types
│   │   └── streaming.ts            # Streaming types
│   │
│   ├── transport/
│   │   ├── index.ts                # Transport exports
│   │   ├── http.ts                 # HttpTransport interface
│   │   ├── fetch.ts                # FetchTransport implementation
│   │   ├── request.ts              # RequestBuilder
│   │   └── response.ts             # ResponseParser
│   │
│   ├── streaming/
│   │   ├── index.ts                # Streaming exports
│   │   ├── sse.ts                  # SSE parser
│   │   └── accumulator.ts          # Stream accumulator
│   │
│   ├── auth/
│   │   ├── index.ts                # Auth exports
│   │   ├── provider.ts             # AuthProvider interface
│   │   └── bearer.ts               # BearerAuthProvider
│   │
│   ├── resilience/
│   │   ├── index.ts                # Resilience exports
│   │   └── orchestrator.ts         # ResilienceOrchestrator
│   │
│   ├── error/
│   │   ├── index.ts                # Error exports
│   │   ├── types.ts                # MistralError class
│   │   └── mapper.ts               # Error mapping
│   │
│   └── observability/
│       ├── index.ts                # Observability exports
│       ├── metrics.ts              # Metrics
│       └── logging.ts              # Logging
│
├── tests/
│   ├── setup.ts                    # Test setup
│   ├── fixtures/
│   │   ├── index.ts
│   │   ├── chat.ts
│   │   └── files.ts
│   │
│   ├── mocks/
│   │   ├── index.ts
│   │   ├── transport.ts
│   │   └── services.ts
│   │
│   ├── unit/
│   │   ├── client.test.ts
│   │   ├── chat.test.ts
│   │   └── files.test.ts
│   │
│   └── integration/
│       ├── chat.integration.test.ts
│       └── files.integration.test.ts
│
└── examples/
    ├── chat-completion.ts
    ├── streaming.ts
    ├── tool-calling.ts
    └── fine-tuning.ts
```

### 7.2 Package.json

```json
{
  "name": "@integrations/mistral",
  "version": "0.1.0",
  "description": "Mistral AI API client for TypeScript",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit"
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
    "msw": "^2.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### 7.3 Public API Surface (index.ts)

```typescript
/**
 * Mistral AI API Client Library
 *
 * Type-safe, async-first client for the Mistral AI API.
 *
 * @example
 * ```typescript
 * import { MistralClient } from '@integrations/mistral';
 *
 * const client = new MistralClient({ apiKey: 'your-api-key' });
 *
 * const response = await client.chat.create({
 *   model: 'mistral-large-latest',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 *
 * console.log(response.choices[0].message.content);
 * ```
 *
 * @packageDocumentation
 */

// Client
export { MistralClient, ClientBuilder } from './client';
export type { ClientConfig, RetryConfig, CircuitBreakerConfig, RateLimitConfig } from './client';

// Services (interfaces for mocking)
export type {
  ChatService,
  FimService,
  EmbeddingsService,
  ModelsService,
  FilesService,
  FineTuningService,
  AgentsService,
  BatchService,
  ClassifiersService,
} from './services';

// Chat types
export type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  Message,
  SystemMessage,
  UserMessage,
  AssistantMessage,
  ToolMessage,
  Tool,
  ToolCall,
  ToolChoice,
  FunctionDefinition,
  ResponseFormat,
  JsonSchema,
  ChatChoice,
  FinishReason,
  Usage,
  ChatCompletionChunk,
  StreamChoice,
  ContentDelta,
  StreamEvent,
} from './types';

// FIM types
export type {
  FimCompletionRequest,
  FimCompletionResponse,
} from './types';

// Embedding types
export type {
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingObject,
} from './types';

// Model types
export type {
  Model,
  ListModelsResponse,
} from './types';

// File types
export type {
  FileObject,
  FileUploadRequest,
  FilePurpose,
  FileStatus,
  ListFilesRequest,
  ListFilesResponse,
  FileContent,
} from './types';

// Fine-tuning types
export type {
  FineTuningJob,
  CreateFineTuningJobRequest,
  FineTuningHyperparams,
  FineTuningStatus,
  TrainingFile,
  Integration,
  WandbConfig,
} from './types';

// Agent types
export type {
  Agent,
  CreateAgentRequest,
  UpdateAgentRequest,
  AgentTool,
  AgentCompletionRequest,
  AgentCompletionResponse,
} from './types';

// Batch types
export type {
  BatchJob,
  CreateBatchJobRequest,
  BatchStatus,
  BatchEndpoint,
} from './types';

// Classifier types
export type {
  ClassificationRequest,
  ClassificationResponse,
  ModerationRequest,
  ModerationResponse,
} from './types';

// Errors
export { MistralError } from './error';
export type { MistralErrorType } from './error';
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial architecture part 1 |

---

**Architecture Phase Status: Part 1 COMPLETE**

*System overview, C4 diagrams, and module structure documented.*
