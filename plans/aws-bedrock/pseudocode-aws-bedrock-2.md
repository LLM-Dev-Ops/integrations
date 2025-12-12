# AWS Bedrock Integration Module - Pseudocode (Part 2)

**SPARC Phase 2: Pseudocode**
**Version:** 1.0.0
**Date:** 2025-12-12
**Module:** `integrations/aws/bedrock`
**File:** 2 of 2 - Streaming, Discovery, Errors, RuvVector

---

## Table of Contents (Part 2)

10. [Bedrock Event Stream Parser](#10-bedrock-event-stream-parser)
11. [Model Discovery Service](#11-model-discovery-service)
12. [Error Handling](#12-error-handling)
13. [Request Building](#13-request-building)
14. [Response Parsing](#14-response-parsing)
15. [RuvVector Integration](#15-ruvvector-integration)
16. [Resilience Integration](#16-resilience-integration)

---

## 10. Bedrock Event Stream Parser

### 10.1 Event Stream Overview

AWS Bedrock uses the AWS Event Stream format (application/vnd.amazon.eventstream), not SSE. This requires a dedicated parser.

```
STRUCT BedrockEventStreamParser {
  inner_stream: ByteStream,
  buffer: ByteBuffer,
  state: ParserState,
  model_family: ModelFamily
}

ENUM ParserState {
  ReadingPrelude,
  ReadingHeaders,
  ReadingPayload,
  Complete
}
```

### 10.2 Event Stream Message Format

```
// AWS Event Stream message structure:
// - Prelude (8 bytes): total_length (4) + headers_length (4)
// - Prelude CRC (4 bytes)
// - Headers (variable): name-value pairs
// - Payload (variable): actual data
// - Message CRC (4 bytes)

STRUCT EventStreamMessage {
  total_length: u32,
  headers_length: u32,
  headers: HashMap<String, EventStreamHeaderValue>,
  payload: Bytes
}

ENUM EventStreamHeaderValue {
  Bool(bool),
  Byte(i8),
  Short(i16),
  Int(i32),
  Long(i64),
  Bytes(Bytes),
  String(String),
  Timestamp(DateTime),
  Uuid(Uuid)
}
```

### 10.3 Event Stream Parsing

```
FUNCTION BedrockEventStreamParser::next() -> Result<Option<BedrockStreamEvent>, BedrockError>
  // Read until we have a complete message
  WHILE true DO
    // Try to parse a message from the buffer
    message <- try_parse_message(self.buffer)?

    IF message IS Some THEN
      // Parse the payload based on headers
      event_type <- message.headers.get(":event-type")
      content_type <- message.headers.get(":content-type")

      MATCH event_type
        CASE Some("chunk"):
          payload <- parse_chunk_payload(message.payload, self.model_family)?
          RETURN Ok(Some(BedrockStreamEvent::Chunk(payload)))

        CASE Some("exception"):
          exception <- parse_exception_payload(message.payload)?
          RETURN Ok(Some(BedrockStreamEvent::Exception(exception)))

        CASE None:
          // End of stream marker
          IF message.payload.is_empty() THEN
            RETURN Ok(None)
          END IF
          // Unknown message type
          log_warning("Unknown event stream message", { headers: message.headers })
          CONTINUE

        CASE _:
          log_warning("Unexpected event type", { event_type })
          CONTINUE
      END MATCH

    ELSE
      // Need more data
      new_data <- self.inner_stream.read().await?
      IF new_data.is_empty() THEN
        // Stream ended
        RETURN Ok(None)
      END IF
      self.buffer.extend(new_data)
    END IF
  END WHILE
END FUNCTION

FUNCTION try_parse_message(buffer: &mut ByteBuffer) -> Result<Option<EventStreamMessage>, BedrockError>
  // Need at least 12 bytes for prelude + prelude CRC
  IF buffer.len() < 12 THEN
    RETURN Ok(None)
  END IF

  // Read prelude
  total_length <- buffer.read_u32_be(0)
  headers_length <- buffer.read_u32_be(4)

  // Validate lengths
  IF total_length > MAX_MESSAGE_SIZE THEN
    RETURN Error(BedrockError::Stream(StreamError::MessageTooLarge))
  END IF

  // Check if we have the complete message
  IF buffer.len() < total_length THEN
    RETURN Ok(None)
  END IF

  // Verify prelude CRC
  prelude_crc <- buffer.read_u32_be(8)
  calculated_prelude_crc <- crc32(buffer.slice(0, 8))
  IF prelude_crc != calculated_prelude_crc THEN
    RETURN Error(BedrockError::Stream(StreamError::CrcMismatch))
  END IF

  // Parse headers
  headers_start <- 12
  headers_end <- headers_start + headers_length
  headers <- parse_event_stream_headers(buffer.slice(headers_start, headers_end))?

  // Extract payload
  payload_start <- headers_end
  payload_end <- total_length - 4  // Exclude message CRC
  payload <- buffer.slice(payload_start, payload_end)

  // Verify message CRC
  message_crc <- buffer.read_u32_be(total_length - 4)
  calculated_message_crc <- crc32(buffer.slice(0, total_length - 4))
  IF message_crc != calculated_message_crc THEN
    RETURN Error(BedrockError::Stream(StreamError::CrcMismatch))
  END IF

  // Consume the message from buffer
  buffer.consume(total_length)

  RETURN Ok(Some(EventStreamMessage {
    total_length,
    headers_length,
    headers,
    payload
  }))
END FUNCTION
```

### 10.4 Model-Specific Chunk Parsing

```
FUNCTION parse_chunk_payload(payload: Bytes, family: ModelFamily) -> Result<StreamChunk, BedrockError>
  json <- json_parse(payload)?

  MATCH family
    CASE ModelFamily::Titan:
      RETURN parse_titan_chunk(json)

    CASE ModelFamily::Claude:
      RETURN parse_claude_chunk(json)

    CASE ModelFamily::Llama:
      RETURN parse_llama_chunk(json)

    CASE _:
      RETURN Error(BedrockError::Stream(StreamError::UnsupportedModelFamily))
  END MATCH
END FUNCTION

FUNCTION parse_titan_chunk(json: JsonValue) -> Result<StreamChunk, BedrockError>
  // Titan streaming format
  output_text <- json.get("outputText").as_string()?
  index <- json.get("index").as_u32() OR 0
  completion_reason <- json.get("completionReason").as_string()

  RETURN Ok(StreamChunk {
    text: output_text,
    index: index,
    is_final: completion_reason IS Some,
    finish_reason: completion_reason,
    usage: None
  })
END FUNCTION

FUNCTION parse_claude_chunk(json: JsonValue) -> Result<StreamChunk, BedrockError>
  // Claude via Bedrock streaming format
  chunk_type <- json.get("type").as_string()?

  MATCH chunk_type
    CASE "content_block_delta":
      delta <- json.get("delta")?
      text <- delta.get("text").as_string() OR ""
      RETURN Ok(StreamChunk {
        text: text,
        index: json.get("index").as_u32() OR 0,
        is_final: false,
        finish_reason: None,
        usage: None
      })

    CASE "message_delta":
      // Final chunk with usage
      stop_reason <- json.get("delta")?.get("stop_reason").as_string()
      usage <- json.get("usage").and_then(|u| {
        UsageInfo {
          output_tokens: u.get("output_tokens").as_u32()
        }
      })
      RETURN Ok(StreamChunk {
        text: "",
        index: 0,
        is_final: true,
        finish_reason: stop_reason,
        usage: usage
      })

    CASE "message_stop":
      RETURN Ok(StreamChunk {
        text: "",
        index: 0,
        is_final: true,
        finish_reason: Some("stop"),
        usage: None
      })

    CASE _:
      // Ignore other chunk types (message_start, content_block_start, etc.)
      RETURN Ok(StreamChunk {
        text: "",
        index: 0,
        is_final: false,
        finish_reason: None,
        usage: None
      })
  END MATCH
END FUNCTION

FUNCTION parse_llama_chunk(json: JsonValue) -> Result<StreamChunk, BedrockError>
  // LLaMA streaming format
  generation <- json.get("generation").as_string() OR ""
  stop_reason <- json.get("stop_reason").as_string()

  RETURN Ok(StreamChunk {
    text: generation,
    index: 0,
    is_final: stop_reason IS Some,
    finish_reason: stop_reason,
    usage: None
  })
END FUNCTION
```

---

## 11. Model Discovery Service

### 11.1 Model Discovery Implementation

```
STRUCT ModelDiscoveryServiceImpl {
  transport: HttpTransport,
  signer: AwsSigner,  // Uses 'bedrock' service, not 'bedrock-runtime'
  endpoint: String,   // Control plane endpoint
  resilience: ResilienceOrchestrator,
  observability: ObservabilityContext
}
```

### 11.2 List Foundation Models

```
FUNCTION model_discovery.list(params: Option<ListModelsParams>) -> Result<ModelList, BedrockError>
  span <- self.observability.tracer.start_span("bedrock.models.list")

  TRY
    // Build query parameters
    query_params <- HashMap::new()

    IF params IS Some THEN
      IF params.by_provider IS Some THEN
        query_params.insert("byProvider", params.by_provider)
      END IF
      IF params.by_output_modality IS Some THEN
        query_params.insert("byOutputModality", params.by_output_modality)
      END IF
      IF params.by_inference_type IS Some THEN
        query_params.insert("byInferenceType", params.by_inference_type)
      END IF
      IF params.by_customization_type IS Some THEN
        query_params.insert("byCustomizationType", params.by_customization_type)
      END IF
    END IF

    // Build request
    http_request <- build_bedrock_request(
      method: GET,
      endpoint: self.endpoint,
      path: "/foundation-models",
      query_params: IF query_params.is_empty() THEN None ELSE Some(query_params) END IF,
      body: None,
      signer: self.signer
    )?

    // Execute request
    response <- self.resilience.execute(|| {
      self.transport.send(http_request)
    }).await?

    // Parse response
    json <- json_parse(response.body)?
    models <- json.get("modelSummaries")?.as_array()?

    model_list <- []
    FOR EACH model_json IN models DO
      model_info <- ModelInfo {
        model_id: model_json.get("modelId").as_string()?,
        model_name: model_json.get("modelName").as_string()?,
        provider_name: model_json.get("providerName").as_string()?,
        input_modalities: model_json.get("inputModalities")?.as_string_array()?,
        output_modalities: model_json.get("outputModalities")?.as_string_array()?,
        response_streaming_supported: model_json.get("responseStreamingSupported").as_bool() OR false,
        customizations_supported: model_json.get("customizationsSupported")?.as_string_array() OR [],
        inference_types_supported: model_json.get("inferenceTypesSupported")?.as_string_array() OR []
      }
      model_list.push(model_info)
    END FOR

    span.end()
    RETURN Ok(ModelList { models: model_list })

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

### 11.3 Get Foundation Model

```
FUNCTION model_discovery.get(model_id: String) -> Result<ModelInfo, BedrockError>
  span <- self.observability.tracer.start_span("bedrock.models.get")
  span.set_attribute("bedrock.model_id", model_id)

  TRY
    // URL encode model ID (contains colons)
    encoded_model_id <- url_encode(model_id)
    path <- format("/foundation-models/{}", encoded_model_id)

    // Build request
    http_request <- build_bedrock_request(
      method: GET,
      endpoint: self.endpoint,
      path: path,
      body: None,
      signer: self.signer
    )?

    // Execute request
    response <- self.resilience.execute(|| {
      self.transport.send(http_request)
    }).await?

    // Check for 404
    IF response.status == 404 THEN
      RETURN Error(BedrockError::Model(ModelError::ModelNotFound {
        model_id: model_id
      }))
    END IF

    // Parse response
    json <- json_parse(response.body)?
    model_details <- json.get("modelDetails")?

    model_info <- ModelInfo {
      model_id: model_details.get("modelId").as_string()?,
      model_name: model_details.get("modelName").as_string()?,
      provider_name: model_details.get("providerName").as_string()?,
      input_modalities: model_details.get("inputModalities")?.as_string_array()?,
      output_modalities: model_details.get("outputModalities")?.as_string_array()?,
      response_streaming_supported: model_details.get("responseStreamingSupported").as_bool() OR false,
      customizations_supported: model_details.get("customizationsSupported")?.as_string_array() OR [],
      inference_types_supported: model_details.get("inferenceTypesSupported")?.as_string_array() OR []
    }

    span.end()
    RETURN Ok(model_info)

  CATCH error
    span.record_error(error)
    span.end()
    RETURN Error(error)
  END TRY
END FUNCTION
```

---

## 12. Error Handling

### 12.1 Error Type Definitions

```
ENUM BedrockError {
  Configuration(ConfigurationError),
  Authentication(AuthenticationError),
  Model(ModelError),
  Request(RequestError),
  RateLimit(RateLimitError),
  Server(ServerError),
  Stream(StreamError),
  Resource(ResourceError)
}

ENUM ConfigurationError {
  MissingRegion,
  InvalidCredentials { message: String },
  InvalidEndpoint { message: String },
  InvalidConfiguration { message: String }
}

ENUM AuthenticationError {
  CredentialsExpired,
  SignatureInvalid { message: String },
  AccessDenied { message: String }
}

ENUM ModelError {
  ModelNotFound { model_id: String },
  ModelNotEnabled { model_id: String, message: String },
  UnsupportedModel { model_id: String, message: String },
  ModelNotReady { model_id: String }
}

ENUM RequestError {
  ValidationError { message: String },
  PayloadTooLarge { size: usize, max: usize },
  InvalidInput { message: String },
  InvalidModel { expected: String, actual: String }
}

ENUM RateLimitError {
  ThrottlingException { retry_after: Option<Duration>, message: String },
  ServiceQuotaExceeded { message: String },
  TooManyRequests { message: String }
}

ENUM ServerError {
  InternalServerError { message: String, request_id: Option<String> },
  ServiceUnavailable { retry_after: Option<Duration>, message: String },
  ModelTimeout { message: String }
}

ENUM StreamError {
  StreamInterrupted { message: String },
  EventParseError { message: String },
  CrcMismatch,
  MessageTooLarge,
  UnsupportedModelFamily,
  IncompleteResponse
}

ENUM ResourceError {
  GuardrailNotFound { guardrail_id: String },
  RegionNotSupported { region: String }
}
```

### 12.2 Error Mapping from HTTP

```
FUNCTION map_bedrock_error(status: StatusCode, body: Bytes, headers: HeaderMap) -> BedrockError
  // Try to parse error body
  TRY
    error_json <- json_parse(body)?
    error_message <- error_json.get("message").as_string() OR "Unknown error"
    error_type <- error_json.get("__type").as_string()

    request_id <- headers.get("x-amzn-requestid")

    MATCH error_type
      // Validation errors
      CASE Some("ValidationException"):
        RETURN BedrockError::Request(RequestError::ValidationError {
          message: error_message
        })

      // Model errors
      CASE Some("ResourceNotFoundException"):
        IF error_message.contains("model") THEN
          RETURN BedrockError::Model(ModelError::ModelNotFound {
            model_id: extract_model_id(error_message)
          })
        ELSE
          RETURN BedrockError::Resource(ResourceError::GuardrailNotFound {
            guardrail_id: "unknown"
          })
        END IF

      CASE Some("AccessDeniedException"):
        IF error_message.contains("not enabled") OR error_message.contains("not authorized") THEN
          RETURN BedrockError::Model(ModelError::ModelNotEnabled {
            model_id: extract_model_id(error_message),
            message: error_message
          })
        ELSE
          RETURN BedrockError::Authentication(AuthenticationError::AccessDenied {
            message: error_message
          })
        END IF

      // Rate limit errors
      CASE Some("ThrottlingException"):
        retry_after <- parse_retry_after_from_headers(headers)
        RETURN BedrockError::RateLimit(RateLimitError::ThrottlingException {
          retry_after: retry_after,
          message: error_message
        })

      CASE Some("ServiceQuotaExceededException"):
        RETURN BedrockError::RateLimit(RateLimitError::ServiceQuotaExceeded {
          message: error_message
        })

      // Server errors
      CASE Some("InternalServerException"):
        RETURN BedrockError::Server(ServerError::InternalServerError {
          message: error_message,
          request_id: request_id
        })

      CASE Some("ServiceUnavailableException"):
        retry_after <- parse_retry_after_from_headers(headers)
        RETURN BedrockError::Server(ServerError::ServiceUnavailable {
          retry_after: retry_after,
          message: error_message
        })

      CASE Some("ModelTimeoutException"):
        RETURN BedrockError::Server(ServerError::ModelTimeout {
          message: error_message
        })

      CASE Some("ModelNotReadyException"):
        RETURN BedrockError::Model(ModelError::ModelNotReady {
          model_id: extract_model_id(error_message)
        })

      // Stream errors
      CASE Some("ModelStreamErrorException"):
        RETURN BedrockError::Stream(StreamError::StreamInterrupted {
          message: error_message
        })

      // Default
      CASE _:
        RETURN map_http_status_error(status, error_message, request_id)
    END MATCH

  CATCH JsonError
    RETURN map_http_status_error(status, String::from_utf8_lossy(body), None)
  END TRY
END FUNCTION

FUNCTION map_http_status_error(status: StatusCode, message: String, request_id: Option<String>) -> BedrockError
  MATCH status.as_u16()
    CASE 400:
      RETURN BedrockError::Request(RequestError::ValidationError { message })

    CASE 401, 403:
      RETURN BedrockError::Authentication(AuthenticationError::AccessDenied { message })

    CASE 404:
      RETURN BedrockError::Model(ModelError::ModelNotFound { model_id: "unknown" })

    CASE 429:
      RETURN BedrockError::RateLimit(RateLimitError::TooManyRequests { message })

    CASE 500:
      RETURN BedrockError::Server(ServerError::InternalServerError { message, request_id })

    CASE 503:
      RETURN BedrockError::Server(ServerError::ServiceUnavailable {
        retry_after: None,
        message
      })

    CASE _:
      RETURN BedrockError::Server(ServerError::InternalServerError { message, request_id })
  END MATCH
END FUNCTION
```

### 12.3 Retryable Error Detection

```
FUNCTION is_retryable(error: &BedrockError) -> bool
  MATCH error
    CASE BedrockError::RateLimit(_):
      RETURN true

    CASE BedrockError::Server(ServerError::InternalServerError { .. }):
      RETURN true

    CASE BedrockError::Server(ServerError::ServiceUnavailable { .. }):
      RETURN true

    CASE BedrockError::Server(ServerError::ModelTimeout { .. }):
      RETURN true

    CASE BedrockError::Model(ModelError::ModelNotReady { .. }):
      RETURN true

    CASE BedrockError::Stream(StreamError::StreamInterrupted { .. }):
      RETURN true

    CASE _:
      RETURN false
  END MATCH
END FUNCTION

FUNCTION get_retry_after(error: &BedrockError) -> Option<Duration>
  MATCH error
    CASE BedrockError::RateLimit(RateLimitError::ThrottlingException { retry_after, .. }):
      RETURN retry_after

    CASE BedrockError::Server(ServerError::ServiceUnavailable { retry_after, .. }):
      RETURN retry_after

    CASE _:
      RETURN None
  END MATCH
END FUNCTION
```

---

## 13. Request Building

### 13.1 Bedrock Request Builder

```
FUNCTION build_bedrock_request(
  method: HttpMethod,
  endpoint: String,
  path: String,
  query_params: Option<HashMap<String, String>>,
  body: Option<JsonValue>,
  signer: AwsSigner
) -> Result<HttpRequest, BedrockError>

  // Build URL
  url <- parse_url(endpoint)?
  url <- url.join(path)?

  IF query_params IS Some THEN
    FOR EACH (key, value) IN query_params DO
      url.query_pairs_mut().append_pair(key, value)
    END FOR
  END IF

  // Serialize body
  body_bytes <- IF body IS Some THEN
    json_serialize(body)?
  ELSE
    Bytes::new()
  END IF

  // Calculate payload hash
  payload_hash <- sha256_hex(body_bytes)

  // Build headers
  headers <- HeaderMap::new()
  headers.insert("Content-Type", "application/json")
  headers.insert("Accept", "application/json")
  headers.insert("X-Amz-Content-Sha256", payload_hash)

  IF body_bytes.len() > 0 THEN
    headers.insert("Content-Length", body_bytes.len().to_string())
  END IF

  // Build request
  request <- HttpRequest {
    method: method,
    url: url,
    headers: headers,
    body: IF body_bytes.len() > 0 THEN Some(body_bytes) ELSE None END IF,
    timeout: None
  }

  // Sign request (reuse aws/signing module)
  timestamp <- Utc::now()
  signer.sign_request(&mut request, payload_hash, timestamp)?

  RETURN Ok(request)
END FUNCTION
```

### 13.2 Request Validation

```
FUNCTION validate_titan_request(request: TitanGenerateRequest) -> Result<(), BedrockError>
  // Validate model ID
  IF NOT request.model_id.starts_with("amazon.titan") THEN
    RETURN Error(BedrockError::Request(RequestError::InvalidModel {
      expected: "amazon.titan*",
      actual: request.model_id
    }))
  END IF

  // Validate input text
  IF request.input_text.is_empty() THEN
    RETURN Error(BedrockError::Request(RequestError::ValidationError {
      message: "Input text is required"
    }))
  END IF

  // Validate token count
  IF request.text_generation_config.max_token_count > 4096 THEN
    RETURN Error(BedrockError::Request(RequestError::ValidationError {
      message: "Max token count cannot exceed 4096 for Titan models"
    }))
  END IF

  // Validate temperature
  IF request.text_generation_config.temperature IS Some THEN
    temp <- request.text_generation_config.temperature
    IF temp < 0.0 OR temp > 1.0 THEN
      RETURN Error(BedrockError::Request(RequestError::ValidationError {
        message: "Temperature must be between 0.0 and 1.0"
      }))
    END IF
  END IF

  RETURN Ok(())
END FUNCTION

FUNCTION validate_claude_request(request: ClaudeMessageRequest) -> Result<(), BedrockError>
  // Validate model ID
  IF NOT request.model_id.starts_with("anthropic.claude") THEN
    RETURN Error(BedrockError::Request(RequestError::InvalidModel {
      expected: "anthropic.claude*",
      actual: request.model_id
    }))
  END IF

  // Validate messages
  IF request.messages.is_empty() THEN
    RETURN Error(BedrockError::Request(RequestError::ValidationError {
      message: "At least one message is required"
    }))
  END IF

  // Validate max tokens
  IF request.max_tokens == 0 THEN
    RETURN Error(BedrockError::Request(RequestError::ValidationError {
      message: "Max tokens must be greater than 0"
    }))
  END IF

  IF request.max_tokens > 8192 THEN
    RETURN Error(BedrockError::Request(RequestError::ValidationError {
      message: "Max tokens cannot exceed 8192 for Claude via Bedrock"
    }))
  END IF

  RETURN Ok(())
END FUNCTION

FUNCTION validate_llama_request(request: LlamaGenerateRequest) -> Result<(), BedrockError>
  // Validate model ID
  IF NOT request.model_id.starts_with("meta.llama") THEN
    RETURN Error(BedrockError::Request(RequestError::InvalidModel {
      expected: "meta.llama*",
      actual: request.model_id
    }))
  END IF

  // Validate prompt
  IF request.prompt.is_empty() THEN
    RETURN Error(BedrockError::Request(RequestError::ValidationError {
      message: "Prompt is required"
    }))
  END IF

  RETURN Ok(())
END FUNCTION
```

---

## 14. Response Parsing

### 14.1 Titan Response Parsing

```
FUNCTION parse_titan_response(response: HttpResponse) -> Result<TitanGenerateResponse, BedrockError>
  // Check status
  IF NOT response.status.is_success() THEN
    RETURN Error(map_bedrock_error(response.status, response.body, response.headers))
  END IF

  // Parse JSON
  TRY
    json <- json_parse(response.body)?

    results <- json.get("results")?.as_array()?
    parsed_results <- []

    FOR EACH result IN results DO
      parsed_results.push(TitanGenerateResult {
        output_text: result.get("outputText").as_string()?,
        token_count: result.get("tokenCount").as_u32()?,
        completion_reason: result.get("completionReason").as_string()
      })
    END FOR

    // Extract token counts from headers
    input_token_count <- response.headers
      .get("x-amzn-bedrock-input-token-count")
      .and_then(parse_u32)
      OR 0

    output_token_count <- response.headers
      .get("x-amzn-bedrock-output-token-count")
      .and_then(parse_u32)
      OR parsed_results[0].token_count

    RETURN Ok(TitanGenerateResponse {
      results: parsed_results,
      input_token_count: input_token_count,
      model_id: "titan"  // Not in response
    })

  CATCH JsonError AS e
    RETURN Error(BedrockError::Stream(StreamError::EventParseError {
      message: e.to_string()
    }))
  END TRY
END FUNCTION
```

### 14.2 Claude Response Parsing

```
FUNCTION parse_claude_response(response: HttpResponse) -> Result<ClaudeMessageResponse, BedrockError>
  // Check status
  IF NOT response.status.is_success() THEN
    RETURN Error(map_bedrock_error(response.status, response.body, response.headers))
  END IF

  // Parse JSON
  TRY
    json <- json_parse(response.body)?

    // Parse content blocks
    content_array <- json.get("content")?.as_array()?
    content_blocks <- []

    FOR EACH block IN content_array DO
      block_type <- block.get("type").as_string()?
      MATCH block_type
        CASE "text":
          content_blocks.push(ClaudeContentBlock::Text {
            text: block.get("text").as_string()?
          })
        CASE "tool_use":
          content_blocks.push(ClaudeContentBlock::ToolUse {
            id: block.get("id").as_string()?,
            name: block.get("name").as_string()?,
            input: block.get("input")?.clone()
          })
      END MATCH
    END FOR

    // Parse usage
    usage_json <- json.get("usage")?
    usage <- ClaudeUsage {
      input_tokens: usage_json.get("input_tokens").as_u32()?,
      output_tokens: usage_json.get("output_tokens").as_u32()?
    }

    RETURN Ok(ClaudeMessageResponse {
      id: json.get("id").as_string()?,
      type_field: json.get("type").as_string()?,
      role: json.get("role").as_string()?,
      content: content_blocks,
      model: json.get("model").as_string()?,
      stop_reason: json.get("stop_reason").as_string(),
      stop_sequence: json.get("stop_sequence").as_string(),
      usage: usage
    })

  CATCH JsonError AS e
    RETURN Error(BedrockError::Stream(StreamError::EventParseError {
      message: e.to_string()
    }))
  END TRY
END FUNCTION
```

### 14.3 LLaMA Response Parsing

```
FUNCTION parse_llama_response(response: HttpResponse) -> Result<LlamaGenerateResponse, BedrockError>
  // Check status
  IF NOT response.status.is_success() THEN
    RETURN Error(map_bedrock_error(response.status, response.body, response.headers))
  END IF

  // Parse JSON
  TRY
    json <- json_parse(response.body)?

    // Extract token counts from headers
    prompt_token_count <- response.headers
      .get("x-amzn-bedrock-input-token-count")
      .and_then(parse_u32)
      OR json.get("prompt_token_count").as_u32() OR 0

    generation_token_count <- response.headers
      .get("x-amzn-bedrock-output-token-count")
      .and_then(parse_u32)
      OR json.get("generation_token_count").as_u32() OR 0

    RETURN Ok(LlamaGenerateResponse {
      generation: json.get("generation").as_string()?,
      prompt_token_count: prompt_token_count,
      generation_token_count: generation_token_count,
      stop_reason: json.get("stop_reason").as_string(),
      model_id: "llama"  // Not in response
    })

  CATCH JsonError AS e
    RETURN Error(BedrockError::Stream(StreamError::EventParseError {
      message: e.to_string()
    }))
  END TRY
END FUNCTION
```

---

## 15. RuvVector Integration

### 15.1 Embedding Storage

```
FUNCTION store_embedding_in_ruvvector(
  embedding: Vec<f32>,
  metadata: Option<EmbeddingMetadata>,
  ruvvector: &DatabaseConfig
) -> Result<String, BedrockError>

  // Connect to RuvVector (use shared database module)
  db <- RuvectorDatabase::connect(ruvvector).await?

  // Generate embedding ID
  embedding_id <- generate_uuid()

  // Prepare metadata JSON
  metadata_json <- IF metadata IS Some THEN
    json_serialize(metadata)?
  ELSE
    "{}"
  END IF

  // Insert embedding
  query <- "
    INSERT INTO embeddings (id, embedding, metadata, created_at)
    VALUES ($1, $2, $3, NOW())
    RETURNING id
  "

  result <- db.execute(query, [
    embedding_id,
    embedding,  // pgvector type
    metadata_json
  ]).await?

  db.release()

  RETURN Ok(embedding_id)
END FUNCTION
```

### 15.2 Embedding Retrieval

```
FUNCTION retrieve_similar_embeddings(
  query_embedding: Vec<f32>,
  limit: u32,
  threshold: Option<f32>,
  ruvvector: &DatabaseConfig
) -> Result<Vec<EmbeddingResult>, BedrockError>

  db <- RuvectorDatabase::connect(ruvvector).await?

  // Build similarity search query
  // Using cosine similarity with pgvector
  threshold_value <- threshold OR 0.8

  query <- "
    SELECT id, metadata, 1 - (embedding <=> $1) as similarity
    FROM embeddings
    WHERE 1 - (embedding <=> $1) >= $2
    ORDER BY embedding <=> $1
    LIMIT $3
  "

  rows <- db.query(query, [
    query_embedding,
    threshold_value,
    limit
  ]).await?

  results <- []
  FOR EACH row IN rows DO
    results.push(EmbeddingResult {
      id: row.get("id"),
      similarity: row.get("similarity"),
      metadata: json_parse(row.get("metadata"))
    })
  END FOR

  db.release()

  RETURN Ok(results)
END FUNCTION
```

### 15.3 State Persistence

```
FUNCTION persist_conversation_state(
  conversation_id: String,
  messages: Vec<Message>,
  ruvvector: &DatabaseConfig
) -> Result<(), BedrockError>

  db <- RuvectorDatabase::connect(ruvvector).await?

  // Serialize messages
  messages_json <- json_serialize(messages)?

  // Upsert conversation state
  query <- "
    INSERT INTO conversation_states (id, messages, updated_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (id) DO UPDATE SET
      messages = $2,
      updated_at = NOW()
  "

  db.execute(query, [
    conversation_id,
    messages_json
  ]).await?

  db.release()

  RETURN Ok(())
END FUNCTION

FUNCTION retrieve_conversation_state(
  conversation_id: String,
  ruvvector: &DatabaseConfig
) -> Result<Option<Vec<Message>>, BedrockError>

  db <- RuvectorDatabase::connect(ruvvector).await?

  query <- "
    SELECT messages FROM conversation_states
    WHERE id = $1
  "

  row <- db.query_one(query, [conversation_id]).await

  IF row IS None THEN
    db.release()
    RETURN Ok(None)
  END IF

  messages <- json_parse(row.get("messages"))?
  db.release()

  RETURN Ok(Some(messages))
END FUNCTION
```

---

## 16. Resilience Integration

### 16.1 Resilience Orchestrator Usage

```
// Delegates to shared/resilience module
FUNCTION create_resilience_orchestrator(config: ResilienceConfig) -> ResilienceOrchestrator
  // Use shared resilience primitive
  retry_executor <- create_retry_executor(config.retry)
  circuit_breaker <- create_circuit_breaker(config.circuit_breaker)
  rate_limiter <- IF config.rate_limiter IS Some THEN
    Some(create_rate_limiter(config.rate_limiter))
  ELSE
    None
  END IF

  RETURN ResilienceOrchestrator {
    retry_executor,
    circuit_breaker,
    rate_limiter
  }
END FUNCTION
```

### 16.2 Resilient Execution

```
FUNCTION resilience.execute<T>(
  operation: FnOnce() -> Result<T, BedrockError>
) -> Result<T, BedrockError>

  // Step 1: Check rate limiter
  IF self.rate_limiter IS Some THEN
    self.rate_limiter.acquire().await?
  END IF

  // Step 2: Check circuit breaker
  IF NOT self.circuit_breaker.is_available() THEN
    RETURN Error(BedrockError::RateLimit(RateLimitError::ThrottlingException {
      retry_after: Some(self.circuit_breaker.reset_timeout()),
      message: "Circuit breaker is open"
    }))
  END IF

  // Step 3: Execute with retry
  result <- self.retry_executor.execute(|| {
    TRY
      response <- operation()

      // Record success for circuit breaker
      self.circuit_breaker.record_success()

      RETURN Ok(response)

    CATCH error
      // Check if retryable
      IF is_retryable(error) THEN
        // Record failure for circuit breaker
        self.circuit_breaker.record_failure()

        // Get retry delay
        retry_after <- get_retry_after(error)
        IF retry_after IS Some THEN
          sleep(retry_after).await
        END IF

        RETURN Error(error)  // Will be retried
      ELSE
        // Non-retryable error
        RETURN Error(error)
      END IF
    END TRY
  }).await

  RETURN result
END FUNCTION
```

### 16.3 Bedrock-Specific Retry Configuration

```
CONST DEFAULT_RETRY_CONFIG <- RetryConfig {
  max_retries: 3,
  initial_backoff: 500ms,
  max_backoff: 60s,
  backoff_multiplier: 2.0,
  jitter: 0.1,
  retryable_errors: [
    "ThrottlingException",
    "ServiceUnavailable",
    "InternalServerError",
    "ModelTimeout",
    "ModelNotReady"
  ]
}

CONST DEFAULT_CB_CONFIG <- CircuitBreakerConfig {
  failure_threshold: 5,
  success_threshold: 3,
  failure_window: 60s,
  reset_timeout: 30s
}
```

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-12 | SPARC Generator | Initial pseudocode (Part 2) |

---

**End of Pseudocode Phase**

*Next: Architecture phase will define component structure, module organization, and data flow diagrams.*
