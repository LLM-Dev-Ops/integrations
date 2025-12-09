# Beta Features Module

This module implements all beta features for the Anthropic API following the SPARC specification.

## Module Structure

```
beta/
├── mod.rs                   # Module exports and organization
├── types.rs                 # Shared type definitions (234 lines)
├── extended_thinking.rs     # Extended thinking support (169 lines)
├── pdf_support.rs          # PDF document support (209 lines)
├── prompt_caching.rs       # Prompt caching utilities (318 lines)
├── token_counting.rs       # Token counting service (196 lines)
├── computer_use.rs         # Computer use tools (336 lines)
└── tests.rs                # Comprehensive integration tests (390 lines)

Total: 1,877 lines of production-ready code
```

## Features

### Extended Thinking
- Extension trait for `CreateMessageRequest`
- Utilities to extract and analyze thinking blocks
- Support for token budget configuration
- Beta header: `extended-thinking-2024-12-01`

### PDF Support
- Create PDF content blocks from bytes or base64
- PDF validation (magic byte checking)
- Cacheable PDF support
- Extract PDF blocks from responses
- Beta header: `pdfs-2024-09-25`

### Prompt Caching
- `CacheableContent` trait for adding cache control
- `CacheableSystemPromptBuilder` for cacheable system prompts
- Utilities to cache last N blocks
- Tool caching support
- Beta header: `prompt-caching-2024-07-31`

### Token Counting
- Async `TokenCountingService` trait
- Full service implementation with resilience
- Request builder pattern
- Beta header: `token-counting-2024-11-01`

### Computer Use
- Standard computer use tools (computer, text editor, bash)
- `ComputerToolResultBuilder` for constructing results
- Screenshot support with base64 encoding
- Error handling for tool results
- Screen dimension validation
- Beta header: `computer-use-2024-10-22`

## Type Definitions

### Core Types
- `TokenCountRequest` / `TokenCountResponse`
- `ComputerTool` / `ComputerToolType` / `ComputerToolResult`
- `SystemPromptWithCache` / `CacheUsage`
- `ComputerImageSource` / `ComputerToolResultContent`

## Testing

The module includes comprehensive tests covering:
- Individual feature functionality
- Integration between multiple features
- Edge cases and error conditions
- Serialization/deserialization
- Builder patterns
- Beta header values

Run tests with:
```bash
cargo test --features beta
```

## Usage

Enable the beta feature in your `Cargo.toml`:

```toml
[dependencies]
integrations-anthropic = { version = "0.1", features = ["beta"] }
```

See [BETA_FEATURES.md](../../../BETA_FEATURES.md) for detailed usage examples.

## Re-exports

All public types and functions are re-exported at the crate root when the `beta` feature is enabled:

```rust
use integrations_anthropic::{
    // Types
    TokenCountRequest, TokenCountResponse, ComputerTool,
    // Extended Thinking
    ExtendedThinkingExt, extract_thinking_blocks,
    // PDF Support
    create_pdf_content, validate_pdf_bytes,
    // Prompt Caching
    CacheableContent, cacheable_system_prompt,
    // Token Counting
    TokenCountingService,
    // Computer Use
    create_computer_use_tools, ComputerToolResultBuilder,
};
```

## SPARC Compliance

This implementation follows the SPARC specification:
- **Specification**: All features match Anthropic's beta API specification
- **Pseudocode**: Clear, well-documented function signatures
- **Architecture**: Modular design with separation of concerns
- **Refinement**: Comprehensive tests and error handling
- **Completion**: Production-ready code with full documentation

## Dependencies

- `async-trait`: Async trait support for services
- `base64`: PDF and image encoding/decoding
- `http`: HTTP method and header types
- `serde`: Serialization/deserialization
- `serde_json`: JSON handling

All dependencies are already included in the main Cargo.toml.
