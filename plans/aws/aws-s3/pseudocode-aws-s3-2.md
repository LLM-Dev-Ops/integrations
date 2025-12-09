# AWS S3 Integration Module - Pseudocode (Part 2)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/aws-s3`
**Part:** 2 of 3 - Object Operations, Bucket Operations & Streaming

---

## Table of Contents

1. [Objects Service Implementation](#1-objects-service-implementation)
2. [Buckets Service Implementation](#2-buckets-service-implementation)
3. [Streaming Operations](#3-streaming-operations)
4. [Pagination Helpers](#4-pagination-helpers)

---

## 1. Objects Service Implementation

### 1.1 Objects Service Structure

```pseudocode
STRUCT ObjectsServiceImpl {
    config: S3Config,
    transport: Arc<dyn HttpTransport>,
    signer: Arc<dyn AwsSigner>,
    executor: ResilientExecutor,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
    endpoint_resolver: EndpointResolver,
}

IMPL ObjectsServiceImpl {
    FUNCTION new(
        config: S3Config,
        transport: Arc<dyn HttpTransport>,
        signer: Arc<dyn AwsSigner>,
        retry_executor: Arc<RetryExecutor>,
        circuit_breaker: Arc<CircuitBreaker>,
        rate_limiter: Option<Arc<RateLimiter>>,
        logger: Arc<dyn Logger>,
        tracer: Arc<dyn Tracer>
    ) -> Self
        Self {
            config: config.clone(),
            transport: transport.clone(),
            signer: signer.clone(),
            executor: ResilientExecutor {
                transport,
                retry_executor,
                circuit_breaker,
                rate_limiter,
                logger: logger.clone(),
                tracer: tracer.clone(),
            },
            logger,
            tracer,
            endpoint_resolver: EndpointResolver::from(&config),
        }
    END FUNCTION
}
```

### 1.2 PutObject Implementation

```pseudocode
IMPL ObjectsService FOR ObjectsServiceImpl {
    ASYNC FUNCTION put(self, request: PutObjectRequest) -> Result<PutObjectOutput, S3Error>
        // Create tracing span
        span <- self.tracer.start_span("s3.PutObject", {
            "s3.bucket": request.bucket.clone(),
            "s3.key": request.key.clone(),
            "s3.content_length": request.body.len(),
        })

        self.logger.debug("PutObject request", {
            bucket: &request.bucket,
            key: &request.key,
            content_length: request.body.len(),
            storage_class: request.storage_class.as_ref().map(|s| s.as_str()),
        })

        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        // Check if should use multipart upload
        IF request.body.len() as u64 > self.config.multipart_threshold THEN
            span.record("s3.multipart", true)
            // Delegate to multipart upload
            RETURN self.put_large_object(request, &span).await
        END IF

        // Build HTTP request
        (http_request, payload_hash) <- build_put_object_request(&self.config, &request)?

        // Sign and execute
        result <- self.executor.execute("PutObject", || async {
            mut signed_request <- http_request.clone()
            self.signer.sign_request(
                &mut signed_request,
                &payload_hash,
                Utc::now()
            )?

            response <- self.transport.send(signed_request).await?

            // Handle response
            IF response.status.is_success() THEN
                output <- S3ResponseParser::parse_put_object_headers(&response.headers)
                (request_id, extended_id) <- S3ResponseParser::extract_request_ids(&response.headers)

                self.logger.info("PutObject successful", {
                    bucket: &request.bucket,
                    key: &request.key,
                    e_tag: &output.e_tag,
                    request_id: request_id.as_deref(),
                })

                Ok(output)
            ELSE
                Err(map_http_status_to_error(response.status, &response.body))
            END IF
        }, &span).await

        span.end()
        result
    END FUNCTION

    ASYNC FUNCTION put_stream(
        self,
        request: PutObjectStreamRequest,
        body: impl Stream<Item = Result<Bytes, S3Error>> + Send + 'static
    ) -> Result<PutObjectOutput, S3Error>
        span <- self.tracer.start_span("s3.PutObjectStream", {
            "s3.bucket": request.bucket.clone(),
            "s3.key": request.key.clone(),
            "s3.content_length": request.content_length,
        })

        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        // For streaming uploads with unknown content length, use multipart
        IF request.content_length > self.config.multipart_threshold THEN
            span.record("s3.multipart", true)
            RETURN self.multipart_upload_stream(request, body, &span).await
        END IF

        // Build streaming request
        // Use unsigned payload for streaming
        payload_hash <- "UNSIGNED-PAYLOAD"

        mut builder <- S3RequestBuilder::new(HttpMethod::PUT, self.endpoint_resolver.clone())
            .bucket(&request.bucket)
            .key(&request.key)
            .content_length(request.content_length)
            .header("x-amz-content-sha256", payload_hash)
            .body_stream(body)

        // Add optional headers
        IF request.content_type IS Some(ct) THEN
            builder <- builder.content_type(ct)
        END IF
        IF request.storage_class IS Some(sc) THEN
            builder <- builder.storage_class(sc)
        END IF
        IF request.metadata IS Some(meta) THEN
            builder <- builder.metadata(&meta)
        END IF

        http_request <- builder.build()

        // Sign with unsigned payload
        mut signed_request <- http_request
        self.signer.sign_request(&mut signed_request, payload_hash, Utc::now())?

        // Execute streaming request (limited retry - connection only)
        response <- self.executor.execute_streaming("PutObjectStream", || async {
            self.transport.send(signed_request.clone()).await
        }, &span).await?

        IF response.status.is_success() THEN
            output <- S3ResponseParser::parse_put_object_headers(&response.headers)
            span.record("s3.e_tag", &output.e_tag)
            span.end()
            Ok(output)
        ELSE
            body <- response.body
            span.end()
            Err(map_http_status_to_error(response.status, &body))
        END IF
    END FUNCTION
}
```

### 1.3 GetObject Implementation

```pseudocode
IMPL ObjectsService FOR ObjectsServiceImpl {
    ASYNC FUNCTION get(self, request: GetObjectRequest) -> Result<GetObjectOutput, S3Error>
        span <- self.tracer.start_span("s3.GetObject", {
            "s3.bucket": request.bucket.clone(),
            "s3.key": request.key.clone(),
        })

        self.logger.debug("GetObject request", {
            bucket: &request.bucket,
            key: &request.key,
            range: request.range.as_deref(),
        })

        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        // Build HTTP request
        http_request <- build_get_object_request(&self.config, &request)

        // Sign and execute
        result <- self.executor.execute("GetObject", || async {
            mut signed_request <- http_request.clone()
            // GET requests have empty body
            self.signer.sign_request(
                &mut signed_request,
                &sha256_hex(b""),
                Utc::now()
            )?

            response <- self.transport.send(signed_request).await?

            // Handle response
            MATCH response.status.as_u16() {
                200 | 206 => {
                    metadata <- S3ResponseParser::parse_get_object_headers(&response.headers)
                    (request_id, _) <- S3ResponseParser::extract_request_ids(&response.headers)

                    span.record("s3.content_length", metadata.content_length)
                    span.record("s3.e_tag", &metadata.e_tag)

                    self.logger.info("GetObject successful", {
                        bucket: &request.bucket,
                        key: &request.key,
                        content_length: metadata.content_length,
                        request_id: request_id.as_deref(),
                    })

                    Ok(GetObjectOutput {
                        body: response.body.to_vec(),
                        content_length: metadata.content_length,
                        content_type: metadata.content_type,
                        content_encoding: metadata.content_encoding,
                        content_disposition: metadata.content_disposition,
                        content_language: metadata.content_language,
                        cache_control: metadata.cache_control,
                        e_tag: metadata.e_tag,
                        last_modified: metadata.last_modified.unwrap_or_else(Utc::now),
                        metadata: metadata.metadata,
                        version_id: metadata.version_id,
                        delete_marker: metadata.delete_marker,
                        storage_class: metadata.storage_class,
                        server_side_encryption: metadata.server_side_encryption,
                        content_range: metadata.content_range,
                        accept_ranges: metadata.accept_ranges,
                        expires: metadata.expires,
                    })
                },
                304 => {
                    Err(S3Error::Object(ObjectError::NotModified {
                        bucket: request.bucket.clone(),
                        key: request.key.clone(),
                    }))
                },
                _ => {
                    Err(map_http_status_to_error(response.status, &response.body))
                }
            }
        }, &span).await

        span.end()
        result
    END FUNCTION

    ASYNC FUNCTION get_stream(
        self,
        request: GetObjectRequest
    ) -> Result<GetObjectStreamOutput, S3Error>
        span <- self.tracer.start_span("s3.GetObjectStream", {
            "s3.bucket": request.bucket.clone(),
            "s3.key": request.key.clone(),
        })

        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        // Build HTTP request
        http_request <- build_get_object_request(&self.config, &request)

        // Sign request
        mut signed_request <- http_request
        self.signer.sign_request(&mut signed_request, &sha256_hex(b""), Utc::now())?

        // Execute streaming request
        response <- self.executor.execute_streaming("GetObjectStream", || async {
            self.transport.send_streaming(signed_request.clone()).await
        }, &span).await?

        MATCH response.status.as_u16() {
            200 | 206 => {
                metadata <- S3ResponseParser::parse_get_object_headers(&response.headers)

                span.record("s3.content_length", metadata.content_length)
                span.record("s3.streaming", true)

                // Return streaming response
                // Note: span is NOT ended here - caller owns the span lifetime
                Ok(GetObjectStreamOutput {
                    body: response.body,
                    content_length: metadata.content_length,
                    content_type: metadata.content_type,
                    content_encoding: metadata.content_encoding,
                    content_disposition: metadata.content_disposition,
                    content_language: metadata.content_language,
                    cache_control: metadata.cache_control,
                    e_tag: metadata.e_tag,
                    last_modified: metadata.last_modified.unwrap_or_else(Utc::now),
                    metadata: metadata.metadata,
                    version_id: metadata.version_id,
                    delete_marker: metadata.delete_marker,
                    storage_class: metadata.storage_class,
                    server_side_encryption: metadata.server_side_encryption,
                    content_range: metadata.content_range,
                    accept_ranges: metadata.accept_ranges,
                    expires: metadata.expires,
                })
            },
            304 => {
                span.end()
                Err(S3Error::Object(ObjectError::NotModified {
                    bucket: request.bucket.clone(),
                    key: request.key.clone(),
                }))
            },
            _ => {
                // Read error body from stream
                mut error_body <- Vec::new()
                pin_mut!(response.body)
                WHILE let Some(chunk) = response.body.next().await DO
                    IF let Ok(bytes) = chunk THEN
                        error_body.extend_from_slice(&bytes)
                    END IF
                END WHILE
                span.end()
                Err(map_http_status_to_error(response.status, &error_body))
            }
        }
    END FUNCTION
}
```

### 1.4 DeleteObject Implementation

```pseudocode
IMPL ObjectsService FOR ObjectsServiceImpl {
    ASYNC FUNCTION delete(self, request: DeleteObjectRequest) -> Result<DeleteObjectOutput, S3Error>
        span <- self.tracer.start_span("s3.DeleteObject", {
            "s3.bucket": request.bucket.clone(),
            "s3.key": request.key.clone(),
        })

        self.logger.debug("DeleteObject request", {
            bucket: &request.bucket,
            key: &request.key,
            version_id: request.version_id.as_deref(),
        })

        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        // Build HTTP request
        mut builder <- S3RequestBuilder::new(HttpMethod::DELETE, self.endpoint_resolver.clone())
            .bucket(&request.bucket)
            .key(&request.key)

        IF request.version_id IS Some(vid) THEN
            builder <- builder.query("versionId", vid)
        END IF

        IF request.mfa IS Some(mfa) THEN
            builder <- builder.header("x-amz-mfa", mfa)
        END IF

        IF request.bypass_governance_retention == Some(true) THEN
            builder <- builder.header("x-amz-bypass-governance-retention", "true")
        END IF

        http_request <- builder.build()

        // Sign and execute
        result <- self.executor.execute("DeleteObject", || async {
            mut signed_request <- http_request.clone()
            self.signer.sign_request(&mut signed_request, &sha256_hex(b""), Utc::now())?

            response <- self.transport.send(signed_request).await?

            IF response.status.is_success() THEN
                delete_marker <- response.headers.get("x-amz-delete-marker")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s == "true")

                version_id <- response.headers.get("x-amz-version-id")
                    .and_then(|v| v.to_str().ok())
                    .map(String::from)

                (request_id, _) <- S3ResponseParser::extract_request_ids(&response.headers)

                self.logger.info("DeleteObject successful", {
                    bucket: &request.bucket,
                    key: &request.key,
                    delete_marker: delete_marker,
                    request_id: request_id.as_deref(),
                })

                Ok(DeleteObjectOutput {
                    delete_marker,
                    version_id,
                })
            ELSE
                Err(map_http_status_to_error(response.status, &response.body))
            END IF
        }, &span).await

        span.end()
        result
    END FUNCTION

    ASYNC FUNCTION delete_objects(
        self,
        request: DeleteObjectsRequest
    ) -> Result<DeleteObjectsOutput, S3Error>
        span <- self.tracer.start_span("s3.DeleteObjects", {
            "s3.bucket": request.bucket.clone(),
            "s3.object_count": request.objects.len(),
        })

        self.logger.debug("DeleteObjects request", {
            bucket: &request.bucket,
            object_count: request.objects.len(),
            quiet: request.quiet,
        })

        // Validate inputs
        validate_bucket_name(&request.bucket)?

        IF request.objects.is_empty() THEN
            RETURN Ok(DeleteObjectsOutput {
                deleted: Vec::new(),
                errors: Vec::new(),
            })
        END IF

        IF request.objects.len() > 1000 THEN
            RETURN Err(S3Error::Request(RequestError::TooManyObjects {
                count: request.objects.len(),
                max: 1000,
            }))
        END IF

        // Build delete XML and HTTP request
        (http_request, payload_hash) <- build_delete_objects_request(&self.config, &request)?

        // Sign and execute
        result <- self.executor.execute("DeleteObjects", || async {
            mut signed_request <- http_request.clone()
            self.signer.sign_request(&mut signed_request, &payload_hash, Utc::now())?

            response <- self.transport.send(signed_request).await?

            IF response.status.is_success() THEN
                output <- S3ResponseParser::parse_delete_objects_response(&response.body)?
                (request_id, _) <- S3ResponseParser::extract_request_ids(&response.headers)

                self.logger.info("DeleteObjects successful", {
                    bucket: &request.bucket,
                    deleted_count: output.deleted.len(),
                    error_count: output.errors.len(),
                    request_id: request_id.as_deref(),
                })

                span.record("s3.deleted_count", output.deleted.len())
                span.record("s3.error_count", output.errors.len())

                Ok(output)
            ELSE
                Err(map_http_status_to_error(response.status, &response.body))
            END IF
        }, &span).await

        span.end()
        result
    END FUNCTION
}
```

### 1.5 HeadObject Implementation

```pseudocode
IMPL ObjectsService FOR ObjectsServiceImpl {
    ASYNC FUNCTION head(self, request: HeadObjectRequest) -> Result<HeadObjectOutput, S3Error>
        span <- self.tracer.start_span("s3.HeadObject", {
            "s3.bucket": request.bucket.clone(),
            "s3.key": request.key.clone(),
        })

        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        // Build HTTP request
        mut builder <- S3RequestBuilder::new(HttpMethod::HEAD, self.endpoint_resolver.clone())
            .bucket(&request.bucket)
            .key(&request.key)

        builder <- builder
            .query_opt("versionId", request.version_id.as_ref())
            .header_opt("if-match", request.if_match.as_ref())
            .header_opt("if-none-match", request.if_none_match.as_ref())

        IF request.if_modified_since IS Some(date) THEN
            builder <- builder.header("if-modified-since", date.to_rfc2822())
        END IF
        IF request.if_unmodified_since IS Some(date) THEN
            builder <- builder.header("if-unmodified-since", date.to_rfc2822())
        END IF

        http_request <- builder.build()

        // Sign and execute
        result <- self.executor.execute("HeadObject", || async {
            mut signed_request <- http_request.clone()
            self.signer.sign_request(&mut signed_request, &sha256_hex(b""), Utc::now())?

            response <- self.transport.send(signed_request).await?

            MATCH response.status.as_u16() {
                200 => {
                    metadata <- S3ResponseParser::parse_get_object_headers(&response.headers)

                    span.record("s3.content_length", metadata.content_length)
                    span.record("s3.e_tag", &metadata.e_tag)

                    Ok(HeadObjectOutput {
                        content_length: metadata.content_length,
                        content_type: metadata.content_type,
                        content_encoding: metadata.content_encoding,
                        content_disposition: metadata.content_disposition,
                        content_language: metadata.content_language,
                        cache_control: metadata.cache_control,
                        e_tag: metadata.e_tag,
                        last_modified: metadata.last_modified.unwrap_or_else(Utc::now),
                        metadata: metadata.metadata,
                        version_id: metadata.version_id,
                        delete_marker: metadata.delete_marker,
                        storage_class: metadata.storage_class,
                        server_side_encryption: metadata.server_side_encryption,
                        expires: metadata.expires,
                        restore: metadata.restore,
                        parts_count: metadata.parts_count,
                    })
                },
                304 => {
                    Err(S3Error::Object(ObjectError::NotModified {
                        bucket: request.bucket.clone(),
                        key: request.key.clone(),
                    }))
                },
                404 => {
                    Err(S3Error::Object(ObjectError::ObjectNotFound {
                        bucket: request.bucket.clone(),
                        key: request.key.clone(),
                        request_id: None,
                    }))
                },
                _ => {
                    Err(map_http_status_to_error(response.status, &response.body))
                }
            }
        }, &span).await

        span.end()
        result
    END FUNCTION
}
```

### 1.6 CopyObject Implementation

```pseudocode
IMPL ObjectsService FOR ObjectsServiceImpl {
    ASYNC FUNCTION copy(self, request: CopyObjectRequest) -> Result<CopyObjectOutput, S3Error>
        span <- self.tracer.start_span("s3.CopyObject", {
            "s3.source_bucket": request.source_bucket.clone(),
            "s3.source_key": request.source_key.clone(),
            "s3.dest_bucket": request.bucket.clone(),
            "s3.dest_key": request.key.clone(),
        })

        self.logger.debug("CopyObject request", {
            source_bucket: &request.source_bucket,
            source_key: &request.source_key,
            dest_bucket: &request.bucket,
            dest_key: &request.key,
        })

        // Validate inputs
        validate_bucket_name(&request.source_bucket)?
        validate_object_key(&request.source_key)?
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        // Build HTTP request
        mut builder <- S3RequestBuilder::new(HttpMethod::PUT, self.endpoint_resolver.clone())
            .bucket(&request.bucket)
            .key(&request.key)
            .copy_source(
                &request.source_bucket,
                &request.source_key,
                request.source_version_id.as_deref()
            )

        // Metadata directive
        IF request.metadata_directive IS Some(directive) THEN
            builder <- builder.header("x-amz-metadata-directive", directive.as_str())
        END IF

        // Tagging directive
        IF request.tagging_directive IS Some(directive) THEN
            builder <- builder.header("x-amz-tagging-directive", directive.as_str())
        END IF

        // Conditional copy headers
        builder <- builder
            .header_opt("x-amz-copy-source-if-match", request.copy_source_if_match.as_ref())
            .header_opt("x-amz-copy-source-if-none-match", request.copy_source_if_none_match.as_ref())

        IF request.copy_source_if_modified_since IS Some(date) THEN
            builder <- builder.header("x-amz-copy-source-if-modified-since", date.to_rfc2822())
        END IF
        IF request.copy_source_if_unmodified_since IS Some(date) THEN
            builder <- builder.header("x-amz-copy-source-if-unmodified-since", date.to_rfc2822())
        END IF

        // Destination settings
        IF request.storage_class IS Some(sc) THEN
            builder <- builder.storage_class(sc)
        END IF
        IF request.server_side_encryption IS Some(sse) THEN
            builder <- builder.server_side_encryption(sse)
        END IF
        IF request.sse_kms_key_id IS Some(key_id) THEN
            builder <- builder.sse_kms_key_id(key_id)
        END IF
        IF request.acl IS Some(acl) THEN
            builder <- builder.acl(acl)
        END IF
        IF request.metadata IS Some(meta) THEN
            builder <- builder.metadata(&meta)
        END IF

        http_request <- builder.build()

        // Sign and execute
        result <- self.executor.execute("CopyObject", || async {
            mut signed_request <- http_request.clone()
            // COPY has no request body
            self.signer.sign_request(&mut signed_request, &sha256_hex(b""), Utc::now())?

            response <- self.transport.send(signed_request).await?

            IF response.status.is_success() THEN
                // Parse XML response
                copy_result <- S3ResponseParser::parse_copy_object_response(&response.body)?

                // Get additional info from headers
                copy_source_version_id <- response.headers.get("x-amz-copy-source-version-id")
                    .and_then(|v| v.to_str().ok())
                    .map(String::from)

                version_id <- response.headers.get("x-amz-version-id")
                    .and_then(|v| v.to_str().ok())
                    .map(String::from)

                (request_id, _) <- S3ResponseParser::extract_request_ids(&response.headers)

                self.logger.info("CopyObject successful", {
                    source: format!("{}/{}", request.source_bucket, request.source_key),
                    dest: format!("{}/{}", request.bucket, request.key),
                    e_tag: &copy_result.e_tag,
                    request_id: request_id.as_deref(),
                })

                Ok(CopyObjectOutput {
                    e_tag: copy_result.e_tag,
                    last_modified: copy_result.last_modified,
                    copy_source_version_id,
                    version_id,
                })
            ELSE
                Err(map_http_status_to_error(response.status, &response.body))
            END IF
        }, &span).await

        span.end()
        result
    END FUNCTION
}
```

### 1.7 ListObjectsV2 Implementation

```pseudocode
IMPL ObjectsService FOR ObjectsServiceImpl {
    ASYNC FUNCTION list(
        self,
        request: ListObjectsV2Request
    ) -> Result<ListObjectsV2Output, S3Error>
        span <- self.tracer.start_span("s3.ListObjectsV2", {
            "s3.bucket": request.bucket.clone(),
            "s3.prefix": request.prefix.clone().unwrap_or_default(),
        })

        self.logger.debug("ListObjectsV2 request", {
            bucket: &request.bucket,
            prefix: request.prefix.as_deref(),
            delimiter: request.delimiter.as_deref(),
            max_keys: request.max_keys,
        })

        // Validate inputs
        validate_bucket_name(&request.bucket)?

        // Build HTTP request
        mut builder <- S3RequestBuilder::new(HttpMethod::GET, self.endpoint_resolver.clone())
            .bucket(&request.bucket)
            .query("list-type", "2")

        builder <- builder
            .query_opt("prefix", request.prefix.as_ref())
            .query_opt("delimiter", request.delimiter.as_ref())
            .query_opt("continuation-token", request.continuation_token.as_ref())
            .query_opt("start-after", request.start_after.as_ref())
            .query_opt("encoding-type", request.encoding_type.as_ref())

        IF request.max_keys IS Some(max) THEN
            builder <- builder.query("max-keys", max.to_string())
        END IF

        IF request.fetch_owner == Some(true) THEN
            builder <- builder.query("fetch-owner", "true")
        END IF

        http_request <- builder.build()

        // Sign and execute
        result <- self.executor.execute("ListObjectsV2", || async {
            mut signed_request <- http_request.clone()
            self.signer.sign_request(&mut signed_request, &sha256_hex(b""), Utc::now())?

            response <- self.transport.send(signed_request).await?

            IF response.status.is_success() THEN
                output <- S3ResponseParser::parse_list_objects_response(&response.body)?
                (request_id, _) <- S3ResponseParser::extract_request_ids(&response.headers)

                span.record("s3.key_count", output.key_count)
                span.record("s3.is_truncated", output.is_truncated)

                self.logger.info("ListObjectsV2 successful", {
                    bucket: &request.bucket,
                    key_count: output.key_count,
                    is_truncated: output.is_truncated,
                    request_id: request_id.as_deref(),
                })

                Ok(output)
            ELSE
                Err(map_http_status_to_error(response.status, &response.body))
            END IF
        }, &span).await

        span.end()
        result
    END FUNCTION

    FUNCTION list_all(
        self,
        request: ListObjectsV2Request
    ) -> impl Stream<Item = Result<S3Object, S3Error>> + Send
        // Return an async iterator that handles pagination
        ListObjectsV2Paginator::new(self, request)
    END FUNCTION
}
```

---

## 2. Buckets Service Implementation

### 2.1 Buckets Service Structure

```pseudocode
STRUCT BucketsServiceImpl {
    config: S3Config,
    transport: Arc<dyn HttpTransport>,
    signer: Arc<dyn AwsSigner>,
    executor: ResilientExecutor,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
    endpoint_resolver: EndpointResolver,
}

IMPL BucketsServiceImpl {
    FUNCTION new(
        config: S3Config,
        transport: Arc<dyn HttpTransport>,
        signer: Arc<dyn AwsSigner>,
        retry_executor: Arc<RetryExecutor>,
        circuit_breaker: Arc<CircuitBreaker>,
        rate_limiter: Option<Arc<RateLimiter>>,
        logger: Arc<dyn Logger>,
        tracer: Arc<dyn Tracer>
    ) -> Self
        // Same pattern as ObjectsServiceImpl
        Self {
            config: config.clone(),
            transport: transport.clone(),
            signer: signer.clone(),
            executor: ResilientExecutor {
                transport,
                retry_executor,
                circuit_breaker,
                rate_limiter,
                logger: logger.clone(),
                tracer: tracer.clone(),
            },
            logger,
            tracer,
            endpoint_resolver: EndpointResolver::from(&config),
        }
    END FUNCTION
}
```

### 2.2 CreateBucket Implementation

```pseudocode
IMPL BucketsService FOR BucketsServiceImpl {
    ASYNC FUNCTION create(
        self,
        request: CreateBucketRequest
    ) -> Result<CreateBucketOutput, S3Error>
        span <- self.tracer.start_span("s3.CreateBucket", {
            "s3.bucket": request.bucket.clone(),
        })

        self.logger.debug("CreateBucket request", {
            bucket: &request.bucket,
            location: self.config.region.clone(),
        })

        // Validate bucket name
        validate_bucket_name(&request.bucket)?

        // Build HTTP request
        mut builder <- S3RequestBuilder::new(HttpMethod::PUT, self.endpoint_resolver.clone())
            .bucket(&request.bucket)

        // Add ACL if specified
        IF request.acl IS Some(acl) THEN
            builder <- builder.acl(acl)
        END IF

        // Add object ownership if specified
        IF request.object_ownership IS Some(ownership) THEN
            builder <- builder.header("x-amz-object-ownership", ownership.as_str())
        END IF

        // Add object lock if specified
        IF request.object_lock_enabled_for_bucket == Some(true) THEN
            builder <- builder.header("x-amz-bucket-object-lock-enabled", "true")
        END IF

        // Add location constraint for non-us-east-1 regions
        payload_hash <- IF self.config.region != "us-east-1" THEN
            location_xml <- CreateBucketConfiguration {
                location_constraint: self.config.region.clone(),
            }
            xml_body <- quick_xml::se::to_string(&location_xml)?
            builder <- builder
                .content_type("application/xml")
                .body_bytes(Bytes::from(xml_body.clone()))
            calculate_payload_hash(Some(xml_body.as_bytes()))
        ELSE
            calculate_payload_hash(None)
        END IF

        http_request <- builder.build()

        // Sign and execute
        result <- self.executor.execute("CreateBucket", || async {
            mut signed_request <- http_request.clone()
            self.signer.sign_request(&mut signed_request, &payload_hash, Utc::now())?

            response <- self.transport.send(signed_request).await?

            IF response.status.is_success() THEN
                location <- response.headers.get("location")
                    .and_then(|v| v.to_str().ok())
                    .map(String::from)

                (request_id, _) <- S3ResponseParser::extract_request_ids(&response.headers)

                self.logger.info("CreateBucket successful", {
                    bucket: &request.bucket,
                    location: location.as_deref(),
                    request_id: request_id.as_deref(),
                })

                Ok(CreateBucketOutput { location })
            ELSE
                Err(map_http_status_to_error(response.status, &response.body))
            END IF
        }, &span).await

        span.end()
        result
    END FUNCTION
}
```

### 2.3 DeleteBucket Implementation

```pseudocode
IMPL BucketsService FOR BucketsServiceImpl {
    ASYNC FUNCTION delete(self, request: DeleteBucketRequest) -> Result<(), S3Error>
        span <- self.tracer.start_span("s3.DeleteBucket", {
            "s3.bucket": request.bucket.clone(),
        })

        self.logger.debug("DeleteBucket request", {
            bucket: &request.bucket,
        })

        // Validate bucket name
        validate_bucket_name(&request.bucket)?

        // Build HTTP request
        http_request <- S3RequestBuilder::new(HttpMethod::DELETE, self.endpoint_resolver.clone())
            .bucket(&request.bucket)
            .build()

        // Sign and execute
        result <- self.executor.execute("DeleteBucket", || async {
            mut signed_request <- http_request.clone()
            self.signer.sign_request(&mut signed_request, &sha256_hex(b""), Utc::now())?

            response <- self.transport.send(signed_request).await?

            IF response.status.is_success() THEN
                (request_id, _) <- S3ResponseParser::extract_request_ids(&response.headers)

                self.logger.info("DeleteBucket successful", {
                    bucket: &request.bucket,
                    request_id: request_id.as_deref(),
                })

                Ok(())
            ELSE
                Err(map_http_status_to_error(response.status, &response.body))
            END IF
        }, &span).await

        span.end()
        result
    END FUNCTION
}
```

### 2.4 HeadBucket Implementation

```pseudocode
IMPL BucketsService FOR BucketsServiceImpl {
    ASYNC FUNCTION head(self, request: HeadBucketRequest) -> Result<HeadBucketOutput, S3Error>
        span <- self.tracer.start_span("s3.HeadBucket", {
            "s3.bucket": request.bucket.clone(),
        })

        // Validate bucket name
        validate_bucket_name(&request.bucket)?

        // Build HTTP request
        http_request <- S3RequestBuilder::new(HttpMethod::HEAD, self.endpoint_resolver.clone())
            .bucket(&request.bucket)
            .build()

        // Sign and execute
        result <- self.executor.execute("HeadBucket", || async {
            mut signed_request <- http_request.clone()
            self.signer.sign_request(&mut signed_request, &sha256_hex(b""), Utc::now())?

            response <- self.transport.send(signed_request).await?

            IF response.status.is_success() THEN
                output <- S3ResponseParser::parse_head_bucket_headers(&response.headers)

                self.logger.debug("HeadBucket successful", {
                    bucket: &request.bucket,
                    region: output.bucket_region.as_deref(),
                })

                Ok(output)
            ELSE IF response.status.as_u16() == 404 THEN
                Err(S3Error::Bucket(BucketError::BucketNotFound {
                    bucket: request.bucket.clone(),
                    request_id: None,
                }))
            ELSE IF response.status.as_u16() == 403 THEN
                Err(S3Error::Access(AccessError::AccessDenied {
                    message: "Access denied to bucket".to_string(),
                    request_id: None,
                }))
            ELSE
                Err(map_http_status_to_error(response.status, &response.body))
            END IF
        }, &span).await

        span.end()
        result
    END FUNCTION
}
```

### 2.5 ListBuckets Implementation

```pseudocode
IMPL BucketsService FOR BucketsServiceImpl {
    ASYNC FUNCTION list(self) -> Result<ListBucketsOutput, S3Error>
        span <- self.tracer.start_span("s3.ListBuckets", {})

        self.logger.debug("ListBuckets request", {})

        // Build HTTP request (no bucket - list all)
        http_request <- S3RequestBuilder::new(HttpMethod::GET, self.endpoint_resolver.clone())
            .build()

        // Sign and execute
        result <- self.executor.execute("ListBuckets", || async {
            mut signed_request <- http_request.clone()
            self.signer.sign_request(&mut signed_request, &sha256_hex(b""), Utc::now())?

            response <- self.transport.send(signed_request).await?

            IF response.status.is_success() THEN
                output <- S3ResponseParser::parse_list_buckets_response(&response.body)?
                (request_id, _) <- S3ResponseParser::extract_request_ids(&response.headers)

                span.record("s3.bucket_count", output.buckets.len())

                self.logger.info("ListBuckets successful", {
                    bucket_count: output.buckets.len(),
                    request_id: request_id.as_deref(),
                })

                Ok(output)
            ELSE
                Err(map_http_status_to_error(response.status, &response.body))
            END IF
        }, &span).await

        span.end()
        result
    END FUNCTION
}
```

### 2.6 GetBucketLocation Implementation

```pseudocode
IMPL BucketsService FOR BucketsServiceImpl {
    ASYNC FUNCTION get_location(
        self,
        request: GetBucketLocationRequest
    ) -> Result<GetBucketLocationOutput, S3Error>
        span <- self.tracer.start_span("s3.GetBucketLocation", {
            "s3.bucket": request.bucket.clone(),
        })

        // Validate bucket name
        validate_bucket_name(&request.bucket)?

        // Build HTTP request
        http_request <- S3RequestBuilder::new(HttpMethod::GET, self.endpoint_resolver.clone())
            .bucket(&request.bucket)
            .query("location", "")
            .build()

        // Sign and execute
        result <- self.executor.execute("GetBucketLocation", || async {
            mut signed_request <- http_request.clone()
            self.signer.sign_request(&mut signed_request, &sha256_hex(b""), Utc::now())?

            response <- self.transport.send(signed_request).await?

            IF response.status.is_success() THEN
                // Parse XML response
                // Note: Empty response means us-east-1
                location_constraint <- IF response.body.is_empty() THEN
                    None
                ELSE
                    location_result: LocationConstraint <- quick_xml::de::from_reader(&response.body[..])?
                    IF location_result.value.is_empty() THEN
                        None  // Empty element also means us-east-1
                    ELSE
                        Some(location_result.value)
                    END IF
                END IF

                span.record("s3.location", location_constraint.as_deref().unwrap_or("us-east-1"))

                self.logger.debug("GetBucketLocation successful", {
                    bucket: &request.bucket,
                    location: location_constraint.as_deref().unwrap_or("us-east-1"),
                })

                Ok(GetBucketLocationOutput { location_constraint })
            ELSE
                Err(map_http_status_to_error(response.status, &response.body))
            END IF
        }, &span).await

        span.end()
        result
    END FUNCTION
}
```

---

## 3. Streaming Operations

### 3.1 Streaming Download Helper

```pseudocode
STRUCT StreamingDownloader {
    objects_service: Arc<ObjectsServiceImpl>,
    logger: Arc<dyn Logger>,
}

IMPL StreamingDownloader {
    /// Download object to a file using streaming
    ASYNC FUNCTION download_to_file(
        self,
        bucket: &str,
        key: &str,
        file_path: &Path
    ) -> Result<u64, S3Error>
        // Open file for writing
        file <- tokio::fs::File::create(file_path).await
            .map_err(|e| S3Error::Transfer(TransferError::FileError {
                path: file_path.to_path_buf(),
                source: e.to_string(),
            }))?

        mut writer <- tokio::io::BufWriter::new(file)

        // Get object as stream
        request <- GetObjectRequest {
            bucket: bucket.to_string(),
            key: key.to_string(),
            ..Default::default()
        }

        response <- self.objects_service.get_stream(request).await?

        // Stream body to file
        mut total_bytes: u64 <- 0
        mut body <- response.body

        WHILE let Some(chunk_result) = body.next().await DO
            chunk <- chunk_result.map_err(|e| S3Error::Transfer(TransferError::StreamInterrupted {
                bytes_transferred: total_bytes,
                source: e.to_string(),
            }))?

            writer.write_all(&chunk).await
                .map_err(|e| S3Error::Transfer(TransferError::FileError {
                    path: file_path.to_path_buf(),
                    source: e.to_string(),
                }))?

            total_bytes += chunk.len() as u64
        END WHILE

        writer.flush().await?

        self.logger.info("Download complete", {
            bucket: bucket,
            key: key,
            file: file_path.display(),
            bytes: total_bytes,
        })

        Ok(total_bytes)
    END FUNCTION

    /// Download with progress callback
    ASYNC FUNCTION download_with_progress<F>(
        self,
        bucket: &str,
        key: &str,
        mut writer: impl AsyncWrite + Unpin,
        progress_callback: F
    ) -> Result<u64, S3Error>
    WHERE
        F: Fn(u64, u64) + Send
        // progress_callback(bytes_transferred, content_length)

        // First, get content length with HEAD
        head_request <- HeadObjectRequest {
            bucket: bucket.to_string(),
            key: key.to_string(),
            ..Default::default()
        }

        head_response <- self.objects_service.head(head_request).await?
        content_length <- head_response.content_length

        // Get object as stream
        request <- GetObjectRequest {
            bucket: bucket.to_string(),
            key: key.to_string(),
            ..Default::default()
        }

        response <- self.objects_service.get_stream(request).await?

        // Stream body with progress
        mut total_bytes: u64 <- 0
        mut body <- response.body

        WHILE let Some(chunk_result) = body.next().await DO
            chunk <- chunk_result?
            writer.write_all(&chunk).await?

            total_bytes += chunk.len() as u64
            progress_callback(total_bytes, content_length as u64)
        END WHILE

        writer.flush().await?
        Ok(total_bytes)
    END FUNCTION

    /// Download byte range
    ASYNC FUNCTION download_range(
        self,
        bucket: &str,
        key: &str,
        start: u64,
        end: u64
    ) -> Result<Vec<u8>, S3Error>
        request <- GetObjectRequest {
            bucket: bucket.to_string(),
            key: key.to_string(),
            range: Some(format!("bytes={}-{}", start, end)),
            ..Default::default()
        }

        response <- self.objects_service.get(request).await?

        Ok(response.body)
    END FUNCTION
}
```

### 3.2 Streaming Upload Helper

```pseudocode
STRUCT StreamingUploader {
    objects_service: Arc<ObjectsServiceImpl>,
    multipart_service: Arc<MultipartServiceImpl>,
    config: S3Config,
    logger: Arc<dyn Logger>,
}

IMPL StreamingUploader {
    /// Upload file using streaming (auto-selects single/multipart)
    ASYNC FUNCTION upload_file(
        self,
        bucket: &str,
        key: &str,
        file_path: &Path,
        options: UploadOptions
    ) -> Result<UploadOutput, S3Error>
        // Get file metadata
        metadata <- tokio::fs::metadata(file_path).await
            .map_err(|e| S3Error::Transfer(TransferError::FileError {
                path: file_path.to_path_buf(),
                source: e.to_string(),
            }))?

        file_size <- metadata.len()

        // Open file
        file <- tokio::fs::File::open(file_path).await?
        reader <- tokio::io::BufReader::new(file)

        // Determine content type
        content_type <- options.content_type
            .or_else(|| mime_guess::from_path(file_path).first().map(|m| m.to_string()))

        IF file_size > self.config.multipart_threshold THEN
            // Use multipart upload
            self.multipart_upload_from_reader(
                bucket,
                key,
                reader,
                file_size,
                content_type,
                options
            ).await
        ELSE
            // Use single PUT
            self.single_upload_from_reader(
                bucket,
                key,
                reader,
                file_size,
                content_type,
                options
            ).await
        END IF
    END FUNCTION

    ASYNC FUNCTION single_upload_from_reader(
        self,
        bucket: &str,
        key: &str,
        mut reader: impl AsyncRead + Unpin,
        content_length: u64,
        content_type: Option<String>,
        options: UploadOptions
    ) -> Result<UploadOutput, S3Error>
        // Read entire content into memory for single upload
        mut body <- Vec::with_capacity(content_length as usize)
        reader.read_to_end(&mut body).await?

        request <- PutObjectRequest {
            bucket: bucket.to_string(),
            key: key.to_string(),
            body,
            content_type,
            storage_class: options.storage_class,
            server_side_encryption: options.server_side_encryption,
            sse_kms_key_id: options.sse_kms_key_id,
            metadata: options.metadata,
            acl: options.acl,
            tagging: options.tagging,
            ..Default::default()
        }

        output <- self.objects_service.put(request).await?

        Ok(UploadOutput {
            e_tag: output.e_tag,
            version_id: output.version_id,
            location: format!("s3://{}/{}", bucket, key),
        })
    END FUNCTION

    /// Upload from async reader with progress
    ASYNC FUNCTION upload_from_reader_with_progress<F>(
        self,
        bucket: &str,
        key: &str,
        reader: impl AsyncRead + Unpin + Send + 'static,
        content_length: u64,
        content_type: Option<String>,
        options: UploadOptions,
        progress_callback: F
    ) -> Result<UploadOutput, S3Error>
    WHERE
        F: Fn(u64, u64) + Send + Sync + 'static
        // progress_callback(bytes_uploaded, total_bytes)

        IF content_length > self.config.multipart_threshold THEN
            self.multipart_upload_with_progress(
                bucket,
                key,
                reader,
                content_length,
                content_type,
                options,
                progress_callback
            ).await
        ELSE
            // Wrap reader with progress tracking
            tracked_reader <- ProgressReader::new(reader, content_length, progress_callback)

            self.single_upload_from_reader(
                bucket,
                key,
                tracked_reader,
                content_length,
                content_type,
                options
            ).await
        END IF
    END FUNCTION
}

STRUCT ProgressReader<R, F> {
    inner: R,
    total_size: u64,
    bytes_read: u64,
    callback: F,
}

IMPL<R: AsyncRead + Unpin, F: Fn(u64, u64)> AsyncRead FOR ProgressReader<R, F> {
    FUNCTION poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>
    ) -> Poll<io::Result<()>>
        this <- self.get_mut()
        filled_before <- buf.filled().len()

        result <- Pin::new(&mut this.inner).poll_read(cx, buf)

        IF let Poll::Ready(Ok(())) = result THEN
            bytes_read <- buf.filled().len() - filled_before
            this.bytes_read += bytes_read as u64
            (this.callback)(this.bytes_read, this.total_size)
        END IF

        result
    END FUNCTION
}
```

### 3.3 Chunked Stream Creation

```pseudocode
/// Create a byte stream from an async reader
FUNCTION create_stream_from_reader<R>(
    reader: R,
    chunk_size: usize
) -> impl Stream<Item = Result<Bytes, S3Error>>
WHERE
    R: AsyncRead + Unpin + Send + 'static

    stream::unfold((reader, vec![0u8; chunk_size]), |(mut reader, mut buffer)| async move {
        MATCH reader.read(&mut buffer).await {
            Ok(0) => None,  // EOF
            Ok(n) => {
                bytes <- Bytes::copy_from_slice(&buffer[..n])
                Some((Ok(bytes), (reader, buffer)))
            },
            Err(e) => {
                Some((Err(S3Error::Transfer(TransferError::ReadError {
                    source: e.to_string()
                })), (reader, buffer)))
            }
        }
    })
END FUNCTION

/// Create a byte stream from a file with chunking
ASYNC FUNCTION create_file_stream(
    path: &Path,
    chunk_size: usize
) -> Result<impl Stream<Item = Result<Bytes, S3Error>>, S3Error>
    file <- tokio::fs::File::open(path).await
        .map_err(|e| S3Error::Transfer(TransferError::FileError {
            path: path.to_path_buf(),
            source: e.to_string(),
        }))?

    reader <- tokio::io::BufReader::new(file)
    Ok(create_stream_from_reader(reader, chunk_size))
END FUNCTION

/// Collect a stream into bytes with size limit
ASYNC FUNCTION collect_stream_with_limit(
    mut stream: impl Stream<Item = Result<Bytes, S3Error>> + Unpin,
    max_size: usize
) -> Result<Vec<u8>, S3Error>
    mut buffer <- Vec::new()

    WHILE let Some(chunk_result) = stream.next().await DO
        chunk <- chunk_result?

        IF buffer.len() + chunk.len() > max_size THEN
            RETURN Err(S3Error::Transfer(TransferError::ContentTooLarge {
                size: buffer.len() + chunk.len(),
                max_size,
            }))
        END IF

        buffer.extend_from_slice(&chunk)
    END WHILE

    Ok(buffer)
END FUNCTION
```

---

## 4. Pagination Helpers

### 4.1 ListObjectsV2 Paginator

```pseudocode
STRUCT ListObjectsV2Paginator {
    service: Arc<ObjectsServiceImpl>,
    initial_request: ListObjectsV2Request,
    current_token: Option<String>,
    finished: bool,
}

IMPL ListObjectsV2Paginator {
    FUNCTION new(service: Arc<ObjectsServiceImpl>, request: ListObjectsV2Request) -> Self
        Self {
            service,
            initial_request: request,
            current_token: None,
            finished: false,
        }
    END FUNCTION

    ASYNC FUNCTION next_page(mut self) -> Option<Result<ListObjectsV2Output, S3Error>>
        IF self.finished THEN
            RETURN None
        END IF

        // Build request with continuation token
        mut request <- self.initial_request.clone()
        request.continuation_token = self.current_token.take()

        MATCH self.service.list(request).await {
            Ok(output) => {
                IF output.is_truncated {
                    self.current_token = output.next_continuation_token.clone()
                } ELSE {
                    self.finished = true
                }
                Some(Ok(output))
            },
            Err(e) => {
                self.finished = true
                Some(Err(e))
            }
        }
    END FUNCTION
}

IMPL Stream FOR ListObjectsV2Paginator {
    type Item = Result<S3Object, S3Error>;

    FUNCTION poll_next(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>
    ) -> Poll<Option<Self::Item>>
        // Implementation uses internal buffering of page results
        // and yields individual objects
        this <- self.get_mut()

        // If we have buffered objects, yield them
        IF this.buffer.len() > 0 THEN
            RETURN Poll::Ready(Some(Ok(this.buffer.remove(0))))
        END IF

        // If finished and no buffer, done
        IF this.finished AND this.buffer.is_empty() THEN
            RETURN Poll::Ready(None)
        END IF

        // Fetch next page
        MATCH ready!(Pin::new(&mut this.next_page()).poll(cx)) {
            Some(Ok(output)) => {
                this.buffer = output.contents
                IF this.buffer.is_empty() THEN
                    Poll::Ready(None)
                ELSE
                    Poll::Ready(Some(Ok(this.buffer.remove(0))))
                END IF
            },
            Some(Err(e)) => Poll::Ready(Some(Err(e))),
            None => Poll::Ready(None),
        }
    END FUNCTION
}

/// Async iterator version (more ergonomic)
IMPL ListObjectsV2Paginator {
    ASYNC FUNCTION for_each<F, Fut>(self, mut f: F) -> Result<(), S3Error>
    WHERE
        F: FnMut(S3Object) -> Fut,
        Fut: Future<Output = Result<(), S3Error>>

        pin_mut!(self)
        WHILE let Some(result) = self.next().await DO
            object <- result?
            f(object).await?
        END WHILE
        Ok(())
    END FUNCTION

    ASYNC FUNCTION collect(self) -> Result<Vec<S3Object>, S3Error>
        mut objects <- Vec::new()
        pin_mut!(self)
        WHILE let Some(result) = self.next().await DO
            objects.push(result?)
        END WHILE
        Ok(objects)
    END FUNCTION

    ASYNC FUNCTION try_collect_with_limit(
        self,
        limit: usize
    ) -> Result<Vec<S3Object>, S3Error>
        mut objects <- Vec::with_capacity(limit.min(1000))
        pin_mut!(self)
        WHILE let Some(result) = self.next().await DO
            objects.push(result?)
            IF objects.len() >= limit THEN
                BREAK
            END IF
        END WHILE
        Ok(objects)
    END FUNCTION
}
```

### 4.2 ListParts Paginator

```pseudocode
STRUCT ListPartsPaginator {
    service: Arc<MultipartServiceImpl>,
    bucket: String,
    key: String,
    upload_id: String,
    current_marker: Option<u32>,
    finished: bool,
}

IMPL ListPartsPaginator {
    FUNCTION new(
        service: Arc<MultipartServiceImpl>,
        bucket: String,
        key: String,
        upload_id: String
    ) -> Self
        Self {
            service,
            bucket,
            key,
            upload_id,
            current_marker: None,
            finished: false,
        }
    END FUNCTION
}

IMPL Stream FOR ListPartsPaginator {
    type Item = Result<Part, S3Error>;

    FUNCTION poll_next(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>
    ) -> Poll<Option<Self::Item>>
        // Similar pattern to ListObjectsV2Paginator
        // ... implementation
    END FUNCTION
}
```

### 4.3 Generic Paginator Helper

```pseudocode
/// Generic pagination helper
STRUCT Paginator<T, E, F, Fut>
WHERE
    F: FnMut(Option<String>) -> Fut,
    Fut: Future<Output = Result<PaginatedResponse<T>, E>>
{
    fetch_fn: F,
    current_token: Option<String>,
    buffer: VecDeque<T>,
    finished: bool,
}

STRUCT PaginatedResponse<T> {
    items: Vec<T>,
    next_token: Option<String>,
}

IMPL<T, E, F, Fut> Paginator<T, E, F, Fut> {
    FUNCTION new(fetch_fn: F) -> Self
        Self {
            fetch_fn,
            current_token: None,
            buffer: VecDeque::new(),
            finished: false,
        }
    END FUNCTION

    ASYNC FUNCTION next(mut self) -> Option<Result<T, E>>
        // Return from buffer if available
        IF let Some(item) = self.buffer.pop_front() THEN
            RETURN Some(Ok(item))
        END IF

        // If finished, done
        IF self.finished THEN
            RETURN None
        END IF

        // Fetch next page
        MATCH (self.fetch_fn)(self.current_token.take()).await {
            Ok(response) => {
                self.current_token = response.next_token
                IF self.current_token.is_none() THEN
                    self.finished = true
                END IF

                self.buffer = response.items.into()
                self.buffer.pop_front().map(Ok)
            },
            Err(e) => {
                self.finished = true
                Some(Err(e))
            }
        }
    END FUNCTION
}
```

### 4.4 Batch Operations Helper

```pseudocode
/// Helper for batch deletion across pages
ASYNC FUNCTION delete_all_objects(
    objects_service: &dyn ObjectsService,
    bucket: &str,
    prefix: Option<&str>,
    logger: &dyn Logger
) -> Result<DeleteAllResult, S3Error>
    mut deleted_count: usize <- 0
    mut error_count: usize <- 0
    mut errors: Vec<DeleteError> <- Vec::new()

    // List all objects with prefix
    request <- ListObjectsV2Request {
        bucket: bucket.to_string(),
        prefix: prefix.map(String::from),
        ..Default::default()
    }

    paginator <- objects_service.list_all(request)
    pin_mut!(paginator)

    // Collect into batches of 1000
    mut batch: Vec<ObjectIdentifier> <- Vec::with_capacity(1000)

    WHILE let Some(result) = paginator.next().await DO
        object <- result?

        batch.push(ObjectIdentifier {
            key: object.key,
            version_id: None,
        })

        IF batch.len() >= 1000 THEN
            // Delete batch
            delete_result <- delete_batch(objects_service, bucket, &batch, logger).await?
            deleted_count += delete_result.deleted.len()
            error_count += delete_result.errors.len()
            errors.extend(delete_result.errors)

            batch.clear()
        END IF
    END WHILE

    // Delete remaining objects
    IF NOT batch.is_empty() THEN
        delete_result <- delete_batch(objects_service, bucket, &batch, logger).await?
        deleted_count += delete_result.deleted.len()
        error_count += delete_result.errors.len()
        errors.extend(delete_result.errors)
    END IF

    logger.info("Delete all objects complete", {
        bucket: bucket,
        prefix: prefix,
        deleted_count: deleted_count,
        error_count: error_count,
    })

    Ok(DeleteAllResult {
        deleted_count,
        error_count,
        errors,
    })
END FUNCTION

ASYNC FUNCTION delete_batch(
    objects_service: &dyn ObjectsService,
    bucket: &str,
    objects: &[ObjectIdentifier],
    logger: &dyn Logger
) -> Result<DeleteObjectsOutput, S3Error>
    request <- DeleteObjectsRequest {
        bucket: bucket.to_string(),
        objects: objects.to_vec(),
        quiet: Some(false),
        ..Default::default()
    }

    logger.debug("Deleting batch", {
        bucket: bucket,
        count: objects.len(),
    })

    objects_service.delete_objects(request).await
END FUNCTION

STRUCT DeleteAllResult {
    deleted_count: usize,
    error_count: usize,
    errors: Vec<DeleteError>,
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode - Part 2 |

---

**End of Pseudocode Part 2**

*Part 3 will cover Multipart Uploads, Presigned URLs, Tagging, and High-Level Operations.*
