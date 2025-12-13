# SharePoint Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/microsoft/sharepoint`

---

## 1. Client Initialization

```
FUNCTION create_sharepoint_client(config: SharePointConfig) -> Result<SharePointClient, SharePointError>:
    // Validate configuration
    validate_config(config)?

    // Initialize auth provider (delegated to azure/auth)
    auth_provider = azure_auth.create_provider(
        tenant_id: config.tenant_id,
        client_id: config.client_id,
        credentials: config.credentials,
        scopes: ["https://graph.microsoft.com/.default"]
    )?

    // Initialize HTTP transport with resilience
    http_client = create_http_client(
        timeout: config.request_timeout_ms,
        retry_policy: shared_resilience.create_retry_policy(
            max_retries: config.max_retries,
            retryable_statuses: [429, 500, 502, 503, 504]
        ),
        circuit_breaker: shared_resilience.create_circuit_breaker(
            failure_threshold: 5,
            timeout: 30_seconds
        ),
        rate_limiter: shared_resilience.create_rate_limiter(
            requests_per_minute: config.requests_per_minute
        )
    )

    RETURN SharePointClient {
        auth_provider,
        http_client,
        config,
        site_service: SiteService::new(http_client, auth_provider),
        library_service: DocumentLibraryService::new(http_client, auth_provider),
        list_service: ListService::new(http_client, auth_provider),
        version_service: VersionService::new(http_client, auth_provider),
        metadata_service: MetadataService::new(http_client, auth_provider),
        search_service: SearchService::new(http_client, auth_provider),
        webhook_service: WebhookService::new(http_client, auth_provider),
        permission_service: PermissionService::new(http_client, auth_provider)
    }
```

---

## 2. SiteService

### 2.1 Get Site

```
FUNCTION get_site(site_url: String) -> Result<Site, SharePointError>:
    span = tracing.start_span("sharepoint.get_site")

    // Encode site URL for Graph API
    encoded_url = encode_site_url(site_url)

    url = format!("https://graph.microsoft.com/v1.0/sites/{}", encoded_url)

    request = http_client.get(url)
        .header("Authorization", format!("Bearer {}", auth_provider.get_token()?))

    response = TRY request.send():
        Ok(resp) => resp
        Err(e) =>
            metrics.increment("sharepoint.errors", tags: ["operation:get_site"])
            RETURN Err(map_http_error(e))

    MATCH response.status:
        200 =>
            site = parse_site(response.body)?
            metrics.increment("sharepoint.operations", tags: ["operation:get_site"])
            RETURN Ok(site)
        404 => RETURN Err(SharePointError.SiteNotFound(site_url))
        403 => RETURN Err(SharePointError.AccessDenied(site_url))
        _ => RETURN Err(map_api_error(response))

FUNCTION encode_site_url(url: String) -> String:
    // Convert URL to Graph site ID format
    // Example: https://contoso.sharepoint.com/sites/hr -> contoso.sharepoint.com:/sites/hr:
    parsed = parse_url(url)
    host = parsed.host
    path = parsed.path

    IF path.is_empty() OR path == "/":
        RETURN host
    ELSE:
        RETURN format!("{}:{}", host, path)
```

### 2.2 List Subsites

```
FUNCTION list_subsites(site_id: String, options: ListOptions) -> Result<Vec<SubsiteInfo>, SharePointError>:
    span = tracing.start_span("sharepoint.list_subsites")

    url = format!("https://graph.microsoft.com/v1.0/sites/{}/sites", site_id)

    query_params = build_odata_params(options)

    response = http_client.get(url)
        .query(query_params)
        .header("Authorization", format!("Bearer {}", auth_provider.get_token()?))
        .send()?

    MATCH response.status:
        200 =>
            result = parse_sites_collection(response.body)?
            RETURN Ok(result.value)
        404 => RETURN Err(SharePointError.SiteNotFound(site_id))
        _ => RETURN Err(map_api_error(response))
```

---

## 3. DocumentLibraryService

### 3.1 List Libraries

```
FUNCTION list_libraries(site_id: String) -> Result<Vec<DocumentLibrary>, SharePointError>:
    span = tracing.start_span("sharepoint.list_libraries")

    url = format!("https://graph.microsoft.com/v1.0/sites/{}/drives", site_id)

    response = http_client.get(url)
        .header("Authorization", format!("Bearer {}", auth_provider.get_token()?))
        .send()?

    MATCH response.status:
        200 =>
            drives = parse_drives_collection(response.body)?
            // Filter to document libraries only
            libraries = drives.value.filter(d => d.drive_type == "documentLibrary")
            RETURN Ok(libraries)
        404 => RETURN Err(SharePointError.SiteNotFound(site_id))
        _ => RETURN Err(map_api_error(response))
```

### 3.2 Get Library Items

```
FUNCTION get_library_items(site_id: String, library_id: String, options: ItemQueryOptions) -> Result<ItemsPage, SharePointError>:
    span = tracing.start_span("sharepoint.get_library_items")

    // Build URL based on folder path or root
    base_url = IF options.folder_path IS Some(path):
        format!(
            "https://graph.microsoft.com/v1.0/sites/{}/drives/{}/root:{}:/children",
            site_id, library_id, path
        )
    ELSE:
        format!(
            "https://graph.microsoft.com/v1.0/sites/{}/drives/{}/root/children",
            site_id, library_id
        )

    query_params = []
    query_params.push(("$top", options.page_size.to_string()))

    IF options.expand_thumbnails:
        query_params.push(("$expand", "thumbnails"))

    IF options.filter IS Some(filter):
        query_params.push(("$filter", filter))

    IF options.order_by IS Some(order):
        query_params.push(("$orderby", order))

    IF options.skip_token IS Some(token):
        query_params.push(("$skiptoken", token))

    response = http_client.get(base_url)
        .query(query_params)
        .header("Authorization", format!("Bearer {}", auth_provider.get_token()?))
        .send()?

    MATCH response.status:
        200 =>
            page = parse_items_page(response.body)?
            RETURN Ok(page)
        404 => RETURN Err(SharePointError.LibraryNotFound(library_id))
        _ => RETURN Err(map_api_error(response))
```

### 3.3 Upload File

```
FUNCTION upload_file(site_id: String, library_id: String, path: String, content: Bytes, options: UploadOptions) -> Result<DriveItem, SharePointError>:
    span = tracing.start_span("sharepoint.upload_file")
    span.set_attribute("file_size", content.len())

    // Choose upload method based on size
    IF content.len() > config.large_file_threshold:
        RETURN upload_large_file(site_id, library_id, path, content, options)
    ELSE:
        RETURN upload_small_file(site_id, library_id, path, content, options)

FUNCTION upload_small_file(site_id: String, library_id: String, path: String, content: Bytes, options: UploadOptions) -> Result<DriveItem, SharePointError>:
    url = format!(
        "https://graph.microsoft.com/v1.0/sites/{}/drives/{}/root:{}:/content",
        site_id, library_id, path
    )

    request = http_client.put(url)
        .header("Authorization", format!("Bearer {}", auth_provider.get_token()?))
        .header("Content-Type", "application/octet-stream")
        .body(content)

    // Add conflict behavior header
    IF options.conflict_behavior IS Some(behavior):
        request = request.header("@microsoft.graph.conflictBehavior", behavior.to_string())

    response = request.send()?

    MATCH response.status:
        200, 201 =>
            item = parse_drive_item(response.body)?
            metrics.increment("sharepoint.uploads", tags: ["size:small"])
            RETURN Ok(item)
        409 => RETURN Err(SharePointError.VersionConflict(path))
        507 => RETURN Err(SharePointError.QuotaExceeded)
        _ => RETURN Err(map_api_error(response))

FUNCTION upload_large_file(site_id: String, library_id: String, path: String, content: Bytes, options: UploadOptions) -> Result<DriveItem, SharePointError>:
    // Step 1: Create upload session
    session_url = format!(
        "https://graph.microsoft.com/v1.0/sites/{}/drives/{}/root:{}:/createUploadSession",
        site_id, library_id, path
    )

    session_body = CreateUploadSessionRequest {
        item: UploadItemProperties {
            conflict_behavior: options.conflict_behavior.unwrap_or(ConflictBehavior.Rename),
            name: extract_filename(path)
        }
    }

    session_response = http_client.post(session_url)
        .header("Authorization", format!("Bearer {}", auth_provider.get_token()?))
        .json(session_body)
        .send()?

    IF session_response.status != 200:
        RETURN Err(map_api_error(session_response))

    upload_session = parse_upload_session(session_response.body)?
    upload_url = upload_session.upload_url

    // Step 2: Upload in chunks
    total_size = content.len()
    chunk_size = config.chunk_size_bytes
    uploaded = 0

    WHILE uploaded < total_size:
        chunk_end = min(uploaded + chunk_size, total_size)
        chunk = content[uploaded..chunk_end]

        content_range = format!("bytes {}-{}/{}", uploaded, chunk_end - 1, total_size)

        chunk_response = http_client.put(upload_url)
            .header("Content-Length", chunk.len().to_string())
            .header("Content-Range", content_range)
            .body(chunk)
            .send()?

        MATCH chunk_response.status:
            202 =>
                // More chunks needed
                uploaded = chunk_end

            200, 201 =>
                // Upload complete
                item = parse_drive_item(chunk_response.body)?
                metrics.increment("sharepoint.uploads", tags: ["size:large"])
                RETURN Ok(item)

            _ =>
                // Cancel session on error
                TRY http_client.delete(upload_url).send()
                RETURN Err(map_api_error(chunk_response))

    RETURN Err(SharePointError.UploadIncomplete)
```

### 3.4 Download File

```
FUNCTION download_file(site_id: String, library_id: String, item_id: String) -> Result<Bytes, SharePointError>:
    span = tracing.start_span("sharepoint.download_file")

    // Get download URL
    url = format!(
        "https://graph.microsoft.com/v1.0/sites/{}/drives/{}/items/{}/content",
        site_id, library_id, item_id
    )

    response = http_client.get(url)
        .header("Authorization", format!("Bearer {}", auth_provider.get_token()?))
        .send()?

    MATCH response.status:
        200 =>
            content = response.bytes()?
            metrics.histogram("sharepoint.download_size", content.len())
            RETURN Ok(content)

        302 =>
            // Redirect to download URL
            download_url = response.headers.get("Location")?
            content_response = http_client.get(download_url).send()?
            RETURN Ok(content_response.bytes()?)

        404 => RETURN Err(SharePointError.ItemNotFound(item_id))
        _ => RETURN Err(map_api_error(response))
```

---

## 4. ListService

### 4.1 Get List Items

```
FUNCTION get_list_items(site_id: String, list_id: String, options: ListItemQueryOptions) -> Result<ListItemsPage, SharePointError>:
    span = tracing.start_span("sharepoint.get_list_items")

    url = format!(
        "https://graph.microsoft.com/v1.0/sites/{}/lists/{}/items",
        site_id, list_id
    )

    query_params = []

    // Expand fields by default
    expand = options.expand.unwrap_or(vec!["fields"])
    query_params.push(("$expand", expand.join(",")))

    IF options.filter IS Some(filter):
        query_params.push(("$filter", filter))

    IF options.top IS Some(top):
        query_params.push(("$top", top.to_string()))

    IF options.skip_token IS Some(token):
        query_params.push(("$skiptoken", token))

    response = http_client.get(url)
        .query(query_params)
        .header("Authorization", format!("Bearer {}", auth_provider.get_token()?))
        .send()?

    MATCH response.status:
        200 =>
            page = parse_list_items_page(response.body)?
            RETURN Ok(page)
        404 => RETURN Err(SharePointError.ListNotFound(list_id))
        _ => RETURN Err(map_api_error(response))
```

### 4.2 Create List Item

```
FUNCTION create_list_item(site_id: String, list_id: String, fields: Map<String, FieldValue>) -> Result<ListItem, SharePointError>:
    span = tracing.start_span("sharepoint.create_list_item")

    url = format!(
        "https://graph.microsoft.com/v1.0/sites/{}/lists/{}/items",
        site_id, list_id
    )

    // Convert fields to Graph format
    graph_fields = convert_fields_to_graph_format(fields)?

    body = CreateListItemRequest {
        fields: graph_fields
    }

    response = http_client.post(url)
        .header("Authorization", format!("Bearer {}", auth_provider.get_token()?))
        .header("Content-Type", "application/json")
        .json(body)
        .send()?

    MATCH response.status:
        201 =>
            item = parse_list_item(response.body)?
            metrics.increment("sharepoint.list_items", tags: ["action:create"])
            RETURN Ok(item)

        400 =>
            error = parse_error_detail(response.body)
            IF error.contains("validation"):
                RETURN Err(SharePointError.FieldValidation(error))
            ELSE:
                RETURN Err(SharePointError.InvalidRequest(error))

        404 => RETURN Err(SharePointError.ListNotFound(list_id))
        _ => RETURN Err(map_api_error(response))
```

### 4.3 Update List Item

```
FUNCTION update_list_item(site_id: String, list_id: String, item_id: String, fields: Map<String, FieldValue>, etag: Option<String>) -> Result<ListItem, SharePointError>:
    span = tracing.start_span("sharepoint.update_list_item")

    url = format!(
        "https://graph.microsoft.com/v1.0/sites/{}/lists/{}/items/{}/fields",
        site_id, list_id, item_id
    )

    graph_fields = convert_fields_to_graph_format(fields)?

    request = http_client.patch(url)
        .header("Authorization", format!("Bearer {}", auth_provider.get_token()?))
        .header("Content-Type", "application/json")
        .json(graph_fields)

    // Add ETag for optimistic concurrency
    IF etag IS Some(tag):
        request = request.header("If-Match", tag)

    response = request.send()?

    MATCH response.status:
        200 =>
            item = parse_list_item_fields(response.body)?
            metrics.increment("sharepoint.list_items", tags: ["action:update"])
            RETURN Ok(item)
        409 => RETURN Err(SharePointError.VersionConflict(item_id))
        404 => RETURN Err(SharePointError.ItemNotFound(item_id))
        _ => RETURN Err(map_api_error(response))
```

---

## 5. VersionService

### 5.1 List Versions

```
FUNCTION list_versions(site_id: String, library_id: String, item_id: String) -> Result<VersionHistory, SharePointError>:
    span = tracing.start_span("sharepoint.list_versions")

    url = format!(
        "https://graph.microsoft.com/v1.0/sites/{}/drives/{}/items/{}/versions",
        site_id, library_id, item_id
    )

    response = http_client.get(url)
        .header("Authorization", format!("Bearer {}", auth_provider.get_token()?))
        .send()?

    MATCH response.status:
        200 =>
            versions = parse_versions_list(response.body)?
            current = versions.iter().find(v => v.is_current).map(v => v.version_label.clone())
            RETURN Ok(VersionHistory {
                versions,
                current_version: current.unwrap_or_default()
            })
        404 => RETURN Err(SharePointError.ItemNotFound(item_id))
        _ => RETURN Err(map_api_error(response))
```

### 5.2 Restore Version

```
FUNCTION restore_version(site_id: String, library_id: String, item_id: String, version_id: String) -> Result<DriveItem, SharePointError>:
    span = tracing.start_span("sharepoint.restore_version")

    url = format!(
        "https://graph.microsoft.com/v1.0/sites/{}/drives/{}/items/{}/versions/{}/restoreVersion",
        site_id, library_id, item_id, version_id
    )

    response = http_client.post(url)
        .header("Authorization", format!("Bearer {}", auth_provider.get_token()?))
        .send()?

    MATCH response.status:
        204 =>
            // Fetch updated item
            item = get_item(site_id, library_id, item_id)?
            metrics.increment("sharepoint.versions", tags: ["action:restore"])
            RETURN Ok(item)
        404 =>
            RETURN Err(SharePointError.VersionNotFound(version_id))
        423 =>
            RETURN Err(SharePointError.ItemLocked(item_id))
        _ => RETURN Err(map_api_error(response))
```

---

## 6. SearchService

### 6.1 Search Content

```
FUNCTION search(query: SearchQuery) -> Result<SearchResult, SharePointError>:
    span = tracing.start_span("sharepoint.search")
    span.set_attribute("query_length", query.query_text.len())

    url = "https://graph.microsoft.com/v1.0/search/query"

    // Build search request
    search_request = SearchRequest {
        requests: [
            SearchRequestItem {
                entity_types: ["driveItem", "listItem"],
                query: QueryString {
                    query_string: query.query_text
                },
                from: query.start_row,
                size: query.row_limit,
                fields: query.select_properties,
                sort: query.sort_list.map(|s| SortProperty {
                    name: s.field,
                    is_descending: s.descending
                })
            }
        ]
    }

    response = http_client.post(url)
        .header("Authorization", format!("Bearer {}", auth_provider.get_token()?))
        .header("Content-Type", "application/json")
        .json(search_request)
        .send()?

    MATCH response.status:
        200 =>
            result = parse_search_response(response.body)?
            metrics.increment("sharepoint.search", tags: ["status:success"])
            metrics.histogram("sharepoint.search_results", result.total_rows)
            RETURN Ok(result)
        400 =>
            RETURN Err(SharePointError.InvalidRequest("Invalid search query"))
        _ => RETURN Err(map_api_error(response))
```

---

## 7. WebhookService

### 7.1 Create Subscription

```
FUNCTION create_subscription(resource: String, notification_url: String, expiry: DateTime, client_state: Option<String>) -> Result<Subscription, SharePointError>:
    span = tracing.start_span("sharepoint.create_subscription")

    url = "https://graph.microsoft.com/v1.0/subscriptions"

    body = CreateSubscriptionRequest {
        change_type: "created,updated,deleted",
        notification_url,
        resource,
        expiration_date_time: expiry.to_rfc3339(),
        client_state
    }

    response = http_client.post(url)
        .header("Authorization", format!("Bearer {}", auth_provider.get_token()?))
        .header("Content-Type", "application/json")
        .json(body)
        .send()?

    MATCH response.status:
        201 =>
            subscription = parse_subscription(response.body)?
            metrics.increment("sharepoint.webhooks", tags: ["action:create"])
            RETURN Ok(subscription)
        400 =>
            error = parse_error_detail(response.body)
            RETURN Err(SharePointError.InvalidRequest(error))
        _ => RETURN Err(map_api_error(response))
```

### 7.2 Process Notification

```
FUNCTION process_notification(notification: WebhookNotification, handler: NotificationHandler) -> Result<(), SharePointError>:
    span = tracing.start_span("sharepoint.process_notification")
    span.set_attribute("change_type", notification.change_type.to_string())

    // Validate client state if configured
    IF config.webhook_secret IS Some(secret):
        IF notification.client_state != Some(secret.expose_secret()):
            RETURN Err(SharePointError.WebhookValidationFailed)

    // Parse resource to determine type
    resource_type = parse_resource_type(notification.resource)

    MATCH resource_type:
        ResourceType.DriveItem(site_id, library_id, item_id) =>
            item = TRY get_item(site_id, library_id, item_id):
                Ok(i) => Some(i)
                Err(SharePointError.ItemNotFound(_)) => None  // Item deleted
                Err(e) => RETURN Err(e)

            handler.on_drive_item_change(notification.change_type, item)

        ResourceType.ListItem(site_id, list_id, item_id) =>
            item = TRY get_list_item(site_id, list_id, item_id):
                Ok(i) => Some(i)
                Err(SharePointError.ItemNotFound(_)) => None
                Err(e) => RETURN Err(e)

            handler.on_list_item_change(notification.change_type, item)

    metrics.increment("sharepoint.webhooks", tags: ["action:process", format!("type:{}", notification.change_type)])
    RETURN Ok(())
```

---

## 8. PermissionService

### 8.1 Get Effective Permissions

```
FUNCTION get_effective_permissions(site_id: String, item_id: Option<String>) -> Result<Vec<Permission>, SharePointError>:
    span = tracing.start_span("sharepoint.get_permissions")

    url = IF item_id IS Some(id):
        format!(
            "https://graph.microsoft.com/v1.0/sites/{}/drive/items/{}/permissions",
            site_id, id
        )
    ELSE:
        format!(
            "https://graph.microsoft.com/v1.0/sites/{}/permissions",
            site_id
        )

    response = http_client.get(url)
        .header("Authorization", format!("Bearer {}", auth_provider.get_token()?))
        .send()?

    MATCH response.status:
        200 =>
            permissions = parse_permissions_list(response.body)?
            RETURN Ok(permissions)
        404 => RETURN Err(SharePointError.ItemNotFound(item_id.unwrap_or(site_id)))
        _ => RETURN Err(map_api_error(response))
```

### 8.2 Check Permission

```
FUNCTION check_permission(site_id: String, item_id: Option<String>, permission: PermissionType) -> Result<bool, SharePointError>:
    permissions = get_effective_permissions(site_id, item_id)?

    has_permission = permissions.iter().any(|p| {
        MATCH permission:
            PermissionType.Read => p.roles.contains("read") OR p.roles.contains("write") OR p.roles.contains("owner")
            PermissionType.Write => p.roles.contains("write") OR p.roles.contains("owner")
            PermissionType.Owner => p.roles.contains("owner")
    })

    RETURN Ok(has_permission)
```

---

## 9. Helper Functions

### 9.1 OData Query Builder

```
FUNCTION build_odata_params(options: QueryOptions) -> Vec<(String, String)>:
    params = []

    IF options.select IS Some(fields):
        params.push(("$select", fields.join(",")))

    IF options.expand IS Some(expands):
        params.push(("$expand", expands.join(",")))

    IF options.filter IS Some(filter):
        params.push(("$filter", sanitize_odata_filter(filter)))

    IF options.orderby IS Some(order):
        params.push(("$orderby", order))

    IF options.top IS Some(top):
        params.push(("$top", top.to_string()))

    IF options.skip IS Some(skip):
        params.push(("$skip", skip.to_string()))

    RETURN params

FUNCTION sanitize_odata_filter(filter: String) -> String:
    // Escape single quotes
    sanitized = filter.replace("'", "''")
    RETURN sanitized
```

### 9.2 Field Value Conversion

```
FUNCTION convert_fields_to_graph_format(fields: Map<String, FieldValue>) -> Result<Map<String, JsonValue>, SharePointError>:
    graph_fields = Map::new()

    FOR (name, value) IN fields:
        graph_value = MATCH value:
            FieldValue.Text(s) => JsonValue.String(s)
            FieldValue.Number(n) => JsonValue.Number(n)
            FieldValue.Boolean(b) => JsonValue.Bool(b)
            FieldValue.DateTime(dt) => JsonValue.String(dt.to_rfc3339())
            FieldValue.Lookup(lv) => JsonValue.Object({
                "LookupId": lv.lookup_id,
                "LookupValue": lv.lookup_value
            })
            FieldValue.User(uv) => JsonValue.Object({
                "LookupId": uv.user_id
            })
            FieldValue.MultiChoice(choices) => JsonValue.Array(choices.map(JsonValue.String))
            FieldValue.Url(uv) => JsonValue.Object({
                "Url": uv.url,
                "Description": uv.description
            })
            FieldValue.Null => JsonValue.Null

        graph_fields.insert(name, graph_value)

    RETURN Ok(graph_fields)
```

### 9.3 Error Mapping

```
FUNCTION map_api_error(response: HttpResponse) -> SharePointError:
    status = response.status
    body = response.body.parse::<ApiError>().ok()

    MATCH status:
        400 =>
            message = body.map(|b| b.message).unwrap_or("Bad request")
            RETURN SharePointError.InvalidRequest(message)

        401 => RETURN SharePointError.Unauthorized

        403 =>
            message = body.map(|b| b.message).unwrap_or("Access denied")
            RETURN SharePointError.AccessDenied(message)

        404 =>
            message = body.map(|b| b.message).unwrap_or("Not found")
            RETURN SharePointError.ItemNotFound(message)

        409 => RETURN SharePointError.VersionConflict("ETag mismatch")

        423 =>
            RETURN SharePointError.ItemLocked("Item is checked out")

        429 =>
            retry_after = response.headers.get("Retry-After")
                .and_then(|v| v.parse::<u64>().ok())
                .unwrap_or(60)
            RETURN SharePointError.RateLimited(retry_after)

        507 => RETURN SharePointError.QuotaExceeded

        503 => RETURN SharePointError.ServiceUnavailable

        _ => RETURN SharePointError.UnexpectedError(status, body)
```

---

## 10. Simulation Support

### 10.1 Mock Client

```
STRUCT MockSharePointClient:
    sites: HashMap<String, Site>
    libraries: HashMap<String, DocumentLibrary>
    items: HashMap<String, DriveItem>
    lists: HashMap<String, List>
    list_items: HashMap<String, Vec<ListItem>>
    operation_log: Vec<OperationRecord>
    error_injector: Option<ErrorInjector>

IMPLEMENT MockSharePointClient:
    FUNCTION get_site(site_url: String) -> Result<Site, SharePointError>:
        self.operation_log.push(OperationRecord::GetSite(site_url.clone()))

        IF self.error_injector.should_fail("get_site"):
            RETURN Err(self.error_injector.get_error())

        self.sites.get(&site_url)
            .cloned()
            .ok_or(SharePointError.SiteNotFound(site_url))

    FUNCTION upload_file(site_id: String, library_id: String, path: String, content: Bytes) -> Result<DriveItem, SharePointError>:
        self.operation_log.push(OperationRecord::UploadFile(site_id.clone(), path.clone(), content.len()))

        IF self.error_injector.should_fail("upload_file"):
            RETURN Err(self.error_injector.get_error())

        // Create mock item
        item = DriveItem {
            id: generate_id(),
            name: extract_filename(path),
            path: path.clone(),
            size: content.len() as u64,
            // ... other fields
        }

        self.items.insert(item.id.clone(), item.clone())
        RETURN Ok(item)
```

---

## SPARC Phase Summary

| Phase | Document | Status |
|-------|----------|--------|
| 1. Specification | specification-sharepoint.md | Complete |
| 2. Pseudocode | pseudocode-sharepoint.md | Complete |
| 3. Architecture | architecture-sharepoint.md | Pending |
| 4. Refinement | refinement-sharepoint.md | Pending |
| 5. Completion | completion-sharepoint.md | Pending |

---

*Phase 2: Pseudocode - Complete*
