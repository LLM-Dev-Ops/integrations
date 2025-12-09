# AWS S3 Integration Architecture - Part 2

## SPARC Phase 3: Architecture (Continued)

*Part 2 of 2 - Security Architecture, Observability Architecture, Deployment & Configuration, Performance Considerations*

---

## 7. Security Architecture

### 7.1 Authentication & Authorization Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AUTHENTICATION ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Credential Resolution Chain                       │   │
│  │                                                                      │   │
│  │   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐     │   │
│  │   │ Explicit │───▶│   Env    │───▶│ Profile  │───▶│  IMDS    │     │   │
│  │   │  Creds   │    │  Vars    │    │  File    │    │ (EC2)    │     │   │
│  │   └──────────┘    └──────────┘    └──────────┘    └──────────┘     │   │
│  │        │              │               │               │             │   │
│  │        ▼              ▼               ▼               ▼             │   │
│  │   ┌──────────────────────────────────────────────────────────┐     │   │
│  │   │              CredentialProvider Interface                │     │   │
│  │   │  + get_credentials() -> Result<Credentials, Error>       │     │   │
│  │   │  + refresh_credentials() -> Result<Credentials, Error>   │     │   │
│  │   └──────────────────────────────────────────────────────────┘     │   │
│  │                              │                                      │   │
│  │                              ▼                                      │   │
│  │   ┌──────────────────────────────────────────────────────────┐     │   │
│  │   │               Credential Cache (TTL-based)               │     │   │
│  │   │  - Caches resolved credentials                           │     │   │
│  │   │  - Auto-refresh before expiration                        │     │   │
│  │   │  - Thread-safe access                                    │     │   │
│  │   └──────────────────────────────────────────────────────────┘     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     AWS Signature V4 Signing                        │   │
│  │                                                                      │   │
│  │   Request ──▶ Canonical Request ──▶ String to Sign ──▶ Signature   │   │
│  │                                                                      │   │
│  │   Components:                                                        │   │
│  │   ┌────────────────────────────────────────────────────────────┐   │   │
│  │   │ Canonical Request:                                          │   │   │
│  │   │   HTTPMethod + \n                                           │   │   │
│  │   │   CanonicalURI + \n                                         │   │   │
│  │   │   CanonicalQueryString + \n                                 │   │   │
│  │   │   CanonicalHeaders + \n                                     │   │   │
│  │   │   SignedHeaders + \n                                        │   │   │
│  │   │   HashedPayload                                             │   │   │
│  │   └────────────────────────────────────────────────────────────┘   │   │
│  │   ┌────────────────────────────────────────────────────────────┐   │   │
│  │   │ String to Sign:                                             │   │   │
│  │   │   Algorithm + \n                                            │   │   │
│  │   │   RequestDateTime + \n                                      │   │   │
│  │   │   CredentialScope + \n                                      │   │   │
│  │   │   HashedCanonicalRequest                                    │   │   │
│  │   └────────────────────────────────────────────────────────────┘   │   │
│  │   ┌────────────────────────────────────────────────────────────┐   │   │
│  │   │ Signature Derivation:                                       │   │   │
│  │   │   kDate    = HMAC-SHA256("AWS4" + SecretKey, Date)         │   │   │
│  │   │   kRegion  = HMAC-SHA256(kDate, Region)                     │   │   │
│  │   │   kService = HMAC-SHA256(kRegion, "s3")                     │   │   │
│  │   │   kSigning = HMAC-SHA256(kService, "aws4_request")          │   │   │
│  │   │   Signature = HMAC-SHA256(kSigning, StringToSign)           │   │   │
│  │   └────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Security Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SECURITY LAYERS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Layer 1: Transport Security                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  - TLS 1.2+ enforced for all connections                            │   │
│  │  - Certificate validation (configurable for testing)                │   │
│  │  - Connection pooling with secure defaults                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Layer 2: Request Signing                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  - AWS Signature V4 on every request                                │   │
│  │  - Content hash verification (SHA-256)                              │   │
│  │  - Timestamp validation (5-minute skew tolerance)                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Layer 3: Credential Protection                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  - Credentials never logged or exposed in errors                    │   │
│  │  - Session tokens for temporary credentials                         │   │
│  │  - Automatic credential rotation support                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Layer 4: Data Protection                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  - Server-side encryption (SSE-S3, SSE-KMS, SSE-C)                  │   │
│  │  - Client-side encryption support (optional)                        │   │
│  │  - Checksum validation (MD5, CRC32, SHA256)                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Layer 5: Access Control                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  - ACL support (predefined grants)                                  │   │
│  │  - Presigned URL expiration controls                                │   │
│  │  - Request conditions (if-match, if-none-match)                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Credential Security Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CREDENTIAL SECURITY MODEL                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Credential Types Supported                        │   │
│  │                                                                      │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │   │
│  │  │  Long-Term      │  │  Session-Based  │  │  Role-Based     │     │   │
│  │  │  Credentials    │  │  Credentials    │  │  (IMDS v2)      │     │   │
│  │  │                 │  │                 │  │                 │     │   │
│  │  │  - Access Key   │  │  - Access Key   │  │  - Fetched via  │     │   │
│  │  │  - Secret Key   │  │  - Secret Key   │  │    metadata     │     │   │
│  │  │  - No expiry    │  │  - Session Tok  │  │  - Auto-rotate  │     │   │
│  │  │                 │  │  - Expiration   │  │  - TTL-based    │     │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Security Invariants                               │   │
│  │                                                                      │   │
│  │  1. Credentials are NEVER:                                          │   │
│  │     - Logged in any log level                                       │   │
│  │     - Included in error messages                                    │   │
│  │     - Exposed via Debug/Display traits                              │   │
│  │     - Stored in plain text (use SecretString)                       │   │
│  │                                                                      │   │
│  │  2. Credentials ARE:                                                 │   │
│  │     - Loaded lazily on first use                                    │   │
│  │     - Cached with automatic refresh                                 │   │
│  │     - Cleared from memory when dropped                              │   │
│  │     - Protected by SecretString wrapper                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    SecretString Implementation                       │   │
│  │                                                                      │   │
│  │  struct SecretString {                                               │   │
│  │      inner: String,  // Not exposed                                  │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl Debug for SecretString {                                       │   │
│  │      fn fmt(&self, f: &mut Formatter) -> fmt::Result {               │   │
│  │          write!(f, "[REDACTED]")  // Never expose                    │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl Drop for SecretString {                                        │   │
│  │      fn drop(&mut self) {                                            │   │
│  │          self.inner.zeroize();  // Clear from memory                 │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.4 Presigned URL Security

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PRESIGNED URL SECURITY                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Generation Process:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Request ──▶ Add Query Params ──▶ Sign ──▶ Presigned URL            │   │
│  │                                                                      │   │
│  │  Query Parameters Added:                                             │   │
│  │  - X-Amz-Algorithm: AWS4-HMAC-SHA256                                │   │
│  │  - X-Amz-Credential: {access_key}/{date}/{region}/s3/aws4_request   │   │
│  │  - X-Amz-Date: {ISO8601 timestamp}                                  │   │
│  │  - X-Amz-Expires: {seconds until expiration}                        │   │
│  │  - X-Amz-SignedHeaders: host                                        │   │
│  │  - X-Amz-Signature: {calculated signature}                          │   │
│  │  - X-Amz-Security-Token: {session token, if applicable}             │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Security Controls:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │   │
│  │  │  Expiration     │  │  Content-Type   │  │  Content-MD5    │     │   │
│  │  │  Control        │  │  Enforcement    │  │  Validation     │     │   │
│  │  │                 │  │                 │  │                 │     │   │
│  │  │  Max: 7 days    │  │  If signed,     │  │  If signed,     │     │   │
│  │  │  Default: 1hr   │  │  must match     │  │  upload must    │     │   │
│  │  │  Min: 1 sec     │  │  on upload      │  │  match hash     │     │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘     │   │
│  │                                                                      │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │   │
│  │  │  Content-Length │  │  ACL            │  │  Encryption     │     │   │
│  │  │  Range          │  │  Enforcement    │  │  Headers        │     │   │
│  │  │                 │  │                 │  │                 │     │   │
│  │  │  Limit upload   │  │  If signed,     │  │  Can require    │     │   │
│  │  │  size if signed │  │  ACL enforced   │  │  SSE headers    │     │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘     │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Observability Architecture

### 8.1 Tracing Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DISTRIBUTED TRACING                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Span Hierarchy:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  s3.operation (root span)                                           │   │
│  │  ├── s3.credential_resolution                                       │   │
│  │  │   └── s3.credential_provider.{type}                              │   │
│  │  ├── s3.request_build                                               │   │
│  │  │   ├── s3.signing.canonical_request                               │   │
│  │  │   └── s3.signing.signature                                       │   │
│  │  ├── s3.http_request                                                │   │
│  │  │   ├── s3.connection_acquire                                      │   │
│  │  │   ├── s3.request_send                                            │   │
│  │  │   └── s3.response_receive                                        │   │
│  │  ├── s3.retry (if applicable)                                       │   │
│  │  │   └── s3.retry_delay                                             │   │
│  │  └── s3.response_parse                                              │   │
│  │      └── s3.xml_parse (if applicable)                               │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Span Attributes (OpenTelemetry Semantic Conventions):                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Required Attributes:                                                │   │
│  │  - rpc.system: "aws-api"                                            │   │
│  │  - rpc.service: "S3"                                                │   │
│  │  - rpc.method: "{operation_name}"                                   │   │
│  │  - aws.region: "{region}"                                           │   │
│  │  - aws.request_id: "{x-amz-request-id}"                             │   │
│  │                                                                      │   │
│  │  S3-Specific Attributes:                                             │   │
│  │  - s3.bucket: "{bucket_name}"                                       │   │
│  │  - s3.key: "{object_key}"                                           │   │
│  │  - s3.operation: "{put_object|get_object|...}"                      │   │
│  │                                                                      │   │
│  │  HTTP Attributes:                                                    │   │
│  │  - http.method: "{GET|PUT|DELETE|HEAD}"                             │   │
│  │  - http.url: "{sanitized_url}"                                      │   │
│  │  - http.status_code: "{status}"                                     │   │
│  │  - http.request_content_length: "{bytes}"                           │   │
│  │  - http.response_content_length: "{bytes}"                          │   │
│  │                                                                      │   │
│  │  Resilience Attributes:                                              │   │
│  │  - retry.count: "{attempts}"                                        │   │
│  │  - circuit_breaker.state: "{closed|open|half_open}"                 │   │
│  │  - rate_limit.remaining: "{count}"                                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Metrics Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          METRICS ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Counter Metrics                                 │   │
│  │                                                                      │   │
│  │  s3_requests_total{operation, status, region, bucket}               │   │
│  │  s3_errors_total{operation, error_type, region, bucket}             │   │
│  │  s3_retries_total{operation, region, bucket}                        │   │
│  │  s3_circuit_breaker_trips_total{bucket}                             │   │
│  │  s3_rate_limit_hits_total{bucket}                                   │   │
│  │  s3_multipart_uploads_completed_total{bucket}                       │   │
│  │  s3_multipart_uploads_aborted_total{bucket}                         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Histogram Metrics                               │   │
│  │                                                                      │   │
│  │  s3_request_duration_seconds{operation, region, bucket}             │   │
│  │    Buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60]     │   │
│  │                                                                      │   │
│  │  s3_request_size_bytes{operation, direction}                        │   │
│  │    Buckets: [1KB, 10KB, 100KB, 1MB, 10MB, 100MB, 1GB]               │   │
│  │                                                                      │   │
│  │  s3_multipart_part_size_bytes{bucket}                               │   │
│  │    Buckets: [5MB, 10MB, 25MB, 50MB, 100MB]                          │   │
│  │                                                                      │   │
│  │  s3_signing_duration_seconds{}                                      │   │
│  │    Buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01]                    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       Gauge Metrics                                  │   │
│  │                                                                      │   │
│  │  s3_active_requests{operation, bucket}                              │   │
│  │  s3_active_multipart_uploads{bucket}                                │   │
│  │  s3_connection_pool_size{bucket}                                    │   │
│  │  s3_connection_pool_available{bucket}                               │   │
│  │  s3_circuit_breaker_state{bucket} (0=closed, 1=half_open, 2=open)   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Logging Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LOGGING ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Log Levels and Content:                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  ERROR:                                                              │   │
│  │  - Operation failures after all retries exhausted                   │   │
│  │  - Circuit breaker state changes to OPEN                            │   │
│  │  - Authentication/authorization failures                            │   │
│  │  - Multipart upload failures                                        │   │
│  │                                                                      │   │
│  │  WARN:                                                               │   │
│  │  - Retry attempts (with attempt number)                             │   │
│  │  - Rate limit encountered                                           │   │
│  │  - Credential refresh triggered                                     │   │
│  │  - Slow requests (> threshold)                                      │   │
│  │                                                                      │   │
│  │  INFO:                                                               │   │
│  │  - Client initialization                                            │   │
│  │  - Multipart upload started/completed                               │   │
│  │  - Circuit breaker state transitions                                │   │
│  │  - Configuration changes                                            │   │
│  │                                                                      │   │
│  │  DEBUG:                                                              │   │
│  │  - Request/response headers (sanitized)                             │   │
│  │  - Credential provider chain resolution                             │   │
│  │  - Connection pool events                                           │   │
│  │  - Retry delay calculations                                         │   │
│  │                                                                      │   │
│  │  TRACE:                                                              │   │
│  │  - Full request/response bodies (truncated)                         │   │
│  │  - Signature calculation steps                                      │   │
│  │  - XML parsing details                                              │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Structured Log Fields:                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  {                                                                   │   │
│  │    "timestamp": "2025-01-15T10:30:00.123Z",                         │   │
│  │    "level": "INFO",                                                  │   │
│  │    "target": "integration_s3::client",                              │   │
│  │    "message": "S3 operation completed",                             │   │
│  │    "operation": "put_object",                                       │   │
│  │    "bucket": "my-bucket",                                           │   │
│  │    "key": "path/to/object.txt",                                     │   │
│  │    "region": "us-east-1",                                           │   │
│  │    "request_id": "ABCD1234...",                                     │   │
│  │    "duration_ms": 245,                                              │   │
│  │    "status": 200,                                                   │   │
│  │    "content_length": 1024,                                          │   │
│  │    "retry_count": 0,                                                │   │
│  │    "trace_id": "abc123...",                                         │   │
│  │    "span_id": "def456..."                                           │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Sensitive Data Handling:                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  NEVER LOG:                                                          │   │
│  │  - Access keys or secret keys                                       │   │
│  │  - Session tokens                                                   │   │
│  │  - Authorization headers                                            │   │
│  │  - Presigned URL signatures                                         │   │
│  │  - Object contents                                                  │   │
│  │                                                                      │   │
│  │  ALWAYS SANITIZE:                                                    │   │
│  │  - URLs (remove query params with signatures)                       │   │
│  │  - Headers (redact authorization)                                   │   │
│  │  - Error messages (remove credential hints)                         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.4 Health Check Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        HEALTH CHECK ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Health Check Flow                                 │   │
│  │                                                                      │   │
│  │  health_check()                                                      │   │
│  │      │                                                               │   │
│  │      ├── Check credential availability                              │   │
│  │      │   └── Can credentials be resolved?                           │   │
│  │      │                                                               │   │
│  │      ├── Check S3 connectivity                                      │   │
│  │      │   └── HEAD request to bucket (if configured)                 │   │
│  │      │                                                               │   │
│  │      ├── Check circuit breaker state                                │   │
│  │      │   └── Is circuit open for any bucket?                        │   │
│  │      │                                                               │   │
│  │      └── Return HealthStatus                                        │   │
│  │          ├── Healthy: All checks pass                               │   │
│  │          ├── Degraded: Circuit half-open or slow                    │   │
│  │          └── Unhealthy: Cannot connect or authenticate              │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Health Response Structure                         │   │
│  │                                                                      │   │
│  │  struct HealthStatus {                                               │   │
│  │      status: HealthState,      // Healthy | Degraded | Unhealthy    │   │
│  │      latency_ms: Option<u64>,  // Last check latency                │   │
│  │      last_check: DateTime,     // When last checked                 │   │
│  │      details: HealthDetails {                                        │   │
│  │          credentials_ok: bool,                                       │   │
│  │          connectivity_ok: bool,                                      │   │
│  │          circuit_breaker_state: CircuitState,                       │   │
│  │          active_connections: u32,                                   │   │
│  │          error_message: Option<String>,                             │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Deployment & Configuration Architecture

### 9.1 Configuration Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONFIGURATION HIERARCHY                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Priority (highest to lowest):                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  1. Explicit Code Configuration                                      │   │
│  │     S3ClientConfig::builder()                                       │   │
│  │         .region("us-west-2")                                        │   │
│  │         .endpoint("http://localhost:9000")                          │   │
│  │         .build()                                                    │   │
│  │                                                                      │   │
│  │  2. Environment Variables                                            │   │
│  │     AWS_REGION, AWS_DEFAULT_REGION                                  │   │
│  │     AWS_ENDPOINT_URL, AWS_ENDPOINT_URL_S3                           │   │
│  │     S3_MAX_RETRIES, S3_TIMEOUT_MS                                   │   │
│  │                                                                      │   │
│  │  3. Profile Configuration (~/.aws/config)                           │   │
│  │     [profile dev]                                                   │   │
│  │     region = us-east-1                                              │   │
│  │     s3 =                                                            │   │
│  │         max_concurrent_requests = 10                                │   │
│  │                                                                      │   │
│  │  4. Default Values (built into client)                              │   │
│  │     region = "us-east-1"                                            │   │
│  │     timeout = 30_000ms                                              │   │
│  │     max_retries = 3                                                 │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Configuration Schema

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONFIGURATION SCHEMA                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  S3ClientConfig:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Core Settings                                                    │   │
│  │  region: String             // AWS region (default: "us-east-1")    │   │
│  │  endpoint: Option<String>   // Custom endpoint (MinIO, LocalStack)  │   │
│  │  path_style: bool           // Force path-style URLs (default: false)│  │
│  │  use_dual_stack: bool       // Use dual-stack endpoints             │   │
│  │  use_fips: bool             // Use FIPS endpoints                   │   │
│  │                                                                      │   │
│  │  // Credential Settings                                              │   │
│  │  credentials: Option<Credentials>  // Explicit credentials          │   │
│  │  profile: Option<String>           // Named profile to use          │   │
│  │  use_imds: bool                    // Enable IMDS lookup            │   │
│  │                                                                      │   │
│  │  // Timeout Settings                                                 │   │
│  │  connect_timeout_ms: u64    // Connection timeout (default: 5000)   │   │
│  │  read_timeout_ms: u64       // Read timeout (default: 30000)        │   │
│  │  operation_timeout_ms: u64  // Overall timeout (default: 60000)     │   │
│  │                                                                      │   │
│  │  // Retry Settings                                                   │   │
│  │  max_retries: u32           // Max retry attempts (default: 3)      │   │
│  │  initial_backoff_ms: u64    // Initial backoff (default: 100)       │   │
│  │  max_backoff_ms: u64        // Max backoff (default: 20000)         │   │
│  │  backoff_multiplier: f64    // Backoff multiplier (default: 2.0)    │   │
│  │                                                                      │   │
│  │  // Circuit Breaker Settings                                         │   │
│  │  circuit_failure_threshold: u32  // Failures to open (default: 5)   │   │
│  │  circuit_reset_timeout_ms: u64   // Reset timeout (default: 30000)  │   │
│  │  circuit_half_open_requests: u32 // Test requests (default: 3)      │   │
│  │                                                                      │   │
│  │  // Rate Limit Settings                                              │   │
│  │  rate_limit_rps: Option<u32>     // Requests per second limit       │   │
│  │  rate_limit_burst: Option<u32>   // Burst allowance                 │   │
│  │                                                                      │   │
│  │  // Connection Pool Settings                                         │   │
│  │  max_connections: u32            // Pool size (default: 100)        │   │
│  │  idle_timeout_ms: u64            // Idle connection timeout         │   │
│  │                                                                      │   │
│  │  // Transfer Settings                                                │   │
│  │  multipart_threshold: u64        // Auto-multipart size (5MB)       │   │
│  │  multipart_part_size: u64        // Part size (8MB)                 │   │
│  │  multipart_concurrency: u32      // Parallel parts (default: 4)     │   │
│  │                                                                      │   │
│  │  // TLS Settings                                                     │   │
│  │  verify_ssl: bool                // Verify certificates (true)      │   │
│  │  ca_bundle: Option<PathBuf>      // Custom CA bundle                │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Environment Variable Mapping

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   ENVIRONMENT VARIABLE MAPPING                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  AWS Standard Variables:                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  AWS_ACCESS_KEY_ID          -> credentials.access_key_id            │   │
│  │  AWS_SECRET_ACCESS_KEY      -> credentials.secret_access_key        │   │
│  │  AWS_SESSION_TOKEN          -> credentials.session_token            │   │
│  │  AWS_REGION                 -> region                               │   │
│  │  AWS_DEFAULT_REGION         -> region (fallback)                    │   │
│  │  AWS_PROFILE                -> profile                              │   │
│  │  AWS_ENDPOINT_URL           -> endpoint (global)                    │   │
│  │  AWS_ENDPOINT_URL_S3        -> endpoint (S3-specific)               │   │
│  │  AWS_CA_BUNDLE              -> ca_bundle                            │   │
│  │  AWS_USE_FIPS_ENDPOINT      -> use_fips                             │   │
│  │  AWS_USE_DUALSTACK_ENDPOINT -> use_dual_stack                       │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Integration-Specific Variables:                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  S3_INTEGRATION_TIMEOUT_MS           -> operation_timeout_ms        │   │
│  │  S3_INTEGRATION_MAX_RETRIES          -> max_retries                 │   │
│  │  S3_INTEGRATION_PATH_STYLE           -> path_style                  │   │
│  │  S3_INTEGRATION_MULTIPART_THRESHOLD  -> multipart_threshold         │   │
│  │  S3_INTEGRATION_MULTIPART_PART_SIZE  -> multipart_part_size         │   │
│  │  S3_INTEGRATION_MULTIPART_CONCURRENCY-> multipart_concurrency       │   │
│  │  S3_INTEGRATION_RATE_LIMIT_RPS       -> rate_limit_rps              │   │
│  │  S3_INTEGRATION_CB_THRESHOLD         -> circuit_failure_threshold   │   │
│  │  S3_INTEGRATION_CB_RESET_MS          -> circuit_reset_timeout_ms    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.4 Deployment Patterns

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       DEPLOYMENT PATTERNS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Pattern 1: Local Development (LocalStack/MinIO)                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      │   │
│  │  │ Application  │─────▶│  S3 Client   │─────▶│  LocalStack  │      │   │
│  │  │              │      │  (path_style)│      │  :4566       │      │   │
│  │  └──────────────┘      └──────────────┘      └──────────────┘      │   │
│  │                                                                      │   │
│  │  Configuration:                                                      │   │
│  │  - endpoint: "http://localhost:4566"                                │   │
│  │  - path_style: true                                                 │   │
│  │  - verify_ssl: false                                                │   │
│  │  - credentials: static ("test", "test")                             │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Pattern 2: AWS EC2/ECS with IAM Role                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      │   │
│  │  │ Application  │─────▶│  S3 Client   │─────▶│    AWS S3    │      │   │
│  │  │  (EC2/ECS)   │      │  (IMDS creds)│      │              │      │   │
│  │  └──────────────┘      └──────────────┘      └──────────────┘      │   │
│  │        │                                                             │   │
│  │        ▼                                                             │   │
│  │  ┌──────────────┐                                                    │   │
│  │  │    IMDS      │  Credentials auto-refreshed                       │   │
│  │  │  169.254...  │                                                    │   │
│  │  └──────────────┘                                                    │   │
│  │                                                                      │   │
│  │  Configuration:                                                      │   │
│  │  - region: from IMDS or env                                         │   │
│  │  - credentials: from IMDS (automatic)                               │   │
│  │  - use_imds: true                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Pattern 3: Lambda Function                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      │   │
│  │  │   Lambda     │─────▶│  S3 Client   │─────▶│    AWS S3    │      │   │
│  │  │  Function    │      │  (env creds) │      │              │      │   │
│  │  └──────────────┘      └──────────────┘      └──────────────┘      │   │
│  │                                                                      │   │
│  │  Configuration:                                                      │   │
│  │  - region: from AWS_REGION env var                                  │   │
│  │  - credentials: from AWS_* env vars (Lambda runtime)                │   │
│  │  - Reduced timeouts (Lambda has 15min limit)                        │   │
│  │  - Disabled connection keep-alive (for cold starts)                 │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Pattern 4: Cross-Account Access                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Account A                        Account B                          │   │
│  │  ┌──────────────┐                ┌──────────────┐                   │   │
│  │  │ Application  │───AssumeRole──▶│   S3 Bucket  │                   │   │
│  │  │  (Role A)    │                │  (Policy)    │                   │   │
│  │  └──────────────┘                └──────────────┘                   │   │
│  │                                                                      │   │
│  │  Configuration:                                                      │   │
│  │  - Use STS AssumeRole for cross-account access                      │   │
│  │  - Session credentials with expiration                              │   │
│  │  - External ID for enhanced security                                │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Performance Architecture

### 10.1 Connection Pooling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONNECTION POOLING ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Connection Pool Design                            │   │
│  │                                                                      │   │
│  │                    ┌─────────────────────────┐                       │   │
│  │                    │    Connection Pool      │                       │   │
│  │                    │    (per endpoint)       │                       │   │
│  │                    │                         │                       │   │
│  │   Request ────────▶│  ┌───┐ ┌───┐ ┌───┐    │────────▶ S3 Endpoint  │   │
│  │                    │  │ C │ │ C │ │ C │    │                       │   │
│  │   Request ────────▶│  │ 1 │ │ 2 │ │ 3 │    │────────▶ S3 Endpoint  │   │
│  │                    │  └───┘ └───┘ └───┘    │                       │   │
│  │   Request ────────▶│       ...             │────────▶ S3 Endpoint  │   │
│  │                    │  ┌───┐ ┌───┐          │                       │   │
│  │                    │  │ C │ │ C │ (idle)   │                       │   │
│  │                    │  │ N │ │...│          │                       │   │
│  │                    │  └───┘ └───┘          │                       │   │
│  │                    └─────────────────────────┘                       │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Pool Configuration:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  max_connections: 100        // Max connections per pool            │   │
│  │  min_connections: 0          // Min idle connections                │   │
│  │  idle_timeout: 90s           // Close idle connections after        │   │
│  │  max_lifetime: 300s          // Max connection lifetime             │   │
│  │  connection_timeout: 5s      // Timeout waiting for connection      │   │
│  │                                                                      │   │
│  │  Per-Bucket Pools:                                                   │   │
│  │  - Regional bucket: bucket.s3.region.amazonaws.com                  │   │
│  │  - Custom endpoint: user-specified endpoint                         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Streaming Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STREAMING ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Upload Streaming:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  AsyncRead ──▶ ChunkedEncoder ──▶ HTTP Client ──▶ S3                │   │
│  │                                                                      │   │
│  │  Benefits:                                                           │   │
│  │  - Constant memory usage regardless of object size                  │   │
│  │  - Support for unknown content length                               │   │
│  │  - Backpressure handling                                            │   │
│  │                                                                      │   │
│  │  Implementation:                                                     │   │
│  │  - Use chunked transfer encoding                                    │   │
│  │  - Buffer size: 8KB - 64KB (configurable)                           │   │
│  │  - Calculate content hash incrementally (for signing)               │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Download Streaming:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  S3 ──▶ HTTP Response Body ──▶ AsyncRead ──▶ Consumer               │   │
│  │                                                                      │   │
│  │  Benefits:                                                           │   │
│  │  - Stream directly to disk without full buffering                   │   │
│  │  - Support for range requests (partial downloads)                   │   │
│  │  - Progress tracking                                                │   │
│  │                                                                      │   │
│  │  Implementation:                                                     │   │
│  │  - Return impl AsyncRead from get_object                            │   │
│  │  - Yield chunks as they arrive                                      │   │
│  │  - Support cancellation via Drop                                    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Multipart Concurrent Upload:                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │         ┌────────────┐                                               │   │
│  │         │   Part 1   │──────▶ S3 (concurrent)                       │   │
│  │         └────────────┘                                               │   │
│  │  Input  ┌────────────┐                                               │   │
│  │  Stream │   Part 2   │──────▶ S3 (concurrent)                       │   │
│  │    │    └────────────┘                                               │   │
│  │    ▼    ┌────────────┐                                               │   │
│  │  Split  │   Part 3   │──────▶ S3 (concurrent)                       │   │
│  │         └────────────┘                                               │   │
│  │         ┌────────────┐                                               │   │
│  │         │   Part N   │──────▶ S3 (queued)                           │   │
│  │         └────────────┘                                               │   │
│  │                                                                      │   │
│  │  Concurrency Control:                                                │   │
│  │  - Semaphore limits concurrent uploads (default: 4)                 │   │
│  │  - Backpressure when all slots busy                                 │   │
│  │  - Failed parts retried independently                               │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.3 Caching Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CACHING STRATEGY                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Credential Cache:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │  Credentials {                                               │    │   │
│  │  │    access_key_id: "...",                                    │    │   │
│  │  │    secret_access_key: SecretString,                         │    │   │
│  │  │    session_token: Option<SecretString>,                     │    │   │
│  │  │    expiration: Option<DateTime>,                            │    │   │
│  │  │  }                                                           │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                                                                      │   │
│  │  Cache Behavior:                                                     │   │
│  │  - Cache until 5 minutes before expiration                          │   │
│  │  - Refresh asynchronously before expiration                         │   │
│  │  - Lock-free reads with RwLock for refresh                          │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Signing Key Cache:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Key: (date, region, service)                                       │   │
│  │  Value: DerivedSigningKey (kSigning from SigV4)                     │   │
│  │                                                                      │   │
│  │  Cache Behavior:                                                     │   │
│  │  - Cache per calendar day (UTC)                                     │   │
│  │  - Evict on date change                                             │   │
│  │  - Max entries: 10 (multiple regions)                               │   │
│  │                                                                      │   │
│  │  Benefit: Avoid repeated HMAC chain calculation                     │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Region Cache:                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Key: bucket_name                                                   │   │
│  │  Value: region                                                      │   │
│  │                                                                      │   │
│  │  Cache Behavior:                                                     │   │
│  │  - Populate on first request (HEAD bucket or redirect)              │   │
│  │  - Long TTL (buckets rarely move)                                   │   │
│  │  - Invalidate on 301 redirect                                       │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.4 Performance Optimizations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     PERFORMANCE OPTIMIZATIONS                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Request Batching                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Delete multiple objects in single request                       │   │
│  │  delete_objects(bucket, keys: Vec<String>)                          │   │
│  │    └── Single HTTP request for up to 1000 keys                      │   │
│  │                                                                      │   │
│  │  // Batch tag operations                                            │   │
│  │  put_object_tagging(bucket, key, tags: Vec<Tag>)                    │   │
│  │    └── All tags in single request                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  2. Parallel Operations                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Transfer Manager parallel downloads                             │   │
│  │  download_objects(bucket, keys: Vec<String>, dest_dir: Path)        │   │
│  │    └── Concurrent downloads with semaphore control                  │   │
│  │                                                                      │   │
│  │  // Parallel listing for large buckets                              │   │
│  │  list_objects_parallel(bucket, prefixes: Vec<String>)               │   │
│  │    └── Concurrent prefix listing                                    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  3. Memory Efficiency                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Techniques:                                                         │   │
│  │  - Use bytes::Bytes for zero-copy where possible                    │   │
│  │  - Stream responses instead of buffering                            │   │
│  │  - Preallocate buffers when size is known                           │   │
│  │  - Reuse signing buffers via thread-local storage                   │   │
│  │                                                                      │   │
│  │  Memory Budgets:                                                     │   │
│  │  - Small object (< 256KB): buffer entirely                          │   │
│  │  - Medium object (256KB - 5MB): stream with small buffer            │   │
│  │  - Large object (> 5MB): multipart with concurrent streams          │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  4. Compute Efficiency                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Signing Optimization:                                               │   │
│  │  - Cache signing keys per date/region                               │   │
│  │  - Use UNSIGNED-PAYLOAD for presigned uploads                       │   │
│  │  - Streaming signature for large uploads                            │   │
│  │                                                                      │   │
│  │  XML Parsing:                                                        │   │
│  │  - Use quick-xml for fast parsing                                   │   │
│  │  - Stream parse for large listings                                  │   │
│  │  - Skip unknown elements                                            │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Testing Architecture

### 11.1 Test Pyramid

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TEST PYRAMID                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                          ┌───────────────┐                                  │
│                          │   E2E Tests   │  ← AWS/LocalStack               │
│                          │   (few)       │                                  │
│                          └───────────────┘                                  │
│                        ┌───────────────────┐                                │
│                        │ Integration Tests │  ← LocalStack                 │
│                        │   (moderate)      │                                │
│                        └───────────────────┘                                │
│                      ┌───────────────────────┐                              │
│                      │    Contract Tests     │  ← Mock HTTP                │
│                      │   (comprehensive)     │                              │
│                      └───────────────────────┘                              │
│                    ┌───────────────────────────┐                            │
│                    │       Unit Tests          │  ← Pure logic             │
│                    │      (extensive)          │                            │
│                    └───────────────────────────┘                            │
│                                                                             │
│  London-School TDD Focus:                                                   │
│  - Unit tests verify behavior through mocked collaborators                 │
│  - Integration tests verify component composition                          │
│  - Contract tests verify API compatibility                                 │
│  - E2E tests verify deployment correctness                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 Mock Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MOCK ARCHITECTURE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Mock Layer Structure                              │   │
│  │                                                                      │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │                    MockS3Client                              │    │   │
│  │  │                                                              │    │   │
│  │  │  - Implements S3Client trait                                 │    │   │
│  │  │  - Records all method calls                                  │    │   │
│  │  │  - Returns configurable responses                            │    │   │
│  │  │  - Supports failure injection                                │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                              │                                       │   │
│  │                              ▼                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │                  MockHttpTransport                           │    │   │
│  │  │                                                              │    │   │
│  │  │  - Implements HttpTransport trait                            │    │   │
│  │  │  - Records HTTP requests                                     │    │   │
│  │  │  - Returns preconfigured responses                           │    │   │
│  │  │  - Simulates network conditions                              │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                              │                                       │   │
│  │                              ▼                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │               MockCredentialProvider                         │    │   │
│  │  │                                                              │    │   │
│  │  │  - Implements CredentialProvider trait                       │    │   │
│  │  │  - Returns static credentials                                │    │   │
│  │  │  - Simulates credential expiration                           │    │   │
│  │  │  - Tests refresh behavior                                    │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Mock Capabilities:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Call Recording:                                                     │   │
│  │  - Capture all method invocations                                   │   │
│  │  - Record parameters passed                                         │   │
│  │  - Track call order                                                 │   │
│  │  - Count invocations                                                │   │
│  │                                                                      │   │
│  │  Response Configuration:                                             │   │
│  │  - Set success responses                                            │   │
│  │  - Configure error responses                                        │   │
│  │  - Sequence of responses                                            │   │
│  │  - Conditional responses based on input                             │   │
│  │                                                                      │   │
│  │  Failure Injection:                                                  │   │
│  │  - Network timeouts                                                 │   │
│  │  - Connection errors                                                │   │
│  │  - HTTP errors (4xx, 5xx)                                           │   │
│  │  - Slow responses                                                   │   │
│  │  - Partial responses                                                │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Error Recovery Architecture

### 12.1 Error Classification & Recovery

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ERROR CLASSIFICATION & RECOVERY                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Error Decision Tree                               │   │
│  │                                                                      │   │
│  │                        ┌─────────┐                                   │   │
│  │                        │  Error  │                                   │   │
│  │                        └────┬────┘                                   │   │
│  │                             │                                        │   │
│  │              ┌──────────────┼──────────────┐                        │   │
│  │              ▼              ▼              ▼                        │   │
│  │        ┌──────────┐  ┌──────────┐  ┌──────────┐                    │   │
│  │        │ Retryable│  │ Terminal │  │  Client  │                    │   │
│  │        │  Error   │  │  Error   │  │  Error   │                    │   │
│  │        └────┬─────┘  └────┬─────┘  └────┬─────┘                    │   │
│  │             │             │             │                           │   │
│  │             ▼             ▼             ▼                           │   │
│  │        ┌──────────┐  ┌──────────┐  ┌──────────┐                    │   │
│  │        │  Retry   │  │  Return  │  │  Return  │                    │   │
│  │        │ w/backoff│  │  Error   │  │  Error   │                    │   │
│  │        └──────────┘  └──────────┘  └──────────┘                    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Retryable Errors:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  HTTP 500, 502, 503, 504    → Service errors, retry                 │   │
│  │  HTTP 429                    → Rate limit, retry with backoff       │   │
│  │  Connection timeout          → Network issue, retry                 │   │
│  │  Connection reset            → Network issue, retry                 │   │
│  │  SlowDown error              → S3 throttling, exponential backoff   │   │
│  │  InternalError               → S3 internal issue, retry             │   │
│  │  ServiceUnavailable          → S3 unavailable, retry                │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Terminal Errors (Never Retry):                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  HTTP 400 BadRequest         → Invalid request format               │   │
│  │  HTTP 403 Forbidden          → Access denied                        │   │
│  │  HTTP 404 NotFound           → Resource doesn't exist               │   │
│  │  HTTP 409 Conflict           → Concurrent modification              │   │
│  │  InvalidAccessKeyId          → Bad credentials                      │   │
│  │  SignatureDoesNotMatch       → Signing error                        │   │
│  │  NoSuchBucket                → Bucket doesn't exist                 │   │
│  │  BucketAlreadyExists         → Duplicate creation                   │   │
│  │  InvalidBucketName           → Bad bucket name                      │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Multipart Upload Recovery

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   MULTIPART UPLOAD RECOVERY                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Recovery Flow                                     │   │
│  │                                                                      │   │
│  │  Upload Start ──▶ Part 1 ✓ ──▶ Part 2 ✗ ──▶ Retry Part 2           │   │
│  │                                     │                                │   │
│  │                                     ▼                                │   │
│  │                           ┌────────────────────┐                     │   │
│  │                           │ Retry Decision     │                     │   │
│  │                           │                    │                     │   │
│  │                           │ Retryable? ──▶ Yes │──▶ Retry part      │   │
│  │                           │     │              │                     │   │
│  │                           │     ▼              │                     │   │
│  │                           │    No ────────────▶│──▶ Abort upload    │   │
│  │                           │                    │    Clean up parts   │   │
│  │                           └────────────────────┘                     │   │
│  │                                                                      │   │
│  │  State Tracking:                                                     │   │
│  │  - Track completed parts with ETags                                 │   │
│  │  - Resume from last successful part on recoverable failure          │   │
│  │  - Store state for cross-process recovery (optional)                │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Cleanup on Failure:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  1. Abort multipart upload (releases S3 resources)                  │   │
│  │  2. Return error with upload_id for manual cleanup if abort fails   │   │
│  │  3. Log incomplete upload for lifecycle rule cleanup                │   │
│  │                                                                      │   │
│  │  Recommendation: Configure S3 lifecycle rule to abort               │   │
│  │  incomplete multipart uploads after X days                          │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Cross-Cutting Concerns

### 13.1 Thread Safety

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         THREAD SAFETY MODEL                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  S3Client: Send + Sync                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  - All public methods take &self (immutable reference)              │   │
│  │  - Internal state protected by appropriate synchronization          │   │
│  │  - Safe to share across threads via Arc<S3Client>                   │   │
│  │  - Safe to use from async tasks                                     │   │
│  │                                                                      │   │
│  │  Synchronization Primitives:                                         │   │
│  │  - tokio::sync::RwLock for credential cache                         │   │
│  │  - std::sync::atomic for circuit breaker counters                   │   │
│  │  - tokio::sync::Semaphore for concurrency limiting                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.2 Resource Cleanup

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RESOURCE CLEANUP                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  RAII Pattern:                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  impl Drop for S3Client {                                            │   │
│  │      fn drop(&mut self) {                                            │   │
│  │          // Close connection pool gracefully                        │   │
│  │          // Clear cached credentials                                │   │
│  │          // Flush metrics/logs                                      │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl Drop for MultipartUpload {                                     │   │
│  │      fn drop(&mut self) {                                            │   │
│  │          if !self.completed {                                        │   │
│  │              // Log warning about incomplete upload                 │   │
│  │              // Optionally spawn abort task                         │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 14. Architecture Decision Records

### ADR-001: Hexagonal Architecture

**Status**: Accepted

**Context**: Need a flexible architecture that supports testing, multiple deployment scenarios, and future extensions.

**Decision**: Use Hexagonal Architecture (Ports and Adapters) with:
- Core domain logic isolated from external concerns
- Ports (traits) defining boundaries
- Adapters implementing external integrations

**Consequences**:
- (+) Easy to test via mock adapters
- (+) Supports multiple credential providers
- (+) Easy to swap HTTP clients
- (-) More interfaces to maintain
- (-) Slight indirection overhead

### ADR-002: London-School TDD

**Status**: Accepted

**Context**: Need comprehensive test coverage that's fast to run and reliable.

**Decision**: Apply London-School TDD:
- Test behavior through mocked collaborators
- Avoid testing implementation details
- Use interface-based design for testability

**Consequences**:
- (+) Fast test execution (no network)
- (+) Tests isolated from S3 availability
- (+) Clear behavior specifications
- (-) More mock setup code
- (-) Risk of testing mocks, not behavior

### ADR-003: Streaming by Default

**Status**: Accepted

**Context**: S3 objects can range from bytes to terabytes. Memory efficiency is critical.

**Decision**: Use streaming for all object transfers:
- Return `impl AsyncRead` from downloads
- Accept `impl AsyncRead` for uploads
- Never buffer entire objects in memory

**Consequences**:
- (+) Constant memory regardless of object size
- (+) Better backpressure handling
- (+) Support for large files
- (-) More complex API
- (-) Cannot retry without re-reading source

### ADR-004: Credential Chain Pattern

**Status**: Accepted

**Context**: AWS credentials can come from multiple sources with different precedence rules.

**Decision**: Implement credential chain:
1. Explicit credentials
2. Environment variables
3. Profile file
4. IMDS (EC2/ECS)

**Consequences**:
- (+) Flexible for different deployment scenarios
- (+) AWS SDK compatible behavior
- (+) Supports temporary credentials
- (-) More complex initialization
- (-) IMDS adds latency in EC2

---

## 15. Summary

This architecture document defines the complete design for the AWS S3 integration module:

1. **Hexagonal Architecture** isolates core logic from external concerns
2. **London-School TDD** enables comprehensive testing without AWS dependencies
3. **Streaming Operations** ensure memory efficiency for any object size
4. **Credential Chain** supports multiple deployment scenarios
5. **Resilience Patterns** (retry, circuit breaker, rate limiting) ensure reliability
6. **Comprehensive Observability** via tracing, metrics, and structured logging
7. **Security-First Design** with credential protection and TLS enforcement

The architecture supports:
- Local development with LocalStack/MinIO
- Production deployment on EC2/ECS/Lambda
- Cross-account access patterns
- High-throughput transfer scenarios
- Complete testability without network dependencies

---

**End of Architecture Phase**

*Proceed to Phase 4: Refinement when ready.*
