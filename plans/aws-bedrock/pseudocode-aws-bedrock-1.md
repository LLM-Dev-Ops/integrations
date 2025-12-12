# AWS Bedrock Integration Module - Pseudocode (Part 1)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/aws/bedrock`
**File:** 1 of 2 - Core Infrastructure & Model Services

---

## Table of Contents (Part 1)

1. [Overview](#1-overview)
2. [Client Initialization](#2-client-initialization)
3. [Configuration Management](#3-configuration-management)
4. [Model Family Router](#4-model-family-router)
5. [Request Translation Layer](#5-request-translation-layer)
6. [Response Translation Layer](#6-response-translation-layer)
7. [Titan Service](#7-titan-service)
8. [Claude Service (Bedrock)](#8-claude-service-bedrock)
9. [LLaMA Service](#9-llama-service)

---

## 1. Overview

This document provides pseudocode algorithms for the AWS Bedrock Integration Module. The module is designed as a **thin adapter layer** that:
- Routes requests to appropriate model families (Titan, Claude, LLaMA)
- Translates unified requests to model-specific formats
- Delegates infrastructure concerns to shared modules

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
| Model Isolation | Distinct services per model family |
| Shared Infrastructure | Reuse credentials, signing, resilience |
| Unified Interface | Common request/response types with translation |

### 1.3 Constants

```
CONST BEDROCK_SERVICE_NAME <- "bedrock-runtime"
CONST BEDROCK_CONTROL_SERVICE <- "bedrock"
CONST DEFAULT_TIMEOUT <- 120s
CONST DEFAULT_MAX_RETRIES <- 3
CONST MAX_INPUT_TOKENS_TITAN <- 8192
CONST MAX_INPUT_TOKENS_CLAUDE <- 200000
CONST MAX_INPUT_TOKENS_LLAMA <- 128000
CONST SUPPORTED_REGIONS <- ["us-east-1", "us-west-2", "eu-west-1", "ap-northeast-1", ...]
```

---

## 2. Client Initialization

### 2.1 Client Factory

```
FUNCTION create_bedrock_client(config: BedrockConfig) -> Result<BedrockClient, BedrockError>
  // Step 1: Validate configuration
  validation_result <- validate_config(config)
  IF validation_result IS Error THEN
    RETURN Error(ConfigurationError::InvalidConfiguration(validation_result.message))
  END IF

  // Step 2: Initialize shared dependencies (from existing modules)
  // IMPORTANT: Reuse existing aws/credentials module
  credentials_provider <- config.credentials OR create_credentials_provider_chain()

  // Step 3: Initialize shared signing (from aws/signing module)
  signer <- create_aws_signer(
    service: BEDROCK_SERVICE_NAME,
    region: config.region,
    credentials_provider: credentials_provider
  )

  // Step 4: Initialize shared resilience (from shared/resilience)
  resilience_orchestrator <- create_resilience_orchestrator(
    retry_config: config.resilience.retry OR DEFAULT_RETRY_CONFIG,
    circuit_breaker_config: config.resilience.circuit_breaker OR DEFAULT_CB_CONFIG,
    rate_limiter_config: config.resilience.rate_limiter
  )

  // Step 5: Initialize shared observability (from shared/observability)
  observability <- create_observability_context(
    service_name: "bedrock",
    logger: get_logger("bedrock"),
    tracer: get_tracer("bedrock"),
    metrics: get_metrics_collector("bedrock")
  )

  // Step 6: Initialize shared transport (reuse pattern from aws/ses)
  transport <- create_http_transport(HttpTransportConfig {
    timeout: config.timeout OR DEFAULT_TIMEOUT,
    tls_config: TlsConfig { min_version: TLS_1_2 },
    connection_pool_size: 10
  })

  // Step 7: Build runtime endpoint
  runtime_endpoint <- IF config.endpoint IS Some THEN
    config.endpoint
  ELSE
    format("https://bedrock-runtime.{}.amazonaws.com", config.region)
  END IF

  // Step 8: Build control plane endpoint
  control_endpoint <- format("https://bedrock.{}.amazonaws.com", config.region)

  // Step 9: Assemble client with lazy service initialization
  client <- BedrockClientImpl {
    config: config,
    transport: transport,
    signer: signer,
    runtime_endpoint: runtime_endpoint,
    control_endpoint: control_endpoint,
    resilience: resilience_orchestrator,
    observability: observability,
    credentials_provider: credentials_provider,

    // Lazy-initialized services (one per model family)
    titan_service: None,
    claude_service: None,
    llama_service: None,
    models_service: None,

    // Optional RuvVector connection (from shared/database)
    ruvvector: config.ruvvector
  }

  observability.logger.info("Bedrock client initialized", {
    region: config.region,
    runtime_endpoint: runtime_endpoint
  })

  RETURN Ok(client)
END FUNCTION
```

### 2.2 Client from Environment

```
FUNCTION create_bedrock_client_from_env() -> Result<BedrockClient, BedrockError>
  // Step 1: Reuse shared AWS credentials chain
  credentials_provider <- create_credentials_provider_chain()

  // Step 2: Read region (required)
  region <- read_env("AWS_REGION") OR read_env("AWS_DEFAULT_REGION")
  IF region IS None THEN
    RETURN Error(ConfigurationError::MissingRegion)
  END IF

  // Step 3: Validate region supports Bedrock
  IF region NOT IN SUPPORTED_REGIONS THEN
    log_warning("Region may not support all Bedrock models", { region })
  END IF

  // Step 4: Read optional configuration
  endpoint <- read_env("BEDROCK_ENDPOINT")
  timeout_str <- read_env("BEDROCK_TIMEOUT")
  max_retries_str <- read_env("BEDROCK_MAX_RETRIES")

  // Step 5: Read optional RuvVector config
  ruvvector_config <- IF read_env("RUVVECTOR_ENABLED") == "true" THEN
    Some(DatabaseConfig::from_env())
  ELSE
    None
  END IF

  // Step 6: Build config
  config <- BedrockConfig {
    region: region,
    credentials: credentials_provider,
    endpoint: endpoint,
    timeout: parse_duration(timeout_str) OR DEFAULT_TIMEOUT,
    resilience: ResilienceConfig {
      retry: RetryConfig {
        max_retries: parse_u32(max_retries_str) OR DEFAULT_MAX_RETRIES,
        initial_backoff: 500ms,
        max_backoff: 60s,
        backoff_multiplier: 2.0
      },
      circuit_breaker: CircuitBreakerConfig::default(),
      rate_limiter: None
    },
    observability: ObservabilityConfig::default(),
    ruvvector: ruvvector_config
  }

  RETURN create_bedrock_client(config)
END FUNCTION
```

### 2.3 Service Accessor Pattern

```
// Access Titan models
FUNCTION client.titan() -> &TitanService
  IF self.titan_service IS None THEN
    LOCK self.service_mutex
      IF self.titan_service IS None THEN
        self.titan_service <- Some(TitanServiceImpl::new(
          transport: self.transport.clone(),
          signer: self.signer.clone(),
          endpoint: self.runtime_endpoint.clone(),
          resilience: self.resilience.clone(),
          observability: self.observability.clone()
        ))
      END IF
    END LOCK
  END IF
  RETURN self.titan_service.as_ref().unwrap()
END FUNCTION

// Access Claude models (via Bedrock)
FUNCTION client.claude() -> &ClaudeService
  IF self.claude_service IS None THEN
    LOCK self.service_mutex
      IF self.claude_service IS None THEN
        self.claude_service <- Some(ClaudeServiceImpl::new(
          transport: self.transport.clone(),
          signer: self.signer.clone(),
          endpoint: self.runtime_endpoint.clone(),
          resilience: self.resilience.clone(),
          observability: self.observability.clone()
        ))
      END IF
    END LOCK
  END IF
  RETURN self.claude_service.as_ref().unwrap()
END FUNCTION

// Access LLaMA models
FUNCTION client.llama() -> &LlamaService
  IF self.llama_service IS None THEN
    LOCK self.service_mutex
      IF self.llama_service IS None THEN
        self.llama_service <- Some(LlamaServiceImpl::new(
          transport: self.transport.clone(),
          signer: self.signer.clone(),
          endpoint: self.runtime_endpoint.clone(),
          resilience: self.resilience.clone(),
          observability: self.observability.clone()
        ))
      END IF
    END LOCK
  END IF
  RETURN self.llama_service.as_ref().unwrap()
END FUNCTION

// Access model discovery
FUNCTION client.models() -> &ModelDiscoveryService
  IF self.models_service IS None THEN
    LOCK self.service_mutex
      IF self.models_service IS None THEN
        // Note: Control plane uses different service name for signing
        control_signer <- create_aws_signer(
          service: BEDROCK_CONTROL_SERVICE,
          region: self.config.region,
          credentials_provider: self.credentials_provider.clone()
        )
        self.models_service <- Some(ModelDiscoveryServiceImpl::new(
          transport: self.transport.clone(),
          signer: control_signer,
          endpoint: self.control_endpoint.clone(),
          resilience: self.resilience.clone(),
          observability: self.observability.clone()
        ))
      END IF
    END LOCK
  END IF
  RETURN self.models_service.as_ref().unwrap()
END FUNCTION
```

---

## 3. Configuration Management

### 3.1 Configuration Validation

```
FUNCTION validate_config(config: BedrockConfig) -> Result<(), ValidationError>
  errors <- []

  // Validate region
  IF config.region.is_empty() THEN
    errors.push("Region is required")
  ELSE IF config.region NOT IN SUPPORTED_REGIONS THEN
    // Warning only - new regions may be added
    log_warning("Region may have limited Bedrock support", { region: config.region })
  END IF

  // Validate credentials (delegate to shared module)
  TRY
    test_credentials <- config.credentials.get_credentials().await
    IF test_credentials.access_key_id.is_empty() THEN
      errors.push("Access key ID is empty")
    END IF
  CATCH CredentialsError AS e
    errors.push(format("Failed to get credentials: {}", e))
  END TRY

  // Validate endpoint if provided
  IF config.endpoint IS Some THEN
    TRY
      parsed_url <- parse_url(config.endpoint)
      IF parsed_url.scheme NOT IN ["https"] THEN
        IF is_production_environment() THEN
          errors.push("Endpoint must use HTTPS in production")
        END IF
      END IF
    CATCH ParseError
      errors.push("Invalid endpoint URL format")
    END TRY
  END IF

  // Validate timeout
  IF config.timeout < 1s THEN
    errors.push("Timeout must be at least 1 second")
  ELSE IF config.timeout > 600s THEN
    errors.push("Timeout cannot exceed 600 seconds")
  END IF

  // Validate RuvVector config if present
  IF config.ruvvector IS Some THEN
    ruvvector_validation <- validate_database_config(config.ruvvector)
    IF ruvvector_validation IS Error THEN
      errors.push(format("RuvVector config invalid: {}", ruvvector_validation.message))
    END IF
  END IF

  IF errors.is_empty() THEN
    RETURN Ok(())
  ELSE
    RETURN Error(ValidationError { messages: errors })
  END IF
END FUNCTION
```

### 3.2 Configuration Builder

```
STRUCT BedrockConfigBuilder {
  region: Option<String>,
  credentials: Option<CredentialsProvider>,
  endpoint: Option<String>,
  timeout: Duration,
  resilience: Option<ResilienceConfig>,
  observability: Option<ObservabilityConfig>,
  ruvvector: Option<DatabaseConfig>
}

FUNCTION BedrockConfigBuilder::new() -> BedrockConfigBuilder
  RETURN BedrockConfigBuilder {
    region: None,
    credentials: None,
    endpoint: None,
    timeout: DEFAULT_TIMEOUT,
    resilience: None,
    observability: None,
    ruvvector: None
  }
END FUNCTION

FUNCTION builder.region(region: String) -> BedrockConfigBuilder
  self.region <- Some(region)
  RETURN self
END FUNCTION

FUNCTION builder.credentials(provider: CredentialsProvider) -> BedrockConfigBuilder
  self.credentials <- Some(provider)
  RETURN self
END FUNCTION

FUNCTION builder.timeout(timeout: Duration) -> BedrockConfigBuilder
  self.timeout <- timeout
  RETURN self
END FUNCTION

FUNCTION builder.with_resilience(config: ResilienceConfig) -> BedrockConfigBuilder
  self.resilience <- Some(config)
  RETURN self
END FUNCTION

FUNCTION builder.with_ruvvector(config: DatabaseConfig) -> BedrockConfigBuilder
  self.ruvvector <- Some(config)
  RETURN self
END FUNCTION

FUNCTION builder.build() -> Result<BedrockConfig, ConfigurationError>
  IF self.region IS None THEN
    RETURN Error(ConfigurationError::MissingRegion)
  END IF

  credentials <- IF self.credentials IS Some THEN
    self.credentials
  ELSE
    create_credentials_provider_chain()
  END IF

  RETURN Ok(BedrockConfig {
    region: self.region.unwrap(),
    credentials: credentials,
    endpoint: self.endpoint,
    timeout: self.timeout,
    resilience: self.resilience OR ResilienceConfig::default(),
    observability: self.observability OR ObservabilityConfig::default(),
    ruvvector: self.ruvvector
  })
END FUNCTION
```

---

## 4. Model Family Router

### 4.1 Model Family Detection

```
ENUM ModelFamily {
  Titan,
  Claude,
  Llama,
  Unknown
}

FUNCTION detect_model_family(model_id: String) -> ModelFamily
  // Parse model ID prefix to determine family
  model_lower <- model_id.to_lowercase()

  IF model_lower.starts_with("amazon.titan") THEN
    RETURN ModelFamily::Titan
  ELSE IF model_lower.starts_with("anthropic.claude") THEN
    RETURN ModelFamily::Claude
  ELSE IF model_lower.starts_with("meta.llama") THEN
    RETURN ModelFamily::Llama
  ELSE
    RETURN ModelFamily::Unknown
  END IF
END FUNCTION
```

### 4.2 Model Capability Detection

```
STRUCT ModelCapabilities {
  supports_streaming: bool,
  supports_embeddings: bool,
  supports_images: bool,
  supports_system_prompt: bool,
  max_input_tokens: u32,
  max_output_tokens: u32
}

FUNCTION get_model_capabilities(model_id: String) -> ModelCapabilities
  family <- detect_model_family(model_id)
  model_lower <- model_id.to_lowercase()

  MATCH family
    CASE ModelFamily::Titan:
      IF model_lower.contains("embed") THEN
        RETURN ModelCapabilities {
          supports_streaming: false,
          supports_embeddings: true,
          supports_images: model_lower.contains("image"),
          supports_system_prompt: false,
          max_input_tokens: 8192,
          max_output_tokens: 0
        }
      ELSE IF model_lower.contains("image") THEN
        RETURN ModelCapabilities {
          supports_streaming: false,
          supports_embeddings: false,
          supports_images: true,
          supports_system_prompt: false,
          max_input_tokens: 512,
          max_output_tokens: 0
        }
      ELSE
        RETURN ModelCapabilities {
          supports_streaming: true,
          supports_embeddings: false,
          supports_images: false,
          supports_system_prompt: false,
          max_input_tokens: 8192,
          max_output_tokens: 4096
        }
      END IF

    CASE ModelFamily::Claude:
      RETURN ModelCapabilities {
        supports_streaming: true,
        supports_embeddings: false,
        supports_images: true,
        supports_system_prompt: true,
        max_input_tokens: 200000,
        max_output_tokens: 8192
      }

    CASE ModelFamily::Llama:
      // LLaMA 3.2 supports larger context
      max_tokens <- IF model_lower.contains("3-2") OR model_lower.contains("3.2") THEN
        128000
      ELSE IF model_lower.contains("3-1") OR model_lower.contains("3.1") THEN
        128000
      ELSE
        4096
      END IF

      RETURN ModelCapabilities {
        supports_streaming: true,
        supports_embeddings: false,
        supports_images: model_lower.contains("vision"),
        supports_system_prompt: true,
        max_input_tokens: max_tokens,
        max_output_tokens: 4096
      }

    CASE ModelFamily::Unknown:
      // Conservative defaults for unknown models
      RETURN ModelCapabilities {
        supports_streaming: false,
        supports_embeddings: false,
        supports_images: false,
        supports_system_prompt: false,
        max_input_tokens: 4096,
        max_output_tokens: 2048
      }
  END MATCH
END FUNCTION
```

### 4.3 Unified Invoke Router

```
FUNCTION unified_invoke(
  client: BedrockClient,
  request: UnifiedInvokeRequest
) -> Result<UnifiedInvokeResponse, BedrockError>

  // Detect model family
  family <- detect_model_family(request.model_id)

  // Route to appropriate service
  MATCH family
    CASE ModelFamily::Titan:
      titan_request <- translate_to_titan_request(request)?
      titan_response <- client.titan().generate(titan_request).await?
      RETURN translate_from_titan_response(titan_response)

    CASE ModelFamily::Claude:
      claude_request <- translate_to_claude_request(request)?
      claude_response <- client.claude().create_message(claude_request).await?
      RETURN translate_from_claude_response(claude_response)

    CASE ModelFamily::Llama:
      llama_request <- translate_to_llama_request(request)?
      llama_response <- client.llama().generate(llama_request).await?
      RETURN translate_from_llama_response(llama_response)

    CASE ModelFamily::Unknown:
      RETURN Error(BedrockError::Model(ModelError::UnsupportedModel {
        model_id: request.model_id,
        message: "Unknown model family"
      }))
  END MATCH
END FUNCTION
```

---

## 5. Request Translation Layer

### 5.1 Unified to Titan Translation

```
FUNCTION translate_to_titan_request(unified: UnifiedInvokeRequest) -> Result<TitanGenerateRequest, BedrockError>
  // Validate model is Titan
  IF NOT unified.model_id.starts_with("amazon.titan") THEN
    RETURN Error(BedrockError::Request(RequestError::InvalidModel {
      expected: "amazon.titan*",
      actual: unified.model_id
    }))
  END IF

  // Build input text from messages
  input_text <- ""
  FOR EACH message IN unified.messages DO
    MATCH message.role
      CASE "user":
        input_text <- input_text + "User: " + message.content + "\n"
      CASE "assistant":
        input_text <- input_text + "Assistant: " + message.content + "\n"
    END MATCH
  END FOR
  input_text <- input_text + "Assistant:"

  RETURN Ok(TitanGenerateRequest {
    model_id: unified.model_id,
    input_text: input_text,
    text_generation_config: TitanTextConfig {
      max_token_count: unified.max_tokens,
      temperature: unified.temperature OR 0.7,
      top_p: unified.top_p OR 0.9,
      stop_sequences: unified.stop_sequences OR []
    }
  })
END FUNCTION
```

### 5.2 Unified to Claude Translation

```
FUNCTION translate_to_claude_request(unified: UnifiedInvokeRequest) -> Result<ClaudeMessageRequest, BedrockError>
  // Validate model is Claude
  IF NOT unified.model_id.starts_with("anthropic.claude") THEN
    RETURN Error(BedrockError::Request(RequestError::InvalidModel {
      expected: "anthropic.claude*",
      actual: unified.model_id
    }))
  END IF

  // Translate messages directly (Claude uses same format)
  claude_messages <- []
  system_prompt <- None

  FOR EACH message IN unified.messages DO
    IF message.role == "system" THEN
      system_prompt <- Some(message.content)
    ELSE
      claude_messages.push(ClaudeMessage {
        role: message.role,
        content: message.content
      })
    END IF
  END FOR

  RETURN Ok(ClaudeMessageRequest {
    model_id: unified.model_id,
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: unified.max_tokens,
    messages: claude_messages,
    system: system_prompt,
    temperature: unified.temperature,
    top_p: unified.top_p,
    top_k: unified.top_k,
    stop_sequences: unified.stop_sequences
  })
END FUNCTION
```

### 5.3 Unified to LLaMA Translation

```
FUNCTION translate_to_llama_request(unified: UnifiedInvokeRequest) -> Result<LlamaGenerateRequest, BedrockError>
  // Validate model is LLaMA
  IF NOT unified.model_id.starts_with("meta.llama") THEN
    RETURN Error(BedrockError::Request(RequestError::InvalidModel {
      expected: "meta.llama*",
      actual: unified.model_id
    }))
  END IF

  // Build LLaMA prompt format
  prompt <- build_llama_prompt(unified.messages, unified.model_id)

  RETURN Ok(LlamaGenerateRequest {
    model_id: unified.model_id,
    prompt: prompt,
    max_gen_len: unified.max_tokens,
    temperature: unified.temperature OR 0.7,
    top_p: unified.top_p OR 0.9
  })
END FUNCTION

FUNCTION build_llama_prompt(messages: Vec<Message>, model_id: String) -> String
  // Detect LLaMA version for correct prompt format
  is_llama3 <- model_id.contains("llama3") OR model_id.contains("llama-3")

  IF is_llama3 THEN
    RETURN build_llama3_prompt(messages)
  ELSE
    RETURN build_llama2_prompt(messages)
  END IF
END FUNCTION

FUNCTION build_llama3_prompt(messages: Vec<Message>) -> String
  prompt <- "<|begin_of_text|>"

  FOR EACH message IN messages DO
    MATCH message.role
      CASE "system":
        prompt <- prompt + "<|start_header_id|>system<|end_header_id|>\n\n"
        prompt <- prompt + message.content + "<|eot_id|>"
      CASE "user":
        prompt <- prompt + "<|start_header_id|>user<|end_header_id|>\n\n"
        prompt <- prompt + message.content + "<|eot_id|>"
      CASE "assistant":
        prompt <- prompt + "<|start_header_id|>assistant<|end_header_id|>\n\n"
        prompt <- prompt + message.content + "<|eot_id|>"
    END MATCH
  END FOR

  // Add final assistant header for generation
  prompt <- prompt + "<|start_header_id|>assistant<|end_header_id|>\n\n"

  RETURN prompt
END FUNCTION

FUNCTION build_llama2_prompt(messages: Vec<Message>) -> String
  prompt <- "<s>"
  system_prompt <- None

  // Extract system prompt if present
  FOR EACH message IN messages DO
    IF message.role == "system" THEN
      system_prompt <- Some(message.content)
      BREAK
    END IF
  END FOR

  // Build conversation
  FOR EACH message IN messages DO
    IF message.role == "system" THEN
      CONTINUE
    END IF

    MATCH message.role
      CASE "user":
        IF system_prompt IS Some AND prompt == "<s>" THEN
          prompt <- prompt + "[INST] <<SYS>>\n" + system_prompt.unwrap() + "\n<</SYS>>\n\n"
          prompt <- prompt + message.content + " [/INST]"
          system_prompt <- None
        ELSE
          prompt <- prompt + "[INST] " + message.content + " [/INST]"
        END IF
      CASE "assistant":
        prompt <- prompt + " " + message.content + " </s><s>"
    END MATCH
  END FOR

  RETURN prompt
END FUNCTION
```

---

## 6. Response Translation Layer

### 6.1 Titan to Unified Translation

```
FUNCTION translate_from_titan_response(titan: TitanGenerateResponse) -> Result<UnifiedInvokeResponse, BedrockError>
  RETURN Ok(UnifiedInvokeResponse {
    model_id: titan.model_id,
    content: titan.results[0].output_text,
    stop_reason: map_titan_stop_reason(titan.results[0].completion_reason),
    usage: UsageInfo {
      input_tokens: titan.input_token_count,
      output_tokens: titan.results[0].token_count,
      total_tokens: titan.input_token_count + titan.results[0].token_count
    }
  })
END FUNCTION

FUNCTION map_titan_stop_reason(reason: String) -> StopReason
  MATCH reason
    CASE "FINISH":
      RETURN StopReason::EndTurn
    CASE "LENGTH":
      RETURN StopReason::MaxTokens
    CASE "STOP_SEQUENCE":
      RETURN StopReason::StopSequence
    CASE _:
      RETURN StopReason::Unknown
  END MATCH
END FUNCTION
```

### 6.2 Claude to Unified Translation

```
FUNCTION translate_from_claude_response(claude: ClaudeMessageResponse) -> Result<UnifiedInvokeResponse, BedrockError>
  // Extract text content from response blocks
  content <- ""
  FOR EACH block IN claude.content DO
    IF block.type == "text" THEN
      content <- content + block.text
    END IF
  END FOR

  RETURN Ok(UnifiedInvokeResponse {
    model_id: claude.model,
    content: content,
    stop_reason: map_claude_stop_reason(claude.stop_reason),
    usage: UsageInfo {
      input_tokens: claude.usage.input_tokens,
      output_tokens: claude.usage.output_tokens,
      total_tokens: claude.usage.input_tokens + claude.usage.output_tokens
    }
  })
END FUNCTION

FUNCTION map_claude_stop_reason(reason: Option<String>) -> StopReason
  MATCH reason
    CASE Some("end_turn"):
      RETURN StopReason::EndTurn
    CASE Some("max_tokens"):
      RETURN StopReason::MaxTokens
    CASE Some("stop_sequence"):
      RETURN StopReason::StopSequence
    CASE Some("tool_use"):
      RETURN StopReason::ToolUse
    CASE _:
      RETURN StopReason::Unknown
  END MATCH
END FUNCTION
```

### 6.3 LLaMA to Unified Translation

```
FUNCTION translate_from_llama_response(llama: LlamaGenerateResponse) -> Result<UnifiedInvokeResponse, BedrockError>
  RETURN Ok(UnifiedInvokeResponse {
    model_id: llama.model_id,
    content: llama.generation,
    stop_reason: map_llama_stop_reason(llama.stop_reason),
    usage: UsageInfo {
      input_tokens: llama.prompt_token_count,
      output_tokens: llama.generation_token_count,
      total_tokens: llama.prompt_token_count + llama.generation_token_count
    }
  })
END FUNCTION

FUNCTION map_llama_stop_reason(reason: String) -> StopReason
  MATCH reason
    CASE "stop":
      RETURN StopReason::EndTurn
    CASE "length":
      RETURN StopReason::MaxTokens
    CASE _:
      RETURN StopReason::Unknown
  END MATCH
END FUNCTION
```

---

## 7. Titan Service

### 7.1 Titan Service Implementation

```
STRUCT TitanServiceImpl {
  transport: HttpTransport,
  signer: AwsSigner,
  endpoint: String,
  resilience: ResilienceOrchestrator,
  observability: ObservabilityContext
}

FUNCTION TitanServiceImpl::new(...) -> TitanServiceImpl
  RETURN TitanServiceImpl { ... }
END FUNCTION
```

### 7.2 Titan Text Generation

```
FUNCTION titan_service.generate(request: TitanGenerateRequest) -> Result<TitanGenerateResponse, BedrockError>
  span <- self.observability.tracer.start_span("bedrock.titan.generate")
  span.set_attribute("bedrock.model_id", request.model_id)
  span.set_attribute("bedrock.model_family", "titan")

  TRY
    // Validate request
    validate_titan_request(request)?

    // Build request body
    body <- {
      "inputText": request.input_text,
      "textGenerationConfig": {
        "maxTokenCount": request.text_generation_config.max_token_count,
        "temperature": request.text_generation_config.temperature,
        "topP": request.text_generation_config.top_p,
        "stopSequences": request.text_generation_config.stop_sequences
      }
    }

    // Build HTTP request
    path <- format("/model/{}/invoke", request.model_id)
    http_request <- build_bedrock_request(
      method: POST,
      endpoint: self.endpoint,
      path: path,
      body: body,
      signer: self.signer
    )?

    // Execute with resilience
    response <- self.resilience.execute(|| {
      self.transport.send(http_request)
    }).await?

    // Parse response
    result <- parse_titan_response(response)?

    // Record metrics
    self.observability.metrics.record_counter("bedrock_requests_total", 1, {
      "model_family": "titan",
      "model_id": request.model_id,
      "status": "success"
    })
    self.observability.metrics.record_counter("bedrock_tokens_total", result.input_token_count, {
      "model_family": "titan",
      "direction": "input"
    })
    self.observability.metrics.record_counter("bedrock_tokens_total", result.results[0].token_count, {
      "model_family": "titan",
      "direction": "output"
    })

    span.end()
    RETURN Ok(result)

  CATCH error
    span.record_error(error)
    self.observability.metrics.record_counter("bedrock_errors_total", 1, {
      "model_family": "titan",
      "error_type": error.type_name()
    })
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 7.3 Titan Embeddings

```
FUNCTION titan_service.embed(request: TitanEmbedRequest) -> Result<TitanEmbedResponse, BedrockError>
  span <- self.observability.tracer.start_span("bedrock.titan.embed")
  span.set_attribute("bedrock.model_id", request.model_id)

  TRY
    // Validate embedding model
    IF NOT request.model_id.contains("embed") THEN
      RETURN Error(BedrockError::Request(RequestError::InvalidModel {
        message: "Model does not support embeddings"
      }))
    END IF

    // Build request body
    body <- {
      "inputText": request.input_text
    }

    // Add dimensions if supported (Titan Embed v2)
    IF request.dimensions IS Some THEN
      body["dimensions"] <- request.dimensions
    END IF

    IF request.normalize IS Some THEN
      body["normalize"] <- request.normalize
    END IF

    // Build and execute request
    path <- format("/model/{}/invoke", request.model_id)
    http_request <- build_bedrock_request(
      method: POST,
      endpoint: self.endpoint,
      path: path,
      body: body,
      signer: self.signer
    )?

    response <- self.resilience.execute(|| {
      self.transport.send(http_request)
    }).await?

    result <- parse_titan_embed_response(response)?

    // Optionally store in RuvVector
    IF self.ruvvector IS Some THEN
      store_embedding_in_ruvvector(
        embedding: result.embedding,
        metadata: request.metadata,
        ruvvector: self.ruvvector
      ).await?
    END IF

    span.end()
    RETURN Ok(result)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 7.4 Titan Streaming

```
FUNCTION titan_service.generate_stream(request: TitanGenerateRequest) -> Result<TitanStream, BedrockError>
  span <- self.observability.tracer.start_span("bedrock.titan.generate_stream")

  TRY
    // Build request body (same as non-streaming)
    body <- {
      "inputText": request.input_text,
      "textGenerationConfig": {
        "maxTokenCount": request.text_generation_config.max_token_count,
        "temperature": request.text_generation_config.temperature,
        "topP": request.text_generation_config.top_p,
        "stopSequences": request.text_generation_config.stop_sequences
      }
    }

    // Use streaming endpoint
    path <- format("/model/{}/invoke-with-response-stream", request.model_id)
    http_request <- build_bedrock_request(
      method: POST,
      endpoint: self.endpoint,
      path: path,
      body: body,
      signer: self.signer
    )?

    // Execute streaming request
    response_stream <- self.transport.send_streaming(http_request).await?

    // Wrap in Titan-specific stream parser
    titan_stream <- TitanStream::new(
      inner: response_stream,
      model_id: request.model_id,
      observability: self.observability.clone()
    )

    span.end()
    RETURN Ok(titan_stream)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

---

## 8. Claude Service (Bedrock)

### 8.1 Claude Service Implementation

```
STRUCT ClaudeServiceImpl {
  transport: HttpTransport,
  signer: AwsSigner,
  endpoint: String,
  resilience: ResilienceOrchestrator,
  observability: ObservabilityContext
}
```

### 8.2 Claude Message Creation

```
FUNCTION claude_service.create_message(request: ClaudeMessageRequest) -> Result<ClaudeMessageResponse, BedrockError>
  span <- self.observability.tracer.start_span("bedrock.claude.create_message")
  span.set_attribute("bedrock.model_id", request.model_id)
  span.set_attribute("bedrock.model_family", "claude")

  TRY
    // Validate request
    validate_claude_request(request)?

    // Build Bedrock-specific Claude request body
    body <- {
      "anthropic_version": request.anthropic_version OR "bedrock-2023-05-31",
      "max_tokens": request.max_tokens,
      "messages": request.messages.map(|m| {
        "role": m.role,
        "content": m.content
      })
    }

    // Add optional parameters
    IF request.system IS Some THEN
      body["system"] <- request.system
    END IF

    IF request.temperature IS Some THEN
      body["temperature"] <- request.temperature
    END IF

    IF request.top_p IS Some THEN
      body["top_p"] <- request.top_p
    END IF

    IF request.top_k IS Some THEN
      body["top_k"] <- request.top_k
    END IF

    IF request.stop_sequences IS Some AND request.stop_sequences.len() > 0 THEN
      body["stop_sequences"] <- request.stop_sequences
    END IF

    // Build HTTP request
    path <- format("/model/{}/invoke", request.model_id)
    http_request <- build_bedrock_request(
      method: POST,
      endpoint: self.endpoint,
      path: path,
      body: body,
      signer: self.signer
    )?

    // Execute with resilience
    response <- self.resilience.execute(|| {
      self.transport.send(http_request)
    }).await?

    // Parse response
    result <- parse_claude_response(response)?

    // Record observability
    self.observability.metrics.record_counter("bedrock_requests_total", 1, {
      "model_family": "claude",
      "model_id": request.model_id,
      "status": "success"
    })

    span.set_attribute("bedrock.input_tokens", result.usage.input_tokens)
    span.set_attribute("bedrock.output_tokens", result.usage.output_tokens)
    span.end()

    RETURN Ok(result)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 8.3 Claude Streaming

```
FUNCTION claude_service.create_message_stream(request: ClaudeMessageRequest) -> Result<ClaudeStream, BedrockError>
  span <- self.observability.tracer.start_span("bedrock.claude.create_message_stream")

  TRY
    // Build same request body
    body <- build_claude_request_body(request)

    // Use streaming endpoint
    path <- format("/model/{}/invoke-with-response-stream", request.model_id)
    http_request <- build_bedrock_request(
      method: POST,
      endpoint: self.endpoint,
      path: path,
      body: body,
      signer: self.signer
    )?

    // Execute streaming request
    response_stream <- self.transport.send_streaming(http_request).await?

    // Wrap in Claude-specific stream parser
    // Note: Bedrock uses AWS event stream format, not SSE
    claude_stream <- ClaudeStream::new(
      inner: BedrockEventStreamParser::new(response_stream),
      model_id: request.model_id,
      observability: self.observability.clone()
    )

    span.end()
    RETURN Ok(claude_stream)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

---

## 9. LLaMA Service

### 9.1 LLaMA Service Implementation

```
STRUCT LlamaServiceImpl {
  transport: HttpTransport,
  signer: AwsSigner,
  endpoint: String,
  resilience: ResilienceOrchestrator,
  observability: ObservabilityContext
}
```

### 9.2 LLaMA Text Generation

```
FUNCTION llama_service.generate(request: LlamaGenerateRequest) -> Result<LlamaGenerateResponse, BedrockError>
  span <- self.observability.tracer.start_span("bedrock.llama.generate")
  span.set_attribute("bedrock.model_id", request.model_id)
  span.set_attribute("bedrock.model_family", "llama")

  TRY
    // Validate request
    validate_llama_request(request)?

    // Build request body (LLaMA format)
    body <- {
      "prompt": request.prompt,
      "max_gen_len": request.max_gen_len OR 2048,
      "temperature": request.temperature OR 0.7,
      "top_p": request.top_p OR 0.9
    }

    // Build HTTP request
    path <- format("/model/{}/invoke", request.model_id)
    http_request <- build_bedrock_request(
      method: POST,
      endpoint: self.endpoint,
      path: path,
      body: body,
      signer: self.signer
    )?

    // Execute with resilience
    response <- self.resilience.execute(|| {
      self.transport.send(http_request)
    }).await?

    // Parse response
    result <- parse_llama_response(response)?

    // Record metrics
    self.observability.metrics.record_counter("bedrock_requests_total", 1, {
      "model_family": "llama",
      "model_id": request.model_id,
      "status": "success"
    })

    span.end()
    RETURN Ok(result)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 9.3 LLaMA Streaming

```
FUNCTION llama_service.generate_stream(request: LlamaGenerateRequest) -> Result<LlamaStream, BedrockError>
  span <- self.observability.tracer.start_span("bedrock.llama.generate_stream")

  TRY
    // Build request body
    body <- {
      "prompt": request.prompt,
      "max_gen_len": request.max_gen_len OR 2048,
      "temperature": request.temperature OR 0.7,
      "top_p": request.top_p OR 0.9
    }

    // Use streaming endpoint
    path <- format("/model/{}/invoke-with-response-stream", request.model_id)
    http_request <- build_bedrock_request(
      method: POST,
      endpoint: self.endpoint,
      path: path,
      body: body,
      signer: self.signer
    )?

    // Execute streaming request
    response_stream <- self.transport.send_streaming(http_request).await?

    // Wrap in LLaMA-specific stream parser
    llama_stream <- LlamaStream::new(
      inner: BedrockEventStreamParser::new(response_stream),
      model_id: request.model_id,
      observability: self.observability.clone()
    )

    span.end()
    RETURN Ok(llama_stream)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial pseudocode (Part 1) |

---

**Continued in Part 2: Streaming Parser, Model Discovery, Error Handling, RuvVector Integration**
