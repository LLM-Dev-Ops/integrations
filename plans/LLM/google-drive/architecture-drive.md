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


---


**SPARC Phase 3: Architecture - Core Interfaces & Data Flow**
**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/google-drive`

---

## Table of Contents

7. [Core Interfaces - TypeScript](#7-core-interfaces---typescript)
8. [Data Flow Architecture](#8-data-flow-architecture)
9. [Authentication Architecture](#9-authentication-architecture)
10. [State Management](#10-state-management)

---

## 7. Core Interfaces - TypeScript

### 7.1 GoogleDriveClient Interface

```typescript
/**
 * Main client for interacting with Google Drive API.
 */
interface GoogleDriveClient {
  /** Access the files service. */
  readonly files: FilesService;

  /** Access the permissions service. */
  readonly permissions: PermissionsService;

  /** Access the comments service. */
  readonly comments: CommentsService;

  /** Access the replies service. */
  readonly replies: RepliesService;

  /** Access the revisions service. */
  readonly revisions: RevisionsService;

  /** Access the changes service. */
  readonly changes: ChangesService;

  /** Access the drives service (shared drives). */
  readonly drives: DrivesService;

  /** Access the about service. */
  readonly about: AboutService;

  /** Get storage quota information. */
  getStorageQuota(): Promise<StorageQuota>;
}
```

### 7.2 AuthProvider Interface

```typescript
/**
 * Authentication provider abstraction.
 */
interface AuthProvider {
  /** Get an access token for API requests. */
  getAccessToken(): Promise<AccessToken>;

  /** Force refresh the access token. */
  refreshToken(): Promise<AccessToken>;

  /** Check if the current token is expired. */
  isExpired(): boolean;
}

/**
 * Access token with metadata.
 */
interface AccessToken {
  token: string;
  tokenType: string;
  expiresAt: Date;
  scopes: string[];
}

/**
 * OAuth 2.0 credentials.
 */
interface OAuth2Credentials {
  type: 'oauth2';
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken?: string;
  expiresAt?: Date;
}

/**
 * Service account credentials.
 */
interface ServiceAccountCredentials {
  type: 'service_account';
  clientEmail: string;
  privateKey: string;
  privateKeyId?: string;
  projectId?: string;
  scopes: string[];
  subject?: string; // For domain-wide delegation
}
```

### 7.3 Service Interfaces

#### 7.3.1 FilesService

```typescript
interface FilesService {
  /** Create a new file (metadata only). */
  create(request: CreateFileRequest): Promise<DriveFile>;

  /** Create a file with content (simple upload, ≤5MB). */
  createWithContent(request: CreateFileWithContentRequest): Promise<DriveFile>;

  /** Create a file with content using multipart upload. */
  createMultipart(request: CreateMultipartRequest): Promise<DriveFile>;

  /** Create a file with content using resumable upload (large files). */
  createResumable(request: CreateResumableRequest): Promise<ResumableUploadSession>;

  /** Get file metadata. */
  get(fileId: string, params?: GetFileParams): Promise<DriveFile>;

  /** Download file content. */
  download(fileId: string, params?: DownloadParams): Promise<ArrayBuffer>;

  /** Download file content as a stream. */
  downloadStream(fileId: string, params?: DownloadParams): Promise<ReadableStream<Uint8Array>>;

  /** List files with optional query. */
  list(params?: ListFilesParams): Promise<FileList>;

  /** List all files with auto-pagination. */
  listAll(params?: ListFilesParams): AsyncIterable<DriveFile>;

  /** Update file metadata. */
  update(fileId: string, request: UpdateFileRequest): Promise<DriveFile>;

  /** Delete a file permanently. */
  delete(fileId: string, params?: DeleteFileParams): Promise<void>;

  /** Copy a file. */
  copy(fileId: string, request: CopyFileRequest): Promise<DriveFile>;

  /** Export a Google Workspace file. */
  export(fileId: string, mimeType: string): Promise<ArrayBuffer>;

  /** Move a file to a different folder. */
  moveFile(fileId: string, addParents: string[], removeParents: string[]): Promise<DriveFile>;

  /** Create a folder. */
  createFolder(request: CreateFolderRequest): Promise<DriveFile>;
}
```

#### 7.3.2 PermissionsService

```typescript
interface PermissionsService {
  /** Create a new permission. */
  create(fileId: string, request: CreatePermissionRequest): Promise<Permission>;

  /** List permissions for a file. */
  list(fileId: string, params?: ListPermissionsParams): Promise<PermissionList>;

  /** Get a specific permission. */
  get(fileId: string, permissionId: string, params?: GetPermissionParams): Promise<Permission>;

  /** Update a permission. */
  update(fileId: string, permissionId: string, request: UpdatePermissionRequest): Promise<Permission>;

  /** Delete a permission. */
  delete(fileId: string, permissionId: string, params?: DeletePermissionParams): Promise<void>;
}
```

#### 7.3.3 ChangesService

```typescript
interface ChangesService {
  /** Get the start page token for change tracking. */
  getStartPageToken(params?: GetStartPageTokenParams): Promise<StartPageToken>;

  /** List changes since a page token. */
  list(pageToken: string, params?: ListChangesParams): Promise<ChangeList>;

  /** List all changes with auto-pagination. */
  listAll(startPageToken: string, params?: ListChangesParams): AsyncIterable<Change>;

  /** Watch for changes via push notifications. */
  watch(pageToken: string, request: WatchChangesRequest): Promise<Channel>;

  /** Stop watching for changes. */
  stopWatch(channel: Channel): Promise<void>;
}
```

### 7.4 Zod Schemas

```typescript
import { z } from 'zod';

/**
 * Drive file schema.
 */
const DriveFileSchema = z.object({
  kind: z.literal('drive#file'),
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  description: z.string().optional(),
  starred: z.boolean(),
  trashed: z.boolean(),
  explicitlyTrashed: z.boolean(),
  parents: z.array(z.string()).optional(),
  properties: z.record(z.string()).optional(),
  appProperties: z.record(z.string()).optional(),
  spaces: z.array(z.string()),
  version: z.string(),
  webContentLink: z.string().optional(),
  webViewLink: z.string().optional(),
  iconLink: z.string().optional(),
  hasThumbnail: z.boolean(),
  thumbnailLink: z.string().optional(),
  viewedByMe: z.boolean(),
  viewedByMeTime: z.string().optional(),
  createdTime: z.string(),
  modifiedTime: z.string(),
  modifiedByMeTime: z.string().optional(),
  modifiedByMe: z.boolean(),
  shared: z.boolean(),
  ownedByMe: z.boolean(),
  size: z.string().optional(),
  quotaBytesUsed: z.string().optional(),
  headRevisionId: z.string().optional(),
  md5Checksum: z.string().optional(),
  sha1Checksum: z.string().optional(),
  sha256Checksum: z.string().optional(),
  capabilities: z.record(z.boolean()).optional(),
});

/**
 * Permission schema.
 */
const PermissionSchema = z.object({
  kind: z.literal('drive#permission'),
  id: z.string(),
  type: z.enum(['user', 'group', 'domain', 'anyone']),
  role: z.enum(['owner', 'organizer', 'fileOrganizer', 'writer', 'commenter', 'reader']),
  emailAddress: z.string().email().optional(),
  domain: z.string().optional(),
  displayName: z.string().optional(),
  photoLink: z.string().url().optional(),
  expirationTime: z.string().optional(),
  deleted: z.boolean().optional(),
  pendingOwner: z.boolean().optional(),
});

/**
 * File list schema.
 */
const FileListSchema = z.object({
  kind: z.literal('drive#fileList'),
  nextPageToken: z.string().optional(),
  incompleteSearch: z.boolean(),
  files: z.array(DriveFileSchema),
});

/**
 * Change schema.
 */
const ChangeSchema = z.object({
  kind: z.literal('drive#change'),
  removed: z.boolean(),
  file: DriveFileSchema.optional(),
  fileId: z.string(),
  time: z.string(),
  type: z.enum(['file', 'drive']),
  changeType: z.string().optional(),
  driveId: z.string().optional(),
});

/**
 * Change list schema.
 */
const ChangeListSchema = z.object({
  kind: z.literal('drive#changeList'),
  nextPageToken: z.string().optional(),
  newStartPageToken: z.string().optional(),
  changes: z.array(ChangeSchema),
});

/**
 * Storage quota schema.
 */
const StorageQuotaSchema = z.object({
  limit: z.string(),
  usage: z.string(),
  usageInDrive: z.string().optional(),
  usageInDriveTrash: z.string().optional(),
});

/**
 * Request schemas.
 */
const CreateFileRequestSchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().optional(),
  description: z.string().optional(),
  parents: z.array(z.string()).optional(),
  properties: z.record(z.string()).optional(),
  appProperties: z.record(z.string()).optional(),
  starred: z.boolean().optional(),
});

const ListFilesParamsSchema = z.object({
  corpora: z.enum(['user', 'drive', 'allDrives']).optional(),
  driveId: z.string().optional(),
  includeItemsFromAllDrives: z.boolean().optional(),
  orderBy: z.string().optional(),
  pageSize: z.number().int().min(1).max(1000).optional(),
  pageToken: z.string().optional(),
  q: z.string().optional(),
  spaces: z.string().optional(),
  supportsAllDrives: z.boolean().optional(),
  fields: z.string().optional(),
});
```

---

## 8. Data Flow Architecture

### 8.1 Request Pipeline

```
┌─────────────┐
│   Client    │
│  (User Code)│
└──────┬──────┘
       │ 1. Call service method
       │    files.create(request)
       ▼
┌─────────────────────┐
│  FilesService       │
│  - Validate request │
│  - Build metadata   │
└──────┬──────────────┘
       │ 2. Build API request
       │    ApiRequest { method, path, body, headers }
       ▼
┌─────────────────────┐
│  RequestExecutor    │
│  - Add auth token   │
│  - Apply resilience │
└──────┬──────────────┘
       │ 3. Execute with retry/circuit breaker
       │
       ▼
┌─────────────────────┐
│   AuthProvider      │
│  - Get token        │
│  - Refresh if needed│
└──────┬──────────────┘
       │ 4. Add Authorization header
       │    "Bearer <access_token>"
       ▼
┌─────────────────────┐
│  HttpTransport      │
│  - Send HTTP request│
│  - Connection pool  │
└──────┬──────────────┘
       │ 5. HTTPS request
       │    POST /drive/v3/files
       ▼
┌─────────────────────┐
│  Google Drive API   │
│  (Remote Server)    │
└─────────────────────┘
```

**Step-by-Step Flow:**

1. **Client Invocation**: User calls `files.create({ name: "doc.pdf", ... })`
2. **Service Layer**: FilesService validates request and builds API request object
3. **Request Executor**: Applies retry logic, circuit breaker, rate limiting
4. **Auth Layer**: AuthProvider adds `Authorization: Bearer <token>` header
5. **Transport Layer**: HttpTransport sends HTTPS request to Google API
6. **Response**: Flows back through the same layers (see Response Pipeline)

### 8.2 Response Pipeline

```
┌─────────────────────┐
│  Google Drive API   │
│  (Remote Server)    │
└──────┬──────────────┘
       │ 1. HTTP response
       │    200 OK + JSON body
       ▼
┌─────────────────────┐
│  HttpTransport      │
│  - Receive response │
│  - Extract body     │
└──────┬──────────────┘
       │ 2. Raw response
       │    { status: 200, body: bytes, headers }
       ▼
┌─────────────────────┐
│  RequestExecutor    │
│  - Check status     │
│  - Map errors       │
└──────┬──────────────┘
       │ 3. Parse JSON
       │
       ├─ Success (200-299) ─┐
       │                      ▼
       │              ┌──────────────┐
       │              │ Parse JSON   │
       │              │ Deserialize  │
       │              └──────┬───────┘
       │                     │ 4. Type-checked object
       │                     ▼
       │              ┌──────────────┐
       │              │ FilesService │
       │              │ Return File  │
       │              └──────┬───────┘
       │                     │ 5. Domain object
       │                     ▼
       │              ┌──────────────┐
       │              │   Client     │
       │              │  (User Code) │
       │              └──────────────┘
       │
       └─ Error (400-599) ──┐
                            ▼
                     ┌──────────────┐
                     │ ErrorMapper  │
                     │ Map to typed │
                     │ error        │
                     └──────┬───────┘
                            │ 6. GoogleDriveError
                            ▼
                     ┌──────────────┐
                     │   Client     │
                     │  (Catch err) │
                     └──────────────┘
```

**Error Mapping:**

| Status | API Reason             | Mapped Error                          |
|--------|------------------------|---------------------------------------|
| 400    | `badRequest`           | `RequestError::ValidationError`       |
| 401    | `authError`            | `AuthenticationError::InvalidToken`   |
| 403    | `insufficientPermissions` | `AuthorizationError::InsufficientPermissions` |
| 403    | `userRateLimitExceeded` | `QuotaError::UserRateLimitExceeded` |
| 404    | `notFound`             | `ResourceError::FileNotFound`         |
| 429    | `rateLimitExceeded`    | `QuotaError::UserRateLimitExceeded`   |
| 500    | `internalError`        | `ServerError::InternalError`          |
| 503    | `serviceUnavailable`   | `ServerError::ServiceUnavailable`     |

### 8.3 Upload Flows

#### 8.3.1 Simple Upload (≤5MB)

```
Client
  │
  │ files.createWithContent({ name, content })
  ▼
FilesService
  │
  │ 1. Validate size ≤ 5MB
  │ 2. Detect MIME type
  ▼
RequestExecutor
  │
  │ POST /upload/drive/v3/files?uploadType=media
  │ Content-Type: application/pdf
  │ Body: <file bytes>
  ▼
Google Drive API
  │
  │ 200 OK + File metadata
  ▼
FilesService
  │
  │ 3. If additional metadata needed:
  │    PATCH /drive/v3/files/{id}
  │    (description, parents, etc.)
  ▼
Client (File object returned)
```

#### 8.3.2 Multipart Upload

```
Client
  │
  │ files.createMultipart({ name, content, metadata })
  ▼
FilesService
  │
  │ 1. Build multipart body:
  │    --boundary
  │    Content-Type: application/json
  │    { name, description, parents }
  │    --boundary
  │    Content-Type: application/pdf
  │    <file bytes>
  │    --boundary--
  ▼
RequestExecutor
  │
  │ POST /upload/drive/v3/files?uploadType=multipart
  │ Content-Type: multipart/related; boundary=<boundary>
  │ Body: <multipart body>
  ▼
Google Drive API
  │
  │ 200 OK + File metadata
  ▼
Client (File object returned)
```

#### 8.3.3 Resumable Upload (Large Files) - State Diagram

```
                   ┌──────────────┐
                   │  INITIATED   │
                   │              │
                   │ - upload_uri │
                   │ - total_size │
                   └──────┬───────┘
                          │
                          │ upload_chunk()
                          ▼
             ┌────────────────────────┐
             │    UPLOADING           │
             │                        │
             │ - bytes_uploaded       │
             │ - chunk in progress    │
             └────┬──────────────┬────┘
                  │              │
        Success   │              │ Network Error
        (308)     │              │
                  ▼              ▼
       ┌──────────────┐   ┌──────────────┐
       │ IN_PROGRESS  │   │ INTERRUPTED  │
       │              │   │              │
       │ bytes_rcvd   │   │ last_offset  │
       └──────┬───────┘   └──────┬───────┘
              │                  │
              │                  │ resume()
              │                  │ query_status()
              │ ◄────────────────┘
              │
              │ Continue uploading
              │
              ▼
    ┌──────────────────┐
    │    UPLOADING     │
    │  (next chunk)    │
    └──────┬───────────┘
           │
           │ Final chunk
           │ Success (200/201)
           ▼
    ┌──────────────┐
    │  COMPLETE    │
    │              │
    │ - File obj   │
    └──────────────┘
```

**Resumable Upload Algorithm:**

```
1. Initiate Upload:
   POST /upload/drive/v3/files?uploadType=resumable
   X-Upload-Content-Type: application/pdf
   X-Upload-Content-Length: 104857600
   Body: { name, metadata }

   Response: 200 OK
   Location: https://www.googleapis.com/upload/drive/v3/files?uploadId=<id>

2. Upload Chunks:
   LOOP offset = 0; offset < total_size; offset += chunk_size:
     chunk = content[offset : offset + chunk_size]

     PUT <upload_uri>
     Content-Length: <chunk_size>
     Content-Range: bytes <start>-<end>/<total>
     Body: <chunk>

     Response:
       308 Resume Incomplete → continue
       200/201 OK → upload complete, return File
       5xx → retry with exponential backoff

3. On Interruption:
   PUT <upload_uri>
   Content-Length: 0
   Content-Range: bytes */<total>

   Response: 308 Resume Incomplete
   Range: bytes=0-<bytes_received>

   Resume from bytes_received + 1
```

### 8.4 Download Flows

#### 8.4.1 Full Download

```
Client
  │
  │ files.download(fileId)
  ▼
FilesService
  │
  │ GET /drive/v3/files/{id}?alt=media
  ▼
HttpTransport
  │
  │ Receive full response body
  ▼
Client (ArrayBuffer/Bytes returned)
```

#### 8.4.2 Streaming Download

```
Client
  │
  │ files.downloadStream(fileId)
  ▼
FilesService
  │
  │ GET /drive/v3/files/{id}?alt=media
  ▼
HttpTransport
  │
  │ Return streaming response
  │
  ▼
ProgressTrackingStream
  │
  │ Wrap stream with progress tracking
  │
  ▼
Client
  │
  │ FOR AWAIT chunk OF stream:
  │   process(chunk)
  │   metrics.increment(bytes_downloaded)
  ▼
Done
```

### 8.5 Pagination Flow

#### 8.5.1 NextPageToken Handling

```
Request 1:
  GET /drive/v3/files?pageSize=100

  Response:
  {
    "files": [ file1, file2, ..., file100 ],
    "nextPageToken": "token_abc123"
  }

Request 2:
  GET /drive/v3/files?pageSize=100&pageToken=token_abc123

  Response:
  {
    "files": [ file101, file102, ..., file200 ],
    "nextPageToken": "token_def456"
  }

Request 3:
  GET /drive/v3/files?pageSize=100&pageToken=token_def456

  Response:
  {
    "files": [ file201, file202, ..., file250 ],
    "nextPageToken": null  // No more pages
  }
```

#### 8.5.2 PageIterator Pattern

```typescript
class PageIterator<T> implements AsyncIterable<T> {
  private currentPageToken?: string;
  private buffer: T[] = [];
  private bufferIndex = 0;

  async *[Symbol.asyncIterator]() {
    while (true) {
      // Return from buffer if available
      if (this.bufferIndex < this.buffer.length) {
        yield this.buffer[this.bufferIndex++];
        continue;
      }

      // Check if we have more pages
      if (this.currentPageToken === null) {
        return; // No more pages
      }

      // Fetch next page
      const response = await this.fetchPage(this.currentPageToken);

      // Update state
      this.buffer = response.items;
      this.bufferIndex = 0;
      this.currentPageToken = response.nextPageToken ?? null;

      // Yield first item
      if (this.buffer.length > 0) {
        yield this.buffer[this.bufferIndex++];
      }
    }
  }

  async collectAll(): Promise<T[]> {
    const results: T[] = [];
    for await (const item of this) {
      results.push(item);
    }
    return results;
  }
}

// Usage:
for await (const file of files.listAll({ q: "trashed=false" })) {
  console.log(file.name);
}
```

---

## 9. Authentication Architecture

### 9.1 OAuth 2.0 Flow

```
┌──────────────────────────────────────────────────────────┐
│  OAuth 2.0 Token Exchange                                │
└──────────────────────────────────────────────────────────┘

Initial State:
  - client_id: "abc123.apps.googleusercontent.com"
  - client_secret: "secret_xyz"
  - refresh_token: "1//refresh_token_abc"
  - cached_token: null

Request 1 (No cached token):
  │
  │ getAccessToken()
  ▼
OAuth2Provider
  │
  │ 1. Check cache: null → need to refresh
  │
  │ 2. POST https://oauth2.googleapis.com/token
  │    grant_type=refresh_token
  │    client_id=<client_id>
  │    client_secret=<client_secret>
  │    refresh_token=<refresh_token>
  ▼
Google OAuth2 Server
  │
  │ 200 OK
  │ {
  │   "access_token": "ya29.a0AfH6SMBx...",
  │   "expires_in": 3599,
  │   "scope": "https://www.googleapis.com/auth/drive",
  │   "token_type": "Bearer"
  │ }
  ▼
OAuth2Provider
  │
  │ 3. Cache token:
  │    cached_token = {
  │      token: "ya29.a0AfH6SMBx...",
  │      expiresAt: now + 3599s,
  │      scopes: ["drive"]
  │    }
  │
  │ 4. Return token
  ▼
Client (uses token for API calls)


Request 2 (Cached token valid):
  │
  │ getAccessToken()
  ▼
OAuth2Provider
  │
  │ 1. Check cache: exists
  │ 2. Check expiry: now < expiresAt → valid
  │ 3. Return cached_token
  ▼
Client (immediate return)


Request 3 (Cached token expired):
  │
  │ getAccessToken()
  ▼
OAuth2Provider
  │
  │ 1. Check cache: exists
  │ 2. Check expiry: now >= expiresAt → expired
  │ 3. Refresh token (same as Request 1)
  │ 4. Update cache
  │ 5. Return new token
  ▼
Client
```

### 9.2 Service Account Flow

```
┌──────────────────────────────────────────────────────────┐
│  Service Account JWT Flow                                │
└──────────────────────────────────────────────────────────┘

Initial State:
  - service_account_email: "sa@project.iam.gserviceaccount.com"
  - private_key: "-----BEGIN PRIVATE KEY-----..."
  - scopes: ["https://www.googleapis.com/auth/drive"]
  - subject: "user@example.com" (optional, for domain-wide delegation)
  - cached_token: null

Request 1:
  │
  │ getAccessToken()
  ▼
ServiceAccountProvider
  │
  │ 1. Check cache: null → need to create JWT
  │
  │ 2. Build JWT header:
  │    {
  │      "alg": "RS256",
  │      "typ": "JWT"
  │    }
  │
  │ 3. Build JWT claim set:
  │    {
  │      "iss": "sa@project.iam.gserviceaccount.com",
  │      "sub": "user@example.com",  // if domain-wide delegation
  │      "scope": "https://www.googleapis.com/auth/drive",
  │      "aud": "https://oauth2.googleapis.com/token",
  │      "iat": 1609459200,  // current timestamp
  │      "exp": 1609462800   // iat + 3600 (1 hour)
  │    }
  │
  │ 4. Sign JWT with private key (RS256):
  │    signature = RSA_SHA256(private_key, base64(header) + "." + base64(claims))
  │    jwt = base64(header) + "." + base64(claims) + "." + base64(signature)
  │
  │ 5. POST https://oauth2.googleapis.com/token
  │    grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
  │    assertion=<jwt>
  ▼
Google OAuth2 Server
  │
  │ 1. Verify JWT signature
  │ 2. Validate claims (iss, aud, exp)
  │ 3. Check service account permissions
  │
  │ 200 OK
  │ {
  │   "access_token": "ya29.c.Kl6iB...",
  │   "expires_in": 3599,
  │   "token_type": "Bearer"
  │ }
  ▼
ServiceAccountProvider
  │
  │ 6. Cache token:
  │    cached_token = {
  │      token: "ya29.c.Kl6iB...",
  │      expiresAt: now + 3599s
  │    }
  │
  │ 7. Return token
  ▼
Client
```

**Domain-Wide Delegation:**
- Used when service account needs to impersonate a user
- Requires admin to grant domain-wide delegation in Google Workspace Admin Console
- `subject` field in JWT must be the user email to impersonate
- Service account must have necessary OAuth scopes authorized

### 9.3 Token Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│  Token Lifecycle Management                                 │
└─────────────────────────────────────────────────────────────┘

Timeline:
  t=0           t=3000        t=3300         t=3599        t=3600
  │             │             │              │             │
  │             │             │              │             │
  ▼             ▼             ▼              ▼             ▼
Token      Still valid   Proactive      Grace period   Expired
created                  refresh
                         threshold
                         (300s before)

State Transitions:

┌──────────────┐
│   NO_TOKEN   │  Initial state, no token cached
└──────┬───────┘
       │
       │ refresh()
       ▼
┌──────────────┐
│    VALID     │  Token exists and not expired
│              │  expiresAt > now + 300s
└──────┬───────┘
       │
       │ Time passes
       │ now + 300s >= expiresAt
       ▼
┌──────────────┐
│NEEDS_REFRESH │  Token approaching expiry
│              │  expiresAt - now < 300s
│              │  expiresAt > now
└──────┬───────┘
       │
       │ refresh() (proactive)
       │ OR wait for expiry
       ▼
┌──────────────┐
│   EXPIRED    │  Token has expired
│              │  expiresAt <= now
└──────┬───────┘
       │
       │ refresh() (forced)
       │
       └──────► Back to VALID
```

**Proactive Refresh Strategy:**

```typescript
class TokenCache {
  private token: AccessToken | null = null;
  private refreshThresholdSeconds = 300; // 5 minutes

  isExpired(): boolean {
    if (!this.token) return true;
    return new Date() >= this.token.expiresAt;
  }

  needsRefresh(): boolean {
    if (!this.token) return true;

    const now = new Date();
    const expiresAt = this.token.expiresAt;
    const thresholdDate = new Date(expiresAt.getTime() - this.refreshThresholdSeconds * 1000);

    return now >= thresholdDate;
  }

  async getToken(provider: AuthProvider): Promise<AccessToken> {
    // If expired or needs refresh, refresh proactively
    if (this.needsRefresh()) {
      this.token = await provider.refreshToken();
    }

    return this.token!;
  }
}
```

---

## 10. State Management

### 10.1 Token Cache State

```typescript
interface TokenCacheState {
  /** Cached access token. */
  token: string | null;

  /** Token expiration timestamp. */
  expiresAt: Date | null;

  /** Token scopes. */
  scopes: string[];

  /** Refresh in progress flag (prevents concurrent refreshes). */
  refreshInProgress: boolean;

  /** Last refresh error. */
  lastError: Error | null;
}

// Initial state:
{
  token: null,
  expiresAt: null,
  scopes: [],
  refreshInProgress: false,
  lastError: null
}

// After successful refresh:
{
  token: "ya29.a0AfH6SMBx...",
  expiresAt: Date("2025-12-12T10:59:59Z"),
  scopes: ["https://www.googleapis.com/auth/drive"],
  refreshInProgress: false,
  lastError: null
}

// During refresh (prevents concurrent):
{
  token: "ya29.old_token...",
  expiresAt: Date("2025-12-12T09:00:00Z"), // expired
  scopes: ["https://www.googleapis.com/auth/drive"],
  refreshInProgress: true,  // ← blocks concurrent refreshes
  lastError: null
}
```

### 10.2 Circuit Breaker States

```
┌──────────────────────────────────────────────────────────┐
│  Circuit Breaker State Machine                           │
└──────────────────────────────────────────────────────────┘

                    ┌─────────────┐
           ┌───────►│   CLOSED    │◄──────┐
           │        │             │       │
           │        │ Requests    │       │
           │        │ pass through│       │
           │        └──────┬──────┘       │
           │               │              │
           │               │ Failure      │
           │               │ Count >= 5   │
           │               ▼              │
           │        ┌─────────────┐       │
           │        │    OPEN     │       │
           │        │             │       │
           │        │ All requests│       │
           │        │ rejected    │       │
           │        └──────┬──────┘       │
           │               │              │
           │               │ Timeout      │
           │               │ (60s)        │
           │               ▼              │
           │        ┌─────────────┐       │
           │        │ HALF_OPEN   │       │
           │        │             │       │
           │        │ Limited     │       │
           │        │ requests    │       │
           │        └──┬───────┬──┘       │
           │           │       │          │
           │   Failure │       │ Success  │
           │           │       │ Count>=3 │
           │           │       │          │
           └───────────┘       └──────────┘

State Details:

CLOSED:
  - failure_count: 0-4
  - success_count: N/A
  - last_failure_time: null
  - Behavior: All requests pass through
  - Transition: failure_count >= 5 → OPEN

OPEN:
  - failure_count: >= 5
  - success_count: 0
  - last_failure_time: timestamp
  - Behavior: Reject all requests immediately with CircuitBreakerOpen error
  - Transition: (now - last_failure_time) >= 60s → HALF_OPEN

HALF_OPEN:
  - failure_count: reset to 0
  - success_count: 0-2
  - last_failure_time: null
  - Behavior: Allow limited requests (test if service recovered)
  - Transition:
    - Any failure → OPEN (back to open)
    - success_count >= 3 → CLOSED (service recovered)
```

**Circuit Breaker Configuration:**

```typescript
interface CircuitBreakerState {
  /** Current state. */
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';

  /** Consecutive failure count. */
  failureCount: number;

  /** Consecutive success count (in HALF_OPEN). */
  successCount: number;

  /** Last failure timestamp. */
  lastFailureTime: Date | null;

  /** Configuration. */
  config: {
    failureThreshold: 5;
    successThreshold: 3;
    resetTimeout: 60000; // ms
  };
}
```

### 10.3 Rate Limit Tracking

```typescript
interface RateLimitState {
  /** User queries per 100 seconds (rolling window). */
  userQueries: {
    timestamps: number[];  // Array of request timestamps
    limit: 1000;
    window: 100000;  // 100 seconds in ms
  };

  /** Project queries per day. */
  projectQueries: {
    count: number;
    resetTime: Date;  // Midnight UTC
    limit: 10_000_000;
  };

  /** Last rate limit error. */
  lastRateLimitError: {
    type: 'user' | 'project';
    timestamp: Date;
    retryAfter: number | null;  // seconds
  } | null;
}

// Tracking algorithm:
function trackRequest(state: RateLimitState): void {
  const now = Date.now();

  // Add to user queries
  state.userQueries.timestamps.push(now);

  // Remove old timestamps outside window
  const windowStart = now - state.userQueries.window;
  state.userQueries.timestamps = state.userQueries.timestamps.filter(
    t => t >= windowStart
  );

  // Increment project queries
  if (now >= state.projectQueries.resetTime.getTime()) {
    // New day, reset counter
    state.projectQueries.count = 1;
    state.projectQueries.resetTime = getNextMidnightUTC();
  } else {
    state.projectQueries.count++;
  }
}

function canMakeRequest(state: RateLimitState): boolean {
  const now = Date.now();

  // Check user rate limit
  const windowStart = now - state.userQueries.window;
  const recentRequests = state.userQueries.timestamps.filter(
    t => t >= windowStart
  ).length;

  if (recentRequests >= state.userQueries.limit) {
    return false;  // User rate limit exceeded
  }

  // Check project rate limit
  if (state.projectQueries.count >= state.projectQueries.limit) {
    return false;  // Project rate limit exceeded
  }

  return true;
}
```

### 10.4 Resumable Upload Session State

```typescript
interface ResumableUploadSessionState {
  /** Upload URI from Google. */
  uploadUri: string;

  /** Total file size. */
  totalSize: number;

  /** Bytes uploaded so far. */
  bytesUploaded: number;

  /** Chunk size for uploads. */
  chunkSize: number;

  /** Upload status. */
  status: 'initiated' | 'uploading' | 'paused' | 'interrupted' | 'complete';

  /** Last successful chunk offset. */
  lastSuccessfulOffset: number;

  /** Content type. */
  contentType: string;

  /** Retry count for current chunk. */
  retryCount: number;

  /** Last error. */
  lastError: Error | null;
}

// State transitions:
{
  // 1. Initiated
  uploadUri: "https://www.googleapis.com/upload/drive/v3/files?uploadId=xyz",
  totalSize: 104857600,
  bytesUploaded: 0,
  chunkSize: 8388608,
  status: 'initiated',
  lastSuccessfulOffset: 0,
  contentType: "application/pdf",
  retryCount: 0,
  lastError: null
}

// 2. Uploading (chunk 1 uploaded)
{
  uploadUri: "...",
  totalSize: 104857600,
  bytesUploaded: 8388608,  // 8MB
  chunkSize: 8388608,
  status: 'uploading',
  lastSuccessfulOffset: 8388608,
  contentType: "application/pdf",
  retryCount: 0,
  lastError: null
}

// 3. Interrupted (network error during chunk 2)
{
  uploadUri: "...",
  totalSize: 104857600,
  bytesUploaded: 8388608,  // Still at 8MB (chunk 2 failed)
  chunkSize: 8388608,
  status: 'interrupted',
  lastSuccessfulOffset: 8388608,
  contentType: "application/pdf",
  retryCount: 1,
  lastError: NetworkError("Connection timeout")
}

// 4. Resume (query status before retrying)
{
  uploadUri: "...",
  totalSize: 104857600,
  bytesUploaded: 8388608,  // Confirmed from server
  chunkSize: 8388608,
  status: 'uploading',
  lastSuccessfulOffset: 8388608,
  contentType: "application/pdf",
  retryCount: 1,
  lastError: null
}

// 5. Complete
{
  uploadUri: "...",
  totalSize: 104857600,
  bytesUploaded: 104857600,  // All bytes uploaded
  chunkSize: 8388608,
  status: 'complete',
  lastSuccessfulOffset: 104857600,
  contentType: "application/pdf",
  retryCount: 0,
  lastError: null
}
```

---

## Document Control

| Version | Date       | Author          | Changes                              |
|---------|------------|-----------------|--------------------------------------|
| 1.0.0   | 2025-12-12 | SPARC Generator | Initial architecture document part 2 |

---

**End of Architecture Document Part 2**

*This document describes the TypeScript interfaces, data flow patterns, authentication flows, and state management for the Google Drive integration. Continue to Part 3 for component architecture, dependency injection, and implementation patterns.*


---


**SPARC Phase 3: Architecture - Concurrency, Resilience & Observability**
**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/google-drive`

---

## Table of Contents

11. [Concurrency Patterns](#11-concurrency-patterns)
12. [Error Propagation](#12-error-propagation)
13. [Resilience Integration](#13-resilience-integration)
14. [Observability Architecture](#14-observability-architecture)
15. [Security Architecture](#15-security-architecture)
16. [Configuration Schema](#16-configuration-schema)
17. [Testing Architecture](#17-testing-architecture)
18. [Document Control](#18-document-control)

---

## 11. Concurrency Patterns

### 11.1 Async/Await Model

**Rust Implementation:**

```rust
// All API operations are async
#[async_trait]
pub trait FilesService: Send + Sync {
    async fn get(&self, file_id: &str) -> Result<File, GoogleDriveError>;
    async fn list(&self, params: Option<ListFilesParams>) -> Result<FileList, GoogleDriveError>;
    // ... other methods
}

// Tokio runtime is used for async execution
// Users can configure multi-threaded or single-threaded runtime
```

**TypeScript Implementation:**

```typescript
// Native async/await using Promises
interface FilesService {
  get(fileId: string, params?: GetFileParams): Promise<DriveFile>;
  list(params?: ListFilesParams): Promise<FileList>;
  // ... other methods
}

// Node.js event loop handles concurrency
```

**Concurrency Control:**

```
┌─────────────────────────────────────────────────────────┐
│                   Request Scheduler                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Semaphore (max_concurrent_requests)              │  │
│  │  Default: 10 concurrent requests                  │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                               │
│              ┌───────────┴───────────┐                   │
│              ▼                       ▼                   │
│    ┌─────────────────┐     ┌─────────────────┐         │
│    │   Request 1     │     │   Request 2     │         │
│    │   (in progress) │     │   (in progress) │         │
│    └─────────────────┘     └─────────────────┘         │
│                                                           │
│    ┌─────────────────┐     ┌─────────────────┐         │
│    │   Request 3     │     │   Request 4     │         │
│    │   (queued)      │     │   (queued)      │         │
│    └─────────────────┘     └─────────────────┘         │
└─────────────────────────────────────────────────────────┘
```

### 11.2 Connection Pooling

**HTTP Connection Pool Configuration:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_idle_per_host` | 10 | Maximum idle connections per host |
| `idle_timeout` | 90s | Idle connection timeout |
| `pool_max_idle_time` | 300s | Maximum time connection can be idle |
| `tcp_keepalive` | 60s | TCP keepalive interval |
| `http2_only` | true | Use HTTP/2 only |

**Pool Architecture:**

```
┌────────────────────────────────────────────────────────┐
│              HTTP Connection Pool                      │
│                                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │  googleapis.com:443 (HTTP/2)                     │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │ │
│  │  │ Conn 1 │ │ Conn 2 │ │ Conn 3 │ │ Idle   │   │ │
│  │  │ Active │ │ Active │ │ Active │ │        │   │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘   │ │
│  └──────────────────────────────────────────────────┘ │
│                                                         │
│  HTTP/2 Multiplexing:                                  │
│  - Multiple requests over single connection            │
│  - Stream-based concurrency                            │
│  - Automatic flow control                              │
└────────────────────────────────────────────────────────┘
```

### 11.3 Streaming Patterns

**Download Streaming:**

```rust
// Stream-based download (Rust)
pub async fn download_stream(
    &self,
    file_id: &str,
) -> Result<impl Stream<Item = Result<Bytes, GoogleDriveError>>, GoogleDriveError> {
    // Returns a stream that yields chunks as they arrive
    // Memory usage: O(chunk_size), not O(file_size)
}
```

**Stream Processing Flow:**

```
┌─────────────────────────────────────────────────────┐
│            Download Stream Pipeline                 │
│                                                      │
│  HTTP Response                                       │
│       │                                              │
│       ▼                                              │
│  ┌──────────────┐      ┌──────────────┐            │
│  │ Chunk Reader │─────▶│ Decompress   │            │
│  │ (8KB chunks) │      │ (if gzipped) │            │
│  └──────────────┘      └──────────────┘            │
│                             │                        │
│                             ▼                        │
│                        ┌──────────────┐             │
│                        │ Yield Bytes  │             │
│                        │ to Consumer  │             │
│                        └──────────────┘             │
│                                                      │
│  Memory Usage: ~8KB per stream (constant)           │
│  Backpressure: Automatic (stream pull-based)        │
└─────────────────────────────────────────────────────┘
```

### 11.4 Chunk Parallelization for Uploads

**Resumable Upload with Parallel Chunks:**

While Google Drive requires sequential chunk uploads, we can parallelize preparation:

```
┌─────────────────────────────────────────────────────────┐
│         Resumable Upload Pipeline                       │
│                                                          │
│  ┌────────────┐      ┌────────────┐                    │
│  │   File     │─────▶│  Chunker   │                    │
│  │  (100MB)   │      │  (8MB)     │                    │
│  └────────────┘      └────────────┘                    │
│                           │                              │
│         ┌─────────────────┼─────────────────┐           │
│         ▼                 ▼                 ▼           │
│    ┌────────┐       ┌────────┐       ┌────────┐       │
│    │Chunk 0 │       │Chunk 1 │       │Chunk 2 │       │
│    │Prepare │       │Prepare │       │Prepare │       │
│    │(hash)  │       │(hash)  │       │(hash)  │       │
│    └────────┘       └────────┘       └────────┘       │
│         │                 │                 │           │
│         └─────────────────┼─────────────────┘           │
│                           ▼                              │
│                   ┌───────────────┐                     │
│                   │Sequential     │                     │
│                   │Upload Queue   │                     │
│                   │(ordered)      │                     │
│                   └───────────────┘                     │
│                           │                              │
│                           ▼                              │
│                   ┌───────────────┐                     │
│                   │ Upload Worker │                     │
│                   │ (HTTP PUT)    │                     │
│                   └───────────────┘                     │
│                                                          │
│  Chunk Preparation: Parallel (CPU-bound hashing)        │
│  Chunk Upload: Sequential (API requirement)             │
└─────────────────────────────────────────────────────────┘
```

**Chunk Upload State Machine:**

```
┌──────────────┐
│   Pending    │
│   (queued)   │
└──────┬───────┘
       │
       ▼
┌──────────────┐      ┌──────────────┐
│  Uploading   │─────▶│   Success    │
│  (in flight) │      │  (308/200)   │
└──────┬───────┘      └──────────────┘
       │
       │ On Error
       ▼
┌──────────────┐      ┌──────────────┐
│  Query State │─────▶│   Retry      │
│  (Range: */N)│      │  (from last) │
└──────────────┘      └──────────────┘
```

### 11.5 Concurrent Request Limits

**Rate Limit Aware Concurrency:**

```rust
pub struct ConcurrencyLimiter {
    semaphore: Arc<Semaphore>,
    rate_limiter: Arc<RateLimiter>,
}

impl ConcurrencyLimiter {
    pub async fn acquire(&self) -> ConcurrencyGuard {
        // Wait for both semaphore and rate limit
        let permit = self.semaphore.acquire().await;
        self.rate_limiter.acquire().await;

        ConcurrencyGuard { permit }
    }
}

// Usage in request executor
async fn execute_request(&self, req: HttpRequest) -> Result<HttpResponse> {
    let _guard = self.concurrency_limiter.acquire().await;
    // Request is rate-limited and concurrency-controlled
    self.http_client.send(req).await
}
```

**Concurrency + Rate Limit Interaction:**

| Scenario | Behavior |
|----------|----------|
| Semaphore available, rate limit OK | Request proceeds immediately |
| Semaphore full, rate limit OK | Request queues for semaphore |
| Semaphore available, rate limit exceeded | Request waits for rate limit token |
| Both full | Request waits for both (whichever is available first) |

---

## 12. Error Propagation

### 12.1 Error Hierarchy

**Full Error Tree:**

```
GoogleDriveError
│
├─ ConfigurationError
│  ├─ MissingCredentials
│  │  └─ Fields: required_field: String
│  ├─ InvalidCredentials
│  │  └─ Fields: message: String
│  ├─ InvalidConfiguration
│  │  └─ Fields: field: String, reason: String
│  └─ MissingScope
│     └─ Fields: required: String, available: Vec<String>
│
├─ AuthenticationError
│  ├─ InvalidToken
│  │  └─ Fields: message: String
│  ├─ ExpiredToken
│  │  └─ Fields: expired_at: DateTime<Utc>
│  ├─ RefreshFailed
│  │  └─ Fields: message: String, http_status: Option<u16>
│  ├─ InvalidGrant
│  │  └─ Fields: grant_type: String, message: String
│  └─ InsufficientPermissions
│     └─ Fields: required_scope: String
│
├─ AuthorizationError
│  ├─ Forbidden
│  │  └─ Fields: message: String, reason: Option<String>
│  ├─ InsufficientPermissions
│  │  └─ Fields: resource: String, action: String
│  ├─ FileNotAccessible
│  │  └─ Fields: file_id: String, reason: String
│  ├─ DomainPolicy
│  │  └─ Fields: policy: String, message: String
│  └─ UserRateLimitExceeded (403)
│     └─ Fields: message: String, retry_after: Option<Duration>
│
├─ RequestError
│  ├─ ValidationError
│  │  └─ Fields: message: String
│  ├─ InvalidParameter
│  │  └─ Fields: parameter: String, value: String, message: String
│  ├─ MissingParameter
│  │  └─ Fields: parameter: String
│  ├─ InvalidQuery
│  │  └─ Fields: query: String, message: String
│  ├─ InvalidRange
│  │  └─ Fields: range: String, file_size: u64
│  └─ InvalidMimeType
│     └─ Fields: mime_type: String, supported: Vec<String>
│
├─ ResourceError
│  ├─ FileNotFound
│  │  └─ Fields: file_id: String
│  ├─ FolderNotFound
│  │  └─ Fields: folder_id: String
│  ├─ PermissionNotFound
│  │  └─ Fields: permission_id: String
│  ├─ CommentNotFound
│  │  └─ Fields: comment_id: String
│  ├─ RevisionNotFound
│  │  └─ Fields: revision_id: String
│  ├─ DriveNotFound
│  │  └─ Fields: drive_id: String
│  ├─ AlreadyExists
│  │  └─ Fields: resource_type: String, identifier: String
│  └─ CannotModify
│     └─ Fields: resource: String, reason: String
│
├─ QuotaError
│  ├─ StorageQuotaExceeded
│  │  └─ Fields: message: String, limit: u64, used: u64
│  ├─ UserRateLimitExceeded (429)
│  │  └─ Fields: message: String, retry_after: Option<Duration>
│  ├─ DailyLimitExceeded
│  │  └─ Fields: message: String, domain: Option<String>
│  └─ ProjectRateLimitExceeded
│     └─ Fields: message: String, retry_after: Option<Duration>
│
├─ UploadError
│  ├─ UploadInterrupted
│  │  └─ Fields: upload_uri: String, bytes_uploaded: u64, total_size: u64
│  ├─ UploadFailed
│  │  └─ Fields: message: String, upload_type: String
│  ├─ InvalidUploadRequest
│  │  └─ Fields: message: String
│  ├─ UploadSizeExceeded
│  │  └─ Fields: size: u64, max_size: u64
│  ├─ ResumableUploadExpired
│  │  └─ Fields: upload_uri: String
│  └─ ChunkSizeMismatch
│     └─ Fields: expected: usize, actual: usize
│
├─ ExportError
│  ├─ ExportNotSupported
│  │  └─ Fields: file_mime_type: String, export_mime_type: String
│  ├─ ExportSizeExceeded
│  │  └─ Fields: size: u64, max_size: u64
│  └─ InvalidExportFormat
│     └─ Fields: format: String
│
├─ NetworkError
│  ├─ ConnectionFailed
│  │  └─ Fields: message: String, url: String
│  ├─ Timeout
│  │  └─ Fields: timeout: Duration, operation: String
│  ├─ DnsResolutionFailed
│  │  └─ Fields: hostname: String
│  └─ TlsError
│     └─ Fields: message: String
│
├─ ServerError
│  ├─ InternalError
│  │  └─ Fields: message: String, request_id: Option<String>
│  ├─ BackendError
│  │  └─ Fields: message: String, request_id: Option<String>
│  ├─ ServiceUnavailable
│  │  └─ Fields: message: String, retry_after: Option<Duration>
│  └─ BadGateway
│     └─ Fields: message: String
│
└─ ResponseError
   ├─ DeserializationError
   │  └─ Fields: message: String, content: String
   ├─ UnexpectedFormat
   │  └─ Fields: expected: String, actual: String
   └─ InvalidJson
      └─ Fields: message: String, json: String
```

**Rust Enum Structure:**

```rust
#[derive(Debug, thiserror::Error)]
pub enum GoogleDriveError {
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    #[error("Authentication error: {0}")]
    Authentication(#[from] AuthenticationError),

    #[error("Authorization error: {0}")]
    Authorization(#[from] AuthorizationError),

    #[error("Request error: {0}")]
    Request(#[from] RequestError),

    #[error("Resource error: {0}")]
    Resource(#[from] ResourceError),

    #[error("Quota error: {0}")]
    Quota(#[from] QuotaError),

    #[error("Upload error: {0}")]
    Upload(#[from] UploadError),

    #[error("Export error: {0}")]
    Export(#[from] ExportError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Server error: {0}")]
    Server(#[from] ServerError),

    #[error("Response error: {0}")]
    Response(#[from] ResponseError),
}

#[derive(Debug, thiserror::Error)]
pub enum QuotaError {
    #[error("Storage quota exceeded: {message} (used: {used}/{limit} bytes)")]
    StorageQuotaExceeded {
        message: String,
        limit: u64,
        used: u64,
    },

    #[error("User rate limit exceeded: {message}")]
    UserRateLimitExceeded {
        message: String,
        retry_after: Option<Duration>,
    },

    #[error("Daily limit exceeded: {message}")]
    DailyLimitExceeded {
        message: String,
        domain: Option<String>,
    },

    #[error("Project rate limit exceeded: {message}")]
    ProjectRateLimitExceeded {
        message: String,
        retry_after: Option<Duration>,
    },
}

// ... other error enums following same pattern
```

**TypeScript Class Structure:**

```typescript
export class GoogleDriveError extends Error {
  constructor(
    message: string,
    public readonly category: ErrorCategory,
    public readonly context?: ErrorContext
  ) {
    super(message);
    this.name = 'GoogleDriveError';
  }

  isRetryable(): boolean {
    return this.category.retryable;
  }

  retryAfter(): number | undefined {
    return this.context?.retryAfter;
  }

  statusCode(): number | undefined {
    return this.context?.statusCode;
  }
}

export class QuotaError extends GoogleDriveError {
  constructor(
    message: string,
    public readonly quotaType: QuotaType,
    public readonly retryAfter?: number
  ) {
    super(message, ErrorCategory.Quota, { retryAfter });
    this.name = 'QuotaError';
  }
}

export class StorageQuotaExceededError extends QuotaError {
  constructor(
    message: string,
    public readonly limit: number,
    public readonly used: number
  ) {
    super(message, QuotaType.Storage);
    this.name = 'StorageQuotaExceededError';
  }
}

// ... other error classes following same pattern
```

### 12.2 Retryable Classification

**Retryable Errors Matrix:**

| Error Type | Retryable | Retry Strategy | Max Attempts |
|------------|-----------|----------------|--------------|
| `QuotaError::UserRateLimitExceeded` | Yes | Use retry-after or 60s fixed | 5 |
| `QuotaError::ProjectRateLimitExceeded` | Yes | Use retry-after or 5min | 3 |
| `QuotaError::StorageQuotaExceeded` | No | - | 0 |
| `QuotaError::DailyLimitExceeded` | No | - | 0 |
| `NetworkError::Timeout` | Yes | Exponential backoff (1s base) | 3 |
| `NetworkError::ConnectionFailed` | Yes | Exponential backoff (1s base) | 3 |
| `NetworkError::DnsResolutionFailed` | No | - | 0 |
| `NetworkError::TlsError` | No | - | 0 |
| `ServerError::InternalError` | Yes | Exponential backoff (5s base) | 3 |
| `ServerError::ServiceUnavailable` | Yes | Use retry-after or 30s | 3 |
| `ServerError::BackendError` | Yes | Exponential backoff (5s base) | 3 |
| `ServerError::BadGateway` | Yes | Exponential backoff (1s base) | 3 |
| `UploadError::UploadInterrupted` | Yes | Resume from last byte | 3 |
| `UploadError::ResumableUploadExpired` | No | - | 0 |
| `AuthenticationError::ExpiredToken` | Yes | Refresh token, retry once | 1 |
| `AuthenticationError::InvalidToken` | No | - | 0 |
| `AuthenticationError::RefreshFailed` | No | - | 0 |
| `AuthorizationError::*` | No | - | 0 |
| `RequestError::*` | No | - | 0 |
| `ResourceError::*` | No | - | 0 |
| `ConfigurationError::*` | No | - | 0 |

**Retry-After Handling:**

```rust
impl GoogleDriveError {
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            GoogleDriveError::Quota(QuotaError::UserRateLimitExceeded { retry_after, .. }) => {
                *retry_after
            }
            GoogleDriveError::Quota(QuotaError::ProjectRateLimitExceeded { retry_after, .. }) => {
                *retry_after
            }
            GoogleDriveError::Server(ServerError::ServiceUnavailable { retry_after, .. }) => {
                *retry_after
            }
            _ => None,
        }
    }
}

// Parse Retry-After header
fn parse_retry_after(header_value: &str) -> Option<Duration> {
    // Try parsing as seconds (integer)
    if let Ok(seconds) = header_value.parse::<u64>() {
        return Some(Duration::from_secs(seconds));
    }

    // Try parsing as HTTP date
    if let Ok(datetime) = DateTime::parse_from_rfc2822(header_value) {
        let now = Utc::now();
        let delay = datetime.signed_duration_since(now);
        if delay.num_seconds() > 0 {
            return Some(Duration::from_secs(delay.num_seconds() as u64));
        }
    }

    None
}
```

### 12.3 Error Context

**Request ID Tracking:**

```rust
pub struct ErrorContext {
    /// Google API request ID (from X-Goog-Request-Id header)
    pub request_id: Option<String>,

    /// Trace ID from distributed tracing
    pub trace_id: Option<String>,

    /// Span ID from distributed tracing
    pub span_id: Option<String>,

    /// Timestamp when error occurred
    pub timestamp: DateTime<Utc>,

    /// HTTP status code (if applicable)
    pub status_code: Option<u16>,

    /// Rate limit information
    pub rate_limit_info: Option<RateLimitInfo>,

    /// Retry attempt number
    pub retry_attempt: u32,

    /// Additional context fields
    pub extra: HashMap<String, String>,
}

pub struct RateLimitInfo {
    /// Rate limit type (user, project)
    pub limit_type: String,

    /// Current usage
    pub current_usage: Option<u64>,

    /// Limit value
    pub limit: Option<u64>,

    /// Reset time
    pub reset_at: Option<DateTime<Utc>>,

    /// Retry after duration
    pub retry_after: Option<Duration>,
}

impl GoogleDriveError {
    pub fn with_context(self, context: ErrorContext) -> Self {
        // Attach context to error
        match self {
            GoogleDriveError::Quota(mut e) => {
                e.context = Some(context);
                GoogleDriveError::Quota(e)
            }
            // ... pattern for each variant
            _ => self,
        }
    }

    pub fn context(&self) -> Option<&ErrorContext> {
        match self {
            GoogleDriveError::Quota(e) => e.context.as_ref(),
            // ... pattern for each variant
            _ => None,
        }
    }
}
```

**Error Context Enrichment Flow:**

```
Request Initiation
       │
       ▼
┌──────────────┐
│ Generate     │
│ Request ID   │
│ Trace ID     │
└──────┬───────┘
       │
       ▼
┌──────────────┐      ┌──────────────┐
│ Execute      │─────▶│ Response OK  │
│ Request      │      └──────────────┘
└──────┬───────┘
       │
       │ On Error
       ▼
┌──────────────┐
│ Extract      │
│ - X-Goog-Request-Id
│ - Status Code
│ - Retry-After
│ - Error Reason
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Map to       │
│ Error Type   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Enrich with  │
│ Context      │
│ - Request ID │
│ - Trace ID   │
│ - Rate Limit │
│ - Timestamp  │
└──────┬───────┘
       │
       ▼
Return Enriched Error
```

---

## 13. Resilience Integration

### 13.1 Retry Integration

**integrations-retry Usage:**

```rust
use integrations_retry::{RetryPolicy, ExponentialBackoff, Jitter};

pub struct GoogleDriveRetryConfig {
    /// Maximum number of retry attempts
    pub max_attempts: u32,

    /// Base delay for exponential backoff
    pub base_delay: Duration,

    /// Maximum delay between retries
    pub max_delay: Duration,

    /// Multiplier for exponential backoff
    pub multiplier: f64,

    /// Jitter to add to delays
    pub jitter: Jitter,

    /// Respect Retry-After headers
    pub respect_retry_after: bool,
}

impl Default for GoogleDriveRetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(60),
            multiplier: 2.0,
            jitter: Jitter::Full,
            respect_retry_after: true,
        }
    }
}
```

**Exponential Backoff Configuration:**

| Attempt | Base Delay | With Jitter (Full) | Total Wait |
|---------|------------|-------------------|------------|
| 1 | 1s | 0.5s - 1.5s | 0.5s - 1.5s |
| 2 | 2s | 1s - 3s | 1.5s - 4.5s |
| 3 | 4s | 2s - 6s | 3.5s - 10.5s |
| 4 | 8s | 4s - 12s | 7.5s - 22.5s |
| Max | 60s | 30s - 90s | Capped at max_delay |

**Jitter Types:**

```rust
pub enum Jitter {
    /// No jitter - use exact backoff
    None,

    /// Full jitter - random between 0 and backoff
    /// delay = random(0, base_delay * multiplier^attempt)
    Full,

    /// Equal jitter - half base + half random
    /// delay = base_delay/2 + random(0, base_delay/2)
    Equal,

    /// Decorrelated jitter - prevent synchronization
    /// delay = random(base_delay, prev_delay * multiplier)
    Decorrelated,
}
```

**Retry Decision Logic:**

```rust
impl RetryPolicy for GoogleDriveRetryPolicy {
    fn should_retry(&self, error: &GoogleDriveError, attempt: u32) -> bool {
        if attempt >= self.config.max_attempts {
            return false;
        }

        error.is_retryable()
    }

    fn delay(&self, error: &GoogleDriveError, attempt: u32) -> Duration {
        // Check for Retry-After header
        if self.config.respect_retry_after {
            if let Some(retry_after) = error.retry_after() {
                return retry_after.min(self.config.max_delay);
            }
        }

        // Calculate exponential backoff
        let base = self.config.base_delay.as_secs_f64();
        let delay = base * self.config.multiplier.powi(attempt as i32);
        let delay = delay.min(self.config.max_delay.as_secs_f64());

        // Apply jitter
        let jittered = match self.config.jitter {
            Jitter::None => delay,
            Jitter::Full => thread_rng().gen_range(0.0..=delay),
            Jitter::Equal => delay / 2.0 + thread_rng().gen_range(0.0..=(delay / 2.0)),
            Jitter::Decorrelated => {
                let prev = self.last_delay.load(Ordering::Relaxed);
                thread_rng().gen_range(base..=(prev * self.config.multiplier))
            }
        };

        Duration::from_secs_f64(jittered)
    }
}
```

### 13.2 Circuit Breaker Integration

**integrations-circuit-breaker Usage:**

```rust
use integrations_circuit_breaker::{CircuitBreaker, CircuitState};

pub struct GoogleDriveCircuitBreakerConfig {
    /// Number of consecutive failures to open circuit
    pub failure_threshold: u32,

    /// Number of consecutive successes to close circuit
    pub success_threshold: u32,

    /// Time to wait before attempting half-open
    pub reset_timeout: Duration,

    /// Time window for failure counting
    pub failure_window: Duration,
}

impl Default for GoogleDriveCircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 3,
            reset_timeout: Duration::from_secs(60),
            failure_window: Duration::from_secs(30),
        }
    }
}
```

**State Transitions:**

```
                    ┌─────────────────┐
                    │     CLOSED      │
                    │                 │
                    │ Success: OK     │
                    │ Failure: Count  │
                    └────────┬────────┘
                             │
         Failures >= threshold
                             │
                             ▼
                    ┌─────────────────┐
                    │      OPEN       │
                    │                 │
                    │ All requests    │
        ┌───────────│ rejected        │
        │           │ immediately     │
        │           └────────┬────────┘
        │                    │
        │      reset_timeout elapsed
        │                    │
        │                    ▼
        │           ┌─────────────────┐
        │           │   HALF_OPEN     │
        │           │                 │
        │           │ Allow limited   │
        │           │ test requests   │
        │           └────────┬────────┘
        │                    │
        │          ┌─────────┴─────────┐
        │          │                   │
        │   Success >= threshold    Any failure
        │          │                   │
        │          ▼                   ▼
        └─────── CLOSED              OPEN
```

**Failure Thresholds:**

| Scenario | Threshold | Reasoning |
|----------|-----------|-----------|
| Normal operation | 5 failures in 30s | Tolerate transient issues |
| High load | 10 failures in 60s | More lenient during load spikes |
| Critical path | 3 failures in 10s | Fail fast for user-facing operations |
| Background tasks | 20 failures in 120s | More tolerant for non-critical work |

**Circuit Breaker Wrapper:**

```rust
pub struct CircuitBreakerExecutor<T> {
    inner: T,
    circuit_breaker: Arc<CircuitBreaker>,
    metrics: Arc<MetricsRecorder>,
}

impl<T: RequestExecutor> RequestExecutor for CircuitBreakerExecutor<T> {
    async fn execute<R>(&self, request: ApiRequest) -> Result<R, GoogleDriveError> {
        // Check circuit state
        match self.circuit_breaker.state() {
            CircuitState::Open => {
                self.metrics.record_circuit_breaker_rejection();
                return Err(GoogleDriveError::Network(
                    NetworkError::ConnectionFailed(
                        "Circuit breaker is open".to_string()
                    )
                ));
            }
            _ => {}
        }

        // Execute request
        let result = self.inner.execute(request).await;

        // Record result in circuit breaker
        match &result {
            Ok(_) => self.circuit_breaker.record_success(),
            Err(e) if e.is_retryable() => self.circuit_breaker.record_failure(),
            Err(_) => {} // Don't count client errors
        }

        // Update metrics
        self.metrics.set_circuit_breaker_state(self.circuit_breaker.state());

        result
    }
}
```

### 13.3 Rate Limit Integration

**integrations-rate-limit Usage:**

```rust
use integrations_rate_limit::{TokenBucket, SlidingWindow};

pub struct GoogleDriveRateLimitConfig {
    /// Maximum requests per 100 seconds per user
    pub user_requests_per_100s: u32,

    /// Maximum requests per day per project
    pub project_requests_per_day: u32,

    /// Maximum concurrent requests
    pub max_concurrent: u32,

    /// Enable pre-emptive throttling
    pub preemptive_throttle: bool,

    /// Throttle threshold (% of limit)
    pub throttle_threshold: f64,
}

impl Default for GoogleDriveRateLimitConfig {
    fn default() -> Self {
        Self {
            user_requests_per_100s: 1000,
            project_requests_per_day: 10_000_000,
            max_concurrent: 10,
            preemptive_throttle: true,
            throttle_threshold: 0.9, // Start throttling at 90% of limit
        }
    }
}
```

**Token Bucket Configuration:**

```
┌─────────────────────────────────────────────────┐
│          Token Bucket (User Limit)              │
│                                                  │
│  Capacity: 1000 tokens                          │
│  Refill Rate: 10 tokens/second                  │
│  Refill Interval: 100ms (1 token)               │
│                                                  │
│  ┌────────────────────────────────────────┐    │
│  │ Tokens: [████████████████░░░░░░] 700   │    │
│  └────────────────────────────────────────┘    │
│                                                  │
│  State:                                          │
│  - Current: 700 tokens                           │
│  - Capacity: 1000 tokens                         │
│  - Last Refill: 2025-12-12T10:00:00Z            │
│  - Next Refill: 2025-12-12T10:00:00.1Z          │
│                                                  │
│  Request Handling:                               │
│  - Cost per request: 1 token                     │
│  - If tokens available: Consume & proceed        │
│  - If tokens unavailable: Wait for refill        │
└─────────────────────────────────────────────────┘
```

**Sliding Window Configuration:**

```
┌─────────────────────────────────────────────────┐
│       Sliding Window (Daily Project Limit)      │
│                                                  │
│  Window Size: 24 hours                          │
│  Max Requests: 10,000,000                       │
│  Bucket Size: 1 hour (24 buckets)              │
│                                                  │
│  Timeline:                                       │
│  ┌────────────────────────────────────────┐    │
│  │ Current Hour     : 450,000 requests    │    │
│  │ Previous Hour    : 420,000 requests    │    │
│  │ 2 Hours Ago      : 390,000 requests    │    │
│  │ ...              : ...                 │    │
│  │ 23 Hours Ago     : 380,000 requests    │    │
│  └────────────────────────────────────────┘    │
│                                                  │
│  Total in Window: 9,500,000 / 10,000,000        │
│  Remaining: 500,000 requests                    │
│                                                  │
│  As time advances:                               │
│  - Oldest bucket slides out                     │
│  - New bucket added for current hour            │
└─────────────────────────────────────────────────┘
```

**Rate Limit State Tracking:**

```rust
pub struct RateLimitTracker {
    user_bucket: Arc<Mutex<TokenBucket>>,
    project_window: Arc<Mutex<SlidingWindow>>,
    concurrent_semaphore: Arc<Semaphore>,
}

impl RateLimitTracker {
    pub async fn acquire(&self) -> RateLimitGuard {
        // Wait for all limits
        let concurrent_permit = self.concurrent_semaphore.acquire().await;
        self.user_bucket.lock().await.acquire(1).await;
        self.project_window.lock().await.record_request();

        RateLimitGuard {
            _permit: concurrent_permit,
        }
    }

    pub async fn should_throttle(&self) -> bool {
        let user_usage = self.user_bucket.lock().await.usage_percent();
        let project_usage = self.project_window.lock().await.usage_percent();

        user_usage > 0.9 || project_usage > 0.9
    }

    pub fn update_from_headers(&self, headers: &HeaderMap) {
        // Extract rate limit info from response headers
        // X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
        if let Some(remaining) = headers.get("x-ratelimit-remaining") {
            if let Ok(val) = remaining.to_str() {
                if let Ok(count) = val.parse::<u32>() {
                    // Update bucket to match server state
                    self.user_bucket.lock().await.set_tokens(count);
                }
            }
        }
    }
}
```

---

## 14. Observability Architecture

### 14.1 Tracing

**Span Attributes Table:**

| Attribute | Type | Always Present | Example |
|-----------|------|----------------|---------|
| `google_drive.service` | string | Yes | "files" |
| `google_drive.operation` | string | Yes | "list" |
| `google_drive.file_id` | string | Conditional | "1a2b3c4d5e" |
| `google_drive.folder_id` | string | Conditional | "folder123" |
| `google_drive.drive_id` | string | Conditional | "drive456" |
| `google_drive.query` | string | Conditional | "'folder123' in parents" |
| `google_drive.page_size` | int | Conditional | 100 |
| `google_drive.upload_type` | string | Conditional | "resumable" |
| `google_drive.upload.bytes` | int | Conditional | 10485760 |
| `google_drive.upload.chunk_size` | int | Conditional | 8388608 |
| `google_drive.download.bytes` | int | Conditional | 5242880 |
| `http.method` | string | Yes | "GET" |
| `http.url` | string | Yes | "https://www.googleapis.com/drive/v3/files" |
| `http.status_code` | int | On completion | 200 |
| `http.request_id` | string | On completion | "abc123xyz" |
| `error.type` | string | On error | "QuotaError::UserRateLimitExceeded" |
| `error.message` | string | On error | "Rate limit exceeded" |
| `error.retryable` | bool | On error | true |
| `retry.attempt` | int | On retry | 2 |
| `retry.delay_ms` | int | On retry | 2000 |

**Parent-Child Relationships:**

```
Root Span: google_drive.operation
│
├─ Child: http.request
│  └─ Child: http.connection (if new connection)
│
├─ Child: auth.get_token (if token refresh needed)
│  └─ Child: http.token_request
│
├─ Child: retry.attempt (if retried)
│  └─ Child: http.request (retry attempt)
│
└─ Child: deserialization (if response parsing)
```

**Example Trace:**

```
Trace ID: 7d1c3a4b2e5f6g8h
│
└─ Span: google_drive.files.list
   │ Duration: 847ms
   │ Attributes:
   │   - google_drive.service: "files"
   │   - google_drive.operation: "list"
   │   - google_drive.query: "'folder123' in parents"
   │   - google_drive.page_size: 100
   │   - http.method: "GET"
   │   - http.status_code: 200
   │
   ├─ Span: auth.get_token
   │  │ Duration: 45ms
   │  │ Attributes:
   │  │   - auth.cached: false
   │  │   - auth.refresh: true
   │  │
   │  └─ Span: http.token_request
   │     │ Duration: 42ms
   │     │ Attributes:
   │     │   - http.method: "POST"
   │     │   - http.url: "https://oauth2.googleapis.com/token"
   │     │   - http.status_code: 200
   │
   ├─ Span: http.request
   │  │ Duration: 320ms
   │  │ Attributes:
   │  │   - http.method: "GET"
   │  │   - http.url: "https://www.googleapis.com/drive/v3/files"
   │  │   - http.status_code: 200
   │  │   - http.request_id: "req_abc123"
   │  │   - http.response_size: 15360
   │
   └─ Span: deserialization
      │ Duration: 12ms
      │ Attributes:
      │   - format: "json"
      │   - item_count: 25
```

### 14.2 Metrics

**Counter Definitions:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `google_drive_requests_total` | service, operation, method, status | Total API requests |
| `google_drive_errors_total` | service, error_type | Total errors by type |
| `google_drive_rate_limit_hits_total` | type | Rate limit hits (user/project) |
| `google_drive_upload_bytes_total` | upload_type | Total bytes uploaded |
| `google_drive_download_bytes_total` | - | Total bytes downloaded |
| `google_drive_pagination_requests_total` | service, operation | Pagination iterations |
| `google_drive_resumable_upload_retries_total` | - | Resumable upload chunk retries |
| `google_drive_circuit_breaker_state_changes_total` | from_state, to_state | Circuit breaker transitions |

**Histogram Definitions:**

| Metric | Labels | Buckets | Description |
|--------|--------|---------|-------------|
| `google_drive_request_duration_seconds` | service, operation, method | 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10 | Request duration |
| `google_drive_upload_duration_seconds` | upload_type | 0.1, 0.5, 1, 5, 10, 30, 60, 120, 300 | Upload duration |
| `google_drive_download_duration_seconds` | - | 0.1, 0.5, 1, 5, 10, 30, 60, 120, 300 | Download duration |
| `google_drive_token_refresh_duration_seconds` | - | 0.01, 0.05, 0.1, 0.5, 1, 2, 5 | Token refresh time |

**Gauge Definitions:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `google_drive_circuit_breaker_state` | - | Circuit state (0=closed, 0.5=half-open, 1=open) |
| `google_drive_concurrent_requests` | - | Current concurrent request count |
| `google_drive_rate_limit_remaining` | type | Remaining rate limit quota |
| `google_drive_storage_quota_used_bytes` | - | Storage quota used |
| `google_drive_storage_quota_limit_bytes` | - | Storage quota limit |

**Label Values:**

- `service`: files, permissions, comments, replies, revisions, changes, drives, about
- `operation`: create, get, list, update, delete, copy, export, upload, download
- `method`: GET, POST, PUT, PATCH, DELETE
- `status`: success, error, timeout, rate_limited
- `error_type`: quota, auth, network, server, request, resource
- `upload_type`: simple, multipart, resumable
- `type`: user, project (for rate limits)

### 14.3 Logging

**Log Levels by Operation Type:**

| Operation | Success Level | Error Level | Notes |
|-----------|---------------|-------------|-------|
| File create/update/delete | INFO | ERROR | User-initiated changes |
| File get/list | DEBUG | WARN | Read operations |
| Upload (< 5MB) | INFO | ERROR | Small uploads |
| Upload (> 5MB) | INFO | ERROR | Log progress every 10% |
| Download (< 5MB) | DEBUG | WARN | Small downloads |
| Download (> 5MB) | INFO | ERROR | Log progress every 10% |
| Permission changes | INFO | ERROR | Security-relevant |
| Token refresh | DEBUG | ERROR | Frequent operation |
| Rate limit hit | WARN | - | Throttling event |
| Circuit breaker open | ERROR | - | Service degradation |
| Retry attempt | DEBUG | - | Retry in progress |

**Structured Log Fields:**

| Field | Type | Always Present | Description |
|-------|------|----------------|-------------|
| `service` | string | Yes | Service name |
| `operation` | string | Yes | Operation name |
| `duration_ms` | integer | On completion | Operation duration |
| `status_code` | integer | On completion | HTTP status |
| `file_id` | string | Conditional | File ID |
| `folder_id` | string | Conditional | Folder ID |
| `error.type` | string | On error | Error category |
| `error.reason` | string | On error | Google API error reason |
| `error.retryable` | boolean | On error | Is retryable |
| `retry.attempt` | integer | On retry | Retry attempt number |
| `retry.max_attempts` | integer | On retry | Max retry attempts |
| `upload.bytes_sent` | integer | On upload | Bytes uploaded |
| `upload.total_size` | integer | On upload | Total upload size |
| `upload.progress_pct` | float | On upload progress | Upload progress % |
| `upload.upload_id` | string | Resumable upload | Upload session ID |
| `download.bytes_received` | integer | On download | Bytes downloaded |
| `download.total_size` | integer | On download | Total download size |
| `request_id` | string | On completion | Google request ID |
| `trace_id` | string | Yes | Distributed trace ID |
| `span_id` | string | Yes | Current span ID |

**Example Log Entries:**

```json
{
  "timestamp": "2025-12-12T10:15:30.123Z",
  "level": "INFO",
  "message": "File created successfully",
  "service": "files",
  "operation": "create",
  "file_id": "1a2b3c4d5e",
  "file_name": "document.pdf",
  "duration_ms": 245,
  "status_code": 200,
  "request_id": "req_abc123",
  "trace_id": "7d1c3a4b2e5f6g8h",
  "span_id": "span_xyz789"
}

{
  "timestamp": "2025-12-12T10:15:35.456Z",
  "level": "WARN",
  "message": "Rate limit exceeded, retrying after delay",
  "service": "files",
  "operation": "list",
  "error.type": "QuotaError::UserRateLimitExceeded",
  "error.retryable": true,
  "retry.attempt": 1,
  "retry.max_attempts": 5,
  "retry.delay_ms": 60000,
  "request_id": "req_def456",
  "trace_id": "8e2d4b5c3f6g7h9i",
  "span_id": "span_uvw123"
}

{
  "timestamp": "2025-12-12T10:16:00.789Z",
  "level": "INFO",
  "message": "Resumable upload progress",
  "service": "files",
  "operation": "upload",
  "upload.type": "resumable",
  "upload.bytes_sent": 52428800,
  "upload.total_size": 104857600,
  "upload.progress_pct": 50.0,
  "upload.upload_id": "upload_xyz789",
  "trace_id": "9f3e5c6d4g7h8i0j",
  "span_id": "span_rst456"
}
```

---

## 15. Security Architecture

### 15.1 SecretString Usage

**Rust Implementation:**

```rust
use secrecy::{Secret, ExposeSecret, Zeroize};

// All credentials wrapped in Secret<String>
pub struct OAuth2Credentials {
    pub client_id: String,  // Not secret
    pub client_secret: Secret<String>,  // Secret
    pub refresh_token: Secret<String>,  // Secret
}

pub struct ServiceAccountCredentials {
    pub client_email: String,  // Not secret
    pub private_key: Secret<String>,  // Secret - zeroized on drop
    pub project_id: Option<String>,  // Not secret
}

// Debug implementation redacts secrets
impl std::fmt::Debug for OAuth2Credentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OAuth2Credentials")
            .field("client_id", &self.client_id)
            .field("client_secret", &"[REDACTED]")
            .field("refresh_token", &"[REDACTED]")
            .finish()
    }
}

// No Display implementation for credentials
// (prevents accidental logging via println, etc.)
```

**TypeScript Implementation:**

```typescript
// Use Symbol for private fields
const SECRET = Symbol('secret');

export class SecretString {
  private [SECRET]: string;

  constructor(value: string) {
    this[SECRET] = value;
  }

  expose(): string {
    return this[SECRET];
  }

  // Redact in JSON serialization
  toJSON(): string {
    return '[REDACTED]';
  }

  // Redact in string conversion
  toString(): string {
    return '[REDACTED]';
  }

  // Zero memory on finalization (if supported)
  finalize(): void {
    if (this[SECRET]) {
      // Overwrite with zeros (best effort)
      this[SECRET] = '\0'.repeat(this[SECRET].length);
    }
  }
}

export interface OAuth2Credentials {
  clientId: string;  // Not secret
  clientSecret: SecretString;  // Secret
  refreshToken: SecretString;  // Secret
}
```

### 15.2 TLS Enforcement

**TLS Configuration:**

```rust
use reqwest::ClientBuilder;

pub fn create_http_client() -> Result<reqwest::Client, ConfigurationError> {
    ClientBuilder::new()
        // Enforce TLS 1.2+ only
        .min_tls_version(reqwest::tls::Version::TLS_1_2)

        // Enable certificate validation (default, but explicit)
        .danger_accept_invalid_certs(false)
        .danger_accept_invalid_hostnames(false)

        // Use system certificate store
        .use_rustls_tls()

        // Set timeout
        .timeout(Duration::from_secs(300))

        // Connection pooling
        .pool_max_idle_per_host(10)
        .pool_idle_timeout(Duration::from_secs(90))

        // Enable HTTP/2
        .http2_prior_knowledge()

        .build()
        .map_err(|e| ConfigurationError::HttpClientCreationFailed(e.to_string()))
}
```

**Certificate Pinning (Optional):**

```rust
// For high-security environments, pin Google's certificates
pub fn create_pinned_client() -> Result<reqwest::Client, ConfigurationError> {
    // Load Google's root certificates
    let google_roots = load_google_root_certificates()?;

    ClientBuilder::new()
        .min_tls_version(reqwest::tls::Version::TLS_1_2)
        .add_root_certificate(google_roots)
        .danger_accept_invalid_certs(false)
        .build()
        .map_err(|e| ConfigurationError::HttpClientCreationFailed(e.to_string()))
}
```

### 15.3 Token Storage Security

**In-Memory Token Cache:**

```rust
pub struct SecureTokenCache {
    // Tokens stored in memory with encryption at rest
    cache: Arc<Mutex<HashMap<String, EncryptedToken>>>,

    // Encryption key (derived from environment or key management service)
    encryption_key: Secret<[u8; 32]>,
}

struct EncryptedToken {
    ciphertext: Vec<u8>,
    nonce: Vec<u8>,
    expires_at: DateTime<Utc>,
}

impl SecureTokenCache {
    pub fn store(&self, key: String, token: AccessToken) -> Result<(), CacheError> {
        let mut cache = self.cache.lock().unwrap();

        // Encrypt token before storing
        let encrypted = self.encrypt_token(&token)?;

        cache.insert(key, encrypted);
        Ok(())
    }

    pub fn retrieve(&self, key: &str) -> Result<Option<AccessToken>, CacheError> {
        let cache = self.cache.lock().unwrap();

        if let Some(encrypted) = cache.get(key) {
            // Check expiration
            if Utc::now() >= encrypted.expires_at {
                return Ok(None);
            }

            // Decrypt token
            let token = self.decrypt_token(encrypted)?;
            Ok(Some(token))
        } else {
            Ok(None)
        }
    }

    fn encrypt_token(&self, token: &AccessToken) -> Result<EncryptedToken, CacheError> {
        // Use ChaCha20-Poly1305 for authenticated encryption
        use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
        use chacha20poly1305::aead::{Aead, NewAead};

        let cipher = ChaCha20Poly1305::new(Key::from_slice(self.encryption_key.expose_secret()));
        let nonce = Nonce::from_slice(b"unique nonce"); // Generate unique nonce

        let plaintext = serde_json::to_vec(token)?;
        let ciphertext = cipher.encrypt(nonce, plaintext.as_ref())
            .map_err(|e| CacheError::EncryptionFailed(e.to_string()))?;

        Ok(EncryptedToken {
            ciphertext,
            nonce: nonce.to_vec(),
            expires_at: token.expires_at,
        })
    }
}
```

**Persistent Storage (Optional):**

```rust
// For long-lived tokens (refresh tokens), use OS keychain
pub struct KeychainTokenStore {
    service_name: String,
}

impl KeychainTokenStore {
    pub fn store_refresh_token(&self, account: &str, token: &Secret<String>) -> Result<(), KeychainError> {
        // Use platform-specific keychain
        #[cfg(target_os = "macos")]
        {
            // Use macOS Keychain
            keychain::macos::store(
                &self.service_name,
                account,
                token.expose_secret()
            )?;
        }

        #[cfg(target_os = "linux")]
        {
            // Use Secret Service (GNOME Keyring, KWallet)
            keychain::linux::store(
                &self.service_name,
                account,
                token.expose_secret()
            )?;
        }

        #[cfg(target_os = "windows")]
        {
            // Use Windows Credential Manager
            keychain::windows::store(
                &self.service_name,
                account,
                token.expose_secret()
            )?;
        }

        Ok(())
    }
}
```

### 15.4 Service Account Key Protection

**Private Key Handling:**

```rust
pub struct ServiceAccountPrivateKey {
    // Private key in PEM format
    key: Secret<String>,

    // Never log or display
    _phantom: PhantomData<()>,
}

impl ServiceAccountPrivateKey {
    pub fn from_pem(pem: String) -> Result<Self, AuthError> {
        // Validate PEM format
        if !pem.starts_with("-----BEGIN PRIVATE KEY-----") {
            return Err(AuthError::InvalidPrivateKey("Invalid PEM format".to_string()));
        }

        Ok(Self {
            key: Secret::new(pem),
            _phantom: PhantomData,
        })
    }

    pub fn from_file(path: &Path) -> Result<Self, AuthError> {
        // Read from file with restricted permissions
        let metadata = fs::metadata(path)?;

        // Ensure file has secure permissions (Unix)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = metadata.permissions().mode();
            if mode & 0o077 != 0 {
                return Err(AuthError::InsecureKeyFilePermissions(
                    "Private key file should have mode 0600".to_string()
                ));
            }
        }

        let pem = fs::read_to_string(path)?;
        Self::from_pem(pem)
    }

    pub fn sign(&self, message: &[u8]) -> Result<Vec<u8>, AuthError> {
        // Sign using RSA-SHA256
        use rsa::{RsaPrivateKey, PaddingScheme};
        use sha2::{Sha256, Digest};

        // Parse PEM
        let key = RsaPrivateKey::from_pkcs8_pem(self.key.expose_secret())
            .map_err(|e| AuthError::InvalidPrivateKey(e.to_string()))?;

        // Hash message
        let mut hasher = Sha256::new();
        hasher.update(message);
        let digest = hasher.finalize();

        // Sign
        let signature = key.sign(PaddingScheme::PKCS1v15Sign { hash: Some(rsa::Hash::SHA2_256) }, &digest)
            .map_err(|e| AuthError::SigningFailed(e.to_string()))?;

        Ok(signature)
    }
}

// Zero private key on drop
impl Drop for ServiceAccountPrivateKey {
    fn drop(&mut self) {
        // Secrecy crate handles zeroization
    }
}

// Never serialize private keys
impl Serialize for ServiceAccountPrivateKey {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str("[REDACTED]")
    }
}
```

**Key Rotation Support:**

```rust
pub struct RotatableServiceAccount {
    // Current active key
    current: ServiceAccountPrivateKey,

    // Previous key (for graceful rotation)
    previous: Option<ServiceAccountPrivateKey>,

    // Key rotation deadline
    rotate_before: DateTime<Utc>,
}

impl RotatableServiceAccount {
    pub fn rotate(&mut self, new_key: ServiceAccountPrivateKey) {
        self.previous = Some(std::mem::replace(&mut self.current, new_key));
        self.rotate_before = Utc::now() + Duration::days(90);
    }

    pub fn sign(&self, message: &[u8]) -> Result<Vec<u8>, AuthError> {
        // Always try current key first
        match self.current.sign(message) {
            Ok(sig) => Ok(sig),
            Err(_) if self.previous.is_some() => {
                // Fallback to previous key during rotation window
                self.previous.as_ref().unwrap().sign(message)
            }
            Err(e) => Err(e),
        }
    }
}
```

---

## 16. Configuration Schema

### 16.1 GoogleDriveConfig Fields

```rust
pub struct GoogleDriveConfig {
    // Authentication
    pub auth: AuthConfig,

    // API endpoints
    pub base_url: Url,
    pub upload_url: Url,

    // Timeouts
    pub timeout: Duration,
    pub connect_timeout: Duration,
    pub token_refresh_timeout: Duration,

    // Retry configuration
    pub max_retries: u32,
    pub retry_config: RetryConfig,

    // Circuit breaker configuration
    pub circuit_breaker: Option<CircuitBreakerConfig>,

    // Rate limiting configuration
    pub rate_limit: Option<RateLimitConfig>,

    // Upload/download settings
    pub upload_chunk_size: usize,
    pub download_buffer_size: usize,
    pub max_concurrent_uploads: usize,

    // Connection pooling
    pub max_idle_connections: usize,
    pub idle_timeout: Duration,

    // User agent
    pub user_agent: String,

    // Default fields for responses
    pub default_fields: Option<String>,

    // Enable features
    pub enable_tracing: bool,
    pub enable_metrics: bool,
}

pub enum AuthConfig {
    OAuth2(OAuth2Config),
    ServiceAccount(ServiceAccountConfig),
}

pub struct OAuth2Config {
    pub client_id: String,
    pub client_secret: Secret<String>,
    pub refresh_token: Secret<String>,
    pub token_uri: Url,
    pub scopes: Vec<String>,
}

pub struct ServiceAccountConfig {
    pub client_email: String,
    pub private_key: ServiceAccountPrivateKey,
    pub project_id: Option<String>,
    pub token_uri: Url,
    pub scopes: Vec<String>,
    pub subject: Option<String>,  // For domain-wide delegation
}
```

### 16.2 Environment Variables

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `GOOGLE_DRIVE_CLIENT_ID` | string | OAuth2 | - | OAuth 2.0 client ID |
| `GOOGLE_DRIVE_CLIENT_SECRET` | string | OAuth2 | - | OAuth 2.0 client secret |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | string | OAuth2 | - | OAuth 2.0 refresh token |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL` | string | Service Account | - | Service account email |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY` | string | Service Account | - | Service account private key (PEM) |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY_FILE` | path | Service Account | - | Path to service account key file |
| `GOOGLE_DRIVE_PROJECT_ID` | string | No | - | Google Cloud project ID |
| `GOOGLE_DRIVE_SUBJECT` | string | No | - | Subject for domain-wide delegation |
| `GOOGLE_DRIVE_SCOPES` | string | No | "drive" | Comma-separated OAuth scopes |
| `GOOGLE_DRIVE_BASE_URL` | url | No | googleapis.com | API base URL |
| `GOOGLE_DRIVE_TIMEOUT` | duration | No | 300s | Request timeout |
| `GOOGLE_DRIVE_MAX_RETRIES` | int | No | 3 | Maximum retry attempts |
| `GOOGLE_DRIVE_UPLOAD_CHUNK_SIZE` | bytes | No | 8MB | Resumable upload chunk size |
| `GOOGLE_DRIVE_MAX_CONCURRENT` | int | No | 10 | Max concurrent requests |
| `GOOGLE_DRIVE_ENABLE_TRACING` | bool | No | true | Enable distributed tracing |
| `GOOGLE_DRIVE_ENABLE_METRICS` | bool | No | true | Enable metrics collection |

### 16.3 Defaults Table

| Configuration | Default Value | Min | Max | Units |
|---------------|---------------|-----|-----|-------|
| `base_url` | https://www.googleapis.com/drive/v3 | - | - | - |
| `upload_url` | https://www.googleapis.com/upload/drive/v3 | - | - | - |
| `timeout` | 300 | 1 | 3600 | seconds |
| `connect_timeout` | 10 | 1 | 60 | seconds |
| `token_refresh_timeout` | 30 | 5 | 300 | seconds |
| `max_retries` | 3 | 0 | 10 | attempts |
| `retry_base_delay` | 1 | 0.1 | 60 | seconds |
| `retry_max_delay` | 60 | 1 | 600 | seconds |
| `retry_multiplier` | 2.0 | 1.0 | 10.0 | - |
| `upload_chunk_size` | 8388608 | 262144 | - | bytes (256KB-unlimited) |
| `download_buffer_size` | 65536 | 4096 | 1048576 | bytes (4KB-1MB) |
| `max_concurrent_uploads` | 3 | 1 | 10 | - |
| `max_idle_connections` | 10 | 1 | 100 | - |
| `idle_timeout` | 90 | 10 | 600 | seconds |
| `circuit_breaker_failure_threshold` | 5 | 1 | 100 | failures |
| `circuit_breaker_success_threshold` | 3 | 1 | 20 | successes |
| `circuit_breaker_reset_timeout` | 60 | 5 | 600 | seconds |
| `rate_limit_user_per_100s` | 1000 | 1 | 10000 | requests |
| `rate_limit_project_per_day` | 10000000 | 1000 | - | requests |
| `user_agent` | integrations-google-drive/{version} | - | - | - |

### 16.4 Validation Rules

```rust
impl GoogleDriveConfig {
    pub fn validate(&self) -> Result<(), ConfigurationError> {
        // Validate URLs
        if self.base_url.scheme() != "https" {
            return Err(ConfigurationError::InvalidUrl(
                "base_url must use HTTPS".to_string()
            ));
        }

        if self.upload_url.scheme() != "https" {
            return Err(ConfigurationError::InvalidUrl(
                "upload_url must use HTTPS".to_string()
            ));
        }

        // Validate timeouts
        if self.timeout.as_secs() < 1 || self.timeout.as_secs() > 3600 {
            return Err(ConfigurationError::InvalidTimeout(
                "timeout must be between 1s and 3600s".to_string()
            ));
        }

        // Validate upload chunk size (must be multiple of 256KB)
        if self.upload_chunk_size % (256 * 1024) != 0 {
            return Err(ConfigurationError::InvalidChunkSize(
                "upload_chunk_size must be a multiple of 256KB".to_string()
            ));
        }

        if self.upload_chunk_size < 256 * 1024 {
            return Err(ConfigurationError::InvalidChunkSize(
                "upload_chunk_size must be at least 256KB".to_string()
            ));
        }

        // Validate retry configuration
        if self.max_retries > 10 {
            return Err(ConfigurationError::InvalidRetryConfig(
                "max_retries cannot exceed 10".to_string()
            ));
        }

        // Validate auth configuration
        self.auth.validate()?;

        Ok(())
    }
}

impl AuthConfig {
    fn validate(&self) -> Result<(), ConfigurationError> {
        match self {
            AuthConfig::OAuth2(config) => {
                if config.client_id.is_empty() {
                    return Err(ConfigurationError::MissingCredentials(
                        "client_id".to_string()
                    ));
                }

                if config.scopes.is_empty() {
                    return Err(ConfigurationError::MissingScope(
                        "At least one scope is required".to_string()
                    ));
                }

                Ok(())
            }
            AuthConfig::ServiceAccount(config) => {
                if config.client_email.is_empty() {
                    return Err(ConfigurationError::MissingCredentials(
                        "client_email".to_string()
                    ));
                }

                if !config.client_email.ends_with(".gserviceaccount.com") {
                    return Err(ConfigurationError::InvalidCredentials(
                        "Service account email must end with .gserviceaccount.com".to_string()
                    ));
                }

                if config.scopes.is_empty() {
                    return Err(ConfigurationError::MissingScope(
                        "At least one scope is required".to_string()
                    ));
                }

                Ok(())
            }
        }
    }
}
```

---

## 17. Testing Architecture

### 17.1 Mock Patterns

**Test Doubles Hierarchy:**

```
Test Doubles
│
├─ Fake (functional implementation)
│  ├─ FakeFilesService (in-memory file storage)
│  ├─ FakeAuthProvider (always returns valid token)
│  └─ FakeHttpTransport (in-memory HTTP simulator)
│
├─ Stub (returns canned responses)
│  ├─ StubFilesService (returns predefined files)
│  ├─ StubAuthProvider (returns fixed token)
│  └─ StubHttpTransport (returns fixed responses)
│
├─ Mock (verifiable expectations)
│  ├─ MockFilesService (verifies method calls)
│  ├─ MockAuthProvider (verifies token requests)
│  └─ MockHttpTransport (verifies HTTP calls)
│
└─ Spy (records interactions)
   ├─ SpyFilesService (wraps real service, records calls)
   ├─ SpyAuthProvider (wraps real auth, records refreshes)
   └─ SpyHttpTransport (wraps real HTTP, records requests)
```

**Mock Implementation Example:**

```rust
pub struct MockFilesService {
    expectations: Vec<Expectation>,
    calls: Vec<Call>,
}

pub struct Expectation {
    method: &'static str,
    matcher: Box<dyn Fn(&Call) -> bool>,
    response: Result<serde_json::Value, GoogleDriveError>,
    times: ExpectedTimes,
}

pub enum ExpectedTimes {
    Once,
    Exactly(usize),
    AtLeast(usize),
    AtMost(usize),
    Between(usize, usize),
    Any,
}

impl MockFilesService {
    pub fn expect_get(&mut self, file_id: impl Into<String>) -> &mut Expectation {
        let file_id = file_id.into();
        let exp = Expectation {
            method: "get",
            matcher: Box::new(move |call| {
                call.method == "get" && call.args.get("file_id") == Some(&file_id)
            }),
            response: Ok(json!({"id": file_id, "name": "test.txt"})),
            times: ExpectedTimes::Once,
        };
        self.expectations.push(exp);
        self.expectations.last_mut().unwrap()
    }

    pub fn verify(&self) {
        for exp in &self.expectations {
            let matching_calls = self.calls.iter()
                .filter(|call| (exp.matcher)(call))
                .count();

            match exp.times {
                ExpectedTimes::Once => assert_eq!(matching_calls, 1),
                ExpectedTimes::Exactly(n) => assert_eq!(matching_calls, n),
                ExpectedTimes::AtLeast(n) => assert!(matching_calls >= n),
                ExpectedTimes::AtMost(n) => assert!(matching_calls <= n),
                ExpectedTimes::Between(min, max) => {
                    assert!(matching_calls >= min && matching_calls <= max)
                }
                ExpectedTimes::Any => {}
            }
        }
    }
}
```

### 17.2 Test Doubles

**Fake HTTP Transport:**

```rust
pub struct FakeHttpTransport {
    // In-memory request/response mapping
    routes: HashMap<RouteKey, ResponseBuilder>,

    // Request history
    requests: Arc<Mutex<Vec<HttpRequest>>>,
}

#[derive(Hash, Eq, PartialEq)]
struct RouteKey {
    method: HttpMethod,
    path_pattern: String,
}

impl FakeHttpTransport {
    pub fn new() -> Self {
        Self {
            routes: HashMap::new(),
            requests: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn route(
        &mut self,
        method: HttpMethod,
        path: impl Into<String>,
    ) -> &mut ResponseBuilder {
        let key = RouteKey {
            method,
            path_pattern: path.into(),
        };
        self.routes.entry(key).or_insert_with(ResponseBuilder::new)
    }

    pub fn get_requests(&self) -> Vec<HttpRequest> {
        self.requests.lock().unwrap().clone()
    }
}

#[async_trait]
impl HttpTransport for FakeHttpTransport {
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError> {
        // Record request
        self.requests.lock().unwrap().push(request.clone());

        // Find matching route
        let key = RouteKey {
            method: request.method.clone(),
            path_pattern: request.url.path().to_string(),
        };

        if let Some(builder) = self.routes.get(&key) {
            Ok(builder.build())
        } else {
            Err(TransportError::NotFound(
                format!("No route configured for {} {}", request.method, request.url)
            ))
        }
    }
}
```

### 17.3 Integration Test Setup

**Test Fixtures:**

```rust
pub struct GoogleDriveTestFixture {
    pub client: Arc<dyn GoogleDriveClient>,
    pub test_folder_id: String,
    pub created_files: Vec<String>,
    pub config: GoogleDriveConfig,
}

impl GoogleDriveTestFixture {
    pub async fn setup() -> Result<Self, GoogleDriveError> {
        // Load credentials from environment
        let config = GoogleDriveConfig::from_env()?;

        // Create client
        let client = GoogleDriveClientBuilder::new()
            .with_config(config.clone())
            .build()?;

        // Create test folder
        let test_folder = client.files().create_folder(CreateFolderRequest {
            name: format!("test-{}", Uuid::new_v4()),
            parents: None,
        }).await?;

        Ok(Self {
            client,
            test_folder_id: test_folder.id.clone(),
            created_files: vec![test_folder.id],
            config,
        })
    }

    pub async fn create_test_file(
        &mut self,
        name: impl Into<String>,
        content: impl Into<Bytes>,
    ) -> Result<File, GoogleDriveError> {
        let file = self.client.files().create_multipart(CreateMultipartRequest {
            name: name.into(),
            parents: vec![self.test_folder_id.clone()],
            content: content.into(),
            content_mime_type: "text/plain".to_string(),
        }).await?;

        self.created_files.push(file.id.clone());
        Ok(file)
    }

    pub async fn teardown(self) -> Result<(), GoogleDriveError> {
        // Delete all created files
        for file_id in self.created_files.iter().rev() {
            let _ = self.client.files().delete(file_id, None).await;
        }

        Ok(())
    }
}

// Usage in tests
#[tokio::test]
async fn test_file_operations() {
    let mut fixture = GoogleDriveTestFixture::setup().await.unwrap();

    // Test file creation
    let file = fixture.create_test_file("test.txt", "Hello, World!").await.unwrap();
    assert_eq!(file.name, "test.txt");

    // Test file retrieval
    let retrieved = fixture.client.files().get(&file.id, None).await.unwrap();
    assert_eq!(retrieved.id, file.id);

    // Cleanup
    fixture.teardown().await.unwrap();
}
```

**Test Categories:**

| Category | Tools | Purpose | Example |
|----------|-------|---------|---------|
| Unit Tests | Mocks | Test single components | Test error mapping |
| Integration Tests | Real API | Test end-to-end flows | Test file upload |
| Contract Tests | Recorded responses | Verify API compatibility | Test response schema |
| Performance Tests | Load generators | Measure throughput/latency | Test concurrent uploads |
| Fuzz Tests | Random inputs | Find edge cases | Test query parser |
| Snapshot Tests | Golden files | Catch unintended changes | Test serialization |

---

## 18. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial architecture document (Part 3) |

---

**End of Architecture Phase (Part 3)**

This completes the third part of the architecture document covering concurrency patterns, error propagation, resilience integration, observability architecture, security architecture, configuration schema, and testing architecture.

The architecture provides:
- **Async/await patterns** for efficient I/O handling
- **Comprehensive error hierarchy** with retryable classification
- **Resilience primitives integration** (retry, circuit breaker, rate limiting)
- **Full observability** with tracing, metrics, and structured logging
- **Security best practices** for credential handling and TLS enforcement
- **Flexible configuration** with validation and environment variable support
- **Testable design** with mock patterns and test fixtures

*Next Phase: Implementation of the components following this architecture.*
