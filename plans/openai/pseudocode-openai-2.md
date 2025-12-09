# OpenAI Integration Module - Pseudocode (Part 2)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-08
**Module:** `integrations/openai`
**File:** 2 of 4 - Chat Completions, Embeddings, Models APIs

---

## Table of Contents (Part 2)

8. [Resilience Orchestrator](#8-resilience-orchestrator)
9. [Chat Completions Service](#9-chat-completions-service)
10. [Streaming Handler](#10-streaming-handler)
11. [Embeddings Service](#11-embeddings-service)
12. [Models Service](#12-models-service)

---

## 8. Resilience Orchestrator

### 8.1 Orchestrated Request Execution

```
FUNCTION execute_with_resilience<T>(
  operation: String,
  request_fn: Fn() -> Future<Result<T, OpenAIError>>,
  retry_executor: RetryExecutor,
  rate_limiter: RateLimiter,
  circuit_breaker: CircuitBreaker,
  tracer: Tracer,
  logger: Logger
) -> Result<T, OpenAIError>

  // Start tracing span
  span <- tracer.start_span(format("openai.{}", operation))

  TRY
    // Step 1: Check circuit breaker
    IF circuit_breaker.is_open() THEN
      span.set_attribute("circuit_breaker.state", "open")
      logger.warn("Circuit breaker open, rejecting request", { operation })
      RETURN Error(ServerError::ServiceUnavailable {
        retry_after: circuit_breaker.time_until_half_open()
      })
    END IF

    // Step 2: Check rate limiter
    rate_limit_result <- rate_limiter.acquire().await
    IF rate_limit_result IS RateLimited THEN
      span.set_attribute("rate_limited", true)
      logger.info("Rate limited, waiting", {
        operation,
        wait_time: rate_limit_result.wait_time
      })

      // Wait and retry
      sleep(rate_limit_result.wait_time).await
      rate_limiter.acquire().await?
    END IF

    // Step 3: Execute with retry
    result <- retry_executor.execute(
      operation: operation,
      action: ASYNC FUNCTION (attempt: u32) -> Result<T, OpenAIError>
        span.add_event("retry_attempt", { attempt })

        TRY
          response <- request_fn().await?

          // Record success with circuit breaker
          circuit_breaker.record_success()

          RETURN Ok(response)

        CATCH error: OpenAIError
          // Check if retryable
          IF error.is_retryable() THEN
            circuit_breaker.record_failure()
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

  CATCH error: OpenAIError
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
  action: Fn(u32) -> Future<Result<T, OpenAIError>>
) -> Result<T, OpenAIError>

  attempt <- 0
  last_error <- None

  WHILE attempt <= self.config.max_retries DO
    attempt <- attempt + 1

    TRY
      result <- action(attempt).await
      RETURN Ok(result)

    CATCH error: OpenAIError
      last_error <- Some(error)

      // Check if we should retry
      IF NOT error.is_retryable() THEN
        self.logger.debug("Non-retryable error", {
          operation,
          attempt,
          error: error.to_string()
        })
        RETURN Error(error)
      END IF

      // Check if we have retries left
      IF attempt >= self.config.max_retries THEN
        self.logger.warn("Retries exhausted", {
          operation,
          attempts: attempt,
          error: error.to_string()
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

      // Check if error provides retry-after
      IF error.retry_after() IS Some THEN
        delay <- max(delay, error.retry_after().unwrap())
      END IF

      self.logger.info("Retrying after error", {
        operation,
        attempt,
        delay_ms: delay.as_millis(),
        error: error.to_string()
      })

      // Call retry hook if present
      IF self.retry_hook IS Some THEN
        decision <- self.retry_hook.on_retry(attempt, error, delay).await
        MATCH decision
          CASE RetryDecision::Abort:
            RETURN Error(error)
          CASE RetryDecision::Retry(custom_delay):
            delay <- custom_delay
          CASE RetryDecision::Default:
            // Use calculated delay
        END MATCH
      END IF

      sleep(delay).await
    END TRY
  END WHILE

  // Should not reach here, but handle gracefully
  RETURN Error(last_error.unwrap_or(ServerError::InternalServerError))
END FUNCTION

FUNCTION calculate_backoff(
  attempt: u32,
  initial: Duration,
  max: Duration,
  multiplier: f64,
  jitter: f64
) -> Duration

  // Exponential backoff
  base_delay <- initial.as_millis() * (multiplier ^ (attempt - 1))

  // Apply jitter (randomize by +/- jitter factor)
  jitter_range <- base_delay * jitter
  jitter_offset <- random_range(-jitter_range, jitter_range)
  delay_with_jitter <- base_delay + jitter_offset

  // Clamp to max
  final_delay <- min(delay_with_jitter, max.as_millis())

  RETURN Duration::from_millis(final_delay as u64)
END FUNCTION
```

### 8.3 Circuit Breaker Implementation

```
FUNCTION circuit_breaker.is_open() -> bool
  LOCK self.state_mutex
    MATCH self.state
      CASE CircuitState::Closed:
        RETURN false

      CASE CircuitState::Open:
        // Check if recovery timeout has passed
        IF now() - self.state_changed_at > self.config.recovery_timeout THEN
          self.transition_to(CircuitState::HalfOpen)
          RETURN false  // Allow one request through
        END IF
        RETURN true

      CASE CircuitState::HalfOpen:
        // In half-open, allow limited requests
        RETURN self.half_open_requests >= self.config.half_open_max_requests
    END MATCH
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
        // Reset failure window if needed
        IF now() - self.window_start > self.config.failure_window THEN
          self.reset_window()
        END IF

      CASE CircuitState::Open:
        // Should not happen, but handle gracefully
        self.transition_to(CircuitState::HalfOpen)
    END MATCH
  END LOCK

  // Notify hook
  IF self.hook IS Some THEN
    self.hook.on_outcome(RequestOutcome::Success, self.endpoint).await
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
        // Check if failure threshold reached in window
        IF self.window_failure_count >= self.config.failure_threshold THEN
          self.transition_to(CircuitState::Open)
        END IF

      CASE CircuitState::HalfOpen:
        // Any failure in half-open returns to open
        self.transition_to(CircuitState::Open)

      CASE CircuitState::Open:
        // Already open, just update stats
    END MATCH
  END LOCK

  // Notify hook
  IF self.hook IS Some THEN
    self.hook.on_outcome(RequestOutcome::Failure, self.endpoint).await
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
      self.half_open_requests <- 0
      self.consecutive_successes <- 0

    CASE CircuitState::Open:
      // Nothing to reset
  END MATCH

  self.logger.info("Circuit breaker state changed", {
    endpoint: self.endpoint,
    from: old_state,
    to: new_state
  })

  // Notify hook
  IF self.hook IS Some THEN
    self.hook.on_state_change(old_state, new_state, self.stats).await
  END IF
END FUNCTION
```

---

## 9. Chat Completions Service

### 9.1 Service Initialization

```
FUNCTION ChatCompletionServiceImpl::new(
  transport: HttpTransport,
  auth_manager: AuthManager,
  retry_executor: RetryExecutor,
  rate_limiter: RateLimiter,
  circuit_breaker: CircuitBreaker,
  base_url: Url,
  logger: Logger,
  tracer: Tracer
) -> ChatCompletionServiceImpl

  RETURN ChatCompletionServiceImpl {
    transport,
    auth_manager,
    retry_executor,
    rate_limiter,
    circuit_breaker,
    base_url,
    logger,
    tracer,
    endpoint: "/chat/completions"
  }
END FUNCTION
```

### 9.2 Create Chat Completion

```
FUNCTION chat_service.create(
  request: ChatCompletionRequest
) -> Result<ChatCompletionResponse, OpenAIError>

  // Step 1: Validate request
  validate_chat_request(request)?

  // Step 2: Ensure stream is false for non-streaming
  request_copy <- request.clone()
  request_copy.stream <- Some(false)

  // Step 3: Execute with resilience
  response <- execute_with_resilience(
    operation: "chat.create",
    request_fn: ASYNC FUNCTION() -> Result<ChatCompletionResponse, OpenAIError>
      RETURN self.execute_chat_request(request_copy).await
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  // Step 4: Update rate limiter with usage
  IF response.usage IS Some THEN
    self.rate_limiter.record_tokens(
      response.usage.prompt_tokens + response.usage.completion_tokens
    )
  END IF

  RETURN Ok(response)
END FUNCTION

FUNCTION chat_service.execute_chat_request(
  request: ChatCompletionRequest
) -> Result<ChatCompletionResponse, OpenAIError>

  // Build HTTP request
  http_request <- build_request(
    method: POST,
    endpoint: self.endpoint,
    base_url: self.base_url,
    auth_manager: self.auth_manager,
    body: Some(serialize_json(request)?),
    extra_headers: HeaderMap::new()
  )?

  // Execute request
  http_response <- self.transport.send(http_request).await?

  // Handle response based on status
  IF http_response.status.is_success() THEN
    // Parse successful response
    response <- parse_response::<ChatCompletionResponse>(
      http_response,
      self.logger
    )?

    // Update metrics
    self.record_metrics(response)

    RETURN Ok(response)

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

### 9.3 Request Validation

```
FUNCTION validate_chat_request(request: ChatCompletionRequest) -> Result<(), RequestError>
  errors <- []

  // Validate model
  IF request.model.is_empty() THEN
    errors.push(ValidationDetail {
      field: "model",
      message: "Model is required"
    })
  END IF

  // Validate messages
  IF request.messages.is_empty() THEN
    errors.push(ValidationDetail {
      field: "messages",
      message: "At least one message is required"
    })
  END IF

  // Validate message content
  FOR EACH (index, message) IN request.messages.enumerate() DO
    MATCH message
      CASE ChatMessage::User { content, .. }:
        IF content.is_empty() THEN
          errors.push(ValidationDetail {
            field: format("messages[{}].content", index),
            message: "User message content cannot be empty"
          })
        END IF

      CASE ChatMessage::System { content, .. }:
        IF content.is_empty() THEN
          errors.push(ValidationDetail {
            field: format("messages[{}].content", index),
            message: "System message content cannot be empty"
          })
        END IF

      CASE ChatMessage::Tool { tool_call_id, .. }:
        IF tool_call_id.is_empty() THEN
          errors.push(ValidationDetail {
            field: format("messages[{}].tool_call_id", index),
            message: "Tool message must have tool_call_id"
          })
        END IF

      CASE _:
        // Assistant messages can have empty content (for tool calls)
    END MATCH
  END FOR

  // Validate temperature
  IF request.temperature IS Some THEN
    IF request.temperature < 0.0 OR request.temperature > 2.0 THEN
      errors.push(ValidationDetail {
        field: "temperature",
        message: "Temperature must be between 0 and 2"
      })
    END IF
  END IF

  // Validate top_p
  IF request.top_p IS Some THEN
    IF request.top_p < 0.0 OR request.top_p > 1.0 THEN
      errors.push(ValidationDetail {
        field: "top_p",
        message: "top_p must be between 0 and 1"
      })
    END IF
  END IF

  // Validate n
  IF request.n IS Some THEN
    IF request.n < 1 OR request.n > 128 THEN
      errors.push(ValidationDetail {
        field: "n",
        message: "n must be between 1 and 128"
      })
    END IF
  END IF

  // Validate max_tokens
  IF request.max_tokens IS Some AND request.max_completion_tokens IS Some THEN
    errors.push(ValidationDetail {
      field: "max_tokens",
      message: "Cannot specify both max_tokens and max_completion_tokens"
    })
  END IF

  // Validate tools
  IF request.tools IS Some THEN
    FOR EACH (index, tool) IN request.tools.enumerate() DO
      IF tool.function.name.is_empty() THEN
        errors.push(ValidationDetail {
          field: format("tools[{}].function.name", index),
          message: "Tool function name is required"
        })
      END IF
    END FOR
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
```

### 9.4 Metrics Recording

```
FUNCTION chat_service.record_metrics(response: ChatCompletionResponse)
  // Record token usage
  IF response.usage IS Some THEN
    self.metrics_hook.record_tokens(
      model: response.model,
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens
    )
  END IF

  // Record finish reasons
  FOR EACH choice IN response.choices DO
    IF choice.finish_reason IS Some THEN
      self.metrics_hook.record_finish_reason(
        model: response.model,
        reason: choice.finish_reason
      )
    END IF
  END FOR
END FUNCTION
```

---

## 10. Streaming Handler

### 10.1 Create Streaming Completion

```
FUNCTION chat_service.create_stream(
  request: ChatCompletionRequest
) -> Result<ChatCompletionStream, OpenAIError>

  // Step 1: Validate request
  validate_chat_request(request)?

  // Step 2: Ensure stream is true
  request_copy <- request.clone()
  request_copy.stream <- Some(true)

  // Add stream options if not present
  IF request_copy.stream_options IS None THEN
    request_copy.stream_options <- Some(StreamOptions {
      include_usage: true
    })
  END IF

  // Step 3: Check circuit breaker (no retry for streams)
  IF self.circuit_breaker.is_open() THEN
    RETURN Error(ServerError::ServiceUnavailable {
      retry_after: self.circuit_breaker.time_until_half_open()
    })
  END IF

  // Step 4: Check rate limiter
  self.rate_limiter.acquire().await?

  // Step 5: Build streaming request
  http_request <- build_streaming_request(
    endpoint: self.endpoint,
    base_url: self.base_url,
    auth_manager: self.auth_manager,
    body: serialize_json(request_copy)?
  )?

  // Step 6: Execute request and get response stream
  http_response <- self.transport.send_streaming(http_request).await?

  IF NOT http_response.status.is_success() THEN
    // Read body for error
    body <- http_response.body_bytes().await?
    error <- parse_error_response(
      http_response.status,
      body,
      http_response.headers
    )
    self.circuit_breaker.record_failure()
    RETURN Error(error)
  END IF

  // Step 7: Create stream wrapper
  stream <- ChatCompletionStream::new(
    response_stream: http_response.body_stream(),
    circuit_breaker: self.circuit_breaker.clone(),
    rate_limiter: self.rate_limiter.clone(),
    logger: self.logger.clone()
  )

  self.circuit_breaker.record_success()

  RETURN Ok(stream)
END FUNCTION
```

### 10.2 SSE Stream Parser

```
STRUCT ChatCompletionStream {
  response_stream: ByteStream,
  buffer: String,
  circuit_breaker: CircuitBreaker,
  rate_limiter: RateLimiter,
  logger: Logger,
  is_done: bool,
  total_tokens: u32
}

FUNCTION ChatCompletionStream::new(
  response_stream: ByteStream,
  circuit_breaker: CircuitBreaker,
  rate_limiter: RateLimiter,
  logger: Logger
) -> ChatCompletionStream
  RETURN ChatCompletionStream {
    response_stream,
    buffer: String::new(),
    circuit_breaker,
    rate_limiter,
    logger,
    is_done: false,
    total_tokens: 0
  }
END FUNCTION

// Implement AsyncIterator/Stream
FUNCTION stream.next() -> Option<Result<ChatCompletionChunk, OpenAIError>>
  IF self.is_done THEN
    RETURN None
  END IF

  LOOP
    // Try to parse a complete event from buffer
    event <- self.try_parse_event()
    IF event IS Some THEN
      MATCH event
        CASE SSEEvent::Data(data):
          // Check for [DONE] marker
          IF data.trim() == "[DONE]" THEN
            self.is_done <- true
            self.rate_limiter.record_tokens(self.total_tokens)
            RETURN None
          END IF

          // Parse chunk
          TRY
            chunk <- deserialize_json::<ChatCompletionChunk>(data)?

            // Track usage if present
            IF chunk.usage IS Some THEN
              self.total_tokens <- chunk.usage.total_tokens
            END IF

            RETURN Some(Ok(chunk))

          CATCH DeserializeError AS e
            self.logger.warn("Failed to parse stream chunk", {
              error: e.to_string(),
              data: truncate(data, 200)
            })
            // Continue to next event
          END TRY

        CASE SSEEvent::Comment:
          // Ignore comments, continue
          CONTINUE

        CASE SSEEvent::Retry(ms):
          // Note retry suggestion, continue
          self.logger.debug("Server suggested retry", { retry_ms: ms })
          CONTINUE
      END MATCH
    END IF

    // Need more data - read from stream
    TRY
      bytes <- self.response_stream.next().await

      IF bytes IS None THEN
        // Stream ended unexpectedly
        IF NOT self.is_done THEN
          self.circuit_breaker.record_failure()
          RETURN Some(Error(ResponseError::StreamInterrupted {
            message: "Stream ended without [DONE] marker"
          }))
        END IF
        RETURN None
      END IF

      // Append to buffer
      self.buffer.push_str(String::from_utf8_lossy(bytes))

    CATCH IoError AS e
      self.circuit_breaker.record_failure()
      RETURN Some(Error(NetworkError::ConnectionFailed {
        message: e.to_string()
      }))
    END TRY
  END LOOP
END FUNCTION
```

### 10.3 SSE Event Parsing

```
FUNCTION stream.try_parse_event() -> Option<SSEEvent>
  // SSE format:
  // event: <event-type>\n
  // data: <data>\n
  // \n

  // Find double newline (event boundary)
  boundary <- self.buffer.find("\n\n")
  IF boundary IS None THEN
    RETURN None
  END IF

  // Extract event text
  event_text <- self.buffer[0..boundary]
  self.buffer <- self.buffer[boundary + 2..]  // Skip \n\n

  // Parse event fields
  event_type <- None
  data_lines <- []
  retry_ms <- None

  FOR EACH line IN event_text.split('\n') DO
    IF line.starts_with("event:") THEN
      event_type <- Some(line[6..].trim())

    ELSE IF line.starts_with("data:") THEN
      data_lines.push(line[5..].trim())

    ELSE IF line.starts_with("retry:") THEN
      retry_ms <- parse_u64(line[6..].trim())

    ELSE IF line.starts_with(":") THEN
      // Comment line
      IF data_lines.is_empty() AND event_type IS None THEN
        RETURN Some(SSEEvent::Comment)
      END IF
    END IF
  END FOR

  // Handle retry suggestion
  IF retry_ms IS Some AND data_lines.is_empty() THEN
    RETURN Some(SSEEvent::Retry(retry_ms.unwrap()))
  END IF

  // Combine data lines
  IF NOT data_lines.is_empty() THEN
    data <- data_lines.join("\n")
    RETURN Some(SSEEvent::Data(data))
  END IF

  RETURN None
END FUNCTION

ENUM SSEEvent {
  Data(String),
  Comment,
  Retry(u64)
}
```

---

## 11. Embeddings Service

### 11.1 Create Embeddings

```
FUNCTION embeddings_service.create(
  request: EmbeddingsRequest
) -> Result<EmbeddingsResponse, OpenAIError>

  // Step 1: Validate request
  validate_embeddings_request(request)?

  // Step 2: Execute with resilience
  response <- execute_with_resilience(
    operation: "embeddings.create",
    request_fn: ASYNC FUNCTION() -> Result<EmbeddingsResponse, OpenAIError>
      RETURN self.execute_embeddings_request(request).await
    END FUNCTION,
    retry_executor: self.retry_executor,
    rate_limiter: self.rate_limiter,
    circuit_breaker: self.circuit_breaker,
    tracer: self.tracer,
    logger: self.logger
  ).await?

  // Step 3: Update rate limiter with usage
  self.rate_limiter.record_tokens(response.usage.total_tokens)

  RETURN Ok(response)
END FUNCTION

FUNCTION embeddings_service.execute_embeddings_request(
  request: EmbeddingsRequest
) -> Result<EmbeddingsResponse, OpenAIError>

  // Build HTTP request
  http_request <- build_request(
    method: POST,
    endpoint: "/embeddings",
    base_url: self.base_url,
    auth_manager: self.auth_manager,
    body: Some(serialize_json(request)?),
    extra_headers: HeaderMap::new()
  )?

  // Execute request
  http_response <- self.transport.send(http_request).await?

  // Handle response
  IF http_response.status.is_success() THEN
    response <- parse_response::<EmbeddingsResponse>(
      http_response,
      self.logger
    )?

    // Record metrics
    self.metrics_hook.record_embeddings(
      model: response.model,
      input_count: response.data.len(),
      dimensions: response.data[0].embedding.len(),
      total_tokens: response.usage.total_tokens
    )

    RETURN Ok(response)
  ELSE
    error <- parse_error_response(
      http_response.status,
      http_response.body,
      http_response.headers
    )
    RETURN Error(error)
  END IF
END FUNCTION
```

### 11.2 Request Validation

```
FUNCTION validate_embeddings_request(request: EmbeddingsRequest) -> Result<(), RequestError>
  errors <- []

  // Validate model
  IF request.model.is_empty() THEN
    errors.push(ValidationDetail {
      field: "model",
      message: "Model is required"
    })
  END IF

  // Validate input
  MATCH request.input
    CASE EmbeddingsInput::Single(text):
      IF text.is_empty() THEN
        errors.push(ValidationDetail {
          field: "input",
          message: "Input text cannot be empty"
        })
      END IF

    CASE EmbeddingsInput::Multiple(texts):
      IF texts.is_empty() THEN
        errors.push(ValidationDetail {
          field: "input",
          message: "Input array cannot be empty"
        })
      END IF
      IF texts.len() > 2048 THEN
        errors.push(ValidationDetail {
          field: "input",
          message: "Input array cannot exceed 2048 items"
        })
      END IF
      FOR EACH (index, text) IN texts.enumerate() DO
        IF text.is_empty() THEN
          errors.push(ValidationDetail {
            field: format("input[{}]", index),
            message: "Input text cannot be empty"
          })
        END IF
      END FOR

    CASE EmbeddingsInput::TokenIds(tokens):
      IF tokens.is_empty() THEN
        errors.push(ValidationDetail {
          field: "input",
          message: "Token array cannot be empty"
        })
      END IF

    CASE EmbeddingsInput::MultipleTokenIds(token_arrays):
      IF token_arrays.is_empty() THEN
        errors.push(ValidationDetail {
          field: "input",
          message: "Token arrays cannot be empty"
        })
      END IF
  END MATCH

  // Validate dimensions (if specified)
  IF request.dimensions IS Some THEN
    IF request.dimensions < 1 THEN
      errors.push(ValidationDetail {
        field: "dimensions",
        message: "Dimensions must be at least 1"
      })
    END IF
    // Note: max dimensions depends on model, validated server-side
  END IF

  // Validate encoding format
  IF request.encoding_format IS Some THEN
    IF request.encoding_format NOT IN ["float", "base64"] THEN
      errors.push(ValidationDetail {
        field: "encoding_format",
        message: "Encoding format must be 'float' or 'base64'"
      })
    END IF
  END IF

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

### 11.3 Batch Embeddings (Optimization)

```
FUNCTION embeddings_service.create_batch(
  inputs: Vec<String>,
  model: String,
  options: EmbeddingsOptions
) -> Result<Vec<EmbeddingsResponse>, OpenAIError>

  // Determine optimal batch size based on model
  batch_size <- get_optimal_batch_size(model)

  // Split inputs into batches
  batches <- inputs.chunks(batch_size)

  // Process batches (potentially in parallel)
  results <- []

  IF options.parallel AND batches.len() > 1 THEN
    // Parallel execution (respecting rate limits)
    futures <- []
    FOR EACH batch IN batches DO
      future <- self.create(EmbeddingsRequest {
        input: EmbeddingsInput::Multiple(batch.to_vec()),
        model: model.clone(),
        encoding_format: options.encoding_format,
        dimensions: options.dimensions,
        user: options.user.clone()
      })
      futures.push(future)
    END FOR

    // Await all with concurrency limit
    results <- join_all_with_limit(futures, options.max_concurrent OR 3).await
  ELSE
    // Sequential execution
    FOR EACH batch IN batches DO
      result <- self.create(EmbeddingsRequest {
        input: EmbeddingsInput::Multiple(batch.to_vec()),
        model: model.clone(),
        encoding_format: options.encoding_format,
        dimensions: options.dimensions,
        user: options.user.clone()
      }).await?
      results.push(Ok(result))
    END FOR
  END IF

  // Collect results, fail on first error
  collected <- []
  FOR EACH result IN results DO
    collected.push(result?)
  END FOR

  RETURN Ok(collected)
END FUNCTION

FUNCTION get_optimal_batch_size(model: String) -> usize
  // Based on model token limits and optimal throughput
  MATCH model
    CASE "text-embedding-3-small":
      RETURN 2048  // Max allowed
    CASE "text-embedding-3-large":
      RETURN 2048
    CASE "text-embedding-ada-002":
      RETURN 2048
    CASE _:
      RETURN 100  // Conservative default
  END MATCH
END FUNCTION
```

---

## 12. Models Service

### 12.1 List Models

```
FUNCTION models_service.list() -> Result<ModelList, OpenAIError>
  // Execute with resilience
  response <- execute_with_resilience(
    operation: "models.list",
    request_fn: ASYNC FUNCTION() -> Result<ModelList, OpenAIError>
      // Build HTTP request
      http_request <- build_request(
        method: GET,
        endpoint: "/models",
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: HeaderMap::new()
      )?

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

### 12.2 Retrieve Model

```
FUNCTION models_service.retrieve(model_id: String) -> Result<Model, OpenAIError>
  // Validate model_id
  IF model_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Model ID is required",
      details: []
    })
  END IF

  // Execute with resilience
  response <- execute_with_resilience(
    operation: "models.retrieve",
    request_fn: ASYNC FUNCTION() -> Result<Model, OpenAIError>
      // Build HTTP request
      http_request <- build_request(
        method: GET,
        endpoint: format("/models/{}", url_encode(model_id)),
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

### 12.3 Delete Model

```
FUNCTION models_service.delete(model_id: String) -> Result<DeleteResponse, OpenAIError>
  // Validate model_id
  IF model_id.is_empty() THEN
    RETURN Error(RequestError::ValidationError {
      message: "Model ID is required",
      details: []
    })
  END IF

  // Note: Only fine-tuned models can be deleted
  IF NOT model_id.starts_with("ft:") THEN
    self.logger.warn("Attempting to delete non-fine-tuned model", {
      model_id: model_id
    })
  END IF

  // Execute with resilience
  response <- execute_with_resilience(
    operation: "models.delete",
    request_fn: ASYNC FUNCTION() -> Result<DeleteResponse, OpenAIError>
      // Build HTTP request
      http_request <- build_request(
        method: DELETE,
        endpoint: format("/models/{}", url_encode(model_id)),
        base_url: self.base_url,
        auth_manager: self.auth_manager,
        body: None,
        extra_headers: HeaderMap::new()
      )?

      // Execute request
      http_response <- self.transport.send(http_request).await?

      IF http_response.status.is_success() THEN
        RETURN parse_response::<DeleteResponse>(http_response, self.logger)
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

  self.logger.info("Model deleted", { model_id, deleted: response.deleted })

  RETURN Ok(response)
END FUNCTION
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-08 | SPARC Generator | Initial pseudocode (Part 2) |

---

**Continued in Part 3: Files, Batches, Images, and Audio APIs**
