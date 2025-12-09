# OpenAI Rust Client

A production-ready, type-safe Rust client for the OpenAI API with comprehensive resilience patterns.

## Features

- **Complete API Coverage**: Chat Completions, Embeddings, Models, Files, Images, Audio, Moderations, Batches, Fine-tuning, Assistants
- **Type Safety**: Full Rust type system leveraging serde serialization
- **Streaming Support**: Server-Sent Events (SSE) for chat completions
- **Resilience Patterns**: Retry with exponential backoff + jitter, circuit breaker, rate limiting
- **Async/Await**: Built on tokio with async-trait
- **TLS Flexibility**: Choose between rustls or native-tls

## Installation

Add to your `Cargo.toml`:

```toml
[dependencies]
integrations-openai = "0.1"
```

With features:
```toml
[dependencies]
integrations-openai = { version = "0.1", features = ["full"] }
```

### Available Features

- `default` - Core functionality with rustls
- `native-tls` - Use native TLS instead of rustls
- `assistants` - Assistants API support
- `fine-tuning` - Fine-tuning API support
- `batches` - Batch API support
- `full` - All features enabled

## Quick Start

```rust
use integrations_openai::{OpenAIClientBuilder, ChatCompletionRequest, ChatMessage};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = integrations_openai::OpenAIConfig::from_env()?;
    let client = OpenAIClientBuilder::new()
        .with_config(config)
        .build()?;

    let response = client.chat()
        .create(ChatCompletionRequest::new(
            "gpt-4",
            vec![ChatMessage::user("Hello, how are you?")],
        ))
        .await?;

    println!("{}", response.choices[0].message.content.as_ref().unwrap());
    Ok(())
}
```

## Chat Completions

### Basic Usage

```rust
use integrations_openai::{ChatCompletionRequest, ChatMessage};

let request = ChatCompletionRequest::new(
    "gpt-4",
    vec![
        ChatMessage::system("You are a helpful assistant."),
        ChatMessage::user("What is the capital of France?"),
    ],
)
.with_temperature(0.7)
.with_max_tokens(150);

let response = client.chat().create(request).await?;
```

### Streaming

```rust
use futures::StreamExt;

let request = ChatCompletionRequest::new(
    "gpt-4",
    vec![ChatMessage::user("Tell me a story")],
);

let mut stream = client.chat().create_stream(request).await?;

while let Some(chunk) = stream.next().await {
    let chunk = chunk?;
    if let Some(content) = &chunk.choices[0].delta.content {
        print!("{}", content);
    }
}
```

### Function Calling

```rust
use integrations_openai::{Tool, FunctionDefinition};
use serde_json::json;

let request = ChatCompletionRequest::new(
    "gpt-4",
    vec![ChatMessage::user("What's the weather in San Francisco?")],
)
.with_tools(vec![
    Tool {
        tool_type: "function".to_string(),
        function: FunctionDefinition {
            name: "get_weather".to_string(),
            description: Some("Get current weather for a location".to_string()),
            parameters: Some(json!({
                "type": "object",
                "properties": {
                    "location": { "type": "string" }
                },
                "required": ["location"]
            })),
        },
    },
]);

let response = client.chat().create(request).await?;
```

## Embeddings

```rust
use integrations_openai::EmbeddingsRequest;

let response = client.embeddings()
    .create(EmbeddingsRequest::new(
        "text-embedding-3-small",
        vec!["Hello world".to_string(), "Goodbye world".to_string()],
    ))
    .await?;

for embedding in &response.data {
    println!("Embedding dimension: {}", embedding.embedding.len());
}
```

## Files

```rust
use integrations_openai::{FileUploadRequest, FilePurpose};
use bytes::Bytes;

// Upload a file
let file = client.files()
    .upload(FileUploadRequest::new(
        Bytes::from("training data..."),
        "training.jsonl",
        FilePurpose::FineTune,
    ))
    .await?;

// List files
let files = client.files().list(None).await?;

// Download content
let content = client.files().content(&file.id).await?;

// Delete file
client.files().delete(&file.id).await?;
```

## Images

```rust
use integrations_openai::{ImageGenerationRequest, ImageSize, ImageQuality};

// Generate images
let response = client.images()
    .generate(ImageGenerationRequest::new("A sunset over mountains")
        .with_size(ImageSize::Size1024x1024)
        .with_quality(ImageQuality::Hd))
    .await?;

// Edit images
use integrations_openai::ImageEditRequest;

let response = client.images()
    .edit(ImageEditRequest {
        image: image_bytes,
        prompt: "Add a rainbow".to_string(),
        mask: Some(mask_bytes),
        model: None,
        n: None,
        size: None,
        response_format: None,
        user: None,
    })
    .await?;
```

## Audio

```rust
use integrations_openai::{TranscriptionRequest, SpeechRequest, SpeechVoice};

// Transcribe audio
let transcription = client.audio()
    .transcribe(TranscriptionRequest::new(audio_bytes, "recording.mp3"))
    .await?;

// Generate speech
let speech = client.audio()
    .speech(SpeechRequest::new("Hello world!", SpeechVoice::Alloy))
    .await?;
```

## Moderations

```rust
use integrations_openai::ModerationRequest;

let response = client.moderations()
    .create(ModerationRequest::new("Check this content"))
    .await?;

if response.results[0].flagged {
    println!("Content was flagged!");
}
```

## Fine-tuning

```rust
use integrations_openai::FineTuningJobRequest;

// Create fine-tuning job (requires fine-tuning feature)
#[cfg(feature = "fine-tuning")]
{
    let job = client.fine_tuning()
        .create(FineTuningJobRequest::new("gpt-3.5-turbo", training_file_id))
        .await?;

    // List jobs
    let jobs = client.fine_tuning().list(None).await?;

    // Get job events
    let events = client.fine_tuning().list_events(&job.id, None).await?;
}
```

## Assistants (Beta)

```rust
use integrations_openai::CreateAssistantRequest;

// Create an assistant (requires assistants feature)
#[cfg(feature = "assistants")]
{
    let assistant = client.assistants()
        .create(CreateAssistantRequest::new("gpt-4")
            .with_name("Math Tutor")
            .with_instructions("You are a math tutor."))
        .await?;

    // List assistants
    let assistants = client.assistants().list(None).await?;
}
```

## Error Handling

```rust
use integrations_openai::OpenAIError;

match client.chat().create(request).await {
    Ok(response) => println!("Success!"),
    Err(OpenAIError::RateLimit { message, retry_after }) => {
        println!("Rate limited, retry after {:?}", retry_after);
    }
    Err(OpenAIError::Authentication { message }) => {
        println!("Auth error: {}", message);
    }
    Err(OpenAIError::InvalidRequest { message, param, code }) => {
        println!("Invalid request: {} (param: {:?})", message, param);
    }
    Err(e) => println!("Other error: {}", e),
}
```

## Configuration

### Basic Configuration

```rust
use integrations_openai::OpenAIConfig;
use std::time::Duration;

let config = OpenAIConfig::new("sk-...")
    .with_timeout(Duration::from_secs(30))
    .with_max_retries(5);

let client = OpenAIClientBuilder::new()
    .with_config(config)
    .build()?;
```

### Advanced Resilience Configuration

```rust
use integrations_openai::{OpenAIClientBuilder, OpenAIConfig};
use std::sync::Arc;

let config = OpenAIConfig::new("sk-...");

// Custom transport, auth, and resilience can be injected
let client = OpenAIClientBuilder::new()
    .with_config(config)
    .build()?;
```

## Custom HTTP Transport

```rust
use integrations_openai::{OpenAIClientBuilder, HttpTransport};
use async_trait::async_trait;
use std::sync::Arc;

struct CustomTransport {
    // Custom implementation
}

#[async_trait]
impl HttpTransport for CustomTransport {
    // Implement transport methods
}

let client = OpenAIClientBuilder::new()
    .with_api_key("sk-...")
    .with_transport(Arc::new(CustomTransport::new()))
    .build()?;
```

## Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key (required)
- `OPENAI_BASE_URL` - Custom base URL (optional, defaults to https://api.openai.com/v1)
- `OPENAI_ORGANIZATION_ID` - Organization ID (optional)
- `OPENAI_PROJECT_ID` - Project ID (optional)

Example:

```bash
export OPENAI_API_KEY=sk-...
export OPENAI_ORGANIZATION_ID=org-...
```

Then in your code:

```rust
let config = OpenAIConfig::from_env()?;
let client = OpenAIClientBuilder::new()
    .with_config(config)
    .build()?;
```

## Testing

The crate provides mock implementations for testing:

```rust
use integrations_openai::mocks::{MockHttpTransport, MockAuthManager, MockResilienceOrchestrator};
use integrations_openai::fixtures::chat_completion_response;
use integrations_openai::services::chat::ChatCompletionServiceImpl;
use std::sync::Arc;

#[tokio::test]
async fn test_chat_completion() {
    let mock_transport = MockHttpTransport::new()
        .with_json_response(chat_completion_response());

    let service = ChatCompletionServiceImpl::new(
        Arc::new(mock_transport),
        Arc::new(MockAuthManager::new()),
        Arc::new(MockResilienceOrchestrator::passthrough()),
    );

    let request = ChatCompletionRequest::new(
        "gpt-4",
        vec![ChatMessage::user("test")],
    );

    let result = service.create(request).await;
    assert!(result.is_ok());
}
```

## Examples

See the `examples/` directory for complete working examples:

- `chat_completion.rs` - Basic chat completion
- `streaming.rs` - Streaming chat completion

Run examples with:

```bash
cargo run --example chat_completion
cargo run --example streaming
```

## Architecture

This client is built with a modular architecture:

- **Client Layer**: High-level API client (`OpenAIClient`, `OpenAIClientBuilder`)
- **Service Layer**: Individual service implementations (chat, embeddings, etc.)
- **Transport Layer**: HTTP transport abstraction with pluggable implementations
- **Auth Layer**: Authentication management with API key handling
- **Resilience Layer**: Retry logic, circuit breakers, rate limiting
- **Types Layer**: Request/response types with serde serialization

## Performance

The client is designed for high performance:

- Connection pooling with configurable limits
- Async I/O with tokio runtime
- Zero-copy streaming for large responses
- Efficient JSON serialization/deserialization

## Security

- API keys stored using the `secrecy` crate to prevent accidental exposure
- TLS support with both rustls and native-tls
- No credential logging in error messages
- Configurable timeout and retry limits to prevent resource exhaustion

## Project Structure

```
openai/rust/
├── Cargo.toml                 # Package manifest with dependencies and features
└── src/
    ├── lib.rs                 # Library root with public API exports
    ├── client/                # Client configuration and factory
    ├── errors/                # Error handling
    ├── transport/             # HTTP transport layer
    ├── auth/                  # Authentication
    ├── resilience/            # Retry and resilience
    ├── types/                 # Common types
    └── services/              # API service implementations
        ├── chat/              # Chat Completions API
        ├── embeddings/        # Embeddings API
        ├── files/             # Files API
        ├── models/            # Models API
        ├── batches/           # Batches API (feature-gated)
        ├── images/            # Images API
        ├── audio/             # Audio API (TTS/Whisper)
        ├── moderations/       # Moderations API
        ├── fine_tuning/       # Fine-tuning API (feature-gated)
        └── assistants/        # Assistants API (feature-gated)
```

## License

This project is licensed under the LLM Dev Ops Permanent Source-Available License. See the LICENSE file in the repository root for details.

## Contributing

This is part of the Anthropic integrations repository. Contributions are welcome following the repository guidelines.

## Support

For issues, questions, or contributions, please visit the [GitHub repository](https://github.com/anthropics/integrations).
