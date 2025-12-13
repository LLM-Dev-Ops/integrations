# Microsoft Word & Excel Graph API Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/word-excel-graph-api`

---

## 1. Core Client

### 1.1 GraphDocumentClient Initialization

```pseudocode
CLASS GraphDocumentClient:
    config: GraphConfig
    auth: MicrosoftAuthProvider
    transport: HttpTransport
    rate_limiter: RateLimiter
    circuit_breaker: CircuitBreaker
    etag_cache: ETagCache
    session_manager: SessionManager

    FUNCTION new(config: GraphConfig) -> Result<Self>:
        auth = MicrosoftAuthProvider::new(config.credentials)?
        transport = HttpTransport::new(
            base_url = "https://graph.microsoft.com/v1.0",
            timeout = config.timeout
        )
        rate_limiter = RateLimiter::new(config.rate_limit_config)
        circuit_breaker = CircuitBreaker::new(config.circuit_breaker_config)
        etag_cache = ETagCache::new(config.etag_cache_ttl)
        session_manager = SessionManager::new()

        RETURN Ok(GraphDocumentClient { ... })

    FUNCTION excel(&self) -> ExcelService:
        RETURN ExcelService::new(self)

    FUNCTION word(&self) -> WordService:
        RETURN WordService::new(self)

    FUNCTION versions(&self) -> VersionService:
        RETURN VersionService::new(self)
```

### 1.2 Authentication

```pseudocode
CLASS MicrosoftAuthProvider:
    credentials: MicrosoftCredentials
    token_cache: TokenCache
    tenant_id: String

    FUNCTION new(credentials: MicrosoftCredentials) -> Result<Self>:
        validate_credentials(credentials)?
        RETURN Ok(MicrosoftAuthProvider { credentials, token_cache: TokenCache::new(), tenant_id: credentials.tenant_id })

    FUNCTION get_access_token(scopes: Vec<String>) -> Result<String>:
        cache_key = scopes.join(" ")

        IF token_cache.has_valid_token(cache_key):
            RETURN Ok(token_cache.get_token(cache_key))

        token = MATCH credentials:
            ClientCredentials { client_id, client_secret } =>
                acquire_token_client_credentials(client_id, client_secret, scopes)?
            DelegatedAuth { client_id, refresh_token } =>
                acquire_token_delegated(client_id, refresh_token, scopes)?

        token_cache.set_token(cache_key, token.clone(), token.expires_at)
        RETURN Ok(token.access_token)

    FUNCTION acquire_token_client_credentials(client_id: String, client_secret: SecretString, scopes: Vec<String>) -> Result<Token>:
        url = format!("https://login.microsoftonline.com/{}/oauth2/v2.0/token", tenant_id)

        body = {
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret.expose(),
            "scope": scopes.join(" ")
        }

        response = http_post(url, body)?

        RETURN Ok(Token {
            access_token: response.access_token,
            expires_at: now() + response.expires_in
        })

    FUNCTION apply_auth(request: &mut Request, scopes: Vec<String>) -> Result<()>:
        token = get_access_token(scopes)?
        request.headers.insert("Authorization", format!("Bearer {}", token))
        RETURN Ok(())
```

---

## 2. Excel Service

### 2.1 Range Operations

```pseudocode
CLASS ExcelService:
    client: GraphDocumentClient

    FUNCTION get_range(drive_id: String, item_id: String, worksheet: String, range: String, session: Option<Session>) -> Result<ExcelRange>:
        validate_drive_id(drive_id)?
        validate_item_id(item_id)?
        validate_range(range)?

        IF NOT client.rate_limiter.try_acquire():
            RETURN Err(GraphApiError::RateLimited)

        IF client.circuit_breaker.is_open():
            RETURN Err(GraphApiError::CircuitOpen)

        url = format!("{}/drives/{}/items/{}/workbook/worksheets/{}/range(address='{}')",
            client.transport.base_url,
            drive_id, item_id, worksheet, url_encode(range))

        response = execute_with_retry(|| {
            req = client.transport.get(url)
            client.auth.apply_auth(&mut req, ["Files.Read"])?
            IF session.is_some():
                req.headers.insert("workbook-session-id", session.id)
            req.send().await
        }).await

        MATCH response.status:
            200 =>
                client.circuit_breaker.record_success()
                excel_range = parse_excel_range(response)
                IF response.headers.contains("ETag"):
                    client.etag_cache.set(item_id, range, response.headers["ETag"])
                emit_metric("graph_excel_cells_read_total", excel_range.cell_count)
                RETURN Ok(excel_range)
            404 =>
                RETURN Err(GraphApiError::ItemNotFound { id: item_id })
            _ =>
                client.circuit_breaker.record_failure()
                RETURN Err(parse_graph_error(response))

    FUNCTION update_range(drive_id: String, item_id: String, worksheet: String, range: String, values: Vec<Vec<CellValue>>, options: UpdateOptions) -> Result<ExcelRange>:
        validate_drive_id(drive_id)?
        validate_item_id(item_id)?
        validate_range(range)?

        IF NOT client.rate_limiter.try_acquire():
            RETURN Err(GraphApiError::RateLimited)

        IF client.circuit_breaker.is_open():
            RETURN Err(GraphApiError::CircuitOpen)

        // ETag-based concurrency check
        IF options.if_match.is_some():
            current_etag = client.etag_cache.get(item_id, range)
            IF current_etag != options.if_match:
                RETURN Err(GraphApiError::ETagMismatch { expected: options.if_match, actual: current_etag })

        url = format!("{}/drives/{}/items/{}/workbook/worksheets/{}/range(address='{}')",
            client.transport.base_url,
            drive_id, item_id, worksheet, url_encode(range))

        body = {
            "values": serialize_values(values)
        }

        IF options.formulas.is_some():
            body["formulas"] = options.formulas

        IF options.number_format.is_some():
            body["numberFormat"] = options.number_format

        response = execute_with_retry(|| {
            req = client.transport.patch(url).json(body.clone())
            client.auth.apply_auth(&mut req, ["Files.ReadWrite"])?
            IF options.session.is_some():
                req.headers.insert("workbook-session-id", options.session.id)
            IF options.if_match.is_some():
                req.headers.insert("If-Match", options.if_match)
            req.send().await
        }).await

        MATCH response.status:
            200 =>
                client.circuit_breaker.record_success()
                result = parse_excel_range(response)
                IF response.headers.contains("ETag"):
                    client.etag_cache.set(item_id, range, response.headers["ETag"])
                emit_metric("graph_excel_cells_written_total", result.cell_count)
                RETURN Ok(result)
            409 | 412 =>
                RETURN Err(GraphApiError::ConflictDetected { ... })
            _ =>
                client.circuit_breaker.record_failure()
                RETURN Err(parse_graph_error(response))
```

### 2.2 Session Management

```pseudocode
CLASS SessionManager:
    sessions: Map<String, Session>
    cleanup_interval: Duration

    FUNCTION new() -> Self:
        RETURN SessionManager { sessions: Map::new(), cleanup_interval: Duration::minutes(5) }

    FUNCTION create_session(client: &GraphDocumentClient, drive_id: String, item_id: String, persist_changes: bool) -> Result<Session>:
        url = format!("{}/drives/{}/items/{}/workbook/createSession",
            client.transport.base_url, drive_id, item_id)

        body = { "persistChanges": persist_changes }

        response = execute_with_retry(|| {
            req = client.transport.post(url).json(body.clone())
            client.auth.apply_auth(&mut req, ["Files.ReadWrite"])?
            req.send().await
        }).await

        MATCH response.status:
            201 =>
                session = Session {
                    id: response.body.id,
                    drive_id: drive_id,
                    item_id: item_id,
                    persist_changes: persist_changes,
                    created_at: now(),
                    expires_at: now() + Duration::minutes(5)
                }
                sessions.insert(session.id.clone(), session.clone())
                emit_metric("graph_session_count", sessions.len(), { "state": "active" })
                RETURN Ok(session)
            _ =>
                RETURN Err(parse_graph_error(response))

    FUNCTION refresh_session(client: &GraphDocumentClient, session: &mut Session) -> Result<()>:
        IF session.expires_at - now() > Duration::minutes(1):
            RETURN Ok(())  // No need to refresh yet

        url = format!("{}/drives/{}/items/{}/workbook/refreshSession",
            client.transport.base_url, session.drive_id, session.item_id)

        response = execute_with_retry(|| {
            req = client.transport.post(url)
            client.auth.apply_auth(&mut req, ["Files.ReadWrite"])?
            req.headers.insert("workbook-session-id", session.id)
            req.send().await
        }).await

        MATCH response.status:
            204 =>
                session.expires_at = now() + Duration::minutes(5)
                RETURN Ok(())
            _ =>
                RETURN Err(parse_graph_error(response))

    FUNCTION close_session(client: &GraphDocumentClient, session: Session) -> Result<()>:
        url = format!("{}/drives/{}/items/{}/workbook/closeSession",
            client.transport.base_url, session.drive_id, session.item_id)

        response = execute_with_retry(|| {
            req = client.transport.post(url)
            client.auth.apply_auth(&mut req, ["Files.ReadWrite"])?
            req.headers.insert("workbook-session-id", session.id)
            req.send().await
        }).await

        sessions.remove(session.id)
        emit_metric("graph_session_count", sessions.len(), { "state": "active" })

        MATCH response.status:
            204 => RETURN Ok(())
            _ => RETURN Err(parse_graph_error(response))
```

### 2.3 Batch Operations

```pseudocode
    FUNCTION batch_update(drive_id: String, item_id: String, updates: Vec<RangeUpdate>, session: Option<Session>) -> Result<BatchUpdateResponse>:
        validate_drive_id(drive_id)?
        validate_item_id(item_id)?

        IF updates.len() > MAX_BATCH_REQUESTS:
            RETURN Err(GraphApiError::BatchTooLarge { max: MAX_BATCH_REQUESTS })

        IF NOT client.rate_limiter.try_acquire():
            RETURN Err(GraphApiError::RateLimited)

        // Build batch request
        requests = updates.enumerate().map(|(idx, update)| {
            {
                "id": idx.to_string(),
                "method": "PATCH",
                "url": format!("/drives/{}/items/{}/workbook/worksheets/{}/range(address='{}')",
                    drive_id, item_id, update.worksheet, url_encode(update.range)),
                "body": { "values": serialize_values(update.values) },
                "headers": { "Content-Type": "application/json" }
            }
        })

        url = format!("{}/$batch", client.transport.base_url)

        body = { "requests": requests }

        response = execute_with_retry(|| {
            req = client.transport.post(url).json(body.clone())
            client.auth.apply_auth(&mut req, ["Files.ReadWrite"])?
            IF session.is_some():
                req.headers.insert("workbook-session-id", session.id)
            req.send().await
        }).await

        MATCH response.status:
            200 =>
                results = parse_batch_response(response)
                success_count = results.filter(|r| r.status < 400).count()
                failure_count = results.len() - success_count
                RETURN Ok(BatchUpdateResponse { results, success_count, failure_count })
            _ =>
                RETURN Err(parse_graph_error(response))
```

---

## 3. Word Service

### 3.1 Document Operations

```pseudocode
CLASS WordService:
    client: GraphDocumentClient

    FUNCTION get_content(drive_id: String, item_id: String) -> Result<WordDocument>:
        validate_drive_id(drive_id)?
        validate_item_id(item_id)?

        IF NOT client.rate_limiter.try_acquire():
            RETURN Err(GraphApiError::RateLimited)

        IF client.circuit_breaker.is_open():
            RETURN Err(GraphApiError::CircuitOpen)

        // Get document metadata first
        meta_url = format!("{}/drives/{}/items/{}",
            client.transport.base_url, drive_id, item_id)

        meta_response = execute_with_retry(|| {
            req = client.transport.get(meta_url)
            client.auth.apply_auth(&mut req, ["Files.Read"])?
            req.send().await
        }).await?

        metadata = parse_item_metadata(meta_response)

        // Get document content
        content_url = format!("{}/drives/{}/items/{}/content",
            client.transport.base_url, drive_id, item_id)

        content_response = execute_with_retry(|| {
            req = client.transport.get(content_url)
            client.auth.apply_auth(&mut req, ["Files.Read"])?
            req.send().await
        }).await

        MATCH content_response.status:
            200 =>
                client.circuit_breaker.record_success()
                content = content_response.bytes()
                IF content_response.headers.contains("ETag"):
                    client.etag_cache.set(item_id, "content", content_response.headers["ETag"])
                emit_metric("graph_word_bytes_read_total", content.len())
                RETURN Ok(WordDocument { metadata, content })
            _ =>
                client.circuit_breaker.record_failure()
                RETURN Err(parse_graph_error(content_response))

    FUNCTION update_content(drive_id: String, item_id: String, content: Bytes, options: UpdateOptions) -> Result<WordDocument>:
        validate_drive_id(drive_id)?
        validate_item_id(item_id)?

        IF content.len() > MAX_DOCUMENT_SIZE:
            RETURN Err(GraphApiError::ContentTooLarge { size: content.len(), max: MAX_DOCUMENT_SIZE })

        IF NOT client.rate_limiter.try_acquire():
            RETURN Err(GraphApiError::RateLimited)

        IF client.circuit_breaker.is_open():
            RETURN Err(GraphApiError::CircuitOpen)

        url = format!("{}/drives/{}/items/{}/content",
            client.transport.base_url, drive_id, item_id)

        response = execute_with_retry(|| {
            req = client.transport.put(url).body(content.clone())
            client.auth.apply_auth(&mut req, ["Files.ReadWrite"])?
            req.headers.insert("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
            IF options.if_match.is_some():
                req.headers.insert("If-Match", options.if_match)
            req.send().await
        }).await

        MATCH response.status:
            200 | 201 =>
                client.circuit_breaker.record_success()
                metadata = parse_item_metadata(response)
                IF response.headers.contains("ETag"):
                    client.etag_cache.set(item_id, "content", response.headers["ETag"])
                emit_metric("graph_word_bytes_written_total", content.len())
                RETURN Ok(WordDocument { metadata, content })
            412 =>
                RETURN Err(GraphApiError::ETagMismatch { ... })
            _ =>
                client.circuit_breaker.record_failure()
                RETURN Err(parse_graph_error(response))
```

### 3.2 Structured Content Operations

```pseudocode
    FUNCTION get_paragraphs(drive_id: String, item_id: String) -> Result<Vec<Paragraph>>:
        // Note: Graph API doesn't expose paragraph-level access directly
        // This requires using the Word JavaScript API or parsing OOXML
        document = self.get_content(drive_id, item_id)?
        paragraphs = parse_docx_paragraphs(document.content)?
        RETURN Ok(paragraphs)

    FUNCTION get_tables(drive_id: String, item_id: String) -> Result<Vec<Table>>:
        document = self.get_content(drive_id, item_id)?
        tables = parse_docx_tables(document.content)?
        RETURN Ok(tables)

    FUNCTION replace_text(drive_id: String, item_id: String, find: String, replace: String, options: ReplaceOptions) -> Result<ReplaceResult>:
        document = self.get_content(drive_id, item_id)?

        // Parse and modify OOXML content
        modified_content = replace_in_docx(document.content, find, replace, options)?

        count = modified_content.replacement_count

        IF count > 0:
            updated = self.update_content(drive_id, item_id, modified_content.bytes, UpdateOptions {
                if_match: client.etag_cache.get(item_id, "content")
            })?
            RETURN Ok(ReplaceResult { count, document: updated })

        RETURN Ok(ReplaceResult { count: 0, document })
```

---

## 4. Version Service

```pseudocode
CLASS VersionService:
    client: GraphDocumentClient

    FUNCTION list_versions(drive_id: String, item_id: String) -> Result<Vec<Version>>:
        validate_drive_id(drive_id)?
        validate_item_id(item_id)?

        IF NOT client.rate_limiter.try_acquire():
            RETURN Err(GraphApiError::RateLimited)

        url = format!("{}/drives/{}/items/{}/versions",
            client.transport.base_url, drive_id, item_id)

        response = execute_with_retry(|| {
            req = client.transport.get(url)
            client.auth.apply_auth(&mut req, ["Files.Read"])?
            req.send().await
        }).await

        MATCH response.status:
            200 =>
                versions = parse_versions_response(response)
                RETURN Ok(versions)
            404 =>
                RETURN Err(GraphApiError::ItemNotFound { id: item_id })
            _ =>
                RETURN Err(parse_graph_error(response))

    FUNCTION get_version(drive_id: String, item_id: String, version_id: String) -> Result<VersionContent>:
        url = format!("{}/drives/{}/items/{}/versions/{}/content",
            client.transport.base_url, drive_id, item_id, version_id)

        response = execute_with_retry(|| {
            req = client.transport.get(url)
            client.auth.apply_auth(&mut req, ["Files.Read"])?
            req.send().await
        }).await

        MATCH response.status:
            200 =>
                content = response.bytes()
                RETURN Ok(VersionContent { version_id, content })
            302 =>
                // Follow redirect for download
                download_url = response.headers["Location"]
                RETURN self.download_content(download_url)
            _ =>
                RETURN Err(parse_graph_error(response))

    FUNCTION restore_version(drive_id: String, item_id: String, version_id: String) -> Result<()>:
        url = format!("{}/drives/{}/items/{}/versions/{}/restoreVersion",
            client.transport.base_url, drive_id, item_id, version_id)

        response = execute_with_retry(|| {
            req = client.transport.post(url)
            client.auth.apply_auth(&mut req, ["Files.ReadWrite"])?
            req.send().await
        }).await

        MATCH response.status:
            204 =>
                // Invalidate ETags after restore
                client.etag_cache.invalidate_item(item_id)
                RETURN Ok(())
            _ =>
                RETURN Err(parse_graph_error(response))
```

---

## 5. Rate Limiter

```pseudocode
CLASS RateLimiter:
    global_bucket: TokenBucket
    session_buckets: Map<String, TokenBucket>

    FUNCTION new(config: RateLimitConfig) -> Self:
        RETURN RateLimiter {
            global_bucket: TokenBucket::new(config.requests_per_minute, 60),
            session_buckets: Map::new()
        }

    FUNCTION try_acquire() -> bool:
        RETURN global_bucket.try_acquire()

    FUNCTION try_acquire_for_session(session_id: String) -> bool:
        IF NOT global_bucket.try_acquire():
            RETURN false

        IF NOT session_buckets.contains(session_id):
            session_buckets.insert(session_id, TokenBucket::new(60, 60))

        RETURN session_buckets[session_id].try_acquire()

    FUNCTION handle_retry_after(retry_after: Duration):
        global_bucket.pause_until(now() + retry_after)
```

---

## 6. ETag Cache

```pseudocode
CLASS ETagCache:
    cache: Map<String, ETagEntry>
    ttl: Duration

    FUNCTION cache_key(item_id: String, resource: String) -> String:
        RETURN format!("{}:{}", item_id, resource)

    FUNCTION get(item_id: String, resource: String) -> Option<String>:
        key = cache_key(item_id, resource)
        IF cache.contains(key):
            entry = cache.get(key)
            IF entry.expires_at > now():
                RETURN Some(entry.etag)
            ELSE:
                cache.remove(key)
        RETURN None

    FUNCTION set(item_id: String, resource: String, etag: String):
        key = cache_key(item_id, resource)
        cache.insert(key, ETagEntry {
            etag: etag,
            expires_at: now() + ttl
        })

    FUNCTION invalidate_item(item_id: String):
        keys_to_remove = cache.keys().filter(|k| k.starts_with(item_id)).collect()
        FOR key IN keys_to_remove:
            cache.remove(key)
```

---

## 7. Simulation Layer

```pseudocode
CLASS MockGraphDocumentClient:
    workbooks: Map<String, MockWorkbook>
    documents: Map<String, MockDocument>
    recorded_operations: Vec<Operation>
    should_fail: Option<GraphApiError>

    FUNCTION with_workbook(drive_id: String, item_id: String, data: MockWorkbook) -> Self:
        key = format!("{}:{}", drive_id, item_id)
        workbooks.insert(key, data)
        RETURN self

    FUNCTION with_document(drive_id: String, item_id: String, data: MockDocument) -> Self:
        key = format!("{}:{}", drive_id, item_id)
        documents.insert(key, data)
        RETURN self

    FUNCTION simulate_failure(error: GraphApiError) -> Self:
        should_fail = Some(error)
        RETURN self

    FUNCTION get_recorded_operations() -> Vec<Operation>:
        RETURN recorded_operations.clone()

CLASS MockExcelService:
    mock: MockGraphDocumentClient

    FUNCTION get_range(drive_id: String, item_id: String, worksheet: String, range: String, session: Option<Session>) -> Result<ExcelRange>:
        IF mock.should_fail.is_some():
            RETURN Err(mock.should_fail.clone())

        mock.recorded_operations.push(Operation::ExcelGetRange { drive_id, item_id, worksheet, range })

        key = format!("{}:{}", drive_id, item_id)
        workbook = mock.workbooks.get(key)
            .ok_or(GraphApiError::ItemNotFound { id: item_id })?

        values = workbook.get_range(worksheet, range)?
        RETURN Ok(ExcelRange { address: range, values, ... })

    FUNCTION update_range(drive_id: String, item_id: String, worksheet: String, range: String, values: Vec<Vec<CellValue>>, options: UpdateOptions) -> Result<ExcelRange>:
        IF mock.should_fail.is_some():
            RETURN Err(mock.should_fail.clone())

        mock.recorded_operations.push(Operation::ExcelUpdateRange { drive_id, item_id, worksheet, range, values: values.clone() })

        key = format!("{}:{}", drive_id, item_id)
        workbook = mock.workbooks.get_mut(key)
            .ok_or(GraphApiError::ItemNotFound { id: item_id })?

        workbook.set_range(worksheet, range, values)?
        RETURN Ok(ExcelRange { address: range, ... })
```

---

## 8. Cell Value Handling

```pseudocode
ENUM CellValue:
    String(String)
    Number(f64)
    Boolean(bool)
    DateTime(DateTime)
    Formula(String)
    Error(String)
    Empty

FUNCTION serialize_values(values: Vec<Vec<CellValue>>) -> Vec<Vec<serde_json::Value>>:
    RETURN values.map(|row| {
        row.map(|cell| {
            MATCH cell:
                CellValue::String(s) => json!(s)
                CellValue::Number(n) => json!(n)
                CellValue::Boolean(b) => json!(b)
                CellValue::DateTime(dt) => json!(dt.to_excel_serial())
                CellValue::Formula(f) => json!(f)  // Handled via formulas array
                CellValue::Error(e) => json!({"error": e})
                CellValue::Empty => json!(null)
        })
    })

FUNCTION parse_excel_values(raw: serde_json::Value) -> Vec<Vec<CellValue>>:
    values = raw["values"].as_array()
    formulas = raw["formulas"].as_array()

    RETURN values.enumerate().map(|(row_idx, row)| {
        row.enumerate().map(|(col_idx, cell)| {
            // Check if there's a formula
            formula = formulas.get(row_idx).and_then(|r| r.get(col_idx))
            IF formula.is_some() AND NOT formula.is_empty():
                RETURN CellValue::Formula(formula.as_string())

            MATCH cell:
                serde_json::Value::String(s) => CellValue::String(s)
                serde_json::Value::Number(n) => CellValue::Number(n.as_f64())
                serde_json::Value::Bool(b) => CellValue::Boolean(b)
                serde_json::Value::Null => CellValue::Empty
                serde_json::Value::Object(o) if o.contains("error") =>
                    CellValue::Error(o["error"].as_string())
                _ => CellValue::String(cell.to_string())
        })
    })
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Pseudocode phase |

---

**Next Phase:** Architecture - Module structure, data flow diagrams, session lifecycle, and integration points.
