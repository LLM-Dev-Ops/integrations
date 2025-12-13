# Microsoft Word & Excel Graph API Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/word-excel-graph-api`

---

## 1. Overview

### 1.1 Document Purpose

This specification defines the requirements for the Microsoft Word & Excel Graph API Integration Module. It provides a production-ready interface for reading from and writing to Word documents and Excel workbooks via Microsoft Graph API for report generation, structured data manipulation, analytics exports, and simulation workflows within the LLM Dev Ops platform.

### 1.2 Methodology

- **SPARC**: Specification → Pseudocode → Architecture → Refinement → Completion
- **London-School TDD**: Interface-first, mock-based testing
- **Thin Adapter Pattern**: Minimal logic, delegating to shared primitives

---

## 2. Module Purpose and Scope

### 2.1 Purpose Statement

The Word & Excel Graph API Integration Module provides a **thin adapter layer** that:
- Reads and writes Word documents (content, paragraphs, tables)
- Reads and writes Excel workbooks (cells, ranges, worksheets)
- Supports batch operations for efficient bulk updates
- Handles concurrent access with version tracking (ETags)
- Manages permission scopes and delegated access
- Supports version history navigation
- Enables simulation/replay of document interactions
- Integrates with shared auth, logging, and observability

### 2.2 Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Word Read** | Read document content, paragraphs, tables, sections |
| **Word Write** | Insert/update text, tables, images, formatting |
| **Excel Read** | Read cells, ranges, worksheets, named ranges |
| **Excel Write** | Update cells, ranges, batch updates, formulas |
| **Workbook Sessions** | Manage Excel sessions for batch operations |
| **Version History** | Access document versions, restore previous |
| **Permission Scoping** | Delegated and application permissions |
| **Concurrency** | ETag-based conflict detection |
| **Resilience** | Retry, circuit breaker, rate limiting |
| **Observability** | Tracing, metrics for operations |

### 2.3 Scope Boundaries

#### In Scope

| Item | Details |
|------|---------|
| Word document read | Paragraphs, tables, content controls |
| Word document write | Insert text, tables, replace content |
| Excel range read | Single cells, ranges, worksheets |
| Excel range write | Update, batch update, append |
| Excel workbook sessions | Create, refresh, close sessions |
| Excel tables | Read/write table data |
| Excel named ranges | CRUD operations |
| Version history | List versions, get specific version |
| ETag concurrency | Conflict detection |
| Permission validation | Scope checking |
| Dual language | Rust (primary) and TypeScript |

#### Out of Scope

| Item | Reason |
|------|--------|
| File creation/deletion | OneDrive/SharePoint integration |
| Folder management | OneDrive/SharePoint integration |
| Sharing/permissions | Tenant administration |
| Macros/VBA execution | Security boundary |
| Real-time co-authoring | Separate protocol |
| Charts/graphs creation | Complex rendering |
| Print operations | Client-side feature |

### 2.4 Design Constraints

| Constraint | Rationale |
|------------|-----------|
| Async-first | I/O-bound operations |
| No panics | Reliability |
| Trait-based | Testability |
| OAuth 2.0 / Client credentials | Microsoft standard |
| Workbook session management | Excel API requirement |

---

## 3. Dependency Policy

### 3.1 Shared Modules

| Module | Purpose |
|--------|---------|
| `shared/credentials` | Microsoft Entra ID credentials |
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
| `chrono` | Timestamps |
| `uuid` | Session IDs |

### 3.3 Forbidden Dependencies

| Dependency | Reason |
|------------|--------|
| `microsoft-graph-rs` | This module IS the integration |
| Full Graph SDK | Use internal implementations |

---

## 4. API Coverage

### 4.1 Microsoft Graph API Endpoints

**Base URL:** `https://graph.microsoft.com/v1.0`

#### Word Document Operations

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Get content | GET | `/drives/{driveId}/items/{itemId}/content` |
| Get document | GET | `/drives/{driveId}/items/{itemId}/workbook` |
| Update content | PUT | `/drives/{driveId}/items/{itemId}/content` |

#### Excel Workbook Operations

| Operation | Method | Endpoint |
|-----------|--------|----------|
| Get range | GET | `/drives/{driveId}/items/{itemId}/workbook/worksheets/{sheetId}/range(address='{range}')` |
| Update range | PATCH | `/drives/{driveId}/items/{itemId}/workbook/worksheets/{sheetId}/range(address='{range}')` |
| Get worksheet | GET | `/drives/{driveId}/items/{itemId}/workbook/worksheets/{sheetId}` |
| List worksheets | GET | `/drives/{driveId}/items/{itemId}/workbook/worksheets` |
| Create session | POST | `/drives/{driveId}/items/{itemId}/workbook/createSession` |
| Close session | POST | `/drives/{driveId}/items/{itemId}/workbook/closeSession` |
| Refresh session | POST | `/drives/{driveId}/items/{itemId}/workbook/refreshSession` |
| Get table | GET | `/drives/{driveId}/items/{itemId}/workbook/tables/{tableId}` |
| Add table row | POST | `/drives/{driveId}/items/{itemId}/workbook/tables/{tableId}/rows` |

#### Version Operations

| Operation | Method | Endpoint |
|-----------|--------|----------|
| List versions | GET | `/drives/{driveId}/items/{itemId}/versions` |
| Get version | GET | `/drives/{driveId}/items/{itemId}/versions/{versionId}` |
| Restore version | POST | `/drives/{driveId}/items/{itemId}/versions/{versionId}/restoreVersion` |

### 4.2 Excel Range Response

```json
{
  "address": "Sheet1!A1:D5",
  "addressLocal": "Sheet1!A1:D5",
  "cellCount": 20,
  "columnCount": 4,
  "rowCount": 5,
  "values": [
    ["Name", "Value", "Status", "Updated"],
    ["config_a", 100, "active", "2025-01-01"]
  ],
  "formulas": [
    ["", "", "", ""],
    ["", "=A2*10", "", "=TODAY()"]
  ],
  "numberFormat": [["General", "0.00", "@", "yyyy-mm-dd"]]
}
```

### 4.3 Workbook Session

```json
{
  "id": "session-id-guid",
  "persistChanges": true
}
```

---

## 5. Error Taxonomy

### 5.1 Error Hierarchy

```
GraphApiError
├── ConfigurationError
│   ├── InvalidDriveId
│   ├── InvalidItemId
│   └── InvalidCredentials
│
├── AuthenticationError
│   ├── TokenExpired
│   ├── InvalidClientSecret
│   ├── InsufficientScopes
│   └── TenantNotFound
│
├── AccessError
│   ├── ItemNotFound
│   ├── DriveNotFound
│   ├── PermissionDenied
│   ├── ItemLocked
│   └── SessionExpired
│
├── DataError
│   ├── InvalidRange
│   ├── InvalidCellValue
│   ├── TypeMismatch
│   ├── FormulaError
│   └── ContentTooLarge
│
├── ConcurrencyError
│   ├── ConflictDetected
│   ├── ETagMismatch
│   └── SessionConflict
│
├── RateLimitError
│   ├── ThrottledRequest
│   ├── QuotaExceeded
│   └── TooManyRequests
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
| 400 | `DataError` / `ConfigurationError` | No |
| 401 | `AuthenticationError` | Yes (refresh) |
| 403 | `AccessError::PermissionDenied` | No |
| 404 | `AccessError::ItemNotFound` | No |
| 409 | `ConcurrencyError::ConflictDetected` | Yes (re-read) |
| 412 | `ConcurrencyError::ETagMismatch` | Yes (re-read) |
| 423 | `AccessError::ItemLocked` | Yes (wait) |
| 429 | `RateLimitError` | Yes |
| 500 | `ServerError::InternalError` | Yes |
| 503 | `ServerError::ServiceUnavailable` | Yes |

---

## 6. Resilience Requirements

### 6.1 Retry Configuration

| Error Type | Retry | Max Attempts | Backoff |
|------------|-------|--------------|---------|
| `RateLimitError` (429) | Yes | 5 | Respect Retry-After |
| `ServiceUnavailable` (503) | Yes | 3 | Exponential (2s base) |
| `InternalError` (500) | Yes | 3 | Exponential (1s base) |
| `Timeout` | Yes | 3 | Fixed (1s) |
| `ItemLocked` (423) | Yes | 5 | Exponential (2s base) |
| `SessionExpired` | Yes | 1 | Recreate session |

### 6.2 Rate Limiting (Client-Side)

| Limit Type | Default | Notes |
|------------|---------|-------|
| Requests per minute | 1200 | Per app |
| Excel session operations | 60/min | Per session |
| Batch requests | 20 | Per batch |

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
| `graph.word.read` | `drive_id`, `item_id`, `content_type` |
| `graph.word.write` | `drive_id`, `item_id`, `bytes_written` |
| `graph.excel.read` | `drive_id`, `item_id`, `range`, `rows` |
| `graph.excel.write` | `drive_id`, `item_id`, `range`, `cells` |
| `graph.excel.session` | `session_id`, `operation` |
| `graph.version.list` | `drive_id`, `item_id`, `count` |

### 7.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `graph_operations_total` | Counter | `service`, `operation`, `status` |
| `graph_operation_latency_seconds` | Histogram | `service`, `operation` |
| `graph_excel_cells_read_total` | Counter | - |
| `graph_excel_cells_written_total` | Counter | - |
| `graph_word_bytes_written_total` | Counter | - |
| `graph_errors_total` | Counter | `error_type` |
| `graph_rate_limit_hits_total` | Counter | - |
| `graph_session_count` | Gauge | `state` |

### 7.3 Logging

| Level | When |
|-------|------|
| ERROR | Operation failures, auth errors |
| WARN | Rate limiting, retries, conflicts |
| INFO | Operations completed, session lifecycle |
| DEBUG | Request/response details |
| TRACE | Full payloads (redacted) |

---

## 8. Security Requirements

### 8.1 Credential Handling

| Requirement | Implementation |
|-------------|----------------|
| Client secret never logged | `SecretString` wrapper |
| Access tokens protected | Token cache with refresh |
| Minimum scopes | `Files.ReadWrite` only |

### 8.2 Permission Scopes

| Scope | Purpose |
|-------|---------|
| `Files.Read` | Read document content |
| `Files.ReadWrite` | Read and write documents |
| `Files.Read.All` | Read all files (app-only) |
| `Files.ReadWrite.All` | Read/write all files (app-only) |

### 8.3 Transport Security

| Requirement | Implementation |
|-------------|----------------|
| TLS 1.2+ only | Enforced |
| HTTPS only | No HTTP fallback |
| Certificate validation | Enabled |

### 8.4 Data Protection

| Requirement | Implementation |
|-------------|----------------|
| Drive/Item ID redaction | Partial masking in logs |
| Cell data protection | Optional redaction |
| Session ID protection | Not logged |

---

## 9. Performance Requirements

### 9.1 Latency Targets

| Operation | Target (p50) | Target (p99) |
|-----------|--------------|--------------|
| Excel read range (100 cells) | < 200ms | < 1s |
| Excel write range (100 cells) | < 300ms | < 1.5s |
| Excel batch update (10 ranges) | < 500ms | < 2s |
| Word read content | < 300ms | < 1.5s |
| Word write content | < 400ms | < 2s |
| Create session | < 500ms | < 2s |

### 9.2 Throughput Targets

| Metric | Target |
|--------|--------|
| Operations per minute | 100+ |
| Concurrent sessions | 10+ |
| Cells per batch | 5000+ |

---

## 10. Enterprise Features

### 10.1 Workbook Sessions

| Feature | Description |
|---------|-------------|
| Session creation | Persistent or non-persistent |
| Session refresh | Extend timeout before expiry |
| Session close | Explicit cleanup |
| Auto-cleanup | Close on client drop |

### 10.2 Version History

| Feature | Description |
|---------|-------------|
| List versions | Get all document versions |
| Get version | Download specific version |
| Restore version | Revert to previous version |
| Version metadata | Author, timestamp, size |

### 10.3 Concurrency Control

| Feature | Description |
|---------|-------------|
| ETag tracking | Detect concurrent modifications |
| If-Match header | Conditional updates |
| Session isolation | Exclusive access mode |

### 10.4 Batch Operations

| Feature | Description |
|---------|-------------|
| JSON batching | Multiple operations in one request |
| Atomic updates | All-or-nothing semantics |
| Dependency chaining | Sequential execution |

### 10.5 Simulation and Replay

| Feature | Description |
|---------|-------------|
| Mock mode | Simulate document operations |
| Record mode | Capture interactions |
| Replay mode | Deterministic testing |

---

## 11. Acceptance Criteria

### 11.1 Functional

- [ ] Excel: Read single cell
- [ ] Excel: Read range
- [ ] Excel: Read worksheet
- [ ] Excel: Write range
- [ ] Excel: Batch update ranges
- [ ] Excel: Create/refresh/close session
- [ ] Excel: Read/write table
- [ ] Excel: Named range operations
- [ ] Word: Read document content
- [ ] Word: Read paragraphs/tables
- [ ] Word: Write/insert content
- [ ] Word: Replace text
- [ ] Version: List versions
- [ ] Version: Get specific version
- [ ] Version: Restore version
- [ ] ETag-based conflict detection
- [ ] Rate limiting (client-side)

### 11.2 Non-Functional

- [ ] No panics
- [ ] Credentials protected
- [ ] Retry works correctly
- [ ] Circuit breaker functions
- [ ] IDs redacted in logs
- [ ] Test coverage > 80%

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Specification |

---

**Next Phase:** Pseudocode - Core algorithms for Word/Excel operations, session management, version history, and concurrency control.
