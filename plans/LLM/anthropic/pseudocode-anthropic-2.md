# Anthropic Integration Module - Pseudocode (Part 2)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/anthropic`
**File:** 2 of 4 - Resilience, Messages Service, Streaming Handler, Models Service

---

## Table of Contents (Part 2)

8. [Resilience Orchestrator](#8-resilience-orchestrator)
9. [Messages Service](#9-messages-service)
10. [Streaming Handler](#10-streaming-handler)
11. [Models Service](#11-models-service)
12. [Token Counting](#12-token-counting)

---

## 8. Resilience Orchestrator

### 8.1 Orchestrated Request Execution

```
FUNCTION execute_with_resilience<T>(
  operation: String,
  request_fn: Fn() -> Future<Result<T, AnthropicError>>,
  retry_executor: RetryExecutor,
  rate_limiter: RateLimiter,
  circuit_breaker: CircuitBreaker,
  tracer: Tracer,
  logger: Logger
) -> Result<T, AnthropicError>

  // Start tracing span (integrations-tracing primitive)
  span <- tracer.start_span(format("anthropic.{}", operation))
  span.set_attribute("anthropic.operation", operation)

  TRY
    // Step 1: Check circuit breaker state
    IF circuit_breaker.is_open() THEN
      span.set_attribute("circuit_breaker.state", "open")
      span.set_attribute("circuit_breaker.rejected", true)

      logger.warn("Circuit breaker open, rejecting request", {
        operation,
        time_until_half_open: circuit_breaker.time_until_half_open()
      })

      RETURN Error(ServerError::ServiceUnavailable {
        retry_after: circuit_breaker.time_until_half_open(),
        message: "Circuit breaker is open"
      })
    END IF

    // Step 2: Acquire rate limit permit
    rate_limit_result <- rate_limiter.acquire().await
    MATCH rate_limit_result
      CASE RateLimitResult::Acquired:
        span.set_attribute("rate_limited", false)

      CASE RateLimitResult::Delayed(wait_time):
        span.set_attribute("rate_limited", true)
        span.set_attribute("rate_limit.delay_ms", wait_time.as_millis())

        logger.info("Rate limited, waiting", {
          operation,
          wait_time_ms: wait_time.as_millis()
        })

        // Wait for permit
        sleep(wait_time).await
        rate_limiter.acquire().await?

      CASE RateLimitResult::Rejected:
        span.set_attribute("rate_limited", true)
        span.set_attribute("rate_limit.rejected", true)

        RETURN Error(RateLimitError::ConcurrentRequestLimit {
          message: "Too many concurrent requests"
        })
    END MATCH

    // Step 3: Execute with retry logic
    result <- retry_executor.execute(
      operation: operation,
      action: ASYNC FUNCTION(attempt: u32) -> Result<T, AnthropicError>
        span.add_event("retry_attempt", { attempt })

        TRY
          response <- request_fn().await?

          // Record success with circuit breaker
          circuit_breaker.record_success()

          RETURN Ok(response)

        CATCH error: AnthropicError
          // Check if error is retryable
          IF error.is_retryable() THEN
            circuit_breaker.record_failure()
            span.add_event("retryable_error", {
              attempt,
              error_type: error.error_type(),
              retryable: true
            })
            RETURN Error(error)  // Will trigger retry
          ELSE
            // Non-retryable error - fail immediately
            span.record_error(error)
            RETURN Error(error)
          END IF
        END TRY
      END FUNCTION
    ).await

    span.set_status(OK)
    RETURN result

  CATCH error: AnthropicError
    span.record_error(error)
    span.set_status(ERROR)
    RETURN Error(error)

  FINALLY
    span.end()
  END TRY
END FUNCTION
```

### 8.2 Retry Executor Implementation

```
FUNCTION retry_executor.execute<T>(
  operation: String,
  action: Fn(u32) -> Future<Result<T, AnthropicError>>
) -> Result<T, AnthropicError>

  attempt <- 0
  last_error <- None

  WHILE attempt <= self.config.max_retries DO
    attempt <- attempt + 1

    TRY
      result <- action(attempt).await
      RETURN Ok(result)

    CATCH error: AnthropicError
      last_error <- Some(error.clone())

      // Check if we should retry
      IF NOT error.is_retryable() THEN
        self.logger.debug("Non-retryable error, failing immediately", {
          operation,
          attempt,
          error_type: error.error_type(),
          error_message: error.to_string()
        })
        RETURN Error(error)
      END IF

      // Check if we have retries left
      IF attempt >= self.config.max_retries THEN
        self.logger.warn("Retries exhausted", {
          operation,
          total_attempts: attempt,
          error_type: error.error_type()
        })
        RETURN Error(error)
      END IF

      // Calculate backoff delay
      delay <- calculate_backoff(
        attempt: attempt,
        initial: self.config.initial_backoff,
        max: self.config.max_backoff,
        multiplier: self.config.backoff_multiplier,
        jitter: self.config.jitter
      )

      // Use retry-after from error if available and longer
      IF error.retry_after() IS Some THEN
        server_delay <- error.retry_after().unwrap()
        IF server_delay > delay THEN
          delay <- server_delay
        END IF
      END IF

      self.logger.info("Retrying after error", {
        operation,
        attempt,
        delay_ms: delay.as_millis(),
        error_type: error.error_type(),
        next_attempt: attempt + 1
      })

      // Call retry hook if present (for custom retry logic)
      IF self.retry_hook IS Some THEN
        decision <- self.retry_hook.on_retry(RetryContext {
          attempt,
          error: error.clone(),
          delay,
          operation: operation.clone()
        }).await

        MATCH decision
          CASE RetryDecision::Abort:
            self.logger.debug("Retry aborted by hook", { operation, attempt })
            RETURN Error(error)
          CASE RetryDecision::Retry(custom_delay):
            delay <- custom_delay
          CASE RetryDecision::Default:
            // Use calculated delay
        END MATCH
      END IF

      // Wait before retry
      sleep(delay).await
    END TRY
  END WHILE

  // Should not reach here, but handle gracefully
  RETURN Error(last_error.unwrap_or(ServerError::InternalError {
    message: "Retry loop completed unexpectedly"
  }))
END FUNCTION

FUNCTION calculate_backoff(
  attempt: u32,
  initial: Duration,
  max: Duration,
  multiplier: f64,
  jitter: f64
) -> Duration

  // Exponential backoff: initial * multiplier^(attempt-1)
  base_delay_ms <- initial.as_millis() * (multiplier.pow((attempt - 1) as f64))

  // Apply jitter (randomize by +/- jitter factor)
  jitter_range <- base_delay_ms * jitter
  jitter_offset <- random_range(-jitter_range, jitter_range)
  delay_with_jitter <- base_delay_ms + jitter_offset

  // Clamp to max
  final_delay_ms <- min(delay_with_jitter, max.as_millis())

  // Ensure minimum delay
  final_delay_ms <- max(final_delay_ms, 100.0)  // At least 100ms

  RETURN Duration::from_millis(final_delay_ms as u64)
END FUNCTION
```

### 8.3 Circuit Breaker Implementation

```
STRUCT CircuitBreaker {
  state: CircuitState,
  state_mutex: Mutex,
  stats: CircuitBreakerStats,
  config: CircuitBreakerConfig,
  state_changed_at: Instant,
  window_start: Instant,
  window_failure_count: u32,
  consecutive_successes: u32,
  logger: Logger,
  hook: Option<CircuitBreakerHook>
}

ENUM CircuitState {
  Closed,    // Normal operation
  Open,      // Rejecting requests
  HalfOpen   // Testing if service recovered
}

FUNCTION circuit_breaker.is_open() -> bool
  LOCK self.state_mutex
    MATCH self.state
      CASE CircuitState::Closed:
        RETURN false

      CASE CircuitState::Open:
        // Check if recovery timeout has passed
        time_in_open <- now() - self.state_changed_at
        IF time_in_open > self.config.reset_timeout THEN
          self.transition_to(CircuitState::HalfOpen)
          RETURN false  // Allow one request through
        END IF
        RETURN true

      CASE CircuitState::HalfOpen:
        // In half-open, allow limited requests for testing
        RETURN false
    END MATCH
  END LOCK
END FUNCTION

FUNCTION circuit_breaker.time_until_half_open() -> Option<Duration>
  LOCK self.state_mutex
    IF self.state != CircuitState::Open THEN
      RETURN None
    END IF

    time_in_open <- now() - self.state_changed_at
    IF time_in_open >= self.config.reset_timeout THEN
      RETURN Some(Duration::ZERO)
    END IF

    RETURN Some(self.config.reset_timeout - time_in_open)
  END LOCK
END FUNCTION

FUNCTION circuit_breaker.record_success()
  LOCK self.state_mutex
    self.stats.success_count <- self.stats.success_count + 1
    self.stats.total_requests <- self.stats.total_requests + 1

    MATCH self.state
      CASE CircuitState::HalfOpen:
        self.consecutive_successes <- self.consecutive_successes + 1
        IF self.consecutive_successes >= self.config.success_threshold THEN
          self.transition_to(CircuitState::Closed)
        END IF

      CASE CircuitState::Closed:
        // Reset failure window if expired
        IF now() - self.window_start > self.config.failure_window THEN
          self.reset_window()
        END IF

      CASE CircuitState::Open:
        // Should not happen - log and transition to half-open
        self.logger.warn("Success recorded in open state", {})
        self.transition_to(CircuitState::HalfOpen)
    END MATCH
  END LOCK

  // Notify hook asynchronously
  IF self.hook IS Some THEN
    spawn(self.hook.on_outcome(RequestOutcome::Success))
  END IF
END FUNCTION

FUNCTION circuit_breaker.record_failure()
  LOCK self.state_mutex
    self.stats.failure_count <- self.stats.failure_count + 1
    self.stats.total_requests <- self.stats.total_requests + 1
    self.stats.last_failure <- Some(now())
    self.window_failure_count <- self.window_failure_count + 1

    MATCH self.state
      CASE CircuitState::Closed:
        // Check if failure threshold reached in current window
        IF self.window_failure_count >= self.config.failure_threshold THEN
          self.transition_to(CircuitState::Open)
        ELSE IF now() - self.window_start > self.config.failure_window THEN
          // Window expired, reset and start new window
          self.reset_window()
          self.window_failure_count <- 1
        END IF

      CASE CircuitState::HalfOpen:
        // Any failure in half-open returns to open
        self.transition_to(CircuitState::Open)

      CASE CircuitState::Open:
        // Already open, just update stats
    END MATCH
  END LOCK

  // Notify hook asynchronously
  IF self.hook IS Some THEN
    spawn(self.hook.on_outcome(RequestOutcome::Failure))
  END IF
END FUNCTION

FUNCTION circuit_breaker.transition_to(new_state: CircuitState)
  old_state <- self.state
  self.state <- new_state
  self.state_changed_at <- now()

  // Reset state-specific counters
  MATCH new_state
    CASE CircuitState::Closed:
      self.reset_window()

    CASE CircuitState::HalfOpen:
      self.consecutive_successes <- 0

    CASE CircuitState::Open:
      // Nothing to reset
  END MATCH

  self.logger.info("Circuit breaker state changed", {
    from: old_state.to_string(),
    to: new_state.to_string(),
    stats: {
      success_count: self.stats.success_count,
      failure_count: self.stats.failure_count,
      total_requests: self.stats.total_requests
    }
  })

  // Notify hook asynchronously
  IF self.hook IS Some THEN
    spawn(self.hook.on_state_change(old_state, new_state, self.stats.clone()))
  END IF
END FUNCTION

FUNCTION circuit_breaker.reset_window()
  self.window_start <- now()
  self.window_failure_count <- 0
END FUNCTION
```

---

## 9. Messages Service

### 9.1 Service Interface (London-School TDD Contract)

```
// Interface that can be mocked for testing
TRAIT MessagesService {
  // Create a message (non-streaming)
  ASYNC FUNCTION create(request: CreateMessageRequest) -> Result<Message, AnthropicError>

  // Create a message with streaming response
  ASYNC FUNCTION create_stream(request: CreateMessageRequest) -> Result<MessageStream, AnthropicError>

  // Count tokens for a message request
  ASYNC FUNCTION count_tokens(request: CountTokensRequest) -> Result<TokenCount, AnthropicError>
}

// Production implementation
STRUCT MessagesServiceImpl {
  transport: HttpTransport,
  auth_manager: AuthManager,
  retry_executor: RetryExecutor,
  rate_limiter: RateLimiter,
  circuit_breaker: CircuitBreaker,
  base_url: Url,
  logger: Logger,
  tracer: Tracer,
  metrics_hook: Option<MetricsHook>
}

// Mock implementation for testing
STRUCT MockMessagesService {
  create_responses: Vec<Result<Message, AnthropicError>>,
  stream_responses: Vec<Result<MockMessageStream, AnthropicError>>,
  count_responses: Vec<Result<TokenCount, AnthropicError>>,
  call_history: Vec<RequestRecord>
}
```

### 9.2 Service Initialization

```
FUNCTION MessagesServiceImpl::new(
  transport: HttpTransport,
  auth_manager: AuthManager,
  retry_executor: RetryExecutor,
  rate_limiter: RateLimiter,
  circuit_breaker: CircuitBreaker,
  base_url: Url,
  logger: Logger,
  tracer: Tracer
) -> MessagesServiceImpl

  RETURN MessagesServiceImpl {
    transport,
    auth_manager,
    retry_executor,
    rate_limiter,
    circuit_breaker,
    base_url,
    logger,
    tracer,
    metrics_hook: None,
    endpoint: "/v1/messages"
  }
END FUNCTION
```

### 9.3 Create Message (Non-Streaming)

```
FUNCTION messages_service.create(
  request: CreateMessageRequest
) -> Result<Message, AnthropicError>

  // Step 1: Validate request
  validate_create_message_request(request)?

  // Step 2: Ensure stream is false for non-streaming
  request_copy <- request.clone()
  request_copy.stream <- Some(false)

  // Step 3: Execute with resilience orchestration
  response <- execute_with_resilience(
    operation: "messages.create",
    request_fn: ASYNC FUNCTION() -> Result<Message, AnthropicError>
      RETURN self.execute_create_request(request_copy).await
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  // Step 4: Update rate limiter with token usage
  IF response.usage IS Some THEN
    self.rate_limiter.record_tokens(
      response.usage.input_tokens + response.usage.output_tokens
    )
  END IF

  // Step 5: Record metrics
  self.record_metrics(response)

  RETURN Ok(response)
END FUNCTION

FUNCTION messages_service.execute_create_request(
  request: CreateMessageRequest
) -> Result<Message, AnthropicError>

  // Build HTTP request
  http_request <- build_request(
    method: POST,
    endpoint: self.endpoint,
    base_url: self.base_url,
    auth_manager: self.auth_manager,
    body: Some(serialize_request_body(request)?),
    extra_headers: HeaderMap::new()
  )?

  // Execute request
  http_response <- self.transport.send(http_request).await?

  // Parse rate limit headers for tracking
  rate_limit_headers <- parse_rate_limit_headers(http_response.headers)
  self.rate_limiter.update_from_headers(rate_limit_headers)

  // Handle response based on status
  IF http_response.status.is_success() THEN
    // Parse successful response
    message <- parse_response::<Message>(
      http_response,
      self.logger
    )?

    self.logger.debug("Message created", {
      message_id: message.id,
      model: message.model,
      stop_reason: message.stop_reason,
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens
    })

    RETURN Ok(message)

  ELSE
    // Parse and return error
    error <- parse_error_response(
      http_response.status,
      http_response.body,
      http_response.headers
    )
    RETURN Error(error)
  END IF
END FUNCTION
```

### 9.4 Request Validation

```
FUNCTION validate_create_message_request(request: CreateMessageRequest) -> Result<(), RequestError>
  errors <- []

  // Validate model (required)
  IF request.model.is_empty() THEN
    errors.push(ValidationDetail {
      field: "model",
      message: "Model is required"
    })
  END IF

  // Validate max_tokens (required)
  IF request.max_tokens <= 0 THEN
    errors.push(ValidationDetail {
      field: "max_tokens",
      message: "max_tokens must be greater than 0"
    })
  END IF

  // Validate messages (required, non-empty)
  IF request.messages.is_empty() THEN
    errors.push(ValidationDetail {
      field: "messages",
      message: "At least one message is required"
    })
  END IF

  // Validate message structure
  FOR EACH (index, message) IN request.messages.enumerate() DO
    // Validate role
    IF message.role NOT IN ["user", "assistant"] THEN
      errors.push(ValidationDetail {
        field: format("messages[{}].role", index),
        message: format("Invalid role '{}'. Must be 'user' or 'assistant'", message.role)
      })
    END IF

    // Validate content
    MATCH message.content
      CASE ContentType::Text(text):
        IF message.role == "user" AND text.is_empty() THEN
          errors.push(ValidationDetail {
            field: format("messages[{}].content", index),
            message: "User message content cannot be empty"
          })
        END IF

      CASE ContentType::Blocks(blocks):
        IF blocks.is_empty() THEN
          errors.push(ValidationDetail {
            field: format("messages[{}].content", index),
            message: "Content blocks array cannot be empty"
          })
        END IF

        // Validate each content block
        FOR EACH (block_index, block) IN blocks.enumerate() DO
          validate_content_block(block, index, block_index, errors)
        END FOR
    END MATCH
  END FOR

  // Validate message alternation (user/assistant must alternate)
  validate_message_alternation(request.messages, errors)

  // Validate temperature (if provided)
  IF request.temperature IS Some THEN
    IF request.temperature < 0.0 OR request.temperature > 1.0 THEN
      errors.push(ValidationDetail {
        field: "temperature",
        message: "Temperature must be between 0.0 and 1.0"
      })
    END IF
  END IF

  // Validate top_p (if provided)
  IF request.top_p IS Some THEN
    IF request.top_p < 0.0 OR request.top_p > 1.0 THEN
      errors.push(ValidationDetail {
        field: "top_p",
        message: "top_p must be between 0.0 and 1.0"
      })
    END IF
  END IF

  // Validate top_k (if provided)
  IF request.top_k IS Some THEN
    IF request.top_k < 1 THEN
      errors.push(ValidationDetail {
        field: "top_k",
        message: "top_k must be at least 1"
      })
    END IF
  END IF

  // Validate tools (if provided)
  IF request.tools IS Some THEN
    FOR EACH (index, tool) IN request.tools.enumerate() DO
      validate_tool_definition(tool, index, errors)
    END FOR
  END IF

  // Validate tool_choice (if provided)
  IF request.tool_choice IS Some AND request.tools IS None THEN
    errors.push(ValidationDetail {
      field: "tool_choice",
      message: "tool_choice requires tools to be defined"
    })
  END IF

  // Validate thinking config (if provided)
  IF request.thinking IS Some THEN
    validate_thinking_config(request.thinking, request.model, errors)
  END IF

  // Return result
  IF errors.is_empty() THEN
    RETURN Ok(())
  ELSE
    RETURN Error(RequestError::ValidationError {
      message: "Request validation failed",
      details: errors
    })
  END IF
END FUNCTION

FUNCTION validate_content_block(block: ContentBlock, msg_index: usize, block_index: usize, errors: &mut Vec<ValidationDetail>)
  prefix <- format("messages[{}].content[{}]", msg_index, block_index)

  MATCH block
    CASE ContentBlock::Text { text, .. }:
      // Text blocks can be empty (for assistant responses)
      // No validation needed

    CASE ContentBlock::Image { source, .. }:
      IF source.type != "base64" THEN
        errors.push(ValidationDetail {
          field: format("{}.source.type", prefix),
          message: "Image source type must be 'base64'"
        })
      END IF

      IF source.media_type NOT IN ["image/jpeg", "image/png", "image/gif", "image/webp"] THEN
        errors.push(ValidationDetail {
          field: format("{}.source.media_type", prefix),
          message: "Unsupported image media type"
        })
      END IF

      IF source.data.is_empty() THEN
        errors.push(ValidationDetail {
          field: format("{}.source.data", prefix),
          message: "Image data cannot be empty"
        })
      END IF

    CASE ContentBlock::Document { source, .. }:
      IF source.type != "base64" THEN
        errors.push(ValidationDetail {
          field: format("{}.source.type", prefix),
          message: "Document source type must be 'base64'"
        })
      END IF

      IF source.media_type != "application/pdf" THEN
        errors.push(ValidationDetail {
          field: format("{}.source.media_type", prefix),
          message: "Document must be PDF (application/pdf)"
        })
      END IF

    CASE ContentBlock::ToolUse { id, name, input, .. }:
      IF id.is_empty() THEN
        errors.push(ValidationDetail {
          field: format("{}.id", prefix),
          message: "Tool use id is required"
        })
      END IF

      IF name.is_empty() THEN
        errors.push(ValidationDetail {
          field: format("{}.name", prefix),
          message: "Tool use name is required"
        })
      END IF

    CASE ContentBlock::ToolResult { tool_use_id, .. }:
      IF tool_use_id.is_empty() THEN
        errors.push(ValidationDetail {
          field: format("{}.tool_use_id", prefix),
          message: "Tool result tool_use_id is required"
        })
      END IF
  END MATCH
END FUNCTION

FUNCTION validate_message_alternation(messages: Vec<Message>, errors: &mut Vec<ValidationDetail>)
  // First message should be from user
  IF NOT messages.is_empty() AND messages[0].role != "user" THEN
    errors.push(ValidationDetail {
      field: "messages[0].role",
      message: "First message must be from user"
    })
  END IF

  // Check alternation
  FOR i IN 1..messages.len() DO
    IF messages[i].role == messages[i-1].role THEN
      // Same role twice - check if it's assistant with tool use
      IF messages[i].role == "assistant" THEN
        // Assistant can have consecutive messages for tool results
        // This is valid
        CONTINUE
      END IF

      errors.push(ValidationDetail {
        field: format("messages[{}].role", i),
        message: "Messages must alternate between user and assistant"
      })
    END IF
  END FOR
END FUNCTION

FUNCTION validate_tool_definition(tool: Tool, index: usize, errors: &mut Vec<ValidationDetail>)
  prefix <- format("tools[{}]", index)

  IF tool.name.is_empty() THEN
    errors.push(ValidationDetail {
      field: format("{}.name", prefix),
      message: "Tool name is required"
    })
  ELSE IF NOT is_valid_tool_name(tool.name) THEN
    errors.push(ValidationDetail {
      field: format("{}.name", prefix),
      message: "Tool name must match pattern [a-zA-Z0-9_-]+"
    })
  END IF

  IF tool.description.is_empty() THEN
    errors.push(ValidationDetail {
      field: format("{}.description", prefix),
      message: "Tool description is required"
    })
  END IF

  // input_schema is required and must be valid JSON Schema
  IF tool.input_schema IS None THEN
    errors.push(ValidationDetail {
      field: format("{}.input_schema", prefix),
      message: "Tool input_schema is required"
    })
  END IF
END FUNCTION

FUNCTION validate_thinking_config(thinking: ThinkingConfig, model: String, errors: &mut Vec<ValidationDetail>)
  // Extended thinking only supported on certain models
  CONST THINKING_MODELS = ["claude-sonnet-4-20250514", "claude-3-7-sonnet-20250219"]

  IF thinking.type == "enabled" THEN
    IF model NOT IN THINKING_MODELS THEN
      errors.push(ValidationDetail {
        field: "thinking",
        message: format("Extended thinking not supported for model {}", model)
      })
    END IF

    IF thinking.budget_tokens IS None THEN
      errors.push(ValidationDetail {
        field: "thinking.budget_tokens",
        message: "budget_tokens is required when thinking is enabled"
      })
    ELSE IF thinking.budget_tokens < 1024 THEN
      errors.push(ValidationDetail {
        field: "thinking.budget_tokens",
        message: "budget_tokens must be at least 1024"
      })
    END IF
  END IF
END FUNCTION
```

### 9.5 Metrics Recording

```
FUNCTION messages_service.record_metrics(response: Message)
  IF self.metrics_hook IS None THEN
    RETURN
  END IF

  // Record token usage
  self.metrics_hook.record_counter(
    "anthropic_tokens_total",
    response.usage.input_tokens,
    { model: response.model, direction: "input" }
  )

  self.metrics_hook.record_counter(
    "anthropic_tokens_total",
    response.usage.output_tokens,
    { model: response.model, direction: "output" }
  )

  // Record cache usage if present
  IF response.usage.cache_creation_input_tokens IS Some THEN
    self.metrics_hook.record_counter(
      "anthropic_cache_hits_total",
      response.usage.cache_creation_input_tokens,
      { type: "creation" }
    )
  END IF

  IF response.usage.cache_read_input_tokens IS Some THEN
    self.metrics_hook.record_counter(
      "anthropic_cache_hits_total",
      response.usage.cache_read_input_tokens,
      { type: "read" }
    )
  END IF

  // Record stop reason
  IF response.stop_reason IS Some THEN
    self.metrics_hook.record_counter(
      "anthropic_stop_reasons_total",
      1,
      { model: response.model, reason: response.stop_reason }
    )
  END IF

  // Record request success
  self.metrics_hook.record_counter(
    "anthropic_requests_total",
    1,
    { service: "messages", operation: "create", model: response.model, status: "success" }
  )
END FUNCTION
```

---

## 10. Streaming Handler

### 10.1 Create Streaming Message

```
FUNCTION messages_service.create_stream(
  request: CreateMessageRequest
) -> Result<MessageStream, AnthropicError>

  // Step 1: Validate request
  validate_create_message_request(request)?

  // Step 2: Ensure stream is true
  request_copy <- request.clone()
  request_copy.stream <- Some(true)

  // Step 3: Check circuit breaker (no retry for streams - they're long-running)
  IF self.circuit_breaker.is_open() THEN
    RETURN Error(ServerError::ServiceUnavailable {
      retry_after: self.circuit_breaker.time_until_half_open(),
      message: "Circuit breaker is open"
    })
  END IF

  // Step 4: Acquire rate limit permit
  self.rate_limiter.acquire().await?

  // Step 5: Build streaming request
  http_request <- build_streaming_request(
    endpoint: self.endpoint,
    base_url: self.base_url,
    auth_manager: self.auth_manager,
    body: serialize_request_body(request_copy)?
  )?

  // Step 6: Start tracing span for stream lifetime
  span <- self.tracer.start_span("anthropic.messages.stream")
  span.set_attribute("anthropic.model", request.model)
  span.set_attribute("anthropic.streaming", true)

  // Step 7: Execute streaming request
  TRY
    sse_stream <- self.transport.send_streaming(http_request).await?

    // Record success for circuit breaker (connection established)
    self.circuit_breaker.record_success()

    // Step 8: Create MessageStream wrapper
    message_stream <- MessageStream::new(
      sse_stream: sse_stream,
      circuit_breaker: self.circuit_breaker.clone(),
      rate_limiter: self.rate_limiter.clone(),
      logger: self.logger.clone(),
      span: span,
      metrics_hook: self.metrics_hook.clone()
    )

    RETURN Ok(message_stream)

  CATCH error
    self.circuit_breaker.record_failure()
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 10.2 MessageStream Structure

```
STRUCT MessageStream {
  sse_stream: SseStream,
  buffer: String,
  circuit_breaker: CircuitBreaker,
  rate_limiter: RateLimiter,
  logger: Logger,
  span: Span,
  metrics_hook: Option<MetricsHook>,

  // State tracking
  is_done: bool,
  current_message: Option<PartialMessage>,
  content_blocks: Vec<ContentBlock>,
  total_input_tokens: u32,
  total_output_tokens: u32,
  error_occurred: bool
}

STRUCT PartialMessage {
  id: String,
  model: String,
  role: String,
  stop_reason: Option<String>,
  stop_sequence: Option<String>
}

// MessageStream implements AsyncIterator<Item = Result<MessageStreamEvent, AnthropicError>>
```

### 10.3 Stream Event Processing

```
// Implement AsyncIterator for MessageStream
FUNCTION message_stream.next() -> Option<Result<MessageStreamEvent, AnthropicError>>
  IF self.is_done THEN
    RETURN None
  END IF

  LOOP
    // Try to parse a complete SSE event from buffer
    sse_event <- self.try_parse_sse_event()

    IF sse_event IS Some THEN
      MATCH sse_event
        CASE SseEvent::Data(data):
          // Check for [DONE] marker (Anthropic doesn't use this, but handle it)
          IF data.trim() == "[DONE]" THEN
            self.finish_stream()
            RETURN None
          END IF

          // Parse as MessageStreamEvent
          TRY
            event <- deserialize_json::<MessageStreamEvent>(data)?
            result <- self.process_event(event)
            RETURN result
          CATCH DeserializeError AS e
            self.logger.warn("Failed to parse stream event", {
              error: e.to_string(),
              data: truncate(data, 200)
            })
            // Continue to next event
            CONTINUE
          END TRY

        CASE SseEvent::Event(event_type, data):
          // Handle named events
          IF event_type == "error" THEN
            TRY
              error_event <- deserialize_json::<StreamErrorEvent>(data)?
              self.error_occurred <- true
              RETURN Some(Error(ResponseError::StreamError {
                error_type: error_event.error.type,
                message: error_event.error.message
              }))
            CATCH
              RETURN Some(Error(ResponseError::StreamError {
                error_type: "unknown",
                message: data
              }))
            END TRY
          END IF

          // Process as data event
          TRY
            event <- deserialize_json::<MessageStreamEvent>(data)?
            result <- self.process_event(event)
            RETURN result
          CATCH
            CONTINUE
          END TRY

        CASE SseEvent::Comment:
          // Ignore comments (keep-alive)
          CONTINUE

        CASE SseEvent::Retry(ms):
          // Note retry suggestion
          self.logger.debug("Server suggested retry interval", { retry_ms: ms })
          CONTINUE
      END MATCH
    END IF

    // Need more data - read from underlying stream
    TRY
      bytes <- self.sse_stream.next().await

      IF bytes IS None THEN
        // Stream ended
        IF NOT self.is_done THEN
          // Unexpected end - record as potential failure
          IF self.current_message IS None THEN
            self.circuit_breaker.record_failure()
            RETURN Some(Error(ResponseError::StreamInterrupted {
              message: "Stream ended without receiving message_start"
            }))
          ELSE
            // Got some data but no message_stop - soft failure
            self.logger.warn("Stream ended without message_stop", {
              message_id: self.current_message.id
            })
            self.finish_stream()
          END IF
        END IF
        RETURN None
      END IF

      // Append to buffer
      self.buffer.push_str(String::from_utf8_lossy(bytes))

    CATCH IoError AS e
      self.circuit_breaker.record_failure()
      self.error_occurred <- true
      RETURN Some(Error(NetworkError::ConnectionFailed {
        message: e.to_string()
      }))
    END TRY
  END LOOP
END FUNCTION
```

### 10.4 Event Processing Logic

```
FUNCTION message_stream.process_event(event: MessageStreamEvent) -> Option<Result<MessageStreamEvent, AnthropicError>>
  MATCH event.type
    CASE "message_start":
      // Initialize message tracking
      self.current_message <- Some(PartialMessage {
        id: event.message.id,
        model: event.message.model,
        role: event.message.role,
        stop_reason: None,
        stop_sequence: None
      })

      // Track initial usage
      IF event.message.usage IS Some THEN
        self.total_input_tokens <- event.message.usage.input_tokens
      END IF

      self.span.set_attribute("anthropic.message_id", event.message.id)
      self.logger.debug("Stream message started", {
        message_id: event.message.id,
        model: event.message.model
      })

      RETURN Some(Ok(event))

    CASE "content_block_start":
      // Track content block
      self.content_blocks.push(event.content_block.clone())
      RETURN Some(Ok(event))

    CASE "content_block_delta":
      // Update content block with delta
      IF event.index < self.content_blocks.len() THEN
        apply_delta(self.content_blocks[event.index], event.delta)
      END IF

      // Record streaming chunk metric
      IF self.metrics_hook IS Some THEN
        self.metrics_hook.record_counter(
          "anthropic_streaming_chunks_total",
          1,
          { model: self.current_message.model }
        )
      END IF

      RETURN Some(Ok(event))

    CASE "content_block_stop":
      // Content block completed
      RETURN Some(Ok(event))

    CASE "message_delta":
      // Update message-level fields
      IF event.delta.stop_reason IS Some THEN
        self.current_message.stop_reason <- event.delta.stop_reason
      END IF
      IF event.delta.stop_sequence IS Some THEN
        self.current_message.stop_sequence <- event.delta.stop_sequence
      END IF

      // Update output token count
      IF event.usage IS Some THEN
        self.total_output_tokens <- event.usage.output_tokens
      END IF

      RETURN Some(Ok(event))

    CASE "message_stop":
      // Stream completed successfully
      self.finish_stream()
      RETURN Some(Ok(event))

    CASE "ping":
      // Keep-alive - optionally forward to consumer
      RETURN Some(Ok(event))

    CASE "error":
      // Error event
      self.error_occurred <- true
      RETURN Some(Ok(event))

    CASE _:
      // Unknown event type - log and forward
      self.logger.debug("Unknown stream event type", { event_type: event.type })
      RETURN Some(Ok(event))
  END MATCH
END FUNCTION

FUNCTION apply_delta(block: &mut ContentBlock, delta: ContentDelta)
  MATCH delta.type
    CASE "text_delta":
      IF block IS ContentBlock::Text THEN
        block.text <- block.text + delta.text
      END IF

    CASE "input_json_delta":
      IF block IS ContentBlock::ToolUse THEN
        block.partial_json <- block.partial_json + delta.partial_json
      END IF

    CASE "thinking_delta":
      IF block IS ContentBlock::Thinking THEN
        block.thinking <- block.thinking + delta.thinking
      END IF
  END MATCH
END FUNCTION
```

### 10.5 Stream Finalization

```
FUNCTION message_stream.finish_stream()
  self.is_done <- true

  // Record final token usage with rate limiter
  self.rate_limiter.record_tokens(self.total_input_tokens + self.total_output_tokens)

  // Record metrics
  IF self.metrics_hook IS Some THEN
    self.metrics_hook.record_counter(
      "anthropic_tokens_total",
      self.total_input_tokens,
      { model: self.current_message.model, direction: "input" }
    )
    self.metrics_hook.record_counter(
      "anthropic_tokens_total",
      self.total_output_tokens,
      { model: self.current_message.model, direction: "output" }
    )

    status <- IF self.error_occurred THEN "error" ELSE "success"
    self.metrics_hook.record_counter(
      "anthropic_requests_total",
      1,
      {
        service: "messages",
        operation: "create_stream",
        model: self.current_message.model,
        status: status
      }
    )
  END IF

  // Complete span
  self.span.set_attribute("anthropic.input_tokens", self.total_input_tokens)
  self.span.set_attribute("anthropic.output_tokens", self.total_output_tokens)
  self.span.set_attribute("anthropic.stop_reason", self.current_message.stop_reason)

  IF self.error_occurred THEN
    self.span.set_status(ERROR)
  ELSE
    self.span.set_status(OK)
  END IF

  self.span.end()

  self.logger.debug("Stream completed", {
    message_id: self.current_message.id,
    input_tokens: self.total_input_tokens,
    output_tokens: self.total_output_tokens,
    stop_reason: self.current_message.stop_reason,
    error_occurred: self.error_occurred
  })
END FUNCTION
```

### 10.6 SSE Event Parsing

```
FUNCTION message_stream.try_parse_sse_event() -> Option<SseEvent>
  // SSE format:
  // event: <event-type>\n   (optional)
  // data: <data>\n
  // \n

  // Find double newline (event boundary)
  boundary <- self.buffer.find("\n\n")
  IF boundary IS None THEN
    // Also check for \r\n\r\n
    boundary <- self.buffer.find("\r\n\r\n")
    IF boundary IS None THEN
      RETURN None
    END IF
  END IF

  // Extract event text
  event_text <- self.buffer[0..boundary]
  self.buffer <- self.buffer[boundary + 2..]  // Skip \n\n (or adjust for \r\n)

  // Parse event fields
  event_type <- None
  data_lines <- []
  retry_ms <- None

  FOR EACH line IN event_text.lines() DO
    line <- line.trim_end()  // Remove trailing whitespace

    IF line.starts_with("event:") THEN
      event_type <- Some(line[6..].trim())

    ELSE IF line.starts_with("data:") THEN
      // Data may or may not have space after colon
      data <- line[5..]
      IF data.starts_with(" ") THEN
        data <- data[1..]
      END IF
      data_lines.push(data)

    ELSE IF line.starts_with("retry:") THEN
      retry_ms <- parse_u64(line[6..].trim())

    ELSE IF line.starts_with(":") THEN
      // Comment line - used as keep-alive
      IF data_lines.is_empty() AND event_type IS None THEN
        RETURN Some(SseEvent::Comment)
      END IF

    ELSE IF line.is_empty() THEN
      // Empty line within event - ignore
      CONTINUE
    END IF
  END FOR

  // Handle retry suggestion
  IF retry_ms IS Some AND data_lines.is_empty() THEN
    RETURN Some(SseEvent::Retry(retry_ms.unwrap()))
  END IF

  // Combine data lines
  IF NOT data_lines.is_empty() THEN
    data <- data_lines.join("\n")

    IF event_type IS Some THEN
      RETURN Some(SseEvent::Event(event_type.unwrap(), data))
    ELSE
      RETURN Some(SseEvent::Data(data))
    END IF
  END IF

  RETURN None
END FUNCTION

ENUM SseEvent {
  Data(String),
  Event(String, String),  // event_type, data
  Comment,
  Retry(u64)
}
```

---

## 11. Models Service

### 11.1 Service Interface

```
TRAIT ModelsService {
  // List all available models
  ASYNC FUNCTION list(params: Option<ListModelsParams>) -> Result<ModelList, AnthropicError>

  // Get a specific model by ID
  ASYNC FUNCTION get(model_id: String) -> Result<Model, AnthropicError>
}

STRUCT ModelsServiceImpl {
  transport: HttpTransport,
  auth_manager: AuthManager,
  retry_executor: RetryExecutor,
  rate_limiter: RateLimiter,
  circuit_breaker: CircuitBreaker,
  base_url: Url,
  logger: Logger,
  tracer: Tracer
}
```

### 11.2 List Models

```
FUNCTION models_service.list(
  params: Option<ListModelsParams>
) -> Result<ModelList, AnthropicError>

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
    operation: "models.list",
    request_fn: ASYNC FUNCTION() -> Result<ModelList, AnthropicError>
      // Build URL with query params
      url <- self.base_url.join("/v1/models")?
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
        RETURN parse_response::<ModelList>(http_response, self.logger)
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

### 11.3 Get Model

```
FUNCTION models_service.get(model_id: String) -> Result<Model, AnthropicError>
  // Validate model_id
  IF model_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Model ID is required",
      details: []
    })
  END IF

  // Execute with resilience
  response <- execute_with_resilience(
    operation: "models.get",
    request_fn: ASYNC FUNCTION() -> Result<Model, AnthropicError>
      // Build URL with encoded model ID
      endpoint <- format("/v1/models/{}", url_encode(model_id))

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
        RETURN parse_response::<Model>(http_response, self.logger)
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

---

## 12. Token Counting

### 12.1 Count Tokens

```
FUNCTION messages_service.count_tokens(
  request: CountTokensRequest
) -> Result<TokenCount, AnthropicError>

  // Step 1: Validate request
  validate_count_tokens_request(request)?

  // Step 2: Execute with resilience
  response <- execute_with_resilience(
    operation: "messages.count_tokens",
    request_fn: ASYNC FUNCTION() -> Result<TokenCount, AnthropicError>
      RETURN self.execute_count_tokens_request(request).await
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  RETURN Ok(response)
END FUNCTION

FUNCTION messages_service.execute_count_tokens_request(
  request: CountTokensRequest
) -> Result<TokenCount, AnthropicError>

  // Build HTTP request
  http_request <- build_request(
    method: POST,
    endpoint: "/v1/messages/count_tokens",
    base_url: self.base_url,
    auth_manager: self.auth_manager,
    body: Some(serialize_request_body(request)?),
    extra_headers: HeaderMap::new()
  )?

  // Execute request
  http_response <- self.transport.send(http_request).await?

  IF http_response.status.is_success() THEN
    RETURN parse_response::<TokenCount>(http_response, self.logger)
  ELSE
    error <- parse_error_response(
      http_response.status,
      http_response.body,
      http_response.headers
    )
    RETURN Error(error)
  END IF
END FUNCTION

FUNCTION validate_count_tokens_request(request: CountTokensRequest) -> Result<(), RequestError>
  errors <- []

  // Validate model (required)
  IF request.model.is_empty() THEN
    errors.push(ValidationDetail {
      field: "model",
      message: "Model is required"
    })
  END IF

  // Validate messages (required)
  IF request.messages.is_empty() THEN
    errors.push(ValidationDetail {
      field: "messages",
      message: "At least one message is required"
    })
  END IF

  // Validate message structure (reuse message validation)
  FOR EACH (index, message) IN request.messages.enumerate() DO
    IF message.role NOT IN ["user", "assistant"] THEN
      errors.push(ValidationDetail {
        field: format("messages[{}].role", index),
        message: "Invalid role"
      })
    END IF
  END FOR

  IF errors.is_empty() THEN
    RETURN Ok(())
  ELSE
    RETURN Error(RequestError::ValidationError {
      message: "Request validation failed",
      details: errors
    })
  END IF
END FUNCTION
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode (Part 2) |

---

**Continued in Part 3: Message Batches, Admin APIs**
