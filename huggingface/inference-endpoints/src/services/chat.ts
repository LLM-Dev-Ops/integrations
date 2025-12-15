/**
 * Chat Service
 * Implements OpenAI-compatible chat completions API as specified in SPARC documentation
 */

import {
  ChatRequest,
  ChatResponse,
  ChatStreamChunk,
  ChatMessage,
  HfInferenceConfig,
  InferenceTarget,
} from '../types/index.js';
import { parseHttpError, createValidationError } from '../types/errors.js';
import { ProviderResolver, ResolvedEndpoint } from '../providers/provider-resolver.js';
import { parseSSEResponse, parseJSONEvents } from '../utils/sse-parser.js';
import { withRetry } from '../utils/retry.js';
import { ColdStartHandler, createWaitForModelHeaders } from '../utils/cold-start-handler.js';

export interface ChatServiceOptions {
  config: HfInferenceConfig;
  providerResolver: ProviderResolver;
  coldStartHandler: ColdStartHandler;
}

/**
 * Chat Service class
 * Provides OpenAI-compatible chat completions API
 */
export class ChatService {
  private config: HfInferenceConfig;
  private providerResolver: ProviderResolver;
  private coldStartHandler: ColdStartHandler;

  constructor(options: ChatServiceOptions) {
    this.config = options.config;
    this.providerResolver = options.providerResolver;
    this.coldStartHandler = options.coldStartHandler;
  }

  /**
   * Create a chat completion
   */
  async complete(request: ChatRequest): Promise<ChatResponse> {
    this.validateRequest(request);

    const target: InferenceTarget = {
      provider: request.provider || this.config.defaultProvider,
      model: request.model,
    };

    const endpoint = this.providerResolver.resolve(target);

    const requestFn = async (): Promise<ChatResponse> => {
      const response = await this.makeRequest(endpoint, request);
      return this.parseResponse(response);
    };

    if (this.config.autoWaitForModel) {
      return this.coldStartHandler.execute(requestFn, {
        timeout: this.config.coldStartTimeout,
      });
    }

    return withRetry(requestFn, {
      maxRetries: this.config.maxRetries,
      baseDelay: this.config.retryBaseDelay,
      maxDelay: this.config.retryMaxDelay,
    });
  }

  /**
   * Create a streaming chat completion
   */
  async *stream(
    request: ChatRequest
  ): AsyncGenerator<ChatStreamChunk, void, unknown> {
    this.validateRequest(request);

    const target: InferenceTarget = {
      provider: request.provider || this.config.defaultProvider,
      model: request.model,
    };

    const endpoint = this.providerResolver.resolve(target);
    const streamRequest = { ...request, stream: true };

    const response = await this.makeRequest(endpoint, streamRequest, true);

    if (!response.body) {
      throw createValidationError('Response body is null');
    }

    const events = parseSSEResponse(response);

    for await (const chunk of parseJSONEvents<ChatStreamChunk>(events)) {
      yield chunk;
    }
  }

  /**
   * Validate chat request
   */
  private validateRequest(request: ChatRequest): void {
    if (!request.model) {
      throw createValidationError('Model is required');
    }

    if (!request.messages || request.messages.length === 0) {
      throw createValidationError('At least one message is required');
    }

    for (const message of request.messages) {
      if (!message.role) {
        throw createValidationError('Message role is required');
      }

      if (!message.content && !message.toolCalls) {
        throw createValidationError('Message content or tool calls required');
      }
    }

    if (request.temperature !== undefined) {
      if (request.temperature < 0 || request.temperature > 2) {
        throw createValidationError('Temperature must be between 0 and 2');
      }
    }

    if (request.maxTokens !== undefined && request.maxTokens < 1) {
      throw createValidationError('Max tokens must be at least 1');
    }
  }

  /**
   * Make HTTP request to the endpoint
   */
  private async makeRequest(
    endpoint: ResolvedEndpoint,
    request: ChatRequest,
    stream: boolean = false
  ): Promise<Response> {
    const url = `${endpoint.baseUrl}${endpoint.chatPath}`;

    const body = this.buildRequestBody(endpoint, request, stream);

    const headers: Record<string, string> = {
      ...endpoint.headers,
      ...(this.config.autoWaitForModel
        ? createWaitForModelHeaders(true)
        : {}),
    };

    const controller = new AbortController();
    const timeout = stream
      ? this.config.streamTimeout
      : this.config.requestTimeout;

    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw await parseHttpError(response);
      }

      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Build request body for the API
   */
  private buildRequestBody(
    endpoint: ResolvedEndpoint,
    request: ChatRequest,
    stream: boolean
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: endpoint.model,
      messages: request.messages.map((msg) => this.formatMessage(msg)),
      stream,
    };

    if (request.maxTokens !== undefined) {
      body.max_tokens = request.maxTokens;
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (request.topP !== undefined) {
      body.top_p = request.topP;
    }

    if (request.topK !== undefined) {
      // HF-specific parameter
      body.top_k = request.topK;
    }

    if (request.frequencyPenalty !== undefined) {
      body.frequency_penalty = request.frequencyPenalty;
    }

    if (request.presencePenalty !== undefined) {
      body.presence_penalty = request.presencePenalty;
    }

    if (request.stopSequences && request.stopSequences.length > 0) {
      body.stop = request.stopSequences;
    }

    if (request.seed !== undefined) {
      body.seed = request.seed;
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      if (request.toolChoice) {
        body.tool_choice = request.toolChoice;
      }
    }

    return body;
  }

  /**
   * Format message for the API
   */
  private formatMessage(message: ChatMessage): Record<string, unknown> {
    const formatted: Record<string, unknown> = {
      role: message.role,
    };

    if (typeof message.content === 'string') {
      formatted.content = message.content;
    } else if (Array.isArray(message.content)) {
      formatted.content = message.content.map((part) => {
        if (part.type === 'text') {
          return { type: 'text', text: part.text };
        } else if (part.type === 'image_url') {
          return { type: 'image_url', image_url: part.imageUrl };
        }
        return part;
      });
    }

    if (message.name) {
      formatted.name = message.name;
    }

    if (message.toolCalls) {
      formatted.tool_calls = message.toolCalls.map((tc) => ({
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }));
    }

    if (message.toolCallId) {
      formatted.tool_call_id = message.toolCallId;
    }

    return formatted;
  }

  /**
   * Parse response from the API
   */
  private async parseResponse(response: Response): Promise<ChatResponse> {
    const data = await response.json();

    return {
      id: data.id,
      object: 'chat.completion',
      created: data.created,
      model: data.model,
      choices: data.choices.map((choice: any) => ({
        index: choice.index,
        message: {
          role: 'assistant',
          content: choice.message.content,
          toolCalls: choice.message.tool_calls?.map((tc: any) => ({
            id: tc.id,
            type: tc.type,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        },
        finishReason: this.mapFinishReason(choice.finish_reason),
        logprobs: choice.logprobs,
      })),
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }

  /**
   * Map finish reason to our enum
   */
  private mapFinishReason(
    reason: string | null
  ): 'stop' | 'length' | 'tool_calls' | 'content_filter' | null {
    if (!reason) return null;

    switch (reason) {
      case 'stop':
      case 'eos':
      case 'end_turn':
        return 'stop';
      case 'length':
      case 'max_tokens':
        return 'length';
      case 'tool_calls':
      case 'function_call':
        return 'tool_calls';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}
