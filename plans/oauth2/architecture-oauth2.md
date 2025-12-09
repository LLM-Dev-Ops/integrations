# OAuth2 Authentication Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/oauth2`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [System Context](#2-system-context)
3. [Component Architecture](#3-component-architecture)
4. [Layer Architecture](#4-layer-architecture)
5. [Data Flow Architecture](#5-data-flow-architecture)
6. [Dependency Architecture](#6-dependency-architecture)
7. [Interface Architecture](#7-interface-architecture)
8. [Resilience Architecture](#8-resilience-architecture)
9. [Security Architecture](#9-security-architecture)
10. [Storage Architecture](#10-storage-architecture)
11. [Concurrency Architecture](#11-concurrency-architecture)
12. [Configuration Architecture](#12-configuration-architecture)
13. [Observability Architecture](#13-observability-architecture)
14. [Extension Architecture](#14-extension-architecture)
15. [Deployment Architecture](#15-deployment-architecture)
16. [Decision Records](#16-decision-records)

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Consumer Applications                                │
│    (GitHub Integration, Google Integration, Azure Integration, etc.)          │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  │ OAuth2Client Interface
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         OAuth2 Integration Module                             │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                        Public API Layer                                 │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │  │
│  │  │OAuth2Client  │ │OAuth2Config  │ │TokenManager  │ │WellKnown     │   │  │
│  │  │Builder       │ │Builder       │ │              │ │Providers     │   │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                        Flow Layer                                       │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │  │
│  │  │Authorization │ │AuthCode+PKCE │ │Client        │ │Device        │   │  │
│  │  │Code Flow     │ │Flow          │ │Credentials   │ │Authorization │   │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                        Token Layer                                      │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │  │
│  │  │Token         │ │Token         │ │Token         │ │Token         │   │  │
│  │  │Manager       │ │Storage       │ │Introspection │ │Revocation    │   │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                        Core Layer                                       │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │  │
│  │  │HTTP          │ │State         │ │PKCE          │ │OIDC          │   │  │
│  │  │Transport     │ │Manager       │ │Generator     │ │Discovery     │   │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                        Cross-Cutting Layer                              │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐   │  │
│  │  │Error         │ │Resilience    │ │Telemetry     │ │Configuration │   │  │
│  │  │Handling      │ │(Retry/CB/RL) │ │              │ │              │   │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  │ Integration Primitives Interface
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                      Integration Repository Primitives                        │
│  ┌─────────┐ ┌─────────┐ ┌─────────────────┐ ┌──────────────┐ ┌─────────┐   │
│  │ errors  │ │  retry  │ │ circuit-breaker │ │  rate-limits │ │ tracing │   │
│  └─────────┘ └─────────┘ └─────────────────┘ └──────────────┘ └─────────┘   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                                         │
│  │ logging │ │  types  │ │ config  │                                         │
│  └─────────┘ └─────────┘ └─────────┘                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Architectural Principles

| Principle | Description |
|-----------|-------------|
| **Interface Segregation** | Each OAuth2 flow is a separate interface for fine-grained dependency injection |
| **Dependency Inversion** | All components depend on abstractions (traits/interfaces), not concretions |
| **Single Responsibility** | Each component has one clear purpose |
| **Open-Closed** | Open for extension (custom providers, storage), closed for modification |
| **Fail-Fast with Recovery** | Detect errors early, provide structured recovery paths |
| **London-School TDD** | All interfaces designed for mockability and isolated testing |

### 1.3 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Lazy service initialization | Flow handlers created on first use to minimize startup cost |
| Composition over inheritance | Flows composed from shared core components |
| Interface-first design | Enables mocking for London-School TDD |
| Primitive delegation | Resilience concerns delegated to shared primitives |
| Provider-agnostic core | No provider-specific code in core; providers are configuration |

---

## 2. System Context

### 2.1 Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM CONTEXT                                      │
│                                                                                  │
│  ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐    │
│  │   Developer     │         │   End User      │         │   Ops Team      │    │
│  │   Application   │         │   (Browser)     │         │   (Monitoring)  │    │
│  └────────┬────────┘         └────────┬────────┘         └────────┬────────┘    │
│           │                           │                           │             │
│           │ Uses OAuth2               │ Authenticates             │ Monitors    │
│           │ Client API                │ via Browser               │ Metrics     │
│           ▼                           ▼                           ▼             │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                                                                          │   │
│  │                      OAuth2 Integration Module                           │   │
│  │                                                                          │   │
│  │   • Authorization URL Generation                                         │   │
│  │   • Token Exchange & Management                                          │   │
│  │   • Automatic Token Refresh                                              │   │
│  │   • Secure Token Storage                                                 │   │
│  │                                                                          │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│           │                           │                           │             │
│           │ HTTP/HTTPS                │ Redirects                 │ Telemetry   │
│           ▼                           ▼                           ▼             │
│  ┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐    │
│  │  Authorization  │         │    Resource     │         │   Observability │    │
│  │  Server         │         │    Server       │         │   Platform      │    │
│  │  (Google, etc.) │         │    (APIs)       │         │   (Prometheus)  │    │
│  └─────────────────┘         └─────────────────┘         └─────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 External Systems

| System | Integration Type | Protocol | Purpose |
|--------|-----------------|----------|---------|
| Authorization Server | HTTPS | OAuth2/OIDC | Token issuance, authorization |
| Resource Server | HTTPS | Bearer Token | Protected API access |
| OIDC Discovery Endpoint | HTTPS | JSON | Provider metadata discovery |
| JWKS Endpoint | HTTPS | JSON | Public key retrieval for JWT validation |

### 2.3 Module Consumers

| Consumer | Usage Pattern |
|----------|---------------|
| GitHub Integration | Uses OAuth2 for GitHub App authentication |
| Google Integration | Uses OAuth2 for Google API access |
| Azure Integration | Uses OAuth2 for Azure AD authentication |
| Generic Provider Integration | Uses OAuth2 for any compliant provider |

---

## 3. Component Architecture

### 3.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           OAuth2 Integration Module                              │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  OAuth2Client                                                             │   │
│  │  ┌────────────────────────────────────────────────────────────────────┐  │   │
│  │  │ + authorization_code() -> &AuthorizationCodeFlow                    │  │   │
│  │  │ + authorization_code_pkce() -> &AuthorizationCodePkceFlow           │  │   │
│  │  │ + client_credentials() -> &ClientCredentialsFlow                    │  │   │
│  │  │ + device_authorization() -> &DeviceAuthorizationFlow                │  │   │
│  │  │ + tokens() -> &TokenManager                                         │  │   │
│  │  │ + introspection() -> &TokenIntrospection                            │  │   │
│  │  │ + revocation() -> &TokenRevocation                                  │  │   │
│  │  └────────────────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│           │                                                                      │
│           │ Owns (lazy-initialized)                                             │
│           ▼                                                                      │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐                 │
│  │ AuthCodeFlow     │ │ PKCEFlow         │ │ ClientCredsFlow  │                 │
│  │                  │ │                  │ │                  │                 │
│  │ + build_url()    │ │ + build_url()    │ │ + request_token()│                 │
│  │ + exchange_code()│ │ + exchange_code()│ │                  │                 │
│  │ + handle_cb()    │ │ + handle_cb()    │ │                  │                 │
│  └────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘                 │
│           │                    │                    │                           │
│           └────────────────────┼────────────────────┘                           │
│                                │                                                 │
│                                │ Uses                                            │
│                                ▼                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                        Shared Core Components                             │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │   │
│  │  │ HttpTransport│ │ StateManager │ │ PkceGenerator│ │DiscoveryClient│    │   │
│  │  │              │ │              │ │              │ │              │     │   │
│  │  │ + send()     │ │ + generate() │ │ + generate() │ │ + fetch()    │     │   │
│  │  │              │ │ + validate() │ │ + challenge()│ │ + cache()    │     │   │
│  │  │              │ │ + consume()  │ │              │ │              │     │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘     │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                │                                                 │
│                                │ Wraps                                           │
│                                ▼                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                        Resilience Wrappers                                │   │
│  │  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐          │   │
│  │  │ OAuth2Retry      │ │ OAuth2CircuitBrkr│ │ OAuth2RateLimiter│          │   │
│  │  │ Executor         │ │                  │ │                  │          │   │
│  │  └──────────────────┘ └──────────────────┘ └──────────────────┘          │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| **OAuth2Client** | Facade providing access to all OAuth2 flows and services |
| **AuthorizationCodeFlow** | Standard authorization code grant implementation |
| **AuthorizationCodePkceFlow** | PKCE-enhanced authorization code flow |
| **ClientCredentialsFlow** | Machine-to-machine authentication flow |
| **DeviceAuthorizationFlow** | Device flow for input-constrained devices |
| **TokenManager** | Token lifecycle management with auto-refresh |
| **TokenStorage** | Pluggable token persistence |
| **TokenIntrospection** | RFC 7662 token metadata inspection |
| **TokenRevocation** | RFC 7009 token invalidation |
| **HttpTransport** | Secure HTTP communication with OAuth2 endpoints |
| **StateManager** | CSRF protection via state parameter management |
| **PkceGenerator** | RFC 7636 code verifier/challenge generation |
| **DiscoveryClient** | OIDC discovery document fetching and caching |

### 3.3 Component Interactions

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    Authorization Code + PKCE Flow Sequence                       │
│                                                                                  │
│  Consumer            OAuth2Client         PKCEFlow          Core Components      │
│     │                    │                   │                    │              │
│     │ authorization_     │                   │                    │              │
│     │ code_pkce()        │                   │                    │              │
│     │───────────────────>│                   │                    │              │
│     │                    │                   │                    │              │
│     │                    │ lazy_init()       │                    │              │
│     │                    │──────────────────>│                    │              │
│     │                    │                   │                    │              │
│     │<───────────────────│                   │                    │              │
│     │  &PKCEFlow         │                   │                    │              │
│     │                    │                   │                    │              │
│     │ build_url()        │                   │                    │              │
│     │────────────────────────────────────────>│                   │              │
│     │                    │                   │                    │              │
│     │                    │                   │ generate()         │              │
│     │                    │                   │───────────────────>│ PkceGenerator│
│     │                    │                   │<───────────────────│              │
│     │                    │                   │                    │              │
│     │                    │                   │ generate()         │              │
│     │                    │                   │───────────────────>│ StateManager │
│     │                    │                   │<───────────────────│              │
│     │                    │                   │                    │              │
│     │<────────────────────────────────────────│ PkceAuthUrl       │              │
│     │                    │                   │                    │              │
│     │                    │                   │                    │              │
│     │ (user authenticates, callback received)│                    │              │
│     │                    │                   │                    │              │
│     │ handle_callback()  │                   │                    │              │
│     │────────────────────────────────────────>│                   │              │
│     │                    │                   │                    │              │
│     │                    │                   │ consume()          │              │
│     │                    │                   │───────────────────>│ StateManager │
│     │                    │                   │<───────────────────│ (metadata)   │
│     │                    │                   │                    │              │
│     │                    │                   │ send()             │              │
│     │                    │                   │───────────────────>│ HttpTransport│
│     │                    │                   │<───────────────────│ (tokens)     │
│     │                    │                   │                    │              │
│     │<────────────────────────────────────────│ TokenResponse     │              │
│     │                    │                   │                    │              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Layer Architecture

### 4.1 Layer Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                  │
│   LAYER 1: PUBLIC API                                                            │
│   ┌──────────────────────────────────────────────────────────────────────────┐  │
│   │  • OAuth2Client (facade)                                                  │  │
│   │  • OAuth2ConfigBuilder                                                    │  │
│   │  • WellKnownProviders                                                     │  │
│   │  • Factory functions (create_oauth2_client, create_from_discovery)        │  │
│   │                                                                           │  │
│   │  Visibility: PUBLIC                                                       │  │
│   │  Purpose: Entry points for consumers                                      │  │
│   └──────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                           │
│                                      ▼                                           │
│   LAYER 2: FLOW INTERFACES                                                       │
│   ┌──────────────────────────────────────────────────────────────────────────┐  │
│   │  • AuthorizationCodeFlow (trait)                                          │  │
│   │  • AuthorizationCodePkceFlow (trait)                                      │  │
│   │  • ClientCredentialsFlow (trait)                                          │  │
│   │  • DeviceAuthorizationFlow (trait)                                        │  │
│   │  • TokenManager (trait)                                                   │  │
│   │  • TokenIntrospection (trait)                                             │  │
│   │  • TokenRevocation (trait)                                                │  │
│   │                                                                           │  │
│   │  Visibility: PUBLIC (interfaces), INTERNAL (implementations)              │  │
│   │  Purpose: Interface definitions for mocking (London-School TDD)           │  │
│   └──────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                           │
│                                      ▼                                           │
│   LAYER 3: CORE COMPONENTS                                                       │
│   ┌──────────────────────────────────────────────────────────────────────────┐  │
│   │  • HttpTransport                                                          │  │
│   │  • StateManager                                                           │  │
│   │  • PkceGenerator                                                          │  │
│   │  • DiscoveryClient                                                        │  │
│   │  • TokenStorage (trait + implementations)                                 │  │
│   │                                                                           │  │
│   │  Visibility: INTERNAL (most), PUBLIC (TokenStorage trait for extension)   │  │
│   │  Purpose: Shared infrastructure for all flows                             │  │
│   └──────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                           │
│                                      ▼                                           │
│   LAYER 4: RESILIENCE & CROSS-CUTTING                                            │
│   ┌──────────────────────────────────────────────────────────────────────────┐  │
│   │  • OAuth2RetryExecutor (wraps integrations-retry)                         │  │
│   │  • OAuth2CircuitBreaker (wraps integrations-circuit-breaker)              │  │
│   │  • OAuth2RateLimiter (wraps integrations-rate-limit)                      │  │
│   │  • OAuth2Metrics (wraps integrations-tracing)                             │  │
│   │  • OAuth2Logger (wraps integrations-logging)                              │  │
│   │  • OAuth2Error (extends integrations-errors)                              │  │
│   │                                                                           │  │
│   │  Visibility: INTERNAL                                                     │  │
│   │  Purpose: Adapt integration primitives to OAuth2 domain                   │  │
│   └──────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                           │
│                                      ▼                                           │
│   LAYER 5: INTEGRATION PRIMITIVES (External)                                     │
│   ┌──────────────────────────────────────────────────────────────────────────┐  │
│   │  • integrations-errors                                                    │  │
│   │  • integrations-retry                                                     │  │
│   │  • integrations-circuit-breaker                                           │  │
│   │  • integrations-rate-limit                                                │  │
│   │  • integrations-tracing                                                   │  │
│   │  • integrations-logging                                                   │  │
│   │  • integrations-types                                                     │  │
│   │  • integrations-config                                                    │  │
│   │                                                                           │  │
│   │  Visibility: N/A (external dependency)                                    │  │
│   │  Purpose: Shared infrastructure across all integration modules            │  │
│   └──────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Layer Dependencies

```
    Layer 1 ──────────> Layer 2
       │                   │
       │                   ▼
       │              Layer 3
       │                   │
       │                   ▼
       └──────────────> Layer 4
                           │
                           ▼
                      Layer 5 (External)
```

**Dependency Rules:**
- Higher layers MAY depend on lower layers
- Lower layers MUST NOT depend on higher layers
- Same-layer components MAY have peer dependencies
- All layers MUST NOT depend on external integration modules (OpenAI, GitHub, etc.)
- All layers MUST NOT depend on ruvbase

### 4.3 Module Structure (Rust)

```
integrations/oauth2/
├── Cargo.toml
├── src/
│   ├── lib.rs                      # Public exports
│   │
│   ├── client/                     # Layer 1: Public API
│   │   ├── mod.rs
│   │   ├── oauth2_client.rs        # OAuth2Client facade
│   │   ├── builder.rs              # OAuth2ConfigBuilder
│   │   └── providers.rs            # WellKnownProviders
│   │
│   ├── flows/                      # Layer 2: Flow Interfaces
│   │   ├── mod.rs
│   │   ├── authorization_code.rs   # AuthorizationCodeFlow trait + impl
│   │   ├── pkce.rs                 # AuthorizationCodePkceFlow trait + impl
│   │   ├── client_credentials.rs   # ClientCredentialsFlow trait + impl
│   │   └── device.rs               # DeviceAuthorizationFlow trait + impl
│   │
│   ├── token/                      # Layer 2-3: Token Management
│   │   ├── mod.rs
│   │   ├── manager.rs              # TokenManager trait + impl
│   │   ├── storage.rs              # TokenStorage trait
│   │   ├── storage_memory.rs       # InMemoryTokenStorage
│   │   ├── storage_file.rs         # FileTokenStorage
│   │   ├── introspection.rs        # TokenIntrospection trait + impl
│   │   └── revocation.rs           # TokenRevocation trait + impl
│   │
│   ├── core/                       # Layer 3: Core Components
│   │   ├── mod.rs
│   │   ├── transport.rs            # HttpTransport
│   │   ├── state.rs                # StateManager
│   │   ├── pkce.rs                 # PkceGenerator
│   │   └── discovery.rs            # DiscoveryClient
│   │
│   ├── resilience/                 # Layer 4: Resilience Wrappers
│   │   ├── mod.rs
│   │   ├── retry.rs                # OAuth2RetryExecutor
│   │   ├── circuit_breaker.rs      # OAuth2CircuitBreaker
│   │   └── rate_limiter.rs         # OAuth2RateLimiter
│   │
│   ├── error/                      # Layer 4: Error Types
│   │   ├── mod.rs
│   │   ├── types.rs                # OAuth2Error enum
│   │   ├── mapping.rs              # RFC 6749 error mapping
│   │   └── recovery.rs             # Error recovery strategies
│   │
│   ├── telemetry/                  # Layer 4: Observability
│   │   ├── mod.rs
│   │   ├── metrics.rs              # OAuth2Metrics
│   │   ├── tracing.rs              # OAuth2Tracer
│   │   └── logging.rs              # OAuth2Logger
│   │
│   ├── config/                     # Layer 4: Configuration
│   │   ├── mod.rs
│   │   ├── types.rs                # Config structs
│   │   └── validation.rs           # Config validation
│   │
│   └── types/                      # Shared Types
│       ├── mod.rs
│       ├── token.rs                # TokenResponse, StoredTokens, etc.
│       ├── auth.rs                 # AuthorizationParams, etc.
│       └── callback.rs             # CallbackParams, etc.
│
└── tests/
    ├── integration/                # Integration tests
    └── unit/                       # Unit tests with mocks
```

### 4.4 Module Structure (TypeScript)

```
integrations/oauth2/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # Public exports
│   │
│   ├── client/                     # Layer 1: Public API
│   │   ├── index.ts
│   │   ├── oauth2-client.ts
│   │   ├── builder.ts
│   │   └── providers.ts
│   │
│   ├── flows/                      # Layer 2: Flow Interfaces
│   │   ├── index.ts
│   │   ├── authorization-code.ts
│   │   ├── pkce.ts
│   │   ├── client-credentials.ts
│   │   └── device.ts
│   │
│   ├── token/                      # Layer 2-3: Token Management
│   │   ├── index.ts
│   │   ├── manager.ts
│   │   ├── storage.ts
│   │   ├── storage-memory.ts
│   │   ├── storage-file.ts
│   │   ├── introspection.ts
│   │   └── revocation.ts
│   │
│   ├── core/                       # Layer 3: Core Components
│   │   ├── index.ts
│   │   ├── transport.ts
│   │   ├── state.ts
│   │   ├── pkce.ts
│   │   └── discovery.ts
│   │
│   ├── resilience/                 # Layer 4: Resilience
│   │   ├── index.ts
│   │   ├── retry.ts
│   │   ├── circuit-breaker.ts
│   │   └── rate-limiter.ts
│   │
│   ├── error/                      # Layer 4: Errors
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── mapping.ts
│   │   └── recovery.ts
│   │
│   ├── telemetry/                  # Layer 4: Observability
│   │   ├── index.ts
│   │   ├── metrics.ts
│   │   ├── tracing.ts
│   │   └── logging.ts
│   │
│   └── types/                      # Shared Types
│       ├── index.ts
│       ├── token.ts
│       ├── auth.ts
│       └── callback.ts
│
└── tests/
    ├── integration/
    └── unit/
```

---

## 5. Data Flow Architecture

### 5.1 Authorization Code Flow Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    Authorization Code Flow - Data Flow                           │
│                                                                                  │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────────┐   │
│  │  User   │    │Consumer │    │ OAuth2  │    │ Auth    │    │ Resource    │   │
│  │         │    │  App    │    │ Module  │    │ Server  │    │ Server      │   │
│  └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘    └──────┬──────┘   │
│       │              │              │              │                 │          │
│       │   1. Login   │              │              │                 │          │
│       │─────────────>│              │              │                 │          │
│       │              │              │              │                 │          │
│       │              │ 2. build_    │              │                 │          │
│       │              │    auth_url()│              │                 │          │
│       │              │─────────────>│              │                 │          │
│       │              │              │              │                 │          │
│       │              │<─────────────│              │                 │          │
│       │              │ AuthUrl +    │              │                 │          │
│       │              │ State        │              │                 │          │
│       │              │              │              │                 │          │
│       │<─────────────│ 3. Redirect  │              │                 │          │
│       │              │    to Auth   │              │                 │          │
│       │              │    Server    │              │                 │          │
│       │              │              │              │                 │          │
│       │─────────────────────────────────────────────> 4. Authenticate│          │
│       │              │              │              │                 │          │
│       │<─────────────────────────────────────────────│ 5. Callback   │          │
│       │              │              │              │    with Code    │          │
│       │              │              │              │                 │          │
│       │─────────────>│ 6. Callback  │              │                 │          │
│       │              │              │              │                 │          │
│       │              │─────────────>│ 7. handle_   │                 │          │
│       │              │              │    callback()│                 │          │
│       │              │              │              │                 │          │
│       │              │              │──────────────> 8. Exchange     │          │
│       │              │              │              │    Code for     │          │
│       │              │              │              │    Tokens       │          │
│       │              │              │              │                 │          │
│       │              │              │<──────────────│ 9. TokenResponse│         │
│       │              │              │              │                 │          │
│       │              │<─────────────│ 10. Tokens   │                 │          │
│       │              │              │    Stored    │                 │          │
│       │              │              │              │                 │          │
│       │              │──────────────────────────────────────────────>│ 11. API  │
│       │              │              │              │                 │    Call  │
│       │              │<──────────────────────────────────────────────│ 12. Data │
│       │              │              │              │                 │          │
│       │<─────────────│ 13. Response │              │                 │          │
│       │              │              │              │                 │          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Token Refresh Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       Token Refresh - Data Flow                                  │
│                                                                                  │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────────┐   │
│  │Consumer │    │ Token   │    │ Token   │    │ HTTP    │    │ Auth        │   │
│  │  App    │    │ Manager │    │ Storage │    │Transport│    │ Server      │   │
│  └────┬────┘    └────┬────┘    └────┬────┘    └────┬────┘    └──────┬──────┘   │
│       │              │              │              │                 │          │
│       │ get_access_  │              │              │                 │          │
│       │ token()      │              │              │                 │          │
│       │─────────────>│              │              │                 │          │
│       │              │              │              │                 │          │
│       │              │ get()        │              │                 │          │
│       │              │─────────────>│              │                 │          │
│       │              │<─────────────│              │                 │          │
│       │              │ StoredTokens │              │                 │          │
│       │              │              │              │                 │          │
│       │              │ [Check: is_expiring_soon?]  │                 │          │
│       │              │              │              │                 │          │
│       │              │ [Yes: Token expiring]       │                 │          │
│       │              │              │              │                 │          │
│       │              │ [Acquire refresh lock]      │                 │          │
│       │              │              │              │                 │          │
│       │              │─────────────────────────────> refresh_token   │          │
│       │              │              │              │ request         │          │
│       │              │              │              │─────────────────>│          │
│       │              │              │              │                 │          │
│       │              │              │              │<─────────────────│          │
│       │              │              │              │ TokenResponse   │          │
│       │              │              │              │                 │          │
│       │              │ store()      │              │                 │          │
│       │              │─────────────>│              │                 │          │
│       │              │              │ [Update      │                 │          │
│       │              │              │  tokens]     │                 │          │
│       │              │<─────────────│              │                 │          │
│       │              │              │              │                 │          │
│       │<─────────────│ AccessToken  │              │                 │          │
│       │              │ (refreshed)  │              │                 │          │
│       │              │              │              │                 │          │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Data Types Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Data Types Transformation                              │
│                                                                                  │
│  ┌─────────────────┐                                                             │
│  │ OAuth2Config    │──────> Client Creation                                      │
│  │ + ProviderConfig│                                                             │
│  │ + Credentials   │                                                             │
│  └─────────────────┘                                                             │
│           │                                                                      │
│           ▼                                                                      │
│  ┌─────────────────┐                                                             │
│  │AuthorizationParams│──────> build_authorization_url()                          │
│  │ + redirect_uri  │                                                             │
│  │ + scopes        │                                                             │
│  │ + state         │                                                             │
│  └─────────────────┘                                                             │
│           │                                                                      │
│           ▼                                                                      │
│  ┌─────────────────┐                                                             │
│  │ AuthorizationUrl│──────> User Redirect                                        │
│  │ + url           │                                                             │
│  │ + state         │                                                             │
│  │ + pkce_verifier │                                                             │
│  └─────────────────┘                                                             │
│           │                                                                      │
│           ▼                                                                      │
│  ┌─────────────────┐                                                             │
│  │ CallbackParams  │──────> handle_callback()                                    │
│  │ + code          │                                                             │
│  │ + state         │                                                             │
│  │ + error         │                                                             │
│  └─────────────────┘                                                             │
│           │                                                                      │
│           ▼                                                                      │
│  ┌─────────────────┐                                                             │
│  │ TokenResponse   │──────> From Auth Server (JSON)                              │
│  │ + access_token  │                                                             │
│  │ + refresh_token │                                                             │
│  │ + expires_in    │                                                             │
│  └─────────────────┘                                                             │
│           │                                                                      │
│           ▼                                                                      │
│  ┌─────────────────┐                                                             │
│  │ StoredTokens    │──────> TokenStorage (persistence)                           │
│  │ + access_token  │                                                             │
│  │ + expires_at    │                                                             │
│  │ + metadata      │                                                             │
│  └─────────────────┘                                                             │
│           │                                                                      │
│           ▼                                                                      │
│  ┌─────────────────┐                                                             │
│  │ AccessToken     │──────> Consumer (for API calls)                             │
│  │ + token         │                                                             │
│  │ + token_type    │                                                             │
│  │ + scopes        │                                                             │
│  └─────────────────┘                                                             │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Dependency Architecture

### 6.1 Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Dependency Graph                                        │
│                                                                                  │
│                      ┌─────────────────────┐                                     │
│                      │   OAuth2 Module     │                                     │
│                      └──────────┬──────────┘                                     │
│                                 │                                                │
│           ┌─────────────────────┼─────────────────────┐                          │
│           │                     │                     │                          │
│           ▼                     ▼                     ▼                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                  │
│  │integrations-    │  │integrations-    │  │integrations-    │                  │
│  │errors           │  │retry            │  │circuit-breaker  │                  │
│  │                 │  │                 │  │                 │                  │
│  │ • OAuth2Error   │  │ • RetryExecutor │  │ • CircuitBreaker│                  │
│  │   derives from  │  │ • BackoffCalc   │  │ • StateTracker  │                  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                  │
│           │                                          │                          │
│           │                                          │                          │
│           ▼                     ▼                    ▼                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                  │
│  │integrations-    │  │integrations-    │  │integrations-    │                  │
│  │rate-limit       │  │tracing          │  │logging          │                  │
│  │                 │  │                 │  │                 │                  │
│  │ • RateLimiter   │  │ • Tracer        │  │ • Logger        │                  │
│  │ • TokenBucket   │  │ • Span          │  │ • Formatter     │                  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                  │
│                                                                                  │
│           ▼                     ▼                                                │
│  ┌─────────────────┐  ┌─────────────────┐                                       │
│  │integrations-    │  │integrations-    │                                       │
│  │types            │  │config           │                                       │
│  │                 │  │                 │                                       │
│  │ • SecretString  │  │ • ConfigLoader  │                                       │
│  │ • Url           │  │ • EnvResolver   │                                       │
│  └─────────────────┘  └─────────────────┘                                       │
│                                                                                  │
│  ═══════════════════════════════════════════════════════════════════════════    │
│                                                                                  │
│                      FORBIDDEN DEPENDENCIES                                      │
│                                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ ruvbase         │  │integrations-    │  │integrations-    │                  │
│  │ (Layer 0)       │  │openai           │  │github           │                  │
│  │                 │  │                 │  │                 │                  │
│  │    ✗ FORBIDDEN  │  │    ✗ FORBIDDEN  │  │    ✗ FORBIDDEN  │                  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘                  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 External Dependencies (Rust)

| Crate | Version | Purpose | Justification |
|-------|---------|---------|---------------|
| `reqwest` | ^0.11 | HTTP client | Industry-standard async HTTP |
| `tokio` | ^1.0 | Async runtime | Required for async operations |
| `serde` | ^1.0 | Serialization | JSON parsing for OAuth2 responses |
| `serde_json` | ^1.0 | JSON | Token response parsing |
| `url` | ^2.0 | URL handling | Authorization URL construction |
| `base64` | ^0.21 | Encoding | PKCE, Basic auth encoding |
| `sha2` | ^0.10 | Hashing | PKCE S256 challenge |
| `rand` | ^0.8 | Randomness | State and verifier generation |
| `secrecy` | ^0.8 | Secret handling | SecretString for tokens |
| `thiserror` | ^1.0 | Error handling | Error type derivation |
| `chrono` | ^0.4 | Time handling | Token expiration |
| `parking_lot` | ^0.12 | Synchronization | Efficient RwLock for caching |

### 6.3 External Dependencies (TypeScript)

| Package | Version | Purpose |
|---------|---------|---------|
| `node-fetch` | ^3.0 | HTTP client (Node.js) |
| `crypto` | native | PKCE generation |
| `url` | native | URL handling |

### 6.4 Dependency Injection Pattern

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    Dependency Injection Architecture                             │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                          OAuth2ClientBuilder                                │ │
│  │                                                                             │ │
│  │   .with_transport(custom_transport)      // HttpTransport                   │ │
│  │   .with_storage(custom_storage)          // TokenStorage                    │ │
│  │   .with_retry_executor(custom_retry)     // RetryExecutor                   │ │
│  │   .with_circuit_breaker(custom_cb)       // CircuitBreaker                  │ │
│  │   .with_rate_limiter(custom_rl)          // RateLimiter                     │ │
│  │   .with_logger(custom_logger)            // Logger                          │ │
│  │   .with_tracer(custom_tracer)            // Tracer                          │ │
│  │   .build()                               // OAuth2Client                    │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  Default implementations used when not explicitly injected:                      │
│                                                                                  │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐         │
│  │ HttpTransportImpl  │  │ InMemoryStorage    │  │ OAuth2RetryExecutor│         │
│  │ (production)       │  │ (default)          │  │ (default config)   │         │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘         │
│                                                                                  │
│  Mock implementations for testing:                                               │
│                                                                                  │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐         │
│  │ MockHttpTransport  │  │ MockTokenStorage   │  │ MockRetryExecutor  │         │
│  │ (test doubles)     │  │ (test doubles)     │  │ (test doubles)     │         │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘         │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Interface Architecture

### 7.1 Public Interface Surface

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Public Interface Surface                                 │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ FACTORY FUNCTIONS                                                          │ │
│  │                                                                             │ │
│  │   create_oauth2_client(config: OAuth2Config) -> Result<OAuth2Client>       │ │
│  │   create_oauth2_client_from_discovery(issuer, creds) -> Result<OAuth2Client>│ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ MAIN CLIENT                                                                │ │
│  │                                                                             │ │
│  │   OAuth2Client                                                              │ │
│  │     .authorization_code() -> &AuthorizationCodeFlow                        │ │
│  │     .authorization_code_pkce() -> &AuthorizationCodePkceFlow               │ │
│  │     .client_credentials() -> &ClientCredentialsFlow                        │ │
│  │     .device_authorization() -> &DeviceAuthorizationFlow                    │ │
│  │     .tokens() -> &TokenManager                                             │ │
│  │     .introspection() -> &TokenIntrospection                                │ │
│  │     .revocation() -> &TokenRevocation                                      │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ FLOW TRAITS (public for mocking)                                           │ │
│  │                                                                             │ │
│  │   trait AuthorizationCodeFlow                                              │ │
│  │   trait AuthorizationCodePkceFlow                                          │ │
│  │   trait ClientCredentialsFlow                                              │ │
│  │   trait DeviceAuthorizationFlow                                            │ │
│  │   trait TokenManager                                                       │ │
│  │   trait TokenIntrospection                                                 │ │
│  │   trait TokenRevocation                                                    │ │
│  │   trait TokenStorage (for custom implementations)                          │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ CONFIGURATION                                                              │ │
│  │                                                                             │ │
│  │   OAuth2Config                                                             │ │
│  │   OAuth2ConfigBuilder                                                      │ │
│  │   ProviderConfig                                                           │ │
│  │   ClientCredentials                                                        │ │
│  │   WellKnownProviders::{google, github, microsoft, okta, auth0}             │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ DATA TYPES                                                                 │ │
│  │                                                                             │ │
│  │   TokenResponse, StoredTokens, AccessToken                                 │ │
│  │   AuthorizationParams, AuthorizationUrl                                    │ │
│  │   PkceAuthorizationParams, PkceAuthorizationUrl                            │ │
│  │   CallbackParams, CodeExchangeRequest                                      │ │
│  │   DeviceAuthorizationResponse, DeviceTokenResult                           │ │
│  │   IntrospectionParams, IntrospectionResponse                               │ │
│  │   RevocationParams                                                         │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ ERROR TYPES                                                                │ │
│  │                                                                             │ │
│  │   OAuth2Error                                                              │ │
│  │   ConfigurationError, AuthorizationError, TokenError                       │ │
│  │   ProtocolError, ProviderError, NetworkError, StorageError                 │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Interface Contracts

```rust
// Rust Interface Contracts

/// Main client facade - entry point for all OAuth2 operations
pub trait OAuth2Client: Send + Sync {
    /// Get authorization code flow handler
    fn authorization_code(&self) -> &dyn AuthorizationCodeFlow;

    /// Get PKCE-enhanced authorization code flow handler
    fn authorization_code_pkce(&self) -> &dyn AuthorizationCodePkceFlow;

    /// Get client credentials flow handler
    fn client_credentials(&self) -> &dyn ClientCredentialsFlow;

    /// Get device authorization flow handler
    fn device_authorization(&self) -> &dyn DeviceAuthorizationFlow;

    /// Get token manager
    fn tokens(&self) -> &dyn TokenManager;

    /// Get token introspection handler
    fn introspection(&self) -> &dyn TokenIntrospection;

    /// Get token revocation handler
    fn revocation(&self) -> &dyn TokenRevocation;
}

/// Authorization Code Flow (RFC 6749 Section 4.1)
#[async_trait]
pub trait AuthorizationCodeFlow: Send + Sync {
    /// Build authorization URL for user redirect
    fn build_authorization_url(&self, params: AuthorizationParams)
        -> Result<AuthorizationUrl, OAuth2Error>;

    /// Exchange authorization code for tokens
    async fn exchange_code(&self, request: CodeExchangeRequest)
        -> Result<TokenResponse, OAuth2Error>;

    /// Handle authorization callback
    async fn handle_callback(&self, callback: CallbackParams)
        -> Result<TokenResponse, OAuth2Error>;
}

/// PKCE Flow (RFC 7636)
#[async_trait]
pub trait AuthorizationCodePkceFlow: Send + Sync {
    fn build_authorization_url(&self, params: PkceAuthorizationParams)
        -> Result<PkceAuthorizationUrl, OAuth2Error>;

    async fn exchange_code(&self, request: PkceCodeExchangeRequest)
        -> Result<TokenResponse, OAuth2Error>;

    async fn handle_callback(&self, callback: CallbackParams)
        -> Result<TokenResponse, OAuth2Error>;
}

/// Client Credentials Flow (RFC 6749 Section 4.4)
#[async_trait]
pub trait ClientCredentialsFlow: Send + Sync {
    async fn request_token(&self, params: ClientCredentialsParams)
        -> Result<TokenResponse, OAuth2Error>;
}

/// Device Authorization Flow (RFC 8628)
#[async_trait]
pub trait DeviceAuthorizationFlow: Send + Sync {
    async fn request_device_code(&self, params: DeviceCodeParams)
        -> Result<DeviceAuthorizationResponse, OAuth2Error>;

    async fn poll_token(&self, device_code: String)
        -> Result<DeviceTokenResult, OAuth2Error>;

    async fn await_authorization(&self, response: DeviceAuthorizationResponse)
        -> Result<TokenResponse, OAuth2Error>;
}

/// Token Manager - lifecycle management
#[async_trait]
pub trait TokenManager: Send + Sync {
    async fn get_access_token(&self, key: String)
        -> Result<AccessToken, OAuth2Error>;

    async fn store_tokens(&self, key: String, response: TokenResponse)
        -> Result<(), OAuth2Error>;

    async fn get_stored_tokens(&self, key: String)
        -> Result<Option<StoredTokens>, OAuth2Error>;

    async fn clear_tokens(&self, key: String)
        -> Result<(), OAuth2Error>;

    async fn force_refresh(&self, key: String)
        -> Result<TokenResponse, OAuth2Error>;
}

/// Token Storage - pluggable persistence
#[async_trait]
pub trait TokenStorage: Send + Sync {
    async fn store(&self, key: String, tokens: StoredTokens)
        -> Result<(), OAuth2Error>;

    async fn get(&self, key: String)
        -> Result<Option<StoredTokens>, OAuth2Error>;

    async fn delete(&self, key: String)
        -> Result<(), OAuth2Error>;

    async fn exists(&self, key: String)
        -> Result<bool, OAuth2Error>;

    async fn list_keys(&self)
        -> Result<Vec<String>, OAuth2Error>;

    async fn clear(&self)
        -> Result<(), OAuth2Error>;
}
```

---

## 8. Resilience Architecture

### 8.1 Resilience Stack

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Resilience Architecture                                 │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                           Request Flow                                      │ │
│  │                                                                             │ │
│  │      Incoming         Rate         Circuit        Retry           HTTP      │ │
│  │      Request   ──>   Limiter  ──>  Breaker  ──>  Executor  ──>  Transport  │ │
│  │         │               │            │              │               │       │ │
│  │         │               │            │              │               │       │ │
│  │         ▼               ▼            ▼              ▼               ▼       │ │
│  │    ┌─────────┐    ┌─────────┐   ┌─────────┐   ┌─────────┐    ┌─────────┐   │ │
│  │    │ Check   │    │ Acquire │   │ Check   │   │ Execute │    │ Send    │   │ │
│  │    │ Config  │    │ Permit  │   │ State   │   │ w/Retry │    │ Request │   │ │
│  │    └─────────┘    └─────────┘   └─────────┘   └─────────┘    └─────────┘   │ │
│  │         │               │            │              │               │       │ │
│  │         │          RateLimited? Open?         Retries        Success/      │ │
│  │         │               │            │         Exhausted?      Failure     │ │
│  │         ▼               ▼            ▼              ▼               ▼       │ │
│  │    ┌─────────────────────────────────────────────────────────────────────┐ │ │
│  │    │                      Error / Success Response                        │ │ │
│  │    └─────────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                      Resilience Configuration                               │ │
│  │                                                                             │ │
│  │   Rate Limiter:                                                            │ │
│  │     • token_endpoint: 60 RPM                                               │ │
│  │     • authorization_endpoint: 30 RPM                                       │ │
│  │     • introspection_endpoint: 60 RPM                                       │ │
│  │     • revocation_endpoint: 30 RPM                                          │ │
│  │     • max_concurrent: 10                                                   │ │
│  │                                                                             │ │
│  │   Circuit Breaker:                                                         │ │
│  │     • failure_threshold: 5                                                 │ │
│  │     • success_threshold: 3                                                 │ │
│  │     • failure_window: 60s                                                  │ │
│  │     • reset_timeout: 30s                                                   │ │
│  │                                                                             │ │
│  │   Retry:                                                                   │ │
│  │     • max_retries: 3                                                       │ │
│  │     • initial_backoff: 500ms                                               │ │
│  │     • max_backoff: 30s                                                     │ │
│  │     • backoff_multiplier: 2.0                                              │ │
│  │     • jitter: 0.1 (10%)                                                    │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Circuit Breaker States

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      Circuit Breaker State Machine                               │
│                                                                                  │
│                        ┌──────────────┐                                          │
│                        │    CLOSED    │ ◄─────────────────────────┐              │
│                        │  (healthy)   │                           │              │
│                        └──────┬───────┘                           │              │
│                               │                                   │              │
│                    failures >= threshold                  successes >= threshold │
│                               │                                   │              │
│                               ▼                                   │              │
│                        ┌──────────────┐                           │              │
│                        │     OPEN     │                           │              │
│                        │   (failing)  │                           │              │
│                        └──────┬───────┘                           │              │
│                               │                                   │              │
│                      reset_timeout elapsed                        │              │
│                               │                                   │              │
│                               ▼                                   │              │
│                        ┌──────────────┐                           │              │
│                        │  HALF-OPEN   │ ──────────────────────────┘              │
│                        │  (probing)   │                                          │
│                        └──────────────┘                                          │
│                               │                                                  │
│                          failure                                                 │
│                               │                                                  │
│                               ▼                                                  │
│                        ┌──────────────┐                                          │
│                        │     OPEN     │ (back to open)                           │
│                        └──────────────┘                                          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Retry Strategy

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Exponential Backoff with Jitter                          │
│                                                                                  │
│   Attempt │ Base Delay │ With Jitter (±10%)  │ Cumulative                       │
│   ────────┼────────────┼─────────────────────┼─────────────                     │
│      1    │   500ms    │   450ms - 550ms     │   ~500ms                         │
│      2    │   1000ms   │   900ms - 1100ms    │   ~1.5s                          │
│      3    │   2000ms   │   1800ms - 2200ms   │   ~3.5s                          │
│      4    │   4000ms   │   3600ms - 4400ms   │   ~7.5s                          │
│      5    │   8000ms   │   7200ms - 8800ms   │   ~15.5s                         │
│                                                                                  │
│   Retryable Errors:                                                              │
│     • NetworkError::Timeout                                                      │
│     • NetworkError::ConnectionFailed                                             │
│     • ProviderError::ServerError (5xx)                                           │
│     • ProviderError::TemporarilyUnavailable                                      │
│     • NetworkError::RateLimited (with Retry-After)                               │
│                                                                                  │
│   Non-Retryable Errors:                                                          │
│     • ProviderError::InvalidGrant (refresh token invalid)                        │
│     • ProviderError::InvalidClient (credentials wrong)                           │
│     • AuthorizationError::AccessDenied                                           │
│     • ConfigurationError::*                                                      │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Security Architecture

### 9.1 Security Controls

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Security Architecture                                    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ TRANSPORT SECURITY                                                         │ │
│  │                                                                             │ │
│  │   • TLS 1.2+ required for all OAuth2 endpoints                             │ │
│  │   • Certificate validation enabled                                          │ │
│  │   • SNI (Server Name Indication) enabled                                    │ │
│  │   • HTTP only allowed for localhost (development)                           │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ TOKEN SECURITY                                                             │ │
│  │                                                                             │ │
│  │   • Tokens stored as SecretString (zeroized on drop)                       │ │
│  │   • Tokens never logged (redacted in all log output)                       │ │
│  │   • Optional encryption for file-based storage (AES-256-GCM)               │ │
│  │   • Token expiration tracked and enforced                                   │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ CSRF PROTECTION                                                            │ │
│  │                                                                             │ │
│  │   • State parameter: 128-bit minimum entropy                               │ │
│  │   • Cryptographically secure random generation                             │ │
│  │   • One-time use (consumed after callback)                                 │ │
│  │   • Time-bounded validity (10 minutes default)                             │ │
│  │   • Constant-time comparison                                                │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ PKCE SECURITY (RFC 7636)                                                   │ │
│  │                                                                             │ │
│  │   • code_verifier: 64 characters from unreserved URI character set         │ │
│  │   • code_challenge_method: S256 (SHA-256) by default                       │ │
│  │   • code_verifier stored securely with state                               │ │
│  │   • Plain method only as fallback when S256 not supported                  │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ CLIENT AUTHENTICATION                                                      │ │
│  │                                                                             │ │
│  │   Supported Methods:                                                        │ │
│  │   • client_secret_basic (RFC 6749) - HTTP Basic Auth                       │ │
│  │   • client_secret_post (RFC 6749) - Secret in body                         │ │
│  │   • client_secret_jwt (RFC 7523) - HMAC-signed JWT                         │ │
│  │   • private_key_jwt (RFC 7523) - RSA/EC-signed JWT                         │ │
│  │   • none - Public clients (PKCE required)                                  │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ LOGGING SECURITY                                                           │ │
│  │                                                                             │ │
│  │   Redacted in logs:                                                         │ │
│  │   • access_token, refresh_token, id_token                                  │ │
│  │   • client_secret                                                          │ │
│  │   • authorization code                                                      │ │
│  │   • code_verifier                                                          │ │
│  │   • state parameter (truncated to 8 chars)                                 │ │
│  │                                                                             │ │
│  │   Allowed in logs:                                                          │ │
│  │   • client_id                                                              │ │
│  │   • scopes                                                                 │ │
│  │   • endpoint URLs (without query params)                                    │ │
│  │   • token_type                                                             │ │
│  │   • expires_in                                                             │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Threat Model

| Threat | Mitigation |
|--------|------------|
| Authorization code interception | PKCE (code_challenge/code_verifier) |
| CSRF attack on callback | State parameter with 128-bit entropy |
| Token leakage via logs | SecretString + redaction |
| Token theft from storage | Optional encryption, secure permissions |
| Man-in-the-middle | TLS 1.2+ enforcement |
| Replay attacks | State consumed after use, short expiration |
| Token stuffing | Rate limiting on token endpoint |

---

## 10. Storage Architecture

### 10.1 Token Storage Strategy

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Token Storage Architecture                               │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                        TokenStorage (trait)                                 │ │
│  │                                                                             │ │
│  │   + store(key, tokens) -> Result<()>                                       │ │
│  │   + get(key) -> Result<Option<StoredTokens>>                               │ │
│  │   + delete(key) -> Result<()>                                              │ │
│  │   + exists(key) -> Result<bool>                                            │ │
│  │   + list_keys() -> Result<Vec<String>>                                     │ │
│  │   + clear() -> Result<()>                                                  │ │
│  │                                                                             │ │
│  └─────────────────────────────┬──────────────────────────────────────────────┘ │
│                                │                                                 │
│            ┌───────────────────┼───────────────────┐                            │
│            │                   │                   │                            │
│            ▼                   ▼                   ▼                            │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐                 │
│  │ InMemoryStorage  │ │ FileStorage      │ │ Custom Storage   │                 │
│  │                  │ │                  │ │ (user-provided)  │                 │
│  │ • HashMap-based  │ │ • JSON file      │ │                  │                 │
│  │ • RwLock protect │ │ • Optional AES   │ │ • Redis          │                 │
│  │ • Fast access    │ │ • Atomic writes  │ │ • Database       │                 │
│  │ • No persistence │ │ • Persistent     │ │ • Vault          │                 │
│  │                  │ │                  │ │ • etc.           │                 │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘                 │
│                                                                                  │
│  Storage Key Strategy:                                                           │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                             │ │
│  │   Key Format: "{provider}:{client_id}:{user_id}"                           │ │
│  │                                                                             │ │
│  │   Examples:                                                                 │ │
│  │   • "google:abc123:user@example.com"                                       │ │
│  │   • "github:def456:user123"                                                │ │
│  │   • "default:client123:default" (for client credentials)                   │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Stored Token Structure

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         StoredTokens Structure                                   │
│                                                                                  │
│  StoredTokens {                                                                  │
│    ┌────────────────────────────────────────────────────────────────────────┐   │
│    │ access_token: SecretString      // Bearer token                         │   │
│    │ token_type: String              // "Bearer"                             │   │
│    │ expires_at: Option<Instant>     // Calculated from expires_in           │   │
│    │ refresh_token: Option<Secret>   // For token refresh                    │   │
│    │ refresh_token_expires_at: Option<Instant>                               │   │
│    │ scopes: Vec<String>             // Granted scopes                       │   │
│    │ id_token: Option<String>        // OIDC ID token                        │   │
│    └────────────────────────────────────────────────────────────────────────┘   │
│    ┌────────────────────────────────────────────────────────────────────────┐   │
│    │ metadata: TokenMetadata {                                               │   │
│    │   acquired_at: Instant          // When tokens were obtained            │   │
│    │   last_used_at: Option<Instant> // Last access time                     │   │
│    │   refresh_count: u32            // Number of refreshes                  │   │
│    │   provider: Option<String>      // Provider identifier                  │   │
│    │   extra: HashMap<String, String>// Custom metadata                      │   │
│    │ }                                                                       │   │
│    └────────────────────────────────────────────────────────────────────────┘   │
│  }                                                                               │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Concurrency Architecture

### 11.1 Thread Safety Model

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       Concurrency Architecture                                   │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ THREAD SAFETY GUARANTEES                                                   │ │
│  │                                                                             │ │
│  │   • OAuth2Client: Send + Sync (safely shareable across threads)            │ │
│  │   • All flow traits: Send + Sync                                           │ │
│  │   • TokenStorage: Send + Sync                                              │ │
│  │   • All async operations are cancellation-safe                             │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ SHARED STATE PROTECTION                                                    │ │
│  │                                                                             │ │
│  │   Component              │ Protection Mechanism                             │ │
│  │   ──────────────────────────────────────────────────────────────────────   │ │
│  │   Token Storage          │ RwLock (read-heavy workload)                     │ │
│  │   State Cache            │ RwLock with TTL-based cleanup                    │ │
│  │   Discovery Cache        │ RwLock with TTL-based refresh                    │ │
│  │   Refresh Locks          │ Per-key Mutex (prevent concurrent refresh)       │ │
│  │   Circuit Breaker State  │ Atomic operations                                │ │
│  │   Rate Limiter State     │ Mutex for token bucket                           │ │
│  │   Metrics Counters       │ Atomic operations                                │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ CONCURRENT REFRESH PREVENTION                                              │ │
│  │                                                                             │ │
│  │   Thread 1                Thread 2                Thread 3                  │ │
│  │      │                       │                       │                      │ │
│  │      │ get_token()           │ get_token()           │ get_token()          │ │
│  │      │                       │                       │                      │ │
│  │      ▼                       ▼                       ▼                      │ │
│  │   [Check: expiring?]    [Check: expiring?]    [Check: expiring?]           │ │
│  │      │ yes                   │ yes                   │ yes                  │ │
│  │      ▼                       ▼                       ▼                      │ │
│  │   [Acquire refresh    [Wait for lock...]    [Wait for lock...]             │ │
│  │    lock for key]            │                       │                      │ │
│  │      │                       │                       │                      │ │
│  │      ▼                       │                       │                      │ │
│  │   [Check: already           │                       │                      │ │
│  │    refreshed?] no           │                       │                      │ │
│  │      │                       │                       │                      │ │
│  │      ▼                       │                       │                      │ │
│  │   [Do refresh]              │                       │                      │ │
│  │      │                       │                       │                      │ │
│  │      ▼                       │                       │                      │ │
│  │   [Release lock]────────────┤───────────────────────┤                      │ │
│  │      │                       ▼                       ▼                      │ │
│  │      │                 [Check: already         [Check: already             │ │
│  │      │                  refreshed?] yes         refreshed?] yes            │ │
│  │      │                       │                       │                      │ │
│  │      ▼                       ▼                       ▼                      │ │
│  │   [Return new token]   [Return new token]    [Return new token]            │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Configuration Architecture

### 12.1 Configuration Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      Configuration Architecture                                  │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ CONFIGURATION SOURCES (Priority: High to Low)                              │ │
│  │                                                                             │ │
│  │   1. Programmatic (OAuth2ConfigBuilder)                                    │ │
│  │   2. Environment Variables                                                 │ │
│  │   3. Configuration File                                                    │ │
│  │   4. OIDC Discovery                                                        │ │
│  │   5. Well-Known Provider Defaults                                          │ │
│  │   6. Module Defaults                                                       │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ CONFIGURATION STRUCTURE                                                    │ │
│  │                                                                             │ │
│  │   OAuth2Config                                                             │ │
│  │   ├── provider: ProviderConfig                                             │ │
│  │   │   ├── authorization_endpoint: Url                                      │ │
│  │   │   ├── token_endpoint: Url                                              │ │
│  │   │   ├── device_authorization_endpoint: Option<Url>                       │ │
│  │   │   ├── introspection_endpoint: Option<Url>                              │ │
│  │   │   ├── revocation_endpoint: Option<Url>                                 │ │
│  │   │   ├── userinfo_endpoint: Option<Url>                                   │ │
│  │   │   ├── jwks_uri: Option<Url>                                            │ │
│  │   │   └── issuer: Option<String>                                           │ │
│  │   │                                                                         │ │
│  │   ├── credentials: ClientCredentials                                       │ │
│  │   │   ├── client_id: String                                                │ │
│  │   │   ├── client_secret: Option<SecretString>                              │ │
│  │   │   └── auth_method: ClientAuthMethod                                    │ │
│  │   │                                                                         │ │
│  │   ├── default_scopes: Vec<String>                                          │ │
│  │   ├── storage: TokenStorageConfig                                          │ │
│  │   ├── timeout: Duration                                                    │ │
│  │   ├── retry_config: RetryConfig                                            │ │
│  │   ├── auto_refresh: bool                                                   │ │
│  │   └── refresh_threshold_secs: u64                                          │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ ENVIRONMENT VARIABLES                                                      │ │
│  │                                                                             │ │
│  │   OAUTH2_CLIENT_ID            // Client identifier                         │ │
│  │   OAUTH2_CLIENT_SECRET        // Client secret (optional)                  │ │
│  │   OAUTH2_AUTHORIZATION_ENDPOINT                                            │ │
│  │   OAUTH2_TOKEN_ENDPOINT                                                    │ │
│  │   OAUTH2_ISSUER               // For OIDC discovery                        │ │
│  │   OAUTH2_SCOPES               // Comma-separated                           │ │
│  │   OAUTH2_TIMEOUT_SECS                                                      │ │
│  │   OAUTH2_STORAGE_TYPE         // memory, file                              │ │
│  │   OAUTH2_STORAGE_PATH         // For file storage                          │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Observability Architecture

### 13.1 Telemetry Stack

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      Observability Architecture                                  │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ METRICS (via integrations-tracing)                                         │ │
│  │                                                                             │ │
│  │   Counters:                                                                │ │
│  │   • oauth2.token.acquisitions{provider, grant_type, success}              │ │
│  │   • oauth2.token.refreshes{provider, success}                             │ │
│  │   • oauth2.token.expirations{provider}                                    │ │
│  │   • oauth2.authorization.started{provider, flow}                          │ │
│  │   • oauth2.authorization.completed{provider, flow, success}               │ │
│  │   • oauth2.http.requests{endpoint, method, status}                        │ │
│  │   • oauth2.errors{error_type, provider}                                   │ │
│  │   • oauth2.circuit_breaker.state_changes{service, from, to}               │ │
│  │   • oauth2.rate_limit.hits{endpoint}                                      │ │
│  │                                                                             │ │
│  │   Histograms:                                                              │ │
│  │   • oauth2.token.acquisition_duration_ms{provider, grant_type}            │ │
│  │   • oauth2.token.refresh_duration_ms{provider}                            │ │
│  │   • oauth2.http.request_duration_ms{endpoint}                             │ │
│  │   • oauth2.authorization.duration_ms{provider, flow}                      │ │
│  │                                                                             │ │
│  │   Gauges:                                                                  │ │
│  │   • oauth2.tokens.stored{storage_type}                                    │ │
│  │   • oauth2.circuit_breaker.state{service}                                 │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ TRACING (via integrations-tracing)                                         │ │
│  │                                                                             │ │
│  │   Spans:                                                                   │ │
│  │   • oauth2.authorization_code.build_url                                   │ │
│  │   • oauth2.authorization_code.exchange                                    │ │
│  │   • oauth2.authorization_code.callback                                    │ │
│  │   • oauth2.authorization_code_pkce.build_url                              │ │
│  │   • oauth2.authorization_code_pkce.exchange                               │ │
│  │   • oauth2.client_credentials.request                                     │ │
│  │   • oauth2.device.request_code                                            │ │
│  │   • oauth2.device.poll_token                                              │ │
│  │   • oauth2.device.await_authorization                                     │ │
│  │   • oauth2.token_manager.get_access_token                                 │ │
│  │   • oauth2.token_manager.store_tokens                                     │ │
│  │   • oauth2.token_manager.force_refresh                                    │ │
│  │   • oauth2.introspection.introspect                                       │ │
│  │   • oauth2.revocation.revoke                                              │ │
│  │   • oauth2.http (internal HTTP calls)                                     │ │
│  │   • oauth2.retry.execute                                                  │ │
│  │                                                                             │ │
│  │   Span Attributes:                                                         │ │
│  │   • oauth2.provider                                                       │ │
│  │   • oauth2.flow                                                           │ │
│  │   • oauth2.grant_type                                                     │ │
│  │   • oauth2.client_id                                                      │ │
│  │   • oauth2.scopes                                                         │ │
│  │   • http.method, http.url, http.status_code                               │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ LOGGING (via integrations-logging)                                         │ │
│  │                                                                             │ │
│  │   Log Levels:                                                              │ │
│  │   • ERROR: Failed operations, circuit breaker opens                        │ │
│  │   • WARN: Token expiration, rate limiting, retries                         │ │
│  │   • INFO: Token acquisition, refresh, authorization flow steps             │ │
│  │   • DEBUG: HTTP requests/responses, cache operations                       │ │
│  │   • TRACE: Detailed protocol data (sanitized)                              │ │
│  │                                                                             │ │
│  │   Structured Fields:                                                       │ │
│  │   • component: "oauth2"                                                    │ │
│  │   • operation: (e.g., "token_refresh")                                     │ │
│  │   • provider: (e.g., "google")                                             │ │
│  │   • client_id: (redacted if needed)                                        │ │
│  │   • duration_ms: numeric                                                   │ │
│  │   • error: error message (if applicable)                                   │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 14. Extension Architecture

### 14.1 Extension Points

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Extension Architecture                                    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ EXTENSION POINT 1: Custom Token Storage                                    │ │
│  │                                                                             │ │
│  │   impl TokenStorage for RedisTokenStorage {                                │ │
│  │     async fn store(&self, key: String, tokens: StoredTokens) { ... }       │ │
│  │     async fn get(&self, key: String) -> Option<StoredTokens> { ... }       │ │
│  │     ...                                                                    │ │
│  │   }                                                                        │ │
│  │                                                                             │ │
│  │   let client = OAuth2ConfigBuilder::new()                                  │ │
│  │     .storage(TokenStorageConfig::Custom(Box::new(redis_storage)))          │ │
│  │     .build()?;                                                             │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ EXTENSION POINT 2: Custom Provider Configuration                           │ │
│  │                                                                             │ │
│  │   let custom_provider = ProviderConfig {                                   │ │
│  │     authorization_endpoint: Url::parse("https://custom.idp/authorize")?,  │ │
│  │     token_endpoint: Url::parse("https://custom.idp/token")?,              │ │
│  │     introspection_endpoint: Some(...),                                     │ │
│  │     ...                                                                    │ │
│  │   };                                                                       │ │
│  │                                                                             │ │
│  │   let client = OAuth2ConfigBuilder::new()                                  │ │
│  │     .provider(custom_provider)                                             │ │
│  │     .build()?;                                                             │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ EXTENSION POINT 3: Custom HTTP Transport                                   │ │
│  │                                                                             │ │
│  │   impl HttpTransport for ProxiedTransport {                                │ │
│  │     async fn send(&self, req: HttpRequest) -> Result<HttpResponse> {       │ │
│  │       // Add proxy handling                                                │ │
│  │       ...                                                                  │ │
│  │     }                                                                      │ │
│  │   }                                                                        │ │
│  │                                                                             │ │
│  │   let client = OAuth2ClientBuilder::new(config)                            │ │
│  │     .with_transport(Arc::new(proxied_transport))                           │ │
│  │     .build()?;                                                             │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ EXTENSION POINT 4: Token Lifecycle Hooks                                   │ │
│  │                                                                             │ │
│  │   let client = OAuth2ConfigBuilder::new()                                  │ │
│  │     .on_token_acquired(|response| {                                        │ │
│  │       // Custom logic when tokens acquired                                 │ │
│  │     })                                                                     │ │
│  │     .on_token_refreshed(|old, new| {                                       │ │
│  │       // Custom logic when tokens refreshed                                │ │
│  │     })                                                                     │ │
│  │     .on_token_expired(|key| {                                              │ │
│  │       // Custom logic when token expires                                   │ │
│  │     })                                                                     │ │
│  │     .build()?;                                                             │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 15. Deployment Architecture

### 15.1 Deployment Considerations

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       Deployment Architecture                                    │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ SINGLE-INSTANCE DEPLOYMENT                                                 │ │
│  │                                                                             │ │
│  │   ┌─────────────────┐                                                      │ │
│  │   │   Application   │                                                      │ │
│  │   │   + OAuth2      │ ────────────────> Authorization Server              │ │
│  │   │   Client        │                                                      │ │
│  │   │   + In-Memory   │                                                      │ │
│  │   │     Storage     │                                                      │ │
│  │   └─────────────────┘                                                      │ │
│  │                                                                             │ │
│  │   Suitable for: CLI tools, single-server apps, development                 │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ MULTI-INSTANCE DEPLOYMENT                                                  │ │
│  │                                                                             │ │
│  │   ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │ │
│  │   │   Instance 1    │    │   Instance 2    │    │   Instance 3    │        │ │
│  │   │   + OAuth2      │    │   + OAuth2      │    │   + OAuth2      │        │ │
│  │   │     Client      │    │     Client      │    │     Client      │        │ │
│  │   └────────┬────────┘    └────────┬────────┘    └────────┬────────┘        │ │
│  │            │                      │                      │                 │ │
│  │            └──────────────────────┼──────────────────────┘                 │ │
│  │                                   │                                        │ │
│  │                                   ▼                                        │ │
│  │                        ┌─────────────────┐                                 │ │
│  │                        │  Shared Redis   │                                 │ │
│  │                        │  Token Storage  │                                 │ │
│  │                        └─────────────────┘                                 │ │
│  │                                                                             │ │
│  │   Suitable for: Horizontally scaled services, Kubernetes deployments       │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────┐ │
│  │ MULTI-TENANT DEPLOYMENT                                                    │ │
│  │                                                                             │ │
│  │   ┌─────────────────────────────────────────────────────────────────────┐  │ │
│  │   │                      Application                                     │  │ │
│  │   │   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐           │  │ │
│  │   │   │ Tenant A      │  │ Tenant B      │  │ Tenant C      │           │  │ │
│  │   │   │ OAuth2Client  │  │ OAuth2Client  │  │ OAuth2Client  │           │  │ │
│  │   │   │ (Google)      │  │ (Azure)       │  │ (Okta)        │           │  │ │
│  │   │   └───────────────┘  └───────────────┘  └───────────────┘           │  │ │
│  │   │            │                  │                  │                   │  │ │
│  │   │            ▼                  ▼                  ▼                   │  │ │
│  │   │   ┌─────────────────────────────────────────────────────────────┐   │  │ │
│  │   │   │           Isolated Token Storage per Tenant                  │   │  │ │
│  │   │   │   tenant_a:*        tenant_b:*        tenant_c:*             │   │  │ │
│  │   │   └─────────────────────────────────────────────────────────────┘   │  │ │
│  │   └─────────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                             │ │
│  │   Suitable for: SaaS applications, multi-provider scenarios                │ │
│  │                                                                             │ │
│  └────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 16. Decision Records

### 16.1 Architecture Decision Records (ADRs)

| ADR | Decision | Rationale |
|-----|----------|-----------|
| **ADR-001** | Use trait-based interfaces for all flows | Enables London-School TDD with mock implementations |
| **ADR-002** | Lazy initialization of flow handlers | Reduces startup cost; only creates what's used |
| **ADR-003** | Delegate resilience to integration primitives | Consistency across modules; DRY principle |
| **ADR-004** | State stored with PKCE verifier | Single atomic operation for callback validation |
| **ADR-005** | Per-key refresh locks | Prevents thundering herd on token refresh |
| **ADR-006** | SecretString for all sensitive data | Automatic memory zeroing; log safety |
| **ADR-007** | 128-bit minimum entropy for state | OWASP recommendation for CSRF protection |
| **ADR-008** | PKCE S256 as default method | Maximum security; plain only as fallback |
| **ADR-009** | TokenStorage as public trait | Allows custom implementations (Redis, DB) |
| **ADR-010** | No provider-specific code in core | Provider differences handled via configuration |
| **ADR-011** | Async-first with sync wrappers if needed | Modern Rust/TS best practice |
| **ADR-012** | Discovery cache with TTL | Reduces OIDC discovery calls |

### 16.2 Trade-offs

| Decision | Trade-off | Mitigation |
|----------|-----------|------------|
| Trait-based interfaces | Runtime dispatch overhead | Minimal; OAuth2 not performance-critical |
| Lazy initialization | Potential first-call latency | Pre-warm in application startup if needed |
| In-memory default storage | Not suitable for multi-instance | Document and provide Redis example |
| Per-key locks | Memory for many concurrent users | Lock cleanup on key deletion |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial architecture |

---

## Summary

This architecture document defines:

1. **Layered Architecture**: Clean separation between public API, flow interfaces, core components, and cross-cutting concerns
2. **Component Design**: Modular components with clear responsibilities and interfaces
3. **Data Flow**: Detailed flows for authorization, token exchange, and refresh operations
4. **Dependency Management**: Strict rules for allowed/forbidden dependencies
5. **Resilience Patterns**: Integration with retry, circuit breaker, and rate limiting primitives
6. **Security Controls**: Comprehensive protection for tokens, credentials, and communication
7. **Extension Points**: Clear extension mechanisms for custom storage, providers, and hooks
8. **Observability**: Full metrics, tracing, and logging integration
9. **Deployment Patterns**: Support for single-instance, multi-instance, and multi-tenant scenarios

The architecture fully supports London-School TDD through interface-first design and comprehensive mock capabilities.
