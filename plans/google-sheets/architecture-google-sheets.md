# Google Sheets Integration Module - Architecture

**SPARC Phase 3: Architecture**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/google-sheets`

---

## 1. Module Structure

### 1.1 Directory Layout

```
integrations/google-sheets/
├── Cargo.toml
├── src/
│   ├── lib.rs                    # Public API exports
│   ├── client.rs                 # GoogleSheetsClient implementation
│   ├── config.rs                 # Configuration types
│   ├── services/
│   │   ├── mod.rs
│   │   ├── values.rs             # ValuesService implementation
│   │   └── spreadsheets.rs       # SpreadsheetsService implementation
│   ├── auth/
│   │   ├── mod.rs
│   │   ├── provider.rs           # GoogleAuthProvider
│   │   ├── service_account.rs    # Service account JWT
│   │   └── oauth.rs              # OAuth token refresh
│   ├── concurrency/
│   │   ├── mod.rs
│   │   ├── etag_cache.rs         # ETag caching
│   │   └── optimistic_lock.rs    # Read-modify-write
│   ├── validation/
│   │   ├── mod.rs
│   │   ├── schema.rs             # Schema definitions
│   │   └── validator.rs          # Validation logic
│   ├── rate_limit/
│   │   ├── mod.rs
│   │   └── limiter.rs            # Multi-bucket rate limiter
│   ├── transport/
│   │   ├── mod.rs
│   │   └── http.rs               # HTTP transport layer
│   ├── types/
│   │   ├── mod.rs
│   │   ├── cell.rs               # CellValue types
│   │   ├── range.rs              # Range types
│   │   ├── requests.rs           # API request types
│   │   └── responses.rs          # API response types
│   ├── simulation/
│   │   ├── mod.rs
│   │   ├── mock.rs               # MockGoogleSheetsClient
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
integrations/google-sheets/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                  # Public exports
│   ├── client.ts                 # GoogleSheetsClient
│   ├── config.ts                 # Configuration types
│   ├── services/
│   │   ├── values.ts             # ValuesService
│   │   └── spreadsheets.ts       # SpreadsheetsService
│   ├── auth/
│   │   ├── provider.ts           # GoogleAuthProvider
│   │   ├── service-account.ts    # Service account
│   │   └── oauth.ts              # OAuth handling
│   ├── concurrency/
│   │   ├── etag-cache.ts         # ETag caching
│   │   └── optimistic-lock.ts    # Optimistic locking
│   ├── validation/
│   │   ├── schema.ts             # Schema types
│   │   └── validator.ts          # Validation
│   ├── types/
│   │   ├── cell.ts               # Cell types
│   │   ├── range.ts              # Range types
│   │   └── responses.ts          # Response types
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
│                         GoogleSheetsClient                              │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────────────┐│
│  │ SheetsConfig  │  │GoogleAuthProv │  │      CircuitBreaker           ││
│  │               │  │               │  │   (from shared/resilience)    ││
│  │ - credentials │  │ - credentials │  └───────────────────────────────┘│
│  │ - timeout     │  │ - token_cache │  ┌───────────────────────────────┐│
│  │ - rate_limit  │  │               │  │        RateLimiter            ││
│  │ - circuit_cfg │  │ +get_token()  │  │   - read_bucket               ││
│  └───────────────┘  │ +apply_auth() │  │   - write_bucket              ││
│                     └───────────────┘  │   - project_bucket            ││
│  ┌───────────────┐  ┌───────────────┐  └───────────────────────────────┘│
│  │ HttpTransport │  │  ETagCache    │  ┌───────────────────────────────┐│
│  │               │  │               │  │     SchemaValidator           ││
│  │ - base_url    │  │ - cache: Map  │  │   - schemas: Map              ││
│  │ - timeout     │  │ - ttl         │  │   +validate()                 ││
│  │ +get/post/put │  │ +get/set      │  └───────────────────────────────┘│
│  └───────────────┘  └───────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────┘
                │                                    │
                ▼                                    ▼
┌───────────────────────────────┐    ┌───────────────────────────────────┐
│        ValuesService          │    │      SpreadsheetsService          │
│                               │    │                                   │
│ +get(id, range)               │    │ +get(id)                          │
│ +batch_get(id, ranges)        │    │ +list_sheets(id)                  │
│ +update(id, range, values)    │    │ +get_named_ranges(id)             │
│ +append(id, range, values)    │    │ +add_named_range(id, name, range) │
│ +batch_update(id, updates)    │    │                                   │
└───────────────────────────────┘    └───────────────────────────────────┘
```

### 2.2 Shared Module Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                    google-sheets module                         │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────────┐
│    shared/    │    │    shared/    │    │      shared/      │
│  credentials  │    │  resilience   │    │   observability   │
│               │    │               │    │                   │
│ GoogleCreds   │    │ RetryPolicy   │    │ Tracing spans     │
│ SecretString  │    │ CircuitBreaker│    │ Metrics registry  │
│ TokenCache    │    │ Backoff       │    │ Structured logs   │
└───────────────┘    └───────────────┘    └───────────────────┘
                              │
                     ┌────────┴────────┐
                     ▼                 ▼
              ┌───────────────┐ ┌───────────────┐
              │    shared/    │ │    shared/    │
              │     http      │ │   validation  │
              │               │ │               │
              │ HttpClient    │ │ SchemaTypes   │
              │ RequestBuilder│ │ Validators    │
              └───────────────┘ └───────────────┘
```

---

## 3. Data Flow Diagrams

### 3.1 Read Values Flow

```
┌──────────┐     ┌─────────────┐     ┌──────────────┐     ┌────────────┐
│  Caller  │────▶│ ValuesService│────▶│ Validate     │────▶│ Rate Limit │
│          │     │   .get()     │     │ Inputs       │     │  Check     │
└──────────┘     └─────────────┘     └──────────────┘     └────────────┘
                                                                │
                       ┌────────────────────────────────────────┘
                       │
                       ▼
              ┌────────────────┐     ┌────────────────┐     ┌────────────┐
              │ Circuit Breaker│────▶│  Apply OAuth   │────▶│  HTTP GET  │
              │   is_open()?   │     │  Bearer Token  │     │  Request   │
              └────────────────┘     └────────────────┘     └────────────┘
                                                                 │
                       ┌─────────────────────────────────────────┘
                       ▼
              ┌────────────────┐     ┌────────────────┐     ┌────────────┐
              │  Retry on      │────▶│  Parse JSON    │────▶│  Cache     │
              │  Failure       │     │  Response      │     │  ETag      │
              └────────────────┘     └────────────────┘     └────────────┘
                                                                 │
                                                                 ▼
                                                          ┌────────────┐
                                                          │  Return    │
                                                          │ ValueRange │
                                                          └────────────┘
```

### 3.2 Batch Update Flow

```
┌──────────┐     ┌─────────────┐     ┌──────────────┐     ┌────────────┐
│  Caller  │────▶│ ValuesService│────▶│ Validate All │────▶│  Schema    │
│          │     │.batch_update │     │   Ranges     │     │ Validation │
└──────────┘     └─────────────┘     └──────────────┘     └────────────┘
                                                                │
                       ┌────────────────────────────────────────┘
                       │
                       ▼
              ┌────────────────┐     ┌────────────────┐     ┌────────────┐
              │ Rate Limit     │────▶│ Circuit Breaker│────▶│  Build     │
              │ Acquire Write  │     │    Check       │     │  Request   │
              └────────────────┘     └────────────────┘     └────────────┘
                                                                 │
                       ┌─────────────────────────────────────────┘
                       ▼
              ┌────────────────┐     ┌────────────────┐     ┌────────────┐
              │  Apply OAuth   │────▶│  HTTP POST     │────▶│  Retry on  │
              │  Bearer Token  │     │  batchUpdate   │     │  Failure   │
              └────────────────┘     └────────────────┘     └────────────┘
                                                                 │
                       ┌─────────────────────────────────────────┘
                       ▼
              ┌────────────────┐     ┌────────────────┐     ┌────────────┐
              │  Update Circuit│────▶│  Emit Metrics  │────▶│  Return    │
              │  Breaker State │     │  rows_written  │     │  Response  │
              └────────────────┘     └────────────────┘     └────────────┘
```

### 3.3 Optimistic Lock Flow

```
┌──────────┐     ┌─────────────┐
│  Caller  │────▶│ Optimistic  │
│          │     │Lock.execute │
└──────────┘     └─────────────┘
                       │
         ┌─────────────┴─────────────┐
         │                           │
         ▼                           │
┌────────────────┐                   │
│  Read Current  │◀──────────────────┤ Retry Loop
│  Values + ETag │                   │
└────────────────┘                   │
         │                           │
         ▼                           │
┌────────────────┐                   │
│  Apply User    │                   │
│  Modification  │                   │
└────────────────┘                   │
         │                           │
         ▼                           │
┌────────────────┐                   │
│  Write with    │                   │
│  If-Match ETag │                   │
└────────────────┘                   │
         │                           │
    ┌────┴────┐                      │
    │         │                      │
 Success   Conflict                  │
    │         │                      │
    ▼         └──────────────────────┘
┌────────────────┐
│    Return      │
│    Success     │
└────────────────┘
```

---

## 4. State Machines

### 4.1 Token Cache State Machine

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
           │  (generating)   │                            │
           └────────┬────────┘                            │
                    │                                     │
              ┌─────┴─────┐                               │
              │           │                               │
           Success     Failure                            │
              │           │                               │
              ▼           ▼                               │
     ┌─────────────┐  ┌─────────────┐                     │
     │   Valid     │  │   Error     │                     │
     │ (has token) │  │ (auth fail) │                     │
     └──────┬──────┘  └─────────────┘                     │
            │                                             │
       ┌────┴────┐                                        │
       │         │                                        │
  get_token()  Expired                                    │
  (cache hit)    │                                        │
       │         │                                        │
       ▼         └────────────────────────────────────────┘
  Return Token
```

### 4.2 Circuit Breaker State Machine

```
                         ┌───────────────────────────────────────────┐
                         │                                           │
         ┌───────────────┼──────────────────┐                        │
         │               │                  │                        │
         │               ▼                  │                        │
         │      ┌─────────────────┐         │                        │
         │      │     CLOSED      │         │                        │
         │      │                 │         │                        │
         │      │ failures = 0    │         │                        │
         │      └────────┬────────┘         │                        │
         │               │                  │                        │
         │    Request ───┤                  │                        │
         │       ┌───────┴───────┐          │                        │
         │   Success         Failure        │                        │
         │       │          failures++      │                        │
         │       ▼               │          │                        │
         │  Reset failures  >= threshold?   │                        │
         │       │               │          │                        │
         │       │        Yes ───┤          │                        │
         │       │               ▼          │                        │
         │       │      ┌─────────────────┐ │                        │
         │       │      │      OPEN       │ │                        │
         │       │      │ reject requests │ │                        │
         │       │      └────────┬────────┘ │                        │
         │       │               │          │                        │
         │       │     Timeout ──┘          │                        │
         │       │               ▼          │                        │
         │       │      ┌─────────────────┐ │                        │
         │       │      │   HALF-OPEN     │ │                        │
         │       │      │ allow 1 request │ │                        │
         │       │      └────────┬────────┘ │                        │
         │       │         ┌─────┴─────┐    │                        │
         │       │     Success      Failure │                        │
         │       │         │            │   │                        │
         └───────┴─────────┘            └───┴────────────────────────┘
```

### 4.3 Rate Limiter Token Bucket

```
┌───────────────────────────────────────────────────────────────────────┐
│                   Multi-Bucket Rate Limiter                           │
│                                                                       │
│   ┌─────────────────────────────────────────────────────────────┐     │
│   │                    Project Bucket                           │     │
│   │                 100 requests / 100 sec                      │     │
│   │   [████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░]   │     │
│   └─────────────────────────────────────────────────────────────┘     │
│                              │                                        │
│              ┌───────────────┴───────────────┐                        │
│              │                               │                        │
│              ▼                               ▼                        │
│   ┌─────────────────────┐         ┌─────────────────────┐             │
│   │    Read Bucket      │         │    Write Bucket     │             │
│   │   60 reads / min    │         │   60 writes / min   │             │
│   │   [██████████░░░░]  │         │   [████████░░░░░░]  │             │
│   └─────────────────────┘         └─────────────────────┘             │
│                                                                       │
│   Acquire Logic:                                                      │
│   1. Check project bucket first                                       │
│   2. Then check operation-specific bucket                             │
│   3. Both must succeed for operation to proceed                       │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 5. Concurrency Architecture

### 5.1 ETag-Based Conflict Detection

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ETag Concurrency Model                               │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                      ETagCache                                  │   │
│   │                                                                 │   │
│   │   Key: "{spreadsheet_id}:{range}"                               │   │
│   │   Value: { etag: String, expires_at: Instant }                  │   │
│   │                                                                 │   │
│   │   ┌─────────────────────────────────────────────────────────┐   │   │
│   │   │ "abc123:Sheet1!A1:D10" -> { etag: "W/\"...\"", exp: T }│   │   │
│   │   │ "abc123:Sheet1!E1:H10" -> { etag: "W/\"...\"", exp: T }│   │   │
│   │   │ "def456:Data!A:Z"      -> { etag: "W/\"...\"", exp: T }│   │   │
│   │   └─────────────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   Flow:                                                                 │
│   1. Read operation → Store returned ETag in cache                      │
│   2. Write operation → Include If-Match header with cached ETag         │
│   3. 409 Conflict → Re-read, re-apply changes, retry                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Thread Safety Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Thread Safety Design                                 │
│                                                                         │
│   GoogleSheetsClient: Arc<Inner>                                        │
│   ├── config: SheetsConfig (immutable)                                  │
│   ├── auth: Arc<GoogleAuthProvider>                                     │
│   │   └── token_cache: RwLock<TokenCache>                               │
│   ├── transport: HttpClient (Send + Sync)                               │
│   ├── rate_limiter: Arc<RateLimiter>                                    │
│   │   ├── read_bucket: AtomicTokenBucket                                │
│   │   ├── write_bucket: AtomicTokenBucket                               │
│   │   └── project_bucket: AtomicTokenBucket                             │
│   ├── circuit_breaker: Arc<CircuitBreaker>                              │
│   │   ├── state: AtomicU8                                               │
│   │   └── failure_count: AtomicU32                                      │
│   ├── etag_cache: Arc<RwLock<LruCache>>                                 │
│   └── schema_validator: Arc<RwLock<SchemaValidator>>                    │
│                                                                         │
│   Concurrency Guarantees:                                               │
│   - Client is Clone + Send + Sync                                       │
│   - Safe to share across tokio tasks                                    │
│   - Token refresh uses RwLock for read-heavy access                     │
│   - Rate limiter uses lock-free atomics                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Authentication Architecture

### 6.1 Service Account JWT Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Service Account Authentication                       │
│                                                                         │
│   ┌─────────────────┐                                                   │
│   │ Service Account │                                                   │
│   │ JSON Key File   │                                                   │
│   │                 │                                                   │
│   │ - client_email  │                                                   │
│   │ - private_key   │                                                   │
│   │ - token_uri     │                                                   │
│   └────────┬────────┘                                                   │
│            │                                                            │
│            ▼                                                            │
│   ┌─────────────────┐                                                   │
│   │  Build JWT      │                                                   │
│   │                 │                                                   │
│   │  Header:        │                                                   │
│   │  { alg: RS256 } │                                                   │
│   │                 │                                                   │
│   │  Claims:        │                                                   │
│   │  - iss          │                                                   │
│   │  - scope        │                                                   │
│   │  - aud          │                                                   │
│   │  - iat, exp     │                                                   │
│   └────────┬────────┘                                                   │
│            │                                                            │
│            ▼                                                            │
│   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐   │
│   │ Sign with RSA   │────▶│  POST to        │────▶│  Receive        │   │
│   │ Private Key     │     │  token endpoint │     │  Access Token   │   │
│   └─────────────────┘     └─────────────────┘     └─────────────────┘   │
│                                                            │            │
│                                                            ▼            │
│                                                   ┌─────────────────┐   │
│                                                   │  Cache Token    │   │
│                                                   │  (1 hour TTL)   │   │
│                                                   └─────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Error Handling Architecture

### 7.1 Error Propagation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Error Handling Flow                              │
│                                                                         │
│   Google Sheets API Response                                            │
│          │                                                              │
│          ▼                                                              │
│   ┌──────────────────┐                                                  │
│   │ Status Code?     │                                                  │
│   └────────┬─────────┘                                                  │
│            │                                                            │
│   ┌────────┼────────┬───────────┬───────────┬──────────────┐            │
│   │        │        │           │           │              │            │
│   ▼        ▼        ▼           ▼           ▼              ▼            │
│  200      400      401         403         429           5xx            │
│   │        │        │           │           │              │            │
│   ▼        ▼        ▼           ▼           ▼              ▼            │
│ Success  Parse    Token      Permission  Rate Limit   Server Err       │
│          Error   Expired      Denied                                    │
│   │        │        │           │           │              │            │
│   ▼        ▼        ▼           ▼           ▼              ▼            │
│ Return   Return   Refresh    Return      Return         Return          │
│ Data     DataError Token &   AccessError RateLimited   ServerError      │
│                   Retry                  (retryable)   (retryable)      │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    Error Response Parsing                       │   │
│   │                                                                 │   │
│   │   {                                                             │   │
│   │     "error": {                                                  │   │
│   │       "code": 400,                                              │   │
│   │       "message": "Invalid range",                               │   │
│   │       "status": "INVALID_ARGUMENT"                              │   │
│   │     }                                                           │   │
│   │   }                                                             │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Observability Integration

### 8.1 Tracing Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Trace Hierarchy                                 │
│                                                                         │
│   sheets.batch_update                                                   │
│   ├── sheets.validate_ranges                                            │
│   │   └── [per-range validation spans]                                  │
│   ├── sheets.schema_validate                                            │
│   │   └── [per-update validation]                                       │
│   ├── sheets.rate_limit                                                 │
│   │   └── [acquire write quota]                                         │
│   ├── sheets.circuit_breaker                                            │
│   │   └── [state check]                                                 │
│   ├── sheets.auth                                                       │
│   │   └── [token acquisition/refresh]                                   │
│   └── sheets.http_request                                               │
│       ├── [retry attempt 1]                                             │
│       │   └── http.send                                                 │
│       └── [retry attempt 2] (if needed)                                 │
│                                                                         │
│   Span Attributes:                                                      │
│   - sheets.spreadsheet_id (redacted)                                    │
│   - sheets.ranges_count                                                 │
│   - sheets.rows_updated                                                 │
│   - sheets.cells_updated                                                │
│   - sheets.value_input_option                                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Metrics Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Metrics Flow                                  │
│                                                                         │
│   ┌─────────────┐                         ┌─────────────────────┐       │
│   │  Operation  │────────────────────────▶│ sheets_operations_  │       │
│   │  Complete   │                         │ total{op, status}   │       │
│   └─────────────┘                         └─────────────────────┘       │
│                                                                         │
│   ┌─────────────┐                         ┌─────────────────────┐       │
│   │  Latency    │────────────────────────▶│ sheets_operation_   │       │
│   │  Timer      │                         │ latency_seconds{op} │       │
│   └─────────────┘                         └─────────────────────┘       │
│                                                                         │
│   ┌─────────────┐                         ┌─────────────────────┐       │
│   │  Rows Read  │────────────────────────▶│ sheets_rows_read_   │       │
│   │             │                         │ total               │       │
│   └─────────────┘                         └─────────────────────┘       │
│                                                                         │
│   ┌─────────────┐                         ┌─────────────────────┐       │
│   │ Rows Written│────────────────────────▶│ sheets_rows_written_│       │
│   │             │                         │ total               │       │
│   └─────────────┘                         └─────────────────────┘       │
│                                                                         │
│   ┌─────────────┐                         ┌─────────────────────┐       │
│   │  Conflict   │────────────────────────▶│ sheets_conflicts_   │       │
│   │  Detected   │                         │ total               │       │
│   └─────────────┘                         └─────────────────────┘       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Simulation Architecture

### 9.1 Mock Client Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Mock/Simulation Layer                              │
│                                                                         │
│   ┌───────────────────────────────────────────────────────────────┐     │
│   │               GoogleSheetsClient (trait)                      │     │
│   │                                                               │     │
│   │  +values() -> ValuesService                                   │     │
│   │  +spreadsheets() -> SpreadsheetsService                       │     │
│   └───────────────────────────────────────────────────────────────┘     │
│                              ▲                                          │
│                              │                                          │
│           ┌──────────────────┴──────────────────┐                       │
│           │                                     │                       │
│   ┌───────────────────┐               ┌───────────────────┐             │
│   │ RealSheetsClient  │               │ MockSheetsClient  │             │
│   │                   │               │                   │             │
│   │ - HttpTransport   │               │ - spreadsheets    │             │
│   │ - GoogleAuthProv  │               │ - recorded_ops    │             │
│   │                   │               │ - should_fail     │             │
│   │ (Production)      │               │                   │             │
│   └───────────────────┘               │ (Testing)         │             │
│                                       └───────────────────┘             │
│                                                                         │
│   MockSpreadsheet Structure:                                            │
│   ┌───────────────────────────────────────────────────────────────┐     │
│   │ MockSpreadsheet {                                             │     │
│   │   id: String,                                                 │     │
│   │   sheets: Map<String, MockSheet>,                             │     │
│   │   named_ranges: Vec<NamedRange>,                              │     │
│   │ }                                                             │     │
│   │                                                               │     │
│   │ MockSheet {                                                   │     │
│   │   name: String,                                               │     │
│   │   data: Vec<Vec<CellValue>>,  // Grid of cells                │     │
│   │ }                                                             │     │
│   └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Record/Replay Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Record/Replay System                                │
│                                                                         │
│   ┌────────────────────────┐     ┌────────────────────────┐             │
│   │     Recording Mode     │     │      Replay Mode       │             │
│   │                        │     │                        │             │
│   │  Request ─┬─▶ Sheets   │     │  Request ────▶ Matcher │             │
│   │           │     │      │     │                  │     │             │
│   │           │     ▼      │     │                  ▼     │             │
│   │           │  Response  │     │           ┌──────────┐ │             │
│   │           │     │      │     │           │ Recording│ │             │
│   │           ▼     ▼      │     │           │   File   │ │             │
│   │        Recorder        │     │           └──────────┘ │             │
│   │           │            │     │                  │     │             │
│   │           ▼            │     │                  ▼     │             │
│   │     ┌──────────┐       │     │           Response     │             │
│   │     │ JSON File│       │     │                        │             │
│   │     └──────────┘       │     │                        │             │
│   └────────────────────────┘     └────────────────────────┘             │
│                                                                         │
│   Recording Format:                                                     │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │ {                                                               │   │
│   │   "interactions": [                                             │   │
│   │     {                                                           │   │
│   │       "operation": "get",                                       │   │
│   │       "spreadsheet_id": "abc123",                               │   │
│   │       "range": "Sheet1!A1:D10",                                 │   │
│   │       "response": {                                             │   │
│   │         "values": [["a", "b"], ["c", "d"]]                      │   │
│   │       },                                                        │   │
│   │       "timestamp": "2025-01-01T00:00:00Z"                       │   │
│   │     }                                                           │   │
│   │   ]                                                             │   │
│   │ }                                                               │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Security Architecture

### 10.1 Credential Protection

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Credential Security Model                            │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                Service Account Key Protection                   │   │
│   │                                                                 │   │
│   │   - Private key wrapped in SecretString                         │   │
│   │   - No Debug impl on credential types                           │   │
│   │   - Zeroize on drop                                             │   │
│   │   - Key loaded once, cached in memory                           │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │                    Token Lifecycle                              │   │
│   │                                                                 │   │
│   │   Service Account Key                                           │   │
│   │         │                                                       │   │
│   │         ▼                                                       │   │
│   │   ┌─────────────┐                                               │   │
│   │   │  Generate   │  (JWT signing with private key)               │   │
│   │   │    JWT      │                                               │   │
│   │   └──────┬──────┘                                               │   │
│   │          │                                                      │   │
│   │          ▼                                                      │   │
│   │   ┌─────────────┐                                               │   │
│   │   │  Exchange   │  (POST to Google token endpoint)              │   │
│   │   │  for Token  │                                               │   │
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

### 10.2 Data Redaction

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PII Redaction in Logs                                │
│                                                                         │
│   Spreadsheet ID:  1BxiMVs0XRA...kGUyNg  →  1BxiM***yNg                  │
│   Range:           Sheet1!A1:Z100        →  Sheet1!A1:Z100 (preserved)  │
│   Cell Values:     Configurable redaction level                         │
│                                                                         │
│   Log Levels:                                                           │
│   - ERROR/WARN: IDs redacted, no cell data                              │
│   - INFO: IDs redacted, row counts only                                 │
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

**Next Phase:** Refinement - Edge case handling, error recovery procedures, performance optimizations, and security hardening.
