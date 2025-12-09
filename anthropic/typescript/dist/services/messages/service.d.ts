import type { HttpTransport, RequestOptions } from '../../transport/http-transport.js';
import type { AuthManager } from '../../auth/auth-manager.js';
import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type { CreateMessageRequest, CountTokensRequest, Message, TokenCount } from './types.js';
import { MessageStream } from './stream.js';
export interface MessagesService {
    create(request: CreateMessageRequest, options?: RequestOptions): Promise<Message>;
    createStream(request: CreateMessageRequest, options?: RequestOptions): Promise<MessageStream>;
    countTokens(request: CountTokensRequest, options?: RequestOptions): Promise<TokenCount>;
}
export declare class MessagesServiceImpl implements MessagesService {
    private readonly transport;
    private readonly authManager;
    private readonly resilience;
    constructor(transport: HttpTransport, authManager: AuthManager, resilience: ResilienceOrchestrator);
    create(request: CreateMessageRequest, options?: RequestOptions): Promise<Message>;
    createStream(request: CreateMessageRequest, options?: RequestOptions): Promise<MessageStream>;
    countTokens(request: CountTokensRequest, options?: RequestOptions): Promise<TokenCount>;
}
export declare function createMessagesService(transport: HttpTransport, authManager: AuthManager, resilience: ResilienceOrchestrator): MessagesService;
//# sourceMappingURL=service.d.ts.map