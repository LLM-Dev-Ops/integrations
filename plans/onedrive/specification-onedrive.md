# Specification: OneDrive Integration Module

## SPARC Phase 1: Specification

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/onedrive`

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Scope and Objectives](#2-scope-and-objectives)
3. [Microsoft Graph API Overview](#3-microsoft-graph-api-overview)
4. [Functional Requirements](#4-functional-requirements)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [System Constraints](#6-system-constraints)
7. [Interface Specifications](#7-interface-specifications)
8. [Data Models](#8-data-models)
9. [Error Handling](#9-error-handling)
10. [Enterprise Workflow Scenarios](#10-enterprise-workflow-scenarios)
11. [Acceptance Criteria](#11-acceptance-criteria)

---

## 1. Executive Summary

### 1.1 Purpose

This specification defines the OneDrive integration module for the LLM Dev Ops platform. It provides a thin adapter layer enabling file-based workflows including document storage, artifact exchange, dataset management, and simulation I/O via Microsoft Graph API.

### 1.2 Key Differentiators

| Feature | Description |
|---------|-------------|
| Large File Streaming | Resumable uploads, chunked downloads |
| Version History | Access and restore file versions |
| Permission Scoping | Delegate or application permissions |
| Path & ID Resolution | Flexible item addressing |
| Folder Operations | Create, list, recursive traversal |
| Simulation/Replay | Record and replay file interactions |

### 1.3 Design Philosophy

This integration is explicitly a **thin adapter layer**:
- No Microsoft tenant configuration
- No storage provisioning or quotas
- No SharePoint site management
- Leverages existing shared authentication (Azure AD OAuth2)
- Focuses on Graph API file operations only

---

## 2. Scope and Objectives

### 2.1 In Scope

| Category | Items |
|----------|-------|
| Files | Upload, download, delete, copy, move |
| Large Files | Resumable upload sessions, streaming |
| Folders | Create, list, recursive operations |
| Metadata | Get/set properties, custom metadata |
| Versions | List versions, restore, download specific |
| Permissions | List, share links (read-only ops) |
| Search | Search files by name, content |
| Simulation | Record/replay file interactions |

### 2.2 Out of Scope

| Category | Reason |
|----------|--------|
| Tenant Configuration | Admin concern |
| Storage Provisioning | Infrastructure |
| SharePoint Sites | Separate integration |
| Teams Files | Separate integration |
| Real-time Sync | Requires webhooks/delta |
| Permission Management | Admin operations |

### 2.3 Objectives

| ID | Objective | Success Metric |
|----|-----------|----------------|
| OBJ-001 | File operations | Upload, download, delete |
| OBJ-002 | Large file support | Files >4MB via sessions |
| OBJ-003 | Version awareness | List/restore versions |
| OBJ-004 | Streaming downloads | Memory-efficient reads |
| OBJ-005 | Simulation mode | CI/CD without OneDrive |
| OBJ-006 | Test coverage | >80% line coverage |

---

## 3. Microsoft Graph API Overview

### 3.1 API Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                Microsoft Graph API Architecture                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Base URL: https://graph.microsoft.com/v1.0                     │
│                                                                  │
│  Drive Endpoints:                                                │
│  ├── /me/drive              - Current user's drive              │
│  ├── /users/{id}/drive      - Specific user's drive             │
│  ├── /drives/{id}           - Specific drive by ID              │
│  └── /sites/{id}/drive      - SharePoint site drive             │
│                                                                  │
│  Item Addressing:                                                │
│  ├── /drive/items/{item-id}                                     │
│  ├── /drive/root:/{path}                                        │
│  └── /drive/items/{parent-id}/children                          │
│                                                                  │
│  Large File Upload:                                              │
│  ├── Create upload session                                      │
│  ├── Upload chunks (320KB - 60MB)                               │
│  └── Complete or cancel session                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Authentication

| Method | Use Case |
|--------|----------|
| Delegated | User context via OAuth2 |
| Application | Service/daemon via client credentials |

**Note**: Authentication handled by shared Azure AD OAuth2 integration.

### 3.3 Throttling

| Limit | Value |
|-------|-------|
| Per app per tenant | 10,000 requests/10 min |
| Per user per app | 2,000 requests/10 min |
| Upload session | 24 hours validity |

---

## 4. Functional Requirements

### 4.1 File Operations

#### FR-FILE-001: Upload File (Small)

| Field | Details |
|-------|---------|
| Input | Drive ID, path, content, conflict behavior |
| Output | DriveItem metadata |
| Criteria | Files ≤4MB, single PUT request |

#### FR-FILE-002: Upload File (Large/Resumable)

| Field | Details |
|-------|---------|
| Input | Drive ID, path, content stream, chunk size |
| Output | DriveItem metadata |
| Criteria | Files >4MB, resumable sessions |

#### FR-FILE-003: Download File

| Field | Details |
|-------|---------|
| Input | Drive ID, item ID or path |
| Output | Byte stream |
| Criteria | Streaming, range requests |

#### FR-FILE-004: Delete File

| Field | Details |
|-------|---------|
| Input | Drive ID, item ID or path |
| Output | Success confirmation |
| Criteria | Idempotent, handle not-found |

#### FR-FILE-005: Copy File

| Field | Details |
|-------|---------|
| Input | Source, destination path, conflict behavior |
| Output | Async operation URL or DriveItem |
| Criteria | Cross-folder, same drive |

#### FR-FILE-006: Move File

| Field | Details |
|-------|---------|
| Input | Item ID, new parent, new name |
| Output | Updated DriveItem |
| Criteria | Rename support |

### 4.2 Folder Operations

#### FR-FOLDER-001: Create Folder

| Field | Details |
|-------|---------|
| Input | Drive ID, parent path, folder name |
| Output | DriveItem for folder |
| Criteria | Nested creation support |

#### FR-FOLDER-002: List Children

| Field | Details |
|-------|---------|
| Input | Drive ID, folder ID or path, pagination |
| Output | List of DriveItem |
| Criteria | Pagination, filtering |

#### FR-FOLDER-003: List Recursive

| Field | Details |
|-------|---------|
| Input | Drive ID, folder path, depth limit |
| Output | Stream of DriveItem |
| Criteria | Memory-efficient traversal |

### 4.3 Version Operations

#### FR-VER-001: List Versions

| Field | Details |
|-------|---------|
| Input | Drive ID, item ID |
| Output | List of DriveItemVersion |
| Criteria | All available versions |

#### FR-VER-002: Download Version

| Field | Details |
|-------|---------|
| Input | Drive ID, item ID, version ID |
| Output | Byte stream |
| Criteria | Specific version content |

#### FR-VER-003: Restore Version

| Field | Details |
|-------|---------|
| Input | Drive ID, item ID, version ID |
| Output | Restored DriveItem |
| Criteria | Makes version current |

### 4.4 Metadata Operations

#### FR-META-001: Get Item Metadata

| Field | Details |
|-------|---------|
| Input | Drive ID, item ID or path |
| Output | DriveItem with full metadata |
| Criteria | Include permissions, versions |

#### FR-META-002: Update Metadata

| Field | Details |
|-------|---------|
| Input | Drive ID, item ID, properties |
| Output | Updated DriveItem |
| Criteria | Name, description updates |

### 4.5 Search Operations

#### FR-SEARCH-001: Search Files

| Field | Details |
|-------|---------|
| Input | Drive ID, query string, scope |
| Output | List of matching DriveItem |
| Criteria | Name and content search |

### 4.6 Simulation Layer

#### FR-SIM-001: Recording Mode

| Field | Details |
|-------|---------|
| Input | Enable recording, storage path |
| Output | Recorded interactions |
| Criteria | Capture requests, responses, content hashes |

#### FR-SIM-002: Replay Mode

| Field | Details |
|-------|---------|
| Input | Recording file path |
| Output | Simulated responses |
| Criteria | Deterministic, mock item IDs |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| Requirement | Target |
|-------------|--------|
| Small file upload | <2s p99 |
| Large file upload | >10 MB/s throughput |
| Download streaming | >20 MB/s throughput |
| Metadata operations | <500ms p99 |

### 5.2 Reliability

| Requirement | Target |
|-------------|--------|
| Retry on 5xx | 3 retries, exponential backoff |
| Retry on 429 | Honor Retry-After header |
| Resume upload | Automatic on failure |
| Checksum validation | SHA256 for uploads |

### 5.3 Security

| Requirement | Implementation |
|-------------|----------------|
| Token handling | Via shared Azure AD integration |
| TLS | Required (HTTPS only) |
| Content encryption | Client-side optional |
| Token refresh | Automatic via shared auth |

### 5.4 Observability

| Requirement | Integration |
|-------------|-------------|
| Structured logging | Shared logging primitive |
| Metrics | Bytes transferred, operations |
| Tracing | Request correlation |

---

## 6. System Constraints

### 6.1 Thin Adapter Constraints

| Constraint | Description |
|------------|-------------|
| CON-THIN-001 | No tenant configuration |
| CON-THIN-002 | No storage provisioning |
| CON-THIN-003 | No SharePoint management |
| CON-THIN-004 | No permission management |
| CON-THIN-005 | No real-time sync |

### 6.2 Dependency Constraints

| Constraint | Description |
|------------|-------------|
| CON-DEP-001 | Requires Azure AD OAuth2 integration |
| CON-DEP-002 | Shared primitives only |
| CON-DEP-003 | No cross-module dependencies |

### 6.3 Graph API Limits

| Limit | Value |
|-------|-------|
| File size (simple upload) | 4 MB |
| File size (session upload) | 250 GB |
| Chunk size | 320 KB - 60 MB |
| Path length | 400 characters |
| Filename length | 255 characters |
| Items per request | 200 (pagination) |

---

## 7. Interface Specifications

### 7.1 Client Interface

```
OneDriveClient
├── new(config: OneDriveConfig, auth: AzureAdClient) -> Result<Self>
│
├── File Operations
│   ├── upload_small(drive, path, content, options) -> Result<DriveItem>
│   ├── upload_large(drive, path, stream, options) -> Result<DriveItem>
│   ├── download(drive, item, options) -> Result<ByteStream>
│   ├── delete(drive, item) -> Result<()>
│   ├── copy(source, dest, options) -> Result<AsyncOperation>
│   └── move_item(drive, item, dest) -> Result<DriveItem>
│
├── Folder Operations
│   ├── create_folder(drive, parent, name) -> Result<DriveItem>
│   ├── list_children(drive, folder, options) -> Result<Page<DriveItem>>
│   └── list_recursive(drive, folder) -> Result<Stream<DriveItem>>
│
├── Version Operations
│   ├── list_versions(drive, item) -> Result<Vec<Version>>
│   ├── download_version(drive, item, version) -> Result<ByteStream>
│   └── restore_version(drive, item, version) -> Result<DriveItem>
│
├── Metadata Operations
│   ├── get_item(drive, item) -> Result<DriveItem>
│   └── update_item(drive, item, updates) -> Result<DriveItem>
│
├── Search
│   └── search(drive, query, options) -> Result<Page<DriveItem>>
│
└── Simulation
    └── with_simulation(mode: SimulationMode) -> Self
```

### 7.2 Configuration Interface

```
OneDriveConfig
├── default_drive: Option<DriveRef>     // Default drive to use
├── chunk_size: usize                   // Upload chunk size (default: 10MB)
├── max_retries: u32                    // Retry count
├── timeout: Duration                   // Request timeout
├── simulation_mode: SimulationMode
└── path_routing: HashMap<String, PathRef>  // Named path aliases
```

---

## 8. Data Models

### 8.1 Core Types

```
DriveRef: Id(String) | Me | User(String) | Site(String)

ItemRef: Id(String) | Path(String)

DriveItem {
    id: String,
    name: String,
    size: Option<i64>,
    created_date_time: DateTime,
    last_modified_date_time: DateTime,
    web_url: String,
    parent_reference: Option<ParentReference>,
    file: Option<FileMetadata>,
    folder: Option<FolderMetadata>,
    e_tag: String,
    c_tag: String,
}

FileMetadata {
    mime_type: String,
    hashes: Option<Hashes>,
}

Hashes {
    sha256_hash: Option<String>,
    quick_xor_hash: Option<String>,
}

FolderMetadata {
    child_count: i32,
}

ParentReference {
    drive_id: String,
    id: String,
    path: String,
}

DriveItemVersion {
    id: String,
    last_modified_date_time: DateTime,
    last_modified_by: IdentitySet,
    size: i64,
}
```

### 8.2 Upload Types

```
UploadOptions {
    conflict_behavior: ConflictBehavior,  // Fail, Replace, Rename
    content_type: Option<String>,
    description: Option<String>,
}

ConflictBehavior: Fail | Replace | Rename

UploadSession {
    upload_url: String,
    expiration_date_time: DateTime,
    next_expected_ranges: Vec<String>,
}
```

### 8.3 Simulation Types

```
SimulationMode: Disabled | Recording { path } | Replay { path }

RecordedInteraction {
    timestamp: DateTime,
    operation: String,
    request: SerializedRequest,
    response: SerializedResponse,
    content_hash: Option<String>,  // For file content
}
```

---

## 9. Error Handling

### 9.1 Error Types

| Error | Code | Retryable | Description |
|-------|------|-----------|-------------|
| Throttled | 429 | Yes | Rate limit exceeded |
| Unauthorized | 401 | No | Token invalid/expired |
| Forbidden | 403 | No | Insufficient permissions |
| NotFound | 404 | No | Item doesn't exist |
| Conflict | 409 | No | Name conflict |
| PreconditionFailed | 412 | No | ETag mismatch |
| InsufficientStorage | 507 | No | Quota exceeded |
| ServerError | 5xx | Yes | Graph API error |
| NetworkError | - | Yes | Connection failure |
| UploadSessionExpired | - | No | Session timed out |

### 9.2 Error Structure

```
OneDriveError {
    kind: ErrorKind,
    message: String,
    code: Option<String>,      // Graph error code
    inner_error: Option<String>,
    retry_after: Option<Duration>,
    is_retryable: bool,
}
```

---

## 10. Enterprise Workflow Scenarios

### 10.1 Document Storage

```
Scenario: Store generated documents
1. Generate document content
2. Upload to designated folder path
3. Handle conflict (replace/rename)
4. Return item metadata with web URL
```

### 10.2 Dataset Management

```
Scenario: Manage ML training datasets
1. List folder to discover datasets
2. Download specific version of dataset
3. Upload processed/augmented data
4. Maintain version history
```

### 10.3 Artifact Exchange

```
Scenario: Pipeline artifact storage
1. Create run-specific folder
2. Upload build artifacts (large files)
3. Generate sharing links for consumers
4. Clean up old artifacts
```

### 10.4 Simulation I/O

```
Scenario: Test workflows without OneDrive
1. Enable recording mode in development
2. Execute file operations against real API
3. Save recordings with content hashes
4. Enable replay mode in CI
5. Run tests without OneDrive dependency
```

---

## 11. Acceptance Criteria

### 11.1 Functional Acceptance

| ID | Criteria | Verification |
|----|----------|--------------|
| AC-001 | Upload small file | Integration test |
| AC-002 | Upload large file | Integration test |
| AC-003 | Download file | Integration test |
| AC-004 | Delete file | Integration test |
| AC-005 | Copy/move file | Integration test |
| AC-006 | Create folder | Integration test |
| AC-007 | List folder | Integration test |
| AC-008 | List versions | Integration test |
| AC-009 | Restore version | Integration test |
| AC-010 | Search files | Integration test |
| AC-011 | Simulation recording | Unit test |
| AC-012 | Simulation replay | Unit test |

### 11.2 Performance Acceptance

| ID | Criteria | Target |
|----|----------|--------|
| AC-PERF-001 | Small upload p99 | <2s |
| AC-PERF-002 | Large upload throughput | >10 MB/s |
| AC-PERF-003 | Download throughput | >20 MB/s |
| AC-PERF-004 | Metadata ops p99 | <500ms |

### 11.3 Quality Acceptance

| ID | Criteria | Target |
|----|----------|--------|
| AC-QUAL-001 | Line coverage | >80% |
| AC-QUAL-002 | Clippy warnings | 0 |
| AC-QUAL-003 | Documentation | >90% public API |

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-ONEDRIVE-SPEC-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Specification Document**

*SPARC Phase 1 Complete - Proceed to Pseudocode phase with "Next phase."*
