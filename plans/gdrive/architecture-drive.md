# Google Drive Integration Module - Architecture Document

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/google-drive`

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [C4 Model Diagrams](#2-c4-model-diagrams)
3. [Module Structure](#3-module-structure)
4. [Data Flow](#4-data-flow)
5. [State Management](#5-state-management)
6. [Concurrency Patterns](#6-concurrency-patterns)
7. [Error Propagation](#7-error-propagation)
8. [Integration with Primitives](#8-integration-with-primitives)
9. [Security Architecture](#9-security-architecture)
10. [Testing Architecture](#10-testing-architecture)
11. [Observability](#11-observability)
12. [Deployment Considerations](#12-deployment-considerations)

---

## 1. System Overview

### 1.1 High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Application Layer                           │
│                  (Consumer Code - Rust/TypeScript)                  │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │
                                      │ uses
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Google Drive Integration Module                    │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │
│  │GoogleDrive   │  │    Auth      │  │  Transport   │             │
│  │   Client     │──│  Provider    │──│   Layer      │             │
│  └──────┬───────┘  └──────────────┘  └──────┬───────┘             │
│         │                                     │                     │
│         │ delegates to                        │                     │
│         ▼                                     │                     │
│  ┌──────────────────────────────────┐        │                     │
│  │       Service Layer              │        │                     │
│  │  ┌────────┬────────┬──────────┐ │        │                     │
│  │  │ Files  │Perms   │Comments  │ │        │                     │
│  │  ├────────┼────────┼──────────┤ │        │                     │
│  │  │Replies │Revs    │Changes   │ │        │                     │
│  │  ├────────┼────────┼──────────┤ │        │                     │
│  │  │Drives  │About   │          │ │        │                     │
│  │  └────────┴────────┴──────────┘ │        │                     │
│  └──────────────┬───────────────────┘        │                     │
│                 │                             │                     │
│  ┌──────────────┴─────────────────────────────┴──────────────────┐ │
│  │              Resilience & Observability Layer                 │ │
│  │  ┌──────────┬────────────┬───────────┬─────────────────────┐ │ │
│  │  │  Retry   │  Circuit   │   Rate    │  Tracing & Logging  │ │ │
│  │  │  Logic   │  Breaker   │  Limiter  │                     │ │ │
│  │  └──────────┴────────────┴───────────┴─────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────┬───────────────────────────────┘
                                      │ HTTPS
                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Google Drive API v3                            │
│     https://www.googleapis.com/drive/v3                             │
│     https://www.googleapis.com/upload/drive/v3                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **GoogleDriveClient** | Primary entry point; coordinates service access; manages configuration |
| **AuthProvider** | Handles OAuth 2.0 and Service Account authentication; manages token lifecycle |
| **Transport Layer** | HTTP request/response handling; connection pooling; streaming support |
| **FilesService** | File CRUD operations, uploads (simple, multipart, resumable), downloads, export |
| **PermissionsService** | Sharing, access control, permission management |
| **CommentsService** | Comment creation and management on files |
| **RepliesService** | Replies to comments |
| **RevisionsService** | Access to file revision history |
| **ChangesService** | Change tracking and push notifications |
| **DrivesService** | Shared drives (Team Drives) management |
| **AboutService** | Storage quota, user info, supported formats |
| **Resilience Layer** | Retry logic, circuit breaker, rate limiting |
| **Observability Layer** | Distributed tracing, metrics emission, structured logging |

### 1.3 External Dependencies

| Dependency | Purpose | Type |
|------------|---------|------|
| `integrations-errors` | Base error types and traits | Internal Primitive |
| `integrations-retry` | Retry execution with backoff | Internal Primitive |
| `integrations-circuit-breaker` | Circuit breaker state machine | Internal Primitive |
| `integrations-rate-limit` | Rate limiting (token bucket, sliding window) | Internal Primitive |
| `integrations-tracing` | Distributed tracing abstraction | Internal Primitive |
| `integrations-logging` | Structured logging abstraction | Internal Primitive |
| `tokio` / Node.js | Async runtime | External |
| `reqwest` / `fetch` | HTTP client | External |
| `serde` / `zod` | Serialization/validation | External |
| `jsonwebtoken` / `jose` | JWT for Service Accounts | External |

---

## 2. C4 Model Diagrams

### 2.1 Context Diagram (Level 1)

```
                                    ┌──────────────────┐
                                    │                  │
                                    │   Application    │
                                    │   (Your Code)    │
                                    │                  │
                                    └────────┬─────────┘
                                             │
                                             │ uses API
                                             ▼
                    ┌────────────────────────────────────────────┐
                    │                                            │
                    │     Google Drive Integration Module       │
                    │                                            │
                    │  Provides type-safe access to Google      │
                    │  Drive API v3 with resilience patterns    │
                    │                                            │
                    └────────┬──────────────────────┬────────────┘
                             │                      │
                       calls │                      │ uses
                             ▼                      ▼
              ┌──────────────────────┐    ┌──────────────────────┐
              │                      │    │                      │
              │  Google Drive API    │    │  Integration         │
              │        (v3)          │    │  Primitives          │
              │                      │    │  (retry, circuit     │
              │  REST over HTTPS     │    │   breaker, etc.)     │
              │                      │    │                      │
              └──────────────────────┘    └──────────────────────┘
```

### 2.2 Container Diagram (Level 2)

```
┌───────────────────────────────────────────────────────────────────────┐
│                    Google Drive Integration Module                    │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                    Rust Crate                                 │    │
│  │              integrations-google-drive                        │    │
│  │                                                                │    │
│  │  - Trait-based design for testability                         │    │
│  │  - Zero-cost abstractions                                     │    │
│  │  - Async/await with tokio                                     │    │
│  │  - Type-safe API with builder patterns                        │    │
│  │  - SecretString for credentials                               │    │
│  │                                                                │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │                 TypeScript Package                            │    │
│  │            @integrations/google-drive                         │    │
│  │                                                                │    │
│  │  - Interface-based design for testability                     │    │
│  │  - Promise-based async API                                    │    │
│  │  - Zod runtime validation                                     │    │
│  │  - Type-safe with TypeScript generics                         │    │
│  │  - AsyncIterator for pagination                               │    │
│  │                                                                │    │
│  └──────────────────────────────────────────────────────────────┘    │
│                                                                        │
└───────────────────────────────────────────────────────────────────────┘
```

### 2.3 Component Diagram (Level 3)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        GoogleDriveClient                               │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                      Configuration                                │ │
│  │  - AuthProvider (OAuth2 or ServiceAccount)                       │ │
│  │  - Base URLs (api.googleapis.com)                                │ │
│  │  - Timeouts, retries, circuit breaker config                     │ │
│  │  - Upload chunk size, rate limits                                │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                    Service Registry                               │ │
│  │                                                                    │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                 │ │
│  │  │  Files     │  │ Permissions│  │  Comments  │                 │ │
│  │  │  Service   │  │  Service   │  │  Service   │                 │ │
│  │  └────────────┘  └────────────┘  └────────────┘                 │ │
│  │                                                                    │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                 │ │
│  │  │  Replies   │  │ Revisions  │  │  Changes   │                 │ │
│  │  │  Service   │  │  Service   │  │  Service   │                 │ │
│  │  └────────────┘  └────────────┘  └────────────┘                 │ │
│  │                                                                    │ │
│  │  ┌────────────┐  ┌────────────┐                                  │ │
│  │  │  Drives    │  │   About    │                                  │ │
│  │  │  Service   │  │  Service   │                                  │ │
│  │  └────────────┘  └────────────┘                                  │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                    Shared Components                              │ │
│  │                                                                    │ │
│  │  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐ │ │
│  │  │ HttpTransport   │  │  AuthProvider    │  │  Pagination    │ │ │
│  │  │  - reqwest/fetch│  │  - OAuth2        │  │  - Iterator    │ │ │
│  │  │  - Connection   │  │  - ServiceAcct   │  │  - Streaming   │ │ │
│  │  │    pooling      │  │  - Token cache   │  │                │ │ │
│  │  └─────────────────┘  └──────────────────┘  └────────────────┘ │ │
│  │                                                                    │ │
│  │  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐ │ │
│  │  │  Error Mapper   │  │  Retry Executor  │  │ Circuit Breaker│ │ │
│  │  │  - HTTP → Domain│  │  - Backoff       │  │ - State machine│ │ │
│  │  │  - Retryability │  │  - Retry-After   │  │ - Trip/Reset   │ │ │
│  │  └─────────────────┘  └──────────────────┘  └────────────────┘ │ │
│  │                                                                    │ │
│  │  ┌─────────────────┐  ┌──────────────────┐                       │ │
│  │  │  Rate Limiter   │  │  Observability   │                       │ │
│  │  │  - Token bucket │  │  - Tracing       │                       │ │
│  │  │  - Sliding win  │  │  - Metrics       │                       │ │
│  │  │  - Throttling   │  │  - Logging       │                       │ │
│  │  └─────────────────┘  └──────────────────┘                       │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Service Interaction Diagram

```
┌──────────┐                                                    ┌──────────┐
│          │  1. client.files().list(params)                   │          │
│  Client  │───────────────────────────────────────────────────▶│  Files   │
│   Code   │                                                    │ Service  │
│          │                                                    │          │
└──────────┘                                                    └────┬─────┘
                                                                     │
                                                                     │ 2. get_access_token()
                                                                     ▼
                                                              ┌─────────────┐
                                                              │    Auth     │
                                                              │  Provider   │
                                                              └──────┬──────┘
                                                                     │
                                                                     │ 3. (returns token)
                                                                     ▼
                                                              ┌─────────────┐
                                                              │  Resilience │
                                                              │    Layer    │
                                                              │ (retry/cb)  │
                                                              └──────┬──────┘
                                                                     │
                                                                     │ 4. execute_with_resilience()
                                                                     ▼
                                                              ┌─────────────┐
                                                              │    HTTP     │
                                                              │  Transport  │
                                                              └──────┬──────┘
                                                                     │
                                                                     │ 5. HTTPS GET
                                                                     ▼
                                                              ┌─────────────┐
                                                              │   Google    │
                                                              │  Drive API  │
                                                              └──────┬──────┘
                                                                     │
                                                                     │ 6. JSON response
                                                                     ▼
                                                              ┌─────────────┐
                                                              │  Response   │
                                                              │   Parser    │
                                                              └──────┬──────┘
                                                                     │
                                                                     │ 7. FileList
                                                                     ▼
┌──────────┐                                                  ┌─────────────┐
│          │  8. Result<FileList>                            │   Files     │
│  Client  │◀────────────────────────────────────────────────│  Service    │
│   Code   │                                                  │             │
└──────────┘                                                  └─────────────┘
```

---

## 3. Module Structure

### 3.1 Rust Crate Organization

```
google-drive/rust/
├── Cargo.toml
├── README.md
├── examples/
│   ├── simple_upload.rs
│   ├── resumable_upload.rs
│   ├── list_files.rs
│   ├── share_file.rs
│   └── oauth2_flow.rs
├── tests/
│   ├── integration/
│   │   ├── mod.rs
│   │   ├── files_tests.rs
│   │   ├── permissions_tests.rs
│   │   ├── upload_tests.rs
│   │   └── auth_tests.rs
│   └── mock/
│       ├── mod.rs
│       └── mock_transport.rs
└── src/
    ├── lib.rs                      # Public API exports
    │
    ├── client/
    │   ├── mod.rs                  # GoogleDriveClient trait + impl
    │   └── factory.rs              # GoogleDriveClientFactory
    │
    ├── auth/
    │   ├── mod.rs                  # AuthProvider trait
    │   ├── oauth2.rs               # OAuth2Provider impl
    │   ├── service_account.rs      # ServiceAccountProvider impl
    │   ├── token.rs                # AccessToken types
    │   └── cache.rs                # Token caching logic
    │
    ├── config/
    │   ├── mod.rs                  # GoogleDriveConfig
    │   ├── builder.rs              # Config builder pattern
    │   └── scopes.rs               # OAuth scope constants
    │
    ├── errors/
    │   ├── mod.rs                  # GoogleDriveError hierarchy
    │   ├── mapping.rs              # HTTP → Domain error mapping
    │   └── retryable.rs            # Retryability classification
    │
    ├── transport/
    │   ├── mod.rs                  # HttpTransport trait
    │   ├── reqwest.rs              # ReqwestTransport impl
    │   ├── request.rs              # HttpRequest builder
    │   ├── response.rs             # HttpResponse handling
    │   └── multipart.rs            # Multipart body builder
    │
    ├── types/
    │   ├── mod.rs                  # Re-exports
    │   ├── file.rs                 # File, FileList, FileCapabilities
    │   ├── permission.rs           # Permission, PermissionList
    │   ├── comment.rs              # Comment, CommentList
    │   ├── reply.rs                # Reply, ReplyList
    │   ├── revision.rs             # Revision, RevisionList
    │   ├── change.rs               # Change, ChangeList
    │   ├── drive.rs                # Drive, DriveList
    │   ├── about.rs                # About, StorageQuota
    │   ├── user.rs                 # User
    │   ├── requests.rs             # Request types for all operations
    │   └── responses.rs            # Response types
    │
    ├── pagination/
    │   ├── mod.rs                  # Paginated<T> trait
    │   ├── page.rs                 # Page<T> implementation
    │   ├── iterator.rs             # PageIterator stream
    │   └── cursor.rs               # Cursor tracking
    │
    ├── services/
    │   ├── mod.rs                  # Service traits
    │   ├── files.rs                # FilesService trait + impl
    │   ├── permissions.rs          # PermissionsService trait + impl
    │   ├── comments.rs             # CommentsService trait + impl
    │   ├── replies.rs              # RepliesService trait + impl
    │   ├── revisions.rs            # RevisionsService trait + impl
    │   ├── changes.rs              # ChangesService trait + impl
    │   ├── drives.rs               # DrivesService trait + impl
    │   ├── about.rs                # AboutService trait + impl
    │   └── upload/
    │       ├── mod.rs              # Upload abstraction
    │       ├── simple.rs           # Simple upload (<= 5MB)
    │       ├── multipart.rs        # Multipart upload (<= 5MB)
    │       └── resumable.rs        # ResumableUploadSession
    │
    └── resilience/
        ├── mod.rs                  # Resilience layer
        ├── retry.rs                # Retry integration
        ├── circuit_breaker.rs      # Circuit breaker integration
        ├── rate_limit.rs           # Rate limit integration
        ├── tracing.rs              # Tracing integration
        └── logging.rs              # Logging integration
```

### 3.2 TypeScript Package Organization

```
google-drive/typescript/
├── package.json
├── tsconfig.json
├── README.md
├── examples/
│   ├── simple-upload.ts
│   ├── resumable-upload.ts
│   ├── list-files.ts
│   ├── share-file.ts
│   └── oauth2-flow.ts
├── tests/
│   ├── integration/
│   │   ├── files.test.ts
│   │   ├── permissions.test.ts
│   │   ├── upload.test.ts
│   │   └── auth.test.ts
│   └── mock/
│       ├── mock-transport.ts
│       └── test-utils.ts
└── src/
    ├── index.ts                    # Public API exports
    │
    ├── client/
    │   ├── index.ts                # GoogleDriveClient interface + impl
    │   └── factory.ts              # GoogleDriveClientFactory
    │
    ├── auth/
    │   ├── index.ts                # AuthProvider interface
    │   ├── oauth2.ts               # OAuth2Provider impl
    │   ├── service-account.ts      # ServiceAccountProvider impl
    │   ├── token.ts                # AccessToken types
    │   └── cache.ts                # Token caching logic
    │
    ├── config/
    │   ├── index.ts                # GoogleDriveConfig
    │   ├── builder.ts              # Config builder
    │   └── scopes.ts               # OAuth scope constants
    │
    ├── errors/
    │   ├── index.ts                # GoogleDriveError hierarchy
    │   ├── mapping.ts              # HTTP → Domain error mapping
    │   └── retryable.ts            # Retryability classification
    │
    ├── transport/
    │   ├── index.ts                # HttpTransport interface
    │   ├── fetch.ts                # FetchTransport impl
    │   ├── request.ts              # HttpRequest builder
    │   ├── response.ts             # HttpResponse handling
    │   └── multipart.ts            # Multipart body builder
    │
    ├── types/
    │   ├── index.ts                # Re-exports
    │   ├── file.ts                 # File, FileList, FileCapabilities
    │   ├── permission.ts           # Permission, PermissionList
    │   ├── comment.ts              # Comment, CommentList
    │   ├── reply.ts                # Reply, ReplyList
    │   ├── revision.ts             # Revision, RevisionList
    │   ├── change.ts               # Change, ChangeList
    │   ├── drive.ts                # Drive, DriveList
    │   ├── about.ts                # About, StorageQuota
    │   ├── user.ts                 # User
    │   ├── requests.ts             # Request types
    │   └── responses.ts            # Response types
    │
    ├── pagination/
    │   ├── index.ts                # Paginated<T> interface
    │   ├── page.ts                 # Page<T> implementation
    │   ├── iterator.ts             # PageIterator AsyncIterable
    │   └── cursor.ts               # Cursor tracking
    │
    ├── services/
    │   ├── index.ts                # Service interfaces
    │   ├── files.ts                # FilesService interface + impl
    │   ├── permissions.ts          # PermissionsService interface + impl
    │   ├── comments.ts             # CommentsService interface + impl
    │   ├── replies.ts              # RepliesService interface + impl
    │   ├── revisions.ts            # RevisionsService interface + impl
    │   ├── changes.ts              # ChangesService interface + impl
    │   ├── drives.ts               # DrivesService interface + impl
    │   ├── about.ts                # AboutService interface + impl
    │   └── upload/
    │       ├── index.ts            # Upload abstraction
    │       ├── simple.ts           # Simple upload
    │       ├── multipart.ts        # Multipart upload
    │       └── resumable.ts        # ResumableUploadSession
    │
    └── resilience/
        ├── index.ts                # Resilience layer
        ├── retry.ts                # Retry integration
        ├── circuit-breaker.ts      # Circuit breaker integration
        ├── rate-limit.ts           # Rate limit integration
        ├── tracing.ts              # Tracing integration
        └── logging.ts              # Logging integration
```

### 3.3 Key Module Boundaries

| Module | Exports | Imports |
|--------|---------|---------|
| `client/` | `GoogleDriveClient` trait/interface | `services/`, `config/`, `auth/` |
| `auth/` | `AuthProvider`, `OAuth2Provider`, `ServiceAccountProvider` | `config/`, `errors/`, `transport/` |
| `transport/` | `HttpTransport` trait/interface | `errors/`, primitives (retry, circuit-breaker) |
| `services/` | All service traits/interfaces | `types/`, `transport/`, `auth/`, `pagination/`, `errors/` |
| `types/` | Request/response types | None (pure data) |
| `errors/` | Error hierarchy | primitives (integrations-errors) |
| `pagination/` | Pagination abstractions | `types/`, `errors/` |
| `resilience/` | Resilience wrappers | primitives (retry, circuit-breaker, rate-limit, tracing, logging) |

---

## 4. Data Flow

### 4.1 Request Pipeline: Client → Auth → Transport → API

```
┌──────────────────────────────────────────────────────────────────────┐
│ 1. User calls API method                                             │
│    client.files().create(request)                                    │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 2. Service validates request                                         │
│    - Check required fields                                           │
│    - Validate parameters                                             │
│    - Build request struct                                            │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 3. Service obtains access token                                      │
│    token = auth_provider.get_access_token().await?                   │
│    - Check token cache                                               │
│    - Refresh if expired                                              │
│    - Return valid token                                              │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 4. Service builds HTTP request                                       │
│    - Method: POST                                                    │
│    - URL: https://www.googleapis.com/drive/v3/files                  │
│    - Headers:                                                        │
│      * Authorization: Bearer {token}                                 │
│      * Content-Type: application/json                                │
│      * User-Agent: integrations-google-drive/1.0.0                   │
│    - Body: JSON-serialized request                                   │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 5. Resilience layer wraps request                                    │
│    - Create tracing span                                             │
│    - Check circuit breaker state                                     │
│    - Check rate limit                                                │
│    - Execute with retry logic                                        │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 6. Transport executes HTTP request                                   │
│    response = transport.send(request).await?                         │
│    - Connection pooling                                              │
│    - TLS handshake (if needed)                                       │
│    - Send request bytes                                              │
│    - Await response                                                  │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │  Google Drive  │
                    │      API       │
                    └────────┬───────┘
                             │
                             │ (continues in response pipeline)
                             ▼
```

### 4.2 Response Pipeline: API → Transport → Parse → Client

```
                    ┌────────────────┐
                    │  Google Drive  │
                    │      API       │
                    └────────┬───────┘
                             │
                             │ HTTP response
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 1. Transport receives response                                       │
│    - Read status code                                                │
│    - Read headers                                                    │
│    - Read body bytes                                                 │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 2. Resilience layer handles response                                 │
│    - Record metrics (duration, status)                               │
│    - Update circuit breaker state                                    │
│    - Update rate limit state                                         │
│    - Log response details                                            │
│    - End tracing span                                                │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 3. Service checks status code                                        │
│    match status_code:                                                │
│      200-299 → Success path                                          │
│      400-499 → Client error (map to domain error)                    │
│      500-599 → Server error (map to domain error)                    │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 4. Success: Parse response body                                      │
│    file = serde_json::from_slice(&body)?                             │
│    - Deserialize JSON → File struct                                  │
│    - Validate required fields                                        │
│    - Type-check values                                               │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 5. Return result to caller                                           │
│    Ok(file)                                                          │
└──────────────────────────────────────────────────────────────────────┘


                    OR (Error Path)
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 4. Error: Parse error response                                       │
│    error = parse_google_error(&body)?                                │
│    - Extract error code, message, reason                             │
│    - Map to GoogleDriveError variant                                 │
│    - Check if retryable                                              │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│ 5. Retry logic (if retryable)                                        │
│    if error.is_retryable() && attempts < max_retries:                │
│      - Calculate backoff delay                                       │
│      - Respect Retry-After header                                    │
│      - Sleep and retry from step 6 of request pipeline               │
│    else:                                                             │
│      - Return Err(error)                                             │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.3 Upload Flow: Simple / Multipart / Resumable

#### 4.3.1 Simple Upload (<= 5MB)

```
┌─────────────┐
│ User calls  │
│  upload()   │
└──────┬──────┘
       │
       ▼
┌───────────────────────────────┐
│ Validate file size <= 5MB     │
└──────┬────────────────────────┘
       │
       ▼
┌───────────────────────────────┐
│ Build HTTP request:           │
│ POST /upload/drive/v3/files   │
│   ?uploadType=media           │
│ Content-Type: {file mime}     │
│ Body: {file bytes}            │
└──────┬────────────────────────┘
       │
       ▼
┌───────────────────────────────┐
│ Execute via transport         │
└──────┬────────────────────────┘
       │
       ▼
┌───────────────────────────────┐
│ Return File metadata          │
└───────────────────────────────┘
```

#### 4.3.2 Multipart Upload (<= 5MB with metadata)

```
┌─────────────┐
│ User calls  │
│ create_multi│
│   part()    │
└──────┬──────┘
       │
       ▼
┌───────────────────────────────┐
│ Validate file size <= 5MB     │
└──────┬────────────────────────┘
       │
       ▼
┌───────────────────────────────┐
│ Build multipart body:         │
│ --boundary                    │
│ Content-Type: application/json│
│ {file metadata JSON}          │
│ --boundary                    │
│ Content-Type: {file mime}     │
│ {file bytes}                  │
│ --boundary--                  │
└──────┬────────────────────────┘
       │
       ▼
┌───────────────────────────────┐
│ Build HTTP request:           │
│ POST /upload/drive/v3/files   │
│   ?uploadType=multipart       │
│ Content-Type: multipart/      │
│   related; boundary=...       │
│ Body: {multipart body}        │
└──────┬────────────────────────┘
       │
       ▼
┌───────────────────────────────┐
│ Execute via transport         │
└──────┬────────────────────────┘
       │
       ▼
┌───────────────────────────────┐
│ Return File metadata          │
└───────────────────────────────┘
```

#### 4.3.3 Resumable Upload (large files, up to 5TB)

```
┌─────────────┐
│ User calls  │
│create_resum │
│   able()    │
└──────┬──────┘
       │
       ▼
┌───────────────────────────────────────────────┐
│ STEP 1: Initiate resumable upload             │
│ POST /upload/drive/v3/files?uploadType=       │
│   resumable                                   │
│ X-Upload-Content-Type: {file mime}            │
│ X-Upload-Content-Length: {file size}          │
│ Body: {file metadata JSON}                    │
└──────┬────────────────────────────────────────┘
       │
       ▼
┌───────────────────────────────────────────────┐
│ Response: 200 OK                              │
│ Location: {resumable_upload_uri}              │
└──────┬────────────────────────────────────────┘
       │
       ▼
┌───────────────────────────────────────────────┐
│ Return ResumableUploadSession                 │
│   session.upload_uri = {resumable_upload_uri} │
└──────┬────────────────────────────────────────┘
       │
       │ User calls session.upload_stream()
       ▼
┌───────────────────────────────────────────────┐
│ STEP 2: Upload content in chunks             │
│ Loop for each chunk:                          │
│   - Read chunk_size bytes from stream         │
│   - Calculate byte range                      │
│   - PUT {resumable_upload_uri}                │
│     Content-Length: {chunk size}              │
│     Content-Range: bytes {start}-{end}/{total}│
│     Body: {chunk bytes}                       │
│   - Response:                                 │
│     * 308 Resume Incomplete → continue        │
│     * 200/201 OK → upload complete            │
└──────┬────────────────────────────────────────┘
       │
       ▼
┌───────────────────────────────────────────────┐
│ STEP 3 (if interrupted): Query status        │
│ PUT {resumable_upload_uri}                    │
│ Content-Length: 0                             │
│ Content-Range: bytes */{total}                │
│                                               │
│ Response: 308 Resume Incomplete               │
│ Range: bytes=0-{bytes_received}               │
└──────┬────────────────────────────────────────┘
       │
       ▼
┌───────────────────────────────────────────────┐
│ Resume from bytes_received + 1                │
└──────┬────────────────────────────────────────┘
       │
       ▼
┌───────────────────────────────────────────────┐
│ Return File metadata on completion            │
└───────────────────────────────────────────────┘
```

### 4.4 Download Flow: Full / Streaming

#### 4.4.1 Full Download

```
┌─────────────┐
│ User calls  │
│ download()  │
└──────┬──────┘
       │
       ▼
┌───────────────────────────────┐
│ Build HTTP request:           │
│ GET /drive/v3/files/{id}      │
│   ?alt=media                  │
│ Authorization: Bearer {token} │
└──────┬────────────────────────┘
       │
       ▼
┌───────────────────────────────┐
│ Execute via transport         │
│ response = transport.send()   │
└──────┬────────────────────────┘
       │
       ▼
┌───────────────────────────────┐
│ Read entire response body     │
│ bytes = response.body         │
└──────┬────────────────────────┘
       │
       ▼
┌───────────────────────────────┐
│ Return Bytes                  │
└───────────────────────────────┘
```

#### 4.4.2 Streaming Download

```
┌─────────────┐
│ User calls  │
│download_str │
│  eam()      │
└──────┬──────┘
       │
       ▼
┌───────────────────────────────┐
│ Build HTTP request:           │
│ GET /drive/v3/files/{id}      │
│   ?alt=media                  │
│ Authorization: Bearer {token} │
└──────┬────────────────────────┘
       │
       ▼
┌───────────────────────────────┐
│ Execute via transport         │
│ stream = transport.send_      │
│   streaming()                 │
└──────┬────────────────────────┘
       │
       ▼
┌───────────────────────────────┐
│ Return Stream<Bytes>          │
│ (user processes chunks)       │
└───────────────────────────────┘
```

### 4.5 Pagination Flow with nextPageToken

```
┌─────────────┐
│ User calls  │
│ list_all()  │
└──────┬──────┘
       │
       ▼
┌────────────────────────────────────────┐
│ Initialize pagination state:           │
│   page_token = None                    │
│   has_more = true                      │
└──────┬─────────────────────────────────┘
       │
       │ Loop while has_more
       ▼
┌────────────────────────────────────────┐
│ Build list request:                    │
│ GET /drive/v3/files                    │
│   ?pageSize={page_size}                │
│   &pageToken={page_token}  (if set)    │
│   &q={query}               (if set)    │
└──────┬─────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│ Execute request                        │
│ response = transport.send()            │
└──────┬─────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│ Parse response:                        │
│   list = FileList {                    │
│     files: [...],                      │
│     nextPageToken: Some("token123")    │
│       or None,                         │
│     incompleteSearch: false            │
│   }                                    │
└──────┬─────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│ Yield files to stream:                 │
│   for file in list.files:              │
│     yield file                         │
└──────┬─────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────┐
│ Update pagination state:               │
│   if list.nextPageToken:               │
│     page_token = list.nextPageToken    │
│     has_more = true                    │
│   else:                                │
│     has_more = false                   │
└──────┬─────────────────────────────────┘
       │
       │ Continue loop if has_more
       ▼
┌────────────────────────────────────────┐
│ Stream completes when has_more = false │
└────────────────────────────────────────┘
```

---

## 5. State Management

### 5.1 Token Caching and Refresh

#### State Machine

```
┌──────────────┐
│   NO TOKEN   │
│              │
└──────┬───────┘
       │
       │ get_access_token()
       ▼
┌──────────────────┐
│  FETCH NEW TOKEN │
│  (OAuth2 refresh │
│   or JWT sign)   │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│   TOKEN VALID    │
│ (in cache, not   │
│    expired)      │
└──────┬───────────┘
       │
       │ Time passes
       ▼
┌──────────────────┐      get_access_token()      ┌──────────────────┐
│  TOKEN EXPIRED   │─────────────────────────────▶│ REFRESH TOKEN    │
│ (expires_at <    │                               │ (force refresh)  │
│    now)          │◀─────────────────────────────│                  │
└──────────────────┘   New token acquired         └──────────────────┘
       │
       │ Error during refresh
       ▼
┌──────────────────┐
│  REFRESH FAILED  │
│  (return error)  │
└──────────────────┘
```

#### Implementation Details

**Rust:**

```rust
pub struct OAuth2Provider {
    client_id: String,
    client_secret: SecretString,
    refresh_token: SecretString,
    token_endpoint: Url,

    // Cached token protected by mutex
    cached_token: Arc<tokio::sync::Mutex<Option<AccessToken>>>,
}

impl OAuth2Provider {
    pub async fn get_access_token(&self) -> Result<AccessToken, AuthError> {
        let mut cache = self.cached_token.lock().await;

        // Check cache
        if let Some(token) = &*cache {
            if !token.is_expired() {
                return Ok(token.clone());
            }
        }

        // Refresh token
        let new_token = self.refresh_token_impl().await?;
        *cache = Some(new_token.clone());
        Ok(new_token)
    }

    async fn refresh_token_impl(&self) -> Result<AccessToken, AuthError> {
        // POST to token endpoint with refresh_token grant
        // Parse response and return AccessToken
    }
}
```

**TypeScript:**

```typescript
export class OAuth2Provider implements AuthProvider {
  private cachedToken: AccessToken | null = null;

  async getAccessToken(): Promise<AccessToken> {
    // Check cache
    if (this.cachedToken && !this.isExpired()) {
      return this.cachedToken;
    }

    // Refresh token
    this.cachedToken = await this.refreshTokenImpl();
    return this.cachedToken;
  }

  private async refreshTokenImpl(): Promise<AccessToken> {
    // POST to token endpoint with refresh_token grant
    // Parse response and return AccessToken
  }

  isExpired(): boolean {
    if (!this.cachedToken) return true;
    return this.cachedToken.expiresAt <= new Date();
  }
}
```

### 5.2 Circuit Breaker State

#### State Machine

```
┌─────────────┐
│   CLOSED    │───────────────────────┐
│  (normal    │                       │
│  operation) │                       │
└──────┬──────┘                       │
       │                              │
       │ failures >= threshold        │ success >= threshold
       ▼                              │ (from HALF_OPEN)
┌─────────────┐                       │
│    OPEN     │                       │
│ (fail fast) │                       │
└──────┬──────┘                       │
       │                              │
       │ reset_timeout elapsed        │
       ▼                              │
┌─────────────┐                       │
│  HALF_OPEN  │                       │
│  (testing)  │───────────────────────┘
└─────────────┘
       │
       │ any failure
       ▼
┌─────────────┐
│    OPEN     │
│ (fail fast) │
└─────────────┘
```

#### Implementation

```rust
pub struct CircuitBreakerState {
    state: Arc<Mutex<State>>,
    config: CircuitBreakerConfig,
}

enum State {
    Closed { failure_count: u32 },
    Open { opened_at: Instant },
    HalfOpen { success_count: u32 },
}

impl CircuitBreakerState {
    pub async fn execute<F, T>(&self, f: F) -> Result<T, GoogleDriveError>
    where
        F: Future<Output = Result<T, GoogleDriveError>>,
    {
        // Check state
        {
            let mut state = self.state.lock().await;
            match *state {
                State::Open { opened_at } => {
                    if opened_at.elapsed() >= self.config.reset_timeout {
                        *state = State::HalfOpen { success_count: 0 };
                    } else {
                        return Err(GoogleDriveError::CircuitBreakerOpen);
                    }
                }
                _ => {}
            }
        }

        // Execute function
        let result = f.await;

        // Update state based on result
        let mut state = self.state.lock().await;
        match (&mut *state, &result) {
            (State::Closed { failure_count }, Err(_)) => {
                *failure_count += 1;
                if *failure_count >= self.config.failure_threshold {
                    *state = State::Open { opened_at: Instant::now() };
                }
            }
            (State::Closed { failure_count }, Ok(_)) => {
                *failure_count = 0;
            }
            (State::HalfOpen { success_count }, Ok(_)) => {
                *success_count += 1;
                if *success_count >= self.config.success_threshold {
                    *state = State::Closed { failure_count: 0 };
                }
            }
            (State::HalfOpen { .. }, Err(_)) => {
                *state = State::Open { opened_at: Instant::now() };
            }
            _ => {}
        }

        result
    }
}
```

### 5.3 Rate Limit Tracking

#### Token Bucket State

```rust
pub struct RateLimiter {
    bucket: Arc<Mutex<TokenBucket>>,
    config: RateLimitConfig,
}

struct TokenBucket {
    tokens: f64,
    last_refill: Instant,
}

impl RateLimiter {
    pub async fn acquire(&self) -> Result<(), GoogleDriveError> {
        let mut bucket = self.bucket.lock().await;

        // Refill tokens based on elapsed time
        let now = Instant::now();
        let elapsed = now.duration_since(bucket.last_refill).as_secs_f64();
        let refill_amount = elapsed * self.config.refill_rate;
        bucket.tokens = (bucket.tokens + refill_amount).min(self.config.capacity);
        bucket.last_refill = now;

        // Try to consume a token
        if bucket.tokens >= 1.0 {
            bucket.tokens -= 1.0;
            Ok(())
        } else {
            // Calculate wait time
            let wait_time = Duration::from_secs_f64((1.0 - bucket.tokens) / self.config.refill_rate);
            Err(GoogleDriveError::RateLimitExceeded { retry_after: Some(wait_time) })
        }
    }
}
```

### 5.4 Resumable Upload Session State

```rust
pub struct ResumableUploadSession {
    upload_uri: Url,
    total_size: u64,

    // Mutable state
    state: Arc<Mutex<UploadState>>,

    // Dependencies
    transport: Arc<dyn HttpTransport>,
}

struct UploadState {
    bytes_uploaded: u64,
    is_complete: bool,
    last_error: Option<UploadError>,
}

impl ResumableUploadSession {
    pub async fn upload_chunk(
        &self,
        chunk: Bytes,
        offset: u64,
    ) -> Result<UploadChunkResult, GoogleDriveError> {
        // Update state on success
        let mut state = self.state.lock().await;
        state.bytes_uploaded = offset + chunk.len() as u64;

        if state.bytes_uploaded >= self.total_size {
            state.is_complete = true;
        }

        // ... execute upload ...
    }

    pub async fn query_status(&self) -> Result<UploadStatus, GoogleDriveError> {
        // Query current state from server
        // Update local state to match
    }
}
```

---

## 6. Concurrency Patterns

### 6.1 Async/Await Throughout

All I/O operations use async/await for non-blocking execution:

**Rust:**
```rust
#[async_trait]
pub trait FilesService: Send + Sync {
    async fn get(&self, file_id: &str) -> Result<File, GoogleDriveError>;
    async fn list(&self, params: ListFilesParams) -> Result<FileList, GoogleDriveError>;
    async fn create(&self, request: CreateFileRequest) -> Result<File, GoogleDriveError>;
}
```

**TypeScript:**
```typescript
interface FilesService {
  get(fileId: string): Promise<File>;
  list(params: ListFilesParams): Promise<FileList>;
  create(request: CreateFileRequest): Promise<File>;
}
```

### 6.2 Connection Pooling

HTTP transport uses connection pooling to reuse TCP connections:

```rust
use reqwest::Client;

pub struct ReqwestTransport {
    client: Client,
}

impl ReqwestTransport {
    pub fn new(config: &GoogleDriveConfig) -> Self {
        let client = Client::builder()
            .pool_max_idle_per_host(10)
            .pool_idle_timeout(Duration::from_secs(90))
            .timeout(config.timeout)
            .build()
            .expect("Failed to create HTTP client");

        Self { client }
    }
}
```

### 6.3 Concurrent Pagination (when safe)

Allow multiple pages to be fetched concurrently when order doesn't matter:

```rust
use futures::stream::{StreamExt, FuturesOrdered};

pub async fn list_all_concurrent(
    &self,
    params: ListFilesParams,
) -> Result<Vec<File>, GoogleDriveError> {
    let mut all_files = Vec::new();
    let mut page_token = None;

    loop {
        // Fetch current page
        let mut list_params = params.clone();
        list_params.page_token = page_token.clone();

        let page = self.list(list_params).await?;
        all_files.extend(page.files);

        if let Some(next_token) = page.next_page_token {
            page_token = Some(next_token);
        } else {
            break;
        }
    }

    Ok(all_files)
}
```

**Note:** Google Drive API requires sequential pagination (nextPageToken), so full concurrent pagination is not supported. However, multiple independent list operations can run concurrently.

### 6.4 Upload Chunk Parallelization (optional)

For resumable uploads, chunks can be uploaded in parallel if the API supports it (currently Google Drive requires sequential chunks):

```rust
// Future enhancement: parallel chunk upload if API supports it
pub async fn upload_stream_parallel(
    &self,
    stream: impl Stream<Item = Result<Bytes, GoogleDriveError>>,
    total_size: u64,
    chunk_size: usize,
    max_concurrent: usize,
) -> Result<File, GoogleDriveError> {
    // Split stream into chunks
    // Upload chunks concurrently (up to max_concurrent)
    // Await all completions
    // Note: This requires API support for out-of-order chunks
    unimplemented!("Parallel chunk upload not supported by Google Drive API")
}
```

### 6.5 Semaphore for Concurrency Control

Limit maximum concurrent requests to avoid overwhelming the API:

```rust
use tokio::sync::Semaphore;

pub struct GoogleDriveClientImpl {
    semaphore: Arc<Semaphore>,
    // ... other fields
}

impl GoogleDriveClientImpl {
    pub fn new(config: GoogleDriveConfig) -> Self {
        let max_concurrent = config.rate_limit_config
            .and_then(|c| c.max_concurrent_requests)
            .unwrap_or(10);

        Self {
            semaphore: Arc::new(Semaphore::new(max_concurrent as usize)),
            // ... initialize other fields
        }
    }

    async fn execute_request<T>(
        &self,
        request: HttpRequest,
    ) -> Result<T, GoogleDriveError> {
        // Acquire permit (wait if at limit)
        let _permit = self.semaphore.acquire().await
            .map_err(|_| GoogleDriveError::Internal("Semaphore closed".into()))?;

        // Execute request
        self.transport.send(request).await
    }
}
```

---

## 7. Error Propagation

### 7.1 Error Hierarchy

```
GoogleDriveError (top-level enum)
├── Configuration(ConfigurationError)
│   ├── MissingCredentials
│   ├── InvalidCredentials
│   ├── InvalidConfiguration
│   └── MissingScope
│
├── Authentication(AuthenticationError)
│   ├── InvalidToken
│   ├── ExpiredToken
│   ├── RefreshFailed
│   ├── InvalidGrant
│   └── InsufficientPermissions
│
├── Authorization(AuthorizationError)
│   ├── Forbidden
│   ├── InsufficientPermissions
│   ├── FileNotAccessible
│   ├── DomainPolicy
│   └── UserRateLimitExceeded
│
├── Request(RequestError)
│   ├── ValidationError
│   ├── InvalidParameter
│   ├── MissingParameter
│   ├── InvalidQuery
│   ├── InvalidRange
│   └── InvalidMimeType
│
├── Resource(ResourceError)
│   ├── FileNotFound
│   ├── FolderNotFound
│   ├── PermissionNotFound
│   ├── CommentNotFound
│   ├── RevisionNotFound
│   ├── DriveNotFound
│   ├── AlreadyExists
│   └── CannotModify
│
├── Quota(QuotaError)
│   ├── StorageQuotaExceeded
│   ├── UserRateLimitExceeded
│   ├── DailyLimitExceeded
│   └── ProjectRateLimitExceeded
│
├── Upload(UploadError)
│   ├── UploadInterrupted
│   ├── UploadFailed
│   ├── InvalidUploadRequest
│   ├── UploadSizeExceeded
│   ├── ResumableUploadExpired
│   └── ChunkSizeMismatch
│
├── Export(ExportError)
│   ├── ExportNotSupported
│   ├── ExportSizeExceeded
│   └── InvalidExportFormat
│
├── Network(NetworkError)
│   ├── ConnectionFailed
│   ├── Timeout
│   ├── DnsResolutionFailed
│   └── TlsError
│
├── Server(ServerError)
│   ├── InternalError
│   ├── BackendError
│   ├── ServiceUnavailable
│   └── BadGateway
│
└── Response(ResponseError)
    ├── DeserializationError
    ├── UnexpectedFormat
    └── InvalidJson
```

### 7.2 Retryable vs Non-Retryable Classification

```rust
impl GoogleDriveError {
    /// Returns true if the error is retryable.
    pub fn is_retryable(&self) -> bool {
        match self {
            // Retryable errors
            Self::Quota(QuotaError::UserRateLimitExceeded { .. }) => true,
            Self::Quota(QuotaError::ProjectRateLimitExceeded { .. }) => true,
            Self::Network(NetworkError::Timeout { .. }) => true,
            Self::Network(NetworkError::ConnectionFailed { .. }) => true,
            Self::Server(ServerError::InternalError { .. }) => true,
            Self::Server(ServerError::ServiceUnavailable { .. }) => true,
            Self::Server(ServerError::BackendError { .. }) => true,
            Self::Upload(UploadError::UploadInterrupted { .. }) => true,

            // Non-retryable errors
            Self::Configuration(_) => false,
            Self::Authentication(_) => false,
            Self::Authorization(_) => false,
            Self::Request(_) => false,
            Self::Resource(_) => false,
            Self::Quota(QuotaError::StorageQuotaExceeded { .. }) => false,
            Self::Quota(QuotaError::DailyLimitExceeded { .. }) => false,
            Self::Export(_) => false,
            Self::Response(_) => false,

            _ => false,
        }
    }

    /// Returns the suggested retry delay if available.
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            Self::Quota(QuotaError::UserRateLimitExceeded { retry_after, .. }) => *retry_after,
            Self::Quota(QuotaError::ProjectRateLimitExceeded { retry_after, .. }) => *retry_after,
            Self::Server(ServerError::ServiceUnavailable { retry_after, .. }) => *retry_after,
            _ => None,
        }
    }
}
```

### 7.3 Error Context Enrichment

Errors are enriched with context as they propagate:

```rust
pub async fn get_file(&self, file_id: &str) -> Result<File, GoogleDriveError> {
    self.transport.send(request)
        .await
        .map_err(|e| {
            // Enrich transport error with file_id context
            GoogleDriveError::Network(NetworkError::ConnectionFailed {
                message: format!("Failed to get file {}: {}", file_id, e),
                source: Some(Box::new(e)),
            })
        })?
        .parse()
        .map_err(|e| {
            // Enrich parse error with file_id context
            GoogleDriveError::Response(ResponseError::DeserializationError {
                message: format!("Failed to parse file {} metadata: {}", file_id, e),
                source: Some(Box::new(e)),
            })
        })
}
```

### 7.4 Error Mapping from HTTP

```rust
pub fn map_http_error(
    status: StatusCode,
    body: &[u8],
) -> GoogleDriveError {
    // Parse Google API error format
    let api_error = match serde_json::from_slice::<ApiError>(body) {
        Ok(err) => err,
        Err(_) => {
            return GoogleDriveError::Response(ResponseError::UnexpectedFormat {
                status: status.as_u16(),
                body: String::from_utf8_lossy(body).to_string(),
            });
        }
    };

    match (status.as_u16(), api_error.reason.as_str()) {
        // 400 errors
        (400, "invalidParameter") => GoogleDriveError::Request(RequestError::InvalidParameter {
            message: api_error.message,
            parameter: api_error.location,
        }),
        (400, "invalidQuery") => GoogleDriveError::Request(RequestError::InvalidQuery {
            message: api_error.message,
        }),

        // 401 errors
        (401, "authError") | (401, "invalid_token") => {
            GoogleDriveError::Authentication(AuthenticationError::InvalidToken {
                message: api_error.message,
            })
        }
        (401, "expired") => {
            GoogleDriveError::Authentication(AuthenticationError::ExpiredToken {
                message: api_error.message,
            })
        }

        // 403 errors
        (403, "forbidden") => GoogleDriveError::Authorization(AuthorizationError::Forbidden {
            message: api_error.message,
        }),
        (403, "insufficientPermissions") => {
            GoogleDriveError::Authorization(AuthorizationError::InsufficientPermissions {
                message: api_error.message,
                required_scope: None,
            })
        }
        (403, "userRateLimitExceeded") => {
            GoogleDriveError::Quota(QuotaError::UserRateLimitExceeded {
                message: api_error.message,
                retry_after: parse_retry_after(&api_error),
            })
        }
        (403, "rateLimitExceeded") => {
            GoogleDriveError::Quota(QuotaError::ProjectRateLimitExceeded {
                message: api_error.message,
                retry_after: parse_retry_after(&api_error),
            })
        }
        (403, "storageQuotaExceeded") => {
            GoogleDriveError::Quota(QuotaError::StorageQuotaExceeded {
                message: api_error.message,
                limit: 0, // Would be parsed from error details
                used: 0,
            })
        }

        // 404 errors
        (404, "notFound") => GoogleDriveError::Resource(ResourceError::FileNotFound {
            file_id: api_error.location.unwrap_or_default(),
            message: api_error.message,
        }),

        // 429 errors
        (429, _) => GoogleDriveError::Quota(QuotaError::UserRateLimitExceeded {
            message: api_error.message,
            retry_after: parse_retry_after(&api_error),
        }),

        // 500 errors
        (500, _) => GoogleDriveError::Server(ServerError::InternalError {
            message: api_error.message,
        }),
        (502, _) => GoogleDriveError::Server(ServerError::BadGateway {
            message: api_error.message,
        }),
        (503, _) => GoogleDriveError::Server(ServerError::ServiceUnavailable {
            message: api_error.message,
            retry_after: parse_retry_after(&api_error),
        }),

        // Default
        _ => GoogleDriveError::Server(ServerError::InternalError {
            message: format!("Unexpected error: {} {}", status, api_error.message),
        }),
    }
}
```

---

## 8. Integration with Primitives

### 8.1 integrations-errors

```rust
use integrations_errors::{IntegrationError, ErrorContext};

impl From<GoogleDriveError> for IntegrationError {
    fn from(err: GoogleDriveError) -> Self {
        IntegrationError::new("google-drive", err.to_string())
            .with_context("error_type", format!("{:?}", err))
            .with_retryable(err.is_retryable())
    }
}
```

### 8.2 integrations-retry

```rust
use integrations_retry::{RetryExecutor, RetryConfig, BackoffStrategy};

pub struct ResilienceLayer {
    retry_executor: RetryExecutor,
}

impl ResilienceLayer {
    pub async fn execute_with_retry<F, T>(
        &self,
        operation: F,
    ) -> Result<T, GoogleDriveError>
    where
        F: Fn() -> Pin<Box<dyn Future<Output = Result<T, GoogleDriveError>> + Send>>,
    {
        self.retry_executor.execute(|| async {
            let result = operation().await;

            // Convert to retryable result
            match result {
                Ok(value) => integrations_retry::RetryResult::Success(value),
                Err(err) if err.is_retryable() => {
                    integrations_retry::RetryResult::Retry {
                        error: err,
                        delay: err.retry_after(),
                    }
                }
                Err(err) => integrations_retry::RetryResult::Abort(err),
            }
        }).await
    }
}
```

### 8.3 integrations-circuit-breaker

```rust
use integrations_circuit_breaker::{CircuitBreaker, CircuitBreakerConfig};

pub struct ResilienceLayer {
    circuit_breaker: CircuitBreaker<GoogleDriveError>,
}

impl ResilienceLayer {
    pub async fn execute_with_circuit_breaker<F, T>(
        &self,
        operation: F,
    ) -> Result<T, GoogleDriveError>
    where
        F: Future<Output = Result<T, GoogleDriveError>>,
    {
        self.circuit_breaker.call(operation).await
    }
}
```

### 8.4 integrations-rate-limit

```rust
use integrations_rate_limit::{RateLimiter, TokenBucketLimiter};

pub struct ResilienceLayer {
    rate_limiter: TokenBucketLimiter,
}

impl ResilienceLayer {
    pub async fn execute_with_rate_limit<F, T>(
        &self,
        operation: F,
    ) -> Result<T, GoogleDriveError>
    where
        F: Future<Output = Result<T, GoogleDriveError>>,
    {
        // Acquire rate limit permit
        self.rate_limiter.acquire().await
            .map_err(|_| GoogleDriveError::Quota(QuotaError::UserRateLimitExceeded {
                message: "Client-side rate limit exceeded".to_string(),
                retry_after: Some(Duration::from_secs(1)),
            }))?;

        // Execute operation
        operation.await
    }
}
```

### 8.5 integrations-tracing

```rust
use integrations_tracing::{trace_span, SpanAttributes};

pub async fn list_files(
    &self,
    params: ListFilesParams,
) -> Result<FileList, GoogleDriveError> {
    let span = trace_span!(
        "google_drive.files.list",
        "google_drive.service" => "files",
        "google_drive.operation" => "list",
        "google_drive.page_size" => params.page_size.unwrap_or(100),
        "google_drive.query" => params.q.as_deref().unwrap_or(""),
    );

    async move {
        let result = self.list_files_impl(params).await;

        // Record result in span
        match &result {
            Ok(list) => {
                span.set_attribute("google_drive.files_count", list.files.len() as i64);
                span.set_attribute("google_drive.has_next_page", list.next_page_token.is_some());
            }
            Err(err) => {
                span.set_attribute("error.type", format!("{:?}", err));
                span.set_status(integrations_tracing::StatusCode::Error);
            }
        }

        result
    }
    .instrument(span)
    .await
}
```

### 8.6 integrations-logging

```rust
use integrations_logging::{log, LogLevel, structured_log};

pub async fn upload_file(
    &self,
    request: CreateFileRequest,
) -> Result<File, GoogleDriveError> {
    structured_log!(
        LogLevel::Info,
        "Starting file upload",
        "file_name" => &request.name,
        "mime_type" => request.mime_type.as_deref().unwrap_or("unknown"),
    );

    let result = self.upload_file_impl(request).await;

    match &result {
        Ok(file) => {
            structured_log!(
                LogLevel::Info,
                "File upload successful",
                "file_id" => &file.id,
                "file_name" => &file.name,
            );
        }
        Err(err) => {
            structured_log!(
                LogLevel::Error,
                "File upload failed",
                "error" => err.to_string(),
                "error_type" => format!("{:?}", err),
            );
        }
    }

    result
}
```

---

## 9. Security Architecture

### 9.1 Credential Storage (SecretString)

All sensitive credentials use `SecretString` to prevent accidental exposure:

```rust
use secrecy::{Secret, ExposeSecret, Zeroize};

pub struct OAuth2Provider {
    client_id: String,  // Not sensitive (public)
    client_secret: Secret<String>,  // Sensitive
    refresh_token: Secret<String>,  // Sensitive
    cached_token: Arc<Mutex<Option<AccessToken>>>,
}

pub struct AccessToken {
    token: Secret<String>,  // Sensitive
    token_type: String,
    expires_at: DateTime<Utc>,
    scopes: Vec<String>,
}

impl Debug for OAuth2Provider {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("OAuth2Provider")
            .field("client_id", &self.client_id)
            .field("client_secret", &"[REDACTED]")
            .field("refresh_token", &"[REDACTED]")
            .finish()
    }
}

impl AccessToken {
    pub fn as_bearer_header(&self) -> String {
        format!("Bearer {}", self.token.expose_secret())
    }
}
```

### 9.2 TLS Enforcement

```rust
pub struct ReqwestTransport {
    client: reqwest::Client,
}

impl ReqwestTransport {
    pub fn new(config: &GoogleDriveConfig) -> Result<Self, GoogleDriveError> {
        let client = reqwest::Client::builder()
            .use_rustls_tls()  // Use rustls for TLS
            .min_tls_version(reqwest::tls::Version::TLS_1_2)  // Enforce TLS 1.2+
            .https_only(true)  // Only HTTPS connections
            .timeout(config.timeout)
            .build()
            .map_err(|e| GoogleDriveError::Configuration(
                ConfigurationError::InvalidConfiguration {
                    message: format!("Failed to create HTTP client: {}", e),
                }
            ))?;

        Ok(Self { client })
    }
}
```

### 9.3 Token Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│ Token Acquisition (OAuth 2.0)                                   │
│                                                                  │
│ 1. User initiates OAuth flow (out of scope for this module)     │
│ 2. User authorizes application                                  │
│ 3. Application exchanges auth code for tokens:                  │
│    - access_token (short-lived, ~1 hour)                        │
│    - refresh_token (long-lived, never expires unless revoked)   │
│ 4. Store refresh_token securely (encrypted at rest)             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Token Usage                                                      │
│                                                                  │
│ 1. get_access_token() called                                    │
│ 2. Check cached token:                                          │
│    - If valid (not expired): return cached token                │
│    - If expired: refresh token                                  │
│ 3. Refresh flow:                                                │
│    - POST to token endpoint with refresh_token                  │
│    - Receive new access_token                                   │
│    - Cache new access_token with expiry                         │
│ 4. Use access_token in Authorization header                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Token Revocation                                                 │
│                                                                  │
│ 1. User revokes access (in Google account settings)             │
│ 2. Next API call with access_token fails with 401               │
│ 3. Attempt to refresh token                                     │
│ 4. Refresh fails with invalid_grant                             │
│ 5. Return AuthenticationError::RefreshFailed                    │
│ 6. Application must re-authenticate user                        │
└─────────────────────────────────────────────────────────────────┘
```

### 9.4 Service Account Key Handling

```rust
pub struct ServiceAccountProvider {
    service_account_email: String,
    private_key: Secret<String>,  // PEM-encoded RSA private key
    scopes: Vec<String>,
    subject: Option<String>,  // For domain-wide delegation
    cached_token: Arc<Mutex<Option<AccessToken>>>,
}

impl ServiceAccountProvider {
    pub fn new(
        service_account_email: String,
        private_key: String,
        scopes: Vec<String>,
        subject: Option<String>,
    ) -> Result<Self, GoogleDriveError> {
        // Validate private key format
        if !private_key.starts_with("-----BEGIN PRIVATE KEY-----") {
            return Err(GoogleDriveError::Configuration(
                ConfigurationError::InvalidCredentials {
                    message: "Invalid service account private key format".to_string(),
                }
            ));
        }

        Ok(Self {
            service_account_email,
            private_key: Secret::new(private_key),
            scopes,
            subject,
            cached_token: Arc::new(Mutex::new(None)),
        })
    }

    async fn create_jwt(&self) -> Result<String, AuthError> {
        use jsonwebtoken::{encode, Algorithm, Header, EncodingKey};

        let now = Utc::now();
        let claims = ServiceAccountClaims {
            iss: self.service_account_email.clone(),
            sub: self.subject.clone().unwrap_or_else(|| self.service_account_email.clone()),
            scope: self.scopes.join(" "),
            aud: "https://oauth2.googleapis.com/token".to_string(),
            exp: (now + Duration::hours(1)).timestamp(),
            iat: now.timestamp(),
        };

        let header = Header::new(Algorithm::RS256);
        let encoding_key = EncodingKey::from_rsa_pem(
            self.private_key.expose_secret().as_bytes()
        ).map_err(|e| AuthError::InvalidPrivateKey(e.to_string()))?;

        encode(&header, &claims, &encoding_key)
            .map_err(|e| AuthError::JwtCreationFailed(e.to_string()))
    }
}
```

### 9.5 Input Validation

```rust
pub fn validate_file_id(file_id: &str) -> Result<(), GoogleDriveError> {
    // File IDs are alphanumeric plus some special characters
    let valid = file_id.chars().all(|c| {
        c.is_alphanumeric() || c == '_' || c == '-'
    });

    if !valid {
        return Err(GoogleDriveError::Request(RequestError::InvalidParameter {
            message: format!("Invalid file ID: {}", file_id),
            parameter: Some("file_id".to_string()),
        }));
    }

    Ok(())
}

pub fn validate_query(query: &str) -> Result<(), GoogleDriveError> {
    // Basic query validation to prevent injection
    // This is a simplified example; actual validation is more complex
    if query.contains("';") || query.contains("--") {
        return Err(GoogleDriveError::Request(RequestError::InvalidQuery {
            message: "Query contains potentially unsafe characters".to_string(),
        }));
    }

    Ok(())
}
```

### 9.6 Output Handling

```rust
impl Debug for File {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("File")
            .field("id", &self.id)
            .field("name", &self.name)
            .field("mime_type", &self.mime_type)
            // Don't include potentially sensitive fields like content
            .finish()
    }
}

// Sanitize error messages to avoid leaking credentials
impl Display for GoogleDriveError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Authentication(AuthenticationError::InvalidToken { .. }) => {
                write!(f, "Authentication failed: invalid access token")
                // Don't include the actual token in the error message
            }
            _ => write!(f, "{:?}", self),
        }
    }
}
```

---

## 10. Testing Architecture

### 10.1 Mock Transport for Unit Tests

```rust
pub struct MockTransport {
    responses: Arc<Mutex<VecDeque<MockResponse>>>,
    requests: Arc<Mutex<Vec<HttpRequest>>>,
}

pub struct MockResponse {
    status: StatusCode,
    headers: HeaderMap,
    body: Bytes,
    delay: Option<Duration>,
}

impl MockTransport {
    pub fn new() -> Self {
        Self {
            responses: Arc::new(Mutex::new(VecDeque::new())),
            requests: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn expect_request(&self, response: MockResponse) {
        self.responses.lock().unwrap().push_back(response);
    }

    pub fn verify_requests(&self) -> Vec<HttpRequest> {
        self.requests.lock().unwrap().clone()
    }
}

#[async_trait]
impl HttpTransport for MockTransport {
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError> {
        // Record request
        self.requests.lock().unwrap().push(request.clone());

        // Get next response
        let response = self.responses.lock().unwrap().pop_front()
            .ok_or(TransportError::NoMockResponse)?;

        // Simulate delay
        if let Some(delay) = response.delay {
            tokio::time::sleep(delay).await;
        }

        Ok(HttpResponse {
            status: response.status,
            headers: response.headers,
            body: response.body,
        })
    }
}
```

**Example Test:**

```rust
#[tokio::test]
async fn test_get_file_success() {
    // Setup mock transport
    let transport = MockTransport::new();
    transport.expect_request(MockResponse {
        status: StatusCode::OK,
        headers: HeaderMap::new(),
        body: Bytes::from(r#"{"kind":"drive#file","id":"123","name":"test.txt"}"#),
        delay: None,
    });

    // Create client with mock transport
    let client = create_test_client(Arc::new(transport));

    // Execute operation
    let file = client.files().get("123", None).await.unwrap();

    // Verify result
    assert_eq!(file.id, "123");
    assert_eq!(file.name, "test.txt");
}
```

### 10.2 Mock Services for Integration

```rust
pub struct MockFilesService {
    files: Arc<Mutex<HashMap<String, File>>>,
}

impl MockFilesService {
    pub fn new() -> Self {
        Self {
            files: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn add_file(&self, file: File) {
        self.files.lock().unwrap().insert(file.id.clone(), file);
    }
}

#[async_trait]
impl FilesService for MockFilesService {
    async fn get(&self, file_id: &str, _params: Option<GetFileParams>) -> Result<File, GoogleDriveError> {
        self.files.lock().unwrap()
            .get(file_id)
            .cloned()
            .ok_or_else(|| GoogleDriveError::Resource(ResourceError::FileNotFound {
                file_id: file_id.to_string(),
                message: "File not found in mock".to_string(),
            }))
    }

    async fn list(&self, _params: Option<ListFilesParams>) -> Result<FileList, GoogleDriveError> {
        let files = self.files.lock().unwrap()
            .values()
            .cloned()
            .collect();

        Ok(FileList {
            kind: "drive#fileList".to_string(),
            files,
            next_page_token: None,
            incomplete_search: false,
        })
    }

    // ... other methods
}
```

### 10.3 Trait-Based Testability

All services are defined as traits, allowing easy mocking:

```rust
// Production implementation
pub struct FilesServiceImpl {
    transport: Arc<dyn HttpTransport>,
    auth: Arc<dyn AuthProvider>,
    config: GoogleDriveConfig,
}

// Test implementation
pub struct MockFilesService {
    // ... mock state
}

// Both implement the same trait
#[async_trait]
pub trait FilesService: Send + Sync {
    async fn get(&self, file_id: &str, params: Option<GetFileParams>) -> Result<File, GoogleDriveError>;
    // ... other methods
}
```

### 10.4 Integration Test Structure

```rust
// tests/integration/mod.rs
mod common;
mod files_tests;
mod permissions_tests;
mod upload_tests;
mod auth_tests;

// tests/integration/common.rs
pub fn setup_test_client() -> GoogleDriveClient {
    // Setup client with real or test credentials
    // Reads from environment or test config
}

// tests/integration/files_tests.rs
#[tokio::test]
async fn test_create_and_get_file() {
    let client = common::setup_test_client();

    // Create file
    let created = client.files().create(CreateFileRequest {
        name: "test.txt".to_string(),
        mime_type: Some("text/plain".to_string()),
        ..Default::default()
    }).await.expect("Failed to create file");

    // Get file
    let retrieved = client.files().get(&created.id, None)
        .await.expect("Failed to get file");

    // Verify
    assert_eq!(created.id, retrieved.id);
    assert_eq!(created.name, retrieved.name);

    // Cleanup
    client.files().delete(&created.id, None)
        .await.expect("Failed to delete file");
}
```

---

## 11. Observability

### 11.1 Tracing Spans per Operation

Every API operation creates a distributed tracing span:

```rust
use integrations_tracing::{trace_span, Instrument};

pub async fn create_file(
    &self,
    request: CreateFileRequest,
) -> Result<File, GoogleDriveError> {
    let span = trace_span!(
        "google_drive.files.create",
        "google_drive.service" = "files",
        "google_drive.operation" = "create",
        "google_drive.file_name" = %request.name,
        "google_drive.mime_type" = request.mime_type.as_deref().unwrap_or("unknown"),
    );

    self.create_file_impl(request)
        .instrument(span)
        .await
}
```

**Span Hierarchy Example:**

```
google_drive.files.create
├── google_drive.auth.get_token
│   └── http.request (POST /token)
├── http.request (POST /drive/v3/files)
└── google_drive.response.parse
```

### 11.2 Metrics Collection

Key metrics emitted by the module:

```rust
use integrations_metrics::{counter, histogram, gauge};

// Request metrics
counter!(
    "google_drive_requests_total",
    1,
    "service" => "files",
    "operation" => "create",
    "method" => "POST",
    "status" => "200"
);

histogram!(
    "google_drive_request_duration_seconds",
    duration.as_secs_f64(),
    "service" => "files",
    "operation" => "create",
    "method" => "POST"
);

// Error metrics
counter!(
    "google_drive_errors_total",
    1,
    "service" => "files",
    "error_type" => "rate_limit"
);

// Upload/download metrics
counter!(
    "google_drive_upload_bytes_total",
    bytes_uploaded,
    "upload_type" => "resumable"
);

histogram!(
    "google_drive_upload_duration_seconds",
    duration.as_secs_f64(),
    "upload_type" => "resumable"
);

// Circuit breaker state
gauge!(
    "google_drive_circuit_breaker_state",
    state_value,
    "state" => "open" // or "closed", "half_open"
);
```

### 11.3 Structured Logging

All logs use structured format:

```rust
use integrations_logging::{info, warn, error, debug};

// Info logs
info!(
    "File created successfully",
    file_id = %file.id,
    file_name = %file.name,
    duration_ms = duration.as_millis()
);

// Warning logs
warn!(
    "Rate limit exceeded, retrying",
    retry_attempt = attempt,
    retry_after_seconds = retry_after.as_secs(),
    operation = "files.list"
);

// Error logs
error!(
    "Failed to upload file",
    file_name = %request.name,
    error = %err,
    error_type = ?err,
    upload_type = "resumable"
);

// Debug logs
debug!(
    "Sending HTTP request",
    method = %request.method,
    url = %request.url,
    headers_count = request.headers.len()
);
```

### 11.4 Observability Best Practices

1. **Always include context**: file_id, operation, service
2. **Use consistent labels**: Same label names across metrics, logs, traces
3. **Sanitize sensitive data**: Never log tokens, credentials
4. **Measure latency**: Record duration for all operations
5. **Track errors separately**: Count and categorize errors
6. **Use hierarchical spans**: Parent-child relationships for complex operations
7. **Include retry information**: Attempt number, backoff delay

---

## 12. Deployment Considerations

### 12.1 Crate/Package Versioning

**Semantic Versioning:**

- **MAJOR**: Breaking API changes (e.g., 1.0.0 → 2.0.0)
- **MINOR**: New features, backward compatible (e.g., 1.0.0 → 1.1.0)
- **PATCH**: Bug fixes, backward compatible (e.g., 1.0.0 → 1.0.1)

**Version Compatibility:**

```toml
# Cargo.toml
[package]
name = "integrations-google-drive"
version = "1.0.0"
edition = "2021"

[dependencies]
integrations-errors = "^1.0"  # Compatible with 1.x
integrations-retry = "^1.0"
integrations-circuit-breaker = "^1.0"
```

### 12.2 Feature Flags

Enable optional functionality via feature flags:

```toml
# Cargo.toml
[features]
default = ["rustls-tls"]
rustls-tls = ["reqwest/rustls-tls"]
native-tls = ["reqwest/native-tls"]
service-account = ["jsonwebtoken"]
oauth2 = []
streaming = ["tokio-util"]
```

**Usage:**

```toml
# Consumer's Cargo.toml
[dependencies]
integrations-google-drive = { version = "1.0", features = ["service-account", "streaming"] }
```

### 12.3 Configuration Sources

Support multiple configuration sources:

```rust
use integrations_config::ConfigSource;

pub struct GoogleDriveConfig {
    // ... fields
}

impl GoogleDriveConfig {
    /// Create config from environment variables
    pub fn from_env() -> Result<Self, ConfigurationError> {
        let client_id = std::env::var("GOOGLE_DRIVE_CLIENT_ID")?;
        let client_secret = std::env::var("GOOGLE_DRIVE_CLIENT_SECRET")?;
        // ... load other fields
        Ok(Self { /* ... */ })
    }

    /// Create config from file
    pub fn from_file(path: &Path) -> Result<Self, ConfigurationError> {
        let contents = std::fs::read_to_string(path)?;
        let config: Self = serde_json::from_str(&contents)?;
        Ok(config)
    }

    /// Create config from builder pattern
    pub fn builder() -> GoogleDriveConfigBuilder {
        GoogleDriveConfigBuilder::default()
    }
}
```

**Environment Variables:**

```bash
# OAuth 2.0
GOOGLE_DRIVE_CLIENT_ID=...
GOOGLE_DRIVE_CLIENT_SECRET=...
GOOGLE_DRIVE_REFRESH_TOKEN=...

# Service Account
GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY=...  # Path to JSON key file

# Configuration
GOOGLE_DRIVE_TIMEOUT_SECONDS=300
GOOGLE_DRIVE_MAX_RETRIES=3
GOOGLE_DRIVE_UPLOAD_CHUNK_SIZE=8388608  # 8MB
```

### 12.4 Runtime Dependencies

**Rust:**

- **Runtime**: tokio (required)
- **HTTP client**: reqwest (required)
- **TLS**: rustls or native-tls (one required)
- **JSON**: serde_json (required)

**TypeScript:**

- **Runtime**: Node.js 18+ or modern browser
- **HTTP client**: native fetch (built-in)
- **JSON**: built-in
- **Validation**: zod (required)

### 12.5 Performance Tuning

**Connection Pool:**

```rust
let transport = ReqwestTransport::builder()
    .pool_max_idle_per_host(20)  // Increase for high concurrency
    .pool_idle_timeout(Duration::from_secs(90))
    .build();
```

**Chunk Size:**

```rust
let config = GoogleDriveConfig::builder()
    .upload_chunk_size(16 * 1024 * 1024)  // 16MB for faster uploads
    .build();
```

**Rate Limiting:**

```rust
let config = GoogleDriveConfig::builder()
    .rate_limit_config(RateLimitConfig {
        user_queries_per_100_seconds: 500,  // Reduce to avoid hitting limits
        max_concurrent_requests: Some(5),    // Lower concurrency
        ..Default::default()
    })
    .build();
```

### 12.6 Monitoring in Production

**Health Checks:**

```rust
pub async fn health_check(&self) -> Result<(), GoogleDriveError> {
    // Simple health check: get about info
    self.about().get(GetAboutParams {
        fields: Some("user".to_string()),
    }).await?;
    Ok(())
}
```

**Metrics Dashboard:**

- Request rate (requests/second)
- Error rate (errors/second)
- Latency percentiles (p50, p90, p99)
- Circuit breaker state
- Rate limit hits
- Upload/download throughput

**Alerts:**

- Error rate > 5% for 5 minutes
- Circuit breaker open for > 1 minute
- Rate limit hits > 100/hour
- Latency p99 > 10 seconds

---

## Summary

This architecture document provides a comprehensive blueprint for implementing the Google Drive Integration Module. Key architectural decisions include:

1. **Layered architecture** with clear separation of concerns (client → services → transport → API)
2. **Trait-based design** for testability and extensibility
3. **Async-first** with tokio/promises for efficient I/O
4. **Resilience patterns** integrated throughout (retry, circuit breaker, rate limiting)
5. **Comprehensive observability** with tracing, metrics, and structured logging
6. **Security-first** credential handling with SecretString and TLS enforcement
7. **Type-safe** APIs with builder patterns and validation
8. **Streaming support** for large file uploads/downloads
9. **Pagination abstraction** for ergonomic list operations
10. **Clean error hierarchy** with retryability classification

The module is designed to be production-ready, maintainable, and extensible while maintaining clean dependency boundaries and adhering to SOLID principles.

---

**Next Steps:**

1. **Pseudocode Phase**: Detailed algorithmic descriptions for each component
2. **Implementation Phase**: Code generation based on this architecture
3. **Testing Phase**: Comprehensive unit and integration tests
4. **Documentation Phase**: API docs, examples, and migration guides

---

**Document Control**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Architecture | Initial architecture document |
