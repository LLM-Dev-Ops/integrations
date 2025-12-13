# Specification: GitHub Container Registry Integration Module

## SPARC Phase 1: Specification

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/ghcr`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Goals and Non-Goals](#2-goals-and-non-goals)
3. [GHCR API Overview](#3-ghcr-api-overview)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [Data Models](#6-data-models)
7. [Integration Points](#7-integration-points)
8. [Security Considerations](#8-security-considerations)
9. [Constraints](#9-constraints)

---

## 1. Overview

### 1.1 Purpose

This module provides a thin adapter layer connecting the LLM Dev Ops platform to GitHub Container Registry (ghcr.io) for container image management, enabling image publishing, pulling, tagging, version management, and vulnerability metadata awareness via the OCI Distribution API and GitHub Packages API.

### 1.2 Scope

```
┌─────────────────────────────────────────────────────────────────┐
│                    GHCR INTEGRATION SCOPE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  IN SCOPE:                                                       │
│  ├── Image Operations (push, pull, delete, copy)                │
│  ├── Tag Operations (list, create, delete, retag)               │
│  ├── Manifest Operations (get, head, put)                       │
│  ├── Blob Operations (check, mount, upload)                     │
│  ├── Version Management (list versions, delete old)             │
│  ├── Vulnerability Metadata (fetch from GitHub API)             │
│  ├── Visibility Control (public/private/internal)               │
│  ├── Permission Scoping (org/repo/user packages)                │
│  ├── Rate Limit Handling (token bucket, backoff)                │
│  └── Simulation Layer (record/replay)                           │
│                                                                  │
│  OUT OF SCOPE:                                                   │
│  ├── Image build (Docker/Buildpack/Kaniko)                      │
│  ├── Registry hosting/mirroring                                 │
│  ├── Image scanning (Trivy/Snyk execution)                      │
│  ├── Kubernetes deployment                                      │
│  ├── CI/CD pipeline orchestration                               │
│  └── Base image management                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Goals and Non-Goals

### 2.1 Goals

| ID | Goal |
|----|------|
| G1 | Push container images with multi-arch support |
| G2 | Pull images and manifests efficiently |
| G3 | Manage image tags and versions |
| G4 | Query vulnerability metadata from GitHub |
| G5 | Handle rate limits gracefully |
| G6 | Support org, repo, and user-scoped packages |
| G7 | Enable simulation/replay for CI/CD |
| G8 | Control image visibility (public/private) |

### 2.2 Non-Goals

| ID | Non-Goal | Rationale |
|----|----------|-----------|
| NG1 | Image building | Build tool responsibility |
| NG2 | Registry hosting | Infrastructure scope |
| NG3 | Vulnerability scanning | Security tool scope |
| NG4 | K8s deployment | Orchestration scope |
| NG5 | Image layer optimization | Build-time concern |

---

## 3. GHCR API Overview

### 3.1 API Characteristics

| Aspect | Detail |
|--------|--------|
| Registry URL | `ghcr.io` |
| Auth Endpoint | `ghcr.io/token` |
| OCI Distribution | v2 spec compliant |
| Packages API | `api.github.com/user/packages` |
| Auth Method | Bearer token (PAT or GITHUB_TOKEN) |
| Rate Limits | 1000 req/hr (authenticated) |

### 3.2 Core Endpoints

| Resource | Endpoint |
|----------|----------|
| Auth Token | `GET /token?scope=repository:{name}:pull,push` |
| Manifest | `GET/PUT/DELETE /v2/{name}/manifests/{reference}` |
| Blob Check | `HEAD /v2/{name}/blobs/{digest}` |
| Blob Upload | `POST /v2/{name}/blobs/uploads/` |
| Tags List | `GET /v2/{name}/tags/list` |
| Catalog | `GET /v2/_catalog` |
| Packages | `GET /orgs/{org}/packages/container/{name}/versions` |
| Vuln Data | `GET /orgs/{org}/packages/container/{name}/versions/{id}/vulnerabilities` |

### 3.3 Image Reference Format

```
ghcr.io/{owner}/{image}:{tag}
ghcr.io/{owner}/{image}@sha256:{digest}

Examples:
  ghcr.io/myorg/myapp:latest
  ghcr.io/myorg/myapp:v1.2.3
  ghcr.io/myorg/myapp@sha256:abc123...
```

### 3.4 Authentication Flow

```
1. Request with no auth → 401 with WWW-Authenticate header
2. Parse realm, service, scope from header
3. GET {realm}?service={service}&scope={scope}
   Authorization: Basic base64(username:PAT)
4. Receive bearer token
5. Use token for subsequent requests
```

---

## 4. Functional Requirements

### 4.1 Image Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-IMG-001 | Push image manifest | P0 |
| FR-IMG-002 | Pull image manifest | P0 |
| FR-IMG-003 | Delete image by tag/digest | P0 |
| FR-IMG-004 | Copy image between refs | P1 |
| FR-IMG-005 | Check image existence | P0 |
| FR-IMG-006 | Get image size | P1 |

### 4.2 Tag Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-TAG-001 | List all tags | P0 |
| FR-TAG-002 | Create/update tag | P0 |
| FR-TAG-003 | Delete tag | P0 |
| FR-TAG-004 | Get tag digest | P0 |
| FR-TAG-005 | List tags by pattern | P1 |
| FR-TAG-006 | Retag image (atomic) | P1 |

### 4.3 Manifest Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-MAN-001 | Get manifest by ref | P0 |
| FR-MAN-002 | Put manifest | P0 |
| FR-MAN-003 | Head manifest (check) | P0 |
| FR-MAN-004 | Parse manifest types | P0 |
| FR-MAN-005 | Handle multi-arch index | P1 |
| FR-MAN-006 | Get manifest annotations | P1 |

### 4.4 Blob Operations

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-BLOB-001 | Check blob exists | P0 |
| FR-BLOB-002 | Upload blob (chunked) | P0 |
| FR-BLOB-003 | Mount blob cross-repo | P1 |
| FR-BLOB-004 | Get blob content | P1 |
| FR-BLOB-005 | Delete blob | P2 |

### 4.5 Version Management

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-VER-001 | List package versions | P0 |
| FR-VER-002 | Get version details | P0 |
| FR-VER-003 | Delete version | P0 |
| FR-VER-004 | Restore version | P2 |
| FR-VER-005 | Filter versions by tag | P1 |
| FR-VER-006 | Cleanup old versions | P1 |

### 4.6 Vulnerability Metadata

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-VULN-001 | Get version vulnerabilities | P1 |
| FR-VULN-002 | List vulnerable versions | P1 |
| FR-VULN-003 | Get vulnerability severity | P1 |
| FR-VULN-004 | Get fix available status | P2 |

### 4.7 Visibility & Permissions

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-VIS-001 | Get package visibility | P1 |
| FR-VIS-002 | Set visibility (public/private) | P1 |
| FR-VIS-003 | List org packages | P0 |
| FR-VIS-004 | List user packages | P0 |
| FR-VIS-005 | List repo packages | P1 |

### 4.8 Simulation

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-SIM-001 | Record API interactions | P1 |
| FR-SIM-002 | Replay recorded interactions | P1 |
| FR-SIM-003 | Content hash verification | P1 |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-PERF-001 | Manifest get p99 | <500ms |
| NFR-PERF-002 | Tag list p99 | <1s |
| NFR-PERF-003 | Blob upload throughput | >50MB/s |
| NFR-PERF-004 | Chunked upload size | 5MB chunks |

### 5.2 Reliability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-REL-001 | Retry on 5xx | 3 attempts |
| NFR-REL-002 | Retry on 429 | Respect Retry-After |
| NFR-REL-003 | Exponential backoff | 1s, 2s, 4s |
| NFR-REL-004 | Request timeout | 30s (5min upload) |
| NFR-REL-005 | Token refresh | Auto on 401 |

### 5.3 Rate Limit Handling

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-RATE-001 | Track X-RateLimit-* | Per request |
| NFR-RATE-002 | Preemptive throttle | At 80% limit |
| NFR-RATE-003 | Backoff on 429 | Retry-After header |
| NFR-RATE-004 | Rate limit metrics | Export counts |

### 5.4 Security

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-SEC-001 | TLS required | HTTPS only |
| NFR-SEC-002 | Token handling | SecretString |
| NFR-SEC-003 | No token logging | Redacted |
| NFR-SEC-004 | Scope validation | Minimal scopes |

---

## 6. Data Models

### 6.1 Core Types

```
ImageRef
├── name: String           // "owner/image"
├── reference: Reference   // Tag or Digest
└── registry: String       // "ghcr.io"

Reference
├── Tag(String)            // "v1.2.3", "latest"
└── Digest(String)         // "sha256:abc123..."

Manifest
├── schema_version: u8     // 2
├── media_type: MediaType
├── config: Descriptor
├── layers: Vec<Descriptor>
└── annotations: HashMap<String, String>

MediaType
├── DockerManifest         // application/vnd.docker.distribution.manifest.v2+json
├── DockerManifestList     // application/vnd.docker.distribution.manifest.list.v2+json
├── OciManifest            // application/vnd.oci.image.manifest.v1+json
├── OciIndex               // application/vnd.oci.image.index.v1+json
└── Unknown(String)
```

### 6.2 Descriptor Types

```
Descriptor
├── media_type: MediaType
├── digest: String
├── size: u64
├── urls: Option<Vec<String>>
├── annotations: Option<HashMap<String, String>>
└── platform: Option<Platform>

Platform
├── architecture: String   // "amd64", "arm64"
├── os: String             // "linux", "windows"
├── os_version: Option<String>
├── os_features: Option<Vec<String>>
└── variant: Option<String>
```

### 6.3 Package Types

```
PackageVersion
├── id: u64
├── name: String
├── html_url: String
├── created_at: DateTime
├── updated_at: DateTime
├── metadata: PackageMetadata
└── tags: Vec<String>

PackageMetadata
├── package_type: String   // "container"
├── container: ContainerMetadata
└── visibility: Visibility

ContainerMetadata
├── tags: Vec<String>
└── manifest_digest: String

Visibility
├── Public
├── Private
└── Internal
```

### 6.4 Vulnerability Types

```
VulnerabilityReport
├── package_version_id: u64
├── vulnerabilities: Vec<Vulnerability>
└── scanned_at: DateTime

Vulnerability
├── id: String             // CVE-2024-1234
├── severity: Severity
├── summary: String
├── description: String
├── fixed_in: Option<String>
└── references: Vec<String>

Severity
├── Critical
├── High
├── Medium
├── Low
└── Unknown
```

### 6.5 Rate Limit Types

```
RateLimitInfo
├── limit: u32             // Total allowed
├── remaining: u32         // Remaining calls
├── reset: DateTime        // Reset timestamp
└── used: u32              // Used this period
```

---

## 7. Integration Points

### 7.1 Shared Primitives

| Primitive | Usage |
|-----------|-------|
| Authentication | OAuth token provider (PAT/GITHUB_TOKEN) |
| Logging | Structured request/response logging |
| Metrics | Request counts, sizes, latencies |
| Retry | Exponential backoff with jitter |

### 7.2 Platform Integration

| Integration | Purpose |
|-------------|---------|
| Vector Memory | Index image metadata for search |
| Workflow Engine | Trigger on image push/tag |
| Notification | Alert on vulnerabilities |
| Artifact Store | Reference images for deployment |

---

## 8. Security Considerations

### 8.1 Authentication

- Personal Access Token (PAT) with `read:packages`, `write:packages`, `delete:packages`
- GITHUB_TOKEN for Actions workflows (automatic)
- Token stored as SecretString with zeroization

### 8.2 Authorization Scopes

| Scope | Operations |
|-------|------------|
| `read:packages` | Pull, list, get metadata |
| `write:packages` | Push, tag, update visibility |
| `delete:packages` | Delete versions/tags |

### 8.3 Image Signing

| Aspect | Handling |
|--------|----------|
| Cosign signatures | Store as OCI artifacts |
| SBOM attestations | Support OCI referrers API |
| Signature verification | Optional validation |

### 8.4 Data Protection

| Concern | Mitigation |
|---------|------------|
| Token exposure | SecretString, no logging |
| Private images | Respect visibility settings |
| Vuln data | May contain sensitive info |

---

## 9. Constraints

### 9.1 Technical Constraints

| Constraint | Description |
|------------|-------------|
| TC-001 | OCI Distribution v2 spec |
| TC-002 | Max layer size: 10GB |
| TC-003 | Max manifest size: 4MB |
| TC-004 | Rate limit: 1000 req/hr |
| TC-005 | Token validity: 5 min |

### 9.2 Design Constraints

| Constraint | Description |
|------------|-------------|
| DC-001 | Thin adapter only |
| DC-002 | No image building |
| DC-003 | No registry hosting |
| DC-004 | Uses shared auth primitives |
| DC-005 | No cross-module dependencies |

### 9.3 GHCR-Specific Limitations

| Limitation | Workaround |
|------------|------------|
| No catalog API for orgs | Use Packages API |
| Delete requires version ID | Lookup via Packages API |
| Vuln data requires GHAS | Graceful fallback |
| Rate limits per token | Token rotation strategy |
| Anonymous pull limits | Always authenticate |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-GHCR-SPEC-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Specification Document**

*Proceed to Pseudocode phase upon approval.*
