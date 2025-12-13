# Google Artifact Registry Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/google-artifact-registry`

---

## 1. Module Structure

### 1.1 Directory Layout

```
integrations/google-artifact-registry/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Public API exports
│   ├── client.rs                 # ArtifactRegistryClient
│   ├── config.rs                 # Configuration types
│   ├── auth/
│   │   ├── mod.rs
│   │   ├── provider.rs           # GcpAuthProvider
│   │   ├── service_account.rs    # SA key authentication
│   │   ├── workload_identity.rs  # GKE workload identity
│   │   └── docker_token.rs       # Registry token exchange
│   ├── services/
│   │   ├── mod.rs
│   │   ├── repository.rs         # RepositoryService
│   │   ├── package.rs            # PackageService
│   │   ├── docker.rs             # DockerService (OCI)
│   │   └── vulnerability.rs      # VulnerabilityService
│   ├── models/
│   │   ├── mod.rs
│   │   ├── repository.rs         # Repository, Format
│   │   ├── package.rs            # Package, Version, Tag
│   │   ├── manifest.rs           # Manifest, Layer, Config
│   │   ├── vulnerability.rs      # VulnerabilityReport, CVE
│   │   └── common.rs             # ImageReference, Digest
│   ├── error.rs                  # Error types
│   ├── location.rs               # Regional routing
│   └── simulation/
│       ├── mod.rs
│       ├── mock.rs               # Mock provider
│       └── recorder.rs           # Record/replay
├── tests/
│   ├── integration/
│   │   ├── auth_test.rs
│   │   ├── repository_test.rs
│   │   ├── docker_test.rs
│   │   └── vulnerability_test.rs
│   └── unit/
│       ├── auth_test.rs
│       ├── location_test.rs
│       └── manifest_test.rs
└── typescript/
    ├── package.json
    ├── src/
    │   ├── index.ts
    │   ├── client.ts
    │   ├── auth.ts
    │   ├── services/
    │   └── types/
    └── tests/
```

### 1.2 Module Dependencies

```
┌─────────────────────────────────────────────────────────────┐
│                    google-artifact-registry                  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │Repository   │  │  Package    │  │      Docker         │  │
│  │  Service    │  │  Service    │  │     Service         │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│                   ┌──────▼──────┐                            │
│                   │   Client    │                            │
│                   └──────┬──────┘                            │
│                          │                                   │
│         ┌────────────────┼────────────────┐                  │
│         │                │                │                  │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌─────▼─────┐            │
│  │    Auth     │  │  Location   │  │ Simulation│            │
│  │  Provider   │  │   Router    │  │   Layer   │            │
│  └─────────────┘  └─────────────┘  └───────────┘            │
├─────────────────────────────────────────────────────────────┤
│                      Shared Modules                          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐  │
│  │Credentials │ │ Resilience │ │Observability│ │   HTTP   │  │
│  └────────────┘ └────────────┘ └────────────┘ └──────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Component Architecture

### 2.1 High-Level Component Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                         LLM Dev Ops Platform                          │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    ArtifactRegistryClient                             │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                        Service Layer                            │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐   │  │
│  │  │ Repository   │ │   Package    │ │   Vulnerability      │   │  │
│  │  │   Service    │ │   Service    │ │     Service          │   │  │
│  │  └──────┬───────┘ └──────┬───────┘ └──────────┬───────────┘   │  │
│  │         │                │                     │               │  │
│  │  ┌──────▼────────────────▼─────────────────────▼───────────┐  │  │
│  │  │                   Docker Service                         │  │  │
│  │  │    ┌──────────┐  ┌──────────┐  ┌──────────────────┐     │  │  │
│  │  │    │ Manifest │  │   Blob   │  │       Tag        │     │  │  │
│  │  │    │   Ops    │  │   Ops    │  │       Ops        │     │  │  │
│  │  │    └──────────┘  └──────────┘  └──────────────────┘     │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                      Infrastructure Layer                       │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────┐ │  │
│  │  │    Auth    │  │  Location  │  │  Circuit   │  │  Retry   │ │  │
│  │  │  Provider  │  │   Router   │  │  Breaker   │  │  Policy  │ │  │
│  │  └────────────┘  └────────────┘  └────────────┘  └──────────┘ │  │
│  └────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬──────────────────────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
            ▼                       ▼                       ▼
┌───────────────────┐   ┌───────────────────┐   ┌───────────────────┐
│  Artifact Registry │   │  Docker Registry  │   │ Container Analysis│
│       API          │   │   (OCI) API       │   │       API         │
│  (REST/gRPC)       │   │   (REST)          │   │    (REST)         │
└───────────────────┘   └───────────────────┘   └───────────────────┘
```

### 2.2 Service Interactions

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Request Flow                                  │
└─────────────────────────────────────────────────────────────────────┘

User Request                          External APIs
     │                                      │
     ▼                                      │
┌─────────┐                                 │
│ Client  │                                 │
└────┬────┘                                 │
     │                                      │
     ▼                                      │
┌─────────────────┐                         │
│ Location Router │──┐                      │
└────────┬────────┘  │                      │
         │           │ Select endpoint      │
         ▼           │ based on location    │
┌─────────────────┐  │                      │
│  Auth Provider  │◄─┘                      │
└────────┬────────┘                         │
         │ Get/refresh token                │
         ▼                                  │
┌─────────────────┐                         │
│ Circuit Breaker │                         │
└────────┬────────┘                         │
         │                                  │
         ▼                                  │
┌─────────────────┐                         │
│  Retry Policy   │                         │
└────────┬────────┘                         │
         │                                  │
         ▼                                  ▼
┌─────────────────┐    HTTP/gRPC    ┌──────────────┐
│   HTTP Client   │────────────────►│  GCP APIs    │
└─────────────────┘                 └──────────────┘
```

---

## 3. Authentication Architecture

### 3.1 Auth Flow State Machine

```
                    ┌─────────────────────────┐
                    │    No Credentials       │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │   Detect Auth Method    │
                    └───────────┬─────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│ Service Acct  │       │   Workload    │       │     ADC       │
│     Key       │       │   Identity    │       │  (Default)    │
└───────┬───────┘       └───────┬───────┘       └───────┬───────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│  Sign JWT     │       │ Query Metadata│       │ gcloud/env    │
│  Assertion    │       │   Server      │       │   token       │
└───────┬───────┘       └───────┬───────┘       └───────┬───────┘
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │   OAuth2 Token          │
                    │   (access_token)        │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │   Token Cached          │
                    │   (with expiry)         │
                    └───────────┬─────────────┘
                                │
           ┌────────────────────┼────────────────────┐
           │                    │                    │
           ▼                    ▼                    ▼
    ┌─────────────┐     ┌─────────────────┐  ┌─────────────┐
    │ AR API Call │     │ Docker Registry │  │  Container  │
    │  (Bearer)   │     │ Token Exchange  │  │  Analysis   │
    └─────────────┘     └────────┬────────┘  └─────────────┘
                                 │
                        ┌────────▼────────┐
                        │ Scoped Registry │
                        │     Token       │
                        └─────────────────┘
```

### 3.2 Token Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                    Token Cache Manager                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                   OAuth Token                         │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  │   │
│  │  │  Fresh  │─►│ Active  │─►│  Stale  │─►│ Expired │  │   │
│  │  │ (100%)  │  │ (>20%)  │  │ (<20%)  │  │  (0%)   │  │   │
│  │  └─────────┘  └─────────┘  └────┬────┘  └─────────┘  │   │
│  │                                  │                    │   │
│  │                          Background                   │   │
│  │                           Refresh                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Docker Registry Tokens                   │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │  Key: (registry, scope)                        │  │   │
│  │  │  Value: (token, expiry)                        │  │   │
│  │  │                                                │  │   │
│  │  │  "us-docker.pkg.dev:repo:proj/repo:pull"       │  │   │
│  │  │  "europe-docker.pkg.dev:repo:proj/repo:push"   │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Regional Architecture

### 4.1 Location Router

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Location Router                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Input: (project, repository, operation)                             │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    Location Resolution                          │ │
│  │                                                                  │ │
│  │  1. Explicit location in ImageReference                         │ │
│  │  2. Repository metadata lookup                                  │ │
│  │  3. Default location from config                                │ │
│  │  4. Fallback to "us" multi-region                               │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    Endpoint Construction                        │ │
│  │                                                                  │ │
│  │  API Endpoint:                                                  │ │
│  │    artifactregistry.googleapis.com                              │ │
│  │                                                                  │ │
│  │  Docker Registry:                                               │ │
│  │    {location}-docker.pkg.dev                                    │ │
│  │                                                                  │ │
│  │  Examples:                                                      │ │
│  │    us-central1-docker.pkg.dev      (regional)                   │ │
│  │    us-docker.pkg.dev               (multi-regional)             │ │
│  │    europe-docker.pkg.dev           (multi-regional)             │ │
│  │    asia-east1-docker.pkg.dev       (regional)                   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Multi-Region Support

```
┌─────────────────────────────────────────────────────────────────┐
│                    Regional Topology                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Multi-Regional (replicated):                                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  "us"      → us-docker.pkg.dev                            │  │
│  │  "europe"  → europe-docker.pkg.dev                        │  │
│  │  "asia"    → asia-docker.pkg.dev                          │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Regional (single location):                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  "us-central1"    → us-central1-docker.pkg.dev            │  │
│  │  "us-east1"       → us-east1-docker.pkg.dev               │  │
│  │  "europe-west1"   → europe-west1-docker.pkg.dev           │  │
│  │  "asia-east1"     → asia-east1-docker.pkg.dev             │  │
│  │  ...              → {region}-docker.pkg.dev               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  API Endpoint (global):                                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  All locations → artifactregistry.googleapis.com          │  │
│  │  Container Analysis → containeranalysis.googleapis.com    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Data Flow Architecture

### 5.1 Manifest Push Flow

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌───────────────┐
│ Client  │     │ Docker  │     │  Auth   │     │   Registry    │
│         │     │ Service │     │Provider │     │{loc}.pkg.dev  │
└────┬────┘     └────┬────┘     └────┬────┘     └───────┬───────┘
     │               │               │                   │
     │ put_manifest  │               │                   │
     │──────────────►│               │                   │
     │               │               │                   │
     │               │ get_docker_   │                   │
     │               │ token(push)   │                   │
     │               │──────────────►│                   │
     │               │               │                   │
     │               │               │ OAuth2 exchange   │
     │               │               │──────────────────►│
     │               │               │◄──────────────────│
     │               │               │  registry token   │
     │               │◄──────────────│                   │
     │               │  token        │                   │
     │               │               │                   │
     │               │ Check layers exist (parallel)     │
     │               │─────────────────────────────────►│
     │               │◄─────────────────────────────────│
     │               │               │                   │
     │               │ PUT /manifests/{tag}             │
     │               │─────────────────────────────────►│
     │               │◄─────────────────────────────────│
     │               │  201 Created + digest            │
     │◄──────────────│               │                   │
     │  digest       │               │                   │
```

### 5.2 Blob Upload Flow

```
┌─────────┐     ┌─────────┐     ┌───────────────┐
│ Client  │     │ Docker  │     │   Registry    │
│         │     │ Service │     │{loc}.pkg.dev  │
└────┬────┘     └────┬────┘     └───────┬───────┘
     │               │                   │
     │ upload_blob   │                   │
     │──────────────►│                   │
     │               │                   │
     │               │ HEAD /blobs/{digest}
     │               │──────────────────►│
     │               │◄──────────────────│
     │               │  404 Not Found    │
     │               │                   │
     │               │ POST /blobs/uploads/
     │               │──────────────────►│
     │               │◄──────────────────│
     │               │  202 + Location   │
     │               │                   │
     │               │  ┌─────────────────────────┐
     │               │  │ For each chunk:         │
     │               │  │  PATCH {upload_url}     │
     │               │  │  Content-Range: x-y     │
     │               │  │  ◄─► 202 + new Location │
     │               │  └─────────────────────────┘
     │               │                   │
     │               │ PUT {url}?digest=sha256:...
     │               │──────────────────►│
     │               │◄──────────────────│
     │               │  201 Created      │
     │◄──────────────│                   │
     │  digest       │                   │
```

### 5.3 Vulnerability Query Flow

```
┌─────────┐     ┌───────────┐     ┌─────────────────────┐
│ Client  │     │  Vuln     │     │ Container Analysis  │
│         │     │ Service   │     │       API           │
└────┬────┘     └─────┬─────┘     └──────────┬──────────┘
     │                │                       │
     │ get_vulns      │                       │
     │ (image@digest) │                       │
     │───────────────►│                       │
     │                │                       │
     │                │ Build resource URI:   │
     │                │ https://{loc}.pkg.dev/│
     │                │ {proj}/{repo}@{digest}│
     │                │                       │
     │                │ GET /occurrences      │
     │                │ ?filter=resourceUrl=..│
     │                │ &kind=VULNERABILITY   │
     │                │──────────────────────►│
     │                │◄──────────────────────│
     │                │  occurrences[]        │
     │                │                       │
     │                │ Aggregate by severity │
     │                │ Build CVE list        │
     │◄───────────────│                       │
     │ VulnerabilityReport                    │
```

---

## 6. Error Handling Architecture

### 6.1 Error Propagation

```
┌─────────────────────────────────────────────────────────────────┐
│                     Error Handling Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  External Error                                                  │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Error Classification                        │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │    │
│  │  │ HTTP Status │  │gRPC Status  │  │ Registry Error  │  │    │
│  │  │   Codes     │  │   Codes     │  │    Codes        │  │    │
│  │  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │    │
│  │         └────────────────┼──────────────────┘           │    │
│  │                          ▼                               │    │
│  │              ArtifactRegistryError                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                             │                                    │
│       ┌─────────────────────┼─────────────────────┐             │
│       │                     │                     │             │
│       ▼                     ▼                     ▼             │
│  ┌─────────┐          ┌─────────┐          ┌─────────┐         │
│  │Retryable│          │ Fatal   │          │  Auth   │         │
│  │ (wait)  │          │ (fail)  │          │(refresh)│         │
│  └────┬────┘          └────┬────┘          └────┬────┘         │
│       │                    │                    │               │
│       ▼                    │                    ▼               │
│  ┌─────────┐               │              ┌─────────┐          │
│  │  Retry  │               │              │ Refresh │          │
│  │  Loop   │               │              │  Token  │          │
│  └────┬────┘               │              └────┬────┘          │
│       │                    │                   │               │
│       └────────────────────┼───────────────────┘               │
│                            ▼                                    │
│                    Final Result                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Retry Decision Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                    Retry Decision Matrix                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Error Type              │ Retry │ Strategy      │ Max Attempts │
│  ────────────────────────┼───────┼───────────────┼────────────  │
│  UNAUTHENTICATED (401)   │  Yes  │ Refresh token │      1       │
│  RESOURCE_EXHAUSTED(429) │  Yes  │ Exp backoff   │      5       │
│  UNAVAILABLE (503)       │  Yes  │ Exp backoff   │      3       │
│  INTERNAL (500)          │  Yes  │ Exp backoff   │      3       │
│  DEADLINE_EXCEEDED       │  Yes  │ Fixed delay   │      3       │
│  ────────────────────────┼───────┼───────────────┼────────────  │
│  PERMISSION_DENIED (403) │  No   │ Fail fast     │      0       │
│  NOT_FOUND (404)         │  No   │ Fail fast     │      0       │
│  INVALID_ARGUMENT (400)  │  No   │ Fail fast     │      0       │
│  ALREADY_EXISTS (409)    │  No   │ Fail fast     │      0       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Simulation Architecture

### 7.1 Simulation Layer

```
┌─────────────────────────────────────────────────────────────────┐
│                    Simulation Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  ArtifactRegistryProvider               │    │
│  │                       (trait)                            │    │
│  └─────────────────────────┬───────────────────────────────┘    │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                 │
│         │                  │                  │                 │
│         ▼                  ▼                  ▼                 │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐       │
│  │    Live     │   │    Mock     │   │    Recording    │       │
│  │  Provider   │   │  Provider   │   │    Provider     │       │
│  └─────────────┘   └──────┬──────┘   └────────┬────────┘       │
│                           │                   │                 │
│                           ▼                   ▼                 │
│                    ┌─────────────┐     ┌─────────────┐          │
│                    │  In-Memory  │     │   Cassette  │          │
│                    │    State    │     │    Files    │          │
│                    └─────────────┘     └─────────────┘          │
│                                                                  │
│  Mode Selection:                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  SIMULATION_MODE=mock     → MockProvider                │    │
│  │  SIMULATION_MODE=record   → RecordingProvider           │    │
│  │  SIMULATION_MODE=replay   → RecordingProvider (replay)  │    │
│  │  (default)                → LiveProvider                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Observability Architecture

### 8.1 Telemetry Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Observability Pipeline                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐                                                │
│  │   Request   │                                                │
│  └──────┬──────┘                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  Instrumentation                         │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────────────┐   │    │
│  │  │  Tracing  │  │  Metrics  │  │     Logging       │   │    │
│  │  │  (spans)  │  │ (counters)│  │  (structured)     │   │    │
│  │  └─────┬─────┘  └─────┬─────┘  └─────────┬─────────┘   │    │
│  │        │              │                  │              │    │
│  └────────┼──────────────┼──────────────────┼──────────────┘    │
│           │              │                  │                    │
│           ▼              ▼                  ▼                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐          │
│  │   Jaeger/   │  │ Prometheus/ │  │   ELK/Cloud     │          │
│  │   Zipkin    │  │   Grafana   │  │    Logging      │          │
│  └─────────────┘  └─────────────┘  └─────────────────┘          │
│                                                                  │
│  Span Attributes:                                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  gar.project      = "my-project"                        │    │
│  │  gar.location     = "us-central1"                       │    │
│  │  gar.repository   = "my-repo"                           │    │
│  │  gar.image        = "my-image"                          │    │
│  │  gar.operation    = "manifest.get"                      │    │
│  │  gar.digest       = "sha256:abc..."                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Security Architecture

### 9.1 Credential Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Credential Management                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   Credential Sources                     │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐│    │
│  │  │ Service Acct │ │   Workload   │ │       ADC        ││    │
│  │  │  JSON Key    │ │   Identity   │ │  (gcloud auth)   ││    │
│  │  └──────┬───────┘ └──────┬───────┘ └────────┬─────────┘│    │
│  │         │                │                  │          │    │
│  │         └────────────────┼──────────────────┘          │    │
│  │                          ▼                              │    │
│  │              ┌───────────────────────┐                  │    │
│  │              │  SecretString Wrapper │                  │    │
│  │              │  (never logged)       │                  │    │
│  │              └───────────┬───────────┘                  │    │
│  │                          │                              │    │
│  │                          ▼                              │    │
│  │              ┌───────────────────────┐                  │    │
│  │              │    Token Cache        │                  │    │
│  │              │  (in-memory only)     │                  │    │
│  │              └───────────────────────┘                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Security Controls:                                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  ✓ Keys never written to logs                           │    │
│  │  ✓ Tokens cached in-memory only                         │    │
│  │  ✓ Auto-refresh before expiry                           │    │
│  │  ✓ TLS 1.2+ enforced                                    │    │
│  │  ✓ Certificate validation enabled                       │    │
│  │  ✓ Digest verification on all downloads                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. TypeScript Architecture

### 10.1 TypeScript Module Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                TypeScript Implementation                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   ArtifactRegistryClient                 │    │
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────┐ │    │
│  │  │ repos()   │ │packages() │ │ docker()  │ │ vulns() │ │    │
│  │  └───────────┘ └───────────┘ └───────────┘ └─────────┘ │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Authentication:                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  google-auth-library                                    │    │
│  │  ├── GoogleAuth (ADC)                                   │    │
│  │  ├── JWT (service account)                              │    │
│  │  └── Compute (metadata server)                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  HTTP Client: fetch / node-fetch with retry wrapper             │
│  Types: Zod schemas for runtime validation                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Architecture |

---

**Next Phase:** Refinement - Edge cases, multi-arch handling, cross-region replication, cleanup policies, and advanced error scenarios.
