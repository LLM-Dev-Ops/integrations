# Architecture: OneDrive Integration Module

## SPARC Phase 3: Architecture

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/onedrive`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [C4 Model Diagrams](#2-c4-model-diagrams)
3. [Module Architecture](#3-module-architecture)
4. [Data Flow Architecture](#4-data-flow-architecture)
5. [Large File Upload Architecture](#5-large-file-upload-architecture)
6. [Streaming Architecture](#6-streaming-architecture)
7. [Simulation Architecture](#7-simulation-architecture)
8. [Concurrency Model](#8-concurrency-model)
9. [Error Handling Architecture](#9-error-handling-architecture)
10. [Deployment Architecture](#10-deployment-architecture)

---

## 1. Architecture Overview

### 1.1 Design Philosophy

| Principle | Implementation |
|-----------|----------------|
| Single Responsibility | Graph API file operations only |
| No Infrastructure | No tenant/storage management |
| Shared Auth | Uses Azure AD OAuth2 integration |
| Streaming | Memory-efficient large files |
| Testability | Simulation layer for CI/CD |

### 1.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LLM Dev Ops Platform                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   OneDrive Integration                       │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌───────────────┐   │    │
│  │  │  File   │  │ Folder  │  │ Version │  │    Search     │   │    │
│  │  │   Ops   │  │   Ops   │  │   Ops   │  │               │   │    │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └───────┬───────┘   │    │
│  │       │            │            │               │           │    │
│  │       └────────────┴────────────┴───────────────┘           │    │
│  │                           │                                  │    │
│  │                    ┌──────┴──────┐                          │    │
│  │                    │   Client    │                          │    │
│  │                    │    Core     │                          │    │
│  │                    └──────┬──────┘                          │    │
│  │       ┌───────────────────┼───────────────────┐             │    │
│  │       │                   │                   │             │    │
│  │  ┌────┴─────┐      ┌──────┴──────┐     ┌──────┴──────┐     │    │
│  │  │  Azure   │      │    HTTP     │     │ Simulation  │     │    │
│  │  │ AD Auth  │      │   Client    │     │   Layer     │     │    │
│  │  └──────────┘      └─────────────┘     └─────────────┘     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Shared Primitives                         │    │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │    │
│  │  │ Logging │  │ Metrics │  │  Retry  │  │  Azure AD Auth  │ │    │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  Microsoft Graph    │
                    │       API           │
                    │  ┌───────────────┐  │
                    │  │   OneDrive    │  │
                    │  │   Endpoints   │  │
                    │  └───────────────┘  │
                    └─────────────────────┘
```

### 1.3 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Shared Azure AD auth | Reuse existing OAuth2 integration |
| Streaming downloads | Memory efficiency for large files |
| Resumable uploads | Reliability for large files |
| DriveRef abstraction | Flexible drive targeting |
| Content hashing | Simulation integrity |

---

## 2. C4 Model Diagrams

### 2.1 Context Diagram (Level 1)

```
┌─────────────────────────────────────────────────────────────────────┐
│                           «System»                                   │
│                      LLM Dev Ops Platform                            │
│    ┌────────────────────────────────────────────────────────┐       │
│    │              OneDrive Integration Module                │       │
│    │                                                         │       │
│    │   File storage, artifact exchange, dataset management  │       │
│    │   via Microsoft Graph API                               │       │
│    └────────────────────────────────────────────────────────┘       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           │                   │                   │
           ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ «External»      │  │ «External»      │  │ «External»      │
│ Microsoft Graph │  │ Azure AD        │  │ OneDrive        │
│ API             │  │ (OAuth2)        │  │ Storage         │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### 2.2 Container Diagram (Level 2)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     OneDrive Integration Module                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐     │
│  │  «Component»   │    │  «Component»   │    │  «Component»   │     │
│  │   File Ops     │    │  Folder Ops    │    │  Version Ops   │     │
│  │                │    │                │    │                │     │
│  │ - Upload       │    │ - Create       │    │ - List         │     │
│  │ - Download     │    │ - List         │    │ - Download     │     │
│  │ - Delete       │    │ - Recursive    │    │ - Restore      │     │
│  │ - Copy/Move    │    │                │    │                │     │
│  └───────┬────────┘    └───────┬────────┘    └───────┬────────┘     │
│          │                     │                     │              │
│          └─────────────────────┼─────────────────────┘              │
│                                │                                     │
│                         ┌──────┴──────┐                             │
│                         │ «Component» │                             │
│                         │OneDriveClient│                            │
│                         └──────┬──────┘                             │
│                                │                                     │
│          ┌─────────────────────┼─────────────────────┐              │
│          │                     │                     │              │
│  ┌───────┴────────┐    ┌───────┴───────┐    ┌───────┴────────┐     │
│  │  «Component»   │    │  «Component»  │    │  «Component»   │     │
│  │  Upload Mgr    │    │  HTTP Client  │    │   Simulation   │     │
│  │                │    │               │    │     Layer      │     │
│  │ - Sessions     │    │ - Retry       │    │ - Record       │     │
│  │ - Chunking     │    │ - Streaming   │    │ - Replay       │     │
│  │ - Resume       │    │ - Auth        │    │ - Content      │     │
│  └────────────────┘    └───────────────┘    └────────────────┘     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 Component Diagram (Level 3)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OneDriveClient                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     Internal Components                      │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │    │
│  │  │   Config    │  │  HttpClient  │  │  AzureAdClient   │   │    │
│  │  │   (Arc)     │  │    (Arc)     │  │      (Arc)       │   │    │
│  │  └─────────────┘  └──────────────┘  └──────────────────┘   │    │
│  │                                                              │    │
│  │  ┌──────────────────────────────────────────────────────┐   │    │
│  │  │                 SimulationLayer (Arc)                 │   │    │
│  │  └──────────────────────────────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Public API:                                                         │
│  ├── upload_small(drive, path, content, options) -> DriveItem       │
│  ├── upload_large(drive, path, stream, options) -> DriveItem        │
│  ├── download(drive, item) -> ByteStream                            │
│  ├── delete(drive, item) -> ()                                      │
│  ├── copy(source, dest, options) -> AsyncOperation                  │
│  ├── move_item(drive, item, dest) -> DriveItem                      │
│  ├── create_folder(drive, parent, name) -> DriveItem                │
│  ├── list_children(drive, folder, options) -> Page<DriveItem>       │
│  ├── list_recursive(drive, folder) -> Stream<DriveItem>             │
│  ├── list_versions(drive, item) -> Vec<Version>                     │
│  ├── download_version(drive, item, version) -> ByteStream           │
│  └── restore_version(drive, item, version) -> DriveItem             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Module Architecture

### 3.1 Directory Structure

```
integrations/onedrive/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Public exports
│   ├── client.rs                 # OneDriveClient
│   ├── config.rs                 # Configuration & builder
│   │
│   ├── file/
│   │   ├── mod.rs
│   │   ├── upload.rs             # Small file upload
│   │   ├── upload_session.rs     # Large file session
│   │   ├── download.rs           # Streaming download
│   │   └── operations.rs         # Delete, copy, move
│   │
│   ├── folder/
│   │   ├── mod.rs
│   │   ├── create.rs
│   │   └── list.rs               # List, recursive
│   │
│   ├── version/
│   │   ├── mod.rs
│   │   └── operations.rs
│   │
│   ├── simulation/
│   │   ├── mod.rs
│   │   ├── layer.rs
│   │   ├── recorder.rs
│   │   └── storage.rs            # Content storage
│   │
│   ├── types/
│   │   ├── mod.rs
│   │   ├── drive.rs              # DriveRef, ItemRef
│   │   ├── item.rs               # DriveItem, metadata
│   │   └── upload.rs             # UploadSession
│   │
│   └── error.rs
│
├── tests/
│   ├── integration/
│   │   ├── file_test.rs
│   │   ├── folder_test.rs
│   │   └── version_test.rs
│   ├── unit/
│   │   ├── simulation_test.rs
│   │   └── types_test.rs
│   └── fixtures/
│       └── recordings/
│
└── examples/
    ├── upload_file.rs
    ├── download_file.rs
    └── list_folder.rs
```

### 3.2 External Dependencies

| Crate | Version | Purpose |
|-------|---------|---------|
| tokio | 1.0+ | Async runtime, streams |
| reqwest | 0.11+ | HTTP client, streaming |
| serde | 1.0+ | Serialization |
| serde_json | 1.0+ | JSON handling |
| futures | 0.3+ | Stream utilities |
| async-stream | 0.3+ | Async generators |
| sha2 | 0.10+ | Content hashing |
| thiserror | 1.0+ | Error types |
| tracing | 0.1+ | Observability |

---

## 4. Data Flow Architecture

### 4.1 Small File Upload Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Small File Upload Flow                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Caller invokes upload_small(drive, path, content)               │
│                          │                                           │
│                          ▼                                           │
│  2. ┌─────────────────────────────────────┐                         │
│     │     Validate file size <= 4MB       │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  3. ┌─────────────────────────────────────┐                         │
│     │     Check Simulation Mode           │                         │
│     │  Replay? → Return mock DriveItem    │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼ (Not replay)                             │
│  4. ┌─────────────────────────────────────┐                         │
│     │     Get token from Azure AD         │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  5. ┌─────────────────────────────────────┐                         │
│     │     PUT /drive/root:/{path}:/content │                        │
│     │     Body: file content              │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  6. ┌─────────────────────────────────────┐                         │
│     │     Handle response with retry      │                         │
│     │     429 → Wait retry_after          │                         │
│     │     401 → Refresh token, retry      │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  7. ┌─────────────────────────────────────┐                         │
│     │     Record if Recording Mode        │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  8. Return Result<DriveItem>                                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Download Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Download Flow                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. Caller invokes download(drive, item)                            │
│                          │                                           │
│                          ▼                                           │
│  2. ┌─────────────────────────────────────┐                         │
│     │  GET /drive/items/{id}/content      │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  3. ┌─────────────────────────────────────┐                         │
│     │     Response: 302 Redirect          │                         │
│     │     Location: download URL          │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  4. ┌─────────────────────────────────────┐                         │
│     │     GET download URL (no auth)      │                         │
│     │     Response: Streaming body        │                         │
│     └─────────────────────────────────────┘                         │
│                          │                                           │
│                          ▼                                           │
│  5. Return ByteStream (lazy, chunks on demand)                      │
│                                                                      │
│     Consumer reads:                                                  │
│     ┌─────────────────────────────────────┐                         │
│     │  WHILE let Some(chunk) = stream.next() {                      │
│     │      process(chunk);                 │                         │
│     │  }                                   │                         │
│     └─────────────────────────────────────┘                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Large File Upload Architecture

### 5.1 Session-Based Upload

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Large File Upload Architecture                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     Upload Session                           │    │
│  │                                                              │    │
│  │  1. Create Session                                           │    │
│  │     POST /drive/root:/{path}:/createUploadSession           │    │
│  │     Response: { uploadUrl, expirationDateTime }              │    │
│  │                                                              │    │
│  │  2. Upload Chunks                                            │    │
│  │     PUT {uploadUrl}                                          │    │
│  │     Content-Range: bytes {start}-{end}/{total}               │    │
│  │     Response: 202 (more) or 200/201 (complete)               │    │
│  │                                                              │    │
│  │  3. Complete or Cancel                                       │    │
│  │     Success: Returns DriveItem                               │    │
│  │     Failure: DELETE {uploadUrl}                              │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Chunk Size Strategy:                                                │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  - Minimum: 320 KB (required multiple)                       │    │
│  │  - Default: 10 MB (balanced)                                 │    │
│  │  - Maximum: 60 MB (API limit)                                │    │
│  │  - Must be multiple of 320 KB                                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Resume Handling:                                                    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  On failure:                                                 │    │
│  │  1. GET {uploadUrl} → Returns nextExpectedRanges             │    │
│  │  2. Seek stream to next expected byte                        │    │
│  │  3. Resume uploading from that position                      │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Chunk Upload State Machine

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Chunk Upload State Machine                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                    ┌───────────────┐                                │
│                    │ SESSION_CREATED│                               │
│                    └───────┬───────┘                                │
│                            │                                         │
│                   Read chunk│                                        │
│                            ▼                                         │
│                    ┌───────────────┐                                │
│            ┌──────►│ UPLOADING     │◄─────────┐                     │
│            │       └───────┬───────┘          │                     │
│            │               │                  │                     │
│            │    ┌──────────┼──────────┐       │                     │
│            │    │          │          │       │                     │
│            │    ▼          ▼          ▼       │                     │
│         ┌──────┐   ┌───────────┐   ┌──────┐   │                     │
│         │ 202  │   │  200/201  │   │ 5xx  │   │                     │
│         │ More │   │ Complete  │   │Error │   │                     │
│         └──┬───┘   └─────┬─────┘   └──┬───┘   │                     │
│            │             │            │       │                     │
│   Next chunk             │      Retry?│       │                     │
│            │             │      ┌─────┴─────┐ │                     │
│            │             │      │    Yes    │─┘                     │
│            │             │      └─────┬─────┘                       │
│            │             │            │ No                          │
│            │             ▼            ▼                             │
│            │       ┌───────────┐  ┌───────────┐                     │
│            │       │ COMPLETED │  │  FAILED   │                     │
│            │       └───────────┘  └───────────┘                     │
│            │                            │                           │
│            └────────────────────────────┘                           │
│                      Resume from nextExpectedRanges                 │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Streaming Architecture

### 6.1 ByteStream Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Streaming Architecture                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ByteStream (Implements Stream<Item = Result<Bytes, Error>>)        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  Download:                                                   │    │
│  │  ┌────────────┐    ┌────────────┐    ┌────────────┐         │    │
│  │  │  HTTP      │───►│  Response  │───►│  Consumer  │         │    │
│  │  │  Response  │    │   Body     │    │   (lazy)   │         │    │
│  │  │            │    │  (chunks)  │    │            │         │    │
│  │  └────────────┘    └────────────┘    └────────────┘         │    │
│  │                                                              │    │
│  │  Memory Usage: O(chunk_size), not O(file_size)              │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Upload (Large):                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  ┌────────────┐    ┌────────────┐    ┌────────────┐         │    │
│  │  │  Source    │───►│  Chunker   │───►│   HTTP     │         │    │
│  │  │  Stream    │    │ (10MB buf) │    │   PUT      │         │    │
│  │  │ (AsyncRead)│    │            │    │            │         │    │
│  │  └────────────┘    └────────────┘    └────────────┘         │    │
│  │                                                              │    │
│  │  Memory Usage: O(chunk_size), configurable                  │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Recursive Listing Stream

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Recursive Listing Stream                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  list_recursive() returns Stream<Item = Result<DriveItem>>          │
│                                                                      │
│  Implementation (depth-first, stack-based):                          │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  stack = [root_folder]                                       │    │
│  │                                                              │    │
│  │  WHILE stack not empty:                                      │    │
│  │      folder = stack.pop()                                    │    │
│  │      FOR item IN list_children(folder):                      │    │
│  │          IF item.is_folder:                                  │    │
│  │              stack.push(item)                                │    │
│  │          yield item                                          │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Benefits:                                                           │
│  - Memory: O(depth) for stack, not O(total_items)                   │
│  - Lazy: Only fetches pages as consumer reads                       │
│  - Backpressure: Respects consumer pace                             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Simulation Architecture

### 7.1 Simulation Layer Design

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Simulation Architecture                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     SimulationLayer                          │    │
│  │                                                              │    │
│  │  SimulationMode:                                             │    │
│  │  ├── Disabled  → Pass-through to real API                   │    │
│  │  ├── Recording → Execute + record with content hash         │    │
│  │  └── Replay    → Return mock responses + cached content     │    │
│  │                                                              │    │
│  │  Content Storage:                                            │    │
│  │  ┌────────────────────────────────────────────────────┐     │    │
│  │  │  recordings/                                        │     │    │
│  │  │  ├── interactions.json   (API calls)               │     │    │
│  │  │  └── content/                                       │     │    │
│  │  │      ├── {sha256-hash-1}  (file content)           │     │    │
│  │  │      ├── {sha256-hash-2}                           │     │    │
│  │  │      └── ...                                        │     │    │
│  │  └────────────────────────────────────────────────────┘     │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Recording Format

```json
{
  "metadata": {
    "version": "1.0",
    "created": "2025-12-13T00:00:00Z",
    "drive_id": "b!xxxxx"
  },
  "interactions": [
    {
      "id": "uuid-1",
      "timestamp": "2025-12-13T00:00:01Z",
      "operation": "upload_small",
      "request": {
        "method": "PUT",
        "path": "/me/drive/root:/test.txt:/content",
        "content_hash": "sha256:abcd1234..."
      },
      "response": {
        "status": 201,
        "body": {
          "id": "item-id-123",
          "name": "test.txt",
          "size": 1024
        }
      }
    },
    {
      "id": "uuid-2",
      "operation": "download",
      "request": {
        "method": "GET",
        "path": "/me/drive/items/item-id-123/content"
      },
      "response": {
        "status": 200,
        "content_hash": "sha256:abcd1234..."
      }
    }
  ]
}
```

---

## 8. Concurrency Model

### 8.1 Shared State

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Concurrency Model                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  OneDriveClient (Cloneable, Send + Sync)                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │    │
│  │  Arc<OneDriveConfig>   - Immutable after creation           │    │
│  │  Arc<AzureAdClient>    - Shared auth (thread-safe)          │    │
│  │  Arc<HttpClient>       - Connection pooling                 │    │
│  │  Arc<SimulationLayer>  - RwLock protected                   │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Upload Sessions:                                                    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  - Each session is independent                               │    │
│  │  - No shared state between uploads                           │    │
│  │  - Session URL is unique per upload                          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Token Refresh:                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  - Handled by shared AzureAdClient                           │    │
│  │  - Token cache is thread-safe                                │    │
│  │  - Automatic refresh on 401                                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. Error Handling Architecture

### 9.1 Error Categories

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Error Handling Architecture                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                      OneDriveError                           │    │
│  │                                                              │    │
│  │  Retryable:                                                  │    │
│  │  ├── Throttled { retry_after }   → Wait and retry           │    │
│  │  ├── ServerError { status }      → Exponential backoff      │    │
│  │  └── NetworkError                → Connection retry          │    │
│  │                                                              │    │
│  │  Auth (special handling):                                    │    │
│  │  └── Unauthorized                → Refresh token, retry once │    │
│  │                                                              │    │
│  │  Non-Retryable:                                              │    │
│  │  ├── Forbidden                   → Insufficient permissions  │    │
│  │  ├── NotFound                    → Item doesn't exist        │    │
│  │  ├── Conflict                    → Name collision            │    │
│  │  ├── PreconditionFailed          → ETag mismatch             │    │
│  │  ├── InsufficientStorage         → Quota exceeded            │    │
│  │  └── FileTooLarge                → Over 4MB for simple       │    │
│  │                                                              │    │
│  │  Upload-specific:                                            │    │
│  │  ├── UploadSessionExpired        → Session timed out         │    │
│  │  ├── UploadIncomplete            → Unexpected EOF            │    │
│  │  └── ChunkUploadFailed           → Chunk rejected            │    │
│  │                                                              │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Deployment Architecture

### 10.1 Runtime Requirements

| Requirement | Specification |
|-------------|---------------|
| Rust Version | 1.70+ |
| Async Runtime | Tokio 1.0+ |
| Memory | ~20MB base + streaming buffers |
| Network | Outbound HTTPS |
| Dependencies | Azure AD OAuth2 integration |

### 10.2 Configuration Sources

```
Priority Order:

1. Direct Config
   OneDriveConfigBuilder::new()
       .with_default_drive(DriveRef::Me)
       .with_chunk_size(10 * 1024 * 1024)
       .build()

2. Environment Variables
   ONEDRIVE_DEFAULT_DRIVE_ID   - Default drive
   ONEDRIVE_CHUNK_SIZE         - Upload chunk size

3. Shared Azure AD Config
   Via AzureAdClient injection
```

### 10.3 Observability Metrics

| Metric | Type | Description |
|--------|------|-------------|
| onedrive_uploads_total | Counter | Files uploaded |
| onedrive_downloads_total | Counter | Files downloaded |
| onedrive_bytes_uploaded | Counter | Total bytes up |
| onedrive_bytes_downloaded | Counter | Total bytes down |
| onedrive_upload_duration_seconds | Histogram | Upload latency |
| onedrive_api_errors_total | Counter | API errors by type |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-ONEDRIVE-ARCH-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Architecture Document**

*SPARC Phase 3 Complete - Proceed to Refinement phase with "Next phase."*
