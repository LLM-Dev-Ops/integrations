/**
 * HTTP transport layer for the Cohere client.
 */

import { createParser, type EventSourceParser } from 'eventsource-parser';
import { NetworkError, parseApiError, StreamError } from '../errors';
import { CohereConfig } from '../config';

/**
 * HTTP response from transport
 */
export interface TransportResponse {
  status: number;
  headers: Headers;
  body: unknown;
}

/**
 * HTTP transport interface for making requests
 */
export interface HttpTransport {
  /**
   * Send an HTTP request
   */
  send(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: unknown
  ): Promise<TransportResponse>;

  /**
   * Send a streaming HTTP request
   */
  sendStreaming(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: unknown
  ): AsyncIterable<ServerSentEvent>;
}

/**
 * Server-Sent Event
 */
export interface ServerSentEvent {
  event?: string;
  data: string;
  id?: string;
  retry?: number;
}

/**
 * Default fetch-based HTTP transport
 */
export class FetchTransport implements HttpTransport {
  private readonly config: CohereConfig;

  constructor(config: CohereConfig) {
    this.config = config;
  }

  /**
   * Send an HTTP request
   */
  async send(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: unknown
  ): Promise<TransportResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          'User-Agent': this.config.getUserAgent(),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseBody = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw parseApiError(response.status, responseBody, response.headers);
      }

      return {
        status: response.status,
        headers: response.headers,
        body: responseBody,
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new NetworkError(`Request timed out after ${this.config.timeout}ms`);
      }

      if (error instanceof TypeError) {
        throw new NetworkError(`Network error: ${error.message}`, { cause: error });
      }

      throw error;
    }
  }

  /**
   * Send a streaming HTTP request
   */
  async *sendStreaming(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: unknown
  ): AsyncIterable<ServerSentEvent> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          Authorization: `Bearer ${this.config.apiKey}`,
          'User-Agent': this.config.getUserAgent(),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw parseApiError(response.status, errorBody, response.headers);
      }

      if (!response.body) {
        throw new StreamError('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // Buffer for SSE events
      const eventQueue: ServerSentEvent[] = [];
      let resolveNext: ((value: IteratorResult<ServerSentEvent>) => void) | null = null;

      const parser: EventSourceParser = createParser((event) => {
        if (event.type === 'event') {
          const sseEvent: ServerSentEvent = {
            event: event.event,
            data: event.data,
            id: event.id,
          };

          if (resolveNext) {
            resolveNext({ value: sseEvent, done: false });
            resolveNext = null;
          } else {
            eventQueue.push(sseEvent);
          }
        }
      });

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          parser.feed(chunk);

          // Yield any buffered events
          while (eventQueue.length > 0) {
            yield eventQueue.shift()!;
          }
        }

        // Yield any remaining events
        while (eventQueue.length > 0) {
          yield eventQueue.shift()!;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new NetworkError(`Request timed out after ${this.config.timeout}ms`);
      }

      if (error instanceof TypeError) {
        throw new NetworkError(`Network error: ${error.message}`, { cause: error });
      }

      throw error;
    }
  }
}

/**
 * Build request headers
 */
export function buildHeaders(
  config: CohereConfig,
  additional?: Record<string, string>
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
    'User-Agent': config.getUserAgent(),
    ...additional,
  };
}
