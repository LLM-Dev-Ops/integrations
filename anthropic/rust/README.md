# Anthropic Rust SDK

A production-ready Rust client for the Anthropic Claude API, following SPARC methodology and London-School TDD.

## Features

- **Complete API Coverage**: Messages, Models, Batches, Admin APIs
- **Resilience Patterns**: Retry with exponential backoff, circuit breaker, rate limiting
- **Streaming Support**: Full SSE streaming for message responses
- **Beta Features**: Extended thinking, PDF support, prompt caching, computer use
- **Observability**: Tracing, metrics, and structured logging
- **Type Safety**: Comprehensive Rust types with serde serialization
- **Secure Credential Handling**: Using `SecretString` for API keys
- **London-School TDD**: Comprehensive test coverage with mocks and fixtures

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
integrations-anthropic = { path = "../anthropic/rust" }

# With specific features
integrations-anthropic = { path = "../anthropic/rust", features = ["admin", "batches", "beta"] }

# With all features
integrations-anthropic = { path = "../anthropic/rust", features = ["full"] }
```

## Quick Start

```rust
use integrations_anthropic::{create_client_from_env, services::messages::{CreateMessageRequest, MessageParam}};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create client from environment (ANTHROPIC_API_KEY)
    let client = create_client_from_env()?;

    // Simple message
    let request = CreateMessageRequest {
        model: "claude-3-5-sonnet-20241022".to_string(),
        max_tokens: 1024,
        messages: vec![MessageParam::user_text("Hello, Claude!")],
        ..Default::default()
    };

    let response = client.messages().create(request).await?;

    // Extract text from response
    if let Some(text_block) = response.content.first() {
        println!("Response: {}", text_block.text());
    }

    println!("Usage: {} input tokens, {} output tokens",
             response.usage.input_tokens,
             response.usage.output_tokens);

    Ok(())
}
```

## Streaming

Stream responses in real-time using Server-Sent Events:

```rust
use integrations_anthropic::{create_client_from_env, services::messages::{CreateMessageRequest, MessageParam, StreamEvent}};
use futures::StreamExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = create_client_from_env()?;

    let request = CreateMessageRequest {
        model: "claude-3-5-sonnet-20241022".to_string(),
        max_tokens: 1024,
        messages: vec![MessageParam::user_text("Tell me a story")],
        stream: Some(true),
        ..Default::default()
    };

    let mut stream = client.messages().create_stream(request).await?;

    while let Some(event) = stream.next().await {
        match event? {
            StreamEvent::ContentBlockDelta { delta, .. } => {
                if let Some(text) = delta.text {
                    print!("{}", text);
                }
            }
            StreamEvent::MessageStop => {
                println!("\n[Stream complete]");
                break;
            }
            _ => {}
        }
    }

    Ok(())
}
```

## Extended Thinking (Beta)

Enable extended thinking for complex reasoning tasks:

```rust
use integrations_anthropic::{
    create_client_from_env,
    config::{AnthropicConfigBuilder, BetaFeature},
    services::messages::{CreateMessageRequest, MessageParam, ContentBlock}
};
use secrecy::SecretString;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Enable beta features in config
    let config = AnthropicConfigBuilder::new()
        .api_key(SecretString::new(std::env::var("ANTHROPIC_API_KEY")?))
        .beta_feature(BetaFeature::ExtendedThinking)
        .build()?;

    let client = integrations_anthropic::create_client(config)?;

    let request = CreateMessageRequest {
        model: "claude-3-5-sonnet-20241022".to_string(),
        max_tokens: 16000,
        messages: vec![MessageParam::user_text(
            "Solve this complex problem: How can we optimize database queries in a distributed system?"
        )],
        thinking: Some(serde_json::json!({
            "type": "enabled",
            "budget_tokens": 10000
        })),
        ..Default::default()
    };

    let response = client.messages().create(request).await?;

    // Access thinking blocks
    for block in &response.content {
        match block {
            ContentBlock::Thinking { thinking } => {
                println!("Thinking process:\n{}\n", thinking);
            }
            ContentBlock::Text { text, .. } => {
                println!("Answer:\n{}\n", text);
            }
            _ => {}
        }
    }

    Ok(())
}
```

## Tool Use

Define and use tools for function calling:

```rust
use integrations_anthropic::{
    create_client_from_env,
    services::messages::{CreateMessageRequest, MessageParam, Tool, ToolInputSchema, ContentBlock}
};
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = create_client_from_env()?;

    // Define a weather tool
    let weather_tool = Tool {
        name: "get_weather".to_string(),
        description: "Get the current weather for a location".to_string(),
        input_schema: ToolInputSchema {
            schema_type: "object".to_string(),
            properties: Some(json!({
                "location": {
                    "type": "string",
                    "description": "City name, e.g., 'San Francisco, CA'"
                },
                "unit": {
                    "type": "string",
                    "enum": ["celsius", "fahrenheit"],
                    "description": "Temperature unit"
                }
            })),
            required: Some(vec!["location".to_string()]),
        },
        cache_control: None,
    };

    let request = CreateMessageRequest {
        model: "claude-3-5-sonnet-20241022".to_string(),
        max_tokens: 1024,
        messages: vec![MessageParam::user_text("What's the weather in San Francisco?")],
        tools: Some(vec![weather_tool]),
        ..Default::default()
    };

    let response = client.messages().create(request).await?;

    // Handle tool use response
    for block in &response.content {
        match block {
            ContentBlock::ToolUse { id, name, input } => {
                println!("Tool called: {}", name);
                println!("Input: {}", serde_json::to_string_pretty(input)?);

                // Execute your tool function here
                let tool_result = json!({
                    "temperature": 72,
                    "conditions": "Partly cloudy"
                });

                // Send result back in next message
                let follow_up = CreateMessageRequest {
                    model: "claude-3-5-sonnet-20241022".to_string(),
                    max_tokens: 1024,
                    messages: vec![
                        MessageParam::user_text("What's the weather in San Francisco?"),
                        MessageParam::assistant(vec![block.clone()]),
                        MessageParam::user(vec![ContentBlock::ToolResult {
                            tool_use_id: id.clone(),
                            content: serde_json::to_string(&tool_result)?,
                            is_error: None,
                            cache_control: None,
                        }]),
                    ],
                    tools: None,
                    ..Default::default()
                };

                let final_response = client.messages().create(follow_up).await?;
                // Process final response...
            }
            _ => {}
        }
    }

    Ok(())
}
```

## Vision (Image Analysis)

Analyze images with vision models:

```rust
use integrations_anthropic::{
    create_client_from_env,
    services::messages::{CreateMessageRequest, MessageParam, ContentBlock, ImageSource}
};
use std::fs;
use base64::{Engine as _, engine::general_purpose};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = create_client_from_env()?;

    // Read and encode image
    let image_data = fs::read("path/to/image.jpg")?;
    let base64_image = general_purpose::STANDARD.encode(&image_data);

    let request = CreateMessageRequest {
        model: "claude-3-5-sonnet-20241022".to_string(),
        max_tokens: 1024,
        messages: vec![MessageParam::user(vec![
            ContentBlock::Image {
                source: ImageSource {
                    source_type: "base64".to_string(),
                    media_type: "image/jpeg".to_string(),
                    data: base64_image,
                },
                cache_control: None,
            },
            ContentBlock::Text {
                text: "What's in this image?".to_string(),
                cache_control: None,
            },
        ])],
        ..Default::default()
    };

    let response = client.messages().create(request).await?;
    println!("Analysis: {}", response.content[0].text());

    Ok(())
}
```

## PDF Analysis (Beta)

Analyze PDF documents:

```rust
use integrations_anthropic::{
    create_client_from_env,
    config::{AnthropicConfigBuilder, BetaFeature},
    services::messages::{CreateMessageRequest, MessageParam, ContentBlock, DocumentSource}
};
use std::fs;
use base64::{Engine as _, engine::general_purpose};
use secrecy::SecretString;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Enable PDF support beta feature
    let config = AnthropicConfigBuilder::new()
        .api_key(SecretString::new(std::env::var("ANTHROPIC_API_KEY")?))
        .beta_feature(BetaFeature::PdfSupport)
        .build()?;

    let client = integrations_anthropic::create_client(config)?;

    // Read and encode PDF
    let pdf_data = fs::read("document.pdf")?;
    let base64_pdf = general_purpose::STANDARD.encode(&pdf_data);

    let request = CreateMessageRequest {
        model: "claude-3-5-sonnet-20241022".to_string(),
        max_tokens: 2048,
        messages: vec![MessageParam::user(vec![
            ContentBlock::Document {
                source: DocumentSource {
                    source_type: "base64".to_string(),
                    media_type: "application/pdf".to_string(),
                    data: base64_pdf,
                },
                cache_control: None,
            },
            ContentBlock::Text {
                text: "Summarize this document".to_string(),
                cache_control: None,
            },
        ])],
        ..Default::default()
    };

    let response = client.messages().create(request).await?;
    println!("Summary: {}", response.content[0].text());

    Ok(())
}
```

## Prompt Caching (Beta)

Reduce costs and latency by caching large prompts:

```rust
use integrations_anthropic::{
    create_client_from_env,
    config::{AnthropicConfigBuilder, BetaFeature},
    services::messages::{CreateMessageRequest, MessageParam, ContentBlock, CacheControl}
};
use secrecy::SecretString;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = AnthropicConfigBuilder::new()
        .api_key(SecretString::new(std::env::var("ANTHROPIC_API_KEY")?))
        .beta_feature(BetaFeature::PromptCaching)
        .build()?;

    let client = integrations_anthropic::create_client(config)?;

    // Large system prompt with caching
    let large_context = "...large document or context...".to_string();

    let request = CreateMessageRequest {
        model: "claude-3-5-sonnet-20241022".to_string(),
        max_tokens: 1024,
        system: Some(vec![ContentBlock::Text {
            text: large_context,
            cache_control: Some(CacheControl { cache_type: "ephemeral".to_string() }),
        }]),
        messages: vec![MessageParam::user_text("Question about the context")],
        ..Default::default()
    };

    let response = client.messages().create(request).await?;

    // Check cache usage
    if let Some(cache_tokens) = response.usage.cache_read_input_tokens {
        println!("Cache read tokens: {}", cache_tokens);
    }
    if let Some(cache_creation_tokens) = response.usage.cache_creation_input_tokens {
        println!("Cache creation tokens: {}", cache_creation_tokens);
    }

    Ok(())
}
```

## Error Handling

The SDK provides comprehensive error types:

```rust
use integrations_anthropic::{create_client_from_env, AnthropicError};
use integrations_anthropic::services::messages::{CreateMessageRequest, MessageParam};

#[tokio::main]
async fn main() {
    let client = create_client_from_env().unwrap();

    let request = CreateMessageRequest {
        model: "claude-3-5-sonnet-20241022".to_string(),
        max_tokens: 1024,
        messages: vec![MessageParam::user_text("Hello!")],
        ..Default::default()
    };

    match client.messages().create(request).await {
        Ok(response) => {
            println!("Success: {}", response.content[0].text());
        }
        Err(AnthropicError::RateLimit { retry_after, message }) => {
            println!("Rate limited! Retry after: {:?}", retry_after);
            println!("Message: {}", message);
        }
        Err(AnthropicError::Authentication { message, .. }) => {
            println!("Authentication failed: {}", message);
            println!("Check your ANTHROPIC_API_KEY");
        }
        Err(AnthropicError::InvalidRequest { message, .. }) => {
            println!("Invalid request: {}", message);
        }
        Err(AnthropicError::Overloaded { message, .. }) => {
            println!("API overloaded: {}", message);
            println!("Try again later");
        }
        Err(e) => {
            println!("Error: {}", e);
        }
    }
}
```

## Configuration

### Builder Pattern

```rust
use integrations_anthropic::{AnthropicConfigBuilder, create_client, config::BetaFeature};
use secrecy::SecretString;
use std::time::Duration;

let config = AnthropicConfigBuilder::new()
    .api_key(SecretString::new("sk-ant-api03-...".to_string()))
    .base_url("https://api.anthropic.com")
    .timeout(Duration::from_secs(60))
    .max_retries(3)
    .beta_feature(BetaFeature::ExtendedThinking)
    .beta_feature(BetaFeature::PromptCaching)
    .build()
    .unwrap();

let client = create_client(config).unwrap();
```

### Environment Variables

The SDK reads the following environment variables:

- `ANTHROPIC_API_KEY`: Your API key (required)
- `ANTHROPIC_BASE_URL`: Custom API base URL (optional)
- `ANTHROPIC_API_VERSION`: API version (optional, defaults to 2023-06-01)

```rust
use integrations_anthropic::create_client_from_env;

// Reads ANTHROPIC_API_KEY from environment
let client = create_client_from_env().unwrap();
```

## Batches API (Feature: `batches`)

Process multiple requests in a single batch:

```rust
#[cfg(feature = "batches")]
use integrations_anthropic::{
    create_client_from_env,
    services::batches::{CreateBatchRequest, BatchRequest}
};

#[cfg(feature = "batches")]
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = create_client_from_env()?;

    let batch_request = CreateBatchRequest {
        requests: vec![
            BatchRequest {
                custom_id: "request-1".to_string(),
                params: serde_json::json!({
                    "model": "claude-3-5-sonnet-20241022",
                    "max_tokens": 1024,
                    "messages": [{"role": "user", "content": "Hello"}]
                }),
            },
            BatchRequest {
                custom_id: "request-2".to_string(),
                params: serde_json::json!({
                    "model": "claude-3-5-sonnet-20241022",
                    "max_tokens": 1024,
                    "messages": [{"role": "user", "content": "Hi"}]
                }),
            },
        ],
    };

    let batch = client.batches().create(batch_request).await?;
    println!("Batch created: {}", batch.id);

    // Poll for completion
    loop {
        let status = client.batches().retrieve(&batch.id).await?;

        if status.processing_status == "ended" {
            println!("Batch complete!");

            // Get results
            let results = client.batches().results(&batch.id).await?;
            for result in results.results {
                println!("Request {}: {:?}", result.custom_id, result.result);
            }
            break;
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
    }

    Ok(())
}
```

## Admin API (Feature: `admin`)

Manage organizations, workspaces, and users:

```rust
#[cfg(feature = "admin")]
use integrations_anthropic::create_client_from_env;

#[cfg(feature = "admin")]
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = create_client_from_env()?;

    // List workspaces
    let workspaces = client.admin().workspaces().list(None).await?;
    for workspace in workspaces.data {
        println!("Workspace: {} ({})", workspace.name, workspace.id);
    }

    // List API keys
    let keys = client.admin().api_keys().list(None).await?;
    for key in keys.data {
        println!("API Key: {} ({})", key.name, key.id);
    }

    Ok(())
}
```

## Models API

List available models:

```rust
use integrations_anthropic::create_client_from_env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = create_client_from_env()?;

    let models = client.models().list().await?;

    for model in models.data {
        println!("Model: {}", model.id);
        println!("  Display name: {}", model.display_name);
        println!("  Created: {}", model.created_at);
    }

    Ok(())
}
```

## Token Counting

Count tokens before making a request:

```rust
use integrations_anthropic::{create_client_from_env, services::messages::{CountTokensRequest, MessageParam}};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = create_client_from_env()?;

    let request = CountTokensRequest {
        model: "claude-3-5-sonnet-20241022".to_string(),
        messages: vec![MessageParam::user_text("Hello, how are you?")],
        system: None,
        tools: None,
    };

    let count = client.messages().count_tokens(request).await?;
    println!("Input tokens: {}", count.input_tokens);

    Ok(())
}
```

## Feature Flags

The SDK provides several feature flags for optional functionality:

- `default`: Core functionality with rustls TLS backend
- `rustls`: Use rustls for TLS (default)
- `native-tls`: Use native-tls instead of rustls
- `admin`: Organization, workspace, and user management APIs
- `batches`: Message batches API
- `beta`: Extended thinking, PDF support, prompt caching, computer use
- `full`: All features enabled (`admin`, `batches`, `beta`)

Enable features in your `Cargo.toml`:

```toml
[dependencies]
integrations-anthropic = { path = "../anthropic/rust", features = ["full"] }
```

## Best Practices

### 1. Use Streaming for Long Responses

Streaming provides a better user experience for long-form content:

```rust
let mut stream = client.messages().create_stream(request).await?;
while let Some(event) = stream.next().await {
    // Process events incrementally
}
```

### 2. Implement Retry Logic

The SDK includes built-in retry with exponential backoff, but you can customize it:

```rust
use integrations_anthropic::AnthropicConfigBuilder;
use std::time::Duration;

let config = AnthropicConfigBuilder::new()
    .max_retries(5)
    .timeout(Duration::from_secs(120))
    .build()?;
```

### 3. Handle Rate Limits

Always handle rate limit errors gracefully:

```rust
match client.messages().create(request).await {
    Err(AnthropicError::RateLimit { retry_after, .. }) => {
        if let Some(duration) = retry_after {
            tokio::time::sleep(duration).await;
            // Retry request
        }
    }
    Ok(response) => { /* ... */ }
    Err(e) => { /* ... */ }
}
```

### 4. Use Prompt Caching for Large Contexts

When working with large documents or system prompts, use prompt caching to reduce costs:

```rust
let request = CreateMessageRequest {
    system: Some(vec![ContentBlock::Text {
        text: large_document,
        cache_control: Some(CacheControl { cache_type: "ephemeral".to_string() }),
    }]),
    // ... rest of request
};
```

### 5. Secure API Key Handling

Never hardcode API keys. Use environment variables or secure configuration:

```rust
// Good: From environment
let client = create_client_from_env()?;

// Good: From secure config
use secrecy::SecretString;
let config = AnthropicConfigBuilder::new()
    .api_key(SecretString::new(read_from_secure_store()?))
    .build()?;

// Bad: Hardcoded (Don't do this!)
// let config = AnthropicConfigBuilder::new()
//     .api_key(SecretString::new("sk-ant-...".to_string()))
//     .build()?;
```

## Testing

The SDK is built with London-School TDD and includes comprehensive test utilities:

```rust
#[cfg(test)]
mod tests {
    use integrations_anthropic::{
        mocks::MockMessagesService,
        services::messages::{CreateMessageRequest, Message, MessageParam}
    };
    use mockall::predicate::*;

    #[tokio::test]
    async fn test_create_message() {
        let mut mock = MockMessagesService::new();

        mock.expect_create()
            .times(1)
            .returning(|_| Ok(/* mock response */));

        let request = CreateMessageRequest {
            model: "claude-3-5-sonnet-20241022".to_string(),
            max_tokens: 1024,
            messages: vec![MessageParam::user_text("Test")],
            ..Default::default()
        };

        let result = mock.create(request).await;
        assert!(result.is_ok());
    }
}
```

## Examples

See the `examples/` directory for complete, runnable examples:

- `basic_chat.rs` - Simple chat completion
- `streaming.rs` - Streaming responses
- `tool_use.rs` - Function calling with tools
- `extended_thinking.rs` - Extended thinking for complex reasoning
- `multi_turn.rs` - Multi-turn conversations
- `vision.rs` - Image analysis
- `pdf_analysis.rs` - PDF document analysis

Run examples with:

```bash
cargo run --example basic_chat
cargo run --example streaming
cargo run --example tool_use --features beta
cargo run --example pdf_analysis --features beta
```

## API Reference

### Client

- `create_client(config: AnthropicConfig) -> Result<AnthropicClient>`
- `create_client_from_env() -> Result<AnthropicClient>`

### Messages API

- `messages().create(request: CreateMessageRequest) -> Result<Message>`
- `messages().create_stream(request: CreateMessageRequest) -> Result<MessageStream>`
- `messages().count_tokens(request: CountTokensRequest) -> Result<TokenCount>`

### Models API

- `models().list() -> Result<ModelListResponse>`
- `models().get(model_id: &str) -> Result<ModelInfo>`

### Batches API (Feature: `batches`)

- `batches().create(request: CreateBatchRequest) -> Result<MessageBatch>`
- `batches().retrieve(batch_id: &str) -> Result<MessageBatch>`
- `batches().list(params: Option<BatchListParams>) -> Result<BatchListResponse>`
- `batches().results(batch_id: &str) -> Result<BatchResultsResponse>`
- `batches().cancel(batch_id: &str) -> Result<MessageBatch>`

### Admin API (Feature: `admin`)

#### Organizations
- `admin().organizations().list() -> Result<OrganizationListResponse>`
- `admin().organizations().get(org_id: &str) -> Result<Organization>`

#### Workspaces
- `admin().workspaces().list(params: Option<WorkspaceListParams>) -> Result<WorkspaceListResponse>`
- `admin().workspaces().create(request: CreateWorkspaceRequest) -> Result<Workspace>`
- `admin().workspaces().get(workspace_id: &str) -> Result<Workspace>`
- `admin().workspaces().update(workspace_id: &str, request: UpdateWorkspaceRequest) -> Result<Workspace>`

#### API Keys
- `admin().api_keys().list(params: Option<ApiKeyListParams>) -> Result<ApiKeyListResponse>`
- `admin().api_keys().create(request: CreateApiKeyRequest) -> Result<ApiKey>`
- `admin().api_keys().get(key_id: &str) -> Result<ApiKey>`
- `admin().api_keys().delete(key_id: &str) -> Result<()>`

#### Users
- `admin().users().list(params: Option<UserListParams>) -> Result<UserListResponse>`
- `admin().users().get(user_id: &str) -> Result<User>`
- `admin().users().update(user_id: &str, request: UpdateUserRequest) -> Result<User>`

## Requirements

- Rust 1.70 or later
- Tokio runtime for async support

## License

See LICENSE file for details.

## Contributing

Contributions are welcome! Please ensure:

1. All tests pass: `cargo test`
2. Code is formatted: `cargo fmt`
3. No clippy warnings: `cargo clippy`
4. Documentation is updated

## Support

For issues and questions:
- GitHub Issues: https://github.com/integrations/anthropic/issues
- Documentation: https://docs.anthropic.com

## SPARC Specification

This implementation follows the SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) methodology. See the `/plans/LLM/anthropic/` directory for complete specification documents.
