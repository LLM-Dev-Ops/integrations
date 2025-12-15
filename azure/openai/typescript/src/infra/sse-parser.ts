/**
 * SSE Stream Parser
 *
 * Parses Server-Sent Events (SSE) streams from Azure OpenAI API.
 * Handles the text/event-stream format with proper chunk accumulation.
 */

/** Parsed SSE event */
export interface SSEEvent<T = unknown> {
  data: T;
  event?: string;
  id?: string;
  retry?: number;
}

/** SSE stream parser state */
interface ParserState {
  buffer: string;
  event: string | undefined;
  data: string[];
  id: string | undefined;
  retry: number | undefined;
}

/**
 * Parses SSE stream from Response body
 */
export async function* parseSSEStream<T>(
  response: Response,
  onDone?: () => void
): AsyncGenerator<T, void, undefined> {
  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  const state: ParserState = {
    buffer: '',
    event: undefined,
    data: [],
    id: undefined,
    retry: undefined,
  };

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Process any remaining buffer
        if (state.buffer.trim()) {
          const event = processLine(state.buffer, state);
          if (event) {
            yield event as T;
          }
        }
        break;
      }

      state.buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = state.buffer.split('\n');
      state.buffer = lines.pop() ?? '';

      for (const line of lines) {
        const event = processLine(line, state);
        if (event) {
          if (event === '[DONE]') {
            onDone?.();
            return;
          }
          yield event as T;
        }
      }
    }
  } finally {
    reader.releaseLock();
    onDone?.();
  }
}

/**
 * Processes a single SSE line
 */
function processLine(line: string, state: ParserState): unknown | null {
  const trimmed = line.trim();

  // Empty line signals end of event
  if (trimmed === '') {
    if (state.data.length > 0) {
      const dataStr = state.data.join('\n');
      state.data = [];

      // Handle [DONE] sentinel
      if (dataStr === '[DONE]') {
        return '[DONE]';
      }

      try {
        return JSON.parse(dataStr);
      } catch {
        // Skip malformed JSON
        return null;
      }
    }
    return null;
  }

  // Parse field
  if (trimmed.startsWith('data:')) {
    const value = trimmed.slice(5).trim();
    state.data.push(value);
  } else if (trimmed.startsWith('event:')) {
    state.event = trimmed.slice(6).trim();
  } else if (trimmed.startsWith('id:')) {
    state.id = trimmed.slice(3).trim();
  } else if (trimmed.startsWith('retry:')) {
    const retryStr = trimmed.slice(6).trim();
    const retry = parseInt(retryStr, 10);
    if (!isNaN(retry)) {
      state.retry = retry;
    }
  }
  // Ignore comments (lines starting with :) and unknown fields

  return null;
}

/**
 * Creates an async iterable from SSE response
 */
export function createSSEIterable<T>(response: Response): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      const generator = parseSSEStream<T>(response);
      return {
        async next() {
          return generator.next();
        },
      };
    },
  };
}

/**
 * Accumulates streamed chunks into a complete response
 */
export class StreamAccumulator<TChunk, TComplete> {
  private chunks: TChunk[] = [];
  private readonly transformer: (chunks: TChunk[]) => TComplete;

  constructor(transformer: (chunks: TChunk[]) => TComplete) {
    this.transformer = transformer;
  }

  add(chunk: TChunk): void {
    this.chunks.push(chunk);
  }

  getChunks(): TChunk[] {
    return [...this.chunks];
  }

  getComplete(): TComplete {
    return this.transformer(this.chunks);
  }
}
