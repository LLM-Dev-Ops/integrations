/**
 * HTTP client for making requests to Gemini API.
 */
import type { ResolvedGeminiConfig } from '../config/index.js';
/**
 * HTTP client for making requests to Gemini API.
 */
export declare class HttpClient {
    private readonly config;
    constructor(config: ResolvedGeminiConfig);
    /**
     * Build the full URL for an endpoint.
     */
    buildUrl(endpoint: string, queryParams?: Record<string, string>): string;
    /**
     * Get headers for a request.
     */
    getHeaders(contentType?: string): Record<string, string>;
    /**
     * Make a fetch request with error handling.
     */
    fetch(url: string, init?: RequestInit): Promise<Response>;
    /**
     * Handle error responses from the API.
     */
    private handleErrorResponse;
    /**
     * Map HTTP status to error type.
     */
    private mapStatusToType;
    /**
     * Check if status is retryable.
     */
    private isRetryableStatus;
}
//# sourceMappingURL=http.d.ts.map