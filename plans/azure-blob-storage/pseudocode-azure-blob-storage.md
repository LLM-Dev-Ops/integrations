# Pseudocode: Azure Blob Storage Integration Module

## SPARC Phase 2: Pseudocode

**Version:** 1.0.0
**Date:** 2025-12-13
**Status:** Draft
**Module:** `integrations/azure-blob-storage`

---

## Table of Contents

1. [Module Structure](#1-module-structure)
2. [Configuration](#2-configuration)
3. [Client Core](#3-client-core)
4. [Upload Operations](#4-upload-operations)
5. [Download Operations](#5-download-operations)
6. [Blob Management](#6-blob-management)
7. [Versioning](#7-versioning)
8. [Simulation Layer](#8-simulation-layer)
9. [Error Handling](#9-error-handling)

---

## 1. Module Structure

```
azure-blob-storage/
├── src/
│   ├── lib.rs              # Public exports
│   ├── client.rs           # BlobStorageClient
│   ├── config.rs           # Configuration builder
│   ├── upload/
│   │   ├── mod.rs
│   │   ├── simple.rs       # Single-request upload
│   │   ├── chunked.rs      # Block upload
│   │   └── append.rs       # Append blob
│   ├── download/
│   │   ├── mod.rs
│   │   ├── simple.rs       # Full download
│   │   ├── streaming.rs    # Chunked streaming
│   │   └── range.rs        # Range reads
│   ├── management/
│   │   ├── mod.rs
│   │   ├── list.rs         # List blobs
│   │   ├── delete.rs       # Delete operations
│   │   ├── copy.rs         # Copy operations
│   │   └── properties.rs   # Metadata/properties
│   ├── versioning/
│   │   ├── mod.rs
│   │   └── versions.rs     # Version operations
│   ├── simulation/
│   │   ├── mod.rs
│   │   ├── layer.rs        # Simulation interceptor
│   │   ├── recorder.rs     # Recording logic
│   │   └── storage.rs      # Recording persistence
│   ├── types/
│   │   ├── mod.rs
│   │   ├── blob.rs         # Blob types
│   │   ├── request.rs      # Request types
│   │   └── response.rs     # Response types
│   └── error.rs            # Error definitions
└── tests/
    ├── upload_tests.rs
    ├── download_tests.rs
    ├── management_tests.rs
    └── simulation_tests.rs
```

---

## 2. Configuration

### 2.1 Config Structure

```rust
STRUCT BlobStorageConfig {
    account_name: String,
    default_container: Option<String>,
    auth: AuthConfig,
    endpoint: Option<String>,  // Custom endpoint (emulator)
    retry: RetryConfig,
    timeout: Duration,
    chunk_size: usize,         // Default 4MB
    max_concurrency: usize,    // Default 8
    simulation_mode: SimulationMode,
}

STRUCT RetryConfig {
    max_retries: u32,          // Default 3
    initial_backoff: Duration, // Default 1s
    max_backoff: Duration,     // Default 30s
    backoff_multiplier: f64,   // Default 2.0
}

ENUM SimulationMode {
    Disabled,
    Recording { path: PathBuf },
    Replay { path: PathBuf },
}
```

### 2.2 Config Builder

```rust
IMPL BlobStorageConfigBuilder {
    FUNCTION new(account_name: String) -> Self {
        Self {
            account_name,
            default_container: None,
            auth: AuthConfig::default(),
            endpoint: None,
            retry: RetryConfig::default(),
            timeout: Duration::from_secs(300),
            chunk_size: 4 * 1024 * 1024,  // 4MB
            max_concurrency: 8,
            simulation_mode: SimulationMode::Disabled,
        }
    }

    FUNCTION with_container(mut self, container: &str) -> Self {
        self.default_container = Some(container.to_string())
        RETURN self
    }

    FUNCTION with_auth(mut self, auth: AuthConfig) -> Self {
        self.auth = auth
        RETURN self
    }

    FUNCTION with_chunk_size(mut self, size: usize) -> Self {
        VALIDATE size >= 1MB AND size <= 4000MB
        self.chunk_size = size
        RETURN self
    }

    FUNCTION with_simulation(mut self, mode: SimulationMode) -> Self {
        self.simulation_mode = mode
        RETURN self
    }

    FUNCTION from_env() -> Result<Self, ConfigError> {
        account_name = ENV("AZURE_STORAGE_ACCOUNT")?
        container = ENV("AZURE_STORAGE_CONTAINER").ok()

        RETURN Self::new(account_name)
            .with_container(container)
            .with_auth(AuthConfig::from_env()?)
    }

    FUNCTION build(self) -> Result<BlobStorageConfig, ConfigError> {
        VALIDATE self.account_name NOT empty
        RETURN Ok(BlobStorageConfig { ...self })
    }
}
```

---

## 3. Client Core

### 3.1 Client Structure

```rust
STRUCT BlobStorageClient {
    config: Arc<BlobStorageConfig>,
    http_client: Arc<HttpClient>,
    auth_provider: Arc<dyn AuthProvider>,
    simulation: Arc<SimulationLayer>,
    uploader: Arc<BlobUploader>,
    downloader: Arc<BlobDownloader>,
}

IMPL BlobStorageClient {
    ASYNC FUNCTION new(config: BlobStorageConfig) -> Result<Self, BlobStorageError> {
        // Initialize HTTP client with retry policy
        http_client = HttpClient::builder()
            .timeout(config.timeout)
            .pool_max_idle_per_host(config.max_concurrency)
            .build()?

        // Initialize auth provider from shared primitive
        auth_provider = create_auth_provider(&config.auth)?

        // Initialize simulation layer
        simulation = SimulationLayer::new(config.simulation_mode.clone())

        // Initialize sub-components
        uploader = BlobUploader::new(config.chunk_size, config.max_concurrency)
        downloader = BlobDownloader::new(config.chunk_size, config.max_concurrency)

        RETURN Ok(Self {
            config: Arc::new(config),
            http_client: Arc::new(http_client),
            auth_provider: Arc::new(auth_provider),
            simulation: Arc::new(simulation),
            uploader: Arc::new(uploader),
            downloader: Arc::new(downloader),
        })
    }

    FUNCTION endpoint(&self) -> String {
        IF let Some(endpoint) = &self.config.endpoint {
            RETURN endpoint.clone()
        }
        RETURN format!("https://{}.blob.core.windows.net", self.config.account_name)
    }

    ASYNC FUNCTION execute_request<T>(&self, request: Request) -> Result<T, BlobStorageError> {
        // Check simulation mode first
        IF self.simulation.is_replay() {
            RETURN self.simulation.replay(&request).await
        }

        // Add authentication header
        token = self.auth_provider.get_token().await?
        request.headers.insert("Authorization", format!("Bearer {}", token))

        // Add client request ID for correlation
        request_id = generate_uuid()
        request.headers.insert("x-ms-client-request-id", request_id)

        // Execute with retry
        response = self.execute_with_retry(request).await?

        // Record if in recording mode
        IF self.simulation.is_recording() {
            self.simulation.record(&request, &response).await?
        }

        RETURN parse_response(response)
    }

    ASYNC FUNCTION execute_with_retry(&self, request: Request) -> Result<Response, BlobStorageError> {
        retry_count = 0
        backoff = self.config.retry.initial_backoff

        LOOP {
            response = self.http_client.execute(request.clone()).await

            MATCH response {
                Ok(resp) IF resp.status.is_success() => RETURN Ok(resp),
                Ok(resp) IF is_retryable_status(resp.status) => {
                    IF retry_count >= self.config.retry.max_retries {
                        RETURN Err(BlobStorageError::from_response(resp))
                    }
                },
                Ok(resp) => RETURN Err(BlobStorageError::from_response(resp)),
                Err(e) IF e.is_transient() => {
                    IF retry_count >= self.config.retry.max_retries {
                        RETURN Err(BlobStorageError::Network(e))
                    }
                },
                Err(e) => RETURN Err(BlobStorageError::Network(e)),
            }

            retry_count += 1
            sleep(backoff).await
            backoff = min(backoff * self.config.retry.backoff_multiplier,
                         self.config.retry.max_backoff)
        }
    }
}

FUNCTION is_retryable_status(status: StatusCode) -> bool {
    RETURN status == 408  // Request Timeout
        OR status == 429  // Too Many Requests
        OR status == 500  // Internal Server Error
        OR status == 502  // Bad Gateway
        OR status == 503  // Service Unavailable
        OR status == 504  // Gateway Timeout
}
```

---

## 4. Upload Operations

### 4.1 Simple Upload

```rust
IMPL BlobStorageClient {
    ASYNC FUNCTION upload(&self, request: UploadRequest) -> Result<UploadResponse, BlobStorageError> {
        container = request.container.or(self.config.default_container)?

        // Validate request
        VALIDATE request.blob_name.len() <= 1024
        VALIDATE request.data.len() <= 256 * 1024 * 1024  // 256MB limit for simple upload

        // Build URL
        url = format!("{}/{}/{}", self.endpoint(), container, request.blob_name)

        // Build headers
        headers = Headers::new()
        headers.insert("x-ms-blob-type", "BlockBlob")
        headers.insert("Content-Length", request.data.len())

        IF let Some(content_type) = request.content_type {
            headers.insert("Content-Type", content_type)
        }

        IF let Some(tier) = request.access_tier {
            headers.insert("x-ms-access-tier", tier.to_string())
        }

        // Add metadata headers
        FOR (key, value) IN request.metadata {
            headers.insert(format!("x-ms-meta-{}", key), value)
        }

        // Calculate content MD5
        md5 = base64_encode(md5_hash(&request.data))
        headers.insert("Content-MD5", md5)

        // Conditional headers
        IF !request.overwrite {
            headers.insert("If-None-Match", "*")
        }

        // Execute request
        http_request = Request::put(url)
            .headers(headers)
            .body(request.data)
            .build()

        response = self.execute_request(http_request).await?

        RETURN UploadResponse {
            etag: response.headers.get("ETag"),
            version_id: response.headers.get("x-ms-version-id"),
            last_modified: parse_datetime(response.headers.get("Last-Modified")),
            content_md5: md5,
        }
    }
}
```

### 4.2 Chunked Upload

```rust
STRUCT BlobUploader {
    chunk_size: usize,
    max_concurrency: usize,
}

IMPL BlobStorageClient {
    ASYNC FUNCTION upload_stream(&self, request: StreamUploadRequest) -> Result<UploadResponse, BlobStorageError> {
        container = request.container.or(self.config.default_container)?

        // Initialize block list
        block_list = Vec::new()
        block_index = 0

        // Create semaphore for concurrency control
        semaphore = Semaphore::new(self.config.max_concurrency)

        // Track upload progress
        total_bytes = 0
        upload_tasks = Vec::new()

        // Read and upload chunks
        WHILE let Some(chunk) = request.stream.next().await {
            chunk_data = chunk?
            block_id = generate_block_id(block_index)
            block_list.push(block_id.clone())

            // Acquire semaphore permit
            permit = semaphore.acquire().await

            // Spawn upload task
            task = spawn(async move {
                result = self.upload_block(
                    container,
                    request.blob_name,
                    block_id,
                    chunk_data,
                ).await
                drop(permit)
                result
            })
            upload_tasks.push(task)

            block_index += 1
            total_bytes += chunk_data.len()

            // Report progress
            IF let Some(callback) = &request.progress_callback {
                callback(total_bytes, None)
            }
        }

        // Wait for all uploads to complete
        FOR task IN upload_tasks {
            task.await??
        }

        // Commit block list
        response = self.commit_block_list(container, request.blob_name, block_list, request.metadata).await?

        RETURN response
    }

    ASYNC FUNCTION upload_block(&self, container: &str, blob: &str, block_id: &str, data: Bytes) -> Result<(), BlobStorageError> {
        url = format!("{}/{}/{}?comp=block&blockid={}",
                      self.endpoint(), container, blob, base64_encode(block_id))

        headers = Headers::new()
        headers.insert("Content-Length", data.len())
        headers.insert("Content-MD5", base64_encode(md5_hash(&data)))

        request = Request::put(url)
            .headers(headers)
            .body(data)
            .build()

        self.execute_request::<()>(request).await
    }

    ASYNC FUNCTION commit_block_list(&self, container: &str, blob: &str, blocks: Vec<String>, metadata: Option<HashMap<String, String>>) -> Result<UploadResponse, BlobStorageError> {
        url = format!("{}/{}/{}?comp=blocklist", self.endpoint(), container, blob)

        // Build block list XML
        xml = build_block_list_xml(blocks)

        headers = Headers::new()
        headers.insert("Content-Type", "application/xml")
        headers.insert("Content-Length", xml.len())

        IF let Some(meta) = metadata {
            FOR (key, value) IN meta {
                headers.insert(format!("x-ms-meta-{}", key), value)
            }
        }

        request = Request::put(url)
            .headers(headers)
            .body(xml)
            .build()

        response = self.execute_request(request).await?

        RETURN UploadResponse {
            etag: response.headers.get("ETag"),
            version_id: response.headers.get("x-ms-version-id"),
            last_modified: parse_datetime(response.headers.get("Last-Modified")),
            content_md5: None,
        }
    }
}

FUNCTION generate_block_id(index: usize) -> String {
    // Block IDs must be same length, base64 encoded
    RETURN format!("block-{:010}", index)
}

FUNCTION build_block_list_xml(blocks: Vec<String>) -> String {
    xml = "<?xml version=\"1.0\" encoding=\"utf-8\"?><BlockList>"
    FOR block_id IN blocks {
        xml += format!("<Latest>{}</Latest>", base64_encode(block_id))
    }
    xml += "</BlockList>"
    RETURN xml
}
```

### 4.3 Append Upload

```rust
IMPL BlobStorageClient {
    ASYNC FUNCTION append(&self, request: AppendRequest) -> Result<AppendResponse, BlobStorageError> {
        container = request.container.or(self.config.default_container)?

        // Check if blob exists, create if not
        IF request.create_if_not_exists {
            exists = self.blob_exists(container, request.blob_name).await?
            IF !exists {
                self.create_append_blob(container, request.blob_name).await?
            }
        }

        // Append block
        url = format!("{}/{}/{}?comp=appendblock",
                      self.endpoint(), container, request.blob_name)

        headers = Headers::new()
        headers.insert("Content-Length", request.data.len())
        headers.insert("Content-MD5", base64_encode(md5_hash(&request.data)))

        // Conditional append (for concurrency control)
        IF let Some(position) = request.append_position {
            headers.insert("x-ms-blob-condition-appendpos", position)
        }

        http_request = Request::put(url)
            .headers(headers)
            .body(request.data)
            .build()

        response = self.execute_request(http_request).await?

        RETURN AppendResponse {
            etag: response.headers.get("ETag"),
            append_offset: parse_i64(response.headers.get("x-ms-blob-append-offset")),
            committed_block_count: parse_i32(response.headers.get("x-ms-blob-committed-block-count")),
        }
    }

    ASYNC FUNCTION create_append_blob(&self, container: &str, blob: &str) -> Result<(), BlobStorageError> {
        url = format!("{}/{}/{}", self.endpoint(), container, blob)

        headers = Headers::new()
        headers.insert("x-ms-blob-type", "AppendBlob")
        headers.insert("Content-Length", "0")

        request = Request::put(url)
            .headers(headers)
            .build()

        self.execute_request::<()>(request).await
    }
}
```

---

## 5. Download Operations

### 5.1 Simple Download

```rust
IMPL BlobStorageClient {
    ASYNC FUNCTION download(&self, request: DownloadRequest) -> Result<DownloadResponse, BlobStorageError> {
        container = request.container.or(self.config.default_container)?

        // Build URL with optional version
        url = format!("{}/{}/{}", self.endpoint(), container, request.blob_name)
        IF let Some(version_id) = request.version_id {
            url = format!("{}?versionId={}", url, version_id)
        }

        headers = Headers::new()

        // Conditional download
        IF let Some(etag) = request.if_match {
            headers.insert("If-Match", etag)
        }

        http_request = Request::get(url)
            .headers(headers)
            .build()

        response = self.execute_request(http_request).await?

        RETURN DownloadResponse {
            data: response.body,
            properties: BlobProperties {
                etag: response.headers.get("ETag"),
                last_modified: parse_datetime(response.headers.get("Last-Modified")),
                content_length: parse_u64(response.headers.get("Content-Length")),
                content_type: response.headers.get("Content-Type"),
                content_md5: response.headers.get("Content-MD5"),
                access_tier: parse_access_tier(response.headers.get("x-ms-access-tier")),
            },
            metadata: extract_metadata(&response.headers),
        }
    }
}

FUNCTION extract_metadata(headers: &Headers) -> HashMap<String, String> {
    metadata = HashMap::new()
    FOR (key, value) IN headers {
        IF key.starts_with("x-ms-meta-") {
            meta_key = key.strip_prefix("x-ms-meta-")
            metadata.insert(meta_key, value)
        }
    }
    RETURN metadata
}
```

### 5.2 Streaming Download

```rust
IMPL BlobStorageClient {
    ASYNC FUNCTION download_stream(&self, request: StreamDownloadRequest) -> Result<impl Stream<Item = Result<Bytes, BlobStorageError>>, BlobStorageError> {
        container = request.container.or(self.config.default_container)?

        // Get blob properties to determine size
        properties = self.get_properties(container, request.blob_name).await?
        total_size = properties.content_length

        // Calculate ranges for parallel download
        chunk_size = request.chunk_size.unwrap_or(self.config.chunk_size)
        ranges = calculate_ranges(total_size, chunk_size)

        // Create channel for ordered output
        (tx, rx) = channel(self.config.max_concurrency)

        // Spawn download tasks
        semaphore = Semaphore::new(self.config.max_concurrency)

        FOR (index, range) IN ranges.enumerate() {
            permit = semaphore.acquire().await
            tx_clone = tx.clone()

            spawn(async move {
                result = self.download_range(container, request.blob_name, range).await
                tx_clone.send((index, result)).await
                drop(permit)
            })
        }
        drop(tx)

        // Create ordered output stream
        RETURN create_ordered_stream(rx, ranges.len())
    }

    ASYNC FUNCTION download_range(&self, container: &str, blob: &str, range: Range) -> Result<Bytes, BlobStorageError> {
        url = format!("{}/{}/{}", self.endpoint(), container, blob)

        headers = Headers::new()
        headers.insert("Range", format!("bytes={}-{}", range.start, range.end))

        request = Request::get(url)
            .headers(headers)
            .build()

        response = self.execute_request(request).await?

        // Verify partial content response
        VALIDATE response.status == 206

        RETURN response.body
    }
}

FUNCTION calculate_ranges(total_size: u64, chunk_size: usize) -> Vec<Range> {
    ranges = Vec::new()
    start = 0

    WHILE start < total_size {
        end = min(start + chunk_size as u64 - 1, total_size - 1)
        ranges.push(Range { start, end })
        start = end + 1
    }

    RETURN ranges
}
```

---

## 6. Blob Management

### 6.1 List Blobs

```rust
IMPL BlobStorageClient {
    ASYNC FUNCTION list(&self, request: ListRequest) -> Result<ListResponse, BlobStorageError> {
        container = request.container.or(self.config.default_container)?

        // Build query parameters
        params = Vec::new()
        params.push(("restype", "container"))
        params.push(("comp", "list"))

        IF let Some(prefix) = request.prefix {
            params.push(("prefix", prefix))
        }
        IF let Some(delimiter) = request.delimiter {
            params.push(("delimiter", delimiter))
        }
        IF let Some(marker) = request.continuation_token {
            params.push(("marker", marker))
        }
        IF let Some(max) = request.max_results {
            params.push(("maxresults", max.to_string()))
        }

        // Include options
        include = Vec::new()
        IF request.include_metadata { include.push("metadata") }
        IF request.include_versions { include.push("versions") }
        IF request.include_deleted { include.push("deleted") }
        IF !include.is_empty() {
            params.push(("include", include.join(",")))
        }

        url = format!("{}/{}?{}", self.endpoint(), container, encode_params(params))

        http_request = Request::get(url).build()
        response = self.execute_request(http_request).await?

        // Parse XML response
        parsed = parse_list_blobs_xml(response.body)?

        RETURN ListResponse {
            blobs: parsed.blobs,
            prefixes: parsed.prefixes,  // Virtual directories
            continuation_token: parsed.next_marker,
            has_more: parsed.next_marker.is_some(),
        }
    }

    // Convenience method for paginated listing
    FUNCTION list_all(&self, request: ListRequest) -> impl Stream<Item = Result<BlobItem, BlobStorageError>> {
        RETURN stream! {
            continuation = None

            LOOP {
                req = request.clone().with_continuation(continuation)
                response = self.list(req).await?

                FOR blob IN response.blobs {
                    yield Ok(blob)
                }

                IF let Some(token) = response.continuation_token {
                    continuation = Some(token)
                } ELSE {
                    BREAK
                }
            }
        }
    }
}
```

### 6.2 Delete Operations

```rust
IMPL BlobStorageClient {
    ASYNC FUNCTION delete(&self, request: DeleteRequest) -> Result<(), BlobStorageError> {
        container = request.container.or(self.config.default_container)?

        url = format!("{}/{}/{}", self.endpoint(), container, request.blob_name)

        IF let Some(version_id) = request.version_id {
            url = format!("{}?versionId={}", url, version_id)
        }

        headers = Headers::new()

        // Delete snapshots option
        MATCH request.delete_snapshots {
            DeleteSnapshotsOption::Include => headers.insert("x-ms-delete-snapshots", "include"),
            DeleteSnapshotsOption::Only => headers.insert("x-ms-delete-snapshots", "only"),
            DeleteSnapshotsOption::None => {},
        }

        http_request = Request::delete(url)
            .headers(headers)
            .build()

        self.execute_request::<()>(http_request).await
    }

    ASYNC FUNCTION delete_batch(&self, container: &str, blobs: Vec<String>) -> Result<BatchDeleteResponse, BlobStorageError> {
        // Azure supports batch operations via multipart request
        boundary = generate_boundary()

        body = build_batch_delete_body(container, blobs, boundary)

        url = format!("{}/?comp=batch", self.endpoint())

        headers = Headers::new()
        headers.insert("Content-Type", format!("multipart/mixed; boundary={}", boundary))

        request = Request::post(url)
            .headers(headers)
            .body(body)
            .build()

        response = self.execute_request(request).await?

        RETURN parse_batch_response(response.body)
    }
}
```

### 6.3 Copy Operations

```rust
IMPL BlobStorageClient {
    ASYNC FUNCTION copy(&self, request: CopyRequest) -> Result<CopyResponse, BlobStorageError> {
        dest_container = request.dest_container.or(self.config.default_container)?

        url = format!("{}/{}/{}", self.endpoint(), dest_container, request.dest_blob)

        headers = Headers::new()
        headers.insert("x-ms-copy-source", request.source_url)

        IF let Some(tier) = request.access_tier {
            headers.insert("x-ms-access-tier", tier.to_string())
        }

        // Metadata for destination
        IF let Some(meta) = request.metadata {
            FOR (key, value) IN meta {
                headers.insert(format!("x-ms-meta-{}", key), value)
            }
        }

        http_request = Request::put(url)
            .headers(headers)
            .build()

        response = self.execute_request(http_request).await?

        copy_id = response.headers.get("x-ms-copy-id")
        copy_status = response.headers.get("x-ms-copy-status")

        // If async copy, poll for completion if requested
        IF copy_status == "pending" AND request.wait_for_completion {
            RETURN self.wait_for_copy(dest_container, request.dest_blob, copy_id).await
        }

        RETURN CopyResponse {
            copy_id,
            copy_status: parse_copy_status(copy_status),
            etag: response.headers.get("ETag"),
        }
    }

    ASYNC FUNCTION wait_for_copy(&self, container: &str, blob: &str, copy_id: &str) -> Result<CopyResponse, BlobStorageError> {
        LOOP {
            properties = self.get_properties(container, blob).await?

            MATCH properties.copy_status {
                CopyStatus::Success => RETURN Ok(CopyResponse {
                    copy_id: copy_id.to_string(),
                    copy_status: CopyStatus::Success,
                    etag: properties.etag,
                }),
                CopyStatus::Failed => RETURN Err(BlobStorageError::CopyFailed {
                    copy_id: copy_id.to_string(),
                    message: properties.copy_status_description,
                }),
                CopyStatus::Aborted => RETURN Err(BlobStorageError::CopyAborted {
                    copy_id: copy_id.to_string(),
                }),
                CopyStatus::Pending => {
                    sleep(Duration::from_secs(1)).await
                }
            }
        }
    }
}
```

### 6.4 Properties and Metadata

```rust
IMPL BlobStorageClient {
    ASYNC FUNCTION get_properties(&self, request: PropertiesRequest) -> Result<BlobProperties, BlobStorageError> {
        container = request.container.or(self.config.default_container)?

        url = format!("{}/{}/{}", self.endpoint(), container, request.blob_name)

        IF let Some(version_id) = request.version_id {
            url = format!("{}?versionId={}", url, version_id)
        }

        http_request = Request::head(url).build()
        response = self.execute_request(http_request).await?

        RETURN BlobProperties {
            etag: response.headers.get("ETag"),
            last_modified: parse_datetime(response.headers.get("Last-Modified")),
            content_length: parse_u64(response.headers.get("Content-Length")),
            content_type: response.headers.get("Content-Type"),
            content_encoding: response.headers.get("Content-Encoding"),
            content_md5: response.headers.get("Content-MD5"),
            access_tier: parse_access_tier(response.headers.get("x-ms-access-tier")),
            lease_status: parse_lease_status(response.headers.get("x-ms-lease-status")),
            creation_time: parse_datetime(response.headers.get("x-ms-creation-time")),
            version_id: response.headers.get("x-ms-version-id"),
            is_current_version: parse_bool(response.headers.get("x-ms-is-current-version")),
            metadata: extract_metadata(&response.headers),
        }
    }

    ASYNC FUNCTION set_metadata(&self, request: MetadataRequest) -> Result<(), BlobStorageError> {
        container = request.container.or(self.config.default_container)?

        url = format!("{}/{}/{}?comp=metadata", self.endpoint(), container, request.blob_name)

        headers = Headers::new()
        FOR (key, value) IN request.metadata {
            headers.insert(format!("x-ms-meta-{}", key), value)
        }

        http_request = Request::put(url)
            .headers(headers)
            .build()

        self.execute_request::<()>(http_request).await
    }

    ASYNC FUNCTION set_tier(&self, container: &str, blob: &str, tier: AccessTier) -> Result<(), BlobStorageError> {
        url = format!("{}/{}/{}?comp=tier", self.endpoint(), container, blob)

        headers = Headers::new()
        headers.insert("x-ms-access-tier", tier.to_string())

        request = Request::put(url)
            .headers(headers)
            .build()

        self.execute_request::<()>(request).await
    }
}
```

---

## 7. Versioning

```rust
IMPL BlobStorageClient {
    ASYNC FUNCTION list_versions(&self, request: VersionsRequest) -> Result<Vec<BlobVersion>, BlobStorageError> {
        // List with versions included
        list_request = ListRequest {
            container: request.container,
            prefix: Some(request.blob_name.clone()),
            include_versions: true,
            ..Default::default()
        }

        response = self.list(list_request).await?

        // Filter to exact blob name matches
        versions = response.blobs
            .into_iter()
            .filter(|b| b.name == request.blob_name)
            .map(|b| BlobVersion {
                version_id: b.version_id.unwrap(),
                is_current: b.is_current_version,
                last_modified: b.properties.last_modified,
                content_length: b.properties.content_length,
                access_tier: b.properties.access_tier,
            })
            .collect()

        // Sort by last_modified descending
        versions.sort_by(|a, b| b.last_modified.cmp(&a.last_modified))

        RETURN Ok(versions)
    }

    ASYNC FUNCTION get_version(&self, container: &str, blob: &str, version_id: &str) -> Result<DownloadResponse, BlobStorageError> {
        RETURN self.download(DownloadRequest {
            container: Some(container.to_string()),
            blob_name: blob.to_string(),
            version_id: Some(version_id.to_string()),
            ..Default::default()
        }).await
    }

    ASYNC FUNCTION delete_version(&self, container: &str, blob: &str, version_id: &str) -> Result<(), BlobStorageError> {
        RETURN self.delete(DeleteRequest {
            container: Some(container.to_string()),
            blob_name: blob.to_string(),
            version_id: Some(version_id.to_string()),
            ..Default::default()
        }).await
    }
}
```

---

## 8. Simulation Layer

### 8.1 Simulation Layer Core

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

        // Load recordings if replay mode
        IF let SimulationMode::Replay { path } = &mode {
            storage.load(path).expect("Failed to load recordings")
        }

        RETURN Self {
            mode: RwLock::new(mode),
            recorder: RwLock::new(recorder),
            storage,
        }
    }

    FUNCTION is_recording(&self) -> bool {
        MATCH *self.mode.read() {
            SimulationMode::Recording { .. } => true,
            _ => false,
        }
    }

    FUNCTION is_replay(&self) -> bool {
        MATCH *self.mode.read() {
            SimulationMode::Replay { .. } => true,
            _ => false,
        }
    }

    ASYNC FUNCTION record(&self, request: &Request, response: &Response) -> Result<(), BlobStorageError> {
        interaction = RecordedInteraction {
            timestamp: now(),
            operation: extract_operation(request),
            request: serialize_request(request),
            response: serialize_response(response),
            duration_ms: response.duration.as_millis(),
        }

        self.recorder.write().add(interaction)
        Ok(())
    }

    ASYNC FUNCTION replay<T>(&self, request: &Request) -> Result<T, BlobStorageError> {
        operation = extract_operation(request)
        key = generate_matching_key(request)

        interaction = self.storage.find(operation, key)
            .ok_or(BlobStorageError::SimulationNoMatch {
                operation,
                key,
            })?

        // Simulate timing if configured
        IF self.storage.config.simulate_timing {
            sleep(Duration::from_millis(interaction.duration_ms)).await
        }

        RETURN deserialize_response(&interaction.response)
    }

    ASYNC FUNCTION save(&self) -> Result<(), BlobStorageError> {
        IF let SimulationMode::Recording { path } = &*self.mode.read() {
            recordings = self.recorder.read().get_all()
            self.storage.save(path, recordings)?
        }
        Ok(())
    }
}
```

### 8.2 Recording Storage

```rust
STRUCT SimulationStorage {
    recordings: RwLock<HashMap<String, Vec<RecordedInteraction>>>,
    config: SimulationConfig,
}

STRUCT SimulationConfig {
    simulate_timing: bool,
    matching_mode: MatchingMode,
}

ENUM MatchingMode {
    Exact,           // Match full request
    OperationOnly,   // Match operation + container + blob
    Relaxed,         // Match operation only
}

IMPL SimulationStorage {
    FUNCTION load(&self, path: &Path) -> Result<(), BlobStorageError> {
        content = read_file(path)?
        recordings: SimulationFile = serde_json::from_str(&content)?

        VALIDATE recordings.version == CURRENT_VERSION

        FOR interaction IN recordings.interactions {
            key = generate_storage_key(&interaction)
            self.recordings.write()
                .entry(key)
                .or_default()
                .push(interaction)
        }

        Ok(())
    }

    FUNCTION save(&self, path: &Path, recordings: Vec<RecordedInteraction>) -> Result<(), BlobStorageError> {
        file = SimulationFile {
            version: CURRENT_VERSION,
            created: now(),
            interactions: recordings,
        }

        content = serde_json::to_string_pretty(&file)?
        write_file(path, content)?

        Ok(())
    }

    FUNCTION find(&self, operation: &str, key: &str) -> Option<RecordedInteraction> {
        recordings = self.recordings.read()

        IF let Some(list) = recordings.get(key) {
            // Return first match (or could implement round-robin)
            RETURN list.first().cloned()
        }

        None
    }
}

FUNCTION generate_matching_key(request: &Request) -> String {
    // Key based on operation, container, blob name
    RETURN format!("{}:{}:{}",
                   request.method,
                   extract_container(request.url),
                   extract_blob_name(request.url))
}
```

---

## 9. Error Handling

```rust
ENUM BlobStorageError {
    // Client errors
    BlobNotFound { container: String, blob: String },
    ContainerNotFound { container: String },
    BlobAlreadyExists { container: String, blob: String },

    // Auth errors
    AuthenticationFailed { message: String },
    AuthorizationFailed { message: String, container: String },

    // Server errors
    ServerError { status: u16, message: String, request_id: Option<String> },
    ServiceUnavailable { request_id: Option<String> },

    // Transfer errors
    UploadFailed { blob: String, reason: String },
    DownloadFailed { blob: String, reason: String },
    ChecksumMismatch { expected: String, actual: String },

    // Copy errors
    CopyFailed { copy_id: String, message: String },
    CopyAborted { copy_id: String },

    // Network errors
    NetworkError { source: Box<dyn Error> },
    Timeout { operation: String },

    // Configuration errors
    ConfigurationError { message: String },

    // Simulation errors
    SimulationNoMatch { operation: String, key: String },
    SimulationLoadError { path: PathBuf, source: Box<dyn Error> },
}

IMPL BlobStorageError {
    FUNCTION is_retryable(&self) -> bool {
        MATCH self {
            Self::ServerError { status, .. } => is_retryable_status(*status),
            Self::ServiceUnavailable { .. } => true,
            Self::NetworkError { .. } => true,
            Self::Timeout { .. } => true,
            _ => false,
        }
    }

    FUNCTION from_response(response: Response) -> Self {
        status = response.status
        request_id = response.headers.get("x-ms-request-id")

        MATCH status {
            404 => {
                IF is_container_error(&response) {
                    Self::ContainerNotFound { container: extract_container(&response) }
                } ELSE {
                    Self::BlobNotFound {
                        container: extract_container(&response),
                        blob: extract_blob(&response),
                    }
                }
            },
            401 => Self::AuthenticationFailed { message: parse_error_message(&response) },
            403 => Self::AuthorizationFailed {
                message: parse_error_message(&response),
                container: extract_container(&response),
            },
            409 => Self::BlobAlreadyExists {
                container: extract_container(&response),
                blob: extract_blob(&response),
            },
            503 => Self::ServiceUnavailable { request_id },
            _ => Self::ServerError { status, message: parse_error_message(&response), request_id },
        }
    }
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-AZURE-BLOB-PSEUDO-001 |
| Version | 1.0.0 |
| Created | 2025-12-13 |
| Last Modified | 2025-12-13 |
| Author | SPARC Methodology |
| Status | Draft |

---

**End of Pseudocode Document**

*SPARC Phase 2 Complete - Proceed to Architecture phase with "Next phase."*
