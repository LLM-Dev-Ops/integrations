# SPARC Pseudocode: Google Gemini Integration Module

**Part 2 of 3: Services (Content Generation, Embeddings, Models)**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/gemini`

---

## Table of Contents

1. [Service Base Architecture](#1-service-base-architecture)
2. [Content Generation Service](#2-content-generation-service)
3. [Embeddings Service](#3-embeddings-service)
4. [Models Service](#4-models-service)
5. [Token Counting Service](#5-token-counting-service)

---

## 1. Service Base Architecture

### 1.1 Base Service Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BASE SERVICE                                         │
├─────────────────────────────────────────────────────────────────────────────┤

// All services share this common infrastructure
STRUCTURE BaseService:
    transport: Arc<dyn HttpTransport>           [MOCK]
    auth_manager: Arc<dyn AuthProvider>         [MOCK]
    resilience: Arc<ResilienceOrchestrator>     [MOCK]
    request_builder: RequestBuilder
    response_parser: ResponseParser
    config: GeminiConfig
    logger: Arc<dyn Logger>                     [MOCK]
    tracer: Arc<dyn Tracer>                     [MOCK]
    metrics: Arc<dyn MetricsRecorder>           [MOCK]

[TEST:unit]
FUNCTION BaseService::new(
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthProvider>,
    resilience: Arc<ResilienceOrchestrator>,
    config: GeminiConfig,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
    metrics: Arc<dyn MetricsRecorder>
) -> Self:
    LET request_builder = RequestBuilder::new(
        config.base_url.clone(),
        config.api_version.clone(),
        Arc::clone(&auth_manager)
    )

    RETURN BaseService {
        transport,
        auth_manager,
        resilience,
        request_builder,
        response_parser: ResponseParser::new(),
        config,
        logger,
        tracer,
        metrics
    }

└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Request Execution Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REQUEST EXECUTION PATTERN                                │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit]
FUNCTION BaseService::execute_request<T: DeserializeOwned>(
    &self,
    method: HttpMethod,
    path: &str,
    body: Option<&impl Serialize>,
    context: &RequestContext
) -> Result<T, GeminiError>:

    // 1. Start trace span
    LET span = self.tracer.start_span("gemini.request", context)
    span.set_attribute("http.method", method.to_string())
    span.set_attribute("http.path", path)

    // 2. Record request metric
    self.metrics.increment("gemini.requests.total", &[
        ("method", method.to_string()),
        ("path", path)
    ])

    LET start_time = Instant::now()

    TRY:
        // 3. Build request
        LET request = self.request_builder.build_request(
            method,
            path,
            body,
            None
        )?

        self.logger.debug("Executing request", {
            method: method,
            path: path,
            has_body: body.is_some()
        })

        // 4. Execute with resilience (retry, circuit breaker, rate limit)
        LET response = AWAIT self.resilience.execute(
            || async {
                AWAIT self.transport.send(request.clone())
                    .map_err(|e| GeminiError::from(e))
            },
            context
        )?

        // 5. Update rate limits from response headers
        self.resilience.update_from_response_headers(&response.headers)

        // 6. Parse response
        LET result: T = ResponseParser::parse_response(&response)?

        // 7. Record success metrics
        LET latency = start_time.elapsed()
        self.metrics.record_histogram("gemini.request.duration_ms", latency.as_millis(), &[
            ("method", method.to_string()),
            ("path", path),
            ("status", "success")
        ])

        span.set_status(SpanStatus::Ok)
        span.end()

        self.logger.debug("Request completed", {
            method: method,
            path: path,
            latency_ms: latency.as_millis()
        })

        RETURN Ok(result)

    CATCH GeminiError AS e:
        // Record failure metrics
        LET latency = start_time.elapsed()
        self.metrics.record_histogram("gemini.request.duration_ms", latency.as_millis(), &[
            ("method", method.to_string()),
            ("path", path),
            ("status", "error"),
            ("error_type", e.error_type())
        ])
        self.metrics.increment("gemini.requests.errors", &[
            ("error_type", e.error_type())
        ])

        span.set_status(SpanStatus::Error(e.to_string()))
        span.end()

        self.logger.error("Request failed", {
            method: method,
            path: path,
            error: e.to_string(),
            latency_ms: latency.as_millis()
        })

        RETURN Err(e)

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Content Generation Service

### 2.1 ContentService Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONTENT SERVICE                                        │
├─────────────────────────────────────────────────────────────────────────────┤

[INTERFACE]
STRUCTURE ContentService:
    base: BaseService
    default_model: String
    default_generation_config: Option<GenerationConfig>
    default_safety_settings: Vec<SafetySetting>

[TEST:unit]
FUNCTION ContentService::new(
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthProvider>,
    resilience: Arc<ResilienceOrchestrator>,
    config: GeminiConfig,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
    metrics: Arc<dyn MetricsRecorder>
) -> Self:
    RETURN ContentService {
        base: BaseService::new(transport, auth_manager, resilience, config, logger, tracer, metrics),
        default_model: "gemini-1.5-pro".to_string(),
        default_generation_config: None,
        default_safety_settings: Vec::new()
    }

[TEST:unit]
FUNCTION ContentService::with_defaults(
    self,
    model: String,
    generation_config: GenerationConfig,
    safety_settings: Vec<SafetySetting>
) -> Self:
    self.default_model = model
    self.default_generation_config = Some(generation_config)
    self.default_safety_settings = safety_settings
    RETURN self

└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Generate Content

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     GENERATE CONTENT                                        │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION ContentService::generate_content(
    &self,
    request: GenerateContentRequest
) -> Result<GenerateContentResponse, GeminiError>:

    // 1. Validate request
    Self::validate_generate_request(&request)?

    // 2. Resolve model
    LET model = request.model.as_ref()
        .unwrap_or(&self.default_model)

    // 3. Build endpoint path
    LET path = endpoints::generate_content(model)

    // 4. Merge with defaults
    LET request_body = GenerateContentRequestBody {
        contents: request.contents,
        generation_config: request.generation_config
            .or(self.default_generation_config.clone()),
        safety_settings: IF request.safety_settings.is_empty() THEN
            self.default_safety_settings.clone()
        ELSE
            request.safety_settings
        END,
        tools: request.tools,
        tool_config: request.tool_config,
        system_instruction: request.system_instruction,
        cached_content: request.cached_content
    }

    // 5. Create request context for tracing
    LET context = RequestContext::new()
        .with_operation("generateContent")
        .with_model(model)

    // 6. Execute request
    LET response: GenerateContentResponse = AWAIT self.base.execute_request(
        HttpMethod::POST,
        &path,
        Some(&request_body),
        &context
    )?

    // 7. Check for content safety blocks
    IF LET Some(feedback) = &response.prompt_feedback:
        IF feedback.block_reason.is_some() THEN:
            RETURN Err(GeminiError::ContentBlockedError {
                reason: feedback.block_reason.clone(),
                safety_ratings: feedback.safety_ratings.clone()
            })

    // 8. Log usage statistics
    IF LET Some(metadata) = &response.usage_metadata:
        self.base.logger.info("Content generated", {
            model: model,
            prompt_tokens: metadata.prompt_token_count,
            candidate_tokens: metadata.candidates_token_count,
            total_tokens: metadata.total_token_count
        })

        self.base.metrics.record_histogram(
            "gemini.tokens.prompt",
            metadata.prompt_token_count,
            &[("model", model)]
        )
        self.base.metrics.record_histogram(
            "gemini.tokens.completion",
            metadata.candidates_token_count,
            &[("model", model)]
        )

    RETURN Ok(response)

[TEST:unit]
FUNCTION ContentService::validate_generate_request(
    request: &GenerateContentRequest
) -> Result<(), GeminiError>:
    // Contents is required
    IF request.contents.is_empty() THEN:
        RETURN Err(GeminiError::RequestError {
            kind: RequestErrorKind::ValidationError,
            message: "At least one content item is required",
            param: Some("contents".to_string())
        })

    // Validate each content part
    FOR content IN &request.contents:
        IF content.parts.is_empty() THEN:
            RETURN Err(GeminiError::RequestError {
                kind: RequestErrorKind::ValidationError,
                message: "Content must have at least one part",
                param: Some("contents.parts".to_string())
            })

        FOR part IN &content.parts:
            Self::validate_part(part)?

    // Validate generation config if present
    IF LET Some(config) = &request.generation_config:
        Self::validate_generation_config(config)?

    // Validate tool config if present
    IF LET Some(tool_config) = &request.tool_config:
        IF request.tools.is_none() OR request.tools.as_ref().unwrap().is_empty() THEN:
            RETURN Err(GeminiError::RequestError {
                kind: RequestErrorKind::ValidationError,
                message: "tool_config requires tools to be specified",
                param: Some("tool_config".to_string())
            })

    RETURN Ok(())

[TEST:unit]
FUNCTION ContentService::validate_part(part: &Part) -> Result<(), GeminiError>:
    MATCH part:
        Part::Text(text) => {
            // Text can be empty but not None
            RETURN Ok(())
        },
        Part::InlineData(data) => {
            // Validate MIME type
            IF NOT is_supported_mime_type(&data.mime_type) THEN:
                RETURN Err(GeminiError::RequestError {
                    kind: RequestErrorKind::UnsupportedMediaType,
                    message: format!("Unsupported MIME type: {}", data.mime_type),
                    param: Some("inline_data.mime_type".to_string())
                })

            // Validate data is base64
            IF data.data.is_empty() THEN:
                RETURN Err(GeminiError::RequestError {
                    kind: RequestErrorKind::ValidationError,
                    message: "Inline data cannot be empty",
                    param: Some("inline_data.data".to_string())
                })
        },
        Part::FileData(file) => {
            // Validate file URI format
            IF NOT file.file_uri.starts_with("https://") THEN:
                RETURN Err(GeminiError::RequestError {
                    kind: RequestErrorKind::ValidationError,
                    message: "File URI must be an HTTPS URL",
                    param: Some("file_data.file_uri".to_string())
                })
        },
        Part::FunctionCall(call) => {
            IF call.name.is_empty() THEN:
                RETURN Err(GeminiError::RequestError {
                    kind: RequestErrorKind::ValidationError,
                    message: "Function call must have a name",
                    param: Some("function_call.name".to_string())
                })
        },
        Part::FunctionResponse(response) => {
            IF response.name.is_empty() THEN:
                RETURN Err(GeminiError::RequestError {
                    kind: RequestErrorKind::ValidationError,
                    message: "Function response must have a name",
                    param: Some("function_response.name".to_string())
                })
        }

    RETURN Ok(())

[TEST:unit]
FUNCTION ContentService::validate_generation_config(
    config: &GenerationConfig
) -> Result<(), GeminiError>:
    // Temperature validation
    IF LET Some(temp) = config.temperature:
        IF temp < 0.0 OR temp > 2.0 THEN:
            RETURN Err(GeminiError::RequestError {
                kind: RequestErrorKind::ValidationError,
                message: "Temperature must be between 0.0 and 2.0",
                param: Some("generation_config.temperature".to_string())
            })

    // Top P validation
    IF LET Some(top_p) = config.top_p:
        IF top_p < 0.0 OR top_p > 1.0 THEN:
            RETURN Err(GeminiError::RequestError {
                kind: RequestErrorKind::ValidationError,
                message: "Top P must be between 0.0 and 1.0",
                param: Some("generation_config.top_p".to_string())
            })

    // Top K validation
    IF LET Some(top_k) = config.top_k:
        IF top_k < 1 THEN:
            RETURN Err(GeminiError::RequestError {
                kind: RequestErrorKind::ValidationError,
                message: "Top K must be at least 1",
                param: Some("generation_config.top_k".to_string())
            })

    // Max output tokens validation
    IF LET Some(max_tokens) = config.max_output_tokens:
        IF max_tokens < 1 THEN:
            RETURN Err(GeminiError::RequestError {
                kind: RequestErrorKind::ValidationError,
                message: "Max output tokens must be at least 1",
                param: Some("generation_config.max_output_tokens".to_string())
            })

    // Candidate count validation
    IF LET Some(count) = config.candidate_count:
        IF count < 1 OR count > 8 THEN:
            RETURN Err(GeminiError::RequestError {
                kind: RequestErrorKind::ValidationError,
                message: "Candidate count must be between 1 and 8",
                param: Some("generation_config.candidate_count".to_string())
            })

    RETURN Ok(())

└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Generate Content Streaming

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  GENERATE CONTENT STREAMING                                 │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION ContentService::generate_content_stream(
    &self,
    request: GenerateContentRequest
) -> Result<impl Stream<Item = Result<GenerateContentChunk, GeminiError>>, GeminiError>:

    // 1. Validate request
    Self::validate_generate_request(&request)?

    // 2. Resolve model
    LET model = request.model.as_ref()
        .unwrap_or(&self.default_model)

    // 3. Build streaming endpoint path
    LET path = endpoints::stream_generate_content(model)

    // 4. Build request body (same as non-streaming)
    LET request_body = GenerateContentRequestBody {
        contents: request.contents,
        generation_config: request.generation_config
            .or(self.default_generation_config.clone()),
        safety_settings: IF request.safety_settings.is_empty() THEN
            self.default_safety_settings.clone()
        ELSE
            request.safety_settings
        END,
        tools: request.tools,
        tool_config: request.tool_config,
        system_instruction: request.system_instruction,
        cached_content: request.cached_content
    }

    // 5. Build HTTP request
    LET http_request = self.base.request_builder.build_streaming_request(
        &path,
        &request_body
    )?

    // 6. Create request context
    LET context = RequestContext::new()
        .with_operation("streamGenerateContent")
        .with_model(model)

    // 7. Start trace span
    LET span = self.base.tracer.start_span("gemini.stream", &context)

    // 8. Execute streaming request through resilience layer
    LET byte_stream = AWAIT self.base.resilience.execute(
        || async {
            AWAIT self.base.transport.send_streaming(http_request.clone())
                .map_err(|e| GeminiError::from(e))
        },
        &context
    )?

    // 9. Create chunked JSON parser
    // Note: Gemini uses newline-delimited JSON, NOT SSE
    LET chunk_stream = GeminiChunkParser::new(
        byte_stream,
        Arc::clone(&self.base.logger),
        span
    )

    RETURN Ok(chunk_stream)

└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Chunked JSON Stream Parser

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   CHUNKED JSON PARSER                                       │
├─────────────────────────────────────────────────────────────────────────────┤

// Gemini streams JSON objects separated by newlines, wrapped in an array
// Format: [{"candidates":[...]},\n{"candidates":[...]},\n...{"candidates":[...]}]

STRUCTURE GeminiChunkParser:
    byte_stream: ByteStream
    buffer: String
    logger: Arc<dyn Logger>
    span: Span
    chunk_count: usize
    total_bytes: usize
    started: bool           // Track if we've seen opening bracket
    finished: bool          // Track if we've seen closing bracket

[TEST:unit]
FUNCTION GeminiChunkParser::new(
    byte_stream: ByteStream,
    logger: Arc<dyn Logger>,
    span: Span
) -> Self:
    RETURN GeminiChunkParser {
        byte_stream,
        buffer: String::new(),
        logger,
        span,
        chunk_count: 0,
        total_bytes: 0,
        started: false,
        finished: false
    }

IMPL Stream FOR GeminiChunkParser:
    TYPE Item = Result<GenerateContentChunk, GeminiError>

    [ASYNC]
    FUNCTION poll_next(&mut self, cx: &mut Context) -> Poll<Option<Self::Item>>:
        // If we've finished parsing, return None
        IF self.finished THEN:
            RETURN Poll::Ready(None)

        LOOP:
            // Try to extract complete JSON object from buffer
            IF LET Some(chunk) = self.try_parse_chunk() THEN:
                self.chunk_count += 1
                self.span.add_event("chunk_parsed", &[("chunk_num", self.chunk_count)])
                RETURN Poll::Ready(Some(Ok(chunk)))

            // Need more data - poll the byte stream
            MATCH self.byte_stream.poll_next(cx):
                Poll::Ready(Some(Ok(bytes))) => {
                    self.total_bytes += bytes.len()
                    LET text = String::from_utf8_lossy(&bytes)
                    self.buffer.push_str(&text)
                },
                Poll::Ready(Some(Err(e))) => {
                    self.logger.error("Stream error", { error: e.to_string() })
                    RETURN Poll::Ready(Some(Err(GeminiError::ResponseError {
                        kind: ResponseErrorKind::StreamInterrupted,
                        message: format!("Stream error: {}", e),
                        body_preview: None
                    })))
                },
                Poll::Ready(None) => {
                    // Stream ended - check for remaining buffer
                    IF NOT self.buffer.trim().is_empty() THEN:
                        IF LET Some(chunk) = self.try_parse_remaining() THEN:
                            self.finished = true
                            RETURN Poll::Ready(Some(Ok(chunk)))
                        ELSE:
                            self.logger.warn("Unparsed data in buffer at stream end", {
                                remaining: self.buffer.len()
                            })

                    self.span.set_attribute("chunks_received", self.chunk_count)
                    self.span.set_attribute("total_bytes", self.total_bytes)
                    self.span.end()
                    RETURN Poll::Ready(None)
                },
                Poll::Pending => {
                    RETURN Poll::Pending
                }

[TEST:unit]
FUNCTION GeminiChunkParser::try_parse_chunk(&mut self) -> Option<GenerateContentChunk>:
    // Skip whitespace and array markers
    LET trimmed = self.buffer.trim_start()

    // Handle array opening bracket
    IF NOT self.started THEN:
        IF trimmed.starts_with('[') THEN:
            self.started = true
            self.buffer = trimmed[1..].to_string()
            RETURN self.try_parse_chunk()  // Recurse to get first chunk
        ELSE IF trimmed.is_empty() THEN:
            RETURN None
        ELSE:
            // No array wrapper - try direct object parsing
            self.started = true

    // Handle array closing bracket
    IF trimmed.starts_with(']') THEN:
        self.finished = true
        RETURN None

    // Skip commas between array elements
    IF trimmed.starts_with(',') THEN:
        self.buffer = trimmed[1..].to_string()
        RETURN self.try_parse_chunk()

    // Find complete JSON object
    LET (json_str, remaining) = self.extract_json_object(trimmed)?

    // Update buffer
    self.buffer = remaining.to_string()

    // Parse JSON object
    MATCH serde_json::from_str::<GenerateContentChunk>(&json_str):
        Ok(chunk) => Some(chunk),
        Err(e) => {
            self.logger.warn("Failed to parse chunk", {
                error: e.to_string(),
                json_preview: truncate_string(&json_str, 200)
            })
            None
        }

[TEST:unit]
FUNCTION GeminiChunkParser::extract_json_object(&self, input: &str) -> Option<(&str, &str)>:
    // Track brace nesting to find complete JSON object
    IF NOT input.starts_with('{') THEN:
        RETURN None

    LET mut depth = 0
    LET mut in_string = false
    LET mut escape_next = false

    FOR (i, ch) IN input.char_indices():
        IF escape_next THEN:
            escape_next = false
            CONTINUE

        MATCH ch:
            '\\' => IF in_string THEN escape_next = true,
            '"' => in_string = NOT in_string,
            '{' => IF NOT in_string THEN depth += 1,
            '}' => IF NOT in_string THEN {
                depth -= 1
                IF depth == 0 THEN:
                    LET json_str = &input[..=i]
                    LET remaining = &input[i+1..]
                    RETURN Some((json_str, remaining))
            }

    // Incomplete JSON object
    RETURN None

[TEST:unit]
FUNCTION GeminiChunkParser::try_parse_remaining(&mut self) -> Option<GenerateContentChunk>:
    // Handle any remaining complete object in buffer
    LET trimmed = self.buffer.trim()

    // Remove trailing bracket if present
    LET content = IF trimmed.ends_with(']') THEN:
        trimmed[..trimmed.len()-1].trim_end_matches(',').trim()
    ELSE:
        trimmed

    IF content.is_empty() THEN:
        RETURN None

    MATCH serde_json::from_str::<GenerateContentChunk>(content):
        Ok(chunk) => Some(chunk),
        Err(_) => None

└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.5 Content Generation Request/Response Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  CONTENT GENERATION TYPES                                   │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE GenerateContentRequest:
    model: Option<String>
    contents: Vec<Content>
    generation_config: Option<GenerationConfig>
    safety_settings: Vec<SafetySetting>
    tools: Option<Vec<Tool>>
    tool_config: Option<ToolConfig>
    system_instruction: Option<Content>
    cached_content: Option<String>

STRUCTURE Content:
    role: Option<String>                // "user", "model", "function"
    parts: Vec<Part>

ENUM Part:
    Text { text: String }
    InlineData { mime_type: String, data: String }  // Base64
    FileData { mime_type: Option<String>, file_uri: String }
    FunctionCall { name: String, args: Map<String, Value> }
    FunctionResponse { name: String, response: Value }

STRUCTURE GenerationConfig:
    temperature: Option<f32>            // 0.0 to 2.0
    top_p: Option<f32>                  // 0.0 to 1.0
    top_k: Option<i32>                  // >= 1
    max_output_tokens: Option<i32>
    candidate_count: Option<i32>        // 1 to 8
    stop_sequences: Option<Vec<String>>
    presence_penalty: Option<f32>
    frequency_penalty: Option<f32>
    response_mime_type: Option<String>
    response_schema: Option<Schema>

STRUCTURE SafetySetting:
    category: HarmCategory
    threshold: HarmBlockThreshold

ENUM HarmCategory:
    HarmCategoryUnspecified
    HarmCategoryHateSpeech
    HarmCategoryDangerousContent
    HarmCategorySexuallyExplicit
    HarmCategoryHarassment

ENUM HarmBlockThreshold:
    BlockNone
    BlockLowAndAbove
    BlockMediumAndAbove
    BlockOnlyHigh

STRUCTURE Tool:
    function_declarations: Option<Vec<FunctionDeclaration>>
    code_execution: Option<CodeExecution>

STRUCTURE FunctionDeclaration:
    name: String
    description: Option<String>
    parameters: Option<Schema>

STRUCTURE Schema:
    type_: SchemaType
    format: Option<String>
    description: Option<String>
    enum_values: Option<Vec<String>>
    properties: Option<Map<String, Schema>>
    required: Option<Vec<String>>
    items: Option<Box<Schema>>

STRUCTURE GenerateContentResponse:
    candidates: Option<Vec<Candidate>>
    prompt_feedback: Option<PromptFeedback>
    usage_metadata: Option<UsageMetadata>

STRUCTURE Candidate:
    content: Content
    finish_reason: Option<FinishReason>
    safety_ratings: Option<Vec<SafetyRating>>
    citation_metadata: Option<CitationMetadata>
    token_count: Option<i32>
    grounding_attributions: Option<Vec<GroundingAttribution>>
    index: i32

ENUM FinishReason:
    FinishReasonUnspecified
    Stop
    MaxTokens
    Safety
    Recitation
    Other

STRUCTURE UsageMetadata:
    prompt_token_count: i32
    candidates_token_count: i32
    total_token_count: i32

STRUCTURE GenerateContentChunk:
    candidates: Option<Vec<Candidate>>
    prompt_feedback: Option<PromptFeedback>
    usage_metadata: Option<UsageMetadata>

└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.6 Request Builder for Content Generation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                CONTENT REQUEST BUILDER                                      │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE GenerateContentRequestBuilder:
    model: Option<String>
    contents: Vec<Content>
    generation_config: Option<GenerationConfig>
    safety_settings: Vec<SafetySetting>
    tools: Option<Vec<Tool>>
    tool_config: Option<ToolConfig>
    system_instruction: Option<Content>
    cached_content: Option<String>

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::new() -> Self:
    RETURN GenerateContentRequestBuilder {
        model: None,
        contents: Vec::new(),
        generation_config: None,
        safety_settings: Vec::new(),
        tools: None,
        tool_config: None,
        system_instruction: None,
        cached_content: None
    }

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::model(self, model: &str) -> Self:
    self.model = Some(model.to_string())
    RETURN self

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::add_text(self, role: &str, text: &str) -> Self:
    self.contents.push(Content {
        role: Some(role.to_string()),
        parts: vec![Part::Text { text: text.to_string() }]
    })
    RETURN self

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::add_user_text(self, text: &str) -> Self:
    RETURN self.add_text("user", text)

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::add_model_text(self, text: &str) -> Self:
    RETURN self.add_text("model", text)

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::add_image(
    self,
    mime_type: &str,
    base64_data: &str
) -> Self:
    // Add to last content if it's user role, otherwise create new
    IF self.contents.last().map(|c| c.role.as_deref()) == Some(Some("user")) THEN:
        self.contents.last_mut().unwrap().parts.push(
            Part::InlineData {
                mime_type: mime_type.to_string(),
                data: base64_data.to_string()
            }
        )
    ELSE:
        self.contents.push(Content {
            role: Some("user".to_string()),
            parts: vec![Part::InlineData {
                mime_type: mime_type.to_string(),
                data: base64_data.to_string()
            }]
        })

    RETURN self

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::add_file(
    self,
    file_uri: &str,
    mime_type: Option<&str>
) -> Self:
    self.contents.push(Content {
        role: Some("user".to_string()),
        parts: vec![Part::FileData {
            mime_type: mime_type.map(String::from),
            file_uri: file_uri.to_string()
        }]
    })
    RETURN self

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::temperature(self, temp: f32) -> Self:
    self.generation_config.get_or_insert_default().temperature = Some(temp)
    RETURN self

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::max_tokens(self, tokens: i32) -> Self:
    self.generation_config.get_or_insert_default().max_output_tokens = Some(tokens)
    RETURN self

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::top_p(self, p: f32) -> Self:
    self.generation_config.get_or_insert_default().top_p = Some(p)
    RETURN self

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::top_k(self, k: i32) -> Self:
    self.generation_config.get_or_insert_default().top_k = Some(k)
    RETURN self

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::stop_sequences(self, sequences: Vec<String>) -> Self:
    self.generation_config.get_or_insert_default().stop_sequences = Some(sequences)
    RETURN self

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::json_response(self) -> Self:
    self.generation_config.get_or_insert_default().response_mime_type =
        Some("application/json".to_string())
    RETURN self

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::json_schema(self, schema: Schema) -> Self:
    LET config = self.generation_config.get_or_insert_default()
    config.response_mime_type = Some("application/json".to_string())
    config.response_schema = Some(schema)
    RETURN self

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::safety_setting(
    self,
    category: HarmCategory,
    threshold: HarmBlockThreshold
) -> Self:
    self.safety_settings.push(SafetySetting { category, threshold })
    RETURN self

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::add_function(
    self,
    name: &str,
    description: &str,
    parameters: Schema
) -> Self:
    LET function = FunctionDeclaration {
        name: name.to_string(),
        description: Some(description.to_string()),
        parameters: Some(parameters)
    }

    IF self.tools.is_none() THEN:
        self.tools = Some(vec![Tool {
            function_declarations: Some(vec![function]),
            code_execution: None
        }])
    ELSE:
        LET tool = self.tools.as_mut().unwrap().first_mut().unwrap()
        tool.function_declarations.get_or_insert_default().push(function)

    RETURN self

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::system_instruction(self, instruction: &str) -> Self:
    self.system_instruction = Some(Content {
        role: None,
        parts: vec![Part::Text { text: instruction.to_string() }]
    })
    RETURN self

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::cached_content(self, name: &str) -> Self:
    self.cached_content = Some(name.to_string())
    RETURN self

[TEST:unit]
FUNCTION GenerateContentRequestBuilder::build(self) -> GenerateContentRequest:
    RETURN GenerateContentRequest {
        model: self.model,
        contents: self.contents,
        generation_config: self.generation_config,
        safety_settings: self.safety_settings,
        tools: self.tools,
        tool_config: self.tool_config,
        system_instruction: self.system_instruction,
        cached_content: self.cached_content
    }

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Embeddings Service

### 3.1 EmbeddingsService Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     EMBEDDINGS SERVICE                                      │
├─────────────────────────────────────────────────────────────────────────────┤

[INTERFACE]
STRUCTURE EmbeddingsService:
    base: BaseService
    default_model: String
    default_task_type: Option<TaskType>

[TEST:unit]
FUNCTION EmbeddingsService::new(
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthProvider>,
    resilience: Arc<ResilienceOrchestrator>,
    config: GeminiConfig,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
    metrics: Arc<dyn MetricsRecorder>
) -> Self:
    RETURN EmbeddingsService {
        base: BaseService::new(transport, auth_manager, resilience, config, logger, tracer, metrics),
        default_model: "text-embedding-004".to_string(),
        default_task_type: None
    }

└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Embed Content

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       EMBED CONTENT                                         │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION EmbeddingsService::embed_content(
    &self,
    request: EmbedContentRequest
) -> Result<EmbedContentResponse, GeminiError>:

    // 1. Validate request
    Self::validate_embed_request(&request)?

    // 2. Resolve model
    LET model = request.model.as_ref()
        .unwrap_or(&self.default_model)

    // 3. Build endpoint path
    LET path = endpoints::embed_content(model)

    // 4. Build request body
    LET request_body = EmbedContentRequestBody {
        content: request.content,
        task_type: request.task_type.or(self.default_task_type),
        title: request.title,
        output_dimensionality: request.output_dimensionality
    }

    // 5. Create request context
    LET context = RequestContext::new()
        .with_operation("embedContent")
        .with_model(model)

    // 6. Execute request
    LET response: EmbedContentResponse = AWAIT self.base.execute_request(
        HttpMethod::POST,
        &path,
        Some(&request_body),
        &context
    )?

    // 7. Log embedding statistics
    self.base.logger.info("Content embedded", {
        model: model,
        dimensions: response.embedding.values.len()
    })

    RETURN Ok(response)

[TEST:unit]
FUNCTION EmbeddingsService::validate_embed_request(
    request: &EmbedContentRequest
) -> Result<(), GeminiError>:
    // Content is required
    IF request.content.parts.is_empty() THEN:
        RETURN Err(GeminiError::RequestError {
            kind: RequestErrorKind::ValidationError,
            message: "Content must have at least one part",
            param: Some("content.parts".to_string())
        })

    // Only text parts are supported for embeddings
    FOR part IN &request.content.parts:
        MATCH part:
            Part::Text(_) => {},
            _ => RETURN Err(GeminiError::RequestError {
                kind: RequestErrorKind::ValidationError,
                message: "Only text parts are supported for embeddings",
                param: Some("content.parts".to_string())
            })

    // Output dimensionality validation
    IF LET Some(dim) = request.output_dimensionality:
        IF dim < 1 OR dim > 768 THEN:
            RETURN Err(GeminiError::RequestError {
                kind: RequestErrorKind::ValidationError,
                message: "Output dimensionality must be between 1 and 768",
                param: Some("output_dimensionality".to_string())
            })

    // Title requires RETRIEVAL_DOCUMENT task type
    IF request.title.is_some() THEN:
        MATCH request.task_type:
            Some(TaskType::RetrievalDocument) => {},
            None => {},  // Will use default
            _ => RETURN Err(GeminiError::RequestError {
                kind: RequestErrorKind::ValidationError,
                message: "Title is only supported for RETRIEVAL_DOCUMENT task type",
                param: Some("title".to_string())
            })

    RETURN Ok(())

└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Batch Embed Contents

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BATCH EMBED CONTENTS                                     │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION EmbeddingsService::batch_embed_contents(
    &self,
    request: BatchEmbedContentsRequest
) -> Result<BatchEmbedContentsResponse, GeminiError>:

    // 1. Validate batch size
    IF request.requests.is_empty() THEN:
        RETURN Err(GeminiError::RequestError {
            kind: RequestErrorKind::ValidationError,
            message: "At least one embed request is required",
            param: Some("requests".to_string())
        })

    IF request.requests.len() > 100 THEN:
        RETURN Err(GeminiError::RequestError {
            kind: RequestErrorKind::ValidationError,
            message: "Batch size cannot exceed 100",
            param: Some("requests".to_string())
        })

    // 2. Validate each request in batch
    FOR (i, embed_request) IN request.requests.iter().enumerate():
        MATCH Self::validate_embed_request(embed_request):
            Ok(_) => {},
            Err(e) => RETURN Err(GeminiError::RequestError {
                kind: RequestErrorKind::ValidationError,
                message: format!("Invalid request at index {}: {}", i, e),
                param: Some(format!("requests[{}]", i))
            })

    // 3. Resolve model
    LET model = request.model.as_ref()
        .unwrap_or(&self.default_model)

    // 4. Build endpoint path
    LET path = endpoints::batch_embed_contents(model)

    // 5. Build request body
    LET request_body = BatchEmbedContentsRequestBody {
        requests: request.requests.iter().map(|r| {
            EmbedContentRequestBody {
                content: r.content.clone(),
                task_type: r.task_type.or(self.default_task_type),
                title: r.title.clone(),
                output_dimensionality: r.output_dimensionality
            }
        }).collect()
    }

    // 6. Create request context
    LET context = RequestContext::new()
        .with_operation("batchEmbedContents")
        .with_model(model)

    // 7. Execute request
    LET response: BatchEmbedContentsResponse = AWAIT self.base.execute_request(
        HttpMethod::POST,
        &path,
        Some(&request_body),
        &context
    )?

    // 8. Log batch statistics
    self.base.logger.info("Batch embedded", {
        model: model,
        count: response.embeddings.len()
    })

    RETURN Ok(response)

└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Embeddings Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      EMBEDDINGS TYPES                                       │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE EmbedContentRequest:
    model: Option<String>
    content: Content
    task_type: Option<TaskType>
    title: Option<String>               // For RETRIEVAL_DOCUMENT only
    output_dimensionality: Option<i32>  // 1-768

ENUM TaskType:
    TaskTypeUnspecified
    RetrievalQuery
    RetrievalDocument
    SemanticSimilarity
    Classification
    Clustering

STRUCTURE EmbedContentRequestBody:
    content: Content
    task_type: Option<TaskType>
    title: Option<String>
    output_dimensionality: Option<i32>

STRUCTURE EmbedContentResponse:
    embedding: ContentEmbedding

STRUCTURE ContentEmbedding:
    values: Vec<f32>

STRUCTURE BatchEmbedContentsRequest:
    model: Option<String>
    requests: Vec<EmbedContentRequest>

STRUCTURE BatchEmbedContentsRequestBody:
    requests: Vec<EmbedContentRequestBody>

STRUCTURE BatchEmbedContentsResponse:
    embeddings: Vec<ContentEmbedding>

└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.5 Embeddings Request Builder

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                  EMBEDDINGS REQUEST BUILDER                                 │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE EmbedContentRequestBuilder:
    model: Option<String>
    text: Option<String>
    task_type: Option<TaskType>
    title: Option<String>
    output_dimensionality: Option<i32>

[TEST:unit]
FUNCTION EmbedContentRequestBuilder::new() -> Self:
    RETURN EmbedContentRequestBuilder {
        model: None,
        text: None,
        task_type: None,
        title: None,
        output_dimensionality: None
    }

[TEST:unit]
FUNCTION EmbedContentRequestBuilder::model(self, model: &str) -> Self:
    self.model = Some(model.to_string())
    RETURN self

[TEST:unit]
FUNCTION EmbedContentRequestBuilder::text(self, text: &str) -> Self:
    self.text = Some(text.to_string())
    RETURN self

[TEST:unit]
FUNCTION EmbedContentRequestBuilder::task_type(self, task_type: TaskType) -> Self:
    self.task_type = Some(task_type)
    RETURN self

[TEST:unit]
FUNCTION EmbedContentRequestBuilder::for_retrieval_query(self) -> Self:
    self.task_type = Some(TaskType::RetrievalQuery)
    RETURN self

[TEST:unit]
FUNCTION EmbedContentRequestBuilder::for_retrieval_document(self, title: Option<&str>) -> Self:
    self.task_type = Some(TaskType::RetrievalDocument)
    IF LET Some(t) = title:
        self.title = Some(t.to_string())
    RETURN self

[TEST:unit]
FUNCTION EmbedContentRequestBuilder::for_semantic_similarity(self) -> Self:
    self.task_type = Some(TaskType::SemanticSimilarity)
    RETURN self

[TEST:unit]
FUNCTION EmbedContentRequestBuilder::dimensions(self, dim: i32) -> Self:
    self.output_dimensionality = Some(dim)
    RETURN self

[TEST:unit]
FUNCTION EmbedContentRequestBuilder::build(self) -> Result<EmbedContentRequest, GeminiError>:
    LET text = self.text.ok_or(GeminiError::RequestError {
        kind: RequestErrorKind::ValidationError,
        message: "Text is required for embedding",
        param: Some("text".to_string())
    })?

    RETURN Ok(EmbedContentRequest {
        model: self.model,
        content: Content {
            role: None,
            parts: vec![Part::Text { text }]
        },
        task_type: self.task_type,
        title: self.title,
        output_dimensionality: self.output_dimensionality
    })

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Models Service

### 4.1 ModelsService Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MODELS SERVICE                                        │
├─────────────────────────────────────────────────────────────────────────────┤

[INTERFACE]
STRUCTURE ModelsService:
    base: BaseService
    cache: Option<Arc<ModelsCache>>       [MOCK]

STRUCTURE ModelsCache:
    models: RwLock<HashMap<String, CachedModel>>
    ttl: Duration

STRUCTURE CachedModel:
    model: Model
    cached_at: Instant

[TEST:unit]
FUNCTION ModelsService::new(
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthProvider>,
    resilience: Arc<ResilienceOrchestrator>,
    config: GeminiConfig,
    logger: Arc<dyn Logger>,
    tracer: Arc<dyn Tracer>,
    metrics: Arc<dyn MetricsRecorder>
) -> Self:
    RETURN ModelsService {
        base: BaseService::new(transport, auth_manager, resilience, config, logger, tracer, metrics),
        cache: Some(Arc::new(ModelsCache {
            models: RwLock::new(HashMap::new()),
            ttl: Duration::from_secs(3600)  // 1 hour cache
        }))
    }

[TEST:unit]
FUNCTION ModelsService::without_cache(self) -> Self:
    self.cache = None
    RETURN self

└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 List Models

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        LIST MODELS                                          │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION ModelsService::list(
    &self,
    request: ListModelsRequest
) -> Result<ListModelsResponse, GeminiError>:

    // Build path with optional pagination
    LET mut path = endpoints::MODELS.to_string()

    LET mut params = Vec::new()
    IF LET Some(page_size) = request.page_size:
        params.push(format!("pageSize={}", page_size))
    IF LET Some(ref page_token) = request.page_token:
        params.push(format!("pageToken={}", page_token))

    IF NOT params.is_empty() THEN:
        path = format!("{}?{}", path, params.join("&"))

    // Create request context
    LET context = RequestContext::new()
        .with_operation("listModels")

    // Execute request
    LET response: ListModelsResponse = AWAIT self.base.execute_request(
        HttpMethod::GET,
        &path,
        None::<&()>,
        &context
    )?

    // Update cache if enabled
    IF LET Some(ref cache) = self.cache:
        FOR model IN &response.models:
            LET mut models = cache.models.write().unwrap()
            models.insert(model.name.clone(), CachedModel {
                model: model.clone(),
                cached_at: Instant::now()
            })

    self.base.logger.info("Listed models", {
        count: response.models.len(),
        has_next_page: response.next_page_token.is_some()
    })

    RETURN Ok(response)

└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 Get Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GET MODEL                                           │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION ModelsService::get(
    &self,
    name: &str
) -> Result<Model, GeminiError>:

    // Normalize model name (add models/ prefix if missing)
    LET normalized_name = IF name.starts_with("models/") THEN:
        name.to_string()
    ELSE:
        format!("models/{}", name)

    // Check cache first
    IF LET Some(ref cache) = self.cache:
        LET models = cache.models.read().unwrap()
        IF LET Some(cached) = models.get(&normalized_name):
            IF cached.cached_at.elapsed() < cache.ttl THEN:
                self.base.logger.debug("Model cache hit", { name: &normalized_name })
                RETURN Ok(cached.model.clone())

    // Build path
    LET path = endpoints::model(&normalized_name)

    // Create request context
    LET context = RequestContext::new()
        .with_operation("getModel")
        .with_attribute("model_name", &normalized_name)

    // Execute request
    LET model: Model = AWAIT self.base.execute_request(
        HttpMethod::GET,
        &path,
        None::<&()>,
        &context
    )?

    // Update cache if enabled
    IF LET Some(ref cache) = self.cache:
        LET mut models = cache.models.write().unwrap()
        models.insert(normalized_name.clone(), CachedModel {
            model: model.clone(),
            cached_at: Instant::now()
        })

    self.base.logger.info("Retrieved model", {
        name: &model.name,
        display_name: &model.display_name
    })

    RETURN Ok(model)

└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.4 Models Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MODELS TYPES                                         │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE ListModelsRequest:
    page_size: Option<i32>
    page_token: Option<String>

STRUCTURE ListModelsResponse:
    models: Vec<Model>
    next_page_token: Option<String>

STRUCTURE Model:
    name: String                          // e.g., "models/gemini-1.5-pro"
    base_model_id: Option<String>
    version: String
    display_name: String
    description: String
    input_token_limit: i32
    output_token_limit: i32
    supported_generation_methods: Vec<String>  // e.g., ["generateContent", "streamGenerateContent"]
    temperature: Option<f32>              // Default temperature
    top_p: Option<f32>                    // Default top_p
    top_k: Option<i32>                    // Default top_k

└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.5 List All Models (Pagination Helper)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LIST ALL MODELS                                          │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit]
FUNCTION ModelsService::list_all(&self) -> Result<Vec<Model>, GeminiError>:
    LET mut all_models = Vec::new()
    LET mut page_token: Option<String> = None

    LOOP:
        LET request = ListModelsRequest {
            page_size: Some(100),
            page_token: page_token.clone()
        }

        LET response = AWAIT self.list(request)?

        all_models.extend(response.models)

        MATCH response.next_page_token:
            Some(token) => page_token = Some(token),
            None => BREAK

    RETURN Ok(all_models)

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Token Counting Service

### 5.1 Count Tokens

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      COUNT TOKENS                                           │
├─────────────────────────────────────────────────────────────────────────────┤

// Token counting is part of ContentService but shown separately for clarity

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION ContentService::count_tokens(
    &self,
    request: CountTokensRequest
) -> Result<CountTokensResponse, GeminiError>:

    // 1. Validate request
    IF request.contents.is_empty() AND request.generate_content_request.is_none() THEN:
        RETURN Err(GeminiError::RequestError {
            kind: RequestErrorKind::ValidationError,
            message: "Either contents or generate_content_request is required",
            param: Some("contents".to_string())
        })

    // 2. Resolve model
    LET model = request.model.as_ref()
        .or_else(|| request.generate_content_request.as_ref()
            .and_then(|r| r.model.as_ref()))
        .unwrap_or(&self.default_model)

    // 3. Build endpoint path
    LET path = endpoints::count_tokens(model)

    // 4. Build request body
    LET request_body = CountTokensRequestBody {
        contents: request.contents,
        generate_content_request: request.generate_content_request
    }

    // 5. Create request context
    LET context = RequestContext::new()
        .with_operation("countTokens")
        .with_model(model)

    // 6. Execute request
    LET response: CountTokensResponse = AWAIT self.base.execute_request(
        HttpMethod::POST,
        &path,
        Some(&request_body),
        &context
    )?

    self.base.logger.info("Tokens counted", {
        model: model,
        total_tokens: response.total_tokens
    })

    RETURN Ok(response)

└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Token Counting Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   TOKEN COUNTING TYPES                                      │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE CountTokensRequest:
    model: Option<String>
    contents: Vec<Content>
    generate_content_request: Option<GenerateContentRequest>

STRUCTURE CountTokensRequestBody:
    contents: Vec<Content>
    generate_content_request: Option<GenerateContentRequestBody>

STRUCTURE CountTokensResponse:
    total_tokens: i32
    cached_content_token_count: Option<i32>

└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Convenience Token Counting Methods

```
┌─────────────────────────────────────────────────────────────────────────────┐
│               TOKEN COUNTING CONVENIENCE                                    │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit]
FUNCTION ContentService::count_tokens_for_text(
    &self,
    text: &str,
    model: Option<&str>
) -> Result<i32, GeminiError>:
    LET request = CountTokensRequest {
        model: model.map(String::from),
        contents: vec![Content {
            role: Some("user".to_string()),
            parts: vec![Part::Text { text: text.to_string() }]
        }],
        generate_content_request: None
    }

    LET response = AWAIT self.count_tokens(request)?
    RETURN Ok(response.total_tokens)

[ASYNC] [TEST:unit]
FUNCTION ContentService::count_tokens_for_request(
    &self,
    request: &GenerateContentRequest
) -> Result<i32, GeminiError>:
    LET count_request = CountTokensRequest {
        model: request.model.clone(),
        contents: Vec::new(),
        generate_content_request: Some(request.clone())
    }

    LET response = AWAIT self.count_tokens(count_request)?
    RETURN Ok(response.total_tokens)

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Navigation

| Previous | Current | Next |
|----------|---------|------|
| [Pseudocode Part 1](./pseudocode-gemini-1.md) | Pseudocode Part 2 | [Pseudocode Part 3](./pseudocode-gemini-3.md) |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial services pseudocode |

---

**Continued in Part 3: Advanced Services (Files, Cached Content, Streaming, Error Handling)**
