# Anthropic Integration Module - Architecture (Part 1)

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/anthropic`
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

The Anthropic Integration Module implements a layered architecture that separates concerns across four distinct tiers:

1. **Public Interface Layer** - Exposes type-safe service interfaces (Messages, Models, Batches, Admin)
2. **Orchestration Layer** - Coordinates resilience patterns and request lifecycle
3. **Transport Layer** - Handles HTTP communication and SSE streaming
4. **Primitive Integration Layer** - Connects to shared Integration Repo primitives

### 1.2 Key Architectural Decisions

| Decision | Rationale | Trade-offs |
|----------|-----------|------------|
| **Trait-based abstraction** | Enables London-School TDD with mock injection | Slight runtime overhead from dynamic dispatch |
| **Lazy service initialization** | Reduces memory footprint, faster startup | First access has initialization cost |
| **Centralized resilience orchestration** | Consistent retry/circuit-breaker behavior | Adds complexity to call stack |
| **Streaming via async iterators** | Native async/await, backpressure support | Requires careful lifetime management |
| **No cross-module dependencies** | Complete isolation, independent versioning | May duplicate some patterns across modules |
| **Beta features as configuration** | Clean API, opt-in functionality | Requires header management |

### 1.3 Architecture Constraints

| Constraint | Source | Impact |
|------------|--------|--------|
| No ruvbase dependency | Specification requirement | Must use only Integration Repo primitives |
| No cross-integration dependencies | Module isolation rule | Cannot share code with OpenAI/Google modules |
| Rust + TypeScript dual implementation | Multi-language support | Must maintain API parity |
| Integration Repo primitives only | Dependency policy | Limited to approved external crates |
| TLS 1.2+ required | Security requirement | Cannot use older TLS versions |

### 1.4 Anthropic-Specific Considerations

| Consideration | Description |
|---------------|-------------|
| **API Version Header** | Required `anthropic-version` header on all requests |
| **Beta Features** | Optional `anthropic-beta` header for feature flags |
| **SSE Format** | Anthropic uses standard SSE with typed event payloads |
| **Rate Limiting** | Headers include token-based limits, not just request-based |
| **Admin API** | Separate authentication scope for organization management |

---

## 2. Design Principles

### 2.1 SOLID Principles Application

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SOLID in Anthropic Module                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  S - Single Responsibility                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ MessagesService  │  │ HttpTransport    │  │ AuthManager      │          │
│  │ handles message  │  │ handles HTTP     │  │ handles auth     │          │
│  │ operations only  │  │ requests only    │  │ headers only     │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                              │
│  O - Open/Closed                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │ AnthropicClient is OPEN for extension via:                        │       │
│  │   • Beta feature flags (BetaFeature enum)                         │       │
│  │   • Custom hooks (retry, rate-limit, circuit-breaker)             │       │
│  │   • Custom transport implementations                               │       │
│  │ But CLOSED for modification of core request/response handling     │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  L - Liskov Substitution                                                     │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │ Any implementation of HttpTransport can replace another:          │       │
│  │   • ReqwestHttpTransport (production)                             │       │
│  │   • MockHttpTransport (testing)                                   │       │
│  │   • RecordingTransport (debugging)                                │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  I - Interface Segregation                                                   │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐               │
│  │ Messages   │ │ Models     │ │ Batches    │ │ Admin      │               │
│  │ Service    │ │ Service    │ │ Service    │ │ Service    │               │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘               │
│  Clients depend only on the services they use                               │
│                                                                              │
│  D - Dependency Inversion                                                    │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │ High-level: MessagesServiceImpl                                   │       │
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
                              │  │  • MessagesService            │  │
                              │  │  • ModelsService              │  │
                              │  │  • MessageBatchesService      │  │
                              │  │  • AdminService               │  │
                              │  └───────────────────────────────┘  │
                              │                                     │
   ┌──────────────────┐       │  ┌───────────────────────────────┐  │       ┌──────────────────┐
   │   Primary Ports  │       │  │       Domain Model            │  │       │ Secondary Ports  │
   │  (Driving Side)  │◄─────►│  │  • Request/Response types    │  │◄─────►│ (Driven Side)    │
   │                  │       │  │  • Error types               │  │       │                  │
   │ • AnthropicClient│       │  │  • Configuration             │  │       │ • HttpTransport  │
   │ • Service traits │       │  │  • Content blocks            │  │       │ • RetryExecutor  │
   │                  │       │  └───────────────────────────────┘  │       │ • RateLimiter    │
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
│  │Anthropic API│  │  Primitives │  │  Telemetry  │  │   Config    │        │
│  │             │  │             │  │             │  │             │        │
│  │ Messages    │  │ • errors    │  │ • traces    │  │ • env vars  │        │
│  │ Models      │  │ • retry     │  │ • metrics   │  │ • files     │        │
│  │ Batches     │  │ • circuit   │  │ • logs      │  │             │        │
│  │ Admin       │  │ • rate-limit│  │             │  │             │        │
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
│  │  • AnthropicClientImpl       • ServiceImpl (all services)           │    │
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
│  │  • AnthropicClient trait     • MessagesService trait                │    │
│  │  • ModelsService trait       • MessageBatchesService trait          │    │
│  │  • AdminService trait        • OrganizationsService trait           │    │
│  │  • WorkspacesService trait   • ApiKeysService trait                 │    │
│  │  • InvitesService trait                                             │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Domain Layer                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • Request types (CreateMessageRequest, CountTokensRequest, etc.)   │    │
│  │  • Response types (Message, MessageStream, TokenCount, etc.)        │    │
│  │  • Content blocks (TextBlock, ImageBlock, ToolUseBlock, etc.)       │    │
│  │  • Error types (AnthropicError hierarchy)                           │    │
│  │  • Value objects (ApiKey, Model, Usage, etc.)                       │    │
│  │  • Configuration (AnthropicConfig, BetaFeature)                     │    │
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
                        │  Uses Anthropic module    │
                        │  to integrate Claude      │
                        │  features                 │
                        └─────────────┬─────────────┘
                                      │
                                      │ Uses
                                      ▼
┌───────────────────┐    ┌───────────────────────────┐    ┌───────────────────┐
│                   │    │                           │    │                   │
│  Integration Repo │◄───│   Anthropic Integration   │───►│  Anthropic API    │
│  Primitives       │    │   Module                  │    │                   │
│                   │    │                           │    │api.anthropic.com  │
│  • errors         │    │  Provides type-safe       │    │                   │
│  • retry          │    │  access to Claude APIs    │    │  • Messages       │
│  • circuit-breaker│    │  with resilience          │    │  • Models         │
│  • rate-limits    │    │  patterns                 │    │  • Token Count    │
│  • tracing        │    │                           │    │  • Batches        │
│  • logging        │    │  Rust + TypeScript        │    │  • Admin          │
│  • types          │    │                           │    │                   │
│  • config         │    │  Beta features:           │    │  Beta:            │
│                   │    │  • Extended thinking      │    │  • Thinking       │
│                   │    │  • PDF support            │    │  • PDFs           │
│                   │    │  • Prompt caching         │    │  • Caching        │
│                   │    │  • Computer use           │    │  • Computer use   │
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
│                       Anthropic Integration Module                           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Public API Container                         │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ Anthropic    │  │ Service      │  │ Types &      │             │    │
│  │   │ Client       │  │ Interfaces   │  │ Errors       │             │    │
│  │   │ Factory      │  │              │  │              │             │    │
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
│  │   │ Beta Feature │  │ Hook         │  │ Metrics      │             │    │
│  │   │ Manager      │  │ Manager      │  │ Collector    │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Transport Container                           │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ HTTP         │  │ SSE Stream   │  │ Request      │             │    │
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
│                            AnthropicClientImpl                               │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Service Registry                               │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │  │
│  │  │  Messages   │ │   Models    │ │  Batches    │ │   Admin     │     │  │
│  │  │  Service    │ │   Service   │ │  Service    │ │   Service   │     │  │
│  │  │             │ │             │ │             │ │  (optional) │     │  │
│  │  │ • create    │ │ • list      │ │ • create    │ │             │     │  │
│  │  │ • stream    │ │ • get       │ │ • list      │ │ • orgs      │     │  │
│  │  │ • count     │ │             │ │ • get       │ │ • workspaces│     │  │
│  │  │             │ │             │ │ • results   │ │ • api_keys  │     │  │
│  │  │             │ │             │ │ • cancel    │ │ • invites   │     │  │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘     │  │
│  │         │               │               │               │             │  │
│  └─────────┼───────────────┼───────────────┼───────────────┼─────────────┘  │
│            │               │               │               │                 │
│            └───────────────┴───────┬───────┴───────────────┘                 │
│                                    │                                         │
│                                    ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                      Shared Infrastructure                             │  │
│  │                                                                        │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │  │
│  │  │   Resilience    │  │   HTTP          │  │   Auth          │        │  │
│  │  │   Orchestrator  │  │   Transport     │  │   Manager       │        │  │
│  │  │                 │  │                 │  │                 │        │  │
│  │  │ • Retry         │  │ • Connection    │  │ • API Key       │        │  │
│  │  │ • Rate Limit    │  │ • TLS 1.2+      │  │ • API Version   │        │  │
│  │  │ • Circuit Break │  │ • SSE Streaming │  │ • Beta Features │        │  │
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

### 4.2 Messages Service Component Detail

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MessagesServiceImpl                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Dependencies (Injected - London-School TDD):                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • transport: Arc<dyn HttpTransport>                                 │    │
│  │  • auth_manager: Arc<AuthManager>                                    │    │
│  │  • resilience: Arc<ResilienceOrchestrator>                          │    │
│  │  • logger: Arc<dyn Logger>                                          │    │
│  │  • tracer: Arc<dyn Tracer>                                          │    │
│  │  • metrics_hook: Option<Arc<dyn MetricsHook>>                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Configuration:                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • base_url: Url                                                     │    │
│  │  • endpoint: &'static str = "/v1/messages"                          │    │
│  │  • count_endpoint: &'static str = "/v1/messages/count_tokens"       │    │
│  │  • default_timeout: Duration                                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Public Methods (Trait Implementation):                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  + create(request) -> Result<Message, AnthropicError>                │    │
│  │  + create_stream(request) -> Result<MessageStream, AnthropicError>   │    │
│  │  + count_tokens(request) -> Result<TokenCount, AnthropicError>       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Private Methods:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  - execute_create_request(request) -> Result<Message, Error>         │    │
│  │  - validate_request(request) -> Result<(), ValidationError>          │    │
│  │  - validate_content_block(block) -> Result<(), ValidationError>      │    │
│  │  - build_http_request(request) -> Result<HttpRequest, Error>         │    │
│  │  - parse_response(http_response) -> Result<Message, Error>           │    │
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
│  Components (from Integration Repo Primitives):                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐     │    │
│  │  │ RetryExecutor  │    │  RateLimiter   │    │CircuitBreaker  │     │    │
│  │  │                │    │                │    │                │     │    │
│  │  │ • max_retries  │    │ • rpm_limit    │    │ • failure_thres│     │    │
│  │  │ • backoff      │    │ • tpm_limit    │    │ • recovery_time│     │    │
│  │  │ • jitter       │    │ • concurrent   │    │ • state        │     │    │
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
│  │                    │ 3. Start span      │                          │    │
│  │                    │ 4. Execute w/retry │                          │    │
│  │                    │ 5. Update circuit  │                          │    │
│  │                    │ 6. Record metrics  │                          │    │
│  │                    └────────────────────┘                          │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Hooks (Optional - for extensibility):                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • retry_hook: Option<Arc<dyn RetryHook>>                            │    │
│  │  • rate_limit_hook: Option<Arc<dyn RateLimitHook>>                   │    │
│  │  • circuit_breaker_hook: Option<Arc<dyn CircuitBreakerHook>>         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Public Methods:                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  + execute<T>(operation, action) -> Result<T, AnthropicError>        │    │
│  │  + execute_without_retry<T>(operation, action) -> Result<T, Error>   │    │
│  │  + get_circuit_state() -> CircuitState                               │    │
│  │  + get_rate_limit_status() -> RateLimitStatus                        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 AuthManager Component (Anthropic-Specific)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AuthManager                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  State:                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • api_key: SecretString          (x-api-key header)                 │    │
│  │  • api_version: String            (anthropic-version header)         │    │
│  │  • beta_features: Vec<BetaFeature> (anthropic-beta header)           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Header Generation:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  get_headers() returns:                                              │    │
│  │  ┌────────────────────────────────────────────────────────────┐     │    │
│  │  │  x-api-key: sk-ant-...                                     │     │    │
│  │  │  anthropic-version: 2023-06-01                             │     │    │
│  │  │  anthropic-beta: extended-thinking-2024-12-20,pdfs-...     │     │    │
│  │  │  content-type: application/json                             │     │    │
│  │  └────────────────────────────────────────────────────────────┘     │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Beta Feature Mapping:                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  ExtendedThinking  -> "extended-thinking-2024-12-20"                 │    │
│  │  PdfSupport        -> "pdfs-2024-09-25"                              │    │
│  │  PromptCaching     -> "prompt-caching-2024-07-31"                    │    │
│  │  TokenCounting     -> "token-counting-2024-11-01"                    │    │
│  │  MessageBatches    -> "message-batches-2024-09-24"                   │    │
│  │  ComputerUse       -> "computer-use-2024-10-22"                      │    │
│  │  Custom(String)    -> <user-provided>                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Module Structure

### 5.1 High-Level Module Organization

```
integrations/
├── anthropic/                       # Anthropic Integration Module
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
│   ├── plans/                       # SPARC documentation
│   │   ├── SPARC-Anthropic.md
│   │   ├── specification-anthropic.md
│   │   ├── pseudocode-anthropic-*.md
│   │   ├── architecture-anthropic-*.md
│   │   ├── refinement-anthropic.md
│   │   └── completion-anthropic.md
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
└── openai/                          # Other modules (isolated)
    └── ...
```

---

## 6. Rust Crate Organization

### 6.1 Crate Structure

```
anthropic/rust/
├── Cargo.toml
├── src/
│   ├── lib.rs                       # Crate root, re-exports
│   │
│   ├── client/                      # Client module
│   │   ├── mod.rs
│   │   ├── config.rs                # AnthropicConfig, BetaFeature
│   │   ├── factory.rs               # Client factory functions
│   │   └── client_impl.rs           # AnthropicClientImpl
│   │
│   ├── services/                    # Service implementations
│   │   ├── mod.rs
│   │   ├── messages/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # MessagesServiceImpl
│   │   │   ├── types.rs             # Request/Response types
│   │   │   ├── content.rs           # Content block types
│   │   │   ├── stream.rs            # MessageStream
│   │   │   └── validation.rs        # Request validation
│   │   │
│   │   ├── models/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # ModelsServiceImpl
│   │   │   └── types.rs
│   │   │
│   │   ├── batches/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # MessageBatchesServiceImpl
│   │   │   ├── types.rs
│   │   │   ├── results_stream.rs    # BatchResultsStream
│   │   │   └── validation.rs
│   │   │
│   │   └── admin/
│   │       ├── mod.rs
│   │       ├── service.rs           # AdminServiceImpl
│   │       ├── organizations.rs     # OrganizationsServiceImpl
│   │       ├── workspaces.rs        # WorkspacesServiceImpl
│   │       ├── api_keys.rs          # ApiKeysServiceImpl
│   │       ├── invites.rs           # InvitesServiceImpl
│   │       └── types.rs
│   │
│   ├── transport/                   # HTTP transport layer
│   │   ├── mod.rs
│   │   ├── http_transport.rs        # Trait + reqwest impl
│   │   ├── request_builder.rs       # Request construction
│   │   ├── response_parser.rs       # Response parsing
│   │   ├── sse_handler.rs           # SSE stream parsing
│   │   └── rate_limit_headers.rs    # Rate limit header parsing
│   │
│   ├── auth/                        # Authentication
│   │   ├── mod.rs
│   │   ├── auth_manager.rs          # AuthManager impl
│   │   └── beta_features.rs         # BetaFeature enum
│   │
│   ├── resilience/                  # Resilience patterns
│   │   ├── mod.rs
│   │   ├── orchestrator.rs          # Main orchestrator
│   │   └── hooks.rs                 # Hook traits
│   │
│   ├── errors/                      # Error types
│   │   ├── mod.rs
│   │   ├── error.rs                 # AnthropicError enum
│   │   ├── categories.rs            # Error category enums
│   │   └── mapping.rs               # HTTP to error mapping
│   │
│   └── types/                       # Shared types
│       ├── mod.rs
│       ├── common.rs                # Usage, Model, etc.
│       └── serde_helpers.rs         # Custom serialization
│
├── tests/                           # Integration tests
│   ├── common/
│   │   └── mod.rs                   # Test utilities
│   │
│   ├── messages_tests.rs
│   ├── streaming_tests.rs
│   ├── models_tests.rs
│   ├── batches_tests.rs
│   └── admin_tests.rs
│
├── benches/                         # Benchmarks
│   └── throughput.rs
│
└── examples/                        # Usage examples
    ├── basic_message.rs
    ├── streaming.rs
    ├── extended_thinking.rs
    ├── tool_use.rs
    └── batch_processing.rs
```

### 6.2 Cargo.toml

```toml
[package]
name = "integrations-anthropic"
version = "0.1.0"
edition = "2021"
description = "Anthropic Claude Integration Module for LLM-Dev-Ops"
license = "LLMDevOps-PSACL-1.0"
repository = "https://github.com/llm-dev-ops/integrations"
documentation = "https://docs.llm-dev-ops.io/integrations/anthropic"
keywords = ["anthropic", "claude", "llm", "ai", "integration"]
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
reqwest = { version = "0.12", features = ["json", "stream", "rustls-tls"] }
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
full = ["admin", "batches", "beta"]
admin = []
batches = []
beta = []

[[bench]]
name = "throughput"
harness = false

[[example]]
name = "basic_message"
path = "examples/basic_message.rs"

[[example]]
name = "streaming"
path = "examples/streaming.rs"

[[example]]
name = "extended_thinking"
path = "examples/extended_thinking.rs"
required-features = ["beta"]
```

### 6.3 Module Visibility and Re-exports

```rust
// src/lib.rs

//! Anthropic Claude Integration Module
//!
//! Provides type-safe access to Anthropic's Claude APIs with built-in resilience patterns.
//!
//! # Example
//!
//! ```rust
//! use integrations_anthropic::{AnthropicClient, CreateMessageRequest};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let client = integrations_anthropic::from_env()?;
//!
//!     let response = client.messages().create(CreateMessageRequest {
//!         model: "claude-sonnet-4-20250514".to_string(),
//!         max_tokens: 1024,
//!         messages: vec![/* ... */],
//!         ..Default::default()
//!     }).await?;
//!
//!     Ok(())
//! }
//! ```

// Re-export public API
pub use client::{AnthropicClient, AnthropicClientFactory, AnthropicConfig};
pub use client::config::BetaFeature;
pub use errors::AnthropicError;

// Service traits
pub use services::messages::{MessagesService, MessageStream};
pub use services::models::ModelsService;

#[cfg(feature = "batches")]
pub use services::batches::{MessageBatchesService, BatchResultsStream};

#[cfg(feature = "admin")]
pub use services::admin::{
    AdminService, OrganizationsService, WorkspacesService,
    ApiKeysService, InvitesService
};

// Types - Messages
pub use services::messages::types::*;

// Types - Models
pub use services::models::types::*;

// Types - Batches
#[cfg(feature = "batches")]
pub use services::batches::types::*;

// Types - Admin
#[cfg(feature = "admin")]
pub use services::admin::types::*;

// Factory functions
pub fn create(config: AnthropicConfig) -> Result<impl AnthropicClient, AnthropicError> {
    client::factory::create_anthropic_client(config)
}

pub fn from_env() -> Result<impl AnthropicClient, AnthropicError> {
    client::factory::create_anthropic_client_from_env()
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
anthropic/typescript/
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
│   │   ├── config.ts                # AnthropicConfig interface
│   │   ├── factory.ts               # createAnthropicClient()
│   │   ├── client-impl.ts           # AnthropicClientImpl
│   │   └── beta-features.ts         # BetaFeature type
│   │
│   ├── services/
│   │   ├── index.ts
│   │   ├── messages/
│   │   │   ├── index.ts
│   │   │   ├── service.ts           # MessagesServiceImpl
│   │   │   ├── types.ts             # Request/Response types
│   │   │   ├── content.ts           # Content block types
│   │   │   ├── stream.ts            # Async iterator for streaming
│   │   │   └── validation.ts        # Zod schemas
│   │   │
│   │   ├── models/
│   │   │   ├── index.ts
│   │   │   ├── service.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── batches/
│   │   │   ├── index.ts
│   │   │   ├── service.ts
│   │   │   ├── types.ts
│   │   │   ├── results-stream.ts
│   │   │   └── validation.ts
│   │   │
│   │   └── admin/
│   │       ├── index.ts
│   │       ├── service.ts
│   │       ├── organizations.ts
│   │       ├── workspaces.ts
│   │       ├── api-keys.ts
│   │       ├── invites.ts
│   │       └── types.ts
│   │
│   ├── transport/
│   │   ├── index.ts
│   │   ├── http-transport.ts        # Interface + fetch impl
│   │   ├── request-builder.ts
│   │   ├── response-parser.ts
│   │   └── sse-handler.ts           # SSE parsing
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
│   │   ├── error.ts                 # AnthropicError class
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
│   │   ├── messages.test.ts
│   │   ├── streaming.test.ts
│   │   ├── models.test.ts
│   │   └── batches.test.ts
│   │
│   └── integration/
│       └── mock-server.test.ts
│
└── examples/
    ├── basic-message.ts
    ├── streaming.ts
    ├── extended-thinking.ts
    ├── tool-use.ts
    └── batch-processing.ts
```

### 7.2 package.json

```json
{
  "name": "@integrations/anthropic",
  "version": "0.1.0",
  "description": "Anthropic Claude Integration Module for LLM-Dev-Ops",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./messages": {
      "import": "./dist/services/messages/index.mjs",
      "require": "./dist/services/messages/index.js",
      "types": "./dist/services/messages/index.d.ts"
    },
    "./models": {
      "import": "./dist/services/models/index.mjs",
      "require": "./dist/services/models/index.js",
      "types": "./dist/services/models/index.d.ts"
    },
    "./batches": {
      "import": "./dist/services/batches/index.mjs",
      "require": "./dist/services/batches/index.js",
      "types": "./dist/services/batches/index.d.ts"
    },
    "./admin": {
      "import": "./dist/services/admin/index.mjs",
      "require": "./dist/services/admin/index.js",
      "types": "./dist/services/admin/index.d.ts"
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
    "@integrations/config": "workspace:*",
    "zod": "^3.22.0",
    "eventsource-parser": "^1.1.0"
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
    "directory": "anthropic/typescript"
  },
  "keywords": [
    "anthropic",
    "claude",
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
 * Anthropic Claude Integration Module
 *
 * Provides type-safe access to Anthropic's Claude APIs with built-in resilience patterns.
 *
 * @example
 * ```typescript
 * import { createAnthropicClient, CreateMessageRequest } from '@integrations/anthropic';
 *
 * const client = createAnthropicClient({ apiKey: process.env.ANTHROPIC_API_KEY! });
 *
 * const response = await client.messages.create({
 *   model: 'claude-sonnet-4-20250514',
 *   max_tokens: 1024,
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 *
 * @packageDocumentation
 */

// Client exports
export { AnthropicClient, AnthropicConfig } from './client';
export { createAnthropicClient, createAnthropicClientFromEnv } from './client/factory';
export { BetaFeature } from './client/beta-features';

// Error exports
export { AnthropicError } from './errors';
export type {
  ConfigurationError,
  AuthenticationError,
  RequestError,
  NetworkError,
  RateLimitError,
  ServerError,
  ResponseError,
  ResourceError,
  ContentError,
} from './errors';

// Service interfaces
export type {
  MessagesService,
  ModelsService,
  MessageBatchesService,
  AdminService,
  OrganizationsService,
  WorkspacesService,
  ApiKeysService,
  InvitesService,
} from './services';

// Type exports - Messages
export type {
  CreateMessageRequest,
  CountTokensRequest,
  Message,
  MessageStream,
  MessageStreamEvent,
  TokenCount,
  ContentBlock,
  TextBlock,
  ImageBlock,
  DocumentBlock,
  ToolUseBlock,
  ToolResultBlock,
  ThinkingBlock,
  Tool,
  ToolChoice,
  ThinkingConfig,
  CacheControl,
  Usage,
  StopReason,
} from './services/messages/types';

// Type exports - Models
export type {
  Model,
  ModelList,
  ListModelsParams,
} from './services/models/types';

// Type exports - Batches
export type {
  CreateBatchRequest,
  BatchRequest,
  MessageBatch,
  BatchList,
  BatchResult,
  BatchResultsStream,
  BatchStatus,
  ListBatchesParams,
  WaitOptions,
} from './services/batches/types';

// Type exports - Admin
export type {
  Organization,
  Workspace,
  Member,
  ApiKeyInfo,
  Invite,
  MemberList,
  WorkspaceList,
  ApiKeyList,
  InviteList,
  AddMemberRequest,
  UpdateMemberRequest,
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  UpdateApiKeyRequest,
  CreateInviteRequest,
  ListParams,
} from './services/admin/types';

// Common types
export type { RateLimitHeaders } from './types/common';
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial architecture (Part 1) |

---

**Continued in Part 2: Data Flow, State Management, and Concurrency Patterns**
