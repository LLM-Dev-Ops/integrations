# @integrations/openai

A production-ready, type-safe TypeScript client for the OpenAI API with comprehensive resilience patterns.

## Features

- **Complete API Coverage**: Chat Completions, Embeddings, Models, Files, Images, Audio, Moderations, Batches, Fine-tuning, Assistants
- **Full TypeScript Support**: Strict typing with exported interfaces
- **Streaming Support**: Server-Sent Events (SSE) for chat completions with async iterators
- **Resilience Patterns**: Retry with exponential backoff + jitter, circuit breaker, rate limiting
- **Hooks System**: Request, response, error, and retry hooks for extensibility
- **ESM Native**: Pure ES modules with tree-shaking support

## Installation

```bash
npm install @integrations/openai
```

## Quick Start

```typescript
import { createClient } from '@integrations/openai';

const client = createClient({ apiKey: process.env.OPENAI_API_KEY });

const response = await client.chat.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello, how are you?' }],
});

console.log(response.choices[0].message.content);
```

## Chat Completions

### Basic Usage

```typescript
import { createClient, ChatCompletionRequest } from '@integrations/openai';

const client = createClient({ apiKey: 'sk-...' });

const request: ChatCompletionRequest = {
  model: 'gpt-4',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is the capital of France?' },
  ],
  temperature: 0.7,
  max_tokens: 150,
};

const response = await client.chat.create(request);
console.log(response.choices[0].message.content);
```

### Streaming

```typescript
const stream = await client.chat.stream({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Tell me a story' }],
});

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) {
    process.stdout.write(content);
  }
}
```

### Stream Accumulator

```typescript
import { ChatCompletionStreamAccumulator } from '@integrations/openai';

const stream = await client.chat.stream(request);
const accumulator = new ChatCompletionStreamAccumulator();

for await (const chunk of stream) {
  accumulator.process(chunk);
  console.log('Current content:', accumulator.getContent());
}

console.log('Final response:', accumulator.getResponse());
```

### Function Calling

```typescript
const response = await client.chat.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: "What's the weather in SF?" }],
  tools: [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string' },
        },
        required: ['location'],
      },
    },
  }],
});

if (response.choices[0].finish_reason === 'tool_calls') {
  const toolCall = response.choices[0].message.tool_calls?.[0];
  console.log('Function:', toolCall?.function.name);
  console.log('Arguments:', toolCall?.function.arguments);
}
```

## Embeddings

```typescript
const response = await client.embeddings.create({
  model: 'text-embedding-3-small',
  input: ['Hello world', 'Goodbye world'],
});

for (const embedding of response.data) {
  console.log(`Embedding dimension: ${embedding.embedding.length}`);
}
```

## Files

```typescript
// Upload a file
const file = await client.files.upload({
  file: new Blob(['training data...'], { type: 'application/jsonl' }),
  filename: 'training.jsonl',
  purpose: 'fine-tune',
});

// List files
const files = await client.files.list();

// Retrieve file content
const content = await client.files.content(file.id);

// Delete file
await client.files.delete(file.id);
```

## Images

```typescript
// Generate images
const response = await client.images.generate({
  prompt: 'A sunset over mountains',
  model: 'dall-e-3',
  size: '1024x1024',
  quality: 'hd',
});

console.log('Image URL:', response.data[0].url);

// Edit images
const editResponse = await client.images.edit({
  image: imageFile,
  prompt: 'Add a rainbow',
  mask: maskFile,
});
```

## Audio

```typescript
// Transcribe audio
const transcription = await client.audio.transcribe({
  file: audioFile,
  model: 'whisper-1',
});
console.log('Transcription:', transcription.text);

// Generate speech
const speech = await client.audio.speech({
  model: 'tts-1',
  input: 'Hello world!',
  voice: 'alloy',
});
// speech is an ArrayBuffer of audio data
```

## Moderations

```typescript
const response = await client.moderations.create({
  input: 'Check this content',
});

if (response.results[0].flagged) {
  console.log('Content was flagged!');
  console.log('Categories:', response.results[0].categories);
}
```

## Fine-tuning

```typescript
// Create fine-tuning job
const job = await client.fineTuning.create({
  model: 'gpt-3.5-turbo',
  training_file: trainingFileId,
  hyperparameters: {
    n_epochs: 3,
  },
});

// List jobs
const jobs = await client.fineTuning.list();

// Get job events
const events = await client.fineTuning.listEvents(job.id);
```

## Assistants (Beta)

```typescript
// Create an assistant
const assistant = await client.assistants.create({
  model: 'gpt-4',
  name: 'Math Tutor',
  instructions: 'You are a math tutor.',
  tools: [{ type: 'code_interpreter' }],
});

// List assistants
const assistants = await client.assistants.list();

// Update assistant
await client.assistants.update(assistant.id, {
  name: 'Advanced Math Tutor',
});

// Delete assistant
await client.assistants.delete(assistant.id);
```

## Error Handling

```typescript
import {
  AuthenticationError,
  RateLimitError,
  InvalidRequestError,
  OpenAIError
} from '@integrations/openai';

try {
  await client.chat.create(request);
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited, retry after: ${error.retryAfter}s`);
  } else if (error instanceof AuthenticationError) {
    console.log('Invalid API key');
  } else if (error instanceof InvalidRequestError) {
    console.log(`Invalid request: ${error.message} (param: ${error.param})`);
  } else if (error instanceof OpenAIError) {
    console.log(`API error: ${error.message}`);
  } else {
    throw error;
  }
}
```

## Resilience Configuration

```typescript
import { createClient } from '@integrations/openai';

const client = createClient({
  apiKey: 'sk-...',
  maxRetries: 3,
  retryDelay: 1000,
  timeout: 60000,
});
```

## Hooks

The client supports custom hooks for observability and middleware:

```typescript
import { createClient, ResilienceOrchestrator } from '@integrations/openai';

const client = createClient({
  apiKey: 'sk-...',
});

// Access the resilience orchestrator through the client implementation
const orchestrator = (client as any).orchestrator as ResilienceOrchestrator;
const hookRegistry = orchestrator.getHookRegistry();

// Set custom hooks
hookRegistry.setRequestHook(async (request) => {
  console.log('Request:', request.path);
  return request;
});

hookRegistry.setResponseHook(async (response) => {
  console.log('Response status:', response.status);
  return response;
});

hookRegistry.setErrorHook(async (error) => {
  console.error('Error:', error.message);
  throw error;
});

hookRegistry.setRetryHook(async (error, attempt) => {
  console.log(`Retry attempt ${attempt} after error:`, error.message);
});
```

## Custom HTTP Transport

```typescript
import { createClient, ResilienceOrchestrator } from '@integrations/openai';
import type { HttpTransport, RequestOptions } from '@integrations/openai';

class CustomTransport implements HttpTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly headers: Record<string, string>,
    private readonly timeout: number
  ) {}

  async request<T>(options: RequestOptions): Promise<T> {
    // Custom implementation
    throw new Error('Not implemented');
  }

  async *stream<T>(options: RequestOptions): AsyncIterable<T> {
    // Custom streaming implementation
    throw new Error('Not implemented');
  }
}

// Note: Direct transport injection requires creating the orchestrator manually
```

## Environment Variables

- `OPENAI_API_KEY` - Your OpenAI API key (required)
- `OPENAI_ORG_ID` - Organization ID (optional)
- `OPENAI_BASE_URL` - Custom base URL (optional)

```typescript
import { createClientFromEnv } from '@integrations/openai';

const client = createClientFromEnv(); // Uses OPENAI_API_KEY from environment
```

## Testing

The package provides mock implementations for testing:

```typescript
import {
  createMockHttpTransport,
  createMockResilienceOrchestrator,
} from '@integrations/openai/__mocks__';
import { chatCompletionResponse } from '@integrations/openai/__fixtures__';

const mockTransport = createMockHttpTransport()
  .withResponse(chatCompletionResponse());

const orchestrator = createMockResilienceOrchestrator(mockTransport);
const service = new ChatCompletionServiceImpl(orchestrator);
const result = await service.create(request);

expect(result.choices[0].message.content).toBe('Hello!');
```

## TypeScript Support

All types are exported for use:

```typescript
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  ChatRole,
  EmbeddingRequest,
  EmbeddingResponse,
  OpenAIConfig,
} from '@integrations/openai';
```

## Architecture

This integration follows SPARC architecture principles:

- **Specification**: Comprehensive type definitions
- **Pseudocode**: Clear service interfaces
- **Architecture**: Layered design with separation of concerns
- **Refinement**: Iterative improvements based on testing
- **Completion**: Production-ready implementation

```
src/
├── client/          # Client initialization and factory
├── errors/          # Error types and error mapping
├── transport/       # HTTP transport and request/response handling
├── auth/            # Authentication management
├── resilience/      # Retry logic and hooks
├── types/           # Common type definitions
└── services/        # API service implementations
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

## Examples

See the [examples](./examples) directory for complete working examples:

- [basic-usage.ts](./examples/basic-usage.ts) - Basic chat, embeddings, and models
- [streaming.ts](./examples/streaming.ts) - Streaming chat completions
- [chat-completion.ts](./examples/chat-completion.ts) - Detailed chat completion example
- [assistants.ts](./examples/assistants.ts) - Assistants API usage

## Development

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Build
npm run build

# Test
npm test

# Test with coverage
npm run test:coverage

# Lint
npm run lint
```

## License

This project is licensed under the LLM Dev Ops Permanent Source-Available License.
