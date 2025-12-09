import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type { RequestOptions } from '../../types/common.js';
import type { ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk } from './types.js';
import { ChatCompletionValidator } from './validation.js';

export interface ChatCompletionService {
  create(request: ChatCompletionRequest, options?: RequestOptions): Promise<ChatCompletionResponse>;
  stream(request: ChatCompletionRequest, options?: RequestOptions): AsyncIterable<ChatCompletionChunk>;
}

export class ChatCompletionServiceImpl implements ChatCompletionService {
  constructor(private readonly orchestrator: ResilienceOrchestrator) {}

  async create(
    request: ChatCompletionRequest,
    options?: RequestOptions
  ): Promise<ChatCompletionResponse> {
    ChatCompletionValidator.validate(request);

    return this.orchestrator.request({
      method: 'POST',
      path: '/v1/chat/completions',
      body: { ...request, stream: false },
      ...options,
    });
  }

  async *stream(
    request: ChatCompletionRequest,
    options?: RequestOptions
  ): AsyncIterable<ChatCompletionChunk> {
    ChatCompletionValidator.validate(request);

    yield* this.orchestrator.stream<ChatCompletionChunk>({
      method: 'POST',
      path: '/v1/chat/completions',
      body: { ...request, stream: true },
      ...options,
    });
  }
}
