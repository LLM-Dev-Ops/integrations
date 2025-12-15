# Cloudflare R2 Storage Integration - Pseudocode

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-14
**Module:** `integrations/cloudflare_r2`

---

## 1. Overview

This document provides algorithmic descriptions for implementing the Cloudflare R2 Storage Integration, including client initialization, S3 Signature V4 signing adapted for R2, object operations, multipart uploads, and simulation support.

### Pseudocode Conventions

```
FUNCTION name(params) -> ReturnType
  statement
  IF condition THEN action END IF
  FOR item IN collection DO process(item) END FOR
  TRY operation() CATCH Error AS e handle(e) END TRY
  RETURN value
END FUNCTION

STRUCT Name { field: Type }
TRAIT Name { FUNCTION method(self) -> Type }
```

---

## 2. Client Initialization

### 2.1 R2 Client Factory

```pseudocode
STRUCT R2ClientImpl {
    config: R2Config,
    transport: Arc<dyn HttpTransport>,
    signer: Arc<R2Signer>,
    retry_executor: Arc<RetryExecutor>,
    circuit_breaker: Arc<CircuitBreaker>,
    rate_limiter: Option<Arc<RateLimiter>>,
    recorder: Option<Arc<dyn R2Recorder>>,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
    metrics: Arc<dyn MetricsEmitter>,
}

FUNCTION create_r2_client(config: R2Config) -> Result<R2Client, R2Error>
    // Validate configuration
    IF config.account_id.is_empty() THEN
        RETURN Err(ConfigError::MissingAccountId)
    END IF

    // Initialize shared primitives
    logger <- shared_logging::get_logger("cloudflare-r2")
    tracer <- shared_tracing::get_tracer("cloudflare-r2")
    metrics <- shared_metrics::get_emitter("cloudflare-r2")

    // Build endpoint URL
    endpoint <- config.endpoint.unwrap_or_else(|| {
        format!("https://{}.r2.cloudflarestorage.com", config.account_id)
    })

    // Create S3-compatible signer for R2
    signer <- R2Signer::new(
        config.access_key_id.clone(),
        config.secret_access_key.clone(),
        "auto",  // R2 uses "auto" as region
        "s3"     // Service name for S3-compatible signing
    )

    // Initialize retry executor from shared primitive
    retry_executor <- shared_retry::create_executor(RetryConfig {
        max_attempts: 3,
        initial_backoff: Duration::from_millis(100),
        max_backoff: Duration::from_secs(30),
        backoff_multiplier: 2.0,
        jitter_factor: 0.1,
    })

    // Initialize circuit breaker from shared primitive
    circuit_breaker <- shared_circuit_breaker::create(CircuitBreakerConfig {
        failure_threshold: 5,
        success_threshold: 3,
        reset_timeout: Duration::from_secs(30),
    })

    // Initialize HTTP transport
    transport <- create_http_transport(HttpTransportConfig {
        base_url: endpoint,
        timeout: config.timeout,
        tls_min_version: TlsVersion::TLS_1_2,
        pool_size: 20,
    })

    logger.info("R2 client initialized", { account_id: config.account_id })

    RETURN Ok(R2ClientImpl { config, transport, signer, ... })
END FUNCTION
```

### 2.2 R2 Client Builder

```pseudocode
STRUCT R2ClientBuilder {
    account_id: Option<String>,
    access_key_id: Option<String>,
    secret_access_key: Option<SecretString>,
    endpoint: Option<Url>,
    timeout: Duration,
    multipart_threshold: u64,
    multipart_part_size: u64,
    multipart_concurrency: usize,
    recorder: Option<Arc<dyn R2Recorder>>,
}

IMPL R2ClientBuilder {
    FUNCTION new() -> Self
        Self {
            account_id: None,
            access_key_id: None,
            secret_access_key: None,
            endpoint: None,
            timeout: Duration::from_secs(300),
            multipart_threshold: 100 * MB,
            multipart_part_size: 10 * MB,
            multipart_concurrency: 4,
            recorder: None,
        }
    END FUNCTION

    FUNCTION from_env() -> Result<Self, ConfigError>
        builder <- Self::new()
        builder.account_id = env::var("R2_ACCOUNT_ID").ok()
        builder.access_key_id = env::var("R2_ACCESS_KEY_ID").ok()
        builder.secret_access_key = env::var("R2_SECRET_ACCESS_KEY").ok().map(SecretString::new)
        RETURN Ok(builder)
    END FUNCTION

    FUNCTION account_id(mut self, id: impl Into<String>) -> Self
        self.account_id = Some(id.into())
        self
    END FUNCTION

    FUNCTION credentials(mut self, key_id: String, secret: SecretString) -> Self
        self.access_key_id = Some(key_id)
        self.secret_access_key = Some(secret)
        self
    END FUNCTION

    FUNCTION with_recorder(mut self, recorder: Arc<dyn R2Recorder>) -> Self
        self.recorder = Some(recorder)
        self
    END FUNCTION

    FUNCTION build(self) -> Result<R2Client, R2Error>
        account_id <- self.account_id.ok_or(ConfigError::MissingAccountId)?
        access_key_id <- self.access_key_id.ok_or(ConfigError::MissingCredentials)?
        secret <- self.secret_access_key.ok_or(ConfigError::MissingCredentials)?

        config <- R2Config {
            account_id,
            access_key_id,
            secret_access_key: secret,
            endpoint: self.endpoint,
            timeout: self.timeout,
            multipart_threshold: self.multipart_threshold,
            multipart_part_size: self.multipart_part_size,
            multipart_concurrency: self.multipart_concurrency,
        }

        create_r2_client(config)
    END FUNCTION
}
```

---

## 3. S3 Signature V4 for R2

### 3.1 Request Signing

```pseudocode
STRUCT R2Signer {
    access_key_id: String,
    secret_access_key: SecretString,
    region: String,      // Always "auto" for R2
    service: String,     // Always "s3"
}

FUNCTION sign_request(
    signer: &R2Signer,
    request: &mut HttpRequest,
    payload_hash: &str,
    timestamp: DateTime<Utc>
) -> Result<(), SigningError>
    // Step 1: Format timestamps
    date_stamp <- timestamp.format("%Y%m%d")
    amz_date <- timestamp.format("%Y%m%dT%H%M%SZ")

    // Step 2: Add required headers
    request.headers.insert("x-amz-date", amz_date)
    request.headers.insert("x-amz-content-sha256", payload_hash)
    request.headers.insert("host", request.url.host())

    // Step 3: Create canonical request
    canonical_request <- create_canonical_request(
        request.method,
        request.url.path(),
        request.url.query(),
        request.headers,
        payload_hash
    )

    // Step 4: Create string to sign
    credential_scope <- format!("{}/{}/{}/aws4_request",
        date_stamp, signer.region, signer.service)

    string_to_sign <- format!("AWS4-HMAC-SHA256\n{}\n{}\n{}",
        amz_date,
        credential_scope,
        sha256_hex(canonical_request)
    )

    // Step 5: Calculate signature
    signing_key <- derive_signing_key(
        signer.secret_access_key,
        date_stamp,
        signer.region,
        signer.service
    )

    signature <- hmac_sha256_hex(signing_key, string_to_sign)

    // Step 6: Build authorization header
    signed_headers <- get_signed_headers_list(request.headers)
    authorization <- format!(
        "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        signer.access_key_id,
        credential_scope,
        signed_headers,
        signature
    )

    request.headers.insert("authorization", authorization)
    RETURN Ok(())
END FUNCTION
```

### 3.2 Canonical Request Creation

```pseudocode
FUNCTION create_canonical_request(
    method: HttpMethod,
    path: &str,
    query: Option<&str>,
    headers: &HeaderMap,
    payload_hash: &str
) -> String
    // Canonical URI (path)
    canonical_uri <- uri_encode_path(path)

    // Canonical query string (sorted)
    canonical_query <- IF query IS Some(q) THEN
        params <- parse_query_string(q)
        sorted_params <- params.sorted_by_key()
        sorted_params.map(|(k, v)| format!("{}={}", uri_encode(k), uri_encode(v)))
                     .join("&")
    ELSE
        ""
    END IF

    // Canonical headers (lowercase, sorted)
    canonical_headers <- headers
        .iter()
        .map(|(k, v)| (k.to_lowercase(), v.trim()))
        .sorted_by_key()
        .map(|(k, v)| format!("{}:{}\n", k, v))
        .join("")

    // Signed headers list
    signed_headers <- headers
        .keys()
        .map(|k| k.to_lowercase())
        .sorted()
        .join(";")

    // Assemble canonical request
    RETURN format!("{}\n{}\n{}\n{}\n{}\n{}",
        method,
        canonical_uri,
        canonical_query,
        canonical_headers,
        signed_headers,
        payload_hash
    )
END FUNCTION
```

### 3.3 Signing Key Derivation

```pseudocode
FUNCTION derive_signing_key(
    secret: &SecretString,
    date_stamp: &str,
    region: &str,
    service: &str
) -> [u8; 32]
    // AWS4 key derivation
    k_secret <- format!("AWS4{}", secret.expose_secret()).as_bytes()
    k_date <- hmac_sha256(k_secret, date_stamp.as_bytes())
    k_region <- hmac_sha256(k_date, region.as_bytes())
    k_service <- hmac_sha256(k_region, service.as_bytes())
    k_signing <- hmac_sha256(k_service, b"aws4_request")
    RETURN k_signing
END FUNCTION
```

### 3.4 Presigned URL Generation

```pseudocode
FUNCTION presign_url(
    signer: &R2Signer,
    method: HttpMethod,
    bucket: &str,
    key: &str,
    expires_in: Duration,
    endpoint: &Url
) -> Result<PresignedUrl, SigningError>
    // Validate expiration (max 7 days)
    IF expires_in > Duration::from_secs(604800) THEN
        RETURN Err(SigningError::ExpirationTooLong)
    END IF

    timestamp <- Utc::now()
    date_stamp <- timestamp.format("%Y%m%d")
    amz_date <- timestamp.format("%Y%m%dT%H%M%SZ")

    // Build URL path (path-style for R2)
    path <- format!("/{}/{}", bucket, uri_encode_path(key))
    url <- endpoint.join(&path)

    // Credential scope
    credential_scope <- format!("{}/{}/{}/aws4_request",
        date_stamp, signer.region, signer.service)

    credential <- format!("{}/{}", signer.access_key_id, credential_scope)

    // Query parameters for presigned URL
    query_params <- [
        ("X-Amz-Algorithm", "AWS4-HMAC-SHA256"),
        ("X-Amz-Credential", uri_encode(&credential)),
        ("X-Amz-Date", &amz_date),
        ("X-Amz-Expires", &expires_in.as_secs().to_string()),
        ("X-Amz-SignedHeaders", "host"),
    ]

    // Create canonical request with UNSIGNED-PAYLOAD
    canonical_request <- create_canonical_request_for_presign(
        method,
        &path,
        &query_params,
        endpoint.host(),
        "UNSIGNED-PAYLOAD"
    )

    // Create string to sign
    string_to_sign <- format!("AWS4-HMAC-SHA256\n{}\n{}\n{}",
        amz_date,
        credential_scope,
        sha256_hex(&canonical_request)
    )

    // Calculate signature
    signing_key <- derive_signing_key(
        &signer.secret_access_key,
        &date_stamp,
        &signer.region,
        &signer.service
    )
    signature <- hmac_sha256_hex(signing_key, &string_to_sign)

    // Build final URL
    query_params.push(("X-Amz-Signature", &signature))
    url.set_query(Some(&query_params.to_query_string()))

    RETURN Ok(PresignedUrl {
        url: url.to_string(),
        expires_at: timestamp + expires_in,
        method: method,
    })
END FUNCTION
```

---

## 4. Object Operations

### 4.1 Put Object

```pseudocode
FUNCTION put_object(
    client: &R2Client,
    request: PutObjectRequest
) -> Result<PutObjectOutput, R2Error>
    span <- tracer.start_span("r2.put_object", {
        r2.bucket: request.bucket,
        r2.key: request.key,
        r2.content_length: request.body.len(),
    })

    TRY
        // Validate request
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        // Build URL (path-style)
        url <- format!("{}/{}/{}",
            client.config.endpoint_url(),
            request.bucket,
            uri_encode_path(&request.key)
        )

        // Calculate payload hash
        payload_hash <- sha256_hex(&request.body)

        // Build HTTP request
        http_request <- HttpRequest {
            method: PUT,
            url: url.parse()?,
            headers: HeaderMap::new(),
            body: Some(request.body.clone()),
        }

        // Add optional headers
        IF request.content_type IS Some(ct) THEN
            http_request.headers.insert("content-type", ct)
        END IF
        IF request.cache_control IS Some(cc) THEN
            http_request.headers.insert("cache-control", cc)
        END IF
        IF request.content_disposition IS Some(cd) THEN
            http_request.headers.insert("content-disposition", cd)
        END IF
        IF request.content_md5 IS Some(md5) THEN
            http_request.headers.insert("content-md5", md5)
        END IF

        // Add metadata headers
        FOR (key, value) IN request.metadata DO
            http_request.headers.insert(format!("x-amz-meta-{}", key), value)
        END FOR

        // Sign request
        client.signer.sign_request(&mut http_request, &payload_hash, Utc::now())?

        // Execute with resilience
        response <- execute_with_resilience(client, http_request).await?

        // Record for simulation if enabled
        IF client.recorder IS Some(recorder) THEN
            recorder.record_response("PutObject", &request.bucket, &request.key, &response)
        END IF

        // Parse response
        output <- PutObjectOutput {
            e_tag: response.headers.get("etag").map(|v| v.trim_matches('"')),
            version_id: response.headers.get("x-amz-version-id"),
        }

        // Emit metrics
        metrics.increment("r2_requests_total", {
            operation: "PutObject",
            bucket: request.bucket,
            status: "success",
        })
        metrics.observe("r2_bytes_transferred_total", request.body.len(), {
            operation: "PutObject",
            direction: "upload",
        })

        span.set_status(Ok)
        RETURN Ok(output)

    CATCH error
        span.set_status(Error, error.to_string())
        metrics.increment("r2_errors_total", {
            operation: "PutObject",
            error_type: error.error_type(),
        })
        RETURN Err(error)
    END TRY
END FUNCTION
```

### 4.2 Get Object

```pseudocode
FUNCTION get_object(
    client: &R2Client,
    request: GetObjectRequest
) -> Result<GetObjectOutput, R2Error>
    span <- tracer.start_span("r2.get_object", {
        r2.bucket: request.bucket,
        r2.key: request.key,
    })

    TRY
        // Build URL
        url <- format!("{}/{}/{}",
            client.config.endpoint_url(),
            request.bucket,
            uri_encode_path(&request.key)
        )

        // Build request
        http_request <- HttpRequest {
            method: GET,
            url: url.parse()?,
            headers: HeaderMap::new(),
            body: None,
        }

        // Add conditional headers
        IF request.range IS Some(range) THEN
            http_request.headers.insert("range", range)
        END IF
        IF request.if_match IS Some(etag) THEN
            http_request.headers.insert("if-match", etag)
        END IF
        IF request.if_none_match IS Some(etag) THEN
            http_request.headers.insert("if-none-match", etag)
        END IF
        IF request.if_modified_since IS Some(date) THEN
            http_request.headers.insert("if-modified-since", date.to_rfc2822())
        END IF

        // Sign with UNSIGNED-PAYLOAD (body is empty for GET)
        client.signer.sign_request(&mut http_request, "UNSIGNED-PAYLOAD", Utc::now())?

        // Execute request
        response <- execute_with_resilience(client, http_request).await?

        // Handle 304 Not Modified
        IF response.status == 304 THEN
            RETURN Err(R2Error::Object(ObjectError::NotModified))
        END IF

        // Parse metadata from headers
        metadata <- extract_metadata_from_headers(&response.headers)

        output <- GetObjectOutput {
            body: response.body,
            content_length: response.headers.get("content-length")?.parse()?,
            content_type: response.headers.get("content-type"),
            e_tag: response.headers.get("etag").map(|v| v.trim_matches('"')),
            last_modified: parse_http_date(response.headers.get("last-modified")?),
            metadata: metadata,
            content_range: response.headers.get("content-range"),
        }

        metrics.observe("r2_bytes_transferred_total", output.content_length, {
            operation: "GetObject",
            direction: "download",
        })

        RETURN Ok(output)

    CATCH error
        span.set_status(Error)
        RETURN Err(error)
    END TRY
END FUNCTION
```

### 4.3 Get Object Stream

```pseudocode
FUNCTION get_object_stream(
    client: &R2Client,
    request: GetObjectRequest
) -> Result<GetObjectStreamOutput, R2Error>
    span <- tracer.start_span("r2.get_object_stream", {
        r2.bucket: request.bucket,
        r2.key: request.key,
    })

    // Build and sign request (same as get_object)
    http_request <- build_get_request(client, &request)?

    // Execute with streaming response
    response <- client.transport.send_streaming(http_request).await?

    // Wrap body stream with metrics tracking
    tracked_stream <- MetricsTrackingStream::new(
        response.body,
        client.metrics.clone(),
        "GetObject",
        request.bucket.clone()
    )

    output <- GetObjectStreamOutput {
        body: Box::pin(tracked_stream),
        content_length: response.headers.get("content-length")?.parse()?,
        content_type: response.headers.get("content-type"),
        e_tag: response.headers.get("etag"),
        last_modified: parse_http_date(response.headers.get("last-modified")?),
        metadata: extract_metadata_from_headers(&response.headers),
    }

    RETURN Ok(output)
END FUNCTION
```

### 4.4 Delete Object

```pseudocode
FUNCTION delete_object(
    client: &R2Client,
    request: DeleteObjectRequest
) -> Result<(), R2Error>
    span <- tracer.start_span("r2.delete_object")

    url <- format!("{}/{}/{}",
        client.config.endpoint_url(),
        request.bucket,
        uri_encode_path(&request.key)
    )

    http_request <- HttpRequest {
        method: DELETE,
        url: url.parse()?,
        headers: HeaderMap::new(),
        body: None,
    }

    client.signer.sign_request(&mut http_request, "UNSIGNED-PAYLOAD", Utc::now())?

    response <- execute_with_resilience(client, http_request).await?

    // 204 No Content is success
    IF response.status != 204 AND response.status != 200 THEN
        RETURN Err(parse_error_response(&response))
    END IF

    metrics.increment("r2_requests_total", { operation: "DeleteObject", status: "success" })
    RETURN Ok(())
END FUNCTION
```

### 4.5 Delete Objects (Batch)

```pseudocode
FUNCTION delete_objects(
    client: &R2Client,
    request: DeleteObjectsRequest
) -> Result<DeleteObjectsOutput, R2Error>
    span <- tracer.start_span("r2.delete_objects", {
        r2.bucket: request.bucket,
        count: request.objects.len(),
    })

    // Validate batch size
    IF request.objects.len() > 1000 THEN
        RETURN Err(R2Error::Request(RequestError::TooManyObjects))
    END IF

    // Build XML request body
    xml_body <- build_delete_xml(&request.objects, request.quiet)

    url <- format!("{}/?delete", client.config.endpoint_url(), request.bucket)

    http_request <- HttpRequest {
        method: POST,
        url: url.parse()?,
        headers: HeaderMap::new(),
        body: Some(xml_body.into_bytes()),
    }

    http_request.headers.insert("content-type", "application/xml")
    http_request.headers.insert("content-md5", base64_md5(&xml_body))

    payload_hash <- sha256_hex(&xml_body)
    client.signer.sign_request(&mut http_request, &payload_hash, Utc::now())?

    response <- execute_with_resilience(client, http_request).await?

    // Parse XML response
    result <- parse_delete_result_xml(&response.body)?

    RETURN Ok(DeleteObjectsOutput {
        deleted: result.deleted,
        errors: result.errors,
    })
END FUNCTION

FUNCTION build_delete_xml(objects: &[ObjectIdentifier], quiet: bool) -> String
    xml <- "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
    xml += "<Delete>\n"

    IF quiet THEN
        xml += "  <Quiet>true</Quiet>\n"
    END IF

    FOR obj IN objects DO
        xml += "  <Object>\n"
        xml += format!("    <Key>{}</Key>\n", xml_escape(&obj.key))
        IF obj.version_id IS Some(vid) THEN
            xml += format!("    <VersionId>{}</VersionId>\n", vid)
        END IF
        xml += "  </Object>\n"
    END FOR

    xml += "</Delete>"
    RETURN xml
END FUNCTION
```

### 4.6 Head Object

```pseudocode
FUNCTION head_object(
    client: &R2Client,
    request: HeadObjectRequest
) -> Result<HeadObjectOutput, R2Error>
    url <- format!("{}/{}/{}",
        client.config.endpoint_url(),
        request.bucket,
        uri_encode_path(&request.key)
    )

    http_request <- HttpRequest {
        method: HEAD,
        url: url.parse()?,
        headers: HeaderMap::new(),
        body: None,
    }

    client.signer.sign_request(&mut http_request, "UNSIGNED-PAYLOAD", Utc::now())?

    response <- execute_with_resilience(client, http_request).await?

    IF response.status == 404 THEN
        RETURN Err(R2Error::Object(ObjectError::ObjectNotFound {
            bucket: request.bucket,
            key: request.key,
        }))
    END IF

    RETURN Ok(HeadObjectOutput {
        content_length: response.headers.get("content-length")?.parse()?,
        content_type: response.headers.get("content-type"),
        e_tag: response.headers.get("etag"),
        last_modified: parse_http_date(response.headers.get("last-modified")?),
        metadata: extract_metadata_from_headers(&response.headers),
    })
END FUNCTION
```

### 4.7 List Objects

```pseudocode
FUNCTION list_objects(
    client: &R2Client,
    request: ListObjectsRequest
) -> Result<ListObjectsOutput, R2Error>
    span <- tracer.start_span("r2.list_objects", {
        r2.bucket: request.bucket,
        prefix: request.prefix,
    })

    // Build query parameters
    query_params <- vec![("list-type", "2")]

    IF request.prefix IS Some(p) THEN
        query_params.push(("prefix", p))
    END IF
    IF request.delimiter IS Some(d) THEN
        query_params.push(("delimiter", d))
    END IF
    IF request.max_keys IS Some(m) THEN
        query_params.push(("max-keys", m.to_string()))
    END IF
    IF request.continuation_token IS Some(t) THEN
        query_params.push(("continuation-token", t))
    END IF
    IF request.start_after IS Some(s) THEN
        query_params.push(("start-after", s))
    END IF

    url <- format!("{}/{}?{}",
        client.config.endpoint_url(),
        request.bucket,
        query_params.to_query_string()
    )

    http_request <- HttpRequest {
        method: GET,
        url: url.parse()?,
        headers: HeaderMap::new(),
        body: None,
    }

    client.signer.sign_request(&mut http_request, "UNSIGNED-PAYLOAD", Utc::now())?

    response <- execute_with_resilience(client, http_request).await?

    // Parse XML response
    result <- parse_list_objects_xml(&response.body)?

    RETURN Ok(result)
END FUNCTION

FUNCTION list_all_objects(
    client: &R2Client,
    request: ListObjectsRequest
) -> impl Stream<Item = Result<R2Object, R2Error>>
    async_stream::stream! {
        continuation_token <- None

        LOOP
            req <- request.clone()
            req.continuation_token = continuation_token

            result <- list_objects(client, req).await?

            FOR object IN result.contents DO
                yield Ok(object)
            END FOR

            IF result.is_truncated AND result.next_continuation_token IS Some(token) THEN
                continuation_token = Some(token)
            ELSE
                BREAK
            END IF
        END LOOP
    }
END FUNCTION
```

### 4.8 Copy Object

```pseudocode
FUNCTION copy_object(
    client: &R2Client,
    request: CopyObjectRequest
) -> Result<CopyObjectOutput, R2Error>
    span <- tracer.start_span("r2.copy_object", {
        source_bucket: request.source_bucket,
        source_key: request.source_key,
        dest_bucket: request.bucket,
        dest_key: request.key,
    })

    url <- format!("{}/{}/{}",
        client.config.endpoint_url(),
        request.bucket,
        uri_encode_path(&request.key)
    )

    // Build copy source header
    copy_source <- format!("/{}/{}",
        request.source_bucket,
        uri_encode_path(&request.source_key)
    )

    http_request <- HttpRequest {
        method: PUT,
        url: url.parse()?,
        headers: HeaderMap::new(),
        body: None,
    }

    http_request.headers.insert("x-amz-copy-source", &copy_source)

    // Add optional metadata directive
    IF request.metadata_directive IS Some(directive) THEN
        http_request.headers.insert("x-amz-metadata-directive", directive)
    END IF

    client.signer.sign_request(&mut http_request, "UNSIGNED-PAYLOAD", Utc::now())?

    response <- execute_with_resilience(client, http_request).await?

    // Parse XML response
    result <- parse_copy_result_xml(&response.body)?

    RETURN Ok(CopyObjectOutput {
        e_tag: result.e_tag,
        last_modified: result.last_modified,
    })
END FUNCTION
```

---

## 5. Multipart Upload

### 5.1 Create Multipart Upload

```pseudocode
FUNCTION create_multipart_upload(
    client: &R2Client,
    request: CreateMultipartRequest
) -> Result<CreateMultipartOutput, R2Error>
    span <- tracer.start_span("r2.create_multipart_upload")

    url <- format!("{}/{}/{}?uploads",
        client.config.endpoint_url(),
        request.bucket,
        uri_encode_path(&request.key)
    )

    http_request <- HttpRequest {
        method: POST,
        url: url.parse()?,
        headers: HeaderMap::new(),
        body: None,
    }

    // Add content-type if specified
    IF request.content_type IS Some(ct) THEN
        http_request.headers.insert("content-type", ct)
    END IF

    // Add metadata
    FOR (key, value) IN request.metadata DO
        http_request.headers.insert(format!("x-amz-meta-{}", key), value)
    END FOR

    client.signer.sign_request(&mut http_request, "UNSIGNED-PAYLOAD", Utc::now())?

    response <- execute_with_resilience(client, http_request).await?

    // Parse XML response
    result <- parse_initiate_multipart_xml(&response.body)?

    RETURN Ok(CreateMultipartOutput {
        bucket: result.bucket,
        key: result.key,
        upload_id: result.upload_id,
    })
END FUNCTION
```

### 5.2 Upload Part

```pseudocode
FUNCTION upload_part(
    client: &R2Client,
    request: UploadPartRequest
) -> Result<UploadPartOutput, R2Error>
    span <- tracer.start_span("r2.upload_part", {
        part_number: request.part_number,
        content_length: request.body.len(),
    })

    // Validate part number (1-10000)
    IF request.part_number < 1 OR request.part_number > 10000 THEN
        RETURN Err(R2Error::Multipart(MultipartError::InvalidPart))
    END IF

    url <- format!("{}/{}/{}?partNumber={}&uploadId={}",
        client.config.endpoint_url(),
        request.bucket,
        uri_encode_path(&request.key),
        request.part_number,
        uri_encode(&request.upload_id)
    )

    payload_hash <- sha256_hex(&request.body)

    http_request <- HttpRequest {
        method: PUT,
        url: url.parse()?,
        headers: HeaderMap::new(),
        body: Some(request.body.clone()),
    }

    client.signer.sign_request(&mut http_request, &payload_hash, Utc::now())?

    response <- execute_with_resilience(client, http_request).await?

    e_tag <- response.headers.get("etag")
        .ok_or(R2Error::Response(ResponseError::MissingETag))?
        .trim_matches('"')

    metrics.observe("r2_bytes_transferred_total", request.body.len(), {
        operation: "UploadPart",
        direction: "upload",
    })

    RETURN Ok(UploadPartOutput {
        e_tag: e_tag.to_string(),
        part_number: request.part_number,
    })
END FUNCTION
```

### 5.3 Complete Multipart Upload

```pseudocode
FUNCTION complete_multipart_upload(
    client: &R2Client,
    request: CompleteMultipartRequest
) -> Result<CompleteMultipartOutput, R2Error>
    span <- tracer.start_span("r2.complete_multipart_upload", {
        parts_count: request.parts.len(),
    })

    // Build XML body
    xml_body <- build_complete_multipart_xml(&request.parts)

    url <- format!("{}/{}/{}?uploadId={}",
        client.config.endpoint_url(),
        request.bucket,
        uri_encode_path(&request.key),
        uri_encode(&request.upload_id)
    )

    http_request <- HttpRequest {
        method: POST,
        url: url.parse()?,
        headers: HeaderMap::new(),
        body: Some(xml_body.into_bytes()),
    }

    http_request.headers.insert("content-type", "application/xml")

    payload_hash <- sha256_hex(&xml_body)
    client.signer.sign_request(&mut http_request, &payload_hash, Utc::now())?

    response <- execute_with_resilience(client, http_request).await?

    // Parse XML response
    result <- parse_complete_multipart_xml(&response.body)?

    metrics.increment("r2_multipart_parts_total", {
        bucket: request.bucket,
        status: "completed",
    })

    RETURN Ok(CompleteMultipartOutput {
        bucket: result.bucket,
        key: result.key,
        e_tag: result.e_tag,
        location: result.location,
    })
END FUNCTION

FUNCTION build_complete_multipart_xml(parts: &[CompletedPart]) -> String
    xml <- "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
    xml += "<CompleteMultipartUpload>\n"

    // Parts must be in order by part number
    sorted_parts <- parts.sorted_by(|a, b| a.part_number.cmp(&b.part_number))

    FOR part IN sorted_parts DO
        xml += "  <Part>\n"
        xml += format!("    <PartNumber>{}</PartNumber>\n", part.part_number)
        xml += format!("    <ETag>{}</ETag>\n", part.e_tag)
        xml += "  </Part>\n"
    END FOR

    xml += "</CompleteMultipartUpload>"
    RETURN xml
END FUNCTION
```

### 5.4 Abort Multipart Upload

```pseudocode
FUNCTION abort_multipart_upload(
    client: &R2Client,
    request: AbortMultipartRequest
) -> Result<(), R2Error>
    span <- tracer.start_span("r2.abort_multipart_upload")

    url <- format!("{}/{}/{}?uploadId={}",
        client.config.endpoint_url(),
        request.bucket,
        uri_encode_path(&request.key),
        uri_encode(&request.upload_id)
    )

    http_request <- HttpRequest {
        method: DELETE,
        url: url.parse()?,
        headers: HeaderMap::new(),
        body: None,
    }

    client.signer.sign_request(&mut http_request, "UNSIGNED-PAYLOAD", Utc::now())?

    response <- execute_with_resilience(client, http_request).await?

    metrics.increment("r2_multipart_parts_total", {
        bucket: request.bucket,
        status: "aborted",
    })

    RETURN Ok(())
END FUNCTION
```

### 5.5 High-Level Upload with Auto-Multipart

```pseudocode
FUNCTION upload_object(
    client: &R2Client,
    bucket: &str,
    key: &str,
    body: impl Stream<Item = Result<Bytes, R2Error>>,
    content_length: Option<u64>,
    options: UploadOptions
) -> Result<UploadOutput, R2Error>
    span <- tracer.start_span("r2.upload_object", {
        r2.bucket: bucket,
        r2.key: key,
    })

    // Determine if multipart is needed
    use_multipart <- content_length
        .map(|len| len > client.config.multipart_threshold)
        .unwrap_or(true)  // Unknown size = multipart

    IF use_multipart THEN
        RETURN upload_multipart(client, bucket, key, body, options).await
    ELSE
        // Collect stream into bytes for small objects
        bytes <- collect_stream(body).await?
        result <- put_object(client, PutObjectRequest {
            bucket: bucket.to_string(),
            key: key.to_string(),
            body: bytes,
            content_type: options.content_type,
            metadata: options.metadata,
            ..Default::default()
        }).await?

        RETURN Ok(UploadOutput {
            e_tag: result.e_tag,
            version_id: result.version_id,
        })
    END IF
END FUNCTION

FUNCTION upload_multipart(
    client: &R2Client,
    bucket: &str,
    key: &str,
    body: impl Stream<Item = Result<Bytes, R2Error>>,
    options: UploadOptions
) -> Result<UploadOutput, R2Error>
    // Step 1: Initiate multipart upload
    create_result <- create_multipart_upload(client, CreateMultipartRequest {
        bucket: bucket.to_string(),
        key: key.to_string(),
        content_type: options.content_type,
        metadata: options.metadata,
    }).await?

    upload_id <- create_result.upload_id

    TRY
        // Step 2: Upload parts concurrently
        part_size <- client.config.multipart_part_size
        concurrency <- client.config.multipart_concurrency

        completed_parts <- upload_parts_concurrent(
            client,
            bucket,
            key,
            &upload_id,
            body,
            part_size,
            concurrency
        ).await?

        // Step 3: Complete multipart upload
        complete_result <- complete_multipart_upload(client, CompleteMultipartRequest {
            bucket: bucket.to_string(),
            key: key.to_string(),
            upload_id: upload_id.clone(),
            parts: completed_parts,
        }).await?

        RETURN Ok(UploadOutput {
            e_tag: Some(complete_result.e_tag),
            version_id: None,
        })

    CATCH error
        // Abort on failure
        logger.warn("Multipart upload failed, aborting", { upload_id: upload_id })
        abort_multipart_upload(client, AbortMultipartRequest {
            bucket: bucket.to_string(),
            key: key.to_string(),
            upload_id: upload_id,
        }).await.ok()  // Ignore abort errors

        RETURN Err(error)
    END TRY
END FUNCTION

FUNCTION upload_parts_concurrent(
    client: &R2Client,
    bucket: &str,
    key: &str,
    upload_id: &str,
    body: impl Stream<Item = Result<Bytes, R2Error>>,
    part_size: u64,
    concurrency: usize
) -> Result<Vec<CompletedPart>, R2Error>
    // Buffer stream into parts
    parts_stream <- chunk_stream(body, part_size)

    // Upload parts with bounded concurrency
    completed_parts <- parts_stream
        .enumerate()
        .map(|(idx, part_data)| async move {
            part_number <- (idx + 1) as i32
            result <- upload_part(client, UploadPartRequest {
                bucket: bucket.to_string(),
                key: key.to_string(),
                upload_id: upload_id.to_string(),
                part_number: part_number,
                body: part_data?,
            }).await?

            Ok(CompletedPart {
                part_number: part_number,
                e_tag: result.e_tag,
            })
        })
        .buffer_unordered(concurrency)
        .try_collect()
        .await?

    RETURN Ok(completed_parts)
END FUNCTION
```

---

## 6. Resilience Integration

### 6.1 Execute with Resilience

```pseudocode
FUNCTION execute_with_resilience(
    client: &R2Client,
    request: HttpRequest
) -> Result<HttpResponse, R2Error>
    // Check circuit breaker
    IF NOT client.circuit_breaker.allow_request() THEN
        RETURN Err(R2Error::Server(ServerError::CircuitBreakerOpen))
    END IF

    // Apply rate limiting
    IF client.rate_limiter IS Some(limiter) THEN
        limiter.acquire().await?
    END IF

    // Execute with retry
    result <- client.retry_executor.execute(|| async {
        response <- client.transport.send(request.clone()).await
            .map_err(|e| R2Error::Network(e.into()))?

        // Check for retryable errors
        IF response.status >= 500 THEN
            error <- parse_error_response(&response)?
            IF error.is_retryable() THEN
                RETURN Err(RetryableError::new(error))
            END IF
        END IF

        Ok(response)
    }).await

    // Update circuit breaker
    MATCH result {
        Ok(_) => client.circuit_breaker.record_success(),
        Err(ref e) IF e.is_server_error() => client.circuit_breaker.record_failure(),
        _ => {}
    }

    result
END FUNCTION
```

---

## 7. Simulation Support

### 7.1 Recording

```pseudocode
STRUCT SimulationRecorder {
    storage: Arc<RwLock<HashMap<String, RecordedInteraction>>>,
    enabled: bool,
}

STRUCT RecordedInteraction {
    operation: String,
    bucket: String,
    key: String,
    request_hash: String,
    response_body: Bytes,
    response_headers: HashMap<String, String>,
    status_code: u16,
    duration: Duration,
    timestamp: DateTime<Utc>,
}

IMPL R2Recorder FOR SimulationRecorder {
    FUNCTION record_request(&self, op: &str, bucket: &str, key: &str, req_body: &[u8])
        IF NOT self.enabled THEN RETURN END IF

        request_hash <- sha256_hex(req_body)
        storage_key <- format!("{}:{}:{}:{}", op, bucket, key, request_hash)

        // Store request info for correlation
        self.storage.write().insert(storage_key, RecordedInteraction {
            operation: op.to_string(),
            bucket: bucket.to_string(),
            key: key.to_string(),
            request_hash: request_hash,
            ..Default::default()
        })
    END FUNCTION

    FUNCTION record_response(
        &self,
        op: &str,
        bucket: &str,
        key: &str,
        response: &HttpResponse,
        duration: Duration
    )
        IF NOT self.enabled THEN RETURN END IF

        storage_key <- format!("{}:{}:{}", op, bucket, key)

        self.storage.write().entry(storage_key).and_modify(|rec| {
            rec.response_body = response.body.clone()
            rec.response_headers = response.headers.clone()
            rec.status_code = response.status
            rec.duration = duration
            rec.timestamp = Utc::now()
        })
    END FUNCTION
}
```

### 7.2 Replay

```pseudocode
STRUCT SimulationReplayer {
    recordings: HashMap<String, RecordedInteraction>,
    simulate_latency: bool,
}

IMPL R2Replayer FOR SimulationReplayer {
    FUNCTION replay_response(
        &self,
        op: &str,
        bucket: &str,
        key: &str
    ) -> Option<ReplayedResponse>
        storage_key <- format!("{}:{}:{}", op, bucket, key)

        recording <- self.recordings.get(&storage_key)?

        Some(ReplayedResponse {
            body: recording.response_body.clone(),
            headers: recording.response_headers.clone(),
            status: recording.status_code,
            delay: IF self.simulate_latency THEN recording.duration ELSE Duration::ZERO END IF,
        })
    END FUNCTION
}

// Mock transport that uses replayer
STRUCT ReplayTransport {
    replayer: Arc<dyn R2Replayer>,
}

IMPL HttpTransport FOR ReplayTransport {
    ASYNC FUNCTION send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError>
        // Extract operation info from request
        (op, bucket, key) <- extract_operation_info(&request)?

        replay <- self.replayer.replay_response(op, bucket, key)
            .ok_or(TransportError::NoRecording)?

        // Simulate latency if configured
        IF replay.delay > Duration::ZERO THEN
            tokio::time::sleep(replay.delay).await
        END IF

        Ok(HttpResponse {
            status: replay.status,
            headers: replay.headers.into(),
            body: replay.body,
        })
    END FUNCTION
}
```

---

## 8. XML Parsing

### 8.1 List Objects Response

```pseudocode
FUNCTION parse_list_objects_xml(xml: &[u8]) -> Result<ListObjectsOutput, R2Error>
    doc <- parse_xml(xml)?

    root <- doc.root_element("ListBucketResult")?

    output <- ListObjectsOutput {
        is_truncated: root.child_text("IsTruncated")?.parse()?,
        contents: vec![],
        common_prefixes: vec![],
        name: root.child_text("Name")?,
        prefix: root.child_text_opt("Prefix"),
        delimiter: root.child_text_opt("Delimiter"),
        max_keys: root.child_text("MaxKeys")?.parse()?,
        key_count: root.child_text("KeyCount")?.parse()?,
        continuation_token: root.child_text_opt("ContinuationToken"),
        next_continuation_token: root.child_text_opt("NextContinuationToken"),
    }

    // Parse contents
    FOR contents_elem IN root.children("Contents") DO
        object <- R2Object {
            key: contents_elem.child_text("Key")?,
            last_modified: parse_iso8601(contents_elem.child_text("LastModified")?)?,
            e_tag: contents_elem.child_text("ETag")?.trim_matches('"').to_string(),
            size: contents_elem.child_text("Size")?.parse()?,
            storage_class: contents_elem.child_text_opt("StorageClass"),
        }
        output.contents.push(object)
    END FOR

    // Parse common prefixes
    FOR prefix_elem IN root.children("CommonPrefixes") DO
        prefix <- prefix_elem.child_text("Prefix")?
        output.common_prefixes.push(CommonPrefix { prefix })
    END FOR

    RETURN Ok(output)
END FUNCTION
```

### 8.2 Error Response

```pseudocode
FUNCTION parse_error_response(response: &HttpResponse) -> R2Error
    IF response.body.is_empty() THEN
        RETURN map_status_to_error(response.status)
    END IF

    TRY
        doc <- parse_xml(&response.body)?
        root <- doc.root_element("Error")?

        code <- root.child_text("Code")?
        message <- root.child_text("Message")?
        request_id <- root.child_text_opt("RequestId")

        map_s3_error_code(&code, &message, request_id)

    CATCH _
        // If XML parsing fails, use status code
        map_status_to_error(response.status)
    END TRY
END FUNCTION

FUNCTION map_s3_error_code(code: &str, message: &str, request_id: Option<String>) -> R2Error
    MATCH code {
        "NoSuchBucket" => R2Error::Bucket(BucketError::BucketNotFound { message }),
        "NoSuchKey" => R2Error::Object(ObjectError::ObjectNotFound { message }),
        "NoSuchUpload" => R2Error::Multipart(MultipartError::UploadNotFound { message }),
        "AccessDenied" => R2Error::Auth(AuthError::AccessDenied { message }),
        "SignatureDoesNotMatch" => R2Error::Auth(AuthError::SignatureDoesNotMatch { message }),
        "InvalidAccessKeyId" => R2Error::Auth(AuthError::InvalidAccessKey { message }),
        "EntityTooLarge" => R2Error::Object(ObjectError::EntityTooLarge { message }),
        "EntityTooSmall" => R2Error::Multipart(MultipartError::EntityTooSmall { message }),
        "InvalidPart" => R2Error::Multipart(MultipartError::InvalidPart { message }),
        "InvalidPartOrder" => R2Error::Multipart(MultipartError::InvalidPartOrder { message }),
        "InternalError" => R2Error::Server(ServerError::InternalError { message, request_id }),
        "ServiceUnavailable" => R2Error::Server(ServerError::ServiceUnavailable { message }),
        "SlowDown" => R2Error::Server(ServerError::SlowDown { message, retry_after: None }),
        _ => R2Error::Server(ServerError::Unknown { code: code.to_string(), message }),
    }
END FUNCTION
```

---

## 9. Testing Support

### 9.1 Mock Client

```pseudocode
STRUCT MockR2Client {
    objects: MockObjectsService,
    multipart: MockMultipartService,
    presign: MockPresignService,
}

STRUCT MockObjectsService {
    put_responses: VecDeque<Result<PutObjectOutput, R2Error>>,
    get_responses: VecDeque<Result<GetObjectOutput, R2Error>>,
    delete_responses: VecDeque<Result<(), R2Error>>,
    list_responses: VecDeque<Result<ListObjectsOutput, R2Error>>,
    // ... other operations
}

IMPL MockObjectsService {
    FUNCTION expect_put(&mut self, response: Result<PutObjectOutput, R2Error>)
        self.put_responses.push_back(response)
    END FUNCTION

    FUNCTION expect_get(&mut self, response: Result<GetObjectOutput, R2Error>)
        self.get_responses.push_back(response)
    END FUNCTION
}

IMPL R2ObjectsService FOR MockObjectsService {
    ASYNC FUNCTION put(&self, _req: PutObjectRequest) -> Result<PutObjectOutput, R2Error>
        self.put_responses.pop_front()
            .unwrap_or(Err(R2Error::Config(ConfigError::MockNotConfigured)))
    END FUNCTION

    // ... other operations
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-14 | SPARC Generator | Initial Pseudocode |

---

**Next Phase:** Architecture - Component diagrams, data flow, module structure, and integration patterns.
