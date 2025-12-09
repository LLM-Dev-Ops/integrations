# Google Drive Integration Module - Pseudocode (Part 2)

**SPARC Phase 2: Pseudocode - Files Service & Upload Operations**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/google-drive`

---

## Table of Contents

10. [Files Service](#10-files-service)
11. [Simple Upload](#11-simple-upload)
12. [Multipart Upload](#12-multipart-upload)
13. [Resumable Upload](#13-resumable-upload)
14. [Download Operations](#14-download-operations)
15. [Export Operations](#15-export-operations)
16. [File Management Operations](#16-file-management-operations)

---

## 10. Files Service

### 10.1 Files Service Implementation

```
CLASS FilesServiceImpl IMPLEMENTS FilesService
    PRIVATE executor: RequestExecutor
    PRIVATE config: GoogleDriveConfig
    PRIVATE logger: Logger
    PRIVATE metrics: MetricsRecorder

    FUNCTION new(executor: RequestExecutor, config: GoogleDriveConfig) -> FilesServiceImpl
        RETURN FilesServiceImpl(
            executor: executor,
            config: config,
            logger: Logger::new("google_drive.files"),
            metrics: MetricsRecorder::new()
        )
    END FUNCTION

    // --- Create Operations ---

    ASYNC FUNCTION create(request: CreateFileRequest) -> Result<File>
        // Validate request
        IF request.name IS Empty THEN
            RETURN Error(RequestError::MissingParameter("name is required"))
        END IF

        // Build metadata
        metadata := BuildFileMetadata(request)

        // Build API request
        api_request := ApiRequestBuilder::new("files", "create")
            .method(POST)
            .path("/files")
            .query_bool("supportsAllDrives", request.supports_all_drives)
            .query_optional("fields", self.get_fields(request.fields))
            .json_body(metadata)
            .build()

        // Execute request
        result := AWAIT self.executor.execute<File>(api_request)

        IF result IS Ok THEN
            self.logger.info("Created file", fields: {"file_id": result.value.id, "name": result.value.name})
            self.metrics.increment("google_drive_files_created_total")
        END IF

        RETURN result
    END ASYNC FUNCTION

    ASYNC FUNCTION create_with_content(request: CreateFileWithContentRequest) -> Result<File>
        // Validate content size for simple upload (max 5MB)
        IF request.content.length > 5 * 1024 * 1024 THEN
            RETURN Error(UploadError::UploadSizeExceeded(
                "Simple upload limited to 5MB. Use resumable upload for larger files."
            ))
        END IF

        // Use simple upload
        RETURN AWAIT self.simple_upload(request)
    END ASYNC FUNCTION

    ASYNC FUNCTION create_multipart(request: CreateMultipartRequest) -> Result<File>
        // Validate content size for multipart upload (max 5MB)
        IF request.content.length > 5 * 1024 * 1024 THEN
            RETURN Error(UploadError::UploadSizeExceeded(
                "Multipart upload limited to 5MB. Use resumable upload for larger files."
            ))
        END IF

        // Use multipart upload
        RETURN AWAIT self.multipart_upload(request)
    END ASYNC FUNCTION

    ASYNC FUNCTION create_resumable(request: CreateResumableRequest) -> Result<ResumableUploadSession>
        // Initiate resumable upload session
        RETURN AWAIT self.initiate_resumable_upload(request)
    END ASYNC FUNCTION

    // --- Read Operations ---

    ASYNC FUNCTION get(file_id: String, params: Option<GetFileParams>) -> Result<File>
        // Validate file ID
        IF file_id IS Empty THEN
            RETURN Error(RequestError::MissingParameter("file_id is required"))
        END IF

        params := params OR GetFileParams::default()

        // Build API request
        api_request := ApiRequestBuilder::new("files", "get")
            .method(GET)
            .path("/files/" + UrlEncode(file_id))
            .query_optional("fields", self.get_fields(params.fields))
            .query_bool("supportsAllDrives", params.supports_all_drives)
            .query_bool("acknowledgeAbuse", params.acknowledge_abuse)
            .query_optional("includePermissionsForView", params.include_permissions_for_view)
            .query_optional("includeLabels", params.include_labels)
            .build()

        RETURN AWAIT self.executor.execute<File>(api_request)
    END ASYNC FUNCTION

    ASYNC FUNCTION download(file_id: String, params: Option<DownloadParams>) -> Result<Bytes>
        // Validate file ID
        IF file_id IS Empty THEN
            RETURN Error(RequestError::MissingParameter("file_id is required"))
        END IF

        params := params OR DownloadParams::default()

        // Build download request
        api_request := ApiRequestBuilder::new("files", "download")
            .method(GET)
            .path("/files/" + UrlEncode(file_id))
            .query("alt", "media")
            .query_bool("acknowledgeAbuse", params.acknowledge_abuse)
            .build()

        // Add range header if specified
        IF params.range IS Some THEN
            api_request.header("Range", params.range)
        END IF

        // Execute and get raw bytes
        result := AWAIT self.executor.execute_raw(api_request)

        IF result IS Ok THEN
            self.metrics.increment("google_drive_download_bytes_total", result.value.length)
        END IF

        RETURN result
    END ASYNC FUNCTION

    ASYNC FUNCTION download_stream(file_id: String, params: Option<DownloadParams>) -> Result<Stream<Bytes>>
        // Validate file ID
        IF file_id IS Empty THEN
            RETURN Error(RequestError::MissingParameter("file_id is required"))
        END IF

        params := params OR DownloadParams::default()

        // Build download request
        api_request := ApiRequestBuilder::new("files", "download_stream")
            .method(GET)
            .path("/files/" + UrlEncode(file_id))
            .query("alt", "media")
            .query_bool("acknowledgeAbuse", params.acknowledge_abuse)
            .build()

        IF params.range IS Some THEN
            api_request.header("Range", params.range)
        END IF

        // Execute and get streaming response
        RETURN AWAIT self.executor.execute_streaming(api_request)
    END ASYNC FUNCTION

    // --- List Operations ---

    ASYNC FUNCTION list(params: Option<ListFilesParams>) -> Result<FileList>
        params := params OR ListFilesParams::default()

        // Validate page size
        IF params.page_size IS Some AND (params.page_size < 1 OR params.page_size > 1000) THEN
            RETURN Error(RequestError::InvalidParameter("pageSize must be between 1 and 1000"))
        END IF

        // Build API request
        api_request := ApiRequestBuilder::new("files", "list")
            .method(GET)
            .path("/files")
            .query_optional("corpora", params.corpora)
            .query_optional("driveId", params.drive_id)
            .query_bool("includeItemsFromAllDrives", params.include_items_from_all_drives)
            .query_optional("includePermissionsForView", params.include_permissions_for_view)
            .query_optional("includeLabels", params.include_labels)
            .query_optional("orderBy", params.order_by)
            .query_optional("pageSize", params.page_size.map(ToString))
            .query_optional("pageToken", params.page_token)
            .query_optional("q", params.query)
            .query_optional("spaces", params.spaces)
            .query_bool("supportsAllDrives", params.supports_all_drives)
            .query_optional("fields", self.get_fields(params.fields))
            .build()

        RETURN AWAIT self.executor.execute<FileList>(api_request)
    END ASYNC FUNCTION

    FUNCTION list_all(params: Option<ListFilesParams>) -> Stream<File>
        params := params OR ListFilesParams::default()

        // Create page iterator
        page_iterator := PageIterator::new(
            executor: self.executor,
            request_builder: (page_token) -> {
                mut p := params.clone()
                p.page_token := page_token
                RETURN self.build_list_request(p)
            },
            page_extractor: ExtractFileListPage
        )

        // Return streaming iterator
        RETURN StreamingIterator::new(page_iterator)
    END FUNCTION

    // --- Update Operations ---

    ASYNC FUNCTION update(file_id: String, request: UpdateFileRequest) -> Result<File>
        // Validate file ID
        IF file_id IS Empty THEN
            RETURN Error(RequestError::MissingParameter("file_id is required"))
        END IF

        // Build metadata
        metadata := BuildUpdateMetadata(request)

        // Build API request
        api_request := ApiRequestBuilder::new("files", "update")
            .method(PATCH)
            .path("/files/" + UrlEncode(file_id))
            .query_optional("addParents", request.add_parents.map(|p| p.join(",")))
            .query_optional("removeParents", request.remove_parents.map(|p| p.join(",")))
            .query_bool("keepRevisionForever", request.keep_revision_forever)
            .query_optional("ocrLanguage", request.ocr_language)
            .query_bool("supportsAllDrives", request.supports_all_drives)
            .query_bool("useContentAsIndexableText", request.use_content_as_indexable_text)
            .query_optional("fields", self.get_fields(request.fields))
            .json_body(metadata)
            .build()

        result := AWAIT self.executor.execute<File>(api_request)

        IF result IS Ok THEN
            self.logger.info("Updated file", fields: {"file_id": file_id})
        END IF

        RETURN result
    END ASYNC FUNCTION

    ASYNC FUNCTION update_content(file_id: String, request: UpdateFileContentRequest) -> Result<File>
        // Validate file ID
        IF file_id IS Empty THEN
            RETURN Error(RequestError::MissingParameter("file_id is required"))
        END IF

        // Choose upload method based on size
        IF request.content.length <= 5 * 1024 * 1024 THEN
            // Simple upload for small files
            RETURN AWAIT self.simple_upload_update(file_id, request)
        ELSE
            // Resumable upload for large files
            session := AWAIT self.initiate_resumable_upload_update(file_id, request)
            IF session IS Error THEN
                RETURN session
            END IF
            RETURN AWAIT session.value.upload_bytes(request.content)
        END IF
    END ASYNC FUNCTION

    // --- Delete Operations ---

    ASYNC FUNCTION delete(file_id: String, params: Option<DeleteFileParams>) -> Result<void>
        // Validate file ID
        IF file_id IS Empty THEN
            RETURN Error(RequestError::MissingParameter("file_id is required"))
        END IF

        params := params OR DeleteFileParams::default()

        // Build API request
        api_request := ApiRequestBuilder::new("files", "delete")
            .method(DELETE)
            .path("/files/" + UrlEncode(file_id))
            .query_bool("supportsAllDrives", params.supports_all_drives)
            .query_bool("enforceSingleParent", params.enforce_single_parent)
            .build()

        result := AWAIT self.executor.execute<void>(api_request)

        IF result IS Ok THEN
            self.logger.info("Deleted file", fields: {"file_id": file_id})
            self.metrics.increment("google_drive_files_deleted_total")
        END IF

        RETURN result
    END ASYNC FUNCTION

    // --- Copy Operations ---

    ASYNC FUNCTION copy(file_id: String, request: CopyFileRequest) -> Result<File>
        // Validate file ID
        IF file_id IS Empty THEN
            RETURN Error(RequestError::MissingParameter("file_id is required"))
        END IF

        // Build copy metadata
        metadata := BuildCopyMetadata(request)

        // Build API request
        api_request := ApiRequestBuilder::new("files", "copy")
            .method(POST)
            .path("/files/" + UrlEncode(file_id) + "/copy")
            .query_bool("ignoreDefaultVisibility", request.ignore_default_visibility)
            .query_bool("keepRevisionForever", request.keep_revision_forever)
            .query_optional("ocrLanguage", request.ocr_language)
            .query_bool("supportsAllDrives", request.supports_all_drives)
            .query_optional("fields", self.get_fields(request.fields))
            .json_body(metadata)
            .build()

        result := AWAIT self.executor.execute<File>(api_request)

        IF result IS Ok THEN
            self.logger.info("Copied file", fields: {
                "source_file_id": file_id,
                "new_file_id": result.value.id
            })
            self.metrics.increment("google_drive_files_copied_total")
        END IF

        RETURN result
    END ASYNC FUNCTION

    // --- Helper Functions ---

    PRIVATE FUNCTION get_fields(fields: Option<String>) -> Option<String>
        IF fields IS Some THEN
            RETURN fields
        END IF
        RETURN self.config.default_fields
    END FUNCTION

    PRIVATE FUNCTION build_list_request(params: ListFilesParams) -> ApiRequest
        RETURN ApiRequestBuilder::new("files", "list")
            .method(GET)
            .path("/files")
            .query_optional("corpora", params.corpora)
            .query_optional("driveId", params.drive_id)
            .query_bool("includeItemsFromAllDrives", params.include_items_from_all_drives)
            .query_optional("orderBy", params.order_by)
            .query_optional("pageSize", params.page_size.map(ToString))
            .query_optional("pageToken", params.page_token)
            .query_optional("q", params.query)
            .query_optional("spaces", params.spaces)
            .query_bool("supportsAllDrives", params.supports_all_drives)
            .query_optional("fields", self.get_fields(params.fields))
            .build()
    END FUNCTION
END CLASS
```

### 10.2 File Metadata Builder

```
ALGORITHM BuildFileMetadata(request: CreateFileRequest) -> Map
    metadata := {}

    metadata["name"] := request.name

    IF request.mime_type IS Some THEN
        metadata["mimeType"] := request.mime_type
    END IF

    IF request.description IS Some THEN
        metadata["description"] := request.description
    END IF

    IF request.parents IS Some AND NOT request.parents.is_empty() THEN
        metadata["parents"] := request.parents
    END IF

    IF request.properties IS Some THEN
        metadata["properties"] := request.properties
    END IF

    IF request.app_properties IS Some THEN
        metadata["appProperties"] := request.app_properties
    END IF

    IF request.starred IS Some THEN
        metadata["starred"] := request.starred
    END IF

    IF request.folder_color_rgb IS Some THEN
        metadata["folderColorRgb"] := request.folder_color_rgb
    END IF

    IF request.content_hints IS Some THEN
        metadata["contentHints"] := BuildContentHints(request.content_hints)
    END IF

    IF request.content_restrictions IS Some THEN
        metadata["contentRestrictions"] := request.content_restrictions.map(BuildContentRestriction)
    END IF

    IF request.copy_requires_writer_permission IS Some THEN
        metadata["copyRequiresWriterPermission"] := request.copy_requires_writer_permission
    END IF

    IF request.shortcut_details IS Some THEN
        metadata["shortcutDetails"] := BuildShortcutDetails(request.shortcut_details)
    END IF

    IF request.writers_can_share IS Some THEN
        metadata["writersCanShare"] := request.writers_can_share
    END IF

    RETURN metadata
END ALGORITHM

ALGORITHM BuildUpdateMetadata(request: UpdateFileRequest) -> Map
    metadata := {}

    IF request.name IS Some THEN
        metadata["name"] := request.name
    END IF

    IF request.mime_type IS Some THEN
        metadata["mimeType"] := request.mime_type
    END IF

    IF request.description IS Some THEN
        metadata["description"] := request.description
    END IF

    IF request.properties IS Some THEN
        metadata["properties"] := request.properties
    END IF

    IF request.app_properties IS Some THEN
        metadata["appProperties"] := request.app_properties
    END IF

    IF request.starred IS Some THEN
        metadata["starred"] := request.starred
    END IF

    IF request.trashed IS Some THEN
        metadata["trashed"] := request.trashed
    END IF

    IF request.content_hints IS Some THEN
        metadata["contentHints"] := BuildContentHints(request.content_hints)
    END IF

    IF request.content_restrictions IS Some THEN
        metadata["contentRestrictions"] := request.content_restrictions.map(BuildContentRestriction)
    END IF

    IF request.copy_requires_writer_permission IS Some THEN
        metadata["copyRequiresWriterPermission"] := request.copy_requires_writer_permission
    END IF

    IF request.writers_can_share IS Some THEN
        metadata["writersCanShare"] := request.writers_can_share
    END IF

    RETURN metadata
END ALGORITHM
```

---

## 11. Simple Upload

### 11.1 Simple Upload Implementation

```
ALGORITHM SimpleUpload(
    executor: RequestExecutor,
    request: CreateFileWithContentRequest
) -> Result<File>
    // Validate inputs
    IF request.name IS Empty THEN
        RETURN Error(RequestError::MissingParameter("name is required"))
    END IF

    IF request.content IS Empty THEN
        RETURN Error(RequestError::MissingParameter("content is required"))
    END IF

    // Determine MIME type
    mime_type := request.mime_type OR DetectMimeType(request.content, request.name)

    // Build API request for simple upload
    // Simple upload only uploads content, no metadata
    api_request := ApiRequestBuilder::new("files", "create_simple")
        .method(POST)
        .path("/files")
        .upload()
        .query("uploadType", "media")
        .query("name", request.name)
        .query_bool("supportsAllDrives", request.supports_all_drives)
        .query_optional("fields", request.fields)
        .binary_body(request.content, mime_type)
        .build()

    // Execute upload
    result := AWAIT executor.execute<File>(api_request)

    IF result IS Ok THEN
        // If we need to update metadata (simple upload doesn't support all metadata)
        IF request.description IS Some OR request.parents IS Some OR
           request.properties IS Some OR request.starred IS Some THEN
            // Update the file with additional metadata
            update_request := UpdateFileRequest(
                name: None,  // Already set
                description: request.description,
                properties: request.properties,
                starred: request.starred,
                supports_all_drives: request.supports_all_drives
            )

            IF request.parents IS Some THEN
                update_request.add_parents := request.parents
            END IF

            update_result := AWAIT executor.execute<File>(
                BuildUpdateRequest(result.value.id, update_request)
            )

            IF update_result IS Ok THEN
                RETURN update_result
            END IF
            // If update fails, still return the created file
        END IF
    END IF

    RETURN result
END ALGORITHM
```

### 11.2 MIME Type Detection

```
ALGORITHM DetectMimeType(content: Bytes, filename: String) -> String
    // First try to detect from file extension
    extension := GetFileExtension(filename).to_lowercase()

    MATCH extension
        CASE "pdf": RETURN "application/pdf"
        CASE "doc": RETURN "application/msword"
        CASE "docx": RETURN "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        CASE "xls": RETURN "application/vnd.ms-excel"
        CASE "xlsx": RETURN "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        CASE "ppt": RETURN "application/vnd.ms-powerpoint"
        CASE "pptx": RETURN "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        CASE "txt": RETURN "text/plain"
        CASE "csv": RETURN "text/csv"
        CASE "html", "htm": RETURN "text/html"
        CASE "json": RETURN "application/json"
        CASE "xml": RETURN "application/xml"
        CASE "jpg", "jpeg": RETURN "image/jpeg"
        CASE "png": RETURN "image/png"
        CASE "gif": RETURN "image/gif"
        CASE "svg": RETURN "image/svg+xml"
        CASE "mp3": RETURN "audio/mpeg"
        CASE "mp4": RETURN "video/mp4"
        CASE "zip": RETURN "application/zip"
        CASE "gz", "gzip": RETURN "application/gzip"
        CASE "tar": RETURN "application/x-tar"
        DEFAULT:
            // Try magic number detection
            RETURN DetectMimeTypeFromMagicNumber(content)
    END MATCH
END ALGORITHM

ALGORITHM DetectMimeTypeFromMagicNumber(content: Bytes) -> String
    IF content.length < 4 THEN
        RETURN "application/octet-stream"
    END IF

    // Check common magic numbers
    header := content[0:4]

    IF header[0:3] == [0xFF, 0xD8, 0xFF] THEN
        RETURN "image/jpeg"
    ELSE IF header[0:4] == [0x89, 0x50, 0x4E, 0x47] THEN
        RETURN "image/png"
    ELSE IF header[0:4] == [0x47, 0x49, 0x46, 0x38] THEN
        RETURN "image/gif"
    ELSE IF header[0:4] == [0x25, 0x50, 0x44, 0x46] THEN
        RETURN "application/pdf"
    ELSE IF header[0:4] == [0x50, 0x4B, 0x03, 0x04] THEN
        // ZIP-based formats (docx, xlsx, pptx, zip, etc.)
        RETURN "application/zip"
    ELSE IF header[0:2] == [0x1F, 0x8B] THEN
        RETURN "application/gzip"
    END IF

    // Default to binary
    RETURN "application/octet-stream"
END ALGORITHM
```

---

## 12. Multipart Upload

### 12.1 Multipart Upload Implementation

```
ALGORITHM MultipartUpload(
    executor: RequestExecutor,
    request: CreateMultipartRequest
) -> Result<File>
    // Validate inputs
    IF request.name IS Empty THEN
        RETURN Error(RequestError::MissingParameter("name is required"))
    END IF

    // Build file metadata
    metadata := BuildFileMetadata(CreateFileRequest(
        name: request.name,
        mime_type: request.mime_type,
        description: request.description,
        parents: request.parents,
        properties: request.properties,
        app_properties: request.app_properties,
        starred: request.starred,
        folder_color_rgb: request.folder_color_rgb,
        content_hints: request.content_hints,
        content_restrictions: request.content_restrictions,
        copy_requires_writer_permission: request.copy_requires_writer_permission,
        shortcut_details: request.shortcut_details,
        writers_can_share: request.writers_can_share
    ))

    // Determine content MIME type
    content_mime_type := request.content_mime_type OR
                         DetectMimeType(request.content, request.name)

    // Build multipart body
    (content_type, body) := BuildMultipartBody(metadata, request.content, content_mime_type)

    // Build API request
    api_request := ApiRequestBuilder::new("files", "create_multipart")
        .method(POST)
        .path("/files")
        .upload()
        .query("uploadType", "multipart")
        .query_bool("supportsAllDrives", request.supports_all_drives)
        .query_optional("fields", request.fields)
        .header("Content-Type", content_type)
        .binary_body(body, content_type)
        .build()

    // Execute upload
    RETURN AWAIT executor.execute<File>(api_request)
END ALGORITHM

ALGORITHM BuildMultipartBody(metadata: Map, content: Bytes, content_type: String) -> (String, Bytes)
    // Generate boundary
    boundary := GenerateRandomBoundary()

    // Build multipart body
    body := ByteBuffer::new()

    // Part 1: Metadata
    body.append("--" + boundary + "\r\n")
    body.append("Content-Type: application/json; charset=UTF-8\r\n")
    body.append("\r\n")
    body.append(JsonEncode(metadata))
    body.append("\r\n")

    // Part 2: Content
    body.append("--" + boundary + "\r\n")
    body.append("Content-Type: " + content_type + "\r\n")
    body.append("\r\n")
    body.append(content)
    body.append("\r\n")

    // End boundary
    body.append("--" + boundary + "--")

    full_content_type := "multipart/related; boundary=" + boundary

    RETURN (full_content_type, body.to_bytes())
END ALGORITHM
```

---

## 13. Resumable Upload

### 13.1 Initiate Resumable Upload

```
ALGORITHM InitiateResumableUpload(
    executor: RequestExecutor,
    config: GoogleDriveConfig,
    request: CreateResumableRequest
) -> Result<ResumableUploadSession>
    // Validate inputs
    IF request.name IS Empty THEN
        RETURN Error(RequestError::MissingParameter("name is required"))
    END IF

    // Build file metadata
    metadata := BuildFileMetadata(CreateFileRequest(
        name: request.name,
        mime_type: request.mime_type,
        description: request.description,
        parents: request.parents,
        properties: request.properties,
        app_properties: request.app_properties,
        starred: request.starred
    ))

    // Determine content MIME type
    content_mime_type := request.content_mime_type OR "application/octet-stream"

    // Build initiation request
    api_request := ApiRequestBuilder::new("files", "create_resumable_init")
        .method(POST)
        .path("/files")
        .upload()
        .query("uploadType", "resumable")
        .query_bool("supportsAllDrives", request.supports_all_drives)
        .query_optional("fields", request.fields)
        .header("X-Upload-Content-Type", content_mime_type)
        .header("X-Upload-Content-Length", request.total_size.to_string())
        .json_body(metadata)
        .build()

    // Execute initiation request
    response := AWAIT executor.execute_raw_with_headers(api_request)

    IF response IS Error THEN
        RETURN Error(response.error)
    END IF

    // Extract resumable URI from Location header
    upload_uri := response.value.headers.get("Location")

    IF upload_uri IS None THEN
        RETURN Error(UploadError::InvalidUploadRequest(
            "No Location header in resumable upload response"
        ))
    END IF

    // Create session
    session := ResumableUploadSessionImpl::new(
        executor: executor,
        upload_uri: upload_uri,
        total_size: request.total_size,
        chunk_size: config.upload_chunk_size,
        content_type: content_mime_type,
        fields: request.fields
    )

    RETURN Ok(session)
END ALGORITHM
```

### 13.2 Resumable Upload Session

```
CLASS ResumableUploadSessionImpl IMPLEMENTS ResumableUploadSession
    PRIVATE executor: RequestExecutor
    PRIVATE upload_uri: String
    PRIVATE total_size: u64
    PRIVATE chunk_size: usize
    PRIVATE content_type: String
    PRIVATE fields: Option<String>
    PRIVATE bytes_uploaded: u64
    PRIVATE logger: Logger
    PRIVATE metrics: MetricsRecorder

    FUNCTION upload_uri() -> String
        RETURN self.upload_uri
    END FUNCTION

    ASYNC FUNCTION upload_chunk(chunk: Bytes, offset: u64, total_size: u64) -> Result<UploadChunkResult>
        // Validate chunk
        IF chunk.is_empty() THEN
            RETURN Error(UploadError::InvalidUploadRequest("Empty chunk"))
        END IF

        // Calculate range
        start := offset
        end := offset + chunk.length - 1

        // Build Content-Range header
        content_range := "bytes " + start.to_string() + "-" + end.to_string() + "/" + total_size.to_string()

        // Build request (direct to upload URI, not through normal API)
        request := HttpRequest(
            method: PUT,
            url: Url::parse(self.upload_uri),
            headers: {
                "Content-Length": chunk.length.to_string(),
                "Content-Range": content_range,
                "Content-Type": self.content_type
            },
            body: Some(RequestBody::Bytes(chunk)),
            timeout: Some(Duration::minutes(5))
        )

        // Execute request
        response := AWAIT self.executor.transport.send(request)

        IF response IS Error THEN
            // Check if it's a network error (might be resumable)
            RETURN Error(UploadError::UploadInterrupted(response.error.message))
        END IF

        // Handle response
        MATCH response.value.status
            CASE 200, 201:
                // Upload complete
                file := JsonDecode(response.value.body)
                self.bytes_uploaded := total_size
                self.metrics.increment("google_drive_upload_bytes_total", total_size)
                RETURN Ok(UploadChunkResult::Complete(MapFileResponse(file)))

            CASE 308:
                // Resume incomplete - more chunks needed
                range_header := response.value.headers.get("Range")
                bytes_received := ParseRangeHeader(range_header)
                self.bytes_uploaded := bytes_received
                self.logger.debug("Upload progress", fields: {
                    "bytes_uploaded": bytes_received,
                    "total_size": total_size,
                    "percent": (bytes_received * 100 / total_size)
                })
                RETURN Ok(UploadChunkResult::InProgress(bytes_received))

            CASE 404:
                // Upload session expired
                RETURN Error(UploadError::ResumableUploadExpired(
                    "Upload session expired. Please initiate a new upload."
                ))

            CASE 400..499:
                // Client error
                error_body := JsonDecode(response.value.body)
                RETURN Error(UploadError::UploadFailed(
                    error_body.get("error", {}).get("message", "Upload failed")
                ))

            CASE 500..599:
                // Server error - can retry
                RETURN Error(UploadError::UploadInterrupted("Server error: " + response.value.status))

            DEFAULT:
                RETURN Error(UploadError::UploadFailed(
                    "Unexpected status: " + response.value.status
                ))
        END MATCH
    END ASYNC FUNCTION

    ASYNC FUNCTION upload_stream(
        stream: Stream<Bytes>,
        total_size: u64,
        chunk_size: usize
    ) -> Result<File>
        // Use provided chunk size or default
        actual_chunk_size := chunk_size OR self.chunk_size

        // Ensure chunk size is multiple of 256KB
        IF actual_chunk_size MOD 262144 != 0 THEN
            actual_chunk_size := ((actual_chunk_size / 262144) + 1) * 262144
        END IF

        buffer := ByteBuffer::new()
        offset := 0

        FOR chunk IN stream DO
            IF chunk IS Error THEN
                RETURN Error(UploadError::UploadInterrupted(chunk.error.message))
            END IF

            buffer.append(chunk.value)

            // Upload when buffer reaches chunk size
            WHILE buffer.length >= actual_chunk_size DO
                upload_chunk := buffer.take(actual_chunk_size)

                result := AWAIT self.upload_chunk_with_retry(upload_chunk, offset, total_size)

                IF result IS Error THEN
                    RETURN result
                END IF

                MATCH result.value
                    CASE Complete(file):
                        RETURN Ok(file)
                    CASE InProgress(bytes_received):
                        offset := bytes_received
                END MATCH
            END WHILE
        END FOR

        // Upload remaining data
        IF buffer.length > 0 THEN
            result := AWAIT self.upload_chunk_with_retry(buffer.to_bytes(), offset, total_size)

            IF result IS Error THEN
                RETURN result
            END IF

            MATCH result.value
                CASE Complete(file):
                    RETURN Ok(file)
                CASE InProgress(_):
                    RETURN Error(UploadError::UploadFailed(
                        "Upload incomplete after all data sent"
                    ))
            END MATCH
        END IF

        RETURN Error(UploadError::UploadFailed("No data uploaded"))
    END ASYNC FUNCTION

    ASYNC FUNCTION upload_bytes(content: Bytes) -> Result<File>
        total_size := content.length
        offset := 0

        WHILE offset < total_size DO
            // Calculate chunk boundaries
            end := min(offset + self.chunk_size, total_size)
            chunk := content[offset:end]

            result := AWAIT self.upload_chunk_with_retry(chunk, offset, total_size)

            IF result IS Error THEN
                RETURN result
            END IF

            MATCH result.value
                CASE Complete(file):
                    RETURN Ok(file)
                CASE InProgress(bytes_received):
                    offset := bytes_received
            END MATCH
        END WHILE

        RETURN Error(UploadError::UploadFailed("Upload loop ended unexpectedly"))
    END ASYNC FUNCTION

    ASYNC FUNCTION upload_chunk_with_retry(
        chunk: Bytes,
        offset: u64,
        total_size: u64
    ) -> Result<UploadChunkResult>
        max_retries := 3
        retry_count := 0

        WHILE retry_count < max_retries DO
            result := AWAIT self.upload_chunk(chunk, offset, total_size)

            IF result IS Ok THEN
                RETURN result
            END IF

            // Check if error is retryable
            IF NOT IsRetryableUploadError(result.error) THEN
                RETURN result
            END IF

            retry_count += 1
            self.metrics.increment("google_drive_resumable_upload_retries_total")

            // Query current status before retry
            status := AWAIT self.query_status()

            IF status IS Ok AND status.value.bytes_received > offset THEN
                // Some data was received, adjust offset
                offset := status.value.bytes_received
                // Adjust chunk to only send remaining data
                already_sent := status.value.bytes_received - offset
                chunk := chunk[already_sent:]
            END IF

            // Exponential backoff
            AWAIT Sleep(Duration::seconds(2 ^ retry_count))
        END WHILE

        RETURN Error(UploadError::UploadFailed(
            "Upload failed after " + max_retries + " retries"
        ))
    END ASYNC FUNCTION

    ASYNC FUNCTION query_status() -> Result<UploadStatus>
        // Send empty PUT with Content-Range: bytes */total to query status
        request := HttpRequest(
            method: PUT,
            url: Url::parse(self.upload_uri),
            headers: {
                "Content-Length": "0",
                "Content-Range": "bytes */" + self.total_size.to_string()
            },
            body: None,
            timeout: Some(Duration::seconds(30))
        )

        response := AWAIT self.executor.transport.send(request)

        IF response IS Error THEN
            RETURN Error(UploadError::UploadInterrupted(response.error.message))
        END IF

        MATCH response.value.status
            CASE 200, 201:
                // Already complete
                RETURN Ok(UploadStatus(
                    bytes_received: self.total_size,
                    total_size: self.total_size,
                    is_complete: true
                ))

            CASE 308:
                // In progress
                range_header := response.value.headers.get("Range")
                bytes_received := ParseRangeHeader(range_header)
                RETURN Ok(UploadStatus(
                    bytes_received: bytes_received,
                    total_size: self.total_size,
                    is_complete: false
                ))

            CASE 404:
                RETURN Error(UploadError::ResumableUploadExpired(
                    "Upload session no longer exists"
                ))

            DEFAULT:
                RETURN Error(UploadError::UploadFailed(
                    "Failed to query upload status: " + response.value.status
                ))
        END MATCH
    END ASYNC FUNCTION

    ASYNC FUNCTION resume() -> Result<UploadStatus>
        RETURN AWAIT self.query_status()
    END ASYNC FUNCTION

    ASYNC FUNCTION cancel() -> Result<void>
        // Send DELETE to upload URI to cancel
        request := HttpRequest(
            method: DELETE,
            url: Url::parse(self.upload_uri),
            headers: {},
            body: None,
            timeout: Some(Duration::seconds(30))
        )

        response := AWAIT self.executor.transport.send(request)

        // 204 No Content or 499 Client Closed Request both indicate success
        IF response IS Ok AND (response.value.status == 204 OR response.value.status == 499) THEN
            self.logger.info("Cancelled resumable upload")
            RETURN Ok(void)
        END IF

        // Other responses are okay - upload might already be gone
        RETURN Ok(void)
    END ASYNC FUNCTION
END CLASS

ALGORITHM ParseRangeHeader(range_header: Option<String>) -> u64
    IF range_header IS None THEN
        RETURN 0
    END IF

    // Format: "bytes=0-12345"
    parts := range_header.split("=")
    IF parts.length != 2 THEN
        RETURN 0
    END IF

    range_parts := parts[1].split("-")
    IF range_parts.length != 2 THEN
        RETURN 0
    END IF

    // Return end + 1 (bytes received)
    RETURN ParseInt(range_parts[1]) + 1
END ALGORITHM

ALGORITHM IsRetryableUploadError(error: GoogleDriveError) -> bool
    MATCH error
        CASE UploadError::UploadInterrupted(_):
            RETURN true
        CASE NetworkError::Timeout(_):
            RETURN true
        CASE NetworkError::ConnectionFailed(_):
            RETURN true
        CASE ServerError::InternalError(_):
            RETURN true
        CASE ServerError::ServiceUnavailable(_, _):
            RETURN true
        DEFAULT:
            RETURN false
    END MATCH
END ALGORITHM
```

---

## 14. Download Operations

### 14.1 Streaming Download

```
ALGORITHM StreamingDownload(
    executor: RequestExecutor,
    file_id: String,
    params: DownloadParams
) -> Result<Stream<Bytes>>
    // Build download request
    api_request := ApiRequestBuilder::new("files", "download_stream")
        .method(GET)
        .path("/files/" + UrlEncode(file_id))
        .query("alt", "media")
        .query_bool("acknowledgeAbuse", params.acknowledge_abuse)
        .build()

    IF params.range IS Some THEN
        api_request.header("Range", params.range)
    END IF

    // Execute and get streaming response
    response := AWAIT executor.execute_streaming(api_request)

    IF response IS Error THEN
        RETURN response
    END IF

    // Wrap stream with progress tracking
    tracked_stream := ProgressTrackingStream::new(
        inner: response.value,
        on_progress: (bytes_received) -> {
            metrics.increment("google_drive_download_bytes_total", bytes_received)
        }
    )

    RETURN Ok(tracked_stream)
END ALGORITHM
```

### 14.2 Range Download

```
ALGORITHM RangeDownload(
    executor: RequestExecutor,
    file_id: String,
    start: u64,
    end: u64
) -> Result<Bytes>
    // Build range header
    range_header := "bytes=" + start.to_string() + "-" + end.to_string()

    // Build download request
    api_request := ApiRequestBuilder::new("files", "download_range")
        .method(GET)
        .path("/files/" + UrlEncode(file_id))
        .query("alt", "media")
        .header("Range", range_header)
        .build()

    // Execute download
    response := AWAIT executor.execute_raw_with_headers(api_request)

    IF response IS Error THEN
        RETURN response
    END IF

    // Verify we got partial content
    IF response.value.status != 206 THEN
        // Server might not support range requests
        IF response.value.status == 200 THEN
            // Return full content (no range support)
            RETURN Ok(response.value.body)
        END IF
        RETURN Error(ResponseError::UnexpectedFormat(
            "Expected 206 Partial Content, got " + response.value.status
        ))
    END IF

    RETURN Ok(response.value.body)
END ALGORITHM
```

---

## 15. Export Operations

### 15.1 Export Google Workspace File

```
ALGORITHM ExportFile(
    executor: RequestExecutor,
    file_id: String,
    export_mime_type: String
) -> Result<Bytes>
    // Validate export MIME type
    IF NOT IsValidExportMimeType(export_mime_type) THEN
        RETURN Error(ExportError::InvalidExportFormat(
            "Unsupported export format: " + export_mime_type
        ))
    END IF

    // Build export request
    api_request := ApiRequestBuilder::new("files", "export")
        .method(GET)
        .path("/files/" + UrlEncode(file_id) + "/export")
        .query("mimeType", export_mime_type)
        .build()

    // Execute export
    response := AWAIT executor.execute_raw(api_request)

    IF response IS Error THEN
        // Check for specific export errors
        IF response.error IS ResourceError::FileNotFound THEN
            RETURN Error(ExportError::ExportNotSupported(
                "File not found or not a Google Workspace file"
            ))
        END IF
        RETURN response
    END IF

    // Check if response is too large (export limit is 10MB)
    IF response.value.length > 10 * 1024 * 1024 THEN
        RETURN Error(ExportError::ExportSizeExceeded(
            "Export exceeds 10MB limit. Use webContentLink for larger exports."
        ))
    END IF

    RETURN Ok(response.value)
END ALGORITHM

ALGORITHM ExportFileStream(
    executor: RequestExecutor,
    file_id: String,
    export_mime_type: String
) -> Result<Stream<Bytes>>
    // Build export request
    api_request := ApiRequestBuilder::new("files", "export_stream")
        .method(GET)
        .path("/files/" + UrlEncode(file_id) + "/export")
        .query("mimeType", export_mime_type)
        .build()

    // Execute and get streaming response
    RETURN AWAIT executor.execute_streaming(api_request)
END ALGORITHM

ALGORITHM IsValidExportMimeType(mime_type: String) -> bool
    valid_types := [
        // Document exports
        "text/plain",
        "text/html",
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/rtf",
        "application/epub+zip",
        "application/vnd.oasis.opendocument.text",

        // Spreadsheet exports
        "text/csv",
        "text/tab-separated-values",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.oasis.opendocument.spreadsheet",

        // Presentation exports
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.oasis.opendocument.presentation",

        // Drawing exports
        "image/png",
        "image/jpeg",
        "image/svg+xml",

        // Apps Script export
        "application/vnd.google-apps.script+json"
    ]

    RETURN mime_type IN valid_types
END ALGORITHM
```

---

## 16. File Management Operations

### 16.1 Move File

```
ALGORITHM MoveFile(
    executor: RequestExecutor,
    file_id: String,
    add_parents: List<String>,
    remove_parents: List<String>
) -> Result<File>
    // Build update request to change parents
    api_request := ApiRequestBuilder::new("files", "move")
        .method(PATCH)
        .path("/files/" + UrlEncode(file_id))
        .query("addParents", add_parents.join(","))
        .query("removeParents", remove_parents.join(","))
        .query("supportsAllDrives", "true")
        .json_body({})  // Empty body, changes are in query params
        .build()

    RETURN AWAIT executor.execute<File>(api_request)
END ALGORITHM
```

### 16.2 Create Folder

```
ALGORITHM CreateFolder(
    executor: RequestExecutor,
    request: CreateFolderRequest
) -> Result<File>
    // Build folder metadata
    metadata := {
        "name": request.name,
        "mimeType": "application/vnd.google-apps.folder"
    }

    IF request.description IS Some THEN
        metadata["description"] := request.description
    END IF

    IF request.parents IS Some AND NOT request.parents.is_empty() THEN
        metadata["parents"] := request.parents
    END IF

    IF request.folder_color_rgb IS Some THEN
        metadata["folderColorRgb"] := request.folder_color_rgb
    END IF

    IF request.properties IS Some THEN
        metadata["properties"] := request.properties
    END IF

    // Build API request
    api_request := ApiRequestBuilder::new("files", "create_folder")
        .method(POST)
        .path("/files")
        .query_bool("supportsAllDrives", request.supports_all_drives)
        .query_optional("fields", request.fields)
        .json_body(metadata)
        .build()

    RETURN AWAIT executor.execute<File>(api_request)
END ALGORITHM
```

### 16.3 Generate File IDs

```
ALGORITHM GenerateFileIds(
    executor: RequestExecutor,
    params: GenerateIdsParams
) -> Result<GeneratedIds>
    params := params OR GenerateIdsParams::default()

    // Validate count
    IF params.count IS Some AND (params.count < 1 OR params.count > 1000) THEN
        RETURN Error(RequestError::InvalidParameter("count must be between 1 and 1000"))
    END IF

    // Build API request
    api_request := ApiRequestBuilder::new("files", "generateIds")
        .method(GET)
        .path("/files/generateIds")
        .query_optional("count", params.count.map(ToString))
        .query_optional("space", params.space)
        .query_optional("type", params.type)
        .build()

    RETURN AWAIT executor.execute<GeneratedIds>(api_request)
END ALGORITHM
```

### 16.4 Empty Trash

```
ALGORITHM EmptyTrash(
    executor: RequestExecutor,
    params: EmptyTrashParams
) -> Result<void>
    params := params OR EmptyTrashParams::default()

    // Build API request
    api_request := ApiRequestBuilder::new("files", "emptyTrash")
        .method(DELETE)
        .path("/files/trash")
        .query_optional("driveId", params.drive_id)
        .query_bool("enforceSingleParent", params.enforce_single_parent)
        .build()

    RETURN AWAIT executor.execute<void>(api_request)
END ALGORITHM
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode - Part 2 |

---

**End of Pseudocode Part 2**

*Continue to Part 3 for Permissions, Comments, Revisions, Changes, and Drives services.*
