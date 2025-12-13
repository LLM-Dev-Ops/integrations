# Architecture: GitHub Container Registry Integration Module

## SPARC Phase 3: Architecture

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/ghcr`

---

## Table of Contents

1. [System Context](#1-system-context)
2. [Component Architecture](#2-component-architecture)
3. [Data Flow](#3-data-flow)
4. [Module Structure](#4-module-structure)
5. [Concurrency Model](#5-concurrency-model)
6. [Error Handling](#6-error-handling)
7. [Integration Patterns](#7-integration-patterns)

---

## 1. System Context

### 1.1 C4 Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYSTEM CONTEXT                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│    ┌──────────────┐         ┌──────────────────────┐                        │
│    │   LLM Dev    │         │   Workflow Engine    │                        │
│    │   Ops Core   │         │                      │                        │
│    └──────┬───────┘         └──────────┬───────────┘                        │
│           │                            │                                     │
│           │  Image operations          │  Event triggers                     │
│           │                            │                                     │
│           ▼                            ▼                                     │
│    ┌─────────────────────────────────────────────────┐                      │
│    │                                                  │                      │
│    │            GHCR Integration Module               │                      │
│    │                                                  │                      │
│    │  ┌─────────┐ ┌─────────┐ ┌─────────┐           │                      │
│    │  │ Images  │ │  Tags   │ │Versions │           │                      │
│    │  └─────────┘ └─────────┘ └─────────┘           │                      │
│    │                                                  │                      │
│    └──────────────────┬──────────────────────────────┘                      │
│                       │                                                      │
│           ┌───────────┼───────────┐                                         │
│           │           │           │                                          │
│           ▼           ▼           ▼                                          │
│    ┌──────────┐ ┌──────────┐ ┌──────────┐                                   │
│    │ ghcr.io  │ │ GitHub   │ │  Shared  │                                   │
│    │ Registry │ │ API      │ │  Auth    │                                   │
│    │ (OCI)    │ │ Packages │ │          │                                   │
│    └──────────┘ └──────────┘ └──────────┘                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 External Dependencies

| System | Protocol | Purpose |
|--------|----------|---------|
| ghcr.io | OCI Distribution v2 | Registry operations |
| api.github.com | REST | Packages API, vuln data |
| Shared Auth | Internal | Token management |
| Shared Metrics | Internal | Prometheus export |
| Vector Memory | Internal | Metadata indexing |

---

## 2. Component Architecture

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GHCR INTEGRATION MODULE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         PUBLIC API LAYER                             │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │    │
│  │  │ ImageOps    │ │ TagOps      │ │ VersionOps  │ │ VulnOps     │   │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         GHCR CLIENT CORE                             │    │
│  │                                                                      │    │
│  │   ┌─────────────────────────────────────────────────────────────┐   │    │
│  │   │                    Request Pipeline                          │   │    │
│  │   │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │   │    │
│  │   │  │  Auth   │─▶│  Rate   │─▶│ Retry   │─▶│ Execute │        │   │    │
│  │   │  │ Inject  │  │ Limiter │  │ Handler │  │         │        │   │    │
│  │   │  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │   │    │
│  │   └─────────────────────────────────────────────────────────────┘   │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                      │                                       │
│         ┌────────────────────────────┼────────────────────────────┐         │
│         ▼                            ▼                            ▼         │
│  ┌─────────────┐           ┌─────────────────┐           ┌─────────────┐   │
│  │   Token     │           │    Manifest     │           │  Simulation │   │
│  │   Manager   │           │    Parser       │           │    Layer    │   │
│  │             │           │                 │           │             │   │
│  │ ┌─────────┐ │           │ ┌─────────────┐ │           │ ┌─────────┐ │   │
│  │ │ Cache   │ │           │ │ Docker v2   │ │           │ │Recorder │ │   │
│  │ └─────────┘ │           │ │ OCI v1      │ │           │ │Replayer │ │   │
│  │ ┌─────────┐ │           │ │ Index       │ │           │ └─────────┘ │   │
│  │ │ Refresh │ │           │ └─────────────┘ │           │             │   │
│  │ └─────────┘ │           │                 │           │             │   │
│  └─────────────┘           └─────────────────┘           └─────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        INFRASTRUCTURE LAYER                          │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐        │    │
│  │  │ HTTP      │  │ Metrics   │  │ Tracing   │  │ Config    │        │    │
│  │  │ Client    │  │ Collector │  │           │  │           │        │    │
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────┘        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| ImageOps | Push, pull, delete, copy images |
| TagOps | List, create, delete, retag |
| VersionOps | Package version management via API |
| VulnOps | Vulnerability metadata queries |
| TokenManager | Scope-based token caching and refresh |
| RateLimiter | Preemptive throttling, 429 handling |
| ManifestParser | Multi-format manifest parsing |
| SimulationLayer | Record/replay for testing |

---

## 3. Data Flow

### 3.1 Image Push Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            IMAGE PUSH FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Client                    GHCR Module                     ghcr.io          │
│    │                           │                              │              │
│    │  push_image(ref, layers)  │                              │              │
│    │──────────────────────────▶│                              │              │
│    │                           │                              │              │
│    │                           │  GET /token?scope=push,pull  │              │
│    │                           │─────────────────────────────▶│              │
│    │                           │◀─────────────────────────────│              │
│    │                           │  { token: "..." }            │              │
│    │                           │                              │              │
│    │                           │  FOR each layer:             │              │
│    │                           │  ┌─────────────────────────┐ │              │
│    │                           │  │ HEAD /blobs/{digest}    │ │              │
│    │                           │  │─────────────────────────│▶│              │
│    │                           │  │◀────────────────────────│─│              │
│    │                           │  │ 404 Not Found           │ │              │
│    │                           │  │                         │ │              │
│    │                           │  │ POST /blobs/uploads/    │ │              │
│    │                           │  │─────────────────────────│▶│              │
│    │                           │  │◀────────────────────────│─│              │
│    │                           │  │ Location: /uploads/{id} │ │              │
│    │                           │  │                         │ │              │
│    │                           │  │ PATCH (chunked upload)  │ │              │
│    │                           │  │─────────────────────────│▶│              │
│    │                           │  │                         │ │              │
│    │                           │  │ PUT ?digest=sha256:...  │ │              │
│    │                           │  │─────────────────────────│▶│              │
│    │                           │  │◀────────────────────────│─│              │
│    │                           │  │ 201 Created             │ │              │
│    │                           │  └─────────────────────────┘ │              │
│    │                           │                              │              │
│    │                           │  PUT /manifests/{tag}        │              │
│    │                           │─────────────────────────────▶│              │
│    │                           │◀─────────────────────────────│              │
│    │                           │  201 { digest: "sha256:..." }│              │
│    │                           │                              │              │
│    │  Ok(digest)               │                              │              │
│    │◀──────────────────────────│                              │              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Rate Limit Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          RATE LIMIT HANDLING                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Request                 RateLimiter                    Execution            │
│    │                         │                              │                │
│    │  check_throttle()       │                              │                │
│    │────────────────────────▶│                              │                │
│    │                         │                              │                │
│    │                         │  remaining/limit < 20%?      │                │
│    │                         │  ┌────────────────────┐      │                │
│    │                         │  │ YES: Calculate     │      │                │
│    │                         │  │ proportional delay │      │                │
│    │                         │  │ sleep(delay)       │      │                │
│    │                         │  └────────────────────┘      │                │
│    │                         │                              │                │
│    │  Ok(proceed)            │                              │                │
│    │◀────────────────────────│                              │                │
│    │                         │                              │                │
│    │  execute_request()      │                              │                │
│    │────────────────────────────────────────────────────────▶│               │
│    │                         │                              │                │
│    │  response + headers     │                              │                │
│    │◀────────────────────────────────────────────────────────│               │
│    │                         │                              │                │
│    │  update(headers)        │                              │                │
│    │────────────────────────▶│                              │                │
│    │                         │  Parse X-RateLimit-*         │                │
│    │                         │  Update atomics              │                │
│    │                         │                              │                │
│    │                    ─────┼──────────────────────────────┼─────           │
│    │                         │  IF 429 Too Many Requests    │                │
│    │                         │  ┌────────────────────┐      │                │
│    │                         │  │ Parse Retry-After  │      │                │
│    │                         │  │ sleep(retry_after) │      │                │
│    │                         │  │ Retry request      │      │                │
│    │                         │  └────────────────────┘      │                │
│    │                         │                              │                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Token Refresh Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TOKEN REFRESH FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Request              TokenManager              ghcr.io        SharedAuth   │
│    │                       │                       │               │         │
│    │  get_token(scope)     │                       │               │         │
│    │──────────────────────▶│                       │               │         │
│    │                       │                       │               │         │
│    │                       │  Check cache          │               │         │
│    │                       │  ┌──────────────┐     │               │         │
│    │                       │  │ Cache hit?   │     │               │         │
│    │                       │  │ Not expired? │     │               │         │
│    │                       │  └──────┬───────┘     │               │         │
│    │                       │         │             │               │         │
│    │                       │    YES  │  NO         │               │         │
│    │                       │    │    │             │               │         │
│    │  cached_token         │◀──┘    │             │               │         │
│    │◀──────────────────────│         │             │               │         │
│    │                       │         │             │               │         │
│    │                       │         │ get_creds() │               │         │
│    │                       │         │─────────────────────────────▶│        │
│    │                       │         │◀────────────────────────────│         │
│    │                       │         │ (user, PAT)                 │         │
│    │                       │         │             │               │         │
│    │                       │         │ GET /token  │               │         │
│    │                       │         │────────────▶│               │         │
│    │                       │         │◀────────────│               │         │
│    │                       │         │ {token}     │               │         │
│    │                       │         │             │               │         │
│    │                       │  Cache token          │               │         │
│    │                       │  (TTL: 4.5 min)       │               │         │
│    │                       │         │             │               │         │
│    │  new_token            │◀────────┘             │               │         │
│    │◀──────────────────────│                       │               │         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Module Structure

### 4.1 Directory Layout

```
integrations/ghcr/
├── Cargo.toml
├── src/
│   ├── lib.rs                 # Public exports, prelude
│   ├── client.rs              # GhcrClient implementation
│   ├── config.rs              # GhcrConfig, builder
│   ├── error.rs               # GhcrError enum
│   │
│   ├── types/
│   │   ├── mod.rs             # Type exports
│   │   ├── image.rs           # ImageRef, Reference
│   │   ├── manifest.rs        # Manifest, Descriptor, Platform
│   │   ├── package.rs         # PackageVersion, Visibility
│   │   ├── vulnerability.rs   # Vulnerability, Severity
│   │   └── rate_limit.rs      # RateLimitInfo
│   │
│   ├── operations/
│   │   ├── mod.rs             # Trait definitions
│   │   ├── images.rs          # Push, pull, delete, copy
│   │   ├── tags.rs            # List, create, delete
│   │   ├── manifests.rs       # Get, put, head
│   │   ├── blobs.rs           # Upload, mount, check
│   │   ├── versions.rs        # Package version ops
│   │   └── vulnerabilities.rs # Vuln metadata queries
│   │
│   ├── auth/
│   │   ├── mod.rs             # Auth exports
│   │   ├── token_manager.rs   # Token cache, refresh
│   │   └── providers.rs       # Credential providers
│   │
│   ├── rate_limit.rs          # RateLimiter impl
│   ├── manifest_parser.rs     # Multi-format parsing
│   │
│   ├── simulation/
│   │   ├── mod.rs             # Simulation exports
│   │   ├── recorder.rs        # Request recording
│   │   └── replayer.rs        # Request replay
│   │
│   └── metrics.rs             # Prometheus metrics
│
├── tests/
│   ├── integration/
│   │   ├── image_tests.rs
│   │   ├── tag_tests.rs
│   │   ├── version_tests.rs
│   │   └── rate_limit_tests.rs
│   └── fixtures/
│       └── *.json
│
└── examples/
    ├── push_image.rs
    ├── list_tags.rs
    └── cleanup_versions.rs
```

### 4.2 Module Dependencies

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MODULE DEPENDENCIES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  lib.rs                                                                      │
│    │                                                                         │
│    ├── client.rs                                                             │
│    │     ├── config.rs                                                       │
│    │     ├── auth/token_manager.rs ──────▶ auth/providers.rs                │
│    │     ├── rate_limit.rs                                                   │
│    │     ├── simulation/mod.rs                                               │
│    │     └── metrics.rs                                                      │
│    │                                                                         │
│    ├── operations/mod.rs                                                     │
│    │     ├── images.rs ──────────────────▶ manifest_parser.rs               │
│    │     │     │                                                             │
│    │     │     └──────────────────────────▶ operations/blobs.rs             │
│    │     │                                                                   │
│    │     ├── tags.rs ────────────────────▶ operations/manifests.rs          │
│    │     ├── versions.rs                                                     │
│    │     └── vulnerabilities.rs                                              │
│    │                                                                         │
│    ├── types/mod.rs                                                          │
│    │     ├── image.rs                                                        │
│    │     ├── manifest.rs                                                     │
│    │     ├── package.rs                                                      │
│    │     ├── vulnerability.rs                                                │
│    │     └── rate_limit.rs                                                   │
│    │                                                                         │
│    └── error.rs ◀──────────────────────── (all modules)                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Concurrency Model

### 5.1 Shared State

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONCURRENCY MODEL                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  GhcrClient (Arc)                                                            │
│  ├── config: Arc<GhcrConfig>                    [Immutable - no sync]       │
│  ├── http_client: Arc<HttpClient>               [Internally synchronized]   │
│  ├── token_cache: Arc<RwLock<HashMap>>          [Read-heavy, write-rare]    │
│  ├── rate_limiter: Arc<RateLimiter>             [Atomic operations]         │
│  ├── simulation: Arc<SimulationLayer>           [RwLock internally]         │
│  └── metrics: Arc<MetricsCollector>             [Atomic counters]           │
│                                                                              │
│  Synchronization Strategy:                                                   │
│  ┌──────────────────┬───────────────────┬──────────────────────────────┐    │
│  │ Component        │ Sync Mechanism    │ Rationale                    │    │
│  ├──────────────────┼───────────────────┼──────────────────────────────┤    │
│  │ Token Cache      │ RwLock            │ Many reads, few writes       │    │
│  │ Rate Limit State │ Atomics           │ Fast, lock-free updates      │    │
│  │ Simulation Recs  │ RwLock            │ Append-only during record    │    │
│  │ Metrics          │ Atomics           │ Counter increments           │    │
│  └──────────────────┴───────────────────┴──────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Concurrent Upload Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CONCURRENT BLOB UPLOAD                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  push_image_parallel(image, layers, max_concurrency)                         │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                                                                      │    │
│  │   Semaphore(max_concurrency)                                         │    │
│  │        │                                                             │    │
│  │   ┌────┴────┬────────┬────────┐                                     │    │
│  │   ▼         ▼        ▼        ▼                                     │    │
│  │ ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐                                  │    │
│  │ │Task1│  │Task2│  │Task3│  │Task4│  ... (layer uploads)             │    │
│  │ └──┬──┘  └──┬──┘  └──┬──┘  └──┬──┘                                  │    │
│  │    │        │        │        │                                      │    │
│  │    └────────┴────────┴────────┘                                      │    │
│  │                 │                                                    │    │
│  │                 ▼                                                    │    │
│  │         join_all(tasks)                                              │    │
│  │                 │                                                    │    │
│  │                 ▼                                                    │    │
│  │         push_manifest()                                              │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Benefits:                                                                   │
│  - Parallel layer uploads maximize throughput                                │
│  - Semaphore prevents connection exhaustion                                  │
│  - Rate limiter shared across all tasks                                      │
│  - Single manifest push after all layers complete                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Error Handling

### 6.1 Error Taxonomy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ERROR TAXONOMY                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  GhcrError                                                                   │
│  │                                                                           │
│  ├── Authentication                                                          │
│  │   ├── AuthFailed { status, message }      [401 from token endpoint]      │
│  │   ├── Unauthorized                        [401 after token refresh]      │
│  │   └── TokenExpired                        [Token cache miss + fail]      │
│  │                                                                           │
│  ├── Authorization                                                           │
│  │   ├── Forbidden { scope }                 [403 - insufficient perms]     │
│  │   └── VulnDataNotAvailable                [403 - no GHAS access]         │
│  │                                                                           │
│  ├── Resource                                                                │
│  │   ├── NotFound { resource }               [404 - image/tag/version]      │
│  │   ├── ManifestNotFound { ref }            [404 - specific manifest]      │
│  │   └── BlobNotFound { digest }             [404 - blob lookup]            │
│  │                                                                           │
│  ├── Rate Limiting                                                           │
│  │   ├── RateLimited { reset_at }            [429 - quota exceeded]         │
│  │   └── ThrottleTimeout                     [Throttle wait too long]       │
│  │                                                                           │
│  ├── Protocol                                                                │
│  │   ├── UnsupportedMediaType { media_type } [Unknown manifest type]        │
│  │   ├── InvalidManifest { reason }          [Parse failure]                │
│  │   ├── DigestMismatch { expected, actual } [Integrity failure]            │
│  │   └── MissingHeader { name }              [Required header absent]       │
│  │                                                                           │
│  ├── Upload                                                                  │
│  │   ├── UploadFailed { reason }             [Blob upload error]            │
│  │   ├── ChunkFailed { offset, size }        [Chunk upload error]           │
│  │   └── MountFailed { digest }              [Cross-repo mount fail]        │
│  │                                                                           │
│  ├── Server                                                                  │
│  │   ├── ServerError { status }              [5xx response]                 │
│  │   └── ServiceUnavailable                  [503]                          │
│  │                                                                           │
│  └── Internal                                                                │
│      ├── ConfigError { message }             [Invalid config]               │
│      ├── SimulationMismatch                  [Replay not found]             │
│      └── Internal { source }                 [Unexpected error]             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Retry Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            RETRY STRATEGY                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┬────────────┬─────────────┬────────────────────────┐    │
│  │ Error Type      │ Retryable  │ Max Retries │ Backoff                │    │
│  ├─────────────────┼────────────┼─────────────┼────────────────────────┤    │
│  │ 401 Unauthorized│ Once       │ 1           │ Immediate (refresh)    │    │
│  │ 429 Rate Limited│ Yes        │ 3           │ Retry-After header     │    │
│  │ 500 Server Error│ Yes        │ 3           │ Exponential (1,2,4s)   │    │
│  │ 502 Bad Gateway │ Yes        │ 3           │ Exponential            │    │
│  │ 503 Unavailable │ Yes        │ 3           │ Exponential            │    │
│  │ 504 Timeout     │ Yes        │ 3           │ Exponential            │    │
│  │ Connection Error│ Yes        │ 3           │ Exponential            │    │
│  │ 400 Bad Request │ No         │ 0           │ -                      │    │
│  │ 403 Forbidden   │ No         │ 0           │ -                      │    │
│  │ 404 Not Found   │ No         │ 0           │ -                      │    │
│  └─────────────────┴────────────┴─────────────┴────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Integration Patterns

### 7.1 Push-and-Tag Pattern

```rust
// Atomic image push with multiple tags
async fn push_with_tags(
    client: &GhcrClient,
    image: &str,
    manifest: &Manifest,
    tags: &[&str],
) -> Result<String> {
    // Push to first tag
    let primary = ImageRef::new(image, tags[0]);
    let digest = client.push_manifest(&primary, manifest).await?;

    // Tag with remaining tags (parallel)
    let futures: Vec<_> = tags[1..].iter()
        .map(|tag| client.tag_image(&primary, tag))
        .collect();

    futures::future::try_join_all(futures).await?;

    Ok(digest)
}
```

### 7.2 Version Cleanup Pattern

```rust
// Cleanup old versions keeping latest N and pattern matches
async fn cleanup_versions(
    client: &GhcrClient,
    owner: &str,
    package: &str,
    keep_latest: usize,
    keep_patterns: &[&str],
) -> Result<CleanupReport> {
    let versions = client.list_versions(owner, package).await?;

    let patterns: Vec<Regex> = keep_patterns.iter()
        .map(|p| Regex::new(p))
        .collect::<Result<_, _>>()?;

    client.cleanup_old_versions(
        owner, package,
        OwnerType::Org,
        keep_latest,
        &patterns,
    ).await
}
```

### 7.3 Vulnerability Check Pattern

```rust
// Check image for critical vulnerabilities before deployment
async fn security_gate(
    client: &GhcrClient,
    owner: &str,
    package: &str,
    version_id: u64,
    max_severity: Severity,
) -> Result<GateResult> {
    let report = client.get_vulnerabilities(
        owner, package, version_id, OwnerType::Org
    ).await?;

    let blocking = report.vulnerabilities.iter()
        .filter(|v| v.severity >= max_severity)
        .collect::<Vec<_>>();

    if blocking.is_empty() {
        Ok(GateResult::Passed)
    } else {
        Ok(GateResult::Blocked { vulnerabilities: blocking })
    }
}
```

### 7.4 Multi-Arch Build Pattern

```rust
// Create multi-arch manifest index
async fn create_multiarch_image(
    client: &GhcrClient,
    image: &str,
    tag: &str,
    platform_digests: &[(Platform, String)],
) -> Result<String> {
    let manifests: Vec<Descriptor> = platform_digests.iter()
        .map(|(platform, digest)| Descriptor {
            media_type: MediaType::OciManifest,
            digest: digest.clone(),
            size: 0, // Will be filled by registry
            platform: Some(platform.clone()),
            ..Default::default()
        })
        .collect();

    let index = Manifest::Index(OciIndex {
        schema_version: 2,
        media_type: MediaType::OciIndex,
        manifests,
        annotations: None,
    });

    let image_ref = ImageRef::new(image, tag);
    client.push_manifest(&image_ref, &index).await
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-GHCR-ARCH-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Architecture Document**

*Proceed to Refinement phase upon approval.*
