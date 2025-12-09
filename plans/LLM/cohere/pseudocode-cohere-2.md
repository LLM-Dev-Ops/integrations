# Pseudocode: Cohere Integration Module - Part 2

**Services: Chat, Generate, Embed, Rerank**

**Version:** 1.0.0
**Date:** 2025-12-09
**Module:** `integrations/cohere`
**SPARC Phase:** Pseudocode (2 of 3)

---

## Table of Contents

11. [Chat Service](#11-chat-service)
12. [Generate Service](#12-generate-service)
13. [Embed Service](#13-embed-service)
14. [Rerank Service](#14-rerank-service)

---

## 11. Chat Service

### 11.1 Chat Service Interface

```pseudocode
INTERFACE ChatServiceInterface:
    /**
     * Sends a chat message and returns complete response
     */
    ASYNC FUNCTION chat(request: ChatRequest) -> Result<ChatResponse, CohereError>

    /**
     * Sends a chat message with streaming response
     */
    ASYNC FUNCTION chat_stream(request: ChatRequest) -> Result<EventStream<CohereStreamEvent>, CohereError>

    /**
     * Convenience method for simple chat without history
     */
    ASYNC FUNCTION message(message: String, model: Option<String>) -> Result<ChatResponse, CohereError>

    /**
     * Chat with RAG using connectors
     */
    ASYNC FUNCTION chat_with_rag(request: ChatWithRagRequest) -> Result<ChatResponse, CohereError>

    /**
     * Chat with tool use
     */
    ASYNC FUNCTION chat_with_tools(request: ChatWithToolsRequest) -> Result<ChatResponse, CohereError>
```

### 11.2 Chat Request Types

```pseudocode
STRUCT ChatRequest:
    // Required
    message: String                     // Current user message

    // Model selection
    model: Option<String>               // Default: "command-r-plus"

    // Conversation context
    chat_history: Option<List<ChatMessage>>  // Previous messages
    preamble: Option<String>            // System preamble/instructions
    conversation_id: Option<String>     // For multi-turn conversations

    // Generation parameters
    temperature: Option<f64>            // 0.0-1.0
    max_tokens: Option<u32>             // Maximum tokens to generate
    max_input_tokens: Option<u32>       // Maximum input tokens
    k: Option<u32>                      // Top-k sampling
    p: Option<f64>                      // Top-p (nucleus) sampling
    stop_sequences: Option<List<String>> // Stop generation sequences
    frequency_penalty: Option<f64>      // -2.0 to 2.0
    presence_penalty: Option<f64>       // -2.0 to 2.0
    seed: Option<u64>                   // Random seed for reproducibility

    // RAG configuration
    connectors: Option<List<Connector>> // External data connectors
    documents: Option<List<Document>>   // Inline documents for RAG
    search_queries_only: Option<Boolean> // Only return search queries

    // Citation configuration
    citation_quality: Option<CitationQuality>
    prompt_truncation: Option<PromptTruncation>

    // Tool configuration
    tools: Option<List<Tool>>           // Available tools
    tool_results: Option<List<ToolResult>> // Results from tool calls
    force_single_step: Option<Boolean>  // Force single tool call

    // Streaming
    stream: Option<Boolean>             // Enable streaming

    // Response format
    response_format: Option<ResponseFormat>

STRUCT ChatMessage:
    role: ChatRole                      // USER, CHATBOT, SYSTEM, TOOL
    message: String                     // Message content
    tool_calls: Option<List<ToolCall>>  // For CHATBOT role with tool use
    tool_results: Option<List<ToolResult>> // For TOOL role

ENUM ChatRole:
    USER
    CHATBOT
    SYSTEM
    TOOL

STRUCT Connector:
    id: String                          // Connector ID
    user_access_token: Option<String>   // OAuth token for connector
    continue_on_failure: Option<Boolean> // Continue if connector fails
    options: Option<Map<String, Any>>   // Connector-specific options

STRUCT Document:
    id: Option<String>                  // Document ID
    title: Option<String>               // Document title
    text: String                        // Document content
    url: Option<String>                 // Source URL

STRUCT Tool:
    name: String                        // Tool name
    description: String                 // Tool description
    parameter_definitions: Map<String, ParameterDefinition>

STRUCT ParameterDefinition:
    type: String                        // "string", "number", "boolean", "object", "array"
    description: String                 // Parameter description
    required: Boolean                   // Is required
    default: Option<Any>                // Default value

STRUCT ToolResult:
    call: ToolCall                      // Original tool call
    outputs: List<Map<String, Any>>     // Tool outputs

ENUM CitationQuality:
    Fast
    Accurate

ENUM PromptTruncation:
    Off
    Auto

STRUCT ResponseFormat:
    type: ResponseFormatType            // "text" or "json_object"
    schema: Option<JsonSchema>          // JSON schema if type is json_object

ENUM ResponseFormatType:
    Text
    JsonObject
```

### 11.3 Chat Response Types

```pseudocode
STRUCT ChatResponse:
    // Response content
    text: String                        // Generated text
    generation_id: String               // Unique generation ID

    // Citations (when RAG is used)
    citations: Option<List<Citation>>
    documents: Option<List<DocumentWithScore>>
    search_queries: Option<List<SearchQuery>>
    search_results: Option<List<SearchResult>>

    // Tool use
    tool_calls: Option<List<ToolCall>>
    is_search_required: Option<Boolean>

    // Token usage
    meta: ChatResponseMeta

    // Finish reason
    finish_reason: FinishReason

STRUCT Citation:
    start: u32                          // Start character index
    end: u32                            // End character index
    text: String                        // Cited text
    document_ids: List<String>          // Source document IDs

STRUCT DocumentWithScore:
    id: String
    title: Option<String>
    text: String
    url: Option<String>
    score: Option<f64>                  // Relevance score

STRUCT SearchQuery:
    text: String                        // Generated search query
    generation_id: String

STRUCT SearchResult:
    search_query: SearchQuery
    connector: ConnectorInfo
    document_ids: List<String>

STRUCT ToolCall:
    name: String                        // Tool name
    parameters: Map<String, Any>        // Tool parameters

STRUCT ChatResponseMeta:
    api_version: ApiVersion
    billed_units: BilledUnits
    tokens: Option<TokenUsage>
    warnings: Option<List<String>>

STRUCT BilledUnits:
    input_tokens: Option<u32>
    output_tokens: Option<u32>
    search_units: Option<u32>
    classifications: Option<u32>

STRUCT TokenUsage:
    input_tokens: u32
    output_tokens: u32

ENUM FinishReason:
    Complete                            // Natural completion
    MaxTokens                           // Hit token limit
    StopSequence                        // Hit stop sequence
    ToolCall                            // Tool call required
    Error                               // Error occurred
```

### 11.4 Chat Service Implementation

```pseudocode
CLASS ChatService IMPLEMENTS ChatServiceInterface:
    PRIVATE context: ServiceContext
    PRIVATE request_builder: CohereRequestBuilder
    PRIVATE response_handler: ResponseHandler
    PRIVATE sse_parser: SSEParser

    CONSTRUCTOR(context: ServiceContext):
        this.context = context
        this.request_builder = CohereRequestBuilder.new(
            context.base_url(),
            context.config.api_version
        )
        this.response_handler = ResponseHandler.new()
        this.sse_parser = SSEParser.new()

    ASYNC FUNCTION chat(request: ChatRequest) -> Result<ChatResponse, CohereError>:
        span = this.context.span("cohere.chat")
        span.set_attribute("model", request.model.unwrap_or("command-r-plus"))

        TRY:
            // Validate request
            this.validate_chat_request(request)?

            // Build HTTP request
            http_request = this.build_chat_request(request, false)?

            // Execute with resilience
            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "chat",
                    endpoint: "/v1/chat",
                    idempotent: false,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            // Parse response
            chat_response = this.response_handler.handle<ChatResponse>(response)?

            // Record metrics
            this.record_chat_metrics(chat_response.meta)

            RETURN Ok(chat_response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION chat_stream(request: ChatRequest) -> Result<EventStream<CohereStreamEvent>, CohereError>:
        span = this.context.span("cohere.chat_stream")
        span.set_attribute("model", request.model.unwrap_or("command-r-plus"))

        TRY:
            // Validate request
            this.validate_chat_request(request)?

            // Build HTTP request with streaming enabled
            http_request = this.build_chat_request(request, true)?

            // Execute with resilience (streaming)
            executor = this.context.create_executor()
            byte_stream = AWAIT executor.execute(
                || this.context.transport.send_streaming(http_request.clone()),
                OperationContext {
                    operation_name: "chat_stream",
                    endpoint: "/v1/chat",
                    idempotent: false,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            // Return event stream
            RETURN Ok(this.sse_parser.parse(byte_stream))

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION message(message: String, model: Option<String>) -> Result<ChatResponse, CohereError>:
        request = ChatRequest {
            message: message,
            model: model,
            // All other fields None for simple usage
            ..ChatRequest.default()
        }
        RETURN AWAIT this.chat(request)

    ASYNC FUNCTION chat_with_rag(request: ChatWithRagRequest) -> Result<ChatResponse, CohereError>:
        // Convert to ChatRequest with RAG configuration
        chat_request = ChatRequest {
            message: request.message,
            model: request.model,
            chat_history: request.chat_history,
            preamble: request.preamble,
            connectors: request.connectors,
            documents: request.documents,
            citation_quality: request.citation_quality,
            prompt_truncation: request.prompt_truncation,
            ..ChatRequest.default()
        }

        RETURN AWAIT this.chat(chat_request)

    ASYNC FUNCTION chat_with_tools(request: ChatWithToolsRequest) -> Result<ChatResponse, CohereError>:
        // Convert to ChatRequest with tool configuration
        chat_request = ChatRequest {
            message: request.message,
            model: request.model,
            chat_history: request.chat_history,
            preamble: request.preamble,
            tools: Some(request.tools),
            tool_results: request.tool_results,
            force_single_step: request.force_single_step,
            ..ChatRequest.default()
        }

        RETURN AWAIT this.chat(chat_request)

    PRIVATE FUNCTION validate_chat_request(request: ChatRequest) -> Result<(), CohereError>:
        // Message is required
        IF request.message.is_empty():
            RETURN Err(CohereError::ValidationError {
                message: "message is required and cannot be empty"
            })

        // Validate temperature
        IF let Some(temp) = request.temperature:
            IF temp < 0.0 OR temp > 1.0:
                RETURN Err(CohereError::ValidationError {
                    message: "temperature must be between 0.0 and 1.0"
                })

        // Validate top_p
        IF let Some(p) = request.p:
            IF p < 0.0 OR p > 1.0:
                RETURN Err(CohereError::ValidationError {
                    message: "p (top_p) must be between 0.0 and 1.0"
                })

        // Validate frequency_penalty
        IF let Some(fp) = request.frequency_penalty:
            IF fp < -2.0 OR fp > 2.0:
                RETURN Err(CohereError::ValidationError {
                    message: "frequency_penalty must be between -2.0 and 2.0"
                })

        // Validate presence_penalty
        IF let Some(pp) = request.presence_penalty:
            IF pp < -2.0 OR pp > 2.0:
                RETURN Err(CohereError::ValidationError {
                    message: "presence_penalty must be between -2.0 and 2.0"
                })

        // Validate tools
        IF let Some(tools) = request.tools:
            FOR tool IN tools:
                IF tool.name.is_empty():
                    RETURN Err(CohereError::ValidationError {
                        message: "tool name cannot be empty"
                    })
                IF tool.description.is_empty():
                    RETURN Err(CohereError::ValidationError {
                        message: "tool description cannot be empty"
                    })

        RETURN Ok(())

    PRIVATE FUNCTION build_chat_request(request: ChatRequest, stream: Boolean) -> Result<HttpRequest, CohereError>:
        // Build request body
        body = ChatRequestBody {
            message: request.message,
            model: request.model.unwrap_or("command-r-plus"),
            chat_history: request.chat_history,
            preamble: request.preamble,
            conversation_id: request.conversation_id,
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            max_input_tokens: request.max_input_tokens,
            k: request.k,
            p: request.p,
            stop_sequences: request.stop_sequences,
            frequency_penalty: request.frequency_penalty,
            presence_penalty: request.presence_penalty,
            seed: request.seed,
            connectors: request.connectors,
            documents: request.documents,
            search_queries_only: request.search_queries_only,
            citation_quality: request.citation_quality,
            prompt_truncation: request.prompt_truncation,
            tools: request.tools,
            tool_results: request.tool_results,
            force_single_step: request.force_single_step,
            response_format: request.response_format,
            stream: stream,
        }

        http_request = this.request_builder
            .chat_completion()
            .json(body)
            .build()?

        RETURN Ok(http_request)

    PRIVATE FUNCTION record_chat_metrics(meta: ChatResponseMeta):
        IF let Some(tokens) = meta.tokens:
            this.context.record_metric(
                "cohere.chat.input_tokens",
                tokens.input_tokens as f64,
                Map.new()
            )
            this.context.record_metric(
                "cohere.chat.output_tokens",
                tokens.output_tokens as f64,
                Map.new()
            )

        IF let Some(billed) = meta.billed_units:
            IF let Some(search) = billed.search_units:
                this.context.record_metric(
                    "cohere.chat.search_units",
                    search as f64,
                    Map.new()
                )
```

### 11.5 Convenience Types for RAG and Tools

```pseudocode
STRUCT ChatWithRagRequest:
    message: String
    model: Option<String>
    chat_history: Option<List<ChatMessage>>
    preamble: Option<String>
    connectors: Option<List<Connector>>
    documents: Option<List<Document>>
    citation_quality: Option<CitationQuality>
    prompt_truncation: Option<PromptTruncation>

STRUCT ChatWithToolsRequest:
    message: String
    model: Option<String>
    chat_history: Option<List<ChatMessage>>
    preamble: Option<String>
    tools: List<Tool>
    tool_results: Option<List<ToolResult>>
    force_single_step: Option<Boolean>
```

---

## 12. Generate Service

### 12.1 Generate Service Interface

```pseudocode
INTERFACE GenerateServiceInterface:
    /**
     * Generates text completion
     */
    ASYNC FUNCTION generate(request: GenerateRequest) -> Result<GenerateResponse, CohereError>

    /**
     * Generates text with streaming
     */
    ASYNC FUNCTION generate_stream(request: GenerateRequest) -> Result<EventStream<CohereStreamEvent>, CohereError>

    /**
     * Simple text completion
     */
    ASYNC FUNCTION complete(prompt: String, model: Option<String>) -> Result<String, CohereError>

    /**
     * Batch generation for multiple prompts
     */
    ASYNC FUNCTION generate_batch(requests: List<GenerateRequest>) -> Result<List<GenerateResponse>, CohereError>
```

### 12.2 Generate Request Types

```pseudocode
STRUCT GenerateRequest:
    // Required
    prompt: String                      // Text prompt

    // Model selection
    model: Option<String>               // Default: "command"

    // Generation parameters
    num_generations: Option<u32>        // Number of generations (1-5)
    max_tokens: Option<u32>             // Maximum tokens to generate
    temperature: Option<f64>            // 0.0-5.0
    k: Option<u32>                      // Top-k sampling (0-500)
    p: Option<f64>                      // Top-p sampling (0.0-1.0)
    stop_sequences: Option<List<String>> // Stop generation sequences
    frequency_penalty: Option<f64>      // 0.0-1.0
    presence_penalty: Option<f64>       // 0.0-1.0
    seed: Option<u64>                   // Random seed

    // Output configuration
    return_likelihoods: Option<ReturnLikelihoods>
    truncate: Option<Truncate>

    // Streaming
    stream: Option<Boolean>

ENUM ReturnLikelihoods:
    None
    Generation
    All

ENUM Truncate:
    None
    Start
    End
```

### 12.3 Generate Response Types

```pseudocode
STRUCT GenerateResponse:
    id: String                          // Generation ID
    generations: List<Generation>       // Generated texts
    prompt: String                      // Echo of input prompt
    meta: GenerateResponseMeta

STRUCT Generation:
    id: String                          // Individual generation ID
    text: String                        // Generated text
    finish_reason: FinishReason
    token_likelihoods: Option<List<TokenLikelihood>>

STRUCT TokenLikelihood:
    token: String
    likelihood: f64

STRUCT GenerateResponseMeta:
    api_version: ApiVersion
    billed_units: BilledUnits
    warnings: Option<List<String>>
```

### 12.4 Generate Service Implementation

```pseudocode
CLASS GenerateService IMPLEMENTS GenerateServiceInterface:
    PRIVATE context: ServiceContext
    PRIVATE request_builder: CohereRequestBuilder
    PRIVATE response_handler: ResponseHandler
    PRIVATE sse_parser: SSEParser

    CONSTRUCTOR(context: ServiceContext):
        this.context = context
        this.request_builder = CohereRequestBuilder.new(
            context.base_url(),
            context.config.api_version
        )
        this.response_handler = ResponseHandler.new()
        this.sse_parser = SSEParser.new()

    ASYNC FUNCTION generate(request: GenerateRequest) -> Result<GenerateResponse, CohereError>:
        span = this.context.span("cohere.generate")
        span.set_attribute("model", request.model.unwrap_or("command"))

        TRY:
            // Validate request
            this.validate_generate_request(request)?

            // Build HTTP request
            http_request = this.build_generate_request(request, false)?

            // Execute with resilience
            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "generate",
                    endpoint: "/v1/generate",
                    idempotent: false,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            // Parse response
            generate_response = this.response_handler.handle<GenerateResponse>(response)?

            // Record metrics
            this.record_generate_metrics(generate_response.meta)

            RETURN Ok(generate_response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION generate_stream(request: GenerateRequest) -> Result<EventStream<CohereStreamEvent>, CohereError>:
        span = this.context.span("cohere.generate_stream")

        TRY:
            // Validate request
            this.validate_generate_request(request)?

            // For streaming, num_generations must be 1
            IF request.num_generations.unwrap_or(1) > 1:
                RETURN Err(CohereError::ValidationError {
                    message: "num_generations must be 1 for streaming"
                })

            // Build HTTP request with streaming
            http_request = this.build_generate_request(request, true)?

            // Execute
            executor = this.context.create_executor()
            byte_stream = AWAIT executor.execute(
                || this.context.transport.send_streaming(http_request.clone()),
                OperationContext {
                    operation_name: "generate_stream",
                    endpoint: "/v1/generate",
                    idempotent: false,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            RETURN Ok(this.sse_parser.parse(byte_stream))

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION complete(prompt: String, model: Option<String>) -> Result<String, CohereError>:
        request = GenerateRequest {
            prompt: prompt,
            model: model,
            num_generations: Some(1),
            ..GenerateRequest.default()
        }

        response = AWAIT this.generate(request)?

        IF response.generations.is_empty():
            RETURN Err(CohereError::UnexpectedResponse {
                message: "No generations returned"
            })

        RETURN Ok(response.generations[0].text.clone())

    ASYNC FUNCTION generate_batch(requests: List<GenerateRequest>) -> Result<List<GenerateResponse>, CohereError>:
        span = this.context.span("cohere.generate_batch")
        span.set_attribute("batch_size", requests.len())

        TRY:
            // Execute all requests concurrently with semaphore
            semaphore = Semaphore.new(10)  // Max 10 concurrent requests
            futures = []

            FOR request IN requests:
                permit = AWAIT semaphore.acquire()
                future = async {
                    result = AWAIT this.generate(request)
                    drop(permit)
                    result
                }
                futures.push(future)

            // Collect results
            results = AWAIT join_all(futures)

            // Check for errors
            responses = []
            FOR result IN results:
                responses.push(result?)

            RETURN Ok(responses)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    PRIVATE FUNCTION validate_generate_request(request: GenerateRequest) -> Result<(), CohereError>:
        IF request.prompt.is_empty():
            RETURN Err(CohereError::ValidationError {
                message: "prompt is required and cannot be empty"
            })

        IF let Some(num) = request.num_generations:
            IF num < 1 OR num > 5:
                RETURN Err(CohereError::ValidationError {
                    message: "num_generations must be between 1 and 5"
                })

        IF let Some(temp) = request.temperature:
            IF temp < 0.0 OR temp > 5.0:
                RETURN Err(CohereError::ValidationError {
                    message: "temperature must be between 0.0 and 5.0"
                })

        IF let Some(k) = request.k:
            IF k > 500:
                RETURN Err(CohereError::ValidationError {
                    message: "k must be between 0 and 500"
                })

        IF let Some(p) = request.p:
            IF p < 0.0 OR p > 1.0:
                RETURN Err(CohereError::ValidationError {
                    message: "p must be between 0.0 and 1.0"
                })

        IF let Some(fp) = request.frequency_penalty:
            IF fp < 0.0 OR fp > 1.0:
                RETURN Err(CohereError::ValidationError {
                    message: "frequency_penalty must be between 0.0 and 1.0"
                })

        IF let Some(pp) = request.presence_penalty:
            IF pp < 0.0 OR pp > 1.0:
                RETURN Err(CohereError::ValidationError {
                    message: "presence_penalty must be between 0.0 and 1.0"
                })

        RETURN Ok(())

    PRIVATE FUNCTION build_generate_request(request: GenerateRequest, stream: Boolean) -> Result<HttpRequest, CohereError>:
        body = GenerateRequestBody {
            prompt: request.prompt,
            model: request.model.unwrap_or("command"),
            num_generations: request.num_generations,
            max_tokens: request.max_tokens,
            temperature: request.temperature,
            k: request.k,
            p: request.p,
            stop_sequences: request.stop_sequences,
            frequency_penalty: request.frequency_penalty,
            presence_penalty: request.presence_penalty,
            seed: request.seed,
            return_likelihoods: request.return_likelihoods,
            truncate: request.truncate,
            stream: stream,
        }

        http_request = this.request_builder
            .generate()
            .json(body)
            .build()?

        RETURN Ok(http_request)

    PRIVATE FUNCTION record_generate_metrics(meta: GenerateResponseMeta):
        IF let Some(billed) = meta.billed_units:
            IF let Some(input) = billed.input_tokens:
                this.context.record_metric("cohere.generate.input_tokens", input as f64, Map.new())
            IF let Some(output) = billed.output_tokens:
                this.context.record_metric("cohere.generate.output_tokens", output as f64, Map.new())
```

---

## 13. Embed Service

### 13.1 Embed Service Interface

```pseudocode
INTERFACE EmbedServiceInterface:
    /**
     * Generates embeddings for texts
     */
    ASYNC FUNCTION embed(request: EmbedRequest) -> Result<EmbedResponse, CohereError>

    /**
     * Simple embedding for single text
     */
    ASYNC FUNCTION embed_text(text: String, model: Option<String>) -> Result<List<f64>, CohereError>

    /**
     * Embed multiple texts
     */
    ASYNC FUNCTION embed_texts(texts: List<String>, model: Option<String>) -> Result<List<List<f64>>, CohereError>

    /**
     * Embed with specific embedding type
     */
    ASYNC FUNCTION embed_typed(
        texts: List<String>,
        embedding_types: List<EmbeddingType>,
        model: Option<String>
    ) -> Result<EmbedTypedResponse, CohereError>
```

### 13.2 Embed Request Types

```pseudocode
STRUCT EmbedRequest:
    // Required
    texts: List<String>                 // Texts to embed (max 96)

    // Model selection
    model: Option<String>               // Default: "embed-english-v3.0"

    // Embedding configuration
    input_type: Option<InputType>       // search_document, search_query, etc.
    embedding_types: Option<List<EmbeddingType>> // float, int8, etc.
    truncate: Option<EmbedTruncate>     // None, Start, End

ENUM InputType:
    SearchDocument                      // For documents in search index
    SearchQuery                         // For search queries
    Classification                      // For classification
    Clustering                          // For clustering

ENUM EmbeddingType:
    Float                               // float32 embeddings
    Int8                                // int8 quantized
    Uint8                               // uint8 quantized
    Binary                              // binary (1-bit)
    Ubinary                             // unsigned binary

ENUM EmbedTruncate:
    None
    Start
    End
```

### 13.3 Embed Response Types

```pseudocode
STRUCT EmbedResponse:
    id: String                          // Request ID
    embeddings: List<List<f64>>         // Float embeddings (default)
    texts: List<String>                 // Echo of input texts
    meta: EmbedResponseMeta

STRUCT EmbedTypedResponse:
    id: String
    embeddings: EmbeddingsByType
    texts: List<String>
    meta: EmbedResponseMeta

STRUCT EmbeddingsByType:
    float: Option<List<List<f64>>>      // float32 embeddings
    int8: Option<List<List<i8>>>        // int8 embeddings
    uint8: Option<List<List<u8>>>       // uint8 embeddings
    binary: Option<List<List<i8>>>      // binary embeddings
    ubinary: Option<List<List<u8>>>     // unsigned binary embeddings

STRUCT EmbedResponseMeta:
    api_version: ApiVersion
    billed_units: BilledUnits
    warnings: Option<List<String>>
```

### 13.4 Embed Service Implementation

```pseudocode
CLASS EmbedService IMPLEMENTS EmbedServiceInterface:
    PRIVATE context: ServiceContext
    PRIVATE request_builder: CohereRequestBuilder
    PRIVATE response_handler: ResponseHandler

    CONSTRUCTOR(context: ServiceContext):
        this.context = context
        this.request_builder = CohereRequestBuilder.new(
            context.base_url(),
            context.config.api_version
        )
        this.response_handler = ResponseHandler.new()

    ASYNC FUNCTION embed(request: EmbedRequest) -> Result<EmbedResponse, CohereError>:
        span = this.context.span("cohere.embed")
        span.set_attribute("model", request.model.unwrap_or("embed-english-v3.0"))
        span.set_attribute("text_count", request.texts.len())

        TRY:
            // Validate request
            this.validate_embed_request(request)?

            // Build HTTP request
            http_request = this.build_embed_request(request)?

            // Execute with resilience
            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "embed",
                    endpoint: "/v1/embed",
                    idempotent: true,  // Embeddings are idempotent
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            // Parse response
            embed_response = this.response_handler.handle<EmbedResponse>(response)?

            // Record metrics
            this.record_embed_metrics(embed_response.meta, request.texts.len())

            RETURN Ok(embed_response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION embed_text(text: String, model: Option<String>) -> Result<List<f64>, CohereError>:
        request = EmbedRequest {
            texts: vec![text],
            model: model,
            input_type: Some(InputType.SearchDocument),
            embedding_types: None,
            truncate: None,
        }

        response = AWAIT this.embed(request)?

        IF response.embeddings.is_empty():
            RETURN Err(CohereError::UnexpectedResponse {
                message: "No embeddings returned"
            })

        RETURN Ok(response.embeddings[0].clone())

    ASYNC FUNCTION embed_texts(texts: List<String>, model: Option<String>) -> Result<List<List<f64>>, CohereError>:
        // Handle batching for large requests
        IF texts.len() > 96:
            RETURN AWAIT this.embed_texts_batched(texts, model)

        request = EmbedRequest {
            texts: texts,
            model: model,
            input_type: Some(InputType.SearchDocument),
            embedding_types: None,
            truncate: None,
        }

        response = AWAIT this.embed(request)?
        RETURN Ok(response.embeddings)

    ASYNC FUNCTION embed_typed(
        texts: List<String>,
        embedding_types: List<EmbeddingType>,
        model: Option<String>
    ) -> Result<EmbedTypedResponse, CohereError>:
        span = this.context.span("cohere.embed_typed")

        TRY:
            // Validate
            IF texts.len() > 96:
                RETURN Err(CohereError::ValidationError {
                    message: "Maximum 96 texts per request"
                })

            IF embedding_types.is_empty():
                RETURN Err(CohereError::ValidationError {
                    message: "At least one embedding type required"
                })

            // Build request with typed embeddings
            body = EmbedRequestBody {
                texts: texts,
                model: model.unwrap_or("embed-english-v3.0"),
                input_type: Some("search_document"),
                embedding_types: Some(embedding_types.iter().map(|t| t.to_string()).collect()),
                truncate: None,
            }

            http_request = this.request_builder
                .embed()
                .json(body)
                .build()?

            // Execute
            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "embed_typed",
                    endpoint: "/v1/embed",
                    idempotent: true,
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            // Parse typed response
            embed_response = this.response_handler.handle<EmbedTypedResponse>(response)?

            RETURN Ok(embed_response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    PRIVATE ASYNC FUNCTION embed_texts_batched(texts: List<String>, model: Option<String>) -> Result<List<List<f64>>, CohereError>:
        // Split into batches of 96
        batches = texts.chunks(96)
        all_embeddings = []

        FOR batch IN batches:
            response = AWAIT this.embed_texts(batch.to_vec(), model.clone())?
            all_embeddings.extend(response)

        RETURN Ok(all_embeddings)

    PRIVATE FUNCTION validate_embed_request(request: EmbedRequest) -> Result<(), CohereError>:
        IF request.texts.is_empty():
            RETURN Err(CohereError::ValidationError {
                message: "texts is required and cannot be empty"
            })

        IF request.texts.len() > 96:
            RETURN Err(CohereError::ValidationError {
                message: "Maximum 96 texts per request"
            })

        FOR text IN request.texts:
            IF text.is_empty():
                RETURN Err(CohereError::ValidationError {
                    message: "Individual text cannot be empty"
                })

        RETURN Ok(())

    PRIVATE FUNCTION build_embed_request(request: EmbedRequest) -> Result<HttpRequest, CohereError>:
        body = EmbedRequestBody {
            texts: request.texts,
            model: request.model.unwrap_or("embed-english-v3.0"),
            input_type: request.input_type.map(|t| t.to_string()),
            embedding_types: request.embedding_types.map(|types|
                types.iter().map(|t| t.to_string()).collect()
            ),
            truncate: request.truncate.map(|t| t.to_string()),
        }

        http_request = this.request_builder
            .embed()
            .json(body)
            .build()?

        RETURN Ok(http_request)

    PRIVATE FUNCTION record_embed_metrics(meta: EmbedResponseMeta, text_count: usize):
        this.context.record_metric(
            "cohere.embed.text_count",
            text_count as f64,
            Map.new()
        )

        IF let Some(billed) = meta.billed_units:
            IF let Some(input) = billed.input_tokens:
                this.context.record_metric("cohere.embed.input_tokens", input as f64, Map.new())
```

---

## 14. Rerank Service

### 14.1 Rerank Service Interface

```pseudocode
INTERFACE RerankServiceInterface:
    /**
     * Reranks documents by relevance to query
     */
    ASYNC FUNCTION rerank(request: RerankRequest) -> Result<RerankResponse, CohereError>

    /**
     * Simple rerank with string documents
     */
    ASYNC FUNCTION rerank_texts(
        query: String,
        documents: List<String>,
        top_n: Option<u32>,
        model: Option<String>
    ) -> Result<List<RerankResult>, CohereError>

    /**
     * Rerank with structured documents
     */
    ASYNC FUNCTION rerank_documents(
        query: String,
        documents: List<RerankDocument>,
        rank_fields: Option<List<String>>,
        top_n: Option<u32>,
        model: Option<String>
    ) -> Result<List<RerankResult>, CohereError>
```

### 14.2 Rerank Request Types

```pseudocode
STRUCT RerankRequest:
    // Required
    query: String                       // Query to rank against
    documents: List<RerankDocument>     // Documents to rerank

    // Model selection
    model: Option<String>               // Default: "rerank-english-v3.0"

    // Ranking configuration
    top_n: Option<u32>                  // Return top N results
    rank_fields: Option<List<String>>   // Fields to use for ranking
    return_documents: Option<Boolean>   // Include documents in response
    max_chunks_per_doc: Option<u32>     // Max chunks per document

STRUCT RerankDocument:
    // Document can be string or structured
    text: Option<String>                // Simple text document
    fields: Option<Map<String, String>> // Structured document fields
```

### 14.3 Rerank Response Types

```pseudocode
STRUCT RerankResponse:
    id: String                          // Request ID
    results: List<RerankResult>         // Ranked results
    meta: RerankResponseMeta

STRUCT RerankResult:
    index: u32                          // Original document index
    relevance_score: f64                // Relevance score (0-1)
    document: Option<RerankDocument>    // Document if return_documents=true

STRUCT RerankResponseMeta:
    api_version: ApiVersion
    billed_units: BilledUnits
    warnings: Option<List<String>>
```

### 14.4 Rerank Service Implementation

```pseudocode
CLASS RerankService IMPLEMENTS RerankServiceInterface:
    PRIVATE context: ServiceContext
    PRIVATE request_builder: CohereRequestBuilder
    PRIVATE response_handler: ResponseHandler

    CONSTRUCTOR(context: ServiceContext):
        this.context = context
        this.request_builder = CohereRequestBuilder.new(
            context.base_url(),
            context.config.api_version
        )
        this.response_handler = ResponseHandler.new()

    ASYNC FUNCTION rerank(request: RerankRequest) -> Result<RerankResponse, CohereError>:
        span = this.context.span("cohere.rerank")
        span.set_attribute("model", request.model.unwrap_or("rerank-english-v3.0"))
        span.set_attribute("document_count", request.documents.len())

        TRY:
            // Validate request
            this.validate_rerank_request(request)?

            // Build HTTP request
            http_request = this.build_rerank_request(request)?

            // Execute with resilience
            executor = this.context.create_executor()
            response = AWAIT executor.execute(
                || this.context.transport.send(http_request.clone()),
                OperationContext {
                    operation_name: "rerank",
                    endpoint: "/v1/rerank",
                    idempotent: true,  // Rerank is idempotent
                    priority: Priority.Normal,
                    timeout_override: None,
                }
            )?

            // Parse response
            rerank_response = this.response_handler.handle<RerankResponse>(response)?

            // Record metrics
            this.record_rerank_metrics(rerank_response.meta, request.documents.len())

            RETURN Ok(rerank_response)

        CATCH error:
            span.set_error(error)
            RETURN Err(error)

        FINALLY:
            span.end()

    ASYNC FUNCTION rerank_texts(
        query: String,
        documents: List<String>,
        top_n: Option<u32>,
        model: Option<String>
    ) -> Result<List<RerankResult>, CohereError>:
        // Convert strings to RerankDocuments
        rerank_docs = documents
            .iter()
            .map(|text| RerankDocument { text: Some(text.clone()), fields: None })
            .collect()

        request = RerankRequest {
            query: query,
            documents: rerank_docs,
            model: model,
            top_n: top_n,
            rank_fields: None,
            return_documents: Some(false),
            max_chunks_per_doc: None,
        }

        response = AWAIT this.rerank(request)?
        RETURN Ok(response.results)

    ASYNC FUNCTION rerank_documents(
        query: String,
        documents: List<RerankDocument>,
        rank_fields: Option<List<String>>,
        top_n: Option<u32>,
        model: Option<String>
    ) -> Result<List<RerankResult>, CohereError>:
        request = RerankRequest {
            query: query,
            documents: documents,
            model: model,
            top_n: top_n,
            rank_fields: rank_fields,
            return_documents: Some(true),
            max_chunks_per_doc: None,
        }

        response = AWAIT this.rerank(request)?
        RETURN Ok(response.results)

    PRIVATE FUNCTION validate_rerank_request(request: RerankRequest) -> Result<(), CohereError>:
        IF request.query.is_empty():
            RETURN Err(CohereError::ValidationError {
                message: "query is required and cannot be empty"
            })

        IF request.documents.is_empty():
            RETURN Err(CohereError::ValidationError {
                message: "documents is required and cannot be empty"
            })

        IF request.documents.len() > 1000:
            RETURN Err(CohereError::ValidationError {
                message: "Maximum 1000 documents per request"
            })

        // Validate each document has content
        FOR (index, doc) IN request.documents.iter().enumerate():
            IF doc.text.is_none() AND doc.fields.is_none():
                RETURN Err(CohereError::ValidationError {
                    message: format!("Document at index {} must have text or fields", index)
                })

            IF let Some(text) = doc.text:
                IF text.is_empty():
                    RETURN Err(CohereError::ValidationError {
                        message: format!("Document at index {} has empty text", index)
                    })

        // Validate top_n
        IF let Some(n) = request.top_n:
            IF n == 0:
                RETURN Err(CohereError::ValidationError {
                    message: "top_n must be greater than 0"
                })
            IF n > request.documents.len() as u32:
                RETURN Err(CohereError::ValidationError {
                    message: "top_n cannot exceed number of documents"
                })

        RETURN Ok(())

    PRIVATE FUNCTION build_rerank_request(request: RerankRequest) -> Result<HttpRequest, CohereError>:
        // Convert documents to API format
        docs = request.documents.iter().map(|doc| {
            IF let Some(text) = doc.text:
                RETURN text
            ELSE IF let Some(fields) = doc.fields:
                RETURN fields
            ELSE:
                RETURN ""
        }).collect()

        body = RerankRequestBody {
            query: request.query,
            documents: docs,
            model: request.model.unwrap_or("rerank-english-v3.0"),
            top_n: request.top_n,
            rank_fields: request.rank_fields,
            return_documents: request.return_documents,
            max_chunks_per_doc: request.max_chunks_per_doc,
        }

        http_request = this.request_builder
            .rerank()
            .json(body)
            .build()?

        RETURN Ok(http_request)

    PRIVATE FUNCTION record_rerank_metrics(meta: RerankResponseMeta, doc_count: usize):
        this.context.record_metric(
            "cohere.rerank.document_count",
            doc_count as f64,
            Map.new()
        )

        IF let Some(billed) = meta.billed_units:
            IF let Some(search) = billed.search_units:
                this.context.record_metric("cohere.rerank.search_units", search as f64, Map.new())
```

---

## Summary

This document covers the primary services for the Cohere integration module:

1. **Chat Service**: Full chat completions with streaming, RAG support, tool use, and citations
2. **Generate Service**: Text generation with streaming and batch support
3. **Embed Service**: Embedding generation with multiple output types (float, int8, binary, etc.)
4. **Rerank Service**: Document reranking for semantic search applications

Key patterns implemented:
- Fluent request builders with validation
- Streaming via SSE parsing
- Batch operations with concurrency control
- Comprehensive error handling
- Metrics and tracing integration

---

**Next Document:** `pseudocode-cohere-3.md` - Classify, Summarize, Tokenize, Models, Datasets, Connectors, Fine-tuning

---

*Pseudocode Phase: Part 2 of 3 Complete*
