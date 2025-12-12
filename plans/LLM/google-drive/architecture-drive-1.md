# Google Drive Integration - Architecture Document (Part 1)

**SPARC Phase 3: Architecture - Core Infrastructure**
**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/google-drive`

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Design Principles](#2-design-principles)
3. [C4 Model Diagrams](#3-c4-model-diagrams)
4. [Module Structure - Rust](#4-module-structure---rust)
5. [Module Structure - TypeScript](#5-module-structure---typescript)
6. [Core Interfaces - Rust](#6-core-interfaces---rust)

---

## 1. System Overview

### 1.1 High-Level Architecture

The Google Drive Integration Module follows a layered hexagonal architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Client Application                          │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      GoogleDriveClient (Facade)                      │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┬────────┐  │
│  │  Files   │  Perms   │ Comments │ Revisions│ Changes  │ Drives │  │
│  │ Service  │ Service  │ Service  │ Service  │ Service  │ Service│  │
│  └──────────┴──────────┴──────────┴──────────┴──────────┴────────┘  │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Request Executor                              │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │              Resilience Orchestrator                       │     │
│  │  ┌──────────┬─────────────────┬────────────────────┐       │     │
│  │  │  Retry   │ Circuit Breaker │   Rate Limiter     │       │     │
│  │  │ Executor │                 │                    │       │     │
│  │  └──────────┴─────────────────┴────────────────────┘       │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
│  ┌────────────────────┐              ┌────────────────────┐         │
│  │   Auth Provider    │              │  HTTP Transport    │         │
│  │  ┌──────────────┐  │              │  (reqwest/fetch)   │         │
│  │  │   OAuth2     │  │              └────────────────────┘         │
│  │  │ or Service   │  │                                             │
│  │  │   Account    │  │                                             │
│  │  └──────────────┘  │                                             │
│  └────────────────────┘                                             │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
                                  ▼ HTTPS
┌─────────────────────────────────────────────────────────────────────┐
│                  Google Drive REST API v3                            │
│              https://www.googleapis.com/drive/v3                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Component Responsibilities Matrix

| Component | Responsibilities | Dependencies |
|-----------|------------------|--------------|
| **GoogleDriveClient** | - Facade for all services<br>- Service composition<br>- Configuration management | - All service implementations<br>- RequestExecutor |
| **FilesService** | - File CRUD operations<br>- Upload management<br>- Download streaming<br>- Folder operations | - RequestExecutor<br>- Upload builders |
| **PermissionsService** | - Share files/folders<br>- Manage access levels<br>- Transfer ownership | - RequestExecutor |
| **CommentsService** | - Add/list comments<br>- Update/delete comments | - RequestExecutor |
| **RepliesService** | - Add/list comment replies<br>- Resolve/reopen comments | - RequestExecutor |
| **RevisionsService** | - List file revisions<br>- Download specific versions | - RequestExecutor |
| **ChangesService** | - Track file changes<br>- Watch for updates<br>- Manage change tokens | - RequestExecutor |
| **DrivesService** | - Shared drives management<br>- Team drives support | - RequestExecutor |
| **AboutService** | - Storage quota info<br>- User information<br>- Export formats | - RequestExecutor |
| **RequestExecutor** | - Request building<br>- Response handling<br>- Error mapping<br>- Resilience coordination | - HttpTransport<br>- AuthProvider<br>- ResilienceOrchestrator |
| **AuthProvider** | - Token acquisition<br>- Token refresh<br>- Token caching | - None (HTTP client for token exchange) |
| **HttpTransport** | - HTTPS communication<br>- Connection pooling<br>- Streaming support | - reqwest (Rust) / fetch (TS) |
| **ResilienceOrchestrator** | - Retry coordination<br>- Circuit breaker management<br>- Rate limiting | - integrations-retry<br>- integrations-circuit-breaker<br>- integrations-rate-limit |

### 1.3 External Dependencies

#### Primitive Dependencies (Internal)

| Primitive | Version | Purpose |
|-----------|---------|---------|
| `integrations-errors` | 0.1.x | Base error types and traits |
| `integrations-retry` | 0.1.x | Retry executor with backoff |
| `integrations-circuit-breaker` | 0.1.x | Circuit breaker state machine |
| `integrations-rate-limit` | 0.1.x | Rate limiting (token bucket) |
| `integrations-tracing` | 0.1.x | Distributed tracing abstraction |
| `integrations-logging` | 0.1.x | Structured logging abstraction |
| `integrations-types` | 0.1.x | Shared type definitions |
| `integrations-config` | 0.1.x | Configuration management |

#### External Dependencies (Rust)

| Crate | Version | Purpose |
|-------|---------|---------|
| `tokio` | 1.x | Async runtime |
| `reqwest` | 0.12+ | HTTP client |
| `serde` | 1.x | Serialization framework |
| `serde_json` | 1.x | JSON handling |
| `async-trait` | 0.1+ | Async trait support |
| `thiserror` | 1.x | Error derivation |
| `secrecy` | 0.8+ | Secret string handling |
| `url` | 2.x | URL parsing |
| `bytes` | 1.x | Byte buffer handling |
| `futures` | 0.3+ | Stream utilities |
| `chrono` | 0.4+ | Date/time handling |
| `jsonwebtoken` | 9.x | JWT for Service Accounts |
| `mime` | 0.3+ | MIME type handling |

#### External Dependencies (TypeScript)

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | 5.x | Language |
| `node-fetch` | Latest | HTTP client (or native fetch) |
| `zod` | 3.x | Runtime type validation |
| `jose` | 5.x | JWT for Service Accounts |

---

## 2. Design Principles

### 2.1 SPARC Methodology

The module follows the SPARC methodology for systematic development:

1. **Specification**: Comprehensive API coverage and interface definitions (completed)
2. **Pseudocode**: Language-agnostic algorithms for core operations (completed)
3. **Architecture**: This document - structural design and component organization
4. **Refinement**: Implementation with TDD and continuous improvement
5. **Completion**: Final testing, documentation, and release

### 2.2 London-School TDD

The architecture supports London-School TDD through:

**Interface-First Design**:
- All components interact through traits/interfaces
- No concrete type dependencies in public APIs
- Services depend on abstractions (AuthProvider, HttpTransport)

**Mock-Based Testing**:
```rust
// Example: Testing FilesService with mocked dependencies
#[cfg(test)]
mod tests {
    use super::*;
    use mockall::mock;

    mock! {
        RequestExecutor {}
        impl RequestExecutor {
            async fn execute<T>(&self, request: ApiRequest) -> Result<T>;
        }
    }

    #[tokio::test]
    async fn test_create_file() {
        let mut mock_executor = MockRequestExecutor::new();
        mock_executor
            .expect_execute()
            .returning(|_| Ok(File { /* ... */ }));

        let service = FilesServiceImpl::new(Arc::new(mock_executor));
        let result = service.create(/* ... */).await;
        assert!(result.is_ok());
    }
}
```

**Collaboration Testing**:
- Test behavior, not implementation
- Focus on interactions between components
- Verify correct message passing

### 2.3 SOLID Principles

#### Single Responsibility Principle (SRP)
- Each service handles one API domain (Files, Permissions, etc.)
- RequestExecutor only handles HTTP request lifecycle
- AuthProvider only manages authentication
- ResilienceOrchestrator only coordinates resilience patterns

#### Open/Closed Principle (OCP)
- Extension through new trait implementations
- New services added without modifying client
- Custom auth providers via AuthProvider trait
- Custom transport via HttpTransport trait

#### Liskov Substitution Principle (LSP)
- All AuthProvider implementations are interchangeable
- All HttpTransport implementations are interchangeable
- Services can be swapped without affecting client behavior

#### Interface Segregation Principle (ISP)
- Fine-grained service interfaces (Files, Permissions, etc.)
- Clients only depend on methods they use
- No "god interface" with all operations

#### Dependency Inversion Principle (DIP)
- High-level modules (services) depend on abstractions (traits)
- Low-level modules (transport) implement abstractions
- No direct dependencies on concrete HTTP clients

### 2.4 Hexagonal Architecture

```
┌────────────────────────────────────────────────────────┐
│                    Application Core                     │
│                                                         │
│  ┌────────────────────────────────────────────────┐    │
│  │           Domain Layer                         │    │
│  │  - File, Permission, Comment models            │    │
│  │  - Business logic                              │    │
│  │  - Domain errors                               │    │
│  └────────────────────────────────────────────────┘    │
│                         │                               │
│  ┌────────────────────────────────────────────────┐    │
│  │         Application Services                   │    │
│  │  - FilesService, PermissionsService            │    │
│  │  - Use case orchestration                      │    │
│  └────────────────────────────────────────────────┘    │
│                                                         │
└────────────────┬───────────────────────┬────────────────┘
                 │                       │
         ┌───────▼───────┐       ┌───────▼───────┐
         │  Inbound Port │       │ Outbound Port │
         │   (Traits)    │       │   (Traits)    │
         └───────┬───────┘       └───────┬───────┘
                 │                       │
         ┌───────▼───────┐       ┌───────▼───────┐
         │   Adapters    │       │   Adapters    │
         │  - Client API │       │ - HttpTransport│
         │               │       │ - AuthProvider│
         └───────────────┘       └───────────────┘
```

**Ports**:
- Inbound: GoogleDriveClient trait (consumed by applications)
- Outbound: HttpTransport, AuthProvider traits (implemented by adapters)

**Adapters**:
- Primary: Client facade, service implementations
- Secondary: HTTP transport (reqwest), OAuth2 provider, Service Account provider

**Benefits**:
- Testability: Replace adapters with mocks
- Flexibility: Swap HTTP client without changing core
- Isolation: Business logic independent of infrastructure

---

## 3. C4 Model Diagrams

### 3.1 Context Diagram (Level 1)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│                     System Context                               │
│                                                                  │
│   ┌──────────────┐                        ┌──────────────┐      │
│   │              │   Uses Google Drive    │              │      │
│   │ Application  │───────────────────────▶│  Google      │      │
│   │   (Rust /    │    Integration         │  Drive       │      │
│   │ TypeScript)  │                        │  API v3      │      │
│   │              │                        │              │      │
│   └──────┬───────┘                        └──────────────┘      │
│          │                                                       │
│          │ Configures with                                      │
│          │ OAuth2 / Service Account                             │
│          │                                                       │
│          ▼                                                       │
│   ┌──────────────┐                                              │
│   │              │                                              │
│   │   Google     │                                              │
│   │   OAuth2     │                                              │
│   │   Server     │                                              │
│   │              │                                              │
│   └──────────────┘                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

Legend:
  ──▶  Uses / Depends on
```

### 3.2 Container Diagram (Level 2)

```
┌───────────────────────────────────────────────────────────────────────┐
│                  Google Drive Integration Module                      │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                   GoogleDriveClient Container                    │  │
│  │                                                                  │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐               │  │
│  │  │   Files    │  │Permissions │  │ Comments   │               │  │
│  │  │  Service   │  │  Service   │  │  Service   │  ... (more)   │  │
│  │  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘               │  │
│  │         │                │                │                     │  │
│  │         └────────────────┴────────────────┘                     │  │
│  │                          │                                      │  │
│  │                          ▼                                      │  │
│  │                 ┌────────────────┐                              │  │
│  │                 │    Request     │                              │  │
│  │                 │    Executor    │                              │  │
│  │                 └────────┬───────┘                              │  │
│  │                          │                                      │  │
│  └──────────────────────────┼──────────────────────────────────────┘  │
│                             │                                         │
│  ┌──────────────────────────┼──────────────────────────────────────┐  │
│  │          Infrastructure Layer                                   │  │
│  │                          │                                      │  │
│  │  ┌───────────┐  ┌────────▼───────┐  ┌──────────────────┐      │  │
│  │  │   Auth    │  │   Resilience   │  │   HTTP           │      │  │
│  │  │  Provider │  │  Orchestrator  │  │  Transport       │      │  │
│  │  │           │  │                │  │                  │      │  │
│  │  │ - OAuth2  │  │ - Retry        │  │ - reqwest/fetch  │      │  │
│  │  │ - Service │  │ - Circuit      │  │ - Connection     │      │  │
│  │  │   Account │  │   Breaker      │  │   Pooling        │      │  │
│  │  │           │  │ - Rate Limit   │  │ - TLS 1.2+       │      │  │
│  │  └───────────┘  └────────────────┘  └──────────────────┘      │  │
│  │                                                                 │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │ HTTPS
                                 ▼
                       ┌──────────────────┐
                       │  Google Drive    │
                       │   REST API v3    │
                       └──────────────────┘
```

### 3.3 Component Diagram (Level 3)

```
┌──────────────────────────────────────────────────────────────────────┐
│                        GoogleDriveClient                              │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
       ┌───────────────────────┼────────────────────────┐
       │                       │                        │
       ▼                       ▼                        ▼
┌──────────────┐      ┌──────────────┐       ┌──────────────┐
│FilesService  │      │Permissions   │       │ChangesService│
│              │      │Service       │       │              │
│- create()    │      │              │       │- list()      │
│- get()       │      │- create()    │       │- watch()     │
│- list()      │      │- list()      │       │- getToken()  │
│- update()    │      │- delete()    │       │              │
│- delete()    │      │              │       │              │
│- upload()    │      │              │       │              │
│- download()  │      │              │       │              │
└──────┬───────┘      └──────┬───────┘       └──────┬───────┘
       │                     │                      │
       └─────────────────────┼──────────────────────┘
                             │
                             ▼
                   ┌────────────────────┐
                   │  RequestExecutor   │
                   │                    │
                   │ - execute()        │
                   │ - handle_response()│
                   │ - map_errors()     │
                   └──────────┬─────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
  │AuthProvider   │  │Resilience     │  │HttpTransport  │
  │               │  │Orchestrator   │  │               │
  │[interface]    │  │               │  │[interface]    │
  │               │  │               │  │               │
  │- get_token()  │  │- execute()    │  │- send()       │
  │- refresh()    │  │- retry()      │  │- streaming()  │
  │- is_expired() │  │- circuit()    │  │               │
  └───────┬───────┘  │- rate_limit() │  └───────┬───────┘
          │          └───────────────┘          │
          │                                     │
   ┌──────┴──────┐                       ┌──────┴──────┐
   │             │                       │             │
   ▼             ▼                       ▼             ▼
┌─────────┐  ┌─────────┐           ┌─────────┐  ┌─────────┐
│OAuth2   │  │Service  │           │Reqwest  │  │Custom   │
│Provider │  │Account  │           │Transport│  │Transport│
│         │  │Provider │           │         │  │         │
└─────────┘  └─────────┘           └─────────┘  └─────────┘
```

---

## 4. Module Structure - Rust

### 4.1 Directory Tree

```
google-drive/
├── rust/
│   ├── Cargo.toml
│   ├── src/
│   │   ├── lib.rs                        # Public API exports
│   │   │
│   │   ├── client/
│   │   │   ├── mod.rs                    # GoogleDriveClient implementation
│   │   │   └── factory.rs                # Client factory
│   │   │
│   │   ├── services/
│   │   │   ├── mod.rs                    # Service exports
│   │   │   ├── files.rs                  # FilesService implementation
│   │   │   ├── permissions.rs            # PermissionsService
│   │   │   ├── comments.rs               # CommentsService
│   │   │   ├── replies.rs                # RepliesService
│   │   │   ├── revisions.rs              # RevisionsService
│   │   │   ├── changes.rs                # ChangesService
│   │   │   ├── drives.rs                 # DrivesService (shared drives)
│   │   │   └── about.rs                  # AboutService
│   │   │
│   │   ├── upload/
│   │   │   ├── mod.rs                    # Upload exports
│   │   │   ├── simple.rs                 # Simple upload (<=5MB)
│   │   │   ├── multipart.rs              # Multipart upload
│   │   │   ├── resumable.rs              # Resumable upload session
│   │   │   └── builder.rs                # Upload request builders
│   │   │
│   │   ├── auth/
│   │   │   ├── mod.rs                    # Auth provider trait
│   │   │   ├── oauth2.rs                 # OAuth2 provider
│   │   │   ├── service_account.rs        # Service account provider
│   │   │   ├── token.rs                  # AccessToken type
│   │   │   └── scopes.rs                 # OAuth2 scope constants
│   │   │
│   │   ├── transport/
│   │   │   ├── mod.rs                    # HttpTransport trait
│   │   │   ├── reqwest.rs                # Reqwest implementation
│   │   │   ├── request.rs                # HttpRequest type
│   │   │   ├── response.rs               # HttpResponse type
│   │   │   └── multipart.rs              # Multipart body builder
│   │   │
│   │   ├── executor/
│   │   │   ├── mod.rs                    # RequestExecutor
│   │   │   ├── builder.rs                # ApiRequestBuilder
│   │   │   ├── url.rs                    # URL building utilities
│   │   │   └── pagination.rs             # Pagination iterators
│   │   │
│   │   ├── resilience/
│   │   │   ├── mod.rs                    # ResilienceOrchestrator
│   │   │   ├── retry.rs                  # Retry integration
│   │   │   ├── circuit_breaker.rs        # Circuit breaker integration
│   │   │   └── rate_limit.rs             # Rate limiter integration
│   │   │
│   │   ├── types/
│   │   │   ├── mod.rs                    # Type exports
│   │   │   ├── file.rs                   # File model
│   │   │   ├── permission.rs             # Permission model
│   │   │   ├── comment.rs                # Comment model
│   │   │   ├── revision.rs               # Revision model
│   │   │   ├── change.rs                 # Change model
│   │   │   ├── drive.rs                  # Drive (shared drive) model
│   │   │   ├── about.rs                  # About model
│   │   │   ├── requests/                 # Request types
│   │   │   │   ├── mod.rs
│   │   │   │   ├── file.rs               # File request types
│   │   │   │   ├── permission.rs         # Permission request types
│   │   │   │   └── ...
│   │   │   └── responses/                # Response types
│   │   │       ├── mod.rs
│   │   │       ├── file.rs               # File response types
│   │   │       └── ...
│   │   │
│   │   ├── error/
│   │   │   ├── mod.rs                    # Error type definitions
│   │   │   ├── mapping.rs                # HTTP to domain error mapping
│   │   │   └── result.rs                 # Result type alias
│   │   │
│   │   ├── config/
│   │   │   ├── mod.rs                    # GoogleDriveConfig
│   │   │   ├── builder.rs                # Config builder
│   │   │   └── validation.rs             # Config validation
│   │   │
│   │   └── utils/
│   │       ├── mod.rs                    # Utility exports
│   │       ├── mime.rs                   # MIME type utilities
│   │       ├── url.rs                    # URL encoding utilities
│   │       └── jwt.rs                    # JWT signing (service account)
│   │
│   ├── tests/
│   │   ├── integration/                  # Integration tests
│   │   │   ├── mod.rs
│   │   │   ├── files_test.rs
│   │   │   ├── permissions_test.rs
│   │   │   └── ...
│   │   └── unit/                         # Unit tests
│   │       ├── mod.rs
│   │       └── ...
│   │
│   └── examples/
│       ├── basic_usage.rs                # Basic file operations
│       ├── oauth2_auth.rs                # OAuth2 authentication
│       ├── service_account_auth.rs       # Service account auth
│       ├── upload_large_file.rs          # Resumable upload
│       └── watch_changes.rs              # Change tracking
```

### 4.2 Cargo.toml Dependencies

```toml
[package]
name = "integrations-google-drive"
version = "0.1.0"
edition = "2021"
authors = ["Integration Team"]
description = "Google Drive API v3 integration for Rust"
license = "MIT OR Apache-2.0"

[dependencies]
# Async runtime
tokio = { version = "1.35", features = ["full"] }
futures = "0.3"
async-trait = "0.1"
pin-project = "1.1"

# HTTP client
reqwest = { version = "0.12", features = ["json", "stream", "rustls-tls"] }
bytes = "1.5"

# Serialization
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"

# Error handling
thiserror = "1.0"
anyhow = "1.0"

# Security
secrecy = { version = "0.8", features = ["serde"] }
jsonwebtoken = "9.2"

# Utilities
url = "2.5"
mime = "0.3"
percent-encoding = "2.3"
chrono = { version = "0.4", features = ["serde"] }
base64 = "0.21"

# Integration primitives
integrations-errors = { path = "../../../primitives/errors" }
integrations-retry = { path = "../../../primitives/retry" }
integrations-circuit-breaker = { path = "../../../primitives/circuit-breaker" }
integrations-rate-limit = { path = "../../../primitives/rate-limit" }
integrations-tracing = { path = "../../../primitives/tracing" }
integrations-logging = { path = "../../../primitives/logging" }
integrations-types = { path = "../../../primitives/types" }
integrations-config = { path = "../../../primitives/config" }

# Optional features
tokio-util = { version = "0.7", features = ["codec", "io"], optional = true }

[dev-dependencies]
mockall = "0.12"
wiremock = "0.6"
tokio-test = "0.4"
tempfile = "3.8"
test-log = "0.2"

[features]
default = ["streaming"]
streaming = ["tokio-util"]
```

---

## 5. Module Structure - TypeScript

### 5.1 Directory Tree

```
google-drive/
├── typescript/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                      # Public API exports
│   │   │
│   │   ├── client/
│   │   │   ├── index.ts                  # GoogleDriveClient
│   │   │   └── factory.ts                # Client factory
│   │   │
│   │   ├── services/
│   │   │   ├── index.ts                  # Service exports
│   │   │   ├── files.ts                  # FilesService
│   │   │   ├── permissions.ts            # PermissionsService
│   │   │   ├── comments.ts               # CommentsService
│   │   │   ├── replies.ts                # RepliesService
│   │   │   ├── revisions.ts              # RevisionsService
│   │   │   ├── changes.ts                # ChangesService
│   │   │   ├── drives.ts                 # DrivesService
│   │   │   └── about.ts                  # AboutService
│   │   │
│   │   ├── upload/
│   │   │   ├── index.ts                  # Upload exports
│   │   │   ├── simple.ts                 # Simple upload
│   │   │   ├── multipart.ts              # Multipart upload
│   │   │   ├── resumable.ts              # Resumable upload
│   │   │   └── builder.ts                # Upload builders
│   │   │
│   │   ├── auth/
│   │   │   ├── index.ts                  # Auth provider interface
│   │   │   ├── oauth2.ts                 # OAuth2 provider
│   │   │   ├── service-account.ts        # Service account provider
│   │   │   ├── token.ts                  # AccessToken type
│   │   │   └── scopes.ts                 # OAuth2 scopes
│   │   │
│   │   ├── transport/
│   │   │   ├── index.ts                  # HttpTransport interface
│   │   │   ├── fetch.ts                  # Fetch implementation
│   │   │   ├── request.ts                # HttpRequest type
│   │   │   ├── response.ts               # HttpResponse type
│   │   │   └── multipart.ts              # Multipart builder
│   │   │
│   │   ├── executor/
│   │   │   ├── index.ts                  # RequestExecutor
│   │   │   ├── builder.ts                # ApiRequestBuilder
│   │   │   ├── url.ts                    # URL building
│   │   │   └── pagination.ts             # Pagination iterators
│   │   │
│   │   ├── resilience/
│   │   │   ├── index.ts                  # ResilienceOrchestrator
│   │   │   ├── retry.ts                  # Retry integration
│   │   │   ├── circuit-breaker.ts        # Circuit breaker
│   │   │   └── rate-limit.ts             # Rate limiter
│   │   │
│   │   ├── types/
│   │   │   ├── index.ts                  # Type exports
│   │   │   ├── file.ts                   # File model
│   │   │   ├── permission.ts             # Permission model
│   │   │   ├── comment.ts                # Comment model
│   │   │   ├── revision.ts               # Revision model
│   │   │   ├── change.ts                 # Change model
│   │   │   ├── drive.ts                  # Drive model
│   │   │   ├── about.ts                  # About model
│   │   │   ├── requests/                 # Request types
│   │   │   │   ├── index.ts
│   │   │   │   ├── file.ts
│   │   │   │   └── ...
│   │   │   └── responses/                # Response types
│   │   │       ├── index.ts
│   │   │       └── ...
│   │   │
│   │   ├── errors/
│   │   │   ├── index.ts                  # Error classes
│   │   │   ├── mapping.ts                # HTTP to domain errors
│   │   │   └── types.ts                  # Error type definitions
│   │   │
│   │   ├── config/
│   │   │   ├── index.ts                  # GoogleDriveConfig
│   │   │   ├── builder.ts                # Config builder
│   │   │   └── validation.ts             # Validation
│   │   │
│   │   └── utils/
│   │       ├── index.ts                  # Utility exports
│   │       ├── mime.ts                   # MIME utilities
│   │       ├── url.ts                    # URL utilities
│   │       └── jwt.ts                    # JWT signing
│   │
│   ├── tests/
│   │   ├── integration/                  # Integration tests
│   │   │   ├── files.test.ts
│   │   │   ├── permissions.test.ts
│   │   │   └── ...
│   │   └── unit/                         # Unit tests
│   │       └── ...
│   │
│   └── examples/
│       ├── basic-usage.ts                # Basic examples
│       ├── oauth2-auth.ts                # OAuth2 auth
│       ├── service-account-auth.ts       # Service account
│       ├── upload-large-file.ts          # Resumable upload
│       └── watch-changes.ts              # Change tracking
```

### 5.2 package.json Dependencies

```json
{
  "name": "@integrations/google-drive",
  "version": "0.1.0",
  "description": "Google Drive API v3 integration for TypeScript",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:integration": "jest --testPathPattern=integration",
    "lint": "eslint src --ext .ts",
    "format": "prettier --write \"src/**/*.ts\""
  },
  "keywords": [
    "google-drive",
    "integration",
    "api"
  ],
  "license": "MIT",
  "dependencies": {
    "node-fetch": "^3.3.2",
    "zod": "^3.22.4",
    "jose": "^5.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/jest": "^29.5.10",
    "typescript": "^5.3.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "eslint": "^8.55.0",
    "@typescript-eslint/parser": "^6.14.0",
    "@typescript-eslint/eslint-plugin": "^6.14.0",
    "prettier": "^3.1.0"
  }
}
```

---

## 6. Core Interfaces - Rust

### 6.1 GoogleDriveClient Trait

```rust
/// Main client interface for Google Drive API.
///
/// This trait defines the facade for all Google Drive operations,
/// providing access to specialized service interfaces.
#[async_trait]
pub trait GoogleDriveClient: Send + Sync {
    /// Access the Files service for file operations.
    fn files(&self) -> &dyn FilesService;

    /// Access the Permissions service for sharing and access control.
    fn permissions(&self) -> &dyn PermissionsService;

    /// Access the Comments service for file comments.
    fn comments(&self) -> &dyn CommentsService;

    /// Access the Replies service for comment replies.
    fn replies(&self) -> &dyn RepliesService;

    /// Access the Revisions service for file version history.
    fn revisions(&self) -> &dyn RevisionsService;

    /// Access the Changes service for change tracking.
    fn changes(&self) -> &dyn ChangesService;

    /// Access the Drives service for shared drives management.
    fn drives(&self) -> &dyn DrivesService;

    /// Access the About service for account and quota information.
    fn about(&self) -> &dyn AboutService;

    /// Get current storage quota information.
    ///
    /// # Returns
    /// - `Ok(StorageQuota)`: Current quota information
    /// - `Err(GoogleDriveError)`: If request fails
    async fn get_storage_quota(&self) -> Result<StorageQuota, GoogleDriveError>;
}

/// Factory for creating GoogleDriveClient instances.
pub trait GoogleDriveClientFactory: Send + Sync {
    /// Create a new client with the given configuration.
    ///
    /// # Arguments
    /// - `config`: Configuration for the client
    ///
    /// # Returns
    /// - `Ok(Arc<dyn GoogleDriveClient>)`: Configured client
    /// - `Err(GoogleDriveError)`: If configuration is invalid
    fn create(
        &self,
        config: GoogleDriveConfig,
    ) -> Result<Arc<dyn GoogleDriveClient>, GoogleDriveError>;
}
```

### 6.2 FilesService Trait

```rust
/// Service interface for Google Drive Files API operations.
///
/// Provides methods for file CRUD operations, uploads, downloads,
/// and folder management.
#[async_trait]
pub trait FilesService: Send + Sync {
    /// Create a new file with metadata only (no content).
    ///
    /// # Arguments
    /// - `request`: File creation request with metadata
    ///
    /// # Returns
    /// - `Ok(File)`: Created file metadata
    /// - `Err(GoogleDriveError)`: If creation fails
    async fn create(
        &self,
        request: CreateFileRequest,
    ) -> Result<File, GoogleDriveError>;

    /// Create a file with content using simple upload (<= 5MB).
    ///
    /// # Arguments
    /// - `request`: File creation request with metadata and content
    ///
    /// # Returns
    /// - `Ok(File)`: Created file metadata
    /// - `Err(GoogleDriveError)`: If upload fails
    async fn create_with_content(
        &self,
        request: CreateFileWithContentRequest,
    ) -> Result<File, GoogleDriveError>;

    /// Create a file with content using multipart upload.
    ///
    /// Combines metadata and content in a single request.
    /// Suitable for files <= 5MB.
    ///
    /// # Arguments
    /// - `request`: Multipart upload request
    ///
    /// # Returns
    /// - `Ok(File)`: Created file metadata
    /// - `Err(GoogleDriveError)`: If upload fails
    async fn create_multipart(
        &self,
        request: CreateMultipartRequest,
    ) -> Result<File, GoogleDriveError>;

    /// Create a resumable upload session for large files.
    ///
    /// Use this for files > 5MB or when reliability is critical.
    ///
    /// # Arguments
    /// - `request`: Resumable upload initiation request
    ///
    /// # Returns
    /// - `Ok(ResumableUploadSession)`: Upload session handle
    /// - `Err(GoogleDriveError)`: If session creation fails
    async fn create_resumable(
        &self,
        request: CreateResumableRequest,
    ) -> Result<Box<dyn ResumableUploadSession>, GoogleDriveError>;

    /// Get file metadata by ID.
    ///
    /// # Arguments
    /// - `file_id`: File identifier
    /// - `params`: Optional request parameters (fields, etc.)
    ///
    /// # Returns
    /// - `Ok(File)`: File metadata
    /// - `Err(GoogleDriveError)`: If file not found or access denied
    async fn get(
        &self,
        file_id: &str,
        params: Option<GetFileParams>,
    ) -> Result<File, GoogleDriveError>;

    /// Download file content.
    ///
    /// Loads entire file content into memory. For large files,
    /// use `download_stream` instead.
    ///
    /// # Arguments
    /// - `file_id`: File identifier
    /// - `params`: Optional download parameters
    ///
    /// # Returns
    /// - `Ok(Bytes)`: File content
    /// - `Err(GoogleDriveError)`: If download fails
    async fn download(
        &self,
        file_id: &str,
        params: Option<DownloadParams>,
    ) -> Result<Bytes, GoogleDriveError>;

    /// Download file content as a stream.
    ///
    /// Memory-efficient for large files. Returns an async stream
    /// of chunks.
    ///
    /// # Arguments
    /// - `file_id`: File identifier
    /// - `params`: Optional download parameters
    ///
    /// # Returns
    /// - `Ok(Stream<Bytes>)`: Stream of file chunks
    /// - `Err(GoogleDriveError)`: If download initiation fails
    async fn download_stream(
        &self,
        file_id: &str,
        params: Option<DownloadParams>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<Bytes, GoogleDriveError>> + Send>>, GoogleDriveError>;

    /// List files with optional filtering and pagination.
    ///
    /// Returns a single page of results. Use `list_all` for
    /// automatic pagination.
    ///
    /// # Arguments
    /// - `params`: Optional list parameters (query, page size, etc.)
    ///
    /// # Returns
    /// - `Ok(FileList)`: Page of files with next page token
    /// - `Err(GoogleDriveError)`: If listing fails
    async fn list(
        &self,
        params: Option<ListFilesParams>,
    ) -> Result<FileList, GoogleDriveError>;

    /// List all files with automatic pagination.
    ///
    /// Returns a stream that automatically fetches pages as needed.
    ///
    /// # Arguments
    /// - `params`: Optional list parameters
    ///
    /// # Returns
    /// - Stream of files (one file at a time)
    fn list_all(
        &self,
        params: Option<ListFilesParams>,
    ) -> Pin<Box<dyn Stream<Item = Result<File, GoogleDriveError>> + Send>>;

    /// Update file metadata.
    ///
    /// # Arguments
    /// - `file_id`: File identifier
    /// - `request`: Update request with new metadata
    ///
    /// # Returns
    /// - `Ok(File)`: Updated file metadata
    /// - `Err(GoogleDriveError)`: If update fails
    async fn update(
        &self,
        file_id: &str,
        request: UpdateFileRequest,
    ) -> Result<File, GoogleDriveError>;

    /// Update file content.
    ///
    /// Replaces the file's content while preserving metadata.
    ///
    /// # Arguments
    /// - `file_id`: File identifier
    /// - `request`: Content update request
    ///
    /// # Returns
    /// - `Ok(File)`: Updated file metadata
    /// - `Err(GoogleDriveError)`: If update fails
    async fn update_content(
        &self,
        file_id: &str,
        request: UpdateFileContentRequest,
    ) -> Result<File, GoogleDriveError>;

    /// Delete a file permanently.
    ///
    /// # Arguments
    /// - `file_id`: File identifier
    /// - `params`: Optional delete parameters
    ///
    /// # Returns
    /// - `Ok(())`: File deleted successfully
    /// - `Err(GoogleDriveError)`: If deletion fails
    async fn delete(
        &self,
        file_id: &str,
        params: Option<DeleteFileParams>,
    ) -> Result<(), GoogleDriveError>;

    /// Copy a file to a new location.
    ///
    /// # Arguments
    /// - `file_id`: Source file identifier
    /// - `request`: Copy request with optional metadata overrides
    ///
    /// # Returns
    /// - `Ok(File)`: Copied file metadata
    /// - `Err(GoogleDriveError)`: If copy fails
    async fn copy(
        &self,
        file_id: &str,
        request: CopyFileRequest,
    ) -> Result<File, GoogleDriveError>;

    /// Export a Google Workspace file to a specific format.
    ///
    /// # Arguments
    /// - `file_id`: File identifier (must be Google Workspace file)
    /// - `mime_type`: Target export MIME type
    ///
    /// # Returns
    /// - `Ok(Bytes)`: Exported content
    /// - `Err(GoogleDriveError)`: If export fails or unsupported
    async fn export(
        &self,
        file_id: &str,
        mime_type: &str,
    ) -> Result<Bytes, GoogleDriveError>;

    /// Export a Google Workspace file as a stream.
    ///
    /// # Arguments
    /// - `file_id`: File identifier
    /// - `mime_type`: Target export MIME type
    ///
    /// # Returns
    /// - `Ok(Stream<Bytes>)`: Stream of exported content
    /// - `Err(GoogleDriveError)`: If export fails
    async fn export_stream(
        &self,
        file_id: &str,
        mime_type: &str,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<Bytes, GoogleDriveError>> + Send>>, GoogleDriveError>;

    /// Generate unique file IDs for pre-creating files.
    ///
    /// # Arguments
    /// - `params`: Generation parameters (count, space, type)
    ///
    /// # Returns
    /// - `Ok(GeneratedIds)`: List of generated IDs
    /// - `Err(GoogleDriveError)`: If generation fails
    async fn generate_ids(
        &self,
        params: Option<GenerateIdsParams>,
    ) -> Result<GeneratedIds, GoogleDriveError>;

    /// Empty the trash (permanently delete all trashed files).
    ///
    /// # Arguments
    /// - `params`: Optional parameters
    ///
    /// # Returns
    /// - `Ok(())`: Trash emptied successfully
    /// - `Err(GoogleDriveError)`: If operation fails
    async fn empty_trash(
        &self,
        params: Option<EmptyTrashParams>,
    ) -> Result<(), GoogleDriveError>;

    /// Move a file to different parent folders.
    ///
    /// # Arguments
    /// - `file_id`: File identifier
    /// - `add_parents`: Parent IDs to add
    /// - `remove_parents`: Parent IDs to remove
    ///
    /// # Returns
    /// - `Ok(File)`: Updated file metadata
    /// - `Err(GoogleDriveError)`: If move fails
    async fn move_file(
        &self,
        file_id: &str,
        add_parents: Vec<String>,
        remove_parents: Vec<String>,
    ) -> Result<File, GoogleDriveError>;

    /// Create a new folder.
    ///
    /// Convenience method for creating a folder (file with MIME type
    /// 'application/vnd.google-apps.folder').
    ///
    /// # Arguments
    /// - `request`: Folder creation request
    ///
    /// # Returns
    /// - `Ok(File)`: Created folder metadata
    /// - `Err(GoogleDriveError)`: If creation fails
    async fn create_folder(
        &self,
        request: CreateFolderRequest,
    ) -> Result<File, GoogleDriveError>;
}
```

### 6.3 AuthProvider Trait

```rust
/// Authentication provider abstraction.
///
/// Implementations handle OAuth 2.0 or Service Account authentication,
/// providing access tokens for API requests.
#[async_trait]
pub trait AuthProvider: Send + Sync {
    /// Get a valid access token.
    ///
    /// Returns a cached token if available and not expired,
    /// otherwise refreshes and returns a new token.
    ///
    /// # Returns
    /// - `Ok(AccessToken)`: Valid access token
    /// - `Err(AuthError)`: If token acquisition fails
    async fn get_access_token(&self) -> Result<AccessToken, AuthError>;

    /// Force refresh the access token.
    ///
    /// Invalidates any cached token and obtains a fresh one.
    ///
    /// # Returns
    /// - `Ok(AccessToken)`: Refreshed access token
    /// - `Err(AuthError)`: If refresh fails
    async fn refresh_token(&self) -> Result<AccessToken, AuthError>;

    /// Check if the current cached token is expired.
    ///
    /// # Returns
    /// - `true`: Token is expired or not available
    /// - `false`: Token is valid
    fn is_expired(&self) -> bool;
}

/// Access token with metadata.
#[derive(Clone, Debug)]
pub struct AccessToken {
    /// The token string (protected).
    pub token: SecretString,

    /// Token type (usually "Bearer").
    pub token_type: String,

    /// Expiration timestamp.
    pub expires_at: DateTime<Utc>,

    /// Granted scopes.
    pub scopes: Vec<String>,
}
```

### 6.4 HttpTransport Trait

```rust
/// HTTP transport abstraction for testability.
///
/// Implementations handle actual HTTP communication with
/// connection pooling, TLS, and streaming support.
#[async_trait]
pub trait HttpTransport: Send + Sync {
    /// Send an HTTP request and receive a complete response.
    ///
    /// # Arguments
    /// - `request`: HTTP request to send
    ///
    /// # Returns
    /// - `Ok(HttpResponse)`: Complete response with body
    /// - `Err(TransportError)`: If request fails
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>;

    /// Send an HTTP request and receive raw bytes.
    ///
    /// Convenience method for binary responses.
    ///
    /// # Arguments
    /// - `request`: HTTP request to send
    ///
    /// # Returns
    /// - `Ok(Bytes)`: Response body
    /// - `Err(TransportError)`: If request fails
    async fn send_raw(&self, request: HttpRequest) -> Result<Bytes, TransportError>;

    /// Send an HTTP request and receive a streaming response.
    ///
    /// Use for large responses that should be streamed.
    ///
    /// # Arguments
    /// - `request`: HTTP request to send
    ///
    /// # Returns
    /// - `Ok(Stream<Bytes>)`: Stream of response chunks
    /// - `Err(TransportError)`: If request fails
    async fn send_streaming(
        &self,
        request: HttpRequest,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<Bytes, TransportError>> + Send>>, TransportError>;
}

/// HTTP request representation.
#[derive(Debug)]
pub struct HttpRequest {
    /// HTTP method.
    pub method: HttpMethod,

    /// Request URL.
    pub url: Url,

    /// Request headers.
    pub headers: HeaderMap,

    /// Optional request body.
    pub body: Option<RequestBody>,

    /// Request timeout override.
    pub timeout: Option<Duration>,
}

/// Request body variants.
pub enum RequestBody {
    /// Fixed-size bytes.
    Bytes(Bytes),

    /// Streaming body.
    Stream(Pin<Box<dyn Stream<Item = Result<Bytes, GoogleDriveError>> + Send>>),

    /// Multipart body.
    Multipart(MultipartBody),
}

/// HTTP response representation.
#[derive(Debug)]
pub struct HttpResponse {
    /// HTTP status code.
    pub status: StatusCode,

    /// Response headers.
    pub headers: HeaderMap,

    /// Response body.
    pub body: Bytes,
}
```

### 6.5 ResumableUploadSession Trait

```rust
/// Resumable upload session for large files.
///
/// Handles chunked uploads with automatic retry and resume capability.
#[async_trait]
pub trait ResumableUploadSession: Send + Sync {
    /// Get the resumable upload URI.
    ///
    /// # Returns
    /// - Upload session URI
    fn upload_uri(&self) -> &str;

    /// Upload a single chunk of data.
    ///
    /// # Arguments
    /// - `chunk`: Data chunk to upload
    /// - `offset`: Byte offset in file
    /// - `total_size`: Total file size
    ///
    /// # Returns
    /// - `Ok(UploadChunkResult)`: Upload status
    /// - `Err(GoogleDriveError)`: If upload fails
    async fn upload_chunk(
        &self,
        chunk: Bytes,
        offset: u64,
        total_size: u64,
    ) -> Result<UploadChunkResult, GoogleDriveError>;

    /// Upload entire content from a stream.
    ///
    /// Automatically chunks the stream and handles retries.
    ///
    /// # Arguments
    /// - `stream`: Stream of content
    /// - `total_size`: Total file size
    /// - `chunk_size`: Size of each chunk (must be multiple of 256KB)
    ///
    /// # Returns
    /// - `Ok(File)`: Uploaded file metadata
    /// - `Err(GoogleDriveError)`: If upload fails
    async fn upload_stream(
        &self,
        stream: Pin<Box<dyn Stream<Item = Result<Bytes, GoogleDriveError>> + Send>>,
        total_size: u64,
        chunk_size: usize,
    ) -> Result<File, GoogleDriveError>;

    /// Query the current upload status.
    ///
    /// Useful for checking progress or recovering from interruption.
    ///
    /// # Returns
    /// - `Ok(UploadStatus)`: Current status
    /// - `Err(GoogleDriveError)`: If query fails
    async fn query_status(&self) -> Result<UploadStatus, GoogleDriveError>;

    /// Resume an interrupted upload.
    ///
    /// Queries status and determines where to continue.
    ///
    /// # Returns
    /// - `Ok(UploadStatus)`: Status after resume
    /// - `Err(GoogleDriveError)`: If resume fails
    async fn resume(&self) -> Result<UploadStatus, GoogleDriveError>;

    /// Cancel the upload session.
    ///
    /// # Returns
    /// - `Ok(())`: Session cancelled
    /// - `Err(GoogleDriveError)`: If cancellation fails
    async fn cancel(&self) -> Result<(), GoogleDriveError>;
}

/// Result of uploading a chunk.
#[derive(Debug, Clone)]
pub enum UploadChunkResult {
    /// More chunks needed.
    InProgress {
        /// Bytes received so far.
        bytes_received: u64,
    },

    /// Upload complete.
    Complete(File),
}

/// Status of a resumable upload.
#[derive(Debug, Clone)]
pub struct UploadStatus {
    /// Bytes received by server.
    pub bytes_received: u64,

    /// Total file size.
    pub total_size: u64,

    /// Whether upload is complete.
    pub is_complete: bool,
}
```

### 6.6 Request and Response Types

```rust
/// Request to create a file.
#[derive(Debug, Clone, Builder)]
pub struct CreateFileRequest {
    /// File name.
    pub name: String,

    /// MIME type.
    #[builder(default)]
    pub mime_type: Option<String>,

    /// File description.
    #[builder(default)]
    pub description: Option<String>,

    /// Parent folder IDs.
    #[builder(default)]
    pub parents: Option<Vec<String>>,

    /// Custom properties.
    #[builder(default)]
    pub properties: Option<HashMap<String, String>>,

    /// App-specific properties.
    #[builder(default)]
    pub app_properties: Option<HashMap<String, String>>,

    /// Star the file.
    #[builder(default)]
    pub starred: Option<bool>,

    /// Folder color (folders only).
    #[builder(default)]
    pub folder_color_rgb: Option<String>,

    /// Content hints.
    #[builder(default)]
    pub content_hints: Option<ContentHints>,

    /// Whether writers can share.
    #[builder(default)]
    pub writers_can_share: Option<bool>,
}

/// Parameters for listing files.
#[derive(Debug, Clone, Default, Builder)]
pub struct ListFilesParams {
    /// Corpora to search.
    #[builder(default)]
    pub corpora: Option<Corpora>,

    /// Shared drive ID (if corpora=drive).
    #[builder(default)]
    pub drive_id: Option<String>,

    /// Include items from all drives.
    #[builder(default)]
    pub include_items_from_all_drives: Option<bool>,

    /// Sort order (e.g., "modifiedTime desc").
    #[builder(default)]
    pub order_by: Option<String>,

    /// Page size (1-1000).
    #[builder(default)]
    pub page_size: Option<u32>,

    /// Page token for continuation.
    #[builder(default)]
    pub page_token: Option<String>,

    /// Query string for filtering.
    #[builder(default)]
    pub q: Option<String>,

    /// Spaces to query.
    #[builder(default)]
    pub spaces: Option<String>,

    /// Support shared drives.
    #[builder(default)]
    pub supports_all_drives: Option<bool>,

    /// Fields to include in response.
    #[builder(default)]
    pub fields: Option<String>,
}

/// File list response.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileList {
    /// Resource kind.
    pub kind: String,

    /// Next page token.
    pub next_page_token: Option<String>,

    /// Whether search was incomplete.
    pub incomplete_search: bool,

    /// List of files.
    pub files: Vec<File>,
}
```

---

**Document Control**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial architecture - Part 1 |

---

**End of Architecture Document Part 1**

*This document defines the high-level architecture, module structure, and core interfaces for the Google Drive integration. Subsequent parts will detail service implementations, upload operations, and testing strategies.*
