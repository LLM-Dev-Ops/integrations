# Amazon ECR Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/aws/ecr`

---

## 1. C4 Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LLM Dev Ops Platform                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Workflow   │  │  Container  │  │  Security   │  │   Deploy    │    │
│  │  Orchestrator│  │  Manager    │  │   Scanner   │  │   Service   │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │            │
│         └────────────────┴────────┬───────┴────────────────┘            │
│                                   │                                      │
│                          ┌────────▼────────┐                            │
│                          │   ECR Adapter   │                            │
│                          │     Module      │                            │
│                          └────────┬────────┘                            │
└───────────────────────────────────┼─────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
           ┌────────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐
           │  ECR Private  │ │ ECR Public  │ │    AWS     │
           │   Registry    │ │  Registry   │ │    STS     │
           │  (Regional)   │ │  (Global)   │ │            │
           └───────────────┘ └─────────────┘ └────────────┘
```

---

## 2. C4 Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          ECR Adapter Module                              │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                        Service Layer                             │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │    │
│  │  │Repository│ │  Image   │ │ Manifest │ │   Scan   │           │    │
│  │  │ Service  │ │ Service  │ │ Service  │ │ Service  │           │    │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘           │    │
│  │       │            │            │            │                   │    │
│  │  ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐ ┌────┴─────┐           │    │
│  │  │   Auth   │ │Replicatn │ │  Public  │ │  Token   │           │    │
│  │  │ Service  │ │ Service  │ │ Registry │ │  Cache   │           │    │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │    │
│  └─────────────────────────────┬───────────────────────────────────┘    │
│                                │                                         │
│  ┌─────────────────────────────▼───────────────────────────────────┐    │
│  │                      Transport Layer                             │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                 │    │
│  │  │   Request  │  │  Response  │  │   Error    │                 │    │
│  │  │  Builder   │  │   Parser   │  │   Mapper   │                 │    │
│  │  └────────────┘  └────────────┘  └────────────┘                 │    │
│  └─────────────────────────────┬───────────────────────────────────┘    │
│                                │                                         │
│  ┌─────────────────────────────▼───────────────────────────────────┐    │
│  │                    Shared Dependencies                           │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │    │
│  │  │ aws/auth │  │resilience│  │observabil│  │  vector  │        │    │
│  │  │          │  │          │  │   ity    │  │  memory  │        │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. C4 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Service Layer                                  │
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │ RepositoryService│    │   ImageService  │    │ ManifestService │     │
│  │                 │    │                 │    │                 │     │
│  │ - list_repos    │    │ - list_images   │    │ - get_manifest  │     │
│  │ - get_repo      │    │ - describe      │    │ - get_list      │     │
│  │ - get_lifecycle │    │ - batch_get     │    │ - get_config    │     │
│  │ - get_policy    │    │ - put_tag       │    │ - get_layers    │     │
│  │ - list_tags     │    │ - batch_delete  │    │ - parse_manifest│     │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘     │
│           │                      │                      │               │
│  ┌────────┴──────────────────────┴──────────────────────┴────────┐     │
│  │                         EcrClient                              │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │     │
│  │  │   Config    │  │ TokenCache  │  │ RateLimiter │            │     │
│  │  └─────────────┘  └─────────────┘  └─────────────┘            │     │
│  └────────────────────────────┬──────────────────────────────────┘     │
│                               │                                         │
│  ┌────────────────────────────┴──────────────────────────────────┐     │
│  │                      ScanService                               │     │
│  │                                                                │     │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │     │
│  │  │ start_scan  │  │get_findings │  │ wait_for    │            │     │
│  │  │             │  │             │  │   _scan     │            │     │
│  │  └─────────────┘  └─────────────┘  └─────────────┘            │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │   AuthService   │    │ReplicationSvc   │    │PublicRegistrySvc│     │
│  │                 │    │                 │    │                 │     │
│  │ - get_token     │    │ - get_status    │    │ - list_repos    │     │
│  │ - get_creds     │    │ - list_dests    │    │ - get_repo      │     │
│  │ - get_login_cmd │    │ - get_config    │    │ - list_images   │     │
│  │ - refresh_token │    │                 │    │ - get_token     │     │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Module Structure

```
integrations/aws/ecr/
├── mod.rs                    # Module exports
├── client.rs                 # EcrClient implementation
├── config.rs                 # EcrConfig and AuthConfig
├── types/
│   ├── mod.rs
│   ├── repository.rs         # Repository, ScanConfig, EncryptionConfig
│   ├── image.rs              # Image, ImageIdentifier, ImageDetail
│   ├── manifest.rs           # ImageManifest, ManifestList, Platform
│   ├── scan.rs               # ScanFindings, Finding, Severity
│   ├── auth.rs               # AuthorizationData, DockerCredentials
│   ├── lifecycle.rs          # LifecyclePolicy, LifecyclePolicyRule
│   └── replication.rs        # ReplicationStatus, ReplicationConfig
├── services/
│   ├── mod.rs
│   ├── repository.rs         # RepositoryService
│   ├── image.rs              # ImageService
│   ├── manifest.rs           # ManifestService
│   ├── scan.rs               # ScanService
│   ├── auth.rs               # AuthService
│   ├── replication.rs        # ReplicationService
│   └── public.rs             # PublicRegistryService
├── transport/
│   ├── mod.rs
│   ├── request.rs            # Request building
│   ├── response.rs           # Response parsing
│   └── error.rs              # Error mapping
├── cache/
│   ├── mod.rs
│   ├── token_cache.rs        # Authorization token caching
│   └── metadata_cache.rs     # Repository/image metadata caching
├── simulation/
│   ├── mod.rs
│   ├── mock_client.rs        # MockEcrClient
│   ├── recorder.rs           # Operation recording
│   └── replay.rs             # Replay engine
└── tests/
    ├── unit/
    ├── integration/
    └── fixtures/
```

---

## 5. Data Flow Architecture

### 5.1 Image Retrieval Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Platform │────▶│  Image   │────▶│   ECR    │────▶│   AWS    │
│ Request  │     │ Service  │     │  Client  │     │   ECR    │
└──────────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
                      │                │                │
                      ▼                ▼                ▼
               ┌──────────┐     ┌──────────┐     ┌──────────┐
               │  Parse   │     │  Token   │     │ Describe │
               │  Request │     │  Check   │     │  Images  │
               └──────────┘     └────┬─────┘     └────┬─────┘
                                     │                │
                            ┌────────▼────────┐       │
                            │  Token Valid?   │       │
                            └────────┬────────┘       │
                                     │                │
                    ┌────────────────┴────────────┐   │
                    │ No                     Yes  │   │
                    ▼                             ▼   │
             ┌──────────┐                  ┌──────────┤
             │  Refresh │                  │  Execute │
             │  Token   │                  │  Request │
             └────┬─────┘                  └────┬─────┘
                  │                              │
                  └──────────────┬───────────────┘
                                 ▼
                          ┌──────────┐
                          │  Return  │
                          │ ImageDetail│
                          └──────────┘
```

### 5.2 Vulnerability Scan Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Start   │────▶│   Scan   │────▶│  Poll    │────▶│ Findings │
│   Scan   │     │  Queued  │     │  Status  │     │  Ready   │
└──────────┘     └──────────┘     └────┬─────┘     └────┬─────┘
                                       │                │
                                       ▼                ▼
                                ┌──────────┐     ┌──────────┐
                                │ Backoff  │     │  Parse   │
                                │  Wait    │     │ Findings │
                                └────┬─────┘     └────┬─────┘
                                     │                │
                                     ▼                ▼
                              ┌───────────┐    ┌──────────┐
                              │  Timeout  │    │  Store   │
                              │  Check    │    │  Vector  │
                              └───────────┘    └──────────┘
```

---

## 6. Token Management Architecture

### 6.1 Token Cache Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TokenCache                                     │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                    Cache Storage (RwLock)                      │      │
│  │                                                                │      │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │      │
│  │  │ us-east-1      │  │ us-west-2      │  │ eu-west-1      │  │      │
│  │  │ ─────────────  │  │ ─────────────  │  │ ─────────────  │  │      │
│  │  │ Token: ***     │  │ Token: ***     │  │ Token: ***     │  │      │
│  │  │ Expires: T+12h │  │ Expires: T+12h │  │ Expires: T+11h │  │      │
│  │  │ Endpoint: url  │  │ Endpoint: url  │  │ Endpoint: url  │  │      │
│  │  └────────────────┘  └────────────────┘  └────────────────┘  │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  ┌───────────────────┐    ┌───────────────────┐                        │
│  │   get(registry)   │    │  refresh_buffer   │                        │
│  │   ─────────────   │    │  ───────────────  │                        │
│  │   Check expiry    │    │  5 minutes before │                        │
│  │   Return if valid │    │  actual expiry    │                        │
│  └───────────────────┘    └───────────────────┘                        │
│                                                                          │
│  ┌───────────────────┐    ┌───────────────────┐                        │
│  │   set(registry,   │    │   clear(registry) │                        │
│  │       token)      │    │   ───────────────  │                        │
│  │   ─────────────   │    │   Remove on error │                        │
│  └───────────────────┘    └───────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Token Refresh Strategy

```
Timeline:
├─────────────────────────────────────────────────────────────────────────┤
│ T=0                                    T=11h55m            T=12h         │
│  │                                        │                  │           │
│  ▼                                        ▼                  ▼           │
│ Token                                  Refresh            Token          │
│ Acquired                               Window             Expires        │
│                                        Begins                            │
│                                           │                              │
│                              ┌────────────▼────────────┐                 │
│                              │  Background refresh     │                 │
│                              │  triggered on next use  │                 │
│                              └─────────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Multi-Region Architecture

### 7.1 Regional Client Management

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        RegionalClientManager                             │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                     Client Pool                                │      │
│  │                                                                │      │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │      │
│  │  │  us-east-1   │  │  us-west-2   │  │  eu-west-1   │        │      │
│  │  │  EcrClient   │  │  EcrClient   │  │  EcrClient   │        │      │
│  │  │  ──────────  │  │  ──────────  │  │  ──────────  │        │      │
│  │  │  TokenCache  │  │  TokenCache  │  │  TokenCache  │        │      │
│  │  │  RateLimiter │  │  RateLimiter │  │  RateLimiter │        │      │
│  │  │  CircuitBrkr │  │  CircuitBrkr │  │  CircuitBrkr │        │      │
│  │  └──────────────┘  └──────────────┘  └──────────────┘        │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  ┌─────────────────────┐    ┌─────────────────────┐                    │
│  │ get_client(region)  │    │ get_or_create()     │                    │
│  │ ────────────────    │    │ ───────────────     │                    │
│  │ Lazy initialization │    │ Thread-safe create  │                    │
│  └─────────────────────┘    └─────────────────────┘                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Cross-Region Replication Tracking

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Replication Status Tracker                            │
│                                                                          │
│  Source: us-east-1                                                       │
│  Image: sha256:abc123...                                                 │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Destination      │  Status      │  Last Check  │  Digest       │    │
│  │  ─────────────    │  ──────      │  ──────────  │  ──────       │    │
│  │  us-west-2        │  Complete    │  10s ago     │  sha256:abc.. │    │
│  │  eu-west-1        │  InProgress  │  5s ago      │  pending      │    │
│  │  ap-southeast-1   │  Pending     │  2s ago      │  pending      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Poll Strategy:                                                          │
│  - Exponential backoff: 1s, 2s, 4s, 8s, max 30s                         │
│  - Timeout: configurable (default 5 minutes)                            │
│  - Early exit on all destinations complete                              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Error Handling Architecture

### 8.1 Error Classification

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Error Handler                                    │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    AWS SDK Error                                 │    │
│  └────────────────────────────┬────────────────────────────────────┘    │
│                               │                                          │
│              ┌────────────────┼────────────────┐                        │
│              ▼                ▼                ▼                        │
│     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│     │  Retryable  │  │  Terminal   │  │ Credential  │                  │
│     │   Errors    │  │   Errors    │  │   Errors    │                  │
│     └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                  │
│            │                │                │                          │
│            ▼                ▼                ▼                          │
│     ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│     │ - Throttle  │  │ - NotFound  │  │ - AccessDeny│                  │
│     │ - SvcUnavail│  │ - Invalid   │  │ - ExpiredTkn│                  │
│     │ - Timeout   │  │ - Mismatch  │  │ - InvalidCrd│                  │
│     │ - KMS (some)│  │ - TooMany   │  │             │                  │
│     └─────────────┘  └─────────────┘  └─────────────┘                  │
│                                                                          │
│  Action:                                                                 │
│  - Retryable: Exponential backoff with jitter                           │
│  - Terminal: Return error immediately                                    │
│  - Credential: Refresh token, then retry once                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Circuit Breaker Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Circuit Breaker States                                │
│                                                                          │
│     ┌─────────┐         ┌─────────┐         ┌─────────┐                │
│     │  Closed │────────▶│  Open   │────────▶│Half-Open│                │
│     │         │ failures│         │ timeout │         │                │
│     └────┬────┘ exceed  └─────────┘         └────┬────┘                │
│          │                    ▲                  │                      │
│          │                    │                  │                      │
│          ▼                    │                  ▼                      │
│    ┌───────────┐              │           ┌───────────┐                │
│    │  Success  │              │           │  Probe    │                │
│    │  Reset    │              │           │  Request  │                │
│    └───────────┘              │           └─────┬─────┘                │
│                               │                 │                      │
│                               │     ┌───────────┴───────────┐          │
│                               │     │                       │          │
│                               │     ▼                       ▼          │
│                          ┌─────────┐                 ┌─────────┐       │
│                          │ Failure │                 │ Success │       │
│                          │ Re-open │                 │  Close  │       │
│                          └─────────┘                 └─────────┘       │
│                                                                          │
│  Per-Region Circuit Breakers:                                           │
│  - Threshold: 5 failures in 30 seconds                                  │
│  - Open duration: 60 seconds                                            │
│  - Half-open: Allow 1 probe request                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Observability Integration

### 9.1 Metrics

```
Metrics Emitted:
├── ecr.repositories.listed      # Counter: repository list operations
├── ecr.images.described         # Counter: image describe operations
├── ecr.images.tagged            # Counter: tag operations
├── ecr.images.deleted           # Counter: delete operations
├── ecr.scans.started            # Counter: scan initiations
├── ecr.scans.completed          # Counter: completed scans
├── ecr.scans.findings           # Histogram: findings per severity
├── ecr.auth.token_refresh       # Counter: token refreshes
├── ecr.auth.token_cache_hit     # Counter: cache hits
├── ecr.auth.token_cache_miss    # Counter: cache misses
├── ecr.replication.checks       # Counter: replication status checks
├── ecr.request.latency_ms       # Histogram: request latency
├── ecr.request.errors           # Counter by error type
└── ecr.circuit_breaker.state    # Gauge: current state per region
```

### 9.2 Tracing

```
Span Hierarchy:
ecr.operation
├── ecr.auth.check_token
│   └── ecr.auth.refresh_token (if needed)
├── ecr.request.build
├── ecr.request.execute
│   ├── aws.sdk.sign_request
│   └── http.request
├── ecr.response.parse
└── ecr.metrics.emit
```

---

## 10. Simulation Architecture

### 10.1 Mock Client

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          MockEcrClient                                   │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                    In-Memory Registry                          │      │
│  │                                                                │      │
│  │  repositories: HashMap<String, MockRepository>                 │      │
│  │  images: HashMap<(repo, digest), MockImage>                    │      │
│  │  scans: HashMap<(repo, digest), MockScanState>                 │      │
│  │  tokens: HashMap<String, MockToken>                            │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                    Behavior Control                            │      │
│  │                                                                │      │
│  │  error_injection: Option<ErrorConfig>                          │      │
│  │  latency_injection: Option<LatencyConfig>                      │      │
│  │  scan_progression: ScanProgressConfig                          │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                    Operation Log                               │      │
│  │                                                                │      │
│  │  operations: Vec<RecordedOperation>                            │      │
│  │  - timestamp, operation_type, parameters, result               │      │
│  └───────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Replay Engine

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          ReplayEngine                                    │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                    Recording Mode                              │      │
│  │                                                                │      │
│  │  wrap_client(real_client) -> RecordingClient                   │      │
│  │  - Intercepts all operations                                   │      │
│  │  - Records request/response pairs                              │      │
│  │  - Stores to replay file                                       │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────┐      │
│  │                    Replay Mode                                 │      │
│  │                                                                │      │
│  │  load_recording(file) -> ReplayClient                          │      │
│  │  - Matches incoming requests to recorded                       │      │
│  │  - Returns recorded responses                                  │      │
│  │  - Strict mode: fail on unmatched                              │      │
│  │  - Loose mode: best-effort matching                            │      │
│  └───────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Security Architecture

### 11.1 Credential Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Credential Resolution                               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                     AuthConfig                                   │    │
│  └────────────────────────────┬────────────────────────────────────┘    │
│                               │                                          │
│           ┌───────────────────┼───────────────────┐                     │
│           │                   │                   │                     │
│           ▼                   ▼                   ▼                     │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐               │
│  │  Default    │     │   Assume    │     │    Web      │               │
│  │   Chain     │     │    Role     │     │  Identity   │               │
│  └──────┬──────┘     └──────┬──────┘     └──────┬──────┘               │
│         │                   │                   │                       │
│         ▼                   ▼                   ▼                       │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    aws/auth Module                               │    │
│  │  - Credential caching                                            │    │
│  │  - Automatic refresh                                             │    │
│  │  - SecretString protection                                       │    │
│  └────────────────────────────┬────────────────────────────────────┘    │
│                               │                                          │
│                               ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    ECR Authorization Token                       │    │
│  │  - Base64 encoded username:password                              │    │
│  │  - 12 hour validity                                              │    │
│  │  - Cached per registry/region                                    │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Permission Model

```
Required IAM Permissions (Read Operations):
├── ecr:DescribeRepositories
├── ecr:ListImages
├── ecr:DescribeImages
├── ecr:BatchGetImage
├── ecr:GetDownloadUrlForLayer
├── ecr:GetAuthorizationToken
├── ecr:DescribeImageScanFindings
├── ecr:GetLifecyclePolicy
├── ecr:GetRepositoryPolicy
├── ecr:ListTagsForResource
└── ecr:DescribeRegistry

Required IAM Permissions (Write Operations):
├── ecr:PutImage
├── ecr:BatchDeleteImage
└── ecr:StartImageScan

ECR Public Permissions:
├── ecr-public:DescribeRepositories
├── ecr-public:DescribeImages
└── ecr-public:GetAuthorizationToken
```

---

## 12. Interface Contracts

### 12.1 Client Interface

```
trait EcrClientTrait:
    // Repository operations
    fn list_repositories(filter) -> Result<Vec<Repository>>
    fn get_repository(name) -> Result<Repository>
    fn get_lifecycle_policy(name) -> Result<LifecyclePolicy>
    fn get_repository_policy(name) -> Result<RepositoryPolicy>

    // Image operations
    fn list_images(repo, filter) -> Result<Vec<ImageIdentifier>>
    fn describe_images(repo, ids) -> Result<Vec<ImageDetail>>
    fn get_image(repo, id) -> Result<Image>
    fn put_image_tag(repo, manifest, tag) -> Result<Image>
    fn batch_delete_images(repo, ids) -> Result<DeleteResult>

    // Manifest operations
    fn get_manifest(repo, id) -> Result<ImageManifest>
    fn get_image_config(repo, id) -> Result<ImageConfig>

    // Scan operations
    fn start_scan(repo, id) -> Result<ScanStatus>
    fn get_scan_findings(repo, id) -> Result<ScanFindings>

    // Auth operations
    fn get_authorization_token() -> Result<AuthorizationData>
    fn get_docker_credentials() -> Result<DockerCredentials>
```

### 12.2 Shared Module Interfaces

```
aws/auth:
  fn get_credentials(config: AuthConfig) -> Result<Credentials>
  fn assume_role(role_arn: String) -> Result<Credentials>

shared/resilience:
  fn with_retry<T>(policy: RetryPolicy, f: Fn) -> Result<T>
  fn circuit_breaker(name: String) -> CircuitBreaker

shared/observability:
  fn emit_metric(name: String, value: f64, tags: Tags)
  fn start_span(name: String) -> Span
  fn log_structured(level: Level, message: String, fields: Fields)

shared/vector-memory:
  fn store_embedding(key: String, embedding: Vec<f32>, metadata: Map)
  fn search_similar(query: Vec<f32>, limit: usize) -> Vec<Match>
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-amazon-ecr.md | Complete |
| 2. Pseudocode | pseudocode-amazon-ecr.md | Complete |
| 3. Architecture | architecture-amazon-ecr.md | Complete |
| 4. Refinement | refinement-amazon-ecr.md | Pending |
| 5. Completion | completion-amazon-ecr.md | Pending |

---

*Phase 3: Architecture - Complete*
