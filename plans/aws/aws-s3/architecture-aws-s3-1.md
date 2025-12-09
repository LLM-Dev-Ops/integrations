# AWS S3 Integration Module - Architecture (Part 1)

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/aws-s3`
**Part:** 1 of 2 - System Design & Component Architecture

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [C4 Model Diagrams](#2-c4-model-diagrams)
3. [Component Architecture](#3-component-architecture)
4. [Service Layer Design](#4-service-layer-design)
5. [Data Flow Architecture](#5-data-flow-architecture)
6. [Dependency Injection & Testability](#6-dependency-injection--testability)

---

## 1. Architecture Overview

### 1.1 Architectural Style

The AWS S3 Integration Module follows a **Hexagonal Architecture** (Ports and Adapters) combined with **Clean Architecture** principles, enabling:

- **Testability**: All external dependencies accessed through interfaces (ports)
- **Flexibility**: Easy swapping of implementations (adapters)
- **Separation of Concerns**: Clear boundaries between business logic and infrastructure
- **London-School TDD**: Interface-first design enabling mock-based testing

### 1.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Consumer Applications                            │
│                    (LLM Services, Data Pipelines, etc.)                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      AWS S3 Integration Module                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Public API Layer                             │   │
│  │  S3Client │ ObjectsService │ BucketsService │ MultipartService  │   │
│  │           │ PresignService │ TaggingService │ TransferManager   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                   Application Services Layer                     │   │
│  │  Request Building │ Response Parsing │ Error Mapping │ Signing  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Domain Layer (Ports)                          │   │
│  │  HttpTransport │ AwsSigner │ CredentialsProvider │ XmlParser    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                    │                                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                Infrastructure Layer (Adapters)                   │   │
│  │  ReqwestTransport │ SigV4Signer │ ChainCredentials │ QuickXml   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Integration Repo Primitives                           │
│  integrations-errors │ integrations-retry │ integrations-circuit-breaker│
│  integrations-rate-limit │ integrations-tracing │ integrations-logging  │
│  integrations-types │ integrations-config                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         AWS S3 Service                                   │
│              (REST API over HTTPS with Signature V4)                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Design Principles

| Principle | Application |
|-----------|-------------|
| **Single Responsibility** | Each service handles one domain (Objects, Buckets, Multipart, etc.) |
| **Open/Closed** | New operations added via trait extension, not modification |
| **Liskov Substitution** | All trait implementations interchangeable |
| **Interface Segregation** | Small, focused traits (ObjectsService vs BucketsService) |
| **Dependency Inversion** | High-level modules depend on abstractions (traits) |
| **Composition over Inheritance** | Services composed from injected dependencies |

### 1.4 Module Boundaries

```
integrations/aws-s3/
├── src/
│   ├── lib.rs                    # Public API exports
│   ├── client/
│   │   ├── mod.rs                # S3Client trait and builder
│   │   ├── config.rs             # Configuration types
│   │   └── factory.rs            # Client factory implementation
│   ├── services/
│   │   ├── mod.rs                # Service exports
│   │   ├── objects.rs            # ObjectsService implementation
│   │   ├── buckets.rs            # BucketsService implementation
│   │   ├── multipart.rs          # MultipartService implementation
│   │   ├── presign.rs            # PresignService implementation
│   │   └── tagging.rs            # TaggingService implementation
│   ├── transport/
│   │   ├── mod.rs                # HttpTransport trait
│   │   ├── reqwest.rs            # Reqwest implementation
│   │   └── request.rs            # Request builder
│   ├── signing/
│   │   ├── mod.rs                # AwsSigner trait
│   │   ├── sigv4.rs              # Signature V4 implementation
│   │   └── presign.rs            # Presigned URL generation
│   ├── credentials/
│   │   ├── mod.rs                # CredentialsProvider trait
│   │   ├── chain.rs              # Chain provider
│   │   ├── env.rs                # Environment provider
│   │   ├── profile.rs            # Profile provider
│   │   ├── imds.rs               # Instance metadata provider
│   │   └── static.rs             # Static provider
│   ├── xml/
│   │   ├── mod.rs                # XML parsing utilities
│   │   ├── request.rs            # Request serialization
│   │   └── response.rs           # Response deserialization
│   ├── types/
│   │   ├── mod.rs                # Type exports
│   │   ├── request.rs            # Request types
│   │   ├── response.rs           # Response types
│   │   └── common.rs             # Shared types (StorageClass, etc.)
│   ├── error/
│   │   ├── mod.rs                # Error types
│   │   └── mapping.rs            # Error code mapping
│   └── transfer/
│       ├── mod.rs                # High-level transfer operations
│       ├── upload.rs             # Upload manager
│       ├── download.rs           # Download manager
│       └── sync.rs               # Sync operations
├── tests/
│   ├── unit/                     # Unit tests with mocks
│   ├── integration/              # Integration tests
│   └── fixtures/                 # Test fixtures
└── Cargo.toml
```

---

## 2. C4 Model Diagrams

### 2.1 Context Diagram (Level 1)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              System Context                              │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────────────────┐
                    │      LLM Application      │
                    │    (System Consumer)      │
                    └─────────────┬─────────────┘
                                  │
                                  │ Uses
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                    AWS S3 Integration Module                            │
│                                                                         │
│    Provides type-safe, production-ready interface to AWS S3 with        │
│    built-in resilience, observability, and security features            │
│                                                                         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
        ┌───────────────────┐   ┌───────────────────┐
        │    AWS S3         │   │  AWS IAM/STS      │
        │    Service        │   │  (Credentials)    │
        │  [External]       │   │  [External]       │
        └───────────────────┘   └───────────────────┘
```

### 2.2 Container Diagram (Level 2)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Container Diagram                              │
│                      AWS S3 Integration Module                           │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         Integration Module                               │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │   S3 Client     │  │  Service Layer  │  │  Transfer Mgr   │        │
│  │   [Component]   │  │  [Component]    │  │  [Component]    │        │
│  │                 │  │                 │  │                 │        │
│  │ Entry point for │  │ Domain services │  │ High-level ops  │        │
│  │ all S3 ops      │  │ for S3 entities │  │ upload/download │        │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘        │
│           │                    │                    │                  │
│           └────────────────────┼────────────────────┘                  │
│                                │                                        │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Infrastructure Layer                          │   │
│  │                                                                   │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────────┐ │   │
│  │  │  Transport  │ │   Signer    │ │ Credentials │ │    XML     │ │   │
│  │  │  [Adapter]  │ │  [Adapter]  │ │  [Adapter]  │ │ [Adapter]  │ │   │
│  │  │             │ │             │ │             │ │            │ │   │
│  │  │ HTTP/HTTPS  │ │  AWS SigV4  │ │ Multi-source│ │ Quick-XML  │ │   │
│  │  │ via Reqwest │ │  signing    │ │ credential  │ │ parser     │ │   │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └────────────┘ │   │
│  │         │               │               │                        │   │
│  └─────────┼───────────────┼───────────────┼────────────────────────┘   │
│            │               │               │                            │
└────────────┼───────────────┼───────────────┼────────────────────────────┘
             │               │               │
             ▼               ▼               ▼
     ┌───────────────┐ ┌───────────┐ ┌─────────────────┐
     │   AWS S3      │ │  (Local)  │ │  AWS IAM/STS    │
     │   REST API    │ │  Signing  │ │  IMDS/Profile   │
     └───────────────┘ └───────────┘ └─────────────────┘
```

### 2.3 Component Diagram (Level 3)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Component Diagram                               │
│                        Service Layer Detail                              │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                            S3Client                                      │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                         S3ClientImpl                              │   │
│  │  - config: S3Config                                               │   │
│  │  - transport: Arc<dyn HttpTransport>                              │   │
│  │  - signer: Arc<dyn AwsSigner>                                     │   │
│  │  - credentials: Arc<dyn CredentialsProvider>                      │   │
│  │  - retry_executor: Arc<RetryExecutor>                             │   │
│  │  - circuit_breaker: Arc<CircuitBreaker>                           │   │
│  │  - rate_limiter: Option<Arc<RateLimiter>>                         │   │
│  │  + objects() -> &dyn ObjectsService                               │   │
│  │  + buckets() -> &dyn BucketsService                               │   │
│  │  + multipart() -> &dyn MultipartService                           │   │
│  │  + presign() -> &dyn PresignService                               │   │
│  │  + tagging() -> &dyn TaggingService                               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ provides access to
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Service Components                              │
│                                                                         │
│  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────────┐  │
│  │  ObjectsService    │  │  BucketsService    │  │ MultipartService │  │
│  │                    │  │                    │  │                  │  │
│  │  + put()           │  │  + create()        │  │  + create()      │  │
│  │  + put_stream()    │  │  + delete()        │  │  + upload_part() │  │
│  │  + get()           │  │  + head()          │  │  + complete()    │  │
│  │  + get_stream()    │  │  + list()          │  │  + abort()       │  │
│  │  + delete()        │  │  + get_location()  │  │  + list_parts()  │  │
│  │  + delete_objects()│  │                    │  │  + upload()      │  │
│  │  + head()          │  │                    │  │                  │  │
│  │  + copy()          │  │                    │  │                  │  │
│  │  + list()          │  │                    │  │                  │  │
│  │  + list_all()      │  │                    │  │                  │  │
│  └────────────────────┘  └────────────────────┘  └──────────────────┘  │
│                                                                         │
│  ┌────────────────────┐  ┌────────────────────┐                        │
│  │  PresignService    │  │  TaggingService    │                        │
│  │                    │  │                    │                        │
│  │  + presign_get()   │  │  + get()           │                        │
│  │  + presign_put()   │  │  + put()           │                        │
│  │  + presign_delete()│  │  + delete()        │                        │
│  └────────────────────┘  └────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ uses
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Infrastructure Components                           │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                       <<interface>>                                │ │
│  │                       HttpTransport                                │ │
│  │  + send(request: HttpRequest) -> Result<HttpResponse>              │ │
│  │  + send_streaming(request) -> Result<StreamingResponse>            │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                              △                                          │
│                              │ implements                               │
│                              │                                          │
│  ┌───────────────────────────┴───────────────────────────────────────┐ │
│  │                    ReqwestHttpTransport                            │ │
│  │  - client: reqwest::Client                                         │ │
│  │  - config: HttpTransportConfig                                     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                       <<interface>>                                │ │
│  │                        AwsSigner                                   │ │
│  │  + sign_request(request, payload_hash, timestamp)                  │ │
│  │  + presign_url(method, url, expires_in, timestamp)                 │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                              △                                          │
│                              │ implements                               │
│                              │                                          │
│  ┌───────────────────────────┴───────────────────────────────────────┐ │
│  │                     AwsSignerV4Impl                                │ │
│  │  - region: String                                                  │ │
│  │  - service: String ("s3")                                          │ │
│  │  - credentials_provider: Arc<dyn CredentialsProvider>              │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                       <<interface>>                                │ │
│  │                    CredentialsProvider                             │ │
│  │  + get_credentials() -> Result<AwsCredentials>                     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                              △                                          │
│          ┌───────────────────┼───────────────────┐                     │
│          │                   │                   │                     │
│  ┌───────┴───────┐  ┌────────┴────────┐  ┌──────┴──────┐              │
│  │ ChainProvider │  │  EnvProvider    │  │ IMDSProvider│              │
│  └───────────────┘  └─────────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Code Diagram (Level 4) - Signature V4 Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Signature V4 Signing Flow                            │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│  HttpRequest     │
│  - method        │
│  - url           │
│  - headers       │
│  - body          │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        AwsSignerV4Impl.sign_request()                 │
├──────────────────────────────────────────────────────────────────────┤
│  1. Get credentials from provider                                     │
│     credentials <- credentials_provider.get_credentials().await       │
│                                                                       │
│  2. Add required headers                                              │
│     request.headers["x-amz-date"] = timestamp                         │
│     request.headers["x-amz-content-sha256"] = payload_hash            │
│     request.headers["x-amz-security-token"] = session_token (if any)  │
│                                                                       │
│  3. Create Canonical Request                                          │
│     ┌─────────────────────────────────────────────────────────────┐   │
│     │  canonical_request = [                                       │   │
│     │    method,                                                   │   │
│     │    canonical_uri,        // URL-encoded path                 │   │
│     │    canonical_query,      // Sorted query params              │   │
│     │    canonical_headers,    // Sorted, trimmed headers          │   │
│     │    signed_headers,       // Semicolon-separated header names │   │
│     │    payload_hash          // SHA256 of body                   │   │
│     │  ].join("\n")                                                │   │
│     └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  4. Create String to Sign                                             │
│     ┌─────────────────────────────────────────────────────────────┐   │
│     │  string_to_sign = [                                          │   │
│     │    "AWS4-HMAC-SHA256",                                       │   │
│     │    timestamp,            // YYYYMMDD'T'HHMMSS'Z'             │   │
│     │    credential_scope,     // date/region/s3/aws4_request      │   │
│     │    SHA256(canonical_request)                                 │   │
│     │  ].join("\n")                                                │   │
│     └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  5. Derive Signing Key                                                │
│     ┌─────────────────────────────────────────────────────────────┐   │
│     │  kDate    = HMAC-SHA256("AWS4" + secret_key, date)           │   │
│     │  kRegion  = HMAC-SHA256(kDate, region)                       │   │
│     │  kService = HMAC-SHA256(kRegion, "s3")                       │   │
│     │  kSigning = HMAC-SHA256(kService, "aws4_request")            │   │
│     └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  6. Calculate Signature                                               │
│     signature = HEX(HMAC-SHA256(kSigning, string_to_sign))            │
│                                                                       │
│  7. Add Authorization Header                                          │
│     request.headers["Authorization"] =                                │
│       "AWS4-HMAC-SHA256 " +                                           │
│       "Credential={access_key}/{credential_scope}, " +                │
│       "SignedHeaders={signed_headers}, " +                            │
│       "Signature={signature}"                                         │
└──────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐
│  Signed Request  │
│  (ready to send) │
└──────────────────┘
```

---

## 3. Component Architecture

### 3.1 Client Component

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        S3Client Component                                │
└─────────────────────────────────────────────────────────────────────────┘

                           <<interface>>
                    ┌──────────────────────┐
                    │      S3Client        │
                    ├──────────────────────┤
                    │ + objects()          │
                    │ + buckets()          │
                    │ + multipart()        │
                    │ + presign()          │
                    │ + tagging()          │
                    └──────────┬───────────┘
                               △
                               │ implements
                               │
                    ┌──────────┴───────────┐
                    │    S3ClientImpl      │
                    ├──────────────────────┤
                    │ - config             │
                    │ - transport          │
                    │ - signer             │
                    │ - credentials        │
                    │ - retry_executor     │
                    │ - circuit_breaker    │
                    │ - rate_limiter       │
                    │ - logger             │
                    │ - tracer             │
                    │ - objects_service    │◇───────┐
                    │ - buckets_service    │◇───────┤
                    │ - multipart_service  │◇───────┤  lazy init
                    │ - presign_service    │◇───────┤  (OnceCell)
                    │ - tagging_service    │◇───────┘
                    └──────────────────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
            ▼                  ▼                  ▼
┌───────────────────┐ ┌───────────────┐ ┌───────────────────┐
│ ObjectsServiceImpl│ │BucketsService │ │MultipartServiceImpl│
└───────────────────┘ │     Impl      │ └───────────────────┘
                      └───────────────┘

Builder Pattern:
┌─────────────────────────────────────────────────────────────────────────┐
│  S3ClientBuilder                                                         │
│                                                                         │
│  S3Client::builder()                                                    │
│    .region("us-east-1")                                                 │
│    .credentials_provider(ChainCredentialsProvider::default())           │
│    .endpoint(custom_endpoint)      // Optional: S3-compatible services  │
│    .path_style(true)               // Optional: path-style addressing   │
│    .timeout(Duration::from_secs(300))                                   │
│    .max_retries(3)                                                      │
│    .retry_config(RetryConfig { ... })                                   │
│    .circuit_breaker_config(CircuitBreakerConfig { ... })                │
│    .rate_limit_config(RateLimitConfig { ... })                          │
│    .multipart_threshold(100 * 1024 * 1024)  // 100MB                    │
│    .multipart_part_size(10 * 1024 * 1024)   // 10MB                     │
│    .multipart_concurrency(4)                                            │
│    .build()?                                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Service Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Service Component Pattern                            │
└─────────────────────────────────────────────────────────────────────────┘

Each service follows the same structural pattern:

┌─────────────────────────────────────────────────────────────────────────┐
│                      ServiceImpl Template                                │
├─────────────────────────────────────────────────────────────────────────┤
│  struct ServiceImpl {                                                    │
│      config: S3Config,                   // Configuration                │
│      transport: Arc<dyn HttpTransport>,  // HTTP client                  │
│      signer: Arc<dyn AwsSigner>,         // Request signing              │
│      executor: ResilientExecutor,        // Retry + CB + RL              │
│      logger: Arc<dyn Logger>,            // Structured logging           │
│      tracer: Arc<dyn Tracer>,            // Distributed tracing          │
│      endpoint_resolver: EndpointResolver,// URL generation               │
│  }                                                                       │
│                                                                         │
│  impl Service for ServiceImpl {                                          │
│      async fn operation(&self, request: Request) -> Result<Response> {   │
│          // 1. Create tracing span                                       │
│          let span = tracer.start_span("s3.Operation", { ... });          │
│                                                                         │
│          // 2. Validate input                                            │
│          validate(&request)?;                                            │
│                                                                         │
│          // 3. Build HTTP request                                        │
│          let http_request = build_request(&request)?;                    │
│                                                                         │
│          // 4. Execute with resilience                                   │
│          let result = executor.execute("Operation", || async {           │
│              // Sign request                                             │
│              let signed = signer.sign_request(...)?;                     │
│              // Send request                                             │
│              let response = transport.send(signed).await?;               │
│              // Parse response                                           │
│              parse_response(response)                                    │
│          }, &span).await;                                                │
│                                                                         │
│          // 5. End span and return                                       │
│          span.end();                                                     │
│          result                                                          │
│      }                                                                   │
│  }                                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Resilience Component

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Resilience Architecture                             │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                        ResilientExecutor                                 │
├─────────────────────────────────────────────────────────────────────────┤
│  struct ResilientExecutor {                                              │
│      transport: Arc<dyn HttpTransport>,                                  │
│      retry_executor: Arc<RetryExecutor>,      // From integrations-retry │
│      circuit_breaker: Arc<CircuitBreaker>,    // From integrations-cb    │
│      rate_limiter: Option<Arc<RateLimiter>>,  // From integrations-rl    │
│      logger: Arc<dyn Logger>,                                            │
│      tracer: Arc<dyn Tracer>,                                            │
│  }                                                                       │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ execute()
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Execution Flow                                      │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 1. CHECK CIRCUIT BREAKER                                         │   │
│  │    if circuit_breaker.is_open() {                                │   │
│  │        return Err(CircuitOpen)                                   │   │
│  │    }                                                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                           │                                             │
│                           ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 2. ACQUIRE RATE LIMIT PERMIT                                     │   │
│  │    if let Some(limiter) = rate_limiter {                         │   │
│  │        limiter.acquire().await?                                  │   │
│  │    }                                                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                           │                                             │
│                           ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 3. EXECUTE WITH RETRY                                            │   │
│  │    retry_executor.execute(|| async {                             │   │
│  │        // Re-check circuit breaker                               │   │
│  │        // Execute operation                                      │   │
│  │        // Record success/failure to circuit breaker              │   │
│  │    }).await                                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                           │                                             │
│                           ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 4. RECORD RESULT IN SPAN                                         │   │
│  │    span.record("status", result.is_ok())                         │   │
│  │    span.record("error", result.err())                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘

Circuit Breaker State Machine:
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│       ┌──────────┐    failures >= threshold    ┌──────────┐            │
│       │  CLOSED  │ ──────────────────────────► │   OPEN   │            │
│       │(Normal)  │                              │(Failing) │            │
│       └────┬─────┘                              └────┬─────┘            │
│            │                                         │                  │
│            │ success                    reset_timeout elapsed           │
│            │                                         │                  │
│            │         ┌───────────────┐               │                  │
│            │         │  HALF_OPEN    │◄──────────────┘                  │
│            │         │  (Testing)    │                                  │
│            │         └───────┬───────┘                                  │
│            │                 │                                          │
│            │     ┌───────────┴───────────┐                              │
│            │     │                       │                              │
│            │  success >= threshold    any failure                       │
│            │     │                       │                              │
│            ▼     ▼                       ▼                              │
│       ┌──────────┐                  ┌──────────┐                        │
│       │  CLOSED  │                  │   OPEN   │                        │
│       └──────────┘                  └──────────┘                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Service Layer Design

### 4.1 Objects Service Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     ObjectsService Architecture                          │
└─────────────────────────────────────────────────────────────────────────┘

<<interface>>
┌─────────────────────────────────────────────────────────────────────────┐
│                          ObjectsService                                  │
├─────────────────────────────────────────────────────────────────────────┤
│ + put(request: PutObjectRequest) -> Result<PutObjectOutput>             │
│ + put_stream(request, body: Stream) -> Result<PutObjectOutput>          │
│ + get(request: GetObjectRequest) -> Result<GetObjectOutput>             │
│ + get_stream(request: GetObjectRequest) -> Result<GetObjectStreamOutput>│
│ + delete(request: DeleteObjectRequest) -> Result<DeleteObjectOutput>    │
│ + delete_objects(request) -> Result<DeleteObjectsOutput>                │
│ + head(request: HeadObjectRequest) -> Result<HeadObjectOutput>          │
│ + copy(request: CopyObjectRequest) -> Result<CopyObjectOutput>          │
│ + list(request: ListObjectsV2Request) -> Result<ListObjectsV2Output>    │
│ + list_all(request) -> Stream<Item = Result<S3Object>>                  │
└─────────────────────────────────────────────────────────────────────────┘

Implementation Structure:
┌─────────────────────────────────────────────────────────────────────────┐
│                       ObjectsServiceImpl                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ Dependencies:                                                            │
│  - config: S3Config                                                      │
│  - transport: Arc<dyn HttpTransport>                                     │
│  - signer: Arc<dyn AwsSigner>                                            │
│  - executor: ResilientExecutor                                           │
│  - logger: Arc<dyn Logger>                                               │
│  - tracer: Arc<dyn Tracer>                                               │
│  - endpoint_resolver: EndpointResolver                                   │
├─────────────────────────────────────────────────────────────────────────┤
│ Private Methods:                                                         │
│  - build_put_request(request) -> (HttpRequest, String)                   │
│  - build_get_request(request) -> HttpRequest                             │
│  - build_delete_request(request) -> HttpRequest                          │
│  - build_list_request(request) -> HttpRequest                            │
│  - parse_list_response(body) -> ListObjectsV2Output                      │
│  - put_large_object(request, span) -> Result<PutObjectOutput>            │
│  - multipart_upload_stream(request, body, span) -> Result<>              │
└─────────────────────────────────────────────────────────────────────────┘

Request/Response Flow:
┌─────────────────────────────────────────────────────────────────────────┐
│                      PutObject Flow                                      │
│                                                                         │
│  Client                ObjectsService              Transport            │
│    │                        │                          │                │
│    │──put(request)─────────►│                          │                │
│    │                        │                          │                │
│    │                        │──validate request        │                │
│    │                        │                          │                │
│    │                        │──check multipart needed  │                │
│    │                        │  (size > threshold?)     │                │
│    │                        │                          │                │
│    │                   ┌────┴────┐                     │                │
│    │               No  │         │  Yes                │                │
│    │                   ▼         ▼                     │                │
│    │              Single      Multipart                │                │
│    │               PUT        Upload                   │                │
│    │                   │         │                     │                │
│    │                   ▼         ▼                     │                │
│    │                        │──build HTTP request      │                │
│    │                        │                          │                │
│    │                        │──sign request            │                │
│    │                        │                          │                │
│    │                        │──send()──────────────────►                │
│    │                        │                          │                │
│    │                        │◄─────────response────────│                │
│    │                        │                          │                │
│    │                        │──parse response          │                │
│    │                        │                          │                │
│    │◄──Result<Output>───────│                          │                │
│    │                        │                          │                │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Multipart Service Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MultipartService Architecture                         │
└─────────────────────────────────────────────────────────────────────────┘

<<interface>>
┌─────────────────────────────────────────────────────────────────────────┐
│                         MultipartService                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ + create(request) -> Result<CreateMultipartUploadOutput>                │
│ + upload_part(request) -> Result<UploadPartOutput>                      │
│ + upload_part_stream(request, body) -> Result<UploadPartOutput>         │
│ + complete(request) -> Result<CompleteMultipartUploadOutput>            │
│ + abort(request) -> Result<()>                                          │
│ + list_parts(request) -> Result<ListPartsOutput>                        │
│ + upload(request, body: Stream) -> Result<UploadOutput>   // High-level │
└─────────────────────────────────────────────────────────────────────────┘

Multipart Upload Flow:
┌─────────────────────────────────────────────────────────────────────────┐
│                   High-Level Upload Flow                                 │
│                                                                         │
│    ┌─────────────┐                                                      │
│    │   Client    │                                                      │
│    │  (stream)   │                                                      │
│    └──────┬──────┘                                                      │
│           │                                                             │
│           ▼                                                             │
│    ┌─────────────────────────────────────────────────────────────────┐ │
│    │                    MultipartService.upload()                     │ │
│    │                                                                   │ │
│    │  1. Create Multipart Upload                                       │ │
│    │     POST /{bucket}/{key}?uploads                                  │ │
│    │     → upload_id                                                   │ │
│    │                                                                   │ │
│    │  2. Upload Parts Concurrently                                     │ │
│    │     ┌─────────────────────────────────────────────────────────┐  │ │
│    │     │  ChunkedPartStream (splits body into part_size chunks)   │  │ │
│    │     │                                                           │  │ │
│    │     │  Semaphore (limits concurrent uploads)                    │  │ │
│    │     │                                                           │  │ │
│    │     │  For each part:                                           │  │ │
│    │     │    - Acquire semaphore permit                             │  │ │
│    │     │    - PUT /{bucket}/{key}?partNumber=N&uploadId=X          │  │ │
│    │     │    - Collect ETag                                         │  │ │
│    │     │    - Release permit                                       │  │ │
│    │     └─────────────────────────────────────────────────────────┘  │ │
│    │                                                                   │ │
│    │  3. Complete or Abort                                             │ │
│    │     ┌───────────────┐     ┌───────────────┐                      │ │
│    │     │   Success     │     │   Failure     │                      │ │
│    │     │ Complete MPU  │     │  Abort MPU    │                      │ │
│    │     │ POST ...?     │     │ DELETE ...?   │                      │ │
│    │     │ uploadId=X    │     │ uploadId=X    │                      │ │
│    │     └───────────────┘     └───────────────┘                      │ │
│    └─────────────────────────────────────────────────────────────────┘ │
│           │                                                             │
│           ▼                                                             │
│    ┌─────────────┐                                                      │
│    │ UploadOutput│                                                      │
│    │  - e_tag    │                                                      │
│    │  - location │                                                      │
│    └─────────────┘                                                      │
└─────────────────────────────────────────────────────────────────────────┘

Part Size Strategy:
┌─────────────────────────────────────────────────────────────────────────┐
│                     Part Size Calculation                                │
│                                                                         │
│  Given:                                                                 │
│    - content_length: Total size of object                               │
│    - configured_part_size: Default part size (e.g., 10MB)               │
│    - MIN_PART_SIZE: 5MB (AWS minimum)                                   │
│    - MAX_PART_SIZE: 5GB (AWS maximum)                                   │
│    - MAX_PARTS: 10,000 (AWS maximum)                                    │
│                                                                         │
│  Calculate:                                                             │
│    num_parts = ceil(content_length / configured_part_size)              │
│                                                                         │
│    if num_parts > MAX_PARTS:                                            │
│        // Adjust part size to fit                                       │
│        part_size = ceil(content_length / MAX_PARTS)                     │
│        part_size = max(part_size, MIN_PART_SIZE)                        │
│    else:                                                                │
│        part_size = configured_part_size                                 │
│                                                                         │
│  Result: part_size between 5MB and 5GB, total parts <= 10,000           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Presign Service Design

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     PresignService Architecture                          │
└─────────────────────────────────────────────────────────────────────────┘

<<interface>>
┌─────────────────────────────────────────────────────────────────────────┐
│                          PresignService                                  │
├─────────────────────────────────────────────────────────────────────────┤
│ + presign_get(request: PresignGetRequest) -> Result<PresignedUrl>       │
│ + presign_put(request: PresignPutRequest) -> Result<PresignedUrl>       │
│ + presign_delete(request: PresignDeleteRequest) -> Result<PresignedUrl> │
└─────────────────────────────────────────────────────────────────────────┘

Presigned URL Generation:
┌─────────────────────────────────────────────────────────────────────────┐
│                    Presigned URL Structure                               │
│                                                                         │
│  https://bucket.s3.region.amazonaws.com/key                             │
│    ?X-Amz-Algorithm=AWS4-HMAC-SHA256                                    │
│    &X-Amz-Credential=AKID/20231209/us-east-1/s3/aws4_request            │
│    &X-Amz-Date=20231209T120000Z                                         │
│    &X-Amz-Expires=3600                                                  │
│    &X-Amz-SignedHeaders=host                                            │
│    &X-Amz-Signature=abcdef1234567890...                                 │
│                                                                         │
│  For PUT with headers:                                                  │
│    &X-Amz-SignedHeaders=content-type;host;x-amz-storage-class           │
│                                                                         │
│  Note: Headers in SignedHeaders must be provided when using the URL     │
└─────────────────────────────────────────────────────────────────────────┘

Output Structure:
┌─────────────────────────────────────────────────────────────────────────┐
│  PresignedUrl {                                                         │
│      url: String,              // The presigned URL                     │
│      expires_at: DateTime,     // Expiration timestamp                  │
│      signed_headers: HashMap,  // Headers that MUST be sent with request│
│  }                                                                      │
│                                                                         │
│  Usage for PUT:                                                         │
│    let presigned = client.presign().presign_put(request)?;              │
│    http_client.put(&presigned.url)                                      │
│        .headers(presigned.signed_headers)  // REQUIRED                  │
│        .body(file_content)                                              │
│        .send();                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Data Flow Architecture

### 5.1 Request Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Request Data Flow                                 │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────┐  ┌───────────┐  ┌───────────┐  ┌──────────┐  ┌────────────┐
│  Client  │  │  Service  │  │  Request  │  │  Signer  │  │ Transport  │
│   App    │  │   Layer   │  │  Builder  │  │          │  │            │
└────┬─────┘  └─────┬─────┘  └─────┬─────┘  └────┬─────┘  └──────┬─────┘
     │              │              │              │               │
     │ PutObject    │              │              │               │
     │ Request      │              │              │               │
     │─────────────►│              │              │               │
     │              │              │              │               │
     │              │ Validate     │              │               │
     │              │─────────────►│              │               │
     │              │              │              │               │
     │              │ Build HTTP   │              │               │
     │              │ Request      │              │               │
     │              │─────────────►│              │               │
     │              │              │              │               │
     │              │              │ HttpRequest  │               │
     │              │              │─────────────►│               │
     │              │              │              │               │
     │              │              │              │ Sign          │
     │              │              │              │ Request       │
     │              │              │              │──────┐        │
     │              │              │              │      │        │
     │              │              │              │◄─────┘        │
     │              │              │              │               │
     │              │              │              │ Signed        │
     │              │              │              │ Request       │
     │              │              │              │──────────────►│
     │              │              │              │               │
     │              │              │              │               │ HTTP
     │              │              │              │               │ POST
     │              │              │              │               │────►
     │              │              │              │               │
     │              │              │              │               │◄────
     │              │              │              │               │ HTTP
     │              │              │              │               │ Response
     │              │              │              │               │
     │              │              │ HttpResponse │               │
     │              │              │◄─────────────────────────────│
     │              │              │              │               │
     │              │ Parse        │              │               │
     │              │ Response     │              │               │
     │              │◄─────────────│              │               │
     │              │              │              │               │
     │ PutObject    │              │              │               │
     │ Output       │              │              │               │
     │◄─────────────│              │              │               │
     │              │              │              │               │
```

### 5.2 Streaming Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Streaming Download Flow                             │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────┐  ┌───────────┐  ┌───────────┐  ┌─────────────────────────────┐
│  Client  │  │  Objects  │  │ Transport │  │        AWS S3              │
│   App    │  │  Service  │  │           │  │                             │
└────┬─────┘  └─────┬─────┘  └─────┬─────┘  └──────────────┬──────────────┘
     │              │              │                        │
     │ get_stream() │              │                        │
     │─────────────►│              │                        │
     │              │              │                        │
     │              │ send_        │                        │
     │              │ streaming()  │                        │
     │              │─────────────►│                        │
     │              │              │                        │
     │              │              │──GET /{bucket}/{key}──►│
     │              │              │                        │
     │              │              │◄──HTTP 200 + Headers───│
     │              │              │                        │
     │              │ Streaming    │                        │
     │              │ Response     │                        │
     │◄─────────────│◄─────────────│                        │
     │              │              │                        │
     │ body.next()  │              │                        │
     │─────────────►│              │                        │
     │              │              │◄───────Chunk 1─────────│
     │◄──Bytes──────│◄─────────────│                        │
     │              │              │                        │
     │ body.next()  │              │                        │
     │─────────────►│              │                        │
     │              │              │◄───────Chunk 2─────────│
     │◄──Bytes──────│◄─────────────│                        │
     │              │              │                        │
     │     ...      │              │         ...            │
     │              │              │                        │
     │ body.next()  │              │                        │
     │─────────────►│              │                        │
     │              │              │◄───────Chunk N─────────│
     │◄──Bytes──────│◄─────────────│                        │
     │              │              │                        │
     │ body.next()  │              │                        │
     │─────────────►│              │                        │
     │◄──None───────│──connection closed──                  │
     │              │              │                        │

Memory Characteristics:
- Only one chunk buffered at a time
- Chunk size configurable (default: 8KB from transport)
- Backpressure through async stream (consumer controls pace)
- No full object in memory
```

### 5.3 Error Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Error Flow                                      │
└─────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────────────┐
│  HTTP Response                                                         │
│  Status: 404                                                           │
│  Body: <?xml version="1.0"?>                                           │
│        <Error>                                                         │
│          <Code>NoSuchKey</Code>                                        │
│          <Message>The specified key does not exist.</Message>          │
│          <Key>missing-file.txt</Key>                                   │
│          <RequestId>ABC123</RequestId>                                 │
│        </Error>                                                        │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────────┐
│  Response Parser                                                       │
│                                                                        │
│  1. Check status code (404)                                            │
│  2. Parse XML error body                                               │
│  3. Extract: code, message, key, request_id                            │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────────┐
│  Error Mapper                                                          │
│                                                                        │
│  map_s3_error_code("NoSuchKey", ...) =>                                │
│    S3Error::Object(ObjectError::ObjectNotFound {                       │
│        bucket: "my-bucket",                                            │
│        key: "missing-file.txt",                                        │
│        request_id: Some("ABC123"),                                     │
│    })                                                                  │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────────┐
│  Resilience Layer                                                      │
│                                                                        │
│  error.is_retryable()? => false (404 is not retryable)                 │
│  circuit_breaker.record_failure()? => No (client error, not server)    │
│                                                                        │
│  Return error to caller immediately                                    │
└───────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────────────────┐
│  Client Application                                                    │
│                                                                        │
│  match result {                                                        │
│      Err(S3Error::Object(ObjectError::ObjectNotFound { key, .. })) => {│
│          // Handle missing object                                      │
│      }                                                                 │
│      ...                                                               │
│  }                                                                     │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 6. Dependency Injection & Testability

### 6.1 Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Dependency Injection Graph                         │
└─────────────────────────────────────────────────────────────────────────┘

                    ┌───────────────────────┐
                    │     S3ClientImpl      │
                    └───────────┬───────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Arc<dyn        │  │ Arc<dyn        │  │ Arc<dyn        │
│ HttpTransport> │  │ AwsSigner>     │  │ Credentials    │
│                │  │                │  │ Provider>      │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         │              depends on                 │
         │                    │                    │
         │                    └────────────────────┘
         │
         ▼
┌─────────────────┐
│  reqwest::      │
│  Client         │
│  (external)     │
└─────────────────┘

All dependencies are:
 - Injected via constructor/builder
 - Behind trait interfaces (dyn Trait)
 - Wrapped in Arc for shared ownership
 - Replaceable with mocks for testing
```

### 6.2 Testing Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Testing Architecture                              │
└─────────────────────────────────────────────────────────────────────────┘

Unit Tests (Mock-Based):
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│  │  MockTransport  │     │   MockSigner    │     │MockCredentials  │   │
│  │                 │     │                 │     │    Provider     │   │
│  │ - responses     │     │ - sign_called   │     │                 │   │
│  │ - requests      │     │ - signature     │     │ - credentials   │   │
│  │                 │     │                 │     │                 │   │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘   │
│           │                       │                       │             │
│           └───────────────────────┼───────────────────────┘             │
│                                   │                                     │
│                                   ▼                                     │
│                        ┌─────────────────────┐                         │
│                        │ ServiceUnderTest    │                         │
│                        │ (with mock deps)    │                         │
│                        └─────────────────────┘                         │
│                                                                         │
│  Tests verify:                                                          │
│   - Correct requests built                                              │
│   - Correct headers set                                                 │
│   - Correct responses parsed                                            │
│   - Correct errors returned                                             │
│   - Retry behavior                                                      │
│   - Circuit breaker behavior                                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Integration Tests (LocalStack/MinIO):
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌─────────────────┐         ┌─────────────────────────────────┐       │
│  │  Test Suite     │         │  LocalStack / MinIO             │       │
│  │                 │         │  (S3-compatible service)        │       │
│  │  - Real client  │◄───────►│                                 │       │
│  │  - Real signing │         │  - Real S3 API                  │       │
│  │  - Real HTTP    │         │  - Real responses               │       │
│  │                 │         │                                 │       │
│  └─────────────────┘         └─────────────────────────────────┘       │
│                                                                         │
│  Tests verify:                                                          │
│   - End-to-end operations                                               │
│   - XML parsing                                                         │
│   - Signature generation                                                │
│   - Multipart upload                                                    │
│   - Streaming                                                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Live Tests (Real AWS - Optional):
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  #[test]                                                                │
│  #[ignore]  // Only run manually with AWS credentials                   │
│  async fn test_real_aws_s3() {                                          │
│      if std::env::var("AWS_ACCESS_KEY_ID").is_err() {                   │
│          return; // Skip if no credentials                              │
│      }                                                                  │
│                                                                         │
│      let client = S3Client::from_env()?;                                │
│      // Test against real AWS S3                                        │
│  }                                                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.3 Mock Implementation Pattern

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Mock Implementation Pattern                         │
└─────────────────────────────────────────────────────────────────────────┘

MockHttpTransport:
┌─────────────────────────────────────────────────────────────────────────┐
│  pub struct MockHttpTransport {                                         │
│      // Queue of responses to return                                    │
│      responses: Arc<Mutex<VecDeque<Result<HttpResponse, TransportError>>>>,│
│      // Captured requests for verification                              │
│      requests: Arc<Mutex<Vec<HttpRequest>>>,                            │
│  }                                                                      │
│                                                                         │
│  impl MockHttpTransport {                                               │
│      pub fn new() -> Self { ... }                                       │
│                                                                         │
│      // Builder methods                                                 │
│      pub fn with_response(self, response: HttpResponse) -> Self { ... } │
│      pub fn with_error(self, error: TransportError) -> Self { ... }     │
│      pub fn with_responses(self, responses: Vec<...>) -> Self { ... }   │
│                                                                         │
│      // Verification methods                                            │
│      pub fn get_requests(&self) -> Vec<HttpRequest> { ... }             │
│      pub fn get_last_request(&self) -> Option<HttpRequest> { ... }      │
│      pub fn assert_request_count(&self, expected: usize) { ... }        │
│      pub fn assert_header(&self, idx: usize, key: &str, val: &str) { }  │
│  }                                                                      │
│                                                                         │
│  impl HttpTransport for MockHttpTransport {                             │
│      async fn send(&self, request: HttpRequest) -> Result<...> {        │
│          self.requests.lock().unwrap().push(request);                   │
│          self.responses.lock().unwrap().pop_front()                     │
│              .unwrap_or(Err(TransportError::NoMockResponse))             │
│      }                                                                  │
│  }                                                                      │
└─────────────────────────────────────────────────────────────────────────┘

Test Example:
┌─────────────────────────────────────────────────────────────────────────┐
│  #[tokio::test]                                                         │
│  async fn test_get_object_returns_content() {                           │
│      // Arrange                                                         │
│      let mock_transport = MockHttpTransport::new()                      │
│          .with_response(HttpResponse {                                  │
│              status: StatusCode::OK,                                    │
│              headers: headers! {                                        │
│                  "etag" => "\"abc123\"",                                │
│                  "content-length" => "1024",                            │
│              },                                                         │
│              body: Bytes::from("file content"),                         │
│          });                                                            │
│                                                                         │
│      let service = create_test_objects_service(mock_transport);         │
│                                                                         │
│      // Act                                                             │
│      let result = service.get(GetObjectRequest {                        │
│          bucket: "test-bucket".into(),                                  │
│          key: "test-key".into(),                                        │
│          ..Default::default()                                           │
│      }).await;                                                          │
│                                                                         │
│      // Assert                                                          │
│      assert!(result.is_ok());                                           │
│      let output = result.unwrap();                                      │
│      assert_eq!(output.body, b"file content");                          │
│      assert_eq!(output.e_tag, "abc123");                                │
│  }                                                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial architecture - Part 1 |

---

**End of Architecture Part 1**

*Part 2 will cover Security Architecture, Observability Architecture, Deployment & Configuration, and Performance Considerations.*
