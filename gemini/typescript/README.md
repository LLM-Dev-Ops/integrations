# @integrations/gemini (TypeScript)

[![npm version](https://img.shields.io/npm/v/@integrations/gemini.svg)](https://www.npmjs.com/package/@integrations/gemini)
[![License](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/workflow/status/integrations/gemini/CI)](https://github.com/integrations/gemini/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)

Production-ready TypeScript client for the Google Gemini (Generative AI) API.

## Features

- **Full API Coverage** - Complete support for Models, Content Generation, Embeddings, Files, and Cached Content
- **Streaming Support** - Native async iterables for streaming responses with `for await...of`
- **Dual Authentication** - Flexible authentication via headers or query parameters
- **Resilience Patterns** - Built-in retry logic, circuit breaker, and rate limiting
- **Type Safety** - Full TypeScript support with strict types and comprehensive type guards
- **Module Support** - Works with both ESM and CommonJS projects
- **Zero Dependencies** - Minimal footprint with no runtime dependencies
- **Production Ready** - Battle-tested error handling, validation, and safety checks

## Installation

```bash
# npm
npm install @integrations/gemini

# yarn
yarn add @integrations/gemini

# pnpm
pnpm add @integrations/gemini
```

## Quick Start

### Create Client from Environment

Set the `GEMINI_API_KEY` or `GOOGLE_API_KEY` environment variable:

```bash
export GEMINI_API_KEY="your-api-key-here"
```

Then create the client:

```typescript
import { createClientFromEnv } from '@integrations/gemini';

const client = createClientFromEnv();

const response = await client.content.generate('gemini-2.0-flash', {
  contents: [{ parts: [{ text: 'Explain quantum computing in simple terms' }] }],
});

console.log(response.candidates[0].content.parts[0].text);
```

### Create Client with Configuration

```typescript
import { createClient } from '@integrations/gemini';

const client = createClient({
  apiKey: 'your-api-key',
  timeout: 30000,
  maxRetries: 3,
  retryConfig: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 60000,
    multiplier: 2.0,
    jitter: 0.25,
  },
  rateLimitConfig: {
    requestsPerMinute: 60,
    tokensPerMinute: 1_000_000,
  },
});
```

### Basic Content Generation

```typescript
const response = await client.content.generate('gemini-2.0-flash', {
  contents: [
    {
      role: 'user',
      parts: [{ text: 'Write a haiku about TypeScript' }],
    },
  ],
  generationConfig: {
    temperature: 0.9,
    topK: 40,
    topP: 0.95,
    maxOutputTokens: 1024,
  },
});

console.log(response.candidates[0].content.parts[0].text);
```

## Streaming Responses

Use async iterators to stream responses in real-time:

```typescript
const stream = client.content.generateStream('gemini-2.0-flash', {
  contents: [{ parts: [{ text: 'Write a long story about a robot' }] }],
});

for await (const chunk of stream) {
  const text = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
  if (text) {
    process.stdout.write(text);
  }
}
```

## Safety Settings

Configure content safety filters:

```typescript
import { createClient } from '@integrations/gemini';

const client = createClient({ apiKey: 'your-api-key' });

const response = await client.content.generate('gemini-2.0-flash', {
  contents: [{ parts: [{ text: 'Tell me about safety on the internet' }] }],
  safetySettings: [
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    },
  ],
});
```

Check for safety blocks in responses:

```typescript
import { checkSafetyBlocks, hasSafetyConcerns } from '@integrations/gemini';

try {
  const response = await client.content.generate('gemini-2.0-flash', {
    contents: [{ parts: [{ text: 'Your prompt here' }] }],
  });

  // The client automatically checks for safety blocks
  console.log(response.candidates[0].content.parts[0].text);
} catch (error) {
  if (error.type === 'content_error') {
    console.error('Content was blocked due to safety concerns');
  }
}
```

## File Upload

Upload files for multimodal content generation:

```typescript
import { readFileSync } from 'fs';

// Upload a file
const fileData = readFileSync('./image.jpg');
const uploadedFile = await client.files.upload({
  fileData,
  mimeType: 'image/jpeg',
  displayName: 'My Image',
});

// Wait for processing to complete
const activeFile = await client.files.waitForActive(uploadedFile.name);

// Use the file in content generation
const response = await client.content.generate('gemini-2.0-flash', {
  contents: [
    {
      parts: [
        { text: 'Describe this image in detail' },
        { fileData: { mimeType: activeFile.mimeType, fileUri: activeFile.uri } },
      ],
    },
  ],
});

// Clean up
await client.files.delete(uploadedFile.name);
```

## Cached Content

Use context caching for improved performance and reduced costs:

```typescript
// Create cached content
const cachedContent = await client.cachedContent.create({
  model: 'gemini-2.0-flash',
  contents: [
    {
      role: 'user',
      parts: [{ text: 'Large context document goes here...' }],
    },
  ],
  ttl: '3600s', // Cache for 1 hour
});

// Use cached content in generation
const response = await client.content.generate('gemini-2.0-flash', {
  contents: [{ parts: [{ text: 'Question about the cached content' }] }],
  cachedContent: cachedContent.name,
});

// Update TTL
await client.cachedContent.update(cachedContent.name, {
  ttl: '7200s', // Extend to 2 hours
});

// Clean up
await client.cachedContent.delete(cachedContent.name);
```

## Embeddings

Generate embeddings for text content:

```typescript
// Single embedding
const embedding = await client.embeddings.embed('text-embedding-004', {
  content: { parts: [{ text: 'Hello, world!' }] },
  taskType: 'RETRIEVAL_DOCUMENT',
});

console.log(embedding.values); // Array of numbers

// Batch embeddings
const batchResult = await client.embeddings.batchEmbed('text-embedding-004', {
  requests: [
    {
      content: { parts: [{ text: 'First document' }] },
      taskType: 'RETRIEVAL_DOCUMENT',
    },
    {
      content: { parts: [{ text: 'Second document' }] },
      taskType: 'RETRIEVAL_DOCUMENT',
    },
  ],
});

batchResult.embeddings.forEach((embedding, index) => {
  console.log(`Embedding ${index}:`, embedding.values.length, 'dimensions');
});
```

## Token Counting

Count tokens before making API calls:

```typescript
const tokenCount = await client.content.countTokens('gemini-2.0-flash', {
  contents: [{ parts: [{ text: 'How many tokens is this?' }] }],
});

console.log(`Total tokens: ${tokenCount.totalTokens}`);
```

## Error Handling

The client provides detailed error types for robust error handling:

```typescript
import {
  GeminiError,
  ValidationError,
  TooManyRequestsError,
  TimeoutError,
  SafetyBlockedError,
  FileNotFoundError,
} from '@integrations/gemini';

try {
  const response = await client.content.generate('gemini-2.0-flash', {
    contents: [{ parts: [{ text: 'Hello!' }] }],
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid request:', error.message);
  } else if (error instanceof TooManyRequestsError) {
    console.error('Rate limited. Retry after:', error.retryAfter);
  } else if (error instanceof TimeoutError) {
    console.error('Request timed out');
  } else if (error instanceof SafetyBlockedError) {
    console.error('Content blocked by safety filters');
  } else if (error instanceof GeminiError) {
    console.error('Gemini API error:', error.type, error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Error Types

The client provides comprehensive error types:

- **Configuration Errors**: `MissingApiKeyError`, `InvalidBaseUrlError`, `InvalidConfigurationError`
- **Authentication Errors**: `InvalidApiKeyError`, `ExpiredApiKeyError`, `AuthQuotaExceededError`
- **Request Errors**: `ValidationError`, `InvalidModelError`, `InvalidParameterError`, `PayloadTooLargeError`
- **Rate Limit Errors**: `TooManyRequestsError`, `TokenLimitExceededError`, `QuotaExceededError`
- **Network Errors**: `ConnectionError`, `TimeoutError`, `DnsResolutionError`, `TlsError`
- **Server Errors**: `InternalServerError`, `ServiceUnavailableError`, `ModelOverloadedError`
- **Response Errors**: `DeserializationError`, `UnexpectedFormatError`, `StreamInterruptedError`
- **Content Errors**: `SafetyBlockedError`, `RecitationBlockedError`, `ProhibitedContentError`
- **Resource Errors**: `FileNotFoundError`, `FileProcessingError`, `CachedContentNotFoundError`, `ModelNotFoundError`

## Configuration Options

### GeminiConfig

```typescript
interface GeminiConfig {
  // Required
  apiKey: string;

  // API Configuration
  baseUrl?: string;              // Default: 'https://generativelanguage.googleapis.com'
  apiVersion?: string;           // Default: 'v1beta'
  timeout?: number;              // Default: 120000 (120 seconds)
  connectTimeout?: number;       // Default: 30000 (30 seconds)
  maxRetries?: number;           // Default: 3

  // Retry Configuration
  retryConfig?: {
    maxAttempts: number;         // Default: 3
    initialDelay: number;        // Default: 1000 ms
    maxDelay: number;            // Default: 60000 ms
    multiplier: number;          // Default: 2.0
    jitter: number;              // Default: 0.25
  };

  // Circuit Breaker Configuration
  circuitBreakerConfig?: {
    failureThreshold: number;    // Default: 5
    successThreshold: number;    // Default: 3
    openDuration: number;        // Default: 30000 ms
    halfOpenMaxRequests: number; // Default: 1
  };

  // Rate Limiting Configuration
  rateLimitConfig?: {
    requestsPerMinute: number;   // Default: 60
    tokensPerMinute?: number;    // Default: 1000000
  };

  // Authentication
  authMethod?: 'header' | 'queryParam'; // Default: 'header'

  // Observability
  enableTracing?: boolean;       // Default: true
  enableMetrics?: boolean;       // Default: true
  logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'trace'; // Default: 'info'
}
```

## Environment Variables

The client automatically reads configuration from environment variables:

- `GEMINI_API_KEY` or `GOOGLE_API_KEY` - API key (required)
- `GEMINI_BASE_URL` - Custom base URL
- `GEMINI_API_VERSION` - API version
- `GEMINI_TIMEOUT` - Request timeout in milliseconds
- `GEMINI_MAX_RETRIES` - Maximum retry attempts
- `GEMINI_LOG_LEVEL` - Log level

Example `.env` file:

```bash
GEMINI_API_KEY=your-api-key-here
GEMINI_TIMEOUT=60000
GEMINI_MAX_RETRIES=5
GEMINI_LOG_LEVEL=debug
```

## API Reference

### Client

```typescript
interface GeminiClient {
  content: ContentService;
  embeddings: EmbeddingsService;
  models: ModelsService;
  files: FilesService;
  cachedContent: CachedContentService;
}
```

### Content Service

```typescript
interface ContentService {
  generate(model: string, request: GenerateContentRequest): Promise<GenerateContentResponse>;
  generateStream(model: string, request: GenerateContentRequest): AsyncIterable<GenerateContentResponse>;
  countTokens(model: string, request: CountTokensRequest): Promise<CountTokensResponse>;
}
```

### Embeddings Service

```typescript
interface EmbeddingsService {
  embed(model: string, request: EmbedContentRequest): Promise<Embedding>;
  batchEmbed(model: string, request: { requests: EmbedContentRequest[] }): Promise<BatchEmbedContentsResponse>;
}
```

### Models Service

```typescript
interface ModelsService {
  list(params?: ListModelsParams): Promise<ListModelsResponse>;
  get(modelName: string): Promise<Model>;
}
```

### Files Service

```typescript
interface FilesService {
  upload(request: UploadFileRequest): Promise<GeminiFile>;
  list(params?: ListFilesParams): Promise<ListFilesResponse>;
  get(fileName: string): Promise<GeminiFile>;
  delete(fileName: string): Promise<void>;
  waitForActive(fileName: string, timeout?: number, pollInterval?: number): Promise<GeminiFile>;
}
```

### Cached Content Service

```typescript
interface CachedContentService {
  create(request: CreateCachedContentRequest): Promise<CachedContent>;
  list(params?: ListCachedContentsParams): Promise<ListCachedContentsResponse>;
  get(name: string): Promise<CachedContent>;
  update(name: string, request: UpdateCachedContentRequest): Promise<CachedContent>;
  delete(name: string): Promise<void>;
}
```

## Advanced Usage

### Custom Retry Logic

```typescript
const client = createClient({
  apiKey: 'your-api-key',
  retryConfig: {
    maxAttempts: 5,
    initialDelay: 2000,
    maxDelay: 120000,
    multiplier: 3.0,
    jitter: 0.5,
  },
});
```

### Circuit Breaker Pattern

Protect your application from cascading failures:

```typescript
const client = createClient({
  apiKey: 'your-api-key',
  circuitBreakerConfig: {
    failureThreshold: 10,     // Open circuit after 10 failures
    successThreshold: 5,      // Close after 5 successes
    openDuration: 60000,      // Stay open for 60 seconds
    halfOpenMaxRequests: 3,   // Allow 3 test requests when half-open
  },
});
```

### Rate Limiting

Configure client-side rate limiting:

```typescript
const client = createClient({
  apiKey: 'your-api-key',
  rateLimitConfig: {
    requestsPerMinute: 100,
    tokensPerMinute: 2_000_000,
  },
});
```

### Multi-turn Conversations

```typescript
const conversation = [
  {
    role: 'user' as const,
    parts: [{ text: 'Hello! Can you help me learn TypeScript?' }],
  },
];

// First turn
let response = await client.content.generate('gemini-2.0-flash', {
  contents: conversation,
});

conversation.push({
  role: 'model' as const,
  parts: [{ text: response.candidates[0].content.parts[0].text }],
});

// Second turn
conversation.push({
  role: 'user' as const,
  parts: [{ text: 'What are the main benefits?' }],
});

response = await client.content.generate('gemini-2.0-flash', {
  contents: conversation,
});
```

### Function Calling

```typescript
const response = await client.content.generate('gemini-2.0-flash', {
  contents: [{ parts: [{ text: 'What is the weather in San Francisco?' }] }],
  tools: [
    {
      functionDeclarations: [
        {
          name: 'get_weather',
          description: 'Get the current weather for a location',
          parameters: {
            type: 'object',
            properties: {
              location: { type: 'string', description: 'City name' },
              unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
            },
            required: ['location'],
          },
        },
      ],
    },
  ],
});

// Check if the model wants to call a function
const functionCall = response.candidates[0].content.parts.find(
  part => 'functionCall' in part
);

if (functionCall && 'functionCall' in functionCall) {
  console.log('Function:', functionCall.functionCall.name);
  console.log('Arguments:', functionCall.functionCall.args);
}
```

## Testing

The library includes testing utilities for mocking:

```typescript
import { MockHttpClient, createMockFetch } from '@integrations/gemini';

// Create a mock client
const mockFetch = createMockFetch({
  '/models/gemini-2.0-flash:generateContent': {
    status: 200,
    body: {
      candidates: [
        {
          content: { parts: [{ text: 'Mocked response' }] },
          finishReason: 'STOP',
        },
      ],
    },
  },
});

const httpClient = new MockHttpClient(mockFetch);
// Use httpClient in tests
```

## TypeScript Support

The library is written in TypeScript and provides comprehensive type definitions:

```typescript
import type {
  GenerateContentRequest,
  GenerateContentResponse,
  Content,
  Part,
  SafetySetting,
  GenerationConfig,
} from '@integrations/gemini';
```

Type guards are available for runtime type checking:

```typescript
import { isTextPart, isFileDataPart, isFunctionCallPart } from '@integrations/gemini';

const part: Part = /* ... */;

if (isTextPart(part)) {
  console.log(part.text);
} else if (isFileDataPart(part)) {
  console.log(part.fileData.fileUri);
} else if (isFunctionCallPart(part)) {
  console.log(part.functionCall.name);
}
```

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.3.0 (for TypeScript projects)

## License

This project is dual-licensed under:

- MIT License
- Apache License 2.0

You may choose either license for your use.

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.

## Support

- Documentation: [https://github.com/integrations/gemini](https://github.com/integrations/gemini)
- Issues: [https://github.com/integrations/gemini/issues](https://github.com/integrations/gemini/issues)
- API Reference: [Google Gemini API Documentation](https://ai.google.dev/docs)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

Made with ❤️ by the Integration Team
