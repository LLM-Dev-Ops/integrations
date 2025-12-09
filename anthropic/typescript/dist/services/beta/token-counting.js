/**
 * Implementation of TokenCountingService
 */
export class TokenCountingServiceImpl {
    transport;
    authManager;
    resilience;
    constructor(transport, authManager, resilience) {
        this.transport = transport;
        this.authManager = authManager;
        this.resilience = resilience;
    }
    async countTokens(request, options) {
        // Validate request
        if (!request.model || typeof request.model !== 'string') {
            throw new Error('Model is required and must be a string');
        }
        if (!request.messages || !Array.isArray(request.messages) || request.messages.length === 0) {
            throw new Error('Messages array is required and must not be empty');
        }
        const headers = this.authManager.getHeaders();
        // Add beta header for token counting
        const requestHeaders = {
            ...headers,
            'anthropic-beta': 'token-counting-2024-11-01',
            ...options?.headers,
        };
        return this.resilience.execute(() => this.transport.request('POST', '/v1/messages/count_tokens', request, {
            ...options,
            headers: requestHeaders,
        }));
    }
}
/**
 * Factory function to create a token counting service
 * @param transport - HTTP transport instance
 * @param authManager - Auth manager instance
 * @param resilience - Resilience orchestrator instance
 * @returns TokenCountingService instance
 */
export function createTokenCountingService(transport, authManager, resilience) {
    return new TokenCountingServiceImpl(transport, authManager, resilience);
}
//# sourceMappingURL=token-counting.js.map