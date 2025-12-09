# Pseudocode: Groq Integration Module (Part 2)

## SPARC Phase 2: Pseudocode - Services & Error Handling

**Version:** 1.0.0
**Date:** 2025-01-15
**Status:** Draft
**Module:** `integrations/groq`

---

## Table of Contents

1. [Chat Service](#1-chat-service)
2. [Audio Service](#2-audio-service)
3. [Models Service](#3-models-service)
4. [Error Handling](#4-error-handling)
5. [Observability](#5-observability)
6. [Testing Patterns](#6-testing-patterns)

---

## 1. Chat Service

### 1.1 Chat Service Interface (Rust)

```rust
// services/chat.rs

use std::sync::Arc;
use tokio::sync::RwLock;

/// Chat completions service
STRUCT ChatService {
    transport: Arc<dyn HttpTransport>,
    auth: Arc<dyn AuthProvider>,
    resilience: Arc<ResilienceOrchestrator>,
    rate_limiter: Arc<RwLock<RateLimitManager>>,
}

IMPL ChatService {
    /// Create new chat service
    FUNCTION new(
        transport: Arc<dyn HttpTransport>,
        auth: Arc<dyn AuthProvider>,
        resilience: Arc<ResilienceOrchestrator>,
        rate_limiter: Arc<RwLock<RateLimitManager>>,
    ) -> Self {
        Self { transport, auth, resilience, rate_limiter }
    }

    /// Create chat completion (synchronous)
    #[instrument(skip(self, request), fields(model = %request.model))]
    ASYNC FUNCTION create(&self, request: ChatRequest) -> Result<ChatResponse, GroqError> {
        // Validate request
        request.validate()?

        // Check rate limits
        IF LET Some(wait) = self.rate_limiter.read().await.should_wait() {
            tracing::info!(wait_ms = wait.as_millis(), "Rate limit throttling")
            tokio::time::sleep(wait).await
        }

        // Build HTTP request
        LET http_request = self.build_request(&request, false)?

        // Execute with resilience
        LET response = self.resilience.execute(|| async {
            self.transport.send(http_request.clone()).await
        }).await?

        // Update rate limits from headers
        self.rate_limiter.write().await.update_from_headers(&response.headers)

        // Parse response
        self.parse_response(response)
    }

    /// Create streaming chat completion
    #[instrument(skip(self, request), fields(model = %request.model))]
    ASYNC FUNCTION create_stream(&self, request: ChatRequest) -> Result<ChatStream, GroqError> {
        // Validate request
        request.validate()?

        // Ensure stream is enabled
        LET mut stream_request = request
        stream_request.stream = Some(true)

        // Check rate limits
        IF LET Some(wait) = self.rate_limiter.read().await.should_wait() {
            tracing::info!(wait_ms = wait.as_millis(), "Rate limit throttling")
            tokio::time::sleep(wait).await
        }

        // Build HTTP request
        LET http_request = self.build_request(&stream_request, true)?

        // Send streaming request (no retry for streams)
        LET response = self.transport.send_streaming(http_request).await
            .map_err(|e| GroqError::NetworkError {
                message: e.to_string(),
                cause: None,
            })?

        // Update rate limits
        self.rate_limiter.write().await.update_from_headers(&response.headers)

        // Check status
        IF response.status != 200 {
            RETURN Err(self.parse_error_status(response.status, &response.headers))
        }

        // Create stream
        ChatStream::new(response)
    }

    /// Create with timeout override
    ASYNC FUNCTION create_with_timeout(
        &self,
        request: ChatRequest,
        timeout: Duration,
    ) -> Result<ChatResponse, GroqError> {
        LET mut http_request = self.build_request(&request, false)?
        http_request.timeout = Some(timeout)

        LET response = self.resilience.execute(|| async {
            self.transport.send(http_request.clone()).await
        }).await?

        self.rate_limiter.write().await.update_from_headers(&response.headers)
        self.parse_response(response)
    }

    /// Build HTTP request from chat request
    FUNCTION build_request(&self, request: &ChatRequest, streaming: bool) -> Result<HttpRequest, GroqError> {
        // Serialize body
        LET body = serde_json::to_vec(request)
            .map_err(|e| GroqError::ValidationError {
                message: format!("Failed to serialize request: {}", e),
                param: None,
                value: None,
            })?

        // Build headers
        LET mut headers = HashMap::new()
        headers.insert("Content-Type".to_string(), "application/json".to_string())

        IF streaming {
            headers.insert("Accept".to_string(), "text/event-stream".to_string())
        }

        // Apply auth
        self.auth.apply_auth(&mut headers)

        Ok(HttpRequest {
            method: HttpMethod::Post,
            path: "/chat/completions".to_string(),
            headers,
            body: Some(body),
            timeout: None,
        })
    }

    /// Parse chat response
    FUNCTION parse_response(&self, response: HttpResponse) -> Result<ChatResponse, GroqError> {
        // Check status code
        IF response.status != 200 {
            RETURN Err(self.parse_error_response(&response))
        }

        // Parse JSON
        serde_json::from_slice(&response.body)
            .map_err(|e| GroqError::ServerError {
                message: format!("Failed to parse response: {}", e),
                status_code: response.status,
                request_id: response.headers.get("x-request-id").cloned(),
            })
    }

    /// Parse error response
    FUNCTION parse_error_response(&self, response: &HttpResponse) -> GroqError {
        LET request_id = response.headers.get("x-request-id").cloned()

        // Try to parse error body
        IF LET Ok(error_body) = serde_json::from_slice::<GroqErrorResponse>(&response.body) {
            RETURN self.map_error(response.status, error_body, request_id)
        }

        // Fallback to status-based error
        self.parse_error_status(response.status, &response.headers)
    }

    /// Map Groq error to internal error
    FUNCTION map_error(
        &self,
        status: u16,
        error: GroqErrorResponse,
        request_id: Option<String>,
    ) -> GroqError {
        MATCH (status, error.error.type_.as_str()) {
            (401, _) | (_, "invalid_api_key") => GroqError::AuthenticationError {
                message: error.error.message,
                api_key_hint: None,
            },
            (403, _) => GroqError::AuthorizationError {
                message: error.error.message,
                required_permission: None,
            },
            (404, _) | (_, "model_not_found") => GroqError::ModelError {
                message: error.error.message,
                model: error.error.param.unwrap_or_default(),
                available_models: None,
            },
            (400, _) | (_, "invalid_request_error") => GroqError::ValidationError {
                message: error.error.message,
                param: error.error.param,
                value: None,
            },
            (429, _) => {
                LET retry_after = self.parse_retry_after(&error.error.message);
                GroqError::RateLimitError {
                    message: error.error.message,
                    retry_after,
                    limit_type: RateLimitType::Requests,
                }
            },
            (_, "context_length_exceeded") => GroqError::ContextLengthError {
                message: error.error.message,
                max_context: 0, // Would parse from message
                requested: 0,
            },
            (_, "content_filter") => GroqError::ContentFilterError {
                message: error.error.message,
                filtered_categories: vec![],
            },
            _ => GroqError::ServerError {
                message: error.error.message,
                status_code: status,
                request_id,
            },
        }
    }

    /// Parse error from status code
    FUNCTION parse_error_status(&self, status: u16, headers: &HashMap<String, String>) -> GroqError {
        LET request_id = headers.get("x-request-id").cloned()

        MATCH status {
            401 => GroqError::AuthenticationError {
                message: "Invalid API key".to_string(),
                api_key_hint: None,
            },
            403 => GroqError::AuthorizationError {
                message: "Forbidden".to_string(),
                required_permission: None,
            },
            404 => GroqError::ModelError {
                message: "Resource not found".to_string(),
                model: String::new(),
                available_models: None,
            },
            429 => {
                LET retry_after = headers.get("retry-after")
                    .and_then(|s| s.parse::<u64>().ok())
                    .map(Duration::from_secs);
                GroqError::RateLimitError {
                    message: "Rate limit exceeded".to_string(),
                    retry_after,
                    limit_type: RateLimitType::Requests,
                }
            },
            500..=599 => GroqError::ServerError {
                message: format!("Server error: {}", status),
                status_code: status,
                request_id,
            },
            _ => GroqError::ServerError {
                message: format!("Unexpected status: {}", status),
                status_code: status,
                request_id,
            },
        }
    }

    /// Parse retry-after from error message
    FUNCTION parse_retry_after(&self, message: &str) -> Option<Duration> {
        // Look for patterns like "try again in Xs" or "retry after X seconds"
        // This is a simplified parser
        None
    }
}
```

### 1.2 Chat Request Types (Rust)

```rust
// types/chat.rs

use serde::{Deserialize, Serialize};

/// Chat completion request
#[derive(Debug, Clone, Serialize)]
STRUCT ChatRequest {
    /// Model ID (required)
    pub model: String,

    /// Messages array (required)
    pub messages: Vec<Message>,

    /// Temperature (0.0-2.0)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,

    /// Max completion tokens
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,

    /// Top P sampling
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,

    /// Stop sequences
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop: Option<Vec<String>>,

    /// Frequency penalty
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frequency_penalty: Option<f32>,

    /// Presence penalty
    #[serde(skip_serializing_if = "Option::is_none")]
    pub presence_penalty: Option<f32>,

    /// Response format
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_format: Option<ResponseFormat>,

    /// Seed for reproducibility
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seed: Option<i64>,

    /// Tools/functions
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<Tool>>,

    /// Tool choice
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<ToolChoice>,

    /// End user ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,

    /// Enable streaming
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,

    /// Stream options
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream_options: Option<StreamOptions>,
}

IMPL ChatRequest {
    /// Create new request with model and messages
    FUNCTION new(model: impl Into<String>, messages: Vec<Message>) -> Self {
        Self {
            model: model.into(),
            messages,
            temperature: None,
            max_tokens: None,
            top_p: None,
            stop: None,
            frequency_penalty: None,
            presence_penalty: None,
            response_format: None,
            seed: None,
            tools: None,
            tool_choice: None,
            user: None,
            stream: None,
            stream_options: None,
        }
    }

    /// Create builder
    FUNCTION builder() -> ChatRequestBuilder {
        ChatRequestBuilder::new()
    }

    /// Validate request
    FUNCTION validate(&self) -> Result<(), GroqError> {
        // Model is required
        IF self.model.is_empty() {
            RETURN Err(GroqError::ValidationError {
                message: "Model is required".to_string(),
                param: Some("model".to_string()),
                value: None,
            })
        }

        // Messages required
        IF self.messages.is_empty() {
            RETURN Err(GroqError::ValidationError {
                message: "At least one message is required".to_string(),
                param: Some("messages".to_string()),
                value: None,
            })
        }

        // Validate temperature range
        IF LET Some(temp) = self.temperature {
            IF temp < 0.0 || temp > 2.0 {
                RETURN Err(GroqError::ValidationError {
                    message: "Temperature must be between 0.0 and 2.0".to_string(),
                    param: Some("temperature".to_string()),
                    value: Some(temp.to_string()),
                })
            }
        }

        // Validate top_p range
        IF LET Some(top_p) = self.top_p {
            IF top_p < 0.0 || top_p > 1.0 {
                RETURN Err(GroqError::ValidationError {
                    message: "top_p must be between 0.0 and 1.0".to_string(),
                    param: Some("top_p".to_string()),
                    value: Some(top_p.to_string()),
                })
            }
        }

        // Validate frequency_penalty range
        IF LET Some(fp) = self.frequency_penalty {
            IF fp < -2.0 || fp > 2.0 {
                RETURN Err(GroqError::ValidationError {
                    message: "frequency_penalty must be between -2.0 and 2.0".to_string(),
                    param: Some("frequency_penalty".to_string()),
                    value: Some(fp.to_string()),
                })
            }
        }

        // Validate presence_penalty range
        IF LET Some(pp) = self.presence_penalty {
            IF pp < -2.0 || pp > 2.0 {
                RETURN Err(GroqError::ValidationError {
                    message: "presence_penalty must be between -2.0 and 2.0".to_string(),
                    param: Some("presence_penalty".to_string()),
                    value: Some(pp.to_string()),
                })
            }
        }

        // Validate messages
        FOR (i, msg) IN self.messages.iter().enumerate() {
            msg.validate().map_err(|e| {
                GroqError::ValidationError {
                    message: format!("Message {}: {}", i, e),
                    param: Some(format!("messages[{}]", i)),
                    value: None,
                }
            })?
        }

        // Validate tools if present
        IF LET Some(ref tools) = self.tools {
            FOR (i, tool) IN tools.iter().enumerate() {
                tool.validate().map_err(|e| {
                    GroqError::ValidationError {
                        message: format!("Tool {}: {}", i, e),
                        param: Some(format!("tools[{}]", i)),
                        value: None,
                    }
                })?
            }
        }

        Ok(())
    }
}

/// Chat request builder
STRUCT ChatRequestBuilder {
    model: Option<String>,
    messages: Vec<Message>,
    temperature: Option<f32>,
    max_tokens: Option<u32>,
    top_p: Option<f32>,
    stop: Option<Vec<String>>,
    frequency_penalty: Option<f32>,
    presence_penalty: Option<f32>,
    response_format: Option<ResponseFormat>,
    seed: Option<i64>,
    tools: Option<Vec<Tool>>,
    tool_choice: Option<ToolChoice>,
    user: Option<String>,
    stream: Option<bool>,
    stream_options: Option<StreamOptions>,
}

IMPL ChatRequestBuilder {
    FUNCTION new() -> Self {
        Self {
            model: None,
            messages: Vec::new(),
            temperature: None,
            max_tokens: None,
            top_p: None,
            stop: None,
            frequency_penalty: None,
            presence_penalty: None,
            response_format: None,
            seed: None,
            tools: None,
            tool_choice: None,
            user: None,
            stream: None,
            stream_options: None,
        }
    }

    FUNCTION model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into())
        self
    }

    FUNCTION messages(mut self, messages: Vec<Message>) -> Self {
        self.messages = messages
        self
    }

    FUNCTION message(mut self, message: Message) -> Self {
        self.messages.push(message)
        self
    }

    FUNCTION system(mut self, content: impl Into<String>) -> Self {
        self.messages.push(Message::system(content))
        self
    }

    FUNCTION user(mut self, content: impl Into<String>) -> Self {
        self.messages.push(Message::user(content))
        self
    }

    FUNCTION assistant(mut self, content: impl Into<String>) -> Self {
        self.messages.push(Message::assistant(content))
        self
    }

    FUNCTION temperature(mut self, temp: f32) -> Self {
        self.temperature = Some(temp)
        self
    }

    FUNCTION max_tokens(mut self, tokens: u32) -> Self {
        self.max_tokens = Some(tokens)
        self
    }

    FUNCTION top_p(mut self, top_p: f32) -> Self {
        self.top_p = Some(top_p)
        self
    }

    FUNCTION stop(mut self, sequences: Vec<String>) -> Self {
        self.stop = Some(sequences)
        self
    }

    FUNCTION frequency_penalty(mut self, penalty: f32) -> Self {
        self.frequency_penalty = Some(penalty)
        self
    }

    FUNCTION presence_penalty(mut self, penalty: f32) -> Self {
        self.presence_penalty = Some(penalty)
        self
    }

    FUNCTION json_mode(mut self) -> Self {
        self.response_format = Some(ResponseFormat {
            type_: ResponseFormatType::JsonObject,
        })
        self
    }

    FUNCTION seed(mut self, seed: i64) -> Self {
        self.seed = Some(seed)
        self
    }

    FUNCTION tools(mut self, tools: Vec<Tool>) -> Self {
        self.tools = Some(tools)
        self
    }

    FUNCTION tool(mut self, tool: Tool) -> Self {
        self.tools.get_or_insert_with(Vec::new).push(tool)
        self
    }

    FUNCTION tool_choice(mut self, choice: ToolChoice) -> Self {
        self.tool_choice = Some(choice)
        self
    }

    FUNCTION user_id(mut self, user: impl Into<String>) -> Self {
        self.user = Some(user.into())
        self
    }

    FUNCTION stream(mut self, stream: bool) -> Self {
        self.stream = Some(stream)
        self
    }

    FUNCTION include_usage(mut self) -> Self {
        self.stream_options = Some(StreamOptions { include_usage: Some(true) })
        self
    }

    FUNCTION build(self) -> Result<ChatRequest, GroqError> {
        LET model = self.model.ok_or_else(|| GroqError::ValidationError {
            message: "Model is required".to_string(),
            param: Some("model".to_string()),
            value: None,
        })?

        IF self.messages.is_empty() {
            RETURN Err(GroqError::ValidationError {
                message: "At least one message is required".to_string(),
                param: Some("messages".to_string()),
                value: None,
            })
        }

        LET request = ChatRequest {
            model,
            messages: self.messages,
            temperature: self.temperature,
            max_tokens: self.max_tokens,
            top_p: self.top_p,
            stop: self.stop,
            frequency_penalty: self.frequency_penalty,
            presence_penalty: self.presence_penalty,
            response_format: self.response_format,
            seed: self.seed,
            tools: self.tools,
            tool_choice: self.tool_choice,
            user: self.user,
            stream: self.stream,
            stream_options: self.stream_options,
        }

        request.validate()?
        Ok(request)
    }
}
```

### 1.3 Message Types (Rust)

```rust
// types/chat.rs (continued)

/// Chat message
#[derive(Debug, Clone, Serialize, Deserialize)]
STRUCT Message {
    /// Message role
    pub role: Role,

    /// Message content
    pub content: Content,

    /// Participant name (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// Tool calls (for assistant messages)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,

    /// Tool call ID (for tool messages)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

IMPL Message {
    /// Create system message
    FUNCTION system(content: impl Into<String>) -> Self {
        Self {
            role: Role::System,
            content: Content::Text(content.into()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }
    }

    /// Create user message
    FUNCTION user(content: impl Into<String>) -> Self {
        Self {
            role: Role::User,
            content: Content::Text(content.into()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }
    }

    /// Create user message with vision content
    FUNCTION user_with_image(text: impl Into<String>, image_url: impl Into<String>) -> Self {
        Self {
            role: Role::User,
            content: Content::Parts(vec![
                ContentPart::Text { text: text.into() },
                ContentPart::ImageUrl {
                    image_url: ImageUrl {
                        url: image_url.into(),
                        detail: None,
                    },
                },
            ]),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }
    }

    /// Create assistant message
    FUNCTION assistant(content: impl Into<String>) -> Self {
        Self {
            role: Role::Assistant,
            content: Content::Text(content.into()),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        }
    }

    /// Create assistant message with tool calls
    FUNCTION assistant_with_tools(tool_calls: Vec<ToolCall>) -> Self {
        Self {
            role: Role::Assistant,
            content: Content::Text(String::new()),
            name: None,
            tool_calls: Some(tool_calls),
            tool_call_id: None,
        }
    }

    /// Create tool result message
    FUNCTION tool(tool_call_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: Role::Tool,
            content: Content::Text(content.into()),
            name: None,
            tool_calls: None,
            tool_call_id: Some(tool_call_id.into()),
        }
    }

    /// Validate message
    FUNCTION validate(&self) -> Result<(), String> {
        // Tool messages require tool_call_id
        IF self.role == Role::Tool && self.tool_call_id.is_none() {
            RETURN Err("Tool messages require tool_call_id".to_string())
        }

        // Validate content
        MATCH &self.content {
            Content::Text(text) => {
                // Empty text is allowed for assistant with tool_calls
                IF text.is_empty() && self.tool_calls.is_none() && self.role != Role::Assistant {
                    RETURN Err("Content cannot be empty".to_string())
                }
            },
            Content::Parts(parts) => {
                IF parts.is_empty() {
                    RETURN Err("Content parts cannot be empty".to_string())
                }
            },
        }

        Ok(())
    }
}

/// Message role
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
ENUM Role {
    System,
    User,
    Assistant,
    Tool,
}

/// Message content
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
ENUM Content {
    Text(String),
    Parts(Vec<ContentPart>),
}

/// Content part for multimodal messages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
ENUM ContentPart {
    Text { text: String },
    ImageUrl { image_url: ImageUrl },
}

/// Image URL for vision
#[derive(Debug, Clone, Serialize, Deserialize)]
STRUCT ImageUrl {
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<ImageDetail>,
}

/// Image detail level
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
ENUM ImageDetail {
    Low,
    High,
    Auto,
}
```

### 1.4 Tool Types (Rust)

```rust
// types/chat.rs (continued)

/// Tool definition
#[derive(Debug, Clone, Serialize, Deserialize)]
STRUCT Tool {
    #[serde(rename = "type")]
    pub type_: String,
    pub function: FunctionDefinition,
}

IMPL Tool {
    /// Create function tool
    FUNCTION function(
        name: impl Into<String>,
        description: impl Into<String>,
        parameters: serde_json::Value,
    ) -> Self {
        Self {
            type_: "function".to_string(),
            function: FunctionDefinition {
                name: name.into(),
                description: Some(description.into()),
                parameters: Some(parameters),
            },
        }
    }

    /// Validate tool
    FUNCTION validate(&self) -> Result<(), String> {
        IF self.type_ != "function" {
            RETURN Err(format!("Unknown tool type: {}", self.type_))
        }

        IF self.function.name.is_empty() {
            RETURN Err("Function name is required".to_string())
        }

        // Validate function name format (alphanumeric and underscores)
        IF !self.function.name.chars().all(|c| c.is_alphanumeric() || c == '_') {
            RETURN Err("Function name must contain only alphanumeric characters and underscores".to_string())
        }

        Ok(())
    }
}

/// Function definition
#[derive(Debug, Clone, Serialize, Deserialize)]
STRUCT FunctionDefinition {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameters: Option<serde_json::Value>,
}

/// Tool call from model
#[derive(Debug, Clone, Serialize, Deserialize)]
STRUCT ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub function: FunctionCall,
}

/// Function call
#[derive(Debug, Clone, Serialize, Deserialize)]
STRUCT FunctionCall {
    pub name: String,
    pub arguments: String,
}

IMPL FunctionCall {
    /// Parse arguments as JSON
    FUNCTION parse_arguments<T: DeserializeOwned>(&self) -> Result<T, GroqError> {
        serde_json::from_str(&self.arguments)
            .map_err(|e| GroqError::ValidationError {
                message: format!("Failed to parse function arguments: {}", e),
                param: Some("arguments".to_string()),
                value: Some(self.arguments.clone()),
            })
    }
}

/// Tool choice
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
ENUM ToolChoice {
    Mode(ToolChoiceMode),
    Function { type_: String, function: ToolChoiceFunction },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
ENUM ToolChoiceMode {
    Auto,
    None,
    Required,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
STRUCT ToolChoiceFunction {
    name: String,
}

IMPL ToolChoice {
    FUNCTION auto() -> Self { Self::Mode(ToolChoiceMode::Auto) }
    FUNCTION none() -> Self { Self::Mode(ToolChoiceMode::None) }
    FUNCTION required() -> Self { Self::Mode(ToolChoiceMode::Required) }
    FUNCTION function(name: impl Into<String>) -> Self {
        Self::Function {
            type_: "function".to_string(),
            function: ToolChoiceFunction { name: name.into() },
        }
    }
}
```

### 1.5 Chat Response Types (Rust)

```rust
// types/chat.rs (continued)

/// Chat completion response
#[derive(Debug, Clone, Deserialize)]
STRUCT ChatResponse {
    pub id: String,
    pub object: String,
    pub created: i64,
    pub model: String,
    pub choices: Vec<Choice>,
    pub usage: Usage,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_fingerprint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x_groq: Option<GroqMetadata>,
}

IMPL ChatResponse {
    /// Get first choice content
    FUNCTION content(&self) -> Option<&str> {
        self.choices.first()
            .and_then(|c| c.message.content.as_deref())
    }

    /// Get tool calls
    FUNCTION tool_calls(&self) -> Option<&Vec<ToolCall>> {
        self.choices.first()
            .and_then(|c| c.message.tool_calls.as_ref())
    }

    /// Get finish reason
    FUNCTION finish_reason(&self) -> Option<FinishReason> {
        self.choices.first().map(|c| c.finish_reason)
    }

    /// Build from streaming chunks
    FUNCTION from_chunks(chunks: Vec<ChatChunk>) -> Result<Self, GroqError> {
        IF chunks.is_empty() {
            RETURN Err(GroqError::StreamError {
                message: "No chunks received".to_string(),
                partial_content: None,
            })
        }

        LET first = &chunks[0]
        LET last = chunks.last().unwrap()

        // Accumulate content
        LET mut content = String::new()
        LET mut tool_calls: Vec<ToolCall> = Vec::new()

        FOR chunk IN &chunks {
            FOR choice IN &chunk.choices {
                IF LET Some(c) = &choice.delta.content {
                    content.push_str(c)
                }
                IF LET Some(tc) = &choice.delta.tool_calls {
                    // Merge tool call deltas
                    FOR tc_delta IN tc {
                        merge_tool_call_delta(&mut tool_calls, tc_delta)
                    }
                }
            }
        }

        Ok(Self {
            id: first.id.clone(),
            object: "chat.completion".to_string(),
            created: first.created,
            model: first.model.clone(),
            choices: vec![Choice {
                index: 0,
                message: AssistantMessage {
                    role: Role::Assistant,
                    content: IF content.is_empty() { None } ELSE { Some(content) },
                    tool_calls: IF tool_calls.is_empty() { None } ELSE { Some(tool_calls) },
                },
                finish_reason: last.choices.first()
                    .and_then(|c| c.finish_reason)
                    .unwrap_or(FinishReason::Stop),
                logprobs: None,
            }],
            usage: last.usage.clone().unwrap_or_default(),
            system_fingerprint: last.system_fingerprint.clone(),
            x_groq: last.x_groq.clone(),
        })
    }
}

/// Response choice
#[derive(Debug, Clone, Deserialize)]
STRUCT Choice {
    pub index: u32,
    pub message: AssistantMessage,
    pub finish_reason: FinishReason,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logprobs: Option<LogProbs>,
}

/// Assistant message in response
#[derive(Debug, Clone, Deserialize)]
STRUCT AssistantMessage {
    pub role: Role,
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
}

/// Finish reason
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
ENUM FinishReason {
    Stop,
    Length,
    ToolCalls,
    ContentFilter,
}

/// Token usage
#[derive(Debug, Clone, Default, Deserialize)]
STRUCT Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_time: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completion_time: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_time: Option<f64>,
}

/// Groq-specific metadata
#[derive(Debug, Clone, Deserialize)]
STRUCT GroqMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<GroqUsage>,
}

/// Groq timing info
#[derive(Debug, Clone, Deserialize)]
STRUCT GroqUsage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub queue_time: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_time: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completion_time: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_time: Option<f64>,
}

/// Streaming chunk
#[derive(Debug, Clone, Deserialize)]
STRUCT ChatChunk {
    pub id: String,
    pub object: String,
    pub created: i64,
    pub model: String,
    pub choices: Vec<ChunkChoice>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<Usage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system_fingerprint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x_groq: Option<GroqMetadata>,
}

/// Streaming choice
#[derive(Debug, Clone, Deserialize)]
STRUCT ChunkChoice {
    pub index: u32,
    pub delta: Delta,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<FinishReason>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub logprobs: Option<LogProbs>,
}

/// Delta content
#[derive(Debug, Clone, Default, Deserialize)]
STRUCT Delta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<Role>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCallDelta>>,
}

/// Tool call delta for streaming
#[derive(Debug, Clone, Deserialize)]
STRUCT ToolCallDelta {
    pub index: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(rename = "type", skip_serializing_if = "Option::is_none")]
    pub type_: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function: Option<FunctionDelta>,
}

/// Function delta
#[derive(Debug, Clone, Deserialize)]
STRUCT FunctionDelta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<String>,
}

/// Response format
#[derive(Debug, Clone, Serialize)]
STRUCT ResponseFormat {
    #[serde(rename = "type")]
    pub type_: ResponseFormatType,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
ENUM ResponseFormatType {
    Text,
    JsonObject,
}

/// Stream options
#[derive(Debug, Clone, Serialize)]
STRUCT StreamOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_usage: Option<bool>,
}
```

### 1.6 Chat Service (TypeScript)

```typescript
// services/chat.ts

import { HttpTransport, HttpRequest, StreamingResponse } from '../transport/http';
import { AuthProvider } from '../auth/api-key';
import { ResilienceOrchestrator } from '../resilience/orchestrator';
import { RateLimitManager } from '../resilience/rate-limit';
import { ChatRequest, ChatResponse, ChatChunk } from '../types/chat';
import { ChatStream } from '../transport/streaming';
import { GroqError } from '../errors';

/**
 * Chat completions service
 */
class ChatService {
    constructor(
        private readonly transport: HttpTransport,
        private readonly auth: AuthProvider,
        private readonly resilience: ResilienceOrchestrator,
        private readonly rateLimiter: RateLimitManager,
    ) {}

    /**
     * Create chat completion
     */
    async create(request: ChatRequest): Promise<ChatResponse> {
        // Validate
        this.validateRequest(request);

        // Check rate limits
        const waitMs = this.rateLimiter.shouldWait();
        IF (waitMs !== undefined) THEN
            await this.sleep(waitMs);
        END IF

        // Build request
        const httpRequest = this.buildRequest(request, false);

        // Execute with resilience
        const response = await this.resilience.execute(() =>
            this.transport.send(httpRequest)
        );

        // Update rate limits
        this.rateLimiter.updateFromHeaders(response.headers);

        // Parse response
        return this.parseResponse(response);
    }

    /**
     * Create streaming chat completion
     */
    async createStream(request: ChatRequest): Promise<ChatStream> {
        // Validate
        this.validateRequest(request);

        // Enable streaming
        const streamRequest = { ...request, stream: true };

        // Check rate limits
        const waitMs = this.rateLimiter.shouldWait();
        IF (waitMs !== undefined) THEN
            await this.sleep(waitMs);
        END IF

        // Build request
        const httpRequest = this.buildRequest(streamRequest, true);

        // Send (no retry for streams)
        const response = await this.transport.sendStreaming(httpRequest);

        // Update rate limits
        this.rateLimiter.updateFromHeaders(response.headers);

        // Check status
        IF (response.status !== 200) THEN
            THROW this.parseErrorStatus(response.status, response.headers);
        END IF

        return new ChatStream(response.stream);
    }

    /**
     * Create with timeout override
     */
    async createWithTimeout(
        request: ChatRequest,
        timeoutMs: number,
    ): Promise<ChatResponse> {
        const httpRequest = this.buildRequest(request, false);
        httpRequest.timeoutMs = timeoutMs;

        const response = await this.resilience.execute(() =>
            this.transport.send(httpRequest)
        );

        this.rateLimiter.updateFromHeaders(response.headers);
        return this.parseResponse(response);
    }

    private buildRequest(request: ChatRequest, streaming: boolean): HttpRequest {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        IF (streaming) THEN
            headers['Accept'] = 'text/event-stream';
        END IF

        this.auth.applyAuth(headers);

        return {
            method: 'POST',
            path: '/chat/completions',
            headers,
            body: request,
        };
    }

    private validateRequest(request: ChatRequest): void {
        IF (!request.model) THEN
            THROW new GroqError({
                code: 'validation_error',
                message: 'Model is required',
                param: 'model',
            });
        END IF

        IF (!request.messages || request.messages.length === 0) THEN
            THROW new GroqError({
                code: 'validation_error',
                message: 'At least one message is required',
                param: 'messages',
            });
        END IF

        IF (request.temperature !== undefined) THEN
            IF (request.temperature < 0 || request.temperature > 2) THEN
                THROW new GroqError({
                    code: 'validation_error',
                    message: 'Temperature must be between 0 and 2',
                    param: 'temperature',
                });
            END IF
        END IF
    }

    private parseResponse(response: { status: number; headers: Record<string, string>; body: unknown }): ChatResponse {
        IF (response.status !== 200) THEN
            THROW this.parseErrorResponse(response);
        END IF

        return response.body as ChatResponse;
    }

    private parseErrorResponse(response: { status: number; headers: Record<string, string>; body: unknown }): GroqError {
        const requestId = response.headers['x-request-id'];
        const body = response.body as { error?: { message: string; type: string; param?: string } };

        IF (body?.error) THEN
            return this.mapError(response.status, body.error, requestId);
        END IF

        return this.parseErrorStatus(response.status, response.headers);
    }

    private mapError(
        status: number,
        error: { message: string; type: string; param?: string },
        requestId?: string,
    ): GroqError {
        // Map based on status and type
        SWITCH (status) {
            CASE 401:
                return new GroqError({
                    code: 'authentication_error',
                    message: error.message,
                });
            CASE 403:
                return new GroqError({
                    code: 'authorization_error',
                    message: error.message,
                });
            CASE 404:
                return new GroqError({
                    code: 'model_error',
                    message: error.message,
                    param: error.param,
                });
            CASE 429:
                return new GroqError({
                    code: 'rate_limit_error',
                    message: error.message,
                });
            default:
                return new GroqError({
                    code: 'server_error',
                    message: error.message,
                    statusCode: status,
                    requestId,
                });
        }
    }

    private parseErrorStatus(status: number, headers: Record<string, string>): GroqError {
        const requestId = headers['x-request-id'];

        SWITCH (status) {
            CASE 401:
                return new GroqError({ code: 'authentication_error', message: 'Invalid API key' });
            CASE 403:
                return new GroqError({ code: 'authorization_error', message: 'Forbidden' });
            CASE 404:
                return new GroqError({ code: 'model_error', message: 'Resource not found' });
            CASE 429:
                return new GroqError({ code: 'rate_limit_error', message: 'Rate limit exceeded' });
            default:
                return new GroqError({
                    code: 'server_error',
                    message: `Server error: ${status}`,
                    statusCode: status,
                    requestId,
                });
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export { ChatService };
```

---

## 2. Audio Service

### 2.1 Audio Service (Rust)

```rust
// services/audio.rs

use std::path::Path;

/// Audio transcription and translation service
STRUCT AudioService {
    transport: Arc<dyn HttpTransport>,
    auth: Arc<dyn AuthProvider>,
    resilience: Arc<ResilienceOrchestrator>,
    rate_limiter: Arc<RwLock<RateLimitManager>>,
}

IMPL AudioService {
    FUNCTION new(
        transport: Arc<dyn HttpTransport>,
        auth: Arc<dyn AuthProvider>,
        resilience: Arc<ResilienceOrchestrator>,
        rate_limiter: Arc<RwLock<RateLimitManager>>,
    ) -> Self {
        Self { transport, auth, resilience, rate_limiter }
    }

    /// Transcribe audio to text
    #[instrument(skip(self, request), fields(model = %request.model))]
    ASYNC FUNCTION transcribe(&self, request: TranscriptionRequest) -> Result<TranscriptionResponse, GroqError> {
        // Validate request
        request.validate()?

        // Check rate limits
        IF LET Some(wait) = self.rate_limiter.read().await.should_wait() {
            tokio::time::sleep(wait).await
        }

        // Build multipart request
        LET multipart_request = self.build_transcription_request(&request).await?

        // Execute with resilience
        LET response = self.resilience.execute(|| async {
            self.transport.send_multipart(multipart_request.clone()).await
        }).await?

        // Update rate limits
        self.rate_limiter.write().await.update_from_headers(&response.headers)

        // Parse response
        self.parse_transcription_response(response, &request.response_format)
    }

    /// Translate audio to English
    #[instrument(skip(self, request), fields(model = %request.model))]
    ASYNC FUNCTION translate(&self, request: TranslationRequest) -> Result<TranslationResponse, GroqError> {
        // Validate request
        request.validate()?

        // Check rate limits
        IF LET Some(wait) = self.rate_limiter.read().await.should_wait() {
            tokio::time::sleep(wait).await
        }

        // Build multipart request
        LET multipart_request = self.build_translation_request(&request).await?

        // Execute with resilience
        LET response = self.resilience.execute(|| async {
            self.transport.send_multipart(multipart_request.clone()).await
        }).await?

        // Update rate limits
        self.rate_limiter.write().await.update_from_headers(&response.headers)

        // Parse response
        self.parse_translation_response(response, &request.response_format)
    }

    /// Build transcription multipart request
    ASYNC FUNCTION build_transcription_request(
        &self,
        request: &TranscriptionRequest,
    ) -> Result<MultipartRequest, GroqError> {
        LET mut parts = Vec::new()

        // Add file
        LET (data, filename, content_type) = self.resolve_audio_file(&request.file).await?
        parts.push(MultipartPart::File {
            name: "file".to_string(),
            filename,
            content_type,
            data,
        })

        // Add model
        parts.push(MultipartPart::Text {
            name: "model".to_string(),
            value: request.model.clone(),
        })

        // Add optional parameters
        IF LET Some(ref lang) = request.language {
            parts.push(MultipartPart::Text {
                name: "language".to_string(),
                value: lang.clone(),
            })
        }

        IF LET Some(ref prompt) = request.prompt {
            parts.push(MultipartPart::Text {
                name: "prompt".to_string(),
                value: prompt.clone(),
            })
        }

        IF LET Some(ref format) = request.response_format {
            parts.push(MultipartPart::Text {
                name: "response_format".to_string(),
                value: format.to_string(),
            })
        }

        IF LET Some(temp) = request.temperature {
            parts.push(MultipartPart::Text {
                name: "temperature".to_string(),
                value: temp.to_string(),
            })
        }

        IF LET Some(ref granularities) = request.timestamp_granularities {
            FOR g IN granularities {
                parts.push(MultipartPart::Text {
                    name: "timestamp_granularities[]".to_string(),
                    value: g.to_string(),
                })
            }
        }

        // Build headers
        LET mut headers = HashMap::new()
        self.auth.apply_auth(&mut headers)

        Ok(MultipartRequest {
            path: "/audio/transcriptions".to_string(),
            headers,
            parts,
            timeout: None,
        })
    }

    /// Build translation multipart request
    ASYNC FUNCTION build_translation_request(
        &self,
        request: &TranslationRequest,
    ) -> Result<MultipartRequest, GroqError> {
        LET mut parts = Vec::new()

        // Add file
        LET (data, filename, content_type) = self.resolve_audio_file(&request.file).await?
        parts.push(MultipartPart::File {
            name: "file".to_string(),
            filename,
            content_type,
            data,
        })

        // Add model
        parts.push(MultipartPart::Text {
            name: "model".to_string(),
            value: request.model.clone(),
        })

        // Add optional parameters
        IF LET Some(ref prompt) = request.prompt {
            parts.push(MultipartPart::Text {
                name: "prompt".to_string(),
                value: prompt.clone(),
            })
        }

        IF LET Some(ref format) = request.response_format {
            parts.push(MultipartPart::Text {
                name: "response_format".to_string(),
                value: format.to_string(),
            })
        }

        IF LET Some(temp) = request.temperature {
            parts.push(MultipartPart::Text {
                name: "temperature".to_string(),
                value: temp.to_string(),
            })
        }

        LET mut headers = HashMap::new()
        self.auth.apply_auth(&mut headers)

        Ok(MultipartRequest {
            path: "/audio/translations".to_string(),
            headers,
            parts,
            timeout: None,
        })
    }

    /// Resolve audio file to bytes
    ASYNC FUNCTION resolve_audio_file(&self, file: &AudioFile) -> Result<(Vec<u8>, String, String), GroqError> {
        MATCH file {
            AudioFile::Path(path) => {
                LET data = tokio::fs::read(path).await
                    .map_err(|e| GroqError::ValidationError {
                        message: format!("Failed to read file: {}", e),
                        param: Some("file".to_string()),
                        value: Some(path.display().to_string()),
                    })?

                LET filename = path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("audio")
                    .to_string()

                LET content_type = self.guess_content_type(path)

                Ok((data, filename, content_type))
            },
            AudioFile::Bytes { data, filename } => {
                LET content_type = self.guess_content_type_from_name(filename)
                Ok((data.clone(), filename.clone(), content_type))
            },
        }
    }

    /// Guess content type from file extension
    FUNCTION guess_content_type(&self, path: &Path) -> String {
        LET ext = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase()

        self.extension_to_mime(&ext)
    }

    FUNCTION guess_content_type_from_name(&self, filename: &str) -> String {
        LET ext = Path::new(filename)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase()

        self.extension_to_mime(&ext)
    }

    FUNCTION extension_to_mime(&self, ext: &str) -> String {
        MATCH ext {
            "mp3" => "audio/mpeg",
            "mp4" | "m4a" => "audio/mp4",
            "mpeg" | "mpga" => "audio/mpeg",
            "wav" => "audio/wav",
            "webm" => "audio/webm",
            "flac" => "audio/flac",
            "ogg" => "audio/ogg",
            _ => "application/octet-stream",
        }.to_string()
    }

    /// Parse transcription response
    FUNCTION parse_transcription_response(
        &self,
        response: HttpResponse,
        format: &Option<AudioFormat>,
    ) -> Result<TranscriptionResponse, GroqError> {
        IF response.status != 200 {
            RETURN Err(self.parse_error_response(&response))
        }

        MATCH format {
            Some(AudioFormat::Text) | Some(AudioFormat::Srt) | Some(AudioFormat::Vtt) => {
                // Plain text response
                LET text = String::from_utf8(response.body)
                    .map_err(|e| GroqError::ServerError {
                        message: format!("Invalid UTF-8 in response: {}", e),
                        status_code: response.status,
                        request_id: None,
                    })?

                Ok(TranscriptionResponse {
                    text,
                    task: None,
                    language: None,
                    duration: None,
                    words: None,
                    segments: None,
                })
            },
            _ => {
                // JSON response
                serde_json::from_slice(&response.body)
                    .map_err(|e| GroqError::ServerError {
                        message: format!("Failed to parse response: {}", e),
                        status_code: response.status,
                        request_id: response.headers.get("x-request-id").cloned(),
                    })
            }
        }
    }

    /// Parse translation response
    FUNCTION parse_translation_response(
        &self,
        response: HttpResponse,
        format: &Option<AudioFormat>,
    ) -> Result<TranslationResponse, GroqError> {
        IF response.status != 200 {
            RETURN Err(self.parse_error_response(&response))
        }

        MATCH format {
            Some(AudioFormat::Text) | Some(AudioFormat::Srt) | Some(AudioFormat::Vtt) => {
                LET text = String::from_utf8(response.body)
                    .map_err(|e| GroqError::ServerError {
                        message: format!("Invalid UTF-8 in response: {}", e),
                        status_code: response.status,
                        request_id: None,
                    })?

                Ok(TranslationResponse {
                    text,
                    task: None,
                    language: None,
                    duration: None,
                    segments: None,
                })
            },
            _ => {
                serde_json::from_slice(&response.body)
                    .map_err(|e| GroqError::ServerError {
                        message: format!("Failed to parse response: {}", e),
                        status_code: response.status,
                        request_id: response.headers.get("x-request-id").cloned(),
                    })
            }
        }
    }

    FUNCTION parse_error_response(&self, response: &HttpResponse) -> GroqError {
        // Similar to chat service error parsing
        GroqError::ServerError {
            message: String::from_utf8_lossy(&response.body).to_string(),
            status_code: response.status,
            request_id: response.headers.get("x-request-id").cloned(),
        }
    }
}
```

### 2.2 Audio Types (Rust)

```rust
// types/audio.rs

use std::path::PathBuf;

/// Transcription request
#[derive(Debug, Clone)]
STRUCT TranscriptionRequest {
    /// Audio file (required)
    pub file: AudioFile,

    /// Model ID (required)
    pub model: String,

    /// Language (ISO 639-1)
    pub language: Option<String>,

    /// Prompt for context
    pub prompt: Option<String>,

    /// Response format
    pub response_format: Option<AudioFormat>,

    /// Temperature (0.0-1.0)
    pub temperature: Option<f32>,

    /// Timestamp granularities
    pub timestamp_granularities: Option<Vec<Granularity>>,
}

IMPL TranscriptionRequest {
    FUNCTION new(file: AudioFile, model: impl Into<String>) -> Self {
        Self {
            file,
            model: model.into(),
            language: None,
            prompt: None,
            response_format: None,
            temperature: None,
            timestamp_granularities: None,
        }
    }

    FUNCTION builder() -> TranscriptionRequestBuilder {
        TranscriptionRequestBuilder::new()
    }

    FUNCTION validate(&self) -> Result<(), GroqError> {
        IF self.model.is_empty() {
            RETURN Err(GroqError::ValidationError {
                message: "Model is required".to_string(),
                param: Some("model".to_string()),
                value: None,
            })
        }

        // Validate model is a whisper model
        IF !self.model.contains("whisper") {
            RETURN Err(GroqError::ValidationError {
                message: "Model must be a Whisper model".to_string(),
                param: Some("model".to_string()),
                value: Some(self.model.clone()),
            })
        }

        IF LET Some(temp) = self.temperature {
            IF temp < 0.0 || temp > 1.0 {
                RETURN Err(GroqError::ValidationError {
                    message: "Temperature must be between 0.0 and 1.0".to_string(),
                    param: Some("temperature".to_string()),
                    value: Some(temp.to_string()),
                })
            }
        }

        Ok(())
    }
}

/// Transcription request builder
STRUCT TranscriptionRequestBuilder {
    file: Option<AudioFile>,
    model: Option<String>,
    language: Option<String>,
    prompt: Option<String>,
    response_format: Option<AudioFormat>,
    temperature: Option<f32>,
    timestamp_granularities: Option<Vec<Granularity>>,
}

IMPL TranscriptionRequestBuilder {
    FUNCTION new() -> Self {
        Self {
            file: None,
            model: None,
            language: None,
            prompt: None,
            response_format: None,
            temperature: None,
            timestamp_granularities: None,
        }
    }

    FUNCTION file(mut self, file: AudioFile) -> Self {
        self.file = Some(file)
        self
    }

    FUNCTION file_path(mut self, path: impl Into<PathBuf>) -> Self {
        self.file = Some(AudioFile::Path(path.into()))
        self
    }

    FUNCTION file_bytes(mut self, data: Vec<u8>, filename: impl Into<String>) -> Self {
        self.file = Some(AudioFile::Bytes { data, filename: filename.into() })
        self
    }

    FUNCTION model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into())
        self
    }

    FUNCTION language(mut self, language: impl Into<String>) -> Self {
        self.language = Some(language.into())
        self
    }

    FUNCTION prompt(mut self, prompt: impl Into<String>) -> Self {
        self.prompt = Some(prompt.into())
        self
    }

    FUNCTION response_format(mut self, format: AudioFormat) -> Self {
        self.response_format = Some(format)
        self
    }

    FUNCTION json(mut self) -> Self {
        self.response_format = Some(AudioFormat::Json)
        self
    }

    FUNCTION verbose_json(mut self) -> Self {
        self.response_format = Some(AudioFormat::VerboseJson)
        self
    }

    FUNCTION text(mut self) -> Self {
        self.response_format = Some(AudioFormat::Text)
        self
    }

    FUNCTION srt(mut self) -> Self {
        self.response_format = Some(AudioFormat::Srt)
        self
    }

    FUNCTION vtt(mut self) -> Self {
        self.response_format = Some(AudioFormat::Vtt)
        self
    }

    FUNCTION temperature(mut self, temp: f32) -> Self {
        self.temperature = Some(temp)
        self
    }

    FUNCTION with_word_timestamps(mut self) -> Self {
        self.timestamp_granularities
            .get_or_insert_with(Vec::new)
            .push(Granularity::Word)
        self
    }

    FUNCTION with_segment_timestamps(mut self) -> Self {
        self.timestamp_granularities
            .get_or_insert_with(Vec::new)
            .push(Granularity::Segment)
        self
    }

    FUNCTION build(self) -> Result<TranscriptionRequest, GroqError> {
        LET file = self.file.ok_or_else(|| GroqError::ValidationError {
            message: "File is required".to_string(),
            param: Some("file".to_string()),
            value: None,
        })?

        LET model = self.model.ok_or_else(|| GroqError::ValidationError {
            message: "Model is required".to_string(),
            param: Some("model".to_string()),
            value: None,
        })?

        LET request = TranscriptionRequest {
            file,
            model,
            language: self.language,
            prompt: self.prompt,
            response_format: self.response_format,
            temperature: self.temperature,
            timestamp_granularities: self.timestamp_granularities,
        }

        request.validate()?
        Ok(request)
    }
}

/// Audio file input
#[derive(Debug, Clone)]
ENUM AudioFile {
    Path(PathBuf),
    Bytes { data: Vec<u8>, filename: String },
}

/// Audio response format
#[derive(Debug, Clone, Copy)]
ENUM AudioFormat {
    Json,
    Text,
    VerboseJson,
    Srt,
    Vtt,
}

IMPL std::fmt::Display FOR AudioFormat {
    FUNCTION fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        MATCH self {
            Self::Json => write!(f, "json"),
            Self::Text => write!(f, "text"),
            Self::VerboseJson => write!(f, "verbose_json"),
            Self::Srt => write!(f, "srt"),
            Self::Vtt => write!(f, "vtt"),
        }
    }
}

/// Timestamp granularity
#[derive(Debug, Clone, Copy)]
ENUM Granularity {
    Word,
    Segment,
}

IMPL std::fmt::Display FOR Granularity {
    FUNCTION fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        MATCH self {
            Self::Word => write!(f, "word"),
            Self::Segment => write!(f, "segment"),
        }
    }
}

/// Transcription response
#[derive(Debug, Clone, Deserialize)]
STRUCT TranscriptionResponse {
    pub text: String,
    pub task: Option<String>,
    pub language: Option<String>,
    pub duration: Option<f64>,
    pub words: Option<Vec<Word>>,
    pub segments: Option<Vec<Segment>>,
}

/// Word with timestamp
#[derive(Debug, Clone, Deserialize)]
STRUCT Word {
    pub word: String,
    pub start: f64,
    pub end: f64,
}

/// Segment with timestamp
#[derive(Debug, Clone, Deserialize)]
STRUCT Segment {
    pub id: u32,
    pub start: f64,
    pub end: f64,
    pub text: String,
    pub tokens: Vec<u32>,
    pub temperature: f64,
    pub avg_logprob: f64,
    pub compression_ratio: f64,
    pub no_speech_prob: f64,
}

/// Translation request
#[derive(Debug, Clone)]
STRUCT TranslationRequest {
    pub file: AudioFile,
    pub model: String,
    pub prompt: Option<String>,
    pub response_format: Option<AudioFormat>,
    pub temperature: Option<f32>,
}

/// Translation response
#[derive(Debug, Clone, Deserialize)]
STRUCT TranslationResponse {
    pub text: String,
    pub task: Option<String>,
    pub language: Option<String>,
    pub duration: Option<f64>,
    pub segments: Option<Vec<Segment>>,
}
```

---

## 3. Models Service

### 3.1 Models Service (Rust)

```rust
// services/models.rs

/// Models listing service
STRUCT ModelsService {
    transport: Arc<dyn HttpTransport>,
    auth: Arc<dyn AuthProvider>,
    resilience: Arc<ResilienceOrchestrator>,
    rate_limiter: Arc<RwLock<RateLimitManager>>,
}

IMPL ModelsService {
    FUNCTION new(
        transport: Arc<dyn HttpTransport>,
        auth: Arc<dyn AuthProvider>,
        resilience: Arc<ResilienceOrchestrator>,
        rate_limiter: Arc<RwLock<RateLimitManager>>,
    ) -> Self {
        Self { transport, auth, resilience, rate_limiter }
    }

    /// List all available models
    #[instrument(skip(self))]
    ASYNC FUNCTION list(&self) -> Result<ModelList, GroqError> {
        // Check rate limits
        IF LET Some(wait) = self.rate_limiter.read().await.should_wait() {
            tokio::time::sleep(wait).await
        }

        // Build request
        LET mut headers = HashMap::new()
        self.auth.apply_auth(&mut headers)

        LET request = HttpRequest {
            method: HttpMethod::Get,
            path: "/models".to_string(),
            headers,
            body: None,
            timeout: None,
        }

        // Execute
        LET response = self.resilience.execute(|| async {
            self.transport.send(request.clone()).await
        }).await?

        // Update rate limits
        self.rate_limiter.write().await.update_from_headers(&response.headers)

        // Parse
        IF response.status != 200 {
            RETURN Err(GroqError::ServerError {
                message: format!("Failed to list models: {}", response.status),
                status_code: response.status,
                request_id: response.headers.get("x-request-id").cloned(),
            })
        }

        serde_json::from_slice(&response.body)
            .map_err(|e| GroqError::ServerError {
                message: format!("Failed to parse models response: {}", e),
                status_code: response.status,
                request_id: None,
            })
    }

    /// Get specific model details
    #[instrument(skip(self), fields(model_id = %model_id))]
    ASYNC FUNCTION get(&self, model_id: &str) -> Result<Model, GroqError> {
        // Validate
        IF model_id.is_empty() {
            RETURN Err(GroqError::ValidationError {
                message: "Model ID is required".to_string(),
                param: Some("model_id".to_string()),
                value: None,
            })
        }

        // Check rate limits
        IF LET Some(wait) = self.rate_limiter.read().await.should_wait() {
            tokio::time::sleep(wait).await
        }

        // Build request
        LET mut headers = HashMap::new()
        self.auth.apply_auth(&mut headers)

        LET request = HttpRequest {
            method: HttpMethod::Get,
            path: format!("/models/{}", model_id),
            headers,
            body: None,
            timeout: None,
        }

        // Execute
        LET response = self.resilience.execute(|| async {
            self.transport.send(request.clone()).await
        }).await?

        // Update rate limits
        self.rate_limiter.write().await.update_from_headers(&response.headers)

        // Parse
        IF response.status == 404 {
            RETURN Err(GroqError::ModelError {
                message: format!("Model not found: {}", model_id),
                model: model_id.to_string(),
                available_models: None,
            })
        }

        IF response.status != 200 {
            RETURN Err(GroqError::ServerError {
                message: format!("Failed to get model: {}", response.status),
                status_code: response.status,
                request_id: response.headers.get("x-request-id").cloned(),
            })
        }

        serde_json::from_slice(&response.body)
            .map_err(|e| GroqError::ServerError {
                message: format!("Failed to parse model response: {}", e),
                status_code: response.status,
                request_id: None,
            })
    }
}
```

### 3.2 Models Types (Rust)

```rust
// types/models.rs

/// Model list response
#[derive(Debug, Clone, Deserialize)]
STRUCT ModelList {
    pub object: String,
    pub data: Vec<Model>,
}

IMPL ModelList {
    /// Get model by ID
    FUNCTION get(&self, id: &str) -> Option<&Model> {
        self.data.iter().find(|m| m.id == id)
    }

    /// Filter chat models
    FUNCTION chat_models(&self) -> Vec<&Model> {
        self.data.iter()
            .filter(|m| !m.id.contains("whisper"))
            .collect()
    }

    /// Filter whisper models
    FUNCTION whisper_models(&self) -> Vec<&Model> {
        self.data.iter()
            .filter(|m| m.id.contains("whisper"))
            .collect()
    }

    /// Filter vision models
    FUNCTION vision_models(&self) -> Vec<&Model> {
        self.data.iter()
            .filter(|m| m.id.contains("vision"))
            .collect()
    }
}

/// Model information
#[derive(Debug, Clone, Deserialize)]
STRUCT Model {
    pub id: String,
    pub object: String,
    pub created: i64,
    pub owned_by: String,
}

IMPL Model {
    /// Check if model supports vision
    FUNCTION supports_vision(&self) -> bool {
        self.id.contains("vision")
    }

    /// Check if model is a whisper model
    FUNCTION is_whisper(&self) -> bool {
        self.id.contains("whisper")
    }

    /// Check if model supports tool use
    FUNCTION supports_tools(&self) -> bool {
        // Most Llama models support tools
        self.id.contains("llama") && !self.is_whisper()
    }
}
```

---

## 4. Error Handling

### 4.1 Error Types (Rust)

```rust
// error.rs

use thiserror::Error;
use std::time::Duration;

/// Groq API error
#[derive(Debug, Error)]
ENUM GroqError {
    #[error("Authentication error: {message}")]
    AuthenticationError {
        message: String,
        api_key_hint: Option<String>,
    },

    #[error("Authorization error: {message}")]
    AuthorizationError {
        message: String,
        required_permission: Option<String>,
    },

    #[error("Validation error: {message}")]
    ValidationError {
        message: String,
        param: Option<String>,
        value: Option<String>,
    },

    #[error("Rate limit error: {message}")]
    RateLimitError {
        message: String,
        retry_after: Option<Duration>,
        limit_type: RateLimitType,
    },

    #[error("Model error: {message}")]
    ModelError {
        message: String,
        model: String,
        available_models: Option<Vec<String>>,
    },

    #[error("Context length error: {message}")]
    ContextLengthError {
        message: String,
        max_context: u32,
        requested: u32,
    },

    #[error("Content filter error: {message}")]
    ContentFilterError {
        message: String,
        filtered_categories: Vec<String>,
    },

    #[error("Server error: {message}")]
    ServerError {
        message: String,
        status_code: u16,
        request_id: Option<String>,
    },

    #[error("Timeout error: {message}")]
    TimeoutError {
        message: String,
        timeout: Duration,
        operation: String,
    },

    #[error("Network error: {message}")]
    NetworkError {
        message: String,
        cause: Option<String>,
    },

    #[error("Stream error: {message}")]
    StreamError {
        message: String,
        partial_content: Option<String>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
ENUM RateLimitType {
    Requests,
    Tokens,
}

IMPL GroqError {
    /// Check if error is retryable
    FUNCTION is_retryable(&self) -> bool {
        MATCH self {
            Self::RateLimitError { .. } => true,
            Self::ServerError { status_code, .. } => {
                MATCH status_code {
                    500 | 502 | 503 | 504 => true,
                    _ => false,
                }
            },
            Self::TimeoutError { .. } => true,
            Self::NetworkError { .. } => true,
            _ => false,
        }
    }

    /// Get retry-after duration if available
    FUNCTION retry_after(&self) -> Option<Duration> {
        MATCH self {
            Self::RateLimitError { retry_after, .. } => *retry_after,
            _ => None,
        }
    }

    /// Get HTTP status code if available
    FUNCTION status_code(&self) -> Option<u16> {
        MATCH self {
            Self::AuthenticationError { .. } => Some(401),
            Self::AuthorizationError { .. } => Some(403),
            Self::ValidationError { .. } => Some(400),
            Self::RateLimitError { .. } => Some(429),
            Self::ModelError { .. } => Some(404),
            Self::ContextLengthError { .. } => Some(400),
            Self::ContentFilterError { .. } => Some(400),
            Self::ServerError { status_code, .. } => Some(*status_code),
            _ => None,
        }
    }

    /// Get request ID if available
    FUNCTION request_id(&self) -> Option<&str> {
        MATCH self {
            Self::ServerError { request_id, .. } => request_id.as_deref(),
            _ => None,
        }
    }
}

/// Groq error response from API
#[derive(Debug, Deserialize)]
STRUCT GroqErrorResponse {
    pub error: ErrorDetail,
}

#[derive(Debug, Deserialize)]
STRUCT ErrorDetail {
    pub message: String,
    #[serde(rename = "type")]
    pub type_: String,
    pub code: Option<String>,
    pub param: Option<String>,
}

/// Result type alias
TYPE GroqResult<T> = Result<T, GroqError>;
```

### 4.2 Error Types (TypeScript)

```typescript
// errors.ts

/**
 * Groq error codes
 */
type GroqErrorCode =
    | 'authentication_error'
    | 'authorization_error'
    | 'validation_error'
    | 'rate_limit_error'
    | 'model_error'
    | 'context_length_error'
    | 'content_filter_error'
    | 'server_error'
    | 'timeout_error'
    | 'network_error'
    | 'stream_error'
    | 'unknown_error';

/**
 * Groq error options
 */
interface GroqErrorOptions {
    code: GroqErrorCode;
    message: string;
    param?: string;
    statusCode?: number;
    requestId?: string;
    retryAfterMs?: number;
    partialContent?: string;
}

/**
 * Groq API error
 */
class GroqError extends Error {
    readonly code: GroqErrorCode;
    readonly param?: string;
    readonly statusCode?: number;
    readonly requestId?: string;
    readonly retryAfterMs?: number;
    readonly partialContent?: string;

    constructor(options: GroqErrorOptions) {
        super(options.message);
        this.name = 'GroqError';
        this.code = options.code;
        this.param = options.param;
        this.statusCode = options.statusCode;
        this.requestId = options.requestId;
        this.retryAfterMs = options.retryAfterMs;
        this.partialContent = options.partialContent;
    }

    /**
     * Check if error is retryable
     */
    isRetryable(): boolean {
        SWITCH (this.code) {
            CASE 'rate_limit_error':
            CASE 'timeout_error':
            CASE 'network_error':
                return true;
            CASE 'server_error':
                return this.statusCode !== undefined &&
                    [500, 502, 503, 504].includes(this.statusCode);
            default:
                return false;
        }
    }

    /**
     * Convert to JSON
     */
    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            param: this.param,
            statusCode: this.statusCode,
            requestId: this.requestId,
        };
    }
}

export { GroqError, GroqErrorCode, GroqErrorOptions };
```

---

## 5. Observability

### 5.1 Tracing (Rust)

```rust
// observability/tracing.rs

use tracing::{Span, Level};

/// Create span for Groq operation
FUNCTION create_operation_span(operation: &str, model: Option<&str>) -> Span {
    LET span = tracing::info_span!(
        "groq_operation",
        operation = operation,
        model = model.unwrap_or("unknown"),
        groq.request_id = tracing::field::Empty,
        groq.tokens.prompt = tracing::field::Empty,
        groq.tokens.completion = tracing::field::Empty,
        groq.latency_ms = tracing::field::Empty,
    )

    span
}

/// Record request ID on span
FUNCTION record_request_id(span: &Span, request_id: &str) {
    span.record("groq.request_id", request_id)
}

/// Record token usage on span
FUNCTION record_usage(span: &Span, usage: &Usage) {
    span.record("groq.tokens.prompt", usage.prompt_tokens)
    span.record("groq.tokens.completion", usage.completion_tokens)
}

/// Record latency on span
FUNCTION record_latency(span: &Span, latency_ms: u64) {
    span.record("groq.latency_ms", latency_ms)
}
```

### 5.2 Metrics (Rust)

```rust
// observability/metrics.rs

use primitives::metrics::{Counter, Histogram, Gauge};

/// Groq metrics
STRUCT GroqMetrics {
    requests_total: Counter,
    request_duration: Histogram,
    tokens_total: Counter,
    rate_limit_remaining: Gauge,
    circuit_breaker_state: Gauge,
}

IMPL GroqMetrics {
    FUNCTION new() -> Self {
        Self {
            requests_total: Counter::new(
                "groq_requests_total",
                "Total Groq API requests",
                &["model", "operation", "status"],
            ),
            request_duration: Histogram::new(
                "groq_request_duration_seconds",
                "Groq request duration",
                &["model", "operation"],
            ),
            tokens_total: Counter::new(
                "groq_tokens_total",
                "Total tokens processed",
                &["model", "type"],  // type: prompt|completion
            ),
            rate_limit_remaining: Gauge::new(
                "groq_rate_limit_remaining",
                "Remaining rate limit",
                &["type"],  // type: requests|tokens
            ),
            circuit_breaker_state: Gauge::new(
                "groq_circuit_breaker_state",
                "Circuit breaker state (0=closed, 1=open, 2=half-open)",
                &[],
            ),
        }
    }

    FUNCTION record_request(&self, model: &str, operation: &str, status: &str) {
        self.requests_total.inc(&[model, operation, status])
    }

    FUNCTION record_duration(&self, model: &str, operation: &str, duration: Duration) {
        self.request_duration.observe(&[model, operation], duration.as_secs_f64())
    }

    FUNCTION record_tokens(&self, model: &str, prompt: u32, completion: u32) {
        self.tokens_total.inc_by(&[model, "prompt"], prompt as f64)
        self.tokens_total.inc_by(&[model, "completion"], completion as f64)
    }

    FUNCTION record_rate_limit(&self, requests: Option<u32>, tokens: Option<u32>) {
        IF LET Some(r) = requests {
            self.rate_limit_remaining.set(&["requests"], r as f64)
        }
        IF LET Some(t) = tokens {
            self.rate_limit_remaining.set(&["tokens"], t as f64)
        }
    }
}
```

---

## 6. Testing Patterns

### 6.1 Mock Transport (Rust)

```rust
// tests/mocks.rs

use std::collections::VecDeque;
use tokio::sync::Mutex;

/// Mock HTTP transport for testing
STRUCT MockHttpTransport {
    responses: Mutex<VecDeque<MockResponse>>,
    requests: Mutex<Vec<HttpRequest>>,
}

STRUCT MockResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

IMPL MockHttpTransport {
    FUNCTION new() -> Self {
        Self {
            responses: Mutex::new(VecDeque::new()),
            requests: Mutex::new(Vec::new()),
        }
    }

    /// Queue a response
    ASYNC FUNCTION queue_response(&self, response: MockResponse) {
        self.responses.lock().await.push_back(response)
    }

    /// Queue JSON response
    ASYNC FUNCTION queue_json<T: Serialize>(&self, status: u16, body: &T) {
        self.queue_response(MockResponse {
            status,
            headers: HashMap::from([
                ("content-type".to_string(), "application/json".to_string()),
            ]),
            body: serde_json::to_vec(body).unwrap(),
        }).await
    }

    /// Get recorded requests
    ASYNC FUNCTION get_requests(&self) -> Vec<HttpRequest> {
        self.requests.lock().await.clone()
    }

    /// Get last request
    ASYNC FUNCTION last_request(&self) -> Option<HttpRequest> {
        self.requests.lock().await.last().cloned()
    }
}

#[async_trait]
IMPL HttpTransport FOR MockHttpTransport {
    ASYNC FUNCTION send(&self, request: HttpRequest) -> Result<HttpResponse, TransportError> {
        // Record request
        self.requests.lock().await.push(request)

        // Get queued response
        LET response = self.responses.lock().await.pop_front()
            .ok_or_else(|| TransportError::ConnectionError {
                message: "No mock response queued".to_string(),
            })?

        Ok(HttpResponse {
            status: response.status,
            headers: response.headers,
            body: response.body,
        })
    }

    ASYNC FUNCTION send_streaming(&self, request: HttpRequest) -> Result<StreamingResponse, TransportError> {
        // Record request
        self.requests.lock().await.push(request)

        LET response = self.responses.lock().await.pop_front()
            .ok_or_else(|| TransportError::ConnectionError {
                message: "No mock response queued".to_string(),
            })?

        Ok(StreamingResponse {
            status: response.status,
            headers: response.headers,
            stream: Box::pin(futures::stream::once(async move {
                Ok(Bytes::from(response.body))
            })),
        })
    }

    ASYNC FUNCTION send_multipart(&self, request: MultipartRequest) -> Result<HttpResponse, TransportError> {
        // Convert to HttpRequest for recording
        LET http_request = HttpRequest {
            method: HttpMethod::Post,
            path: request.path,
            headers: request.headers,
            body: None,
            timeout: request.timeout,
        }
        self.requests.lock().await.push(http_request)

        LET response = self.responses.lock().await.pop_front()
            .ok_or_else(|| TransportError::ConnectionError {
                message: "No mock response queued".to_string(),
            })?

        Ok(HttpResponse {
            status: response.status,
            headers: response.headers,
            body: response.body,
        })
    }
}
```

### 6.2 Test Fixtures (Rust)

```rust
// tests/fixtures.rs

/// Create test chat response
FUNCTION create_chat_response(content: &str) -> ChatResponse {
    ChatResponse {
        id: "chatcmpl-test123".to_string(),
        object: "chat.completion".to_string(),
        created: 1705312345,
        model: "llama-3.3-70b-versatile".to_string(),
        choices: vec![Choice {
            index: 0,
            message: AssistantMessage {
                role: Role::Assistant,
                content: Some(content.to_string()),
                tool_calls: None,
            },
            finish_reason: FinishReason::Stop,
            logprobs: None,
        }],
        usage: Usage {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
            prompt_time: Some(0.001),
            completion_time: Some(0.005),
            total_time: Some(0.006),
        },
        system_fingerprint: Some("fp_test".to_string()),
        x_groq: Some(GroqMetadata {
            id: Some("req_test".to_string()),
            usage: Some(GroqUsage {
                queue_time: Some(0.0001),
                prompt_time: Some(0.001),
                completion_time: Some(0.005),
                total_time: Some(0.006),
            }),
        }),
    }
}

/// Create test streaming chunks
FUNCTION create_streaming_chunks(content: &str) -> Vec<String> {
    LET chunks: Vec<String> = content.chars()
        .map(|c| {
            serde_json::json!({
                "id": "chatcmpl-test123",
                "object": "chat.completion.chunk",
                "created": 1705312345,
                "model": "llama-3.3-70b-versatile",
                "choices": [{
                    "index": 0,
                    "delta": { "content": c.to_string() },
                    "finish_reason": null
                }]
            }).to_string()
        })
        .collect()

    // Add final chunk
    LET mut result = chunks
    result.push(serde_json::json!({
        "id": "chatcmpl-test123",
        "object": "chat.completion.chunk",
        "created": 1705312345,
        "model": "llama-3.3-70b-versatile",
        "choices": [{
            "index": 0,
            "delta": {},
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": content.len(),
            "total_tokens": 10 + content.len()
        }
    }).to_string())

    result
}

/// Create SSE stream from chunks
FUNCTION create_sse_stream(chunks: Vec<String>) -> String {
    LET mut stream = String::new()
    FOR chunk IN chunks {
        stream.push_str(&format!("data: {}\n\n", chunk))
    }
    stream.push_str("data: [DONE]\n\n")
    stream
}

/// Create test error response
FUNCTION create_error_response(status: u16, error_type: &str, message: &str) -> (u16, GroqErrorResponse) {
    (status, GroqErrorResponse {
        error: ErrorDetail {
            message: message.to_string(),
            type_: error_type.to_string(),
            code: Some(error_type.to_string()),
            param: None,
        },
    })
}
```

### 6.3 Integration Test Example

```rust
// tests/integration/chat_test.rs

#[tokio::test]
ASYNC FUNCTION test_chat_completion() {
    // Arrange
    LET mock_transport = Arc::new(MockHttpTransport::new())
    LET expected_response = create_chat_response("Hello, world!")

    mock_transport.queue_json(200, &expected_response).await

    LET client = GroqClientBuilder::new()
        .api_key("gsk_test_key")
        .with_transport(mock_transport.clone())
        .build()
        .unwrap()

    // Act
    LET request = ChatRequest::builder()
        .model("llama-3.3-70b-versatile")
        .user("Hello!")
        .build()
        .unwrap()

    LET response = client.chat().create(request).await.unwrap()

    // Assert
    assert_eq!(response.content(), Some("Hello, world!"))
    assert_eq!(response.usage.total_tokens, 30)

    // Verify request was correct
    LET sent_request = mock_transport.last_request().await.unwrap()
    assert_eq!(sent_request.path, "/chat/completions")
    assert!(sent_request.headers.contains_key("Authorization"))
}

#[tokio::test]
ASYNC FUNCTION test_streaming_chat() {
    // Arrange
    LET mock_transport = Arc::new(MockHttpTransport::new())
    LET chunks = create_streaming_chunks("Hi!")
    LET sse_data = create_sse_stream(chunks)

    mock_transport.queue_response(MockResponse {
        status: 200,
        headers: HashMap::from([
            ("content-type".to_string(), "text/event-stream".to_string()),
        ]),
        body: sse_data.into_bytes(),
    }).await

    LET client = GroqClientBuilder::new()
        .api_key("gsk_test_key")
        .with_transport(mock_transport)
        .build()
        .unwrap()

    // Act
    LET request = ChatRequest::builder()
        .model("llama-3.3-70b-versatile")
        .user("Hi")
        .build()
        .unwrap()

    LET stream = client.chat().create_stream(request).await.unwrap()
    LET response = stream.collect().await.unwrap()

    // Assert
    assert_eq!(response.content(), Some("Hi!"))
}

#[tokio::test]
ASYNC FUNCTION test_rate_limit_handling() {
    // Arrange
    LET mock_transport = Arc::new(MockHttpTransport::new())

    // Queue rate limit error then success
    mock_transport.queue_response(MockResponse {
        status: 429,
        headers: HashMap::from([
            ("retry-after".to_string(), "1".to_string()),
            ("x-ratelimit-remaining-requests".to_string(), "0".to_string()),
        ]),
        body: serde_json::to_vec(&GroqErrorResponse {
            error: ErrorDetail {
                message: "Rate limited".to_string(),
                type_: "rate_limit_exceeded".to_string(),
                code: Some("rate_limit_exceeded".to_string()),
                param: None,
            },
        }).unwrap(),
    }).await

    mock_transport.queue_json(200, &create_chat_response("Success!")).await

    LET client = GroqClientBuilder::new()
        .api_key("gsk_test_key")
        .with_transport(mock_transport)
        .max_retries(2)
        .build()
        .unwrap()

    // Act
    LET request = ChatRequest::builder()
        .model("llama-3.3-70b-versatile")
        .user("Test")
        .build()
        .unwrap()

    LET response = client.chat().create(request).await.unwrap()

    // Assert
    assert_eq!(response.content(), Some("Success!"))
}
```

---

## Document Metadata

| Field | Value |
|-------|-------|
| Document ID | SPARC-GROQ-PSEUDO-002 |
| Version | 1.0.0 |
| Created | 2025-01-15 |
| Last Modified | 2025-01-15 |
| Author | SPARC Methodology |
| Status | Draft |
| Part | 2 of 2 |

---

**End of Pseudocode Phase**

*SPARC Phase 2 Complete - Awaiting "Next phase." to proceed to Architecture*
