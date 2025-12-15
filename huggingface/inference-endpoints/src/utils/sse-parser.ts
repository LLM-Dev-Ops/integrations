/**
 * Server-Sent Events (SSE) Parser
 * Parses SSE streams from HuggingFace API responses
 */

import { createStreamInterruptedError } from '../types/errors.js';

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

  // Comment line
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
      buffer = lines.pop() || '';

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
              // Append to existing data with newline
              currentEvent.data = currentEvent.data !== undefined
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
    throw createStreamInterruptedError(
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
    throw createStreamInterruptedError('Response body is null');
  }

  yield* parseSSEStream(response.body);
}

/**
 * Filter SSE events to only include data events with non-empty data
 */
export async function* filterDataEvents(
  events: AsyncGenerator<SSEEvent>
): AsyncGenerator<string, void, unknown> {
  for await (const event of events) {
    if (event.data && event.data !== '[DONE]') {
      yield event.data;
    }
  }
}

/**
 * Parse and filter JSON data from SSE events
 */
export async function* parseJSONEvents<T>(
  events: AsyncGenerator<SSEEvent>
): AsyncGenerator<T, void, unknown> {
  for await (const event of events) {
    if (event.data && event.data !== '[DONE]') {
      try {
        yield JSON.parse(event.data) as T;
      } catch {
        // Skip malformed JSON
        continue;
      }
    }
  }
}

/**
 * Utility to create a ReadableStream from an async iterable
 */
export function iterableToStream<T>(
  iterable: AsyncIterable<T>,
  transform?: (item: T) => Uint8Array
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const defaultTransform = (item: T): Uint8Array => {
    return encoder.encode(JSON.stringify(item) + '\n');
  };

  const transformFn = transform || defaultTransform;

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const item of iterable) {
          controller.enqueue(transformFn(item));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
