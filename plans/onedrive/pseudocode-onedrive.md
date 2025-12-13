# Pseudocode: OneDrive Integration Module

## SPARC Phase 2: Pseudocode

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/onedrive`

---

## Table of Contents

1. [Module Structure](#1-module-structure)
2. [Configuration](#2-configuration)
3. [Client Core](#3-client-core)
4. [File Operations](#4-file-operations)
5. [Large File Upload](#5-large-file-upload)
6. [Folder Operations](#6-folder-operations)
7. [Version Operations](#7-version-operations)
8. [Simulation Layer](#8-simulation-layer)
9. [Error Handling](#9-error-handling)

---

## 1. Module Structure

```
onedrive/
├── src/
│   ├── lib.rs                 # Public exports
│   ├── client.rs              # OneDriveClient
│   ├── config.rs              # Configuration builder
│   ├── file/
│   │   ├── mod.rs
│   │   ├── upload.rs          # Small file upload
│   │   ├── upload_session.rs  # Large file upload
│   │   ├── download.rs        # File download
│   │   └── operations.rs      # Delete, copy, move
│   ├── folder/
│   │   ├── mod.rs
│   │   ├── create.rs
│   │   └── list.rs
│   ├── version/
│   │   ├── mod.rs
│   │   └── operations.rs
│   ├── simulation/
│   │   ├── mod.rs
│   │   ├── layer.rs
│   │   └── storage.rs
│   ├── types/
│   │   ├── mod.rs
│   │   ├── drive.rs
│   │   ├── item.rs
│   │   └── upload.rs
│   └── error.rs
└── tests/
    ├── file_test.rs
    ├── folder_test.rs
    └── simulation_test.rs
```

---

## 2. Configuration

### 2.1 Config Structure

```rust
STRUCT OneDriveConfig {
    default_drive: Option<DriveRef>,
    chunk_size: usize,                     // Default: 10MB (10485760)
    max_retries: u32,                      // Default: 3
    timeout: Duration,                     // Default: 60s
    simulation_mode: SimulationMode,
    path_routing: HashMap<String, PathRef>,
}

ENUM DriveRef {
    Me,                                    // /me/drive
    Id(String),                            // /drives/{id}
    User(String),                          // /users/{id}/drive
    Site(String),                          // /sites/{id}/drive
}

STRUCT PathRef {
    drive: DriveRef,
    path: String,
}
```

### 2.2 Config Builder

```rust
IMPL OneDriveConfigBuilder {
    FUNCTION new() -> Self {
        Self {
            default_drive: None,
            chunk_size: 10 * 1024 * 1024,  // 10MB
            max_retries: 3,
            timeout: Duration::from_secs(60),
            simulation_mode: SimulationMode::Disabled,
            path_routing: HashMap::new(),
        }
    }

    FUNCTION with_default_drive(mut self, drive: DriveRef) -> Self {
        self.default_drive = Some(drive)
        RETURN self
    }

    FUNCTION with_chunk_size(mut self, size: usize) -> Self {
        // Validate: 320KB <= size <= 60MB
        assert!(size >= 327680 && size <= 62914560)
        self.chunk_size = size
        RETURN self
    }

    FUNCTION with_path_alias(mut self, name: &str, path: PathRef) -> Self {
        self.path_routing.insert(name.to_string(), path)
        RETURN self
    }

    FUNCTION with_simulation(mut self, mode: SimulationMode) -> Self {
        self.simulation_mode = mode
        RETURN self
    }

    FUNCTION build(self) -> Result<OneDriveConfig, ConfigError> {
        RETURN Ok(OneDriveConfig { ...self })
    }
}
```

---

## 3. Client Core

```rust
STRUCT OneDriveClient {
    config: Arc<OneDriveConfig>,
    auth: Arc<AzureAdClient>,              // Shared auth integration
    http_client: Arc<HttpClient>,
    simulation: Arc<SimulationLayer>,
}

IMPL OneDriveClient {
    ASYNC FUNCTION new(config: OneDriveConfig, auth: AzureAdClient) -> Result<Self, OneDriveError> {
        http_client = HttpClient::builder()
            .timeout(config.timeout)
            .build()?

        simulation = SimulationLayer::new(config.simulation_mode.clone())

        RETURN Ok(Self {
            config: Arc::new(config),
            auth: Arc::new(auth),
            http_client: Arc::new(http_client),
            simulation: Arc::new(simulation),
        })
    }

    FUNCTION drive_url(&self, drive: &DriveRef) -> String {
        MATCH drive {
            DriveRef::Me => "https://graph.microsoft.com/v1.0/me/drive",
            DriveRef::Id(id) => format!("https://graph.microsoft.com/v1.0/drives/{}", id),
            DriveRef::User(id) => format!("https://graph.microsoft.com/v1.0/users/{}/drive", id),
            DriveRef::Site(id) => format!("https://graph.microsoft.com/v1.0/sites/{}/drive", id),
        }
    }

    FUNCTION item_url(&self, drive: &DriveRef, item: &ItemRef) -> String {
        base = self.drive_url(drive)
        MATCH item {
            ItemRef::Id(id) => format!("{}/items/{}", base, id),
            ItemRef::Path(path) => format!("{}/root:/{}", base, encode_path(path)),
        }
    }

    ASYNC FUNCTION call_api<T>(&self, request: Request) -> Result<T, OneDriveError> {
        // Check simulation mode
        IF self.simulation.is_replay() {
            RETURN self.simulation.replay(&request).await
        }

        // Get access token from shared auth
        token = self.auth.get_token(&["https://graph.microsoft.com/.default"]).await?

        // Add auth header
        request = request.header("Authorization", format!("Bearer {}", token.access_token))

        // Execute with retry
        response = self.execute_with_retry(request).await?

        // Record if in recording mode
        IF self.simulation.is_recording() {
            self.simulation.record(&request, &response).await?
        }

        RETURN parse_response(response)
    }

    ASYNC FUNCTION execute_with_retry(&self, request: Request) -> Result<Response, OneDriveError> {
        retry_count = 0

        LOOP {
            response = self.http_client.execute(request.clone()).await?

            MATCH response.status {
                200..=299 => RETURN Ok(response),

                429 => {
                    retry_after = parse_retry_after(&response)
                    IF retry_count >= self.config.max_retries {
                        RETURN Err(OneDriveError::Throttled { retry_after })
                    }
                    sleep(retry_after).await
                    retry_count += 1
                },

                401 => {
                    // Token may have expired, refresh and retry once
                    IF retry_count == 0 {
                        self.auth.refresh_token().await?
                        retry_count += 1
                    } ELSE {
                        RETURN Err(OneDriveError::Unauthorized)
                    }
                },

                500..=599 => {
                    IF retry_count >= self.config.max_retries {
                        RETURN Err(OneDriveError::from_response(response))
                    }
                    backoff = calculate_backoff(retry_count)
                    sleep(backoff).await
                    retry_count += 1
                },

                _ => RETURN Err(OneDriveError::from_response(response)),
            }
        }
    }
}
```

---

## 4. File Operations

### 4.1 Upload Small File

```rust
IMPL OneDriveClient {
    ASYNC FUNCTION upload_small(&self, params: UploadParams) -> Result<DriveItem, OneDriveError> {
        drive = params.drive.or(self.config.default_drive.clone())?

        // Validate size <= 4MB
        IF params.content.len() > 4 * 1024 * 1024 {
            RETURN Err(OneDriveError::FileTooLarge {
                size: params.content.len(),
                max: 4 * 1024 * 1024,
            })
        }

        // Build URL with conflict behavior
        url = format!("{}:/content", self.item_url(&drive, &params.path))
        url = add_query_param(url, "@microsoft.graph.conflictBehavior", params.conflict_behavior)

        request = Request::builder()
            .method(Method::PUT)
            .uri(url)
            .header("Content-Type", params.content_type.unwrap_or("application/octet-stream"))
            .body(params.content)?

        RETURN self.call_api(request).await
    }
}

STRUCT UploadParams {
    drive: Option<DriveRef>,
    path: ItemRef,
    content: Vec<u8>,
    content_type: Option<String>,
    conflict_behavior: ConflictBehavior,
}

ENUM ConflictBehavior {
    Fail,
    Replace,
    Rename,
}
```

### 4.2 Download File

```rust
IMPL OneDriveClient {
    ASYNC FUNCTION download(&self, drive: Option<DriveRef>, item: ItemRef) -> Result<ByteStream, OneDriveError> {
        drive = drive.or(self.config.default_drive.clone())?

        url = format!("{}/content", self.item_url(&drive, &item))

        request = Request::builder()
            .method(Method::GET)
            .uri(url)
            .build()?

        // Check simulation mode
        IF self.simulation.is_replay() {
            RETURN self.simulation.replay_stream(&request).await
        }

        token = self.auth.get_token(&["https://graph.microsoft.com/.default"]).await?

        response = self.http_client.execute(
            request.header("Authorization", format!("Bearer {}", token.access_token))
        ).await?

        IF response.status == 302 {
            // Follow redirect for content
            download_url = response.headers.get("Location")?
            response = self.http_client.get(download_url).await?
        }

        IF !response.status.is_success() {
            RETURN Err(OneDriveError::from_response(response))
        }

        // Return streaming body
        RETURN Ok(ByteStream::from_response(response))
    }

    ASYNC FUNCTION download_to_file(&self, drive: Option<DriveRef>, item: ItemRef, path: &Path) -> Result<u64, OneDriveError> {
        stream = self.download(drive, item).await?
        file = File::create(path).await?

        bytes_written = 0
        WHILE let Some(chunk) = stream.next().await {
            file.write_all(&chunk?).await?
            bytes_written += chunk.len()
        }

        RETURN Ok(bytes_written)
    }
}
```

### 4.3 Delete, Copy, Move

```rust
IMPL OneDriveClient {
    ASYNC FUNCTION delete(&self, drive: Option<DriveRef>, item: ItemRef) -> Result<(), OneDriveError> {
        drive = drive.or(self.config.default_drive.clone())?
        url = self.item_url(&drive, &item)

        request = Request::builder()
            .method(Method::DELETE)
            .uri(url)
            .build()?

        MATCH self.call_api::<()>(request).await {
            Ok(()) => Ok(()),
            Err(OneDriveError::NotFound { .. }) => Ok(()),  // Idempotent
            Err(e) => Err(e),
        }
    }

    ASYNC FUNCTION copy(&self, params: CopyParams) -> Result<AsyncOperation, OneDriveError> {
        source_drive = params.source_drive.or(self.config.default_drive.clone())?
        url = format!("{}/copy", self.item_url(&source_drive, &params.source_item))

        body = CopyRequestBody {
            parent_reference: ParentReference {
                drive_id: params.dest_drive_id,
                path: params.dest_path,
            },
            name: params.new_name,
        }

        request = Request::builder()
            .method(Method::POST)
            .uri(url)
            .header("Content-Type", "application/json")
            .body(serde_json::to_vec(&body)?)?

        response = self.call_api_raw(request).await?

        // Copy returns 202 with Location header for async operation
        IF response.status == 202 {
            monitor_url = response.headers.get("Location")?
            RETURN Ok(AsyncOperation { monitor_url })
        }

        RETURN Err(OneDriveError::UnexpectedResponse)
    }

    ASYNC FUNCTION move_item(&self, params: MoveParams) -> Result<DriveItem, OneDriveError> {
        drive = params.drive.or(self.config.default_drive.clone())?
        url = self.item_url(&drive, &params.item)

        body = MoveRequestBody {
            parent_reference: params.new_parent.map(|p| ParentReference { id: p, ..Default::default() }),
            name: params.new_name,
        }

        request = Request::builder()
            .method(Method::PATCH)
            .uri(url)
            .header("Content-Type", "application/json")
            .body(serde_json::to_vec(&body)?)?

        RETURN self.call_api(request).await
    }
}
```

---

## 5. Large File Upload

### 5.1 Upload Session

```rust
IMPL OneDriveClient {
    ASYNC FUNCTION upload_large<R: AsyncRead>(&self, params: LargeUploadParams<R>) -> Result<DriveItem, OneDriveError> {
        drive = params.drive.or(self.config.default_drive.clone())?

        // Create upload session
        session = self.create_upload_session(&drive, &params.path, &params.options).await?

        // Upload chunks
        result = self.upload_chunks(session, params.stream, params.size).await

        // Handle result
        MATCH result {
            Ok(item) => Ok(item),
            Err(e) => {
                // Try to cancel session on error
                let _ = self.cancel_upload_session(&session.upload_url).await;
                Err(e)
            }
        }
    }

    ASYNC FUNCTION create_upload_session(&self, drive: &DriveRef, path: &ItemRef, options: &UploadOptions) -> Result<UploadSession, OneDriveError> {
        url = format!("{}/createUploadSession", self.item_url(drive, path))

        body = CreateSessionBody {
            item: CreateSessionItem {
                conflict_behavior: options.conflict_behavior.to_string(),
                name: options.name.clone(),
                description: options.description.clone(),
            },
        }

        request = Request::builder()
            .method(Method::POST)
            .uri(url)
            .header("Content-Type", "application/json")
            .body(serde_json::to_vec(&body)?)?

        RETURN self.call_api(request).await
    }

    ASYNC FUNCTION upload_chunks<R: AsyncRead>(&self, session: UploadSession, mut stream: R, total_size: u64) -> Result<DriveItem, OneDriveError> {
        chunk_size = self.config.chunk_size
        offset: u64 = 0
        buffer = vec![0u8; chunk_size]

        LOOP {
            // Read chunk from stream
            bytes_read = stream.read(&mut buffer).await?

            IF bytes_read == 0 {
                BREAK  // EOF
            }

            chunk = &buffer[..bytes_read]
            end_offset = offset + bytes_read as u64 - 1

            // Upload chunk
            request = Request::builder()
                .method(Method::PUT)
                .uri(&session.upload_url)
                .header("Content-Length", bytes_read.to_string())
                .header("Content-Range", format!("bytes {}-{}/{}", offset, end_offset, total_size))
                .body(chunk.to_vec())?

            response = self.http_client.execute(request).await?

            MATCH response.status.as_u16() {
                202 => {
                    // Chunk accepted, continue
                    offset += bytes_read as u64
                },
                200 | 201 => {
                    // Upload complete
                    RETURN parse_response(response)
                },
                _ => {
                    RETURN Err(OneDriveError::from_response(response))
                }
            }
        }

        RETURN Err(OneDriveError::UploadIncomplete)
    }

    ASYNC FUNCTION resume_upload(&self, session_url: &str) -> Result<UploadSession, OneDriveError> {
        // GET the session URL to check status
        request = Request::builder()
            .method(Method::GET)
            .uri(session_url)
            .build()?

        response = self.http_client.execute(request).await?

        IF response.status == 404 {
            RETURN Err(OneDriveError::UploadSessionExpired)
        }

        RETURN parse_response(response)
    }

    ASYNC FUNCTION cancel_upload_session(&self, session_url: &str) -> Result<(), OneDriveError> {
        request = Request::builder()
            .method(Method::DELETE)
            .uri(session_url)
            .build()?

        let _ = self.http_client.execute(request).await;
        Ok(())
    }
}

STRUCT UploadSession {
    upload_url: String,
    expiration_date_time: DateTime<Utc>,
    next_expected_ranges: Vec<String>,
}
```

---

## 6. Folder Operations

```rust
IMPL OneDriveClient {
    ASYNC FUNCTION create_folder(&self, drive: Option<DriveRef>, parent: ItemRef, name: &str) -> Result<DriveItem, OneDriveError> {
        drive = drive.or(self.config.default_drive.clone())?
        url = format!("{}/children", self.item_url(&drive, &parent))

        body = CreateFolderBody {
            name: name.to_string(),
            folder: FolderFacet {},
            conflict_behavior: "fail".to_string(),
        }

        request = Request::builder()
            .method(Method::POST)
            .uri(url)
            .header("Content-Type", "application/json")
            .body(serde_json::to_vec(&body)?)?

        RETURN self.call_api(request).await
    }

    ASYNC FUNCTION list_children(&self, drive: Option<DriveRef>, folder: ItemRef, options: ListOptions) -> Result<Page<DriveItem>, OneDriveError> {
        drive = drive.or(self.config.default_drive.clone())?

        url = IF let Some(skip_token) = options.skip_token {
            skip_token  // Use continuation URL directly
        } ELSE {
            format!("{}/children", self.item_url(&drive, &folder))
        }

        // Add query parameters
        url = add_query_params(url, &[
            ("$top", options.page_size.map(|s| s.to_string())),
            ("$orderby", options.order_by),
            ("$filter", options.filter),
        ])

        request = Request::builder()
            .method(Method::GET)
            .uri(url)
            .build()?

        response: GraphCollection<DriveItem> = self.call_api(request).await?

        RETURN Ok(Page {
            items: response.value,
            next_link: response.odata_next_link,
        })
    }

    ASYNC FUNCTION list_recursive(&self, drive: Option<DriveRef>, folder: ItemRef) -> Result<impl Stream<Item = Result<DriveItem, OneDriveError>>, OneDriveError> {
        drive = drive.or(self.config.default_drive.clone())?

        // Return async stream that traverses folders
        RETURN Ok(async_stream::stream! {
            stack = vec![folder];

            WHILE let Some(current_folder) = stack.pop() {
                skip_token = None;

                LOOP {
                    page = self.list_children(Some(drive.clone()), current_folder.clone(), ListOptions { skip_token, ..Default::default() }).await?;

                    FOR item IN page.items {
                        // If folder, add to stack for traversal
                        IF item.folder.is_some() {
                            stack.push(ItemRef::Id(item.id.clone()));
                        }
                        yield Ok(item);
                    }

                    IF let Some(next) = page.next_link {
                        skip_token = Some(next);
                    } ELSE {
                        BREAK;
                    }
                }
            }
        })
    }
}

STRUCT ListOptions {
    page_size: Option<u32>,
    skip_token: Option<String>,
    order_by: Option<String>,
    filter: Option<String>,
}

STRUCT Page<T> {
    items: Vec<T>,
    next_link: Option<String>,
}
```

---

## 7. Version Operations

```rust
IMPL OneDriveClient {
    ASYNC FUNCTION list_versions(&self, drive: Option<DriveRef>, item: ItemRef) -> Result<Vec<DriveItemVersion>, OneDriveError> {
        drive = drive.or(self.config.default_drive.clone())?
        url = format!("{}/versions", self.item_url(&drive, &item))

        request = Request::builder()
            .method(Method::GET)
            .uri(url)
            .build()?

        response: GraphCollection<DriveItemVersion> = self.call_api(request).await?
        RETURN Ok(response.value)
    }

    ASYNC FUNCTION download_version(&self, drive: Option<DriveRef>, item: ItemRef, version_id: &str) -> Result<ByteStream, OneDriveError> {
        drive = drive.or(self.config.default_drive.clone())?
        url = format!("{}/versions/{}/content", self.item_url(&drive, &item), version_id)

        request = Request::builder()
            .method(Method::GET)
            .uri(url)
            .build()?

        token = self.auth.get_token(&["https://graph.microsoft.com/.default"]).await?

        response = self.http_client.execute(
            request.header("Authorization", format!("Bearer {}", token.access_token))
        ).await?

        IF response.status == 302 {
            download_url = response.headers.get("Location")?
            response = self.http_client.get(download_url).await?
        }

        RETURN Ok(ByteStream::from_response(response))
    }

    ASYNC FUNCTION restore_version(&self, drive: Option<DriveRef>, item: ItemRef, version_id: &str) -> Result<DriveItem, OneDriveError> {
        drive = drive.or(self.config.default_drive.clone())?
        url = format!("{}/versions/{}/restoreVersion", self.item_url(&drive, &item), version_id)

        request = Request::builder()
            .method(Method::POST)
            .uri(url)
            .build()?

        // Restore returns 204 No Content on success
        self.call_api::<()>(request).await?

        // Fetch current item to return
        RETURN self.get_item(Some(drive), item).await
    }

    ASYNC FUNCTION get_item(&self, drive: Option<DriveRef>, item: ItemRef) -> Result<DriveItem, OneDriveError> {
        drive = drive.or(self.config.default_drive.clone())?
        url = self.item_url(&drive, &item)

        request = Request::builder()
            .method(Method::GET)
            .uri(url)
            .build()?

        RETURN self.call_api(request).await
    }
}

STRUCT DriveItemVersion {
    id: String,
    last_modified_date_time: DateTime<Utc>,
    last_modified_by: IdentitySet,
    size: i64,
}
```

---

## 8. Simulation Layer

```rust
STRUCT SimulationLayer {
    mode: RwLock<SimulationMode>,
    recorder: RwLock<SimulationRecorder>,
    storage: SimulationStorage,
}

IMPL SimulationLayer {
    FUNCTION new(mode: SimulationMode) -> Self {
        recorder = SimulationRecorder::new()
        storage = SimulationStorage::new()

        IF let SimulationMode::Replay { path } = &mode {
            storage.load(path).expect("Failed to load recordings")
        }

        Self {
            mode: RwLock::new(mode),
            recorder: RwLock::new(recorder),
            storage,
        }
    }

    FUNCTION is_recording(&self) -> bool {
        matches!(*self.mode.read(), SimulationMode::Recording { .. })
    }

    FUNCTION is_replay(&self) -> bool {
        matches!(*self.mode.read(), SimulationMode::Replay { .. })
    }

    ASYNC FUNCTION replay<T>(&self, request: &Request) -> Result<T, OneDriveError> {
        key = generate_replay_key(request)
        recording = self.storage.find(&key)
            .ok_or(OneDriveError::SimulationNoMatch { key })?

        RETURN deserialize_response(&recording.response)
    }

    ASYNC FUNCTION replay_stream(&self, request: &Request) -> Result<ByteStream, OneDriveError> {
        key = generate_replay_key(request)
        recording = self.storage.find(&key)?

        // Load content from file based on content_hash
        IF let Some(hash) = &recording.content_hash {
            content = self.storage.load_content(hash)?
            RETURN Ok(ByteStream::from_vec(content))
        }

        RETURN Err(OneDriveError::SimulationNoContent)
    }

    ASYNC FUNCTION record(&self, request: &Request, response: &Response) -> Result<(), OneDriveError> {
        interaction = RecordedInteraction {
            timestamp: now(),
            operation: extract_operation(request),
            request: serialize_request(request),
            response: serialize_response(response),
            content_hash: None,
        }

        self.recorder.write().add(interaction)
        Ok(())
    }

    ASYNC FUNCTION record_with_content(&self, request: &Request, response: &Response, content: &[u8]) -> Result<(), OneDriveError> {
        // Hash content and store separately
        content_hash = sha256(content)
        self.storage.store_content(&content_hash, content)?

        interaction = RecordedInteraction {
            timestamp: now(),
            operation: extract_operation(request),
            request: serialize_request(request),
            response: serialize_response(response),
            content_hash: Some(content_hash),
        }

        self.recorder.write().add(interaction)
        Ok(())
    }

    ASYNC FUNCTION save(&self) -> Result<(), OneDriveError> {
        IF let SimulationMode::Recording { path } = &*self.mode.read() {
            recordings = self.recorder.read().get_all()
            self.storage.save(path, recordings)?
        }
        Ok(())
    }
}
```

---

## 9. Error Handling

```rust
ENUM OneDriveError {
    // Rate limiting
    Throttled { retry_after: Duration },

    // Authentication
    Unauthorized,
    Forbidden { message: String },

    // Resource errors
    NotFound { item: String },
    Conflict { message: String },
    PreconditionFailed { etag: String },

    // Storage errors
    InsufficientStorage,
    FileTooLarge { size: usize, max: usize },

    // Upload errors
    UploadSessionExpired,
    UploadIncomplete,
    ChunkUploadFailed { range: String },

    // Server errors
    ServerError { status: u16, message: String },
    NetworkError { source: Box<dyn Error> },

    // Configuration errors
    NoDriveConfigured,
    InvalidPath { path: String },

    // Simulation errors
    SimulationNoMatch { key: String },
    SimulationNoContent,
}

IMPL OneDriveError {
    FUNCTION is_retryable(&self) -> bool {
        MATCH self {
            Self::Throttled { .. } => true,
            Self::ServerError { .. } => true,
            Self::NetworkError { .. } => true,
            _ => false,
        }
    }

    FUNCTION from_response(response: Response) -> Self {
        status = response.status.as_u16()
        body = response.json::<GraphError>().ok()

        MATCH status {
            401 => Self::Unauthorized,
            403 => Self::Forbidden {
                message: body.map(|b| b.message).unwrap_or_default(),
            },
            404 => Self::NotFound {
                item: "unknown".to_string(),
            },
            409 => Self::Conflict {
                message: body.map(|b| b.message).unwrap_or_default(),
            },
            412 => Self::PreconditionFailed {
                etag: "unknown".to_string(),
            },
            429 => {
                retry_after = parse_retry_after(&response)
                Self::Throttled { retry_after }
            },
            507 => Self::InsufficientStorage,
            _ IF status >= 500 => Self::ServerError {
                status,
                message: body.map(|b| b.message).unwrap_or_default(),
            },
            _ => Self::ServerError {
                status,
                message: "Unexpected error".to_string(),
            },
        }
    }
}

STRUCT GraphError {
    error: GraphErrorDetail,
}

STRUCT GraphErrorDetail {
    code: String,
    message: String,
    inner_error: Option<Box<GraphErrorDetail>>,
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-ONEDRIVE-PSEUDO-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Pseudocode Document**

*SPARC Phase 2 Complete - Proceed to Architecture phase with "Next phase."*
