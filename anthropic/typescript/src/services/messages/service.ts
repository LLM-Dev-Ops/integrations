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

    return this.resilience.execute(async () => {
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
  }

  async createStream(request: CreateMessageRequest, options?: RequestOptions): Promise<MessageStream> {
    validateCreateMessageRequest(request);

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

    return new MessageStream(stream);
  }

  async countTokens(request: CountTokensRequest, options?: RequestOptions): Promise<TokenCount> {
    validateCountTokensRequest(request);

    return this.resilience.execute(async () => {
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
  }
}

export function createMessagesService(
  transport: HttpTransport,
  authManager: AuthManager,
  resilience: ResilienceOrchestrator
): MessagesService {
  return new MessagesServiceImpl(transport, authManager, resilience);
}
