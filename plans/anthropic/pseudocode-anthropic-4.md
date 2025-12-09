# Anthropic Integration Module - Pseudocode (Part 4)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/anthropic`
**File:** 4 of 4 - Beta Features, Error Handling, Observability, and Testing Patterns

---

## Table of Contents (Part 4)

19. [Beta Features Implementation](#19-beta-features-implementation)
20. [Error Handling](#20-error-handling)
21. [Observability Integration](#21-observability-integration)
22. [London-School TDD Testing Patterns](#22-london-school-tdd-testing-patterns)
23. [Mock Implementations](#23-mock-implementations)
24. [Integration Test Utilities](#24-integration-test-utilities)

---

## 19. Beta Features Implementation

### 19.1 Extended Thinking Support

```
// Extended thinking allows Claude to show its reasoning process
// Only supported on claude-sonnet-4-20250514 and claude-3-7-sonnet-20250219

STRUCT ThinkingConfig {
  type: String,           // "enabled" or "disabled"
  budget_tokens: Option<u32>  // Required when type is "enabled"
}

FUNCTION build_thinking_request(
  base_request: CreateMessageRequest,
  thinking_config: ThinkingConfig
) -> CreateMessageRequest

  request <- base_request.clone()

  IF thinking_config.type == "enabled" THEN
    // Validate model supports thinking
    IF NOT model_supports_thinking(request.model) THEN
      PANIC("Extended thinking not supported for model: {}", request.model)
    END IF

    // Add thinking configuration
    request.thinking <- Some(ThinkingConfig {
      type: "enabled",
      budget_tokens: thinking_config.budget_tokens
    })

    // Extended thinking has specific requirements:
    // - temperature must be 1 if set
    // - Cannot use top_k
    IF request.temperature IS Some AND request.temperature != 1.0 THEN
      log_warning("Extended thinking requires temperature=1, overriding")
      request.temperature <- Some(1.0)
    END IF

    IF request.top_k IS Some THEN
      log_warning("Extended thinking does not support top_k, removing")
      request.top_k <- None
    END IF
  END IF

  RETURN request
END FUNCTION

FUNCTION model_supports_thinking(model: String) -> bool
  CONST THINKING_MODELS = [
    "claude-sonnet-4-20250514",
    "claude-3-7-sonnet-20250219"
  ]
  RETURN model IN THINKING_MODELS
END FUNCTION

// Response handling for thinking blocks
FUNCTION extract_thinking_content(response: Message) -> Vec<ThinkingBlock>
  thinking_blocks <- []

  FOR EACH block IN response.content DO
    IF block IS ContentBlock::Thinking THEN
      thinking_blocks.push(block)
    END IF
  END FOR

  RETURN thinking_blocks
END FUNCTION

// Streaming support for thinking
FUNCTION handle_thinking_delta(stream_state: &mut StreamState, delta: ContentDelta)
  IF delta.type == "thinking_delta" THEN
    // Append thinking content
    IF stream_state.current_thinking_block IS None THEN
      stream_state.current_thinking_block <- Some(ThinkingBlock {
        type: "thinking",
        thinking: String::new()
      })
    END IF

    stream_state.current_thinking_block.thinking.push_str(delta.thinking)
  END IF
END FUNCTION
```

### 19.2 PDF Support (Beta)

```
// PDF support allows processing PDF documents as input
// Requires "pdfs-2024-09-25" beta header

FUNCTION create_pdf_content_block(
  pdf_data: Bytes,
  cache_control: Option<CacheControl>
) -> ContentBlock

  // Validate PDF
  IF NOT is_valid_pdf(pdf_data) THEN
    RETURN Error(ContentError::UnsupportedContent {
      message: "Invalid PDF data"
    })
  END IF

  // Check size limits (100 pages recommended, ~32MB max)
  IF pdf_data.len() > 32 * 1024 * 1024 THEN
    RETURN Error(ContentError::ContentTooLarge {
      size: pdf_data.len(),
      max_size: 32 * 1024 * 1024
    })
  END IF

  // Base64 encode
  encoded_data <- base64_encode(pdf_data)

  RETURN ContentBlock::Document {
    type: "document",
    source: DocumentSource {
      type: "base64",
      media_type: "application/pdf",
      data: encoded_data
    },
    cache_control: cache_control
  }
END FUNCTION

FUNCTION is_valid_pdf(data: Bytes) -> bool
  // Check PDF magic bytes
  IF data.len() < 4 THEN
    RETURN false
  END IF

  // PDF files start with "%PDF"
  RETURN data[0..4] == [0x25, 0x50, 0x44, 0x46]  // %PDF
END FUNCTION

// Convenience function for loading PDF from file
FUNCTION load_pdf_from_file(path: Path) -> Result<ContentBlock, AnthropicError>
  TRY
    pdf_data <- read_file(path)?

    // Validate it's actually a PDF
    IF NOT is_valid_pdf(pdf_data) THEN
      RETURN Error(ContentError::UnsupportedContent {
        message: format("File {} is not a valid PDF", path)
      })
    END IF

    RETURN Ok(create_pdf_content_block(pdf_data, None))

  CATCH IoError AS e
    RETURN Error(ConfigurationError::InvalidConfiguration {
      message: format("Failed to read PDF file: {}", e)
    })
  END TRY
END FUNCTION
```

### 19.3 Prompt Caching

```
// Prompt caching reduces latency and cost by caching portions of prompts
// Requires "prompt-caching-2024-07-31" beta header

STRUCT CacheControl {
  type: String  // "ephemeral"
}

FUNCTION add_cache_control_to_content(
  content: ContentBlock,
  cache_type: String
) -> ContentBlock

  // Clone and add cache_control
  cached_content <- content.clone()

  MATCH cached_content
    CASE ContentBlock::Text { .. }:
      cached_content.cache_control <- Some(CacheControl {
        type: cache_type
      })

    CASE ContentBlock::Image { .. }:
      cached_content.cache_control <- Some(CacheControl {
        type: cache_type
      })

    CASE ContentBlock::Document { .. }:
      cached_content.cache_control <- Some(CacheControl {
        type: cache_type
      })

    CASE _:
      // Tool use and tool result don't support caching
      log_warning("Cache control not supported for this content type")
  END MATCH

  RETURN cached_content
END FUNCTION

// Helper to build a request with cached system prompt
FUNCTION build_request_with_cached_system(
  messages: Vec<Message>,
  system_prompt: String,
  model: String,
  max_tokens: u32
) -> CreateMessageRequest

  // Create system block with cache control
  system_blocks <- [
    SystemBlock {
      type: "text",
      text: system_prompt,
      cache_control: Some(CacheControl {
        type: "ephemeral"
      })
    }
  ]

  RETURN CreateMessageRequest {
    model: model,
    max_tokens: max_tokens,
    messages: messages,
    system: Some(SystemContent::Blocks(system_blocks)),
    // ... other fields
  }
END FUNCTION

// Parse cache usage from response
FUNCTION get_cache_usage(usage: Usage) -> CacheUsage
  RETURN CacheUsage {
    cache_creation_input_tokens: usage.cache_creation_input_tokens OR 0,
    cache_read_input_tokens: usage.cache_read_input_tokens OR 0,
    cache_hit: (usage.cache_read_input_tokens OR 0) > 0
  }
END FUNCTION

STRUCT CacheUsage {
  cache_creation_input_tokens: u32,
  cache_read_input_tokens: u32,
  cache_hit: bool
}
```

### 19.4 Computer Use (Beta)

```
// Computer use allows Claude to interact with computer interfaces
// Requires "computer-use-2024-10-22" beta header

// Tool definition for computer use
FUNCTION create_computer_use_tool(
  display_width: u32,
  display_height: u32,
  display_number: Option<u32>
) -> Tool

  RETURN Tool {
    type: "computer_20241022",
    name: "computer",
    display_width_px: display_width,
    display_height_px: display_height,
    display_number: display_number
  }
END FUNCTION

// Tool definition for text editor
FUNCTION create_text_editor_tool() -> Tool
  RETURN Tool {
    type: "text_editor_20241022",
    name: "str_replace_editor"
  }
END FUNCTION

// Tool definition for bash
FUNCTION create_bash_tool() -> Tool
  RETURN Tool {
    type: "bash_20241022",
    name: "bash"
  }
END FUNCTION

// Handle computer use tool results
FUNCTION create_computer_tool_result(
  tool_use_id: String,
  action_result: ComputerActionResult
) -> ContentBlock

  MATCH action_result
    CASE ComputerActionResult::Screenshot(image_data):
      RETURN ContentBlock::ToolResult {
        type: "tool_result",
        tool_use_id: tool_use_id,
        content: [
          ContentBlock::Image {
            type: "image",
            source: ImageSource {
              type: "base64",
              media_type: "image/png",
              data: base64_encode(image_data)
            }
          }
        ]
      }

    CASE ComputerActionResult::Text(text):
      RETURN ContentBlock::ToolResult {
        type: "tool_result",
        tool_use_id: tool_use_id,
        content: text
      }

    CASE ComputerActionResult::Error(error_message):
      RETURN ContentBlock::ToolResult {
        type: "tool_result",
        tool_use_id: tool_use_id,
        content: error_message,
        is_error: true
      }
  END MATCH
END FUNCTION

ENUM ComputerActionResult {
  Screenshot(Bytes),
  Text(String),
  Error(String)
}
```

---

## 20. Error Handling

### 20.1 Error Classification

```
// Classify errors for appropriate handling
FUNCTION classify_error(error: AnthropicError) -> ErrorClassification
  MATCH error
    // Retryable errors
    CASE RateLimitError::TooManyRequests { .. }:
      RETURN ErrorClassification {
        category: ErrorCategory::Transient,
        retryable: true,
        should_backoff: true,
        circuit_breaker_relevant: true
      }

    CASE ServerError::Overloaded { .. }:
      RETURN ErrorClassification {
        category: ErrorCategory::Transient,
        retryable: true,
        should_backoff: true,
        circuit_breaker_relevant: true
      }

    CASE ServerError::ServiceUnavailable { .. }:
      RETURN ErrorClassification {
        category: ErrorCategory::Transient,
        retryable: true,
        should_backoff: true,
        circuit_breaker_relevant: true
      }

    CASE NetworkError::Timeout { .. }:
      RETURN ErrorClassification {
        category: ErrorCategory::Transient,
        retryable: true,
        should_backoff: true,
        circuit_breaker_relevant: true
      }

    CASE NetworkError::ConnectionFailed { .. }:
      RETURN ErrorClassification {
        category: ErrorCategory::Transient,
        retryable: true,
        should_backoff: true,
        circuit_breaker_relevant: true
      }

    // Non-retryable client errors
    CASE RequestError::ValidationError { .. }:
      RETURN ErrorClassification {
        category: ErrorCategory::Client,
        retryable: false,
        should_backoff: false,
        circuit_breaker_relevant: false
      }

    CASE AuthenticationError::InvalidApiKey { .. }:
      RETURN ErrorClassification {
        category: ErrorCategory::Client,
        retryable: false,
        should_backoff: false,
        circuit_breaker_relevant: false
      }

    CASE AuthenticationError::InsufficientPermissions { .. }:
      RETURN ErrorClassification {
        category: ErrorCategory::Client,
        retryable: false,
        should_backoff: false,
        circuit_breaker_relevant: false
      }

    // Limited retry server errors
    CASE ServerError::InternalError { .. }:
      RETURN ErrorClassification {
        category: ErrorCategory::Server,
        retryable: true,  // Limited retries
        should_backoff: true,
        circuit_breaker_relevant: true
      }

    CASE _:
      RETURN ErrorClassification {
        category: ErrorCategory::Unknown,
        retryable: false,
        should_backoff: false,
        circuit_breaker_relevant: false
      }
  END MATCH
END FUNCTION

STRUCT ErrorClassification {
  category: ErrorCategory,
  retryable: bool,
  should_backoff: bool,
  circuit_breaker_relevant: bool
}

ENUM ErrorCategory {
  Transient,  // Temporary, likely to succeed on retry
  Client,     // Client error, won't succeed on retry
  Server,     // Server error, may succeed on retry
  Unknown     // Unknown, conservative handling
}
```

### 20.2 Error Context Enrichment

```
// Add context to errors for better debugging
FUNCTION enrich_error_context(
  error: AnthropicError,
  context: ErrorContext
) -> AnthropicError

  // Create enriched error with additional context
  enriched <- error.clone()

  enriched.context <- Some(EnrichedContext {
    operation: context.operation,
    request_id: context.request_id,
    model: context.model,
    timestamp: now(),
    attempt_number: context.attempt_number,
    total_duration: context.duration
  })

  RETURN enriched
END FUNCTION

STRUCT ErrorContext {
  operation: String,
  request_id: Option<String>,
  model: Option<String>,
  attempt_number: u32,
  duration: Duration
}

STRUCT EnrichedContext {
  operation: String,
  request_id: Option<String>,
  model: Option<String>,
  timestamp: DateTime,
  attempt_number: u32,
  total_duration: Duration
}
```

### 20.3 Error Recovery Suggestions

```
// Provide actionable recovery suggestions for errors
FUNCTION get_recovery_suggestion(error: AnthropicError) -> RecoverySuggestion
  MATCH error
    CASE RateLimitError::TooManyRequests { retry_after, .. }:
      RETURN RecoverySuggestion {
        action: "Wait and retry",
        details: format("Wait {} before retrying", retry_after OR "a few seconds"),
        automatic_recovery: true
      }

    CASE RateLimitError::TokenLimitExceeded { .. }:
      RETURN RecoverySuggestion {
        action: "Reduce request size",
        details: "Reduce the number of tokens in your request or use a model with higher limits",
        automatic_recovery: false
      }

    CASE AuthenticationError::InvalidApiKey { .. }:
      RETURN RecoverySuggestion {
        action: "Check API key",
        details: "Verify your API key is correct and has not been revoked",
        automatic_recovery: false
      }

    CASE RequestError::ValidationError { details, .. }:
      RETURN RecoverySuggestion {
        action: "Fix request validation errors",
        details: format("Fix the following issues: {:?}", details),
        automatic_recovery: false
      }

    CASE ServerError::Overloaded { retry_after, .. }:
      RETURN RecoverySuggestion {
        action: "Wait for API recovery",
        details: format("The API is overloaded. Wait {} before retrying", retry_after OR "30 seconds"),
        automatic_recovery: true
      }

    CASE NetworkError::Timeout { duration, .. }:
      RETURN RecoverySuggestion {
        action: "Increase timeout or retry",
        details: format("Request timed out after {}. Consider increasing timeout for long-running requests", duration),
        automatic_recovery: true
      }

    CASE ContentError::ContentFiltered { .. }:
      RETURN RecoverySuggestion {
        action: "Modify content",
        details: "The request content was filtered. Review and modify the content to comply with usage policies",
        automatic_recovery: false
      }

    CASE _:
      RETURN RecoverySuggestion {
        action: "Contact support",
        details: "An unexpected error occurred. Check the error details and contact support if the issue persists",
        automatic_recovery: false
      }
  END MATCH
END FUNCTION

STRUCT RecoverySuggestion {
  action: String,
  details: String,
  automatic_recovery: bool
}
```

---

## 21. Observability Integration

### 21.1 Tracing Integration

```
// Integration with integrations-tracing primitive
FUNCTION create_anthropic_tracer(service_name: String) -> Tracer
  RETURN get_tracer_from_primitive(service_name)
    .with_attributes({
      "service.name": service_name,
      "service.version": VERSION,
      "anthropic.sdk.version": SDK_VERSION
    })
END FUNCTION

// Standard span attributes for Anthropic operations
FUNCTION set_anthropic_span_attributes(span: Span, request: CreateMessageRequest)
  span.set_attribute("anthropic.model", request.model)
  span.set_attribute("anthropic.max_tokens", request.max_tokens)
  span.set_attribute("anthropic.message_count", request.messages.len())
  span.set_attribute("anthropic.streaming", request.stream OR false)

  IF request.temperature IS Some THEN
    span.set_attribute("anthropic.temperature", request.temperature)
  END IF

  IF request.tools IS Some THEN
    span.set_attribute("anthropic.tool_count", request.tools.len())
  END IF

  IF request.thinking IS Some THEN
    span.set_attribute("anthropic.extended_thinking", true)
  END IF
END FUNCTION

FUNCTION set_anthropic_response_attributes(span: Span, response: Message)
  span.set_attribute("anthropic.response.id", response.id)
  span.set_attribute("anthropic.response.stop_reason", response.stop_reason)
  span.set_attribute("anthropic.usage.input_tokens", response.usage.input_tokens)
  span.set_attribute("anthropic.usage.output_tokens", response.usage.output_tokens)

  IF response.usage.cache_read_input_tokens IS Some THEN
    span.set_attribute("anthropic.cache.read_tokens", response.usage.cache_read_input_tokens)
  END IF

  IF response.usage.cache_creation_input_tokens IS Some THEN
    span.set_attribute("anthropic.cache.creation_tokens", response.usage.cache_creation_input_tokens)
  END IF
END FUNCTION
```

### 21.2 Metrics Integration

```
// Integration with integrations-metrics primitive (if available)
TRAIT MetricsHook {
  FUNCTION record_counter(name: String, value: u64, labels: HashMap<String, String>)
  FUNCTION record_histogram(name: String, value: f64, labels: HashMap<String, String>)
  FUNCTION record_gauge(name: String, value: f64, labels: HashMap<String, String>)
}

// Default metrics hook that uses integrations primitives
STRUCT DefaultMetricsHook {
  meter: Meter
}

FUNCTION DefaultMetricsHook::new() -> DefaultMetricsHook
  RETURN DefaultMetricsHook {
    meter: get_meter_from_primitive("anthropic")
  }
END FUNCTION

FUNCTION default_metrics_hook.record_counter(name: String, value: u64, labels: HashMap<String, String>)
  counter <- self.meter.create_counter(name)
  counter.add(value, labels)
END FUNCTION

FUNCTION default_metrics_hook.record_histogram(name: String, value: f64, labels: HashMap<String, String>)
  histogram <- self.meter.create_histogram(name)
  histogram.record(value, labels)
END FUNCTION

// Predefined metric recording functions
FUNCTION record_request_metrics(
  metrics: MetricsHook,
  operation: String,
  model: String,
  status: String,
  duration: Duration,
  usage: Option<Usage>
)
  // Request counter
  metrics.record_counter(
    "anthropic_requests_total",
    1,
    {
      "service": "messages",
      "operation": operation,
      "model": model,
      "status": status
    }
  )

  // Duration histogram
  metrics.record_histogram(
    "anthropic_request_duration_seconds",
    duration.as_secs_f64(),
    {
      "service": "messages",
      "operation": operation,
      "model": model
    }
  )

  // Token metrics
  IF usage IS Some THEN
    metrics.record_counter(
      "anthropic_tokens_total",
      usage.input_tokens as u64,
      { "model": model, "direction": "input" }
    )

    metrics.record_counter(
      "anthropic_tokens_total",
      usage.output_tokens as u64,
      { "model": model, "direction": "output" }
    )
  END IF
END FUNCTION
```

### 21.3 Logging Integration

```
// Integration with integrations-logging primitive
FUNCTION create_anthropic_logger(component: String) -> Logger
  RETURN get_logger_from_primitive(format("anthropic.{}", component))
    .with_fields({
      "component": component,
      "sdk_version": SDK_VERSION
    })
END FUNCTION

// Structured logging helpers
FUNCTION log_request_start(logger: Logger, operation: String, request_id: String, model: String)
  logger.info("Starting API request", {
    "operation": operation,
    "request_id": request_id,
    "model": model,
    "event": "request_start"
  })
END FUNCTION

FUNCTION log_request_complete(
  logger: Logger,
  operation: String,
  request_id: String,
  duration: Duration,
  usage: Option<Usage>
)
  fields <- {
    "operation": operation,
    "request_id": request_id,
    "duration_ms": duration.as_millis(),
    "event": "request_complete"
  }

  IF usage IS Some THEN
    fields["input_tokens"] <- usage.input_tokens
    fields["output_tokens"] <- usage.output_tokens
  END IF

  logger.info("API request completed", fields)
END FUNCTION

FUNCTION log_request_error(
  logger: Logger,
  operation: String,
  request_id: String,
  error: AnthropicError,
  duration: Duration
)
  classification <- classify_error(error)

  level <- IF classification.retryable THEN LogLevel::WARN ELSE LogLevel::ERROR

  logger.log(level, "API request failed", {
    "operation": operation,
    "request_id": request_id,
    "error_type": error.error_type(),
    "error_message": error.to_string(),
    "retryable": classification.retryable,
    "duration_ms": duration.as_millis(),
    "event": "request_error"
  })
END FUNCTION

// Sanitize sensitive data in logs
FUNCTION sanitize_for_logging(request: CreateMessageRequest) -> HashMap<String, Value>
  RETURN {
    "model": request.model,
    "max_tokens": request.max_tokens,
    "message_count": request.messages.len(),
    "has_system": request.system IS Some,
    "has_tools": request.tools IS Some,
    "tool_count": (request.tools OR []).len(),
    "temperature": request.temperature,
    "stream": request.stream
    // Note: Do NOT log message content, API keys, or other sensitive data
  }
END FUNCTION
```

---

## 22. London-School TDD Testing Patterns

### 22.1 Test Double Strategy

```
// London-School TDD emphasizes:
// 1. Testing behavior, not implementation
// 2. Using mocks to isolate units
// 3. Outside-in development

// Test Double Types:
// - Stub: Returns predefined values
// - Mock: Verifies interactions
// - Fake: Simplified implementation
// - Spy: Records calls for later verification

// Interface-driven testing pattern
TRAIT TestDouble<T> {
  FUNCTION verify_calls() -> Result<(), AssertionError>
  FUNCTION reset()
}

// Example: Mock for HttpTransport
STRUCT MockHttpTransport IMPLEMENTS HttpTransport, TestDouble<HttpTransport> {
  expected_requests: Vec<ExpectedRequest>,
  actual_requests: Vec<HttpRequest>,
  responses: Vec<Result<HttpResponse, TransportError>>,
  current_response_index: AtomicUsize
}

FUNCTION MockHttpTransport::new() -> MockHttpTransport
  RETURN MockHttpTransport {
    expected_requests: Vec::new(),
    actual_requests: Vec::new(),
    responses: Vec::new(),
    current_response_index: AtomicUsize::new(0)
  }
END FUNCTION

FUNCTION mock_transport.expect_request(
  method: HttpMethod,
  url_pattern: String
) -> MockRequestBuilder
  builder <- MockRequestBuilder::new(self)
  builder.method <- method
  builder.url_pattern <- url_pattern
  RETURN builder
END FUNCTION

FUNCTION mock_transport.returning(response: HttpResponse) -> MockHttpTransport
  self.responses.push(Ok(response))
  RETURN self
END FUNCTION

FUNCTION mock_transport.returning_error(error: TransportError) -> MockHttpTransport
  self.responses.push(Error(error))
  RETURN self
END FUNCTION

// Implementation of HttpTransport interface
ASYNC FUNCTION mock_transport.send(request: HttpRequest) -> Result<HttpResponse, TransportError>
  // Record actual request
  self.actual_requests.push(request.clone())

  // Return next configured response
  index <- self.current_response_index.fetch_add(1)
  IF index < self.responses.len() THEN
    RETURN self.responses[index].clone()
  ELSE
    PANIC("MockHttpTransport: No more responses configured")
  END IF
END FUNCTION

// Verification
FUNCTION mock_transport.verify_calls() -> Result<(), AssertionError>
  FOR EACH (index, expected) IN self.expected_requests.enumerate() DO
    IF index >= self.actual_requests.len() THEN
      RETURN Error(AssertionError {
        message: format("Expected request {} was not made", expected.describe())
      })
    END IF

    actual <- self.actual_requests[index]

    // Verify method
    IF expected.method IS Some AND expected.method != actual.method THEN
      RETURN Error(AssertionError {
        message: format("Request {}: expected method {:?}, got {:?}", index, expected.method, actual.method)
      })
    END IF

    // Verify URL pattern
    IF expected.url_pattern IS Some THEN
      IF NOT matches_pattern(actual.url.to_string(), expected.url_pattern) THEN
        RETURN Error(AssertionError {
          message: format("Request {}: URL {} does not match pattern {}", index, actual.url, expected.url_pattern)
        })
      END IF
    END IF

    // Verify headers
    FOR EACH (key, value) IN expected.headers DO
      IF actual.headers.get(key) != Some(value) THEN
        RETURN Error(AssertionError {
          message: format("Request {}: expected header {}={}, got {:?}", index, key, value, actual.headers.get(key))
        })
      END IF
    END FOR

    // Verify body (if specified)
    IF expected.body_matcher IS Some THEN
      IF NOT expected.body_matcher(actual.body) THEN
        RETURN Error(AssertionError {
          message: format("Request {}: body did not match expected pattern", index)
        })
      END IF
    END IF
  END FOR

  RETURN Ok(())
END FUNCTION
```

### 22.2 Unit Test Structure

```
// Standard unit test structure following London-School TDD

// Test a specific behavior in isolation
TEST FUNCTION test_messages_service_create_success()
  // Arrange: Set up mocks and test data
  mock_transport <- MockHttpTransport::new()
    .expect_request(POST, "/v1/messages")
    .with_header("x-api-key", "test-key")
    .with_header("anthropic-version", "2023-06-01")
    .returning(HttpResponse {
      status: 200,
      body: json!({
        "id": "msg_123",
        "type": "message",
        "role": "assistant",
        "content": [{"type": "text", "text": "Hello!"}],
        "model": "claude-sonnet-4-20250514",
        "stop_reason": "end_turn",
        "usage": {"input_tokens": 10, "output_tokens": 5}
      })
    })

  mock_rate_limiter <- MockRateLimiter::new()
    .expect_acquire()
    .returning(RateLimitResult::Acquired)

  mock_circuit_breaker <- MockCircuitBreaker::new()
    .expect_is_open()
    .returning(false)
    .expect_record_success()

  // Create service with mocks
  service <- MessagesServiceImpl::new(
    transport: mock_transport,
    auth_manager: create_test_auth_manager("test-key"),
    retry_executor: MockRetryExecutor::pass_through(),
    rate_limiter: mock_rate_limiter,
    circuit_breaker: mock_circuit_breaker,
    base_url: Url::parse("https://api.anthropic.com").unwrap(),
    logger: MockLogger::new(),
    tracer: MockTracer::new()
  )

  // Act: Perform the operation
  request <- CreateMessageRequest {
    model: "claude-sonnet-4-20250514",
    max_tokens: 100,
    messages: [
      { role: "user", content: "Hello" }
    ]
  }

  result <- service.create(request).await

  // Assert: Verify behavior
  ASSERT result.is_ok()

  message <- result.unwrap()
  ASSERT_EQ message.id, "msg_123"
  ASSERT_EQ message.stop_reason, Some("end_turn")
  ASSERT_EQ message.usage.input_tokens, 10
  ASSERT_EQ message.usage.output_tokens, 5

  // Verify mock interactions
  mock_transport.verify_calls().unwrap()
  mock_rate_limiter.verify_calls().unwrap()
  mock_circuit_breaker.verify_calls().unwrap()
END TEST

// Test error handling behavior
TEST FUNCTION test_messages_service_rate_limit_error()
  // Arrange
  mock_transport <- MockHttpTransport::new()
    .expect_request(POST, "/v1/messages")
    .returning(HttpResponse {
      status: 429,
      headers: { "retry-after": "60" },
      body: json!({
        "type": "error",
        "error": {
          "type": "rate_limit_error",
          "message": "Rate limit exceeded"
        }
      })
    })

  mock_circuit_breaker <- MockCircuitBreaker::new()
    .expect_is_open()
    .returning(false)
    .expect_record_failure()

  service <- create_test_service(mock_transport, mock_circuit_breaker)

  // Act
  result <- service.create(create_test_request()).await

  // Assert
  ASSERT result.is_err()

  error <- result.unwrap_err()
  ASSERT error IS RateLimitError::TooManyRequests
  ASSERT_EQ error.retry_after(), Some(Duration::from_secs(60))

  // Verify circuit breaker recorded failure
  mock_circuit_breaker.verify_calls().unwrap()
END TEST

// Test validation behavior
TEST FUNCTION test_messages_service_validation_error()
  // Arrange: No transport call expected (validation fails before request)
  mock_transport <- MockHttpTransport::new()
  // Note: No expected_request - transport should not be called

  service <- create_test_service(mock_transport)

  // Act: Invalid request (empty messages)
  request <- CreateMessageRequest {
    model: "claude-sonnet-4-20250514",
    max_tokens: 100,
    messages: []  // Invalid: empty messages
  }

  result <- service.create(request).await

  // Assert
  ASSERT result.is_err()

  error <- result.unwrap_err()
  ASSERT error IS RequestError::ValidationError
  ASSERT error.details.contains("messages")

  // Verify transport was NOT called
  ASSERT_EQ mock_transport.actual_requests.len(), 0
END TEST
```

### 22.3 Behavior-Driven Test Naming

```
// Test names should describe behavior, not implementation
// Pattern: test_<subject>_<behavior>_<context>

// Good test names:
TEST test_messages_service_returns_message_when_api_succeeds
TEST test_messages_service_retries_on_transient_error
TEST test_messages_service_fails_fast_on_validation_error
TEST test_circuit_breaker_opens_after_threshold_failures
TEST test_stream_handles_connection_interruption
TEST test_rate_limiter_delays_when_limit_reached

// Test organization by behavior groups
MODULE messages_service_tests {
  MODULE create_message {
    TEST test_returns_message_on_success
    TEST test_validates_model_required
    TEST test_validates_messages_not_empty
    TEST test_validates_max_tokens_positive
    TEST test_retries_on_rate_limit
    TEST test_retries_on_server_error
    TEST test_records_metrics_on_success
    TEST test_records_metrics_on_failure
  }

  MODULE create_stream {
    TEST test_returns_stream_on_success
    TEST test_emits_message_start_event
    TEST test_emits_content_block_delta_events
    TEST test_emits_message_stop_event
    TEST test_handles_stream_interruption
    TEST test_records_token_usage_at_stream_end
  }

  MODULE count_tokens {
    TEST test_returns_token_count
    TEST test_validates_model_required
    TEST test_validates_messages_required
  }
}
```

---

## 23. Mock Implementations

### 23.1 Mock Messages Service

```
STRUCT MockMessagesService IMPLEMENTS MessagesService, TestDouble<MessagesService> {
  create_responses: VecDeque<Result<Message, AnthropicError>>,
  stream_responses: VecDeque<Result<MockMessageStream, AnthropicError>>,
  count_responses: VecDeque<Result<TokenCount, AnthropicError>>,

  create_calls: Vec<CreateMessageRequest>,
  stream_calls: Vec<CreateMessageRequest>,
  count_calls: Vec<CountTokensRequest>,

  expected_create_calls: Option<usize>,
  expected_stream_calls: Option<usize>,
  expected_count_calls: Option<usize>
}

FUNCTION MockMessagesService::new() -> MockMessagesService
  RETURN MockMessagesService {
    create_responses: VecDeque::new(),
    stream_responses: VecDeque::new(),
    count_responses: VecDeque::new(),
    create_calls: Vec::new(),
    stream_calls: Vec::new(),
    count_calls: Vec::new(),
    expected_create_calls: None,
    expected_stream_calls: None,
    expected_count_calls: None
  }
END FUNCTION

// Fluent configuration
FUNCTION mock_messages.on_create(response: Result<Message, AnthropicError>) -> MockMessagesService
  self.create_responses.push_back(response)
  RETURN self
END FUNCTION

FUNCTION mock_messages.expect_create_calls(count: usize) -> MockMessagesService
  self.expected_create_calls <- Some(count)
  RETURN self
END FUNCTION

// Implementation
ASYNC FUNCTION mock_messages.create(request: CreateMessageRequest) -> Result<Message, AnthropicError>
  self.create_calls.push(request)

  IF self.create_responses.is_empty() THEN
    PANIC("MockMessagesService: No create response configured")
  END IF

  RETURN self.create_responses.pop_front().unwrap()
END FUNCTION

ASYNC FUNCTION mock_messages.create_stream(request: CreateMessageRequest) -> Result<MessageStream, AnthropicError>
  self.stream_calls.push(request)

  IF self.stream_responses.is_empty() THEN
    PANIC("MockMessagesService: No stream response configured")
  END IF

  RETURN self.stream_responses.pop_front().unwrap()
END FUNCTION

ASYNC FUNCTION mock_messages.count_tokens(request: CountTokensRequest) -> Result<TokenCount, AnthropicError>
  self.count_calls.push(request)

  IF self.count_responses.is_empty() THEN
    PANIC("MockMessagesService: No count response configured")
  END IF

  RETURN self.count_responses.pop_front().unwrap()
END FUNCTION

// Verification
FUNCTION mock_messages.verify_calls() -> Result<(), AssertionError>
  IF self.expected_create_calls IS Some THEN
    IF self.create_calls.len() != self.expected_create_calls THEN
      RETURN Error(AssertionError {
        message: format("Expected {} create calls, got {}", self.expected_create_calls, self.create_calls.len())
      })
    END IF
  END IF

  IF self.expected_stream_calls IS Some THEN
    IF self.stream_calls.len() != self.expected_stream_calls THEN
      RETURN Error(AssertionError {
        message: format("Expected {} stream calls, got {}", self.expected_stream_calls, self.stream_calls.len())
      })
    END IF
  END IF

  IF self.expected_count_calls IS Some THEN
    IF self.count_calls.len() != self.expected_count_calls THEN
      RETURN Error(AssertionError {
        message: format("Expected {} count calls, got {}", self.expected_count_calls, self.count_calls.len())
      })
    END IF
  END IF

  RETURN Ok(())
END FUNCTION

// Accessor for recorded calls
FUNCTION mock_messages.get_create_calls() -> &[CreateMessageRequest]
  RETURN &self.create_calls
END FUNCTION
```

### 23.2 Mock Message Stream

```
STRUCT MockMessageStream IMPLEMENTS AsyncIterator<MessageStreamEvent> {
  events: VecDeque<Result<MessageStreamEvent, AnthropicError>>,
  emit_delay: Option<Duration>
}

FUNCTION MockMessageStream::from_events(events: Vec<MessageStreamEvent>) -> MockMessageStream
  RETURN MockMessageStream {
    events: events.into_iter().map(Ok).collect(),
    emit_delay: None
  }
END FUNCTION

FUNCTION MockMessageStream::from_message(message: Message) -> MockMessageStream
  // Convert a complete message into stream events
  events <- Vec::new()

  // message_start
  events.push(MessageStreamEvent {
    type: "message_start",
    message: message.clone()
  })

  // content_block_start and deltas for each content block
  FOR EACH (index, block) IN message.content.enumerate() DO
    events.push(MessageStreamEvent {
      type: "content_block_start",
      index: index,
      content_block: block.clone()
    })

    IF block IS ContentBlock::Text { text, .. } THEN
      // Emit text in chunks
      FOR chunk IN text.chunks(20) DO
        events.push(MessageStreamEvent {
          type: "content_block_delta",
          index: index,
          delta: ContentDelta {
            type: "text_delta",
            text: chunk
          }
        })
      END FOR
    END IF

    events.push(MessageStreamEvent {
      type: "content_block_stop",
      index: index
    })
  END FOR

  // message_delta
  events.push(MessageStreamEvent {
    type: "message_delta",
    delta: {
      stop_reason: message.stop_reason,
      stop_sequence: message.stop_sequence
    },
    usage: { output_tokens: message.usage.output_tokens }
  })

  // message_stop
  events.push(MessageStreamEvent {
    type: "message_stop"
  })

  RETURN MockMessageStream {
    events: events.into_iter().map(Ok).collect(),
    emit_delay: None
  }
END FUNCTION

FUNCTION mock_stream.with_error_at(index: usize, error: AnthropicError) -> MockMessageStream
  IF index < self.events.len() THEN
    self.events[index] <- Error(error)
  ELSE
    self.events.push_back(Error(error))
  END IF
  RETURN self
END FUNCTION

FUNCTION mock_stream.with_delay(delay: Duration) -> MockMessageStream
  self.emit_delay <- Some(delay)
  RETURN self
END FUNCTION

ASYNC FUNCTION mock_stream.next() -> Option<Result<MessageStreamEvent, AnthropicError>>
  IF self.events.is_empty() THEN
    RETURN None
  END IF

  IF self.emit_delay IS Some THEN
    sleep(self.emit_delay).await
  END IF

  RETURN Some(self.events.pop_front().unwrap())
END FUNCTION
```

### 23.3 Test Fixtures

```
// Common test data factories
MODULE test_fixtures {
  FUNCTION create_test_message(overrides: MessageOverrides) -> Message
    RETURN Message {
      id: overrides.id OR format("msg_{}", random_string(8)),
      type: "message",
      role: "assistant",
      content: overrides.content OR [
        ContentBlock::Text {
          type: "text",
          text: "Hello! How can I help you today?"
        }
      ],
      model: overrides.model OR "claude-sonnet-4-20250514",
      stop_reason: overrides.stop_reason OR Some("end_turn"),
      stop_sequence: None,
      usage: overrides.usage OR Usage {
        input_tokens: 10,
        output_tokens: 20,
        cache_creation_input_tokens: None,
        cache_read_input_tokens: None
      }
    }
  END FUNCTION

  FUNCTION create_test_request(overrides: RequestOverrides) -> CreateMessageRequest
    RETURN CreateMessageRequest {
      model: overrides.model OR "claude-sonnet-4-20250514",
      max_tokens: overrides.max_tokens OR 1024,
      messages: overrides.messages OR [
        { role: "user", content: "Hello" }
      ],
      system: overrides.system,
      temperature: overrides.temperature,
      top_p: overrides.top_p,
      top_k: overrides.top_k,
      tools: overrides.tools,
      tool_choice: overrides.tool_choice,
      stream: overrides.stream,
      thinking: overrides.thinking
    }
  END FUNCTION

  FUNCTION create_test_auth_manager(api_key: String) -> AuthManager
    RETURN AuthManagerImpl {
      api_key: SecretString::new(api_key),
      api_version: "2023-06-01",
      beta_features: Vec::new()
    }
  END FUNCTION

  FUNCTION create_test_config(overrides: ConfigOverrides) -> AnthropicConfig
    RETURN AnthropicConfig {
      api_key: SecretString::new(overrides.api_key OR "sk-ant-test-key"),
      base_url: Url::parse(overrides.base_url OR "https://api.anthropic.com").unwrap(),
      api_version: overrides.api_version OR "2023-06-01",
      timeout: overrides.timeout OR Duration::from_secs(60),
      max_retries: overrides.max_retries OR 3,
      retry_config: RetryConfig::default(),
      circuit_breaker_config: CircuitBreakerConfig::default(),
      rate_limit_config: None,
      beta_features: overrides.beta_features OR Vec::new()
    }
  END FUNCTION

  // Error fixtures
  FUNCTION create_rate_limit_error(retry_after: Duration) -> AnthropicError
    RETURN RateLimitError::TooManyRequests {
      retry_after: Some(retry_after),
      message: "Rate limit exceeded"
    }
  END FUNCTION

  FUNCTION create_validation_error(field: String, message: String) -> AnthropicError
    RETURN RequestError::ValidationError {
      message: "Validation failed",
      details: [
        ValidationDetail { field, message }
      ]
    }
  END FUNCTION
}
```

---

## 24. Integration Test Utilities

### 24.1 Test Server

```
// Local test server for integration tests
STRUCT TestServer {
  server: HttpServer,
  port: u16,
  requests_received: Arc<Mutex<Vec<RecordedRequest>>>,
  responses_to_send: Arc<Mutex<VecDeque<TestResponse>>>
}

FUNCTION TestServer::start() -> TestServer
  // Find available port
  port <- find_available_port()

  // Request recording
  requests <- Arc::new(Mutex::new(Vec::new()))
  responses <- Arc::new(Mutex::new(VecDeque::new()))

  requests_clone <- requests.clone()
  responses_clone <- responses.clone()

  // Start server
  server <- HttpServer::new()
    .bind(format("127.0.0.1:{}", port))
    .route("/*", async move |req| {
      // Record request
      requests_clone.lock().push(RecordedRequest::from(req))

      // Get next response
      response <- responses_clone.lock().pop_front()
        .unwrap_or(TestResponse::default_error())

      response.into_http_response()
    })
    .start()

  RETURN TestServer {
    server,
    port,
    requests_received: requests,
    responses_to_send: responses
  }
END FUNCTION

FUNCTION test_server.url() -> String
  RETURN format("http://127.0.0.1:{}", self.port)
END FUNCTION

FUNCTION test_server.enqueue_response(response: TestResponse)
  self.responses_to_send.lock().push_back(response)
END FUNCTION

FUNCTION test_server.get_recorded_requests() -> Vec<RecordedRequest>
  RETURN self.requests_received.lock().clone()
END FUNCTION

FUNCTION test_server.clear()
  self.requests_received.lock().clear()
  self.responses_to_send.lock().clear()
END FUNCTION

STRUCT RecordedRequest {
  method: String,
  path: String,
  headers: HashMap<String, String>,
  body: Option<String>
}

STRUCT TestResponse {
  status: u16,
  headers: HashMap<String, String>,
  body: String,
  delay: Option<Duration>
}

FUNCTION TestResponse::ok(body: Value) -> TestResponse
  RETURN TestResponse {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: body.to_string(),
    delay: None
  }
END FUNCTION

FUNCTION TestResponse::error(status: u16, error_type: String, message: String) -> TestResponse
  RETURN TestResponse {
    status: status,
    headers: { "Content-Type": "application/json" },
    body: json!({
      "type": "error",
      "error": {
        "type": error_type,
        "message": message
      }
    }).to_string(),
    delay: None
  }
END FUNCTION

FUNCTION TestResponse::with_delay(delay: Duration) -> TestResponse
  self.delay <- Some(delay)
  RETURN self
END FUNCTION
```

### 24.2 Integration Test Helpers

```
// Integration test setup and teardown
STRUCT IntegrationTestContext {
  server: TestServer,
  client: AnthropicClient
}

FUNCTION setup_integration_test() -> IntegrationTestContext
  // Start test server
  server <- TestServer::start()

  // Create client pointing to test server
  config <- AnthropicConfig {
    api_key: SecretString::new("test-key"),
    base_url: Url::parse(server.url()).unwrap(),
    api_version: "2023-06-01",
    timeout: Duration::from_secs(5),
    max_retries: 0,  // No retries in integration tests by default
    retry_config: RetryConfig::default(),
    circuit_breaker_config: CircuitBreakerConfig::default(),
    rate_limit_config: None,
    beta_features: Vec::new()
  }

  client <- create_anthropic_client(config).unwrap()

  RETURN IntegrationTestContext { server, client }
END FUNCTION

FUNCTION teardown_integration_test(ctx: IntegrationTestContext)
  ctx.server.shutdown()
END FUNCTION

// Example integration test
TEST FUNCTION integration_test_create_message()
  ctx <- setup_integration_test()

  // Arrange: Configure server response
  ctx.server.enqueue_response(TestResponse::ok(json!({
    "id": "msg_integration_test",
    "type": "message",
    "role": "assistant",
    "content": [{"type": "text", "text": "Integration test response"}],
    "model": "claude-sonnet-4-20250514",
    "stop_reason": "end_turn",
    "usage": {"input_tokens": 5, "output_tokens": 10}
  })))

  // Act
  result <- ctx.client.messages().create(CreateMessageRequest {
    model: "claude-sonnet-4-20250514",
    max_tokens: 100,
    messages: [{ role: "user", content: "Test" }]
  }).await

  // Assert response
  ASSERT result.is_ok()
  message <- result.unwrap()
  ASSERT_EQ message.id, "msg_integration_test"

  // Assert request was correct
  requests <- ctx.server.get_recorded_requests()
  ASSERT_EQ requests.len(), 1
  ASSERT_EQ requests[0].method, "POST"
  ASSERT_EQ requests[0].path, "/v1/messages"
  ASSERT requests[0].headers.contains_key("x-api-key")
  ASSERT requests[0].headers.contains_key("anthropic-version")

  teardown_integration_test(ctx)
END TEST
```

### 24.3 Contract Tests

```
// Contract tests verify the module works with the real API
// Run sparingly (e.g., in CI) due to cost and rate limits

MODULE contract_tests {
  // Skip if no API key configured
  CONST SKIP_MESSAGE = "ANTHROPIC_API_KEY not set, skipping contract test"

  FUNCTION get_api_key() -> Option<String>
    RETURN read_env("ANTHROPIC_CONTRACT_TEST_API_KEY")
  END FUNCTION

  TEST FUNCTION contract_test_create_message()
    api_key <- get_api_key()
    IF api_key IS None THEN
      SKIP(SKIP_MESSAGE)
    END IF

    client <- create_anthropic_client(AnthropicConfig {
      api_key: SecretString::new(api_key),
      ..AnthropicConfig::default()
    }).unwrap()

    result <- client.messages().create(CreateMessageRequest {
      model: "claude-sonnet-4-20250514",
      max_tokens: 10,
      messages: [{ role: "user", content: "Say 'test' and nothing else" }]
    }).await

    ASSERT result.is_ok()

    message <- result.unwrap()
    ASSERT message.id.starts_with("msg_")
    ASSERT message.stop_reason IS Some
    ASSERT message.usage.input_tokens > 0
    ASSERT message.usage.output_tokens > 0
  END TEST

  TEST FUNCTION contract_test_stream_message()
    api_key <- get_api_key()
    IF api_key IS None THEN
      SKIP(SKIP_MESSAGE)
    END IF

    client <- create_anthropic_client(AnthropicConfig {
      api_key: SecretString::new(api_key),
      ..AnthropicConfig::default()
    }).unwrap()

    stream <- client.messages().create_stream(CreateMessageRequest {
      model: "claude-sonnet-4-20250514",
      max_tokens: 10,
      messages: [{ role: "user", content: "Say 'test' and nothing else" }]
    }).await.unwrap()

    events <- collect_stream(stream).await
    ASSERT events.len() > 0
    ASSERT events.any(|e| e.type == "message_start")
    ASSERT events.any(|e| e.type == "message_stop")
  END TEST

  TEST FUNCTION contract_test_list_models()
    api_key <- get_api_key()
    IF api_key IS None THEN
      SKIP(SKIP_MESSAGE)
    END IF

    client <- create_anthropic_client(AnthropicConfig {
      api_key: SecretString::new(api_key),
      ..AnthropicConfig::default()
    }).unwrap()

    result <- client.models().list(None).await

    ASSERT result.is_ok()

    models <- result.unwrap()
    ASSERT models.data.len() > 0
    ASSERT models.data.any(|m| m.id.contains("claude"))
  END TEST
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial pseudocode (Part 4) |

---

**End of Pseudocode Phase**

*The next phase (Architecture) will provide detailed system design, module structure, and integration patterns.*
