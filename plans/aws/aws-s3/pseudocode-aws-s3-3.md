# AWS S3 Integration Module - Pseudocode (Part 3)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/aws-s3`
**Part:** 3 of 3 - Multipart Uploads, Presigned URLs, Tagging & High-Level Operations

---

## Table of Contents

1. [Multipart Service Implementation](#1-multipart-service-implementation)
2. [Presign Service Implementation](#2-presign-service-implementation)
3. [Tagging Service Implementation](#3-tagging-service-implementation)
4. [High-Level Transfer Operations](#4-high-level-transfer-operations)
5. [Testing Mocks](#5-testing-mocks)

---

## 1. Multipart Service Implementation

### 1.1 Multipart Service Structure

```pseudocode
STRUCT MultipartServiceImpl {
    config: S3Config,
    transport: Arc<dyn HttpTransport>,
    signer: Arc<dyn AwsSigner>,
    executor: ResilientExecutor,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
    endpoint_resolver: EndpointResolver,
}

IMPL MultipartServiceImpl {
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

### 1.2 CreateMultipartUpload Implementation

```pseudocode
IMPL MultipartService FOR MultipartServiceImpl {
    ASYNC FUNCTION create(
        self,
        request: CreateMultipartUploadRequest
    ) -> Result<CreateMultipartUploadOutput, S3Error>
        span <- self.tracer.start_span("s3.CreateMultipartUpload", {
            "s3.bucket": request.bucket.clone(),
            "s3.key": request.key.clone(),
        })

        self.logger.debug("CreateMultipartUpload request", {
            bucket: &request.bucket,
            key: &request.key,
            storage_class: request.storage_class.as_ref().map(|s| s.as_str()),
        })

        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        // Build HTTP request
        mut builder <- S3RequestBuilder::new(HttpMethod::POST, self.endpoint_resolver.clone())
            .bucket(&request.bucket)
            .key(&request.key)
            .query("uploads", "")

        // Add optional headers
        builder <- builder
            .header_opt("content-type", request.content_type.as_ref())
            .header_opt("content-encoding", request.content_encoding.as_ref())
            .header_opt("content-disposition", request.content_disposition.as_ref())
            .header_opt("content-language", request.content_language.as_ref())
            .header_opt("cache-control", request.cache_control.as_ref())

        IF request.storage_class IS Some(sc) THEN
            builder <- builder.storage_class(sc)
        END IF

        IF request.server_side_encryption IS Some(sse) THEN
            builder <- builder.server_side_encryption(sse)
        END IF

        IF request.sse_kms_key_id IS Some(key_id) THEN
            builder <- builder.sse_kms_key_id(key_id)
        END IF

        IF request.metadata IS Some(meta) THEN
            builder <- builder.metadata(&meta)
        END IF

        IF request.acl IS Some(acl) THEN
            builder <- builder.acl(acl)
        END IF

        IF request.tagging IS Some(tags) THEN
            builder <- builder.tagging(tags)
        END IF

        http_request <- builder.build()

        // Sign and execute
        result <- self.executor.execute("CreateMultipartUpload", || async {
            mut signed_request <- http_request.clone()
            self.signer.sign_request(&mut signed_request, &sha256_hex(b""), Utc::now())?

            response <- self.transport.send(signed_request).await?

            IF response.status.is_success() THEN
                output <- S3ResponseParser::parse_create_multipart_upload_response(&response.body)?
                (request_id, _) <- S3ResponseParser::extract_request_ids(&response.headers)

                span.record("s3.upload_id", &output.upload_id)

                self.logger.info("CreateMultipartUpload successful", {
                    bucket: &request.bucket,
                    key: &request.key,
                    upload_id: &output.upload_id,
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

### 1.3 UploadPart Implementation

```pseudocode
IMPL MultipartService FOR MultipartServiceImpl {
    ASYNC FUNCTION upload_part(
        self,
        request: UploadPartRequest
    ) -> Result<UploadPartOutput, S3Error>
        span <- self.tracer.start_span("s3.UploadPart", {
            "s3.bucket": request.bucket.clone(),
            "s3.key": request.key.clone(),
            "s3.upload_id": request.upload_id.clone(),
            "s3.part_number": request.part_number,
            "s3.content_length": request.body.len(),
        })

        self.logger.debug("UploadPart request", {
            bucket: &request.bucket,
            key: &request.key,
            upload_id: &request.upload_id,
            part_number: request.part_number,
            content_length: request.body.len(),
        })

        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?
        validate_part_number(request.part_number)?

        // Calculate payload hash
        payload_hash <- calculate_payload_hash(Some(&request.body))

        // Build HTTP request
        mut builder <- S3RequestBuilder::new(HttpMethod::PUT, self.endpoint_resolver.clone())
            .bucket(&request.bucket)
            .key(&request.key)
            .query("partNumber", request.part_number.to_string())
            .query("uploadId", &request.upload_id)
            .content_length(request.body.len() as u64)
            .body_bytes(Bytes::from(request.body.clone()))

        IF request.content_md5 IS Some(md5) THEN
            builder <- builder.header("content-md5", md5)
        END IF

        IF request.checksum_algorithm IS Some(algo) THEN
            builder <- builder.header("x-amz-sdk-checksum-algorithm", algo.as_str())
            IF request.checksum_value IS Some(value) THEN
                header_name <- format!("x-amz-checksum-{}", algo.as_str().to_lowercase())
                builder <- builder.header(header_name, value)
            END IF
        END IF

        http_request <- builder.build()

        // Sign and execute
        result <- self.executor.execute("UploadPart", || async {
            mut signed_request <- http_request.clone()
            self.signer.sign_request(&mut signed_request, &payload_hash, Utc::now())?

            response <- self.transport.send(signed_request).await?

            IF response.status.is_success() THEN
                e_tag <- response.headers.get("etag")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.trim_matches('"').to_string())
                    .ok_or_else(|| S3Error::Response(ResponseError::MissingHeader {
                        header: "etag".to_string()
                    }))?

                (request_id, _) <- S3ResponseParser::extract_request_ids(&response.headers)

                span.record("s3.e_tag", &e_tag)

                self.logger.info("UploadPart successful", {
                    bucket: &request.bucket,
                    key: &request.key,
                    upload_id: &request.upload_id,
                    part_number: request.part_number,
                    e_tag: &e_tag,
                    request_id: request_id.as_deref(),
                })

                Ok(UploadPartOutput {
                    e_tag,
                    checksum_crc32: response.headers.get("x-amz-checksum-crc32")
                        .and_then(|v| v.to_str().ok()).map(String::from),
                    checksum_crc32c: response.headers.get("x-amz-checksum-crc32c")
                        .and_then(|v| v.to_str().ok()).map(String::from),
                    checksum_sha1: response.headers.get("x-amz-checksum-sha1")
                        .and_then(|v| v.to_str().ok()).map(String::from),
                    checksum_sha256: response.headers.get("x-amz-checksum-sha256")
                        .and_then(|v| v.to_str().ok()).map(String::from),
                })
            ELSE
                Err(map_http_status_to_error(response.status, &response.body))
            END IF
        }, &span).await

        span.end()
        result
    END FUNCTION

    ASYNC FUNCTION upload_part_stream(
        self,
        request: UploadPartStreamRequest,
        body: impl Stream<Item = Result<Bytes, S3Error>> + Send + 'static
    ) -> Result<UploadPartOutput, S3Error>
        span <- self.tracer.start_span("s3.UploadPartStream", {
            "s3.bucket": request.bucket.clone(),
            "s3.key": request.key.clone(),
            "s3.upload_id": request.upload_id.clone(),
            "s3.part_number": request.part_number,
            "s3.content_length": request.content_length,
        })

        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?
        validate_part_number(request.part_number)?

        // Build HTTP request with streaming body
        mut builder <- S3RequestBuilder::new(HttpMethod::PUT, self.endpoint_resolver.clone())
            .bucket(&request.bucket)
            .key(&request.key)
            .query("partNumber", request.part_number.to_string())
            .query("uploadId", &request.upload_id)
            .content_length(request.content_length)
            .header("x-amz-content-sha256", "UNSIGNED-PAYLOAD")
            .body_stream(body)

        http_request <- builder.build()

        // Sign with unsigned payload
        mut signed_request <- http_request
        self.signer.sign_request(&mut signed_request, "UNSIGNED-PAYLOAD", Utc::now())?

        // Execute (limited retry for streaming)
        response <- self.transport.send(signed_request).await?

        IF response.status.is_success() THEN
            e_tag <- response.headers.get("etag")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.trim_matches('"').to_string())
                .ok_or_else(|| S3Error::Response(ResponseError::MissingHeader {
                    header: "etag".to_string()
                }))?

            span.record("s3.e_tag", &e_tag)
            span.end()

            Ok(UploadPartOutput {
                e_tag,
                checksum_crc32: None,
                checksum_crc32c: None,
                checksum_sha1: None,
                checksum_sha256: None,
            })
        ELSE
            span.end()
            Err(map_http_status_to_error(response.status, &response.body))
        END IF
    END FUNCTION
}
```

### 1.4 CompleteMultipartUpload Implementation

```pseudocode
IMPL MultipartService FOR MultipartServiceImpl {
    ASYNC FUNCTION complete(
        self,
        request: CompleteMultipartUploadRequest
    ) -> Result<CompleteMultipartUploadOutput, S3Error>
        span <- self.tracer.start_span("s3.CompleteMultipartUpload", {
            "s3.bucket": request.bucket.clone(),
            "s3.key": request.key.clone(),
            "s3.upload_id": request.upload_id.clone(),
            "s3.part_count": request.parts.len(),
        })

        self.logger.debug("CompleteMultipartUpload request", {
            bucket: &request.bucket,
            key: &request.key,
            upload_id: &request.upload_id,
            part_count: request.parts.len(),
        })

        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        IF request.parts.is_empty() THEN
            RETURN Err(S3Error::Multipart(MultipartError::NoParts))
        END IF

        // Validate part numbers are sequential starting from 1
        mut sorted_parts <- request.parts.clone()
        sorted_parts.sort_by_key(|p| p.part_number)

        FOR (i, part) IN sorted_parts.iter().enumerate() DO
            expected <- (i + 1) as u32
            IF part.part_number != expected THEN
                RETURN Err(S3Error::Multipart(MultipartError::InvalidPartOrder {
                    expected,
                    actual: part.part_number,
                }))
            END IF
        END FOR

        // Build XML body
        complete_xml <- CompleteMultipartUpload {
            parts: sorted_parts.iter().map(|p| CompletedPart {
                part_number: p.part_number,
                e_tag: p.e_tag.clone(),
                checksum_crc32: p.checksum_crc32.clone(),
                checksum_crc32c: p.checksum_crc32c.clone(),
                checksum_sha1: p.checksum_sha1.clone(),
                checksum_sha256: p.checksum_sha256.clone(),
            }).collect(),
        }

        xml_body <- quick_xml::se::to_string(&complete_xml)?
        payload_hash <- calculate_payload_hash(Some(xml_body.as_bytes()))

        // Build HTTP request
        http_request <- S3RequestBuilder::new(HttpMethod::POST, self.endpoint_resolver.clone())
            .bucket(&request.bucket)
            .key(&request.key)
            .query("uploadId", &request.upload_id)
            .content_type("application/xml")
            .body_bytes(Bytes::from(xml_body))
            .build()

        // Sign and execute
        result <- self.executor.execute("CompleteMultipartUpload", || async {
            mut signed_request <- http_request.clone()
            self.signer.sign_request(&mut signed_request, &payload_hash, Utc::now())?

            response <- self.transport.send(signed_request).await?

            IF response.status.is_success() THEN
                // Parse XML response - may contain error even with 200 status
                body_str <- String::from_utf8_lossy(&response.body)

                IF body_str.contains("<Error>") THEN
                    RETURN Err(S3ResponseParser::parse_error_response(&response.body))
                END IF

                output <- S3ResponseParser::parse_complete_multipart_upload_response(&response.body)?

                // Get additional headers
                version_id <- response.headers.get("x-amz-version-id")
                    .and_then(|v| v.to_str().ok())
                    .map(String::from)

                expiration <- response.headers.get("x-amz-expiration")
                    .and_then(|v| v.to_str().ok())
                    .map(String::from)

                (request_id, _) <- S3ResponseParser::extract_request_ids(&response.headers)

                span.record("s3.e_tag", &output.e_tag)

                self.logger.info("CompleteMultipartUpload successful", {
                    bucket: &request.bucket,
                    key: &request.key,
                    upload_id: &request.upload_id,
                    e_tag: &output.e_tag,
                    request_id: request_id.as_deref(),
                })

                Ok(CompleteMultipartUploadOutput {
                    location: output.location,
                    bucket: output.bucket,
                    key: output.key,
                    e_tag: output.e_tag,
                    version_id,
                    expiration,
                    checksum_crc32: None,
                    checksum_crc32c: None,
                    checksum_sha1: None,
                    checksum_sha256: None,
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

### 1.5 AbortMultipartUpload Implementation

```pseudocode
IMPL MultipartService FOR MultipartServiceImpl {
    ASYNC FUNCTION abort(
        self,
        request: AbortMultipartUploadRequest
    ) -> Result<(), S3Error>
        span <- self.tracer.start_span("s3.AbortMultipartUpload", {
            "s3.bucket": request.bucket.clone(),
            "s3.key": request.key.clone(),
            "s3.upload_id": request.upload_id.clone(),
        })

        self.logger.debug("AbortMultipartUpload request", {
            bucket: &request.bucket,
            key: &request.key,
            upload_id: &request.upload_id,
        })

        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        // Build HTTP request
        http_request <- S3RequestBuilder::new(HttpMethod::DELETE, self.endpoint_resolver.clone())
            .bucket(&request.bucket)
            .key(&request.key)
            .query("uploadId", &request.upload_id)
            .build()

        // Sign and execute
        result <- self.executor.execute("AbortMultipartUpload", || async {
            mut signed_request <- http_request.clone()
            self.signer.sign_request(&mut signed_request, &sha256_hex(b""), Utc::now())?

            response <- self.transport.send(signed_request).await?

            IF response.status.is_success() THEN
                (request_id, _) <- S3ResponseParser::extract_request_ids(&response.headers)

                self.logger.info("AbortMultipartUpload successful", {
                    bucket: &request.bucket,
                    key: &request.key,
                    upload_id: &request.upload_id,
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

### 1.6 ListParts Implementation

```pseudocode
IMPL MultipartService FOR MultipartServiceImpl {
    ASYNC FUNCTION list_parts(
        self,
        request: ListPartsRequest
    ) -> Result<ListPartsOutput, S3Error>
        span <- self.tracer.start_span("s3.ListParts", {
            "s3.bucket": request.bucket.clone(),
            "s3.key": request.key.clone(),
            "s3.upload_id": request.upload_id.clone(),
        })

        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        // Build HTTP request
        mut builder <- S3RequestBuilder::new(HttpMethod::GET, self.endpoint_resolver.clone())
            .bucket(&request.bucket)
            .key(&request.key)
            .query("uploadId", &request.upload_id)

        IF request.max_parts IS Some(max) THEN
            builder <- builder.query("max-parts", max.to_string())
        END IF

        IF request.part_number_marker IS Some(marker) THEN
            builder <- builder.query("part-number-marker", marker.to_string())
        END IF

        http_request <- builder.build()

        // Sign and execute
        result <- self.executor.execute("ListParts", || async {
            mut signed_request <- http_request.clone()
            self.signer.sign_request(&mut signed_request, &sha256_hex(b""), Utc::now())?

            response <- self.transport.send(signed_request).await?

            IF response.status.is_success() THEN
                output <- S3ResponseParser::parse_list_parts_response(&response.body)?

                span.record("s3.part_count", output.parts.len())
                span.record("s3.is_truncated", output.is_truncated)

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

### 1.7 High-Level Upload with Auto Multipart

```pseudocode
IMPL MultipartService FOR MultipartServiceImpl {
    /// High-level upload that automatically uses multipart for large files
    ASYNC FUNCTION upload(
        self,
        request: UploadRequest,
        body: impl Stream<Item = Result<Bytes, S3Error>> + Send + 'static
    ) -> Result<UploadOutput, S3Error>
        span <- self.tracer.start_span("s3.Upload", {
            "s3.bucket": request.bucket.clone(),
            "s3.key": request.key.clone(),
            "s3.content_length": request.content_length,
        })

        self.logger.info("Starting upload", {
            bucket: &request.bucket,
            key: &request.key,
            content_length: request.content_length,
            part_size: self.config.multipart_part_size,
        })

        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        // Calculate number of parts
        num_parts <- ((request.content_length + self.config.multipart_part_size - 1)
            / self.config.multipart_part_size) as u32

        IF num_parts > MAX_PARTS THEN
            // Adjust part size to fit within MAX_PARTS
            adjusted_part_size <- (request.content_length + MAX_PARTS as u64 - 1) / MAX_PARTS as u64
            self.logger.warn("Adjusting part size to fit within max parts", {
                original_part_size: self.config.multipart_part_size,
                adjusted_part_size: adjusted_part_size,
            })
        END IF

        // Step 1: Create multipart upload
        create_request <- CreateMultipartUploadRequest {
            bucket: request.bucket.clone(),
            key: request.key.clone(),
            content_type: request.content_type.clone(),
            storage_class: request.storage_class.clone(),
            server_side_encryption: request.server_side_encryption.clone(),
            sse_kms_key_id: request.sse_kms_key_id.clone(),
            metadata: request.metadata.clone(),
            acl: request.acl.clone(),
            tagging: request.tagging.clone(),
            ..Default::default()
        }

        create_output <- self.create(create_request).await?
        upload_id <- create_output.upload_id.clone()

        span.record("s3.upload_id", &upload_id)

        // Step 2: Upload parts concurrently
        upload_result <- self.upload_parts_concurrent(
            &request.bucket,
            &request.key,
            &upload_id,
            body,
            request.content_length,
            self.config.multipart_part_size,
            self.config.multipart_concurrency,
            &span
        ).await

        // Step 3: Handle result - complete or abort
        MATCH upload_result {
            Ok(completed_parts) => {
                // Complete the upload
                complete_request <- CompleteMultipartUploadRequest {
                    bucket: request.bucket.clone(),
                    key: request.key.clone(),
                    upload_id: upload_id.clone(),
                    parts: completed_parts,
                    ..Default::default()
                }

                MATCH self.complete(complete_request).await {
                    Ok(complete_output) => {
                        span.record("s3.e_tag", &complete_output.e_tag)
                        span.end()

                        self.logger.info("Upload complete", {
                            bucket: &request.bucket,
                            key: &request.key,
                            e_tag: &complete_output.e_tag,
                        })

                        Ok(UploadOutput {
                            e_tag: complete_output.e_tag,
                            version_id: complete_output.version_id,
                            location: complete_output.location,
                        })
                    },
                    Err(e) => {
                        // Try to abort on complete failure
                        self.abort_upload_best_effort(&request.bucket, &request.key, &upload_id).await
                        span.end()
                        Err(e)
                    }
                }
            },
            Err(e) => {
                // Abort the upload
                self.abort_upload_best_effort(&request.bucket, &request.key, &upload_id).await
                span.end()
                Err(e)
            }
        }
    END FUNCTION

    ASYNC FUNCTION upload_parts_concurrent(
        self,
        bucket: &str,
        key: &str,
        upload_id: &str,
        body: impl Stream<Item = Result<Bytes, S3Error>> + Send + 'static,
        content_length: u64,
        part_size: u64,
        concurrency: usize,
        span: &Span
    ) -> Result<Vec<CompletedPart>, S3Error>
        mut completed_parts: Vec<CompletedPart> <- Vec::new()
        mut part_number: u32 <- 1
        mut bytes_uploaded: u64 <- 0

        // Create a buffered stream that collects bytes into part-sized chunks
        part_stream <- ChunkedPartStream::new(body, part_size)

        // Use a semaphore to limit concurrency
        semaphore <- Arc::new(Semaphore::new(concurrency))

        // Channel to collect results
        (tx, mut rx) <- mpsc::channel(concurrency * 2)

        // Spawn upload tasks
        pin_mut!(part_stream)

        WHILE let Some(part_result) = part_stream.next().await DO
            part_data <- part_result?
            current_part_number <- part_number
            part_number += 1

            // Acquire semaphore permit
            permit <- semaphore.clone().acquire_owned().await
                .map_err(|_| S3Error::Transfer(TransferError::UploadAborted {
                    reason: "Semaphore closed".to_string()
                }))?

            // Clone necessary data for task
            service <- self.clone()
            bucket_owned <- bucket.to_string()
            key_owned <- key.to_string()
            upload_id_owned <- upload_id.to_string()
            tx <- tx.clone()

            tokio::spawn(async move {
                let result = service.upload_part(UploadPartRequest {
                    bucket: bucket_owned,
                    key: key_owned,
                    upload_id: upload_id_owned,
                    part_number: current_part_number,
                    body: part_data.to_vec(),
                    ..Default::default()
                }).await

                drop(permit)  // Release semaphore

                let _ = tx.send((current_part_number, result)).await;
            })
        END WHILE

        // Drop sender to signal completion
        drop(tx)

        // Collect results
        mut errors: Vec<S3Error> <- Vec::new()

        WHILE let Some((part_num, result)) = rx.recv().await DO
            MATCH result {
                Ok(output) => {
                    completed_parts.push(CompletedPart {
                        part_number: part_num,
                        e_tag: output.e_tag,
                        checksum_crc32: output.checksum_crc32,
                        checksum_crc32c: output.checksum_crc32c,
                        checksum_sha1: output.checksum_sha1,
                        checksum_sha256: output.checksum_sha256,
                    })
                },
                Err(e) => {
                    errors.push(e)
                }
            }
        END WHILE

        // Check for errors
        IF NOT errors.is_empty() THEN
            RETURN Err(errors.remove(0))  // Return first error
        END IF

        // Sort parts by part number
        completed_parts.sort_by_key(|p| p.part_number)

        span.record("s3.parts_uploaded", completed_parts.len())

        Ok(completed_parts)
    END FUNCTION

    ASYNC FUNCTION abort_upload_best_effort(
        self,
        bucket: &str,
        key: &str,
        upload_id: &str
    )
        self.logger.warn("Aborting multipart upload due to error", {
            bucket: bucket,
            key: key,
            upload_id: upload_id,
        })

        IF let Err(e) = self.abort(AbortMultipartUploadRequest {
            bucket: bucket.to_string(),
            key: key.to_string(),
            upload_id: upload_id.to_string(),
        }).await THEN
            self.logger.error("Failed to abort multipart upload", {
                bucket: bucket,
                key: key,
                upload_id: upload_id,
                error: e.to_string(),
            })
        END IF
    END FUNCTION
}

/// Stream that chunks bytes into part-sized pieces
STRUCT ChunkedPartStream<S> {
    inner: S,
    part_size: u64,
    buffer: BytesMut,
}

IMPL<S: Stream<Item = Result<Bytes, S3Error>> + Unpin> Stream FOR ChunkedPartStream<S> {
    type Item = Result<Bytes, S3Error>;

    FUNCTION poll_next(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>
    ) -> Poll<Option<Self::Item>>
        this <- self.get_mut()

        LOOP
            // If buffer has enough data, emit a part
            IF this.buffer.len() as u64 >= this.part_size THEN
                part <- this.buffer.split_to(this.part_size as usize)
                RETURN Poll::Ready(Some(Ok(part.freeze())))
            END IF

            // Try to get more data from inner stream
            MATCH Pin::new(&mut this.inner).poll_next(cx) {
                Poll::Ready(Some(Ok(bytes))) => {
                    this.buffer.extend_from_slice(&bytes)
                },
                Poll::Ready(Some(Err(e))) => {
                    RETURN Poll::Ready(Some(Err(e)))
                },
                Poll::Ready(None) => {
                    // Stream ended - emit remaining buffer if any
                    IF this.buffer.is_empty() THEN
                        RETURN Poll::Ready(None)
                    ELSE
                        remaining <- this.buffer.split().freeze()
                        RETURN Poll::Ready(Some(Ok(remaining)))
                    END IF
                },
                Poll::Pending => {
                    RETURN Poll::Pending
                }
            }
        END LOOP
    END FUNCTION
}
```

---

## 2. Presign Service Implementation

### 2.1 Presign Service Structure

```pseudocode
STRUCT PresignServiceImpl {
    config: S3Config,
    signer: Arc<dyn AwsSigner>,
    logger: Arc<dyn Logger>,
    endpoint_resolver: EndpointResolver,
}

IMPL PresignServiceImpl {
    FUNCTION new(
        config: S3Config,
        signer: Arc<dyn AwsSigner>,
        logger: Arc<dyn Logger>
    ) -> Self
        Self {
            config: config.clone(),
            signer,
            logger,
            endpoint_resolver: EndpointResolver::from(&config),
        }
    END FUNCTION
}
```

### 2.2 Presigned GET URL

```pseudocode
IMPL PresignService FOR PresignServiceImpl {
    FUNCTION presign_get(self, request: PresignGetRequest) -> Result<PresignedUrl, S3Error>
        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        // Validate expiration
        IF request.expires_in > Duration::from_secs(604800) THEN
            RETURN Err(S3Error::Request(RequestError::InvalidExpiration {
                max: Duration::from_secs(604800),
                requested: request.expires_in,
            }))
        END IF

        // Build URL
        mut url <- self.endpoint_resolver.resolve_endpoint(
            Some(&request.bucket),
            Some(&request.key)
        )

        // Add query parameters
        {
            mut query <- url.query_pairs_mut()

            IF request.version_id IS Some(vid) THEN
                query.append_pair("versionId", &vid)
            END IF

            IF request.response_content_type IS Some(ct) THEN
                query.append_pair("response-content-type", &ct)
            END IF

            IF request.response_content_disposition IS Some(cd) THEN
                query.append_pair("response-content-disposition", &cd)
            END IF

            IF request.response_content_encoding IS Some(ce) THEN
                query.append_pair("response-content-encoding", &ce)
            END IF

            IF request.response_content_language IS Some(cl) THEN
                query.append_pair("response-content-language", &cl)
            END IF

            IF request.response_cache_control IS Some(cc) THEN
                query.append_pair("response-cache-control", &cc)
            END IF

            IF request.response_expires IS Some(exp) THEN
                query.append_pair("response-expires", &exp)
            END IF
        }

        // Generate presigned URL
        timestamp <- Utc::now()
        presigned_url <- self.signer.presign_url(
            HttpMethod::GET,
            &url,
            request.expires_in,
            timestamp
        )?

        expires_at <- timestamp + chrono::Duration::from_std(request.expires_in).unwrap()

        self.logger.debug("Generated presigned GET URL", {
            bucket: &request.bucket,
            key: &request.key,
            expires_in_secs: request.expires_in.as_secs(),
        })

        Ok(PresignedUrl {
            url: presigned_url.to_string(),
            expires_at,
            signed_headers: HashMap::new(),  // No required headers for GET
        })
    END FUNCTION
}
```

### 2.3 Presigned PUT URL

```pseudocode
IMPL PresignService FOR PresignServiceImpl {
    FUNCTION presign_put(self, request: PresignPutRequest) -> Result<PresignedUrl, S3Error>
        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        // Validate expiration
        IF request.expires_in > Duration::from_secs(604800) THEN
            RETURN Err(S3Error::Request(RequestError::InvalidExpiration {
                max: Duration::from_secs(604800),
                requested: request.expires_in,
            }))
        END IF

        // Build URL
        url <- self.endpoint_resolver.resolve_endpoint(
            Some(&request.bucket),
            Some(&request.key)
        )

        // Build headers that will be signed (and must be included in upload)
        mut signed_headers: HashMap<String, String> <- HashMap::new()

        IF request.content_type IS Some(ct) THEN
            signed_headers.insert("Content-Type".to_string(), ct.clone())
        END IF

        IF request.content_length IS Some(cl) THEN
            signed_headers.insert("Content-Length".to_string(), cl.to_string())
        END IF

        IF request.checksum_algorithm IS Some(algo) THEN
            signed_headers.insert(
                format!("x-amz-checksum-{}", algo.as_str().to_lowercase()),
                "CHECKSUM_PLACEHOLDER".to_string()  // Placeholder - must be provided
            )
        END IF

        IF request.storage_class IS Some(sc) THEN
            signed_headers.insert("x-amz-storage-class".to_string(), sc.as_str().to_string())
        END IF

        IF request.server_side_encryption IS Some(sse) THEN
            signed_headers.insert("x-amz-server-side-encryption".to_string(), sse.as_str().to_string())
        END IF

        IF request.sse_kms_key_id IS Some(key_id) THEN
            signed_headers.insert("x-amz-server-side-encryption-aws-kms-key-id".to_string(), key_id.clone())
        END IF

        IF request.acl IS Some(acl) THEN
            signed_headers.insert("x-amz-acl".to_string(), acl.as_str().to_string())
        END IF

        IF request.tagging IS Some(tags) THEN
            signed_headers.insert("x-amz-tagging".to_string(), tags.clone())
        END IF

        // Add metadata headers
        IF request.metadata IS Some(meta) THEN
            FOR (key, value) IN meta.iter() DO
                signed_headers.insert(
                    format!("x-amz-meta-{}", key),
                    value.clone()
                )
            END FOR
        END IF

        // Generate presigned URL with signed headers
        timestamp <- Utc::now()
        presigned_url <- self.signer.presign_url_with_headers(
            HttpMethod::PUT,
            &url,
            request.expires_in,
            timestamp,
            &signed_headers
        )?

        expires_at <- timestamp + chrono::Duration::from_std(request.expires_in).unwrap()

        self.logger.debug("Generated presigned PUT URL", {
            bucket: &request.bucket,
            key: &request.key,
            expires_in_secs: request.expires_in.as_secs(),
            signed_headers_count: signed_headers.len(),
        })

        Ok(PresignedUrl {
            url: presigned_url.to_string(),
            expires_at,
            signed_headers,
        })
    END FUNCTION
}
```

### 2.4 Presigned DELETE URL

```pseudocode
IMPL PresignService FOR PresignServiceImpl {
    FUNCTION presign_delete(self, request: PresignDeleteRequest) -> Result<PresignedUrl, S3Error>
        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        // Validate expiration
        IF request.expires_in > Duration::from_secs(604800) THEN
            RETURN Err(S3Error::Request(RequestError::InvalidExpiration {
                max: Duration::from_secs(604800),
                requested: request.expires_in,
            }))
        END IF

        // Build URL
        mut url <- self.endpoint_resolver.resolve_endpoint(
            Some(&request.bucket),
            Some(&request.key)
        )

        // Add version ID if specified
        IF request.version_id IS Some(vid) THEN
            url.query_pairs_mut().append_pair("versionId", &vid)
        END IF

        // Generate presigned URL
        timestamp <- Utc::now()
        presigned_url <- self.signer.presign_url(
            HttpMethod::DELETE,
            &url,
            request.expires_in,
            timestamp
        )?

        expires_at <- timestamp + chrono::Duration::from_std(request.expires_in).unwrap()

        self.logger.debug("Generated presigned DELETE URL", {
            bucket: &request.bucket,
            key: &request.key,
            expires_in_secs: request.expires_in.as_secs(),
        })

        Ok(PresignedUrl {
            url: presigned_url.to_string(),
            expires_at,
            signed_headers: HashMap::new(),
        })
    END FUNCTION
}
```

---

## 3. Tagging Service Implementation

### 3.1 Tagging Service Structure

```pseudocode
STRUCT TaggingServiceImpl {
    config: S3Config,
    transport: Arc<dyn HttpTransport>,
    signer: Arc<dyn AwsSigner>,
    executor: ResilientExecutor,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
    endpoint_resolver: EndpointResolver,
}
```

### 3.2 GetObjectTagging Implementation

```pseudocode
IMPL TaggingService FOR TaggingServiceImpl {
    ASYNC FUNCTION get(
        self,
        request: GetObjectTaggingRequest
    ) -> Result<GetObjectTaggingOutput, S3Error>
        span <- self.tracer.start_span("s3.GetObjectTagging", {
            "s3.bucket": request.bucket.clone(),
            "s3.key": request.key.clone(),
        })

        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        // Build HTTP request
        mut builder <- S3RequestBuilder::new(HttpMethod::GET, self.endpoint_resolver.clone())
            .bucket(&request.bucket)
            .key(&request.key)
            .query("tagging", "")

        IF request.version_id IS Some(vid) THEN
            builder <- builder.query("versionId", vid)
        END IF

        http_request <- builder.build()

        // Sign and execute
        result <- self.executor.execute("GetObjectTagging", || async {
            mut signed_request <- http_request.clone()
            self.signer.sign_request(&mut signed_request, &sha256_hex(b""), Utc::now())?

            response <- self.transport.send(signed_request).await?

            IF response.status.is_success() THEN
                output <- S3ResponseParser::parse_get_object_tagging_response(&response.body)?

                version_id <- response.headers.get("x-amz-version-id")
                    .and_then(|v| v.to_str().ok())
                    .map(String::from)

                span.record("s3.tag_count", output.tag_set.len())

                Ok(GetObjectTaggingOutput {
                    tag_set: output.tag_set,
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

### 3.3 PutObjectTagging Implementation

```pseudocode
IMPL TaggingService FOR TaggingServiceImpl {
    ASYNC FUNCTION put(
        self,
        request: PutObjectTaggingRequest
    ) -> Result<PutObjectTaggingOutput, S3Error>
        span <- self.tracer.start_span("s3.PutObjectTagging", {
            "s3.bucket": request.bucket.clone(),
            "s3.key": request.key.clone(),
            "s3.tag_count": request.tag_set.len(),
        })

        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        // Validate tags
        IF request.tag_set.len() > 10 THEN
            RETURN Err(S3Error::Request(RequestError::TooManyTags {
                count: request.tag_set.len(),
                max: 10,
            }))
        END IF

        FOR tag IN request.tag_set.iter() DO
            IF tag.key.len() > 128 THEN
                RETURN Err(S3Error::Request(RequestError::TagKeyTooLong {
                    key: tag.key.clone(),
                    max: 128,
                }))
            END IF
            IF tag.value.len() > 256 THEN
                RETURN Err(S3Error::Request(RequestError::TagValueTooLong {
                    key: tag.key.clone(),
                    value_len: tag.value.len(),
                    max: 256,
                }))
            END IF
        END FOR

        // Build XML body
        tagging_xml <- Tagging {
            tag_set: TagSet {
                tags: request.tag_set.iter().map(|t| TagXml {
                    key: t.key.clone(),
                    value: t.value.clone(),
                }).collect(),
            },
        }

        xml_body <- quick_xml::se::to_string(&tagging_xml)?
        payload_hash <- calculate_payload_hash(Some(xml_body.as_bytes()))

        // Calculate Content-MD5 (required for PUT tagging)
        content_md5 <- base64::encode(md5::compute(xml_body.as_bytes()).as_ref())

        // Build HTTP request
        mut builder <- S3RequestBuilder::new(HttpMethod::PUT, self.endpoint_resolver.clone())
            .bucket(&request.bucket)
            .key(&request.key)
            .query("tagging", "")
            .content_type("application/xml")
            .header("content-md5", content_md5)
            .body_bytes(Bytes::from(xml_body))

        IF request.version_id IS Some(vid) THEN
            builder <- builder.query("versionId", vid)
        END IF

        http_request <- builder.build()

        // Sign and execute
        result <- self.executor.execute("PutObjectTagging", || async {
            mut signed_request <- http_request.clone()
            self.signer.sign_request(&mut signed_request, &payload_hash, Utc::now())?

            response <- self.transport.send(signed_request).await?

            IF response.status.is_success() THEN
                version_id <- response.headers.get("x-amz-version-id")
                    .and_then(|v| v.to_str().ok())
                    .map(String::from)

                self.logger.info("PutObjectTagging successful", {
                    bucket: &request.bucket,
                    key: &request.key,
                    tag_count: request.tag_set.len(),
                })

                Ok(PutObjectTaggingOutput { version_id })
            ELSE
                Err(map_http_status_to_error(response.status, &response.body))
            END IF
        }, &span).await

        span.end()
        result
    END FUNCTION
}
```

### 3.4 DeleteObjectTagging Implementation

```pseudocode
IMPL TaggingService FOR TaggingServiceImpl {
    ASYNC FUNCTION delete(
        self,
        request: DeleteObjectTaggingRequest
    ) -> Result<DeleteObjectTaggingOutput, S3Error>
        span <- self.tracer.start_span("s3.DeleteObjectTagging", {
            "s3.bucket": request.bucket.clone(),
            "s3.key": request.key.clone(),
        })

        // Validate inputs
        validate_bucket_name(&request.bucket)?
        validate_object_key(&request.key)?

        // Build HTTP request
        mut builder <- S3RequestBuilder::new(HttpMethod::DELETE, self.endpoint_resolver.clone())
            .bucket(&request.bucket)
            .key(&request.key)
            .query("tagging", "")

        IF request.version_id IS Some(vid) THEN
            builder <- builder.query("versionId", vid)
        END IF

        http_request <- builder.build()

        // Sign and execute
        result <- self.executor.execute("DeleteObjectTagging", || async {
            mut signed_request <- http_request.clone()
            self.signer.sign_request(&mut signed_request, &sha256_hex(b""), Utc::now())?

            response <- self.transport.send(signed_request).await?

            IF response.status.is_success() THEN
                version_id <- response.headers.get("x-amz-version-id")
                    .and_then(|v| v.to_str().ok())
                    .map(String::from)

                self.logger.info("DeleteObjectTagging successful", {
                    bucket: &request.bucket,
                    key: &request.key,
                })

                Ok(DeleteObjectTaggingOutput { version_id })
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

## 4. High-Level Transfer Operations

### 4.1 Transfer Manager

```pseudocode
STRUCT TransferManager {
    client: Arc<dyn S3Client>,
    config: TransferConfig,
    logger: Arc<dyn Logger>,
}

STRUCT TransferConfig {
    multipart_threshold: u64,
    part_size: u64,
    concurrency: usize,
    checksum_algorithm: Option<ChecksumAlgorithm>,
}

IMPL TransferManager {
    FUNCTION new(client: Arc<dyn S3Client>, config: TransferConfig) -> Self
        Self {
            client,
            config,
            logger: get_logger_from_primitive("s3-transfer"),
        }
    END FUNCTION

    /// Upload a file with automatic multipart handling
    ASYNC FUNCTION upload_file(
        self,
        bucket: &str,
        key: &str,
        file_path: &Path,
        options: UploadOptions
    ) -> Result<UploadOutput, S3Error>
        // Get file size
        metadata <- tokio::fs::metadata(file_path).await?
        file_size <- metadata.len()

        self.logger.info("Starting file upload", {
            bucket: bucket,
            key: key,
            file_path: file_path.display(),
            file_size: file_size,
        })

        IF file_size > self.config.multipart_threshold THEN
            self.upload_file_multipart(bucket, key, file_path, file_size, options).await
        ELSE
            self.upload_file_single(bucket, key, file_path, options).await
        END IF
    END FUNCTION

    ASYNC FUNCTION upload_file_single(
        self,
        bucket: &str,
        key: &str,
        file_path: &Path,
        options: UploadOptions
    ) -> Result<UploadOutput, S3Error>
        // Read entire file
        body <- tokio::fs::read(file_path).await?

        // Determine content type
        content_type <- options.content_type
            .or_else(|| mime_guess::from_path(file_path).first().map(|m| m.to_string()))

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

        output <- self.client.objects().put(request).await?

        Ok(UploadOutput {
            e_tag: output.e_tag,
            version_id: output.version_id,
            location: format!("s3://{}/{}", bucket, key),
        })
    END FUNCTION

    ASYNC FUNCTION upload_file_multipart(
        self,
        bucket: &str,
        key: &str,
        file_path: &Path,
        file_size: u64,
        options: UploadOptions
    ) -> Result<UploadOutput, S3Error>
        // Open file
        file <- tokio::fs::File::open(file_path).await?

        // Create stream from file
        stream <- create_file_stream(file_path, self.config.part_size as usize).await?

        // Determine content type
        content_type <- options.content_type
            .or_else(|| mime_guess::from_path(file_path).first().map(|m| m.to_string()))

        // Use multipart upload
        upload_request <- UploadRequest {
            bucket: bucket.to_string(),
            key: key.to_string(),
            content_length: file_size,
            content_type,
            storage_class: options.storage_class,
            server_side_encryption: options.server_side_encryption,
            sse_kms_key_id: options.sse_kms_key_id,
            metadata: options.metadata,
            acl: options.acl,
            tagging: options.tagging,
        }

        self.client.multipart().upload(upload_request, stream).await
    END FUNCTION

    /// Download an object to a file
    ASYNC FUNCTION download_file(
        self,
        bucket: &str,
        key: &str,
        file_path: &Path
    ) -> Result<u64, S3Error>
        self.logger.info("Starting file download", {
            bucket: bucket,
            key: key,
            file_path: file_path.display(),
        })

        // Get object as stream
        request <- GetObjectRequest {
            bucket: bucket.to_string(),
            key: key.to_string(),
            ..Default::default()
        }

        response <- self.client.objects().get_stream(request).await?

        // Open file for writing
        file <- tokio::fs::File::create(file_path).await?
        mut writer <- tokio::io::BufWriter::new(file)

        // Stream to file
        mut total_bytes: u64 <- 0
        pin_mut!(response.body)

        WHILE let Some(chunk_result) = response.body.next().await DO
            chunk <- chunk_result?
            writer.write_all(&chunk).await?
            total_bytes += chunk.len() as u64
        END WHILE

        writer.flush().await?

        self.logger.info("Download complete", {
            bucket: bucket,
            key: key,
            file_path: file_path.display(),
            bytes: total_bytes,
        })

        Ok(total_bytes)
    END FUNCTION

    /// Copy object between buckets/keys
    ASYNC FUNCTION copy(
        self,
        source_bucket: &str,
        source_key: &str,
        dest_bucket: &str,
        dest_key: &str,
        options: CopyOptions
    ) -> Result<CopyOutput, S3Error>
        // Get source object size
        head_request <- HeadObjectRequest {
            bucket: source_bucket.to_string(),
            key: source_key.to_string(),
            ..Default::default()
        }

        head_response <- self.client.objects().head(head_request).await?
        source_size <- head_response.content_length as u64

        IF source_size > 5 * 1024 * 1024 * 1024 THEN  // > 5GB
            // Use multipart copy
            self.copy_multipart(source_bucket, source_key, dest_bucket, dest_key, source_size, options).await
        ELSE
            // Use single copy
            self.copy_single(source_bucket, source_key, dest_bucket, dest_key, options).await
        END IF
    END FUNCTION

    ASYNC FUNCTION copy_single(
        self,
        source_bucket: &str,
        source_key: &str,
        dest_bucket: &str,
        dest_key: &str,
        options: CopyOptions
    ) -> Result<CopyOutput, S3Error>
        request <- CopyObjectRequest {
            source_bucket: source_bucket.to_string(),
            source_key: source_key.to_string(),
            bucket: dest_bucket.to_string(),
            key: dest_key.to_string(),
            storage_class: options.storage_class,
            server_side_encryption: options.server_side_encryption,
            metadata_directive: options.metadata_directive,
            metadata: options.metadata,
            ..Default::default()
        }

        output <- self.client.objects().copy(request).await?

        Ok(CopyOutput {
            e_tag: output.e_tag,
            last_modified: output.last_modified,
        })
    END FUNCTION

    ASYNC FUNCTION copy_multipart(
        self,
        source_bucket: &str,
        source_key: &str,
        dest_bucket: &str,
        dest_key: &str,
        source_size: u64,
        options: CopyOptions
    ) -> Result<CopyOutput, S3Error>
        self.logger.info("Starting multipart copy", {
            source: format!("{}/{}", source_bucket, source_key),
            dest: format!("{}/{}", dest_bucket, dest_key),
            size: source_size,
        })

        // Step 1: Create multipart upload
        create_request <- CreateMultipartUploadRequest {
            bucket: dest_bucket.to_string(),
            key: dest_key.to_string(),
            storage_class: options.storage_class.clone(),
            server_side_encryption: options.server_side_encryption.clone(),
            metadata: IF options.metadata_directive == Some(MetadataDirective::Replace) THEN
                options.metadata.clone()
            ELSE
                None
            END IF,
            ..Default::default()
        }

        create_output <- self.client.multipart().create(create_request).await?
        upload_id <- create_output.upload_id.clone()

        // Step 2: Copy parts
        copy_result <- self.copy_parts(
            source_bucket,
            source_key,
            dest_bucket,
            dest_key,
            &upload_id,
            source_size
        ).await

        MATCH copy_result {
            Ok(parts) => {
                // Step 3: Complete multipart upload
                complete_request <- CompleteMultipartUploadRequest {
                    bucket: dest_bucket.to_string(),
                    key: dest_key.to_string(),
                    upload_id: upload_id.clone(),
                    parts,
                    ..Default::default()
                }

                complete_output <- self.client.multipart().complete(complete_request).await?

                Ok(CopyOutput {
                    e_tag: complete_output.e_tag,
                    last_modified: Utc::now(),
                })
            },
            Err(e) => {
                // Abort upload on error
                let _ <- self.client.multipart().abort(AbortMultipartUploadRequest {
                    bucket: dest_bucket.to_string(),
                    key: dest_key.to_string(),
                    upload_id,
                }).await

                Err(e)
            }
        }
    END FUNCTION

    ASYNC FUNCTION copy_parts(
        self,
        source_bucket: &str,
        source_key: &str,
        dest_bucket: &str,
        dest_key: &str,
        upload_id: &str,
        source_size: u64
    ) -> Result<Vec<CompletedPart>, S3Error>
        mut parts: Vec<CompletedPart> <- Vec::new()
        part_size <- self.config.part_size
        mut offset: u64 <- 0
        mut part_number: u32 <- 1

        WHILE offset < source_size DO
            end <- min(offset + part_size - 1, source_size - 1)

            // Copy this part using UploadPartCopy
            // Note: This requires additional API implementation
            // For simplicity, showing the pattern

            copy_range <- format!("bytes={}-{}", offset, end)

            // Execute part copy
            part_output <- self.copy_part(
                source_bucket,
                source_key,
                dest_bucket,
                dest_key,
                upload_id,
                part_number,
                &copy_range
            ).await?

            parts.push(CompletedPart {
                part_number,
                e_tag: part_output.e_tag,
                ..Default::default()
            })

            offset = end + 1
            part_number += 1
        END WHILE

        Ok(parts)
    END FUNCTION
}
```

### 4.2 Sync Operations

```pseudocode
STRUCT SyncManager {
    client: Arc<dyn S3Client>,
    logger: Arc<dyn Logger>,
}

IMPL SyncManager {
    /// Sync local directory to S3 bucket prefix
    ASYNC FUNCTION sync_to_s3(
        self,
        local_dir: &Path,
        bucket: &str,
        prefix: &str,
        options: SyncOptions
    ) -> Result<SyncResult, S3Error>
        mut uploaded: usize <- 0
        mut skipped: usize <- 0
        mut failed: usize <- 0
        mut errors: Vec<SyncError> <- Vec::new()

        // Walk local directory
        mut entries <- WalkDir::new(local_dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())

        FOR entry IN entries DO
            relative_path <- entry.path().strip_prefix(local_dir)?
            key <- format!("{}/{}", prefix.trim_end_matches('/'),
                relative_path.to_string_lossy().replace('\\', "/"))

            // Check if file needs upload
            IF options.skip_existing THEN
                head_request <- HeadObjectRequest {
                    bucket: bucket.to_string(),
                    key: key.clone(),
                    ..Default::default()
                }

                IF let Ok(head) = self.client.objects().head(head_request).await THEN
                    // Compare by size and/or modification time
                    local_metadata <- entry.metadata()?
                    IF local_metadata.len() == head.content_length as u64 THEN
                        skipped += 1
                        CONTINUE
                    END IF
                END IF
            END IF

            // Upload file
            MATCH self.upload_file(entry.path(), bucket, &key, &options).await {
                Ok(_) => uploaded += 1,
                Err(e) => {
                    failed += 1
                    errors.push(SyncError {
                        path: entry.path().to_path_buf(),
                        key: key,
                        error: e.to_string(),
                    })
                }
            }
        END FOR

        Ok(SyncResult {
            uploaded,
            skipped,
            failed,
            errors,
        })
    END FUNCTION

    /// Sync S3 bucket prefix to local directory
    ASYNC FUNCTION sync_from_s3(
        self,
        bucket: &str,
        prefix: &str,
        local_dir: &Path,
        options: SyncOptions
    ) -> Result<SyncResult, S3Error>
        mut downloaded: usize <- 0
        mut skipped: usize <- 0
        mut failed: usize <- 0
        mut errors: Vec<SyncError> <- Vec::new()

        // List objects with prefix
        list_request <- ListObjectsV2Request {
            bucket: bucket.to_string(),
            prefix: Some(prefix.to_string()),
            ..Default::default()
        }

        paginator <- self.client.objects().list_all(list_request)
        pin_mut!(paginator)

        WHILE let Some(result) = paginator.next().await DO
            object <- result?

            // Calculate local path
            relative_key <- object.key.strip_prefix(prefix).unwrap_or(&object.key)
            local_path <- local_dir.join(relative_key.trim_start_matches('/'))

            // Check if file needs download
            IF options.skip_existing AND local_path.exists() THEN
                local_metadata <- tokio::fs::metadata(&local_path).await?
                IF local_metadata.len() == object.size as u64 THEN
                    skipped += 1
                    CONTINUE
                END IF
            END IF

            // Create parent directories
            IF let Some(parent) = local_path.parent() THEN
                tokio::fs::create_dir_all(parent).await?
            END IF

            // Download file
            MATCH self.download_file(bucket, &object.key, &local_path).await {
                Ok(_) => downloaded += 1,
                Err(e) => {
                    failed += 1
                    errors.push(SyncError {
                        path: local_path,
                        key: object.key,
                        error: e.to_string(),
                    })
                }
            }
        END WHILE

        Ok(SyncResult {
            uploaded: 0,
            downloaded,
            skipped,
            failed,
            errors,
        })
    END FUNCTION
}
```

---

## 5. Testing Mocks

### 5.1 Mock HTTP Transport

```pseudocode
/// Mock HTTP transport for unit testing
STRUCT MockHttpTransport {
    responses: Arc<Mutex<VecDeque<Result<HttpResponse, TransportError>>>>,
    requests: Arc<Mutex<Vec<HttpRequest>>>,
}

IMPL MockHttpTransport {
    FUNCTION new() -> Self
        Self {
            responses: Arc::new(Mutex::new(VecDeque::new())),
            requests: Arc::new(Mutex::new(Vec::new())),
        }
    END FUNCTION

    FUNCTION with_response(mut self, response: HttpResponse) -> Self
        self.responses.lock().unwrap().push_back(Ok(response))
        self
    END FUNCTION

    FUNCTION with_error(mut self, error: TransportError) -> Self
        self.responses.lock().unwrap().push_back(Err(error))
        self
    END FUNCTION

    FUNCTION with_responses(mut self, responses: Vec<Result<HttpResponse, TransportError>>) -> Self
        mut queue <- self.responses.lock().unwrap()
        FOR response IN responses DO
            queue.push_back(response)
        END FOR
        self
    END FUNCTION

    FUNCTION get_requests(self) -> Vec<HttpRequest>
        self.requests.lock().unwrap().clone()
    END FUNCTION

    FUNCTION get_last_request(self) -> Option<HttpRequest>
        self.requests.lock().unwrap().last().cloned()
    END FUNCTION

    FUNCTION assert_request_count(self, expected: usize)
        actual <- self.requests.lock().unwrap().len()
        assert_eq!(actual, expected, "Expected {} requests, got {}", expected, actual)
    END FUNCTION

    FUNCTION assert_header(self, index: usize, header: &str, expected: &str)
        requests <- self.requests.lock().unwrap()
        IF let Some(request) = requests.get(index) THEN
            actual <- request.headers.get(header)
                .and_then(|v| v.to_str().ok())
            assert_eq!(actual, Some(expected),
                "Expected header {}={}, got {:?}", header, expected, actual)
        ELSE
            panic!("No request at index {}", index)
        END IF
    END FUNCTION
}

IMPL HttpTransport FOR MockHttpTransport {
    ASYNC FUNCTION send(self, request: HttpRequest) -> Result<HttpResponse, TransportError>
        // Record request
        self.requests.lock().unwrap().push(request)

        // Return next queued response
        self.responses.lock().unwrap()
            .pop_front()
            .unwrap_or(Err(TransportError::NoMockResponse))
    END FUNCTION

    ASYNC FUNCTION send_streaming(
        self,
        request: HttpRequest
    ) -> Result<StreamingResponse, TransportError>
        // Record request
        self.requests.lock().unwrap().push(request)

        // Return next queued response as streaming
        response <- self.responses.lock().unwrap()
            .pop_front()
            .unwrap_or(Err(TransportError::NoMockResponse))?

        Ok(StreamingResponse {
            status: response.status,
            headers: response.headers,
            body: Box::pin(stream::once(async move { Ok(response.body) })),
        })
    END FUNCTION
}
```

### 5.2 Mock Credentials Provider

```pseudocode
/// Mock credentials provider for testing
STRUCT MockCredentialsProvider {
    credentials: Option<AwsCredentials>,
    error: Option<CredentialsError>,
}

IMPL MockCredentialsProvider {
    FUNCTION with_credentials(access_key: &str, secret_key: &str) -> Self
        Self {
            credentials: Some(AwsCredentials {
                access_key_id: access_key.to_string(),
                secret_access_key: SecretString::new(secret_key.to_string()),
                session_token: None,
            }),
            error: None,
        }
    END FUNCTION

    FUNCTION with_error(error: CredentialsError) -> Self
        Self {
            credentials: None,
            error: Some(error),
        }
    END FUNCTION
}

IMPL CredentialsProvider FOR MockCredentialsProvider {
    ASYNC FUNCTION get_credentials(self) -> Result<AwsCredentials, CredentialsError>
        IF let Some(error) = self.error.clone() THEN
            RETURN Err(error)
        END IF

        self.credentials.clone().ok_or(CredentialsError::CredentialsNotFound {
            source: "mock".to_string()
        })
    END FUNCTION
}
```

### 5.3 Mock S3 Service

```pseudocode
/// Complete mock S3 service for integration testing
STRUCT MockS3Service {
    buckets: Arc<RwLock<HashMap<String, MockBucket>>>,
}

STRUCT MockBucket {
    name: String,
    region: String,
    objects: HashMap<String, MockObject>,
    multipart_uploads: HashMap<String, MockMultipartUpload>,
}

STRUCT MockObject {
    key: String,
    body: Vec<u8>,
    content_type: Option<String>,
    metadata: HashMap<String, String>,
    e_tag: String,
    last_modified: DateTime<Utc>,
    storage_class: StorageClass,
    tags: Vec<Tag>,
}

STRUCT MockMultipartUpload {
    upload_id: String,
    key: String,
    parts: HashMap<u32, MockPart>,
}

STRUCT MockPart {
    part_number: u32,
    body: Vec<u8>,
    e_tag: String,
}

IMPL MockS3Service {
    FUNCTION new() -> Self
        Self {
            buckets: Arc::new(RwLock::new(HashMap::new())),
        }
    END FUNCTION

    FUNCTION create_bucket(self, name: &str, region: &str)
        mut buckets <- self.buckets.write().unwrap()
        buckets.insert(name.to_string(), MockBucket {
            name: name.to_string(),
            region: region.to_string(),
            objects: HashMap::new(),
            multipart_uploads: HashMap::new(),
        })
    END FUNCTION

    FUNCTION put_object(self, bucket: &str, key: &str, body: Vec<u8>)
        mut buckets <- self.buckets.write().unwrap()
        IF let Some(bucket) = buckets.get_mut(bucket) THEN
            e_tag <- format!("\"{}\"", md5::compute(&body).0.iter()
                .map(|b| format!("{:02x}", b)).collect::<String>())

            bucket.objects.insert(key.to_string(), MockObject {
                key: key.to_string(),
                body,
                content_type: None,
                metadata: HashMap::new(),
                e_tag,
                last_modified: Utc::now(),
                storage_class: StorageClass::Standard,
                tags: Vec::new(),
            })
        END IF
    END FUNCTION

    FUNCTION get_object(self, bucket: &str, key: &str) -> Option<MockObject>
        buckets <- self.buckets.read().unwrap()
        buckets.get(bucket)?.objects.get(key).cloned()
    END FUNCTION

    /// Create an HTTP handler for the mock service
    FUNCTION create_handler(self) -> impl Fn(HttpRequest) -> Result<HttpResponse, TransportError>
        let service <- self.clone()

        move |request: HttpRequest| {
            // Parse request and dispatch to appropriate handler
            // ... implementation
        }
    END FUNCTION
}
```

### 5.4 Test Helpers

```pseudocode
/// Test helper module
MODULE test_helpers {
    /// Create a test S3 client with mock transport
    FUNCTION create_test_client(transport: MockHttpTransport) -> Arc<dyn S3Client>
        config <- S3Config {
            region: "us-east-1".to_string(),
            credentials_provider: Arc::new(MockCredentialsProvider::with_credentials(
                "AKIAIOSFODNN7EXAMPLE",
                "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
            )),
            ..Default::default()
        }

        // Build client with mock transport
        // ... implementation
    END FUNCTION

    /// Create a test response with common S3 headers
    FUNCTION create_test_response(status: u16, body: &[u8]) -> HttpResponse
        mut headers <- HeaderMap::new()
        headers.insert("x-amz-request-id", "test-request-id")
        headers.insert("x-amz-id-2", "test-extended-request-id")

        HttpResponse {
            status: StatusCode::from_u16(status).unwrap(),
            headers,
            body: Bytes::from(body.to_vec()),
        }
    END FUNCTION

    /// Create a test XML error response
    FUNCTION create_error_response(code: &str, message: &str) -> HttpResponse
        body <- format!(r#"<?xml version="1.0" encoding="UTF-8"?>
            <Error>
                <Code>{}</Code>
                <Message>{}</Message>
                <RequestId>test-request-id</RequestId>
            </Error>"#, code, message)

        create_test_response(400, body.as_bytes())
    END FUNCTION

    /// Assert that a result is an error of expected type
    MACRO assert_s3_error!(result, error_pattern) {
        match result {
            Err(e) => {
                assert!(matches!(e, $error_pattern),
                    "Expected error {:?}, got {:?}", stringify!($error_pattern), e)
            },
            Ok(_) => panic!("Expected error, got success"),
        }
    }
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode - Part 3 |

---

**End of Pseudocode Phase**

*The next phase (Architecture) will provide system design, component diagrams, data flow diagrams, and deployment considerations.*
