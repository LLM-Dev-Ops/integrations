# OpenAI Integration Module - Architecture (Part 1)

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-08
**Module:** `integrations/openai`
**File:** 1 of 3 - System Overview & Module Structure

---

## Table of Contents (Part 1)

1. [Architecture Overview](#1-architecture-overview)
2. [Design Principles](#2-design-principles)
3. [System Context Diagram](#3-system-context-diagram)
4. [Component Architecture](#4-component-architecture)
5. [Module Structure](#5-module-structure)
6. [Rust Crate Organization](#6-rust-crate-organization)
7. [TypeScript Package Organization](#7-typescript-package-organization)

---

## 1. Architecture Overview

### 1.1 Executive Summary

The OpenAI Integration Module implements a layered architecture that separates concerns across four distinct tiers:

1. **Public Interface Layer** - Exposes type-safe service interfaces
2. **Orchestration Layer** - Coordinates resilience patterns and request lifecycle
3. **Transport Layer** - Handles HTTP communication and streaming
4. **Primitive Integration Layer** - Connects to shared Integration Repo primitives

### 1.2 Key Architectural Decisions

| Decision | Rationale | Trade-offs |
|----------|-----------|------------|
| **Trait-based abstraction** | Enables mocking for London-School TDD | Slight runtime overhead from dynamic dispatch |
| **Lazy service initialization** | Reduces memory footprint, faster startup | First access has initialization cost |
| **Centralized resilience orchestration** | Consistent behavior, single point of configuration | Adds complexity to call stack |
| **Streaming via async iterators** | Native async/await integration, backpressure support | Requires careful lifetime management |
| **No cross-module dependencies** | Complete isolation, independent versioning | May duplicate some patterns |

### 1.3 Architecture Constraints

| Constraint | Source | Impact |
|------------|--------|--------|
| No ruvbase dependency | Specification requirement | Must implement all functionality using primitives only |
| No cross-integration dependencies | Module isolation rule | Cannot share code with Anthropic/Gemini modules |
| Rust + TypeScript dual implementation | Multi-language support | Must maintain API parity |
| Integration Repo primitives only | Dependency policy | Limited to approved external crates |

---

## 2. Design Principles

### 2.1 SOLID Principles Application

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SOLID in OpenAI Module                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  S - Single Responsibility                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ ChatService      │  │ HttpTransport    │  │ AuthManager      │          │
│  │ handles chat     │  │ handles HTTP     │  │ handles auth     │          │
│  │ completions only │  │ requests only    │  │ headers only     │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                              │
│  O - Open/Closed                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │ OpenAIClient is OPEN for extension via:                          │       │
│  │   • Middleware chain                                              │       │
│  │   • Custom hooks (retry, rate-limit, circuit-breaker)            │       │
│  │   • Custom transport implementations                              │       │
│  │ But CLOSED for modification of core behavior                      │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  L - Liskov Substitution                                                     │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │ Any implementation of HttpTransport can replace another:         │       │
│  │   • RealHttpTransport (production)                                │       │
│  │   • MockHttpTransport (testing)                                   │       │
│  │   • RecordingTransport (debugging)                                │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  I - Interface Segregation                                                   │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐               │
│  │ChatService │ │Embeddings  │ │FilesService│ │BatchService│               │
│  │            │ │Service     │ │            │ │            │               │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘               │
│  Clients depend only on the services they use                               │
│                                                                              │
│  D - Dependency Inversion                                                    │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │ High-level: ChatCompletionService                                 │       │
│  │      ↓ depends on abstraction                                     │       │
│  │ Interface: HttpTransport trait                                    │       │
│  │      ↑ implements                                                 │       │
│  │ Low-level: ReqwestHttpTransport                                   │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Hexagonal Architecture (Ports & Adapters)

```
                              ┌─────────────────────────────────────┐
                              │         Application Core            │
                              │  ┌───────────────────────────────┐  │
                              │  │     Domain Services           │  │
                              │  │  • ChatCompletionService      │  │
                              │  │  • EmbeddingsService          │  │
                              │  │  • FilesService               │  │
                              │  │  • (etc.)                     │  │
                              │  └───────────────────────────────┘  │
                              │                                     │
   ┌──────────────────┐       │  ┌───────────────────────────────┐  │       ┌──────────────────┐
   │   Primary Ports  │       │  │       Domain Model            │  │       │ Secondary Ports  │
   │  (Driving Side)  │◄─────►│  │  • Request/Response types    │  │◄─────►│ (Driven Side)    │
   │                  │       │  │  • Error types               │  │       │                  │
   │ • OpenAIClient   │       │  │  • Configuration             │  │       │ • HttpTransport  │
   │ • Service traits │       │  └───────────────────────────────┘  │       │ • RetryExecutor  │
   │                  │       │                                     │       │ • RateLimiter    │
   └──────────────────┘       └─────────────────────────────────────┘       │ • CircuitBreaker │
          ▲                                                                  │ • Logger/Tracer  │
          │                                                                  └──────────────────┘
          │                                                                           ▲
   ┌──────────────────┐                                                      ┌──────────────────┐
   │ Primary Adapters │                                                      │Secondary Adapters│
   │                  │                                                      │                  │
   │ • User code      │                                                      │ • reqwest client │
   │ • Test harness   │                                                      │ • Primitives     │
   │ • CLI tools      │                                                      │ • Mock impls     │
   └──────────────────┘                                                      └──────────────────┘
```

### 2.3 Clean Architecture Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            External Systems                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  OpenAI API │  │  Primitives │  │  Telemetry  │  │   Config    │        │
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
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Interface Adapters Layer                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • OpenAIClientImpl          • ServiceImpl (all services)           │    │
│  │  • RequestBuilder            • ResponseParser                       │    │
│  │  • StreamHandler             • ErrorMapper                          │    │
│  │  • ResilienceOrchestrator    • AuthManager                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Application Layer                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • OpenAIClient trait        • ChatCompletionService trait          │    │
│  │  • EmbeddingsService trait   • FilesService trait                   │    │
│  │  • BatchesService trait      • ModelsService trait                  │    │
│  │  • ImagesService trait       • AudioService trait                   │    │
│  │  • ModerationsService trait  • FineTuningService trait              │    │
│  │  • AssistantsService trait   • (Sub-services)                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Domain Layer                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • Request types (ChatCompletionRequest, EmbeddingsRequest, etc.)   │    │
│  │  • Response types (ChatCompletionResponse, etc.)                    │    │
│  │  • Error types (OpenAIError hierarchy)                              │    │
│  │  • Value objects (ApiKey, Model, Usage, etc.)                       │    │
│  │  • Configuration (OpenAIConfig)                                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. System Context Diagram

### 3.1 C4 Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM CONTEXT                                  │
└─────────────────────────────────────────────────────────────────────────────┘

                        ┌───────────────────────────┐
                        │      Application          │
                        │      Developer            │
                        │                           │
                        │  Uses OpenAI module to    │
                        │  integrate LLM features   │
                        └─────────────┬─────────────┘
                                      │
                                      │ Uses
                                      ▼
┌───────────────────┐    ┌───────────────────────────┐    ┌───────────────────┐
│                   │    │                           │    │                   │
│  Integration Repo │◄───│   OpenAI Integration      │───►│    OpenAI API     │
│  Primitives       │    │   Module                  │    │                   │
│                   │    │                           │    │  api.openai.com   │
│  • errors         │    │  Provides type-safe       │    │                   │
│  • retry          │    │  access to OpenAI APIs    │    │  • Chat           │
│  • circuit-breaker│    │  with resilience          │    │  • Embeddings     │
│  • rate-limits    │    │  patterns                 │    │  • Files          │
│  • tracing        │    │                           │    │  • Batches        │
│  • logging        │    │  Rust + TypeScript        │    │  • Images         │
│  • types          │    │                           │    │  • Audio          │
│  • config         │    │                           │    │  • etc.           │
│                   │    │                           │    │                   │
└───────────────────┘    └───────────────────────────┘    └───────────────────┘
                                      │
                                      │ Emits
                                      ▼
                        ┌───────────────────────────┐
                        │   Observability Stack     │
                        │                           │
                        │  • Metrics (Prometheus)   │
                        │  • Traces (Jaeger/OTLP)   │
                        │  • Logs (structured)      │
                        └───────────────────────────┘
```

### 3.2 C4 Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CONTAINER DIAGRAM                               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                        OpenAI Integration Module                             │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Public API Container                         │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ OpenAIClient │  │ Service      │  │ Types &      │             │    │
│  │   │ Factory      │  │ Interfaces   │  │ Errors       │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      Orchestration Container                         │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ Resilience   │  │ Request      │  │ Response     │             │    │
│  │   │ Orchestrator │  │ Pipeline     │  │ Pipeline     │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ Middleware   │  │ Hook         │  │ Metrics      │             │    │
│  │   │ Chain        │  │ Manager      │  │ Collector    │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Transport Container                           │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ HTTP         │  │ SSE Stream   │  │ Multipart    │             │    │
│  │   │ Transport    │  │ Handler      │  │ Builder      │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ Auth         │  │ TLS          │  │ Connection   │             │    │
│  │   │ Manager      │  │ Handler      │  │ Pool         │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Component Architecture

### 4.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           COMPONENT ARCHITECTURE                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              OpenAIClientImpl                                │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Service Registry                               │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │  │
│  │  │  Chat   │ │Embedding│ │  Files  │ │ Batches │ │ Models  │         │  │
│  │  │ Service │ │ Service │ │ Service │ │ Service │ │ Service │         │  │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘         │  │
│  │       │           │           │           │           │               │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │  │
│  │  │ Images  │ │  Audio  │ │Moderate │ │FineTune │ │Assistants│        │  │
│  │  │ Service │ │ Service │ │ Service │ │ Service │ │ Service │         │  │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘         │  │
│  │       │           │           │           │           │               │  │
│  └───────┼───────────┼───────────┼───────────┼───────────┼───────────────┘  │
│          │           │           │           │           │                   │
│          └───────────┴───────────┼───────────┴───────────┘                   │
│                                  │                                           │
│                                  ▼                                           │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      Shared Infrastructure                             │  │
│  │                                                                        │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │  │
│  │  │   Resilience    │  │   HTTP          │  │   Auth          │        │  │
│  │  │   Orchestrator  │  │   Transport     │  │   Manager       │        │  │
│  │  │                 │  │                 │  │                 │        │  │
│  │  │ • Retry         │  │ • Connection    │  │ • API Key       │        │  │
│  │  │ • Rate Limit    │  │ • TLS           │  │ • Org ID        │        │  │
│  │  │ • Circuit Break │  │ • Streaming     │  │ • Project ID    │        │  │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘        │  │
│  │           │                    │                    │                  │  │
│  └───────────┼────────────────────┼────────────────────┼──────────────────┘  │
│              │                    │                    │                     │
└──────────────┼────────────────────┼────────────────────┼─────────────────────┘
               │                    │                    │
               ▼                    ▼                    ▼
┌──────────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Integration Repo     │ │ Integration Repo │ │ Integration Repo │
│ Primitives           │ │ Primitives       │ │ Primitives       │
│ (retry, circuit-     │ │ (logging,        │ │ (config)         │
│  breaker, rate-limit)│ │  tracing)        │ │                  │
└──────────────────────┘ └──────────────────┘ └──────────────────┘
```

### 4.2 Service Component Detail

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ChatCompletionServiceImpl                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Dependencies (Injected):                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • transport: Arc<dyn HttpTransport>                                 │    │
│  │  • auth_manager: Arc<AuthManager>                                    │    │
│  │  • resilience: Arc<ResilienceOrchestrator>                          │    │
│  │  • logger: Arc<dyn Logger>                                          │    │
│  │  • tracer: Arc<dyn Tracer>                                          │    │
│  │  • metrics: Arc<dyn MetricsRecorder>                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Configuration:                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • base_url: Url                                                     │    │
│  │  • endpoint: &'static str = "/chat/completions"                     │    │
│  │  • default_timeout: Duration                                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Public Methods:                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  + create(request) -> Result<Response, Error>                        │    │
│  │  + create_stream(request) -> Result<Stream, Error>                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Private Methods:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  - execute_request(request) -> Result<Response, Error>               │    │
│  │  - validate_request(request) -> Result<(), ValidationError>          │    │
│  │  - build_http_request(request) -> Result<HttpRequest, Error>         │    │
│  │  - parse_response(http_response) -> Result<Response, Error>          │    │
│  │  - record_metrics(response)                                          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Resilience Orchestrator Component

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ResilienceOrchestrator                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Components (from Primitives):                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐     │    │
│  │  │ RetryExecutor  │    │  RateLimiter   │    │CircuitBreaker  │     │    │
│  │  │                │    │                │    │                │     │    │
│  │  │ • max_retries  │    │ • rpm_limit    │    │ • failure_thres│     │    │
│  │  │ • backoff      │    │ • tpm_limit    │    │ • recovery_time│     │    │
│  │  │ • jitter       │    │ • queue_size   │    │ • state        │     │    │
│  │  └───────┬────────┘    └───────┬────────┘    └───────┬────────┘     │    │
│  │          │                     │                     │              │    │
│  │          └─────────────────────┼─────────────────────┘              │    │
│  │                                │                                    │    │
│  │                                ▼                                    │    │
│  │                    ┌────────────────────┐                          │    │
│  │                    │   Orchestration    │                          │    │
│  │                    │      Logic         │                          │    │
│  │                    │                    │                          │    │
│  │                    │ 1. Check circuit   │                          │    │
│  │                    │ 2. Acquire rate    │                          │    │
│  │                    │ 3. Execute w/retry │                          │    │
│  │                    │ 4. Update circuit  │                          │    │
│  │                    │ 5. Record metrics  │                          │    │
│  │                    └────────────────────┘                          │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Hooks (Optional):                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • retry_hook: Option<Arc<dyn RetryHook>>                            │    │
│  │  • rate_limit_hook: Option<Arc<dyn RateLimitHook>>                   │    │
│  │  • circuit_breaker_hook: Option<Arc<dyn CircuitBreakerHook>>         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Public Methods:                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  + execute<T>(operation, action) -> Result<T, Error>                 │    │
│  │  + execute_without_retry<T>(operation, action) -> Result<T, Error>   │    │
│  │  + get_circuit_state() -> CircuitState                               │    │
│  │  + get_rate_limit_status() -> RateLimitStatus                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Module Structure

### 5.1 High-Level Module Organization

```
integrations/
├── openai/                          # OpenAI Integration Module
│   ├── rust/                        # Rust implementation
│   │   ├── Cargo.toml
│   │   └── src/
│   │       └── ...
│   │
│   ├── typescript/                  # TypeScript implementation
│   │   ├── package.json
│   │   └── src/
│   │       └── ...
│   │
│   ├── docs/                        # Module documentation
│   │   ├── SPARC-OpenAI.md
│   │   ├── specification-openai.md
│   │   ├── pseudocode-openai-*.md
│   │   ├── architecture-openai-*.md
│   │   ├── refinement-openai.md
│   │   └── completion-openai.md
│   │
│   └── tests/                       # Shared test fixtures
│       ├── fixtures/
│       └── contracts/
│
├── primitives/                      # Shared primitives (dependencies)
│   ├── errors/
│   ├── retry/
│   ├── circuit-breaker/
│   ├── rate-limits/
│   ├── tracing/
│   ├── logging/
│   ├── types/
│   └── config/
│
└── anthropic/                       # Other modules (isolated)
    └── ...
```

---

## 6. Rust Crate Organization

### 6.1 Crate Structure

```
openai/rust/
├── Cargo.toml
├── src/
│   ├── lib.rs                       # Crate root, re-exports
│   │
│   ├── client/                      # Client module
│   │   ├── mod.rs
│   │   ├── config.rs                # OpenAIConfig
│   │   ├── factory.rs               # Client factory functions
│   │   └── client_impl.rs           # OpenAIClientImpl
│   │
│   ├── services/                    # Service implementations
│   │   ├── mod.rs
│   │   ├── chat/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # ChatCompletionServiceImpl
│   │   │   ├── types.rs             # Request/Response types
│   │   │   ├── stream.rs            # ChatCompletionStream
│   │   │   └── validation.rs        # Request validation
│   │   │
│   │   ├── embeddings/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs
│   │   │   ├── types.rs
│   │   │   └── validation.rs
│   │   │
│   │   ├── files/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs
│   │   │   ├── types.rs
│   │   │   └── validation.rs
│   │   │
│   │   ├── batches/
│   │   │   └── ...
│   │   │
│   │   ├── models/
│   │   │   └── ...
│   │   │
│   │   ├── images/
│   │   │   └── ...
│   │   │
│   │   ├── audio/
│   │   │   └── ...
│   │   │
│   │   ├── moderations/
│   │   │   └── ...
│   │   │
│   │   ├── fine_tuning/
│   │   │   └── ...
│   │   │
│   │   └── assistants/
│   │       ├── mod.rs
│   │       ├── service.rs
│   │       ├── types.rs
│   │       ├── threads.rs
│   │       ├── messages.rs
│   │       ├── runs.rs
│   │       └── vector_stores.rs
│   │
│   ├── transport/                   # HTTP transport layer
│   │   ├── mod.rs
│   │   ├── http_transport.rs        # Trait + reqwest impl
│   │   ├── request_builder.rs       # Request construction
│   │   ├── response_parser.rs       # Response parsing
│   │   ├── stream_handler.rs        # SSE handling
│   │   └── multipart.rs             # Multipart form builder
│   │
│   ├── auth/                        # Authentication
│   │   ├── mod.rs
│   │   ├── auth_manager.rs
│   │   └── api_key.rs               # SecretString wrapper
│   │
│   ├── resilience/                  # Resilience patterns
│   │   ├── mod.rs
│   │   ├── orchestrator.rs          # Main orchestrator
│   │   └── hooks.rs                 # Hook traits
│   │
│   ├── errors/                      # Error types
│   │   ├── mod.rs
│   │   ├── error.rs                 # OpenAIError enum
│   │   ├── categories.rs            # Error category enums
│   │   └── mapping.rs               # HTTP to error mapping
│   │
│   └── types/                       # Shared types
│       ├── mod.rs
│       ├── common.rs                # Usage, DeleteResponse, etc.
│       └── serde_helpers.rs         # Custom serialization
│
├── tests/                           # Integration tests
│   ├── common/
│   │   └── mod.rs                   # Test utilities
│   │
│   ├── chat_completion_tests.rs
│   ├── embeddings_tests.rs
│   ├── files_tests.rs
│   └── ...
│
├── benches/                         # Benchmarks
│   └── throughput.rs
│
└── examples/                        # Usage examples
    ├── chat_completion.rs
    ├── streaming.rs
    └── batch_embeddings.rs
```

### 6.2 Cargo.toml

```toml
[package]
name = "integrations-openai"
version = "0.1.0"
edition = "2021"
description = "OpenAI Integration Module for LLM-Dev-Ops"
license = "LLMDevOps-PSACL-1.0"
repository = "https://github.com/llm-dev-ops/integrations"
documentation = "https://docs.llm-dev-ops.io/integrations/openai"
keywords = ["openai", "llm", "ai", "integration"]
categories = ["api-bindings", "asynchronous"]

[dependencies]
# Integration Repo Primitives
integrations-errors = { path = "../../primitives/errors" }
integrations-retry = { path = "../../primitives/retry" }
integrations-circuit-breaker = { path = "../../primitives/circuit-breaker" }
integrations-rate-limits = { path = "../../primitives/rate-limits" }
integrations-tracing = { path = "../../primitives/tracing" }
integrations-logging = { path = "../../primitives/logging" }
integrations-types = { path = "../../primitives/types" }
integrations-config = { path = "../../primitives/config" }

# Approved third-party dependencies
reqwest = { version = "0.12", features = ["json", "stream", "multipart", "rustls-tls"] }
tokio = { version = "1.0", features = ["rt-multi-thread", "macros", "time"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
secrecy = { version = "0.8", features = ["serde"] }
bytes = "1.0"
futures = "0.3"
async-trait = "0.1"
thiserror = "1.0"
url = "2.0"
http = "1.0"
mime = "0.3"
base64 = "0.22"
pin-project-lite = "0.2"

[dev-dependencies]
tokio-test = "0.4"
mockall = "0.12"
wiremock = "0.6"
test-case = "3.0"
criterion = "0.5"
pretty_assertions = "1.0"

[features]
default = ["rustls"]
rustls = ["reqwest/rustls-tls"]
native-tls = ["reqwest/native-tls"]
full = ["assistants", "fine-tuning", "batches"]
assistants = []
fine-tuning = []
batches = []

[[bench]]
name = "throughput"
harness = false

[[example]]
name = "chat_completion"
path = "examples/chat_completion.rs"

[[example]]
name = "streaming"
path = "examples/streaming.rs"
```

### 6.3 Module Visibility and Re-exports

```rust
// src/lib.rs

//! OpenAI Integration Module
//!
//! Provides type-safe access to OpenAI APIs with built-in resilience patterns.
//!
//! # Example
//!
//! ```rust
//! use integrations_openai::{OpenAIClient, OpenAIConfig};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let client = integrations_openai::from_env()?;
//!
//!     let response = client.chat().create(ChatCompletionRequest {
//!         model: "gpt-4".to_string(),
//!         messages: vec![/* ... */],
//!         ..Default::default()
//!     }).await?;
//!
//!     Ok(())
//! }
//! ```

// Re-export public API
pub use client::{OpenAIClient, OpenAIClientFactory, OpenAIConfig};
pub use errors::OpenAIError;

// Service traits
pub use services::chat::{ChatCompletionService, ChatCompletionStream};
pub use services::embeddings::EmbeddingsService;
pub use services::files::FilesService;
pub use services::batches::BatchesService;
pub use services::models::ModelsService;
pub use services::images::ImagesService;
pub use services::audio::AudioService;
pub use services::moderations::ModerationsService;
pub use services::fine_tuning::FineTuningService;

#[cfg(feature = "assistants")]
pub use services::assistants::{
    AssistantsService, ThreadsService, MessagesService, RunsService, VectorStoresService
};

// Types
pub use services::chat::types::*;
pub use services::embeddings::types::*;
pub use services::files::types::*;
pub use services::batches::types::*;
pub use services::models::types::*;
pub use services::images::types::*;
pub use services::audio::types::*;
pub use services::moderations::types::*;
pub use services::fine_tuning::types::*;

#[cfg(feature = "assistants")]
pub use services::assistants::types::*;

// Factory functions
pub fn create(config: OpenAIConfig) -> Result<impl OpenAIClient, OpenAIError> {
    client::factory::create_openai_client(config)
}

pub fn from_env() -> Result<impl OpenAIClient, OpenAIError> {
    client::factory::create_openai_client_from_env()
}

// Internal modules (not re-exported)
mod client;
mod services;
mod transport;
mod auth;
mod resilience;
mod errors;
mod types;
```

---

## 7. TypeScript Package Organization

### 7.1 Package Structure

```
openai/typescript/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── .eslintrc.js
├── .prettierrc
│
├── src/
│   ├── index.ts                     # Package entry, re-exports
│   │
│   ├── client/
│   │   ├── index.ts
│   │   ├── config.ts                # OpenAIConfig interface
│   │   ├── factory.ts               # createOpenAIClient()
│   │   └── client-impl.ts           # OpenAIClientImpl
│   │
│   ├── services/
│   │   ├── index.ts
│   │   ├── chat/
│   │   │   ├── index.ts
│   │   │   ├── service.ts           # ChatCompletionServiceImpl
│   │   │   ├── types.ts             # Request/Response types
│   │   │   ├── stream.ts            # Async iterator for streaming
│   │   │   └── validation.ts        # Zod schemas
│   │   │
│   │   ├── embeddings/
│   │   │   └── ...
│   │   │
│   │   ├── files/
│   │   │   └── ...
│   │   │
│   │   ├── batches/
│   │   │   └── ...
│   │   │
│   │   ├── models/
│   │   │   └── ...
│   │   │
│   │   ├── images/
│   │   │   └── ...
│   │   │
│   │   ├── audio/
│   │   │   └── ...
│   │   │
│   │   ├── moderations/
│   │   │   └── ...
│   │   │
│   │   ├── fine-tuning/
│   │   │   └── ...
│   │   │
│   │   └── assistants/
│   │       ├── index.ts
│   │       ├── service.ts
│   │       ├── types.ts
│   │       ├── threads.ts
│   │       ├── messages.ts
│   │       ├── runs.ts
│   │       └── vector-stores.ts
│   │
│   ├── transport/
│   │   ├── index.ts
│   │   ├── http-transport.ts        # Interface + fetch impl
│   │   ├── request-builder.ts
│   │   ├── response-parser.ts
│   │   ├── stream-handler.ts        # SSE parsing
│   │   └── multipart.ts
│   │
│   ├── auth/
│   │   ├── index.ts
│   │   └── auth-manager.ts
│   │
│   ├── resilience/
│   │   ├── index.ts
│   │   ├── orchestrator.ts
│   │   └── hooks.ts
│   │
│   ├── errors/
│   │   ├── index.ts
│   │   ├── error.ts                 # OpenAIError class
│   │   ├── categories.ts
│   │   └── mapping.ts
│   │
│   └── types/
│       ├── index.ts
│       └── common.ts
│
├── tests/
│   ├── setup.ts                     # Test setup
│   ├── helpers/
│   │   ├── mock-transport.ts
│   │   └── fixtures.ts
│   │
│   ├── unit/
│   │   ├── chat.test.ts
│   │   ├── embeddings.test.ts
│   │   └── ...
│   │
│   └── integration/
│       └── mock-server.test.ts
│
└── examples/
    ├── chat-completion.ts
    ├── streaming.ts
    └── batch-embeddings.ts
```

### 7.2 package.json

```json
{
  "name": "@integrations/openai",
  "version": "0.1.0",
  "description": "OpenAI Integration Module for LLM-Dev-Ops",
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
    "./embeddings": {
      "import": "./dist/services/embeddings/index.mjs",
      "require": "./dist/services/embeddings/index.js",
      "types": "./dist/services/embeddings/index.d.ts"
    }
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@integrations/errors": "workspace:*",
    "@integrations/retry": "workspace:*",
    "@integrations/circuit-breaker": "workspace:*",
    "@integrations/rate-limits": "workspace:*",
    "@integrations/tracing": "workspace:*",
    "@integrations/logging": "workspace:*",
    "@integrations/types": "workspace:*",
    "@integrations/config": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0",
    "eslint": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "prettier": "^3.0.0",
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
    "directory": "openai/typescript"
  },
  "keywords": [
    "openai",
    "llm",
    "ai",
    "integration",
    "typescript"
  ],
  "license": "LLMDevOps-PSACL-1.0"
}
```

### 7.3 Module Exports (index.ts)

```typescript
// src/index.ts

/**
 * OpenAI Integration Module
 *
 * Provides type-safe access to OpenAI APIs with built-in resilience patterns.
 *
 * @example
 * ```typescript
 * import { createOpenAIClient, ChatCompletionRequest } from '@integrations/openai';
 *
 * const client = createOpenAIClient({ apiKey: process.env.OPENAI_API_KEY! });
 *
 * const response = await client.chat.create({
 *   model: 'gpt-4',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 *
 * @packageDocumentation
 */

// Client exports
export { OpenAIClient, OpenAIConfig } from './client';
export { createOpenAIClient, createOpenAIClientFromEnv } from './client/factory';

// Error exports
export { OpenAIError } from './errors';
export type {
  ConfigurationError,
  AuthenticationError,
  RequestError,
  NetworkError,
  RateLimitError,
  ServerError,
  ResponseError,
  ResourceError,
  ContentPolicyError,
} from './errors';

// Service interfaces
export type {
  ChatCompletionService,
  EmbeddingsService,
  FilesService,
  BatchesService,
  ModelsService,
  ImagesService,
  AudioService,
  ModerationsService,
  FineTuningService,
  AssistantsService,
  ThreadsService,
  MessagesService,
  RunsService,
  VectorStoresService,
} from './services';

// Type exports - Chat
export type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatMessage,
  ChatChoice,
  Tool,
  ToolCall,
  ToolChoice,
  ResponseFormat,
} from './services/chat/types';

// Type exports - Embeddings
export type {
  EmbeddingsRequest,
  EmbeddingsResponse,
  Embedding,
  EmbeddingsInput,
} from './services/embeddings/types';

// Type exports - Files
export type {
  FileUploadRequest,
  FileObject,
  FileList,
  FileListParams,
  FilePurpose,
} from './services/files/types';

// Type exports - Batches
export type {
  BatchCreateRequest,
  Batch,
  BatchList,
  BatchStatus,
  BatchEndpoint,
} from './services/batches/types';

// Type exports - Models
export type {
  Model,
  ModelList,
  DeleteResponse,
} from './services/models/types';

// Type exports - Images
export type {
  ImageGenerationRequest,
  ImageEditRequest,
  ImageVariationRequest,
  ImageResponse,
  ImageData,
} from './services/images/types';

// Type exports - Audio
export type {
  TranscriptionRequest,
  TranscriptionResponse,
  TranslationRequest,
  TranslationResponse,
  SpeechRequest,
} from './services/audio/types';

// Type exports - Moderations
export type {
  ModerationRequest,
  ModerationResponse,
  ModerationResult,
} from './services/moderations/types';

// Type exports - Fine-tuning
export type {
  FineTuningJobRequest,
  FineTuningJob,
  FineTuningJobList,
  FineTuningEvent,
} from './services/fine-tuning/types';

// Type exports - Assistants
export type {
  Assistant,
  AssistantCreateRequest,
  AssistantList,
  Thread,
  Message,
  Run,
  RunStatus,
  VectorStore,
} from './services/assistants/types';

// Common types
export type { Usage, RateLimitHeaders } from './types/common';
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-08 | SPARC Generator | Initial architecture (Part 1) |

---

**Continued in Part 2: Data Flow, State Management, and Concurrency Patterns**
