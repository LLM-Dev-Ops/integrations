import { validateCreateMessageRequest, validateCountTokensRequest } from './validation.js';
import { MessageStream } from './stream.js';
export class MessagesServiceImpl {
    transport;
    authManager;
    resilience;
    constructor(transport, authManager, resilience) {
        this.transport = transport;
        this.authManager = authManager;
        this.resilience = resilience;
    }
    async create(request, options) {
        validateCreateMessageRequest(request);
        return this.resilience.execute(async () => {
            const headers = this.authManager.getHeaders();
            return this.transport.request('POST', '/v1/messages', { ...request, stream: false }, {
                ...options,
                headers: {
                    ...headers,
                    ...options?.headers,
                },
            });
        });
    }
    async createStream(request, options) {
        validateCreateMessageRequest(request);
        const headers = this.authManager.getHeaders();
        const stream = await this.transport.requestStream('POST', '/v1/messages', { ...request, stream: true }, {
            ...options,
            headers: {
                ...headers,
                ...options?.headers,
            },
        });
        return new MessageStream(stream);
    }
    async countTokens(request, options) {
        validateCountTokensRequest(request);
        return this.resilience.execute(async () => {
            const headers = this.authManager.getHeaders();
            return this.transport.request('POST', '/v1/messages/count_tokens', request, {
                ...options,
                headers: {
                    ...headers,
                    ...options?.headers,
                },
            });
        });
    }
}
export function createMessagesService(transport, authManager, resilience) {
    return new MessagesServiceImpl(transport, authManager, resilience);
}
//# sourceMappingURL=service.js.map