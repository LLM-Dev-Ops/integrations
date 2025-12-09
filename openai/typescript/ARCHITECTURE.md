# OpenAI Integration Module - Architecture

This document describes the SPARC architecture implementation for the OpenAI Integration Module.

## Overview

The OpenAI Integration Module follows the SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) methodology and London-School TDD principles to provide a type-safe, maintainable TypeScript client for the OpenAI API.

## Architecture Layers

### 1. Client Layer (`src/client/`)

The client layer provides the main entry point and configuration management.

**Key Components:**
- `OpenAIClient` (interface): Main client interface exposing all services
- `OpenAIClientImpl`: Concrete implementation
- `createClient()`: Factory function for client creation
- `validateConfig()`: Configuration validation
- `normalizeConfig()`: Configuration normalization with defaults

**Responsibilities:**
- Client initialization and dependency injection
- Configuration management and validation
- Service composition

### 2. Transport Layer (`src/transport/`)

The transport layer handles HTTP communication with the OpenAI API.

**Key Components:**
- `HttpTransport` (interface): Abstract HTTP transport
- `FetchHttpTransport`: Fetch-based implementation
- `RequestBuilder`: Fluent API for building HTTP requests
- `ResponseParser`: Response parsing and validation
- `SSEStreamHandler`: Server-sent events streaming
- `MultipartFormBuilder`: Multipart form data construction

**Responsibilities:**
- HTTP request/response handling
- Streaming support
- Request building and response parsing
- Multipart form data for file uploads

### 3. Authentication Layer (`src/auth/`)

**Key Components:**
- `AuthManager` (interface): Authentication abstraction
- `BearerAuthManager`: Bearer token authentication
- `createAuthManager()`: Factory function

**Responsibilities:**
- API key management
- Authorization header generation
- Organization header injection

### 4. Resilience Layer (`src/resilience/`)

The resilience layer provides retry logic, hooks, and error handling.

**Key Components:**
- `ResilienceOrchestrator`: Coordinates resilience strategies
- `HookRegistry`: Manages lifecycle hooks
- `RequestHook`: Pre-request modification
- `ResponseHook`: Post-response modification
- `ErrorHook`: Error handling
- `RetryHook`: Retry strategy
- `DefaultRetryHook`: Exponential backoff implementation

**Responsibilities:**
- Retry logic with exponential backoff
- Request/response interceptors
- Error handling hooks
- Timeout management

### 5. Error Handling Layer (`src/errors/`)

**Key Components:**
- `OpenAIError`: Base error class
- `ErrorMapper`: Maps HTTP responses to error types
- Error categories:
  - `AuthenticationError` (401)
  - `PermissionDeniedError` (403)
  - `NotFoundError` (404)
  - `ConflictError` (409)
  - `UnprocessableEntityError` (422)
  - `RateLimitError` (429)
  - `InvalidRequestError` (400)
  - `InternalServerError` (500+)
  - `APIConnectionError` (network errors)
  - `TimeoutError` (timeout)

**Responsibilities:**
- Structured error types
- HTTP status to error mapping
- Error serialization

### 6. Service Layer (`src/services/`)

Each service encapsulates a specific OpenAI API domain.

#### Service Structure Pattern

Each service follows this structure:
```
service-name/
├── index.ts           # Public exports
├── types.ts           # Type definitions
├── service.ts         # Service implementation
├── validation.ts      # Request validation
└── [domain files]     # Domain-specific logic
```

#### Services

1. **Chat Completions** (`src/services/chat/`)
   - Interfaces: `ChatCompletionService`
   - Features: Streaming, function calling, tool use
   - Types: `ChatCompletionRequest`, `ChatCompletionResponse`, `ChatCompletionChunk`

2. **Embeddings** (`src/services/embeddings/`)
   - Interfaces: `EmbeddingsService`
   - Features: Text embeddings generation
   - Types: `EmbeddingRequest`, `EmbeddingResponse`

3. **Files** (`src/services/files/`)
   - Interfaces: `FilesService`
   - Features: File upload, retrieval, deletion
   - Types: `FileObject`, `FileCreateRequest`

4. **Models** (`src/services/models/`)
   - Interfaces: `ModelsService`
   - Features: Model listing and retrieval
   - Types: `ModelObject`, `ModelListResponse`

5. **Batches** (`src/services/batches/`)
   - Interfaces: `BatchesService`
   - Features: Batch API operations
   - Types: `BatchObject`, `BatchCreateRequest`

6. **Images** (`src/services/images/`)
   - Interfaces: `ImagesService`
   - Features: Image generation, editing, variations
   - Types: `ImageGenerateRequest`, `ImageResponse`

7. **Audio** (`src/services/audio/`)
   - Interfaces: `AudioService`
   - Features: Transcription, translation, speech synthesis
   - Types: `AudioTranscriptionRequest`, `SpeechRequest`

8. **Moderations** (`src/services/moderations/`)
   - Interfaces: `ModerationsService`
   - Features: Content moderation
   - Types: `ModerationRequest`, `ModerationResponse`

9. **Fine-tuning** (`src/services/fine-tuning/`)
   - Interfaces: `FineTuningService`
   - Features: Fine-tuning job management
   - Types: `FineTuningJob`, `FineTuningJobCreateRequest`

10. **Assistants** (`src/services/assistants/`)
    - Interfaces: `AssistantsService`
    - Features: Assistants, threads, messages, runs, vector stores
    - Sub-domains:
      - `threads.ts`: Thread management
      - `messages.ts`: Message operations
      - `runs.ts`: Run lifecycle
      - `vector-stores.ts`: Vector store operations

**Service Responsibilities:**
- API endpoint interaction
- Request validation
- Response parsing
- Domain-specific logic

### 7. Types Layer (`src/types/`)

Common type definitions used across the module.

**Key Types:**
- `OpenAIConfig`: Client configuration
- `RequestOptions`: Per-request options
- `PaginationParams`: Pagination parameters
- `HttpRequest`/`HttpResponse`: HTTP primitives
- `StreamChunk`: Streaming data

## Design Principles

### 1. Interface-Based Design (London-School TDD)

All major components are defined as interfaces:
```typescript
interface ChatCompletionService {
  create(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  stream(request: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk>;
}
```

This enables:
- Easy mocking for tests
- Dependency injection
- Multiple implementations
- Clear contracts

### 2. Dependency Injection

Services receive dependencies through constructors:
```typescript
class ChatCompletionServiceImpl implements ChatCompletionService {
  constructor(private readonly orchestrator: ResilienceOrchestrator) {}
}
```

### 3. Immutability

- Configuration objects are readonly
- Requests/responses are immutable
- No global state

### 4. Type Safety

- Strict TypeScript configuration
- No `any` types
- Comprehensive type definitions
- Null safety with strict checks

### 5. Error Handling

- Typed errors for each HTTP status
- Network error handling
- Validation errors
- Structured error responses

### 6. Streaming First

- AsyncIterable for streams
- Stream accumulator utilities
- Backpressure handling

## Data Flow

### Request Flow

```
Client Call
  ↓
Service Layer (validation)
  ↓
Request Builder
  ↓
Resilience Orchestrator (hooks, retry)
  ↓
HTTP Transport
  ↓
OpenAI API
```

### Response Flow

```
OpenAI API
  ↓
HTTP Transport
  ↓
Resilience Orchestrator (hooks)
  ↓
Response Parser
  ↓
Error Mapper (if error)
  ↓
Service Layer
  ↓
Client
```

## Testing Strategy

### Unit Tests
- Service layer: Mock `ResilienceOrchestrator`
- Transport layer: Mock fetch
- Error handling: Test all error types
- Validation: Test edge cases

### Integration Tests
- End-to-end with mock server (MSW)
- Streaming tests
- Retry behavior
- Error scenarios

### Example Test
```typescript
describe('ChatCompletionService', () => {
  it('should create completion', async () => {
    const mockOrchestrator: ResilienceOrchestrator = {
      request: vi.fn().mockResolvedValue({
        status: 200,
        data: { /* response */ }
      })
    };

    const service = new ChatCompletionServiceImpl(mockOrchestrator);
    const response = await service.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'Hello' }]
    });

    expect(response).toBeDefined();
  });
});
```

## Extension Points

### Custom Transport
Implement `HttpTransport` interface for custom HTTP clients.

### Custom Retry Strategy
Implement `RetryHook` interface for custom retry logic.

### Request/Response Hooks
Add hooks via `HookRegistry` for logging, metrics, etc.

### Custom Error Handling
Extend `OpenAIError` for custom error types.

## File Organization

```
src/
├── index.ts                    # Main exports
├── client/                     # Client layer
│   ├── index.ts
│   ├── client-impl.ts
│   ├── config.ts
│   └── factory.ts
├── transport/                  # Transport layer
│   ├── index.ts
│   ├── http-transport.ts
│   ├── request-builder.ts
│   ├── response-parser.ts
│   ├── stream-handler.ts
│   └── multipart.ts
├── auth/                       # Authentication layer
│   ├── index.ts
│   └── auth-manager.ts
├── resilience/                 # Resilience layer
│   ├── index.ts
│   ├── orchestrator.ts
│   └── hooks.ts
├── errors/                     # Error handling
│   ├── index.ts
│   ├── error.ts
│   ├── categories.ts
│   └── mapping.ts
├── types/                      # Common types
│   ├── index.ts
│   └── common.ts
└── services/                   # Service layer
    ├── index.ts
    ├── chat/
    ├── embeddings/
    ├── files/
    ├── models/
    ├── batches/
    ├── images/
    ├── audio/
    ├── moderations/
    ├── fine-tuning/
    └── assistants/
```

## Build and Distribution

- **Build Tool**: tsup (fast TypeScript bundler)
- **Output**: ESM modules
- **Type Definitions**: Generated .d.ts files
- **Source Maps**: Included for debugging
- **Tree Shaking**: Enabled for optimal bundle size

## Dependencies

- **Runtime**: None (uses native fetch)
- **Dev Dependencies**:
  - TypeScript 5.3+
  - Vitest (testing)
  - tsup (bundling)
  - eslint (linting)
  - prettier (formatting)
  - MSW (mock service worker for tests)

## Performance Considerations

- Lazy service initialization
- Stream processing for large responses
- Connection pooling (via fetch)
- Request deduplication (optional)
- Efficient JSON parsing
- Minimal dependencies
