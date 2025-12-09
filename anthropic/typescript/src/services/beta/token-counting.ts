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
export class TokenCountingServiceImpl implements TokenCountingService {
  constructor(
    private transport: HttpTransport,
    private authManager: AuthManager,
    private resilience: ResilienceOrchestrator,
  ) {}

  async countTokens(request: TokenCountRequest, options?: RequestOptions): Promise<TokenCountResponse> {
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

    return this.resilience.execute(() =>
      this.transport.request<TokenCountResponse>(
        'POST',
        '/v1/messages/count_tokens',
        request,
        {
          ...options,
          headers: requestHeaders,
        }
      )
    );
  }
}

/**
 * Factory function to create a token counting service
 * @param transport - HTTP transport instance
 * @param authManager - Auth manager instance
 * @param resilience - Resilience orchestrator instance
 * @returns TokenCountingService instance
 */
export function createTokenCountingService(
  transport: HttpTransport,
  authManager: AuthManager,
  resilience: ResilienceOrchestrator,
): TokenCountingService {
  return new TokenCountingServiceImpl(transport, authManager, resilience);
}
