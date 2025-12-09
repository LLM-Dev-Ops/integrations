# GitHub Integration Module - Architecture (Part 1)

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/github`
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

The GitHub Integration Module implements a layered architecture that separates concerns across four distinct tiers:

1. **Public Interface Layer** - Exposes type-safe service interfaces (Repositories, Issues, Pull Requests, Actions, Users, Organizations, Gists, Webhooks, Git Data, Search, GraphQL)
2. **Orchestration Layer** - Coordinates resilience patterns and request lifecycle
3. **Transport Layer** - Handles HTTP communication, pagination, and rate limiting
4. **Primitive Integration Layer** - Connects to shared Integration Repo primitives

### 1.2 Key Architectural Decisions

| Decision | Rationale | Trade-offs |
|----------|-----------|------------|
| **Trait-based abstraction** | Enables London-School TDD with mock injection | Slight runtime overhead from dynamic dispatch |
| **Lazy service initialization** | Reduces memory footprint, faster startup | First access has initialization cost |
| **Centralized resilience orchestration** | Consistent retry/circuit-breaker behavior | Adds complexity to call stack |
| **Multi-auth strategy** | Supports PAT, GitHub Apps, OAuth, Actions tokens | Requires JWT generation for Apps |
| **No cross-module dependencies** | Complete isolation, independent versioning | May duplicate some patterns across modules |
| **Dual API support (REST + GraphQL)** | Maximum flexibility for consumers | Two client implementations to maintain |
| **Link header pagination** | Follows GitHub API patterns | Requires header parsing logic |

### 1.3 Architecture Constraints

| Constraint | Source | Impact |
|------------|--------|--------|
| No ruvbase dependency | Specification requirement | Must use only Integration Repo primitives |
| No cross-integration dependencies | Module isolation rule | Cannot share code with Anthropic/OpenAI modules |
| Rust + TypeScript dual implementation | Multi-language support | Must maintain API parity |
| Integration Repo primitives only | Dependency policy | Limited to approved external crates |
| TLS 1.2+ required | Security requirement | Cannot use older TLS versions |

### 1.4 GitHub-Specific Considerations

| Consideration | Description |
|---------------|-------------|
| **Multiple Auth Methods** | PAT, GitHub Apps (JWT + Installation), OAuth, GitHub Actions Token |
| **Rate Limiting Tiers** | Primary (5000/hr authenticated), Secondary (90/min search), GraphQL (5000 points/hr) |
| **Pagination Style** | Link header-based with `rel="next"`, `rel="last"` |
| **Webhook Signatures** | HMAC-SHA256 verification required for security |
| **API Versioning** | Date-based versioning via `X-GitHub-Api-Version` header |
| **Preview Features** | Opt-in via `Accept` header with preview media types |

---

## 2. Design Principles

### 2.1 SOLID Principles Application

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SOLID in GitHub Module                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  S - Single Responsibility                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ RepositoryService│  │ HttpTransport    │  │ AuthManager      │          │
│  │ handles repo     │  │ handles HTTP     │  │ handles auth     │          │
│  │ operations only  │  │ requests only    │  │ headers only     │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                              │
│  O - Open/Closed                                                             │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │ GitHubClient is OPEN for extension via:                           │       │
│  │   • Authentication strategies (PAT, App, OAuth, Actions)          │       │
│  │   • Custom hooks (retry, rate-limit, circuit-breaker)             │       │
│  │   • Custom transport implementations                               │       │
│  │   • Preview feature flags                                          │       │
│  │ But CLOSED for modification of core request/response handling     │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  L - Liskov Substitution                                                     │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │ Any implementation of HttpTransport can replace another:          │       │
│  │   • ReqwestHttpTransport (production)                             │       │
│  │   • MockHttpTransport (testing)                                   │       │
│  │   • RecordingTransport (debugging)                                │       │
│  │ Any implementation of AuthProvider can replace another:           │       │
│  │   • PatAuthProvider, AppAuthProvider, OAuthProvider, etc.         │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  I - Interface Segregation                                                   │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐               │
│  │ Repository │ │ Issues     │ │ PullRequest│ │ Actions    │               │
│  │ Service    │ │ Service    │ │ Service    │ │ Service    │               │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘               │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐               │
│  │ Users      │ │ Orgs       │ │ Gists      │ │ Webhooks   │               │
│  │ Service    │ │ Service    │ │ Service    │ │ Service    │               │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘               │
│  Clients depend only on the services they use                               │
│                                                                              │
│  D - Dependency Inversion                                                    │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │ High-level: RepositoryServiceImpl                                 │       │
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
                              │  │  • RepositoriesService        │  │
                              │  │  • IssuesService              │  │
                              │  │  • PullRequestsService        │  │
                              │  │  • ActionsService             │  │
                              │  │  • UsersService               │  │
                              │  │  • OrganizationsService       │  │
                              │  │  • GistsService               │  │
                              │  │  • WebhooksService            │  │
                              │  │  • GitDataService             │  │
                              │  │  • SearchService              │  │
                              │  │  • GraphQLClient              │  │
                              │  └───────────────────────────────┘  │
                              │                                     │
   ┌──────────────────┐       │  ┌───────────────────────────────┐  │       ┌──────────────────┐
   │   Primary Ports  │       │  │       Domain Model            │  │       │ Secondary Ports  │
   │  (Driving Side)  │◄─────►│  │  • Request/Response types    │  │◄─────►│ (Driven Side)    │
   │                  │       │  │  • Error types               │  │       │                  │
   │ • GitHubClient   │       │  │  • Configuration             │  │       │ • HttpTransport  │
   │ • Service traits │       │  │  • Entity models             │  │       │ • RetryExecutor  │
   │                  │       │  └───────────────────────────────┘  │       │ • RateLimiter    │
   └──────────────────┘       └─────────────────────────────────────┘       │ • CircuitBreaker │
          ▲                                                                  │ • Logger/Tracer  │
          │                                                                  │ • AuthProvider   │
          │                                                                  └──────────────────┘
   ┌──────────────────┐                                                              ▲
   │ Primary Adapters │                                                      ┌──────────────────┐
   │                  │                                                      │Secondary Adapters│
   │ • User code      │                                                      │                  │
   │ • Test harness   │                                                      │ • reqwest client │
   │ • CLI tools      │                                                      │ • Primitives     │
   │ • CI/CD pipelines│                                                      │ • Mock impls     │
   └──────────────────┘                                                      │ • JWT generator  │
                                                                             └──────────────────┘
```

### 2.3 Clean Architecture Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            External Systems                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ GitHub API  │  │  Primitives │  │  Telemetry  │  │   Config    │        │
│  │             │  │             │  │             │  │             │        │
│  │ REST API    │  │ • errors    │  │ • traces    │  │ • env vars  │        │
│  │ GraphQL     │  │ • retry     │  │ • metrics   │  │ • files     │        │
│  │ Webhooks    │  │ • circuit   │  │ • logs      │  │             │        │
│  │             │  │ • rate-limit│  │             │  │             │        │
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
│  │  • JwtGenerator              • LinkHeaderParser                     │    │
│  │  • WebhookSignatureVerifier                                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Interface Adapters Layer                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • GitHubClientImpl          • ServiceImpl (all 11 services)        │    │
│  │  • RequestBuilder            • ResponseParser                       │    │
│  │  • PaginationHandler         • ErrorMapper                          │    │
│  │  • ResilienceOrchestrator    • AuthManager                          │    │
│  │  • RateLimitTracker          • GraphQLExecutor                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Application Layer                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • GitHubClient trait        • RepositoriesService trait            │    │
│  │  • IssuesService trait       • PullRequestsService trait            │    │
│  │  • ActionsService trait      • UsersService trait                   │    │
│  │  • OrganizationsService trait• GistsService trait                   │    │
│  │  • WebhooksService trait     • GitDataService trait                 │    │
│  │  • SearchService trait       • GraphQLClient trait                  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      ▲
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Domain Layer                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • Entity types (Repository, Issue, PullRequest, User, Org, etc.)   │    │
│  │  • Request types (CreateRepoRequest, CreateIssueRequest, etc.)      │    │
│  │  • Response types (RepositoryResponse, IssueResponse, etc.)         │    │
│  │  • Error types (GitHubError hierarchy)                              │    │
│  │  • Value objects (Visibility, State, MergeMethod, Permission, etc.) │    │
│  │  • Configuration (GitHubConfig, AuthConfig)                         │    │
│  │  • Pagination types (Page, Cursor, PageInfo)                        │    │
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
                        │  Uses GitHub module       │
                        │  to automate repos,       │
                        │  CI/CD, issues, PRs       │
                        └─────────────┬─────────────┘
                                      │
                                      │ Uses
                                      ▼
┌───────────────────┐    ┌───────────────────────────┐    ┌───────────────────┐
│                   │    │                           │    │                   │
│  Integration Repo │◄───│   GitHub Integration      │───►│  GitHub API       │
│  Primitives       │    │   Module                  │    │                   │
│                   │    │                           │    │api.github.com     │
│  • errors         │    │  Provides type-safe       │    │                   │
│  • retry          │    │  access to GitHub APIs    │    │  REST API:        │
│  • circuit-breaker│    │  with resilience          │    │  • Repositories   │
│  • rate-limits    │    │  patterns                 │    │  • Issues         │
│  • tracing        │    │                           │    │  • Pull Requests  │
│  • logging        │    │  Rust + TypeScript        │    │  • Actions        │
│  • types          │    │                           │    │  • Users          │
│  • config         │    │  Features:                │    │  • Organizations  │
│                   │    │  • Multi-auth support     │    │  • Gists          │
│                   │    │  • REST + GraphQL         │    │  • Webhooks       │
│                   │    │  • Webhook handling       │    │  • Git Data       │
│                   │    │  • Rate limit tracking    │    │  • Search         │
│                   │    │                           │    │                   │
│                   │    │                           │    │  GraphQL API:     │
│                   │    │                           │    │  • Flexible query │
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
│                       GitHub Integration Module                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         Public API Container                         │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ GitHub       │  │ Service      │  │ Types &      │             │    │
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
│  │   │ Pagination   │  │ Rate Limit   │  │ Metrics      │             │    │
│  │   │ Handler      │  │ Tracker      │  │ Collector    │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Transport Container                           │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ HTTP         │  │ GraphQL      │  │ Request      │             │    │
│  │   │ Transport    │  │ Transport    │  │ Builder      │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │   │ Auth         │  │ TLS          │  │ Connection   │             │    │
│  │   │ Manager      │  │ Handler      │  │ Pool         │             │    │
│  │   └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  │   ┌──────────────┐  ┌──────────────┐                                │    │
│  │   │ JWT          │  │ Webhook      │                                │    │
│  │   │ Generator    │  │ Verifier     │                                │    │
│  │   └──────────────┘  └──────────────┘                                │    │
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
│                            GitHubClientImpl                                  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Service Registry                               │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │  │
│  │  │ Repositories│ │   Issues    │ │ PullRequests│ │  Actions    │     │  │
│  │  │  Service    │ │   Service   │ │   Service   │ │  Service    │     │  │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘     │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     │  │
│  │  │   Users     │ │    Orgs     │ │   Gists     │ │  Webhooks   │     │  │
│  │  │  Service    │ │   Service   │ │   Service   │ │  Service    │     │  │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘     │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                     │  │
│  │  │  Git Data   │ │   Search    │ │  GraphQL    │                     │  │
│  │  │  Service    │ │   Service   │ │   Client    │                     │  │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘                     │  │
│  │         │               │               │                             │  │
│  └─────────┼───────────────┼───────────────┼─────────────────────────────┘  │
│            │               │               │                                 │
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
│  │  │ • Retry         │  │ • Connection    │  │ • PAT           │        │  │
│  │  │ • Rate Limit    │  │ • TLS 1.2+      │  │ • GitHub App    │        │  │
│  │  │ • Circuit Break │  │ • HTTP/2        │  │ • OAuth         │        │  │
│  │  │                 │  │ • Keep-alive    │  │ • Actions Token │        │  │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘        │  │
│  │           │                    │                    │                  │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │  │
│  │  │  Rate Limit     │  │   Pagination    │  │   GraphQL       │        │  │
│  │  │  Tracker        │  │   Handler       │  │   Executor      │        │  │
│  │  │                 │  │                 │  │                 │        │  │
│  │  │ • Primary       │  │ • Link header   │  │ • Query builder │        │  │
│  │  │ • Secondary     │  │ • Cursor-based  │  │ • Variable bind │        │  │
│  │  │ • GraphQL       │  │ • Iterator      │  │ • Error mapping │        │  │
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

### 4.2 Repository Service Component Detail

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RepositoriesServiceImpl                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Dependencies (Injected - London-School TDD):                                │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • transport: Arc<dyn HttpTransport>                                 │    │
│  │  • auth_manager: Arc<AuthManager>                                    │    │
│  │  • resilience: Arc<ResilienceOrchestrator>                          │    │
│  │  • pagination: Arc<PaginationHandler>                               │    │
│  │  • logger: Arc<dyn Logger>                                          │    │
│  │  • tracer: Arc<dyn Tracer>                                          │    │
│  │  • metrics_hook: Option<Arc<dyn MetricsHook>>                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Configuration:                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • base_url: Url                                                     │    │
│  │  • repos_endpoint: &'static str = "/repos"                          │    │
│  │  • user_repos_endpoint: &'static str = "/user/repos"                │    │
│  │  • default_timeout: Duration                                         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Public Methods (Trait Implementation):                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  + get(owner, repo) -> Result<Repository, GitHubError>               │    │
│  │  + create(request) -> Result<Repository, GitHubError>                │    │
│  │  + update(owner, repo, request) -> Result<Repository, GitHubError>   │    │
│  │  + delete(owner, repo) -> Result<(), GitHubError>                    │    │
│  │  + list_for_user(username, params) -> Result<Page<Repository>>       │    │
│  │  + list_for_org(org, params) -> Result<Page<Repository>>             │    │
│  │  + list_for_authenticated_user(params) -> Result<Page<Repository>>   │    │
│  │  + list_branches(owner, repo, params) -> Result<Page<Branch>>        │    │
│  │  + get_branch(owner, repo, branch) -> Result<Branch, GitHubError>    │    │
│  │  + list_tags(owner, repo, params) -> Result<Page<Tag>>               │    │
│  │  + list_contributors(owner, repo, params) -> Result<Page<Contrib>>   │    │
│  │  + list_languages(owner, repo) -> Result<HashMap<String, u64>>       │    │
│  │  + transfer(owner, repo, new_owner) -> Result<Repository>            │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Private Methods:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  - execute_get_request(path) -> Result<T, Error>                     │    │
│  │  - execute_paginated_request(path, params) -> Result<Page<T>>        │    │
│  │  - validate_owner_repo(owner, repo) -> Result<(), ValidationError>   │    │
│  │  - build_endpoint(owner, repo, suffix) -> String                     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Auth Manager Component

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AuthManager                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  State:                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • auth_provider: Arc<dyn AuthProvider>                              │    │
│  │  • api_version: String              (X-GitHub-Api-Version header)    │    │
│  │  • preview_features: Vec<String>    (Accept header previews)         │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Auth Provider Variants:                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  ┌────────────────────────────────────────────────────────────┐     │    │
│  │  │ PatAuthProvider                                             │     │    │
│  │  │   • token: SecretString                                     │     │    │
│  │  │   → Authorization: Bearer <token>                           │     │    │
│  │  └────────────────────────────────────────────────────────────┘     │    │
│  │                                                                      │    │
│  │  ┌────────────────────────────────────────────────────────────┐     │    │
│  │  │ AppAuthProvider                                             │     │    │
│  │  │   • app_id: u64                                             │     │    │
│  │  │   • private_key: SecretString (PEM)                         │     │    │
│  │  │   • installation_id: Option<u64>                            │     │    │
│  │  │   • jwt_cache: Arc<RwLock<CachedJwt>>                       │     │    │
│  │  │   • installation_token_cache: Arc<RwLock<CachedToken>>      │     │    │
│  │  │   → Authorization: Bearer <jwt> (for app endpoints)         │     │    │
│  │  │   → Authorization: token <installation_token> (for repos)   │     │    │
│  │  └────────────────────────────────────────────────────────────┘     │    │
│  │                                                                      │    │
│  │  ┌────────────────────────────────────────────────────────────┐     │    │
│  │  │ OAuthProvider                                               │     │    │
│  │  │   • access_token: SecretString                              │     │    │
│  │  │   • refresh_token: Option<SecretString>                     │     │    │
│  │  │   • token_expiry: Option<Instant>                           │     │    │
│  │  │   → Authorization: Bearer <access_token>                    │     │    │
│  │  └────────────────────────────────────────────────────────────┘     │    │
│  │                                                                      │    │
│  │  ┌────────────────────────────────────────────────────────────┐     │    │
│  │  │ ActionsTokenProvider                                        │     │    │
│  │  │   • token: SecretString (from GITHUB_TOKEN env)             │     │    │
│  │  │   → Authorization: Bearer <token>                           │     │    │
│  │  └────────────────────────────────────────────────────────────┘     │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Header Generation:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │  get_headers() returns:                                              │    │
│  │  ┌────────────────────────────────────────────────────────────┐     │    │
│  │  │  Authorization: Bearer <token>                             │     │    │
│  │  │  X-GitHub-Api-Version: 2022-11-28                          │     │    │
│  │  │  Accept: application/vnd.github+json                       │     │    │
│  │  │  Accept: application/vnd.github.preview+json (if previews) │     │    │
│  │  │  Content-Type: application/json                             │     │    │
│  │  │  User-Agent: integrations-github/0.1.0                     │     │    │
│  │  └────────────────────────────────────────────────────────────┘     │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Resilience Orchestrator Component

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
│  │  │ • max_retries  │    │ • primary_limit│    │ • failure_thres│     │    │
│  │  │ • backoff      │    │ • secondary_lim│    │ • recovery_time│     │    │
│  │  │ • jitter       │    │ • graphql_limit│    │ • state        │     │    │
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
│  │                    │ 6. Update rate lim │                          │    │
│  │                    │ 7. Record metrics  │                          │    │
│  │                    └────────────────────┘                          │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Rate Limit Categories:                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • PRIMARY: 5000 requests/hour (authenticated)                       │    │
│  │  • SECONDARY: 90 requests/minute (search, code search)              │    │
│  │  • GRAPHQL: 5000 points/hour (query cost-based)                     │    │
│  │  • UNAUTHENTICATED: 60 requests/hour (fallback)                     │    │
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
│  │  + execute<T>(category, action) -> Result<T, GitHubError>            │    │
│  │  + execute_without_retry<T>(category, action) -> Result<T, Error>    │    │
│  │  + get_circuit_state() -> CircuitState                               │    │
│  │  + get_rate_limit_status(category) -> RateLimitStatus                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Module Structure

### 5.1 High-Level Module Organization

```
integrations/
├── github/                         # GitHub Integration Module
│   ├── rust/                       # Rust implementation
│   │   ├── Cargo.toml
│   │   └── src/
│   │       └── ...
│   │
│   ├── typescript/                 # TypeScript implementation
│   │   ├── package.json
│   │   └── src/
│   │       └── ...
│   │
│   ├── plans/                      # SPARC documentation
│   │   ├── SPARC-GitHub.md
│   │   ├── specification-github.md
│   │   ├── pseudocode-github-*.md
│   │   ├── architecture-github-*.md
│   │   ├── refinement-github.md
│   │   └── completion-github.md
│   │
│   └── tests/                      # Shared test fixtures
│       ├── fixtures/
│       └── contracts/
│
├── primitives/                     # Shared primitives (dependencies)
│   ├── errors/
│   ├── retry/
│   ├── circuit-breaker/
│   ├── rate-limits/
│   ├── tracing/
│   ├── logging/
│   ├── types/
│   └── config/
│
└── anthropic/                      # Other modules (isolated)
    └── ...
```

---

## 6. Rust Crate Organization

### 6.1 Crate Structure

```
github/rust/
├── Cargo.toml
├── src/
│   ├── lib.rs                       # Crate root, re-exports
│   │
│   ├── client/                      # Client module
│   │   ├── mod.rs
│   │   ├── config.rs                # GitHubConfig
│   │   ├── factory.rs               # Client factory functions
│   │   └── client_impl.rs           # GitHubClientImpl
│   │
│   ├── services/                    # Service implementations
│   │   ├── mod.rs
│   │   ├── repositories/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # RepositoriesServiceImpl
│   │   │   ├── types.rs             # Repository, Branch, Tag, etc.
│   │   │   └── requests.rs          # CreateRepoRequest, etc.
│   │   │
│   │   ├── issues/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # IssuesServiceImpl
│   │   │   ├── types.rs             # Issue, Label, Milestone, etc.
│   │   │   ├── comments.rs          # IssueComment operations
│   │   │   └── requests.rs          # CreateIssueRequest, etc.
│   │   │
│   │   ├── pull_requests/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # PullRequestsServiceImpl
│   │   │   ├── types.rs             # PullRequest, Review, etc.
│   │   │   ├── reviews.rs           # Review operations
│   │   │   └── requests.rs          # CreatePRRequest, etc.
│   │   │
│   │   ├── actions/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # ActionsServiceImpl
│   │   │   ├── workflows.rs         # Workflow operations
│   │   │   ├── runs.rs              # WorkflowRun operations
│   │   │   ├── jobs.rs              # Job operations
│   │   │   ├── artifacts.rs         # Artifact operations
│   │   │   ├── secrets.rs           # Secret operations
│   │   │   └── types.rs             # Workflow, Run, Job, etc.
│   │   │
│   │   ├── users/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # UsersServiceImpl
│   │   │   └── types.rs             # User, PublicKey, etc.
│   │   │
│   │   ├── organizations/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # OrganizationsServiceImpl
│   │   │   ├── members.rs           # Member operations
│   │   │   ├── teams.rs             # Team operations
│   │   │   └── types.rs             # Organization, Team, etc.
│   │   │
│   │   ├── gists/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # GistsServiceImpl
│   │   │   └── types.rs             # Gist, GistFile, etc.
│   │   │
│   │   ├── webhooks/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # WebhooksServiceImpl
│   │   │   ├── signature.rs         # HMAC-SHA256 verification
│   │   │   ├── events.rs            # Webhook event types
│   │   │   └── types.rs             # Webhook, WebhookConfig, etc.
│   │   │
│   │   ├── git_data/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # GitDataServiceImpl
│   │   │   ├── blobs.rs             # Blob operations
│   │   │   ├── trees.rs             # Tree operations
│   │   │   ├── commits.rs           # Commit operations
│   │   │   ├── refs.rs              # Reference operations
│   │   │   ├── tags.rs              # Tag operations
│   │   │   └── types.rs             # GitBlob, GitTree, etc.
│   │   │
│   │   ├── search/
│   │   │   ├── mod.rs
│   │   │   ├── service.rs           # SearchServiceImpl
│   │   │   └── types.rs             # SearchResult, SearchParams
│   │   │
│   │   └── graphql/
│   │       ├── mod.rs
│   │       ├── client.rs            # GraphQLClientImpl
│   │       ├── query.rs             # Query builder
│   │       └── types.rs             # GraphQL response types
│   │
│   ├── transport/                   # HTTP transport layer
│   │   ├── mod.rs
│   │   ├── http_transport.rs        # Trait + reqwest impl
│   │   ├── request_builder.rs       # Request construction
│   │   ├── response_parser.rs       # Response parsing
│   │   └── rate_limit_headers.rs    # Rate limit header parsing
│   │
│   ├── auth/                        # Authentication
│   │   ├── mod.rs
│   │   ├── auth_manager.rs          # AuthManager impl
│   │   ├── pat.rs                   # PAT auth provider
│   │   ├── app.rs                   # GitHub App auth provider
│   │   ├── oauth.rs                 # OAuth auth provider
│   │   ├── actions.rs               # Actions token provider
│   │   └── jwt.rs                   # JWT generation for Apps
│   │
│   ├── pagination/                  # Pagination handling
│   │   ├── mod.rs
│   │   ├── handler.rs               # PaginationHandler
│   │   ├── link_parser.rs           # Link header parsing
│   │   ├── page.rs                  # Page<T> type
│   │   └── iterator.rs              # Paginated iterator
│   │
│   ├── resilience/                  # Resilience patterns
│   │   ├── mod.rs
│   │   ├── orchestrator.rs          # Main orchestrator
│   │   ├── rate_limit_tracker.rs    # Rate limit tracking
│   │   └── hooks.rs                 # Hook traits
│   │
│   ├── errors/                      # Error types
│   │   ├── mod.rs
│   │   ├── error.rs                 # GitHubError enum
│   │   ├── categories.rs            # Error category enums
│   │   └── mapping.rs               # HTTP to error mapping
│   │
│   └── types/                       # Shared types
│       ├── mod.rs
│       ├── common.rs                # Common types (Visibility, State, etc.)
│       └── serde_helpers.rs         # Custom serialization
│
├── tests/                           # Integration tests
│   ├── common/
│   │   └── mod.rs                   # Test utilities
│   │
│   ├── repositories_tests.rs
│   ├── issues_tests.rs
│   ├── pull_requests_tests.rs
│   ├── actions_tests.rs
│   ├── users_tests.rs
│   ├── organizations_tests.rs
│   ├── gists_tests.rs
│   ├── webhooks_tests.rs
│   ├── git_data_tests.rs
│   ├── search_tests.rs
│   └── graphql_tests.rs
│
├── benches/                         # Benchmarks
│   └── throughput.rs
│
└── examples/                        # Usage examples
    ├── basic_repository.rs
    ├── create_issue.rs
    ├── pull_request_workflow.rs
    ├── github_app_auth.rs
    ├── webhook_handler.rs
    ├── graphql_query.rs
    └── actions_workflow.rs
```

### 6.2 Cargo.toml

```toml
[package]
name = "integrations-github"
version = "0.1.0"
edition = "2021"
description = "GitHub Integration Module for LLM-Dev-Ops"
license = "LLMDevOps-PSACL-1.0"
repository = "https://github.com/llm-dev-ops/integrations"
documentation = "https://docs.llm-dev-ops.io/integrations/github"
keywords = ["github", "api", "rest", "graphql", "integration"]
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
chrono = { version = "0.4", features = ["serde"] }
jsonwebtoken = "9.0"   # For GitHub App JWT generation
hmac = "0.12"          # For webhook signature verification
sha2 = "0.10"          # For HMAC-SHA256
hex = "0.4"            # For hex encoding

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
full = ["actions", "webhooks", "graphql", "git-data"]
actions = []
webhooks = []
graphql = []
git-data = []

[[bench]]
name = "throughput"
harness = false

[[example]]
name = "basic_repository"
path = "examples/basic_repository.rs"

[[example]]
name = "github_app_auth"
path = "examples/github_app_auth.rs"
required-features = ["full"]

[[example]]
name = "webhook_handler"
path = "examples/webhook_handler.rs"
required-features = ["webhooks"]
```

### 6.3 Module Visibility and Re-exports

```rust
// src/lib.rs

//! GitHub Integration Module
//!
//! Provides type-safe access to GitHub's REST and GraphQL APIs with built-in
//! resilience patterns.
//!
//! # Example
//!
//! ```rust
//! use integrations_github::{GitHubClient, CreateRepositoryRequest};
//!
//! #[tokio::main]
//! async fn main() -> Result<(), Box<dyn std::error::Error>> {
//!     let client = integrations_github::from_env()?;
//!
//!     let repo = client.repositories().create(CreateRepositoryRequest {
//!         name: "my-new-repo".to_string(),
//!         private: Some(true),
//!         ..Default::default()
//!     }).await?;
//!
//!     println!("Created: {}", repo.full_name);
//!     Ok(())
//! }
//! ```

// Re-export public API
pub use client::{GitHubClient, GitHubClientFactory, GitHubConfig};
pub use client::config::{AuthConfig, PatAuth, AppAuth, OAuthAuth};
pub use errors::GitHubError;

// Service traits
pub use services::repositories::RepositoriesService;
pub use services::issues::IssuesService;
pub use services::pull_requests::PullRequestsService;
pub use services::users::UsersService;
pub use services::organizations::OrganizationsService;
pub use services::gists::GistsService;
pub use services::search::SearchService;

#[cfg(feature = "actions")]
pub use services::actions::ActionsService;

#[cfg(feature = "webhooks")]
pub use services::webhooks::{WebhooksService, WebhookSignatureVerifier};

#[cfg(feature = "graphql")]
pub use services::graphql::GraphQLClient;

#[cfg(feature = "git-data")]
pub use services::git_data::GitDataService;

// Pagination types
pub use pagination::{Page, PageIterator, PaginationParams};

// Type re-exports - Core entities
pub use services::repositories::types::*;
pub use services::issues::types::*;
pub use services::pull_requests::types::*;
pub use services::users::types::*;
pub use services::organizations::types::*;
pub use services::gists::types::*;
pub use services::search::types::*;

#[cfg(feature = "actions")]
pub use services::actions::types::*;

#[cfg(feature = "webhooks")]
pub use services::webhooks::types::*;

#[cfg(feature = "graphql")]
pub use services::graphql::types::*;

#[cfg(feature = "git-data")]
pub use services::git_data::types::*;

// Common types
pub use types::common::{Visibility, State, Permission, MergeMethod};

// Factory functions
pub fn create(config: GitHubConfig) -> Result<impl GitHubClient, GitHubError> {
    client::factory::create_github_client(config)
}

pub fn from_env() -> Result<impl GitHubClient, GitHubError> {
    client::factory::create_github_client_from_env()
}

pub fn from_token(token: impl Into<String>) -> Result<impl GitHubClient, GitHubError> {
    client::factory::create_github_client_from_token(token)
}

// Internal modules (not re-exported)
mod client;
mod services;
mod transport;
mod auth;
mod pagination;
mod resilience;
mod errors;
mod types;
```

---

## 7. TypeScript Package Organization

### 7.1 Package Structure

```
github/typescript/
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
│   │   ├── config.ts                # GitHubConfig interface
│   │   ├── factory.ts               # createGitHubClient()
│   │   ├── client-impl.ts           # GitHubClientImpl
│   │   └── auth-config.ts           # Auth configuration types
│   │
│   ├── services/
│   │   ├── index.ts
│   │   ├── repositories/
│   │   │   ├── index.ts
│   │   │   ├── service.ts           # RepositoriesServiceImpl
│   │   │   ├── types.ts             # Repository, Branch, etc.
│   │   │   └── requests.ts          # CreateRepositoryRequest, etc.
│   │   │
│   │   ├── issues/
│   │   │   ├── index.ts
│   │   │   ├── service.ts           # IssuesServiceImpl
│   │   │   ├── types.ts             # Issue, Label, etc.
│   │   │   └── requests.ts          # CreateIssueRequest, etc.
│   │   │
│   │   ├── pull-requests/
│   │   │   ├── index.ts
│   │   │   ├── service.ts           # PullRequestsServiceImpl
│   │   │   ├── types.ts             # PullRequest, Review, etc.
│   │   │   └── requests.ts          # CreatePullRequestRequest, etc.
│   │   │
│   │   ├── actions/
│   │   │   ├── index.ts
│   │   │   ├── service.ts           # ActionsServiceImpl
│   │   │   ├── workflows.ts         # Workflow operations
│   │   │   ├── runs.ts              # Run operations
│   │   │   ├── artifacts.ts         # Artifact operations
│   │   │   ├── secrets.ts           # Secret operations
│   │   │   └── types.ts             # Workflow, Run, Job, etc.
│   │   │
│   │   ├── users/
│   │   │   ├── index.ts
│   │   │   ├── service.ts           # UsersServiceImpl
│   │   │   └── types.ts             # User, etc.
│   │   │
│   │   ├── organizations/
│   │   │   ├── index.ts
│   │   │   ├── service.ts           # OrganizationsServiceImpl
│   │   │   ├── members.ts           # Member operations
│   │   │   ├── teams.ts             # Team operations
│   │   │   └── types.ts             # Organization, Team, etc.
│   │   │
│   │   ├── gists/
│   │   │   ├── index.ts
│   │   │   ├── service.ts           # GistsServiceImpl
│   │   │   └── types.ts             # Gist, GistFile, etc.
│   │   │
│   │   ├── webhooks/
│   │   │   ├── index.ts
│   │   │   ├── service.ts           # WebhooksServiceImpl
│   │   │   ├── signature.ts         # HMAC-SHA256 verification
│   │   │   ├── events.ts            # Webhook event types
│   │   │   └── types.ts             # Webhook, WebhookConfig, etc.
│   │   │
│   │   ├── git-data/
│   │   │   ├── index.ts
│   │   │   ├── service.ts           # GitDataServiceImpl
│   │   │   ├── blobs.ts             # Blob operations
│   │   │   ├── trees.ts             # Tree operations
│   │   │   ├── commits.ts           # Commit operations
│   │   │   └── types.ts             # GitBlob, GitTree, etc.
│   │   │
│   │   ├── search/
│   │   │   ├── index.ts
│   │   │   ├── service.ts           # SearchServiceImpl
│   │   │   └── types.ts             # SearchResult, SearchParams
│   │   │
│   │   └── graphql/
│   │       ├── index.ts
│   │       ├── client.ts            # GraphQLClientImpl
│   │       ├── query-builder.ts     # Query builder utility
│   │       └── types.ts             # GraphQL response types
│   │
│   ├── transport/
│   │   ├── index.ts
│   │   ├── http-transport.ts        # Interface + fetch impl
│   │   ├── request-builder.ts
│   │   ├── response-parser.ts
│   │   └── rate-limit-headers.ts
│   │
│   ├── auth/
│   │   ├── index.ts
│   │   ├── auth-manager.ts
│   │   ├── pat-provider.ts
│   │   ├── app-provider.ts
│   │   ├── oauth-provider.ts
│   │   ├── actions-provider.ts
│   │   └── jwt.ts                   # JWT generation
│   │
│   ├── pagination/
│   │   ├── index.ts
│   │   ├── handler.ts
│   │   ├── link-parser.ts
│   │   ├── page.ts
│   │   └── iterator.ts
│   │
│   ├── resilience/
│   │   ├── index.ts
│   │   ├── orchestrator.ts
│   │   ├── rate-limit-tracker.ts
│   │   └── hooks.ts
│   │
│   ├── errors/
│   │   ├── index.ts
│   │   ├── error.ts                 # GitHubError class
│   │   ├── categories.ts
│   │   └── mapping.ts
│   │
│   └── types/
│       ├── index.ts
│       └── common.ts                # Visibility, State, Permission, etc.
│
├── tests/
│   ├── setup.ts                     # Test setup
│   ├── helpers/
│   │   ├── mock-transport.ts
│   │   └── fixtures.ts
│   │
│   ├── unit/
│   │   ├── repositories.test.ts
│   │   ├── issues.test.ts
│   │   ├── pull-requests.test.ts
│   │   ├── actions.test.ts
│   │   ├── webhooks.test.ts
│   │   └── graphql.test.ts
│   │
│   └── integration/
│       └── mock-server.test.ts
│
└── examples/
    ├── basic-repository.ts
    ├── create-issue.ts
    ├── pull-request-workflow.ts
    ├── github-app-auth.ts
    ├── webhook-handler.ts
    └── graphql-query.ts
```

### 7.2 package.json

```json
{
  "name": "@integrations/github",
  "version": "0.1.0",
  "description": "GitHub Integration Module for LLM-Dev-Ops",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./repositories": {
      "import": "./dist/services/repositories/index.mjs",
      "require": "./dist/services/repositories/index.js",
      "types": "./dist/services/repositories/index.d.ts"
    },
    "./issues": {
      "import": "./dist/services/issues/index.mjs",
      "require": "./dist/services/issues/index.js",
      "types": "./dist/services/issues/index.d.ts"
    },
    "./pull-requests": {
      "import": "./dist/services/pull-requests/index.mjs",
      "require": "./dist/services/pull-requests/index.js",
      "types": "./dist/services/pull-requests/index.d.ts"
    },
    "./actions": {
      "import": "./dist/services/actions/index.mjs",
      "require": "./dist/services/actions/index.js",
      "types": "./dist/services/actions/index.d.ts"
    },
    "./webhooks": {
      "import": "./dist/services/webhooks/index.mjs",
      "require": "./dist/services/webhooks/index.js",
      "types": "./dist/services/webhooks/index.d.ts"
    },
    "./graphql": {
      "import": "./dist/services/graphql/index.mjs",
      "require": "./dist/services/graphql/index.js",
      "types": "./dist/services/graphql/index.d.ts"
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
    "jsonwebtoken": "^9.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/jsonwebtoken": "^9.0.0",
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
    "directory": "github/typescript"
  },
  "keywords": [
    "github",
    "api",
    "rest",
    "graphql",
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
 * GitHub Integration Module
 *
 * Provides type-safe access to GitHub's REST and GraphQL APIs with built-in
 * resilience patterns.
 *
 * @example
 * ```typescript
 * import { createGitHubClient, CreateRepositoryRequest } from '@integrations/github';
 *
 * const client = createGitHubClient({ token: process.env.GITHUB_TOKEN! });
 *
 * const repo = await client.repositories.create({
 *   name: 'my-new-repo',
 *   private: true,
 * });
 *
 * console.log(`Created: ${repo.full_name}`);
 * ```
 *
 * @packageDocumentation
 */

// Client exports
export { GitHubClient, GitHubConfig } from './client';
export { createGitHubClient, createGitHubClientFromEnv } from './client/factory';
export type { AuthConfig, PatAuth, AppAuth, OAuthAuth, ActionsAuth } from './client/auth-config';

// Error exports
export { GitHubError } from './errors';
export type {
  ConfigurationError,
  AuthenticationError,
  ValidationError,
  NetworkError,
  RateLimitError,
  NotFoundError,
  PermissionError,
  ServerError,
} from './errors';

// Service interfaces
export type {
  RepositoriesService,
  IssuesService,
  PullRequestsService,
  ActionsService,
  UsersService,
  OrganizationsService,
  GistsService,
  WebhooksService,
  GitDataService,
  SearchService,
  GraphQLClient,
} from './services';

// Pagination types
export type { Page, PageIterator, PaginationParams } from './pagination';

// Type exports - Repositories
export type {
  Repository,
  Branch,
  Tag,
  Contributor,
  CreateRepositoryRequest,
  UpdateRepositoryRequest,
  RepositoryVisibility,
} from './services/repositories/types';

// Type exports - Issues
export type {
  Issue,
  Label,
  Milestone,
  IssueComment,
  CreateIssueRequest,
  UpdateIssueRequest,
  IssueState,
} from './services/issues/types';

// Type exports - Pull Requests
export type {
  PullRequest,
  Review,
  ReviewComment,
  CreatePullRequestRequest,
  UpdatePullRequestRequest,
  MergeMethod,
  ReviewState,
} from './services/pull-requests/types';

// Type exports - Actions
export type {
  Workflow,
  WorkflowRun,
  Job,
  Artifact,
  Secret,
  Variable,
  WorkflowRunStatus,
} from './services/actions/types';

// Type exports - Users
export type {
  User,
  PublicUser,
  PrivateUser,
  PublicKey,
} from './services/users/types';

// Type exports - Organizations
export type {
  Organization,
  Team,
  OrganizationMember,
  TeamMembership,
} from './services/organizations/types';

// Type exports - Gists
export type {
  Gist,
  GistFile,
  CreateGistRequest,
  UpdateGistRequest,
} from './services/gists/types';

// Type exports - Webhooks
export type {
  Webhook,
  WebhookConfig,
  WebhookEvent,
  CreateWebhookRequest,
} from './services/webhooks/types';

// Type exports - Git Data
export type {
  GitBlob,
  GitTree,
  GitCommit,
  GitRef,
  GitTag,
} from './services/git-data/types';

// Type exports - Search
export type {
  SearchResult,
  SearchParams,
  CodeSearchResult,
  IssueSearchResult,
  RepositorySearchResult,
  UserSearchResult,
} from './services/search/types';

// Type exports - GraphQL
export type {
  GraphQLResponse,
  GraphQLError,
} from './services/graphql/types';

// Common types
export type {
  Visibility,
  State,
  Permission,
} from './types/common';

// Webhook signature verification
export { WebhookSignatureVerifier } from './services/webhooks/signature';
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial architecture (Part 1) |

---

**Continued in Part 2: Data Flow, State Management, and Concurrency Patterns**
