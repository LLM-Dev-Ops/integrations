# Microsoft Word & Excel Graph API Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/word-excel-graph-api`

---

## 1. Module Structure

### 1.1 Directory Layout

```
integrations/word-excel-graph-api/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Public API exports
│   ├── client.rs                 # GraphDocumentClient implementation
│   ├── config.rs                 # Configuration types
│   ├── services/
│   │   ├── mod.rs
│   │   ├── excel.rs              # ExcelService implementation
│   │   ├── word.rs               # WordService implementation
│   │   └── versions.rs           # VersionService implementation
│   ├── excel/
│   │   ├── mod.rs
│   │   ├── range.rs              # Range operations
│   │   ├── worksheet.rs          # Worksheet operations
│   │   ├── table.rs              # Table operations
│   │   └── session.rs            # Session management
│   ├── word/
│   │   ├── mod.rs
│   │   ├── content.rs            # Content operations
│   │   ├── paragraph.rs          # Paragraph parsing
│   │   ├── table.rs              # Table parsing
│   │   └── ooxml.rs              # OOXML utilities
│   ├── auth/
│   │   ├── mod.rs
│   │   ├── provider.rs           # MicrosoftAuthProvider
│   │   ├── client_credentials.rs # Client credentials flow
│   │   └── delegated.rs          # Delegated auth flow
│   ├── concurrency/
│   │   ├── mod.rs
│   │   ├── etag_cache.rs         # ETag caching
│   │   └── session_manager.rs    # Session lifecycle
│   ├── batch/
│   │   ├── mod.rs
│   │   ├── builder.rs            # Batch request builder
│   │   └── executor.rs           # Batch execution
│   ├── rate_limit/
│   │   ├── mod.rs
│   │   └── limiter.rs            # Multi-tier rate limiter
│   ├── transport/
│   │   ├── mod.rs
│   │   └── http.rs               # HTTP transport layer
│   ├── types/
│   │   ├── mod.rs
│   │   ├── cell.rs               # CellValue types
│   │   ├── range.rs              # ExcelRange types
│   │   ├── document.rs           # WordDocument types
│   │   └── version.rs            # Version types
│   ├── simulation/
│   │   ├── mod.rs
│   │   ├── mock.rs               # MockGraphDocumentClient
│   │   ├── recorder.rs           # Operation recording
│   │   └── replayer.rs           # Deterministic replay
│   └── errors.rs                 # Error types
├── tests/
│   ├── unit/
│   ├── integration/
│   └── simulation/
└── benches/
```

### 1.2 TypeScript Structure

```
integrations/word-excel-graph-api/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # Public exports
│   ├── client.ts                 # GraphDocumentClient
│   ├── config.ts                 # Configuration types
│   ├── services/
│   │   ├── excel.ts              # ExcelService
│   │   ├── word.ts               # WordService
│   │   └── versions.ts           # VersionService
│   ├── auth/
│   │   ├── provider.ts           # MicrosoftAuthProvider
│   │   └── token-cache.ts        # Token caching
│   ├── excel/
│   │   ├── range.ts              # Range operations
│   │   ├── session.ts            # Session management
│   │   └── batch.ts              # Batch operations
│   ├── word/
│   │   ├── content.ts            # Content operations
│   │   └── ooxml.ts              # OOXML utilities
│   ├── types/
│   │   ├── cell.ts               # Cell types
│   │   ├── range.ts              # Range types
│   │   └── document.ts           # Document types
│   ├── simulation/
│   │   ├── mock.ts               # Mock client
│   │   └── recorder.ts           # Recording
│   └── errors.ts                 # Error types
└── tests/
```

---

## 2. Component Architecture

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        GraphDocumentClient                              │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────────────┐│
│  │  GraphConfig  │  │MicrosoftAuth  │  │      CircuitBreaker           ││
│  │               │  │   Provider    │  │   (from shared/resilience)    ││
│  │ - tenant_id   │  │               │  └───────────────────────────────┘│
│  │ - client_id   │  │ - credentials │  ┌───────────────────────────────┐│
│  │ - timeout     │  │ - token_cache │  │        RateLimiter            ││
│  │ - rate_limit  │  │               │  │   - global_bucket             ││
│  └───────────────┘  │ +get_token()  │  │   - session_buckets           ││
│                     │ +apply_auth() │  └───────────────────────────────┘│
│  ┌───────────────┐  └───────────────┘  ┌───────────────────────────────┐│
│  │ HttpTransport │  ┌───────────────┐  │      SessionManager           ││
│  │               │  │  ETagCache    │  │   - sessions: Map             ││
│  │ - base_url    │  │               │  │   +create/refresh/close       ││
│  │ - timeout     │  │ - cache: Map  │  └───────────────────────────────┘│
│  │ +get/post/put │  │ - ttl         │                                   │
│  └───────────────┘  └───────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────┘
         │                    │                         │
         ▼                    ▼                         ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐
│  ExcelService   │  │   WordService   │  │      VersionService         │
│                 │  │                 │  │                             │
│ +get_range()    │  │ +get_content()  │  │ +list_versions()            │
│ +update_range() │  │ +update_content │  │ +get_version()              │
│ +batch_update() │  │ +get_paragraphs │  │ +restore_version()          │
│ +get_worksheet()│  │ +get_tables()   │  │                             │
│ +get_table()    │  │ +replace_text() │  │                             │
└─────────────────┘  └─────────────────┘  └─────────────────────────────┘
```

### 2.2 Shared Module Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                  word-excel-graph-api module                    │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────────┐
│    shared/    │    │    shared/    │    │      shared/      │
│  credentials  │    │  resilience   │    │   observability   │
│               │    │               │    │                   │
│ MicrosoftCreds│    │ RetryPolicy   │    │ Tracing spans     │
│ SecretString  │    │ CircuitBreaker│    │ Metrics registry  │
│ TokenCache    │    │ Backoff       │    │ Structured logs   │
└───────────────┘    └───────────────┘    └───────────────────┘
                              │
                     ┌────────┴────────┐
                     ▼                 ▼
              ┌───────────────┐ ┌───────────────┐
              │    shared/    │ │    shared/    │
              │     http      │ │     ooxml     │
              │               │ │               │
              │ HttpClient    │ │ DocxParser    │
              │ RequestBuilder│ │ DocxWriter    │
              └───────────────┘ └───────────────┘
```

---

## 3. Data Flow Diagrams

### 3.1 Excel Read Range Flow

```
┌──────────┐     ┌─────────────┐     ┌──────────────┐     ┌────────────┐
│  Caller  │────▶│ ExcelService│────▶│ Validate     │────▶│ Rate Limit │
│          │     │ .get_range()│     │ Inputs       │     │  Check     │
└──────────┘     └─────────────┘     └──────────────┘     └────────────┘
                                                                │
                       ┌────────────────────────────────────────┘
                       │
                       ▼
              ┌────────────────┐     ┌────────────────┐     ┌────────────┐
              │ Circuit Breaker│────▶│  Get OAuth     │────▶│  Add       │
              │   is_open()?   │     │  Bearer Token  │     │  Session   │
              └────────────────┘     └────────────────┘     │  Header    │
                                                            └────────────┘
                                                                 │
                       ┌─────────────────────────────────────────┘
                       ▼
              ┌────────────────┐     ┌────────────────┐     ┌────────────┐
              │   HTTP GET     │────▶│  Retry on      │────▶│  Parse     │
              │   to Graph API │     │  Failure       │     │  Response  │
              └────────────────┘     └────────────────┘     └────────────┘
                                                                 │
                       ┌─────────────────────────────────────────┘
                       ▼
              ┌────────────────┐     ┌────────────────┐     ┌────────────┐
              │  Cache ETag    │────▶│  Emit Metrics  │────▶│  Return    │
              │  from Response │     │  cells_read    │     │ ExcelRange │
              └────────────────┘     └────────────────┘     └────────────┘
```

### 3.2 Excel Session Lifecycle

```
┌──────────┐     ┌─────────────┐     ┌──────────────┐
│  Caller  │────▶│ SessionMgr  │────▶│ POST         │
│          │     │.create()    │     │ createSession│
└──────────┘     └─────────────┘     └──────────────┘
                       │                    │
                       │                    ▼
                       │            ┌──────────────┐
                       │            │  Session     │
                       │            │  Created     │
                       │            │  (5 min TTL) │
                       │            └──────────────┘
                       │                    │
                       ▼                    ▼
              ┌────────────────┐   ┌────────────────┐
              │ Store Session  │   │ Add to Active  │
              │ in Map         │   │ Sessions       │
              └────────────────┘   └────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
         ▼                           ▼
┌────────────────┐          ┌────────────────┐
│  Use Session   │          │  Background    │
│  for Operations│          │  Refresh Task  │
│                │          │                │
│ (workbook-     │          │ Check every    │
│  session-id)   │          │ 3 minutes      │
└────────────────┘          └────────────────┘
         │                           │
         │                           ▼
         │                  ┌────────────────┐
         │                  │ POST           │
         │                  │ refreshSession │
         │                  └────────────────┘
         │
         ▼
┌────────────────┐     ┌────────────────┐
│ Caller Done    │────▶│ POST           │
│ or Drop        │     │ closeSession   │
└────────────────┘     └────────────────┘
                              │
                              ▼
                       ┌────────────────┐
                       │ Remove from    │
                       │ Active Sessions│
                       └────────────────┘
```

### 3.3 Batch Update Flow

```
┌──────────┐     ┌─────────────┐     ┌──────────────┐
│  Caller  │────▶│ ExcelService│────▶│ Validate All │
│          │     │.batch_update│     │   Updates    │
└──────────┘     └─────────────┘     └──────────────┘
                                            │
                       ┌────────────────────┘
                       │
                       ▼
              ┌────────────────┐     ┌────────────────┐
              │  Check Batch   │────▶│  Build JSON    │
              │  Size Limit    │     │  Batch Request │
              └────────────────┘     └────────────────┘
                                            │
                       ┌────────────────────┘
                       ▼
              ┌────────────────────────────────────────┐
              │  Batch Request Body                    │
              │  {                                     │
              │    "requests": [                       │
              │      { "id": "1", "method": "PATCH",   │
              │        "url": "/drives/.../range...",  │
              │        "body": { "values": [...] }     │
              │      },                                │
              │      { "id": "2", ... },               │
              │      ...                               │
              │    ]                                   │
              │  }                                     │
              └────────────────────────────────────────┘
                                            │
                       ┌────────────────────┘
                       ▼
              ┌────────────────┐     ┌────────────────┐
              │  POST to       │────▶│  Parse Batch   │
              │  /$batch       │     │  Response      │
              └────────────────┘     └────────────────┘
                                            │
                       ┌────────────────────┘
                       ▼
              ┌────────────────┐     ┌────────────────┐
              │  Aggregate     │────▶│  Return        │
              │  Results       │     │  BatchResult   │
              └────────────────┘     └────────────────┘
```

---

## 4. State Machines

### 4.1 Session State Machine

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
           ┌─────────────────┐                            │
           │     Inactive    │                            │
           │   (no session)  │                            │
           └────────┬────────┘                            │
                    │                                     │
              createSession()                             │
                    │                                     │
                    ▼                                     │
           ┌─────────────────┐                            │
           │     Active      │◀────────────────┐          │
           │  (5 min TTL)    │                 │          │
           └────────┬────────┘                 │          │
                    │                          │          │
        ┌───────────┼───────────┐              │          │
        │           │           │              │          │
   Use Session   TTL < 1min  closeSession()    │          │
        │           │           │              │          │
        ▼           ▼           ▼              │          │
   ┌─────────┐ ┌──────────┐ ┌──────────┐       │          │
   │ Return  │ │ Refresh  │ │  Closed  │───────┴──────────┘
   │ to      │ │ Session  │ │          │
   │ Active  │ │          │ └──────────┘
   └─────────┘ └────┬─────┘
                    │
                    ▼
              ┌──────────┐
              │ Active   │ (TTL reset to 5 min)
              │ Refreshed│
              └──────────┘

Session Timeout:
┌─────────────────┐     ┌─────────────────┐
│ TTL Expired     │────▶│ Session Expired │
│ (no refresh)    │     │ (auto-cleanup)  │
└─────────────────┘     └─────────────────┘
```

### 4.2 Token Cache State Machine

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
           ┌─────────────────┐                            │
           │     Empty       │                            │
           │   (no token)    │                            │
           └────────┬────────┘                            │
                    │                                     │
              get_token()                                 │
                    │                                     │
                    ▼                                     │
           ┌─────────────────┐                            │
           │    Fetching     │                            │
           │  (calling OAuth)│                            │
           └────────┬────────┘                            │
                    │                                     │
              ┌─────┴─────┐                               │
              │           │                               │
           Success     Failure                            │
              │           │                               │
              ▼           ▼                               │
     ┌─────────────┐  ┌─────────────┐                     │
     │   Cached    │  │   Error     │                     │
     │ (has token) │  │ (auth fail) │                     │
     └──────┬──────┘  └─────────────┘                     │
            │                                             │
       ┌────┴────┐                                        │
       │         │                                        │
  get_token()  Token                                      │
  (cache hit)  Expires                                    │
       │         │                                        │
       ▼         └────────────────────────────────────────┘
  Return Token
  (no network)
```

### 4.3 Circuit Breaker State Machine

```
                         ┌───────────────────────────────────────────┐
                         │                                           │
         ┌───────────────┼──────────────────┐                        │
         │               │                  │                        │
         │               ▼                  │                        │
         │      ┌─────────────────┐         │                        │
         │      │     CLOSED      │         │                        │
         │      │ (normal flow)   │         │                        │
         │      └────────┬────────┘         │                        │
         │               │                  │                        │
         │    ┌──────────┴──────────┐       │                        │
         │    │                     │       │                        │
         │ Success              Failure     │                        │
         │    │                failures++   │                        │
         │    ▼                     │       │                        │
         │ Reset           >= threshold?    │                        │
         │ failures              │          │                        │
         │                  Yes ─┤          │                        │
         │                       ▼          │                        │
         │              ┌─────────────────┐ │                        │
         │              │      OPEN       │ │                        │
         │              │ (reject all)    │ │                        │
         │              └────────┬────────┘ │                        │
         │                       │          │                        │
         │             Timeout ──┘          │                        │
         │                       ▼          │                        │
         │              ┌─────────────────┐ │                        │
         │              │   HALF-OPEN     │ │                        │
         │              │ (allow 1 req)   │ │                        │
         │              └────────┬────────┘ │                        │
         │                 ┌─────┴─────┐    │                        │
         │             Success      Failure │                        │
         │                 │            │   │                        │
         └─────────────────┘            └───┴────────────────────────┘
```

---

## 5. Authentication Architecture

### 5.1 OAuth 2.0 Client Credentials Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Client Credentials Flow                              │
│                                                                         │
│   ┌─────────────────┐                                                   │
│   │ App Registration│                                                   │
│   │ (Azure AD)      │                                                   │
│   │                 │                                                   │
│   │ - client_id     │                                                   │
│   │ - client_secret │                                                   │
│   │ - tenant_id     │                                                   │
│   └────────┬────────┘                                                   │
│            │                                                            │
│            ▼                                                            │
│   ┌─────────────────┐                                                   │
│   │  Build Request  │                                                   │
│   │                 │                                                   │
│   │  POST /token    │                                                   │
│   │  grant_type=    │                                                   │
│   │  client_creds   │                                                   │
│   │  scope=         │                                                   │
│   │  .default       │                                                   │
│   └────────┬────────┘                                                   │
│            │                                                            │
│            ▼                                                            │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│   │ POST to Azure   │────▶│  Receive Token  │────▶│  Cache Token    │   │
│   │ AD Token        │     │  Response       │     │  (1 hour TTL)   │   │
│   │ Endpoint        │     │                 │     │                 │   │
│   └─────────────────┘     └─────────────────┘     └─────────────────┘   │
│                                                                         │
│   Token Endpoint:                                                       │
│   https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Permission Scopes

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Permission Model                                │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    Application Permissions                      │   │
│   │                    (Client Credentials)                         │   │
│   │                                                                 │   │
│   │   Files.Read.All        - Read all files                        │   │
│   │   Files.ReadWrite.All   - Read/write all files                  │   │
│   │                                                                 │   │
│   │   Scope format: https://graph.microsoft.com/.default            │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    Delegated Permissions                        │   │
│   │                    (User Context)                               │   │
│   │                                                                 │   │
│   │   Files.Read            - Read user's files                     │   │
│   │   Files.ReadWrite       - Read/write user's files               │   │
│   │   Files.Read.Selected   - Read selected files                   │   │
│   │                                                                 │   │
│   │   Scope format: Files.ReadWrite                                 │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Concurrency Architecture

### 6.1 ETag-Based Conflict Detection

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ETag Concurrency Model                               │
│                                                                         │
│   Read Operation:                                                       │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│   │  GET range      │────▶│  Response with  │────▶│  Store ETag     │   │
│   │                 │     │  ETag header    │     │  in cache       │   │
│   └─────────────────┘     └─────────────────┘     └─────────────────┘   │
│                                                                         │
│   Write Operation:                                                      │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│   │  Get cached     │────▶│  PATCH range    │────▶│  Check          │   │
│   │  ETag           │     │  If-Match: ETag │     │  Response       │   │
│   └─────────────────┘     └─────────────────┘     └─────────────────┘   │
│                                                          │              │
│                                              ┌───────────┴───────────┐  │
│                                              │                       │  │
│                                           200 OK                  412   │
│                                              │                Precondition│
│                                              ▼                  Failed  │
│                                    ┌─────────────────┐    ┌──────────┐  │
│                                    │ Update cached   │    │ Conflict │  │
│                                    │ ETag            │    │ Error    │  │
│                                    └─────────────────┘    └──────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Thread Safety Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Thread Safety Design                                 │
│                                                                         │
│   GraphDocumentClient: Arc<Inner>                                       │
│   ├── config: GraphConfig (immutable)                                   │
│   ├── auth: Arc<MicrosoftAuthProvider>                                  │
│   │   └── token_cache: RwLock<HashMap<String, Token>>                   │
│   ├── transport: HttpClient (Send + Sync)                               │
│   ├── rate_limiter: Arc<RateLimiter>                                    │
│   │   ├── global_bucket: AtomicTokenBucket                              │
│   │   └── session_buckets: DashMap<String, TokenBucket>                 │
│   ├── circuit_breaker: Arc<CircuitBreaker>                              │
│   │   ├── state: AtomicU8                                               │
│   │   └── failure_count: AtomicU32                                      │
│   ├── etag_cache: Arc<RwLock<LruCache>>                                 │
│   └── session_manager: Arc<RwLock<SessionManager>>                      │
│                                                                         │
│   Concurrency Guarantees:                                               │
│   - Client is Clone + Send + Sync                                       │
│   - Safe to share across tokio tasks                                    │
│   - Session manager uses RwLock for session map                         │
│   - Rate limiter uses lock-free atomics + DashMap                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Observability Integration

### 7.1 Tracing Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Trace Hierarchy                                 │
│                                                                         │
│   graph.excel.batch_update                                              │
│   ├── graph.validate_inputs                                             │
│   ├── graph.rate_limit                                                  │
│   ├── graph.circuit_breaker                                             │
│   ├── graph.auth.get_token                                              │
│   │   └── [token cache or fetch]                                        │
│   ├── graph.session.get_or_create                                       │
│   │   └── [session lookup or create]                                    │
│   └── graph.http_request                                                │
│       ├── [batch request build]                                         │
│       └── [retry attempts]                                              │
│                                                                         │
│   Span Attributes:                                                      │
│   - graph.drive_id (redacted)                                           │
│   - graph.item_id (redacted)                                            │
│   - graph.service (excel/word)                                          │
│   - graph.operation                                                     │
│   - graph.session_id                                                    │
│   - graph.cells_affected                                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Metrics Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Metrics Flow                                  │
│                                                                         │
│   ┌─────────────┐                         ┌─────────────────────┐       │
│   │  Operation  │────────────────────────▶│ graph_operations_   │       │
│   │  Complete   │                         │ total{svc,op,status}│       │
│   └─────────────┘                         └─────────────────────┘       │
│                                                                         │
│   ┌─────────────┐                         ┌─────────────────────┐       │
│   │  Latency    │────────────────────────▶│ graph_operation_    │       │
│   │  Timer      │                         │ latency_seconds     │       │
│   └─────────────┘                         └─────────────────────┘       │
│                                                                         │
│   ┌─────────────┐                         ┌─────────────────────┐       │
│   │ Cells Read  │────────────────────────▶│ graph_excel_cells_  │       │
│   │             │                         │ read_total          │       │
│   └─────────────┘                         └─────────────────────┘       │
│                                                                         │
│   ┌─────────────┐                         ┌─────────────────────┐       │
│   │   Session   │────────────────────────▶│ graph_session_count │       │
│   │   Created   │                         │ {state}             │       │
│   └─────────────┘                         └─────────────────────┘       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Simulation Architecture

### 8.1 Mock Client Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Mock/Simulation Layer                              │
│                                                                         │
│   ┌───────────────────────────────────────────────────────────────┐     │
│   │              GraphDocumentClient (trait)                      │     │
│   │                                                               │     │
│   │  +excel() -> ExcelService                                     │     │
│   │  +word() -> WordService                                       │     │
│   │  +versions() -> VersionService                                │     │
│   └───────────────────────────────────────────────────────────────┘     │
│                              ▲                                          │
│                              │                                          │
│           ┌──────────────────┴──────────────────┐                       │
│           │                                     │                       │
│   ┌───────────────────┐               ┌───────────────────┐             │
│   │ RealGraphClient   │               │ MockGraphClient   │             │
│   │                   │               │                   │             │
│   │ - HttpTransport   │               │ - workbooks       │             │
│   │ - MicrosoftAuth   │               │ - documents       │             │
│   │                   │               │ - recorded_ops    │             │
│   │ (Production)      │               │ - should_fail     │             │
│   └───────────────────┘               │                   │             │
│                                       │ (Testing)         │             │
│                                       └───────────────────┘             │
│                                                                         │
│   Mock Data Structures:                                                 │
│   ┌───────────────────────────────────────────────────────────────┐     │
│   │ MockWorkbook {                                                │     │
│   │   worksheets: Map<String, MockWorksheet>,                     │     │
│   │   tables: Map<String, MockTable>,                             │     │
│   │   etag: String,                                               │     │
│   │ }                                                             │     │
│   │                                                               │     │
│   │ MockDocument {                                                │     │
│   │   content: Bytes,                                             │     │
│   │   paragraphs: Vec<Paragraph>,                                 │     │
│   │   tables: Vec<Table>,                                         │     │
│   │   versions: Vec<Version>,                                     │     │
│   │   etag: String,                                               │     │
│   │ }                                                             │     │
│   └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Security Architecture

### 9.1 Credential Protection

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Credential Security Model                            │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    Secret Protection                            │   │
│   │                                                                 │   │
│   │   - Client secret wrapped in SecretString                       │   │
│   │   - No Debug impl on credential types                           │   │
│   │   - Zeroize on drop                                             │   │
│   │   - Tokens cached with automatic refresh                        │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    Token Lifecycle                              │   │
│   │                                                                 │   │
│   │   Client Credentials                                            │   │
│   │         │                                                       │   │
│   │         ▼                                                       │   │
│   │   ┌─────────────┐                                               │   │
│   │   │  Request    │  (POST to Azure AD)                           │   │
│   │   │  Token      │                                               │   │
│   │   └──────┬──────┘                                               │   │
│   │          │                                                      │   │
│   │          ▼                                                      │   │
│   │   ┌─────────────┐                                               │   │
│   │   │   Cache     │  (1 hour, refresh 5 min before expiry)        │   │
│   │   │   Token     │                                               │   │
│   │   └─────────────┘                                               │   │
│   │                                                                 │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Data Redaction

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PII Redaction in Logs                                │
│                                                                         │
│   Drive ID:   b!xxxxx...xxxxx  →  b!xxx***xxx                           │
│   Item ID:    01ABCD...EFGH   →  01AB***GH                              │
│   Session ID: (never logged)                                            │
│   Cell Data:  Configurable redaction level                              │
│                                                                         │
│   Log Levels:                                                           │
│   - ERROR/WARN: IDs redacted, no cell data                              │
│   - INFO: IDs redacted, counts only                                     │
│   - DEBUG: IDs partially shown, structure only                          │
│   - TRACE: Full data (dev only, with config flag)                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Architecture phase |

---

**Next Phase:** Refinement - Edge case handling, error recovery, session management details, and performance optimizations.
