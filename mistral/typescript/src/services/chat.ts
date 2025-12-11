/**
 * Chat completion service.
 */

import type { HttpTransport } from '../transport';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
} from '../types/chat';

/**
 * Chat service interface.
 */
export interface ChatService {
  /** Creates a chat completion. */
  create(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;

  /** Creates a streaming chat completion. */
  createStream(request: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk>;
}

/**
 * Default implementation of the chat service.
 */
export class DefaultChatService implements ChatService {
  constructor(private readonly transport: HttpTransport) {}

  async create(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const body = await this.transport.post('/v1/chat/completions', request);
    return JSON.parse(body) as ChatCompletionResponse;
  }

  async *createStream(request: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk> {
    const streamRequest = { ...request, stream: true };

    for await (const data of this.transport.postStream('/v1/chat/completions', streamRequest)) {
      try {
        yield JSON.parse(data) as ChatCompletionChunk;
      } catch {
        // Skip malformed chunks
      }
    }
  }
}

/**
 * Creates a chat service.
 */
export function createChatService(transport: HttpTransport): ChatService {
  return new DefaultChatService(transport);
}
