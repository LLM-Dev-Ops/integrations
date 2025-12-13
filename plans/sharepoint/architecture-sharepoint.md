# SharePoint Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/microsoft/sharepoint`

---

## 1. System Context (C4 Level 1)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           LLM Dev Ops Platform                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Knowledge    │    │ Governance   │    │ Config       │    │ Simulation   │  │
│  │ Bases        │    │ Artifacts    │    │ Records      │    │ I/O          │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │                   │          │
│         └───────────────────┴─────────┬─────────┴───────────────────┘          │
│                                       │                                         │
│                                       ▼                                         │
│                    ┌─────────────────────────────────────┐                     │
│                    │     SharePoint Integration          │                     │
│                    │         (Thin Adapter)              │                     │
│                    └─────────────────┬───────────────────┘                     │
│                                      │                                          │
└──────────────────────────────────────┼──────────────────────────────────────────┘
                                       │
          ┌────────────────────────────┼────────────────────────────┐
          │                            │                            │
          ▼                            ▼                            ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│ Microsoft Graph │         │   SharePoint    │         │   Azure AD      │
│      API        │         │   REST API      │         │    OAuth2       │
│                 │         │   (Fallback)    │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
          │                            │                            │
          └────────────────────────────┼────────────────────────────┘
                                       │
                                       ▼
                            ┌─────────────────┐
                            │ SharePoint      │
                            │ Online Sites    │
                            └─────────────────┘
```

---

## 2. Container Diagram (C4 Level 2)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       SharePoint Integration Module                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         Public API Layer                                 │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │   │
│  │  │SharePointClient │  │  QueryBuilder   │  │    Type Exports         │  │   │
│  │  │    (Facade)     │  │                 │  │                         │  │   │
│  │  └────────┬────────┘  └─────────────────┘  └─────────────────────────┘  │   │
│  └───────────┼──────────────────────────────────────────────────────────────┘   │
│              │                                                                   │
│  ┌───────────┼──────────────────────────────────────────────────────────────┐   │
│  │           ▼              Service Layer                                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │SiteService  │  │LibraryService│ │ ListService │  │ VersionService  │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │MetadataServ │  │SearchService│  │WebhookService│ │PermissionService│  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘  │   │
│  └─────────┼────────────────┼────────────────┼──────────────────┼───────────┘   │
│            │                │                │                  │               │
│  ┌─────────┼────────────────┼────────────────┼──────────────────┼───────────┐   │
│  │         ▼                ▼                ▼                  ▼           │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │   │
│  │  │                      Transport Layer                             │    │   │
│  │  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │    │   │
│  │  │  │  GraphClient    │  │  AuthProvider   │  │  UploadManager  │  │    │   │
│  │  │  │                 │  │  (azure/auth)   │  │  (Chunked)      │  │    │   │
│  │  │  └────────┬────────┘  └────────┬────────┘  └─────────────────┘  │    │   │
│  │  └───────────┼────────────────────┼────────────────────────────────┘    │   │
│  └──────────────┼────────────────────┼─────────────────────────────────────┘   │
│                 │                    │                                          │
└─────────────────┼────────────────────┼──────────────────────────────────────────┘
                  │                    │
                  ▼                    ▼
       ┌─────────────────┐  ┌─────────────────┐
       │ Microsoft Graph │  │   Azure AD      │
       │      API        │  │                 │
       └─────────────────┘  └─────────────────┘
```

---

## 3. Component Diagram (C4 Level 3)

### 3.1 Service Components

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            SiteService                                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────────┐  │
│  │   SiteResolver   │    │  SubsiteManager  │    │    SiteSearcher          │  │
│  │                  │    │                  │    │                          │  │
│  │  • by_url        │    │  • list_children │    │  • search_by_name        │  │
│  │  • by_id         │    │  • get_hierarchy │    │  • search_by_template    │  │
│  │  • get_root      │    │                  │    │                          │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                         DocumentLibraryService                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────────┐  │
│  │  LibraryManager  │    │   ItemNavigator  │    │     FileOperations       │  │
│  │                  │    │                  │    │                          │  │
│  │  • list_all      │    │  • get_children  │    │  • upload (small/large)  │  │
│  │  • get_by_name   │    │  • navigate_path │    │  • download              │  │
│  │  • get_by_id     │    │  • search        │    │  • copy/move/delete      │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                              ListService                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────────┐  │
│  │   ListManager    │    │   ItemCRUD       │    │     SchemaManager        │  │
│  │                  │    │                  │    │                          │  │
│  │  • list_all      │    │  • create        │    │  • get_fields            │  │
│  │  • get_by_name   │    │  • read/query    │    │  • get_views             │  │
│  │  • get_by_id     │    │  • update/delete │    │  • get_content_types     │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Upload Manager Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            Upload Manager                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         Upload Strategy                                  │   │
│  │                                                                          │   │
│  │   File Size < 4MB          File Size >= 4MB                             │   │
│  │         │                         │                                      │   │
│  │         ▼                         ▼                                      │   │
│  │   ┌─────────────┐          ┌─────────────┐                              │   │
│  │   │SimpleUpload │          │ChunkedUpload│                              │   │
│  │   │             │          │             │                              │   │
│  │   │ PUT content │          │ 1. Create   │                              │   │
│  │   │             │          │    session  │                              │   │
│  │   └─────────────┘          │ 2. Upload   │                              │   │
│  │                            │    chunks   │                              │   │
│  │                            │ 3. Complete │                              │   │
│  │                            └─────────────┘                              │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Chunk Configuration:                                                            │
│  • Default chunk size: 10 MB                                                    │
│  • Max chunk size: 60 MB                                                        │
│  • Retry per chunk: 3 attempts                                                  │
│  • Progress callback support                                                    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow Diagrams

### 4.1 Document Upload Flow

```
┌────────┐   ┌───────────────┐   ┌──────────────┐   ┌─────────────┐   ┌───────────┐
│ Client │   │SharePointClient│  │UploadManager │   │ GraphClient │   │Graph API  │
└───┬────┘   └───────┬───────┘   └──────┬───────┘   └──────┬──────┘   └─────┬─────┘
    │                │                  │                  │                │
    │  upload_file() │                  │                  │                │
    │───────────────>│                  │                  │                │
    │                │                  │                  │                │
    │                │  upload(content) │                  │                │
    │                │─────────────────>│                  │                │
    │                │                  │                  │                │
    │                │                  │  [size > 4MB?]   │                │
    │                │                  │────────┐         │                │
    │                │                  │<───────┘         │                │
    │                │                  │                  │                │
    │                │                  │  createUploadSession              │
    │                │                  │─────────────────────────────────>│
    │                │                  │                  │                │
    │                │                  │<─────────────────────────────────│
    │                │                  │         uploadUrl                 │
    │                │                  │                  │                │
    │                │                  │  FOR each chunk:                  │
    │                │                  │  PUT chunk       │                │
    │                │                  │─────────────────────────────────>│
    │                │                  │                  │                │
    │                │                  │<─────────────────────────────────│
    │                │                  │        202/200                    │
    │                │<─────────────────│                  │                │
    │                │    DriveItem     │                  │                │
    │<───────────────│                  │                  │                │
    │    Result      │                  │                  │                │
```

### 4.2 List Item Query Flow

```
┌────────┐   ┌───────────────┐   ┌─────────────┐   ┌─────────────┐   ┌───────────┐
│ Client │   │SharePointClient│  │ ListService │   │QueryBuilder │   │Graph API  │
└───┬────┘   └───────┬───────┘   └──────┬──────┘   └──────┬──────┘   └─────┬─────┘
    │                │                  │                 │                │
    │ get_list_items(filter, expand)   │                 │                │
    │───────────────>│                  │                 │                │
    │                │                  │                 │                │
    │                │ get_items(opts)  │                 │                │
    │                │─────────────────>│                 │                │
    │                │                  │                 │                │
    │                │                  │ build_odata()   │                │
    │                │                  │────────────────>│                │
    │                │                  │                 │                │
    │                │                  │<────────────────│                │
    │                │                  │  query_params   │                │
    │                │                  │                 │                │
    │                │                  │  GET /lists/{id}/items?$filter=...
    │                │                  │────────────────────────────────>│
    │                │                  │                 │                │
    │                │                  │<────────────────────────────────│
    │                │                  │        ListItemsPage             │
    │                │<─────────────────│                 │                │
    │<───────────────│                  │                 │                │
    │  ListItemsPage │                  │                 │                │
```

### 4.3 Webhook Notification Flow

```
┌───────────┐   ┌──────────────┐   ┌───────────────┐   ┌─────────────────┐
│Graph/SP   │   │ Webhook      │   │ WebhookService│   │NotificationHandler
│ Service   │   │ Endpoint     │   │               │   │                 │
└─────┬─────┘   └──────┬───────┘   └───────┬───────┘   └────────┬────────┘
      │                │                   │                    │
      │ POST notification                  │                    │
      │───────────────>│                   │                    │
      │                │                   │                    │
      │                │ validate_request  │                    │
      │                │──────────┐        │                    │
      │                │<─────────┘        │                    │
      │                │                   │                    │
      │                │ process()         │                    │
      │                │──────────────────>│                    │
      │                │                   │                    │
      │                │                   │ validate_client_state
      │                │                   │────────┐           │
      │                │                   │<───────┘           │
      │                │                   │                    │
      │                │                   │ fetch_resource()   │
      │                │                   │────────┐           │
      │                │                   │<───────┘           │
      │                │                   │                    │
      │                │                   │ on_change()        │
      │                │                   │───────────────────>│
      │                │                   │                    │
      │                │                   │<───────────────────│
      │                │<──────────────────│                    │
      │<───────────────│                   │                    │
      │    200 OK      │                   │                    │
```

---

## 5. Module Structure

### 5.1 Rust Module Layout

```
integrations/
└── microsoft/
    └── sharepoint/
        └── rust/
            ├── Cargo.toml
            ├── README.md
            ├── src/
            │   ├── lib.rs                      # Public exports
            │   ├── client.rs                   # SharePointClient facade
            │   ├── config.rs                   # SharePointConfig
            │   │
            │   ├── services/
            │   │   ├── mod.rs
            │   │   ├── site/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # SiteService
            │   │   │   └── resolver.rs         # URL to site ID resolution
            │   │   ├── library/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # DocumentLibraryService
            │   │   │   ├── upload.rs           # Upload strategies
            │   │   │   └── download.rs         # Download handling
            │   │   ├── list/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # ListService
            │   │   │   └── fields.rs           # Field value handling
            │   │   ├── version/
            │   │   │   ├── mod.rs
            │   │   │   └── service.rs          # VersionService
            │   │   ├── metadata/
            │   │   │   ├── mod.rs
            │   │   │   └── service.rs          # MetadataService
            │   │   ├── search/
            │   │   │   ├── mod.rs
            │   │   │   └── service.rs          # SearchService
            │   │   ├── webhook/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # WebhookService
            │   │   │   └── handler.rs          # Notification handling
            │   │   └── permission/
            │   │       ├── mod.rs
            │   │       └── service.rs          # PermissionService
            │   │
            │   ├── query/
            │   │   ├── mod.rs
            │   │   ├── builder.rs              # OData query builder
            │   │   └── filter.rs               # Filter expressions
            │   │
            │   ├── transport/
            │   │   ├── mod.rs
            │   │   ├── graph.rs                # Graph API client
            │   │   ├── auth.rs                 # Auth integration
            │   │   └── upload_session.rs       # Chunked upload
            │   │
            │   ├── types/
            │   │   ├── mod.rs
            │   │   ├── site.rs                 # Site, SubsiteInfo
            │   │   ├── drive.rs                # DocumentLibrary, DriveItem
            │   │   ├── list.rs                 # List, ListItem, FieldValue
            │   │   ├── version.rs              # FileVersion
            │   │   ├── search.rs               # SearchQuery, SearchResult
            │   │   ├── webhook.rs              # Subscription, Notification
            │   │   └── permission.rs           # Permission types
            │   │
            │   ├── simulation/
            │   │   ├── mod.rs
            │   │   ├── mock_client.rs          # MockSharePointClient
            │   │   ├── site_model.rs           # In-memory site
            │   │   └── replay.rs               # Interaction replay
            │   │
            │   ├── error.rs                    # SharePointError
            │   └── validation.rs               # Input validators
            │
            └── tests/
                ├── unit/
                ├── integration/
                └── fixtures/
```

### 5.2 TypeScript Module Layout

```
integrations/
└── microsoft/
    └── sharepoint/
        └── typescript/
            ├── package.json
            ├── tsconfig.json
            ├── src/
            │   ├── index.ts                    # Public exports
            │   ├── client.ts                   # SharePointClient
            │   ├── config.ts                   # Configuration
            │   │
            │   ├── services/
            │   │   ├── index.ts
            │   │   ├── site.ts
            │   │   ├── library.ts
            │   │   ├── list.ts
            │   │   ├── version.ts
            │   │   ├── metadata.ts
            │   │   ├── search.ts
            │   │   ├── webhook.ts
            │   │   └── permission.ts
            │   │
            │   ├── query/
            │   │   ├── index.ts
            │   │   └── builder.ts
            │   │
            │   ├── types/
            │   │   └── index.ts
            │   │
            │   ├── simulation/
            │   │   ├── index.ts
            │   │   └── mockClient.ts
            │   │
            │   └── error.ts
            │
            └── tests/
```

---

## 6. Integration with Shared Modules

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        SharePoint Integration                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                         ┌─────────────────────┐                                 │
│                         │  SharePointClient   │                                 │
│                         └──────────┬──────────┘                                 │
│                                    │                                            │
│         ┌──────────────────────────┼──────────────────────────┐                │
│         │                          │                          │                 │
│         ▼                          ▼                          ▼                 │
│  ┌─────────────┐           ┌─────────────┐           ┌─────────────┐           │
│  │azure/auth   │           │shared/      │           │shared/      │           │
│  │             │           │resilience   │           │observability│           │
│  │• Graph Token│           │             │           │             │           │
│  │• App-only   │           │• Retry      │           │• Metrics    │           │
│  │• Delegated  │           │• Circuit    │           │• Tracing    │           │
│  │             │           │  Breaker    │           │• Logging    │           │
│  └─────────────┘           └─────────────┘           └─────────────┘           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────┬────────────────────────────────────────────────────────────┐
│ Shared Module      │ Integration Point                                          │
├────────────────────┼────────────────────────────────────────────────────────────┤
│ azure/auth         │ • Graph token: https://graph.microsoft.com/.default        │
│                    │ • App-only for background operations                       │
│                    │ • Delegated for user-context operations                    │
├────────────────────┼────────────────────────────────────────────────────────────┤
│ shared/resilience  │ • RetryPolicy: 429, 500, 502, 503, 504                     │
│                    │ • CircuitBreaker per site endpoint                         │
│                    │ • RateLimiter: 600 req/min                                 │
├────────────────────┼────────────────────────────────────────────────────────────┤
│ shared/observability│ • Metrics: sharepoint.operations, latency, errors        │
│                    │ • Traces: span per API call                                │
│                    │ • Logs: structured, content-redacted                       │
├────────────────────┼────────────────────────────────────────────────────────────┤
│ shared/vector-memory│ • Store document embeddings for search                    │
│                    │ • Index list items for semantic lookup                     │
└────────────────────┴────────────────────────────────────────────────────────────┘
```

---

## 7. Security Architecture

### 7.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Authentication Architecture                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    Credential Sources                                    │   │
│  │                                                                          │   │
│  │   ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐   │   │
│  │   │ Client Secret  │  │  Certificate   │  │   Managed Identity     │   │   │
│  │   │ (SecretString) │  │  (.pfx/.pem)   │  │   (Azure resources)    │   │   │
│  │   └───────┬────────┘  └───────┬────────┘  └───────────┬────────────┘   │   │
│  │           │                   │                       │                │   │
│  │           └───────────────────┴───────────┬───────────┘                │   │
│  │                                           │                            │   │
│  │                                           ▼                            │   │
│  │                            ┌──────────────────────────┐                │   │
│  │                            │       azure/auth         │                │   │
│  │                            │                          │                │   │
│  │                            │  • Token acquisition     │                │   │
│  │                            │  • Automatic refresh     │                │   │
│  │                            │  • Scope validation      │                │   │
│  │                            └──────────────────────────┘                │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Required Graph Scopes:                                                          │
│  • Sites.Read.All / Sites.ReadWrite.All                                         │
│  • Files.Read.All / Files.ReadWrite.All                                         │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Content Security

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      Content Security Policy                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Logging Policy:                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  LOGGED                          │  NEVER LOGGED                        │   │
│  │  ─────────────────────────────── │  ────────────────────────────────    │   │
│  │  • site_id, library_id           │  • File content                      │   │
│  │  • item_id, list_id              │  • List item field values            │   │
│  │  • operation type                │  • Search query content              │   │
│  │  • file size (bytes)             │  • OAuth tokens                      │   │
│  │  • response status               │  • Webhook secrets                   │   │
│  │  • latency                       │  • User emails (hashed only)         │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Download Security:                                                              │
│  • Stream large files to avoid memory exhaustion                                │
│  • Validate content-type before processing                                      │
│  • Scan for malware indicators (optional integration)                           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Error Handling Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Error Classification                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                     Error Categories                                     │   │
│  ├─────────────────────────────────────────────────────────────────────────┤   │
│  │                                                                          │   │
│  │  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐  │   │
│  │  │   Retry     │   │  Fail Fast  │   │  Conflict   │   │  Resource   │  │   │
│  │  │             │   │             │   │             │   │             │  │   │
│  │  │ • 429       │   │ • 400       │   │ • 409 ETag  │   │ • 423 Lock  │  │   │
│  │  │ • 500-504   │   │ • 401       │   │             │   │ • 507 Quota │  │   │
│  │  │ • Timeout   │   │ • 403       │   │             │   │             │  │   │
│  │  │             │   │ • 404       │   │             │   │             │  │   │
│  │  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘  │   │
│  │                                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Circuit Breaker (per site):                                                     │
│  ┌────────┐     5 failures     ┌────────┐     30s timeout    ┌───────────┐     │
│  │ Closed │ ─────────────────> │  Open  │ ─────────────────> │ Half-Open │     │
│  └────────┘                    └────────┘                    └───────────┘     │
│       ▲                                                            │            │
│       └────────────────────────────────────────────────────────────┘            │
│                              success                                             │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Caching Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Caching Strategy                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                      Cache Layers                                        │   │
│  │                                                                          │   │
│  │  ┌────────────────┐   ┌────────────────┐   ┌────────────────────────┐  │   │
│  │  │  Site Cache    │   │ Metadata Cache │   │   Schema Cache         │  │   │
│  │  │                │   │                │   │                        │  │   │
│  │  │ TTL: 5 min     │   │ TTL: 1 min     │   │ TTL: 10 min            │  │   │
│  │  │ Site info      │   │ Item metadata  │   │ List fields            │  │   │
│  │  │ Library list   │   │ Version info   │   │ Content types          │  │   │
│  │  └────────────────┘   └────────────────┘   └────────────────────────┘  │   │
│  │                                                                          │   │
│  │  NOT Cached (always fresh):                                             │   │
│  │  • File content                                                          │   │
│  │  • List item data                                                        │   │
│  │  • Search results                                                        │   │
│  │  • Permission checks                                                     │   │
│  │                                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Cache Invalidation:                                                             │
│  • On webhook notification                                                       │
│  • On write operations to same resource                                         │
│  • Manual flush via client.invalidate_cache()                                   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Testing Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          Test Layer Architecture                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        Unit Tests                                        │   │
│  │  • Service logic with MockSharePointClient                              │   │
│  │  • Query builder OData generation                                       │   │
│  │  • Field value conversion                                               │   │
│  │  • Upload chunking logic                                                │   │
│  │  Coverage Target: >90%                                                  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                     Integration Tests                                    │   │
│  │  • Full flows with wiremock                                             │   │
│  │  • Chunked upload simulation                                            │   │
│  │  • Webhook notification handling                                        │   │
│  │  • Pagination traversal                                                 │   │
│  │  Coverage Target: All API operations                                    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        E2E Tests (Gated)                                 │   │
│  │  • Real SharePoint Online site                                          │   │
│  │  • Requires: App registration, test site                                │   │
│  │  • Gated by: SHAREPOINT_E2E_TESTS=true                                  │   │
│  │  Coverage: Happy paths only                                             │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-sharepoint.md | Complete |
| 2. Pseudocode | pseudocode-sharepoint.md | Complete |
| 3. Architecture | architecture-sharepoint.md | Complete |
| 4. Refinement | refinement-sharepoint.md | Pending |
| 5. Completion | completion-sharepoint.md | Pending |

---

*Phase 3: Architecture - Complete*
