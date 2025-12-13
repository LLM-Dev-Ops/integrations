# Google Cloud Storage Integration Module - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-13
**Module:** `integrations/gcs`

---

## 1. Core Client

```pseudocode
CLASS GcsClient:
    FIELDS:
        config: GcsConfig
        http_transport: HttpTransport
        auth_provider: GcpAuthProvider
        circuit_breaker: CircuitBreaker
        metrics: MetricsCollector

    CONSTRUCTOR(config: GcsConfig):
        VALIDATE config
        INITIALIZE http_transport with config.timeout
        INITIALIZE auth_provider with config.credentials
        INITIALIZE circuit_breaker with config.circuit_breaker_config
        INITIALIZE metrics

    METHOD upload_object(request: UploadRequest) -> ObjectMetadata:
        span = START_SPAN("gcs.upload")
        span.set_attribute("bucket", request.bucket)
        span.set_attribute("object", request.name)

        TRY:
            circuit_breaker.check("gcs")

            // Determine upload strategy based on size
            IF request.content_length <= SIMPLE_UPLOAD_THRESHOLD:
                result = simple_upload(request)
            ELSE:
                result = resumable_upload(request)

            circuit_breaker.record_success("gcs")
            EMIT_METRIC("gcs_requests_total", bucket=request.bucket, operation="upload", status="success")
            EMIT_METRIC("gcs_bytes_transferred_total", bucket=request.bucket, direction="upload", value=request.content_length)

            RETURN result
        CATCH error:
            span.record_error(error)
            circuit_breaker.record_failure("gcs")
            EMIT_METRIC("gcs_errors_total", operation="upload", error_type=error.type())

            IF error.is_retryable():
                RETURN RETRY_WITH_BACKOFF(upload_object, request)
            THROW error
        FINALLY:
            span.end()

    METHOD download_object(request: DownloadRequest) -> DownloadResponse:
        span = START_SPAN("gcs.download")
        span.set_attribute("bucket", request.bucket)
        span.set_attribute("object", request.object_name)

        TRY:
            circuit_breaker.check("gcs")
            token = auth_provider.get_access_token()

            url = BUILD_DOWNLOAD_URL(request.bucket, request.object_name, request.generation)

            headers = {
                "Authorization": f"Bearer {token}",
            }
            IF request.range:
                headers["Range"] = f"bytes={request.range.start}-{request.range.end}"
                span.set_attribute("range", true)

            http_request = HttpRequest {
                method: GET,
                url: url,
                headers: headers,
            }

            IF request.streaming:
                response = http_transport.send_streaming(http_request)
                RETURN StreamingDownloadResponse {
                    stream: response.body,
                    content_length: response.headers["Content-Length"],
                    content_type: response.headers["Content-Type"],
                    generation: response.headers["x-goog-generation"],
                }
            ELSE:
                response = http_transport.send(http_request)
                IF response.status == 206:
                    // Partial content (range request)
                    span.set_attribute("partial", true)
                ELSE IF response.status != 200:
                    THROW PARSE_GCS_ERROR(response)

                circuit_breaker.record_success("gcs")
                RETURN DownloadResponse {
                    data: response.body,
                    metadata: PARSE_OBJECT_METADATA(response.headers),
                }

        CATCH error:
            span.record_error(error)
            IF error.is_retryable():
                RETURN RETRY_WITH_BACKOFF(download_object, request)
            THROW error
        FINALLY:
            span.end()

    METHOD delete_object(bucket: String, object_name: String, generation: Option<i64>) -> void:
        span = START_SPAN("gcs.delete")

        TRY:
            circuit_breaker.check("gcs")
            token = auth_provider.get_access_token()

            url = f"https://storage.googleapis.com/storage/v1/b/{bucket}/o/{URL_ENCODE(object_name)}"
            IF generation:
                url = f"{url}?generation={generation}"

            http_request = HttpRequest {
                method: DELETE,
                url: url,
                headers: {"Authorization": f"Bearer {token}"},
            }

            response = http_transport.send(http_request)

            IF response.status != 204:
                THROW PARSE_GCS_ERROR(response)

            circuit_breaker.record_success("gcs")
            EMIT_METRIC("gcs_requests_total", bucket=bucket, operation="delete", status="success")

        CATCH error:
            span.record_error(error)
            IF error.is_retryable():
                RETRY_WITH_BACKOFF(delete_object, bucket, object_name, generation)
            THROW error
        FINALLY:
            span.end()

    METHOD list_objects(request: ListRequest) -> ListResponse:
        span = START_SPAN("gcs.list")
        span.set_attribute("bucket", request.bucket)
        span.set_attribute("prefix", request.prefix)

        TRY:
            circuit_breaker.check("gcs")
            token = auth_provider.get_access_token()

            params = {"maxResults": request.max_results OR 1000}
            IF request.prefix:
                params["prefix"] = request.prefix
            IF request.delimiter:
                params["delimiter"] = request.delimiter
            IF request.page_token:
                params["pageToken"] = request.page_token
            IF request.versions:
                params["versions"] = "true"

            url = f"https://storage.googleapis.com/storage/v1/b/{request.bucket}/o?{ENCODE_PARAMS(params)}"

            http_request = HttpRequest {
                method: GET,
                url: url,
                headers: {"Authorization": f"Bearer {token}"},
            }

            response = http_transport.send(http_request)

            IF response.status != 200:
                THROW PARSE_GCS_ERROR(response)

            result = JSON.deserialize(response.body)
            circuit_breaker.record_success("gcs")

            span.set_attribute("count", result.items.len())
            EMIT_METRIC("gcs_requests_total", bucket=request.bucket, operation="list", status="success")

            RETURN ListResponse {
                items: result.items.map(PARSE_OBJECT_METADATA),
                prefixes: result.prefixes OR [],
                next_page_token: result.nextPageToken,
            }

        CATCH error:
            span.record_error(error)
            IF error.is_retryable():
                RETURN RETRY_WITH_BACKOFF(list_objects, request)
            THROW error
        FINALLY:
            span.end()
```

---

## 2. Simple Upload

```pseudocode
METHOD simple_upload(request: UploadRequest) -> ObjectMetadata:
    token = auth_provider.get_access_token()

    url = f"https://storage.googleapis.com/upload/storage/v1/b/{request.bucket}/o"
    params = {
        "uploadType": "media",
        "name": request.name,
    }
    IF request.if_generation_match:
        params["ifGenerationMatch"] = request.if_generation_match

    url = f"{url}?{ENCODE_PARAMS(params)}"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": request.content_type OR "application/octet-stream",
        "Content-Length": request.content_length.to_string(),
    }

    // Add custom metadata
    FOR (key, value) IN request.metadata:
        headers[f"x-goog-meta-{key}"] = value

    http_request = HttpRequest {
        method: POST,
        url: url,
        headers: headers,
        body: request.data,
    }

    response = http_transport.send(http_request)

    IF response.status != 200:
        THROW PARSE_GCS_ERROR(response)

    RETURN PARSE_OBJECT_METADATA(JSON.deserialize(response.body))
```

---

## 3. Resumable Upload

```pseudocode
CLASS ResumableUpload:
    FIELDS:
        client: GcsClient
        bucket: String
        object_name: String
        content_type: String
        total_size: u64
        chunk_size: u64
        resumable_uri: Option<String>
        bytes_uploaded: u64
        metadata: Map<String, String>

    CONSTRUCTOR(client, bucket, object_name, total_size, options):
        self.client = client
        self.bucket = bucket
        self.object_name = object_name
        self.total_size = total_size
        self.content_type = options.content_type OR "application/octet-stream"
        self.chunk_size = DETERMINE_CHUNK_SIZE(total_size)
        self.metadata = options.metadata OR {}
        self.bytes_uploaded = 0
        self.resumable_uri = None

    METHOD initiate() -> String:
        span = START_SPAN("gcs.upload.initiate")

        token = client.auth_provider.get_access_token()

        url = f"https://storage.googleapis.com/upload/storage/v1/b/{bucket}/o?uploadType=resumable"

        body = {
            "name": object_name,
            "metadata": metadata,
        }

        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-Upload-Content-Type": content_type,
            "X-Upload-Content-Length": total_size.to_string(),
        }

        http_request = HttpRequest {
            method: POST,
            url: url,
            headers: headers,
            body: JSON.serialize(body),
        }

        response = client.http_transport.send(http_request)

        IF response.status != 200:
            THROW PARSE_GCS_ERROR(response)

        resumable_uri = response.headers["Location"]
        IF NOT resumable_uri:
            THROW UploadError::ResumableUploadFailed("No Location header")

        self.resumable_uri = resumable_uri
        span.end()
        RETURN resumable_uri

    METHOD upload_chunk(chunk_data: Bytes) -> ChunkResult:
        span = START_SPAN("gcs.upload.chunk")

        IF NOT resumable_uri:
            THROW UploadError::ResumableUploadFailed("Upload not initiated")

        start_byte = bytes_uploaded
        end_byte = bytes_uploaded + chunk_data.len() - 1
        is_final = (end_byte + 1) >= total_size

        headers = {
            "Content-Length": chunk_data.len().to_string(),
            "Content-Range": f"bytes {start_byte}-{end_byte}/{total_size}",
        }

        http_request = HttpRequest {
            method: PUT,
            url: resumable_uri,
            headers: headers,
            body: chunk_data,
        }

        TRY:
            response = client.http_transport.send(http_request)

            IF response.status == 308:
                // Incomplete, more chunks needed
                bytes_uploaded = PARSE_RANGE_HEADER(response.headers["Range"])
                EMIT_METRIC("gcs_upload_chunks_total", bucket=bucket, status="partial")
                span.end()
                RETURN ChunkResult::Incomplete(bytes_uploaded)

            ELSE IF response.status == 200 OR response.status == 201:
                // Upload complete
                metadata = PARSE_OBJECT_METADATA(JSON.deserialize(response.body))
                EMIT_METRIC("gcs_upload_chunks_total", bucket=bucket, status="complete")
                span.end()
                RETURN ChunkResult::Complete(metadata)

            ELSE:
                THROW PARSE_GCS_ERROR(response)

        CATCH error:
            span.record_error(error)
            EMIT_METRIC("gcs_upload_chunks_total", bucket=bucket, status="failed")

            IF error.is_retryable():
                // Query upload status and retry from last byte
                status = query_upload_status()
                bytes_uploaded = status.bytes_received
                THROW error  // Caller should retry with remaining data

            THROW error

    METHOD query_upload_status() -> UploadStatus:
        IF NOT resumable_uri:
            THROW UploadError::ResumableUploadFailed("Upload not initiated")

        headers = {
            "Content-Length": "0",
            "Content-Range": f"bytes */{total_size}",
        }

        http_request = HttpRequest {
            method: PUT,
            url: resumable_uri,
            headers: headers,
        }

        response = client.http_transport.send(http_request)

        IF response.status == 308:
            // Upload incomplete
            range_header = response.headers["Range"]
            IF range_header:
                bytes_received = PARSE_RANGE_END(range_header) + 1
            ELSE:
                bytes_received = 0
            RETURN UploadStatus::Incomplete(bytes_received)

        ELSE IF response.status == 200 OR response.status == 201:
            RETURN UploadStatus::Complete

        ELSE:
            THROW PARSE_GCS_ERROR(response)

    METHOD abort():
        IF resumable_uri:
            TRY:
                http_request = HttpRequest {
                    method: DELETE,
                    url: resumable_uri,
                }
                client.http_transport.send(http_request)
            CATCH:
                // Ignore errors on abort
                PASS

FUNCTION DETERMINE_CHUNK_SIZE(total_size: u64) -> u64:
    // Chunk size must be multiple of 256KB
    IF total_size < 5 * MB:
        RETURN total_size  // Use simple upload instead
    ELSE IF total_size < 100 * MB:
        RETURN 8 * MB
    ELSE IF total_size < 1 * GB:
        RETURN 16 * MB
    ELSE:
        RETURN 32 * MB
```

---

## 4. Streaming Download

```pseudocode
CLASS StreamingDownloader:
    FIELDS:
        client: GcsClient
        bucket: String
        object_name: String
        generation: Option<i64>
        buffer_size: usize
        total_size: Option<u64>
        bytes_downloaded: u64

    METHOD download_stream() -> AsyncStream<Bytes>:
        span = START_SPAN("gcs.download.stream")
        span.set_attribute("bucket", bucket)
        span.set_attribute("object", object_name)

        token = client.auth_provider.get_access_token()

        url = BUILD_DOWNLOAD_URL(bucket, object_name, generation)

        http_request = HttpRequest {
            method: GET,
            url: url,
            headers: {"Authorization": f"Bearer {token}"},
        }

        response = client.http_transport.send_streaming(http_request)

        IF response.status != 200:
            THROW PARSE_GCS_ERROR(response)

        total_size = response.headers["Content-Length"].parse()

        RETURN AsyncStream::new(async move {
            buffer = ByteBuffer::with_capacity(buffer_size)

            WHILE chunk = response.body.next().await:
                buffer.extend(chunk)
                bytes_downloaded += chunk.len()

                IF buffer.len() >= buffer_size:
                    YIELD buffer.take()

            // Yield remaining data
            IF buffer.len() > 0:
                YIELD buffer.take()

            span.set_attribute("total_bytes", bytes_downloaded)
            span.end()
        })

    METHOD download_range(start: u64, end: u64) -> Bytes:
        token = client.auth_provider.get_access_token()

        url = BUILD_DOWNLOAD_URL(bucket, object_name, generation)

        http_request = HttpRequest {
            method: GET,
            url: url,
            headers: {
                "Authorization": f"Bearer {token}",
                "Range": f"bytes={start}-{end}",
            },
        }

        response = client.http_transport.send(http_request)

        IF response.status != 206:
            IF response.status == 416:
                THROW DownloadError::RangeNotSatisfiable
            THROW PARSE_GCS_ERROR(response)

        RETURN response.body
```

---

## 5. Signed URL Generation

```pseudocode
CLASS SignedUrlGenerator:
    FIELDS:
        credentials: ServiceAccountCredentials
        default_expiration: Duration

    METHOD generate_signed_url(request: SignedUrlRequest) -> String:
        span = START_SPAN("gcs.sign_url")
        span.set_attribute("bucket", request.bucket)
        span.set_attribute("method", request.method)

        // Validate expiration (max 7 days)
        expiration = request.expiration OR default_expiration
        IF expiration > Duration::days(7):
            THROW ConfigurationError::InvalidExpiration("Max 7 days")

        now = Utc::now()
        credential_scope = f"{now.format('%Y%m%d')}/auto/storage/goog4_request"

        // Canonical request components
        http_method = request.method.to_uppercase()
        canonical_uri = f"/{request.bucket}/{URL_ENCODE(request.object_name)}"

        // Query parameters
        query_params = {
            "X-Goog-Algorithm": "GOOG4-RSA-SHA256",
            "X-Goog-Credential": f"{credentials.client_email}/{credential_scope}",
            "X-Goog-Date": now.format("%Y%m%dT%H%M%SZ"),
            "X-Goog-Expires": expiration.as_secs().to_string(),
            "X-Goog-SignedHeaders": "host",
        }

        // Add any custom query params
        FOR (key, value) IN request.query_params:
            query_params[key] = value

        canonical_query_string = BUILD_CANONICAL_QUERY_STRING(query_params)

        // Canonical headers
        canonical_headers = f"host:storage.googleapis.com\n"
        signed_headers = "host"

        // Build canonical request
        canonical_request = [
            http_method,
            canonical_uri,
            canonical_query_string,
            canonical_headers,
            signed_headers,
            "UNSIGNED-PAYLOAD",
        ].join("\n")

        // String to sign
        string_to_sign = [
            "GOOG4-RSA-SHA256",
            now.format("%Y%m%dT%H%M%SZ"),
            credential_scope,
            SHA256_HEX(canonical_request),
        ].join("\n")

        // Sign with RSA-SHA256
        signature = RSA_SIGN_SHA256(credentials.private_key, string_to_sign)
        signature_hex = HEX_ENCODE(signature)

        // Build final URL
        signed_url = f"https://storage.googleapis.com{canonical_uri}?{canonical_query_string}&X-Goog-Signature={signature_hex}"

        span.set_attribute("expires_in", expiration.as_secs())
        span.end()

        RETURN signed_url

FUNCTION BUILD_CANONICAL_QUERY_STRING(params: Map<String, String>) -> String:
    sorted_params = params.entries().sort_by(|(k1, _), (k2, _)| k1.cmp(k2))
    RETURN sorted_params
        .map(|(k, v)| f"{URL_ENCODE(k)}={URL_ENCODE(v)}")
        .join("&")
```

---

## 6. Copy and Compose Operations

```pseudocode
METHOD copy_object(request: CopyRequest) -> ObjectMetadata:
    span = START_SPAN("gcs.copy")
    span.set_attribute("src_bucket", request.source_bucket)
    span.set_attribute("dst_bucket", request.dest_bucket)

    TRY:
        circuit_breaker.check("gcs")
        token = auth_provider.get_access_token()

        src_object = URL_ENCODE(request.source_object)
        dst_object = URL_ENCODE(request.dest_object)

        url = f"https://storage.googleapis.com/storage/v1/b/{request.source_bucket}/o/{src_object}/copyTo/b/{request.dest_bucket}/o/{dst_object}"

        params = {}
        IF request.source_generation:
            params["sourceGeneration"] = request.source_generation
        IF request.if_generation_match:
            params["ifGenerationMatch"] = request.if_generation_match

        IF params.len() > 0:
            url = f"{url}?{ENCODE_PARAMS(params)}"

        body = {}
        IF request.metadata:
            body["metadata"] = request.metadata
        IF request.content_type:
            body["contentType"] = request.content_type

        http_request = HttpRequest {
            method: POST,
            url: url,
            headers: {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            body: JSON.serialize(body),
        }

        response = http_transport.send(http_request)

        IF response.status != 200:
            THROW PARSE_GCS_ERROR(response)

        circuit_breaker.record_success("gcs")
        RETURN PARSE_OBJECT_METADATA(JSON.deserialize(response.body))

    CATCH error:
        span.record_error(error)
        IF error.is_retryable():
            RETURN RETRY_WITH_BACKOFF(copy_object, request)
        THROW error
    FINALLY:
        span.end()

METHOD compose_objects(request: ComposeRequest) -> ObjectMetadata:
    span = START_SPAN("gcs.compose")
    span.set_attribute("bucket", request.bucket)
    span.set_attribute("source_count", request.source_objects.len())

    TRY:
        circuit_breaker.check("gcs")
        token = auth_provider.get_access_token()

        dest_object = URL_ENCODE(request.dest_object)
        url = f"https://storage.googleapis.com/storage/v1/b/{request.bucket}/o/{dest_object}/compose"

        // Build source objects list
        source_objects = request.source_objects.map(|src| {
            obj = {"name": src.name}
            IF src.generation:
                obj["generation"] = src.generation
            RETURN obj
        })

        body = {
            "sourceObjects": source_objects,
            "destination": {
                "contentType": request.content_type OR "application/octet-stream",
            },
        }
        IF request.metadata:
            body["destination"]["metadata"] = request.metadata

        http_request = HttpRequest {
            method: POST,
            url: url,
            headers: {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            body: JSON.serialize(body),
        }

        response = http_transport.send(http_request)

        IF response.status != 200:
            THROW PARSE_GCS_ERROR(response)

        circuit_breaker.record_success("gcs")
        RETURN PARSE_OBJECT_METADATA(JSON.deserialize(response.body))

    CATCH error:
        span.record_error(error)
        IF error.is_retryable():
            RETURN RETRY_WITH_BACKOFF(compose_objects, request)
        THROW error
    FINALLY:
        span.end()
```

---

## 7. Authentication Provider

```pseudocode
CLASS GcpAuthProvider:
    FIELDS:
        credentials: GcpCredentials
        cached_token: Option<CachedToken>
        token_lock: Mutex

    METHOD get_access_token() -> String:
        WITH token_lock:
            IF cached_token AND NOT cached_token.is_expired():
                RETURN cached_token.token

            // Refresh token
            new_token = refresh_token()
            cached_token = CachedToken {
                token: new_token.access_token,
                expires_at: now() + Duration::seconds(new_token.expires_in - 60),
            }
            RETURN cached_token.token

    METHOD refresh_token() -> TokenResponse:
        MATCH credentials:
            GcpCredentials::ServiceAccount(sa):
                RETURN service_account_token(sa)
            GcpCredentials::WorkloadIdentity:
                RETURN workload_identity_token()
            GcpCredentials::ApplicationDefault:
                RETURN application_default_token()

    METHOD service_account_token(sa: ServiceAccountCredentials) -> TokenResponse:
        now = Utc::now()
        exp = now + Duration::hours(1)

        jwt_header = {"alg": "RS256", "typ": "JWT"}
        jwt_claims = {
            "iss": sa.client_email,
            "sub": sa.client_email,
            "aud": "https://oauth2.googleapis.com/token",
            "iat": now.timestamp(),
            "exp": exp.timestamp(),
            "scope": "https://www.googleapis.com/auth/devstorage.read_write",
        }

        jwt = CREATE_JWT(jwt_header, jwt_claims, sa.private_key)

        http_request = HttpRequest {
            method: POST,
            url: "https://oauth2.googleapis.com/token",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: f"grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion={jwt}",
        }

        response = http_transport.send(http_request)

        IF response.status != 200:
            THROW AuthenticationError::TokenRefreshFailed

        RETURN JSON.deserialize(response.body)

    METHOD workload_identity_token() -> TokenResponse:
        // Fetch from GKE metadata server
        http_request = HttpRequest {
            method: GET,
            url: "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
            headers: {"Metadata-Flavor": "Google"},
        }

        response = http_transport.send(http_request)

        IF response.status != 200:
            THROW AuthenticationError::TokenRefreshFailed

        RETURN JSON.deserialize(response.body)
```

---

## 8. Simulation and Recording

```pseudocode
CLASS GcsSimulator:
    FIELDS:
        mode: SimulationMode
        mock_objects: Map<String, MockObject>
        recorded_operations: Vec<RecordedOperation>
        real_client: Option<GcsClient>

    METHOD upload_object(request: UploadRequest) -> ObjectMetadata:
        record = RecordedOperation {
            timestamp: now(),
            operation: "upload",
            bucket: request.bucket,
            object: request.name,
        }
        recorded_operations.push(record)

        MATCH mode:
            SimulationMode::Mock:
                key = f"{request.bucket}/{request.name}"
                mock_obj = MockObject {
                    data: request.data.clone(),
                    metadata: create_mock_metadata(request),
                    generation: generate_mock_generation(),
                }
                mock_objects.insert(key, mock_obj)
                RETURN mock_obj.metadata

            SimulationMode::Record:
                result = real_client.upload_object(request)
                record.response = Some(result.clone())
                RETURN result

            SimulationMode::Replay:
                IF recorded = find_recorded_response("upload", request.bucket, request.name):
                    RETURN recorded
                THROW ObjectError::ObjectNotFound

    METHOD download_object(request: DownloadRequest) -> DownloadResponse:
        record = RecordedOperation {
            timestamp: now(),
            operation: "download",
            bucket: request.bucket,
            object: request.object_name,
        }
        recorded_operations.push(record)

        MATCH mode:
            SimulationMode::Mock:
                key = f"{request.bucket}/{request.object_name}"
                IF mock_obj = mock_objects.get(key):
                    RETURN DownloadResponse {
                        data: mock_obj.data.clone(),
                        metadata: mock_obj.metadata.clone(),
                    }
                THROW ObjectError::ObjectNotFound

            SimulationMode::Record:
                result = real_client.download_object(request)
                record.response = Some(result.clone())
                RETURN result

            SimulationMode::Replay:
                IF recorded = find_recorded_response("download", request.bucket, request.object_name):
                    RETURN recorded
                THROW ObjectError::ObjectNotFound

    METHOD set_mock_object(bucket: String, name: String, data: Bytes, metadata: Map<String, String>):
        key = f"{bucket}/{name}"
        mock_objects.insert(key, MockObject {
            data: data,
            metadata: ObjectMetadata {
                name: name,
                bucket: bucket,
                generation: generate_mock_generation(),
                size: data.len(),
                content_type: metadata.get("contentType") OR "application/octet-stream",
                custom_metadata: metadata,
                created: now(),
                updated: now(),
            },
            generation: generate_mock_generation(),
        })

    METHOD get_recorded_operations() -> Vec<RecordedOperation>:
        RETURN recorded_operations.clone()

    METHOD clear():
        mock_objects.clear()
        recorded_operations.clear()
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-13 | SPARC Generator | Initial Pseudocode phase |

---

**Next Phase:** Architecture - Will define component structure, module organization, and data flow diagrams.
