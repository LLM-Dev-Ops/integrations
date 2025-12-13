# Google Docs Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/google/docs`

---

## 1. System Context (C4 Level 1)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           LLM Dev Ops Platform                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Prompt       │    │   Report     │    │   Review     │    │ Collaboration│  │
│  │ Authoring    │    │ Generation   │    │  Workflows   │    │   Agents     │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │                   │          │
│         └───────────────────┴─────────┬─────────┴───────────────────┘          │
│                                       │                                         │
│                                       ▼                                         │
│                    ┌─────────────────────────────────────┐                     │
│                    │     Google Docs Integration         │                     │
│                    │         (Thin Adapter)              │                     │
│                    └─────────────────┬───────────────────┘                     │
│                                      │                                          │
└──────────────────────────────────────┼──────────────────────────────────────────┘
                                       │
          ┌────────────────────────────┼────────────────────────────┐
          │                            │                            │
          ▼                            ▼                            ▼
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  Google Docs    │         │  Google Drive   │         │   Google OAuth  │
│      API        │         │      API        │         │                 │
│  (Documents)    │         │ (Revisions,     │         │  (Auth Tokens)  │
│                 │         │  Comments)      │         │                 │
└─────────────────┘         └─────────────────┘         └─────────────────┘
```

---

## 2. Container Diagram (C4 Level 2)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       Google Docs Integration Module                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         Public API Layer                                 │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │   │
│  │  │   DocsClient    │  │  ContentBuilder │  │    Type Exports         │  │   │
│  │  │    (Facade)     │  │                 │  │                         │  │   │
│  │  └────────┬────────┘  └─────────────────┘  └─────────────────────────┘  │   │
│  └───────────┼──────────────────────────────────────────────────────────────┘   │
│              │                                                                   │
│  ┌───────────┼──────────────────────────────────────────────────────────────┐   │
│  │           ▼              Service Layer                                    │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐   │   │
│  │  │DocumentService  │  │ RevisionService │  │  SuggestionService      │   │   │
│  │  │                 │  │                 │  │                         │   │   │
│  │  │ • get_document  │  │ • list_revisions│  │ • list_suggestions      │   │   │
│  │  │ • batch_update  │  │ • get_revision  │  │ • accept/reject         │   │   │
│  │  │ • create_doc    │  │ • compare       │  │                         │   │   │
│  │  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘   │   │
│  │           │                    │                        │                │   │
│  │  ┌────────┴────────┐  ┌────────┴────────┐  ┌────────────┴────────────┐   │   │
│  │  │ CommentService  │  │NamedRangeService│  │    ExportService        │   │   │
│  │  │                 │  │                 │  │                         │   │   │
│  │  │ • list_comments │  │ • get_range     │  │ • export_pdf            │   │   │
│  │  │ • create/reply  │  │ • update_range  │  │ • export_markdown       │   │   │
│  │  │ • resolve       │  │ • create/delete │  │ • export_docx           │   │   │
│  │  └────────┬────────┘  └────────┬────────┘  └────────────┬────────────┘   │   │
│  └───────────┼────────────────────┼────────────────────────┼────────────────┘   │
│              │                    │                        │                    │
│  ┌───────────┼────────────────────┼────────────────────────┼────────────────┐   │
│  │           ▼                    ▼                        ▼                │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐    │   │
│  │  │                      Transport Layer                             │    │   │
│  │  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │    │   │
│  │  │  │  HttpTransport  │  │  AuthProvider   │  │ RequestBuilder  │  │    │   │
│  │  │  │   (reqwest)     │  │  (google/auth)  │  │                 │  │    │   │
│  │  │  └────────┬────────┘  └────────┬────────┘  └─────────────────┘  │    │   │
│  │  └───────────┼────────────────────┼────────────────────────────────┘    │   │
│  │              │                    │                                      │   │
│  └──────────────┼────────────────────┼──────────────────────────────────────┘   │
│                 │                    │                                          │
└─────────────────┼────────────────────┼──────────────────────────────────────────┘
                  │                    │
                  ▼                    ▼
       ┌─────────────────┐  ┌─────────────────┐
       │ Google Docs/    │  │   Google OAuth  │
       │ Drive APIs      │  │                 │
       └─────────────────┘  └─────────────────┘
```

---

## 3. Component Diagram (C4 Level 3)

### 3.1 Service Components

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            DocumentService                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────────┐  │
│  │  DocumentReader  │    │  BatchUpdater    │    │    DocumentCreator       │  │
│  │                  │    │                  │    │                          │  │
│  │  • get_full      │    │  • validate_req  │    │  • create_empty          │  │
│  │  • get_content   │    │  • apply_batch   │    │  • create_with_content   │  │
│  │  • get_metadata  │    │  • write_control │    │                          │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                            NamedRangeService                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────────┐  │
│  │  RangeManager    │    │  ContentExtractor│    │    ContentUpdater        │  │
│  │                  │    │                  │    │                          │  │
│  │  • create_range  │    │  • extract_text  │    │  • replace_content       │  │
│  │  • delete_range  │    │  • resolve_ranges│    │  • insert_at_range       │  │
│  │  • list_ranges   │    │                  │    │  • delete_range_content  │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                              ExportService                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────────┐  │
│  │  DriveExporter   │    │ MarkdownConverter│    │    PlainTextExtractor    │  │
│  │                  │    │                  │    │                          │  │
│  │  • export_pdf    │    │  • convert_doc   │    │  • extract_text          │  │
│  │  • export_docx   │    │  • format_table  │    │  • strip_formatting      │  │
│  │  • export_html   │    │  • format_list   │    │                          │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Content Builder Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            ContentBuilder                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                         Fluent API                                       │   │
│  │                                                                          │   │
│  │   ContentBuilder::new()                                                  │   │
│  │       .insert_text("Hello", Location::at_start())                       │   │
│  │       .insert_paragraph_break()                                          │   │
│  │       .insert_text("World", Location::at_end())                         │   │
│  │       .apply_style(Range::new(0, 5), TextStyle::bold())                 │   │
│  │       .create_named_range("greeting", Range::new(0, 11))                │   │
│  │       .build() -> Vec<Request>                                          │   │
│  │                                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────────┐  │
│  │  TextOperations  │    │  StyleOperations │    │    StructuralOps         │  │
│  │                  │    │                  │    │                          │  │
│  │  • insert_text   │    │  • bold/italic   │    │  • insert_table          │  │
│  │  • delete_text   │    │  • font_size     │    │  • insert_page_break     │  │
│  │  • replace_all   │    │  • text_color    │    │  • create_header         │  │
│  └──────────────────┘    └──────────────────┘    └──────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow Diagrams

### 4.1 Document Read Flow

```
┌────────┐     ┌─────────────┐     ┌───────────────┐     ┌─────────────────┐
│ Client │     │ DocsClient  │     │DocumentService│     │  Google Docs    │
└───┬────┘     └──────┬──────┘     └───────┬───────┘     └────────┬────────┘
    │                 │                    │                      │
    │  get_document() │                    │                      │
    │────────────────>│                    │                      │
    │                 │                    │                      │
    │                 │  get_document()    │                      │
    │                 │───────────────────>│                      │
    │                 │                    │                      │
    │                 │                    │  GET /documents/{id} │
    │                 │                    │─────────────────────>│
    │                 │                    │                      │
    │                 │                    │<─────────────────────│
    │                 │                    │   Document JSON      │
    │                 │                    │                      │
    │                 │                    │  parse_document()    │
    │                 │                    │────────┐             │
    │                 │                    │<───────┘             │
    │                 │<───────────────────│                      │
    │                 │     Document       │                      │
    │<────────────────│                    │                      │
    │     Document    │                    │                      │
```

### 4.2 Batch Update Flow

```
┌────────┐   ┌─────────────┐   ┌───────────────┐   ┌─────────────┐   ┌───────────┐
│ Client │   │ContentBuilder│  │DocumentService│   │ RateLimiter │   │Google Docs│
└───┬────┘   └──────┬──────┘   └───────┬───────┘   └──────┬──────┘   └─────┬─────┘
    │               │                  │                  │                │
    │  build()      │                  │                  │                │
    │──────────────>│                  │                  │                │
    │               │                  │                  │                │
    │<──────────────│                  │                  │                │
    │  Vec<Request> │                  │                  │                │
    │               │                  │                  │                │
    │  batch_update(requests)          │                  │                │
    │─────────────────────────────────>│                  │                │
    │               │                  │                  │                │
    │               │                  │ acquire_permit() │                │
    │               │                  │─────────────────>│                │
    │               │                  │                  │                │
    │               │                  │<─────────────────│                │
    │               │                  │    permit        │                │
    │               │                  │                  │                │
    │               │                  │  POST batchUpdate                 │
    │               │                  │────────────────────────────────────>
    │               │                  │                  │                │
    │               │                  │<────────────────────────────────────
    │               │                  │   BatchUpdateResponse             │
    │<─────────────────────────────────│                  │                │
    │     Result    │                  │                  │                │
```

### 4.3 Named Range Update Flow

```
┌────────┐   ┌─────────────┐   ┌─────────────────┐   ┌───────────────┐
│ Client │   │ DocsClient  │   │NamedRangeService│   │DocumentService│
└───┬────┘   └──────┬──────┘   └────────┬────────┘   └───────┬───────┘
    │               │                   │                    │
    │ update_range_content("section1", "new text")          │
    │──────────────>│                   │                    │
    │               │                   │                    │
    │               │ update_range()    │                    │
    │               │──────────────────>│                    │
    │               │                   │                    │
    │               │                   │  Build ReplaceNamedRangeContent
    │               │                   │────────┐           │
    │               │                   │<───────┘           │
    │               │                   │                    │
    │               │                   │  batch_update()    │
    │               │                   │───────────────────>│
    │               │                   │                    │
    │               │                   │<───────────────────│
    │               │                   │    Result          │
    │               │<──────────────────│                    │
    │<──────────────│                   │                    │
    │   Result      │                   │                    │
```

---

## 5. Module Structure

### 5.1 Rust Module Layout

```
integrations/
└── google/
    └── docs/
        └── rust/
            ├── Cargo.toml
            ├── README.md
            ├── src/
            │   ├── lib.rs                      # Public exports
            │   ├── client.rs                   # DocsClient facade
            │   ├── config.rs                   # GoogleDocsConfig
            │   │
            │   ├── services/
            │   │   ├── mod.rs
            │   │   ├── document/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # DocumentService
            │   │   │   ├── reader.rs           # Document reading
            │   │   │   └── updater.rs          # Batch updates
            │   │   ├── revision/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # RevisionService
            │   │   │   └── diff.rs             # Revision comparison
            │   │   ├── suggestion/
            │   │   │   ├── mod.rs
            │   │   │   └── service.rs          # SuggestionService
            │   │   ├── comment/
            │   │   │   ├── mod.rs
            │   │   │   └── service.rs          # CommentService
            │   │   ├── named_range/
            │   │   │   ├── mod.rs
            │   │   │   ├── service.rs          # NamedRangeService
            │   │   │   └── extractor.rs        # Content extraction
            │   │   └── export/
            │   │       ├── mod.rs
            │   │       ├── service.rs          # ExportService
            │   │       └── markdown.rs         # Markdown converter
            │   │
            │   ├── builder/
            │   │   ├── mod.rs
            │   │   ├── content.rs              # ContentBuilder
            │   │   ├── request.rs              # Request builders
            │   │   └── style.rs                # Style builders
            │   │
            │   ├── transport/
            │   │   ├── mod.rs
            │   │   ├── http.rs                 # HTTP transport
            │   │   └── auth.rs                 # Auth integration
            │   │
            │   ├── types/
            │   │   ├── mod.rs
            │   │   ├── document.rs             # Document, Body, etc.
            │   │   ├── element.rs              # StructuralElement, etc.
            │   │   ├── request.rs              # Request types
            │   │   ├── response.rs             # Response types
            │   │   ├── comment.rs              # Comment, Reply
            │   │   ├── revision.rs             # Revision types
            │   │   └── style.rs                # TextStyle, ParagraphStyle
            │   │
            │   ├── simulation/
            │   │   ├── mod.rs
            │   │   ├── mock_client.rs          # MockDocsClient
            │   │   ├── document_model.rs       # In-memory document
            │   │   └── replay.rs               # Operation replay
            │   │
            │   ├── error.rs                    # DocsError
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
└── google/
    └── docs/
        └── typescript/
            ├── package.json
            ├── tsconfig.json
            ├── src/
            │   ├── index.ts                    # Public exports
            │   ├── client.ts                   # DocsClient
            │   ├── config.ts                   # Configuration
            │   │
            │   ├── services/
            │   │   ├── index.ts
            │   │   ├── document.ts
            │   │   ├── revision.ts
            │   │   ├── suggestion.ts
            │   │   ├── comment.ts
            │   │   ├── namedRange.ts
            │   │   └── export.ts
            │   │
            │   ├── builder/
            │   │   ├── index.ts
            │   │   ├── content.ts
            │   │   └── style.ts
            │   │
            │   ├── types/
            │   │   └── index.ts
            │   │
            │   ├── simulation/
            │   │   ├── index.ts
            │   │   └── mockClient.ts
            │   │
            │   ├── error.ts
            │   └── validation.ts
            │
            └── tests/
```

---

## 6. Integration with Shared Modules

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Google Docs Integration                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                         ┌─────────────────────┐                                 │
│                         │     DocsClient      │                                 │
│                         └──────────┬──────────┘                                 │
│                                    │                                            │
│         ┌──────────────────────────┼──────────────────────────┐                │
│         │                          │                          │                 │
│         ▼                          ▼                          ▼                 │
│  ┌─────────────┐           ┌─────────────┐           ┌─────────────┐           │
│  │google/auth  │           │shared/      │           │shared/      │           │
│  │             │           │resilience   │           │observability│           │
│  │• OAuth2     │           │             │           │             │           │
│  │• Service    │           │• Retry      │           │• Metrics    │           │
│  │  Account    │           │• Circuit    │           │• Tracing    │           │
│  │• ADC        │           │  Breaker    │           │• Logging    │           │
│  └─────────────┘           └─────────────┘           └─────────────┘           │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────┬────────────────────────────────────────────────────────────┐
│ Shared Module      │ Integration Point                                          │
├────────────────────┼────────────────────────────────────────────────────────────┤
│ google/auth        │ • OAuth2 token: https://www.googleapis.com/auth/documents  │
│                    │ • Service account for server-to-server                     │
│                    │ • Application Default Credentials support                  │
├────────────────────┼────────────────────────────────────────────────────────────┤
│ shared/resilience  │ • RetryPolicy for transient errors (429, 5xx)              │
│                    │ • CircuitBreaker per API endpoint                          │
│                    │ • RateLimiter: 300 read/min, 60 write/min                  │
├────────────────────┼────────────────────────────────────────────────────────────┤
│ shared/observability│ • Metrics: docs.operations, docs.latency, docs.errors     │
│                    │ • Traces: span per API call                                │
│                    │ • Logs: structured, content-redacted                       │
├────────────────────┼────────────────────────────────────────────────────────────┤
│ shared/vector-memory│ • Store document embeddings for similarity search         │
│                    │ • Index named ranges for semantic lookup                   │
└────────────────────┴────────────────────────────────────────────────────────────┘
```

---

## 7. Security Architecture

### 7.1 Credential Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Credential Management                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                    Credential Sources                                    │   │
│  │                                                                          │   │
│  │   ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐   │   │
│  │   │ Service Account│  │   OAuth2       │  │   Application Default  │   │   │
│  │   │  (JSON key)    │  │  (User auth)   │  │    Credentials (ADC)   │   │   │
│  │   └───────┬────────┘  └───────┬────────┘  └───────────┬────────────┘   │   │
│  │           │                   │                       │                │   │
│  │           └───────────────────┴───────────┬───────────┘                │   │
│  │                                           │                            │   │
│  │                                           ▼                            │   │
│  │                            ┌──────────────────────────┐                │   │
│  │                            │     google/auth          │                │   │
│  │                            │                          │                │   │
│  │                            │  • Token acquisition     │                │   │
│  │                            │  • Automatic refresh     │                │   │
│  │                            │  • Scope validation      │                │   │
│  │                            └──────────────────────────┘                │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Security Controls:                                                              │
│  • Tokens stored as SecretString (never logged)                                 │
│  • Service account keys loaded from secure storage                              │
│  • Minimum required scopes: documents.readonly OR documents                     │
│  • Token refresh at 80% TTL                                                     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Content Security

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      Content Security Pipeline                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Logging Policy:                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  LOGGED                          │  NEVER LOGGED                        │   │
│  │  ─────────────────────────────── │  ────────────────────────────────    │   │
│  │  • document_id                   │  • Document content                  │   │
│  │  • operation type                │  • Comment text                      │   │
│  │  • request count                 │  • User emails (hashed only)         │   │
│  │  • response status               │  • OAuth tokens                      │   │
│  │  • latency                       │  • Named range content               │   │
│  │  • revision_id                   │  • Export file contents              │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Export Security:                                                                │
│  • PDF/DOCX exports written to secure temp directory                            │
│  • Automatic cleanup after configurable TTL                                     │
│  • No caching of exported content                                               │
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
│  │  │   Retry     │   │  Fail Fast  │   │  Conflict   │   │   Client    │  │   │
│  │  │             │   │             │   │             │   │             │  │   │
│  │  │ • 429       │   │ • 400       │   │ • 409       │   │ • Invalid   │  │   │
│  │  │ • 500       │   │ • 401       │   │ • Revision  │   │   range     │  │   │
│  │  │ • 502       │   │ • 403       │   │   mismatch  │   │ • Batch     │  │   │
│  │  │ • 503       │   │ • 404       │   │             │   │   too large │  │   │
│  │  │ • Timeout   │   │             │   │             │   │             │  │   │
│  │  └─────────────┘   └─────────────┘   └─────────────┘   └─────────────┘  │   │
│  │                                                                          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Circuit Breaker (per API):                                                      │
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

## 9. Simulation Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        Simulation Components                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                     MockDocsClient                                       │   │
│  │                                                                          │   │
│  │  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐    │   │
│  │  │ DocumentStore    │   │  OperationLog    │   │  ErrorInjector   │    │   │
│  │  │                  │   │                  │   │                  │    │   │
│  │  │ In-memory docs   │   │ Records all ops  │   │ Configurable     │    │   │
│  │  │ with full model  │   │ for verification │   │ failure points   │    │   │
│  │  └──────────────────┘   └──────────────────┘   └──────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                     LocalDocumentModel                                   │   │
│  │                                                                          │   │
│  │  • Applies batch update requests to in-memory document                  │   │
│  │  • Validates index calculations                                         │   │
│  │  • Tracks revision history                                              │   │
│  │  • Supports suggestions mode                                            │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                     DocumentReplay                                       │   │
│  │                                                                          │   │
│  │  • Record API interactions to file                                      │   │
│  │  • Replay for regression testing                                        │   │
│  │  • Compare actual vs recorded responses                                 │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
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
│  │  • Service logic with MockDocsClient                                    │   │
│  │  • ContentBuilder request generation                                    │   │
│  │  • Markdown conversion                                                  │   │
│  │  • Index calculation                                                    │   │
│  │  Coverage Target: >90%                                                  │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                     Integration Tests                                    │   │
│  │  • Full flows with LocalDocumentModel                                   │   │
│  │  • HTTP mock server (wiremock)                                          │   │
│  │  • Named range operations                                               │   │
│  │  • Revision comparison                                                  │   │
│  │  Coverage Target: All API operations                                    │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        E2E Tests (Gated)                                 │   │
│  │  • Real Google Docs API                                                 │   │
│  │  • Requires: Service account credentials                                │   │
│  │  • Gated by: GOOGLE_DOCS_E2E_TESTS=true                                 │   │
│  │  Coverage: Happy paths only                                             │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  Test Fixtures:                                                                  │
│  ├── fixtures/                                                                  │
│  │   ├── documents/                                                             │
│  │   │   ├── simple_document.json                                              │
│  │   │   ├── document_with_tables.json                                         │
│  │   │   └── document_with_suggestions.json                                    │
│  │   ├── requests/                                                              │
│  │   │   ├── insert_text.json                                                  │
│  │   │   └── batch_update.json                                                 │
│  │   └── responses/                                                             │
│  │       ├── get_document.json                                                 │
│  │       └── batch_update_response.json                                        │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-google-docs.md | Complete |
| 2. Pseudocode | pseudocode-google-docs.md | Complete |
| 3. Architecture | architecture-google-docs.md | Complete |
| 4. Refinement | refinement-google-docs.md | Pending |
| 5. Completion | completion-google-docs.md | Pending |

---

*Phase 3: Architecture - Complete*
