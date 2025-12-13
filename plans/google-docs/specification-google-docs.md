# Google Docs Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/google/docs`

---

## 1. Overview

### 1.1 Purpose

Provide a thin adapter layer enabling the LLM Dev Ops platform to read from and write to Google Docs for document-based workflows including prompt authoring, report generation, reviews, and collaboration.

### 1.2 Scope

**In Scope:**
- Document content reading (full and partial)
- Structured content updates (insert, replace, delete)
- Version history and revision tracking
- Document metadata management
- Suggestions mode (propose/accept/reject)
- Named range management for structured updates
- Comments and replies
- Export to various formats
- Simulation and replay of document interactions

**Out of Scope:**
- Google Workspace provisioning
- Document permissions management (read-only access to existing permissions)
- Drive folder management (handled by google/drive integration)
- Real-time collaborative editing (WebSocket)
- Template creation/management in Google
- Core orchestration logic

### 1.3 Thin Adapter Principle

| Concern | Delegation |
|---------|------------|
| OAuth2 authentication | `google/auth` module |
| Retry with backoff | `shared/resilience` |
| Circuit breaker | `shared/resilience` |
| Metrics emission | `shared/observability` |
| Distributed tracing | `shared/observability` |
| Structured logging | `shared/observability` |
| Vector embeddings | `shared/vector-memory` |

---

## 2. API Operations

### 2.1 DocumentService

| Operation | Method | Description |
|-----------|--------|-------------|
| `get_document` | GET | Retrieve full document content and structure |
| `get_document_content` | GET | Retrieve text content only (optimized) |
| `batch_update` | POST | Apply structured updates to document |
| `create_document` | POST | Create new document with initial content |
| `get_metadata` | GET | Get document title, locale, revision info |
| `update_metadata` | PATCH | Update document title |

### 2.2 RevisionService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_revisions` | GET | List document revision history |
| `get_revision` | GET | Get specific revision details |
| `get_revision_content` | GET | Get document content at revision |
| `compare_revisions` | - | Diff two revisions (local computation) |

### 2.3 SuggestionService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_suggestions` | GET | List pending suggestions |
| `accept_suggestion` | POST | Accept a suggestion |
| `reject_suggestion` | POST | Reject a suggestion |
| `create_suggestion` | POST | Create suggestion via batch update |

### 2.4 CommentService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_comments` | GET | List comments on document |
| `get_comment` | GET | Get specific comment with replies |
| `create_comment` | POST | Add comment to document |
| `reply_to_comment` | POST | Reply to existing comment |
| `resolve_comment` | PATCH | Mark comment as resolved |
| `delete_comment` | DELETE | Delete a comment |

### 2.5 NamedRangeService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_named_ranges` | GET | List all named ranges |
| `create_named_range` | POST | Create named range via batch update |
| `delete_named_range` | POST | Delete named range via batch update |
| `get_range_content` | GET | Get content within named range |
| `update_range_content` | POST | Replace content in named range |

### 2.6 ExportService

| Operation | Method | Description |
|-----------|--------|-------------|
| `export_as_pdf` | GET | Export document as PDF |
| `export_as_docx` | GET | Export as Microsoft Word |
| `export_as_markdown` | GET | Export as Markdown (local conversion) |
| `export_as_plain_text` | GET | Export as plain text |

---

## 3. Core Types

### 3.1 Document Structure

```
Document:
  document_id: String
  title: String
  revision_id: String
  body: Body
  headers: Map<String, Header>
  footers: Map<String, Footer>
  footnotes: Map<String, Footnote>
  named_ranges: Map<String, NamedRange>
  lists: Map<String, List>
  inline_objects: Map<String, InlineObject>
  document_style: DocumentStyle

Body:
  content: Vec<StructuralElement>

StructuralElement:
  | Paragraph(Paragraph)
  | SectionBreak(SectionBreak)
  | Table(Table)
  | TableOfContents(TableOfContents)

Paragraph:
  elements: Vec<ParagraphElement>
  paragraph_style: ParagraphStyle
  bullet: Option<Bullet>

ParagraphElement:
  | TextRun(TextRun)
  | InlineObjectElement(InlineObjectElement)
  | AutoText(AutoText)
  | PageBreak(PageBreak)
  | ColumnBreak(ColumnBreak)
  | FootnoteReference(FootnoteReference)
  | HorizontalRule(HorizontalRule)
  | Equation(Equation)
  | Person(Person)
  | RichLink(RichLink)

TextRun:
  content: String
  text_style: TextStyle
  suggested_insertion_ids: Vec<String>
  suggested_deletion_ids: Vec<String>
  suggested_text_style_changes: Map<String, SuggestedTextStyle>
```

### 3.2 Update Requests

```
BatchUpdateRequest:
  requests: Vec<Request>
  write_control: Option<WriteControl>

WriteControl:
  | RequiredRevisionId(String)
  | TargetRevisionId(String)

Request:
  | InsertText(InsertTextRequest)
  | DeleteContentRange(DeleteContentRangeRequest)
  | InsertInlineImage(InsertInlineImageRequest)
  | InsertTable(InsertTableRequest)
  | InsertTableRow(InsertTableRowRequest)
  | InsertTableColumn(InsertTableColumnRequest)
  | DeleteTableRow(DeleteTableRowRequest)
  | DeleteTableColumn(DeleteTableColumnRequest)
  | InsertPageBreak(InsertPageBreakRequest)
  | InsertSectionBreak(InsertSectionBreakRequest)
  | DeleteParagraphBullets(DeleteParagraphBulletsRequest)
  | UpdateTextStyle(UpdateTextStyleRequest)
  | UpdateParagraphStyle(UpdateParagraphStyleRequest)
  | UpdateTableCellStyle(UpdateTableCellStyleRequest)
  | UpdateTableRowStyle(UpdateTableRowStyleRequest)
  | UpdateDocumentStyle(UpdateDocumentStyleRequest)
  | CreateNamedRange(CreateNamedRangeRequest)
  | DeleteNamedRange(DeleteNamedRangeRequest)
  | ReplaceAllText(ReplaceAllTextRequest)
  | CreateParagraphBullets(CreateParagraphBulletsRequest)
  | MergeTableCells(MergeTableCellsRequest)
  | UnmergeTableCells(UnmergeTableCellsRequest)
  | CreateHeader(CreateHeaderRequest)
  | CreateFooter(CreateFooterRequest)
  | CreateFootnote(CreateFootnoteRequest)
  | ReplaceNamedRangeContent(ReplaceNamedRangeContentRequest)
  | PinTableHeaderRows(PinTableHeaderRowsRequest)

Location:
  index: i32
  segment_id: Option<String>  // Header/footer/footnote ID

Range:
  start_index: i32
  end_index: i32
  segment_id: Option<String>
```

### 3.3 Comments

```
Comment:
  comment_id: String
  content: String
  author: User
  created_time: DateTime
  modified_time: DateTime
  resolved: bool
  replies: Vec<Reply>
  anchor: Option<String>  // Content anchor
  quoted_content: Option<String>

Reply:
  reply_id: String
  content: String
  author: User
  created_time: DateTime
  modified_time: DateTime

User:
  display_name: String
  email: Option<String>
  photo_url: Option<String>
```

### 3.4 Revisions

```
Revision:
  revision_id: String
  modified_time: DateTime
  last_modifying_user: User
  export_links: Map<String, String>

RevisionList:
  revisions: Vec<Revision>
  next_page_token: Option<String>
```

### 3.5 Named Ranges

```
NamedRange:
  name: String
  named_range_id: String
  ranges: Vec<Range>

NamedRangeContent:
  name: String
  content: String
  ranges: Vec<Range>
```

---

## 4. Configuration

```
GoogleDocsConfig:
  # Authentication (delegated to google/auth)
  credentials: CredentialSource
  scopes: Vec<String>  # Default: ["https://www.googleapis.com/auth/documents"]

  # API settings
  api_version: String  # Default: "v1"
  base_url: String     # Default: "https://docs.googleapis.com"

  # Resilience
  max_retries: u32           # Default: 3
  request_timeout_ms: u64    # Default: 30000
  batch_size_limit: usize    # Default: 100 requests per batch

  # Rate limiting
  requests_per_minute: u32   # Default: 300 (Docs API limit)

  # Content settings
  include_suggestions: bool  # Default: true
  include_tabs_and_footers: bool  # Default: false

CredentialSource:
  | ServiceAccount(PathBuf)
  | OAuth2(OAuth2Config)
  | ApplicationDefault
```

---

## 5. Error Taxonomy

| Error Type | HTTP Status | Retryable | Description |
|------------|-------------|-----------|-------------|
| `DocumentNotFound` | 404 | No | Document does not exist |
| `AccessDenied` | 403 | No | Insufficient permissions |
| `InvalidRequest` | 400 | No | Malformed request |
| `InvalidRange` | 400 | No | Index out of bounds |
| `ConflictingRevision` | 409 | Yes* | Revision conflict |
| `QuotaExceeded` | 429 | Yes | Rate limit exceeded |
| `InternalError` | 500 | Yes | Google API internal error |
| `ServiceUnavailable` | 503 | Yes | Temporary unavailability |
| `AuthenticationFailed` | 401 | No | Invalid credentials |
| `SuggestionNotFound` | 404 | No | Suggestion ID invalid |
| `CommentNotFound` | 404 | No | Comment ID invalid |
| `NamedRangeNotFound` | 404 | No | Named range not found |

*Retry with fresh document state

---

## 6. Rate Limits and Quotas

| Limit | Value | Scope |
|-------|-------|-------|
| Read requests | 300/min | Per user |
| Write requests | 60/min | Per user |
| Batch update requests | 100/batch | Per request |
| Document size | 50 MB | Per document |
| Characters | 10M | Per document |
| Images | 3000 | Per document |

---

## 7. Security Requirements

### 7.1 Credential Protection
- OAuth tokens stored via `SecretString` (never logged)
- Service account keys loaded from secure storage
- Token refresh handled by `google/auth`

### 7.2 Content Security
- Document content not logged (PII risk)
- Comment authors' emails redacted in logs
- Export files written to secure temp with cleanup

### 7.3 Access Scoping
- Minimum required scopes requested
- Support for read-only mode (`documents.readonly`)
- Per-document access validation

---

## 8. Simulation Requirements

### 8.1 MockDocsClient
- Simulate all API operations
- Configurable document states
- Inject errors for testing
- Track operation history

### 8.2 Document Replay
- Record API interactions
- Replay for regression testing
- Capture revision sequences

### 8.3 Local Document Model
- In-memory document representation
- Apply batch updates locally
- Validate index calculations

---

## 9. Integration Points

### 9.1 Shared Modules

```
google/auth:
  - get_access_token(scopes) -> AccessToken
  - refresh_token() -> AccessToken
  - validate_credentials() -> bool

shared/resilience:
  - RetryPolicy for transient errors
  - CircuitBreaker per endpoint
  - RateLimiter (300 req/min read, 60 req/min write)

shared/observability:
  - Metrics: docs.operations, docs.latency, docs.errors
  - Traces: span per operation
  - Logs: structured, content-redacted

shared/vector-memory:
  - store_document_embedding(doc_id, content)
  - search_similar_documents(query)
```

### 9.2 Related Integrations

```
google/drive:
  - Document discovery and listing
  - Folder navigation
  - Permissions (read-only view)

google/sheets:
  - Linked data references
  - Cross-document data
```

---

## 10. API Version and Compatibility

| Component | Version | Notes |
|-----------|---------|-------|
| Google Docs API | v1 | Stable |
| Drive API (for comments, revisions) | v3 | Required for some operations |
| OAuth 2.0 | RFC 6749 | Via google/auth |

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-google-docs.md | Complete |
| 2. Pseudocode | pseudocode-google-docs.md | Pending |
| 3. Architecture | architecture-google-docs.md | Pending |
| 4. Refinement | refinement-google-docs.md | Pending |
| 5. Completion | completion-google-docs.md | Pending |

---

*Phase 1: Specification - Complete*
