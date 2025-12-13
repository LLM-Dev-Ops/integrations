# Confluence Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/atlassian/confluence`

---

## 1. Overview

### 1.1 Purpose

Provide a thin adapter layer enabling the LLM Dev Ops platform to read from and write to Confluence Cloud for knowledge bases, documentation, governance artifacts, and collaborative content workflows.

### 1.2 Scope

**In Scope:**
- Space listing and navigation
- Page CRUD operations
- Page hierarchy (parent/child) management
- Content body (storage format and editor format)
- Labels and metadata
- Version history and comparison
- Attachments (upload, download, list)
- Comments (inline and page-level)
- Content search (CQL)
- Content templates
- Permission checking (read-only)
- Webhooks for content changes
- Simulation and replay

**Out of Scope:**
- Atlassian site/cloud configuration
- Space provisioning and administration
- User and group management
- Blueprint creation
- Confluence apps/plugins
- Data Center/Server APIs (Cloud only)
- Core orchestration logic

### 1.3 Thin Adapter Principle

| Concern | Delegation |
|---------|------------|
| OAuth2/API token authentication | `atlassian/auth` module |
| Retry with backoff | `shared/resilience` |
| Circuit breaker | `shared/resilience` |
| Metrics emission | `shared/observability` |
| Distributed tracing | `shared/observability` |
| Structured logging | `shared/observability` |
| Vector embeddings | `shared/vector-memory` |

---

## 2. API Operations

### 2.1 SpaceService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_spaces` | GET | List all accessible spaces |
| `get_space` | GET | Get space by key or ID |
| `get_space_content` | GET | Get root pages in space |
| `get_space_properties` | GET | Get space properties |

### 2.2 PageService

| Operation | Method | Description |
|-----------|--------|-------------|
| `get_page` | GET | Get page by ID |
| `get_page_by_title` | GET | Get page by space key and title |
| `list_pages` | GET | List pages in space with filters |
| `create_page` | POST | Create new page |
| `update_page` | PUT | Update page content/title |
| `delete_page` | DELETE | Delete or archive page |
| `move_page` | PUT | Move page to new parent/space |
| `copy_page` | POST | Copy page to destination |
| `get_children` | GET | Get child pages |
| `get_ancestors` | GET | Get parent page chain |

### 2.3 ContentService

| Operation | Method | Description |
|-----------|--------|-------------|
| `get_body` | GET | Get page body in format (storage/view/editor) |
| `update_body` | PUT | Update page body |
| `convert_content` | POST | Convert between formats |
| `get_macros` | GET | Extract macros from content |

### 2.4 VersionService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_versions` | GET | List page versions |
| `get_version` | GET | Get specific version |
| `get_version_content` | GET | Get content at version |
| `compare_versions` | - | Diff two versions (local) |
| `restore_version` | POST | Restore to previous version |

### 2.5 AttachmentService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_attachments` | GET | List page attachments |
| `get_attachment` | GET | Get attachment metadata |
| `download_attachment` | GET | Download attachment content |
| `upload_attachment` | POST | Upload new attachment |
| `update_attachment` | PUT | Update existing attachment |
| `delete_attachment` | DELETE | Delete attachment |

### 2.6 LabelService

| Operation | Method | Description |
|-----------|--------|-------------|
| `get_labels` | GET | Get labels on content |
| `add_label` | POST | Add label to content |
| `remove_label` | DELETE | Remove label from content |
| `get_content_by_label` | GET | Find content with label |

### 2.7 CommentService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_comments` | GET | List comments on page |
| `get_comment` | GET | Get specific comment |
| `create_comment` | POST | Add comment to page |
| `update_comment` | PUT | Update comment |
| `delete_comment` | DELETE | Delete comment |
| `list_inline_comments` | GET | List inline comments |
| `create_inline_comment` | POST | Add inline comment |

### 2.8 SearchService

| Operation | Method | Description |
|-----------|--------|-------------|
| `search` | GET | Search using CQL |
| `search_content` | GET | Search content with filters |
| `get_recently_viewed` | GET | Get recently viewed content |

### 2.9 TemplateService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_templates` | GET | List available templates |
| `get_template` | GET | Get template details |
| `create_from_template` | POST | Create page from template |

### 2.10 WebhookService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_webhooks` | GET | List registered webhooks |
| `create_webhook` | POST | Register webhook |
| `delete_webhook` | DELETE | Remove webhook |
| `process_event` | - | Handle webhook event |

---

## 3. Core Types

### 3.1 Space Types

```
Space:
  id: String
  key: String
  name: String
  type: SpaceType
  status: SpaceStatus
  homepage_id: Option<String>
  description: Option<Description>
  icon: Option<Icon>
  created_at: DateTime
  author_id: String

SpaceType:
  | Global
  | Personal

SpaceStatus:
  | Current
  | Archived

Description:
  plain: Option<String>
  view: Option<String>
```

### 3.2 Page Types

```
Page:
  id: String
  title: String
  space_id: String
  parent_id: Option<String>
  author_id: String
  owner_id: String
  status: ContentStatus
  created_at: DateTime
  version: Version
  body: Option<Body>
  labels: Vec<Label>
  position: Option<i32>

ContentStatus:
  | Current
  | Draft
  | Trashed
  | Deleted
  | Historical
  | Archived

Version:
  number: i32
  message: Option<String>
  created_at: DateTime
  author_id: String
  minor_edit: bool

Body:
  storage: Option<StorageBody>
  atlas_doc_format: Option<AtlasDocBody>
  view: Option<ViewBody>

StorageBody:
  value: String
  representation: "storage"

AtlasDocBody:
  value: String  // JSON ADF
  representation: "atlas_doc_format"
```

### 3.3 Attachment Types

```
Attachment:
  id: String
  title: String
  media_type: String
  file_size: u64
  created_at: DateTime
  version: Version
  download_link: String
  page_id: String

AttachmentUpload:
  file: Bytes
  filename: String
  media_type: Option<String>
  comment: Option<String>
```

### 3.4 Comment Types

```
Comment:
  id: String
  body: Body
  created_at: DateTime
  version: Version
  author_id: String
  resolved: bool
  inline_properties: Option<InlineProperties>

InlineProperties:
  text_selection: String
  text_selection_match_count: i32
  text_selection_match_index: i32
```

### 3.5 Label Types

```
Label:
  id: String
  name: String
  prefix: LabelPrefix

LabelPrefix:
  | Global
  | My
  | Team
```

### 3.6 Search Types

```
CqlQuery:
  cql: String
  start: u32
  limit: u32
  expand: Vec<String>
  excerpt: Option<ExcerptStrategy>

SearchResult:
  results: Vec<SearchResultItem>
  start: u32
  limit: u32
  size: u32
  total_size: Option<u32>
  cql_query: String

SearchResultItem:
  content: ContentSummary
  title: String
  excerpt: Option<String>
  url: String
  last_modified: DateTime
  friendly_last_modified: String
```

### 3.7 Template Types

```
Template:
  id: String
  name: String
  description: Option<String>
  template_type: TemplateType
  body: Body
  labels: Vec<Label>
  space: Option<SpaceRef>

TemplateType:
  | Page
  | BlogPost
```

### 3.8 Webhook Types

```
Webhook:
  id: String
  name: String
  url: String
  events: Vec<WebhookEvent>
  status: WebhookStatus
  secret: Option<String>

WebhookEvent:
  | PageCreated
  | PageUpdated
  | PageRemoved
  | PageRestored
  | PageTrashed
  | CommentCreated
  | CommentUpdated
  | CommentRemoved
  | AttachmentCreated
  | AttachmentUpdated
  | AttachmentRemoved
  | LabelAdded
  | LabelRemoved

WebhookPayload:
  webhook_event: WebhookEvent
  timestamp: DateTime
  user_account_id: String
  content: Option<ContentSummary>
  space: Option<SpaceRef>
```

---

## 4. Configuration

```
ConfluenceConfig:
  # Authentication
  cloud_id: String
  auth: AuthConfig

  # API settings
  api_version: String       # Default: "v2" (Confluence Cloud REST API v2)
  base_url: Option<String>  # Override for testing

  # Resilience
  max_retries: u32          # Default: 3
  request_timeout_ms: u64   # Default: 30000

  # Rate limiting
  requests_per_second: f64  # Default: 10 (Confluence limit varies)

  # Content settings
  default_body_format: BodyFormat  # Default: Storage
  expand_by_default: Vec<String>   # Default: ["body.storage", "version"]

  # Attachment settings
  max_attachment_size_mb: u32  # Default: 100

AuthConfig:
  | ApiToken { email: String, token: SecretString }
  | OAuth2 { access_token: SecretString, refresh_token: Option<SecretString> }
  | PersonalAccessToken { token: SecretString }
```

---

## 5. Error Taxonomy

| Error Type | HTTP Status | Retryable | Description |
|------------|-------------|-----------|-------------|
| `SpaceNotFound` | 404 | No | Space does not exist |
| `PageNotFound` | 404 | No | Page does not exist |
| `AttachmentNotFound` | 404 | No | Attachment not found |
| `AccessDenied` | 403 | No | Insufficient permissions |
| `Unauthorized` | 401 | No | Invalid authentication |
| `VersionConflict` | 409 | Yes* | Page modified since fetch |
| `TitleConflict` | 409 | No | Page title exists in space |
| `RateLimited` | 429 | Yes | API rate limit exceeded |
| `InvalidContent` | 400 | No | Malformed content body |
| `InvalidCql` | 400 | No | Invalid CQL query |
| `AttachmentTooLarge` | 413 | No | Attachment exceeds limit |
| `ServiceUnavailable` | 503 | Yes | Confluence unavailable |

*Retry with fresh version number

---

## 6. Rate Limits and Quotas

| Limit | Value | Scope |
|-------|-------|-------|
| API requests | ~10/sec | Per user/token |
| Attachment size | 100 MB | Per file |
| Page body size | 1 MB | Storage format |
| CQL results | 1000 | Per query max |
| Concurrent requests | 5 | Recommended |

---

## 7. Security Requirements

### 7.1 Credential Protection
- API tokens stored via `SecretString`
- OAuth tokens encrypted at rest
- Token refresh handled by `atlassian/auth`
- Webhook secrets validated with HMAC

### 7.2 Content Security
- Page content not logged (may contain sensitive data)
- User account IDs hashed in logs
- Attachment content streamed, not buffered
- CQL queries sanitized

### 7.3 Access Scoping
- Required scopes:
  - `read:confluence-content.all`
  - `write:confluence-content`
  - `read:confluence-space.summary`
- Support for read-only mode
- Per-space access checking

---

## 8. Simulation Requirements

### 8.1 MockConfluenceClient
- Simulate all API operations
- Configurable space/page states
- Inject errors for testing
- Track operation history

### 8.2 Content Replay
- Record API interactions
- Replay for regression testing
- Capture version sequences

### 8.3 Local Content Model
- In-memory page hierarchy
- Apply updates locally
- Version tracking

---

## 9. Integration Points

### 9.1 Shared Modules

```
atlassian/auth:
  - get_access_token() -> AccessToken
  - refresh_token() -> AccessToken
  - validate_webhook_signature(payload, signature) -> bool

shared/resilience:
  - RetryPolicy for transient errors
  - CircuitBreaker per instance
  - RateLimiter (10 req/sec)

shared/observability:
  - Metrics: confluence.operations, confluence.latency
  - Traces: span per operation
  - Logs: structured, content-redacted

shared/vector-memory:
  - store_page_embedding(page_id, content)
  - search_similar_pages(query)
```

### 9.2 Related Integrations

```
atlassian/jira:
  - Linked issues
  - Smart links

atlassian/bitbucket:
  - Code snippets
  - Repository links
```

---

## 10. API Version and Compatibility

| Component | Version | Notes |
|-----------|---------|-------|
| Confluence Cloud REST API | v2 | Primary (modern) |
| Confluence Cloud REST API | v1 | Fallback for some ops |
| CQL | 2023+ | Search query language |
| ADF | 1.0 | Atlas Document Format |

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-confluence.md | Complete |
| 2. Pseudocode | pseudocode-confluence.md | Pending |
| 3. Architecture | architecture-confluence.md | Pending |
| 4. Refinement | refinement-confluence.md | Pending |
| 5. Completion | completion-confluence.md | Pending |

---

*Phase 1: Specification - Complete*
