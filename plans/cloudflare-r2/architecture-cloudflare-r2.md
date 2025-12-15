# Cloudflare R2 Storage Integration - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-14
**Module:** `integrations/cloudflare_r2`

---

## 1. Overview

This document defines the architectural design for the Cloudflare R2 Storage Integration, a thin adapter layer enabling the LLM Dev Ops platform to interact with R2 as an S3-compatible object storage service for artifacts, datasets, logs, and simulation inputs/outputs.

### 1.1 Design Philosophy

1. **Thin Adapter Pattern**: Minimal translation layer; delegate to shared primitives
2. **S3-Compatible Surface**: Full S3 API compatibility where R2 supports it
3. **Streaming-First**: Memory-efficient handling of large objects
4. **Regionless Simplicity**: Leverage R2's automatic global distribution
5. **Testability**: Simulation record/replay for deterministic testing

### 1.2 Key R2 Differentiators

| Aspect | R2 Approach | Implementation Impact |
|--------|-------------|----------------------|
| Region | Automatic ("auto") | No region configuration needed |
| URL Style | Path-style only | Simpler URL construction |
| Egress | Zero cost | No optimization for read locality |
| Feature Set | S3 subset | Smaller API surface to implement |

---

## 2. C4 Model Diagrams

### 2.1 Level 1: System Context

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           External Systems                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────┐                                                 │
│  │   Cloudflare R2    │                                                 │
│  │   Object Storage   │◀────────────────────┐                           │
│  │                    │   S3-Compatible     │                           │
│  │   - Buckets        │   HTTPS API         │                           │
│  │   - Objects        │                     │                           │
│  └────────────────────┘                     │                           │
│                                             │                           │
│  ┌──────────────────────────────────────────┼───────────────────────┐   │
│  │             LLM DevOps Platform          │                       │   │
│  │                                          │                       │   │
│  │  ┌──────────────┐    ┌──────────────────────────────────────┐   │   │
│  │  │ LLM Engine   │───▶│                                      │   │   │
│  │  └──────────────┘    │    Cloudflare R2 Storage             │───┘   │
│  │                      │    Integration Module                 │       │
│  │  ┌──────────────┐    │                                      │       │
│  │  │Agent Runtime │───▶│    - Object operations               │       │
│  │  └──────────────┘    │    - Multipart uploads               │       │
│  │                      │    - Presigned URLs                   │       │
│  │  ┌──────────────┐    │    - Streaming                       │       │
│  │  │ Orchestrator │───▶│                                      │       │
│  │  └──────────────┘    └──────────────────────────────────────┘       │
│  │                                                                      │
│  └──────────────────────────────────────────────────────────────────────┘
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Level 2: Container Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LLM DevOps Platform                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │   LLM Engine    │  │  Agent Runtime  │  │     Orchestrator        │  │
│  │                 │  │                 │  │                         │  │
│  │  - Model I/O    │  │  - Executions   │  │  - Workflow state       │  │
│  │  - Checkpoints  │  │  - Tool results │  │  - Artifacts            │  │
│  └────────┬────────┘  └────────┬────────┘  └───────────┬─────────────┘  │
│           │                    │                       │                 │
│           │      store/retrieve objects                │                 │
│           ▼                    ▼                       ▼                 │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                  Cloudflare R2 Integration                         │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐ │  │
│  │  │  R2 Client  │  │  Multipart  │  │  Presign    │  │ Simulation│ │  │
│  │  │  Service    │  │  Manager    │  │  Service    │  │ Support   │ │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘ │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│           │                                                              │
│           │ uses                                                         │
│           ▼                                                              │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     Shared Infrastructure                          │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │  │
│  │  │   Auth   │  │  Logging │  │  Metrics │  │  Tracing │           │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │  │
│  │  ┌──────────┐  ┌──────────────────┐  ┌─────────────────────┐      │  │
│  │  │  Retry   │  │  Circuit Breaker │  │  Config Manager     │      │  │
│  │  └──────────┘  └──────────────────┘  └─────────────────────┘      │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
            │
            │ HTTPS (S3 API)
            ▼
┌───────────────────────────────────────┐
│         Cloudflare R2                  │
│                                        │
│   https://<account>.r2.cloudflare...   │
└───────────────────────────────────────┘
```

### 2.3 Level 3: Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Cloudflare R2 Integration Module                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                         Public API Layer                           │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────────┐  │  │
│  │  │   R2Client      │  │ R2ClientBuilder │  │    R2Config       │  │  │
│  │  │   (Facade)      │  │                 │  │                   │  │  │
│  │  │                 │  │  - from_env()   │  │  - account_id     │  │  │
│  │  │  - objects()    │  │  - credentials()│  │  - credentials    │  │  │
│  │  │  - multipart()  │  │  - endpoint()   │  │  - timeout        │  │  │
│  │  │  - presign()    │  │  - build()      │  │  - multipart cfg  │  │  │
│  │  └────────┬────────┘  └─────────────────┘  └───────────────────┘  │  │
│  └───────────┼───────────────────────────────────────────────────────┘  │
│              │                                                           │
│              ▼                                                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                       Service Layer                                │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                  R2ObjectsService                            │  │  │
│  │  │                                                              │  │  │
│  │  │  put()  get()  delete()  head()  copy()  list()  list_all() │  │  │
│  │  │  put_stream()  get_stream()  delete_objects()               │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  │                                                                    │  │
│  │  ┌──────────────────────┐  ┌─────────────────────────────────┐   │  │
│  │  │  R2MultipartService  │  │      R2PresignService           │   │  │
│  │  │                      │  │                                 │   │  │
│  │  │  create()            │  │  presign_get()                  │   │  │
│  │  │  upload_part()       │  │  presign_put()                  │   │  │
│  │  │  complete()          │  │                                 │   │  │
│  │  │  abort()             │  │  (client-side only,             │   │  │
│  │  │  list_parts()        │  │   no network call)              │   │  │
│  │  └──────────────────────┘  └─────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│              │                                                           │
│              ▼                                                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      Core Infrastructure                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │  │
│  │  │  R2Signer   │  │ HttpTransport│  │   ResilienceLayer      │   │  │
│  │  │             │  │             │  │                         │   │  │
│  │  │  - sign()   │  │  - send()   │  │  - RetryExecutor       │   │  │
│  │  │  - presign()│  │  - stream() │  │  - CircuitBreaker      │   │  │
│  │  │             │  │             │  │  - RateLimiter         │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│              │                                                           │
│              ▼                                                           │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                       Support Components                           │  │
│  │  ┌─────────────────┐  ┌───────────────┐  ┌─────────────────────┐  │  │
│  │  │   XML Parser    │  │  URL Builder  │  │  Simulation Layer   │  │  │
│  │  │                 │  │               │  │                     │  │  │
│  │  │  - ListObjects  │  │  - path_style │  │  - R2Recorder      │  │  │
│  │  │  - Error resp   │  │  - query enc  │  │  - R2Replayer      │  │  │
│  │  │  - Multipart    │  │  - signing    │  │  - ReplayTransport │  │  │
│  │  └─────────────────┘  └───────────────┘  └─────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow

### 3.1 Object Upload Flow

```
┌──────────────┐
│  Application │
│              │
│  put_object( │
│    bucket,   │
│    key,      │
│    data      │
│  )           │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                        R2ObjectsService                           │
│                                                                   │
│  1. Validate bucket name and key                                 │
│  2. Check size: if > threshold → multipart                       │
│  3. Calculate SHA256 hash of payload                             │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                          R2Signer                                 │
│                                                                   │
│  1. Build canonical request (method, path, headers, hash)        │
│  2. Create string-to-sign with credential scope                  │
│  3. Derive signing key: HMAC(secret, date/auto/s3/aws4_request)  │
│  4. Generate signature and Authorization header                  │
│                                                                   │
│  Region: "auto" (R2 specific)                                    │
│  Service: "s3"                                                   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                       ResilienceLayer                             │
│                                                                   │
│  1. Check circuit breaker state                                  │
│  2. Acquire rate limiter permit                                  │
│  3. Execute with retry on transient failures                     │
│  4. Update circuit breaker based on result                       │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                        HttpTransport                              │
│                                                                   │
│  PUT https://<account>.r2.cloudflarestorage.com/<bucket>/<key>   │
│                                                                   │
│  Headers:                                                        │
│    Authorization: AWS4-HMAC-SHA256 Credential=...                │
│    x-amz-date: 20251214T120000Z                                  │
│    x-amz-content-sha256: <hash>                                  │
│    Content-Type: application/octet-stream                        │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Cloudflare R2                               │
│                                                                   │
│  Response: 200 OK                                                │
│  Headers:                                                        │
│    ETag: "d41d8cd98f00b204e9800998ecf8427e"                     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Observability                                  │
│                                                                   │
│  - Emit: r2_requests_total{operation=PutObject,status=success}   │
│  - Emit: r2_bytes_transferred_total{direction=upload}            │
│  - Complete trace span with attributes                           │
│  - Log: INFO "Object uploaded" bucket=X key=Y size=Z             │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────┐
│   Return     │
│              │
│  PutObject   │
│  Output {    │
│    e_tag,    │
│    version_id│
│  }           │
└──────────────┘
```

### 3.2 Multipart Upload Flow

```
┌──────────────┐
│  Application │
│              │
│  upload_     │
│  object(     │
│    large_    │
│    stream    │
│  )           │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Size Check & Decision                            │
│                                                                   │
│  IF size > multipart_threshold (default 100MB)                   │
│     OR size unknown (streaming)                                  │
│  THEN use multipart upload                                       │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│              Step 1: Create Multipart Upload                      │
│                                                                   │
│  POST /{bucket}/{key}?uploads                                    │
│                                                                   │
│  Response: <UploadId>abc123</UploadId>                          │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│              Step 2: Upload Parts (Concurrent)                    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Semaphore: limit to N concurrent uploads (default: 4)      │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │  Part 1    │  │  Part 2    │  │  Part 3    │  │  Part N    │ │
│  │  10MB      │  │  10MB      │  │  10MB      │  │  ...       │ │
│  │            │  │            │  │            │  │            │ │
│  │  PUT ?part │  │  PUT ?part │  │  PUT ?part │  │  PUT ?part │ │
│  │  Number=1  │  │  Number=2  │  │  Number=3  │  │  Number=N  │ │
│  │  &uploadId │  │  &uploadId │  │  &uploadId │  │  &uploadId │ │
│  │            │  │            │  │            │  │            │ │
│  │  → ETag1   │  │  → ETag2   │  │  → ETag3   │  │  → ETagN   │ │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘ │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       │ Success: All parts uploaded
       ▼
┌──────────────────────────────────────────────────────────────────┐
│              Step 3: Complete Multipart Upload                    │
│                                                                   │
│  POST /{bucket}/{key}?uploadId=abc123                            │
│                                                                   │
│  Body:                                                           │
│  <CompleteMultipartUpload>                                       │
│    <Part><PartNumber>1</PartNumber><ETag>ETag1</ETag></Part>    │
│    <Part><PartNumber>2</PartNumber><ETag>ETag2</ETag></Part>    │
│    ...                                                           │
│  </CompleteMultipartUpload>                                      │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       │ Failure: Any part fails
       ▼
┌──────────────────────────────────────────────────────────────────┐
│              Error Path: Abort Multipart Upload                   │
│                                                                   │
│  DELETE /{bucket}/{key}?uploadId=abc123                          │
│                                                                   │
│  - Cleans up uploaded parts                                      │
│  - Prevents orphaned storage                                     │
│  - Always attempted, errors logged but not propagated            │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 3.3 Streaming Download Flow

```
┌──────────────┐
│  Application │
│              │
│  get_stream( │
│    bucket,   │
│    key       │
│  )           │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                        R2ObjectsService                           │
│                                                                   │
│  1. Build signed request                                         │
│  2. Return immediately with stream handle                        │
│  3. Data pulled lazily as stream is consumed                     │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Streaming Response                            │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │            GetObjectStreamOutput                          │   │
│  │                                                           │   │
│  │  body: AsyncStream<Bytes>  ──────────────────────────┐   │   │
│  │  content_length: 1_000_000_000                       │   │   │
│  │  content_type: "application/octet-stream"            │   │   │
│  │  e_tag: "abc123"                                     │   │   │
│  │                                                      │   │   │
│  └──────────────────────────────────────────────────────│───┘   │
│                                                         │        │
│                                                         ▼        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              MetricsTrackingStream                        │   │
│  │                                                           │   │
│  │  - Wraps underlying HTTP body stream                     │   │
│  │  - Counts bytes as they flow through                     │   │
│  │  - Emits metrics on stream completion                    │   │
│  │  - No buffering: constant memory regardless of size      │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
       │
       │ Chunked reads
       ▼
┌──────────────┐
│  Application │
│              │
│  while let   │
│    Some(     │
│    chunk) =  │
│    stream.   │
│    next()    │
│  {           │
│    process   │
│    (chunk)   │
│  }           │
└──────────────┘
```

### 3.4 Simulation Record/Replay Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Recording Mode                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐          │
│  │ Application │───────▶│  R2Client   │───────▶│ Real R2     │          │
│  └─────────────┘        │             │        │ Endpoint    │          │
│                         │  +Recorder  │        └──────┬──────┘          │
│                         └──────┬──────┘               │                  │
│                                │                      │                  │
│                                ▼                      ▼                  │
│                         ┌─────────────────────────────────────┐         │
│                         │         SimulationRecorder          │         │
│                         │                                     │         │
│                         │  record_request(op, bucket, key)    │         │
│                         │  record_response(op, bucket, key,   │         │
│                         │                  response, latency) │         │
│                         │                                     │         │
│                         │  Storage: HashMap<String,           │         │
│                         │           RecordedInteraction>      │         │
│                         └─────────────────────────────────────┘         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                          Replay Mode                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐        ┌─────────────────────────────────┐             │
│  │    Test     │───────▶│  R2Client + ReplayTransport     │             │
│  └─────────────┘        │                                 │             │
│                         │  ┌───────────────────────────┐  │             │
│                         │  │    SimulationReplayer     │  │             │
│                         │  │                           │  │             │
│                         │  │  replay_response(op,      │  │             │
│                         │  │    bucket, key)           │  │             │
│                         │  │    → cached response      │  │             │
│                         │  │    → optional latency     │  │             │
│                         │  │       simulation          │  │             │
│                         │  └───────────────────────────┘  │             │
│                         └─────────────────────────────────┘             │
│                                         │                                │
│                                         │ No network call!               │
│                                         ▼                                │
│                         ┌─────────────────────────────────┐             │
│                         │       Deterministic Test        │             │
│                         │                                 │             │
│                         │  - Same response every time     │             │
│                         │  - No R2 credentials needed     │             │
│                         │  - Fast (no network latency)    │             │
│                         │  - Reproducible                 │             │
│                         └─────────────────────────────────┘             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Module Structure

### 4.1 Rust Implementation

```
src/integrations/cloudflare_r2/
├── mod.rs                      # Module exports
├── lib.rs                      # Public API surface
│
├── client/
│   ├── mod.rs
│   ├── client.rs               # R2ClientImpl
│   ├── builder.rs              # R2ClientBuilder
│   └── config.rs               # R2Config, validation
│
├── objects/
│   ├── mod.rs
│   ├── service.rs              # R2ObjectsServiceImpl
│   ├── put.rs                  # PutObject, PutObjectStream
│   ├── get.rs                  # GetObject, GetObjectStream
│   ├── delete.rs               # DeleteObject, DeleteObjects
│   ├── head.rs                 # HeadObject
│   ├── copy.rs                 # CopyObject
│   └── list.rs                 # ListObjectsV2, pagination
│
├── multipart/
│   ├── mod.rs
│   ├── service.rs              # R2MultipartServiceImpl
│   ├── create.rs               # CreateMultipartUpload
│   ├── upload_part.rs          # UploadPart
│   ├── complete.rs             # CompleteMultipartUpload
│   ├── abort.rs                # AbortMultipartUpload
│   ├── list_parts.rs           # ListParts
│   └── orchestrator.rs         # High-level upload with auto-multipart
│
├── presign/
│   ├── mod.rs
│   └── service.rs              # R2PresignServiceImpl
│
├── signing/
│   ├── mod.rs
│   ├── signer.rs               # R2Signer (S3 Sig V4)
│   ├── canonical.rs            # Canonical request builder
│   └── key_derivation.rs       # Signing key derivation
│
├── transport/
│   ├── mod.rs
│   ├── http.rs                 # HttpTransport trait
│   ├── reqwest_transport.rs    # Reqwest-based implementation
│   └── streaming.rs            # Streaming request/response
│
├── resilience/
│   ├── mod.rs
│   └── executor.rs             # Retry + circuit breaker integration
│
├── xml/
│   ├── mod.rs
│   ├── parser.rs               # XML response parsing
│   ├── list_objects.rs         # ListBucketResult
│   ├── error.rs                # Error response parsing
│   ├── multipart.rs            # Multipart XML responses
│   └── builder.rs              # XML request body building
│
├── error/
│   ├── mod.rs
│   ├── error.rs                # R2Error enum
│   └── mapping.rs              # S3 code → R2Error mapping
│
├── simulation/
│   ├── mod.rs
│   ├── recorder.rs             # SimulationRecorder
│   ├── replayer.rs             # SimulationReplayer
│   └── replay_transport.rs     # ReplayTransport
│
├── types/
│   ├── mod.rs
│   ├── requests.rs             # Request structs
│   ├── responses.rs            # Response structs
│   └── common.rs               # Shared types (Object, etc.)
│
└── testing/
    ├── mod.rs
    ├── mock_client.rs          # MockR2Client
    ├── mock_services.rs        # Mock service implementations
    └── fixtures.rs             # Test data fixtures
```

### 4.2 TypeScript Implementation

```
src/integrations/cloudflare-r2/
├── index.ts                    # Public exports
│
├── client/
│   ├── index.ts
│   ├── client.ts               # R2Client class
│   ├── builder.ts              # R2ClientBuilder
│   └── config.ts               # R2Config interface
│
├── objects/
│   ├── index.ts
│   ├── service.ts              # R2ObjectsService implementation
│   ├── put.ts                  # putObject, putStream
│   ├── get.ts                  # getObject, getStream
│   ├── delete.ts               # deleteObject, deleteObjects
│   ├── head.ts                 # headObject
│   ├── copy.ts                 # copyObject
│   └── list.ts                 # listObjects, listAll
│
├── multipart/
│   ├── index.ts
│   ├── service.ts              # R2MultipartService
│   ├── operations.ts           # Create, upload, complete, abort
│   └── orchestrator.ts         # High-level upload
│
├── presign/
│   ├── index.ts
│   └── service.ts              # Presigned URL generation
│
├── signing/
│   ├── index.ts
│   ├── signer.ts               # S3 Signature V4
│   ├── canonical.ts            # Canonical request
│   └── crypto.ts               # HMAC-SHA256 utilities
│
├── transport/
│   ├── index.ts
│   ├── http-transport.ts       # Transport interface
│   ├── fetch-transport.ts      # Fetch-based transport
│   └── streaming.ts            # Stream utilities
│
├── resilience/
│   ├── index.ts
│   └── executor.ts             # Shared resilience integration
│
├── xml/
│   ├── index.ts
│   ├── parser.ts               # XML parsing utilities
│   ├── responses.ts            # Response type parsers
│   └── builders.ts             # Request body builders
│
├── errors/
│   ├── index.ts
│   ├── r2-error.ts             # R2Error class hierarchy
│   └── mapping.ts              # Error code mapping
│
├── simulation/
│   ├── index.ts
│   ├── recorder.ts             # Recording implementation
│   ├── replayer.ts             # Replay implementation
│   └── replay-transport.ts     # Transport wrapper
│
├── types/
│   ├── index.ts
│   ├── requests.ts             # Request interfaces
│   ├── responses.ts            # Response interfaces
│   └── common.ts               # Shared types
│
└── testing/
    ├── index.ts
    ├── mock-client.ts          # Mock implementation
    └── fixtures.ts             # Test fixtures
```

---

## 5. Integration Patterns

### 5.1 With Shared Authentication

```
┌────────────────────────────────────────────────────────────────┐
│                    Credential Flow                              │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐      ┌──────────────────────────────────┐ │
│  │  R2ClientBuilder│      │         shared-auth              │ │
│  │                 │      │                                  │ │
│  │  .credentials() │─────▶│  CredentialProvider              │ │
│  │                 │      │    .get("cloudflare-r2")         │ │
│  └─────────────────┘      │                                  │ │
│                           │  Returns:                        │ │
│                           │    - access_key_id               │ │
│                           │    - secret_access_key           │ │
│                           │    - optional: session_token     │ │
│                           │                                  │ │
│                           │  Features:                       │ │
│                           │    - Rotation support            │ │
│                           │    - Vault integration           │ │
│                           │    - Environment fallback        │ │
│                           └──────────────────────────────────┘ │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

```rust
// Integration example
impl R2ClientBuilder {
    pub fn with_shared_auth(mut self) -> Result<Self, R2Error> {
        let provider = shared_auth::get_provider("cloudflare-r2")?;
        let creds = provider.get_credentials()?;

        self.access_key_id = Some(creds.access_key_id);
        self.secret_access_key = Some(creds.secret_access_key);

        Ok(self)
    }
}
```

### 5.2 With Shared Tracing

```rust
// Tracing integration for all operations
impl R2ObjectsServiceImpl {
    async fn put(&self, req: PutObjectRequest) -> Result<PutObjectOutput, R2Error> {
        let span = shared_tracing::span!("r2.put_object", {
            "r2.account_id" = %self.config.account_id,
            "r2.bucket" = %req.bucket,
            "r2.key" = %req.key,
            "r2.content_length" = req.body.len(),
        });

        let _guard = span.enter();

        // ... operation logic ...

        span.set_attribute("r2.e_tag", &output.e_tag);
        span.set_status(Status::Ok);

        Ok(output)
    }
}
```

### 5.3 With Shared Metrics

```rust
// Metrics integration
struct R2MetricsCollector {
    requests_total: CounterVec,
    request_duration: HistogramVec,
    bytes_transferred: CounterVec,
    errors_total: CounterVec,
    multipart_parts: CounterVec,
}

impl R2MetricsCollector {
    fn new(registry: &MetricsRegistry) -> Self {
        Self {
            requests_total: registry.counter_vec(
                "r2_requests_total",
                "Total R2 API requests",
                &["operation", "bucket", "status"],
            ),
            request_duration: registry.histogram_vec(
                "r2_request_duration_seconds",
                "R2 request latency",
                &["operation", "bucket"],
                vec![0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 30.0],
            ),
            bytes_transferred: registry.counter_vec(
                "r2_bytes_transferred_total",
                "Bytes transferred to/from R2",
                &["operation", "bucket", "direction"],
            ),
            // ...
        }
    }
}
```

### 5.4 With Shared Configuration

```yaml
# config.yaml integration
cloudflare_r2:
  account_id: "${R2_ACCOUNT_ID}"
  credentials:
    source: "shared-auth"  # or "environment", "vault"
  timeout_seconds: 300
  multipart:
    threshold_bytes: 104857600  # 100MB
    part_size_bytes: 10485760   # 10MB
    concurrency: 4
  resilience:
    retry:
      max_attempts: 3
      initial_backoff_ms: 100
      max_backoff_ms: 30000
    circuit_breaker:
      failure_threshold: 5
      reset_timeout_seconds: 30
    rate_limit:
      requests_per_second: 100  # optional
  simulation:
    enabled: false
    recording_path: "./recordings/r2"
```

```rust
// Configuration integration
impl R2Config {
    pub fn from_shared_config() -> Result<Self, R2Error> {
        let config = shared_config::get::<R2ConfigSchema>("cloudflare_r2")?;

        Ok(Self {
            account_id: config.account_id,
            timeout: Duration::from_secs(config.timeout_seconds),
            multipart_threshold: config.multipart.threshold_bytes,
            multipart_part_size: config.multipart.part_size_bytes,
            multipart_concurrency: config.multipart.concurrency,
            // ...
        })
    }
}
```

### 5.5 With Shared Logging

```rust
// Logging integration
impl R2ObjectsServiceImpl {
    async fn delete(&self, req: DeleteObjectRequest) -> Result<(), R2Error> {
        self.logger.debug("Deleting object", json!({
            "bucket": req.bucket,
            "key": req.key,
        }));

        match self.execute_delete(&req).await {
            Ok(()) => {
                self.logger.info("Object deleted", json!({
                    "bucket": req.bucket,
                    "key": req.key,
                }));
                Ok(())
            }
            Err(e) if e.is_not_found() => {
                self.logger.warn("Object not found for deletion", json!({
                    "bucket": req.bucket,
                    "key": req.key,
                }));
                Err(e)
            }
            Err(e) => {
                self.logger.error("Failed to delete object", json!({
                    "bucket": req.bucket,
                    "key": req.key,
                    "error": e.to_string(),
                    "error_type": e.error_type(),
                }));
                Err(e)
            }
        }
    }
}
```

---

## 6. Deployment Patterns

### 6.1 Library Integration (Recommended)

```
┌─────────────────────────────────────────────────────────────────┐
│                      Application Process                         │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Application Code                        │   │
│  │                                                          │   │
│  │  let client = R2ClientBuilder::new()                    │   │
│  │      .with_shared_auth()?                               │   │
│  │      .from_shared_config()?                             │   │
│  │      .build()?;                                         │   │
│  │                                                          │   │
│  │  client.objects().put(PutObjectRequest { ... }).await?; │   │
│  │                                                          │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────┐   │
│  │             R2 Integration (embedded library)             │   │
│  │                                                          │   │
│  │  - Same process, minimal overhead                        │   │
│  │  - Shared connection pool                                │   │
│  │  - Direct memory access for streaming                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
           │
           │ HTTPS
           ▼
┌─────────────────────┐
│   Cloudflare R2     │
└─────────────────────┘
```

### 6.2 Sidecar Pattern (High Isolation)

```
┌─────────────────────────────────────────────────────────────────┐
│                             Pod                                  │
│                                                                  │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐  │
│  │   Main Application      │  │   R2 Sidecar                │  │
│  │                         │  │                             │  │
│  │  - Business logic       │  │  - R2 integration           │  │
│  │  - LLM processing       │  │  - Connection pooling       │  │
│  │                         │  │  - Credential management    │  │
│  │                         │  │                             │  │
│  │  gRPC/HTTP ────────────▶│  │  :8080 internal API        │  │
│  │  store(bucket,key,data) │  │                             │  │
│  │                         │  │                             │  │
│  └─────────────────────────┘  └──────────────┬──────────────┘  │
│                                              │                   │
└──────────────────────────────────────────────┼───────────────────┘
                                               │ HTTPS
                                               ▼
                                ┌─────────────────────┐
                                │   Cloudflare R2     │
                                └─────────────────────┘

Use cases:
- Language isolation (app in Python, sidecar in Rust)
- Security boundary for credentials
- Independent scaling/updates
```

### 6.3 Gateway Pattern (Shared Service)

```
┌───────────────────────────────────────────────────────────────────────┐
│                           Kubernetes Cluster                           │
│                                                                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                   │
│  │   App 1     │  │   App 2     │  │   App 3     │                   │
│  │             │  │             │  │             │                   │
│  │  LLM Engine │  │  Agent RT   │  │  Pipeline   │                   │
│  │             │  │             │  │             │                   │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                   │
│         │                │                │                           │
│         └────────────────┼────────────────┘                           │
│                          │                                             │
│                          ▼                                             │
│         ┌────────────────────────────────────┐                        │
│         │     R2 Gateway Service             │                        │
│         │     (Deployment, replicas: 3)      │                        │
│         │                                    │                        │
│         │  - Centralized credential mgmt     │                        │
│         │  - Shared connection pooling       │                        │
│         │  - Request aggregation             │                        │
│         │  - Caching layer (optional)        │                        │
│         │                                    │                        │
│         └────────────────┬───────────────────┘                        │
│                          │                                             │
└──────────────────────────┼─────────────────────────────────────────────┘
                           │ HTTPS
                           ▼
            ┌─────────────────────┐
            │   Cloudflare R2     │
            └─────────────────────┘
```

---

## 7. Testing Architecture

### 7.1 Test Pyramid

```
                     ┌─────────────────────┐
                     │   E2E Tests         │  Real R2 (staging account)
                     │   (few, optional)   │  Full integration validation
                     └──────────┬──────────┘
                                │
                     ┌──────────▼──────────┐
                     │  Integration Tests  │  Simulation replay
                     │  (moderate)         │  Full request/response cycle
                     │                     │  XML parsing validation
                     └──────────┬──────────┘
                                │
         ┌──────────────────────▼──────────────────────┐
         │              Unit Tests (many)              │
         │                                             │
         │  - S3 Signature V4 signing                 │
         │  - Canonical request construction          │
         │  - URL building (path-style)               │
         │  - XML parsing (all response types)        │
         │  - Error mapping                           │
         │  - Multipart orchestration logic           │
         │  - Stream chunking                         │
         │  - Presigned URL generation                │
         └─────────────────────────────────────────────┘
```

### 7.2 Mock Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                         Unit Test Scope                          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Component Under Test                         │   │
│  │                                                           │   │
│  │  Real: R2Signer, CanonicalRequestBuilder, XmlParser,     │   │
│  │        UrlBuilder, ErrorMapper, MultipartOrchestrator    │   │
│  │                                                           │   │
│  └──────────────────────────┬────────────────────────────────┘   │
│                             │                                     │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┼─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─    │
│          Mock Boundary      │                                     │
│  ┌──────────────────────────▼────────────────────────────────┐   │
│  │                      Mocked                                │   │
│  │                                                            │   │
│  │  - HttpTransport (returns canned responses)               │   │
│  │  - Clock (fixed timestamps for signing tests)             │   │
│  │  - Config (specific test configurations)                  │   │
│  │  - Random (deterministic for upload IDs)                  │   │
│  │                                                            │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### 7.3 Integration Test with Simulation

```
┌─────────────────────────────────────────────────────────────────┐
│                    Integration Test Scope                        │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Test Code                              │   │
│  │                                                           │   │
│  │  #[test]                                                  │   │
│  │  async fn test_multipart_upload_flow() {                  │   │
│  │      let replayer = SimulationReplayer::from_file(       │   │
│  │          "fixtures/multipart_100mb.json"                 │   │
│  │      );                                                   │   │
│  │                                                           │   │
│  │      let client = R2ClientBuilder::new()                 │   │
│  │          .account_id("test")                             │   │
│  │          .credentials("key", "secret")                   │   │
│  │          .with_replay_transport(replayer)                │   │
│  │          .build()?;                                       │   │
│  │                                                           │   │
│  │      let result = client.objects()                       │   │
│  │          .put(large_object)                              │   │
│  │          .await;                                          │   │
│  │                                                           │   │
│  │      assert!(result.is_ok());                            │   │
│  │      assert_eq!(result.e_tag, "expected-etag");          │   │
│  │  }                                                        │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                             │                                    │
│                             ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              R2Client (Full Implementation)               │   │
│  │                                                           │   │
│  │  - Real signing logic                                    │   │
│  │  - Real XML parsing                                      │   │
│  │  - Real multipart orchestration                          │   │
│  │  - ReplayTransport instead of real HTTP                  │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 8. Architecture Decision Records

### ADR-001: Path-Style URLs Only

**Context**: S3 supports both virtual-hosted style (`bucket.s3.region.amazonaws.com`) and path-style (`s3.region.amazonaws.com/bucket`) URLs.

**Decision**: Use path-style URLs exclusively for R2.

**Rationale**:
- R2 primarily uses path-style URLs
- Simpler implementation with single URL format
- No DNS resolution complexity for bucket names
- Custom endpoint support is straightforward

**Consequences**:
- URL format: `https://<account>.r2.cloudflarestorage.com/<bucket>/<key>`
- All bucket names in path, not host
- Signing includes bucket in canonical URI

### ADR-002: Hardcoded Region "auto"

**Context**: S3 Signature V4 requires a region in the credential scope.

**Decision**: Always use "auto" as the region for R2 signing.

**Rationale**:
- R2 is regionless by design
- "auto" is R2's accepted region value
- Eliminates region configuration complexity
- Matches R2's automatic data distribution model

**Consequences**:
- Credential scope: `<date>/auto/s3/aws4_request`
- No region validation or selection logic needed
- Simpler configuration

### ADR-003: Multipart Threshold 100MB Default

**Context**: Need to decide when to automatically switch to multipart upload.

**Decision**: Default threshold of 100MB, configurable per client.

**Rationale**:
- Single PUT supports up to 5GB, but large PUTs are risky
- 100MB balances simplicity vs resilience
- Multipart allows resumption on failure
- Configurable for specific use cases

**Consequences**:
- Objects < 100MB: single PUT request
- Objects >= 100MB: automatic multipart
- Unknown size streams: always multipart

### ADR-004: Simulation as First-Class Feature

**Context**: Need deterministic testing without real R2 access.

**Decision**: Build record/replay simulation into the transport layer.

**Rationale**:
- Enables testing without R2 credentials
- Fast CI/CD pipelines (no network)
- Reproducible failure scenarios
- Supports chaos engineering

**Consequences**:
- R2Recorder trait for recording mode
- R2Replayer trait for replay mode
- ReplayTransport wraps recorded responses
- Recording files in JSON format

### ADR-005: No Caching Layer

**Context**: Could cache object metadata or small objects locally.

**Decision**: No built-in caching; delegate to application layer.

**Rationale**:
- R2 has zero egress costs (less incentive to cache reads)
- Caching adds complexity and staleness issues
- Applications have better context for caching needs
- Keep adapter thin and focused

**Consequences**:
- Every request goes to R2
- Application must implement caching if needed
- Simpler integration code
- Predictable behavior

### ADR-006: Streaming for Large Objects

**Context**: Large objects could exceed memory limits.

**Decision**: Provide streaming APIs for all get/put operations.

**Rationale**:
- Support objects up to 5TB
- Constant memory usage regardless of size
- Required for multipart uploads
- Backpressure support for consumers

**Consequences**:
- `get_stream()` returns async stream
- `put_stream()` accepts async stream
- Metrics track bytes as they flow
- Slightly more complex API surface

---

## 9. Performance Considerations

### 9.1 Latency Targets

| Operation | Target p50 | Target p99 | Notes |
|-----------|-----------|-----------|-------|
| Signing | < 100μs | < 500μs | CPU-bound, no I/O |
| URL construction | < 10μs | < 50μs | String operations |
| XML parsing | < 1ms | < 5ms | Per response |
| Small object PUT (< 1MB) | < 100ms | < 500ms | + network RTT |
| Small object GET (< 1MB) | < 50ms | < 200ms | + network RTT |
| ListObjects (1000 keys) | < 200ms | < 1s | + network RTT |

### 9.2 Throughput Targets

| Metric | Target | Implementation |
|--------|--------|----------------|
| Concurrent requests | 100+ | Connection pooling |
| Multipart concurrency | 4-16 parts | Configurable |
| Streaming throughput | Line-rate | No buffering |
| Requests/second | 1000+ | Client-side |

### 9.3 Memory Budgets

| Resource | Budget | Strategy |
|----------|--------|----------|
| Per small request | < 1MB | Bounded body size |
| Streaming buffer | 64KB | Chunk-based |
| Connection pool | 20 connections | Configurable |
| Signing buffers | < 4KB | Stack allocated |
| XML parser | < 1MB | Streaming parser |

### 9.4 Connection Management

```
┌──────────────────────────────────────────────────────────────┐
│                   Connection Pool                             │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                 Pool Configuration                       │ │
│  │                                                          │ │
│  │  max_connections: 20                                    │ │
│  │  idle_timeout: 90s                                      │ │
│  │  connection_timeout: 30s                                │ │
│  │  keep_alive: true                                       │ │
│  │  tcp_nodelay: true                                      │ │
│  │                                                          │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐        ┌─────┐            │
│  │Conn1│ │Conn2│ │Conn3│ │Conn4│  ...   │Conn20│           │
│  │     │ │     │ │     │ │     │        │      │           │
│  │HTTPS│ │HTTPS│ │IDLE │ │HTTPS│        │IDLE  │           │
│  └─────┘ └─────┘ └─────┘ └─────┘        └──────┘           │
│                                                               │
│  Multiplexed across all buckets (single R2 endpoint)        │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## 10. Security Considerations

### 10.1 Credential Security

| Requirement | Implementation |
|-------------|----------------|
| Credentials never logged | `SecretString` with `Display` redaction |
| Zeroize on drop | `Zeroize` trait implementation |
| No credential in URLs | Presigned URLs only for limited time |
| Rotation support | Refresh via shared-auth |

### 10.2 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ only | HTTP client configuration |
| HTTPS enforced | Reject HTTP endpoints |
| Certificate validation | System CA store |
| No cert pinning | R2 may rotate certs |

### 10.3 Request Security

| Requirement | Implementation |
|-------------|----------------|
| Signed requests | S3 Signature V4 |
| Timestamp freshness | Within 15 minutes |
| Payload integrity | SHA256 hash in signature |
| Presign limits | Max 7 days expiration |

### 10.4 Data Security

| Requirement | Implementation |
|-------------|----------------|
| Encryption at rest | R2 default (transparent) |
| Encryption in transit | TLS |
| No sensitive data in keys | Documentation/validation |
| Metadata sanitization | No PII in headers |

---

## 11. Error Handling Strategy

### 11.1 Error Categories

```
┌──────────────────────────────────────────────────────────────────┐
│                        Error Handling Flow                        │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │                    R2 API Response                       │     │
│  └──────────────────────────┬──────────────────────────────┘     │
│                             │                                     │
│              ┌──────────────┼──────────────┐                     │
│              │              │              │                     │
│              ▼              ▼              ▼                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Success    │  │  Retryable   │  │ Non-Retryable │           │
│  │   (2xx)      │  │  Error       │  │  Error        │           │
│  └──────────────┘  │              │  │               │           │
│                    │  - 429       │  │  - 400        │           │
│                    │  - 500       │  │  - 403        │           │
│                    │  - 503       │  │  - 404        │           │
│                    │  - Timeout   │  │  - 409        │           │
│                    │  - ConnReset │  │               │           │
│                    └──────┬───────┘  └───────┬───────┘           │
│                           │                  │                    │
│                           ▼                  ▼                    │
│                    ┌──────────────┐   ┌──────────────┐           │
│                    │    Retry     │   │   Return     │           │
│                    │  (with backoff)│   │   Error     │           │
│                    └──────────────┘   └──────────────┘           │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 11.2 Retry Strategy

| Error Type | Max Retries | Initial Backoff | Max Backoff |
|------------|-------------|-----------------|-------------|
| SlowDown (429) | 5 | Retry-After or 1s | 30s |
| InternalError (500) | 3 | 1s | 30s |
| ServiceUnavailable (503) | 3 | 1s | 30s |
| Timeout | 3 | 500ms | 10s |
| Connection reset | 3 | 500ms | 10s |

### 11.3 Circuit Breaker

```
┌──────────────────────────────────────────────────────────────────┐
│                     Circuit Breaker States                        │
│                                                                   │
│  ┌──────────┐       failure_threshold      ┌──────────┐          │
│  │  CLOSED  │────────────────────────────▶│   OPEN   │          │
│  │          │   (5 consecutive failures)   │          │          │
│  │ (normal) │                              │(rejecting)│          │
│  └────▲─────┘                              └────┬─────┘          │
│       │                                         │                 │
│       │ success_threshold                       │ reset_timeout   │
│       │ (3 successes)                          │ (30 seconds)    │
│       │                                         ▼                 │
│       │                                   ┌──────────┐           │
│       └───────────────────────────────────│HALF-OPEN│           │
│                                           │         │           │
│                                           │(testing)│           │
│                                           └──────────┘           │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-14 | SPARC Generator | Initial Architecture |

---

**Next Phase:** Refinement - Implementation details, edge cases, performance optimization, and security hardening.
