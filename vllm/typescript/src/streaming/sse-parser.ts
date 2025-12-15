/**
 * Server-Sent Events (SSE) Parser for vLLM Streaming
 * Implements SSE parsing with back-pressure support as per SPARC specification
 */

import { MalformedSseError, StreamInterruptedError } from '../types/errors.js';
import type { ChatChunk } from '../types/index.js';

export interface SSEEvent {
  event?: string;
  data: string;
  id?: string;
  retry?: number;
}

/**
 * Parse a single SSE line into event data
 */
export function parseSSELine(line: string): Partial<SSEEvent> | null {
  const trimmed = line.trim();

  // Empty line signifies end of event
  if (!trimmed) {
    return null;
  }

  // Comment line (starts with colon)
  if (trimmed.startsWith(':')) {
    return null;
  }

  const colonIndex = trimmed.indexOf(':');
  if (colonIndex === -1) {
    return { [trimmed]: '' } as Partial<SSEEvent>;
  }

  const field = trimmed.slice(0, colonIndex);
  let value = trimmed.slice(colonIndex + 1);

  // Remove leading space from value if present
  if (value.startsWith(' ')) {
    value = value.slice(1);
  }

  switch (field) {
    case 'event':
      return { event: value };
    case 'data':
      return { data: value };
    case 'id':
      return { id: value };
    case 'retry':
      const retry = parseInt(value, 10);
      return isNaN(retry) ? null : { retry };
    default:
      return null;
  }
}

/**
 * Async generator that parses SSE events from a ReadableStream
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SSEEvent, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent: Partial<SSEEvent> = {};

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Emit any remaining event
        if (currentEvent.data !== undefined) {
          yield { data: currentEvent.data, ...currentEvent } as SSEEvent;
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r\n|\n|\r/);

      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line === '') {
          // Empty line - emit current event if we have data
          if (currentEvent.data !== undefined) {
            yield { data: currentEvent.data, ...currentEvent } as SSEEvent;
          }
          currentEvent = {};
        } else {
          const parsed = parseSSELine(line);
          if (parsed) {
            if (parsed.data !== undefined) {
              // Append to existing data with newline for multi-line data
              currentEvent.data =
                currentEvent.data !== undefined
                  ? currentEvent.data + '\n' + parsed.data
                  : parsed.data;
            } else {
              Object.assign(currentEvent, parsed);
            }
          }
        }
      }
    }
  } catch (error) {
    throw new StreamInterruptedError(
      error instanceof Error ? error.message : 'Stream reading failed'
    );
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse SSE events from a Response object
 */
export async function* parseSSEResponse(
  response: Response
): AsyncGenerator<SSEEvent, void, unknown> {
  if (!response.body) {
    throw new StreamInterruptedError('Response body is null');
  }

  yield* parseSSEStream(response.body);
}

/**
 * Parse SSE events and convert to ChatChunk objects
 */
export async function* parseChatChunks(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<ChatChunk, void, unknown> {
  for await (const event of parseSSEStream(stream)) {
    // Skip [DONE] sentinel
    if (event.data === '[DONE]') {
      break;
    }

    try {
      const chunk = JSON.parse(event.data) as ChatChunk;
      yield chunk;
    } catch (error) {
      throw new MalformedSseError(
        'Failed to parse chat chunk JSON',
        event.data
      );
    }
  }
}

/**
 * Back-pressure aware stream transformer
 * Implements bounded buffering to prevent memory exhaustion
 */
export class BackpressureBuffer<T> {
  private buffer: T[] = [];
  private readonly maxSize: number;
  private waitingProducers: Array<() => void> = [];
  private waitingConsumers: Array<(value: T | undefined) => void> = [];
  private closed = false;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  /**
   * Push an item into the buffer, waiting if full
   */
  async push(item: T): Promise<void> {
    if (this.closed) {
      throw new Error('Buffer is closed');
    }

    // If there's a waiting consumer, give directly
    const consumer = this.waitingConsumers.shift();
    if (consumer) {
      consumer(item);
      return;
    }

    // If buffer is full, wait
    if (this.buffer.length >= this.maxSize) {
      await new Promise<void>((resolve) => {
        this.waitingProducers.push(resolve);
      });
    }

    if (this.closed) {
      throw new Error('Buffer is closed');
    }

    this.buffer.push(item);
  }

  /**
   * Pull an item from the buffer, waiting if empty
   */
  async pull(): Promise<T | undefined> {
    // If there's an item available, return it
    if (this.buffer.length > 0) {
      const item = this.buffer.shift()!;

      // Wake up a waiting producer
      const producer = this.waitingProducers.shift();
      if (producer) {
        producer();
      }

      return item;
    }

    // If closed, return undefined
    if (this.closed) {
      return undefined;
    }

    // Wait for an item
    return new Promise<T | undefined>((resolve) => {
      this.waitingConsumers.push(resolve);
    });
  }

  /**
   * Close the buffer, signaling no more items
   */
  close(): void {
    this.closed = true;

    // Wake up all waiting consumers
    for (const consumer of this.waitingConsumers) {
      consumer(undefined);
    }
    this.waitingConsumers = [];

    // Wake up all waiting producers (they'll throw)
    for (const producer of this.waitingProducers) {
      producer();
    }
    this.waitingProducers = [];
  }

  /**
   * Check if the buffer is closed
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Get current buffer size
   */
  size(): number {
    return this.buffer.length;
  }
}

/**
 * Create a back-pressure aware async iterable from a ReadableStream
 */
export function createBackpressureStream<T>(
  stream: ReadableStream<Uint8Array>,
  parser: (stream: ReadableStream<Uint8Array>) => AsyncGenerator<T>,
  bufferSize: number = 100
): AsyncIterable<T> {
  const buffer = new BackpressureBuffer<T>(bufferSize);

  // Start producer
  (async () => {
    try {
      for await (const item of parser(stream)) {
        await buffer.push(item);
      }
    } catch (error) {
      // Error will be propagated when consumer tries to read
      console.error('Stream producer error:', error);
    } finally {
      buffer.close();
    }
  })();

  // Return consumer iterable
  return {
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<T>> {
          const value = await buffer.pull();
          if (value === undefined) {
            return { done: true, value: undefined };
          }
          return { done: false, value };
        },
      };
    },
  };
}

/**
 * Aggregate small chunks for efficiency
 * Combines multiple small content deltas into larger chunks
 */
export async function* aggregateChunks(
  chunks: AsyncIterable<ChatChunk>,
  options: {
    maxBufferSize?: number;
    flushIntervalMs?: number;
  } = {}
): AsyncGenerator<ChatChunk, void, unknown> {
  const { maxBufferSize = 10, flushIntervalMs = 50 } = options;

  let buffer: ChatChunk[] = [];
  let lastFlush = Date.now();

  for await (const chunk of chunks) {
    buffer.push(chunk);

    const shouldFlush =
      buffer.length >= maxBufferSize ||
      Date.now() - lastFlush >= flushIntervalMs ||
      chunk.choices[0]?.finish_reason !== null;

    if (shouldFlush && buffer.length > 0) {
      // Merge buffered chunks
      if (buffer.length === 1) {
        yield buffer[0]!;
      } else {
        const merged = mergeChunks(buffer);
        yield merged;
      }
      buffer = [];
      lastFlush = Date.now();
    }
  }

  // Flush remaining
  if (buffer.length > 0) {
    if (buffer.length === 1) {
      yield buffer[0]!;
    } else {
      yield mergeChunks(buffer);
    }
  }
}

/**
 * Merge multiple chunks into a single chunk
 */
function mergeChunks(chunks: ChatChunk[]): ChatChunk {
  if (chunks.length === 0) {
    throw new Error('Cannot merge empty chunks array');
  }

  const first = chunks[0]!;
  const last = chunks[chunks.length - 1]!;

  // Merge content from all chunks
  const mergedContent = chunks
    .map((c) => c.choices[0]?.delta?.content ?? '')
    .join('');

  return {
    id: first.id,
    object: 'chat.completion.chunk',
    created: first.created,
    model: first.model,
    choices: [
      {
        index: 0,
        delta: {
          role: first.choices[0]?.delta?.role,
          content: mergedContent || undefined,
        },
        finish_reason: last.choices[0]?.finish_reason ?? null,
      },
    ],
  };
}
