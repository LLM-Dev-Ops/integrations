/**
 * Chat service implementation.
 */

import type { HttpTransport, ServerSentEvent } from '../../transport';
import type { CohereConfig } from '../../config';
import { validateChatRequest } from './validation';
import type {
  ChatRequest,
  ChatResponse,
  ChatStreamEvent,
  ChatStreamEventType,
} from './types';

/**
 * Chat service interface
 */
export interface ChatService {
  /**
   * Send a chat message
   */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * Stream a chat response
   */
  chatStream(request: ChatRequest): AsyncIterable<ChatStreamEvent>;
}

/**
 * Chat service implementation
 */
export class ChatServiceImpl implements ChatService {
  private readonly transport: HttpTransport;
  private readonly config: CohereConfig;

  constructor(transport: HttpTransport, config: CohereConfig) {
    this.transport = transport;
    this.config = config;
  }

  /**
   * Send a chat message
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    validateChatRequest(request);

    const url = this.config.buildUrl('/chat');
    const body = this.buildRequestBody(request);

    const response = await this.transport.send('POST', url, {}, body);
    return this.parseResponse(response.body);
  }

  /**
   * Stream a chat response
   */
  async *chatStream(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    validateChatRequest(request);

    const url = this.config.buildUrl('/chat');
    const body = this.buildRequestBody(request, true);

    const stream = this.transport.sendStreaming('POST', url, {}, body);

    for await (const event of stream) {
      const parsed = this.parseStreamEvent(event);
      if (parsed) {
        yield parsed;
      }
    }
  }

  /**
   * Build the request body
   */
  private buildRequestBody(
    request: ChatRequest,
    stream = false
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      message: request.message,
      stream,
    };

    if (request.model) body['model'] = request.model;
    if (request.preamble) body['preamble'] = request.preamble;
    if (request.chatHistory) body['chat_history'] = request.chatHistory.map(m => ({
      role: m.role,
      message: m.content,
      tool_call_id: m.toolCallId,
    }));
    if (request.conversationId) body['conversation_id'] = request.conversationId;
    if (request.tools) body['tools'] = request.tools.map(t => ({
      name: t.name,
      description: t.description,
      parameter_definitions: t.parameters?.reduce((acc, p) => {
        acc[p.name] = {
          description: p.description,
          type: p.type,
          required: p.required ?? false,
        };
        return acc;
      }, {} as Record<string, unknown>),
    }));
    if (request.toolResults) body['tool_results'] = request.toolResults.map(r => ({
      call: { id: r.callId },
      outputs: [r.output],
    }));
    if (request.forceSingleStep !== undefined) body['force_single_step'] = request.forceSingleStep;
    if (request.documents) body['documents'] = request.documents;
    if (request.connectors) body['connectors'] = request.connectors;
    if (request.citationQuality) body['citation_quality'] = request.citationQuality;
    if (request.promptTruncation) body['prompt_truncation'] = request.promptTruncation;
    if (request.searchQueriesOnly !== undefined) body['search_queries_only'] = request.searchQueriesOnly;
    if (request.returnPrompt !== undefined) body['return_prompt'] = request.returnPrompt;
    if (request.returnPreamble !== undefined) body['return_preamble'] = request.returnPreamble;
    if (request.rawPrompting !== undefined) body['raw_prompting'] = request.rawPrompting;

    // Generation options
    if (request.temperature !== undefined) body['temperature'] = request.temperature;
    if (request.maxTokens !== undefined) body['max_tokens'] = request.maxTokens;
    if (request.topP !== undefined) body['p'] = request.topP;
    if (request.topK !== undefined) body['k'] = request.topK;
    if (request.frequencyPenalty !== undefined) body['frequency_penalty'] = request.frequencyPenalty;
    if (request.presencePenalty !== undefined) body['presence_penalty'] = request.presencePenalty;
    if (request.stopSequences) body['stop_sequences'] = request.stopSequences;
    if (request.seed !== undefined) body['seed'] = request.seed;

    return body;
  }

  /**
   * Parse the response
   */
  private parseResponse(body: unknown): ChatResponse {
    const data = body as Record<string, unknown>;

    return {
      text: String(data['text'] ?? ''),
      generationId: data['generation_id'] as string | undefined,
      finishReason: data['finish_reason'] as ChatResponse['finishReason'],
      chatHistory: this.parseChatHistory(data['chat_history']),
      toolCalls: this.parseToolCalls(data['tool_calls']),
      citations: data['citations'] as ChatResponse['citations'],
      documents: data['documents'] as ChatResponse['documents'],
      searchQueries: data['search_queries'] as ChatResponse['searchQueries'],
      searchResults: data['search_results'] as ChatResponse['searchResults'],
      meta: data['meta'] as ChatResponse['meta'],
    };
  }

  /**
   * Parse chat history from response
   */
  private parseChatHistory(data: unknown): ChatResponse['chatHistory'] {
    if (!Array.isArray(data)) return undefined;

    return data.map((m: Record<string, unknown>) => ({
      role: m['role'] as 'USER' | 'CHATBOT' | 'SYSTEM' | 'TOOL',
      content: String(m['message'] ?? m['content'] ?? ''),
      toolCallId: m['tool_call_id'] as string | undefined,
    }));
  }

  /**
   * Parse tool calls from response
   */
  private parseToolCalls(data: unknown): ChatResponse['toolCalls'] {
    if (!Array.isArray(data)) return undefined;

    return data.map((tc: Record<string, unknown>) => ({
      id: String(tc['id'] ?? ''),
      name: String(tc['name'] ?? ''),
      parameters: (tc['parameters'] ?? {}) as Record<string, unknown>,
    }));
  }

  /**
   * Parse a stream event
   */
  private parseStreamEvent(event: ServerSentEvent): ChatStreamEvent | null {
    if (!event.data) return null;

    try {
      const data = JSON.parse(event.data) as Record<string, unknown>;
      const eventType = (data['event_type'] ?? event.event) as ChatStreamEventType;

      const result: ChatStreamEvent = {
        eventType,
      };

      switch (eventType) {
        case 'stream-start':
          result.generationId = data['generation_id'] as string;
          break;
        case 'text-generation':
          result.text = data['text'] as string;
          break;
        case 'citation-generation':
          result.citations = data['citations'] as ChatStreamEvent['citations'];
          break;
        case 'tool-calls-generation':
        case 'tool-calls-chunk':
          result.toolCalls = this.parseToolCalls(data['tool_calls']);
          break;
        case 'search-queries-generation':
          result.searchQueries = data['search_queries'] as ChatStreamEvent['searchQueries'];
          break;
        case 'search-results':
          result.searchResults = data['search_results'] as ChatStreamEvent['searchResults'];
          break;
        case 'stream-end':
          result.finishReason = data['finish_reason'] as ChatStreamEvent['finishReason'];
          result.response = data['response'] ? this.parseResponse(data['response']) : undefined;
          break;
      }

      return result;
    } catch {
      return null;
    }
  }
}
