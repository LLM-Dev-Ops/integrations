# Simulation Layer

The Simulation Layer provides recording and replay capabilities for Ollama interactions, enabling testing and development without requiring a live Ollama server.

## Overview

The simulation layer wraps the HTTP transport to intercept requests and responses, supporting three modes:

1. **Disabled** (default): Pass-through mode - requests go directly to the Ollama server
2. **Recording**: Executes requests normally while recording all interactions
3. **Replay**: Returns pre-recorded responses without hitting the server

## Architecture

```
┌─────────────────────────────────────────────┐
│           Application Layer                 │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│         SimulationLayer                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Disabled │  │Recording │  │  Replay  │  │
│  └──────────┘  └──────────┘  └──────────┘  │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│         HttpTransport                       │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
            Ollama Server
```

## Usage

### Basic Recording

```typescript
import { SimulationLayer } from './simulation';
import { HttpTransport } from './transport';

// Create transport
const transport = new HttpTransport(config);

// Create simulation layer in recording mode
const simulationLayer = new SimulationLayer(
  {
    type: 'recording',
    storage: { type: 'memory' }
  },
  transport
);

// Execute requests (they will be recorded)
await simulationLayer.execute(
  'chat',
  chatRequest,
  (t) => t.post('/api/chat', chatRequest)
);

// Save recordings to file
await simulationLayer.saveToFile('./recordings/chat-session.json');
```

### Recording to File

```typescript
const simulationLayer = new SimulationLayer(
  {
    type: 'recording',
    storage: { type: 'file', path: './recordings/chat.json' }
  },
  transport
);

// Requests are automatically persisted to the file
```

### Replay Mode

```typescript
// Create simulation layer in replay mode
const simulationLayer = new SimulationLayer(
  {
    type: 'replay',
    source: { type: 'file', path: './recordings/chat.json' },
    timing: 'instant' // or 'realistic' or { type: 'fixed', delayMs: 100 }
  },
  transport
);

// Load recordings
await simulationLayer.loadFromFile('./recordings/chat.json');

// Requests return recorded responses instantly
const response = await simulationLayer.execute(
  'chat',
  chatRequest,
  (t) => t.post('/api/chat', chatRequest)
);
```

### Streaming Operations

```typescript
// Recording streaming responses
for await (const chunk of simulationLayer.executeStreaming(
  'generate-stream',
  generateRequest,
  (t) => t.postStreaming('/api/generate', generateRequest)
)) {
  // Process chunks (they are recorded with timing information)
  console.log(new TextDecoder().decode(chunk));
}

// Replaying streaming responses
for await (const chunk of simulationLayer.executeStreaming(
  'generate-stream',
  generateRequest,
  (t) => t.postStreaming('/api/generate', generateRequest)
)) {
  // Chunks are replayed with original timing (or instant/fixed)
  console.log(new TextDecoder().decode(chunk));
}
```

## Timing Modes

The replay mode supports different timing behaviors:

### Instant
Returns responses immediately without delay.

```typescript
{
  type: 'replay',
  source: { type: 'file', path: './recordings.json' },
  timing: 'instant'
}
```

### Realistic
Simulates the original timing from when the recording was made.

```typescript
{
  type: 'replay',
  source: { type: 'file', path: './recordings.json' },
  timing: 'realistic'
}
```

### Fixed Delay
Uses a fixed delay for all responses.

```typescript
{
  type: 'replay',
  source: { type: 'file', path: './recordings.json' },
  timing: { type: 'fixed', delayMs: 100 }
}
```

## Storage Backends

### Memory Storage
Stores recordings in memory. Good for testing but lost when the process exits.

```typescript
storage: { type: 'memory' }
```

### File Storage
Persists recordings to disk as JSON files.

```typescript
storage: { type: 'file', path: './recordings/session.json' }
```

## Recording Format

Recordings are stored as JSON with the following structure:

```json
{
  "version": "1.0",
  "createdAt": "2025-12-15T01:00:00.000Z",
  "entries": [
    {
      "id": "rec_1702488000000_abc123",
      "timestamp": "2025-12-15T01:00:00.000Z",
      "operation": "chat",
      "model": "llama2",
      "request": {
        "model": "llama2",
        "messages": [
          { "role": "user", "content": "Hello" }
        ]
      },
      "response": {
        "type": "success",
        "body": {
          "message": { "role": "assistant", "content": "Hi there!" },
          "done": true
        }
      },
      "timing": {
        "totalDurationMs": 1234,
        "firstTokenMs": 100,
        "chunkTimings": [100, 150, 200, 250]
      }
    }
  ]
}
```

## API Reference

### SimulationLayer

#### Constructor
```typescript
constructor(mode: SimulationMode, transport: HttpTransport)
```

#### Methods

##### `setMode(mode: SimulationMode): void`
Change the simulation mode at runtime.

##### `getMode(): SimulationMode`
Get the current simulation mode.

##### `execute(operation: string, body: unknown, executor: Function): Promise<HttpResponse>`
Execute a non-streaming operation through the simulation layer.

##### `executeStreaming(operation: string, body: unknown, executor: Function): AsyncGenerator<Uint8Array>`
Execute a streaming operation through the simulation layer.

##### `saveToFile(path: string): Promise<void>`
Save current recordings to a JSON file.

##### `loadFromFile(path: string): Promise<void>`
Load recordings from a JSON file.

##### `getRecordings(): RecordEntry[]`
Get all recorded entries.

##### `clearRecordings(): void`
Clear all recordings from memory.

## Testing

The simulation layer is particularly useful for testing:

```typescript
import { describe, it, expect } from 'vitest';

describe('Chat Service', () => {
  it('should handle chat requests', async () => {
    // Use replay mode with pre-recorded responses
    const simulationLayer = new SimulationLayer(
      {
        type: 'replay',
        source: { type: 'file', path: './fixtures/chat-success.json' },
        timing: 'instant'
      },
      transport
    );

    await simulationLayer.loadFromFile('./fixtures/chat-success.json');

    const response = await chatService.chat({
      model: 'llama2',
      messages: [{ role: 'user', content: 'test' }]
    });

    expect(response).toBeDefined();
  });
});
```

## Best Practices

1. **Use meaningful operation names**: This helps with debugging and matching recordings
2. **Record once, replay many times**: Create recordings in a controlled environment
3. **Use file storage for CI/CD**: Commit recordings to version control for consistent tests
4. **Use instant timing in tests**: Tests run faster with `timing: 'instant'`
5. **Use realistic timing for demos**: Showcase actual performance with `timing: 'realistic'`
6. **Sanitize sensitive data**: Remove API keys and personal information from recordings

## Implementation Details

Based on SPARC specification Section 7 (Simulation Layer):

- **Recording matching**: Tries exact match first (operation + body), then falls back to operation-only match
- **Timing capture**: Records total duration, first token time, and per-chunk timings for streaming
- **Error recording**: Captures and replays errors just like successful responses
- **Chunk handling**: Streams are recorded as arrays of parsed JSON objects or raw strings
- **File format**: Uses JSON for easy inspection and manual editing
