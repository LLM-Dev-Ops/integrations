# SPARC Pseudocode: Google Gemini Integration Module

**Part 3 of 3: Advanced Services (Files, Cached Content, Error Handling)**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/gemini`

---

## Table of Contents

1. [Files Service](#1-files-service)
2. [Cached Content Service](#2-cached-content-service)
3. [Error Handling](#3-error-handling)
4. [Observability](#4-observability)
5. [Testing Support](#5-testing-support)
6. [TypeScript Implementation Notes](#6-typescript-implementation-notes)

---

## 1. Files Service

### 1.1 FilesService Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FILES SERVICE                                         │
├─────────────────────────────────────────────────────────────────────────────┤

[INTERFACE]
STRUCTURE FilesService:
    base: BaseService
    upload_base_url: Url                  // Different from API base URL

[TEST:unit]
FUNCTION FilesService::new(
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthProvider>,
    resilience: Arc<ResilienceOrchestrator>,
    config: GeminiConfig,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
    metrics: Arc<dyn MetricsRecorder>
) -> Self:
    // Upload uses a different base URL
    LET upload_base_url = Url::parse("https://generativelanguage.googleapis.com/upload")
        .expect("Invalid upload base URL")

    RETURN FilesService {
        base: BaseService::new(transport, auth_manager, resilience, config, logger, tracer, metrics),
        upload_base_url
    }

└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Upload File

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        UPLOAD FILE                                          │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION FilesService::upload(
    &self,
    request: UploadFileRequest
) -> Result<UploadFileResponse, GeminiError>:

    // 1. Validate request
    Self::validate_upload_request(&request)?

    // 2. Determine MIME type
    LET mime_type = request.mime_type
        .or_else(|| guess_mime_type(&request.file_path))
        .ok_or(GeminiError::RequestError {
            kind: RequestErrorKind::ValidationError,
            message: "Could not determine MIME type",
            param: Some("mime_type".to_string())
        })?

    // 3. Read file content
    LET file_content = read_file(&request.file_path)?

    // 4. Validate file size (2GB limit for Gemini)
    CONST MAX_FILE_SIZE: usize = 2 * 1024 * 1024 * 1024  // 2 GB
    IF file_content.len() > MAX_FILE_SIZE THEN:
        RETURN Err(GeminiError::RequestError {
            kind: RequestErrorKind::PayloadTooLarge,
            message: format!("File size {} exceeds maximum of 2GB", file_content.len()),
            param: Some("file".to_string())
        })

    // 5. Create request context
    LET context = RequestContext::new()
        .with_operation("uploadFile")
        .with_attribute("mime_type", &mime_type)
        .with_attribute("file_size", file_content.len())

    // 6. Start trace span
    LET span = self.base.tracer.start_span("gemini.file.upload", &context)

    // 7. Build multipart form
    LET form = MultipartForm::new()
        .add_json_part("metadata", &FileMetadata {
            display_name: request.display_name.clone()
        })
        .add_file_part("file", &file_content, &mime_type)

    // 8. Build upload URL (uses different endpoint)
    LET upload_path = format!("/{}/files", self.base.config.api_version)

    // 9. Build multipart request
    LET http_request = self.base.request_builder.build_multipart_request(
        &upload_path,
        form
    )?

    // Override base URL for upload
    LET mut upload_request = http_request.clone()
    upload_request.url = self.upload_base_url.join(&upload_path)?

    // 10. Execute with resilience
    LET start_time = Instant::now()

    LET response = AWAIT self.base.resilience.execute(
        || async {
            AWAIT self.base.transport.send(upload_request.clone())
                .map_err(|e| GeminiError::from(e))
        },
        &context
    )?

    // 11. Parse response
    LET upload_response: UploadFileResponse = ResponseParser::parse_response(&response)?

    // 12. Record metrics
    LET latency = start_time.elapsed()
    self.base.metrics.record_histogram("gemini.file.upload.duration_ms", latency.as_millis(), &[
        ("mime_type", &mime_type)
    ])
    self.base.metrics.record_histogram("gemini.file.upload.size_bytes", file_content.len(), &[
        ("mime_type", &mime_type)
    ])

    span.set_attribute("file_name", &upload_response.file.name)
    span.end()

    self.base.logger.info("File uploaded", {
        name: &upload_response.file.name,
        display_name: &upload_response.file.display_name,
        size_bytes: file_content.len(),
        mime_type: &mime_type,
        latency_ms: latency.as_millis()
    })

    RETURN Ok(upload_response)

[TEST:unit]
FUNCTION FilesService::validate_upload_request(
    request: &UploadFileRequest
) -> Result<(), GeminiError>:
    // Validate file path exists
    IF NOT file_exists(&request.file_path) THEN:
        RETURN Err(GeminiError::RequestError {
            kind: RequestErrorKind::ValidationError,
            message: format!("File not found: {}", request.file_path),
            param: Some("file_path".to_string())
        })

    // Validate display name if provided
    IF LET Some(ref name) = request.display_name:
        IF name.len() > 512 THEN:
            RETURN Err(GeminiError::RequestError {
                kind: RequestErrorKind::ValidationError,
                message: "Display name cannot exceed 512 characters",
                param: Some("display_name".to_string())
            })

    RETURN Ok(())

└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Upload File from Bytes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    UPLOAD FILE FROM BYTES                                   │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION FilesService::upload_bytes(
    &self,
    content: Bytes,
    mime_type: &str,
    display_name: Option<String>
) -> Result<UploadFileResponse, GeminiError>:

    // 1. Validate MIME type
    IF NOT is_supported_file_mime_type(mime_type) THEN:
        RETURN Err(GeminiError::RequestError {
            kind: RequestErrorKind::UnsupportedMediaType,
            message: format!("Unsupported MIME type: {}", mime_type),
            param: Some("mime_type".to_string())
        })

    // 2. Validate size
    CONST MAX_FILE_SIZE: usize = 2 * 1024 * 1024 * 1024
    IF content.len() > MAX_FILE_SIZE THEN:
        RETURN Err(GeminiError::RequestError {
            kind: RequestErrorKind::PayloadTooLarge,
            message: format!("Content size {} exceeds maximum of 2GB", content.len()),
            param: None
        })

    // 3. Create request context
    LET context = RequestContext::new()
        .with_operation("uploadFileBytes")
        .with_attribute("mime_type", mime_type)
        .with_attribute("size", content.len())

    // 4. Build multipart form
    LET form = MultipartForm::new()
        .add_json_part("metadata", &FileMetadata {
            display_name: display_name
        })
        .add_bytes_part("file", &content, mime_type)

    // 5. Build and execute request (same as upload)
    LET upload_path = format!("/{}/files", self.base.config.api_version)
    LET http_request = self.base.request_builder.build_multipart_request(
        &upload_path,
        form
    )?

    LET mut upload_request = http_request.clone()
    upload_request.url = self.upload_base_url.join(&upload_path)?

    LET response = AWAIT self.base.resilience.execute(
        || async {
            AWAIT self.base.transport.send(upload_request.clone())
                .map_err(|e| GeminiError::from(e))
        },
        &context
    )?

    LET upload_response: UploadFileResponse = ResponseParser::parse_response(&response)?

    self.base.logger.info("File bytes uploaded", {
        name: &upload_response.file.name,
        size_bytes: content.len(),
        mime_type: mime_type
    })

    RETURN Ok(upload_response)

└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.4 Get File

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          GET FILE                                           │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION FilesService::get(
    &self,
    name: &str
) -> Result<File, GeminiError>:

    // 1. Normalize file name
    LET normalized_name = IF name.starts_with("files/") THEN:
        name.to_string()
    ELSE:
        format!("files/{}", name)

    // 2. Build path
    LET path = endpoints::file(&normalized_name)

    // 3. Create request context
    LET context = RequestContext::new()
        .with_operation("getFile")
        .with_attribute("file_name", &normalized_name)

    // 4. Execute request
    LET file: File = AWAIT self.base.execute_request(
        HttpMethod::GET,
        &path,
        None::<&()>,
        &context
    )?

    self.base.logger.debug("File retrieved", {
        name: &file.name,
        state: &file.state
    })

    RETURN Ok(file)

└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.5 List Files

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LIST FILES                                          │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION FilesService::list(
    &self,
    request: ListFilesRequest
) -> Result<ListFilesResponse, GeminiError>:

    // Build path with pagination
    LET mut path = endpoints::FILES.to_string()

    LET mut params = Vec::new()
    IF LET Some(page_size) = request.page_size:
        params.push(format!("pageSize={}", page_size))
    IF LET Some(ref page_token) = request.page_token:
        params.push(format!("pageToken={}", page_token))

    IF NOT params.is_empty() THEN:
        path = format!("{}?{}", path, params.join("&"))

    // Create request context
    LET context = RequestContext::new()
        .with_operation("listFiles")

    // Execute request
    LET response: ListFilesResponse = AWAIT self.base.execute_request(
        HttpMethod::GET,
        &path,
        None::<&()>,
        &context
    )?

    self.base.logger.info("Listed files", {
        count: response.files.len(),
        has_next_page: response.next_page_token.is_some()
    })

    RETURN Ok(response)

└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.6 Delete File

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DELETE FILE                                          │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION FilesService::delete(
    &self,
    name: &str
) -> Result<(), GeminiError>:

    // 1. Normalize file name
    LET normalized_name = IF name.starts_with("files/") THEN:
        name.to_string()
    ELSE:
        format!("files/{}", name)

    // 2. Build path
    LET path = endpoints::file(&normalized_name)

    // 3. Create request context
    LET context = RequestContext::new()
        .with_operation("deleteFile")
        .with_attribute("file_name", &normalized_name)

    // 4. Execute request (expects empty response)
    AWAIT self.base.execute_request::<EmptyResponse>(
        HttpMethod::DELETE,
        &path,
        None::<&()>,
        &context
    )?

    self.base.logger.info("File deleted", {
        name: &normalized_name
    })

    RETURN Ok(())

└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.7 Wait for File Processing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  WAIT FOR FILE PROCESSING                                   │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit]
FUNCTION FilesService::wait_for_active(
    &self,
    name: &str,
    timeout: Duration,
    poll_interval: Duration
) -> Result<File, GeminiError>:

    LET start = Instant::now()

    LOOP:
        // Check timeout
        IF start.elapsed() > timeout THEN:
            RETURN Err(GeminiError::TimeoutError {
                message: format!("File {} did not become active within {:?}", name, timeout),
                duration: timeout
            })

        // Get current file state
        LET file = AWAIT self.get(name)?

        MATCH file.state.as_str():
            "ACTIVE" => {
                self.base.logger.info("File is active", { name: name })
                RETURN Ok(file)
            },
            "PROCESSING" => {
                self.base.logger.debug("File still processing", {
                    name: name,
                    elapsed: start.elapsed().as_secs()
                })
                AWAIT sleep(poll_interval)
            },
            "FAILED" => {
                RETURN Err(GeminiError::ResourceError {
                    kind: ResourceErrorKind::ProcessingFailed,
                    message: format!("File processing failed: {}", file.error.unwrap_or_default()),
                    resource: Some(name.to_string())
                })
            },
            unknown => {
                RETURN Err(GeminiError::ResponseError {
                    kind: ResponseErrorKind::UnexpectedFormat,
                    message: format!("Unknown file state: {}", unknown),
                    body_preview: None
                })
            }

└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.8 Files Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FILES TYPES                                         │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE UploadFileRequest:
    file_path: String
    mime_type: Option<String>
    display_name: Option<String>

STRUCTURE FileMetadata:
    display_name: Option<String>

STRUCTURE UploadFileResponse:
    file: File

STRUCTURE File:
    name: String                          // e.g., "files/abc123"
    display_name: Option<String>
    mime_type: String
    size_bytes: String                    // String for large files
    create_time: String                   // RFC3339 timestamp
    update_time: String
    expiration_time: Option<String>       // Files expire after 48 hours
    sha256_hash: String                   // Base64 encoded
    uri: String                           // URI for content generation
    state: String                         // "PROCESSING", "ACTIVE", "FAILED"
    error: Option<String>                 // Error message if FAILED

STRUCTURE ListFilesRequest:
    page_size: Option<i32>
    page_token: Option<String>

STRUCTURE ListFilesResponse:
    files: Vec<File>
    next_page_token: Option<String>

STRUCTURE EmptyResponse {}

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Cached Content Service

### 2.1 CachedContentService Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   CACHED CONTENT SERVICE                                    │
├─────────────────────────────────────────────────────────────────────────────┤

[INTERFACE]
STRUCTURE CachedContentService:
    base: BaseService

[TEST:unit]
FUNCTION CachedContentService::new(
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthProvider>,
    resilience: Arc<ResilienceOrchestrator>,
    config: GeminiConfig,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
    metrics: Arc<dyn MetricsRecorder>
) -> Self:
    RETURN CachedContentService {
        base: BaseService::new(transport, auth_manager, resilience, config, logger, tracer, metrics)
    }

└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Create Cached Content

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   CREATE CACHED CONTENT                                     │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION CachedContentService::create(
    &self,
    request: CreateCachedContentRequest
) -> Result<CachedContent, GeminiError>:

    // 1. Validate request
    Self::validate_create_request(&request)?

    // 2. Build path
    LET path = endpoints::CACHED_CONTENTS

    // 3. Build request body
    LET request_body = CreateCachedContentRequestBody {
        model: request.model,
        contents: request.contents,
        system_instruction: request.system_instruction,
        tools: request.tools,
        tool_config: request.tool_config,
        expire_time: request.expire_time,
        ttl: request.ttl,
        display_name: request.display_name
    }

    // 4. Create request context
    LET context = RequestContext::new()
        .with_operation("createCachedContent")
        .with_model(&request_body.model)

    // 5. Execute request
    LET cached_content: CachedContent = AWAIT self.base.execute_request(
        HttpMethod::POST,
        path,
        Some(&request_body),
        &context
    )?

    self.base.logger.info("Cached content created", {
        name: &cached_content.name,
        model: &cached_content.model,
        usage_metadata: &cached_content.usage_metadata
    })

    RETURN Ok(cached_content)

[TEST:unit]
FUNCTION CachedContentService::validate_create_request(
    request: &CreateCachedContentRequest
) -> Result<(), GeminiError>:
    // Model is required
    IF request.model.is_empty() THEN:
        RETURN Err(GeminiError::RequestError {
            kind: RequestErrorKind::ValidationError,
            message: "Model is required for cached content",
            param: Some("model".to_string())
        })

    // Contents is required
    IF request.contents.is_empty() THEN:
        RETURN Err(GeminiError::RequestError {
            kind: RequestErrorKind::ValidationError,
            message: "At least one content item is required",
            param: Some("contents".to_string())
        })

    // Either expire_time or ttl must be set
    IF request.expire_time.is_none() AND request.ttl.is_none() THEN:
        RETURN Err(GeminiError::RequestError {
            kind: RequestErrorKind::ValidationError,
            message: "Either expire_time or ttl must be specified",
            param: Some("expire_time".to_string())
        })

    // Can't set both expire_time and ttl
    IF request.expire_time.is_some() AND request.ttl.is_some() THEN:
        RETURN Err(GeminiError::RequestError {
            kind: RequestErrorKind::ValidationError,
            message: "Cannot specify both expire_time and ttl",
            param: Some("ttl".to_string())
        })

    // Validate TTL range (minimum 1 minute, maximum 1 hour for now)
    IF LET Some(ref ttl) = request.ttl:
        LET duration = parse_duration(ttl)?
        IF duration < Duration::from_secs(60) THEN:
            RETURN Err(GeminiError::RequestError {
                kind: RequestErrorKind::ValidationError,
                message: "TTL must be at least 1 minute",
                param: Some("ttl".to_string())
            })

    RETURN Ok(())

└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Get Cached Content

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GET CACHED CONTENT                                       │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION CachedContentService::get(
    &self,
    name: &str
) -> Result<CachedContent, GeminiError>:

    // 1. Normalize name
    LET normalized_name = IF name.starts_with("cachedContents/") THEN:
        name.to_string()
    ELSE:
        format!("cachedContents/{}", name)

    // 2. Build path
    LET path = endpoints::cached_content(&normalized_name)

    // 3. Create request context
    LET context = RequestContext::new()
        .with_operation("getCachedContent")
        .with_attribute("name", &normalized_name)

    // 4. Execute request
    LET cached_content: CachedContent = AWAIT self.base.execute_request(
        HttpMethod::GET,
        &path,
        None::<&()>,
        &context
    )?

    RETURN Ok(cached_content)

└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 List Cached Contents

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   LIST CACHED CONTENTS                                      │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION CachedContentService::list(
    &self,
    request: ListCachedContentsRequest
) -> Result<ListCachedContentsResponse, GeminiError>:

    // Build path with pagination
    LET mut path = endpoints::CACHED_CONTENTS.to_string()

    LET mut params = Vec::new()
    IF LET Some(page_size) = request.page_size:
        params.push(format!("pageSize={}", page_size))
    IF LET Some(ref page_token) = request.page_token:
        params.push(format!("pageToken={}", page_token))

    IF NOT params.is_empty() THEN:
        path = format!("{}?{}", path, params.join("&"))

    // Create request context
    LET context = RequestContext::new()
        .with_operation("listCachedContents")

    // Execute request
    LET response: ListCachedContentsResponse = AWAIT self.base.execute_request(
        HttpMethod::GET,
        &path,
        None::<&()>,
        &context
    )?

    self.base.logger.info("Listed cached contents", {
        count: response.cached_contents.len(),
        has_next_page: response.next_page_token.is_some()
    })

    RETURN Ok(response)

└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.5 Update Cached Content

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   UPDATE CACHED CONTENT                                     │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION CachedContentService::update(
    &self,
    name: &str,
    request: UpdateCachedContentRequest
) -> Result<CachedContent, GeminiError>:

    // 1. Normalize name
    LET normalized_name = IF name.starts_with("cachedContents/") THEN:
        name.to_string()
    ELSE:
        format!("cachedContents/{}", name)

    // 2. Build path with update mask
    LET mut update_mask_fields = Vec::new()
    IF request.expire_time.is_some() THEN:
        update_mask_fields.push("expireTime")
    IF request.ttl.is_some() THEN:
        update_mask_fields.push("ttl")

    IF update_mask_fields.is_empty() THEN:
        RETURN Err(GeminiError::RequestError {
            kind: RequestErrorKind::ValidationError,
            message: "At least one field must be updated",
            param: None
        })

    LET path = format!(
        "{}?updateMask={}",
        endpoints::cached_content(&normalized_name),
        update_mask_fields.join(",")
    )

    // 3. Build request body
    LET request_body = UpdateCachedContentRequestBody {
        expire_time: request.expire_time,
        ttl: request.ttl
    }

    // 4. Create request context
    LET context = RequestContext::new()
        .with_operation("updateCachedContent")
        .with_attribute("name", &normalized_name)

    // 5. Execute request (PATCH method)
    LET cached_content: CachedContent = AWAIT self.base.execute_request(
        HttpMethod::PATCH,
        &path,
        Some(&request_body),
        &context
    )?

    self.base.logger.info("Cached content updated", {
        name: &cached_content.name,
        expire_time: &cached_content.expire_time
    })

    RETURN Ok(cached_content)

└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.6 Delete Cached Content

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   DELETE CACHED CONTENT                                     │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION CachedContentService::delete(
    &self,
    name: &str
) -> Result<(), GeminiError>:

    // 1. Normalize name
    LET normalized_name = IF name.starts_with("cachedContents/") THEN:
        name.to_string()
    ELSE:
        format!("cachedContents/{}", name)

    // 2. Build path
    LET path = endpoints::cached_content(&normalized_name)

    // 3. Create request context
    LET context = RequestContext::new()
        .with_operation("deleteCachedContent")
        .with_attribute("name", &normalized_name)

    // 4. Execute request
    AWAIT self.base.execute_request::<EmptyResponse>(
        HttpMethod::DELETE,
        &path,
        None::<&()>,
        &context
    )?

    self.base.logger.info("Cached content deleted", {
        name: &normalized_name
    })

    RETURN Ok(())

└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.7 Cached Content Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   CACHED CONTENT TYPES                                      │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE CreateCachedContentRequest:
    model: String                         // Required - e.g., "models/gemini-1.5-pro"
    contents: Vec<Content>                // Required
    system_instruction: Option<Content>
    tools: Option<Vec<Tool>>
    tool_config: Option<ToolConfig>
    expire_time: Option<String>           // RFC3339 timestamp
    ttl: Option<String>                   // Duration string e.g., "3600s"
    display_name: Option<String>

STRUCTURE CreateCachedContentRequestBody:
    model: String
    contents: Vec<Content>
    system_instruction: Option<Content>
    tools: Option<Vec<Tool>>
    tool_config: Option<ToolConfig>
    expire_time: Option<String>
    ttl: Option<String>
    display_name: Option<String>

STRUCTURE CachedContent:
    name: String                          // e.g., "cachedContents/abc123"
    model: String
    create_time: String
    update_time: String
    expire_time: String
    display_name: Option<String>
    usage_metadata: CacheUsageMetadata

STRUCTURE CacheUsageMetadata:
    total_token_count: i32

STRUCTURE ListCachedContentsRequest:
    page_size: Option<i32>
    page_token: Option<String>

STRUCTURE ListCachedContentsResponse:
    cached_contents: Vec<CachedContent>
    next_page_token: Option<String>

STRUCTURE UpdateCachedContentRequest:
    expire_time: Option<String>
    ttl: Option<String>

STRUCTURE UpdateCachedContentRequestBody:
    expire_time: Option<String>
    ttl: Option<String>

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Error Handling

### 3.1 Error Type Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ERROR TYPES                                           │
├─────────────────────────────────────────────────────────────────────────────┤

// Top-level error enum for all Gemini operations
ENUM GeminiError:
    // Configuration errors
    ConfigurationError {
        kind: ConfigurationErrorKind,
        message: String
    }

    // Authentication errors
    AuthenticationError {
        kind: AuthenticationErrorKind,
        message: String
    }

    // Request validation errors
    RequestError {
        kind: RequestErrorKind,
        message: String,
        param: Option<String>
    }

    // Response parsing errors
    ResponseError {
        kind: ResponseErrorKind,
        message: String,
        body_preview: Option<String>
    }

    // Resource errors (not found, already exists, etc.)
    ResourceError {
        kind: ResourceErrorKind,
        message: String,
        resource: Option<String>
    }

    // Rate limiting errors
    RateLimitError {
        kind: RateLimitErrorKind,
        message: String,
        retry_after: Option<Duration>
    }

    // Server errors (5xx)
    ServerError {
        kind: ServerErrorKind,
        message: String,
        request_id: Option<String>
    }

    // Network/transport errors
    NetworkError {
        kind: NetworkErrorKind,
        message: String,
        source: Option<Box<dyn Error>>
    }

    // Content safety blocks
    ContentBlockedError {
        reason: Option<String>,
        safety_ratings: Vec<SafetyRating>
    }

    // Circuit breaker open
    CircuitBreakerOpen {
        message: String
    }

    // Timeout errors
    TimeoutError {
        message: String,
        duration: Duration
    }

└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Error Kind Enums

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ERROR KINDS                                           │
├─────────────────────────────────────────────────────────────────────────────┤

ENUM ConfigurationErrorKind:
    MissingApiKey
    InvalidApiKey
    InvalidBaseUrl
    InvalidConfiguration

ENUM AuthenticationErrorKind:
    InvalidApiKey
    ExpiredApiKey
    QuotaExceeded
    InsufficientPermissions

ENUM RequestErrorKind:
    ValidationError
    InvalidParameter
    PayloadTooLarge
    UnsupportedMediaType
    SerializationError
    MissingRequired

ENUM ResponseErrorKind:
    EmptyResponse
    DeserializationError
    UnexpectedFormat
    StreamInterrupted

ENUM ResourceErrorKind:
    NotFound
    AlreadyExists
    ProcessingFailed
    Expired

ENUM RateLimitErrorKind:
    TooManyRequests
    TokenLimitExceeded
    QuotaExceeded

ENUM ServerErrorKind:
    InternalError
    ServiceUnavailable
    ModelOverloaded
    TemporaryFailure

ENUM NetworkErrorKind:
    ConnectionFailed
    Timeout
    DnsResolutionFailed
    TlsError

└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Error Conversion

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ERROR CONVERSION                                        │
├─────────────────────────────────────────────────────────────────────────────┤

[TEST:unit]
FUNCTION GeminiError::from(transport_error: TransportError) -> GeminiError:
    MATCH transport_error:
        TransportError::ConnectionError { message, source } =>
            GeminiError::NetworkError {
                kind: NetworkErrorKind::ConnectionFailed,
                message,
                source
            },
        TransportError::TimeoutError { message, duration } =>
            GeminiError::TimeoutError { message, duration },
        TransportError::TlsError { message, source } =>
            GeminiError::NetworkError {
                kind: NetworkErrorKind::TlsError,
                message,
                source
            },
        TransportError::ResponseError { status, body } =>
            ResponseParser::parse_error_response(&HttpResponse {
                status,
                headers: HeaderMap::new(),
                body: Bytes::from(body)
            })

[TEST:unit]
FUNCTION GeminiError::error_type(&self) -> &'static str:
    MATCH self:
        GeminiError::ConfigurationError { .. } => "configuration_error",
        GeminiError::AuthenticationError { .. } => "authentication_error",
        GeminiError::RequestError { .. } => "request_error",
        GeminiError::ResponseError { .. } => "response_error",
        GeminiError::ResourceError { .. } => "resource_error",
        GeminiError::RateLimitError { .. } => "rate_limit_error",
        GeminiError::ServerError { .. } => "server_error",
        GeminiError::NetworkError { .. } => "network_error",
        GeminiError::ContentBlockedError { .. } => "content_blocked",
        GeminiError::CircuitBreakerOpen { .. } => "circuit_breaker_open",
        GeminiError::TimeoutError { .. } => "timeout_error"

[TEST:unit]
FUNCTION GeminiError::is_retryable(&self) -> bool:
    MATCH self:
        GeminiError::RateLimitError { .. } => true,
        GeminiError::ServerError { kind: ServerErrorKind::ServiceUnavailable, .. } => true,
        GeminiError::ServerError { kind: ServerErrorKind::ModelOverloaded, .. } => true,
        GeminiError::ServerError { kind: ServerErrorKind::TemporaryFailure, .. } => true,
        GeminiError::NetworkError { kind: NetworkErrorKind::Timeout, .. } => true,
        GeminiError::NetworkError { kind: NetworkErrorKind::ConnectionFailed, .. } => true,
        _ => false

[TEST:unit]
FUNCTION GeminiError::retry_after(&self) -> Option<Duration>:
    MATCH self:
        GeminiError::RateLimitError { retry_after, .. } => *retry_after,
        GeminiError::ServerError { kind: ServerErrorKind::ServiceUnavailable, .. } =>
            Some(Duration::from_secs(30)),
        _ => None

└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Error Display Implementation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ERROR DISPLAY                                           │
├─────────────────────────────────────────────────────────────────────────────┤

IMPL Display FOR GeminiError:
    FUNCTION fmt(&self, f: &mut Formatter) -> fmt::Result:
        MATCH self:
            GeminiError::ConfigurationError { kind, message } =>
                write!(f, "Configuration error ({:?}): {}", kind, message),
            GeminiError::AuthenticationError { kind, message } =>
                write!(f, "Authentication error ({:?}): {}", kind, message),
            GeminiError::RequestError { kind, message, param } => {
                IF LET Some(p) = param:
                    write!(f, "Request error ({:?}) for '{}': {}", kind, p, message)
                ELSE:
                    write!(f, "Request error ({:?}): {}", kind, message)
            },
            GeminiError::ResponseError { kind, message, body_preview } => {
                IF LET Some(preview) = body_preview:
                    write!(f, "Response error ({:?}): {} [body: {}]", kind, message, preview)
                ELSE:
                    write!(f, "Response error ({:?}): {}", kind, message)
            },
            GeminiError::ResourceError { kind, message, resource } => {
                IF LET Some(r) = resource:
                    write!(f, "Resource error ({:?}) for '{}': {}", kind, r, message)
                ELSE:
                    write!(f, "Resource error ({:?}): {}", kind, message)
            },
            GeminiError::RateLimitError { kind, message, retry_after } => {
                IF LET Some(delay) = retry_after:
                    write!(f, "Rate limit ({:?}): {} (retry after {:?})", kind, message, delay)
                ELSE:
                    write!(f, "Rate limit ({:?}): {}", kind, message)
            },
            GeminiError::ServerError { kind, message, request_id } => {
                IF LET Some(id) = request_id:
                    write!(f, "Server error ({:?}) [{}]: {}", kind, id, message)
                ELSE:
                    write!(f, "Server error ({:?}): {}", kind, message)
            },
            GeminiError::NetworkError { kind, message, .. } =>
                write!(f, "Network error ({:?}): {}", kind, message),
            GeminiError::ContentBlockedError { reason, .. } =>
                write!(f, "Content blocked: {}", reason.as_deref().unwrap_or("unknown reason")),
            GeminiError::CircuitBreakerOpen { message } =>
                write!(f, "Circuit breaker open: {}", message),
            GeminiError::TimeoutError { message, duration } =>
                write!(f, "Timeout after {:?}: {}", duration, message)

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Observability

### 4.1 Logging Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LOGGING INTEGRATION                                      │
├─────────────────────────────────────────────────────────────────────────────┤

// Uses integrations-logging primitive

[TRAIT] [INTERFACE]
TRAIT Logger: Send + Sync:
    FUNCTION trace(&self, message: &str, context: &dyn Serialize)
    FUNCTION debug(&self, message: &str, context: &dyn Serialize)
    FUNCTION info(&self, message: &str, context: &dyn Serialize)
    FUNCTION warn(&self, message: &str, context: &dyn Serialize)
    FUNCTION error(&self, message: &str, context: &dyn Serialize)

STRUCTURE DefaultLogger:
    name: String
    level: LogLevel

[TEST:unit]
FUNCTION DefaultLogger::new(name: &str) -> Self:
    RETURN DefaultLogger {
        name: name.to_string(),
        level: LogLevel::Info
    }

IMPL Logger FOR DefaultLogger:
    FUNCTION info(&self, message: &str, context: &dyn Serialize):
        IF self.level <= LogLevel::Info THEN:
            // Delegate to integrations-logging primitive
            integrations_logging::log(LogLevel::Info, &self.name, message, context)

    // ... similar implementations for other log levels

└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Tracing Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TRACING INTEGRATION                                      │
├─────────────────────────────────────────────────────────────────────────────┤

// Uses integrations-tracing primitive

[TRAIT] [INTERFACE]
TRAIT Tracer: Send + Sync:
    FUNCTION start_span(&self, name: &str, context: &RequestContext) -> Span
    FUNCTION inject_context(&self, headers: &mut HeaderMap)
    FUNCTION extract_context(&self, headers: &HeaderMap) -> Option<SpanContext>

[TRAIT] [INTERFACE]
TRAIT Span: Send + Sync:
    FUNCTION set_attribute(&self, key: &str, value: impl Into<AttributeValue>)
    FUNCTION add_event(&self, name: &str, attributes: &[(&str, impl Into<AttributeValue>)])
    FUNCTION set_status(&self, status: SpanStatus)
    FUNCTION end(&self)

ENUM SpanStatus:
    Ok
    Error(String)

STRUCTURE DefaultTracer:
    service_name: String

[TEST:unit]
FUNCTION DefaultTracer::new(service_name: &str) -> Self:
    RETURN DefaultTracer {
        service_name: service_name.to_string()
    }

IMPL Tracer FOR DefaultTracer:
    FUNCTION start_span(&self, name: &str, context: &RequestContext) -> Span:
        // Delegate to integrations-tracing primitive
        integrations_tracing::start_span(&self.service_name, name, context)

└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Metrics Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    METRICS INTEGRATION                                      │
├─────────────────────────────────────────────────────────────────────────────┤

// Custom metrics for Gemini-specific concerns

[TRAIT] [INTERFACE]
TRAIT MetricsRecorder: Send + Sync:
    FUNCTION increment(&self, name: &str, labels: &[(&str, &str)])
    FUNCTION record_histogram(&self, name: &str, value: impl Into<f64>, labels: &[(&str, &str)])
    FUNCTION record_gauge(&self, name: &str, value: impl Into<f64>, labels: &[(&str, &str)])

STRUCTURE DefaultMetricsRecorder:
    prefix: String

[TEST:unit]
FUNCTION DefaultMetricsRecorder::new(prefix: &str) -> Self:
    RETURN DefaultMetricsRecorder {
        prefix: prefix.to_string()
    }

// Gemini-specific metrics to record:
CONST GEMINI_METRICS = [
    // Request metrics
    "gemini.requests.total",           // Counter - total requests
    "gemini.requests.errors",          // Counter - failed requests
    "gemini.request.duration_ms",      // Histogram - request latency

    // Token metrics
    "gemini.tokens.prompt",            // Histogram - prompt token counts
    "gemini.tokens.completion",        // Histogram - completion token counts
    "gemini.tokens.total",             // Histogram - total token counts

    // File metrics
    "gemini.file.upload.duration_ms",  // Histogram - upload latency
    "gemini.file.upload.size_bytes",   // Histogram - upload sizes

    // Cache metrics
    "gemini.cache.hits",               // Counter - cache hits
    "gemini.cache.misses",             // Counter - cache misses

    // Resilience metrics
    "gemini.retry.attempts",           // Counter - retry attempts
    "gemini.circuit_breaker.state",    // Gauge - circuit state (0=closed, 1=open, 0.5=half-open)
    "gemini.rate_limit.remaining"      // Gauge - remaining rate limit
]

└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Request Context

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     REQUEST CONTEXT                                         │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE RequestContext:
    operation: Option<String>
    model: Option<String>
    request_id: String
    attributes: HashMap<String, String>

[TEST:unit]
FUNCTION RequestContext::new() -> Self:
    RETURN RequestContext {
        operation: None,
        model: None,
        request_id: generate_request_id(),
        attributes: HashMap::new()
    }

[TEST:unit]
FUNCTION RequestContext::empty() -> &'static Self:
    // Return static empty context for cases where context isn't needed
    STATIC EMPTY: RequestContext = RequestContext {
        operation: None,
        model: None,
        request_id: String::new(),
        attributes: HashMap::new()
    }
    &EMPTY

[TEST:unit]
FUNCTION RequestContext::with_operation(self, op: &str) -> Self:
    self.operation = Some(op.to_string())
    RETURN self

[TEST:unit]
FUNCTION RequestContext::with_model(self, model: &str) -> Self:
    self.model = Some(model.to_string())
    RETURN self

[TEST:unit]
FUNCTION RequestContext::with_attribute(self, key: &str, value: &str) -> Self:
    self.attributes.insert(key.to_string(), value.to_string())
    RETURN self

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Testing Support

### 5.1 Mock Factories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MOCK FACTORIES                                         │
├─────────────────────────────────────────────────────────────────────────────┤

// London-School TDD: Comprehensive mock factories for testing

MODULE test_support:

    // Create a fully mocked GeminiClient
    [TEST:unit]
    FUNCTION create_mock_client() -> GeminiClient:
        LET mock_transport = Arc::new(MockHttpTransport::new())
        LET mock_auth = Arc::new(MockAuthProvider::new())
        LET mock_resilience = Arc::new(MockResilienceOrchestrator::passthrough())

        RETURN GeminiClient {
            config: GeminiConfig::default_for_testing(),
            transport: mock_transport,
            auth_manager: mock_auth,
            resilience: mock_resilience,
            content_service: OnceCell::new(),
            embeddings_service: OnceCell::new(),
            models_service: OnceCell::new(),
            files_service: OnceCell::new(),
            cached_content_service: OnceCell::new(),
            logger: Arc::new(MockLogger::new()),
            tracer: Arc::new(MockTracer::new()),
            metrics: Arc::new(MockMetricsRecorder::new())
        }

    // Create client with custom mock transport
    [TEST:unit]
    FUNCTION create_mock_client_with_transport(
        transport: Arc<MockHttpTransport>
    ) -> GeminiClient:
        LET mut client = create_mock_client()
        client.transport = transport
        RETURN client

    // Create response for generate content
    [TEST:unit]
    FUNCTION mock_generate_content_response(text: &str) -> HttpResponse:
        LET response = GenerateContentResponse {
            candidates: Some(vec![Candidate {
                content: Content {
                    role: Some("model".to_string()),
                    parts: vec![Part::Text { text: text.to_string() }]
                },
                finish_reason: Some(FinishReason::Stop),
                safety_ratings: None,
                citation_metadata: None,
                token_count: None,
                grounding_attributions: None,
                index: 0
            }]),
            prompt_feedback: None,
            usage_metadata: Some(UsageMetadata {
                prompt_token_count: 10,
                candidates_token_count: 20,
                total_token_count: 30
            })
        }

        RETURN HttpResponse {
            status: StatusCode::OK,
            headers: HeaderMap::new(),
            body: serde_json::to_vec(&response).unwrap().into()
        }

    // Create streaming response chunks
    [TEST:unit]
    FUNCTION mock_streaming_chunks(texts: &[&str]) -> Vec<Bytes>:
        LET mut chunks = Vec::new()

        // Opening bracket
        chunks.push(Bytes::from("["))

        FOR (i, text) IN texts.iter().enumerate():
            LET chunk = GenerateContentChunk {
                candidates: Some(vec![Candidate {
                    content: Content {
                        role: Some("model".to_string()),
                        parts: vec![Part::Text { text: text.to_string() }]
                    },
                    finish_reason: IF i == texts.len() - 1 THEN
                        Some(FinishReason::Stop)
                    ELSE
                        None
                    END,
                    safety_ratings: None,
                    citation_metadata: None,
                    token_count: None,
                    grounding_attributions: None,
                    index: 0
                }]),
                prompt_feedback: None,
                usage_metadata: None
            }

            LET json = serde_json::to_string(&chunk).unwrap()

            IF i > 0 THEN:
                chunks.push(Bytes::from(",\n"))

            chunks.push(Bytes::from(json))

        // Closing bracket
        chunks.push(Bytes::from("]"))

        RETURN chunks

    // Create error response
    [TEST:unit]
    FUNCTION mock_error_response(
        status: StatusCode,
        error_type: &str,
        message: &str
    ) -> HttpResponse:
        LET error = GeminiApiError {
            error: GeminiErrorBody {
                code: status.as_u16() as i32,
                message: message.to_string(),
                status: Some(error_type.to_string()),
                details: None
            }
        }

        RETURN HttpResponse {
            status,
            headers: HeaderMap::new(),
            body: serde_json::to_vec(&error).unwrap().into()
        }

    // Create rate limit response
    [TEST:unit]
    FUNCTION mock_rate_limit_response(retry_after_secs: u64) -> HttpResponse:
        LET mut headers = HeaderMap::new()
        headers.insert("Retry-After", retry_after_secs.to_string())

        RETURN HttpResponse {
            status: StatusCode::TOO_MANY_REQUESTS,
            headers,
            body: serde_json::to_vec(&GeminiApiError {
                error: GeminiErrorBody {
                    code: 429,
                    message: "Rate limit exceeded".to_string(),
                    status: Some("RESOURCE_EXHAUSTED".to_string()),
                    details: None
                }
            }).unwrap().into()
        }

└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Mock Logger and Tracer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MOCK OBSERVABILITY                                       │
├─────────────────────────────────────────────────────────────────────────────┤

[MOCK]
STRUCTURE MockLogger:
    logs: Mutex<Vec<LogEntry>>

STRUCTURE LogEntry:
    level: LogLevel
    message: String
    context: Value

[TEST:unit]
FUNCTION MockLogger::new() -> Self:
    RETURN MockLogger {
        logs: Mutex::new(Vec::new())
    }

IMPL Logger FOR MockLogger:
    FUNCTION info(&self, message: &str, context: &dyn Serialize):
        self.logs.lock().unwrap().push(LogEntry {
            level: LogLevel::Info,
            message: message.to_string(),
            context: serde_json::to_value(context).unwrap_or(Value::Null)
        })

    // ... similar for other levels

FUNCTION MockLogger::get_logs(&self) -> Vec<LogEntry>:
    self.logs.lock().unwrap().clone()

FUNCTION MockLogger::assert_logged(&self, level: LogLevel, message_contains: &str):
    LET logs = self.logs.lock().unwrap()
    ASSERT(
        logs.iter().any(|l| l.level == level && l.message.contains(message_contains)),
        format!("Expected log at level {:?} containing '{}'", level, message_contains)
    )

[MOCK]
STRUCTURE MockTracer:
    spans: Mutex<Vec<MockSpan>>

STRUCTURE MockSpan:
    name: String
    attributes: HashMap<String, String>
    events: Vec<(String, HashMap<String, String>)>
    status: Option<SpanStatus>
    ended: bool

[TEST:unit]
FUNCTION MockTracer::new() -> Self:
    RETURN MockTracer {
        spans: Mutex::new(Vec::new())
    }

IMPL Tracer FOR MockTracer:
    FUNCTION start_span(&self, name: &str, _context: &RequestContext) -> Span:
        LET span = MockSpan {
            name: name.to_string(),
            attributes: HashMap::new(),
            events: Vec::new(),
            status: None,
            ended: false
        }
        self.spans.lock().unwrap().push(span.clone())
        RETURN Arc::new(span)

[MOCK]
STRUCTURE MockMetricsRecorder:
    counters: Mutex<HashMap<String, u64>>
    histograms: Mutex<HashMap<String, Vec<f64>>>
    gauges: Mutex<HashMap<String, f64>>

[TEST:unit]
FUNCTION MockMetricsRecorder::new() -> Self:
    RETURN MockMetricsRecorder {
        counters: Mutex::new(HashMap::new()),
        histograms: Mutex::new(HashMap::new()),
        gauges: Mutex::new(HashMap::new())
    }

IMPL MetricsRecorder FOR MockMetricsRecorder:
    FUNCTION increment(&self, name: &str, _labels: &[(&str, &str)]):
        *self.counters.lock().unwrap().entry(name.to_string()).or_insert(0) += 1

    FUNCTION record_histogram(&self, name: &str, value: impl Into<f64>, _labels: &[(&str, &str)]):
        self.histograms.lock().unwrap()
            .entry(name.to_string())
            .or_insert_with(Vec::new)
            .push(value.into())

FUNCTION MockMetricsRecorder::get_counter(&self, name: &str) -> u64:
    *self.counters.lock().unwrap().get(name).unwrap_or(&0)

FUNCTION MockMetricsRecorder::get_histogram(&self, name: &str) -> Vec<f64>:
    self.histograms.lock().unwrap().get(name).cloned().unwrap_or_default()

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. TypeScript Implementation Notes

### 6.1 TypeScript-Specific Patterns

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   TYPESCRIPT PATTERNS                                       │
├─────────────────────────────────────────────────────────────────────────────┤

// TypeScript implementation notes for key patterns

/*
 * 1. ASYNC ITERATORS FOR STREAMING
 *
 * In TypeScript, use AsyncIterable for streaming responses:
 */

interface GeminiStreamChunk {
  candidates?: Candidate[];
  promptFeedback?: PromptFeedback;
  usageMetadata?: UsageMetadata;
}

async function* streamGenerateContent(
  request: GenerateContentRequest
): AsyncIterable<GeminiStreamChunk> {
  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify(request),
    headers: { 'Accept': 'application/json' }
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse complete JSON objects from buffer
    while (true) {
      const chunk = extractJsonObject(buffer);
      if (!chunk) break;

      buffer = chunk.remaining;
      yield JSON.parse(chunk.json);
    }
  }
}

/*
 * 2. BUILDER PATTERN WITH METHOD CHAINING
 */

class GenerateContentRequestBuilder {
  private request: Partial<GenerateContentRequest> = {};

  model(model: string): this {
    this.request.model = model;
    return this;
  }

  addUserText(text: string): this {
    this.request.contents = this.request.contents ?? [];
    this.request.contents.push({
      role: 'user',
      parts: [{ text }]
    });
    return this;
  }

  temperature(temp: number): this {
    this.request.generationConfig = this.request.generationConfig ?? {};
    this.request.generationConfig.temperature = temp;
    return this;
  }

  build(): GenerateContentRequest {
    if (!this.request.contents?.length) {
      throw new GeminiError({
        kind: 'ValidationError',
        message: 'At least one content item is required'
      });
    }
    return this.request as GenerateContentRequest;
  }
}

/*
 * 3. TYPE-SAFE ERROR HANDLING
 */

type GeminiErrorKind =
  | 'ConfigurationError'
  | 'AuthenticationError'
  | 'RequestError'
  | 'ResponseError'
  | 'RateLimitError'
  | 'ServerError'
  | 'NetworkError'
  | 'ContentBlocked'
  | 'CircuitBreakerOpen'
  | 'Timeout';

class GeminiError extends Error {
  readonly kind: GeminiErrorKind;
  readonly retryAfter?: number;
  readonly requestId?: string;

  constructor(options: {
    kind: GeminiErrorKind;
    message: string;
    retryAfter?: number;
    requestId?: string;
  }) {
    super(options.message);
    this.name = 'GeminiError';
    this.kind = options.kind;
    this.retryAfter = options.retryAfter;
    this.requestId = options.requestId;
  }

  get isRetryable(): boolean {
    return [
      'RateLimitError',
      'ServerError',
      'NetworkError',
      'Timeout'
    ].includes(this.kind);
  }
}

/*
 * 4. DEPENDENCY INJECTION WITH INTERFACES
 */

interface HttpTransport {
  send(request: HttpRequest): Promise<HttpResponse>;
  sendStreaming(request: HttpRequest): AsyncIterable<Uint8Array>;
}

interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

interface GeminiClientOptions {
  apiKey: string;
  baseUrl?: string;
  apiVersion?: string;
  timeout?: number;
  transport?: HttpTransport;  // For testing
  logger?: Logger;            // For testing
}

/*
 * 5. MOCK FACTORIES FOR TESTING
 */

export const createMockTransport = (
  responses: HttpResponse[]
): HttpTransport => {
  let index = 0;
  return {
    async send(_request: HttpRequest): Promise<HttpResponse> {
      if (index >= responses.length) {
        throw new Error('No more mock responses');
      }
      return responses[index++];
    },
    async *sendStreaming(_request: HttpRequest): AsyncIterable<Uint8Array> {
      // For streaming tests
    }
  };
};

export const createMockLogger = (): Logger & { logs: Array<{level: string; message: string}> } => {
  const logs: Array<{level: string; message: string}> = [];
  return {
    logs,
    debug: (msg) => logs.push({ level: 'debug', message: msg }),
    info: (msg) => logs.push({ level: 'info', message: msg }),
    warn: (msg) => logs.push({ level: 'warn', message: msg }),
    error: (msg) => logs.push({ level: 'error', message: msg })
  };
};

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Navigation

| Previous | Current | Next |
|----------|---------|------|
| [Pseudocode Part 2](./pseudocode-gemini-2.md) | Pseudocode Part 3 | [Architecture](./architecture-gemini.md) |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial advanced services pseudocode |

---

**End of Pseudocode Phase - Continue to Architecture Phase**
