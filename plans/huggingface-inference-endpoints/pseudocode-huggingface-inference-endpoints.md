# SPARC Phase 2: Pseudocode — Hugging Face Inference Endpoints Integration

**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/huggingface/inference-endpoints`

---

## Table of Contents

1. [Overview](#1-overview)
2. [Client Initialization](#2-client-initialization)
3. [Provider Resolution](#3-provider-resolution)
4. [Authentication](#4-authentication)
5. [Chat Completion Service](#5-chat-completion-service)
6. [Text Generation Service](#6-text-generation-service)
7. [Streaming Pipeline](#7-streaming-pipeline)
8. [Embedding Service](#8-embedding-service)
9. [Image Service](#9-image-service)
10. [Audio Service](#10-audio-service)
11. [Endpoint Management Service](#11-endpoint-management-service)
12. [Cold Start Handling](#12-cold-start-handling)
13. [Error Handling](#13-error-handling)
14. [Platform Adapter](#14-platform-adapter)
15. [RuvVector Integration](#15-ruvvector-integration)

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
| Multi-Provider | Support HF serverless, dedicated endpoints, third-party |
| Task Flexibility | 30+ task types via unified interface |
| Cold Start Aware | Handle scale-to-zero gracefully |

### 1.3 Constants

```
CONST HF_MANAGEMENT_API <- "https://api.endpoints.huggingface.cloud"
CONST HF_SERVERLESS_API <- "https://api-inference.huggingface.co"
CONST HF_ROUTER_API <- "https://router.huggingface.co"

CONST DEFAULT_TIMEOUT <- 120s
CONST DEFAULT_COLD_START_TIMEOUT <- 300s  // 5 minutes for large models
CONST DEFAULT_MAX_RETRIES <- 3
CONST STREAMING_CHANNEL_CAPACITY <- 100

CONST ENDPOINT_POLL_INTERVAL <- 5s
```

---

## 2. Client Initialization

### 2.1 Client Factory

```
FUNCTION create_hf_client(config: HfInferenceConfig) -> Result<HfInferenceClient, Error>
  // Step 1: Validate configuration
  validation_result <- validate_config(config)
  IF validation_result IS Error THEN
    RETURN Error(ConfigurationError::Invalid(validation_result.message))
  END IF

  // Step 2: Initialize credential provider (from shared/credentials)
  credentials <- HfTokenProvider::new(config.token)

  // Step 3: Initialize provider resolver
  provider_resolver <- ProviderResolver::new(config.default_provider)

  // Step 4: Initialize shared resilience (from shared/resilience)
  resilience <- create_resilience_orchestrator(
    retry_config: config.resilience.retry OR DEFAULT_RETRY_CONFIG,
    circuit_breaker_config: config.resilience.circuit_breaker OR DEFAULT_CB_CONFIG,
    rate_limiter_config: config.resilience.rate_limiter
  )

  // Step 5: Initialize shared observability (from shared/observability)
  observability <- create_observability_context(
    service_name: "hf-inference-endpoints",
    logger: get_logger("hf-inference"),
    tracer: get_tracer("hf-inference"),
    metrics: get_metrics_collector("hf-inference")
  )

  // Step 6: Initialize HTTP transport (from shared/http)
  transport <- create_http_transport(HttpTransportConfig {
    timeout: config.timeout OR DEFAULT_TIMEOUT,
    tls_config: TlsConfig { min_version: TLS_1_2 },
    connection_pool_size: 20  // Multiple endpoints
  })

  // Step 7: Assemble client
  client <- HfInferenceClientImpl {
    config: config,
    transport: Arc::new(transport),
    credentials: Arc::new(credentials),
    provider_resolver: Arc::new(provider_resolver),
    resilience: Arc::new(resilience),
    observability: observability,

    // Lazy-initialized services
    chat_service: OnceCell::new(),
    text_generation_service: OnceCell::new(),
    embedding_service: OnceCell::new(),
    image_service: OnceCell::new(),
    audio_service: OnceCell::new(),
    endpoint_service: OnceCell::new(),

    // Endpoint cache for dedicated endpoints
    endpoint_cache: DashMap::new(),

    // Optional RuvVector (from shared/database)
    ruvvector: config.ruvvector
  }

  observability.logger.info("HF Inference client initialized", {
    default_provider: format!("{:?}", config.default_provider)
  })

  RETURN Ok(client)
END FUNCTION
```

### 2.2 Client from Environment

```
FUNCTION create_hf_client_from_env() -> Result<HfInferenceClient, Error>
  // Step 1: Load token
  token <- read_env("HF_TOKEN") OR read_env("HUGGING_FACE_HUB_TOKEN")
  IF token IS None THEN
    RETURN Error(ConfigurationError::MissingToken("HF_TOKEN not set"))
  END IF

  // Step 2: Build config from environment
  config <- HfInferenceConfig {
    token: SecretString::new(token.unwrap()),
    base_url: read_env("HF_INFERENCE_BASE_URL"),
    timeout: parse_duration(read_env("HF_REQUEST_TIMEOUT_MS")) OR DEFAULT_TIMEOUT,
    default_provider: parse_provider(read_env("HF_DEFAULT_PROVIDER")),
    default_namespace: read_env("HF_NAMESPACE"),
    cold_start_timeout: parse_duration(read_env("HF_COLD_START_TIMEOUT_MS"))
                        OR DEFAULT_COLD_START_TIMEOUT,
    auto_wait_for_model: read_env("HF_AUTO_WAIT_FOR_MODEL") != "false",
    resilience: ResilienceConfig::default(),
    ruvvector: IF read_env("RUVVECTOR_ENABLED") == "true" THEN
      Some(DatabaseConfig::from_env())
    ELSE
      None
    END IF
  }

  RETURN create_hf_client(config)
END FUNCTION
```

### 2.3 Service Accessor Pattern

```
FUNCTION client.chat() -> &ChatService
  RETURN self.chat_service.get_or_init(|| {
    ChatServiceImpl::new(
      transport: self.transport.clone(),
      credentials: self.credentials.clone(),
      provider_resolver: self.provider_resolver.clone(),
      resilience: self.resilience.clone(),
      observability: self.observability.clone(),
      config: self.config.clone()
    )
  })
END FUNCTION

FUNCTION client.text_generation() -> &TextGenerationService
  RETURN self.text_generation_service.get_or_init(|| {
    TextGenerationServiceImpl::new(
      transport: self.transport.clone(),
      credentials: self.credentials.clone(),
      provider_resolver: self.provider_resolver.clone(),
      resilience: self.resilience.clone(),
      observability: self.observability.clone(),
      config: self.config.clone()
    )
  })
END FUNCTION

FUNCTION client.embeddings() -> &EmbeddingService
  RETURN self.embedding_service.get_or_init(|| {
    EmbeddingServiceImpl::new(/* similar params */)
  })
END FUNCTION

FUNCTION client.image() -> &ImageService
  RETURN self.image_service.get_or_init(|| {
    ImageServiceImpl::new(/* similar params */)
  })
END FUNCTION

FUNCTION client.audio() -> &AudioService
  RETURN self.audio_service.get_or_init(|| {
    AudioServiceImpl::new(/* similar params */)
  })
END FUNCTION

FUNCTION client.endpoints() -> &EndpointManagementService
  RETURN self.endpoint_service.get_or_init(|| {
    EndpointManagementServiceImpl::new(
      transport: self.transport.clone(),
      credentials: self.credentials.clone(),
      resilience: self.resilience.clone(),
      observability: self.observability.clone(),
      management_api_url: HF_MANAGEMENT_API
    )
  })
END FUNCTION
```

---

## 3. Provider Resolution

### 3.1 Provider Resolver

```
STRUCT ProviderResolver {
  default_provider: Option<InferenceProvider>,
  endpoint_cache: DashMap<String, EndpointInfo>  // name -> info with URL
}

FUNCTION ProviderResolver::new(default_provider: Option<InferenceProvider>) -> Self
  RETURN ProviderResolver {
    default_provider: default_provider,
    endpoint_cache: DashMap::new()
  }
END FUNCTION

FUNCTION resolver.resolve_inference_url(
  model_or_endpoint: &str,
  task: &InferenceTask,
  provider: Option<&InferenceProvider>
) -> Result<InferenceTarget, Error>
  // Step 1: Check if explicit provider specified
  effective_provider <- provider OR self.default_provider.as_ref()

  // Step 2: Resolve based on provider type
  MATCH effective_provider {
    Some(InferenceProvider::Dedicated(endpoint_url)) => {
      // Direct endpoint URL
      RETURN Ok(InferenceTarget {
        url: endpoint_url.clone(),
        provider_type: ProviderType::DedicatedEndpoint,
        model: model_or_endpoint.to_string()
      })
    },
    Some(InferenceProvider::HfInference) | None => {
      // Serverless API - route by model ID
      url <- build_serverless_url(model_or_endpoint, task)
      RETURN Ok(InferenceTarget {
        url: url,
        provider_type: ProviderType::Serverless,
        model: model_or_endpoint.to_string()
      })
    },
    Some(third_party) => {
      // Third-party provider (Together, Groq, etc.)
      url <- build_third_party_url(third_party, model_or_endpoint)
      RETURN Ok(InferenceTarget {
        url: url,
        provider_type: ProviderType::ThirdParty(third_party.clone()),
        model: model_or_endpoint.to_string()
      })
    }
  }
END FUNCTION

FUNCTION build_serverless_url(model: &str, task: &InferenceTask) -> String
  // Serverless API uses model ID in path
  base <- HF_SERVERLESS_API
  RETURN format("{}/models/{}", base, model)
END FUNCTION

FUNCTION build_third_party_url(provider: &InferenceProvider, model: &str) -> String
  // Route through HF router for third-party providers
  MATCH provider {
    InferenceProvider::Together => {
      RETURN format("{}/v1/chat/completions", "https://api.together.xyz")
    },
    InferenceProvider::Groq => {
      RETURN format("{}/openai/v1/chat/completions", "https://api.groq.com")
    },
    InferenceProvider::FireworksAi => {
      RETURN format("{}/inference/v1/chat/completions", "https://api.fireworks.ai")
    },
    // ... other providers
    _ => {
      // Use HF router for unified access
      RETURN format("{}/v1/chat/completions", HF_ROUTER_API)
    }
  }
END FUNCTION
```

### 3.2 Endpoint URL Resolution for Dedicated Endpoints

```
FUNCTION resolver.resolve_dedicated_endpoint(
  namespace: &str,
  endpoint_name: &str,
  endpoint_service: &EndpointManagementService
) -> Result<InferenceTarget, Error>
  cache_key <- format("{}:{}", namespace, endpoint_name)

  // Check cache first
  IF self.endpoint_cache.contains_key(&cache_key) THEN
    cached <- self.endpoint_cache.get(&cache_key).unwrap()
    IF cached.status == EndpointStatus::Running THEN
      RETURN Ok(InferenceTarget {
        url: cached.url.clone().unwrap(),
        provider_type: ProviderType::DedicatedEndpoint,
        model: cached.model.repository.clone()
      })
    END IF
  END IF

  // Fetch fresh endpoint info
  endpoint_info <- endpoint_service.get(namespace, endpoint_name).await?

  // Check status
  MATCH endpoint_info.status {
    EndpointStatus::Running => {
      // Cache and return
      self.endpoint_cache.insert(cache_key, endpoint_info.clone())
      RETURN Ok(InferenceTarget {
        url: endpoint_info.url.unwrap(),
        provider_type: ProviderType::DedicatedEndpoint,
        model: endpoint_info.model.repository
      })
    },
    EndpointStatus::ScaledToZero => {
      RETURN Error(EndpointScaledToZeroError {
        endpoint: endpoint_name.to_string(),
        message: "Endpoint is scaled to zero, will cold start on request"
      })
    },
    EndpointStatus::Paused => {
      RETURN Error(EndpointPausedError {
        endpoint: endpoint_name.to_string()
      })
    },
    EndpointStatus::Failed(msg) => {
      RETURN Error(EndpointFailedError {
        endpoint: endpoint_name.to_string(),
        message: msg
      })
    },
    _ => {
      RETURN Error(EndpointNotReadyError {
        endpoint: endpoint_name.to_string(),
        status: endpoint_info.status
      })
    }
  }
END FUNCTION
```

---

## 4. Authentication

### 4.1 Token Provider

```
STRUCT HfTokenProvider {
  token: SecretString
}

IMPL CredentialProvider FOR HfTokenProvider {
  ASYNC FUNCTION get_auth_header(provider_name: &str) -> Result<(String, String), Error>
    // HF uses Bearer token authentication
    RETURN Ok(("Authorization", format("Bearer {}", self.token.expose())))
  END FUNCTION

  ASYNC FUNCTION refresh() -> Result<(), Error>
    // HF tokens don't expire (unless revoked)
    RETURN Ok(())
  END FUNCTION
}

FUNCTION HfTokenProvider::new(token: SecretString) -> Self
  RETURN HfTokenProvider { token }
END FUNCTION

FUNCTION HfTokenProvider::from_env() -> Result<Self, Error>
  token <- read_env("HF_TOKEN") OR read_env("HUGGING_FACE_HUB_TOKEN")
  IF token IS None THEN
    RETURN Error(AuthenticationError::MissingToken)
  END IF
  RETURN Ok(HfTokenProvider { token: SecretString::new(token.unwrap()) })
END FUNCTION
```

---

## 5. Chat Completion Service

### 5.1 Chat Completion (OpenAI-Compatible)

```
STRUCT ChatServiceImpl {
  transport: Arc<HttpTransport>,
  credentials: Arc<dyn CredentialProvider>,
  provider_resolver: Arc<ProviderResolver>,
  resilience: Arc<ResilienceOrchestrator>,
  observability: ObservabilityContext,
  config: HfInferenceConfig
}

ASYNC FUNCTION service.complete(request: ChatRequest) -> Result<ChatResponse, Error>
  span <- self.observability.tracer.start_span("hf_inference.chat.complete")
  span.set_attribute("model", &request.model)

  TRY
    // Step 1: Resolve target URL
    target <- self.provider_resolver.resolve_inference_url(
      &request.model,
      &InferenceTask::ChatCompletion,
      request.provider.as_ref()
    )?

    span.set_attribute("provider_type", format!("{:?}", target.provider_type))

    // Step 2: Build URL based on provider type
    url <- MATCH target.provider_type {
      ProviderType::DedicatedEndpoint => format("{}/v1/chat/completions", target.url),
      ProviderType::Serverless => format("{}/v1/chat/completions", target.url),
      ProviderType::ThirdParty(_) => target.url
    }

    // Step 3: Get auth header
    auth_header <- self.credentials.get_auth_header("hf").await?

    // Step 4: Build request body (OpenAI-compatible)
    body <- build_chat_request_body(&request)

    // Step 5: Build HTTP request
    http_request <- HttpRequest::post(url)
      .header(auth_header.0, auth_header.1)
      .header("Content-Type", "application/json")
      .json(&body)?

    // Step 6: Execute with resilience and cold-start handling
    http_response <- self.execute_with_cold_start_handling(
      http_request,
      &target,
      "chat_completion"
    ).await?

    // Step 7: Parse response
    response <- parse_chat_response(http_response).await?

    // Step 8: Record metrics
    self.observability.metrics.record_request(
      model: &request.model,
      operation: "chat_completion",
      status: "success",
      latency: span.elapsed()
    )
    IF response.usage IS Some THEN
      self.observability.metrics.record_tokens(
        model: &request.model,
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens
      )
    END IF

    span.set_status(SpanStatus::Ok)
    RETURN Ok(response)

  CATCH error AS e
    span.set_status(SpanStatus::Error)
    span.record_exception(&e)
    self.observability.metrics.record_request(
      model: &request.model,
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
FUNCTION build_chat_request_body(request: &ChatRequest) -> serde_json::Value
  body <- json!({
    "model": request.model,
    "messages": serialize_messages(&request.messages)
  })

  // Optional parameters
  IF request.max_tokens IS Some THEN
    body["max_tokens"] <- request.max_tokens
  END IF
  IF request.temperature IS Some THEN
    body["temperature"] <- request.temperature
  END IF
  IF request.top_p IS Some THEN
    body["top_p"] <- request.top_p
  END IF
  IF request.frequency_penalty IS Some THEN
    body["frequency_penalty"] <- request.frequency_penalty
  END IF
  IF request.presence_penalty IS Some THEN
    body["presence_penalty"] <- request.presence_penalty
  END IF
  IF request.stop IS Some THEN
    body["stop"] <- request.stop
  END IF

  // Tools / Function calling
  IF request.tools IS Some AND NOT request.tools.is_empty() THEN
    body["tools"] <- serialize_tools(&request.tools.unwrap())
    IF request.tool_choice IS Some THEN
      body["tool_choice"] <- serialize_tool_choice(&request.tool_choice.unwrap())
    END IF
  END IF

  // Response format
  IF request.response_format IS Some THEN
    body["response_format"] <- serialize_response_format(&request.response_format.unwrap())
  END IF

  // Streaming flag
  IF request.stream == Some(true) THEN
    body["stream"] <- true
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
      // Vision content format
      content_parts <- []
      FOR EACH part IN msg.content.parts DO
        MATCH part {
          ContentPart::Text { text } => {
            content_parts.push(json!({ "type": "text", "text": text }))
          },
          ContentPart::ImageUrl { url } => {
            content_parts.push(json!({
              "type": "image_url",
              "image_url": { "url": url }
            }))
          },
          ContentPart::ImageBase64 { base64, media_type } => {
            content_parts.push(json!({
              "type": "image_url",
              "image_url": {
                "url": format("data:{};base64,{}", media_type, base64)
              }
            }))
          }
        }
      END FOR
      message_obj["content"] <- content_parts
    END IF

    // Tool calls
    IF msg.tool_calls IS Some THEN
      message_obj["tool_calls"] <- msg.tool_calls
    END IF

    // Tool call ID
    IF msg.tool_call_id IS Some THEN
      message_obj["tool_call_id"] <- msg.tool_call_id
    END IF

    result.push(message_obj)
  END FOR

  RETURN json!(result)
END FUNCTION
```

---

## 6. Text Generation Service

### 6.1 Text Generation (HF Native Format)

```
STRUCT TextGenerationServiceImpl {
  transport: Arc<HttpTransport>,
  credentials: Arc<dyn CredentialProvider>,
  provider_resolver: Arc<ProviderResolver>,
  resilience: Arc<ResilienceOrchestrator>,
  observability: ObservabilityContext,
  config: HfInferenceConfig
}

ASYNC FUNCTION service.generate(request: TextGenerationRequest) -> Result<TextGenerationResponse, Error>
  span <- self.observability.tracer.start_span("hf_inference.text_generation.generate")
  span.set_attribute("model", request.model.as_ref().unwrap_or(&"default".to_string()))

  TRY
    // Step 1: Resolve target
    model <- request.model.as_ref().unwrap_or(&self.config.default_model)
    target <- self.provider_resolver.resolve_inference_url(
      model,
      &InferenceTask::TextGeneration,
      None
    )?

    // Step 2: Build URL
    url <- MATCH target.provider_type {
      ProviderType::DedicatedEndpoint => format("{}/generate", target.url),
      ProviderType::Serverless => target.url,
      _ => target.url
    }

    // Step 3: Get auth header
    auth_header <- self.credentials.get_auth_header("hf").await?

    // Step 4: Build request body (HF native format)
    body <- build_text_generation_body(&request)

    // Step 5: Build HTTP request
    http_request <- HttpRequest::post(url)
      .header(auth_header.0, auth_header.1)
      .header("Content-Type", "application/json")
      .json(&body)?

    // Step 6: Execute with cold-start handling
    http_response <- self.execute_with_cold_start_handling(
      http_request,
      &target,
      "text_generation"
    ).await?

    // Step 7: Parse response
    response <- parse_text_generation_response(http_response).await?

    // Step 8: Record metrics
    self.observability.metrics.record_request(
      model: model,
      operation: "text_generation",
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

FUNCTION build_text_generation_body(request: &TextGenerationRequest) -> serde_json::Value
  body <- json!({
    "inputs": request.inputs
  })

  // Parameters
  params <- json!({})
  IF request.parameters.max_new_tokens IS Some THEN
    params["max_new_tokens"] <- request.parameters.max_new_tokens
  END IF
  IF request.parameters.temperature IS Some THEN
    params["temperature"] <- request.parameters.temperature
  END IF
  IF request.parameters.top_p IS Some THEN
    params["top_p"] <- request.parameters.top_p
  END IF
  IF request.parameters.top_k IS Some THEN
    params["top_k"] <- request.parameters.top_k
  END IF
  IF request.parameters.repetition_penalty IS Some THEN
    params["repetition_penalty"] <- request.parameters.repetition_penalty
  END IF
  IF request.parameters.do_sample IS Some THEN
    params["do_sample"] <- request.parameters.do_sample
  END IF
  IF request.parameters.return_full_text IS Some THEN
    params["return_full_text"] <- request.parameters.return_full_text
  END IF
  IF request.parameters.stop IS Some THEN
    params["stop"] <- request.parameters.stop
  END IF
  IF request.parameters.seed IS Some THEN
    params["seed"] <- request.parameters.seed
  END IF

  IF NOT params.is_empty() THEN
    body["parameters"] <- params
  END IF

  // Options
  IF request.options IS Some THEN
    options <- json!({})
    IF request.options.use_cache IS Some THEN
      options["use_cache"] <- request.options.use_cache
    END IF
    IF request.options.wait_for_model IS Some THEN
      options["wait_for_model"] <- request.options.wait_for_model
    END IF
    body["options"] <- options
  END IF

  RETURN body
END FUNCTION
```

---

## 7. Streaming Pipeline

### 7.1 Chat Streaming

```
ASYNC FUNCTION service.stream(request: ChatRequest) -> Result<ChatStream, Error>
  span <- self.observability.tracer.start_span("hf_inference.chat.stream")
  span.set_attribute("model", &request.model)

  // Step 1: Resolve target
  target <- self.provider_resolver.resolve_inference_url(
    &request.model,
    &InferenceTask::ChatCompletion,
    request.provider.as_ref()
  )?

  // Step 2: Build URL
  url <- format("{}/v1/chat/completions", target.url)

  // Step 3: Get auth header
  auth_header <- self.credentials.get_auth_header("hf").await?

  // Step 4: Build request body with stream: true
  mut_request <- request.clone()
  mut_request.stream <- Some(true)
  body <- build_chat_request_body(&mut_request)

  // Step 5: Build HTTP request
  http_request <- HttpRequest::post(url)
    .header(auth_header.0, auth_header.1)
    .header("Content-Type", "application/json")
    .header("Accept", "text/event-stream")
    .json(&body)?

  // Step 6: Execute and get streaming response
  http_response <- self.transport.send_streaming(http_request).await?

  IF http_response.status != 200 THEN
    body <- http_response.text().await?
    RETURN parse_error_response_body(http_response.status, body)
  END IF

  // Step 7: Create SSE parser
  sse_stream <- SseParser::new(http_response.body_stream)

  // Step 8: Create bounded channel for backpressure
  (sender, receiver) <- channel::<ChatChunk>(STREAMING_CHANNEL_CAPACITY)

  // Step 9: Return ChatStream wrapper
  chat_stream <- ChatStream::new(
    sse_stream: sse_stream,
    observability: self.observability.clone(),
    model: request.model.clone(),
    span: span
  )

  RETURN Ok(chat_stream)
END FUNCTION
```

### 7.2 SSE Parser (HF Format)

```
STRUCT SseParser {
  body_stream: ByteStream,
  buffer: String,
  state: ParserState
}

IMPL Stream FOR SseParser {
  TYPE Item = Result<SseEvent, Error>

  ASYNC FUNCTION poll_next(cx: &mut Context) -> Poll<Option<Self::Item>>
    IF self.state == Done THEN
      RETURN Poll::Ready(None)
    END IF

    LOOP
      // Try to parse a complete event from buffer
      event <- try_parse_hf_event(&mut self.buffer)
      IF event IS Some THEN
        // Check for [DONE] sentinel or empty data
        IF event.data == "[DONE]" OR event.data.is_empty() THEN
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

FUNCTION try_parse_hf_event(buffer: &mut String) -> Option<SseEvent>
  // HF SSE format: data: {...}\n\n
  IF NOT buffer.contains("\n\n") AND NOT buffer.contains("\r\n\r\n") THEN
    RETURN None
  END IF

  // Find end of event
  split_pos <- buffer.find("\n\n")
    .or_else(|| buffer.find("\r\n\r\n"))
    .unwrap()

  delimiter_len <- IF buffer[split_pos..].starts_with("\r\n\r\n") THEN 4 ELSE 2

  // Extract event
  event_str <- buffer[..split_pos].to_string()
  *buffer <- buffer[split_pos + delimiter_len..].to_string()

  // Parse data line
  FOR EACH line IN event_str.lines() DO
    IF line.starts_with("data:") THEN
      data <- line[5..].trim().to_string()
      RETURN Some(SseEvent { data })
    END IF
  END FOR

  RETURN None
END FUNCTION
```

### 7.3 Text Generation Streaming

```
ASYNC FUNCTION service.stream(request: TextGenerationRequest) -> Result<TextGenerationStream, Error>
  span <- self.observability.tracer.start_span("hf_inference.text_generation.stream")

  // Step 1: Resolve target
  model <- request.model.as_ref().unwrap_or(&self.config.default_model)
  target <- self.provider_resolver.resolve_inference_url(
    model,
    &InferenceTask::TextGeneration,
    None
  )?

  // Step 2: Build URL for streaming
  url <- format("{}/generate_stream", target.url)

  // Step 3: Build request body
  body <- build_text_generation_body(&request)

  // Step 4: Execute streaming request
  http_request <- HttpRequest::post(url)
    .header("Authorization", format("Bearer {}", self.credentials.get_token()))
    .header("Content-Type", "application/json")
    .header("Accept", "text/event-stream")
    .json(&body)?

  http_response <- self.transport.send_streaming(http_request).await?

  // Step 5: Create stream wrapper
  sse_stream <- SseParser::new(http_response.body_stream)

  text_gen_stream <- TextGenerationStream::new(
    sse_stream: sse_stream,
    observability: self.observability.clone(),
    model: model.clone(),
    span: span
  )

  RETURN Ok(text_gen_stream)
END FUNCTION
```

---

## 8. Embedding Service

### 8.1 Create Embeddings

```
STRUCT EmbeddingServiceImpl {
  transport: Arc<HttpTransport>,
  credentials: Arc<dyn CredentialProvider>,
  provider_resolver: Arc<ProviderResolver>,
  resilience: Arc<ResilienceOrchestrator>,
  observability: ObservabilityContext,
  config: HfInferenceConfig
}

ASYNC FUNCTION service.create(request: EmbeddingRequest) -> Result<EmbeddingResponse, Error>
  span <- self.observability.tracer.start_span("hf_inference.embedding.create")
  span.set_attribute("model", request.model.as_ref().unwrap_or(&"default".to_string()))

  TRY
    // Step 1: Resolve target
    model <- request.model.as_ref().unwrap_or(&self.config.default_embedding_model)
    target <- self.provider_resolver.resolve_inference_url(
      model,
      &InferenceTask::FeatureExtraction,
      None
    )?

    // Step 2: Build URL
    url <- target.url

    // Step 3: Get auth header
    auth_header <- self.credentials.get_auth_header("hf").await?

    // Step 4: Build request body
    body <- build_embedding_body(&request)

    // Step 5: Build HTTP request
    http_request <- HttpRequest::post(url)
      .header(auth_header.0, auth_header.1)
      .header("Content-Type", "application/json")
      .json(&body)?

    // Step 6: Execute
    http_response <- self.resilience.execute(
      operation_name: "create_embedding",
      classifier: HfRetryClassifier,
      action: || async {
        self.transport.send(http_request.clone()).await
      }
    ).await?

    // Step 7: Parse response
    response <- parse_embedding_response(http_response, model).await?

    // Step 8: Record metrics
    self.observability.metrics.record_request(
      model: model,
      operation: "create_embedding",
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

FUNCTION build_embedding_body(request: &EmbeddingRequest) -> serde_json::Value
  body <- json!({})

  // Handle single or batch input
  MATCH &request.inputs {
    EmbeddingInput::Single(text) => {
      body["inputs"] <- text
    },
    EmbeddingInput::Multiple(texts) => {
      body["inputs"] <- texts
    }
  }

  // Parameters
  IF request.normalize IS Some THEN
    body["parameters"] <- json!({ "normalize": request.normalize })
  END IF
  IF request.truncate IS Some THEN
    IF body["parameters"] IS None THEN
      body["parameters"] <- json!({})
    END IF
    body["parameters"]["truncate"] <- request.truncate
  END IF

  RETURN body
END FUNCTION

ASYNC FUNCTION parse_embedding_response(
  http_response: HttpResponse,
  model: &str
) -> Result<EmbeddingResponse, Error>
  IF http_response.status != 200 THEN
    RETURN parse_error_response(http_response).await
  END IF

  // HF returns embeddings directly as array of arrays
  embeddings <- http_response.json::<Vec<Vec<f32>>>().await?

  RETURN Ok(EmbeddingResponse {
    embeddings: embeddings,
    model: model.to_string(),
    usage: None  // HF doesn't return usage for embeddings
  })
END FUNCTION
```

### 8.2 Batch Embeddings

```
ASYNC FUNCTION service.create_batch(request: BatchEmbeddingRequest) -> Result<BatchEmbeddingResponse, Error>
  span <- self.observability.tracer.start_span("hf_inference.embedding.create_batch")

  // Convert to standard embedding request with multiple inputs
  embedding_request <- EmbeddingRequest {
    inputs: EmbeddingInput::Multiple(request.inputs.clone()),
    model: request.model.clone(),
    normalize: request.normalize,
    truncate: request.truncate,
    prompt_name: None
  }

  response <- self.create(embedding_request).await?

  RETURN Ok(BatchEmbeddingResponse {
    embeddings: response.embeddings,
    model: response.model
  })
END FUNCTION
```

---

## 9. Image Service

### 9.1 Text-to-Image Generation

```
STRUCT ImageServiceImpl {
  transport: Arc<HttpTransport>,
  credentials: Arc<dyn CredentialProvider>,
  provider_resolver: Arc<ProviderResolver>,
  resilience: Arc<ResilienceOrchestrator>,
  observability: ObservabilityContext,
  config: HfInferenceConfig
}

ASYNC FUNCTION service.generate(request: TextToImageRequest) -> Result<ImageResponse, Error>
  span <- self.observability.tracer.start_span("hf_inference.image.generate")
  span.set_attribute("model", request.model.as_ref().unwrap_or(&"default".to_string()))

  TRY
    // Step 1: Resolve target
    model <- request.model.as_ref().unwrap_or(&self.config.default_image_model)
    target <- self.provider_resolver.resolve_inference_url(
      model,
      &InferenceTask::TextToImage,
      None
    )?

    // Step 2: Build URL
    url <- target.url

    // Step 3: Get auth header
    auth_header <- self.credentials.get_auth_header("hf").await?

    // Step 4: Build request body
    body <- json!({
      "inputs": request.prompt
    })

    IF request.negative_prompt IS Some THEN
      body["negative_prompt"] <- request.negative_prompt
    END IF
    IF request.height IS Some THEN
      body["height"] <- request.height
    END IF
    IF request.width IS Some THEN
      body["width"] <- request.width
    END IF
    IF request.num_inference_steps IS Some THEN
      body["num_inference_steps"] <- request.num_inference_steps
    END IF
    IF request.guidance_scale IS Some THEN
      body["guidance_scale"] <- request.guidance_scale
    END IF
    IF request.seed IS Some THEN
      body["seed"] <- request.seed
    END IF

    // Step 5: Build HTTP request
    http_request <- HttpRequest::post(url)
      .header(auth_header.0, auth_header.1)
      .header("Content-Type", "application/json")
      .json(&body)?

    // Step 6: Execute (image generation can be slow)
    http_response <- self.resilience.execute(
      operation_name: "generate_image",
      classifier: HfRetryClassifier,
      action: || async {
        self.transport.send_with_timeout(
          http_request.clone(),
          Duration::from_secs(300)  // 5 minute timeout
        ).await
      }
    ).await?

    // Step 7: Parse response (binary image data)
    IF http_response.status != 200 THEN
      RETURN parse_error_response(http_response).await
    END IF

    // Response is raw image bytes
    image_bytes <- http_response.bytes().await?

    // Determine format from content-type
    content_type <- http_response.headers.get("content-type")
      .map(|v| v.to_string())
      .unwrap_or("image/png".to_string())

    span.set_status(SpanStatus::Ok)
    RETURN Ok(ImageResponse {
      image: ImageData::Bytes(image_bytes),
      format: parse_image_format(&content_type),
      model: model.to_string()
    })

  CATCH error AS e
    span.set_status(SpanStatus::Error)
    span.record_exception(&e)
    RETURN Error(e)

  FINALLY
    span.end()
  END TRY
END FUNCTION
```

### 9.2 Image Classification

```
ASYNC FUNCTION service.classify(request: ImageClassificationRequest) -> Result<ClassificationResponse, Error>
  span <- self.observability.tracer.start_span("hf_inference.image.classify")

  TRY
    // Step 1: Resolve target
    model <- request.model.as_ref().unwrap_or(&self.config.default_image_classifier)
    target <- self.provider_resolver.resolve_inference_url(
      model,
      &InferenceTask::ImageClassification,
      None
    )?

    // Step 2: Prepare image data
    image_data <- prepare_image_data(&request.image).await?

    // Step 3: Build request
    auth_header <- self.credentials.get_auth_header("hf").await?

    http_request <- HttpRequest::post(target.url)
      .header(auth_header.0, auth_header.1)
      .header("Content-Type", image_data.content_type)
      .body(image_data.bytes)?

    // Step 4: Execute
    http_response <- self.resilience.execute(
      operation_name: "classify_image",
      classifier: HfRetryClassifier,
      action: || async {
        self.transport.send(http_request.clone()).await
      }
    ).await?

    // Step 5: Parse response
    IF http_response.status != 200 THEN
      RETURN parse_error_response(http_response).await
    END IF

    // HF returns array of {label, score}
    results <- http_response.json::<Vec<ClassificationResult>>().await?

    span.set_status(SpanStatus::Ok)
    RETURN Ok(ClassificationResponse {
      classifications: results,
      model: model.to_string()
    })

  CATCH error AS e
    span.set_status(SpanStatus::Error)
    RETURN Error(e)

  FINALLY
    span.end()
  END TRY
END FUNCTION

ASYNC FUNCTION prepare_image_data(image: &ImageInput) -> Result<PreparedImage, Error>
  MATCH image {
    ImageInput::Url(url) => {
      // Fetch image from URL
      response <- reqwest::get(url).await?
      bytes <- response.bytes().await?
      content_type <- response.headers().get("content-type")
        .map(|v| v.to_string())
        .unwrap_or("image/jpeg".to_string())
      RETURN Ok(PreparedImage { bytes, content_type })
    },
    ImageInput::Base64 { data, media_type } => {
      bytes <- base64::decode(data)?
      RETURN Ok(PreparedImage { bytes, content_type: media_type.clone() })
    },
    ImageInput::Bytes { data, media_type } => {
      RETURN Ok(PreparedImage { bytes: data.clone(), content_type: media_type.clone() })
    },
    ImageInput::FilePath(path) => {
      bytes <- std::fs::read(path)?
      content_type <- mime_guess::from_path(path)
        .first_or_octet_stream()
        .to_string()
      RETURN Ok(PreparedImage { bytes, content_type })
    }
  }
END FUNCTION
```

---

## 10. Audio Service

### 10.1 Automatic Speech Recognition

```
STRUCT AudioServiceImpl {
  transport: Arc<HttpTransport>,
  credentials: Arc<dyn CredentialProvider>,
  provider_resolver: Arc<ProviderResolver>,
  resilience: Arc<ResilienceOrchestrator>,
  observability: ObservabilityContext,
  config: HfInferenceConfig
}

ASYNC FUNCTION service.transcribe(request: AsrRequest) -> Result<TranscriptionResponse, Error>
  span <- self.observability.tracer.start_span("hf_inference.audio.transcribe")

  TRY
    // Step 1: Resolve target
    model <- request.model.as_ref().unwrap_or(&"openai/whisper-large-v3".to_string())
    target <- self.provider_resolver.resolve_inference_url(
      model,
      &InferenceTask::AutomaticSpeechRecognition,
      None
    )?

    // Step 2: Prepare audio data
    audio_data <- prepare_audio_data(&request.audio).await?

    // Step 3: Build request
    auth_header <- self.credentials.get_auth_header("hf").await?

    http_request <- HttpRequest::post(target.url)
      .header(auth_header.0, auth_header.1)
      .header("Content-Type", audio_data.content_type)
      .body(audio_data.bytes)?

    // Step 4: Execute
    http_response <- self.resilience.execute(
      operation_name: "transcribe_audio",
      classifier: HfRetryClassifier,
      action: || async {
        self.transport.send_with_timeout(
          http_request.clone(),
          Duration::from_secs(180)  // 3 minute timeout for audio
        ).await
      }
    ).await?

    // Step 5: Parse response
    IF http_response.status != 200 THEN
      RETURN parse_error_response(http_response).await
    END IF

    result <- http_response.json::<AsrResult>().await?

    span.set_status(SpanStatus::Ok)
    RETURN Ok(TranscriptionResponse {
      text: result.text,
      chunks: result.chunks,  // Word-level timestamps if available
      model: model.to_string()
    })

  CATCH error AS e
    span.set_status(SpanStatus::Error)
    RETURN Error(e)

  FINALLY
    span.end()
  END TRY
END FUNCTION
```

### 10.2 Text-to-Speech

```
ASYNC FUNCTION service.synthesize(request: TtsRequest) -> Result<AudioResponse, Error>
  span <- self.observability.tracer.start_span("hf_inference.audio.synthesize")

  TRY
    // Step 1: Resolve target
    model <- request.model.as_ref().unwrap_or(&self.config.default_tts_model)
    target <- self.provider_resolver.resolve_inference_url(
      model,
      &InferenceTask::TextToSpeech,
      None
    )?

    // Step 2: Build request body
    body <- json!({
      "inputs": request.text
    })

    IF request.language IS Some THEN
      body["parameters"] <- json!({ "language": request.language })
    END IF

    // Step 3: Build request
    auth_header <- self.credentials.get_auth_header("hf").await?

    http_request <- HttpRequest::post(target.url)
      .header(auth_header.0, auth_header.1)
      .header("Content-Type", "application/json")
      .json(&body)?

    // Step 4: Execute
    http_response <- self.resilience.execute(
      operation_name: "synthesize_speech",
      classifier: HfRetryClassifier,
      action: || async {
        self.transport.send(http_request.clone()).await
      }
    ).await?

    // Step 5: Parse response (binary audio data)
    IF http_response.status != 200 THEN
      RETURN parse_error_response(http_response).await
    END IF

    audio_bytes <- http_response.bytes().await?
    content_type <- http_response.headers.get("content-type")
      .map(|v| v.to_string())
      .unwrap_or("audio/flac".to_string())

    span.set_status(SpanStatus::Ok)
    RETURN Ok(AudioResponse {
      audio: audio_bytes,
      format: parse_audio_format(&content_type),
      model: model.to_string()
    })

  CATCH error AS e
    span.set_status(SpanStatus::Error)
    RETURN Error(e)

  FINALLY
    span.end()
  END TRY
END FUNCTION
```

---

## 11. Endpoint Management Service

### 11.1 List Endpoints

```
STRUCT EndpointManagementServiceImpl {
  transport: Arc<HttpTransport>,
  credentials: Arc<dyn CredentialProvider>,
  resilience: Arc<ResilienceOrchestrator>,
  observability: ObservabilityContext,
  management_api_url: String
}

ASYNC FUNCTION service.list(namespace: &str) -> Result<Vec<EndpointInfo>, Error>
  span <- self.observability.tracer.start_span("hf_inference.endpoints.list")
  span.set_attribute("namespace", namespace)

  TRY
    url <- format("{}/v2/endpoint/{}", self.management_api_url, namespace)

    auth_header <- self.credentials.get_auth_header("hf").await?

    http_request <- HttpRequest::get(url)
      .header(auth_header.0, auth_header.1)?

    http_response <- self.resilience.execute(
      operation_name: "list_endpoints",
      classifier: HfRetryClassifier,
      action: || async {
        self.transport.send(http_request.clone()).await
      }
    ).await?

    IF http_response.status != 200 THEN
      RETURN parse_error_response(http_response).await
    END IF

    response <- http_response.json::<EndpointListResponse>().await?

    endpoints <- response.items.iter().map(|item| {
      parse_endpoint_info(item, namespace)
    }).collect()

    span.set_status(SpanStatus::Ok)
    RETURN Ok(endpoints)

  CATCH error AS e
    span.set_status(SpanStatus::Error)
    RETURN Error(e)

  FINALLY
    span.end()
  END TRY
END FUNCTION
```

### 11.2 Create Endpoint

```
ASYNC FUNCTION service.create(config: EndpointConfig) -> Result<EndpointInfo, Error>
  span <- self.observability.tracer.start_span("hf_inference.endpoints.create")
  span.set_attribute("name", &config.name)
  span.set_attribute("namespace", &config.namespace)

  TRY
    url <- format("{}/v2/endpoint/{}", self.management_api_url, config.namespace)

    auth_header <- self.credentials.get_auth_header("hf").await?

    // Build request body
    body <- json!({
      "name": config.name,
      "type": serialize_endpoint_type(&config.endpoint_type),
      "model": {
        "repository": config.model.repository,
        "revision": config.model.revision.unwrap_or("main".to_string()),
        "task": serialize_task(&config.model.task),
        "framework": serialize_framework(&config.model.framework)
      },
      "provider": {
        "vendor": serialize_vendor(&config.provider.vendor),
        "region": config.provider.region
      },
      "compute": {
        "accelerator": serialize_accelerator(&config.compute.accelerator),
        "instanceType": config.compute.instance_type,
        "instanceSize": config.compute.instance_size,
        "scaling": {
          "minReplica": config.compute.scaling.min_replica,
          "maxReplica": config.compute.scaling.max_replica,
          "scaleToZeroTimeout": config.compute.scaling.scale_to_zero_timeout
        }
      }
    })

    // Custom image if specified
    IF config.custom IS Some THEN
      body["custom"] <- serialize_custom_config(&config.custom.unwrap())
    END IF

    http_request <- HttpRequest::post(url)
      .header(auth_header.0, auth_header.1)
      .header("Content-Type", "application/json")
      .json(&body)?

    http_response <- self.transport.send(http_request).await?

    IF http_response.status != 200 AND http_response.status != 201 THEN
      RETURN parse_error_response(http_response).await
    END IF

    response <- http_response.json::<EndpointRawResponse>().await?
    endpoint_info <- parse_endpoint_info(&response, &config.namespace)

    self.observability.logger.info("Endpoint created", {
      name: config.name,
      namespace: config.namespace,
      status: format!("{:?}", endpoint_info.status)
    })

    span.set_status(SpanStatus::Ok)
    RETURN Ok(endpoint_info)

  CATCH error AS e
    span.set_status(SpanStatus::Error)
    RETURN Error(e)

  FINALLY
    span.end()
  END TRY
END FUNCTION
```

### 11.3 Endpoint Lifecycle Operations

```
ASYNC FUNCTION service.pause(namespace: &str, name: &str) -> Result<EndpointInfo, Error>
  span <- self.observability.tracer.start_span("hf_inference.endpoints.pause")

  url <- format("{}/v2/endpoint/{}/{}/pause", self.management_api_url, namespace, name)

  auth_header <- self.credentials.get_auth_header("hf").await?

  http_request <- HttpRequest::post(url)
    .header(auth_header.0, auth_header.1)?

  http_response <- self.transport.send(http_request).await?

  IF http_response.status != 200 THEN
    RETURN parse_error_response(http_response).await
  END IF

  response <- http_response.json::<EndpointRawResponse>().await?
  RETURN Ok(parse_endpoint_info(&response, namespace))
END FUNCTION

ASYNC FUNCTION service.resume(namespace: &str, name: &str) -> Result<EndpointInfo, Error>
  span <- self.observability.tracer.start_span("hf_inference.endpoints.resume")

  url <- format("{}/v2/endpoint/{}/{}/resume", self.management_api_url, namespace, name)

  auth_header <- self.credentials.get_auth_header("hf").await?

  http_request <- HttpRequest::post(url)
    .header(auth_header.0, auth_header.1)?

  http_response <- self.transport.send(http_request).await?

  IF http_response.status != 200 THEN
    RETURN parse_error_response(http_response).await
  END IF

  response <- http_response.json::<EndpointRawResponse>().await?
  RETURN Ok(parse_endpoint_info(&response, namespace))
END FUNCTION

ASYNC FUNCTION service.scale_to_zero(namespace: &str, name: &str) -> Result<EndpointInfo, Error>
  span <- self.observability.tracer.start_span("hf_inference.endpoints.scale_to_zero")

  url <- format("{}/v2/endpoint/{}/{}/scale-to-zero", self.management_api_url, namespace, name)

  auth_header <- self.credentials.get_auth_header("hf").await?

  http_request <- HttpRequest::post(url)
    .header(auth_header.0, auth_header.1)?

  http_response <- self.transport.send(http_request).await?

  IF http_response.status != 200 THEN
    RETURN parse_error_response(http_response).await
  END IF

  response <- http_response.json::<EndpointRawResponse>().await?
  RETURN Ok(parse_endpoint_info(&response, namespace))
END FUNCTION
```

### 11.4 Wait for Running

```
ASYNC FUNCTION service.wait_for_running(
  namespace: &str,
  name: &str,
  timeout: Duration
) -> Result<EndpointInfo, Error>
  span <- self.observability.tracer.start_span("hf_inference.endpoints.wait_for_running")

  start_time <- Instant::now()

  LOOP
    // Check timeout
    IF start_time.elapsed() > timeout THEN
      RETURN Error(EndpointTimeoutError {
        endpoint: name.to_string(),
        timeout: timeout
      })
    END IF

    // Fetch current status
    endpoint <- self.get(namespace, name).await?

    MATCH endpoint.status {
      EndpointStatus::Running => {
        span.set_status(SpanStatus::Ok)
        RETURN Ok(endpoint)
      },
      EndpointStatus::Failed(msg) => {
        RETURN Error(EndpointFailedError {
          endpoint: name.to_string(),
          message: msg
        })
      },
      EndpointStatus::Pending |
      EndpointStatus::Initializing |
      EndpointStatus::Updating => {
        // Still starting, wait and retry
        self.observability.logger.debug("Waiting for endpoint", {
          name: name,
          status: format!("{:?}", endpoint.status)
        })
        tokio::time::sleep(ENDPOINT_POLL_INTERVAL).await
      },
      EndpointStatus::Paused => {
        RETURN Error(EndpointPausedError {
          endpoint: name.to_string()
        })
      },
      EndpointStatus::ScaledToZero => {
        // Will auto-start on first request
        span.set_status(SpanStatus::Ok)
        RETURN Ok(endpoint)
      }
    }
  END LOOP
END FUNCTION
```

---

## 12. Cold Start Handling

### 12.1 Execute with Cold Start Handling

```
ASYNC FUNCTION execute_with_cold_start_handling(
  &self,
  request: HttpRequest,
  target: &InferenceTarget,
  operation_name: &str
) -> Result<HttpResponse, Error>
  // First attempt
  response <- self.resilience.execute(
    operation_name: operation_name,
    classifier: HfRetryClassifier,
    action: || async {
      self.transport.send(request.clone()).await
    }
  ).await

  MATCH response {
    Ok(http_response) => {
      // Check for model loading response
      IF http_response.status == 503 THEN
        // Parse response to check if it's a loading state
        body <- http_response.text().await?
        IF body.contains("is currently loading") OR body.contains("Model is loading") THEN
          IF self.config.auto_wait_for_model THEN
            RETURN self.wait_and_retry(request, target, operation_name).await
          ELSE
            RETURN Error(ModelLoadingError {
              model: target.model.clone(),
              message: body
            })
          END IF
        END IF
      END IF
      RETURN Ok(http_response)
    },
    Err(e) => {
      RETURN Err(e)
    }
  }
END FUNCTION

ASYNC FUNCTION wait_and_retry(
  &self,
  request: HttpRequest,
  target: &InferenceTarget,
  operation_name: &str
) -> Result<HttpResponse, Error>
  start_time <- Instant::now()
  timeout <- self.config.cold_start_timeout

  self.observability.logger.info("Model is loading, waiting...", {
    model: target.model.clone(),
    timeout_secs: timeout.as_secs()
  })

  retry_count <- 0
  LOOP
    // Check timeout
    IF start_time.elapsed() > timeout THEN
      RETURN Error(ColdStartTimeoutError {
        model: target.model.clone(),
        waited: start_time.elapsed()
      })
    END IF

    // Exponential backoff: 2s, 4s, 8s, ... up to 30s
    wait_time <- Duration::from_secs(
      min(2u64.pow(retry_count), 30)
    )
    tokio::time::sleep(wait_time).await
    retry_count <- retry_count + 1

    // Retry request
    response <- self.transport.send(request.clone()).await?

    IF response.status == 200 THEN
      self.observability.logger.info("Model loaded successfully", {
        model: target.model.clone(),
        wait_time_secs: start_time.elapsed().as_secs()
      })
      RETURN Ok(response)
    END IF

    IF response.status != 503 THEN
      // Different error, don't retry
      RETURN Ok(response)
    END IF

    // Still 503, continue waiting
    self.observability.logger.debug("Model still loading", {
      model: target.model.clone(),
      retry_count: retry_count
    })
  END LOOP
END FUNCTION
```

---

## 13. Error Handling

### 13.1 Error Response Parsing

```
ASYNC FUNCTION parse_error_response(http_response: HttpResponse) -> Error
  status <- http_response.status
  body <- http_response.text().await.unwrap_or_default()

  // Try to parse as HF error format
  hf_error <- parse_json::<HfErrorResponse>(&body).ok()

  error_message <- hf_error.as_ref()
    .map(|e| e.error.as_str())
    .unwrap_or(&body)

  error_type <- hf_error.as_ref()
    .and_then(|e| e.error_type.as_ref())
    .map(|t| t.as_str())

  MATCH status {
    400 => {
      Error::ValidationError {
        message: error_message.to_string()
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
      Error::NotFound {
        resource: extract_resource_from_error(error_message),
        message: error_message.to_string()
      }
    },
    422 => {
      Error::ValidationError {
        message: error_message.to_string()
      }
    },
    429 => {
      retry_after <- http_response.headers
        .get("Retry-After")
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(60)

      Error::RateLimited {
        retry_after_ms: retry_after * 1000,
        message: error_message.to_string()
      }
    },
    502 => {
      Error::EndpointUnhealthy {
        message: error_message.to_string()
      }
    },
    503 => {
      // Could be model loading or endpoint scaling
      IF error_message.contains("loading") OR error_message.contains("initializing") THEN
        Error::ModelLoading {
          message: error_message.to_string()
        }
      ELSE
        Error::ServiceUnavailable {
          message: error_message.to_string()
        }
      END IF
    },
    504 => {
      Error::GatewayTimeout {
        message: error_message.to_string()
      }
    },
    500..=599 => {
      Error::ServerError {
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

### 13.2 Retry Classifier

```
STRUCT HfRetryClassifier

IMPL RetryClassifier FOR HfRetryClassifier {
  FUNCTION classify(error: &Error) -> RetryDecision
    MATCH error {
      Error::RateLimited { retry_after_ms, .. } => {
        RetryDecision::RetryAfter(Duration::from_millis(*retry_after_ms))
      },
      Error::ServiceUnavailable { .. } => {
        RetryDecision::RetryWithBackoff
      },
      Error::GatewayTimeout { .. } => {
        RetryDecision::RetryWithBackoff
      },
      Error::ServerError { status_code, .. } if *status_code >= 500 => {
        RetryDecision::RetryWithBackoff
      },
      Error::NetworkError(_) => {
        RetryDecision::RetryWithBackoff
      },
      Error::TimeoutError => {
        RetryDecision::RetryWithBackoff
      },
      // Model loading is handled separately, not through retry
      Error::ModelLoading { .. } => {
        RetryDecision::DoNotRetry
      },
      // All other errors are not retryable
      _ => {
        RetryDecision::DoNotRetry
      }
    }
  END FUNCTION
}
```

---

## 14. Platform Adapter

### 14.1 Model Adapter Implementation

```
STRUCT HfInferenceAdapter {
  client: Arc<HfInferenceClient>
}

IMPL ModelAdapter FOR HfInferenceAdapter {
  FUNCTION provider_id() -> &'static str
    RETURN "hf-inference-endpoints"
  END FUNCTION

  FUNCTION supported_capabilities() -> Vec<ModelCapability>
    RETURN vec![
      ModelCapability::ChatCompletion,
      ModelCapability::TextGeneration,
      ModelCapability::Streaming,
      ModelCapability::Embeddings,
      ModelCapability::ImageGeneration,
      ModelCapability::ImageClassification,
      ModelCapability::AudioTranscription,
      ModelCapability::TextToSpeech,
      ModelCapability::FunctionCalling
    ]
  END FUNCTION

  ASYNC FUNCTION invoke(request: UnifiedModelRequest) -> Result<UnifiedModelResponse, Error>
    // Route based on request type
    MATCH request.request_type {
      RequestType::ChatCompletion => {
        hf_request <- convert_to_hf_chat_request(request)
        hf_response <- self.client.chat().complete(hf_request).await?
        RETURN convert_to_unified_response(hf_response)
      },
      RequestType::TextGeneration => {
        hf_request <- convert_to_hf_text_gen_request(request)
        hf_response <- self.client.text_generation().generate(hf_request).await?
        RETURN convert_text_gen_to_unified_response(hf_response)
      },
      RequestType::Embedding => {
        hf_request <- convert_to_hf_embedding_request(request)
        hf_response <- self.client.embeddings().create(hf_request).await?
        RETURN convert_to_unified_embedding_response(hf_response)
      },
      RequestType::ImageGeneration => {
        hf_request <- convert_to_hf_image_request(request)
        hf_response <- self.client.image().generate(hf_request).await?
        RETURN convert_to_unified_image_response(hf_response)
      },
      _ => {
        RETURN Error::UnsupportedRequestType(request.request_type)
      }
    }
  END FUNCTION

  ASYNC FUNCTION invoke_stream(request: UnifiedModelRequest) -> Result<UnifiedStream, Error>
    MATCH request.request_type {
      RequestType::ChatCompletion => {
        hf_request <- convert_to_hf_chat_request(request)
        hf_stream <- self.client.chat().stream(hf_request).await?
        RETURN UnifiedStream::new(hf_stream.map(|chunk| {
          chunk.map(|c| convert_chunk_to_unified(c))
        }))
      },
      RequestType::TextGeneration => {
        hf_request <- convert_to_hf_text_gen_request(request)
        hf_stream <- self.client.text_generation().stream(hf_request).await?
        RETURN UnifiedStream::new(hf_stream.map(|chunk| {
          chunk.map(|c| convert_text_gen_chunk_to_unified(c))
        }))
      },
      _ => {
        RETURN Error::StreamingNotSupported(request.request_type)
      }
    }
  END FUNCTION
}
```

---

## 15. RuvVector Integration

### 15.1 Embedding Storage

```
STRUCT HfEmbeddingStorage {
  client: Arc<HfInferenceClient>,
  embedding_model: String,
  database: Arc<DatabaseConnection>
}

IMPL EmbeddingStorage FOR HfEmbeddingStorage {
  ASYNC FUNCTION store_embedding(
    text: &str,
    metadata: EmbeddingMetadata
  ) -> Result<EmbeddingId, Error>
    // Step 1: Generate embedding via HF
    embedding_response <- self.client.embeddings().create(EmbeddingRequest {
      inputs: EmbeddingInput::Single(text.to_string()),
      model: Some(self.embedding_model.clone()),
      normalize: Some(true),
      truncate: Some(true),
      prompt_name: None
    }).await?

    embedding_vector <- embedding_response.embeddings[0].clone()

    // Step 2: Store in RuvVector (PostgreSQL with pgvector)
    id <- self.database.execute(
      "INSERT INTO embeddings (vector, text, metadata, provider, created_at)
       VALUES ($1, $2, $3, 'hf-inference', NOW())
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
      inputs: EmbeddingInput::Single(query.to_string()),
      model: Some(self.embedding_model.clone()),
      normalize: Some(true),
      truncate: Some(true),
      prompt_name: None
    }).await?

    query_vector <- query_embedding.embeddings[0].clone()

    // Step 2: Build similarity search query
    sql <- "
      SELECT id, text, metadata,
             1 - (vector <=> $1::vector) as similarity
      FROM embeddings
      WHERE provider = 'hf-inference'
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
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial pseudocode |

---

**End of Pseudocode Phase**

*Next Phase: Refinement — optimization, edge cases, and production hardening.*
