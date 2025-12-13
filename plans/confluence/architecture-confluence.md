# Confluence Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/atlassian/confluence`

---

## 1. System Context (C4 Level 1)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         LLM Dev Ops Platform                            │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    Orchestration Layer                            │  │
│  │  - Workflow execution                                             │  │
│  │  - Knowledge retrieval                                            │  │
│  │  - Document generation                                            │  │
│  └───────────────────────────┬──────────────────────────────────────┘  │
│                              │                                          │
│  ┌───────────────────────────▼──────────────────────────────────────┐  │
│  │              Confluence Integration Module                        │  │
│  │  - Thin adapter layer                                             │  │
│  │  - Page/Space management                                          │  │
│  │  - Version tracking                                               │  │
│  │  - Content operations                                             │  │
│  └───────────────────────────┬──────────────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────────────┘
                               │
                               │ HTTPS/REST
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Atlassian Confluence Cloud                         │
│  - REST API v2                                                          │
│  - CQL Search                                                           │
│  - Webhooks                                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Container Diagram (C4 Level 2)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        Confluence Integration Module                        │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐            │
│  │  SpaceService   │  │   PageService   │  │ ContentService  │            │
│  │                 │  │                 │  │                 │            │
│  │ - list_spaces   │  │ - get_page      │  │ - get_body      │            │
│  │ - get_space     │  │ - create_page   │  │ - update_body   │            │
│  │ - get_content   │  │ - update_page   │  │ - convert       │            │
│  └────────┬────────┘  │ - delete_page   │  │ - extract_text  │            │
│           │           │ - move_page     │  └────────┬────────┘            │
│           │           └────────┬────────┘           │                     │
│           │                    │                    │                     │
│  ┌────────┴────────┐  ┌────────┴────────┐  ┌───────┴─────────┐           │
│  │ VersionService  │  │AttachmentService│  │  LabelService   │           │
│  │                 │  │                 │  │                 │           │
│  │ - list_versions │  │ - upload        │  │ - add_label     │           │
│  │ - get_version   │  │ - download      │  │ - remove_label  │           │
│  │ - compare       │  │ - list          │  │ - get_by_label  │           │
│  │ - restore       │  │ - delete        │  │                 │           │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘           │
│           │                    │                    │                     │
│  ┌────────┴────────┐  ┌────────┴────────┐  ┌───────┴─────────┐           │
│  │ CommentService  │  │  SearchService  │  │ TemplateService │           │
│  │                 │  │                 │  │                 │           │
│  │ - create        │  │ - search_cql    │  │ - list          │           │
│  │ - list          │  │ - search_text   │  │ - get           │           │
│  │ - resolve       │  │ - recent        │  │ - create_from   │           │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘           │
│           │                    │                    │                     │
│           └────────────────────┼────────────────────┘                     │
│                                │                                          │
│  ┌─────────────────────────────▼─────────────────────────────────────┐   │
│  │                     ConfluenceClient (Core)                        │   │
│  │  - Request execution                                               │   │
│  │  - Response parsing                                                │   │
│  │  - Error mapping                                                   │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                │                                          │
│  ┌─────────────────────────────▼─────────────────────────────────────┐   │
│  │                      WebhookService                                │   │
│  │  - Receive events                                                  │   │
│  │  - Validate signatures                                             │   │
│  │  - Dispatch handlers                                               │   │
│  └───────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────┘
                                │
      ┌─────────────────────────┼─────────────────────────┐
      ▼                         ▼                         ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│ atlassian/auth│      │shared/resilien│      │shared/observab│
│               │      │               │      │               │
│ - OAuth2      │      │ - Retry       │      │ - Metrics     │
│ - API Token   │      │ - Circuit     │      │ - Tracing     │
│ - Webhook sig │      │ - Rate limit  │      │ - Logging     │
└───────────────┘      └───────────────┘      └───────────────┘
```

---

## 3. Component Diagram (C4 Level 3)

### 3.1 Core Client Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          ConfluenceClient                               │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        RequestExecutor                           │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │   │
│  │  │AuthIntercepto│  │RetryIntercept│  │MetricsInterc │          │   │
│  │  │   - Token    │  │  - Backoff   │  │  - Latency   │          │   │
│  │  │   - Refresh  │  │  - Jitter    │  │  - Counters  │          │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │   │
│  │         └─────────────────┼─────────────────┘                   │   │
│  │                           ▼                                      │   │
│  │              ┌──────────────────────┐                           │   │
│  │              │     HttpTransport    │                           │   │
│  │              │  - Connection pool   │                           │   │
│  │              │  - Timeout handling  │                           │   │
│  │              └──────────────────────┘                           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      ResponseParser                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │   │
│  │  │  JsonParser  │  │ ErrorMapper  │  │ TypeRegistry │          │   │
│  │  │  - Serde     │  │  - Status    │  │  - Space     │          │   │
│  │  │  - Streaming │  │  - Body      │  │  - Page      │          │   │
│  │  └──────────────┘  └──────────────┘  │  - Content   │          │   │
│  │                                       └──────────────┘          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                       ConfigManager                              │   │
│  │  - Cloud ID resolution                                           │   │
│  │  - API version selection                                         │   │
│  │  - Default parameter management                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Content Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Content Processing Pipeline                        │
│                                                                         │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐    ┌───────────┐     │
│  │  Input    │───▶│  Parser   │───▶│Transformer│───▶│  Output   │     │
│  │           │    │           │    │           │    │           │     │
│  │ - Storage │    │ - XML     │    │ - Format  │    │ - Storage │     │
│  │ - Wiki    │    │ - JSON    │    │ - Extract │    │ - View    │     │
│  │ - ADF     │    │ - ADF     │    │ - Embed   │    │ - Text    │     │
│  └───────────┘    └───────────┘    └───────────┘    └───────────┘     │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      StorageFormatParser                         │   │
│  │  - XHTML parsing                                                 │   │
│  │  - Macro extraction                                              │   │
│  │  - Entity handling                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     AtlasDocFormatParser                         │   │
│  │  - JSON document model                                           │   │
│  │  - Node traversal                                                │   │
│  │  - Mark processing                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow Diagrams

### 4.1 Page Create Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Client   │     │  Page    │     │ Request  │     │   Auth   │     │Confluence│
│          │     │ Service  │     │ Executor │     │ Provider │     │   API    │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │                │
     │ create_page()  │                │                │                │
     │───────────────▶│                │                │                │
     │                │                │                │                │
     │                │ validate()     │                │                │
     │                │───────────────▶│                │                │
     │                │                │                │                │
     │                │ format_body()  │                │                │
     │                │───────────────▶│                │                │
     │                │                │                │                │
     │                │                │ get_token()    │                │
     │                │                │───────────────▶│                │
     │                │                │                │                │
     │                │                │     token      │                │
     │                │                │◀───────────────│                │
     │                │                │                │                │
     │                │                │ POST /pages    │                │
     │                │                │───────────────────────────────▶│
     │                │                │                │                │
     │                │                │   201 Created  │                │
     │                │                │◀───────────────────────────────│
     │                │                │                │                │
     │                │  parse_page()  │                │                │
     │                │◀───────────────│                │                │
     │                │                │                │                │
     │      Page      │                │                │                │
     │◀───────────────│                │                │                │
```

### 4.2 Version Comparison Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Client   │     │ Version  │     │ Request  │     │  Diff    │
│          │     │ Service  │     │ Executor │     │  Engine  │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ compare(v1,v2) │                │                │
     │───────────────▶│                │                │
     │                │                │                │
     │                │  ┌─────────────────────────┐    │
     │                │  │   PARALLEL FETCH        │    │
     │                │  │                         │    │
     │                │  │ get_version(v1)         │    │
     │                │  │───────────────▶│        │    │
     │                │  │                │        │    │
     │                │  │ get_version(v2)         │    │
     │                │  │───────────────▶│        │    │
     │                │  │                │        │    │
     │                │  │    v1 content  │        │    │
     │                │  │◀───────────────│        │    │
     │                │  │                │        │    │
     │                │  │    v2 content  │        │    │
     │                │  │◀───────────────│        │    │
     │                │  └─────────────────────────┘    │
     │                │                │                │
     │                │ extract_text() │                │
     │                │───────────────▶│                │
     │                │                │                │
     │                │           compute_diff()        │
     │                │───────────────────────────────▶│
     │                │                │                │
     │                │              VersionDiff        │
     │                │◀───────────────────────────────│
     │                │                │                │
     │  VersionDiff   │                │                │
     │◀───────────────│                │                │
```

### 4.3 Webhook Processing Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│Confluence│     │ Webhook  │     │   Auth   │     │ Event    │
│  Cloud   │     │ Handler  │     │ Module   │     │ Dispatch │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                │
     │ POST /webhook  │                │                │
     │───────────────▶│                │                │
     │                │                │                │
     │                │ validate_sig() │                │
     │                │───────────────▶│                │
     │                │                │                │
     │                │     valid      │                │
     │                │◀───────────────│                │
     │                │                │                │
     │                │ parse_event()  │                │
     │                │────────────────┤                │
     │                │                │                │
     │                │    dispatch()  │                │
     │                │───────────────────────────────▶│
     │                │                │                │
     │                │                │     handler()  │
     │                │                │───────────────▶│
     │                │                │                │
     │   200 OK       │                │                │
     │◀───────────────│                │                │
```

---

## 5. Module Structure

### 5.1 Rust Crate Structure

```
integrations/atlassian/confluence/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Public exports
│   ├── client.rs                 # ConfluenceClient
│   ├── config.rs                 # Configuration types
│   ├── error.rs                  # Error types
│   │
│   ├── services/
│   │   ├── mod.rs
│   │   ├── space.rs              # SpaceService
│   │   ├── page.rs               # PageService
│   │   ├── content.rs            # ContentService
│   │   ├── version.rs            # VersionService
│   │   ├── attachment.rs         # AttachmentService
│   │   ├── label.rs              # LabelService
│   │   ├── comment.rs            # CommentService
│   │   ├── search.rs             # SearchService
│   │   ├── template.rs           # TemplateService
│   │   └── webhook.rs            # WebhookService
│   │
│   ├── types/
│   │   ├── mod.rs
│   │   ├── space.rs              # Space, SpaceType, SpaceStatus
│   │   ├── page.rs               # Page, ContentStatus, Version
│   │   ├── body.rs               # Body, StorageBody, AtlasDocBody
│   │   ├── attachment.rs         # Attachment, AttachmentUpload
│   │   ├── comment.rs            # Comment, InlineProperties
│   │   ├── label.rs              # Label, LabelPrefix
│   │   ├── search.rs             # CqlQuery, SearchResult
│   │   ├── template.rs           # Template, TemplateType
│   │   └── webhook.rs            # Webhook, WebhookEvent
│   │
│   ├── content/
│   │   ├── mod.rs
│   │   ├── storage.rs            # Storage format parser
│   │   ├── adf.rs                # Atlas Document Format
│   │   ├── converter.rs          # Format conversion
│   │   └── extractor.rs          # Text extraction
│   │
│   ├── transport/
│   │   ├── mod.rs
│   │   ├── executor.rs           # Request execution
│   │   ├── interceptors.rs       # Auth, retry, metrics
│   │   └── multipart.rs          # Multipart upload
│   │
│   └── simulation/
│       ├── mod.rs
│       ├── mock_client.rs        # Mock implementation
│       ├── recorder.rs           # Operation recording
│       └── replay.rs             # Replay engine
│
└── tests/
    ├── integration/
    │   ├── space_tests.rs
    │   ├── page_tests.rs
    │   └── webhook_tests.rs
    └── unit/
        ├── content_tests.rs
        └── cql_tests.rs
```

### 5.2 TypeScript Package Structure

```
integrations/atlassian/confluence/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # Public exports
│   ├── client.ts                 # ConfluenceClient
│   ├── config.ts                 # Configuration types
│   ├── errors.ts                 # Error types
│   │
│   ├── services/
│   │   ├── index.ts
│   │   ├── SpaceService.ts
│   │   ├── PageService.ts
│   │   ├── ContentService.ts
│   │   ├── VersionService.ts
│   │   ├── AttachmentService.ts
│   │   ├── LabelService.ts
│   │   ├── CommentService.ts
│   │   ├── SearchService.ts
│   │   ├── TemplateService.ts
│   │   └── WebhookService.ts
│   │
│   ├── types/
│   │   ├── index.ts
│   │   ├── space.ts
│   │   ├── page.ts
│   │   ├── body.ts
│   │   ├── attachment.ts
│   │   ├── comment.ts
│   │   ├── label.ts
│   │   ├── search.ts
│   │   ├── template.ts
│   │   └── webhook.ts
│   │
│   ├── content/
│   │   ├── index.ts
│   │   ├── StorageParser.ts
│   │   ├── AdfParser.ts
│   │   ├── Converter.ts
│   │   └── TextExtractor.ts
│   │
│   └── simulation/
│       ├── index.ts
│       ├── MockClient.ts
│       ├── Recorder.ts
│       └── Replayer.ts
│
└── tests/
    ├── services/
    └── content/
```

---

## 6. Interface Contracts

### 6.1 Service Trait (Rust)

```rust
#[async_trait]
pub trait PageServiceTrait: Send + Sync {
    async fn get_page(&self, page_id: &str, options: GetPageOptions)
        -> Result<Page, ConfluenceError>;

    async fn get_page_by_title(&self, space_id: &str, title: &str)
        -> Result<Page, ConfluenceError>;

    async fn create_page(&self, request: CreatePageRequest)
        -> Result<Page, ConfluenceError>;

    async fn update_page(&self, request: UpdatePageRequest)
        -> Result<Page, ConfluenceError>;

    async fn delete_page(&self, page_id: &str, purge: bool)
        -> Result<(), ConfluenceError>;

    async fn get_children(&self, page_id: &str, options: PaginationOptions)
        -> Result<PageList, ConfluenceError>;

    async fn move_page(&self, page_id: &str, target: &str, position: MovePosition)
        -> Result<Page, ConfluenceError>;
}
```

### 6.2 Service Interface (TypeScript)

```typescript
interface IPageService {
    getPage(pageId: string, options?: GetPageOptions): Promise<Page>;
    getPageByTitle(spaceId: string, title: string): Promise<Page>;
    createPage(request: CreatePageRequest): Promise<Page>;
    updatePage(request: UpdatePageRequest): Promise<Page>;
    deletePage(pageId: string, purge?: boolean): Promise<void>;
    getChildren(pageId: string, options?: PaginationOptions): Promise<PageList>;
    movePage(pageId: string, target: string, position: MovePosition): Promise<Page>;
}
```

---

## 7. Caching Architecture

### 7.1 Cache Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Cache Architecture                            │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Request-Level Cache                          │   │
│  │  - Deduplication of concurrent requests                          │   │
│  │  - Same page fetched in parallel → single request                │   │
│  │  - TTL: Duration of request                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                │                                        │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Session-Level Cache                          │   │
│  │  - Space metadata (5 min TTL)                                    │   │
│  │  - Template list (10 min TTL)                                    │   │
│  │  - Label mappings (5 min TTL)                                    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                │                                        │
│                                ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      No-Cache Layer                              │   │
│  │  - Page content (always fresh)                                   │   │
│  │  - Version data (always fresh)                                   │   │
│  │  - Search results (always fresh)                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Cache Invalidation

```
Event                          → Invalidation
─────────────────────────────────────────────────
Webhook: page_updated          → Clear page cache entry
Webhook: page_removed          → Clear page + children cache
Webhook: space_updated         → Clear space cache
Config change                  → Clear all caches
Token refresh                  → Preserve caches
```

---

## 8. Resilience Architecture

### 8.1 Retry Strategy

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Retry Configuration                            │
│                                                                         │
│  Transient Errors (Retry with backoff):                                │
│  ├── 429 Rate Limited         → Retry after Retry-After header         │
│  ├── 500 Internal Error       → Exponential backoff (1s, 2s, 4s)       │
│  ├── 502 Bad Gateway          → Exponential backoff                    │
│  ├── 503 Service Unavailable  → Exponential backoff                    │
│  └── 504 Gateway Timeout      → Exponential backoff                    │
│                                                                         │
│  Permanent Errors (No retry):                                          │
│  ├── 400 Bad Request          → InvalidContent/InvalidCql              │
│  ├── 401 Unauthorized         → Unauthorized                           │
│  ├── 403 Forbidden            → AccessDenied                           │
│  ├── 404 Not Found            → *NotFound                              │
│  ├── 409 Conflict             → VersionConflict/TitleConflict          │
│  └── 413 Payload Too Large    → AttachmentTooLarge                     │
│                                                                         │
│  Special Cases:                                                         │
│  └── 409 Version Conflict     → Retry with fresh version if configured │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Circuit Breaker States

```
       ┌──────────────────────────────────────────────────────────┐
       │                                                          │
       ▼                                                          │
┌─────────────┐    5 failures    ┌─────────────┐    timeout     │
│   CLOSED    │─────────────────▶│    OPEN     │────────────────┤
│             │                  │             │                │
│ All requests│                  │Fail fast all│                │
│   allowed   │                  │  requests   │                │
└─────────────┘                  └──────┬──────┘                │
       ▲                                │                        │
       │                                │ 30s timeout            │
       │                                ▼                        │
       │                         ┌─────────────┐                 │
       │         success         │  HALF-OPEN  │    failure     │
       └─────────────────────────│             │─────────────────┘
                                 │Allow 1 test │
                                 │  request    │
                                 └─────────────┘
```

---

## 9. Security Architecture

### 9.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       Authentication Architecture                        │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     atlassian/auth Module                         │  │
│  │                                                                   │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │  │
│  │  │   API Token     │  │     OAuth2      │  │      PAT        │  │  │
│  │  │   Provider      │  │    Provider     │  │   Provider      │  │  │
│  │  │                 │  │                 │  │                 │  │  │
│  │  │ email + token   │  │ access_token    │  │ personal token  │  │  │
│  │  │ Basic auth      │  │ refresh flow    │  │ Bearer auth     │  │  │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │  │
│  │           └────────────────────┼────────────────────┘           │  │
│  │                                ▼                                 │  │
│  │                    ┌─────────────────────┐                      │  │
│  │                    │   AuthProvider      │                      │  │
│  │                    │   (trait/interface) │                      │  │
│  │                    │                     │                      │  │
│  │                    │ get_access_token()  │                      │  │
│  │                    │ refresh_token()     │                      │  │
│  │                    └─────────────────────┘                      │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Content Security Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Content Security Model                             │
│                                                                         │
│  Logging Rules:                                                         │
│  ├── Page content        → NEVER logged                                │
│  ├── Attachment content  → NEVER logged                                │
│  ├── Comment body        → NEVER logged                                │
│  ├── CQL queries         → Logged (may reveal structure)               │
│  ├── Page IDs            → Logged                                      │
│  ├── Space keys          → Logged                                      │
│  └── User account IDs    → Hashed before logging                       │
│                                                                         │
│  Memory Handling:                                                       │
│  ├── Credentials         → SecretString (zeroize on drop)              │
│  ├── Tokens              → SecretString (zeroize on drop)              │
│  ├── Page content        → Standard memory (no special handling)       │
│  └── Attachments         → Streaming (not buffered in memory)          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Observability Integration

### 10.1 Metrics

```
Metric Name                              Type        Labels
────────────────────────────────────────────────────────────────────────
confluence.requests.total                Counter     method, path, status
confluence.requests.duration_ms          Histogram   method, path
confluence.pages.created                 Counter     space_id
confluence.pages.updated                 Counter     space_id
confluence.pages.deleted                 Counter     space_id, purge
confluence.attachments.uploaded          Counter     media_type
confluence.attachments.downloaded        Counter     media_type
confluence.attachments.size_bytes        Histogram   media_type
confluence.search.queries                Counter     -
confluence.search.results                Histogram   -
confluence.webhooks.received             Counter     event_type
confluence.webhooks.processed            Counter     event_type, success
confluence.rate_limit.blocked            Counter     -
confluence.circuit_breaker.state         Gauge       state
```

### 10.2 Tracing Spans

```
Span Name                    Attributes
────────────────────────────────────────────────────────────────────────
confluence.request           method, path, status_code, duration_ms
confluence.page.create       space_id, parent_id, title_length
confluence.page.update       page_id, version, has_body, has_title
confluence.version.compare   page_id, from_version, to_version
confluence.search            cql_hash, limit, result_count
confluence.webhook.process   event_type, content_id
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-confluence.md | Complete |
| 2. Pseudocode | pseudocode-confluence.md | Complete |
| 3. Architecture | architecture-confluence.md | Complete |
| 4. Refinement | refinement-confluence.md | Pending |
| 5. Completion | completion-confluence.md | Pending |

---

*Phase 3: Architecture - Complete*
