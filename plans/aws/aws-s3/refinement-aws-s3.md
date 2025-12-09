# AWS S3 Integration Refinement

## SPARC Phase 4: Refinement

*Review, optimize, and harden the design before implementation*

---

## 1. Design Review Checklist

### 1.1 Specification Compliance

| Requirement | Status | Notes |
|-------------|--------|-------|
| PutObject operation | ✅ Covered | Pseudocode-2, streaming support |
| GetObject operation | ✅ Covered | Pseudocode-2, range support |
| DeleteObject operation | ✅ Covered | Pseudocode-2 |
| DeleteObjects (batch) | ✅ Covered | Pseudocode-2 |
| HeadObject operation | ✅ Covered | Pseudocode-2 |
| CopyObject operation | ✅ Covered | Pseudocode-2 |
| ListObjectsV2 operation | ✅ Covered | Pseudocode-2, pagination |
| CreateBucket operation | ✅ Covered | Pseudocode-2 |
| DeleteBucket operation | ✅ Covered | Pseudocode-2 |
| HeadBucket operation | ✅ Covered | Pseudocode-2 |
| ListBuckets operation | ✅ Covered | Pseudocode-2 |
| CreateMultipartUpload | ✅ Covered | Pseudocode-3 |
| UploadPart operation | ✅ Covered | Pseudocode-3 |
| CompleteMultipartUpload | ✅ Covered | Pseudocode-3 |
| AbortMultipartUpload | ✅ Covered | Pseudocode-3 |
| ListMultipartUploads | ✅ Covered | Pseudocode-3 |
| ListParts operation | ✅ Covered | Pseudocode-3 |
| Presigned GET URL | ✅ Covered | Pseudocode-3 |
| Presigned PUT URL | ✅ Covered | Pseudocode-3 |
| GetObjectTagging | ✅ Covered | Pseudocode-3 |
| PutObjectTagging | ✅ Covered | Pseudocode-3 |
| DeleteObjectTagging | ✅ Covered | Pseudocode-3 |
| GetBucketTagging | ✅ Covered | Pseudocode-3 |
| PutBucketTagging | ✅ Covered | Pseudocode-3 |
| DeleteBucketTagging | ✅ Covered | Pseudocode-3 |
| AWS Signature V4 | ✅ Covered | Pseudocode-1 |
| Credential providers | ✅ Covered | Pseudocode-1 (Env, Profile, IMDS) |
| Retry with backoff | ✅ Covered | Uses shared retry primitive |
| Circuit breaker | ✅ Covered | Uses shared circuit-breaker primitive |
| Rate limiting | ✅ Covered | Uses shared rate-limits primitive |
| Tracing integration | ✅ Covered | Uses shared tracing primitive |
| Structured logging | ✅ Covered | Uses shared logging primitive |
| Error taxonomy | ✅ Covered | Uses shared errors primitive |

### 1.2 Architecture Compliance

| Principle | Status | Evidence |
|-----------|--------|----------|
| Hexagonal Architecture | ✅ | Ports (traits) + Adapters pattern |
| Dependency Inversion | ✅ | All deps injected via traits |
| Single Responsibility | ✅ | Separate services per domain |
| Interface Segregation | ✅ | Fine-grained service traits |
| No ruvbase dependency | ✅ | Only shared primitives used |
| No cross-module deps | ✅ | Self-contained module |
| London-School TDD ready | ✅ | All collaborators mockable |

### 1.3 Security Compliance

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Credentials never logged | ✅ | SecretString wrapper, redacted Debug |
| TLS enforced | ✅ | HTTPS default, configurable for local |
| Signature V4 | ✅ | Full implementation in Pseudocode-1 |
| Session token support | ✅ | Included in credential chain |
| Presigned URL expiration | ✅ | Configurable, max 7 days |
| Content hash validation | ✅ | SHA-256 for signed requests |

---

## 2. Edge Case Analysis

### 2.1 Object Key Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      OBJECT KEY EDGE CASES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Special Characters in Keys                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Valid but requiring encoding:                                       │   │
│  │  - Spaces: "my file.txt" → "my%20file.txt"                          │   │
│  │  - Unicode: "文件.txt" → "%E6%96%87%E4%BB%B6.txt"                   │   │
│  │  - Special: "file+name.txt" → "file%2Bname.txt"                     │   │
│  │  - Slashes: Already handled as path separators                      │   │
│  │                                                                      │   │
│  │  Implementation:                                                     │   │
│  │  - Use percent-encoding with AWS-specific safe characters           │   │
│  │  - Preserve forward slashes (/) as literal                          │   │
│  │  - Encode all other non-alphanumeric except: - _ . ~                │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: Very Long Keys                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  S3 Limit: 1024 bytes (UTF-8 encoded)                               │   │
│  │                                                                      │   │
│  │  Validation:                                                         │   │
│  │  - Check byte length, not character count                           │   │
│  │  - Fail fast before making request                                  │   │
│  │  - Clear error message with actual vs limit                         │   │
│  │                                                                      │   │
│  │  fn validate_key(key: &str) -> Result<(), S3Error> {                │   │
│  │      let byte_len = key.as_bytes().len();                           │   │
│  │      if byte_len > 1024 {                                           │   │
│  │          return Err(S3Error::InvalidObjectKey {                     │   │
│  │              reason: format!(                                       │   │
│  │                  "Key exceeds 1024 bytes: {} bytes",                │   │
│  │                  byte_len                                           │   │
│  │              )                                                       │   │
│  │          });                                                         │   │
│  │      }                                                               │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: Empty or Root Keys                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  - Empty key ("") → Invalid, reject                                 │   │
│  │  - Single slash ("/") → Invalid in most contexts                    │   │
│  │  - Leading slash ("/file.txt") → Valid, but unusual                 │   │
│  │  - Trailing slash ("folder/") → Valid, represents "folder"          │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 4: Keys with Metadata Characters                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  - XML special chars: < > & → Must encode in XML responses          │   │
│  │  - Null bytes: Not allowed, reject                                  │   │
│  │  - Control characters: Discouraged, warn in logs                    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Multipart Upload Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MULTIPART UPLOAD EDGE CASES                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Part Size Boundaries                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Constraints:                                                        │   │
│  │  - Minimum part size: 5 MB (except last part)                       │   │
│  │  - Maximum part size: 5 GB                                          │   │
│  │  - Maximum parts: 10,000                                            │   │
│  │  - Maximum object size: 5 TB                                        │   │
│  │                                                                      │   │
│  │  Edge Cases:                                                         │   │
│  │  - File exactly 5 MB: Single part OK                                │   │
│  │  - File 5 MB + 1 byte: Two parts (5 MB + 1 byte)                    │   │
│  │  - File approaching 5 TB: Must use larger parts                     │   │
│  │                                                                      │   │
│  │  Part Size Calculation:                                              │   │
│  │  fn calculate_part_size(total_size: u64, preferred: u64) -> u64 {   │   │
│  │      let min_part_size = 5 * 1024 * 1024; // 5 MB                   │   │
│  │      let max_parts = 10_000;                                        │   │
│  │                                                                      │   │
│  │      // Ensure we don't exceed max parts                            │   │
│  │      let min_required = (total_size + max_parts - 1) / max_parts;   │   │
│  │      let part_size = preferred.max(min_required).max(min_part_size);│   │
│  │                                                                      │   │
│  │      part_size                                                       │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: Upload Interruption                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenarios:                                                          │   │
│  │  - Network failure mid-part: Retry the part                         │   │
│  │  - Process crash: Upload ID persisted, resumable                    │   │
│  │  - S3 error on complete: Parts remain, retry complete               │   │
│  │                                                                      │   │
│  │  Recovery Strategy:                                                  │   │
│  │  1. Store upload_id and completed parts externally (optional)       │   │
│  │  2. On resume, ListParts to find completed parts                    │   │
│  │  3. Continue from last incomplete part                              │   │
│  │  4. CompleteMultipartUpload when all parts done                     │   │
│  │                                                                      │   │
│  │  Cleanup:                                                            │   │
│  │  - AbortMultipartUpload on unrecoverable failure                    │   │
│  │  - Recommend lifecycle rule for orphaned uploads                    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: Concurrent Part Upload Failures                                    │   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Uploading 4 parts concurrently, 1 fails                  │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  1. Continue other parts (don't abort immediately)                  │   │
│  │  2. Retry failed part with exponential backoff                      │   │
│  │  3. Only abort if part fails after max retries                      │   │
│  │  4. Collect all errors for comprehensive reporting                  │   │
│  │                                                                      │   │
│  │  Error Aggregation:                                                  │   │
│  │  struct MultipartError {                                             │   │
│  │      upload_id: String,                                              │   │
│  │      failed_parts: Vec<(u32, S3Error)>,                             │   │
│  │      completed_parts: Vec<u32>,                                     │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 4: Empty File Upload                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  - 0-byte files: Use regular PutObject, not multipart               │   │
│  │  - Multipart requires at least one part                             │   │
│  │  - Empty part (0 bytes) not allowed                                 │   │
│  │                                                                      │   │
│  │  Decision Logic:                                                     │   │
│  │  fn should_use_multipart(size: u64, threshold: u64) -> bool {       │   │
│  │      size > 0 && size >= threshold                                  │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Credential Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CREDENTIAL EDGE CASES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Credential Expiration During Request                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Credentials expire while multipart upload in progress    │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  1. Check credential expiration before each part upload             │   │
│  │  2. Refresh credentials if within 5-minute window                   │   │
│  │  3. Re-sign request with new credentials                            │   │
│  │  4. If refresh fails, fail the operation (not just the part)        │   │
│  │                                                                      │   │
│  │  fn credentials_need_refresh(creds: &Credentials) -> bool {         │   │
│  │      match creds.expiration {                                        │   │
│  │          Some(exp) => exp - Utc::now() < Duration::minutes(5),      │   │
│  │          None => false,  // Long-term credentials                   │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: IMDS Unavailability                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenarios:                                                          │   │
│  │  - Running outside EC2/ECS: IMDS not available                      │   │
│  │  - IMDS rate limited: Temporary failure                             │   │
│  │  - IMDS disabled: Permanent failure                                 │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  1. Quick timeout for IMDS (1 second)                               │   │
│  │  2. Fall through to next provider on failure                        │   │
│  │  3. Cache IMDS availability status                                  │   │
│  │  4. Use IMDSv2 (token-based) for security                           │   │
│  │                                                                      │   │
│  │  IMDS v2 Flow:                                                       │   │
│  │  1. PUT /latest/api/token (get session token)                       │   │
│  │  2. GET /latest/meta-data/iam/security-credentials/                 │   │
│  │  3. GET /latest/meta-data/iam/security-credentials/{role}           │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: Profile File Parsing Errors                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenarios:                                                          │   │
│  │  - File not found: Fall through                                     │   │
│  │  - Invalid format: Log warning, fall through                        │   │
│  │  - Profile not found: Fall through                                  │   │
│  │  - Incomplete credentials: Error (don't use partial)                │   │
│  │                                                                      │   │
│  │  Validation:                                                         │   │
│  │  fn validate_profile_credentials(                                    │   │
│  │      access_key: Option<&str>,                                       │   │
│  │      secret_key: Option<&str>,                                       │   │
│  │  ) -> Result<Credentials, ProfileError> {                            │   │
│  │      match (access_key, secret_key) {                                │   │
│  │          (Some(ak), Some(sk)) => Ok(Credentials::new(ak, sk, None)),│   │
│  │          (Some(_), None) => Err(ProfileError::IncompleteCredentials),│  │
│  │          (None, Some(_)) => Err(ProfileError::IncompleteCredentials),│  │
│  │          (None, None) => Err(ProfileError::NoCredentials),          │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 4: Concurrent Credential Refresh                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenario: Multiple requests trigger refresh simultaneously         │   │
│  │                                                                      │   │
│  │  Strategy: Single-flight refresh                                    │   │
│  │  1. First request triggers refresh                                  │   │
│  │  2. Subsequent requests wait for first to complete                  │   │
│  │  3. All requests use new credentials                                │   │
│  │                                                                      │   │
│  │  Implementation:                                                     │   │
│  │  struct CredentialCache {                                            │   │
│  │      credentials: RwLock<Option<Credentials>>,                      │   │
│  │      refresh_lock: Mutex<()>,  // Serialize refreshes               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Network Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        NETWORK EDGE CASES                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Partial Response / Truncated Download                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Detection:                                                          │   │
│  │  - Compare received bytes vs Content-Length header                  │   │
│  │  - Detect connection close before complete                          │   │
│  │                                                                      │   │
│  │  Recovery:                                                           │   │
│  │  1. For streaming: Return error when stream ends early              │   │
│  │  2. For buffered: Validate length before returning                  │   │
│  │  3. Retry with Range header from last byte received                 │   │
│  │                                                                      │   │
│  │  struct StreamingDownload {                                          │   │
│  │      expected_length: Option<u64>,                                   │   │
│  │      received_length: u64,                                           │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl Drop for StreamingDownload {                                   │   │
│  │      fn drop(&mut self) {                                            │   │
│  │          if let Some(expected) = self.expected_length {              │   │
│  │              if self.received_length < expected {                    │   │
│  │                  warn!("Download incomplete: {}/{} bytes",           │   │
│  │                      self.received_length, expected);                │   │
│  │              }                                                       │   │
│  │          }                                                           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: DNS Resolution Failures                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenarios:                                                          │   │
│  │  - Temporary DNS failure: Retry                                     │   │
│  │  - Invalid bucket name → invalid hostname: Don't retry              │   │
│  │  - DNS timeout: Retry with different resolver                       │   │
│  │                                                                      │   │
│  │  Classification:                                                     │   │
│  │  fn is_dns_error_retryable(err: &DnsError) -> bool {                │   │
│  │      matches!(err,                                                   │   │
│  │          DnsError::Timeout |                                         │   │
│  │          DnsError::ServerFailure |                                   │   │
│  │          DnsError::TemporaryFailure                                 │   │
│  │      )                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: Connection Pool Exhaustion                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Detection:                                                          │   │
│  │  - Timeout waiting for connection from pool                         │   │
│  │  - All connections in use                                           │   │
│  │                                                                      │   │
│  │  Mitigation:                                                         │   │
│  │  1. Track active vs available connections (metric)                  │   │
│  │  2. Return specific error (not generic timeout)                     │   │
│  │  3. Consider per-operation connection limits                        │   │
│  │                                                                      │   │
│  │  enum ConnectionError {                                              │   │
│  │      PoolExhausted { active: u32, max: u32 },                       │   │
│  │      ConnectionTimeout { waited_ms: u64 },                          │   │
│  │      ConnectionFailed { cause: IoError },                           │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 4: TLS Handshake Failures                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenarios:                                                          │   │
│  │  - Certificate validation failure: Don't retry (security)          │   │
│  │  - Handshake timeout: Retry                                         │   │
│  │  - Protocol mismatch: Don't retry                                   │   │
│  │                                                                      │   │
│  │  Security Note:                                                      │   │
│  │  - Never skip certificate validation in production                  │   │
│  │  - Allow configurable skip for LocalStack/MinIO testing             │   │
│  │  - Log warning when validation disabled                             │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.5 XML Parsing Edge Cases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      XML PARSING EDGE CASES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Case 1: Malformed XML Response                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Scenarios:                                                          │   │
│  │  - Truncated response (network issue)                               │   │
│  │  - Invalid UTF-8 in object keys                                     │   │
│  │  - Unexpected XML structure (API version mismatch)                  │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  1. Use streaming parser for large responses                        │   │
│  │  2. Validate structure before extracting values                     │   │
│  │  3. Return ParseError with context (partial data if available)      │   │
│  │                                                                      │   │
│  │  enum XmlParseError {                                                │   │
│  │      MalformedXml { position: usize, message: String },             │   │
│  │      MissingElement { expected: &'static str },                     │   │
│  │      InvalidValue { element: String, value: String },               │   │
│  │      UnexpectedStructure { context: String },                       │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 2: Large List Responses                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Concern: Listing bucket with 100K+ objects                         │   │
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  1. Use streaming parser (quick-xml ReaderBuilder)                  │   │
│  │  2. Yield items as parsed (not buffer all)                          │   │
│  │  3. Respect max-keys parameter                                      │   │
│  │  4. Handle pagination tokens correctly                              │   │
│  │                                                                      │   │
│  │  fn parse_list_objects_streaming<R: Read>(                          │   │
│  │      reader: R,                                                      │   │
│  │  ) -> impl Iterator<Item = Result<S3Object, XmlParseError>> {       │   │
│  │      // Stream parse, yield objects one by one                      │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Case 3: Namespace Handling                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  S3 XML uses namespace: xmlns="http://s3.amazonaws.com/doc/2006-03-01/"
│  │                                                                      │   │
│  │  Strategy:                                                           │   │
│  │  - Match elements by local name, ignore namespace prefix            │   │
│  │  - Don't hardcode specific namespace URI (may change)               │   │
│  │  - Validate namespace presence for security                         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Performance Optimizations

### 3.1 Signing Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      SIGNING OPTIMIZATIONS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Optimization 1: Signing Key Cache                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Problem: Deriving signing key requires 4 HMAC operations           │   │
│  │                                                                      │   │
│  │  Solution: Cache derived signing key per (date, region, service)    │   │
│  │                                                                      │   │
│  │  struct SigningKeyCache {                                            │   │
│  │      cache: HashMap<(Date, String, String), CachedKey>,             │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  struct CachedKey {                                                  │   │
│  │      key: [u8; 32],                                                  │   │
│  │      created: DateTime<Utc>,                                         │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  Eviction: On date change or max entries (e.g., 10)                 │   │
│  │  Benefit: ~4x speedup for repeated requests                         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 2: Buffer Reuse                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Problem: Each signing allocates buffers for canonical request      │   │
│  │                                                                      │   │
│  │  Solution: Thread-local buffer pool                                 │   │
│  │                                                                      │   │
│  │  thread_local! {                                                     │   │
│  │      static SIGNING_BUFFER: RefCell<Vec<u8>> =                      │   │
│  │          RefCell::new(Vec::with_capacity(4096));                    │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  fn sign_request(request: &Request) -> Signature {                  │   │
│  │      SIGNING_BUFFER.with(|buf| {                                     │   │
│  │          let mut buf = buf.borrow_mut();                            │   │
│  │          buf.clear();                                               │   │
│  │          // Build canonical request into buf                        │   │
│  │      })                                                              │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  Benefit: Reduces allocations by ~80%                               │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 3: Unsigned Payload for Large Uploads                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Problem: Hashing large payloads before upload is expensive         │   │
│  │                                                                      │   │
│  │  Solution: Use UNSIGNED-PAYLOAD for PutObject when appropriate      │   │
│  │                                                                      │   │
│  │  When to use:                                                        │   │
│  │  - HTTPS connection (integrity protected by TLS)                    │   │
│  │  - Large uploads where hashing adds latency                         │   │
│  │  - Streaming uploads with unknown size                              │   │
│  │                                                                      │   │
│  │  When NOT to use:                                                    │   │
│  │  - Presigned URLs (always sign payload)                             │   │
│  │  - When content integrity is critical                               │   │
│  │                                                                      │   │
│  │  Header: x-amz-content-sha256: UNSIGNED-PAYLOAD                     │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Connection Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONNECTION OPTIMIZATIONS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Optimization 1: Connection Warmup                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Problem: First request incurs connection + TLS setup latency       │   │
│  │                                                                      │   │
│  │  Solution: Optional connection warmup on client creation            │   │
│  │                                                                      │   │
│  │  impl S3Client {                                                     │   │
│  │      async fn warmup(&self, buckets: &[&str]) -> Result<(), S3Error>{│  │
│  │          for bucket in buckets {                                     │   │
│  │              // HEAD bucket establishes connection                  │   │
│  │              let _ = self.head_bucket(bucket).await;                │   │
│  │          }                                                           │   │
│  │          Ok(())                                                      │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 2: HTTP/2 Multiplexing                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  S3 supports HTTP/2 (where available)                               │   │
│  │                                                                      │   │
│  │  Benefits:                                                           │   │
│  │  - Multiple requests over single connection                         │   │
│  │  - Header compression                                               │   │
│  │  - Reduced latency for concurrent operations                        │   │
│  │                                                                      │   │
│  │  Configuration:                                                      │   │
│  │  - Enable HTTP/2 by default                                         │   │
│  │  - Fallback to HTTP/1.1 if negotiation fails                        │   │
│  │  - Separate pool sizing for HTTP/2 (fewer connections needed)       │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 3: Regional Endpoint Selection                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Problem: Cross-region requests add latency                         │   │
│  │                                                                      │   │
│  │  Solution: Auto-detect bucket region and use regional endpoint      │   │
│  │                                                                      │   │
│  │  Flow:                                                               │   │
│  │  1. First request to global endpoint                                │   │
│  │  2. If 301 redirect, extract region from header                     │   │
│  │  3. Cache region, use regional endpoint going forward               │   │
│  │                                                                      │   │
│  │  fn get_bucket_endpoint(                                             │   │
│  │      bucket: &str,                                                   │   │
│  │      region_cache: &RegionCache,                                     │   │
│  │  ) -> String {                                                       │   │
│  │      if let Some(region) = region_cache.get(bucket) {               │   │
│  │          format!("{}.s3.{}.amazonaws.com", bucket, region)          │   │
│  │      } else {                                                        │   │
│  │          format!("{}.s3.amazonaws.com", bucket)                     │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Memory Optimization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MEMORY OPTIMIZATIONS                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Optimization 1: Zero-Copy Where Possible                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Use bytes::Bytes for response bodies                               │   │
│  │  - Reference-counted, clone is O(1)                                 │   │
│  │  - Slice without copying                                            │   │
│  │  - Share across tasks safely                                        │   │
│  │                                                                      │   │
│  │  struct GetObjectResponse {                                          │   │
│  │      body: Bytes,  // Not Vec<u8>                                   │   │
│  │      // ...                                                         │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 2: Streaming Threshold                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Small objects: Buffer entirely (faster for small data)             │   │
│  │  Large objects: Stream (memory efficient)                           │   │
│  │                                                                      │   │
│  │  const STREAMING_THRESHOLD: u64 = 256 * 1024; // 256 KB             │   │
│  │                                                                      │   │
│  │  enum ResponseBody {                                                 │   │
│  │      Buffered(Bytes),                                               │   │
│  │      Streaming(impl AsyncRead),                                     │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Optimization 3: Response Body Lazy Loading                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Don't read body until consumer requests it                         │   │
│  │                                                                      │   │
│  │  // Body not read yet                                               │   │
│  │  let response = client.get_object(bucket, key).await?;              │   │
│  │                                                                      │   │
│  │  // Only now is body read from network                              │   │
│  │  let data = response.body().collect().await?;                       │   │
│  │                                                                      │   │
│  │  // Or stream to file without full buffering                        │   │
│  │  response.body().copy_to(&mut file).await?;                         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Security Hardening

### 4.1 Input Validation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INPUT VALIDATION                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Bucket Name Validation:                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  fn validate_bucket_name(name: &str) -> Result<(), ValidationError> {│  │
│  │      // Length: 3-63 characters                                     │   │
│  │      if name.len() < 3 || name.len() > 63 {                         │   │
│  │          return Err(ValidationError::InvalidLength);                │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Must start with lowercase letter or number                  │   │
│  │      if !name.chars().next().map_or(false,                          │   │
│  │          |c| c.is_ascii_lowercase() || c.is_ascii_digit()) {        │   │
│  │          return Err(ValidationError::InvalidStart);                 │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Only lowercase letters, numbers, hyphens, periods           │   │
│  │      if !name.chars().all(|c|                                       │   │
│  │          c.is_ascii_lowercase() || c.is_ascii_digit() ||            │   │
│  │          c == '-' || c == '.') {                                    │   │
│  │          return Err(ValidationError::InvalidCharacters);            │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Cannot be IP address format                                 │   │
│  │      if name.parse::<std::net::Ipv4Addr>().is_ok() {               │   │
│  │          return Err(ValidationError::IpAddressFormat);              │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Cannot have consecutive periods                             │   │
│  │      if name.contains("..") {                                        │   │
│  │          return Err(ValidationError::ConsecutivePeriods);           │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Cannot end with hyphen                                      │   │
│  │      if name.ends_with('-') {                                        │   │
│  │          return Err(ValidationError::EndsWithHyphen);               │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Object Key Validation:                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  fn validate_object_key(key: &str) -> Result<(), ValidationError> { │   │
│  │      // Non-empty                                                   │   │
│  │      if key.is_empty() {                                             │   │
│  │          return Err(ValidationError::EmptyKey);                     │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Max 1024 bytes                                              │   │
│  │      if key.len() > 1024 {                                          │   │
│  │          return Err(ValidationError::KeyTooLong);                   │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // No null bytes                                               │   │
│  │      if key.contains('\0') {                                         │   │
│  │          return Err(ValidationError::NullByte);                     │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Warn on control characters (allowed but discouraged)        │   │
│  │      if key.chars().any(|c| c.is_control() && c != '\n') {          │   │
│  │          warn!("Object key contains control characters: {}", key);  │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Header Value Validation:                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  fn validate_header_value(value: &str) -> Result<(), ValidationError>{│ │
│  │      // No CRLF injection                                           │   │
│  │      if value.contains('\r') || value.contains('\n') {              │   │
│  │          return Err(ValidationError::HeaderInjection);              │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      // Only visible ASCII + SP + HT                                │   │
│  │      if !value.bytes().all(|b|                                       │   │
│  │          b == b' ' || b == b'\t' || (b >= 0x21 && b <= 0x7E)) {     │   │
│  │          return Err(ValidationError::InvalidHeaderChars);           │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      Ok(())                                                          │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Credential Protection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CREDENTIAL PROTECTION                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SecretString Implementation:                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  use zeroize::Zeroize;                                               │   │
│  │                                                                      │   │
│  │  pub struct SecretString {                                           │   │
│  │      inner: String,                                                  │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl SecretString {                                                 │   │
│  │      pub fn new(s: impl Into<String>) -> Self {                     │   │
│  │          Self { inner: s.into() }                                   │   │
│  │      }                                                               │   │
│  │                                                                      │   │
│  │      pub fn expose(&self) -> &str {                                 │   │
│  │          &self.inner                                                │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl Debug for SecretString {                                       │   │
│  │      fn fmt(&self, f: &mut Formatter) -> fmt::Result {               │   │
│  │          write!(f, "[REDACTED]")                                    │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl Display for SecretString {                                     │   │
│  │      fn fmt(&self, f: &mut Formatter) -> fmt::Result {               │   │
│  │          write!(f, "[REDACTED]")                                    │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl Drop for SecretString {                                        │   │
│  │      fn drop(&mut self) {                                            │   │
│  │          self.inner.zeroize();                                      │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  impl Clone for SecretString {                                       │   │
│  │      fn clone(&self) -> Self {                                       │   │
│  │          Self { inner: self.inner.clone() }                         │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  // Prevent serialization                                           │   │
│  │  impl !Serialize for SecretString {}                                │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Error Sanitization:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  fn sanitize_error_for_logging(err: &S3Error) -> String {           │   │
│  │      match err {                                                     │   │
│  │          S3Error::SignatureError { details } => {                   │   │
│  │              // Remove any credential hints                         │   │
│  │              format!("Signature error: [details redacted]")         │   │
│  │          }                                                           │   │
│  │          S3Error::CredentialError { source } => {                   │   │
│  │              // Don't expose source path or env var names           │   │
│  │              "Credential error: failed to resolve credentials"      │   │
│  │                  .to_string()                                       │   │
│  │          }                                                           │   │
│  │          S3Error::HttpError { url, .. } => {                        │   │
│  │              // Remove query string (may contain signature)         │   │
│  │              let sanitized_url = sanitize_url(url);                 │   │
│  │              format!("HTTP error for: {}", sanitized_url)           │   │
│  │          }                                                           │   │
│  │          other => format!("{:?}", other),                           │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  fn sanitize_url(url: &str) -> String {                             │   │
│  │      if let Some(query_start) = url.find('?') {                     │   │
│  │          format!("{}?[query redacted]", &url[..query_start])        │   │
│  │      } else {                                                        │   │
│  │          url.to_string()                                            │   │
│  │      }                                                               │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Request/Response Sanitization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  REQUEST/RESPONSE SANITIZATION                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Headers to Redact in Logs:                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  const SENSITIVE_HEADERS: &[&str] = &[                              │   │
│  │      "authorization",                                               │   │
│  │      "x-amz-security-token",                                        │   │
│  │      "x-amz-server-side-encryption-customer-key",                   │   │
│  │      "x-amz-server-side-encryption-customer-key-md5",               │   │
│  │      "x-amz-copy-source-server-side-encryption-customer-key",       │   │
│  │      "x-amz-copy-source-server-side-encryption-customer-key-md5",   │   │
│  │  ];                                                                  │   │
│  │                                                                      │   │
│  │  fn sanitize_headers_for_log(                                        │   │
│  │      headers: &HeaderMap,                                            │   │
│  │  ) -> HashMap<String, String> {                                      │   │
│  │      headers.iter()                                                  │   │
│  │          .map(|(k, v)| {                                             │   │
│  │              let key = k.as_str().to_lowercase();                   │   │
│  │              let value = if SENSITIVE_HEADERS.contains(&key.as_str()){│  │
│  │                  "[REDACTED]".to_string()                           │   │
│  │              } else {                                                │   │
│  │                  v.to_str().unwrap_or("[non-utf8]").to_string()     │   │
│  │              };                                                      │   │
│  │              (key, value)                                           │   │
│  │          })                                                          │   │
│  │          .collect()                                                  │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Query String Sanitization:                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  const SENSITIVE_PARAMS: &[&str] = &[                               │   │
│  │      "X-Amz-Signature",                                             │   │
│  │      "X-Amz-Credential",                                            │   │
│  │      "X-Amz-Security-Token",                                        │   │
│  │  ];                                                                  │   │
│  │                                                                      │   │
│  │  fn sanitize_query_string(query: &str) -> String {                  │   │
│  │      query.split('&')                                                │   │
│  │          .map(|param| {                                              │   │
│  │              if let Some((key, _)) = param.split_once('=') {        │   │
│  │                  if SENSITIVE_PARAMS.contains(&key) {               │   │
│  │                      format!("{}=[REDACTED]", key)                  │   │
│  │                  } else {                                            │   │
│  │                      param.to_string()                              │   │
│  │                  }                                                   │   │
│  │              } else {                                                │   │
│  │                  param.to_string()                                  │   │
│  │              }                                                       │   │
│  │          })                                                          │   │
│  │          .collect::<Vec<_>>()                                        │   │
│  │          .join("&")                                                  │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Test Strategy Refinement

### 5.1 Unit Test Coverage Matrix

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UNIT TEST COVERAGE MATRIX                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Component              │ Happy Path │ Error Cases │ Edge Cases │ Total    │
│  ───────────────────────┼────────────┼─────────────┼────────────┼──────────│
│  Signature V4           │     5      │      3      │     7      │    15    │
│  Credential Provider    │     4      │      5      │     3      │    12    │
│  Request Builder        │     6      │      2      │     4      │    12    │
│  Response Parser        │     5      │      4      │     5      │    14    │
│  XML Parser             │     8      │      3      │     5      │    16    │
│  Object Operations      │    10      │      8      │     4      │    22    │
│  Bucket Operations      │     6      │      4      │     2      │    12    │
│  Multipart Operations   │     8      │      6      │     5      │    19    │
│  Presigned URLs         │     4      │      2      │     3      │     9    │
│  Tagging Operations     │     6      │      3      │     2      │    11    │
│  Error Handling         │     N/A    │     12      │     5      │    17    │
│  Configuration          │     4      │      3      │     2      │     9    │
│  ───────────────────────┼────────────┼─────────────┼────────────┼──────────│
│  TOTAL                  │    66      │     55      │    47      │   168    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Mock Behavior Specifications

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   MOCK BEHAVIOR SPECIFICATIONS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  MockHttpTransport Behaviors:                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Success responses                                                │   │
│  │  mock.on_request(method, path)                                       │   │
│  │      .return_status(200)                                            │   │
│  │      .return_headers(headers)                                       │   │
│  │      .return_body(body);                                            │   │
│  │                                                                      │   │
│  │  // Error responses                                                  │   │
│  │  mock.on_request(method, path)                                       │   │
│  │      .return_status(404)                                            │   │
│  │      .return_body(xml_error("NoSuchKey", "Key not found"));         │   │
│  │                                                                      │   │
│  │  // Network errors                                                   │   │
│  │  mock.on_request(method, path)                                       │   │
│  │      .fail_with(NetworkError::Timeout);                             │   │
│  │                                                                      │   │
│  │  // Sequence of responses (for retry testing)                       │   │
│  │  mock.on_request(method, path)                                       │   │
│  │      .return_sequence(vec![                                         │   │
│  │          Response::error(503, "Service Unavailable"),               │   │
│  │          Response::error(503, "Service Unavailable"),               │   │
│  │          Response::success(200, body),                              │   │
│  │      ]);                                                             │   │
│  │                                                                      │   │
│  │  // Conditional responses                                            │   │
│  │  mock.on_request(method, path)                                       │   │
│  │      .when(|req| req.headers.contains("x-amz-expected-bucket-owner"))│  │
│  │      .return_status(200);                                           │   │
│  │                                                                      │   │
│  │  // Capture requests for assertions                                 │   │
│  │  let captured = mock.on_request(method, path)                       │   │
│  │      .capture()                                                     │   │
│  │      .return_status(200);                                           │   │
│  │                                                                      │   │
│  │  // After test                                                      │   │
│  │  assert_eq!(captured.call_count(), 1);                              │   │
│  │  assert!(captured.last_request().headers.contains("Authorization"));│   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  MockCredentialProvider Behaviors:                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Static credentials                                               │   │
│  │  let mock = MockCredentialProvider::new()                           │   │
│  │      .with_credentials("AKID", "SECRET", None);                     │   │
│  │                                                                      │   │
│  │  // Expiring credentials                                             │   │
│  │  let mock = MockCredentialProvider::new()                           │   │
│  │      .with_expiring_credentials("AKID", "SECRET", "TOKEN",          │   │
│  │          Utc::now() + Duration::hours(1));                          │   │
│  │                                                                      │   │
│  │  // Credential refresh simulation                                    │   │
│  │  let mock = MockCredentialProvider::new()                           │   │
│  │      .with_credentials_sequence(vec![                               │   │
│  │          Credentials::new("AKID1", "SECRET1", None),                │   │
│  │          Credentials::new("AKID2", "SECRET2", None),                │   │
│  │      ]);                                                             │   │
│  │                                                                      │   │
│  │  // Credential resolution failure                                    │   │
│  │  let mock = MockCredentialProvider::new()                           │   │
│  │      .fail_with(CredentialError::NotFound);                         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Integration Test Scenarios

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  INTEGRATION TEST SCENARIOS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LocalStack Test Suite:                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  Test Category: Object Operations                                    │   │
│  │  ─────────────────────────────────────────────────                  │   │
│  │  - put_object_small_file                                            │   │
│  │  - put_object_large_file_multipart                                  │   │
│  │  - get_object_full                                                  │   │
│  │  - get_object_range                                                 │   │
│  │  - delete_object_existing                                           │   │
│  │  - delete_object_nonexistent (should succeed)                       │   │
│  │  - delete_objects_batch                                             │   │
│  │  - head_object_existing                                             │   │
│  │  - head_object_nonexistent                                          │   │
│  │  - copy_object_same_bucket                                          │   │
│  │  - copy_object_cross_bucket                                         │   │
│  │  - list_objects_empty_bucket                                        │   │
│  │  - list_objects_with_prefix                                         │   │
│  │  - list_objects_pagination                                          │   │
│  │                                                                      │   │
│  │  Test Category: Bucket Operations                                    │   │
│  │  ─────────────────────────────────────────                          │   │
│  │  - create_bucket_simple                                             │   │
│  │  - create_bucket_already_exists                                     │   │
│  │  - delete_bucket_empty                                              │   │
│  │  - delete_bucket_not_empty (should fail)                            │   │
│  │  - head_bucket_existing                                             │   │
│  │  - head_bucket_nonexistent                                          │   │
│  │  - list_buckets                                                     │   │
│  │                                                                      │   │
│  │  Test Category: Multipart Upload                                     │   │
│  │  ────────────────────────────────────                               │   │
│  │  - multipart_upload_complete_flow                                   │   │
│  │  - multipart_upload_abort                                           │   │
│  │  - multipart_upload_list_parts                                      │   │
│  │  - multipart_upload_resume_after_failure                            │   │
│  │                                                                      │   │
│  │  Test Category: Presigned URLs                                       │   │
│  │  ─────────────────────────────                                      │   │
│  │  - presigned_get_url_download                                       │   │
│  │  - presigned_put_url_upload                                         │   │
│  │  - presigned_url_expired (should fail)                              │   │
│  │                                                                      │   │
│  │  Test Category: Tagging                                              │   │
│  │  ──────────────────────                                             │   │
│  │  - put_get_delete_object_tags                                       │   │
│  │  - put_get_delete_bucket_tags                                       │   │
│  │                                                                      │   │
│  │  Test Category: Resilience                                           │   │
│  │  ────────────────────────                                           │   │
│  │  - retry_on_server_error                                            │   │
│  │  - circuit_breaker_opens_on_failures                                │   │
│  │  - rate_limiting_applied                                            │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Error Message Refinement

### 6.1 User-Friendly Error Messages

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   USER-FRIENDLY ERROR MESSAGES                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Error Type              │ Technical                │ User-Friendly         │
│  ────────────────────────┼──────────────────────────┼───────────────────────│
│  NoSuchBucket            │ 404 NoSuchBucket         │ "Bucket 'xyz' does    │
│                          │                          │  not exist or you do  │
│                          │                          │  not have access"     │
│  ────────────────────────┼──────────────────────────┼───────────────────────│
│  NoSuchKey               │ 404 NoSuchKey            │ "Object 'path/file'   │
│                          │                          │  not found in bucket  │
│                          │                          │  'xyz'"               │
│  ────────────────────────┼──────────────────────────┼───────────────────────│
│  AccessDenied            │ 403 AccessDenied         │ "Access denied. Check │
│                          │                          │  IAM permissions for  │
│                          │                          │  bucket 'xyz'"        │
│  ────────────────────────┼──────────────────────────┼───────────────────────│
│  InvalidAccessKeyId      │ 403 InvalidAccessKeyId   │ "Invalid AWS access   │
│                          │                          │  key. Verify your     │
│                          │                          │  credentials"         │
│  ────────────────────────┼──────────────────────────┼───────────────────────│
│  SignatureDoesNotMatch   │ 403 SignatureDoesNotMatch│ "Request signature    │
│                          │                          │  invalid. Check       │
│                          │                          │  secret key and       │
│                          │                          │  system time"         │
│  ────────────────────────┼──────────────────────────┼───────────────────────│
│  BucketAlreadyExists     │ 409 BucketAlreadyExists  │ "Bucket name 'xyz'    │
│                          │                          │  is already taken     │
│                          │                          │  globally"            │
│  ────────────────────────┼──────────────────────────┼───────────────────────│
│  BucketNotEmpty          │ 409 BucketNotEmpty       │ "Cannot delete bucket │
│                          │                          │  'xyz': not empty.    │
│                          │                          │  Delete objects first"│
│  ────────────────────────┼──────────────────────────┼───────────────────────│
│  EntityTooLarge          │ 400 EntityTooLarge       │ "Object too large     │
│                          │                          │  for single upload.   │
│                          │                          │  Max 5GB, use         │
│                          │                          │  multipart for larger"│
│  ────────────────────────┼──────────────────────────┼───────────────────────│
│  SlowDown                │ 503 SlowDown             │ "Request rate too     │
│                          │                          │  high. Retrying with  │
│                          │                          │  backoff..."          │
│  ────────────────────────┼──────────────────────────┼───────────────────────│
│  CredentialNotFound      │ (internal)               │ "No AWS credentials   │
│                          │                          │  found. Set           │
│                          │                          │  AWS_ACCESS_KEY_ID    │
│                          │                          │  and                  │
│                          │                          │  AWS_SECRET_ACCESS_KEY│
│                          │                          │  or configure         │
│                          │                          │  ~/.aws/credentials"  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Actionable Error Guidance

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ACTIONABLE ERROR GUIDANCE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  struct S3Error {                                                           │
│      kind: S3ErrorKind,                                                     │
│      message: String,                                                       │
│      request_id: Option<String>,                                            │
│      bucket: Option<String>,                                                │
│      key: Option<String>,                                                   │
│      suggestion: Option<String>,  // Actionable guidance                   │
│  }                                                                          │
│                                                                             │
│  impl S3Error {                                                             │
│      fn with_suggestion(mut self) -> Self {                                │
│          self.suggestion = match self.kind {                               │
│              S3ErrorKind::AccessDenied => Some(                            │
│                  "Check IAM policy allows s3:* actions on this resource.   │
│                   Verify the bucket policy doesn't deny access.            │
│                   Ensure you're using credentials for the correct account."│
│                      .to_string()                                          │
│              ),                                                             │
│              S3ErrorKind::NoSuchBucket => Some(                            │
│                  "Verify bucket name spelling.                             │
│                   Check if bucket is in expected region.                   │
│                   Bucket names are globally unique - it may belong         │
│                   to another account.".to_string()                         │
│              ),                                                             │
│              S3ErrorKind::SignatureDoesNotMatch => Some(                   │
│                  "Verify AWS secret access key is correct.                 │
│                   Check system clock is synchronized (within 5 minutes).   │
│                   Ensure credentials haven't been rotated.".to_string()    │
│              ),                                                             │
│              S3ErrorKind::CredentialNotFound => Some(                      │
│                  "Set credentials via:                                     │
│                   1. Environment: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY │
│                   2. File: ~/.aws/credentials with [default] profile       │
│                   3. IAM role: if running on EC2/ECS/Lambda".to_string()   │
│              ),                                                             │
│              _ => None,                                                     │
│          };                                                                 │
│          self                                                               │
│      }                                                                      │
│  }                                                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. API Ergonomics Refinement

### 7.1 Builder Pattern Improvements

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   BUILDER PATTERN IMPROVEMENTS                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Fluent Request Builders:                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Simple case - minimal boilerplate                               │   │
│  │  client.put_object("bucket", "key", data).await?;                   │   │
│  │                                                                      │   │
│  │  // With options - fluent builder                                   │   │
│  │  client.put_object("bucket", "key", data)                           │   │
│  │      .content_type("application/json")                              │   │
│  │      .storage_class(StorageClass::IntelligentTiering)               │   │
│  │      .metadata("author", "alice")                                   │   │
│  │      .metadata("version", "1.0")                                    │   │
│  │      .server_side_encryption(SSE::Kms { key_id: "..." })            │   │
│  │      .send()                                                        │   │
│  │      .await?;                                                       │   │
│  │                                                                      │   │
│  │  // Get with conditions                                             │   │
│  │  client.get_object("bucket", "key")                                 │   │
│  │      .if_match("\"abc123\"")                                        │   │
│  │      .range(0..1024)                                                │   │
│  │      .send()                                                        │   │
│  │      .await?;                                                       │   │
│  │                                                                      │   │
│  │  // List with filtering                                             │   │
│  │  client.list_objects("bucket")                                      │   │
│  │      .prefix("logs/2024/")                                          │   │
│  │      .delimiter("/")                                                │   │
│  │      .max_keys(100)                                                 │   │
│  │      .send()                                                        │   │
│  │      .await?;                                                       │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Type-Safe Builders:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  // Typestate pattern for required fields                           │   │
│  │  struct PutObjectBuilder<BucketState, KeyState, BodyState> {        │   │
│  │      bucket: BucketState,                                           │   │
│  │      key: KeyState,                                                  │   │
│  │      body: BodyState,                                               │   │
│  │      // optional fields always available                            │   │
│  │      content_type: Option<String>,                                  │   │
│  │      // ...                                                         │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  // Only complete builders can call send()                          │   │
│  │  impl PutObjectBuilder<Bucket, Key, Body> {                         │   │
│  │      async fn send(self) -> Result<PutObjectResponse, S3Error>;     │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  │  // Compile error if required field missing:                        │   │
│  │  // client.put_object().send() // Error: send not found             │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Convenience Methods

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONVENIENCE METHODS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  High-Level Helpers:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  impl S3Client {                                                     │   │
│  │      // Upload file from path (handles multipart automatically)     │   │
│  │      async fn upload_file(                                           │   │
│  │          &self,                                                      │   │
│  │          bucket: &str,                                               │   │
│  │          key: &str,                                                  │   │
│  │          path: impl AsRef<Path>,                                     │   │
│  │      ) -> Result<PutObjectResponse, S3Error>;                        │   │
│  │                                                                      │   │
│  │      // Download file to path                                        │   │
│  │      async fn download_file(                                         │   │
│  │          &self,                                                      │   │
│  │          bucket: &str,                                               │   │
│  │          key: &str,                                                  │   │
│  │          path: impl AsRef<Path>,                                     │   │
│  │      ) -> Result<(), S3Error>;                                       │   │
│  │                                                                      │   │
│  │      // Check if object exists                                       │   │
│  │      async fn object_exists(                                         │   │
│  │          &self,                                                      │   │
│  │          bucket: &str,                                               │   │
│  │          key: &str,                                                  │   │
│  │      ) -> Result<bool, S3Error>;                                     │   │
│  │                                                                      │   │
│  │      // Get object as string (for small text objects)               │   │
│  │      async fn get_object_string(                                     │   │
│  │          &self,                                                      │   │
│  │          bucket: &str,                                               │   │
│  │          key: &str,                                                  │   │
│  │      ) -> Result<String, S3Error>;                                   │   │
│  │                                                                      │   │
│  │      // Get object as JSON                                           │   │
│  │      async fn get_object_json<T: DeserializeOwned>(                 │   │
│  │          &self,                                                      │   │
│  │          bucket: &str,                                               │   │
│  │          key: &str,                                                  │   │
│  │      ) -> Result<T, S3Error>;                                        │   │
│  │                                                                      │   │
│  │      // Put object from JSON                                         │   │
│  │      async fn put_object_json<T: Serialize>(                        │   │
│  │          &self,                                                      │   │
│  │          bucket: &str,                                               │   │
│  │          key: &str,                                                  │   │
│  │          value: &T,                                                  │   │
│  │      ) -> Result<PutObjectResponse, S3Error>;                        │   │
│  │                                                                      │   │
│  │      // Delete all objects with prefix                              │   │
│  │      async fn delete_prefix(                                         │   │
│  │          &self,                                                      │   │
│  │          bucket: &str,                                               │   │
│  │          prefix: &str,                                               │   │
│  │      ) -> Result<u64, S3Error>; // Returns count deleted            │   │
│  │                                                                      │   │
│  │      // List all objects (handles pagination)                       │   │
│  │      fn list_all_objects(                                            │   │
│  │          &self,                                                      │   │
│  │          bucket: &str,                                               │   │
│  │      ) -> impl Stream<Item = Result<S3Object, S3Error>>;            │   │
│  │  }                                                                   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Documentation Requirements

### 8.1 Inline Documentation Standards

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  INLINE DOCUMENTATION STANDARDS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Every Public Item Must Have:                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  /// One-line summary describing what this does.                    │   │
│  │  ///                                                                 │   │
│  │  /// # Arguments (for functions with non-obvious params)            │   │
│  │  ///                                                                 │   │
│  │  /// * `bucket` - The S3 bucket name                                │   │
│  │  /// * `key` - Object key (path within bucket)                      │   │
│  │  ///                                                                 │   │
│  │  /// # Returns                                                       │   │
│  │  ///                                                                 │   │
│  │  /// The object's metadata and body as a stream.                    │   │
│  │  ///                                                                 │   │
│  │  /// # Errors                                                        │   │
│  │  ///                                                                 │   │
│  │  /// - [`S3Error::NoSuchKey`] - Object doesn't exist                │   │
│  │  /// - [`S3Error::AccessDenied`] - Insufficient permissions         │   │
│  │  ///                                                                 │   │
│  │  /// # Example                                                       │   │
│  │  ///                                                                 │   │
│  │  /// ```rust                                                         │   │
│  │  /// let response = client.get_object("my-bucket", "file.txt")      │   │
│  │  ///     .await?;                                                   │   │
│  │  /// let data = response.body().collect().await?;                   │   │
│  │  /// ```                                                             │   │
│  │  ///                                                                 │   │
│  │  /// # See Also                                                      │   │
│  │  ///                                                                 │   │
│  │  /// - [`head_object`] - Get metadata without body                  │   │
│  │  /// - [`get_object_string`] - Convenience for text objects         │   │
│  │  pub async fn get_object(                                            │   │
│  │      &self,                                                          │   │
│  │      bucket: &str,                                                   │   │
│  │      key: &str,                                                      │   │
│  │  ) -> Result<GetObjectResponse, S3Error>                             │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Module-Level Documentation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  MODULE-LEVEL DOCUMENTATION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  //! # AWS S3 Integration                                                   │
│  //!                                                                        │
│  //! This module provides a high-level client for Amazon S3 operations.    │
│  //!                                                                        │
│  //! ## Quick Start                                                         │
│  //!                                                                        │
│  //! ```rust                                                                │
│  //! use integration_s3::{S3Client, S3Config};                             │
│  //!                                                                        │
│  //! // Create client with default credential chain                        │
│  //! let client = S3Client::new(S3Config::default()).await?;               │
│  //!                                                                        │
│  //! // Upload an object                                                   │
│  //! client.put_object("my-bucket", "hello.txt", b"Hello, S3!")            │
│  //!     .await?;                                                          │
│  //!                                                                        │
│  //! // Download an object                                                 │
│  //! let response = client.get_object("my-bucket", "hello.txt").await?;    │
│  //! let data = response.body().collect().await?;                          │
│  //! ```                                                                    │
│  //!                                                                        │
│  //! ## Configuration                                                       │
│  //!                                                                        │
│  //! See [`S3Config`] for all configuration options.                       │
│  //!                                                                        │
│  //! ## Credentials                                                         │
│  //!                                                                        │
│  //! Credentials are resolved in this order:                               │
│  //! 1. Explicit credentials in config                                     │
│  //! 2. `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment vars   │
│  //! 3. `~/.aws/credentials` file                                          │
│  //! 4. EC2/ECS instance metadata service                                  │
│  //!                                                                        │
│  //! ## Features                                                            │
│  //!                                                                        │
│  //! - **Multipart uploads**: Automatic for large objects                  │
│  //! - **Streaming**: Memory-efficient for any object size                 │
│  //! - **Resilience**: Built-in retry, circuit breaker, rate limiting      │
│  //! - **Observability**: Tracing, metrics, structured logging             │
│  //!                                                                        │
│  //! ## Error Handling                                                      │
│  //!                                                                        │
│  //! All operations return `Result<T, S3Error>`. See [`S3Error`] for       │
│  //! error types and handling guidance.                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Final Checklist

### 9.1 Pre-Implementation Checklist

- [x] All 26 S3 operations specified
- [x] AWS Signature V4 fully designed
- [x] Credential chain implemented
- [x] Error taxonomy complete
- [x] Retry strategy defined
- [x] Circuit breaker integrated
- [x] Rate limiting integrated
- [x] Streaming architecture defined
- [x] Multipart upload logic complete
- [x] Presigned URL generation designed
- [x] Mock interfaces specified
- [x] Test strategy defined
- [x] Security hardening applied
- [x] Performance optimizations identified
- [x] API ergonomics refined
- [x] Documentation standards set

### 9.2 Dependencies Verification

| Dependency | Source | Status |
|------------|--------|--------|
| errors | shared/primitives | ✅ Verified |
| retry | shared/primitives | ✅ Verified |
| circuit-breaker | shared/primitives | ✅ Verified |
| rate-limits | shared/primitives | ✅ Verified |
| tracing | shared/primitives | ✅ Verified |
| logging | shared/primitives | ✅ Verified |
| types | shared/primitives | ✅ Verified |
| config | shared/primitives | ✅ Verified |
| ruvbase | N/A | ❌ Not used (as required) |
| Other integrations | N/A | ❌ Not used (as required) |

### 9.3 London-School TDD Readiness

- [x] All collaborators defined as traits
- [x] Mock implementations designed
- [x] Dependency injection points identified
- [x] Test doubles specified
- [x] Behavior specifications written
- [x] Integration test scenarios defined

---

**End of Refinement Phase**

*Proceed to Phase 5: Completion when ready.*
