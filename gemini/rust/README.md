# integrations-gemini (Rust)

[![Crates.io](https://img.shields.io/crates/v/integrations-gemini.svg)](https://crates.io/crates/integrations-gemini)
[![Documentation](https://docs.rs/integrations-gemini/badge.svg)](https://docs.rs/integrations-gemini)
[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/workflow/status/your-org/integrations/CI)](https://github.com/your-org/integrations/actions)

Production-ready Rust client for the [Google Gemini API](https://ai.google.dev/), providing type-safe access to Google's advanced generative AI models with built-in resilience patterns and comprehensive observability.

## Features

- **Full API Coverage**: Complete support for all Gemini API endpoints
  - Content Generation (text, multimodal, code)
  - Text Embeddings (single and batch)
  - Model Information and Listing
  - File Upload and Management
  - Cached Content (context caching)

- **Streaming Support**: Efficient streaming with chunked JSON parser for real-time responses

- **Dual Authentication**: Flexible authentication methods
  - Header-based (`x-goog-api-key`)
  - Query parameter-based (`?key=`)

- **Resilience Patterns**: Production-ready reliability features
  - Automatic retry with exponential backoff
  - Circuit breaker for fault tolerance
  - Rate limiting with token bucket algorithm
  - Configurable timeouts

- **Observability**: Comprehensive monitoring and debugging
  - Distributed tracing integration
  - Structured logging
  - Metrics collection and reporting
  - Request/response logging

- **Type-Safe**: Fully typed request and response models with `serde`

- **Async Runtime**: Built on Tokio for high-performance async operations

- **Security**: Secure credential handling with `secrecy` crate

- **Testing**: London-school TDD with extensive mock support

## Installation

Add this to your `Cargo.toml`:

```toml
[dependencies]
integrations-gemini = "0.1"
tokio = { version = "1", features = ["full"] }
secrecy = "0.8"
```

## Quick Start

### Creating a Client from Environment

The simplest way to get started is to use environment variables:

```rust
use integrations_gemini::create_client_from_env;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Reads from GEMINI_API_KEY or GOOGLE_API_KEY
    let client = create_client_from_env()?;

    Ok(())
}
```

### Creating a Client with Explicit Configuration

For more control, build the client with custom configuration:

```rust
use integrations_gemini::{GeminiClientImpl, GeminiConfig};
use secrecy::SecretString;
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = GeminiClientImpl::builder()
        .api_key(SecretString::new("your-api-key".into()))
        .timeout(Duration::from_secs(60))
        .build()?;

    Ok(())
}
```

### Basic Content Generation

Generate text content using the Gemini models:

```rust
use integrations_gemini::{
    create_client_from_env,
    GenerateContentRequest,
    Content, Part, Role,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = create_client_from_env()?;

    // Create a simple text prompt
    let request = GenerateContentRequest {
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text {
                text: "Explain quantum computing in simple terms".to_string(),
            }],
        }],
        ..Default::default()
    };

    // Generate content
    let response = client
        .content()
        .generate("gemini-1.5-flash", request)
        .await?;

    // Extract the text from the response
    if let Some(candidate) = response.candidates.first() {
        if let Some(content) = &candidate.content {
            for part in &content.parts {
                if let Part::Text { text } = part {
                    println!("Response: {}", text);
                }
            }
        }
    }

    Ok(())
}
```

## Streaming Example

Stream responses in real-time for faster perceived latency:

```rust
use integrations_gemini::{
    create_client_from_env,
    GenerateContentRequest,
    Content, Part, Role,
};
use futures::StreamExt;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = create_client_from_env()?;

    let request = GenerateContentRequest {
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text {
                text: "Write a short story about a robot".to_string(),
            }],
        }],
        ..Default::default()
    };

    // Stream the response
    let mut stream = client
        .content()
        .generate_stream("gemini-1.5-pro", request)
        .await?;

    // Process chunks as they arrive
    while let Some(result) = stream.next().await {
        let response = result?;

        if let Some(candidate) = response.candidates.first() {
            if let Some(content) = &candidate.content {
                for part in &content.parts {
                    if let Part::Text { text } = part {
                        print!("{}", text);
                    }
                }
            }
        }
    }

    println!(); // New line after streaming
    Ok(())
}
```

## Safety Settings Example

Configure content safety filters for generated responses:

```rust
use integrations_gemini::{
    create_client_from_env,
    GenerateContentRequest,
    Content, Part, Role,
    SafetySetting, HarmCategory, HarmBlockThreshold,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = create_client_from_env()?;

    let request = GenerateContentRequest {
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text {
                text: "Tell me about ancient history".to_string(),
            }],
        }],
        safety_settings: Some(vec![
            SafetySetting {
                category: HarmCategory::HateSpeech,
                threshold: HarmBlockThreshold::BlockMediumAndAbove,
            },
            SafetySetting {
                category: HarmCategory::DangerousContent,
                threshold: HarmBlockThreshold::BlockMediumAndAbove,
            },
        ]),
        ..Default::default()
    };

    let response = client
        .content()
        .generate("gemini-1.5-flash", request)
        .await?;

    // Check safety ratings
    if let Some(candidate) = response.candidates.first() {
        if let Some(ratings) = &candidate.safety_ratings {
            for rating in ratings {
                println!("{:?}: {:?}", rating.category, rating.probability);
            }
        }
    }

    Ok(())
}
```

## File Upload Example

Upload files for use in multimodal prompts:

```rust
use integrations_gemini::{
    create_client_from_env,
    UploadFileRequest,
    GenerateContentRequest,
    Content, Part, Role, FileData,
};
use std::path::Path;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = create_client_from_env()?;

    // Upload a file
    let upload_request = UploadFileRequest {
        file_path: Path::new("image.jpg").to_path_buf(),
        mime_type: Some("image/jpeg".to_string()),
        display_name: Some("My Image".to_string()),
    };

    let file = client.files().upload(upload_request).await?;
    println!("Uploaded file: {}", file.name);

    // Use the file in a prompt
    let request = GenerateContentRequest {
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![
                Part::Text {
                    text: "What's in this image?".to_string(),
                },
                Part::FileData {
                    file_data: FileData {
                        mime_type: Some("image/jpeg".to_string()),
                        file_uri: file.uri,
                    },
                },
            ],
        }],
        ..Default::default()
    };

    let response = client
        .content()
        .generate("gemini-1.5-flash", request)
        .await?;

    // Process response...

    Ok(())
}
```

## Cached Content Example

Use context caching to reduce costs for repeated prompts with large contexts:

```rust
use integrations_gemini::{
    create_client_from_env,
    CreateCachedContentRequest,
    GenerateContentRequest,
    Content, Part, Role,
};
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = create_client_from_env()?;

    // Create a cached content with large context
    let cache_request = CreateCachedContentRequest {
        model: "models/gemini-1.5-flash-001".to_string(),
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text {
                text: "Large context document goes here...".to_string(),
            }],
        }],
        ttl: Some(Duration::from_secs(3600)), // 1 hour
        ..Default::default()
    };

    let cached = client
        .cached_content()
        .create(cache_request)
        .await?;

    println!("Created cache: {}", cached.name);

    // Use the cached content in subsequent requests
    let request = GenerateContentRequest {
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text {
                text: "Based on the context, answer this question...".to_string(),
            }],
        }],
        cached_content: Some(cached.name.clone()),
        ..Default::default()
    };

    let response = client
        .content()
        .generate("gemini-1.5-flash", request)
        .await?;

    // Process response...

    Ok(())
}
```

## Error Handling

The client provides comprehensive error types for robust error handling:

```rust
use integrations_gemini::{create_client_from_env, GeminiError};

#[tokio::main]
async fn main() {
    let client = match create_client_from_env() {
        Ok(c) => c,
        Err(GeminiError::Configuration(e)) => {
            eprintln!("Configuration error: {}", e);
            return;
        }
        Err(e) => {
            eprintln!("Failed to create client: {}", e);
            return;
        }
    };

    // Use the client...
}
```

### Error Types

- `GeminiError::Configuration` - Configuration issues (missing API key, invalid URL, etc.)
- `GeminiError::Authentication` - Authentication failures
- `GeminiError::Network` - Network connectivity issues
- `GeminiError::RateLimit` - Rate limit exceeded
- `GeminiError::Request` - Invalid request parameters
- `GeminiError::Response` - Invalid response from API
- `GeminiError::Server` - Server-side errors (5xx)
- `GeminiError::Resource` - Resource not found or access denied
- `GeminiError::Content` - Content generation errors (safety blocks, etc.)

## Configuration Options

### Full Configuration Example

```rust
use integrations_gemini::{
    GeminiConfig, AuthMethod, RetryConfig,
    CircuitBreakerConfig, RateLimitConfig,
};
use secrecy::SecretString;
use std::time::Duration;

let config = GeminiConfig::builder()
    .api_key(SecretString::new("your-api-key".into()))
    .base_url("https://generativelanguage.googleapis.com")
    .api_version("v1beta")
    .timeout(Duration::from_secs(120))
    .connect_timeout(Duration::from_secs(30))
    .auth_method(AuthMethod::Header)
    .retry_config(RetryConfig {
        max_attempts: 3,
        initial_delay: Duration::from_millis(1000),
        max_delay: Duration::from_secs(60),
        multiplier: 2.0,
        jitter: 0.25,
    })
    .circuit_breaker_config(CircuitBreakerConfig {
        failure_threshold: 5,
        success_threshold: 3,
        open_duration: Duration::from_secs(30),
        half_open_max_requests: 1,
    })
    .rate_limit_config(RateLimitConfig {
        requests_per_minute: 60,
        burst_size: 10,
    })
    .build()?;
```

### Configuration Parameters

| Parameter | Environment Variable | Default | Description |
|-----------|---------------------|---------|-------------|
| `api_key` | `GEMINI_API_KEY`, `GOOGLE_API_KEY` | Required | Your Gemini API key |
| `base_url` | `GEMINI_BASE_URL` | `https://generativelanguage.googleapis.com` | API base URL |
| `api_version` | `GEMINI_API_VERSION` | `v1beta` | API version |
| `timeout` | `GEMINI_TIMEOUT_SECS` | `120` seconds | Request timeout |
| `connect_timeout` | `GEMINI_CONNECT_TIMEOUT_SECS` | `30` seconds | Connection timeout |
| `max_retries` | `GEMINI_MAX_RETRIES` | `3` | Maximum retry attempts |
| `auth_method` | - | `Header` | Authentication method |

## Environment Variables

The client automatically reads configuration from environment variables:

```bash
# Required: API key (use either GEMINI_API_KEY or GOOGLE_API_KEY)
export GEMINI_API_KEY="your-api-key-here"

# Optional: API configuration
export GEMINI_BASE_URL="https://generativelanguage.googleapis.com"
export GEMINI_API_VERSION="v1beta"

# Optional: Timeouts (in seconds)
export GEMINI_TIMEOUT_SECS="120"
export GEMINI_CONNECT_TIMEOUT_SECS="30"

# Optional: Retry settings
export GEMINI_MAX_RETRIES="3"
```

## Advanced Features

### Embeddings

Generate text embeddings for semantic search and similarity:

```rust
use integrations_gemini::{create_client_from_env, EmbedContentRequest, TaskType};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = create_client_from_env()?;

    let request = EmbedContentRequest {
        content: "What is the meaning of life?".to_string(),
        task_type: Some(TaskType::RetrievalQuery),
        title: None,
    };

    let response = client
        .embeddings()
        .embed_content("models/text-embedding-004", request)
        .await?;

    println!("Embedding dimension: {}", response.embedding.values.len());

    Ok(())
}
```

### Function Calling

Enable models to call external functions:

```rust
use integrations_gemini::{
    create_client_from_env,
    GenerateContentRequest,
    Content, Part, Role,
    Tool, FunctionDeclaration,
};
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = create_client_from_env()?;

    let tools = vec![Tool {
        function_declarations: Some(vec![
            FunctionDeclaration {
                name: "get_weather".to_string(),
                description: "Get the current weather for a location".to_string(),
                parameters: Some(json!({
                    "type": "object",
                    "properties": {
                        "location": {
                            "type": "string",
                            "description": "City name"
                        }
                    },
                    "required": ["location"]
                })),
            },
        ]),
        ..Default::default()
    }];

    let request = GenerateContentRequest {
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text {
                text: "What's the weather in San Francisco?".to_string(),
            }],
        }],
        tools: Some(tools),
        ..Default::default()
    };

    let response = client
        .content()
        .generate("gemini-1.5-pro", request)
        .await?;

    // Check if model wants to call a function
    if let Some(candidate) = response.candidates.first() {
        if let Some(content) = &candidate.content {
            for part in &content.parts {
                if let Part::FunctionCall { function_call } = part {
                    println!("Function: {}", function_call.name);
                    println!("Args: {}", function_call.args);
                }
            }
        }
    }

    Ok(())
}
```

### Token Counting

Count tokens before making requests to estimate costs:

```rust
use integrations_gemini::{
    create_client_from_env,
    CountTokensRequest,
    Content, Part, Role,
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = create_client_from_env()?;

    let request = CountTokensRequest {
        contents: vec![Content {
            role: Some(Role::User),
            parts: vec![Part::Text {
                text: "How many tokens is this text?".to_string(),
            }],
        }],
    };

    let response = client
        .content()
        .count_tokens("gemini-1.5-flash", request)
        .await?;

    println!("Total tokens: {}", response.total_tokens);

    Ok(())
}
```

## Testing

The crate includes comprehensive mocking support for testing:

```rust
use integrations_gemini::{
    GeminiClient, GeminiClientBuilder,
    mocks::MockContentService,
};

#[tokio::test]
async fn test_with_mock() {
    let mut mock_content = MockContentService::new();

    // Set up expectations...
    mock_content
        .expect_generate()
        .returning(|_, _| {
            // Return mock response
            Ok(GenerateContentResponse::default())
        });

    // Test your code with the mock
}
```

## Performance Tips

1. **Streaming**: Use streaming for long-form content generation to reduce perceived latency
2. **Context Caching**: Cache large contexts to reduce token costs on repeated requests
3. **Batch Operations**: Use batch embedding APIs for processing multiple texts
4. **Connection Pooling**: The client automatically manages HTTP connection pooling
5. **Rate Limiting**: Configure rate limits to avoid hitting API quotas

## Models

Supported Gemini models (as of v1beta):

- `gemini-1.5-pro-latest` - Most capable model, best for complex tasks
- `gemini-1.5-flash-latest` - Fast and efficient, good for most tasks
- `gemini-1.5-flash-8b-latest` - Smallest model, fastest responses
- `text-embedding-004` - Text embeddings model

For the latest model information, see the [Gemini Models documentation](https://ai.google.dev/models/gemini).

## License

Licensed under either of:

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
- MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)

at your option.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## Resources

- [Gemini API Documentation](https://ai.google.dev/docs)
- [API Reference](https://ai.google.dev/api)
- [Crate Documentation](https://docs.rs/integrations-gemini)
- [GitHub Repository](https://github.com/your-org/integrations)

## Support

- For Gemini API issues, see [Google AI Support](https://ai.google.dev/support)
- For client library issues, please [open an issue](https://github.com/your-org/integrations/issues)
