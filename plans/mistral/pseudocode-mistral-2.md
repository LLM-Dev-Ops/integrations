# SPARC Pseudocode: Mistral Integration Module

**Part 2 of 3: Services and Streaming**
**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/mistral`

---

## Table of Contents

9. [Chat Service](#9-chat-service)
10. [Streaming Handler](#10-streaming-handler)
11. [FIM Service](#11-fim-service)
12. [Embeddings Service](#12-embeddings-service)
13. [Models Service](#13-models-service)
14. [Classifiers Service](#14-classifiers-service)

---

## 9. Chat Service

### 9.1 Chat Service Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CHAT SERVICE                                        │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE ChatService:
    transport: Arc<dyn HttpTransport>           [MOCK]
    auth_manager: Arc<dyn AuthProvider>         [MOCK]
    resilience: Arc<ResilienceOrchestrator>     [MOCK]
    request_builder: RequestBuilder
    response_parser: ResponseParser
    config: ClientConfig

[TEST:unit]
FUNCTION ChatService::new(
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthProvider>,
    resilience: Arc<ResilienceOrchestrator>,
    config: ClientConfig
) -> Self:
    LET request_builder = RequestBuilder::new(
        config.base_url.clone(),
        Arc::clone(&auth_manager)
    )

    RETURN ChatService {
        transport,
        auth_manager,
        resilience,
        request_builder,
        response_parser: ResponseParser::new(),
        config
    }

└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Chat Completion Request/Response Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CHAT REQUEST/RESPONSE TYPES                              │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE ChatCompletionRequest:
    model: String                               // Required
    messages: Vec<Message>                      // Required
    temperature: Option<f32>                    // 0.0-1.5
    top_p: Option<f32>                          // 0.0-1.0
    max_tokens: Option<u32>
    min_tokens: Option<u32>
    stream: Option<bool>
    stop: Option<Vec<String>>
    random_seed: Option<u64>
    tools: Option<Vec<Tool>>
    tool_choice: Option<ToolChoice>
    response_format: Option<ResponseFormat>
    safe_prompt: Option<bool>
    presence_penalty: Option<f32>
    frequency_penalty: Option<f32>

STRUCTURE Message:
    role: Role
    content: MessageContent
    name: Option<String>
    tool_calls: Option<Vec<ToolCall>>
    tool_call_id: Option<String>

ENUM Role:
    System
    User
    Assistant
    Tool

ENUM MessageContent:
    Text(String)
    Parts(Vec<ContentPart>)

STRUCTURE ContentPart:
    type_: ContentPartType
    text: Option<String>
    image_url: Option<ImageUrl>

ENUM ContentPartType:
    Text
    ImageUrl

STRUCTURE ImageUrl:
    url: String
    detail: Option<ImageDetail>

ENUM ImageDetail:
    Auto
    Low
    High

STRUCTURE Tool:
    type_: String                               // "function"
    function: FunctionDefinition

STRUCTURE FunctionDefinition:
    name: String
    description: Option<String>
    parameters: Option<serde_json::Value>       // JSON Schema

STRUCTURE ToolCall:
    id: String
    type_: String                               // "function"
    function: FunctionCall

STRUCTURE FunctionCall:
    name: String
    arguments: String                           // JSON string

ENUM ToolChoice:
    Auto
    Any
    None
    Function { name: String }

STRUCTURE ResponseFormat:
    type_: ResponseFormatType
    json_schema: Option<JsonSchemaFormat>

ENUM ResponseFormatType:
    Text
    JsonObject
    JsonSchema

STRUCTURE JsonSchemaFormat:
    name: String
    description: Option<String>
    schema: serde_json::Value
    strict: Option<bool>

STRUCTURE ChatCompletionResponse:
    id: String
    object: String                              // "chat.completion"
    created: i64
    model: String
    choices: Vec<Choice>
    usage: Usage

STRUCTURE Choice:
    index: u32
    message: AssistantMessage
    finish_reason: Option<FinishReason>

STRUCTURE AssistantMessage:
    role: Role
    content: Option<String>
    tool_calls: Option<Vec<ToolCall>>

ENUM FinishReason:
    Stop
    Length
    ToolCalls
    Error

STRUCTURE Usage:
    prompt_tokens: u32
    completion_tokens: u32
    total_tokens: u32

└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.3 Chat Completion Methods

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CHAT COMPLETION METHODS                                  │
├─────────────────────────────────────────────────────────────────────────────┤

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION ChatService::create(
    &self,
    request: ChatCompletionRequest
) -> Result<ChatCompletionResponse, MistralError>:

    // Validate request
    Self::validate_request(&request)?

    // Ensure stream is false for sync request
    LET mut request = request
    request.stream = Some(false)

    // Build HTTP request
    LET http_request = self.request_builder.build_request(
        HttpMethod::POST,
        endpoints::CHAT_COMPLETIONS,
        Some(&request),
        None
    )?

    // Create request context for tracing
    LET context = RequestContext::new()
        .with_operation("chat.create")
        .with_model(&request.model)

    // Execute with resilience
    LET response = AWAIT self.resilience.execute(
        || async {
            LET http_response = AWAIT self.transport.send(http_request.clone())
                .map_err(|e| MistralError::from(e))?

            // Update rate limits from headers
            LET rate_limit_info = ResponseParser::extract_rate_limit_info(
                &http_response.headers
            )
            self.resilience.update_rate_limits(&rate_limit_info)

            // Parse response
            ResponseParser::parse_response::<ChatCompletionResponse>(&http_response)
        },
        &context
    )?

    RETURN Ok(response)

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION ChatService::create_stream(
    &self,
    request: ChatCompletionRequest
) -> Result<impl Stream<Item = Result<ChatCompletionChunk, MistralError>>, MistralError>:

    // Validate request
    Self::validate_request(&request)?

    // Force stream to true
    LET mut request = request
    request.stream = Some(true)

    // Build streaming request
    LET http_request = self.request_builder.build_streaming_request(
        endpoints::CHAT_COMPLETIONS,
        &request
    )?

    // Create context
    LET context = RequestContext::new()
        .with_operation("chat.create_stream")
        .with_model(&request.model)

    // Get byte stream
    LET byte_stream = AWAIT self.transport.send_streaming(http_request)
        .map_err(|e| MistralError::from(e))?

    // Create SSE parser
    LET sse_parser = SseParser::new()

    // Transform to ChatCompletionChunk stream
    LET chunk_stream = byte_stream
        .map(|result| result.map_err(MistralError::from))
        .flat_map(|result| {
            MATCH result:
                Ok(bytes) => sse_parser.parse_bytes(&bytes)
                    .into_iter()
                    .map(Ok)
                    .collect::<Vec<_>>(),
                Err(e) => vec![Err(e)]
        })
        .filter_map(|result| {
            MATCH result:
                Ok(event) IF event.data == "[DONE]" => None,
                Ok(event) => Some(
                    serde_json::from_str::<ChatCompletionChunk>(&event.data)
                        .map_err(|e| MistralError::DeserializationError {
                            message: format!("Failed to parse chunk: {}", e),
                            source: Box::new(e)
                        })
                ),
                Err(e) => Some(Err(e))
        })

    RETURN Ok(chunk_stream)

[TEST:unit]
FUNCTION ChatService::validate_request(request: &ChatCompletionRequest) -> Result<(), MistralError>:
    // Validate model
    IF request.model.is_empty() THEN:
        RETURN Err(MistralError::ValidationError {
            message: "Model is required".to_string(),
            field: "model".to_string(),
            value: None
        })

    // Validate messages
    IF request.messages.is_empty() THEN:
        RETURN Err(MistralError::ValidationError {
            message: "Messages array cannot be empty".to_string(),
            field: "messages".to_string(),
            value: None
        })

    // Validate temperature
    IF LET Some(temp) = request.temperature:
        IF temp < 0.0 || temp > 1.5 THEN:
            RETURN Err(MistralError::ValidationError {
                message: "Temperature must be between 0.0 and 1.5".to_string(),
                field: "temperature".to_string(),
                value: Some(temp.to_string())
            })

    // Validate top_p
    IF LET Some(top_p) = request.top_p:
        IF top_p <= 0.0 || top_p > 1.0 THEN:
            RETURN Err(MistralError::ValidationError {
                message: "top_p must be between 0.0 (exclusive) and 1.0".to_string(),
                field: "top_p".to_string(),
                value: Some(top_p.to_string())
            })

    // Validate max_tokens
    IF LET Some(max_tokens) = request.max_tokens:
        IF max_tokens == 0 THEN:
            RETURN Err(MistralError::ValidationError {
                message: "max_tokens must be greater than 0".to_string(),
                field: "max_tokens".to_string(),
                value: Some("0".to_string())
            })

    RETURN Ok(())

└─────────────────────────────────────────────────────────────────────────────┘
```

### 9.4 Chat Request Builder Pattern

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CHAT REQUEST BUILDER                                     │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE ChatCompletionRequestBuilder:
    model: Option<String>
    messages: Vec<Message>
    temperature: Option<f32>
    top_p: Option<f32>
    max_tokens: Option<u32>
    min_tokens: Option<u32>
    stop: Option<Vec<String>>
    random_seed: Option<u64>
    tools: Option<Vec<Tool>>
    tool_choice: Option<ToolChoice>
    response_format: Option<ResponseFormat>
    safe_prompt: Option<bool>
    presence_penalty: Option<f32>
    frequency_penalty: Option<f32>

[TEST:unit]
FUNCTION ChatCompletionRequest::builder() -> ChatCompletionRequestBuilder:
    RETURN ChatCompletionRequestBuilder {
        model: None,
        messages: Vec::new(),
        temperature: None,
        top_p: None,
        max_tokens: None,
        min_tokens: None,
        stop: None,
        random_seed: None,
        tools: None,
        tool_choice: None,
        response_format: None,
        safe_prompt: None,
        presence_penalty: None,
        frequency_penalty: None
    }

FUNCTION ChatCompletionRequestBuilder::model(mut self, model: impl Into<String>) -> Self:
    self.model = Some(model.into())
    self

FUNCTION ChatCompletionRequestBuilder::messages(mut self, messages: Vec<Message>) -> Self:
    self.messages = messages
    self

FUNCTION ChatCompletionRequestBuilder::add_message(mut self, message: Message) -> Self:
    self.messages.push(message)
    self

FUNCTION ChatCompletionRequestBuilder::system(mut self, content: impl Into<String>) -> Self:
    self.messages.push(Message::system(content))
    self

FUNCTION ChatCompletionRequestBuilder::user(mut self, content: impl Into<String>) -> Self:
    self.messages.push(Message::user(content))
    self

FUNCTION ChatCompletionRequestBuilder::assistant(mut self, content: impl Into<String>) -> Self:
    self.messages.push(Message::assistant(content))
    self

FUNCTION ChatCompletionRequestBuilder::temperature(mut self, temp: f32) -> Self:
    self.temperature = Some(temp)
    self

FUNCTION ChatCompletionRequestBuilder::max_tokens(mut self, tokens: u32) -> Self:
    self.max_tokens = Some(tokens)
    self

FUNCTION ChatCompletionRequestBuilder::tools(mut self, tools: Vec<Tool>) -> Self:
    self.tools = Some(tools)
    self

FUNCTION ChatCompletionRequestBuilder::response_format(mut self, format: ResponseFormat) -> Self:
    self.response_format = Some(format)
    self

FUNCTION ChatCompletionRequestBuilder::json_mode(mut self) -> Self:
    self.response_format = Some(ResponseFormat {
        type_: ResponseFormatType::JsonObject,
        json_schema: None
    })
    self

FUNCTION ChatCompletionRequestBuilder::json_schema(
    mut self,
    name: impl Into<String>,
    schema: serde_json::Value
) -> Self:
    self.response_format = Some(ResponseFormat {
        type_: ResponseFormatType::JsonSchema,
        json_schema: Some(JsonSchemaFormat {
            name: name.into(),
            description: None,
            schema,
            strict: Some(true)
        })
    })
    self

FUNCTION ChatCompletionRequestBuilder::safe_prompt(mut self, safe: bool) -> Self:
    self.safe_prompt = Some(safe)
    self

[TEST:unit]
FUNCTION ChatCompletionRequestBuilder::build(self) -> Result<ChatCompletionRequest, MistralError>:
    LET model = self.model.ok_or(MistralError::ValidationError {
        message: "Model is required".to_string(),
        field: "model".to_string(),
        value: None
    })?

    IF self.messages.is_empty() THEN:
        RETURN Err(MistralError::ValidationError {
            message: "At least one message is required".to_string(),
            field: "messages".to_string(),
            value: None
        })

    RETURN Ok(ChatCompletionRequest {
        model,
        messages: self.messages,
        temperature: self.temperature,
        top_p: self.top_p,
        max_tokens: self.max_tokens,
        min_tokens: self.min_tokens,
        stream: None,
        stop: self.stop,
        random_seed: self.random_seed,
        tools: self.tools,
        tool_choice: self.tool_choice,
        response_format: self.response_format,
        safe_prompt: self.safe_prompt,
        presence_penalty: self.presence_penalty,
        frequency_penalty: self.frequency_penalty
    })

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Streaming Handler

### 10.1 SSE Parser

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SSE PARSER                                         │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE SseParser:
    buffer: String
    current_event: Option<String>
    current_data: Vec<String>

STRUCTURE SseEvent:
    event: Option<String>
    data: String
    id: Option<String>
    retry: Option<u64>

[TEST:unit]
FUNCTION SseParser::new() -> Self:
    RETURN SseParser {
        buffer: String::new(),
        current_event: None,
        current_data: Vec::new()
    }

[TEST:unit]
FUNCTION SseParser::parse_bytes(&mut self, bytes: &[u8]) -> Vec<SseEvent>:
    LET mut events = Vec::new()

    // Append to buffer
    LET text = String::from_utf8_lossy(bytes)
    self.buffer.push_str(&text)

    // Process complete lines
    WHILE LET Some(line_end) = self.buffer.find('\n'):
        LET line = self.buffer[..line_end].trim_end_matches('\r').to_string()
        self.buffer = self.buffer[line_end + 1..].to_string()

        IF LET Some(event) = self.process_line(&line):
            events.push(event)

    RETURN events

[TEST:unit]
FUNCTION SseParser::process_line(&mut self, line: &str) -> Option<SseEvent>:
    // Empty line signals end of event
    IF line.is_empty() THEN:
        IF self.current_data.is_empty() THEN:
            RETURN None

        LET event = SseEvent {
            event: self.current_event.take(),
            data: self.current_data.join("\n"),
            id: None,
            retry: None
        }
        self.current_data.clear()
        RETURN Some(event)

    // Comment line (starts with :)
    IF line.starts_with(':') THEN:
        RETURN None

    // Parse field
    LET (field, value) = IF LET Some(colon_pos) = line.find(':'):
        LET field = &line[..colon_pos]
        LET value = line[colon_pos + 1..].trim_start()
        (field, value)
    ELSE:
        (line, "")

    MATCH field:
        "event" => self.current_event = Some(value.to_string()),
        "data" => self.current_data.push(value.to_string()),
        "id" => {}, // Ignored for now
        "retry" => {}, // Ignored for now
        _ => {} // Unknown field, ignore

    RETURN None

└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.2 Stream Chunk Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STREAM CHUNK TYPES                                     │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE ChatCompletionChunk:
    id: String
    object: String                              // "chat.completion.chunk"
    created: i64
    model: String
    choices: Vec<ChunkChoice>
    usage: Option<Usage>                        // Only in final chunk

STRUCTURE ChunkChoice:
    index: u32
    delta: Delta
    finish_reason: Option<FinishReason>

STRUCTURE Delta:
    role: Option<Role>                          // Only in first chunk
    content: Option<String>                     // Incremental content
    tool_calls: Option<Vec<ToolCallDelta>>

STRUCTURE ToolCallDelta:
    index: u32
    id: Option<String>                          // Only in first delta
    type_: Option<String>                       // Only in first delta
    function: Option<FunctionCallDelta>

STRUCTURE FunctionCallDelta:
    name: Option<String>                        // Only in first delta
    arguments: Option<String>                   // Incremental JSON

└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.3 Stream Accumulator

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      STREAM ACCUMULATOR                                     │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE StreamAccumulator:
    id: Option<String>
    model: Option<String>
    created: Option<i64>
    content: String
    tool_calls: Vec<AccumulatedToolCall>
    finish_reason: Option<FinishReason>
    usage: Option<Usage>

STRUCTURE AccumulatedToolCall:
    id: String
    type_: String
    function_name: String
    arguments: String

[TEST:unit]
FUNCTION StreamAccumulator::new() -> Self:
    RETURN StreamAccumulator {
        id: None,
        model: None,
        created: None,
        content: String::new(),
        tool_calls: Vec::new(),
        finish_reason: None,
        usage: None
    }

[TEST:unit]
FUNCTION StreamAccumulator::process_chunk(&mut self, chunk: ChatCompletionChunk):
    // Set metadata from first chunk
    IF self.id.is_none() THEN:
        self.id = Some(chunk.id)
        self.model = Some(chunk.model)
        self.created = Some(chunk.created)

    // Process choices
    FOR choice IN chunk.choices:
        // Accumulate content
        IF LET Some(content) = choice.delta.content:
            self.content.push_str(&content)

        // Accumulate tool calls
        IF LET Some(tool_call_deltas) = choice.delta.tool_calls:
            FOR delta IN tool_call_deltas:
                self.process_tool_call_delta(delta)

        // Capture finish reason
        IF choice.finish_reason.is_some() THEN:
            self.finish_reason = choice.finish_reason

    // Capture usage from final chunk
    IF chunk.usage.is_some() THEN:
        self.usage = chunk.usage

[TEST:unit]
FUNCTION StreamAccumulator::process_tool_call_delta(&mut self, delta: ToolCallDelta):
    LET index = delta.index AS usize

    // Ensure tool_calls vector is large enough
    WHILE self.tool_calls.len() <= index:
        self.tool_calls.push(AccumulatedToolCall {
            id: String::new(),
            type_: String::new(),
            function_name: String::new(),
            arguments: String::new()
        })

    LET tool_call = &mut self.tool_calls[index]

    // Set id and type from first delta
    IF LET Some(id) = delta.id:
        tool_call.id = id
    IF LET Some(type_) = delta.type_:
        tool_call.type_ = type_

    // Accumulate function data
    IF LET Some(function) = delta.function:
        IF LET Some(name) = function.name:
            tool_call.function_name = name
        IF LET Some(args) = function.arguments:
            tool_call.arguments.push_str(&args)

[TEST:unit]
FUNCTION StreamAccumulator::into_response(self) -> Result<ChatCompletionResponse, MistralError>:
    LET tool_calls = IF self.tool_calls.is_empty():
        None
    ELSE:
        Some(self.tool_calls.into_iter().map(|tc| ToolCall {
            id: tc.id,
            type_: tc.type_,
            function: FunctionCall {
                name: tc.function_name,
                arguments: tc.arguments
            }
        }).collect())

    RETURN Ok(ChatCompletionResponse {
        id: self.id.unwrap_or_default(),
        object: "chat.completion".to_string(),
        created: self.created.unwrap_or(0),
        model: self.model.unwrap_or_default(),
        choices: vec![Choice {
            index: 0,
            message: AssistantMessage {
                role: Role::Assistant,
                content: IF self.content.is_empty() { None } ELSE { Some(self.content) },
                tool_calls
            },
            finish_reason: self.finish_reason
        }],
        usage: self.usage.unwrap_or(Usage {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
        })
    })

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. FIM Service

### 11.1 FIM Service Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FIM SERVICE                                        │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE FimService:
    transport: Arc<dyn HttpTransport>           [MOCK]
    auth_manager: Arc<dyn AuthProvider>         [MOCK]
    resilience: Arc<ResilienceOrchestrator>     [MOCK]
    request_builder: RequestBuilder
    response_parser: ResponseParser
    config: ClientConfig

STRUCTURE FimCompletionRequest:
    model: String                               // Required (e.g., "codestral-latest")
    prompt: String                              // Required (prefix code)
    suffix: Option<String>                      // Optional (suffix code)
    temperature: Option<f32>
    top_p: Option<f32>
    max_tokens: Option<u32>
    min_tokens: Option<u32>
    stream: Option<bool>
    stop: Option<Vec<String>>
    random_seed: Option<u64>

STRUCTURE FimCompletionResponse:
    id: String
    object: String                              // "fim.completion"
    created: i64
    model: String
    choices: Vec<FimChoice>
    usage: Usage

STRUCTURE FimChoice:
    index: u32
    message: FimMessage
    finish_reason: Option<FinishReason>

STRUCTURE FimMessage:
    role: Role
    content: String

└─────────────────────────────────────────────────────────────────────────────┘
```

### 11.2 FIM Completion Methods

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FIM COMPLETION METHODS                                  │
├─────────────────────────────────────────────────────────────────────────────┤

[TEST:unit]
FUNCTION FimService::new(
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthProvider>,
    resilience: Arc<ResilienceOrchestrator>,
    config: ClientConfig
) -> Self:
    LET request_builder = RequestBuilder::new(
        config.base_url.clone(),
        Arc::clone(&auth_manager)
    )

    RETURN FimService {
        transport,
        auth_manager,
        resilience,
        request_builder,
        response_parser: ResponseParser::new(),
        config
    }

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION FimService::create(
    &self,
    request: FimCompletionRequest
) -> Result<FimCompletionResponse, MistralError>:

    // Validate request
    Self::validate_request(&request)?

    // Ensure stream is false
    LET mut request = request
    request.stream = Some(false)

    // Build HTTP request
    LET http_request = self.request_builder.build_request(
        HttpMethod::POST,
        endpoints::FIM_COMPLETIONS,
        Some(&request),
        None
    )?

    // Create context
    LET context = RequestContext::new()
        .with_operation("fim.create")
        .with_model(&request.model)

    // Execute with resilience
    LET response = AWAIT self.resilience.execute(
        || async {
            LET http_response = AWAIT self.transport.send(http_request.clone())?
            ResponseParser::parse_response::<FimCompletionResponse>(&http_response)
        },
        &context
    )?

    RETURN Ok(response)

[ASYNC] [TEST:unit]
FUNCTION FimService::create_stream(
    &self,
    request: FimCompletionRequest
) -> Result<impl Stream<Item = Result<FimCompletionChunk, MistralError>>, MistralError>:

    // Validate and set stream = true
    Self::validate_request(&request)?
    LET mut request = request
    request.stream = Some(true)

    // Build streaming request
    LET http_request = self.request_builder.build_streaming_request(
        endpoints::FIM_COMPLETIONS,
        &request
    )?

    // Get byte stream
    LET byte_stream = AWAIT self.transport.send_streaming(http_request)?

    // Parse SSE events
    LET sse_parser = SseParser::new()
    LET chunk_stream = byte_stream
        .flat_map(|bytes| sse_parser.parse_bytes(&bytes))
        .filter_map(|event| {
            IF event.data == "[DONE]" THEN:
                None
            ELSE:
                Some(serde_json::from_str::<FimCompletionChunk>(&event.data))
        })

    RETURN Ok(chunk_stream)

[TEST:unit]
FUNCTION FimService::validate_request(request: &FimCompletionRequest) -> Result<(), MistralError>:
    IF request.model.is_empty() THEN:
        RETURN Err(MistralError::ValidationError {
            message: "Model is required".to_string(),
            field: "model".to_string(),
            value: None
        })

    IF request.prompt.is_empty() THEN:
        RETURN Err(MistralError::ValidationError {
            message: "Prompt (prefix) is required".to_string(),
            field: "prompt".to_string(),
            value: None
        })

    RETURN Ok(())

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Embeddings Service

### 12.1 Embeddings Service Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       EMBEDDINGS SERVICE                                    │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE EmbeddingsService:
    transport: Arc<dyn HttpTransport>           [MOCK]
    auth_manager: Arc<dyn AuthProvider>         [MOCK]
    resilience: Arc<ResilienceOrchestrator>     [MOCK]
    request_builder: RequestBuilder
    response_parser: ResponseParser
    config: ClientConfig

STRUCTURE EmbeddingRequest:
    model: String                               // Required (e.g., "mistral-embed")
    input: EmbeddingInput                       // Required
    encoding_format: Option<EncodingFormat>     // Default: "float"

ENUM EmbeddingInput:
    Single(String)
    Batch(Vec<String>)

ENUM EncodingFormat:
    Float
    Base64

STRUCTURE EmbeddingResponse:
    id: String
    object: String                              // "list"
    data: Vec<EmbeddingData>
    model: String
    usage: EmbeddingUsage

STRUCTURE EmbeddingData:
    object: String                              // "embedding"
    embedding: EmbeddingVector
    index: u32

ENUM EmbeddingVector:
    Float(Vec<f32>)
    Base64(String)

STRUCTURE EmbeddingUsage:
    prompt_tokens: u32
    total_tokens: u32

└─────────────────────────────────────────────────────────────────────────────┘
```

### 12.2 Embeddings Methods

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      EMBEDDINGS METHODS                                     │
├─────────────────────────────────────────────────────────────────────────────┤

[TEST:unit]
FUNCTION EmbeddingsService::new(
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthProvider>,
    resilience: Arc<ResilienceOrchestrator>,
    config: ClientConfig
) -> Self:
    LET request_builder = RequestBuilder::new(
        config.base_url.clone(),
        Arc::clone(&auth_manager)
    )

    RETURN EmbeddingsService {
        transport,
        auth_manager,
        resilience,
        request_builder,
        response_parser: ResponseParser::new(),
        config
    }

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION EmbeddingsService::create(
    &self,
    request: EmbeddingRequest
) -> Result<EmbeddingResponse, MistralError>:

    // Validate request
    Self::validate_request(&request)?

    // Build HTTP request
    LET http_request = self.request_builder.build_request(
        HttpMethod::POST,
        endpoints::EMBEDDINGS,
        Some(&request),
        None
    )?

    // Create context
    LET context = RequestContext::new()
        .with_operation("embeddings.create")
        .with_model(&request.model)

    // Execute with resilience
    LET response = AWAIT self.resilience.execute(
        || async {
            LET http_response = AWAIT self.transport.send(http_request.clone())?
            ResponseParser::parse_response::<EmbeddingResponse>(&http_response)
        },
        &context
    )?

    RETURN Ok(response)

[ASYNC] [TEST:unit]
FUNCTION EmbeddingsService::create_single(
    &self,
    model: &str,
    text: &str
) -> Result<Vec<f32>, MistralError>:

    LET request = EmbeddingRequest {
        model: model.to_string(),
        input: EmbeddingInput::Single(text.to_string()),
        encoding_format: Some(EncodingFormat::Float)
    }

    LET response = AWAIT self.create(request)?

    IF response.data.is_empty() THEN:
        RETURN Err(MistralError::InternalError {
            message: "No embedding returned".to_string(),
            request_id: None
        })

    MATCH &response.data[0].embedding:
        EmbeddingVector::Float(vec) => Ok(vec.clone()),
        EmbeddingVector::Base64(_) => Err(MistralError::InternalError {
            message: "Unexpected base64 encoding".to_string(),
            request_id: None
        })

[ASYNC] [TEST:unit]
FUNCTION EmbeddingsService::create_batch(
    &self,
    model: &str,
    texts: Vec<String>
) -> Result<Vec<Vec<f32>>, MistralError>:

    LET request = EmbeddingRequest {
        model: model.to_string(),
        input: EmbeddingInput::Batch(texts),
        encoding_format: Some(EncodingFormat::Float)
    }

    LET response = AWAIT self.create(request)?

    LET mut embeddings: Vec<Vec<f32>> = vec![Vec::new(); response.data.len()]

    FOR data IN response.data:
        MATCH data.embedding:
            EmbeddingVector::Float(vec) => {
                embeddings[data.index AS usize] = vec
            },
            _ => RETURN Err(MistralError::InternalError {
                message: "Unexpected encoding".to_string(),
                request_id: None
            })

    RETURN Ok(embeddings)

[TEST:unit]
FUNCTION EmbeddingsService::validate_request(request: &EmbeddingRequest) -> Result<(), MistralError>:
    IF request.model.is_empty() THEN:
        RETURN Err(MistralError::ValidationError {
            message: "Model is required".to_string(),
            field: "model".to_string(),
            value: None
        })

    MATCH &request.input:
        EmbeddingInput::Single(text) IF text.is_empty() => {
            RETURN Err(MistralError::ValidationError {
                message: "Input text cannot be empty".to_string(),
                field: "input".to_string(),
                value: None
            })
        },
        EmbeddingInput::Batch(texts) IF texts.is_empty() => {
            RETURN Err(MistralError::ValidationError {
                message: "Input batch cannot be empty".to_string(),
                field: "input".to_string(),
                value: None
            })
        },
        _ => {}

    RETURN Ok(())

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Models Service

### 13.1 Models Service Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MODELS SERVICE                                       │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE ModelsService:
    transport: Arc<dyn HttpTransport>           [MOCK]
    auth_manager: Arc<dyn AuthProvider>         [MOCK]
    resilience: Arc<ResilienceOrchestrator>     [MOCK]
    request_builder: RequestBuilder
    response_parser: ResponseParser
    config: ClientConfig

STRUCTURE Model:
    id: String
    object: String                              // "model"
    created: i64
    owned_by: String
    capabilities: ModelCapabilities
    name: String
    description: String
    max_context_length: u32
    aliases: Vec<String>
    deprecation: Option<String>
    default_model_temperature: Option<f32>
    type_: ModelType

STRUCTURE ModelCapabilities:
    completion_chat: bool
    completion_fim: bool
    function_calling: bool
    fine_tuning: bool
    vision: bool

ENUM ModelType:
    Base
    FineTuned

STRUCTURE ListModelsResponse:
    object: String                              // "list"
    data: Vec<Model>

STRUCTURE DeleteModelResponse:
    id: String
    object: String                              // "model"
    deleted: bool

STRUCTURE UpdateModelRequest:
    name: Option<String>
    description: Option<String>

└─────────────────────────────────────────────────────────────────────────────┘
```

### 13.2 Models Methods

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MODELS METHODS                                       │
├─────────────────────────────────────────────────────────────────────────────┤

[TEST:unit]
FUNCTION ModelsService::new(
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthProvider>,
    resilience: Arc<ResilienceOrchestrator>,
    config: ClientConfig
) -> Self:
    LET request_builder = RequestBuilder::new(
        config.base_url.clone(),
        Arc::clone(&auth_manager)
    )

    RETURN ModelsService {
        transport,
        auth_manager,
        resilience,
        request_builder,
        response_parser: ResponseParser::new(),
        config
    }

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION ModelsService::list(&self) -> Result<ListModelsResponse, MistralError>:
    LET http_request = self.request_builder.build_request::<()>(
        HttpMethod::GET,
        endpoints::MODELS,
        None,
        None
    )?

    LET context = RequestContext::new()
        .with_operation("models.list")

    LET response = AWAIT self.resilience.execute(
        || async {
            LET http_response = AWAIT self.transport.send(http_request.clone())?
            ResponseParser::parse_response::<ListModelsResponse>(&http_response)
        },
        &context
    )?

    RETURN Ok(response)

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION ModelsService::get(&self, model_id: &str) -> Result<Model, MistralError>:
    IF model_id.is_empty() THEN:
        RETURN Err(MistralError::ValidationError {
            message: "Model ID is required".to_string(),
            field: "model_id".to_string(),
            value: None
        })

    LET http_request = self.request_builder.build_request::<()>(
        HttpMethod::GET,
        &endpoints::model(model_id),
        None,
        None
    )?

    LET context = RequestContext::new()
        .with_operation("models.get")
        .with_model(model_id)

    LET response = AWAIT self.resilience.execute(
        || async {
            LET http_response = AWAIT self.transport.send(http_request.clone())?
            ResponseParser::parse_response::<Model>(&http_response)
        },
        &context
    )?

    RETURN Ok(response)

[ASYNC] [TEST:unit]
FUNCTION ModelsService::delete(&self, model_id: &str) -> Result<DeleteModelResponse, MistralError>:
    IF model_id.is_empty() THEN:
        RETURN Err(MistralError::ValidationError {
            message: "Model ID is required".to_string(),
            field: "model_id".to_string(),
            value: None
        })

    LET http_request = self.request_builder.build_request::<()>(
        HttpMethod::DELETE,
        &endpoints::model(model_id),
        None,
        None
    )?

    LET context = RequestContext::new()
        .with_operation("models.delete")
        .with_model(model_id)

    LET response = AWAIT self.resilience.execute(
        || async {
            LET http_response = AWAIT self.transport.send(http_request.clone())?
            ResponseParser::parse_response::<DeleteModelResponse>(&http_response)
        },
        &context
    )?

    RETURN Ok(response)

[ASYNC] [TEST:unit]
FUNCTION ModelsService::update(
    &self,
    model_id: &str,
    request: UpdateModelRequest
) -> Result<Model, MistralError>:

    IF model_id.is_empty() THEN:
        RETURN Err(MistralError::ValidationError {
            message: "Model ID is required".to_string(),
            field: "model_id".to_string(),
            value: None
        })

    LET http_request = self.request_builder.build_request(
        HttpMethod::PATCH,
        &endpoints::model(model_id),
        Some(&request),
        None
    )?

    LET context = RequestContext::new()
        .with_operation("models.update")
        .with_model(model_id)

    LET response = AWAIT self.resilience.execute(
        || async {
            LET http_response = AWAIT self.transport.send(http_request.clone())?
            ResponseParser::parse_response::<Model>(&http_response)
        },
        &context
    )?

    RETURN Ok(response)

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 14. Classifiers Service

### 14.1 Classifiers Service Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CLASSIFIERS SERVICE                                    │
├─────────────────────────────────────────────────────────────────────────────┤

STRUCTURE ClassifiersService:
    transport: Arc<dyn HttpTransport>           [MOCK]
    auth_manager: Arc<dyn AuthProvider>         [MOCK]
    resilience: Arc<ResilienceOrchestrator>     [MOCK]
    request_builder: RequestBuilder
    response_parser: ResponseParser
    config: ClientConfig

// Moderation types
STRUCTURE ModerationRequest:
    model: Option<String>                       // Default: "mistral-moderation-latest"
    input: ModerationInput

ENUM ModerationInput:
    Single(String)
    Batch(Vec<String>)

STRUCTURE ModerationResponse:
    id: String
    model: String
    results: Vec<ModerationResult>

STRUCTURE ModerationResult:
    categories: ModerationCategories
    category_scores: ModerationCategoryScores

STRUCTURE ModerationCategories:
    sexual: bool
    hate_and_discrimination: bool
    violence_and_threats: bool
    dangerous_and_criminal_content: bool
    selfharm: bool
    health: bool
    financial: bool
    law: bool
    pii: bool

STRUCTURE ModerationCategoryScores:
    sexual: f32
    hate_and_discrimination: f32
    violence_and_threats: f32
    dangerous_and_criminal_content: f32
    selfharm: f32
    health: f32
    financial: f32
    law: f32
    pii: f32

// Classification types
STRUCTURE ClassificationRequest:
    model: String
    input: ClassificationInput

ENUM ClassificationInput:
    Single(String)
    Batch(Vec<String>)

STRUCTURE ClassificationResponse:
    id: String
    model: String
    results: Vec<Classification>

STRUCTURE Classification:
    // Structure depends on classifier model
    label: String
    score: f32

└─────────────────────────────────────────────────────────────────────────────┘
```

### 14.2 Classifiers Methods

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CLASSIFIERS METHODS                                    │
├─────────────────────────────────────────────────────────────────────────────┤

[TEST:unit]
FUNCTION ClassifiersService::new(
    transport: Arc<dyn HttpTransport>,
    auth_manager: Arc<dyn AuthProvider>,
    resilience: Arc<ResilienceOrchestrator>,
    config: ClientConfig
) -> Self:
    LET request_builder = RequestBuilder::new(
        config.base_url.clone(),
        Arc::clone(&auth_manager)
    )

    RETURN ClassifiersService {
        transport,
        auth_manager,
        resilience,
        request_builder,
        response_parser: ResponseParser::new(),
        config
    }

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION ClassifiersService::moderate(
    &self,
    request: ModerationRequest
) -> Result<ModerationResponse, MistralError>:

    // Use default model if not specified
    LET request = ModerationRequest {
        model: request.model.or(Some("mistral-moderation-latest".to_string())),
        input: request.input
    }

    LET http_request = self.request_builder.build_request(
        HttpMethod::POST,
        endpoints::MODERATIONS,
        Some(&request),
        None
    )?

    LET context = RequestContext::new()
        .with_operation("classifiers.moderate")
        .with_model(request.model.as_deref().unwrap_or("mistral-moderation-latest"))

    LET response = AWAIT self.resilience.execute(
        || async {
            LET http_response = AWAIT self.transport.send(http_request.clone())?
            ResponseParser::parse_response::<ModerationResponse>(&http_response)
        },
        &context
    )?

    RETURN Ok(response)

[ASYNC] [TEST:unit]
FUNCTION ClassifiersService::moderate_text(
    &self,
    text: &str
) -> Result<ModerationResult, MistralError>:

    LET request = ModerationRequest {
        model: None,
        input: ModerationInput::Single(text.to_string())
    }

    LET response = AWAIT self.moderate(request)?

    IF response.results.is_empty() THEN:
        RETURN Err(MistralError::InternalError {
            message: "No moderation result returned".to_string(),
            request_id: None
        })

    RETURN Ok(response.results.into_iter().next().unwrap())

[ASYNC] [TEST:unit]
FUNCTION ClassifiersService::is_safe(&self, text: &str) -> Result<bool, MistralError>:
    LET result = AWAIT self.moderate_text(text)?

    // Check if any category is flagged
    LET is_flagged = result.categories.sexual
        || result.categories.hate_and_discrimination
        || result.categories.violence_and_threats
        || result.categories.dangerous_and_criminal_content
        || result.categories.selfharm

    RETURN Ok(!is_flagged)

[ASYNC] [TEST:unit] [TEST:integration]
FUNCTION ClassifiersService::classify(
    &self,
    request: ClassificationRequest
) -> Result<ClassificationResponse, MistralError>:

    IF request.model.is_empty() THEN:
        RETURN Err(MistralError::ValidationError {
            message: "Model is required".to_string(),
            field: "model".to_string(),
            value: None
        })

    LET http_request = self.request_builder.build_request(
        HttpMethod::POST,
        endpoints::CLASSIFIERS,
        Some(&request),
        None
    )?

    LET context = RequestContext::new()
        .with_operation("classifiers.classify")
        .with_model(&request.model)

    LET response = AWAIT self.resilience.execute(
        || async {
            LET http_response = AWAIT self.transport.send(http_request.clone())?
            ResponseParser::parse_response::<ClassificationResponse>(&http_response)
        },
        &context
    )?

    RETURN Ok(response)

└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Document Navigation

| Previous | Current | Next |
|----------|---------|------|
| [Pseudocode Part 1](./pseudocode-mistral-1.md) | Pseudocode Part 2 | [Pseudocode Part 3](./pseudocode-mistral-3.md) |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-09 | SPARC Generator | Initial services and streaming pseudocode |

---

**Continued in Part 3: Files, Fine-Tuning, Agents, and Batch Services**
