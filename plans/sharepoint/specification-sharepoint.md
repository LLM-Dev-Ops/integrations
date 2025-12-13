# SharePoint Integration Module - Specification

**SPARC Phase 1: Specification**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/microsoft/sharepoint`

---

## 1. Overview

### 1.1 Purpose

Provide a thin adapter layer enabling the LLM Dev Ops platform to interact with SharePoint Online for document libraries, lists, and collaborative content workflows including knowledge bases, governance artifacts, configuration records, and simulation inputs/outputs.

### 1.2 Scope

**In Scope:**
- Site and subsite navigation
- Document library operations (CRUD, upload, download)
- List operations (items, views, fields)
- File/folder management with metadata
- Version history access
- Permission checking (read-only)
- Content type handling
- Search within sites
- Webhooks for change notifications
- Simulation and replay of interactions

**Out of Scope:**
- Microsoft 365 tenant configuration
- Site provisioning and templates
- Permission management (grant/revoke)
- SharePoint admin operations
- Power Automate/Flow integration
- SharePoint Framework (SPFx) extensions
- Core orchestration logic

### 1.3 Thin Adapter Principle

| Concern | Delegation |
|---------|------------|
| OAuth2/Azure AD authentication | `azure/auth` module |
| Retry with backoff | `shared/resilience` |
| Circuit breaker | `shared/resilience` |
| Metrics emission | `shared/observability` |
| Distributed tracing | `shared/observability` |
| Structured logging | `shared/observability` |
| Vector embeddings | `shared/vector-memory` |

---

## 2. API Operations

### 2.1 SiteService

| Operation | Method | Description |
|-----------|--------|-------------|
| `get_site` | GET | Get site by URL or ID |
| `list_subsites` | GET | List subsites of a site |
| `get_site_properties` | GET | Get site metadata and settings |
| `search_sites` | GET | Search for sites by query |

### 2.2 DocumentLibraryService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_libraries` | GET | List document libraries in site |
| `get_library` | GET | Get library by name or ID |
| `get_library_items` | GET | List items in library with pagination |
| `get_item` | GET | Get single item by ID or path |
| `create_folder` | POST | Create folder in library |
| `upload_file` | PUT | Upload file to library |
| `download_file` | GET | Download file content |
| `update_file` | PUT | Update existing file |
| `delete_item` | DELETE | Delete file or folder |
| `copy_item` | POST | Copy file/folder to destination |
| `move_item` | POST | Move file/folder to destination |

### 2.3 ListService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_lists` | GET | List all lists in site |
| `get_list` | GET | Get list by name or ID |
| `get_list_items` | GET | Get items with optional filter/expand |
| `get_list_item` | GET | Get single item by ID |
| `create_list_item` | POST | Create new list item |
| `update_list_item` | PATCH | Update list item fields |
| `delete_list_item` | DELETE | Delete list item |
| `get_list_fields` | GET | Get list field definitions |
| `get_list_views` | GET | Get list views |

### 2.4 VersionService

| Operation | Method | Description |
|-----------|--------|-------------|
| `list_versions` | GET | List file versions |
| `get_version` | GET | Get specific version metadata |
| `get_version_content` | GET | Download version content |
| `restore_version` | POST | Restore file to previous version |
| `delete_version` | DELETE | Delete specific version |

### 2.5 MetadataService

| Operation | Method | Description |
|-----------|--------|-------------|
| `get_item_metadata` | GET | Get item metadata/properties |
| `update_item_metadata` | PATCH | Update item metadata |
| `get_content_types` | GET | List content types |
| `get_content_type` | GET | Get content type definition |
| `get_columns` | GET | Get site/list columns |

### 2.6 SearchService

| Operation | Method | Description |
|-----------|--------|-------------|
| `search` | POST | Search SharePoint content |
| `search_files` | POST | Search files with filters |
| `search_list_items` | POST | Search list items |
| `get_search_suggestions` | GET | Get search suggestions |

### 2.7 WebhookService

| Operation | Method | Description |
|-----------|--------|-------------|
| `create_subscription` | POST | Create webhook subscription |
| `list_subscriptions` | GET | List active subscriptions |
| `update_subscription` | PATCH | Extend subscription expiry |
| `delete_subscription` | DELETE | Remove subscription |
| `process_notification` | - | Handle incoming webhook |

### 2.8 PermissionService

| Operation | Method | Description |
|-----------|--------|-------------|
| `get_effective_permissions` | GET | Get user's effective permissions |
| `check_permission` | GET | Check specific permission |
| `list_role_assignments` | GET | List role assignments (read-only) |

---

## 3. Core Types

### 3.1 Site Types

```
Site:
  id: String
  url: String
  title: String
  description: Option<String>
  web_template: String
  created: DateTime
  last_modified: DateTime
  owner: User
  is_hub_site: bool
  hub_site_id: Option<String>

SubsiteInfo:
  id: String
  url: String
  title: String
  web_template: String
```

### 3.2 Document Library Types

```
DocumentLibrary:
  id: String
  name: String
  title: String
  description: Option<String>
  item_count: u32
  created: DateTime
  last_modified: DateTime
  root_folder: Folder
  content_types_enabled: bool
  versioning_enabled: bool
  major_version_limit: Option<u32>

DriveItem:
  id: String
  name: String
  path: String
  size: u64
  created: DateTime
  last_modified: DateTime
  created_by: User
  modified_by: User
  content_type: Option<ContentType>
  e_tag: String
  item_type: DriveItemType
  web_url: String
  download_url: Option<String>

DriveItemType:
  | File(FileInfo)
  | Folder(FolderInfo)

FileInfo:
  mime_type: String
  size: u64
  hashes: Option<FileHashes>

FolderInfo:
  child_count: u32

Folder:
  id: String
  name: String
  path: String
  web_url: String
  item_count: u32
```

### 3.3 List Types

```
List:
  id: String
  name: String
  title: String
  description: Option<String>
  item_count: u32
  list_template: ListTemplate
  created: DateTime
  last_modified: DateTime
  content_types_enabled: bool
  hidden: bool

ListTemplate:
  | GenericList
  | DocumentLibrary
  | Survey
  | Links
  | Announcements
  | Contacts
  | Events
  | Tasks
  | DiscussionBoard
  | PictureLibrary
  | CustomList(i32)

ListItem:
  id: String
  fields: Map<String, FieldValue>
  created: DateTime
  last_modified: DateTime
  created_by: User
  modified_by: User
  content_type: Option<ContentType>
  e_tag: String

FieldValue:
  | Text(String)
  | Number(f64)
  | Boolean(bool)
  | DateTime(DateTime)
  | Lookup(LookupValue)
  | User(UserValue)
  | MultiChoice(Vec<String>)
  | Url(UrlValue)
  | Taxonomy(TaxonomyValue)
  | Null

ListField:
  id: String
  name: String
  internal_name: String
  display_name: String
  field_type: FieldType
  required: bool
  read_only: bool
  default_value: Option<FieldValue>

FieldType:
  | Text
  | Note
  | Number
  | Currency
  | DateTime
  | Boolean
  | Choice
  | Lookup
  | User
  | Url
  | Taxonomy
  | Calculated
```

### 3.4 Version Types

```
FileVersion:
  id: String
  version_label: String
  is_current: bool
  size: u64
  created: DateTime
  created_by: User
  comment: Option<String>

VersionHistory:
  versions: Vec<FileVersion>
  current_version: String
```

### 3.5 Content Types

```
ContentType:
  id: String
  name: String
  description: Option<String>
  group: String
  hidden: bool
  read_only: bool
  parent_id: Option<String>

Column:
  id: String
  name: String
  display_name: String
  column_type: ColumnType
  description: Option<String>
  required: bool
  indexed: bool
```

### 3.6 Search Types

```
SearchQuery:
  query_text: String
  select_properties: Vec<String>
  refinement_filters: Vec<String>
  sort_list: Vec<SortSpec>
  row_limit: u32
  start_row: u32
  source_id: Option<String>

SearchResult:
  total_rows: u32
  rows: Vec<SearchRow>
  refinement_results: Vec<RefinementResult>
  elapsed_time: Duration

SearchRow:
  rank: u32
  doc_id: String
  title: String
  path: String
  author: Option<String>
  last_modified: Option<DateTime>
  size: Option<u64>
  properties: Map<String, String>
```

### 3.7 Webhook Types

```
Subscription:
  id: String
  resource: String
  notification_url: String
  expiration_date_time: DateTime
  client_state: Option<String>

WebhookNotification:
  subscription_id: String
  client_state: Option<String>
  resource: String
  change_type: ChangeType
  resource_data: ResourceData

ChangeType:
  | Created
  | Updated
  | Deleted
  | Renamed
  | Moved
```

---

## 4. Configuration

```
SharePointConfig:
  # Authentication (delegated to azure/auth)
  tenant_id: String
  client_id: String
  credentials: CredentialSource

  # Site context
  site_url: Option<String>  # Default site URL

  # API settings
  api_version: String       # Default: "v1.0"
  use_graph_api: bool       # Default: true (vs REST API)

  # Resilience
  max_retries: u32          # Default: 3
  request_timeout_ms: u64   # Default: 30000

  # Rate limiting
  requests_per_minute: u32  # Default: 600

  # Upload settings
  chunk_size_bytes: usize   # Default: 10MB
  large_file_threshold: usize  # Default: 4MB

  # Webhook settings
  webhook_endpoint: Option<String>
  webhook_secret: Option<SecretString>

CredentialSource:
  | ClientSecret(SecretString)
  | Certificate(PathBuf, SecretString)
  | ManagedIdentity
  | InteractiveBrowser
```

---

## 5. Error Taxonomy

| Error Type | HTTP Status | Retryable | Description |
|------------|-------------|-----------|-------------|
| `SiteNotFound` | 404 | No | Site does not exist |
| `LibraryNotFound` | 404 | No | Document library not found |
| `ListNotFound` | 404 | No | List not found |
| `ItemNotFound` | 404 | No | Item/file not found |
| `AccessDenied` | 403 | No | Insufficient permissions |
| `Unauthorized` | 401 | No | Authentication failed |
| `ItemLocked` | 423 | Yes* | Item checked out by another user |
| `VersionConflict` | 409 | Yes* | ETag mismatch |
| `QuotaExceeded` | 507 | No | Storage quota exceeded |
| `RateLimited` | 429 | Yes | Throttled by SharePoint |
| `InvalidRequest` | 400 | No | Malformed request |
| `FieldValidation` | 400 | No | Field value validation failed |
| `ServiceUnavailable` | 503 | Yes | Temporary unavailability |

*Retry with fresh state

---

## 6. Rate Limits and Quotas

| Limit | Value | Scope |
|-------|-------|-------|
| API requests | 600/min | Per app + user |
| Search requests | 500/min | Per tenant |
| Upload file size | 250 GB | Per file |
| Webhook subscriptions | 10,000 | Per tenant |
| Webhook expiry | 30 days | Per subscription |
| List item threshold | 5,000 | View/query threshold |
| Large list threshold | 20,000,000 | Items per list |

---

## 7. Security Requirements

### 7.1 Credential Protection
- OAuth tokens stored via `SecretString`
- Client secrets never logged
- Certificate private keys protected
- Token refresh handled by `azure/auth`

### 7.2 Content Security
- File content not logged (may contain sensitive data)
- List item field values redacted in logs
- Search queries sanitized before logging
- Webhook secrets validated

### 7.3 Access Scoping
- Minimum required Graph scopes:
  - `Sites.Read.All` / `Sites.ReadWrite.All`
  - `Files.Read.All` / `Files.ReadWrite.All`
- Support for site-specific permissions
- Permission checking before operations

---

## 8. Simulation Requirements

### 8.1 MockSharePointClient
- Simulate all API operations
- Configurable site/library states
- Inject errors for testing
- Track operation history

### 8.2 Interaction Replay
- Record API interactions
- Replay for regression testing
- Capture file upload/download sequences

### 8.3 Local Content Model
- In-memory site/library representation
- Apply changes locally for validation
- Version history simulation

---

## 9. Integration Points

### 9.1 Shared Modules

```
azure/auth:
  - get_access_token(scopes) -> AccessToken
  - get_graph_token() -> AccessToken
  - refresh_token() -> AccessToken

shared/resilience:
  - RetryPolicy for transient errors
  - CircuitBreaker per site/endpoint
  - RateLimiter (600 req/min)

shared/observability:
  - Metrics: sharepoint.operations, sharepoint.latency
  - Traces: span per operation
  - Logs: structured, content-redacted

shared/vector-memory:
  - store_document_embedding(item_id, content)
  - search_similar_documents(query)
```

### 9.2 Related Integrations

```
microsoft/graph:
  - Shared authentication
  - User resolution

microsoft/teams:
  - Team site linking
  - Channel file sharing

azure/blob-storage:
  - Large file staging
  - Backup/archive
```

---

## 10. API Version and Compatibility

| Component | Version | Notes |
|-----------|---------|-------|
| Microsoft Graph API | v1.0 | Primary API |
| SharePoint REST API | 2019+ | Fallback for specific operations |
| OAuth 2.0 | RFC 6749 | Via azure/auth |
| OData | 4.0 | Query syntax |

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-sharepoint.md | Complete |
| 2. Pseudocode | pseudocode-sharepoint.md | Pending |
| 3. Architecture | architecture-sharepoint.md | Pending |
| 4. Refinement | refinement-sharepoint.md | Pending |
| 5. Completion | completion-sharepoint.md | Pending |

---

*Phase 1: Specification - Complete*
