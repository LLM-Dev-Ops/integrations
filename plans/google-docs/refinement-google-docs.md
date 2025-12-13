# Google Docs Integration Module - Refinement

**SPARC Phase 4: Refinement**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/google/docs`

---

## 1. Design Review Checklist

### 1.1 API Completeness

| Requirement | Status | Notes |
|-------------|--------|-------|
| Document read (full/partial) | Covered | get_document, get_document_content |
| Structured updates | Covered | batch_update with 20+ request types |
| Revision history | Covered | list_revisions, get_revision, compare |
| Suggestions mode | Covered | list, accept, reject suggestions |
| Comments/replies | Covered | Full CRUD via Drive API |
| Named ranges | Covered | Create, read, update, delete |
| Export formats | Covered | PDF, DOCX, Markdown, plain text |
| Simulation/replay | Covered | MockDocsClient, DocumentReplay |

### 1.2 Thin Adapter Validation

| Concern | Delegation Target | Validated |
|---------|-------------------|-----------|
| OAuth2 token acquisition | google/auth | Yes |
| Service account auth | google/auth | Yes |
| Retry with backoff | shared/resilience | Yes |
| Circuit breaker | shared/resilience | Yes |
| Rate limiting | shared/resilience | Yes |
| Metrics emission | shared/observability | Yes |
| Distributed tracing | shared/observability | Yes |
| Structured logging | shared/observability | Yes |

### 1.3 Security Review

| Security Concern | Mitigation | Validated |
|------------------|------------|-----------|
| Token exposure | SecretString, never logged | Yes |
| Document content in logs | Redacted, document_id only | Yes |
| User email exposure | Hashed in logs | Yes |
| Export file security | Secure temp, auto-cleanup | Yes |
| Service account key | Secure storage, not in repo | Yes |

---

## 2. Edge Case Analysis

### 2.1 Document Service Edge Cases

| Edge Case | Behavior | Implementation |
|-----------|----------|----------------|
| Document deleted during read | 404 | Return `DocumentNotFound`, clear cache |
| Concurrent batch updates | 409 | Return `ConflictingRevision`, retry with fresh state |
| Batch exceeds 100 requests | Validation error | Split into multiple batches automatically |
| Index out of bounds | 400 | Pre-validate indices, return `InvalidRange` |
| Empty document | Valid | Return document with empty body |
| Document > 50MB | API rejection | Pre-check size, return `DocumentTooLarge` |
| Unicode normalization | Pass through | Preserve original Unicode form |
| Suggestions view mode conflict | API handles | Document returned in requested mode |

```
FUNCTION handle_batch_update_error(response: HttpResponse, doc_id: String) -> DocsError:
    MATCH response.status:
        400 =>
            detail = parse_error_detail(response.body)
            IF detail.contains("Invalid range"):
                RETURN DocsError.InvalidRange(detail)
            ELSE IF detail.contains("exceeds maximum"):
                RETURN DocsError.BatchTooLarge(detail)
            ELSE:
                RETURN DocsError.InvalidRequest(detail)

        409 =>
            // Revision conflict - document changed since read
            RETURN DocsError.ConflictingRevision(doc_id, None)

        403 =>
            IF detail.contains("read-only"):
                RETURN DocsError.ReadOnlyDocument(doc_id)
            ELSE:
                RETURN DocsError.AccessDenied(doc_id)

        429 =>
            retry_after = parse_retry_after(response.headers)
            RETURN DocsError.QuotaExceeded(retry_after)

        _ =>
            RETURN map_generic_error(response)
```

### 2.2 Named Range Edge Cases

| Edge Case | Behavior | Implementation |
|-----------|----------|----------------|
| Range spans deleted content | Range adjusted | API auto-adjusts, may become empty |
| Overlapping ranges | Allowed | Multiple ranges can overlap |
| Range name collision | 400 | Pre-check, return `NamedRangeExists` |
| Range in header/footer | Segment ID required | Include segment_id in range |
| Empty range (start == end) | Valid | Returns empty content |
| Range deleted by other user | 404 on update | Return `NamedRangeNotFound` |
| Content inserted in range | Range expands | API handles automatically |

```
FUNCTION update_named_range_safely(doc_id: String, range_name: String, content: String) -> Result<(), DocsError>:
    // Get current document to verify range exists
    document = get_document(doc_id, GetDocumentOptions::default())?

    named_range = document.named_ranges.get(&range_name)
        .ok_or(DocsError.NamedRangeNotFound(range_name.clone()))?

    // Check if range is in a special segment
    segment_id = named_range.ranges[0].segment_id.clone()

    // Build replace request
    request = Request.ReplaceNamedRangeContent(ReplaceNamedRangeContentRequest {
        named_range_name: range_name,
        text: content,
        // Preserve segment context
    })

    // Use write control to detect conflicts
    write_control = WriteControl.RequiredRevisionId(document.revision_id)

    TRY batch_update(doc_id, [request], Some(write_control)):
        Ok(_) => RETURN Ok(())
        Err(DocsError.ConflictingRevision(..)) =>
            // Retry once with fresh state
            RETURN update_named_range_safely(doc_id, range_name, content)
        Err(e) => RETURN Err(e)
```

### 2.3 Revision Service Edge Cases

| Edge Case | Behavior | Implementation |
|-----------|----------|----------------|
| Revision pruned | 404 | Return `RevisionNotFound` |
| No revisions (new doc) | Empty list | Return empty `RevisionList` |
| Too many revisions | Pagination | Use `page_token` for next page |
| Revision export unavailable | 403/404 | Return `ExportNotAvailable` |
| Compare deleted revision | 404 | Handle gracefully, return error |
| Rapid revisions (debounced) | Google merges | Some revisions may be combined |

```
FUNCTION compare_revisions_safely(doc_id: String, from_rev: String, to_rev: String) -> Result<RevisionDiff, DocsError>:
    // Fetch revisions in parallel with error handling
    from_result = get_revision_content(doc_id, from_rev)
    to_result = get_revision_content(doc_id, to_rev)

    from_content = MATCH from_result:
        Ok(content) => content
        Err(DocsError.RevisionNotFound(_)) =>
            RETURN Err(DocsError.RevisionNotFound(from_rev))
        Err(e) => RETURN Err(e)

    to_content = MATCH to_result:
        Ok(content) => content
        Err(DocsError.RevisionNotFound(_)) =>
            RETURN Err(DocsError.RevisionNotFound(to_rev))
        Err(e) => RETURN Err(e)

    // Compute diff
    diff = compute_text_diff(from_content, to_content)

    RETURN Ok(RevisionDiff {
        from_revision: from_rev,
        to_revision: to_rev,
        additions: diff.additions,
        deletions: diff.deletions,
        unchanged_ratio: diff.unchanged_ratio
    })
```

### 2.4 Comment Service Edge Cases

| Edge Case | Behavior | Implementation |
|-----------|----------|----------------|
| Comment on deleted content | Anchor orphaned | Comment remains, anchor invalid |
| Reply to deleted comment | 404 | Return `CommentNotFound` |
| Resolve already resolved | Idempotent | Return success |
| Comment by deleted user | Author info partial | Handle missing email gracefully |
| Very long comment | API limit | Pre-validate length (max 8KB) |
| Nested replies | Flat structure | Drive API returns flat list |

### 2.5 Export Service Edge Cases

| Edge Case | Behavior | Implementation |
|-----------|----------|----------------|
| Export large document | Timeout | Increase timeout, stream response |
| Export with broken images | Images omitted | PDF/DOCX may have placeholders |
| Markdown from complex doc | Best effort | Tables, images converted approximately |
| Export during edit | Point-in-time | Exports current state |
| Protected ranges in export | Included | All content exported |
| Unsupported format | 400 | Return `UnsupportedExportFormat` |

```
FUNCTION export_with_retry(doc_id: String, format: ExportFormat) -> Result<Bytes, DocsError>:
    mime_type = MATCH format:
        PDF => "application/pdf"
        DOCX => "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        HTML => "text/html"
        TXT => "text/plain"
        _ => RETURN Err(DocsError.UnsupportedExportFormat(format))

    url = format!("https://www.googleapis.com/drive/v3/files/{}/export", doc_id)

    // Use longer timeout for exports
    response = http_client.get(url)
        .query([("mimeType", mime_type)])
        .timeout(Duration::from_secs(120))  // 2 min for large docs
        .send()?

    MATCH response.status:
        200 => RETURN Ok(response.bytes()?)
        403 => RETURN Err(DocsError.ExportNotAvailable(doc_id))
        404 => RETURN Err(DocsError.DocumentNotFound(doc_id))
        _ => RETURN Err(map_api_error(response))
```

---

## 3. Performance Optimizations

### 3.1 Request Batching

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                       Automatic Batch Optimization                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Input: 150 requests                                                             │
│                                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐                                       │
│  │  Batch 1        │  │  Batch 2        │                                       │
│  │  100 requests   │  │  50 requests    │                                       │
│  └────────┬────────┘  └────────┬────────┘                                       │
│           │                    │                                                 │
│           ▼                    ▼                                                 │
│      Sequential execution (revision dependency)                                  │
│                                                                                  │
│  Strategy:                                                                       │
│  • Split at 100 request boundary                                                │
│  • Execute sequentially (each batch depends on prior revision)                  │
│  • Collect all replies                                                          │
│  • Return unified response                                                       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

FUNCTION batch_update_large(doc_id: String, requests: Vec<Request>) -> Result<BatchUpdateResponse, DocsError>:
    IF requests.len() <= BATCH_LIMIT:
        RETURN batch_update(doc_id, requests, None)

    all_replies = []
    chunks = requests.chunks(BATCH_LIMIT)

    FOR chunk IN chunks:
        // Get current revision for write control
        doc = get_document(doc_id, GetDocumentOptions::minimal())?
        write_control = WriteControl.RequiredRevisionId(doc.revision_id)

        response = batch_update(doc_id, chunk.to_vec(), Some(write_control))?
        all_replies.extend(response.replies)

    RETURN BatchUpdateResponse {
        document_id: doc_id,
        replies: all_replies,
        write_control: None
    }
```

### 3.2 Document Caching

```
STRUCT DocumentCache:
    cache: LruCache<String, CachedDocument>
    max_entries: usize = 100
    ttl: Duration = 30.seconds

CachedDocument:
    document: Document
    fetched_at: Instant
    revision_id: String

FUNCTION get_document_cached(doc_id: String, options: GetDocumentOptions) -> Result<Document, DocsError>:
    cache_key = format!("{}:{:?}", doc_id, options)

    // Check cache
    IF cached = document_cache.get(&cache_key):
        IF cached.fetched_at.elapsed() < cache.ttl:
            metrics.increment("docs.cache", tags: ["result:hit"])
            RETURN Ok(cached.document.clone())

    // Cache miss - fetch from API
    metrics.increment("docs.cache", tags: ["result:miss"])
    document = fetch_document_from_api(doc_id, options)?

    // Update cache
    document_cache.insert(cache_key, CachedDocument {
        document: document.clone(),
        fetched_at: Instant::now(),
        revision_id: document.revision_id.clone()
    })

    RETURN Ok(document)

FUNCTION invalidate_document_cache(doc_id: String):
    // Remove all cache entries for this document
    keys_to_remove = document_cache.keys()
        .filter(k => k.starts_with(&doc_id))
        .collect()

    FOR key IN keys_to_remove:
        document_cache.remove(&key)
```

### 3.3 Parallel Operations

```
FUNCTION get_documents_parallel(doc_ids: Vec<String>) -> Vec<Result<Document, DocsError>>:
    // Execute up to 10 concurrent requests
    semaphore = Semaphore::new(10)

    futures = doc_ids.iter().map(|doc_id| {
        async {
            permit = semaphore.acquire().await
            result = get_document(doc_id, GetDocumentOptions::default()).await
            drop(permit)
            result
        }
    })

    RETURN join_all(futures).await
```

### 3.4 Content Extraction Optimization

```
FUNCTION extract_text_optimized(document: Document) -> String:
    // Pre-allocate based on estimated size
    estimated_size = estimate_text_size(document.body)
    output = String::with_capacity(estimated_size)

    // Use iterative approach to avoid stack overflow on deep docs
    stack = vec![StackFrame::Body(&document.body)]

    WHILE let Some(frame) = stack.pop():
        MATCH frame:
            StackFrame::Body(body) =>
                FOR element IN body.content.iter().rev():
                    stack.push(StackFrame::Element(element))

            StackFrame::Element(element) =>
                MATCH element:
                    Paragraph(para) =>
                        FOR pe IN para.elements:
                            IF pe IS TextRun(tr):
                                output.push_str(&tr.content)
                        output.push('\n')

                    Table(table) =>
                        FOR row IN table.rows.iter().rev():
                            stack.push(StackFrame::TableRow(row))

                    _ => ()

            StackFrame::TableRow(row) =>
                FOR cell IN row.cells:
                    FOR element IN cell.content:
                        stack.push(StackFrame::Element(element))
                output.push('\t')

    RETURN output
```

---

## 4. Error Recovery Strategies

### 4.1 Revision Conflict Recovery

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    Conflict Resolution Strategy                                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────┐                                                                 │
│  │   Attempt  │                                                                 │
│  │   Update   │                                                                 │
│  └─────┬──────┘                                                                 │
│        │                                                                         │
│        ▼                                                                         │
│  ┌────────────┐     409 Conflict     ┌────────────────────────┐                │
│  │   Result   │ ───────────────────> │   Refresh Document     │                │
│  └─────┬──────┘                      └───────────┬────────────┘                │
│        │                                         │                              │
│        │ Success                                 ▼                              │
│        │                             ┌────────────────────────┐                │
│        ▼                             │  Rebase Changes        │                │
│  ┌────────────┐                      │  (adjust indices)      │                │
│  │  Complete  │                      └───────────┬────────────┘                │
│  └────────────┘                                  │                              │
│                                                  ▼                              │
│                                      ┌────────────────────────┐                │
│                                      │   Retry (max 3)        │                │
│                                      └────────────────────────┘                │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

FUNCTION batch_update_with_conflict_resolution(
    doc_id: String,
    requests: Vec<Request>,
    max_retries: u32 = 3
) -> Result<BatchUpdateResponse, DocsError>:

    FOR attempt IN 0..max_retries:
        // Get fresh document state
        document = get_document(doc_id, GetDocumentOptions::default())?

        // Rebase requests if not first attempt
        rebased_requests = IF attempt > 0:
            rebase_requests(requests, document)?
        ELSE:
            requests.clone()

        write_control = WriteControl.RequiredRevisionId(document.revision_id)

        MATCH batch_update(doc_id, rebased_requests, Some(write_control)):
            Ok(response) => RETURN Ok(response)
            Err(DocsError.ConflictingRevision(..)) =>
                log_info("Revision conflict, retrying", attempt: attempt + 1)
                CONTINUE
            Err(e) => RETURN Err(e)

    RETURN Err(DocsError.ConflictResolutionFailed(doc_id, max_retries))
```

### 4.2 Quota Recovery

```
FUNCTION handle_quota_exceeded(error: DocsError, operation: Operation) -> RecoveryAction:
    MATCH error:
        DocsError.QuotaExceeded(retry_after) =>
            IF retry_after <= MAX_WAIT_SECONDS:
                RETURN RecoveryAction.WaitAndRetry(retry_after)
            ELSE:
                RETURN RecoveryAction.QueueForLater(operation)

        _ => RETURN RecoveryAction.Fail(error)

STRUCT OperationQueue:
    pending: PriorityQueue<QueuedOperation>
    processor: BackgroundTask

FUNCTION queue_operation(operation: Operation, priority: Priority):
    queued = QueuedOperation {
        operation,
        priority,
        queued_at: Instant::now(),
        retry_count: 0
    }

    operation_queue.pending.push(queued)

FUNCTION process_queue():
    LOOP:
        // Wait for rate limit window
        rate_limiter.wait_for_capacity()

        IF queued = operation_queue.pending.pop():
            result = execute_operation(queued.operation)

            IF result.is_err() AND queued.retry_count < MAX_RETRIES:
                queued.retry_count += 1
                operation_queue.pending.push(queued)
```

---

## 5. Security Hardening

### 5.1 Input Validation

```
STRUCT RequestValidator:

FUNCTION validate_batch_request(requests: Vec<Request>) -> Result<(), ValidationError>:
    IF requests.is_empty():
        RETURN Err(ValidationError.EmptyBatch)

    IF requests.len() > BATCH_LIMIT:
        RETURN Err(ValidationError.BatchTooLarge(requests.len()))

    FOR (index, request) IN requests.iter().enumerate():
        validate_single_request(request, index)?

    RETURN Ok(())

FUNCTION validate_single_request(request: Request, index: usize) -> Result<(), ValidationError>:
    MATCH request:
        InsertText(req) =>
            IF req.text.len() > MAX_TEXT_INSERT:
                RETURN Err(ValidationError.TextTooLong(index))
            IF req.location.index < 1:
                RETURN Err(ValidationError.InvalidIndex(index, req.location.index))

        DeleteContentRange(req) =>
            IF req.range.start_index >= req.range.end_index:
                RETURN Err(ValidationError.InvalidRange(index))
            IF req.range.start_index < 1:
                RETURN Err(ValidationError.InvalidIndex(index, req.range.start_index))

        CreateNamedRange(req) =>
            IF NOT is_valid_range_name(&req.name):
                RETURN Err(ValidationError.InvalidRangeName(index, req.name))

        ReplaceAllText(req) =>
            IF req.contains_text.is_empty():
                RETURN Err(ValidationError.EmptySearchText(index))

        _ => ()

    RETURN Ok(())

FUNCTION is_valid_range_name(name: &str) -> bool:
    // Must be 1-256 chars, alphanumeric + underscore
    name.len() >= 1 AND name.len() <= 256
        AND name.chars().all(|c| c.is_alphanumeric() OR c == '_')
```

### 5.2 Content Sanitization for Logging

```
STRUCT LogSanitizer:

FUNCTION sanitize_for_logging(document: &Document) -> SanitizedDocumentLog:
    RETURN SanitizedDocumentLog {
        document_id: document.document_id.clone(),
        title_length: document.title.len(),
        revision_id: document.revision_id.clone(),
        body_element_count: count_elements(&document.body),
        named_range_count: document.named_ranges.len(),
        // Content explicitly excluded
    }

FUNCTION sanitize_comment_for_logging(comment: &Comment) -> SanitizedCommentLog:
    RETURN SanitizedCommentLog {
        comment_id: comment.comment_id.clone(),
        author_hash: hash_email(&comment.author.email),
        content_length: comment.content.len(),
        reply_count: comment.replies.len(),
        resolved: comment.resolved,
        // Actual content excluded
    }

FUNCTION hash_email(email: &Option<String>) -> String:
    MATCH email:
        Some(e) => sha256(e)[..8]  // First 8 chars of hash
        None => "unknown"
```

### 5.3 Export Security

```
STRUCT SecureExporter:
    temp_dir: PathBuf
    cleanup_ttl: Duration = 5.minutes

FUNCTION export_securely(doc_id: String, format: ExportFormat) -> Result<SecureExportHandle, DocsError>:
    // Create secure temp file
    temp_path = create_secure_temp_file(temp_dir, format.extension())?

    // Export to temp file
    content = export_document(doc_id, format)?
    write_securely(temp_path, content)?

    // Schedule cleanup
    cleanup_handle = schedule_cleanup(temp_path.clone(), cleanup_ttl)

    RETURN Ok(SecureExportHandle {
        path: temp_path,
        format,
        cleanup_handle,
        created_at: Instant::now()
    })

FUNCTION create_secure_temp_file(dir: PathBuf, extension: &str) -> Result<PathBuf, IoError>:
    // Use random name
    name = format!("{}.{}", generate_random_id(), extension)
    path = dir.join(name)

    // Create with restricted permissions (0600)
    file = File::create(&path)?
    set_permissions(&path, Permissions::from_mode(0o600))?

    RETURN Ok(path)
```

---

## 6. Testing Strategy

### 6.1 Unit Test Coverage

| Component | Test Focus | Target |
|-----------|------------|--------|
| DocumentService | Read/write operations, error mapping | >95% |
| NamedRangeService | Content extraction, update logic | >95% |
| RevisionService | List, compare, diff computation | >95% |
| CommentService | CRUD operations, Drive API mapping | >90% |
| ExportService | Format conversion, error handling | >90% |
| ContentBuilder | Request generation, fluent API | >95% |
| Validators | All validation rules | >95% |
| Markdown converter | All element types | >90% |

### 6.2 Integration Test Scenarios

```
DESCRIBE "Document Operations":

    TEST "create and update document":
        client = create_mock_client()

        // Create document
        doc = client.create_document("Test Doc", None)?
        ASSERT doc.title == "Test Doc"

        // Insert content
        requests = ContentBuilder::new()
            .insert_text("Hello World", Location::at_start())
            .build()

        response = client.batch_update(doc.document_id, requests, None)?
        ASSERT response.replies.len() == 1

        // Verify content
        updated = client.get_document(doc.document_id)?
        ASSERT extract_text(updated).contains("Hello World")

    TEST "named range workflow":
        client = create_mock_client_with_document(sample_document())

        // Create named range
        range = client.named_ranges().create(
            doc_id,
            "section1",
            Range { start_index: 1, end_index: 50 }
        )?

        // Update content
        client.named_ranges().update_content(doc_id, "section1", "New content")?

        // Verify
        content = client.named_ranges().get_content(doc_id, "section1")?
        ASSERT content.content == "New content"

    TEST "revision comparison":
        client = create_mock_client()

        // Setup document with revisions
        doc_id = setup_document_with_revisions(client, 3)?

        // Compare revisions
        diff = client.revisions().compare(doc_id, "rev1", "rev3")?

        ASSERT diff.additions > 0
        ASSERT diff.from_revision == "rev1"
        ASSERT diff.to_revision == "rev3"
```

### 6.3 Property-Based Tests

```
PROPERTY_TEST "ContentBuilder produces valid requests":
    FORALL operations: Vec<ContentOperation>:
        builder = ContentBuilder::new()
        FOR op IN operations:
            builder = apply_operation(builder, op)

        requests = builder.build()

        // All requests must be valid
        FOR request IN requests:
            ASSERT validate_single_request(request, 0).is_ok()

PROPERTY_TEST "Text extraction is lossless for plain text":
    FORALL text: String (valid UTF-8, no control chars):
        // Create document with text
        doc = create_document_with_text(text)

        // Extract text
        extracted = extract_text(doc)

        // Should contain original text
        ASSERT extracted.contains(&text)

PROPERTY_TEST "Named range indices stay valid after updates":
    FORALL initial_doc: Document, updates: Vec<Request>:
        // Get initial ranges
        initial_ranges = initial_doc.named_ranges.clone()

        // Apply updates
        updated_doc = apply_updates_locally(initial_doc, updates)

        // All named ranges should have valid indices
        FOR (name, range) IN updated_doc.named_ranges:
            FOR r IN range.ranges:
                ASSERT r.start_index >= 1
                ASSERT r.end_index <= get_document_end(updated_doc)
                ASSERT r.start_index <= r.end_index
```

---

## 7. Observability Enhancements

### 7.1 Metrics Catalog

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Metrics Catalog                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Counter: docs.operations                                                        │
│  Labels: operation (get|batch_update|create|export|...), status (success|error) │
│                                                                                  │
│  Counter: docs.requests                                                          │
│  Labels: request_type (insert_text|delete|update_style|...), document_id_hash   │
│                                                                                  │
│  Counter: docs.errors                                                            │
│  Labels: error_type, operation, retryable (true|false)                          │
│                                                                                  │
│  Histogram: docs.latency_ms                                                      │
│  Labels: operation                                                               │
│  Buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000]                       │
│                                                                                  │
│  Histogram: docs.batch_size                                                      │
│  Buckets: [1, 5, 10, 25, 50, 100]                                                │
│                                                                                  │
│  Histogram: docs.document_size_kb                                                │
│  Buckets: [10, 50, 100, 500, 1000, 5000, 10000]                                  │
│                                                                                  │
│  Gauge: docs.cache.size                                                          │
│  Gauge: docs.cache.hit_ratio                                                     │
│                                                                                  │
│  Counter: docs.rate_limit.waits                                                  │
│  Labels: limit_type (read|write)                                                 │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Tracing Spans

```
FUNCTION trace_document_operation<T>(operation: &str, doc_id: &str, f: impl FnOnce() -> Result<T, DocsError>) -> Result<T, DocsError>:
    span = tracer.start_span(format!("docs.{}", operation))
    span.set_attribute("docs.document_id", doc_id)
    span.set_attribute("docs.operation", operation)

    start = Instant::now()

    result = f()

    span.set_attribute("docs.duration_ms", start.elapsed().as_millis())

    MATCH &result:
        Ok(_) =>
            span.set_attribute("docs.status", "success")
        Err(e) =>
            span.set_attribute("docs.status", "error")
            span.set_attribute("docs.error_type", e.error_code())
            span.record_exception(e)

    span.end()
    result
```

---

## 8. Configuration Refinement

### 8.1 Environment Variables

```
┌─────────────────────────────────────┬────────────────────────────────────────────┐
│ Environment Variable                │ Description                                │
├─────────────────────────────────────┼────────────────────────────────────────────┤
│ GOOGLE_DOCS_CREDENTIALS_PATH        │ Path to service account JSON               │
│ GOOGLE_DOCS_SCOPES                  │ OAuth scopes (comma-separated)             │
│ GOOGLE_DOCS_API_BASE_URL            │ API base URL (default: docs.googleapis.com)│
│ GOOGLE_DOCS_MAX_RETRIES             │ Max retry attempts (default: 3)            │
│ GOOGLE_DOCS_REQUEST_TIMEOUT_MS      │ Request timeout (default: 30000)           │
│ GOOGLE_DOCS_BATCH_SIZE_LIMIT        │ Max requests per batch (default: 100)      │
│ GOOGLE_DOCS_CACHE_TTL_SECONDS       │ Document cache TTL (default: 30)           │
│ GOOGLE_DOCS_CACHE_MAX_ENTRIES       │ Max cached documents (default: 100)        │
│ GOOGLE_DOCS_EXPORT_TEMP_DIR         │ Temp directory for exports                 │
│ GOOGLE_DOCS_EXPORT_CLEANUP_SECONDS  │ Export file cleanup TTL (default: 300)     │
│ GOOGLE_DOCS_E2E_TESTS               │ Enable E2E tests (default: false)          │
└─────────────────────────────────────┴────────────────────────────────────────────┘
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-google-docs.md | Complete |
| 2. Pseudocode | pseudocode-google-docs.md | Complete |
| 3. Architecture | architecture-google-docs.md | Complete |
| 4. Refinement | refinement-google-docs.md | Complete |
| 5. Completion | completion-google-docs.md | Pending |

---

*Phase 4: Refinement - Complete*
