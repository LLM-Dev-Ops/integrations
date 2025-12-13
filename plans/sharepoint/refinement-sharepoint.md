# SharePoint Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/microsoft/sharepoint`

---

## 1. Design Review Checklist

### 1.1 API Completeness

| Requirement | Status | Notes |
|-------------|--------|-------|
| Site navigation | Covered | get_site, list_subsites, search_sites |
| Document libraries | Covered | list, get, items, upload, download |
| Lists | Covered | CRUD for lists and items |
| Version history | Covered | list, get, restore, delete |
| Metadata | Covered | content types, columns, properties |
| Search | Covered | Graph Search API integration |
| Webhooks | Covered | subscriptions, notifications |
| Permissions | Covered | read-only access checking |
| Simulation/replay | Covered | MockSharePointClient |

### 1.2 Thin Adapter Validation

| Concern | Delegation Target | Validated |
|---------|-------------------|-----------|
| OAuth2 token acquisition | azure/auth | Yes |
| App-only authentication | azure/auth | Yes |
| Retry with backoff | shared/resilience | Yes |
| Circuit breaker | shared/resilience | Yes |
| Rate limiting | shared/resilience | Yes |
| Metrics emission | shared/observability | Yes |
| Distributed tracing | shared/observability | Yes |

### 1.3 Security Review

| Security Concern | Mitigation | Validated |
|------------------|------------|-----------|
| Token exposure | SecretString, never logged | Yes |
| File content in logs | Never logged | Yes |
| List field values | Redacted in logs | Yes |
| Webhook secrets | Validated, protected | Yes |
| Client secrets/certs | Secure storage | Yes |

---

## 2. Edge Case Analysis

### 2.1 Document Library Edge Cases

| Edge Case | Behavior | Implementation |
|-----------|----------|----------------|
| File locked by user | 423 Locked | Return `ItemLocked`, suggest retry |
| File checked out | 423 Locked | Return `ItemCheckedOut` with user info |
| Upload interrupted | Partial upload | Resume from last chunk, cleanup on fail |
| File > 250GB | API rejection | Pre-validate size, return `FileTooLarge` |
| Path too long (400+ chars) | 400 Error | Pre-validate path length |
| Special characters in name | Encode properly | URL-encode reserved characters |
| Concurrent uploads same file | Conflict | Use conflict behavior header |
| Empty file upload | Valid | Allow 0-byte files |
| Network timeout mid-chunk | Retry chunk | Retry current chunk up to 3 times |

```
FUNCTION handle_upload_error(error: HttpError, upload_state: UploadState) -> UploadRecovery:
    MATCH error.status:
        423 =>
            // Item locked - check if checkout or lock
            lock_info = parse_lock_info(error.body)
            IF lock_info.is_checkout:
                RETURN UploadRecovery.RequiresAction(
                    SharePointError.ItemCheckedOut(lock_info.user)
                )
            ELSE:
                RETURN UploadRecovery.RetryAfter(lock_info.timeout)

        409 =>
            // Conflict - file modified
            MATCH upload_state.conflict_behavior:
                ConflictBehavior.Fail =>
                    RETURN UploadRecovery.Abort(SharePointError.VersionConflict)
                ConflictBehavior.Replace =>
                    // Refresh ETag and retry
                    RETURN UploadRecovery.RefreshAndRetry
                ConflictBehavior.Rename =>
                    // Auto-rename handled by API
                    RETURN UploadRecovery.Abort(SharePointError.UnexpectedConflict)

        507 =>
            RETURN UploadRecovery.Abort(SharePointError.QuotaExceeded)

        _ IF is_retryable(error.status) =>
            IF upload_state.retry_count < MAX_RETRIES:
                RETURN UploadRecovery.RetryChunk(upload_state.current_chunk)
            ELSE:
                RETURN UploadRecovery.Abort(SharePointError.UploadFailed)

        _ =>
            RETURN UploadRecovery.Abort(map_api_error(error))
```

### 2.2 List Service Edge Cases

| Edge Case | Behavior | Implementation |
|-----------|----------|----------------|
| List threshold exceeded | 5000+ items query | Use indexed column filter |
| Missing required field | 400 Error | Pre-validate, return `FieldValidation` |
| Lookup to deleted item | Broken lookup | Handle gracefully, return null |
| Multi-value field limit | 100 values max | Pre-validate array length |
| Formula field update | 400 Error | Detect calculated fields, skip |
| Content type mismatch | 400 Error | Validate content type before create |
| Concurrent item update | 409 Conflict | Use ETag for optimistic concurrency |
| Unicode in field values | Pass through | Ensure UTF-8 encoding |

```
FUNCTION validate_list_item_fields(list_id: String, fields: Map<String, FieldValue>) -> Result<(), ValidationError>:
    // Get list schema (cached)
    schema = get_list_fields_cached(list_id)?

    FOR (field_name, value) IN fields:
        field_def = schema.get(field_name)
            .ok_or(ValidationError.UnknownField(field_name))?

        // Check read-only
        IF field_def.read_only:
            RETURN Err(ValidationError.ReadOnlyField(field_name))

        // Check required
        IF field_def.required AND value IS FieldValue.Null:
            RETURN Err(ValidationError.RequiredField(field_name))

        // Type-specific validation
        MATCH (field_def.field_type, value):
            (FieldType.Text, FieldValue.Text(s)) =>
                IF s.len() > field_def.max_length.unwrap_or(255):
                    RETURN Err(ValidationError.TextTooLong(field_name))

            (FieldType.Number, FieldValue.Number(n)) =>
                IF field_def.min IS Some(min) AND n < min:
                    RETURN Err(ValidationError.NumberOutOfRange(field_name))
                IF field_def.max IS Some(max) AND n > max:
                    RETURN Err(ValidationError.NumberOutOfRange(field_name))

            (FieldType.Choice, FieldValue.Text(s)) =>
                IF NOT field_def.choices.contains(s):
                    RETURN Err(ValidationError.InvalidChoice(field_name, s))

            (FieldType.MultiChoice, FieldValue.MultiChoice(arr)) =>
                IF arr.len() > 100:
                    RETURN Err(ValidationError.TooManyValues(field_name))
                FOR choice IN arr:
                    IF NOT field_def.choices.contains(choice):
                        RETURN Err(ValidationError.InvalidChoice(field_name, choice))

            (FieldType.Calculated, _) =>
                RETURN Err(ValidationError.CalculatedFieldNotWritable(field_name))

            _ => ()

    RETURN Ok(())
```

### 2.3 Version Service Edge Cases

| Edge Case | Behavior | Implementation |
|-----------|----------|----------------|
| Versioning disabled | No versions | Return empty list or single current |
| Major versions only | No minor versions | Filter by version label format |
| Version limit reached | Oldest pruned | Oldest versions auto-deleted |
| Restore locked file | 423 Error | Check lock before restore |
| Delete current version | 400 Error | Prevent, return `CannotDeleteCurrent` |
| Version during checkout | Checkout version | Include checkout info |

### 2.4 Search Service Edge Cases

| Edge Case | Behavior | Implementation |
|-----------|----------|----------------|
| Query syntax error | 400 Error | Validate KQL before send |
| No results | Empty response | Return empty SearchResult |
| Throttled search | 429 Error | Retry with backoff |
| Deleted items in results | Stale index | Filter/handle gracefully |
| Large result set | Pagination | Use skip/top, max 500 per page |
| Permission-trimmed results | Filtered | Results respect permissions |

```
FUNCTION search_with_pagination(query: SearchQuery) -> Result<SearchResultIterator, SharePointError>:
    RETURN SearchResultIterator {
        query: query.clone(),
        current_page: 0,
        page_size: min(query.row_limit, 500),
        total_rows: None,
        exhausted: false
    }

IMPLEMENT Iterator FOR SearchResultIterator:
    FUNCTION next() -> Option<Result<SearchResult, SharePointError>>:
        IF self.exhausted:
            RETURN None

        // Check if we've fetched enough
        IF self.total_rows IS Some(total):
            fetched = self.current_page * self.page_size
            IF fetched >= total OR fetched >= self.query.row_limit:
                self.exhausted = true
                RETURN None

        // Fetch next page
        paged_query = self.query.clone()
        paged_query.start_row = self.current_page * self.page_size
        paged_query.row_limit = self.page_size

        result = search(paged_query)

        MATCH result:
            Ok(page) =>
                self.total_rows = Some(page.total_rows)
                self.current_page += 1

                IF page.rows.is_empty():
                    self.exhausted = true

                RETURN Some(Ok(page))

            Err(e) =>
                self.exhausted = true
                RETURN Some(Err(e))
```

### 2.5 Webhook Edge Cases

| Edge Case | Behavior | Implementation |
|-----------|----------|----------------|
| Subscription expired | 410 Gone on notification | Recreate subscription |
| Validation request | Echo validation token | Handle challenge response |
| Duplicate notification | Idempotent handling | Dedupe by resource + timestamp |
| Out-of-order notifications | Timestamp ordering | Queue and process in order |
| Notification timeout | Retry by Graph | Process within 30s |
| Invalid client state | Reject notification | Log and discard |

```
FUNCTION handle_webhook_request(request: HttpRequest) -> HttpResponse:
    // Check for validation challenge
    IF request.query.contains("validationToken"):
        token = request.query.get("validationToken")
        RETURN HttpResponse::ok()
            .content_type("text/plain")
            .body(token)

    // Parse notification
    notification = TRY parse_notification(request.body):
        Ok(n) => n
        Err(e) =>
            log_warning("Failed to parse webhook notification", error: e)
            RETURN HttpResponse::bad_request()

    // Validate client state
    IF config.webhook_secret IS Some(secret):
        IF notification.client_state != Some(secret.expose_secret()):
            log_warning("Invalid webhook client state")
            RETURN HttpResponse::unauthorized()

    // Check for duplicate (idempotency)
    notification_key = format!("{}:{}", notification.subscription_id, notification.sequence_number)
    IF processed_notifications.contains(notification_key):
        log_debug("Duplicate notification ignored", key: notification_key)
        RETURN HttpResponse::ok()

    // Process asynchronously to meet 30s deadline
    spawn_async(process_notification(notification))

    // Mark as processed
    processed_notifications.insert(notification_key, Instant::now())

    RETURN HttpResponse::accepted()
```

---

## 3. Performance Optimizations

### 3.1 Batch Operations

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       Batch Request Strategy                                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Graph API supports JSON batching up to 20 requests                             │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │  Use Cases for Batching:                                                 │   │
│  │                                                                          │   │
│  │  • Fetch multiple list items by ID                                      │   │
│  │  • Update multiple item metadata                                         │   │
│  │  • Get permissions for multiple items                                    │   │
│  │  • Resolve multiple site URLs                                            │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

FUNCTION batch_get_items(site_id: String, library_id: String, item_ids: Vec<String>) -> Vec<Result<DriveItem, SharePointError>>:
    CONST BATCH_SIZE = 20

    results = vec![None; item_ids.len()]

    FOR chunk IN item_ids.chunks(BATCH_SIZE):
        batch_request = BatchRequest {
            requests: chunk.enumerate().map(|(i, id)| {
                BatchRequestItem {
                    id: i.to_string(),
                    method: "GET",
                    url: format!("/sites/{}/drives/{}/items/{}", site_id, library_id, id)
                }
            }).collect()
        }

        response = http_client.post("https://graph.microsoft.com/v1.0/$batch")
            .header("Authorization", format!("Bearer {}", get_token()?))
            .json(batch_request)
            .send()?

        FOR item_response IN response.responses:
            original_index = parse_int(item_response.id)
            global_index = chunk_start + original_index

            results[global_index] = IF item_response.status == 200:
                Some(Ok(parse_drive_item(item_response.body)))
            ELSE:
                Some(Err(map_batch_error(item_response)))

    RETURN results.into_iter().flatten().collect()
```

### 3.2 Delta Queries for Change Tracking

```
STRUCT DeltaTracker:
    site_id: String
    library_id: String
    delta_link: Option<String>

FUNCTION get_changes_since_last_sync(tracker: &mut DeltaTracker) -> Result<ChangeSet, SharePointError>:
    url = IF tracker.delta_link IS Some(link):
        link.clone()
    ELSE:
        format!(
            "https://graph.microsoft.com/v1.0/sites/{}/drives/{}/root/delta",
            tracker.site_id, tracker.library_id
        )

    changes = vec![]

    LOOP:
        response = http_client.get(&url)
            .header("Authorization", format!("Bearer {}", get_token()?))
            .send()?

        page = parse_delta_response(response.body)?

        changes.extend(page.value)

        IF page.next_link IS Some(next):
            url = next
        ELSE:
            // Store delta link for next sync
            tracker.delta_link = page.delta_link
            BREAK

    RETURN Ok(ChangeSet {
        changes,
        delta_token: tracker.delta_link.clone()
    })
```

### 3.3 Streaming Downloads

```
FUNCTION download_file_streaming(site_id: String, library_id: String, item_id: String, writer: impl Write) -> Result<u64, SharePointError>:
    // Get download URL
    item = get_item(site_id, library_id, item_id)?
    download_url = item.download_url
        .ok_or(SharePointError.DownloadNotAvailable)?

    // Stream download
    response = http_client.get(download_url)
        .send_streaming()?

    total_bytes = 0

    WHILE let Some(chunk) = response.next_chunk().await:
        chunk_data = chunk?
        writer.write_all(&chunk_data)?
        total_bytes += chunk_data.len()

        // Optional: report progress
        metrics.histogram("sharepoint.download_chunk_size", chunk_data.len())

    metrics.histogram("sharepoint.download_total_size", total_bytes)

    RETURN Ok(total_bytes as u64)
```

### 3.4 Connection Pooling

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       Connection Pool Configuration                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Pool per tenant:                                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │  Max connections: 100                                                   │    │
│  │  Idle timeout: 90 seconds                                               │    │
│  │  Connection timeout: 10 seconds                                         │    │
│  │  HTTP/2 multiplexing: enabled                                           │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Benefits:                                                                       │
│  • Reuse TCP connections across requests                                        │
│  • Reduce TLS handshake overhead                                                │
│  • HTTP/2 allows multiple concurrent requests per connection                    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Error Recovery Strategies

### 4.1 Upload Session Recovery

```
STRUCT UploadSession:
    upload_url: String
    expiration: DateTime
    next_expected_ranges: Vec<Range>
    file_path: String
    total_size: u64

FUNCTION resume_upload(session: UploadSession, content: Bytes) -> Result<DriveItem, SharePointError>:
    // Check if session expired
    IF session.expiration < now():
        RETURN Err(SharePointError.UploadSessionExpired)

    // Get current upload status
    status_response = http_client.get(&session.upload_url).send()?

    IF status_response.status == 404:
        RETURN Err(SharePointError.UploadSessionExpired)

    status = parse_upload_status(status_response.body)?

    // Find where to resume
    next_range = status.next_expected_ranges.first()
        .ok_or(SharePointError.UploadComplete)?

    start_byte = next_range.start

    // Upload remaining chunks
    WHILE start_byte < session.total_size:
        end_byte = min(start_byte + CHUNK_SIZE, session.total_size)
        chunk = content[start_byte..end_byte]

        content_range = format!("bytes {}-{}/{}", start_byte, end_byte - 1, session.total_size)

        response = http_client.put(&session.upload_url)
            .header("Content-Length", chunk.len().to_string())
            .header("Content-Range", content_range)
            .body(chunk)
            .send()?

        MATCH response.status:
            202 =>
                start_byte = end_byte
                CONTINUE

            200, 201 =>
                RETURN Ok(parse_drive_item(response.body)?)

            _ =>
                RETURN Err(map_api_error(response))

    RETURN Err(SharePointError.UploadIncomplete)
```

### 4.2 Rate Limit Recovery

```
FUNCTION execute_with_throttle_handling<T>(operation: impl Fn() -> Result<T, SharePointError>) -> Result<T, SharePointError>:
    backoff = ExponentialBackoff::new(
        initial: 1.second,
        max: 120.seconds,
        multiplier: 2.0
    )

    FOR attempt IN 0..MAX_THROTTLE_RETRIES:
        result = operation()

        MATCH result:
            Ok(value) => RETURN Ok(value)

            Err(SharePointError.RateLimited(retry_after)) =>
                // Use server-provided retry time
                wait_time = Duration::from_secs(retry_after)
                log_info("Rate limited, waiting", seconds: retry_after, attempt: attempt)
                sleep(wait_time)

            Err(e) IF is_retryable(&e) =>
                // Use exponential backoff
                wait_time = backoff.next_delay()
                log_info("Retryable error, backing off", wait_ms: wait_time.as_millis(), attempt: attempt)
                sleep(wait_time)

            Err(e) => RETURN Err(e)

    RETURN Err(SharePointError.MaxRetriesExceeded)
```

---

## 5. Security Hardening

### 5.1 Input Validation

```
STRUCT InputValidator:

FUNCTION validate_site_url(url: String) -> Result<ValidatedUrl, ValidationError>:
    parsed = parse_url(&url)?

    // Must be SharePoint Online domain
    IF NOT parsed.host.ends_with(".sharepoint.com"):
        RETURN Err(ValidationError.InvalidSharePointUrl(url))

    // Must be HTTPS
    IF parsed.scheme != "https":
        RETURN Err(ValidationError.InsecureUrl(url))

    // No query params or fragments (could be injection)
    IF parsed.query.is_some() OR parsed.fragment.is_some():
        RETURN Err(ValidationError.UrlContainsQueryOrFragment(url))

    RETURN Ok(ValidatedUrl(url))

FUNCTION validate_file_path(path: String) -> Result<ValidatedPath, ValidationError>:
    // Check length
    IF path.len() > 400:
        RETURN Err(ValidationError.PathTooLong(path.len()))

    // Check for directory traversal
    IF path.contains("..") OR path.contains("./"):
        RETURN Err(ValidationError.DirectoryTraversal)

    // Check for invalid characters
    invalid_chars = ['*', '?', '"', '<', '>', '|', '#', '%']
    FOR char IN invalid_chars:
        IF path.contains(char):
            RETURN Err(ValidationError.InvalidCharacter(char))

    // Check for reserved names (Windows)
    reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "LPT1"]
    filename = extract_filename(&path).to_uppercase()
    IF reserved.contains(&filename):
        RETURN Err(ValidationError.ReservedFilename(filename))

    RETURN Ok(ValidatedPath(path))

FUNCTION validate_odata_filter(filter: String) -> Result<ValidatedFilter, ValidationError>:
    // Prevent injection by checking for dangerous patterns
    dangerous_patterns = [
        "/*",           // Comment injection
        "--",           // SQL-style comment
        ";",            // Statement terminator
        "UNION",        // SQL injection
        "DELETE",       // Data modification
        "UPDATE",       // Data modification
    ]

    filter_upper = filter.to_uppercase()
    FOR pattern IN dangerous_patterns:
        IF filter_upper.contains(pattern):
            RETURN Err(ValidationError.PotentialInjection(pattern))

    RETURN Ok(ValidatedFilter(filter))
```

### 5.2 Webhook Security

```
FUNCTION validate_webhook_notification(request: HttpRequest, config: WebhookConfig) -> Result<WebhookNotification, SecurityError>:
    // Validate content type
    IF request.content_type != "application/json":
        RETURN Err(SecurityError.InvalidContentType)

    // Validate request size
    IF request.content_length > MAX_NOTIFICATION_SIZE:
        RETURN Err(SecurityError.PayloadTooLarge)

    // Parse notification
    notification = parse_json::<WebhookNotification>(request.body)?

    // Validate client state (shared secret)
    IF config.webhook_secret IS Some(secret):
        expected = secret.expose_secret()
        actual = notification.client_state.as_deref().unwrap_or("")

        // Constant-time comparison
        IF NOT constant_time_compare(expected, actual):
            RETURN Err(SecurityError.InvalidClientState)

    // Validate subscription ID format (GUID)
    IF NOT is_valid_guid(&notification.subscription_id):
        RETURN Err(SecurityError.InvalidSubscriptionId)

    // Validate resource URL
    IF NOT notification.resource.starts_with("/sites/"):
        RETURN Err(SecurityError.InvalidResource)

    RETURN Ok(notification)
```

### 5.3 Content Type Validation

```
FUNCTION validate_upload_content(filename: String, content: &[u8], options: UploadOptions) -> Result<(), SecurityError>:
    // Check file extension
    extension = extract_extension(&filename).to_lowercase()

    IF options.blocked_extensions.contains(&extension):
        RETURN Err(SecurityError.BlockedFileType(extension))

    // Magic byte validation (optional)
    IF options.validate_magic_bytes:
        detected_type = detect_content_type(content)

        expected_types = get_expected_types(&extension)
        IF NOT expected_types.contains(&detected_type):
            RETURN Err(SecurityError.ContentTypeMismatch {
                expected: expected_types,
                detected: detected_type
            })

    // Size validation
    IF content.len() > options.max_file_size:
        RETURN Err(SecurityError.FileTooLarge(content.len()))

    RETURN Ok(())
```

---

## 6. Testing Strategy

### 6.1 Unit Test Coverage

| Component | Test Focus | Target |
|-----------|------------|--------|
| SiteService | URL resolution, subsite listing | >95% |
| DocumentLibraryService | Upload/download, path handling | >95% |
| ListService | CRUD, field validation | >95% |
| VersionService | Version operations | >90% |
| SearchService | Query building, pagination | >90% |
| WebhookService | Subscription, notification | >95% |
| QueryBuilder | OData generation | >95% |
| UploadManager | Chunking, resume | >95% |

### 6.2 Integration Test Scenarios

```
DESCRIBE "Document Library Integration":

    TEST "upload and download roundtrip":
        client = create_mock_client()
        content = random_bytes(5_000_000)  // 5MB

        // Upload
        item = client.libraries()
            .upload(site_id, library_id, "/test/file.bin", content)
            .await?

        ASSERT item.size == content.len()

        // Download
        downloaded = client.libraries()
            .download(site_id, library_id, item.id)
            .await?

        ASSERT downloaded == content

    TEST "chunked upload with interruption recovery":
        client = create_mock_client()
        content = random_bytes(50_000_000)  // 50MB

        // Start upload, simulate failure at chunk 3
        mock.expect_chunk(0).succeed()
        mock.expect_chunk(1).succeed()
        mock.expect_chunk(2).fail_with(503)
        mock.expect_chunk(2).succeed()  // Retry
        mock.expect_remaining_chunks().succeed()

        item = client.libraries()
            .upload(site_id, library_id, "/test/large.bin", content)
            .await?

        ASSERT item.size == content.len()

    TEST "list item CRUD with validation":
        client = create_mock_client()

        // Create with invalid field
        result = client.lists()
            .create_item(site_id, list_id, {
                "InvalidField": "value"
            })
            .await

        ASSERT result.is_err()
        ASSERT matches!(result.err(), SharePointError.FieldValidation(_))

        // Create with valid fields
        item = client.lists()
            .create_item(site_id, list_id, {
                "Title": "Test Item",
                "Status": "Active"
            })
            .await?

        ASSERT item.fields.get("Title") == Some("Test Item")

DESCRIBE "Webhook Integration":

    TEST "handle validation challenge":
        service = WebhookService::new(config)

        request = HttpRequest::get("/?validationToken=abc123")
        response = service.handle_request(request).await

        ASSERT response.status == 200
        ASSERT response.body == "abc123"

    TEST "reject invalid client state":
        service = WebhookService::new(config_with_secret("correct-secret"))

        notification = create_notification(client_state: "wrong-secret")
        request = HttpRequest::post("/").json(notification)

        response = service.handle_request(request).await

        ASSERT response.status == 401
```

### 6.3 Property-Based Tests

```
PROPERTY_TEST "OData filter escaping prevents injection":
    FORALL filter: String:
        escaped = sanitize_odata_filter(filter)

        // Should not contain unescaped quotes
        ASSERT NOT escaped.contains("'") OR escaped.contains("''")

        // Should be valid OData syntax
        ASSERT is_valid_odata(escaped)

PROPERTY_TEST "File path validation rejects traversal":
    FORALL path: String:
        IF path.contains("..") OR path.contains("./"):
            ASSERT validate_file_path(path).is_err()

PROPERTY_TEST "Upload chunk boundaries are correct":
    FORALL file_size: u64 (range: 1..500_000_000):
        chunks = calculate_chunks(file_size, CHUNK_SIZE)

        // All bytes covered
        total_bytes = chunks.iter().map(|c| c.end - c.start).sum()
        ASSERT total_bytes == file_size

        // No gaps or overlaps
        FOR i IN 0..chunks.len()-1:
            ASSERT chunks[i].end == chunks[i+1].start

        // Last chunk ends at file size
        ASSERT chunks.last().end == file_size
```

---

## 7. Observability Enhancements

### 7.1 Metrics Catalog

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Metrics Catalog                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Counter: sharepoint.operations                                                  │
│  Labels: operation, site_id_hash, status (success|error)                        │
│                                                                                  │
│  Counter: sharepoint.uploads                                                     │
│  Labels: size_class (small|large), status, site_id_hash                         │
│                                                                                  │
│  Counter: sharepoint.downloads                                                   │
│  Labels: status, site_id_hash                                                   │
│                                                                                  │
│  Histogram: sharepoint.latency_ms                                                │
│  Labels: operation                                                               │
│  Buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000]                       │
│                                                                                  │
│  Histogram: sharepoint.upload_size_bytes                                         │
│  Buckets: [1KB, 100KB, 1MB, 10MB, 100MB, 1GB]                                    │
│                                                                                  │
│  Histogram: sharepoint.download_size_bytes                                       │
│  Buckets: [1KB, 100KB, 1MB, 10MB, 100MB, 1GB]                                    │
│                                                                                  │
│  Gauge: sharepoint.circuit_breaker.state                                         │
│  Labels: site_id_hash                                                            │
│  Values: 0=closed, 1=half-open, 2=open                                          │
│                                                                                  │
│  Counter: sharepoint.webhooks                                                    │
│  Labels: action (create|process|renew), status                                  │
│                                                                                  │
│  Counter: sharepoint.cache                                                       │
│  Labels: cache_type, result (hit|miss)                                          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Structured Logging

```
FUNCTION log_operation(operation: &str, site_id: &str, result: &Result<T, E>, duration: Duration):
    log_info({
        "event": format!("sharepoint.{}", operation),
        "site_id_hash": hash(site_id)[..8],  // Privacy: only log hash
        "status": IF result.is_ok() { "success" } ELSE { "error" },
        "error_code": result.err().map(|e| e.error_code()),
        "duration_ms": duration.as_millis(),
        // Never log: file content, field values, tokens
    })

FUNCTION log_upload(site_id: &str, path: &str, size: u64, result: &Result<DriveItem, E>):
    log_info({
        "event": "sharepoint.upload",
        "site_id_hash": hash(site_id)[..8],
        "path_hash": hash(path)[..8],  // Privacy: only log hash
        "size_bytes": size,
        "size_class": classify_size(size),
        "status": IF result.is_ok() { "success" } ELSE { "error" },
        "item_id": result.ok().map(|i| i.id),
    })
```

---

## 8. Configuration Refinement

### 8.1 Environment Variables

```
┌─────────────────────────────────────┬────────────────────────────────────────────┐
│ Environment Variable                │ Description                                │
├─────────────────────────────────────┼────────────────────────────────────────────┤
│ SHAREPOINT_TENANT_ID                │ Azure AD tenant ID                         │
│ SHAREPOINT_CLIENT_ID                │ App registration client ID                 │
│ SHAREPOINT_CLIENT_SECRET            │ Client secret (or use cert)                │
│ SHAREPOINT_CERTIFICATE_PATH         │ Path to certificate (.pfx)                 │
│ SHAREPOINT_CERTIFICATE_PASSWORD     │ Certificate password                       │
│ SHAREPOINT_DEFAULT_SITE_URL         │ Default site URL                           │
│ SHAREPOINT_USE_GRAPH_API            │ Use Graph API (default: true)              │
│ SHAREPOINT_MAX_RETRIES              │ Max retry attempts (default: 3)            │
│ SHAREPOINT_REQUEST_TIMEOUT_MS       │ Request timeout (default: 30000)           │
│ SHAREPOINT_CHUNK_SIZE_BYTES         │ Upload chunk size (default: 10MB)          │
│ SHAREPOINT_LARGE_FILE_THRESHOLD     │ Chunked upload threshold (default: 4MB)    │
│ SHAREPOINT_WEBHOOK_ENDPOINT         │ Webhook callback URL                       │
│ SHAREPOINT_WEBHOOK_SECRET           │ Webhook client state secret                │
│ SHAREPOINT_CACHE_TTL_SECONDS        │ Cache TTL (default: 300)                   │
│ SHAREPOINT_E2E_TESTS                │ Enable E2E tests (default: false)          │
└─────────────────────────────────────┴────────────────────────────────────────────┘
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-sharepoint.md | Complete |
| 2. Pseudocode | pseudocode-sharepoint.md | Complete |
| 3. Architecture | architecture-sharepoint.md | Complete |
| 4. Refinement | refinement-sharepoint.md | Complete |
| 5. Completion | completion-sharepoint.md | Pending |

---

*Phase 4: Refinement - Complete*
