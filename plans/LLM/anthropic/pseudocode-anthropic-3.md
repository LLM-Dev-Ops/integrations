# Anthropic Integration Module - Pseudocode (Part 3)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/anthropic`
**File:** 3 of 4 - Message Batches and Admin APIs

---

## Table of Contents (Part 3)

13. [Message Batches Service](#13-message-batches-service)
14. [Admin Service](#14-admin-service)
15. [Organizations Service](#15-organizations-service)
16. [Workspaces Service](#16-workspaces-service)
17. [API Keys Service](#17-api-keys-service)
18. [Invites Service](#18-invites-service)

---

## 13. Message Batches Service

### 13.1 Service Interface (London-School TDD Contract)

```
// Interface that can be mocked for testing
TRAIT MessageBatchesService {
  // Create a new message batch
  ASYNC FUNCTION create(request: CreateBatchRequest) -> Result<MessageBatch, AnthropicError>

  // List all message batches
  ASYNC FUNCTION list(params: Option<ListBatchesParams>) -> Result<BatchList, AnthropicError>

  // Get a specific batch by ID
  ASYNC FUNCTION get(batch_id: String) -> Result<MessageBatch, AnthropicError>

  // Get batch results (streaming JSONL)
  ASYNC FUNCTION get_results(batch_id: String) -> Result<BatchResultsStream, AnthropicError>

  // Cancel a batch
  ASYNC FUNCTION cancel(batch_id: String) -> Result<MessageBatch, AnthropicError>
}

// Production implementation
STRUCT MessageBatchesServiceImpl {
  transport: HttpTransport,
  auth_manager: AuthManager,
  retry_executor: RetryExecutor,
  rate_limiter: RateLimiter,
  circuit_breaker: CircuitBreaker,
  base_url: Url,
  logger: Logger,
  tracer: Tracer
}

// Mock implementation for testing
STRUCT MockMessageBatchesService {
  create_responses: Vec<Result<MessageBatch, AnthropicError>>,
  list_responses: Vec<Result<BatchList, AnthropicError>>,
  get_responses: HashMap<String, Result<MessageBatch, AnthropicError>>,
  results_responses: HashMap<String, Result<MockBatchResultsStream, AnthropicError>>,
  cancel_responses: HashMap<String, Result<MessageBatch, AnthropicError>>,
  call_history: Vec<BatchRequestRecord>
}
```

### 13.2 Create Batch

```
FUNCTION batches_service.create(
  request: CreateBatchRequest
) -> Result<MessageBatch, AnthropicError>

  // Step 1: Validate request
  validate_create_batch_request(request)?

  // Step 2: Execute with resilience
  response <- execute_with_resilience(
    operation: "batches.create",
    request_fn: ASYNC FUNCTION() -> Result<MessageBatch, AnthropicError>
      RETURN self.execute_create_batch_request(request).await
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  self.logger.info("Batch created", {
    batch_id: response.id,
    request_count: request.requests.len(),
    status: response.processing_status
  })

  RETURN Ok(response)
END FUNCTION

FUNCTION batches_service.execute_create_batch_request(
  request: CreateBatchRequest
) -> Result<MessageBatch, AnthropicError>

  // Build HTTP request
  http_request <- build_request(
    method: POST,
    endpoint: "/v1/messages/batches",
    base_url: self.base_url,
    auth_manager: self.auth_manager,
    body: Some(serialize_request_body(request)?),
    extra_headers: HeaderMap::new()
  )?

  // Execute request
  http_response <- self.transport.send(http_request).await?

  IF http_response.status.is_success() THEN
    RETURN parse_response::<MessageBatch>(http_response, self.logger)
  ELSE
    error <- parse_error_response(
      http_response.status,
      http_response.body,
      http_response.headers
    )
    RETURN Error(error)
  END IF
END FUNCTION

FUNCTION validate_create_batch_request(request: CreateBatchRequest) -> Result<(), RequestError>
  errors <- []

  // Validate requests array
  IF request.requests.is_empty() THEN
    errors.push(ValidationDetail {
      field: "requests",
      message: "At least one request is required"
    })
  END IF

  IF request.requests.len() > 10000 THEN
    errors.push(ValidationDetail {
      field: "requests",
      message: "Batch cannot exceed 10,000 requests"
    })
  END IF

  // Estimate total size
  total_size <- estimate_json_size(request)
  IF total_size > 32 * 1024 * 1024 THEN  // 32 MB
    errors.push(ValidationDetail {
      field: "requests",
      message: "Batch size cannot exceed 32 MB"
    })
  END IF

  // Validate each batch request
  FOR EACH (index, batch_request) IN request.requests.enumerate() DO
    validate_batch_request_item(batch_request, index, errors)
  END FOR

  // Check for duplicate custom_ids
  seen_ids <- HashSet::new()
  FOR EACH (index, batch_request) IN request.requests.enumerate() DO
    IF seen_ids.contains(batch_request.custom_id) THEN
      errors.push(ValidationDetail {
        field: format("requests[{}].custom_id", index),
        message: "Duplicate custom_id"
      })
    END IF
    seen_ids.insert(batch_request.custom_id.clone())
  END FOR

  IF errors.is_empty() THEN
    RETURN Ok(())
  ELSE
    RETURN Error(RequestError::ValidationError {
      message: "Batch request validation failed",
      details: errors
    })
  END IF
END FUNCTION

FUNCTION validate_batch_request_item(item: BatchRequest, index: usize, errors: &mut Vec<ValidationDetail>)
  prefix <- format("requests[{}]", index)

  // Validate custom_id (required)
  IF item.custom_id.is_empty() THEN
    errors.push(ValidationDetail {
      field: format("{}.custom_id", prefix),
      message: "custom_id is required"
    })
  ELSE IF item.custom_id.len() > 64 THEN
    errors.push(ValidationDetail {
      field: format("{}.custom_id", prefix),
      message: "custom_id cannot exceed 64 characters"
    })
  END IF

  // Validate params (must be valid CreateMessageRequest)
  // Reuse message validation but collect errors with prefix
  params_errors <- validate_create_message_request_partial(item.params)
  FOR EACH error IN params_errors DO
    errors.push(ValidationDetail {
      field: format("{}.params.{}", prefix, error.field),
      message: error.message
    })
  END FOR

  // Batches don't support streaming
  IF item.params.stream == Some(true) THEN
    errors.push(ValidationDetail {
      field: format("{}.params.stream", prefix),
      message: "Streaming is not supported in batch requests"
    })
  END IF
END FUNCTION
```

### 13.3 List Batches

```
FUNCTION batches_service.list(
  params: Option<ListBatchesParams>
) -> Result<BatchList, AnthropicError>

  // Build query parameters
  query_params <- HashMap::new()
  IF params IS Some THEN
    IF params.limit IS Some THEN
      query_params.insert("limit", params.limit.to_string())
    END IF
    IF params.before_id IS Some THEN
      query_params.insert("before_id", params.before_id)
    END IF
    IF params.after_id IS Some THEN
      query_params.insert("after_id", params.after_id)
    END IF
  END IF

  // Execute with resilience
  response <- execute_with_resilience(
    operation: "batches.list",
    request_fn: ASYNC FUNCTION() -> Result<BatchList, AnthropicError>
      // Build URL with query params
      url <- self.base_url.join("/v1/messages/batches")?
      FOR EACH (key, value) IN query_params DO
        url.query_pairs_mut().append_pair(key, value)
      END FOR

      // Build HTTP request
      http_request <- HttpRequest::builder()
        .method(GET)
        .url(url)
        .headers(self.auth_manager.get_headers())
        .build()?

      // Execute request
      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<BatchList>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  RETURN Ok(response)
END FUNCTION
```

### 13.4 Get Batch

```
FUNCTION batches_service.get(batch_id: String) -> Result<MessageBatch, AnthropicError>
  // Validate batch_id
  IF batch_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Batch ID is required",
      details: []
    })
  END IF

  // Execute with resilience
  response <- execute_with_resilience(
    operation: "batches.get",
    request_fn: ASYNC FUNCTION() -> Result<MessageBatch, AnthropicError>
      // Build URL
      endpoint <- format("/v1/messages/batches/{}", url_encode(batch_id))

      // Build HTTP request
      http_request <- build_request(
        method: GET,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: HeaderMap::new()
      )?

      // Execute request
      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<MessageBatch>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  RETURN Ok(response)
END FUNCTION
```

### 13.5 Get Batch Results

```
FUNCTION batches_service.get_results(batch_id: String) -> Result<BatchResultsStream, AnthropicError>
  // Validate batch_id
  IF batch_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Batch ID is required",
      details: []
    })
  END IF

  // Check circuit breaker (streaming endpoint)
  IF self.circuit_breaker.is_open() THEN
    RETURN Error(ServerError::ServiceUnavailable {
      retry_after: self.circuit_breaker.time_until_half_open(),
      message: "Circuit breaker is open"
    })
  END IF

  // Acquire rate limit permit
  self.rate_limiter.acquire().await?

  // Build URL
  endpoint <- format("/v1/messages/batches/{}/results", url_encode(batch_id))

  // Build HTTP request (results are streamed as JSONL)
  http_request <- build_request(
    method: GET,
    endpoint: endpoint,
    base_url: self.base_url,
    auth_manager: self.auth_manager,
    body: None,
    extra_headers: HeaderMap::new()
  )?

  // Start tracing span
  span <- self.tracer.start_span("anthropic.batches.get_results")
  span.set_attribute("anthropic.batch_id", batch_id)

  TRY
    // Execute streaming request
    http_response <- self.transport.send_streaming(http_request).await?

    IF NOT http_response.status.is_success() THEN
      // Read error body
      body <- http_response.body_bytes().await?
      error <- parse_error_response(
        http_response.status,
        body,
        http_response.headers
      )
      self.circuit_breaker.record_failure()
      span.record_error(error)
      span.end()
      RETURN Error(error)
    END IF

    self.circuit_breaker.record_success()

    // Create results stream wrapper
    results_stream <- BatchResultsStream::new(
      response_stream: http_response.body_stream(),
      batch_id: batch_id,
      logger: self.logger.clone(),
      span: span
    )

    RETURN Ok(results_stream)

  CATCH error
    self.circuit_breaker.record_failure()
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 13.6 Batch Results Stream

```
STRUCT BatchResultsStream {
  response_stream: ByteStream,
  buffer: String,
  batch_id: String,
  logger: Logger,
  span: Span,
  results_count: u32,
  is_done: bool
}

// BatchResultsStream implements AsyncIterator<Item = Result<BatchResult, AnthropicError>>
FUNCTION batch_results_stream.next() -> Option<Result<BatchResult, AnthropicError>>
  IF self.is_done THEN
    RETURN None
  END IF

  LOOP
    // Try to parse a complete JSON line from buffer
    line_end <- self.buffer.find("\n")
    IF line_end IS Some THEN
      line <- self.buffer[0..line_end].trim()
      self.buffer <- self.buffer[line_end + 1..]

      // Skip empty lines
      IF line.is_empty() THEN
        CONTINUE
      END IF

      // Parse JSONL line
      TRY
        result <- deserialize_json::<BatchResult>(line)?
        self.results_count <- self.results_count + 1
        RETURN Some(Ok(result))
      CATCH DeserializeError AS e
        self.logger.warn("Failed to parse batch result line", {
          batch_id: self.batch_id,
          error: e.to_string(),
          line: truncate(line, 200)
        })
        // Continue to next line
        CONTINUE
      END TRY
    END IF

    // Need more data
    TRY
      bytes <- self.response_stream.next().await

      IF bytes IS None THEN
        // Stream ended
        self.finish_stream()
        RETURN None
      END IF

      // Append to buffer
      self.buffer.push_str(String::from_utf8_lossy(bytes))

    CATCH IoError AS e
      self.span.record_error(e)
      RETURN Some(Error(NetworkError::ConnectionFailed {
        message: e.to_string()
      }))
    END TRY
  END LOOP
END FUNCTION

FUNCTION batch_results_stream.finish_stream()
  self.is_done <- true

  self.logger.debug("Batch results stream completed", {
    batch_id: self.batch_id,
    results_count: self.results_count
  })

  self.span.set_attribute("anthropic.results_count", self.results_count)
  self.span.set_status(OK)
  self.span.end()
END FUNCTION
```

### 13.7 Cancel Batch

```
FUNCTION batches_service.cancel(batch_id: String) -> Result<MessageBatch, AnthropicError>
  // Validate batch_id
  IF batch_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Batch ID is required",
      details: []
    })
  END IF

  // Execute with resilience
  response <- execute_with_resilience(
    operation: "batches.cancel",
    request_fn: ASYNC FUNCTION() -> Result<MessageBatch, AnthropicError>
      // Build URL
      endpoint <- format("/v1/messages/batches/{}/cancel", url_encode(batch_id))

      // Build HTTP request
      http_request <- build_request(
        method: POST,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: HeaderMap::new()
      )?

      // Execute request
      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<MessageBatch>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  self.logger.info("Batch cancellation requested", {
    batch_id: batch_id,
    status: response.processing_status
  })

  RETURN Ok(response)
END FUNCTION
```

### 13.8 Batch Status Polling Helper

```
// Convenience function for polling batch status until completion
FUNCTION batches_service.wait_for_completion(
  batch_id: String,
  options: WaitOptions
) -> Result<MessageBatch, AnthropicError>

  start_time <- now()
  poll_count <- 0

  LOOP
    // Get current batch status
    batch <- self.get(batch_id).await?
    poll_count <- poll_count + 1

    self.logger.debug("Batch status poll", {
      batch_id: batch_id,
      status: batch.processing_status,
      poll_count: poll_count
    })

    // Check if terminal state
    MATCH batch.processing_status
      CASE "ended":
        RETURN Ok(batch)
      CASE "canceled":
        RETURN Ok(batch)
      CASE "expired":
        RETURN Ok(batch)
      CASE "canceling":
        // Still processing cancellation - continue polling
      CASE "in_progress":
        // Still processing - continue polling
      CASE _:
        self.logger.warn("Unknown batch status", {
          batch_id: batch_id,
          status: batch.processing_status
        })
    END MATCH

    // Check timeout
    elapsed <- now() - start_time
    IF elapsed > options.timeout THEN
      RETURN Error(RequestError::Timeout {
        message: format("Batch {} did not complete within timeout", batch_id),
        duration: options.timeout
      })
    END IF

    // Check max polls
    IF poll_count >= options.max_polls THEN
      RETURN Error(RequestError::Timeout {
        message: format("Batch {} did not complete within {} polls", batch_id, options.max_polls),
        duration: elapsed
      })
    END IF

    // Wait before next poll (with exponential backoff)
    delay <- calculate_poll_delay(poll_count, options)
    sleep(delay).await
  END LOOP
END FUNCTION

STRUCT WaitOptions {
  timeout: Duration,          // Default: 24 hours
  initial_poll_interval: Duration,  // Default: 10 seconds
  max_poll_interval: Duration,      // Default: 5 minutes
  max_polls: u32              // Default: 10000
}

FUNCTION WaitOptions::default() -> WaitOptions
  RETURN WaitOptions {
    timeout: Duration::from_secs(24 * 60 * 60),  // 24 hours
    initial_poll_interval: Duration::from_secs(10),
    max_poll_interval: Duration::from_secs(5 * 60),  // 5 minutes
    max_polls: 10000
  }
END FUNCTION

FUNCTION calculate_poll_delay(poll_count: u32, options: WaitOptions) -> Duration
  // Exponential backoff with cap
  delay_ms <- options.initial_poll_interval.as_millis() * (1.5 ^ min(poll_count, 20))
  delay_ms <- min(delay_ms, options.max_poll_interval.as_millis())

  // Add jitter (10%)
  jitter <- delay_ms * 0.1 * random_range(-1.0, 1.0)
  delay_ms <- delay_ms + jitter

  RETURN Duration::from_millis(delay_ms as u64)
END FUNCTION
```

---

## 14. Admin Service

### 14.1 Service Interface

```
// Admin service provides access to organization management
// Requires Admin API key (different from regular API key)
TRAIT AdminService {
  // Organization management
  FUNCTION organizations() -> &OrganizationsService

  // Workspace management
  FUNCTION workspaces() -> &WorkspacesService

  // API key management
  FUNCTION api_keys() -> &ApiKeysService

  // Invite management
  FUNCTION invites() -> &InvitesService
}

STRUCT AdminServiceImpl {
  organizations_service: OrganizationsService,
  workspaces_service: WorkspacesService,
  api_keys_service: ApiKeysService,
  invites_service: InvitesService
}

FUNCTION AdminServiceImpl::new(
  transport: HttpTransport,
  auth_manager: AuthManager,
  retry_executor: RetryExecutor,
  rate_limiter: RateLimiter,
  circuit_breaker: CircuitBreaker,
  base_url: Url,
  logger: Logger,
  tracer: Tracer
) -> AdminServiceImpl

  // Create all sub-services
  organizations_service <- OrganizationsServiceImpl::new(
    transport: transport.clone(),
    auth_manager: auth_manager.clone(),
    retry_executor: retry_executor.clone(),
    rate_limiter: rate_limiter.clone(),
    circuit_breaker: circuit_breaker.clone(),
    base_url: base_url.clone(),
    logger: logger.clone(),
    tracer: tracer.clone()
  )

  workspaces_service <- WorkspacesServiceImpl::new(
    transport: transport.clone(),
    auth_manager: auth_manager.clone(),
    retry_executor: retry_executor.clone(),
    rate_limiter: rate_limiter.clone(),
    circuit_breaker: circuit_breaker.clone(),
    base_url: base_url.clone(),
    logger: logger.clone(),
    tracer: tracer.clone()
  )

  api_keys_service <- ApiKeysServiceImpl::new(
    transport: transport.clone(),
    auth_manager: auth_manager.clone(),
    retry_executor: retry_executor.clone(),
    rate_limiter: rate_limiter.clone(),
    circuit_breaker: circuit_breaker.clone(),
    base_url: base_url.clone(),
    logger: logger.clone(),
    tracer: tracer.clone()
  )

  invites_service <- InvitesServiceImpl::new(
    transport: transport.clone(),
    auth_manager: auth_manager.clone(),
    retry_executor: retry_executor.clone(),
    rate_limiter: rate_limiter.clone(),
    circuit_breaker: circuit_breaker.clone(),
    base_url: base_url.clone(),
    logger: logger.clone(),
    tracer: tracer.clone()
  )

  RETURN AdminServiceImpl {
    organizations_service,
    workspaces_service,
    api_keys_service,
    invites_service
  }
END FUNCTION

FUNCTION admin_service.organizations() -> &OrganizationsService
  RETURN &self.organizations_service
END FUNCTION

FUNCTION admin_service.workspaces() -> &WorkspacesService
  RETURN &self.workspaces_service
END FUNCTION

FUNCTION admin_service.api_keys() -> &ApiKeysService
  RETURN &self.api_keys_service
END FUNCTION

FUNCTION admin_service.invites() -> &InvitesService
  RETURN &self.invites_service
END FUNCTION
```

---

## 15. Organizations Service

### 15.1 Service Interface

```
TRAIT OrganizationsService {
  // Get organization details
  ASYNC FUNCTION get(org_id: String) -> Result<Organization, AnthropicError>

  // List organization members
  ASYNC FUNCTION list_members(org_id: String, params: Option<ListParams>) -> Result<MemberList, AnthropicError>

  // Add a member to organization
  ASYNC FUNCTION add_member(org_id: String, request: AddMemberRequest) -> Result<Member, AnthropicError>

  // Update member role
  ASYNC FUNCTION update_member(org_id: String, user_id: String, request: UpdateMemberRequest) -> Result<Member, AnthropicError>

  // Remove member from organization
  ASYNC FUNCTION remove_member(org_id: String, user_id: String) -> Result<(), AnthropicError>
}
```

### 15.2 Get Organization

```
FUNCTION organizations_service.get(org_id: String) -> Result<Organization, AnthropicError>
  // Validate org_id
  IF org_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Organization ID is required",
      details: []
    })
  END IF

  // Execute with resilience
  response <- execute_with_resilience(
    operation: "organizations.get",
    request_fn: ASYNC FUNCTION() -> Result<Organization, AnthropicError>
      endpoint <- format("/v1/organizations/{}", url_encode(org_id))

      http_request <- build_request(
        method: GET,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<Organization>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  RETURN Ok(response)
END FUNCTION
```

### 15.3 List Members

```
FUNCTION organizations_service.list_members(
  org_id: String,
  params: Option<ListParams>
) -> Result<MemberList, AnthropicError>

  // Validate org_id
  IF org_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Organization ID is required",
      details: []
    })
  END IF

  // Build query parameters
  query_params <- HashMap::new()
  IF params IS Some THEN
    IF params.limit IS Some THEN
      query_params.insert("limit", params.limit.to_string())
    END IF
    IF params.before_id IS Some THEN
      query_params.insert("before_id", params.before_id)
    END IF
    IF params.after_id IS Some THEN
      query_params.insert("after_id", params.after_id)
    END IF
  END IF

  // Execute with resilience
  response <- execute_with_resilience(
    operation: "organizations.list_members",
    request_fn: ASYNC FUNCTION() -> Result<MemberList, AnthropicError>
      // Build URL
      url <- self.base_url.join(format("/v1/organizations/{}/members", url_encode(org_id)))?
      FOR EACH (key, value) IN query_params DO
        url.query_pairs_mut().append_pair(key, value)
      END FOR

      http_request <- HttpRequest::builder()
        .method(GET)
        .url(url)
        .headers(self.auth_manager.get_headers())
        .build()?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<MemberList>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  RETURN Ok(response)
END FUNCTION
```

### 15.4 Add Member

```
FUNCTION organizations_service.add_member(
  org_id: String,
  request: AddMemberRequest
) -> Result<Member, AnthropicError>

  // Validate inputs
  IF org_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Organization ID is required",
      details: []
    })
  END IF

  validate_add_member_request(request)?

  // Execute with resilience
  response <- execute_with_resilience(
    operation: "organizations.add_member",
    request_fn: ASYNC FUNCTION() -> Result<Member, AnthropicError>
      endpoint <- format("/v1/organizations/{}/members", url_encode(org_id))

      http_request <- build_request(
        method: POST,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: Some(serialize_request_body(request)?),
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<Member>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  self.logger.info("Member added to organization", {
    org_id: org_id,
    user_id: response.user_id,
    role: response.role
  })

  RETURN Ok(response)
END FUNCTION

FUNCTION validate_add_member_request(request: AddMemberRequest) -> Result<(), RequestError>
  errors <- []

  IF request.user_id.is_empty() THEN
    errors.push(ValidationDetail {
      field: "user_id",
      message: "user_id is required"
    })
  END IF

  IF request.role NOT IN ["owner", "admin", "developer", "user"] THEN
    errors.push(ValidationDetail {
      field: "role",
      message: "Invalid role. Must be owner, admin, developer, or user"
    })
  END IF

  IF errors.is_empty() THEN
    RETURN Ok(())
  ELSE
    RETURN Error(RequestError::ValidationError {
      message: "Add member request validation failed",
      details: errors
    })
  END IF
END FUNCTION
```

### 15.5 Update Member

```
FUNCTION organizations_service.update_member(
  org_id: String,
  user_id: String,
  request: UpdateMemberRequest
) -> Result<Member, AnthropicError>

  // Validate inputs
  IF org_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Organization ID is required",
      details: []
    })
  END IF

  IF user_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "User ID is required",
      details: []
    })
  END IF

  validate_update_member_request(request)?

  // Execute with resilience
  response <- execute_with_resilience(
    operation: "organizations.update_member",
    request_fn: ASYNC FUNCTION() -> Result<Member, AnthropicError>
      endpoint <- format("/v1/organizations/{}/members/{}", url_encode(org_id), url_encode(user_id))

      http_request <- build_request(
        method: POST,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: Some(serialize_request_body(request)?),
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<Member>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  self.logger.info("Organization member updated", {
    org_id: org_id,
    user_id: user_id,
    new_role: response.role
  })

  RETURN Ok(response)
END FUNCTION
```

### 15.6 Remove Member

```
FUNCTION organizations_service.remove_member(
  org_id: String,
  user_id: String
) -> Result<(), AnthropicError>

  // Validate inputs
  IF org_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Organization ID is required",
      details: []
    })
  END IF

  IF user_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "User ID is required",
      details: []
    })
  END IF

  // Execute with resilience
  execute_with_resilience(
    operation: "organizations.remove_member",
    request_fn: ASYNC FUNCTION() -> Result<(), AnthropicError>
      endpoint <- format("/v1/organizations/{}/members/{}", url_encode(org_id), url_encode(user_id))

      http_request <- build_request(
        method: DELETE,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() OR http_response.status == 204 THEN
        RETURN Ok(())
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  self.logger.info("Member removed from organization", {
    org_id: org_id,
    user_id: user_id
  })

  RETURN Ok(())
END FUNCTION
```

---

## 16. Workspaces Service

### 16.1 Service Interface

```
TRAIT WorkspacesService {
  // List workspaces in organization
  ASYNC FUNCTION list(org_id: String, params: Option<ListParams>) -> Result<WorkspaceList, AnthropicError>

  // Create a new workspace
  ASYNC FUNCTION create(org_id: String, request: CreateWorkspaceRequest) -> Result<Workspace, AnthropicError>

  // Get workspace details
  ASYNC FUNCTION get(workspace_id: String) -> Result<Workspace, AnthropicError>

  // Update workspace
  ASYNC FUNCTION update(workspace_id: String, request: UpdateWorkspaceRequest) -> Result<Workspace, AnthropicError>

  // Archive workspace
  ASYNC FUNCTION archive(workspace_id: String) -> Result<Workspace, AnthropicError>
}
```

### 16.2 Create Workspace

```
FUNCTION workspaces_service.create(
  org_id: String,
  request: CreateWorkspaceRequest
) -> Result<Workspace, AnthropicError>

  // Validate inputs
  IF org_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Organization ID is required",
      details: []
    })
  END IF

  validate_create_workspace_request(request)?

  // Execute with resilience
  response <- execute_with_resilience(
    operation: "workspaces.create",
    request_fn: ASYNC FUNCTION() -> Result<Workspace, AnthropicError>
      endpoint <- format("/v1/organizations/{}/workspaces", url_encode(org_id))

      http_request <- build_request(
        method: POST,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: Some(serialize_request_body(request)?),
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<Workspace>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  self.logger.info("Workspace created", {
    org_id: org_id,
    workspace_id: response.id,
    name: response.name
  })

  RETURN Ok(response)
END FUNCTION

FUNCTION validate_create_workspace_request(request: CreateWorkspaceRequest) -> Result<(), RequestError>
  errors <- []

  IF request.name.is_empty() THEN
    errors.push(ValidationDetail {
      field: "name",
      message: "Workspace name is required"
    })
  END IF

  IF request.name.len() > 256 THEN
    errors.push(ValidationDetail {
      field: "name",
      message: "Workspace name cannot exceed 256 characters"
    })
  END IF

  IF errors.is_empty() THEN
    RETURN Ok(())
  ELSE
    RETURN Error(RequestError::ValidationError {
      message: "Create workspace request validation failed",
      details: errors
    })
  END IF
END FUNCTION
```

### 16.3 Get/Update/Archive Workspace

```
FUNCTION workspaces_service.get(workspace_id: String) -> Result<Workspace, AnthropicError>
  IF workspace_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Workspace ID is required",
      details: []
    })
  END IF

  response <- execute_with_resilience(
    operation: "workspaces.get",
    request_fn: ASYNC FUNCTION() -> Result<Workspace, AnthropicError>
      endpoint <- format("/v1/workspaces/{}", url_encode(workspace_id))

      http_request <- build_request(
        method: GET,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<Workspace>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  RETURN Ok(response)
END FUNCTION

FUNCTION workspaces_service.update(
  workspace_id: String,
  request: UpdateWorkspaceRequest
) -> Result<Workspace, AnthropicError>
  IF workspace_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Workspace ID is required",
      details: []
    })
  END IF

  response <- execute_with_resilience(
    operation: "workspaces.update",
    request_fn: ASYNC FUNCTION() -> Result<Workspace, AnthropicError>
      endpoint <- format("/v1/workspaces/{}", url_encode(workspace_id))

      http_request <- build_request(
        method: POST,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: Some(serialize_request_body(request)?),
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<Workspace>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  self.logger.info("Workspace updated", {
    workspace_id: workspace_id,
    name: response.name
  })

  RETURN Ok(response)
END FUNCTION

FUNCTION workspaces_service.archive(workspace_id: String) -> Result<Workspace, AnthropicError>
  IF workspace_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Workspace ID is required",
      details: []
    })
  END IF

  response <- execute_with_resilience(
    operation: "workspaces.archive",
    request_fn: ASYNC FUNCTION() -> Result<Workspace, AnthropicError>
      endpoint <- format("/v1/workspaces/{}", url_encode(workspace_id))

      http_request <- build_request(
        method: DELETE,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<Workspace>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  self.logger.info("Workspace archived", {
    workspace_id: workspace_id
  })

  RETURN Ok(response)
END FUNCTION
```

---

## 17. API Keys Service

### 17.1 Service Interface

```
TRAIT ApiKeysService {
  // List API keys in organization
  ASYNC FUNCTION list(org_id: String, params: Option<ListParams>) -> Result<ApiKeyList, AnthropicError>

  // Get API key details
  ASYNC FUNCTION get(key_id: String) -> Result<ApiKeyInfo, AnthropicError>

  // Update API key
  ASYNC FUNCTION update(key_id: String, request: UpdateApiKeyRequest) -> Result<ApiKeyInfo, AnthropicError>
}
```

### 17.2 List API Keys

```
FUNCTION api_keys_service.list(
  org_id: String,
  params: Option<ListParams>
) -> Result<ApiKeyList, AnthropicError>

  IF org_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Organization ID is required",
      details: []
    })
  END IF

  // Build query parameters
  query_params <- HashMap::new()
  IF params IS Some THEN
    IF params.limit IS Some THEN
      query_params.insert("limit", params.limit.to_string())
    END IF
    IF params.before_id IS Some THEN
      query_params.insert("before_id", params.before_id)
    END IF
    IF params.after_id IS Some THEN
      query_params.insert("after_id", params.after_id)
    END IF
  END IF

  response <- execute_with_resilience(
    operation: "api_keys.list",
    request_fn: ASYNC FUNCTION() -> Result<ApiKeyList, AnthropicError>
      url <- self.base_url.join(format("/v1/organizations/{}/api_keys", url_encode(org_id)))?
      FOR EACH (key, value) IN query_params DO
        url.query_pairs_mut().append_pair(key, value)
      END FOR

      http_request <- HttpRequest::builder()
        .method(GET)
        .url(url)
        .headers(self.auth_manager.get_headers())
        .build()?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<ApiKeyList>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  RETURN Ok(response)
END FUNCTION
```

### 17.3 Get/Update API Key

```
FUNCTION api_keys_service.get(key_id: String) -> Result<ApiKeyInfo, AnthropicError>
  IF key_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "API Key ID is required",
      details: []
    })
  END IF

  response <- execute_with_resilience(
    operation: "api_keys.get",
    request_fn: ASYNC FUNCTION() -> Result<ApiKeyInfo, AnthropicError>
      endpoint <- format("/v1/api_keys/{}", url_encode(key_id))

      http_request <- build_request(
        method: GET,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<ApiKeyInfo>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  RETURN Ok(response)
END FUNCTION

FUNCTION api_keys_service.update(
  key_id: String,
  request: UpdateApiKeyRequest
) -> Result<ApiKeyInfo, AnthropicError>

  IF key_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "API Key ID is required",
      details: []
    })
  END IF

  response <- execute_with_resilience(
    operation: "api_keys.update",
    request_fn: ASYNC FUNCTION() -> Result<ApiKeyInfo, AnthropicError>
      endpoint <- format("/v1/api_keys/{}", url_encode(key_id))

      http_request <- build_request(
        method: POST,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: Some(serialize_request_body(request)?),
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<ApiKeyInfo>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  self.logger.info("API key updated", {
    key_id: key_id,
    name: response.name
  })

  RETURN Ok(response)
END FUNCTION
```

---

## 18. Invites Service

### 18.1 Service Interface

```
TRAIT InvitesService {
  // List invites in organization
  ASYNC FUNCTION list(org_id: String, params: Option<ListParams>) -> Result<InviteList, AnthropicError>

  // Create a new invite
  ASYNC FUNCTION create(org_id: String, request: CreateInviteRequest) -> Result<Invite, AnthropicError>

  // Get invite details
  ASYNC FUNCTION get(invite_id: String) -> Result<Invite, AnthropicError>

  // Delete invite
  ASYNC FUNCTION delete(invite_id: String) -> Result<(), AnthropicError>
}
```

### 18.2 Create Invite

```
FUNCTION invites_service.create(
  org_id: String,
  request: CreateInviteRequest
) -> Result<Invite, AnthropicError>

  IF org_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Organization ID is required",
      details: []
    })
  END IF

  validate_create_invite_request(request)?

  response <- execute_with_resilience(
    operation: "invites.create",
    request_fn: ASYNC FUNCTION() -> Result<Invite, AnthropicError>
      endpoint <- format("/v1/organizations/{}/invites", url_encode(org_id))

      http_request <- build_request(
        method: POST,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: Some(serialize_request_body(request)?),
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<Invite>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  self.logger.info("Invite created", {
    org_id: org_id,
    invite_id: response.id,
    email: response.email
  })

  RETURN Ok(response)
END FUNCTION

FUNCTION validate_create_invite_request(request: CreateInviteRequest) -> Result<(), RequestError>
  errors <- []

  // Validate email
  IF request.email.is_empty() THEN
    errors.push(ValidationDetail {
      field: "email",
      message: "Email is required"
    })
  ELSE IF NOT is_valid_email(request.email) THEN
    errors.push(ValidationDetail {
      field: "email",
      message: "Invalid email format"
    })
  END IF

  // Validate role
  IF request.role NOT IN ["owner", "admin", "developer", "user"] THEN
    errors.push(ValidationDetail {
      field: "role",
      message: "Invalid role. Must be owner, admin, developer, or user"
    })
  END IF

  IF errors.is_empty() THEN
    RETURN Ok(())
  ELSE
    RETURN Error(RequestError::ValidationError {
      message: "Create invite request validation failed",
      details: errors
    })
  END IF
END FUNCTION
```

### 18.3 Get/Delete Invite

```
FUNCTION invites_service.get(invite_id: String) -> Result<Invite, AnthropicError>
  IF invite_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Invite ID is required",
      details: []
    })
  END IF

  response <- execute_with_resilience(
    operation: "invites.get",
    request_fn: ASYNC FUNCTION() -> Result<Invite, AnthropicError>
      endpoint <- format("/v1/invites/{}", url_encode(invite_id))

      http_request <- build_request(
        method: GET,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<Invite>(http_response, self.logger)
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  RETURN Ok(response)
END FUNCTION

FUNCTION invites_service.delete(invite_id: String) -> Result<(), AnthropicError>
  IF invite_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Invite ID is required",
      details: []
    })
  END IF

  execute_with_resilience(
    operation: "invites.delete",
    request_fn: ASYNC FUNCTION() -> Result<(), AnthropicError>
      endpoint <- format("/v1/invites/{}", url_encode(invite_id))

      http_request <- build_request(
        method: DELETE,
        endpoint: endpoint,
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: HeaderMap::new()
      )?

      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() OR http_response.status == 204 THEN
        RETURN Ok(())
      ELSE
        error <- parse_error_response(
          http_response.status,
          http_response.body,
          http_response.headers
        )
        RETURN Error(error)
      END IF
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  self.logger.info("Invite deleted", {
    invite_id: invite_id
  })

  RETURN Ok(())
END FUNCTION
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode (Part 3) |

---

**Continued in Part 4: Beta Features, Error Handling, and Testing Patterns**
