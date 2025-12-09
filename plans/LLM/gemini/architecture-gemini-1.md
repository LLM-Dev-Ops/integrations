# Architecture: Google Gemini Integration Module - Part 1

**System Overview, C4 Diagrams, and Module Structure**
**Version:** 1.0.0
**Date:** 2025-12-09
**Status:** SPARC Phase 3

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

The Google Gemini Integration Module provides a production-ready, type-safe client library for interacting with Google's Gemini API services. The architecture follows hexagonal design principles with clear separation between domain logic, infrastructure concerns, and external dependencies.

### 1.1 Key Architectural Decisions

| Decision | Rationale | Trade-offs |
|----------|-----------|------------|
| **Hexagonal Architecture** | Isolates business logic from infrastructure, enables testing via mocks | Slight complexity increase, clear boundaries |
| **Async-First Design** | Non-blocking I/O for high throughput and efficient resource usage | Requires async runtime |
| **Trait-Based Abstraction** | Enables dependency injection and London-School TDD | Minor runtime overhead from dynamic dispatch |
| **Chunked JSON Streaming** | Gemini uses newline-delimited JSON, not SSE | Custom parser required, different from other providers |
| **Dual Auth Methods** | Support both header (`x-goog-api-key`) and query param (`?key=`) | Flexibility for different deployment scenarios |
| **Lazy Service Initialization** | Reduces memory footprint, faster startup | First access has initialization cost |
| **No Cross-Module Dependencies** | Complete isolation, independent versioning | May duplicate some patterns across modules |

### 1.2 Architecture Constraints

| Constraint | Source | Impact |
|------------|--------|--------|
| **No ruvbase dependency** | Specification requirement | Must use only Integration Repo primitives |
| **No cross-integration dependencies** | Module isolation rule | Cannot share code with OpenAI/Anthropic/Mistral modules |
| **Rust + TypeScript dual implementation** | Multi-language support | Must maintain API parity |
| **Integration Repo primitives only** | Dependency policy | Limited to 8 approved primitive crates |
| **TLS 1.2+ required** | Security requirement | Cannot use older TLS versions |

### 1.3 Gemini-Specific Considerations

| Consideration | Description |
|---------------|-------------|
| **API Key Authentication** | Via `x-goog-api-key` header (recommended) or `?key=` query param |
| **Chunked JSON Streaming** | Returns JSON array with newline-delimited objects (NOT SSE) |
| **File Upload Endpoint** | Uses separate base URL for uploads (`/upload/v1beta/files`) |
| **Cached Content** | Context caching for repeated prompts with TTL/expiry |
| **Content Safety** | Configurable safety settings with block thresholds |
| **Multi-modal Support** | Text, images, audio, video, and PDF in single request |

---

## 2. Design Principles

### 2.1 SOLID Principles Application

```
┌─────────────────────────────────────────────────────────────────┐
│                      SOLID in Gemini Module                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  S - Single Responsibility                                       │
│      Each service handles one API domain (Content, Files, etc.) │
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
│      MockContentService substitutes ContentServiceImpl           │
│      All implementations honor trait contracts                   │
│                                                                  │
│  I - Interface Segregation                                       │
│      ContentService separate from FilesService                   │
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

### 2.2 Hexagonal Architecture (Ports & Adapters)

```
                              ┌─────────────────────────────┐
                              │      Application Core       │
                              │                             │
      ┌───────────────┐       │  ┌───────────────────────┐  │       ┌───────────────┐
      │               │       │  │                       │  │       │               │
      │   Driving     │──────▶│  │   Domain Services     │  │◀──────│    Driven     │
      │   Adapters    │       │  │                       │  │       │    Adapters   │
      │               │       │  │  - ContentService     │  │       │               │
      │  - API Entry  │       │  │  - EmbeddingsService  │  │       │  - HTTP       │
      │  - Builder    │       │  │  - ModelsService      │  │       │  - Chunked    │
      │  - Config     │       │  │  - FilesService       │  │       │    JSON       │
      │               │       │  │  - CachedContent      │  │       │  - Auth       │
      │               │       │  │    Service            │  │       │  - Resilience │
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
│  │   Test ──▶ ContentServiceImpl ──▶ MockHttpTransport     │    │
│  │                    │                                     │    │
│  │                    ▼                                     │    │
│  │            MockResilienceOrchestrator                    │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Integration Tests (Real HTTP, Mock Server)                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │   Test ──▶ GeminiClient ──▶ WireMock/MockServer         │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Contract Tests (API Compliance)                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                                                          │    │
│  │   Gemini API Spec ◀──▶ Generated Request/Response Types │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 Clean Architecture Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            External Systems                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Gemini API  │  │  Primitives │  │  Telemetry  │  │   Config    │        │
│  │             │  │             │  │             │  │             │        │
│  │ • Content   │  │ • errors    │  │ • traces    │  │ • env vars  │        │
│  │ • Embeddings│  │ • retry     │  │ • metrics   │  │ • files     │        │
│  │ • Models    │  │ • circuit   │  │ • logs      │  │             │        │
│  │ • Files     │  │ • rate-limit│  │             │  │             │        │
│  │ • Cached    │  │ • tracing   │  │             │  │             │        │
│  │   Content   │  │ • logging   │  │             │  │             │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Infrastructure Layer                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • ReqwestHttpTransport      • PrimitiveRetryExecutor               │    │
│  │  • PrimitiveRateLimiter      • PrimitiveCircuitBreaker              │    │
│  │  • PrimitiveLogger           • PrimitiveTracer                      │    │
│  │  • EnvConfigProvider         • JsonSerializer                       │    │
│  │  • ChunkedJsonParser         • MultipartFormBuilder                 │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Interface Adapters Layer                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • GeminiClientImpl          • ServiceImpl (all services)           │    │
│  │  • RequestBuilder            • ResponseParser                       │    │
│  │  • ChunkStreamHandler        • ErrorMapper                          │    │
│  │  • ResilienceOrchestrator    • AuthManager                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Application Layer                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • GeminiClient trait        • ContentService trait                 │    │
│  │  • EmbeddingsService trait   • ModelsService trait                  │    │
│  │  • FilesService trait        • CachedContentService trait           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Domain Layer                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • Request types (GenerateContentRequest, EmbedContentRequest, etc.)│    │
│  │  • Response types (GenerateContentResponse, Candidate, etc.)        │    │
│  │  • Content blocks (Part, Content, TextPart, InlineData, etc.)       │    │
│  │  • Error types (GeminiError hierarchy)                              │    │
│  │  • Value objects (Model, File, CachedContent, SafetySetting)        │    │
│  │  • Configuration (GeminiConfig, AuthMethod)                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
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
                    │   Google Gemini AI capabilities │
                    │                                 │
                    └───────────────┬─────────────────┘
                                    │
                                    │ Uses
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                            │
│                        Gemini Integration Module                           │
│                                                                            │
│   [Software System]                                                        │
│   Provides type-safe, resilient access to Google Gemini API services      │
│   with built-in retry, circuit breaker, and observability                 │
│                                                                            │
└───────────────────────────────────┬───────────────────────────────────────┘
                                    │
                                    │ Calls API
                                    │ [HTTPS/TLS 1.2+]
                                    ▼
                    ┌─────────────────────────────────┐
                    │                                 │
                    │     Google Gemini API           │
                    │                                 │
                    │   [External System]             │
                    │   generativelanguage.          │
                    │   googleapis.com                │
                    │                                 │
                    │   - Content Generation          │
                    │   - Streaming Generation        │
                    │   - Embeddings                  │
                    │   - Token Counting              │
                    │   - Models                      │
                    │   - Files                       │
                    │   - Cached Content              │
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
                    │   Gemini Integration Module     │
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

             ┌───────────────────────┬───────────────────────┐
             │                       │                       │
    ┌────────┴────────┐     ┌────────┴────────┐
    │                 │     │                 │
    │  integrations-  │     │  integrations-  │
    │     types       │     │    config       │
    │                 │     │                 │
    │ [Library]       │     │ [Library]       │
    │ Common type     │     │ Configuration   │
    │ definitions     │     │ management      │
    │                 │     │                 │
    └─────────────────┘     └─────────────────┘
```

---

## 4. C4 Model - Container Diagram

### 4.1 Container Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CONTAINER DIAGRAM                                 │
│                       Gemini Integration Module                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              Application                                     │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                          GeminiClient                                  │  │
│  │                                                                        │  │
│  │  [Container: Rust Library / TypeScript Package]                        │  │
│  │  Main entry point providing access to all Gemini services             │  │
│  │                                                                        │  │
│  └───────────────────────────────────┬───────────────────────────────────┘  │
│                                      │                                       │
│              ┌───────────────────────┼───────────────────────┐              │
│              │                       │                       │              │
│              ▼                       ▼                       ▼              │
│  ┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐     │
│  │                   │   │                   │   │                   │     │
│  │ Content Service   │   │ Embeddings Service│   │  Models Service   │     │
│  │                   │   │                   │   │                   │     │
│  │ [Container]       │   │ [Container]       │   │ [Container]       │     │
│  │ Generate content  │   │ Embed content     │   │ List/get models   │     │
│  │ Streaming         │   │ Batch embeddings  │   │ Model info cache  │     │
│  │ Token counting    │   │                   │   │                   │     │
│  │                   │   │                   │   │                   │     │
│  └─────────┬─────────┘   └─────────┬─────────┘   └─────────┬─────────┘     │
│            │                       │                       │               │
│  ┌───────────────────┐   ┌───────────────────┐                            │
│  │                   │   │                   │                            │
│  │   Files Service   │   │ CachedContent     │                            │
│  │                   │   │    Service        │                            │
│  │ [Container]       │   │ [Container]       │                            │
│  │ File upload       │   │ Create/manage     │                            │
│  │ File management   │   │ cached content    │                            │
│  │ Wait for active   │   │ TTL management    │                            │
│  │                   │   │                   │                            │
│  └─────────┬─────────┘   └─────────┬─────────┘                            │
│            │                       │                                        │
│            └───────────────────────┼────────────────────────────────────────│
│                                    │                                        │
│                                    ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                       Infrastructure Layer                             │  │
│  │                                                                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │  │
│  │  │   HTTP      │  │ Resilience  │  │    Auth     │  │  Chunked    │   │  │
│  │  │ Transport   │  │Orchestrator │  │  Provider   │  │ JSON Parser │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │  │
│  │                                                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTPS
                                      ▼
                         ┌─────────────────────────┐
                         │    Google Gemini API    │
                         │    [External System]    │
                         └─────────────────────────┘
```

### 4.2 Service Containers Detail

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SERVICE CONTAINERS                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ Content Service Container                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Responsibilities:                                                            │
│  - Generate content (sync/stream)                                             │
│  - Build and validate content requests                                        │
│  - Handle tool calling and function execution                                 │
│  - Parse chunked JSON streaming responses                                     │
│  - Count tokens for requests                                                  │
│  - Manage safety settings                                                     │
│                                                                               │
│  API Endpoints:                                                               │
│  - POST /v1beta/models/{model}:generateContent                                │
│  - POST /v1beta/models/{model}:streamGenerateContent                          │
│  - POST /v1beta/models/{model}:countTokens                                    │
│                                                                               │
│  Key Types:                                                                   │
│  - GenerateContentRequest, GenerateContentResponse                            │
│  - Content, Part (Text, InlineData, FileData, FunctionCall, FunctionResponse) │
│  - GenerationConfig, SafetySetting                                            │
│  - Tool, FunctionDeclaration, ToolConfig                                      │
│  - Candidate, UsageMetadata, FinishReason                                     │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ Embeddings Service Container                                                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Responsibilities:                                                            │
│  - Generate embeddings for content                                            │
│  - Batch embedding generation                                                 │
│  - Support multiple task types                                                │
│  - Handle output dimensionality                                               │
│                                                                               │
│  API Endpoints:                                                               │
│  - POST /v1beta/models/{model}:embedContent                                   │
│  - POST /v1beta/models/{model}:batchEmbedContents                             │
│                                                                               │
│  Key Types:                                                                   │
│  - EmbedContentRequest, EmbedContentResponse                                  │
│  - BatchEmbedContentsRequest, BatchEmbedContentsResponse                      │
│  - ContentEmbedding, TaskType                                                 │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ Models Service Container                                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Responsibilities:                                                            │
│  - List available models                                                      │
│  - Get model details                                                          │
│  - Cache model information                                                    │
│                                                                               │
│  API Endpoints:                                                               │
│  - GET /v1beta/models                                                         │
│  - GET /v1beta/models/{model}                                                 │
│                                                                               │
│  Key Types:                                                                   │
│  - Model, ListModelsRequest, ListModelsResponse                               │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ Files Service Container                                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Responsibilities:                                                            │
│  - Upload files for content generation                                        │
│  - List, retrieve, delete files                                               │
│  - Wait for file processing completion                                        │
│  - Handle multipart form uploads                                              │
│                                                                               │
│  API Endpoints:                                                               │
│  - POST /upload/v1beta/files (multipart)                                      │
│  - GET /v1beta/files                                                          │
│  - GET /v1beta/files/{name}                                                   │
│  - DELETE /v1beta/files/{name}                                                │
│                                                                               │
│  Key Types:                                                                   │
│  - File, UploadFileRequest, UploadFileResponse                                │
│  - ListFilesRequest, ListFilesResponse                                        │
│  - FileState (PROCESSING, ACTIVE, FAILED)                                     │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│ Cached Content Service Container                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Responsibilities:                                                            │
│  - Create cached content for context reuse                                    │
│  - List, retrieve, update, delete cached content                              │
│  - Manage TTL and expiration                                                  │
│                                                                               │
│  API Endpoints:                                                               │
│  - POST /v1beta/cachedContents                                                │
│  - GET /v1beta/cachedContents                                                 │
│  - GET /v1beta/cachedContents/{name}                                          │
│  - PATCH /v1beta/cachedContents/{name}                                        │
│  - DELETE /v1beta/cachedContents/{name}                                       │
│                                                                               │
│  Key Types:                                                                   │
│  - CachedContent, CreateCachedContentRequest                                  │
│  - UpdateCachedContentRequest                                                 │
│  - ListCachedContentsRequest, ListCachedContentsResponse                      │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. C4 Model - Component Diagram

### 5.1 Component Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           COMPONENT DIAGRAM                                  │
│                         GeminiClient Container                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                           Public API Layer                              │ │
│  │                                                                         │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │ │
│  │  │              │  │              │  │              │                  │ │
│  │  │ GeminiClient │  │ClientBuilder │  │GeminiConfig  │                  │ │
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
│  │  │ Content │ │Embedding│ │ Models  │ │  Files  │ │ Cached  │          │ │
│  │  │ Service │ │ Service │ │ Service │ │ Service │ │ Content │          │ │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘          │ │
│  │       │           │           │           │           │                │ │
│  └───────┼───────────┼───────────┼───────────┼───────────┼────────────────┘ │
│          │           │           │           │           │                  │
│          └───────────┴─────┬─────┴───────────┴───────────┘                  │
│                            │ uses                                            │
│                            ▼                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                       Infrastructure Layer                              │ │
│  │                                                                         │ │
│  │  ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────┐   │ │
│  │  │                  │    │                  │    │                 │   │ │
│  │  │  HttpTransport   │    │   Resilience     │    │   AuthProvider  │   │ │
│  │  │                  │    │   Orchestrator   │    │                 │   │ │
│  │  │  - send()        │    │                  │    │ - apply_auth()  │   │ │
│  │  │  - send_stream() │    │  - retry         │    │ - Header/Query  │   │ │
│  │  │                  │    │  - circuit_break │    │                 │   │ │
│  │  │                  │    │  - rate_limit    │    │                 │   │ │
│  │  └────────┬─────────┘    └────────┬─────────┘    └────────┬────────┘   │ │
│  │           │                       │                       │            │ │
│  │  ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────┐   │ │
│  │  │                  │    │                  │    │                 │   │ │
│  │  │ ChunkedJsonParse │    │  RequestBuilder  │    │ ResponseParser  │   │ │
│  │  │                  │    │                  │    │                 │   │ │
│  │  │  - parse()       │    │  - build()       │    │  - parse()      │   │ │
│  │  │  - extract_json()│    │  - with_auth()   │    │  - map_error()  │   │ │
│  │  │                  │    │  - multipart()   │    │                 │   │ │
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
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                                │ │
│  │  │ logging  │ │  types   │ │  config  │                                │ │
│  │  │          │ │          │ │          │                                │ │
│  │  └──────────┘ └──────────┘ └──────────┘                                │ │
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

                              GeminiClient
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
     ┌─────────────┴─────┐    ┌────┴────────────┐   ┌───┴───┐
     │                   │    │                 │   │       │
     ▼                   ▼    ▼      ▼          ▼   ▼       ▼
┌─────────┐       ┌─────────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
│ Timeout │       │ BaseURL │ │Cont.│ │Embed│ │Retry│ │Circ.│
│ Config  │       │         │ │Svc  │ │Svc  │ │     │ │Brkr │
└─────────┘       └─────────┘ └──┬──┘ └──┬──┘ └─────┘ └─────┘
                                 │      │
                                 │      │
                    ┌────────────┴──────┴────────────┐
                    │                                │
                    ▼                                ▼
              ┌───────────┐                   ┌───────────┐
              │   HTTP    │                   │  Chunked  │
              │ Transport │                   │JSON Parser│
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
integrations-gemini/
├── Cargo.toml
├── src/
│   ├── lib.rs                      # Public API exports
│   │
│   ├── client/
│   │   ├── mod.rs                  # Client module exports
│   │   ├── builder.rs              # GeminiClientBuilder implementation
│   │   ├── client.rs               # GeminiClient implementation
│   │   └── config.rs               # GeminiConfig, AuthMethod, etc.
│   │
│   ├── services/
│   │   ├── mod.rs                  # Service module exports
│   │   ├── base.rs                 # BaseService shared infrastructure
│   │   ├── content.rs              # ContentService trait and impl
│   │   ├── embeddings.rs           # EmbeddingsService trait and impl
│   │   ├── models.rs               # ModelsService trait and impl
│   │   ├── files.rs                # FilesService trait and impl
│   │   └── cached_content.rs       # CachedContentService trait and impl
│   │
│   ├── types/
│   │   ├── mod.rs                  # Type module exports
│   │   ├── content.rs              # Content, Part, TextPart, etc.
│   │   ├── generation.rs           # GenerateContentRequest/Response
│   │   ├── embeddings.rs           # Embedding types
│   │   ├── models.rs               # Model types
│   │   ├── files.rs                # File types
│   │   ├── cached_content.rs       # Cached content types
│   │   ├── safety.rs               # SafetySetting, HarmCategory, etc.
│   │   ├── tools.rs                # Tool, FunctionDeclaration, etc.
│   │   ├── common.rs               # Shared types (Usage, etc.)
│   │   └── streaming.rs            # Streaming chunk types
│   │
│   ├── transport/
│   │   ├── mod.rs                  # Transport module exports
│   │   ├── http.rs                 # HttpTransport trait
│   │   ├── reqwest.rs              # ReqwestTransport implementation
│   │   ├── request.rs              # RequestBuilder
│   │   ├── response.rs             # ResponseParser
│   │   └── multipart.rs            # MultipartForm builder
│   │
│   ├── streaming/
│   │   ├── mod.rs                  # Streaming module exports
│   │   ├── chunked_json.rs         # Chunked JSON parser
│   │   └── accumulator.rs          # Stream accumulator
│   │
│   ├── auth/
│   │   ├── mod.rs                  # Auth module exports
│   │   ├── provider.rs             # AuthProvider trait
│   │   └── api_key.rs              # GeminiAuthProvider (header/query)
│   │
│   ├── resilience/
│   │   ├── mod.rs                  # Resilience module exports
│   │   └── orchestrator.rs         # ResilienceOrchestrator
│   │
│   ├── error/
│   │   ├── mod.rs                  # Error module exports
│   │   ├── types.rs                # GeminiError enum
│   │   ├── categories.rs           # Error category enums
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
│   │   ├── content_test.rs
│   │   ├── embeddings_test.rs
│   │   ├── files_test.rs
│   │   └── streaming_test.rs
│   │
│   └── integration/
│       ├── content_integration_test.rs
│       ├── files_integration_test.rs
│       └── cached_content_integration_test.rs
│
├── benches/
│   ├── content_bench.rs
│   └── streaming_bench.rs
│
└── examples/
    ├── generate_content.rs
    ├── streaming.rs
    ├── multimodal.rs
    ├── tool_use.rs
    ├── embeddings.rs
    └── cached_content.rs
```

### 6.2 Cargo.toml

```toml
[package]
name = "integrations-gemini"
version = "0.1.0"
edition = "2021"
description = "Google Gemini API client for Rust"
license = "LLMDevOps-PSACL-1.0"
repository = "https://github.com/llm-dev-ops/integrations"
documentation = "https://docs.llm-dev-ops.io/integrations/gemini"
keywords = ["gemini", "google", "llm", "ai", "integration"]
categories = ["api-bindings", "asynchronous"]

[dependencies]
# Integration Repo Primitives
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
reqwest = { version = "0.12", features = ["json", "stream", "multipart", "rustls-tls"] }

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
base64 = "0.22"
mime_guess = "2.0"

[dev-dependencies]
# Testing
tokio-test = "0.4"
mockall = "0.12"
wiremock = "0.6"
test-case = "3.3"
criterion = { version = "0.5", features = ["async_tokio"] }
tracing-test = "0.2"
pretty_assertions = "1.0"

[features]
default = ["rustls"]
rustls = ["reqwest/rustls-tls"]
native-tls = ["reqwest/native-tls"]

[[bench]]
name = "content_bench"
harness = false

[[bench]]
name = "streaming_bench"
harness = false

[[example]]
name = "generate_content"
path = "examples/generate_content.rs"

[[example]]
name = "streaming"
path = "examples/streaming.rs"

[[example]]
name = "multimodal"
path = "examples/multimodal.rs"
```

### 6.3 Public API Surface (lib.rs)

```rust
//! Google Gemini API Client Library
//!
//! This crate provides a type-safe, async-first client for the Google Gemini API.
//!
//! # Quick Start
//!
//! ```rust,no_run
//! use integrations_gemini::{GeminiClient, GenerateContentRequest, Content, Part};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let client = GeminiClient::builder()
//!         .api_key("your-api-key")
//!         .build()?;
//!
//!     let response = client.content().generate_content(
//!         GenerateContentRequest::builder()
//!             .model("gemini-1.5-pro")
//!             .add_user_text("What is the capital of France?")
//!             .build()
//!     ).await?;
//!
//!     println!("{}", response.candidates[0].content.parts[0].text);
//!
//!     Ok(())
//! }
//! ```

// Re-export client
pub use client::{GeminiClient, GeminiClientBuilder, GeminiConfig};
pub use client::config::{AuthMethod, RetryConfig, CircuitBreakerConfig, RateLimitConfig};

// Re-export services (traits only for mocking)
pub use services::{
    ContentService, EmbeddingsService, ModelsService,
    FilesService, CachedContentService,
};

// Re-export types - Content Generation
pub use types::{
    GenerateContentRequest, GenerateContentRequestBuilder,
    GenerateContentResponse, GenerateContentChunk,
    Content, Part, TextPart, InlineData, FileData,
    FunctionCall, FunctionResponse,
    Candidate, FinishReason, UsageMetadata,
    GenerationConfig, SafetySetting,
    HarmCategory, HarmBlockThreshold,
};

// Re-export types - Tools
pub use types::{
    Tool, FunctionDeclaration, ToolConfig,
    Schema, SchemaType,
};

// Re-export types - Embeddings
pub use types::{
    EmbedContentRequest, EmbedContentRequestBuilder,
    EmbedContentResponse, ContentEmbedding,
    BatchEmbedContentsRequest, BatchEmbedContentsResponse,
    TaskType,
};

// Re-export types - Models
pub use types::{
    Model, ListModelsRequest, ListModelsResponse,
};

// Re-export types - Files
pub use types::{
    File, UploadFileRequest, UploadFileResponse,
    ListFilesRequest, ListFilesResponse,
};

// Re-export types - Cached Content
pub use types::{
    CachedContent, CreateCachedContentRequest,
    UpdateCachedContentRequest,
    ListCachedContentsRequest, ListCachedContentsResponse,
};

// Re-export types - Token Counting
pub use types::{
    CountTokensRequest, CountTokensResponse,
};

// Re-export errors
pub use error::{GeminiError, Result};

// Factory functions
pub fn create(config: GeminiConfig) -> Result<impl GeminiClient> {
    client::factory::create_gemini_client(config)
}

pub fn from_env() -> Result<impl GeminiClient> {
    client::factory::create_gemini_client_from_env()
}

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
packages/integrations-gemini/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── src/
│   ├── index.ts                    # Public API exports
│   │
│   ├── client/
│   │   ├── index.ts                # Client exports
│   │   ├── builder.ts              # GeminiClientBuilder
│   │   ├── client.ts               # GeminiClient
│   │   └── config.ts               # Configuration types
│   │
│   ├── services/
│   │   ├── index.ts                # Service exports
│   │   ├── base.ts                 # BaseService
│   │   ├── content.ts              # ContentService
│   │   ├── embeddings.ts           # EmbeddingsService
│   │   ├── models.ts               # ModelsService
│   │   ├── files.ts                # FilesService
│   │   └── cached-content.ts       # CachedContentService
│   │
│   ├── types/
│   │   ├── index.ts                # Type exports
│   │   ├── content.ts              # Content, Part types
│   │   ├── generation.ts           # Generate content types
│   │   ├── embeddings.ts           # Embedding types
│   │   ├── models.ts               # Model types
│   │   ├── files.ts                # File types
│   │   ├── cached-content.ts       # Cached content types
│   │   ├── safety.ts               # Safety types
│   │   ├── tools.ts                # Tool types
│   │   ├── common.ts               # Shared types
│   │   └── streaming.ts            # Streaming types
│   │
│   ├── transport/
│   │   ├── index.ts                # Transport exports
│   │   ├── http.ts                 # HttpTransport interface
│   │   ├── fetch.ts                # FetchTransport implementation
│   │   ├── request.ts              # RequestBuilder
│   │   ├── response.ts             # ResponseParser
│   │   └── multipart.ts            # MultipartForm builder
│   │
│   ├── streaming/
│   │   ├── index.ts                # Streaming exports
│   │   ├── chunked-json.ts         # Chunked JSON parser
│   │   └── accumulator.ts          # Stream accumulator
│   │
│   ├── auth/
│   │   ├── index.ts                # Auth exports
│   │   ├── provider.ts             # AuthProvider interface
│   │   └── api-key.ts              # GeminiAuthProvider
│   │
│   ├── resilience/
│   │   ├── index.ts                # Resilience exports
│   │   └── orchestrator.ts         # ResilienceOrchestrator
│   │
│   ├── error/
│   │   ├── index.ts                # Error exports
│   │   ├── types.ts                # GeminiError class
│   │   ├── categories.ts           # Error categories
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
│   │   ├── content.ts
│   │   └── files.ts
│   │
│   ├── mocks/
│   │   ├── index.ts
│   │   ├── transport.ts
│   │   └── services.ts
│   │
│   ├── unit/
│   │   ├── client.test.ts
│   │   ├── content.test.ts
│   │   ├── embeddings.test.ts
│   │   └── files.test.ts
│   │
│   └── integration/
│       ├── content.integration.test.ts
│       └── files.integration.test.ts
│
└── examples/
    ├── generate-content.ts
    ├── streaming.ts
    ├── multimodal.ts
    ├── tool-use.ts
    ├── embeddings.ts
    └── cached-content.ts
```

### 7.2 package.json

```json
{
  "name": "@integrations/gemini",
  "version": "0.1.0",
  "description": "Google Gemini API client for TypeScript",
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
  },
  "publishConfig": {
    "access": "restricted"
  },
  "repository": {
    "type": "git",
    "url": "https://github.com/llm-dev-ops/integrations.git",
    "directory": "gemini/typescript"
  },
  "keywords": [
    "gemini",
    "google",
    "llm",
    "ai",
    "integration",
    "typescript"
  ],
  "license": "LLMDevOps-PSACL-1.0"
}
```

### 7.3 Public API Surface (index.ts)

```typescript
/**
 * Google Gemini API Client Library
 *
 * Type-safe, async-first client for the Google Gemini API.
 *
 * @example
 * ```typescript
 * import { GeminiClient } from '@integrations/gemini';
 *
 * const client = new GeminiClient({ apiKey: 'your-api-key' });
 *
 * const response = await client.content.generateContent({
 *   model: 'gemini-1.5-pro',
 *   contents: [{ role: 'user', parts: [{ text: 'Hello!' }] }]
 * });
 *
 * console.log(response.candidates[0].content.parts[0].text);
 * ```
 *
 * @packageDocumentation
 */

// Client
export { GeminiClient, GeminiClientBuilder } from './client';
export type {
  GeminiConfig,
  AuthMethod,
  RetryConfig,
  CircuitBreakerConfig,
  RateLimitConfig,
} from './client';

// Services (interfaces for mocking)
export type {
  ContentService,
  EmbeddingsService,
  ModelsService,
  FilesService,
  CachedContentService,
} from './services';

// Content generation types
export type {
  GenerateContentRequest,
  GenerateContentResponse,
  GenerateContentChunk,
  Content,
  Part,
  TextPart,
  InlineData,
  FileData,
  FunctionCall,
  FunctionResponse,
  Candidate,
  FinishReason,
  UsageMetadata,
  GenerationConfig,
  SafetySetting,
  HarmCategory,
  HarmBlockThreshold,
  PromptFeedback,
} from './types';

// Tool types
export type {
  Tool,
  FunctionDeclaration,
  ToolConfig,
  Schema,
  SchemaType,
} from './types';

// Embedding types
export type {
  EmbedContentRequest,
  EmbedContentResponse,
  ContentEmbedding,
  BatchEmbedContentsRequest,
  BatchEmbedContentsResponse,
  TaskType,
} from './types';

// Model types
export type {
  Model,
  ListModelsRequest,
  ListModelsResponse,
} from './types';

// File types
export type {
  File,
  UploadFileRequest,
  UploadFileResponse,
  ListFilesRequest,
  ListFilesResponse,
} from './types';

// Cached content types
export type {
  CachedContent,
  CreateCachedContentRequest,
  UpdateCachedContentRequest,
  ListCachedContentsRequest,
  ListCachedContentsResponse,
} from './types';

// Token counting types
export type {
  CountTokensRequest,
  CountTokensResponse,
} from './types';

// Errors
export { GeminiError } from './error';
export type { GeminiErrorKind } from './error';

// Request builders
export { GenerateContentRequestBuilder } from './types/generation';
export { EmbedContentRequestBuilder } from './types/embeddings';
```

---

## Document Navigation

| Previous | Current | Next |
|----------|---------|------|
| [Pseudocode Part 3](./pseudocode-gemini-3.md) | Architecture Part 1 | [Architecture Part 2](./architecture-gemini-2.md) |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial architecture part 1 |

---

**Architecture Phase Status: Part 1 COMPLETE**

*System overview, C4 diagrams, and module structure documented.*
