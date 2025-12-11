/**
 * Mock infrastructure for testing.
 */

import { HttpTransport, HttpRequest, HttpResponse, StreamingResponse } from '../transport';
import { ChatResponse, ChatChunk } from '../types/chat';
import { TranscriptionResponse, TranslationResponse } from '../types/audio';
import { Model, ModelList, KnownModels } from '../types/models';

/**
 * Recorded request for verification.
 */
export interface RecordedRequest {
  /** The request that was made. */
  request: HttpRequest;
  /** Timestamp of the request. */
  timestamp: Date;
}

/**
 * Mock response configuration.
 */
export interface MockResponse<T = unknown> {
  /** HTTP status code. */
  status: number;
  /** Response headers. */
  headers?: Record<string, string>;
  /** Response body. */
  data: T;
  /** Optional delay in milliseconds. */
  delay?: number;
  /** Optional error to throw. */
  error?: Error;
}

/**
 * Mock transport for testing.
 */
export class MockTransport implements HttpTransport {
  private readonly responses: Map<string, MockResponse[]> = new Map();
  private readonly defaultResponse: MockResponse;
  private readonly recordedRequests: RecordedRequest[] = [];

  constructor(defaultResponse?: MockResponse) {
    this.defaultResponse = defaultResponse ?? {
      status: 200,
      data: {},
    };
  }

  /**
   * Configures a response for a specific path.
   */
  onPath(path: string, response: MockResponse): this {
    const existing = this.responses.get(path) ?? [];
    existing.push(response);
    this.responses.set(path, existing);
    return this;
  }

  /**
   * Clears all configured responses.
   */
  clearResponses(): this {
    this.responses.clear();
    return this;
  }

  /**
   * Gets recorded requests.
   */
  getRecordedRequests(): RecordedRequest[] {
    return [...this.recordedRequests];
  }

  /**
   * Clears recorded requests.
   */
  clearRecordedRequests(): this {
    this.recordedRequests.length = 0;
    return this;
  }

  async request<T>(req: HttpRequest): Promise<HttpResponse<T>> {
    this.recordedRequests.push({ request: req, timestamp: new Date() });

    const response = this.getNextResponse(req.path);

    if (response.delay) {
      await this.sleep(response.delay);
    }

    if (response.error) {
      throw response.error;
    }

    return {
      status: response.status,
      headers: response.headers ?? {},
      data: response.data as T,
      requestId: 'mock-request-id',
    };
  }

  async stream(req: HttpRequest): Promise<StreamingResponse> {
    this.recordedRequests.push({ request: req, timestamp: new Date() });

    const response = this.getNextResponse(req.path);

    if (response.delay) {
      await this.sleep(response.delay);
    }

    if (response.error) {
      throw response.error;
    }

    // If data is an array, treat as chunks
    const chunks = Array.isArray(response.data)
      ? response.data
      : [response.data];

    return {
      events: this.createChunkIterator(chunks),
      requestId: 'mock-request-id',
    };
  }

  private getNextResponse(path: string): MockResponse {
    const responses = this.responses.get(path);
    if (!responses || responses.length === 0) {
      return this.defaultResponse;
    }

    // Use first response, remove if there are more queued
    if (responses.length > 1) {
      return responses.shift() ?? this.defaultResponse;
    }
    return responses[0] ?? this.defaultResponse;
  }

  private async *createChunkIterator(chunks: unknown[]): AsyncIterable<string> {
    for (const chunk of chunks) {
      yield JSON.stringify(chunk);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Creates a mock transport.
 */
export function createMockTransport(defaultResponse?: MockResponse): MockTransport {
  return new MockTransport(defaultResponse);
}

/**
 * Creates a JSON response mock.
 */
export function jsonResponse<T>(data: T, status = 200): MockResponse<T> {
  return { status, data };
}

/**
 * Creates an error response mock.
 */
export function errorResponse(
  message: string,
  status = 500,
  code?: string
): MockResponse {
  return {
    status,
    data: {
      error: {
        message,
        type: code ?? 'server_error',
      },
    },
  };
}

// ============================================================================
// Mock Fixtures
// ============================================================================

/**
 * Creates a mock chat response.
 */
export function mockChatResponse(
  content: string,
  model = KnownModels.LLAMA_3_3_70B_VERSATILE
): ChatResponse {
  return {
    id: 'chatcmpl-mock-123',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
      prompt_time: 0.001,
      completion_time: 0.05,
      total_time: 0.051,
    },
  };
}

/**
 * Creates mock chat stream chunks.
 */
export function mockChatChunks(
  content: string,
  model = KnownModels.LLAMA_3_3_70B_VERSATILE
): ChatChunk[] {
  const id = 'chatcmpl-mock-stream-123';
  const created = Math.floor(Date.now() / 1000);
  const words = content.split(' ');

  const chunks: ChatChunk[] = [];

  // First chunk with role
  chunks.push({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: '' },
        finish_reason: null,
      },
    ],
  });

  // Content chunks
  for (let i = 0; i < words.length; i++) {
    const word = i === 0 ? words[i] : ' ' + words[i];
    chunks.push({
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [
        {
          index: 0,
          delta: { content: word },
          finish_reason: null,
        },
      ],
    });
  }

  // Final chunk with finish reason
  chunks.push({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: words.length,
      total_tokens: 10 + words.length,
    },
  });

  return chunks;
}

/**
 * Creates a mock transcription response.
 */
export function mockTranscriptionResponse(text: string): TranscriptionResponse {
  return {
    text,
    task: 'transcribe',
    language: 'en',
    duration: 10.5,
  };
}

/**
 * Creates a mock translation response.
 */
export function mockTranslationResponse(text: string): TranslationResponse {
  return {
    text,
    task: 'translate',
    language: 'es',
    duration: 10.5,
  };
}

/**
 * Creates a mock model.
 */
export function mockModel(id: string): Model {
  return {
    id,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: 'groq',
    active: true,
    context_window: 8192,
  };
}

/**
 * Creates a mock model list.
 */
export function mockModelList(): ModelList {
  return {
    object: 'list',
    data: [
      mockModel(KnownModels.LLAMA_3_3_70B_VERSATILE),
      mockModel(KnownModels.LLAMA_3_1_8B_INSTANT),
      mockModel(KnownModels.MIXTRAL_8X7B),
      mockModel(KnownModels.WHISPER_LARGE_V3),
    ],
  };
}
