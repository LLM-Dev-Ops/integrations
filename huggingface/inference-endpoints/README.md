# HuggingFace Inference Endpoints Integration

A TypeScript integration for HuggingFace Inference Endpoints, providing a unified interface for serverless inference, dedicated endpoints, and third-party provider routing.

## Features

- **OpenAI-compatible Chat API** - Full support for chat completions with streaming
- **Native Text Generation** - HuggingFace's native text generation format
- **Vector Embeddings** - Batch embedding support with caching
- **Endpoint Management** - CRUD operations for dedicated endpoints
- **Cold Start Handling** - Automatic retry with exponential backoff
- **Multi-Provider Routing** - Support for 20+ third-party providers via HF routing
- **Platform Integration** - Implements the ModelAdapter interface

## Installation

```bash
npm install @integrations/hf-inference-endpoints
```

## Quick Start

```typescript
import { HfInferenceClient } from '@integrations/hf-inference-endpoints';

// Create client
const client = new HfInferenceClient({
  token: process.env.HF_TOKEN,
});

// Chat completion
const response = await client.chat().complete({
  model: 'meta-llama/Llama-3.2-3B-Instruct',
  messages: [
    { role: 'user', content: 'What is the capital of France?' }
  ],
  maxTokens: 100,
});

console.log(response.choices[0].message.content);
```

## Streaming

```typescript
for await (const chunk of client.chat().stream({
  model: 'meta-llama/Llama-3.2-3B-Instruct',
  messages: [{ role: 'user', content: 'Tell me a story' }],
})) {
  if (chunk.choices[0].delta.content) {
    process.stdout.write(chunk.choices[0].delta.content);
  }
}
```

## Embeddings

```typescript
// Single embedding
const embedding = await client.embedding().embedSingle(
  'sentence-transformers/all-MiniLM-L6-v2',
  'Hello, world!'
);

// Batch embeddings
const response = await client.embedding().embedBatch(
  'sentence-transformers/all-MiniLM-L6-v2',
  ['Hello', 'World', 'How are you?'],
  { batchSize: 32 }
);
```

## Endpoint Management

```typescript
// List endpoints
const endpoints = await client.endpoints().list('my-namespace');

// Create endpoint
const endpoint = await client.endpoints().create({
  name: 'my-endpoint',
  namespace: 'my-namespace',
  type: 'protected',
  model: {
    repository: 'meta-llama/Llama-3.2-3B-Instruct',
    task: 'text-generation',
  },
  compute: {
    accelerator: 'gpu',
    instanceType: 'nvidia-a10g',
    instanceSize: 'medium',
    scaling: {
      minReplicas: 0,
      maxReplicas: 2,
      scaleToZeroTimeout: 15,
    },
  },
});

// Wait for running state
await client.endpoints().waitForStatus('my-endpoint', 'running');
```

## Third-Party Providers

Route requests through HuggingFace to various providers:

```typescript
import { InferenceProvider } from '@integrations/hf-inference-endpoints';

const response = await client.chat().complete({
  model: 'meta-llama/Llama-3.2-3B-Instruct',
  messages: [{ role: 'user', content: 'Hello!' }],
  provider: InferenceProvider.Together, // Route via Together AI
});
```

Supported providers:
- Together AI
- Groq
- Fireworks
- Replicate
- Cerebras
- Sambanova
- Nebius

## Platform Adapter

Use the adapter for integration with the platform's provider system:

```typescript
import { HfInferenceAdapter } from '@integrations/hf-inference-endpoints';

const adapter = new HfInferenceAdapter({
  token: process.env.HF_TOKEN,
});

await adapter.initialize();

const response = await adapter.complete({
  model: 'meta-llama/Llama-3.2-3B-Instruct',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

## Configuration

```typescript
const client = new HfInferenceClient({
  config: {
    token: 'hf_xxx',
    defaultProvider: InferenceProvider.Serverless,
    defaultNamespace: 'my-namespace',

    // Cold start handling
    autoWaitForModel: true,
    coldStartTimeout: 300000, // 5 minutes

    // Retries
    maxRetries: 3,
    retryBaseDelay: 1000,
    retryMaxDelay: 30000,

    // Caching
    enableEmbeddingCache: true,
    embeddingCacheTtl: 86400000, // 24 hours
    maxEmbeddingCacheSize: 100 * 1024 * 1024, // 100MB
  },
});
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HF_TOKEN` | Yes | - | HuggingFace API token |
| `HF_DEFAULT_PROVIDER` | No | `serverless` | Default inference provider |
| `HF_DEFAULT_NAMESPACE` | No | - | Default namespace for dedicated endpoints |
| `HF_COLD_START_TIMEOUT` | No | `300` | Cold start timeout in seconds |
| `HF_REQUEST_TIMEOUT` | No | `120` | Request timeout in seconds |

## Error Handling

```typescript
import { HfError, HfErrorCode } from '@integrations/hf-inference-endpoints';

try {
  await client.chat().complete({ ... });
} catch (error) {
  if (error instanceof HfError) {
    switch (error.code) {
      case HfErrorCode.RateLimited:
        // Wait and retry
        await sleep(error.retryAfterMs || 1000);
        break;
      case HfErrorCode.ModelLoading:
        // Model is cold starting
        console.log('Model is loading, please wait...');
        break;
      case HfErrorCode.AuthenticationError:
        // Invalid token
        console.error('Invalid API token');
        break;
    }
  }
}
```

## License

MIT
