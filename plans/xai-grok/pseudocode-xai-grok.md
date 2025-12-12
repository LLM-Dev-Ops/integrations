# SPARC Phase 3: Pseudocode — xAI Grok Integration

**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/xai/grok`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Client Initialization](#2-client-initialization)
3. [Model Registry](#3-model-registry)
4. [Authentication Provider](#4-authentication-provider)
5. [Chat Service](#5-chat-service)
6. [Streaming Pipeline](#6-streaming-pipeline)
7. [Reasoning Content Extraction](#7-reasoning-content-extraction)
8. [Embedding Service](#8-embedding-service)
9. [Image Generation Service](#9-image-generation-service)
10. [Live Search Integration](#10-live-search-integration)
11. [Error Handling](#11-error-handling)
12. [Platform Adapter](#12-platform-adapter)
13. [RuvVector Integration](#13-ruvvector-integration)

---

## 1. Overview

### 1.1 Pseudocode Conventions

```
FUNCTION name(param: Type) -> ReturnType
  // Comments explain intent
  VARIABLE <- expression
  IF condition THEN
    action
  END IF
  FOR EACH item IN collection DO
    process(item)
  END FOR
  TRY
    risky_operation()
  CATCH ErrorType AS e
    handle(e)
  END TRY
  RETURN value
END FUNCTION
```

### 1.2 Design Principles

| Principle | Implementation |
|-----------|----------------|
| Thin Adapter | Minimal logic, delegate to shared modules |
| OpenAI-Compatible | Leverage xAI's OpenAI-compatible API format |
| Model Registry | Route via model registry with capability awareness |
| Reasoning Capture | Extract and expose Grok-3 reasoning_content |

### 1.3 Constants

```
CONST XAI_BASE_URL <- "https://api.x.ai/v1"
CONST DEFAULT_TIMEOUT <- 120s
CONST DEFAULT_MAX_RETRIES <- 3
CONST STREAMING_CHANNEL_CAPACITY <- 100

CONST MODEL_IDS <- {
  "grok-4": GrokModel::Grok4,
  "grok-4-latest": GrokModel::Grok4,
  "grok-4.1": GrokModel::Grok4_1,
  "grok-3": GrokModel::Grok3Beta,
  "grok-3-beta": GrokModel::Grok3Beta,
  "grok-3-mini": GrokModel::Grok3MiniBeta,
  "grok-3-mini-beta": GrokModel::Grok3MiniBeta,
  "grok-2-image": GrokModel::Grok2Image,
  "grok-2-image-1212": GrokModel::Grok2Image,
  "grok-vision-beta": GrokModel::GrokVisionBeta
}

CONST CONTEXT_WINDOWS <- {
  GrokModel::Grok4: 256_000,
  GrokModel::Grok4_1: 256_000,
  GrokModel::Grok3Beta: 131_000,
  GrokModel::Grok3MiniBeta: 131_000,
  GrokModel::GrokVisionBeta: 128_000,
  GrokModel::Grok2Image: None
}
```

---

## 2. Client Initialization

### 2.1 Client Factory

```
FUNCTION create_grok_client(config: GrokConfig) -> Result<GrokClient, Error>
  // Step 1: Validate configuration
  validation_result <- validate_config(config)
  IF validation_result IS Error THEN
    RETURN Error(ConfigurationError::Invalid(validation_result.message))
  END IF

  // Step 2: Initialize credential provider (from shared/credentials)
  credentials <- config.credentials OR create_default_credential_provider(config)

  // Step 3: Initialize model registry
  model_registry <- ModelRegistry::new()

  // Step 4: Initialize shared resilience (from shared/resilience)
  resilience <- create_resilience_orchestrator(
    retry_config: config.resilience.retry OR DEFAULT_RETRY_CONFIG,
    circuit_breaker_config: config.resilience.circuit_breaker OR DEFAULT_CB_CONFIG,
    rate_limiter_config: config.resilience.rate_limiter
  )

  // Step 5: Initialize shared observability (from shared/observability)
  observability <- create_observability_context(
    service_name: "xai-grok",
    logger: get_logger("xai-grok"),
    tracer: get_tracer("xai-grok"),
    metrics: get_metrics_collector("xai-grok")
  )

  // Step 6: Initialize HTTP transport (from shared/http)
  transport <- create_http_transport(HttpTransportConfig {
    timeout: config.timeout OR DEFAULT_TIMEOUT,
    tls_config: TlsConfig { min_version: TLS_1_2 },
    connection_pool_size: 10
  })

  // Step 7: Assemble client
  client <- GrokClientImpl {
    config: config,
    base_url: config.base_url OR XAI_BASE_URL,
    transport: Arc::new(transport),
    credentials: Arc::new(credentials),
    model_registry: Arc::new(model_registry),
    resilience: Arc::new(resilience),
    observability: observability,

    // Lazy-initialized services
    chat_service: OnceCell::new(),
    embedding_service: OnceCell::new(),
    image_service: OnceCell::new(),

    // Feature flags
    live_search_enabled: config.live_search_enabled OR false,

    // Optional RuvVector (from shared/database)
    ruvvector: config.ruvvector
  }

  observability.logger.info("xAI Grok client initialized", {
    base_url: client.base_url,
    default_model: config.default_model,
    live_search_enabled: client.live_search_enabled
  })

  RETURN Ok(client)
END FUNCTION
```

### 2.2 Client from Environment

```
FUNCTION create_grok_client_from_env() -> Result<GrokClient, Error>
  // Step 1: Load API key
  api_key <- read_env("XAI_API_KEY")
  IF api_key IS None THEN
    RETURN Error(ConfigurationError::MissingApiKey("XAI_API_KEY not set"))
  END IF

  // Step 2: Create credential provider
  credentials <- ApiKeyCredentialProvider::new(api_key)

  // Step 3: Build config from environment
  config <- GrokConfig {
    credentials: credentials,
    base_url: read_env("XAI_BASE_URL") OR XAI_BASE_URL,
    default_model: parse_model(read_env("XAI_DEFAULT_MODEL")) OR GrokModel::Grok3Beta,
    timeout: parse_duration(read_env("XAI_REQUEST_TIMEOUT_MS")) OR DEFAULT_TIMEOUT,
    resilience: ResilienceConfig::default(),
    live_search_enabled: read_env("XAI_LIVE_SEARCH_ENABLED") == "true",
    ruvvector: IF read_env("RUVVECTOR_ENABLED") == "true" THEN
      Some(DatabaseConfig::from_env())
    ELSE
      None
    END IF
  }

  RETURN create_grok_client(config)
END FUNCTION
```

### 2.3 Service Accessor Pattern

```
FUNCTION client.chat() -> &ChatService
  RETURN self.chat_service.get_or_init(|| {
    ChatServiceImpl::new(
      base_url: self.base_url.clone(),
      transport: self.transport.clone(),
      credentials: self.credentials.clone(),
      model_registry: self.model_registry.clone(),
      resilience: self.resilience.clone(),
      observability: self.observability.clone(),
      live_search_enabled: self.live_search_enabled
    )
  })
END FUNCTION

FUNCTION client.embeddings() -> &EmbeddingService
  RETURN self.embedding_service.get_or_init(|| {
    EmbeddingServiceImpl::new(
      base_url: self.base_url.clone(),
      transport: self.transport.clone(),
      credentials: self.credentials.clone(),
      model_registry: self.model_registry.clone(),
      resilience: self.resilience.clone(),
      observability: self.observability.clone()
    )
  })
END FUNCTION

FUNCTION client.images() -> &ImageService
  RETURN self.image_service.get_or_init(|| {
    ImageServiceImpl::new(
      base_url: self.base_url.clone(),
      transport: self.transport.clone(),
      credentials: self.credentials.clone(),
      resilience: self.resilience.clone(),
      observability: self.observability.clone()
    )
  })
END FUNCTION

FUNCTION client.models() -> &ModelRegistry
  RETURN &self.model_registry
END FUNCTION
```

---

## 3. Model Registry

### 3.1 Registry Implementation

```
STRUCT ModelRegistry {
  models: HashMap<String, GrokModel>,         // by model_id and aliases
  capabilities: HashMap<GrokModel, GrokCapabilities>
}

FUNCTION ModelRegistry::new() -> Self
  registry <- ModelRegistry {
    models: HashMap::new(),
    capabilities: HashMap::new()
  }

  // Register all models with aliases
  FOR EACH (id, model) IN MODEL_IDS DO
    registry.models.insert(id.to_string(), model)
  END FOR

  // Register capabilities
  registry.capabilities.insert(GrokModel::Grok4, GrokCapabilities {
    chat: true,
    streaming: true,
    function_calling: true,
    vision: true,
    reasoning_content: false,
    image_generation: false,
    live_search: true,
    context_window: 256_000
  })

  registry.capabilities.insert(GrokModel::Grok4_1, GrokCapabilities {
    chat: true,
    streaming: true,
    function_calling: true,
    vision: true,
    reasoning_content: false,  // Grok-4.1 has thinking mode but different API
    image_generation: false,
    live_search: true,
    context_window: 256_000
  })

  registry.capabilities.insert(GrokModel::Grok3Beta, GrokCapabilities {
    chat: true,
    streaming: true,
    function_calling: true,
    vision: false,
    reasoning_content: true,   // Returns reasoning_content field
    image_generation: false,
    live_search: true,
    context_window: 131_000
  })

  registry.capabilities.insert(GrokModel::Grok3MiniBeta, GrokCapabilities {
    chat: true,
    streaming: true,
    function_calling: true,
    vision: false,
    reasoning_content: true,   // Returns reasoning_content field
    image_generation: false,
    live_search: true,
    context_window: 131_000
  })

  registry.capabilities.insert(GrokModel::GrokVisionBeta, GrokCapabilities {
    chat: true,
    streaming: true,
    function_calling: true,
    vision: true,
    reasoning_content: false,
    image_generation: false,
    live_search: true,
    context_window: 128_000
  })

  registry.capabilities.insert(GrokModel::Grok2Image, GrokCapabilities {
    chat: false,
    streaming: false,
    function_calling: false,
    vision: false,
    reasoning_content: false,
    image_generation: true,
    live_search: false,
    context_window: None
  })

  RETURN registry
END FUNCTION
```

### 3.2 Model Resolution

```
FUNCTION registry.resolve(model_hint: &str) -> Result<GrokModel, Error>
  // Step 1: Try exact match (case-insensitive)
  hint_lower <- model_hint.to_lowercase()

  IF self.models.contains_key(&hint_lower) THEN
    RETURN Ok(self.models.get(&hint_lower).unwrap().clone())
  END IF

  // Step 2: Try partial match
  FOR EACH (id, model) IN self.models DO
    IF hint_lower.contains(id) OR id.contains(&hint_lower) THEN
      RETURN Ok(model.clone())
    END IF
  END FOR

  // Step 3: No match - return error with suggestions
  available <- self.models.keys().collect::<Vec<_>>().join(", ")
  RETURN Error(ModelNotFound {
    model_hint: model_hint.to_string(),
    available_models: available
  })
END FUNCTION

FUNCTION registry.get_capabilities(model: &GrokModel) -> &GrokCapabilities
  RETURN self.capabilities.get(model).expect("All models should have capabilities")
END FUNCTION

FUNCTION registry.supports_reasoning(model: &GrokModel) -> bool
  RETURN self.get_capabilities(model).reasoning_content
END FUNCTION

FUNCTION registry.supports_vision(model: &GrokModel) -> bool
  RETURN self.get_capabilities(model).vision
END FUNCTION

FUNCTION registry.get_context_window(model: &GrokModel) -> Option<u32>
  RETURN self.get_capabilities(model).context_window
END FUNCTION

FUNCTION registry.list() -> Vec<GrokModelInfo>
  result <- []
  FOR EACH (model, caps) IN self.capabilities DO
    result.push(GrokModelInfo {
      model: model.clone(),
      model_id: model.model_id(),
      capabilities: caps.clone()
    })
  END FOR
  RETURN result
END FUNCTION
```

---

## 4. Authentication Provider

### 4.1 API Key Provider

```
STRUCT ApiKeyCredentialProvider {
  api_key: String
}

IMPL CredentialProvider FOR ApiKeyCredentialProvider {
  ASYNC FUNCTION get_auth_header(provider_name: &str) -> Result<(String, String), Error>
    // xAI uses Bearer token authentication
    RETURN Ok(("Authorization", format("Bearer {}", self.api_key)))
  END FUNCTION

  ASYNC FUNCTION refresh() -> Result<(), Error>
    // API keys don't need refresh
    RETURN Ok(())
  END FUNCTION
}

FUNCTION ApiKeyCredentialProvider::new(api_key: String) -> Self
  RETURN ApiKeyCredentialProvider { api_key }
END FUNCTION

FUNCTION ApiKeyCredentialProvider::from_env() -> Result<Self, Error>
  api_key <- read_env("XAI_API_KEY")
  IF api_key IS None THEN
    RETURN Error(AuthenticationError::MissingApiKey)
  END IF
  RETURN Ok(ApiKeyCredentialProvider { api_key: api_key.unwrap() })
END FUNCTION
```

---

## 5. Chat Service

### 5.1 Chat Completion

```
STRUCT ChatServiceImpl {
  base_url: String,
  transport: Arc<HttpTransport>,
  credentials: Arc<dyn CredentialProvider>,
  model_registry: Arc<ModelRegistry>,
  resilience: Arc<ResilienceOrchestrator>,
  observability: ObservabilityContext,
  live_search_enabled: bool
}

ASYNC FUNCTION service.complete(request: GrokChatRequest) -> Result<GrokChatResponse, Error>
  // Step 1: Start tracing span
  span <- self.observability.tracer.start_span("xai_grok.chat.complete")
  span.set_attribute("model", request.model.model_id())

  TRY
    // Step 2: Resolve and validate model
    model <- request.model
    capabilities <- self.model_registry.get_capabilities(&model)

    IF NOT capabilities.chat THEN
      RETURN Error(ValidationError::ModelDoesNotSupportChat {
        model: model.model_id()
      })
    END IF

    // Step 3: Validate vision content if present
    IF has_vision_content(&request.messages) AND NOT capabilities.vision THEN
      RETURN Error(ValidationError::ModelDoesNotSupportVision {
        model: model.model_id()
      })
    END IF

    // Step 4: Build URL (OpenAI-compatible)
    url <- format("{}/chat/completions", self.base_url)

    // Step 5: Get auth header
    auth_header <- self.credentials.get_auth_header("xai").await?

    // Step 6: Build request body (OpenAI-compatible format)
    body <- build_chat_request_body(&request, self.live_search_enabled)

    // Step 7: Build HTTP request
    http_request <- HttpRequest::post(url)
      .header(auth_header.0, auth_header.1)
      .header("Content-Type", "application/json")
      .json(&body)?

    // Step 8: Execute with resilience
    http_response <- self.resilience.execute(
      operation_name: "chat_completion",
      classifier: GrokRetryClassifier,
      action: || async {
        self.transport.send(http_request.clone()).await
      }
    ).await?

    // Step 9: Parse response (with reasoning content extraction)
    response <- parse_chat_response(http_response, &model, &self.model_registry).await?

    // Step 10: Record metrics
    self.observability.metrics.record_request(
      model: model.model_id(),
      operation: "chat_completion",
      status: "success",
      latency: span.elapsed()
    )
    self.observability.metrics.record_tokens(
      model: model.model_id(),
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens
    )

    // Record reasoning tokens if present
    IF response.usage.reasoning_tokens IS Some THEN
      self.observability.metrics.record_counter(
        name: "xai_grok_reasoning_tokens",
        value: response.usage.reasoning_tokens.unwrap(),
        labels: { model: model.model_id() }
      )
    END IF

    span.set_status(SpanStatus::Ok)
    RETURN Ok(response)

  CATCH error AS e
    span.set_status(SpanStatus::Error)
    span.record_exception(&e)
    self.observability.metrics.record_request(
      model: request.model.model_id(),
      operation: "chat_completion",
      status: "error",
      latency: span.elapsed()
    )
    RETURN Error(e)

  FINALLY
    span.end()
  END TRY
END FUNCTION
```

### 5.2 Build Chat Request Body

```
FUNCTION build_chat_request_body(
  request: &GrokChatRequest,
  live_search_enabled: bool
) -> serde_json::Value
  body <- json!({
    "model": request.model.model_id(),
    "messages": serialize_messages(&request.messages)
  })

  // Optional parameters
  IF request.temperature IS Some THEN
    body["temperature"] <- request.temperature
  END IF
  IF request.top_p IS Some THEN
    body["top_p"] <- request.top_p
  END IF
  IF request.max_tokens IS Some THEN
    body["max_tokens"] <- request.max_tokens
  END IF
  IF request.stop IS Some THEN
    body["stop"] <- request.stop
  END IF
  IF request.frequency_penalty IS Some THEN
    body["frequency_penalty"] <- request.frequency_penalty
  END IF
  IF request.presence_penalty IS Some THEN
    body["presence_penalty"] <- request.presence_penalty
  END IF
  IF request.seed IS Some THEN
    body["seed"] <- request.seed
  END IF
  IF request.user IS Some THEN
    body["user"] <- request.user
  END IF

  // Response format (JSON mode)
  IF request.response_format IS Some THEN
    body["response_format"] <- match request.response_format.unwrap() {
      ResponseFormat::Text => json!({ "type": "text" }),
      ResponseFormat::Json => json!({ "type": "json_object" }),
      ResponseFormat::JsonSchema { schema } => json!({
        "type": "json_schema",
        "json_schema": schema
      })
    }
  END IF

  // Tools / Function calling
  IF request.tools IS Some AND NOT request.tools.is_empty() THEN
    tools <- request.tools.clone().unwrap()

    // Inject Live Search tool if enabled and not already present
    IF live_search_enabled AND NOT has_live_search_tool(&tools) THEN
      tools.push(create_live_search_tool())
    END IF

    body["tools"] <- serialize_tools(&tools)

    IF request.tool_choice IS Some THEN
      body["tool_choice"] <- serialize_tool_choice(&request.tool_choice)
    END IF
  ELSE IF live_search_enabled THEN
    // Add Live Search as only tool if enabled
    body["tools"] <- json!([create_live_search_tool()])
    body["tool_choice"] <- "auto"
  END IF

  // Streaming flag
  IF request.stream IS Some AND request.stream.unwrap() THEN
    body["stream"] <- true
    body["stream_options"] <- json!({
      "include_usage": true
    })
  END IF

  RETURN body
END FUNCTION

FUNCTION serialize_messages(messages: &[ChatMessage]) -> serde_json::Value
  result <- []

  FOR EACH msg IN messages DO
    message_obj <- json!({
      "role": msg.role
    })

    // Handle content (text or multimodal)
    IF msg.content IS String THEN
      message_obj["content"] <- msg.content
    ELSE IF msg.content IS MultiModalContent THEN
      // Vision content format (OpenAI-compatible)
      content_parts <- []
      FOR EACH part IN msg.content.parts DO
        MATCH part {
          ContentPart::Text { text } => {
            content_parts.push(json!({ "type": "text", "text": text }))
          },
          ContentPart::Image { url, detail } => {
            content_parts.push(json!({
              "type": "image_url",
              "image_url": {
                "url": url,
                "detail": detail OR "auto"
              }
            }))
          },
          ContentPart::ImageBase64 { base64, media_type, detail } => {
            content_parts.push(json!({
              "type": "image_url",
              "image_url": {
                "url": format("data:{};base64,{}", media_type, base64),
                "detail": detail OR "auto"
              }
            }))
          }
        }
      END FOR
      message_obj["content"] <- content_parts
    END IF

    // Tool calls (for assistant messages)
    IF msg.tool_calls IS Some THEN
      message_obj["tool_calls"] <- msg.tool_calls
    END IF

    // Tool call ID (for tool response messages)
    IF msg.tool_call_id IS Some THEN
      message_obj["tool_call_id"] <- msg.tool_call_id
    END IF

    // Name (for function messages)
    IF msg.name IS Some THEN
      message_obj["name"] <- msg.name
    END IF

    result.push(message_obj)
  END FOR

  RETURN json!(result)
END FUNCTION
```

### 5.3 Parse Chat Response

```
ASYNC FUNCTION parse_chat_response(
  http_response: HttpResponse,
  model: &GrokModel,
  model_registry: &ModelRegistry
) -> Result<GrokChatResponse, Error>
  // Check HTTP status
  IF http_response.status != 200 THEN
    RETURN parse_error_response(http_response).await
  END IF

  // Parse JSON body
  body <- http_response.json::<GrokApiResponse>().await?

  // Check if model supports reasoning content
  supports_reasoning <- model_registry.supports_reasoning(model)

  // Map to GrokChatResponse
  response <- GrokChatResponse {
    id: body.id,
    object: body.object,
    created: body.created,
    model: body.model,
    choices: body.choices.iter().map(|c| {
      ChatChoice {
        index: c.index,
        message: ChatMessage {
          role: c.message.role.clone(),
          content: c.message.content.clone(),
          tool_calls: c.message.tool_calls.clone(),
          tool_call_id: None,
          name: None
        },
        finish_reason: c.finish_reason.clone(),
        // Extract reasoning_content if model supports it
        reasoning_content: IF supports_reasoning THEN
          c.message.reasoning_content.clone()
        ELSE
          None
        END IF
      }
    }).collect(),
    usage: TokenUsage {
      prompt_tokens: body.usage.prompt_tokens,
      completion_tokens: body.usage.completion_tokens,
      total_tokens: body.usage.total_tokens,
      // Grok-3 models return reasoning_tokens
      reasoning_tokens: IF supports_reasoning THEN
        body.usage.reasoning_tokens
      ELSE
        None
      END IF
    },
    system_fingerprint: body.system_fingerprint
  }

  RETURN Ok(response)
END FUNCTION
```

---

## 6. Streaming Pipeline

### 6.1 Streaming Chat Completion

```
ASYNC FUNCTION service.stream(request: GrokChatRequest) -> Result<ChatStream, Error>
  span <- self.observability.tracer.start_span("xai_grok.chat.stream")
  span.set_attribute("model", request.model.model_id())

  // Step 1: Resolve and validate model
  model <- request.model.clone()
  capabilities <- self.model_registry.get_capabilities(&model)

  IF NOT capabilities.streaming THEN
    RETURN Error(ValidationError::ModelDoesNotSupportStreaming {
      model: model.model_id()
    })
  END IF

  // Step 2: Build URL
  url <- format("{}/chat/completions", self.base_url)

  // Step 3: Get auth header
  auth_header <- self.credentials.get_auth_header("xai").await?

  // Step 4: Build request body with stream: true
  mut_request <- request.clone()
  mut_request.stream <- Some(true)
  body <- build_chat_request_body(&mut_request, self.live_search_enabled)

  // Step 5: Build HTTP request
  http_request <- HttpRequest::post(url)
    .header(auth_header.0, auth_header.1)
    .header("Content-Type", "application/json")
    .header("Accept", "text/event-stream")
    .json(&body)?

  // Step 6: Execute request and get response stream
  http_response <- self.transport.send_streaming(http_request).await?

  IF http_response.status != 200 THEN
    body <- http_response.text().await?
    RETURN parse_error_response_body(http_response.status, body)
  END IF

  // Step 7: Create SSE parser and return stream
  sse_stream <- SseParser::new(http_response.body_stream)

  // Step 8: Create bounded channel for backpressure
  (sender, receiver) <- channel::<ChatChunk>(STREAMING_CHANNEL_CAPACITY)

  // Step 9: Create ChatStream wrapper
  chat_stream <- ChatStream::new(
    sse_stream: sse_stream,
    observability: self.observability.clone(),
    model: model,
    model_registry: self.model_registry.clone(),
    span: span,
    sender: sender
  )

  RETURN Ok(chat_stream)
END FUNCTION
```

### 6.2 SSE Parser

```
STRUCT SseParser {
  body_stream: ByteStream,
  buffer: String,
  state: ParserState
}

ENUM ParserState {
  ReadingEvent,
  Done
}

IMPL Stream FOR SseParser {
  TYPE Item = Result<SseEvent, Error>

  ASYNC FUNCTION poll_next(cx: &mut Context) -> Poll<Option<Self::Item>>
    IF self.state == Done THEN
      RETURN Poll::Ready(None)
    END IF

    LOOP
      // Try to parse a complete event from buffer
      event <- try_parse_event(&mut self.buffer)
      IF event IS Some THEN
        // Check for [DONE] sentinel
        IF event.data == "[DONE]" THEN
          self.state <- Done
          RETURN Poll::Ready(None)
        END IF
        RETURN Poll::Ready(Some(Ok(event)))
      END IF

      // Need more data from stream
      chunk <- self.body_stream.poll_next(cx)
      MATCH chunk {
        Poll::Ready(Some(Ok(bytes))) => {
          self.buffer.push_str(&String::from_utf8_lossy(&bytes))
        },
        Poll::Ready(Some(Err(e))) => {
          RETURN Poll::Ready(Some(Err(Error::StreamError(e))))
        },
        Poll::Ready(None) => {
          self.state <- Done
          RETURN Poll::Ready(None)
        },
        Poll::Pending => {
          RETURN Poll::Pending
        }
      }
    END LOOP
  END FUNCTION
}

FUNCTION try_parse_event(buffer: &mut String) -> Option<SseEvent>
  // SSE format: data: {...}\n\n
  IF NOT buffer.contains("\n\n") THEN
    RETURN None
  END IF

  // Extract first complete event
  split_pos <- buffer.find("\n\n").unwrap() + 2
  event_str <- buffer[..split_pos].to_string()
  *buffer <- buffer[split_pos..].to_string()

  // Parse event lines
  data_line <- None
  FOR EACH line IN event_str.lines() DO
    IF line.starts_with("data: ") THEN
      data_line <- Some(line[6..].to_string())
    END IF
  END FOR

  IF data_line IS Some THEN
    RETURN Some(SseEvent { data: data_line.unwrap() })
  ELSE
    RETURN None
  END IF
END FUNCTION
```

### 6.3 Chat Stream

```
STRUCT ChatStream {
  sse_stream: SseParser,
  observability: ObservabilityContext,
  model: GrokModel,
  model_registry: Arc<ModelRegistry>,
  span: Span,
  accumulated_usage: Option<TokenUsage>,
  accumulated_reasoning: Option<String>,
  chunk_count: u32
}

IMPL Stream FOR ChatStream {
  TYPE Item = Result<ChatChunk, Error>

  ASYNC FUNCTION poll_next(cx: &mut Context) -> Poll<Option<Self::Item>>
    supports_reasoning <- self.model_registry.supports_reasoning(&self.model)

    MATCH self.sse_stream.poll_next(cx) {
      Poll::Ready(Some(Ok(event))) => {
        // Parse JSON data
        chunk_result <- parse_json::<ChatChunkRaw>(&event.data)

        MATCH chunk_result {
          Ok(raw_chunk) => {
            self.chunk_count <- self.chunk_count + 1

            // Capture usage from final chunk
            IF raw_chunk.usage IS Some THEN
              self.accumulated_usage <- raw_chunk.usage.clone()
            END IF

            // Accumulate reasoning content for Grok-3 models
            IF supports_reasoning AND raw_chunk.choices[0].delta.reasoning_content IS Some THEN
              reasoning_delta <- raw_chunk.choices[0].delta.reasoning_content.unwrap()
              IF self.accumulated_reasoning IS None THEN
                self.accumulated_reasoning <- Some(reasoning_delta)
              ELSE
                self.accumulated_reasoning <- Some(
                  self.accumulated_reasoning.unwrap() + &reasoning_delta
                )
              END IF
            END IF

            // Convert to ChatChunk
            chunk <- ChatChunk {
              id: raw_chunk.id,
              object: raw_chunk.object,
              created: raw_chunk.created,
              model: raw_chunk.model,
              choices: raw_chunk.choices.iter().map(|c| ChunkChoice {
                index: c.index,
                delta: c.delta.clone(),
                finish_reason: c.finish_reason.clone(),
                reasoning_content: IF supports_reasoning THEN
                  c.delta.reasoning_content.clone()
                ELSE
                  None
                END IF
              }).collect(),
              usage: raw_chunk.usage.map(|u| TokenUsage {
                prompt_tokens: u.prompt_tokens,
                completion_tokens: u.completion_tokens,
                total_tokens: u.total_tokens,
                reasoning_tokens: IF supports_reasoning THEN u.reasoning_tokens ELSE None END IF
              })
            }

            Poll::Ready(Some(Ok(chunk)))
          },
          Err(e) => {
            Poll::Ready(Some(Err(Error::ParseError(e))))
          }
        }
      },
      Poll::Ready(Some(Err(e))) => {
        self.span.set_status(SpanStatus::Error)
        Poll::Ready(Some(Err(e)))
      },
      Poll::Ready(None) => {
        // Stream complete - record metrics
        IF self.accumulated_usage IS Some THEN
          usage <- self.accumulated_usage.as_ref().unwrap()
          self.observability.metrics.record_tokens(
            model: self.model.model_id(),
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens
          )
          IF usage.reasoning_tokens IS Some THEN
            self.observability.metrics.record_counter(
              name: "xai_grok_reasoning_tokens",
              value: usage.reasoning_tokens.unwrap(),
              labels: { model: self.model.model_id() }
            )
          END IF
        END IF
        self.observability.metrics.record_request(
          model: self.model.model_id(),
          operation: "chat_stream",
          status: "success",
          latency: self.span.elapsed()
        )
        self.span.set_status(SpanStatus::Ok)
        self.span.end()
        Poll::Ready(None)
      },
      Poll::Pending => Poll::Pending
    }
  END FUNCTION
}
```

---

## 7. Reasoning Content Extraction

### 7.1 Reasoning Extractor

```
STRUCT ReasoningExtractor {
  model_registry: Arc<ModelRegistry>
}

FUNCTION ReasoningExtractor::new(model_registry: Arc<ModelRegistry>) -> Self
  RETURN ReasoningExtractor { model_registry }
END FUNCTION

FUNCTION extractor.extract(
  response: &GrokChatResponse,
  model: &GrokModel
) -> Option<ReasoningContent>
  // Check if model supports reasoning
  IF NOT self.model_registry.supports_reasoning(model) THEN
    RETURN None
  END IF

  // Extract reasoning from first choice (primary response)
  IF response.choices.is_empty() THEN
    RETURN None
  END IF

  reasoning_text <- response.choices[0].reasoning_content.clone()
  IF reasoning_text IS None THEN
    RETURN None
  END IF

  RETURN Some(ReasoningContent {
    content: reasoning_text.unwrap(),
    tokens: response.usage.reasoning_tokens
  })
END FUNCTION

FUNCTION extractor.extract_from_stream(
  accumulated_reasoning: Option<String>,
  usage: &TokenUsage,
  model: &GrokModel
) -> Option<ReasoningContent>
  IF NOT self.model_registry.supports_reasoning(model) THEN
    RETURN None
  END IF

  IF accumulated_reasoning IS None THEN
    RETURN None
  END IF

  RETURN Some(ReasoningContent {
    content: accumulated_reasoning.unwrap(),
    tokens: usage.reasoning_tokens
  })
END FUNCTION
```

### 7.2 Reasoning Content Types

```
STRUCT ReasoningContent {
  content: String,
  tokens: Option<u32>
}

// Include in unified response metadata
FUNCTION include_reasoning_in_metadata(
  reasoning: Option<ReasoningContent>
) -> serde_json::Value
  IF reasoning IS None THEN
    RETURN json!({})
  END IF

  r <- reasoning.unwrap()
  RETURN json!({
    "reasoning_content": r.content,
    "reasoning_tokens": r.tokens
  })
END FUNCTION
```

---

## 8. Embedding Service

### 8.1 Create Embeddings

```
STRUCT EmbeddingServiceImpl {
  base_url: String,
  transport: Arc<HttpTransport>,
  credentials: Arc<dyn CredentialProvider>,
  model_registry: Arc<ModelRegistry>,
  resilience: Arc<ResilienceOrchestrator>,
  observability: ObservabilityContext
}

ASYNC FUNCTION service.create(request: EmbeddingRequest) -> Result<EmbeddingResponse, Error>
  span <- self.observability.tracer.start_span("xai_grok.embedding.create")
  span.set_attribute("model", request.model.model_id())

  TRY
    // Step 1: Build URL
    url <- format("{}/embeddings", self.base_url)

    // Step 2: Get auth header
    auth_header <- self.credentials.get_auth_header("xai").await?

    // Step 3: Build request body
    body <- json!({
      "model": request.model.model_id(),
      "input": match request.input {
        EmbeddingInput::Single(text) => json!(text),
        EmbeddingInput::Multiple(texts) => json!(texts)
      }
    })

    IF request.encoding_format IS Some THEN
      body["encoding_format"] <- request.encoding_format
    END IF

    IF request.dimensions IS Some THEN
      body["dimensions"] <- request.dimensions
    END IF

    // Step 4: Build and execute HTTP request
    http_request <- HttpRequest::post(url)
      .header(auth_header.0, auth_header.1)
      .header("Content-Type", "application/json")
      .json(&body)?

    http_response <- self.resilience.execute(
      operation_name: "create_embedding",
      classifier: GrokRetryClassifier,
      action: || async {
        self.transport.send(http_request.clone()).await
      }
    ).await?

    // Step 5: Parse response
    response <- parse_embedding_response(http_response).await?

    // Step 6: Record metrics
    self.observability.metrics.record_request(
      model: request.model.model_id(),
      operation: "create_embedding",
      status: "success",
      latency: span.elapsed()
    )
    self.observability.metrics.record_tokens(
      model: request.model.model_id(),
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: 0
    )

    span.set_status(SpanStatus::Ok)
    RETURN Ok(response)

  CATCH error AS e
    span.set_status(SpanStatus::Error)
    span.record_exception(&e)
    RETURN Error(e)

  FINALLY
    span.end()
  END TRY
END FUNCTION

ASYNC FUNCTION parse_embedding_response(http_response: HttpResponse) -> Result<EmbeddingResponse, Error>
  IF http_response.status != 200 THEN
    RETURN parse_error_response(http_response).await
  END IF

  body <- http_response.json::<EmbeddingApiResponse>().await?

  response <- EmbeddingResponse {
    object: body.object,
    data: body.data.iter().map(|d| EmbeddingData {
      object: d.object.clone(),
      index: d.index,
      embedding: d.embedding.clone()
    }).collect(),
    model: body.model,
    usage: EmbeddingUsage {
      prompt_tokens: body.usage.prompt_tokens,
      total_tokens: body.usage.total_tokens
    }
  }

  RETURN Ok(response)
END FUNCTION
```

---

## 9. Image Generation Service

### 9.1 Generate Image

```
STRUCT ImageServiceImpl {
  base_url: String,
  transport: Arc<HttpTransport>,
  credentials: Arc<dyn CredentialProvider>,
  resilience: Arc<ResilienceOrchestrator>,
  observability: ObservabilityContext
}

ASYNC FUNCTION service.generate(request: ImageGenerationRequest) -> Result<ImageGenerationResponse, Error>
  span <- self.observability.tracer.start_span("xai_grok.image.generate")
  span.set_attribute("model", "grok-2-image-1212")

  TRY
    // Step 1: Build URL
    url <- format("{}/images/generations", self.base_url)

    // Step 2: Get auth header
    auth_header <- self.credentials.get_auth_header("xai").await?

    // Step 3: Build request body
    body <- json!({
      "model": "grok-2-image-1212",
      "prompt": request.prompt
    })

    IF request.n IS Some THEN
      body["n"] <- request.n
    END IF
    IF request.size IS Some THEN
      body["size"] <- request.size
    END IF
    IF request.response_format IS Some THEN
      body["response_format"] <- request.response_format
    END IF

    // Step 4: Build and execute HTTP request
    http_request <- HttpRequest::post(url)
      .header(auth_header.0, auth_header.1)
      .header("Content-Type", "application/json")
      .json(&body)?

    http_response <- self.resilience.execute(
      operation_name: "generate_image",
      classifier: GrokRetryClassifier,
      action: || async {
        self.transport.send(http_request.clone()).await
      }
    ).await?

    // Step 5: Parse response
    response <- parse_image_response(http_response).await?

    // Step 6: Record metrics
    self.observability.metrics.record_request(
      model: "grok-2-image-1212",
      operation: "generate_image",
      status: "success",
      latency: span.elapsed()
    )

    span.set_status(SpanStatus::Ok)
    RETURN Ok(response)

  CATCH error AS e
    span.set_status(SpanStatus::Error)
    span.record_exception(&e)
    RETURN Error(e)

  FINALLY
    span.end()
  END TRY
END FUNCTION

ASYNC FUNCTION parse_image_response(http_response: HttpResponse) -> Result<ImageGenerationResponse, Error>
  IF http_response.status != 200 THEN
    RETURN parse_error_response(http_response).await
  END IF

  body <- http_response.json::<ImageApiResponse>().await?

  response <- ImageGenerationResponse {
    created: body.created,
    data: body.data.iter().map(|d| ImageData {
      url: d.url.clone(),
      b64_json: d.b64_json.clone(),
      revised_prompt: d.revised_prompt.clone()
    }).collect()
  }

  RETURN Ok(response)
END FUNCTION
```

---

## 10. Live Search Integration

### 10.1 Live Search Tool Definition

```
FUNCTION create_live_search_tool() -> Tool
  RETURN Tool {
    type_: "function",
    function: FunctionDefinition {
      name: "live_search",
      description: "Search X (Twitter) and the web for real-time information. Use this when you need current events, trending topics, or recent information that may not be in your training data.",
      parameters: json!({
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "The search query to look up"
          },
          "sources": {
            "type": "array",
            "items": { "type": "string", "enum": ["x", "web"] },
            "description": "Which sources to search (default: both)"
          },
          "limit": {
            "type": "integer",
            "description": "Maximum number of results to return",
            "default": 10
          }
        },
        "required": ["query"]
      })
    }
  }
END FUNCTION

FUNCTION has_live_search_tool(tools: &[Tool]) -> bool
  FOR EACH tool IN tools DO
    IF tool.function.name == "live_search" THEN
      RETURN true
    END IF
  END FOR
  RETURN false
END FUNCTION
```

### 10.2 Live Search Response Handler

```
STRUCT LiveSearchHandler {
  observability: ObservabilityContext
}

FUNCTION LiveSearchHandler::new(observability: ObservabilityContext) -> Self
  RETURN LiveSearchHandler { observability }
END FUNCTION

FUNCTION handler.extract_search_results(
  response: &GrokChatResponse
) -> Option<Vec<LiveSearchResult>>
  // Check if response contains tool calls with live_search
  IF response.choices.is_empty() THEN
    RETURN None
  END IF

  choice <- &response.choices[0]
  IF choice.message.tool_calls IS None THEN
    RETURN None
  END IF

  results <- []
  FOR EACH tool_call IN choice.message.tool_calls.as_ref().unwrap() DO
    IF tool_call.function.name == "live_search" THEN
      // Parse search results from function arguments
      args <- parse_json::<LiveSearchArgs>(&tool_call.function.arguments)
      IF args IS Ok THEN
        results.push(LiveSearchResult {
          query: args.query,
          sources: args.sources,
          // Results would be in subsequent messages
          tool_call_id: tool_call.id.clone()
        })
      END IF
    END IF
  END FOR

  IF results.is_empty() THEN
    RETURN None
  END IF

  RETURN Some(results)
END FUNCTION

FUNCTION handler.log_search_usage(results: &[LiveSearchResult])
  // Log for cost tracking ($25 per 1000 sources)
  total_sources <- results.iter().map(|r| r.sources.len()).sum()

  self.observability.logger.info("Live Search used", {
    queries: results.len(),
    total_sources: total_sources,
    estimated_cost_usd: (total_sources as f64 / 1000.0) * 25.0
  })

  self.observability.metrics.record_counter(
    name: "xai_grok_live_search_sources",
    value: total_sources,
    labels: {}
  )
END FUNCTION
```

---

## 11. Error Handling

### 11.1 Error Response Parsing

```
ASYNC FUNCTION parse_error_response(http_response: HttpResponse) -> Error
  status <- http_response.status
  body <- http_response.text().await.unwrap_or_default()

  // Try to parse as xAI error format (OpenAI-compatible)
  api_error <- parse_json::<ApiErrorResponse>(&body).ok()

  error_message <- api_error.as_ref()
    .and_then(|e| e.error.message.as_ref())
    .map(|m| m.as_str())
    .unwrap_or(&body)

  error_type <- api_error.as_ref()
    .and_then(|e| e.error.type_.as_ref())
    .map(|t| t.as_str())
    .unwrap_or("unknown")

  error_code <- api_error.as_ref()
    .and_then(|e| e.error.code.as_ref())
    .map(|c| c.as_str())

  MATCH status {
    400 => {
      MATCH error_type {
        "invalid_request_error" => {
          Error::InvalidRequest {
            message: error_message.to_string(),
            param: api_error.and_then(|e| e.error.param)
          }
        },
        "context_length_exceeded" => {
          Error::ContextLengthExceeded {
            message: error_message.to_string(),
            tokens: extract_token_count(error_message),
            max_tokens: extract_max_tokens(error_message)
          }
        },
        _ => {
          Error::ValidationError {
            type_: error_type.to_string(),
            message: error_message.to_string()
          }
        }
      }
    },
    401 => {
      Error::AuthenticationError {
        message: error_message.to_string()
      }
    },
    403 => {
      Error::PermissionDenied {
        message: error_message.to_string()
      }
    },
    404 => {
      Error::ModelNotFound {
        model_id: extract_model_from_error(error_message)
          .unwrap_or("unknown".to_string())
      }
    },
    429 => {
      // Extract Retry-After header
      retry_after <- http_response.headers
        .get("Retry-After")
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(60)

      Error::RateLimited {
        retry_after_ms: retry_after * 1000,
        message: error_message.to_string()
      }
    },
    498 => {
      Error::CapacityExceeded {
        message: error_message.to_string()
      }
    },
    500..=599 => {
      Error::ServiceError {
        status_code: status,
        message: error_message.to_string()
      }
    },
    _ => {
      Error::UnexpectedError {
        status_code: status,
        message: error_message.to_string()
      }
    }
  }
END FUNCTION
```

### 11.2 Retry Classifier

```
STRUCT GrokRetryClassifier

IMPL RetryClassifier FOR GrokRetryClassifier {
  FUNCTION classify(error: &Error) -> RetryDecision
    MATCH error {
      Error::RateLimited { retry_after_ms, .. } => {
        RetryDecision::RetryAfter(Duration::from_millis(*retry_after_ms))
      },
      Error::CapacityExceeded { .. } => {
        RetryDecision::RetryAfter(Duration::from_secs(60))
      },
      Error::ServiceError { status_code, .. } if *status_code >= 500 => {
        RetryDecision::RetryWithBackoff
      },
      Error::NetworkError(_) => {
        RetryDecision::RetryWithBackoff
      },
      Error::TimeoutError => {
        RetryDecision::RetryWithBackoff
      },
      // All other errors are not retryable
      _ => {
        RetryDecision::DoNotRetry
      }
    }
  END FUNCTION
}
```

### 11.3 Circuit Breaker Configuration

```
FUNCTION get_circuit_breaker_key(model: &str, operation: &str) -> String
  // Per-model circuit breakers
  RETURN format("xai_grok:{}:{}", model, operation)
END FUNCTION

CONST CIRCUIT_BREAKER_CONFIG <- CircuitBreakerConfig {
  failure_threshold: 5,      // Open after 5 failures
  success_threshold: 3,      // Close after 3 successes
  timeout: Duration::from_secs(30),  // Half-open after 30s
  sampling_window: Duration::from_secs(60)  // Count failures in 60s window
}
```

---

## 12. Platform Adapter

### 12.1 Model Adapter Implementation

```
STRUCT GrokAdapter {
  client: Arc<GrokClient>,
  model_registry: Arc<ModelRegistry>,
  reasoning_extractor: ReasoningExtractor
}

IMPL ModelAdapter FOR GrokAdapter {
  FUNCTION provider_id() -> &'static str
    RETURN "xai-grok"
  END FUNCTION

  FUNCTION supported_capabilities() -> Vec<ModelCapability>
    RETURN vec![
      ModelCapability::ChatCompletion,
      ModelCapability::Streaming,
      ModelCapability::Embeddings,
      ModelCapability::FunctionCalling,
      ModelCapability::Vision,
      ModelCapability::ImageGeneration
    ]
  END FUNCTION

  ASYNC FUNCTION invoke(request: UnifiedModelRequest) -> Result<UnifiedModelResponse, Error>
    // Step 1: Resolve model from hint
    model <- self.model_registry.resolve(&request.model_hint)?

    // Step 2: Validate capabilities
    caps <- self.model_registry.get_capabilities(&model)
    validate_request_capabilities(&request, &caps)?

    // Step 3: Convert and route based on request type
    MATCH request.request_type {
      RequestType::ChatCompletion => {
        grok_request <- convert_to_grok_chat_request(request, &model)
        grok_response <- self.client.chat().complete(grok_request).await?

        // Extract reasoning if present
        reasoning <- self.reasoning_extractor.extract(&grok_response, &model)

        RETURN convert_to_unified_response(grok_response, reasoning)
      },
      RequestType::Embedding => {
        grok_request <- convert_to_grok_embedding_request(request, &model)
        grok_response <- self.client.embeddings().create(grok_request).await?
        RETURN convert_to_unified_embedding_response(grok_response)
      },
      RequestType::ImageGeneration => {
        grok_request <- convert_to_grok_image_request(request)
        grok_response <- self.client.images().generate(grok_request).await?
        RETURN convert_to_unified_image_response(grok_response)
      },
      _ => {
        RETURN Error::UnsupportedRequestType(request.request_type)
      }
    }
  END FUNCTION

  ASYNC FUNCTION invoke_stream(request: UnifiedModelRequest) -> Result<UnifiedStream, Error>
    model <- self.model_registry.resolve(&request.model_hint)?
    grok_request <- convert_to_grok_chat_request(request, &model)
    grok_stream <- self.client.chat().stream(grok_request).await?

    // Wrap in unified stream adapter with reasoning support
    RETURN UnifiedStream::new(grok_stream.map(|chunk| {
      chunk.map(|c| convert_chunk_to_unified(c, &model))
    }))
  END FUNCTION
}
```

### 12.2 Request/Response Conversion

```
FUNCTION convert_to_grok_chat_request(
  request: UnifiedModelRequest,
  model: &GrokModel
) -> GrokChatRequest
  RETURN GrokChatRequest {
    model: model.clone(),
    messages: request.messages.iter().map(|m| ChatMessage {
      role: m.role.clone(),
      content: m.content.clone(),
      tool_calls: m.tool_calls.clone(),
      tool_call_id: m.tool_call_id.clone(),
      name: m.name.clone()
    }).collect(),
    temperature: request.temperature,
    top_p: request.top_p,
    max_tokens: request.max_tokens,
    stop: request.stop.clone(),
    frequency_penalty: request.frequency_penalty,
    presence_penalty: request.presence_penalty,
    tools: request.tools.clone(),
    tool_choice: request.tool_choice.clone(),
    response_format: request.response_format.clone(),
    seed: request.seed,
    user: request.user.clone(),
    stream: None  // Set by stream() method
  }
END FUNCTION

FUNCTION convert_to_unified_response(
  response: GrokChatResponse,
  reasoning: Option<ReasoningContent>
) -> UnifiedModelResponse
  RETURN UnifiedModelResponse {
    id: response.id,
    provider: "xai-grok",
    model: response.model,
    choices: response.choices.iter().map(|c| UnifiedChoice {
      index: c.index,
      message: UnifiedMessage {
        role: c.message.role.clone(),
        content: c.message.content.clone(),
        tool_calls: c.message.tool_calls.clone()
      },
      finish_reason: c.finish_reason.clone()
    }).collect(),
    usage: UnifiedUsage {
      prompt_tokens: response.usage.prompt_tokens,
      completion_tokens: response.usage.completion_tokens,
      total_tokens: response.usage.total_tokens
    },
    // Include provider-specific metadata
    metadata: UnifiedMetadata {
      provider_specific: json!({
        "system_fingerprint": response.system_fingerprint,
        "reasoning_content": reasoning.as_ref().map(|r| r.content.clone()),
        "reasoning_tokens": reasoning.as_ref().and_then(|r| r.tokens)
      })
    }
  }
END FUNCTION

FUNCTION convert_chunk_to_unified(
  chunk: ChatChunk,
  model: &GrokModel
) -> UnifiedChunk
  RETURN UnifiedChunk {
    id: chunk.id,
    object: chunk.object,
    created: chunk.created,
    model: chunk.model,
    choices: chunk.choices.iter().map(|c| UnifiedChunkChoice {
      index: c.index,
      delta: UnifiedDelta {
        role: c.delta.role.clone(),
        content: c.delta.content.clone(),
        tool_calls: c.delta.tool_calls.clone()
      },
      finish_reason: c.finish_reason.clone()
    }).collect(),
    usage: chunk.usage.map(|u| UnifiedUsage {
      prompt_tokens: u.prompt_tokens,
      completion_tokens: u.completion_tokens,
      total_tokens: u.total_tokens
    }),
    // Include reasoning in delta if present
    provider_specific: IF chunk.choices[0].reasoning_content IS Some THEN
      Some(json!({
        "reasoning_content_delta": chunk.choices[0].reasoning_content
      }))
    ELSE
      None
    END IF
  }
END FUNCTION
```

---

## 13. RuvVector Integration

### 13.1 Embedding Storage

```
STRUCT GrokEmbeddingStorage {
  client: Arc<GrokClient>,
  embedding_model: GrokModel,
  database: Arc<DatabaseConnection>
}

IMPL EmbeddingStorage FOR GrokEmbeddingStorage {
  ASYNC FUNCTION store_embedding(
    text: &str,
    metadata: EmbeddingMetadata
  ) -> Result<EmbeddingId, Error>
    // Step 1: Generate embedding via Grok API
    embedding_response <- self.client.embeddings().create(EmbeddingRequest {
      model: self.embedding_model.clone(),
      input: EmbeddingInput::Single(text.to_string()),
      dimensions: None,
      encoding_format: Some("float".to_string())
    }).await?

    embedding_vector <- embedding_response.data[0].embedding.clone()

    // Step 2: Store in RuvVector (PostgreSQL with pgvector)
    id <- self.database.execute(
      "INSERT INTO embeddings (vector, text, metadata, provider, created_at)
       VALUES ($1, $2, $3, 'xai-grok', NOW())
       RETURNING id",
      params![
        &embedding_vector as &[f32],
        text,
        &serde_json::to_value(&metadata)?
      ]
    ).await?.get::<Uuid>(0)

    RETURN Ok(EmbeddingId(id))
  END FUNCTION

  ASYNC FUNCTION search_similar(
    query: &str,
    limit: usize,
    filter: Option<MetadataFilter>
  ) -> Result<Vec<SimilarityResult>, Error>
    // Step 1: Generate query embedding
    query_embedding <- self.client.embeddings().create(EmbeddingRequest {
      model: self.embedding_model.clone(),
      input: EmbeddingInput::Single(query.to_string()),
      dimensions: None,
      encoding_format: Some("float".to_string())
    }).await?

    query_vector <- query_embedding.data[0].embedding.clone()

    // Step 2: Build similarity search query
    sql <- "
      SELECT id, text, metadata,
             1 - (vector <=> $1::vector) as similarity
      FROM embeddings
      WHERE provider = 'xai-grok'
    "

    // Add filter conditions if provided
    IF filter IS Some THEN
      sql <- sql + build_filter_clause(filter)
    END IF

    sql <- sql + " ORDER BY vector <=> $1::vector LIMIT $2"

    // Step 3: Execute query
    rows <- self.database.query(
      sql,
      params![&query_vector as &[f32], limit as i64]
    ).await?

    // Step 4: Map results
    results <- rows.iter().map(|row| SimilarityResult {
      id: EmbeddingId(row.get::<Uuid>("id")),
      text: row.get::<String>("text"),
      metadata: serde_json::from_value(row.get("metadata")).ok(),
      similarity: row.get::<f64>("similarity")
    }).collect()

    RETURN Ok(results)
  END FUNCTION

  ASYNC FUNCTION delete_embedding(id: EmbeddingId) -> Result<(), Error>
    self.database.execute(
      "DELETE FROM embeddings WHERE id = $1",
      params![id.0]
    ).await?

    RETURN Ok(())
  END FUNCTION
}
```

### 13.2 Batch Embedding Operations

```
ASYNC FUNCTION store_embeddings_batch(
  storage: &GrokEmbeddingStorage,
  items: Vec<(String, EmbeddingMetadata)>,
  batch_size: usize
) -> Result<Vec<EmbeddingId>, Error>
  ids <- []

  // Process in batches to avoid rate limits and memory issues
  FOR EACH batch IN items.chunks(batch_size) DO
    // Extract texts for batch embedding
    texts <- batch.iter().map(|(text, _)| text.clone()).collect::<Vec<_>>()

    // Generate embeddings for batch
    embedding_response <- storage.client.embeddings().create(EmbeddingRequest {
      model: storage.embedding_model.clone(),
      input: EmbeddingInput::Multiple(texts.clone()),
      dimensions: None,
      encoding_format: Some("float".to_string())
    }).await?

    // Store each embedding with its metadata
    FOR i IN 0..batch.len() DO
      (text, metadata) <- &batch[i]
      embedding_vector <- &embedding_response.data[i].embedding

      id <- storage.database.execute(
        "INSERT INTO embeddings (vector, text, metadata, provider, created_at)
         VALUES ($1, $2, $3, 'xai-grok', NOW())
         RETURNING id",
        params![
          embedding_vector as &[f32],
          text,
          &serde_json::to_value(metadata)?
        ]
      ).await?.get::<Uuid>(0)

      ids.push(EmbeddingId(id))
    END FOR
  END FOR

  RETURN Ok(ids)
END FUNCTION
```

---

## 14. Configuration Validation

### 14.1 Config Validation

```
FUNCTION validate_config(config: &GrokConfig) -> Result<(), ValidationError>
  errors <- []

  // Validate base URL
  IF config.base_url IS Some THEN
    base_url <- config.base_url.as_ref().unwrap()
    IF NOT base_url.starts_with("https://") THEN
      errors.push("Base URL must use HTTPS")
    END IF
  END IF

  // Validate timeout
  IF config.timeout < Duration::from_secs(1) THEN
    errors.push("Timeout must be at least 1 second")
  END IF
  IF config.timeout > Duration::from_secs(600) THEN
    errors.push("Timeout must not exceed 10 minutes")
  END IF

  // Validate default model if provided
  IF config.default_model IS Some THEN
    model_result <- ModelRegistry::new().resolve(config.default_model.as_ref().unwrap().model_id())
    IF model_result IS Error THEN
      errors.push(format("Invalid default model: {}", config.default_model.as_ref().unwrap().model_id()))
    END IF
  END IF

  // Return errors if any
  IF NOT errors.is_empty() THEN
    RETURN Error(ValidationError::InvalidConfig { errors })
  END IF

  RETURN Ok(())
END FUNCTION
```

### 14.2 Request Capability Validation

```
FUNCTION validate_request_capabilities(
  request: &UnifiedModelRequest,
  capabilities: &GrokCapabilities
) -> Result<(), ValidationError>
  // Check vision content
  IF has_vision_content(&request.messages) AND NOT capabilities.vision THEN
    RETURN Error(ValidationError::CapabilityNotSupported {
      capability: "vision",
      message: "Selected model does not support vision input"
    })
  END IF

  // Check function calling
  IF request.tools IS Some AND NOT capabilities.function_calling THEN
    RETURN Error(ValidationError::CapabilityNotSupported {
      capability: "function_calling",
      message: "Selected model does not support function calling"
    })
  END IF

  // Check streaming (for stream requests)
  IF request.stream == Some(true) AND NOT capabilities.streaming THEN
    RETURN Error(ValidationError::CapabilityNotSupported {
      capability: "streaming",
      message: "Selected model does not support streaming"
    })
  END IF

  RETURN Ok(())
END FUNCTION

FUNCTION has_vision_content(messages: &[UnifiedMessage]) -> bool
  FOR EACH message IN messages DO
    IF message.content IS MultiModalContent THEN
      FOR EACH part IN message.content.parts DO
        IF part IS ContentPart::Image OR part IS ContentPart::ImageBase64 THEN
          RETURN true
        END IF
      END FOR
    END IF
  END FOR
  RETURN false
END FUNCTION
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial pseudocode |

---

**End of Pseudocode Phase**

*Next Phase: Refinement — optimization, edge cases, and production hardening.*
