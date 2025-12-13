# Architecture: Azure Blob Storage Integration Module

## SPARC Phase 3: Architecture

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/azure-blob-storage`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Design Principles](#2-design-principles)
3. [C4 Model Diagrams](#3-c4-model-diagrams)
4. [Module Structure](#4-module-structure)
5. [Component Design](#5-component-design)
6. [Data Flow](#6-data-flow)
7. [Concurrency Model](#7-concurrency-model)
8. [Deployment Considerations](#8-deployment-considerations)

---

## 1. Architecture Overview

### 1.1 System Context

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LLM Dev Ops Platform                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐    ┌─────────────────────────┐    ┌─────────────┐ │
│  │ Orchestrator│───►│  Azure Blob Storage     │───►│   Azure     │ │
│  │   Layer     │    │  Integration Module     │    │   Blob      │ │
│  └─────────────┘    │  (Thin Adapter)         │    │   Storage   │ │
│         │           └─────────────────────────┘    └─────────────┘ │
│         │                      │                                    │
│         ▼                      ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Shared Primitives                         │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐ │   │
│  │  │  Auth  │ │Logging │ │Metrics │ │Tracing │ │   Retry    │ │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Integration Boundaries

| Boundary | This Module | External |
|----------|-------------|----------|
| Storage Provisioning | ✗ | Azure Portal / IaC |
| Container Management | ✗ | Azure Portal / IaC |
| Blob Operations | ✓ | - |
| Authentication | Delegates | Shared Auth Primitive |
| Retry Logic | Uses | Shared Retry Primitive |
| Observability | Integrates | Shared Primitives |

---

## 2. Design Principles

### 2.1 Thin Adapter Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    Thin Adapter Boundaries                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ADAPTER RESPONSIBILITY:              NOT RESPONSIBLE FOR:   │
│  ├── REST API translation             ├── Account creation   │
│  ├── Request/response mapping         ├── Container creation │
│  ├── Chunked transfer logic           ├── Access policies    │
│  ├── Version ID handling              ├── Lifecycle rules    │
│  ├── Error type conversion            ├── Replication config │
│  └── Simulation interception          └── Network rules      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Hexagonal Architecture

```
                    ┌─────────────────────────────────┐
                    │         Application Core         │
                    │  ┌───────────────────────────┐  │
     Inbound        │  │    BlobStorageClient      │  │        Outbound
      Ports         │  │  ┌─────────────────────┐  │  │         Ports
        │           │  │  │   Domain Logic      │  │  │           │
        ▼           │  │  │  - Upload/Download  │  │  │           ▼
  ┌──────────┐      │  │  │  - Chunking         │  │  │     ┌──────────┐
  │UploadPort│─────►│  │  │  - Versioning       │  │  │────►│ HttpPort │
  └──────────┘      │  │  └─────────────────────┘  │  │     └──────────┘
  ┌──────────┐      │  └───────────────────────────┘  │     ┌──────────┐
  │DownPort  │─────►│                                  │────►│ AuthPort │
  └──────────┘      └─────────────────────────────────┘     └──────────┘
  ┌──────────┐                     │                        ┌──────────┐
  │ ListPort │─────────────────────┘                   ────►│SimulPort │
  └──────────┘                                              └──────────┘
```

---

## 3. C4 Model Diagrams

### 3.1 Context Diagram (Level 1)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│    ┌──────────────┐         ┌──────────────────────┐                │
│    │  ML Training │         │   Data Pipeline      │                │
│    │   Service    │         │     Service          │                │
│    └──────┬───────┘         └──────────┬───────────┘                │
│           │                            │                             │
│           │    Store/Retrieve Blobs    │                             │
│           ▼                            ▼                             │
│    ┌────────────────────────────────────────────┐                   │
│    │       Azure Blob Storage Integration       │                   │
│    │              [Thin Adapter]                │                   │
│    └─────────────────────┬──────────────────────┘                   │
│                          │                                           │
│                          │ REST API (HTTPS)                         │
│                          ▼                                           │
│    ┌────────────────────────────────────────────┐                   │
│    │           Azure Blob Storage               │                   │
│    │         [External Service]                 │                   │
│    └────────────────────────────────────────────┘                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Container Diagram (Level 2)

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Azure Blob Storage Integration                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │  BlobStorage    │    │    Uploader     │    │   Downloader    │ │
│  │     Client      │───►│   Component     │    │   Component     │ │
│  │                 │    │                 │    │                 │ │
│  │ - Configuration │    │ - Simple upload │    │ - Simple DL     │ │
│  │ - Auth handling │    │ - Chunked upload│    │ - Streaming DL  │ │
│  │ - Request exec  │    │ - Append upload │    │ - Range reads   │ │
│  └────────┬────────┘    └─────────────────┘    └─────────────────┘ │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │   Management    │    │   Versioning    │    │   Simulation    │ │
│  │   Component     │    │   Component     │    │     Layer       │ │
│  │                 │    │                 │    │                 │ │
│  │ - List blobs    │    │ - List versions │    │ - Recording     │ │
│  │ - Delete        │    │ - Get version   │    │ - Replay        │ │
│  │ - Copy          │    │ - Delete version│    │ - Persistence   │ │
│  │ - Properties    │    │                 │    │                 │ │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 Component Diagram (Level 3)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      BlobStorageClient                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                        Client Core                            │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │   │
│  │  │   Config    │  │  HTTP Pool  │  │   Auth Provider     │   │   │
│  │  │   Manager   │  │   Manager   │  │   (Shared Prim.)    │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│          ┌───────────────────┼───────────────────┐                  │
│          ▼                   ▼                   ▼                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐        │
│  │   Uploader   │   │  Downloader  │   │    Management    │        │
│  │ ┌──────────┐ │   │ ┌──────────┐ │   │  ┌────────────┐  │        │
│  │ │ Simple   │ │   │ │ Simple   │ │   │  │   Lister   │  │        │
│  │ │ Uploader │ │   │ │Downloader│ │   │  └────────────┘  │        │
│  │ └──────────┘ │   │ └──────────┘ │   │  ┌────────────┐  │        │
│  │ ┌──────────┐ │   │ ┌──────────┐ │   │  │  Deleter   │  │        │
│  │ │ Chunked  │ │   │ │ Streaming│ │   │  └────────────┘  │        │
│  │ │ Uploader │ │   │ │Downloader│ │   │  ┌────────────┐  │        │
│  │ └──────────┘ │   │ └──────────┘ │   │  │   Copier   │  │        │
│  │ ┌──────────┐ │   │ ┌──────────┐ │   │  └────────────┘  │        │
│  │ │ Append   │ │   │ │  Range   │ │   │  ┌────────────┐  │        │
│  │ │ Uploader │ │   │ │  Reader  │ │   │  │ Properties │  │        │
│  │ └──────────┘ │   │ └──────────┘ │   │  └────────────┘  │        │
│  └──────────────┘   └──────────────┘   └──────────────────┘        │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Simulation Layer                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │   │
│  │  │  Recorder   │  │   Replayer  │  │  Storage/Matcher    │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Module Structure

### 4.1 Rust Module Layout

```
azure-blob-storage/
├── Cargo.toml
├── src/
│   ├── lib.rs                 # Public API exports
│   ├── client.rs              # BlobStorageClient implementation
│   ├── config.rs              # Configuration and builder
│   │
│   ├── upload/
│   │   ├── mod.rs             # Upload module exports
│   │   ├── simple.rs          # Single-request uploads
│   │   ├── chunked.rs         # Block blob chunked upload
│   │   ├── append.rs          # Append blob operations
│   │   └── progress.rs        # Progress tracking
│   │
│   ├── download/
│   │   ├── mod.rs             # Download module exports
│   │   ├── simple.rs          # Full blob download
│   │   ├── streaming.rs       # Chunked streaming download
│   │   └── range.rs           # Range read operations
│   │
│   ├── management/
│   │   ├── mod.rs             # Management module exports
│   │   ├── list.rs            # List blobs with pagination
│   │   ├── delete.rs          # Delete operations
│   │   ├── copy.rs            # Copy operations
│   │   └── properties.rs      # Metadata and properties
│   │
│   ├── versioning/
│   │   ├── mod.rs             # Versioning module exports
│   │   └── versions.rs        # Version operations
│   │
│   ├── simulation/
│   │   ├── mod.rs             # Simulation module exports
│   │   ├── layer.rs           # Simulation interceptor
│   │   ├── recorder.rs        # Request/response recording
│   │   ├── replayer.rs        # Replay logic
│   │   └── storage.rs         # Recording persistence
│   │
│   ├── types/
│   │   ├── mod.rs             # Type exports
│   │   ├── blob.rs            # BlobItem, BlobProperties
│   │   ├── request.rs         # Request types
│   │   ├── response.rs        # Response types
│   │   └── tier.rs            # AccessTier enum
│   │
│   └── error.rs               # Error types
│
└── tests/
    ├── integration/
    │   ├── upload_test.rs
    │   ├── download_test.rs
    │   └── management_test.rs
    └── simulation/
        └── replay_test.rs
```

### 4.2 TypeScript Module Layout

```
azure-blob-storage/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts               # Public exports
│   ├── client.ts              # BlobStorageClient
│   ├── config.ts              # Configuration
│   │
│   ├── upload/
│   │   ├── index.ts
│   │   ├── simple.ts
│   │   ├── chunked.ts
│   │   └── append.ts
│   │
│   ├── download/
│   │   ├── index.ts
│   │   ├── simple.ts
│   │   └── streaming.ts
│   │
│   ├── management/
│   │   ├── index.ts
│   │   ├── list.ts
│   │   ├── delete.ts
│   │   └── copy.ts
│   │
│   ├── simulation/
│   │   ├── index.ts
│   │   ├── layer.ts
│   │   └── storage.ts
│   │
│   ├── types/
│   │   ├── index.ts
│   │   ├── blob.ts
│   │   └── request.ts
│   │
│   └── error.ts
│
└── tests/
    ├── upload.test.ts
    ├── download.test.ts
    └── simulation.test.ts
```

---

## 5. Component Design

### 5.1 Client Component

```
┌─────────────────────────────────────────────────────────────────┐
│                      BlobStorageClient                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Responsibilities:                                               │
│  ├── Configuration management                                    │
│  ├── Connection pooling                                          │
│  ├── Authentication token management                             │
│  ├── Request execution with retry                                │
│  ├── Simulation layer orchestration                              │
│  └── Sub-component coordination                                  │
│                                                                  │
│  Dependencies:                                                   │
│  ├── HttpClient (reqwest)                                        │
│  ├── AuthProvider (shared primitive)                             │
│  ├── RetryPolicy (shared primitive)                              │
│  └── SimulationLayer                                             │
│                                                                  │
│  Thread Safety:                                                  │
│  ├── Client is Clone + Send + Sync                               │
│  ├── Internal state wrapped in Arc                               │
│  └── Config is immutable after construction                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Uploader Component

```
┌─────────────────────────────────────────────────────────────────┐
│                        Uploader Component                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SimpleUploader:                                                 │
│  ├── Single PUT request for blobs < 256MB                        │
│  ├── Content-MD5 validation                                      │
│  └── Conditional upload (If-None-Match)                          │
│                                                                  │
│  ChunkedUploader:                                                │
│  ├── Block upload pattern for large blobs                        │
│  ├── Parallel block uploads (configurable concurrency)           │
│  ├── Block list commit                                           │
│  ├── Resume capability (uncommitted blocks)                      │
│  └── Progress callback support                                   │
│                                                                  │
│  AppendUploader:                                                 │
│  ├── Append block operations                                     │
│  ├── Conditional append (position check)                         │
│  └── Auto-create append blob                                     │
│                                                                  │
│  Decision Logic:                                                 │
│  IF data_size <= 256MB AND !is_stream:                          │
│      USE SimpleUploader                                          │
│  ELSE IF blob_type == AppendBlob:                               │
│      USE AppendUploader                                          │
│  ELSE:                                                           │
│      USE ChunkedUploader                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Downloader Component

```
┌─────────────────────────────────────────────────────────────────┐
│                       Downloader Component                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SimpleDownloader:                                               │
│  ├── Single GET request                                          │
│  ├── Full blob to memory/file                                    │
│  └── Version ID support                                          │
│                                                                  │
│  StreamingDownloader:                                            │
│  ├── Parallel range downloads                                    │
│  ├── Ordered chunk reassembly                                    │
│  ├── Progress callback support                                   │
│  └── Memory-bounded streaming                                    │
│                                                                  │
│  RangeReader:                                                    │
│  ├── HTTP Range header support                                   │
│  ├── Sparse reads                                                │
│  └── Partial content (206) handling                              │
│                                                                  │
│  Decision Logic:                                                 │
│  IF blob_size <= chunk_size:                                    │
│      USE SimpleDownloader                                        │
│  ELSE IF stream_requested:                                       │
│      USE StreamingDownloader                                     │
│  ELSE IF range_specified:                                        │
│      USE RangeReader                                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.4 Simulation Layer

```
┌─────────────────────────────────────────────────────────────────┐
│                       Simulation Layer                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Modes:                                                          │
│  ├── Disabled: Pass-through to real Azure                        │
│  ├── Recording: Capture requests/responses                       │
│  └── Replay: Return recorded responses                           │
│                                                                  │
│  Recording Flow:                                                 │
│  1. Intercept outgoing request                                   │
│  2. Execute against real Azure                                   │
│  3. Capture response and timing                                  │
│  4. Store interaction                                            │
│  5. Return response to caller                                    │
│                                                                  │
│  Replay Flow:                                                    │
│  1. Intercept outgoing request                                   │
│  2. Generate matching key                                        │
│  3. Lookup recorded interaction                                  │
│  4. Optionally simulate timing                                   │
│  5. Return recorded response                                     │
│                                                                  │
│  Matching Strategies:                                            │
│  ├── Exact: Full request match                                   │
│  ├── Operation: Method + container + blob                        │
│  └── Relaxed: Method only                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Data Flow

### 6.1 Upload Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      Upload Data Flow                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Simple Upload (< 256MB):                                        │
│                                                                  │
│  Client ─► Validate ─► Build Request ─► [Simulation?]           │
│                                              │                   │
│              ┌───────────────────────────────┘                   │
│              ▼                                                   │
│         ┌────────┐     ┌────────┐     ┌────────┐                │
│         │  Auth  │────►│  PUT   │────►│ Parse  │────► Response  │
│         │ Header │     │Request │     │Response│                │
│         └────────┘     └────────┘     └────────┘                │
│                                                                  │
│  Chunked Upload (>= 256MB):                                      │
│                                                                  │
│  Client ─► Split into Chunks ─► [For each chunk in parallel]    │
│                                              │                   │
│              ┌───────────────────────────────┘                   │
│              ▼                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Chunk 1 ─► PUT Block ─┐                                │    │
│  │  Chunk 2 ─► PUT Block ─┼─► Commit Block List ─► Response│    │
│  │  Chunk N ─► PUT Block ─┘                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Download Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Download Data Flow                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Simple Download:                                                │
│                                                                  │
│  Client ─► Build URL ─► [Simulation?] ─► GET ─► Response        │
│                                                                  │
│  Streaming Download:                                             │
│                                                                  │
│  Client ─► Get Properties (size) ─► Calculate Ranges            │
│                                           │                      │
│              ┌────────────────────────────┘                      │
│              ▼                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Range 1 ──────────────────────────────────┐            │    │
│  │  Range 2 ─► GET (parallel) ─► Reorder ─────┼─► Stream   │    │
│  │  Range N ──────────────────────────────────┘            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Chunk ordering via index-tagged channel                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.3 Simulation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Simulation Data Flow                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Recording Mode:                                                 │
│                                                                  │
│  Request ─► Simulation Layer ─► Execute Real Request             │
│                   │                     │                        │
│                   │                     ▼                        │
│                   │              Azure Blob Storage              │
│                   │                     │                        │
│                   │                     ▼                        │
│                   └─────────► Record Interaction                 │
│                                     │                            │
│                                     ▼                            │
│                              Return Response                     │
│                                                                  │
│  Replay Mode:                                                    │
│                                                                  │
│  Request ─► Simulation Layer ─► Generate Match Key               │
│                                       │                          │
│                                       ▼                          │
│                              Lookup Recording                    │
│                                       │                          │
│                          ┌────────────┴────────────┐             │
│                          ▼                         ▼             │
│                       Found                    Not Found         │
│                          │                         │             │
│                          ▼                         ▼             │
│                  Return Recorded            Return Error         │
│                     Response               (NoMatch)             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Concurrency Model

### 7.1 Async Runtime

```
┌─────────────────────────────────────────────────────────────────┐
│                      Concurrency Model                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Runtime: Tokio (multi-threaded)                                 │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Tokio Runtime                         │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │    │
│  │  │  Worker 1   │  │  Worker 2   │  │   Worker N      │  │    │
│  │  │  ┌───────┐  │  │  ┌───────┐  │  │   ┌───────┐     │  │    │
│  │  │  │Upload │  │  │  │Upload │  │  │   │Download│    │  │    │
│  │  │  │Task 1 │  │  │  │Task 2 │  │  │   │Task 1  │    │  │    │
│  │  │  └───────┘  │  │  └───────┘  │  │   └───────┘     │  │    │
│  │  │  ┌───────┐  │  │  ┌───────┐  │  │   ┌───────┐     │  │    │
│  │  │  │Download│ │  │  │ List  │  │  │   │ Copy   │    │  │    │
│  │  │  │Task 2 │  │  │  │ Task  │  │  │   │ Task   │    │  │    │
│  │  │  └───────┘  │  │  └───────┘  │  │   └───────┘     │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Concurrency Controls:                                           │
│  ├── Semaphore for parallel chunk operations                     │
│  ├── Channel for ordered chunk reassembly                        │
│  ├── RwLock for simulation recordings                            │
│  └── Arc for shared client state                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Connection Pooling

```
┌─────────────────────────────────────────────────────────────────┐
│                     Connection Pool Design                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  HTTP Client (reqwest):                                          │
│  ├── Pool idle connections: max_concurrency                      │
│  ├── Connection timeout: 30s                                     │
│  ├── Request timeout: configurable (default 300s)                │
│  └── Keep-alive: enabled                                         │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   Connection Pool                        │    │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐          │    │
│  │  │Conn 1│ │Conn 2│ │Conn 3│ │Conn 4│ │Conn N│          │    │
│  │  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘          │    │
│  │     │        │        │        │        │               │    │
│  │     └────────┴────────┼────────┴────────┘               │    │
│  │                       ▼                                  │    │
│  │              Azure Blob Storage                          │    │
│  │           (*.blob.core.windows.net)                      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Deployment Considerations

### 8.1 Authentication Configuration

```
┌─────────────────────────────────────────────────────────────────┐
│                  Authentication Options                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Azure AD (Recommended for production):                          │
│  ├── Managed Identity (Azure workloads)                          │
│  ├── Service Principal (non-Azure workloads)                     │
│  └── Workload Identity (Kubernetes)                              │
│                                                                  │
│  SAS Token (Scoped access):                                      │
│  ├── Account SAS                                                 │
│  ├── Container SAS                                               │
│  └── Blob SAS                                                    │
│                                                                  │
│  Storage Account Key (Development only):                         │
│  └── Not recommended for production                              │
│                                                                  │
│  Environment Variables:                                          │
│  ├── AZURE_STORAGE_ACCOUNT                                       │
│  ├── AZURE_STORAGE_CONTAINER                                     │
│  ├── AZURE_TENANT_ID                                             │
│  ├── AZURE_CLIENT_ID                                             │
│  └── AZURE_CLIENT_SECRET (or use managed identity)               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 CI/CD Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                    CI/CD Pipeline Design                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Development:                                                    │
│  ├── Use Azurite emulator                                        │
│  ├── Record interactions against real Azure                      │
│  └── Store recordings in test fixtures                           │
│                                                                  │
│  CI Pipeline:                                                    │
│  ├── Unit tests with mocks                                       │
│  ├── Integration tests with simulation replay                    │
│  └── Optional: Azurite container tests                           │
│                                                                  │
│  Staging/Production:                                             │
│  ├── Real Azure Blob Storage                                     │
│  ├── Managed Identity authentication                             │
│  └── Simulation disabled                                         │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Pipeline Stages                                         │    │
│  │                                                          │    │
│  │  Build ─► Unit Test ─► Integration Test ─► Deploy        │    │
│  │    │         │              │                │           │    │
│  │    ▼         ▼              ▼                ▼           │    │
│  │  Compile   Mocks      Simulation       Real Azure        │    │
│  │            Only         Replay          (Staging)        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-AZURE-BLOB-ARCH-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Architecture Document**

*SPARC Phase 3 Complete - Proceed to Refinement phase with "Next phase."*
