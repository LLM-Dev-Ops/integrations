import type { HttpTransport, RequestOptions } from '../../transport/http-transport.js';
import type { AuthManager } from '../../auth/auth-manager.js';
import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type {
  CreateMessageRequest,
  CountTokensRequest,
  Message,
  TokenCount,
} from './types.js';
import { validateCreateMessageRequest, validateCountTokensRequest } from './validation.js';
import { MessageStream } from './stream.js';
import {
  startTelemetryContext,
  emitRequestComplete,
  emitError,
  extractUsageMetadata,
} from '../../observability/telemetry.js';

export interface MessagesService {
  create(request: CreateMessageRequest, options?: RequestOptions): Promise<Message>;
  createStream(request: CreateMessageRequest, options?: RequestOptions): Promise<MessageStream>;
  countTokens(request: CountTokensRequest, options?: RequestOptions): Promise<TokenCount>;
}

export class MessagesServiceImpl implements MessagesService {
  constructor(
    private readonly transport: HttpTransport,
    private readonly authManager: AuthManager,
    private readonly resilience: ResilienceOrchestrator,
  ) {}

  async create(request: CreateMessageRequest, options?: RequestOptions): Promise<Message> {
    validateCreateMessageRequest(request);

    // Start telemetry context
    const telemetryContext = startTelemetryContext({
      operation: 'messages.create',
      model: request.model,
      provider: request.model,
      metadata: {
        maxTokens: request.max_tokens,
        temperature: request.temperature,
        hasTools: !!request.tools,
        messageCount: request.messages.length,
      },
    });

    try {
      const result = await this.resilience.execute(async () => {
        const headers = this.authManager.getHeaders();
        return this.transport.request<Message>(
          'POST',
          '/v1/messages',
          { ...request, stream: false },
          {
            ...options,
            headers: {
              ...headers,
              ...options?.headers,
            },
          }
        );
      });

      // Emit completion event with usage metadata
      emitRequestComplete(telemetryContext, {
        ...extractUsageMetadata(result.usage),
        stopReason: result.stop_reason,
        contentBlocks: result.content.length,
      });

      return result;
    } catch (error) {
      // Emit error event
      emitError(telemetryContext, error);
      throw error;
    }
  }

  async createStream(request: CreateMessageRequest, options?: RequestOptions): Promise<MessageStream> {
    validateCreateMessageRequest(request);

    // Start telemetry context
    const telemetryContext = startTelemetryContext({
      operation: 'messages.createStream',
      model: request.model,
      provider: request.model,
      metadata: {
        maxTokens: request.max_tokens,
        temperature: request.temperature,
        hasTools: !!request.tools,
        messageCount: request.messages.length,
        streaming: true,
      },
    });

    try {
      const headers = this.authManager.getHeaders();
      const stream = await this.transport.requestStream(
        'POST',
        '/v1/messages',
        { ...request, stream: true },
        {
          ...options,
          headers: {
            ...headers,
            ...options?.headers,
          },
        }
      );

      // Emit completion event for stream initiation
      // Note: This only tracks stream creation, not the full stream lifecycle
      emitRequestComplete(telemetryContext, {
        streamInitiated: true,
      });

      return new MessageStream(stream);
    } catch (error) {
      // Emit error event
      emitError(telemetryContext, error);
      throw error;
    }
  }

  async countTokens(request: CountTokensRequest, options?: RequestOptions): Promise<TokenCount> {
    validateCountTokensRequest(request);

    // Start telemetry context
    const telemetryContext = startTelemetryContext({
      operation: 'messages.countTokens',
      model: request.model,
      provider: request.model,
      metadata: {
        hasTools: !!request.tools,
        messageCount: request.messages?.length,
      },
    });

    try {
      const result = await this.resilience.execute(async () => {
        const headers = this.authManager.getHeaders();
        return this.transport.request<TokenCount>(
          'POST',
          '/v1/messages/count_tokens',
          request,
          {
            ...options,
            headers: {
              ...headers,
              ...options?.headers,
            },
          }
        );
      });

      // Emit completion event with token count
      emitRequestComplete(telemetryContext, {
        inputTokens: result.input_tokens,
      });

      return result;
    } catch (error) {
      // Emit error event
      emitError(telemetryContext, error);
      throw error;
    }
  }
}

export function createMessagesService(
  transport: HttpTransport,
  authManager: AuthManager,
  resilience: ResilienceOrchestrator
): MessagesService {
  return new MessagesServiceImpl(transport, authManager, resilience);
}
