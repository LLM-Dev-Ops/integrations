/**
 * Chat completion service.
 */

import { HttpTransport, StreamingResponse } from '../transport';
import { GroqError } from '../errors';
import { ChatRequest, ChatResponse, ChatChunk } from '../types/chat';
import { ToolCall, ToolCallDelta } from '../types/tools';

/**
 * Chat stream that yields chunks.
 */
export class ChatStream implements AsyncIterable<ChatChunk> {
  private readonly response: StreamingResponse;

  constructor(response: StreamingResponse) {
    this.response = response;
  }

  /**
   * Returns the request ID.
   */
  get requestId(): string | undefined {
    return this.response.requestId;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<ChatChunk> {
    for await (const event of this.response.events) {
      try {
        const chunk = JSON.parse(event) as ChatChunk;
        yield chunk;
      } catch {
        throw GroqError.stream(`Failed to parse streaming chunk: ${event}`);
      }
    }
  }

  /**
   * Collects all chunks and assembles the full response.
   */
  async collect(): Promise<ChatResponse> {
    let id = '';
    let model = '';
    let created = 0;
    let systemFingerprint: string | undefined;
    let content = '';
    let finishReason: ChatResponse['choices'][0]['finish_reason'] = null;
    const toolCalls: Map<number, ToolCall> = new Map();
    let usage = undefined;

    for await (const chunk of this) {
      id = chunk.id;
      model = chunk.model;
      created = chunk.created;
      systemFingerprint = chunk.system_fingerprint;

      if (chunk.usage) {
        usage = chunk.usage;
      }
      if (chunk.x_groq?.usage) {
        usage = chunk.x_groq.usage;
      }

      for (const choice of chunk.choices) {
        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }

        const delta = choice.delta;
        if (delta.content) {
          content += delta.content;
        }

        if (delta.tool_calls) {
          this.accumulateToolCalls(delta.tool_calls, toolCalls);
        }
      }
    }

    const message = {
      role: 'assistant' as const,
      content: content || null,
      tool_calls: toolCalls.size > 0 ? Array.from(toolCalls.values()) : undefined,
    };

    return {
      id,
      object: 'chat.completion',
      created,
      model,
      system_fingerprint: systemFingerprint,
      choices: [
        {
          index: 0,
          message,
          finish_reason: finishReason,
        },
      ],
      usage,
    };
  }

  private accumulateToolCalls(
    deltas: ToolCallDelta[],
    accumulated: Map<number, ToolCall>
  ): void {
    for (const delta of deltas) {
      const existing = accumulated.get(delta.index);

      if (!existing) {
        // First chunk for this tool call
        accumulated.set(delta.index, {
          id: delta.id ?? '',
          type: 'function',
          function: {
            name: delta.function?.name ?? '',
            arguments: delta.function?.arguments ?? '',
          },
        });
      } else {
        // Accumulate arguments
        if (delta.function?.arguments) {
          existing.function.arguments += delta.function.arguments;
        }
      }
    }
  }
}

/**
 * Chat completion service interface.
 */
export interface ChatService {
  /**
   * Creates a chat completion.
   */
  create(request: ChatRequest): Promise<ChatResponse>;

  /**
   * Creates a streaming chat completion.
   */
  createStream(request: ChatRequest): Promise<ChatStream>;
}

/**
 * Default chat service implementation.
 */
export class DefaultChatService implements ChatService {
  private readonly transport: HttpTransport;

  constructor(transport: HttpTransport) {
    this.transport = transport;
  }

  async create(request: ChatRequest): Promise<ChatResponse> {
    this.validateRequest(request);

    const response = await this.transport.request<ChatResponse>({
      method: 'POST',
      path: 'chat/completions',
      body: { ...request, stream: false },
    });

    return response.data;
  }

  async createStream(request: ChatRequest): Promise<ChatStream> {
    this.validateRequest(request);

    const streamingResponse = await this.transport.stream({
      method: 'POST',
      path: 'chat/completions',
      body: {
        ...request,
        stream: true,
        stream_options: request.stream_options ?? { include_usage: true },
      },
    });

    return new ChatStream(streamingResponse);
  }

  private validateRequest(request: ChatRequest): void {
    if (!request.model) {
      throw GroqError.validation('Model is required', 'model');
    }

    if (!request.messages || request.messages.length === 0) {
      throw GroqError.validation('At least one message is required', 'messages');
    }

    if (request.temperature !== undefined) {
      if (request.temperature < 0 || request.temperature > 2) {
        throw GroqError.validation(
          'Temperature must be between 0 and 2',
          'temperature',
          String(request.temperature)
        );
      }
    }

    if (request.top_p !== undefined) {
      if (request.top_p < 0 || request.top_p > 1) {
        throw GroqError.validation(
          'Top-p must be between 0 and 1',
          'top_p',
          String(request.top_p)
        );
      }
    }

    if (request.max_tokens !== undefined && request.max_tokens <= 0) {
      throw GroqError.validation(
        'Max tokens must be positive',
        'max_tokens',
        String(request.max_tokens)
      );
    }
  }
}

/**
 * Creates a chat service.
 */
export function createChatService(transport: HttpTransport): ChatService {
  return new DefaultChatService(transport);
}
