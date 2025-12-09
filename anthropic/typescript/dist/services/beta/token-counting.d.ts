import type { HttpTransport, RequestOptions } from '../../transport/http-transport.js';
import type { AuthManager } from '../../auth/auth-manager.js';
import type { ResilienceOrchestrator } from '../../resilience/orchestrator.js';
import type { TokenCountRequest, TokenCountResponse } from './types.js';
/**
 * Service for counting tokens in messages
 * Uses the token counting beta API endpoint
 */
export interface TokenCountingService {
    /**
     * Counts tokens in a message request
     * @param request - Token counting request
     * @param options - Request options
     * @returns Token count response
     */
    countTokens(request: TokenCountRequest, options?: RequestOptions): Promise<TokenCountResponse>;
}
/**
 * Implementation of TokenCountingService
 */
export declare class TokenCountingServiceImpl implements TokenCountingService {
    private transport;
    private authManager;
    private resilience;
    constructor(transport: HttpTransport, authManager: AuthManager, resilience: ResilienceOrchestrator);
    countTokens(request: TokenCountRequest, options?: RequestOptions): Promise<TokenCountResponse>;
}
/**
 * Factory function to create a token counting service
 * @param transport - HTTP transport instance
 * @param authManager - Auth manager instance
 * @param resilience - Resilience orchestrator instance
 * @returns TokenCountingService instance
 */
export declare function createTokenCountingService(transport: HttpTransport, authManager: AuthManager, resilience: ResilienceOrchestrator): TokenCountingService;
//# sourceMappingURL=token-counting.d.ts.map