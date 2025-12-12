# Google Drive Integration - Architecture Document (Part 3)

**SPARC Phase 3: Architecture - Concurrency, Resilience & Observability**
**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/google-drive`

---

## Table of Contents

11. [Concurrency Patterns](#11-concurrency-patterns)
12. [Error Propagation](#12-error-propagation)
13. [Resilience Integration](#13-resilience-integration)
14. [Observability Architecture](#14-observability-architecture)
15. [Security Architecture](#15-security-architecture)
16. [Configuration Schema](#16-configuration-schema)
17. [Testing Architecture](#17-testing-architecture)
18. [Document Control](#18-document-control)

---

## 11. Concurrency Patterns

### 11.1 Async/Await Model

**Rust Implementation:**

```rust
// All API operations are async
#[async_trait]
pub trait FilesService: Send + Sync {
    async fn get(&self, file_id: &str) -> Result<File, GoogleDriveError>;
    async fn list(&self, params: Option<ListFilesParams>) -> Result<FileList, GoogleDriveError>;
    // ... other methods
}

// Tokio runtime is used for async execution
// Users can configure multi-threaded or single-threaded runtime
```

**TypeScript Implementation:**

```typescript
// Native async/await using Promises
interface FilesService {
  get(fileId: string, params?: GetFileParams): Promise<DriveFile>;
  list(params?: ListFilesParams): Promise<FileList>;
  // ... other methods
}

// Node.js event loop handles concurrency
```

**Concurrency Control:**

```
┌─────────────────────────────────────────────────────────┐
│                   Request Scheduler                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Semaphore (max_concurrent_requests)              │  │
│  │  Default: 10 concurrent requests                  │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                               │
│              ┌───────────┴───────────┐                   │
│              ▼                       ▼                   │
│    ┌─────────────────┐     ┌─────────────────┐         │
│    │   Request 1     │     │   Request 2     │         │
│    │   (in progress) │     │   (in progress) │         │
│    └─────────────────┘     └─────────────────┘         │
│                                                           │
│    ┌─────────────────┐     ┌─────────────────┐         │
│    │   Request 3     │     │   Request 4     │         │
│    │   (queued)      │     │   (queued)      │         │
│    └─────────────────┘     └─────────────────┘         │
└─────────────────────────────────────────────────────────┘
```

### 11.2 Connection Pooling

**HTTP Connection Pool Configuration:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_idle_per_host` | 10 | Maximum idle connections per host |
| `idle_timeout` | 90s | Idle connection timeout |
| `pool_max_idle_time` | 300s | Maximum time connection can be idle |
| `tcp_keepalive` | 60s | TCP keepalive interval |
| `http2_only` | true | Use HTTP/2 only |

**Pool Architecture:**

```
┌────────────────────────────────────────────────────────┐
│              HTTP Connection Pool                      │
│                                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │  googleapis.com:443 (HTTP/2)                     │ │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │ │
│  │  │ Conn 1 │ │ Conn 2 │ │ Conn 3 │ │ Idle   │   │ │
│  │  │ Active │ │ Active │ │ Active │ │        │   │ │
│  │  └────────┘ └────────┘ └────────┘ └────────┘   │ │
│  └──────────────────────────────────────────────────┘ │
│                                                         │
│  HTTP/2 Multiplexing:                                  │
│  - Multiple requests over single connection            │
│  - Stream-based concurrency                            │
│  - Automatic flow control                              │
└────────────────────────────────────────────────────────┘
```

### 11.3 Streaming Patterns

**Download Streaming:**

```rust
// Stream-based download (Rust)
pub async fn download_stream(
    &self,
    file_id: &str,
) -> Result<impl Stream<Item = Result<Bytes, GoogleDriveError>>, GoogleDriveError> {
    // Returns a stream that yields chunks as they arrive
    // Memory usage: O(chunk_size), not O(file_size)
}
```

**Stream Processing Flow:**

```
┌─────────────────────────────────────────────────────┐
│            Download Stream Pipeline                 │
│                                                      │
│  HTTP Response                                       │
│       │                                              │
│       ▼                                              │
│  ┌──────────────┐      ┌──────────────┐            │
│  │ Chunk Reader │─────▶│ Decompress   │            │
│  │ (8KB chunks) │      │ (if gzipped) │            │
│  └──────────────┘      └──────────────┘            │
│                             │                        │
│                             ▼                        │
│                        ┌──────────────┐             │
│                        │ Yield Bytes  │             │
│                        │ to Consumer  │             │
│                        └──────────────┘             │
│                                                      │
│  Memory Usage: ~8KB per stream (constant)           │
│  Backpressure: Automatic (stream pull-based)        │
└─────────────────────────────────────────────────────┘
```

### 11.4 Chunk Parallelization for Uploads

**Resumable Upload with Parallel Chunks:**

While Google Drive requires sequential chunk uploads, we can parallelize preparation:

```
┌─────────────────────────────────────────────────────────┐
│         Resumable Upload Pipeline                       │
│                                                          │
│  ┌────────────┐      ┌────────────┐                    │
│  │   File     │─────▶│  Chunker   │                    │
│  │  (100MB)   │      │  (8MB)     │                    │
│  └────────────┘      └────────────┘                    │
│                           │                              │
│         ┌─────────────────┼─────────────────┐           │
│         ▼                 ▼                 ▼           │
│    ┌────────┐       ┌────────┐       ┌────────┐       │
│    │Chunk 0 │       │Chunk 1 │       │Chunk 2 │       │
│    │Prepare │       │Prepare │       │Prepare │       │
│    │(hash)  │       │(hash)  │       │(hash)  │       │
│    └────────┘       └────────┘       └────────┘       │
│         │                 │                 │           │
│         └─────────────────┼─────────────────┘           │
│                           ▼                              │
│                   ┌───────────────┐                     │
│                   │Sequential     │                     │
│                   │Upload Queue   │                     │
│                   │(ordered)      │                     │
│                   └───────────────┘                     │
│                           │                              │
│                           ▼                              │
│                   ┌───────────────┐                     │
│                   │ Upload Worker │                     │
│                   │ (HTTP PUT)    │                     │
│                   └───────────────┘                     │
│                                                          │
│  Chunk Preparation: Parallel (CPU-bound hashing)        │
│  Chunk Upload: Sequential (API requirement)             │
└─────────────────────────────────────────────────────────┘
```

**Chunk Upload State Machine:**

```
┌──────────────┐
│   Pending    │
│   (queued)   │
└──────┬───────┘
       │
       ▼
┌──────────────┐      ┌──────────────┐
│  Uploading   │─────▶│   Success    │
│  (in flight) │      │  (308/200)   │
└──────┬───────┘      └──────────────┘
       │
       │ On Error
       ▼
┌──────────────┐      ┌──────────────┐
│  Query State │─────▶│   Retry      │
│  (Range: */N)│      │  (from last) │
└──────────────┘      └──────────────┘
```

### 11.5 Concurrent Request Limits

**Rate Limit Aware Concurrency:**

```rust
pub struct ConcurrencyLimiter {
    semaphore: Arc<Semaphore>,
    rate_limiter: Arc<RateLimiter>,
}

impl ConcurrencyLimiter {
    pub async fn acquire(&self) -> ConcurrencyGuard {
        // Wait for both semaphore and rate limit
        let permit = self.semaphore.acquire().await;
        self.rate_limiter.acquire().await;

        ConcurrencyGuard { permit }
    }
}

// Usage in request executor
async fn execute_request(&self, req: HttpRequest) -> Result<HttpResponse> {
    let _guard = self.concurrency_limiter.acquire().await;
    // Request is rate-limited and concurrency-controlled
    self.http_client.send(req).await
}
```

**Concurrency + Rate Limit Interaction:**

| Scenario | Behavior |
|----------|----------|
| Semaphore available, rate limit OK | Request proceeds immediately |
| Semaphore full, rate limit OK | Request queues for semaphore |
| Semaphore available, rate limit exceeded | Request waits for rate limit token |
| Both full | Request waits for both (whichever is available first) |

---

## 12. Error Propagation

### 12.1 Error Hierarchy

**Full Error Tree:**

```
GoogleDriveError
│
├─ ConfigurationError
│  ├─ MissingCredentials
│  │  └─ Fields: required_field: String
│  ├─ InvalidCredentials
│  │  └─ Fields: message: String
│  ├─ InvalidConfiguration
│  │  └─ Fields: field: String, reason: String
│  └─ MissingScope
│     └─ Fields: required: String, available: Vec<String>
│
├─ AuthenticationError
│  ├─ InvalidToken
│  │  └─ Fields: message: String
│  ├─ ExpiredToken
│  │  └─ Fields: expired_at: DateTime<Utc>
│  ├─ RefreshFailed
│  │  └─ Fields: message: String, http_status: Option<u16>
│  ├─ InvalidGrant
│  │  └─ Fields: grant_type: String, message: String
│  └─ InsufficientPermissions
│     └─ Fields: required_scope: String
│
├─ AuthorizationError
│  ├─ Forbidden
│  │  └─ Fields: message: String, reason: Option<String>
│  ├─ InsufficientPermissions
│  │  └─ Fields: resource: String, action: String
│  ├─ FileNotAccessible
│  │  └─ Fields: file_id: String, reason: String
│  ├─ DomainPolicy
│  │  └─ Fields: policy: String, message: String
│  └─ UserRateLimitExceeded (403)
│     └─ Fields: message: String, retry_after: Option<Duration>
│
├─ RequestError
│  ├─ ValidationError
│  │  └─ Fields: message: String
│  ├─ InvalidParameter
│  │  └─ Fields: parameter: String, value: String, message: String
│  ├─ MissingParameter
│  │  └─ Fields: parameter: String
│  ├─ InvalidQuery
│  │  └─ Fields: query: String, message: String
│  ├─ InvalidRange
│  │  └─ Fields: range: String, file_size: u64
│  └─ InvalidMimeType
│     └─ Fields: mime_type: String, supported: Vec<String>
│
├─ ResourceError
│  ├─ FileNotFound
│  │  └─ Fields: file_id: String
│  ├─ FolderNotFound
│  │  └─ Fields: folder_id: String
│  ├─ PermissionNotFound
│  │  └─ Fields: permission_id: String
│  ├─ CommentNotFound
│  │  └─ Fields: comment_id: String
│  ├─ RevisionNotFound
│  │  └─ Fields: revision_id: String
│  ├─ DriveNotFound
│  │  └─ Fields: drive_id: String
│  ├─ AlreadyExists
│  │  └─ Fields: resource_type: String, identifier: String
│  └─ CannotModify
│     └─ Fields: resource: String, reason: String
│
├─ QuotaError
│  ├─ StorageQuotaExceeded
│  │  └─ Fields: message: String, limit: u64, used: u64
│  ├─ UserRateLimitExceeded (429)
│  │  └─ Fields: message: String, retry_after: Option<Duration>
│  ├─ DailyLimitExceeded
│  │  └─ Fields: message: String, domain: Option<String>
│  └─ ProjectRateLimitExceeded
│     └─ Fields: message: String, retry_after: Option<Duration>
│
├─ UploadError
│  ├─ UploadInterrupted
│  │  └─ Fields: upload_uri: String, bytes_uploaded: u64, total_size: u64
│  ├─ UploadFailed
│  │  └─ Fields: message: String, upload_type: String
│  ├─ InvalidUploadRequest
│  │  └─ Fields: message: String
│  ├─ UploadSizeExceeded
│  │  └─ Fields: size: u64, max_size: u64
│  ├─ ResumableUploadExpired
│  │  └─ Fields: upload_uri: String
│  └─ ChunkSizeMismatch
│     └─ Fields: expected: usize, actual: usize
│
├─ ExportError
│  ├─ ExportNotSupported
│  │  └─ Fields: file_mime_type: String, export_mime_type: String
│  ├─ ExportSizeExceeded
│  │  └─ Fields: size: u64, max_size: u64
│  └─ InvalidExportFormat
│     └─ Fields: format: String
│
├─ NetworkError
│  ├─ ConnectionFailed
│  │  └─ Fields: message: String, url: String
│  ├─ Timeout
│  │  └─ Fields: timeout: Duration, operation: String
│  ├─ DnsResolutionFailed
│  │  └─ Fields: hostname: String
│  └─ TlsError
│     └─ Fields: message: String
│
├─ ServerError
│  ├─ InternalError
│  │  └─ Fields: message: String, request_id: Option<String>
│  ├─ BackendError
│  │  └─ Fields: message: String, request_id: Option<String>
│  ├─ ServiceUnavailable
│  │  └─ Fields: message: String, retry_after: Option<Duration>
│  └─ BadGateway
│     └─ Fields: message: String
│
└─ ResponseError
   ├─ DeserializationError
   │  └─ Fields: message: String, content: String
   ├─ UnexpectedFormat
   │  └─ Fields: expected: String, actual: String
   └─ InvalidJson
      └─ Fields: message: String, json: String
```

**Rust Enum Structure:**

```rust
#[derive(Debug, thiserror::Error)]
pub enum GoogleDriveError {
    #[error("Configuration error: {0}")]
    Configuration(#[from] ConfigurationError),

    #[error("Authentication error: {0}")]
    Authentication(#[from] AuthenticationError),

    #[error("Authorization error: {0}")]
    Authorization(#[from] AuthorizationError),

    #[error("Request error: {0}")]
    Request(#[from] RequestError),

    #[error("Resource error: {0}")]
    Resource(#[from] ResourceError),

    #[error("Quota error: {0}")]
    Quota(#[from] QuotaError),

    #[error("Upload error: {0}")]
    Upload(#[from] UploadError),

    #[error("Export error: {0}")]
    Export(#[from] ExportError),

    #[error("Network error: {0}")]
    Network(#[from] NetworkError),

    #[error("Server error: {0}")]
    Server(#[from] ServerError),

    #[error("Response error: {0}")]
    Response(#[from] ResponseError),
}

#[derive(Debug, thiserror::Error)]
pub enum QuotaError {
    #[error("Storage quota exceeded: {message} (used: {used}/{limit} bytes)")]
    StorageQuotaExceeded {
        message: String,
        limit: u64,
        used: u64,
    },

    #[error("User rate limit exceeded: {message}")]
    UserRateLimitExceeded {
        message: String,
        retry_after: Option<Duration>,
    },

    #[error("Daily limit exceeded: {message}")]
    DailyLimitExceeded {
        message: String,
        domain: Option<String>,
    },

    #[error("Project rate limit exceeded: {message}")]
    ProjectRateLimitExceeded {
        message: String,
        retry_after: Option<Duration>,
    },
}

// ... other error enums following same pattern
```

**TypeScript Class Structure:**

```typescript
export class GoogleDriveError extends Error {
  constructor(
    message: string,
    public readonly category: ErrorCategory,
    public readonly context?: ErrorContext
  ) {
    super(message);
    this.name = 'GoogleDriveError';
  }

  isRetryable(): boolean {
    return this.category.retryable;
  }

  retryAfter(): number | undefined {
    return this.context?.retryAfter;
  }

  statusCode(): number | undefined {
    return this.context?.statusCode;
  }
}

export class QuotaError extends GoogleDriveError {
  constructor(
    message: string,
    public readonly quotaType: QuotaType,
    public readonly retryAfter?: number
  ) {
    super(message, ErrorCategory.Quota, { retryAfter });
    this.name = 'QuotaError';
  }
}

export class StorageQuotaExceededError extends QuotaError {
  constructor(
    message: string,
    public readonly limit: number,
    public readonly used: number
  ) {
    super(message, QuotaType.Storage);
    this.name = 'StorageQuotaExceededError';
  }
}

// ... other error classes following same pattern
```

### 12.2 Retryable Classification

**Retryable Errors Matrix:**

| Error Type | Retryable | Retry Strategy | Max Attempts |
|------------|-----------|----------------|--------------|
| `QuotaError::UserRateLimitExceeded` | Yes | Use retry-after or 60s fixed | 5 |
| `QuotaError::ProjectRateLimitExceeded` | Yes | Use retry-after or 5min | 3 |
| `QuotaError::StorageQuotaExceeded` | No | - | 0 |
| `QuotaError::DailyLimitExceeded` | No | - | 0 |
| `NetworkError::Timeout` | Yes | Exponential backoff (1s base) | 3 |
| `NetworkError::ConnectionFailed` | Yes | Exponential backoff (1s base) | 3 |
| `NetworkError::DnsResolutionFailed` | No | - | 0 |
| `NetworkError::TlsError` | No | - | 0 |
| `ServerError::InternalError` | Yes | Exponential backoff (5s base) | 3 |
| `ServerError::ServiceUnavailable` | Yes | Use retry-after or 30s | 3 |
| `ServerError::BackendError` | Yes | Exponential backoff (5s base) | 3 |
| `ServerError::BadGateway` | Yes | Exponential backoff (1s base) | 3 |
| `UploadError::UploadInterrupted` | Yes | Resume from last byte | 3 |
| `UploadError::ResumableUploadExpired` | No | - | 0 |
| `AuthenticationError::ExpiredToken` | Yes | Refresh token, retry once | 1 |
| `AuthenticationError::InvalidToken` | No | - | 0 |
| `AuthenticationError::RefreshFailed` | No | - | 0 |
| `AuthorizationError::*` | No | - | 0 |
| `RequestError::*` | No | - | 0 |
| `ResourceError::*` | No | - | 0 |
| `ConfigurationError::*` | No | - | 0 |

**Retry-After Handling:**

```rust
impl GoogleDriveError {
    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            GoogleDriveError::Quota(QuotaError::UserRateLimitExceeded { retry_after, .. }) => {
                *retry_after
            }
            GoogleDriveError::Quota(QuotaError::ProjectRateLimitExceeded { retry_after, .. }) => {
                *retry_after
            }
            GoogleDriveError::Server(ServerError::ServiceUnavailable { retry_after, .. }) => {
                *retry_after
            }
            _ => None,
        }
    }
}

// Parse Retry-After header
fn parse_retry_after(header_value: &str) -> Option<Duration> {
    // Try parsing as seconds (integer)
    if let Ok(seconds) = header_value.parse::<u64>() {
        return Some(Duration::from_secs(seconds));
    }

    // Try parsing as HTTP date
    if let Ok(datetime) = DateTime::parse_from_rfc2822(header_value) {
        let now = Utc::now();
        let delay = datetime.signed_duration_since(now);
        if delay.num_seconds() > 0 {
            return Some(Duration::from_secs(delay.num_seconds() as u64));
        }
    }

    None
}
```

### 12.3 Error Context

**Request ID Tracking:**

```rust
pub struct ErrorContext {
    /// Google API request ID (from X-Goog-Request-Id header)
    pub request_id: Option<String>,

    /// Trace ID from distributed tracing
    pub trace_id: Option<String>,

    /// Span ID from distributed tracing
    pub span_id: Option<String>,

    /// Timestamp when error occurred
    pub timestamp: DateTime<Utc>,

    /// HTTP status code (if applicable)
    pub status_code: Option<u16>,

    /// Rate limit information
    pub rate_limit_info: Option<RateLimitInfo>,

    /// Retry attempt number
    pub retry_attempt: u32,

    /// Additional context fields
    pub extra: HashMap<String, String>,
}

pub struct RateLimitInfo {
    /// Rate limit type (user, project)
    pub limit_type: String,

    /// Current usage
    pub current_usage: Option<u64>,

    /// Limit value
    pub limit: Option<u64>,

    /// Reset time
    pub reset_at: Option<DateTime<Utc>>,

    /// Retry after duration
    pub retry_after: Option<Duration>,
}

impl GoogleDriveError {
    pub fn with_context(self, context: ErrorContext) -> Self {
        // Attach context to error
        match self {
            GoogleDriveError::Quota(mut e) => {
                e.context = Some(context);
                GoogleDriveError::Quota(e)
            }
            // ... pattern for each variant
            _ => self,
        }
    }

    pub fn context(&self) -> Option<&ErrorContext> {
        match self {
            GoogleDriveError::Quota(e) => e.context.as_ref(),
            // ... pattern for each variant
            _ => None,
        }
    }
}
```

**Error Context Enrichment Flow:**

```
Request Initiation
       │
       ▼
┌──────────────┐
│ Generate     │
│ Request ID   │
│ Trace ID     │
└──────┬───────┘
       │
       ▼
┌──────────────┐      ┌──────────────┐
│ Execute      │─────▶│ Response OK  │
│ Request      │      └──────────────┘
└──────┬───────┘
       │
       │ On Error
       ▼
┌──────────────┐
│ Extract      │
│ - X-Goog-Request-Id
│ - Status Code
│ - Retry-After
│ - Error Reason
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Map to       │
│ Error Type   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Enrich with  │
│ Context      │
│ - Request ID │
│ - Trace ID   │
│ - Rate Limit │
│ - Timestamp  │
└──────┬───────┘
       │
       ▼
Return Enriched Error
```

---

## 13. Resilience Integration

### 13.1 Retry Integration

**integrations-retry Usage:**

```rust
use integrations_retry::{RetryPolicy, ExponentialBackoff, Jitter};

pub struct GoogleDriveRetryConfig {
    /// Maximum number of retry attempts
    pub max_attempts: u32,

    /// Base delay for exponential backoff
    pub base_delay: Duration,

    /// Maximum delay between retries
    pub max_delay: Duration,

    /// Multiplier for exponential backoff
    pub multiplier: f64,

    /// Jitter to add to delays
    pub jitter: Jitter,

    /// Respect Retry-After headers
    pub respect_retry_after: bool,
}

impl Default for GoogleDriveRetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(60),
            multiplier: 2.0,
            jitter: Jitter::Full,
            respect_retry_after: true,
        }
    }
}
```

**Exponential Backoff Configuration:**

| Attempt | Base Delay | With Jitter (Full) | Total Wait |
|---------|------------|-------------------|------------|
| 1 | 1s | 0.5s - 1.5s | 0.5s - 1.5s |
| 2 | 2s | 1s - 3s | 1.5s - 4.5s |
| 3 | 4s | 2s - 6s | 3.5s - 10.5s |
| 4 | 8s | 4s - 12s | 7.5s - 22.5s |
| Max | 60s | 30s - 90s | Capped at max_delay |

**Jitter Types:**

```rust
pub enum Jitter {
    /// No jitter - use exact backoff
    None,

    /// Full jitter - random between 0 and backoff
    /// delay = random(0, base_delay * multiplier^attempt)
    Full,

    /// Equal jitter - half base + half random
    /// delay = base_delay/2 + random(0, base_delay/2)
    Equal,

    /// Decorrelated jitter - prevent synchronization
    /// delay = random(base_delay, prev_delay * multiplier)
    Decorrelated,
}
```

**Retry Decision Logic:**

```rust
impl RetryPolicy for GoogleDriveRetryPolicy {
    fn should_retry(&self, error: &GoogleDriveError, attempt: u32) -> bool {
        if attempt >= self.config.max_attempts {
            return false;
        }

        error.is_retryable()
    }

    fn delay(&self, error: &GoogleDriveError, attempt: u32) -> Duration {
        // Check for Retry-After header
        if self.config.respect_retry_after {
            if let Some(retry_after) = error.retry_after() {
                return retry_after.min(self.config.max_delay);
            }
        }

        // Calculate exponential backoff
        let base = self.config.base_delay.as_secs_f64();
        let delay = base * self.config.multiplier.powi(attempt as i32);
        let delay = delay.min(self.config.max_delay.as_secs_f64());

        // Apply jitter
        let jittered = match self.config.jitter {
            Jitter::None => delay,
            Jitter::Full => thread_rng().gen_range(0.0..=delay),
            Jitter::Equal => delay / 2.0 + thread_rng().gen_range(0.0..=(delay / 2.0)),
            Jitter::Decorrelated => {
                let prev = self.last_delay.load(Ordering::Relaxed);
                thread_rng().gen_range(base..=(prev * self.config.multiplier))
            }
        };

        Duration::from_secs_f64(jittered)
    }
}
```

### 13.2 Circuit Breaker Integration

**integrations-circuit-breaker Usage:**

```rust
use integrations_circuit_breaker::{CircuitBreaker, CircuitState};

pub struct GoogleDriveCircuitBreakerConfig {
    /// Number of consecutive failures to open circuit
    pub failure_threshold: u32,

    /// Number of consecutive successes to close circuit
    pub success_threshold: u32,

    /// Time to wait before attempting half-open
    pub reset_timeout: Duration,

    /// Time window for failure counting
    pub failure_window: Duration,
}

impl Default for GoogleDriveCircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_threshold: 5,
            success_threshold: 3,
            reset_timeout: Duration::from_secs(60),
            failure_window: Duration::from_secs(30),
        }
    }
}
```

**State Transitions:**

```
                    ┌─────────────────┐
                    │     CLOSED      │
                    │                 │
                    │ Success: OK     │
                    │ Failure: Count  │
                    └────────┬────────┘
                             │
         Failures >= threshold
                             │
                             ▼
                    ┌─────────────────┐
                    │      OPEN       │
                    │                 │
                    │ All requests    │
        ┌───────────│ rejected        │
        │           │ immediately     │
        │           └────────┬────────┘
        │                    │
        │      reset_timeout elapsed
        │                    │
        │                    ▼
        │           ┌─────────────────┐
        │           │   HALF_OPEN     │
        │           │                 │
        │           │ Allow limited   │
        │           │ test requests   │
        │           └────────┬────────┘
        │                    │
        │          ┌─────────┴─────────┐
        │          │                   │
        │   Success >= threshold    Any failure
        │          │                   │
        │          ▼                   ▼
        └─────── CLOSED              OPEN
```

**Failure Thresholds:**

| Scenario | Threshold | Reasoning |
|----------|-----------|-----------|
| Normal operation | 5 failures in 30s | Tolerate transient issues |
| High load | 10 failures in 60s | More lenient during load spikes |
| Critical path | 3 failures in 10s | Fail fast for user-facing operations |
| Background tasks | 20 failures in 120s | More tolerant for non-critical work |

**Circuit Breaker Wrapper:**

```rust
pub struct CircuitBreakerExecutor<T> {
    inner: T,
    circuit_breaker: Arc<CircuitBreaker>,
    metrics: Arc<MetricsRecorder>,
}

impl<T: RequestExecutor> RequestExecutor for CircuitBreakerExecutor<T> {
    async fn execute<R>(&self, request: ApiRequest) -> Result<R, GoogleDriveError> {
        // Check circuit state
        match self.circuit_breaker.state() {
            CircuitState::Open => {
                self.metrics.record_circuit_breaker_rejection();
                return Err(GoogleDriveError::Network(
                    NetworkError::ConnectionFailed(
                        "Circuit breaker is open".to_string()
                    )
                ));
            }
            _ => {}
        }

        // Execute request
        let result = self.inner.execute(request).await;

        // Record result in circuit breaker
        match &result {
            Ok(_) => self.circuit_breaker.record_success(),
            Err(e) if e.is_retryable() => self.circuit_breaker.record_failure(),
            Err(_) => {} // Don't count client errors
        }

        // Update metrics
        self.metrics.set_circuit_breaker_state(self.circuit_breaker.state());

        result
    }
}
```

### 13.3 Rate Limit Integration

**integrations-rate-limit Usage:**

```rust
use integrations_rate_limit::{TokenBucket, SlidingWindow};

pub struct GoogleDriveRateLimitConfig {
    /// Maximum requests per 100 seconds per user
    pub user_requests_per_100s: u32,

    /// Maximum requests per day per project
    pub project_requests_per_day: u32,

    /// Maximum concurrent requests
    pub max_concurrent: u32,

    /// Enable pre-emptive throttling
    pub preemptive_throttle: bool,

    /// Throttle threshold (% of limit)
    pub throttle_threshold: f64,
}

impl Default for GoogleDriveRateLimitConfig {
    fn default() -> Self {
        Self {
            user_requests_per_100s: 1000,
            project_requests_per_day: 10_000_000,
            max_concurrent: 10,
            preemptive_throttle: true,
            throttle_threshold: 0.9, // Start throttling at 90% of limit
        }
    }
}
```

**Token Bucket Configuration:**

```
┌─────────────────────────────────────────────────┐
│          Token Bucket (User Limit)              │
│                                                  │
│  Capacity: 1000 tokens                          │
│  Refill Rate: 10 tokens/second                  │
│  Refill Interval: 100ms (1 token)               │
│                                                  │
│  ┌────────────────────────────────────────┐    │
│  │ Tokens: [████████████████░░░░░░] 700   │    │
│  └────────────────────────────────────────┘    │
│                                                  │
│  State:                                          │
│  - Current: 700 tokens                           │
│  - Capacity: 1000 tokens                         │
│  - Last Refill: 2025-12-12T10:00:00Z            │
│  - Next Refill: 2025-12-12T10:00:00.1Z          │
│                                                  │
│  Request Handling:                               │
│  - Cost per request: 1 token                     │
│  - If tokens available: Consume & proceed        │
│  - If tokens unavailable: Wait for refill        │
└─────────────────────────────────────────────────┘
```

**Sliding Window Configuration:**

```
┌─────────────────────────────────────────────────┐
│       Sliding Window (Daily Project Limit)      │
│                                                  │
│  Window Size: 24 hours                          │
│  Max Requests: 10,000,000                       │
│  Bucket Size: 1 hour (24 buckets)              │
│                                                  │
│  Timeline:                                       │
│  ┌────────────────────────────────────────┐    │
│  │ Current Hour     : 450,000 requests    │    │
│  │ Previous Hour    : 420,000 requests    │    │
│  │ 2 Hours Ago      : 390,000 requests    │    │
│  │ ...              : ...                 │    │
│  │ 23 Hours Ago     : 380,000 requests    │    │
│  └────────────────────────────────────────┘    │
│                                                  │
│  Total in Window: 9,500,000 / 10,000,000        │
│  Remaining: 500,000 requests                    │
│                                                  │
│  As time advances:                               │
│  - Oldest bucket slides out                     │
│  - New bucket added for current hour            │
└─────────────────────────────────────────────────┘
```

**Rate Limit State Tracking:**

```rust
pub struct RateLimitTracker {
    user_bucket: Arc<Mutex<TokenBucket>>,
    project_window: Arc<Mutex<SlidingWindow>>,
    concurrent_semaphore: Arc<Semaphore>,
}

impl RateLimitTracker {
    pub async fn acquire(&self) -> RateLimitGuard {
        // Wait for all limits
        let concurrent_permit = self.concurrent_semaphore.acquire().await;
        self.user_bucket.lock().await.acquire(1).await;
        self.project_window.lock().await.record_request();

        RateLimitGuard {
            _permit: concurrent_permit,
        }
    }

    pub async fn should_throttle(&self) -> bool {
        let user_usage = self.user_bucket.lock().await.usage_percent();
        let project_usage = self.project_window.lock().await.usage_percent();

        user_usage > 0.9 || project_usage > 0.9
    }

    pub fn update_from_headers(&self, headers: &HeaderMap) {
        // Extract rate limit info from response headers
        // X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
        if let Some(remaining) = headers.get("x-ratelimit-remaining") {
            if let Ok(val) = remaining.to_str() {
                if let Ok(count) = val.parse::<u32>() {
                    // Update bucket to match server state
                    self.user_bucket.lock().await.set_tokens(count);
                }
            }
        }
    }
}
```

---

## 14. Observability Architecture

### 14.1 Tracing

**Span Attributes Table:**

| Attribute | Type | Always Present | Example |
|-----------|------|----------------|---------|
| `google_drive.service` | string | Yes | "files" |
| `google_drive.operation` | string | Yes | "list" |
| `google_drive.file_id` | string | Conditional | "1a2b3c4d5e" |
| `google_drive.folder_id` | string | Conditional | "folder123" |
| `google_drive.drive_id` | string | Conditional | "drive456" |
| `google_drive.query` | string | Conditional | "'folder123' in parents" |
| `google_drive.page_size` | int | Conditional | 100 |
| `google_drive.upload_type` | string | Conditional | "resumable" |
| `google_drive.upload.bytes` | int | Conditional | 10485760 |
| `google_drive.upload.chunk_size` | int | Conditional | 8388608 |
| `google_drive.download.bytes` | int | Conditional | 5242880 |
| `http.method` | string | Yes | "GET" |
| `http.url` | string | Yes | "https://www.googleapis.com/drive/v3/files" |
| `http.status_code` | int | On completion | 200 |
| `http.request_id` | string | On completion | "abc123xyz" |
| `error.type` | string | On error | "QuotaError::UserRateLimitExceeded" |
| `error.message` | string | On error | "Rate limit exceeded" |
| `error.retryable` | bool | On error | true |
| `retry.attempt` | int | On retry | 2 |
| `retry.delay_ms` | int | On retry | 2000 |

**Parent-Child Relationships:**

```
Root Span: google_drive.operation
│
├─ Child: http.request
│  └─ Child: http.connection (if new connection)
│
├─ Child: auth.get_token (if token refresh needed)
│  └─ Child: http.token_request
│
├─ Child: retry.attempt (if retried)
│  └─ Child: http.request (retry attempt)
│
└─ Child: deserialization (if response parsing)
```

**Example Trace:**

```
Trace ID: 7d1c3a4b2e5f6g8h
│
└─ Span: google_drive.files.list
   │ Duration: 847ms
   │ Attributes:
   │   - google_drive.service: "files"
   │   - google_drive.operation: "list"
   │   - google_drive.query: "'folder123' in parents"
   │   - google_drive.page_size: 100
   │   - http.method: "GET"
   │   - http.status_code: 200
   │
   ├─ Span: auth.get_token
   │  │ Duration: 45ms
   │  │ Attributes:
   │  │   - auth.cached: false
   │  │   - auth.refresh: true
   │  │
   │  └─ Span: http.token_request
   │     │ Duration: 42ms
   │     │ Attributes:
   │     │   - http.method: "POST"
   │     │   - http.url: "https://oauth2.googleapis.com/token"
   │     │   - http.status_code: 200
   │
   ├─ Span: http.request
   │  │ Duration: 320ms
   │  │ Attributes:
   │  │   - http.method: "GET"
   │  │   - http.url: "https://www.googleapis.com/drive/v3/files"
   │  │   - http.status_code: 200
   │  │   - http.request_id: "req_abc123"
   │  │   - http.response_size: 15360
   │
   └─ Span: deserialization
      │ Duration: 12ms
      │ Attributes:
      │   - format: "json"
      │   - item_count: 25
```

### 14.2 Metrics

**Counter Definitions:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `google_drive_requests_total` | service, operation, method, status | Total API requests |
| `google_drive_errors_total` | service, error_type | Total errors by type |
| `google_drive_rate_limit_hits_total` | type | Rate limit hits (user/project) |
| `google_drive_upload_bytes_total` | upload_type | Total bytes uploaded |
| `google_drive_download_bytes_total` | - | Total bytes downloaded |
| `google_drive_pagination_requests_total` | service, operation | Pagination iterations |
| `google_drive_resumable_upload_retries_total` | - | Resumable upload chunk retries |
| `google_drive_circuit_breaker_state_changes_total` | from_state, to_state | Circuit breaker transitions |

**Histogram Definitions:**

| Metric | Labels | Buckets | Description |
|--------|--------|---------|-------------|
| `google_drive_request_duration_seconds` | service, operation, method | 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10 | Request duration |
| `google_drive_upload_duration_seconds` | upload_type | 0.1, 0.5, 1, 5, 10, 30, 60, 120, 300 | Upload duration |
| `google_drive_download_duration_seconds` | - | 0.1, 0.5, 1, 5, 10, 30, 60, 120, 300 | Download duration |
| `google_drive_token_refresh_duration_seconds` | - | 0.01, 0.05, 0.1, 0.5, 1, 2, 5 | Token refresh time |

**Gauge Definitions:**

| Metric | Labels | Description |
|--------|--------|-------------|
| `google_drive_circuit_breaker_state` | - | Circuit state (0=closed, 0.5=half-open, 1=open) |
| `google_drive_concurrent_requests` | - | Current concurrent request count |
| `google_drive_rate_limit_remaining` | type | Remaining rate limit quota |
| `google_drive_storage_quota_used_bytes` | - | Storage quota used |
| `google_drive_storage_quota_limit_bytes` | - | Storage quota limit |

**Label Values:**

- `service`: files, permissions, comments, replies, revisions, changes, drives, about
- `operation`: create, get, list, update, delete, copy, export, upload, download
- `method`: GET, POST, PUT, PATCH, DELETE
- `status`: success, error, timeout, rate_limited
- `error_type`: quota, auth, network, server, request, resource
- `upload_type`: simple, multipart, resumable
- `type`: user, project (for rate limits)

### 14.3 Logging

**Log Levels by Operation Type:**

| Operation | Success Level | Error Level | Notes |
|-----------|---------------|-------------|-------|
| File create/update/delete | INFO | ERROR | User-initiated changes |
| File get/list | DEBUG | WARN | Read operations |
| Upload (< 5MB) | INFO | ERROR | Small uploads |
| Upload (> 5MB) | INFO | ERROR | Log progress every 10% |
| Download (< 5MB) | DEBUG | WARN | Small downloads |
| Download (> 5MB) | INFO | ERROR | Log progress every 10% |
| Permission changes | INFO | ERROR | Security-relevant |
| Token refresh | DEBUG | ERROR | Frequent operation |
| Rate limit hit | WARN | - | Throttling event |
| Circuit breaker open | ERROR | - | Service degradation |
| Retry attempt | DEBUG | - | Retry in progress |

**Structured Log Fields:**

| Field | Type | Always Present | Description |
|-------|------|----------------|-------------|
| `service` | string | Yes | Service name |
| `operation` | string | Yes | Operation name |
| `duration_ms` | integer | On completion | Operation duration |
| `status_code` | integer | On completion | HTTP status |
| `file_id` | string | Conditional | File ID |
| `folder_id` | string | Conditional | Folder ID |
| `error.type` | string | On error | Error category |
| `error.reason` | string | On error | Google API error reason |
| `error.retryable` | boolean | On error | Is retryable |
| `retry.attempt` | integer | On retry | Retry attempt number |
| `retry.max_attempts` | integer | On retry | Max retry attempts |
| `upload.bytes_sent` | integer | On upload | Bytes uploaded |
| `upload.total_size` | integer | On upload | Total upload size |
| `upload.progress_pct` | float | On upload progress | Upload progress % |
| `upload.upload_id` | string | Resumable upload | Upload session ID |
| `download.bytes_received` | integer | On download | Bytes downloaded |
| `download.total_size` | integer | On download | Total download size |
| `request_id` | string | On completion | Google request ID |
| `trace_id` | string | Yes | Distributed trace ID |
| `span_id` | string | Yes | Current span ID |

**Example Log Entries:**

```json
{
  "timestamp": "2025-12-12T10:15:30.123Z",
  "level": "INFO",
  "message": "File created successfully",
  "service": "files",
  "operation": "create",
  "file_id": "1a2b3c4d5e",
  "file_name": "document.pdf",
  "duration_ms": 245,
  "status_code": 200,
  "request_id": "req_abc123",
  "trace_id": "7d1c3a4b2e5f6g8h",
  "span_id": "span_xyz789"
}

{
  "timestamp": "2025-12-12T10:15:35.456Z",
  "level": "WARN",
  "message": "Rate limit exceeded, retrying after delay",
  "service": "files",
  "operation": "list",
  "error.type": "QuotaError::UserRateLimitExceeded",
  "error.retryable": true,
  "retry.attempt": 1,
  "retry.max_attempts": 5,
  "retry.delay_ms": 60000,
  "request_id": "req_def456",
  "trace_id": "8e2d4b5c3f6g7h9i",
  "span_id": "span_uvw123"
}

{
  "timestamp": "2025-12-12T10:16:00.789Z",
  "level": "INFO",
  "message": "Resumable upload progress",
  "service": "files",
  "operation": "upload",
  "upload.type": "resumable",
  "upload.bytes_sent": 52428800,
  "upload.total_size": 104857600,
  "upload.progress_pct": 50.0,
  "upload.upload_id": "upload_xyz789",
  "trace_id": "9f3e5c6d4g7h8i0j",
  "span_id": "span_rst456"
}
```

---

## 15. Security Architecture

### 15.1 SecretString Usage

**Rust Implementation:**

```rust
use secrecy::{Secret, ExposeSecret, Zeroize};

// All credentials wrapped in Secret<String>
pub struct OAuth2Credentials {
    pub client_id: String,  // Not secret
    pub client_secret: Secret<String>,  // Secret
    pub refresh_token: Secret<String>,  // Secret
}

pub struct ServiceAccountCredentials {
    pub client_email: String,  // Not secret
    pub private_key: Secret<String>,  // Secret - zeroized on drop
    pub project_id: Option<String>,  // Not secret
}

// Debug implementation redacts secrets
impl std::fmt::Debug for OAuth2Credentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OAuth2Credentials")
            .field("client_id", &self.client_id)
            .field("client_secret", &"[REDACTED]")
            .field("refresh_token", &"[REDACTED]")
            .finish()
    }
}

// No Display implementation for credentials
// (prevents accidental logging via println, etc.)
```

**TypeScript Implementation:**

```typescript
// Use Symbol for private fields
const SECRET = Symbol('secret');

export class SecretString {
  private [SECRET]: string;

  constructor(value: string) {
    this[SECRET] = value;
  }

  expose(): string {
    return this[SECRET];
  }

  // Redact in JSON serialization
  toJSON(): string {
    return '[REDACTED]';
  }

  // Redact in string conversion
  toString(): string {
    return '[REDACTED]';
  }

  // Zero memory on finalization (if supported)
  finalize(): void {
    if (this[SECRET]) {
      // Overwrite with zeros (best effort)
      this[SECRET] = '\0'.repeat(this[SECRET].length);
    }
  }
}

export interface OAuth2Credentials {
  clientId: string;  // Not secret
  clientSecret: SecretString;  // Secret
  refreshToken: SecretString;  // Secret
}
```

### 15.2 TLS Enforcement

**TLS Configuration:**

```rust
use reqwest::ClientBuilder;

pub fn create_http_client() -> Result<reqwest::Client, ConfigurationError> {
    ClientBuilder::new()
        // Enforce TLS 1.2+ only
        .min_tls_version(reqwest::tls::Version::TLS_1_2)

        // Enable certificate validation (default, but explicit)
        .danger_accept_invalid_certs(false)
        .danger_accept_invalid_hostnames(false)

        // Use system certificate store
        .use_rustls_tls()

        // Set timeout
        .timeout(Duration::from_secs(300))

        // Connection pooling
        .pool_max_idle_per_host(10)
        .pool_idle_timeout(Duration::from_secs(90))

        // Enable HTTP/2
        .http2_prior_knowledge()

        .build()
        .map_err(|e| ConfigurationError::HttpClientCreationFailed(e.to_string()))
}
```

**Certificate Pinning (Optional):**

```rust
// For high-security environments, pin Google's certificates
pub fn create_pinned_client() -> Result<reqwest::Client, ConfigurationError> {
    // Load Google's root certificates
    let google_roots = load_google_root_certificates()?;

    ClientBuilder::new()
        .min_tls_version(reqwest::tls::Version::TLS_1_2)
        .add_root_certificate(google_roots)
        .danger_accept_invalid_certs(false)
        .build()
        .map_err(|e| ConfigurationError::HttpClientCreationFailed(e.to_string()))
}
```

### 15.3 Token Storage Security

**In-Memory Token Cache:**

```rust
pub struct SecureTokenCache {
    // Tokens stored in memory with encryption at rest
    cache: Arc<Mutex<HashMap<String, EncryptedToken>>>,

    // Encryption key (derived from environment or key management service)
    encryption_key: Secret<[u8; 32]>,
}

struct EncryptedToken {
    ciphertext: Vec<u8>,
    nonce: Vec<u8>,
    expires_at: DateTime<Utc>,
}

impl SecureTokenCache {
    pub fn store(&self, key: String, token: AccessToken) -> Result<(), CacheError> {
        let mut cache = self.cache.lock().unwrap();

        // Encrypt token before storing
        let encrypted = self.encrypt_token(&token)?;

        cache.insert(key, encrypted);
        Ok(())
    }

    pub fn retrieve(&self, key: &str) -> Result<Option<AccessToken>, CacheError> {
        let cache = self.cache.lock().unwrap();

        if let Some(encrypted) = cache.get(key) {
            // Check expiration
            if Utc::now() >= encrypted.expires_at {
                return Ok(None);
            }

            // Decrypt token
            let token = self.decrypt_token(encrypted)?;
            Ok(Some(token))
        } else {
            Ok(None)
        }
    }

    fn encrypt_token(&self, token: &AccessToken) -> Result<EncryptedToken, CacheError> {
        // Use ChaCha20-Poly1305 for authenticated encryption
        use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};
        use chacha20poly1305::aead::{Aead, NewAead};

        let cipher = ChaCha20Poly1305::new(Key::from_slice(self.encryption_key.expose_secret()));
        let nonce = Nonce::from_slice(b"unique nonce"); // Generate unique nonce

        let plaintext = serde_json::to_vec(token)?;
        let ciphertext = cipher.encrypt(nonce, plaintext.as_ref())
            .map_err(|e| CacheError::EncryptionFailed(e.to_string()))?;

        Ok(EncryptedToken {
            ciphertext,
            nonce: nonce.to_vec(),
            expires_at: token.expires_at,
        })
    }
}
```

**Persistent Storage (Optional):**

```rust
// For long-lived tokens (refresh tokens), use OS keychain
pub struct KeychainTokenStore {
    service_name: String,
}

impl KeychainTokenStore {
    pub fn store_refresh_token(&self, account: &str, token: &Secret<String>) -> Result<(), KeychainError> {
        // Use platform-specific keychain
        #[cfg(target_os = "macos")]
        {
            // Use macOS Keychain
            keychain::macos::store(
                &self.service_name,
                account,
                token.expose_secret()
            )?;
        }

        #[cfg(target_os = "linux")]
        {
            // Use Secret Service (GNOME Keyring, KWallet)
            keychain::linux::store(
                &self.service_name,
                account,
                token.expose_secret()
            )?;
        }

        #[cfg(target_os = "windows")]
        {
            // Use Windows Credential Manager
            keychain::windows::store(
                &self.service_name,
                account,
                token.expose_secret()
            )?;
        }

        Ok(())
    }
}
```

### 15.4 Service Account Key Protection

**Private Key Handling:**

```rust
pub struct ServiceAccountPrivateKey {
    // Private key in PEM format
    key: Secret<String>,

    // Never log or display
    _phantom: PhantomData<()>,
}

impl ServiceAccountPrivateKey {
    pub fn from_pem(pem: String) -> Result<Self, AuthError> {
        // Validate PEM format
        if !pem.starts_with("-----BEGIN PRIVATE KEY-----") {
            return Err(AuthError::InvalidPrivateKey("Invalid PEM format".to_string()));
        }

        Ok(Self {
            key: Secret::new(pem),
            _phantom: PhantomData,
        })
    }

    pub fn from_file(path: &Path) -> Result<Self, AuthError> {
        // Read from file with restricted permissions
        let metadata = fs::metadata(path)?;

        // Ensure file has secure permissions (Unix)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = metadata.permissions().mode();
            if mode & 0o077 != 0 {
                return Err(AuthError::InsecureKeyFilePermissions(
                    "Private key file should have mode 0600".to_string()
                ));
            }
        }

        let pem = fs::read_to_string(path)?;
        Self::from_pem(pem)
    }

    pub fn sign(&self, message: &[u8]) -> Result<Vec<u8>, AuthError> {
        // Sign using RSA-SHA256
        use rsa::{RsaPrivateKey, PaddingScheme};
        use sha2::{Sha256, Digest};

        // Parse PEM
        let key = RsaPrivateKey::from_pkcs8_pem(self.key.expose_secret())
            .map_err(|e| AuthError::InvalidPrivateKey(e.to_string()))?;

        // Hash message
        let mut hasher = Sha256::new();
        hasher.update(message);
        let digest = hasher.finalize();

        // Sign
        let signature = key.sign(PaddingScheme::PKCS1v15Sign { hash: Some(rsa::Hash::SHA2_256) }, &digest)
            .map_err(|e| AuthError::SigningFailed(e.to_string()))?;

        Ok(signature)
    }
}

// Zero private key on drop
impl Drop for ServiceAccountPrivateKey {
    fn drop(&mut self) {
        // Secrecy crate handles zeroization
    }
}

// Never serialize private keys
impl Serialize for ServiceAccountPrivateKey {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str("[REDACTED]")
    }
}
```

**Key Rotation Support:**

```rust
pub struct RotatableServiceAccount {
    // Current active key
    current: ServiceAccountPrivateKey,

    // Previous key (for graceful rotation)
    previous: Option<ServiceAccountPrivateKey>,

    // Key rotation deadline
    rotate_before: DateTime<Utc>,
}

impl RotatableServiceAccount {
    pub fn rotate(&mut self, new_key: ServiceAccountPrivateKey) {
        self.previous = Some(std::mem::replace(&mut self.current, new_key));
        self.rotate_before = Utc::now() + Duration::days(90);
    }

    pub fn sign(&self, message: &[u8]) -> Result<Vec<u8>, AuthError> {
        // Always try current key first
        match self.current.sign(message) {
            Ok(sig) => Ok(sig),
            Err(_) if self.previous.is_some() => {
                // Fallback to previous key during rotation window
                self.previous.as_ref().unwrap().sign(message)
            }
            Err(e) => Err(e),
        }
    }
}
```

---

## 16. Configuration Schema

### 16.1 GoogleDriveConfig Fields

```rust
pub struct GoogleDriveConfig {
    // Authentication
    pub auth: AuthConfig,

    // API endpoints
    pub base_url: Url,
    pub upload_url: Url,

    // Timeouts
    pub timeout: Duration,
    pub connect_timeout: Duration,
    pub token_refresh_timeout: Duration,

    // Retry configuration
    pub max_retries: u32,
    pub retry_config: RetryConfig,

    // Circuit breaker configuration
    pub circuit_breaker: Option<CircuitBreakerConfig>,

    // Rate limiting configuration
    pub rate_limit: Option<RateLimitConfig>,

    // Upload/download settings
    pub upload_chunk_size: usize,
    pub download_buffer_size: usize,
    pub max_concurrent_uploads: usize,

    // Connection pooling
    pub max_idle_connections: usize,
    pub idle_timeout: Duration,

    // User agent
    pub user_agent: String,

    // Default fields for responses
    pub default_fields: Option<String>,

    // Enable features
    pub enable_tracing: bool,
    pub enable_metrics: bool,
}

pub enum AuthConfig {
    OAuth2(OAuth2Config),
    ServiceAccount(ServiceAccountConfig),
}

pub struct OAuth2Config {
    pub client_id: String,
    pub client_secret: Secret<String>,
    pub refresh_token: Secret<String>,
    pub token_uri: Url,
    pub scopes: Vec<String>,
}

pub struct ServiceAccountConfig {
    pub client_email: String,
    pub private_key: ServiceAccountPrivateKey,
    pub project_id: Option<String>,
    pub token_uri: Url,
    pub scopes: Vec<String>,
    pub subject: Option<String>,  // For domain-wide delegation
}
```

### 16.2 Environment Variables

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `GOOGLE_DRIVE_CLIENT_ID` | string | OAuth2 | - | OAuth 2.0 client ID |
| `GOOGLE_DRIVE_CLIENT_SECRET` | string | OAuth2 | - | OAuth 2.0 client secret |
| `GOOGLE_DRIVE_REFRESH_TOKEN` | string | OAuth2 | - | OAuth 2.0 refresh token |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL` | string | Service Account | - | Service account email |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY` | string | Service Account | - | Service account private key (PEM) |
| `GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY_FILE` | path | Service Account | - | Path to service account key file |
| `GOOGLE_DRIVE_PROJECT_ID` | string | No | - | Google Cloud project ID |
| `GOOGLE_DRIVE_SUBJECT` | string | No | - | Subject for domain-wide delegation |
| `GOOGLE_DRIVE_SCOPES` | string | No | "drive" | Comma-separated OAuth scopes |
| `GOOGLE_DRIVE_BASE_URL` | url | No | googleapis.com | API base URL |
| `GOOGLE_DRIVE_TIMEOUT` | duration | No | 300s | Request timeout |
| `GOOGLE_DRIVE_MAX_RETRIES` | int | No | 3 | Maximum retry attempts |
| `GOOGLE_DRIVE_UPLOAD_CHUNK_SIZE` | bytes | No | 8MB | Resumable upload chunk size |
| `GOOGLE_DRIVE_MAX_CONCURRENT` | int | No | 10 | Max concurrent requests |
| `GOOGLE_DRIVE_ENABLE_TRACING` | bool | No | true | Enable distributed tracing |
| `GOOGLE_DRIVE_ENABLE_METRICS` | bool | No | true | Enable metrics collection |

### 16.3 Defaults Table

| Configuration | Default Value | Min | Max | Units |
|---------------|---------------|-----|-----|-------|
| `base_url` | https://www.googleapis.com/drive/v3 | - | - | - |
| `upload_url` | https://www.googleapis.com/upload/drive/v3 | - | - | - |
| `timeout` | 300 | 1 | 3600 | seconds |
| `connect_timeout` | 10 | 1 | 60 | seconds |
| `token_refresh_timeout` | 30 | 5 | 300 | seconds |
| `max_retries` | 3 | 0 | 10 | attempts |
| `retry_base_delay` | 1 | 0.1 | 60 | seconds |
| `retry_max_delay` | 60 | 1 | 600 | seconds |
| `retry_multiplier` | 2.0 | 1.0 | 10.0 | - |
| `upload_chunk_size` | 8388608 | 262144 | - | bytes (256KB-unlimited) |
| `download_buffer_size` | 65536 | 4096 | 1048576 | bytes (4KB-1MB) |
| `max_concurrent_uploads` | 3 | 1 | 10 | - |
| `max_idle_connections` | 10 | 1 | 100 | - |
| `idle_timeout` | 90 | 10 | 600 | seconds |
| `circuit_breaker_failure_threshold` | 5 | 1 | 100 | failures |
| `circuit_breaker_success_threshold` | 3 | 1 | 20 | successes |
| `circuit_breaker_reset_timeout` | 60 | 5 | 600 | seconds |
| `rate_limit_user_per_100s` | 1000 | 1 | 10000 | requests |
| `rate_limit_project_per_day` | 10000000 | 1000 | - | requests |
| `user_agent` | integrations-google-drive/{version} | - | - | - |

### 16.4 Validation Rules

```rust
impl GoogleDriveConfig {
    pub fn validate(&self) -> Result<(), ConfigurationError> {
        // Validate URLs
        if self.base_url.scheme() != "https" {
            return Err(ConfigurationError::InvalidUrl(
                "base_url must use HTTPS".to_string()
            ));
        }

        if self.upload_url.scheme() != "https" {
            return Err(ConfigurationError::InvalidUrl(
                "upload_url must use HTTPS".to_string()
            ));
        }

        // Validate timeouts
        if self.timeout.as_secs() < 1 || self.timeout.as_secs() > 3600 {
            return Err(ConfigurationError::InvalidTimeout(
                "timeout must be between 1s and 3600s".to_string()
            ));
        }

        // Validate upload chunk size (must be multiple of 256KB)
        if self.upload_chunk_size % (256 * 1024) != 0 {
            return Err(ConfigurationError::InvalidChunkSize(
                "upload_chunk_size must be a multiple of 256KB".to_string()
            ));
        }

        if self.upload_chunk_size < 256 * 1024 {
            return Err(ConfigurationError::InvalidChunkSize(
                "upload_chunk_size must be at least 256KB".to_string()
            ));
        }

        // Validate retry configuration
        if self.max_retries > 10 {
            return Err(ConfigurationError::InvalidRetryConfig(
                "max_retries cannot exceed 10".to_string()
            ));
        }

        // Validate auth configuration
        self.auth.validate()?;

        Ok(())
    }
}

impl AuthConfig {
    fn validate(&self) -> Result<(), ConfigurationError> {
        match self {
            AuthConfig::OAuth2(config) => {
                if config.client_id.is_empty() {
                    return Err(ConfigurationError::MissingCredentials(
                        "client_id".to_string()
                    ));
                }

                if config.scopes.is_empty() {
                    return Err(ConfigurationError::MissingScope(
                        "At least one scope is required".to_string()
                    ));
                }

                Ok(())
            }
            AuthConfig::ServiceAccount(config) => {
                if config.client_email.is_empty() {
                    return Err(ConfigurationError::MissingCredentials(
                        "client_email".to_string()
                    ));
                }

                if !config.client_email.ends_with(".gserviceaccount.com") {
                    return Err(ConfigurationError::InvalidCredentials(
                        "Service account email must end with .gserviceaccount.com".to_string()
                    ));
                }

                if config.scopes.is_empty() {
                    return Err(ConfigurationError::MissingScope(
                        "At least one scope is required".to_string()
                    ));
                }

                Ok(())
            }
        }
    }
}
```

---

## 17. Testing Architecture

### 17.1 Mock Patterns

**Test Doubles Hierarchy:**

```
Test Doubles
│
├─ Fake (functional implementation)
│  ├─ FakeFilesService (in-memory file storage)
│  ├─ FakeAuthProvider (always returns valid token)
│  └─ FakeHttpTransport (in-memory HTTP simulator)
│
├─ Stub (returns canned responses)
│  ├─ StubFilesService (returns predefined files)
│  ├─ StubAuthProvider (returns fixed token)
│  └─ StubHttpTransport (returns fixed responses)
│
├─ Mock (verifiable expectations)
│  ├─ MockFilesService (verifies method calls)
│  ├─ MockAuthProvider (verifies token requests)
│  └─ MockHttpTransport (verifies HTTP calls)
│
└─ Spy (records interactions)
   ├─ SpyFilesService (wraps real service, records calls)
   ├─ SpyAuthProvider (wraps real auth, records refreshes)
   └─ SpyHttpTransport (wraps real HTTP, records requests)
```

**Mock Implementation Example:**

```rust
pub struct MockFilesService {
    expectations: Vec<Expectation>,
    calls: Vec<Call>,
}

pub struct Expectation {
    method: &'static str,
    matcher: Box<dyn Fn(&Call) -> bool>,
    response: Result<serde_json::Value, GoogleDriveError>,
    times: ExpectedTimes,
}

pub enum ExpectedTimes {
    Once,
    Exactly(usize),
    AtLeast(usize),
    AtMost(usize),
    Between(usize, usize),
    Any,
}

impl MockFilesService {
    pub fn expect_get(&mut self, file_id: impl Into<String>) -> &mut Expectation {
        let file_id = file_id.into();
        let exp = Expectation {
            method: "get",
            matcher: Box::new(move |call| {
                call.method == "get" && call.args.get("file_id") == Some(&file_id)
            }),
            response: Ok(json!({"id": file_id, "name": "test.txt"})),
            times: ExpectedTimes::Once,
        };
        self.expectations.push(exp);
        self.expectations.last_mut().unwrap()
    }

    pub fn verify(&self) {
        for exp in &self.expectations {
            let matching_calls = self.calls.iter()
                .filter(|call| (exp.matcher)(call))
                .count();

            match exp.times {
                ExpectedTimes::Once => assert_eq!(matching_calls, 1),
                ExpectedTimes::Exactly(n) => assert_eq!(matching_calls, n),
                ExpectedTimes::AtLeast(n) => assert!(matching_calls >= n),
                ExpectedTimes::AtMost(n) => assert!(matching_calls <= n),
                ExpectedTimes::Between(min, max) => {
                    assert!(matching_calls >= min && matching_calls <= max)
                }
                ExpectedTimes::Any => {}
            }
        }
    }
}
```

### 17.2 Test Doubles

**Fake HTTP Transport:**

```rust
pub struct FakeHttpTransport {
    // In-memory request/response mapping
    routes: HashMap<RouteKey, ResponseBuilder>,

    // Request history
    requests: Arc<Mutex<Vec<HttpRequest>>>,
}

#[derive(Hash, Eq, PartialEq)]
struct RouteKey {
    method: HttpMethod,
    path_pattern: String,
}

impl FakeHttpTransport {
    pub fn new() -> Self {
        Self {
            routes: HashMap::new(),
            requests: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn route(
        &mut self,
        method: HttpMethod,
        path: impl Into<String>,
    ) -> &mut ResponseBuilder {
        let key = RouteKey {
            method,
            path_pattern: path.into(),
        };
        self.routes.entry(key).or_insert_with(ResponseBuilder::new)
    }

    pub fn get_requests(&self) -> Vec<HttpRequest> {
        self.requests.lock().unwrap().clone()
    }
}

#[async_trait]
impl HttpTransport for FakeHttpTransport {
    async fn send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError> {
        // Record request
        self.requests.lock().unwrap().push(request.clone());

        // Find matching route
        let key = RouteKey {
            method: request.method.clone(),
            path_pattern: request.url.path().to_string(),
        };

        if let Some(builder) = self.routes.get(&key) {
            Ok(builder.build())
        } else {
            Err(TransportError::NotFound(
                format!("No route configured for {} {}", request.method, request.url)
            ))
        }
    }
}
```

### 17.3 Integration Test Setup

**Test Fixtures:**

```rust
pub struct GoogleDriveTestFixture {
    pub client: Arc<dyn GoogleDriveClient>,
    pub test_folder_id: String,
    pub created_files: Vec<String>,
    pub config: GoogleDriveConfig,
}

impl GoogleDriveTestFixture {
    pub async fn setup() -> Result<Self, GoogleDriveError> {
        // Load credentials from environment
        let config = GoogleDriveConfig::from_env()?;

        // Create client
        let client = GoogleDriveClientBuilder::new()
            .with_config(config.clone())
            .build()?;

        // Create test folder
        let test_folder = client.files().create_folder(CreateFolderRequest {
            name: format!("test-{}", Uuid::new_v4()),
            parents: None,
        }).await?;

        Ok(Self {
            client,
            test_folder_id: test_folder.id.clone(),
            created_files: vec![test_folder.id],
            config,
        })
    }

    pub async fn create_test_file(
        &mut self,
        name: impl Into<String>,
        content: impl Into<Bytes>,
    ) -> Result<File, GoogleDriveError> {
        let file = self.client.files().create_multipart(CreateMultipartRequest {
            name: name.into(),
            parents: vec![self.test_folder_id.clone()],
            content: content.into(),
            content_mime_type: "text/plain".to_string(),
        }).await?;

        self.created_files.push(file.id.clone());
        Ok(file)
    }

    pub async fn teardown(self) -> Result<(), GoogleDriveError> {
        // Delete all created files
        for file_id in self.created_files.iter().rev() {
            let _ = self.client.files().delete(file_id, None).await;
        }

        Ok(())
    }
}

// Usage in tests
#[tokio::test]
async fn test_file_operations() {
    let mut fixture = GoogleDriveTestFixture::setup().await.unwrap();

    // Test file creation
    let file = fixture.create_test_file("test.txt", "Hello, World!").await.unwrap();
    assert_eq!(file.name, "test.txt");

    // Test file retrieval
    let retrieved = fixture.client.files().get(&file.id, None).await.unwrap();
    assert_eq!(retrieved.id, file.id);

    // Cleanup
    fixture.teardown().await.unwrap();
}
```

**Test Categories:**

| Category | Tools | Purpose | Example |
|----------|-------|---------|---------|
| Unit Tests | Mocks | Test single components | Test error mapping |
| Integration Tests | Real API | Test end-to-end flows | Test file upload |
| Contract Tests | Recorded responses | Verify API compatibility | Test response schema |
| Performance Tests | Load generators | Measure throughput/latency | Test concurrent uploads |
| Fuzz Tests | Random inputs | Find edge cases | Test query parser |
| Snapshot Tests | Golden files | Catch unintended changes | Test serialization |

---

## 18. Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial architecture document (Part 3) |

---

**End of Architecture Phase (Part 3)**

This completes the third part of the architecture document covering concurrency patterns, error propagation, resilience integration, observability architecture, security architecture, configuration schema, and testing architecture.

The architecture provides:
- **Async/await patterns** for efficient I/O handling
- **Comprehensive error hierarchy** with retryable classification
- **Resilience primitives integration** (retry, circuit breaker, rate limiting)
- **Full observability** with tracing, metrics, and structured logging
- **Security best practices** for credential handling and TLS enforcement
- **Flexible configuration** with validation and environment variable support
- **Testable design** with mock patterns and test fixtures

*Next Phase: Implementation of the components following this architecture.*
