# Cohere Integration

Production-ready Cohere API client implementations in Rust and TypeScript, built following SPARC methodology and London-School TDD principles.

## Features

### Core Capabilities
- **11 Service Categories**: Chat, Generate, Embed, Rerank, Classify, Summarize, Tokenize, Models, Datasets, Connectors, Fine-tuning
- **Full Type Safety**: Complete type definitions for all API endpoints
- **Streaming Support**: Server-Sent Events (SSE) for Chat and Generate services
- **Async-First Design**: Built for concurrent, non-blocking operations

### Resilience Patterns
- **Retry with Exponential Backoff**: Configurable retry logic with jitter
- **Circuit Breaker**: Fault tolerance with automatic recovery
- **Rate Limiting**: Token bucket algorithm with header-based updates
- **Orchestration**: Combined resilience patterns for robust API calls

### Observability
- **Distributed Tracing**: Request span tracking with parent/child relationships
- **Metrics Collection**: Counters, gauges, histograms for monitoring
- **Structured Logging**: JSON-formatted logs with sensitive data redaction

### Security
- **TLS 1.2+**: Secure transport encryption
- **Credential Protection**: SecretString/redaction for API keys
- **Input Validation**: Comprehensive request validation

## Installation

### Rust

Add to your `Cargo.toml`:

```toml
[dependencies]
cohere-client = { path = "cohere/rust" }
```

Enable optional features:
```toml
[dependencies]
cohere-client = { path = "cohere/rust", features = ["datasets", "connectors", "finetune", "full"] }
```

### TypeScript

```bash
cd cohere/typescript
npm install
```

## Quick Start

### Rust

```rust
use cohere_client::{create_client_from_env, CohereClient};
use cohere_client::services::chat::ChatRequest;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Create client from environment
    let client = create_client_from_env()?;

    // Send a chat message
    let response = client.chat()
        .chat(ChatRequest::new("Hello, how can you help me today?"))
        .await?;

    println!("Response: {}", response.text);
    Ok(())
}
```

### TypeScript

```typescript
import { createClientFromEnv } from '@anthropic/cohere-client';

const client = createClientFromEnv();

// Send a chat message
const response = await client.chat.chat({
  message: 'Hello, how can you help me today?',
});

console.log('Response:', response.text);
```

## Services

### Chat
Conversational AI with tool use and RAG support.

```rust
let request = ChatRequest::new("What's the weather?")
    .model("command")
    .temperature(0.7)
    .tools(vec![weather_tool]);

let response = client.chat().chat(request).await?;
```

### Generate
Text generation with likelihoods.

```rust
let request = GenerateRequest::new("Once upon a time")
    .max_tokens(100)
    .num_generations(3);

let response = client.generate().generate(request).await?;
```

### Embed
Text embeddings for semantic search.

```rust
let request = EmbedRequest::new(vec!["Hello", "World"])
    .input_type(InputType::SearchDocument)
    .model("embed-english-v3.0");

let response = client.embed().embed(request).await?;
```

### Rerank
Document reranking by relevance.

```rust
let request = RerankRequest::new(
    "What is AI?",
    vec!["AI is artificial intelligence", "The weather is nice"]
).top_n(5);

let response = client.rerank().rerank(request).await?;
```

### Classify
Few-shot text classification.

```rust
let request = ClassifyRequest::new(
    vec!["This is great!"],
    classify_examples()
);

let response = client.classify().classify(request).await?;
```

## Streaming

Both Chat and Generate support streaming responses:

```rust
// Rust
let stream = client.chat().chat_stream(request).await?;
while let Some(event) = stream.next().await {
    match event?.event_type {
        ChatStreamEventType::TextGeneration => {
            print!("{}", event.text.unwrap_or_default());
        }
        ChatStreamEventType::StreamEnd => break,
        _ => {}
    }
}
```

```typescript
// TypeScript
for await (const event of client.chat.chatStream({ message: 'Hello' })) {
  if (event.eventType === 'text-generation') {
    process.stdout.write(event.text ?? '');
  }
}
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `COHERE_API_KEY` | API key (required) | - |
| `COHERE_BASE_URL` | Base URL | `https://api.cohere.ai` |
| `COHERE_TIMEOUT` | Request timeout (ms) | `30000` |
| `COHERE_MAX_RETRIES` | Maximum retries | `3` |

### Programmatic Configuration

```rust
let config = CohereConfigBuilder::new()
    .api_key("your-api-key")
    .base_url("https://api.cohere.ai")
    .timeout(Duration::from_secs(60))
    .max_retries(5)
    .build()?;

let client = CohereClient::new(config);
```

## Testing

### Mock Infrastructure

Both implementations include comprehensive mocking for London-School TDD:

```rust
// Rust
let (service, transport) = MockClientBuilder::new()
    .with_response(MockResponse::json(&chat_response()))
    .build(|t, a, u| ChatServiceImpl::new(t, a, u));
```

```typescript
// TypeScript
const transport = new MockHttpTransport()
  .addJsonResponse(chatResponse());

const service = new ChatServiceImpl(transport, config);
```

### Running Tests

```bash
# Rust
cd cohere/rust
cargo test

# TypeScript
cd cohere/typescript
npm test
```

## Architecture

```
cohere/
├── rust/
│   └── src/
│       ├── auth/           # Authentication management
│       ├── client/         # Main client implementation
│       ├── config/         # Configuration handling
│       ├── errors/         # Error types and handling
│       ├── fixtures/       # Test fixtures
│       ├── mocks/          # Mock implementations
│       ├── observability/  # Tracing, metrics, logging
│       ├── resilience/     # Retry, circuit breaker, rate limiter
│       ├── services/       # API service implementations
│       ├── transport/      # HTTP transport layer
│       └── types/          # Common type definitions
└── typescript/
    └── src/
        ├── client/         # Main client implementation
        ├── config/         # Configuration handling
        ├── errors/         # Error types
        ├── fixtures/       # Test fixtures
        ├── mocks/          # Mock implementations
        ├── observability/  # Tracing, metrics, logging
        ├── resilience/     # Retry, circuit breaker, rate limiter
        ├── services/       # API service implementations
        ├── transport/      # HTTP transport layer
        └── types/          # Common type definitions
```

## SPARC Methodology

This implementation follows the SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) methodology:

1. **Specification**: Detailed API contracts and requirements
2. **Pseudocode**: Algorithm design before implementation
3. **Architecture**: Hexagonal/ports-and-adapters design
4. **Refinement**: Iterative improvement with tests
5. **Completion**: Production hardening and documentation

## License

MIT
