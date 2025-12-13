# Amazon ECR Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/aws/ecr`

---

## 1. Edge Cases and Boundary Conditions

### 1.1 Token Expiration During Operation

```
Scenario: Token expires mid-batch operation
─────────────────────────────────────────────

Timeline:
├── T=0:      Token acquired (expires T+12h)
├── T=11h59m: Start batch_get_images (100 images)
├── T=12h:    Token expires during pagination
└── T=12h+1s: Request fails with ExpiredTokenException

Handling:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION handle_token_expiry_during_batch(operation, context):          │
│                                                                          │
│   TRY:                                                                   │
│     result = execute_operation(operation)                                │
│                                                                          │
│   CATCH ExpiredTokenException:                                           │
│     // Clear cached token                                                │
│     token_cache.invalidate(context.registry_id)                          │
│                                                                          │
│     // Acquire fresh token                                               │
│     new_token = refresh_authorization_token(context)                     │
│                                                                          │
│     // Retry from current page, not beginning                            │
│     result = retry_operation_with_token(operation, new_token)            │
│                                                                          │
│   RETURN result                                                          │
└─────────────────────────────────────────────────────────────────────────┘

Key Behaviors:
- Preserve pagination state on retry
- Single retry attempt for token refresh
- Fail fast if refresh also fails
```

### 1.2 Immutable Tag Conflicts

```
Scenario: Attempt to retag image in immutable repository
────────────────────────────────────────────────────────

Precondition:
- Repository has imageTagMutability = IMMUTABLE
- Tag "v1.0.0" already exists pointing to digest A
- Attempt to assign "v1.0.0" to digest B

Handling:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION put_image_tag_safe(repo, manifest_digest, new_tag):            │
│                                                                          │
│   // Check repository mutability setting                                 │
│   repo_info = get_repository(repo)                                       │
│                                                                          │
│   IF repo_info.image_tag_mutability == IMMUTABLE:                        │
│     // Check if tag already exists                                       │
│     existing = describe_images(repo, tag=new_tag)                        │
│                                                                          │
│     IF existing IS NOT empty:                                            │
│       IF existing[0].digest == manifest_digest:                          │
│         // Tag already points to this digest - success                   │
│         RETURN existing[0]                                               │
│       ELSE:                                                              │
│         // Tag exists for different digest                               │
│         RAISE ImageTagAlreadyExistsError(                                │
│           tag=new_tag,                                                   │
│           existing_digest=existing[0].digest,                            │
│           requested_digest=manifest_digest                               │
│         )                                                                │
│                                                                          │
│   // Safe to proceed                                                     │
│   RETURN put_image(repo, manifest_digest, new_tag)                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Multi-Architecture Image Handling

```
Scenario: Requesting specific platform from manifest list
─────────────────────────────────────────────────────────

Input: Image tag pointing to manifest list (multi-arch)
Request: Get manifest for linux/arm64

Handling:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION get_platform_manifest(repo, tag, target_platform):             │
│                                                                          │
│   // Get the manifest (could be list or single)                          │
│   image = batch_get_image(repo, tag)                                     │
│   manifest = parse_manifest(image.manifest)                              │
│                                                                          │
│   IF manifest.media_type == MANIFEST_LIST_V2 OR                          │
│      manifest.media_type == OCI_IMAGE_INDEX:                             │
│                                                                          │
│     // Find matching platform                                            │
│     FOR platform_manifest IN manifest.manifests:                         │
│       IF matches_platform(platform_manifest.platform, target_platform):  │
│         // Fetch the actual manifest by digest                           │
│         RETURN batch_get_image(repo, digest=platform_manifest.digest)    │
│                                                                          │
│     RAISE PlatformNotFoundError(                                         │
│       requested=target_platform,                                         │
│       available=manifest.manifests.map(m => m.platform)                  │
│     )                                                                    │
│                                                                          │
│   ELSE:                                                                  │
│     // Single-platform manifest                                          │
│     RETURN image                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Platform Matching Rules:
- Exact match: os + architecture + variant
- Partial match: os + architecture (variant optional)
- Normalize values: "amd64" == "x86_64"
```

### 1.4 Scan State Transitions

```
Scenario: Handling all scan state transitions
─────────────────────────────────────────────

State Machine:
┌─────────┐    start     ┌───────────┐
│ Initial │─────────────▶│  Pending  │
└─────────┘              └─────┬─────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
             ┌───────────┐         ┌───────────┐
             │InProgress │         │   Failed  │
             └─────┬─────┘         └───────────┘
                   │                     ▲
        ┌──────────┴──────────┐          │
        ▼                     ▼          │
 ┌───────────┐         ┌───────────┐     │
 │ Complete  │         │Unsupported│─────┘
 └─────┬─────┘         └───────────┘
       │
       ├──────────────────────────┐
       ▼                          ▼
┌─────────────────┐    ┌─────────────────────┐
│ScanWithFindings │    │ FindingsUnavailable │
└─────────────────┘    └─────────────────────┘

Handling:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION wait_for_scan_completion(repo, digest, options):               │
│                                                                          │
│   start_time = now()                                                     │
│   backoff = ExponentialBackoff(                                          │
│     initial: 2s, max: 30s, multiplier: 2                                 │
│   )                                                                      │
│                                                                          │
│   LOOP:                                                                  │
│     status = describe_images(repo, digest).scan_status                   │
│                                                                          │
│     MATCH status.state:                                                  │
│       Pending, InProgress, Active:                                       │
│         IF elapsed(start_time) > options.timeout:                        │
│           RAISE ScanTimeoutError(elapsed=elapsed(start_time))            │
│         sleep(backoff.next())                                            │
│         CONTINUE                                                         │
│                                                                          │
│       Complete, ScanningWithFindings:                                    │
│         RETURN get_scan_findings(repo, digest)                           │
│                                                                          │
│       Failed:                                                            │
│         RAISE ScanFailedError(description=status.description)            │
│                                                                          │
│       Unsupported:                                                       │
│         RAISE ImageScanUnsupportedError(reason=status.description)       │
│                                                                          │
│       FindingsUnavailable:                                               │
│         RAISE FindingsUnavailableError(                                  │
│           message="Scan complete but findings expired or unavailable"    │
│         )                                                                │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.5 Cross-Account Repository Access

```
Scenario: Accessing repository in different AWS account
────────────────────────────────────────────────────────

Configuration:
- Caller account: 111111111111
- Target registry: 222222222222.dkr.ecr.us-east-1.amazonaws.com
- Repository policy grants cross-account access

Handling:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION get_cross_account_token(target_registry_id):                   │
│                                                                          │
│   // GetAuthorizationToken accepts registry IDs                          │
│   response = ecr.get_authorization_token(                                │
│     registryIds: [target_registry_id]                                    │
│   )                                                                      │
│                                                                          │
│   // Token is scoped to the target registry                              │
│   RETURN response.authorization_data[0]                                  │
│                                                                          │
│ FUNCTION describe_cross_account_images(target_registry, repo):          │
│                                                                          │
│   // Must specify registry_id for cross-account                          │
│   client = create_client(registry_id=target_registry)                    │
│                                                                          │
│   TRY:                                                                   │
│     RETURN client.describe_images(repo)                                  │
│                                                                          │
│   CATCH AccessDeniedException:                                           │
│     // Check if repository policy allows access                          │
│     RAISE CrossAccountAccessDenied(                                      │
│       source_account=get_caller_account(),                               │
│       target_registry=target_registry,                                   │
│       repository=repo,                                                   │
│       hint="Verify repository policy grants ecr:DescribeImages"          │
│     )                                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.6 Large Manifest Handling

```
Scenario: Manifest exceeds response size limits
───────────────────────────────────────────────

Context:
- BatchGetImage has 5MB response limit
- Large multi-arch manifests with many platforms
- Images with extensive labels/annotations

Handling:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION get_large_manifest(repo, image_id):                            │
│                                                                          │
│   TRY:                                                                   │
│     RETURN batch_get_image(repo, image_id, accepted_media_types=[       │
│       MANIFEST_V2, MANIFEST_LIST_V2, OCI_MANIFEST, OCI_INDEX            │
│     ])                                                                   │
│                                                                          │
│   CATCH LayerPartTooLarge OR ResponseSizeLimitExceeded:                 │
│     // Fetch manifest only, without config blob                          │
│     manifest_only = batch_get_image(repo, image_id,                      │
│       accepted_media_types=[MANIFEST_V2, OCI_MANIFEST]                   │
│     )                                                                    │
│                                                                          │
│     // Parse to get config digest                                        │
│     parsed = parse_manifest(manifest_only.manifest)                      │
│                                                                          │
│     // Fetch config separately via download URL                          │
│     config_url = get_download_url_for_layer(                             │
│       repo, parsed.config.digest                                         │
│     )                                                                    │
│     config = fetch_layer_content(config_url)                             │
│                                                                          │
│     RETURN combine_manifest_and_config(manifest_only, config)            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Security Hardening

### 2.1 Token Security

```
Token Handling Requirements:
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Memory Protection                                                     │
│    - Store tokens in SecretString (zeroized on drop)                    │
│    - Never log token values                                              │
│    - Clear from memory immediately after use                             │
│                                                                          │
│ 2. Token Scope Validation                                                │
│    - Verify token endpoint matches expected registry                     │
│    - Reject tokens from unexpected sources                               │
│    - Validate expiration before use                                      │
│                                                                          │
│ 3. Credential Isolation                                                  │
│    - Separate token caches per registry                                  │
│    - No token sharing across accounts                                    │
│    - Clear all tokens on credential rotation                             │
└─────────────────────────────────────────────────────────────────────────┘

Implementation:
┌─────────────────────────────────────────────────────────────────────────┐
│ STRUCT SecureTokenCache:                                                 │
│   tokens: RwLock<HashMap<RegistryKey, EncryptedToken>>                  │
│   encryption_key: SecretKey  // Per-process ephemeral key               │
│                                                                          │
│ FUNCTION store_token(registry, token, expires_at):                       │
│   encrypted = encrypt_in_memory(token, self.encryption_key)              │
│   self.tokens.write().insert(registry, EncryptedToken {                  │
│     ciphertext: encrypted,                                               │
│     expires_at: expires_at,                                              │
│     created_at: now()                                                    │
│   })                                                                     │
│                                                                          │
│ FUNCTION get_token(registry) -> Option<SecretString>:                    │
│   guard = self.tokens.read()                                             │
│   IF let Some(encrypted) = guard.get(registry):                          │
│     IF encrypted.expires_at > now() + REFRESH_BUFFER:                    │
│       RETURN Some(decrypt_in_memory(encrypted, self.encryption_key))     │
│   RETURN None                                                            │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Image Digest Verification

```
Digest Verification Requirements:
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. Always Verify Digest on Retrieval                                     │
│    - Compute digest of received manifest                                 │
│    - Compare against requested/returned digest                           │
│    - Reject on mismatch                                                  │
│                                                                          │
│ 2. Digest Format Validation                                              │
│    - Validate algorithm prefix (sha256:, sha512:)                        │
│    - Validate hex encoding                                               │
│    - Validate length for algorithm                                       │
│                                                                          │
│ 3. Content Integrity                                                     │
│    - Verify layer digests match manifest                                 │
│    - Verify config digest matches manifest                               │
└─────────────────────────────────────────────────────────────────────────┘

Implementation:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION verify_image_digest(image: Image) -> Result<VerifiedImage>:    │
│                                                                          │
│   manifest_bytes = image.image_manifest.as_bytes()                       │
│                                                                          │
│   // Compute canonical digest                                            │
│   computed_digest = "sha256:" + sha256_hex(manifest_bytes)               │
│                                                                          │
│   // Compare against returned digest                                     │
│   IF image.image_id.digest != computed_digest:                           │
│     RAISE DigestMismatchError(                                           │
│       expected=image.image_id.digest,                                    │
│       computed=computed_digest                                           │
│     )                                                                    │
│                                                                          │
│   // Parse and verify internal references                                │
│   manifest = parse_manifest(manifest_bytes)                              │
│   validate_digest_format(manifest.config.digest)                         │
│   FOR layer IN manifest.layers:                                          │
│     validate_digest_format(layer.digest)                                 │
│                                                                          │
│   RETURN VerifiedImage(image, computed_digest)                           │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Input Validation

```
Validation Rules:
┌─────────────────────────────────────────────────────────────────────────┐
│ Repository Name:                                                         │
│   - Pattern: ^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:/[a-z0-9]+(?:[._-]...)*)*$ │
│   - Length: 2-256 characters                                             │
│   - No leading/trailing slashes                                          │
│                                                                          │
│ Image Tag:                                                               │
│   - Pattern: ^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$                        │
│   - Length: 1-128 characters                                             │
│   - Cannot be pure digest format                                         │
│                                                                          │
│ Image Digest:                                                            │
│   - Pattern: ^(sha256|sha512):[a-f0-9]{64,128}$                         │
│   - sha256: 64 hex characters                                            │
│   - sha512: 128 hex characters                                           │
│                                                                          │
│ Registry ID:                                                             │
│   - Pattern: ^[0-9]{12}$                                                 │
│   - Must be valid AWS account ID                                         │
└─────────────────────────────────────────────────────────────────────────┘

Implementation:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION validate_repository_name(name: String) -> Result<ValidatedName>│
│   IF name.len() < 2 OR name.len() > 256:                                 │
│     RAISE InvalidParameterError("Repository name length invalid")        │
│                                                                          │
│   IF NOT REPO_PATTERN.matches(name):                                     │
│     RAISE InvalidParameterError("Repository name format invalid")        │
│                                                                          │
│   // Check for path traversal attempts                                   │
│   IF name.contains("..") OR name.starts_with("/"):                       │
│     RAISE InvalidParameterError("Invalid path components")               │
│                                                                          │
│   RETURN ValidatedName(name)                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Audit Logging

```
Audit Events:
┌─────────────────────────────────────────────────────────────────────────┐
│ Event Type           │ Logged Fields                                    │
│ ─────────────────────┼────────────────────────────────────────────────  │
│ TOKEN_ACQUIRED       │ registry_id, expires_at, source_ip               │
│ TOKEN_REFRESHED      │ registry_id, old_expiry, new_expiry              │
│ TOKEN_EXPIRED        │ registry_id, expired_at                          │
│ IMAGE_DESCRIBED      │ repository, digest, tag, caller                  │
│ IMAGE_TAGGED         │ repository, digest, new_tag, caller              │
│ IMAGE_DELETED        │ repository, digest, tags_removed, caller         │
│ SCAN_STARTED         │ repository, digest, scan_type, caller            │
│ SCAN_FINDINGS_READ   │ repository, digest, severity_counts, caller      │
│ CROSS_ACCOUNT_ACCESS │ source_account, target_registry, action          │
│ ACCESS_DENIED        │ repository, action, caller, reason               │
└─────────────────────────────────────────────────────────────────────────┘

Redaction Rules:
- Never log: token values, manifest content, layer data
- Hash before logging: image digests (first 12 chars only in logs)
- Always log: operation type, timestamp, caller identity, success/failure
```

---

## 3. Performance Optimizations

### 3.1 Batch Operation Optimization

```
Batch Size Limits:
┌─────────────────────────────────────────────────────────────────────────┐
│ Operation            │ Max Batch │ Optimal Batch │ Notes                │
│ ─────────────────────┼───────────┼───────────────┼───────────────────── │
│ BatchGetImage        │ 100       │ 50            │ Response size limits │
│ BatchDeleteImage     │ 100       │ 100           │ Full batch efficient │
│ DescribeImages       │ 100       │ 100           │ Pagination preferred │
└─────────────────────────────────────────────────────────────────────────┘

Implementation:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION batch_get_images_optimized(repo, image_ids):                   │
│                                                                          │
│   results = []                                                           │
│   failures = []                                                          │
│                                                                          │
│   // Chunk into optimal batch sizes                                      │
│   FOR chunk IN image_ids.chunks(OPTIMAL_BATCH_SIZE):                     │
│                                                                          │
│     TRY:                                                                 │
│       response = batch_get_image(repo, chunk)                            │
│       results.extend(response.images)                                    │
│       failures.extend(response.failures)                                 │
│                                                                          │
│     CATCH ResponseSizeLimitExceeded:                                     │
│       // Reduce batch size and retry                                     │
│       FOR smaller_chunk IN chunk.chunks(REDUCED_BATCH_SIZE):             │
│         sub_response = batch_get_image(repo, smaller_chunk)              │
│         results.extend(sub_response.images)                              │
│         failures.extend(sub_response.failures)                           │
│                                                                          │
│   RETURN BatchResult(images=results, failures=failures)                  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Metadata Caching

```
Cache Strategy:
┌─────────────────────────────────────────────────────────────────────────┐
│ Data Type            │ TTL      │ Invalidation Trigger                  │
│ ─────────────────────┼──────────┼────────────────────────────────────── │
│ Repository metadata  │ 5 min    │ Any write operation                   │
│ Image list (by tag)  │ 1 min    │ PutImage, BatchDelete                 │
│ Image detail         │ 10 min   │ Tag changes, scan complete            │
│ Manifest content     │ Forever  │ Never (immutable by digest)           │
│ Scan findings        │ 5 min    │ New scan started                      │
│ Lifecycle policy     │ 15 min   │ Explicit refresh request              │
└─────────────────────────────────────────────────────────────────────────┘

Implementation:
┌─────────────────────────────────────────────────────────────────────────┐
│ STRUCT MetadataCache:                                                    │
│   repositories: TtlCache<String, Repository>                             │
│   image_details: TtlCache<(String, String), ImageDetail>                 │
│   manifests: LruCache<String, ImageManifest>  // By digest, no TTL      │
│   scan_findings: TtlCache<String, ScanFindings>                          │
│                                                                          │
│ FUNCTION get_image_detail_cached(repo, digest):                          │
│   cache_key = (repo, digest)                                             │
│                                                                          │
│   IF let Some(cached) = self.image_details.get(cache_key):               │
│     emit_metric("ecr.cache.hit", tags=["type:image_detail"])             │
│     RETURN cached                                                        │
│                                                                          │
│   emit_metric("ecr.cache.miss", tags=["type:image_detail"])              │
│   detail = describe_images(repo, digest)                                 │
│   self.image_details.insert(cache_key, detail, TTL=10min)                │
│   RETURN detail                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Connection Pooling

```
Connection Pool Configuration:
┌─────────────────────────────────────────────────────────────────────────┐
│ Parameter                    │ Value  │ Rationale                       │
│ ─────────────────────────────┼────────┼──────────────────────────────── │
│ max_connections_per_region   │ 50     │ Balance parallelism/resources   │
│ idle_timeout                 │ 60s    │ Keep warm for bursts            │
│ connection_timeout           │ 5s     │ Fast failure on network issues  │
│ request_timeout              │ 30s    │ Allow for large responses       │
│ keep_alive_interval          │ 15s    │ Prevent idle disconnects        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Resilience Patterns

### 4.1 Retry Strategy by Error Type

```
Retry Classification:
┌─────────────────────────────────────────────────────────────────────────┐
│ Error                    │ Retry │ Strategy                             │
│ ─────────────────────────┼───────┼───────────────────────────────────── │
│ ThrottlingException      │ Yes   │ Exponential + jitter, max 5 attempts │
│ ServiceUnavailable       │ Yes   │ Fixed 1s delay, max 3 attempts       │
│ RequestTimeout           │ Yes   │ Immediate retry, max 2 attempts      │
│ ConnectionError          │ Yes   │ Exponential, max 3 attempts          │
│ InternalServiceError     │ Yes   │ Exponential, max 3 attempts          │
│ RepositoryNotFound       │ No    │ Fail immediately                     │
│ ImageNotFound            │ No    │ Fail immediately                     │
│ AccessDeniedException    │ No    │ Fail immediately                     │
│ InvalidParameterException│ No    │ Fail immediately                     │
│ LimitExceededException   │ Yes   │ Long backoff (30s), max 2 attempts   │
└─────────────────────────────────────────────────────────────────────────┘

Implementation:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION execute_with_retry<T>(operation: Fn() -> T) -> Result<T>:      │
│                                                                          │
│   attempts = 0                                                           │
│   last_error = None                                                      │
│                                                                          │
│   WHILE attempts < MAX_ATTEMPTS:                                         │
│     TRY:                                                                 │
│       RETURN operation()                                                 │
│                                                                          │
│     CATCH error:                                                         │
│       attempts += 1                                                      │
│       last_error = error                                                 │
│                                                                          │
│       retry_config = get_retry_config(error)                             │
│       IF NOT retry_config.should_retry OR attempts >= retry_config.max:  │
│         BREAK                                                            │
│                                                                          │
│       delay = calculate_delay(retry_config, attempts)                    │
│       emit_metric("ecr.retry", tags=["error:" + error.type])             │
│       sleep(delay)                                                       │
│                                                                          │
│   RAISE last_error                                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Circuit Breaker Tuning

```
Circuit Breaker Configuration:
┌─────────────────────────────────────────────────────────────────────────┐
│ Parameter              │ Value   │ Rationale                            │
│ ───────────────────────┼─────────┼───────────────────────────────────── │
│ failure_threshold      │ 5       │ Allow brief issues                   │
│ failure_window         │ 30s     │ Recent failures only                 │
│ open_duration          │ 60s     │ Allow service recovery               │
│ half_open_max_requests │ 3       │ Gradual recovery                     │
│ success_threshold      │ 2       │ Confirm recovery before close        │
└─────────────────────────────────────────────────────────────────────────┘

Per-Region Isolation:
┌─────────────────────────────────────────────────────────────────────────┐
│ STRUCT RegionalCircuitBreakers:                                          │
│   breakers: HashMap<Region, CircuitBreaker>                              │
│                                                                          │
│ FUNCTION get_breaker(region: Region) -> CircuitBreaker:                  │
│   IF NOT self.breakers.contains(region):                                 │
│     self.breakers.insert(region, CircuitBreaker::new(                    │
│       failure_threshold=5,                                               │
│       failure_window=30s,                                                │
│       open_duration=60s                                                  │
│     ))                                                                   │
│   RETURN self.breakers.get(region)                                       │
│                                                                          │
│ // Regional failures don't affect other regions                          │
│ // us-east-1 circuit open doesn't block us-west-2 requests              │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Graceful Degradation

```
Degradation Strategies:
┌─────────────────────────────────────────────────────────────────────────┐
│ Scenario                     │ Degradation Strategy                     │
│ ─────────────────────────────┼───────────────────────────────────────── │
│ Scan service unavailable     │ Return cached findings with stale flag   │
│ Token refresh failing        │ Use existing token until actual expiry   │
│ Describe rate limited        │ Return partial results, indicate more    │
│ Cross-region unreachable     │ Operate on available regions only        │
│ Manifest fetch timeout       │ Return basic image info without manifest │
└─────────────────────────────────────────────────────────────────────────┘

Implementation:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION get_scan_findings_degraded(repo, digest):                       │
│                                                                          │
│   TRY:                                                                   │
│     findings = describe_image_scan_findings(repo, digest)                │
│     cache.store(digest, findings)                                        │
│     RETURN ScanResult(findings, stale=false)                             │
│                                                                          │
│   CATCH ServiceUnavailable, Timeout:                                     │
│     IF let Some(cached) = cache.get(digest):                             │
│       log.warn("Returning stale scan findings", digest=digest)           │
│       emit_metric("ecr.scan.stale_response")                             │
│       RETURN ScanResult(cached, stale=true, cached_at=cached.timestamp)  │
│                                                                          │
│     // No cache available, propagate error                               │
│     RAISE                                                                │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Testing Strategy

### 5.1 Unit Tests

```
Test Categories:
┌─────────────────────────────────────────────────────────────────────────┐
│ Category               │ Test Cases                                     │
│ ───────────────────────┼─────────────────────────────────────────────── │
│ Input Validation       │ - Valid/invalid repository names               │
│                        │ - Valid/invalid image tags                     │
│                        │ - Valid/invalid digests                        │
│                        │ - Boundary length values                       │
│                        │                                                │
│ Token Management       │ - Token caching and retrieval                  │
│                        │ - Expiry detection                             │
│                        │ - Refresh buffer calculation                   │
│                        │ - Concurrent access                            │
│                        │                                                │
│ Manifest Parsing       │ - Schema v1 and v2 manifests                   │
│                        │ - Manifest lists (multi-arch)                  │
│                        │ - OCI format manifests                         │
│                        │ - Malformed manifest handling                  │
│                        │                                                │
│ Error Mapping          │ - All AWS error types                          │
│                        │ - Retry classification                         │
│                        │ - Error message extraction                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Integration Tests

```
Integration Test Scenarios:
┌─────────────────────────────────────────────────────────────────────────┐
│ Scenario                    │ Setup                                     │
│ ────────────────────────────┼──────────────────────────────────────────│
│ Repository listing          │ MockEcrClient with 5 repositories         │
│ Image pagination            │ 150 images, verify all pages retrieved    │
│ Cross-account access        │ Mock cross-account token generation       │
│ Scan workflow               │ Progress through all scan states          │
│ Token expiry during batch   │ Expire token mid-operation                │
│ Multi-region operations     │ Multiple regional clients                 │
│ Circuit breaker trigger     │ Inject 5 consecutive failures             │
│ Replication tracking        │ Multi-destination replication polling     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Simulation Tests

```
Simulation Scenarios:
┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION test_scan_progression():                                        │
│   mock = MockEcrClient::new()                                            │
│                                                                          │
│   // Configure scan to progress through states                           │
│   mock.configure_scan_progression(                                       │
│     repository="test-repo",                                              │
│     digest="sha256:abc...",                                              │
│     states=[Pending, InProgress, InProgress, Complete],                  │
│     findings=mock_findings(critical=1, high=3)                           │
│   )                                                                      │
│                                                                          │
│   // Start scan                                                          │
│   result = start_scan(mock, "test-repo", "sha256:abc...")                │
│   ASSERT result.status == Pending                                        │
│                                                                          │
│   // Wait for completion                                                 │
│   findings = wait_for_scan(mock, "test-repo", "sha256:abc...",           │
│     timeout=30s                                                          │
│   )                                                                      │
│                                                                          │
│   ASSERT findings.severity_counts[Critical] == 1                         │
│   ASSERT findings.severity_counts[High] == 3                             │
│   ASSERT mock.operation_count("DescribeImages") >= 3                     │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ FUNCTION test_replay_mode():                                             │
│   // Record interactions against real ECR                                │
│   recorder = OperationRecorder::new("fixtures/ecr-session.json")         │
│   recording_client = recorder.wrap(real_ecr_client)                      │
│                                                                          │
│   // Perform operations                                                  │
│   repos = list_repositories(recording_client)                            │
│   images = describe_images(recording_client, repos[0].name)              │
│                                                                          │
│   recorder.save()                                                        │
│                                                                          │
│   // Replay without network                                              │
│   replay_client = ReplayClient::load("fixtures/ecr-session.json")        │
│                                                                          │
│   replayed_repos = list_repositories(replay_client)                      │
│   ASSERT replayed_repos == repos                                         │
│                                                                          │
│   replayed_images = describe_images(replay_client, repos[0].name)        │
│   ASSERT replayed_images == images                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Observability Refinements

### 6.1 Metric Dimensions

```
Metric Tagging:
┌─────────────────────────────────────────────────────────────────────────┐
│ Metric                      │ Tags                                      │
│ ────────────────────────────┼──────────────────────────────────────────│
│ ecr.request.count           │ operation, region, status                 │
│ ecr.request.latency_ms      │ operation, region                         │
│ ecr.request.errors          │ operation, region, error_type             │
│ ecr.images.described        │ repository, region                        │
│ ecr.scans.findings          │ repository, severity                      │
│ ecr.cache.hit_rate          │ cache_type, region                        │
│ ecr.token.refresh           │ region, reason                            │
│ ecr.circuit_breaker.state   │ region, state                             │
│ ecr.replication.lag_seconds │ source_region, dest_region                │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Structured Log Format

```
Log Format:
┌─────────────────────────────────────────────────────────────────────────┐
│ {                                                                        │
│   "timestamp": "2025-12-13T10:30:00.000Z",                              │
│   "level": "info",                                                       │
│   "message": "Image described successfully",                             │
│   "module": "ecr.image_service",                                         │
│   "operation": "describe_images",                                        │
│   "repository": "my-app",                                                │
│   "digest_prefix": "sha256:abc123",  // First 12 chars only             │
│   "image_count": 5,                                                      │
│   "region": "us-east-1",                                                 │
│   "duration_ms": 145,                                                    │
│   "trace_id": "abc-123-def",                                             │
│   "span_id": "span-456"                                                  │
│ }                                                                        │
└─────────────────────────────────────────────────────────────────────────┘

Sensitive Data Handling:
- Digests: Log only first 12 characters
- Tags: Log tag names, not full paths
- Tokens: Never log, use "[REDACTED]"
- Manifests: Log media type and size only
- Scan findings: Log counts, not vulnerability details
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-amazon-ecr.md | Complete |
| 2. Pseudocode | pseudocode-amazon-ecr.md | Complete |
| 3. Architecture | architecture-amazon-ecr.md | Complete |
| 4. Refinement | refinement-amazon-ecr.md | Complete |
| 5. Completion | completion-amazon-ecr.md | Pending |

---

*Phase 4: Refinement - Complete*
