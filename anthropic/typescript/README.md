# Anthropic TypeScript SDK

A production-ready TypeScript client for the Anthropic Claude API, following SPARC methodology and best practices.

## Features

- **Complete API Coverage**: Messages, Models, Batches, Admin APIs
- **Resilience Patterns**: Retry with exponential backoff, circuit breaker, rate limiting
- **Streaming Support**: Full SSE streaming for message responses
- **Beta Features**: Extended thinking, PDF support, prompt caching, computer use
- **Observability**: Structured logging and metrics
- **Type Safety**: Full TypeScript types with comprehensive interfaces
- **Secure Credential Handling**: Protected API key management
- **Modern ESM**: Native ES modules support

## Installation

```bash
npm install @integrations/anthropic
# or
yarn add @integrations/anthropic
# or
pnpm add @integrations/anthropic
```

## Quick Start

```typescript
import { createClient, createClientFromEnv } from '@integrations/anthropic';

// Create client from environment (ANTHROPIC_API_KEY)
const client = createClientFromEnv();

// Simple message
const response = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello, Claude!' }],
});

console.log('Response:', response.content[0].text);
console.log(`Usage: ${response.usage.input_tokens} input tokens, ${response.usage.output_tokens} output tokens`);
```

## Streaming

Stream responses in real-time using Server-Sent Events:

```typescript
import { createClientFromEnv } from '@integrations/anthropic';

const client = createClientFromEnv();

const stream = await client.messages.stream({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Tell me a story' }],
});

for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    process.stdout.write(event.delta.text);
  } else if (event.type === 'message_stop') {
    console.log('\n[Stream complete]');
    break;
  }
}
```

## Extended Thinking (Beta)

Enable extended thinking for complex reasoning tasks:

```typescript
import { createClient, AnthropicConfigBuilder } from '@integrations/anthropic';

const config = new AnthropicConfigBuilder()
  .withApiKey(process.env.ANTHROPIC_API_KEY!)
  .withBetaFeature('extended-thinking-2025-01-01')
  .build();

const client = createClient(config);

const response = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 16000,
  messages: [{
    role: 'user',
    content: 'Solve this complex problem: How can we optimize database queries in a distributed system?'
  }],
  thinking: {
    type: 'enabled',
    budget_tokens: 10000
  }
});

// Access thinking blocks
for (const block of response.content) {
  if (block.type === 'thinking') {
    console.log('Thinking process:', block.thinking);
  } else if (block.type === 'text') {
    console.log('Answer:', block.text);
  }
}
```

## Tool Use

Define and use tools for function calling:

```typescript
import { createClientFromEnv } from '@integrations/anthropic';

const client = createClientFromEnv();

// Define a weather tool
const weatherTool = {
  name: 'get_weather',
  description: 'Get the current weather for a location',
  input_schema: {
    type: 'object',
    properties: {
      location: {
        type: 'string',
        description: "City name, e.g., 'San Francisco, CA'"
      },
      unit: {
        type: 'string',
        enum: ['celsius', 'fahrenheit'],
        description: 'Temperature unit'
      }
    },
    required: ['location']
  }
};

const response = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [{ role: 'user', content: "What's the weather in San Francisco?" }],
  tools: [weatherTool]
});

// Handle tool use response
for (const block of response.content) {
  if (block.type === 'tool_use') {
    console.log('Tool called:', block.name);
    console.log('Input:', JSON.stringify(block.input, null, 2));

    // Execute your tool function here
    const toolResult = {
      temperature: 72,
      conditions: 'Partly cloudy'
    };

    // Send result back in next message
    const finalResponse = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: "What's the weather in San Francisco?" },
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(toolResult)
          }]
        }
      ]
    });

    console.log('Final response:', finalResponse.content[0].text);
  }
}
```

## Vision (Image Analysis)

Analyze images with vision models:

```typescript
import { createClientFromEnv } from '@integrations/anthropic';
import { readFileSync } from 'fs';

const client = createClientFromEnv();

// Read and encode image
const imageData = readFileSync('path/to/image.jpg');
const base64Image = imageData.toString('base64');

const response = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [{
    role: 'user',
    content: [
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: base64Image
        }
      },
      {
        type: 'text',
        text: "What's in this image?"
      }
    ]
  }]
});

console.log('Analysis:', response.content[0].text);
```

## PDF Analysis (Beta)

Analyze PDF documents:

```typescript
import { createClient, AnthropicConfigBuilder } from '@integrations/anthropic';
import { readFileSync } from 'fs';

const config = new AnthropicConfigBuilder()
  .withApiKey(process.env.ANTHROPIC_API_KEY!)
  .withBetaFeature('pdfs-2024-09-25')
  .build();

const client = createClient(config);

// Read and encode PDF
const pdfData = readFileSync('document.pdf');
const base64Pdf = pdfData.toString('base64');

const response = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 2048,
  messages: [{
    role: 'user',
    content: [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64Pdf
        }
      },
      {
        type: 'text',
        text: 'Summarize this document'
      }
    ]
  }]
});

console.log('Summary:', response.content[0].text);
```

## Prompt Caching (Beta)

Reduce costs and latency by caching large prompts:

```typescript
import { createClient, AnthropicConfigBuilder } from '@integrations/anthropic';

const config = new AnthropicConfigBuilder()
  .withApiKey(process.env.ANTHROPIC_API_KEY!)
  .withBetaFeature('prompt-caching-2024-07-31')
  .build();

const client = createClient(config);

// Large system prompt with caching
const largeContext = '...large document or context...';

const response = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  system: [{
    type: 'text',
    text: largeContext,
    cache_control: { type: 'ephemeral' }
  }],
  messages: [{ role: 'user', content: 'Question about the context' }]
});

// Check cache usage
if (response.usage.cache_read_input_tokens) {
  console.log('Cache read tokens:', response.usage.cache_read_input_tokens);
}
if (response.usage.cache_creation_input_tokens) {
  console.log('Cache creation tokens:', response.usage.cache_creation_input_tokens);
}
```

## Error Handling

The SDK provides comprehensive error types:

```typescript
import { createClientFromEnv, AnthropicError, RateLimitError, AuthenticationError } from '@integrations/anthropic';

const client = createClientFromEnv();

try {
  const response = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 1024,
    messages: [{ role: 'user', content: 'Hello!' }]
  });

  console.log('Success:', response.content[0].text);
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log('Rate limited! Retry after:', error.retryAfter);
    console.log('Message:', error.message);
  } else if (error instanceof AuthenticationError) {
    console.log('Authentication failed:', error.message);
    console.log('Check your ANTHROPIC_API_KEY');
  } else if (error instanceof AnthropicError) {
    console.log('API Error:', error.message);
    console.log('Status:', error.status);
  } else {
    console.log('Unknown error:', error);
  }
}
```

## Configuration

### Builder Pattern

```typescript
import { AnthropicConfigBuilder, createClient } from '@integrations/anthropic';

const config = new AnthropicConfigBuilder()
  .withApiKey('sk-ant-api03-...')
  .withBaseUrl('https://api.anthropic.com')
  .withTimeout(60000)
  .withMaxRetries(3)
  .withBetaFeature('extended-thinking-2025-01-01')
  .withBetaFeature('prompt-caching-2024-07-31')
  .build();

const client = createClient(config);
```

### Environment Variables

The SDK reads the following environment variables:

- `ANTHROPIC_API_KEY`: Your API key (required)
- `ANTHROPIC_BASE_URL`: Custom API base URL (optional)
- `ANTHROPIC_API_VERSION`: API version (optional, defaults to 2023-06-01)

```typescript
import { createClientFromEnv } from '@integrations/anthropic';

// Reads ANTHROPIC_API_KEY from environment
const client = createClientFromEnv();
```

## Batches API

Process multiple requests in a single batch:

```typescript
import { createClientFromEnv } from '@integrations/anthropic';

const client = createClientFromEnv();

const batch = await client.batches.create({
  requests: [
    {
      custom_id: 'request-1',
      params: {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }]
      }
    },
    {
      custom_id: 'request-2',
      params: {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hi' }]
      }
    }
  ]
});

console.log('Batch created:', batch.id);

// Poll for completion
while (true) {
  const status = await client.batches.retrieve(batch.id);

  if (status.processing_status === 'ended') {
    console.log('Batch complete!');

    // Get results
    const results = await client.batches.results(batch.id);
    for (const result of results.results) {
      console.log(`Request ${result.custom_id}:`, result.result);
    }
    break;
  }

  await new Promise(resolve => setTimeout(resolve, 5000));
}
```

## Models API

List available models:

```typescript
import { createClientFromEnv } from '@integrations/anthropic';

const client = createClientFromEnv();

const models = await client.models.list();

for (const model of models.data) {
  console.log('Model:', model.id);
  console.log('  Display name:', model.display_name);
  console.log('  Created:', model.created_at);
}
```

## Token Counting

Count tokens before making a request:

```typescript
import { createClientFromEnv } from '@integrations/anthropic';

const client = createClientFromEnv();

const count = await client.messages.countTokens({
  model: 'claude-3-5-sonnet-20241022',
  messages: [{ role: 'user', content: 'Hello, how are you?' }]
});

console.log('Input tokens:', count.input_tokens);
```

## Best Practices

### 1. Use Streaming for Long Responses

Streaming provides a better user experience for long-form content:

```typescript
const stream = await client.messages.stream(request);
for await (const event of stream) {
  // Process events incrementally
}
```

### 2. Implement Retry Logic

The SDK includes built-in retry with exponential backoff, but you can customize it:

```typescript
import { AnthropicConfigBuilder } from '@integrations/anthropic';

const config = new AnthropicConfigBuilder()
  .withMaxRetries(5)
  .withTimeout(120000)
  .build();
```

### 3. Handle Rate Limits

Always handle rate limit errors gracefully:

```typescript
import { RateLimitError } from '@integrations/anthropic';

try {
  const response = await client.messages.create(request);
} catch (error) {
  if (error instanceof RateLimitError && error.retryAfter) {
    await new Promise(resolve => setTimeout(resolve, error.retryAfter * 1000));
    // Retry request
  }
}
```

### 4. Use Prompt Caching for Large Contexts

When working with large documents or system prompts, use prompt caching to reduce costs:

```typescript
const response = await client.messages.create({
  system: [{
    type: 'text',
    text: largeDocument,
    cache_control: { type: 'ephemeral' }
  }],
  // ... rest of request
});
```

### 5. Secure API Key Handling

Never hardcode API keys. Use environment variables or secure configuration:

```typescript
// Good: From environment
const client = createClientFromEnv();

// Good: From secure config
import { AnthropicConfigBuilder } from '@integrations/anthropic';
const config = new AnthropicConfigBuilder()
  .withApiKey(readFromSecureStore())
  .build();

// Bad: Hardcoded (Don't do this!)
// const config = new AnthropicConfigBuilder()
//   .withApiKey('sk-ant-...')
//   .build();
```

## Testing

The SDK is designed to be easily testable with dependency injection:

```typescript
import { jest } from '@jest/globals';
import { AnthropicClient } from '@integrations/anthropic';

describe('MyService', () => {
  it('should create message', async () => {
    const mockClient: Partial<AnthropicClient> = {
      messages: {
        create: jest.fn().mockResolvedValue({
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello!' }],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 5 }
        })
      }
    };

    const service = new MyService(mockClient as AnthropicClient);
    const result = await service.chat('Hello');

    expect(result).toBe('Hello!');
  });
});
```

## Examples

See the `examples/` directory for complete, runnable examples:

- `basic-chat.ts` - Simple chat completion
- `streaming.ts` - Streaming responses
- `tool-use.ts` - Function calling with tools
- `extended-thinking.ts` - Extended thinking for complex reasoning
- `multi-turn.ts` - Multi-turn conversations
- `vision.ts` - Image analysis
- `pdf-analysis.ts` - PDF document analysis

Run examples with:

```bash
npm run example:basic-chat
npm run example:streaming
npm run example:tool-use
npm run example:pdf-analysis
```

Or directly with tsx:

```bash
npx tsx examples/basic-chat.ts
npx tsx examples/streaming.ts
```

## API Reference

### Client

```typescript
function createClient(config: AnthropicConfig): AnthropicClient
function createClientFromEnv(): AnthropicClient
```

### Messages API

```typescript
interface MessagesAPI {
  create(request: CreateMessageRequest): Promise<Message>;
  stream(request: CreateMessageRequest): Promise<AsyncIterable<StreamEvent>>;
  countTokens(request: CountTokensRequest): Promise<TokenCount>;
}
```

### Models API

```typescript
interface ModelsAPI {
  list(): Promise<ModelListResponse>;
  get(modelId: string): Promise<ModelInfo>;
}
```

### Batches API

```typescript
interface BatchesAPI {
  create(request: CreateBatchRequest): Promise<MessageBatch>;
  retrieve(batchId: string): Promise<MessageBatch>;
  list(params?: BatchListParams): Promise<BatchListResponse>;
  results(batchId: string): Promise<BatchResultsResponse>;
  cancel(batchId: string): Promise<MessageBatch>;
}
```

### Types

```typescript
interface Message {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ContentBlock[];
  model: string;
  stop_reason: StopReason | null;
  stop_sequence: string | null;
  usage: Usage;
}

type ContentBlock =
  | TextBlock
  | ImageBlock
  | ToolUseBlock
  | ToolResultBlock
  | DocumentBlock
  | ThinkingBlock;

interface CreateMessageRequest {
  model: string;
  max_tokens: number;
  messages: MessageParam[];
  system?: string | SystemBlock[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  tools?: Tool[];
  tool_choice?: ToolChoice;
  metadata?: Metadata;
  stream?: boolean;
  thinking?: ThinkingConfig;
}
```

## Requirements

- Node.js 18 or later
- TypeScript 5.0 or later (if using TypeScript)

## License

See LICENSE file for details.

## Contributing

Contributions are welcome! Please ensure:

1. All tests pass: `npm test`
2. Code is formatted: `npm run lint`
3. Type checking passes: `npm run typecheck`
4. Documentation is updated

## Support

For issues and questions:
- GitHub Issues: https://github.com/integrations/anthropic/issues
- Documentation: https://docs.anthropic.com

## SPARC Specification

This implementation follows the SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) methodology. See the `/plans/LLM/anthropic/` directory for complete specification documents.
