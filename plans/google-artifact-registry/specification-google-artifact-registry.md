# Google Artifact Registry Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/google-artifact-registry`

---

## 1. Overview

### 1.1 Document Purpose

This specification defines requirements for the Google Artifact Registry Integration Module, providing a production-ready interface for managing container images, language packages, and OS packages within the LLM Dev Ops platform.

### 1.2 Methodology

- **SPARC**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first, mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to shared primitives

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The Google Artifact Registry Integration Module provides a **thin adapter layer** that:
- Authenticates via Google Cloud IAM (service accounts, workload identity)
- Manages repositories across formats (Docker, Maven, npm, Python, Go, Apt, Yum)
- Retrieves image manifests, tags, and layer metadata
- Lists and manages packages and versions
- Retrieves vulnerability scan results (Container Analysis)
- Handles regional/multi-regional deployments
- Enables simulation/replay of registry interactions

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Authentication** | Service account, workload identity, ADC |
| **Repository Management** | List, get, create repository metadata |
| **Docker Operations** | Manifests, tags, layers via OCI API |
| **Package Operations** | List packages, versions across formats |
| **Vulnerability Data** | Container Analysis API integration |
| **Regional Routing** | Location-aware endpoint selection |
| **IAM Scoping** | Permission verification |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Repository listing | By project, location, format |
| Docker image operations | Manifest get/put, tag list/delete |
| Package operations | List packages, versions, files |
| Vulnerability metadata | Occurrences, notes from Container Analysis |
| Tag management | List, add, delete tags |
| Cleanup policies | Retrieve policy configuration |
| Multi-region support | Regional and multi-regional locations |
| Dual language | Rust (primary) and TypeScript |

#### Out of Scope

| Item | Reason |
|------|--------|
| Image building | Build tool responsibility |
| Repository creation | Admin/IaC operation |
| IAM policy management | Security admin scope |
| Vulnerability scanning | GCP managed service |
| Billing/quota management | Account administration |
| VPC-SC configuration | Network admin scope |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Async-first | I/O-bound operations |
| No panics | Reliability |
| Trait-based | Testability |
| OCI Distribution Spec | Docker compatibility |
| gRPC + REST | GCP API patterns |

---

## 3. Dependency Policy

### 3.1 Shared Modules

| Module | Purpose |
|--------|---------|
| `shared/credentials` | GCP credentials (service account, ADC) |
| `shared/resilience` | Retry, circuit breaker |
| `shared/observability` | Logging, metrics, tracing |
| `shared/http` | HTTP transport |
| `shared/grpc` | gRPC transport |

### 3.2 External Dependencies (Rust)

| Crate | Purpose |
|-------|---------|
| `tokio` | Async runtime |
| `reqwest` | HTTP client |
| `tonic` | gRPC client |
| `gcp-auth` | GCP authentication |
| `serde` / `serde_json` | Serialization |
| `prost` | Protocol buffers |
| `sha2` | Digest computation |

### 3.3 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `docker-rs` | This module IS the integration |
| Full GCP SDK | Only specific APIs needed |
| Container runtimes | Out of scope |

---

## 4. API Coverage

### 4.1 Artifact Registry API

**Base URL:** `https://artifactregistry.googleapis.com/v1`

#### Repository Operations

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List repositories | GET | `/projects/{project}/locations/{location}/repositories` |
| Get repository | GET | `/projects/{project}/locations/{location}/repositories/{repo}` |
| List packages | GET | `.../{repo}/packages` |
| Get package | GET | `.../{repo}/packages/{package}` |
| List versions | GET | `.../{repo}/packages/{package}/versions` |
| Get version | GET | `.../{repo}/packages/{package}/versions/{version}` |
| Delete version | DELETE | `.../{repo}/packages/{package}/versions/{version}` |
| List tags | GET | `.../{repo}/packages/{package}/tags` |
| Create tag | POST | `.../{repo}/packages/{package}/tags` |
| Delete tag | DELETE | `.../{repo}/packages/{package}/tags/{tag}` |
| List files | GET | `.../{repo}/files` |
| Get file | GET | `.../{repo}/files/{file}` |

### 4.2 Docker Registry API (OCI)

**Base URL:** `https://{location}-docker.pkg.dev/v2`

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Check API | GET | `/v2/` |
| List tags | GET | `/v2/{project}/{repo}/{image}/tags/list` |
| Get manifest | GET | `/v2/{project}/{repo}/{image}/manifests/{reference}` |
| Put manifest | PUT | `/v2/{project}/{repo}/{image}/manifests/{reference}` |
| Delete manifest | DELETE | `/v2/{project}/{repo}/{image}/manifests/{reference}` |
| Check blob | HEAD | `/v2/{project}/{repo}/{image}/blobs/{digest}` |
| Get blob | GET | `/v2/{project}/{repo}/{image}/blobs/{digest}` |
| Initiate upload | POST | `/v2/{project}/{repo}/{image}/blobs/uploads/` |
| Upload chunk | PATCH | `/v2/{project}/{repo}/{image}/blobs/uploads/{uuid}` |
| Complete upload | PUT | `/v2/{project}/{repo}/{image}/blobs/uploads/{uuid}?digest=...` |

### 4.3 Container Analysis API

**Base URL:** `https://containeranalysis.googleapis.com/v1`

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List occurrences | GET | `/projects/{project}/occurrences` |
| Get occurrence | GET | `/projects/{project}/occurrences/{occurrence}` |
| List notes | GET | `/projects/{project}/notes` |
| Get vulnerability summary | GET | `/projects/{project}/occurrences:vulnerabilitySummary` |

### 4.4 Regional Endpoints

| Location Type | Pattern | Example |
|---------------|---------|---------|
| Regional | `{region}-docker.pkg.dev` | `us-central1-docker.pkg.dev` |
| Multi-regional | `{location}-docker.pkg.dev` | `us-docker.pkg.dev` |
| API | `artifactregistry.googleapis.com` | Global endpoint |

---

## 5. Error Taxonomy

### 5.1 Error Hierarchy

```
ArtifactRegistryError
├── ConfigurationError
│   ├── InvalidProject
│   ├── InvalidLocation
│   └── InvalidRepository
│
├── AuthenticationError
│   ├── CredentialsNotFound
│   ├── TokenExpired
│   ├── TokenRefreshFailed
│   └── ServiceAccountInvalid
│
├── AuthorizationError
│   ├── PermissionDenied
│   ├── ProjectAccessDenied
│   └── RepositoryAccessDenied
│
├── RepositoryError
│   ├── NotFound
│   ├── FormatMismatch
│   └── LocationUnavailable
│
├── PackageError
│   ├── NotFound
│   ├── VersionNotFound
│   └── TagNotFound
│
├── ManifestError
│   ├── NotFound
│   ├── Invalid
│   ├── DigestMismatch
│   └── SchemaNotSupported
│
├── BlobError
│   ├── NotFound
│   ├── UploadFailed
│   └── DigestMismatch
│
├── QuotaError
│   ├── StorageExceeded
│   ├── RequestsExceeded
│   └── DownloadExceeded
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

### 5.2 HTTP/gRPC Status Mapping

| HTTP | gRPC | Error Type | Retryable |
|------|------|------------|-----------|
| 400 | INVALID_ARGUMENT | `ConfigurationError` | No |
| 401 | UNAUTHENTICATED | `AuthenticationError` | Yes (refresh) |
| 403 | PERMISSION_DENIED | `AuthorizationError` | No |
| 404 | NOT_FOUND | `*::NotFound` | No |
| 429 | RESOURCE_EXHAUSTED | `QuotaError` | Yes (wait) |
| 500 | INTERNAL | `ServerError` | Yes |
| 503 | UNAVAILABLE | `ServerError` | Yes |

---

## 6. Resilience Requirements

### 6.1 Retry Configuration

| Error Type | Retry | Max Attempts | Backoff |
|------------|-------|--------------|---------|
| `QuotaError` (429) | Yes | 5 | Exponential (30s base) |
| `ServiceUnavailable` (503) | Yes | 3 | Exponential (2s base) |
| `InternalError` (500) | Yes | 3 | Exponential (1s base) |
| `Timeout` | Yes | 3 | Fixed (1s) |
| `TokenExpired` | Yes | 1 | Immediate (refresh) |

### 6.2 Quotas (Default)

| Quota | Limit | Per |
|-------|-------|-----|
| Read requests | 50,000 | minute |
| Write requests | 3,000 | minute |
| Storage | Per project quota | - |
| Download | Egress charges | - |

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
| `gar.auth.token` | `project`, `method` |
| `gar.repo.list` | `project`, `location`, `count` |
| `gar.package.list` | `repository`, `format`, `count` |
| `gar.manifest.get` | `image`, `tag`, `digest` |
| `gar.manifest.put` | `image`, `tag`, `size` |
| `gar.blob.upload` | `image`, `digest`, `size` |
| `gar.vulnerability.scan` | `image`, `severity_counts` |

### 7.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `gar_operations_total` | Counter | `operation`, `status`, `location` |
| `gar_operation_latency_seconds` | Histogram | `operation`, `location` |
| `gar_pulls_total` | Counter | `image`, `location` |
| `gar_pushes_total` | Counter | `image`, `location` |
| `gar_bytes_uploaded_total` | Counter | `location` |
| `gar_bytes_downloaded_total` | Counter | `location` |
| `gar_vulnerabilities_total` | Gauge | `severity`, `image` |
| `gar_errors_total` | Counter | `error_type`, `location` |

### 7.3 Logging

| Level | When |
|-------|------|
| ERROR | Auth failures, push/pull errors |
| WARN | Quota warnings, retries |
| INFO | Successful operations |
| DEBUG | Request/response details |
| TRACE | Full payloads |

---

## 8. Security Requirements

### 8.1 Authentication Methods

| Method | Use Case |
|--------|----------|
| Service Account Key | CI/CD pipelines |
| Workload Identity | GKE workloads |
| Application Default Credentials | Local development |
| Access Token | Short-lived operations |

### 8.2 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Keys never logged | `SecretString` wrapper |
| Token caching | In-memory with expiry |
| Auto-refresh | Background refresh at 80% TTL |

### 8.3 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ only | Enforced |
| mTLS support | For VPC-SC |
| Certificate validation | Enabled |

### 8.4 Content Integrity

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
| List packages | < 200ms | < 600ms |
| Get vulnerability summary | < 300ms | < 1s |

### 9.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Concurrent uploads | 5+ |
| Concurrent downloads | 10+ |
| Operations per minute | 100+ |

---

## 10. Enterprise Features

### 10.1 Multi-Format Support

| Format | Operations |
|--------|------------|
| Docker | Full OCI registry operations |
| Maven | Package/version listing |
| npm | Package/version listing |
| Python | Package/version listing |
| Go | Module listing |
| Apt/Yum | Package listing |

### 10.2 Regional Configuration

| Feature | Description |
|---------|-------------|
| Location selection | Regional or multi-regional |
| Endpoint routing | Location-aware URL construction |
| Failover | Multi-region redundancy awareness |

### 10.3 Vulnerability Integration

| Feature | Description |
|---------|-------------|
| Occurrence listing | CVEs for specific image |
| Severity breakdown | CRITICAL/HIGH/MEDIUM/LOW counts |
| Fix availability | Remediation information |
| SBOM support | Software bill of materials |

### 10.4 Cleanup Policy Awareness

| Feature | Description |
|---------|-------------|
| Policy retrieval | Get configured cleanup rules |
| Dry-run support | Preview deletions |
| Tag retention | Keep-by-tag rules |

### 10.5 Simulation and Replay

| Feature | Description |
|---------|-------------|
| Mock mode | Simulate registry operations |
| Record mode | Capture API interactions |
| Replay mode | Deterministic testing |

---

## 11. Acceptance Criteria

### 11.1 Functional

- [ ] Auth: Service account authentication
- [ ] Auth: Workload identity support
- [ ] Auth: ADC fallback
- [ ] Auth: Token refresh
- [ ] Repo: List repositories by project/location
- [ ] Repo: Get repository details
- [ ] Package: List packages
- [ ] Package: Get package details
- [ ] Package: List versions
- [ ] Package: Delete version
- [ ] Tags: List tags
- [ ] Tags: Create tag
- [ ] Tags: Delete tag
- [ ] Docker: Get manifest by tag/digest
- [ ] Docker: Put manifest
- [ ] Docker: Delete manifest
- [ ] Docker: Check blob existence
- [ ] Docker: Download blob
- [ ] Docker: Upload blob (chunked)
- [ ] Vulnerability: List occurrences
- [ ] Vulnerability: Get summary
- [ ] Regional: Multi-location support

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

**Next Phase:** Pseudocode - Core algorithms for authentication, repository operations, Docker registry interactions, and vulnerability retrieval.
