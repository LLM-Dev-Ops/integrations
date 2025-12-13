# Confluence Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/atlassian/confluence`

---

## 1. Client Initialization

```
FUNCTION create_confluence_client(config: ConfluenceConfig) -> ConfluenceClient:
    // Validate configuration
    VALIDATE config.cloud_id IS NOT empty
    VALIDATE config.auth IS valid

    // Build base URL
    base_url = config.base_url OR
               FORMAT("https://api.atlassian.com/ex/confluence/{}", config.cloud_id)

    // Initialize HTTP client with resilience
    http_client = shared/resilience.create_http_client(
        base_url: base_url,
        timeout_ms: config.request_timeout_ms,
        retry_policy: RetryPolicy(
            max_attempts: config.max_retries,
            retryable_status: [429, 500, 502, 503, 504]
        )
    )

    // Initialize rate limiter
    rate_limiter = shared/resilience.create_rate_limiter(
        requests_per_second: config.requests_per_second
    )

    // Initialize circuit breaker
    circuit_breaker = shared/resilience.create_circuit_breaker(
        failure_threshold: 5,
        reset_timeout_ms: 30000
    )

    // Initialize auth provider
    auth_provider = atlassian/auth.create_provider(config.auth)

    RETURN ConfluenceClient(
        http_client: http_client,
        rate_limiter: rate_limiter,
        circuit_breaker: circuit_breaker,
        auth_provider: auth_provider,
        config: config
    )
```

---

## 2. Space Operations

### 2.1 List Spaces

```
FUNCTION list_spaces(client: ConfluenceClient, options: ListSpacesOptions) -> SpaceList:
    // Build query parameters
    params = QueryParams()
    params.add_optional("keys", options.keys)
    params.add_optional("type", options.space_type)
    params.add_optional("status", options.status)
    params.add_optional("limit", options.limit OR 25)
    params.add_optional("cursor", options.cursor)

    // Execute request
    response = CALL execute_request(client, "GET", "/wiki/api/v2/spaces", params)

    // Parse response
    spaces = []
    FOR result IN response.results:
        spaces.APPEND(parse_space(result))

    RETURN SpaceList(
        spaces: spaces,
        next_cursor: response._links.next
    )
```

### 2.2 Get Space

```
FUNCTION get_space(client: ConfluenceClient, space_id: String) -> Space:
    response = CALL execute_request(
        client,
        "GET",
        FORMAT("/wiki/api/v2/spaces/{}", space_id),
        QueryParams()
    )

    RETURN parse_space(response)
```

### 2.3 Get Space by Key

```
FUNCTION get_space_by_key(client: ConfluenceClient, space_key: String) -> Space:
    // Use filter to find by key
    params = QueryParams()
    params.add("keys", space_key)
    params.add("limit", 1)

    response = CALL execute_request(client, "GET", "/wiki/api/v2/spaces", params)

    IF response.results IS empty:
        THROW SpaceNotFound(space_key)

    RETURN parse_space(response.results[0])
```

---

## 3. Page Operations

### 3.1 Get Page

```
FUNCTION get_page(client: ConfluenceClient, page_id: String, options: GetPageOptions) -> Page:
    // Build expand parameter
    expand = options.expand OR client.config.expand_by_default

    params = QueryParams()
    params.add("body-format", options.body_format OR client.config.default_body_format)

    response = CALL execute_request(
        client,
        "GET",
        FORMAT("/wiki/api/v2/pages/{}", page_id),
        params
    )

    RETURN parse_page(response)
```

### 3.2 Get Page by Title

```
FUNCTION get_page_by_title(
    client: ConfluenceClient,
    space_id: String,
    title: String
) -> Page:
    params = QueryParams()
    params.add("space-id", space_id)
    params.add("title", title)
    params.add("limit", 1)
    params.add("body-format", client.config.default_body_format)

    response = CALL execute_request(client, "GET", "/wiki/api/v2/pages", params)

    IF response.results IS empty:
        THROW PageNotFound(FORMAT("title={} in space={}", title, space_id))

    RETURN parse_page(response.results[0])
```

### 3.3 Create Page

```
FUNCTION create_page(client: ConfluenceClient, request: CreatePageRequest) -> Page:
    // Validate request
    VALIDATE request.space_id IS NOT empty
    VALIDATE request.title IS NOT empty
    VALIDATE request.title.length <= 255

    // Build request body
    body = {
        "spaceId": request.space_id,
        "title": request.title,
        "status": request.status OR "current",
        "body": format_body(request.body, request.body_format)
    }

    IF request.parent_id IS NOT null:
        body["parentId"] = request.parent_id

    // Execute request
    response = CALL execute_request(
        client,
        "POST",
        "/wiki/api/v2/pages",
        QueryParams(),
        body
    )

    page = parse_page(response)

    // Emit metrics
    shared/observability.emit_counter("confluence.pages.created", 1, {
        space_id: request.space_id
    })

    RETURN page
```

### 3.4 Update Page

```
FUNCTION update_page(client: ConfluenceClient, request: UpdatePageRequest) -> Page:
    // Fetch current version if not provided
    IF request.version IS null:
        current = CALL get_page(client, request.page_id, GetPageOptions())
        request.version = current.version.number

    // Build request body
    body = {
        "id": request.page_id,
        "status": request.status OR "current",
        "version": {
            "number": request.version + 1,
            "message": request.version_message
        }
    }

    IF request.title IS NOT null:
        body["title"] = request.title

    IF request.body IS NOT null:
        body["body"] = format_body(request.body, request.body_format)

    // Execute request with version conflict handling
    TRY:
        response = CALL execute_request(
            client,
            "PUT",
            FORMAT("/wiki/api/v2/pages/{}", request.page_id),
            QueryParams(),
            body
        )
        RETURN parse_page(response)
    CATCH VersionConflict:
        IF request.auto_retry_on_conflict:
            // Retry with fresh version
            current = CALL get_page(client, request.page_id, GetPageOptions())
            request.version = current.version.number
            RETURN CALL update_page(client, request)
        ELSE:
            THROW
```

### 3.5 Delete Page

```
FUNCTION delete_page(client: ConfluenceClient, page_id: String, purge: bool) -> void:
    IF purge:
        // Permanently delete
        CALL execute_request(
            client,
            "DELETE",
            FORMAT("/wiki/api/v2/pages/{}", page_id),
            QueryParams()
        )
    ELSE:
        // Move to trash (update status)
        CALL update_page(client, UpdatePageRequest(
            page_id: page_id,
            status: "trashed"
        ))

    shared/observability.emit_counter("confluence.pages.deleted", 1, {
        purge: purge
    })
```

### 3.6 Get Child Pages

```
FUNCTION get_children(
    client: ConfluenceClient,
    page_id: String,
    options: PaginationOptions
) -> PageList:
    params = QueryParams()
    params.add_optional("limit", options.limit OR 25)
    params.add_optional("cursor", options.cursor)
    params.add("body-format", client.config.default_body_format)

    response = CALL execute_request(
        client,
        "GET",
        FORMAT("/wiki/api/v2/pages/{}/children", page_id),
        params
    )

    pages = []
    FOR result IN response.results:
        pages.APPEND(parse_page(result))

    RETURN PageList(
        pages: pages,
        next_cursor: response._links.next
    )
```

### 3.7 Move Page

```
FUNCTION move_page(
    client: ConfluenceClient,
    page_id: String,
    target_parent_id: String,
    position: MovePosition
) -> Page:
    body = {
        "targetId": target_parent_id,
        "position": position  // "before", "after", "append"
    }

    response = CALL execute_request(
        client,
        "PUT",
        FORMAT("/wiki/api/v2/pages/{}/move", page_id),
        QueryParams(),
        body
    )

    RETURN parse_page(response)
```

---

## 4. Content Body Operations

### 4.1 Format Body

```
FUNCTION format_body(content: String, format: BodyFormat) -> Object:
    MATCH format:
        CASE Storage:
            RETURN {
                "storage": {
                    "value": content,
                    "representation": "storage"
                }
            }
        CASE AtlasDocFormat:
            RETURN {
                "atlas_doc_format": {
                    "value": content,
                    "representation": "atlas_doc_format"
                }
            }
        CASE Wiki:
            // Convert wiki markup to storage format first
            converted = CALL convert_content(client, content, "wiki", "storage")
            RETURN format_body(converted, Storage)
```

### 4.2 Convert Content

```
FUNCTION convert_content(
    client: ConfluenceClient,
    content: String,
    from_format: String,
    to_format: String
) -> String:
    body = {
        "value": content,
        "representation": from_format
    }

    params = QueryParams()
    params.add("to", to_format)

    response = CALL execute_request(
        client,
        "POST",
        "/wiki/api/v2/content/convert",
        params,
        body
    )

    RETURN response.value
```

### 4.3 Extract Text Content

```
FUNCTION extract_text(storage_content: String) -> String:
    // Parse storage format XML
    doc = parse_xml(storage_content)

    // Extract text nodes, ignoring macros and formatting
    text_parts = []
    FOR node IN doc.traverse():
        IF node.type == TextNode:
            text_parts.APPEND(node.text)
        ELSE IF node.name == "ac:structured-macro":
            // Skip macro content
            CONTINUE

    RETURN join(text_parts, " ")
```

---

## 5. Version Operations

### 5.1 List Versions

```
FUNCTION list_versions(
    client: ConfluenceClient,
    page_id: String,
    options: PaginationOptions
) -> VersionList:
    params = QueryParams()
    params.add_optional("limit", options.limit OR 25)
    params.add_optional("cursor", options.cursor)
    params.add("body-format", "storage")

    response = CALL execute_request(
        client,
        "GET",
        FORMAT("/wiki/api/v2/pages/{}/versions", page_id),
        params
    )

    versions = []
    FOR result IN response.results:
        versions.APPEND(parse_version(result))

    RETURN VersionList(
        versions: versions,
        next_cursor: response._links.next
    )
```

### 5.2 Get Version Content

```
FUNCTION get_version_content(
    client: ConfluenceClient,
    page_id: String,
    version_number: i32
) -> PageVersion:
    params = QueryParams()
    params.add("body-format", "storage")

    response = CALL execute_request(
        client,
        "GET",
        FORMAT("/wiki/api/v2/pages/{}/versions/{}", page_id, version_number),
        params
    )

    RETURN parse_page_version(response)
```

### 5.3 Compare Versions

```
FUNCTION compare_versions(
    client: ConfluenceClient,
    page_id: String,
    from_version: i32,
    to_version: i32
) -> VersionDiff:
    // Fetch both versions in parallel
    from_content, to_content = PARALLEL:
        CALL get_version_content(client, page_id, from_version)
        CALL get_version_content(client, page_id, to_version)

    // Perform local diff
    diff = compute_diff(
        extract_text(from_content.body.storage.value),
        extract_text(to_content.body.storage.value)
    )

    RETURN VersionDiff(
        from_version: from_version,
        to_version: to_version,
        additions: diff.additions,
        deletions: diff.deletions,
        changes: diff.changes
    )
```

### 5.4 Restore Version

```
FUNCTION restore_version(
    client: ConfluenceClient,
    page_id: String,
    version_number: i32,
    message: Option<String>
) -> Page:
    // Get content at version
    version_content = CALL get_version_content(client, page_id, version_number)

    // Update page with version content
    RETURN CALL update_page(client, UpdatePageRequest(
        page_id: page_id,
        body: version_content.body.storage.value,
        body_format: Storage,
        version_message: message OR FORMAT("Restored to version {}", version_number)
    ))
```

---

## 6. Attachment Operations

### 6.1 Upload Attachment

```
FUNCTION upload_attachment(
    client: ConfluenceClient,
    page_id: String,
    upload: AttachmentUpload
) -> Attachment:
    // Validate size
    IF upload.file.length > client.config.max_attachment_size_mb * 1024 * 1024:
        THROW AttachmentTooLarge(upload.filename, upload.file.length)

    // Detect media type if not provided
    media_type = upload.media_type OR detect_media_type(upload.filename)

    // Build multipart form
    form = MultipartForm()
    form.add_file("file", upload.filename, upload.file, media_type)
    IF upload.comment IS NOT null:
        form.add_text("comment", upload.comment)

    response = CALL execute_multipart_request(
        client,
        "POST",
        FORMAT("/wiki/api/v2/pages/{}/attachments", page_id),
        form
    )

    attachment = parse_attachment(response)

    shared/observability.emit_counter("confluence.attachments.uploaded", 1, {
        media_type: media_type,
        size_bytes: upload.file.length
    })

    RETURN attachment
```

### 6.2 Download Attachment

```
FUNCTION download_attachment(
    client: ConfluenceClient,
    attachment_id: String
) -> AttachmentContent:
    // Get attachment metadata
    metadata = CALL get_attachment(client, attachment_id)

    // Stream download
    stream = CALL execute_stream_request(
        client,
        "GET",
        metadata.download_link
    )

    RETURN AttachmentContent(
        metadata: metadata,
        stream: stream
    )
```

### 6.3 List Attachments

```
FUNCTION list_attachments(
    client: ConfluenceClient,
    page_id: String,
    options: PaginationOptions
) -> AttachmentList:
    params = QueryParams()
    params.add_optional("limit", options.limit OR 25)
    params.add_optional("cursor", options.cursor)

    response = CALL execute_request(
        client,
        "GET",
        FORMAT("/wiki/api/v2/pages/{}/attachments", page_id),
        params
    )

    attachments = []
    FOR result IN response.results:
        attachments.APPEND(parse_attachment(result))

    RETURN AttachmentList(
        attachments: attachments,
        next_cursor: response._links.next
    )
```

---

## 7. Label Operations

### 7.1 Add Label

```
FUNCTION add_label(
    client: ConfluenceClient,
    page_id: String,
    label_name: String,
    prefix: LabelPrefix
) -> Label:
    body = {
        "name": label_name,
        "prefix": prefix.to_string()
    }

    response = CALL execute_request(
        client,
        "POST",
        FORMAT("/wiki/api/v2/pages/{}/labels", page_id),
        QueryParams(),
        body
    )

    RETURN parse_label(response)
```

### 7.2 Get Content by Label

```
FUNCTION get_content_by_label(
    client: ConfluenceClient,
    label_name: String,
    space_id: Option<String>,
    options: PaginationOptions
) -> PageList:
    // Build CQL query
    cql = FORMAT("label = \"{}\"", escape_cql(label_name))
    IF space_id IS NOT null:
        cql = cql + FORMAT(" AND space.id = \"{}\"", space_id)

    RETURN CALL search(client, CqlQuery(
        cql: cql,
        limit: options.limit OR 25,
        start: options.start OR 0
    ))
```

---

## 8. Comment Operations

### 8.1 Create Comment

```
FUNCTION create_comment(
    client: ConfluenceClient,
    page_id: String,
    body: String,
    body_format: BodyFormat
) -> Comment:
    request_body = {
        "pageId": page_id,
        "body": format_body(body, body_format)
    }

    response = CALL execute_request(
        client,
        "POST",
        "/wiki/api/v2/footer-comments",
        QueryParams(),
        request_body
    )

    RETURN parse_comment(response)
```

### 8.2 Create Inline Comment

```
FUNCTION create_inline_comment(
    client: ConfluenceClient,
    page_id: String,
    body: String,
    text_selection: String,
    match_index: i32
) -> Comment:
    request_body = {
        "pageId": page_id,
        "body": format_body(body, Storage),
        "inlineCommentProperties": {
            "textSelection": text_selection,
            "textSelectionMatchCount": 1,
            "textSelectionMatchIndex": match_index
        }
    }

    response = CALL execute_request(
        client,
        "POST",
        "/wiki/api/v2/inline-comments",
        QueryParams(),
        request_body
    )

    RETURN parse_comment(response)
```

### 8.3 Resolve Comment

```
FUNCTION resolve_comment(client: ConfluenceClient, comment_id: String) -> Comment:
    body = {
        "resolved": true
    }

    response = CALL execute_request(
        client,
        "PUT",
        FORMAT("/wiki/api/v2/inline-comments/{}", comment_id),
        QueryParams(),
        body
    )

    RETURN parse_comment(response)
```

---

## 9. Search Operations

### 9.1 Search with CQL

```
FUNCTION search(client: ConfluenceClient, query: CqlQuery) -> SearchResult:
    // Validate CQL
    IF NOT is_valid_cql(query.cql):
        THROW InvalidCql(query.cql)

    params = QueryParams()
    params.add("cql", query.cql)
    params.add("start", query.start)
    params.add("limit", MIN(query.limit, 1000))

    IF query.expand.length > 0:
        params.add("expand", join(query.expand, ","))

    IF query.excerpt IS NOT null:
        params.add("excerpt", query.excerpt)

    response = CALL execute_request(
        client,
        "GET",
        "/wiki/api/v2/search",
        params
    )

    results = []
    FOR item IN response.results:
        results.APPEND(parse_search_result_item(item))

    RETURN SearchResult(
        results: results,
        start: response.start,
        limit: response.limit,
        size: response.size,
        total_size: response.totalSize,
        cql_query: query.cql
    )
```

### 9.2 Search Content

```
FUNCTION search_content(
    client: ConfluenceClient,
    text: String,
    filters: SearchFilters
) -> SearchResult:
    // Build CQL from filters
    cql_parts = [FORMAT("text ~ \"{}\"", escape_cql(text))]

    IF filters.space_key IS NOT null:
        cql_parts.APPEND(FORMAT("space.key = \"{}\"", filters.space_key))

    IF filters.content_type IS NOT null:
        cql_parts.APPEND(FORMAT("type = \"{}\"", filters.content_type))

    IF filters.labels.length > 0:
        label_cql = join(
            filters.labels.map(l => FORMAT("label = \"{}\"", l)),
            " OR "
        )
        cql_parts.APPEND(FORMAT("({})", label_cql))

    IF filters.created_after IS NOT null:
        cql_parts.APPEND(FORMAT("created >= \"{}\"", filters.created_after))

    cql = join(cql_parts, " AND ")

    RETURN CALL search(client, CqlQuery(
        cql: cql,
        limit: filters.limit OR 25,
        start: filters.start OR 0
    ))
```

---

## 10. Template Operations

### 10.1 Create from Template

```
FUNCTION create_from_template(
    client: ConfluenceClient,
    template_id: String,
    space_id: String,
    title: String,
    variables: Map<String, String>
) -> Page:
    // Get template
    template = CALL get_template(client, template_id)

    // Apply variable substitutions
    content = template.body.storage.value
    FOR key, value IN variables:
        placeholder = FORMAT("${{}}", key)
        content = content.replace(placeholder, escape_xml(value))

    // Create page with template content
    RETURN CALL create_page(client, CreatePageRequest(
        space_id: space_id,
        title: title,
        body: content,
        body_format: Storage
    ))
```

---

## 11. Webhook Operations

### 11.1 Create Webhook

```
FUNCTION create_webhook(
    client: ConfluenceClient,
    request: CreateWebhookRequest
) -> Webhook:
    body = {
        "name": request.name,
        "url": request.url,
        "events": request.events.map(e => e.to_string())
    }

    IF request.secret IS NOT null:
        body["secret"] = request.secret.expose()

    response = CALL execute_request(
        client,
        "POST",
        "/wiki/api/v2/webhooks",
        QueryParams(),
        body
    )

    RETURN parse_webhook(response)
```

### 11.2 Process Webhook Event

```
FUNCTION process_webhook_event(
    client: ConfluenceClient,
    payload: Bytes,
    signature: String,
    secret: SecretString
) -> WebhookPayload:
    // Validate signature
    IF NOT atlassian/auth.validate_webhook_signature(payload, signature, secret):
        THROW InvalidWebhookSignature()

    // Parse payload
    event = parse_json(payload)

    webhook_payload = WebhookPayload(
        webhook_event: parse_webhook_event(event.webhookEvent),
        timestamp: parse_datetime(event.timestamp),
        user_account_id: event.userAccountId,
        content: parse_content_summary_optional(event.content),
        space: parse_space_ref_optional(event.space)
    )

    // Emit event metric
    shared/observability.emit_counter("confluence.webhooks.received", 1, {
        event_type: webhook_payload.webhook_event.to_string()
    })

    RETURN webhook_payload
```

---

## 12. Request Execution

### 12.1 Execute Request

```
FUNCTION execute_request(
    client: ConfluenceClient,
    method: String,
    path: String,
    params: QueryParams,
    body: Option<Object>
) -> Object:
    // Create span for tracing
    span = shared/observability.start_span("confluence.request", {
        method: method,
        path: path
    })

    TRY:
        // Acquire rate limit token
        CALL client.rate_limiter.acquire()

        // Check circuit breaker
        IF client.circuit_breaker.is_open():
            THROW ServiceUnavailable("Circuit breaker open")

        // Get access token
        token = CALL client.auth_provider.get_access_token()

        // Build request
        url = client.base_url + path + params.to_query_string()
        headers = {
            "Authorization": FORMAT("Bearer {}", token.expose()),
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

        // Execute with retry
        response = CALL client.http_client.request(
            method: method,
            url: url,
            headers: headers,
            body: body.map(b => serialize_json(b))
        )

        // Handle response
        IF response.status >= 200 AND response.status < 300:
            client.circuit_breaker.record_success()
            RETURN parse_json(response.body)
        ELSE:
            error = map_http_error(response.status, response.body)
            client.circuit_breaker.record_failure()
            THROW error

    CATCH error:
        span.record_error(error)
        THROW

    FINALLY:
        span.end()
```

### 12.2 Error Mapping

```
FUNCTION map_http_error(status: i32, body: Bytes) -> ConfluenceError:
    error_response = TRY parse_json(body) CATCH {}
    message = error_response.message OR "Unknown error"

    MATCH status:
        CASE 400:
            IF message.contains("CQL"):
                RETURN InvalidCql(message)
            RETURN InvalidContent(message)
        CASE 401:
            RETURN Unauthorized(message)
        CASE 403:
            RETURN AccessDenied(message)
        CASE 404:
            IF message.contains("space"):
                RETURN SpaceNotFound(message)
            IF message.contains("attachment"):
                RETURN AttachmentNotFound(message)
            RETURN PageNotFound(message)
        CASE 409:
            IF message.contains("version"):
                RETURN VersionConflict(message)
            RETURN TitleConflict(message)
        CASE 413:
            RETURN AttachmentTooLarge(message)
        CASE 429:
            retry_after = error_response.retryAfter OR 60
            RETURN RateLimited(retry_after)
        CASE 503:
            RETURN ServiceUnavailable(message)
        DEFAULT:
            RETURN ConfluenceError(status, message)
```

---

## 13. Simulation Support

### 13.1 Mock Client

```
FUNCTION create_mock_client(initial_state: MockState) -> MockConfluenceClient:
    RETURN MockConfluenceClient(
        spaces: initial_state.spaces OR {},
        pages: initial_state.pages OR {},
        attachments: initial_state.attachments OR {},
        comments: initial_state.comments OR {},
        labels: initial_state.labels OR {},
        operation_history: [],
        error_injections: {}
    )
```

### 13.2 Record Operation

```
FUNCTION record_operation(mock: MockConfluenceClient, op: Operation) -> void:
    mock.operation_history.APPEND(OperationRecord(
        operation: op,
        timestamp: now(),
        state_before: snapshot_state(mock),
        state_after: null  // Filled after operation
    ))
```

### 13.3 Replay Operations

```
FUNCTION replay_operations(
    mock: MockConfluenceClient,
    operations: Vec<OperationRecord>
) -> ReplayResult:
    results = []

    FOR record IN operations:
        // Restore state before operation
        restore_state(mock, record.state_before)

        // Execute operation
        TRY:
            result = CALL execute_operation(mock, record.operation)
            results.APPEND(ReplayOutcome.Success(result))
        CATCH error:
            results.APPEND(ReplayOutcome.Error(error))

    RETURN ReplayResult(
        total: operations.length,
        successful: results.filter(r => r.is_success()).length,
        failed: results.filter(r => r.is_error()).length,
        outcomes: results
    )
```

---

## 14. Vector Memory Integration

### 14.1 Store Page Embedding

```
FUNCTION store_page_embedding(
    client: ConfluenceClient,
    page: Page
) -> void:
    // Extract text content
    text = extract_text(page.body.storage.value)

    // Store in vector memory
    CALL shared/vector-memory.store(
        namespace: "confluence",
        id: page.id,
        content: text,
        metadata: {
            title: page.title,
            space_id: page.space_id,
            labels: page.labels.map(l => l.name),
            version: page.version.number,
            updated_at: page.version.created_at
        }
    )
```

### 14.2 Search Similar Pages

```
FUNCTION search_similar_pages(
    client: ConfluenceClient,
    query: String,
    options: SimilarityOptions
) -> Vec<SimilarPage>:
    results = CALL shared/vector-memory.search(
        namespace: "confluence",
        query: query,
        limit: options.limit OR 10,
        threshold: options.threshold OR 0.7
    )

    similar_pages = []
    FOR result IN results:
        page = CALL get_page(client, result.id, GetPageOptions())
        similar_pages.APPEND(SimilarPage(
            page: page,
            similarity: result.score
        ))

    RETURN similar_pages
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-confluence.md | Complete |
| 2. Pseudocode | pseudocode-confluence.md | Complete |
| 3. Architecture | architecture-confluence.md | Pending |
| 4. Refinement | refinement-confluence.md | Pending |
| 5. Completion | completion-confluence.md | Pending |

---

*Phase 2: Pseudocode - Complete*
