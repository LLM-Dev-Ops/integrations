import type { ChatCompletionChunk } from '../services/chat/types.js';
import { createChatCompletionChunk } from './chat.fixtures.js';

export interface SSEEvent {
  event?: string;
  data: string;
}

export function createSSEEvent(data: string, event?: string): SSEEvent {
  return {
    event,
    data,
  };
}

export function formatSSEEvent(event: SSEEvent): string {
  let result = '';
  if (event.event) {
    result += `event: ${event.event}\n`;
  }
  result += `data: ${event.data}\n\n`;
  return result;
}

export function createSSEStream(events: SSEEvent[]): string {
  return events.map(formatSSEEvent).join('');
}

export function createChatStreamSSE(): string {
  const chunks = [
    createChatCompletionChunk({
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: '' },
          finish_reason: null,
          logprobs: null,
        },
      ],
    }),
    createChatCompletionChunk({
      choices: [
        {
          index: 0,
          delta: { content: 'Hello' },
          finish_reason: null,
          logprobs: null,
        },
      ],
    }),
    createChatCompletionChunk({
      choices: [
        {
          index: 0,
          delta: { content: '!' },
          finish_reason: null,
          logprobs: null,
        },
      ],
    }),
    createChatCompletionChunk({
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop',
          logprobs: null,
        },
      ],
    }),
  ];

  const events: SSEEvent[] = chunks.map((chunk) =>
    createSSEEvent(JSON.stringify(chunk))
  );
  events.push(createSSEEvent('[DONE]'));

  return createSSEStream(events);
}

export async function* createMockStreamGenerator<T>(
  chunks: T[]
): AsyncIterable<T> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

export async function* createErrorStreamGenerator(
  error: Error,
  afterChunks: number = 2
): AsyncIterable<ChatCompletionChunk> {
  for (let i = 0; i < afterChunks; i++) {
    yield createChatCompletionChunk({
      choices: [
        {
          index: 0,
          delta: { content: 'chunk' },
          finish_reason: null,
          logprobs: null,
        },
      ],
    });
  }
  throw error;
}

export function createStreamTimeout(): AsyncIterable<ChatCompletionChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      await new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Stream timeout')), 100)
      );
    },
  };
}
