/**
 * SSE Parser
 *
 * Parses Server-Sent Events stream from xAI API.
 *
 * @module infra/sse-parser
 */

import { streamError } from '../error.js';
import type { StreamChoice } from '../types/message.js';
import type { Usage } from '../types/usage.js';

/**
 * Streaming chunk from xAI API.
 */
export interface ChatStreamChunk {
  readonly id: string;
  readonly object: 'chat.completion.chunk';
  readonly created: number;
  readonly model: string;
  readonly choices: StreamChoice[];
  readonly usage?: Usage;
  readonly system_fingerprint?: string;
}

/**
 * SSE event.
 */
interface SseEvent {
  readonly event?: string;
  readonly data: string;
}

/**
 * Parse SSE line.
 *
 * @param line - Line from SSE stream
 * @returns Parsed event or null
 */
function parseSseLine(line: string): SseEvent | null {
  const trimmed = line.trim();

  // Empty line or comment
  if (trimmed === '' || trimmed.startsWith(':')) {
    return null;
  }

  // Data line
  if (trimmed.startsWith('data:')) {
    const data = trimmed.slice(5).trim();
    return { data };
  }

  // Event line (if needed in future)
  if (trimmed.startsWith('event:')) {
    const event = trimmed.slice(6).trim();
    return { event, data: '' };
  }

  return null;
}

/**
 * SSE stream parser.
 */
export class SseParser {
  private buffer: string = '';

  /**
   * Feed data to the parser.
   *
   * @param chunk - Chunk of data
   * @returns Array of parsed chunks
   */
  feed(chunk: string): ChatStreamChunk[] {
    this.buffer += chunk;
    const results: ChatStreamChunk[] = [];

    // Split by newlines, keeping incomplete lines in buffer
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const event = parseSseLine(line);
      if (!event) {
        continue;
      }

      // Check for stream end
      if (event.data === '[DONE]') {
        continue;
      }

      // Parse JSON
      try {
        const parsed = JSON.parse(event.data) as ChatStreamChunk;
        results.push(parsed);
      } catch {
        // Ignore parse errors for incomplete JSON
      }
    }

    return results;
  }

  /**
   * Reset the parser state.
   */
  reset(): void {
    this.buffer = '';
  }
}

/**
 * Create an async iterator from a readable stream.
 *
 * @param response - Fetch response with streaming body
 * @returns Async iterator of chunks
 */
export async function* streamChunks(
  response: Response
): AsyncGenerator<ChatStreamChunk, void, unknown> {
  if (!response.body) {
    throw streamError('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const text = decoder.decode(value, { stream: true });
      const chunks = parser.feed(text);

      for (const chunk of chunks) {
        yield chunk;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
