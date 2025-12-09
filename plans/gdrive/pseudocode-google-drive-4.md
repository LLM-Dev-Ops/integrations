# Google Drive Integration Module - Pseudocode (Part 4)

**SPARC Phase 2: Pseudocode - Testing & Observability**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/google-drive`

---

## Table of Contents

24. [Testing Patterns](#24-testing-patterns)
25. [Mock Implementations](#25-mock-implementations)
26. [Integration Test Patterns](#26-integration-test-patterns)
27. [Observability Implementation](#27-observability-implementation)
28. [Error Handling Patterns](#28-error-handling-patterns)
29. [Utility Functions](#29-utility-functions)

---

## 24. Testing Patterns

### 24.1 London-School TDD Approach

```
// London-School TDD: Interface-first, mock-based testing
// 1. Define interfaces (traits) first
// 2. Write tests using mocks
// 3. Implement production code
// 4. Verify behavior through mock interactions

// Test Structure
ALGORITHM TestStructure()
    // Arrange: Set up mocks and expectations
    mock_transport := MockHttpTransport::new()
    mock_auth := MockAuthProvider::new()

    // Configure mock responses
    mock_transport.expect_send()
        .with(RequestMatcher::method(GET).path("/files/abc123"))
        .returning(Ok(HttpResponse(
            status: 200,
            headers: {},
            body: '{"id": "abc123", "name": "test.txt"}'
        )))

    // Create system under test with mocks
    client := CreateGoogleDriveClient(GoogleDriveConfig(
        auth_provider: mock_auth,
        transport: mock_transport
    ))

    // Act: Execute the operation
    result := AWAIT client.files().get("abc123", None)

    // Assert: Verify results and mock interactions
    ASSERT result IS Ok
    ASSERT result.value.id == "abc123"
    ASSERT result.value.name == "test.txt"

    // Verify mock was called correctly
    mock_transport.verify_all()
END ALGORITHM
```

### 24.2 Test Categories

```
// Unit Tests: Test individual components in isolation

ALGORITHM TestFilesServiceGet_Success()
    // Test: Files.get returns file metadata successfully
    mock_executor := MockRequestExecutor::new()

    mock_executor.expect_execute()
        .with(RequestMatcher::service("files").operation("get"))
        .returning(Ok(File(
            id: "file123",
            name: "document.pdf",
            mime_type: "application/pdf",
            size: Some(1024)
        )))

    service := FilesServiceImpl::new(mock_executor, GoogleDriveConfig::default())

    result := AWAIT service.get("file123", None)

    ASSERT result IS Ok
    ASSERT result.value.id == "file123"
    ASSERT result.value.name == "document.pdf"
    mock_executor.verify()
END ALGORITHM

ALGORITHM TestFilesServiceGet_NotFound()
    // Test: Files.get returns error for non-existent file
    mock_executor := MockRequestExecutor::new()

    mock_executor.expect_execute()
        .with(RequestMatcher::service("files").operation("get"))
        .returning(Error(ResourceError::FileNotFound("File not found")))

    service := FilesServiceImpl::new(mock_executor, GoogleDriveConfig::default())

    result := AWAIT service.get("nonexistent", None)

    ASSERT result IS Error
    ASSERT result.error IS ResourceError::FileNotFound
    mock_executor.verify()
END ALGORITHM

ALGORITHM TestFilesServiceGet_InvalidFileId()
    // Test: Files.get validates file ID
    mock_executor := MockRequestExecutor::new()
    // Note: No expectations - should fail before calling executor

    service := FilesServiceImpl::new(mock_executor, GoogleDriveConfig::default())

    result := AWAIT service.get("", None)

    ASSERT result IS Error
    ASSERT result.error IS RequestError::MissingParameter
    mock_executor.verify_no_calls()
END ALGORITHM
```

### 24.3 Authentication Tests

```
ALGORITHM TestOAuth2Provider_GetToken_CachedValid()
    // Test: Returns cached token when valid
    provider := OAuth2Provider::new(
        client_id: "test_client",
        client_secret: SecretString("test_secret"),
        refresh_token: SecretString("test_refresh")
    )

    // Pre-populate cache with valid token
    provider.set_cached_token(AccessToken(
        token: SecretString("valid_token"),
        token_type: "Bearer",
        expires_at: Now() + Duration::hours(1),
        scopes: ["https://www.googleapis.com/auth/drive"]
    ))

    // Should return cached token without HTTP call
    result := AWAIT provider.get_access_token()

    ASSERT result IS Ok
    ASSERT result.value.token.expose() == "valid_token"
END ALGORITHM

ALGORITHM TestOAuth2Provider_GetToken_Expired()
    // Test: Refreshes token when expired
    mock_http := MockHttpClient::new()

    mock_http.expect_post("https://oauth2.googleapis.com/token")
        .returning(Ok(HttpResponse(
            status: 200,
            body: '{
                "access_token": "new_token",
                "token_type": "Bearer",
                "expires_in": 3600
            }'
        )))

    provider := OAuth2Provider::new_with_http(
        client_id: "test_client",
        client_secret: SecretString("test_secret"),
        refresh_token: SecretString("test_refresh"),
        http: mock_http
    )

    // Pre-populate cache with expired token
    provider.set_cached_token(AccessToken(
        token: SecretString("expired_token"),
        expires_at: Now() - Duration::hours(1),  // Already expired
        token_type: "Bearer",
        scopes: []
    ))

    result := AWAIT provider.get_access_token()

    ASSERT result IS Ok
    ASSERT result.value.token.expose() == "new_token"
    mock_http.verify()
END ALGORITHM

ALGORITHM TestServiceAccountProvider_JwtGeneration()
    // Test: Generates valid JWT for service account
    provider := ServiceAccountProvider::new(
        email: "test@project.iam.gserviceaccount.com",
        private_key: SecretString(TEST_PRIVATE_KEY),
        scopes: ["https://www.googleapis.com/auth/drive"],
        subject: None
    )

    jwt := provider.generate_jwt()

    ASSERT jwt IS Ok

    // Verify JWT structure
    parts := jwt.value.split(".")
    ASSERT parts.length == 3

    // Verify header
    header := Base64UrlDecode(parts[0])
    header_json := JsonDecode(header)
    ASSERT header_json["alg"] == "RS256"
    ASSERT header_json["typ"] == "JWT"

    // Verify claims
    claims := Base64UrlDecode(parts[1])
    claims_json := JsonDecode(claims)
    ASSERT claims_json["iss"] == "test@project.iam.gserviceaccount.com"
    ASSERT claims_json["scope"] == "https://www.googleapis.com/auth/drive"
END ALGORITHM
```

### 24.4 Upload Tests

```
ALGORITHM TestResumableUpload_ChunkedUpload()
    // Test: Resumable upload handles chunked uploads correctly
    mock_transport := MockHttpTransport::new()

    // Expect initiation request
    mock_transport.expect_send()
        .with(RequestMatcher::method(POST).query("uploadType", "resumable"))
        .returning(Ok(HttpResponse(
            status: 200,
            headers: {"Location": "https://www.googleapis.com/upload/drive/v3/files?uploadId=xyz123"},
            body: ""
        )))

    // Expect first chunk (returns 308 - incomplete)
    mock_transport.expect_send()
        .with(RequestMatcher::method(PUT).header("Content-Range", "bytes 0-1023/2048"))
        .returning(Ok(HttpResponse(
            status: 308,
            headers: {"Range": "bytes=0-1023"},
            body: ""
        )))

    // Expect second chunk (returns 200 - complete)
    mock_transport.expect_send()
        .with(RequestMatcher::method(PUT).header("Content-Range", "bytes 1024-2047/2048"))
        .returning(Ok(HttpResponse(
            status: 200,
            headers: {},
            body: '{"id": "file123", "name": "test.bin"}'
        )))

    executor := RequestExecutor::new(mock_transport, MockAuthProvider::new())
    config := GoogleDriveConfig::default()
    config.upload_chunk_size := 1024

    // Create 2KB of test data
    test_data := Bytes::repeat(0x42, 2048)

    session := AWAIT InitiateResumableUpload(executor, config, CreateResumableRequest(
        name: "test.bin",
        total_size: 2048
    ))

    ASSERT session IS Ok

    result := AWAIT session.value.upload_bytes(test_data)

    ASSERT result IS Ok
    ASSERT result.value.id == "file123"
    mock_transport.verify()
END ALGORITHM

ALGORITHM TestResumableUpload_Resume()
    // Test: Resumable upload can resume after interruption
    mock_transport := MockHttpTransport::new()

    // First chunk fails
    mock_transport.expect_send()
        .with(RequestMatcher::method(PUT).header("Content-Range", "bytes 0-1023/2048"))
        .returning(Error(TransportError::ConnectionFailed("Connection reset")))

    // Query status shows 512 bytes received
    mock_transport.expect_send()
        .with(RequestMatcher::method(PUT).header("Content-Range", "bytes */2048"))
        .returning(Ok(HttpResponse(
            status: 308,
            headers: {"Range": "bytes=0-511"},
            body: ""
        )))

    // Retry from 512 succeeds
    mock_transport.expect_send()
        .with(RequestMatcher::method(PUT).header("Content-Range", "bytes 512-2047/2048"))
        .returning(Ok(HttpResponse(
            status: 200,
            body: '{"id": "file123"}'
        )))

    session := ResumableUploadSessionImpl::new(
        executor: RequestExecutor::new(mock_transport, MockAuthProvider::new()),
        upload_uri: "https://upload.uri",
        total_size: 2048,
        chunk_size: 1024,
        content_type: "application/octet-stream"
    )

    test_data := Bytes::repeat(0x42, 2048)
    result := AWAIT session.upload_bytes(test_data)

    ASSERT result IS Ok
    mock_transport.verify()
END ALGORITHM
```

---

## 25. Mock Implementations

### 25.1 Mock Transport

```
CLASS MockHttpTransport IMPLEMENTS HttpTransport
    PRIVATE expectations: List<MockExpectation>
    PRIVATE calls: List<HttpRequest>
    PRIVATE call_index: usize

    FUNCTION new() -> MockHttpTransport
        RETURN MockHttpTransport(
            expectations: [],
            calls: [],
            call_index: 0
        )
    END FUNCTION

    FUNCTION expect_send() -> MockExpectationBuilder
        builder := MockExpectationBuilder::new(self)
        RETURN builder
    END FUNCTION

    ASYNC FUNCTION send(request: HttpRequest) -> Result<HttpResponse>
        self.calls.append(request.clone())

        IF self.call_index >= self.expectations.length THEN
            RETURN Error(TransportError::ConnectionFailed(
                "Unexpected call to send(). Expected " + self.expectations.length +
                " calls, got " + (self.call_index + 1)
            ))
        END IF

        expectation := self.expectations[self.call_index]
        self.call_index += 1

        // Verify request matches expectation
        IF NOT expectation.matcher.matches(request) THEN
            RETURN Error(TransportError::ConnectionFailed(
                "Request did not match expectation: " + expectation.matcher.describe()
            ))
        END IF

        // Return configured response
        RETURN expectation.response.clone()
    END ASYNC FUNCTION

    FUNCTION verify_all()
        IF self.call_index != self.expectations.length THEN
            PANIC("Expected " + self.expectations.length + " calls, got " + self.call_index)
        END IF
    END FUNCTION

    FUNCTION verify_no_calls()
        IF self.calls.length > 0 THEN
            PANIC("Expected no calls, got " + self.calls.length)
        END IF
    END FUNCTION

    FUNCTION get_calls() -> List<HttpRequest>
        RETURN self.calls.clone()
    END FUNCTION
END CLASS

CLASS MockExpectationBuilder
    PRIVATE transport: MockHttpTransport
    PRIVATE matcher: RequestMatcher
    PRIVATE response: Result<HttpResponse>

    FUNCTION with(matcher: RequestMatcher) -> MockExpectationBuilder
        self.matcher := matcher
        RETURN self
    END FUNCTION

    FUNCTION returning(response: Result<HttpResponse>) -> MockExpectationBuilder
        self.response := response
        self.transport.expectations.append(MockExpectation(
            matcher: self.matcher,
            response: self.response
        ))
        RETURN self
    END FUNCTION
END CLASS

CLASS RequestMatcher
    PRIVATE method: Option<HttpMethod>
    PRIVATE path: Option<String>
    PRIVATE query_params: Map<String, String>
    PRIVATE headers: Map<String, String>
    PRIVATE body_matcher: Option<BodyMatcher>

    STATIC FUNCTION method(method: HttpMethod) -> RequestMatcher
        RETURN RequestMatcher(method: Some(method))
    END FUNCTION

    FUNCTION path(path: String) -> RequestMatcher
        self.path := Some(path)
        RETURN self
    END FUNCTION

    FUNCTION query(key: String, value: String) -> RequestMatcher
        self.query_params[key] := value
        RETURN self
    END FUNCTION

    FUNCTION header(name: String, value: String) -> RequestMatcher
        self.headers[name] := value
        RETURN self
    END FUNCTION

    FUNCTION body_contains(substring: String) -> RequestMatcher
        self.body_matcher := Some(BodyMatcher::Contains(substring))
        RETURN self
    END FUNCTION

    FUNCTION matches(request: HttpRequest) -> bool
        IF self.method IS Some AND request.method != self.method THEN
            RETURN false
        END IF

        IF self.path IS Some AND NOT request.url.path().contains(self.path) THEN
            RETURN false
        END IF

        FOR (key, value) IN self.query_params DO
            IF request.url.query_param(key) != Some(value) THEN
                RETURN false
            END IF
        END FOR

        FOR (name, value) IN self.headers DO
            IF request.headers.get(name) != Some(value) THEN
                RETURN false
            END IF
        END FOR

        IF self.body_matcher IS Some THEN
            body_str := request.body.map(ToString).unwrap_or("")
            IF NOT self.body_matcher.matches(body_str) THEN
                RETURN false
            END IF
        END IF

        RETURN true
    END FUNCTION

    FUNCTION describe() -> String
        parts := []
        IF self.method IS Some THEN
            parts.append("method=" + self.method.to_string())
        END IF
        IF self.path IS Some THEN
            parts.append("path contains '" + self.path + "'")
        END IF
        FOR (key, value) IN self.query_params DO
            parts.append("query." + key + "=" + value)
        END FOR
        RETURN parts.join(", ")
    END FUNCTION
END CLASS
```

### 25.2 Mock Auth Provider

```
CLASS MockAuthProvider IMPLEMENTS AuthProvider
    PRIVATE token: AccessToken
    PRIVATE should_fail: bool
    PRIVATE fail_message: String
    PRIVATE call_count: u32

    FUNCTION new() -> MockAuthProvider
        RETURN MockAuthProvider(
            token: AccessToken(
                token: SecretString("mock_access_token"),
                token_type: "Bearer",
                expires_at: Now() + Duration::hours(1),
                scopes: ["https://www.googleapis.com/auth/drive"]
            ),
            should_fail: false,
            fail_message: "",
            call_count: 0
        )
    END FUNCTION

    FUNCTION with_token(token: String) -> MockAuthProvider
        self.token.token := SecretString(token)
        RETURN self
    END FUNCTION

    FUNCTION failing_with(message: String) -> MockAuthProvider
        self.should_fail := true
        self.fail_message := message
        RETURN self
    END FUNCTION

    ASYNC FUNCTION get_access_token() -> Result<AccessToken>
        self.call_count += 1

        IF self.should_fail THEN
            RETURN Error(AuthenticationError::RefreshFailed(self.fail_message))
        END IF

        RETURN Ok(self.token.clone())
    END ASYNC FUNCTION

    ASYNC FUNCTION refresh_token() -> Result<AccessToken>
        RETURN AWAIT self.get_access_token()
    END ASYNC FUNCTION

    FUNCTION is_expired() -> bool
        RETURN Now() >= self.token.expires_at
    END FUNCTION

    FUNCTION get_call_count() -> u32
        RETURN self.call_count
    END FUNCTION
END CLASS
```

### 25.3 Mock Files Service

```
CLASS MockFilesService IMPLEMENTS FilesService
    PRIVATE files: Map<String, File>
    PRIVATE expectations: List<MockServiceExpectation>
    PRIVATE calls: List<ServiceCall>

    FUNCTION new() -> MockFilesService
        RETURN MockFilesService(
            files: {},
            expectations: [],
            calls: []
        )
    END FUNCTION

    FUNCTION with_file(file: File) -> MockFilesService
        self.files[file.id] := file
        RETURN self
    END FUNCTION

    FUNCTION expect_get(file_id: String) -> MockServiceExpectationBuilder
        RETURN MockServiceExpectationBuilder::new(self, "get", file_id)
    END FUNCTION

    FUNCTION expect_create() -> MockServiceExpectationBuilder
        RETURN MockServiceExpectationBuilder::new(self, "create", None)
    END FUNCTION

    ASYNC FUNCTION get(file_id: String, params: Option<GetFileParams>) -> Result<File>
        self.calls.append(ServiceCall("get", file_id, params))

        // Check for expectations
        FOR exp IN self.expectations DO
            IF exp.operation == "get" AND exp.file_id == Some(file_id) THEN
                RETURN exp.response
            END IF
        END FOR

        // Default behavior: lookup in files map
        IF self.files.contains(file_id) THEN
            RETURN Ok(self.files[file_id].clone())
        END IF

        RETURN Error(ResourceError::FileNotFound("File not found: " + file_id))
    END ASYNC FUNCTION

    ASYNC FUNCTION create(request: CreateFileRequest) -> Result<File>
        self.calls.append(ServiceCall("create", None, request))

        // Check for expectations
        FOR exp IN self.expectations DO
            IF exp.operation == "create" THEN
                RETURN exp.response
            END IF
        END FOR

        // Default behavior: create file with generated ID
        file := File(
            id: GenerateId(),
            name: request.name,
            mime_type: request.mime_type.unwrap_or("application/octet-stream"),
            created_time: Now(),
            modified_time: Now()
        )

        self.files[file.id] := file.clone()
        RETURN Ok(file)
    END ASYNC FUNCTION

    // ... implement other methods similarly

    FUNCTION verify_called(operation: String, times: u32)
        count := self.calls.filter(|c| c.operation == operation).length
        IF count != times THEN
            PANIC("Expected " + operation + " to be called " + times +
                  " times, was called " + count + " times")
        END IF
    END FUNCTION

    FUNCTION get_calls() -> List<ServiceCall>
        RETURN self.calls.clone()
    END FUNCTION
END CLASS
```

---

## 26. Integration Test Patterns

### 26.1 Integration Test Setup

```
ALGORITHM SetupIntegrationTest() -> TestContext
    // Load credentials from environment or test config
    credentials := LoadTestCredentials()

    // Create client with test configuration
    config := GoogleDriveConfig::builder()
        .with_service_account(
            email: credentials.client_email,
            private_key: credentials.private_key,
            scopes: [scopes::DRIVE],
            subject: None
        )
        .with_timeout(Duration::seconds(30))
        .with_max_retries(3)
        .build()

    client := CreateGoogleDriveClient(config)

    // Create test folder for isolation
    test_folder := AWAIT client.files().create_folder(CreateFolderRequest(
        name: "integration-test-" + GenerateUuid(),
        parents: None
    ))

    RETURN TestContext(
        client: client,
        test_folder_id: test_folder.id,
        created_files: []
    )
END ALGORITHM

ALGORITHM TeardownIntegrationTest(context: TestContext)
    // Clean up all created files
    FOR file_id IN context.created_files DO
        TRY
            AWAIT context.client.files().delete(file_id, None)
        CATCH error
            // Log but don't fail teardown
            Log::warn("Failed to delete test file: " + file_id)
        END TRY
    END FOR

    // Delete test folder
    TRY
        AWAIT context.client.files().delete(context.test_folder_id, None)
    CATCH error
        Log::warn("Failed to delete test folder")
    END TRY
END ALGORITHM
```

### 26.2 Integration Test Examples

```
ALGORITHM IntegrationTest_CreateAndGetFile()
    context := SetupIntegrationTest()

    TRY
        // Create a file
        content := Bytes::from("Hello, Google Drive!")

        file := AWAIT context.client.files().create_multipart(CreateMultipartRequest(
            name: "test-file.txt",
            parents: [context.test_folder_id],
            content: content,
            content_mime_type: "text/plain"
        ))

        context.created_files.append(file.id)

        ASSERT file.name == "test-file.txt"
        ASSERT file.mime_type == "text/plain"
        ASSERT file.parents.contains(context.test_folder_id)

        // Get the file back
        retrieved := AWAIT context.client.files().get(file.id, Some(GetFileParams(
            fields: "id,name,mimeType,size"
        )))

        ASSERT retrieved.id == file.id
        ASSERT retrieved.name == file.name
        ASSERT retrieved.size == Some(content.length)

        // Download content
        downloaded := AWAIT context.client.files().download(file.id, None)

        ASSERT downloaded == content

    FINALLY
        TeardownIntegrationTest(context)
    END TRY
END ALGORITHM

ALGORITHM IntegrationTest_ResumableUpload()
    context := SetupIntegrationTest()

    TRY
        // Create large test content (10MB)
        content := GenerateRandomBytes(10 * 1024 * 1024)

        // Initiate resumable upload
        session := AWAIT context.client.files().create_resumable(CreateResumableRequest(
            name: "large-file.bin",
            parents: [context.test_folder_id],
            content_mime_type: "application/octet-stream",
            total_size: content.length
        ))

        // Upload content
        file := AWAIT session.upload_bytes(content)

        context.created_files.append(file.id)

        ASSERT file.name == "large-file.bin"
        ASSERT ParseInt(file.size.unwrap()) == content.length

        // Verify by downloading
        downloaded := AWAIT context.client.files().download(file.id, None)

        ASSERT downloaded == content

    FINALLY
        TeardownIntegrationTest(context)
    END TRY
END ALGORITHM

ALGORITHM IntegrationTest_Permissions()
    context := SetupIntegrationTest()

    TRY
        // Create a file
        file := AWAIT context.client.files().create(CreateFileRequest(
            name: "shared-file.txt",
            parents: [context.test_folder_id],
            mime_type: "text/plain"
        ))

        context.created_files.append(file.id)

        // Create a permission
        permission := AWAIT context.client.permissions().create(file.id, CreatePermissionRequest(
            role: "reader",
            type: "anyone",
            allow_file_discovery: false
        ))

        ASSERT permission.role == "reader"
        ASSERT permission.type == "anyone"

        // List permissions
        permissions := AWAIT context.client.permissions().list(file.id, None)

        ASSERT permissions.permissions.length >= 1
        ASSERT permissions.permissions.any(|p| p.id == permission.id)

        // Update permission
        updated := AWAIT context.client.permissions().update(
            file.id,
            permission.id,
            UpdatePermissionRequest(role: "writer")
        )

        ASSERT updated.role == "writer"

        // Delete permission
        AWAIT context.client.permissions().delete(file.id, permission.id, None)

        // Verify deleted
        final_perms := AWAIT context.client.permissions().list(file.id, None)
        ASSERT NOT final_perms.permissions.any(|p| p.id == permission.id)

    FINALLY
        TeardownIntegrationTest(context)
    END TRY
END ALGORITHM

ALGORITHM IntegrationTest_Pagination()
    context := SetupIntegrationTest()

    TRY
        // Create multiple files
        FOR i := 0 TO 25 DO
            file := AWAIT context.client.files().create(CreateFileRequest(
                name: "paginated-file-" + i + ".txt",
                parents: [context.test_folder_id],
                mime_type: "text/plain"
            ))
            context.created_files.append(file.id)
        END FOR

        // List with small page size
        all_files := []
        page_token := None

        WHILE true DO
            result := AWAIT context.client.files().list(Some(ListFilesParams(
                q: "'" + context.test_folder_id + "' in parents",
                page_size: 10,
                page_token: page_token
            )))

            all_files.extend(result.files)

            IF result.next_page_token IS None THEN
                BREAK
            END IF

            page_token := result.next_page_token
        END WHILE

        ASSERT all_files.length == 25

        // Test list_all auto-pagination
        stream_files := []
        stream := context.client.files().list_all(Some(ListFilesParams(
            q: "'" + context.test_folder_id + "' in parents",
            page_size: 10
        )))

        FOR file IN stream DO
            stream_files.append(file)
        END FOR

        ASSERT stream_files.length == 25

    FINALLY
        TeardownIntegrationTest(context)
    END TRY
END ALGORITHM
```

---

## 27. Observability Implementation

### 27.1 Tracing Integration

```
CLASS TracingRequestExecutor
    PRIVATE inner: RequestExecutor
    PRIVATE tracer: Tracer

    FUNCTION new(inner: RequestExecutor, tracer: Tracer) -> TracingRequestExecutor
        RETURN TracingRequestExecutor(
            inner: inner,
            tracer: tracer
        )
    END FUNCTION

    ASYNC FUNCTION execute<T>(request: ApiRequest) -> Result<T>
        // Create span for the operation
        span := self.tracer.start_span(
            name: "google_drive." + request.service + "." + request.operation,
            kind: SpanKind::CLIENT
        )

        // Set attributes
        span.set_attribute("google_drive.service", request.service)
        span.set_attribute("google_drive.operation", request.operation)
        span.set_attribute("http.method", request.method.to_string())
        span.set_attribute("http.url", SanitizeUrl(request.path))

        IF request.is_upload THEN
            span.set_attribute("google_drive.upload_type", GetUploadType(request))
        END IF

        start_time := Instant::now()

        TRY
            result := AWAIT self.inner.execute(request)

            elapsed := Instant::now() - start_time

            span.set_attribute("http.status_code", GetStatusCode(result))
            span.set_attribute("google_drive.duration_ms", elapsed.as_millis())

            IF result IS Ok THEN
                span.set_status(SpanStatus::OK)
            ELSE
                span.set_status(SpanStatus::ERROR)
                span.set_attribute("error.type", result.error.type_name())
                span.set_attribute("error.message", result.error.message)

                IF result.error.retry_after() IS Some THEN
                    span.set_attribute("google_drive.retry_after_seconds",
                        result.error.retry_after().as_secs())
                END IF
            END IF

            RETURN result
        FINALLY
            span.end()
        END TRY
    END ASYNC FUNCTION
END CLASS

ALGORITHM SanitizeUrl(url: String) -> String
    // Remove sensitive query parameters
    parsed := Url::parse(url)

    // Remove access tokens, keys, etc from query
    sanitized_params := []
    FOR (key, value) IN parsed.query_pairs() DO
        IF key IN ["access_token", "key", "token"] THEN
            sanitized_params.append((key, "[REDACTED]"))
        ELSE
            sanitized_params.append((key, value))
        END IF
    END FOR

    parsed.set_query(sanitized_params)
    RETURN parsed.to_string()
END ALGORITHM
```

### 27.2 Metrics Recording

```
CLASS MetricsRecorder
    PRIVATE registry: MetricsRegistry

    // Counters
    PRIVATE requests_total: Counter
    PRIVATE errors_total: Counter
    PRIVATE rate_limit_hits: Counter
    PRIVATE upload_bytes: Counter
    PRIVATE download_bytes: Counter

    // Histograms
    PRIVATE request_duration: Histogram
    PRIVATE upload_duration: Histogram

    // Gauges
    PRIVATE circuit_breaker_state: Gauge

    FUNCTION new() -> MetricsRecorder
        registry := MetricsRegistry::new()

        requests_total := registry.counter(
            name: "google_drive_requests_total",
            description: "Total number of Google Drive API requests",
            labels: ["service", "operation", "method", "status"]
        )

        errors_total := registry.counter(
            name: "google_drive_errors_total",
            description: "Total number of Google Drive API errors",
            labels: ["service", "error_type"]
        )

        rate_limit_hits := registry.counter(
            name: "google_drive_rate_limit_hits_total",
            description: "Total number of rate limit hits",
            labels: ["type"]
        )

        upload_bytes := registry.counter(
            name: "google_drive_upload_bytes_total",
            description: "Total bytes uploaded",
            labels: ["upload_type"]
        )

        download_bytes := registry.counter(
            name: "google_drive_download_bytes_total",
            description: "Total bytes downloaded",
            labels: []
        )

        request_duration := registry.histogram(
            name: "google_drive_request_duration_seconds",
            description: "Duration of Google Drive API requests",
            labels: ["service", "operation", "method"],
            buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
        )

        upload_duration := registry.histogram(
            name: "google_drive_upload_duration_seconds",
            description: "Duration of uploads",
            labels: ["upload_type"],
            buckets: [0.1, 0.5, 1.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0]
        )

        circuit_breaker_state := registry.gauge(
            name: "google_drive_circuit_breaker_state",
            description: "Circuit breaker state (0=closed, 1=open, 0.5=half-open)",
            labels: []
        )

        RETURN MetricsRecorder(
            registry: registry,
            requests_total: requests_total,
            errors_total: errors_total,
            rate_limit_hits: rate_limit_hits,
            upload_bytes: upload_bytes,
            download_bytes: download_bytes,
            request_duration: request_duration,
            upload_duration: upload_duration,
            circuit_breaker_state: circuit_breaker_state
        )
    END FUNCTION

    FUNCTION record_request(service: String, operation: String, method: String, status: String, duration: Duration)
        self.requests_total.increment(labels: {
            "service": service,
            "operation": operation,
            "method": method,
            "status": status
        })

        self.request_duration.observe(duration.as_secs_f64(), labels: {
            "service": service,
            "operation": operation,
            "method": method
        })
    END FUNCTION

    FUNCTION record_error(service: String, error_type: String)
        self.errors_total.increment(labels: {
            "service": service,
            "error_type": error_type
        })
    END FUNCTION

    FUNCTION record_rate_limit(limit_type: String)
        self.rate_limit_hits.increment(labels: {"type": limit_type})
    END FUNCTION

    FUNCTION record_upload(upload_type: String, bytes: u64, duration: Duration)
        self.upload_bytes.increment_by(bytes, labels: {"upload_type": upload_type})
        self.upload_duration.observe(duration.as_secs_f64(), labels: {"upload_type": upload_type})
    END FUNCTION

    FUNCTION record_download(bytes: u64)
        self.download_bytes.increment_by(bytes, labels: {})
    END FUNCTION

    FUNCTION set_circuit_breaker_state(state: CircuitState)
        value := MATCH state
            CASE CLOSED: 0.0
            CASE HALF_OPEN: 0.5
            CASE OPEN: 1.0
        END MATCH
        self.circuit_breaker_state.set(value, labels: {})
    END FUNCTION
END CLASS
```

### 27.3 Structured Logging

```
CLASS StructuredLogger
    PRIVATE inner: Logger
    PRIVATE default_fields: Map<String, String>

    FUNCTION new(name: String) -> StructuredLogger
        RETURN StructuredLogger(
            inner: Logger::new(name),
            default_fields: {}
        )
    END FUNCTION

    FUNCTION with_field(key: String, value: String) -> StructuredLogger
        self.default_fields[key] := value
        RETURN self
    END FUNCTION

    FUNCTION debug(message: String, fields: Map<String, Any>)
        self.log(Level::DEBUG, message, fields)
    END FUNCTION

    FUNCTION info(message: String, fields: Map<String, Any>)
        self.log(Level::INFO, message, fields)
    END FUNCTION

    FUNCTION warn(message: String, fields: Map<String, Any>)
        self.log(Level::WARN, message, fields)
    END FUNCTION

    FUNCTION error(message: String, fields: Map<String, Any>)
        self.log(Level::ERROR, message, fields)
    END FUNCTION

    PRIVATE FUNCTION log(level: Level, message: String, fields: Map<String, Any>)
        // Merge default fields
        all_fields := self.default_fields.clone()
        FOR (key, value) IN fields DO
            all_fields[key] := SanitizeLogValue(key, value)
        END FOR

        self.inner.log(level, message, all_fields)
    END FUNCTION
END CLASS

ALGORITHM SanitizeLogValue(key: String, value: Any) -> String
    // Redact sensitive fields
    sensitive_keys := ["token", "access_token", "refresh_token", "private_key",
                       "secret", "password", "authorization", "key"]

    key_lower := key.to_lowercase()
    FOR sensitive IN sensitive_keys DO
        IF key_lower.contains(sensitive) THEN
            RETURN "[REDACTED]"
        END IF
    END FOR

    // Truncate long values
    str_value := value.to_string()
    IF str_value.length > 1000 THEN
        RETURN str_value[0:1000] + "...[truncated]"
    END IF

    RETURN str_value
END ALGORITHM
```

---

## 28. Error Handling Patterns

### 28.1 Error Recovery

```
ALGORITHM HandleGoogleDriveError(error: GoogleDriveError, context: OperationContext) -> ErrorAction
    MATCH error
        // Authentication errors - try refresh
        CASE AuthenticationError::ExpiredToken(_):
            RETURN ErrorAction::RefreshTokenAndRetry

        CASE AuthenticationError::InvalidToken(_):
            RETURN ErrorAction::Fail  // Can't recover

        // Rate limits - wait and retry
        CASE QuotaError::UserRateLimitExceeded(_, retry_after):
            IF retry_after IS Some THEN
                RETURN ErrorAction::WaitAndRetry(retry_after)
            ELSE
                RETURN ErrorAction::WaitAndRetry(Duration::seconds(60))
            END IF

        CASE QuotaError::ProjectRateLimitExceeded(_, retry_after):
            IF retry_after IS Some THEN
                RETURN ErrorAction::WaitAndRetry(retry_after)
            ELSE
                RETURN ErrorAction::WaitAndRetry(Duration::minutes(5))
            END IF

        // Server errors - retry with backoff
        CASE ServerError::InternalError(_):
            RETURN ErrorAction::RetryWithBackoff(context.retry_count)

        CASE ServerError::ServiceUnavailable(_, retry_after):
            IF retry_after IS Some THEN
                RETURN ErrorAction::WaitAndRetry(retry_after)
            ELSE
                RETURN ErrorAction::RetryWithBackoff(context.retry_count)
            END IF

        CASE ServerError::BackendError(_):
            RETURN ErrorAction::RetryWithBackoff(context.retry_count)

        // Network errors - may be transient
        CASE NetworkError::Timeout(_):
            RETURN ErrorAction::RetryWithBackoff(context.retry_count)

        CASE NetworkError::ConnectionFailed(_):
            RETURN ErrorAction::RetryWithBackoff(context.retry_count)

        // Upload interruption - can resume
        CASE UploadError::UploadInterrupted(_):
            IF context.is_resumable_upload THEN
                RETURN ErrorAction::ResumeUpload
            ELSE
                RETURN ErrorAction::RetryWithBackoff(context.retry_count)
            END IF

        // Client errors - don't retry
        CASE RequestError::_:
            RETURN ErrorAction::Fail

        CASE ResourceError::_:
            RETURN ErrorAction::Fail

        CASE AuthorizationError::_:
            RETURN ErrorAction::Fail

        DEFAULT:
            RETURN ErrorAction::Fail
    END MATCH
END ALGORITHM

ENUM ErrorAction
    Fail
    RefreshTokenAndRetry
    WaitAndRetry(Duration)
    RetryWithBackoff(u32)
    ResumeUpload
END ENUM
```

### 28.2 Error Context Enrichment

```
ALGORITHM EnrichError(error: GoogleDriveError, context: RequestContext) -> GoogleDriveError
    // Add context to error
    enriched := error.with_context({
        "request_id": context.request_id,
        "trace_id": context.trace_id,
        "operation": context.operation,
        "service": context.service,
        "file_id": context.file_id,
        "timestamp": Now().to_rfc3339()
    })

    // Add retry information if applicable
    IF context.retry_count > 0 THEN
        enriched := enriched.with_context({
            "retry_count": context.retry_count,
            "total_duration_ms": context.total_duration.as_millis()
        })
    END IF

    RETURN enriched
END ALGORITHM
```

---

## 29. Utility Functions

### 29.1 Query Builder

```
CLASS QueryBuilder
    PRIVATE conditions: List<String>

    FUNCTION new() -> QueryBuilder
        RETURN QueryBuilder(conditions: [])
    END FUNCTION

    FUNCTION name_equals(name: String) -> QueryBuilder
        self.conditions.append("name = '" + EscapeQueryString(name) + "'")
        RETURN self
    END FUNCTION

    FUNCTION name_contains(substring: String) -> QueryBuilder
        self.conditions.append("name contains '" + EscapeQueryString(substring) + "'")
        RETURN self
    END FUNCTION

    FUNCTION mime_type(mime_type: String) -> QueryBuilder
        self.conditions.append("mimeType = '" + mime_type + "'")
        RETURN self
    END FUNCTION

    FUNCTION is_folder() -> QueryBuilder
        self.conditions.append("mimeType = 'application/vnd.google-apps.folder'")
        RETURN self
    END FUNCTION

    FUNCTION in_folder(folder_id: String) -> QueryBuilder
        self.conditions.append("'" + folder_id + "' in parents")
        RETURN self
    END FUNCTION

    FUNCTION not_trashed() -> QueryBuilder
        self.conditions.append("trashed = false")
        RETURN self
    END FUNCTION

    FUNCTION trashed() -> QueryBuilder
        self.conditions.append("trashed = true")
        RETURN self
    END FUNCTION

    FUNCTION starred() -> QueryBuilder
        self.conditions.append("starred = true")
        RETURN self
    END FUNCTION

    FUNCTION shared_with_me() -> QueryBuilder
        self.conditions.append("sharedWithMe = true")
        RETURN self
    END FUNCTION

    FUNCTION modified_after(time: DateTime) -> QueryBuilder
        self.conditions.append("modifiedTime > '" + time.to_rfc3339() + "'")
        RETURN self
    END FUNCTION

    FUNCTION modified_before(time: DateTime) -> QueryBuilder
        self.conditions.append("modifiedTime < '" + time.to_rfc3339() + "'")
        RETURN self
    END FUNCTION

    FUNCTION owner(email: String) -> QueryBuilder
        self.conditions.append("'" + email + "' in owners")
        RETURN self
    END FUNCTION

    FUNCTION and() -> QueryBuilder
        // Implicit - conditions are ANDed by default
        RETURN self
    END FUNCTION

    FUNCTION or_group(builder: QueryBuilder) -> QueryBuilder
        IF builder.conditions.length > 0 THEN
            group := "(" + builder.conditions.join(" or ") + ")"
            self.conditions.append(group)
        END IF
        RETURN self
    END FUNCTION

    FUNCTION build() -> String
        RETURN self.conditions.join(" and ")
    END FUNCTION
END CLASS

ALGORITHM EscapeQueryString(s: String) -> String
    // Escape single quotes and backslashes
    result := s.replace("\\", "\\\\")
    result := result.replace("'", "\\'")
    RETURN result
END ALGORITHM

// Usage example:
// query := QueryBuilder::new()
//     .in_folder("abc123")
//     .mime_type("application/pdf")
//     .not_trashed()
//     .modified_after(DateTime::parse("2024-01-01"))
//     .build()
// Result: "'abc123' in parents and mimeType = 'application/pdf' and trashed = false and modifiedTime > '2024-01-01T00:00:00Z'"
```

### 29.2 Field Selector Builder

```
CLASS FieldsBuilder
    PRIVATE fields: List<String>

    FUNCTION new() -> FieldsBuilder
        RETURN FieldsBuilder(fields: [])
    END FUNCTION

    FUNCTION basic() -> FieldsBuilder
        self.fields.extend(["id", "name", "mimeType"])
        RETURN self
    END FUNCTION

    FUNCTION metadata() -> FieldsBuilder
        self.fields.extend([
            "id", "name", "mimeType", "description",
            "size", "createdTime", "modifiedTime"
        ])
        RETURN self
    END FUNCTION

    FUNCTION full() -> FieldsBuilder
        self.fields.extend([
            "id", "name", "mimeType", "description",
            "size", "createdTime", "modifiedTime",
            "parents", "webViewLink", "webContentLink",
            "owners", "permissions", "capabilities",
            "md5Checksum", "headRevisionId"
        ])
        RETURN self
    END FUNCTION

    FUNCTION add(field: String) -> FieldsBuilder
        self.fields.append(field)
        RETURN self
    END FUNCTION

    FUNCTION add_all(fields: List<String>) -> FieldsBuilder
        self.fields.extend(fields)
        RETURN self
    END FUNCTION

    FUNCTION for_list() -> String
        // Wrap fields for list response
        RETURN "nextPageToken,files(" + self.build() + ")"
    END FUNCTION

    FUNCTION build() -> String
        // Deduplicate and join
        unique := self.fields.unique()
        RETURN unique.join(",")
    END FUNCTION
END CLASS
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode - Part 4 |

---

**End of Pseudocode Phase**

*The next phase (Architecture) will provide detailed architectural diagrams, component relationships, and implementation guidance.*
