# Confluence Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/atlassian/confluence`

---

## 1. Edge Cases and Error Handling

### 1.1 Page Operations

| Edge Case | Detection | Handling |
|-----------|-----------|----------|
| Page title exists in space | 409 + "title" in message | Throw `TitleConflict`, suggest alternative title |
| Page moved during update | 409 + "version" in message | Refetch page, retry with new version |
| Parent page deleted | 404 on parent lookup | Create at space root or throw `PageNotFound` |
| Circular page hierarchy | Detect during move | Throw `InvalidOperation("Circular hierarchy")` |
| Page exceeds body size (1MB) | Check before send | Throw `ContentTooLarge`, suggest splitting |
| HTML injection in title | Validate title | Escape HTML entities before send |
| Empty page title | Validate input | Throw `InvalidInput("Title required")` |
| Title with only whitespace | Trim and validate | Throw `InvalidInput("Title cannot be blank")` |

### 1.2 Version Operations

| Edge Case | Detection | Handling |
|-----------|-----------|----------|
| Version doesn't exist | 404 response | Throw `VersionNotFound` with valid range |
| Version gap (deleted versions) | Missing version in list | Skip to next available version |
| Comparing same version | from == to | Return empty diff |
| Very large diff | Diff size > threshold | Truncate with summary |
| Restore to current version | target == current | No-op, return current page |
| Concurrent version creation | Version number jump | Log warning, proceed normally |

### 1.3 Attachment Operations

| Edge Case | Detection | Handling |
|-----------|-----------|----------|
| File exceeds limit (100MB) | Size check pre-upload | Throw `AttachmentTooLarge` |
| Duplicate filename | 409 response | Throw `AttachmentExists`, suggest rename |
| Zero-byte file | Size == 0 | Reject with `InvalidInput` |
| Unknown media type | Detection fails | Default to `application/octet-stream` |
| Upload timeout on large file | Request timeout | Implement chunked upload fallback |
| Download interrupted | Stream error | Retry with Range header |
| Attachment on deleted page | 404 on page | Throw `PageNotFound` |

### 1.4 Search Operations

| Edge Case | Detection | Handling |
|-----------|-----------|----------|
| Invalid CQL syntax | 400 + "CQL" in error | Throw `InvalidCql` with hint |
| CQL injection attempt | Pattern detection | Escape special characters |
| Empty search results | results.length == 0 | Return empty `SearchResult` |
| Search timeout | 504 or timeout | Retry with smaller limit |
| Results exceed 1000 limit | total_size > 1000 | Warn in response, paginate |
| Reserved CQL keywords in query | Special chars detected | Auto-escape or quote |

### 1.5 Webhook Operations

| Edge Case | Detection | Handling |
|-----------|-----------|----------|
| Invalid signature | HMAC mismatch | Reject with 401, log attempt |
| Duplicate event | Event ID seen before | Dedupe, return 200 OK |
| Event for deleted content | content_id not found | Log warning, acknowledge |
| Malformed payload | JSON parse error | Reject with 400, log |
| Webhook delivery retry | Same event_id | Idempotent handling |
| Clock skew in timestamp | Timestamp > 5min old | Warn but process |

---

## 2. Performance Optimizations

### 2.1 Batching Strategies

```
Batch Operation                 Max Items    Latency Reduction
────────────────────────────────────────────────────────────────
Parallel page fetch             10           ~80% vs sequential
Label operations                50           ~90% vs sequential
Search with multiple CQL        5            ~70% vs sequential
Version comparison (parallel)   2            50% vs sequential
```

### 2.2 Pagination Optimization

```
FUNCTION fetch_all_pages_optimized(client, space_id, options) -> Vec<Page>:
    // Determine optimal page size based on expand
    page_size = IF options.include_body THEN 10 ELSE 100

    // Use cursor-based pagination for consistency
    all_pages = []
    cursor = null

    WHILE true:
        result = CALL list_pages(client, space_id, {
            limit: page_size,
            cursor: cursor,
            expand: options.expand
        })

        all_pages.extend(result.pages)

        IF result.next_cursor IS null:
            BREAK
        cursor = result.next_cursor

        // Back-pressure for large results
        IF all_pages.length > 10000:
            LOG.warn("Large result set, consider using search")

    RETURN all_pages
```

### 2.3 Content Caching Strategy

```
Cache Key Pattern                TTL         Invalidation Trigger
────────────────────────────────────────────────────────────────────
space:{id}:metadata             5 min        Webhook: space_updated
space:{id}:homepage             5 min        Webhook: page_updated
template:list:{scope}           10 min       Manual refresh
label:{name}:pages              2 min        Webhook: label_*
page:{id}:children              2 min        Webhook: page_* (in space)

Never Cached:
- Page body content (version-sensitive)
- Search results (freshness critical)
- Attachment content (size prohibitive)
```

### 2.4 Connection Pooling

```
Pool Configuration:
  max_connections_per_host: 10
  idle_timeout_ms: 60000
  connection_timeout_ms: 5000

Request Distribution:
  - Spread across pool for rate limit compliance
  - Prefer reuse for TLS session resumption
  - Monitor for connection leak
```

---

## 3. Security Hardening

### 3.1 Input Validation

```
FUNCTION validate_page_request(request: CreatePageRequest) -> Result<(), ValidationError>:
    // Title validation
    IF request.title.is_empty():
        RETURN Err(ValidationError("Title is required"))

    IF request.title.length > 255:
        RETURN Err(ValidationError("Title exceeds 255 characters"))

    IF request.title.contains_control_chars():
        RETURN Err(ValidationError("Title contains invalid characters"))

    // Body validation
    IF request.body IS NOT null:
        IF request.body.length > 1_000_000:  // 1MB limit
            RETURN Err(ValidationError("Body exceeds 1MB limit"))

        IF request.body_format == Storage:
            IF NOT is_valid_xhtml(request.body):
                RETURN Err(ValidationError("Invalid storage format"))

    // Space ID validation
    IF NOT is_valid_id_format(request.space_id):
        RETURN Err(ValidationError("Invalid space ID format"))

    RETURN Ok(())
```

### 3.2 CQL Sanitization

```
FUNCTION sanitize_cql(user_input: String) -> String:
    // Escape special CQL characters
    escaped = user_input
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("'", "\\'")

    // Prevent injection of CQL operators
    dangerous_patterns = ["OR", "AND", "NOT", "=", "~", "<", ">"]
    FOR pattern IN dangerous_patterns:
        IF escaped.contains_word(pattern):
            escaped = FORMAT("\"{}\"", escaped)  // Quote entire input
            BREAK

    RETURN escaped
```

### 3.3 Content Security

```
Content Type                 Security Measure
────────────────────────────────────────────────────────────────────
Page body (storage)         Validate XHTML, reject scripts
Page body (ADF)             Validate JSON schema, reject unknown nodes
Attachment upload           Scan for malware (if scanner available)
Attachment download         Stream directly, no server-side parsing
Webhook payload             Validate signature, parse safely
Template variables          XML-escape values before substitution
```

### 3.4 Audit Logging

```
Logged Events (with redaction):
  - Page create/update/delete (page_id, space_id, user_hash)
  - Attachment upload/delete (attachment_id, size, user_hash)
  - Permission check (page_id, result, user_hash)
  - Search query (cql_hash, result_count)
  - Webhook received (event_type, signature_valid)

Not Logged:
  - Page content
  - Attachment content
  - Comment body
  - Search result content
```

---

## 4. Error Recovery Strategies

### 4.1 Version Conflict Resolution

```
FUNCTION update_with_conflict_resolution(
    client: ConfluenceClient,
    request: UpdatePageRequest,
    strategy: ConflictStrategy
) -> Result<Page, ConfluenceError>:
    max_retries = 3
    attempt = 0

    WHILE attempt < max_retries:
        TRY:
            RETURN CALL update_page(client, request)
        CATCH VersionConflict:
            attempt += 1
            IF attempt >= max_retries:
                THROW VersionConflict("Max retries exceeded")

            MATCH strategy:
                CASE Overwrite:
                    // Fetch latest and overwrite
                    current = CALL get_page(client, request.page_id)
                    request.version = current.version.number
                    CONTINUE

                CASE Merge:
                    // Fetch both and merge
                    current = CALL get_page(client, request.page_id)
                    request.body = merge_content(
                        base: request.original_body,
                        current: current.body,
                        new: request.body
                    )
                    request.version = current.version.number
                    CONTINUE

                CASE Fail:
                    THROW

    THROW Unreachable()
```

### 4.2 Rate Limit Handling

```
FUNCTION handle_rate_limit(
    client: ConfluenceClient,
    error: RateLimited
) -> void:
    retry_after = error.retry_after OR 60

    // Log the rate limit event
    shared/observability.emit_counter("confluence.rate_limit.hit", 1)

    // Exponential backoff with jitter
    jitter = random(0, retry_after * 0.1)
    wait_time = retry_after + jitter

    // Cap maximum wait
    wait_time = MIN(wait_time, 300)  // 5 minutes max

    LOG.warn("Rate limited, waiting {} seconds", wait_time)
    SLEEP(wait_time * 1000)
```

### 4.3 Circuit Breaker Recovery

```
FUNCTION with_circuit_breaker(
    client: ConfluenceClient,
    operation: Fn() -> Result<T, Error>
) -> Result<T, Error>:
    IF client.circuit_breaker.is_open():
        // Check if we should try half-open
        IF client.circuit_breaker.should_attempt():
            TRY:
                result = operation()
                client.circuit_breaker.record_success()
                RETURN result
            CATCH:
                client.circuit_breaker.record_failure()
                THROW ServiceUnavailable("Circuit breaker open")
        ELSE:
            THROW ServiceUnavailable("Circuit breaker open")

    TRY:
        result = operation()
        client.circuit_breaker.record_success()
        RETURN result
    CATCH error IF is_transient(error):
        client.circuit_breaker.record_failure()
        THROW error
```

---

## 5. Testing Strategy

### 5.1 Unit Test Coverage

```
Component               Coverage Target   Key Test Cases
────────────────────────────────────────────────────────────────────
StorageFormatParser     95%              Macros, entities, nesting
AtlasDocParser          95%              All node types, marks
CqlBuilder              100%             Injection prevention, escaping
ErrorMapper             100%             All status codes
TypeParsers             95%              Optional fields, defaults

Unit Test Examples:
- parse_storage_with_macro() - Verify macro extraction
- parse_adf_with_nested_marks() - Handle overlapping marks
- build_cql_with_special_chars() - Escape injection
- map_error_409_version() - Correct error type
```

### 5.2 Integration Test Scenarios

```
Scenario                         Dependencies        Assertions
────────────────────────────────────────────────────────────────────
Create and update page          Wiremock            Version increments
Page hierarchy navigation       Wiremock            Parent/child relations
Attachment upload/download      Wiremock + files    Content integrity
Version compare                 Wiremock            Diff accuracy
Search with CQL                 Wiremock            Result parsing
Webhook signature validation    None                Security compliance
Rate limit retry                Wiremock            Backoff timing
Circuit breaker activation      Wiremock            State transitions
```

### 5.3 End-to-End Test Scenarios

```
E2E Scenario                    Prerequisites       Timeout
────────────────────────────────────────────────────────────────────
Full page lifecycle             Live instance       60s
Attachment round-trip           Live instance       120s
Version restore                 Live instance       60s
Template-based creation         Live instance       30s
Search and retrieve             Live instance       30s
Webhook end-to-end             Live + tunnel        120s

Note: E2E tests gated by CONFLUENCE_E2E_ENABLED env var
```

### 5.4 Simulation Test Strategy

```
Mock Scenario                   Purpose
────────────────────────────────────────────────────────────────────
Normal operations               Happy path verification
Version conflicts               Retry logic testing
Rate limiting                   Backoff verification
Service unavailable             Circuit breaker testing
Webhook floods                  Deduplication testing
Large page trees                Pagination testing
Concurrent updates              Race condition testing
```

---

## 6. API Compatibility

### 6.1 Version Handling

```
API Version Strategy:
  Primary: Confluence Cloud REST API v2
  Fallback: v1 for unsupported operations

v2 Operations:
  - All space operations
  - All page CRUD
  - Version management
  - Attachment management
  - Labels
  - Comments
  - Search (via CQL endpoint)

v1 Fallback Required:
  - Content conversion (some formats)
  - Legacy macro handling
  - Some template operations
```

### 6.2 Response Parsing Resilience

```
FUNCTION parse_page_resilient(json: Value) -> Result<Page, ParseError>:
    // Required fields - fail if missing
    id = json.get("id").ok_or(ParseError("Missing id"))?
    title = json.get("title").ok_or(ParseError("Missing title"))?

    // Optional fields - use defaults
    parent_id = json.get("parentId").as_str()
    status = json.get("status").as_str().unwrap_or("current")
    position = json.get("position").as_i32()

    // Nested optional - graceful handling
    body = IF json.contains("body"):
        parse_body(json.get("body"))
    ELSE:
        None

    // Version handling - may be embedded or separate
    version = IF json.contains("version"):
        parse_version(json.get("version"))
    ELSE:
        Version::default()

    // Unknown fields - ignore (forward compatibility)
    RETURN Page { id, title, parent_id, status, position, body, version, ... }
```

---

## 7. Operational Considerations

### 7.1 Health Checks

```
FUNCTION check_health(client: ConfluenceClient) -> HealthStatus:
    checks = []

    // Check API connectivity
    TRY:
        CALL get_spaces(client, { limit: 1 })
        checks.append(HealthCheck("api", Healthy))
    CATCH:
        checks.append(HealthCheck("api", Unhealthy))

    // Check authentication
    TRY:
        token = client.auth_provider.get_access_token()
        checks.append(HealthCheck("auth", Healthy))
    CATCH:
        checks.append(HealthCheck("auth", Unhealthy))

    // Check circuit breaker
    IF client.circuit_breaker.is_open():
        checks.append(HealthCheck("circuit", Degraded))
    ELSE:
        checks.append(HealthCheck("circuit", Healthy))

    RETURN aggregate_health(checks)
```

### 7.2 Graceful Degradation

```
Degradation Levels:
  Level 0: Full functionality
  Level 1: Disable webhooks (async updates only)
  Level 2: Disable writes (read-only mode)
  Level 3: Disable search (cached content only)
  Level 4: Service unavailable

Triggers:
  - Circuit breaker open → Level 2
  - Repeated rate limits → Level 1
  - Auth failure → Level 4
  - API errors > 50% → Level 2
```

### 7.3 Resource Limits

```
Resource                        Limit           Action on Exceed
────────────────────────────────────────────────────────────────────
Concurrent requests             5               Queue additional
Page body size                  1 MB            Reject with error
Attachment size                 100 MB          Reject with error
Search result processing        1000            Truncate with warning
Version history fetch           100             Paginate
Webhook processing queue        1000            Drop oldest, warn
Memory for page cache           100 MB          Evict LRU
```

---

## 8. Monitoring and Alerting

### 8.1 Key Performance Indicators

```
KPI                             Target          Alert Threshold
────────────────────────────────────────────────────────────────────
API success rate                99.5%           < 98%
P50 latency (read ops)          100ms           > 200ms
P99 latency (read ops)          500ms           > 1000ms
P50 latency (write ops)         200ms           > 400ms
P99 latency (write ops)         1000ms          > 2000ms
Rate limit events               < 10/hour       > 50/hour
Circuit breaker opens           0               > 0
Webhook processing lag          < 5s            > 30s
```

### 8.2 Alerting Rules

```
Alert Name                      Condition                   Severity
────────────────────────────────────────────────────────────────────
ConfluenceAPIDown              Success rate < 50% / 5m      Critical
ConfluenceHighLatency          P99 > 2s / 10m               Warning
ConfluenceRateLimited          Rate limits > 100/h          Warning
ConfluenceCircuitOpen          Circuit open > 1m            Critical
ConfluenceAuthFailure          401 errors > 10/m            Critical
ConfluenceWebhookBacklog       Queue > 500 / 5m             Warning
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-confluence.md | Complete |
| 2. Pseudocode | pseudocode-confluence.md | Complete |
| 3. Architecture | architecture-confluence.md | Complete |
| 4. Refinement | refinement-confluence.md | Complete |
| 5. Completion | completion-confluence.md | Pending |

---

*Phase 4: Refinement - Complete*
