# Docker Hub Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/docker-hub`

---

## 1. Overview

### 1.1 Document Purpose

This specification defines requirements for the Docker Hub Integration Module, providing a production-ready interface for container image publishing, pulling metadata, tagging, and vulnerability awareness within the LLM Dev Ops platform.

### 1.2 Methodology

- **SPARC**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first, mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to shared primitives

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The Docker Hub Integration Module provides a **thin adapter layer** that:
- Authenticates with Docker Hub (tokens, PATs)
- Lists and searches repositories and images
- Retrieves image manifests and metadata
- Manages image tags (create, list, delete)
- Pushes and pulls image layers (blob operations)
- Retrieves vulnerability scan results
- Handles Docker Hub rate limits
- Enables simulation/replay of registry interactions

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Authentication** | JWT token acquisition and refresh |
| **Repository Operations** | List, search, get repository details |
| **Image Metadata** | Get manifests, configs, layer info |
| **Tag Management** | List, create, delete tags |
| **Blob Operations** | Check existence, initiate uploads, push layers |
| **Vulnerability Data** | Retrieve scan results if available |
| **Rate Limit Handling** | Track and respect pull/push limits |
| **Webhook Processing** | Handle push/delete events |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Token authentication | JWT acquisition, refresh |
| Repository listing | User/org repositories |
| Image manifests | v2 manifest retrieval |
| Tag operations | List, create via manifest push, delete |
| Blob operations | HEAD check, POST initiate, PATCH/PUT upload |
| Layer metadata | Size, digest, media type |
| Vulnerability metadata | Scan status, CVE counts |
| Rate limit tracking | Pull/push limits, anonymous vs auth |
| Webhooks | Push, delete events |
| Dual language | Rust (primary) and TypeScript |

#### Out of Scope

| Item | Reason |
|------|--------|
| Image building | Build tool responsibility |
| Registry hosting | Docker Hub is the registry |
| Layer decompression | Client-side operation |
| Vulnerability scanning | Docker Hub service |
| Billing/subscription | Account management |
| Organization management | Admin operations |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Async-first | I/O-bound operations |
| No panics | Reliability |
| Trait-based | Testability |
| Docker Registry API v2 | Industry standard |
| OCI Distribution Spec | Compatibility |

---

## 3. Dependency Policy

### 3.1 Shared Modules

| Module | Purpose |
|--------|---------|
| `shared/credentials` | Docker Hub credentials |
| `shared/resilience` | Retry, circuit breaker |
| `shared/observability` | Logging, metrics, tracing |
| `shared/http` | HTTP transport |

### 3.2 External Dependencies (Rust)

| Crate | Purpose |
|-------|---------|
| `tokio` | Async runtime |
| `reqwest` | HTTP client |
| `serde` / `serde_json` | Serialization |
| `async-trait` | Async trait support |
| `thiserror` | Error derivation |
| `sha2` | Digest computation |
| `base64` | Encoding |

### 3.3 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `docker-rs` | This module IS the integration |
| `bollard` | Full Docker client not needed |
| Container runtimes | Out of scope |

---

## 4. API Coverage

### 4.1 Docker Hub API Endpoints

**Auth URL:** `https://hub.docker.com/v2`
**Registry URL:** `https://registry-1.docker.io/v2`

#### Authentication

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Login (JWT) | POST | `hub.docker.com/v2/users/login` |
| Get token | GET | `auth.docker.io/token?service=registry.docker.io&scope=...` |

#### Repository Operations (Hub API)

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List repositories | GET | `/repositories/{namespace}` |
| Get repository | GET | `/repositories/{namespace}/{repo}` |
| Search | GET | `/search/repositories?query=...` |
| Delete repository | DELETE | `/repositories/{namespace}/{repo}` |

#### Registry Operations (Registry API v2)

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Check API | GET | `/v2/` |
| List tags | GET | `/v2/{name}/tags/list` |
| Get manifest | GET | `/v2/{name}/manifests/{reference}` |
| Put manifest | PUT | `/v2/{name}/manifests/{reference}` |
| Delete manifest | DELETE | `/v2/{name}/manifests/{reference}` |
| Check blob | HEAD | `/v2/{name}/blobs/{digest}` |
| Get blob | GET | `/v2/{name}/blobs/{digest}` |
| Delete blob | DELETE | `/v2/{name}/blobs/{digest}` |
| Initiate upload | POST | `/v2/{name}/blobs/uploads/` |
| Upload chunk | PATCH | `/v2/{name}/blobs/uploads/{uuid}` |
| Complete upload | PUT | `/v2/{name}/blobs/uploads/{uuid}?digest=...` |

#### Vulnerability API (Hub API)

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Get scan overview | GET | `/repositories/{namespace}/{repo}/images/{digest}/scan` |

### 4.2 Manifest Response (v2 Schema 2)

```json
{
  "schemaVersion": 2,
  "mediaType": "application/vnd.docker.distribution.manifest.v2+json",
  "config": {
    "mediaType": "application/vnd.docker.container.image.v1+json",
    "size": 7023,
    "digest": "sha256:abc123..."
  },
  "layers": [
    {
      "mediaType": "application/vnd.docker.image.rootfs.diff.tar.gzip",
      "size": 32654,
      "digest": "sha256:def456..."
    }
  ]
}
```

### 4.3 Rate Limit Headers

```
RateLimit-Limit: 100;w=21600
RateLimit-Remaining: 95
Docker-RateLimit-Source: 192.168.1.1
```

---

## 5. Error Taxonomy

### 5.1 Error Hierarchy

```
DockerHubError
├── ConfigurationError
│   ├── InvalidRegistry
│   ├── InvalidNamespace
│   └── InvalidCredentials
│
├── AuthenticationError
│   ├── InvalidCredentials
│   ├── TokenExpired
│   ├── TokenRefreshFailed
│   └── UnauthorizedScope
│
├── RepositoryError
│   ├── NotFound
│   ├── AccessDenied
│   ├── NameInvalid
│   └── AlreadyExists
│
├── ManifestError
│   ├── NotFound
│   ├── Invalid
│   ├── DigestMismatch
│   └── SchemaNotSupported
│
├── BlobError
│   ├── NotFound
│   ├── UploadInvalid
│   ├── DigestMismatch
│   └── SizeExceeded
│
├── RateLimitError
│   ├── PullLimitExceeded
│   ├── PushLimitExceeded
│   └── SearchLimitExceeded
│
├── NetworkError
│   ├── ConnectionFailed
│   ├── Timeout
│   └── DnsResolutionFailed
│
└── ServerError
    ├── InternalError
    └── ServiceUnavailable
```

### 5.2 HTTP Status Mapping

| Status | Error Type | Retryable |
|--------|------------|-----------|
| 400 | `ManifestError::Invalid` | No |
| 401 | `AuthenticationError` | Yes (refresh) |
| 403 | `RepositoryError::AccessDenied` | No |
| 404 | `*::NotFound` | No |
| 429 | `RateLimitError` | Yes (wait) |
| 500 | `ServerError::InternalError` | Yes |
| 503 | `ServerError::ServiceUnavailable` | Yes |

---

## 6. Resilience Requirements

### 6.1 Retry Configuration

| Error Type | Retry | Max Attempts | Backoff |
|------------|-------|--------------|---------|
| `RateLimitError` (429) | Yes | 3 | Wait for reset |
| `ServiceUnavailable` (503) | Yes | 3 | Exponential (2s base) |
| `InternalError` (500) | Yes | 3 | Exponential (1s base) |
| `Timeout` | Yes | 3 | Fixed (1s) |
| `TokenExpired` | Yes | 1 | Immediate (refresh) |

### 6.2 Rate Limits (Docker Hub)

| Limit Type | Anonymous | Authenticated | Pro/Team |
|------------|-----------|---------------|----------|
| Pulls per 6 hours | 100 | 200 | Unlimited |
| Push limit | N/A | Per plan | Per plan |
| API requests | 25/min | 100/min | Higher |

### 6.3 Circuit Breaker

| Parameter | Default |
|-----------|---------|
| Failure threshold | 5 failures |
| Success threshold | 2 successes |
| Reset timeout | 30 seconds |

---

## 7. Observability Requirements

### 7.1 Tracing Spans

| Span | Attributes |
|------|------------|
| `docker.auth.login` | `username`, `registry` |
| `docker.repo.list` | `namespace`, `count` |
| `docker.manifest.get` | `image`, `tag`, `digest` |
| `docker.manifest.put` | `image`, `tag`, `size` |
| `docker.blob.upload` | `image`, `digest`, `size` |
| `docker.tag.list` | `image`, `count` |
| `docker.webhook.receive` | `event_type`, `repository` |

### 7.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `docker_operations_total` | Counter | `operation`, `status` |
| `docker_operation_latency_seconds` | Histogram | `operation` |
| `docker_pulls_total` | Counter | `image`, `tag` |
| `docker_pushes_total` | Counter | `image`, `tag` |
| `docker_bytes_uploaded_total` | Counter | - |
| `docker_bytes_downloaded_total` | Counter | - |
| `docker_rate_limit_remaining` | Gauge | `limit_type` |
| `docker_errors_total` | Counter | `error_type` |
| `docker_vulnerabilities_total` | Gauge | `severity`, `image` |

### 7.3 Logging

| Level | When |
|-------|------|
| ERROR | Auth failures, push/pull errors |
| WARN | Rate limiting, retries |
| INFO | Successful push/pull, tag operations |
| DEBUG | Request/response details |
| TRACE | Full payloads, layer data |

---

## 8. Security Requirements

### 8.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Password never logged | `SecretString` wrapper |
| JWT tokens protected | Token cache with expiry |
| PATs secured | Encrypted storage |

### 8.2 Authentication Methods

| Method | Use Case |
|--------|----------|
| Username/Password | Interactive login |
| Personal Access Token | Automation |
| JWT Token | API access after login |

### 8.3 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ only | Enforced |
| HTTPS only | No HTTP fallback |
| Certificate validation | Enabled |

### 8.4 Content Trust

| Requirement | Implementation |
|-------------|----------------|
| Digest verification | SHA256 validation |
| Manifest verification | Content-addressable |
| Layer integrity | Digest check on download |

---

## 9. Performance Requirements

### 9.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Get manifest | < 200ms | < 800ms |
| List tags | < 150ms | < 500ms |
| Check blob (HEAD) | < 100ms | < 400ms |
| Push manifest | < 300ms | < 1s |
| Upload blob (1MB) | < 1s | < 3s |

### 9.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Concurrent uploads | 5+ |
| Concurrent downloads | 10+ |
| Operations per minute | 50+ |

---

## 10. Enterprise Features

### 10.1 Image Versioning

| Feature | Description |
|---------|-------------|
| Semantic tags | Parse and compare semver tags |
| Latest resolution | Resolve :latest to digest |
| Multi-arch support | Manifest list handling |
| Digest pinning | Immutable references |

### 10.2 Vulnerability Awareness

| Feature | Description |
|---------|-------------|
| Scan status | Check if scanned |
| CVE counts | By severity level |
| Advisory links | Reference URLs |
| Scan freshness | Last scan timestamp |

### 10.3 Webhook Processing

| Feature | Description |
|---------|-------------|
| Push events | Image pushed notification |
| Delete events | Tag/image deleted |
| Payload validation | Signature verification |

### 10.4 Simulation and Replay

| Feature | Description |
|---------|-------------|
| Mock mode | Simulate registry operations |
| Record mode | Capture API interactions |
| Replay mode | Deterministic testing |

---

## 11. Acceptance Criteria

### 11.1 Functional

- [ ] Auth: Login with username/password
- [ ] Auth: Login with PAT
- [ ] Auth: Token refresh
- [ ] Repo: List repositories
- [ ] Repo: Get repository details
- [ ] Repo: Search repositories
- [ ] Manifest: Get by tag
- [ ] Manifest: Get by digest
- [ ] Manifest: Put (push)
- [ ] Manifest: Delete
- [ ] Tags: List for image
- [ ] Tags: Delete tag
- [ ] Blob: Check existence (HEAD)
- [ ] Blob: Download
- [ ] Blob: Initiate upload
- [ ] Blob: Chunked upload
- [ ] Blob: Complete upload
- [ ] Vulnerability: Get scan overview
- [ ] Webhook: Validate and parse events
- [ ] Rate limits: Track remaining

### 11.2 Non-Functional

- [ ] No panics
- [ ] Credentials protected
- [ ] Retry works correctly
- [ ] Circuit breaker functions
- [ ] Digests verified
- [ ] Test coverage > 80%

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Specification |

---

**Next Phase:** Pseudocode - Core algorithms for authentication, manifest operations, blob uploads, and rate limit handling.
