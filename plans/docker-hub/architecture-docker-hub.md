# Docker Hub Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/docker-hub`

---

## 1. Module Structure

### 1.1 Directory Layout

```
integrations/docker-hub/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Public API exports
│   ├── client.rs                 # DockerHubClient core
│   ├── config.rs                 # Configuration types
│   ├── error.rs                  # Error hierarchy
│   ├── auth/
│   │   ├── mod.rs
│   │   ├── hub_auth.rs           # Docker Hub JWT auth
│   │   ├── registry_auth.rs      # Registry bearer tokens
│   │   └── token_cache.rs        # Scoped token cache
│   ├── services/
│   │   ├── mod.rs
│   │   ├── repository.rs         # Repository operations
│   │   ├── manifest.rs           # Manifest operations
│   │   ├── blob.rs               # Blob operations
│   │   ├── tag.rs                # Tag operations
│   │   └── vulnerability.rs      # Scan data
│   ├── webhook/
│   │   ├── mod.rs
│   │   ├── handler.rs            # Webhook processing
│   │   └── events.rs             # Event types
│   ├── types/
│   │   ├── mod.rs
│   │   ├── manifest.rs           # Manifest types
│   │   ├── image.rs              # Image reference types
│   │   ├── repository.rs         # Repository types
│   │   └── vulnerability.rs      # CVE types
│   ├── simulation/
│   │   ├── mod.rs
│   │   ├── mock.rs               # Mock registry
│   │   ├── recorder.rs           # Call recorder
│   │   └── replayer.rs           # Replay engine
│   └── util/
│       ├── mod.rs
│       ├── rate_limiter.rs       # Docker rate limiter
│       ├── digest.rs             # SHA256 utilities
│       └── reference.rs          # Image reference parsing
├── tests/
│   ├── integration/
│   │   ├── auth_tests.rs
│   │   ├── manifest_tests.rs
│   │   ├── blob_tests.rs
│   │   └── webhook_tests.rs
│   └── unit/
│       ├── digest_tests.rs
│       ├── reference_tests.rs
│       └── rate_limiter_tests.rs
└── typescript/
    ├── package.json
    ├── src/
    │   ├── index.ts
    │   ├── client.ts
    │   ├── services/
    │   └── types/
    └── tests/
```

### 1.2 Component Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                         Public API                               │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌───────┐ ┌─────────────┐│
│  │Repository│ │ Manifest │ │  Blob  │ │  Tag  │ │Vulnerability││
│  │ Service  │ │ Service  │ │Service │ │Service│ │  Service    ││
│  └────┬─────┘ └────┬─────┘ └───┬────┘ └───┬───┘ └──────┬──────┘│
└───────┼────────────┼───────────┼─────────┼─────────────┼────────┘
        │            │           │         │             │
        └────────────┴───────────┴─────────┴─────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
      ┌───────────────┐               ┌───────────────┐
      │   Hub API     │               │  Registry API │
      │   Client      │               │    Client     │
      └───────┬───────┘               └───────┬───────┘
              │                               │
              └───────────────┬───────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  DockerHubClient  │
                    │  ┌─────────────┐  │
                    │  │ HTTP Client │  │
                    │  └─────────────┘  │
                    └─────────┬─────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼───────┐   ┌─────────▼─────────┐   ┌──────▼──────┐
│  Auth Layer   │   │  Rate Limiter     │   │  Circuit    │
│ ┌───────────┐ │   │  (Pull/Push)      │   │  Breaker    │
│ │ Hub JWT   │ │   └───────────────────┘   └─────────────┘
│ │ Registry  │ │
│ │  Bearer   │ │
│ └───────────┘ │
└───────────────┘
        │
┌───────▼───────────────────────────────────────────────────────┐
│                     Shared Modules                             │
│  ┌──────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │ credentials  │ │ resilience  │ │     observability       │ │
│  └──────────────┘ └─────────────┘ └─────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Component Architecture

### 2.1 DockerHubClient Core

```
┌─────────────────────────────────────────────────────────────┐
│                     DockerHubClient                          │
├─────────────────────────────────────────────────────────────┤
│ Configuration                                                │
│ ┌─────────────┐ ┌──────────────┐ ┌────────────────────────┐ │
│ │  hub_url    │ │ registry_url │ │    credentials         │ │
│ └─────────────┘ └──────────────┘ └────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│ Dual API Request Pipelines                                   │
│                                                              │
│ Hub API:                                                     │
│  Request → [Hub JWT] → [Rate Limit] → [HTTP] → Response     │
│                                                              │
│ Registry API:                                                │
│  Request → [Bearer Token] → [Rate Limit] → [HTTP] → Response│
│                                                              │
├─────────────────────────────────────────────────────────────┤
│ Services (Lazy Initialized)                                  │
│ ┌──────┐ ┌──────────┐ ┌──────┐ ┌─────┐ ┌───────────────┐   │
│ │repos │ │manifests │ │blobs │ │tags │ │vulnerabilities│   │
│ └──────┘ └──────────┘ └──────┘ └─────┘ └───────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Service Layer Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    Service Traits                            │
├─────────────────────────────────────────────────────────────┤
│  trait ManifestService {                                     │
│      fn get(&self, image) -> Result<Manifest>               │
│      fn put(&self, image, manifest) -> Result<String>       │
│      fn delete(&self, image) -> Result<()>                  │
│      fn exists(&self, image) -> Result<bool>                │
│  }                                                           │
│                                                              │
│  trait BlobService {                                         │
│      fn exists(&self, image, digest) -> Result<bool>        │
│      fn get(&self, image, digest) -> Result<Bytes>          │
│      fn upload(&self, image, data) -> Result<String>        │
│      fn upload_chunked(&self, image, reader) -> Result<...> │
│  }                                                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────┐      ┌─────────────────────┐       │
│  │ ManifestServiceImpl │      │ MockManifestService │       │
│  │ (Production)        │      │ (Testing)           │       │
│  └──────────┬──────────┘      └──────────┬──────────┘       │
│             │                            │                   │
│             └────────────┬───────────────┘                   │
│                          │                                   │
│                    implements                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Authentication Architecture

### 3.1 Dual Authentication Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Docker Hub Authentication Flow                        │
└──────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                         Hub API (hub.docker.com)                        │
  │                                                                         │
  │  ┌──────────┐     ┌──────────────┐     ┌──────────────────────────┐   │
  │  │ username │────▶│ POST /login  │────▶│ JWT Token (expires ~5min)│   │
  │  │ password │     │              │     │ + Refresh Token          │   │
  │  └──────────┘     └──────────────┘     └──────────────────────────┘   │
  │                                                                         │
  │  Subsequent requests: Authorization: JWT <token>                        │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                    Registry API (registry-1.docker.io)                  │
  │                                                                         │
  │  ┌──────────┐     ┌────────────────┐     ┌────────────────────────┐   │
  │  │ username │────▶│ GET /token     │────▶│ Bearer Token           │   │
  │  │ password │     │ ?scope=repo:.. │     │ (scope-specific)       │   │
  │  └──────────┘     │ &service=...   │     └────────────────────────┘   │
  │                   └────────────────┘                                   │
  │                                                                         │
  │  Subsequent requests: Authorization: Bearer <token>                     │
  └─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Token Cache Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Token Cache                                      │
└──────────────────────────────────────────────────────────────────────────┘

  ┌───────────────────────────────────────────────────────────────────────┐
  │                      Hub Token (Single)                                │
  │  ┌─────────────────────────────────────────────────────────────────┐  │
  │  │ RwLock<Option<HubJwtToken>>                                     │  │
  │  │   - token: SecretString                                         │  │
  │  │   - refresh_token: Option<SecretString>                         │  │
  │  │   - expires_at: Instant                                         │  │
  │  └─────────────────────────────────────────────────────────────────┘  │
  └───────────────────────────────────────────────────────────────────────┘

  ┌───────────────────────────────────────────────────────────────────────┐
  │                  Registry Tokens (Scoped)                              │
  │  ┌─────────────────────────────────────────────────────────────────┐  │
  │  │ RwLock<HashMap<String, AuthToken>>                              │  │
  │  │                                                                  │  │
  │  │ Key: "repository:library/nginx:pull"                            │  │
  │  │   → AuthToken { token, expires_at, scope }                      │  │
  │  │                                                                  │  │
  │  │ Key: "repository:myuser/myapp:pull,push"                        │  │
  │  │   → AuthToken { token, expires_at, scope }                      │  │
  │  └─────────────────────────────────────────────────────────────────┘  │
  └───────────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow Diagrams

### 4.1 Image Pull Flow (Manifest + Blobs)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Image Pull Flow                                  │
└──────────────────────────────────────────────────────────────────────────┘

  pull("library/nginx:latest")
         │
         ▼
  ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
  │ Get Registry  │────▶│ GET /manifests│────▶│ Parse         │
  │ Bearer Token  │     │ /latest       │     │ Manifest      │
  │ (scope: pull) │     │               │     │               │
  └───────────────┘     └───────────────┘     └───────┬───────┘
                                                      │
                                                      ▼
                                              ┌───────────────┐
                                              │ Extract Layer │
                                              │ Digests       │
                                              └───────┬───────┘
                                                      │
         ┌────────────────────────────────────────────┼────────────┐
         │                                            │            │
         ▼                                            ▼            ▼
  ┌───────────────┐                          ┌───────────────┐
  │ GET /blobs/   │  (parallel)              │ GET /blobs/   │  ...
  │ sha256:abc... │                          │ sha256:def... │
  └───────┬───────┘                          └───────┬───────┘
          │                                          │
          └──────────────────┬───────────────────────┘
                             │
                             ▼
                     ┌───────────────┐
                     │ Verify Digests│
                     │ Return Layers │
                     └───────────────┘
```

### 4.2 Image Push Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Image Push Flow                                  │
└──────────────────────────────────────────────────────────────────────────┘

  push("myuser/myapp:v1.0.0", manifest, layers)
         │
         ▼
  ┌───────────────┐
  │ Get Registry  │
  │ Bearer Token  │
  │(scope: push)  │
  └───────┬───────┘
          │
          ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │                     Upload Layers (Blobs)                              │
  │                                                                        │
  │  FOR each layer:                                                       │
  │    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
  │    │ HEAD /blobs │───▶│ Exists?     │───▶│ Skip        │              │
  │    │ /{digest}   │yes │             │    │ (already    │              │
  │    └─────────────┘    └──────┬──────┘    │  uploaded)  │              │
  │                              │ no        └─────────────┘              │
  │                              ▼                                         │
  │    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐              │
  │    │ POST /blobs │───▶│ PATCH chunks│───▶│ PUT ?digest │              │
  │    │ /uploads/   │    │ (if large)  │    │ (complete)  │              │
  │    └─────────────┘    └─────────────┘    └─────────────┘              │
  └───────────────────────────────────────────────────────────────────────┘
          │
          ▼ (all layers uploaded)
  ┌───────────────┐     ┌───────────────┐
  │ PUT /manifests│────▶│ Return Digest │
  │ /{tag}        │     │ sha256:...    │
  └───────────────┘     └───────────────┘
```

### 4.3 Chunked Blob Upload Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Chunked Blob Upload Flow                              │
└──────────────────────────────────────────────────────────────────────────┘

  upload_chunked(image, 50MB_blob)
         │
         ▼
  ┌───────────────┐
  │ POST /blobs/  │──────────────────────────────────────────────┐
  │ uploads/      │                                              │
  └───────────────┘                                              │
         │                                                       │
         │ Location: /v2/.../uploads/{uuid}                      │
         ▼                                                       │
  ┌───────────────────────────────────────────────────────────┐  │
  │                    Chunk Loop                              │  │
  │                                                            │  │
  │  offset = 0                                                │  │
  │  WHILE offset < total_size:                                │  │
  │    ┌─────────────────────────────────────────────────┐    │  │
  │    │ PATCH /uploads/{uuid}                           │    │  │
  │    │ Content-Range: {offset}-{offset+chunk_size-1}   │    │  │
  │    │ Body: <5MB chunk>                               │    │  │
  │    └─────────────────────────────────────────────────┘    │  │
  │           │                                                │  │
  │           │ 202 Accepted                                   │  │
  │           │ Location: /v2/.../uploads/{uuid}               │  │
  │           ▼                                                │  │
  │    offset += chunk_size                                    │  │
  └───────────────────────────────────────────────────────────┘  │
         │                                                       │
         │ (all chunks uploaded)                                 │
         ▼                                                       │
  ┌───────────────────────────────────────────────────────────┐  │
  │ PUT /uploads/{uuid}?digest=sha256:...                     │  │
  │ (Content-Length: 0)                                        │  │
  └───────────────────────────────────────────────────────────┘  │
         │                                                       │
         │ 201 Created                                           │
         │ Docker-Content-Digest: sha256:...                     │
         ▼                                                       │
  ┌───────────────┐                                              │
  │ Return Digest │◀─────────────────────────────────────────────┘
  └───────────────┘
```

---

## 5. State Machines

### 5.1 Blob Upload State Machine

```
                           ┌─────────────────┐
            (initiate)     │                 │
           ───────────────▶│   INITIATED     │
                           │                 │
                           └────────┬────────┘
                                    │
                                    │ (POST /uploads/)
                                    │ Location header received
                                    ▼
                           ┌─────────────────┐
                           │                 │
              ┌───────────▶│   UPLOADING     │◀───────────┐
              │            │                 │            │
              │            └────────┬────────┘            │
              │                     │                     │
              │ (more chunks)       │ (chunk sent)        │
              │                     ▼                     │
              │            ┌─────────────────┐            │
              │            │ CHUNK_SENT      │            │
              │            │ (202 Accepted)  │────────────┘
              │            └────────┬────────┘
              │                     │
              │                     │ (all chunks done)
              └─────────────────────┤
                                    ▼
                           ┌─────────────────┐
                           │   COMPLETING    │
                           │ PUT ?digest=... │
                           └────────┬────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
           ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
           │  COMPLETED  │ │   FAILED    │ │  CANCELLED  │
           │ (201)       │ │ (4xx/5xx)   │ │ (timeout)   │
           └─────────────┘ └─────────────┘ └─────────────┘
```

### 5.2 Token Refresh State Machine

```
                           ┌─────────────────┐
                           │                 │
                           │     VALID       │◀──────────────────┐
                           │  (token fresh)  │                   │
                           │                 │                   │
                           └────────┬────────┘                   │
                                    │                            │
                                    │ (approaching expiry)       │
                                    ▼                            │
                           ┌─────────────────┐                   │
                           │                 │                   │
                           │    EXPIRING     │                   │
                           │ (< 30s left)    │                   │
                           │                 │                   │
                           └────────┬────────┘                   │
                                    │                            │
                                    │ (expired)                  │
                                    ▼                            │
                           ┌─────────────────┐                   │
                           │                 │                   │
                           │    EXPIRED      │                   │
                           │                 │                   │
                           └────────┬────────┘                   │
                                    │                            │
                    ┌───────────────┴───────────────┐            │
                    │ (has refresh)   (no refresh)  │            │
                    ▼                               ▼            │
           ┌─────────────────┐             ┌─────────────────┐   │
           │   REFRESHING    │             │   RE-LOGIN      │   │
           └────────┬────────┘             └────────┬────────┘   │
                    │                               │            │
                    │ (success)                     │ (success)  │
                    └───────────────┬───────────────┘            │
                                    │                            │
                                    └────────────────────────────┘
```

### 5.3 Circuit Breaker State Machine

```
                         ┌───────────────────────────────────┐
                         │                                   │
                         │ (success_threshold reached)       │
                         │                                   │
    ┌────────────────────┴────┐                    ┌─────────▼─────────┐
    │                         │                    │                   │
    │       HALF-OPEN         │                    │      CLOSED       │
    │  (testing recovery)     │                    │  (normal ops)     │
    │                         │                    │                   │
    └────────────┬────────────┘                    └─────────┬─────────┘
                 │                                           │
                 │ (failure)                                 │ (failure_threshold)
                 │                                           │
                 │         ┌─────────────────────┐           │
                 │         │                     │           │
                 └────────▶│       OPEN          │◀──────────┘
                           │  (rejecting reqs)   │
                           │                     │
                           └──────────┬──────────┘
                                      │
                                      │ (reset_timeout elapsed)
                                      ▼
                           ┌─────────────────────┐
                           │     HALF-OPEN       │
                           └─────────────────────┘
```

---

## 6. Rate Limit Architecture

### 6.1 Rate Limit Tracking

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Rate Limit Tracking                                   │
└──────────────────────────────────────────────────────────────────────────┘

  Response Headers:
  ┌─────────────────────────────────────────────────────────────────────┐
  │ RateLimit-Limit: 100;w=21600                                        │
  │ RateLimit-Remaining: 95                                             │
  │ Docker-RateLimit-Source: 192.168.1.1                                │
  └─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                     RateLimiter State                                │
  │                                                                      │
  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
  │  │ pull_limit: 100  │  │ pull_remaining:  │  │ reset_time:      │  │
  │  │                  │  │ 95               │  │ now + 6h         │  │
  │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
  │                                                                      │
  │  ┌──────────────────┐                                               │
  │  │ is_authenticated │  (true = 200 limit, false = 100 limit)       │
  │  └──────────────────┘                                               │
  └─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                   Pre-Request Check                                  │
  │                                                                      │
  │  IF remaining <= 0 AND now < reset_time:                            │
  │      RETURN Err(PullLimitExceeded { wait: reset_time - now })       │
  │                                                                      │
  │  ELSE IF remaining <= 10:                                           │
  │      log::warn!("Approaching rate limit: {} remaining", remaining)  │
  └─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Rate Limit Tiers

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Docker Hub Rate Limit Tiers                           │
└──────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────┐
  │                      Anonymous Users                                 │
  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │
  │  │ Pulls: 100  │  │ Window: 6h  │  │ Identified by: IP address   │ │
  │  │ per 6 hours │  │             │  │                             │ │
  │  └─────────────┘  └─────────────┘  └─────────────────────────────┘ │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────┐
  │                   Authenticated Free Users                           │
  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │
  │  │ Pulls: 200  │  │ Window: 6h  │  │ Identified by: Docker ID    │ │
  │  │ per 6 hours │  │             │  │                             │ │
  │  └─────────────┘  └─────────────┘  └─────────────────────────────┘ │
  └─────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────┐
  │                    Pro / Team / Business                             │
  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐ │
  │  │ Unlimited   │  │ No window   │  │ Service account recommended │ │
  │  │ pulls       │  │             │  │                             │ │
  │  └─────────────┘  └─────────────┘  └─────────────────────────────┘ │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Webhook Architecture

### 7.1 Webhook Processing Pipeline

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Webhook Processing Pipeline                           │
└──────────────────────────────────────────────────────────────────────────┘

  Incoming Webhook
  ┌───────────────────────────────────────────────────────────────────────┐
  │ POST /webhook                                                          │
  │ Content-Type: application/json                                         │
  │ Body: { "callback_url": "...", "push_data": {...}, "repository": {...}}│
  └───────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │                        Parse & Validate                                │
  │                                                                        │
  │  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐   │
  │  │ JSON Parse      │───▶│ Validate Schema │───▶│ Extract Event   │   │
  │  │                 │    │                 │    │ Type            │   │
  │  └─────────────────┘    └─────────────────┘    └─────────────────┘   │
  └───────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │                         Event Router                                   │
  │                                                                        │
  │  event_type ─────────────────┬────────────────────────────────────    │
  │                              │                                         │
  │      ┌───────────────────────┼───────────────────────┐                │
  │      │                       │                       │                │
  │      ▼                       ▼                       ▼                │
  │ ┌──────────┐          ┌──────────┐          ┌──────────────┐         │
  │ │  push    │          │  delete  │          │ vulnerability │         │
  │ │ handler  │          │ handler  │          │  handler      │         │
  │ └──────────┘          └──────────┘          └──────────────┘         │
  └───────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
  ┌───────────────────────────────────────────────────────────────────────┐
  │                      Event Bus (Publish)                               │
  │  ┌─────────────────────────────────────────────────────────────────┐  │
  │  │ ImagePushedEvent { repository, tag, pusher, timestamp }         │  │
  │  └─────────────────────────────────────────────────────────────────┘  │
  └───────────────────────────────────────────────────────────────────────┘
```

---

## 8. Observability Architecture

### 8.1 Tracing Hierarchy

```
docker.request (root span)
├── docker.auth.get_token
│   └── docker.auth.login (if needed)
├── docker.rate_limiter.check
├── docker.http.execute
│   ├── http.connect
│   └── http.response
└── docker.response.parse

docker.manifest.get
├── docker.auth.get_token (scope: pull)
├── docker.request
│   └── GET /v2/{name}/manifests/{ref}
└── docker.manifest.parse

docker.blob.upload
├── docker.auth.get_token (scope: push)
├── docker.blob.initiate
│   └── POST /v2/{name}/blobs/uploads/
├── docker.blob.chunk (×N)
│   └── PATCH /v2/{name}/blobs/uploads/{uuid}
└── docker.blob.complete
    └── PUT /v2/{name}/blobs/uploads/{uuid}?digest=...
```

### 8.2 Metrics Collection Points

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Metrics Collection                                │
└─────────────────────────────────────────────────────────────────────────┘

  Image Operations:
  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ Pulls    │    │ Pushes   │    │ Bytes    │    │ Bytes    │
  │ Counter  │    │ Counter  │    │ Download │    │ Upload   │
  └──────────┘    └──────────┘    └──────────┘    └──────────┘

  Rate Limits:
  ┌──────────┐    ┌──────────┐
  │ Remaining│    │  Limit   │
  │  Gauge   │    │  Gauge   │
  └──────────┘    └──────────┘

  Vulnerabilities:
  ┌──────────────────────────────────────────────────────────┐
  │ Gauge per severity: critical, high, medium, low, unknown │
  └──────────────────────────────────────────────────────────┘

  API Health:
  ┌──────────┐    ┌──────────┐    ┌──────────┐
  │ Latency  │    │ Errors   │    │ Circuit  │
  │Histogram │    │ Counter  │    │ State    │
  └──────────┘    └──────────┘    └──────────┘
```

---

## 9. Integration Points

### 9.1 Shared Module Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Shared Module Integration                            │
└─────────────────────────────────────────────────────────────────────────┘

  ┌───────────────────┐
  │   Docker Hub      │
  │     Module        │
  └─────────┬─────────┘
            │
            │ uses
            ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                        Shared Modules                                │
  │                                                                      │
  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
  │  │   credentials    │  │    resilience    │  │  observability   │  │
  │  │                  │  │                  │  │                  │  │
  │  │ - SecretString   │  │ - RetryPolicy    │  │ - Tracer         │  │
  │  │ - CredentialStore│  │ - CircuitBreaker │  │ - MetricsRegistry│  │
  │  │ - TokenCache     │  │ - RateLimiter    │  │ - Logger         │  │
  │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
  │                                                                      │
  │  ┌──────────────────┐                                               │
  │  │      http        │                                               │
  │  │                  │                                               │
  │  │ - HttpClient     │                                               │
  │  │ - Request/Resp   │                                               │
  │  │ - TLS config     │                                               │
  │  └──────────────────┘                                               │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Deployment Configuration

### 10.1 Runtime Configuration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Configuration Hierarchy                              │
└─────────────────────────────────────────────────────────────────────────┘

  Priority (highest to lowest):

  1. Environment Variables
     ┌─────────────────────────────────────────────────────────────────┐
     │ DOCKER_HUB_USERNAME=myuser                                      │
     │ DOCKER_HUB_PASSWORD=<from secrets manager>                      │
     │ DOCKER_HUB_ACCESS_TOKEN=<PAT>                                   │
     └─────────────────────────────────────────────────────────────────┘

  2. Configuration File
     ┌─────────────────────────────────────────────────────────────────┐
     │ docker_hub:                                                     │
     │   hub_url: "https://hub.docker.com"                             │
     │   registry_url: "https://registry-1.docker.io"                  │
     │   auth_url: "https://auth.docker.io"                            │
     │   timeout_seconds: 60                                           │
     │   chunk_size_mb: 5                                              │
     │   max_retries: 3                                                │
     │   circuit_breaker:                                              │
     │     failure_threshold: 5                                        │
     │     reset_timeout_seconds: 30                                   │
     └─────────────────────────────────────────────────────────────────┘

  3. Defaults (in code)
     ┌─────────────────────────────────────────────────────────────────┐
     │ const DEFAULT_HUB_URL: &str = "https://hub.docker.com";         │
     │ const DEFAULT_REGISTRY_URL: &str = "https://registry-1.docker.io";│
     │ const DEFAULT_CHUNK_SIZE: usize = 5 * 1024 * 1024;              │
     └─────────────────────────────────────────────────────────────────┘
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Architecture |

---

**Next Phase:** Refinement - Edge cases, error recovery, performance optimizations, and security hardening.
