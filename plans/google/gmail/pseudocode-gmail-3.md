# Google Gmail Integration Module - Pseudocode (Part 3)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/google-gmail`
**Part:** 3 of 4 - Labels, Drafts, History, Attachments & Settings

---

## Table of Contents

1. [Overview](#1-overview)
2. [Labels Service Implementation](#2-labels-service-implementation)
3. [Drafts Service Implementation](#3-drafts-service-implementation)
4. [History Service Implementation](#4-history-service-implementation)
5. [Attachments Service Implementation](#5-attachments-service-implementation)
6. [Settings Service Implementation](#6-settings-service-implementation)

---

## 1. Overview

### 1.1 Document Purpose

This pseudocode document provides detailed algorithmic descriptions for implementing Labels, Drafts, History, Attachments, and Settings services in the Google Gmail Integration Module.

### 1.2 Part Overview

This is Part 3 of 4, covering:
- Labels service implementation (CRUD operations for labels)
- Drafts service implementation (CRUD and send operations)
- History service implementation (mailbox synchronization)
- Attachments service implementation (download and streaming)
- Settings service implementation (filters, forwarding, vacation, etc.)

---

## 2. Labels Service Implementation

### 2.1 Labels Service Structure

```pseudocode
STRUCT LabelsServiceImpl {
    config: GmailConfig,
    executor: Arc<RequestExecutor>,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,

    // Cache for system labels (immutable)
    system_labels_cache: OnceCell<Vec<Label>>,
}

IMPL LabelsServiceImpl {
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
            system_labels_cache: OnceCell::new(),
        }
    END FUNCTION
}

// System label constants
CONST SYSTEM_LABELS: [(&str, &str); 13] = [
    ("INBOX", "Inbox"),
    ("SENT", "Sent"),
    ("DRAFT", "Drafts"),
    ("TRASH", "Trash"),
    ("SPAM", "Spam"),
    ("STARRED", "Starred"),
    ("IMPORTANT", "Important"),
    ("UNREAD", "Unread"),
    ("CATEGORY_PERSONAL", "Personal"),
    ("CATEGORY_SOCIAL", "Social"),
    ("CATEGORY_PROMOTIONS", "Promotions"),
    ("CATEGORY_UPDATES", "Updates"),
    ("CATEGORY_FORUMS", "Forums"),
]
```

### 2.2 List Labels

```pseudocode
IMPL LabelsService FOR LabelsServiceImpl {
    ASYNC FUNCTION list(
        self,
        user_id: &str,
    ) -> Result<Vec<Label>, GmailError>
        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::GET,
            format!("/gmail/v1/users/{}/labels", resolved_user_id),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "labels".to_string()),
            ("gmail.operation".to_string(), "list".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        response <- self.executor.execute::<ListLabelsResponse>(
            api_request,
            "gmail.labels.list",
            span_attrs,
        ).await?

        Ok(response.labels.unwrap_or_default())
    END FUNCTION
}
```

### 2.3 Get Label

```pseudocode
IMPL LabelsService FOR LabelsServiceImpl {
    ASYNC FUNCTION get(
        self,
        user_id: &str,
        label_id: &str,
    ) -> Result<Label, GmailError>
        // Validate label ID
        IF label_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Label ID cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::GET,
            format!("/gmail/v1/users/{}/labels/{}", resolved_user_id, label_id),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "labels".to_string()),
            ("gmail.operation".to_string(), "get".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.label_id".to_string(), label_id.to_string()),
        ])

        self.executor.execute::<Label>(
            api_request,
            "gmail.labels.get",
            span_attrs,
        ).await
    END FUNCTION
}
```

### 2.4 Create Label

```pseudocode
IMPL LabelsService FOR LabelsServiceImpl {
    ASYNC FUNCTION create(
        self,
        user_id: &str,
        request: CreateLabelRequest,
    ) -> Result<Label, GmailError>
        // Validate label name
        validate_label_name(&request.name)?

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        // Build request body
        request_body <- CreateLabelBody {
            name: request.name,
            message_list_visibility: request.message_list_visibility,
            label_list_visibility: request.label_list_visibility,
            color: request.color,
        }

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::POST,
            format!("/gmail/v1/users/{}/labels", resolved_user_id),
        )
        .json_body(&request_body)?
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "labels".to_string()),
            ("gmail.operation".to_string(), "create".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.label_name".to_string(), request_body.name.clone()),
        ])

        result <- self.executor.execute::<Label>(
            api_request,
            "gmail.labels.create",
            span_attrs,
        ).await?

        self.logger.info("Label created", {
            label_id: result.id,
            label_name: result.name,
        })

        Ok(result)
    END FUNCTION
}

FUNCTION validate_label_name(name: &str) -> Result<(), GmailError>
    IF name.is_empty() THEN
        RETURN Err(GmailError::Request(RequestError::InvalidParameter {
            message: "Label name cannot be empty".to_string()
        }))
    END IF

    IF name.len() > 225 THEN
        RETURN Err(GmailError::Request(RequestError::InvalidParameter {
            message: "Label name cannot exceed 225 characters".to_string()
        }))
    END IF

    // Check for reserved names
    reserved_names <- ["INBOX", "SENT", "DRAFT", "TRASH", "SPAM", "STARRED", "IMPORTANT", "UNREAD"]
    IF reserved_names.contains(&name.to_uppercase().as_str()) THEN
        RETURN Err(GmailError::Request(RequestError::InvalidParameter {
            message: format!("Cannot create label with reserved name: {}", name)
        }))
    END IF

    // Check for invalid characters
    IF name.contains('/') AND name.starts_with('/') THEN
        RETURN Err(GmailError::Request(RequestError::InvalidParameter {
            message: "Label name cannot start with '/'".to_string()
        }))
    END IF

    Ok(())
END FUNCTION
```

### 2.5 Update and Patch Label

```pseudocode
IMPL LabelsService FOR LabelsServiceImpl {
    ASYNC FUNCTION update(
        self,
        user_id: &str,
        label_id: &str,
        request: UpdateLabelRequest,
    ) -> Result<Label, GmailError>
        // Validate inputs
        IF label_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Label ID cannot be empty".to_string()
            }))
        END IF

        // Cannot update system labels
        IF is_system_label(label_id) THEN
            RETURN Err(GmailError::Request(RequestError::ValidationError {
                message: "Cannot update system labels".to_string()
            }))
        END IF

        validate_label_name(&request.name)?

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        // Full update requires all fields
        request_body <- UpdateLabelBody {
            id: label_id.to_string(),
            name: request.name,
            message_list_visibility: request.message_list_visibility,
            label_list_visibility: request.label_list_visibility,
            color: request.color,
        }

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::PUT,
            format!("/gmail/v1/users/{}/labels/{}", resolved_user_id, label_id),
        )
        .json_body(&request_body)?
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "labels".to_string()),
            ("gmail.operation".to_string(), "update".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.label_id".to_string(), label_id.to_string()),
        ])

        self.executor.execute::<Label>(
            api_request,
            "gmail.labels.update",
            span_attrs,
        ).await
    END FUNCTION

    ASYNC FUNCTION patch(
        self,
        user_id: &str,
        label_id: &str,
        request: PatchLabelRequest,
    ) -> Result<Label, GmailError>
        IF label_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Label ID cannot be empty".to_string()
            }))
        END IF

        IF is_system_label(label_id) THEN
            RETURN Err(GmailError::Request(RequestError::ValidationError {
                message: "Cannot patch system labels".to_string()
            }))
        END IF

        IF let Some(ref name) = request.name THEN
            validate_label_name(name)?
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        // Partial update - only include provided fields
        request_body <- PatchLabelBody {
            name: request.name,
            message_list_visibility: request.message_list_visibility,
            label_list_visibility: request.label_list_visibility,
            color: request.color,
        }

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::PATCH,
            format!("/gmail/v1/users/{}/labels/{}", resolved_user_id, label_id),
        )
        .json_body(&request_body)?
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "labels".to_string()),
            ("gmail.operation".to_string(), "patch".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.label_id".to_string(), label_id.to_string()),
        ])

        self.executor.execute::<Label>(
            api_request,
            "gmail.labels.patch",
            span_attrs,
        ).await
    END FUNCTION
}

FUNCTION is_system_label(label_id: &str) -> bool
    SYSTEM_LABELS.iter().any(|(id, _)| *id == label_id)
        OR label_id.starts_with("CATEGORY_")
END FUNCTION
```

### 2.6 Delete Label

```pseudocode
IMPL LabelsService FOR LabelsServiceImpl {
    ASYNC FUNCTION delete(
        self,
        user_id: &str,
        label_id: &str,
    ) -> Result<(), GmailError>
        IF label_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Label ID cannot be empty".to_string()
            }))
        END IF

        // Cannot delete system labels
        IF is_system_label(label_id) THEN
            RETURN Err(GmailError::Request(RequestError::ValidationError {
                message: "Cannot delete system labels".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        self.logger.info("Deleting label", {
            user_id: hash_user_id(&resolved_user_id),
            label_id: label_id,
        })

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::DELETE,
            format!("/gmail/v1/users/{}/labels/{}", resolved_user_id, label_id),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "labels".to_string()),
            ("gmail.operation".to_string(), "delete".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.label_id".to_string(), label_id.to_string()),
        ])

        self.executor.execute::<EmptyResponse>(
            api_request,
            "gmail.labels.delete",
            span_attrs,
        ).await?

        Ok(())
    END FUNCTION
}
```

---

## 3. Drafts Service Implementation

### 3.1 Drafts Service Structure

```pseudocode
STRUCT DraftsServiceImpl {
    config: GmailConfig,
    executor: Arc<RequestExecutor>,
    mime_builder: Arc<MimeBuilder>,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
}

IMPL DraftsServiceImpl {
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

### 3.2 List Drafts

```pseudocode
IMPL DraftsService FOR DraftsServiceImpl {
    ASYNC FUNCTION list(
        self,
        user_id: &str,
        params: Option<ListDraftsParams>,
    ) -> Result<Paginated<DraftRef>, GmailError>
        resolved_user_id <- resolve_user_id(user_id, &self.config)

        builder <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::GET,
            format!("/gmail/v1/users/{}/drafts", resolved_user_id),
        )

        IF let Some(p) = &params THEN
            builder <- builder
                .query_param_opt("maxResults", p.max_results.map(|v| v.to_string()))
                .query_param_opt("pageToken", p.page_token.clone())
                .query_param_opt("q", p.q.clone())
                .query_param_opt("includeSpamTrash", p.include_spam_trash.map(|v| v.to_string()))
        END IF

        api_request <- builder.build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "drafts".to_string()),
            ("gmail.operation".to_string(), "list".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        response <- self.executor.execute::<ListDraftsResponse>(
            api_request,
            "gmail.drafts.list",
            span_attrs,
        ).await?

        Ok(Paginated {
            items: response.drafts.unwrap_or_default(),
            next_page_token: response.next_page_token,
            result_size_estimate: response.result_size_estimate,
        })
    END FUNCTION
}
```

### 3.3 Get Draft

```pseudocode
IMPL DraftsService FOR DraftsServiceImpl {
    ASYNC FUNCTION get(
        self,
        user_id: &str,
        draft_id: &str,
        format: Option<MessageFormat>,
    ) -> Result<Draft, GmailError>
        IF draft_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Draft ID cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        builder <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::GET,
            format!("/gmail/v1/users/{}/drafts/{}", resolved_user_id, draft_id),
        )

        IF let Some(fmt) = format THEN
            format_str <- MATCH fmt {
                MessageFormat::Minimal => "minimal",
                MessageFormat::Full => "full",
                MessageFormat::Raw => "raw",
                MessageFormat::Metadata => "metadata",
            }
            builder <- builder.query_param("format", format_str)
        END IF

        api_request <- builder.build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "drafts".to_string()),
            ("gmail.operation".to_string(), "get".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.draft_id".to_string(), draft_id.to_string()),
        ])

        self.executor.execute::<Draft>(
            api_request,
            "gmail.drafts.get",
            span_attrs,
        ).await
    END FUNCTION
}
```

### 3.4 Create Draft

```pseudocode
IMPL DraftsService FOR DraftsServiceImpl {
    ASYNC FUNCTION create(
        self,
        user_id: &str,
        request: CreateDraftRequest,
    ) -> Result<Draft, GmailError>
        // Validate the raw message
        validate_raw_message(&request.message.raw)?

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        // Build request body
        request_body <- CreateDraftBody {
            message: DraftMessage {
                raw: request.message.raw,
                thread_id: request.message.thread_id,
            }
        }

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::POST,
            format!("/gmail/v1/users/{}/drafts", resolved_user_id),
        )
        .json_body(&request_body)?
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "drafts".to_string()),
            ("gmail.operation".to_string(), "create".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        result <- self.executor.execute::<Draft>(
            api_request,
            "gmail.drafts.create",
            span_attrs,
        ).await?

        self.logger.info("Draft created", {
            draft_id: result.id,
        })

        Ok(result)
    END FUNCTION
}
```

### 3.5 Update Draft

```pseudocode
IMPL DraftsService FOR DraftsServiceImpl {
    ASYNC FUNCTION update(
        self,
        user_id: &str,
        draft_id: &str,
        request: UpdateDraftRequest,
    ) -> Result<Draft, GmailError>
        IF draft_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Draft ID cannot be empty".to_string()
            }))
        END IF

        validate_raw_message(&request.message.raw)?

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        // Build request body
        request_body <- UpdateDraftBody {
            message: DraftMessage {
                raw: request.message.raw,
                thread_id: None,  // thread_id cannot be changed on update
            }
        }

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::PUT,
            format!("/gmail/v1/users/{}/drafts/{}", resolved_user_id, draft_id),
        )
        .json_body(&request_body)?
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "drafts".to_string()),
            ("gmail.operation".to_string(), "update".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.draft_id".to_string(), draft_id.to_string()),
        ])

        result <- self.executor.execute::<Draft>(
            api_request,
            "gmail.drafts.update",
            span_attrs,
        ).await?

        self.logger.debug("Draft updated", {
            draft_id: result.id,
        })

        Ok(result)
    END FUNCTION
}
```

### 3.6 Send Draft

```pseudocode
IMPL DraftsService FOR DraftsServiceImpl {
    ASYNC FUNCTION send(
        self,
        user_id: &str,
        draft_id: &str,
    ) -> Result<Message, GmailError>
        IF draft_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Draft ID cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        // Build request body
        request_body <- SendDraftBody {
            id: draft_id.to_string()
        }

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::POST,
            format!("/gmail/v1/users/{}/drafts/send", resolved_user_id),
        )
        .json_body(&request_body)?
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "drafts".to_string()),
            ("gmail.operation".to_string(), "send".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.draft_id".to_string(), draft_id.to_string()),
        ])

        result <- self.executor.execute::<Message>(
            api_request,
            "gmail.drafts.send",
            span_attrs,
        ).await?

        self.logger.info("Draft sent", {
            draft_id: draft_id,
            message_id: result.id,
        })

        Ok(result)
    END FUNCTION
}
```

### 3.7 Delete Draft

```pseudocode
IMPL DraftsService FOR DraftsServiceImpl {
    ASYNC FUNCTION delete(
        self,
        user_id: &str,
        draft_id: &str,
    ) -> Result<(), GmailError>
        IF draft_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Draft ID cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        self.logger.debug("Deleting draft", {
            user_id: hash_user_id(&resolved_user_id),
            draft_id: draft_id,
        })

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::DELETE,
            format!("/gmail/v1/users/{}/drafts/{}", resolved_user_id, draft_id),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "drafts".to_string()),
            ("gmail.operation".to_string(), "delete".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.draft_id".to_string(), draft_id.to_string()),
        ])

        self.executor.execute::<EmptyResponse>(
            api_request,
            "gmail.drafts.delete",
            span_attrs,
        ).await?

        Ok(())
    END FUNCTION
}
```

---

## 4. History Service Implementation

### 4.1 History Service Structure

```pseudocode
STRUCT HistoryServiceImpl {
    config: GmailConfig,
    executor: Arc<RequestExecutor>,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
}

IMPL HistoryServiceImpl {
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

### 4.2 List History

```pseudocode
IMPL HistoryService FOR HistoryServiceImpl {
    ASYNC FUNCTION list(
        self,
        user_id: &str,
        start_history_id: &str,
        params: Option<ListHistoryParams>,
    ) -> Result<Paginated<HistoryRecord>, GmailError>
        // Validate start_history_id
        IF start_history_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Start history ID cannot be empty".to_string()
            }))
        END IF

        // Validate it's a valid number
        IF start_history_id.parse::<u64>().is_err() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Start history ID must be a valid number".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        builder <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::GET,
            format!("/gmail/v1/users/{}/history", resolved_user_id),
        )
        .query_param("startHistoryId", start_history_id)

        IF let Some(p) = &params THEN
            builder <- builder
                .query_param_opt("maxResults", p.max_results.map(|v| v.to_string()))
                .query_param_opt("pageToken", p.page_token.clone())
                .query_param_opt("labelId", p.label_id.clone())

            IF let Some(history_types) = &p.history_types THEN
                FOR history_type IN history_types DO
                    type_str <- MATCH history_type {
                        HistoryType::MessageAdded => "messageAdded",
                        HistoryType::MessageDeleted => "messageDeleted",
                        HistoryType::LabelAdded => "labelAdded",
                        HistoryType::LabelRemoved => "labelRemoved",
                    }
                    builder <- builder.query_param("historyTypes", type_str)
                END FOR
            END IF
        END IF

        api_request <- builder.build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "history".to_string()),
            ("gmail.operation".to_string(), "list".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.start_history_id".to_string(), start_history_id.to_string()),
        ])

        response <- self.executor.execute::<ListHistoryResponse>(
            api_request,
            "gmail.history.list",
            span_attrs,
        ).await?

        Ok(Paginated {
            items: response.history.unwrap_or_default(),
            next_page_token: response.next_page_token,
            result_size_estimate: None,  // History API doesn't provide estimate
        })
    END FUNCTION

    FUNCTION list_all(
        self,
        user_id: &str,
        start_history_id: &str,
        params: Option<ListHistoryParams>,
    ) -> impl Stream<Item = Result<HistoryRecord, GmailError>> + Send
        let user_id = user_id.to_string()
        let start_history_id = start_history_id.to_string()
        let params = params.unwrap_or_default()
        let this = self.clone()

        async_stream::stream! {
            let mut page_token: Option<String> = None

            LOOP
                list_params <- ListHistoryParams {
                    page_token: page_token.clone(),
                    ..params.clone()
                }

                MATCH this.list(&user_id, &start_history_id, Some(list_params)).await {
                    Ok(page) => {
                        FOR record IN page.items DO
                            yield Ok(record)
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

ENUM HistoryType {
    MessageAdded,
    MessageDeleted,
    LabelAdded,
    LabelRemoved,
}
```

### 4.3 History-Based Synchronization

```pseudocode
// Helper for efficient mailbox synchronization
STRUCT MailboxSynchronizer {
    history_service: Arc<dyn HistoryService>,
    messages_service: Arc<dyn MessagesService>,
    logger: Arc<dyn Logger>,
}

IMPL MailboxSynchronizer {
    ASYNC FUNCTION sync(
        self,
        user_id: &str,
        last_history_id: &str,
        callback: impl Fn(SyncEvent) -> Result<(), GmailError>,
    ) -> Result<String, GmailError>
        // Returns the new history ID to use for next sync

        self.logger.info("Starting mailbox sync", {
            user_id: hash_user_id(user_id),
            start_history_id: last_history_id,
        })

        current_history_id <- last_history_id.to_string()

        // Collect all history records
        history_stream <- self.history_service.list_all(
            user_id,
            last_history_id,
            None,
        )

        PIN mut history_stream

        WHILE let Some(result) = history_stream.next().await DO
            record <- result?

            // Process each type of change
            IF let Some(messages_added) = record.messages_added THEN
                FOR added IN messages_added DO
                    callback(SyncEvent::MessageAdded {
                        message_id: added.message.id,
                        thread_id: added.message.thread_id,
                    })?
                END FOR
            END IF

            IF let Some(messages_deleted) = record.messages_deleted THEN
                FOR deleted IN messages_deleted DO
                    callback(SyncEvent::MessageDeleted {
                        message_id: deleted.message.id,
                        thread_id: deleted.message.thread_id,
                    })?
                END FOR
            END IF

            IF let Some(labels_added) = record.labels_added THEN
                FOR label_change IN labels_added DO
                    callback(SyncEvent::LabelsAdded {
                        message_id: label_change.message.id,
                        label_ids: label_change.label_ids,
                    })?
                END FOR
            END IF

            IF let Some(labels_removed) = record.labels_removed THEN
                FOR label_change IN labels_removed DO
                    callback(SyncEvent::LabelsRemoved {
                        message_id: label_change.message.id,
                        label_ids: label_change.label_ids,
                    })?
                END FOR
            END IF

            // Track the latest history ID
            current_history_id = record.id
        END WHILE

        self.logger.info("Mailbox sync complete", {
            new_history_id: current_history_id,
        })

        Ok(current_history_id)
    END FUNCTION
}

ENUM SyncEvent {
    MessageAdded { message_id: String, thread_id: String },
    MessageDeleted { message_id: String, thread_id: String },
    LabelsAdded { message_id: String, label_ids: Vec<String> },
    LabelsRemoved { message_id: String, label_ids: Vec<String> },
}
```

---

## 5. Attachments Service Implementation

### 5.1 Attachments Service Structure

```pseudocode
STRUCT AttachmentsServiceImpl {
    config: GmailConfig,
    executor: Arc<RequestExecutor>,
    transport: Arc<dyn HttpTransport>,
    auth_provider: Arc<dyn AuthProvider>,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
}

IMPL AttachmentsServiceImpl {
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
            transport: transport.clone(),
            auth_provider: auth_provider.clone(),
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
            transport: transport,
            auth_provider: auth_provider,
            logger: logger,
            tracer: tracer,
        }
    END FUNCTION
}
```

### 5.2 Get Attachment

```pseudocode
IMPL AttachmentsService FOR AttachmentsServiceImpl {
    ASYNC FUNCTION get(
        self,
        user_id: &str,
        message_id: &str,
        attachment_id: &str,
    ) -> Result<Attachment, GmailError>
        // Validate inputs
        IF message_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Message ID cannot be empty".to_string()
            }))
        END IF

        IF attachment_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Attachment ID cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::GET,
            format!(
                "/gmail/v1/users/{}/messages/{}/attachments/{}",
                resolved_user_id, message_id, attachment_id
            ),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "attachments".to_string()),
            ("gmail.operation".to_string(), "get".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.message_id".to_string(), message_id.to_string()),
            ("gmail.attachment_id".to_string(), attachment_id.to_string()),
        ])

        response <- self.executor.execute::<AttachmentResponse>(
            api_request,
            "gmail.attachments.get",
            span_attrs,
        ).await?

        // Decode the base64url data
        data <- base64url_decode(&response.data)?

        Ok(Attachment {
            attachment_id: response.attachment_id,
            size: response.size,
            data: data,
        })
    END FUNCTION
}
```

### 5.3 Stream Attachment

```pseudocode
IMPL AttachmentsService FOR AttachmentsServiceImpl {
    ASYNC FUNCTION get_stream(
        self,
        user_id: &str,
        message_id: &str,
        attachment_id: &str,
    ) -> Result<impl Stream<Item = Result<Bytes, GmailError>> + Send, GmailError>
        // Validate inputs
        IF message_id.is_empty() OR attachment_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Message ID and Attachment ID are required".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        // First, get attachment metadata to know the size
        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::GET,
            format!(
                "/gmail/v1/users/{}/messages/{}/attachments/{}",
                resolved_user_id, message_id, attachment_id
            ),
        )
        .build()?

        // Get auth header
        auth_header <- self.auth_provider.get_auth_header().await?

        // Add auth header to request
        api_request.headers.insert("Authorization", auth_header.parse()?)?

        self.logger.debug("Streaming attachment", {
            message_id: message_id,
            attachment_id: attachment_id,
        })

        // Get full response - Gmail doesn't support Range requests for attachments
        response <- self.transport.send(api_request).await?

        IF NOT response.status.is_success() THEN
            RETURN Err(self.executor.response_parser.parse_error_response(&response)?)
        END IF

        // Parse the response to get base64 data
        attachment_response <- serde_json::from_slice::<AttachmentResponse>(&response.body)?

        // Create a stream that decodes the base64 data in chunks
        chunk_size <- 64 * 1024  // 64KB chunks
        encoded_data <- attachment_response.data

        Ok(stream_decoded_base64url(encoded_data, chunk_size))
    END FUNCTION
}

FUNCTION stream_decoded_base64url(
    encoded: String,
    chunk_size: usize,
) -> impl Stream<Item = Result<Bytes, GmailError>> + Send
    async_stream::stream! {
        // Base64url decode and stream in chunks
        decoded <- base64url_decode(&encoded)?

        FOR chunk IN decoded.chunks(chunk_size) DO
            yield Ok(Bytes::copy_from_slice(chunk))
        END FOR
    }
END FUNCTION
```

### 5.4 Extract Attachments from Message

```pseudocode
// Helper to extract all attachments from a message
FUNCTION extract_attachments(message: &Message) -> Vec<AttachmentInfo>
    attachments <- Vec::new()

    IF let Some(payload) = &message.payload THEN
        extract_attachments_recursive(payload, &mut attachments)
    END IF

    attachments
END FUNCTION

FUNCTION extract_attachments_recursive(part: &MessagePayload, attachments: &mut Vec<AttachmentInfo>)
    // Check if this part is an attachment
    IF let Some(body) = &part.body THEN
        IF let Some(attachment_id) = &body.attachment_id THEN
            attachment_info <- AttachmentInfo {
                attachment_id: attachment_id.clone(),
                filename: part.filename.clone().unwrap_or_default(),
                mime_type: part.mime_type.clone(),
                size: body.size,
            }
            attachments.push(attachment_info)
        END IF
    END IF

    // Recursively check child parts
    IF let Some(parts) = &part.parts THEN
        FOR child_part IN parts DO
            extract_attachments_recursive(child_part, attachments)
        END FOR
    END IF
END FUNCTION

STRUCT AttachmentInfo {
    attachment_id: String,
    filename: String,
    mime_type: String,
    size: i64,
}
```

---

## 6. Settings Service Implementation

### 6.1 Settings Service Structure

```pseudocode
STRUCT SettingsServiceImpl {
    config: GmailConfig,
    executor: Arc<RequestExecutor>,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,

    // Sub-services
    auto_forwarding: OnceCell<Arc<AutoForwardingServiceImpl>>,
    filters: OnceCell<Arc<FiltersServiceImpl>>,
    forwarding_addresses: OnceCell<Arc<ForwardingAddressesServiceImpl>>,
    imap: OnceCell<Arc<ImapSettingsServiceImpl>>,
    pop: OnceCell<Arc<PopSettingsServiceImpl>>,
    vacation: OnceCell<Arc<VacationSettingsServiceImpl>>,
    language: OnceCell<Arc<LanguageSettingsServiceImpl>>,
    send_as: OnceCell<Arc<SendAsSettingsServiceImpl>>,
    delegates: OnceCell<Arc<DelegatesServiceImpl>>,
}
```

### 6.2 Filters Service

```pseudocode
STRUCT FiltersServiceImpl {
    config: GmailConfig,
    executor: Arc<RequestExecutor>,
    logger: Arc<dyn Logger>,
}

IMPL FiltersService FOR FiltersServiceImpl {
    ASYNC FUNCTION list(self, user_id: &str) -> Result<Vec<Filter>, GmailError>
        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::GET,
            format!("/gmail/v1/users/{}/settings/filters", resolved_user_id),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "settings.filters".to_string()),
            ("gmail.operation".to_string(), "list".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        response <- self.executor.execute::<ListFiltersResponse>(
            api_request,
            "gmail.settings.filters.list",
            span_attrs,
        ).await?

        Ok(response.filter.unwrap_or_default())
    END FUNCTION

    ASYNC FUNCTION get(self, user_id: &str, filter_id: &str) -> Result<Filter, GmailError>
        IF filter_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Filter ID cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::GET,
            format!("/gmail/v1/users/{}/settings/filters/{}", resolved_user_id, filter_id),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "settings.filters".to_string()),
            ("gmail.operation".to_string(), "get".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.filter_id".to_string(), filter_id.to_string()),
        ])

        self.executor.execute::<Filter>(
            api_request,
            "gmail.settings.filters.get",
            span_attrs,
        ).await
    END FUNCTION

    ASYNC FUNCTION create(
        self,
        user_id: &str,
        request: CreateFilterRequest,
    ) -> Result<Filter, GmailError>
        // Validate filter
        validate_filter_request(&request)?

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        request_body <- CreateFilterBody {
            criteria: request.criteria,
            action: request.action,
        }

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::POST,
            format!("/gmail/v1/users/{}/settings/filters", resolved_user_id),
        )
        .json_body(&request_body)?
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "settings.filters".to_string()),
            ("gmail.operation".to_string(), "create".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        result <- self.executor.execute::<Filter>(
            api_request,
            "gmail.settings.filters.create",
            span_attrs,
        ).await?

        self.logger.info("Filter created", {
            filter_id: result.id,
        })

        Ok(result)
    END FUNCTION

    ASYNC FUNCTION delete(self, user_id: &str, filter_id: &str) -> Result<(), GmailError>
        IF filter_id.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Filter ID cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::DELETE,
            format!("/gmail/v1/users/{}/settings/filters/{}", resolved_user_id, filter_id),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "settings.filters".to_string()),
            ("gmail.operation".to_string(), "delete".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.filter_id".to_string(), filter_id.to_string()),
        ])

        self.executor.execute::<EmptyResponse>(
            api_request,
            "gmail.settings.filters.delete",
            span_attrs,
        ).await?

        Ok(())
    END FUNCTION
}

FUNCTION validate_filter_request(request: &CreateFilterRequest) -> Result<(), GmailError>
    // At least one criteria must be specified
    criteria <- &request.criteria
    has_criteria <- criteria.from.is_some()
        OR criteria.to.is_some()
        OR criteria.subject.is_some()
        OR criteria.query.is_some()
        OR criteria.has_attachment.is_some()

    IF NOT has_criteria THEN
        RETURN Err(GmailError::Request(RequestError::InvalidParameter {
            message: "At least one filter criteria must be specified".to_string()
        }))
    END IF

    // At least one action must be specified
    action <- &request.action
    has_action <- action.add_label_ids.is_some()
        OR action.remove_label_ids.is_some()
        OR action.forward.is_some()

    IF NOT has_action THEN
        RETURN Err(GmailError::Request(RequestError::InvalidParameter {
            message: "At least one filter action must be specified".to_string()
        }))
    END IF

    Ok(())
END FUNCTION
```

### 6.3 Vacation Settings Service

```pseudocode
STRUCT VacationSettingsServiceImpl {
    config: GmailConfig,
    executor: Arc<RequestExecutor>,
    logger: Arc<dyn Logger>,
}

IMPL VacationSettingsService FOR VacationSettingsServiceImpl {
    ASYNC FUNCTION get(self, user_id: &str) -> Result<VacationSettings, GmailError>
        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::GET,
            format!("/gmail/v1/users/{}/settings/vacation", resolved_user_id),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "settings.vacation".to_string()),
            ("gmail.operation".to_string(), "get".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        self.executor.execute::<VacationSettings>(
            api_request,
            "gmail.settings.vacation.get",
            span_attrs,
        ).await
    END FUNCTION

    ASYNC FUNCTION update(
        self,
        user_id: &str,
        settings: VacationSettings,
    ) -> Result<VacationSettings, GmailError>
        resolved_user_id <- resolve_user_id(user_id, &self.config)

        // Validate settings
        IF settings.enable_auto_reply THEN
            IF settings.response_subject.is_none()
                AND settings.response_body_plain_text.is_none()
                AND settings.response_body_html.is_none()
            THEN
                RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                    message: "Vacation response subject or body is required when enabled".to_string()
                }))
            END IF
        END IF

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::PUT,
            format!("/gmail/v1/users/{}/settings/vacation", resolved_user_id),
        )
        .json_body(&settings)?
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "settings.vacation".to_string()),
            ("gmail.operation".to_string(), "update".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
            ("gmail.vacation_enabled".to_string(), settings.enable_auto_reply.to_string()),
        ])

        result <- self.executor.execute::<VacationSettings>(
            api_request,
            "gmail.settings.vacation.update",
            span_attrs,
        ).await?

        self.logger.info("Vacation settings updated", {
            enabled: result.enable_auto_reply,
        })

        Ok(result)
    END FUNCTION
}
```

### 6.4 Send-As Settings Service

```pseudocode
STRUCT SendAsSettingsServiceImpl {
    config: GmailConfig,
    executor: Arc<RequestExecutor>,
    logger: Arc<dyn Logger>,
}

IMPL SendAsSettingsService FOR SendAsSettingsServiceImpl {
    ASYNC FUNCTION list(self, user_id: &str) -> Result<Vec<SendAs>, GmailError>
        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::GET,
            format!("/gmail/v1/users/{}/settings/sendAs", resolved_user_id),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "settings.sendAs".to_string()),
            ("gmail.operation".to_string(), "list".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        response <- self.executor.execute::<ListSendAsResponse>(
            api_request,
            "gmail.settings.sendAs.list",
            span_attrs,
        ).await?

        Ok(response.send_as.unwrap_or_default())
    END FUNCTION

    ASYNC FUNCTION get(self, user_id: &str, send_as_email: &str) -> Result<SendAs, GmailError>
        IF send_as_email.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Send-as email cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::GET,
            format!("/gmail/v1/users/{}/settings/sendAs/{}", resolved_user_id, send_as_email),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "settings.sendAs".to_string()),
            ("gmail.operation".to_string(), "get".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        self.executor.execute::<SendAs>(
            api_request,
            "gmail.settings.sendAs.get",
            span_attrs,
        ).await
    END FUNCTION

    ASYNC FUNCTION create(
        self,
        user_id: &str,
        request: CreateSendAsRequest,
    ) -> Result<SendAs, GmailError>
        // Validate email
        validate_email_address(&request.send_as_email)?

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::POST,
            format!("/gmail/v1/users/{}/settings/sendAs", resolved_user_id),
        )
        .json_body(&request)?
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "settings.sendAs".to_string()),
            ("gmail.operation".to_string(), "create".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        self.executor.execute::<SendAs>(
            api_request,
            "gmail.settings.sendAs.create",
            span_attrs,
        ).await
    END FUNCTION

    ASYNC FUNCTION verify(self, user_id: &str, send_as_email: &str) -> Result<(), GmailError>
        IF send_as_email.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Send-as email cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::POST,
            format!("/gmail/v1/users/{}/settings/sendAs/{}/verify", resolved_user_id, send_as_email),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "settings.sendAs".to_string()),
            ("gmail.operation".to_string(), "verify".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        self.executor.execute::<EmptyResponse>(
            api_request,
            "gmail.settings.sendAs.verify",
            span_attrs,
        ).await?

        self.logger.info("Verification email sent", {
            send_as_email: send_as_email,
        })

        Ok(())
    END FUNCTION

    ASYNC FUNCTION delete(self, user_id: &str, send_as_email: &str) -> Result<(), GmailError>
        IF send_as_email.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Send-as email cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::DELETE,
            format!("/gmail/v1/users/{}/settings/sendAs/{}", resolved_user_id, send_as_email),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "settings.sendAs".to_string()),
            ("gmail.operation".to_string(), "delete".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        self.executor.execute::<EmptyResponse>(
            api_request,
            "gmail.settings.sendAs.delete",
            span_attrs,
        ).await?

        Ok(())
    END FUNCTION
}
```

### 6.5 Delegates Service

```pseudocode
STRUCT DelegatesServiceImpl {
    config: GmailConfig,
    executor: Arc<RequestExecutor>,
    logger: Arc<dyn Logger>,
}

IMPL DelegatesService FOR DelegatesServiceImpl {
    ASYNC FUNCTION list(self, user_id: &str) -> Result<Vec<Delegate>, GmailError>
        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::GET,
            format!("/gmail/v1/users/{}/settings/delegates", resolved_user_id),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "settings.delegates".to_string()),
            ("gmail.operation".to_string(), "list".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        response <- self.executor.execute::<ListDelegatesResponse>(
            api_request,
            "gmail.settings.delegates.list",
            span_attrs,
        ).await?

        Ok(response.delegates.unwrap_or_default())
    END FUNCTION

    ASYNC FUNCTION get(self, user_id: &str, delegate_email: &str) -> Result<Delegate, GmailError>
        IF delegate_email.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Delegate email cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::GET,
            format!("/gmail/v1/users/{}/settings/delegates/{}", resolved_user_id, delegate_email),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "settings.delegates".to_string()),
            ("gmail.operation".to_string(), "get".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        self.executor.execute::<Delegate>(
            api_request,
            "gmail.settings.delegates.get",
            span_attrs,
        ).await
    END FUNCTION

    ASYNC FUNCTION create(
        self,
        user_id: &str,
        delegate_email: &str,
    ) -> Result<Delegate, GmailError>
        validate_email_address(delegate_email)?

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        request_body <- CreateDelegateBody {
            delegate_email: delegate_email.to_string(),
        }

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::POST,
            format!("/gmail/v1/users/{}/settings/delegates", resolved_user_id),
        )
        .json_body(&request_body)?
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "settings.delegates".to_string()),
            ("gmail.operation".to_string(), "create".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        result <- self.executor.execute::<Delegate>(
            api_request,
            "gmail.settings.delegates.create",
            span_attrs,
        ).await?

        self.logger.info("Delegate created", {
            delegate_email: delegate_email,
            status: result.verification_status,
        })

        Ok(result)
    END FUNCTION

    ASYNC FUNCTION delete(self, user_id: &str, delegate_email: &str) -> Result<(), GmailError>
        IF delegate_email.is_empty() THEN
            RETURN Err(GmailError::Request(RequestError::InvalidParameter {
                message: "Delegate email cannot be empty".to_string()
            }))
        END IF

        resolved_user_id <- resolve_user_id(user_id, &self.config)

        api_request <- GmailRequestBuilder::new(
            self.config.base_url.clone(),
            HttpMethod::DELETE,
            format!("/gmail/v1/users/{}/settings/delegates/{}", resolved_user_id, delegate_email),
        )
        .build()?

        span_attrs <- HashMap::from([
            ("gmail.service".to_string(), "settings.delegates".to_string()),
            ("gmail.operation".to_string(), "delete".to_string()),
            ("gmail.user_id".to_string(), hash_user_id(&resolved_user_id)),
        ])

        self.executor.execute::<EmptyResponse>(
            api_request,
            "gmail.settings.delegates.delete",
            span_attrs,
        ).await?

        Ok(())
    END FUNCTION
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode - Part 3 |

---

**End of Part 3**

*Part 4 will cover Users Service, Push Notifications, Testing Mocks, and TypeScript implementations.*
