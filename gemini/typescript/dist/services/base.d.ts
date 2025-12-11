/**
 * Base service class with common functionality for all Gemini services.
 */
import type { HttpClient } from '../client/index.js';
import type { ResolvedGeminiConfig } from '../config/index.js';
/**
 * Abstract base class for all service implementations.
 * Provides common functionality like HTTP client access.
 */
export declare abstract class BaseService {
    protected readonly httpClient: HttpClient;
    constructor(httpClient: HttpClient);
    /**
     * Build a URL for an API endpoint.
     * @param endpoint - The API endpoint
     * @param queryParams - Optional query parameters
     * @returns The complete URL
     */
    protected buildUrl(endpoint: string, queryParams?: Record<string, string>): string;
    /**
     * Get headers for a request.
     * @param contentType - Optional content type header
     * @returns Headers object
     */
    protected getHeaders(contentType?: string): Record<string, string>;
    /**
     * Make a fetch request with error handling.
     * @param url - The URL to fetch
     * @param init - Fetch initialization options
     * @returns The response
     */
    protected fetch(url: string, init?: RequestInit): Promise<Response>;
}
/**
 * Extended base service with config access (for services that need it).
 */
export declare abstract class BaseServiceWithConfig extends BaseService {
    protected readonly config: ResolvedGeminiConfig;
    constructor(httpClient: HttpClient, config: ResolvedGeminiConfig);
}
//# sourceMappingURL=base.d.ts.map