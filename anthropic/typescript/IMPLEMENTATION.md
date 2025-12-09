# Anthropic TypeScript SDK - Messages Service Implementation

## Overview

This document describes the complete implementation of the Messages Service for the Anthropic TypeScript integration. The implementation follows London-School TDD patterns with comprehensive mocking and testing.

## Project Structure

```
/workspaces/integrations/anthropic/typescript/src/
├── __mocks__/                      # Mock implementations for testing
│   ├── auth-manager.mock.ts        # AuthManager mocks
│   ├── http-transport.mock.ts      # HttpTransport mocks
│   ├── resilience.mock.ts          # ResilienceOrchestrator mocks
│   └── index.ts                    # Mock re-exports
├── auth/                           # Authentication layer
│   ├── auth-manager.ts             # API key authentication
│   └── index.ts
├── config/                         # Configuration
│   ├── config.ts                   # SDK configuration types
│   └── index.ts
├── errors/                         # Error handling
│   ├── error.ts                    # Base error class
│   ├── categories.ts               # Specific error types
│   └── index.ts
├── resilience/                     # Retry and resilience logic
│   ├── orchestrator.ts             # Retry orchestration
│   └── index.ts
├── transport/                      # HTTP transport layer
│   ├── http-transport.ts           # Fetch-based HTTP client
│   └── index.ts
├── types/                          # Common types
│   ├── common.ts                   # Shared type definitions
│   └── index.ts
├── services/                       # API services
│   ├── messages/                   # Messages API
│   │   ├── __tests__/
│   │   │   └── service.test.ts    # Comprehensive test suite
│   │   ├── types.ts                # Message types and helpers
│   │   ├── validation.ts           # Request validation
│   │   ├── stream.ts               # Streaming implementation
│   │   ├── service.ts              # Messages service
│   │   └── index.ts                # Re-exports
│   └── index.ts                    # Service re-exports
└── index.ts                        # Main SDK entry point
```

## Implemented Files

### 1. Core Infrastructure

#### `/src/errors/error.ts`
Base error class for all Anthropic API errors with structured error information.

**Key Features:**
- Structured error handling with type, status, and retry information
- Support for retry-after headers
- JSON serialization
- Stack trace preservation

#### `/src/errors/categories.ts`
Specific error types for different failure scenarios.

**Error Types:**
- `ConfigurationError` - SDK misconfiguration
- `AuthenticationError` - Invalid API key (401)
- `ValidationError` - Invalid request parameters (400)
- `RateLimitError` - Rate limit exceeded (429)
- `NetworkError` - Network-level failures
- `ServerError` - API server errors (5xx)
- `NotFoundError` - Resource not found (404)
- `StreamError` - Streaming failures
- `OverloadedError` - API overloaded (529)
- `ContentTooLargeError` - Request too large (413)

#### `/src/auth/auth-manager.ts`
Handles API authentication and header generation.

**Key Features:**
- API key validation (sk-ant- prefix)
- Header generation with version and beta features
- Support for custom headers
- Streaming header support

#### `/src/transport/http-transport.ts`
Fetch-based HTTP transport layer.

**Key Features:**
- Standard and streaming request support
- Timeout handling with AbortController
- Error mapping from HTTP responses
- SSE (Server-Sent Events) stream reading
- Retry-after header extraction

#### `/src/resilience/orchestrator.ts`
Retry and resilience orchestration.

**Key Features:**
- Exponential backoff with jitter
- Configurable retry attempts
- Retry-after header support
- Retryable error detection

### 2. Messages Service

#### `/src/services/messages/types.ts`
Complete type definitions for the Messages API.

**Message Types:**
- `Message` - Complete API response
- `ContentBlock` - Text, Image, Tool Use, Tool Result, Document, Thinking
- `Tool` - Tool definition with input schema
- `CreateMessageRequest` - Message creation request
- `CountTokensRequest` - Token counting request
- `TokenCount` - Token count response
- `Usage` - Token usage information

**Helper Functions:**
- `createUserMessage()` - Create user message
- `createAssistantMessage()` - Create assistant message
- `createTextBlock()` - Create text content block
- `createToolUseBlock()` - Create tool use block
- `createToolResultBlock()` - Create tool result block
- `createImageBlock()` - Create image block
- `createDocumentBlock()` - Create document block

#### `/src/services/messages/validation.ts`
Comprehensive request validation.

**Validation Rules:**
- Required fields: model, max_tokens, messages
- max_tokens must be positive integer
- At least one message required
- First message must be from user
- No consecutive assistant messages
- Temperature range: 0-1
- top_p range: 0-1
- top_k must be non-negative integer
- Tool definitions validation
- Tool choice validation
- Thinking config validation

#### `/src/services/messages/stream.ts`
Streaming implementation for real-time responses.

**Key Features:**
- `MessageStream` - AsyncIterable stream of events
- `MessageStreamAccumulator` - Accumulates stream events
- Event types: message_start, content_block_start, content_block_delta, content_block_stop, message_delta, message_stop, ping, error
- Delta handling for text, JSON, and thinking
- Stream collection into complete Message
- Error handling in streams

**Stream Event Types:**
- `MessageStartEvent` - Initial message metadata
- `ContentBlockStartEvent` - Content block begins
- `ContentBlockDeltaEvent` - Incremental content update
- `ContentBlockStopEvent` - Content block complete
- `MessageDeltaEvent` - Message-level updates
- `MessageStopEvent` - Stream complete
- `PingEvent` - Keep-alive ping
- `ErrorEvent` - Stream error

#### `/src/services/messages/service.ts`
Main Messages Service implementation.

**Methods:**
- `create()` - Create a message with full response
- `createStream()` - Create a streaming message
- `countTokens()` - Count tokens in a request

**Features:**
- Request validation before API calls
- Retry orchestration through resilience layer
- Header management through auth manager
- Request options support (timeout, headers, signal)
- System messages support
- Tool use support
- Thinking mode support
- Metadata support

#### `/src/services/messages/index.ts`
Re-exports all messages-related types and functions.

### 3. Testing Infrastructure

#### `/src/__mocks__/http-transport.mock.ts`
Mock HTTP transport for testing.

**Mock Functions:**
- `createMockHttpTransport()` - Basic mock
- `createMockHttpTransportWithDefaults()` - Mock with defaults
- `mockHttpTransportError()` - Set error response
- `mockHttpTransportResponse()` - Set success response
- `mockHttpTransportStream()` - Set streaming response

#### `/src/__mocks__/auth-manager.mock.ts`
Mock authentication manager.

**Mock Functions:**
- `createMockAuthManager()` - Basic mock with default headers
- `mockAuthManagerValidationError()` - Set validation error
- `mockAuthManagerHeaders()` - Set custom headers

#### `/src/__mocks__/resilience.mock.ts`
Mock resilience orchestrator.

**Mock Functions:**
- `createMockResilienceOrchestrator()` - Basic mock (passes through)
- `createMockResilienceOrchestratorWithDefaults()` - Mock with defaults
- `mockResilienceOrchestratorError()` - Set error
- `mockResilienceOrchestratorResponse()` - Set response

#### `/src/services/messages/__tests__/service.test.ts`
Comprehensive test suite (570 lines).

**Test Coverage:**

**create() method:**
- ✓ Successful message creation
- ✓ Request options passing (timeout, headers, signal)
- ✓ Validation errors (missing model, max_tokens, messages)
- ✓ Invalid parameters (temperature, top_p, top_k)
- ✓ Message alternation validation
- ✓ First message must be from user
- ✓ No consecutive assistant messages
- ✓ API error handling through resilience
- ✓ System messages support
- ✓ Tools support
- ✓ Thinking config support
- ✓ Metadata support

**createStream() method:**
- ✓ Successful stream creation
- ✓ Request options passing
- ✓ Validation errors
- ✓ Stream iteration
- ✓ Stream collection into Message
- ✓ Event parsing (message_start, content_block_delta, etc.)

**countTokens() method:**
- ✓ Successful token counting
- ✓ Request options passing
- ✓ Validation errors
- ✓ System messages support
- ✓ Tools support in counting
- ✓ API error handling

## Design Patterns

### London-School TDD
- All dependencies are mocked at boundaries
- Tests focus on behavior, not implementation
- Each component tested in isolation
- Mock verification ensures correct interactions

### Dependency Injection
- Services receive dependencies through constructor
- No direct instantiation of dependencies
- Easy to swap implementations
- Simplifies testing

### Error Handling
- Structured error hierarchy
- Specific error types for different scenarios
- Retryable vs non-retryable errors
- Error details preservation

### Resilience
- Automatic retry with exponential backoff
- Respect for retry-after headers
- Circuit breaker pattern (in orchestrator)
- Configurable retry behavior

## Usage Examples

### Basic Message Creation

```typescript
import { createMessagesService } from '@anthropic/sdk';

const service = createMessagesService(transport, auth, resilience);

const message = await service.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [
    { role: 'user', content: 'Hello, Claude!' }
  ]
});

console.log(message.content[0].text);
```

### Streaming Messages

```typescript
const stream = await service.createStream({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [
    { role: 'user', content: 'Tell me a story' }
  ]
});

for await (const event of stream) {
  if (event.type === 'content_block_delta') {
    process.stdout.write(event.delta.text || '');
  }
}
```

### Tool Use

```typescript
const message = await service.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [
    { role: 'user', content: 'What is the weather in San Francisco?' }
  ],
  tools: [
    {
      name: 'get_weather',
      description: 'Get current weather for a location',
      input_schema: {
        type: 'object',
        properties: {
          location: { type: 'string' }
        },
        required: ['location']
      }
    }
  ]
});
```

### Token Counting

```typescript
const count = await service.countTokens({
  model: 'claude-3-5-sonnet-20241022',
  messages: [
    { role: 'user', content: 'How many tokens is this?' }
  ]
});

console.log(`Input tokens: ${count.input_tokens}`);
```

## Testing

Run the comprehensive test suite:

```bash
npm test                  # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
```

## Type Safety

The implementation provides full TypeScript type safety:
- All API types match Anthropic's specification
- Helper functions ensure correct structure
- Validation catches errors before API calls
- Generic types for extensibility

## Performance Considerations

- Streaming support for long responses
- Configurable timeouts
- Retry with exponential backoff
- Request cancellation via AbortSignal
- Efficient SSE parsing

## Future Enhancements

Potential additions:
- Batch API support
- Vision API support
- Message editing
- Conversation management
- Rate limit tracking
- Request/response hooks
- Middleware system

## License

MIT
