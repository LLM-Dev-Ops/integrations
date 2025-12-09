# Beta Features Guide

This guide provides comprehensive examples of using the beta features in the Anthropic Rust integration.

## Table of Contents

- [Enabling Beta Features](#enabling-beta-features)
- [Extended Thinking](#extended-thinking)
- [PDF Support](#pdf-support)
- [Prompt Caching](#prompt-caching)
- [Token Counting](#token-counting)
- [Computer Use](#computer-use)
- [Combining Features](#combining-features)

## Enabling Beta Features

To use beta features, enable the `beta` feature flag in your `Cargo.toml`:

```toml
[dependencies]
integrations-anthropic = { version = "0.1", features = ["beta"] }
```

## Extended Thinking

Extended thinking allows Claude to show its reasoning process before providing an answer.

### Basic Usage

```rust
use integrations_anthropic::services::beta::ExtendedThinkingExt;
use integrations_anthropic::services::messages::{CreateMessageRequest, MessageParam};

let messages = vec![MessageParam::user("What is the meaning of life?")];

let request = CreateMessageRequest::new("claude-3-5-sonnet-20241022", 2048, messages)
    .with_extended_thinking(Some(5000)); // 5000 token budget for thinking

// Send request and get response...
```

### Extracting Thinking Blocks

```rust
use integrations_anthropic::services::beta::{extract_thinking_blocks, has_thinking_blocks};

// After getting a response
let message = response.message;

if has_thinking_blocks(&message.content) {
    let thinking = extract_thinking_blocks(&message.content);
    for thought in thinking {
        println!("Claude's thinking: {}", thought);
    }
}
```

### Beta Header

The extended thinking feature requires the following beta header:

```rust
use integrations_anthropic::services::beta::get_extended_thinking_beta_header;

// Returns: "extended-thinking-2024-12-01"
let header = get_extended_thinking_beta_header();
```

## PDF Support

PDF support allows sending PDF documents to Claude for analysis.

### Creating PDF Content from Bytes

```rust
use integrations_anthropic::services::beta::create_pdf_content;
use std::fs;

// Read PDF file
let pdf_bytes = fs::read("document.pdf")?;

// Create PDF content block
let pdf_content = create_pdf_content(&pdf_bytes);

// Use in a message
let messages = vec![MessageParam::user_blocks(vec![
    ContentBlock::Text {
        text: "Please summarize this document".to_string(),
        cache_control: None,
    },
    pdf_content,
])];
```

### Creating PDF Content from Base64

```rust
use integrations_anthropic::services::beta::create_pdf_content_from_base64;

let base64_pdf = "JVBERi0xLjQKJS..."; // Base64-encoded PDF
let pdf_content = create_pdf_content_from_base64(base64_pdf.to_string());
```

### Validating PDFs

```rust
use integrations_anthropic::services::beta::{validate_pdf_bytes, validate_pdf_base64};

let pdf_bytes = fs::read("document.pdf")?;
if validate_pdf_bytes(&pdf_bytes) {
    println!("Valid PDF file");
}

// Or validate base64
let base64_data = "JVBERi0xLjQKJS...";
if validate_pdf_base64(base64_data) {
    println!("Valid base64-encoded PDF");
}
```

### Cacheable PDFs

```rust
use integrations_anthropic::services::beta::create_cacheable_pdf_content;

// Create a PDF that will be cached for repeated requests
let pdf_content = create_cacheable_pdf_content(&pdf_bytes);
```

## Prompt Caching

Prompt caching reduces costs and latency by caching parts of your prompts.

### Cacheable System Prompts

```rust
use integrations_anthropic::services::beta::{CacheableSystemPromptBuilder, cacheable_system_prompt};

// Method 1: Using the builder
let system = CacheableSystemPromptBuilder::new(
    "You are an expert assistant with extensive knowledge..."
)
.with_cache()
.build_as_system_prompt();

// Method 2: Using the convenience function
let system = cacheable_system_prompt(
    "You are an expert assistant...",
    true // enable caching
);

let request = CreateMessageRequest::new("claude-3-5-sonnet-20241022", 1024, messages)
    .with_system_blocks(match system {
        SystemPrompt::Blocks(blocks) => blocks,
        SystemPrompt::Text(text) => vec![ContentBlock::Text {
            text,
            cache_control: None,
        }],
    });
```

### Caching Content Blocks

```rust
use integrations_anthropic::services::beta::CacheableContent;

let text_block = ContentBlock::Text {
    text: "Important context...".to_string(),
    cache_control: None,
};

// Add cache control
let cached_block = text_block.with_cache_control();
```

### Caching Last N Blocks

```rust
use integrations_anthropic::services::beta::cache_last_n_blocks;

let mut blocks = vec![
    ContentBlock::Text { text: "Context 1".to_string(), cache_control: None },
    ContentBlock::Text { text: "Context 2".to_string(), cache_control: None },
    ContentBlock::Text { text: "Context 3".to_string(), cache_control: None },
];

// Cache the last 2 blocks
let blocks = cache_last_n_blocks(blocks, 2);
```

### Caching Tools

```rust
use integrations_anthropic::services::beta::cache_tools;
use integrations_anthropic::services::messages::Tool;

let tools = vec![
    Tool::new("tool1", "Description", serde_json::json!({})),
    Tool::new("tool2", "Description", serde_json::json!({})),
];

// Cache all tools
let cached_tools = cache_tools(tools);

let request = CreateMessageRequest::new("claude-3-5-sonnet-20241022", 1024, messages)
    .with_tools(cached_tools);
```

## Token Counting

Token counting allows you to count tokens before sending requests to optimize costs.

### Creating a Token Counting Service

```rust
use integrations_anthropic::services::beta::{TokenCountingService, TokenCountingServiceImpl, TokenCountRequest};
use std::sync::Arc;

// Initialize service with transport, auth, and resilience
let service = TokenCountingServiceImpl::new(
    Arc::new(transport),
    Arc::new(auth_manager),
    Arc::new(resilience),
);

// Create request
let messages = vec![MessageParam::user("Hello, how are you?")];
let request = TokenCountRequest::new("claude-3-5-sonnet-20241022", messages)
    .with_system("You are a helpful assistant");

// Count tokens
let response = service.count_tokens(request).await?;
println!("Input tokens: {}", response.input_tokens);
```

### Token Count Request Builder

```rust
use integrations_anthropic::services::beta::TokenCountRequest;

let request = TokenCountRequest::new("claude-3-5-sonnet-20241022", messages)
    .with_system("System prompt")
    .with_tools(tools);
```

## Computer Use

Computer use allows Claude to interact with computers through screenshots, mouse/keyboard control, and shell commands.

### Creating Computer Use Tools

```rust
use integrations_anthropic::services::beta::create_computer_use_tools;

// Create standard computer use tools
let tools = create_computer_use_tools(1920, 1080); // screen dimensions

// This creates three tools:
// 1. Computer (mouse/keyboard control and screenshots)
// 2. Text editor (file editing)
// 3. Bash (shell commands)

let request = CreateMessageRequest::new("claude-3-5-sonnet-20241022", 1024, messages)
    .with_tools(tools.into_iter().map(|t| /* convert to Tool */).collect());
```

### Building Tool Results

```rust
use integrations_anthropic::services::beta::ComputerToolResultBuilder;

// Text result
let result = ComputerToolResultBuilder::new("tool_use_123")
    .with_text("Command executed successfully")
    .build();

// Screenshot result
let result = ComputerToolResultBuilder::new("tool_use_456")
    .with_screenshot("iVBORw0KGgoAAAANS...") // base64 PNG
    .build();

// Combined result with text and screenshot
let result = ComputerToolResultBuilder::new("tool_use_789")
    .with_text("Screenshot taken")
    .with_screenshot("iVBORw0KGgoAAAANS...")
    .build();

// Error result
let result = ComputerToolResultBuilder::new("tool_use_999")
    .with_text("Command failed: file not found")
    .with_error()
    .build();
```

### Convenience Functions

```rust
use integrations_anthropic::services::beta::{
    create_text_result,
    create_screenshot_result,
    create_error_result,
};

// Simple text result
let result = create_text_result("tool_use_1", "Success");

// Screenshot result
let result = create_screenshot_result("tool_use_2", "base64_png_data");

// Error result
let result = create_error_result("tool_use_3", "Error message");
```

### Validating Screen Dimensions

```rust
use integrations_anthropic::services::beta::validate_screen_dimensions;

if validate_screen_dimensions(1920, 1080) {
    let tools = create_computer_use_tools(1920, 1080);
}
```

## Combining Features

You can combine multiple beta features in a single request.

### Extended Thinking + PDF + Caching

```rust
use integrations_anthropic::services::beta::*;

// Load PDF
let pdf_bytes = fs::read("document.pdf")?;
let pdf_content = create_cacheable_pdf_content(&pdf_bytes);

// Create cacheable system prompt
let system = cacheable_system_prompt(
    "You are an expert document analyzer.",
    true
);

// Create message with cached content
let messages = vec![MessageParam::user_blocks(vec![
    ContentBlock::Text {
        text: "Analyze this document:".to_string(),
        cache_control: None,
    },
    pdf_content,
])];

// Build request with extended thinking
let request = CreateMessageRequest::new("claude-3-5-sonnet-20241022", 4096, messages)
    .with_system_blocks(match system {
        SystemPrompt::Blocks(blocks) => blocks,
        SystemPrompt::Text(text) => vec![ContentBlock::Text {
            text,
            cache_control: None,
        }],
    })
    .with_extended_thinking(Some(10000));
```

### Token Counting Before Sending

```rust
// Count tokens first
let count_request = TokenCountRequest::new("claude-3-5-sonnet-20241022", messages.clone())
    .with_system("System prompt");

let token_count = token_counting_service.count_tokens(count_request).await?;
println!("This request will use {} input tokens", token_count.input_tokens);

// Then send the actual request
let request = CreateMessageRequest::new("claude-3-5-sonnet-20241022", 1024, messages);
let response = messages_service.create_message(request).await?;
```

## Beta Headers

Each beta feature requires a specific API header. The library handles these automatically, but you can access them:

```rust
use integrations_anthropic::services::beta::*;

println!("Extended Thinking: {}", get_extended_thinking_beta_header());
println!("PDF Support: {}", get_pdf_support_beta_header());
println!("Prompt Caching: {}", get_prompt_caching_beta_header());
println!("Token Counting: {}", get_token_counting_beta_header());
println!("Computer Use: {}", get_computer_use_beta_header());
```

## Error Handling

All beta features return `AnthropicResult<T>` which can contain various errors:

```rust
use integrations_anthropic::errors::AnthropicError;

match token_counting_service.count_tokens(request).await {
    Ok(response) => println!("Tokens: {}", response.input_tokens),
    Err(AnthropicError::RateLimitError { .. }) => {
        // Handle rate limit
    },
    Err(AnthropicError::ValidationError(msg)) => {
        // Handle validation error
    },
    Err(e) => {
        // Handle other errors
        eprintln!("Error: {}", e);
    }
}
```

## Best Practices

1. **Caching**: Use prompt caching for repeated requests with the same context to reduce costs
2. **Token Counting**: Count tokens before large requests to estimate costs
3. **Extended Thinking**: Use appropriate token budgets (3000-10000) for complex reasoning tasks
4. **PDF Support**: Validate PDFs before sending to catch errors early
5. **Computer Use**: Always validate screen dimensions and handle tool errors gracefully
6. **Feature Combinations**: Combine features strategically (e.g., cache PDFs that will be analyzed multiple times)

## Testing

The beta module includes comprehensive tests. Run them with:

```bash
cargo test --features beta
```

For specific beta feature tests:

```bash
cargo test --features beta services::beta::tests
```
