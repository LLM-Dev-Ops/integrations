# Google Gmail Integration Module - Pseudocode (Part 2)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/google-gmail`
**Part:** 2 of 4 - Message Operations, Thread Operations & MIME Handling

---

## Table of Contents

1. [Overview](#1-overview)
2. [Messages Service Implementation](#2-messages-service-implementation)
3. [Thread Service Implementation](#3-thread-service-implementation)
4. [MIME Message Construction](#4-mime-message-construction)
5. [Base64url Encoding](#5-base64url-encoding)
6. [Pagination Handling](#6-pagination-handling)
7. [Batch Operations](#7-batch-operations)

---

## 1. Overview

### 1.1 Document Purpose

This pseudocode document provides detailed algorithmic descriptions for implementing message and thread operations in the Google Gmail Integration Module. It covers CRUD operations, MIME message construction, Base64url encoding, and pagination handling.

### 1.2 Part Overview

This is Part 2 of 4, covering:
- Messages service implementation (list, get, send, modify, delete, trash, batch)
- Thread service implementation (list, get, modify, delete, trash)
- MIME message construction (RFC 2822)
- Base64url encoding/decoding
- Pagination and streaming
- Batch operations

---

## 2. Messages Service Implementation

### 2.1 Messages Service Structure

```pseudocode
STRUCT MessagesServiceImpl {
    config: GmailConfig,
    executor: Arc<RequestExecutor>,
    mime_builder: Arc<MimeBuilder>,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
}

IMPL MessagesServiceImpl {
    FUNCTION new(
        config: GmailConfig,
        transport: Arc<dyn HttpTransport>,
        auth_provider: Arc<dyn AuthProvider>,
        retry_executor: Arc<RetryExecutor>,
        circuit_breaker: Arc<CircuitBreaker>,
        rate_limiter: Option<Arc<RateLimiter>>,
        logger: Arc<dyn Logger>,
        tracer: Arc<dyn Tracer>,
    ) -> Self
        executor <- Arc::new(RequestExecutor {
            transport: transport,
            auth_provider: auth_provider,
            retry_executor: retry_executor,
            circuit_breaker: circuit_breaker,
            rate_limiter: rate_limiter,
            response_parser: GmailResponseParser::new(logger.clone()),
            logger: logger.clone(),
            tracer: tracer.clone(),
        })

        Self {
            config: config,
            executor: executor,
            mime_builder: Arc::new(MimeBuilderImpl::new()),
            logger: logger,
            tracer: tracer,
        }
    END FUNCTION
}
```

### 2.2 List Messages

```pseudocode
IMPL MessagesService FOR MessagesServiceImpl {
    ASYNC FUNCTION list(
        self,
        user_id: &str,
        params: Option<ListMessagesParams>,
    ) -> Result<Paginated<MessageRef>, GmailError>
        // Resolve user ID
        resolved_user_id <- IF user_id == "me" THEN
            self.config.default_user_id.clone()
        ELSE
            user_id.to_string()
        END IF

        // Build request
        request <- build_messages_list_request(
            &self.config.base_url,
            &resolved_user_id,
            params.as_ref(),
        )?

        // Build span attributes
        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "messages".to_string()),
            ("gmail.operation".to_string(), "list".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        IF let Some(p) = &params THEN
            IF let Some(q) = &p.q THEN
                span_attrs.insert("gmail.query".to_string(), truncate_for_logging(q, 100))
            END IF
        END IF

        // Execute request
        response <- self.executor.execute::<ListMessagesResponse>(
            request,
            "gmail.messages.list",
            span_attrs,
        ).await?

        // Convert to Paginated
        Ok(Paginated {
            items: response.messages.unwrap_or_default(),
            next_page_token: response.next_page_token,
            result_size_estimate: response.result_size_estimate,
        })
    END FUNCTION

    // Stream all messages with auto-pagination
    FUNCTION list_all(
        self,
        user_id: &str,
        params: Option<ListMessagesParams>,
    ) -> impl Stream<Item = Result<MessageRef, GmailError>> + Send
        // Create async stream for pagination
        let user_id = user_id.to_string()
        let params = params.unwrap_or_default()
        let executor = self.executor.clone()
        let config = self.config.clone()

        async_stream::stream! {
            let mut page_token: Option<String> = None

            LOOP
                // Build params with current page token
                list_params <- ListMessagesParams {
                    page_token: page_token.clone(),
                    ..params.clone()
                }

                // Fetch page
                MATCH self.list(&user_id, Some(list_params)).await {
                    Ok(page) => {
                        // Yield all items from page
                        FOR message_ref IN page.items DO
                            yield Ok(message_ref)
                        END FOR

                        // Check for more pages
                        IF let Some(token) = page.next_page_token THEN
                            page_token = Some(token)
                        ELSE
                            BREAK
                        END IF
                    }
                    Err(e) => {
                        yield Err(e)
                        BREAK
                    }
                }
            END LOOP
        }
    END FUNCTION
}
```

### 2.3 Get Message

```pseudocode
IMPL MessagesService FOR MessagesServiceImpl {
    ASYNC FUNCTION get(
        self,
        user_id: &str,
        message_id: &str,
        format: Option<MessageFormat>,
    ) -> Result<Message, GmailError>
        // Validate message ID
        IF message_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Message ID cannot be empty".to_string()
            }))
        END IF

        // Resolve user ID
        resolved_user_id <- resolve_user_id(user_id, &self.config)

        // Build request
        request <- build_message_get_request(
            &self.config.base_url,
            &resolved_user_id,
            message_id,
            format,
        )?

        // Build span attributes
        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "messages".to_string()),
            ("gmail.operation".to_string(), "get".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.message_id".to_string(), message_id.to_string()),
            ("gmail.format".to_string(), format.map(|f| f.to_string()).unwrap_or("full".to_string())),
        ])

        // Execute request
        self.executor.execute::<Message>(
            request,
            "gmail.messages.get",
            span_attrs,
        ).await
    END FUNCTION

    ASYNC FUNCTION get_metadata(
        self,
        user_id: &str,
        message_id: &str,
        metadata_headers: Vec<String>,
    ) -> Result<Message, GmailError>
        // Validate inputs
        IF message_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Message ID cannot be empty".to_string()
            }))
        END IF

        IF metadata_headers.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "At least one metadata header must be specified".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        // Build request with metadata headers
        builder <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::GET,
            format!("/gmail/v1/users/{}/messages/{}", resolved_user_id, message_id),
        )
        .query_param("format", "metadata")

        FOR header IN &metadata_headers DO
            builder <- builder.query_param("metadataHeaders", header)
        END FOR

        request <- builder.build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "messages".to_string()),
            ("gmail.operation".to_string(), "get_metadata".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.message_id".to_string(), message_id.to_string()),
            ("gmail.metadata_headers".to_string(), metadata_headers.join(",").to_string()),
        ])

        self.executor.execute::<Message>(
            request,
            "gmail.messages.get_metadata",
            span_attrs,
        ).await
    END FUNCTION
}
```

### 2.4 Send Message

```pseudocode
IMPL MessagesService FOR MessagesServiceImpl {
    ASYNC FUNCTION send(
        self,
        user_id: &str,
        message: SendMessageRequest,
    ) -> Result<Message, GmailError>
        // Validate message
        validate_send_message_request(&message)?

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        // Determine upload type based on message size
        raw_decoded_size <- estimate_decoded_size(&message.raw)

        upload_type <- IF raw_decoded_size < SIMPLE_UPLOAD_THRESHOLD THEN
            UploadType::Simple
        ELSE IF raw_decoded_size < MULTIPART_UPLOAD_THRESHOLD THEN
            UploadType::Multipart
        ELSE
            UploadType::Resumable
        END IF

        self.logger.debug("Sending message", {
            user_id: hash_user_id(&resolved_user_id),
            upload_type: upload_type.to_string(),
            estimated_size: raw_decoded_size,
        })

        // Build request
        request <- build_message_send_request(
            &self.config.base_url,
            &resolved_user_id,
            &message,
            upload_type.clone(),
        )?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "messages".to_string()),
            ("gmail.operation".to_string(), "send".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.upload_type".to_string(), upload_type.to_string()),
            ("gmail.thread_id".to_string(), message.thread_id.clone().unwrap_or_default()),
        ])

        result <- self.executor.execute::<Message>(
            request,
            "gmail.messages.send",
            span_attrs,
        ).await?

        self.logger.info("Message sent successfully", {
            message_id: result.id,
            thread_id: result.thread_id,
        })

        Ok(result)
    END FUNCTION

    ASYNC FUNCTION send_with_upload(
        self,
        user_id: &str,
        message: SendMessageRequest,
        upload_type: UploadType,
    ) -> Result<Message, GmailError>
        validate_send_message_request(&message)?

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        MATCH upload_type {
            UploadType::Simple | UploadType::Multipart => {
                // Delegate to regular send
                self.send(user_id, message).await
            }

            UploadType::Resumable => {
                // Handle resumable upload
                self.send_resumable(resolved_user_id, message).await
            }
        }
    END FUNCTION

    ASYNC FUNCTION send_resumable(
        self,
        user_id: String,
        message: SendMessageRequest,
    ) -> Result<Message, GmailError>
        // Decode raw message for streaming
        raw_bytes <- base64::decode_config(&message.raw, base64::URL_SAFE)
            .map_err(|e| GmailError::Mime(MimeError::EncodingError {
                message: format!("Invalid base64url encoding: {}", e)
            }))?

        total_size <- raw_bytes.len() as u64

        // Create chunk stream
        chunk_size <- 256 * 1024  // 256KB chunks
        chunks <- raw_bytes
            .chunks(chunk_size)
            .map(|chunk| Ok(Bytes::copy_from_slice(chunk)))
            .collect::<Vec<_>>()

        chunk_stream <- futures::stream::iter(chunks)

        // Build init request
        init_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::POST,
            format!("/upload/gmail/v1/users/{}/messages/send", user_id),
        )
        .query_param("uploadType", "resumable")
        .header("X-Upload-Content-Type", "message/rfc822")
        .header("X-Upload-Content-Length", total_size.to_string())
        .json_body(&serde_json::json!({
            "threadId": message.thread_id,
        }))?
        .build()?

        // Add auth header
        auth_header <- self.executor.auth_provider.get_auth_header().await?
        init_request.headers.insert("Authorization", auth_header.parse()?)?

        // Execute resumable upload
        response <- self.executor.transport.send_resumable(
            init_request,
            chunk_stream,
            total_size,
        ).await?

        // Parse response
        self.executor.response_parser.parse(&response)
    END FUNCTION
}

FUNCTION validate_send_message_request(message: &SendMessageRequest) -> Result<(), GmailError>
    IF message.raw.is_empty() THEN
        RETURN Err(GmailError::Request(RequestError::InvalidParameter {
            message: "Message raw content cannot be empty".to_string()
        }))
    END IF

    // Validate base64url encoding
    IF NOT is_valid_base64url(&message.raw) THEN
        RETURN Err(GmailError::Mime(MimeError::EncodingError {
            message: "Message raw content must be valid base64url encoding".to_string()
        }))
    END IF

    Ok(())
END FUNCTION

CONST SIMPLE_UPLOAD_THRESHOLD: usize = 5 * 1024 * 1024  // 5 MB
CONST MULTIPART_UPLOAD_THRESHOLD: usize = 25 * 1024 * 1024  // 25 MB
```

### 2.5 Insert and Import Messages

```pseudocode
IMPL MessagesService FOR MessagesServiceImpl {
    ASYNC FUNCTION insert(
        self,
        user_id: &str,
        request: InsertMessageRequest,
    ) -> Result<Message, GmailError>
        validate_raw_message(&request.raw)?

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        // Build request
        builder <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::POST,
            format!("/gmail/v1/users/{}/messages", resolved_user_id),
        )

        IF let Some(source) = &request.internal_date_source THEN
            builder <- builder.query_param("internalDateSource", source.to_string())
        END IF

        IF let Some(deleted) = request.deleted THEN
            builder <- builder.query_param("deleted", deleted.to_string())
        END IF

        request_body <- InsertMessageBody {
            raw: request.raw,
            label_ids: request.label_ids,
            thread_id: request.thread_id,
        }

        api_request <- builder.json_body(&request_body)?.build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "messages".to_string()),
            ("gmail.operation".to_string(), "insert".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        self.executor.execute::<Message>(
            api_request,
            "gmail.messages.insert",
            span_attrs,
        ).await
    END FUNCTION

    ASYNC FUNCTION import(
        self,
        user_id: &str,
        request: ImportMessageRequest,
    ) -> Result<Message, GmailError>
        validate_raw_message(&request.raw)?

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        // Build request
        builder <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::POST,
            format!("/gmail/v1/users/{}/messages/import", resolved_user_id),
        )

        IF let Some(source) = &request.internal_date_source THEN
            builder <- builder.query_param("internalDateSource", source.to_string())
        END IF

        IF let Some(never_spam) = request.never_mark_spam THEN
            builder <- builder.query_param("neverMarkSpam", never_spam.to_string())
        END IF

        IF let Some(process_cal) = request.process_for_calendar THEN
            builder <- builder.query_param("processForCalendar", process_cal.to_string())
        END IF

        IF let Some(deleted) = request.deleted THEN
            builder <- builder.query_param("deleted", deleted.to_string())
        END IF

        request_body <- ImportMessageBody {
            raw: request.raw,
            label_ids: request.label_ids,
            thread_id: request.thread_id,
        }

        api_request <- builder.json_body(&request_body)?.build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "messages".to_string()),
            ("gmail.operation".to_string(), "import".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        self.executor.execute::<Message>(
            api_request,
            "gmail.messages.import",
            span_attrs,
        ).await
    END FUNCTION
}
```

### 2.6 Modify, Delete, Trash, Untrash

```pseudocode
IMPL MessagesService FOR MessagesServiceImpl {
    ASYNC FUNCTION modify(
        self,
        user_id: &str,
        message_id: &str,
        request: ModifyMessageRequest,
    ) -> Result<Message, GmailError>
        // Validate
        IF message_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Message ID cannot be empty".to_string()
            }))
        END IF

        IF request.add_label_ids.is_none() AND request.remove_label_ids.is_none() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "At least one of addLabelIds or removeLabelIds must be specified".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::POST,
            format!("/gmail/v1/users/{}/messages/{}/modify", resolved_user_id, message_id),
        )
        .json_body(&request)?
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "messages".to_string()),
            ("gmail.operation".to_string(), "modify".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.message_id".to_string(), message_id.to_string()),
        ])

        self.executor.execute::<Message>(
            api_request,
            "gmail.messages.modify",
            span_attrs,
        ).await
    END FUNCTION

    ASYNC FUNCTION delete(
        self,
        user_id: &str,
        message_id: &str,
    ) -> Result<(), GmailError>
        IF message_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Message ID cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        self.logger.warn("Permanently deleting message", {
            user_id: hash_user_id(&resolved_user_id),
            message_id: message_id,
        })

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::DELETE,
            format!("/gmail/v1/users/{}/messages/{}", resolved_user_id, message_id),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "messages".to_string()),
            ("gmail.operation".to_string(), "delete".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.message_id".to_string(), message_id.to_string()),
        ])

        // Execute and expect empty response
        self.executor.execute::<EmptyResponse>(
            api_request,
            "gmail.messages.delete",
            span_attrs,
        ).await?

        Ok(())
    END FUNCTION

    ASYNC FUNCTION trash(
        self,
        user_id: &str,
        message_id: &str,
    ) -> Result<Message, GmailError>
        IF message_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Message ID cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::POST,
            format!("/gmail/v1/users/{}/messages/{}/trash", resolved_user_id, message_id),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "messages".to_string()),
            ("gmail.operation".to_string(), "trash".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.message_id".to_string(), message_id.to_string()),
        ])

        self.executor.execute::<Message>(
            api_request,
            "gmail.messages.trash",
            span_attrs,
        ).await
    END FUNCTION

    ASYNC FUNCTION untrash(
        self,
        user_id: &str,
        message_id: &str,
    ) -> Result<Message, GmailError>
        IF message_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Message ID cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::POST,
            format!("/gmail/v1/users/{}/messages/{}/untrash", resolved_user_id, message_id),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "messages".to_string()),
            ("gmail.operation".to_string(), "untrash".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.message_id".to_string(), message_id.to_string()),
        ])

        self.executor.execute::<Message>(
            api_request,
            "gmail.messages.untrash",
            span_attrs,
        ).await
    END FUNCTION
}
```

### 2.7 Batch Operations

```pseudocode
IMPL MessagesService FOR MessagesServiceImpl {
    ASYNC FUNCTION batch_modify(
        self,
        user_id: &str,
        request: BatchModifyRequest,
    ) -> Result<(), GmailError>
        // Validate
        IF request.ids.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Message IDs cannot be empty".to_string()
            }))
        END IF

        IF request.ids.len() > MAX_BATCH_MODIFY_SIZE THEN
            RETURN Err(GmailError::Request(RequestError::ValidationError {
                message: format!(
                    "Batch size {} exceeds maximum {}",
                    request.ids.len(),
                    MAX_BATCH_MODIFY_SIZE
                )
            }))
        END IF

        IF request.add_label_ids.is_none() AND request.remove_label_ids.is_none() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "At least one of addLabelIds or removeLabelIds must be specified".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        self.logger.info("Batch modifying messages", {
            user_id: hash_user_id(&resolved_user_id),
            message_count: request.ids.len(),
        })

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::POST,
            format!("/gmail/v1/users/{}/messages/batchModify", resolved_user_id),
        )
        .json_body(&request)?
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "messages".to_string()),
            ("gmail.operation".to_string(), "batchModify".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.message_count".to_string(), request.ids.len().to_string()),
        ])

        self.executor.execute::<EmptyResponse>(
            api_request,
            "gmail.messages.batchModify",
            span_attrs,
        ).await?

        Ok(())
    END FUNCTION

    ASYNC FUNCTION batch_delete(
        self,
        user_id: &str,
        message_ids: Vec<String>,
    ) -> Result<(), GmailError>
        // Validate
        IF message_ids.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Message IDs cannot be empty".to_string()
            }))
        END IF

        IF message_ids.len() > MAX_BATCH_DELETE_SIZE THEN
            RETURN Err(GmailError::Request(RequestError::ValidationError {
                message: format!(
                    "Batch size {} exceeds maximum {}",
                    message_ids.len(),
                    MAX_BATCH_DELETE_SIZE
                )
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        self.logger.warn("Batch permanently deleting messages", {
            user_id: hash_user_id(&resolved_user_id),
            message_count: message_ids.len(),
        })

        request_body <- BatchDeleteRequest { ids: message_ids.clone() }

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::POST,
            format!("/gmail/v1/users/{}/messages/batchDelete", resolved_user_id),
        )
        .json_body(&request_body)?
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "messages".to_string()),
            ("gmail.operation".to_string(), "batchDelete".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.message_count".to_string(), message_ids.len().to_string()),
        ])

        self.executor.execute::<EmptyResponse>(
            api_request,
            "gmail.messages.batchDelete",
            span_attrs,
        ).await?

        Ok(())
    END FUNCTION
}

CONST MAX_BATCH_MODIFY_SIZE: usize = 1000
CONST MAX_BATCH_DELETE_SIZE: usize = 1000
```

---

## 3. Thread Service Implementation

### 3.1 Thread Service Structure

```pseudocode
STRUCT ThreadsServiceImpl {
    config: GmailConfig,
    executor: Arc<RequestExecutor>,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
}

IMPL ThreadsServiceImpl {
    FUNCTION new(
        config: GmailConfig,
        transport: Arc<dyn HttpTransport>,
        auth_provider: Arc<dyn AuthProvider>,
        retry_executor: Arc<RetryExecutor>,
        circuit_breaker: Arc<CircuitBreaker>,
        rate_limiter: Option<Arc<RateLimiter>>,
        logger: Arc<dyn Logger>,
        tracer: Arc<dyn Tracer>,
    ) -> Self
        executor <- Arc::new(RequestExecutor {
            transport: transport,
            auth_provider: auth_provider,
            retry_executor: retry_executor,
            circuit_breaker: circuit_breaker,
            rate_limiter: rate_limiter,
            response_parser: GmailResponseParser::new(logger.clone()),
            logger: logger.clone(),
            tracer: tracer.clone(),
        })

        Self {
            config: config,
            executor: executor,
            logger: logger,
            tracer: tracer,
        }
    END FUNCTION
}
```

### 3.2 List Threads

```pseudocode
IMPL ThreadsService FOR ThreadsServiceImpl {
    ASYNC FUNCTION list(
        self,
        user_id: &str,
        params: Option<ListThreadsParams>,
    ) -> Result<Paginated<ThreadRef>, GmailError>
        resolved_user_id <- resolve_user_id(user_id, &self.config)

        // Build request
        builder <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::GET,
            format!("/gmail/v1/users/{}/threads", resolved_user_id),
        )

        IF let Some(p) = &params THEN
            builder <- builder
                .query_param_opt("maxResults", p.max_results.map(|v| v.to_string()))
                .query_param_opt("pageToken", p.page_token.clone())
                .query_param_opt("q", p.q.clone())
                .query_param_opt("includeSpamTrash", p.include_spam_trash.map(|v| v.to_string()))

            IF let Some(label_ids) = &p.label_ids THEN
                FOR label_id IN label_ids DO
                    builder <- builder.query_param("labelIds", label_id)
                END FOR
            END IF
        END IF

        api_request <- builder.build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "threads".to_string()),
            ("gmail.operation".to_string(), "list".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        response <- self.executor.execute::<ListThreadsResponse>(
            api_request,
            "gmail.threads.list",
            span_attrs,
        ).await?

        Ok(Paginated {
            items: response.threads.unwrap_or_default(),
            next_page_token: response.next_page_token,
            result_size_estimate: response.result_size_estimate,
        })
    END FUNCTION

    FUNCTION list_all(
        self,
        user_id: &str,
        params: Option<ListThreadsParams>,
    ) -> impl Stream<Item = Result<ThreadRef, GmailError>> + Send
        let user_id = user_id.to_string()
        let params = params.unwrap_or_default()
        let this = self.clone()

        async_stream::stream! {
            let mut page_token: Option<String> = None

            LOOP
                list_params <- ListThreadsParams {
                    page_token: page_token.clone(),
                    ..params.clone()
                }

                MATCH this.list(&user_id, Some(list_params)).await {
                    Ok(page) => {
                        FOR thread_ref IN page.items DO
                            yield Ok(thread_ref)
                        END FOR

                        IF let Some(token) = page.next_page_token THEN
                            page_token = Some(token)
                        ELSE
                            BREAK
                        END IF
                    }
                    Err(e) => {
                        yield Err(e)
                        BREAK
                    }
                }
            END LOOP
        }
    END FUNCTION
}
```

### 3.3 Get Thread

```pseudocode
IMPL ThreadsService FOR ThreadsServiceImpl {
    ASYNC FUNCTION get(
        self,
        user_id: &str,
        thread_id: &str,
        format: Option<MessageFormat>,
    ) -> Result<Thread, GmailError>
        IF thread_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Thread ID cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        builder <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::GET,
            format!("/gmail/v1/users/{}/threads/{}", resolved_user_id, thread_id),
        )

        IF let Some(fmt) = format THEN
            format_str <- MATCH fmt {
                MessageFormat::Minimal => "minimal",
                MessageFormat::Full => "full",
                MessageFormat::Metadata => "metadata",
                MessageFormat::Raw => {
                    RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                        message: "Raw format is not supported for threads".to_string()
                    }))
                }
            }
            builder <- builder.query_param("format", format_str)
        END IF

        api_request <- builder.build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "threads".to_string()),
            ("gmail.operation".to_string(), "get".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.thread_id".to_string(), thread_id.to_string()),
        ])

        self.executor.execute::<Thread>(
            api_request,
            "gmail.threads.get",
            span_attrs,
        ).await
    END FUNCTION
}
```

### 3.4 Modify, Delete, Trash, Untrash Thread

```pseudocode
IMPL ThreadsService FOR ThreadsServiceImpl {
    ASYNC FUNCTION modify(
        self,
        user_id: &str,
        thread_id: &str,
        request: ModifyThreadRequest,
    ) -> Result<Thread, GmailError>
        IF thread_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Thread ID cannot be empty".to_string()
            }))
        END IF

        IF request.add_label_ids.is_none() AND request.remove_label_ids.is_none() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "At least one of addLabelIds or removeLabelIds must be specified".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::POST,
            format!("/gmail/v1/users/{}/threads/{}/modify", resolved_user_id, thread_id),
        )
        .json_body(&request)?
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "threads".to_string()),
            ("gmail.operation".to_string(), "modify".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.thread_id".to_string(), thread_id.to_string()),
        ])

        self.executor.execute::<Thread>(
            api_request,
            "gmail.threads.modify",
            span_attrs,
        ).await
    END FUNCTION

    ASYNC FUNCTION delete(
        self,
        user_id: &str,
        thread_id: &str,
    ) -> Result<(), GmailError>
        IF thread_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Thread ID cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        self.logger.warn("Permanently deleting thread", {
            user_id: hash_user_id(&resolved_user_id),
            thread_id: thread_id,
        })

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::DELETE,
            format!("/gmail/v1/users/{}/threads/{}", resolved_user_id, thread_id),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "threads".to_string()),
            ("gmail.operation".to_string(), "delete".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.thread_id".to_string(), thread_id.to_string()),
        ])

        self.executor.execute::<EmptyResponse>(
            api_request,
            "gmail.threads.delete",
            span_attrs,
        ).await?

        Ok(())
    END FUNCTION

    ASYNC FUNCTION trash(
        self,
        user_id: &str,
        thread_id: &str,
    ) -> Result<Thread, GmailError>
        IF thread_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Thread ID cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::POST,
            format!("/gmail/v1/users/{}/threads/{}/trash", resolved_user_id, thread_id),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "threads".to_string()),
            ("gmail.operation".to_string(), "trash".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.thread_id".to_string(), thread_id.to_string()),
        ])

        self.executor.execute::<Thread>(
            api_request,
            "gmail.threads.trash",
            span_attrs,
        ).await
    END FUNCTION

    ASYNC FUNCTION untrash(
        self,
        user_id: &str,
        thread_id: &str,
    ) -> Result<Thread, GmailError>
        IF thread_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Thread ID cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::POST,
            format!("/gmail/v1/users/{}/threads/{}/untrash", resolved_user_id, thread_id),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "threads".to_string()),
            ("gmail.operation".to_string(), "untrash".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.thread_id".to_string(), thread_id.to_string()),
        ])

        self.executor.execute::<Thread>(
            api_request,
            "gmail.threads.untrash",
            span_attrs,
        ).await
    END FUNCTION
}
```

---

## 4. MIME Message Construction

### 4.1 MIME Builder Interface

```pseudocode
STRUCT MimeBuilderImpl {
    // No state needed
}

IMPL MimeBuilderImpl {
    FUNCTION new() -> Self
        Self {}
    END FUNCTION
}

IMPL MimeBuilder FOR MimeBuilderImpl {
    FUNCTION simple(
        from: &str,
        to: &[&str],
        subject: &str,
        body: &str,
    ) -> Result<MimeMessage, MimeError>
        // Validate inputs
        validate_email_address(from)?
        FOR recipient IN to DO
            validate_email_address(recipient)?
        END FOR

        // Generate Message-ID
        message_id <- generate_message_id(from)

        // Build RFC 2822 message
        raw <- build_simple_message(from, to, subject, body, &message_id)?

        Ok(MimeMessage {
            raw: raw,
            thread_id: None,
            message_id: message_id,
        })
    END FUNCTION

    FUNCTION html(
        from: &str,
        to: &[&str],
        subject: &str,
        html_body: &str,
        text_body: Option<&str>,
    ) -> Result<MimeMessage, MimeError>
        validate_email_address(from)?
        FOR recipient IN to DO
            validate_email_address(recipient)?
        END FOR

        message_id <- generate_message_id(from)

        // Build multipart/alternative message
        raw <- build_html_message(from, to, subject, html_body, text_body, &message_id)?

        Ok(MimeMessage {
            raw: raw,
            thread_id: None,
            message_id: message_id,
        })
    END FUNCTION

    FUNCTION with_attachments(
        from: &str,
        to: &[&str],
        subject: &str,
        body: &str,
        attachments: Vec<MimeAttachment>,
    ) -> Result<MimeMessage, MimeError>
        validate_email_address(from)?
        FOR recipient IN to DO
            validate_email_address(recipient)?
        END FOR

        // Validate attachments
        FOR attachment IN &attachments DO
            validate_attachment(attachment)?
        END FOR

        message_id <- generate_message_id(from)

        // Build multipart/mixed message
        raw <- build_message_with_attachments(from, to, subject, body, &attachments, &message_id)?

        Ok(MimeMessage {
            raw: raw,
            thread_id: None,
            message_id: message_id,
        })
    END FUNCTION

    FUNCTION reply(
        original: &Message,
        from: &str,
        body: &str,
        reply_all: bool,
    ) -> Result<MimeMessage, MimeError>
        validate_email_address(from)?

        // Extract original headers
        original_from <- extract_header(&original.payload, "From")?
        original_to <- extract_header(&original.payload, "To")?
        original_subject <- extract_header(&original.payload, "Subject")?
        original_message_id <- extract_header(&original.payload, "Message-ID")?
        original_references <- extract_header(&original.payload, "References").ok()

        // Determine recipients
        recipients <- IF reply_all THEN
            // Include original sender and all recipients, excluding self
            let mut all = vec![original_from.clone()]
            all.extend(parse_address_list(&original_to))
            all.into_iter()
                .filter(|addr| addr != from)
                .collect::<Vec<_>>()
        ELSE
            vec![original_from.clone()]
        END IF

        // Build subject (add Re: if not present)
        subject <- IF original_subject.starts_with("Re:") OR original_subject.starts_with("RE:") THEN
            original_subject
        ELSE
            format!("Re: {}", original_subject)
        END IF

        // Build References header
        references <- IF let Some(refs) = original_references THEN
            format!("{} {}", refs, original_message_id)
        ELSE
            original_message_id.clone()
        END IF

        message_id <- generate_message_id(from)

        // Build reply message
        raw <- build_reply_message(
            from,
            &recipients,
            &subject,
            body,
            &original_message_id,
            &references,
            &message_id,
        )?

        Ok(MimeMessage {
            raw: raw,
            thread_id: Some(original.thread_id.clone()),
            message_id: message_id,
        })
    END FUNCTION

    FUNCTION forward(
        original: &Message,
        from: &str,
        to: &[&str],
        body: &str,
    ) -> Result<MimeMessage, MimeError>
        validate_email_address(from)?
        FOR recipient IN to DO
            validate_email_address(recipient)?
        END FOR

        // Extract original data
        original_subject <- extract_header(&original.payload, "Subject")?
        original_from <- extract_header(&original.payload, "From")?
        original_date <- extract_header(&original.payload, "Date")?
        original_body <- extract_body(&original.payload)?

        // Build forward subject
        subject <- IF original_subject.starts_with("Fwd:") OR original_subject.starts_with("FWD:") THEN
            original_subject
        ELSE
            format!("Fwd: {}", original_subject)
        END IF

        // Build forward body with original message
        forward_body <- format!(
            "{}\n\n---------- Forwarded message ----------\nFrom: {}\nDate: {}\nSubject: {}\n\n{}",
            body,
            original_from,
            original_date,
            original_subject,
            original_body
        )

        message_id <- generate_message_id(from)

        raw <- build_simple_message(from, to, &subject, &forward_body, &message_id)?

        Ok(MimeMessage {
            raw: raw,
            thread_id: None,  // Forwards start new threads
            message_id: message_id,
        })
    END FUNCTION
}
```

### 4.2 MIME Building Helpers

```pseudocode
FUNCTION build_simple_message(
    from: &str,
    to: &[&str],
    subject: &str,
    body: &str,
    message_id: &str,
) -> Result<Vec<u8>, MimeError>
    // Build headers
    headers <- format!(
        "From: {}\r\n\
         To: {}\r\n\
         Subject: {}\r\n\
         Message-ID: {}\r\n\
         Date: {}\r\n\
         MIME-Version: 1.0\r\n\
         Content-Type: text/plain; charset=UTF-8\r\n\
         Content-Transfer-Encoding: base64\r\n\
         \r\n",
        encode_header_value(from),
        to.iter().map(|t| encode_header_value(t)).collect::<Vec<_>>().join(", "),
        encode_subject(subject),
        message_id,
        format_rfc2822_date(Utc::now()),
    )

    // Encode body as base64
    encoded_body <- base64::encode(body.as_bytes())
        .chars()
        .collect::<Vec<_>>()
        .chunks(76)
        .map(|c| c.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join("\r\n")

    Ok(format!("{}{}", headers, encoded_body).into_bytes())
END FUNCTION

FUNCTION build_html_message(
    from: &str,
    to: &[&str],
    subject: &str,
    html_body: &str,
    text_body: Option<&str>,
    message_id: &str,
) -> Result<Vec<u8>, MimeError>
    boundary <- generate_boundary()

    // Generate text body if not provided
    plain_text <- text_body.unwrap_or_else(|| {
        strip_html_tags(html_body)
    })

    // Build headers
    headers <- format!(
        "From: {}\r\n\
         To: {}\r\n\
         Subject: {}\r\n\
         Message-ID: {}\r\n\
         Date: {}\r\n\
         MIME-Version: 1.0\r\n\
         Content-Type: multipart/alternative; boundary=\"{}\"\r\n\
         \r\n",
        encode_header_value(from),
        to.iter().map(|t| encode_header_value(t)).collect::<Vec<_>>().join(", "),
        encode_subject(subject),
        message_id,
        format_rfc2822_date(Utc::now()),
        boundary,
    )

    // Build text part
    text_part <- format!(
        "--{}\r\n\
         Content-Type: text/plain; charset=UTF-8\r\n\
         Content-Transfer-Encoding: base64\r\n\
         \r\n\
         {}\r\n",
        boundary,
        base64_encode_wrapped(plain_text.as_bytes()),
    )

    // Build HTML part
    html_part <- format!(
        "--{}\r\n\
         Content-Type: text/html; charset=UTF-8\r\n\
         Content-Transfer-Encoding: base64\r\n\
         \r\n\
         {}\r\n",
        boundary,
        base64_encode_wrapped(html_body.as_bytes()),
    )

    // Closing boundary
    closing <- format!("--{}--\r\n", boundary)

    Ok(format!("{}{}{}{}", headers, text_part, html_part, closing).into_bytes())
END FUNCTION

FUNCTION build_message_with_attachments(
    from: &str,
    to: &[&str],
    subject: &str,
    body: &str,
    attachments: &[MimeAttachment],
    message_id: &str,
) -> Result<Vec<u8>, MimeError>
    boundary <- generate_boundary()

    // Build headers
    headers <- format!(
        "From: {}\r\n\
         To: {}\r\n\
         Subject: {}\r\n\
         Message-ID: {}\r\n\
         Date: {}\r\n\
         MIME-Version: 1.0\r\n\
         Content-Type: multipart/mixed; boundary=\"{}\"\r\n\
         \r\n",
        encode_header_value(from),
        to.iter().map(|t| encode_header_value(t)).collect::<Vec<_>>().join(", "),
        encode_subject(subject),
        message_id,
        format_rfc2822_date(Utc::now()),
        boundary,
    )

    // Build text body part
    body_part <- format!(
        "--{}\r\n\
         Content-Type: text/plain; charset=UTF-8\r\n\
         Content-Transfer-Encoding: base64\r\n\
         \r\n\
         {}\r\n",
        boundary,
        base64_encode_wrapped(body.as_bytes()),
    )

    // Build attachment parts
    attachment_parts <- String::new()
    FOR attachment IN attachments DO
        // Determine Content-Disposition
        disposition <- IF attachment.content_id.is_some() THEN
            format!("inline; filename=\"{}\"", encode_filename(&attachment.filename))
        ELSE
            format!("attachment; filename=\"{}\"", encode_filename(&attachment.filename))
        END IF

        part <- format!(
            "--{}\r\n\
             Content-Type: {}; name=\"{}\"\r\n\
             Content-Transfer-Encoding: base64\r\n\
             Content-Disposition: {}\r\n",
            boundary,
            attachment.content_type,
            encode_filename(&attachment.filename),
            disposition,
        )

        // Add Content-ID if present (for inline attachments)
        IF let Some(cid) = &attachment.content_id THEN
            part <- format!("{}Content-ID: <{}>\r\n", part, cid)
        END IF

        part <- format!("{}\r\n{}\r\n", part, base64_encode_wrapped(&attachment.data))
        attachment_parts.push_str(&part)
    END FOR

    // Closing boundary
    closing <- format!("--{}--\r\n", boundary)

    Ok(format!("{}{}{}{}", headers, body_part, attachment_parts, closing).into_bytes())
END FUNCTION

FUNCTION build_reply_message(
    from: &str,
    to: &[String],
    subject: &str,
    body: &str,
    in_reply_to: &str,
    references: &str,
    message_id: &str,
) -> Result<Vec<u8>, MimeError>
    // Build headers with reply-specific headers
    headers <- format!(
        "From: {}\r\n\
         To: {}\r\n\
         Subject: {}\r\n\
         Message-ID: {}\r\n\
         Date: {}\r\n\
         In-Reply-To: {}\r\n\
         References: {}\r\n\
         MIME-Version: 1.0\r\n\
         Content-Type: text/plain; charset=UTF-8\r\n\
         Content-Transfer-Encoding: base64\r\n\
         \r\n",
        encode_header_value(from),
        to.iter().map(|t| encode_header_value(t)).collect::<Vec<_>>().join(", "),
        encode_subject(subject),
        message_id,
        format_rfc2822_date(Utc::now()),
        in_reply_to,
        references,
    )

    encoded_body <- base64_encode_wrapped(body.as_bytes())

    Ok(format!("{}{}", headers, encoded_body).into_bytes())
END FUNCTION
```

### 4.3 Header Encoding

```pseudocode
FUNCTION encode_subject(subject: &str) -> String
    // Check if encoding is needed (non-ASCII characters)
    IF subject.is_ascii() AND NOT subject.contains('\r') AND NOT subject.contains('\n') THEN
        RETURN subject.to_string()
    END IF

    // Use RFC 2047 encoded-word (Q encoding)
    encode_rfc2047(subject)
END FUNCTION

FUNCTION encode_rfc2047(text: &str) -> String
    // Encode as UTF-8 Base64
    encoded <- base64::encode(text.as_bytes())

    // Split into chunks of 63 characters (75 - overhead)
    chunks <- encoded
        .chars()
        .collect::<Vec<_>>()
        .chunks(63)
        .map(|c| c.iter().collect::<String>())
        .collect::<Vec<_>>()

    // Build encoded-words
    chunks
        .iter()
        .map(|chunk| format!("=?UTF-8?B?{}?=", chunk))
        .collect::<Vec<_>>()
        .join("\r\n ")  // Folding with continuation
END FUNCTION

FUNCTION encode_header_value(value: &str) -> String
    IF value.is_ascii() THEN
        value.to_string()
    ELSE
        encode_rfc2047(value)
    END IF
END FUNCTION

FUNCTION encode_filename(filename: &str) -> String
    // RFC 2231 encoding for filenames
    IF filename.is_ascii() THEN
        filename.to_string()
    ELSE
        // Use percent-encoding for non-ASCII
        format!("UTF-8''{}", percent_encode(filename))
    END IF
END FUNCTION
```

---

## 5. Base64url Encoding

### 5.1 Base64url Utilities

```pseudocode
FUNCTION base64url_encode(data: &[u8]) -> String
    // Gmail API uses URL-safe Base64 without padding
    base64::encode_config(data, base64::URL_SAFE_NO_PAD)
END FUNCTION

FUNCTION base64url_decode(encoded: &str) -> Result<Vec<u8>, MimeError>
    base64::decode_config(encoded, base64::URL_SAFE_NO_PAD)
        .or_else(|_| {
            // Try with padding
            base64::decode_config(encoded, base64::URL_SAFE)
        })
        .map_err(|e| MimeError::EncodingError {
            message: format!("Invalid base64url encoding: {}", e)
        })
END FUNCTION

FUNCTION base64_encode_wrapped(data: &[u8]) -> String
    // Standard Base64 encoding with line wrapping at 76 characters
    encoded <- base64::encode(data)

    encoded
        .chars()
        .collect::<Vec<_>>()
        .chunks(76)
        .map(|c| c.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join("\r\n")
END FUNCTION

FUNCTION is_valid_base64url(s: &str) -> bool
    // Check for valid base64url characters
    s.chars().all(|c| {
        c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '='
    })
END FUNCTION

FUNCTION estimate_decoded_size(base64_encoded: &str) -> usize
    // Base64 encoding increases size by ~33%
    // So decoded size is approximately 75% of encoded size
    (base64_encoded.len() * 3) / 4
END FUNCTION
```

### 5.2 Message Encoding for API

```pseudocode
FUNCTION encode_message_for_api(raw_message: &[u8]) -> String
    // Gmail API requires base64url encoding for raw messages
    base64url_encode(raw_message)
END FUNCTION

FUNCTION decode_message_from_api(encoded: &str) -> Result<Vec<u8>, MimeError>
    base64url_decode(encoded)
END FUNCTION

// Create send request from MimeMessage
FUNCTION create_send_request(mime_message: MimeMessage) -> SendMessageRequest
    SendMessageRequest {
        raw: base64url_encode(&mime_message.raw),
        thread_id: mime_message.thread_id,
    }
END FUNCTION
```

---

## 6. Pagination Handling

### 6.1 Paginated Response Types

```pseudocode
STRUCT ListMessagesResponse {
    messages: Option<Vec<MessageRef>>,
    next_page_token: Option<String>,
    result_size_estimate: Option<u64>,
}

STRUCT ListThreadsResponse {
    threads: Option<Vec<ThreadRef>>,
    next_page_token: Option<String>,
    result_size_estimate: Option<u64>,
}

STRUCT Paginated<T> {
    items: Vec<T>,
    next_page_token: Option<String>,
    result_size_estimate: Option<u64>,
}

IMPL<T> Paginated<T> {
    FUNCTION has_next(self) -> bool
        self.next_page_token.is_some()
    END FUNCTION

    FUNCTION is_empty(self) -> bool
        self.items.is_empty()
    END FUNCTION
}
```

### 6.2 Page Iterator

```pseudocode
STRUCT PageIterator<T, F>
    WHERE F: Fn(Option<String>) -> Future<Output = Result<Paginated<T>, GmailError>>
{
    fetch_page: F,
    current_page_token: Option<String>,
    exhausted: bool,
}

IMPL<T, F> PageIterator<T, F>
    WHERE F: Fn(Option<String>) -> Future<Output = Result<Paginated<T>, GmailError>>
{
    FUNCTION new(fetch_page: F) -> Self
        Self {
            fetch_page: fetch_page,
            current_page_token: None,
            exhausted: false,
        }
    END FUNCTION

    ASYNC FUNCTION next_page(mut self) -> Option<Result<Vec<T>, GmailError>>
        IF self.exhausted THEN
            RETURN None
        END IF

        MATCH (self.fetch_page)(self.current_page_token.clone()).await {
            Ok(page) => {
                self.current_page_token = page.next_page_token.clone()
                IF page.next_page_token.is_none() THEN
                    self.exhausted = true
                END IF
                Some(Ok(page.items))
            }
            Err(e) => {
                self.exhausted = true
                Some(Err(e))
            }
        }
    END FUNCTION

    ASYNC FUNCTION collect_all(mut self) -> Result<Vec<T>, GmailError>
        collected <- Vec::new()

        WHILE let Some(result) = self.next_page().await DO
            items <- result?
            collected.extend(items)
        END WHILE

        Ok(collected)
    END FUNCTION
}

// AsyncIterator implementation
IMPL<T, F> Stream FOR PageIterator<T, F>
    WHERE
        T: Send,
        F: Fn(Option<String>) -> Future<Output = Result<Paginated<T>, GmailError>> + Send
{
    type Item = Result<T, GmailError>

    FUNCTION poll_next(mut self, cx: &mut Context) -> Poll<Option<Self::Item>>
        // Implementation using internal buffering
        // Returns items one at a time from pages
    END FUNCTION
}
```

---

## 7. Batch Operations

### 7.1 Batch Request Building

```pseudocode
STRUCT BatchRequest {
    requests: Vec<HttpRequest>,
    boundary: String,
}

FUNCTION build_batch_body(requests: &[HttpRequest], boundary: &str) -> Result<Vec<u8>, GmailError>
    body <- String::new()

    FOR (index, request) IN requests.iter().enumerate() DO
        // Part boundary
        body.push_str(&format!("--{}\r\n", boundary))

        // Content-Type header
        body.push_str("Content-Type: application/http\r\n")

        // Content-ID for correlating responses
        body.push_str(&format!("Content-ID: <request-{}>\r\n", index))
        body.push_str("\r\n")

        // HTTP request line
        path_and_query <- request.url.path()
        IF let Some(query) = request.url.query() THEN
            path_and_query <- format!("{}?{}", path_and_query, query)
        END IF

        body.push_str(&format!("{} {} HTTP/1.1\r\n", request.method, path_and_query))

        // Request headers (excluding Authorization which is on outer request)
        FOR (name, value) IN request.headers.iter() DO
            IF name.as_str() != "authorization" THEN
                body.push_str(&format!("{}: {}\r\n", name, value.to_str()?))
            END IF
        END FOR

        // Request body
        IF let Some(request_body) = &request.body THEN
            MATCH request_body {
                RequestBody::Json(json) => {
                    json_str <- serde_json::to_string(json)?
                    body.push_str(&format!("Content-Length: {}\r\n", json_str.len()))
                    body.push_str("Content-Type: application/json\r\n")
                    body.push_str("\r\n")
                    body.push_str(&json_str)
                }
                RequestBody::Bytes(bytes) => {
                    body.push_str(&format!("Content-Length: {}\r\n", bytes.len()))
                    body.push_str("\r\n")
                    body.push_str(&String::from_utf8_lossy(bytes))
                }
                _ => {
                    RETURN Err(GmailError::Request(RequestError::ValidationError {
                        message: "Unsupported body type for batch request".to_string()
                    }))
                }
            }
        ELSE
            body.push_str("\r\n")
        END IF

        body.push_str("\r\n")
    END FOR

    // Closing boundary
    body.push_str(&format!("--{}--\r\n", boundary))

    Ok(body.into_bytes())
END FUNCTION
```

### 7.2 Batch Response Parsing

```pseudocode
STRUCT BatchResponse<T> {
    index: usize,
    content_id: String,
    status: StatusCode,
    headers: HeaderMap,
    body: Option<T>,
    error: Option<GmailError>,
}

FUNCTION parse_batch_response_body(
    body: &[u8],
    boundary: &str,
) -> Result<Vec<HttpResponse>, TransportError>
    body_str <- String::from_utf8_lossy(body)

    // Split by boundary
    parts <- body_str.split(&format!("--{}", boundary))
        .filter(|p| !p.is_empty() && !p.starts_with("--"))
        .collect::<Vec<_>>()

    responses <- Vec::new()

    FOR part IN parts DO
        // Skip if closing boundary
        IF part.trim() == "--" OR part.trim().is_empty() THEN
            CONTINUE
        END IF

        // Parse part headers and body
        response <- parse_batch_part(part)?
        responses.push(response)
    END FOR

    Ok(responses)
END FUNCTION

FUNCTION parse_batch_part(part: &str) -> Result<HttpResponse, TransportError>
    // Split headers from body
    parts <- part.splitn(2, "\r\n\r\n").collect::<Vec<_>>()

    IF parts.len() < 2 THEN
        RETURN Err(TransportError::Other {
            reason: "Invalid batch response part".to_string()
        })
    END IF

    outer_headers <- parts[0]
    inner_response <- parts[1]

    // The inner response is itself an HTTP response
    // Parse the status line and headers
    inner_parts <- inner_response.splitn(2, "\r\n\r\n").collect::<Vec<_>>()

    status_and_headers <- inner_parts[0]
    response_body <- IF inner_parts.len() > 1 THEN
        inner_parts[1].as_bytes().to_vec()
    ELSE
        Vec::new()
    END IF

    // Parse status line
    lines <- status_and_headers.lines().collect::<Vec<_>>()
    IF lines.is_empty() THEN
        RETURN Err(TransportError::Other {
            reason: "Missing status line in batch response".to_string()
        })
    END IF

    status_line <- lines[0]
    // Status line format: "HTTP/1.1 200 OK"
    status_parts <- status_line.splitn(3, ' ').collect::<Vec<_>>()
    IF status_parts.len() < 2 THEN
        RETURN Err(TransportError::Other {
            reason: "Invalid status line".to_string()
        })
    END IF

    status_code <- status_parts[1].parse::<u16>()
        .map_err(|_| TransportError::Other {
            reason: "Invalid status code".to_string()
        })?

    // Parse headers
    headers <- HeaderMap::new()
    FOR line IN lines[1..].iter() DO
        IF line.is_empty() THEN
            BREAK
        END IF
        header_parts <- line.splitn(2, ": ").collect::<Vec<_>>()
        IF header_parts.len() == 2 THEN
            headers.insert(
                header_parts[0].parse()?,
                header_parts[1].parse()?,
            )
        END IF
    END FOR

    Ok(HttpResponse {
        status: StatusCode::from_u16(status_code)?,
        headers: headers,
        body: Bytes::from(response_body),
    })
END FUNCTION
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode - Part 2 |

---

**End of Part 2**

*Part 3 will cover Labels, Drafts, History, and Attachments service implementations.*
